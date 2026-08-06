import type { Metadata } from 'next'
import { Obrigado } from '../femeas/_components/Obrigado'
import { GoogleTagManager } from '../femeas/_components/GoogleTagManager'
import { ConversaoObrigado } from '../femeas/_components/ConversaoObrigado'

// Obrigado do lead que NÃO passou na régua de fêmeas. URL própria para separar
// esta conversão da do MQL nas plataformas de mídia — é o gradiente entre as
// duas que ensina o algoritmo a procurar o lead que vale.
//
// ⚠️ E o gradiente só existe porque as duas páginas empurram eventos DIFERENTES
// (`femeas_lead` aqui, `femeas_mql` na outra). Sem isso, o Meta veria as duas
// como a mesma coisa — que era o estado até 06/08. Ver TESTE-GTM-2026-08-06.md.
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
      <ConversaoObrigado variant="lead" />
      <Obrigado variant="lead" />
    </>
  )
}
