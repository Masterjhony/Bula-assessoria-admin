-- ============================================================
-- 0026_crm_enforce_mql_rule.sql
-- MQL em Entrada Leads: exige 100+ cabecas e Inscricao Estadual.
-- ============================================================

UPDATE public.site_settings
SET value = jsonb_set(
    value,
    '{funnels}',
    (
        SELECT jsonb_agg(
            jsonb_set(
                jsonb_set(funnel, '{mql_rule,min_cabecas}', '100'::jsonb, true),
                '{mql_rule,require_ie}',
                'true'::jsonb,
                true
            )
        )
        FROM jsonb_array_elements(COALESCE(value -> 'funnels', '[]'::jsonb)) AS funnel
    ),
    true
),
updated_at = NOW()
WHERE key = 'crm_config'
  AND jsonb_typeof(value -> 'funnels') = 'array';

UPDATE public.crm_leads
SET is_mql = (
    COALESCE((substring(COALESCE(quantidade_animais, '') FROM '[0-9]+'))::int, -1) >= 100
    AND (
        lower(btrim(COALESCE(tem_inscricao_estadual, ''))) = 'sim'
        OR btrim(COALESCE(inscricao_estadual, '')) <> ''
    )
);
