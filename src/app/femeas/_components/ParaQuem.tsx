import { light, typo } from '../_lib/tokens'
import { paraQuem, type CriterioFiltro } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'
import { CabecalhoSecao } from './editorial'

// ─────────────────────────────────────────────────────────────────────────
// O FILTRO — a seção mais importante da página, e a que fica LOGO depois do
// hero. Filtrar cedo é o ponto: quem não se reconhece sai antes de virar lead,
// e sai de graça. Enterrada no fim, a alavanca some (o problema declarado pelo
// cliente é volume de lead errado, não falta de lead).
//
// SUPERFÍCIE CLARA, e a escolha é funcional: o pergaminho tira esta seção do
// registro de "anúncio" e a coloca no registro de "documento". Ela é a única
// parte da página que pede leitura linha a linha, e a troca de superfície entre
// blocos vizinhos é o divisor editorial desta linguagem — sem filete grosso,
// sem faixa colorida.
//
// ⚠️ A COLUNA DA DIREITA NÃO PODE PARECER PUNITIVA. As duas colunas têm o mesmo
// painel, o mesmo tamanho de título, a mesma cor de texto e o mesmo espaçamento.
// A ÚNICA diferença é o filete de 2px no topo — dourado de um lado, neutro do
// outro. Sem vermelho, sem ícone de proibido, sem "×": quem sai daqui pode ser
// comprador do outro funil da Bula, e o convite para ele está no pé da seção.
// Trocar o filete neutro por qualquer coisa que leia como erro custa esse lead
// duas vezes: perde aqui e não chega lá.
// ─────────────────────────────────────────────────────────────────────────

function Coluna({ titulo, itens, filete }: { titulo: string; itens: CriterioFiltro[]; filete: string }) {
  return (
    <div
      className="femeas-filtro-coluna"
      style={{
        background: light.surface,
        border: `1px solid ${light.hairline}`,
      }}
    >
      <div aria-hidden style={{ width: 40, height: 2, background: filete }} />
      <h3 style={{ ...typo.monoLabel, fontSize: 12, color: light.text, marginTop: 18 }}>{titulo}</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 0' }}>
        {itens.map(({ criterio, explicacao }) => (
          <li
            key={criterio}
            className="femeas-filtro-item"
            style={{
              ...typo.body,
              fontSize: 16,
              lineHeight: 1.6,
              color: light.body,
            }}
          >
            {criterio}
            {/* UM nó de texto por critério, partido em dois. `display:none` no
                celular tira a segunda oração da tela E da árvore de
                acessibilidade — o leitor de tela do celular ouve a versão
                curta, não as duas. A alternativa (dois blocos completos, um
                escondido) faria o leitor ler o critério duas vezes. */}
            {explicacao && <span className="femeas-filtro-explica"> {explicacao}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ParaQuem() {
  return (
    <Section surface="light" id="para-quem">
      {/* ⚠️ TUDO AQUI É MOBILE-ONLY. As regras de fora da media query são
          exatamente os valores que estavam no style inline antes — mudaram de
          lugar, não de número, porque estilo inline vence media query e estes
          três precisavam variar por largura. Em 1440 o resultado renderizado é
          o de 05/08.

          O QUE MUDA ABAIXO DE 640px, e por que cada coisa:

          1. `.femeas-filtro-explica` some. É a segunda oração de 5 dos 9
             critérios — a justificativa, nunca o critério. Os 9 continuam lá.
             Ver o cabeçalho de CriterioFiltro em _lib/copy.ts.
          2. O respiro entre itens cai de 16+16 para 13+13, e o painel de 22
             para 18. São 9 itens em duas colunas empilhadas: cada ponto de
             respiro a menos vale ~14px de seção.

          ⚠️ O que NÃO muda, e não pode mudar: as duas colunas continuam com
          tratamento idêntico. O corte foi o mesmo dos dois lados, o painel é o
          mesmo, e a única diferença entre elas segue sendo o filete de 2px no
          topo. Nada de vermelho, ✗ ou acordeão escondendo a coluna da direita —
          filtro que a pessoa precisa abrir para ler não filtra ninguém. */}
      <style>{`
        .femeas-filtro-coluna { padding: clamp(22px, 3vw, 34px); }
        .femeas-filtro-item + .femeas-filtro-item {
          border-top: 1px solid ${light.hairline};
          padding-top: 16px;
          margin-top: 16px;
        }
        @media (max-width: 639.98px) {
          .femeas-filtro-explica { display: none; }
          .femeas-filtro-coluna { padding: 18px; }
          .femeas-filtro-item + .femeas-filtro-item { padding-top: 13px; margin-top: 13px; }
        }
      `}</style>

      <Container>
        <Reveal>
          <CabecalhoSecao
            surface="light"
            kicker={paraQuem.eyebrow}
            titulo={paraQuem.title}
            olho={paraQuem.lead}
            medida="24ch"
          />
        </Reveal>

        <Reveal delay={0.06}>
          <div
            className="mt-[clamp(32px,4.5vw,56px)] grid gap-[clamp(16px,2.4vw,28px)]"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}
          >
            {/* Filete dourado à esquerda, filete neutro à direita — é toda a
                diferença de tratamento entre as duas, de propósito. */}
            <Coluna titulo={paraQuem.simTitle} itens={paraQuem.sim} filete={light.goldText} />
            <Coluna titulo={paraQuem.naoTitle} itens={paraQuem.nao} filete={light.hairlineStrong} />
          </div>
        </Reveal>

        {/* A saída digna. Quem chegou até aqui e se reconheceu na coluna da
            direita vale mais no outro funil do que numa reunião que não vai
            acontecer — e este é o único link da página que leva para fora. */}
        <Reveal delay={0.1}>
          <div
            className="mt-[clamp(32px,4vw,52px)] flex flex-col gap-4 pt-7 sm:flex-row sm:items-baseline sm:justify-between sm:gap-10"
            style={{ borderTop: `1px solid ${light.hairlineStrong}` }}
          >
            <p style={{ ...typo.body, fontSize: 16, lineHeight: 1.6, color: light.muted, maxWidth: '54ch' }}>
              {paraQuem.escape}
            </p>
            <a
              href={paraQuem.escapeHref}
              className="inline-flex items-center gap-2 self-start"
              style={{
                ...typo.body,
                fontSize: 16,
                fontWeight: 600,
                // Dourado ESCURO: rótulo pequeno em dourado claro sobre
                // pergaminho reprova em qualquer tamanho (ver editorial.tsx).
                color: light.goldText,
                textDecoration: 'underline',
                textUnderlineOffset: 5,
                textDecorationThickness: 1,
                // Alvo de toque ≥44px sem inflar a linha de texto (INV-6).
                minHeight: 44,
                whiteSpace: 'nowrap',
              }}
            >
              {paraQuem.escapeCta}
              <span aria-hidden>→</span>
            </a>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
