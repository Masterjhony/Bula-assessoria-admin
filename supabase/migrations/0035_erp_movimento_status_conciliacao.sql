-- 0035: status de conciliacao em 3 estados para erp_movimentos_bancarios
--
--   pendente     -> ainda nao revisado (sem categoria confiavel; aguarda decisao humana)
--   classificado -> categoria sugerida automaticamente pela descricao, SEM casar com titulo
--   conciliado   -> casado com um titulo (conta a pagar/receber) OU confirmado manualmente
--
-- A coluna booleana `conciliado` continua existindo e fica em sincronia:
--   conciliado = (status_conciliacao <> 'pendente')
-- para nao quebrar saldo/DRE/relatorios que ja dependem dela.

alter table public.erp_movimentos_bancarios
  add column if not exists status_conciliacao text;

-- Backfill a partir do estado atual. Movimentos importados do extrato Sicoob que
-- foram marcados conciliado=true apenas por classificacao de descricao (sem titulo)
-- voltam a ser "classificado"; os que casaram um titulo viram "conciliado".
update public.erp_movimentos_bancarios
   set status_conciliacao = case
     when conta_pagar_id is not null or conta_receber_id is not null then 'conciliado'
     when origem = 'importacao_sicoob_2026' and conciliado then 'classificado'
     when conciliado then 'conciliado'
     else 'pendente'
   end
 where status_conciliacao is null;

alter table public.erp_movimentos_bancarios
  alter column status_conciliacao set default 'pendente';

-- Garante o invariante conciliado = (status <> 'pendente') para os dados existentes.
update public.erp_movimentos_bancarios
   set conciliado = (status_conciliacao <> 'pendente')
 where conciliado <> (status_conciliacao <> 'pendente');

create index if not exists idx_mov_status_conciliacao
  on public.erp_movimentos_bancarios(status_conciliacao);
