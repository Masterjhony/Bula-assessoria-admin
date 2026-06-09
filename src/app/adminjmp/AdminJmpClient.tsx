'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Save, Upload, Trash2, Plus, ChevronUp, ChevronDown, ExternalLink,
  LogOut, Loader2, ImageIcon, GripVertical, Eye, Mail,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import type { JmpContent, JmpBlock, JmpFoto } from '@/lib/jmp-content'

// ── helpers ────────────────────────────────────────────────────────────────
async function uploadImage(file: File, folder: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('folder', folder)
  const res = await fetch('/api/jmp/upload', { method: 'POST', body: fd })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Falha no upload.')
  return json.url as string
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

// ── small UI atoms ──────────────────────────────────────────────────────────
const card = 'rounded-xl border border-neutral-200 bg-white shadow-sm'
const label = 'block text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-1'
const input =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 transition-colors'
const btn =
  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50'

function Field({ label: l, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean
}) {
  return (
    <div>
      <label className={label}>{l}</label>
      <input
        className={`${input} ${mono ? 'font-mono text-xs' : ''}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function TextArea({ label: l, value, onChange, placeholder, rows = 8 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <div>
      <label className={label}>{l}</label>
      <textarea
        className={`${input} min-h-32 resize-y leading-relaxed`}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** Campo de imagem: preview + botão de upload. */
function ImageField({ label: l, url, folder, onChange, onClear, aspect = 'aspect-video' }: {
  label: string; url?: string; folder: string; onChange: (url: string) => void; onClear?: () => void; aspect?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true); setErr(null)
    try { onChange(await uploadImage(file, folder)) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Erro') }
    finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }

  return (
    <div>
      <label className={label}>{l}</label>
      <div className={`relative ${aspect} w-full overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50`}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-300">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-700" />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className={`${btn} bg-neutral-900 text-white hover:bg-neutral-700`} onClick={() => ref.current?.click()} disabled={busy}>
          <Upload className="h-4 w-4" /> {url ? 'Trocar' : 'Enviar'}
        </button>
        {url && onClear && (
          <button type="button" className={`${btn} text-red-600 hover:bg-red-50`} onClick={onClear}>
            <Trash2 className="h-4 w-4" /> Remover
          </button>
        )}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  )
}

// ── Photo gallery editor ────────────────────────────────────────────────────
function FotosEditor({ fotos, folder, onChange }: {
  fotos: JmpFoto[]; folder: string; onChange: (f: JmpFoto[]) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    try {
      const uploaded: JmpFoto[] = []
      for (const file of Array.from(files)) {
        const url = await uploadImage(file, folder)
        uploaded.push({ src: url, alt: '' })
      }
      onChange([...fotos, ...uploaded])
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro no upload')
    } finally {
      setBusy(false); if (ref.current) ref.current.value = ''
    }
  }

  function patch(i: number, p: Partial<JmpFoto>) {
    onChange(fotos.map((f, idx) => (idx === i ? { ...f, ...p } : f)))
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className={label}>Galeria de fotos ({fotos.length})</label>
        <button type="button" className={`${btn} bg-neutral-100 text-neutral-800 hover:bg-neutral-200`} onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar fotos
        </button>
        <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      </div>
      {fotos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-400">
          Nenhuma foto. Clique em “Adicionar fotos”.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {fotos.map((f, i) => (
            <div key={f.src + i} className="flex gap-3 rounded-lg border border-neutral-200 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.src} alt="" className="h-20 w-28 shrink-0 rounded object-cover" style={f.objectPosition ? { objectPosition: f.objectPosition } : undefined} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <input className={`${input} py-1 text-xs`} placeholder="Texto alternativo (alt)" value={f.alt} onChange={(e) => patch(i, { alt: e.target.value })} />
                <input className={`${input} py-1 text-xs`} placeholder="Corte (ex.: top, center) — opcional" value={f.objectPosition ?? ''} onChange={(e) => patch(i, { objectPosition: e.target.value || undefined })} />
                <div className="flex items-center gap-1">
                  <button type="button" title="Mover para cima" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => onChange(move(fotos, i, i - 1))}><ChevronUp className="h-4 w-4" /></button>
                  <button type="button" title="Mover para baixo" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => onChange(move(fotos, i, i + 1))}><ChevronDown className="h-4 w-4" /></button>
                  <button type="button" title="Remover" className="ml-auto rounded p-1 text-red-600 hover:bg-red-50" onClick={() => onChange(fotos.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Block editor ────────────────────────────────────────────────────────────
function BlockEditor({ block, index, total, onChange, onMove, onRemove }: {
  block: JmpBlock; index: number; total: number
  onChange: (b: JmpBlock) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
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
        <button type="button" title="Mover para cima" disabled={index === 0} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" onClick={() => onMove(-1)}><ChevronUp className="h-4 w-4" /></button>
        <button type="button" title="Mover para baixo" disabled={index === total - 1} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" onClick={() => onMove(1)}><ChevronDown className="h-4 w-4" /></button>
        <button type="button" title="Remover bloco" className="rounded p-1 text-red-600 hover:bg-red-50" onClick={onRemove}><Trash2 className="h-4 w-4" /></button>
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

          <FotosEditor fotos={block.fotos} folder={`${folder}/galeria`} onChange={(fotos) => set({ fotos })} />
        </div>
      )}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function AdminJmpClient() {
  const [content, setContent] = useState<JmpContent | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/jmp/content')
      .then((r) => r.json())
      .then((c: JmpContent) => setContent(c))
      .catch(() => setLoadErr('Não foi possível carregar o conteúdo.'))
  }, [])

  async function save() {
    if (!content) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/jmp/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar.')
      setMsg({ kind: 'ok', text: 'Conteúdo salvo. A landing já reflete as mudanças.' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Erro ao salvar.' })
    } finally {
      setSaving(false)
    }
  }

  async function logout() {
    await createClient().auth.signOut().catch(() => {})
    window.location.href = '/'
  }

  const set = (p: Partial<JmpContent>) => setContent((c) => (c ? { ...c, ...p } : c))
  const setBlocks = (blocks: JmpBlock[]) => set({ blocks })

  function addBlock() {
    if (!content) return
    const id = `bloco-${content.blocks.length + 1}`
    setBlocks([...content.blocks, {
      id, flyerUrl: '', flyerAlt: '', subheading: '', heading: 'Novo bloco',
      youtubeUrl: '', playlistLabel: 'Playlist YouTube', fotos: [],
    }])
  }

  if (loadErr) return <div className="p-10 text-center text-red-600">{loadErr}</div>
  if (!content) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex-1">
            <h1 className="text-base font-black tracking-tight">Painel JMP · Conteúdo da Landing</h1>
            <p className="text-xs text-neutral-500">Flyers, galerias, textos do leilão, vídeos e WhatsApp</p>
          </div>
          <a href="https://jmp.bulaassessoria.com" target="_blank" rel="noreferrer" className={`${btn} text-neutral-600 hover:bg-neutral-100`}>
            <Eye className="h-4 w-4" /> Ver landing <ExternalLink className="h-3 w-3" />
          </a>
          <button onClick={logout} className={`${btn} text-neutral-600 hover:bg-neutral-100`}><LogOut className="h-4 w-4" /> Sair</button>
          <button onClick={save} disabled={saving} className={`${btn} bg-green-700 text-white hover:bg-green-800`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
        </div>
        {msg && (
          <div className={`px-4 py-2 text-center text-sm ${msg.kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>
        )}
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Hero / global */}
        <section className={card}>
          <div className="border-b border-neutral-100 px-4 py-3"><h2 className="text-sm font-bold">Topo & Geral</h2></div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <ImageField label="Imagem de fundo (hero)" url={content.hero.backgroundUrl} folder="hero" onChange={(url) => set({ hero: { ...content.hero, backgroundUrl: url } })} />
            <div className="flex flex-col gap-4">
              <Field label="Selo de urgência (badge)" value={content.hero.badge} onChange={(v) => set({ hero: { ...content.hero, badge: v } })} placeholder="Vagas limitadas · 13 e 14 de Junho" />
              <Field label="Link do grupo de WhatsApp" value={content.whatsappGroupUrl} onChange={(v) => set({ whatsappGroupUrl: v })} placeholder="https://chat.whatsapp.com/..." mono />
            </div>
          </div>
        </section>

        <section className={card}>
          <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
            <Mail className="h-4 w-4 text-neutral-500" />
            <h2 className="text-sm font-bold">E-mail de boas-vindas</h2>
            <label className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-neutral-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300"
                checked={content.welcomeEmail.enabled}
                onChange={(e) => set({ welcomeEmail: { ...content.welcomeEmail, enabled: e.target.checked } })}
              />
              Enviar
            </label>
          </div>
          <div className="space-y-4 p-4">
            <Field
              label="Assunto"
              value={content.welcomeEmail.subject}
              onChange={(v) => set({ welcomeEmail: { ...content.welcomeEmail, subject: v } })}
              placeholder="Sua inscricao no Nelore JMP foi recebida"
            />
            <TextArea
              label="Mensagem"
              value={content.welcomeEmail.body}
              onChange={(v) => set({ welcomeEmail: { ...content.welcomeEmail, body: v } })}
              rows={10}
            />
            <p className="text-xs text-neutral-500">
              Variaveis: {'{{nome}}'}, {'{{email}}'}, {'{{whatsapp}}'}, {'{{uf}}'}, {'{{cidade}}'}, {'{{momento}}'}, {'{{cabecas}}'}, {'{{interesse}}'}, {'{{whatsappGroupUrl}}'}.
            </p>
          </div>
        </section>

        {/* Blocks */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-neutral-700">Blocos de leilão ({content.blocks.length})</h2>
          <button onClick={addBlock} className={`${btn} bg-neutral-900 text-white hover:bg-neutral-700`}><Plus className="h-4 w-4" /> Adicionar bloco</button>
        </div>

        <div className="space-y-4">
          {content.blocks.map((b, i) => (
            <BlockEditor
              key={i}
              block={b}
              index={i}
              total={content.blocks.length}
              onChange={(nb) => setBlocks(content.blocks.map((x, idx) => (idx === i ? nb : x)))}
              onMove={(dir) => setBlocks(move(content.blocks, i, i + dir))}
              onRemove={() => { if (confirm('Remover este bloco?')) setBlocks(content.blocks.filter((_, idx) => idx !== i)) }}
            />
          ))}
        </div>

        <div className="flex justify-end pb-10">
          <button onClick={save} disabled={saving} className={`${btn} bg-green-700 text-white hover:bg-green-800`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar tudo
          </button>
        </div>
      </main>
    </div>
  )
}
