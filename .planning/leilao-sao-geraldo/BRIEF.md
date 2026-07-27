# BRIEF — Landing de Lançamento: Leilão Touros São Geraldo e 7P

> Fonte única de verdade para todos os agentes deste projeto.
> Tudo que está aqui foi **extraído do material do cliente** ou **decidido pelo cliente**.
> O que ainda não foi confirmado está marcado **[PENDENTE]**. Não invente dado de evento.

---

## 1. O que é

Landing page de **lançamento único** (um leilão), separada do funil perpétuo `/touros`.
Objetivo comercial único: **captar lead qualificado** para o leilão, via formulário → CRM → WhatsApp do assessor.

**Marca da página: BULA ASSESSORIA.** São Geraldo e 7P Agro são os *vendedores/criatórios* do leilão
e aparecem como tal (prova, origem dos lotes), **não** como marca da página. Logo, cores, tom e rodapé
são da Bula. Isso é requisito explícito do cliente.

---

## 2. Dados do evento (extraídos do PDF do catálogo)

Arquivo fonte: `Leilão Touros São Geraldo e 7P (CAT VIRTUAL).pdf` — 138 páginas, InDesign, gerado em 24/07/2026.
Texto extraído: `.planning/leilao-sao-geraldo/catalogo-raw.txt`

| Campo | Valor |
|---|---|
| Evento | Leilão Touros São Geraldo e 7P |
| Data | **01 de agosto**, sábado, **12h** |
| Ano | 2026 (01/08/2026 cai num sábado; PDF gerado em 24/07/2026) — **[PENDENTE] confirmar com o cliente** |
| Formato | Catálogo **virtual** |
| Vendedores | Fazenda São Geraldo / 7P Agro |
| Site do criatório | www.fazendasaogeraldo.com.br |
| Raça | Nelore PO |
| Lotes | **134 lotes** (contagem real do parser, não estimativa); alguns têm mais de um animal. Dados estruturados em `.planning/leilao-sao-geraldo/lotes.json` |
| Sexo | **100% MACHO.** Zero fêmeas/matrizes no catálogo |
| Idade dos animais | maioria 21–24 meses (nasc. 2024); há lotes mais velhos (ex.: 48 meses) |
| Local físico / transmissão | **[PENDENTE]** — não consta no PDF. Precisa do cliente: praça do leilão e canal de transmissão |
| Leiloeira responsável | **[PENDENTE]** — não consta no PDF |

### Condições de pagamento (literal do catálogo)
- **30 parcelas** — estrutura `2+2+2+2+2+20`
- **10% de desconto** para pagamento à vista
- **4% de desconto** para pagamento em 12 parcelas (`1+11`)
- **Acima de 4 lotes**: pagamento em `1+29` parcelas

### Condições de frete (literal do catálogo)
- **Frete grátis**, qualquer quantidade — faixa de estados A
- **Frete grátis a partir de 2 lotes** — faixa de estados B
- **Frete sob consulta** — demais
- **Não é possível a entrega** em parte do Norte
- Observação do catálogo: *"dentro da malha rodoviária asfaltada"*
- **[PENDENTE]** O mapa do PDF é vetorial; a divisão exata UF→faixa precisa ser lida do mapa
  visualmente antes de virar tabela/componente. **Não deduzir por geografia.**

### Dados por lote disponíveis no catálogo
Nome, RG, data de nascimento, idade em meses, sexo, pedigree (pai/mãe/avós), selos
("MÃE de TOURO DE CENTRAL", "AVÓ de TOURO DE CENTRAL"), percentual à venda (ex.: 50%),
peso e CE (circunferência escrotal) em parte dos lotes, link "clique para ver o vídeo do lote",
e três blocos de índices: **DEP/TOP%** (IQG, P120-EMg, PD, PS, PES, IPP, HP/STAY, AOL, EGS),
**iABCZ/DECA/P%** (PM-EM, PD-ED, PA-ED, PS-ED, PE-365, IPP, STAY, AOL, PN-ED) e
**MGTe/TOP%** (MP120, DP210, DP450, DPE365, D3P, DSTAY, DAOL, DACAB).

---

## 3. Decisões travadas com o cliente (27/07/2026)

1. **Sem campo touro/matriz.** O catálogo é 100% touros; a página e o formulário são
   100% touros, iguais em escopo ao `/touros`. O campo de segmentação foi **removido do escopo**.
2. **Domínio: `saogeraldo.bulaassessoria.com`** (subdomínio próprio, espelhando o padrão de
   `touros.bulaassessoria.com`).
3. **Abordagem: fork do `/touros` e adaptar.** Reusa Hero, formulário multi-step, tokens,
   GTM, rota de API e integração de CRM. Adapta para evento único.
4. **CRM: `source` próprio** para este lançamento, mantendo o mesmo funil/board.
   Permite medir o lançamento isolado sem poluir o perpétuo.

---

## 4. Pendências — resolvidas com o cliente em 27/07

### ✅ RESOLVIDO — Vídeos dos lotes (playlist do YouTube)
O link **é válido**. O ID curto (`PLSXxcyjph-gA`) é legítimo — o alerta anterior sobre
tamanho de ID estava errado. Playlist: **"LEILÃO TOUROS SÃO GERALDO E 7P AGRO (01/08)"**.
**Cada vídeo é um lote.**

Playlist enumerada e versionada em `.planning/leilao-sao-geraldo/playlist-lotes.txt`
(formato `índice|videoId|título`, gerada com `yt-dlp --flat-playlist`).

- **100 vídeos**, todos no padrão de título `LOTE N` — nenhum título fora do padrão, nenhum duplicado.
- 3 lotes especiais: **LOTE 1000, 2000, 3000**.
- 97 lotes regulares na faixa 1–100.

#### ⚠️ CORREÇÃO (27/07) — existe uma SEGUNDA fonte de vídeo, melhor que a playlist
O PDF tem **hyperlinks embutidos** por lote (o "CLIQUE PARA VER O VÍDEO DO LOTE"). O parser os
extraiu no campo `videoIdCatalogo`. A cobertura real é muito maior do que a playlist sugeria:

| Fonte | Lotes cobertos |
|---|---|
| Playlist do YouTube (`videoId`) | 100 de 134 |
| Links embutidos no PDF (`videoIdCatalogo`) | **132 de 134** |
| **Sem vídeo em nenhuma fonte** | **apenas 2 — lotes 52 e 107** |

**Divergência entre as duas fontes: zero.** Onde ambas existem, o ID é idêntico — o que dá
confiança alta nos links do PDF. Amostra validada contra o YouTube: os lotes 101, 102 e 103
resolvem para vídeos reais intitulados `LOTE 101`, `LOTE 102`, `LOTE 103`.

> **Regra de resolução do vídeo:** usar `videoId` (playlist) quando existir, senão
> `videoIdCatalogo` (PDF). Só os lotes **52 e 107** ficam sem vídeo e, portanto, sem thumbnail —
> esses dois usam o card tipográfico. A afirmação anterior de "33 lotes sem vídeo" estava errada.

### ✅ RESOLVIDO — Ano do evento
**2026.** Confirmado por evidência: 01/08/2026 cai num sábado (o catálogo diz "sábado") e o
PDF foi gerado em 24/07/2026. Não depende mais do cliente.

### ✅ RESOLVIDO — Fotos dos lotes
O cliente **vai mandar depois**, e foi explícito: **NÃO usar placeholder e NÃO contar com elas.**

> **Regra de design, não negociável:** o layout tem que ficar bom e completo **sem nenhuma foto
> de lote**. Nada de moldura vazia, silhueta cinza, "imagem em breve" ou espaço reservado.
> Se a foto chegar, ela entra como enriquecimento — não como preenchimento de buraco.

**Solução visual aprovada tecnicamente:** a **thumbnail do vídeo do YouTube** é o visual do lote.
Vem de `https://i.ytimg.com/vi/<videoId>/maxresdefault.jpg` (fallback `hqdefault.jpg`), existe
para **132 dos 134 lotes** (ver a correção acima — a cobertura vem da playlist *e* dos links
embutidos no PDF), e já é a imagem oficial que o criatório produziu. Exige adicionar
`i.ytimg.com` em `images.remotePatterns` no `next.config.mjs`.
Só os **lotes 52 e 107** ficam sem vídeo: nesses dois o card é **tipográfico/de dados** — nome,
RG, pedigree e índices carregam a informação sozinhos, sem espaço vazio.

### ✅ FORA DE ESCOPO — decidido pelo cliente
- **Local do leilão, canal de transmissão e leiloeira responsável** — "não precisa". Não entram na página.
- **Estado da página depois de 01/08** — "não preocupa". Nenhum trabalho de pós-evento.

### ✅ FORA DE ESCOPO — frete (decidido pelo cliente em 27/07)
**Não entra mapa na página, nem faixa de frete.** A seção de frete foi cortada por inteiro.
A leitura visual do mapa vetorial do PDF está **cancelada** — ninguém precisa fazê-la.

> **Consequência assumida:** a página **não menciona frete**. Um "frete grátis" genérico seria
> claim falso, porque o catálogo tem regiões em "sob consulta" e regiões sem entrega. Como as
> faixas por UF não vão ser exibidas, a alternativa correta é o silêncio, não a generalização.
> Se o cliente quiser um selo de frete depois, é aditivo e barato.

**Ainda vale como oferta na página:** as **condições de pagamento** (30 parcelas, 10% à vista,
4% em 1+11, acima de 4 lotes 1+29). Essas são incondicionais e não dependem de mapa.

### ⏳ Ainda aberto
- [ ] **Claims de prova social** herdados do `/touros` precisam revalidação para este evento
      (o `/touros` já tem claims marcados `[VALIDAR]` em `copy.ts`). Na dúvida, usar formulação
      qualitativa sem número.

---

## 5. Base técnica existente (o que se reusa)

Stack: **Next.js App Router + TypeScript + Tailwind + framer-motion**, deploy na **Vercel**,
dados no **Supabase**, replicação em **Google Sheets**, tracking via **GTM + PostHog**.

Estrutura de referência a forkar — `src/app/touros/`:

```
src/app/touros/
  page.tsx          Hero → SubHero → ProvaSocial → Footer → StickyCta
  layout.tsx        metadata/OG + <GoogleTagManager/> + fonte Inter
  _lib/
    tokens.ts       design tokens (dark/light, typo, font, radius)
    copy.ts         TODA a copy comercial centralizada
    analytics.ts    PostHog; NÃO toca dataLayer (decisão deliberada)
    utm.ts          captura de UTM/fbclid/gclid
    useSafeReducedMotion.ts
  _components/
    Hero.tsx        hero + form na 1ª dobra (#cadastro)
    Formulario.tsx  form multi-step de 3 passos (574 linhas)
    SubHero.tsx  ProvaSocial.tsx  Footer.tsx  StickyCta.tsx
    Obrigado.tsx  WhatsappRedirect.tsx  GoogleTagManager.tsx  ui.tsx
src/app/api/touros/lead/route.ts     validação server-side → crm_leads → Sheets
src/app/obrigado-touros-lead/page.tsx
src/app/obrigado-touros-mql/page.tsx
```

### Como o formulário funciona hoje (replicar sem regressão)
- **3 passos:** `['Seus dados', 'Sua fazenda', 'Sua compra']`
  1. nome, whatsapp, email (opcional), consentimento WhatsApp (obrigatório)
  2. UF, cidade (via API do IBGE), tamanho do rebanho, momento na pecuária (opcional)
  3. quantos touros busca, tem inscrição estadual (obrigatório)
- Máscara de telefone, validação por passo, foco no primeiro erro, `aria-invalid`/`aria-describedby`.
- Inputs com `font-size: 16px` para evitar zoom no iOS; alvos de toque ≥50px.
- **MQL é decidido no SERVIDOR** (`evaluateMql`): ≥100 cabeças **E** tem inscrição estadual.
- No sucesso, **navegação hard** (`window.location.assign`) para `/obrigado-touros-mql` ou
  `/obrigado-touros-lead`. Isso é **deliberado**: só um load completo dispara o gatilho
  Page View do GTM, onde a tag de conversão do Meta roda. `router.push` **quebraria a conversão**.
  Ver commits `d697127` e `e437ed1`.
- `analytics.ts` **não empurra nada ao dataLayer** de propósito: o container tem um acionador
  catch-all que dispararia Meta/GA4 a cada micro-evento e duplicaria PageView.

### API de lead (`/api/touros/lead`)
Revalida tudo server-side (UF, faixas de rebanho, momento, quantidade, IE, consentimento),
grava em `crm_leads` (whatsapp em `telefone` **e** `celular` — o CRM lê `celular`),
com `source: 'touros-perpetuo'`, `origem`, `funnel_id`, `is_mql`, `extra_data.utm`,
faz append best-effort na planilha e devolve `{ id, is_mql }`.

**Para o novo funil:** `source` próprio (ex.: `leilao-sg7p`) e `origem` própria, mesmo `funnel_id`.

### Assets de marca disponíveis
`public/logo-bula-assessoria-white.png`, `public/logo-bula-assessoria-dark.png`,
`public/logo-bula.png`, `public/logo-bula-remates-{branco,preto}.svg`,
fotos em `public/jmp/galeria-touros/`, logos de criatórios em `public/criatorios/`.

### Roteamento do subdomínio — ATENÇÃO
**Não existe `middleware.ts` nem rewrite em `next.config.mjs`/`vercel.json` neste repositório.**
O mapeamento `touros.bulaassessoria.com` → `/touros` é feito **no painel da Vercel**
(alias de domínio + redirect/rewrite do projeto). Portanto `saogeraldo.bulaassessoria.com`
exige **configuração de domínio/DNS na Vercel**, não só código. Confirmar como `touros.*`
está configurado antes de replicar — não assumir.

`next.config.mjs` tem regras de `Cache-Control` por diretório de assets; a nova pasta
`public/saogeraldo/` deve ganhar a regra equivalente.

---

## 6. Diferenças de conteúdo: evento único vs. funil perpétuo

O `/touros` é perpétuo e **evita datas de propósito** (ver comentário em `copy.ts`).
Esta página é o oposto — a **urgência da data é o principal driver**:

- Data, hora e contagem regressiva no hero.
- Condições de pagamento e frete como blocos de oferta (são fortes: 30x, frete grátis).
- Catálogo/lotes em destaque: quantidade, faixa de idade, selos de "touro de central".
- Vídeos dos lotes (bloqueado pelo link do YouTube).
- Estado pós-evento: **[PENDENTE]** o que a página mostra depois de 01/08.

---

## 7. Critérios de qualidade (herdados do `/touros`)

- Mobile-first: o tráfego é pago e majoritariamente mobile.
- Acessibilidade: contraste AA, alvos ≥44px, labels/erros associados, `prefers-reduced-motion`.
- Performance: fotos otimizadas via `next/image`, sem bloquear o first paint.
- Copy centralizada em `copy.ts` — **nenhuma string comercial hardcoded em componente**.
- Nenhum claim numérico novo sem validação do cliente.

---

## 8. ⚠️ REBASE PARA `origin/main` — 27/07 (LEIA ANTES DE CODAR)

O trabalho inicial foi feito sobre `fix/touros-gtm-pageview-hardnav`, que estava
**23 commits atrás** de `origin/main`. Isso foi corrigido.

**Branch de trabalho: `feat/leilao-sao-geraldo`, criada a partir de `origin/main`.**

### O que mudou na base e por que importa

| Arquivo | Base velha | `origin/main` (atual) |
|---|---|---|
| `src/lib/jmp-sheets.ts` | ~880 linhas | **1967 linhas** |
| `src/app/api/touros/lead/route.ts` | 207 linhas | 167 linhas, assinatura diferente |
| `src/app/touros/_components/` | 9 componentes | **11** — ganhou `Ensaio.tsx` e `Fecho.tsx` |

O `jmp-sheets.ts` da main ganhou toda uma camada de **abas de trabalho** que não existia:
`LEADS_TOUROS_TAB`, `LEADS_TOUROS_DOUGLAS_TAB`, `LEADS_TOUROS_JOAO_TAB`, `TOUROS_FORM_NAME`,
`appendLeadToTourosTabs()`, `syncTourosLandingTabs()`, `formatTourosTab()`.
A rota de touros da main chama `appendLeadToPerpetuoSheet()` **e** `appendLeadToTourosTabs()`.

> **CONSEQUÊNCIA:** o refactor de `jmp-sheets.ts` e o fork da rota de API feitos antes
> estavam sobre código morto e **foram descartados da branch**. Precisam ser REFEITOS
> contra a main. Os patches antigos ficaram salvos só como referência de intenção
> (`jmp-sheets-STALE.patch`, `route-saogeraldo-STALE.ts` no scratchpad da sessão) —
> **não aplicar cegamente.**

### Preservado no rebase (independente de base)
`.planning/leilao-sao-geraldo/` inteiro (BRIEF, PLAN, lotes.json, playlist-lotes.txt,
catalogo-raw.txt), `scripts/parse-catalogo-saogeraldo.mjs` e a mudança de `next.config.mjs`
(reaplicada limpa — a main tinha o arquivo idêntico à base velha).

### ⚠️ Pegadinha do `analytics.ts`
A main **já tem** o hard nav (`window.location.assign`) — PR #6 mergeada. Mas o commit
`e437ed1`, que **remove os pushes ao `dataLayer`**, ficou preso na branch antiga e **não
está na main**. Ou seja: o `analytics.ts` da main ainda empurra evento ao `dataLayer`,
que é exatamente o que causava ruído e PageView duplicado no GTM.

> **Para a landing nova: adotar a versão CORRIGIDA — sem `pushDataLayer`, só PostHog.**
> Não copiar o `analytics.ts` da main como está. Referência do certo: `git show e437ed1`.

### Nota de ferramenta
`src/lib/jmp-sheets.ts` é classificado como binário pelo `file`/`grep` (tem bytes de
controle pré-existentes nas linhas com `!==`). **Use `grep -a`** ou a busca sai vazia e
dá falso negativo. Isso não é corrupção — está assim na main desde antes.
