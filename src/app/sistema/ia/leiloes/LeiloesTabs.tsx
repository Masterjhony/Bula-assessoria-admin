'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileVideo, Images } from 'lucide-react'

const TABS = [
  { href: '/sistema/ia/leiloes', label: 'Visão geral', icon: FileVideo, exact: true },
  { href: '/sistema/ia/leiloes/lotes', label: 'Galeria de lotes', icon: Images, exact: false },
]

export default function LeiloesTabs() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Seções da análise de leilões"
      className="inline-flex w-full gap-1 rounded-2xl border border-gray-200 bg-white p-1.5 dark:border-[#292929] dark:bg-[#121212] sm:w-auto"
    >
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition sm:flex-none ${active
              ? 'bg-[#B89A57] text-black shadow-sm'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-[#202020] dark:hover:text-white'
            }`}
          >
            <Icon size={15} /> {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
