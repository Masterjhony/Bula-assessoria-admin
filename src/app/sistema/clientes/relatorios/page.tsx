import { ClientesRelatoriosClient } from '@/components/admin/clientes/ClientesRelatoriosClient'
import { getClientes } from '@/app/sistema/actions/clientes'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Relatórios de Clientes · Bula Assessoria',
}

export default async function ClientesRelatoriosPage() {
  // Mesma fonte da lista de Clientes e da Carteira: um recorte diferente do
  // mesmo dado, nunca uma segunda apuração.
  const clientes = await getClientes()
  return <ClientesRelatoriosClient initialClientes={clientes} />
}
