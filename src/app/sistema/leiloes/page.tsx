'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Edit2, Trash2, X, ExternalLink, CalendarDays, Users, Tv, Tag,
  Check, Link2, Loader2, BookOpen, Clock, MapPin, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Circle, FileText, ChevronRight,
  Save, ImageIcon, Upload, LayoutGrid, Table2, DollarSign,
  Search, SlidersHorizontal, Download, RefreshCw,
} from 'lucide-react'
import type { BulaLeilao, LeilaoGrupo, LeilaoTask } from '@/lib/bula/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

const MES_NAMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIA_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function parseDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return { dia: d, mesNum: m, mesNome: MES_NAMES[m] ?? '', diaSemana: DIA_NAMES[dt.getDay()] }
}

function taskProgress(task: LeilaoTask): { done: number; total: number } {
  const subs = task.subs ?? []
  if (subs.length > 0) {
    return { done: subs.filter(s => s.done).length, total: subs.length }
  }
  return { done: task.done ? 1 : 0, total: 1 }
}

function groupProgress(group: LeilaoGrupo): { done: number; total: number } {
  let done = 0, total = 0
  for (const t of group.tasks ?? []) {
    const p = taskProgress(t); done += p.done; total += p.total
  }
  return { done, total }
}

function checklistProgress(groups: LeilaoGrupo[]): { done: number; total: number } {
  let done = 0, total = 0
  for (const g of groups ?? []) {
    const p = groupProgress(g); done += p.done; total += p.total
  }
  return { done, total }
}

function fmtBrl(v: number | null | undefined) {
  if (!v) return '—'
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

function csvEscape(v: unknown) {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

const STATUS_STYLES: Record<string, string> = {
  confirmado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  negociacao: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  prospecto:  'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  concluido:  'bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-400',
}
const STATUS_LABELS: Record<string, string> = {
  confirmado: 'Confirmado', negociacao: 'Em negociação', prospecto: 'Prospecto', concluido: 'Concluído',
}
const PRESENCIAL_STYLES: Record<string, string> = {
  VIRTUAL:    'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  PRESENCIAL: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  EXPOGRANDE: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  EXPOZEBU:   'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
}
const MES_LABELS: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
}

function exportLeiloesCSV(rows: MergedLeilao[]) {
  const header = [
    'Data', 'Dia', 'Hora', 'Leilão', 'Criador', 'Modalidade', 'Leiloeira',
    'Raça/Tipo', 'Qtd', 'Sexo', 'Comissão', 'Status',
    'Fat. Previsto', 'Fat. Realizado', 'Venda Bula', 'Comissão a Receber', 'Recebido',
    'Local', 'Transmissão', 'Catálogo',
  ]
  const lines = rows.map(l => [
    l.data, l.dia_semana || '', l.hora || '', l.nome, l.criador || '',
    l.presencial || '', l.leiloeira || '', l.tipo || '',
    l.animais ?? '', l.sexo || '', l.comissao || '',
    l.status ? (STATUS_LABELS[l.status] || l.status) : '',
    l.faturamento_previsto ?? '', l.faturamento_realizado ?? '', l.venda_bula ?? '',
    l.comissao_receber || '', l.recebido || '',
    l.local || '', l.transmissao || '', l.catalogo_url || '',
  ].map(csvEscape).join(';'))
  const csv = '﻿' + [header.map(csvEscape).join(';'), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `leiloes-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DbLeilao = {
  id: string; data: string; dia_semana: string; hora: string; nome: string; criador: string
  presencial: string; leiloeira: string; raca: string; qtd_animais: number | null; sexo: string
  comissao: string; contrato: string; faturamento_previsto: number | null
  faturamento_realizado: number | null; venda_bula: number | null; comissao_receber: string; recebido: string
  img?: string | null
  catalogo_url?: string | null
}

type MergedLeilao = {
  id: string; source: 'bula' | 'cronograma' | 'both'
  bulaId?: string; cronoId?: string
  nome: string; data: string; dia_semana?: string; hora?: string
  tipo?: string; animais?: number; sexo?: string; criador?: string
  presencial?: string; leiloeira?: string
  // bula-only
  img?: string; status?: string; tasks?: LeilaoGrupo[]
  expectativa?: number; meta_bula?: number; realizado_bula?: number
  transmissao?: string; condicao?: string; frete_gratis?: string
  acordo_comissao?: string; catalogo_url?: string; local?: string
  // crono-only
  comissao?: string; contrato?: string
  faturamento_previsto?: number; faturamento_realizado?: number
  venda_bula?: number; comissao_receber?: string; recebido?: string
}

// Palavras genéricas ignoradas ao comparar nomes de leilão.
const MERGE_STOP = new Set([
  'de', 'do', 'da', 'dos', 'das', 'e', 'o', 'os', 'a', 'as',
  'leilao', 'virtual', 'nelore', 'fazenda', 'agropecuaria',
  'etapa', 'remates', 'bula',
])
function mergeTokens(s: string): Set<string> {
  return new Set(
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !MERGE_STOP.has(w))
  )
}
// 0..1 — sobreposição de tokens entre dois nomes.
function nameScore(a: string, b: string): number {
  const ta = mergeTokens(a), tb = mergeTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.min(ta.size, tb.size)
}
function daysApart(a: string, b: string): number {
  const d = (Date.parse(a) - Date.parse(b)) / 86_400_000
  return Number.isFinite(d) ? Math.abs(d) : 999
}
// Similaridade de caracteres (Dice sobre bigramas) — 0..1. Pega variação de
// grafia/erro de digitação no MESMO leilão (ex.: "Neoraço" × "Neloraço").
function diceSim(a: string, b: string): number {
  const norm = (s: string) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  const na = norm(a), nb = norm(b)
  if (na.length < 2 || nb.length < 2) return na.length > 0 && na === nb ? 1 : 0
  const grams = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return m
  }
  const ga = grams(na), gb = grams(nb)
  let inter = 0
  for (const [g, ca] of ga) inter += Math.min(ca, gb.get(g) ?? 0)
  return (2 * inter) / ((na.length - 1) + (nb.length - 1))
}

/**
 * Junta os registros internos (bula_leiloes) com a planilha (cronograma_leiloes).
 *
 * A planilha é a fonte da verdade da agenda: quando um registro interno casa
 * com um leilão da planilha, o card mostra o nome/data da PLANILHA e anexa os
 * dados internos (capa, status, checklist, financeiro). Cada leilão aparece
 * UMA vez — o pareamento é por melhor similaridade de nome dentro de uma
 * janela de data, e cada registro é usado no máximo uma vez.
 */
function mergeLeiloes(bula: (BulaLeilao & { catalogo_url?: string })[], crono: DbLeilao[]): MergedLeilao[] {
  // 1. Pares candidatos (bula ↔ cronograma) pontuados por nome + data.
  const cands: { bi: number; ci: number; score: number }[] = []
  bula.forEach((b, bi) => {
    crono.forEach((c, ci) => {
      const dd = daysApart(b.data, c.data)
      if (dd > 14) return
      const nm = Math.max(
        nameScore(b.nome, c.nome),
        nameScore(b.nome, c.criador || ''),
      )
      // Mesma data: casa por tokens fracos OU por nome muito parecido
      // (variação de grafia — "Neoraço" × "Neloraço"). Datas diferentes:
      // exige tokens fortes (não arrisca casar grafia entre datas).
      const ch = dd === 0
        ? Math.max(diceSim(b.nome, c.nome), diceSim(b.nome, c.criador || ''))
        : 0
      const ok = dd === 0 ? (nm >= 0.34 || ch >= 0.78) : nm >= 0.6
      if (!ok) return
      cands.push({ bi, ci, score: Math.max(nm, ch >= 0.78 ? ch : 0) - dd * 0.03 })
    })
  })
  // 2. Pareamento guloso: maior pontuação primeiro, cada registro 1x só.
  cands.sort((x, y) => y.score - x.score)
  const pairCrono = new Map<number, number>()
  const usedBula = new Set<number>()
  const usedCrono = new Set<number>()
  for (const cd of cands) {
    if (usedBula.has(cd.bi) || usedCrono.has(cd.ci)) continue
    usedBula.add(cd.bi)
    usedCrono.add(cd.ci)
    pairCrono.set(cd.bi, cd.ci)
  }

  const result: MergedLeilao[] = []

  // 3. Registros internos — pareados (dados da planilha) ou só-bula.
  bula.forEach((b, bi) => {
    const ci = pairCrono.get(bi)
    const c = ci !== undefined ? crono[ci] : undefined
    result.push({
      id: b.id, source: c ? 'both' : 'bula',
      bulaId: b.id, cronoId: c?.id,
      // Pareado → nome/data da PLANILHA. Só-bula → o que o registro tem.
      nome: c?.nome || b.nome,
      data: c?.data || b.data,
      dia_semana: c?.dia_semana, hora: c?.hora || b.horario,
      tipo: c?.raca || b.tipo, animais: b.animais || c?.qtd_animais || 0,
      sexo: c?.sexo, criador: c?.criador,
      // Modalidade: o registro Bula manda (e o que o form de edicao grava e o
      // que a agenda publica le). Cronograma so entra como fallback.
      presencial: b.modelo || c?.presencial, leiloeira: c?.leiloeira || b.leiloeira,
      img: (b.img && b.img.startsWith('http')) ? b.img : (c?.img || undefined),
      status: b.status, tasks: b.tasks,
      expectativa: b.expectativa, meta_bula: b.meta_bula, realizado_bula: b.realizado_bula,
      transmissao: b.transmissao, condicao: b.condicao, frete_gratis: b.frete_gratis,
      acordo_comissao: b.acordo_comissao, catalogo_url: b.catalogo_url || c?.catalogo_url || undefined, local: b.local,
      comissao: c?.comissao, contrato: c?.contrato,
      faturamento_previsto: c?.faturamento_previsto ?? undefined,
      faturamento_realizado: c?.faturamento_realizado ?? undefined,
      venda_bula: c?.venda_bula ?? undefined,
      comissao_receber: c?.comissao_receber, recebido: c?.recebido,
    })
  })

  // 4. Leilões da planilha sem registro interno.
  crono.forEach((c, ci) => {
    if (usedCrono.has(ci)) return
    result.push({
      id: c.id, source: 'cronograma', cronoId: c.id,
      nome: c.nome, data: c.data, dia_semana: c.dia_semana, hora: c.hora,
      tipo: c.raca, animais: c.qtd_animais ?? 0, sexo: c.sexo, criador: c.criador,
      presencial: c.presencial, leiloeira: c.leiloeira,
      img: c.img || undefined,
      catalogo_url: c.catalogo_url || undefined,
      comissao: c.comissao, contrato: c.contrato,
      faturamento_previsto: c.faturamento_previsto ?? undefined,
      faturamento_realizado: c.faturamento_realizado ?? undefined,
      venda_bula: c.venda_bula ?? undefined,
      comissao_receber: c.comissao_receber, recebido: c.recebido,
    })
  })

  return result.sort((a, b) => a.data.localeCompare(b.data))
}

// ── Default tasks ─────────────────────────────────────────────────────────────

const EMPTY_RESP = { nome: '', ini: '' }
const mkTask = (id: string, nome: string): LeilaoTask => ({
  id, nome, ini: '', fim: '', resp: { ...EMPTY_RESP }, subs: [], done: false, observacao: '', anexos: [],
})

const DEFAULT_TASKS: LeilaoGrupo[] = [
  {
    nome: 'Pré-Leilão',
    subtitulo: 'Organização dos materiais e classificação dos lotes',
    cor: '#4A8FBF',
    tasks: [
      mkTask('pre-1', 'Receber catálogo em PDF'),
      mkTask('pre-2', 'Receber link do YouTube com os lotes'),
      mkTask('pre-3', 'Receber artes para divulgação'),
      mkTask('pre-4', 'Comitê de avaliação dos lotes e classificação'),
      mkTask('pre-5', 'Adicionar leilão no catálogo da semana'),
      mkTask('pre-6', 'Divulgação no grupo de WhatsApp pré-leilão'),
      mkTask('pre-7', 'Realizar mapa de leilão, direcionando clientes para lotes específicos'),
    ],
  },
  {
    nome: 'Dia do Leilão',
    subtitulo: 'Dia do leilão',
    cor: '#C8A96E',
    tasks: [
      mkTask('dia-1', 'Mandar lotes e avaliações para todos os clientes mapeados'),
      mkTask('dia-2', 'Garantir que todos os clientes estejam cadastrados corretamente'),
      mkTask('dia-3', 'Realizar ligação para os principais clientes'),
      mkTask('dia-4', 'Fazer divulgação massiva dos lotes na hora do leilão'),
      mkTask('dia-5', 'Ao fim do leilão, enviar todos os lotes vendidos com informações no grupo de WhatsApp'),
    ],
  },
  {
    nome: 'Pós-Leilão',
    subtitulo: 'Atividades pós-leilão',
    cor: '#6B8F5C',
    tasks: [
      mkTask('pos-1', 'Fechamento e análise do leilão'),
      mkTask('pos-2', 'Envio de contas a pagar e a receber para financeiro'),
      mkTask('pos-3', 'Provisionar pagamento e comunicar assessores'),
      mkTask('pos-4', 'Postar agradecimento ao criatório nos canais de comunicação'),
    ],
  },
]

type FormState = Omit<BulaLeilao, 'id' | 'assessores' | 'tasks'> & { catalogo_url: string }
function emptyForm(): FormState {
  return { nome: '', data: '', tipo: '', local: '', animais: 0, expectativa: 0, meta_bula: 0, realizado_bula: 0, status: 'confirmado', img: '', horario: '', transmissao: '', modelo: 'PRESENCIAL', leiloeira: 'BULA', condicao: '', frete_gratis: '', acordo_comissao: '', catalogo_url: '' }
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-[#333] bg-white dark:bg-[#0D0D0D] text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-[#A68B4B] transition-colors"

// ── ChecklistPanel ────────────────────────────────────────────────────────────

const GROUP_COLORS = ['#4A8FBF', '#C8A96E', '#6B8F5C', '#A68B4B', '#A864AE', '#D4707A']

type EquipeOption = { id: string; nome: string; iniciais: string; cor: string; empresa: string }

function ChecklistPanel({ leilao, onUpdate }: { leilao: BulaLeilao; onUpdate: (t: LeilaoGrupo[]) => void }) {
  const [groups, setGroups] = useState<LeilaoGrupo[]>(leilao.tasks ?? [])
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(groups.map(g => g.nome)))
  const [addingSubAt, setAddingSubAt] = useState<{ gi: number; ti: number } | null>(null)
  const [newSubLbl, setNewSubLbl] = useState('')
  const [addingTaskAt, setAddingTaskAt] = useState<number | null>(null)
  const [newTaskNome, setNewTaskNome] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupNome, setNewGroupNome] = useState('')
  const [editingTask, setEditingTask] = useState<string | null>(null) // task.id
  const [newAnexoLbl, setNewAnexoLbl] = useState('')
  const [newAnexoUrl, setNewAnexoUrl] = useState('')
  const [equipe, setEquipe] = useState<EquipeOption[]>([])

  useEffect(() => {
    fetch('/api/leiloes/equipe', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: EquipeOption[]) => setEquipe((rows ?? []).filter(m => 'ativo' in m ? (m as unknown as { ativo: boolean }).ativo : true)))
      .catch(() => setEquipe([]))
  }, [])

  const persist = async (next: LeilaoGrupo[]) => {
    setGroups(next); setSaving(true)
    try {
      await fetch(`/api/bula/leiloes/${leilao.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: next }),
      })
      onUpdate(next)
    } finally { setSaving(false) }
  }

  const toggle = (gi: number, ti: number, si: number) => persist(
    groups.map((g, gIdx) => ({ ...g, tasks: g.tasks.map((t, tIdx) => ({ ...t, subs: t.subs.map((s, sIdx) => gIdx === gi && tIdx === ti && sIdx === si ? { ...s, done: !s.done } : s) })) }))
  )

  const removeSub = (gi: number, ti: number, si: number) => persist(
    groups.map((g, gIdx) => gIdx !== gi ? g : { ...g, tasks: g.tasks.map((t, tIdx) => tIdx !== ti ? t : { ...t, subs: t.subs.filter((_, sIdx) => sIdx !== si) }) })
  )

  const addSub = (gi: number, ti: number) => {
    const lbl = newSubLbl.trim()
    if (!lbl) { setAddingSubAt(null); return }
    persist(
      groups.map((g, gIdx) => gIdx !== gi ? g : { ...g, tasks: g.tasks.map((t, tIdx) => tIdx !== ti ? t : { ...t, subs: [...t.subs, { lbl, done: false }] }) })
    )
    setNewSubLbl(''); setAddingSubAt(null)
  }

  const removeTask = (gi: number, ti: number) => {
    if (!confirm('Remover esta tarefa e todos os itens dela?')) return
    persist(groups.map((g, gIdx) => gIdx !== gi ? g : { ...g, tasks: g.tasks.filter((_, tIdx) => tIdx !== ti) }))
  }

  const addTask = (gi: number) => {
    const nome = newTaskNome.trim()
    if (!nome) { setAddingTaskAt(null); return }
    const newId = `t-${Date.now().toString(36)}`
    persist(groups.map((g, gIdx) => gIdx !== gi ? g : { ...g, tasks: [...g.tasks, mkTask(newId, nome)] }))
    setNewTaskNome(''); setAddingTaskAt(null)
  }

  const addGroup = () => {
    const nome = newGroupNome.trim()
    if (!nome) { setAddingGroup(false); return }
    const cor = GROUP_COLORS[groups.length % GROUP_COLORS.length]
    const next = [...groups, { nome, cor, tasks: [] }]
    persist(next)
    setExpanded(prev => new Set([...prev, nome]))
    setNewGroupNome(''); setAddingGroup(false)
  }

  const removeGroup = (gi: number) => {
    if (!confirm(`Remover o grupo "${groups[gi].nome}" inteiro?`)) return
    persist(groups.filter((_, gIdx) => gIdx !== gi))
  }

  // Helpers para o modelo "item plano" (task sem subs)
  const patchTask = (gi: number, ti: number, patch: Partial<LeilaoTask>) =>
    persist(groups.map((g, gIdx) => gIdx !== gi ? g : { ...g, tasks: g.tasks.map((t, tIdx) => tIdx !== ti ? t : { ...t, ...patch }) }))

  const toggleTaskDone = (gi: number, ti: number) =>
    patchTask(gi, ti, { done: !groups[gi].tasks[ti].done })

  const addAnexo = (gi: number, ti: number) => {
    const lbl = newAnexoLbl.trim()
    const url = newAnexoUrl.trim()
    if (!lbl || !url) return
    const cur = groups[gi].tasks[ti].anexos ?? []
    patchTask(gi, ti, { anexos: [...cur, { lbl, url }] })
    setNewAnexoLbl(''); setNewAnexoUrl('')
  }

  const removeAnexo = (gi: number, ti: number, ai: number) => {
    const cur = groups[gi].tasks[ti].anexos ?? []
    patchTask(gi, ti, { anexos: cur.filter((_, idx) => idx !== ai) })
  }

  const restoreDefaults = () => {
    persist(DEFAULT_TASKS)
    setExpanded(new Set(DEFAULT_TASKS.map(g => g.nome)))
  }

  const { done, total } = checklistProgress(groups)
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-gray-100 dark:bg-[#1A1A1A] rounded-full h-2 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : 'linear-gradient(to right, #A68B4B, #C8A96E)' }} />
        </div>
        <span className="text-xs font-semibold text-gray-500 w-14 text-right">{done}/{total} {saving && <Loader2 size={10} className="inline animate-spin ml-1" />}</span>
      </div>
      {groups.map((group, gi) => {
        const isOpen = expanded.has(group.nome)
        const { done: gDone, total: gTotal } = groupProgress(group)
        return (
          <div key={group.nome} className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] overflow-hidden group/group">
            <div className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-[#141414] hover:bg-gray-100 dark:hover:bg-[#1A1A1A] transition-colors">
              <button type="button" onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(group.nome) ? n.delete(group.nome) : n.add(group.nome); return n })} className="flex-1 flex items-center gap-3 text-left">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: group.cor }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-tight">{group.nome}</p>
                  {group.subtitulo && <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{group.subtitulo}</p>}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{gDone}/{gTotal} concluídos</span>
                {isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </button>
              <button
                type="button"
                onClick={() => removeGroup(gi)}
                className="opacity-0 group-hover/group:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                title="Remover grupo"
              >
                <Trash2 size={12} />
              </button>
            </div>
            {isOpen && (
              <div className="divide-y divide-gray-50 dark:divide-[#262626]">
                {group.tasks.map((task, ti) => {
                  const isAddingSub = addingSubAt?.gi === gi && addingSubAt?.ti === ti
                  const hasSubs = (task.subs ?? []).length > 0
                  const isEditing = editingTask === task.id
                  const anexos = task.anexos ?? []

                  if (!hasSubs) {
                    // ── Item plano ─────────────────────────────────────────
                    return (
                      <div key={task.id} className="px-4 py-2.5 group/task">
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            onClick={() => toggleTaskDone(gi, ti)}
                            className="mt-0.5 flex-shrink-0"
                            title={task.done ? 'Marcar como pendente' : 'Marcar como concluído'}
                          >
                            <span className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${task.done ? 'bg-[#A68B4B] border-[#A68B4B]' : 'border-gray-200 dark:border-[#333] hover:border-[#A68B4B]/50'}`}>
                              {task.done && <Check size={10} className="text-black" />}
                            </span>
                          </button>
                          <div className="flex-1 min-w-0">
                            <button type="button" onClick={() => { setEditingTask(isEditing ? null : task.id); setNewAnexoLbl(''); setNewAnexoUrl(''); }} className="text-left w-full">
                              <p className={`text-sm transition-colors leading-snug ${task.done ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}`}>
                                {task.nome}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-gray-400">
                                {task.resp?.nome && (() => {
                                  const m = task.resp?.membro_id ? equipe.find(x => x.id === task.resp.membro_id) : undefined
                                  return (
                                    <span className="inline-flex items-center gap-1">
                                      {m ? (
                                        <span
                                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                                          style={{ background: m.cor }}
                                        >
                                          {m.iniciais}
                                        </span>
                                      ) : (
                                        <Users size={9} />
                                      )}
                                      {task.resp.nome}
                                    </span>
                                  )
                                })()}
                                {task.fim && (
                                  <span className="inline-flex items-center gap-1">
                                    <Clock size={9} /> {task.fim}
                                  </span>
                                )}
                                {task.observacao && (
                                  <span className="inline-flex items-center gap-1 max-w-[180px] truncate" title={task.observacao}>
                                    <FileText size={9} /> {task.observacao}
                                  </span>
                                )}
                                {anexos.length > 0 && (
                                  <span className="inline-flex items-center gap-1">
                                    <Link2 size={9} /> {anexos.length} anexo{anexos.length > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            </button>
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => { setEditingTask(isEditing ? null : task.id); setNewAnexoLbl(''); setNewAnexoUrl(''); }}
                              className="p-1 rounded text-gray-400 hover:text-[#A68B4B] hover:bg-[#A68B4B]/10 transition-all"
                              title={isEditing ? 'Fechar detalhes' : 'Editar detalhes'}
                            >
                              {isEditing ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeTask(gi, ti)}
                              className="opacity-0 group-hover/task:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                              title="Remover item"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>

                        {isEditing && (
                          <div className="mt-2.5 ml-6 p-3 rounded-lg bg-gray-50 dark:bg-[#141414] border border-gray-100 dark:border-[#2A2A2A] space-y-2.5">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Responsável</label>
                                <input
                                  type="text"
                                  list={`equipe-options-${task.id}`}
                                  defaultValue={task.resp?.nome || ''}
                                  onBlur={e => {
                                    const nome = e.target.value.trim()
                                    if (nome === (task.resp?.nome || '')) return
                                    const match = equipe.find(m => m.nome.toLowerCase() === nome.toLowerCase())
                                    patchTask(gi, ti, {
                                      resp: match
                                        ? { nome: match.nome, ini: match.iniciais, membro_id: match.id }
                                        : { nome, ini: nome ? nome[0].toUpperCase() : '', membro_id: null },
                                    })
                                  }}
                                  placeholder={equipe.length ? 'Selecione ou digite' : 'Nome do responsável'}
                                  className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-[#333] bg-white dark:bg-[#0D0D0D] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#A68B4B]"
                                />
                                <datalist id={`equipe-options-${task.id}`}>
                                  {equipe.map(m => (
                                    <option key={m.id} value={m.nome}>
                                      {m.empresa ? `${m.nome} — ${m.empresa}` : m.nome}
                                    </option>
                                  ))}
                                </datalist>
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Prazo</label>
                                <input
                                  type="date"
                                  defaultValue={task.fim || ''}
                                  onBlur={e => {
                                    if (e.target.value === (task.fim || '')) return
                                    patchTask(gi, ti, { fim: e.target.value })
                                  }}
                                  className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-[#333] bg-white dark:bg-[#0D0D0D] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#A68B4B]"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Observação</label>
                              <textarea
                                defaultValue={task.observacao || ''}
                                onBlur={e => {
                                  if (e.target.value === (task.observacao || '')) return
                                  patchTask(gi, ti, { observacao: e.target.value })
                                }}
                                placeholder="Anotação rápida…"
                                rows={2}
                                className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-[#333] bg-white dark:bg-[#0D0D0D] text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-[#A68B4B] resize-none"
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Anexos / Links</label>
                              <div className="space-y-1.5">
                                {anexos.map((a, ai) => (
                                  <div key={ai} className="flex items-center gap-2 px-2 py-1 rounded-md bg-white dark:bg-[#0D0D0D] border border-gray-100 dark:border-[#2A2A2A]">
                                    <Link2 size={10} className="text-[#A68B4B] flex-shrink-0" />
                                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs text-gray-700 dark:text-gray-300 hover:text-[#A68B4B] truncate">{a.lbl}</a>
                                    <button type="button" onClick={() => removeAnexo(gi, ti, ai)} className="p-0.5 rounded text-gray-300 hover:text-red-500" title="Remover">
                                      <X size={10} />
                                    </button>
                                  </div>
                                ))}
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={editingTask === task.id ? newAnexoLbl : ''}
                                    onChange={e => setNewAnexoLbl(e.target.value)}
                                    placeholder="Rótulo"
                                    className="flex-1 px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-[#333] bg-white dark:bg-[#0D0D0D] text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-[#A68B4B]"
                                  />
                                  <input
                                    type="url"
                                    value={editingTask === task.id ? newAnexoUrl : ''}
                                    onChange={e => setNewAnexoUrl(e.target.value)}
                                    placeholder="https://…"
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAnexo(gi, ti) } }}
                                    className="flex-[2] px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-[#333] bg-white dark:bg-[#0D0D0D] text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-[#A68B4B]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => addAnexo(gi, ti)}
                                    disabled={!newAnexoLbl.trim() || !newAnexoUrl.trim()}
                                    className="px-2 py-1 rounded-md text-xs font-bold text-[#A68B4B] hover:bg-[#A68B4B]/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                  >
                                    <Plus size={11} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  }

                  // ── Legacy: task com subs ───────────────────────────────
                  return (
                    <div key={task.id} className="px-4 py-3 group/task">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{task.nome}</p>
                        <button
                          type="button"
                          onClick={() => removeTask(gi, ti)}
                          className="opacity-0 group-hover/task:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                          title="Remover tarefa"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <div className="space-y-2">
                        {task.subs.map((sub, si) => (
                          <div key={si} className="flex items-center gap-2.5 group/sub">
                            <button type="button" onClick={() => toggle(gi, ti, si)} className="flex items-center gap-2.5 flex-1 text-left">
                              <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all ${sub.done ? 'bg-[#A68B4B] border-[#A68B4B]' : 'border-gray-200 dark:border-[#333] group-hover/sub:border-[#A68B4B]/50'}`}>
                                {sub.done && <Check size={10} className="text-black" />}
                              </span>
                              <span className={`text-sm transition-colors ${sub.done ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}`}>{sub.lbl}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSub(gi, ti, si)}
                              className="opacity-0 group-hover/sub:opacity-100 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all flex-shrink-0"
                              title="Remover item"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}

                        {isAddingSub ? (
                          <div className="flex items-center gap-2 pl-6">
                            <input
                              autoFocus
                              type="text"
                              value={newSubLbl}
                              onChange={e => setNewSubLbl(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); addSub(gi, ti) }
                                if (e.key === 'Escape') { setNewSubLbl(''); setAddingSubAt(null) }
                              }}
                              onBlur={() => { if (!newSubLbl.trim()) { setAddingSubAt(null) } }}
                              placeholder="Novo item…"
                              className="flex-1 px-2 py-1 rounded-md border border-[#A68B4B]/40 bg-white dark:bg-[#0D0D0D] text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#A68B4B]"
                            />
                            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => addSub(gi, ti)} className="p-1 rounded text-[#A68B4B] hover:bg-[#A68B4B]/10">
                              <Check size={12} />
                            </button>
                            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setNewSubLbl(''); setAddingSubAt(null) }} className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1A1A1A]">
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setNewSubLbl(''); setAddingSubAt({ gi, ti }) }}
                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#A68B4B] transition-colors pl-6 pt-0.5"
                          >
                            <Plus size={11} /> Adicionar item
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Add new item */}
                <div className="px-4 py-2.5 bg-gray-50/40 dark:bg-[#141414]/40">
                  {addingTaskAt === gi ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={newTaskNome}
                        onChange={e => setNewTaskNome(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); addTask(gi) }
                          if (e.key === 'Escape') { setNewTaskNome(''); setAddingTaskAt(null) }
                        }}
                        onBlur={() => { if (!newTaskNome.trim()) { setAddingTaskAt(null) } }}
                        placeholder="Nome do item…"
                        className="flex-1 px-2.5 py-1.5 rounded-md border border-[#A68B4B]/40 bg-white dark:bg-[#0D0D0D] text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[#A68B4B]"
                      />
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => addTask(gi)} className="p-1.5 rounded text-[#A68B4B] hover:bg-[#A68B4B]/10">
                        <Check size={13} />
                      </button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setNewTaskNome(''); setAddingTaskAt(null) }} className="p-1.5 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1A1A1A]">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setNewTaskNome(''); setAddingTaskAt(gi) }}
                      className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-[#A68B4B] transition-colors"
                    >
                      <Plus size={12} /> Novo item
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Empty state */}
      {groups.length === 0 && !addingGroup && (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-[#333] px-4 py-6 text-center space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum grupo de checklist criado.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={restoreDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#A68B4B] hover:bg-[#C8A96E] text-black text-xs font-bold uppercase tracking-wider transition-colors"
            >
              <Check size={12} /> Usar checklist padrão
            </button>
            <button
              type="button"
              onClick={() => { setNewGroupNome(''); setAddingGroup(true) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#333] text-gray-500 dark:text-gray-400 hover:border-[#A68B4B]/40 hover:text-[#A68B4B] text-xs font-bold uppercase tracking-wider transition-colors"
            >
              <Plus size={12} /> Criar grupo vazio
            </button>
          </div>
        </div>
      )}

      {/* Add new group */}
      {addingGroup ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[#A68B4B]/40 bg-[#A68B4B]/5">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: GROUP_COLORS[groups.length % GROUP_COLORS.length] }} />
          <input
            autoFocus
            type="text"
            value={newGroupNome}
            onChange={e => setNewGroupNome(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); addGroup() }
              if (e.key === 'Escape') { setNewGroupNome(''); setAddingGroup(false) }
            }}
            onBlur={() => { if (!newGroupNome.trim()) { setAddingGroup(false) } }}
            placeholder="Nome do grupo (ex: Logística)…"
            className="flex-1 px-2.5 py-1.5 rounded-md border border-[#A68B4B]/40 bg-white dark:bg-[#0D0D0D] text-sm font-semibold text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#A68B4B]"
          />
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={addGroup} className="p-1.5 rounded text-[#A68B4B] hover:bg-[#A68B4B]/10">
            <Check size={13} />
          </button>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setNewGroupNome(''); setAddingGroup(false) }} className="p-1.5 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1A1A1A]">
            <X size={13} />
          </button>
        </div>
      ) : groups.length > 0 ? (
        <button
          type="button"
          onClick={() => { setNewGroupNome(''); setAddingGroup(true) }}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-dashed border-gray-200 dark:border-[#333] text-xs font-bold uppercase tracking-wider text-gray-400 hover:border-[#A68B4B]/40 hover:text-[#A68B4B] hover:bg-[#A68B4B]/5 transition-colors"
        >
          <Plus size={12} /> Novo grupo
        </button>
      ) : null}
    </div>
  )
}

// ── UnifiedDrawer ─────────────────────────────────────────────────────────────

function UnifiedDrawer({ leilao, onClose, onEdit, onDelete, onTasksUpdate }: {
  leilao: MergedLeilao; onClose: () => void; onEdit: () => void; onDelete: () => void
  onTasksUpdate: (tasks: LeilaoGrupo[]) => void
}) {
  const dt = parseDate(leilao.data)
  const modality = leilao.presencial?.toUpperCase() ?? ''
  const isVirtual = modality === 'VIRTUAL'
  const [imgErr, setImgErr] = useState(false)
  const hasImage = !!leilao.img && !imgErr
  const { done, total } = checklistProgress(leilao.tasks ?? [])

  const bulaAsLeilao = leilao.bulaId ? { id: leilao.bulaId, nome: leilao.nome, data: leilao.data, tipo: leilao.tipo ?? '', local: leilao.local ?? '', animais: leilao.animais ?? 0, expectativa: leilao.expectativa ?? 0, meta_bula: leilao.meta_bula ?? 0, realizado_bula: leilao.realizado_bula ?? 0, status: leilao.status ?? 'confirmado', img: leilao.img ?? '', horario: leilao.hora, transmissao: leilao.transmissao, modelo: leilao.presencial, leiloeira: leilao.leiloeira, condicao: leilao.condicao, frete_gratis: leilao.frete_gratis, acordo_comissao: leilao.acordo_comissao, tasks: leilao.tasks ?? [], assessores: [] } as BulaLeilao : null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 leilao-modal-overlay" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-[#141414] rounded-3xl shadow-[0_20px_70px_-15px_rgba(0,0,0,0.5)] ring-1 ring-black/5 dark:ring-white/5 max-h-[90vh] overflow-hidden flex flex-col leilao-modal-card"
        onClick={e => e.stopPropagation()}
      >

        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-[#141414] border-b border-gray-100 dark:border-[#2A2A2A] px-6 py-4 flex items-start gap-4">
          <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl border border-[#A68B4B]/30 bg-[#A68B4B]/8 flex-shrink-0">
            <span className="text-[#A68B4B] font-black text-xl leading-none">{dt.dia}</span>
            <span className="text-[#A68B4B]/70 text-[10px] font-bold uppercase tracking-wider mt-0.5">{dt.mesNome.slice(0, 3)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-gray-900 dark:text-white text-lg leading-tight uppercase">{leilao.nome}</h2>
            {leilao.criador && <p className="text-xs text-gray-400 mt-0.5">{leilao.criador}</p>}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {leilao.status && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLES[leilao.status]}`}>
                  {STATUS_LABELS[leilao.status]}
                </span>
              )}
              {modality && (
                <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${PRESENCIAL_STYLES[modality] ?? 'bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-400'}`}>
                  {isVirtual ? <Tv size={9} /> : <Users size={9} />} {modality}
                </span>
              )}
              <span className={`inline-flex items-center text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${leilao.source === 'bula' ? 'bg-[#A68B4B]/10 text-[#A68B4B]' : leilao.source === 'both' ? 'bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-400'}`}>
                {leilao.source === 'both' ? '✦ Detalhado' : leilao.source === 'bula' ? 'Bula' : 'Cronograma'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1A1A1A] text-gray-400 transition-colors flex-shrink-0"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Cover image */}
          {hasImage && (
            <div className="rounded-2xl overflow-hidden -mx-6 -mt-5 mb-0 bg-[#181818] flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={leilao.img} alt={leilao.nome} className="max-h-72 w-auto mx-auto object-contain" onError={() => setImgErr(true)} />
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: CalendarDays, label: 'Data', value: `${dt.diaSemana}, ${dt.dia} de ${dt.mesNome}` },
              { icon: Clock, label: 'Horário', value: leilao.hora || '—' },
              { icon: Tag, label: 'Categoria', value: leilao.tipo || '—' },
              { icon: Users, label: 'Animais', value: leilao.animais ? `${leilao.animais.toLocaleString('pt-BR')} animais` : '—' },
              { icon: MapPin, label: 'Local', value: leilao.local || '—' },
              { icon: FileText, label: 'Leiloeira', value: leilao.leiloeira || '—' },
            ].filter(i => i.value && i.value !== '—').map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-gray-50 dark:bg-[#141414] rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={11} className="text-[#A68B4B]" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{value}</p>
              </div>
            ))}
          </div>

          {/* Extras */}
          {(leilao.transmissao || leilao.sexo || leilao.condicao || leilao.frete_gratis || leilao.acordo_comissao || leilao.comissao) && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Detalhes</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Transmissão', value: leilao.transmissao },
                  { label: 'Sexo', value: leilao.sexo },
                  { label: 'Condição', value: leilao.condicao },
                  { label: 'Frete grátis', value: leilao.frete_gratis },
                  { label: 'Comissão Bula', value: leilao.acordo_comissao },
                  { label: 'Negociação', value: leilao.comissao },
                  { label: 'Contrato', value: leilao.contrato },
                  { label: 'Recebido', value: leilao.recebido },
                ].filter(i => i.value).map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 dark:bg-[#141414] rounded-lg px-3 py-2">
                    <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">{label}</p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial */}
          {(leilao.expectativa || leilao.meta_bula || leilao.realizado_bula || leilao.faturamento_previsto || leilao.faturamento_realizado || leilao.venda_bula) && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Financeiro</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Fat. Previsto', value: fmtBrl(leilao.faturamento_previsto) },
                  { label: 'Fat. Realizado', value: fmtBrl(leilao.faturamento_realizado) },
                  { label: 'Venda Bula', value: fmtBrl(leilao.venda_bula) },
                  { label: 'Expectativa', value: fmtBrl(leilao.expectativa) },
                  { label: 'Meta Bula', value: fmtBrl(leilao.meta_bula) },
                  { label: 'Realizado', value: fmtBrl(leilao.realizado_bula) },
                ].filter(i => i.value !== '—').map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-[#A68B4B]/15 bg-[#A68B4B]/5 p-3 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-[#A68B4B]/70 font-semibold mb-0.5">{label}</p>
                    <p className="text-sm font-black text-[#A68B4B]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Catálogo */}
          {leilao.catalogo_url && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#A68B4B]/25 bg-[#A68B4B]/5">
              <BookOpen size={18} className="text-[#A68B4B] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#A68B4B]">Catálogo disponível</p>
                <p className="text-xs text-gray-400 truncate">{leilao.catalogo_url}</p>
              </div>
              <a href={leilao.catalogo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#A68B4B]/10 hover:bg-[#A68B4B]/20 text-[#A68B4B] text-xs font-semibold transition-colors" title="Abrir">
                <ExternalLink size={12} /> Abrir
              </a>
              <a href={leilao.catalogo_url} download className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#A68B4B] hover:bg-[#C8A96E] text-black text-xs font-semibold transition-colors" title="Baixar">
                <Download size={12} /> Baixar
              </a>
            </div>
          )}

          {/* Checklist */}
          {bulaAsLeilao && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Checklist operacional</p>
                <span className="text-xs text-gray-400">{done}/{total} tarefas</span>
              </div>
              <ChecklistPanel leilao={bulaAsLeilao} onUpdate={onTasksUpdate} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-[#141414] border-t border-gray-100 dark:border-[#2A2A2A] px-6 py-4 flex gap-3">
          <button onClick={onDelete} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 border border-red-100 dark:border-red-500/20 transition-colors">
            <Trash2 size={14} /> Excluir
          </button>
          <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#A68B4B] hover:bg-[#C8A96E] text-black text-sm font-semibold transition-colors">
            <Edit2 size={14} /> Editar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Field helpers (escopo de módulo) ───────────────────────────────────────────
// Definidos fora dos modais de propósito: se ficassem dentro do corpo do
// componente, cada render criaria uma função nova, o React remontaria o input e
// o foco se perderia a cada tecla ("só dá pra digitar uma letra por vez").
function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      {children}
    </div>
  )
}

function CronoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div><label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{label}</label>{children}</div>
  )
}

// ── FormModal (bula_leiloes) ───────────────────────────────────────────────────

function FormModal({ initial, cronoId, onClose, onSaved }: {
  initial: (BulaLeilao & { catalogo_url?: string }) | null
  cronoId?: string | null
  onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!initial
  const [form, setForm] = useState<FormState>(() =>
    initial ? { nome: initial.nome, data: initial.data, tipo: initial.tipo, local: initial.local, animais: initial.animais, expectativa: initial.expectativa, meta_bula: initial.meta_bula, realizado_bula: initial.realizado_bula, status: initial.status, img: initial.img ?? '', horario: initial.horario ?? '', transmissao: initial.transmissao ?? '', modelo: initial.modelo ?? 'PRESENCIAL', leiloeira: initial.leiloeira ?? 'BULA', condicao: initial.condicao ?? '', frete_gratis: initial.frete_gratis ?? '', acordo_comissao: initial.acordo_comissao ?? '', catalogo_url: initial.catalogo_url ?? '' }
    : emptyForm()
  )
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingCatalogo, setUploadingCatalogo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof FormState, v: string | number) => setForm(prev => ({ ...prev, [k]: v }))

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/bula/leiloes/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (json.url) set('img', json.url); else setError('Erro ao fazer upload')
    } catch { setError('Erro ao fazer upload') } finally { setUploading(false); e.target.value = '' }
  }

  const handleCatalogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingCatalogo(true); setError(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/leiloes/catalogo-upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (json.url) set('catalogo_url', json.url); else setError(json.error || 'Erro ao enviar catálogo')
    } catch { setError('Erro ao enviar catálogo') } finally { setUploadingCatalogo(false); e.target.value = '' }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim() || !form.data) { setError('Preencha nome e data'); return }
    setSaving(true); setError(null)
    try {
      if (isEdit) {
        const res = await fetch(`/api/bula/leiloes/${initial!.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (!res.ok) throw new Error('Erro ao salvar')
        // Se este leilão também existe na planilha (cronograma_leiloes), o card do
        // admin e a agenda usam o nome/data/etc. do cronograma quando há par —
        // sem propagar para lá a edição "não reflete". Só enviamos campos
        // preenchidos para nunca apagar dados da planilha que o form não tem.
        if (cronoId) {
          const cronoPatch: Record<string, unknown> = { nome: form.nome.trim(), data: form.data }
          if (form.horario?.trim()) cronoPatch.hora = form.horario.trim()
          if (form.tipo?.trim()) cronoPatch.raca = form.tipo.trim()
          if (form.leiloeira?.trim()) cronoPatch.leiloeira = form.leiloeira.trim()
          if (form.modelo?.trim()) cronoPatch.presencial = form.modelo.trim()
          if (form.animais) cronoPatch.qtd_animais = form.animais
          const cronoRes = await fetch(`/api/bula/cronograma/${cronoId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cronoPatch) })
          if (!cronoRes.ok) throw new Error('Salvou no painel, mas falhou ao sincronizar com a agenda')
        }
      } else {
        const res = await fetch('/api/bula/leiloes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, tasks: DEFAULT_TASKS, assessor_ids: [] }) })
        if (!res.ok) throw new Error('Erro ao criar')
      }
      onSaved(); onClose()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const iCls = "w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-[#333] bg-white dark:bg-[#0D0D0D] text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-[#A68B4B] transition-colors"
  const Field = FormField

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#141414] rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-[#2A2A2A]">
          <h2 className="font-bold text-gray-900 dark:text-white text-lg">{isEdit ? 'Editar Leilão' : 'Novo Leilão'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1A1A1A] text-gray-400 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Capa do Leilão</label>
            <label className="block cursor-pointer group">
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
              {form.img ? (
                <div className="relative rounded-xl overflow-hidden h-44">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.img} alt="Capa" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 text-white text-sm font-semibold bg-black/60 px-4 py-2 rounded-xl"><Upload size={14} /> Trocar imagem</span>
                  </div>
                  {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-white" /></div>}
                </div>
              ) : (
                <div className={`flex flex-col items-center justify-center h-36 rounded-xl border-2 border-dashed transition-colors ${uploading ? 'border-[#A68B4B]/50 bg-[#A68B4B]/5' : 'border-gray-200 dark:border-[#333] hover:border-[#A68B4B]/50 hover:bg-[#A68B4B]/3'}`}>
                  {uploading ? <Loader2 size={24} className="animate-spin text-[#A68B4B]" /> : <><ImageIcon size={28} className="text-gray-300 dark:text-gray-700 mb-2" /><p className="text-sm font-semibold text-gray-400">Clique para adicionar capa</p><p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">JPG, PNG, WEBP</p></>}
                </div>
              )}
            </label>
            {form.img && <button type="button" onClick={() => set('img', '')} className="mt-1.5 text-xs text-red-400 hover:text-red-600 transition-colors">Remover capa</button>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nome / Criador" required><input className={iCls} value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Fazenda São Geraldo" /></Field>
            <Field label="Data" required><input type="date" className={iCls} value={form.data} onChange={e => set('data', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoria (tipo)"><input className={iCls} value={form.tipo} onChange={e => set('tipo', e.target.value)} placeholder="Ex: Touros P.O." /></Field>
            <Field label="Nº de Animais"><input type="number" className={iCls} value={form.animais || ''} onChange={e => set('animais', Number(e.target.value))} placeholder="0" min={0} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Modelo">
              <select className={iCls} value={form.modelo} onChange={e => set('modelo', e.target.value)}>
                <option value="PRESENCIAL">Presencial</option><option value="VIRTUAL">Virtual</option>
                <option value="EXPOGRANDE">ExpoGrande</option><option value="EXPOZEBU">ExpoZebu</option>
              </select>
            </Field>
            <Field label="Horário"><input className={iCls} value={form.horario} onChange={e => set('horario', e.target.value)} placeholder="Ex: 13:00" /></Field>
            <Field label="Status">
              <select className={iCls} value={form.status} onChange={e => set('status', e.target.value as FormState['status'])}>
                <option value="confirmado">Confirmado</option><option value="negociacao">Em negociação</option>
                <option value="prospecto">Prospecto</option><option value="concluido">Concluído</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Leiloeira"><input className={iCls} value={form.leiloeira} onChange={e => set('leiloeira', e.target.value)} placeholder="Ex: BULA" /></Field>
            <Field label="Transmissão"><input className={iCls} value={form.transmissao} onChange={e => set('transmissao', e.target.value)} placeholder="Ex: RURALPLAY" /></Field>
          </div>
          <Field label="Local"><input className={iCls} value={form.local} onChange={e => set('local', e.target.value)} placeholder="Cidade / Fazenda" /></Field>
          <Field label="Catálogo (PDF)">
            {form.catalogo_url ? (
              <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-[#A68B4B]/30 bg-[#A68B4B]/5">
                <FileText size={18} className="text-[#A68B4B] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#A68B4B]">Catálogo anexado</p>
                  <p className="text-[11px] text-gray-400 truncate">{form.catalogo_url}</p>
                </div>
                <a href={form.catalogo_url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-[#A68B4B]/10 text-[#A68B4B] transition-colors" title="Abrir"><ExternalLink size={14} /></a>
                <button type="button" onClick={() => set('catalogo_url', '')} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-red-400 hover:text-red-600 transition-colors" title="Remover"><X size={14} /></button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className={`flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${uploadingCatalogo ? 'border-[#A68B4B]/50 bg-[#A68B4B]/5' : 'border-gray-200 dark:border-[#333] hover:border-[#A68B4B]/50 hover:bg-[#A68B4B]/5'}`}>
                  <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleCatalogoUpload} disabled={uploadingCatalogo} />
                  {uploadingCatalogo
                    ? <><Loader2 size={18} className="animate-spin text-[#A68B4B]" /><span className="text-xs font-semibold text-[#A68B4B]">Enviando…</span></>
                    : <><Upload size={18} className="text-gray-400" /><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Anexar PDF do catálogo</span><span className="text-[10px] text-gray-300 dark:text-gray-600">(máx. 25MB)</span></>}
                </label>
                <div className="relative">
                  <Link2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className={`${iCls} pl-9`} value={form.catalogo_url} onChange={e => set('catalogo_url', e.target.value)} placeholder="…ou cole uma URL externa" type="url" />
                </div>
              </div>
            )}
          </Field>
          <div className="pt-1 border-t border-gray-100 dark:border-[#2A2A2A]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Financeiro (opcional)</p>
            <div className="grid grid-cols-3 gap-3">
              {[{ key: 'expectativa' as keyof FormState, label: 'Expectativa (R$)' }, { key: 'meta_bula' as keyof FormState, label: 'Meta Bula (R$)' }, { key: 'realizado_bula' as keyof FormState, label: 'Realizado (R$)' }].map(({ key, label }) => (
                <Field key={key} label={label}><input type="number" className={iCls} value={(form[key] as number) || ''} onChange={e => set(key, Number(e.target.value))} placeholder="0" min={0} /></Field>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Condição"><input className={iCls} value={form.condicao} onChange={e => set('condicao', e.target.value)} placeholder="Ex: 30(2+2+…)" /></Field>
            <Field label="Frete grátis"><input className={iCls} value={form.frete_gratis} onChange={e => set('frete_gratis', e.target.value)} placeholder="Ex: Brasil inteiro" /></Field>
            <Field label="Comissão"><input className={iCls} value={form.acordo_comissao} onChange={e => set('acordo_comissao', e.target.value)} placeholder="Ex: 8% comprador" /></Field>
          </div>
          {isEdit && initial && (
            <div className="pt-1 border-t border-gray-100 dark:border-[#2A2A2A]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Checklist Operacional</p>
              <ChecklistPanel leilao={initial} onUpdate={() => {}} />
            </div>
          )}
          {error && <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm"><AlertCircle size={15} /> {error}</div>}
        </form>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-[#2A2A2A] flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1A1A1A] transition-colors">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#A68B4B] hover:bg-[#C8A96E] text-black text-sm font-semibold disabled:opacity-50 transition-colors">
            {saving && <Loader2 size={14} className="animate-spin" />}{isEdit ? 'Salvar alterações' : 'Criar leilão'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CronogramaFormModal ───────────────────────────────────────────────────────

type DbForm = Omit<DbLeilao, 'id'>
const EMPTY_FORM: DbForm = { data: '', dia_semana: '', hora: '', nome: '', criador: '', presencial: '', leiloeira: '', raca: '', qtd_animais: null, sexo: '', comissao: '', contrato: '', faturamento_previsto: null, faturamento_realizado: null, venda_bula: null, comissao_receber: '', recebido: '', img: '', catalogo_url: '' }

function CronogramaFormModal({ initial, onClose, onSaved }: { initial: DbLeilao | null; onClose: () => void; onSaved: (row: DbLeilao) => void }) {
  const isEdit = !!initial
  const [form, setForm] = useState<DbForm>(initial ? { ...EMPTY_FORM, ...initial, img: initial.img ?? '', catalogo_url: initial.catalogo_url ?? '' } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingCatalogo, setUploadingCatalogo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof DbForm>(k: K, v: DbForm[K]) => setForm(prev => ({ ...prev, [k]: v }))

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setError(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/bula/leiloes/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (json.url) set('img', json.url); else setError('Erro ao fazer upload')
    } catch { setError('Erro ao fazer upload') } finally { setUploading(false); e.target.value = '' }
  }

  const handleCatalogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingCatalogo(true); setError(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/leiloes/catalogo-upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (json.url) set('catalogo_url', json.url); else setError(json.error || 'Erro ao enviar catálogo')
    } catch { setError('Erro ao enviar catálogo') } finally { setUploadingCatalogo(false); e.target.value = '' }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim() || !form.data) { setError('Preencha nome e data'); return }
    setSaving(true); setError(null)
    try {
      const res = isEdit
        ? await fetch(`/api/bula/cronograma/${initial!.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        : await fetch('/api/bula/cronograma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error(await res.text())
      onSaved(await res.json()); onClose()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const Field = CronoField

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-3xl bg-white dark:bg-[#141414] rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-[#2A2A2A]">
          <h2 className="font-bold text-gray-900 dark:text-white text-lg">{isEdit ? 'Editar Leilão' : 'Novo Leilão no Cronograma'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1A1A1A] text-gray-400 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Capa do Leilão</label>
            <label className="block cursor-pointer group">
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
              {form.img ? (
                <div className="relative rounded-xl overflow-hidden h-44">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.img} alt="Capa" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 text-white text-sm font-semibold bg-black/60 px-4 py-2 rounded-xl"><Upload size={14} /> Trocar imagem</span>
                  </div>
                  {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-white" /></div>}
                </div>
              ) : (
                <div className={`flex flex-col items-center justify-center h-36 rounded-xl border-2 border-dashed transition-colors ${uploading ? 'border-[#A68B4B]/50 bg-[#A68B4B]/5' : 'border-gray-200 dark:border-[#333] hover:border-[#A68B4B]/50 hover:bg-[#A68B4B]/3'}`}>
                  {uploading ? <Loader2 size={24} className="animate-spin text-[#A68B4B]" /> : <><ImageIcon size={26} className="text-gray-300 dark:text-gray-700 mb-1.5" /><p className="text-sm font-semibold text-gray-400">Clique para adicionar capa</p><p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">JPG, PNG, WEBP</p></>}
                </div>
              )}
            </label>
            {form.img && <button type="button" onClick={() => set('img', '')} className="mt-1.5 text-xs text-red-400 hover:text-red-600 transition-colors">Remover capa</button>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Data *"><input type="date" className={inputCls} value={form.data} onChange={e => set('data', e.target.value)} required /></Field>
            <Field label="Hora"><input className={inputCls} value={form.hora} onChange={e => set('hora', e.target.value)} placeholder="19:30" /></Field>
            <Field label="Dia da Semana"><input className={inputCls} value={form.dia_semana} onChange={e => set('dia_semana', e.target.value)} placeholder="Sexta-feira" /></Field>
          </div>
          <Field label="Nome do Leilão *"><input className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: NELORE KATAYAMA - TRIOLOGIA" required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Criador"><input className={inputCls} value={form.criador} onChange={e => set('criador', e.target.value)} placeholder="Nome do criador" /></Field>
            <Field label="Raça"><input className={inputCls} value={form.raca} onChange={e => set('raca', e.target.value)} placeholder="Ex: Nelore Padrão" /></Field>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Modalidade">
              <select className={inputCls} value={form.presencial} onChange={e => set('presencial', e.target.value)}>
                <option value="">—</option><option value="VIRTUAL">Virtual</option>
                <option value="PRESENCIAL">Presencial</option><option value="EXPOGRANDE">ExpoGrande</option><option value="EXPOZEBU">ExpoZebu</option>
              </select>
            </Field>
            <Field label="Leiloeira"><input className={inputCls} value={form.leiloeira} onChange={e => set('leiloeira', e.target.value)} placeholder="E-RURAL" /></Field>
            <Field label="Qtd. Animais"><input type="number" className={inputCls} value={form.qtd_animais ?? ''} onChange={e => set('qtd_animais', e.target.value ? Number(e.target.value) : null)} placeholder="0" min={0} /></Field>
            <Field label="Sexo">
              <select className={inputCls} value={form.sexo} onChange={e => set('sexo', e.target.value)}>
                <option value="">—</option><option value="MACHOS">Machos</option><option value="FÊMEAS">Fêmeas</option>
                <option value="MACHOS E FÊMEAS">Machos e Fêmeas</option><option value="TOUROS">Touros</option><option value="EMBRIÕES">Embriões</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Negociação de Comissão"><input className={inputCls} value={form.comissao} onChange={e => set('comissao', e.target.value)} placeholder="1% do Faturamento" /></Field>
            <Field label="Contrato">
              <select className={inputCls} value={form.contrato} onChange={e => set('contrato', e.target.value)}>
                <option value="">—</option><option value="SIM">SIM</option><option value="NÃO">NÃO</option>
              </select>
            </Field>
          </div>
          <div className="pt-2 border-t border-gray-100 dark:border-[#2A2A2A]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Financeiro (opcional)</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Fat. Previsto (R$)"><input type="number" className={inputCls} value={form.faturamento_previsto ?? ''} onChange={e => set('faturamento_previsto', e.target.value ? Number(e.target.value) : null)} placeholder="0" min={0} /></Field>
              <Field label="Fat. Realizado (R$)"><input type="number" className={inputCls} value={form.faturamento_realizado ?? ''} onChange={e => set('faturamento_realizado', e.target.value ? Number(e.target.value) : null)} placeholder="0" min={0} /></Field>
              <Field label="Venda Bula (R$)"><input type="number" className={inputCls} value={form.venda_bula ?? ''} onChange={e => set('venda_bula', e.target.value ? Number(e.target.value) : null)} placeholder="0" min={0} /></Field>
            </div>
          </div>
          <Field label="Catálogo (PDF)">
            {form.catalogo_url ? (
              <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-[#A68B4B]/30 bg-[#A68B4B]/5">
                <FileText size={18} className="text-[#A68B4B] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#A68B4B]">Catálogo anexado</p>
                  <p className="text-[11px] text-gray-400 truncate">{form.catalogo_url}</p>
                </div>
                <a href={form.catalogo_url || '#'} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-[#A68B4B]/10 text-[#A68B4B] transition-colors" title="Abrir"><ExternalLink size={14} /></a>
                <button type="button" onClick={() => set('catalogo_url', '')} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-red-400 hover:text-red-600 transition-colors" title="Remover"><X size={14} /></button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className={`flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${uploadingCatalogo ? 'border-[#A68B4B]/50 bg-[#A68B4B]/5' : 'border-gray-200 dark:border-[#333] hover:border-[#A68B4B]/50 hover:bg-[#A68B4B]/5'}`}>
                  <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleCatalogoUpload} disabled={uploadingCatalogo} />
                  {uploadingCatalogo
                    ? <><Loader2 size={18} className="animate-spin text-[#A68B4B]" /><span className="text-xs font-semibold text-[#A68B4B]">Enviando…</span></>
                    : <><Upload size={18} className="text-gray-400" /><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Anexar PDF do catálogo</span><span className="text-[10px] text-gray-300 dark:text-gray-600">(máx. 25MB)</span></>}
                </label>
                <div className="relative">
                  <Link2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className={inputCls + ' pl-9'} value={form.catalogo_url ?? ''} onChange={e => set('catalogo_url', e.target.value)} placeholder="…ou cole uma URL externa" type="url" />
                </div>
              </div>
            )}
          </Field>
          {error && <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm"><AlertCircle size={15} /> {error}</div>}
        </form>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-[#2A2A2A] flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1A1A1A] transition-colors">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#A68B4B] hover:bg-[#C8A96E] text-black text-sm font-semibold disabled:opacity-50 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{isEdit ? 'Salvar alterações' : 'Adicionar leilão'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── UnifiedCard ───────────────────────────────────────────────────────────────

function UnifiedCard({ leilao, selected, onClick }: { leilao: MergedLeilao; selected: boolean; onClick: () => void }) {
  const dt = parseDate(leilao.data)
  const [imgErr, setImgErr] = useState(false)
  const hasImage = !!leilao.img && !imgErr
  const { done, total } = checklistProgress(leilao.tasks ?? [])
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const modality = leilao.presencial?.toUpperCase() ?? ''
  const isVirtual = modality === 'VIRTUAL'

  const base = `w-full text-left group rounded-2xl border transition-all duration-200 ${selected ? 'border-[#A68B4B]/50 bg-[#A68B4B]/5 dark:bg-[#A68B4B]/8 shadow-md shadow-[#A68B4B]/10' : 'border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] hover:border-[#A68B4B]/30 hover:shadow-sm'}`

  if (hasImage) {
    return (
      <button onClick={onClick} className={`${base} flex overflow-hidden`}>
        {/* Image */}
        <div className="relative flex-shrink-0 w-36 sm:w-44 bg-[#181818] overflow-hidden self-stretch">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={leilao.img} alt={leilao.nome} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
          <div className="absolute bottom-2 left-2 flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-black/65 backdrop-blur-sm border border-white/15">
            <span className="text-white font-black text-sm leading-none">{dt.dia}</span>
            <span className="text-white/60 text-[8px] font-bold uppercase tracking-wide mt-0.5">{dt.mesNome.slice(0, 3)}</span>
          </div>
          {leilao.source === 'both' && (
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#A68B4B] shadow-[0_0_6px_rgba(166, 139, 75,0.8)]" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 px-4 py-3.5 flex flex-col justify-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-gray-900 dark:text-white font-black text-sm uppercase leading-tight">{leilao.nome}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {modality && (
              <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${PRESENCIAL_STYLES[modality] ?? 'bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-400'}`}>
                {isVirtual ? <Tv size={9} /> : <Users size={9} />} {modality}
              </span>
            )}
            {leilao.status && (
              <span className={`inline-flex items-center text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${STATUS_STYLES[leilao.status]}`}>{STATUS_LABELS[leilao.status]}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {(leilao.tipo || leilao.animais) && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-[#A68B4B]">
                <Tag size={9} /> {leilao.tipo}{leilao.animais ? <span className="text-gray-400 font-normal">· {leilao.animais} animais</span> : null}
              </span>
            )}
            {leilao.criador && <span className="text-[10px] text-gray-500">{leilao.criador}</span>}
            <span className="text-[10px] text-gray-500">{dt.diaSemana}{leilao.hora ? ` · ${leilao.hora}` : ''}</span>
            {leilao.leiloeira && <span className="text-[10px] text-gray-400 uppercase">{leilao.leiloeira}{leilao.transmissao ? ` · ${leilao.transmissao}` : ''}</span>}
          </div>
          {leilao.faturamento_previsto && (
            <span className="text-[10px] text-gray-400"><DollarSign size={9} className="inline mr-0.5" />Fat. previsto: <span className="font-semibold text-gray-600 dark:text-gray-300">{fmtBrl(leilao.faturamento_previsto)}</span></span>
          )}
          {total > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-20 bg-gray-100 dark:bg-[#1A1A1A] rounded-full h-1 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#A68B4B' }} />
              </div>
              <span className="text-[10px] text-gray-400">{done}/{total}</span>
              {pct === 100 && <CheckCircle2 size={11} className="text-emerald-500" />}
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex flex-col items-center justify-center gap-2 px-3 flex-shrink-0">
          {leilao.catalogo_url && <span className="inline-flex items-center gap-1 text-[10px] text-[#A68B4B] bg-[#A68B4B]/10 px-2 py-1 rounded-lg"><BookOpen size={10} /> Catálogo</span>}
          <ChevronRight size={15} className={`text-gray-300 dark:text-gray-700 transition-transform ${selected ? 'rotate-90 text-[#A68B4B]' : 'group-hover:text-gray-500'}`} />
        </div>
      </button>
    )
  }

  return (
    <button onClick={onClick} className={`${base} grid grid-cols-[56px_1fr_auto] items-center gap-4 p-3.5`}>
      {/* Date badge */}
      <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl border flex-shrink-0 transition-colors ${selected ? 'border-[#A68B4B]/40 bg-[#A68B4B]/12' : 'border-[#A68B4B]/20 bg-[#A68B4B]/6 group-hover:border-[#A68B4B]/35'}`}>
        <span className="text-[#A68B4B] font-black text-xl leading-none">{dt.dia}</span>
        <span className="text-[#A68B4B]/70 text-[9px] font-bold uppercase tracking-wider mt-0.5">{dt.mesNome.slice(0, 3)}</span>
      </div>

      {/* Content */}
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-gray-900 dark:text-white font-black text-sm uppercase leading-tight">{leilao.nome}</p>
          {modality && (
            <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${PRESENCIAL_STYLES[modality] ?? 'bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-400'}`}>
              {isVirtual ? <Tv size={9} /> : <Users size={9} />} {modality}
            </span>
          )}
          {leilao.status && <span className={`inline-flex items-center text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${STATUS_STYLES[leilao.status]}`}>{STATUS_LABELS[leilao.status]}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {(leilao.tipo || leilao.animais) && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-[#A68B4B]">
              <Tag size={9} /> {leilao.tipo}{leilao.animais ? <span className="text-gray-400 font-normal">· {leilao.animais} animais</span> : null}
            </span>
          )}
          {leilao.criador && <span className="text-[10px] text-gray-500">{leilao.criador}</span>}
          <span className="text-[10px] text-gray-500">{dt.diaSemana}{leilao.hora ? ` · ${leilao.hora}` : ''}</span>
          {leilao.leiloeira && <span className="text-[10px] text-gray-400 uppercase">{leilao.leiloeira}</span>}
        </div>
        {leilao.comissao && <span className="text-[10px] text-gray-400">Comissão: {leilao.comissao}</span>}
        {total > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 max-w-20 bg-gray-100 dark:bg-[#1A1A1A] rounded-full h-1 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#A68B4B' }} />
            </div>
            <span className="text-[10px] text-gray-400">{done}/{total}</span>
            {pct === 100 && <CheckCircle2 size={11} className="text-emerald-500" />}
          </div>
        )}
      </div>

      {/* Right */}
      <div className="flex flex-col items-center gap-2 flex-shrink-0">
        {leilao.catalogo_url && <span className="inline-flex items-center gap-1 text-[10px] text-[#A68B4B] bg-[#A68B4B]/10 px-2 py-1 rounded-lg"><BookOpen size={10} /> Catálogo</span>}
        <ChevronRight size={15} className={`text-gray-300 dark:text-gray-700 transition-transform ${selected ? 'rotate-90 text-[#A68B4B]' : 'group-hover:text-gray-500'}`} />
      </div>
    </button>
  )
}

// ── TableView ─────────────────────────────────────────────────────────────────

function TableView({ rows, onEdit, onDelete }: { rows: MergedLeilao[]; onEdit: (l: MergedLeilao) => void; onDelete: (l: MergedLeilao) => void }) {
  const grupos: Record<string, MergedLeilao[]> = {}
  for (const l of rows) {
    const key = l.data.slice(0, 7)
    if (!grupos[key]) grupos[key] = []
    grupos[key].push(l)
  }

  return (
    <div className="space-y-6">
      {Object.entries(grupos).map(([mesKey, leiloes]) => (
        <div key={mesKey}>
          <div className="flex items-center gap-3 mb-3">
            <CalendarDays size={14} className="text-[#A68B4B] flex-shrink-0" />
            <span className="text-[#A68B4B] text-xs font-black uppercase tracking-[0.2em]">{MES_LABELS[mesKey.slice(5)] ?? mesKey} {mesKey.slice(0, 4)}</span>
            <div className="flex-1 h-px bg-gradient-to-r from-[#A68B4B]/20 to-transparent" />
            <span className="text-[10px] text-gray-400">{leiloes.length} leilão{leiloes.length !== 1 ? 'ões' : ''}</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-[#2A2A2A]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#141414] border-b border-gray-100 dark:border-[#2A2A2A]">
                  {['Data', 'Hora', 'Leilão', 'Criador', 'Modalidade', 'Leiloeira', 'Raça / Tipo', 'Qtd', 'Sexo', 'Comissão', 'Fat. Previsto', 'Fat. Realizado', ''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-[#262626]">
                {leiloes.map(l => {
                  const d = l.data
                  const modality = l.presencial?.toUpperCase() ?? ''
                  return (
                    <tr key={l.id} className="group bg-white dark:bg-[#141414] hover:bg-[#A68B4B]/3 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col items-center justify-center w-9 h-9 rounded-lg border border-[#A68B4B]/20 bg-[#A68B4B]/6 flex-shrink-0">
                            <span className="text-[#A68B4B] font-black text-sm leading-none">{d.slice(8)}</span>
                            <span className="text-[#A68B4B]/60 text-[7px] font-bold uppercase">{MES_LABELS[d.slice(5, 7)]?.slice(0, 3)}</span>
                          </div>
                          {l.dia_semana && <span className="text-gray-400 text-[10px]">{l.dia_semana.slice(0, 3)}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-gray-700 dark:text-gray-300">{l.hora || '—'}</td>
                      <td className="px-3 py-2.5 font-bold text-gray-900 dark:text-white uppercase max-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          {l.img && <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0 bg-[#181818]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={l.img} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          </div>}
                          <span className="line-clamp-2 leading-tight">{l.nome}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 max-w-[140px]"><span className="line-clamp-1">{l.criador || '—'}</span></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {modality ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${PRESENCIAL_STYLES[modality] ?? 'bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-400'}`}>
                            {modality === 'VIRTUAL' ? <Tv size={9} /> : <Users size={9} />} {modality}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-400 uppercase font-medium">{l.leiloeira || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-400">{l.tipo || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-center font-semibold text-gray-700 dark:text-gray-300">{l.animais || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-400">{l.sexo || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 max-w-[160px]"><span className="line-clamp-2">{l.comissao || '—'}</span></td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-gray-700 dark:text-gray-300">{fmtBrl(l.faturamento_previsto)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-gray-700 dark:text-gray-300">{fmtBrl(l.faturamento_realizado)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => onEdit(l)} className="p-1.5 rounded-lg text-gray-400 hover:text-[#A68B4B] hover:bg-[#A68B4B]/10 transition-colors"><Edit2 size={12} /></button>
                          <button onClick={() => onDelete(l)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LeiloesPage() {
  const [bulaLeiloes, setBulaLeiloes] = useState<(BulaLeilao & { catalogo_url?: string })[]>([])
  const [cronoLeiloes, setCronoLeiloes] = useState<DbLeilao[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'cards' | 'tabela'>('cards')
  const [selected, setSelected] = useState<MergedLeilao | null>(null)
  const [mesFiltro, setMesFiltro] = useState('Todos')
  const [busca, setBusca] = useState('')
  const [modalidadeFiltro, setModalidadeFiltro] = useState('Todas')
  const [leiloeiraFiltro, setLeiloeiraFiltro] = useState('Todas')
  const [statusFiltro, setStatusFiltro] = useState('Todos')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [showAdvFilters, setShowAdvFilters] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [showBulaForm, setShowBulaForm] = useState(false)
  const [showCronoForm, setShowCronoForm] = useState(false)
  const [editBula, setEditBula] = useState<(BulaLeilao & { catalogo_url?: string }) | null>(null)
  const [editBulaCronoId, setEditBulaCronoId] = useState<string | null>(null)
  const [editCrono, setEditCrono] = useState<DbLeilao | null>(null)

  // Sync from Google Sheets (workflow_dispatch via GitHub API)
  const [syncing, setSyncing] = useState(false)
  const handleSyncSheets = async () => {
    if (syncing) return
    if (!confirm(
      'Disparar sincronização da planilha do Google Sheets?\n\n'
      + 'Isso vai puxar os textos (cronograma) e as capas (bula) da planilha '
      + 'pública. Leva ~1 minuto. A página atualiza automaticamente em 90s.'
    )) return
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/sync-leiloes-sheets', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        alert(body.message || 'Sincronização disparada.')
        setTimeout(() => fetchAll(), 90_000)
      } else {
        alert(`Falha: ${body.error || res.statusText}`)
      }
    } catch (err) {
      alert(`Erro ao disparar sincronização: ${(err as Error).message}`)
    } finally {
      setSyncing(false)
    }
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [bulaRes, cronoRes] = await Promise.all([
        fetch('/api/bula/leiloes'),
        fetch('/api/bula/cronograma'),
      ])
      if (bulaRes.ok) setBulaLeiloes(await bulaRes.json())
      if (cronoRes.ok) setCronoLeiloes(await cronoRes.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const merged = useMemo(() => mergeLeiloes(bulaLeiloes, cronoLeiloes), [bulaLeiloes, cronoLeiloes])

  // Keep selected in sync after refresh
  useEffect(() => {
    if (selected) {
      const updated = merged.find(l => l.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [merged]) // eslint-disable-line react-hooks/exhaustive-deps

  const meses = useMemo(() => ['Todos', ...Array.from(new Set(merged.map(l => parseDate(l.data).mesNome))).filter(Boolean)], [merged])
  const leiloeirasOpts = useMemo(
    () => ['Todas', ...Array.from(new Set(merged.map(l => l.leiloeira).filter(Boolean) as string[])).sort()],
    [merged]
  )

  const buscaNorm = normalize(busca)
  const filtered = merged.filter(l => {
    if (mesFiltro !== 'Todos' && parseDate(l.data).mesNome !== mesFiltro) return false
    if (modalidadeFiltro !== 'Todas' && (l.presencial?.toUpperCase() ?? '') !== modalidadeFiltro) return false
    if (leiloeiraFiltro !== 'Todas' && l.leiloeira !== leiloeiraFiltro) return false
    if (statusFiltro !== 'Todos' && l.status !== statusFiltro) return false
    if (dataInicio && (!l.data || l.data < dataInicio)) return false
    if (dataFim && (!l.data || l.data > dataFim)) return false
    if (buscaNorm) {
      const hay = normalize(`${l.nome} ${l.criador ?? ''} ${l.tipo ?? ''} ${l.leiloeira ?? ''}`)
      if (!hay.includes(buscaNorm)) return false
    }
    return true
  })

  const periodoAtivo = !!(dataInicio || dataFim)
  const activeFiltersCount =
    (modalidadeFiltro !== 'Todas' ? 1 : 0) +
    (leiloeiraFiltro !== 'Todas' ? 1 : 0) +
    (statusFiltro !== 'Todos' ? 1 : 0) +
    (periodoAtivo ? 1 : 0) +
    (busca.trim() ? 1 : 0)
  const clearFilters = () => {
    setBusca(''); setModalidadeFiltro('Todas'); setLeiloeiraFiltro('Todas'); setStatusFiltro('Todos')
    setDataInicio(''); setDataFim('')
  }

  const grupos: Record<string, MergedLeilao[]> = {}
  for (const l of filtered) {
    const { mesNome } = parseDate(l.data)
    if (!grupos[mesNome]) grupos[mesNome] = []
    grupos[mesNome].push(l)
  }

  // Stats
  const totalAnimais = merged.reduce((s, l) => s + (Number(l.animais) || 0), 0)
  const confirmados = merged.filter(l => l.status === 'confirmado').length
  const comImagem = merged.filter(l => l.img && l.img.startsWith('http')).length
  const presenciais = merged.filter(l => ['PRESENCIAL', 'EXPOGRANDE', 'EXPOZEBU'].includes(l.presencial?.toUpperCase() ?? '')).length

  const handleDelete = async () => {
    if (!selected) return
    if (!confirm(`Excluir "${selected.nome}"?`)) return
    setDeleting(true)
    try {
      if (selected.bulaId) await fetch(`/api/bula/leiloes/${selected.bulaId}`, { method: 'DELETE' })
      if (selected.cronoId && selected.source !== 'both') await fetch(`/api/bula/cronograma/${selected.cronoId}`, { method: 'DELETE' })
      setSelected(null)
      fetchAll()
    } finally { setDeleting(false) }
  }

  const handleTableDelete = async (l: MergedLeilao) => {
    if (!confirm(`Excluir "${l.nome}"?`)) return
    setDeleting(true)
    try {
      if (l.bulaId) await fetch(`/api/bula/leiloes/${l.bulaId}`, { method: 'DELETE' })
      else if (l.cronoId) await fetch(`/api/bula/cronograma/${l.cronoId}`, { method: 'DELETE' })
      fetchAll()
    } finally { setDeleting(false) }
  }

  const handleEdit = (l: MergedLeilao) => {
    if (l.bulaId) {
      const b = bulaLeiloes.find(b => b.id === l.bulaId)
      if (b) { setEditBula(b); setEditBulaCronoId(l.cronoId ?? null); setShowBulaForm(true); return }
    }
    if (l.cronoId) {
      const c = cronoLeiloes.find(c => c.id === l.cronoId)
      if (c) { setEditCrono(c); setShowCronoForm(true) }
    }
  }

  const handleTasksUpdate = (tasks: LeilaoGrupo[]) => {
    setBulaLeiloes(prev => prev.map(l => l.id === selected?.bulaId ? { ...l, tasks } : l))
    if (selected) setSelected(s => s ? { ...s, tasks } : s)
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="page-head">
        <h1>
          <small>Leilões</small>
          Agenda 2026
          <span className="block text-[12px] font-normal subtle mt-2">{merged.length} {merged.length === 1 ? 'leilão' : 'leilões'} cadastrados</span>
        </h1>
        <button
          onClick={() => { setEditBula(null); setEditBulaCronoId(null); setShowBulaForm(true) }}
          className="btn primary"
        >
          <Plus size={14} /> Novo leilão
        </button>
      </div>

      <>

      {/* Stats */}
      <div className="slim-row">
        <div className="slim-kpi">
          <div className="slim-kpi-val">{merged.length}</div>
          <div className="slim-kpi-lbl">Leilões</div>
        </div>
        <div className="slim-div" />
        <div className="slim-kpi">
          <div className="slim-kpi-val tabular-nums">{totalAnimais.toLocaleString('pt-BR')}</div>
          <div className="slim-kpi-lbl">Animais</div>
        </div>
        <div className="slim-div" />
        <div className="slim-kpi">
          <div className="slim-kpi-val">{confirmados}</div>
          <div className="slim-kpi-lbl">Confirmados</div>
        </div>
        <div className="slim-div" />
        <div className="slim-kpi">
          <div className="slim-kpi-val">{presenciais}</div>
          <div className="slim-kpi-lbl">Presenciais / Expo</div>
        </div>
      </div>

      {/* Filters: search + advanced + view toggle */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, criador, raça, leiloeira…"
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-gray-200 dark:border-[#333] bg-white dark:bg-[#0D0D0D] text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-[#A68B4B] transition-colors"
            />
            {busca && (
              <button onClick={() => setBusca('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-[#1A1A1A]">
                <X size={13} />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowAdvFilters(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${showAdvFilters || activeFiltersCount > 0 ? 'border-[#A68B4B] bg-[#A68B4B]/10 text-[#A68B4B]' : 'border-gray-200 dark:border-[#333] text-gray-500 dark:text-gray-400 hover:border-[#A68B4B]/40 hover:text-[#A68B4B]'}`}
          >
            <SlidersHorizontal size={13} /> Filtros
            {activeFiltersCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#A68B4B] text-black text-[10px] font-black">{activeFiltersCount}</span>
            )}
          </button>

          {activeFiltersCount > 0 && (
            <button onClick={clearFilters} className="text-xs font-semibold text-gray-400 hover:text-red-500 transition-colors">
              Limpar
            </button>
          )}

          <div className="flex-1" />

          <button
            onClick={handleSyncSheets}
            disabled={syncing}
            title="Sincronizar agenda e capas a partir da planilha do Google Sheets"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-gray-200 dark:border-[#333] text-gray-600 dark:text-gray-300 hover:border-[#A68B4B] hover:text-[#A68B4B] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {syncing ? 'Sincronizando…' : 'Sincronizar planilha'}
          </button>

          <button
            onClick={() => exportLeiloesCSV(filtered)}
            disabled={filtered.length === 0}
            title="Exportar leilões filtrados em CSV"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-gray-200 dark:border-[#333] text-gray-600 dark:text-gray-300 hover:border-[#A68B4B] hover:text-[#A68B4B] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Download size={13} /> Exportar
          </button>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-100 dark:bg-[#141414]">
            <button onClick={() => setView('cards')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'cards' ? 'bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
              <LayoutGrid size={13} /> Cards
            </button>
            <button onClick={() => setView('tabela')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'tabela' ? 'bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
              <Table2 size={13} /> Tabela
            </button>
          </div>
        </div>

        {/* Advanced filters panel */}
        {showAdvFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 rounded-2xl border border-gray-100 dark:border-[#2A2A2A] bg-gray-50/50 dark:bg-[#141414] leilao-filters-panel">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Modalidade</label>
              <select value={modalidadeFiltro} onChange={e => setModalidadeFiltro(e.target.value)} className={inputCls}>
                <option value="Todas">Todas</option>
                <option value="VIRTUAL">Virtual</option>
                <option value="PRESENCIAL">Presencial</option>
                <option value="EXPOGRANDE">ExpoGrande</option>
                <option value="EXPOZEBU">ExpoZebu</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Leiloeira</label>
              <select value={leiloeiraFiltro} onChange={e => setLeiloeiraFiltro(e.target.value)} className={inputCls}>
                {leiloeirasOpts.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Status</label>
              <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} className={inputCls}>
                <option value="Todos">Todos</option>
                <option value="confirmado">Confirmado</option>
                <option value="negociacao">Em negociação</option>
                <option value="prospecto">Prospecto</option>
                <option value="concluido">Concluído</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Período</label>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">— de uma data específica ou um intervalo</span>
                {periodoAtivo && (
                  <button
                    onClick={() => { setDataInicio(''); setDataFim('') }}
                    className="ml-auto text-[10px] font-semibold text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Limpar período
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase tracking-wider text-gray-400 pointer-events-none">De</span>
                  <input
                    type="date"
                    value={dataInicio}
                    max={dataFim || undefined}
                    onChange={e => setDataInicio(e.target.value)}
                    className={`${inputCls} pl-10`}
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase tracking-wider text-gray-400 pointer-events-none">Até</span>
                  <input
                    type="date"
                    value={dataFim}
                    min={dataInicio || undefined}
                    onChange={e => setDataFim(e.target.value)}
                    className={`${inputCls} pl-12`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Month chips */}
        <div className="flex gap-2 flex-wrap">
          {meses.map(mes => (
            <button key={mes} onClick={() => setMesFiltro(mes)} className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border transition-all ${mesFiltro === mes ? 'bg-[#A68B4B] text-black border-[#A68B4B]' : 'border-gray-200 dark:border-[#333] text-gray-500 dark:text-gray-400 hover:border-[#A68B4B]/40 hover:text-[#A68B4B]'}`}>
              {mes}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-[#A68B4B]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <Circle size={40} className="text-gray-200 dark:text-gray-800" />
          <p className="text-sm text-gray-500">Nenhum leilão encontrado</p>
        </div>
      ) : view === 'tabela' ? (
        <TableView rows={filtered} onEdit={handleEdit} onDelete={handleTableDelete} />
      ) : (
        <div className="space-y-8">
          {Object.entries(grupos).map(([mes, events]) => (
            <div key={mes}>
              <div className="flex items-center gap-3 mb-4">
                <CalendarDays size={14} className="text-[#A68B4B] flex-shrink-0" />
                <span className="text-[#A68B4B] text-xs font-black uppercase tracking-[0.2em]">{mes}</span>
                <div className="flex-1 h-px bg-gradient-to-r from-[#A68B4B]/20 to-transparent" />
                <span className="text-[10px] text-gray-400">{events.length} evento{events.length > 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2.5">
                {events.map(leilao => (
                  <UnifiedCard
                    key={leilao.id}
                    leilao={leilao}
                    selected={selected?.id === leilao.id}
                    onClick={() => setSelected(s => s?.id === leilao.id ? null : leilao)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <UnifiedDrawer
          leilao={selected}
          onClose={() => setSelected(null)}
          onEdit={() => handleEdit(selected)}
          onDelete={handleDelete}
          onTasksUpdate={handleTasksUpdate}
        />
      )}

      {/* Delete overlay */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <Loader2 size={32} className="animate-spin text-white" />
        </div>
      )}

      {/* Bula form modal */}
      {showBulaForm && (
        <FormModal
          initial={editBula}
          cronoId={editBulaCronoId}
          onClose={() => { setShowBulaForm(false); setEditBula(null); setEditBulaCronoId(null) }}
          onSaved={() => { fetchAll(); setSelected(null) }}
        />
      )}

      {/* Cronograma form modal */}
      {showCronoForm && (
        <CronogramaFormModal
          initial={editCrono}
          onClose={() => { setShowCronoForm(false); setEditCrono(null) }}
          onSaved={() => { fetchAll() }}
        />
      )}

      </>
    </div>
  )
}
