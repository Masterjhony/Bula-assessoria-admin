import type { SupabaseClient } from '@supabase/supabase-js'
import { compromissoFuturo, ehTransferencia, type GruposDre } from '@/lib/verdade/fatos'
import { hojeFinanceiro } from '@/lib/erp-contas'
import { pendenciaPrevisao, tituloComPrevisao, type PendenciaPrevisao, type TituloPrevisao } from '@/lib/erp-previsao'

// Programação atual dos títulos, pelo prazo operacional, e movimentos do mês.
// Não é orçamento congelado nem regime de competência. A baixa não reduz a
// programação histórica integral; valores sem prazo ficam visíveis à parte.

type Titulo = TituloPrevisao & { categoria_id: string | null }
type Mov = { data: string; tipo: string; valor: number; categoria_id: string | null; transferencia_par_id: string | null }

const liquido = (t: Titulo) => (Number(t.valor) || 0) - (Number(t.desconto) || 0) + (Number(t.juros) || 0) + (Number(t.multa) || 0)

async function fetchAll<T>(sb: SupabaseClient, table: string, select: string): Promise<T[]> {
  const out: T[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(select).order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data) throw new Error(`${table}: consulta financeira não retornou dados`)
    out.push(...((data || []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

export async function computePrevistoRealizado(sb: SupabaseClient, anoSolicitado?: number) {
    const [cps, crs, movs, cats] = await Promise.all([
      fetchAll<Titulo>(sb, 'erp_contas_pagar', 'id,descricao,valor,desconto,juros,multa,vencimento,status,categoria_id,substituido_por,origem,tags,apuracao,valor_pago'),
      fetchAll<Titulo>(sb, 'erp_contas_receber', 'id,descricao,valor,desconto,juros,multa,vencimento,status,categoria_id,substituido_por,origem,tags,valor_recebido'),
      fetchAll<Mov>(sb, 'erp_movimentos_bancarios', 'data,tipo,valor,categoria_id,transferencia_par_id'),
      fetchAll<{ id: string; nome: string; cor: string | null; tipo: string; dre_grupo: string | null }>(sb, 'erp_categorias', 'id,nome,cor,tipo,dre_grupo'),
    ])

    const catMap = new Map(cats.map((c) => [c.id, c]))
    const dreGrupo = new Map<string, string>()
    for (const c of cats) if (c.dre_grupo) dreGrupo.set(c.id, c.dre_grupo)
    const dre: GruposDre = { dreGrupo }

    // anos disponíveis (união de vencimentos e movimentos)
    const anosSet = new Set<number>()
    for (const t of [...cps, ...crs]) { const y = Number((t.apuracao?.previsao_mes || t.vencimento || '').slice(0, 4)); if (y) anosSet.add(y) }
    for (const m of movs) { const y = Number((m.data || '').slice(0, 4)); if (y) anosSet.add(y) }
    const anos = [...anosSet].sort((a, b) => b - a)
    // default = ano corrente quando ha dados nele (um titulo vencendo em
    // janeiro do ano seguinte nao pode puxar a pagina para um ano vazio)
    const anoCorrente = new Date().getFullYear()
    const anoParam = Number(anoSolicitado)
      || (anosSet.has(anoCorrente) ? anoCorrente : anos[0] || anoCorrente)

    type MesAgg = { mes: number; prev_entrada: number; prev_saida: number; orcamento_entrada: number; orcamento_saida: number; real_entrada: number | null; real_saida: number | null }
    const meses: MesAgg[] = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, prev_entrada: 0, prev_saida: 0, orcamento_entrada: 0, orcamento_saida: 0, real_entrada: null, real_saida: null }))
    const pendencias: PendenciaPrevisao[] = []

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
      if (ehTransferencia({categoria_id:t.categoria_id,transferencia_par_id:null}, dre)) continue
      const p = pendenciaPrevisao(t, 'receber')
      if (p && (!p.mes || Number(p.mes.slice(0,4)) === anoParam)) pendencias.push(p)
      if (!tituloComPrevisao(t, 'receber')) continue
      const i = mesDe(t.vencimento || null, anoParam); if (i < 0) continue
      const v = liquido(t)
      meses[i].prev_entrada += v
      if (compromissoFuturo(t)) meses[i].orcamento_entrada += v
      catAgg(t.categoria_id, 'receita').prev[i] += v
    }
    for (const t of cps) {
      if (ehTransferencia({categoria_id:t.categoria_id,transferencia_par_id:null}, dre)) continue
      const p = pendenciaPrevisao(t, 'pagar')
      if (p && (!p.mes || Number(p.mes.slice(0,4)) === anoParam)) pendencias.push(p)
      if (!tituloComPrevisao(t, 'pagar')) continue
      const i = mesDe(t.vencimento || null, anoParam); if (i < 0) continue
      const v = liquido(t)
      meses[i].prev_saida += v
      if (compromissoFuturo(t)) meses[i].orcamento_saida += v
      catAgg(t.categoria_id, 'despesa').prev[i] += v
    }

    // realizado: só até o mês corrente (futuro fica null — o gráfico não
    // desenha zero falso)
    const hoje = hojeFinanceiro()
    const anoHoje = Number(hoje.slice(0, 4)), mesHoje = Number(hoje.slice(5, 7)) - 1
    const ultimoMesReal = anoParam < anoHoje ? 11 : anoParam > anoHoje ? -1 : mesHoje
    for (let i = 0; i <= ultimoMesReal; i++) { meses[i].real_entrada = 0; meses[i].real_saida = 0 }
    for (const m of movs) {
      if (ehTransferencia(m, dre)) continue
      if (m.data.slice(0,10) > hoje) continue
      const i = mesDe(m.data, anoParam); if (i < 0 || i > ultimoMesReal) continue
      const v = Number(m.valor) || 0
      if (m.tipo === 'entrada') { meses[i].real_entrada! += v; catAgg(m.categoria_id, 'receita').real[i] += v }
      if (m.tipo === 'saida') { meses[i].real_saida! += v; catAgg(m.categoria_id, 'despesa').real[i] += v }
    }

    const categorias = [...porCat.values()]
      .filter((c) => c.prev.some((v) => v > 0) || c.real.some((v) => v > 0))
      .sort((a, b) => b.prev.reduce((s, v) => s + v, 0) + b.real.reduce((s, v) => s + v, 0) - (a.prev.reduce((s, v) => s + v, 0) + a.real.reduce((s, v) => s + v, 0)))

    return { ano: anoParam, anos, ultimo_mes_realizado: ultimoMesReal + 1, meses, categorias, pendencias_previsao: pendencias }
}
