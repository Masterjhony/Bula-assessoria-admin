import { MercadoClient } from '@/components/admin/mercado/MercadoClient'
import { getMercado } from '@/app/sistema/actions/mercado'

export const dynamic = 'force-dynamic'

export const metadata = {
    title: 'Radar de Mercado · Bula Assessoria',
}

export default async function MercadoPage() {
    // Agenda pública das leiloeiras × cronograma da Bula. O produto da tela é o
    // GAP: leilão do mercado que não passa por nós.
    const dados = await getMercado()
    return <MercadoClient dados={dados} />
}
