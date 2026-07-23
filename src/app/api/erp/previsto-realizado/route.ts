import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

// Previsto × Realizado por mês (página do ERP).
// PREVISTO  = títulos (CR/CP) pelo VENCIMENTO no mês — inclui o que já foi
//             baixado (a previsão não muda porque o título foi pago) e as
//             projeções anuais (folha, despesas fixas).
// REALIZADO = movimentos bancários do mês (extrato conciliado), excluindo
//             transferências internas — o caixa que de fato aconteceu.
// As duas fontes são propositalmente diferentes: comparar previsão gerencial
// com realidade bancária é o ponto da página.

type Titulo = { valor: number; desconto: number; juros: number; multa: number; vencimento: string | null; status: string; categoria_id: string | null }
type Mov = { data: string; tipo: string; valor: number; categoria_id: string | null }

const liquido = (t: Titulo) => (Number(t.valor) || 0) - (Number(t.desconto) || 0) + (Number(t.juros) || 0) + (Number(t.multa) || 0)

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const sb = admin()
  const out: T[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(select).range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data || []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  try {
    const [cps, crs, movs, cats] = await Promise.all([
      fetchAll<Titulo>('erp_contas_pagar', 'valor,desconto,juros,multa,vencimento,status,categoria_id'),
      fetchAll<Titulo>('erp_contas_receber', 'valor,desconto,juros,multa,vencimento,status,categoria_id'),
      fetchAll<Mov>('erp_movimentos_bancarios', 'data,tipo,valor,categoria_id'),
      fetchAll<{ id: string; nome: string; cor: string | null; tipo: string }>('erp_categorias', 'id,nome,cor,tipo'),
    ])

    const catMap = new Map(cats.map((c) => [c.id, c]))
    const transfIds = new Set(cats.filter((c) => /transfer/i.test(c.nome)).map((c) => c.id))

    // anos disponíveis (união de vencimentos e movimentos)
    const anosSet = new Set<number>()
    for (const t of [...cps, ...crs]) { const y = Number((t.vencimento || '').slice(0, 4)); if (y) anosSet.add(y) }
    for (const m of movs) { const y = Number((m.data || '').slice(0, 4)); if (y) anosSet.add(y) }
    const anos = [...anosSet].sort((a, b) => b - a)
    const anoParam = Number(req.nextUrl.searchParams.get('ano')) || anos[0] || new Date().getFullYear()

    type MesAgg = { mes: number; prev_entrada: number; prev_saida: number; real_entrada: number | null; real_saida: number | null }
    const meses: MesAgg[] = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, prev_entrada: 0, prev_saida: 0, real_entrada: null, real_saida: null }))

    type CatAgg = { nome: string; cor: string; tipo: 'receita' | 'despesa'; prev: number[]; real: number[] }
    const porCat = new Map<string, CatAgg>()
    const catAgg = (id: string | null, tipo: 'receita' | 'despesa') => {
      const c = id ? catMap.get(id) : null
      const key = `${tipo}:${c?.id || 'sem'}`
      let agg = porCat.get(key)
      if (!agg) {
        agg = { nome: c?.nome || 'Sem categoria', cor: c?.cor || '#8892a0', tipo, prev: Array(12).fill(0), real: Array(12).fill(0) }
        porCat.set(key, agg)
      }
      return agg
    }

    const mesDe = (iso: string | null, ano: number) => {
      if (!iso || Number(iso.slice(0, 4)) !== ano) return -1
      const m = Number(iso.slice(5, 7)); return m >= 1 && m <= 12 ? m - 1 : -1
    }

    for (const t of crs) {
      if (t.status === 'cancelado') continue
      const i = mesDe(t.vencimento, anoParam); if (i < 0) continue
      const v = liquido(t)
      meses[i].prev_entrada += v
      catAgg(t.categoria_id, 'receita').prev[i] += v
    }
    for (const t of cps) {
      if (t.status === 'cancelado') continue
      const i = mesDe(t.vencimento, anoParam); if (i < 0) continue
      const v = liquido(t)
      meses[i].prev_saida += v
      catAgg(t.categoria_id, 'despesa').prev[i] += v
    }

    // realizado: só até o mês corrente (futuro fica null — o gráfico não
    // desenha zero falso)
    const hoje = new Date()
    const ultimoMesReal = anoParam < hoje.getFullYear() ? 11 : anoParam > hoje.getFullYear() ? -1 : hoje.getMonth()
    for (let i = 0; i <= ultimoMesReal; i++) { meses[i].real_entrada = 0; meses[i].real_saida = 0 }
    for (const m of movs) {
      if (m.categoria_id && transfIds.has(m.categoria_id)) continue
      const i = mesDe(m.data, anoParam); if (i < 0 || i > ultimoMesReal) continue
      const v = Number(m.valor) || 0
      if (m.tipo === 'entrada') { meses[i].real_entrada! += v; catAgg(m.categoria_id, 'receita').real[i] += v }
      if (m.tipo === 'saida') { meses[i].real_saida! += v; catAgg(m.categoria_id, 'despesa').real[i] += v }
    }

    const categorias = [...porCat.values()]
      .filter((c) => c.prev.some((v) => v > 0) || c.real.some((v) => v > 0))
      .sort((a, b) => b.prev.reduce((s, v) => s + v, 0) + b.real.reduce((s, v) => s + v, 0) - (a.prev.reduce((s, v) => s + v, 0) + a.real.reduce((s, v) => s + v, 0)))

    return ok({ ano: anoParam, anos, ultimo_mes_realizado: ultimoMesReal + 1, meses, categorias })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao montar previsto × realizado.', 500)
  }
}
