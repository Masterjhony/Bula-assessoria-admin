import type { Metadata } from 'next'
import { Obrigado } from '../femeas/_components/Obrigado'
import { GoogleTagManager } from '../femeas/_components/GoogleTagManager'

// Obrigado do lead que NÃO passou na régua de fêmeas. URL própria para separar
// esta conversão da do MQL nas plataformas de mídia — é o gradiente entre as
// duas que ensina o algoritmo a procurar o lead que vale.
//
// ⚠️ Reprovar na régua NÃO descarta o lead: ele entra na fila do SDR igual ao
// outro (ver o cabeçalho de femeas/_lib/qualificacao.ts). Por isso o texto desta
// página confirma e explica o contato, só sem linguagem de prioridade — não pode
// soar como recusa, porque não é.
//
// noindex: página pós-conversão não deve ranquear nem inflar conversão orgânica.
export const metadata: Metadata = {
  title: 'Cadastro recebido | Bula Assessoria',
  robots: { index: false, follow: false },
}

export default function ObrigadoFemeasLeadPage() {
  return (
    <>
      <GoogleTagManager />
      <Obrigado variant="lead" />
    </>
  )
}
