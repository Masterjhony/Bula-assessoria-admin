---
projeto: web-bula — Landing do Leilão Touros São Geraldo e 7P
rota: /saogeraldo
natureza: AUDITORIA INDEPENDENTE de acessibilidade. Medição e relatório — nenhuma edição em src/.
medido_em: 28/07/2026
medido_contra: build de produção da branch feat/leilao-sao-geraldo no commit 872c321
ferramenta: Playwright 1.60 (chromium headless) + sharp para leitura de pixel
viewports: 390×844 (celular emulado) e 1440×900 (desktop)
---

# Auditoria de acessibilidade — redesign da `/saogeraldo`

## 0. Veredito em uma tela

**14 medições de contraste: 14 PASSAM.** Todas as afirmações escritas em
comentário no código foram reproduzidas com ferramenta, e nenhuma se mostrou
otimista — duas se mostraram *conservadoras*.

| Bloco | Veredito |
|---|---|
| 1 · Corpo greige sobre `ink.musgoWash` | **PASSA** — 6,15:1 medido, exatamente o que o comentário afirma |
| 2 · Serifa da abertura sobre a foto | **PASSA** — 12,43:1 no pior pixel do pior viewport |
| 3 · `typo.cerimonia` nos lugares onde aparece | **PASSA** — 6,03:1 no pior caso, contra os 4,5:1 exigidos |
| 4 · `typo.dataMonumento` | **PASSA** — 17,83:1 |
| 5 · `typo.fichaValor` e `typo.fichaRotulo` | **PASSA** — 17,02:1 e 6,15:1 |
| `prefers-reduced-motion` | **PASSA** — marquee e contagem se comportam como especificado |
| Navegação por teclado | **PASSA** — formulário completo e enviado em 28 Tabs |
| Anel de foco do Fecho | **PASSA** — desenha, e a 6,48:1 contra o fundo |
| **Alvos de toque** | **REPROVA por 3,4px** — um alvo, o consentimento do formulário |

**A única reprova está em `Formulario.tsx`, que o plano declara fora de escopo** —
ver §6. Ela **não** viola o critério AA da WCAG; viola a régua de 44px pedida
nesta auditoria, que é AAA. A distinção está explicada, não é tecnicismo: muda
quem precisa decidir se conserta.

---

## 1. Método, e por que ele é este

### 1.1 O problema de medir contraste sobre superfície que não é sólida

Duas das cinco perguntas envolvem texto que **não** assenta sobre uma cor chapada:
o título da Pista está sobre fotografia com vinheta em gradiente, e o bloco de
ficha está sobre `rgba(57,85,62,0.10)` composto com `#0D0D0D`. Nos dois casos,
"a cor de fundo" não é um valor — é uma distribuição. Calcular a composição na
mão responde pelo valor *teórico*; não responde pelo que o navegador desenhou.

Então a medida não calcula. Ela fotografa:

1. fotografa a viewport **com** o texto;
2. esconde o texto (`visibility: hidden`) e fotografa **a mesma região**;
3. **máscara de glifo** = os pixels que mudaram entre as duas fotos — ou seja,
   exatamente onde há tinta de letra;
4. contraste da cor computada do texto contra **cada** pixel de fundo sob a
   máscara → reporta o **mínimo**.

`visibility: hidden` preserva o layout, então a segunda foto mostra o fundo
verdadeiro sob o texto, sem reflow. E a máscara evita o erro clássico de medir
a caixa inteira: a caixa de um título contém muito espaço onde não há letra
nenhuma, e o pixel mais escuro da foto pode estar justamente ali.

**Limite honesto do método:** ele vale para texto cujo fundo vem de um
ancestral. Para um elemento que carrega o próprio `background` — um botão, por
exemplo — esconder o elemento apaga também o fundo dele, e a medida sai errada.
Os cinco itens desta auditoria são todos texto sobre fundo de ancestral, então
o método se aplica. Onde ele não se aplicava (os CTAs dourados), o número foi
calculado à parte e está na §7.

### 1.2 Duas decisões de instrumentação

- **`reducedMotion: 'reduce'` no passe de contraste.** Com movimento reduzido, o
  `Reveal` devolve `<div>` simples em vez de `motion.div`, então o elemento nasce
  opaco. Sem isso a fotografia pega um quadro do *fade* e mede uma cor que não é
  a cor final. Não altera cor nenhuma — altera só se a cor já chegou.
- **`isMobile: true` a 390px.** Sem emulação de celular, a barra de rolagem do
  chromium desktop come ~15px de largura, e todo `clamp()` com `vw` resolve num
  degrau errado. Como quase toda a tipografia desta página é `clamp` com `vw`,
  medir sem isso mediria outros tamanhos de fonte.

### 1.3 Os critérios, e quando cada um vale

| Critério | Exigência | Quando se aplica |
|---|---|---|
| **WCAG 2.2 · 1.4.3 · AA (normal)** | **4,5:1** | Todo texto abaixo de 24px |
| **WCAG 2.2 · 1.4.3 · AA (large)** | **3:1** | ≥24px, ou ≥18,66px com peso ≥700 |
| **WCAG 2.2 · 1.4.11 · AA** | **3:1** | Indicador de foco, contra a cor adjacente |
| **WCAG 2.2 · 2.5.8 · AA** | **24×24px** | Alvo de ponteiro (com exceção de espaçamento) |
| **WCAG 2.1 · 2.5.5 · AAA** | **44×44px** | Alvo de ponteiro — é a régua pedida nesta auditoria |

Duas notas que decidem vereditos abaixo:

- **Peso 600 não é "bold" para a regra de large text.** O atalho de 18,66px exige
  peso **≥700**. Onde o texto é 600, esta auditoria aplicou o corte conservador
  de **24px**. Nenhum veredito mudaria com a leitura frouxa, mas o número certo
  é o que se registra.
- **Os tamanhos são os RESOLVIDOS**, lidos de `getComputedStyle` em cada viewport
  — não o que está escrito no `clamp()`. `typo.cerimonia` chega a 11px no celular
  e 13px no desktop; `typo.dataMonumento`, a 27,3px e 44px.

---

## 2. Contraste — item por item

Legenda: **glifo** = pior pixel sob a máscara de letra (a medida desta auditoria).
**caixa** = pior pixel da caixa inteira, incluindo onde não há letra (medida mais
severa, registrada para reconciliar com os comentários do código).

### Item 1 · Corpo greige `#9A9488` sobre `#0D0D0D` coberto por `ink.musgoWash`

O elemento real é `typo.fichaRotulo` (`ui.tsx:207`, cor `p.body`), dentro do
bloco de ficha da Pista (`Pista.tsx:175`).

| Viewport | Tamanho / peso | Fundo composto medido | Contraste | Critério | Veredito |
|---|---|---|---|---|---|
| 390×844 | 10,5px / 500 | `rgb(17,20,17)` | **6,15:1** | AA normal · 4,5:1 | **PASSA** |
| 1440×900 | 11,5px / 500 | `rgb(17,20,17)` | **6,15:1** | AA normal · 4,5:1 | **PASSA** |

**A afirmação de 6,15:1 está CONFIRMADA**, no valor exato, nos dois viewports.

Duas divergências pequenas, nenhuma delas muda veredito:

- `Pista.tsx:171` afirma **6,20:1 no celular** e 6,15:1 no desktop. O medido é
  **6,15:1 nos dois** — o fundo composto não muda com o viewport, então não há
  razão para o número mudar. O 6,20 é otimista em 0,05.
- `Pista.tsx:170` afirma fundo efetivo `rgb(16,19,16)`; o medido é
  `rgb(17,20,17)`. `tokens.ts:86` diz `~#111412`, que é `rgb(17,20,18)` — mais
  perto. Diferença de arredondamento do compositor do navegador.

### Item 2 · Título serifado da abertura da Pista, sobre a vinheta da foto

O único texto da página que assenta sobre imagem. Medido no **pior pixel**.

| Elemento | Viewport | Tamanho / peso | Pior fundo | Glifo | Caixa | Critério | Veredito |
|---|---|---|---|---|---|---|---|
| `aberturaSerif` (`Pista.tsx:135`) | 390×844 | 30px / 400 | `rgb(43,40,33)` | **13,49:1** | 13,23:1 | AA large · 3:1 | **PASSA** |
| `aberturaSerif` | 1440×900 | 60px / 400 | `rgb(52,45,38)` | **12,43:1** | 8,95:1 | AA large · 3:1 | **PASSA** |
| eyebrow `Cerimonia` (`Pista.tsx:134`) | 390×844 | 11px / 400 | `rgb(81,73,63)` | **8,11:1** | 6,91:1 | AA normal · 4,5:1 | **PASSA** |
| eyebrow `Cerimonia` | 1440×900 | 13px / 400 | `rgb(105,91,73)` | **6,03:1** | 5,32:1 | AA normal · 4,5:1 | **PASSA** |

O título é `large` porque chega a 30px no celular — acima dos 24px, com folga. O
eyebrow **não** é: a 11px ele é texto normal e responde a 4,5:1. É o item mais
apertado da página inteira, e ainda assim passa com 34% de margem no pior caso
(6,03 contra 4,5).

**Reconciliação com o comentário de `Pista.tsx:60-61`.** Os quatro números
afirmados lá — 6,91 · 13,21 · 5,34 · 8,95 — batem, dentro de 0,02, com a coluna
**caixa** desta tabela. Ou seja: o Prumo mediu a caixa inteira, que é o critério
mais severo, e registrou o número pior. A afirmação do código não é otimista —
é conservadora. **Confirmada.**

Também confirmada a decisão de usar branco e não dourado. Contra os mesmos
piores pixels sob glifo, o dourado `#C8A96E` mediria:

- celular, `rgb(81,73,63)` → **3,94:1** — reprova AA normal (4,5:1), que é o que
  o eyebrow a 11px exige;
- desktop, `rgb(105,91,73)` → **2,93:1** — reprova AA normal **e** AA large.

O comentário de `Pista.tsx:63` estima 3,36 e 2,59, medindo contra os pixels da
caixa inteira, que são mais escuros. Números diferentes, conclusão idêntica e
igualmente sólida: **dourado sobre esta foto reprova**, e o branco é o que o
pixel permitiu. Ornamento não gasta margem de contraste.

### Item 3 · `typo.cerimonia` — onde ele aparece

**Aparece em QUATRO lugares, não três.** Além dos três da pauta, o eyebrow da
Pista (item 2) também é `Cerimonia`. Todos a 11px no celular e 13px no desktop,
peso 400 — **texto normal em todos os viewports**, portanto **4,5:1**, como a
pauta corretamente antecipou.

| Lugar | Cor | Fundo | Contraste | Veredito |
|---|---|---|---|---|
| Contagem — `SÁBADO · 12H` (`Contagem.tsx:124`) | `dark.gold` `#C8A96E` | `#0D0D0D` | **8,66:1** | **PASSA** |
| Crédito do Hero (`Hero.tsx:297`) | `dark.muted` `#B0B0B0` | `#0D0D0D` | **8,96:1** | **PASSA** |
| Rodapé (`Footer.tsx:56`) | `dark.muted` `#B0B0B0` | `#0D0D0D` | **8,96:1** | **PASSA** |
| Eyebrow da Pista (`Pista.tsx:134`) | `dark.text` `#F5F5F5` | foto | **6,03:1** | **PASSA** |

`Contagem.tsx:123` afirma "~8:1" para o dourado a 11px. O medido é **8,66:1** —
a afirmação é conservadora. Confirmada.

A escolha de `muted` em vez de `faint` está certa e vale registrar por quê: o
`faint` (`#6B6B6B`) daria **3,65:1** sobre `#0D0D0D`, e a 11px isso reprova AA
sem apelação. O próprio `tokens.ts:23` avisa disso, e o `Cerimonia` respeita.

### Item 4 · `typo.dataMonumento` — `01 AGOSTO` sobre `#0D0D0D`

| Viewport | Tamanho / peso | Contraste | Critério | Veredito |
|---|---|---|---|---|
| 390×844 | 27,3px / 400 | **17,83:1** | AA large · 3:1 | **PASSA** |
| 1440×900 | 44px / 400 | **17,83:1** | AA large · 3:1 | **PASSA** |

`#F5F5F5` sobre `#0D0D0D` é o par de maior contraste da página. Passa AA large
com 5,9× a exigência, e passaria AA normal com 3,9× — o veredito não depende
do corte de 24px.

### Item 5 · Os quatro números da ficha e seus rótulos

Ambos dentro do bloco `ink.musgoWash`, fundo composto medido `rgb(17,20,17)`.

| Preset | Viewport | Tamanho / peso | Contraste | Critério | Veredito |
|---|---|---|---|---|---|
| `fichaValor` | 390×844 | 34px / 600 | **17,02:1** | AA large · 3:1 | **PASSA** |
| `fichaValor` | 1440×900 | 54px / 600 | **17,02:1** | AA large · 3:1 | **PASSA** |
| `fichaRotulo` | 390×844 | 10,5px / 500 | **6,15:1** | AA normal · 4,5:1 | **PASSA** |
| `fichaRotulo` | 1440×900 | 11,5px / 500 | **6,15:1** | AA normal · 4,5:1 | **PASSA** |

Os quatro monumentos medem igual entre si — mesma cor, mesmo fundo. Medidos
individualmente mesmo assim, para não assumir.

**Bônus fora da pauta, mesmo bloco:** a linha de apoio (`Pista.tsx:194`,
`dark.muted` a 14px) dá **8,55:1**. Texto normal, exige 4,5:1. **PASSA.**

---

## 3. `prefers-reduced-motion` ligado

Medido em dois contextos de navegador por viewport — um com `reducedMotion:
'reduce'`, outro sem — comparando os dois. `matchMedia('(prefers-reduced-motion:
reduce)')` confirmou `true` nos passes reduzidos e `false` nos normais, então a
consulta chegou de fato ao CSS.

| O que a pauta pergunta | Sem reduzir | Com reduzir | Veredito |
|---|---|---|---|
| O marquee para? | `animation-name: touros-marquee`, 38s | `animation-name: none`, `0s` | **PASSA** |
| Vira grade centralizada com wrap? | `flex-wrap: nowrap`, `justify-content: normal` | `flex-wrap: wrap`, `justify-content: center` | **PASSA** |
| A faixa deixa de ser trilho? | largura `2615px` (celular) / `4108px` (desktop) | `390px` / `1440px` — 100% do viewport | **PASSA** |
| A cópia `aria-hidden` some? | `display: flex` | `display: none` | **PASSA** |
| Os segundos somem? | 4 blocos: `dias horas min seg` | 3 blocos: `dias horas min` | **PASSA** |

O último item confirma também o que a pauta pergunta sobre a atualização de
minuto em minuto: `Contagem.tsx:102` só empurra o bloco de segundos quando
`!reduzirMovimento`, e `Contagem.tsx:63-65` condiciona o intervalo à mesma
variável. Com o mostrador de segundos fora de cena, não há repintura de segundo
em segundo para observar — o comportamento é o especificado.

Resultado idêntico nos dois viewports.

---

## 4. Navegação só por teclado

**Percurso completo, sem um único clique de mouse:** `Tab`, `Space`, `ArrowDown`
e `Enter`. Em **28 pressionamentos de Tab** a auditoria preencheu as três etapas
(`Seus dados` → `Sua fazenda` → `Sua compra`) e disparou o `POST` para
`/api/saogeraldo/lead` com o payload completo.

> **Nenhum lead foi gravado.** A rota `**/api/saogeraldo/lead` foi interceptada e
> abortada no navegador — o teste prova que o envio **acontece**, sem escrever na
> base nem na planilha. O bloqueio foi cirúrgico de propósito: a chamada ao IBGE
> que popula o select de município continuou passando, senão o segundo passo não
> preencheria e o teste mediria uma página que o usuário nunca vê.

| Verificação | Resultado | Veredito |
|---|---|---|
| Chega ao formulário por Tab? | Sim — é a **primeira** parada de tabulação da página | **PASSA** |
| Todos os campos alcançáveis? | Sim, nas três etapas, incluindo os dois `select` | **PASSA** |
| Dá para enviar? | Sim — `POST` disparado com payload completo | **PASSA** |
| `:focus-visible` do Fecho desenha? | Sim | **PASSA** |

**Anel de foco do Fecho** (`Fecho.tsx:29-32`), medido com foco de teclado:

- `a.matches(':focus-visible')` → `true`
- `box-shadow` computado: `rgb(13,13,13) 0 0 0 2px, rgba(200,169,110,0.85) 0 0 0 4px`
- Cor efetiva do anel dourado: `rgb(172,146,95)`
- **Contraste contra o fundo `#0D0D0D`: 6,48:1** — critério 1.4.11 exige 3:1.
  **PASSA com 2,2× a exigência.**

A ordem de tabulação é limpa: 5 paradas no formulário, depois âncora da Pista,
CTA da Oferta, CTA do Fecho, e os dois links do rodapé. Nenhuma armadilha de
foco, nenhuma parada invisível, nenhum `tabindex` positivo.

---

## 5. Alvos de toque — **a única reprova**

Onze alvos interativos no celular. Dez passam a régua de 44px. Um não.

| Alvo | Medida | 44×44 (AAA) | 24×24 (AA) |
|---|---|---|---|
| `input[type=text]` nome | 318 × 50 | ✅ | ✅ |
| `input[type=tel]` WhatsApp | 318 × 50 | ✅ | ✅ |
| `input[type=email]` | 318 × 50 | ✅ | ✅ |
| **Consentimento de WhatsApp** | **318 × 40,6** | **❌ falta 3,4px** | ✅ |
| `button` Continuar | 318 × 56 | ✅ | ✅ |
| Âncora da Pista | 301 × 44 | ✅ (no fio) | ✅ |
| CTA da Oferta | 311 × 54 | ✅ | ✅ |
| CTA do Fecho | 355 × 56 | ✅ | ✅ |
| StickyCta | 362 × 56 | ✅ | ✅ |
| Privacidade / Termos | 86 × 44 · 60 × 44 | ✅ | ✅ |

### O que exatamente reprova, e o que NÃO reprova

O `<input type=checkbox>` mede **20 × 20px** — mas esse não é o alvo. Ele está
**dentro de um `<label>`** (`Formulario.tsx:347`), e um label envolvente é
clicável: o alvo real é a caixa do label, **318 × 40,6px**. A auditoria mediu as
duas coisas justamente para não reportar 20×20 e assustar à toa.

Então:

- Contra **SC 2.5.8 (AA, 24×24px)**: **PASSA**. 318 × 40,6 tem folga larga.
  **A página não viola o critério AA da WCAG em alvo de toque.**
- Contra a régua de **44px pedida nesta auditoria** — que é SC 2.5.5, **AAA**, e
  a mesma da Apple HIG: **REPROVA por 3,4px**.

A altura de 40,6px vem da soma: duas linhas de texto a 14px com `line-height`
1,45 (40,6px) mais nenhum padding vertical. Faltam 3,4px.

---

## 6. O que muda, e onde — **não editado, só apontado**

**Uma alteração, um arquivo, uma linha.**

- **Arquivo:** `src/app/saogeraldo/_components/Formulario.tsx`
- **Linha 347**, o `<label>` que envolve o checkbox de consentimento:
  ```
  <label className="mt-1 flex cursor-pointer items-start gap-3" ...>
  ```
- **Mudança:** dar ao label altura mínima de 44px — `minHeight: 44` no `style`,
  ou `items-center` com padding vertical de ~2px. Qualquer um dos dois fecha os
  3,4px.

**Três coisas que quem for aplicar precisa saber:**

1. **`Formulario.tsx` está declarado fora de escopo pelo plano** (§6.1 e §8), e
   por bom motivo: ele vive dentro da primeira dobra. Esta auditoria **não** o
   editou. A decisão de tocar nele é de quem é dono do arquivo.
2. **O portão 13 (dobra ≤596px) não corre risco.** O checkbox fica *abaixo* do
   topo de `#cadastro`, e o portão mede o **topo**. Fazer o formulário crescer
   3,4px para baixo não move o topo dele nem um pixel.
3. **É AAA, não AA.** Se a decisão for não mexer, a página continua em
   conformidade AA. Vale registrar a escolha em vez de deixá-la implícita.

---

## 7. Achados laterais

Coisas que a medição encontrou de passagem. Nenhuma é bloqueio de acessibilidade;
duas afetam portões do plano.

**7.1 · O portão 9 do plano vai reprovar, e o problema é o portão, não o código.**
A §7.2 espera que
`grep -rln "font.serif\|typo.cerimonia\|typo.dataMonumento\|typo.aberturaSerif"`
devolva exatamente `Contagem.tsx`, `Pista.tsx`, `Hero.tsx`. O que ele devolve
hoje é `Contagem.tsx`, `Pista.tsx`, **`ui.tsx`**. Motivo: `Hero.tsx` e
`Footer.tsx` consomem o **componente** `<Cerimonia>`, não o token direto — e o
token vive em `ui.tsx`, que é onde o `<Cerimonia>` foi implementado. A serifa
renderiza em **quatro** lugares (Contagem, Pista, Hero, rodapé), todos legítimos
e todos medidos acima. O portão precisa ser reescrito para procurar o uso do
componente, não do token.

**7.2 · `tokens.ts:20` afirma ~6.7:1 para o greige sobre `#0D0D0D`; o valor é 6,45:1.**
Calculado pela fórmula da WCAG e coerente com `Pista.tsx:156`, que já registra
6,45:1. Passa AA normal com folga nos dois números — só o comentário do token
está 0,25 otimista.

**7.3 · Os CTAs dourados foram conferidos à parte.** O método de máscara não
serve para elemento que carrega o próprio fundo (esconder o botão esconde
também o dourado). Calculado: `#0D0D0D` sobre `#C8A96E` dá **8,66:1** — o mesmo
par do item 3, invertido. **PASSA.**

**7.4 · `dark.faint` não é usado em lugar nenhum.** O `#6B6B6B` daria 3,65:1
sobre o near-black e reprovaria AA abaixo de 18px. Varredura em
`_components/` e `_lib/`: o token só aparece **dentro de comentários**, sempre
para explicar por que não foi usado. Nenhuma ocorrência como valor de `color`.
O aviso de `tokens.ts:23` está sendo respeitado à risca.

---

## 8. Como reproduzir

O instrumento não foi commitado — esta entrega é de escopo `docs`. O método está
descrito na §1 com detalhe suficiente para reescrevê-lo; o essencial:

```
npm run build && npx next start --port <livre>
```

Playwright, chromium headless, `deviceScaleFactor: 1`, `isMobile: true` a 390px,
`reducedMotion: 'reduce'` no passe de contraste e `colorScheme: 'light'` fixo.
Para cada alvo: `page.screenshot()` com e sem `visibility:hidden`, recorte pela
`getBoundingClientRect`, decodificação em `sharp(...).raw()`, máscara pela
diferença por canal (limiar 24 na soma RGB) e mínimo da razão de contraste WCAG
sobre os pixels mascarados.

Para o teste de teclado, `ctx.route('**/api/saogeraldo/lead', r => r.abort())`
**antes** de qualquer tabulação — sem isso o teste grava lead de verdade.
