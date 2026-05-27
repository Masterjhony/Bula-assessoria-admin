import { Sparkles } from 'lucide-react'

type Props = {
  title: string
  phase: string
  description?: string
}

export function PlaceholderPage({ title, phase, description }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <p
          className="text-[10px] font-semibold mb-1"
          style={{ letterSpacing: '0.24em', textTransform: 'uppercase', color: '#C8A96E' }}
        >
          {phase}
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-[#F5F5F5]">
          {title}
        </h1>
      </div>

      <div className="card-surface p-6 sm:p-10 flex items-start gap-4">
        <div className="shrink-0 p-3 rounded-md bg-[rgba(200,169,110,0.10)]">
          <Sparkles size={22} className="text-[#C8A96E]" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900 dark:text-[#F5F5F5] mb-1">
            Módulo em migração
          </h3>
          <p className="muted text-sm leading-relaxed">
            {description ||
              `Este módulo está em construção. Será entregue na ${phase} da migração.`}
          </p>
        </div>
      </div>
    </div>
  )
}
