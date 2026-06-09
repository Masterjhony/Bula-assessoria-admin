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

export interface JmpEmailAttachment {
  name: string
  url: string
}

export interface JmpWelcomeEmail {
  enabled: boolean
  subject: string
  body: string
  attachments: JmpEmailAttachment[]
}

// Um e-mail do fluxo de marketing (drip). Disparado por agendamento relativo
// ao cadastro (N dias depois) ou numa data fixa.
export interface JmpFlowEmail {
  id: string
  enabled: boolean
  subject: string
  body: string
  attachments: JmpEmailAttachment[]
  /** 'days' = N dias após o cadastro; 'date' = data fixa (YYYY-MM-DD). */
  scheduleType: 'days' | 'date'
  days: number
  date: string
  /** Hora local (0–23) do envio. */
  sendHour: number
}

export interface JmpContent {
  hero: { backgroundUrl: string; badge: string }
  whatsappGroupUrl: string
  welcomeEmail: JmpWelcomeEmail
  emailFlow: JmpFlowEmail[]
  blocks: JmpBlock[]
}

// Fluxo de e-mail marketing pré-montado (estrutura dos 6 e-mails da campanha
// JMP). Vem DESABILITADO — o painel adminjmp edita o texto e liga cada um. Os
// dois últimos saem em data fixa (dia de cada leilão); os demais, N dias após
// o cadastro.
const DEFAULT_EMAIL_FLOW: JmpFlowEmail[] = [
  { id: 'e1-boas-vindas', enabled: false, subject: 'Boas-vindas à Bula Assessoria', scheduleType: 'days', days: 1, date: '', sendHour: 9, attachments: [], body: 'Olá, {{nome}}!\n\n(edite este texto — apresentação da Bula Assessoria.)' },
  { id: 'e2-know-how', enabled: false, subject: 'Nós apartamos o gado — temos o know-how pra te indicar', scheduleType: 'days', days: 2, date: '', sendHour: 9, attachments: [], body: 'Olá, {{nome}}!\n\n(edite este texto — autoridade/know-how.)' },
  { id: 'e3-historia', enabled: false, subject: 'A história da Bula Assessoria com a JMP', scheduleType: 'days', days: 3, date: '', sendHour: 9, attachments: [], body: 'Olá, {{nome}}!\n\n(edite este texto — história Bula + JMP.)' },
  { id: 'e4-chegando', enabled: false, subject: 'Está chegando o grande dia — Leilões JMP', scheduleType: 'date', days: 0, date: '2026-06-12', sendHour: 9, attachments: [], body: 'Olá, {{nome}}!\n\n(edite este texto — contagem regressiva.)' },
  { id: 'e5-hoje-bezerras', enabled: false, subject: 'É hoje: Leilão de Bezerras JMP', scheduleType: 'date', days: 0, date: '2026-06-13', sendHour: 7, attachments: [], body: 'Olá, {{nome}}!\n\n(edite este texto — leilão de bezerras hoje.)' },
  { id: 'e6-hoje-touros', enabled: false, subject: 'É hoje: 10º Leilão de Touros JMP', scheduleType: 'date', days: 0, date: '2026-06-14', sendHour: 7, attachments: [], body: 'Olá, {{nome}}!\n\n(edite este texto — leilão de touros hoje.)' },
]

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
  welcomeEmail: {
    enabled: false,
    subject: 'Sua inscricao no Nelore JMP foi recebida',
    body: `Ola, {{nome}}!

Recebemos sua inscricao para receber a assessoria da Bula no leilao Nelore JMP.

Nossa equipe vai analisar seu perfil e chamar voce pelo WhatsApp {{whatsapp}} para orientar os proximos passos.

Enquanto isso, entre no grupo oficial para acompanhar os avisos:
{{whatsappGroupUrl}}

Atenciosamente,
Bula Assessoria`,
    attachments: [],
  },
  emailFlow: DEFAULT_EMAIL_FLOW,
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

function sanitizeAttachments(raw: unknown): JmpEmailAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((a) => {
      const ao = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>
      return { name: str(ao.name), url: str(ao.url) }
    })
    .filter((a) => a.url)
    .map((a) => ({ name: a.name || a.url.split('/').pop() || 'anexo', url: a.url }))
}

function sanitizeFlowEmail(raw: unknown, i: number): JmpFlowEmail {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const scheduleType = o.scheduleType === 'date' ? 'date' : 'days'
  const daysNum = Number(o.days)
  const hourNum = Number(o.sendHour)
  return {
    id: str(o.id) || `email-${i + 1}`,
    enabled: o.enabled === true,
    subject: str(o.subject),
    body: str(o.body),
    attachments: sanitizeAttachments(o.attachments),
    scheduleType,
    days: Number.isFinite(daysNum) ? Math.max(0, Math.round(daysNum)) : 0,
    date: str(o.date),
    sendHour: Number.isFinite(hourNum) ? Math.min(23, Math.max(0, Math.round(hourNum))) : 9,
  }
}

/**
 * Normaliza qualquer objeto vindo do cliente/banco para o formato JmpContent,
 * descartando campos desconhecidos. Garante que a SPA nunca quebre por dado
 * malformado.
 */
export function sanitizeContent(raw: unknown): JmpContent {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const heroRaw = (obj.hero && typeof obj.hero === 'object' ? obj.hero : {}) as Record<string, unknown>
  const welcomeEmailRaw = (obj.welcomeEmail && typeof obj.welcomeEmail === 'object' ? obj.welcomeEmail : {}) as Record<string, unknown>
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
    welcomeEmail: {
      enabled: typeof welcomeEmailRaw.enabled === 'boolean'
        ? welcomeEmailRaw.enabled
        : DEFAULT_JMP_CONTENT.welcomeEmail.enabled,
      subject: str(welcomeEmailRaw.subject, DEFAULT_JMP_CONTENT.welcomeEmail.subject),
      body: str(welcomeEmailRaw.body, DEFAULT_JMP_CONTENT.welcomeEmail.body),
      attachments: sanitizeAttachments(welcomeEmailRaw.attachments),
    },
    emailFlow: Array.isArray(obj.emailFlow)
      ? obj.emailFlow.map(sanitizeFlowEmail)
      : DEFAULT_JMP_CONTENT.emailFlow,
    blocks: blocks.length ? blocks : DEFAULT_JMP_CONTENT.blocks,
  }
}
