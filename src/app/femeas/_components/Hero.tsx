import Image from 'next/image'
import { dark, typo, font } from '../_lib/tokens'
import { hero, rodape } from '../_lib/copy'
import { MultiLine } from './ui'
import { LeadForm } from './Formulario'

// ─────────────────────────────────────────────────────────────────────────
// FICHA TÉCNICA — 30x · frete · custo da assessoria.
//
// Renderizada DUAS VEZES no hero, com visibilidade trocada por breakpoint:
// no desktop dentro da coluna de promessa (ancorando o pé dela), no celular
// depois do formulário. Só uma existe por vez — `hidden`/`sm:hidden` é
// `display:none`, então a outra sai também da árvore de acessibilidade e o
// leitor de tela nunca ouve as condições duas vezes.
//
// ⚠️ Duas instâncias em vez de reordenar por CSS (`order`) DE PROPÓSITO: com
// `order` o texto seria lido pelo leitor de tela numa ordem e visto em outra.
// Aqui a ordem do DOM é a ordem da leitura nos dois tamanhos.
//
// O conteúdo continua vindo de `hero.stats` (INV-5): é uma lista só, exibida
// em dois lugares — não duas listas para alguém editar pela metade.
//
// No celular são três linhas (valor à esquerda, rótulo à direita); no desktop,
// grade de três. Nada de três colunas espremidas em 390px, onde "Frete grátis"
// quebraria no meio da palavra.
//
// ── ALIVIADA EM 06/08, depois da revisão do dono em iPhone ──────────────────
// A versão anterior empilhava TRÊS ênfases nas mesmas três linhas: filete acima
// de cada célula, número em Oswald 600 a 24–36px, e rótulo mono em DOURADO
// caixa alta. Três sinais de destaque disputando o mesmo bloco — e um bloco que
// no celular vem DEPOIS do formulário, onde ele é reforço, não argumento.
// Quem chegou ali já viu a promessa; a ficha só confirma as condições.
//
// O que mudou, e o que cada corte alivia:
//
//   · TRÊS filetes viraram UM, acima do bloco inteiro. O filete agora diz
//     "começou a ficha", que é trabalho de abertura; antes ele reticulava cada
//     linha e transformava a ficha em tabela de formulário. Menos traço, mesma
//     ancoragem — o espaço entre as linhas já separa as três.
//   · O número caiu de clamp(24,3vw,36) para clamp(20,2.2vw,26). Não é "fonte
//     menor por leveza": é hierarquia. A 36px ele competia com a manchete de
//     68px do mesmo hero; a 26px ele é claramente subordinado a ela.
//   · O rótulo saiu do DOURADO para o cinza secundário. O dourado é voltagem
//     ÚNICA e escassa nesta linguagem (ver tokens.ts) — gastá-lo em três
//     rótulos de condição comercial enfraquece os lugares onde ele carrega
//     decisão: o eyebrow, o aviso de análise e o botão. `dark.muted` mede ~8:1
//     sobre o near-black, então passa AA nos 11px do rótulo.
//
// ── E O DONO VOLTOU A APONTÁ-LA. O QUE FALTAVA ERA A GEOMETRIA (06/08) ─────
// As três ênfases tinham sido aliviadas, mas o ARRANJO continuava o mesmo, e o
// arranjo era o defeito: `justify-between` jogava o valor na margem esquerda e o
// rótulo na direita, com ~330px de nada entre os dois num iPhone. Medido no
// print: "30x" terminava em x=95 e "NO BOLETO" só começava em x=598.
//
// Isso é uma TABELA DE DUAS COLUNAS, e uma tabela é o que o olho leu — planilha
// de condições, não ficha. Três defeitos, todos do mesmo vão:
//
//   · valor e rótulo são UM dado ("30x no boleto"), e a lei da proximidade diz
//     que o que está junto pertence junto. A 330px de distância eles viram dois
//     dados, e o leitor tem de reatar o par três vezes;
//   · os rótulos alinhados à DIREITA criavam uma segunda margem, ragged do lado
//     esquerdo — a borda serrilhada que faz qualquer bloco parecer formulário;
//   · o vão vazio no meio pedia régua. É o instinto certo diante do arranjo
//     errado: a tabela quer filete porque a tabela não deveria estar ali.
//
// O par agora é BINDADO — valor e rótulo na mesma linha, encostados, com 10px
// entre eles e ambos ancorados na margem esquerda. Lê-se "30x no boleto",
// "Frete grátis sob consulta", "R$ 0 custo da assessoria", que é literalmente
// como a frase é dita em voz alta. Nenhum traço entrou, nenhum saiu, o texto é o
// mesmo e a altura é a mesma (as três linhas já eram três linhas).
//
// ⚠️ `flex-wrap` + `gap-y` não são enfeite: se o usuário aumentar a fonte do
// sistema (Dynamic Type), o rótulo desce para a linha de baixo em vez de espremer
// o valor. Sem isso o "R$ 0 CUSTO DA ASSESSORIA" estoura a 200% de zoom.
//
// ⚠️ NO DESKTOP NADA MUDA — lá a ficha é grade de três, o rótulo já mora sob o
// valor e nunca houve vão. O defeito era exclusivo do arranjo de celular, e foi
// no celular que ele foi revisado.
// ─────────────────────────────────────────────────────────────────────────
function FichaTecnica({ className }: { className: string }) {
  return (
    <div className={className} style={{ borderTop: `1px solid ${dark.hairline}` }}>
      {hero.stats.map((s) => (
        <div key={s.label} className="flex flex-wrap items-baseline gap-x-[10px] gap-y-1 sm:block">
          <span
            style={{
              fontFamily: font.display,
              fontWeight: 600,
              letterSpacing: '-0.015em',
              fontSize: 'clamp(20px, 2.2vw, 26px)',
              lineHeight: 1.1,
              color: dark.text,
              display: 'block',
            }}
          >
            {s.value}
          </span>
          {/* Encostado no valor no celular (os dois são um dado só) e sob ele no
              desktop, onde a grade de três já dá a coluna. Em nenhum dos dois
              casos o rótulo é jogado contra a margem oposta — ver o cabeçalho. */}
          <span
            className="sm:mt-2"
            style={{ ...typo.monoLabel, fontSize: 11, color: dark.muted, display: 'block' }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// HERO — marca · promessa · cadastro na 1ª dobra.
//
// Fork ESTRUTURAL do /touros (logo → kicker → manchete → card do formulário,
// com a ficha técnica ancorando a coluna). O que não é fork é a pele: lá o hero
// é fotográfico e a tipografia divide o palco com a imagem; aqui NÃO HÁ FOTO
// (o material da fazenda só é gravado em 14–15/08, e as fotos existentes no
// repositório são de touro — usar uma delas contradiria a segmentação que esta
// página inteira existe para fazer; ver public/femeas/README.md).
//
// Então o peso foi para onde havia como colocá-lo, e isso é decisão de design,
// não conserto:
//   · manchete um degrau MAIOR que a do /touros, com medida curta (~13ch) para
//     quebrar em 3–4 linhas e virar bloco visual, não frase;
//   · banho radial dourado quase imperceptível saindo do canto superior
//     esquerdo — dá profundidade ao near-black sem glass e sem sombra;
//   · inicial de livery gigante a 5% de opacidade (mesmo recurso do /touros);
//   · ficha técnica ancorando o pé da coluna de promessa — um filete só abrindo
//     o bloco, e o resto separado por ar (ver o cabeçalho de FichaTecnica).
//
// ⚠️ O formulário continua sendo UM SÓ na página inteira (INV-7) e mora aqui, em
// #cadastro. O Fecho e o StickyCta apontam para a âncora; nenhum dos dois
// instancia um segundo <LeadForm/> — duas instâncias duplicariam
// femeas_form_started e o funil deixaria de significar alguma coisa.
// ─────────────────────────────────────────────────────────────────────────

// ── FOTO — ligada em 06/08/2026 ─────────────────────────────────────────────
// O encaixe ficou dormente por uma semana porque não havia foto de fêmea
// utilizável no projeto (a `galeria-femeas` do JMP é de machos, confirmado pelo
// dono). Estas vieram dele, escolhidas a dedo, e são o mesmo lote em pasto:
// animal nítido no centro, sem gente no quadro e — o que reprovou metade do
// material anterior — **sem marca de terceiro**.
//
// As duas bandas são `absolute`, então a foto NÃO empurra o formulário para
// baixo: ela entra atrás do texto, com scrim até o preto sólido. É por isso que
// ligar a foto não custou nenhum pixel do `primeiroCampo` no celular.
//
// ⚠️ Para trocar a foto depois, troque o ARQUIVO em `public/femeas/`, não estas
// constantes — os recortes já estão calibrados para as duas bandas (a do
// celular é em pé, 780×920; a do desktop é paisagem, 1201×801, na resolução
// nativa do original: ampliar não cria detalhe, só peso).
const FOTO_MOBILE: string | null = '/femeas/hero-mobile.webp'
const FOTO_DESKTOP: string | null = '/femeas/hero-desktop.webp'
const temFoto = FOTO_MOBILE !== null || FOTO_DESKTOP !== null

export function Hero() {
  return (
    <section
      id="topo"
      className="relative w-full overflow-hidden"
      style={{ background: dark.bg, color: dark.text, colorScheme: 'dark' }}
    >
      {/* Anel de foco visível (WCAG 2.4.7) para os alvos que NÃO são do
          formulário — o card já tem o próprio anel, com !important, porque
          `inputStyle()` aplica outline:none inline. */}
      <style>{`
        #topo a:focus-visible {
          outline: 2px solid ${dark.gold};
          outline-offset: 3px;
        }
      `}</style>

      {/* Profundidade sem foto: banho radial dourado a 8% saindo do alto à
          esquerda, morrendo antes da metade da tela. É o que impede o
          near-black de ler como fundo chapado de slide. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 78% at 10% -12%, rgba(200,169,110,0.10) 0%, rgba(200,169,110,0.03) 38%, rgba(200,169,110,0) 64%)',
        }}
      />

      {/* Banda fotográfica do MOBILE — dormente. Altura própria (não acompanha a
          altura do formulário) e fade até o preto sólido, para os campos ficarem
          sempre sobre superfície chapada. */}
      {FOTO_MOBILE && (
        <div className="absolute inset-x-0 top-0 h-[clamp(300px,44svh,460px)] lg:hidden">
          <Image src={FOTO_MOBILE} alt={hero.fotoAlt} fill priority sizes="100vw" className="object-cover object-[50%_35%]" />
          {/* ⚠️ O scrim foi FECHADO em 06/08 depois de medir, e o número está
              aqui para ninguém "abrir a foto" de novo sem refazer a conta: com
              o gradiente anterior (0,44 no meio da banda) o eyebrow dourado
              media 2,50:1 sobre a foto — reprova em AA, que pede 4,5:1 para
              texto pequeno. O pelo do Nelore é quase branco; qualquer véu leve
              deixa texto claro sobre fundo claro.
              Medir com: scripts/femeas/ (ou amostrando o pixel do print).

              ⚠️ O PRIMEIRO STOP SUBIU DE 0,72 PARA 0,78 EM 06/08, e é
              consequência direta do reagrupamento do ritmo logo abaixo: ao
              encurtar os vãos do topo, o eyebrow subiu ~14px e entrou numa faixa
              MAIS CLARA do próprio gradiente. Os três números, medidos:

                5,00:1  documentado antes desta rodada
                4,78:1  ritmo novo com o scrim antigo — passa, mas com 0,28 de
                        folga sobre o mínimo, pouco para uma foto trocável
                5,15:1  ritmo novo com o primeiro stop em 0,78   ← hoje

              É a regra desta banda: quem mexe na POSIÇÃO do texto mexe no
              CONTRASTE dele, porque o fundo aqui é um degradê, não uma cor. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(13,13,13,0.78) 0%, rgba(13,13,13,0.82) 26%, rgba(13,13,13,0.90) 62%, rgba(13,13,13,0.97) 84%, #0D0D0D 100%)',
            }}
          />
        </div>
      )}

      {/* Full-bleed do DESKTOP — dormente. Véu base + scrim direcional: a copy lê
          como se estivesse sobre painel escuro e a imagem reaparece do lado do
          card. */}
      {FOTO_DESKTOP && (
        <div aria-hidden className="absolute inset-0 hidden lg:block">
          <Image src={FOTO_DESKTOP} alt="" fill priority sizes="100vw" className="object-cover object-[50%_58%]" />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(13,13,13,0.68) 0%, rgba(13,13,13,0.52) 44%, rgba(13,13,13,0.92) 100%)',
            }}
          />
          {/* ⚠️ O STOP DO MEIO SUBIU DE 0,52 PARA 0,62 EM 06/08 — é o conserto
              de uma REPROVAÇÃO EM AA que estava medida e documentada desde a
              rodada anterior (public/femeas/README.md): o olho do hero no
              desktop media 4,11:1 contra os 4,5:1 que 18px regular exige (18px
              NÃO conta como texto grande — a régua é 24px, ou 18,66px em
              negrito). O pior pixel ficava a 96% da largura do parágrafo, na
              faixa onde este gradiente afinava.

              Das três saídas que o README listou, esta é a que não cobra em
              cima do que o dono aprovou: encurtar a medida do parágrafo reflui
              a coluna inteira e depende do comprimento do texto (que muda);
              clarear o olho para branco contraria a regra da linguagem (corpo é
              cinza editorial, nunca branco — ver _lib/tokens.ts). Fechar o véu
              custa só o pedaço da foto que já está ATRÁS DO TEXTO.

              E o custo é pequeno de propósito: o stop de 74% ficou intocado, e é
              ele que governa o lado direito — que é onde a foto respira e onde o
              animal aparece. Escurece onde tem letra, não onde tem bicho.
              Medido depois: 4,69:1. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(13,13,13,0.86) 0%, rgba(13,13,13,0.62) 46%, rgba(13,13,13,0.18) 74%, rgba(13,13,13,0.28) 100%)',
            }}
          />
        </div>
      )}

      {/* ── O RITMO DA 1ª DOBRA, REAGRUPADO EM 06/08 ─────────────────────────
          Terceira vez que o dono diz que o hero está pesado. O texto está sendo
          encurtado em paralelo; o que se resolve AQUI é o tratamento, e o
          defeito do tratamento era ESPAÇAMENTO UNIFORME.

          Os vãos do celular eram 32 · 56(logo) · 32 · 20 · 24 · 28 · 36. Todos
          na mesma faixa. Vão igual entre tudo não hierarquiza nada: o olho conta
          SEIS paradas de peso idêntico (marca, eyebrow, manchete, olho, aviso,
          card) e a soma disso é o que se sente como "muito texto" — mesmo que
          cada bloco, sozinho, seja curto.

          Os vãos agora agrupam, e a primeira dobra passa a ter QUATRO paradas:

            marca            ·  26 abaixo
            [eyebrow 16 manchete]        ← o eyebrow é a linha de cima da
              manchete, não um bloco à parte: 16 gruda os dois
            olho             ·  24 acima
            [aviso 26 card]  ·  32 acima  ← o aviso fala DO formulário; 32 em
              cima e 26 embaixo o desgruda do olho e o cola no card

          Nada encolheu de tamanho, nada saiu, e a manchete grande que ele
          elogiou está intacta. É só o branco redistribuído — e como sobrou
          branco, o `primeiroCampo` caiu junto, o que é o número que este arquivo
          não pode piorar (scripts/femeas/medir-pagina.mjs).

          ⚠️ Os cortes são de CELULAR. Todo `clamp()` abaixo preserva o teto, e
          onde não havia clamp entrou `sm:` — em 1440 os vãos deste hero são os
          mesmos de antes, porque a queixa foi em iPhone e o desktop já respira.
          ⚠️ Mexer nestes números move o texto dentro do scrim da foto, e o pelo
          do Nelore é quase branco: refazer a medição de contraste
          (public/femeas/README.md) antes de subir. */}
      <div className="relative mx-auto w-full max-w-[1180px] px-5 pb-[clamp(56px,8vw,104px)] pt-6 sm:px-8 sm:pt-10">
        {/* Marca — centralizada e grande, como no /touros (pedido do cliente
            24/07). É o primeiro sinal de que a página não é de um vendedor
            avulso, e num hero sem foto ela carrega mais peso ainda. */}
        <div className="flex justify-center">
          <Image
            src="/logo-bula-assessoria-white.png"
            alt={rodape.marca}
            width={400}
            height={104}
            priority
            className="h-14 w-auto sm:h-20 lg:h-24"
          />
        </div>

        <div className="mt-[clamp(26px,4.6vw,56px)] lg:grid lg:grid-cols-[1fr_minmax(380px,468px)] lg:items-stretch lg:gap-x-[clamp(40px,5vw,80px)]">
          {/* COLUNA DA PROMESSA. No celular ela vem inteira antes do card — e a
              ordem do DOM é a ordem da leitura: kicker → manchete → olho →
              aviso de análise → ficha técnica → formulário. */}
          <div className="relative flex flex-col">
            {/* Inicial de livery: profundidade editorial, não bolha 3D. Só
                aparece quando NÃO há foto — com a imagem no lugar, os dois
                brigariam pela mesma área.
                Fica na METADE DE BAIXO da coluna (top 70%), e não atrás do
                olho: no desktop o card do formulário é bem mais alto que a
                copy, e sobra um vão de algumas centenas de pixels entre o aviso
                de análise e a ficha técnica. É esse vão que a letra ocupa —
                deixá-la atrás do texto só sujava a leitura, e deixar o vão
                vazio fazia a coluna parecer interrompida. */}
            {!temFoto && (
              <span
                aria-hidden
                className="pointer-events-none absolute -left-10 top-[64%] hidden -translate-y-1/2 select-none lg:block"
                style={{
                  fontFamily: font.display,
                  fontSize: 320,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: dark.gold,
                  opacity: 0.045,
                  letterSpacing: '-0.04em',
                }}
              >
                B
              </span>
            )}

            <div className="relative">
              <p className="flex items-center gap-3" style={{ ...typo.eyebrow, color: dark.gold }}>
                <span aria-hidden style={{ display: 'block', width: 22, height: 1, background: dark.gold, flex: '0 0 auto' }} />
                {hero.eyebrow}
              </p>

              {/* Manchete: um degrau ACIMA da do /touros de propósito. Lá a foto
                  divide o palco; aqui ela é o palco. Medida curta força 3–4
                  linhas — o bloco de texto passa a ter massa visual. */}
              {/* `mt-4` no celular gruda o eyebrow na manchete — ele É a linha
                  de cima dela. No `sm:` volta a 20: com a manchete a 68px, 16px
                  de vão espremem os dois. */}
              <h1
                className="mt-4 max-w-[14ch] sm:mt-5"
                style={{
                  ...typo.displayXL,
                  fontSize: 'clamp(38px, 6.2vw, 68px)',
                  lineHeight: 1.02,
                  letterSpacing: '-0.02em',
                  // Equilibra as linhas em vez de deixar a última órfã. Sem
                  // isso a manchete quebrava com "PO." sozinho na terceira
                  // linha, que enfraquece justamente a palavra que carrega a
                  // promessa. Navegador sem suporte só ignora.
                  textWrap: 'balance',
                }}
              >
                <MultiLine text={hero.title} />
              </h1>

              <p
                className="mt-6 max-w-[52ch]"
                style={{ ...typo.body, fontSize: 'clamp(16px, 1.7vw, 18px)', lineHeight: 1.6, color: dark.muted }}
              >
                {hero.lead}
              </p>

              {/* O aviso de que existe análise. Não é rodapé de cortesia: é o
                  filtro trabalhando antes do primeiro campo, e por isso fica
                  logo acima do card no celular.
                  Vai em 15px (não em rótulo mono de 11px, como o /touros faz):
                  é uma frase inteira, e frase inteira em 11px no celular não é
                  lida — a alavanca da página depende dela ser lida. O filete
                  dourado à esquerda dá o destaque que o tamanho pequeno daria. */}
              {/* `mt-8` (era 7): o aviso se desgruda do olho para se colar no
                  card logo abaixo. É o par que ele forma — o aviso explica o
                  formulário, não o parágrafo de cima. */}
              <p
                className="mt-8 max-w-[46ch]"
                style={{
                  ...typo.body,
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: dark.gold,
                  borderLeft: `1px solid ${dark.gold}`,
                  paddingLeft: 16,
                }}
              >
                {hero.ctaNote}
              </p>
            </div>

            {/* No desktop a ficha ancora o pé desta coluna, como sempre. No
                celular ela NÃO aparece aqui — ver a segunda instância, depois
                do formulário. */}
            {/* O `pt` vem DEPOIS do filete do bloco: rasteira de 1px, respiro,
                e só então os três números. É o filete abrindo a ficha, não
                reticulando cada célula. */}
            <FichaTecnica className="hidden sm:mt-auto sm:grid sm:grid-cols-3 sm:gap-x-8 sm:pt-[clamp(28px,3.4vw,44px)]" />
          </div>

          {/* CARD DO CADASTRO — o único formulário da página (INV-7). O guarda
              de merge da Fase 10 conta ocorrências literais de "menor-que form"
              nos componentes e espera exatamente UMA, a de Formulario.tsx; por
              isso este comentário não escreve a tag. O id mora no
              wrapper, que é o elemento pequeno observado pelo StickyCta. Entre
              640 e 1024px o card trava em 560px e centraliza; no lg vira a
              segunda coluna e alinha pelo topo do bloco de promessa. */}
          <div
            id="cadastro"
            style={{ scrollMarginTop: 12 }}
            className="mt-[clamp(26px,4.6vw,56px)] w-full sm:mx-auto sm:max-w-[560px] lg:mx-0 lg:mt-0 lg:max-w-none lg:self-start"
          >
            <LeadForm />
          </div>

          {/* A MESMA FICHA, agora DEPOIS do formulário — e só no celular.
              Não é preferência estética: no celular a primeira dobra era 100%
              texto e o primeiro campo do formulário caía a 950px numa tela de
              844 (o /touros, que é o análogo, faz 633). A ficha valia ~200px
              empurrando o campo para baixo, e ela é argumento de REFORÇO —
              quem já decidiu preencher não precisa dela antes, e quem ainda
              não decidiu lê o filtro logo abaixo, não a tabela de condições.

              O `gap-[20px]` é o que substituiu os filetes entre as linhas: com
              o rótulo mono a 11px e o valor a 20px, vinte pixels de ar separam
              as três condições com folga — o branco entre duas linhas do mesmo
              parágrafo tem menos de 10px, então a distância de grupo é o dobro
              da distância de linha e o olho não confunde. */}
          <FichaTecnica className="mt-[clamp(28px,5vw,40px)] flex flex-col gap-[20px] pt-[22px] sm:hidden" />
        </div>
      </div>
    </section>
  )
}
