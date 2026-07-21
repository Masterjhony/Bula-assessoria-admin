import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'
import { getIsFinanceAdmin } from '@/lib/auth-helpers'

// Resultados mensais da operação (página "Resultados" do ERP).
// Anos com fechamento granular (2026+) são calculados de bula_leilao_fechamento;
// anos anteriores ao sistema vêm consolidados de erp_resultados_historico
// (mes 1..12 = agregado mensal; mes 0 = consolidado anual, p/ únicos no ano).

const IMPOSTO_PCT = 0.18 // mesmo critério da tela Fechamento Leilões

type Fechamento = {
  data: string
  vgv_total: number | null
  faturamento_total_leilao: number | null
  lotes_vendidos: number | null
  compradores_unicos: number | null
  receita_bula: number | null
  comissao_assessoria: number | null
  despesas_variaveis: number | null
}

type Mes = {
  mes: number
  leiloes: number | null
  lotes: number | null
  vgv: number | null
  faturamento_leiloeira: number | null
  receita: number | null
  comissao: number | null
  lucro_liquido: number | null
}

const emptyMes = (mes: number): Mes => ({
  mes, leiloes: null, lotes: null, vgv: null,
  faturamento_leiloeira: null, receita: null, comissao: null, lucro_liquido: null,
})

// PostgREST corta em 1000 linhas por request — sempre paginar (lição cap-1000).
async function fetchAllFechamentos() {
  const sb = admin()
  const out: Fechamento[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('bula_leilao_fechamento')
      .select('data,vgv_total,faturamento_total_leilao,lotes_vendidos,compradores_unicos,receita_bula,comissao_assessoria,despesas_variaveis')
      .order('data', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...((data || []) as Fechamento[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sb = admin()

  try {
  const [fechamentos, historico, finance] = await Promise.all([
    fetchAllFechamentos(),
    sb.from('erp_resultados_historico').select('*').order('ano').order('mes'),
    getIsFinanceAdmin(),
  ])
  if (historico.error) throw new Error(historico.error.message)

  type Ano = {
    fonte: 'fechamentos' | 'historico'
    meses: Mes[]
    total: {
      leiloes: number; lotes: number; vgv: number; faturamento_leiloeira: number
      receita: number | null; comissao: number | null; imposto: number | null
      despesas: number | null; lucro_liquido: number | null
    }
    // "unicos" = contagem única no ano (histórico); "soma" = soma dos únicos
    // POR LEILÃO (o mesmo comprador em 2 leilões conta 2x)
    compradores: number | null
    compradores_tipo: 'unicos' | 'soma' | null
    vendedores: number | null
    observacao: string | null
  }
  const porAno: Record<string, Ano> = {}

  const anoOf = (key: string): Ano => {
    porAno[key] ||= {
      fonte: 'fechamentos',
      meses: Array.from({ length: 12 }, (_, i) => emptyMes(i + 1)),
      total: { leiloes: 0, lotes: 0, vgv: 0, faturamento_leiloeira: 0, receita: 0, comissao: 0, imposto: 0, despesas: 0, lucro_liquido: 0 },
      compradores: null, compradores_tipo: null, vendedores: null, observacao: null,
    }
    return porAno[key]
  }

  // ── anos calculados dos fechamentos ─────────────────────────
  let comprSoma: Record<string, number> = {}
  for (const f of fechamentos) {
    const anoKey = String(f.data).slice(0, 4)
    const mesIdx = Number(String(f.data).slice(5, 7)) - 1
    if (!anoKey || mesIdx < 0 || mesIdx > 11) continue
    const a = anoOf(anoKey)
    const m = a.meses[mesIdx]
    m.leiloes = (m.leiloes || 0) + 1
    m.lotes = (m.lotes || 0) + (Number(f.lotes_vendidos) || 0)
    m.vgv = (m.vgv || 0) + (Number(f.vgv_total) || 0)
    m.faturamento_leiloeira = (m.faturamento_leiloeira || 0) + (Number(f.faturamento_total_leilao) || 0)
    const receita = Number(f.receita_bula) || 0
    const comissao = Number(f.comissao_assessoria) || 0
    const despesas = Number(f.despesas_variaveis) || 0
    m.receita = (m.receita || 0) + receita
    m.comissao = (m.comissao || 0) + comissao
    m.lucro_liquido = (m.lucro_liquido || 0) + (receita - comissao - IMPOSTO_PCT * receita - despesas)
    a.total.leiloes += 1
    a.total.lotes += Number(f.lotes_vendidos) || 0
    a.total.vgv += Number(f.vgv_total) || 0
    a.total.faturamento_leiloeira += Number(f.faturamento_total_leilao) || 0
    a.total.receita! += receita
    a.total.comissao! += comissao
    a.total.imposto! += IMPOSTO_PCT * receita
    a.total.despesas! += despesas
    a.total.lucro_liquido! += receita - comissao - IMPOSTO_PCT * receita - despesas
    comprSoma[anoKey] = (comprSoma[anoKey] || 0) + (Number(f.compradores_unicos) || 0)
  }
  for (const [anoKey, n] of Object.entries(comprSoma)) {
    porAno[anoKey].compradores = n
    porAno[anoKey].compradores_tipo = 'soma'
  }

  // ── anos históricos (só onde NÃO há fechamentos) ────────────
  type Hist = { ano: number; mes: number; leiloes: number | null; lotes: number | null; vgv: number | null; vendedores: number | null; compradores: number | null; observacao: string | null }
  for (const h of (historico.data || []) as Hist[]) {
    const anoKey = String(h.ano)
    if (porAno[anoKey] && porAno[anoKey].fonte === 'fechamentos') continue
    const a = anoOf(anoKey)
    a.fonte = 'historico'
    // financeiro não existe no histórico consolidado
    a.total.receita = null; a.total.comissao = null; a.total.imposto = null
    a.total.despesas = null; a.total.lucro_liquido = null
    if (h.mes === 0) {
      a.vendedores = h.vendedores
      if (h.compradores != null) { a.compradores = h.compradores; a.compradores_tipo = 'unicos' }
      a.observacao = h.observacao
      // totais anuais oficiais do consolidado prevalecem sobre a soma dos meses
      if (h.leiloes != null) a.total.leiloes = h.leiloes
      if (h.lotes != null) a.total.lotes = h.lotes
      if (h.vgv != null) a.total.vgv = Number(h.vgv)
    } else {
      const m = a.meses[h.mes - 1]
      m.leiloes = h.leiloes
      m.lotes = h.lotes
      m.vgv = h.vgv != null ? Number(h.vgv) : null
    }
  }

  // sem permissão de diretoria, campos financeiros saem nulos (mesma regra
  // do GET /api/bula/fechamento)
  if (!finance) {
    for (const a of Object.values(porAno)) {
      a.total.receita = null; a.total.comissao = null; a.total.imposto = null
      a.total.despesas = null; a.total.lucro_liquido = null
      for (const m of a.meses) { m.receita = null; m.comissao = null; m.lucro_liquido = null }
    }
  }

  const anos = Object.keys(porAno).map(Number).sort((x, y) => y - x)
  return ok({ finance, anos, porAno })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao montar resultados.', 500)
  }
}
