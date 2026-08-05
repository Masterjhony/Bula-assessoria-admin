import type { Metadata } from 'next'
import { Obrigado } from '../femeas/_components/Obrigado'
import { GoogleTagManager } from '../femeas/_components/GoogleTagManager'

// Obrigado do lead que PASSOU na régua de fêmeas (_lib/qualificacao.ts:
// documento válido + inscrição estadual + quantidade dentro da faixa).
//
// A URL própria é o mecanismo de medição: é o Page View DESTA URL que dispara a
// tag de conversão do Meta no GTM, e é por URL que se separa a conversão de
// valor alto da de valor baixo. Por isso a navegação do formulário é hard
// (INV-1) — sem load completo, esta página abre e nada é contado.
//
// ⚠️ "MQL" aqui NÃO quer dizer aprovado. A régua escolhe a página e o valor da
// conversão; quem aprova o lead para reunião é o SDR, depois, na planilha. O
// texto da página respeita isso (ver femeas/_components/Obrigado.tsx).
//
// noindex: página pós-conversão não deve ranquear nem inflar conversão orgânica.
export const metadata: Metadata = {
  title: 'Cadastro recebido | Bula Assessoria',
  robots: { index: false, follow: false },
}

export default function ObrigadoFemeasMqlPage() {
  return (
    <>
      <GoogleTagManager />
      <Obrigado variant="mql" />
    </>
  )
}
