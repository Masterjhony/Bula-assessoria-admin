import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = new Set<string>([
  '/',
  '/login',
  '/cadastro',
  '/reset-senha',
  '/privacidade',
  '/termos',
  '/exclusao-de-dados',
])
const PUBLIC_PREFIXES = ['/api/bula/auth', '/_next', '/logo-', '/bula/', '/favicon.ico']

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

function isErpHost(host: string | null): boolean {
  if (!host) return false
  const h = host.toLowerCase().split(':')[0]
  return h === 'erp.localhost' || h.startsWith('erp.')
}

// Subdomínio público da landing de inscrições (SPA estática já buildada em
// public/jmp/, Vite). O host reescreve qualquer caminho para o prefixo /jmp,
// servindo os arquivos do public. O formulário posta em /api/jmp/lead
// (público), por isso /api e /_next ficam de fora do rewrite.
//
// Serve tanto o host histórico jmp.* (jmp.bulaassessoria.com) quanto eao.*
// (eao.bulaassessoria.com) — este último passou a ser o domínio do evento
// atual (13º Mega Evento EAO Baviera). Ambos apontam para a MESMA SPA.
function isJmpHost(host: string | null): boolean {
  if (!host) return false
  const h = host.toLowerCase().split(':')[0]
  return (
    h === 'jmp.localhost' ||
    h.startsWith('jmp.') ||
    h === 'eao.localhost' ||
    h.startsWith('eao.')
  )
}

// Subdomínio PRIVADO adminjmp.* (adminjmp.bulaassessoria.com) — painel que
// gerencia o conteúdo da landing JMP (flyers, galerias, textos, vídeos). Serve
// a rota /adminjmp do app Next, protegida pelo mesmo login do sistema.
function isAdminJmpHost(host: string | null): boolean {
  if (!host) return false
  const h = host.toLowerCase().split(':')[0]
  return h === 'adminjmp.localhost' || h.startsWith('adminjmp.')
}

// Subdomínio público de leilões (lp.* — "landing page" voltada ao cliente).
// Mesma mecânica do ERP: o host reescreve para o prefixo de rota correspondente
// (aqui, /agenda), mantendo as páginas em um único lugar no app.
function isLpHost(host: string | null): boolean {
  if (!host) return false
  const h = host.toLowerCase().split(':')[0]
  return (
    h === 'lp.localhost' ||
    h.startsWith('lp.') ||
    h === 'bulaassessoria.com' ||
    h === 'www.bulaassessoria.com'
  )
}

// Host touros.* → serve a landing pública de venda de touros (/touros).
function isTourosHost(host: string | null): boolean {
  if (!host) return false
  const h = host.toLowerCase().split(':')[0]
  return h === 'touros.localhost' || h.startsWith('touros.')
}

const TOUROS_PUBLIC_PATHS = new Set([
  '/',
  '/touros',
  '/obrigado-touros-mql',
  '/obrigado-touros-lead',
  '/privacidade',
  '/termos',
  '/exclusao-de-dados',
  '/api/touros/lead',
  '/manifest.webmanifest',
  '/favicon.ico',
])
// '/touros/' cobre os assets estáticos da landing (public/touros/ensaio/*) —
// o otimizador do next/image busca o arquivo-fonte por esse path e o redirect
// do middleware quebraria as fotos (308 → /).
const TOUROS_PUBLIC_PREFIXES = ['/_next/', '/jmp/', '/touros/', '/criatorios/', '/icons/', '/logo-']

function isTourosPublicPath(pathname: string): boolean {
  return (
    TOUROS_PUBLIC_PATHS.has(pathname) ||
    TOUROS_PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}

// Host saogeraldo.* → landing do LANÇAMENTO "Leilão Touros São Geraldo e 7P"
// (/saogeraldo). Host próprio, e não um caminho no domínio principal, porque a
// campanha paga aponta para ele e o funil morre em 01/08 — desligar o evento é
// tirar o domínio, sem tocar no perpétuo de /touros.
function isSaoGeraldoHost(host: string | null): boolean {
  if (!host) return false
  const h = host.toLowerCase().split(':')[0]
  return h === 'saogeraldo.localhost' || h.startsWith('saogeraldo.')
}

const SAOGERALDO_PUBLIC_PATHS = new Set([
  '/',
  '/saogeraldo',
  '/obrigado-saogeraldo-mql',
  '/obrigado-saogeraldo-lead',
  '/privacidade',
  '/termos',
  '/exclusao-de-dados',
  '/api/saogeraldo/lead',
  '/manifest.webmanifest',
  '/favicon.ico',
])
// A landing reaproveita as fotos do ensaio de /touros e as logos de criatórios
// em /criatorios — sem esses prefixos o otimizador do next/image busca o
// arquivo-fonte, cai no redirect 308 → '/' e as imagens somem.
const SAOGERALDO_PUBLIC_PREFIXES = [
  '/_next/',
  '/saogeraldo/',
  '/touros/',
  '/criatorios/',
  '/icons/',
  '/logo-',
]

function isSaoGeraldoPublicPath(pathname: string): boolean {
  return (
    SAOGERALDO_PUBLIC_PATHS.has(pathname) ||
    SAOGERALDO_PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}

export async function updateSession(req: NextRequest) {
  const host = req.headers.get('host')
  const erp = isErpHost(host)
  const adminJmp = !erp && isAdminJmpHost(host)
  const jmp = !erp && !adminJmp && isJmpHost(host)
  const lp = !erp && !adminJmp && !jmp && isLpHost(host)
  const touros = !erp && !adminJmp && !jmp && !lp && isTourosHost(host)
  const saoGeraldo =
    !erp && !adminJmp && !jmp && !lp && !touros && isSaoGeraldoHost(host)
  const pathname = req.nextUrl.pathname

  const isSistemaPath =
    pathname === '/sistema' || pathname.startsWith('/sistema/')
  const isLegacyPath =
    pathname === '/sistema-legacy' || pathname.startsWith('/sistema-legacy/')

  // O subdomínio erp.* serve APENAS o ERP financeiro (erp.html). O painel
  // admin React vive em admin.bulaassessoria.com — quem cair em /sistema/*
  // (ou /sistema-legacy/*) por aqui volta para o ERP. O link "Voltar ao
  // sistema principal" no erp.html aponta para o host do admin.
  if (erp && (isSistemaPath || isLegacyPath)) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Build response (with ERP rewrite if applicable, same behavior as before)
  let res: NextResponse
  if (erp) {
    const url = req.nextUrl.clone()
    if (
      !pathname.startsWith('/api/') &&
      !pathname.startsWith('/erp') &&
      !pathname.startsWith('/_next') &&
      !isSistemaPath &&
      pathname !== '/favicon.ico' &&
      !pathname.startsWith('/logo-') &&
      !pathname.startsWith('/bula/')
    ) {
      url.pathname = `/erp${pathname === '/' ? '' : pathname}`
      res = NextResponse.rewrite(url, { request: req })
    } else {
      res = NextResponse.next({ request: req })
    }
  } else if (adminJmp) {
    // Host adminjmp.* → rota /adminjmp do app Next. Tudo que não for API ou
    // asset interno vira /adminjmp<path>. A proteção por login é aplicada
    // abaixo (após getUser): sem usuário, serve o login da raiz.
    const url = req.nextUrl.clone()
    if (
      !pathname.startsWith('/api/') &&
      !pathname.startsWith('/_next') &&
      !pathname.startsWith('/adminjmp') &&
      !(pathname !== '/' && isPublicPath(pathname))
    ) {
      url.pathname = `/adminjmp${pathname === '/' ? '' : pathname}`
      res = NextResponse.rewrite(url, { request: req })
    } else {
      res = NextResponse.next({ request: req })
    }
  } else if (jmp) {
    // Host jmp.* → serve a SPA estática em public/jmp. Tudo que não for API,
    // asset interno do Next ou já-prefixado vira /jmp/<path>. A raiz aponta
    // para o index.html do build.
    const url = req.nextUrl.clone()
    if (
      !pathname.startsWith('/api/') &&
      !pathname.startsWith('/_next') &&
      !pathname.startsWith('/jmp/')
    ) {
      url.pathname = pathname === '/' ? '/jmp/index.html' : `/jmp${pathname}`
      res = NextResponse.rewrite(url, { request: req })
    } else {
      res = NextResponse.next({ request: req })
    }
  } else if (lp) {
    // Host lp.* (e bulaassessoria.com) → a raiz "/" redireciona para /agenda.
    // Demais caminhos
    // públicos seguem mapeando para /agenda (compat com links antigos).
    // Caminhos canônicos (/institucional, /agenda, /leiloes) passam direto.
    const url = req.nextUrl.clone()
    if (pathname === '/') {
      url.pathname = '/agenda'
      res = NextResponse.redirect(url, 308)
    } else if (
      !pathname.startsWith('/institucional') &&
      !pathname.startsWith('/agenda') &&
      !pathname.startsWith('/leiloes') &&
      !pathname.startsWith('/criatorios') &&
      !pathname.startsWith('/habilitacao') &&
      !pathname.startsWith('/api/') &&
      !pathname.startsWith('/_next') &&
      pathname !== '/favicon.ico' &&
      !pathname.startsWith('/logo-') &&
      !pathname.startsWith('/bula/')
    ) {
      url.pathname = `/agenda${pathname}`
      res = NextResponse.rewrite(url, { request: req })
    } else {
      res = NextResponse.next({ request: req })
    }
  } else if (touros) {
    // Host touros.* → landing pública em /touros. Só as rotas necessárias ao
    // funil passam por este host. Qualquer rota do app interno volta para a
    // raiz, impedindo que /sistema ou APIs alheias ao formulário contornem o
    // gate de autenticação pelo domínio público.
    const url = req.nextUrl.clone()
    if (pathname === '/') {
      url.pathname = '/touros'
      res = NextResponse.rewrite(url, { request: req })
    } else if (isTourosPublicPath(pathname)) {
      res = NextResponse.next({ request: req })
    } else {
      url.pathname = '/'
      url.search = ''
      return NextResponse.redirect(url, 308)
    }
  } else if (saoGeraldo) {
    // Host saogeraldo.* → landing do lançamento em /saogeraldo. Mesmo contrato
    // do host de touros: só as rotas do funil passam; qualquer outra volta para
    // a raiz, para que /sistema e as APIs internas não contornem o gate de
    // autenticação por um domínio público de tráfego pago.
    //
    // A raiz é REWRITE (não redirect): o anúncio aponta para
    // saogeraldo.bulaassessoria.com e a URL tem que continuar limpa na barra —
    // um 308 para /saogeraldo sujaria o compartilhamento no WhatsApp.
    const url = req.nextUrl.clone()
    if (pathname === '/') {
      url.pathname = '/saogeraldo'
      res = NextResponse.rewrite(url, { request: req })
    } else if (isSaoGeraldoPublicPath(pathname)) {
      res = NextResponse.next({ request: req })
    } else {
      url.pathname = '/'
      url.search = ''
      return NextResponse.redirect(url, 308)
    }
  } else {
    res = NextResponse.next({ request: req })
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supaUrl || !supaKey) return res

  // Landing pública de touros: sem sessão/gate de login — evita o roundtrip do
  // Supabase em cada pageview de tráfego pago.
  if (touros && isTourosPublicPath(pathname)) return res
  if (saoGeraldo && isSaoGeraldoPublicPath(pathname)) return res

  const supabase = createServerClient(supaUrl, supaKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options)
        )
      },
    },
  })

  // IMPORTANT: do not put logic between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protege /sistema e /sistema-legacy no host do admin
  // (admin.bulaassessoria.com). No host erp.* esses caminhos já foram
  // redirecionados para o ERP acima, então aqui só chegam fora do erp.*.
  const isAdminPath = isSistemaPath || isLegacyPath
  if (isAdminPath && !user) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // ERP routes (rewritten path starts with /erp) — only login is public.
  if (
    erp &&
    !pathname.startsWith('/login') &&
    !isPublicPath(pathname) &&
    !user
  ) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // adminjmp.* — privado. Sem usuário, serve o login da raiz (login.html); ao
  // autenticar ele redireciona para '/', que neste host vira /adminjmp.
  if (
    adminJmp &&
    !user &&
    !(pathname !== '/' && isPublicPath(pathname)) &&
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/_next')
  ) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.rewrite(url, { request: req })
  }

  return res
}
