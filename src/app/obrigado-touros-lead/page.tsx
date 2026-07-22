import type { Metadata } from 'next'
import { Obrigado } from '../touros/_components/Obrigado'

// Obrigado do lead NÃO qualificado (não-MQL). URL própria p/ separar a conversão
// da do MQL nas plataformas de mídia.
// noindex: página pós-conversão não deve ranquear nem inflar conversões orgânicas.
export const metadata: Metadata = {
  title: 'Cadastro confirmado | Bula Assessoria',
  robots: { index: false, follow: false },
}

export default function ObrigadoTourosLeadPage() {
  return <Obrigado variant="lead" />
}
