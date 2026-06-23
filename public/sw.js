// Service worker do PWA Bula Assessoria.
// Estratégia conservadora: este é um sistema administrativo com dados dinâmicos
// (Supabase / server actions), então NÃO cacheamos respostas de navegação nem
// chamadas de API — apenas garantimos instalabilidade + fallback offline e
// cache de assets estáticos imutáveis (ícones / imagens / _next/static).

const VERSION = 'bula-v1'
const STATIC_CACHE = `${VERSION}-static`
const PRECACHE = [
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

// Só lida com GET de mesma origem.
function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navegações: rede primeiro; offline → página de fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html')),
    )
    return
  }

  // Assets estáticos: cache-first com revalidação em segundo plano.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200) cache.put(request, res.clone())
            return res
          })
          .catch(() => cached)
        return cached || network
      }),
    )
  }
})
