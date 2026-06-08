# web-bula

Painel administrativo Bula Assessoria — Next.js 16 + React 19 + Supabase. Migração funcional dos módulos do `formula_boi/web-admin`, mantendo o subdomínio `erp.localhost` para o ERP financeiro e `sistema-legacy/` para a SPA HTML original.

## Como rodar

```bash
npm install
npm run dev
```

Sobe em `http://localhost:3000`. Acesse:

- `/` — login (legado HTML estático, `src/app/login.html`)
- `/cadastro` — criação de conta (HTML)
- `/sistema` — **painel admin React (novo)**
- `/sistema-legacy` — SPA monolítica antiga (`sistema.html`, 7415 linhas)
- `/erp` ou `erp.localhost` — ERP financeiro (`erp.html`)
- `/reset-senha` — redefinição de senha

## Build / Produção

```bash
npm run build
npm start
```

## Módulos do painel `/sistema/*`

| Rota | Módulo | Status |
|---|---|---|
| `/sistema` | Dashboard | UI + dados reais (leilões + crm vazio) |
| `/sistema/leiloes` | Leilões (5 sub-páginas: lista, fechamento, vendas/assessor, relatórios, equipe) | **Com dados migrados (184 registros)** |
| `/erp` → Fechamento de Leilões | Tabela financeira por leilão: VGV, faturamento, acordo, receita, comissão, **imposto est. (18%)**, **despesas variáveis** e **lucro líquido** + painel **Acordos por leiloeira** | Restrito a finance-admin |
| `/sistema/projetos` (+/relatorios) | Kanban + Gantt + OKR + Strategy + Whiteboard | UI completa, banco vazio |
| `/sistema/agenda` | Agenda Oficial (eventos internos vinculáveis) | UI completa, banco vazio |
| `/sistema/agendamentos` | Bookings via Calendly→Google Calendar | UI completa, banco vazio |
| `/sistema/okr` | OKR + KR + Risks + Decisions | UI completa, banco vazio |
| `/sistema/contratos` | Upload PDF + status (sem ClickSign — fica só no fórmula) | UI completa, banco vazio |
| `/sistema/analytics` | GA4 + PostHog | UI completa, depende de config |
| `/sistema/ia` | Chat com GLM-4.7 + tool calling | UI completa, AllowedTables ainda aponta fórmula |
| `/sistema/biblioteca-midia` | Supabase Storage + R2 | UI completa, R2 compartilhado |
| `/sistema/users` | CRUD profiles | UI completa |
| `/sistema/settings` | Configurações + atalhos | UI completa |
| `/sistema/whatsapp` | Central WhatsApp (Inbox, Fluxo, Templates, Campanhas, Métricas, Conexão) | UI + schema; VPS Baileys NÃO conectado |
| `/sistema/catalogos-whatsapp` | Detecção de PDFs em grupos | UI + schema; VPS NÃO conectado |
| `/sistema/email` | Central de E-mail | UI completa, SMTP Hostinger |
| `/sistema/crm` | Kanban + qualificação + funis | UI completa, banco vazio |
| `/sistema/leads` | Leads simples | UI completa, banco vazio |

## Migração `formula_boi` → `web-bula`

Resumo do que foi feito (commits `Fase 0` a `Fase 8`):

- **Stack**: Next 14→16.1.4, React 18→19.2.3, Tailwind v4, +dnd-kit, framer-motion, excalidraw, xyflow, googleapis, jspdf, xlsx, posthog, R2, nodemailer, etc.
- **15 migrations Supabase** (`supabase/migrations/0001`..`0015`) consolidando ~30 arquivos `database/*.sql` do fórmula, com FKs para tabelas inexistentes (products, breeders) cortadas e o CRM-leads criado como esqueleto na Fase 6 antes do Central WhatsApp. As mais recentes: `0013` fix de constraint de empresa, `0014` bucket de capas de leilão, `0015` campo `despesas_variaveis` no fechamento.
- **Dados migrados**: apenas Leilões (184 registros — bula_membros, bula_leiloes, bula_leilao_assessores, bula_acordos_criadores, bula_leilao_fechamento, leiloes_equipe, cronograma_leiloes, bula_comissoes_padrao_assessor).
- **Cortes**:
  - **ClickSign**: stubado em `src/app/sistema/actions/contracts.ts` (4 funções throw "ClickSign não disponível"). Continua exclusivo do fórmula.
  - **VPS WhatsApp**: schema + UI prontos, mas o servidor Baileys não está conectado. Usuário vai montar servidor próprio.
  - **products / product_reservations / breeders / reserva_kanban_columns**: tabelas do marketplace fórmula que não existem aqui. Widgets do Dashboard que dependiam disso renderizam zeros.

### Backend (Supabase)

Backend roda em Supabase próprio (`nfjkzigvxegnhaxxbevt`). Cookie HTTP-only via `@supabase/ssr`, dados em Postgres.

Setup:

1. https://supabase.com/dashboard → projeto novo
2. Anote Project URL, anon key, service_role key (Settings → API).
3. No SQL Editor, aplique sequencialmente todas as migrations em `supabase/migrations/`, OU use os scripts abaixo.
4. Authentication → Providers → Email: ative.

Variáveis de ambiente (`.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgresql://...

# Fase 4 (R2 + GA + GLM + PostHog — compartilhados com fórmula por padrão)
GLM_API_KEY=...
GLM_MODEL=glm-4.7
R2_ACCOUNT_ID=...
R2_ENDPOINT=...
R2_BUCKET=...
R2_PREFIX=libmedia/
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
GOOGLE_GA4_PROPERTY_ID=...
NEXT_PUBLIC_POSTHOG_KEY=...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_PROJECT_ID=...

# Fase 5 (SMTP — verificação signup + reset password + email marketing)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=Bula Assessoria <...>
```

### Scripts disponíveis

```bash
# Aplica TODAS as migrations (idempotente — IF NOT EXISTS / OR REPLACE)
node scripts/apply-migration.mjs

# Aplica uma migration específica
node scripts/apply-migration-single.mjs 0012_crm_dashboard.sql

# Migra dados de Leilões do fórmula para o web-bula
# (lê de ../formula_boi/formula_boi/.env.local)
node scripts/migrate-leiloes-data.mjs --dry  # simula
node scripts/migrate-leiloes-data.mjs        # grava (UPSERT)

# Inspeciona schema das tabelas no Supabase do fórmula
node scripts/inspect-source-schema.mjs cronograma_leiloes bula_leiloes
```

### Dados internos (não versionados)

O repositório guarda **apenas código**. Dados financeiros/comerciais reais e
artefatos gerados ficam **locais** (ver `.gitignore`) e não vão para o remoto:

| Padrão | O que é |
|---|---|
| `*.xlsx`, `*.docx` | Planilhas e documentos internos (financeiro, escala) |
| `/RELATORIO-*`, `/relatorios/` | Relatórios gerados (fechamento/financeiro) |
| `/*.pdf` | Catálogos de leilão, contratos (drops na raiz) |
| `/*.png`, `/*.jpg`, `/*.jpeg` | Mídias soltas na raiz (assets do app ficam em `public/`) |
| `/prompt-*.md` | Anotações/prompts de desenvolvimento |
| `scripts/_*` | Scripts de trabalho/scratch e seus dumps |

> Os relatórios de fechamento (ex.: `RELATORIO-FECHAMENTO-MAIO-2026.md`) são
> reprodutíveis a partir do banco — geram-se localmente quando necessário.

### Endpoints API (resumo)

| Grupo | Quantidade | Exemplo |
|---|---|---|
| `/api/bula/auth/*` | 5 | signin, signup, signout, me, forgot, reset |
| `/api/bula/leiloes/*` | 4 | GET/POST + [id] + upload |
| `/api/bula/fechamento/*` | 2 | GET/POST + [id] |
| `/api/bula/cronograma/*` | 2 | GET/POST + [id] |
| `/api/bula/crm/*` | 2 | deals, funis |
| `/api/bula/leads/*` | 2 | GET/POST + [id] (POST = qualifica) |
| `/api/bula/projetos/cards/*` | 2 | GET/POST + [id] |
| `/api/bula/marketing/config` | 1 | GET/PUT singleton |
| `/api/bula/membros` | 1 | GET |
| `/api/leiloes/*` | 4 | equipe, relatórios, catalogo-upload |
| `/api/agendamentos/*` | 4 | + settings + sync (Calendly) |
| `/api/admin/users/*` | 3 | DELETE, reset-password, auth |
| `/api/admin/auth/*` | 2 | send-code, verify-signup |
| `/api/ai/*` | 2 | chat (GLM), test |
| `/api/r2/*` | 5 | upload-url, download-url, delete, list, health |
| `/api/whatsapp/*` | ~17 | central/* (templates, campaigns, flows, inbox, métricas) + inbound + group-* |
| `/api/whatsapp-catalogos/*` | ~10 | groups, detections, active-groups, pause, webhook |
| `/api/email/*` | ~11 | central/* + unsubscribe |
| `/api/erp/*` | 16 | (pré-existente: financeiro/contábil) |

Todas exceto `/auth/*` e webhooks exigem cookie de sessão válido.

## Assets em `public/`

- `logo-bula-remates-branco-_1_.svg`, `logo-bula-remates-preto-_1_.svg`
- `bula/assets/img/login-bg.jpg`
- `icon.svg` (favicon)

## Deploy

Compatível com qualquer host Next.js 16:
- **Vercel**: `vercel deploy` (zero-config)
- **VPS / Node**: `npm run build && npm start` atrás de nginx/caddy
- **Docker**: `node:20-alpine`, copie projeto, install + `next start`

## Coexistência com fórmula

- Os dois sistemas operam em paralelo e **silos independentes** — Supabase próprio do web-bula (`nfjkzigvxegnhaxxbevt`), não compartilha dados com o fórmula (`hghtikjaqixglmpujbwj`).
- Infraestrutura compartilhada por padrão (R2, GLM, PostHog, GA, SMTP, ClickSign — apenas no fórmula). Mude `.env.local` para silos completos.
- Operações no `/sistema/*` do web-bula **NÃO** sincronizam para o fórmula e vice-versa.

## O que falta (próximos passos sugeridos)

- Conectar servidor Baileys próprio para Central WhatsApp + Catálogos
- Adaptar `ALLOWED_TABLES` / `SYSTEM_PROMPT` em `/api/ai/chat/route.ts` para refletir tabelas reais do web-bula (`bula_leiloes`, `cronograma_leiloes`, `tactical_*`, etc.) ao invés de `products`/`breeders` do fórmula
- Decidir destino do `/sistema-legacy` (manter durante adaptação ou remover)
- Configurar Calendly + Google Calendar próprios para Agendamentos (se quiser usar)
- Cadastrar usuários/perfis no Supabase do web-bula
- Trocar paleta/branding se necessário (atualmente: tokens dourado/oliva extraídos do `sistema.html` legado)
