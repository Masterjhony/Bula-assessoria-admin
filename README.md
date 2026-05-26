# web-bula

Projeto Next.js (App Router) standalone com as páginas de login, cadastro e o sistema interno.

## Estrutura

```
.
├── public/                      # assets estáticos (logos, imagens) — veja public/README.md
├── src/
│   └── app/
│       ├── route.ts             # GET /          -> serve login.html
│       ├── login.html
│       ├── cadastro/
│       │   ├── route.ts         # GET /cadastro  -> serve cadastro.html
│       │   └── cadastro.html
│       ├── sistema/
│       │   ├── route.ts         # GET /sistema   -> serve sistema.html
│       │   └── sistema.html
│       └── api/
│           └── bula/[...slug]/route.ts  # catch-all stub p/ /api/bula/*
├── next.config.mjs
├── package.json
├── tsconfig.json
└── .gitignore
```

## Como rodar

```bash
npm install
npm run dev
```

A aplicação sobe em `http://localhost:3000`.

- `/` -> tela de login
- `/cadastro` -> criação de conta
- `/sistema` -> painel interno

## Build / Produção

```bash
npm run build
npm start
```

## API Backend

As páginas chamam endpoints sob `/api/bula/*` (signin, signup, leilões, CRM, leads, etc.). Por padrão, há um **catch-all stub** em [src/app/api/bula/[...slug]/route.ts](src/app/api/bula/%5B...slug%5D/route.ts) que devolve **501 Not Implemented** com uma mensagem amigável.

Você tem duas opções para deixar a aplicação funcional:

1. **Implementar as rotas localmente** — crie arquivos específicos em `src/app/api/bula/<rota>/route.ts`. Rotas específicas têm precedência sobre o catch-all.
2. **Proxy para um backend externo** — substitua o catch-all por um handler que faz `fetch` para o seu serviço backend, ou configure `rewrites()` em `next.config.mjs`:

```js
// next.config.mjs
const nextConfig = {
  async rewrites() {
    return [
      { source: '/api/bula/:path*', destination: 'https://seu-backend.com/api/bula/:path*' },
    ]
  },
}
```

### Endpoints usados pelo frontend

- `POST /api/bula/auth/signin`
- `POST /api/bula/auth/signup`
- `GET  /api/bula/membros`
- `GET  /api/bula/leiloes`, `PATCH /api/bula/leiloes/:id`
- `GET/POST/PATCH/DELETE /api/bula/projetos/cards`, `/:id`
- `GET/POST/PATCH/DELETE /api/bula/crm/deals`, `/:id`
- `GET  /api/bula/crm/funis`
- `GET/PATCH /api/bula/leads`, `/:id`
- `GET  /api/bula/marketing/config`

## Assets

Coloque os arquivos abaixo em `public/` (veja [public/README.md](public/README.md)):

- `logo-bula-remates-branco-_1_.svg`
- `logo-bula-remates-preto-_1_.svg`
- `bula/assets/img/login-bg.jpg`

## Deploy

Compatível com qualquer host que rode Next.js 14:
- **Vercel** — `vercel deploy` (zero-config).
- **VPS / Node** — `npm run build && npm start` atrás de um reverse proxy (nginx/caddy).
- **Docker** — use a imagem `node:20-alpine`, copie o projeto, instale deps e rode `next start`.

Para apontar para um novo domínio, basta configurar o DNS apontando para o host. Não há referência hard-coded ao domínio antigo no código.
