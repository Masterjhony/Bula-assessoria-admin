-- ===========================================================================
-- 0046: Campos de documento nos títulos (CR/CP) + etapa do fluxo de operação
-- ===========================================================================
-- 1) Contas a receber/pagar ganham nota_fiscal, vendedor e projeto (mesmo
--    racional da 0045 nos movimentos): colunas texto, default '', para a
--    tela estilo Omie exibir/editar sem quebrar dados antigos.
-- 2) bula_leilao_fechamento ganha "etapa" para o kanban Fluxo Operação
--    (/erp#fluxo_operacao): realizado → aguardando_mapa → conferencia →
--    pronto_faturar → aguardando_recebimento → pagamentos → concluido.
--    Backfill infere a etapa dos títulos já vinculados (migration 0039).
-- ===========================================================================

alter table public.erp_contas_receber
  add column if not exists nota_fiscal text default '',
  add column if not exists vendedor    text default '',
  add column if not exists projeto     text default '';

alter table public.erp_contas_pagar
  add column if not exists nota_fiscal text default '',
  add column if not exists vendedor    text default '',
  add column if not exists projeto     text default '';

alter table public.bula_leilao_fechamento
  add column if not exists etapa text default 'realizado',
  add column if not exists etapa_atualizada_em timestamptz default now();

-- Backfill: infere a etapa do estado financeiro atual (só onde ainda está no
-- default 'realizado', para ser idempotente e não sobrescrever movimentação
-- manual em re-execuções).
with fin as (
  select f.id,
         count(cr.id)                                        as titulos,
         count(cr.id) filter (where cr.status = 'recebido')  as recebidos
  from public.bula_leilao_fechamento f
  left join public.erp_contas_receber cr on cr.fechamento_id = f.id
  group by f.id
)
update public.bula_leilao_fechamento f
set etapa = case
  when fin.titulos > 0 and fin.recebidos = fin.titulos then 'concluido'
  when fin.titulos > 0                                 then 'aguardando_recebimento'
  else 'conferencia'
end
from fin
where fin.id = f.id
  and f.etapa = 'realizado';

create index if not exists idx_fechamento_etapa on public.bula_leilao_fechamento(etapa);
