'use client'

/**
 * Paginação reutilizável para listas grandes (Frente A do upgrade HastaPro).
 * Controlada: o pai mantém `page`/`pageSize` e fatia a lista. Estilo casa com o
 * design system (CSS vars + classe `btn ghost`). Client-side por padrão; serve
 * igual para paginação server-side (o pai decide o que fazer no onChange).
 */

type Props = {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  onPageSize?: (n: number) => void
  pageSizeOptions?: number[]
  /** Rótulo do item (ex.: 'clientes', 'fechamentos'). */
  label?: string
}

export function Pagination({
  page, pageSize, total, onPage, onPageSize,
  pageSizeOptions = [25, 50, 100], label = 'itens',
}: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const cur = Math.min(Math.max(1, page), pages)
  const from = total === 0 ? 0 : (cur - 1) * pageSize + 1
  const to = Math.min(cur * pageSize, total)

  // janela de páginas: 1 … (cur-1 cur cur+1) … pages
  const win = new Set<number>([1, pages, cur, cur - 1, cur + 1])
  const nums = [...win].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  const items: (number | '…')[] = []
  let prev = 0
  for (const n of nums) {
    if (n - prev > 1) items.push('…')
    items.push(n)
    prev = n
  }

  const btn: React.CSSProperties = {
    height: 30, minWidth: 30, padding: '0 8px', fontSize: 12, borderRadius: 6,
    border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text2)',
  }
  const btnActive: React.CSSProperties = {
    ...btn, color: 'var(--gold)', borderColor: 'var(--gold-dark)', background: 'var(--gold-dim)',
  }

  return (
    <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginTop: 14 }}>
      <span style={{ fontSize: 12, color: 'var(--text3)' }}>
        <b style={{ color: 'var(--text2)' }}>{from.toLocaleString('pt-BR')}–{to.toLocaleString('pt-BR')}</b> de{' '}
        <b style={{ color: 'var(--text2)' }}>{total.toLocaleString('pt-BR')}</b> {label}
      </span>

      <div className="flex items-center" style={{ gap: 6 }}>
        {onPageSize && (
          <select
            className="btn ghost"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            style={{ ...btn, paddingRight: 4 }}
            aria-label="Itens por página"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n}/pág</option>
            ))}
          </select>
        )}

        <button className="btn ghost" style={btn} onClick={() => onPage(cur - 1)} disabled={cur <= 1} aria-label="Página anterior">‹</button>

        {items.map((it, i) =>
          it === '…' ? (
            <span key={`e${i}`} style={{ color: 'var(--text3)', padding: '0 2px' }}>…</span>
          ) : (
            <button
              key={it}
              className="btn ghost"
              style={it === cur ? btnActive : btn}
              onClick={() => onPage(it)}
              aria-current={it === cur ? 'page' : undefined}
            >
              {it}
            </button>
          ),
        )}

        <button className="btn ghost" style={btn} onClick={() => onPage(cur + 1)} disabled={cur >= pages} aria-label="Próxima página">›</button>
      </div>
    </div>
  )
}
