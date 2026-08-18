// Percentuais FIXOS de comissão por assessor/parceiro sobre o VGV de cobertura
// (lance × 30).
//
// Tabela vigente — grupo "Financeiro Bula Assessoria", 05/08/2026, palavras do
// João no grupo: "Bula, Douglas, Léo e Fábio 2% · Lucas, Laila e Valéria 1%".
// Ela SUBSTITUI a tabela de 22/07, em que Lucas e Matheus estavam a 0,33%.
//
// Regra separada para leilão da BULA REMATES (venda de PO): "será a mesma
// comissão do PO que a Bula Remates paga… 1% para todos que vendem na
// Assessoria" (mesmo grupo, 04–05/08) — ver COMISSAO_PCT_VENDA_PO.
//
// Obs.: até junho/2026 o Fábio operava a 3% — as tabelas valem para frente;
// fechamentos passados não são recalculados.

import { normalizeAssessorNome } from './assessor-normalize'

export const COMISSAO_PCT_PADRAO = 0.02

export const COMISSAO_PCT_POR_ASSESSOR: Readonly<Record<string, number>> = {
  'Fabio Omena': 0.02,
  'Douglas Bispo': 0.02,
  'Bulinha (Felipe Andrade)': 0.02,
  'Leonardo Serafim': 0.02,
  'Gustavo Rusa': 0.05,
  // 05/08/2026: passaram de 0,33% para 1%
  'Lucas Martins': 0.01,
  'Matheus Alves': 0.01,
  'Laila Oliveira': 0.01,
  'Valeria Borges': 0.01,
}

/**
 * Venda de PO em leilão da Bula Remates: 1% para todos, independentemente do
 * percentual do assessor na Assessoria (decisão de 04–05/08/2026).
 */
export const COMISSAO_PCT_VENDA_PO = 0.01

/** % decimal de comissão do assessor (nome em qualquer grafia conhecida). */
export function comissaoPctAssessor(nome: string | null | undefined, opts?: { vendaPo?: boolean }): number {
  if (opts?.vendaPo) return COMISSAO_PCT_VENDA_PO
  const canonical = normalizeAssessorNome(nome)
  return COMISSAO_PCT_POR_ASSESSOR[canonical] ?? COMISSAO_PCT_PADRAO
}
