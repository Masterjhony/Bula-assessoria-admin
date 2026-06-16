import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { clienteMatchKey } from '@/lib/clientes'

// Busca global cruzada — paralela em leilões, fechamentos, clientes, leads e
// empresas. Cada grupo retorna no máximo 5 itens. Sem resultados → grupos
// vazios (200). Auth: usa a sessão do navegador (RLS via cliente server-side).

export const dynamic = 'force-dynamic'

type Hit = { id: string; label: string; sub?: string; href: string }
type Payload = {
  leiloes: Hit[]
  fechamentos: Hit[]
  clientes: Hit[]
  leads: Hit[]
  empresas: Hit[]
}

type CompradorRow = { fazenda?: string; comprador?: string; cidade?: string; uf?: string }

const PER_GROUP = 5

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const empty: Payload = { leiloes: [], fechamentos: [], clientes: [], leads: [], empresas: [] }
  if (q.length < 2) return NextResponse.json(empty)

  const like = `%${q.replace(/[%_]/g, '\\$&')}%`
  const supabase = await createClient()

  const [leiloesRes, fechamentosRes, clientesRes, compradoresRes, leadsRes, empresasRes] = await Promise.all([
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
    // clientes cadastrados manualmente (overlay)
    supabase.from('clientes')
      .select('id, nome, cidade, uf, match_key')
      .ilike('nome', like)
      .limit(PER_GROUP),
    // compradores derivados dos fechamentos (scan do JSONB em memória)
    supabase.from('bula_leilao_fechamento')
      .select('compradores')
      .order('data', { ascending: false })
      .limit(120),
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

  // Clientes/compradores: manuais primeiro, depois compradores dos fechamentos,
  // deduplicados pela chave normalizada do nome.
  const termKey = clienteMatchKey(q)
  const seenCliente = new Set<string>()
  const clientesHits: Hit[] = []
  for (const r of (clientesRes.data ?? []) as Array<{ id: string; nome: string; cidade: string | null; uf: string | null; match_key: string | null }>) {
    const k = r.match_key || clienteMatchKey(r.nome)
    if (!k || seenCliente.has(k)) continue
    seenCliente.add(k)
    clientesHits.push({
      id: `m-${r.id}`,
      label: r.nome,
      sub: [r.cidade, r.uf].filter(Boolean).join(' / '),
      href: `/sistema/clientes?q=${encodeURIComponent(r.nome)}`,
    })
    if (clientesHits.length >= PER_GROUP) break
  }
  if (clientesHits.length < PER_GROUP && termKey) {
    for (const f of (compradoresRes.data ?? []) as Array<{ compradores: CompradorRow[] | null }>) {
      for (const c of f.compradores ?? []) {
        const nome = String(c.fazenda || c.comprador || '').trim()
        const k = clienteMatchKey(nome)
        if (!k || seenCliente.has(k) || !k.includes(termKey)) continue
        seenCliente.add(k)
        clientesHits.push({
          id: `f-${k.replace(/\s+/g, '-')}`,
          label: nome,
          sub: [c.cidade, c.uf].filter(Boolean).join(' / '),
          href: `/sistema/clientes?q=${encodeURIComponent(nome)}`,
        })
        if (clientesHits.length >= PER_GROUP) break
      }
      if (clientesHits.length >= PER_GROUP) break
    }
  }

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
    clientes: clientesHits,
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
