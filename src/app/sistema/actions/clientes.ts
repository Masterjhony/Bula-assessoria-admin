'use server'

import { createClient } from '@/utils/supabase/server'
import type { CRMLead, CRMContactEntry } from './crm-leads'
import { recordContact } from './crm-leads'
import type {
  Cliente, CompraHist, InteracaoHist, Interesse, ClienteStatus, PerfilConsumo,
} from '@/lib/clientes'

// ─────────────────────────────────────────────────────────────────────────────
// Clientes/compradores REAIS = agregação dos arremates em `bula_leilao_fechamento`
// (campo `compradores[]`), enriquecidos com os dados de relacionamento do CRM
// (`crm_leads`): telefone, e-mail, histórico de contatos e vínculo para o card.
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

const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g')
const nameKey = (s: string | null | undefined) =>
  String(s ?? '').normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const CONTACT_TIPO: Record<CRMContactEntry['type'], InteracaoHist['tipo']> = {
  ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', visita: 'Visita', outro: 'Reunião',
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

function mapInteracoes(lead?: LeadRow): InteracaoHist[] {
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

/**
 * Agrega os compradores reais de todos os fechamentos e cruza com o CRM.
 * Retorna [] se não houver dados (a página decide o fallback de demonstração).
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
    return []
  }

  const fechamentos = (fechRes.data ?? []) as FechamentoRow[]
  const leads = (leadsRes.data ?? []) as LeadRow[]

  // índice de leads por nome/empresa para o vínculo com o CRM
  const leadByName = new Map<string, LeadRow>()
  for (const l of leads) {
    for (const nm of [l.nome, l.empresa]) {
      const k = nameKey(nm)
      if (k && !leadByName.has(k)) leadByName.set(k, l)
    }
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

  const clientes: Cliente[] = []
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

    const interacoes = mapInteracoes(lead)
    const responsavel = e.comprador && nameKey(e.comprador) !== e.key
      ? e.comprador
      : (lead?.nome && nameKey(lead.nome) !== e.key ? lead.nome : e.nome)

    clientes.push({
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
      interacoes,
      crmLeadId: lead?.id,
      origem: 'fechamento',
    })
  }

  clientes.sort((a, b) => b.compras.reduce((s, x) => s + x.valor, 0) - a.compras.reduce((s, x) => s + x.valor, 0))
  return clientes
}

/**
 * Registra uma interação no histórico de contatos do lead vinculado no CRM.
 * Usado pelo botão "Registrar interação" quando o cliente tem `crmLeadId`.
 */
export async function registrarInteracaoCliente(
  leadId: string,
  entry: { tipo: InteracaoHist['tipo']; responsavel: string; nota: string },
): Promise<void> {
  const TIPO_TO_TYPE: Record<InteracaoHist['tipo'], CRMContactEntry['type']> = {
    Ligação: 'ligacao', WhatsApp: 'whatsapp', 'E-mail': 'email', Visita: 'visita', Reunião: 'outro',
  }
  await recordContact(leadId, {
    type: TIPO_TO_TYPE[entry.tipo],
    date: new Date().toISOString(),
    notes: entry.nota,
    by: entry.responsavel,
  })
}
