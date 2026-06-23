'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Share } from 'lucide-react'
import { usePwaInstall } from './usePwaInstall'

// Botão de instalação do PWA pra usar em navbars. Adapta-se ao dispositivo:
//  - Android/Chrome: clique dispara o prompt nativo de instalação.
//  - iOS/Safari: clique abre um popover com as instruções "Adicionar à Tela
//    de Início" (único caminho possível no iOS).
//  - Some quando o app já está instalado ou quando não há como instalar.
//
// O estilo do gatilho vem por `className` (pra casar com cada layout). O `tone`
// controla as cores do popover de iOS (claro/escuro).

type Props = {
  className?: string
  label?: string
  tone?: 'dark' | 'light'
  /** Esconde o texto no mobile, deixando só o ícone. */
  hideLabelOnMobile?: boolean
  /** Lado em que o popover de iOS abre. */
  align?: 'left' | 'right'
}

export function InstallButton({
  className = '',
  label = 'Baixar app',
  tone = 'dark',
  hideLabelOnMobile = false,
  align = 'right',
}: Props) {
  const { status, promptInstall } = usePwaInstall()
  const [iosOpen, setIosOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!iosOpen) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIosOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [iosOpen])

  // 'idle' = ainda não sabemos se dá pra instalar (evento não disparou) → esconde.
  if (status === 'idle' || status === 'installed') return null

  const onClick = () => {
    if (status === 'ios') setIosOpen((v) => !v)
    else void promptInstall()
  }

  const popoverColors =
    tone === 'light'
      ? 'bg-white text-black border-black/10'
      : 'bg-[#1d2c1d] text-[#f3f1e9] border-[rgba(200,169,110,0.28)]'

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={onClick} className={className} aria-label={label}>
        <Download className="h-4 w-4 shrink-0" />
        <span className={hideLabelOnMobile ? 'hidden sm:inline' : ''}>{label}</span>
      </button>

      {iosOpen && status === 'ios' && (
        <div
          className={`absolute top-[calc(100%+10px)] z-[120] w-72 rounded-2xl border p-4 text-left shadow-2xl ${popoverColors} ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <p className="text-sm font-semibold">Instalar no iPhone / iPad</p>
          <ol className="mt-2 space-y-2 text-xs leading-relaxed opacity-90">
            <li className="flex items-center gap-2">
              <span className="font-bold opacity-60">1.</span>
              <span className="inline-flex items-center gap-1">
                Toque em <Share className="h-3.5 w-3.5" /> <span className="font-medium">Compartilhar</span>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold opacity-60">2.</span>
              <span>
                Escolha <span className="font-medium">&ldquo;Adicionar à Tela de Início&rdquo;</span>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold opacity-60">3.</span>
              <span>Confirme em <span className="font-medium">Adicionar</span></span>
            </li>
          </ol>
          <p className="mt-3 text-[11px] opacity-60">Disponível apenas no navegador Safari.</p>
        </div>
      )}
    </div>
  )
}
