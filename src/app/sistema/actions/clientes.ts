'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CRMLead, CRMContactEntry } from './crm-leads'
import { recordContact } from './crm-leads'
import {
  type Cliente, type CompraHist, type InteracaoHist, type Interesse,
  type ClienteStatus, type PerfilConsumo, type PreferenciaCategoria,
  type ScoreFaixa, type Protesto, type ClienteDocumento,
  clienteMatchKey, scoreToFaixa, onlyDigits,
} from '@/lib/clientes'

// ─────────────────────────────────────────────────────────────────────────────
// Clientes/compradores = agregação dos arremates em `bula_leilao_fechamento`
// (campo `compradores[]`), enriquecidos com o CRM (`crm_leads`) e sobrepostos
// pelos cadastros/edições manuais (`clientes`) + interações persistidas
// (`cliente_interacoes`). Tudo unificado pela chave normalizada do nome.
// ─────────────────────────────────────────────────────────────────────────────

// shape gravado em bula_leilao_fechamento.compradores[]
type CompradorRow = {
  rank?: number; fazenda?: string; comprador?: string
  cidade?: string; uf?: string; lotes?: number; animais?: number; vgv?: number
}
type FechamentoRow = {
  id: string | number
  nome: string | null
  data: string | null
  compradores: CompradorRow[] | null
}

type LeadRow = Pick<CRMLead,
  'id' | 'nome' | 'empresa' | 'telefone' | 'celular' | 'email' | 'status' |
  'temperatura' | 'prioridade' | 'interesse' | 'o_que_busca' | 'cidade' |
  'estado' | 'data_estimada_fechamento' | 'contact_history' |
  'cpf' | 'inscricao_estadual' | 'tem_inscricao_estadual' | 'score_serasa' |
  'pendencias_financeiras' | 'momento_pecuaria' | 'operacao_pecuaria'>

type ClienteRow = {
  id: string; match_key: string; nome: string
  responsavel: string | null; telefone: string | null; email: string | null
  cidade: string | null; uf: string | null; perfil: string | null; status: string | null
  recorrente: boolean | null; interesses: unknown; tags: unknown
  observacoes: string | null; preferencias: string | null
  preferencias_categorias: unknown
  proximo_followup: string | null; crm_lead_id: string | null
  cpf: string | null; inscricao_estadual: string | null; tem_inscricao_estadual: string | null
  score_credito: number | null; score_faixa: string | null; score_consultado_at: string | null
  protestos: unknown; protestos_consultado_at: string | null
  momento_pecuaria: string | null; operacao_pecuaria: string | null
}

type InteracaoRow = {
  id: string; cliente_key: string; tipo: string | null
  responsavel: string | null; nota: string | null; data: string | null
}

const nameKey = clienteMatchKey

const CONTACT_TIPO: Record<CRMContactEntry['type'], InteracaoHist['tipo']> = {
  ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', visita: 'Visita', outro: 'Reunião',
}
const TIPO_TO_TYPE: Record<InteracaoHist['tipo'], CRMContactEntry['type']> = {
  Ligação: 'ligacao', WhatsApp: 'whatsapp', 'E-mail': 'email', Visita: 'visita', Reunião: 'outro',
}

// ── coerções seguras (dados vindos do banco em jsonb/text) ──
const VALID_PERFIL: PerfilConsumo[] = ['Premium', 'Recorrente', 'Ocasional', 'Novo']
const VALID_STATUS: ClienteStatus[] = ['ativo', 'quente', 'frio', 'inativo']
const VALID_INTERESSE: Interesse[] = ['Sêmen', 'Embriões', 'Touros', 'Matrizes', 'Leilões']
const VALID_PREF_CAT: PreferenciaCategoria[] = ['Bezerros', 'Novilhas', 'Vacas', 'Touros', 'Embriões', 'Sêmen']
const VALID_TIPO: InteracaoHist['tipo'][] = ['WhatsApp', 'Ligação', 'E-mail', 'Visita', 'Reunião']

const asPerfil = (v: unknown): PerfilConsumo => (VALID_PERFIL.includes(v as PerfilConsumo) ? (v as PerfilConsumo) : 'Novo')
const asStatus = (v: unknown): ClienteStatus => (VALID_STATUS.includes(v as ClienteStatus) ? (v as ClienteStatus) : 'quente')
const asTipo = (v: unknown): InteracaoHist['tipo'] => (VALID_TIPO.includes(v as InteracaoHist['tipo']) ? (v as InteracaoHist['tipo']) : 'WhatsApp')
const asInteresses = (v: unknown): Interesse[] => (Array.isArray(v) ? v.filter((x): x is Interesse => VALID_INTERESSE.includes(x as Interesse)) : [])
const asPrefCats = (v: unknown): PreferenciaCategoria[] => (Array.isArray(v) ? v.filter((x): x is PreferenciaCategoria => VALID_PREF_CAT.includes(x as PreferenciaCategoria)) : [])
const asStrArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [])
const asProtestos = (v: unknown): Protesto[] => (Array.isArray(v) ? (v as Protesto[]) : [])

const VALID_SCORE_FAIXA: ScoreFaixa[] = ['baixo', 'regular', 'razoavel', 'bom', 'otimo']
const asFaixa = (v: unknown): ScoreFaixa => (VALID_SCORE_FAIXA.includes(v as ScoreFaixa) ? (v as ScoreFaixa) : '')

// Funde os dados de cadastro (CPF/I.E./score/protestos): a linha manual de
// `clientes` vence; o lead do CRM preenche o que faltar (já tem esses campos).
function cadastroFields(row: ClienteRow | undefined, lead: LeadRow | undefined): Partial<Cliente> {
  const score = row?.score_credito ?? lead?.score_serasa ?? undefined
  const faixa = asFaixa(row?.score_faixa) || scoreToFaixa(score ?? null)
  const cpf = (row?.cpf || lead?.cpf || '').trim()
  const ie = (row?.inscricao_estadual || lead?.inscricao_estadual || '').trim()
  const temIE = (row?.tem_inscricao_estadual || lead?.tem_inscricao_estadual || (ie ? 'Sim' : '')).trim()
  return {
    cpf: cpf || undefined,
    inscricaoEstadual: ie || undefined,
    temInscricaoEstadual: temIE || undefined,
    scoreCredito: typeof score === 'number' ? score : undefined,
    scoreFaixa: faixa || undefined,
    scoreConsultadoAt: row?.score_consultado_at || undefined,
    protestos: asProtestos(row?.protestos),
    protestosConsultadoAt: row?.protestos_consultado_at || undefined,
    momentoPecuaria: (row?.momento_pecuaria || lead?.momento_pecuaria || '').trim() || undefined,
    operacaoPecuaria: (row?.operacao_pecuaria || lead?.operacao_pecuaria || '').trim() || undefined,
  }
}

function descCompra(lotes: number, animais: number): string {
  const parts: string[] = []
  if (lotes) parts.push(`${lotes} ${lotes !== 1 ? 'lotes' : 'lote'}`)
  if (animais) parts.push(`${animais} ${animais !== 1 ? 'animais' : 'animal'}`)
  return parts.length ? `Arremate · ${parts.join(' · ')}` : 'Arremate em leilão'
}

function monthsSince(iso?: string): number | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
}

function recencyStatus(months: number | null): ClienteStatus {
  if (months == null) return 'inativo'
  if (months <= 8) return 'ativo'
  if (months <= 16) return 'frio'
  return 'inativo'
}

function deriveInteresses(lead?: LeadRow): Interesse[] {
  const set = new Set<Interesse>()
  const txt = nameKey([lead?.interesse, lead?.o_que_busca].filter(Boolean).join(' '))
  if (/semen|dose/.test(txt)) set.add('Sêmen')
  if (/embri/.test(txt)) set.add('Embriões')
  if (/touro|reprodutor/.test(txt)) set.add('Touros')
  if (/matriz|femea|prenhe|doadora/.test(txt)) set.add('Matrizes')
  set.add('Leilões') // todos vieram de arremate em leilão
  return [...set]
}

function mapLeadInteracoes(lead?: LeadRow): InteracaoHist[] {
  const history = Array.isArray(lead?.contact_history) ? (lead!.contact_history as CRMContactEntry[]) : []
  return history
    .map((e, i) => ({
      id: e.id || `${lead!.id}-ch-${i}`,
      data: String(e.date || '').slice(0, 10),
      tipo: CONTACT_TIPO[e.type] ?? 'Reunião',
      responsavel: e.by || 'Equipe',
      nota: e.notes || '—',
    }))
    .filter((x) => x.data)
}

const brl0 = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)

const totalDe = (c: Cliente) => c.compras.reduce((s, x) => s + x.valor, 0)

/**
 * Lista unificada de clientes: compradores dos fechamentos + CRM + cadastros
 * manuais + interações persistidas. Retorna [] se não houver compradores.
 */
export async function getClientes(): Promise<Cliente[]> {
  const supabase = await createClient()

  const [fechRes, leadsRes] = await Promise.all([
    supabase
      .from('bula_leilao_fechamento')
      .select('id, nome, data, compradores')
      .order('data', { ascending: false }),
    supabase
      .from('crm_leads')
      .select('id, nome, empresa, telefone, celular, email, status, temperatura, prioridade, interesse, o_que_busca, cidade, estado, data_estimada_fechamento, contact_history, cpf, inscricao_estadual, tem_inscricao_estadual, score_serasa, pendencias_financeiras, momento_pecuaria, operacao_pecuaria')
      .eq('arquivado', false),
  ])

  if (fechRes.error) {
    console.error('[clientes] erro ao ler fechamentos:', fechRes.error.message)
  }

  // Tabelas do módulo CLIENTES podem ainda não existir (migration 0028 não
  // aplicada) — degrada para vazio sem quebrar a página.
  const [clienteRes, interRes, docsRes, leiloeiraRes] = await Promise.all([
    supabase.from('clientes').select('*'),
    supabase.from('cliente_interacoes').select('id, cliente_key, tipo, responsavel, nota, data'),
    supabase.from('cliente_documentos').select('cliente_key'),
    supabase.from('cliente_leiloeira_cadastro').select('cliente_key, status'),
  ])
  if (clienteRes.error) console.warn('[clientes] tabela clientes indisponível:', clienteRes.error.message)
  if (interRes.error) console.warn('[clientes] tabela cliente_interacoes indisponível:', interRes.error.message)

  const fechamentos = (fechRes.data ?? []) as FechamentoRow[]
  const leads = (leadsRes.data ?? []) as LeadRow[]
  const clienteRows = (clienteRes.data ?? []) as ClienteRow[]
  const interacaoRows = (interRes.data ?? []) as InteracaoRow[]

  // agregados por chave do cliente (para os modos cards/tabela/lista)
  const docsCountByKey = new Map<string, number>()
  for (const r of (docsRes.data ?? []) as { cliente_key: string }[]) {
    if (r.cliente_key) docsCountByKey.set(r.cliente_key, (docsCountByKey.get(r.cliente_key) ?? 0) + 1)
  }
  const leiloeirasAprovadasByKey = new Map<string, number>()
  for (const r of (leiloeiraRes.data ?? []) as { cliente_key: string; status: string | null }[]) {
    if (r.cliente_key && r.status === 'aprovado') {
      leiloeirasAprovadasByKey.set(r.cliente_key, (leiloeirasAprovadasByKey.get(r.cliente_key) ?? 0) + 1)
    }
  }

  // índices de leads para o vínculo com o CRM
  const leadByName = new Map<string, LeadRow>()
  const leadById = new Map<string, LeadRow>()
  for (const l of leads) {
    leadById.set(l.id, l)
    for (const nm of [l.nome, l.empresa]) {
      const k = nameKey(nm)
      if (k && !leadByName.has(k)) leadByName.set(k, l)
    }
  }

  // interações persistidas, agrupadas pela chave do cliente
  const interByKey = new Map<string, InteracaoHist[]>()
  for (const r of interacaoRows) {
    const k = r.cliente_key
    if (!k) continue
    const arr = interByKey.get(k) ?? []
    arr.push({
      id: r.id,
      data: String(r.data || '').slice(0, 10),
      tipo: asTipo(r.tipo),
      responsavel: r.responsavel || 'Equipe',
      nota: r.nota || '—',
    })
    interByKey.set(k, arr)
  }

  // agrega compradores entre todos os leilões
  type Agg = {
    key: string; nome: string; comprador: string; cidade: string; uf: string
    compras: CompraHist[]; fechamentos: Set<string>
  }
  const agg = new Map<string, Agg>()

  for (const f of fechamentos) {
    const auction = f.nome || 'Leilão'
    const data = f.data || ''
    for (const c of f.compradores ?? []) {
      const fazenda = String(c.fazenda || c.comprador || '').trim()
      const key = nameKey(fazenda)
      if (!key) continue

      let e = agg.get(key)
      if (!e) {
        e = { key, nome: fazenda, comprador: String(c.comprador || '').trim(), cidade: '', uf: '', compras: [], fechamentos: new Set() }
        agg.set(key, e)
      }
      e.fechamentos.add(String(f.id))
      if (c.cidade) e.cidade = c.cidade
      if (c.uf) e.uf = c.uf
      if (!e.comprador && c.comprador) e.comprador = String(c.comprador).trim()

      const lotes = Number(c.lotes) || 0
      const animais = Number(c.animais) || 0
      e.compras.push({
        id: `${f.id}-${key}`,
        data,
        descricao: descCompra(lotes, animais),
        leilao: auction,
        categoria: 'Leilões',
        cabecas: animais || undefined,
        valor: Number(c.vgv) || 0,
      })
    }
  }

  // mapa unificado por chave (derivados dos fechamentos)
  const byKey = new Map<string, Cliente>()
  for (const e of agg.values()) {
    const lead = leadByName.get(e.key) || (e.comprador ? leadByName.get(nameKey(e.comprador)) : undefined)

    const total = e.compras.reduce((s, x) => s + x.valor, 0)
    const numFech = e.fechamentos.size
    const recorrente = numFech >= 2
    const ultimaCompra = e.compras.map((x) => x.data).filter(Boolean).sort().at(-1)
    const meses = monthsSince(ultimaCompra)

    const perfil: PerfilConsumo = total >= 500_000 ? 'Premium' : recorrente ? 'Recorrente' : 'Ocasional'

    let status = recencyStatus(meses)
    const hot = lead && /quente|hot/i.test(`${lead.temperatura ?? ''} ${lead.status ?? ''}`)
    if (hot && status !== 'inativo') status = 'quente'

    const tags: string[] = []
    if (perfil === 'Premium') tags.push('VIP')
    if (recorrente) tags.push('Recorrente')
    if (numFech >= 3) tags.push('Multi-leilão')
    if (lead) tags.push('No CRM')

    const responsavel = e.comprador && nameKey(e.comprador) !== e.key
      ? e.comprador
      : (lead?.nome && nameKey(lead.nome) !== e.key ? lead.nome : e.nome)

    byKey.set(e.key, {
      id: `fech-${e.key.replace(/\s+/g, '-')}`,
      nome: e.nome,
      responsavel,
      telefone: (lead?.celular || lead?.telefone || '').trim(),
      email: lead?.email || undefined,
      cidade: e.cidade || lead?.cidade || '—',
      uf: (e.uf || lead?.estado || '—').toUpperCase(),
      perfil,
      interesses: deriveInteresses(lead),
      status,
      recorrente,
      tags,
      observacoes: `Comprador identificado em ${numFech} ${numFech !== 1 ? 'leilões' : 'leilão'} da Bula (${brl0(total)} em arremates).` +
        (lead ? ' Vinculado a um lead do CRM.' : ' Ainda sem cadastro no CRM.'),
      preferencias: `Histórico de arremates em leilões da JMP/Bula.${recorrente ? ' Comprador recorrente.' : ''}`,
      proximoFollowup: lead?.data_estimada_fechamento ? String(lead.data_estimada_fechamento).slice(0, 10) : undefined,
      compras: e.compras,
      interacoes: mapLeadInteracoes(lead),
      crmLeadId: lead?.id,
      matchKey: e.key,
      origem: 'fechamento',
      ...cadastroFields(undefined, lead),
    })
  }

  // sobrepõe / adiciona cadastros manuais (tabela clientes)
  for (const row of clienteRows) {
    const key = row.match_key
    if (!key) continue
    const existing = byKey.get(key)
    const manualInteresses = asInteresses(row.interesses)
    const manualTags = asStrArr(row.tags)
    const linkedLead = row.crm_lead_id ? leadById.get(row.crm_lead_id) : undefined

    if (existing) {
      // overlay: dados manuais não-vazios vencem; compras/derivados preservados
      byKey.set(key, {
        ...existing,
        nome: row.nome || existing.nome,
        responsavel: row.responsavel || existing.responsavel,
        telefone: (row.telefone || existing.telefone || '').trim(),
        email: row.email || existing.email,
        cidade: row.cidade || existing.cidade,
        uf: (row.uf || existing.uf || '—').toUpperCase(),
        perfil: row.perfil ? asPerfil(row.perfil) : existing.perfil,
        status: row.status ? asStatus(row.status) : existing.status,
        interesses: manualInteresses.length ? [...new Set([...existing.interesses, ...manualInteresses])] : existing.interesses,
        tags: manualTags.length ? [...new Set([...existing.tags, ...manualTags])] : existing.tags,
        observacoes: row.observacoes || existing.observacoes,
        preferencias: row.preferencias || existing.preferencias,
        preferenciasCategorias: asPrefCats(row.preferencias_categorias),
        proximoFollowup: row.proximo_followup ? String(row.proximo_followup).slice(0, 10) : existing.proximoFollowup,
        crmLeadId: existing.crmLeadId || row.crm_lead_id || undefined,
        clienteRowId: row.id,
        ...cadastroFields(row, linkedLead || leadByName.get(key)),
      })
    } else {
      const lead = linkedLead || leadByName.get(key)
      byKey.set(key, {
        id: `cli-${row.id}`,
        nome: row.nome,
        responsavel: row.responsavel || lead?.nome || row.nome,
        telefone: (row.telefone || lead?.celular || lead?.telefone || '').trim(),
        email: row.email || lead?.email || undefined,
        cidade: row.cidade || lead?.cidade || '—',
        uf: (row.uf || lead?.estado || '—').toUpperCase(),
        perfil: asPerfil(row.perfil),
        interesses: manualInteresses.length ? manualInteresses : ['Leilões'],
        status: asStatus(row.status),
        recorrente: !!row.recorrente,
        tags: manualTags,
        observacoes: row.observacoes || 'Cliente cadastrado manualmente.',
        preferencias: row.preferencias || undefined,
        preferenciasCategorias: asPrefCats(row.preferencias_categorias),
        proximoFollowup: row.proximo_followup ? String(row.proximo_followup).slice(0, 10) : undefined,
        compras: [],
        interacoes: mapLeadInteracoes(lead),
        crmLeadId: row.crm_lead_id || lead?.id,
        matchKey: key,
        clienteRowId: row.id,
        origem: 'manual',
        ...cadastroFields(row, lead),
      })
    }
  }

  // anexa interações persistidas + agregados (docs/leiloeiras) e ordena
  for (const cliente of byKey.values()) {
    const persisted = cliente.matchKey ? interByKey.get(cliente.matchKey) ?? [] : []
    if (persisted.length) {
      cliente.interacoes = [...cliente.interacoes, ...persisted]
    }
    cliente.interacoes.sort((a, b) => b.data.localeCompare(a.data))
    if (cliente.matchKey) {
      cliente.docsCount = docsCountByKey.get(cliente.matchKey) ?? 0
      cliente.leiloeirasAprovadas = leiloeirasAprovadasByKey.get(cliente.matchKey) ?? 0
    }
  }

  return [...byKey.values()].sort((a, b) => totalDe(b) - totalDe(a))
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumo de VGV para reconciliar o KPI da página Clientes com o dashboard.
// `vgvTotalLeiloes` = soma de `bula_leilao_fechamento.vgv_total` (base
// autoritativa, idêntica à do dashboard em "all-time"). `vgvAtribuido` = soma de
// `compradores[].vgv` (detalhamento por comprador, que pode estar incompleto).
// A razão atribuído/total é a "cobertura": revela leilões com VGV mas sem
// detalhamento de comprador, em vez de deixar a divergência silenciosa.
// ─────────────────────────────────────────────────────────────────────────────
export interface ClientesVgvSummary {
  vgvTotalLeiloes: number
  vgvAtribuido: number
  cobertura: number // 0..1
}

export async function getClientesVgvSummary(): Promise<ClientesVgvSummary> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bula_leilao_fechamento')
    .select('vgv_total, compradores')
  if (error) {
    console.warn('[clientes] erro ao somar VGV:', error.message)
    return { vgvTotalLeiloes: 0, vgvAtribuido: 0, cobertura: 0 }
  }

  let vgvTotalLeiloes = 0
  let vgvAtribuido = 0
  for (const f of (data ?? []) as { vgv_total: number | null; compradores: CompradorRow[] | null }[]) {
    vgvTotalLeiloes += Number(f.vgv_total) || 0
    for (const c of f.compradores ?? []) vgvAtribuido += Number(c.vgv) || 0
  }
  const cobertura = vgvTotalLeiloes > 0 ? Math.min(1, vgvAtribuido / vgvTotalLeiloes) : 0
  return { vgvTotalLeiloes, vgvAtribuido, cobertura }
}

// ── input do cadastro manual ──
export interface NovoClienteInput {
  nome: string
  responsavel?: string
  telefone?: string
  email?: string
  cidade?: string
  uf?: string
  perfil?: PerfilConsumo
  status?: ClienteStatus
  interesses?: Interesse[]
  observacoes?: string
  // dados de cadastro p/ leiloeiras (opcionais no cadastro manual)
  cpf?: string
  inscricaoEstadual?: string
  temInscricaoEstadual?: string
  momentoPecuaria?: string
}

/**
 * Cadastra (ou atualiza, por nome normalizado) um cliente manual.
 * Faz upsert em `clientes` usando `match_key` como chave de deduplicação.
 */
export async function createCliente(input: NovoClienteInput): Promise<Cliente> {
  const supabase = await createClient()
  const match_key = clienteMatchKey(input.nome)
  if (!match_key) throw new Error('Nome do cliente é obrigatório.')

  const payload = {
    match_key,
    nome: input.nome.trim(),
    responsavel: (input.responsavel ?? '').trim(),
    telefone: (input.telefone ?? '').trim(),
    email: (input.email ?? '').trim(),
    cidade: (input.cidade ?? '').trim(),
    uf: (input.uf ?? '').trim().toUpperCase(),
    perfil: input.perfil ?? 'Novo',
    status: input.status ?? 'quente',
    interesses: input.interesses ?? [],
    observacoes: (input.observacoes ?? '').trim(),
    cpf: onlyDigits(input.cpf ?? ''),
    inscricao_estadual: (input.inscricaoEstadual ?? '').trim(),
    tem_inscricao_estadual: (input.temInscricaoEstadual ?? (input.inscricaoEstadual ? 'Sim' : '')).trim(),
    momento_pecuaria: (input.momentoPecuaria ?? '').trim(),
  }

  const { data, error } = await supabase
    .from('clientes')
    .upsert(payload, { onConflict: 'match_key' })
    .select()
    .single()

  if (error) throw new Error(`Erro ao salvar cliente: ${error.message}`)
  revalidatePath('/sistema/clientes')

  const row = data as ClienteRow
  return {
    id: `cli-${row.id}`,
    nome: row.nome,
    responsavel: row.responsavel || row.nome,
    telefone: (row.telefone || '').trim(),
    email: row.email || undefined,
    cidade: row.cidade || '—',
    uf: (row.uf || '—').toUpperCase(),
    perfil: asPerfil(row.perfil),
    interesses: asInteresses(row.interesses),
    status: asStatus(row.status),
    recorrente: !!row.recorrente,
    tags: asStrArr(row.tags),
    observacoes: row.observacoes || undefined,
    preferencias: row.preferencias || undefined,
    proximoFollowup: row.proximo_followup ? String(row.proximo_followup).slice(0, 10) : undefined,
    compras: [],
    interacoes: [],
    crmLeadId: row.crm_lead_id || undefined,
    matchKey: row.match_key,
    clienteRowId: row.id,
    origem: 'manual',
    ...cadastroFields(row, undefined),
  }
}

// ── input do registro de interação ──
export interface RegistrarInteracaoInput {
  matchKey: string
  clienteRowId?: string
  crmLeadId?: string
  tipo: InteracaoHist['tipo']
  responsavel: string
  nota: string
}

/**
 * Registra uma interação. Quando o cliente está vinculado a um lead do CRM,
 * grava no `contact_history` do lead; caso contrário, persiste em
 * `cliente_interacoes` (anexada pela chave do cliente, mesmo derivado).
 */
export async function registrarInteracao(input: RegistrarInteracaoInput): Promise<void> {
  const supabase = await createClient()

  if (input.crmLeadId) {
    await recordContact(input.crmLeadId, {
      type: TIPO_TO_TYPE[input.tipo],
      date: new Date().toISOString(),
      notes: input.nota,
      by: input.responsavel,
    })
    revalidatePath('/sistema/clientes')
    return
  }

  const { error } = await supabase.from('cliente_interacoes').insert({
    cliente_key: input.matchKey,
    cliente_id: input.clienteRowId ?? null,
    tipo: input.tipo,
    responsavel: input.responsavel,
    nota: input.nota,
  })
  if (error) throw new Error(`Erro ao registrar interação: ${error.message}`)
  revalidatePath('/sistema/clientes')
}

// ── edição de campos (notas, preferências, tags) ──
export interface UpdateClienteCamposInput {
  matchKey: string
  nome: string // usado quando ainda não existe linha (insere o overlay)
  observacoes?: string
  preferencias?: string
  preferenciasCategorias?: PreferenciaCategoria[]
  tags?: string[]
}

/**
 * Edita campos do cliente (observações, preferências, tags). Funciona tanto
 * para clientes manuais quanto para compradores derivados de fechamentos:
 * faz UPDATE na linha de `clientes` se existir, senão cria o overlay
 * (INSERT com match_key + nome + os campos editados).
 */
export async function updateClienteCampos(input: UpdateClienteCamposInput): Promise<void> {
  const supabase = await createClient()
  if (!input.matchKey) throw new Error('Cliente inválido.')

  const patch: Record<string, unknown> = {}
  if (input.observacoes !== undefined) patch.observacoes = input.observacoes
  if (input.preferencias !== undefined) patch.preferencias = input.preferencias
  if (input.preferenciasCategorias !== undefined) patch.preferencias_categorias = input.preferenciasCategorias.filter((c) => VALID_PREF_CAT.includes(c))
  if (input.tags !== undefined) patch.tags = input.tags
  if (Object.keys(patch).length === 0) return

  const { data: existing } = await supabase
    .from('clientes')
    .select('id')
    .eq('match_key', input.matchKey)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('clientes').update(patch).eq('match_key', input.matchKey)
    if (error) throw new Error(`Erro ao salvar: ${error.message}`)
  } else {
    const { error } = await supabase.from('clientes').insert({ match_key: input.matchKey, nome: input.nome, ...patch })
    if (error) throw new Error(`Erro ao salvar: ${error.message}`)
  }
  revalidatePath('/sistema/clientes')
}

// ── edição dos dados de cadastro (CPF, I.E., score, protestos) ──
export interface UpdateClienteCadastroInput {
  matchKey: string
  nome: string
  cpf?: string
  inscricaoEstadual?: string
  temInscricaoEstadual?: string
  scoreCredito?: number | null
  scoreFaixa?: ScoreFaixa
  protestos?: Protesto[]
  momentoPecuaria?: string
  operacaoPecuaria?: string
}

/**
 * Grava os dados de cadastro do cliente (overlay em `clientes` por match_key).
 * Faz UPDATE se a linha existir, senão INSERT. Marca os timestamps de consulta
 * quando score/protestos vêm preenchidos.
 */
export async function updateClienteCadastro(input: UpdateClienteCadastroInput): Promise<void> {
  const supabase = await createClient()
  if (!input.matchKey) throw new Error('Cliente inválido.')

  const patch: Record<string, unknown> = {}
  if (input.cpf !== undefined) patch.cpf = onlyDigits(input.cpf)
  if (input.inscricaoEstadual !== undefined) patch.inscricao_estadual = input.inscricaoEstadual.trim()
  if (input.temInscricaoEstadual !== undefined) patch.tem_inscricao_estadual = input.temInscricaoEstadual.trim()
  if (input.scoreCredito !== undefined && input.scoreCredito !== null) {
    patch.score_credito = input.scoreCredito
    patch.score_faixa = input.scoreFaixa || scoreToFaixa(input.scoreCredito)
    patch.score_consultado_at = new Date().toISOString()
  }
  if (input.protestos !== undefined) {
    patch.protestos = input.protestos
    patch.protestos_consultado_at = new Date().toISOString()
  }
  if (input.momentoPecuaria !== undefined) patch.momento_pecuaria = input.momentoPecuaria.trim()
  if (input.operacaoPecuaria !== undefined) patch.operacao_pecuaria = input.operacaoPecuaria.trim()
  if (Object.keys(patch).length === 0) return

  const { data: existing } = await supabase.from('clientes').select('id').eq('match_key', input.matchKey).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('clientes').update(patch).eq('match_key', input.matchKey)
    if (error) throw new Error(`Erro ao salvar cadastro: ${error.message}`)
  } else {
    const { error } = await supabase.from('clientes').insert({ match_key: input.matchKey, nome: input.nome, ...patch })
    if (error) throw new Error(`Erro ao salvar cadastro: ${error.message}`)
  }
  revalidatePath('/sistema/clientes')
}

// ── documentos do cliente (bucket privado cliente-documentos) ──
const DOCS_BUCKET = 'cliente-documentos'

function mapDocRow(r: {
  id: string; tipo: string | null; nome_arquivo: string; path: string
  tamanho_bytes: number | null; content_type: string | null; created_at: string
}): ClienteDocumento {
  return {
    id: r.id,
    tipo: r.tipo || 'outro',
    nomeArquivo: r.nome_arquivo,
    path: r.path,
    tamanhoBytes: Number(r.tamanho_bytes) || 0,
    contentType: r.content_type || '',
    createdAt: r.created_at,
  }
}

export async function listClienteDocumentos(matchKey: string): Promise<ClienteDocumento[]> {
  if (!matchKey) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cliente_documentos')
    .select('id, tipo, nome_arquivo, path, tamanho_bytes, content_type, created_at')
    .eq('cliente_key', matchKey)
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('[clientes] tabela cliente_documentos indisponível:', error.message)
    return []
  }
  return (data ?? []).map(mapDocRow)
}

/** Upload de um documento. Recebe FormData { file, matchKey, nome, tipo }. */
export async function uploadClienteDocumento(formData: FormData): Promise<ClienteDocumento> {
  const supabase = await createClient()
  const file = formData.get('file') as File | null
  const matchKey = String(formData.get('matchKey') || '')
  const nome = String(formData.get('nome') || '')
  const tipo = String(formData.get('tipo') || 'outro')
  if (!file || !matchKey) throw new Error('Arquivo e cliente são obrigatórios.')

  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const path = `${matchKey.replace(/\s+/g, '-')}/${crypto.randomUUID()}${ext}`

  const { error: upErr } = await supabase.storage
    .from(DOCS_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (upErr) throw new Error(`Falha ao subir documento: ${upErr.message}`)

  const { data, error } = await supabase
    .from('cliente_documentos')
    .insert({
      cliente_key: matchKey,
      tipo,
      nome_arquivo: file.name,
      path,
      tamanho_bytes: file.size,
      content_type: file.type || '',
    })
    .select('id, tipo, nome_arquivo, path, tamanho_bytes, content_type, created_at')
    .single()
  if (error) {
    // rollback do arquivo se o metadado falhar
    await supabase.storage.from(DOCS_BUCKET).remove([path])
    throw new Error(`Falha ao salvar documento: ${error.message}`)
  }
  revalidatePath('/sistema/clientes')
  return mapDocRow(data)
}

/** Gera uma signed URL (1h) para baixar/visualizar o documento privado. */
export async function getClienteDocumentoUrl(path: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) throw new Error('Falha ao gerar link do documento.')
  return data.signedUrl
}

export async function deleteClienteDocumento(id: string, path: string): Promise<void> {
  const supabase = await createClient()
  await supabase.storage.from(DOCS_BUCKET).remove([path])
  const { error } = await supabase.from('cliente_documentos').delete().eq('id', id)
  if (error) throw new Error(`Falha ao excluir documento: ${error.message}`)
  revalidatePath('/sistema/clientes')
}

// ── consulta manual de score/protestos para um cliente (botão no drawer) ──
export interface ConsultarScoreResult {
  pending: boolean
  score: number | null
  faixa: ScoreFaixa
  protestos: Protesto[]
  message?: string
}

export async function consultarScoreCliente(matchKey: string, nome: string, cpf: string): Promise<ConsultarScoreResult> {
  const { consultarCredito } = await import('@/lib/credit-score-provider')
  const report = await consultarCredito(cpf)
  if (!report.pending) {
    await updateClienteCadastro({
      matchKey,
      nome,
      cpf,
      scoreCredito: report.score,
      scoreFaixa: report.faixa,
      protestos: report.protestos,
    })
  }
  return {
    pending: report.pending,
    score: report.score,
    faixa: report.faixa,
    protestos: report.protestos,
    message: report.message,
  }
}

// ── match da agenda de leilões com o cliente (aba "Leilões recomendados") ──
export async function getAgendaMatchesForCliente(cliente: Cliente) {
  const supabase = await createClient()
  const { matchAgendaToCliente } = await import('@/lib/cliente-agenda-match')
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('bula_leiloes')
    .select('id, nome, data, tipo, local, leiloeira, horario, status')
    .gte('data', today)
    .order('data', { ascending: true })
  if (error) {
    console.warn('[clientes] agenda indisponível:', error.message)
    return []
  }
  const leiloes = (data ?? [])
    .filter((l: { status?: string | null }) => !/cancel/i.test(String(l.status || '')))
    .map((l: Record<string, unknown>) => ({
      id: String(l.id),
      nome: String(l.nome || 'Leilão'),
      data: String(l.data || '').slice(0, 10),
      tipo: l.tipo ? String(l.tipo) : undefined,
      local: l.local ? String(l.local) : undefined,
      leiloeira: l.leiloeira ? String(l.leiloeira) : undefined,
      horario: l.horario ? String(l.horario) : undefined,
      status: l.status ? String(l.status) : undefined,
    }))
  return matchAgendaToCliente(cliente, leiloes)
}

// ── disparo manual de submissão para leiloeiras (aba Leiloeiras do drawer) ──
export async function submitClienteLeiloeiras(
  matchKey: string,
  leiloeiraIds?: string[],
): Promise<{ sent: number; attempted: number; skipped: { leiloeira: string; reason: string }[] }> {
  const supabase = await createClient()
  const { submitClienteToLeiloeiras } = await import('@/lib/leiloeira-submission')
  const r = await submitClienteToLeiloeiras(supabase as never, matchKey, leiloeiraIds)
  revalidatePath('/sistema/clientes')
  return r
}
