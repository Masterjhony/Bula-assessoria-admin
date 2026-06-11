-- ============================================================
-- 0027_crm_entrada_stage_split.sql
-- Separa a fila pré-CRM (ENTRADA / "Entrada Leads") da primeira
-- coluna do Kanban (CONEXÃO). Antes os dois compartilhavam o
-- status CONEXÃO, fazendo a Entrada Leads e a coluna CONEXÃO
-- aparecerem duplicadas.
--
-- Novo fluxo:
--   ENTRADA (is_qualification) → "Mover para o CRM" → CONEXÃO (Kanban col. 1)
--   → QUALIFICAÇÃO → CADASTRO → ASSESSORES
-- ============================================================

-- 1) Leads que hoje estão na fila de entrada (status CONEXÃO e legados de
--    captação) passam a viver no novo status ENTRADA. As demais etapas do
--    Kanban (QUALIFICAÇÃO/CADASTRO/ASSESSORES) ficam intactas.
UPDATE public.crm_leads
SET status = 'ENTRADA'
WHERE status IS NULL
   OR btrim(status) = ''
   OR lower(btrim(status)) IN ('lead', 'sem status', 'conexão', 'conexao', 'entrada');

-- 2) Config do CRM: ENTRADA como etapa de qualificação (fora do Kanban) e
--    CONEXÃO como primeira coluna do Kanban.
UPDATE public.site_settings
SET value = jsonb_build_object(
        'stages', '[
            {"id":"entrada","name":"ENTRADA","color":"gray","probability":5,"is_qualification":true},
            {"id":"conexao","name":"CONEXÃO","color":"blue","probability":10,"is_qualification":false},
            {"id":"qualificacao","name":"QUALIFICAÇÃO","color":"orange","probability":25,"is_qualification":false},
            {"id":"cadastro","name":"CADASTRO","color":"yellow","probability":50},
            {"id":"assessores","name":"ASSESSORES","color":"green","probability":75}
        ]'::jsonb,
        'custom_fields', COALESCE(
            value #> '{funnels,0,custom_fields}',
            value -> 'custom_fields',
            '[]'::jsonb
        ),
        'funnels', jsonb_build_array(jsonb_build_object(
            'id', 'default',
            'name', COALESCE(value #>> '{funnels,0,name}', 'Funil Unificado'),
            'color', COALESCE(value #>> '{funnels,0,color}', 'yellow'),
            'stages', '[
                {"id":"entrada","name":"ENTRADA","color":"gray","probability":5,"is_qualification":true},
                {"id":"conexao","name":"CONEXÃO","color":"blue","probability":10,"is_qualification":false},
                {"id":"qualificacao","name":"QUALIFICAÇÃO","color":"orange","probability":25,"is_qualification":false},
                {"id":"cadastro","name":"CADASTRO","color":"yellow","probability":50},
                {"id":"assessores","name":"ASSESSORES","color":"green","probability":75}
            ]'::jsonb,
            'custom_fields', COALESCE(
                value #> '{funnels,0,custom_fields}',
                value -> 'custom_fields',
                '[]'::jsonb
            ),
            'mql_rule', COALESCE(
                value #> '{funnels,0,mql_rule}',
                '{"min_cabecas":100,"require_ie":true}'::jsonb
            )
        )),
        'responsaveis', COALESCE(value -> 'responsaveis', '[]'::jsonb)
    ),
    description = 'CRM com ENTRADA (Entrada Leads) separada de CONEXÃO (primeira coluna do Kanban).',
    updated_at = NOW()
WHERE key = 'crm_config';
