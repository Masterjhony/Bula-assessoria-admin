import { ClientesClient } from '@/components/admin/clientes/ClientesClient'
import { getClientes } from '@/app/sistema/actions/clientes'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Clientes · Bula Assessoria',
}

export default async function ClientesPage() {
  // Compradores reais agregados dos fechamentos + enriquecidos com o CRM.
  const clientes = await getClientes()
  return <ClientesClient initialClientes={clientes} />
}
