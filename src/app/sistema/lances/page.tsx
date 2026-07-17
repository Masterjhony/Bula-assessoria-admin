import { getLancesPregao } from '../actions/lances'
import { LancesClient } from './LancesClient'

export const dynamic = 'force-dynamic'

export default async function LancesPage() {
    const data = await getLancesPregao()
    return <LancesClient initial={data} />
}
