import { getContracts } from '@/app/sistema/actions/contracts'
import { ContractsView } from '@/components/admin/kanban/ContractsView'

export const dynamic = 'force-dynamic'

export default async function ContratosPage() {
  // Contratos foi movido para o ERP no briefing 2026-05-27. A URL segue em
  // /sistema/contratos para reaproveitar layout e actions; o item só aparece
  // no sidebar do ERP (não no menu público do /sistema), então fica privada
  // por descoberta — qualquer usuário autenticado do painel pode acessar.
  const contracts = await getContracts()
  return <ContractsView initialContracts={contracts} />
}
