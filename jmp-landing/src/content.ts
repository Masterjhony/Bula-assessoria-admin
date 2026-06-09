// Conteúdo editável da landing, lido em runtime de /api/jmp/content (gerenciado
// pelo painel adminjmp). Mantemos um DEFAULT idêntico ao que a página mostrava
// hardcoded para servir de fallback (pré-fetch e offline) — a página nunca
// quebra. As URLs do default são relativas e resolvem no próprio host.

export interface JmpFoto {
  src: string
  alt: string
  objectPosition?: string
}

export interface JmpBlock {
  id: string
  flyerUrl: string
  flyerAlt: string
  subheading: string
  heading: string
  logoUrl?: string
  logoAlt?: string
  youtubeUrl?: string
  playlistLabel: string
  fotos: JmpFoto[]
}

export interface JmpContent {
  hero: { backgroundUrl: string; badge: string }
  whatsappGroupUrl: string
  blocks: JmpBlock[]
}

export const DEFAULT_CONTENT: JmpContent = {
  hero: {
    backgroundUrl: '/foto-bulinha-bg.jpeg',
    badge: 'Vagas limitadas · 13 e 14 de Junho',
  },
  whatsappGroupUrl: 'https://chat.whatsapp.com/JYxJPWfkoHHLZfosHlywN9',
  blocks: [
    {
      id: 'aparte-femeas',
      flyerUrl: '/flyer-13jun.png',
      flyerAlt: 'Leilão Virtual Bezerras Nelore JMP Premium · 13 de Junho',
      subheading: 'Sábado · 13 de Junho · 240 Bezerras FIV',
      heading: 'Aparte das Fêmeas',
      youtubeUrl: '',
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
      logoUrl: '/logo-touros-jmp.png',
      logoAlt: '10ª Leilão Nelore JMP — Touros',
      youtubeUrl: '',
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
