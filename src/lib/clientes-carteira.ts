// ─────────────────────────────────────────────────────────────────────────────
// CARTEIRA & RELATÓRIOS DE CLIENTES — agregações derivadas.
//
// As duas telas novas (`/sistema/clientes/carteira` e `/sistema/clientes/
// relatorios`) leem o MESMO payload de `getClientes()` que o módulo Clientes.
// Nada aqui vai ao banco: se um número divergir da lista de clientes, é bug de
// filtro, não de fonte. Esse é o ponto — uma fonte só, três leituras.
//
// Duas convenções que valem para as duas telas:
//   • "habilitado a comprar" = vínculo com a leiloeira em status 'aprovado';
//   • o recorte de período corta as COMPRAS, não os clientes: um cliente sem
//     arremate na janela continua na carteira (com VGV zero no período), porque
//     ele é justamente quem o assessor precisa reativar.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type Cliente, type ClienteRecencia, type ClienteReadiness,
  clienteRecencia, clienteReadiness, leiloeirasHabilitadas, SEM_ASSESSOR,
} from '@/lib/clientes'
import { assessorCanonico, assessorPorUf, type Assessor } from '@/lib/assessor-zona'

// ── período ──────────────────────────────────────────────────────────────────
export type PeriodoKey = 'tudo' | '12m' | '24m' | 'ano' | 'ano-anterior'

export const PERIODOS: { key: PeriodoKey; label: string }[] = [
  { key: 'tudo', label: 'Todo o histórico' },
  { key: '12m', label: 'Últimos 12 meses' },
  { key: '24m', label: 'Últimos 24 meses' },
  { key: 'ano', label: 'Ano corrente' },
  { key: 'ano-anterior', label: 'Ano anterior' },
]

const isoDe = (d: Date) => d.toISOString().slice(0, 10)

/** Janela [de, ate] em ISO (inclusiva). `de`/`ate` vazios = sem limite. */
export function janelaDoPeriodo(key: PeriodoKey, hoje = new Date()): { de: string; ate: string } {
  const ano = hoje.getFullYear()
  switch (key) {
    case '12m': {
      const d = new Date(hoje); d.setFullYear(ano - 1)
      return { de: isoDe(d), ate: '9999-12-31' }
    }
    case '24m': {
      const d = new Date(hoje); d.setFullYear(ano - 2)
      return { de: isoDe(d), ate: '9999-12-31' }
    }
    case 'ano':
      return { de: `${ano}-01-01`, ate: '9999-12-31' }
    case 'ano-anterior':
      return { de: `${ano - 1}-01-01`, ate: `${ano - 1}-12-31` }
    case 'tudo':
    default:
      return { de: '0000-01-01', ate: '9999-12-31' }
  }
}

// ── resumo do cliente dentro da janela ───────────────────────────────────────
export interface ResumoCliente {
  vgv: number
  compras: number
  animais: number
  leiloes: number
  ticket: number
  ultimaCompra?: string
  primeiraCompra?: string
  /** Comprou dentro da janela (distingue "zerado no período" de "nunca comprou"). */
  ativoNoPeriodo: boolean
}

export function resumoNoPeriodo(c: Cliente, de: string, ate: string): ResumoCliente {
  const dentro = c.compras.filter((x) => x.data && x.data >= de && x.data <= ate)
  const vgv = dentro.reduce((s, x) => s + (x.valor || 0), 0)
  const animais = dentro.reduce((s, x) => s + (x.cabecas || 0), 0)
  const datas = dentro.map((x) => x.data).filter(Boolean).sort()
  return {
    vgv,
    compras: dentro.length,
    animais,
    leiloes: new Set(dentro.map((x) => x.leilao || x.id)).size,
    ticket: dentro.length ? Math.round(vgv / dentro.length) : 0,
    ultimaCompra: datas.at(-1),
    primeiraCompra: datas[0],
    ativoNoPeriodo: dentro.length > 0,
  }
}

// ── assessor: nome de exibição e coerência com a zona ────────────────────────
/**
 * O nome do assessor chega de duas canonizações diferentes: o sync do HastaPro
 * grava "Fabio Omena" (espelho de assessor-normalize) e a regra de zona fala
 * "Fábio Omena Gaia". Sem unificar, a mesma pessoa vira duas carteiras.
 * `assessorCanonico` resolve os três assessores de zona; qualquer outro nome
 * (Bulinha, Matheus…) passa como está.
 */
export function nomeAssessorExibicao(raw: string | null | undefined): string {
  const nome = String(raw ?? '').trim()
  if (!nome) return SEM_ASSESSOR
  return assessorCanonico(nome) ?? nome
}

export const temAssessor = (c: Cliente): boolean => nomeAssessorExibicao(c.assessor) !== SEM_ASSESSOR

export type CoerenciaZona = 'ok' | 'divergente' | 'sem-assessor' | 'fora-da-regra'

export interface ZonaDoCliente {
  /** Assessor que a regra de zona indicaria para a UF do cliente. */
  esperado: Assessor | null
  atual: string
  coerencia: CoerenciaZona
}

/**
 * Confere o vínculo contra a divisão por zona (Douglas=Norte+MA · Fábio=NE−MA+SE
 * · Leonardo=CO+Sul). Só acusa divergência quando os DOIS lados são assessores
 * de zona — atribuir um cliente ao Bulinha ou ao Matheus não é erro de zona.
 */
export function zonaDoCliente(c: Cliente): ZonaDoCliente {
  const atual = nomeAssessorExibicao(c.assessor)
  const esperado = assessorPorUf(c.uf)
  if (atual === SEM_ASSESSOR) return { esperado, atual, coerencia: 'sem-assessor' }
  const atualZona = assessorCanonico(atual)
  if (!atualZona || !esperado) return { esperado, atual, coerencia: 'fora-da-regra' }
  return { esperado, atual, coerencia: atualZona === esperado ? 'ok' : 'divergente' }
}

export const COERENCIA_META: Record<CoerenciaZona, { label: string; tone: string }> = {
  ok: { label: 'Na zona', tone: 'olive' },
  divergente: { label: 'Fora da zona', tone: 'amber' },
  'sem-assessor': { label: 'Sem assessor', tone: 'red' },
  'fora-da-regra': { label: 'Fora da regra', tone: '' },
}

// ── agregação por grupo (assessor, UF, leiloeira, perfil…) ───────────────────
export interface GrupoCarteira {
  chave: string
  clientes: number
  clientesComCompra: number
  vgv: number
  compras: number
  animais: number
  ticket: number
  recorrentes: number
  aptos: number
  habilitados: number
  semTelefone: number
  semCpf: number
  recencia: Record<ClienteRecencia, number>
  /** Participação no VGV do recorte (0..1); preenchido por `comShare`. */
  share: number
}

const zeroRecencia = (): Record<ClienteRecencia, number> => ({
  ativo: 0, atencao: 0, risco: 0, inativo: 0, 'sem-compra': 0,
})

export function grupoVazio(chave: string): GrupoCarteira {
  return {
    chave, clientes: 0, clientesComCompra: 0, vgv: 0, compras: 0, animais: 0, ticket: 0,
    recorrentes: 0, aptos: 0, habilitados: 0, semTelefone: 0, semCpf: 0,
    recencia: zeroRecencia(), share: 0,
  }
}

export function acumulaNoGrupo(g: GrupoCarteira, c: Cliente, r: ResumoCliente): void {
  g.clientes += 1
  if (r.ativoNoPeriodo) g.clientesComCompra += 1
  g.vgv += r.vgv
  g.compras += r.compras
  g.animais += r.animais
  if (c.recorrente) g.recorrentes += 1
  if (clienteReadiness(c) === 'apto') g.aptos += 1
  if (leiloeirasHabilitadas(c).length > 0) g.habilitados += 1
  if (!c.telefone) g.semTelefone += 1
  if (!c.cpf) g.semCpf += 1
  g.recencia[clienteRecencia(c)] += 1
}

/** Fecha os derivados (ticket) e calcula o share de VGV entre os grupos. */
export function fechaGrupos(grupos: GrupoCarteira[]): GrupoCarteira[] {
  const totalVgv = grupos.reduce((s, g) => s + g.vgv, 0)
  for (const g of grupos) {
    g.ticket = g.compras ? Math.round(g.vgv / g.compras) : 0
    g.share = totalVgv > 0 ? g.vgv / totalVgv : 0
  }
  return grupos
}

/**
 * Agrupa clientes por uma chave (ou várias, no caso das leiloeiras, em que o
 * mesmo cliente conta para cada casa em que está habilitado).
 */
export function agrupar(
  linhas: { c: Cliente; r: ResumoCliente }[],
  chavesDe: (c: Cliente) => string[],
): GrupoCarteira[] {
  const mapa = new Map<string, GrupoCarteira>()
  for (const { c, r } of linhas) {
    for (const chave of chavesDe(c)) {
      let g = mapa.get(chave)
      if (!g) { g = grupoVazio(chave); mapa.set(chave, g) }
      acumulaNoGrupo(g, c, r)
    }
  }
  return fechaGrupos([...mapa.values()]).sort((a, b) => b.vgv - a.vgv || b.clientes - a.clientes)
}

// ── série temporal de arremates (evolução) ───────────────────────────────────
export interface PontoMes {
  mes: string // yyyy-mm
  vgv: number
  compras: number
  clientes: number
  novos: number // clientes cuja PRIMEIRA compra de todos os tempos caiu neste mês
}

export function serieMensal(linhas: { c: Cliente; r: ResumoCliente }[], de: string, ate: string): PontoMes[] {
  const mapa = new Map<string, { vgv: number; compras: number; clientes: Set<string>; novos: Set<string> }>()
  for (const { c } of linhas) {
    const todasDatas = c.compras.map((x) => x.data).filter(Boolean).sort()
    const primeiraGeral = todasDatas[0]
    for (const compra of c.compras) {
      if (!compra.data || compra.data < de || compra.data > ate) continue
      const mes = compra.data.slice(0, 7)
      let p = mapa.get(mes)
      if (!p) { p = { vgv: 0, compras: 0, clientes: new Set(), novos: new Set() }; mapa.set(mes, p) }
      p.vgv += compra.valor || 0
      p.compras += 1
      p.clientes.add(c.id)
      if (primeiraGeral && primeiraGeral.slice(0, 7) === mes) p.novos.add(c.id)
    }
  }
  return [...mapa.entries()]
    .map(([mes, p]) => ({ mes, vgv: p.vgv, compras: p.compras, clientes: p.clientes.size, novos: p.novos.size }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
}

export const rotuloMes = (mes: string): string => {
  const [a, m] = mes.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(m) - 1] ?? m}/${a.slice(2)}`
}

// ── leitura de prontidão agregada ────────────────────────────────────────────
export interface ResumoProntidao {
  total: number
  porReadiness: Record<ClienteReadiness, number>
  comCpf: number
  comIe: number
  comScore: number
  comDocs: number
  habilitados: number
  emAnalise: number
  semNenhumVinculo: number
}

export function resumoProntidao(clientes: Cliente[]): ResumoProntidao {
  const out: ResumoProntidao = {
    total: clientes.length,
    porReadiness: { apto: 0, pendente: 0, 'sem-dados': 0 },
    comCpf: 0, comIe: 0, comScore: 0, comDocs: 0,
    habilitados: 0, emAnalise: 0, semNenhumVinculo: 0,
  }
  for (const c of clientes) {
    out.porReadiness[clienteReadiness(c)] += 1
    if (c.cpf) out.comCpf += 1
    if (c.inscricaoEstadual || String(c.temInscricaoEstadual ?? '').toLowerCase() === 'sim') out.comIe += 1
    if (c.scoreCredito != null) out.comScore += 1
    if ((c.docsCount ?? 0) > 0) out.comDocs += 1
    const vinculos = c.leiloeiras ?? []
    if (vinculos.some((v) => v.status === 'aprovado')) out.habilitados += 1
    else if (vinculos.some((v) => v.status === 'enviado')) out.emAnalise += 1
    if (vinculos.length === 0) out.semNenhumVinculo += 1
  }
  return out
}
