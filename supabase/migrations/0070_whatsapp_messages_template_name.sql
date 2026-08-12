-- Qual template a Meta recebeu, gravado no envio.
--
-- A coluna `template_id` existe desde o começo e nunca foi preenchida: em
-- 11/08/2026 estavam 0 de 3.998 mensagens. O efeito prático é que a pergunta
-- "quais templates a gente usou e qual converteu melhor?" não tinha resposta no
-- banco — a apuração daquele dia precisou reconstruir a atribuição casando o
-- CORPO de cada mensagem com o texto dos 52 templates aprovados na Meta, o que
-- funciona mas não é jeito de operar.
--
-- Por que uma coluna de TEXTO e não só o FK: o que a Meta recebe é o NOME do
-- template (`bula_convite_evento_imagem`). Nem todo template aprovado lá tem
-- linha em `whatsapp_templates` — os de teste e os criados direto no WhatsApp
-- Manager não têm — então o FK sozinho perderia justamente os casos que mais
-- confundem. Guardamos o nome sempre; o FK continua sendo preenchido quando
-- existe a linha local.
--
-- A categoria (MARKETING/UTILITY) fica de fora de propósito: ela muda no lado
-- da Meta e a fonte de verdade do custo é o `pricing_analytics` da WABA, lido
-- ao vivo por src/lib/whatsapp-billing.ts.

ALTER TABLE public.whatsapp_messages
    ADD COLUMN IF NOT EXISTS template_name TEXT;

-- Recorte mais comum da métrica: "os disparos por template num período".
CREATE INDEX IF NOT EXISTS whatsapp_messages_template_name_idx
    ON public.whatsapp_messages (template_name, created_at DESC)
    WHERE template_name IS NOT NULL;

-- Backfill do que dá para saber com certeza, sem adivinhação: o único disparo
-- que registrou o template foi o da Genética Aditiva (22/07), que gravou
-- `bot_step = 'template:<nome>'`. O resto fica NULL — a reconstrução por corpo
-- vive no relatório da apuração, não no banco.
UPDATE public.whatsapp_messages
   SET template_name = substring(bot_step from 10)
 WHERE template_name IS NULL
   AND bot_step LIKE 'template:%';
