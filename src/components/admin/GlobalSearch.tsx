'use client'

import { Search } from 'lucide-react'

// Placeholder. Implementação completa virá depois (índice de busca cruzada).
export function GlobalSearch() {
  return (
    <button
      type="button"
      disabled
      aria-label="Buscar (em breve)"
      className="hidden md:inline-flex items-center gap-2 h-9 px-3 transition-colors text-xs"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        background: 'var(--s2)',
        color: 'var(--text3)',
      }}
    >
      <Search size={13} />
      <span style={{ marginRight: 4 }}>Buscar</span>
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
        ⌘K
      </kbd>
    </button>
  )
}
