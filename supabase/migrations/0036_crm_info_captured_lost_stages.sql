-- ============================================================
-- 0036_crm_info_captured_lost_stages.sql
-- Adiciona duas etapas ao pipeline do CRM:
--   • INFORMAÇÕES CAPTADAS (verde) — antes de CADASTRO: o lead respondeu e
--     enviou os dados para o cadastro.
--   • PERDIDOS (cinza) — etapa terminal (última coluna do Kanban).
--
-- Novo fluxo:
--   ENTRADA (is_qualification) → CONEXÃO → QUALIFICAÇÃO → INFORMAÇÕES CAPTADAS
--   → CADASTRO → PERDIDOS
--
-- Obs.: as etapas vivem em código (DEFAULT_STAGES em src/lib/crm-types.ts), que
-- getCRMConfig usa como fonte de verdade. Esta migração apenas (1) remapeia
-- status legados de "Perdido" para a nova etapa terminal e (2) atualiza o JSON
-- de crm_config por consistência.
-- ============================================================

-- 1) Status legados "Perdido"/"Perdidos" → etapa terminal PERDIDOS.
UPDATE public.crm_leads
SET status = 'PERDIDOS'
WHERE lower(btrim(status)) IN ('perdido', 'perdidos');

-- 2) Config do CRM: pipeline de 6 etapas com as duas novas.
UPDATE public.site_settings
SET value = jsonb_build_object(
        'stages', '[
            {"id":"entrada","name":"ENTRADA","color":"gray","probability":5,"is_qualification":true},
            {"id":"conexao","name":"CONEXÃO","color":"red","probability":10,"is_qualification":false},
            {"id":"qualificacao","name":"QUALIFICAÇÃO","color":"yellow","probability":25,"is_qualification":false},
            {"id":"informacoes-captadas","name":"INFORMAÇÕES CAPTADAS","color":"green","probability":40,"is_qualification":false},
            {"id":"cadastro","name":"CADASTRO","color":"cyan","probability":50},
            {"id":"perdidos","name":"PERDIDOS","color":"gray","probability":0,"is_qualification":false}
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
                {"id":"conexao","name":"CONEXÃO","color":"red","probability":10,"is_qualification":false},
                {"id":"qualificacao","name":"QUALIFICAÇÃO","color":"yellow","probability":25,"is_qualification":false},
                {"id":"informacoes-captadas","name":"INFORMAÇÕES CAPTADAS","color":"green","probability":40,"is_qualification":false},
                {"id":"cadastro","name":"CADASTRO","color":"cyan","probability":50},
                {"id":"perdidos","name":"PERDIDOS","color":"gray","probability":0,"is_qualification":false}
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
    description = 'CRM com etapas INFORMAÇÕES CAPTADAS (antes de CADASTRO) e PERDIDOS (terminal).',
    updated_at = NOW()
WHERE key = 'crm_config';
