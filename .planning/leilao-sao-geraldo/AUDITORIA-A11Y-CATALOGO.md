---
projeto: web-bula — Landing do Leilão Touros São Geraldo e 7P
rota: /saogeraldo (redesenho de 28/07 — reprodução das 3 primeiras páginas do catálogo)
natureza: AUDITORIA INDEPENDENTE de acessibilidade e craft. Medição e relatório — nenhuma edição em src/.
medido_em: 28/07/2026
medido_contra: build de PRODUÇÃO (`npm run build` + `next start`) do estado do disco em 28/07 14:41
ferramenta: Playwright 1.60 (chromium headless) + sharp para leitura de pixel
viewports: 375×667 · 390×844 · 768×1024 · 1440×900
fontes_auditadas: |
  page.tsx 074a81272b9f · layout.tsx 89184946508e · _lib/tokens.ts 238771a0fe22
  _lib/frete.ts d89ba6be91c6 · _lib/copy-catalogo.ts bd847fe7f86e
  NavCatalogo a4352149e654 · HeroCatalogo 1633dca28fb9 · ContagemCatalogo 25f1093ec1d2
  Captura 25072ddff8e2 · Pagamento b6e9251fba84 · Frete c3a437131de4
  MapaBrasil 53f9904e34bd · RodapeCatalogo aff1cfc62540 · ui-catalogo 260177fedd36
  Formulario d2e269c89411
---

# Auditoria de acessibilidade e craft — `/saogeraldo` do catálogo

## 0. Veredito em uma tela

**346 pares de contraste medidos por máscara de glifo, em 4 viewports.** Dez
medições ficam abaixo do mínimo, e elas são **três defeitos distintos** — a mesma
cor reprovando no mesmo lugar em quatro larguras conta uma vez. Dois são reprova
limpa de AA; o terceiro é ressalva de borda, com a mediana passando (§2.6).

Nenhum dos três está no que o redesenho desenhou de novo: dois estão em cor
herdada e o mais grave está no formulário, que não foi tocado.

| Bloco | Veredito |
|---|---|
| Texto do Hero sobre a foto | **PASSA** — pior caso 5,86:1 (a data, em 390), contra 3:1 exigidos |
| Nav sobre a foto (mobile) | **PASSA** — 6,46:1 no pior item |
| **Nav sobre a foto (≥768, a data)** | **REPROVA — 3,33:1** em 1440, exige 4,5 |
| Pagamento sobre card translúcido | **PASSA** — 15,02:1 no valor, 6,17:1 no detalhe |
| **Legenda do frete, faixa `#816852`** | **REPROVA — 2,89:1**, exige 3,0 mesmo como texto grande |
| Legenda do frete, outras 3 faixas | **PASSA** — 5,28 a 5,71:1 |
| Tabela equivalente do `<details>` | **PASSA** — 10,82 a 15,02:1 |
| Siglas dentro do mapa | **PASSA na mediana (6,14:1)**, com 2 rótulos raspando a divisa — ver §2.6 |
| **Foco de teclado nos 4 campos do formulário** | **REPROVA — zero pixel muda ao focar** |
| Foco de teclado no resto da página | **PASSA** — 9,22 a 10,81:1, 8 de 8 elementos |
| Alvos de toque | **1 abaixo de 44px** — o checkbox de 20px, item AAA, pré-existente |
| Rolagem horizontal · console · build | **PASSA** — zero em 4 viewports |
| `prefers-reduced-motion` | **PASSA** — nenhuma animação ativa, contagem em 60s |
| Estrutura (títulos, landmarks, alt, lang) | **PASSA** — sem salto de nível, 3/3 imagens com alt |

**A reprova que importa é a do foco**, e ela não é de contraste: é a ausência de
qualquer indicação visual de foco nos quatro controles do único formulário da
página — o KPI inteiro. Detalhe em §3.

**Uma correção à minha própria auditoria anterior:** o documento de 872c321 diz
"Navegação por teclado: PASSA — formulário completo e enviado em 28 Tabs". Aquilo
mediu **travessia**, não **visibilidade**. O formulário sempre pôde ser percorrido;
o que nunca foi medido é se dá para VER onde o foco está. Não dá. O furo era meu.

---

## 1. Método, e onde ele me traiu

### 1.1 Máscara de glifo, e por que não dá para ler `background-color`

Nesta página quase nenhum texto assenta sobre cor sólida: o Hero é texto sobre
foto sob gradiente de cinco paradas; Pagamento e Frete são texto sobre card
`rgba(58,45,30,0.38)` sobre `#2B1F13`; a nav é texto sobre foto ou sobre
`rgba(26,19,13,0.88)` com `backdrop-filter`. Ler o `background-color` declarado
do elemento devolveria `transparent` ou a cor do card **antes** da composição —
e é exatamente aí que a conta erra.

O procedimento usado nas 346 medições — 323 da varredura automática (todo
elemento-folha com texto, nos 4 viewports), 15 da nav fixa medida à parte e 8 da
tabela do `<details>` aberta:

1. fotografa a página com o texto visível → **A**
2. torna **todo** texto transparente (`color`, e `fill` no SVG) e refotografa → **B**
3. o glifo é onde A difere de B em mais de 12/255 num canal
4. contraste = **cor declarada do texto × pior pixel de B sob a máscara**

O pixel de B já é o resultado da composição — foto, véu, card translúcido e
`backdrop-filter` inclusive. É o oposto de estimar.

Reporto o **pior pixel**, não o médio. Onde pior e mediana divergem muito, os dois
aparecem, porque a diferença é a informação (§2.6).

### 1.2 Três erros meus, e como cada um foi derrubado

Auditoria que não mostra o próprio erro está escondendo o método.

| Erro do instrumento | Como apareceu | Como foi resolvido |
|---|---|---|
| `screenshot({fullPage})` não pinta conteúdo dentro de `Reveal` que ainda não entrou na viewport | 50 dos 92 elementos voltaram "sem pixel de glifo" — justamente o card de Pagamento e o mapa | repetido com `reducedMotion: 'reduce'`, que faz o `Reveal` renderizar direto. 88 de 88 medidos |
| `el.focus()` programático não é `:focus-visible` | 3 campos apareceram sem indicador e um COM indicador de 4.099px | refeito com `keyboard.press('Tab')` real, e depois com A/B **sem rolagem entre as fotos**. Os 4.099px eram rolagem minha, não anel |
| clip calculado antes de a página assentar | a tabela do `<details>` acusou 2,17:1 sobre fundo champagne | a foto da tela mostra tabela creme sobre carvão. Refeito célula a célula, relendo a caixa antes de cada foto: **10,82 a 15,02:1** |

Nenhum dos três sobreviveu. Os números deste documento são os do instrumento
corrigido.

---

## 2. Contraste, bloco a bloco

### 2.1 Hero sobre a foto — CONFIRMA a medição trazida

Pedido: confirmar ou derrubar `eyebrow 8,19 · data 5,89 · cerimônia 13,21` em 390×844.
Remedido do zero, mesmo método, execução independente:

| Elemento | trazido | **medido agora** | Δ |
|---|---|---|---|
| eyebrow `TRADIÇÃO QUE GERA RESULTADOS!` | 8,19 | **8,20** | +0,01 |
| data `01 DE AGOSTO` | 5,89 | **5,86** | −0,03 |
| cerimônia `SÁBADO · 12H` | 13,21 | **13,28** | +0,07 |

**Confirmado.** As três dentro de ±0,07 — a variação é de sub-pixel de
antialiasing entre execuções, não de método.

O Hero inteiro, nos quatro viewports (pior pixel de cada um):

| Elemento | cor | exige | 375 | 390 | 768 | 1440 |
|---|---|---|---|---|---|---|
| eyebrow (Cormorant 11–14px) | `#FFFFFC` | 4,5 | 8,15 | 8,20 | 9,10 | 9,50 |
| data-monumento (26–44px) | `#FFFFFC` | 3,0 | 10,87 | **5,86** | 7,21 | 9,18 |
| cerimônia `SÁBADO · 12H` | `#FFFFFC` | 4,5 | 6,21 | 13,28 | 13,09 | 14,52 |
| pílula `150 REPRODUTORES` | `#FFFFFC` | 4,5 | 18,29 | 18,30 | 18,34 | 16,53 |
| pílula sub `TRIPLAMENTE AVALIADOS` | `#B9A46F` | 4,5 | 18,29 | 18,30 | 18,34 | 16,53 |
| CTA `RECEBER O CATÁLOGO` (texto carvão sobre champagne) | `#1A130D` | 4,5 | 7,53 | 7,53 | 7,53 | 7,53 |
| dica `↓ Role para receber` | `#988D70` | 4,5 | 5,58 | 5,58 | 5,58 | 5,58 |

O pior caso da página inteira sobre foto é a **data em 390: 5,86:1** — quase o
dobro dos 3:1 que ela precisa como texto grande. O véu de cinco paradas do
`HeroCatalogo` está fazendo o trabalho que promete.

Vale registrar o acerto de decisão: o eyebrow é branco e não champagne. O
comentário do componente afirma que em champagne ele daria 2,00:1 ali. Não
reproduzi esse número (o elemento não existe em champagne para ser fotografado),
mas a direção é verificável — o champagne `#B9A46F` tem luminância média e, sobre
o pedaço claro do céu, cai. A escolha do branco está medida em 8,20:1.

### 2.2 Pagamento — texto sobre card translúcido

Este era um dos pontos declarados como não medidos. O fundo efetivo do
`CardCatalogo` foi medido em **`rgb(49,36,23)`** — e bate exatamente com a álgebra
de `rgba(58,45,30,0.38)` sobre `#2B1F13` (48,7 / 36,3 / 23,2). O card **clareia** o
carvão, então todo texto dentro dele tem contraste MENOR que o mesmo texto na
seção. É o efeito que precisa ser medido, e é.

| Elemento | cor | tamanho | exige | **medido** |
|---|---|---|---|---|
| `30 PARCELAS` (Playfair 700) | `#FFFFFC` | 22–38px | 3,0 | **15,02** |
| `(2+2+2+2+2+20 PARCELAS)` | `#B9A46F` | 14–20px | 4,5 | **6,17** |
| nota `Facilidades pensadas…` (fora do card) | `#988D70` | 11–13px | 4,5 | **4,88** |
| título `Condição de Pagamento` (fora do card) | `#FFFFFC` | 28–52px | 3,0 | **16,02** |
| eyebrow `NO DIA DO LEILÃO` (fora do card) | `#B9A46F` | 11–14px | 4,5 | **6,58** |

**Passa inteiro.** O champagne do detalhe sobre o card dá 6,17:1 — o card custou
0,41 em relação aos 6,58 da seção, e a margem absorveu.

### 2.3 Frete — a reprova de `#816852`

| Faixa | cor do rótulo | fundo medido | exige | **medido** | |
|---|---|---|---|---|---|
| `FRETE GRÁTIS*` qualquer quantidade | `#B59C74` | rgb(49,36,23) | 3,0 | **5,71** | passa |
| **`FRETE GRÁTIS*` a partir de 2 lotes** | **`#816852`** | rgb(49,36,23) | 3,0 | **2,89** | **REPROVA** |
| `FRETE SOB CONSULTA` | `#8EA094` | rgb(49,36,23) | 3,0 | **5,45** | passa |
| `NÃO É POSSÍVEL A ENTREGA` | `#999999` | rgb(49,36,23) | 3,0 | **5,28** | passa |
| subtítulos (`QUALQUER QUANTIDADE`…) | `#F7F1E6` | rgb(49,36,23) | 4,5 | **13,39** | passa |
| nota do asterisco | `#988D70` | rgb(49,36,23) | 4,5 | **4,57** | passa |
| `<summary>` da tabela | `#B9A46F` | rgb(49,36,23) | 4,5 | **6,17** | passa |
| eyebrow `COBERTURA NACIONAL` (fora do card) | `#B9A46F` | rgb(43,31,19) | 4,5 | **6,58** | passa |
| título `Condição de Frete` (fora do card) | `#FFFFFC` | rgb(43,31,19) | 3,0 | **16,02** | passa |

**A nota de contraste escrita em `Frete.tsx:23` diz `#816852 …… 3,08:1 AA-large`.
Esse número está certo para a cor sobre a SEÇÃO e errado para onde o texto
realmente está.** O rótulo vive dentro do `CardCatalogo`, e o card clareia o fundo
de `rgb(43,31,19)` para `rgb(49,36,23)`. Refazendo a conta nos dois fundos:

```
#816852 sobre a seção  #2B1F13 → 3,086:1   passa como texto grande (o número do comentário)
#816852 sobre o card   rgb(49,36,23) → 2,893:1   REPROVA, por 0,107
```

Idêntico nos quatro viewports (a cor e o fundo não dependem da largura). É o caso
exato que o pedido antecipou: **o fundo efetivo não é sólido, e a diferença
inverteu o veredito.**

Visualmente o defeito aparece: na captura de 1440 a segunda linha da legenda é
nitidamente mais apagada que as outras três.

O que resolve, com o número de cada opção:

| Opção | Efeito | Dono |
|---|---|---|
| clarear `#816852` para ~`#856B54` (+4 pontos por canal) | leva a 3,02:1 sobre o card | `_lib/frete.ts` (Aferidor) |
| escurecer o card de `0.38` para `≤0.16` de alfa | devolve 3,09:1, mas apaga o card | `ui-catalogo.tsx` |
| pôr o rótulo em creme e deixar a cor só na cápsula | 13,39:1, mas quebra o pareamento rótulo↔cor | `Frete.tsx` |

A primeira é a única que preserva o desenho. **Nenhuma foi aplicada**: a cor mora
em `_lib/frete.ts`, que é do Aferidor nesta onda.

**Fragilidade adjacente, medida:** a nota do asterisco passa por **0,07** (4,57
contra 4,5), e ela é `dark.muted` a 10,5px dentro do card — precisamente o que
`tokens.ts:44` proíbe ("`muted` é PROIBIDO como texto pequeno dentro de card
elevado; use `body` lá"). A regra escrita foi violada; o valor medido sobreviveu
porque o card é translúcido e não o `surface2` sólido que a regra tinha em mente.
Calculado o ponto de ruptura: **se o alfa do card subir de 0,38 para 0,48, essa
linha reprova.** Duas linhas da tabela do `<details>` (`Condição`, `Estados`) estão
na mesma situação, com o mesmo 4,57.

### 2.4 Nav — a segunda reprova

A nav é `position: fixed` e foi medida à parte, nos dois estados que ela tem.

| Item | estado | 390 | 768 | 1440 |
|---|---|---|---|---|
| `LEILÃO TOUROS` (9–11px, champagne) | sobre a foto | 6,46 | — | 5,65 |
| `São Geraldo e 7P Agro` (13–16px) | sobre a foto | 15,14 | — | 11,02 |
| **`01 de agosto · SÁBADO · 12H`** (12px, `#988D70`) | **sobre a foto** | não renderiza | **4,78** | **3,33 ✗** |
| `RECEBER CATÁLOGO` (13px, champagne) | sobre a foto | 7,37 | — | 5,99 |
| todos os itens | nav opaca (rolada) | 7,46–18,18 | — | 5,58–18,34 |

A data só existe a partir de `md:` (`hidden md:block`). Em 768 ela passa raspando
(**4,78**); em **1440 reprova, com 3,33:1**. O fundo sob ela no desktop é
`rgb(85,53,32)` — o pedaço claro do céu do entardecer, que no corte horizontal
sobe até a altura da barra.

É a **primeira coisa que um visitante de desktop vê**, antes de qualquer rolagem.
Depois de rolar 40px a barra fecha em `rgba(26,19,13,0.88)` e o mesmo texto vai a
5,58:1.

Correções possíveis, com número:

| Opção | Resultado | Dono |
|---|---|---|
| trocar `dark.muted` por `dark.body` (`#F7F1E6`) só nessa linha | ~13:1 sobre o mesmo pixel | `NavCatalogo.tsx` |
| clarear `dark.muted` `#988D70` no token | resolve aqui e sobe a margem do form (4,88) e da tabela (4,57) | `_lib/tokens.ts` |
| dar à barra um véu mínimo já no estado inicial | mantém a cor e o desenho translúcido | `NavCatalogo.tsx` |

`NavCatalogo.tsx` não está entre os arquivos liberados para mim, e mexer em
`dark.muted` reverbera por seis lugares — é decisão de dono, não de auditor.

### 2.5 Formulário e rodapé

| Elemento | cor | exige | medido |
|---|---|---|---|
| lede da Captura | `#F7F1E6` | 4,5 | 14,28 |
| rótulos dos campos | `#FFFFFC` | 4,5 | 16,02 |
| dica `É por onde o assessor vai falar…` | `#988D70` | 4,5 | **4,88** |
| consentimento (14px) | `#988D70` | 4,5 | **4,88** |
| `PASSO 1 / 3` | `#988D70` | 4,5 | 4,88 |
| link do site no rodapé | `#B9A46F` | 4,5 | 7,53 |
| `Leilão Touros São Geraldo e 7P` | `#988D70` | 4,5 | 5,58 |
| `Privacidade` · `Termos` | `#988D70` | 4,5 | 5,58 |

Passa inteiro. As quatro linhas em 4,88 são o `muted` sobre o fundo do card do
formulário — margem de 0,38 sobre o mínimo.

### 2.6 As siglas dentro do mapa — passa na mediana, raspa na borda

26 siglas renderizadas. Cor por faixa, definida em `_lib/frete.ts`, medida:

```
mediana das 26 siglas ......... 6,14:1   (ink #201812 sobre as tintas claras)
melhor ........................ 15,02:1
pior .......................... 1,32:1   (AC, em 390×844)
```

Dois rótulos ficam abaixo de 4,5 no **pior pixel**, e os dois pela mesma causa:

| Sigla | pior pixel | p01 | **mediana** | causa |
|---|---|---|---|---|
| AC | 1,32 (390) · 1,83 (1440) | 1,32 · 3,27 | **6,14** | o glifo encosta na divisa entre estados, que é pintada com o próprio carvão `#2B1F13` |
| PI | 4,19 (390) · 6,64 (1440) | 4,19 | **6,64** | mesma coisa; some em 1440 |

Testei a hipótese óbvia — "o rótulo não cabe no estado" — e ela **caiu**: o
polígono do Acre mede 53,1×29,1px e a sigla 7,5×10,0px em 390. O rótulo cabe com
folga; ele só está **posicionado sobre a linha de divisa**, e o stroke tem ~1,9px
de largura em carvão escuro. É defeito de posição de âncora, não de tamanho.

Também testei se as 7 siglas que caem fora de qualquer polígono (RN, PB, PE, AL,
SE, ES, RJ) são erro: **não são.** Os mesmos 7 códigos estão marcados
`externo: true` em `mapa-brasil-paths.ts` e recebem `dark.text` porque assentam no
carvão. Conferido um a um. Intencional e correto.

**O que é craft e não a11y:** a sigla renderiza a **9–10px de altura em 390×844**.
É pequeno demais para leitura confortável, e o próprio componente reconhece isso
em comentário. A mitigação existe e funciona — a tabela equivalente do `<details>`
mede 10,82 a 15,02:1 e carrega o nome do estado por extenso. Informação essencial
não vive só na forma geométrica. Este é o padrão certo.

---

## 3. Foco de teclado — a reprova que importa

Era o terceiro ponto declarado como não medido. Método: para cada elemento
focável, `Tab` de verdade (não `focus()` programático, que não dispara
`:focus-visible` do mesmo jeito), duas fotos da mesma região **sem nenhuma
rolagem entre elas**, e contagem de pixels alterados.

| # | Elemento | pixels que mudam ao focar | contraste do anel |
|---|---|---|---|
| 1 | `<a>` marca da nav | 998 | 10,77:1 |
| 2 | `<a>` CTA da nav | 989 | 10,81:1 |
| 3 | `<a>` CTA do hero | 1.161 | 10,55:1 |
| 4 | **`<input type=text>` nome** | **0** | **— sem indicador** |
| 5 | **`<input type=tel>` whatsapp** | **0** | **— sem indicador** |
| 6 | **`<input type=email>`** | **0** | **— sem indicador** |
| 7 | **`<input type=checkbox>` consentimento** | **0** | **— sem indicador** |
| 8 | `<button>` Continuar | 2.256 | 9,22:1 |
| 9 | `<summary>` da tabela de frete | 998 | 10,55:1 |
| 10 | `<a>` site da fazenda | 1.006 | 10,55:1 |
| 11 | `<a>` Privacidade | 1.151 | 10,55:1 |
| 12 | `<a>` Termos | 452 | 10,55:1 |

**8 de 12 têm anel visível, com 9,22:1 no pior caso — bom. Os 4 que faltam são
exatamente os campos do formulário.**

Confirmado por estilo computado, além do pixel: focado e não focado, os três
campos de texto devolvem a MESMA `border-color` (`rgba(185,164,111,0.38)`), o
MESMO `background` (`rgb(26,19,13)`), `box-shadow: none` e `outline-style: none`.
Nada muda.

**Causa, uma linha:** `Formulario.tsx`, função `inputStyle()` —

```js
outline: 'none', appearance: 'none', WebkitAppearance: 'none',
```

O `outline: 'none'` é aplicado como **estilo inline**, o que impede qualquer regra
`:focus-visible` de CSS externo de vencer sem `!important`. E não existe nenhuma
regra de foco no componente. A regra `.input:focus { border-color: var(--gold) }`
de `globals.css:433` não alcança esses campos, porque eles não usam a classe
`.input`.

**Gravidade.** WCAG 2.1 **2.4.7 Focus Visible, nível AA** — reprovado. Não é AAA,
não é preferência: é o critério que garante que alguém navegando por teclado saiba
onde está. Numa página cujo único KPI é o preenchimento desse formulário, o
usuário de teclado atravessa os quatro campos às cegas.

**Não é regressão do redesenho** — `Formulario.tsx` não foi tocado, e o
`outline: 'none'` é anterior. É dívida herdada que a auditoria anterior não pegou
porque mediu travessia e não visibilidade.

**Correção sugerida** (arquivo do Esquadro nesta onda, por isso não aplicada): dar
ao `inputStyle` um estado de foco — trocar a borda para `dark.gold` e somar
`boxShadow: 0 0 0 2px rgba(185,164,111,0.35)`. Sobre `rgb(26,19,13)` o champagne
mede **7,53:1**, folga de sobra para o anel.

---

## 4. Alvos de toque

Régua de 44px (WCAG 2.5.5, **AAA**), 390×844, com o `<details>` aberto:

**12 alvos. 11 passam. 1 reprova: o checkbox de consentimento, 20×20px.**

```
✗ 20×20  <input type=checkbox>  consentimento de WhatsApp
```

Todos os demais têm 44px ou mais de altura — inclusive os dois links legais do
rodapé (44px), o `<summary>` (44px) e os três CTAs (44, 44, 47px).

**Confirma a medição trazida**, com duas ressalvas de enquadramento:

1. É **AAA**, não AA. O critério AA equivalente (2.5.8, WCAG 2.2) pede 24px — e
   com o rótulo clicável ao lado, o alvo efetivo passa dos 24px.
2. É **pré-existente** e vive em `Formulario.tsx`, fora do redesenho.

Não é regressão. Continua valendo consertar: `width/height: 20` está escrito
literalmente em `Formulario.tsx:365`, e subir para 24 resolveria o critério AA da
WCAG 2.2 com margem.

---

## 5. Estrutura, console e rolagem — confirma o que foi trazido

| Verificação | 375 | 390 | 768 | 1440 |
|---|---|---|---|---|
| rolagem horizontal | não | não | não | não |
| elementos transbordando a viewport | 0 | 0 | 0 | 0 |
| erros/avisos de console | 0 | 0 | 0 | 0 |
| respostas HTTP ≥ 400 | 0 | 0 | 0 | 0 |

**Confirmado.** `tsc --noEmit` exit 0; `npm run lint` com 126 avisos, **0 deles em
`src/app/saogeraldo/`** (os 126 são pré-existentes do resto do app); `npm run build`
exit 0.

Estrutura semântica:

```
hierarquia   H1 "Leilão Touros São Geraldo e 7P Agro" (alt do letreiro)
             H2 "Receba o catálogo completo"
             H2 "Receba o catálogo e fale com um assessor"
             H2 "Condição de Pagamento"
             H2 "Condição de Frete"          → sem salto de nível
landmarks    nav · main · header · footer · svg[role=img]
imagens      3, todas com alt não vazio
lang         pt-BR
ids          nenhum duplicado · #cadastro único (1)
```

O `<h1>` é uma imagem (o letreiro em ouro escovado) com o texto no `alt` — o nome
acessível do `<h1>` é o `alt`, que é o padrão correto para letreiro que não se
recria em CSS. O SVG do mapa é `role="img"` com `aria-labelledby` apontando para
`<title>` e `<desc>`, e cada estado tem `<title>` próprio.

---

## 6. `prefers-reduced-motion`

| Verificação | resultado |
|---|---|
| animações CSS ativas na página | **nenhuma** |
| dica `↓ Role para receber` (que pulsa) | **não renderiza** — o componente a remove, não só para a animação |
| `<div>` com `transform` residual | **0** |
| contagem regressiva | **sem os segundos** — intervalo de 60s, confirmado |

Passa inteiro. O `HeroCatalogo` não se limita a parar a animação da dica: ele não
renderiza o elemento, com o argumento certo escrito no componente — "sem a
animação ela vira só uma seta parada, que não informa nada".

---

## 7. Craft — o que não é a11y mas é peso

**O HTML da rota está em 114.997 bytes.** A página anterior fechou a Onda 4 em
71.290, com teto de portão em 78.000. O teto era daquele plano e não governa este
redesenho, mas o salto merece número em vez de impressão:

```
SVG do mapa inline ....... 58.568 bytes = 51,0% do HTML da página
payload RSC .............. 13.822 bytes
resto ....................  42.607 bytes
```

**Metade do HTML é a malha do IBGE.** A escolha está argumentada em `MapaBrasil.tsx`
(49 KB de path contra ~90 KB de `d3-geo` + `topojson`, e contra um PNG que borraria
em retina), e o componente é de servidor, então não vai para o bundle de JS. O
contraponto que o comentário não faz: esses 58 KB são pagos por **todo** visitante,
inclusive no 4G do celular, para desenhar uma seção que fica abaixo da dobra — e
que já tem uma tabela equivalente em texto. Simplificar a malha (`mapshaper` a
~15% de precisão) costuma cortar 60–70% do path sem diferença visível a 330px de
largura. Não é reprova; é a maior alavanca de peso da página, com número.

Outras observações de craft, sem defeito de norma:

- **os dois CTAs dizem quase a mesma coisa** — `RECEBER CATÁLOGO` na nav e
  `RECEBER O CATÁLOGO` no hero, a 300px um do outro na primeira tela. Um dos dois
  poderia carregar o verbo da etapa seguinte.
- **os selos de certificação são a única cor saturada da página** (azul, verde e
  vermelho dos logos PMGZ/ANCP/Embrapa/GenePlus) num sistema inteiro de carvão e
  champagne. São logos de terceiros e adulterá-los seria pior; vale saber que o
  ponto mais chamativo da primeira dobra, depois do letreiro, é ele.
- **a sigla do mapa a 9–10px em 390** — ver §2.6.

---

## 8. Placar do que foi trazido para conferência

| Afirmação trazida | Veredito |
|---|---|
| eyebrow 8,19 · data 5,89 · cerimônia 13,21 no hero, em 390×844 | **CONFIRMADO** — 8,20 · 5,86 · 13,28, dentro de ±0,07 |
| sem rolagem horizontal em 375 e 390 | **CONFIRMADO**, e estendido para 768 e 1440 |
| zero erro de console | **CONFIRMADO** nos quatro viewports, mais zero resposta ≥400 |
| `tsc`, `lint` e `build` limpos | **CONFIRMADO** — exit 0, exit 0, e 0 aviso em `src/app/saogeraldo/` |
| um único alvo abaixo de 44px, o checkbox de 20px, AAA e pré-existente | **CONFIRMADO** nos três pontos |
| legenda `#816852` dá 3,08 e passa como texto grande | **DERRUBADO** — 3,08 é sobre a seção; sobre o card onde o texto vive são **2,89**, e reprova |

---

## 9. O que consertar, por dono

Nenhuma correção foi aplicada. Auditoria mede; o conserto é de quem tem o arquivo,
e os três donos estão ativos nesta onda.

| # | Defeito | Norma | Onde | Dono |
|---|---|---|---|---|
| 1 | 4 controles do formulário sem indicador de foco | **AA 2.4.7** | `Formulario.tsx`, `inputStyle()` — `outline:'none'` inline, sem estado de foco | Esquadro |
| 2 | legenda `#816852` a 2,89:1 sobre o card | **AA 1.4.3** | `_lib/frete.ts`, `FAIXAS.gratis2lotes.cor` | Aferidor |
| 3 | data da nav a 3,33:1 sobre a foto (≥768) | **AA 1.4.3** | `NavCatalogo.tsx` (a cor sai de `dark.muted`) | — |
| 4 | checkbox de 20px | AAA 2.5.5 / AA 2.5.8 da 2.2 | `Formulario.tsx:365` | Esquadro |
| 5 | sigla AC sobre a divisa (1,32:1 no pior pixel) | 1.4.3, mediana passa | âncora do rótulo em `mapa-brasil-paths.ts` | Aferidor |
| 6 | nota do asterisco e cabeçalhos da tabela a 4,57:1 | passa, sem margem | `Frete.tsx` — trocar `dark.muted` por `dark.body` dentro do card | — |
| 7 | 51% do HTML é a malha do mapa | craft | `mapa-brasil-paths.ts` | Aferidor |

Os itens 1 e 2 são os únicos que reprovam norma AA com o usuário na frente da
tela. Se só dois forem consertados antes do ar, são esses dois.

---

## 10. O que esta auditoria NÃO mediu

Para ninguém ler ausência como aprovação:

- **leitor de tela real** (VoiceOver/NVDA). Foi medida a estrutura que eles
  consomem — nomes acessíveis, `aria-labelledby` do SVG, ordem de títulos,
  `role="alert"` dos erros de validação —, não a experiência de escuta.
- **o fluxo de envio do formulário até `/obrigado`**. A auditoria anterior cobriu
  esse caminho e `Formulario.tsx` não mudou desde então; o `outline` é a única
  novidade aqui, e é de foco, não de fluxo.
- **zoom de 200% e reflow** (WCAG 1.4.10) e **espaçamento de texto** (1.4.12).
- **contraste dos componentes não-textuais** (1.4.11): a borda do card, a hairline
  champagne e a cápsula do frete não foram medidas contra o fundo.
- **desempenho real de rede** — o peso do HTML foi medido no arquivo, não num
  perfil 3G/4G, e o LCP não foi cronometrado.
- **estado de erro do formulário**: os campos em `aria-invalid` têm borda vermelha
  `ERR`, que não foi medida contra o fundo do card.
