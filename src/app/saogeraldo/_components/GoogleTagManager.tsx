// ─────────────────────────────────────────────────────────────────────────
// Google Tag Manager — container da landing do Leilão São Geraldo e 7P.
//
// Escopo: montado APENAS nas rotas deste lançamento (a landing /saogeraldo e as
// páginas /obrigado-saogeraldo-*). NÃO carrega no painel admin, ERP ou JMP —
// por isso vive aqui e é incluído ponto a ponto, não no root layout.
//
// MESMO CONTAINER do funil perpétuo (decisão do cliente, 27/07): não se cria
// container novo. A separação entre lançamento e perpétuo é feita DENTRO do
// container, por URL — cada funil tem suas próprias páginas de obrigado, e o
// acionador de conversão casa a URL específica.
//
// Existia aqui uma versão anterior com container próprio e sem default. Ela
// partia de um risco real: o container tem um acionador catch-all (Custom Event
// "Event não contém gtm.") — é por isso que analytics.ts não empurra nada ao
// dataLayer. Mas esse risco já está neutralizado no código, não no container:
// enquanto a landing não fizer push ao dataLayer, o catch-all não tem o que
// disparar. Ver a nota em _lib/analytics.ts antes de reintroduzir qualquer push.
//
// O default é o mesmo do perpétuo, então o deploy funciona sem env nova.
// NEXT_PUBLIC_GTM_ID sobrescreve, e '' desliga o GTM sem quebrar a página.
// ─────────────────────────────────────────────────────────────────────────
import Script from 'next/script'

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? 'GTM-K8RXFDDT'

export function GoogleTagManager() {
  if (!GTM_ID) return null

  return (
    <>
      {/* Snippet oficial do GTM — afterInteractive é a estratégia recomendada
          pelo Next para tags de terceiros: injeta gtm.js sem bloquear o first
          paint. O id é distinto do de touros para os dois poderem coexistir. */}
      <Script id="gtm-base-saogeraldo" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
      </Script>

      {/* Fallback sem JavaScript (GTM noscript). Deve viver no body — como este
          componente é renderizado dentro do layout/página, já está no body. */}
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
        />
      </noscript>
    </>
  )
}
