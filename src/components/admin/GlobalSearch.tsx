'use client'

import { Search } from 'lucide-react'

// Placeholder. Implementação completa virá na Fase 9 (índice de busca cruzada).
export function GlobalSearch() {
  return (
    <button
      type="button"
      className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-200 dark:border-[rgba(200,169,110,0.18)] text-gray-500 dark:text-[#B0B0B0] hover:text-gray-800 dark:hover:text-[#F5F5F5] hover:border-[#C8A96E]/50 transition-colors text-xs"
      aria-label="Buscar (em breve)"
      disabled
    >
      <Search size={13} />
      <span>Buscar</span>
      <kbd className="ml-2 px-1.5 py-0.5 rounded border border-gray-200 dark:border-[rgba(200,169,110,0.18)] text-[10px]">
        ⌘K
      </kbd>
    </button>
  )
}
