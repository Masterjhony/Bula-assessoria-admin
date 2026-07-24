# Redesign Editorial-Cinematográfico — Landing `/touros` (Bula Assessoria)

> Plano faseado de **REskin VISUAL**. Sai do "design de IA" (cards glass, cantos
> arredondados, grids simétricos) para uma linguagem **editorial-cinematográfica**
> inspirada no benchmark Ferrari, personalizada à Bula.

---

## Objetivo e princípio

**Objetivo:** trocar a pele visual da landing `/touros` de uma estética "Apple × IA"
(vidro fosco, raios 10–18px, sombras suaves, grids de cards simétricos) para uma
linguagem **editorial-cinematográfica** — canvas near-black, corpo em cinza
editorial, dourado `#C8A96E` como única voltagem, cantos retos + hairlines, CAIXA
ALTA com tracking largo, números gigantes para dados de genética, foto full-bleed.

**Princípio inviolável — é RESKIN, não refatoração:**
- A **lógica** (form multi-step, validação, máscara de telefone, cidades IBGE,
  `is_mql`, submit para `/api/touros/lead`), o **tracking** (PostHog/Meta/GA4,
  eventos de funil, `trackLeadConversion`), a **conversão** e a **copy** ficam
  **exatamente como estão**. Só muda o `style`/`className`/estrutura visual.
- Nenhuma alteração em `_lib/analytics.ts`, `_lib/utm.ts`, `_lib/copy.ts` (salvo
  ajuste de copy só se o cliente pedir — fora do escopo deste redesign) e
  `src/app/api/touros/lead/route.ts`.
- Cada fase é reversível e verificável isoladamente. O build e os eventos de
  conversão são a rede de segurança.

**Benchmark:** `agentes-ai/agency-agents/awesome-design-md-main-desing-apple/design-md/ferrari/DESIGN.md`
(canvas near-black, corpo cinza, dourado como voltagem, retos/hairlines, caixa
alta, números gigantes, foto cinematográfica).

---

## Orquestração com os agentes paralelos

Este plano **aplica**. Duas fontes rodam em paralelo e alimentam as fases:

| Agente | Entrega | Consumido em |
|--------|---------|--------------|
| **Brand Guardian** | Spec de identidade Bula-Ferrari (paleta cinza editorial exata, escada tipográfica Oswald/Inter/Plex, uso do dourado, do/don't) | Fase 0 e 1 (tokens + primitivos) |
| **Frontend Developer** | Blueprint de implementação (padrões de layout editorial, tratamento de foto, StatNumber, grid assimétrico) | Fases 1–N (primitivos + reskin de seção) |

**Regra de sincronização:** Fase 0 e 1 só se consolidam depois de receber a spec do
Brand Guardian (valores de cor/tipo canônicos) e o blueprint do Frontend Developer
(assinaturas dos primitivos). Se a spec ainda não chegou, as Fases 0/1 usam os
valores-âncora deste documento como provisórios e são revisitadas quando a spec
fechar. As Fases 2+ dependem dos primitivos da Fase 1.

---

## Estado atual (paths reais conferidos)

Composição em `src/app/touros/page.tsx`:
`Hero` → `SubHero` → `ProvaSocial` → `Produto` → `Conscientizacao` → `Fechamento`
→ `Footer` → `StickyCta`.

```
src/app/touros/
  layout.tsx                      # aplica Inter + interFeatures no wrapper
  page.tsx                        # ordem das seções
  _lib/
    tokens.ts                     # dark/light palettes, interFeatures  ← EDITAR
    copy.ts                       # NÃO TOCAR (copy preservada)
    analytics.ts                  # NÃO TOCAR (tracking)
    utm.ts                        # NÃO TOCAR
  _components/
    ui.tsx                        # Section/Container/PillButton/Reveal/MultiLine ← EDITAR
    Hero.tsx                      # dobra + foto + LeadForm         ← RESKIN
    Formulario.tsx (LeadForm)     # form multi-step (GLASS aqui)    ← RESKIN só visual
    SubHero.tsx                   # faixa clara benefícios          ← RESKIN
    ProvaSocial.tsx               # logo wall grayscale             ← RESKIN
    Produto.tsx                   # pilares + foto                  ← RESKIN (números-ficha)
    Conscientizacao.tsx           # 3 cards + compromisso           ← RESKIN
    Fechamento.tsx                # CTA final                       ← RESKIN
    Footer.tsx                    # rodapé                          ← RESKIN leve
    StickyCta.tsx                 # CTA fixo mobile                 ← RESKIN leve
```

**Fontes já carregadas** (via `<link>` em `src/app/layout.tsx`, disponíveis por
nome de família — não há CSS var): `Inter` (300–800), `Oswald` (400–700),
`IBM Plex Mono` (400/500), `Pinyon Script`. `globals.css` já usa Oswald para
títulos condensados da marca. **Nenhuma fonte nova precisa ser adicionada.**

---

## O que PRESERVAR (não tocar na lógica)

- **Form multi-step** (`Formulario.tsx`): `TOTAL=3`, `STEP_FIELDS`, `goNext`/`goBack`,
  `AnimatePresence`, estados `idle/submitting/success/error`.
- **Validação**: `validate()`, `validateStep()`, `applyPhoneMask()`, regras de
  WhatsApp/UF/cabeças/IE/consent, `focusFirstError`, `data-invalid`.
- **Cidades IBGE**: effect com `AbortController`, ordenação.
- **Tracking**: todos os `trackFunnel(...)` (`touros_form_started`,
  `touros_step_attempt`, `touros_step_reached`, `touros_validation_failed`,
  `touros_submit_attempt`), `initAnalytics`, `captureUtms`, o `IntersectionObserver`
  de `Produto` (`touros_produto_view` → ViewContent/view_item).
- **`is_mql` e conversão**: `trackLeadConversion({ isMql, eventId, ... })`, o
  `event_id`/dedup, o payload do `fetch('/api/touros/lead')` — campos e nomes.
- **Copy**: todo texto vem de `_lib/copy.ts`. Não reescrever copy neste redesign.
- **Acessibilidade funcional**: `Field` (label↔controle via `cloneElement`,
  `aria-invalid`, `aria-describedby`), `role="radiogroup"`/`radio`, `role="alert"`,
  anel de foco visível do `#cadastro`, `useReducedMotion`, `min-height ≥16px`
  nos inputs (evita zoom iOS).
- **SEO/OG**: `layout.tsx` metadata, `themeColor`.

> Teste de preservação: um `git diff` das fases de reskin só deve mostrar
> mudanças em `style`, `className`, JSX estrutural de apresentação e imports de
> primitivos — **nunca** em nomes de eventos, payload, condições de validação ou
> chamadas de rede.

## O que MATAR (a pele "de IA")

- **Glass / backdrop-blur**: o `cardStyle` do `Formulario.tsx`
  (`backdropFilter: blur(28px) saturate(155%)`, `rgba(255,255,255,0.72)`,
  borda specular, `inset` highlight) e os inputs translúcidos
  (`inputStyle`: `rgba(255,255,255,0.82)`).
- **Raios grandes / pílulas**: `borderRadius: 9999` dos botões (`PillButton` e os
  botões do form → vira reto ou raio ≤2px), `rounded-[18px]` de Produto,
  Conscientizacao e do card do form; `rounded-full` decorativos (bullets viram
  quadrados/hairlines ou traços).
- **Sombras suaves**: `boxShadow: 0 30px 60px/80px ...` de Produto e do form
  (a "única sombra do sistema" some — profundidade vem de superfície e hairline).
- **Grids de cards simétricos**: os 3 cards `md:grid-cols-3` de Conscientizacao
  (viram lista/linhas com hairline e número gigante); grid 5-col simétrico da
  ProvaSocial revisto para faixa editorial.
- **Círculos `goldDim`** atrás de ícones (SubHero, Conscientizacao) → traço/numeral.
- **Tracking negativo "Apple tight"** e ausência de caixa alta nos displays →
  substituídos por Oswald caixa alta + tracking largo positivo nos eyebrows/títulos.
- **Comentários e naming "Apple × Bula"** nos arquivos editados → atualizar para
  "editorial-cinematográfico" para não confundir manutenção futura.

---

## Fases

Cada fase: **objetivo · tarefas (arquivos reais) · verificação · dependências**.

---

### Fase 0 — Tokens de superfície + tipografia editorial

**Objetivo:** estabelecer o vocabulário visual base: cinza editorial no corpo,
near-black no canvas, dourado como única voltagem, raios ~0, hairlines, e uma
escada tipográfica Oswald (display) / Inter (corpo) / IBM Plex Mono (números).

**Tarefas:**
- `src/app/touros/_lib/tokens.ts`:
  - Rebalancear a paleta `dark`: `bg` near-black (`#0B0B0B`/`#0D0D0D`), `text`
    branco quente, e introduzir **cinza editorial de corpo** (ex.: `body: #A8A6A2`
    substituindo o uso de `muted` para parágrafos longos) — valor canônico vem do
    Brand Guardian; usar âncora até lá. Manter `gold: #C8A96E`.
  - Adicionar `radius` tokens: `radius.none = 0`, `radius.hair = 2` (matar 9999/18).
  - Adicionar `hairline` já existe — garantir 1px sólido, não gradiente.
  - Exportar módulo de **tipografia**: `export const type = { display: 'Oswald, ...',
    body: 'Inter, ...', mono: '"IBM Plex Mono", ui-monospace, monospace' }` +
    presets de `letterSpacing` (tracking largo para eyebrow/caixa alta, ex.
    `0.14em`–`0.22em`) e pesos.
  - Rever a paleta `light` (parchment): decidir com Brand Guardian se o tile claro
    permanece (Ferrari é near-black-dominante). **Provisão:** manter tiles claros
    mas com corpo em cinza editorial escuro, não preto puro.
- `src/app/touros/layout.tsx`: manter Inter no wrapper; garantir que Oswald e Plex
  estão acessíveis por nome (já estão via root layout). Sem fonte nova.

**Verificação:**
- `import { type, radius } from './_lib/tokens'` compila; `npx tsc --noEmit` limpo
  para o diretório.
- Nenhum consumidor quebrado: `grep -rn "dark\.\|light\." src/app/touros` continua
  resolvendo (não remover chaves ainda em uso; só adicionar/rebalancear).
- Visual: página ainda renderiza (`next build` ou dev) — Fase 0 não altera JSX.

**Dependências:** spec do Brand Guardian (cores/tracking canônicos). Sem deps de código.

---

### Fase 1 — Primitivos editoriais em `ui.tsx`

**Objetivo:** criar/reformar os blocos de construção que todas as seções vão
consumir, para que o reskin de seção seja "trocar wrapper", não reinventar.

**Tarefas (`src/app/touros/_components/ui.tsx`):**
- `Section` — manter API (`surface`), remover qualquer arredondamento; ritmo
  vertical editorial (respiro maior, sem divisórias decorativas — só troca de
  superfície + hairline opcional).
- **`Eyebrow`** (novo) — sobrescrita em CAIXA ALTA, Oswald ou Inter 600, tracking
  largo (`0.18em`+), cor dourada; substitui os `<p className="uppercase">` repetidos
  em Hero/Produto/Conscientizacao.
- **Botão editorial** — reformar `PillButton` → `Button` **reto** (raio 0/2px),
  dourado sólido, CAIXA ALTA + tracking, seta opcional; **manter o nome exportado
  ou criar alias** para não quebrar `Fechamento`/`StickyCta`/form. Preservar
  `whileTap`, `href`/`onClick`/`disabled`/`full`.
- **`StatNumber`** (novo) — numeral gigante (IBM Plex Mono ou Oswald), com rótulo
  pequeno em caixa alta abaixo; para DEPs/escala/quantidades de genética
  (ex.: "+1.000", DEPs). Aceita `value`, `label`, `surface`.
- **`Hairline`** (novo) — filete 1px full-bleed ou contido, cor `hairline`;
  substitui bordas de card e divisórias.
- Manter `Container`, `Reveal`, `MultiLine`, `palette` (usados amplamente).

**Verificação:**
- `npx tsc --noEmit` limpo.
- Todos os importadores atuais de `PillButton` continuam compilando (alias ou
  rename com atualização dos 3 call-sites: `Fechamento.tsx`, `StickyCta.tsx`,
  e os botões inline do form se migrados).
- Storybook-livre: renderizar temporariamente `Eyebrow/StatNumber/Hairline` numa
  seção de teste ou inspecionar via dev.

**Dependências:** Fase 0 (tokens `type`/`radius`); blueprint do Frontend Developer
(assinaturas de `StatNumber`/`Button`).

---

### Fase 2 — Reskin do Hero (dobra cinematográfica)

**Objetivo:** transformar a 1ª dobra em cena editorial: foto full-bleed
cinematográfica, título Oswald CAIXA ALTA, eyebrow dourado, corpo cinza — mantendo
o `LeadForm` na dobra (`#cadastro`).

**Tarefas (`src/app/touros/_components/Hero.tsx`):**
- Título `h1` → Oswald, CAIXA ALTA, tracking ajustado, peso alto; usar `Eyebrow`
  para `hero.eyebrow`.
- Véu de legibilidade: manter gradiente **funcional** sobre a foto (não é
  "decoração de IA"; garante contraste WCAG). Ajustar para leitura editorial.
- Bullets `rounded-full` dourados → traços/hairline ou numerais.
- Watermark "B" monograma: manter ou converter em elemento tipográfico editorial
  (avaliar com Brand Guardian).
- **Preservar**: `id="cadastro"`, `<Image priority>` LCP, anel de foco `<style>`,
  `colorScheme: dark`, montagem do `<LeadForm/>`.

**Verificação:**
- Hero renderiza; foto continua LCP `priority`.
- Anel de foco dourado ainda visível ao tabular no form.
- Sem `backdrop`/`blur`/raio grande introduzido.
- Lighthouse/manual: contraste do título e do corpo sobre a foto ≥ 4.5:1.

**Dependências:** Fase 1. **Pendência:** foto cinematográfica definitiva (ver
Pendências) — usar `IMG_0059.jpg` como provisória.

---

### Fase 3 — Reskin do LeadForm (matar o glass, manter a lógica)

**Objetivo:** substituir o cartão de vidro por um **painel editorial** (superfície
sólida ou near-black com hairline, cantos retos) sem tocar em uma linha de lógica.

**Tarefas (`src/app/touros/_components/Formulario.tsx`) — SÓ apresentação:**
- Trocar `cardStyle` (backdrop-blur, rgba translúcido, boxShadow, borda specular)
  por painel sólido: fundo (parchment sólido ou near-black), `border: 1px hairline`,
  `borderRadius: 0/2px`, sem sombra.
- `inputStyle`: fundo sólido (branco/near-black), borda hairline reta, raio ~0,
  foco dourado; **manter `minHeight:48`, `fontSize:16` (anti-zoom iOS),
  `appearance:none`**.
- Botões `Continuar`/`Voltar`/`submit`: raio 9999 → reto, dourado sólido, caixa
  alta (reusar `Button` da Fase 1 ou alinhar estilos inline).
- Barra de progresso e "Passo X de Y": manter função; estética editorial (filetes).
- Botões IE Sim/Não `borderRadius:10` → retos.
- **NÃO TOCAR**: `FormData`, `EMPTY`, `validate`, `validateStep`, `applyPhoneMask`,
  `goNext/goBack/handleSubmit`, `fetch('/api/touros/lead')` + payload, todos os
  `trackFunnel`/`trackLeadConversion`, `event_id`, estados, `Field`, aria.
- Atualizar o comentário "Liquid Glass" para descrever o painel editorial.

**Verificação:**
- `git diff Formulario.tsx` mostra mudanças **apenas** em: `cardStyle`, `inputStyle`,
  estilos de botões, comentários, className. Nenhuma mudança em handlers/payload/eventos.
- Fluxo completo dev: preencher 3 passos → submit → `success`; conferir no console/
  PostHog que `touros_form_started`, `touros_step_reached`, `touros_submit_attempt`
  e a conversão disparam.
- `grep -n "backdrop\|blur\|9999" Formulario.tsx` → 0 ocorrências de glass/pílula.

**Dependências:** Fase 1 (Button), Fase 2 (superfície do Hero define contraste do painel).

---

### Fase 4 — Reskin ProvaSocial (logo wall editorial)

**Objetivo:** faixa de prova social editorial, com o número de escala como
statement em `StatNumber`, logos em grayscale sóbrio.

**Tarefas (`src/app/touros/_components/ProvaSocial.tsx`):**
- `Eyebrow` para o rótulo; a linha "+1.000 touros PO..." vira **`StatNumber`**
  (numeral gigante Plex/Oswald "+1.000" + rótulo caixa alta).
- Rever a grade 5-col simétrica: manter equalização de massa (`scale`) mas
  apresentação em faixa/tira editorial com hairlines separadoras, não "cartões".
- Manter tile claro ou migrar para near-black conforme Brand Guardian.

**Verificação:** renderiza; logos legíveis; número em destaque; sem card/raio grande.
Marcador `[VALIDAR]` do número permanece até confirmação do cliente.

**Dependências:** Fase 1 (`StatNumber`, `Eyebrow`, `Hairline`).

---

### Fase 5 — Reskin Produto (ficha de genética com números)

**Objetivo:** transformar os pilares em uma **ficha técnica editorial** com
números-ficha (DEPs/escala/margem) em `StatNumber`, foto cinematográfica sem raio
nem sombra suave.

**Tarefas (`src/app/touros/_components/Produto.tsx`):**
- Foto: remover `rounded-[18px]` e `boxShadow` → retangular full-bleed/hairline.
- Pilares `produto.pillars`: apresentar como linhas de ficha com hairline
  (`Hairline`) e, onde houver dado numérico, `StatNumber` gigante.
- `Eyebrow` no rótulo; título Oswald caixa alta.
- **Preservar** o `IntersectionObserver` + `trackFunnel('touros_produto_view', ...
  { meta:'ViewContent', ga:'view_item' })` e o `ref`.

**Verificação:**
- `git diff` não altera o effect de tracking nem o `ref`.
- Evento `touros_produto_view` ainda dispara ao rolar a seção.
- Sem raio grande/sombra na foto.

**Dependências:** Fase 1. **Pendência:** foto de produto definitiva.

---

### Fase 6 — Reskin Conscientizacao (de cards para pauta editorial)

**Objetivo:** trocar os 3 cards `goldDim`+`rounded-[18px]` por uma **pauta
numerada editorial** (01/02/03 gigantes, hairlines), e o "compromisso" por um
bloco de citação com filete dourado reto.

**Tarefas (`src/app/touros/_components/Conscientizacao.tsx`):**
- `c.points` (3): de grid de cards → lista/linhas com numeral gigante
  (`StatNumber`/Oswald `01`,`02`,`03`), hairline separadora; remover
  `rounded-[18px]`, `goldDim`, círculos de ícone (ícones opcionais em traço).
- Bloco `c.commitment`: manter a barra dourada, mas reta e sem raio 18px.
- `Eyebrow` + título Oswald.

**Verificação:** renderiza; copy intacta (`c.*`); `grep "rounded-\[18px\]\|goldDim"`
→ 0 no arquivo; ícones lucide mantidos ou substituídos por traço editorial.

**Dependências:** Fase 1.

---

### Fase 7 — Reskin Fechamento + Footer + StickyCta (arremate)

**Objetivo:** fechar o ritmo editorial no CTA final e nos elementos persistentes.

**Tarefas:**
- `Fechamento.tsx`: título Oswald caixa alta; `PillButton` → `Button` reto
  (href `#cadastro` preservado, `hero.cta` preservado).
- `StickyCta.tsx`: CTA fixo mobile reto/dourado; **preservar** a lógica de
  show/hide por scroll e o `formVisibleRef` (não é lógica de conversão, mas é UX
  funcional — só reskin do botão).
- `Footer.tsx`: reskin leve (hairline, tipografia).

**Verificação:** CTAs levam a `#cadastro`; sticky aparece/some corretamente no
mobile; sem raio 9999.

**Dependências:** Fase 1.

---

### Fase 8 (FINAL) — QA visual + a11y + regressão de conversão + build

**Objetivo:** garantir que o redesign entregou a linguagem editorial **sem**
regressão de acessibilidade nem de conversão/tracking, e que o build passa.

**Tarefas de verificação:**
1. **Auditoria "matar glass"** — busca global no diretório:
   `grep -rn "backdrop\|blur\|9999\|rounded-\[1[0-8]px\]\|boxShadow.*0 [0-9]" src/app/touros/_components`
   deve retornar **apenas** ocorrências intencionais (idealmente 0 de glass/pílula).
2. **A11y / contraste do cinza editorial** — o corpo em cinza editorial é o maior
   risco de regressão: verificar contraste do texto cinza sobre near-black e sobre
   parchment ≥ 4.5:1 (corpo) / 3:1 (texto grande) via axe/Lighthouse. Anel de foco
   dourado, labels, `aria-*`, `role`s e `reduced-motion` intactos.
3. **Regressão de conversão/tracking** — fluxo E2E manual em dev:
   preencher os 3 passos → submit → success; confirmar no console + PostHog/Meta
   os eventos: `touros_form_started`, `touros_step_reached`, `touros_submit_attempt`,
   `touros_validation_failed` (forçando erro), `touros_produto_view` (scroll),
   e a conversão `trackLeadConversion` com `is_mql` correto (testar lead ≥100
   cabeças + IE = MQL vs. lead pequeno = não-MQL). Payload de `/api/touros/lead`
   idêntico ao atual (comparar via network tab / `git diff` do payload).
4. **Build** — `npm run build` (Next.js 16) verde; `npx tsc --noEmit` limpo;
   lint sem novos erros.
5. **Diff de preservação** — revisar `git diff` de `Formulario.tsx`, `Produto.tsx`,
   `analytics.ts` (deve estar intocado), `copy.ts` (intocado), `route.ts` (intocado).

**Verificação (done):** todos os itens 1–5 passam; screenshots antes/depois
aprovadas; nenhum evento de funil perdido.

**Dependências:** Fases 2–7.

---

## Grafo de dependências (ondas)

| Onda | Fases | Paraleliza? |
|------|-------|-------------|
| 1 | Fase 0 (tokens) | — (base) |
| 2 | Fase 1 (primitivos) | depende de 0 |
| 3 | Fase 2 (Hero) → Fase 3 (LeadForm) | 3 depende de 2 (mesma dobra) |
| 3 | Fase 4, 5, 6, 7 | **paralelas entre si** (arquivos disjuntos), todas dependem de 1 |
| 4 | Fase 8 (QA final) | depende de todas |

> Fases 4/5/6/7 tocam arquivos distintos e podem ser executadas em paralelo após
> a Fase 1. Fases 2 e 3 compartilham a dobra do Hero → sequenciais.

---

## Pendências (bloqueiam "definitivo", não o início)

1. **Foto cinematográfica definitiva** — hoje o Hero usa `/jmp/galeria-touros/IMG_0059.jpg`
   e o Produto `/jmp/galeria-touros/IMG_0037.jpg` (candidatas). A foto full-bleed
   editorial definitiva deve entrar em `public/touros/`. Fases 2 e 5 funcionam com
   as provisórias; trocar o path quando a arte chegar. Também atualizar a imagem OG
   em `layout.tsx` se a definitiva mudar.
2. **Confirmar Oswald como fonte de display** — Oswald já está carregada e é usada
   nos títulos condensados da marca em `globals.css`; o benchmark Ferrari pede
   display condensado caixa alta, o que casa. **Confirmar com Brand Guardian** que
   Oswald (vs. uma condensada alternativa) é a voz de display oficial antes de
   consolidar a Fase 0/1.
3. **Valores canônicos do cinza editorial e do tracking** — dependem da spec do
   Brand Guardian. Até lá, usar as âncoras deste documento como provisórias.
4. **Destino dos tiles claros (parchment)** — Ferrari é near-black-dominante;
   decidir com Brand Guardian se `SubHero`/`ProvaSocial` migram para near-black ou
   permanecem claros com corpo em cinza editorial escuro.
5. **Números de escala `[VALIDAR]`** — o "+1.000 touros PO" da ProvaSocial ainda
   aguarda validação do cliente; o `StatNumber` renderiza o placeholder até lá.
