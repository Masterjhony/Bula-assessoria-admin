-- ===========================================================================
-- 0045: Campos de documento nos movimentos bancarios (estilo extrato Omie)
-- ===========================================================================
-- Adiciona os campos que o extrato de conciliacao completo exibe/edita e que
-- ainda nao existiam no schema: tipo de documento, nota fiscal, parcela,
-- nosso numero, vendedor e projeto. Todos texto livre (default '') para
-- degradar sem quebrar importacoes/lancamentos antigos.
-- A UI (/erp#conciliacao) le via SELECT * e grava via PATCH; enquanto esta
-- migration nao roda, a tela mostra "—" e o salvamento faz fallback sem os
-- campos novos.
-- ===========================================================================

alter table public.erp_movimentos_bancarios
  add column if not exists tipo_documento text default '',
  add column if not exists nota_fiscal    text default '',
  add column if not exists parcela        text default '',
  add column if not exists nosso_numero   text default '',
  add column if not exists vendedor       text default '',
  add column if not exists projeto        text default '';
