// 'use client' pelo mesmo motivo que a Pista, e ele é ORÇAMENTO, não
// interatividade: o rodapé passou a importar `FioDuplo` e `Cerimonia`, que vivem
// no lado cliente. Como componente de SERVIDOR o rodapé vira FRONTEIRA, e toda
// a subárvore dele viaja duas vezes — uma no HTML e outra, com as aspas
// escapadas a 3 bytes cada, no payload RSC. Medido no HTML da rota:
//
//   base (HEAD) ............................. 76.069
//   + eyebrow do SubHero e rodapé de servidor 77.125   +1.056
//   + eyebrow do SubHero e rodapé 'use client' 75.435     −634
//
// Dois ornamentos de 5px e uma linha de crédito não custam 1 KB; a fronteira
// custa. Do lado cliente ela some e devolve mais do que o ornamento gasta.
// O rodapé não tem estado nem evento: a diretiva decide só onde cai a costura
// entre servidor e cliente, e o lado barato aqui é o de baixo.
'use client'

import Image from 'next/image'
import { dark, space } from '../_lib/tokens'
import { footer as copy } from '../_lib/copy'
import { FioDuplo, Cerimonia } from './ui'

// Footer — tile escuro, denso e quieto. Logo da Bula (a marca da página) e os
// links legais que o app já serve em /privacidade e /termos.
export function Footer() {
  return (
    // O padding horizontal desceu da <footer> para o miolo. É o que deixa o fio
    // duplo correr de borda a borda: como filho de um <footer> com `px-5`, ele
    // nasceria recuado 20px de cada lado e leria como régua de tabela, não como
    // fecho de página. O `borderTop` de 1px que ele substitui era full-bleed
    // porque borda de caixa fica por fora do padding — um filho, não.
    <footer className="w-full" style={{ background: dark.bg, color: dark.muted }}>
      {/* Fronteira de CERIMÔNIA, e é o último fio da página: o rodapé fecha o
          documento. A fronteira de LISTA continua sendo o `Hairline` de 1px. */}
      <FioDuplo />
      <div className="w-full px-5 sm:px-8" style={{ paddingBlock: space['2xl'] }}>
        <div
          className="mx-auto flex w-full max-w-[1120px] flex-col items-center text-center sm:flex-row sm:justify-between sm:text-left"
          style={{ gap: space.lg }}
        >
          <div className="flex flex-col items-center sm:items-start" style={{ gap: space.sm }}>
            <Image
              src="/logo-bula-assessoria-white.png"
              alt="Bula Assessoria"
              width={132}
              height={40}
              className="h-8 w-auto object-contain"
            />
            {/* O crédito dos vendedores promovido a linha de cerimônia — é o
                terceiro e último lugar onde o EVENTO fala pela serifa. Era o
                único crédito que São Geraldo e 7P têm na página inteira e
                corria como texto de 12,5px ao lado dos links legais; agora
                tem a dignidade que o catálogo dá a eles, dentro do único
                espaço que o BRIEF autoriza — sem disputar a marca da Bula.
                `Cerimonia` já assenta em `muted`, que é a cor que estava aqui:
                a 11–13px o `faint` reprovaria AA (só passa acima de 18px). */}
            <Cerimonia>{copy.criatorios}</Cerimonia>
          </div>

          {/* Os links legais são alvo de toque: `minHeight: 44` é o piso de
              acessibilidade da página, e o padding sozinho não chegava lá. */}
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1" style={{ fontSize: 13 }}>
            <a
              href="/privacidade"
              className="inline-flex items-center px-2"
              style={{ color: dark.muted, minHeight: 44 }}
            >
              Privacidade
            </a>
            <a
              href="/termos"
              className="inline-flex items-center px-2"
              style={{ color: dark.muted, minHeight: 44 }}
            >
              Termos
            </a>
            <span className="px-2" style={{ color: dark.muted }}>
              © {new Date().getFullYear()} Bula Assessoria
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
