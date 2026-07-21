---
project: web-bula
feature: touros-perpetuo
type: phased-build-plan
route: /touros
domain: touros.bulaassessoria.com
created: 2026-07-21
---

# Plano de Construção — Landing de Funil Perpétuo de Touros (Bula Assessoria)

## Visão Geral

Construir **UMA página única de conversão** (`/touros`) para tráfego pago (Meta/Google),
cujo único KPI é **cadastro qualificado de pecuarista interessado em comprar touros**.
A página vive **dentro do app Next.js `web-bula`** (não é projeto separado), reusa o
backend de lead já existente e o design system dark+dourado da Bula, aplicando por cima
os princípios de layout "photography-first" da Apple.

**Stack confirmada (paths verificados neste plano):**
- Next.js 16.1.4 App Router, React 19, TypeScript, Tailwind CSS v4 (`@import "tailwindcss"` em `src/app/globals.css`).
- framer-motion 12, lucide-react, next-themes, `sharp` (otimização de imagem), `next/image`.
- Supabase (`@supabase/ssr` + `supabase-js`) via `src/lib/supabase.ts` (`supabaseAdmin()`).
- PostHog: `posthog-node` instalado no app; padrão de `posthog-js` sob demanda existe em `jmp-landing/src/analytics/posthog.ts`.
- `@google-analytics/data` instalado (server-side; para GA4 client usaremos gtag).

**Fonte da verdade de design:** tokens Bula em `src/app/globals.css` (dark por padrão) +
princípios Apple de `/Users/joaogabrielsantosdosanjos/Documents/agentes-ai/agency-agents/awesome-design-md-main-desing-apple/design-md/apple/DESIGN.md`.

**Problema de negócio central (repetido para todo executor):**
> O lead se cadastra e **não responde o WhatsApp** → chega frio ao comercial. A página
> precisa CONSCIENTIZAR o lead, antes e durante o cadastro, de que haverá contato humano
> consultivo pela equipe/WhatsApp e que ele precisa responder. Solução 100% a nível de
> página: **copy + design + UX do formulário**. **NÃO** mexer em disparo/automação de
> WhatsApp (fora de escopo, decisão explícita do cliente).

### Tradução Apple × Bula (aplicar em todas as fases de UI)

| Princípio Apple | Tradução para a Bula |
|---|---|
| Photography-first, chrome recede | Foto do touro/pasto domina o hero e seções; UI quieta sobre `--bg #0D0D0D` |
| UM accent interativo (Apple = azul #0066cc) | **Accent único = dourado `--gold #C8A96E`** (nunca introduzir 2º accent) |
| Headlines 600 + letter-spacing negativo | Inter 600, `letter-spacing: -0.01em` a `-0.02em` em displays |
| Body a 17px, leading 1.47 | Body ~17px (root é 14px → usar `text-[17px]`/rem), leading generoso |
| Seções edge-to-edge alternando claro/escuro | Alternar `--bg`/`--surface`/faixa-foto; a troca de superfície É o divisor |
| Section spacing ~80px | Padding vertical de seção 80px desktop → 48px mobile |
| Sombra-assinatura só sob a imagem do produto | Uma única `box-shadow` suave só sob a foto do touro em destaque |
| Sem gradiente decorativo; atmosfera vem da foto | Profundidade via foto real + overlay escuro legível, não gradiente de enfeite |
| Touch target ≥ 44px | Botões/inputs do form ≥ 44px (tráfego é mobile-first) |

### Princípio transversal #1 — MOBILE-FIRST (requisito de topo do cliente)

O tráfego pago vem **majoritariamente de celular**. Mobile-first é regra transversal em
**TODAS** as fases de UI (Hero, Sub-hero, Processo, Conscientização, Formulário), não apenas
numa fase de responsividade. Para cada seção:
- Desenhar e validar **primeiro** no viewport ~375–430px; só depois expandir para tablet/desktop.
- Tipografia com `clamp()` partindo do tamanho mobile; nada de "encolher depois".
- Formulário em **coluna única** por padrão, inputs/CTAs ≥44px, teclados mobile corretos.
- Foto do hero pode trocar de art-direction/crop no mobile (retrato) para enquadrar o touro.
- A Fase 7 vira **auditoria/refino** de mobile+performance, não o momento em que mobile "começa".

### Princípio transversal #2 — Reuso de copy e fotos já aprovadas

**Copy/tom comercial já aprovado** vive em `jmp-landing/src/content.ts` (`DEFAULT_CONTENT`) —
reutilizar ângulos e claims, **adaptando para venda perpétua** (remover datas de evento como
"10 a 12 de julho"/"Mega Baviera"; manter o foco na QUALIDADE do touro/genética):
- Ângulo de valor: "A equipe de assessores da Bula te ajuda a entender a genética, escolher os
  animais certos e dar o lance certo."
- Benefícios (adaptar): "Assessoria de compra 100% gratuita" · "Leitura da genética e dos
  números do catálogo" · "Ajuda pra escolher os animais certos pro seu rebanho" · "Apoio na
  habilitação e no pós-leilão".
- Prova de autoridade/escala (forte): "A Bula Assessoria foi responsável pelo aparte de **1.000
  touros JMP — a cabeceira da safra**." → vira prova social do hero/sub-hero.

**Fotos já disponíveis no projeto** (cliente autorizou usar todas). URLs servidos (arquivos em
`public/` → URL sem o prefixo `public/`):
- Galeria de touros (hero/prova): `/jmp/galeria-touros/IMG_0003.jpg`, `IMG_0006.jpg`, `IMG_0037.jpg`, `IMG_0059.jpg`
- `/jmp/capa-playlist-touros.jpg` · `/jmp/foto-bulinha-bg.jpeg` (já usada como bg na landing JMP) · `/jmp/foto-leilao-eao.jpeg`
- Institucionais: `/institucional/terra-brava-universo.jpg`, `/institucional/camparino-ford-fiv.webp`
- `/bula/assets/img/agenda-hero-nelore.png`
- **Logos de criatórios (prova social)** em `/criatorios/*.png`: `nelore-jmp`, `terra-brava-agropecuaria`,
  `fazenda-camparino`, `nelore-katayama`, `nelore-santa-nazare`, `nelore-cachoeirao`, `fazenda-jacamim`,
  `ls-agropecuaria`, `nelore-floc`, `nelore-mno`, `nelore-tresmar`, `santa-nice` (14 logos disponíveis).

Fotos definitivas do cliente ainda podem chegar (ver Pendências); as acima são candidatas reais
para não bloquear nenhuma fase.

### Estrutura de fases e dependências

```
Fase 0 (setup rota)  ─┬─► Fase 1 (backend lead)
                      └─► Fase 2 (design tokens da página)
Fase 2 ─► Fase 3 (hero) ─► Fase 4 (sub-hero + processo) ─► Fase 5 (conscientização)
Fase 1 + Fase 5 ─► Fase 6 (formulário + validação + integração)
Fase 6 ─► Fase 7 (auditoria mobile + performance de imagem)
Fase 7 ─► Fase 8 (tracking & conversão)
Fase 8 ─► Fase 9 (QA final + go-live)
```

Ordem de execução recomendada: 0 → 1 (paralelo com 2) → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9.

---

## Fase 0 — Setup da rota e assets base

**Objetivo:** Existir a rota `/touros` renderizando um esqueleto server-component, com a
estrutura de pastas de componentes client e a pasta de assets pronta para receber as fotos.

**Tarefas:**
1. Criar `src/app/touros/page.tsx` (Server Component) — metadata SEO/OG mínima (title,
   description comercial, `robots: index`, OG image), e um layout que empilha placeholders de
   seção `<Hero/> <SubHero/> <Processo/> <Conscientizacao/> <Formulario/>` (ainda stubs).
2. Criar `src/app/touros/layout.tsx` **apenas se** precisar forçar `data-theme="dark"` /
   isolar do chrome do app (a landing não deve ter a navbar do sistema). Decidir: a landing
   é chrome-free — garantir que nenhum header/nav global do app vaze para `/touros`.
3. Criar pasta de componentes `src/app/touros/_components/` e `src/app/touros/_lib/`
   (co-locados, prefixo `_` = não vira rota).
4. Criar pasta `public/touros/` para assets definitivos do cliente (fotos hero/OG). Adicionar
   `README.md` curto listando os arquivos esperados. **Nota:** as fotos candidatas já existem
   em `public/jmp/`, `public/institucional/`, `public/criatorios/` — não precisam ser movidas.
5. Adicionar regra de cache para `public/touros/*.(jpg|webp|png|svg)` em `next.config.mjs`
   (espelhar o bloco existente de `/jmp/`; o `/jmp/` e `/criatorios/` já são servidos com cache).

**Critério de verificação (goal-backward):**
- `next dev` → acessar `http://localhost:3000/touros` retorna 200 e renderiza os 5
  placeholders de seção, sem a navbar do app, sem erro no console.
- `public/touros/` existe; `next.config.mjs` tem a regra de cache dos assets.

**Dependências:** nenhuma (fase inicial).

---

## Fase 1 — Backend de lead da página (variante enxuta)

**Objetivo:** Endpoint público próprio da landing de touros que grava em `crm_leads` com
atribuição/funnel próprios, reusando as libs existentes, **sem** misturar com a campanha EAO
e **sem** tocar no disparo de WhatsApp.

**Decisão de arquitetura (recomendada, com trade-off explícito):**
- **CRIAR variante** `src/app/api/touros/lead/route.ts` (preferir sob `/api` para manter todas
  as APIs juntas).
- **Reusar** as libs: `supabaseAdmin` de `@/lib/supabase`; `ok/fail` de `@/lib/respond`;
  `CRM_STAGE_ENTRY`, `evaluateMql`, `DEFAULT_JMP_MQL_RULE`, `JMP_FUNNEL_ID` de `@/lib/crm-types`.
- **Diferenças vs `/api/jmp/lead`:**
  - `source: 'touros-perpetuo'` (em vez de `'jmp-landing'`).
  - `origem: 'Landing Touros — Funil Perpétuo'`.
  - `funnel_id`: reusar `JMP_FUNNEL_ID` (mesmo funil do CRM) OU um id próprio se o cliente
    quiser separar no board — deixar comentado e decidir com o cliente (default: reusar).
  - **NÃO importar nem chamar** `dispatchCrmWelcome` (WhatsApp welcome) — fora de escopo.
  - Efeitos colaterais de e-mail/planilha (`sendJmpWelcomeEmail`, `enrollLeadInEmailFlow`,
    `appendLeadToEaoSheet`): **decidir por flag** — default = NÃO reaproveitar a aba EAO
    (evita poluir atribuição da campanha do evento). Se o cliente quiser e-mail de
    boas-vindas, reusar `sendJmpWelcomeEmail` de forma best-effort. Marcar como decisão.
- **Trade-off registrado:** reusar `/api/jmp/lead` "como está" seria mais rápido, mas
  contaminaria a atribuição da campanha EAO (origem/aba/evento fixos no código) e dispararia
  WhatsApp — proibido aqui. Variante enxuta custa ~1 arquivo e isola telemetria/atribuição.

**Tarefas:**
1. Criar o route handler `POST` que valida `nome`, `email`, `whatsapp` (obrigatórios),
   sanitiza os demais campos (mesma função `str` do analog), monta objeto `lead` com os
   campos mapeados (ver tabela de campos na Fase 6) e insere via `supabaseAdmin().from('crm_leads')`.
2. Capturar atribuição: `utm_source/medium/campaign/content` + `ad_id`, gravar em
   `extra_data.utm` (mesmo formato do analog, para as regras de campanha reconhecerem).
3. Avaliar MQL via `evaluateMql(DEFAULT_JMP_MQL_RULE, { quantidade_animais, tem_inscricao_estadual })`.
4. `source_page` = host; `landing_url` = referer. Retornar `ok({ id })` / `fail(...)`.
5. Efeitos colaterais opcionais atrás de try/catch best-effort (nunca derrubam o cadastro),
   respeitando a decisão de e-mail acima. **Zero** chamadas de WhatsApp.

**Critério de verificação (goal-backward):**
- `curl -X POST /api/touros/lead` com `{nome,email,whatsapp}` → 200 `{ id }`; linha aparece
  em `crm_leads` com `source='touros-perpetuo'` e `origem` própria.
- POST sem `nome` → 400 com `{ error }`.
- POST com `utm_*`/`ad_id` → `extra_data.utm` populado.
- `grep -r "dispatchCrmWelcome\|whatsapp" src/app/api/touros/` retorna vazio (garantia de escopo).

**Dependências:** Fase 0 (rota existe). Pode rodar em paralelo com Fase 2.

---

## Fase 2 — Sistema de design da página (Apple × Bula)

**Objetivo:** Ter primitivos de UI e regras de tipografia/spacing prontos para as seções,
casando os tokens Bula (`--gold`, `--bg`, `--surface`, Inter) com o layout Apple. **Todos os
primitivos nascem mobile-first.**

**Tarefas:**
1. Criar `src/app/touros/_lib/design.ts` (ou constantes/utility classes) definindo a escala
   traduzida do DESIGN.md para os tokens Bula, com `clamp()` partindo do mobile:
   - Tipografia: `hero` (~clamp 34→56px, weight 600, `tracking-[-0.02em]`), `displayLg` (~40px),
     `sectionHead` (~34px), `lead` (~24-28px, weight 300-400), `body` (17px/1.47), `caption` (14px).
   - Spacing de seção: `py-12` (48px) mobile → `py-20` (80px) desktop.
   - Radii: usar `--r 10px` / `--r-lg 14px` (pills só no CTA principal, como o accent Apple).
2. Criar primitivos client em `_components/ui/`:
   - `Section.tsx` (wrapper edge-to-edge, prop `surface: 'bg' | 'surface' | 'photo'` alternando cor).
   - `Button.tsx` (CTA dourado — accent único; estados default/active com `scale-95`; ≥44px).
   - `Container.tsx` (max-width ~980px texto / full-bleed foto).
3. Garantir que Inter está carregada (checar `layout.tsx` raiz do app / `next/font` ou `<link>`);
   se a landing precisar isolar, importar Inter via `next/font` local ao `/touros`.
4. Documentar as regras no topo de `design.ts` (accent único = dourado; sombra só sob foto;
   sem gradiente decorativo; alternância de superfície como divisor; mobile-first).

**Critério de verificação (goal-backward):**
- Renderizar o hero stub usando `Section`+`Button` no viewport 390px → botão dourado com estado
  active `scale-95`, ≥44px de altura, tipografia com tracking negativo legível no mobile.
- Nenhum segundo accent color no CSS da página (só `--gold` como interativo).
- `Section surface="photo"` aplica overlay escuro legível sem gradiente decorativo.

**Dependências:** Fase 0.

---

## Fase 3 — Hero + foto de fundo + título/descrição

**Objetivo:** Dobra principal photography-first, **desenhada primeiro para mobile**: foto do
touro ocupa o hero, com headline comercial forte, subtítulo e CTA que ancora no formulário.

**Tarefas:**
1. Criar `_components/Hero.tsx`:
   - Background = foto do hero via `next/image` (`fill`, `priority`, `sizes` full-bleed).
     **Candidatas reais (usar como provisório):** `/jmp/galeria-touros/IMG_0059.jpg` ou
     `IMG_0037.jpg` (touro em destaque) para o hero; `/jmp/foto-bulinha-bg.jpeg` como
     alternativa de background já usada na landing JMP. Foto definitiva = pendência.
   - Art-direction mobile: crop mais vertical/retrato para enquadrar o touro no 9:16.
   - Overlay escuro (`--bg` translúcido) garantindo contraste AA do texto sobre a foto.
   - Headline (`hero` type, weight 600, tracking negativo) + subtítulo comercial (`lead`),
     adaptando o ângulo de valor de `jmp-landing/src/content.ts` (sem datas de evento).
   - CTA dourado "Quero receber uma seleção de touros" → âncora `#cadastro` (scroll suave).
   - Micro-linha de prova abaixo do CTA reusando a prova de escala: "Assessoria responsável
     pelo aparte de 1.000 touros JMP" (adaptar/validar com cliente).
2. Copy marcada como `[COPY — adaptada de content.ts, validar claims com cliente]`.
3. Above-the-fold: foto carrega `priority`; nada de layout shift (reservar aspecto).

**Critério de verificação (goal-backward):**
- Hero preenche a viewport **no mobile primeiro** (390px) e no desktop, foto full-bleed sem CLS,
  texto legível (contraste AA) sobre a foto.
- Clicar no CTA rola suavemente até `#cadastro`.
- Lighthouse: hero image é LCP e carrega eager; sem warning de imagem sem `sizes`.

**Dependências:** Fase 2 (primitivos). Foto definitiva do cliente = pendência (candidatas reais já cobrem).

---

## Fase 4 — Sub-hero + seção de processo + prova social

**Objetivo:** Faixa de reforço de proposta de valor logo abaixo do hero, prova social com logos
de criatórios, e seção "como funciona comprar touro pela Bula" (passo a passo), mantendo o ritmo
de alternância de superfície. **Layout mobile-first.**

**Tarefas:**
1. `_components/SubHero.tsx`: faixa curta (surface alternada) com 3-4 pontos de valor/prova,
   reusando os benefícios de `content.ts` adaptados: "Assessoria de compra 100% gratuita",
   "Leitura da genética e dos números do catálogo", "Ajuda pra escolher os animais certos pro
   seu rebanho", "Apoio na habilitação e no pós". Claims sensíveis marcados como pendentes.
2. `_components/ProvaSocial.tsx`: faixa de logos de criatórios de `/criatorios/*.png` (nelore-jmp,
   terra-brava-agropecuaria, fazenda-camparino, nelore-katayama, santa-nazare, etc.) — grid/marquee
   discreto, logos em tom neutro/monocromático para não competir com o accent dourado. No mobile:
   grid 2-3 colunas ou marquee horizontal. Reforça autoridade ("quem confia na Bula").
3. `_components/Processo.tsx`: passo a passo (3-5 passos) de como funciona a compra via Bula:
   ex. (1) você se cadastra → (2) a equipe entra em contato pelo WhatsApp → (3) entende seu
   rebanho e objetivo → (4) recebe seleção de touros com genética → (5) fecha com condição.
   Usar ícones `lucide-react`, cada passo em card sobre `--surface`, accent dourado nos números.
   **Nota anti-lead-frio:** o passo (2) já planta a expectativa do contato por WhatsApp — é a
   primeira camada de conscientização (a Fase 5 aprofunda).
4. Alternar superfícies (bg ↔ surface) para o divisor Apple sem borda/sombra. Cards empilham em
   coluna única no mobile.

**Critério de verificação (goal-backward):**
- Sub-hero, prova social e Processo renderizam abaixo do hero; superfícies alternadas criam
  separação visual sem bordas decorativas; tudo legível/usável em 390px.
- Logos de criatórios carregam de `/criatorios/*.png` sem quebrar layout no mobile.
- Passo a passo comunica explicitamente que haverá contato pela equipe/WhatsApp.
- Ícones e numeração usam o accent dourado; nenhum 2º accent.

**Dependências:** Fase 3.

---

## Fase 5 — Seção de conscientização do lead (anti-lead-frio) — CRÍTICA

**Objetivo:** Resolver o problema de negócio: criar compromisso e expectativa ANTES do cadastro,
deixando explícito, via copy + design + UX, que o lead receberá contato humano consultivo pelo
WhatsApp e **precisa responder**. Puro nível de página — sem automação.

**Tarefas:**
1. `_components/Conscientizacao.tsx` — seção dedicada "O que acontece depois que você se cadastra":
   - Timeline/passos claros do pós-cadastro: "Em breve nossa equipe vai te chamar no WhatsApp",
     "É um atendimento humano e consultivo de genética — não é robô/spam", "Fique de olho no
     WhatsApp do número que você cadastrar", "Responder rápido = você recebe a seleção primeiro".
   - Tom de compromisso mútuo (você se compromete a responder; a Bula se compromete a atender bem).
   - Reforço de confiança: atendimento consultivo, curadoria de genética, sem custo para receber a seleção.
2. Definir a **micro-copy reutilizável** (exportar de `_lib/copy.ts`) que também será injetada:
   - junto ao botão de submit do formulário (Fase 6): ex. "Ao enviar, nossa equipe vai te chamar
     no WhatsApp — responda para receber sua seleção de touros."
   - próxima ao campo WhatsApp: ex. "É por aqui que a equipe vai falar com você."
3. Design: seção calma, foto de apoio opcional (equipe/atendimento) — candidata `/jmp/foto-leilao-eao.jpeg`
   ou institucional; accent dourado nos marcadores de passo. Mobile-first (coluna única).

**Critério de verificação (goal-backward):**
- Existe uma seção dedicada, antes do formulário, que explica o pós-cadastro e o contato por WhatsApp.
- A micro-copy de conscientização está exportada em `_lib/copy.ts` e é consumível pelo form.
- Revisão manual: um usuário lendo a página **no celular** entende que precisa responder o WhatsApp.
- `grep` confirma zero lógica de disparo/redirect de WhatsApp nesta seção (só copy/UX).

**Dependências:** Fase 4. **Alimenta** a Fase 6 (micro-copy do form).

---

## Fase 6 — Formulário de captura + estados/validação + integração

**Objetivo:** O CTA central da página. Formulário **mobile-first** (coluna única, ≥44px) que
qualifica comprador de touro, com micro-copy de conscientização, validação, estados
(loading/sucesso/erro) e integração com o endpoint da Fase 1, carregando os UTMs capturados.

**Mapa de campos → payload do endpoint (Fase 1 / analog `/api/jmp/lead`):**

| Campo no form | Chave enviada | Coluna/uso no lead | Obrigatório |
|---|---|---|---|
| Nome | `nome` | `nome` | sim |
| WhatsApp | `whatsapp` | `telefone` + `celular` | sim |
| E-mail | `email` | `email` | sim |
| Estado (UF) | `uf` | `estado` | recomendado |
| Cidade | `cidade` | `cidade` (autocomplete IBGE por UF, como no analog) | opcional |
| Nº de cabeças do rebanho | `cabecas` | `quantidade_animais` (usado no MQL) | recomendado |
| Momento da pecuária | `momento` | `momento_pecuaria` | opcional |
| Quantos touros busca | `oQueBusca` | `o_que_busca` (texto legível, ex. "21 a 50 touros") | recomendado |
| Tem inscrição estadual? | `inscricaoEstadual` ("Sim"/"Não") | `tem_inscricao_estadual` (usado no MQL) | recomendado |
| Consentimento contato WhatsApp | `whatsappConsent` (bool) | `extra_data.whatsapp_consent` | sim (checkbox) |
| — atribuição — | `utm_source/medium/campaign/content`, `ad_id` | `extra_data.utm` | auto |

**Tarefas:**
1. `_components/Formulario.tsx` (client) com âncora `id="cadastro"`, coluna única no mobile:
   - Campos acima; inputs ≥44px; labels claras; teclados mobile corretos (`inputMode`/`type`).
   - Autocomplete de cidade via IBGE por UF (espelhar `jmp-landing/src/components/Form.tsx`).
   - Micro-copy de conscientização (de `_lib/copy.ts`) perto do WhatsApp e do botão submit.
   - Checkbox de consentimento obrigatório para habilitar o submit.
2. Captura de UTM: helper `_lib/utm.ts` (espelhar `captureUtms` do analog — lê `utm_*` e
   `ad-id`/`ad_id` de `window.location.search` em `useEffect` no mount).
3. Validação client-side (nome/email/whatsapp obrigatórios, formato de e-mail, WhatsApp com
   máscara/DDD) + estados: `idle → submitting → success → error`.
4. Submit: `fetch('/api/touros/lead', { method:'POST', body: JSON.stringify({...campos, ...utm}) })`.
   Sucesso → estado de agradecimento reforçando o pós-cadastro (mesma mensagem de conscientização).
5. Acessibilidade: labels associadas, foco visível (accent dourado), erros com `aria-describedby`.

**Critério de verificação (goal-backward):**
- Preencher e enviar (dev, testado no viewport mobile) → 200, lead em `crm_leads` com
  `source='touros-perpetuo'` e todos os campos mapeados corretos; `extra_data.utm` populado
  quando há `?utm_*` na URL.
- Submeter sem consentimento/campos obrigatórios → bloqueado com mensagem de erro visível.
- Estado de sucesso mostra a mensagem de conscientização (reforço de responder o WhatsApp).
- Erro de rede → estado de erro com opção de tentar de novo (lead não perdido silenciosamente).

**Dependências:** Fase 1 (endpoint) + Fase 5 (micro-copy). Fase 2 (primitivos).

---

## Fase 7 — Auditoria mobile + performance de imagem

**Objetivo:** Confirmar a experiência mobile-first (que já vem sendo construída desde a Fase 3) e
otimizar imagens (LCP baixo) usando `next/image`/`sharp`. Esta fase é **refino/auditoria**, não
o início do mobile.

**Tarefas:**
1. Auditar todas as seções nos breakpoints (foco 375–430px, depois tablet/desktop):
   tipografia do hero com `clamp`, spacing de seção 48↔80px, form em coluna única, touch targets
   ≥44px, sem overflow horizontal, logos de criatórios sem quebra.
2. Converter fotos usadas para `webp`/`avif` otimizados (usar `sharp`); definir `sizes` corretos
   e `placeholder="blur"` (blurDataURL) nas imagens grandes; hero com `priority`, resto `lazy`.
   Fotos candidatas (`/jmp/galeria-touros/*.jpg` etc.) são JPG grandes → gerar variantes otimizadas.
3. Garantir CLS ~0 (aspectos reservados), fontes com `display: swap`.
4. Conferir que a página não puxa bundles pesados do app (só o necessário do `/touros`).

**Critério de verificação (goal-backward):**
- DevTools mobile (iPhone/Android) → sem scroll horizontal, CTAs alcançáveis com o polegar,
  formulário usável em uma coluna.
- Lighthouse mobile: Performance ≥ 90, LCP < 2.5s (hero image otimizada), CLS < 0.1.
- Nenhuma imagem servida sem `sizes`/otimização.

**Dependências:** Fase 6 (todas as seções existem).

---

## Fase 8 — Tracking & Conversão (penúltima)

**Objetivo:** Instrumentar a conversão para o tráfego pago: PostHog + Meta Pixel + GA4, todos
disparando o evento de conversão no **submit** do formulário, carregando os UTMs capturados.

**Tarefas:**
1. **Env vars por ambiente** (adicionar em `.env.example` e configurar no Vercel para
   Production/Preview): `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`,
   `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA4_ID`. (IDs reais = pendência do cliente.)
2. **PostHog** (`_lib/analytics/posthog.ts`): carregar `posthog-js` sob demanda (espelhar o
   padrão de `jmp-landing/src/analytics/posthog.ts`); `pageview` no load; eventos de funil
   (`touros_view`, `touros_form_step`, `touros_submit_attempt`, `touros_lead_submitted`);
   habilitar session replay se o cliente quiser. Enviar UTMs como props.
3. **Meta Pixel** (`_lib/analytics/meta.ts` + script no `layout.tsx` da rota): init com
   `NEXT_PUBLIC_META_PIXEL_ID`; disparar `Lead` **e/ou** `CompleteRegistration` no submit
   bem-sucedido (otimização de campanha). Fallback: se env ausente, no-op (não quebra a página).
4. **GA4** (`_lib/analytics/ga.ts`): carregar `gtag.js` com `NEXT_PUBLIC_GA4_ID`; `page_view` +
   evento de conversão `generate_lead` no submit, com UTMs.
5. **Ponto único de disparo:** criar `trackLeadConversion(payload)` em `_lib/analytics/index.ts`
   que chama PostHog + Meta + GA de uma vez; o `Formulario.tsx` chama SÓ essa função no sucesso.
   Todos os provedores fazem no-op se a env estiver vazia (deploy sem IDs não quebra).

**Critério de verificação (goal-backward):**
- Com envs de teste: submeter o form → PostHog recebe `touros_lead_submitted`, Meta Pixel
  dispara `Lead`/`CompleteRegistration` (Meta Pixel Helper mostra), GA4 recebe `generate_lead`
  (DebugView), todos com os UTMs presentes.
- Sem envs: página carrega e converte normalmente, sem erro no console (provedores em no-op).
- UTMs capturados na URL chegam iguais nos 3 destinos e no `crm_leads.extra_data.utm`.

**Dependências:** Fase 7 (página estável). Consome o helper de UTM da Fase 6.

---

## Fase 9 — QA final + go-live checklist

**Objetivo:** Validar ponta a ponta e deixar pronto para rodar tráfego.

**Tarefas / checklist:**
1. **Funcional:** submissão real cria lead correto em `crm_leads`; MQL avaliado; UTMs gravados;
   estados de sucesso/erro corretos; consentimento obrigatório funcionando.
2. **Conscientização:** revisão de copy final — seção pós-cadastro + micro-copy do form
   comunicam claramente o contato por WhatsApp (validar com o cliente).
3. **Design:** aderência Apple×Bula (accent dourado único, alternância de superfície, sombra só
   sob foto, tipografia tight); nada quebrado em light mode acidental (a landing é dark).
4. **Mobile/perf:** teste real em celular; Lighthouse mobile ≥90; sem CLS; assets otimizados.
5. **Tracking:** 3 provedores disparando no submit; envs de produção configuradas no Vercel.
6. **SEO/OG:** title/description comerciais; OG image (candidata `/jmp/galeria-touros/IMG_0037.jpg`
   ou foto definitiva); `robots: index`.
7. **Escopo:** `grep` confirma zero código de disparo/automação de WhatsApp na rota `/touros`.
8. **Domínio:** configurar subdomínio **`touros.bulaassessoria.com`** no Vercel (Domains → Add),
   apontando para o app `web-bula`; DNS CNAME no provedor do domínio; garantir SSL. Alternativa
   fallback: path `/touros` no domínio principal. Confirmar grafia com o cliente (ele escreveu
   "buloacessoria" — é typo; o correto é `touros.bulaassessoria.com`).
9. **Build:** `next build` limpo, sem erros de tipo/lint na rota.

**Critério de verificação (goal-backward):**
- Checklist 100% ✔; `next build` verde; um lead de teste flui do form → `crm_leads` →
  eventos de conversão nos 3 provedores; `touros.bulaassessoria.com` resolve com SSL; página
  aprovada pelo cliente para subir tráfego.

**Dependências:** Fase 8.

---

## Pendências do usuário (assets e decisões)

| Item | Bloqueia | Observação |
|---|---|---|
| **Confirmar grafia do domínio** `touros.bulaassessoria.com` | Fase 9 | cliente escreveu "buloacessoria" (typo); confirmar o correto |
| Foto(s) de fundo do hero definitiva (touro/genética/pasto) | Fase 3 | **NÃO bloqueia** — candidatas reais em `/jmp/galeria-touros/` já cobrem |
| OG image definitiva | Fase 9 | fallback = foto da galeria de touros |
| **Gatilho de oferta** (DEPs/genética, garantia, avaliação andrológica, condição de pagamento) | Fases 3, 4 | cliente disse "pensar depois" — **placeholder, não bloqueia o plano** |
| Textos/claims comerciais finais aprovados | Fases 3, 4, 5 | há base reutilizável em `jmp-landing/src/content.ts`; marcar `[COPY]` até aprovar |
| Decisão: reusar funil do CRM (`JMP_FUNNEL_ID`) ou funil próprio para touros | Fase 1 | default = reusar |
| Decisão: enviar e-mail de boas-vindas / planilha para leads de touros | Fase 1 | default = não (sem WhatsApp de qualquer forma) |
| IDs: `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_POSTHOG_KEY`/HOST | Fase 8 | página funciona em no-op sem eles |

## Fora de escopo (declarado explicitamente)

- **Qualquer mudança em disparo/automação de WhatsApp** (welcome, concierge, `dispatchCrmWelcome`,
  Baileys, Cloud API). O anti-lead-frio é resolvido **só com copy/design/UX na página**.
- **A/B testing** — deixado como fase futura opcional (nota abaixo).
- **Dashboards/relatórios de conversão** — os eventos vão para PostHog/Meta/GA4; construir
  dashboard é outro trabalho.
- **CRM/board changes** — reusa `crm_leads` e o funil existentes; nenhuma alteração de schema.

## Nota — fase futura opcional (A/B)

Quando houver volume de tráfego, considerar A/B de headline/CTA/ordem de seções via PostHog
feature flags (o SDK já entra na Fase 8). Não implementar agora.

Variações de headline já preparadas em `copy.ts` (`hero.titleVariants`) para o teste:
1. "Touro bonito não é touro bom." (dor / anti-compra-por-beleza)
2. "O reprodutor certo se paga no bezerro." (ROI)
3. "A genética que os grandes criatórios de Nelore usam." (autoridade de pares)

---

## Revisão de mídia paga & growth (3 especialistas) — resultado

Antes de concluir, a página passou por review de **Growth Hacker + Paid Media Auditor +
Paid Social Strategist**, com foco em LEADS MAIS QUALIFICADOS (MQL = ≥100 cabeças + IE).
Consenso central: **otimizar por lead que VALE, não por volume de cadastro**, e **qualificar
já na mensagem** (não só no formulário).

### ✅ Aplicado nesta entrega
- **Sinal de conversão por valor (P0):** `route.ts` devolve `is_mql`; o form gera `event_id`
  único e repassa; `trackLeadConversion` dispara UM evento `Lead` (Meta) + `generate_lead`
  (GA4) com `value` diferenciado (MQL=100 / não-MQL=10) e `currency BRL` → value-based bidding.
  Removida a contagem dupla (`CompleteRegistration` não dispara junto).
- **Atribuição de clique pago:** `utm.ts` passa a capturar `fbclid` e `gclid` (além de UTMs);
  gravados em `extra_data.utm` para amarrar lead qualificado ao anúncio.
- **Micro-conversão:** `touros_form_started` (1ª interação) → PostHog + Meta `InitiateCheckout`
  + GA4 `begin_checkout`, para o algoritmo ter sinal quando o volume de Lead é baixo.
- **Menos fricção que não qualifica:** e-mail e cidade viram OPCIONAIS (funil é 100% WhatsApp;
  o filtro de MQL é rebanho+IE, não e-mail).
- **Copy que qualifica:** hero/subHero/prova reescritos com linguagem técnica (DEP, sumário,
  reprodutor PO, "se paga no bezerro") para o comprador sério se reconhecer e o curioso se
  autoexcluir; "grátis" reenquadrado ("Bula é remunerada pelos criatórios/centrais, não pelo
  pecuarista"); prova de escala quantificada (+1.000 touros PO) elevada na ProvaSocial.
- **Conscientização como acordo recíproco:** "seleção montada à mão, uma a uma", janela de
  contato concreta (24h úteis), fila por ordem de resposta → reduz lead frio.
- **Sticky CTA no mobile** (some quando o form aparece).

### ⏸️ Adiado — precisa da sua decisão (NÃO aplicado)
- **Botão "manda um oi" (deep-link `wa.me`) na tela de sucesso** — inverte o 1º contato
  (lead → Bula = quente). Fortemente recomendado pelos 3, MAS você pediu para deixar WhatsApp
  para depois. Precisa do número oficial da Bula. **Sua decisão.**
- **Meta Conversions API server-side (CAPI)** — dispara a conversão do servidor (fonte de
  verdade do `is_mql`, à prova de adblock, com advanced matching). Precisa de token/dataset do
  Meta. O `event_id` já está preparado para o dedup. **Recomendado como próximo passo.**
- **Formulário em 2 passos (qualifica-primeiro)** — pedir rebanho+IE antes dos dados pessoais
  para o curioso desistir antes de virar lead. Mudança de UX maior. **Sua decisão.**
- **Checkbox de compromisso "vou responder"** — aumenta follow-through, mas adiciona fricção.
- **Trocar a headline do hero** por uma das `titleVariants` — decisão criativa/A/B sua.
