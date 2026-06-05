import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = new Set<string>(['/', '/login', '/cadastro', '/reset-senha'])
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

export async function updateSession(req: NextRequest) {
  const host = req.headers.get('host')
  const erp = isErpHost(host)
  const lp = !erp && isLpHost(host)
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
  } else if (lp) {
    // Host lp.* (e bulaassessoria.com) → a raiz "/" serve a página
    // institucional; a agenda de leilões vive em /agenda. Demais caminhos
    // públicos seguem mapeando para /agenda (compat com links antigos).
    // Caminhos canônicos (/institucional, /agenda) passam direto.
    const url = req.nextUrl.clone()
    if (pathname === '/') {
      url.pathname = '/institucional'
      res = NextResponse.rewrite(url, { request: req })
    } else if (
      !pathname.startsWith('/institucional') &&
      !pathname.startsWith('/agenda') &&
      !pathname.startsWith('/criatorios') &&
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
  } else {
    res = NextResponse.next({ request: req })
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supaUrl || !supaKey) return res

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

  return res
}
