import Link from 'next/link'
import {
    ArrowRight, MessageCircle, Dna, Wallet, Eye, Target, Handshake, Gavel,
    ShieldCheck, Users, Calendar, CheckCircle2,
} from 'lucide-react'
import { WHATSAPP_CTA_URL } from '../agenda/helpers'

const HERO_VIDEO =
    'https://res.cloudinary.com/dny0ibgbn/video/upload/v1780252444/video_de_fundo_jmvezn.mp4'

// Marcas parceiras — logos estáticos servidos de /public/criatorios.
const PARCEIROS: { nome: string; src: string }[] = [
    { nome: 'Camparino', src: '/criatorios/fazenda-camparino.png' },
    { nome: 'Jacamim', src: '/criatorios/fazenda-jacamim.png' },
    { nome: 'Nelore FLOC', src: '/criatorios/nelore-floc.png' },
    { nome: 'Flor do Arataú', src: '/criatorios/nelore-flor-do-aratau.png' },
    { nome: 'JMP', src: '/criatorios/nelore-jmp.png' },
    { nome: 'MNO', src: '/criatorios/nelore-mno.png' },
    { nome: 'NFSF', src: '/criatorios/nelore-nfsf.png' },
    { nome: 'Santa Nazaré', src: '/criatorios/nelore-santa-nazare.png' },
    { nome: 'Tresmar', src: '/criatorios/nelore-tresmar.png' },
    { nome: 'Santa Nice', src: '/criatorios/santa-nice.png' },
    { nome: 'Terra Brava', src: '/criatorios/terra-brava-agropecuaria.png' },
]

const DORES = [
    {
        icon: Dna,
        titulo: 'Não sei ler a genética',
        texto: 'EPDs, DEPs, CEIP, índices. Números que decidem o valor real do animal.',
    },
    {
        icon: Wallet,
        titulo: 'Tenho medo de pagar caro errado',
        texto: 'Sem referência de mercado, o iniciante paga emoção, não valor.',
    },
    {
        icon: Eye,
        titulo: 'Não conheço os bastidores do leilão',
        texto: 'Apartação, condição comercial, quem é quem. O comprador desassistido sempre paga mais.',
    },
]

const SOLUCOES = [
    {
        icon: Dna,
        titulo: 'Curadoria de genética',
        texto: 'Lemos EPDs, DEPs e CEIP por você. Selecionamos animais que fazem sentido pro seu objetivo, não só os que estão em destaque no catálogo.',
    },
    {
        icon: Target,
        titulo: 'Estratégia de arremate',
        texto: 'Definimos antes do leilão quanto vale cada lote e até onde ir. Você dá o lance com plano, não com adrenalina.',
    },
    {
        icon: Handshake,
        titulo: 'Apartação e condição comercial',
        texto: 'Negociamos as condições, organizamos a apartação e cuidamos do operacional. Você foca na decisão, a gente cuida do resto.',
    },
    {
        icon: Gavel,
        titulo: 'Acesso aos melhores leilões',
        texto: 'Operamos nos principais leilões e criatórios de referência do Brasil. Você compra onde a elite compra.',
    },
]

const PASSOS = [
    {
        n: '01',
        titulo: 'Entre no grupo',
        texto: 'Você recebe as oportunidades selecionadas e fala direto com os assessores.',
    },
    {
        n: '02',
        titulo: 'A gente seleciona com você',
        texto: 'Indicamos os animais certos pro seu objetivo e definimos a estratégia de cada leilão.',
    },
    {
        n: '03',
        titulo: 'Você arremata com segurança',
        texto: 'Damos suporte no lance, na apartação e em toda a condição comercial.',
    },
]

// Equipe — placeholders editáveis. Conteúdo real será preenchido depois.
const EQUIPE = [
    { nome: 'Assessor Comercial', funcao: 'Estratégia de arremate e negociação' },
    { nome: 'Assessor Técnico', funcao: 'Genética, EPDs e seleção de animais' },
    { nome: 'Assessor de Relacionamento', funcao: 'Apartação e condição comercial' },
]

export default function InstitucionalPage() {
    return (
        <>
            {/* 1. HERO */}
            <section className="relative min-h-[calc(100svh-96px)] overflow-hidden bg-black text-white">
                <div className="absolute inset-0">
                    <video
                        src={HERO_VIDEO}
                        className="h-full w-full object-cover"
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                    />
                    <div className="absolute inset-0 bg-black/58" />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.98)_0%,rgba(0,0,0,0.80)_40%,rgba(0,0,0,0.32)_100%)]" />
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent" />
                </div>

                <div className="relative mx-auto grid min-h-[calc(100svh-96px)] max-w-7xl content-center px-5 py-14 sm:px-8 lg:py-18">
                    <div className="max-w-3xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-assessoria-white.png"
                            alt="Bula Assessoria"
                            className="h-20 w-auto sm:h-24 lg:h-28"
                        />
                        <div className="mt-8 inline-flex items-center gap-2 rounded-md border border-white/18 bg-white/9 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white/82 backdrop-blur">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Assessoria pecuária · Nelore PO
                        </div>
                        <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[0.96] tracking-tight text-white sm:text-7xl lg:text-8xl">
                            Do gado comercial ao Nelore&nbsp;PO.
                            <span className="block text-[#C8A96E]">Sem entrar sozinho.</span>
                        </h1>
                        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/76 sm:text-xl">
                            A Bula assessora você na compra de touros e matrizes nos principais
                            leilões do Brasil — escolha de genética, apartação e estratégia
                            comercial ao seu lado em cada lance.
                        </p>

                        <div className="mt-8 flex flex-wrap gap-3">
                            <a
                                href={WHATSAPP_CTA_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group inline-flex items-center gap-2 rounded-md bg-[#25D366] px-6 py-3.5 text-sm font-black shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#1ebe5d]"
                                style={{ color: '#ffffff' }}
                            >
                                <MessageCircle className="h-4 w-4" />
                                Entrar no grupo de leilões
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </a>
                            <Link
                                href="/agenda"
                                className="inline-flex items-center gap-2 rounded-md border border-white/28 bg-white/10 px-6 py-3.5 text-sm font-black text-white shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/16"
                            >
                                <Calendar className="h-4 w-4" />
                                Ver agenda de leilões
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2. A DOR */}
            <section className="bg-[#0A0A0A] py-20 sm:py-24">
                <div className="mx-auto max-w-7xl px-5 sm:px-8">
                    <div className="max-w-3xl">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#C8A96E]">
                            O problema
                        </span>
                        <h2 className="mt-3 text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
                            Entrar no PO sem assessoria é arriscar capital no escuro.
                        </h2>
                        <div className="mt-6 space-y-5 text-base leading-relaxed text-white/68 sm:text-lg">
                            <p>
                                Você já cria gado. Conhece o campo, entende de boi. Mas o Nelore PO
                                é outro jogo: lê-se genética, não só a estampa do animal. Um lance
                                errado custa caro — e ninguém entra num leilão de elite pela
                                primeira vez sem se sentir exposto.
                            </p>
                            <p>
                                A pergunta certa não é <em className="text-white/90 not-italic">“esse animal é bonito?”</em>.
                                É <em className="text-white/90 not-italic">“esse animal vale o que estão pedindo, e ele
                                resolve o que o meu rebanho precisa?”</em>. Responder isso sozinho,
                                no calor do arremate, é onde o iniciante perde dinheiro.
                            </p>
                        </div>
                    </div>

                    <div className="mt-12 grid gap-4 sm:grid-cols-3">
                        {DORES.map((d) => (
                            <div
                                key={d.titulo}
                                className="rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20"
                            >
                                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/12 bg-white/6 text-[#C8A96E]">
                                    <d.icon className="h-5 w-5" />
                                </div>
                                <h3 className="mt-5 text-lg font-black text-white">{d.titulo}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-white/58">{d.texto}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 3. A SOLUÇÃO */}
            <section className="bg-black py-20 sm:py-24">
                <div className="mx-auto max-w-7xl px-5 sm:px-8">
                    <div className="max-w-3xl">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#C8A96E]">
                            A Bula
                        </span>
                        <h2 className="mt-3 text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
                            A Bula é quem te leva pra dentro do PO com segurança.
                        </h2>
                        <p className="mt-5 text-base leading-relaxed text-white/68 sm:text-lg">
                            Não vendemos um animal. Construímos a sua entrada no Nelore PO com método.
                        </p>
                    </div>

                    <div className="mt-12 grid gap-4 sm:grid-cols-2">
                        {SOLUCOES.map((s) => (
                            <div
                                key={s.titulo}
                                className="group flex gap-5 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-6 transition-all hover:border-[#A68B4B]/35 sm:p-7"
                            >
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#C8A96E] text-black transition-transform group-hover:scale-105">
                                    <s.icon className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">{s.titulo}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-white/62 sm:text-[15px]">{s.texto}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 4. PROVA SOCIAL — MARCAS PARCEIRAS */}
            <section className="overflow-hidden bg-[#0A0A0A] py-20 text-white sm:py-24">
                <div className="mx-auto max-w-7xl px-5 sm:px-8">
                    <div className="max-w-2xl">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#C8A96E]">
                            Marcas parceiras
                        </span>
                        <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                            A elite do Nelore PO confia na Bula.
                        </h2>
                        <p className="mt-4 text-sm leading-relaxed text-white/60 sm:text-base">
                            Operamos nos leilões dos criatórios e selecionadores de referência do país.
                        </p>
                    </div>

                    <div className="relative mt-10 border-y border-white/10 py-6">
                        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#0A0A0A] to-transparent" />
                        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#0A0A0A] to-transparent" />
                        <div className="bula-logo-marquee flex w-max gap-4">
                            {[...PARCEIROS, ...PARCEIROS].map((p, i) => (
                                <div
                                    key={`${p.nome}-${i}`}
                                    className="flex h-24 w-52 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white px-5"
                                    aria-label={p.nome}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={p.src}
                                        alt={p.nome}
                                        loading="lazy"
                                        className="max-h-16 w-auto max-w-full object-contain"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="mt-8 max-w-3xl text-base leading-relaxed text-white/68 sm:text-lg">
                        Quando você compra com a Bula, está no mesmo ambiente onde os maiores
                        criatórios do Brasil negociam. A diferença é que agora você tem quem te oriente.
                    </p>
                </div>
            </section>

            {/* 5. A EQUIPE */}
            <section className="bg-black py-20 sm:py-24">
                <div className="mx-auto max-w-7xl px-5 sm:px-8">
                    <div className="max-w-3xl">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#C8A96E]">
                            A equipe
                        </span>
                        <h2 className="mt-3 text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
                            Gente de verdade do seu lado — não um aplicativo.
                        </h2>
                        <p className="mt-5 text-base leading-relaxed text-white/68 sm:text-lg">
                            A Bula é um time de assessores que vive de leilão. Estamos no campo, nas
                            pistas e no telefone com você antes, durante e depois do arremate. Quando
                            você entra no grupo, não fala com um robô: fala com quem entende de
                            genética, de mercado e de negociação.
                        </p>
                    </div>

                    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {EQUIPE.map((m, i) => (
                            <div
                                key={i}
                                className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
                            >
                                {/* Placeholder de foto — substituir por foto real do assessor */}
                                <div className="flex aspect-[4/3] items-center justify-center border-b border-white/8 bg-gradient-to-br from-white/[0.06] to-transparent">
                                    <Users className="h-10 w-10 text-white/20" />
                                </div>
                                <div className="p-5">
                                    <h3 className="text-lg font-black text-white">{m.nome}</h3>
                                    <p className="mt-1 text-sm text-white/55">{m.funcao}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-10">
                        <a
                            href={WHATSAPP_CTA_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex items-center gap-2 rounded-md bg-[#25D366] px-6 py-3.5 text-sm font-black shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#1ebe5d]"
                            style={{ color: '#ffffff' }}
                        >
                            <MessageCircle className="h-4 w-4" />
                            Fale com um assessor
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </a>
                    </div>
                </div>
            </section>

            {/* 6. COMO FUNCIONA */}
            <section className="bg-[#0A0A0A] py-20 sm:py-24">
                <div className="mx-auto max-w-7xl px-5 sm:px-8">
                    <div className="max-w-3xl">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#C8A96E]">
                            Como funciona
                        </span>
                        <h2 className="mt-3 text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
                            Começar no PO é mais simples do que parece.
                        </h2>
                    </div>

                    <div className="mt-12 grid gap-4 sm:grid-cols-3">
                        {PASSOS.map((p) => (
                            <div
                                key={p.n}
                                className="relative rounded-xl border border-white/10 bg-white/[0.03] p-7"
                            >
                                <span className="text-5xl font-black leading-none text-[#C8A96E]/30">{p.n}</span>
                                <h3 className="mt-4 text-xl font-black text-white">{p.titulo}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-white/60">{p.texto}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-10">
                        <a
                            href={WHATSAPP_CTA_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex items-center gap-2 rounded-md bg-[#25D366] px-6 py-3.5 text-sm font-black shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#1ebe5d]"
                            style={{ color: '#ffffff' }}
                        >
                            <MessageCircle className="h-4 w-4" />
                            Entrar no grupo de leilões
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </a>
                    </div>
                </div>
            </section>

            {/* 7. CTA FINAL */}
            <section className="relative overflow-hidden bg-black py-24 sm:py-28">
                <div
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-[#A68B4B]/12 blur-3xl"
                />
                <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
                    <h2 className="text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
                        Touros e matrizes dos melhores leilões, com quem entende do negócio.
                    </h2>
                    <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/68 sm:text-lg">
                        Entre no grupo e comece a comprar Nelore PO com assessoria de verdade ao seu lado.
                    </p>
                    <div className="mt-9 flex flex-wrap justify-center gap-3">
                        <a
                            href={WHATSAPP_CTA_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex items-center gap-2 rounded-md bg-[#25D366] px-7 py-4 text-sm font-black shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#1ebe5d]"
                            style={{ color: '#ffffff' }}
                        >
                            <MessageCircle className="h-4 w-4" />
                            Entrar no grupo
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </a>
                        <Link
                            href="/agenda"
                            className="inline-flex items-center gap-2 rounded-md border border-white/28 bg-white/8 px-7 py-4 text-sm font-black text-white transition-all hover:-translate-y-0.5 hover:bg-white/14"
                        >
                            <Calendar className="h-4 w-4" />
                            Ver agenda de leilões
                        </Link>
                    </div>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold uppercase tracking-wide text-white/40">
                        <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#C8A96E]" /> Curadoria de genética
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#C8A96E]" /> Estratégia de arremate
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#C8A96E]" /> Suporte em cada lance
                        </span>
                    </div>
                </div>
            </section>
        </>
    )
}
