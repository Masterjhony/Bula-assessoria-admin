import { light, typo, font, radius } from '../_lib/tokens'
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
// geometria, o mesmo tamanho de título, a mesma cor de CORPO e o mesmo
// espaçamento. A diferença é de MATIZ, e só de matiz. Sem vermelho de alarme,
// sem ícone de proibido, sem "×": quem sai daqui pode ser comprador do outro
// funil da Bula, e o convite para ele está no pé da seção. Qualquer coisa que
// leia como erro custa esse lead duas vezes: perde aqui e não chega lá.
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
// exceto o MATIZ, como sempre foi. Nenhum critério saiu: seguem 5 e 4.
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// O PAR SEMÂNTICO — sim/não em cor TERROSA, não em semáforo de interface.
//
// Pedido do dono em 06/08: "talvez com algo vermelho e verde para dar sentido à
// negação". O diagnóstico dele está certo e a medição confirma: até aqui a única
// diferença entre as colunas era um filete de 40×2px, dourado de um lado e
// cinza do outro — dois traços de 40px numa seção de 1.374px de altura. No
// iPhone eles não existem. A seção lia como dezenove linhas de texto, e nada
// dizia que a segunda metade NEGA a primeira.
//
// ⚠️ MAS NÃO É #22C55E CONTRA #EF4444, e a recusa é comercial, não estética.
// Vermelho de alarme é a cor de erro de formulário: quem se reconhece na coluna
// da direita lê "você foi reprovado" e fecha a aba. Essa pessoa é justamente
// quem a Bula quer no funil de TOUROS — o link de escape no pé desta seção
// existe para ela. Alarme aqui perde o lead duas vezes: não converte aqui e não
// chega lá.
//
// O que carrega o mesmo significado sem o alarme é o par terroso. São as duas
// cores de pasto e barro, e pertencem ao mesmo universo do dourado da marca:
//
//   oliva     #4E5F35  H 84°  S 28%  L 29%   — sálvia/pasto, dessaturado
//   terracota #824D28  H 25°  S 53%  L 33%   — argila queimada/couro
//   (dourado  #6E5A2E  H 41°  S 41%  L 31%   — o acento da marca, para comparar)
//
// Os três têm luminosidade de 29 a 33%: lidos juntos são UMA paleta, não uma
// cor de marca com dois avisos de sistema colados em cima.
//
// ⚠️ AS DUAS LUMINÂNCIAS SÃO CASADAS DE PROPÓSITO — 6,29:1 e 6,23:1 sobre o
// pergaminho (#F5F3EF). A diferença de 0,06 é invisível, e isso é o requisito:
// se a terracota fosse mais escura que a oliva, a coluna do "não" pesaria mais
// na página, que é exatamente o efeito punitivo que a decisão travada proíbe.
// Ao mexer numa das duas, MEXER NA OUTRA e refazer a conta — o par só funciona
// casado. Medidor: scripts/femeas/ + o método do public/femeas/README.md.
//
// ⚠️ E A COR NÃO É O ÚNICO SINAL (WCAG 1.4.1). Quem não distingue as duas — e
// oliva contra terracota é justamente o eixo que a deuteranopia achata — segue
// lendo "É para você se" e "NÃO é para você se", que é o sinal PRIMÁRIO e sempre
// foi. A cor reforça; ela nunca é a portadora. Por isso também não entra ícone:
// o ✓/✗ que "resolveria" o daltonismo é precisamente o vocabulário de aprovado/
// reprovado que não pode aparecer aqui.
// ─────────────────────────────────────────────────────────────────────────
const filtroCor = {
  sim: '#4E5F35',
  nao: '#824D28',
} as const

// ─────────────────────────────────────────────────────────────────────────
// AS DUAS SUPERFÍCIES — uma SALTA, a outra AFUNDA (pedido do dono, 06/08).
//
// "O 'é para você' eu colocaria um card com sombras, um pouco 3D, como se
// estivesse pulando da tela. E o 'não é para você' um pouco afundado."
//
// ⚠️ ISTO REABRE UMA DECISÃO QUE ESTAVA TRAVADA NESTE ARQUIVO — "as duas
// colunas têm tratamento idêntico, a diferença é só de MATIZ". O dono decidiu o
// contrário e a decisão é dele. O que a decisão NÃO libera, e segue proibido:
// vermelho de alarme, ✓/✗, acordeão escondendo a coluna da direita, e qualquer
// coisa que leia como "reprovado". A pessoa que se reconhece à direita é
// comprador do funil de TOUROS, e o link de escape no pé da seção é para ela.
//
// A DIFERENÇA É DE PROFUNDIDADE, NÃO DE TINTA — e isso é literal:
//
//   · o corpo dos critérios continua em `light.body` NOS DOIS lados;
//   · os dois títulos continuam no mesmo tamanho, peso e geometria;
//   · os algarismos continuam idênticos;
//   · nenhuma palavra muda de cor.
//
// O que muda é a superfície DEBAIXO do texto. Medido sobre o pergaminho:
//
//   sim   #FFFFFF   sombra projetada, borda de 1px       corpo 9,0:1
//   não   #EDEAE2   sombra INTERNA, mesma borda          corpo 7,5:1
//
// ⚠️ POR QUE A BORDA DE 1px CONTINUA EM CIMA DOS DOIS, inclusive do branco:
// a auditoria mediu que #FFFFFF sobre #F5F3EF dá 1,1:1 — no brilho de um iPhone
// ao sol o card branco SOME e sobra a sombra flutuando. Sombra não é borda: ela
// desaparece no reflexo antes da borda desaparecer. Ou o card tem os dois, ou
// ele é um retângulo fantasma.
//
// ⚠️ E POR QUE O CARD PODE VOLTAR, se ele saiu HOJE de manhã pelo mesmo dono
// ("caixa dentro de caixa, o olho lia formulário"): o que lia como formulário
// eram DUAS caixas iguais mais SETE filetes separando critérios dentro delas —
// dezesseis traços numa seção de nove frases. Os sete filetes internos não
// voltam. Voltam duas superfícies, com espessura diferente uma da outra, e é a
// diferença entre elas que carrega significado. Caixa que informa não é a
// mesma coisa que caixa que só emoldura.
// ⚠️ OS DOIS NÚMEROS ABAIXO FORAM CORRIGIDOS NA AUDITORIA DA MESMA NOITE, e os
// dois erros valem ser lidos porque são o tipo que passa despercebido:
//
//   1. A BORDA ERA rgba(26,20,10,0.08) E NÃO EXISTIA. Sobre o branco ela media
//      1,06:1 — MENOS que o próprio card branco contra o pergaminho (1,11:1).
//      Ou seja: o comentário aqui dizia que a borda salvava o card do sumiço no
//      sol do iPhone, e a borda era mais invisível que o problema que ela
//      resolvia. A 0,14 ela mede ~1,20:1 e passa a ser a aresta mais visível
//      das duas, que é o trabalho dela.
//   2. A SOMBRA INTERNA ERA 0,12 E PESAVA DEMAIS. Ela desenhava uma barra de
//      12px a 1,34:1 no topo do card do "não", contra 1,06:1 no topo do card do
//      "sim" — 0,28 de diferença onde o limite para não ler como carimbo é
//      ~0,10. A 0,08 o rebaixo continua legível e a barra cai para dentro da
//      faixa. Afundar é direcionamento; carimbar no topo é veredito.
// ⚠️ CANTO ARREDONDADO E SOMBRA MAIS FORTE — pedido do dono, 06/08 à noite:
// "coloque borda arredondada e um pouquinho mais de sombra". O raio mora em
// `radius.card` (tokens.ts) e é a ÚNICA exceção ao canto reto da página; o
// aviso de por que ele não deve virar hábito está lá.
const superficie = {
  alta: {
    background: '#FFFFFF',
    border: '1px solid rgba(26,20,10,0.14)',
    borderRadius: radius.card,
    // Duas sombras: a larga e difusa dá a altura, a curta e fechada dá o
    // contato. Sombra única lê como adesivo; duas leem como objeto.
    // Subiram um degrau (de 0,42/0,22 para 0,50/0,28, e o raio de 40 para 52):
    // com canto arredondado a silhueta perde a aresta dura que segurava a borda
    // do card, e a sombra passa a ser o que define onde ele termina.
    boxShadow: '0 28px 52px -24px rgba(26,20,10,0.50), 0 8px 18px -10px rgba(26,20,10,0.28)',
  },
  baixa: {
    background: '#EDEAE2',
    border: '1px solid rgba(26,20,10,0.14)',
    borderRadius: radius.card,
    // Sombra INTERNA no topo + fio de luz de 1px embaixo dela: é o desenho de
    // um rebaixo. Sem o fio de luz a sombra interna lê como sujeira.
    //
    // ⚠️ ESTA NÃO ACOMPANHOU O AUMENTO DA OUTRA, e é de propósito. A auditoria
    // mediu que a inset a 0,12 desenhava uma barra escura de 12px no topo deste
    // card — 1,34:1 contra 1,06:1 no topo do card de cima, quando o limite para
    // não ler como carimbo de reprovação é ~0,10 de diferença. "Um pouquinho
    // mais de sombra" no card que AFUNDA é justamente o que o transforma em
    // veredito. O canto arredondado já ajuda aqui: a barra vira uma curva.
    boxShadow: 'inset 0 3px 10px rgba(26,20,10,0.09), inset 0 1px 0 rgba(255,255,255,0.5)',
  },
} as const

function Coluna({
  titulo,
  itens,
  cor,
  relevo,
}: {
  titulo: string
  itens: CriterioFiltro[]
  cor: string
  relevo: keyof typeof superficie
}) {
  return (
    // ⚠️ `overflow: hidden` para o filete de 2px poder encostar nas três bordas
    // do card sem escapar pelo canto. E `height: 100%` para as duas colunas
    // terminarem na mesma linha no desktop: card com altura sobrando de um lado
    // é o que faria a coluna mais curta parecer "incompleta".
    <div style={{ ...superficie[relevo], height: '100%', overflow: 'hidden' }}>
      {/* O filete passou de 40px para a LARGURA DA COLUNA, e continua com os
          mesmos 2px de espessura — o número de traços da seção não mudou (eram
          dois, são dois). O que mudou é o trabalho dele: a 40px ele era um tique
          decorativo; na largura inteira ele DELIMITA a coluna, que é a segunda
          queixa do dono ("não se veem duas colunas").
          Agora ele é a ARESTA DE CIMA do card — fora do padding, encostado nas
          bordas. É a única cor que sobra em cada superfície. */}
      <div aria-hidden style={{ width: '100%', height: 2, background: cor }} />
      <div className="p-[clamp(20px,3.6vw,32px)]">
      {/* ── O TÍTULO DA COLUNA SUBIU DE 12px MONO PARA OSWALD (06/08/2026) ──
          Este era o defeito mais barato de consertar da página inteira. A
          seção tem NOVE frases de 16px seguidas e dois rótulos de 12px; num
          iPhone, os dois únicos marcos da estrutura mediam menos que o texto
          que eles organizam, e o filtro — a seção que existe para
          desqualificar — lia como um bloco só. Não se viam duas colunas: viam-
          se dezenove linhas.

          Oswald 20–26px devolve à seção os dois marcos que ela já tinha na
          estrutura e não tinha na tela. Não entra um traço, não entra uma
          caixa e não entra uma palavra: é a mesma copy, com a hierarquia que a
          copy já supunha.

          ⚠️ 20px no celular contra os 27px do <Titulo/> da seção: a distância
          entre h2 e h3 tinha que continuar visível. Empatar os dois faz a
          coluna competir com o título da seção, e a hierarquia piora em vez de
          melhorar.

          ⚠️ E O TRATAMENTO CONTINUA IDÊNTICO NOS DOIS LADOS. Mesmo tamanho,
          mesmo peso, mesmo espaçamento, mesma luminosidade. A única diferença
          entre as colunas é o MATIZ — ver o par semântico no topo deste arquivo.

          ⚠️ POR QUE O TÍTULO TAMBÉM RECEBE A COR, e não só o filete: 2px de cor
          numa coluna de ~690px de altura não afirmam nem negam nada — foi
          exatamente o que o dono não conseguiu ver. O título é o único elemento
          da coluna que a pessoa lê ANTES dos critérios, e é nele que a palavra
          "NÃO" já está escrita: pintar a palavra da cor faz a cor e o texto
          dizerem a mesma coisa, no mesmo lugar, ao mesmo tempo. Se o daltonismo
          derruba a cor, sobra a palavra — que continua sendo o sinal primário.

          ⚠️ O corpo dos critérios NÃO recebe cor e não pode receber: são 9
          frases de 16px, e texto colorido em bloco vira aviso de sistema. A cor
          vive no marco (filete + título), o corpo segue em `light.body` nos dois
          lados. */}
      {/* ── O TÍTULO SUBIU AO POSTO DE MANCHETE (auditoria de 06/08) ────────
          Era `clamp(20px, 2.4vw, 26px)`, travado ali para "não competir com os
          27px do <Titulo/> da seção". **A auditoria derrubou esse travamento**:
          no celular o `<h2>` da seção e este `<h3>` NUNCA dividem a tela — o
          título da seção fica no topo e o "NÃO é para você se" nasce em y=887,
          119px abaixo da dobra útil. A competição que a regra evitava só existe
          no desktop, e lá o clamp do `<h2>` sobe até 44px enquanto este para em
          34px: a distância continua. */}
      <h3
        style={{
          fontFamily: font.display,
          fontWeight: 600,
          fontSize: 'clamp(26px, 3vw, 34px)',
          letterSpacing: '-0.015em',
          lineHeight: 1.12,
          color: cor,
          marginTop: 16,
        }}
      >
        {titulo}
      </h3>
      {/* ── ALGARISMO POR CRITÉRIO (auditoria de 06/08) ─────────────────────
          O diagnóstico que motivou isto: existe uma regra que TODA seção desta
          página obedece menos o filtro — ou ela quebra 2,0× de razão tipográfica
          (maior tipo ÷ corpo de 16px), ou carrega ≥3% de área não-texto.
          Categorias passa por escala (2,50×, e não tem imagem nenhuma);
          assessoria passa por diagrama (3,0%). O filtro fazia 1,69× e 0,0% — o
          único sem nenhum dos dois. Não era o mais DENSO da página (127
          palavras/1000px contra 315 das categorias); era o mais MONÓTONO.

          O algarismo é o dispositivo que o dono já aprovou DUAS vezes aqui
          (categorias e jornada), e resolve as duas coisas de uma vez: leva a
          razão acima de 2,0× e cria nove âncoras de varredura numa seção que
          antes era prosa corrida.

          ⚠️ POR QUE ELE RECEBE A COR DA COLUNA: a auditoria mediu que os dois
          filetes semânticos somam 0,26% da área da seção — a cor estava
          tecnicamente correta (6,29:1 e 6,23:1) e sumia por FALTA DE ÁREA. Nove
          algarismos grandes multiplicam a presença do par oliva/terracota sem
          colorir uma única palavra de corpo (texto de corpo colorido em bloco
          vira aviso de sistema).

          ⚠️ DOIS DÍGITOS SEMPRE, `tabular-nums`, coluna de largura fixa. É a
          lição medida dos pictogramas que foram removidos: seis desenhos de
          larguras 111/64/100/100/146/100px alinhados à direita produziram uma
          borda serrilhada que o dono leu como "desconfigurado". Algarismo de
          largura travada não tem esse defeito por construção.

          ⚠️ E O TRATAMENTO SEGUE IDÊNTICO NOS DOIS LADOS — mesmo tamanho, mesma
          luminosidade, mesma geometria. Numerar não ordena mérito: são índices
          de leitura, como os das categorias, não um ranking de gravidade. */}
      <ul style={{ listStyle: 'none', padding: 0, margin: '22px 0 0' }}>
        {itens.map(({ criterio, explicacao }, i) => (
          <li
            key={criterio}
            className="femeas-filtro-item grid gap-x-4"
            style={{ gridTemplateColumns: 'clamp(38px, 4.6vw, 52px) 1fr' }}
          >
            <span
              aria-hidden
              style={{
                fontFamily: font.display,
                fontWeight: 600,
                fontSize: 'clamp(32px, 3.6vw, 38px)',
                lineHeight: 1,
                letterSpacing: '-0.02em',
                color: cor,
                fontVariantNumeric: 'tabular-nums',
                // Sobe o algarismo até a linha de base da primeira linha do
                // critério: sem isto ele flutua ~6px acima do texto, porque
                // Oswald em 32px tem altura de linha maior que Inter em 16px.
                marginTop: 2,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{ ...typo.body, fontSize: 16, lineHeight: 1.6, color: light.body }}>
              {criterio}
              {/* UM nó de texto por critério, partido em dois. `display:none` no
                  celular tira a segunda oração da tela E da árvore de
                  acessibilidade — o leitor de tela do celular ouve a versão
                  curta, não as duas. A alternativa (dois blocos completos, um
                  escondido) faria o leitor ler o critério duas vezes. */}
              {explicacao && <span className="femeas-filtro-explica"> {explicacao}</span>}
            </span>
          </li>
        ))}
        </ul>
      </div>
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
          a mesma, e a única diferença entre elas é o MATIZ do filete e do
          título — com a luminosidade casada, para nenhuma das duas pesar mais
          que a outra. Nada de vermelho de alarme, ✗ ou acordeão escondendo a
          coluna da direita — filtro que a pessoa precisa abrir para ler não
          filtra ninguém. */}
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
            {/* Oliva à esquerda e SALTANDO da página; terracota à direita e
                AFUNDADA nela (dono, 06/08). A conta das duas superfícies e o
                que continua proibido estão no bloco `superficie`, acima. */}
            <Coluna titulo={paraQuem.simTitle} itens={paraQuem.sim} cor={filtroCor.sim} relevo="alta" />
            <Coluna titulo={paraQuem.naoTitle} itens={paraQuem.nao} cor={filtroCor.nao} relevo="baixa" />
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
