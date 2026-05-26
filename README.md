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

## Backend (Supabase)

O backend roda em Supabase. Auth via cookie HTTP-only (definido pelo `@supabase/ssr` no signin) e dados em Postgres.

### Setup do projeto Supabase

1. Acesse https://supabase.com/dashboard e crie um **novo projeto** separado.
2. Anote: **Project URL**, **anon key** e **service_role key** (Settings → API).
3. No SQL Editor, abra um novo query e cole o conteúdo de [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql). Rode.
4. Em Authentication → Providers → Email, ative **Enable Email** e (opcionalmente) desative **Confirm email** se quiser pular o passo de verificação.

### Variáveis de ambiente

Local (`.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Em produção (Vercel): adicione as três no painel **Settings → Environment Variables** e refaça o deploy.

### Endpoints implementados

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/bula/auth/signin` | login (seta cookie) |
| POST | `/api/bula/auth/signup` | cadastro (cria `profiles` via trigger) |
| POST | `/api/bula/auth/signout` | logout |
| GET | `/api/bula/membros` | lista profiles |
| GET, POST | `/api/bula/leiloes` | listar / criar |
| GET, PUT, PATCH, DELETE | `/api/bula/leiloes/:id` | CRUD individual |
| GET, POST | `/api/bula/projetos/cards` | kanban projetos |
| PUT, PATCH, DELETE | `/api/bula/projetos/cards/:id` | atualizar / remover card |
| GET | `/api/bula/crm/funis` | funis + deals |
| GET, POST | `/api/bula/crm/deals` | listar / criar |
| PUT, PATCH, DELETE | `/api/bula/crm/deals/:id` | atualizar / remover |
| GET, POST | `/api/bula/leads` | listar / criar |
| POST, PUT, PATCH, DELETE | `/api/bula/leads/:id` | qualificar (POST cria deal no funil clientes) / editar / remover |
| GET, PUT | `/api/bula/marketing/config` | investimento marketing (singleton) |

Todas as rotas exceto `/auth/*` exigem cookie de sessão válido — retornam 401 se não autenticado.

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
