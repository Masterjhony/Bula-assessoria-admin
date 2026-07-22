-- ============================================================
-- 0057_erp_equipe_campos.sql — erp_folha_estrutura vira cadastro de EQUIPE
--
-- O chefe pediu uma página "Equipe" para gerenciar o vínculo pessoa↔empresa,
-- grafias/apelidos usados nos fechamentos, quem recebe o pagamento (fornecedor
-- do ERP + nome que aparece no extrato, ex.: Leonardo recebe como "LM
-- Assessoria") e zona de atuação. Em vez de criar tabela nova (drift com a
-- Folha), estende o cadastro canônico existente (0056).
--
-- Também aplica a tabela FIXA de percentuais de 22/07/2026:
--   todos 2% · Rusa 5% · Lucas/Matheus Alves 0,33% (Fábio ERA 3% até junho).
-- ============================================================

ALTER TABLE public.erp_folha_estrutura
  ADD COLUMN IF NOT EXISTS apelidos       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS empresa        TEXT  NOT NULL DEFAULT 'Bula Assessoria',
  ADD COLUMN IF NOT EXISTS fornecedor_id  UUID REFERENCES public.erp_pessoas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pagamento_nome TEXT,
  ADD COLUMN IF NOT EXISTS zona           TEXT;

-- Percentual do Fábio: 3% até junho/2026, 2% FIXO dali em diante (chefe 22/07).
UPDATE public.erp_folha_estrutura SET comissao_pct = 2.0,
  observacao = COALESCE(observacao || ' ', '') || '[22/07/2026] Comissão fixada em 2% (era 3% até junho).'
  WHERE nome = 'FABIO OMENNA' AND comissao_pct = 3.0;

-- Seeds/vínculos dos já cadastrados
UPDATE public.erp_folha_estrutura SET
  apelidos = '["Fábio Omena","Fabio Omena","Fabio O Mena"]'::jsonb,
  pagamento_nome = 'FO Assessoria Pecuária (CNPJ 59.791.094/0001-07)',
  zona = 'Nordeste (exceto MA) + Sudeste',
  fornecedor_id = (SELECT id FROM public.erp_pessoas WHERE nome ILIKE 'FABIO' LIMIT 1)
  WHERE nome = 'FABIO OMENNA';

UPDATE public.erp_folha_estrutura SET
  apelidos = '["Douglas Bispo"]'::jsonb,
  zona = 'Norte + Maranhão',
  fornecedor_id = (SELECT id FROM public.erp_pessoas WHERE nome ILIKE 'DOUGLAS' LIMIT 1)
  WHERE nome = 'DOUGLAS BISPO';

UPDATE public.erp_folha_estrutura SET
  apelidos = '["Leonardo Serafim","Léo","Léo Serafim","LM Assessoria","Marcelo Carneiro / Leonardo Serafim"]'::jsonb,
  pagamento_nome = 'LM Assessoria',
  zona = 'Centro-Oeste + Sul',
  fornecedor_id = (SELECT id FROM public.erp_pessoas WHERE nome ILIKE 'LEONARDO' LIMIT 1)
  WHERE nome = 'LEONARDO';

UPDATE public.erp_folha_estrutura SET
  apelidos = '["Gustavo Rusa"]'::jsonb,
  fornecedor_id = (SELECT id FROM public.erp_pessoas WHERE nome ILIKE 'GUSTAVO RUSA' LIMIT 1),
  observacao = COALESCE(observacao || ' ', '') || 'Compradores dele: Nelore Grão Pará/Dr Celso Lopes, Pedro Pontes, C+4, Itajaí, Alfredo José Cardoso.'
  WHERE nome = 'GUSTAVO RUSA' AND (apelidos = '[]'::jsonb OR apelidos IS NULL);

UPDATE public.erp_folha_estrutura SET
  apelidos = '["João Antônio","Joao Antonio"]'::jsonb,
  fornecedor_id = (SELECT id FROM public.erp_pessoas WHERE nome ILIKE 'JO_O ANTONIO' LIMIT 1)
  WHERE nome = 'JOÃO ANTONIO';

-- Membros que faltavam (percentuais da tabela fixa 22/07)
INSERT INTO public.erp_folha_estrutura (nome, funcao, salario_fixo, comissao_pct, comissao_fixa, ordem, empresa, apelidos, observacao) VALUES
  ('BULINHA (FELIPE ANDRADE)', 'Assessor (dono da FdB)', 0, 2.0,  NULL, 8,  'Bula Assessoria', '["Bulinha (Felipe Andrade)","Felipe Vilela Andrade (Bulinha)","Felipe Andrade","Bulinha"]'::jsonb, '2% fixo mesmo quando o PDF da leiloeira mostra 0% (dono da FdB).'),
  ('LUCAS MARTINS',            'Assessor',               0, 0.33, NULL, 9,  'Bula Assessoria', '["Lucas Martins"]'::jsonb, NULL),
  ('MATHEUS ALVES',            'Assessor (CPD)',         0, 0.33, NULL, 10, 'Bula Assessoria', '["Matheus Alves","Mateus Alves"]'::jsonb, 'Grafia canônica "Matheus" (tabela do chefe 22/07).'),
  ('MARCELO CARNEIRO',         'Assessor',               0, 2.0,  NULL, 11, 'Fórmula do Boi',  '["Marcelo Carneiro","Pedro Barnabé","Matheus Amormino"]'::jsonb, 'Centraliza Pedro Barnabé e Matheus Amormino. Dupla c/ Leonardo extinta em 22/07 — comissões da dupla são 100% do Leonardo.'),
  ('FABRICIO HYPPOLITO',       'Assessor',               0, 2.0,  NULL, 12, 'Bula Assessoria', '["Fabricio Hyppolito"]'::jsonb, NULL),
  ('PERALTA',                  'Parceiro',               0, 2.0,  NULL, 13, 'Outro',           '["Peralta"]'::jsonb, 'Parceiro externo (2% confirmado pelo chefe).'),
  ('NANE',                     'Assessora',              0, 2.0,  NULL, 14, 'Bula Assessoria', '["Nane"]'::jsonb, NULL),
  ('LAILA',                    'Assessora',              0, 2.0,  NULL, 15, 'Bula Assessoria', '["Laila"]'::jsonb, NULL)
ON CONFLICT (nome) DO NOTHING;

UPDATE public.erp_folha_estrutura SET
  fornecedor_id = (SELECT id FROM public.erp_pessoas WHERE nome ILIKE 'Bulinha%' LIMIT 1)
  WHERE nome = 'BULINHA (FELIPE ANDRADE)' AND fornecedor_id IS NULL;
UPDATE public.erp_folha_estrutura SET
  fornecedor_id = (SELECT id FROM public.erp_pessoas WHERE nome ILIKE 'Lucas Martins' LIMIT 1)
  WHERE nome = 'LUCAS MARTINS' AND fornecedor_id IS NULL;
UPDATE public.erp_folha_estrutura SET
  fornecedor_id = (SELECT id FROM public.erp_pessoas WHERE nome ILIKE 'Peralta' LIMIT 1)
  WHERE nome = 'PERALTA' AND fornecedor_id IS NULL;
UPDATE public.erp_folha_estrutura SET
  fornecedor_id = (SELECT id FROM public.erp_pessoas WHERE nome ILIKE 'Marcelo Carneiro%' LIMIT 1)
  WHERE nome = 'MARCELO CARNEIRO' AND fornecedor_id IS NULL;

-- Chefe 22/07: p/ fins do Bônus e Comissionamento, TODOS da tabela fixa de
-- percentuais + João Antônio contam como Bula Assessoria.
UPDATE public.erp_folha_estrutura SET empresa = 'Bula Assessoria'
  WHERE nome IN ('FABIO OMENNA','DOUGLAS BISPO','LEONARDO','BULINHA (FELIPE ANDRADE)',
                 'GUSTAVO RUSA','LUCAS MARTINS','MATHEUS ALVES','JOÃO ANTONIO');
