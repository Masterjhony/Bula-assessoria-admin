// ─────────────────────────────────────────────────────────────────────────
// Google Tag Manager — container do subdomínio touros.bulaassessoria.com.
//
// Escopo: montado APENAS nas rotas servidas pelo host touros.* (a landing
// /touros e as páginas /obrigado-touros-*). NÃO carrega no painel admin, ERP ou
// JMP — por isso vive aqui e é incluído ponto-a-ponto, não no root layout.
//
// O ID vem de NEXT_PUBLIC_GTM_ID (Vercel) e cai no container atual como default,
// então o deploy funciona mesmo sem a env configurada. Deixar o ID vazio (env
// = '') desliga o GTM sem quebrar a página.
// ─────────────────────────────────────────────────────────────────────────
import Script from 'next/script'

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? 'GTM-K8RXFDDT'

export function GoogleTagManager() {
  if (!GTM_ID) return null

  return (
    <>
      {/* Snippet oficial do GTM (head) — afterInteractive é a estratégia
          recomendada pelo Next para tags de terceiros: injeta gtm.js sem
          bloquear o first paint. */}
      <Script id="gtm-base" strategy="afterInteractive">
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
