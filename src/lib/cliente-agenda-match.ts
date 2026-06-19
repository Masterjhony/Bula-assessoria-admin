// ─────────────────────────────────────────────────────────────────────────────
// MATCH agenda de leilões ↔ cliente.
// Pontua os leilões futuros (agenda `bula_leiloes`) contra as preferências do
// cliente (categorias de compra, interesses, UF e momento na pecuária) para
// recomendar quais leilões fazem sentido oferecer a cada cliente.
// Função pura — a fonte de dados (server action) passa os leilões já carregados.
// ─────────────────────────────────────────────────────────────────────────────

import type { Cliente, Interesse, PreferenciaCategoria } from '@/lib/clientes'

export interface AgendaLeilao {
  id: string
  nome: string
  data: string // ISO yyyy-mm-dd
  tipo?: string // raça/categoria
  local?: string
  leiloeira?: string
  horario?: string
  status?: string
}

export interface AgendaMatch {
  leilao: AgendaLeilao
  score: number
  motivos: string[]
}

function norm(s: string | undefined | null): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
}

// palavras-chave por categoria de preferência e por interesse.
const CAT_KEYWORDS: Record<PreferenciaCategoria, string[]> = {
  Bezerros: ['bezerr', 'desmam'],
  Novilhas: ['novilh'],
  Vacas: ['vaca', 'matriz', 'femea', 'prenhe', 'doadora'],
  Touros: ['touro', 'reprodutor'],
  Embriões: ['embri'],
  Sêmen: ['semen', 'dose'],
}
const INT_KEYWORDS: Record<Interesse, string[]> = {
  Sêmen: ['semen', 'dose'],
  Embriões: ['embri'],
  Touros: ['touro', 'reprodutor'],
  Matrizes: ['matriz', 'femea', 'vaca', 'prenhe', 'doadora'],
  Leilões: [],
}

/** Pontua um leilão para um cliente. score 0 = sem afinidade. */
export function scoreLeilaoForCliente(cliente: Cliente, leilao: AgendaLeilao): AgendaMatch {
  const haystack = norm(`${leilao.nome} ${leilao.tipo || ''} ${leilao.local || ''}`)
  const motivos: string[] = []
  let score = 0

  for (const cat of cliente.preferenciasCategorias ?? []) {
    if ((CAT_KEYWORDS[cat] || []).some((k) => haystack.includes(k))) {
      score += 3
      motivos.push(`Preferência: ${cat}`)
    }
  }
  for (const intr of cliente.interesses ?? []) {
    if ((INT_KEYWORDS[intr] || []).some((k) => haystack.includes(k))) {
      score += 2
      motivos.push(`Interesse: ${intr}`)
    }
  }
  // proximidade geográfica (UF do cliente aparece no local do leilão)
  const uf = norm(cliente.uf)
  if (uf && uf.length === 2 && norm(leilao.local).includes(uf)) {
    score += 1
    motivos.push(`Mesma UF (${cliente.uf})`)
  }

  return { leilao, score, motivos: [...new Set(motivos)] }
}

/** Ordena e filtra os leilões futuros mais aderentes ao cliente. */
export function matchAgendaToCliente(cliente: Cliente, leiloes: AgendaLeilao[], limit = 6): AgendaMatch[] {
  return leiloes
    .map((l) => scoreLeilaoForCliente(cliente, l))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.leilao.data.localeCompare(b.leilao.data))
    .slice(0, limit)
}
