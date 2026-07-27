import type { Metadata } from 'next'
import { Obrigado } from '../saogeraldo/_components/Obrigado'
import { GoogleTagManager } from '../saogeraldo/_components/GoogleTagManager'

// Obrigado do lead QUALIFICADO (MQL = ≥100 cabeças + IE) do Leilão São Geraldo
// e 7P. URL própria p/ metas de conversão (Google/Meta) e otimização
// value-based rumo ao lead que vale.
//
// noindex: página pós-conversão não deve ranquear nem inflar conversões
// orgânicas.
export const metadata: Metadata = {
  title: 'Cadastro confirmado | Bula Assessoria',
  robots: { index: false, follow: false },
}

export default function ObrigadoSaoGeraldoMqlPage() {
  return (
    <>
      <GoogleTagManager />
      <Obrigado variant="mql" />
    </>
  )
}
