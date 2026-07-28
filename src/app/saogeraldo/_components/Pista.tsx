// 'use client' pelo mesmo motivo que Oferta, SubHero, ProvaSocial e Fecho: não
// é interatividade, é PESO DE HTML. Como componente de servidor, cada estilo
// inline desta seção viaja duas vezes — uma no HTML renderizado e outra, com
// aspas escapadas (3 bytes por aspa), no payload RSC. Medido no HTML da rota:
// a seção custa 12.109 bytes como componente de servidor e 6.926 como cliente.
// O portão 4 (≤78 KB) reprovava por 3.254 bytes e passa com 1.929 de folga
// assim. A seção não tem estado nem evento — o 'use client' aqui é orçamento.
'use client'

import Image from 'next/image'
import { dark, ink, typo, space } from '../_lib/tokens'
import { pista as copy, type NumerosPista } from '../_lib/copy'
import { FICHA } from '../_lib/ficha'
import { Container, Reveal, FioDuplo, Cerimonia, Monumento } from './ui'

// ─── PISTA — a ficha AGREGADA do rebanho ─────────────────────────────────
//
// Esta é a seção que dá substância à página. O resto do site DIZ que a Bula lê
// o catálogo; aqui a leitura aparece. É também o único ataque possível ao
// "muito básico e direto" que o cliente sinalizou: dado real do catálogo é o
// que nenhuma landing concorrente consegue imitar sem fazer o trabalho.
//
// A disciplina que torna isso seguro sem validação do cliente: TODO rótulo
// declara o próprio denominador. Um agregado com denominador explícito não é
// claim novo — é contagem do que o catálogo diz, com a lacuna do parser
// visível na própria frase. Uma falha de leitura pode reduzir o denominador;
// nunca pode inflar o numerador.
//
// Por isso não existe número escrito neste arquivo: todos vêm de `FICHA`, que
// é gerado do catálogo oficial por `scripts/agrega-ficha-saogeraldo.mjs` e tem
// modo `--check` para não deixar a tela e o catálogo se separarem em silêncio.
//
// POR QUE ELA ENTRA EM SEGUNDO, logo depois do Hero: a narrativa passa a ser a
// de um catálogo — o que está sendo vendido → em que condição você compra →
// quem te ajuda → aja agora. Hoje a página pulava de "tem hora marcada" para
// "30x sem juros", que é a sequência de uma oferta, não a de um leilão.

// Foto de AMBIÊNCIA da fazenda, não de lote: o BRIEF proíbe foto e placeholder
// de LOTE, não fotografia do trabalho. Não repete a do Hero de propósito — e é
// a mais leve das quatro do ensaio (218 KB de origem), o que importa porque
// esta é a maior peça de peso do redesign.
const FOTO = '/touros/ensaio/lote-de-cima.webp'

// Faixa sangrada. Deitada (1,6:1 no celular, 3,8:1 no desktop) para ler como
// abertura de catálogo e não como banner. O piso de 240px não é estética: o
// título serifado ocupa duas linhas no celular e precisa assentar no terço de
// baixo, onde a vinheta já está fechada.
const FAIXA = 'h-[clamp(240px,52vw,380px)]'

// Vinheta. O topo fica quase limpo (0.08) porque a queixa nº1 do cliente foi
// foto que ninguém vê; o fundo fecha em 0.97 para o texto assentar e a faixa
// morrer dentro do #0D0D0D sólido, sem costura visível.
//
// A regra de ouro do Hero continua valendo e não foi afrouxada: NENHUM texto
// de corpo sobre foto. O que assenta aqui é só o par eyebrow + título, os dois
// em serifa e os dois em BRANCO — não em dourado. E branco não é gosto, é o
// que o pixel permitiu. Medido no pior pixel do fundo sob cada caixa de texto,
// com o texto escondido e a região fotografada:
//
//   celular 390    eyebrow rgb(89,84,72)   → 6,91:1    título 13,21:1
//   desktop 1440   eyebrow rgb(111,99,90)  → 5,34:1    título  8,95:1
//
// O dourado NESSES MESMOS pixels mediria 3,36:1 no celular e 2,59:1 no
// desktop — reprova AA nos dois. Ornamento não gasta margem de contraste.
const VINHETA =
  'linear-gradient(180deg, rgba(13,13,13,0.08) 0%, rgba(13,13,13,0.22) 34%, rgba(13,13,13,0.86) 62%, rgba(13,13,13,0.97) 100%)'

// Os LIMIARES da avaliação — o corte que dá nome aos campos `iqg.top5`,
// `ce.acima34` e `iabcz.deca1` do FICHA. Não são medida do rebanho: são a
// régua. Estão aqui, e não no JSX, porque `ficha.ts` (gerado e congelado) não
// os exporta como campo — ver o PRECISA no commit.
const CORTES = { iqgFaixaTop: 5, ceLimiar: 34, iabczFaixaDeca: 1 }

// A ponte entre o módulo gerado e a copy: o componente monta os números, a
// copy só formata. É o que mantém `copy.ts` sem um único número factual.
const NUMEROS: NumerosPista = {
  lotes: FICHA.lotes,
  animais: FICHA.animais,
  iqgFaixaTop: CORTES.iqgFaixaTop,
  iqgTop5: FICHA.iqg.top5,
  iqgAvaliados: FICHA.iqg.avaliados,
  idadeMin: FICHA.idade.min,
  idadeMax: FICHA.idade.max,
  idadeNaFaixa: FICHA.idade.naFaixa,
  idadeComDado: FICHA.idade.comDado,
  ceLimiar: CORTES.ceLimiar,
  ceMediana: FICHA.ce.mediana,
  ceAcima: FICHA.ce.acima34,
  ceComDado: FICHA.ce.comDado,
  selosLotes: FICHA.selos.lotes,
  pesoMediana: FICHA.peso.mediana,
  pesoMin: FICHA.peso.min,
  pesoMax: FICHA.peso.max,
  iabczFaixaDeca: CORTES.iabczFaixaDeca,
  iabczDeca1: FICHA.iabcz.deca1,
  iabczAvaliados: FICHA.iabcz.avaliados,
  paisDistintos: FICHA.pais.distintos,
}

// Os quatro monumentos, montados no escopo do módulo: são estáticos, então não
// há motivo para recalcular a cada render. A ordem é a que o plano travou —
// IQG, idade, CE, selos de touro de central.
const MONUMENTOS = copy.rotulos.map((rotulo, i) => ({
  valor: copy.valores[i](NUMEROS),
  rotulo: rotulo(NUMEROS),
}))

export function Pista() {
  return (
    <section className="relative w-full overflow-hidden" style={{ background: dark.bg, color: dark.text }}>
      {/* ── ABERTURA SANGRADA ─────────────────────────────────────────────
          Full-bleed de propósito: é a única quebra de ritmo da página que não
          é troca de superfície. Ela existe para separar a dobra (promessa e
          formulário) do miolo (substância e condições). */}
      <div className={`relative w-full ${FAIXA}`}>
        <Image
          src={FOTO}
          alt={copy.fotoAlt}
          fill
          // Está FORA da dobra e não pode competir com o LCP do Hero, que é a
          // faixa de foto lá em cima. `priority={false}` + lazy é o contrato.
          priority={false}
          loading="lazy"
          sizes="100vw"
          className="object-cover object-center"
        />
        <div aria-hidden className="absolute inset-0" style={{ background: VINHETA }} />

        <div className="absolute inset-x-0 bottom-0 px-5 sm:px-8" style={{ paddingBottom: space.md }}>
          <Container>
            {/* Quem fala aqui é o EVENTO, então a voz é a serifa. Os eyebrows
                de Oferta, SubHero, ProvaSocial e Fecho seguem em Oswald,
                porque ali quem fala é a Bula. */}
            <Cerimonia color={dark.text}>{copy.eyebrow}</Cerimonia>
            <h2
              className="max-w-[760px]"
              style={{ ...typo.aberturaSerif, color: dark.text, marginTop: space.xs }}
            >
              {copy.title}
            </h2>
          </Container>
        </div>
      </div>

      {/* Fio duplo FECHANDO a faixa: dá borda à foto para ela ler como imagem
          POSTA ali, e não como fundo cortado no meio — mesmo raciocínio da
          hairline que fecha a faixa do Hero, um degrau acima de cerimônia. */}
      <FioDuplo />

      <div
        className="px-5 sm:px-8"
        style={{ paddingTop: 'clamp(40px, 6vw, 72px)', paddingBottom: 'clamp(80px, 12vw, 144px)' }}
      >
        <Container>
          <Reveal>
            {/* Corpo em #0D0D0D sólido, onde o greige volta a dar 6,45:1. */}
            <p className="max-w-[720px]" style={{ ...typo.body, fontSize: 17, color: dark.body }}>
              {copy.lead}
            </p>
          </Reveal>

          {/* Fio duplo ABRINDO a ficha. São os dois usos que a §3.3 reserva a
              esta seção — nem um a mais. */}
          <FioDuplo style={{ marginTop: space.xl }} />

          {/* ── O BLOCO DE FICHA ────────────────────────────────────────
              Fundo em `ink.musgoWash` (10%, o teto é 12%): o verde-musgo do
              sistema do catálogo entra como TEMPERATURA, sinalizando "aqui é
              dado técnico", sem virar painel. Sólido ele daria 2,74:1 com o
              corpo greige e reprovaria AA — a 10% sobre #0D0D0D o fundo
              efetivo medido é rgb(16,19,16) e o greige dá 6,20:1 no celular e
              6,15:1 no desktop — contra os 6,45:1 do preto puro.
              O fio de 1px em musgo fecha o bloco por baixo: é o outro uso que
              a §3.4 autoriza para essa cor. */}
          <div
            style={{
              background: ink.musgoWash,
              borderBottom: `1px solid ${ink.musgo}`,
              padding: 'clamp(24px, 3vw, 34px)',
            }}
          >
            <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4" style={{ rowGap: space.xl }}>
              {MONUMENTOS.map((m, i) => (
                <Reveal key={m.rotulo} delay={i * 0.06}>
                  <Monumento valor={m.valor} rotulo={m.rotulo} />
                </Reveal>
              ))}
            </div>

            {/* Linha de apoio: o que é forte demais para cortar e fraco demais
                para virar monumento. Em `muted` e num corpo menor — é nota de
                rodapé de ficha, não argumento. */}
            <Reveal delay={0.24}>
              <p style={{ ...typo.body, fontSize: 14, color: dark.muted, marginTop: space.xl }}>
                {copy.apoio(NUMEROS).join(' · ')}
              </p>
            </Reveal>
          </div>

          {/* Âncora QUIETA de volta ao #cadastro. Sem botão e sem verbo de
              urgência: o CTA alto é da Oferta e do Fecho. Aqui é saída de
              leitura para quem se convenceu pelo dado, não pressão.
              44px de altura mínima porque é alvo de toque. */}
          <Reveal delay={0.3}>
            <a
              href="#cadastro"
              className="inline-flex items-center"
              style={{
                ...typo.monoLabel,
                color: dark.gold,
                marginTop: space.lg,
                minHeight: 44,
                borderBottom: `1px solid ${dark.gold}`,
              }}
            >
              {copy.ancora}
            </a>
          </Reveal>
        </Container>
      </div>
    </section>
  )
}
