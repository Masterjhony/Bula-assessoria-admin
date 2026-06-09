import { PlayCircle } from 'lucide-react'
import { PhotoGallery } from './PhotoGallery'
import { youtubeEmbed, type JmpBlock } from '../content'

function YoutubePlaceholder({ label }: { label: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-white/20 bg-white/5 p-10 text-center sm:min-h-[320px]">
      <PlayCircle className="h-10 w-10 text-white/30" aria-hidden />
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-white/40">{label}</p>
        <p className="mt-1 text-xs text-white/25">Adicionar playlist do YouTube aqui</p>
      </div>
    </div>
  )
}

function YoutubeArea({ url, label }: { url?: string; label: string }) {
  const embed = youtubeEmbed(url)
  if (!embed) return <YoutubePlaceholder label={label} />
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <iframe
        className="absolute inset-0 h-full w-full"
        src={embed}
        title={label}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  )
}

function LeilaoBlock({ block }: { block: JmpBlock }) {
  const descLines = (block.description ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <section id={block.id} className="scroll-mt-24 bg-neutral-950">
      {/* Título — acima do flyer */}
      <div className="mx-auto max-w-7xl px-5 pt-14 sm:px-8 sm:pt-20">
        {block.logoUrl && (
          <img
            src={block.logoUrl}
            alt={block.logoAlt ?? block.heading}
            className="mb-5 h-16 w-auto sm:h-20"
            loading="lazy"
            decoding="async"
          />
        )}
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">{block.subheading}</p>
        <h2 className="mt-2 mb-8 text-3xl font-black tracking-tight text-white sm:text-4xl">{block.heading}</h2>
      </div>

      {/* Flyer full-width */}
      {block.flyerUrl && (
        <img
          src={block.flyerUrl}
          alt={block.flyerAlt}
          className="block w-full h-auto"
          loading="lazy"
          decoding="async"
        />
      )}

      {/* Copy + galeria — fotos + playlist */}
      <div className="mx-auto max-w-7xl px-5 sm:px-8 py-14 sm:py-20">
        {descLines.length > 0 && (
          <div className="mb-8 max-w-3xl space-y-2 text-base leading-relaxed text-white/70 sm:text-lg">
            {descLines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}
        <div className="grid items-start gap-5 md:grid-cols-2">
          <PhotoGallery fotos={block.fotos} />
          <YoutubeArea url={block.youtubeUrl} label={block.playlistLabel} />
        </div>
      </div>
    </section>
  )
}

export function LeilaoSections({ blocks }: { blocks: JmpBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <LeilaoBlock key={block.id || i} block={block} />
      ))}
    </>
  )
}
