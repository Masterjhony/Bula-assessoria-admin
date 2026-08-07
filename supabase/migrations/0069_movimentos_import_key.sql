-- Importador de extrato bancário: chave de deduplicação por conta.
--
-- Até aqui cada semana de extrato entrava por um script escrito à mão
-- (scripts/import-extrato-sicoob-jul-*.mjs) e a proteção contra importar o
-- mesmo período duas vezes era a atenção de quem rodava. Com a importação pela
-- tela isso vira responsabilidade do banco: `import_key` guarda o identificador
-- do lançamento (FITID do OFX, ou um hash estável de data+valor+histórico+
-- ordem-no-dia quando a origem é CSV/texto, que não tem id próprio).
--
-- O índice é PARCIAL: movimentos manuais e os já importados pelos scripts têm
-- import_key NULL e não disputam a unicidade entre si.

ALTER TABLE public.erp_movimentos_bancarios
    ADD COLUMN IF NOT EXISTS import_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS erp_mov_import_key_uniq
    ON public.erp_movimentos_bancarios (conta_bancaria_id, import_key)
    WHERE import_key IS NOT NULL;
