import { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, X, ChevronLeft, ChevronRight } from 'lucide-react'

export interface GaleriaFoto {
  src: string
  alt: string
  caption?: string
  objectPosition?: string
}

function FotoCard({ foto, idx, onClick }: { foto: GaleriaFoto; idx: number; onClick: () => void }) {
  const imgStyle = foto.objectPosition ? { objectPosition: foto.objectPosition } : undefined
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      aria-label={`Abrir foto: ${foto.alt}`}
    >
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl bg-neutral-800">
        <img
          src={foto.src}
          alt={foto.alt}
          width={1400}
          height={933}
          loading={idx < 2 ? 'eager' : 'lazy'}
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          style={imgStyle}
        />
        {foto.caption && (
          <div className="absolute inset-0 flex items-end bg-black/0 transition-all duration-200 group-hover:bg-black/45">
            <p className="translate-y-2 px-4 pb-4 text-sm font-medium text-white opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
              {foto.caption}
            </p>
          </div>
        )}
      </div>
    </button>
  )
}

/**
 * Galeria de fotos reutilizável — grid responsivo + lightbox com ESC e
 * navegação por setas/teclado. Usada por cada bloco de leilão (touros e fêmeas).
 */
export function PhotoGallery({ fotos }: { fotos: GaleriaFoto[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const prev = useCallback(() => {
    setLightboxIndex(i => (i === null ? i : (i - 1 + fotos.length) % fotos.length))
  }, [fotos.length])

  const next = useCallback(() => {
    setLightboxIndex(i => (i === null ? i : (i + 1) % fotos.length))
  }, [fotos.length])

  // Lightbox: ESC fecha, setas navegam, trava scroll do body
  useEffect(() => {
    if (lightboxIndex === null) return
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => closeButtonRef.current?.focus(), 0)
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null)
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [lightboxIndex, prev, next])

  if (fotos.length === 0) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 text-white/30 sm:min-h-[320px]">
        <Camera className="h-10 w-10" aria-hidden />
        <p className="text-sm font-medium">Fotos em breve</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {fotos.map((foto, idx) => (
          <FotoCard key={foto.src} foto={foto} idx={idx} onClick={() => setLightboxIndex(idx)} />
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visualizar foto"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={e => { e.stopPropagation(); setLightboxIndex(null) }}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>

          {fotos.length > 1 && (
            <>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); prev() }}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-5"
                aria-label="Foto anterior"
              >
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); next() }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-5"
                aria-label="Próxima foto"
              >
                <ChevronRight className="h-6 w-6" aria-hidden />
              </button>
            </>
          )}

          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <img
              src={fotos[lightboxIndex].src}
              alt={fotos[lightboxIndex].alt}
              className="max-h-[80vh] max-w-[85vw] rounded-lg object-contain"
            />
            {fotos[lightboxIndex].caption && (
              <p className="mt-3 text-center text-sm text-white/70">{fotos[lightboxIndex].caption}</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
