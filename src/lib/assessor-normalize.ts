// Centralização de assessores conforme diretiva do chefe (2026-05-11).
// Pedro Barnabé e Matheus Amormino → atribuídos a Marcelo Carneiro em
// agregações cross-leilão (ranking, faturamento, comissão a pagar). O nome
// cru permanece em `bula_leilao_fechamento.por_assessor[]` para preservar
// histórico e permitir edição do fechamento original.

const DIACRITICS_RE = /[̀-ͯ]/g

const stripDiacritics = (s: string) =>
  s.normalize('NFD').replace(DIACRITICS_RE, '')

const CENTRALIZED_UNDER_MARCELO: ReadonlySet<string> = new Set([
  'pedro barnabe',
  'matheus amormino',
])

export const MARCELO_CARNEIRO = 'Marcelo Carneiro'

// Roster de assessores da Fórmula do Boi que geram conta a pagar 2% no ERP
// (chaves comparadas após stripDiacritics + lowercase, com `includes` para
// pegar variantes como "Bulinha (Felipe Andrade)").
const FDB_ROSTER_KEYS: ReadonlyArray<string> = [
  'bulinha',
  'marcelo carneiro',
]

export function normalizeAssessorNome(nome: string | null | undefined): string {
  const raw = (nome ?? '').trim()
  if (!raw) return ''
  const key = stripDiacritics(raw).toLowerCase()
  if (CENTRALIZED_UNDER_MARCELO.has(key)) return MARCELO_CARNEIRO
  return raw
}

// True quando o assessor (canônico ou original) integra o roster FdB.
// Aceita variantes como "Bulinha (Felipe Andrade)" via includes.
export function isFdbAssessor(nome: string | null | undefined): boolean {
  if (!nome) return false
  const key = stripDiacritics(nome.trim()).toLowerCase()
  if (!key) return false
  if (CENTRALIZED_UNDER_MARCELO.has(key)) return true
  return FDB_ROSTER_KEYS.some(roster => key.includes(roster))
}

// Lista de assessores originais que foram centralizados sob `canonical`.
// Usado nas UIs para discriminar (ex: "Marcelo Carneiro · inclui Pedro Barnabé").
export function originalAssessoresUnder(
  canonical: string,
  raws: Array<string | null | undefined>,
): string[] {
  if (canonical !== MARCELO_CARNEIRO) return []
  const out = new Set<string>()
  for (const r of raws) {
    if (!r) continue
    const k = stripDiacritics(r.trim()).toLowerCase()
    if (CENTRALIZED_UNDER_MARCELO.has(k)) out.add(r.trim())
  }
  return Array.from(out)
}
