import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { montarLeiloesAnalise } from '@/lib/leilao-analise'
import LeiloesAnaliseClient from './LeiloesAnaliseClient'

export const dynamic = 'force-dynamic'

export default async function AnaliseLeiloesPage() {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/?next=/sistema/ia/leiloes')

  const supabase = await createClient()
  let rows: Awaited<ReturnType<typeof montarLeiloesAnalise>>['rows'] = []
  let vpsOnline = false
  let erro: string | null = null
  try {
    const r = await montarLeiloesAnalise(supabase)
    rows = r.rows
    vpsOnline = r.vpsOnline
  } catch (e) {
    erro = (e as Error).message
  }

  return <LeiloesAnaliseClient initialRows={rows} vpsOnline={vpsOnline} erro={erro} />
}
