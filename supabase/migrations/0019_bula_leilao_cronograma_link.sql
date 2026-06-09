-- Vinculo explicito entre bula_leiloes (registro interno) e cronograma_leiloes
-- (a planilha). Ate aqui o pareamento dos dois era feito em tempo de execucao
-- por similaridade de nome + data (mergeLeiloes), o que e fragil: rename grande
-- ou dois leiloes parecidos na mesma data podem trocar/duplicar o par.
--
-- Esta coluna e ADITIVA e opcional: nada e apagado e o pareamento por
-- adivinhacao continua funcionando como fallback para linhas ainda sem vinculo.
-- ON DELETE SET NULL: apagar a linha da planilha apenas desfaz o vinculo, sem
-- afetar o registro interno.

ALTER TABLE public.bula_leiloes
  ADD COLUMN IF NOT EXISTS cronograma_id UUID
  REFERENCES public.cronograma_leiloes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bula_leiloes_cronograma_id
  ON public.bula_leiloes(cronograma_id);

COMMENT ON COLUMN public.bula_leiloes.cronograma_id IS
  'Vinculo explicito com cronograma_leiloes (a planilha). Quando presente, o pareamento usa este id em vez da similaridade nome+data.';
