// ─────────────────────────────────────────────────────────────────────────
// MARCAS — a camada gráfica da landing de fêmeas. SVG inline, desenhado aqui.
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
// ── O VOCABULÁRIO, e ele é UM SÓ na página inteira ────────────────────────
//   traço neutro (#7A7A7A)  → o animal / o objeto
//   ponto dourado cheio     → uma vida que vem junto no negócio (embrião,
//                             prenhez, bezerro)
//   dourado no traço        → a parte que a seção está afirmando
//
// As seis categorias e os quatro serviços usam o MESMO desenho de matriz e o
// MESMO ponto dourado. É isso que faz a página ter uma camada gráfica, e não
// dois conjuntos de ícones que por acaso convivem.
//
// ── ACESSIBILIDADE ────────────────────────────────────────────────────────
// Todas as marcas são `aria-hidden` e nenhuma entra na ordem de foco. Não é
// desleixo, é a regra do WCAG para imagem REDUNDANTE: tudo que os desenhos
// mostram já está escrito na prosa do próprio cartão ("três animais no negócio
// de uma vez", "você compra o embrião e implanta nas receptoras que já tem").
// O que a marca acrescenta é VELOCIDADE DE VARREDURA — e quem lê com leitor de
// tela lê linearmente, já recebe a informação pelo texto. Anunciar "diagrama:
// matriz adulta com bezerro ao pé" logo depois de "Pacote 3 em 1" seria
// tagarelice, não acessibilidade.
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
// Só existe versão para fundo ESCURO porque as duas seções marcadas (categorias
// e assessoria) são escuras. Se um dia entrar marca sobre o pergaminho, este
// cinza mede 2,4:1 lá e REPROVA — a versão clara seria #6F6F6F (4,7:1).
const TRACO_ESCURO = '#7A7A7A'

// Espessura em unidades do viewBox. Os glifos das categorias têm 84 unidades de
// largura e são renderizados com ~72px, então 1,5 × (72/84) ≈ 1,3px na tela —
// da mesma família do filete de 1px do resto da página.
const PESO = 1.5

// ─────────────────────────────────────────────────────────────────────────
// O PERFIL DE MATRIZ NELORE — desenhado uma vez, usado por seis marcas.
//
// Facetado em retas com junta em esquadria, que é o canto reto da página
// aplicado a uma forma orgânica. As três coisas que o traço PRECISA manter,
// senão vira "vaca genérica" e o público desta página nota: o cupim sobre a
// cernelha, o dorso reto e a barbela funda.
//
// Sistema de coordenadas: viewBox 84×46, patas fincadas em y=39 SEMPRE. É essa
// linha de chão compartilhada que faz a bezerra (escala 0,64) ler como "o mesmo
// animal, mais novo" em vez de "o mesmo desenho, menor". Sem a linha comum, a
// diferença de estágio — que é a informação da seção — desaparece.
// ─────────────────────────────────────────────────────────────────────────
const CHAO = 39

// garupa → dorso → cupim → pescoço → cabeça → focinho → queixo → barbela →
// peito → barriga → flanco.
const CORPO =
  'M 10 18 L 27 17 L 32 9 L 37 10 L 42 16 L 49 19 L 55 21' +
  ' L 60 28 L 61 32 L 56 33 L 52 30' +
  ' L 47 33 L 44 34 L 40 26 L 37 28 L 20 29 L 12 26 Z'
const PERNAS = 'M 38 28 L 38 39 M 15 28 L 15 39'
const RABO = 'M 10 19 L 7 25 L 8 33'

/**
 * Uma matriz. `escala` < 1 é um animal mais novo — e a escala é aplicada com a
 * origem no chão, não no canto do viewBox, para as patas continuarem na mesma
 * linha.
 *
 * A espessura do traço é dividida pela escala de propósito: sem isso a bezerra
 * sairia com traço mais fino que a novilha e leria como "mais fraca" em vez de
 * "menor". O que muda entre os glifos é o TAMANHO do animal, nunca o peso da
 * linha.
 */
function Matriz({ cor, escala = 1, x = 0 }: { cor: string; escala?: number; x?: number }) {
  return (
    <g
      transform={`translate(${x}, ${CHAO - CHAO * escala}) scale(${escala})`}
      fill="none"
      stroke={cor}
      strokeWidth={PESO / escala}
      strokeLinejoin="miter"
      strokeLinecap="butt"
    >
      <path d={CORPO} />
      <path d={PERNAS} />
      <path d={RABO} />
    </g>
  )
}

/** Uma vida que vem junto: embrião, prenhez, bezerro. Sempre dourada, sempre cheia. */
function Vida({ x, y, r = 3 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={dark.gold} />
}

function Quadro({ children, largura }: { children: ReactNode; largura: string }) {
  return (
    <svg
      viewBox="0 0 84 46"
      aria-hidden="true"
      focusable="false"
      style={{ width: largura, height: 'auto', display: 'block', flex: '0 0 auto' }}
    >
      {children}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// AS SEIS CATEGORIAS.
//
// O que cada marca informa, e que o texto informa mas não DE RELANCE — a
// diferença entre as seis é o ESTÁGIO do animal e QUANTAS VIDAS entram no
// negócio, e hoje isso só existe espalhado em duas frases por cartão:
//
//   embriões  · não chega animal nenhum: chega uma palheta. É a única marca
//               sem bicho, e é por isso que ela é a porta mais barata.
//   bezerras  · o mesmo animal, pequeno, na mesma linha de chão → recria.
//   novilhas  · adulta, nada dourado → pronta, mas ainda não gera nada.
//   prenhes   · adulta + 1 ponto dentro → o bezerro já está no negócio.
//   3 em 1    · adulta + 1 ponto dentro + 1 bezerro ao pé → conta três.
//   doadoras  · adulta + pontos SAINDO → ela produz a palheta do cartão 01.
//               É o único glifo em que o dourado sai do animal em vez de entrar.
//
// A contagem é o ponto: 0 → 1 → 1 → 2 → 3 → n. Quem bate o olho na grade lê a
// progressão sem ler uma linha, que é exatamente o serviço que a foto prestaria.
//
// ⚠️ A chave é o `id` de _lib/categorias.ts. Categoria nova sem marca aqui
// renderiza sem marca (e não quebra) — mas a grade fica com cinco cartões
// marcados e um pelado, que lê como defeito. Ao acrescentar categoria, desenhar
// a marca junto.
// ─────────────────────────────────────────────────────────────────────────
const CATEGORIA: Record<string, ReactNode> = {
  // Palheta (French straw): retângulo com os dois lacres, e o embrião dentro.
  // Deliberadamente NÃO é um animal — é o que diferencia esta porta das outras
  // cinco, e é a informação que a frase "você compra o embrião" dá em duas
  // leituras e o desenho dá em zero.
  embrioes: (
    <>
      <g fill="none" stroke={TRACO_ESCURO} strokeWidth={PESO} strokeLinejoin="miter">
        <rect x="12" y="19" width="60" height="11" />
        <path d="M 24 19 L 24 30 M 60 19 L 60 30" />
      </g>
      <Vida x={42} y={24.5} r={3.2} />
    </>
  ),
  bezerras: <Matriz cor={TRACO_ESCURO} escala={0.64} x={20} />,
  novilhas: <Matriz cor={TRACO_ESCURO} x={12} />,
  prenhes: (
    <>
      <Matriz cor={TRACO_ESCURO} x={12} />
      <Vida x={38} y={24} />
    </>
  ),
  // A matriz vai para a direita para abrir espaço real ao bezerro — sobreposição
  // aqui custaria a contagem, que é a informação inteira deste cartão.
  'pacote-3-em-1': (
    <>
      <Matriz cor={TRACO_ESCURO} x={23} />
      <Vida x={49} y={24} />
      <Matriz cor={dark.gold} escala={0.48} x={0} />
    </>
  ),
  doadoras: (
    <>
      <Matriz cor={TRACO_ESCURO} x={12} />
      <Vida x={26} y={12} r={2.4} />
      <Vida x={34} y={8} r={2.4} />
      <Vida x={42} y={4} r={2.4} />
    </>
  ),
}

/** Marca de uma categoria. Devolve `null` para id sem desenho — nunca quebra a grade. */
export function MarcaCategoria({ id, largura }: { id: string; largura: string }) {
  const desenho = CATEGORIA[id]
  if (!desenho) return null
  return <Quadro largura={largura}>{desenho}</Quadro>
}

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
