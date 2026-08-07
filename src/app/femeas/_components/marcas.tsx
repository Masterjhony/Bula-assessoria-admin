// ─────────────────────────────────────────────────────────────────────────
// MARCAS — a camada gráfica da landing de fêmeas. SVG inline, desenhado aqui.
//
// São TRÊS famílias, e elas são as três que funcionam:
//   · os quatro diagramas da Assessoria (`MarcaServico`);
//   · as três marcas da ficha técnica do hero (`MARCAS_FICHA`, 06/08);
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
// marca em `ParaQuem`: lá o dispositivo é o algarismo por critério, e ícone ao
// lado de "não é para você se" é o vocabulário de aprovado/reprovado que a
// decisão travada proíbe.
//
// ⚠️ A FICHA TÉCNICA DO HERO ESTAVA NESTA MESMA FRASE ATÉ 06/08 e saiu dela —
// as três marcas dela estão em `MARCAS_FICHA`, no meio deste arquivo, com a
// medida que fez a decisão virar. O item 2 do comentário no fim do arquivo
// guarda o argumento antigo e mostra por que ele caducou.
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

// Cinza do traço. Acima do mínimo de 3:1 que o WCAG 1.4.11 pede para gráfico
// que carrega significado. Não clarear "para ficar bonito" sem medir de novo;
// não escurecer, ou a marca some.
//
// Duas medições, e a que vale é a segunda: 3,65:1 sobre #0D0D0D (o canvas
// padrão) e 4,29:1 sobre #141414 — que é o fundo REAL da assessoria, a única
// seção marcada. Medido no navegador em 06/08, amostrando o `stroke` calculado
// contra o fundo herdado. A folga sobre o mínimo é o que permitiu engrossar o
// desenho na mesma rodada sem refazer a conta.
//
// Só existe versão para fundo ESCURO porque a única seção marcada (assessoria)
// é escura. Se um dia entrar marca sobre o pergaminho, este cinza mede 2,4:1 lá
// e REPROVA — a versão clara seria #6F6F6F (4,7:1).
const TRACO_ESCURO = '#7A7A7A'

// Espessura em unidades do viewBox. Os diagramas da assessoria têm 60 unidades
// de largura.
//
// ⚠️ ESTE NÚMERO ANDA JUNTO COM `LARGURA_SERVICO`, e a conta é a única razão de
// ele existir: o traço na tela mede PESO × (largura renderizada ÷ 60), e ele
// tem que ficar na família do filete de 1px do resto da página. Em 06/08 o
// diagrama cresceu de 54px para clamp(64–78) — a 78px o peso antigo (1,5) daria
// 1,95px, quase o dobro do filete, e a marca passaria a ler como ícone
// desenhado a caneta grossa no meio de uma página de fios.
//
//   antes  1,5 × 54/60          = 1,35px
//   agora  1,0 × 72/60 … 88/60  = 1,20 … 1,47px
//
// A faixa nova cerca a antiga em vez de escapar dela — que é o objetivo.
const PESO = 1.0

// Largura renderizada do diagrama de serviço.
//
// Cresceu de 54px fixos em 06/08/2026, na rodada de "está pouco visual". A
// assessoria é uma das seções que NÃO pode ganhar foto (o que ela descreve é
// serviço, não animal), então o peso visual dela tem que vir do que já existe —
// e o que já existe são estes quatro diagramas, que o dono nunca reprovou (o
// que saiu foram as seis silhuetas de bovino das categorias; ver o aviso mais
// acima). Aumentar um desenho aprovado é o metro quadrado mais barato de peso
// visual que esta página tinha sobrando.
//
// ⚠️ CRESCER AQUI É SEGURO E CRESCER NAS CATEGORIAS NÃO ERA — a diferença está
// no `viewBox`. Os quatro diagramas dividem o MESMO quadro de 60×40, então as
// quatro caixas medem exatamente igual em qualquer tamanho e empilham alinhadas
// por construção. As seis marcas de categoria tinham larguras desenhadas
// diferentes (111, 64, 100, 100, 146, 100px) — ampliar aquilo teria ampliado o
// desalinhamento junto, que foi o defeito medido. Se um dia entrar uma quinta
// marca de serviço, ela nasce no mesmo 60×40 ou nada disto vale.
const LARGURA_SERVICO = 'clamp(72px, 7vw, 88px)'

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
      style={{ width: LARGURA_SERVICO, height: 'auto', display: 'block' }}
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
// AS TRÊS MARCAS DA FICHA TÉCNICA DO HERO (30× · frete · R$ 0).
//
// ⚠️ ISTO CONTRADIZ o que o fim deste arquivo dizia até 06/08 ("a ficha não
// ganha marca"). A contradição é deliberada e está explicada lá embaixo — o
// argumento de antes era sobre uma ficha que não existe mais.
//
// O QUE FEZ ENTRAR, em número: a régua desta página é que uma seção ou quebra
// 2,0× de razão tipográfica (maior tipo ÷ 16px de corpo) ou carrega ≥3% de área
// não-texto. A ficha media 1,25× / 0,0% no celular e 1,63× / 0,0% no desktop —
// falhava as duas metades, nos dois tamanhos, e por margem maior que qualquer
// outro ponto da página. Subir o tipo para bater 2,0× (32px+) está FECHADO: a
// ficha mora dentro de um hero cuja manchete é clamp(38,6.2vw,68), e um número
// de 32px ali volta a competir com ela — foi exatamente o defeito da rodada em
// que o valor estava em Oswald 36px. Sobrava a outra metade da régua, e a outra
// metade é desenho.
//
// ── POR QUE NÃO REUSAR `parte-financeira` E `entrega` DA ASSESSORIA ─────────
// Eles descrevem os mesmos dois assuntos, e reusar teria custado zero desenho.
// Não dá, e a razão é de TAMANHO, não de gosto:
//
//   · o quadro da assessoria é calibrado para 72–88px de largura, e a espessura
//     do traço lá é PESO × (largura ÷ 60). Na ficha a marca não pode passar de
//     ~40px (acima disso ela fica maior que o próprio número de 20–26px que
//     deveria ilustrar), e a 40px aquele traço mede 1,0 × 40/60 = 0,67px —
//     ABAIXO do filete de 1px que é o piso da linguagem desta página. O
//     comentário de `PESO` existe justamente para impedir esse desvio;
//   · a barra do financeiro tem 12 células em 52 unidades. A 40px de largura
//     cada célula mede 2,9px e as divisórias somem — a barra vira um borrão
//     cinza, e some junto a única coisa que ela dizia.
//
// Então as três nasceram aqui, no MESMO idioma (traço de 1px na tela, canto
// reto, dourado como voltagem única) e com um `viewBox` próprio de 32×32
// compartilhado pelas três — a mesma regra que faz os quatro diagramas da
// assessoria empilharem alinhados por construção, e cuja ausência foi o defeito
// medido das seis marcas de categoria que saíram (larguras de 111 a 146px).
//
// O que se reusa é a GRAMÁTICA, não a figura: a primeira parcela em ouro, a
// seta dourada chegando na porteira, o feixe que converge num ponto dourado
// (a mesma forquilha do `acasalamento`). A página rima sem repetir desenho.
// ─────────────────────────────────────────────────────────────────────────

// Teto de 40px porque acima disso a marca fica maior que o número de 26px que
// ela acompanha no desktop — e marca maior que o dado inverte a hierarquia, que
// é o erro que esta rodada existe para não repetir. Piso de 34px porque abaixo
// disso a porteira (5 traços) fecha e vira mancha.
const LARGURA_FICHA = 'clamp(34px, 3vw, 40px)'

// ⚠️ Anda junto com `LARGURA_FICHA`, mesma conta do `PESO` da assessoria: o
// traço na tela mede PESO_FICHA × (largura ÷ 32).
//
//   34px → 0,85 × 34/32 = 0,90px
//   40px → 0,85 × 40/32 = 1,06px
//
// A faixa CERCA 1px em vez de escapar dele — é o que mantém estas marcas na
// mesma família dos filetes do resto da página.
const PESO_FICHA = 0.85

function QuadroFicha({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      style={{ width: LARGURA_FICHA, height: 'auto', display: 'block', flex: '0 0 auto' }}
    >
      {children}
    </svg>
  )
}

// ⚠️ A ORDEM É A DE `hero.stats` (copy.ts). Quem reordenar lá reordena aqui —
// e quem ACRESCENTAR um item lá sem acrescentar aqui não ganha uma ficha com
// três marcas e uma linha pelada: o Hero confere os dois comprimentos e, se não
// baterem, não desenha marca NENHUMA. Três marcados e um sem lê como bug, e
// esse já é um erro medido nesta página (ver o aviso das categorias).
export const MARCAS_FICHA: ReactNode[] = [
  // 30× NO BOLETO — a barra de parcelas, com a primeira em ouro.
  //
  // ⚠️ A barra tem 36 unidades de largura num quadro de 32: ela SAI PELA
  // DIREITA de propósito, e o `viewBox` a corta. É o que resolve, neste
  // tamanho, o mesmo problema que a assessoria resolve com 12 células ilegíveis
  // de contar: uma barra fechada com 4 células conta-se em meio segundo e o
  // desenho passaria a dizer "4×" ao lado de um texto que diz "30×". Cortada
  // pela moldura, ela não afirma quantidade nenhuma — afirma que continua.
  // Não fechar esta barra.
  <QuadroFicha key="parcelamento">
    <g fill="none" stroke={TRACO_ESCURO} strokeWidth={PESO_FICHA} strokeLinejoin="miter">
      <rect x="1" y="8" width="36" height="16" />
      <path d="M 9 8 L 9 24 M 17 8 L 17 24 M 25 8 L 25 24" />
    </g>
    <rect x="1.55" y="8.55" width="6.9" height="14.9" fill={dark.gold} />
  </QuadroFicha>,

  // FRETE GRÁTIS SOB CONSULTA — o trajeto dourado chegando na porteira.
  // Mesma ideia do `entrega` da assessoria, redesenhada com os traços que
  // sobrevivem a 34px. Responde "chega até onde?" — até a sua porteira.
  //
  // ⚠️ SÃO DUAS RIPAS, não uma. A primeira versão tinha uma só e a porteira
  // lia como a letra "A" a 34px: dois montantes e um travessão no meio é
  // exatamente o desenho de um A. A segunda ripa é o que desfaz a leitura, e
  // ela ocupa o mesmo espaço morto que já existia entre a ripa única e o pé.
  <QuadroFicha key="entrega">
    <g fill="none" stroke={TRACO_ESCURO} strokeWidth={PESO_FICHA} strokeLinejoin="miter">
      <path d="M 19 27 L 19 6 M 30 27 L 30 6" />
      <path d="M 16 6 L 31 6" />
      <path d="M 19 12.5 L 30 12.5 M 19 19 L 30 19" />
    </g>
    <g fill="none" stroke={dark.gold} strokeWidth={PESO_FICHA} strokeLinejoin="miter" strokeLinecap="butt">
      <path d="M 1 23.5 L 15 23.5" />
      <path d="M 11.5 20 L 15 23.5 L 11.5 27" />
    </g>
  </QuadroFicha>,

  // R$ 0 CUSTO DA ASSESSORIA — o feixe que converge num ponto dourado.
  //
  // Este é o único dos três sem antecedente na assessoria, e é o que mais
  // precisava de desenho: o texto diz o PREÇO (zero) e não diz O QUE é. As três
  // linhas se reúnem e chegam a um ponto — "várias frentes, e todas chegam em
  // você". É a forquilha do `acasalamento` (muitos → um, terminando em ouro),
  // que é a gramática já estabelecida desta página para "converge".
  <QuadroFicha key="assessoria">
    <g fill="none" stroke={TRACO_ESCURO} strokeWidth={PESO_FICHA} strokeLinejoin="miter" strokeLinecap="butt">
      <path d="M 1 6 L 12 6 M 1 16 L 12 16 M 1 26 L 12 26" />
      <path d="M 12 6 L 12 26" />
      <path d="M 12 16 L 21 16" />
    </g>
    <circle cx="25" cy="16" r="3.4" fill={dark.gold} />
  </QuadroFicha>,
]

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
//
// ⚠️ OS TRÊS CRESCERAM JUNTOS em 06/08 (o número subiu de clamp(26–38) para
// clamp(34–46), a coluna de clamp(46–74) para clamp(54–84)), e crescer junto é
// obrigatório: a coluna precisa caber DOIS DÍGITOS do número, e o trilho se
// alinha pela metade dela. Subir o número sem subir a coluna espreme o "04"
// contra o título ao lado; subir a coluna sem subir o número deixa o algarismo
// boiando no meio de um vão. O `tabular-nums` do <NumeroPasso/> é o que garante
// que os quatro rótulos meçam igual entre si.
export const JORNADA_PADDING = 'clamp(22px, 2.8vw, 32px)'
export const JORNADA_COLUNA = 'clamp(54px, 6.6vw, 84px)'
export const JORNADA_NUMERO = 'clamp(34px, 4.2vw, 46px)'

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
// 2. ⚠️ A FICHA TÉCNICA DO HERO GANHOU MARCA EM 06/08 — ver `MARCAS_FICHA`
//    mais acima. Este item foi mantido porque as duas razões que ele dava
//    CADUCARAM, e quem for reabrir o assunto precisa saber por quê:
//
//    · "o número gigante já é a coisa mais varrível da página, a marca
//      disputaria com ele". Verdade quando o número era Oswald 36px e o rótulo
//      era mono DOURADO. Depois de duas rodadas de alívio o número está em
//      clamp(20,2.2vw,26) e o rótulo em cinza — a ficha deixou de ter ênfase
//      demais e passou a ter ênfase de menos. Medida: 1,25× de razão
//      tipográfica no celular, 0,0% de área não-texto, o pior ponto da página
//      pela régua da auditoria. A marca não disputa com número nenhum; ela é o
//      único peso que sobrou possível, porque subir o tipo recriaria o defeito
//      de 36px;
//    · "qualquer coisa que cresça no hero empurra o formulário para baixo".
//      Deixou de valer quando a ficha foi movida para DEPOIS do formulário no
//      celular. As marcas custam ~30px de altura, e esses 30px caem abaixo do
//      primeiro campo — `primeiroCampo` não se mexe (conferido com
//      scripts/femeas/medir-pagina.mjs).
//
//    O que continua valendo do argumento antigo é o TETO: a marca da ficha não
//    pode crescer até competir com o número. Por isso `LARGURA_FICHA` para em
//    40px e o comentário lá diz o motivo.
// ─────────────────────────────────────────────────────────────────────────
