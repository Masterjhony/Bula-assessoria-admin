// ─────────────────────────────────────────────────────────────────────────────
// CLIENTES (compradores) — tipos e utilitários.
// A fonte de dados real é `getClientes()` em
// `src/app/sistema/actions/clientes.ts` (agregação dos fechamentos + CRM).
// Este arquivo guarda apenas o shape `Cliente` e helpers de formatação/derivação.
// ─────────────────────────────────────────────────────────────────────────────

import type { CadastroStatus } from '@/lib/leiloeiras'

export type ClienteStatus = 'ativo' | 'quente' | 'frio' | 'inativo'
export type PerfilConsumo = 'Premium' | 'Recorrente' | 'Ocasional' | 'Novo'
export type Interesse = 'Sêmen' | 'Embriões' | 'Touros' | 'Matrizes' | 'Leilões'
// Preferências de compra do cliente (categorias de animal/genética).
export type PreferenciaCategoria = 'Bezerros' | 'Novilhas' | 'Vacas' | 'Touros' | 'Embriões' | 'Sêmen'

export const INTERESSES: Interesse[] = ['Sêmen', 'Embriões', 'Touros', 'Matrizes', 'Leilões']
export const STATUSES: ClienteStatus[] = ['ativo', 'quente', 'frio', 'inativo']
export const PERFIS: PerfilConsumo[] = ['Premium', 'Recorrente', 'Ocasional', 'Novo']
export const PREFERENCIA_CATEGORIAS: PreferenciaCategoria[] = ['Bezerros', 'Novilhas', 'Vacas', 'Touros', 'Embriões', 'Sêmen']

export interface CompraHist {
  id: string
  data: string // ISO yyyy-mm-dd
  descricao: string
  leilao?: string
  categoria: Interesse
  cabecas?: number
  valor: number
}

export interface InteracaoHist {
  id: string
  data: string // ISO yyyy-mm-dd
  tipo: 'WhatsApp' | 'Ligação' | 'E-mail' | 'Visita' | 'Reunião'
  responsavel: string
  nota: string
}

// Faixa de score de crédito (modelo Serasa-like 0..1000).
export type ScoreFaixa = 'baixo' | 'regular' | 'razoavel' | 'bom' | 'otimo' | ''

// Um protesto encontrado no nome/CPF (origem: provedor de crédito).
export interface Protesto {
  cartorio?: string
  cidade?: string
  uf?: string
  valor?: number
  data?: string // ISO yyyy-mm-dd
  titulo?: string
}

// Documento anexado ao cliente (metadados; arquivo no bucket cliente-documentos).
export interface ClienteDocumento {
  id: string
  tipo: string // cpf | comprovante | ie | contrato | outro
  nomeArquivo: string
  path: string
  tamanhoBytes: number
  contentType: string
  createdAt: string
}

/**
 * Vínculo do cliente com uma leiloeira parceira (linha de
 * `cliente_leiloeira_cadastro` já resolvida com o NOME da leiloeira).
 * `status === 'aprovado'` é o que significa "habilitado a comprar" naquela casa.
 */
export interface ClienteLeiloeiraVinculo {
  id: string
  nome: string
  status: CadastroStatus
  enviadoAt?: string
  aprovadoAt?: string
}

export interface Cliente {
  id: string
  nome: string
  responsavel: string
  telefone: string
  email?: string
  cidade: string
  uf: string
  perfil: PerfilConsumo
  interesses: Interesse[]
  status: ClienteStatus
  recorrente: boolean
  tags: string[]
  observacoes?: string
  preferencias?: string
  // Preferências de compra estruturadas (multi-seleção).
  preferenciasCategorias?: PreferenciaCategoria[]
  proximoFollowup?: string
  compras: CompraHist[]
  interacoes: InteracaoHist[]
  // Vínculo com o CRM (quando o comprador também é um lead cadastrado).
  crmLeadId?: string
  // Chave normalizada (nome) usada para deduplicar fechamentos × cadastro manual
  // e para anexar interações persistidas.
  matchKey?: string
  // id da linha em `public.clientes` quando o cliente foi cadastrado/editado à mão.
  clienteRowId?: string
  // De onde o registro veio: agregado dos fechamentos, cadastrado à mão, ou só CRM.
  origem?: 'fechamento' | 'manual' | 'crm'
  // Assessor responsável (pisteiro dos lotes no HastaPro; editável na ficha).
  assessor?: string

  // ── Dados de cadastro p/ leiloeiras (overlay manual / vindo do CRM) ──
  cpf?: string
  inscricaoEstadual?: string
  temInscricaoEstadual?: string // 'Sim' | 'Não' | ''
  scoreCredito?: number // 0..1000
  scoreFaixa?: ScoreFaixa
  scoreConsultadoAt?: string
  protestos?: Protesto[]
  protestosConsultadoAt?: string
  momentoPecuaria?: string
  operacaoPecuaria?: string
  // Documentos anexados (carregados sob demanda no drawer).
  documentos?: ClienteDocumento[]
  // Agregados carregados junto da lista (para cards/tabela/lista).
  docsCount?: number
  leiloeirasAprovadas?: number
  // Vínculos com as leiloeiras (todos os status; 'aprovado' = habilitado a comprar).
  leiloeiras?: ClienteLeiloeiraVinculo[]
}

// Prontidão do cliente para cadastro em leiloeiras.
export type ClienteReadiness = 'apto' | 'pendente' | 'sem-dados'

export const READINESS_META: Record<ClienteReadiness, { label: string; tone: string }> = {
  apto: { label: 'Apto', tone: 'olive' },
  pendente: { label: 'Pendente', tone: 'amber' },
  'sem-dados': { label: 'Sem dados', tone: '' },
}

// Normaliza um nome para a chave de deduplicação/anexo (sem acentos, minúsculo).
export function clienteMatchKey(nome: string | null | undefined): string {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * O campo `fazenda` do fechamento vem do HastaPro e MUITAS vezes é um
 * marcador de pendência ("Confirmar Fazenda", ".", "A identificar"), não o
 * nome de uma propriedade. Usar isso como chave funde pessoas diferentes num
 * cliente só — foi o que fazia "Confirmar Fazenda" aparecer comprando R$ 1,35
 * milhão (32 compradores distintos colapsados, 18/08/2026).
 *
 * Regra: fazenda só vale como identidade se NÃO for placeholder; senão manda
 * o nome do comprador. Sem nenhum dos dois, o registro não vira cliente.
 */
const PLACEHOLDER_COMPRADOR = new Set([
  '', 'a identificar', 'a definir', 'confirmar', 'confirmar fazenda', 'fazenda confirmar',
  'nao identificado', 'sem fazenda', 'sem comprador', 'comprador', 'fazenda', 'x', 'xx', 'na', 'nd',
])

export function ehNomeCompradorPlaceholder(nome: string | null | undefined): boolean {
  const k = clienteMatchKey(nome)
  if (!k || k.length < 3) return true            // ".", "-", "AB"
  if (PLACEHOLDER_COMPRADOR.has(k)) return true
  if (/^confirmar\b/.test(k)) return true        // "confirmar fazenda joao"
  return false
}

/** Identidade do comprador num fechamento: fazenda válida > comprador > null. */
export function nomeCompradorCanonico(
  fazenda: string | null | undefined,
  comprador: string | null | undefined,
): string | null {
  const faz = String(fazenda ?? '').trim()
  const cmp = String(comprador ?? '').trim()
  if (faz && !ehNomeCompradorPlaceholder(faz)) return faz
  if (cmp && !ehNomeCompradorPlaceholder(cmp)) return cmp
  return null
}

// Métricas derivadas para não duplicar fonte de verdade.
export interface ClienteMetrics {
  totalComprado: number
  numCompras: number
  ticketMedio: number
  ultimaCompra?: string
  ultimaInteracao?: string
}

export function clienteMetrics(c: Cliente): ClienteMetrics {
  const numCompras = c.compras.length
  const totalComprado = c.compras.reduce((s, x) => s + x.valor, 0)
  const ultimaCompra = c.compras.map((x) => x.data).sort().at(-1)
  const ultimaInteracao = c.interacoes.map((x) => x.data).sort().at(-1)
  return {
    totalComprado,
    numCompras,
    ticketMedio: numCompras > 0 ? Math.round(totalComprado / numCompras) : 0,
    ultimaCompra,
    ultimaInteracao,
  }
}

// ── formatadores ─────────────────────────────────────────────────────────────
export const brl = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)

export const brlCompact = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(n)

export const fmtDate = (iso?: string) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function timeAgo(iso?: string, refIso?: string): string {
  if (!iso) return '—'
  const a = new Date(iso + 'T00:00:00').getTime()
  const b = refIso ? new Date(refIso + 'T00:00:00').getTime() : Date.now()
  const days = Math.round((b - a) / 86400000)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days}d`
  const months = Math.round(days / 30)
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`
  const years = Math.round(months / 12)
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`
}

export const onlyDigits = (s: string) => s.replace(/\D/g, '')
export const waLink = (telefone: string) => `https://wa.me/55${onlyDigits(telefone)}`

// ── score de crédito ─────────────────────────────────────────────────────────
// Mapeia um score 0..1000 para a faixa qualitativa (modelo Serasa-like).
export function scoreToFaixa(score?: number | null): ScoreFaixa {
  if (score == null || Number.isNaN(score)) return ''
  if (score < 300) return 'baixo'
  if (score < 500) return 'regular'
  if (score < 700) return 'razoavel'
  if (score < 850) return 'bom'
  return 'otimo'
}

export const SCORE_FAIXA_META: Record<Exclude<ScoreFaixa, ''>, { label: string; tone: string }> = {
  baixo: { label: 'Baixo', tone: 'red' },
  regular: { label: 'Regular', tone: 'amber' },
  razoavel: { label: 'Razoável', tone: 'blue' },
  bom: { label: 'Bom', tone: 'olive' },
  otimo: { label: 'Ótimo', tone: 'gold' },
}

// Critério de "cadastro aprovado": score razoável-pra-cima E tem Inscrição Estadual.
// Usado tanto na exibição (Clientes) quanto na automação CRM→Clientes.
const FAIXAS_APROVADAS: ScoreFaixa[] = ['razoavel', 'bom', 'otimo']
export function isClienteCadastroApto(opts: { scoreFaixa?: ScoreFaixa; scoreCredito?: number | null; temIE?: string | null }): boolean {
  const faixa = opts.scoreFaixa || scoreToFaixa(opts.scoreCredito)
  const temIE = String(opts.temIE ?? '').trim().toLowerCase() === 'sim'
  return FAIXAS_APROVADAS.includes(faixa) && temIE
}

export const fmtCpf = (cpf?: string) => {
  const d = onlyDigits(cpf ?? '')
  if (d.length !== 11) return cpf || '—'
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

// Classifica a prontidão do cliente para cadastro em leiloeiras.
export function clienteReadiness(c: Cliente): ClienteReadiness {
  if (isClienteCadastroApto({ scoreFaixa: c.scoreFaixa, scoreCredito: c.scoreCredito, temIE: c.temInscricaoEstadual })) {
    return 'apto'
  }
  const semScore = c.scoreCredito == null && !c.scoreFaixa
  const semIE = !c.temInscricaoEstadual && !c.inscricaoEstadual
  if (semScore && semIE) return 'sem-dados'
  return 'pendente'
}

// ── leiloeiras: habilitação de compra ────────────────────────────────────────
// "Habilitado a comprar na leiloeira X" = existe vínculo com status 'aprovado'.
// Enviado/pendente/recusado NÃO habilitam — o cliente não bate martelo lá.

/** Vínculos aprovados (habilitados), ordenados por nome. */
export function leiloeirasHabilitadas(c: Cliente): ClienteLeiloeiraVinculo[] {
  return (c.leiloeiras ?? [])
    .filter((l) => l.status === 'aprovado')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Vínculos em trânsito (enviado) — cadastro na fila da leiloeira. */
export function leiloeirasEmAnalise(c: Cliente): ClienteLeiloeiraVinculo[] {
  return (c.leiloeiras ?? [])
    .filter((l) => l.status === 'enviado')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Nomes das leiloeiras onde o cliente já pode comprar (para tabela/CSV). */
export const nomesHabilitadas = (c: Cliente): string[] => leiloeirasHabilitadas(c).map((l) => l.nome)

// ── recência de compra ───────────────────────────────────────────────────────
// O ciclo pecuário é longo: um comprador de leilão não recompra todo mês. Os
// cortes abaixo (6/12/24 meses) espelham a leitura comercial da casa — quem
// comprou no último semestre está vivo; passando de 2 anos, é base fria.
export type ClienteRecencia = 'ativo' | 'atencao' | 'risco' | 'inativo' | 'sem-compra'

export const RECENCIA_META: Record<ClienteRecencia, { label: string; tone: string; hint: string }> = {
  ativo: { label: 'Ativo', tone: 'olive', hint: 'comprou nos últimos 6 meses' },
  atencao: { label: 'Atenção', tone: 'amber', hint: '6 a 12 meses sem comprar' },
  risco: { label: 'Risco', tone: 'red', hint: '12 a 24 meses sem comprar' },
  inativo: { label: 'Inativo', tone: '', hint: 'mais de 24 meses sem comprar' },
  'sem-compra': { label: 'Sem compra', tone: 'blue', hint: 'cadastro sem arremate registrado' },
}

/** Meses desde a última compra (null quando nunca comprou). */
export function mesesDesdeUltimaCompra(c: Cliente, hojeIso?: string): number | null {
  const ultima = c.compras.map((x) => x.data).filter(Boolean).sort().at(-1)
  if (!ultima) return null
  const a = new Date(`${ultima}T00:00:00`).getTime()
  const b = hojeIso ? new Date(`${hojeIso}T00:00:00`).getTime() : Date.now()
  return Math.max(0, Math.floor((b - a) / (86400000 * 30.44)))
}

export function clienteRecencia(c: Cliente, hojeIso?: string): ClienteRecencia {
  const m = mesesDesdeUltimaCompra(c, hojeIso)
  if (m === null) return 'sem-compra'
  if (m < 6) return 'ativo'
  if (m < 12) return 'atencao'
  if (m < 24) return 'risco'
  return 'inativo'
}

// ── faixas de ticket (segmentação usada nos relatórios) ──────────────────────
export type FaixaTicket = 'ate-50k' | '50k-150k' | '150k-500k' | 'acima-500k' | 'sem-compra'

export const FAIXA_TICKET_META: Record<FaixaTicket, { label: string; tone: string }> = {
  'ate-50k': { label: 'Até R$ 50 mil', tone: '' },
  '50k-150k': { label: 'R$ 50–150 mil', tone: 'blue' },
  '150k-500k': { label: 'R$ 150–500 mil', tone: 'amber' },
  'acima-500k': { label: 'Acima de R$ 500 mil', tone: 'gold' },
  'sem-compra': { label: 'Sem compra', tone: '' },
}

export const FAIXAS_TICKET: FaixaTicket[] = ['acima-500k', '150k-500k', '50k-150k', 'ate-50k', 'sem-compra']

/** Faixa pelo TOTAL arrematado no período considerado. */
export function faixaTicket(total: number, temCompra = total > 0): FaixaTicket {
  if (!temCompra || total <= 0) return 'sem-compra'
  if (total > 500_000) return 'acima-500k'
  if (total > 150_000) return '150k-500k'
  if (total > 50_000) return '50k-150k'
  return 'ate-50k'
}

// ── rótulo do assessor ───────────────────────────────────────────────────────
/** Rótulo estável para agrupar carteira (clientes sem vínculo caem num balde). */
export const SEM_ASSESSOR = 'Sem assessor'
export const assessorLabel = (c: Cliente): string => (c.assessor || '').trim() || SEM_ASSESSOR
