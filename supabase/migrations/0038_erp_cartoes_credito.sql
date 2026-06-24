-- ===========================================================================
-- 0038: Modulo de Cartoes de Credito (ERP)
-- ===========================================================================
-- Tres niveis:
--   erp_cartoes            -> cadastro do cartao/conta-cartao (limites, vencimento)
--   erp_cartao_faturas     -> uma fatura por cartao por competencia (mes)
--   erp_cartao_lancamentos -> itens detalhados de cada fatura (analitico)
--
-- O modulo e ANALITICO: o desembolso de caixa do pagamento da fatura ja vive em
-- erp_movimentos_bancarios (debito na conta corrente). A fatura apenas REFERENCIA
-- esse movimento (movimento_id) para nao haver dupla contagem no fluxo/DRE.
--
-- Sem RLS - acesso via service_role no backend Next.js.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- cartoes (conta-cartao)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_cartoes (
  id uuid primary key default gen_random_uuid(),
  apelido text not null,                 -- "Sicoob Mastercard 3880"
  banco text default 'Sicoob',
  cooperativa text default '',           -- 4620
  conta_cartao text default '',          -- 7564620012254
  bandeira text default '',              -- Mastercard | Visa
  final text default '',                 -- 3880
  titular text default '',               -- BULA ASSESSORIA PECUARIA LTDA
  limite_credito numeric(16,2) not null default 0,
  limite_saque numeric(16,2) not null default 0,
  limite_disponivel numeric(16,2) not null default 0,
  vencimento_dia int default null,       -- 22
  fechamento_dia int default null,
  debito_automatico boolean not null default false,
  conta_pagamento_id uuid references public.erp_contas_bancarias(id) on delete set null,
  divida_consolidada numeric(16,2) not null default 0,
  parcelas_a_faturar numeric(16,2) not null default 0,
  data_referencia date default null,     -- data do snapshot de situacao
  cor text default '#7C3AED',
  ativo boolean not null default true,
  observacoes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(conta_cartao)
);

-- ---------------------------------------------------------------------------
-- faturas
-- ---------------------------------------------------------------------------
create table if not exists public.erp_cartao_faturas (
  id uuid primary key default gen_random_uuid(),
  cartao_id uuid not null references public.erp_cartoes(id) on delete cascade,
  competencia text not null,             -- '2026-01'
  mes_nome text default '',
  saldo_anterior numeric(16,2) not null default 0,
  debitos numeric(16,2) not null default 0,
  encargos numeric(16,2) not null default 0,
  pagamentos numeric(16,2) not null default 0,
  total_fatura numeric(16,2) not null default 0,   -- saldo total da fatura
  pagamento_minimo numeric(16,2) not null default 0,
  data_fechamento date default null,
  data_vencimento date default null,
  data_pagamento date default null,
  valor_pago numeric(16,2) not null default 0,
  status text not null default 'aberta',  -- aberta | paga | parcial | atrasada
  movimento_id uuid references public.erp_movimentos_bancarios(id) on delete set null, -- debito que pagou
  conta_pagar_id uuid references public.erp_contas_pagar(id) on delete set null,
  origem text not null default 'manual',
  documento text default '',
  observacoes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cartao_id, competencia)
);

create index if not exists idx_fat_cartao on public.erp_cartao_faturas(cartao_id);
create index if not exists idx_fat_competencia on public.erp_cartao_faturas(competencia);
create index if not exists idx_fat_status on public.erp_cartao_faturas(status);

-- ---------------------------------------------------------------------------
-- lancamentos da fatura (itens detalhados)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_cartao_lancamentos (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references public.erp_cartao_faturas(id) on delete cascade,
  cartao_id uuid not null references public.erp_cartoes(id) on delete cascade,
  data_compra text default '',           -- 'DD/MM' (ano ambiguo no extrato)
  descricao text not null,
  portador text default '',              -- FELIPE V ANDRADE
  portador_final text default '',        -- 3880 / 3883
  parcela text default '',               -- '06/12'
  valor numeric(16,2) not null default 0,-- com sinal: + debito, - credito
  tipo text not null default 'compra',   -- compra | pagamento | estorno | anuidade | seguro | encargo
  categoria_id uuid references public.erp_categorias(id) on delete set null,
  documento text default '',
  observacoes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clanc_fatura on public.erp_cartao_lancamentos(fatura_id);
create index if not exists idx_clanc_cartao on public.erp_cartao_lancamentos(cartao_id);
create index if not exists idx_clanc_tipo on public.erp_cartao_lancamentos(tipo);

-- ---------------------------------------------------------------------------
-- triggers updated_at
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array['erp_cartoes','erp_cartao_faturas','erp_cartao_lancamentos'])
  loop
    execute format('drop trigger if exists trg_%I_updated on public.%I;', t, t);
    execute format('create trigger trg_%I_updated before update on public.%I for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;

-- Categorias de analise de gasto sao garantidas (find-or-create) pelo importador,
-- para nao duplicar as categorias ja existentes (erp_categorias nao tem unique).
