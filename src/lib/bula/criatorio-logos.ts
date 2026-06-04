import type { StaticImageData } from 'next/image'
import fazendaCamparino from '../../../public/criatorios/fazenda-camparino.png'
import fazendaJacamim from '../../../public/criatorios/fazenda-jacamim.png'
import lsAgropecuaria from '../../../public/criatorios/ls-agropecuaria.png'
import neloreCachoeirao from '../../../public/criatorios/nelore-cachoeirao.png'
import neloreFloc from '../../../public/criatorios/nelore-floc.png'
import neloreFlorDoAratau from '../../../public/criatorios/nelore-flor-do-aratau.png'
import neloreJmp from '../../../public/criatorios/nelore-jmp.png'
import neloreKatayama from '../../../public/criatorios/nelore-katayama.png'
import neloreMno from '../../../public/criatorios/nelore-mno.png'
import neloreNfsf from '../../../public/criatorios/nelore-nfsf.png'
import neloreSantaNazare from '../../../public/criatorios/nelore-santa-nazare.png'
import neloreTresmar from '../../../public/criatorios/nelore-tresmar.png'
import santaNice from '../../../public/criatorios/santa-nice.png'
import terraBravaAgropecuaria from '../../../public/criatorios/terra-brava-agropecuaria.png'

/**
 * Logos dos criatorios indexados pelo slug do nome (igual ao nome do arquivo
 * sem extensao). Importados estaticamente para que o bundler emita os assets
 * com URL hasheada e garanta a entrega em producao - diferente de ler a pasta
 * public/ em runtime, que nao existe nas funcoes serverless da Vercel.
 */
export const CRIATORIO_LOGOS: Record<string, StaticImageData> = {
    'fazenda-camparino': fazendaCamparino,
    'fazenda-jacamim': fazendaJacamim,
    'ls-agropecuaria': lsAgropecuaria,
    'nelore-cachoeirao': neloreCachoeirao,
    'nelore-floc': neloreFloc,
    'nelore-flor-do-aratau': neloreFlorDoAratau,
    'nelore-jmp': neloreJmp,
    'nelore-katayama': neloreKatayama,
    'nelore-mno': neloreMno,
    'nelore-nfsf': neloreNfsf,
    'nelore-santa-nazare': neloreSantaNazare,
    'nelore-tresmar': neloreTresmar,
    'santa-nice': santaNice,
    'terra-brava-agropecuaria': terraBravaAgropecuaria,
}

/**
 * Slugs cujo arquivo de logo e a versao "branca" (arte clara sobre fundo
 * transparente), entregue pelo criatorio para uso em fundo escuro. Como a faixa
 * de marcas renderiza os logos sobre tiles brancos, esses precisam de invert(1)
 * no CSS para aparecerem em tom escuro - caso contrario ficariam invisiveis
 * (branco sobre branco). Mantem a faixa consistente com os logos coloridos.
 */
export const CRIATORIO_LOGOS_CLAROS = new Set<string>([
    'nelore-cachoeirao',
    'nelore-tresmar',
])
