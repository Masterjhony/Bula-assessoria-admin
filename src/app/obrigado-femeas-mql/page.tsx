import type { Metadata } from 'next'
import { Obrigado } from '../femeas/_components/Obrigado'
import { GoogleTagManager } from '../femeas/_components/GoogleTagManager'
import { ConversaoObrigado } from '../femeas/_components/ConversaoObrigado'

// Obrigado do lead que PASSOU na régua de fêmeas (_lib/qualificacao.ts:
// documento válido + inscrição estadual + quantidade dentro da faixa).
//
// A URL própria é o mecanismo de medição, e a navegação do formulário é hard
// (INV-1) por causa dela — sem load completo, esta página abre e nada é contado.
//
// ⚠️ CORREÇÃO DE 06/08: a URL própria sozinha NÃO estava medindo nada. O
// container publicado não tem acionador de URL para esta página (o único que
// existe aponta para `/obrigado-jmp.html`), então GA4 recebia só `page_view` e
// o Meta não recebia conversão. Quem fecha esse buraco agora é o
// <ConversaoObrigado/>, que empurra o evento `femeas_mql` no dataLayer e cai no
// acionador catch-all do container. Ver TESTE-GTM-2026-08-06.md.
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
      <ConversaoObrigado variant="mql" />
      <Obrigado variant="mql" />
    </>
  )
}
