import { PlayCircle } from 'lucide-react'
import flyer13 from '../assets/flyer-13jun.png'
import flyer14 from '../assets/flyer-14jun.png'
import logoTouros from '../assets/logo-touros-jmp.png'
import { PhotoGallery, type GaleriaFoto } from './PhotoGallery'

// ── Fotos por leilão — edite estes arrays para trocar/adicionar fotos ─────────
// Fêmeas: solte arquivos em public/galeria-femeas/ e referencie aqui.
const FOTOS_FEMEAS: GaleriaFoto[] = [
  { src: '/galeria-femeas/IMG_0062.jpg', alt: 'Aparte das fêmeas — Leilão Nelore JMP' },
  { src: '/galeria-femeas/IMG_0106.jpg', alt: 'Aparte das fêmeas — Leilão Nelore JMP' },
  { src: '/galeria-femeas/IMG_0109.jpg', alt: 'Aparte das fêmeas — Leilão Nelore JMP' },
  { src: '/galeria-femeas/IMG_0117.jpg', alt: 'Aparte das fêmeas — Leilão Nelore JMP', objectPosition: 'top' },
]

// Touros: solte arquivos em public/galeria-touros/ e referencie aqui.
const FOTOS_TOUROS: GaleriaFoto[] = [
  { src: '/galeria-touros/IMG_0003.jpg', alt: 'Aparte dos touros — Leilão Nelore JMP' },
  { src: '/galeria-touros/IMG_0006.jpg', alt: 'Aparte dos touros — Leilão Nelore JMP' },
  { src: '/galeria-touros/IMG_0037.jpg', alt: 'Aparte dos touros — Leilão Nelore JMP' },
  { src: '/galeria-touros/IMG_0059.jpg', alt: 'Aparte dos touros — Leilão Nelore JMP' },
]

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

function LeilaoBlock({
  id,
  flyer,
  flyerAlt,
  heading,
  subheading,
  fotos,
  playlistLabel,
  logo,
  logoAlt,
}: {
  id: string
  flyer: string
  flyerAlt: string
  heading: string
  subheading: string
  fotos: GaleriaFoto[]
  playlistLabel: string
  logo?: string
  logoAlt?: string
}) {
  return (
    <section id={id} className="scroll-mt-24 bg-neutral-950">
      {/* Flyer full-width */}
      <img
        src={flyer}
        alt={flyerAlt}
        className="block w-full h-auto"
        loading="lazy"
        decoding="async"
      />

      {/* Galeria — fotos + playlist */}
      <div className="mx-auto max-w-7xl px-5 sm:px-8 py-14 sm:py-20">
        <div className="mb-8">
          {logo && (
            <img
              src={logo}
              alt={logoAlt ?? heading}
              className="mb-5 h-16 w-auto sm:h-20"
              loading="lazy"
              decoding="async"
            />
          )}
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">{subheading}</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{heading}</h2>
        </div>
        <div className="grid items-start gap-5 md:grid-cols-2">
          <PhotoGallery fotos={fotos} />
          <YoutubePlaceholder label={playlistLabel} />
        </div>
      </div>
    </section>
  )
}

export function LeilaoSections() {
  return (
    <>
      {/* 1 — Flyer Bezerras + Galeria Fêmeas */}
      <LeilaoBlock
        id="aparte-femeas"
        flyer={flyer13}
        flyerAlt="Leilão Virtual Bezerras Nelore JMP Premium · 13 de Junho"
        subheading="Sábado · 13 de Junho · 240 Bezerras FIV"
        heading="Aparte das Fêmeas"
        fotos={FOTOS_FEMEAS}
        playlistLabel="Playlist YouTube — fêmeas"
      />

      {/* 2 — Flyer Touros + Galeria Touros */}
      <LeilaoBlock
        id="aparte-touros"
        flyer={flyer14}
        flyerAlt="10º Leilão Nelore JMP · 1000 Touros · 14 de Junho"
        subheading="Domingo · 14 de Junho · 1.000 Touros PO"
        heading="Aparte dos Touros"
        fotos={FOTOS_TOUROS}
        playlistLabel="Playlist YouTube — touros"
        logo={logoTouros}
        logoAlt="10ª Leilão Nelore JMP — Touros"
      />
    </>
  )
}
