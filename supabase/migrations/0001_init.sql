-- ===========================================================================
-- web-bula initial schema
-- ===========================================================================
-- Acesso aos dados eh feito sempre via service_role no backend Next.js, entao
-- as tabelas ficam SEM RLS (Row Level Security) ativada. Auth eh usado apenas
-- para signin/signup; o cookie de sessao identifica o usuario, e o backend
-- aplica as regras de autorizacao antes de consultar.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: 1:1 com auth.users, guarda nome e iniciais para a UI
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  iniciais text not null,
  created_at timestamptz not null default now()
);

create or replace function public.iniciais_from_nome(nome text)
returns text language sql immutable as $$
  select upper(
    coalesce(
      (
        select string_agg(left(p, 1), '')
        from (
          select unnest(string_to_array(trim(nome), ' ')) as p
          limit 2
        ) s
      ),
      ''
    )
  )
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
begin
  v_nome := coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1));
  insert into public.profiles (id, nome, iniciais)
  values (new.id, v_nome, public.iniciais_from_nome(v_nome))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- leiloes
-- ---------------------------------------------------------------------------
create table if not exists public.leiloes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  data date not null,
  tipo text not null default '',
  local text default '',
  horario text default '',
  transmissao text default '',
  modelo text default '',
  leiloeira text default '',
  condicao text default '',
  frete_gratis text default '',
  acordo_comissao text default '',
  animais int not null default 0,
  expectativa numeric not null default 0,
  meta_bula numeric not null default 0,
  realizado_bula numeric not null default 0,
  status text not null default 'planejado',
  img text default '',
  assessores jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- projetos_cards (kanban de projetos)
-- ---------------------------------------------------------------------------
create table if not exists public.projetos_cards (
  id uuid primary key default gen_random_uuid(),
  coluna text not null default 'afazer',
  titulo text not null default 'Novo card',
  descricao text default '',
  prioridade text not null default 'media',
  vencimento date,
  checks jsonb not null default '[]'::jsonb,
  comentarios jsonb not null default '[]'::jsonb,
  responsaveis jsonb not null default '[]'::jsonb,
  posicao int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- crm_funis + crm_deals
-- ---------------------------------------------------------------------------
create table if not exists public.crm_funis (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  icone text not null default 'tune',
  etapas jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references public.crm_funis(id) on delete cascade,
  etapa_id text not null,
  nome text not null default 'Novo negocio',
  localizacao text default '',
  valor numeric not null default 0,
  telefone text default '',
  email text default '',
  temperatura text not null default 'morno',
  assessor jsonb,
  dias_no_estagio int not null default 0,
  notas text default '',
  timeline jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_deals_funil_id on public.crm_deals(funil_id);

-- ---------------------------------------------------------------------------
-- leads (marketing)
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text default '',
  regiao text default '',
  rebanho int not null default 0,
  origem text not null default 'Site',
  status text not null default 'novo',
  interesse text default '',
  orcamento numeric not null default 0,
  score int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- marketing_config (singleton)
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_config (
  id int primary key default 1,
  investimento numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint marketing_config_singleton check (id = 1)
);

insert into public.marketing_config (id, investimento)
values (1, 0)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at trigger generico
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_leiloes_updated on public.leiloes;
create trigger trg_leiloes_updated before update on public.leiloes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_cards_updated on public.projetos_cards;
create trigger trg_cards_updated before update on public.projetos_cards
  for each row execute function public.set_updated_at();

drop trigger if exists trg_deals_updated on public.crm_deals;
create trigger trg_deals_updated before update on public.crm_deals
  for each row execute function public.set_updated_at();

drop trigger if exists trg_leads_updated on public.leads;
create trigger trg_leads_updated before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed: funis padrao
-- ---------------------------------------------------------------------------
insert into public.crm_funis (slug, nome, icone, etapas) values
  ('captacao', 'Captacao', 'sentiment_satisfied',
    '[{"id":"lead","cor":"#7CB9A8","nome":"Lead"},
      {"id":"contato","cor":"#4A8FBF","nome":"Em contato"},
      {"id":"reuniao","cor":"#C8A96E","nome":"Reuniao agendada"},
      {"id":"proposta","cor":"#D4A04C","nome":"Proposta enviada"},
      {"id":"fechado","cor":"#6B8F5C","nome":"Fechado"},
      {"id":"perdido","cor":"#C0504D","nome":"Perdido"}]'::jsonb),
  ('clientes', 'Clientes', 'groups',
    '[{"id":"prospect","cor":"#7CB9A8","nome":"Prospect"},
      {"id":"qualificado","cor":"#4A8FBF","nome":"Qualificado"},
      {"id":"negociacao","cor":"#C8A96E","nome":"Em negociacao"},
      {"id":"ganho","cor":"#6B8F5C","nome":"Ganho"},
      {"id":"perdido","cor":"#C0504D","nome":"Perdido"}]'::jsonb)
on conflict (slug) do nothing;
