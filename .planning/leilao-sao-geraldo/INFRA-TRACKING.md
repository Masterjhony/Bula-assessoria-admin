# INFRA & TRACKING — Leilão Touros São Geraldo e 7P

> Escopo: domínio, deploy, rota de API do lead e GTM. Não cobre UI nem copy.
> Complementa o `BRIEF.md`. Investigação feita em 27/07/2026.

---

## 1. Como `touros.bulaassessoria.com` está configurado hoje

### 1.1 O que foi PROVADO (evidência externa, reproduzível)

**Um único projeto, um único deployment, serve os dois hosts.**
O mesmo `dpl_CzgcSapqWJ9kyTebDP7rqX42jiLF` aparece no HTML de
`touros.bulaassessoria.com/` e de `bulaassessoria.com/agenda`. Um deployment
pertence a exatamente um projeto — logo, **não são dois projetos Vercel**.

**O repositório não contém nenhuma regra de roteamento — em nenhum branch.**
Verificado em `origin/main`, `origin/feat/landing-touros-perpetuo` e
`origin/feat/modulo-clientes`:

| Candidato | Resultado |
|---|---|
| `middleware.ts` / `middleware.js` (entrypoint Next) | **não existe** em nenhum branch |
| `src/utils/supabase/middleware.ts` | existe, mas é helper de sessão — não é entrypoint |
| `next.config.mjs` → `rewrites` / `redirects` | **não existe**; só `headers()` de Cache-Control |
| `vercel.json` → `routes` / `rewrites` / `redirects` | **não existe**; só `crons` |

Confirma o alerta do BRIEF: **o mapeamento é 100% platform-side.**

### 1.2 Comportamento observado por host

Reproduzir com:
`curl -sS -o /dev/null -D - <url> | grep -Ei '^(HTTP/|location:|x-matched-path:)'`

| Host | Path | Resposta | `x-matched-path` |
|---|---|---|---|
| `touros.bulaassessoria.com` | `/` | 200 | **`/touros`** ← rewrite |
| `touros.bulaassessoria.com` | `/obrigado-touros-lead` | 200 | `/obrigado-touros-lead` |
| `touros.bulaassessoria.com` | `/obrigado-touros-mql` | 200 | `/obrigado-touros-mql` |
| `touros.bulaassessoria.com` | `/agenda` | **308 → `/`** | — |
| `touros.bulaassessoria.com` | `/rota-inexistente` | **308 → `/`** | — |
| `bulaassessoria.com` | `/` | 308 → `/agenda` | — |
| `bulaassessoria.com` | `/agenda` | 200 | `/agenda` |
| `bulaassessoria.com` | `/touros` | 404 | `/agenda/[id]` |

**Leitura:** no host `touros.*` existe um **rewrite da raiz para `/touros`** e uma
**allowlist de paths**. `/agenda` existe no app e mesmo assim leva 308 para `/`;
`/obrigado-touros-*` passa. Ou seja, alguém **liberou explicitamente** as páginas
de obrigado. Isso não é efeito colateral — é configuração deliberada, e é o item
mais importante desta investigação (ver §4.1).

### 1.3 DNS

Zona hospedada na **Hostinger**, não na Vercel (`NS: aster.dns-parking.com`,
`helios.dns-parking.com`). **Todo registro novo é criado no painel da Hostinger.**

| Nome | Tipo | Valor |
|---|---|---|
| `bulaassessoria.com` | A | `76.76.21.21` (target legado da Vercel) |
| `www` | CNAME | `bulaassessoria.com` |
| `touros` | CNAME | `b5c073c43bb3d852.vercel-dns-017.com` (target por projeto, esquema novo) |
| `saogeraldo` | — | **não existe** (NXDOMAIN) |

### 1.4 A allowlist, mapeada path a path

Sondagem direta no host `touros.*` (sem acesso à conta). É o molde a replicar:

| Path | Código | Leitura |
|---|---|---|
| `/` | 200 | rewrite → `/touros` |
| `/touros` | 200 | liberado |
| `/obrigado-touros-lead` / `-mql` | 200 | **liberados explicitamente** |
| `/privacidade`, `/termos` | 200 | liberados (links do rodapé) |
| `/api/touros/lead` | 405 | rota alcançada (é POST-only) → **liberada** |
| `/favicon.ico`, `/manifest.webmanifest`, `/logo-*.png` | 200 | estáticos passam |
| `/touros/x.jpg`, `/criatorios/x.png` | 404 | alcançam o app (arquivo é que não existe) → passam |
| `/institucional`, `/leiloes`, `/cadastro`, `/habilitacao`, `/sistema`, `/agenda` | **308 → `/`** | bloqueados |

**Regra:** passa a landing, suas páginas de obrigado, as páginas legais, a rota de
API e os estáticos. Tudo que pertence ao outro app (CRM/ERP/agenda/institucional)
é 308 para a raiz.

### 1.5 O que NÃO consegui determinar, e por quê

A CLI está autenticada como **`jgdosantos`**, time
`joao-gabriels-projects-6e6f42d1` — que tem **zero projetos e zero domínios**.
`vercel domains inspect bulaassessoria.com` retorna *"You don't have access"*.
**O projeto vive em outra conta/time da Vercel.**

Por isso não consigo ler o objeto de configuração por domínio, e resta uma
contradição não explicada que **só quem tem acesso à conta resolve**:

> `src/app/route.ts` em `origin/main` serve `login.html` na raiz. Mas produção
> responde 308 → `/agenda` no apex e rewrite → `/touros` no subdomínio.
> **A produção não se comporta como o código de `origin/main`.**

Hipóteses restantes, em ordem de probabilidade:

1. **O projeto Vercel aponta para outro repo/branch** (ou um Root Directory
   diferente) — o código de roteamento existe lá e não neste repositório.
2. Existe **middleware/rewrite deployado fora do git** (deploy manual via CLI a
   partir de uma árvore local que tinha o arquivo).
3. Configuração de rewrite feita em camada da plataforma não exposta neste repo.

**Isso importa:** se for a hipótese 1, o passo a passo da §2 muda de lugar — o
código da nova landing precisa ir para o repo certo. **Resolver antes de codar UI.**

### 1.6 Diagnóstico decisivo (para o dono da conta)

Três comandos, nesta ordem. O primeiro é o que mais informa:

```bash
# 1) Config por domínio — mostra redirect, redirectStatusCode e gitBranch de cada um.
#    Se `redirect` vier null em touros.*, o mapeamento NÃO é redirect de domínio.
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v9/projects/<PROJECT_ID>/domains?teamId=<TEAM_ID>" | jq

# 2) De qual repo/commit a produção foi construída (testa a hipótese 1).
vercel inspect https://touros.bulaassessoria.com

# 3) Panorama de domínios do projeto.
vercel link && vercel project ls && vercel domains ls
```

Colar a saída dos três aqui fecha a §1 em definitivo.

---

## 2. Passo a passo: servir `saogeraldo.bulaassessoria.com`

> **Nada aqui foi executado.** Mudança de domínio em produção exige autorização
> explícita do dono da conta.

### 2.1 Pré-requisito

Fechar o diagnóstico da §1.6. Se a produção não vier deste repositório, **pare** —
o resto do plano precisa ser reapontado para o repo correto.

### 2.2 Exige ação manual do dono da conta

| # | Onde | Ação |
|---|---|---|
| 1 | Vercel → Project → Settings → Domains | Adicionar `saogeraldo.bulaassessoria.com` |
| 2 | Vercel (mesma tela) | **Copiar o valor de CNAME que a Vercel exibir.** Provavelmente `b5c073c43bb3d852.vercel-dns-017.com` (mesmo target de `touros`, mesmo projeto) — mas **usar o que a tela mostrar**, não este palpite |
| 3 | Hostinger → DNS de `bulaassessoria.com` | Criar `CNAME` — nome `saogeraldo`, valor = passo 2, TTL padrão |
| 4 | Vercel → Domains | Aguardar validação + emissão do certificado (minutos após o DNS propagar) |
| 5 | Vercel | **Replicar o mecanismo do `touros.*`** — rewrite da raiz → `/saogeraldo` e allowlist de paths. O "como" depende da §1.6 |
| 6 | — | **Nenhuma env nova.** O GTM usa `NEXT_PUBLIC_GTM_ID` (mesmo container do perpétuo) |

**Passo 5 é o crítico.** A allowlist do `touros.*` foi mapeada path a path
(§1.4) — o `saogeraldo.*` precisa do equivalente exato:

```
/                              → rewrite para /saogeraldo
/saogeraldo
/obrigado-saogeraldo-lead      ← sem isto a conversão NÃO dispara (§4.1)
/obrigado-saogeraldo-mql       ← idem
/api/saogeraldo/lead           ← sem isto o formulário não submete
/privacidade  /termos          ← links do rodapé; hoje passam no touros.*
/_next/*  /saogeraldo/*        ← assets e imagens
```

### 2.3 Dá para fazer por CLI

A partir de uma conta **com acesso ao projeto**:

```bash
vercel login
vercel link                                                   # vincula o repo ao projeto
vercel domains add saogeraldo.bulaassessoria.com <project>     # passo 1 acima
vercel certs ls                                               # confere o certificado
```

O **DNS (passo 3) não dá por CLI da Vercel** — a zona é da Hostinger, e
`vercel dns add` só opera zonas hospedadas na Vercel.

O **passo 5 provavelmente também não** — depende do mecanismo real.

### 2.4 Verificação pós-configuração

```bash
for p in / /obrigado-saogeraldo-lead /obrigado-saogeraldo-mql; do
  echo "--- $p"
  curl -sS -o /dev/null -D - "https://saogeraldo.bulaassessoria.com$p" \
    | grep -Ei '^(HTTP/|location:|x-matched-path:)'
done
```

Critério de aceite: raiz **200** com `x-matched-path: /saogeraldo`; as duas
páginas de obrigado **200** (qualquer 3xx aqui = conversão quebrada).

---

## 3. Rota de API do lead — IMPLEMENTADA

Arquivo novo: **`src/app/api/saogeraldo/lead/route.ts`**. Fork de
`/api/touros/lead`, que **não foi tocado**.

### O que muda

| Campo | `/api/touros/lead` | `/api/saogeraldo/lead` |
|---|---|---|
| `source` | `touros-perpetuo` | **`leilao-sg7p`** |
| `origem` | `Landing Touros — Funil Perpétuo` | **`Landing Leilão São Geraldo e 7P`** |
| `extra_data.funil` | `touros-perpetuo` | **`leilao-sg7p`** |
| `extra_data.evento` | — | **`leilao-sao-geraldo-7p`** |
| aba da planilha | `LEADS BULA - PERPETUO` | **`LEADS BULA - SAO GERALDO`** |
| host default | `touros.bulaassessoria.com` | **`saogeraldo.bulaassessoria.com`** |

### O que foi preservado, item por item

- Validação server-side de **todos** os campos — UF, faixas de rebanho, momento,
  quantidade de touros, IE, consentimento, nome, WhatsApp, e-mail opcional.
- **MQL decidido no servidor** via `evaluateMql(DEFAULT_JMP_MQL_RULE, …)` —
  ≥100 cabeças **E** inscrição estadual.
- WhatsApp gravado em **`telefone` E `celular`** (o CRM lê `celular`).
- **Mesmo `funnel_id`** (`JMP_FUNNEL_ID`) — os leads caem no board existente.
- Append **best-effort** na planilha (erro do Google não derruba o lead).
- Resposta **`{ id, is_mql }`**.
- Não dispara WhatsApp nem e-mail.

### Mudança de suporte em `src/lib/jmp-sheets.ts`

`appendLeadToPerpetuoSheet` foi generalizada em `appendLandingLeadToTab(tab,
formName, lead)`; `appendLeadToPerpetuoSheet` virou um wrapper que passa
exatamente a aba e o `form_name` de antes — **comportamento do perpétuo
inalterado**. Novo export: `appendLeadToSaoGeraldoSheet`.

**Aba separada, não a mesma:** o cron `syncBulaLeadsToPerpetuoTab()` espelha
leads do Meta **apenas** na aba do perpétuo. Misturar o lançamento ali criaria
interferência entre um evento de janela curta e uma automação permanente.

### Mudanças em `next.config.mjs` — puramente ADITIVAS

O arquivo é compartilhado com `/touros`, que está em produção. **Nenhuma regra
existente foi alterada** — só entraram blocos novos:

1. **Regra de `Cache-Control` própria** para `/saogeraldo/*.(jpg|jpeg|png|webp|svg|ico)`,
   como bloco separado. Deliberadamente NÃO foi adicionada à regra do `/touros`
   (que casa `touros|criatorios|institucional`), para não mexer nela.
2. **Chave `images.remotePatterns` nova** liberando `i.ytimg.com` em `/vi/**` —
   as thumbnails dos lotes. A chave `images` não existia no config, e nenhuma
   rota atual usa imagem remota, então liberar este host não afeta o `/touros`.

**Thumbnails verificadas:** os **100** vídeos da playlist respondem **200** em
`maxresdefault.jpg`. O fallback para `hqdefault.jpg` continua valendo como
defesa (vídeos novos podem demorar a gerar a maxres), mas hoje não é necessário
para nenhum lote existente.

**Estado:** `npx tsc --noEmit` passa limpo. Não foi testado contra Supabase/Sheets
reais — isso depende de deploy.

---

## 4. Plano de GTM

> ⚠️ **DESATUALIZADA — reconciliar com `GTM.md`.** Esta seção foi escrita
> assumindo container próprio. O cliente decidiu (27/07) usar o **mesmo
> container** do perpétuo (conta 6359934056, container 254974309, workspace 10)
> e o **mesmo pixel**, separando os funis por URL de obrigado dentro do
> container. O passo a passo de interface vive em `GTM.md`. Só §4.1 e §4.4
> seguem válidas como estão.

### 4.1 O risco número um

Hoje o container é montado **ponto a ponto**, não no root layout: em
`src/app/touros/layout.tsx` e em cada página `/obrigado-touros-*`. É o que mantém
o GTM fora do admin/ERP/JMP.

A conversão depende de **navegação hard** (`window.location.assign`) para a URL de
obrigado, porque só um load completo dispara o gatilho **Page View** onde a tag do
Meta roda. Combinando isso com a allowlist da §1.2:

> **Se `/obrigado-saogeraldo-lead` e `/obrigado-saogeraldo-mql` não entrarem na
> allowlist do host, elas levam 308 para `/`. O Page View acontece na home, não na
> URL de obrigado, e a conversão nunca dispara — sem erro visível.**

O formulário parece funcionar. O lead entra no CRM. E a mídia não recebe nada.
É a falha mais cara e mais silenciosa deste projeto. Por isso o passo 5 da §2.2
é bloqueante e a §2.4 é obrigatória antes de subir tráfego.

### 4.2 Container: novo, não o atual — recomendado

O container atual (`GTM-K8RXFDDT`) tem um **acionador catch-all** — é a razão
documentada de `analytics.ts` não empurrar nada ao `dataLayer`.

Reaproveitá-lo no novo subdomínio significa que **todo Page View do lançamento
dispararia as tags de conversão do perpétuo**. Resultado: as duas medições ficam
contaminadas, e para evitar isso seria preciso editar tags de um container que
está convertendo em produção agora.

**Recomendação: container novo, dedicado ao lançamento.**

- Isolamento total do catch-all, sem tocar no que está no ar.
- O lançamento é descartável — arquiva-se o container depois de 01/08.
- Custo: reconfigurar Pixel do Meta + GA4 no container novo. O Pixel ID é o
  mesmo; a separação vem pelo **nome do evento**.

Implementação: a nova landing usa seu **próprio** componente
`src/app/saogeraldo/_components/GoogleTagManager.tsx` (fork do de touros), lendo
**`NEXT_PUBLIC_GTM_ID`** (mesmo container). Componente próprio ainda assim, para não editar `touros/` — o de lá
tem o container do perpétuo hardcoded como default e está fora do escopo de
alteração.

Montar em: `src/app/saogeraldo/layout.tsx`, `/obrigado-saogeraldo-lead/page.tsx`
e `/obrigado-saogeraldo-mql/page.tsx` — o mesmo padrão ponto a ponto de hoje.

**Se o cliente exigir container único**, o caminho é: manter `GTM-K8RXFDDT` e
adicionar, em **cada tag de conversão existente**, uma exceção por
`Page Hostname equals touros.bulaassessoria.com`. É mais barato de montar e mais
fácil de errar — cada tag esquecida vira conversão duplicada.

### 4.3 Configuração do container novo

**Variáveis**
- `{{Page Path}}`, `{{Page Hostname}}` (built-in, habilitar).

**Acionadores** — todos do tipo *Page View*, nenhum `dataLayer` custom:

| Acionador | Condição |
|---|---|
| `PV — Obrigado Lead` | `Page Path` **equals** `/obrigado-saogeraldo-lead` |
| `PV — Obrigado MQL` | `Page Path` **equals** `/obrigado-saogeraldo-mql` |
| `PV — Todas (base)` | All Pages — só para o Pixel base e o GA4 config |

**Tags**

| Tag | Aciona em | Evento |
|---|---|---|
| Meta Pixel — base | `PV — Todas (base)` | `PageView` |
| Meta Pixel — conversão lead | `PV — Obrigado Lead` | custom `saogeraldo_lead` |
| Meta Pixel — conversão MQL | `PV — Obrigado MQL` | custom `saogeraldo_mql` |
| GA4 — config | `PV — Todas (base)` | — |
| GA4 — evento lead | `PV — Obrigado Lead` | `generate_lead` (param `funil=leilao-sg7p`) |
| GA4 — evento MQL | `PV — Obrigado MQL` | `generate_lead` (param `funil=leilao-sg7p`, `qualificado=true`) |

**Nomes de evento distintos do perpétuo** (`saogeraldo_*` vs `touros_*`): é o que
permite otimizar campanha do leilão sem herdar histórico do perpétuo.

### 4.4 Regras que continuam valendo — não negociáveis

1. **Navegação hard** (`window.location.assign`) para a URL de obrigado.
   `router.push` não dispara Page View e **quebra a conversão**. Commits
   `d697127` e `e437ed1`.
2. **`analytics.ts` não empurra nada ao `dataLayer`.** O fork da nova landing
   herda isso. Nenhum `dataLayer.push` de micro-evento.
3. **Duas URLs de obrigado separadas** (lead e MQL) — é o que permite valor
   diferenciado de conversão na mídia. O veredito vem do servidor, em `is_mql`.
4. Páginas de obrigado com `robots: { index: false, follow: false }`.

### 4.5 Checklist de validação antes de subir tráfego

- [ ] §2.4 passa: obrigado responde **200**, não 3xx.
- [ ] GTM Preview: submeter o form e confirmar que o Page View da URL de obrigado
      dispara a tag certa — e **só** ela.
- [ ] Meta Events Manager: `saogeraldo_lead` e `saogeraldo_mql` chegando; nenhum
      evento do perpétuo disparando no host novo.
- [ ] Lead no CRM com `source = leilao-sg7p`, no board de sempre, com o WhatsApp
      preenchido no card (valida `celular`).
- [ ] Linha na aba `LEADS BULA - SAO GERALDO`.
- [ ] Um lead ≥100 cabeças + IE cai em `/obrigado-saogeraldo-mql`; um abaixo
      disso cai em `/obrigado-saogeraldo-lead`.

---

## 5. Pendências desta frente

| # | Pendência | Bloqueia | Dono |
|---|---|---|---|
| 1 | Saída do diagnóstico §1.6 | Todo o §2 — e possivelmente onde o código deve morar | Dono da conta Vercel |
| 2 | Autorização para adicionar o domínio | §2.2 | Cliente |
| 3 | Acesso à conta Vercel para a CLI, ou alguém que rode os comandos | §2.3 | Cliente |
| 4 | Decisão container novo vs. único | §4.2 | Cliente / mídia |
| 5 | Acesso ao GTM para criar container e tags | §4.3 | Cliente |
