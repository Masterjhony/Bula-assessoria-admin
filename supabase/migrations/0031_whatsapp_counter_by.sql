-- ============================================================
-- 0031_whatsapp_counter_by.sql — incremento em lote do contador diário
--
-- Complementa 0030: o gateway 1:1 usa increment_whatsapp_counter (de 1 em 1);
-- o disparo de campanha precisa somar N de uma vez (quantos saíram no passo 0).
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_whatsapp_counter_by(
    p_channel TEXT,
    p_day DATE,
    p_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        SELECT sent_count INTO v_count
        FROM public.whatsapp_send_counters
        WHERE channel = p_channel AND day = p_day;
        RETURN COALESCE(v_count, 0);
    END IF;

    INSERT INTO public.whatsapp_send_counters (channel, day, sent_count)
    VALUES (p_channel, p_day, p_amount)
    ON CONFLICT (channel, day)
    DO UPDATE SET sent_count = public.whatsapp_send_counters.sent_count + p_amount,
                  updated_at = timezone('utc'::text, now())
    RETURNING sent_count INTO v_count;
    RETURN v_count;
END;
$$;
