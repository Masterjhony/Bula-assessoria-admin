import { getContracts } from '@/app/sistema/actions/contracts'
import { ContractsView } from '@/components/admin/kanban/ContractsView'

export const dynamic = 'force-dynamic'

export default async function ContratosPage() {
  // ClickSign foi removido nesta migração — contratos são gerenciados via
  // upload manual de PDF. O sync automático com a plataforma ClickSign
  // ficou no sistema legado.
  const contracts = await getContracts()
  return <ContractsView initialContracts={contracts} />
}
