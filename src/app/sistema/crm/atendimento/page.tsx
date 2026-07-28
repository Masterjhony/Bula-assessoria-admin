import { MotorClient } from '@/components/admin/atendimento/MotorClient'
import { getMotorPainel } from '@/app/sistema/actions/atendimento-motor'

export const dynamic = 'force-dynamic'

export const metadata = {
    title: 'Atendimento automático · Bula Assessoria',
}

export default async function AtendimentoMotorPage() {
    // A fila do dia ANTES de virar mensagem — é o que torna o motor confiável.
    const dados = await getMotorPainel()
    return <MotorClient dados={dados} />
}
