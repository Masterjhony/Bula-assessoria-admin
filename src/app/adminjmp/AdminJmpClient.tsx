'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Save, Upload, Trash2, Plus, ChevronUp, ChevronDown, ExternalLink,
  LogOut, Loader2, ImageIcon, GripVertical, Eye, Mail, Paperclip,
  Image as ImageLucide, Table2, CheckCircle2, FileText, Clock, Calendar,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import type { JmpContent, JmpBlock, JmpFoto, JmpFlowEmail, JmpEmailAttachment, JmpHero, JmpBenefit, JmpStat } from '@/lib/jmp-content'

// ── upload: navegador → Supabase Storage direto (via URL assinada) ──────────
async function uploadFile(file: File, folder: string): Promise<string> {
  const res = await fetch('/api/jmp/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, filename: file.name }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Falha ao preparar upload.')
  const { error } = await createClient().storage
    .from('jmp-landing')
    .uploadToSignedUrl(json.path, json.token, file)
  if (error) throw new Error(error.message)
  return json.publicUrl as string
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bloco'
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr
  const copy = [...arr]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

// ── UI atoms ────────────────────────────────────────────────────────────────
const card = 'rounded-2xl border border-neutral-200/80 bg-white shadow-sm'
const lbl = 'block text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-1'
const input =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 transition'
const btn = 'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50'
const btnPrimary = `${btn} bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm`
const btnDark = `${btn} bg-neutral-900 text-white hover:bg-neutral-700`
const btnGhost = `${btn} text-neutral-600 hover:bg-neutral-100`

function Field({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input className={`${input} ${mono ? 'font-mono text-xs' : ''}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function TextArea({ label, value, onChange, rows = 8 }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <textarea className={`${input} min-h-32 resize-y leading-relaxed`} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-700">
      <span className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-emerald-600' : 'bg-neutral-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'left-4' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  )
}

/** Imagem com preview + upload assinado. */
function ImageField({ label, url, folder, onChange, onClear, aspect = 'aspect-video' }: {
  label: string; url?: string; folder: string; onChange: (url: string) => void; onClear?: () => void; aspect?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true); setErr(null)
    try { onChange(await uploadFile(file, folder)) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Erro') }
    finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }

  return (
    <div>
      <label className={lbl}>{label}</label>
      <div className={`relative ${aspect} w-full overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-neutral-50`}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-300"><ImageIcon className="h-8 w-8" /></div>
        )}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-white/70"><Loader2 className="h-6 w-6 animate-spin text-neutral-700" /></div>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className={btnDark} onClick={() => ref.current?.click()} disabled={busy}>
          <Upload className="h-4 w-4" /> {url ? 'Trocar' : 'Enviar'}
        </button>
        {url && onClear && <button type="button" className={`${btn} text-red-600 hover:bg-red-50`} onClick={onClear}><Trash2 className="h-4 w-4" /> Remover</button>}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  )
}

// ── Benefits editor (lista de itens do hero/"flyer") ────────────────────────
function BenefitsEditor({ benefits, onChange }: { benefits: JmpBenefit[]; onChange: (b: JmpBenefit[]) => void }) {
  const patch = (i: number, p: Partial<JmpBenefit>) => onChange(benefits.map((b, idx) => (idx === i ? { ...b, ...p } : b)))
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className={lbl}>Lista de benefícios ({benefits.length})</label>
        <button type="button" className={`${btn} bg-neutral-100 text-neutral-800 hover:bg-neutral-200`} onClick={() => onChange([...benefits, { text: '' }])}>
          <Plus className="h-4 w-4" /> Adicionar item
        </button>
      </div>
      {benefits.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-400">Nenhum item.</p>
      ) : (
        <div className="space-y-2">
          {benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={`${input} flex-1`} placeholder="Texto do benefício" value={b.text} onChange={(e) => patch(i, { text: e.target.value })} />
              <button type="button" onClick={() => patch(i, { strong: !b.strong })} title="Destaque (negrito)"
                className={`shrink-0 rounded-lg border px-2.5 py-2 text-sm font-bold transition ${b.strong ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-neutral-300 text-neutral-400 hover:bg-neutral-100'}`}>B</button>
              <button type="button" className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => onChange(move(benefits, i, i - 1))}><ChevronUp className="h-4 w-4" /></button>
              <button type="button" className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => onChange(move(benefits, i, i + 1))}><ChevronDown className="h-4 w-4" /></button>
              <button type="button" className="shrink-0 rounded p-1 text-red-600 hover:bg-red-50" onClick={() => onChange(benefits.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Stats editor (números de destaque do rodapé do hero) ────────────────────
function StatsEditor({ stats, onChange }: { stats: JmpStat[]; onChange: (s: JmpStat[]) => void }) {
  const patch = (i: number, p: Partial<JmpStat>) => onChange(stats.map((s, idx) => (idx === i ? { ...s, ...p } : s)))
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className={lbl}>Números de destaque ({stats.length})</label>
        <button type="button" className={`${btn} bg-neutral-100 text-neutral-800 hover:bg-neutral-200`} onClick={() => onChange([...stats, { value: '', label: '' }])}>
          <Plus className="h-4 w-4" /> Adicionar número
        </button>
      </div>
      {stats.length > 0 && (
        <div className="space-y-2">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={`${input} w-28`} placeholder="1.000" value={s.value} onChange={(e) => patch(i, { value: e.target.value })} />
              <input className={`${input} flex-1`} placeholder="Touros PO" value={s.label} onChange={(e) => patch(i, { label: e.target.value })} />
              <button type="button" className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => onChange(move(stats, i, i - 1))}><ChevronUp className="h-4 w-4" /></button>
              <button type="button" className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => onChange(move(stats, i, i + 1))}><ChevronDown className="h-4 w-4" /></button>
              <button type="button" className="shrink-0 rounded p-1 text-red-600 hover:bg-red-50" onClick={() => onChange(stats.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Photo gallery editor ────────────────────────────────────────────────────
function FotosEditor({ fotos, folder, onChange }: { fotos: JmpFoto[]; folder: string; onChange: (f: JmpFoto[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    try {
      const uploaded: JmpFoto[] = []
      for (const file of Array.from(files)) uploaded.push({ src: await uploadFile(file, folder), alt: '' })
      onChange([...fotos, ...uploaded])
    } catch (e) { alert(e instanceof Error ? e.message : 'Erro no upload') }
    finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }

  const patch = (i: number, p: Partial<JmpFoto>) => onChange(fotos.map((f, idx) => (idx === i ? { ...f, ...p } : f)))

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className={lbl}>Galeria de fotos ({fotos.length})</label>
        <button type="button" className={`${btn} bg-neutral-100 text-neutral-800 hover:bg-neutral-200`} onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar fotos
        </button>
        <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      </div>
      {fotos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-400">Nenhuma foto. Clique em “Adicionar fotos”.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {fotos.map((f, i) => (
            <div key={f.src + i} className="flex gap-3 rounded-lg border border-neutral-200 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.src} alt="" className="h-20 w-28 shrink-0 rounded object-cover" style={f.objectPosition ? { objectPosition: f.objectPosition } : undefined} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <input className={`${input} py-1 text-xs`} placeholder="Texto alternativo (alt)" value={f.alt} onChange={(e) => patch(i, { alt: e.target.value })} />
                <input className={`${input} py-1 text-xs`} placeholder="Corte (ex.: top) — opcional" value={f.objectPosition ?? ''} onChange={(e) => patch(i, { objectPosition: e.target.value || undefined })} />
                <div className="flex items-center gap-1">
                  <button type="button" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => onChange(move(fotos, i, i - 1))}><ChevronUp className="h-4 w-4" /></button>
                  <button type="button" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => onChange(move(fotos, i, i + 1))}><ChevronDown className="h-4 w-4" /></button>
                  <button type="button" className="ml-auto rounded p-1 text-red-600 hover:bg-red-50" onClick={() => onChange(fotos.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Attachments editor (qualquer arquivo: imagem, PDF) ──────────────────────
function AttachmentsEditor({ attachments, folder, onChange }: {
  attachments: JmpEmailAttachment[]; folder: string; onChange: (a: JmpEmailAttachment[]) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function add(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    try {
      const up: JmpEmailAttachment[] = []
      for (const file of Array.from(files)) up.push({ name: file.name, url: await uploadFile(file, folder) })
      onChange([...attachments, ...up])
    } catch (e) { alert(e instanceof Error ? e.message : 'Erro no upload') }
    finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className={lbl}><Paperclip className="mr-1 inline h-3.5 w-3.5" />Anexos ({attachments.length})</label>
        <button type="button" className={`${btn} bg-neutral-100 text-neutral-800 hover:bg-neutral-200`} onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar anexo
        </button>
        <input ref={ref} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      </div>
      {attachments.length > 0 && (
        <ul className="space-y-1.5">
          {attachments.map((a, i) => (
            <li key={a.url + i} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
              <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-neutral-700 hover:underline">{a.name}</a>
              <button type="button" className="rounded p-1 text-red-600 hover:bg-red-100" onClick={() => onChange(attachments.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const VARS_HINT = (
  <p className="text-xs text-neutral-500">
    Variáveis: <code>{'{{nome}}'}</code> <code>{'{{email}}'}</code> <code>{'{{whatsapp}}'}</code> <code>{'{{uf}}'}</code> <code>{'{{cidade}}'}</code> <code>{'{{momento}}'}</code> <code>{'{{cabecas}}'}</code> <code>{'{{interesse}}'}</code> <code>{'{{whatsappGroupUrl}}'}</code>
  </p>
)

// ── Flow email card ─────────────────────────────────────────────────────────
function FlowEmailCard({ email, index, total, onChange, onMove, onRemove }: {
  email: JmpFlowEmail; index: number; total: number
  onChange: (e: JmpFlowEmail) => void; onMove: (d: -1 | 1) => void; onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const set = (p: Partial<JmpFlowEmail>) => onChange({ ...email, ...p })
  const when = email.scheduleType === 'date'
    ? (email.date ? `em ${email.date} às ${String(email.sendHour).padStart(2, '0')}h` : 'data não definida')
    : `${email.days === 0 ? 'no cadastro' : `${email.days} dia(s) após`} · ${String(email.sendHour).padStart(2, '0')}h`

  return (
    <div className={`${card} ${email.enabled ? '' : 'opacity-75'}`}>
      <div className="flex items-center gap-2 px-4 py-3">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${email.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-400'}`}>{index + 1}</span>
        <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => setOpen((o) => !o)}>
          <span className="truncate text-sm font-bold text-neutral-900">{email.subject || 'E-mail sem assunto'}</span>
          <span className="flex items-center gap-1 text-xs text-neutral-400">{email.scheduleType === 'date' ? <Calendar className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{when}</span>
        </button>
        <Toggle checked={email.enabled} onChange={(b) => set({ enabled: b })} label="" />
        <button type="button" disabled={index === 0} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30" onClick={() => onMove(-1)}><ChevronUp className="h-4 w-4" /></button>
        <button type="button" disabled={index === total - 1} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30" onClick={() => onMove(1)}><ChevronDown className="h-4 w-4" /></button>
        <button type="button" className="rounded p-1 text-red-600 hover:bg-red-50" onClick={onRemove}><Trash2 className="h-4 w-4" /></button>
        <button type="button" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => setOpen((o) => !o)}>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-neutral-100 p-4">
          <Field label="Assunto" value={email.subject} onChange={(v) => set({ subject: v })} />
          {/* agendamento */}
          <div className="grid items-end gap-3 sm:grid-cols-4">
            <div>
              <label className={lbl}>Quando enviar</label>
              <select className={input} value={email.scheduleType} onChange={(e) => set({ scheduleType: e.target.value as 'days' | 'date' })}>
                <option value="days">N dias após o cadastro</option>
                <option value="date">Data fixa</option>
              </select>
            </div>
            {email.scheduleType === 'days' ? (
              <div>
                <label className={lbl}>Dias após</label>
                <input type="number" min={0} className={input} value={email.days} onChange={(e) => set({ days: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
            ) : (
              <div>
                <label className={lbl}>Data</label>
                <input type="date" className={input} value={email.date} onChange={(e) => set({ date: e.target.value })} />
              </div>
            )}
            <div>
              <label className={lbl}>Hora (BRT)</label>
              <input type="number" min={0} max={23} className={input} value={email.sendHour} onChange={(e) => set({ sendHour: Math.min(23, Math.max(0, Number(e.target.value) || 0)) })} />
            </div>
          </div>
          <TextArea label="Mensagem" value={email.body} onChange={(v) => set({ body: v })} rows={9} />
          {VARS_HINT}
          <AttachmentsEditor attachments={email.attachments} folder={`emails/${email.id}`} onChange={(attachments) => set({ attachments })} />
        </div>
      )}
    </div>
  )
}

// ── Block editor ────────────────────────────────────────────────────────────
function BlockEditor({ block, index, total, onChange, onMove, onRemove }: {
  block: JmpBlock; index: number; total: number
  onChange: (b: JmpBlock) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void
}) {
  const [open, setOpen] = useState(true)
  const set = (p: Partial<JmpBlock>) => onChange({ ...block, ...p })
  const folder = `blocos/${block.id || 'bloco'}`

  return (
    <div className={card}>
      <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3">
        <GripVertical className="h-4 w-4 text-neutral-300" />
        <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
          <span className="text-sm font-bold text-neutral-900">{block.heading || 'Bloco sem título'}</span>
          <span className="text-xs text-neutral-400">#{block.id}</span>
        </button>
        <button type="button" disabled={index === 0} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" onClick={() => onMove(-1)}><ChevronUp className="h-4 w-4" /></button>
        <button type="button" disabled={index === total - 1} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" onClick={() => onMove(1)}><ChevronDown className="h-4 w-4" /></button>
        <button type="button" className="rounded p-1 text-red-600 hover:bg-red-50" onClick={onRemove}><Trash2 className="h-4 w-4" /></button>
        <button type="button" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => setOpen((o) => !o)}>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
      </div>

      {open && (
        <div className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título (heading)" value={block.heading} onChange={(v) => set({ heading: v })} placeholder="Aparte das Fêmeas" />
            <Field label="Subtítulo (data/animais)" value={block.subheading} onChange={(v) => set({ subheading: v })} placeholder="Sábado · 13 de Junho · 240 Bezerras FIV" />
            <Field label="Âncora / id" value={block.id} onChange={(v) => set({ id: slugify(v) })} mono />
            <Field label="Rótulo da playlist" value={block.playlistLabel} onChange={(v) => set({ playlistLabel: v })} placeholder="Playlist YouTube — fêmeas" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ImageField label="Flyer (largura total)" url={block.flyerUrl} folder={`${folder}/flyer`} onChange={(url) => set({ flyerUrl: url })} />
            <ImageField label="Logo do bloco (opcional)" url={block.logoUrl} folder={`${folder}/logo`} aspect="aspect-[3/1]" onChange={(url) => set({ logoUrl: url })} onClear={() => set({ logoUrl: undefined, logoAlt: undefined })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Texto alt do flyer" value={block.flyerAlt} onChange={(v) => set({ flyerAlt: v })} />
            <Field label="Vídeo do YouTube (URL ou ID) — opcional" value={block.youtubeUrl ?? ''} onChange={(v) => set({ youtubeUrl: v })} placeholder="https://youtube.com/watch?v=..." mono />
          </div>
          <TextArea label="Mensagem entre o flyer e as fotos (cada linha vira um parágrafo)" value={block.description ?? ''} onChange={(v) => set({ description: v })} rows={4} />
          <FotosEditor fotos={block.fotos} folder={`${folder}/galeria`} onChange={(fotos) => set({ fotos })} />
        </div>
      )}
    </div>
  )
}

// ── Sheets connect ──────────────────────────────────────────────────────────
function SheetsConnect() {
  const [state, setState] = useState<{ loading: boolean; url: string | null; busy: boolean; err: string | null }>({ loading: true, url: null, busy: false, err: null })
  const [manual, setManual] = useState(false)
  const [sheetInput, setSheetInput] = useState('')

  useEffect(() => {
    fetch('/api/jmp/sheets').then((r) => r.json()).then((j) => setState((s) => ({ ...s, loading: false, url: j.url ?? null }))).catch(() => setState((s) => ({ ...s, loading: false })))
  }, [])

  async function connect(sheet?: string) {
    setState((s) => ({ ...s, busy: true, err: null }))
    try {
      const res = await fetch('/api/jmp/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sheet ? { sheet } : {}),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Falha ao conectar.')
      setState((s) => ({ ...s, busy: false, url: j.url }))
    } catch (e) {
      setState((s) => ({ ...s, busy: false, err: e instanceof Error ? e.message : 'Erro' }))
    }
  }

  return (
    <section className={card}>
      <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
        <Table2 className="h-4 w-4 text-emerald-700" />
        <h2 className="text-sm font-bold">Planilha de leads (Google Sheets)</h2>
      </div>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <p className="flex-1 text-sm text-neutral-600">Cada inscrição do formulário também vira uma linha na aba <b>Leads JMP</b>.</p>
        {state.loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
        ) : state.url ? (
          <a href={state.url} target="_blank" rel="noreferrer" className={btnPrimary}><CheckCircle2 className="h-4 w-4" /> Abrir planilha <ExternalLink className="h-3 w-3" /></a>
        ) : (
          <button onClick={() => connect()} disabled={state.busy} className={btnDark}>{state.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Table2 className="h-4 w-4" />} Conectar planilha</button>
        )}
      </div>
      {!state.loading && !state.url && (
        <div className="px-4 pb-4">
          {manual ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-60 flex-1">
                <label className={lbl}>Usar planilha existente (cole o link) — compartilhe-a com a service account como Editor</label>
                <input className={`${input} font-mono text-xs`} value={sheetInput} placeholder="https://docs.google.com/spreadsheets/d/..." onChange={(e) => setSheetInput(e.target.value)} />
              </div>
              <button onClick={() => connect(sheetInput)} disabled={state.busy || !sheetInput.trim()} className={btnDark}>Usar esta</button>
              <button onClick={() => setManual(false)} className={btnGhost}>Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setManual(true)} className="text-xs font-semibold text-emerald-700 hover:underline">ou usar uma planilha existente</button>
          )}
        </div>
      )}
      {state.err && <p className="px-4 pb-3 text-sm text-red-600">{state.err}</p>}
    </section>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function AdminJmpClient() {
  const [content, setContent] = useState<JmpContent | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'conteudo' | 'emails'>('conteudo')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/jmp/content').then((r) => r.json()).then((c: JmpContent) => setContent(c)).catch(() => setLoadErr('Não foi possível carregar o conteúdo.'))
  }, [])

  async function save() {
    if (!content) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/jmp/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar.')
      setMsg({ kind: 'ok', text: 'Salvo! A landing e os e-mails já usam o conteúdo novo.' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Erro ao salvar.' })
    } finally { setSaving(false) }
  }

  async function logout() {
    await createClient().auth.signOut().catch(() => {})
    window.location.href = '/'
  }

  const set = (p: Partial<JmpContent>) => setContent((c) => (c ? { ...c, ...p } : c))
  const setHero = (p: Partial<JmpHero>) => setContent((c) => (c ? { ...c, hero: { ...c.hero, ...p } } : c))
  const setBlocks = (blocks: JmpBlock[]) => set({ blocks })
  const setFlow = (emailFlow: JmpFlowEmail[]) => set({ emailFlow })

  function addBlock() {
    if (!content) return
    setBlocks([...content.blocks, { id: `bloco-${content.blocks.length + 1}`, flyerUrl: '', flyerAlt: '', subheading: '', heading: 'Novo bloco', youtubeUrl: '', playlistLabel: 'Playlist YouTube', fotos: [] }])
  }
  function addFlowEmail() {
    if (!content) return
    setFlow([...content.emailFlow, { id: `email-${Date.now().toString(36)}`, enabled: false, subject: 'Novo e-mail', body: 'Olá, {{nome}}!', attachments: [], scheduleType: 'days', days: content.emailFlow.length + 1, date: '', sendHour: 9 }])
  }

  if (loadErr) return <div className="p-10 text-center text-red-600">{loadErr}</div>
  if (!content) return <div className="flex min-h-screen items-center justify-center text-neutral-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…</div>

  const SaveBtn = (
    <button onClick={save} disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</button>
  )

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-black/20 bg-[#102a1d] text-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex-1">
            <h1 className="text-base font-black tracking-tight">Painel JMP</h1>
            <p className="text-xs text-white/60">Conteúdo da landing · E-mails · Leads</p>
          </div>
          <a href="https://jmp.bulaassessoria.com" target="_blank" rel="noreferrer" className={`${btn} text-white/80 hover:bg-white/10`}><Eye className="h-4 w-4" /> Ver landing <ExternalLink className="h-3 w-3" /></a>
          <button onClick={logout} className={`${btn} text-white/80 hover:bg-white/10`}><LogOut className="h-4 w-4" /> Sair</button>
          {SaveBtn}
        </div>
        {/* Tabs */}
        <div className="mx-auto flex max-w-5xl gap-1 px-3">
          {([['conteudo', 'Conteúdo da landing', ImageLucide], ['emails', 'E-mails & fluxo', Mail]] as const).map(([key, lbltxt, Icon]) => (
            <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${tab === key ? 'border-emerald-400 text-white' : 'border-transparent text-white/55 hover:text-white/80'}`}>
              <Icon className="h-4 w-4" /> {lbltxt}
            </button>
          ))}
        </div>
        {msg && <div className={`px-4 py-2 text-center text-sm font-medium ${msg.kind === 'ok' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{msg.text}</div>}
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {tab === 'conteudo' && (
          <>
            <section className={card}>
              <div className="border-b border-neutral-100 px-4 py-3">
                <h2 className="text-sm font-bold">Hero / Flyer (topo da landing)</h2>
                <p className="text-xs text-neutral-500">Todo o texto do bloco principal — o que aparece no “flyer”. Use Enter para quebrar linha no título.</p>
              </div>
              <div className="space-y-4 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ImageField label="Imagem de fundo (hero)" url={content.hero.backgroundUrl} folder="hero" onChange={(url) => setHero({ backgroundUrl: url })} />
                  <div className="flex flex-col gap-4">
                    <Field label="Selo de urgência (badge)" value={content.hero.badge} onChange={(v) => setHero({ badge: v })} placeholder="Vagas limitadas · 13 e 14 de Junho" />
                    <Field label="Link do grupo de WhatsApp" value={content.whatsappGroupUrl} onChange={(v) => set({ whatsappGroupUrl: v })} placeholder="https://chat.whatsapp.com/..." mono />
                  </div>
                </div>

                <TextArea label="Título principal (headline)" value={content.hero.headline} onChange={(v) => setHero({ headline: v })} rows={3} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextArea label="Texto de valor (parágrafo)" value={content.hero.valueProp} onChange={(v) => setHero({ valueProp: v })} rows={3} />
                  <Field label="Destaque ao fim do parágrafo (negrito)" value={content.hero.valuePropStrong} onChange={(v) => setHero({ valuePropStrong: v })} placeholder="Grátis. Sem compromisso." />
                </div>

                <TextArea label="Título dos benefícios" value={content.hero.benefitsTitle} onChange={(v) => setHero({ benefitsTitle: v })} rows={2} />
                <BenefitsEditor benefits={content.hero.benefits} onChange={(benefits) => setHero({ benefits })} />

                <div className="border-t border-neutral-100 pt-4">
                  <StatsEditor stats={content.hero.stats} onChange={(stats) => setHero({ stats })} />
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Local — linha 1" value={content.hero.locationLine1} onChange={(v) => setHero({ locationLine1: v })} placeholder="Campo Grande/MS" />
                    <Field label="Local — linha 2" value={content.hero.locationLine2} onChange={(v) => setHero({ locationLine2: v })} placeholder="Terra Nova Eventos" />
                  </div>
                </div>
              </div>
            </section>

            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-neutral-700">Blocos de leilão ({content.blocks.length})</h2>
              <button onClick={addBlock} className={btnDark}><Plus className="h-4 w-4" /> Adicionar bloco</button>
            </div>
            <div className="space-y-4">
              {content.blocks.map((b, i) => (
                <BlockEditor key={i} block={b} index={i} total={content.blocks.length}
                  onChange={(nb) => setBlocks(content.blocks.map((x, idx) => (idx === i ? nb : x)))}
                  onMove={(dir) => setBlocks(move(content.blocks, i, i + dir))}
                  onRemove={() => { if (confirm('Remover este bloco?')) setBlocks(content.blocks.filter((_, idx) => idx !== i)) }} />
              ))}
            </div>
          </>
        )}

        {tab === 'emails' && (
          <>
            <SheetsConnect />

            {/* Welcome */}
            <section className={card}>
              <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
                <Mail className="h-4 w-4 text-emerald-700" />
                <div className="flex-1">
                  <h2 className="text-sm font-bold">E-mail de boas-vindas (imediato)</h2>
                  <p className="text-xs text-neutral-500">Enviado na hora em que o lead se cadastra.</p>
                </div>
                <Toggle checked={content.welcomeEmail.enabled} onChange={(b) => set({ welcomeEmail: { ...content.welcomeEmail, enabled: b } })} label="Ativo" />
              </div>
              <div className="space-y-4 p-4">
                <Field label="Assunto" value={content.welcomeEmail.subject} onChange={(v) => set({ welcomeEmail: { ...content.welcomeEmail, subject: v } })} />
                <TextArea label="Mensagem" value={content.welcomeEmail.body} onChange={(v) => set({ welcomeEmail: { ...content.welcomeEmail, body: v } })} rows={9} />
                {VARS_HINT}
                <AttachmentsEditor attachments={content.welcomeEmail.attachments} folder="emails/welcome" onChange={(attachments) => set({ welcomeEmail: { ...content.welcomeEmail, attachments } })} />
              </div>
            </section>

            {/* Flow */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-neutral-700">Fluxo de e-mail marketing ({content.emailFlow.length})</h2>
                <p className="text-xs text-neutral-500">Cada lead é inscrito; um robô envia os e-mails ativos no horário definido.</p>
              </div>
              <button onClick={addFlowEmail} className={btnDark}><Plus className="h-4 w-4" /> Adicionar e-mail</button>
            </div>
            <div className="space-y-3">
              {content.emailFlow.map((em, i) => (
                <FlowEmailCard key={em.id || i} email={em} index={i} total={content.emailFlow.length}
                  onChange={(ne) => setFlow(content.emailFlow.map((x, idx) => (idx === i ? ne : x)))}
                  onMove={(dir) => setFlow(move(content.emailFlow, i, i + dir))}
                  onRemove={() => { if (confirm('Remover este e-mail do fluxo?')) setFlow(content.emailFlow.filter((_, idx) => idx !== i)) }} />
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end pb-10">{SaveBtn}</div>
      </main>
    </div>
  )
}
