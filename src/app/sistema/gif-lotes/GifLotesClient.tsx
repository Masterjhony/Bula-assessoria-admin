'use client'

/**
 * Ferramentas → GIF de Lotes
 *
 * Divulgação de lotes de leilão no WhatsApp: GIF (vídeo curto) + legenda no
 * padrão comercial, enviados JUNTOS pelo Baileys (VPS). Fluxo:
 *   1. Escolhe o leilão (a agenda já tem o catálogo anexado)
 *   2. "Extrair com IA" lê o catálogo PDF e preenche os dados dos lotes
 *   3. Ajusta legendas, anexa o GIF/vídeo de cada lote (upload → Storage)
 *   4. Envia para um contato (ex.: parceiro que repassa/posta) ou grupo
 *
 * O GIF deve ter ~6s (padrão do WhatsApp) — o VPS envia com gifPlayback.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
  Clapperboard, Loader2, Send, Sparkles, Upload, X, CheckCircle2,
  AlertTriangle, FileText, Trash2, Plus,
} from 'lucide-react'

export interface LeilaoOption {
  id: string
  nome: string
  data: string
  catalogo_url: string | null
}

interface LoteRow {
  key: string
  lote: string
  nome: string
  caption: string
  mediaUrl: string
  mediaType: 'video' | 'image'
  uploading: boolean
  sendState: 'idle' | 'sending' | 'queued' | 'error'
  sendError?: string
}

interface Condicoes {
  linhaPagamento: string
  linhaFecho: string
}

// ── Legenda no padrão de divulgação ─────────────────────────────────────────

interface LoteExtraido {
  lote: number
  nome: string
  idade?: string | null
  peso_atual_kg?: number | null
  pai?: string | null
  categoria?: string | null
  mgte?: { valor: string; top: string } | null
  iqg?: { valor: string; top: string } | null
  iabcz?: { valor: string; deca: string; p?: string | null } | null
  prenhe_de?: string | null
  previsao_parto?: string | null
  cria?: { sexo?: string | null; peso_kg?: number | null; nascimento?: string | null } | null
}

function idadeCurta(idade?: string | null): string | null {
  if (!idade) return null
  const m = idade.match(/(\d+)\s*ANOS?(?:\s*E?\s*(\d+)\s*M)?/i)
  if (!m) return idade.toLowerCase()
  const total = Number(m[1]) * 12 + Number(m[2] || 0)
  return total <= 36 ? `${total} meses` : `${Math.floor(total / 12)} anos`
}

function buildCaption(l: LoteExtraido, cond: Condicoes): string {
  const linhas: string[] = []
  linhas.push(`🔥 LOTE ${l.lote} — ${l.nome}`)
  linhas.push('')

  const resumo = [idadeCurta(l.idade), l.peso_atual_kg ? `${l.peso_atual_kg} kg` : null,
    l.pai ? `PAI: ${l.pai}` : null].filter(Boolean).join(' • ')
  if (resumo) linhas.push(`📌 ${resumo}`)

  if (l.cria) {
    const sexo = (l.cria.sexo || '').toUpperCase() === 'MACHO' ? 'macho' : 'fêmea'
    const extra = [l.cria.peso_kg ? `${l.cria.peso_kg} kg` : null,
      l.cria.nascimento ? `nasc. ${l.cria.nascimento}` : null].filter(Boolean).join(' • ')
    linhas.push(`🍼 Cria ${sexo} ao pé${extra ? ` • ${extra}` : ''}`)
  }
  if (l.prenhe_de) {
    const parto = l.previsao_parto ? ` • parto ${l.previsao_parto.slice(3)}` : ''
    linhas.push(`🤰 Prenhe do ${l.prenhe_de}${parto}`)
  }

  linhas.push('')
  if (l.iabcz?.valor) linhas.push(`✨ iABCZ ${l.iabcz.valor} — DECA ${l.iabcz.deca}`)
  if (l.mgte?.valor) linhas.push(`✨ MGTe ${l.mgte.valor} — TOP ${l.mgte.top}%`)
  if (l.iqg?.valor) linhas.push(`✨ IQG ${l.iqg.valor} — TOP ${l.iqg.top}%`)

  linhas.push('')
  if (cond.linhaPagamento) linhas.push(`🐄 ${cond.linhaPagamento}`)
  if (cond.linhaFecho) linhas.push(`🤝 ${cond.linhaFecho}`)
  return linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ── Componente ───────────────────────────────────────────────────────────────

export default function GifLotesClient({ leiloes }: { leiloes: LeilaoOption[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [leilaoId, setLeilaoId] = useState<string>(leiloes.find(l => l.catalogo_url)?.id ?? '')
  const leilao = leiloes.find(l => l.id === leilaoId) ?? null

  const [lotesInput, setLotesInput] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [rows, setRows] = useState<LoteRow[]>([])
  const [cond, setCond] = useState<Condicoes>({
    linhaPagamento: '30x no boleto • Frete grátis',
    linhaFecho: 'Garanta o seu no privado!',
  })
  const [phone, setPhone] = useState('')
  const [vpsStatus, setVpsStatus] = useState<string>('...')
  const [sendingAll, setSendingAll] = useState(false)
  const nextKey = useRef(0)

  useEffect(() => {
    try { setPhone(localStorage.getItem('gif-lotes:phone') || '') } catch { /* ok */ }
    const poll = async () => {
      try {
        const res = await fetch('/api/bula/gif-lotes/send')
        const body = await res.json()
        setVpsStatus(body.status ?? 'unknown')
      } catch { setVpsStatus('unreachable') }
    }
    void poll()
    const t = setInterval(poll, 20_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    try { localStorage.setItem('gif-lotes:phone', phone) } catch { /* ok */ }
  }, [phone])

  const patchRow = useCallback((key: string, patch: Partial<LoteRow>) => {
    setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))
  }, [])

  const addRow = useCallback((partial?: Partial<LoteRow>) => {
    nextKey.current += 1
    setRows(rs => [...rs, {
      key: `r${nextKey.current}`, lote: '', nome: '', caption: '', mediaUrl: '',
      mediaType: 'video', uploading: false, sendState: 'idle', ...partial,
    }])
  }, [])

  const extrair = useCallback(async () => {
    if (!leilao?.catalogo_url) { setExtractError('Este leilão não tem catálogo anexado.'); return }
    const nums = lotesInput.split(/[\s,;]+/).map(s => Number(s)).filter(n => Number.isFinite(n) && n > 0)
    if (nums.length === 0) { setExtractError('Informe os números dos lotes (ex.: 2, 3, 4, 5).'); return }
    setExtracting(true)
    setExtractError(null)
    try {
      const res = await fetch('/api/bula/gif-lotes/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalogo_url: leilao.catalogo_url, lotes: nums }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      const conds = body.condicoes as { parcelas?: string | null; frete?: string | null } | null
      const novaCond: Condicoes = {
        linhaPagamento: [
          conds?.parcelas ? conds.parcelas.replace(/\s*PARCELAS\s*/i, 'x no boleto (').replace(/$/, ')').replace('30x no boleto (2 + 2 + 2 + 2 + 2 + 20)', '30x no boleto (2+2+2+2+2+20)') : '30x no boleto',
          'Frete grátis',
        ].filter(Boolean).join(' • '),
        linhaFecho: cond.linhaFecho,
      }
      setCond(novaCond)
      const extraidos = (body.lotes as LoteExtraido[]) ?? []
      setRows(rs => {
        const existentes = new Set(rs.map(r => r.lote))
        const novos = extraidos.filter(l => !existentes.has(String(l.lote))).map(l => {
          nextKey.current += 1
          return {
            key: `r${nextKey.current}`,
            lote: String(l.lote),
            nome: l.nome ?? '',
            caption: buildCaption(l, novaCond),
            mediaUrl: '', mediaType: 'video' as const,
            uploading: false, sendState: 'idle' as const,
          }
        })
        return [...rs, ...novos]
      })
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : String(e))
    } finally {
      setExtracting(false)
    }
  }, [leilao, lotesInput, cond.linhaFecho])

  const uploadMedia = useCallback(async (key: string, file: File) => {
    patchRow(key, { uploading: true })
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4'
      const path = `${leilaoId || 'geral'}/${Date.now()}-lote-${rows.find(r => r.key === key)?.lote || 'x'}.${ext}`
      const { error } = await supabase.storage.from('lote-gifs').upload(path, file, {
        contentType: file.type || 'video/mp4', upsert: false,
      })
      if (error) throw error
      const { data } = supabase.storage.from('lote-gifs').getPublicUrl(path)
      patchRow(key, {
        mediaUrl: data.publicUrl,
        mediaType: file.type.startsWith('image/') && file.type !== 'image/gif' ? 'image' : 'video',
        uploading: false,
      })
    } catch (e) {
      patchRow(key, { uploading: false })
      alert(`Upload falhou: ${e instanceof Error ? e.message : e}`)
    }
  }, [supabase, leilaoId, rows, patchRow])

  const enviar = useCallback(async (keys: string[]) => {
    const alvo = rows.filter(r => keys.includes(r.key) && r.caption.trim())
    if (alvo.length === 0) return
    if (!phone.trim()) { alert('Informe o telefone de destino (com DDD).'); return }
    setRows(rs => rs.map(r => (keys.includes(r.key) ? { ...r, sendState: 'sending' as const } : r)))
    try {
      const res = await fetch('/api/bula/gif-lotes/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          items: alvo.map(r => ({
            lote: r.lote, caption: r.caption,
            media_url: r.mediaUrl || null, media_type: r.mediaType,
          })),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      const porLote = new Map<string, { queued: boolean; error?: string }>(
        (body.results as Array<{ lote?: string; queued: boolean; error?: string }>).map(r => [String(r.lote), r]),
      )
      setRows(rs => rs.map(r => {
        if (!keys.includes(r.key)) return r
        const resu = porLote.get(String(r.lote))
        if (!resu) return { ...r, sendState: 'idle' as const }
        return resu.queued
          ? { ...r, sendState: 'queued' as const, sendError: undefined }
          : { ...r, sendState: 'error' as const, sendError: resu.error }
      }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setRows(rs => rs.map(r => (keys.includes(r.key) ? { ...r, sendState: 'error' as const, sendError: msg } : r)))
    }
  }, [rows, phone])

  const enviarTodos = useCallback(async () => {
    setSendingAll(true)
    try { await enviar(rows.map(r => r.key)) } finally { setSendingAll(false) }
  }, [enviar, rows])

  const vpsOk = vpsStatus === 'connected'

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Clapperboard className="w-7 h-7 text-amber-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">GIF de Lotes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            GIF (~6s) + legenda no padrão comercial, enviados juntos pelo WhatsApp (Baileys).
          </p>
        </div>
      </div>

      {!vpsOk && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {vpsStatus === 'qr'
            ? 'WhatsApp (Baileys) aguardando pareamento — escaneie o QR na Central WhatsApp antes de enviar.'
            : vpsStatus === 'unreachable'
              ? 'Servidor WhatsApp (VPS) inacessível no momento.'
              : `Sessão WhatsApp: ${vpsStatus} — envios podem falhar.`}
        </div>
      )}

      {/* Config do leilão + extração */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Leilão</span>
            <select
              value={leilaoId}
              onChange={e => setLeilaoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
            >
              <option value="">Selecione…</option>
              {leiloes.map(l => (
                <option key={l.id} value={l.id}>
                  {l.data?.slice(8, 10)}/{l.data?.slice(5, 7)} — {l.nome}{l.catalogo_url ? '' : ' (sem catálogo)'}
                </option>
              ))}
            </select>
            {leilao?.catalogo_url && (
              <a href={leilao.catalogo_url} target="_blank" rel="noreferrer"
                 className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline">
                <FileText className="w-3 h-3" /> ver catálogo anexado
              </a>
            )}
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lotes (números)</span>
            <input
              value={lotesInput}
              onChange={e => setLotesInput(e.target.value)}
              placeholder="ex.: 2, 3, 4, 5, 11, 21"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Linha de pagamento/frete</span>
            <input
              value={cond.linhaPagamento}
              onChange={e => setCond(c => ({ ...c, linhaPagamento: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Linha de fechamento</span>
            <input
              value={cond.linhaFecho}
              onChange={e => setCond(c => ({ ...c, linhaFecho: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={extrair}
            disabled={extracting || !leilao?.catalogo_url}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {extracting ? 'Lendo catálogo…' : 'Extrair lotes do catálogo (IA)'}
          </button>
          <button
            onClick={() => addRow()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Lote manual
          </button>
          {extractError && <span className="text-sm text-red-600">{extractError}</span>}
        </div>
      </div>

      {/* Destino + enviar todos */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-wrap items-end gap-4">
        <label className="block grow max-w-xs">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Enviar para (telefone com DDD)</span>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="ex.: 31 99999-9999"
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
          />
        </label>
        <button
          onClick={enviarTodos}
          disabled={sendingAll || rows.length === 0 || !vpsOk}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {sendingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Enviar todos ({rows.length})
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400 basis-full">
          O VPS enfileira com intervalo aleatório de 8–25s entre mensagens (anti-ban). GIF e legenda saem na mesma mensagem.
        </p>
      </div>

      {/* Lotes */}
      <div className="space-y-4">
        {rows.map(r => (
          <div key={r.key} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="inline-flex items-center justify-center rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold px-3 py-1">
                LOTE {r.lote || '?'}
              </span>
              <input
                value={r.lote}
                onChange={e => patchRow(r.key, { lote: e.target.value })}
                placeholder="nº"
                className="w-16 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-sm"
              />
              <input
                value={r.nome}
                onChange={e => patchRow(r.key, { nome: e.target.value })}
                placeholder="nome do animal"
                className="grow min-w-40 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-sm"
              />
              {r.sendState === 'queued' && (
                <span className="inline-flex items-center gap-1 text-emerald-600 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" /> na fila do WhatsApp
                </span>
              )}
              {r.sendState === 'error' && (
                <span className="inline-flex items-center gap-1 text-red-600 text-sm" title={r.sendError}>
                  <AlertTriangle className="w-4 h-4" /> {r.sendError || 'falhou'}
                </span>
              )}
              <button onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}
                      className="ml-auto text-gray-400 hover:text-red-600" title="Remover">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <textarea
                value={r.caption}
                onChange={e => patchRow(r.key, { caption: e.target.value })}
                rows={10}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm font-mono"
                placeholder="Legenda que vai junto do GIF…"
              />
              <div className="space-y-3">
                <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">GIF / vídeo (~6s) do lote</span>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                      {r.uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {r.uploading ? 'Subindo…' : 'Anexar arquivo'}
                      <input
                        type="file" accept="video/mp4,video/webm,image/gif,image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) void uploadMedia(r.key, f); e.target.value = '' }}
                      />
                    </label>
                    {r.mediaUrl && (
                      <>
                        <a href={r.mediaUrl} target="_blank" rel="noreferrer" className="text-xs text-amber-700 dark:text-amber-400 hover:underline break-all">
                          {r.mediaUrl.split('/').pop()}
                        </a>
                        <button onClick={() => patchRow(r.key, { mediaUrl: '' })} className="text-gray-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                  <input
                    value={r.mediaUrl}
                    onChange={e => patchRow(r.key, { mediaUrl: e.target.value })}
                    placeholder="…ou cole a URL pública do vídeo/GIF"
                    className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs"
                  />
                  {r.mediaUrl && r.mediaType === 'video' && (
                    <video src={r.mediaUrl} className="mt-2 rounded-lg max-h-40" muted loop autoPlay playsInline />
                  )}
                </div>
                <button
                  onClick={() => enviar([r.key])}
                  disabled={r.sendState === 'sending' || !vpsOk || !r.caption.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {r.sendState === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar este lote
                </button>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Selecione o leilão, informe os lotes e clique em <b>Extrair lotes do catálogo (IA)</b> — ou adicione um lote manual.
          </div>
        )}
      </div>
    </div>
  )
}
