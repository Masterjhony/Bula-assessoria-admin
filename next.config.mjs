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
    ]
  },
}

export default nextConfig
