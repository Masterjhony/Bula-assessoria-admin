import { Calendar, MapPin, ArrowRight, Users, Truck, CreditCard } from 'lucide-react'
import leilao13Img from '../assets/flyer-13jun.png'
import leilao10Img from '../assets/flyer-14jun.png'

function scrollToForm(e: React.MouseEvent) {
  e.preventDefault()
  document.getElementById('inscricao-form')?.scrollIntoView({ behavior: 'smooth' })
}

interface CardProps {
  badge: string
  title: string
  subtitle: string
  date: string
  location: string
  animals: string
  boleto: string
  img: string
  imgAlt: string
}

function Card({ badge, title, subtitle, date, location, animals, boleto, img, imgAlt }: CardProps) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-md border border-black/10 bg-white text-black shadow-[0_22px_60px_-38px_rgba(0,0,0,0.55)] transition-all hover:-translate-y-1 hover:border-black/25">
      {/* Image */}
      <a
        href="#inscricao"
        onClick={scrollToForm}
        className="relative block h-56 overflow-hidden bg-neutral-100 cursor-pointer sm:h-64"
      >
        <img
          src={img}
          alt={imgAlt}
          className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
        />
      </a>

      {/* Content */}
      <div className="flex flex-col flex-1 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase text-black/52 mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-black" />
          {badge}
          <span className="rounded-full bg-black px-2.5 py-1 text-[11px] normal-case text-white">Em breve</span>
          <span className="rounded-full bg-green-700 px-2.5 py-1 text-[11px] normal-case text-white font-bold">Frete Grátis</span>
        </div>
        <h3 className="text-2xl font-black leading-tight text-black sm:text-3xl">{title}</h3>
        <p className="mt-1 text-sm text-black/50 font-medium">{subtitle}</p>
        <div className="mt-4 flex flex-col gap-2 text-sm font-medium text-black/62">
          <span className="inline-flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-black" aria-hidden />
            {date}
          </span>
          <span className="inline-flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-black" aria-hidden />
            {location}
          </span>
          <span className="inline-flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-black" aria-hidden />
            {animals}
          </span>
          <span className="inline-flex items-center gap-2">
            <Truck className="h-4 w-4 shrink-0 text-black" aria-hidden />
            Frete incluso · entrega em qualquer estado
          </span>
          <span className="inline-flex items-center gap-2">
            <CreditCard className="h-4 w-4 shrink-0 text-black" aria-hidden />
            {boleto}
          </span>
        </div>
        <div className="mt-6 pt-5 border-t border-black/8">
          <a
            href="#inscricao"
            onClick={scrollToForm}
            className="inline-flex items-center gap-2 rounded-md bg-black px-5 py-3 text-sm font-black text-white transition-all hover:gap-3"
          >
            Quero participar
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  )
}

export function LeilaoCard() {
  return (
    <section id="evento" className="mx-auto max-w-7xl px-5 sm:px-8 py-14 sm:py-18">
      <div className="mb-8">
        <span className="text-[11px] font-bold uppercase text-black/55">Assessoria gratuita · Frete grátis · Boleto parcelado</span>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-black sm:text-4xl">Dois leilões. Zero custo de transporte.</h2>
        <p className="mt-2 text-base text-black/50">Compre do Pará, da Bahia, do Mato Grosso. O animal chega na sua fazenda sem cobrar um real de frete.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card
          badge="13 de Junho · Sábado"
          title="Leilão de Bezerras JMP"
          subtitle="Safra 2025 · 100% oriundas de FIV · Genética de elite"
          date="13 de Junho de 2026 · Sábado"
          location="Terra Nova Eventos · Campo Grande/MS"
          animals="240 Bezerras Cabeceiras · 100% FIV"
          boleto="30× lote individual · 40× lote múltiplo (1+39)"
          img={leilao13Img}
          imgAlt="Leilão de Bezerras JMP, 13 de Junho"
        />
        <Card
          badge="14 de Junho · Domingo"
          title="10º Leilão Nelore JMP"
          subtitle="1.000 touros PO selecionados, assessorados pela Bula"
          date="14 de Junho de 2026 · Domingo · 09h"
          location="Terra Nova Eventos · Campo Grande/MS"
          animals="1.000 Touros PO Nelore"
          boleto="30× lote individual · 40× lote múltiplo (1+39)"
          img={leilao10Img}
          imgAlt="10º Leilão Nelore JMP, 14 de Junho"
        />
      </div>
    </section>
  )
}
