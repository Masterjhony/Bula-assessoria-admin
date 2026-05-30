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
  return h === 'lp.localhost' || h.startsWith('lp.')
}

export async function updateSession(req: NextRequest) {
  const host = req.headers.get('host')
  const erp = isErpHost(host)
  const lp = !erp && isLpHost(host)
  const pathname = req.nextUrl.pathname

  // Páginas em /sistema/* são servidas sem reescrita mesmo no subdomain
  // ERP. Foi assim que o briefing 2026-05-27 acomodou "Contratos no ERP":
  // a página vive em /sistema/contratos, fica acessível por erp.* e pelo
  // domínio principal — a sessão Supabase atende os dois hosts.
  const isSistemaPath =
    pathname === '/sistema' || pathname.startsWith('/sistema/')

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
    // Host lp.* → tudo é servido a partir de /agenda. A página de leilões
    // já vive em /agenda; aqui só prefixamos as rotas públicas. Caminhos que
    // já começam com /agenda passam direto (links internos canônicos
    // continuam funcionando tanto no subdomínio quanto no domínio principal).
    const url = req.nextUrl.clone()
    if (
      !pathname.startsWith('/agenda') &&
      !pathname.startsWith('/api/') &&
      !pathname.startsWith('/_next') &&
      pathname !== '/favicon.ico' &&
      !pathname.startsWith('/logo-') &&
      !pathname.startsWith('/bula/')
    ) {
      url.pathname = `/agenda${pathname === '/' ? '' : pathname}`
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

  // Protect /sistema and /sistema-legacy (também quando vierem pelo host
  // ERP, ex.: erp.bulaassessoria.com/sistema/contratos via sidebar).
  const isAdminPath =
    isSistemaPath ||
    pathname === '/sistema-legacy' ||
    pathname.startsWith('/sistema-legacy/')
  if (isAdminPath && !user) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // ERP routes (rewritten path starts with /erp) — only login is public.
  // Páginas em /sistema/* atendem o host ERP sem reescrita; o gate de
  // autenticação acima já cobre esse caso.
  if (
    erp &&
    !isSistemaPath &&
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
