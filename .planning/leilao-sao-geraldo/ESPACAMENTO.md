# Correção de espaçamento vertical — landing `/saogeraldo`

**Branch:** `feat/leilao-sao-geraldo`
**Data:** 27/07
**Origem:** feedback do cliente — "falta espaçamento, está muito sufocante"
**Natureza:** ritmo vertical. **Não é redesign.**

---

## 0. Sumário executivo

A página **não tem um bug de espaçamento**: ela herdou da `/touros` (aprovada)
os mesmos primitivos, com os mesmos valores. `ui.tsx` e `tokens.ts` são
**byte-idênticos** entre as duas páginas:

```
diff src/app/touros/_components/ui.tsx  src/app/saogeraldo/_components/ui.tsx   → IDÊNTICOS
diff src/app/touros/_lib/tokens.ts      src/app/saogeraldo/_lib/tokens.ts       → IDÊNTICOS
```

O que mudou foi o **conteúdo**. A entrelinha apertada (`displayLg` = 1.06,
`displayXL` = 1.02) foi calibrada nos títulos CURTOS da `/touros`. A copy do
leilão é materialmente mais longa, quebra em mais linhas, e a mesma entrelinha
que lia "editorial" em 2 linhas lê "sufocante" em 3–4.

Some-se a isso dois blocos NOVOS, sem contraparte na `/touros`, que nasceram
mais apertados que a própria convenção da página: `Contagem.tsx` e `Oferta.tsx`.

### Os 3 piores pontos (com valores medidos)

| # | Onde | Valor ATUAL medido | Por que sufoca |
|---|------|--------------------|----------------|
| **1** | `Fecho.tsx:26` — `<h2 className="mt-5">` com `typo.displayLg` | `lineHeight: **1.06**`, `fontSize: clamp(28px, 4.6vw, 48px)` → caixa de linha de **29,68px** para texto de 28px = **1,68px de respiro entre linhas** | O título tem `\n` explícito + quebra natural = **3 linhas no mobile**. É a queixa literal do cliente, verbatim. |
| **2** | `Contagem.tsx:75` — wrapper do bloco | `paddingTop: 18` / **`paddingBottom` inexistente (0px)** | O bloco não tem respiro inferior NENHUM. No desktop o CTA abaixo é `lg:hidden` (`Hero.tsx:112`) → a contagem termina com **0px** e a coluna simplesmente acaba. É exatamente "entre o countdown e o conteúdo que não começa ainda". |
| **3** | `Fecho.tsx:40` — `<li className="py-3.5">` | `py-3.5` = **14px** topo + 14px base, contra hairline de 1px, com texto em `lineHeight: 1.55` | 4 bullets em régua de ficha com 14px de folga interna. Linhas que quebram em 2 encostam na hairline seguinte. |

---

## 1. Metodologia da medição

- **Escala Tailwind v4** (sem `tailwind.config`, `--spacing` default = `0.25rem`):
  `mt-1.5`=6px · `mt-2`=8px · `mt-3`=12px · `mt-3.5`=14px · `mt-4`=16px ·
  `mt-5`=20px · `mt-6`=24px · `mt-8`=32px · `mt-9`=36px · `mt-10`=40px ·
  `mt-12`=48px · `mt-14`=56px · `gap-10`=40px · `gap-16`=64px · `gap-20`=80px ·
  `py-14`=56px · `py-20`=80px · `p-6`=24px · `p-7`=28px.
- **Viewport de referência mobile:** 390×844 (iPhone 14). Largura útil de
  conteúdo = 390 − `px-5`×2 = **350px**. Altura útil ≈ **740px** (descontada a
  barra do Safari).
- **`clamp()` no mobile:** em 390px de viewport, quase todo `clamp(min, Xvw, max)`
  da página resolve para o **min** (ex.: `clamp(80px, 12vw, 144px)` → 12vw = 46,8px
  < 80 → **80px**). Isso importa: no celular a página inteira já roda no piso da
  escala.
- Alturas de linha calculadas = `fontSize × lineHeight`. Contagem de linhas
  estimada por largura média de glifo (Oswald condensada ≈ 0.40em; Inter ≈ 0.50em)
  — **a validar na tarefa T-9** com medição real.

---

## 2. Diagnóstico: `/touros` (aprovada) vs `/saogeraldo`

### 2.1 O que é IGUAL (não é a causa)

| Componente | Situação |
|---|---|
| `ui.tsx` (`Section`/`Container`/`Reveal`/`TopicCard`) | **byte-idêntico** |
| `tokens.ts` | **byte-idêntico** |
| `Fecho.tsx` | espaçamento **idêntico** — o `diff` só acusa fonte de copy, quebra de linha do Prettier e o `id="fecho-cta"` removido |
| `SubHero.tsx` | espaçamento **idêntico** (`gap-12 md:gap-20`, `flex-col gap-3`) |
| `ProvaSocial.tsx` | espaçamento **idêntico** (`mt-4`, `mt-10`, override `clamp(56px, 8vw, 96px)`) |

**Conclusão:** não existe "a nova ficou mais apertada" no nível dos primitivos.
O padding de seção é o mesmo `clamp(80px, 12vw, 144px)` nas duas.

### 2.2 O que DIVERGIU (é a causa)

**Causa A — a copy cresceu, a entrelinha não.**

| Texto | `/touros` | `/saogeraldo` | Δ |
|---|---|---|---|
| Título do fecho | `Vamos montar a sua\nseleção de touros.` (34 car.) | `Chegue no leilão sabendo\nexatamente em que lote dar lance.` (57 car.) | **+68%** |
| Lead do hero | curto | 230 caracteres → **~6 linhas** no mobile | — |
| `catalogo.nota` | não existe | 232 caracteres em `lineHeight: 1.55` | novo |

Com `displayLg.lineHeight = 1.06`, cada linha extra que a copy ganha é uma linha
com 1,68px de folga. O título do fecho passou de 2 linhas confortáveis para 3
linhas coladas. **Esse é o mecanismo exato da queixa nº 1 e nº 3.**

**Causa B — blocos novos nasceram mais apertados que a convenção da página.**

| Bloco | Convenção da página | O que o bloco novo faz |
|---|---|---|
| `Oferta.tsx:20,23` | `Fecho`/`Ensaio` usam `mt-5` (20px) entre eyebrow→h2→lead | usa **`mt-4`** (16px) — **−4px** em cada um dos dois saltos |
| `Contagem.tsx:75` | todo bloco de conteúdo da página respira em cima E embaixo | `paddingTop: 18` e **nenhum** `paddingBottom` |

---

## 3. Medições ATUAIS, arquivo por arquivo, linha por linha

### 3.1 `_components/Fecho.tsx` — **a pior queixa**

| Linha | Elemento | Propriedade | Valor ATUAL |
|---|---|---|---|
| 14 | `<Section surface="dark">` | padding vertical (herdado de `ui.tsx:41-42`) | `clamp(80px, 12vw, 144px)` → **80px** mobile |
| 23 | `<div className="grid gap-10 ... lg:gap-x-20">` | gap vertical entre as 2 colunas no mobile | **40px** |
| 26 | `<h2 className="mt-5">` | `margin-top` | **20px** |
| 26 | `typo.displayLg` | **`lineHeight`** | **1.06** → linha de **29,68px** @28px |
| 26 | `typo.displayLg` | `fontSize` | `clamp(28px, 4.6vw, 48px)` |
| 29 | `<p className="mt-5 max-w-[520px]">` | `margin-top` | **20px** |
| 29 | `typo.body` | **`lineHeight`** | **1.55** → linha de **23,25px** @15px |
| 40 | `<li className="... gap-4 py-3.5">` | `padding` vertical | **14px + 14px** |
| 40 | `<li>` | `gap` horizontal (nº ↔ texto) | **16px** |
| 42-43 | `<li>` | hairlines | `1px` topo (só i=0) + `1px` base |
| 49 | texto do bullet | `fontSize` / `lineHeight` | `clamp(15px,1.7vw,17px)` / **1.55** |
| 61 | `<a className="mt-8">` | `margin-top` | **32px** |
| 65 | `<a>` | `minHeight` | 56px |
| 78 | `<p className="mt-4">` (nota) | `margin-top` | **16px** |

**Altura medida de uma linha de bullet:** 14 + 23,25 + 14 = **51,25px**; bullets
que quebram em 2 linhas → **74,5px**. Entre o texto e a hairline sobram 14px.

### 3.2 `_components/Contagem.tsx` — o bloco reclamado

| Linha | Elemento | Propriedade | Valor ATUAL |
|---|---|---|---|
| 75 | wrapper | `borderTop` | `1px solid rgba(255,255,255,0.12)` |
| 75 | wrapper | `paddingTop` | **18px** |
| 75 | wrapper | **`paddingBottom`** | **AUSENTE = 0px** ← |
| 76 | `<span>` label | `typo.monoLabel` `lineHeight` | 1.3 → 14,3px @11px |
| 81 | `<div className="mt-3 ... gap-5 sm:gap-7">` | `margin-top` | **12px** |
| 81 | idem | `gap` horizontal entre blocos | 20px / 28px `sm:` |
| 88-89 | dígito | `fontSize` / `lineHeight` | `clamp(28px,6vw,42px)` / **1** |
| 96 | `<span className="mt-1.5">` unidade | `margin-top` | **6px** |
| 103 | `<p className="mt-4">` data | `margin-top` | **16px** |
| 103 | data | `fontSize` / `lineHeight` | 15px / 1.55 → 23,25px |
| 58 | wrapper do estado "encerrado" | `paddingTop` / `paddingBottom` | 18px / **0px** |

**Altura total do bloco (mobile):** 1 + 18 + 14,3 + 12 + 28 + 6 + 14,3 + 16 + 23,25
= **132,85px**, terminando com **0px** de respiro inferior.

**O assento do bloco (`Hero.tsx`):**

| Linha | Elemento | Valor ATUAL |
|---|---|---|
| 104 | `<div className="mt-9"><Contagem /></div>` | **36px** acima |
| 112 | `<a className="mt-8 ... lg:hidden">` | **32px** abaixo — **mas some no desktop** |

→ **No desktop (`lg:`), a `Contagem` é o último elemento da coluna de copy e tem
`0px` abaixo dela.** É a queixa nº 2, ao pé da letra.

### 3.3 `_components/Hero.tsx`

| Linha | Elemento | Valor ATUAL |
|---|---|---|
| 64 | `<div className="... py-14 sm:py-20">` | **56px** / 80px `sm:` |
| 74 | logo `className="h-16 sm:h-20 lg:h-24"` | **64px** / 80 / 96 |
| 78 | `<div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-2 lg:gap-16">` | mt **48px** (lg 64) · gap **40px** (lg 64) |
| 81 | eyebrow `typo.eyebrow` | `lineHeight` 1.3 → 14,3px |
| 84 | `<h1 className="mt-5">` | **20px** |
| 88-89 | h1 | `clamp(30px, 5.6vw, 52px)` / `lineHeight` **1.06** → 31,8px/linha |
| 98-99 | `<p className="mt-5 max-w-[560px]">` lead | **20px** · 17px / `lineHeight` **1.55** → 26,35px/linha |
| 104 | `<div className="mt-9">` (Contagem) | **36px** |
| 112 | `<a className="mt-8 ... lg:hidden">` | **32px** + `minHeight` 56 |
| 133 | `<p className="mt-3">` reforço | **12px** |
| 146 | `<p className="mt-14">` faixa de origem | **56px** |

### 3.4 `_components/Oferta.tsx`

| Linha | Elemento | Valor ATUAL | Nota |
|---|---|---|---|
| 16 | `<Section surface="dark">` | `clamp(80px,12vw,144px)` | — |
| 20 | `<h2 className="mt-4 max-w-[720px]">` | **16px** | **−4px vs a convenção `mt-5`** |
| 20 | `typo.displayLg` | `lineHeight` **1.06** | — |
| 23 | `<p className="mt-4 max-w-[620px]">` | **16px** | **−4px vs a convenção `mt-5`** |
| 28 | `<div className="mt-12 grid gap-px ...">` | **48px** · gap **1px** (hairline) | — |
| 31 | card `className="p-6 sm:p-7"` | **24px** / 28px | — |
| 36-37 | destaque | `clamp(34px,5.5vw,46px)` / `lineHeight` **1** | — |
| 45 | `<span className="mt-3">` título | **12px** | — |
| 57 | `<span className="mt-2">` detalhe | **8px** · 14px / 1.55 | — |
| 71-72 | `<p className="mt-12 max-w-[720px]">` nota do catálogo | **48px** · 17px / **1.55** | 232 caracteres |
| 78 | `<a className="mt-6">` | **24px** | — |

### 3.5 `_components/SubHero.tsx`

| Linha | Elemento | Valor ATUAL |
|---|---|---|
| 13 | `<Section surface="light">` | `clamp(80px,12vw,144px)` |
| 15 | `<div className="grid gap-12 md:grid-cols-2 md:gap-20">` | **48px** / 80px `md:` |
| 17 | `<h2>` `typo.displayLg` | `lineHeight` **1.06** |
| 22 | `<div className="flex flex-col gap-3">` | **12px** entre cards |
| `ui.tsx:270` | `TopicCard` `padding` | `clamp(20px, 2.4vw, 28px)` → **20px** mobile |
| `ui.tsx:278` | `<h3 style={{ marginTop: 16 }}>` | 16px |
| `ui.tsx:288` | `<p style={{ marginTop: title ? 8 : 14 }}>` | **14px** (sem título) |

### 3.6 `_components/ProvaSocial.tsx`

| Linha | Elemento | Valor ATUAL | Nota |
|---|---|---|---|
| 34 | `<Section style={{ paddingTop/Bottom: 'clamp(56px, 8vw, 96px)' }}>` | **56px** mobile | **override que APERTA** vs os 80px padrão |
| 39 | `<Eyebrow className="mx-auto max-w-[440px] text-center">` | `lineHeight` **1.3**, `letterSpacing` 0.22em | quebra em 2 linhas |
| 48-49 | `<p className="mx-auto mt-4 ...">` claim | **16px** · `clamp(22px,3vw,34px)` / `lineHeight` **1.06** | 100 caracteres → 3 linhas mobile |
| 60 | `<div className="relative mt-10 ...">` marquee | **40px** | — |

### 3.7 `_components/Footer.tsx`

| Linha | Elemento | Valor ATUAL |
|---|---|---|
| 10 | `<footer className="... py-14 sm:px-8">` | **56px** topo e base |
| 13 | `<div className="... gap-6 ...">` | **24px** |
| 14 | `<div className="flex flex-col ... gap-3">` | **12px** |
| 29 | `<div className="... gap-x-3 gap-y-1">` | 12px / **4px** |

### 3.8 `_lib/tokens.ts`

| Linha | Token | `lineHeight` ATUAL |
|---|---|---|
| 72 | `typo.eyebrow` | **1.3** |
| 80 | `typo.monoLabel` | **1.3** |
| 87 | `typo.displayXL` | **1.02** |
| 94 | `typo.displayLg` | **1.06** |
| 101 | `typo.stat` | **0.9** |
| 108 | `typo.body` | **1.55** |
| 116 | `typo.button` | 1 |

**Não existe escala de espaçamento.** Confirmado: o arquivo exporta `dark`,
`light`, `interFeatures`, `font`, `radius` (só raios), `typo`, `palette`. Todo
espaçamento da página é número mágico solto em `className` ou em `style`.

---

## 4. Escala de espaçamento proposta (tokens)

Adicionar a `src/app/saogeraldo/_lib/tokens.ts`, no mesmo registro do arquivo
(mobile-first, `clamp()`, comentário explicando a regra).

```ts
/**
 * Escala de RITMO VERTICAL. Antes disto o espaçamento da página era número
 * mágico solto em className. Progressão ~1.4× (aprox. Major Third), com piso
 * mobile e teto desktop — o mesmo idioma clamp() do resto do arquivo.
 *
 * Regra de uso:
 *  · dentro de um bloco (label→valor, título→lead) → 3xs…sm
 *  · entre blocos de um mesmo assunto                → md…lg
 *  · entre assuntos / colunas                        → xl
 *  · respiro de tile (Section)                       → 2xl…3xl
 */
export const space = {
  '3xs': 'clamp(6px, 0.8vw, 8px)',
  '2xs': 'clamp(10px, 1.2vw, 12px)',
  xs:    'clamp(14px, 1.7vw, 18px)',
  sm:    'clamp(20px, 2.2vw, 24px)',
  md:    'clamp(28px, 3.2vw, 36px)',
  lg:    'clamp(40px, 4.6vw, 56px)',
  xl:    'clamp(56px, 6.4vw, 80px)',
  '2xl': 'clamp(72px, 9vw, 112px)',
  '3xl': 'clamp(88px, 12vw, 152px)',
} as const

/**
 * Entrelinhas. Os valores de `typo.*` foram calibrados nos títulos CURTOS da
 * /touros; a copy do leilão quebra em 3–4 linhas e a mesma entrelinha lê
 * sufocada. Estes tokens são ADITIVOS — ver §4.1.
 */
export const leading = {
  display: 1.16,      // títulos que quebram em 2+ linhas (era 1.06)
  displayTight: 1.06, // preservado p/ título de 1 linha
  body: 1.68,         // corpo longo (era 1.55)
  bodyTight: 1.55,    // preservado
  label: 1.45,        // caixa alta com tracking largo (era 1.3)
  digit: 1.05,        // dígitos da contagem (era 1)
} as const
```

### 4.1 Decisão arquitetural: os tokens são ADITIVOS, não mutantes

**Não alterar os `lineHeight` dentro de `typo.*`.**

Motivo medido: `Formulario.tsx` — **fora de escopo por restrição explícita** —
consome `typo.monoLabel` (linhas 304, 305, 505), `typo.displayLg` (577) e
`typo.body` (578). Mutar `typo.monoLabel.lineHeight` de 1.3 → 1.45 cresceria o
cabeçalho de passos do formulário, **dentro da primeira dobra**, sem que o
arquivo fosse tocado — violando a restrição e gastando orçamento do KPI.

Portanto: `leading.*` é aplicado por **override pontual** nos componentes em
escopo (`style={{ ...typo.displayLg, lineHeight: leading.display }}`).
`Formulario.tsx` fica pixel-idêntico.

---

## 5. Orçamento da primeira dobra no mobile (o único KPI)

### 5.1 Situação ATUAL medida — 390×844, útil ≈ 740px

| Elemento | Valor | px acumulado |
|---|---|---|
| `py-14` topo da seção | 56 | 56 |
| logo `h-16` | 64 | 120 |
| `mt-12` (logo → grid) | 48 | 168 |
| eyebrow (11px × 1.3) | 14,3 | 182,3 |
| `mt-5` | 20 | 202,3 |
| h1 — 3 linhas @30px × 1.06 | 95,4 | 297,7 |
| `mt-5` | 20 | 317,7 |
| lead — 6 linhas @17px × 1.55 | 158,1 | 475,8 |
| `mt-9` | 36 | 511,8 |
| bloco `Contagem` | 132,85 | 644,7 |
| `mt-8` | 32 | 676,7 |
| **CTA dourado `#cadastro` (56px)** | 56 | **732,7** ← |
| `gap-10` | 40 | 772,7 |
| topo do card do formulário | — | **772,7** |

**Leitura crítica:** no mobile o formulário **já nasce abaixo da dobra** (772,7 >
740) — é por isso que existem a âncora dourada (`Hero.tsx:110`) e a `StickyCta`.
O que **de fato** precisa caber na primeira dobra é o **CTA dourado, cuja base
está em 732,7px — com apenas ~7px de folga.**

→ **O orçamento vertical do Hero no mobile é ZERO.** Todo respiro adicionado ali
tem de ser pago dentro do próprio Hero.

### 5.2 Livro-caixa do Hero no mobile (ANTES → DEPOIS)

| Movimento | Δ px |
|---|---|
| `Hero.tsx:78` `mt-12` → `mt-10` (logo → grid) | **−8** |
| `Hero.tsx:104` `mt-9` → `mt-8` (assento da contagem) | **−4** |
| `Contagem` — crescimento interno (§6.2) | **+32** |
| `Hero.tsx:112` `mt-8` → `mt-4` (CTA mobile) | **−16** |
| **NET mobile** | **+4px** |

CTA dourado: base vai de 732,7 → **736,7px**. Continua dentro dos 740px. ✔

**Exceção deliberada e documentada:** o aumento de entrelinha do `h1` e do `lead`
do Hero (`leading.display` / `leading.body`) é aplicado **só a partir de `sm:`**.
No mobile o Hero mantém 1.06 / 1.55. Custo de aplicá-los no mobile seria
+5,4px (h1) +7,1px (lead) = **+12,5px**, o que jogaria o CTA para 749px — fora
da dobra. A queixa "entre o texto" é resolvida integralmente no `Fecho`,
`Oferta`, `SubHero` e `ProvaSocial`, que estão abaixo da dobra e onde o gasto é
livre.

**Regra geral:** abaixo da primeira dobra, gastar à vontade. Dentro do Hero
mobile, todo `+X` exige um `−X`.

---

## 6. Correções por arquivo — ANTES → DEPOIS

### PRIORIDADE 0 — `_lib/tokens.ts`

| Ação | ANTES | DEPOIS |
|---|---|---|
| Adicionar `export const space` | não existe | bloco do §4 |
| Adicionar `export const leading` | não existe | bloco do §4 |
| `typo.*.lineHeight` | 1.02 / 1.06 / 1.3 / 1.55 / 0.9 | **INALTERADOS** (§4.1) |

Sozinho não muda um pixel. Habilita todo o resto.

---

### PRIORIDADE 1 — `_components/Fecho.tsx` (a pior queixa)

| Linha | Propriedade | ANTES | DEPOIS | Δ |
|---|---|---|---|---|
| 14 | `Section` padding vertical | `clamp(80px,12vw,144px)` | `space['3xl']` = `clamp(88px,12vw,152px)` (via `style`, junto do `borderTop` já existente) | +8 mobile |
| 23 | `grid gap-10` | 40px | **`gap-14`** = 56px (mantém `lg:gap-x-20`) | +16 |
| 26 | `<h2 className="mt-5">` | 20px | **`mt-6`** = 24px | +4 |
| 26 | `h2` `lineHeight` | **1.06** | **`leading.display`** = **1.16** | **+8,4** (3 linhas @28px) / **+9,6** desktop |
| 29 | `<p className="mt-5">` lead | 20px | **`mt-6`** = 24px | +4 |
| 29 | lead `lineHeight` | 1.55 | **`leading.body`** = 1.68 | +7,8 (4 linhas @15px) |
| 40 | `<li className="py-3.5">` | 14+14px | **`py-5`** = 20+20px | **+12/linha → +48 no bloco** |
| 49 | texto do bullet `lineHeight` | 1.55 | **`leading.body`** = 1.68 | +2/linha |
| 61 | `<a className="mt-8">` | 32px | **`mt-10`** = 40px | +8 |
| 78 | `<p className="mt-4">` nota | 16px | **`mt-5`** = 20px | +4 |

**Ganho total ≈ +100px de ar.** Abaixo da dobra → custo zero no KPI.

---

### PRIORIDADE 2 — `_components/Contagem.tsx` + assento no `Hero.tsx`

`Contagem.tsx`:

| Linha | Propriedade | ANTES | DEPOIS | Δ mobile |
|---|---|---|---|---|
| 75 | `paddingTop` | `18` | **`space.sm`** = `clamp(20px,2.2vw,24px)` | +2 |
| 75 | **`paddingBottom`** | **ausente (0)** | **`space.sm`** = `clamp(20px,2.2vw,24px)` | **+20** ← corrige a queixa nº 2 |
| 81 | `<div className="mt-3">` | 12px | **`mt-4`** = 16px | +4 |
| 88-89 | dígito `lineHeight` | `1` | **`leading.digit`** = 1.05 | +1,4 |
| 96 | `<span className="mt-1.5">` unidade | 6px | **`mt-2`** = 8px | +2 |
| 103 | `<p className="mt-4">` data | 16px | **`mt-5`** = 20px | +4 |
| 58 | wrapper "encerrado" | `paddingTop: 18`, sem bottom | mesmos `space.sm` em cima e embaixo | paridade |

**Δ interno = +32px** (≈ +33,4 com o `leading.digit`; arredondado no livro-caixa).

`Hero.tsx` — compensação obrigatória (§5.2):

| Linha | ANTES | DEPOIS | Δ |
|---|---|---|---|
| 78 | `mt-12 ... lg:mt-16` | **`mt-10`** ... `lg:mt-16` (desktop preservado) | −8 |
| 104 | `<div className="mt-9">` | **`mt-8`** + `lg:mt-10` | −4 mobile / +4 desktop |
| 112 | `<a className="mt-8 ...">` | **`mt-4`** | −16 |
| 84 | `h1` `lineHeight` 1.06 | 1.06 no mobile, **`leading.display`** a partir de `sm:` | 0 mobile |
| 98 | `lead` `lineHeight` 1.55 | 1.55 no mobile, **`leading.body`** a partir de `sm:` | 0 mobile |
| 133 | `<p className="mt-3">` reforço | `mt-4` | +4 (fora do caminho crítico — está abaixo do form) |
| 146 | `<p className="mt-14">` faixa | `mt-16` = 64px | +8 (abaixo da dobra) |

Respiro percebido abaixo da contagem no mobile: **20 (paddingBottom) + 16 (`mt-4`)
= 36px**, contra 32px antes — melhor E mais barato.
No **desktop**, onde o CTA é `lg:hidden`, a contagem passa de **0px** para
**24px** de respiro inferior próprio. É a correção literal da queixa nº 2.

> A entrelinha `sm:`+ exige uma classe utilitária ou um `<style>` escopado, já
> que `lineHeight` está em `style` inline (inline não aceita breakpoint).
> Usar o mesmo padrão de `<style>` escopado que `Fecho.tsx:15` e
> `ProvaSocial.tsx:63` já empregam. **Não introduzir biblioteca nova.**

---

### PRIORIDADE 3 — `_components/Oferta.tsx`

| Linha | Propriedade | ANTES | DEPOIS | Δ |
|---|---|---|---|---|
| 20 | `<h2 className="mt-4">` | 16px | **`mt-6`** = 24px | +8 (realinha à convenção) |
| 20 | `h2` `lineHeight` | 1.06 | **`leading.display`** = 1.16 | +4,8 |
| 23 | `<p className="mt-4">` lead | 16px | **`mt-6`** = 24px | +8 |
| 23 | lead `lineHeight` | 1.55 | **`leading.body`** | +5,2 |
| 28 | `<div className="mt-12 ...">` grade | 48px | **`mt-14`** = 56px | +8 |
| 31 | card `p-6 sm:p-7` | 24 / 28px | **`p-7 sm:p-8`** = 28 / 32px | +8 |
| 45 | `<span className="mt-3">` título | 12px | **`mt-4`** = 16px | +4 |
| 57 | `<span className="mt-2">` detalhe | 8px | **`mt-3`** = 12px | +4 |
| 71-72 | nota do catálogo `mt-12` / `lineHeight` 1.55 | 48px / 1.55 | **`mt-14`** = 56px / **`leading.body`** | +8 / +9,1 |
| 78 | `<a className="mt-6">` | 24px | **`mt-8`** = 32px | +8 |

---

### PRIORIDADE 4 — `_components/SubHero.tsx` e `ui.tsx` (`TopicCard`)

`SubHero.tsx`:

| Linha | ANTES | DEPOIS | Δ |
|---|---|---|---|
| 15 | `grid gap-12 md:gap-20` | **`gap-16 md:gap-20`** = 64px | +16 |
| 17 | `h2` `lineHeight` 1.06 | **`leading.display`** = 1.16 | +7,2 |
| 22 | `flex flex-col gap-3` | **`gap-4`** = 16px | +4 × 3 = +12 |

`ui.tsx` — **atenção: só o `TopicCard`.** `Section`, `Container` e `Reveal` ficam
intactos (mexer no `Section` afeta a página inteira de uma vez).

| Linha | ANTES | DEPOIS | Δ |
|---|---|---|---|
| 270 | `padding: 'clamp(20px, 2.4vw, 28px)'` | **`space.sm`** → `clamp(20px,2.2vw,24px)`? **NÃO** — usar `clamp(24px, 2.8vw, 32px)` | +4 |
| 278 | `<h3 style={{ marginTop: 16 }}>` | `marginTop: 20` | +4 |
| 288 | `<p style={{ marginTop: title ? 8 : 14 }}>` | `title ? 12 : 18` | +4 |
| 288 | `p` `lineHeight` (herda `typo.body` 1.55) | **`leading.body`** = 1.68 | +2/linha |

> `TopicCard` também é usado pela `/touros` **através da cópia dela em
> `src/app/touros/_components/ui.tsx`** — arquivo SEPARADO e fora de escopo.
> Editar `saogeraldo/_components/ui.tsx` **não** toca a `/touros`. Confirmado
> pelo `diff` do §2.1: são dois arquivos distintos, hoje idênticos por cópia.

---

### PRIORIDADE 5 — `_components/ProvaSocial.tsx` e `_components/Footer.tsx`

`ProvaSocial.tsx`:

| Linha | ANTES | DEPOIS | Δ |
|---|---|---|---|
| 34 | override `clamp(56px, 8vw, 96px)` | **`space['2xl']`** = `clamp(72px, 9vw, 112px)` | +16 mobile |
| 39 | `Eyebrow` `lineHeight` 1.3 | **`leading.label`** = 1.45 | +1,7/linha |
| 48-49 | claim `mt-4` / `lineHeight` 1.06 | **`mt-6`** = 24px / **`leading.display`** = 1.16 | +8 / +6,6 |
| 60 | marquee `mt-10` | **`mt-12`** = 48px | +8 |

`Footer.tsx`:

| Linha | ANTES | DEPOIS | Δ |
|---|---|---|---|
| 10 | `py-14` | **`py-16`** = 64px | +16 |
| 13 | `gap-6` | **`gap-8`** = 32px | +8 |
| 14 | `gap-3` | **`gap-4`** = 16px | +4 |
| 29 | `gap-y-1` | **`gap-y-2`** = 8px | +4 |

---

## 7. Ordem de execução

| Onda | Tarefa | Arquivo | Depende de |
|---|---|---|---|
| **1** | **T-1** Adicionar `space` + `leading` (aditivos, sem mutar `typo`) | `_lib/tokens.ts` | — |
| **2** | **T-2** Corrigir o Fecho (§6, Prioridade 1) | `_components/Fecho.tsx` | T-1 |
| **3** | **T-3** Dar respiro à contagem | `_components/Contagem.tsx` | T-1 |
| **3** | **T-4** Compensar o livro-caixa do Hero | `_components/Hero.tsx` | T-3 |
| **4** | **T-5** Oferta | `_components/Oferta.tsx` | T-1 |
| **4** | **T-6** SubHero + `TopicCard` | `_components/SubHero.tsx`, `_components/ui.tsx` | T-1 |
| **4** | **T-7** ProvaSocial | `_components/ProvaSocial.tsx` | T-1 |
| **4** | **T-8** Footer | `_components/Footer.tsx` | T-1 |
| **5** | **T-9** Verificação (§8) | — | todas |

T-3 e T-4 são **um par indivisível**: T-3 sozinho estoura o orçamento da dobra
em +32px. Não fazer commit de um sem o outro.
T-5…T-8 não têm conflito de arquivo entre si — podem ir em paralelo.

---

## 8. Verificação (T-9)

1. **`npx tsc --noEmit`** — limpo.
2. **`npm run lint`** — limpo, sem novos warnings.
3. **Medição da dobra mobile** (o gate do KPI):
   - DevTools em **390×844**, `/saogeraldo`.
   - Medir a posição da **base do CTA dourado `#cadastro`** (`Hero.tsx:110`).
   - **Gate: ≤ 740px.** Valor previsto: **736,7px**.
   - Se estourar: reclamar os px em `Hero.tsx:78` (`mt-10` → `mt-8`) antes de
     desfazer qualquer respiro da `Contagem`.
4. **Conferir as contagens de linha estimadas no §1** (Oswald/Inter) contra o
   render real. Se o `h1` do Hero quebrar em 4 linhas e não 3, refazer o
   livro-caixa do §5.2 antes de fechar.
5. **Checagem visual em 3 larguras:** 390px, 768px, 1440px.
6. **`git diff --stat`** — confirmar que **nenhum** arquivo fora do escopo
   aparece (§9).

---

## 9. Restrições (o que NÃO fazer)

**Proibido tocar:**
- `src/app/touros/**` — página em produção, já aprovada.
- `src/lib/**` — produção.
- `src/app/saogeraldo/_components/Formulario.tsx` — e, por tabela, **não mutar
  `typo.*.lineHeight`**, que ele consome (§4.1).
- `src/app/saogeraldo/_lib/analytics.ts` e as rotas de API.

**Proibido mudar (é ritmo vertical, não redesign):**
- Cor, família tipográfica, `fontSize`, `fontWeight`, `letterSpacing`.
- Copy (nenhuma palavra de `copy.ts` / `copy-conversao.ts` / `evento.ts`).
- Estrutura de seções e a ordem em `page.tsx`.
- Qualquer lógica: contagem regressiva, `IntersectionObserver`, analytics,
  hidratação, `useSafeReducedMotion`.

**Fronteira explícita sobre "tipografia":** `lineHeight` **está em escopo** — é
literalmente a "entrelinha" da queixa nº 1 do cliente. Família, corpo, peso e
tracking **não estão**.

**Escopo em `ui.tsx`:** apenas `TopicCard`. `Section`, `Container`, `Reveal`,
`PillButton`, `Eyebrow`, `Hairline`, `StatNumber` e `MultiLine` ficam intactos —
o padding de tile é ajustado por `style` na chamada de cada `Section`, nunca no
default compartilhado.
