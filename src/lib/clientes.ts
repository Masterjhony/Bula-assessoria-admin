// ─────────────────────────────────────────────────────────────────────────────
// CLIENTES (compradores) — tipos e utilitários.
// A fonte de dados real é `getClientes()` em
// `src/app/sistema/actions/clientes.ts` (agregação dos fechamentos + CRM).
// Este arquivo guarda apenas o shape `Cliente` e helpers de formatação/derivação.
// ─────────────────────────────────────────────────────────────────────────────

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
