import type { Metadata } from 'next'
import Link from 'next/link'
import { WHATSAPP_CTA_URL } from '../agenda/helpers'
import { HabilitacaoForm } from './HabilitacaoForm'

export const metadata: Metadata = {
    metadataBase: new URL('https://bulaassessoria.com'),
    title: 'Habilitação para Leilões | Bula Assessoria',
    description:
        'Habilite-se para comprar touros e matrizes em leilão com a assessoria gratuita da Bula. Cadastro analisado pelas leiloeiras parceiras — compra parcelada com acompanhamento do curral ao lance.',
    openGraph: {
        title: 'Habilite-se para comprar em leilão | Bula Assessoria',
        description:
            'Cadastro aprovado nas leiloeiras parceiras = crédito liberado para dar lance parcelado, com a Bula do seu lado. Sem custo para o produtor.',
        url: 'https://bulaassessoria.com/habilitacao',
        siteName: 'Bula Assessoria',
        images: [{ url: '/agenda-oficial-bula-whatsapp-v2.jpg', width: 1200, height: 1200, alt: 'Bula Assessoria Pecuária' }],
        type: 'website',
    },
}

const GOLD = '#C9A84C'
const OSWALD = "'Oswald', sans-serif"
const INTER = "'Inter', sans-serif"
const MONO = "'IBM Plex Mono', monospace"

const PASSOS = [
    { n: '01', titulo: 'Você preenche', texto: 'Dados e documentos nesta página — leva menos de 10 minutos e não custa nada.' },
    { n: '02', titulo: 'Leiloeiras analisam', texto: 'Encaminhamos seu cadastro às leiloeiras parceiras. Aprovado, seu crédito fica liberado para dar lance parcelado.' },
    { n: '03', titulo: 'A Bula te acompanha', texto: 'Um assessor assume seu acompanhamento: aparta os lotes certos e orienta até onde vale o lance — no leilão, do seu lado.' },
]

const FAQ = [
    {
        q: 'Quanto custa a assessoria da Bula?',
        a: 'Nada para o produtor. Nosso acordo comercial é com as leiloeiras — você compra direto com elas, nas condições do leilão, com a Bula orientando seu lance.',
    },
    {
        q: 'Por que precisam dos meus documentos?',
        a: 'A compra em leilão é parcelada (ex.: 30x no boleto) e é a leiloeira quem banca o parcelamento. O cadastro aprovado é o crédito dela liberado para você dar lance — os documentos servem para dimensionar esse crédito.',
    },
    {
        q: 'Quem vê meus dados?',
        a: 'Somente a equipe da Bula e as leiloeiras parceiras onde o seu cadastro for apresentado. Os arquivos ficam em ambiente seguro e não são usados para nenhuma outra finalidade.',
    },
    {
        q: 'Não tenho Inscrição Estadual. E agora?',
        a: 'Sem drama: dá para seguir com o NIRF, ou nossa equipe te orienta a emitir a I.E. — costuma ser rápido. Marque a opção no formulário e seguimos juntos.',
    },
]

export default function HabilitacaoPage() {
    return (
        <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#fff' }}>
            {/* ===== Header ===== */}
            <header style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '18px clamp(20px,5vw,48px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <Link href="/leiloes" aria-label="Bula Assessoria">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-bula-assessoria-white.png" alt="Bula Assessoria" style={{ height: '52px', width: 'auto', objectFit: 'contain' }} />
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
                        <Link href="/leiloes" style={{ fontFamily: INTER, fontSize: '11px', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>
                            Agenda de leilões
                        </Link>
                        <a href={WHATSAPP_CTA_URL} target="_blank" rel="noopener noreferrer"
                            style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: '12px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '10px 18px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            WhatsApp
                        </a>
                    </div>
                </div>
            </header>

            {/* ===== Hero ===== */}
            <section style={{ padding: 'clamp(48px,7vw,90px) clamp(20px,5vw,48px) clamp(36px,5vw,64px)' }}>
                <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                        <span style={{ width: '34px', height: '1px', background: GOLD }} />
                        <span style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: '12px', letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD }}>
                            Habilitação · Assessoria gratuita
                        </span>
                    </div>
                    <h1 style={{ fontFamily: OSWALD, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(34px,6.5vw,74px)', lineHeight: 0.94, letterSpacing: '-0.01em', margin: '0 0 24px', maxWidth: '18ch', textWrap: 'balance' }}>
                        Habilite-se para comprar em leilão
                    </h1>
                    <p style={{ fontFamily: INTER, fontSize: 'clamp(15px,1.6vw,18px)', lineHeight: 1.65, color: 'rgba(255,255,255,0.72)', maxWidth: '58ch', margin: '0 0 28px' }}>
                        Com o cadastro aprovado nas leiloeiras parceiras, você compra touros e matrizes
                        <strong style={{ color: '#fff' }}> parcelado no boleto</strong>, com a Bula do seu lado —
                        do curral ao lance certo. A assessoria não custa nada para o produtor.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {['Sem custo para o produtor', 'Dados protegidos', 'Retorno pelo WhatsApp'].map(chip => (
                            <span key={chip} style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: '11.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.18)', padding: '8px 14px' }}>
                                {chip}
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* ===== Como funciona ===== */}
            <section style={{ padding: '0 clamp(20px,5vw,48px) clamp(40px,5vw,64px)' }}>
                <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '1px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {PASSOS.map(p => (
                        <div key={p.n} style={{ background: '#0A0A0A', padding: 'clamp(20px,3vw,32px)' }}>
                            <span style={{ fontFamily: MONO, fontSize: '13px', color: GOLD }}>{p.n}</span>
                            <h3 style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: '17px', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '10px 0 10px' }}>{p.titulo}</h3>
                            <p style={{ fontFamily: INTER, fontSize: '13.5px', lineHeight: 1.65, color: 'rgba(255,255,255,0.6)', margin: 0 }}>{p.texto}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ===== Formulário ===== */}
            <section style={{ padding: '0 clamp(20px,5vw,48px) clamp(56px,7vw,90px)' }}>
                <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                    <div style={{ border: '1px solid rgba(255,255,255,0.12)', padding: 'clamp(22px,4vw,44px)', background: 'rgba(255,255,255,0.015)' }}>
                        <HabilitacaoForm />
                    </div>
                </div>
            </section>

            {/* ===== FAQ ===== */}
            <section style={{ padding: '0 clamp(20px,5vw,48px) clamp(56px,7vw,90px)' }}>
                <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                    <h2 style={{ fontFamily: OSWALD, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(22px,3vw,32px)', letterSpacing: '0.02em', margin: '0 0 22px' }}>
                        Perguntas frequentes
                    </h2>
                    {FAQ.map(item => (
                        <details key={item.q} style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '16px 0' }}>
                            <summary style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: '15px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', listStyle: 'none' }}>
                                {item.q}
                            </summary>
                            <p style={{ fontFamily: INTER, fontSize: '14px', lineHeight: 1.7, color: 'rgba(255,255,255,0.65)', margin: '12px 0 0', maxWidth: '62ch' }}>{item.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            {/* ===== Footer de confiança ===== */}
            <footer style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ maxWidth: '1080px', margin: '0 auto', padding: 'clamp(28px,4vw,44px) clamp(20px,5vw,48px)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '18px' }}>
                    <div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-bula-assessoria-white.png" alt="Bula Assessoria" style={{ height: '44px', width: 'auto', objectFit: 'contain', marginBottom: '10px' }} />
                        <p style={{ fontFamily: INTER, fontSize: '12px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
                            © {new Date().getFullYear()} Bula Assessoria Pecuária · bulaassessoria.com ·{' '}
                            <a href="https://www.instagram.com/bulaassessoria/" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.6)' }}>@bulaassessoria</a>
                        </p>
                    </div>
                    <a href={WHATSAPP_CTA_URL} target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: '13px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#0A0A0A', background: '#fff', padding: '14px 26px', textDecoration: 'none' }}>
                        Falar com a equipe
                    </a>
                </div>
            </footer>
        </div>
    )
}
