begin;

-- ============================================================
-- CATÁLOGOS WHATSAPP — identificação pelo CONTEÚDO do PDF e
-- documentos por leilão (o que a agenda pública mostra).
--
-- Dois problemas que esta migration resolve:
--
-- 1) O match era feito só pelo NOME DO ARQUIVO. "OE - Engenho de
--    Serra.pdf" não casava com nada, "Catálogo - 12º LNNMP COLONIAL
--    260821.pdf" ficava em 57%. Agora o pipeline abre o PDF, lê a
--    capa (texto + IA quando a capa é imagem) e guarda a evidência
--    aqui: tipo do documento, nome do evento impresso, data, hora,
--    leiloeira, criadores. A data impressa na capa é o critério
--    decisivo do casamento.
--
-- 2) `catalogo_url` era UMA coluna por leilão. Leilão com dois
--    catálogos (Sabiá Dourado: Nelore + Tropa) tinha o segundo
--    recusado com "leilão já tinha catálogo". E a agenda pública lê
--    `bula_leiloes`, enquanto o anexo escrevia em
--    `cronograma_leiloes` — nenhum catálogo capturado jamais
--    apareceu no site. Agora existe `leilao_documentos` (N por
--    leilão) e as duas colunas `catalogo_url` viram espelho do
--    documento principal.
-- ============================================================

-- 1) Evidência extraída do arquivo + deduplicação por conteúdo
-- ------------------------------------------------------------
alter table public.whatsapp_catalog_detections
    add column if not exists content_hash   text,
    add column if not exists doc_tipo       text,
    add column if not exists doc_evento     text,
    add column if not exists doc_data       date,
    add column if not exists doc_datas      date[],
    add column if not exists doc_hora       text,
    add column if not exists doc_leiloeira  text,
    add column if not exists doc_criadores  text[],
    add column if not exists doc_local      text,
    add column if not exists doc_lotes      integer,
    add column if not exists doc_paginas    integer,
    add column if not exists doc_fonte      text,
    add column if not exists doc_confianca  numeric(4,3),
    add column if not exists doc_trecho     text,
    add column if not exists analyzed_at    timestamptz,
    add column if not exists match_reasons  jsonb,
    add column if not exists duplicate_of   uuid
        references public.whatsapp_catalog_detections(id) on delete set null;

comment on column public.whatsapp_catalog_detections.content_hash is
    'sha256 do arquivo — dedup de reenvio do MESMO PDF por pessoas diferentes (message_id muda, conteúdo não).';
comment on column public.whatsapp_catalog_detections.doc_tipo is
    'catalogo | ordem_entrada | relatorio | agenda | outro — lido do conteúdo, não do nome.';
comment on column public.whatsapp_catalog_detections.doc_data is
    'Melhor palpite da data do evento impressa no documento. É o critério decisivo do match.';
comment on column public.whatsapp_catalog_detections.doc_datas is
    'TODAS as datas plausíveis lidas da capa. O match aceita qualquer uma — capa que traz data de visitação junto com a do leilão não pode derrubar o casamento.';
comment on column public.whatsapp_catalog_detections.doc_fonte is
    'texto | texto+ia | ia | nome — como a evidência foi obtida.';
comment on column public.whatsapp_catalog_detections.match_reasons is
    'Por que o candidato ganhou: ["data 29/08 confere", "criador Engenho de Serra", ...]. Aparece na UI.';

create index if not exists idx_wa_catalog_detections_hash
    on public.whatsapp_catalog_detections (content_hash);
create index if not exists idx_wa_catalog_detections_doc_data
    on public.whatsapp_catalog_detections (doc_data);


-- 2) Documentos de um leilão (N por leilão)
-- ------------------------------------------------------------
create table if not exists public.leilao_documentos (
    id            uuid primary key default gen_random_uuid(),
    cronograma_id uuid not null references public.cronograma_leiloes(id) on delete cascade,

    tipo          text    not null default 'catalogo',   -- catalogo | ordem_entrada | outro
    titulo        text    not null,                      -- "Catálogo Nelore", "Ordem de entrada"
    url           text    not null,
    file_name     text,
    file_size     integer,
    content_hash  text,

    origem        text,                                  -- whatsapp | manual
    detection_id  uuid references public.whatsapp_catalog_detections(id) on delete set null,

    -- `publico` decide o que a agenda em bulaassessoria.com mostra.
    -- Catálogo é público; ordem de entrada é operacional (nasce privada e o
    -- operador libera com um clique se quiser).
    publico       boolean not null default true,
    principal     boolean not null default false,        -- espelha catalogo_url
    ordem         integer not null default 0,

    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.leilao_documentos is
    'Documentos (catálogo, ordem de entrada) de um leilão. Um leilão pode ter vários — Nelore + Tropa, touros + fêmeas, 1º e 2º dia.';

-- Mesmo arquivo não entra duas vezes no mesmo leilão.
create unique index if not exists uq_leilao_documentos_hash
    on public.leilao_documentos (cronograma_id, content_hash)
    where content_hash is not null;
create unique index if not exists uq_leilao_documentos_url
    on public.leilao_documentos (cronograma_id, url);
-- Só um principal por leilão.
create unique index if not exists uq_leilao_documentos_principal
    on public.leilao_documentos (cronograma_id)
    where principal;
create index if not exists idx_leilao_documentos_crono
    on public.leilao_documentos (cronograma_id);
create index if not exists idx_leilao_documentos_detection
    on public.leilao_documentos (detection_id);

create or replace function public.update_leilao_documentos_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_leilao_documentos_updated_at on public.leilao_documentos;
create trigger trg_leilao_documentos_updated_at
    before update on public.leilao_documentos
    for each row execute function public.update_leilao_documentos_updated_at();

alter table public.leilao_documentos enable row level security;

-- Leitura pública apenas do que está marcado como público: a agenda do site é
-- server-side com service role, mas manter a policy explícita evita que uma
-- futura leitura anônima exponha documento interno.
drop policy if exists "leilao_documentos_public_read" on public.leilao_documentos;
create policy "leilao_documentos_public_read"
    on public.leilao_documentos for select
    using (publico);

drop policy if exists "leilao_documentos_admin_all" on public.leilao_documentos;
create policy "leilao_documentos_admin_all"
    on public.leilao_documentos for all to authenticated
    using (true) with check (true);


-- 3) Backfill: o que já estava anexado vira documento principal
-- ------------------------------------------------------------
insert into public.leilao_documentos
    (cronograma_id, tipo, titulo, url, origem, publico, principal, ordem)
select c.id,
       'catalogo',
       'Catálogo',
       c.catalogo_url,
       coalesce(nullif(c.catalogo_origem, ''), 'manual'),
       true,
       true,
       0
  from public.cronograma_leiloes c
 where c.catalogo_url is not null
   and c.catalogo_url <> ''
on conflict do nothing;

-- 4) O site lê `bula_leiloes` — propaga o que já existia no cronograma
-- ------------------------------------------------------------
update public.bula_leiloes b
   set catalogo_url = c.catalogo_url
  from public.cronograma_leiloes c
 where b.cronograma_id = c.id
   and c.catalogo_url is not null
   and c.catalogo_url <> ''
   and coalesce(b.catalogo_url, '') = '';

commit;
