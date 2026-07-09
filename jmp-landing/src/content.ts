// Conteúdo editável da landing, lido em runtime de /api/jmp/content (gerenciado
// pelo painel adminjmp). Mantemos um DEFAULT idêntico ao que a página mostrava
// hardcoded para servir de fallback (pré-fetch e offline) — a página nunca
// quebra. As URLs do default são relativas e resolvem no próprio host.

export interface JmpFoto {
  src: string
  alt: string
  objectPosition?: string
}

export interface JmpBenefit {
  text: string
  strong?: boolean
}

export interface JmpStat {
  value: string
  label: string
}

export interface JmpHero {
  backgroundUrl: string
  badge: string
  headline: string
  valueProp: string
  valuePropStrong: string
  benefitsTitle: string
  benefits: JmpBenefit[]
  stats: JmpStat[]
  locationLine1: string
  locationLine2: string
}

export interface JmpBlock {
  id: string
  flyerUrl: string
  flyerAlt: string
  subheading: string
  heading: string
  description?: string
  logoUrl?: string
  logoAlt?: string
  youtubeUrl?: string
  /** Título exibido acima da capa da playlist. */
  playlistTitle?: string
  /** Imagem de capa da playlist (clicável → redireciona ao YouTube). */
  playlistCoverUrl?: string
  playlistLabel: string
  fotos: JmpFoto[]
}

export interface JmpContent {
  hero: JmpHero
  whatsappGroupUrl: string
  blocks: JmpBlock[]
}

export const DEFAULT_CONTENT: JmpContent = {
  hero: {
    backgroundUrl: '/foto-leilao-eao.jpeg',
    badge: 'ASSESSORIA GRATUITA · 09 A 12 DE JULHO',
    headline: 'Compre bem no\nMega Baviera com\na Bula ao seu lado.',
    valueProp: 'A equipe de assessores da Bula te ajuda a entender a genética, escolher os animais certos e dar o lance certo no 13º Mega Baviera.',
    valuePropStrong: 'Assessoria gratuita. Sem compromisso.',
    benefitsTitle: 'Uma Equipe de\nAssessores do Seu\nLado no Mega Baviera',
    benefits: [
      { text: 'Assessoria de compra 100% gratuita', strong: true },
      { text: 'Equipe de assessores com você no pregão' },
      { text: 'Leitura da genética e dos números do catálogo' },
      { text: 'Ajuda pra escolher os animais certos pro seu rebanho' },
      { text: 'Apoio na habilitação e no pós-leilão', strong: true },
    ],
    stats: [
      { value: 'GRÁTIS', label: 'ASSESSORIA DE COMPRA' },
      { value: '09–12 JUL', label: 'MEGA BAVIERA' },
    ],
    locationLine1: 'Itagibá / BA',
    locationLine2: 'Fazenda Baviera',
  },
  whatsappGroupUrl: 'https://chat.whatsapp.com/JYxJPWfkoHHLZfosHlywN9',
  blocks: [
    {
      id: 'aparte-femeas',
      flyerUrl: '/flyer-13jun.png',
      flyerAlt: 'Leilão Virtual Bezerras Nelore JMP Premium · 13 de Junho',
      subheading: 'Sábado · 13 de Junho · 240 Bezerras FIV',
      heading: 'Aparte das Fêmeas',
      description: 'A Bula Assessoria foi responsável pelo aparte das 240 Bezerras PO do Nelore JMP.\n100% oriundas de FIV e apartado a cabeceira da safra.\nConfira as fotos e vídeos do aparte:',
      logoUrl: '/logo-bezerras-jmp.png',
      logoAlt: 'Bezerras Nelore JMP Premium — Leilão Virtual',
      youtubeUrl: 'https://youtube.com/playlist?list=PLt9laFwNTQnr4XjIq0ZC2SuMOwrNslpUL',
      playlistTitle: 'Veja a playlist de vídeos do aparte:',
      playlistCoverUrl: '/capa-playlist-femeas.jpg',
      playlistLabel: 'Playlist YouTube — fêmeas',
      fotos: [
        { src: '/galeria-femeas/IMG_0062.jpg', alt: 'Aparte das fêmeas — Leilão Nelore JMP' },
        { src: '/galeria-femeas/IMG_0106.jpg', alt: 'Aparte das fêmeas — Leilão Nelore JMP' },
        { src: '/galeria-femeas/IMG_0109.jpg', alt: 'Aparte das fêmeas — Leilão Nelore JMP' },
        { src: '/galeria-femeas/IMG_0117.jpg', alt: 'Aparte das fêmeas — Leilão Nelore JMP', objectPosition: 'top' },
      ],
    },
    {
      id: 'aparte-touros',
      flyerUrl: '/flyer-14jun.png',
      flyerAlt: '10º Leilão Nelore JMP · 1000 Touros · 14 de Junho',
      subheading: 'Domingo · 14 de Junho · 1.000 Touros PO',
      heading: 'Aparte dos Touros',
      description: 'A Bula Assessoria foi responsável pelo aparte de 1.000 touros JMP.\nA cabeceira da safra!\nConfira as fotos e vídeos do aparte:',
      logoUrl: '/logo-touros-jmp.png',
      logoAlt: '10ª Leilão Nelore JMP — Touros',
      youtubeUrl: 'https://youtube.com/playlist?list=PLt9laFwNTQnq-2s4n0lImJfw22kC5V4kq',
      playlistTitle: 'Veja a playlist de vídeos do aparte:',
      playlistCoverUrl: '/capa-playlist-touros.jpg',
      playlistLabel: 'Playlist YouTube — touros',
      fotos: [
        { src: '/galeria-touros/IMG_0003.jpg', alt: 'Aparte dos touros — Leilão Nelore JMP' },
        { src: '/galeria-touros/IMG_0006.jpg', alt: 'Aparte dos touros — Leilão Nelore JMP' },
        { src: '/galeria-touros/IMG_0037.jpg', alt: 'Aparte dos touros — Leilão Nelore JMP' },
        { src: '/galeria-touros/IMG_0059.jpg', alt: 'Aparte dos touros — Leilão Nelore JMP' },
      ],
    },
  ],
}

/** Busca o conteúdo publicado. Em qualquer erro, devolve o default. */
export async function fetchContent(): Promise<JmpContent> {
  try {
    const res = await fetch('/api/jmp/content', { cache: 'no-store' })
    if (!res.ok) return DEFAULT_CONTENT
    const data = (await res.json()) as JmpContent
    if (!data || !Array.isArray(data.blocks)) return DEFAULT_CONTENT
    return data
  } catch {
    return DEFAULT_CONTENT
  }
}

/** Converte uma URL/ID do YouTube em URL de embed; null se vazio/ inválido. */
export function youtubeEmbed(url?: string): string | null {
  if (!url) return null
  const list = url.match(/[?&]list=([\w-]+)/)
  if (list) return `https://www.youtube.com/embed/videoseries?list=${list[1]}`
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)
  const id = m ? m[1] : /^[\w-]{11}$/.test(url) ? url : null
  return id ? `https://www.youtube.com/embed/${id}` : null
}

/** Link público (no YouTube) para a playlist/vídeo; null se vazio/inválido. */
export function youtubeLink(url?: string): string | null {
  if (!url) return null
  const list = url.match(/[?&]list=([\w-]+)/)
  if (list) return `https://www.youtube.com/playlist?list=${list[1]}`
  if (/^https?:\/\//.test(url)) return url
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)
  const id = m ? m[1] : /^[\w-]{11}$/.test(url) ? url : null
  return id ? `https://www.youtube.com/watch?v=${id}` : null
}
