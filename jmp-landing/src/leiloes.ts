// Os 3 pregões do 13º Mega Evento EAO Baviera (10 a 12 de julho de 2026).
//
// Fonte da verdade: tabela `cronograma_leiloes` / `bula_leiloes` do sistema
// (criador EAO, leiloeira PROGRAMA LEILÕES, comissão 0,33% do faturamento).
// Os catálogos são os PDFs já publicados no Storage do próprio sistema —
// não hospedamos cópia aqui.
//
// `id` é o valor persistido (CRM `extra_data.leiloes` e planilha), então NÃO
// renomeie sem migrar os leads já gravados. `label` é só exibição.

export interface Leilao {
  id: string
  /** Nome curto exibido no card e no checkbox. */
  label: string
  /** O que é vendido no pregão. */
  tipo: string
  /** ISO (YYYY-MM-DD) — usado para ordenar e formatar. */
  data: string
  /** "10/07" — já formatado, evita Intl/timezone na landing. */
  dataCurta: string
  diaSemana: string
  /** PDF público no Storage. Ausente = catálogo ainda não publicado. */
  catalogoUrl?: string
}

export const LEILOES: Leilao[] = [
  {
    id: 'aspiracoes',
    label: 'Aspirações',
    tipo: 'Embriões e aspirações',
    data: '2026-07-10',
    dataCurta: '10/07',
    diaSemana: 'Sexta-feira',
    catalogoUrl:
      'https://nfjkzigvxegnhaxxbevt.supabase.co/storage/v1/object/public/leilao-catalogos/eao-baviera-13/catalogo-aspiracoes-13-eao-baviera.pdf',
  },
  {
    id: 'femeas',
    label: 'Fêmeas',
    tipo: 'Matrizes, doadoras e bezerras',
    data: '2026-07-11',
    dataCurta: '11/07',
    diaSemana: 'Sábado',
    catalogoUrl:
      'https://nfjkzigvxegnhaxxbevt.supabase.co/storage/v1/object/public/leilao-catalogos/1782602917699-3sc89cjpngt-cat-logo-de-vendas-f-meas-13-eao-baviera.pdf',
  },
  {
    id: 'touros',
    label: 'Touros',
    tipo: 'Touros P.O.',
    data: '2026-07-12',
    dataCurta: '12/07',
    diaSemana: 'Domingo',
    catalogoUrl:
      'https://nfjkzigvxegnhaxxbevt.supabase.co/storage/v1/object/public/leilao-catalogos/1782602924435-ts059miofw-cat-logo-de-vendas-touros-13-eao-baviera.pdf',
  },
]

// Fundo do hero: filmagem aérea de drone da própria Bula (boiada Nelore em fila
// no pasto, luz da manhã). Origem: Drive da Bula, "Marketing e Growth/Fotos e
// Vídeos/Drone/DJI_0069.MP4" — recortado em 12s, 1280x720, sem áudio, ~1,6 MB.
//
// Vive no Storage e NÃO no bundle: 1,6 MB no /assets do build atrasaria o
// primeiro paint. O poster é o primeiro quadro e é o que a página pinta antes
// (e o único que ela pinta no mobile / com prefers-reduced-motion).
export const HERO_VIDEO_URL =
  'https://nfjkzigvxegnhaxxbevt.supabase.co/storage/v1/object/public/jmp-landing/eao/hero-boiada.mp4'
export const HERO_POSTER_URL =
  'https://nfjkzigvxegnhaxxbevt.supabase.co/storage/v1/object/public/jmp-landing/eao/hero-boiada-poster.webp'

/**
 * Texto legível dos leilões escolhidos, para o CRM (notes) e a planilha.
 * Ex.: "Fêmeas (11/07), Touros (12/07)".
 */
export function leiloesDescricao(ids: string[]): string {
  return LEILOES.filter((l) => ids.includes(l.id))
    .map((l) => `${l.label} (${l.dataCurta})`)
    .join(', ')
}
