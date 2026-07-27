import type { Metadata } from 'next'
import { Obrigado } from '../saogeraldo/_components/Obrigado'
import { GoogleTagManager } from '../saogeraldo/_components/GoogleTagManager'

// Obrigado do lead NÃO qualificado (não-MQL) do Leilão São Geraldo e 7P.
// URL própria p/ separar a conversão da do MQL nas plataformas de mídia.
//
// noindex: página pós-conversão não deve ranquear nem inflar conversões
// orgânicas.
export const metadata: Metadata = {
  title: 'Cadastro confirmado | Bula Assessoria',
  robots: { index: false, follow: false },
}

export default function ObrigadoSaoGeraldoLeadPage() {
  return (
    <>
      <GoogleTagManager />
      <Obrigado variant="lead" />
    </>
  )
}
