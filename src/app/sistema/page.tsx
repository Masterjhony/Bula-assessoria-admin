import Link from 'next/link'
import { Gavel, Users, Calendar, Sparkles, Shield } from 'lucide-react'

const quickCards = [
  { href: '/sistema/leiloes', label: 'Leilões', icon: Gavel, group: 'Leilões' },
  { href: '/sistema/projetos', label: 'Projetos', icon: Calendar, group: 'Operações' },
  { href: '/sistema/crm', label: 'CRM', icon: Users, group: 'Vendas' },
  { href: '/sistema/analytics', label: 'Analytics', icon: Sparkles, group: 'Ferramentas' },
  { href: '/sistema/users', label: 'Usuários', icon: Shield, group: 'Administração' },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <p
          className="text-[10px] font-semibold mb-1"
          style={{ letterSpacing: '0.24em', textTransform: 'uppercase', color: '#C8A96E' }}
        >
          Dashboard
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-[#F5F5F5]">
          Painel Bula Assessoria
        </h1>
        <p className="muted text-sm mt-1">
          Visão geral será implementada na Fase 8 da migração. Por enquanto, navegue pelos módulos.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {quickCards.map(({ href, label, icon: Icon, group }) => (
          <Link
            key={href}
            href={href}
            className="card-surface p-5 hover:border-[#C8A96E]/40 transition-colors group"
          >
            <div className="flex items-center justify-between mb-3">
              <Icon size={22} className="text-[#C8A96E]" />
              <span
                className="text-[9px] font-bold"
                style={{ letterSpacing: '0.2em', textTransform: 'uppercase', color: '#999' }}
              >
                {group}
              </span>
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-[#F5F5F5] group-hover:text-[#C8A96E] transition-colors">
              {label}
            </h3>
          </Link>
        ))}
      </div>
    </div>
  )
}
