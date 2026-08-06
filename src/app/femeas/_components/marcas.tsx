// ─────────────────────────────────────────────────────────────────────────
// MARCAS — a camada gráfica da landing de fêmeas. SVG inline, desenhado aqui.
//
// Sobraram DUAS famílias, e elas são as duas que funcionam:
//   · os quatro diagramas da Assessoria (`MarcaServico`);
//   · o trilho da Jornada (`TrilhoJornada`), que é CSS, não SVG.
//
// POR QUE NÃO `lucide-react` (que está no package.json e seria uma linha):
// ícone de biblioteca tem traço arredondado, cantos macios e peso uniforme. O
// sistema desta página é o oposto — canto reto, filete de 1px, Oswald
// condensada. Duas linguagens na mesma tela lêem como descuido, não como
// variedade. O precedente do repositório é `saogeraldo/_components/MapaBrasil`:
// desenho próprio, servido do servidor, sem dependência.
//
// A REGRA QUE DECIDE SE UMA MARCA ENTRA: ela precisa dizer algo que o texto
// não diz DE RELANCE. Marca que repete o título é ruído — deixa a página mais
// cheia e menos legível, que é o contrário do que foi pedido. Por isso não há
// marca em `ParaQuem` nem na ficha técnica do hero (ver o comentário no fim
// deste arquivo).
//
// ── ⚠️ AS SEIS MARCAS DE CATEGORIA FORAM REMOVIDAS (06/08/2026) ───────────
// Pedido direto do dono do projeto: "os ícones em CATEGORIAS estão totalmente
// feios e desconfigurados, retire eles". Não foi só julgamento estético — a
// medição em 390/768/1440 antes de remover achou defeito real, e fica
// registrado aqui para ninguém redesenhar o mesmo erro:
//
//   1. A silhueta facetada NÃO lia como bovino. Cabeça e corpo eram uma massa
//      só, sem pescoço, e a barbela virava um zigue-zague; a 72px o glifo lia
//      como sapato/automóvel. O público desta página é criador — ele nota.
//   2. As seis marcas tinham LARGURAS DESENHADAS diferentes (111, 64, 100,
//      100, 146 e 100 px em 1440), todas alinhadas à direita pelo
//      `justify-between`. Como o que alinhava era a CAIXA do SVG e não o
//      traço, a borda direita das marcas variava até ~13px entre cartões
//      vizinhos — numa grade cujo sistema inteiro é filete de 1px, isso lê
//      exatamente como "desconfigurado".
//   3. O `pacote-3-em-1` prometia, em comentário, "abrir espaço real ao
//      bezerro". O espaço real era de 0,7 unidade de viewBox — menos de 1px na
//      tela. A bezerra dourada encostava no rabo da matriz.
//
// Se um dia isto voltar, volta como FOTO (o encaixe existe em Categorias.tsx),
// não como pictograma redesenhado.
//
// ── ACESSIBILIDADE ────────────────────────────────────────────────────────
// Todas as marcas são `aria-hidden` e nenhuma entra na ordem de foco. Não é
// desleixo, é a regra do WCAG para imagem REDUNDANTE: tudo que os desenhos
// mostram já está escrito na prosa vizinha. O que a marca acrescenta é
// VELOCIDADE DE VARREDURA — e quem lê com leitor de tela lê linearmente, já
// recebe a informação pelo texto.
//
// Consequência prática: nada aqui vai para `_lib/copy.ts`, porque não há
// `alt`/`aria-label` para escrever. Se um dia alguma marca passar a carregar
// informação que NÃO está na prosa vizinha, ela deixa de ser decorativa e aí
// sim precisa de rótulo — e o rótulo nasce no `copy.ts` (INV-5).
//
// ── MOVIMENTO ────────────────────────────────────────────────────────────
// Nenhuma marca anima. Nada a fazer sobre `prefers-reduced-motion` aqui: o
// único movimento das seções continua sendo o <Reveal/> que já existia.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { dark, light } from '../_lib/tokens'

// Cinza do traço. Medido: 3,65:1 sobre #0D0D0D — acima do mínimo de 3:1 que o
// WCAG 1.4.11 pede para gráfico que carrega significado. Não clarear "para
// ficar bonito" sem medir de novo; não escurecer, ou a marca some.
//
// Só existe versão para fundo ESCURO porque a única seção marcada (assessoria)
// é escura. Se um dia entrar marca sobre o pergaminho, este cinza mede 2,4:1 lá
// e REPROVA — a versão clara seria #6F6F6F (4,7:1).
const TRACO_ESCURO = '#7A7A7A'

// Espessura em unidades do viewBox. Os diagramas da assessoria têm 60 unidades
// de largura e são renderizados com 54px, então 1,5 × (54/60) = 1,35px na tela —
// da mesma família do filete de 1px do resto da página.
const PESO = 1.5

// ─────────────────────────────────────────────────────────────────────────
// OS QUATRO SERVIÇOS DA ASSESSORIA.
//
// O problema concreto: hoje os quatro itens abrem com o MESMO filete dourado de
// 34×2. Quatro aberturas idênticas para quatro serviços diferentes — a seção
// promete "o que vem junto" e entrega quatro parágrafos que só se distinguem
// depois de lidos.
//
// Honestidade sobre o que cada um carrega, porque nem todos carregam igual:
//
//   escolha do animal · catálogo com muitos lotes e UM marcado. O serviço é
//                       escolher entre muitos — o texto diz, o desenho mostra.
//   acasalamento      · diagrama de pedigree: dois pais → um produto. É o item
//                       de MAIOR carga da página. "Acasalamento" é a palavra que
//                       o público declarado (quem está começando) pode conhecer
//                       de ouvir e não de fazer, e o texto a usa sem definir.
//                       O diagrama define.
//   parte financeira  · barra dividida em partes iguais. É o mais fraco dos
//                       quatro: praticamente reafirma o "30×" do texto. Fica
//                       porque três itens marcados e um pelado leem como bug —
//                       ou os quatro, ou nenhum.
//   entrega           · porteira com o trajeto dourado chegando NELA. Responde
//                       a pergunta que "frete grátis sob consulta" deixa aberta:
//                       chega até onde? Até a sua porteira.
//
// ⚠️ O número de divisões da barra do financeiro é ALTO e irregular de contar de
// propósito (12 células de ~4px). Com 4 ou 8 células legíveis, alguém conta e lê
// "8×" — e aí o desenho estaria contradizendo o "30×" do texto. Não reduzir.
// ─────────────────────────────────────────────────────────────────────────
function QuadroServico({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 60 40"
      aria-hidden="true"
      focusable="false"
      style={{ width: 54, height: 'auto', display: 'block' }}
    >
      {children}
    </svg>
  )
}

const PARCELAS = Array.from({ length: 11 }, (_, i) => 4 + ((i + 1) * 52) / 12)

const SERVICO: Record<string, ReactNode> = {
  'escolha-do-animal': (
    <QuadroServico>
      <g fill="none" stroke={TRACO_ESCURO} strokeWidth={PESO} strokeLinecap="butt">
        <path d="M 4 34 L 56 34" />
        <path d="M 9 34 L 9 17 M 19 34 L 19 17 M 39 34 L 39 17 M 49 34 L 49 17" />
      </g>
      {/* O lote escolhido: mais alto que os vizinhos e com a marcação por cima. */}
      <g fill="none" stroke={dark.gold} strokeWidth={PESO} strokeLinecap="butt">
        <path d="M 29 34 L 29 11" />
        <path d="M 24 7 L 34 7" />
      </g>
    </QuadroServico>
  ),
  acasalamento: (
    <QuadroServico>
      <g fill="none" stroke={TRACO_ESCURO} strokeWidth={PESO} strokeLinejoin="miter">
        <rect x="10" y="5" width="9" height="9" />
        <rect x="41" y="5" width="9" height="9" />
        {/* A forquilha do pedigree: os dois descem, se encontram, e do encontro
            desce UMA linha. É a gramática de árvore genealógica, que é o
            desenho nativo deste assunto — não uma metáfora inventada. */}
        <path d="M 14.5 14 L 14.5 22 L 45.5 22 L 45.5 14" />
        <path d="M 30 22 L 30 28" />
      </g>
      <circle cx="30" cy="32" r="3.4" fill={dark.gold} />
    </QuadroServico>
  ),
  'parte-financeira': (
    <QuadroServico>
      <g fill="none" stroke={TRACO_ESCURO} strokeWidth={PESO} strokeLinejoin="miter">
        <rect x="4" y="14" width="52" height="12" />
        {PARCELAS.map((x) => (
          <path key={x} d={`M ${x} 14 L ${x} 26`} />
        ))}
      </g>
      {/* A primeira parcela em ouro: o parcelamento começa, não é promessa vaga. */}
      <rect x="4.75" y="14.75" width={52 / 12 - 1.5} height="10.5" fill={dark.gold} />
    </QuadroServico>
  ),
  entrega: (
    <QuadroServico>
      <g fill="none" stroke={TRACO_ESCURO} strokeWidth={PESO} strokeLinejoin="miter">
        {/* Porteira: dois moirões e o travessão. A imagem de "chegou na fazenda". */}
        <path d="M 26 34 L 26 12 M 52 34 L 52 12" />
        <path d="M 22 12 L 56 12" />
        <path d="M 26 21 L 52 21" />
      </g>
      <g fill="none" stroke={dark.gold} strokeWidth={PESO} strokeLinejoin="miter" strokeLinecap="butt">
        <path d="M 2 27 L 20 27" />
        <path d="M 16 23.5 L 20 27 L 16 30.5" />
      </g>
    </QuadroServico>
  ),
}

/** Marca de um serviço da assessoria. `null` para chave sem desenho. */
export function MarcaServico({ id }: { id: string }) {
  return <>{SERVICO[id] ?? null}</>
}

// ─────────────────────────────────────────────────────────────────────────
// O TRILHO DA JORNADA — 1px, e não é SVG de propósito.
//
// Os quatro passos hoje são quatro painéis empilhados. A numeração diz que há
// ordem, mas o desenho diz que há QUATRO CAIXAS. O trilho passando pelo centro
// dos números transforma quatro caixas em um percurso — que é a informação real
// da seção, e a razão de ela existir (quem não sabe que vai haver reunião não
// aparece na reunião).
//
// Por que CSS e não SVG: o resto da página desenha seus filetes assim (o traço
// do <Kicker/>, a barra da <Assessoria/>). Um SVG aqui seria a exceção, não a
// regra. E, principalmente, isto CUSTA ZERO ALTURA: é `position:absolute`, então
// nenhum passo desce um pixel.
//
// ⚠️ Ordem de pintura, que é o detalhe que quebra se alguém mexer. São DUAS
// camadas, nesta ordem:
//   1. os <li> (fundo opaco, elementos NÃO posicionados) pintam embaixo;
//   2. o trilho (posicionado) pinta por cima deles — por isso ele precisa vir
//      DEPOIS da <ol> no DOM. Movido para antes, some da tela sem erro nenhum;
//   3. a caixa do número volta para cima do trilho com `z-index: 1`, e é ela que
//      abre o vão do filete em torno de cada algarismo. Sem essa terceira
//      camada, a linha corta o "01" ao meio e lê como defeito, não como
//      percurso.
//
// As contas de `left`/`top` repetem, de propósito, os mesmos `clamp()` do padding
// do painel e da coluna do número. Se um daqueles mudar em Jornada.tsx, muda aqui
// junto — está anotado lá.
// ─────────────────────────────────────────────────────────────────────────
export const JORNADA_PADDING = 'clamp(22px, 2.8vw, 32px)'
export const JORNADA_COLUNA = 'clamp(46px, 6vw, 74px)'
export const JORNADA_NUMERO = 'clamp(26px, 3.4vw, 38px)'

export function TrilhoJornada() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        // Começa no meio do "01" (padding do painel + metade da altura do
        // número, que é o próprio font-size porque line-height é 1).
        top: `calc(${JORNADA_PADDING} + ${JORNADA_NUMERO} / 2)`,
        // Termina no filete de baixo da lista: o percurso tem fim, e o fim é o
        // fim da seção. Parar no meio do último painel leria como falha de
        // renderização.
        bottom: 0,
        left: `calc(${JORNADA_PADDING} + ${JORNADA_COLUNA} / 2)`,
        width: 1,
        background: light.hairlineStrong,
        pointerEvents: 'none',
      }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────
// O QUE NÃO GANHOU MARCA, E POR QUÊ — está aqui para não ser "consertado"
// depois por quem achar que faltou.
//
// 1. `ParaQuem`. A regra da seção é que as duas colunas tenham tratamento
//    idêntico; quem se reconhece na direita pode ser comprador de touro, e a
//    Bula quer esse cara no outro funil. Marca só entraria se fosse a MESMA dos
//    dois lados — e marca igual dos dois lados não informa nada, porque o
//    conteúdo das colunas é critério em prosa, não estado enumerável. Então não
//    entra nada. Nada de ✓/✗, nada de vermelho, nada de proibido: isso custaria
//    o lead duas vezes (perde aqui e não chega lá).
//
// 2. Ficha técnica do hero (30× · frete · R$ 0). Duas razões, e a segunda é a
//    que decide. A primeira: os três já são a coisa mais varrível da página —
//    número gigante em Oswald com rótulo mono dourado; uma marca ao lado
//    disputaria com o número em vez de ajudar. A segunda: qualquer coisa que
//    cresça no hero empurra o formulário para baixo, e no celular o primeiro
//    campo já está a 1,13 tela de rolagem (contra 0,75 no /touros). Estética no
//    hero se paga em conversão, e a primeira dobra é decisão pendente do dono.
// ─────────────────────────────────────────────────────────────────────────
