// Modelo de conteúdo editável da landing "Nelore JMP" (jmp.bulaassessoria.com).
//
// É a fonte de verdade compartilhada entre:
//   - o painel adminjmp.* (edita e salva)
//   - a API pública GET /api/jmp/content (entrega para a SPA)
//   - a própria SPA (jmp-landing), que tem uma cópia equivalente como fallback.
//
// O conteúdo é gravado como UM registro JSONB em public.jmp_landing_content
// (id='default'). Imagens vivem no bucket público `jmp-landing` do Supabase
// Storage; aqui guardamos só as URLs.

export interface JmpFoto {
  src: string
  alt: string
  /** CSS object-position (ex.: "top") para ajustar o corte da miniatura. */
  objectPosition?: string
}

export interface JmpBlock {
  /** slug usado como âncora da seção (ex.: "aparte-femeas"). */
  id: string
  flyerUrl: string
  flyerAlt: string
  subheading: string
  heading: string
  logoUrl?: string
  logoAlt?: string
  /** URL ou ID de vídeo/playlist do YouTube. Vazio = mostra placeholder. */
  youtubeUrl?: string
  playlistLabel: string
  fotos: JmpFoto[]
}

export interface JmpContent {
  hero: { backgroundUrl: string; badge: string }
  whatsappGroupUrl: string
  blocks: JmpBlock[]
}

// Conteúdo padrão = exatamente o que a página mostrava hardcoded. Serve de
// fallback (registro ausente / API fora) e de base para o merge. As URLs aqui
// são relativas — resolvem no próprio host da landing. O seed inicial sobe
// essas imagens para o Storage e grava URLs absolutas no registro.
export const DEFAULT_JMP_CONTENT: JmpContent = {
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

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/**
 * Normaliza qualquer objeto vindo do cliente/banco para o formato JmpContent,
 * descartando campos desconhecidos. Garante que a SPA nunca quebre por dado
 * malformado.
 */
export function sanitizeContent(raw: unknown): JmpContent {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const heroRaw = (obj.hero && typeof obj.hero === 'object' ? obj.hero : {}) as Record<string, unknown>
  const blocksRaw = Array.isArray(obj.blocks) ? obj.blocks : []

  const blocks: JmpBlock[] = blocksRaw.map((b, i) => {
    const bo = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>
    const fotosRaw = Array.isArray(bo.fotos) ? bo.fotos : []
    const fotos: JmpFoto[] = fotosRaw
      .map((f) => {
        const fo = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
        const foto: JmpFoto = { src: str(fo.src), alt: str(fo.alt) }
        if (typeof fo.objectPosition === 'string' && fo.objectPosition) foto.objectPosition = fo.objectPosition
        return foto
      })
      .filter((f) => f.src)
    const block: JmpBlock = {
      id: str(bo.id) || `bloco-${i + 1}`,
      flyerUrl: str(bo.flyerUrl),
      flyerAlt: str(bo.flyerAlt),
      subheading: str(bo.subheading),
      heading: str(bo.heading),
      youtubeUrl: str(bo.youtubeUrl),
      playlistLabel: str(bo.playlistLabel, 'Playlist YouTube'),
      fotos,
    }
    if (typeof bo.logoUrl === 'string' && bo.logoUrl) block.logoUrl = bo.logoUrl
    if (typeof bo.logoAlt === 'string' && bo.logoAlt) block.logoAlt = bo.logoAlt
    return block
  })

  return {
    hero: {
      backgroundUrl: str(heroRaw.backgroundUrl, DEFAULT_JMP_CONTENT.hero.backgroundUrl),
      badge: str(heroRaw.badge, DEFAULT_JMP_CONTENT.hero.badge),
    },
    whatsappGroupUrl: str(obj.whatsappGroupUrl, DEFAULT_JMP_CONTENT.whatsappGroupUrl),
    blocks: blocks.length ? blocks : DEFAULT_JMP_CONTENT.blocks,
  }
}
