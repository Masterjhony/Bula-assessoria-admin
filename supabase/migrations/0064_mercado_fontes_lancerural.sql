-- RADAR DE MERCADO — fontes novas + correção do que estava errado.
--
-- Motivo: as 4 fontes seedadas em 0058/0059 cobriam uma fração do mercado. O
-- Leiloboi, tratado como índice, lista ~10 leilões/mês — menos do que a própria
-- Bula realiza (~12/mês). A agenda da Programa sozinha traz 133 leilões em 30
-- dias, 71 deles Nelore PO. Faltava fonte, não faltava parser.
--
-- Cada fonte abaixo foi TESTADA por fetch direto em 06/08/2026 antes de entrar.
-- O `modo` reflete a medição, não a suposição.

-- ── 1) Novo modo 'api' ──────────────────────────────────────────────────────
-- Endpoint JSON público. É melhor que 'http' (não tem parser de HTML para
-- quebrar) e infinitamente melhor que 'apify' (custo zero).
ALTER TABLE public.mercado_fontes DROP CONSTRAINT IF EXISTS mercado_fontes_modo_check;
ALTER TABLE public.mercado_fontes
    ADD CONSTRAINT mercado_fontes_modo_check CHECK (modo IN ('http', 'apify', 'api'));

-- ── 2) Lance Rural — a melhor fonte do radar ───────────────────────────────
-- WordPress com endpoint sob medida em /wp-json/leiloes/v1/lista: devolve a
-- agenda inteira em uma requisição, já estruturada (promotor, praça, raça,
-- contato, catálogo). Medido: 36 leilões na janela 07–31/08, 25 deles Nelore,
-- 5 leiloeiras — incluindo Conecta, Alta Genetics e Genex, que não apareciam
-- em nenhuma outra fonte.
--
-- Atenção à raça: vem GROSSA ("Nelore", nunca "Nelore PO") e a página de
-- detalhe também não distingue. Quem separa PO é `ehNelorePo` na exibição; o
-- refinamento real vem do casamento por fingerprint com a Programa, que
-- publica a categoria completa. Por isso o promotor é gravado por EVENTO
-- (21 dos 36 são da Programa Leilões) — senão o mesmo pregão viraria 2 linhas.
INSERT INTO public.mercado_fontes (leiloeira, slug, site_url, agenda_url, modo, parser, ativo, observacoes) VALUES
    ('Lance Rural', 'lance-rural', 'https://www.lancerural.com.br',
     'https://www.lancerural.com.br/wp-json/leiloes/v1/lista', 'api', 'lancerural', true,
     'API pública do Canal Rural. 1 requisição = agenda inteira, custo zero. Aceita o User-Agent identificado do projeto (não precisa fingir browser). Campos: titulo, abertura, fechamento, leiloeira (promotor real), local "Cidade (UF)", raca, forma_de_pagamento, frete, catalogo, whatsapp, fone.')
ON CONFLICT (slug) DO UPDATE
    SET agenda_url = EXCLUDED.agenda_url,
        modo       = EXCLUDED.modo,
        parser     = EXCLUDED.parser,
        ativo      = true;

-- ── 3) Central Leilões — estava marcada 'apify' à toa ──────────────────────
-- Medido: 114kb de HTML server-rendered, 59 ocorrências de "leilão", 67 de mês.
-- Nunca precisou de browser. Fica 'http' e INATIVA até o parser existir — antes
-- ela caía no crawler genérico, que não preenche eventos e queima crédito.
UPDATE public.mercado_fontes
   SET modo = 'http',
       ativo = false,
       agenda_url = 'https://www.centralleiloes.com.br/agenda-de-leiloes.php',
       observacoes = 'MEDIDO 06/08/2026: server-rendered (114kb, 59x "leilão"). NÃO precisa de Apify. Inativa só até o parser de HTML ser escrito.'
 WHERE slug = 'central-leiloes';

-- ── 4) Agreste — SPA de verdade, mas sem parser não pode rodar ─────────────
-- Medido: 2kb de casca com <app-root>. É o único caso que justifica renderizar.
-- Mesmo assim fica inativa: o crawler genérico não extrai evento nenhum, então
-- ligada ela só gera custo. Reativar quando houver parser do conteúdo.
UPDATE public.mercado_fontes
   SET ativo = false,
       observacoes = 'MEDIDO 06/08/2026: SPA (2kb, <app-root>) — precisa de renderização. Inativa: o crawler genérico não extrai evento, só consome crédito.'
 WHERE slug = 'agreste-leiloes';

-- ── 5) Fontes mapeadas, parser pendente ────────────────────────────────────
-- Entram cadastradas e INATIVAS para não sumirem do mapa. A medição de cada uma
-- está na observação — é o que decide se um dia precisam de Apify (nenhuma
-- precisa, exceto a eRural).
--
-- `parser` é NOT NULL DEFAULT 'generico' (0059), então usamos 'pendente': se
-- alguém ativar por engano, o coletor falha com "parser='pendente' não tem
-- coletor", que diz exatamente o que está faltando. 'generico' mentiria.
INSERT INTO public.mercado_fontes (leiloeira, slug, site_url, agenda_url, modo, parser, ativo, observacoes) VALUES
    ('SBA1', 'sba1', 'https://sba1.com', 'https://sba1.com/leiloes', 'http', 'pendente', false,
     'MEDIDO 06/08/2026: server-rendered (166kb, 35 datas, 35x "leilão"), custo zero. Sem API JSON (testado /wp-json e /api/leiloes). Falta parser.'),
    ('MF Leilões', 'mf-leiloes', 'https://www.mfleiloes.com.br', 'https://www.mfleiloes.com.br', 'http', 'pendente', false,
     'MEDIDO 06/08/2026: server-rendered (142kb, 37 referências de mês), custo zero. Sem API JSON. Falta parser.'),
    ('eRural', 'e-rural-portal', 'https://www.erural.net', 'https://www.erural.net/agenda-eventos', 'apify', 'pendente', false,
     'MEDIDO 06/08/2026: /agenda-eventos responde 200 com 102kb mas só 25 linhas de texto — conteúdo montado no cliente. Sem API pública (nenhum endpoint JSON citado no bundle). ÚNICA fonte que realmente justifica Apify/Playwright. Nota: /leiloes dá 404, o caminho certo é /agenda-eventos.')
ON CONFLICT (slug) DO NOTHING;
