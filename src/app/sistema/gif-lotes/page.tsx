import { createClient } from '@/utils/supabase/server'
import GifLotesClient, { type LeilaoOption } from './GifLotesClient'

export const dynamic = 'force-dynamic'

export default async function GifLotesPage() {
  const supabase = await createClient()
  const desde = new Date()
  desde.setDate(desde.getDate() - 30)
  const { data } = await supabase
    .from('bula_leiloes')
    .select('id, nome, data, catalogo_url')
    .gte('data', desde.toISOString().slice(0, 10))
    .order('data', { ascending: true })

  return <GifLotesClient leiloes={(data ?? []) as LeilaoOption[]} />
}
