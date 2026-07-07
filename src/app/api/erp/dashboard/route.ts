import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000) + 1
const mondayOf = (d: Date) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd) }

type Mov = { data: string; tipo: string; valor: number; categoria_id: string | null; conta_bancaria_id: string | null }
type Titulo = { valor: number; desconto: number; juros: number; multa: number; valor_pago?: number; valor_recebido?: number }

const sumDue = (rows: Titulo[] | null | undefined, key: 'valor_pago' | 'valor_recebido') =>
  (rows || []).reduce((s, r) => s + (Number(r.valor || 0) - Number(r.desconto || 0) + Number(r.juros || 0) + Number(r.multa || 0) - Number(r[key] || 0)), 0)

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sb = admin()
  await sb.rpc('erp_atualizar_vencidos')

  const hojeDate = new Date()
  const hoje = iso(hojeDate)
  const sp = req.nextUrl.searchParams

  // Periodo selecionado (default: mes corrente)
  const from = sp.get('from') || iso(new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1))
  const to = sp.get('to') || iso(new Date(hojeDate.getFullYear(), hojeDate.getMonth() + 1, 0))
  const lenDias = Math.max(1, daysBetween(from, to))
  // Periodo anterior de mesmo tamanho (para variacao)
  const prevTo = iso(addDays(new Date(from + 'T00:00:00'), -1))
  const prevFrom = iso(addDays(new Date(prevTo + 'T00:00:00'), -(lenDias - 1)))

  const [
    cpAbertos, crAbertos, vencidosCp, vencidosCr, contasBancarias,
    prevPagar, prevReceber, movPeriodo, movPrev, ultimosLanc,
    pagasPeriodo, recebPeriodo, categorias,
  ] = await Promise.all([
    sb.from('erp_contas_pagar').select('valor,desconto,juros,multa,valor_pago,vencimento,status').in('status', ['aberto', 'parcial', 'vencido']),
    sb.from('erp_contas_receber').select('valor,desconto,juros,multa,valor_recebido,vencimento,status').in('status', ['aberto', 'parcial', 'vencido']),
    sb.from('erp_contas_pagar').select('valor,desconto,juros,multa,valor_pago').eq('status', 'vencido'),
    sb.from('erp_contas_receber').select('valor,desconto,juros,multa,valor_recebido').eq('status', 'vencido'),
    sb.from('erp_contas_bancarias').select('id,nome,saldo_atual,cor,tipo,ativo').eq('ativo', true).order('nome'),
    // previsao do periodo (titulos com vencimento no periodo)
    sb.from('erp_contas_pagar').select('valor,desconto,juros,multa,valor_pago').gte('vencimento', from).lte('vencimento', to),
    sb.from('erp_contas_receber').select('valor,desconto,juros,multa,valor_recebido').gte('vencimento', from).lte('vencimento', to),
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

  return ok({
    periodo: { from, to, dias: lenDias, granularidade: gran, prev_from: prevFrom, prev_to: prevTo },
    // ponto no tempo (independente do periodo)
    saldo_total_bancos: (contasBancarias.data || []).reduce((s: number, c: { saldo_atual: number }) => s + Number(c.saldo_atual || 0), 0),
    a_pagar: sumDue(cpAbertos.data, 'valor_pago'),
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
  })
}
