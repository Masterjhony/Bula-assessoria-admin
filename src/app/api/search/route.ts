import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Busca global cruzada — paralela em leilões, fechamentos, leads e empresas.
// Cada grupo retorna no máximo 5 itens. Sem resultados → grupos vazios (200).
// Auth: usa a sessão do navegador (RLS aplicada via cliente server-side).

export const dynamic = 'force-dynamic'

type Hit = { id: string; label: string; sub?: string; href: string }
type Payload = {
  leiloes: Hit[]
  fechamentos: Hit[]
  leads: Hit[]
  empresas: Hit[]
}

const PER_GROUP = 5

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const empty: Payload = { leiloes: [], fechamentos: [], leads: [], empresas: [] }
  if (q.length < 2) return NextResponse.json(empty)

  const like = `%${q.replace(/[%_]/g, '\\$&')}%`
  const supabase = await createClient()

  const [leiloesRes, fechamentosRes, leadsRes, empresasRes] = await Promise.all([
    supabase.from('bula_leiloes')
      .select('id, nome, data, local, leiloeira')
      .ilike('nome', like)
      .order('data', { ascending: false })
      .limit(PER_GROUP),
    supabase.from('bula_leilao_fechamento')
      .select('id, nome, data, local')
      .ilike('nome', like)
      .order('data', { ascending: false })
      .limit(PER_GROUP),
    supabase.from('leads')
      .select('id, nome, regiao, telefone')
      .ilike('nome', like)
      .order('updated_at', { ascending: false })
      .limit(PER_GROUP),
    supabase.from('erp_empresas')
      .select('id, razao_social, nome_fantasia, cnpj')
      .or(`razao_social.ilike.${like},nome_fantasia.ilike.${like}`)
      .limit(PER_GROUP),
  ])

  const payload: Payload = {
    leiloes: (leiloesRes.data ?? []).map(r => ({
      id: String(r.id),
      label: r.nome,
      sub: [fmtDate(r.data), r.local || r.leiloeira].filter(Boolean).join(' · '),
      href: '/sistema/leiloes',
    })),
    fechamentos: (fechamentosRes.data ?? []).map(r => ({
      id: String(r.id),
      label: r.nome,
      sub: [fmtDate(r.data), r.local].filter(Boolean).join(' · '),
      href: `/sistema/leiloes/fechamento?id=${r.id}`,
    })),
    leads: (leadsRes.data ?? []).map(r => ({
      id: String(r.id),
      label: r.nome,
      sub: [r.regiao, r.telefone].filter(Boolean).join(' · '),
      href: '/sistema/leads',
    })),
    empresas: (empresasRes.data ?? []).map(r => ({
      id: String(r.id),
      label: r.nome_fantasia || r.razao_social,
      sub: [r.razao_social, r.cnpj].filter(Boolean).join(' · '),
      href: '/erp',
    })),
  }

  return NextResponse.json(payload)
}
