-- ════════════════════════════════════════════════════════════════════════════
-- crm_toques: a trava "um toque por lead por dia" precisa ser um índice CHEIO.
--
-- A 0061 criou o índice único com predicado (`WHERE status <> 'cancelado'`).
-- Parece mais esperto — deixaria replanejar um lead cujo toque foi cancelado —
-- mas quebra o gravador do plano: ON CONFLICT não infere índice parcial sem
-- repetir o predicado, e o PostgREST não tem como expressar isso. Resultado
-- prático: `gravarPlano` falhava em TODOS os lotes e a fila do dia nascia vazia,
-- silenciosamente.
--
-- Índice cheio, e a semântica até melhora: se um humano tirou o toque da fila
-- hoje, o replanejamento não deve trazer o mesmo lead de volta no mesmo dia.
-- Amanhã ele volta a ser candidato normalmente.
-- ════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS public.uq_crm_toques_lead_dia;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_toques_lead_dia
    ON public.crm_toques (lead_id, planned_for);

COMMENT ON INDEX public.uq_crm_toques_lead_dia IS
    'Um toque por lead por dia. Índice CHEIO de propósito: ON CONFLICT (usado por gravarPlano) não infere índice parcial.';
