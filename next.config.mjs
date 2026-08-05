/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Assets da landing JMP têm hash no nome (index-<hash>.js/.css) → são
        // imutáveis. Cache longo elimina o aviso de "ciclos de cache ineficientes".
        source: '/jmp/assets/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Imagens/ícones estáticos da landing JMP: cache de 1 dia com revalidação,
        // suficiente para conteúdo que muda raramente sem grudar versões velhas.
        source: '/jmp/:path*.(jpg|jpeg|png|webp|svg|ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        // Assets da landing de touros (public/touros/*) e imagens reutilizadas
        // dela (criatórios/institucional): mesmo perfil de cache das da JMP.
        source: '/:dir(touros|criatorios|institucional)/:path*.(jpg|jpeg|png|webp|svg|ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        // Assets da landing do lançamento São Geraldo (public/saogeraldo/*).
        // Regra PRÓPRIA, e não um item a mais na regra do /touros acima: aquela
        // rota está em produção convertendo e não se mexe. Mesmo perfil de
        // cache — 1 dia com revalidação.
        source: '/saogeraldo/:path*.(jpg|jpeg|png|webp|svg|ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        // Assets da landing do perpétuo de fêmeas (public/femeas/*). Regra
        // própria pelo mesmo motivo da do São Geraldo acima: entrar no grupo
        // :dir(touros|...) mexeria numa regex que serve a rota de touros, que
        // está em produção convertendo. O plano da fase 3 pedia o contrário
        // (somar ao grupo), mas o precedente do São Geraldo é o que vale — e é
        // o que o invariante de não tocar em /touros manda.
        source: '/femeas/:path*.(jpg|jpeg|png|webp|svg|ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
    ]
  },
}

export default nextConfig
