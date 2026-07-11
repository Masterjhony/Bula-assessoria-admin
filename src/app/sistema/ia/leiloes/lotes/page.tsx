import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import LotesCatalogoClient from './LotesCatalogoClient'

export const dynamic = 'force-dynamic'

export default async function GaleriaLotesPage() {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/?next=/sistema/ia/leiloes/lotes')
  return <LotesCatalogoClient />
}
