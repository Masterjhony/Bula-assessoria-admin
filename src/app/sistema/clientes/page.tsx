import { ClientesClient } from '@/components/admin/clientes/ClientesClient'
import { getClientes, getClientesVgvSummary } from '@/app/sistema/actions/clientes'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Clientes · Bula Assessoria',
}

export default async function ClientesPage() {
  // Compradores reais agregados dos fechamentos + enriquecidos com o CRM.
  // VGV: soma de vgv_total (base do dashboard) + cobertura por comprador.
  const [clientes, vgvSummary] = await Promise.all([getClientes(), getClientesVgvSummary()])
  return <ClientesClient initialClientes={clientes} vgvSummary={vgvSummary} />
}
