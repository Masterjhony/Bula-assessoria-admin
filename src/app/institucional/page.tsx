import Link from 'next/link'
import {
    ArrowRight,
    BadgeCheck,
    BookOpenCheck,
    Calendar,
    CheckCircle2,
    CircleDollarSign,
    ClipboardCheck,
    Dna,
    Eye,
    Gavel,
    Handshake,
    MessageCircle,
    PhoneCall,
    Radar,
    Route,
    ShieldCheck,
    Sparkles,
    Target,
} from 'lucide-react'
import { WHATSAPP_CTA_URL } from '../agenda/helpers'

const HERO_IMAGE = '/institucional/camparino-ford-fiv.webp'
const SELECTION_IMAGE = '/institucional/terra-brava-universo.jpg'

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
        titulo: 'Genética sem leitura',
        texto: 'EPDs, DEPs, CEIP e índices viram uma tela cheia de números sem contexto.',
        pergunta: 'Esse lote melhora o meu rebanho ou só impressiona no catálogo?',
    },
    {
        icon: CircleDollarSign,
        titulo: 'Preço sem referência',
        texto: 'No calor do arremate, o iniciante confunde oportunidade com emoção.',
        pergunta: 'Até onde esse animal vale ir, antes de virar prejuízo?',
    },
    {
        icon: Eye,
        titulo: 'Bastidor invisível',
        texto: 'Apartação, condição comercial e reputação do criatório pesam no resultado.',
        pergunta: 'Quem está comigo quando o lance sobe e a decisão aperta?',
    },
]

const SOLUCOES = [
    {
        icon: BookOpenCheck,
        etapa: 'Antes',
        titulo: 'Curadoria de genética',
        texto: 'Lemos EPDs, DEPs e CEIP por você. Selecionamos animais que fazem sentido para o seu objetivo, não só os que aparecem em destaque no catálogo.',
    },
    {
        icon: Target,
        etapa: 'Durante',
        titulo: 'Estratégia de arremate',
        texto: 'Definimos quanto cada lote vale e até onde ir. Você entra no leilão com plano, teto de compra e clareza do que realmente resolve o rebanho.',
    },
    {
        icon: Handshake,
        etapa: 'Depois',
        titulo: 'Operacional completo',
        texto: 'Negociamos condições, organizamos apartação e acompanhamos o pós-arremate. A decisão é sua, mas o processo não fica solto.',
    },
    {
        icon: Gavel,
        etapa: 'Acesso',
        titulo: 'Leilões de referência',
        texto: 'A Bula atua nos principais leilões e criatórios do Brasil. Você compra no ambiente da elite do Nelore PO com assessoria ao lado.',
    },
]

const EQUIPE = [
    {
        nome: 'Assessoria Comercial',
        funcao: 'Estratégia de lance, referência de preço e negociação.',
        iniciais: 'CO',
    },
    {
        nome: 'Assessoria Técnica',
        funcao: 'Genética, avaliação de lote, DEP, EPD e objetivo de rebanho.',
        iniciais: 'TE',
    },
    {
        nome: 'Relacionamento e Pós-venda',
        funcao: 'Apartação, condição comercial e acompanhamento depois do arremate.',
        iniciais: 'PV',
    },
]

const PASSOS = [
    {
        n: '01',
        icon: MessageCircle,
        titulo: 'Entre no grupo',
        texto: 'Você recebe oportunidades selecionadas e fala direto com os assessores.',
    },
    {
        n: '02',
        icon: ClipboardCheck,
        titulo: 'A gente seleciona com você',
        texto: 'Indicamos animais alinhados ao seu objetivo e montamos a estratégia do leilão.',
    },
    {
        n: '03',
        icon: BadgeCheck,
        titulo: 'Arremate com segurança',
        texto: 'A Bula acompanha lance, apartação e condição comercial até a compra fechar.',
    },
]

const HERO_METRICS = [
    ['Lote', 'pré-selecionado'],
    ['Genética', 'DEP · EPD · CEIP'],
    ['Lance', 'teto de compra'],
]

export default function InstitucionalPage() {
    return (
        <>
            <section className="relative min-h-[calc(100svh-80px)] overflow-hidden bg-[#12100c] text-white sm:min-h-[calc(100svh-88px)]">
                <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-[linear-gradient(110deg,#12100c_0%,#17130d_48%,#241b10_100%)]" />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,16,12,0.1)_0%,rgba(18,16,12,0.04)_48%,#12100c_100%)]" />
                    <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(214,179,106,.34)_1px,transparent_1px),linear-gradient(90deg,rgba(214,179,106,.20)_1px,transparent_1px)] [background-size:72px_72px]" />
                </div>

                <div className="relative mx-auto grid min-h-[calc(100svh-80px)] max-w-7xl gap-10 px-5 py-10 sm:min-h-[calc(100svh-88px)] sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:py-14">
                    <div className="max-w-3xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-assessoria-white.png"
                            alt="Bula Assessoria"
                            className="h-16 w-auto sm:h-20 lg:h-20 xl:h-24"
                        />
                        <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-[#d6b36a]/32 bg-[#d6b36a]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#e6c77c] backdrop-blur">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Entrada assistida no PO
                        </div>
                        <h1 className="mt-5 text-5xl font-black leading-[0.94] tracking-tight text-white sm:text-6xl lg:text-6xl xl:text-7xl 2xl:text-8xl">
                            Do gado comercial ao Nelore PO.
                            <span className="block text-[#C8A96E]">Sem entrar sozinho.</span>
                        </h1>
                        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/74 sm:text-xl">
                            A Bula assessora você na compra de touros e matrizes nos principais leilões do Brasil:
                            escolha de genética, apartação e estratégia comercial ao seu lado em cada lance.
                        </p>

                        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                            <PrimaryWhatsAppCta label="Entrar no grupo de leilões" />
                            <Link
                                href="/agenda"
                                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d6b36a]/26 bg-[#201b13]/70 px-6 py-3.5 text-sm font-black text-white shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-[#d6b36a]/50 hover:bg-[#2a2318]"
                            >
                                <Calendar className="h-4 w-4" />
                                Ver agenda de leilões
                            </Link>
                        </div>
                    </div>

                    <div>
                        <div className="ml-auto max-w-[720px] border border-[#d6b36a]/22 bg-[#17130d]/82 p-3 shadow-[0_30px_90px_-50px_rgba(0,0,0,0.9)] backdrop-blur-md sm:p-4">
                            <figure className="bg-[#e8dfcf] p-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={HERO_IMAGE}
                                    alt="Touro Nelore PO Ford FIV Camparino"
                                    className="h-auto w-full object-contain"
                                />
                            </figure>
                            <div className="mt-4 flex items-center justify-between gap-4 border-b border-[#d6b36a]/18 pb-5">
                                <div>
                                    <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#d6b36a]">
                                        Mesa de compra
                                    </div>
                                    <p className="mt-2 text-sm font-semibold text-white/58">
                                        Decisão antes da batida do martelo.
                                    </p>
                                </div>
                                <span className="rounded-md border border-white/12 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/52">
                                    PO
                                </span>
                            </div>
                            <div className="mt-5 grid gap-3">
                                {HERO_METRICS.map(([title, label], index) => (
                                    <div
                                        key={title}
                                        className="group grid grid-cols-[3rem_1fr_auto] items-center gap-4 border-b border-white/10 py-4 last:border-b-0"
                                    >
                                        <span className="text-3xl font-black text-[#d6b36a]/70">
                                            {String(index + 1).padStart(2, '0')}
                                        </span>
                                        <div>
                                            <p className="text-xl font-black leading-none text-white">{title}</p>
                                            <p className="mt-1 text-sm font-semibold text-white/48">{label}</p>
                                        </div>
                                        <CheckCircle2 className="h-5 w-5 text-white/32 transition-colors group-hover:text-[#d6b36a]" />
                                    </div>
                                ))}
                            </div>
                            <p className="mt-6 text-sm leading-relaxed text-white/62">
                                O objetivo não é “dar lance”. É saber quando entrar, quando parar e qual animal
                                realmente leva seu rebanho para o próximo nível.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="border-y border-[#d6b36a]/16 bg-[#1b170f] text-white">
                <div className="mx-auto grid max-w-7xl gap-6 px-5 py-7 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#C8A96E]">
                            Compra assistida
                        </p>
                        <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight sm:text-3xl">
                            O primeiro leilão de elite não precisa parecer um salto no escuro.
                        </h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <SignalItem icon={Radar} label="Radar de oportunidades" />
                        <SignalItem icon={Route} label="Plano antes do lance" />
                        <SignalItem icon={PhoneCall} label="Assessor ao seu lado" />
                    </div>
                </div>
            </section>

            <section className="bg-[#12100c] py-20 text-white sm:py-24">
                <div className="mx-auto max-w-7xl px-5 sm:px-8">
                    <div className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
                        <div>
                            <SectionKicker>Mapa de risco</SectionKicker>
                            <h2 className="mt-3 text-3xl font-black leading-[1.05] tracking-tight sm:text-5xl">
                                Entrar no PO sem assessoria é arriscar capital no escuro.
                            </h2>
                            <div className="mt-6 space-y-5 text-base leading-relaxed text-white/66 sm:text-lg">
                                <p>
                                    Você já cria gado. Conhece o campo, entende de boi. Mas o Nelore PO é outro jogo:
                                    lê-se genética, não só a estampa do animal. Um lance errado custa caro.
                                </p>
                                <p>
                                    A pergunta certa não é <span className="font-semibold text-white">“esse animal é bonito?”</span>.
                                    É <span className="font-semibold text-white">“esse animal vale o que estão pedindo e resolve o que meu rebanho precisa?”</span>.
                                </p>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-md border border-[#d6b36a]/18 bg-[#17130d] p-3">
                            <div className="bg-[#e8dfcf] p-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={SELECTION_IMAGE}
                                    alt="Touro Nelore PO Universo Terra Brava"
                                    className="h-auto w-full object-contain"
                                    loading="lazy"
                                />
                            </div>
                            <div className="border-t border-[#d6b36a]/18 px-4 py-5 sm:px-5">
                                <p className="max-w-md text-2xl font-black leading-tight sm:text-3xl">
                                    Animal de elite não se decide no impulso. A régua precisa estar pronta antes.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 grid gap-4 lg:grid-cols-3">
                        {DORES.map((dor) => (
                            <article key={dor.titulo} className="group border-t border-[#d6b36a]/22 bg-[#17130d]/38 p-5 pt-6">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#d6b36a]/22 bg-[#d6b36a]/8 text-[#d6b36a]">
                                        <dor.icon className="h-5 w-5" />
                                    </div>
                                    <h3 className="text-xl font-black text-white">{dor.titulo}</h3>
                                </div>
                                <p className="mt-4 text-sm leading-relaxed text-white/58">{dor.texto}</p>
                                <p className="mt-5 border-l border-[#d6b36a]/45 pl-4 text-sm font-semibold leading-relaxed text-white/78">
                                    {dor.pergunta}
                                </p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section id="metodo" className="bg-[#17130d] py-20 text-white sm:py-28">
                <div className="mx-auto max-w-7xl px-5 sm:px-8">
                    <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
                        <div className="lg:sticky lg:top-32">
                            <SectionKicker>Método Bula</SectionKicker>
                            <h2 className="mt-3 text-3xl font-black leading-[1.05] tracking-tight sm:text-5xl">
                                A Bula te leva para dentro do PO com segurança.
                            </h2>
                            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/66 sm:text-lg">
                                Não vendemos um animal. Construímos sua entrada no Nelore PO com método: leitura técnica,
                                estratégia comercial e acompanhamento humano.
                            </p>
                            <div className="mt-8 overflow-hidden rounded-md border border-[#d6b36a]/18 bg-[#12100c] p-3">
                                <div className="bg-[#e8dfcf] p-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={HERO_IMAGE}
                                        alt="Touro Nelore PO Ford FIV Camparino"
                                        className="h-auto w-full object-contain"
                                        loading="lazy"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="relative">
                            <div className="absolute left-5 top-0 hidden h-full w-px bg-gradient-to-b from-[#d6b36a] via-white/14 to-transparent sm:block" />
                            <div className="space-y-5">
                                {SOLUCOES.map((solucao) => (
                                    <article
                                        key={solucao.titulo}
                                        className="relative rounded-md border border-[#d6b36a]/14 bg-[#211b12] p-6 transition-colors hover:border-[#d6b36a]/40 sm:ml-14 sm:p-7"
                                    >
                                        <div className="absolute -left-[4.55rem] top-7 hidden h-10 w-10 items-center justify-center rounded-md border border-[#d6b36a]/40 bg-[#12100c] text-[#d6b36a] sm:flex">
                                            <solucao.icon className="h-5 w-5" />
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <span className="rounded-md border border-[#d6b36a]/28 bg-[#d6b36a]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#d6b36a]">
                                                {solucao.etapa}
                                            </span>
                                            <h3 className="text-2xl font-black leading-tight text-white">{solucao.titulo}</h3>
                                        </div>
                                        <p className="mt-4 text-sm leading-relaxed text-white/62 sm:text-[15px]">
                                            {solucao.texto}
                                        </p>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="overflow-hidden border-y border-[#d6b36a]/16 bg-[#12100c] py-20 text-white sm:py-24">
                <div className="mx-auto max-w-7xl px-5 sm:px-8">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl">
                        <SectionKicker>Ambiente de compra</SectionKicker>
                            <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight sm:text-5xl">
                                A elite do Nelore PO confia na Bula.
                            </h2>
                            <p className="mt-4 text-base leading-relaxed text-white/60">
                                Operamos nos leilões dos criatórios e selecionadores de referência do país.
                            </p>
                        </div>
                        <Link
                            href="/agenda"
                            className="inline-flex w-fit items-center gap-2 rounded-md border border-[#d6b36a]/26 bg-[#1b170f] px-5 py-3 text-sm font-black text-white/82 transition-all hover:-translate-y-0.5 hover:border-[#d6b36a]/45 hover:text-white"
                        >
                            Ver agenda de leilões
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>

                    <div className="relative mt-10 border-y border-white/10 py-6">
                        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#12100c] to-transparent" />
                        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#12100c] to-transparent" />
                        <div className="bula-logo-marquee flex w-max gap-4">
                            {[...PARCEIROS, ...PARCEIROS].map((parceiro, index) => (
                                <div
                                    key={`${parceiro.nome}-${index}`}
                                    className="flex h-24 w-52 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white px-5"
                                    aria-label={parceiro.nome}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={parceiro.src}
                                        alt={parceiro.nome}
                                        loading="lazy"
                                        className="max-h-16 w-auto max-w-full object-contain"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="mt-8 max-w-3xl text-lg font-semibold leading-relaxed text-white/76">
                        Quando você compra com a Bula, está no mesmo ambiente onde os maiores criatórios do Brasil negociam.
                        A diferença é que agora você tem quem te oriente.
                    </p>
                </div>
            </section>

            <section id="equipe" className="bg-[#17130d] py-20 text-white sm:py-28">
                <div className="mx-auto max-w-7xl px-5 sm:px-8">
                    <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
                        <div>
                            <SectionKicker>A equipe</SectionKicker>
                            <h2 className="mt-3 text-3xl font-black leading-[1.05] tracking-tight sm:text-5xl">
                                Gente de verdade do seu lado, não um aplicativo.
                            </h2>
                            <p className="mt-5 text-base leading-relaxed text-white/66 sm:text-lg">
                                A Bula é um time de assessores que vive de leilão. Estamos no campo, nas pistas
                                e no telefone com você antes, durante e depois do arremate.
                            </p>
                            <div className="mt-8">
                                <PrimaryWhatsAppCta label="Fale com um assessor" />
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                            {EQUIPE.map((membro) => (
                                <article
                                    key={membro.nome}
                                    className="grid gap-4 rounded-md border border-[#d6b36a]/14 bg-[#12100c] p-5 sm:grid-rows-[auto_1fr] lg:grid-cols-[5rem_1fr] lg:grid-rows-1 lg:items-center"
                                >
                                    <div className="flex h-20 w-20 items-center justify-center rounded-md border border-[#d6b36a]/28 bg-[#d6b36a]/10 text-xl font-black tracking-tight text-[#d6b36a]">
                                        {membro.iniciais}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black leading-tight text-white">{membro.nome}</h3>
                                        <p className="mt-2 text-sm leading-relaxed text-white/58">{membro.funcao}</p>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-[#12100c] py-20 text-white sm:py-24">
                <div className="mx-auto max-w-7xl px-5 sm:px-8">
                    <div className="max-w-3xl">
                        <SectionKicker>Como funciona</SectionKicker>
                        <h2 className="mt-3 text-3xl font-black leading-[1.05] tracking-tight sm:text-5xl">
                            Começar no PO é mais simples do que parece.
                        </h2>
                    </div>

                    <div className="mt-12 grid gap-4 lg:grid-cols-3">
                        {PASSOS.map((passo) => (
                            <article
                                key={passo.n}
                                className="relative min-h-72 overflow-hidden rounded-md border border-[#d6b36a]/14 bg-[#1b170f] p-7"
                            >
                                <span className="absolute right-5 top-4 text-7xl font-black leading-none text-white/[0.045]">
                                    {passo.n}
                                </span>
                                <div className="relative flex h-12 w-12 items-center justify-center rounded-md bg-[#d6b36a] text-[#151008]">
                                    <passo.icon className="h-6 w-6" />
                                </div>
                                <h3 className="relative mt-8 text-2xl font-black leading-tight text-white">{passo.titulo}</h3>
                                <p className="relative mt-3 text-sm leading-relaxed text-white/60">{passo.texto}</p>
                            </article>
                        ))}
                    </div>

                    <div className="mt-10">
                        <PrimaryWhatsAppCta label="Entrar no grupo de leilões" />
                    </div>
                </div>
            </section>

            <section className="relative overflow-hidden bg-[#12100c] py-24 text-white sm:py-32">
                <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-[linear-gradient(110deg,#12100c_0%,#17130d_52%,#261d12_100%)]" />
                    <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(214,179,106,.28)_1px,transparent_1px),linear-gradient(90deg,rgba(214,179,106,.18)_1px,transparent_1px)] [background-size:72px_72px]" />
                </div>

                <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
                    <div className="max-w-3xl">
                        <SectionKicker>Próximo passo</SectionKicker>
                        <h2 className="mt-3 text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
                            Touros e matrizes dos melhores leilões, com quem entende do negócio.
                        </h2>
                        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
                            Entre no grupo e comece a comprar Nelore PO com assessoria de verdade ao seu lado.
                        </p>
                        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                            <PrimaryWhatsAppCta label="Entrar no grupo" />
                            <Link
                                href="/agenda"
                                className="inline-flex items-center justify-center gap-2 rounded-md border border-white/28 bg-white/8 px-7 py-4 text-sm font-black text-white transition-all hover:-translate-y-0.5 hover:bg-white/14"
                            >
                                <Calendar className="h-4 w-4" />
                                Ver agenda de leilões
                            </Link>
                        </div>
                        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold uppercase tracking-wide text-white/46">
                            <ProofCheck label="Curadoria de genética" />
                            <ProofCheck label="Estratégia de arremate" />
                            <ProofCheck label="Suporte em cada lance" />
                        </div>
                    </div>
                </div>
            </section>
        </>
    )
}

function SectionKicker({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#d6b36a]">
            <Sparkles className="h-3.5 w-3.5" />
            {children}
        </span>
    )
}

function PrimaryWhatsAppCta({ label }: { label: string }) {
    return (
        <a
            href={WHATSAPP_CTA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 rounded-md border border-[#d6b36a]/45 bg-[#d6b36a] px-6 py-3.5 text-sm font-black text-[#151008] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#e7c77e] sm:px-7 sm:py-4"
        >
            <MessageCircle className="h-4 w-4" />
            {label}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </a>
    )
}

function SignalItem({ icon: Icon, label }: { icon: typeof Radar; label: string }) {
    return (
        <div className="flex items-center gap-3 rounded-md border border-[#d6b36a]/16 bg-[#12100c]/72 px-4 py-3">
            <Icon className="h-4 w-4 shrink-0 text-[#d6b36a]" />
            <span className="text-sm font-black leading-tight text-white/82">{label}</span>
        </div>
    )
}

function ProofCheck({ label }: { label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#d6b36a]" />
            {label}
        </span>
    )
}
