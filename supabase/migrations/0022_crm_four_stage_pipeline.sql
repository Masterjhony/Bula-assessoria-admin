-- ============================================================
-- 0022_crm_four_stage_pipeline.sql
-- Pipeline atual do CRM:
-- CONEXÃO -> QUALIFICAÇÃO -> CADASTRO -> ASSESSORES
-- ============================================================

ALTER TABLE public.crm_leads
    ALTER COLUMN status SET DEFAULT 'CONEXÃO';

UPDATE public.crm_leads
SET status = CASE
    WHEN status IN ('CONEXÃO', 'CONEXAO') THEN 'CONEXÃO'
    WHEN status IN ('QUALIFICAÇÃO', 'QUALIFICACAO') THEN 'QUALIFICAÇÃO'
    WHEN status IN ('CADASTRO') THEN 'CADASTRO'
    WHEN status IN ('ASSESSORES') THEN 'ASSESSORES'
    WHEN status IN ('Lead', 'Sem Status') OR status IS NULL OR btrim(status) = '' THEN 'CONEXÃO'
    WHEN status IN ('Qualificado') THEN 'CADASTRO'
    WHEN status IN ('Direcionamento Leilão', 'Direcionamento Leilao', 'Proposta', 'Negociação', 'Negociacao', 'Fechado') THEN 'ASSESSORES'
    WHEN status IN ('Perdido') THEN 'QUALIFICAÇÃO'
    ELSE 'CONEXÃO'
END
WHERE status IS DISTINCT FROM CASE
    WHEN status IN ('CONEXÃO', 'CONEXAO') THEN 'CONEXÃO'
    WHEN status IN ('QUALIFICAÇÃO', 'QUALIFICACAO') THEN 'QUALIFICAÇÃO'
    WHEN status IN ('CADASTRO') THEN 'CADASTRO'
    WHEN status IN ('ASSESSORES') THEN 'ASSESSORES'
    WHEN status IN ('Lead', 'Sem Status') OR status IS NULL OR btrim(status) = '' THEN 'CONEXÃO'
    WHEN status IN ('Qualificado') THEN 'CADASTRO'
    WHEN status IN ('Direcionamento Leilão', 'Direcionamento Leilao', 'Proposta', 'Negociação', 'Negociacao', 'Fechado') THEN 'ASSESSORES'
    WHEN status IN ('Perdido') THEN 'QUALIFICAÇÃO'
    ELSE 'CONEXÃO'
END;

INSERT INTO public.site_settings (key, value, description)
VALUES (
    'crm_config',
    jsonb_build_object(
        'stages', '[
            {"id":"conexao","name":"CONEXÃO","color":"blue","probability":10},
            {"id":"qualificacao","name":"QUALIFICAÇÃO","color":"orange","probability":25},
            {"id":"cadastro","name":"CADASTRO","color":"yellow","probability":50},
            {"id":"assessores","name":"ASSESSORES","color":"green","probability":75}
        ]'::jsonb,
        'custom_fields', '[]'::jsonb,
        'funnels', jsonb_build_array(jsonb_build_object(
            'id', 'default',
            'name', 'Funil Unificado',
            'color', 'yellow',
            'stages', '[
                {"id":"conexao","name":"CONEXÃO","color":"blue","probability":10},
                {"id":"qualificacao","name":"QUALIFICAÇÃO","color":"orange","probability":25},
                {"id":"cadastro","name":"CADASTRO","color":"yellow","probability":50},
                {"id":"assessores","name":"ASSESSORES","color":"green","probability":75}
            ]'::jsonb,
            'custom_fields', '[]'::jsonb,
            'mql_rule', '{"min_cabecas":100,"require_ie":true}'::jsonb
        )),
        'responsaveis', '[]'::jsonb
    ),
    'Configuração do CRM com as quatro etapas operacionais atuais.'
)
ON CONFLICT (key) DO UPDATE
SET value = jsonb_build_object(
        'stages', '[
            {"id":"conexao","name":"CONEXÃO","color":"blue","probability":10},
            {"id":"qualificacao","name":"QUALIFICAÇÃO","color":"orange","probability":25},
            {"id":"cadastro","name":"CADASTRO","color":"yellow","probability":50},
            {"id":"assessores","name":"ASSESSORES","color":"green","probability":75}
        ]'::jsonb,
        'custom_fields', COALESCE(
            public.site_settings.value #> '{funnels,0,custom_fields}',
            public.site_settings.value -> 'custom_fields',
            '[]'::jsonb
        ),
        'funnels', jsonb_build_array(jsonb_build_object(
            'id', 'default',
            'name', 'Funil Unificado',
            'color', COALESCE(public.site_settings.value #>> '{funnels,0,color}', 'yellow'),
            'stages', '[
                {"id":"conexao","name":"CONEXÃO","color":"blue","probability":10},
                {"id":"qualificacao","name":"QUALIFICAÇÃO","color":"orange","probability":25},
                {"id":"cadastro","name":"CADASTRO","color":"yellow","probability":50},
                {"id":"assessores","name":"ASSESSORES","color":"green","probability":75}
            ]'::jsonb,
            'custom_fields', COALESCE(
                public.site_settings.value #> '{funnels,0,custom_fields}',
                public.site_settings.value -> 'custom_fields',
                '[]'::jsonb
            ),
            'mql_rule', COALESCE(
                public.site_settings.value #> '{funnels,0,mql_rule}',
                '{"min_cabecas":100,"require_ie":true}'::jsonb
            )
        )),
        'responsaveis', COALESCE(public.site_settings.value -> 'responsaveis', '[]'::jsonb)
    ),
    description = 'Configuração do CRM com as quatro etapas operacionais atuais.',
    updated_at = NOW();
