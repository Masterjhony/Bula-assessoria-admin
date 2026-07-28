import { dark, space, typo } from '../_lib/tokens'
import { EVENTO } from '../_lib/evento'
import { copyCatalogo } from '../_lib/copy-catalogo'
import { Container } from './ui'
import { FioOrnamento } from './ui-catalogo'

// ─────────────────────────────────────────────────────────────────────────
// RODAPÉ.
//
// SEM BLOCO DE PATROCINADORES: o cliente decidiu em 28/07 que esta é uma
// página exclusiva de São Geraldo, e os logos de realização, leiloeiras,
// transmissão e patrocínio saem. A decisão também resolveu uma pendência
// aberta — nenhum desses logos existe no repositório, e o cliente já havia
// vetado placeholder.
//
// O que fica é o mínimo institucional: o site da fazenda e os dois links
// legais, que precisam existir numa página que coleta dado pessoal.
// ─────────────────────────────────────────────────────────────────────────

export function RodapeCatalogo() {
  return (
    <footer
      style={{
        background: dark.bg,
        borderTop: `1px solid ${dark.hairline}`,
        padding: `${space.xl} clamp(16px, 5vw, 32px)`,
        textAlign: 'center',
      }}
    >
      <Container>
        <FioOrnamento largura={220} />

        <a
          href={copyCatalogo.rodape.siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...typo.eyebrow,
            color: dark.gold,
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            marginTop: space.sm,
            textDecoration: 'none',
          }}
        >
          {copyCatalogo.rodape.site}
        </a>

        <p
          style={{
            ...typo.cerimonia,
            color: dark.muted,
            margin: 0,
            marginTop: space.xs,
          }}
        >
          {EVENTO.nome}
        </p>

        <nav
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: space.md,
            marginTop: space.md,
          }}
        >
          {[
            { href: '/privacidade', texto: copyCatalogo.rodape.privacidade },
            { href: '/termos', texto: copyCatalogo.rodape.termos },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{
                ...typo.fichaRotulo,
                color: dark.muted,
                textDecoration: 'none',
                // Alvo de toque: a régua é 44px, e estes são os últimos
                // links da página, onde o polegar chega cansado.
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0 8px',
              }}
            >
              {l.texto}
            </a>
          ))}
        </nav>
      </Container>
    </footer>
  )
}
