import { notFound } from 'next/navigation'
import { getContracts } from '@/app/sistema/actions/contracts'
import { ContractsView } from '@/components/admin/kanban/ContractsView'
import { getIsFinanceAdmin } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

export default async function ContratosPage() {
  // Contratos foram movidos para o ERP (briefing 2026-05-27). A página
  // segue acessível em /sistema/contratos para preservar links existentes,
  // mas só renderiza para administradores financeiros — fora desse grupo
  // retorna 404 para que a rota fique efetivamente privada.
  if (!(await getIsFinanceAdmin())) notFound()
  const contracts = await getContracts()
  return <ContractsView initialContracts={contracts} />
}
