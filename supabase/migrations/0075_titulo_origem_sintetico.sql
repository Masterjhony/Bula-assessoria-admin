-- Terceira origem: 'sintetico'.
--
-- Quando o financeiro paga um LOTE (um PIX só cobrindo 13 comissões de leilão),
-- o extrato produz UM título — o pagamento — enquanto os títulos analíticos de
-- cada leilão/assessor já existem. Os dois são verdadeiros e nenhum deve ser
-- apagado: o do extrato é o CAIXA (tem o movimento bancário conciliado), os
-- analíticos são a COMPETÊNCIA (têm leilão, assessor e percentual).
--
-- O erro é somá-los. Marcamos o título do extrato como 'sintetico': ele
-- continua vivo, pago e conciliado para o regime de caixa, mas sai do regime de
-- competência, onde os analíticos respondem pela despesa. Sem isso a mesma
-- comissão entra duas vezes na DRE.

alter table public.erp_contas_pagar drop constraint if exists erp_cp_origem_chk;
alter table public.erp_contas_pagar add constraint erp_cp_origem_chk
  check (origem in ('real','estimativa','sintetico'));

alter table public.erp_contas_receber drop constraint if exists erp_cr_origem_chk;
alter table public.erp_contas_receber add constraint erp_cr_origem_chk
  check (origem in ('real','estimativa','sintetico'));

comment on column public.erp_contas_pagar.origem is
  'real = compromisso confirmado; estimativa = previsão (substituível pelo real); sintetico = pagamento em lote vindo do extrato, conta no caixa mas não na competência (os analíticos respondem por ela).';
