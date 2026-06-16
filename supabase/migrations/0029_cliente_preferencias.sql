-- ============================================================
-- 0029_cliente_preferencias.sql — Preferências de compra do cliente
-- Categorias estruturadas (Bezerros, Novilhas, Vacas, Touros,
-- Embriões, Sêmen) selecionadas no card de detalhe do cliente.
-- ============================================================

ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS preferencias_categorias JSONB NOT NULL DEFAULT '[]'::jsonb;
