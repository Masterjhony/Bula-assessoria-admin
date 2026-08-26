import { CarteiraClient } from '@/components/admin/clientes/CarteiraClient'
import { getClientes, getAssessoresRoster } from '@/app/sistema/actions/clientes'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Carteira de Assessores · Bula Assessoria',
}

export default async function CarteiraPage() {
  // Mesma fonte da lista de Clientes — a carteira é um corte dela, não outra
  // apuração. O roster vem da Escala para que assessor sem cliente apareça.
  const [clientes, roster] = await Promise.all([getClientes(), getAssessoresRoster()])
  return <CarteiraClient initialClientes={clientes} roster={roster} />
}
