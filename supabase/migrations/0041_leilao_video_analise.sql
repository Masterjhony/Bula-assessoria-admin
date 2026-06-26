-- ============================================================
-- 0029_leilao_video_analise.sql
-- Vínculo entre um leilão da agenda (bula_leiloes) e a análise de
-- vídeo produzida pelo videoextrator (Fórmula do Boi, na VPS).
-- O videoextrator é indexado por video_id do YouTube e a agenda não
-- tem URL — então guardamos aqui o pareamento (auto por nome+data ou
-- manual por URL colada) + um snapshot das métricas-cabeçalho para
-- listar rápido sem bater na VPS a cada render.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bula_leilao_video_analise (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    leilao_id       UUID UNIQUE REFERENCES public.bula_leiloes(id) ON DELETE CASCADE,
    video_id        TEXT,
    video_url       TEXT,
    match_tipo      TEXT DEFAULT 'auto',     -- 'auto' | 'manual'
    match_score     NUMERIC,
    status          TEXT DEFAULT 'pendente', -- pendente | processando | concluido | erro | sem_video
    total_lotes     INTEGER,
    total_vendidos  INTEGER,
    volume_total    NUMERIC(14,2),
    sincronizado_em TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leilao_video_analise_video_id
    ON public.bula_leilao_video_analise (video_id);

ALTER TABLE public.bula_leilao_video_analise ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bula_leilao_video_analise_all" ON public.bula_leilao_video_analise;
CREATE POLICY "bula_leilao_video_analise_all" ON public.bula_leilao_video_analise
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_leilao_video_analise_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leilao_video_analise_updated_at ON public.bula_leilao_video_analise;
CREATE TRIGGER trg_leilao_video_analise_updated_at
    BEFORE UPDATE ON public.bula_leilao_video_analise
    FOR EACH ROW EXECUTE FUNCTION public.touch_leilao_video_analise_updated_at();
