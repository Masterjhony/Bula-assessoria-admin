'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, LogOut, Menu, X, Users, Settings, Calendar,
  MessageCircle, FileText, Sparkles, Gavel, Shield, ChevronDown,
  BarChart2, Target, BarChart3,
  Mail, ImageIcon,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { GlobalSearch } from '@/components/admin/GlobalSearch'
import { AdminBreadcrumbs } from '@/components/admin/AdminBreadcrumbs'

type NavItem = { href: string; label: string; icon: React.ElementType }
type NavGroup = { label: string; icon: React.ElementType; items: NavItem[] }
type NavEntry = NavItem | NavGroup

function isGroup(e: NavEntry): e is NavGroup {
  return 'items' in e
}

const navConfig: NavEntry[] = [
  { href: '/sistema', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sistema/crm', label: 'CRM', icon: Users },
  {
    label: 'Leilões', icon: Gavel,
    items: [
      { href: '/sistema/leiloes', label: 'Leilões', icon: Gavel },
      { href: '/sistema/leiloes/fechamento', label: 'Fechamento de Leilões', icon: BarChart3 },
      { href: '/sistema/leiloes/equipe', label: 'Equipe', icon: Users },
    ],
  },
  {
    label: 'Operações', icon: Calendar,
    items: [
      { href: '/sistema/projetos', label: 'Projetos', icon: Calendar },
      { href: '/sistema/okr', label: 'OKR', icon: Target },
    ],
  },
  {
    label: 'Ferramentas', icon: Sparkles,
    items: [
      { href: '/sistema/analytics', label: 'Analytics', icon: BarChart2 },
      { href: '/sistema/ia', label: 'IA Mapeamento', icon: Sparkles },
      { href: '/sistema/biblioteca-midia', label: 'Biblioteca de Mídia', icon: ImageIcon },
    ],
  },
  {
    label: 'Administração', icon: Shield,
    items: [
      { href: '/sistema/users', label: 'Usuários & Permissões', icon: Shield },
      { href: '/sistema/whatsapp', label: 'Central WhatsApp', icon: MessageCircle },
      { href: '/sistema/email', label: 'Central de E-mail', icon: Mail },
      { href: '/sistema/catalogos-whatsapp', label: 'Catálogos WhatsApp', icon: FileText },
      { href: '/sistema/settings', label: 'Configurações', icon: Settings },
    ],
  },
]

function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [userEmail, setUserEmail] = useState<string>('')
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const navRef = useRef<HTMLDivElement>(null)
  const mobileNavRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          const target = pathname && pathname !== '/sistema'
            ? `/?next=${encodeURIComponent(pathname)}`
            : '/'
          router.push(target)
          return
        }
        setUserEmail(user.email || '')
      } catch (e) {
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    checkUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const inDesktopNav = navRef.current?.contains(target)
      const inMobileNav = mobileNavRef.current?.contains(target)
      if (!inDesktopNav && !inMobileNav) setOpenDropdown(null)
      if (userRef.current && !userRef.current.contains(target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { setMobileOpen(false); setOpenDropdown(null) }, [pathname])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-[#0D0D0D] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#A68B4B]" />
      </div>
    )
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const isActive = (href: string) => {
    if (href === '/sistema') return pathname === '/sistema'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const isGroupActive = (items: NavItem[]) => items.some((i) => isActive(i.href))

  const initial = (userEmail || 'A').charAt(0).toUpperCase()

  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-300"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      <header
        className="sticky top-0 z-50 backdrop-blur-xl"
        style={{
          background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-[76px] lg:h-[88px] gap-3">

            <Link href="/sistema" className="shrink-0 flex items-center" aria-label="Bula Assessoria">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-bula-remates-preto-_1_.svg"
                alt="Bula Assessoria"
                className="block dark:hidden"
                style={{ height: 84, width: 84, objectFit: 'contain' }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-bula-remates-branco-_1_.svg"
                alt="Bula Assessoria"
                className="hidden dark:block"
                style={{ height: 84, width: 84, objectFit: 'contain' }}
              />
            </Link>

            <div className="hidden lg:block h-7 w-px bg-[var(--border2)] mx-3" />

            <nav ref={navRef} className="hidden lg:flex items-stretch gap-1 ml-2 h-full">
              {navConfig.map((entry) => {
                if (!isGroup(entry)) {
                  const Icon = entry.icon
                  const active = isActive(entry.href)
                  return (
                    <Link
                      key={entry.href}
                      href={entry.href}
                      className={`flex items-center gap-1.5 px-3 text-[12px] font-medium uppercase tracking-wide transition-colors border-b-2 ${
                        active
                          ? 'text-[var(--gold)] border-[var(--gold)]'
                          : 'text-[var(--text3)] border-transparent hover:text-[var(--text2)]'
                      }`}
                    >
                      <Icon size={14} />
                      <span>{entry.label}</span>
                    </Link>
                  )
                }

                const Icon = entry.icon
                const active = isGroupActive(entry.items)
                const open = openDropdown === entry.label

                return (
                  <div key={entry.label} className="relative flex items-stretch">
                    <button
                      onClick={() => setOpenDropdown(open ? null : entry.label)}
                      className={`flex items-center gap-1.5 px-3 text-[12px] font-medium uppercase tracking-wide transition-colors border-b-2 ${
                        active
                          ? 'text-[var(--gold)] border-[var(--gold)]'
                          : 'text-[var(--text3)] border-transparent hover:text-[var(--text2)]'
                      }`}
                    >
                      <Icon size={14} />
                      <span>{entry.label}</span>
                      <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                    </button>

                    {open && (
                      <div
                        className="absolute top-[calc(100%+8px)] left-0 w-60 bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-[rgba(200,169,110,0.22)] shadow-2xl shadow-black/30 overflow-hidden py-2"
                        style={{ borderRadius: 4 }}
                      >
                        <span aria-hidden className="absolute top-0 left-0 block" style={{ width: 32, height: 1, background: '#A68B4B' }} />
                        <div className="px-4 pt-1 pb-2.5">
                          <p
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              letterSpacing: '0.24em',
                              textTransform: 'uppercase',
                              color: '#C8A96E',
                            }}
                          >
                            {entry.label}
                          </p>
                        </div>
                        {entry.items.map((item) => {
                          const ItemIcon = item.icon
                          const hasMoreSpecific = entry.items.some((o) => o.href !== item.href && pathname.startsWith(o.href))
                          const itemActive = hasMoreSpecific ? pathname === item.href : isActive(item.href)
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setOpenDropdown(null)}
                              className={`flex items-center gap-3 mx-1.5 px-3 py-2.5 text-sm transition-all duration-150 ${
                                itemActive
                                  ? 'bg-[rgba(166,139,75,0.14)] text-[#C8A96E] font-semibold'
                                  : 'text-gray-700 dark:text-[#F5F5F5]/80 hover:bg-gray-50 dark:hover:bg-[rgba(200,169,110,0.06)] hover:text-gray-900 dark:hover:text-[#C8A96E]'
                              }`}
                              style={{ borderRadius: 3 }}
                            >
                              <ItemIcon size={15} className={itemActive ? 'text-[#C8A96E]' : 'text-gray-400 dark:text-[#F5F5F5]/40'} />
                              <span>{item.label}</span>
                              {itemActive && <div className="ml-auto w-1 h-1 rounded-none bg-[#C8A96E]" />}
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>

            <div className="flex items-center gap-1 sm:gap-1.5 ml-auto">
              <GlobalSearch />
              <ThemeToggle />

              <div ref={userRef} className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-[#1A1A1A] transition-all"
                >
                  <div
                    className="flex items-center justify-center text-[#141414] font-bold text-sm shadow-md shadow-[#A68B4B]/25"
                    style={{
                      width: 32,
                      height: 32,
                      background: 'linear-gradient(135deg, #C8A96E 0%, #A68B4B 100%)',
                      borderRadius: 3,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {initial}
                  </div>
                  <span
                    className="hidden lg:block text-gray-700 dark:text-[#F5F5F5]"
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Admin
                  </span>
                  <ChevronDown size={13} className={`hidden lg:block text-gray-400 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {userMenuOpen && (
                  <div
                    className="absolute top-[calc(100%+8px)] right-0 w-56 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-[rgba(200,169,110,0.22)] shadow-2xl shadow-black/30 overflow-hidden py-2"
                    style={{ borderRadius: 4 }}
                  >
                    <span aria-hidden className="absolute top-0 right-0 block" style={{ width: 32, height: 1, background: '#A68B4B' }} />
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-[rgba(200,169,110,0.14)]">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex items-center justify-center text-[#141414] font-bold text-sm"
                          style={{
                            width: 36,
                            height: 36,
                            background: 'linear-gradient(135deg, #C8A96E 0%, #A68B4B 100%)',
                            borderRadius: 3,
                          }}
                        >
                          {initial}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900 dark:text-[#F5F5F5]">Administrador</p>
                          <p
                            style={{
                              fontSize: 10,
                              color: '#C8A96E',
                              letterSpacing: '0.2em',
                              textTransform: 'uppercase',
                              marginTop: 2,
                            }}
                          >
                            Bula Assessoria
                          </p>
                          {userEmail && (
                            <p className="text-[11px] text-gray-500 dark:text-[#B0B0B0] mt-1 truncate max-w-[180px]">
                              {userEmail}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-3 mx-1.5 mt-1 px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 transition-all"
                      style={{ width: 'calc(100% - 12px)' }}
                    >
                      <LogOut size={15} />
                      Sair do Painel
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1A1A1A] transition-all"
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {mobileOpen && (
          <div ref={mobileNavRef} className="lg:hidden border-t border-gray-200 dark:border-[rgba(200,169,110,0.14)] bg-white dark:bg-[#0D0D0D] max-h-[calc(100svh-60px)] overflow-y-auto">
            <div className="px-4 py-3 space-y-0.5">
              {navConfig.map((entry) => {
                if (!isGroup(entry)) {
                  const Icon = entry.icon
                  const active = isActive(entry.href)
                  return (
                    <Link
                      key={entry.href}
                      href={entry.href}
                      className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all ${
                        active
                          ? 'bg-[#A68B4B] text-[#141414]'
                          : 'text-gray-700 dark:text-[#F5F5F5]/80 hover:bg-gray-50 dark:hover:bg-[rgba(200,169,110,0.06)] hover:text-[#C8A96E]'
                      }`}
                      style={{ borderRadius: 3 }}
                    >
                      <Icon size={18} />
                      {entry.label}
                    </Link>
                  )
                }

                const Icon = entry.icon
                const active = isGroupActive(entry.items)
                const open = openDropdown === entry.label

                return (
                  <div key={entry.label}>
                    <button
                      onClick={() => setOpenDropdown(open ? null : entry.label)}
                      className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                        active
                          ? 'text-[#A68B4B] bg-[#A68B4B]/5'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1A1A1A]'
                      }`}
                    >
                      <Icon size={18} />
                      <span className="flex-1 text-left">{entry.label}</span>
                      <ChevronDown size={15} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && (
                      <div className="ml-6 mt-0.5 mb-1 space-y-0.5">
                        {entry.items.map((item) => {
                          const ItemIcon = item.icon
                          const hasMoreSpecific = entry.items.some((o) => o.href !== item.href && pathname.startsWith(o.href))
                          const itemActive = hasMoreSpecific ? pathname === item.href : isActive(item.href)
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all ${
                                itemActive
                                  ? 'bg-[#A68B4B]/10 text-[#A68B4B] font-semibold'
                                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1A1A1A]'
                              }`}
                            >
                              <ItemIcon size={15} />
                              {item.label}
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="pt-3 mt-2 border-t border-gray-100 dark:border-[#2A2A2A] space-y-1">
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
                >
                  <LogOut size={17} />
                  Sair do Painel
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <AdminBreadcrumbs />

      <main className="flex-1 overflow-auto" style={{ background: 'var(--bg)' }}>
        <div className="mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8" style={{ maxWidth: 1600 }}>{children}</div>
      </main>
    </div>
  )
}

export default function SistemaLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <AdminShell>{children}</AdminShell>
    </ThemeProvider>
  )
}
