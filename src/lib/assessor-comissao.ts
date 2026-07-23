// Percentuais FIXOS de comissão por assessor/parceiro sobre o VGV de cobertura
// (lance × 30). Tabela definida pelo chefe em 22/07/2026 (WhatsApp):
//   Fabio 2% · Douglas 2% · Bulinha 2% · Leonardo 2% · Rusa 5% ·
//   Lucas 0,33% · Matheus Alves 0,33%
// Obs.: até junho/2026 o Fábio operava a 3% — a tabela vale DALI EM DIANTE;
// fechamentos passados não são recalculados.

import { normalizeAssessorNome } from './assessor-normalize'

export const COMISSAO_PCT_PADRAO = 0.02

export const COMISSAO_PCT_POR_ASSESSOR: Readonly<Record<string, number>> = {
  'Fabio Omena': 0.02,
  'Douglas Bispo': 0.02,
  'Bulinha (Felipe Andrade)': 0.02,
  'Leonardo Serafim': 0.02,
  'Gustavo Rusa': 0.05,
  'Lucas Martins': 0.0033,
  'Matheus Alves': 0.0033,
}

/** % decimal de comissão do assessor (nome em qualquer grafia conhecida). */
export function comissaoPctAssessor(nome: string | null | undefined): number {
  const canonical = normalizeAssessorNome(nome)
  return COMISSAO_PCT_POR_ASSESSOR[canonical] ?? COMISSAO_PCT_PADRAO
}
