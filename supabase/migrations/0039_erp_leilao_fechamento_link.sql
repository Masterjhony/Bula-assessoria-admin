-- ===========================================================================
-- 0039: Vinculo financeiro <-> fechamento de leilao
-- ===========================================================================
-- Amarra contas a receber (receita Bula / comissao do leilao) e contas a pagar
-- (imposto, despesas, comissao de assessores) ao fechamento do leilao
-- (bula_leilao_fechamento), permitindo ver o status de recebimento/pagamento
-- por leilao e conciliar com o extrato bancario (via conta_receber_id /
-- conta_pagar_id ja existentes em erp_movimentos_bancarios).
-- ===========================================================================

alter table public.erp_contas_receber
  add column if not exists fechamento_id uuid references public.bula_leilao_fechamento(id) on delete set null;

alter table public.erp_contas_pagar
  add column if not exists fechamento_id uuid references public.bula_leilao_fechamento(id) on delete set null;

create index if not exists idx_cr_fechamento on public.erp_contas_receber(fechamento_id);
create index if not exists idx_cp_fechamento on public.erp_contas_pagar(fechamento_id);

-- View consolidada: status de recebimento por fechamento de leilao.
-- Agrega as contas a receber vinculadas (receita Bula) e mostra quanto foi
-- recebido, datas e se ha lancamento bancario conciliado.
create or replace view public.bula_leilao_recebimento as
  select
    f.id as fechamento_id,
    f.nome,
    f.data,
    count(cr.id) as titulos,
    coalesce(sum(cr.valor), 0) as receita_titulos,
    coalesce(sum(cr.valor_recebido), 0) as recebido,
    coalesce(sum(case when cr.status = 'recebido' then cr.valor else 0 end), 0) as valor_recebido_status,
    bool_or(cr.status = 'recebido') as algum_recebido,
    bool_and(cr.status = 'recebido') as todos_recebidos,
    max(cr.data_recebimento) as ultima_data_recebimento,
    bool_or(m.id is not null) as tem_extrato_vinculado,
    string_agg(distinct nullif(cr.numero_documento, ''), ', ') as documentos
  from public.bula_leilao_fechamento f
  left join public.erp_contas_receber cr on cr.fechamento_id = f.id
  left join public.erp_movimentos_bancarios m on m.conta_receber_id = cr.id
  group by f.id, f.nome, f.data;
