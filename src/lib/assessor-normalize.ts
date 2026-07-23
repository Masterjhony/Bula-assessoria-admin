// Canonical assessor names used in cross-auction aggregations.
// Raw names remain stored in `bula_leilao_fechamento.por_assessor[]` so the
// original closing can still be audited and edited.

const DIACRITICS_RE = /[\u0300-\u036f]/g

const stripDiacritics = (s: string) =>
  s.normalize('NFD').replace(DIACRITICS_RE, '')

export const assessorKey = (s: string) =>
  stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const CENTRALIZED_UNDER_MARCELO: ReadonlySet<string> = new Set([
  'pedro barnabe',
  'matheus amormino',
])

export const MARCELO_CARNEIRO = 'Marcelo Carneiro'
export const FABIO_OMENA = 'Fabio Omena'

const CANONICAL_BY_KEY: ReadonlyMap<string, string> = new Map([
  ['fabio omena', FABIO_OMENA],
  ['fabio o mena', FABIO_OMENA],
  ['fabio omenna', FABIO_OMENA],
  // Leonardo Serafim aparece nos fechamentos também como apelido/parcial
  ['leo', 'Leonardo Serafim'],
  ['leo serafim', 'Leonardo Serafim'],
  ['leonardo', 'Leonardo Serafim'],
  // Dupla extinta: comissões passaram integralmente ao Leonardo (chefe, 22/07/2026)
  ['marcelo carneiro leonardo serafim', 'Leonardo Serafim'],
  // LM Assessoria = empresa do Leonardo (pagamentos podem sair nesse nome)
  ['lm assessoria', 'Leonardo Serafim'],
  // Grafia unificada (tabela de percentuais do chefe 22/07 usa "Matheus")
  ['mateus alves', 'Matheus Alves'],
  // Bulinha (Felipe Andrade) — várias grafias com/sem "Vilela"
  ['bulinha', 'Bulinha (Felipe Andrade)'],
  ['felipe andrade', 'Bulinha (Felipe Andrade)'],
  ['bulinha felipe andrade', 'Bulinha (Felipe Andrade)'],
  ['felipe andrade bulinha', 'Bulinha (Felipe Andrade)'],
  ['felipe vilela andrade', 'Bulinha (Felipe Andrade)'],
  ['felipe vilela andrade bulinha', 'Bulinha (Felipe Andrade)'],
])

// Formula do Boi assessors that generate the 2% payable in the ERP.
// Includes catches variants such as "Bulinha (Felipe Andrade)".
const FDB_ROSTER_KEYS: ReadonlyArray<string> = [
  'bulinha',
  'marcelo carneiro',
]

export function normalizeAssessorNome(nome: string | null | undefined): string {
  const raw = (nome ?? '').trim()
  if (!raw) return ''
  const key = assessorKey(raw)
  if (CENTRALIZED_UNDER_MARCELO.has(key)) return MARCELO_CARNEIRO
  const canonical = CANONICAL_BY_KEY.get(key)
  if (canonical) return canonical
  return raw
}

// True when the canonical or original assessor belongs to the FdB roster.
export function isFdbAssessor(nome: string | null | undefined): boolean {
  if (!nome) return false
  const key = assessorKey(nome.trim())
  if (!key) return false
  if (CENTRALIZED_UNDER_MARCELO.has(key)) return true
  return FDB_ROSTER_KEYS.some(roster => key.includes(roster))
}

// Original assessor names centralized under `canonical`, used by the UI labels.
export function originalAssessoresUnder(
  canonical: string,
  raws: Array<string | null | undefined>,
): string[] {
  if (canonical !== MARCELO_CARNEIRO) return []
  const out = new Set<string>()
  for (const r of raws) {
    if (!r) continue
    const k = assessorKey(r.trim())
    if (CENTRALIZED_UNDER_MARCELO.has(k)) out.add(r.trim())
  }
  return Array.from(out)
}
