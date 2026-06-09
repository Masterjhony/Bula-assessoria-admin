import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase'
import AdminJmpClient from './AdminJmpClient'

// Painel de conteúdo da landing JMP. Servido em adminjmp.bulaassessoria.com
// (o proxy reescreve o host para esta rota). O middleware já bloqueia acesso
// sem login; aqui reforçamos no servidor.
export const dynamic = 'force-dynamic'

export default async function AdminJmpPage() {
  const user = await requireUser().catch(() => null)
  if (!user) redirect('/')
  return <AdminJmpClient />
}
