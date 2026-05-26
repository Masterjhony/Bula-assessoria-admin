import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function isErpHost(host: string | null): boolean {
  if (!host) return false
  const h = host.toLowerCase().split(':')[0]
  return h === 'erp.localhost' || h.startsWith('erp.')
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host')
  const erp = isErpHost(host)

  let res: NextResponse
  if (erp) {
    const url = req.nextUrl.clone()
    const path = url.pathname
    if (!path.startsWith('/api/') && !path.startsWith('/erp') && !path.startsWith('/_next') && path !== '/favicon.ico' && !path.startsWith('/logo-') && !path.startsWith('/bula/')) {
      url.pathname = `/erp${path === '/' ? '' : path}`
      res = NextResponse.rewrite(url)
    } else {
      res = NextResponse.next()
    }
  } else {
    res = NextResponse.next()
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supaUrl || !supaKey) return res

  const supa = createServerClient(supaUrl, supaKey, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        res.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        res.cookies.set({ name, value: '', ...options, maxAge: 0 })
      },
    },
  })
  await supa.auth.getUser()
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-|bula/).*)'],
}
