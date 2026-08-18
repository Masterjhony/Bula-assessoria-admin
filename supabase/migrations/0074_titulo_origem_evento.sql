-- Previsão x real: um compromisso, um título.
--
-- O ERP gera previsões (folha do mês seguinte, comissão calculada do
-- fechamento, débito agendado, provisão de imposto, orçamento de despesa de
-- leilão) e depois recebe o título REAL, que nasce do extrato quando o dinheiro
-- de fato se move. Sem vínculo entre os dois, os dois ficam vivos e o "a pagar"
-- / "a receber" conta o mesmo compromisso duas vezes.
--
-- `evento_key` é a identidade do FATO econômico (ver src/lib/erp-evento.ts).
-- Quando um título real ganha uma chave, o trigger abaixo substitui as
-- previsões abertas que têm a mesma chave: elas saem dos totais (status
-- 'cancelado', que todo agregador do sistema já exclui) mas guardam
-- `substituido_por`, então a UI mostra "substituída pelo título real" em vez de
-- um cancelamento sem explicação, e dá para desfazer.
--
-- Políticas (`erp_politica_substituicao`):
--   total     — o real é a apuração definitiva e mata a previsão inteira, seja
--               qual for o valor. É o caso do tributo: a guia fecha a
--               competência, logo a diferença provisionada deixa de existir.
--   agregada  — vários reais somam contra uma previsão; ela só cai quando o
--               realizado cobre o previsto (despesa de leilão).
--   unitaria  — um real liquida uma previsão (folha, fatura, comissão).

alter table public.erp_contas_pagar
  add column if not exists origem text not null default 'real',
  add column if not exists evento_key text,
  add column if not exists substituido_por uuid references public.erp_contas_pagar(id) on delete set null,
  add column if not exists substituido_em timestamptz;

alter table public.erp_contas_receber
  add column if not exists origem text not null default 'real',
  add column if not exists evento_key text,
  add column if not exists substituido_por uuid references public.erp_contas_receber(id) on delete set null,
  add column if not exists substituido_em timestamptz;

do $$ begin
  alter table public.erp_contas_pagar add constraint erp_cp_origem_chk check (origem in ('real','estimativa'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.erp_contas_receber add constraint erp_cr_origem_chk check (origem in ('real','estimativa'));
exception when duplicate_object then null; end $$;

create index if not exists idx_cp_evento on public.erp_contas_pagar(evento_key) where evento_key is not null;
create index if not exists idx_cr_evento on public.erp_contas_receber(evento_key) where evento_key is not null;
create index if not exists idx_cp_origem on public.erp_contas_pagar(origem);
create index if not exists idx_cr_origem on public.erp_contas_receber(origem);

create or replace function public.erp_politica_substituicao(p_key text)
returns text language sql immutable as $$
  select case
    when p_key like 'imposto:%' then 'total'
    when p_key like 'despesa-leilao:%' then 'agregada'
    else 'unitaria'
  end
$$;

-- Substitui as previsões abertas cuja chave é a do título real que acabou de
-- ser gravado. Roda em CP e CR: `tg_argv[0]` diz qual tabela tratar, evitando
-- duas cópias da mesma regra.
create or replace function public.erp_substitui_estimativa()
returns trigger language plpgsql as $$
declare
  v_pol text;
  v_prev numeric;
  v_real numeric;
begin
  -- só um título REAL substitui; previsão nunca substitui previsão
  if new.origem is distinct from 'real' or new.evento_key is null then
    return new;
  end if;
  if new.status = 'cancelado' then
    return new;
  end if;

  v_pol := public.erp_politica_substituicao(new.evento_key);

  if tg_argv[0] = 'CP' then
    if v_pol = 'agregada' then
      select coalesce(sum(valor),0) into v_prev from public.erp_contas_pagar
        where evento_key = new.evento_key and origem = 'estimativa'
          and status not in ('cancelado') and substituido_por is null;
      select coalesce(sum(valor),0) into v_real from public.erp_contas_pagar
        where evento_key = new.evento_key and origem = 'real' and status <> 'cancelado';
      if v_real < v_prev then
        return new; -- realizado ainda não cobre o previsto: previsão continua
      end if;
    end if;
    update public.erp_contas_pagar t set
      status = 'cancelado',
      substituido_por = new.id,
      substituido_em = now(),
      observacoes = trim(both e'\n' from coalesce(t.observacoes,'') || e'\n'
        || '[substituição automática] Previsão encerrada pelo título real "'
        || new.descricao || '" (' || to_char(new.valor,'FM999G999G990D00') || ').'
        || case when v_pol = 'total'
             then ' A apuração real fecha a competência: a diferença prevista deixa de existir.'
             else '' end)
    where t.evento_key = new.evento_key
      and t.origem = 'estimativa'
      and t.id <> new.id
      and t.status not in ('cancelado','pago')
      and t.substituido_por is null;

  elsif tg_argv[0] = 'CR' then
    if v_pol = 'agregada' then
      select coalesce(sum(valor),0) into v_prev from public.erp_contas_receber
        where evento_key = new.evento_key and origem = 'estimativa'
          and status not in ('cancelado') and substituido_por is null;
      select coalesce(sum(valor),0) into v_real from public.erp_contas_receber
        where evento_key = new.evento_key and origem = 'real' and status <> 'cancelado';
      if v_real < v_prev then
        return new;
      end if;
    end if;
    update public.erp_contas_receber t set
      status = 'cancelado',
      substituido_por = new.id,
      substituido_em = now(),
      observacoes = trim(both e'\n' from coalesce(t.observacoes,'') || e'\n'
        || '[substituição automática] Previsão encerrada pelo título real "'
        || new.descricao || '" (' || to_char(new.valor,'FM999G999G990D00') || ').')
    where t.evento_key = new.evento_key
      and t.origem = 'estimativa'
      and t.id <> new.id
      and t.status not in ('cancelado','recebido')
      and t.substituido_por is null;
  end if;

  return new;
end $$;

drop trigger if exists trg_cp_substitui_estimativa on public.erp_contas_pagar;
create trigger trg_cp_substitui_estimativa
  after insert or update of evento_key, origem, status on public.erp_contas_pagar
  for each row execute function public.erp_substitui_estimativa('CP');

drop trigger if exists trg_cr_substitui_estimativa on public.erp_contas_receber;
create trigger trg_cr_substitui_estimativa
  after insert or update of evento_key, origem, status on public.erp_contas_receber
  for each row execute function public.erp_substitui_estimativa('CR');

comment on column public.erp_contas_pagar.evento_key is
  'Identidade do fato econômico (src/lib/erp-evento.ts). Previsão e real com a mesma chave são o mesmo compromisso.';
comment on column public.erp_contas_pagar.origem is
  'real = compromisso confirmado; estimativa = previsão, substituível pelo real.';
