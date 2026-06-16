'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CRMLead, CRMContactEntry } from './crm-leads'
import { recordContact } from './crm-leads'
import {
  type Cliente, type CompraHist, type InteracaoHist, type Interesse,
  type ClienteStatus, type PerfilConsumo, type PreferenciaCategoria,
  clienteMatchKey,
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
  'estado' | 'data_estimada_fechamento' | 'contact_history'>

type ClienteRow = {
  id: string; match_key: string; nome: string
  responsavel: string | null; telefone: string | null; email: string | null
  cidade: string | null; uf: string | null; perfil: string | null; status: string | null
  recorrente: boolean | null; interesses: unknown; tags: unknown
  observacoes: string | null; preferencias: string | null
  preferencias_categorias: unknown
  proximo_followup: string | null; crm_lead_id: string | null
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
      .select('id, nome, empresa, telefone, celular, email, status, temperatura, prioridade, interesse, o_que_busca, cidade, estado, data_estimada_fechamento, contact_history')
      .eq('arquivado', false),
  ])

  if (fechRes.error) {
    console.error('[clientes] erro ao ler fechamentos:', fechRes.error.message)
  }

  // Tabelas do módulo CLIENTES podem ainda não existir (migration 0028 não
  // aplicada) — degrada para vazio sem quebrar a página.
  const [clienteRes, interRes] = await Promise.all([
    supabase.from('clientes').select('*'),
    supabase.from('cliente_interacoes').select('id, cliente_key, tipo, responsavel, nota, data'),
  ])
  if (clienteRes.error) console.warn('[clientes] tabela clientes indisponível:', clienteRes.error.message)
  if (interRes.error) console.warn('[clientes] tabela cliente_interacoes indisponível:', interRes.error.message)

  const fechamentos = (fechRes.data ?? []) as FechamentoRow[]
  const leads = (leadsRes.data ?? []) as LeadRow[]
  const clienteRows = (clienteRes.data ?? []) as ClienteRow[]
  const interacaoRows = (interRes.data ?? []) as InteracaoRow[]

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
      })
    }
  }

  // anexa interações persistidas e ordena
  for (const cliente of byKey.values()) {
    const persisted = cliente.matchKey ? interByKey.get(cliente.matchKey) ?? [] : []
    if (persisted.length) {
      cliente.interacoes = [...cliente.interacoes, ...persisted]
    }
    cliente.interacoes.sort((a, b) => b.data.localeCompare(a.data))
  }

  return [...byKey.values()].sort((a, b) => totalDe(b) - totalDe(a))
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
