import Link from 'next/link'
import { getLeiloesPublicos, type LeilaoPublico } from '@/lib/bula/public-leiloes'
import { AgendaGrid } from './AgendaGrid'
import { HeroVideo } from './HeroVideo'
import { parseData, isFuturo, WHATSAPP_CTA_URL } from './helpers'

export const revalidate = 120

const HERO_VIDEO =
    'https://res.cloudinary.com/dny0ibgbn/video/upload/v1780252444/video_de_fundo_jmvezn.mp4'

const GOLD = '#C9A84C'
const OSWALD = "'Oswald', sans-serif"
const INTER = "'Inter', sans-serif"
const SCRIPT = "'Pinyon Script', cursive"
const MONO = "'IBM Plex Mono', monospace"

export default async function AgendaPage() {
    const leiloes = await getLeiloesPublicos()

    // Mesma lógica/ordem de sempre — os leilões e a ordem não mudam.
    const proximos = leiloes
        .filter((l) => isFuturo(l.data) && l.status === 'confirmado')
        .sort((a, b) => parseData(a.data).time - parseData(b.data).time)
    const destaque = proximos[0] ?? leiloes[0] ?? null
    const agendaLabel = labelPeriodo(leiloes)

    // Dados do leilão em destaque para o hero (mapeados dos campos reais).
    const dp = destaque ? parseData(destaque.data) : null
    const dateLabel = dp
        ? `${String(dp.dia).padStart(2, '0')}.${String(dp.mesNum).padStart(2, '0')}.${dp.ano}`
        : ''
    const modalidade = (destaque?.modelo || destaque?.local || '').trim()
    const isAoVivo = destaque
        ? (!!destaque.transmissao?.trim() || /virtual|online|ao vivo|live/i.test(modalidade))
        : false
    // Só a modalidade real (VIRTUAL/PRESENCIAL/local) no hero — a leiloeira/criador
    // já aparecem nos cards; evita jogar valor genérico (ex.: "PROGRAMA LEILÕES") aqui.
    const placeLabel = modalidade
    const heroSub = destaque
        ? (destaque.animais && destaque.animais > 0
            ? `${destaque.animais} animais na oferta — curadoria de genética, avaliação de lote e apoio no arremate.`
            : 'Curadoria de genética, avaliação de lote e apoio no arremate.')
        : 'Touros e matrizes dos principais leilões do Brasil, com curadoria de genética e apoio no arremate.'

    return (
        <>
            {/* ===== HERO ===== */}
            <section
                id="top"
                style={{ position: 'relative', minHeight: '100svh', display: 'flex', alignItems: 'flex-end', overflow: 'hidden', background: '#0A0A0A' }}
            >
                <HeroVideo src={HERO_VIDEO} />
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,10,10,0.55)' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(10,10,10,0.55) 0%,rgba(10,10,10,0.12) 36%,rgba(10,10,10,0.5) 66%,rgba(10,10,10,0.96) 100%)' }} />

                <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '1280px', margin: '0 auto', padding: 'clamp(28px,5vw,64px) clamp(20px,5vw,64px) clamp(40px,6vw,80px)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '22px' }}>
                        <span style={{ width: '34px', height: '1px', background: GOLD }} />
                        <span style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: '12px', letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD }}>
                            {destaque ? 'Próximo Leilão · Em Destaque' : `Agenda · ${agendaLabel}`}
                        </span>
                    </div>
                    <h1 style={{ fontFamily: OSWALD, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(38px,9vw,116px)', lineHeight: 0.9, letterSpacing: '-0.01em', margin: '0 0 26px', maxWidth: '16ch', textWrap: 'balance' }}>
                        {destaque ? destaque.nome : 'Agenda Bula Assessoria'}
                    </h1>
                    {destaque && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px,2.4vw,26px)', flexWrap: 'wrap', marginBottom: '22px' }}>
                            <span style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: 'clamp(15px,1.6vw,19px)', letterSpacing: '0.1em' }}>{dp?.diaSemana} · {dateLabel}</span>
                            {destaque.horario?.trim() && (<><Dot /><span style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: 'clamp(15px,1.6vw,19px)', letterSpacing: '0.1em' }}>{destaque.horario}</span></>)}
                            {placeLabel && (<><Dot /><span style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: 'clamp(15px,1.6vw,19px)', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.85)' }}>{placeLabel}</span></>)}
                            {isAoVivo && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: OSWALD, fontWeight: 600, fontSize: '12px', letterSpacing: '0.18em', color: GOLD, border: '1px solid rgba(201,168,76,0.4)', padding: '6px 12px' }}>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: GOLD }} />AO VIVO
                                </span>
                            )}
                        </div>
                    )}
                    <p style={{ fontFamily: INTER, fontSize: 'clamp(15px,1.5vw,18px)', lineHeight: 1.55, color: 'rgba(255,255,255,0.72)', maxWidth: '52ch', margin: '0 0 34px' }}>{heroSub}</p>
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                        <a href={WHATSAPP_CTA_URL} target="_blank" rel="noopener noreferrer" className="agenda-btn-white" style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: '14px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#0A0A0A', background: '#fff', textDecoration: 'none', padding: '16px 30px' }}>Falar no WhatsApp</a>
                        {destaque && <Link href={`/leiloes/${destaque.id}`} className="agenda-btn-outline" style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: '14px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff', textDecoration: 'none', padding: '16px 30px', border: '1px solid rgba(255,255,255,0.35)' }}>Ver Detalhes →</Link>}
                    </div>
                </div>
            </section>

            {/* ===== AGENDA ===== */}
            <section id="agenda" style={{ padding: 'clamp(56px,8vw,110px) clamp(20px,5vw,64px)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '30px', flexWrap: 'wrap', marginBottom: 'clamp(28px,4vw,44px)' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                                <span style={{ width: '34px', height: '1px', background: GOLD }} />
                                <span style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: '12px', letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD }}>Agenda · {agendaLabel}</span>
                            </div>
                            <h2 style={{ fontFamily: OSWALD, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(36px,6vw,72px)', lineHeight: 0.92, letterSpacing: '-0.01em', margin: 0 }}>Agenda de Leilões</h2>
                        </div>
                        <div style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: '14px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', paddingBottom: '8px' }}>
                            {String(leiloes.length).padStart(2, '0')} {leiloes.length === 1 ? 'evento na agenda' : 'eventos na agenda'}
                        </div>
                    </div>
                    <AgendaGrid leiloes={leiloes} />
                </div>
            </section>

            <Sobre />
            <Habilitese />
            <Contato />
        </>
    )
}

function Dot() {
    return <span style={{ width: '5px', height: '5px', background: 'rgba(255,255,255,0.4)', borderRadius: '50%' }} />
}

function Sobre() {
    const services = [
        { n: '01', label: 'Seleção de Lotes' },
        { n: '02', label: 'Avaliação Genética' },
        { n: '03', label: 'Lance Assistido' },
        { n: '04', label: 'Estratégia Comercial' },
    ]
    return (
        <section id="sobre" style={{ padding: 'clamp(56px,8vw,120px) clamp(20px,5vw,64px)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 'clamp(36px,6vw,90px)', alignItems: 'start' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '22px' }}>
                        <span style={{ width: '34px', height: '1px', background: GOLD }} />
                        <span style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: '12px', letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD }}>A Assessoria</span>
                    </div>
                    <h2 style={{ fontFamily: OSWALD, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(30px,4.4vw,58px)', lineHeight: 0.98, letterSpacing: '-0.01em', margin: '0 0 30px' }}>Do curral ao<br />lance certo.</h2>
                    <p style={{ fontFamily: SCRIPT, fontSize: 'clamp(30px,4vw,46px)', lineHeight: 1, color: GOLD, margin: 0 }}>A assessoria do boiadeiro(a).</p>
                </div>
                <div>
                    <p style={{ fontFamily: INTER, fontSize: 'clamp(15px,1.5vw,17px)', lineHeight: 1.7, color: 'rgba(255,255,255,0.72)', margin: '0 0 22px' }}>
                        Acompanhamento completo na compra de touros e matrizes Nelore PO em leilões.
                        Selecionamos os melhores lotes, avaliamos genética e fenótipo e conduzimos o
                        lance ao seu lado — presencial ou virtual.
                    </p>
                    <p style={{ fontFamily: INTER, fontSize: 'clamp(15px,1.5vw,17px)', lineHeight: 1.7, color: 'rgba(255,255,255,0.72)', margin: '0 0 36px' }}>
                        Da análise ao martelo, você compra com segurança e critério de
                        quem entende de curral.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {services.map((s) => (
                            <div key={s.n} style={{ display: 'flex', alignItems: 'baseline', gap: '18px', padding: '16px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                <span style={{ fontFamily: MONO, fontSize: '12px', color: GOLD }}>{s.n}</span>
                                <span style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: 'clamp(15px,1.7vw,19px)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{s.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

function Habilitese() {
    const passos = [
        { n: '01', label: 'Cadastro em menos de 10 minutos' },
        { n: '02', label: 'Leiloeiras parceiras analisam' },
        { n: '03', label: 'Aprovado: lance parcelado liberado' },
    ]
    return (
        <section id="habilite-se" style={{ padding: 'clamp(56px,8vw,120px) clamp(20px,5vw,64px)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 'clamp(36px,6vw,90px)', alignItems: 'center' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '22px' }}>
                        <span style={{ width: '34px', height: '1px', background: GOLD }} />
                        <span style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: '12px', letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD }}>Assessoria gratuita</span>
                    </div>
                    <h2 style={{ fontFamily: OSWALD, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(30px,4.4vw,58px)', lineHeight: 0.98, letterSpacing: '-0.01em', margin: '0 0 22px' }}>
                        Habilite-se para<br />o próximo lance.
                    </h2>
                    <p style={{ fontFamily: INTER, fontSize: 'clamp(15px,1.5vw,17px)', lineHeight: 1.7, color: 'rgba(255,255,255,0.72)', margin: '0 0 30px', maxWidth: '48ch' }}>
                        Com o cadastro aprovado nas leiloeiras parceiras, você compra parcelado no boleto
                        com a Bula do seu lado — sem custo nenhum para o produtor. Deixe sua habilitação
                        pronta antes do leilão e não perca o lote certo.
                    </p>
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                        <Link href="/habilitacao" className="agenda-btn-white" style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: '14px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#0A0A0A', background: '#fff', textDecoration: 'none', padding: '16px 30px' }}>
                            Iniciar habilitação →
                        </Link>
                        <a href={WHATSAPP_CTA_URL} target="_blank" rel="noopener noreferrer" className="agenda-btn-outline" style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: '14px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff', textDecoration: 'none', padding: '16px 30px', border: '1px solid rgba(255,255,255,0.35)' }}>
                            Prefiro pelo WhatsApp
                        </a>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {passos.map((p) => (
                        <div key={p.n} style={{ display: 'flex', alignItems: 'baseline', gap: '18px', padding: '18px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <span style={{ fontFamily: MONO, fontSize: '12px', color: GOLD }}>{p.n}</span>
                            <span style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: 'clamp(15px,1.7vw,19px)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{p.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

function Contato() {
    return (
        <section id="contato" style={{ padding: 'clamp(56px,8vw,110px) clamp(20px,5vw,64px)', borderTop: '1px solid rgba(201,168,76,0.35)' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '28px' }}>
                <span style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: '12px', letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD }}>Vamos negociar?</span>
                <h2 style={{ fontFamily: OSWALD, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(38px,7vw,84px)', lineHeight: 0.9, letterSpacing: '-0.01em', margin: 0, maxWidth: '18ch', textWrap: 'balance' }}>
                    Fale com a Bula antes do próximo lance
                </h2>
                <a href={WHATSAPP_CTA_URL} target="_blank" rel="noopener noreferrer" className="agenda-btn-white" style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: '15px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#0A0A0A', background: '#fff', textDecoration: 'none', padding: '18px 40px', marginTop: '6px' }}>
                    Chamar no WhatsApp
                </a>
            </div>
        </section>
    )
}

function labelPeriodo(leiloes: LeilaoPublico[]) {
    if (leiloes.length === 0) return 'atual'
    const parts = leiloes.map((l) => parseData(l.data))
    const first = parts[0]
    const last = parts[parts.length - 1]
    if (first.ano === last.ano && first.mesNum === last.mesNum) {
        return `${first.mesNome} ${first.ano}`
    }
    if (first.ano === last.ano) {
        return `${first.mesNome} e ${last.mesNome} ${first.ano}`
    }
    return `${first.mesNome} ${first.ano} a ${last.mesNome} ${last.ano}`
}
