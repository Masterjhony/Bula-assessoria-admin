'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ChevronRight } from 'lucide-react'

const SISTEMA_PREFIX = '/sistema'

const ROUTE_MAP: Record<string, { label: string; section?: string }> = {
  '': { label: 'Dashboard' },
  dashboard: { label: 'Dashboard' },
  analytics: { label: 'Analytics', section: 'Ferramentas' },
  'biblioteca-midia': { label: 'Biblioteca de Mídia', section: 'Ferramentas' },
  contratos: { label: 'Contratos', section: 'ERP' },
  crm: { label: 'CRM' },
  ia: { label: 'IA Mapeamento', section: 'Ferramentas' },
  leiloes: { label: 'Leilões' },
  fechamento: { label: 'Fechamento', section: 'Leilões' },
  equipe: { label: 'Equipe', section: 'Leilões' },
  okr: { label: 'OKR', section: 'Operações' },
  settings: { label: 'Configurações', section: 'Administração' },
  projetos: { label: 'Projetos', section: 'Operações' },
  users: { label: 'Usuários', section: 'Administração' },
  whatsapp: { label: 'Central WhatsApp', section: 'Administração' },
  email: { label: 'Central de E-mail', section: 'Administração' },
  'catalogos-whatsapp': { label: 'Catálogos WhatsApp', section: 'Administração' },
}

function labelFor(segment: string): string {
  const known = ROUTE_MAP[segment]
  if (known) return known.label
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')
}

export function AdminBreadcrumbs() {
  const pathname = usePathname()
  if (!pathname || !pathname.startsWith(SISTEMA_PREFIX)) return null

  // Strip /sistema prefix for breadcrumb segments
  const trail = pathname.slice(SISTEMA_PREFIX.length) || '/'
  if (trail === '/' || trail === '') return null

  const segments = trail.split('/').filter(Boolean)
  if (segments.length === 0) return null

  const section = ROUTE_MAP[segments[0]]?.section

  const crumbs = segments.map((seg, i) => ({
    label: labelFor(seg),
    href: SISTEMA_PREFIX + '/' + segments.slice(0, i + 1).join('/'),
  }))

  return (
    <nav
      aria-label="Trilha de navegação"
      className="border-b border-gray-200/60 dark:border-[rgba(200,169,110,0.10)] bg-white/40 dark:bg-[#141414]/40 backdrop-blur-sm"
    >
      <div className="px-3 sm:px-4 lg:px-6 py-2 flex items-center gap-2 text-xs overflow-x-auto">
        <Link
          href={SISTEMA_PREFIX}
          className="shrink-0 flex items-center gap-1.5 text-[var(--text3)] hover:text-[var(--gold)] transition-colors"
          aria-label="Painel"
        >
          <Home size={12} />
        </Link>

        {section && (
          <>
            <ChevronRight size={11} className="text-[var(--text4)] shrink-0" />
            <span className="text-[var(--text3)] uppercase tracking-wide" style={{ fontSize: 10, letterSpacing: '0.12em' }}>
              {section}
            </span>
          </>
        )}

        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <span key={c.href} className="flex items-center gap-2 min-w-0">
              <ChevronRight size={11} className="text-gray-300 dark:text-[rgba(200,169,110,0.25)] shrink-0" />
              {isLast ? (
                <span
                  className="font-bold text-gray-900 dark:text-[#F5F5F5] truncate max-w-[220px]"
                  aria-current="page"
                >
                  {c.label}
                </span>
              ) : (
                <Link
                  href={c.href}
                  className="text-gray-500 dark:text-[#B0B0B0] hover:text-[#A68B4B] dark:hover:text-[#C8A96E] transition-colors truncate max-w-[160px]"
                >
                  {c.label}
                </Link>
              )}
            </span>
          )
        })}
      </div>
    </nav>
  )
}
