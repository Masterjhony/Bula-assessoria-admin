-- ════════════════════════════════════════════════════════════════════════════
-- MOTOR DE ATENDIMENTO — registro de toques (crm_toques)
--
-- O motor decide TODO DIA quem chamar, por quê e com qual molde. Cada decisão
-- vira uma linha aqui ANTES de virar mensagem: primeiro 'planejado', depois o
-- executor tenta enviar e carimba o resultado. Isso dá três coisas que a régua
-- de campanha antiga não tinha:
--
--   1. AUDITORIA — dá pra abrir o dia e ver "por que este lead foi chamado".
--      O motivo é texto legível, gerado pela ontologia (atendimento-ontologia.ts).
--   2. COOLDOWN — o planejador do dia seguinte lê o histórico daqui pra não
--      martelar o mesmo lead: intervalo mínimo por play e teto de toques.
--   3. APRENDIZADO — `respondeu_at` fecha o ciclo. Taxa de resposta por play é
--      o que diz se a régua está evoluindo a lista ou só queimando número.
--
-- Uma linha = uma tentativa de toque. O lead pode ter várias ao longo do tempo,
-- mas no máximo UMA por dia (índice único parcial abaixo) — a trava mais barata
-- contra o cenário "dois crons concorrentes mandam duas vezes".
--
-- Escopo: SOMENTE atendimento 1:1 pela API oficial (Cloud). O Baileys/grupos não
-- tem nada a ver com esta tabela e nunca deve escrever nela.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.crm_toques (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id         UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
    telefone        TEXT NOT NULL,                    -- normalizado (só dígitos c/ DDI)

    -- Ontologia da decisão
    play            TEXT NOT NULL,                    -- 'resgate_sem_resposta' | 'doc_pendente' | ...
    motivo          TEXT,                             -- frase legível: por que ESTE lead, HOJE
    prioridade      INTEGER NOT NULL DEFAULT 0,       -- 0-100, ordena a fila do dia
    fase            TEXT,                             -- fase do funil no momento da decisão
    segmento        TEXT,                             -- persona (iniciante/produtor/criador...)

    -- Como chamar
    canal           TEXT,                             -- 'cloud' (sempre, hoje)
    template        TEXT,                             -- nome do template Meta; null = texto livre (janela aberta)
    template_params JSONB NOT NULL DEFAULT '[]'::jsonb,
    corpo           TEXT,                             -- corpo renderizado (log/cockpit)

    -- Ciclo de vida
    planned_for     DATE NOT NULL,                    -- dia do plano (fuso America/Campo_Grande)
    -- planejado → enviando (lock otimista do executor) → enviado|held|blocked|falhou.
    -- 'cancelado' é saída manual (o humano tirou da fila antes de sair).
    status          TEXT NOT NULL DEFAULT 'planejado',
    reason          TEXT,                             -- motivo do held/blocked vindo do gateway
    message_id      TEXT,
    sent_at         TIMESTAMPTZ,
    respondeu_at    TIMESTAMPTZ,                      -- primeiro inbound do lead depois do toque
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.crm_toques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_toques_full_access" ON public.crm_toques;
CREATE POLICY "crm_toques_full_access"
    ON public.crm_toques FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- Fila do dia (executor) e painel.
CREATE INDEX IF NOT EXISTS idx_crm_toques_dia
    ON public.crm_toques (planned_for, status, prioridade DESC);

-- Histórico por lead — é o que o planejador lê pra aplicar cooldown/teto.
CREATE INDEX IF NOT EXISTS idx_crm_toques_lead
    ON public.crm_toques (lead_id, created_at DESC);

-- Métrica por play.
CREATE INDEX IF NOT EXISTS idx_crm_toques_play
    ON public.crm_toques (play, planned_for);

-- Casar inbound → toque em aberto (marca respondeu_at) sem varrer a tabela.
CREATE INDEX IF NOT EXISTS idx_crm_toques_resposta
    ON public.crm_toques (telefone, sent_at DESC)
    WHERE respondeu_at IS NULL AND sent_at IS NOT NULL;

-- No máximo UM toque por lead por dia. Cancelados não contam (dá pra replanejar
-- o dia sem esbarrar no que foi descartado).
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_toques_lead_dia
    ON public.crm_toques (lead_id, planned_for)
    WHERE status <> 'cancelado';

COMMENT ON TABLE public.crm_toques IS
    'Motor de atendimento: um toque 1:1 planejado/enviado pela API oficial. Fonte do cooldown, da auditoria ("por que chamei este lead") e da taxa de resposta por play.';
COMMENT ON COLUMN public.crm_toques.motivo IS
    'Frase legível gerada pela ontologia — aparece no painel e no card do lead.';
COMMENT ON COLUMN public.crm_toques.respondeu_at IS
    'Primeiro inbound do lead após o envio. Vazio = toque não gerou conversa.';


-- ────────────────────────────────────────────────────────────────────────────
-- fone_canonico() — a chave de casamento entre lead e conversa.
--
-- O mesmo produtor aparece no banco como 5544999123456, 44999123456 e
-- 4499123456 (números antigos, sem o nono dígito). Comparar string crua faz o
-- motor achar que um lead ativo nunca falou com a gente — e mandar "primeiro
-- contato" pra quem está no meio do cadastro. Canoniza tudo pra DDD + 8 últimos
-- dígitos, que é o que sobrevive a todas as variações.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fone_canonico(p TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    d TEXT;
BEGIN
    d := regexp_replace(COALESCE(p, ''), '\D', '', 'g');
    IF d = '' THEN RETURN NULL; END IF;
    -- Tira o DDI quando ele existe de verdade (55 + 10/11 dígitos locais).
    IF left(d, 2) = '55' AND length(d) >= 12 THEN
        d := substr(d, 3);
    END IF;
    -- DDD + últimos 8: colapsa com e sem o nono dígito.
    IF length(d) >= 10 THEN
        RETURN left(d, 2) || right(d, 8);
    END IF;
    RETURN d;
END;
$$;

-- Índices funcionais: sem eles a agregação abaixo faz seq scan nas duas tabelas.
CREATE INDEX IF NOT EXISTS idx_wa_messages_fone_canonico
    ON public.whatsapp_messages (public.fone_canonico(phone));
CREATE INDEX IF NOT EXISTS idx_crm_leads_fone_canonico
    ON public.crm_leads (public.fone_canonico(COALESCE(celular, telefone)));


-- ────────────────────────────────────────────────────────────────────────────
-- crm_atendimento_estado() — estado da conversa por lead, em UMA query.
--
-- O planejador precisa saber, pra cada um dos 16 mil leads: quando ele falou
-- pela última vez, quando NÓS falamos, e quantas vezes cada lado falou. Fazer
-- isso lead a lead seriam 16 mil idas ao banco; aqui o Postgres resolve de uma
-- vez e devolve só quem TEM conversa (o resto o motor trata como zero).
--
-- Grupos (@g.us) ficam de fora por construção: grupo é assunto do Baileys e não
-- tem nada a ver com o atendimento 1:1 da API oficial.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_atendimento_estado()
RETURNS TABLE (
    lead_id          UUID,
    ultimo_inbound   TIMESTAMPTZ,
    ultimo_outbound  TIMESTAMPTZ,
    total_inbound    INTEGER,
    total_outbound   INTEGER
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        l.id,
        MAX(m.created_at) FILTER (WHERE m.direction = 'inbound'),
        MAX(m.created_at) FILTER (WHERE m.direction = 'outbound'),
        COUNT(*) FILTER (WHERE m.direction = 'inbound')::INTEGER,
        COUNT(*) FILTER (WHERE m.direction = 'outbound')::INTEGER
    FROM public.crm_leads l
    JOIN public.whatsapp_messages m
      ON public.fone_canonico(m.phone) = public.fone_canonico(COALESCE(l.celular, l.telefone))
    WHERE m.phone NOT LIKE '%@g.us'
    GROUP BY l.id;
$$;

COMMENT ON FUNCTION public.crm_atendimento_estado() IS
    'Agregado de conversa 1:1 por lead (último inbound/outbound e totais), casando telefone por fone_canonico. Consumido pelo planejador do motor de atendimento.';


-- ────────────────────────────────────────────────────────────────────────────
-- Configuração do motor em site_settings (chave única, editável pela UI).
-- Nasce LIGADO mas em rampa curta: cap baixo no primeiro dia e subindo, porque
-- disparar 250 templates de largada num número que ficou 5 dias parado é o
-- caminho mais rápido pra derrubar o quality rating.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.site_settings (key, value)
VALUES ('crm_atendimento_motor', jsonb_build_object(
    'enabled',      true,
    'dry_run',      false,
    'cap_inicial',  80,      -- teto do primeiro dia
    'cap_maximo',   250,     -- teto final (plano aprovado de disparos)
    'cap_passo',    40,      -- quanto o teto sobe por dia sem incidente
    'quality_min',  'YELLOW',-- abaixo disso o motor se auto-pausa
    'cotas', jsonb_build_object(
        'resgate',       999,  -- responder quem falou com a gente não tem cota
        'habilitacao',    60,
        'retomada',       60,
        'primeiro_contato', 80,
        'reengajamento',  40,
        'agenda',         30
    )
))
ON CONFLICT (key) DO NOTHING;
