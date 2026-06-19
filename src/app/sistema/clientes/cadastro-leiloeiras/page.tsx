import { CadastroLeiloeirasClient } from '@/components/admin/clientes/CadastroLeiloeirasClient'
import { getLeiloeiras } from '@/app/sistema/actions/leiloeiras'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cadastro Leiloeiras · Bula Assessoria' }

export default async function Page() {
  const leiloeiras = await getLeiloeiras()
  return <CadastroLeiloeirasClient initial={leiloeiras} />
}
