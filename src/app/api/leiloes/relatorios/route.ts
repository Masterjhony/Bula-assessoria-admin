import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { reatribuiVendasPorDirecionamento } from '@/lib/parceiro-direcionamento'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createClient()
  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  // Fechamentos
  let fq = supabase
    .from('bula_leilao_fechamento')
    .select('id, nome, data, local, lotes_ofertados, lotes_vendidos, animais_vendidos, vgv_total, ticket_medio, maior_lance, compradores_unicos, estados_alcancados, por_assessor, por_estado, compradores, lances, comissao_assessoria, receita_bula, sobra_bruta, observacoes')
    .order('data', { ascending: false })
  if (from) fq = fq.gte('data', from)
  if (to) fq = fq.lte('data', to)
  const { data: fechamentos, error: fErr } = await fq
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 })

  // A VENDA É DE QUEM O COMPRADOR É, não de quem estava na pista. Os compradores
  // direcionados pelo Gustavo Rusa são anunciados por um assessor da Bula (quase
  // sempre o Douglas) e por isso ficam gravados no nome dele em `por_assessor` —
  // o que faz a tela de Vendas por assessor somar no Douglas venda que é do Rusa.
  // Aqui os dois são separados na resposta. É atribuição de VENDA e só isso: a
  // comissão desses lotes é assunto de `scripts/aplica-direcionamento-parceiro.mts`,
  // que mexe em título e depende de decisão de quem paga.
  const fechamentosAtribuidos = (fechamentos ?? []).map(f => {
    const { porAssessor, direcionados } = reatribuiVendasPorDirecionamento(f.por_assessor, f.lances)
    return direcionados.length ? { ...f, por_assessor: porAssessor, direcionados } : f
  })

  // Cronograma
  let cq = supabase
    .from('cronograma_leiloes')
    .select('id, data, dia_semana, hora, nome, criador, presencial, leiloeira, raca, qtd_animais, sexo, comissao, contrato, faturamento_previsto, faturamento_realizado, venda_bula, comissao_receber, recebido')
    .order('data', { ascending: true })
  if (from) cq = cq.gte('data', from)
  if (to) cq = cq.lte('data', to)
  const { data: cronograma, error: cErr } = await cq
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // Leads do CRM: cortado nesta migração — o módulo CRM virá na Fase 8.
  // Mantemos o contrato com o frontend retornando array vazio para evitar
  // que ReportAssessor/ReportConversion quebrem.
  const leads: unknown[] = []

  return NextResponse.json({
    fechamentos: fechamentosAtribuidos,
    cronograma: cronograma ?? [],
    leads,
    range: { from: from ?? null, to: to ?? null },
  })
}
