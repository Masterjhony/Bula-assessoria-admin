import Image from 'next/image'
import { dark } from '../_lib/tokens'

// ─────────────────────────────────────────────────────────────────────────
// FAIXA DE FOTO — a foto usada como RESPIRO entre blocos de texto, não como
// capítulo.
//
// POR QUE ISTO EXISTE (06/08/2026, terceira rodada de design). O dono revisou a
// página num iPhone e disse "muito texto, sem respiro, pouco visual" pela
// terceira vez. As duas rodadas anteriores mexeram em espaçamento e em traço —
// aliviaram e não resolveram. A medição explica por quê:
//
//   · a página tinha 1.004 palavras e imagem em 16% da área;
//   · TODA a fotografia estava em dois pontos (hero e galeria);
//   · entre a galeria e a faixa de logos corriam ~4.700px de texto contínuo em
//     QUATRO seções seguidas, todas com 0% de imagem.
//
// Não faltava ar (a entrelinha e a medida de linha estavam dentro da régua):
// faltava PROPORÇÃO. A correção é de distribuição, não de espaçamento — a
// mesma quantidade de foto, espalhada, e edge-to-edge em vez de dentro do
// container.
//
// ── FULL-BLEED É O PONTO, e ele vale número ───────────────────────────────
// A galeria antiga ficava dentro do <Container> (máx. 980px) e ainda dentro do
// padding da <Section> (px-5). Num iPhone de 390px isso deixava a foto com
// 350px de largura e duas tiras de near-black nas laterais; em 1440 a foto
// media 980px numa tela de 1440. O `-mx-5 sm:-mx-8` escapa do padding da seção
// e devolve a largura inteira: +11% de área por foto no celular e +47% em 1440,
// sem trocar o arquivo e sem crescer um pixel de altura.
//
// ⚠️ TEM QUE SER FILHO DIRETO DA <Section>, irmão do <Container>. A margem
// negativa só cancela o padding da seção; dentro do Container ela pararia na
// borda dos 980px e o efeito sumiria justamente no desktop. O precedente é a
// faixa de logos da <ProvaSocial/>, que faz igual.
//
// ── A PROPORÇÃO VEM DE FORA (`className`) ─────────────────────────────────
// Porque ela é decisão de RITMO, não da faixa: o mesmo componente serve tanto
// para uma banda larga entre seções quanto para uma célula de mosaico. Quem
// chama declara `aspect-[...]` por breakpoint.
//
// ── ACESSIBILIDADE ────────────────────────────────────────────────────────
// `alt` de verdade, vindo de `_lib/copy.ts` (INV-5). Estas fotos NÃO são
// decorativas: são o material real da fazenda, e a página afirma isso em texto
// ("nenhuma foto de banco de imagens"). Uma faixa com `alt=""` diria a quem usa
// leitor de tela que ali não há nada — e há.
//
// ── DESEMPENHO ────────────────────────────────────────────────────────────
// Sem `priority`: toda faixa está abaixo da dobra, e competir com o LCP do hero
// por banda de rede é como se perde meio segundo no celular.
// ─────────────────────────────────────────────────────────────────────────
export function FaixaFoto({
  src,
  alt,
  className,
  posicao = '50% 50%',
}: {
  src: string
  alt: string
  /** Proporção por breakpoint. Ex.: `aspect-[4/3] sm:aspect-[16/7]`. */
  className: string
  /** `object-position`. Serve para o corte largo não decapitar o animal. */
  posicao?: string
}) {
  return (
    <div
      className={`relative -mx-5 overflow-hidden sm:-mx-8 ${className}`}
      // Fundo de espera no near-black do canvas: se a foto demorar, a faixa já
      // é um divisor válido em vez de um vão claro piscando na página.
      style={{ background: dark.bg }}
    >
      <Image src={src} alt={alt} fill sizes="100vw" className="object-cover" style={{ objectPosition: posicao }} />
    </div>
  )
}
