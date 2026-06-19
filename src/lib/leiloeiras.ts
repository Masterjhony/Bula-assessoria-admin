// ─────────────────────────────────────────────────────────────────────────────
// LEILOEIRAS parceiras — tipos e helpers.
// Registro das leiloeiras onde os clientes aprovados são cadastrados. Cada
// leiloeira tem um e-mail que recebe a submissão de cadastro e um conjunto de
// requisitos (exige I.E.? score mínimo? quais documentos?). A fonte de dados é
// `src/app/sistema/actions/leiloeiras.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export interface LeiloeiraRequisitos {
  requireIe: boolean
  scoreMin: number // 0 = sem mínimo
  documentos: string[] // ex.: ['CPF', 'Comprovante de endereço', 'Inscrição Estadual']
}

export interface Leiloeira {
  id: string
  nome: string
  emailCadastro: string
  contato: string
  requisitos: LeiloeiraRequisitos
  observacoes: string
  ativo: boolean
  createdAt?: string
}

export type CadastroStatus = 'pendente' | 'enviado' | 'aprovado' | 'recusado'

// Status do cadastro de um cliente em uma leiloeira específica.
export interface ClienteLeiloeiraStatus {
  leiloeiraId: string
  status: CadastroStatus
  enviadoAt?: string
  aprovadoAt?: string
}

export const DEFAULT_REQUISITOS: LeiloeiraRequisitos = {
  requireIe: true,
  scoreMin: 700,
  documentos: ['CPF', 'Comprovante de endereço', 'Inscrição Estadual'],
}

export const CADASTRO_STATUS_META: Record<CadastroStatus, { label: string; tone: string }> = {
  pendente: { label: 'Pendente', tone: '' },
  enviado: { label: 'Enviado', tone: 'amber' },
  aprovado: { label: 'Aprovado', tone: 'olive' },
  recusado: { label: 'Recusado', tone: 'red' },
}

export function coerceRequisitos(v: unknown): LeiloeiraRequisitos {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    requireIe: o.requireIe !== false,
    scoreMin: Number(o.scoreMin) || 0,
    documentos: Array.isArray(o.documentos) ? o.documentos.map((x) => String(x)).filter(Boolean) : [],
  }
}
