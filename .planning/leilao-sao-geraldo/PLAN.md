---
project: web-bula
feature: leilao-sao-geraldo
type: phased-build-plan
route: /saogeraldo
domain: saogeraldo.bulaassessoria.com
source_of_truth: .planning/leilao-sao-geraldo/BRIEF.md
base_fork: src/app/touros/
event: Leilão Touros São Geraldo e 7P
event_datetime: 2026-08-01T12:00:00-03:00
created: 2026-07-27
---

# Plano de Construção — Landing de Lançamento: Leilão Touros São Geraldo e 7P

## ⏱ Restrição de topo: a página tem 5 dias de vida útil de build

Hoje é **segunda, 27/07/2026**. O leilão é **sábado, 01/08/2026, 12h**.
São **5 dias corridos** até o evento — e o tráfego pago precisa rodar ANTES dele.

Isso muda a natureza do plano: não é um build confortável, é um **lançamento com
prazo duro**. Duas consequências que valem para todas as fases:

1. **O caminho crítico é sagrado.** Fases 0 → 2 → 3 → 4 → 5 → 9 → 10 entregam uma
   página que capta lead e converte. Tudo fora disso é enriquecimento.
2. **Existe uma linha de corte** (ver "Corte mínimo de go-live", no fim do plano).
   Se em D-2 (30/07) o caminho crítico não estiver verde, corta-se enriquecimento —
   nunca o formulário, o tracking ou a página de obrigado.

**Regra de bloqueio:** nenhuma tarefa do caminho crítico pode ficar bloqueada
esperando resposta do cliente. Onde há pendência, o plano define um **default
seguro isolado em UMA constante**, para trocar em 1 linha quando a resposta chegar.

---

## Visão Geral

Landing page de **lançamento único** em `saogeraldo.bulaassessoria.com`, dentro do
mesmo app Next.js (`web-bula`), na rota nova `src/app/saogeraldo/`.

**Objetivo comercial único:** captar lead qualificado para o leilão →
CRM → WhatsApp do assessor. Mesmo KPI do `/touros`, contexto diferente.

**Marca da página: BULA ASSESSORIA.** São Geraldo e 7P Agro aparecem como
**criatórios/vendedores** dos lotes (prova, origem da genética) — nunca como marca.
Logo, cores, tom e rodapé são da Bula. Requisito explícito do cliente, não reabrir.

**Abordagem: FORK do `/touros` e adaptar.** Reusa tokens, formulário multi-step,
GTM, padrão de rota de API e integração de CRM. O que muda é o CONTEÚDO
(urgência de data, oferta de pagamento/frete, catálogo) e a ATRIBUIÇÃO (source
próprio).

### O que diferencia esta página do `/touros`

O `/touros` é perpétuo e **evita datas de propósito**. Esta é o oposto — **a data
é o driver principal**:

| Bloco | `/touros` (perpétuo) | `/saogeraldo` (lançamento) |
|---|---|---|
| Urgência | nenhuma | data + hora + contagem regressiva |
| Oferta | assessoria gratuita | assessoria + 30x, 10% à vista, 4% em 1+11, 1+29 acima de 4 lotes |
| Logística | — | frete grátis por faixa de estado |
| Produto | "touros PO" genérico | ~130 lotes Nelore PO, 21–24 meses, selos de touro de central |
| Fim de vida | nunca | 01/08 12h → estado pós-evento |

---

## INVARIANTES — não podem regredir no fork

Estes são comportamentos já pagos com bug em produção no `/touros`. Quebrá-los no
fork é regressão, não escolha de implementação. Cada um tem um teste de guarda na
Fase 10.

| # | Invariante | Porquê |
|---|---|---|
| **INV-1** | Navegação para a página de obrigado é **HARD** (`window.location.assign`), nunca `router.push` | Só um load completo dispara o gatilho **Page View** do GTM, onde a tag de conversão do Meta roda. SPA nav **não recarrega o GTM** e a conversão não dispara. Ver commits `d697127`, `e437ed1` |
| **INV-2** | `analytics.ts` **NÃO empurra nada ao `dataLayer`** | O container tem um acionador catch-all (Custom Event "Event não contém gtm.") que dispararia Meta/GA4 a cada micro-evento do funil e duplicaria PageView |
| **INV-3** | **MQL é decidido no SERVIDOR** (`evaluateMql` no route handler), nunca no client | O client é falsificável; o veredito de MQL escolhe a URL de obrigado e o valor da conversão |
| **INV-4** | WhatsApp gravado em **`telefone` E `celular`** no `crm_leads` | O CRM (modal/cards) lê `celular` como contato principal — sem isso o número "não puxa" ao abrir o lead |
| **INV-5** | **Toda** copy comercial em `_lib/copy.ts` — zero string comercial hardcoded em componente | O cliente revisa copy sem tocar em componente; é a fonte única |
| **INV-6** | Mobile-first: inputs `font-size: 16px`, alvos ≥44px, contraste AA, `prefers-reduced-motion` respeitado | Tráfego pago é majoritariamente mobile; 16px evita zoom do iOS; AA é requisito de acessibilidade |

---

## Convenções de nomenclatura (travadas — usar exatamente assim)

Definidas AQUI para nenhum executor inventar variação e a atribuição não vazar.

| Item | Valor |
|---|---|
| Rota da página | `src/app/saogeraldo/` |
| Rota da API | `src/app/api/saogeraldo/lead/route.ts` |
| Obrigado (MQL) | `src/app/obrigado-sg7p-mql/page.tsx` |
| Obrigado (lead) | `src/app/obrigado-sg7p-lead/page.tsx` |
| Assets | `public/saogeraldo/` |
| CRM `source` | `'leilao-sg7p'` |
| CRM `origem` | `'Landing Leilão São Geraldo e 7P'` |
| CRM `funnel_id` | `JMP_FUNNEL_ID` (mesmo funil — separação vem por `source`) |
| `extra_data.funil` | `'leilao-sg7p'` |
| `interesse` | `'touros-po'` (o catálogo é 100% touros) |
| Chave de UTM em sessionStorage | `'sg7p_utm'` (**não** reusar `'touros_utm'`) |
| Prefixo de eventos PostHog | `sg7p_*` (`sg7p_view`, `sg7p_form_started`, `sg7p_lead_submitted`, …) |

---

## Estrutura de fases e dependências

```
Fase 0 (infra + decisões)  ─┬─► Fase 2 (rota/tokens/cache) ─► Fase 3 (copy + evento.ts)
Fase 1 (catálogo do PDF) ───┘                                        │
                                                                     ├─► Fase 4 (API + obrigado)
                                                                     │        │
                                                                     └────────┴─► Fase 5 (hero + countdown + form)
Fase 5 ─┬─► Fase 6 (oferta: pagamento + frete)  ─► Fase 7 (catálogo de lotes)  [Fase 1]
        └─► Fase 8 (prova social + footer + sticky + pós-evento)
Fase 4 + 5 + 8 ─► Fase 9 (tracking / GTM / conversão)
Fase 9 ─► Fase 10 (QA + acessibilidade + performance + go-live)
```

**Ordem recomendada:** 0 e 1 em paralelo → 2 → 3 → 4 (paralelo com 5 até o submit) →
5 → 6 → 8 → 7 → 9 → 10.

**Caminho crítico (não pode escorregar):** `0 → 2 → 3 → 4 → 5 → 9 → 10`.

---

## Fase 0 — Descoberta de infraestrutura e travamento de decisões

**Objetivo:** Eliminar as três incógnitas de infraestrutura que **não estão no
código** e que, descobertas tarde, viram bloqueio de go-live: domínio na Vercel,
container do GTM e destino do lead na planilha. Fase de descoberta + registro —
**zero código de página**.

**Por que existe:** o BRIEF é explícito — não há `middleware.ts` nem rewrite em
`next.config.mjs`/`vercel.json` neste repositório (confirmado: `vercel.json` só
tem `crons`). O mapeamento `touros.bulaassessoria.com` → `/touros` é feito **no
painel da Vercel**. Replicar isso é trabalho de painel, não de commit.

**Tarefas:**

- **T0.1 — Auditar como `touros.bulaassessoria.com` está configurado na Vercel.**
  No painel do projeto `web-bula`: Settings → Domains. Registrar **exatamente**:
  (a) o domínio é um alias direto ou tem redirect/rewrite configurado?
  (b) se há rewrite, qual a regra de origem → destino (`/` → `/touros`)?
  (c) qual o registro DNS no provedor do domínio (CNAME/A) e para onde aponta?
  (d) SSL está em "Valid Configuration"?
  Saída: seção "Domínio" em `.planning/leilao-sao-geraldo/INFRA.md`.
  **Não assumir** que é alias puro — se for rewrite de painel, a mesma regra
  precisa ser criada para `saogeraldo.*`, e isso é a diferença entre a página
  abrir na raiz do subdomínio ou só em `/saogeraldo`.

- **T0.2 — Criar `saogeraldo.bulaassessoria.com` na Vercel espelhando T0.1.**
  Adicionar o domínio ao projeto, criar o registro DNS equivalente, aplicar a
  MESMA estratégia (alias ou rewrite) descoberta em T0.1, aguardar SSL válido.
  Depende de: T0.1.
  ⚠️ **Executar em D-4 (28/07) no máximo** — propagação DNS + emissão de SSL pode
  levar horas e é o item de lead time mais longo do plano inteiro.

- **T0.3 — Decidir e registrar o container do GTM do novo subdomínio.**
  Duas opções, com trade-off explícito:
  - **(A) Reusar `GTM-K8RXFDDT`** (o mesmo do `touros.*`, já default em
    `GoogleTagManager.tsx`). Prós: zero configuração, tags de Meta já existem.
    Contras: os gatilhos de Page View das URLs de obrigado precisam ser
    ESTENDIDOS para `/obrigado-sg7p-*`, senão a conversão do lançamento não
    dispara; e os relatórios misturam os dois funis.
  - **(B) Container novo** para `saogeraldo.*`. Prós: isolamento total de
    relatório. Contras: recriar tag de conversão do Meta + gatilhos do zero, com
    5 dias de prazo e sem margem para erro de configuração.
  **Default recomendado: (A) reusar**, adicionando os gatilhos de Page View das
  novas URLs de obrigado. É o caminho com menos superfície de falha no prazo.
  A decisão precisa estar TOMADA antes da Fase 9.
  Saída: seção "GTM" em `INFRA.md` com o `GTM_ID` a usar e a lista de gatilhos a
  criar/estender.

- **T0.4 — Decidir o destino do lead na planilha (Google Sheets).**
  Hoje `/api/touros/lead` chama `appendLeadToPerpetuoSheet` → aba
  `'LEADS BULA - PERPETUO'` (`src/lib/jmp-sheets.ts`). Opções:
  - **(A) Reusar a aba PERPETUO**, com `form_name` diferenciando o funil
    (`buildPerpetuoLandingRow` já grava `form_name`). Custo: 1 linha de mudança.
    Contra: mistura o lançamento com o perpétuo na visão da operação.
  - **(B) Aba dedicada** `'LEADS SG7P'`, espelhando o padrão de
    `appendLeadToEaoSheet` / `LEADS_EAO_TAB` (cabeçalho enxuto, `ensureLayout`,
    idempotência por `Lead ID`). Custo: ~1 função nova em `jmp-sheets.ts`.
  - **(C) Não gravar em planilha** neste funil (CRM é a fonte primária).
  **Default recomendado: (B)** — o BRIEF pede explicitamente "medir o lançamento
  isolado sem poluir o perpétuo", e o append é best-effort (não derruba o lead).
  Saída: decisão registrada em `INFRA.md`, consumida pela Fase 4.

- **T0.5 — Confirmar com o cliente as pendências da seção 4 do BRIEF.**
  Disparar UMA mensagem consolidada (não 6 perguntas soltas), com os defaults já
  propostos, para o cliente só validar/corrigir:
  1. Link da playlist do YouTube (o passado — `.../playlist?list=PLSXxcyjph-gA` —
     tem ID de 12 chars; playlists usam ~34). Pedir o link completo **ou** a lista
     de vídeos individuais dos lotes.
  2. Ano do evento → **default 2026** (ver T0.6, confiança alta).
  3. Local do leilão e canal de transmissão.
  4. Leiloeira responsável.
  5. Divisão UF → faixa de frete (pedir por escrito, é mais rápido e confiável que
     ler o mapa vetorial).
  6. Fotos dos lotes (pacote de imagens) — se não vier, extraímos do PDF (Fase 1).
  7. Revalidação dos claims de prova social herdados do `/touros`
     (`+1.000 touros PO apartados…` está marcado `[VALIDAR]` no `copy.ts` atual).
  Saída: seção "Pendências — status" em `INFRA.md`, atualizada conforme responde.

- **T0.6 — Fechar o ano do evento por evidência, sem esperar o cliente.**
  Verificação já feita: **01/08/2026 cai num sábado**; 01/08/2025 cai numa
  sexta. O catálogo diz "01 de AGOSTO · SÁBADO · 12h" e o PDF foi gerado em
  24/07/2026. Convergência de três sinais → **2026 com confiança alta**.
  Ação: adotar `2026-08-01T12:00:00-03:00` como default, isolado em UMA constante
  (`EVENTO.dataHoraISO`, Fase 3). Se o cliente corrigir, é troca de 1 linha.
  ⚠️ **Fuso:** `-03:00` é o horário de Brasília. Se o local do leilão (pendência
  T0.5.3) for MT/MS/AM/RO/AC, o horário local muda — revisar a constante quando o
  local chegar. Não muda a arquitetura, só o valor.

**Critério de verificação:**
- `.planning/leilao-sao-geraldo/INFRA.md` existe com 4 seções preenchidas:
  Domínio, GTM, Planilha, Pendências.
- `https://saogeraldo.bulaassessoria.com` resolve com **SSL válido** (pode
  responder 404 nesta fase — a rota ainda não existe; o que importa é resolver).
- A estratégia de roteamento do subdomínio está escrita, não na cabeça de alguém.
- Mensagem única de pendências enviada ao cliente, com timestamp registrado.

**Dependências:** nenhuma. **Roda em paralelo com a Fase 1.**

---

## Fase 1 — Extração dos dados e imagens do catálogo (PDF)

**Objetivo:** Transformar o PDF de 138 páginas em dados estruturados e imagens
otimizadas que a Fase 7 consome, sem digitação manual e sem inventar dado.

**Fonte:** `~/Downloads/Leilão Touros São Geraldo e 7P (CAT VIRTUAL).pdf`
(confirmado presente no disco — **a extração NÃO está bloqueada**).
Texto já extraído: `.planning/leilao-sao-geraldo/catalogo-raw.txt` (433 KB).

**Tarefas:**

- **T1.1 — Copiar o PDF para dentro do repositório de trabalho.**
  Destino: `.planning/leilao-sao-geraldo/catalogo.pdf`.
  Adicionar ao `.gitignore` do diretório se o peso for proibitivo — o que precisa
  ser versionado é o JSON derivado (T1.2), não o binário.

- **T1.2 — Escrever o parser do catálogo → `lotes.json`.**
  Script one-off em `scripts/parse-catalogo-sg7p.mjs`, lendo `catalogo-raw.txt`.
  Estrutura por lote (só campos que EXISTEM no texto — nada inferido):
  ```
  { lote, nome, rg, nascimento, idadeMeses, sexo, percentualAVenda,
    pai, mae, selos[], peso?, ce?, videoUrl? }
  ```
  Âncoras de parsing observadas no texto cru: o número do lote precede o token
  `L O T E`; `RG:` inicia a linha de registro; `NASC.:` traz data e sexo;
  `% À VENDA` traz o percentual; `MÃE de TOURO DE CENTRAL` / `AVÓ de TOURO DE
  CENTRAL` são os selos.
  Saída: `src/app/saogeraldo/_data/lotes.json`.
  ⚠️ **Não extrair os três blocos de índices** (DEP/TOP%, iABCZ/DECA/P%,
  MGTe/TOP%) para a página. São 28 números por lote, ilegíveis em mobile e sem
  função de conversão. Ficam no PDF, que é o material técnico.

- **T1.3 — Validar o parse contra os totais conhecidos.**
  O BRIEF diz ~130 lotes e 155 registros de animal. Contagem no texto cru:
  134 ocorrências de `L O T E`, 160 linhas com `RG:`.
  Aceite: total de lotes parseados entre **125 e 135**, e **zero** lote com
  `nome` vazio ou `rg` vazio. Divergência fora da faixa → o parser está errado,
  corrigir antes de seguir. **Não "arredondar" o número na copy** para bater com
  um parse ruim.

- **T1.4 — Extrair as imagens dos lotes do PDF.**
  `pdfimages -png` (ou `sharp` sobre render de página) → filtrar por dimensão
  mínima (descartar ícones/logos repetidos) → converter para `.webp` de largura
  máxima 1200px, qualidade ~78.
  Destino: `public/saogeraldo/lotes/{numero-do-lote}.webp`.
  Se o cliente enviar o pacote oficial de fotos (T0.5.6), ele **substitui** a
  extração — o caminho de arquivo não muda, então a Fase 7 não é afetada.

- **T1.5 — Selecionar as fotos de hero e OG.**
  Escolher 1 foto de touro em retrato (hero mobile) e 1 em paisagem (hero
  desktop) entre as extraídas em T1.4. **Fallback imediato e já disponível:**
  `/jmp/galeria-touros/IMG_0037.jpg` (retrato) e `/jmp/galeria-touros/IMG_0003.jpg`
  (paisagem), que o `/touros` já usa. A Fase 5 **não pode ficar bloqueada** por
  esta escolha — começa com o fallback e troca quando a seleção fechar.
  Destino das definitivas: `public/saogeraldo/hero-mobile.webp`,
  `public/saogeraldo/hero-desktop.webp`, `public/saogeraldo/og.jpg` (1200×630).

- **T1.6 🔒 BLOQUEADA — Anexar os links de vídeo por lote.**
  Cada página do catálogo tem "CLIQUE PARA VER O VÍDEO DO LOTE", mas o link é
  anotação vetorial e o único link fornecido está quebrado.
  **Bloqueada por:** pendência T0.5.1 (link do YouTube).
  **Destrava com:** playlist completa (mapear vídeo → lote pelo título/ordem) ou
  lista de URLs individuais por lote.
  **Comportamento sem ela:** `videoUrl` fica `null` no JSON e a Fase 7 **não
  renderiza** o botão de vídeo (nunca renderizar link morto).

**Critério de verificação:**
- `src/app/saogeraldo/_data/lotes.json` existe, é JSON válido, com 125–135 lotes.
- `node -e "const l=require('./src/app/saogeraldo/_data/lotes.json'); console.log(l.length, l.filter(x=>!x.nome||!x.rg).length)"` → segundo número é **0**.
- Todo lote tem `sexo === 'MACHO'` (o catálogo é 100% touros — se aparecer fêmea,
  o parser pegou lixo).
- `ls public/saogeraldo/lotes/*.webp | wc -l` ≥ 100, nenhum arquivo > 250 KB.
- Amostragem manual: 3 lotes aleatórios conferidos contra o PDF (nome, RG, nasc.).

**Dependências:** nenhuma. **Roda em paralelo com a Fase 0.**
**Alimenta:** Fase 7 (catálogo) e Fase 5 (fotos de hero).

---

## Fase 2 — Fork da rota, tokens e regra de cache

**Objetivo:** Existir `/saogeraldo` renderizando um esqueleto, com a estrutura de
`_lib`/`_components` no lugar e os assets servidos com cache correto.

**Estratégia de fork — explícita para não virar cópia-cega:**

| Arquivo do `/touros` | Ação | Motivo |
|---|---|---|
| `_lib/tokens.ts` | **copiar sem alterar** | Design system da Bula; a marca é a mesma |
| `_lib/useSafeReducedMotion.ts` | **copiar sem alterar** | Utilitário puro |
| `_lib/utm.ts` | copiar, **trocar `STORAGE_KEY`** para `'sg7p_utm'` | Senão a atribuição das duas landings colide em ambiente de mesma origem (localhost/preview) |
| `_components/ui.tsx` | **copiar sem alterar** | Primitivos (Section, Container, Eyebrow, PillButton, Reveal, TopicCard, MultiLine) |
| `_components/GoogleTagManager.tsx` | copiar; ID conforme decisão T0.3 | Container do subdomínio |
| `_components/Formulario.tsx` | copiar, adaptar endpoint/eventos/URLs de obrigado | Fase 5 — a LÓGICA não muda |
| `_lib/analytics.ts` | copiar, renomear eventos para `sg7p_*` | Fase 9 — **INV-2 preservado** |
| `_lib/copy.ts` | **reescrever do zero** | Conteúdo é o que diferencia as páginas |
| `_components/Hero.tsx` etc. | reescrever adaptando | Fases 5–8 |

**Tarefas:**

- **T2.1 — Criar a árvore da rota.**
  `src/app/saogeraldo/page.tsx` (Server Component) empilhando stubs na ordem
  final: `<Hero/> <Urgencia/> <Oferta/> <Catalogo/> <ProvaSocial/> <Footer/>
  <StickyCta/>`.
  `src/app/saogeraldo/layout.tsx` espelhando o de `/touros`: fonte Inter com
  `interFeatures`, `<GoogleTagManager/>`, `metadata` + `viewport`.
  `metadataBase: new URL('https://saogeraldo.bulaassessoria.com')`.
  Criar `_lib/` e `_components/` (prefixo `_` = não vira rota).

- **T2.2 — Copiar os utilitários reusáveis conforme a tabela acima.**
  `tokens.ts`, `useSafeReducedMotion.ts`, `utm.ts` (com `STORAGE_KEY` trocado),
  `ui.tsx`, `GoogleTagManager.tsx`.
  Verificação de escopo: `grep -rn "touros" src/app/saogeraldo/_lib/ src/app/saogeraldo/_components/ui.tsx`
  deve retornar **vazio** (nenhum resquício de nome do funil anterior).

- **T2.3 — Criar `public/saogeraldo/` com README de assets esperados.**
  Listar: `hero-mobile.webp`, `hero-desktop.webp`, `og.jpg`, `lotes/*.webp`.

- **T2.4 — Adicionar a regra de `Cache-Control` em `next.config.mjs`.**
  O bloco existente hoje é:
  ```
  source: '/:dir(touros|criatorios|institucional)/:path*.(jpg|jpeg|png|webp|svg|ico)'
  ```
  Adicionar `saogeraldo` ao grupo do `:dir` — é a mudança de menor superfície e
  mantém o perfil (`max-age=86400, stale-while-revalidate=604800`), coerente com
  imagens que mudam raramente.

- **T2.5 — Garantir que a landing é chrome-free.**
  Confirmar que nenhum header/nav global do app vaza para `/saogeraldo` (o root
  layout só injeta `ServiceWorkerRegister` e `InstallPrompt`, sem navbar — mesmo
  comportamento do `/touros`, que já é chrome-free).

**Critério de verificação:**
- `npm run dev` → `http://localhost:3000/saogeraldo` retorna **200**, renderiza os
  7 stubs, sem navbar do app e **sem erro no console**.
- `public/saogeraldo/` existe; `next.config.mjs` inclui `saogeraldo` na regra de cache.
- `curl -sI http://localhost:3000/saogeraldo/og.jpg | grep -i cache-control` →
  `public, max-age=86400, stale-while-revalidate=604800`.
- `grep -rn "touros" src/app/saogeraldo/_lib/` → vazio.
- `npx tsc --noEmit` limpo na nova rota.

**Dependências:** Fase 0 (T0.1/T0.2 para o domínio do `metadataBase`; se ainda não
resolvido, usar o valor final `saogeraldo.bulaassessoria.com` e seguir — o DNS não
bloqueia o build).

---

## Fase 3 — Fonte única de copy e configuração do evento

**Objetivo:** Centralizar em dois arquivos **tudo** que o cliente pode querer
mudar em cima da hora: a copy comercial e os dados do evento. **INV-5.**

Esta fase é o para-raio das pendências: em vez de espalhar "[PENDENTE]" por 8
componentes, cada pendência vira **uma constante única**, com default seguro e
comentário `[PENDENTE]`. Trocar = 1 linha.

**Tarefas:**

- **T3.1 — Criar `_lib/evento.ts` (dados factuais, não-copy).**
  ```
  export const EVENTO = {
    nome: 'Leilão Touros São Geraldo e 7P',
    // [PENDENTE T0.5.2] ano assumido 2026 — 01/08/2026 é sábado (evidência T0.6).
    // [PENDENTE T0.5.3] fuso -03:00 assume praça em horário de Brasília.
    dataHoraISO: '2026-08-01T12:00:00-03:00',
    dataExtenso: '01 de agosto, sábado, 12h',
    formato: 'Catálogo virtual',
    vendedores: ['Fazenda São Geraldo', '7P Agro'],
    siteCriatorio: 'www.fazendasaogeraldo.com.br',
    raca: 'Nelore PO',
    totalLotes: /* vindo de T1.3, número REAL do parse */,
    faixaIdadeMeses: '21 a 24 meses',
    local: null,        // [PENDENTE T0.5.3]
    transmissao: null,  // [PENDENTE T0.5.3]
    leiloeira: null,    // [PENDENTE T0.5.4]
  } as const
  ```
  **Regra de render:** todo campo `null` é **omitido da UI**, nunca renderizado
  como "a confirmar". Página de lançamento com lacuna visível destrói confiança.

- **T3.2 — Criar `_lib/copy.ts` — hero, formulário e obrigado.**
  Estrutura espelhando o `/touros` (`hero`, `subHero`, `form`, `obrigado`), com
  conteúdo do lançamento. O ângulo muda de "assessoria perpétua" para **"o leilão
  é sábado e a Bula te habilita e te assessora a comprar certo"**.
  Herdar do `/touros` sem reescrever: `form.whatsappHint`, `form.consent`,
  `form.submitting` — micro-copy já testada.
  Adaptar: `hero.title`, `hero.lead`, `hero.cta`, `form.title`, `form.lead`,
  `form.submit`, `obrigado.*` (o pós-cadastro agora menciona o leilão de sábado e
  a habilitação).
  Todo claim numérico novo → marcar `[VALIDAR]` (regra herdada: nenhum claim novo
  sem validação do cliente).

- **T3.3 — Criar `_lib/copy.ts` — blocos de oferta (pagamento e frete).**
  Transcrição **literal** do catálogo, sem reinterpretar:
  ```
  export const pagamento = {
    titulo: 'Condições de pagamento',
    condicoes: [
      { destaque: '30 parcelas', detalhe: '2+2+2+2+2+20' },
      { destaque: '10% de desconto', detalhe: 'para pagamento à vista' },
      { destaque: '4% de desconto', detalhe: 'para pagamento em 12 parcelas (1+11)' },
      { destaque: 'Acima de 4 lotes', detalhe: 'pagamento em 1+29 parcelas' },
    ],
  }
  export const frete = {
    titulo: 'Condições de frete',
    // [PENDENTE T0.5.5] `ufs` vazio até a divisão chegar — ver T6.3.
    faixas: [
      { rotulo: 'Frete grátis', detalhe: 'qualquer quantidade', ufs: [] },
      { rotulo: 'Frete grátis', detalhe: 'a partir de 2 lotes', ufs: [] },
      { rotulo: 'Frete sob consulta', detalhe: 'demais estados', ufs: [] },
    ],
    restricao: 'Não é possível a entrega em parte da região Norte.',
    nota: '* Dentro da malha rodoviária asfaltada.',
  }
  ```
  ⚠️ **Não deduzir a divisão UF→faixa por geografia.** O mapa do PDF é vetorial e
  o texto extraído lista as UFs sem vínculo com as faixas. Errar isso é prometer
  frete grátis a quem não tem — problema comercial real, não cosmético.

- **T3.4 — Criar `_lib/copy.ts` — catálogo e prova social.**
  Copy do bloco de lotes (quantidade real de T1.3, faixa de idade, selos de
  "touro de central") e da faixa de criatórios.
  Os claims herdados do `/touros` (`+1.000 touros PO apartados…`) entram marcados
  `[VALIDAR T0.5.7]` — vale até o cliente revalidar para este evento.

**Critério de verificação:**
- `grep -rn "01 de agosto\|30 parcelas\|10% de desconto\|frete grátis" src/app/saogeraldo/_components/ -i` → **vazio** (INV-5: nada hardcoded em componente).
- Todo campo pendente aparece **uma única vez** no código:
  `grep -rn "PENDENTE" src/app/saogeraldo/` lista apenas ocorrências em
  `_lib/evento.ts` e `_lib/copy.ts`.
- `new Date(EVENTO.dataHoraISO)` é uma data válida e **futura** em relação a hoje.
- Números de pagamento conferidos linha a linha contra o BRIEF §2 por leitura
  humana (30 / 2+2+2+2+2+20 / 10% / 4% / 1+11 / 1+29).

**Dependências:** Fase 2 (estrutura existe), Fase 1 T1.3 (total real de lotes).

---

## Fase 4 — API de lead + páginas de obrigado

**Objetivo:** O lead do lançamento entra no CRM com atribuição própria, o MQL é
decidido no servidor e existem duas URLs de obrigado para as metas de conversão.

**Decisão de arquitetura:** **rota nova**
`src/app/api/saogeraldo/lead/route.ts`, forkada de `/api/touros/lead`.
Trade-off: parametrizar a rota existente por `source` seria menos código, mas
acopla dois funis com ciclos de vida diferentes — este morre em 01/08, o outro é
perpétuo. Uma cópia de ~200 linhas isola telemetria, validação e destino de
planilha, e permite desligar o lançamento sem tocar no perpétuo.

**Tarefas:**

- **T4.1 — Forkar o route handler.**
  Copiar `/api/touros/lead/route.ts` → `/api/saogeraldo/lead/route.ts`.
  **Preservar sem alterar:** toda a validação server-side (UFs, `VALID_CABECAS`,
  `VALID_MOMENTOS`, `VALID_QUANTIDADES_TOUROS`, IE, consentimento obrigatório),
  o `evaluateMql(DEFAULT_JMP_MQL_RULE, …)` (**INV-3**), o `telefone` + `celular`
  (**INV-4**), o formato de `extra_data.utm`, o retorno `ok({ id, is_mql })`.
  **Alterar apenas:**
  - `source: 'leilao-sg7p'`
  - `origem: 'Landing Leilão São Geraldo e 7P'`
  - `extra_data.funil: 'leilao-sg7p'`
  - `host` default → `'saogeraldo.bulaassessoria.com'`
  - mensagens de log → prefixo `[sg7p lead]`
  - `funnel_id`: **mantém** `JMP_FUNNEL_ID` (decisão travada do BRIEF §3.4).
  - `interesse`: **mantém** `'touros-po'`.
  ⚠️ **NÃO** importar `dispatchCrmWelcome` nem qualquer disparo de WhatsApp.

- **T4.2 — Ligar o append de planilha conforme a decisão T0.4.**
  Default (opção B): criar `appendLeadToSg7pSheet` em `src/lib/jmp-sheets.ts`,
  espelhando `appendLeadToEaoSheet` — aba `'LEADS SG7P'`, cabeçalho enxuto
  (`Data, Nome, E-mail, WhatsApp, UF, Cidade, Momento, Cabeças, Inscrição
  Estadual, Qtd. desejada, Lead ID, Campanha, Anúncio, MQL, Consentimento`),
  criação da aba se não existir, resolução por nome de coluna, idempotência por
  `Lead ID`. Chamada em `try/catch` best-effort — **nunca derruba o cadastro**.

- **T4.3 — Criar as páginas de obrigado.**
  `src/app/obrigado-sg7p-mql/page.tsx` e `src/app/obrigado-sg7p-lead/page.tsx`,
  espelhando as de touros: `<GoogleTagManager/>` + componente de conteúdo,
  `metadata.robots: { index: false, follow: false }`.
  Criar `src/app/saogeraldo/_components/Obrigado.tsx` consumindo `copy.obrigado`.

- **T4.4 — Decidir o destino pós-obrigado.**
  O `/touros` redireciona para um grupo de WhatsApp após 8s
  (`WhatsappRedirect.tsx`, `GROUP_URL` hardcoded). Para o lançamento, decidir:
  (a) mesmo grupo, (b) grupo próprio do leilão, (c) sem redirect.
  **Default: (c) sem redirect automático nesta primeira versão** — o redirect
  para grupo genérico num funil de leilão datado gera expectativa errada, e um
  grupo próprio é decisão do cliente (T0.5). Se (b) for escolhido, reusar o
  componente trocando só a URL.
  ⚠️ Se o redirect for mantido, ele roda DEPOIS do Page View do GTM — validar na
  Fase 9 que a conversão dispara antes da saída da página.

**Critério de verificação:**
- `curl -X POST localhost:3000/api/saogeraldo/lead -H 'Content-Type: application/json' -d '{"nome":"Teste QA","whatsapp":"(66) 99999-9999","uf":"MT","cabecas":"100 a 500 cabeças","oQueBusca":"6 a 10 touros","inscricaoEstadual":"Sim","whatsappConsent":true}'`
  → **200** `{ id, is_mql: true }`.
- Mesma chamada com `"cabecas":"1 a 99 cabeças"` → `is_mql: **false**` (**INV-3**).
- Sem `whatsappConsent` → **400**.
- Linha em `crm_leads` com `source='leilao-sg7p'`, `origem` própria,
  `funnel_id='default'`, e **`telefone` e `celular` ambos preenchidos** (**INV-4**).
- Com `?utm_source=meta&fbclid=abc` no payload → `extra_data.utm` populado.
- `grep -rn "dispatchCrmWelcome\|whatsapp/send\|baileys" src/app/api/saogeraldo/` → **vazio**.
- `/obrigado-sg7p-mql` e `/obrigado-sg7p-lead` retornam 200 e trazem o GTM no HTML.

**Dependências:** Fase 0 (T0.4), Fase 3 (copy do obrigado).

---

## Fase 5 — Hero + contagem regressiva + formulário — CRÍTICA

**Objetivo:** A primeira dobra que converte: marca Bula, promessa do leilão, data
com contagem regressiva e o formulário multi-step **na 1ª dobra**, igual ao
`/touros`.

**Tarefas:**

- **T5.1 — Forkar `Formulario.tsx` sem tocar na lógica.**
  Copiar `src/app/touros/_components/Formulario.tsx`.
  **Preservar integralmente:** 3 passos (`['Seus dados','Sua fazenda','Sua compra']`)
  e os mesmos campos (nome, whatsapp, email opcional, consentimento / UF, cidade
  via IBGE, rebanho, momento opcional / quantos touros, IE), máscara de telefone,
  validação por passo, foco no primeiro erro, `aria-invalid`/`aria-describedby`,
  `inputStyle` com `fontSize: 16` e `minHeight: 50` (**INV-6**).
  ⚠️ **NÃO adicionar campo touro/matriz** — removido do escopo pelo cliente
  (BRIEF §3.1). O catálogo é 100% touros.
  **Alterar apenas:**
  - endpoint → `/api/saogeraldo/lead`
  - eventos de funil → `sg7p_*`
  - URLs de destino → `/obrigado-sg7p-mql` / `/obrigado-sg7p-lead`
  - **manter `window.location.assign`** — navegação HARD (**INV-1**). Não trocar
    por `router.push` "para ficar mais suave": quebra a conversão do GTM.

- **T5.2 — Criar `_components/Countdown.tsx`.**
  Client component consumindo `EVENTO.dataHoraISO`. Renderiza dias/horas/minutos
  em `typo.mono`/`typo.stat`, dourado escasso.
  Requisitos não-óbvios:
  - **SSR-safe:** o primeiro render (servidor) e a primeira hidratação devem
    coincidir — calcular o delta só em `useEffect`, com placeholder estável antes
    disso. Senão: hydration mismatch.
  - **`prefers-reduced-motion`:** sem animação de flip/tick; atualização silenciosa
    a cada 60s é suficiente e não gera 1 render/segundo no mobile.
  - **Delta ≤ 0:** não renderiza contagem — delega ao estado pós-evento (Fase 8).
  - `aria-live="off"` — contador que anuncia a cada tick é hostil a leitor de tela.

- **T5.3 — Criar `_components/Hero.tsx`.**
  Fork estrutural do hero de `/touros` (o layout já é o certo: logo centralizada →
  eyebrow → título → form; mobile empilhado, desktop grid 2 colunas).
  Adaptações do lançamento:
  - Eyebrow → `LEILÃO TOUROS SÃO GERALDO E 7P · BULA ASSESSORIA`
  - Bloco de data + `<Countdown/>` entre o título e o formulário
  - Logo **da Bula** (`/logo-bula-assessoria-white.png`) — os criatórios aparecem
    como texto de vendedores, **não como logo de marca** (BRIEF §1)
  - Fotos: `public/saogeraldo/hero-{mobile,desktop}.webp` (T1.5) com **fallback**
    para `/jmp/galeria-touros/IMG_0037.jpg` e `IMG_0003.jpg`
  - `priority` na imagem do hero (é o LCP), `sizes="100vw"`, sem CLS
  - Manter o bloco `<style>` do anel de foco (`:focus-visible`) — acessibilidade

- **T5.4 — Bloco de dados do evento no hero.**
  Renderiza data/hora e formato "Catálogo virtual".
  **Campos `null` são omitidos** (local, transmissão, leiloeira) — ver T3.1.
  Quando as pendências chegarem, aparecem sem tocar no componente.

**Critério de verificação:**
- Em 390px de largura: logo → título → data+countdown → formulário, **tudo na
  primeira rolagem curta**; sem scroll horizontal.
- Preencher os 3 passos e enviar → lead em `crm_leads` com `source='leilao-sg7p'`;
  navegador vai para `/obrigado-sg7p-*` com **load completo** (verificar na aba
  Network: documento novo, não navegação SPA) — **INV-1**.
- Rebanho `100 a 500` + IE `Sim` → cai em `/obrigado-sg7p-mql`.
  Rebanho `1 a 99` → cai em `/obrigado-sg7p-lead`. **INV-3.**
- Contagem regressiva bate com `EVENTO.dataHoraISO` (conferir contra
  `date -j -f "%Y-%m-%dT%H:%M:%S" "2026-08-01T12:00:00"`).
- Com `prefers-reduced-motion: reduce` ativo no SO: sem animação, contador ainda
  correto, sem erro no console.
- Sem hydration mismatch no console em nenhum reload.
- Inputs medidos no DevTools: `font-size: 16px`, altura ≥ 50px. **INV-6.**

**Dependências:** Fase 2, Fase 3, Fase 4 (endpoint + obrigado).

---

## Fase 6 — Blocos de oferta: pagamento e frete

**Objetivo:** Transformar as duas condições comerciais mais fortes do catálogo
(30x e frete grátis) em blocos de oferta legíveis no mobile.

**Tarefas:**

- **T6.1 — Criar `_components/Pagamento.tsx`.**
  Consome `copy.pagamento`. Tile claro (`Section surface="light"`) para quebrar o
  ritmo depois do hero escuro — a troca de superfície é o divisor.
  4 cards / linhas com o número em destaque (`typo.stat` reduzido ou
  `typo.displayLg`) e o detalhe em corpo. Reusa `TopicCard` ou variação própria.
  Em mobile: coluna única. Nada de tabela que estoure lateralmente.

- **T6.2 — Criar `_components/Frete.tsx` — estrutura e faixas.**
  Consome `copy.frete`. Renderiza as três faixas + a restrição do Norte + a nota
  da malha asfaltada.
  **Render condicional obrigatório:** se `faixa.ufs` estiver vazio (pendência não
  resolvida), renderiza **só o rótulo e o detalhe**, sem lista de estados. A
  seção continua verdadeira e útil ("frete grátis a partir de 2 lotes"), só não
  promete UF específica.

- **T6.3 🔒 BLOQUEADA — Preencher a divisão UF → faixa de frete.**
  **Bloqueada por:** pendência T0.5.5.
  **Destrava com:** a divisão por escrito do cliente **ou** a leitura visual do
  mapa vetorial na página de condições do PDF.
  **Como destravar sem o cliente (fallback):** abrir o PDF na página do mapa,
  ler as cores por estado **visualmente** e transcrever. **Nunca deduzir por
  geografia** — o texto cru lista as UFs sem vínculo com as faixas.
  Ação ao destravar: preencher `ufs` em `copy.frete.faixas` e ativar a lista de
  estados no componente. **Mudança em `copy.ts` apenas** — o componente já está
  pronto (T6.2).
  **Risco comercial se errar:** prometer frete grátis para quem não tem direito
  gera atrito no fechamento. Preferir omitir a preencher com palpite.

**Critério de verificação:**
- As 4 condições de pagamento conferem literalmente com o BRIEF §2 (30 parcelas
  `2+2+2+2+2+20`, 10% à vista, 4% em 1+11, acima de 4 lotes 1+29).
- Em 390px: nenhum overflow horizontal; nenhum texto abaixo de 15px no corpo.
- Com `ufs: []`, a seção de frete renderiza sem lista de estados e **sem lacuna
  visual** (nada de "—" ou "a definir" na tela).
- `grep -rn "MT\|GO\|SP" src/app/saogeraldo/_components/Frete.tsx` → **vazio**
  (as UFs vivem em `copy.ts`, INV-5).
- Contraste AA verificado nos cards claros (o `light.gold #A68B4B` só pode ser
  usado ≥18px; para label pequeno usar `light.goldText #6E5A2E`).

**Dependências:** Fase 3 (copy), Fase 5 (ritmo de superfícies definido).

---

## Fase 7 — Seção de catálogo (~130 lotes Nelore PO)

**Objetivo:** Provar o produto: mostrar que são ~130 touros PO de genética
selecionada, com selos de "touro de central", sem transformar a landing num
catálogo técnico ilegível.

**Princípio de escopo:** a landing **não substitui o catálogo**. Ela mostra o
suficiente para o pecuarista querer falar com a Bula. Índices genéticos completos
(DEP/TOP%, iABCZ/DECA, MGTe — 28 números por lote) ficam **fora**.

**Tarefas:**

- **T7.1 — Criar `_components/Catalogo.tsx` — resumo do plantel.**
  Números-âncora em `StatNumber` (o primitivo já existe em `ui.tsx`):
  total de lotes (real, de T1.3), raça (Nelore PO), faixa de idade (21–24 meses),
  100% machos, nº de lotes com selo de "touro de central".
  **Este bloco sozinho já entrega a fase.** É o corte mínimo se o prazo apertar.

- **T7.2 — Criar a grade de lotes em destaque.**
  Selecionar **8 a 12 lotes** (não os 130) — priorizar os com selo
  "MÃE de TOURO DE CENTRAL" / "AVÓ de TOURO DE CENTRAL" e com peso/CE informados.
  Card: foto (`next/image`, `loading="lazy"`, `sizes` correto), nome, RG, idade,
  pai, selos. Mobile: 1 coluna ou carrossel horizontal com snap.
  ⚠️ **Não renderizar os 130 lotes.** 130 imagens matam o LCP e o mobile, e a
  landing vira catálogo — que já existe em PDF e converte pior.

- **T7.3 — CTA de retorno ao formulário.**
  Ao fim da seção, CTA âncora `#cadastro` com a copy do lançamento
  (`PillButton` de `ui.tsx`). O scroll da seção de catálogo é o mais longo da
  página — sem CTA no fim, o lead lê e sai.

- **T7.4 🔒 BLOQUEADA — Botão "ver o vídeo do lote".**
  **Bloqueada por:** T1.6, que depende da pendência T0.5.1 (link do YouTube).
  **Comportamento sem ela:** `videoUrl === null` → **não renderiza o botão**.
  Link morto num card de lote é pior que ausência de link.
  **Destrava com:** playlist válida ou URLs por lote → `lotes.json` ganha
  `videoUrl` → o botão aparece sozinho, sem mudança de componente.

- **T7.5 — Link para o catálogo completo.**
  Botão secundário para o PDF/catálogo virtual completo.
  ⚠️ **Decisão pendente:** hospedar o PDF em `public/saogeraldo/catalogo.pdf`
  (138 páginas — verificar peso; acima de ~15 MB, preferir link externo do
  criatório) ou apontar para `www.fazendasaogeraldo.com.br`.
  **Cuidado de conversão:** este link **tira o lead da página**. Colocar depois
  do formulário na ordem de leitura, nunca antes, e nunca como CTA primário.

**Critério de verificação:**
- Números do resumo conferem com `lotes.json` (não com o BRIEF — o BRIEF diz
  "~130"; a página mostra o número **real** apurado).
- Grade renderiza 8–12 lotes; nenhuma imagem sem `sizes`; todas `lazy` exceto as
  duas primeiras.
- Lighthouse mobile: a seção de catálogo **não** degrada o LCP do hero
  (LCP continua sendo a imagem do hero).
- Com `videoUrl: null` em todos os lotes: nenhum botão de vídeo renderizado,
  nenhum `href="#"` ou `href="null"` no HTML.
- CTA final rola suavemente até `#cadastro`.

**Dependências:** Fase 1 (dados + imagens), Fase 6 (ritmo de superfícies).

---

## Fase 8 — Prova social, rodapé, sticky CTA e estado pós-evento

**Objetivo:** Fechar a página com autoridade da Bula e resolver **o que acontece
depois de 01/08 às 12h** — uma landing de evento datado sem estado terminal vira
página morta que continua recebendo tráfego pago.

**Tarefas:**

- **T8.1 — Criar `_components/ProvaSocial.tsx`.**
  Fork do de `/touros`: tile escuro, marquee de logos de `/criatorios/*.png` com
  os `scale`/`detail` já calibrados (não recalibrar — o ajuste de massa visual dos
  PNGs já foi feito e é sensível), incluindo o fallback de `prefers-reduced-motion`
  que converte o marquee em grade centralizada.
  Adaptação: o claim de escala vem de `copy.provaSocial`, marcado `[VALIDAR]`
  até o cliente revalidar para este evento (T0.5.7).

- **T8.2 — Criar `_components/Footer.tsx`.**
  Fork direto. Logo **Bula**, links de Privacidade/Termos, copyright.
  Adição do lançamento: linha de crédito dos criatórios —
  "Lotes: Fazenda São Geraldo / 7P Agro" + `EVENTO.siteCriatorio`.
  Se `EVENTO.leiloeira` deixar de ser `null`, renderiza junto (T0.5.4).

- **T8.3 — Criar `_components/StickyCta.tsx`.**
  Fork direto (só mobile, aparece após 1.2 viewport, some quando `#cadastro`
  entra na tela via `IntersectionObserver`). Copy de `copy.hero.cta`.
  Adição de urgência: exibir os dias restantes ao lado do CTA quando faltarem
  ≤3 dias — reusar o cálculo de `Countdown` (extrair helper `_lib/countdown.ts`
  para não duplicar a lógica de delta em dois componentes).

- **T8.4 — Definir e implementar o ESTADO PÓS-EVENTO.**
  Decisão de produto, não de código. Três opções, com trade-off:
  - **(A) Redirect 308 para `/touros`** — o tráfego residual cai no funil
    perpétuo, que capta o mesmo perfil de lead. Zero manutenção. Perde o contexto
    do leilão.
  - **(B) Estado "evento encerrado" na própria página** — hero substituído por
    "O leilão de 01/08 foi realizado", formulário mantido com copy adaptada
    ("quero ser avisado do próximo leilão"), catálogo/oferta ocultos. Preserva o
    SEO e continua captando.
  - **(C) Não fazer nada** — página continua anunciando um evento que já passou.
    **Inaceitável.**
  **Default recomendado: (B)**, com fallback (A) se o prazo não permitir.
  Implementação de (B): função `eventoEncerrado()` em `_lib/countdown.ts`
  comparando `Date.now()` com `EVENTO.dataHoraISO`; a `page.tsx` (Server
  Component) escolhe a árvore de componentes.
  ⚠️ **Cuidado com cache:** Server Component estático não reavalia a data. Usar
  `export const dynamic = 'force-dynamic'` **ou** `export const revalidate = 3600`
  na `page.tsx`, senão a página fica congelada no estado "antes do evento".
  Verificar com um deploy de teste que a troca de estado realmente acontece.

- **T8.5 — Pausar o tráfego pago é tarefa humana, não de código.**
  Registrar em `INFRA.md`: em 01/08 após o leilão, pausar as campanhas de Meta/
  Google que apontam para `saogeraldo.*`. Nenhum estado pós-evento compensa
  queimar verba em anúncio de evento encerrado.

**Critério de verificação:**
- Marquee de logos roda; com `prefers-reduced-motion: reduce` vira grade estática
  centralizada, **sem corte visual**.
- Sticky CTA aparece após rolar o hero e **some** quando o formulário entra na
  viewport (não pode cobrir campo ativo).
- Simulando data pós-evento (mock de `Date.now()` ou alterando temporariamente
  `EVENTO.dataHoraISO` para o passado): a página renderiza o estado terminal,
  o countdown some, o formulário continua funcional.
- `curl -sI` na página após o evento não devolve HTML cacheado do estado antigo.
- Rodapé credita São Geraldo/7P como **vendedores**, com a logo da **Bula** como
  marca (BRIEF §1 — verificação por leitura humana).

**Dependências:** Fase 3 (copy), Fase 5 (hero/countdown existem).

---

## Fase 9 — Tracking, GTM e conversão — CRÍTICA

**Objetivo:** A conversão do lançamento chega ao Meta com a mesma arquitetura que
já funciona no `/touros`, sem regressão dos invariantes 1 e 2.

**Esta é a fase onde os invariantes morrem se alguém "melhorar" o código.**
Leia INV-1 e INV-2 antes de tocar em qualquer arquivo aqui.

**Tarefas:**

- **T9.1 — Forkar `_lib/analytics.ts`.**
  Copiar de `/touros`. Renomear eventos para `sg7p_*`.
  **PRESERVAR (INV-2):** o módulo **não** empurra nada ao `dataLayer`. Não
  adicionar `window.dataLayer.push(...)` "para facilitar o GTM" — o container tem
  acionador catch-all que dispararia Meta/GA4 a cada micro-evento e duplicaria
  PageView. O comentário de topo do arquivo original explica; **manter o
  comentário no fork**, ele é a documentação viva da decisão.
  PostHog continua NO-OP se `NEXT_PUBLIC_POSTHOG_KEY` estiver vazia.
  `trackLeadConversion` mantém a diferenciação de `value` (MQL=100 / não-MQL=10)
  e o `event_id` para dedup futuro com CAPI.

- **T9.2 — Configurar o GTM conforme a decisão T0.3.**
  Se **(A) reusar `GTM-K8RXFDDT`**: no container, **estender os gatilhos de Page
  View** para casar também com `/obrigado-sg7p-mql` e `/obrigado-sg7p-lead`, e
  garantir que a tag de conversão do Meta (`fb_conversions_mpi`) dispara nesses
  gatilhos. Sem isso, a conversão do lançamento **simplesmente não existe**.
  Se **(B) container novo**: criar container, recriar tag de conversão + gatilhos,
  setar `NEXT_PUBLIC_GTM_ID` no ambiente do subdomínio.
  Registrar em `INFRA.md` o que foi criado, com nome exato de tag e gatilho.

- **T9.3 — Validar a conversão ponta a ponta com GTM Preview.**
  Roteiro: abrir a landing com GTM Preview conectado → preencher o formulário →
  submeter → verificar no Preview que, **na URL de obrigado**, o gatilho Page View
  disparou e a tag de conversão do Meta rodou. Confirmar em paralelo com o Meta
  Pixel Helper.
  Rodar **duas vezes**: um caminho MQL e um não-MQL, para validar as duas URLs.

- **T9.4 — Verificação anti-regressão de INV-1 e INV-2.**
  Comandos de guarda, para rodar antes de qualquer merge:
  ```
  # INV-1 — navegação HARD, nunca router
  grep -n "location.assign" src/app/saogeraldo/_components/Formulario.tsx   # deve achar
  grep -rn "useRouter\|router.push" src/app/saogeraldo/_components/Formulario.tsx  # deve ser vazio

  # INV-2 — analytics não toca o dataLayer
  grep -rn "dataLayer" src/app/saogeraldo/_lib/analytics.ts                 # deve ser vazio
  ```
  Se qualquer um falhar, a conversão está quebrada — **bloquear o deploy**.

- **T9.5 — Conferir a captura de UTM/fbclid/gclid ponta a ponta.**
  Abrir a landing com
  `?utm_source=meta&utm_medium=cpc&utm_campaign=sg7p&ad-id=123&fbclid=abc`,
  submeter, e confirmar que `extra_data.utm` no `crm_leads` chegou completo
  (incluindo `fbclid`) e que a chave em `sessionStorage` é **`sg7p_utm`**, não
  `touros_utm`.

**Critério de verificação:**
- GTM Preview mostra a tag de conversão do Meta disparando na URL de obrigado,
  nos dois caminhos (MQL e não-MQL).
- Meta Pixel Helper mostra **um** evento `Lead` por cadastro — **não dois**
  (duplicação = alguém empurrou ao `dataLayer`, INV-2 violado).
- Os 3 greps de T9.4 passam.
- Sem `NEXT_PUBLIC_POSTHOG_KEY`: página carrega e converte normalmente,
  console limpo.
- PostHog recebe `sg7p_lead_submitted` com `is_mql` e `value` corretos.

**Dependências:** Fase 4 (URLs de obrigado), Fase 5 (formulário), Fase 8 (página
completa). Consome a decisão T0.3.

---

## Fase 10 — QA, acessibilidade, performance e go-live

**Objetivo:** Validar ponta a ponta e liberar o tráfego pago.

**Checklist de go-live:**

- **T10.1 — Funcional.** Cadastro real cria lead correto em `crm_leads` com
  `source='leilao-sg7p'`; MQL avaliado no servidor; UTMs gravados; consentimento
  obrigatório bloqueando; erro de rede mostra estado de erro sem perder o lead.
- **T10.2 — Invariantes.** Os 6 invariantes reconferidos um a um:
  INV-1 (grep + aba Network mostrando documento novo),
  INV-2 (grep + Pixel Helper sem duplicata),
  INV-3 (dois POSTs de curl, MQL e não-MQL),
  INV-4 (`select telefone, celular from crm_leads` do lead de teste — os dois
  preenchidos),
  INV-5 (grep de copy comercial em `_components/` → vazio),
  INV-6 (DevTools: inputs 16px, alvos ≥44px).
- **T10.3 — Acessibilidade.** Contraste AA em todas as superfícies (atenção ao
  `light.gold` que só passa ≥18px); labels associadas via `htmlFor`; erros com
  `role="alert"` e `aria-describedby`; navegação por teclado completa no
  formulário com anel de foco visível; `prefers-reduced-motion` sem animação em
  countdown, marquee e reveals.
- **T10.4 — Mobile e performance.** Teste em celular real (não só DevTools):
  sem scroll horizontal, CTAs alcançáveis com o polegar, formulário em coluna
  única, sem zoom ao focar input (16px).
  Lighthouse mobile: **Performance ≥ 90, LCP < 2.5s, CLS < 0.1**.
  Todas as imagens com `sizes`; hero `priority`; catálogo `lazy`.
- **T10.5 — Conteúdo.** Data, hora e as 4 condições de pagamento conferidas
  contra o BRIEF §2 por leitura humana. Nenhum `[PENDENTE]` ou `[VALIDAR]`
  visível na página renderizada. Nenhum claim numérico não validado no ar.
- **T10.6 — SEO/OG.** `title`/`description` do lançamento; OG image 1200×630;
  `robots: index` na landing e `noindex` nas duas páginas de obrigado.
- **T10.7 — Domínio.** `https://saogeraldo.bulaassessoria.com` abre a landing
  (não 404, não a home do app) com SSL válido — validando a estratégia de
  roteamento descoberta em T0.1/T0.2.
- **T10.8 — Escopo.** `grep -rn "dispatchCrmWelcome\|baileys\|whatsapp/send" src/app/saogeraldo/ src/app/api/saogeraldo/`
  → **vazio** (nenhum disparo de WhatsApp, mesma regra do `/touros`).
- **T10.9 — Build.** `npm run build` limpo, sem erro de tipo/lint na rota nova.
- **T10.10 — Aprovação do cliente** para subir tráfego, por escrito.

**Critério de verificação:** checklist 100% ✔, `npm run build` verde, um lead de
teste percorrendo formulário → `crm_leads` → planilha → conversão no Meta,
e o domínio resolvendo com SSL.

**Dependências:** Fase 9.

---

## 🔒 Tarefas bloqueadas — mapa consolidado

| Tarefa | Bloqueada por (BRIEF §4) | Fase | Impacto se não destravar | Contingência |
|---|---|---|---|---|
| **T1.6** anexar `videoUrl` aos lotes | Link do YouTube quebrado | 1 | Sem vídeos de lote | `videoUrl: null` → botão não renderiza |
| **T7.4** botão "ver o vídeo" | idem (via T1.6) | 7 | idem | idem |
| **T6.3** divisão UF → faixa de frete | Divisão UF não confirmada | 6 | Frete sem lista de estados | Faixas renderizam só rótulo+detalhe; **ou** leitura visual do mapa no PDF |
| **T5.4** local e transmissão no hero | Local/transmissão não informados | 5 | Página não diz onde é | Campos `null` são omitidos; entram sem tocar em componente |
| **T8.2** leiloeira no rodapé | Leiloeira não informada | 8 | Sem crédito da leiloeira | `EVENTO.leiloeira = null` → omitido |
| **T8.1** claim de escala | Claims `[VALIDAR]` do `/touros` | 8 | Claim não revalidado no ar | Usar formulação qualitativa sem número até validar |
| **T10.5** aprovação de conteúdo | Cliente | 10 | Não sobe tráfego | — |

**Desbloqueada por evidência (não espera cliente):**
- **Ano do evento** → 2026 (01/08/2026 é sábado; PDF gerado 24/07/2026). Isolado em
  `EVENTO.dataHoraISO`. Confirmar com o cliente, mas **não bloquear a Fase 5**.
- **Fotos dos lotes** → o PDF está disponível em `~/Downloads/`, extração viável
  (T1.4). O pacote oficial do cliente, se vier, substitui os arquivos no mesmo path.

**Nenhuma tarefa do caminho crítico está bloqueada.** Todos os bloqueios acima
são de enriquecimento e têm contingência de render.

---

## Decisões que precisam do cliente (fora as pendências do BRIEF §4)

| Decisão | Fase | Default se não responder |
|---|---|---|
| Container do GTM: reusar ou novo | 0 / 9 | **Reusar** `GTM-K8RXFDDT`, estendendo os gatilhos |
| Destino do lead na planilha | 0 / 4 | **Aba dedicada** `LEADS SG7P` |
| Redirect pós-obrigado para grupo de WhatsApp | 4 | **Sem redirect** nesta versão |
| Estado pós-evento (01/08 12h) | 8 | **Estado "evento encerrado"** na própria página, com formulário mantido |
| Hospedar o PDF do catálogo no site | 7 | Link para `fazendasaogeraldo.com.br` |

---

## ✂️ Corte mínimo de go-live (linha de corte em D-2, 30/07)

Se em 30/07 o plano completo não estiver viável, **entrega-se isto e nada menos**:

**Obrigatório (não corta em nenhuma hipótese):**
- Fase 0 completa (domínio + GTM decidido)
- Fase 2 (rota + cache)
- Fase 3 (copy + `evento.ts`)
- Fase 4 (API + páginas de obrigado)
- Fase 5 (hero + countdown + formulário)
- Fase 9 (tracking validado no GTM Preview)
- Fase 10 itens T10.1, T10.2, T10.7, T10.9

**Cortável, nesta ordem:**
1. **T7.2** grade de lotes → fica só o resumo numérico (T7.1)
2. **Fase 7 inteira** → o catálogo vira um link para o PDF
3. **T6.2/T6.3** bloco de frete → mantém só pagamento (T6.1), que é a oferta mais forte
4. **T8.3** sticky CTA
5. **T8.4** estado pós-evento → substituir por redirect 308 para `/touros` (opção A)

**Nunca cortável:** formulário, decisão de MQL no servidor, navegação hard,
páginas de obrigado, gatilho de conversão no GTM. Sem qualquer um deles, a
página capta lead que ninguém mede — ou não capta.

---

## Fora de escopo (declarado)

- **Campo touro/matriz no formulário** — removido pelo cliente (BRIEF §3.1). O
  catálogo é 100% touros.
- **Qualquer disparo/automação de WhatsApp** (`dispatchCrmWelcome`, Baileys,
  Cloud API) — mesma regra do `/touros`.
- **Mudança de schema do CRM** — reusa `crm_leads` e o `funnel_id` existentes.
- **Índices genéticos completos por lote** (DEP/TOP%, iABCZ/DECA, MGTe) — 28
  números por lote, ilegíveis em mobile; permanecem no catálogo em PDF.
- **Meta Conversions API (CAPI) server-side** — o `event_id` já é gerado e está
  pronto para dedup, mas a implementação fica para depois do lançamento.
- **A/B testing** — não há volume nem janela de tempo em 5 dias.
- **Alterações no `/touros`** — as duas landings são independentes; nenhuma
  mudança nesta feature pode tocar `src/app/touros/` ou `/api/touros/`.
