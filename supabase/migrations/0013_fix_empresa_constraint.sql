-- Permite 'Bula Remates' como empresa nos assessores
-- Atualiza dados ANTES de aplicar nova constraint (ordem importa).
ALTER TABLE public.bula_comissoes_padrao_assessor
    DROP CONSTRAINT IF EXISTS bula_comissoes_padrao_assessor_empresa_check;
UPDATE public.bula_comissoes_padrao_assessor SET empresa = 'Bula Remates' WHERE empresa = 'Fórmula do Boi';
ALTER TABLE public.bula_comissoes_padrao_assessor
    ADD CONSTRAINT bula_comissoes_padrao_assessor_empresa_check
    CHECK (empresa IN ('Bula Assessoria', 'Bula Remates', 'Outro'));
