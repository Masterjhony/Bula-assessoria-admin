/**
 * Lógica dos painéis financeiros do ERP (dashboard, DRE, fluxo de caixa),
 * extraída das rotas /api/erp/{dashboard,dre,fluxo-caixa} SEM mudança de
 * comportamento. As rotas continuam existindo (guard + params + ok()); a
 * extração existe para o agente interno de WhatsApp consultar os mesmos
 * números sem sessão de cookie — uma única implementação, zero divergência.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000) + 1
const mondayOf = (d: Date) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd) }
const r2 = (n: number) => Math.round(n * 100) / 100

type Mov = { data: string; tipo: string; valor: number; categoria_id: string | null; conta_bancaria_id: string | null }
type Titulo = { valor: number; desconto: number; juros: number; multa: number; valor_pago?: number; valor_recebido?: number }

const sumDue = (rows: Titulo[] | null | undefined, key: 'valor_pago' | 'valor_recebido') =>
  (rows || []).reduce((s, r) => s + (Number(r.valor || 0) - Number(r.desconto || 0) + Number(r.juros || 0) + Number(r.multa || 0) - Number(r[key] || 0)), 0)

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function computeErpDashboard(
  sb: SupabaseClient,
  opts: { from?: string | null; to?: string | null } = {},
) {
  await sb.rpc('erp_atualizar_vencidos')

  const hojeDate = new Date()
  const hoje = iso(hojeDate)

  // Periodo selecionado (default: mes corrente)
  const from = opts.from || iso(new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1))
  const to = opts.to || iso(new Date(hojeDate.getFullYear(), hojeDate.getMonth() + 1, 0))
  const lenDias = Math.max(1, daysBetween(from, to))
  // Periodo anterior de mesmo tamanho (para variacao)
  const prevTo = iso(addDays(new Date(from + 'T00:00:00'), -1))
  const prevFrom = iso(addDays(new Date(prevTo + 'T00:00:00'), -(lenDias - 1)))

  const [
    cpAbertos, crAbertos, vencidosCp, vencidosCr, contasBancarias,
    prevPagar, prevReceber, movPeriodo, movPrev, ultimosLanc,
    pagasPeriodo, recebPeriodo, categorias,
  ] = await Promise.all([
    sb.from('erp_contas_pagar').select('descricao,valor,desconto,juros,multa,valor_pago,vencimento,status,tags').in('status', ['aberto', 'parcial', 'vencido']),
    sb.from('erp_contas_receber').select('descricao,valor,desconto,juros,multa,valor_recebido,vencimento,status').in('status', ['aberto', 'parcial', 'vencido']),
    sb.from('erp_contas_pagar').select('valor,desconto,juros,multa,valor_pago').eq('status', 'vencido'),
    sb.from('erp_contas_receber').select('valor,desconto,juros,multa,valor_recebido').eq('status', 'vencido'),
    sb.from('erp_contas_bancarias').select('id,nome,saldo_atual,cor,tipo,ativo').eq('ativo', true).order('nome'),
    // previsao do periodo (titulos com vencimento no periodo; cancelados fora)
    sb.from('erp_contas_pagar').select('valor,desconto,juros,multa,valor_pago').gte('vencimento', from).lte('vencimento', to).neq('status', 'cancelado'),
    sb.from('erp_contas_receber').select('valor,desconto,juros,multa,valor_recebido').gte('vencimento', from).lte('vencimento', to).neq('status', 'cancelado'),
    // movimentos realizados no periodo e no periodo anterior
    sb.from('erp_movimentos_bancarios').select('data,tipo,valor,categoria_id,conta_bancaria_id').gte('data', from).lte('data', to),
    sb.from('erp_movimentos_bancarios').select('data,tipo,valor,categoria_id,conta_bancaria_id').gte('data', prevFrom).lte('data', prevTo),
    sb.from('erp_lancamentos').select('*, partidas:erp_lancamento_partidas(*)').order('data', { ascending: false }).limit(6),
    // pago / recebido de fato no periodo (por data de pagamento/recebimento)
    sb.from('erp_contas_pagar').select('valor_pago').gte('data_pagamento', from).lte('data_pagamento', to).eq('status', 'pago'),
    sb.from('erp_contas_receber').select('valor_recebido').gte('data_recebimento', from).lte('data_recebimento', to).eq('status', 'recebido'),
    sb.from('erp_categorias').select('id,nome,cor,tipo'),
  ])

  // categorias de transferencia interna nao contam como entrada/saida de caixa
  const catList = (categorias.data || []) as { id: string; nome: string; cor: string | null; tipo: string }[]
  const catMap = new Map(catList.map((c) => [c.id, c]))
  const transfIds = new Set(catList.filter((c) => /transfer/i.test(c.nome)).map((c) => c.id))
  const semTransf = (rows: Mov[]) => rows.filter((m) => !(m.categoria_id && transfIds.has(m.categoria_id)))

  const movP = semTransf((movPeriodo.data || []) as Mov[])
  const movPr = semTransf((movPrev.data || []) as Mov[])

  const entradas = movP.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + Number(m.valor || 0), 0)
  const saidas = movP.filter((m) => m.tipo === 'saida').reduce((s, m) => s + Number(m.valor || 0), 0)
  const prevEntradas = movPr.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + Number(m.valor || 0), 0)
  const prevSaidas = movPr.filter((m) => m.tipo === 'saida').reduce((s, m) => s + Number(m.valor || 0), 0)

  // ---- serie temporal com bucket adaptativo (dia / semana / mes) ----
  type Bucket = { data: string; label: string; entrada: number; saida: number }
  const buckets = new Map<string, Bucket>()
  const gran: 'dia' | 'semana' | 'mes' = lenDias <= 45 ? 'dia' : lenDias <= 186 ? 'semana' : 'mes'
  const mesShort = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  const keyOf = (dStr: string): { k: string; start: Date; label: string } => {
    const d = new Date(dStr + 'T00:00:00')
    if (gran === 'dia') return { k: dStr, start: d, label: ddmm(d) }
    if (gran === 'semana') { const m = mondayOf(d); return { k: iso(m), start: m, label: ddmm(m) } }
    const m = new Date(d.getFullYear(), d.getMonth(), 1); return { k: iso(m), start: m, label: `${mesShort(m)}/${String(m.getFullYear()).slice(2)}` }
  }
  // pre-popula os buckets do intervalo para nao ter buracos
  {
    const start = new Date(from + 'T00:00:00'); const end = new Date(to + 'T00:00:00')
    let cur = gran === 'mes' ? new Date(start.getFullYear(), start.getMonth(), 1) : gran === 'semana' ? mondayOf(start) : new Date(start)
    let guard = 0
    while (cur <= end && guard++ < 800) {
      const info = keyOf(iso(cur))
      if (!buckets.has(info.k)) buckets.set(info.k, { data: info.k, label: info.label, entrada: 0, saida: 0 })
      cur = gran === 'mes' ? new Date(cur.getFullYear(), cur.getMonth() + 1, 1) : gran === 'semana' ? addDays(cur, 7) : addDays(cur, 1)
    }
  }
  for (const m of movP) {
    const info = keyOf(m.data)
    const b = buckets.get(info.k) || { data: info.k, label: info.label, entrada: 0, saida: 0 }
    if (m.tipo === 'entrada') b.entrada += Number(m.valor || 0)
    if (m.tipo === 'saida') b.saida += Number(m.valor || 0)
    buckets.set(info.k, b)
  }
  const serie = [...buckets.values()].sort((a, b) => a.data.localeCompare(b.data))

  // ---- top categorias (entradas x saidas) no periodo ----
  const catAgg = new Map<string, { nome: string; cor: string; entrada: number; saida: number }>()
  for (const m of movP) {
    const c = m.categoria_id ? catMap.get(m.categoria_id) : null
    const id = m.categoria_id || 'sem'
    const cur = catAgg.get(id) || { nome: c?.nome || 'Sem categoria', cor: c?.cor || '#8892a0', entrada: 0, saida: 0 }
    if (m.tipo === 'entrada') cur.entrada += Number(m.valor || 0)
    if (m.tipo === 'saida') cur.saida += Number(m.valor || 0)
    catAgg.set(id, cur)
  }
  const cats = [...catAgg.values()]
  const topReceitas = cats.filter((c) => c.entrada > 0).map((c) => ({ nome: c.nome, cor: c.cor, valor: c.entrada })).sort((a, b) => b.valor - a.valor).slice(0, 6)
  const topDespesas = cats.filter((c) => c.saida > 0).map((c) => ({ nome: c.nome, cor: c.cor, valor: c.saida })).sort((a, b) => b.valor - a.valor).slice(0, 6)

  const previstoEntrada = sumDue(prevReceber.data, 'valor_recebido')
  const previstoSaida = sumDue(prevPagar.data, 'valor_pago')

  // ---- obrigacao real x orcamento futuro (tag 'orcamento' = titulo pre-lancado
  // de fato gerador futuro; nao e divida ainda) ----
  type CpRow = Titulo & { descricao: string; vencimento: string; tags: string[] | null }
  type CrRow = Titulo & { descricao: string; vencimento: string }
  const isOrcamento = (r: CpRow) => Array.isArray(r.tags) && r.tags.includes('orcamento')
  const cpRows = (cpAbertos.data || []) as CpRow[]
  const cpReais = cpRows.filter((r) => !isOrcamento(r))
  const cpOrcamento = cpRows.filter(isOrcamento)
  const due = (r: Titulo, key: 'valor_pago' | 'valor_recebido') =>
    Number(r.valor || 0) - Number(r.desconto || 0) + Number(r.juros || 0) + Number(r.multa || 0) - Number(r[key] || 0)

  // ---- projecao de caixa 15 dias: saldo bancos + titulos datados (CP real + CR) ----
  const fimJanela = iso(addDays(hojeDate, 15))
  const eventos: { data: string; descricao: string; valor: number }[] = []
  for (const r of cpReais) if (r.vencimento >= hoje && r.vencimento <= fimJanela) eventos.push({ data: r.vencimento, descricao: r.descricao, valor: -due(r, 'valor_pago') })
  for (const r of (crAbertos.data || []) as CrRow[]) if (r.vencimento >= hoje && r.vencimento <= fimJanela) eventos.push({ data: r.vencimento, descricao: r.descricao, valor: due(r, 'valor_recebido') })
  eventos.sort((a, b) => a.data.localeCompare(b.data) || a.valor - b.valor)
  const saldoBancos = (contasBancarias.data || []).reduce((s: number, c: { saldo_atual: number }) => s + Number(c.saldo_atual || 0), 0)
  let acumulado = saldoBancos
  const fluxo15d = eventos.map((e) => ({ ...e, saldo_projetado: (acumulado += e.valor) }))

  return {
    periodo: { from, to, dias: lenDias, granularidade: gran, prev_from: prevFrom, prev_to: prevTo },
    // ponto no tempo (independente do periodo)
    saldo_total_bancos: saldoBancos,
    a_pagar: sumDue(cpReais, 'valor_pago'),
    a_pagar_orcamento: sumDue(cpOrcamento, 'valor_pago'),
    fluxo_15d: fluxo15d,
    a_receber: sumDue(crAbertos.data, 'valor_recebido'),
    vencidos_pagar: sumDue(vencidosCp.data, 'valor_pago'),
    vencidos_receber: sumDue(vencidosCr.data, 'valor_recebido'),
    bancos: contasBancarias.data || [],
    ultimos_lancamentos: ultimosLanc.data || [],
    // realizado no periodo (fluxo de caixa) + comparacao
    entradas, saidas, resultado: entradas - saidas,
    prev: { entradas: prevEntradas, saidas: prevSaidas, resultado: prevEntradas - prevSaidas },
    // previsto (titulos com vencimento no periodo)
    previsto_entrada: previstoEntrada,
    previsto_saida: previstoSaida,
    previsto_resultado: previstoEntrada - previstoSaida,
    serie,
    top_receitas: topReceitas,
    top_despesas: topDespesas,
    // caixa efetivamente movimentado no periodo (por baixa de titulo)
    pago_periodo: (pagasPeriodo.data || []).reduce((s: number, r: { valor_pago: number }) => s + Number(r.valor_pago || 0), 0),
    recebido_periodo: (recebPeriodo.data || []).reduce((s: number, r: { valor_recebido: number }) => s + Number(r.valor_recebido || 0), 0),
  }
}

// ---------------------------------------------------------------------------
// DRE
// ---------------------------------------------------------------------------

// Grupos da DRE em cascata. O grupo de cada categoria vem de
// erp_categorias.dre_grupo (migration 0073). Categoria sem grupo cai em
// receita/despesa_variavel pelo tipo do movimento — nada some em silêncio.
export type DreGrupo = 'receita' | 'imposto' | 'custo_direto' | 'despesa_variavel' | 'despesa_fixa' | 'financeiro' | 'distribuicao' | 'ignorar'

export async function computeDre(
  sb: SupabaseClient,
  opts: { from?: string | null; to?: string | null; regime?: 'caixa' | 'competencia' } = {},
) {
  const from = opts.from || (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) })()
  const to = opts.to || new Date().toISOString().slice(0, 10)

  // DRE pelo regime de competencia: soma dos titulos (cp/cr) com vencimento no periodo
  // ou pelo regime de caixa: soma de movimentos com data no periodo.
  const regime = opts.regime === 'competencia' ? 'competencia' : 'caixa'

  const { data: catsData } = await sb.from('erp_categorias').select('id,nome,dre_grupo')
  const catById = new Map((catsData || []).map((c: { id: string; nome: string; dre_grupo: string | null }) => [c.id, c]))

  // acumulação: por categoria, com sinal (+entrada / -saida) — estorno dentro
  // da mesma categoria abate em vez de virar linha nova.
  type Acc = { nome: string; grupo: DreGrupo; entrada: number; saida: number }
  const acc = new Map<string, Acc>()
  const lanca = (categoriaId: string | null, fallbackNome: string, lado: 'entrada' | 'saida', valor: number) => {
    const cat = categoriaId ? catById.get(categoriaId) : null
    const nome = cat?.nome || fallbackNome
    const grupo = ((cat?.dre_grupo as DreGrupo | null) ?? (lado === 'entrada' ? 'receita' : 'despesa_variavel'))
    if (grupo === 'ignorar') return
    const a = acc.get(nome) || { nome, grupo, entrada: 0, saida: 0 }
    a[lado] += valor
    acc.set(nome, a)
  }

  if (regime === 'caixa') {
    const { data: movs } = await sb
      .from('erp_movimentos_bancarios')
      .select('tipo,valor,categoria_id')
      .gte('data', from).lte('data', to)
      .in('tipo', ['entrada', 'saida'])
    for (const m of (movs || []) as { tipo: string; valor: number; categoria_id: string | null }[]) {
      lanca(m.categoria_id, m.tipo === 'entrada' ? 'Outras Receitas' : 'Outras Despesas', m.tipo === 'entrada' ? 'entrada' : 'saida', Number(m.valor || 0))
    }
  } else {
    // 'sintetico' fica de fora: e o titulo do pagamento em lote vindo do
    // extrato, que existe para o regime de CAIXA. Na competencia quem responde
    // pela despesa sao os titulos analiticos (comissao por leilao/assessor) —
    // somar os dois contaria a mesma comissao duas vezes.
    const [{ data: cps }, { data: crs }] = await Promise.all([
      sb.from('erp_contas_pagar')
        .select('valor,desconto,juros,multa,categoria_id')
        .gte('vencimento', from).lte('vencimento', to)
        .neq('status', 'cancelado')
        .neq('origem', 'sintetico'),
      sb.from('erp_contas_receber')
        .select('valor,desconto,juros,multa,categoria_id')
        .gte('vencimento', from).lte('vencimento', to)
        .neq('status', 'cancelado')
        .neq('origem', 'sintetico'),
    ])
    type Tit = { valor: number; desconto: number; juros: number; multa: number; categoria_id: string | null }
    const liq = (r: Tit) => Number(r.valor || 0) - Number(r.desconto || 0) + Number(r.juros || 0) + Number(r.multa || 0)
    for (const r of (cps || []) as Tit[]) lanca(r.categoria_id, 'Outras Despesas', 'saida', liq(r))
    for (const r of (crs || []) as Tit[]) lanca(r.categoria_id, 'Outras Receitas', 'entrada', liq(r))
  }

  // linhas por grupo (net por categoria; sinal do ponto de vista do grupo)
  const linhasDe = (grupo: DreGrupo, sinal: 1 | -1) =>
    [...acc.values()].filter((a) => a.grupo === grupo)
      .map((a) => ({ nome: a.nome, valor: r2(sinal === 1 ? a.entrada - a.saida : a.saida - a.entrada) }))
      .filter((l) => Math.abs(l.valor) > 0.005)
      .sort((a, b) => b.valor - a.valor)
  const soma = (ls: { valor: number }[]) => r2(ls.reduce((s, l) => s + l.valor, 0))

  const gReceita = linhasDe('receita', 1)
  const gImposto = linhasDe('imposto', -1)
  const gCusto = linhasDe('custo_direto', -1)
  const gVar = linhasDe('despesa_variavel', -1)
  const gFixa = linhasDe('despesa_fixa', -1)
  const gFin = linhasDe('financeiro', 1) // net: receitas financeiras (+), custos financeiros (−)
  // participação no resultado (35% do lucro do sócio): sai DEPOIS do lucro
  // líquido operacional, nunca antes — não é custo da operação e não pode
  // entrar no EBITDA nem no ponto de equilíbrio.
  const gDist = linhasDe('distribuicao', -1)

  const receitaBruta = soma(gReceita)
  const impostos = soma(gImposto)
  const receitaLiquida = r2(receitaBruta - impostos)
  const custoDireto = soma(gCusto)
  const lucroBruto = r2(receitaLiquida - custoDireto)
  const despVariaveis = soma(gVar)
  const despFixas = soma(gFixa)
  const ebitda = r2(lucroBruto - despVariaveis - despFixas)
  const resultadoFinanceiro = soma(gFin)
  const lucroLiquido = r2(ebitda + resultadoFinanceiro)
  const distribuicao = soma(gDist)
  const resultadoRetido = r2(lucroLiquido - distribuicao)

  // legado (agente WhatsApp / gráficos): totais brutos de entradas e saídas
  let receitas = 0
  let despesas = 0
  const porCategoriaReceita: { nome: string; valor: number }[] = []
  const porCategoriaDespesa: { nome: string; valor: number }[] = []
  for (const a of acc.values()) {
    if (a.entrada > 0) { receitas += a.entrada; porCategoriaReceita.push({ nome: a.nome, valor: r2(a.entrada) }) }
    if (a.saida > 0) { despesas += a.saida; porCategoriaDespesa.push({ nome: a.nome, valor: r2(a.saida) }) }
  }
  receitas = r2(receitas); despesas = r2(despesas)
  const resultado = r2(receitas - despesas)

  return {
    regime,
    from, to,
    // ── cascata contábil ──
    cascata: {
      receita_bruta: { total: receitaBruta, linhas: gReceita },
      impostos: { total: impostos, linhas: gImposto },
      receita_liquida: receitaLiquida,
      custo_direto: { total: custoDireto, linhas: gCusto },
      lucro_bruto: lucroBruto,
      despesas_variaveis: { total: despVariaveis, linhas: gVar },
      despesas_fixas: { total: despFixas, linhas: gFixa },
      ebitda,
      resultado_financeiro: { total: resultadoFinanceiro, linhas: gFin },
      lucro_liquido: lucroLiquido,
      distribuicao: { total: distribuicao, linhas: gDist },
      resultado_retido: resultadoRetido,
      margem_liquida: receitaBruta > 0 ? r2(lucroLiquido / receitaBruta * 10000) / 100 : 0,
      margem_ebitda: receitaBruta > 0 ? r2(ebitda / receitaBruta * 10000) / 100 : 0,
    },
    // ── legado ──
    receitas,
    despesas,
    resultado,
    margem: receitas > 0 ? (resultado / receitas) : 0,
    grupos_receita: porCategoriaReceita.sort((a, b) => b.valor - a.valor),
    grupos_despesa: porCategoriaDespesa.sort((a, b) => b.valor - a.valor),
  }
}

// ---------------------------------------------------------------------------
// Fluxo de caixa (matriz categoria x periodo)
// ---------------------------------------------------------------------------

type TituloRow = {
  vencimento: string; valor: number; desconto: number; juros: number; multa: number
  valor_pago?: number; valor_recebido?: number; categoria_id: string | null; tags?: string[] | null
}
type MovRow = { data: string; tipo: string; valor: number; categoria_id: string | null }

export async function computeFluxoCaixa(
  sb: SupabaseClient,
  opts: { dias?: number; passado?: number; gran?: string | null; incluirOrcamento?: boolean } = {},
) {
  const dias = Math.min(365, Math.max(7, Number(opts.dias || 60)))
  const passado = Math.min(180, Math.max(0, Number(opts.passado ?? 30)))
  const gran = (['dia', 'semana', 'mes'].includes(opts.gran || '') ? opts.gran : 'semana') as 'dia' | 'semana' | 'mes'
  const incluirOrcamento = opts.incluirOrcamento !== false

  const hoje = new Date()
  const hojeIso = iso(hoje)
  const inicio = addDays(hoje, -passado)
  const fim = addDays(hoje, dias)
  const inicioIso = iso(inicio)
  const fimIso = iso(fim)

  const [bancos, mov, cp, cr, cats] = await Promise.all([
    sb.from('erp_contas_bancarias').select('saldo_atual').eq('ativo', true),
    sb.from('erp_movimentos_bancarios').select('data,tipo,valor,categoria_id').gte('data', inicioIso).lte('data', hojeIso),
    // sem gte(hoje): titulo VENCIDO e nao pago continua sendo caixa futuro — cai no bucket de hoje
    sb.from('erp_contas_pagar').select('vencimento,valor,desconto,juros,multa,valor_pago,categoria_id,tags').in('status', ['aberto', 'parcial', 'vencido']).lte('vencimento', fimIso),
    sb.from('erp_contas_receber').select('vencimento,valor,desconto,juros,multa,valor_recebido,categoria_id').in('status', ['aberto', 'parcial', 'vencido']).lte('vencimento', fimIso),
    sb.from('erp_categorias').select('id,nome,cor,tipo'),
  ])
  const catList = (cats.data || []) as { id: string; nome: string; cor: string | null; tipo: string }[]
  const catMap = new Map(catList.map((c) => [c.id, c]))
  const transfIds = new Set(catList.filter((c) => /transfer/i.test(c.nome)).map((c) => c.id))

  const saldoAtual = (bancos.data || []).reduce((s: number, r: { saldo_atual: number }) => s + Number(r.saldo_atual || 0), 0)
  const due = (r: TituloRow, key: 'valor_pago' | 'valor_recebido') =>
    Number(r.valor || 0) - Number(r.desconto || 0) + Number(r.juros || 0) + Number(r.multa || 0) - Number(r[key] || 0)
  const isOrc = (r: TituloRow) => Array.isArray(r.tags) && r.tags.includes('orcamento')

  // ---------- serie diaria (mantida p/ graficos) ----------
  const dataMap: Record<string, { data: string; entrada_real: number; saida_real: number; entrada_prev: number; saida_prev: number; saldo: number }> = {}
  for (let d = new Date(inicio); d <= fim; d = addDays(d, 1)) {
    dataMap[iso(d)] = { data: iso(d), entrada_real: 0, saida_real: 0, entrada_prev: 0, saida_prev: 0, saldo: 0 }
  }

  // ---------- celulas da matriz: categoria x dia ----------
  // key: `${catId}|${dia}` -> valor (entrada positiva, saida negativa por natureza da categoria)
  const celReal = new Map<string, number>()
  const celPrev = new Map<string, number>()
  const catsComValor = new Map<string, { tipo: 'receita' | 'despesa'; nome: string; cor: string | null }>()
  const registraCat = (id: string | null, tipoMov: 'entrada' | 'saida') => {
    const key = id || `sem-${tipoMov}`
    if (!catsComValor.has(key)) {
      const c = id ? catMap.get(id) : null
      catsComValor.set(key, {
        tipo: (c?.tipo as 'receita' | 'despesa') || (tipoMov === 'entrada' ? 'receita' : 'despesa'),
        nome: c?.nome || (tipoMov === 'entrada' ? 'Sem categoria (entradas)' : 'Sem categoria (saidas)'),
        cor: c?.cor || null,
      })
    }
    return key
  }

  for (const m of (mov.data || []) as MovRow[]) {
    if (!dataMap[m.data]) continue
    if (m.categoria_id && transfIds.has(m.categoria_id)) continue
    if (m.tipo !== 'entrada' && m.tipo !== 'saida') continue // transferencias/aplicacoes fora do fluxo
    const v = Number(m.valor || 0)
    if (m.tipo === 'entrada') dataMap[m.data].entrada_real += v
    else dataMap[m.data].saida_real += v
    const ck = registraCat(m.categoria_id, m.tipo as 'entrada' | 'saida')
    const k = `${ck}|${m.data}`
    celReal.set(k, (celReal.get(k) || 0) + v)
  }
  for (const r of (cp.data || []) as TituloRow[]) {
    if (!incluirOrcamento && isOrc(r)) continue
    if (r.categoria_id && transfIds.has(r.categoria_id)) continue
    const k = r.vencimento < hojeIso ? hojeIso : r.vencimento
    if (!dataMap[k]) continue
    const v = due(r, 'valor_pago')
    if (v <= 0) continue
    dataMap[k].saida_prev += v
    const ck = registraCat(r.categoria_id, 'saida')
    celPrev.set(`${ck}|${k}`, (celPrev.get(`${ck}|${k}`) || 0) + v)
  }
  for (const r of (cr.data || []) as TituloRow[]) {
    if (r.categoria_id && transfIds.has(r.categoria_id)) continue
    const k = r.vencimento < hojeIso ? hojeIso : r.vencimento
    if (!dataMap[k]) continue
    const v = due(r, 'valor_recebido')
    if (v <= 0) continue
    dataMap[k].entrada_prev += v
    const ck = registraCat(r.categoria_id, 'entrada')
    celPrev.set(`${ck}|${k}`, (celPrev.get(`${ck}|${k}`) || 0) + v)
  }

  // ---------- saldo dia a dia ancorado no saldo real de HOJE ----------
  // saldo_atual ja reflete todos os movimentos realizados; do passado ao
  // presente o saldo e reconstruido descontando o realizado posterior, e de
  // hoje em diante soma o previsto.
  const ordered = Object.values(dataMap).sort((a, b) => a.data.localeCompare(b.data))
  {
    let acc = saldoAtual
    for (let i = ordered.length - 1; i >= 0; i--) {
      const row = ordered[i]
      if (row.data > hojeIso) continue
      row.saldo = acc
      acc -= row.entrada_real - row.saida_real // saldo do fim do dia anterior
    }
    acc = saldoAtual
    for (const row of ordered) {
      if (row.data < hojeIso) continue
      acc += row.entrada_prev - row.saida_prev
      row.saldo = acc
    }
  }

  // ---------- buckets ----------
  const bucketKey = (dStr: string) => {
    const d = new Date(dStr + 'T00:00:00')
    if (gran === 'dia') return dStr
    if (gran === 'semana') return iso(mondayOf(d))
    return iso(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  const mesShort = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
  const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  const buckets: { key: string; label: string; from: string; to: string; passado: boolean; atual: boolean }[] = []
  const bIndex = new Map<string, number>()
  for (const row of ordered) {
    const k = bucketKey(row.data)
    if (!bIndex.has(k)) {
      const d = new Date(k + 'T00:00:00')
      const label = gran === 'mes' ? mesShort(d) : gran === 'semana' ? ddmm(d) : ddmm(d)
      bIndex.set(k, buckets.length)
      buckets.push({ key: k, label, from: row.data, to: row.data, passado: true, atual: false })
    }
    const b = buckets[bIndex.get(k)!]
    b.to = row.data
    if (row.data >= hojeIso) b.passado = false
    if (hojeIso >= b.from && hojeIso <= b.to) b.atual = true
  }
  const nB = buckets.length
  const idxOf = (dStr: string) => bIndex.get(bucketKey(dStr))!

  // ---------- linhas da matriz ----------
  type Linha = { categoria_id: string; nome: string; cor: string | null; tipo: string; realizado: number[]; previsto: number[]; total: number }
  const linhas: Linha[] = []
  for (const [ck, info] of catsComValor) {
    const realizado = Array(nB).fill(0)
    const previsto = Array(nB).fill(0)
    for (const row of ordered) {
      const kr = celReal.get(`${ck}|${row.data}`)
      if (kr) realizado[idxOf(row.data)] += kr
      const kp = celPrev.get(`${ck}|${row.data}`)
      if (kp) previsto[idxOf(row.data)] += kp
    }
    const total = r2(realizado.reduce((s, v) => s + v, 0) + previsto.reduce((s, v) => s + v, 0))
    if (total === 0) continue
    linhas.push({
      categoria_id: ck, nome: info.nome, cor: info.cor, tipo: info.tipo,
      realizado: realizado.map(r2), previsto: previsto.map(r2), total,
    })
  }
  linhas.sort((a, b) => b.total - a.total)

  const totais = {
    entrada_real: Array(nB).fill(0), saida_real: Array(nB).fill(0),
    entrada_prev: Array(nB).fill(0), saida_prev: Array(nB).fill(0),
    saldo_final: Array(nB).fill(0),
  }
  for (const row of ordered) {
    const i = idxOf(row.data)
    totais.entrada_real[i] += row.entrada_real
    totais.saida_real[i] += row.saida_real
    totais.entrada_prev[i] += row.entrada_prev
    totais.saida_prev[i] += row.saida_prev
    totais.saldo_final[i] = row.saldo
  }
  for (const k of ['entrada_real', 'saida_real', 'entrada_prev', 'saida_prev', 'saldo_final'] as const) {
    totais[k] = totais[k].map(r2)
  }

  return {
    saldo_atual: saldoAtual,
    dias, passado, gran, incluir_orcamento: incluirOrcamento, hoje: hojeIso,
    serie: ordered,
    matriz: {
      buckets,
      receitas: linhas.filter((l) => l.tipo === 'receita'),
      despesas: linhas.filter((l) => l.tipo === 'despesa'),
      totais,
    },
  }
}
