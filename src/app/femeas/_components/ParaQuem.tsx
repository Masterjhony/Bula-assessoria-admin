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
// ⚠️ A COLUNA DA DIREITA NÃO PODE PARECER PUNITIVA. As duas colunas têm a mesma
// geometria, o mesmo tamanho de título, a mesma cor de texto e o mesmo
// espaçamento. A ÚNICA diferença é o filete de 2px no topo — dourado de um
// lado, neutro do outro. Sem vermelho, sem ícone de proibido, sem "×": quem sai
// daqui pode ser comprador do outro funil da Bula, e o convite para ele está no
// pé da seção. Trocar o filete neutro por qualquer coisa que leia como erro
// custa esse lead duas vezes: perde aqui e não chega lá.
//
// ── OS PAINÉIS SAÍRAM EM 06/08, depois da revisão do dono em iPhone ─────────
// Até aqui a seção era: duas caixas BRANCAS COM BORDA de 1px, sobre o
// pergaminho, e um filete separando cada um dos nove critérios. Caixa dentro de
// caixa, mais sete réguas horizontais — dezesseis traços numa seção que tem
// nove frases. O olho lia formulário, não documento.
//
// O que ficou, e por que cada corte alivia:
//
//   · A BORDA DOS PAINÉIS E O PRÓPRIO PAINÉL SAÍRAM. O pergaminho já É o papel
//     desta seção; desenhar duas folhas brancas em cima dele era repetir o
//     mesmo recado duas vezes. Sem painel, os critérios ficam direto na página,
//     como duas colunas de um impresso — que é o registro que a seção quer.
//     (Manter o painel SEM borda não resolvia: #FFFFFF sobre #F5F3EF dá 1,1:1 e
//     no brilho de um iPhone ao sol some. Ou o painel tem borda, ou não existe;
//     a versão sem borda seria um retângulo fantasma.)
//   · OS SETE FILETES ENTRE CRITÉRIOS VIRARAM AR. O espaço entre itens já era
//     de 26px; entre duas linhas do MESMO critério há menos de 10px de branco.
//     A distância de grupo já era o triplo da distância de linha — o filete não
//     estava separando nada que o espaço não separasse, só somando traço.
//   · A GOTEIRA ENTRE AS COLUNAS ABRIU (era clamp(16,2.4vw,28), virou
//     clamp(44,6vw,72) na horizontal). Sem painel, é a goteira que diz onde uma
//     coluna acaba — e goteira estreita entre dois blocos de texto sem moldura
//     é o jeito clássico de os dois lerem como um só.
//
// ⚠️ O TRATAMENTO CONTINUA IDÊNTICO NOS DOIS LADOS. Nada aqui é assimétrico
// exceto a cor do filete de 2px, como sempre foi. Nenhum critério saiu: seguem
// 5 e 4.
// ─────────────────────────────────────────────────────────────────────────

function Coluna({ titulo, itens, filete }: { titulo: string; itens: CriterioFiltro[]; filete: string }) {
  return (
    // Sem className: a `.femeas-filtro-coluna` existia só para carregar o
    // padding do painel, e o painel saiu. Seletor que não estiliza nada é
    // pegadinha para o próximo — ele procura a regra e não acha.
    <div>
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
      {/* ⚠️ ESTE BLOCO EXISTE PORQUE ESTILO INLINE VENCE MEDIA QUERY. O que
          precisa variar por largura mora aqui, não no `style` de cada elemento.
          Sobrou pouca coisa desde que os painéis saíram (06/08): a regra de
          fora da media query é uma só, o respiro entre critérios.

          O QUE MUDA ABAIXO DE 640px, e por que cada coisa:

          1. `.femeas-filtro-explica` some. É a segunda oração de 5 dos 9
             critérios — a justificativa, nunca o critério. Os 9 continuam lá.
             Ver o cabeçalho de CriterioFiltro em _lib/copy.ts.
          2. O respiro entre itens cai de 30 para 24. São 9 itens em duas
             colunas empilhadas: cada ponto de respiro a menos vale ~14px de
             seção. No celular o critério é UMA frase curta (sem a explicação),
             então 24px de branco já é o triplo do branco entre duas linhas.

          ⚠️ O que NÃO muda, e não pode mudar: as duas colunas continuam com
          tratamento idêntico. O corte foi o mesmo dos dois lados, a geometria é
          a mesma, e a única diferença entre elas segue sendo o filete de 2px no
          topo. Nada de vermelho, ✗ ou acordeão escondendo a coluna da direita —
          filtro que a pessoa precisa abrir para ler não filtra ninguém. */}
      <style>{`
        .femeas-filtro-item + .femeas-filtro-item { margin-top: 30px; }
        @media (max-width: 639.98px) {
          .femeas-filtro-explica { display: none; }
          .femeas-filtro-item + .femeas-filtro-item { margin-top: 24px; }
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
          {/* GOTEIRA LARGA porque não há mais moldura. A horizontal separa as
              duas colunas no desktop; a vertical separa os dois grupos quando
              elas empilham no celular, e por isso é bem maior que os 24px entre
              critérios: 52 contra 24 diz "acabou uma coluna, começou outra"
              sem precisar de linha nenhuma. */}
          <div
            className="mt-[clamp(32px,4.5vw,56px)] grid gap-x-[clamp(44px,6vw,72px)] gap-y-[clamp(52px,6vw,72px)]"
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
