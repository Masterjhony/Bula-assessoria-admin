import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

// Fluxo de caixa estilo Omie: alem da serie diaria (compatibilidade com o
// grafico), devolve a MATRIZ categoria x periodo — passado = realizado
// (movimentos bancarios), futuro = previsto (CP/CR em aberto; vencidos caem
// no bucket de hoje). Titulos com tag 'orcamento' (pre-lancados de fato
// gerador futuro) entram por padrao e podem ser excluidos com orcamento=0.

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const mondayOf = (d: Date) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd) }
const r2 = (n: number) => Math.round(n * 100) / 100

type TituloRow = {
  vencimento: string; valor: number; desconto: number; juros: number; multa: number
  valor_pago?: number; valor_recebido?: number; categoria_id: string | null; tags?: string[] | null
}
type MovRow = { data: string; tipo: string; valor: number; categoria_id: string | null }

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  const dias = Math.min(365, Math.max(7, Number(sp.get('dias') || 60)))
  const passado = Math.min(180, Math.max(0, Number(sp.get('passado') ?? 30)))
  const gran = (['dia', 'semana', 'mes'].includes(sp.get('gran') || '') ? sp.get('gran') : 'semana') as 'dia' | 'semana' | 'mes'
  const incluirOrcamento = sp.get('orcamento') !== '0'
  const sb = admin()

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

  return ok({
    saldo_atual: saldoAtual,
    dias, passado, gran, incluir_orcamento: incluirOrcamento, hoje: hojeIso,
    serie: ordered,
    matriz: {
      buckets,
      receitas: linhas.filter((l) => l.tipo === 'receita'),
      despesas: linhas.filter((l) => l.tipo === 'despesa'),
      totais,
    },
  })
}
