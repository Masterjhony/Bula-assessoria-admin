-- ===========================================================================
-- ERP Financeiro / Contabil - Schema completo
-- ===========================================================================
-- Modulos: Contas a Pagar, Contas a Receber, Contas Bancarias,
-- Conciliacao Bancaria, Plano de Contas, Centros de Custo,
-- Lancamentos Contabeis (partidas dobradas), Categorias, Anexos,
-- Notas Fiscais, Recorrencias.
--
-- Sem RLS - acesso via service_role no backend Next.js.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- empresas (multi-empresa)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text default '',
  cnpj text default '',
  ie text default '',
  endereco text default '',
  cidade text default '',
  uf text default '',
  cep text default '',
  telefone text default '',
  email text default '',
  regime_tributario text default 'simples', -- simples | presumido | real | mei
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- plano de contas (estrutura hierarquica DRE/Balanco)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_plano_contas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  tipo text not null, -- ativo | passivo | patrimonio | receita | despesa | resultado
  natureza text not null default 'analitica', -- sintetica | analitica
  parent_id uuid references public.erp_plano_contas(id) on delete set null,
  dre_grupo text default '', -- receita_bruta | deducao | custo | despesa_op | desp_fin | rec_fin | outros
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(codigo)
);

create index if not exists idx_pc_parent on public.erp_plano_contas(parent_id);
create index if not exists idx_pc_tipo on public.erp_plano_contas(tipo);

-- ---------------------------------------------------------------------------
-- centros de custo
-- ---------------------------------------------------------------------------
create table if not exists public.erp_centros_custo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  descricao text default '',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categorias financeiras (operacional para fluxo de caixa)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null, -- receita | despesa
  cor text default '#C8A96E',
  plano_conta_id uuid references public.erp_plano_contas(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cat_tipo on public.erp_categorias(tipo);

-- ---------------------------------------------------------------------------
-- contas bancarias
-- ---------------------------------------------------------------------------
create table if not exists public.erp_contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  banco text default '',
  agencia text default '',
  conta text default '',
  tipo text not null default 'corrente', -- corrente | poupanca | caixa | investimento | aplicacao
  saldo_inicial numeric(16,2) not null default 0,
  saldo_atual numeric(16,2) not null default 0,
  moeda text not null default 'BRL',
  cor text default '#4A8FBF',
  ativo boolean not null default true,
  observacoes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- pessoas (clientes e fornecedores - tabela unica com flags)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_pessoas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'pj', -- pj | pf
  nome text not null,
  razao_social text default '',
  documento text default '', -- CPF ou CNPJ
  ie text default '',
  email text default '',
  telefone text default '',
  endereco text default '',
  cidade text default '',
  uf text default '',
  cep text default '',
  is_cliente boolean not null default false,
  is_fornecedor boolean not null default false,
  banco_nome text default '',
  banco_agencia text default '',
  banco_conta text default '',
  banco_pix text default '',
  observacoes text default '',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pessoas_cliente on public.erp_pessoas(is_cliente);
create index if not exists idx_pessoas_fornecedor on public.erp_pessoas(is_fornecedor);
create index if not exists idx_pessoas_documento on public.erp_pessoas(documento);

-- ---------------------------------------------------------------------------
-- contas a pagar
-- ---------------------------------------------------------------------------
create table if not exists public.erp_contas_pagar (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  fornecedor_id uuid references public.erp_pessoas(id) on delete set null,
  categoria_id uuid references public.erp_categorias(id) on delete set null,
  centro_custo_id uuid references public.erp_centros_custo(id) on delete set null,
  plano_conta_id uuid references public.erp_plano_contas(id) on delete set null,
  conta_bancaria_id uuid references public.erp_contas_bancarias(id) on delete set null,
  valor numeric(16,2) not null default 0,
  desconto numeric(16,2) not null default 0,
  juros numeric(16,2) not null default 0,
  multa numeric(16,2) not null default 0,
  valor_pago numeric(16,2) not null default 0,
  emissao date not null default current_date,
  vencimento date not null default current_date,
  data_pagamento date,
  status text not null default 'aberto', -- aberto | pago | parcial | vencido | cancelado
  forma_pagamento text default '', -- pix | boleto | dinheiro | cartao | transferencia | cheque
  numero_documento text default '',
  parcela int not null default 1,
  total_parcelas int not null default 1,
  recorrencia text default 'nenhuma', -- nenhuma | semanal | mensal | bimestral | trimestral | semestral | anual
  recorrencia_proxima date,
  observacoes text default '',
  tags jsonb not null default '[]'::jsonb,
  anexos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cp_status on public.erp_contas_pagar(status);
create index if not exists idx_cp_vencimento on public.erp_contas_pagar(vencimento);
create index if not exists idx_cp_fornecedor on public.erp_contas_pagar(fornecedor_id);

-- ---------------------------------------------------------------------------
-- contas a receber
-- ---------------------------------------------------------------------------
create table if not exists public.erp_contas_receber (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  cliente_id uuid references public.erp_pessoas(id) on delete set null,
  categoria_id uuid references public.erp_categorias(id) on delete set null,
  centro_custo_id uuid references public.erp_centros_custo(id) on delete set null,
  plano_conta_id uuid references public.erp_plano_contas(id) on delete set null,
  conta_bancaria_id uuid references public.erp_contas_bancarias(id) on delete set null,
  valor numeric(16,2) not null default 0,
  desconto numeric(16,2) not null default 0,
  juros numeric(16,2) not null default 0,
  multa numeric(16,2) not null default 0,
  valor_recebido numeric(16,2) not null default 0,
  emissao date not null default current_date,
  vencimento date not null default current_date,
  data_recebimento date,
  status text not null default 'aberto', -- aberto | recebido | parcial | vencido | cancelado
  forma_recebimento text default '',
  numero_documento text default '',
  parcela int not null default 1,
  total_parcelas int not null default 1,
  recorrencia text default 'nenhuma',
  recorrencia_proxima date,
  observacoes text default '',
  tags jsonb not null default '[]'::jsonb,
  anexos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cr_status on public.erp_contas_receber(status);
create index if not exists idx_cr_vencimento on public.erp_contas_receber(vencimento);
create index if not exists idx_cr_cliente on public.erp_contas_receber(cliente_id);

-- ---------------------------------------------------------------------------
-- movimentos bancarios (extratos + lancamentos manuais)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_movimentos_bancarios (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid not null references public.erp_contas_bancarias(id) on delete cascade,
  data date not null,
  tipo text not null, -- entrada | saida | transferencia
  descricao text not null,
  valor numeric(16,2) not null default 0,
  categoria_id uuid references public.erp_categorias(id) on delete set null,
  centro_custo_id uuid references public.erp_centros_custo(id) on delete set null,
  plano_conta_id uuid references public.erp_plano_contas(id) on delete set null,
  pessoa_id uuid references public.erp_pessoas(id) on delete set null,
  conta_pagar_id uuid references public.erp_contas_pagar(id) on delete set null,
  conta_receber_id uuid references public.erp_contas_receber(id) on delete set null,
  transferencia_par_id uuid, -- referencia o outro movimento de uma transferencia
  conciliado boolean not null default false,
  origem text not null default 'manual', -- manual | importacao_ofx | pagamento | recebimento | transferencia
  documento text default '',
  observacoes text default '',
  saldo_apos numeric(16,2) default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mov_conta on public.erp_movimentos_bancarios(conta_bancaria_id);
create index if not exists idx_mov_data on public.erp_movimentos_bancarios(data);
create index if not exists idx_mov_conciliado on public.erp_movimentos_bancarios(conciliado);

-- ---------------------------------------------------------------------------
-- lancamentos contabeis (partidas dobradas)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_lancamentos (
  id uuid primary key default gen_random_uuid(),
  numero serial,
  data date not null default current_date,
  historico text not null,
  valor_total numeric(16,2) not null default 0,
  origem text not null default 'manual', -- manual | pagamento | recebimento | conciliacao | encerramento
  documento text default '',
  conta_pagar_id uuid references public.erp_contas_pagar(id) on delete set null,
  conta_receber_id uuid references public.erp_contas_receber(id) on delete set null,
  movimento_id uuid references public.erp_movimentos_bancarios(id) on delete set null,
  status text not null default 'ativo', -- ativo | estornado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lc_data on public.erp_lancamentos(data);

-- ---------------------------------------------------------------------------
-- partidas (cada lancamento tem 1+ debitos e 1+ creditos)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_lancamento_partidas (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.erp_lancamentos(id) on delete cascade,
  plano_conta_id uuid not null references public.erp_plano_contas(id),
  centro_custo_id uuid references public.erp_centros_custo(id) on delete set null,
  natureza text not null, -- debito | credito
  valor numeric(16,2) not null default 0,
  historico_complementar text default '',
  ordem int not null default 0
);

create index if not exists idx_part_lanc on public.erp_lancamento_partidas(lancamento_id);
create index if not exists idx_part_conta on public.erp_lancamento_partidas(plano_conta_id);

-- ---------------------------------------------------------------------------
-- notas fiscais (registro simplificado)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  tipo text not null, -- entrada | saida
  numero text not null,
  serie text default '1',
  pessoa_id uuid references public.erp_pessoas(id) on delete set null,
  emissao date not null default current_date,
  valor_total numeric(16,2) not null default 0,
  base_calculo numeric(16,2) not null default 0,
  icms numeric(16,2) not null default 0,
  ipi numeric(16,2) not null default 0,
  pis numeric(16,2) not null default 0,
  cofins numeric(16,2) not null default 0,
  iss numeric(16,2) not null default 0,
  natureza_operacao text default '',
  cfop text default '',
  chave_acesso text default '',
  status text not null default 'emitida', -- emitida | cancelada | inutilizada
  itens jsonb not null default '[]'::jsonb,
  observacoes text default '',
  arquivo_xml text default '',
  arquivo_pdf text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_nf_tipo on public.erp_notas_fiscais(tipo);
create index if not exists idx_nf_emissao on public.erp_notas_fiscais(emissao);

-- ---------------------------------------------------------------------------
-- log de auditoria (acoes financeiras criticas)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_auditoria (
  id uuid primary key default gen_random_uuid(),
  entidade text not null,
  entidade_id uuid,
  acao text not null, -- create | update | delete | pay | receive | reconcile | revert
  usuario_id uuid,
  usuario_email text default '',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_entidade on public.erp_auditoria(entidade);
create index if not exists idx_audit_data on public.erp_auditoria(created_at);

-- ---------------------------------------------------------------------------
-- triggers de updated_at
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'erp_empresas','erp_plano_contas','erp_centros_custo','erp_categorias',
    'erp_contas_bancarias','erp_pessoas','erp_contas_pagar','erp_contas_receber',
    'erp_movimentos_bancarios','erp_lancamentos','erp_notas_fiscais'
  ])
  loop
    execute format('drop trigger if exists trg_%I_updated on public.%I;', t, t);
    execute format(
      'create trigger trg_%I_updated before update on public.%I for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- view: fluxo de caixa diario (consolidado de cp+cr+movimentos)
-- ---------------------------------------------------------------------------
create or replace view public.erp_fluxo_caixa as
  select
    vencimento as data,
    'previsto' as origem,
    'entrada' as tipo,
    sum(valor - desconto + juros + multa - valor_recebido) as valor
  from public.erp_contas_receber
  where status in ('aberto','parcial','vencido')
  group by vencimento
  union all
  select
    vencimento as data,
    'previsto' as origem,
    'saida' as tipo,
    sum(valor - desconto + juros + multa - valor_pago) as valor
  from public.erp_contas_pagar
  where status in ('aberto','parcial','vencido')
  group by vencimento
  union all
  select
    data,
    'realizado' as origem,
    case when tipo='entrada' then 'entrada' else 'saida' end as tipo,
    sum(valor) as valor
  from public.erp_movimentos_bancarios
  where tipo in ('entrada','saida')
  group by data, tipo;

-- ---------------------------------------------------------------------------
-- Funcao: recalcular saldo de conta bancaria
-- ---------------------------------------------------------------------------
create or replace function public.erp_recalc_saldo(p_conta uuid)
returns numeric language plpgsql as $$
declare
  v_inicial numeric(16,2);
  v_saldo numeric(16,2);
begin
  select coalesce(saldo_inicial,0) into v_inicial
    from public.erp_contas_bancarias where id = p_conta;

  select coalesce(sum(case when tipo='entrada' then valor when tipo='saida' then -valor else 0 end),0)
    into v_saldo
    from public.erp_movimentos_bancarios where conta_bancaria_id = p_conta;

  v_saldo := coalesce(v_inicial,0) + coalesce(v_saldo,0);
  update public.erp_contas_bancarias set saldo_atual = v_saldo where id = p_conta;
  return v_saldo;
end $$;

-- Trigger: recalcula saldo apos qualquer alteracao em movimentos
create or replace function public.erp_trg_recalc_saldo()
returns trigger language plpgsql as $$
declare
  v_conta uuid;
begin
  if tg_op = 'DELETE' then
    v_conta := old.conta_bancaria_id;
  else
    v_conta := new.conta_bancaria_id;
  end if;
  perform public.erp_recalc_saldo(v_conta);
  if tg_op = 'UPDATE' and old.conta_bancaria_id <> new.conta_bancaria_id then
    perform public.erp_recalc_saldo(old.conta_bancaria_id);
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_mov_saldo on public.erp_movimentos_bancarios;
create trigger trg_mov_saldo
  after insert or update or delete on public.erp_movimentos_bancarios
  for each row execute function public.erp_trg_recalc_saldo();

-- ---------------------------------------------------------------------------
-- Funcao: atualizar status automaticamente quando vence
-- ---------------------------------------------------------------------------
create or replace function public.erp_atualizar_vencidos()
returns void language plpgsql as $$
begin
  update public.erp_contas_pagar
    set status = 'vencido'
    where status in ('aberto','parcial')
      and vencimento < current_date;
  update public.erp_contas_receber
    set status = 'vencido'
    where status in ('aberto','parcial')
      and vencimento < current_date;
end $$;

-- ---------------------------------------------------------------------------
-- SEED: plano de contas inicial (estrutura padrao brasileira)
-- ---------------------------------------------------------------------------
do $$
declare
  v_at_circ uuid;
  v_at_ncirc uuid;
  v_pas_circ uuid;
  v_pat uuid;
  v_rec_bruta uuid;
  v_desp_op uuid;
  v_caixa uuid;
  v_bancos uuid;
  v_clientes_pc uuid;
  v_estoques uuid;
  v_fornecedores_pc uuid;
  v_imp_pagar uuid;
  v_emp_pagar uuid;
  v_cap_social uuid;
  v_lucros uuid;
  v_rec_vendas uuid;
  v_rec_serv uuid;
  v_desp_pessoal uuid;
  v_desp_adm uuid;
  v_desp_comerc uuid;
  v_desp_fin uuid;
begin
  if exists (select 1 from public.erp_plano_contas) then
    return;
  end if;

  insert into public.erp_plano_contas(codigo,nome,tipo,natureza) values ('1','ATIVO','ativo','sintetica');
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.1','Ativo Circulante','ativo','sintetica',(select id from public.erp_plano_contas where codigo='1')) returning id into v_at_circ;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.1.01','Caixa','ativo','analitica',v_at_circ) returning id into v_caixa;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.1.02','Bancos Conta Movimento','ativo','analitica',v_at_circ) returning id into v_bancos;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.1.03','Aplicacoes Financeiras','ativo','analitica',v_at_circ);
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.1.04','Clientes a Receber','ativo','analitica',v_at_circ) returning id into v_clientes_pc;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.1.05','Estoques','ativo','analitica',v_at_circ) returning id into v_estoques;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.1.06','Adiantamentos','ativo','analitica',v_at_circ);
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.1.07','Impostos a Recuperar','ativo','analitica',v_at_circ);

  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.2','Ativo Nao Circulante','ativo','sintetica',(select id from public.erp_plano_contas where codigo='1')) returning id into v_at_ncirc;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.2.01','Imobilizado','ativo','analitica',v_at_ncirc);
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.2.02','Veiculos','ativo','analitica',v_at_ncirc);
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.2.03','Equipamentos','ativo','analitica',v_at_ncirc);
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('1.2.04','Depreciacao Acumulada','ativo','analitica',v_at_ncirc);

  insert into public.erp_plano_contas(codigo,nome,tipo,natureza) values ('2','PASSIVO','passivo','sintetica');
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('2.1','Passivo Circulante','passivo','sintetica',(select id from public.erp_plano_contas where codigo='2')) returning id into v_pas_circ;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('2.1.01','Fornecedores','passivo','analitica',v_pas_circ) returning id into v_fornecedores_pc;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('2.1.02','Salarios a Pagar','passivo','analitica',v_pas_circ);
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('2.1.03','Impostos a Pagar','passivo','analitica',v_pas_circ) returning id into v_imp_pagar;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('2.1.04','Emprestimos','passivo','analitica',v_pas_circ) returning id into v_emp_pagar;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('2.1.05','Adiantamentos de Clientes','passivo','analitica',v_pas_circ);

  insert into public.erp_plano_contas(codigo,nome,tipo,natureza) values ('2.3','PATRIMONIO LIQUIDO','patrimonio','sintetica') returning id into v_pat;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('2.3.01','Capital Social','patrimonio','analitica',v_pat) returning id into v_cap_social;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('2.3.02','Reservas','patrimonio','analitica',v_pat);
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id) values ('2.3.03','Lucros/Prejuizos Acumulados','patrimonio','analitica',v_pat) returning id into v_lucros;

  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,dre_grupo) values ('3','RECEITAS','receita','sintetica','receita_bruta') returning id into v_rec_bruta;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id,dre_grupo) values ('3.1','Receita de Vendas','receita','analitica',v_rec_bruta,'receita_bruta') returning id into v_rec_vendas;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id,dre_grupo) values ('3.2','Receita de Servicos','receita','analitica',v_rec_bruta,'receita_bruta') returning id into v_rec_serv;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id,dre_grupo) values ('3.3','Receitas Financeiras','receita','analitica',v_rec_bruta,'rec_fin');
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id,dre_grupo) values ('3.4','Outras Receitas','receita','analitica',v_rec_bruta,'outros');

  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,dre_grupo) values ('4','DESPESAS','despesa','sintetica','despesa_op') returning id into v_desp_op;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id,dre_grupo) values ('4.1','Custos das Vendas','despesa','analitica',v_desp_op,'custo');
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id,dre_grupo) values ('4.2','Despesas com Pessoal','despesa','analitica',v_desp_op,'despesa_op') returning id into v_desp_pessoal;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id,dre_grupo) values ('4.3','Despesas Administrativas','despesa','analitica',v_desp_op,'despesa_op') returning id into v_desp_adm;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id,dre_grupo) values ('4.4','Despesas Comerciais','despesa','analitica',v_desp_op,'despesa_op') returning id into v_desp_comerc;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id,dre_grupo) values ('4.5','Despesas Financeiras','despesa','analitica',v_desp_op,'desp_fin') returning id into v_desp_fin;
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id,dre_grupo) values ('4.6','Tributos','despesa','analitica',v_desp_op,'despesa_op');
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id,dre_grupo) values ('4.7','Despesas com Marketing','despesa','analitica',v_desp_op,'despesa_op');
  insert into public.erp_plano_contas(codigo,nome,tipo,natureza,parent_id,dre_grupo) values ('4.8','Outras Despesas','despesa','analitica',v_desp_op,'outros');
end $$;

-- ---------------------------------------------------------------------------
-- SEED: centros de custo padrao
-- ---------------------------------------------------------------------------
insert into public.erp_centros_custo(codigo,nome) values
  ('ADM','Administrativo'),
  ('COM','Comercial'),
  ('OP','Operacional'),
  ('FIN','Financeiro'),
  ('MKT','Marketing')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- SEED: categorias financeiras padrao
-- ---------------------------------------------------------------------------
insert into public.erp_categorias(nome,tipo,cor) values
  ('Vendas','receita','#6B8F5C'),
  ('Servicos Prestados','receita','#7CB9A8'),
  ('Recebimento Cliente','receita','#4A8FBF'),
  ('Comissoes Recebidas','receita','#C8A96E'),
  ('Outras Receitas','receita','#D4A843'),
  ('Folha de Pagamento','despesa','#C0504D'),
  ('Encargos Sociais','despesa','#A8423F'),
  ('Aluguel','despesa','#8B5A2B'),
  ('Energia/Agua/Telefone','despesa','#996633'),
  ('Material de Escritorio','despesa','#7A6A52'),
  ('Servicos de Terceiros','despesa','#5C6B7A'),
  ('Impostos e Taxas','despesa','#B85450'),
  ('Marketing e Publicidade','despesa','#C8A96E'),
  ('Manutencao','despesa','#6B7A52'),
  ('Combustivel','despesa','#7A6B52'),
  ('Tarifas Bancarias','despesa','#5C7AB7'),
  ('Juros e Multas','despesa','#C0504D'),
  ('Outras Despesas','despesa','#666666')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- SEED: empresa padrao
-- ---------------------------------------------------------------------------
insert into public.erp_empresas (razao_social, nome_fantasia, regime_tributario)
select 'Bula Assessoria Pecuaria','Bula Remates','simples'
where not exists (select 1 from public.erp_empresas);

-- ---------------------------------------------------------------------------
-- SEED: conta bancaria padrao (Caixa)
-- ---------------------------------------------------------------------------
insert into public.erp_contas_bancarias (nome, tipo, saldo_inicial, saldo_atual, cor)
select 'Caixa','caixa',0,0,'#6B8F5C'
where not exists (select 1 from public.erp_contas_bancarias);
