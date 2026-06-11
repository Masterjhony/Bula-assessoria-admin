-- ============================================================
-- 0024_crm_entrada_leads_queue.sql
-- Renomeia conceitualmente a fila pre-CRM para ENTRADA LEADS
-- e devolve QUALIFICACAO para o Kanban principal.
-- ============================================================

UPDATE public.site_settings
SET value = jsonb_build_object(
        'stages', '[
            {"id":"conexao","name":"CONEXÃO","color":"blue","probability":10,"is_qualification":true},
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
            'name', 'Funil Unificado',
            'color', COALESCE(value #>> '{funnels,0,color}', 'yellow'),
            'stages', '[
                {"id":"conexao","name":"CONEXÃO","color":"blue","probability":10,"is_qualification":true},
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
    description = 'Configuração do CRM com ENTRADA LEADS em CONEXÃO e QUALIFICAÇÃO no Kanban.',
    updated_at = NOW()
WHERE key = 'crm_config';
