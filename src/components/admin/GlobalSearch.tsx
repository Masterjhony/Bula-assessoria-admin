'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Gavel, BarChart3, Users, Building2, Loader2 } from 'lucide-react'

type Hit = { id: string; label: string; sub?: string; href: string }
type Payload = {
  leiloes: Hit[]
  fechamentos: Hit[]
  leads: Hit[]
  empresas: Hit[]
}

const GROUPS: Array<{
  key: keyof Payload
  label: string
  icon: React.ElementType
}> = [
  { key: 'leiloes',     label: 'Leilões',     icon: Gavel },
  { key: 'fechamentos', label: 'Fechamentos', icon: BarChart3 },
  { key: 'leads',       label: 'Leads',       icon: Users },
  { key: 'empresas',    label: 'Empresas',    icon: Building2 },
]

function flatten(p: Payload | null): Array<Hit & { group: keyof Payload }> {
  if (!p) return []
  const out: Array<Hit & { group: keyof Payload }> = []
  for (const g of GROUPS) for (const h of p[g.key] ?? []) out.push({ ...h, group: g.key })
  return out
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function GlobalSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Atalho Cmd/Ctrl+K para focar o input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === 'Escape' && open) {
        inputRef.current?.blur()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Fecha ao clicar fora.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Busca debounced.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const ac = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ac.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as Payload
        setData(json)
        setActive(0)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('busca falhou', e)
          setData(null)
        }
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => { ac.abort(); clearTimeout(t) }
  }, [q])

  const flat = useMemo(() => flatten(data), [data])
  const groupedNonEmpty = useMemo(() => GROUPS.filter(g => (data?.[g.key]?.length ?? 0) > 0), [data])
  const hasQuery = q.trim().length >= 2

  function go(hit: Hit) {
    router.push(hit.href)
    setOpen(false)
    setQ('')
    inputRef.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, Math.max(0, flat.length - 1))) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') {
      const hit = flat[active]
      if (hit) { e.preventDefault(); go(hit) }
    }
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0 max-w-[640px] mx-2 sm:mx-4 hidden md:block">
      <div
        className="flex items-center gap-2 h-9 px-3 transition-colors text-xs"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          background: 'var(--s2)',
          color: 'var(--text2)',
        }}
      >
        {loading
          ? <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text3)' }} />
          : <Search size={13} style={{ color: 'var(--text3)' }} />}
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar leilões, fechamentos, leads, empresas…"
          className="flex-1 bg-transparent outline-none border-0 text-xs placeholder:text-[var(--text3)]"
          style={{ color: 'var(--text)' }}
        />
        <kbd
          style={{
            padding: '1px 6px',
            borderRadius: 4,
            border: '1px solid var(--border)',
            fontSize: 10,
            color: 'var(--text3)',
            background: 'var(--bg)',
          }}
        >
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </div>

      {open && hasQuery && (
        <div
          className="absolute left-0 right-0 mt-2 z-50 max-h-[70vh] overflow-y-auto"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border2)',
            borderRadius: 'var(--r-lg)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
          }}
        >
          {loading && !data && (
            <div className="px-4 py-6 text-xs text-center" style={{ color: 'var(--text3)' }}>Buscando…</div>
          )}
          {!loading && data && flat.length === 0 && (
            <div className="px-4 py-6 text-xs text-center" style={{ color: 'var(--text3)' }}>
              Nenhum resultado para <strong style={{ color: 'var(--text2)' }}>“{q}”</strong>
            </div>
          )}
          {groupedNonEmpty.map(group => {
            const Icon = group.icon
            const items = data![group.key]
            return (
              <div key={group.key}>
                <div
                  className="px-4 pt-3 pb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: 'var(--gold)' }}
                >
                  <Icon size={10} />
                  {group.label}
                  <span style={{ color: 'var(--text3)' }}>· {items.length}</span>
                </div>
                {items.map(hit => {
                  const flatIdx = flat.findIndex(h => h.group === group.key && h.id === hit.id)
                  const isActive = flatIdx === active
                  return (
                    <button
                      key={`${group.key}-${hit.id}`}
                      type="button"
                      onMouseEnter={() => setActive(flatIdx)}
                      onClick={() => go(hit)}
                      className="w-full text-left px-4 py-2 flex items-center gap-3 transition-colors"
                      style={{
                        background: isActive ? 'var(--gold-dim)' : 'transparent',
                        color: 'var(--text)',
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold truncate">{hit.label}</p>
                        {hit.sub && (
                          <p className="text-[11px] truncate" style={{ color: 'var(--text3)' }}>{hit.sub}</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
