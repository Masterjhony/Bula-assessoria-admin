import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  const from = sp.get('from') || (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) })()
  const to = sp.get('to') || new Date().toISOString().slice(0, 10)
  const sb = admin()

  // DRE pelo regime de competencia: soma dos titulos (cp/cr) com vencimento no periodo
  // ou pelo regime de caixa: soma de movimentos com data no periodo.
  const regime = (sp.get('regime') || 'caixa') as 'caixa' | 'competencia'
  const nonOperationalCategory = (name: string) =>
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes('transferencias internas')

  let receitas = 0
  let despesas = 0
  type GrupoLinha = { nome: string; valor: number }
  const porCategoriaReceita: Record<string, GrupoLinha> = {}
  const porCategoriaDespesa: Record<string, GrupoLinha> = {}

  if (regime === 'caixa') {
    const { data: movs } = await sb
      .from('erp_movimentos_bancarios')
      .select('tipo,valor,categoria_id,categoria:erp_categorias!categoria_id(nome,tipo)')
      .gte('data', from).lte('data', to)
      .in('tipo', ['entrada', 'saida'])
    for (const m of (movs || []) as { tipo: string; valor: number; categoria?: { nome?: string; tipo?: string } }[]) {
      const cat = m.categoria?.nome || (m.tipo === 'entrada' ? 'Outras Receitas' : 'Outras Despesas')
      if (nonOperationalCategory(cat)) continue
      if (m.tipo === 'entrada') {
        receitas += Number(m.valor || 0)
        porCategoriaReceita[cat] = { nome: cat, valor: (porCategoriaReceita[cat]?.valor || 0) + Number(m.valor || 0) }
      } else if (m.tipo === 'saida') {
        despesas += Number(m.valor || 0)
        porCategoriaDespesa[cat] = { nome: cat, valor: (porCategoriaDespesa[cat]?.valor || 0) + Number(m.valor || 0) }
      }
    }
  } else {
    const { data: cps } = await sb
      .from('erp_contas_pagar')
      .select('valor,desconto,juros,multa,categoria:erp_categorias!categoria_id(nome)')
      .gte('vencimento', from).lte('vencimento', to)
    const { data: crs } = await sb
      .from('erp_contas_receber')
      .select('valor,desconto,juros,multa,categoria:erp_categorias!categoria_id(nome)')
      .gte('vencimento', from).lte('vencimento', to)
    for (const r of (cps || []) as { valor: number; desconto: number; juros: number; multa: number; categoria?: { nome?: string } }[]) {
      const v = Number(r.valor || 0) - Number(r.desconto || 0) + Number(r.juros || 0) + Number(r.multa || 0)
      const cat = r.categoria?.nome || 'Outras Despesas'
      despesas += v
      porCategoriaDespesa[cat] = { nome: cat, valor: (porCategoriaDespesa[cat]?.valor || 0) + v }
    }
    for (const r of (crs || []) as { valor: number; desconto: number; juros: number; multa: number; categoria?: { nome?: string } }[]) {
      const v = Number(r.valor || 0) - Number(r.desconto || 0) + Number(r.juros || 0) + Number(r.multa || 0)
      const cat = r.categoria?.nome || 'Outras Receitas'
      receitas += v
      porCategoriaReceita[cat] = { nome: cat, valor: (porCategoriaReceita[cat]?.valor || 0) + v }
    }
  }

  const resultado = receitas - despesas
  return ok({
    regime,
    from, to,
    receitas,
    despesas,
    resultado,
    margem: receitas > 0 ? (resultado / receitas) : 0,
    grupos_receita: Object.values(porCategoriaReceita).sort((a, b) => b.valor - a.valor),
    grupos_despesa: Object.values(porCategoriaDespesa).sort((a, b) => b.valor - a.valor),
  })
}
