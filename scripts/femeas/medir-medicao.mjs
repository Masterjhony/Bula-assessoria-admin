// ─────────────────────────────────────────────────────────────────────────
// O QUE CADA PÁGINA REALMENTE MANDA PARA GA4 E PARA O META.
//
// Este é o teste que descobriu, em 06/08/2026, que as páginas de obrigado de
// fêmeas não convertiam: elas eram indistinguíveis da landing para a medição.
// Depois da correção (femeas/_components/ConversaoObrigado.tsx), é ele que
// prova que voltaram a converter.
//
// COMO ELE FUNCIONA, e por que não precisa de acesso ao GTM: ele não pergunta
// ao GTM o que deveria acontecer — ele abre a página num navegador de verdade e
// ANOTA O QUE SAI PELA REDE. Requisição que não sai não existe, por mais bem
// configurada que a tag pareça no painel.
//
// ⚠️ DUAS ARMADILHAS QUE CUSTARAM TEMPO, e por isso estão tratadas aqui:
//
//   1. O GA4 manda o nome do evento no CORPO do POST quando há mais de um
//      evento na mesma requisição, e não na query. Ler só a query mostra "en"
//      ausente e faz parecer que nada foi enviado.
//   2. O Meta pode nunca chamar `facebook.com/tr`. Filtrar só por esse endereço
//      esconde tudo o mais que o pixel faz — por isso aqui se anota TODA
//      requisição externa.
//
// USO:
//   node scripts/femeas/medir-medicao.mjs                  # local, porta 3000
//   node scripts/femeas/medir-medicao.mjs https://femeas.bulaassessoria.com
//
// ⚠️ Em produção, ele carrega SÓ a landing por padrão. Carregar a página de
// obrigado em produção injeta uma conversão falsa na conta do cliente. Para
// fazer isso de propósito, passe `--incluir-obrigado` e saiba o que está
// fazendo.
// ─────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright'

const base = process.argv.find(a => a.startsWith('http')) ?? 'http://localhost:3000'
const incluirObrigado =
  process.argv.includes('--incluir-obrigado') || base.includes('localhost')

const ROTAS = ['/femeas', ...(incluirObrigado ? ['/obrigado-femeas-mql', '/obrigado-femeas-lead'] : [])]

if (!incluirObrigado) {
  console.log('⚠️  Produção: carregando SÓ a landing, para não injetar conversão falsa.')
  console.log('    Use --incluir-obrigado se essa for a intenção.\n')
}

const navegador = await chromium.launch()

for (const rota of ROTAS) {
  const contexto = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const pagina = await contexto.newPage()

  const ga4 = []
  const meta = []
  const externas = []

  pagina.on('request', req => {
    const url = req.url()
    if (url.startsWith(base)) return
    if (/\.(png|jpe?g|webp|svg|woff2?|css)$/i.test(url)) return

    const { host, pathname } = new URL(url)
    externas.push(`${host}${pathname}`)

    if (url.includes('google-analytics.com/g/collect')) {
      const corpo = req.postData() ?? ''
      const noCorpo = (corpo.match(/en=([^&\s]+)/g) ?? []).map(s => s.slice(3))
      const naQuery = new URL(url).searchParams.get('en')
      ga4.push(...(noCorpo.length ? noCorpo : [naQuery ?? '(sem nome)']))
    }

    if (url.includes('facebook.com/tr')) {
      meta.push(new URL(url).searchParams.get('ev') ?? '(sem nome)')
    }
  })

  await pagina.goto(base + rota, { waitUntil: 'networkidle', timeout: 45000 })
  // 7s: o pixel e o GA4 disparam bem depois do networkidle. Encurtar isto faz o
  // teste devolver "não disparou" para coisa que dispara.
  await pagina.waitForTimeout(7000)

  const dataLayer = await pagina.evaluate(() =>
    (window.dataLayer ?? []).map(item => {
      try { return item.event ?? item[0] ?? '?' } catch { return '?' }
    }),
  )

  console.log(`\n===== ${rota} =====`)
  console.log('  dataLayer :', JSON.stringify(dataLayer))
  console.log('  GA4       :', ga4.length ? JSON.stringify(ga4) : 'NENHUM')
  console.log('  Meta /tr  :', meta.length ? JSON.stringify(meta) : 'NENHUM   ← ver o aviso abaixo')
  console.log('  externas  :', [...new Set(externas)].join(', ') || '—')

  await contexto.close()
}

console.log(`
─────────────────────────────────────────────────────────────────────
COMO LER O RESULTADO

  /obrigado-femeas-mql   deve trazer femeas_mql  no dataLayer E no GA4
  /obrigado-femeas-lead  deve trazer femeas_lead no dataLayer E no GA4
  /femeas                NÃO deve trazer nenhum dos dois

  Se as duas páginas de obrigado mostrarem só "page_view", a conversão
  parou de disparar — provavelmente alguém tirou o <ConversaoObrigado/>.

⚠️ "Meta /tr: NENHUM" era o estado em 06/08/2026 em TODAS as páginas,
   inclusive na landing de produção de touros, e inclusive para o PageView
   que o container manda disparar. Não é consequência do nosso evento.
   Enquanto isso não for resolvido no Gerenciador de Eventos, o GA4 é a
   única medição confiável deste funil.
─────────────────────────────────────────────────────────────────────`)

await navegador.close()
