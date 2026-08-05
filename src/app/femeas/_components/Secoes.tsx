// ─────────────────────────────────────────────────────────────────────────
// Seções da landing de fêmeas — VERSÃO DE LEITURA DE COPY.
//
// O objetivo deste arquivo, hoje, é UM: o João Antônio abrir /femeas e ler o
// texto no lugar, com hierarquia, em vez de ler um arquivo .ts. Toda a copy vem
// de _lib/copy.ts (INV-5) e as categorias de _lib/categorias.ts — corrigir lá
// corrige aqui.
//
// O que ISTO NÃO É: o design final. A Fase 7 refaz o tratamento visual (foto de
// hero, ensaio, reveal no scroll, sticky CTA) seguindo o padrão editorial de
// /touros. O que está aqui é tipografia honesta sobre o near-black da marca —
// suficiente para julgar TEXTO, não para julgar página.
//
// O formulário ainda não existe: ele é a Fase 6 e depende do contrato da API
// (Fase 5) e da lista final de campos, que é decisão do cliente. Os CTAs abaixo
// apontam para #cadastro, que ainda não existe — é intencional, e a Fase 6
// fecha o laço.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { dark, typo } from '../_lib/tokens'
import { categorias } from '../_lib/categorias'
import { hero, paraQuem, categoriasSecao, jornada, assessoria, fecho } from '../_lib/copy'

const wrap = { maxWidth: 940, margin: '0 auto' } as const
const pad = 'clamp(48px, 9vw, 96px) clamp(20px, 5vw, 40px)'

const botao = {
  display: 'inline-block',
  background: dark.gold,
  color: '#0D0D0D',
  padding: '15px 26px',
  fontWeight: 600,
  textDecoration: 'none',
  borderRadius: 2,
} as const

const notaCta = {
  ...typo.monoLabel,
  color: dark.faint,
  marginTop: 14,
  letterSpacing: '0.06em',
  textTransform: 'none' as const,
}

function Secao({ id, children, surface = dark.bg }: { id: string; children: ReactNode; surface?: string }) {
  return (
    <section
      id={id}
      style={{
        background: surface,
        color: dark.body,
        borderBottom: `1px solid ${dark.hairline}`,
        padding: pad,
      }}
    >
      <div style={wrap}>{children}</div>
    </section>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div style={{ ...typo.eyebrow, color: dark.gold }}>{children}</div>
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        color: dark.text,
        fontSize: 'clamp(26px, 4.6vw, 40px)',
        lineHeight: 1.15,
        letterSpacing: '-0.02em',
        margin: '14px 0',
        fontWeight: 600,
      }}
    >
      {children}
    </h2>
  )
}

function Lead({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 'clamp(15px, 1.9vw, 18px)', lineHeight: 1.6, maxWidth: '62ch', margin: '0 0 8px' }}>
      {children}
    </p>
  )
}

export function Hero() {
  return (
    <Secao id="topo">
      <Eyebrow>{hero.eyebrow}</Eyebrow>
      <h1
        style={{
          color: dark.text,
          fontSize: 'clamp(34px, 7vw, 68px)',
          lineHeight: 1.05,
          letterSpacing: '-0.03em',
          margin: '18px 0 20px',
          fontWeight: 600,
        }}
      >
        {hero.title}
      </h1>
      <Lead>{hero.lead}</Lead>

      <div style={{ display: 'flex', gap: 'clamp(20px, 5vw, 56px)', flexWrap: 'wrap', margin: '32px 0' }}>
        {hero.stats.map((s) => (
          <div key={s.label}>
            <div
              style={{
                color: dark.gold,
                fontSize: 'clamp(24px, 3.4vw, 34px)',
                fontWeight: 600,
                letterSpacing: '-0.02em',
              }}
            >
              {s.value}
            </div>
            <div style={{ ...typo.monoLabel, color: dark.faint, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <a href="#cadastro" style={botao}>
        {hero.cta}
      </a>
      <p style={notaCta}>{hero.ctaNote}</p>
    </Secao>
  )
}

export function ParaQuem() {
  const item = (texto: string, cor: string, marca: string) => (
    <li key={texto} style={{ display: 'flex', gap: 12, marginBottom: 14, lineHeight: 1.55, fontSize: 15 }}>
      <span aria-hidden style={{ color: cor, fontWeight: 700, flex: '0 0 auto' }}>
        {marca}
      </span>
      <span>{texto}</span>
    </li>
  )

  return (
    <Secao id="para-quem" surface={dark.surface}>
      <Eyebrow>O FILTRO</Eyebrow>
      <H2>{paraQuem.title}</H2>
      <Lead>{paraQuem.lead}</Lead>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'clamp(24px, 4vw, 48px)',
          marginTop: 36,
        }}
      >
        <div>
          <h3 style={{ ...typo.monoLabel, color: dark.gold, margin: '0 0 16px' }}>{paraQuem.simTitle}</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{paraQuem.sim.map((t) => item(t, dark.gold, '—'))}</ul>
        </div>
        <div>
          <h3 style={{ ...typo.monoLabel, color: dark.muted, margin: '0 0 16px' }}>{paraQuem.naoTitle}</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{paraQuem.nao.map((t) => item(t, dark.faint, '×'))}</ul>
        </div>
      </div>

      <div style={{ marginTop: 36, paddingTop: 24, borderTop: `1px solid ${dark.hairline}` }}>
        <p style={{ margin: '0 0 10px', fontSize: 15 }}>{paraQuem.escape}</p>
        <a href={paraQuem.escapeHref} style={{ color: dark.gold, fontWeight: 600, fontSize: 15 }}>
          {paraQuem.escapeCta} →
        </a>
      </div>
    </Secao>
  )
}

export function Categorias() {
  return (
    <Secao id="categorias">
      <Eyebrow>CATEGORIAS</Eyebrow>
      <H2>{categoriasSecao.title}</H2>
      <Lead>{categoriasSecao.lead}</Lead>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 1,
          background: dark.hairline,
          border: `1px solid ${dark.hairline}`,
          marginTop: 36,
        }}
      >
        {categorias.map((c) => (
          <article key={c.id} style={{ background: dark.bg, padding: '22px 20px' }}>
            <h3 style={{ color: dark.text, fontSize: 19, margin: '0 0 10px', fontWeight: 600 }}>{c.nome}</h3>
            <p style={{ margin: '0 0 12px', fontSize: 14.5, lineHeight: 1.55 }}>{c.resumo}</p>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: dark.faint }}>{c.paraQuem}</p>
          </article>
        ))}
      </div>

      <p style={{ marginTop: 22, fontSize: 14, color: dark.muted }}>{categoriasSecao.nota}</p>
    </Secao>
  )
}

export function Jornada() {
  return (
    <Secao id="jornada" surface={dark.surface}>
      <Eyebrow>COMO FUNCIONA</Eyebrow>
      <H2>{jornada.title}</H2>
      <Lead>{jornada.lead}</Lead>

      <ol style={{ listStyle: 'none', padding: 0, margin: '36px 0 0' }}>
        {jornada.passos.map((p) => (
          <li
            key={p.n}
            style={{
              display: 'grid',
              gridTemplateColumns: '56px 1fr',
              gap: 18,
              padding: '20px 0',
              borderTop: `1px solid ${dark.hairline}`,
            }}
          >
            <span style={{ ...typo.monoLabel, color: dark.gold, fontSize: 15 }}>{p.n}</span>
            <div>
              <h3 style={{ color: dark.text, fontSize: 18, margin: '0 0 8px', fontWeight: 600 }}>{p.titulo}</h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, maxWidth: '58ch' }}>{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </Secao>
  )
}

export function ProvaSocial() {
  return (
    <Secao id="prova">
      <Eyebrow>A ASSESSORIA</Eyebrow>
      <H2>{assessoria.title}</H2>
      <Lead>{assessoria.lead}</Lead>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'clamp(20px, 3vw, 36px)',
          marginTop: 36,
        }}
      >
        {assessoria.itens.map((i) => (
          <div key={i.titulo}>
            <div style={{ height: 2, width: 34, background: dark.gold, marginBottom: 14 }} />
            <h3 style={{ color: dark.text, fontSize: 17, margin: '0 0 8px', fontWeight: 600 }}>{i.titulo}</h3>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55 }}>{i.texto}</p>
          </div>
        ))}
      </div>
    </Secao>
  )
}

export function Fecho() {
  return (
    <Secao id="fecho" surface={dark.surface}>
      <H2>{fecho.title}</H2>
      <Lead>{fecho.lead}</Lead>
      <a href="#cadastro" style={{ ...botao, marginTop: 24 }}>
        {fecho.cta}
      </a>
      <p style={notaCta}>{fecho.ctaNote}</p>
    </Secao>
  )
}

export function Footer() {
  return (
    <footer style={{ background: dark.bg, color: dark.faint, padding: '36px clamp(20px, 5vw, 40px)' }}>
      <div style={{ ...wrap, fontSize: 13.5 }}>
        <div style={{ ...typo.monoLabel, color: dark.muted, marginBottom: 10 }}>BULA ASSESSORIA</div>
        <p style={{ margin: 0 }}>Rodapé provisório — links legais e contato entram na Fase 7.</p>
      </div>
    </footer>
  )
}

export function StickyCta() {
  return null
}
