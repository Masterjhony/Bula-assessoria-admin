---
projeto: web-bula — Landing do Leilão Touros São Geraldo e 7P
branch: feat/leilao-sao-geraldo
rota: /saogeraldo  →  saogeraldo.bulaassessoria.com
escrito_em: 28/07/2026
natureza: REDESIGN de superfície e ornamento. Não é rewrite, não é refactor de lógica.
depende_de: BRIEF.md (decisões travadas), ESPACAMENTO.md (escala de ritmo)
não_altera: PLAN.md, BRIEF.md, PLANO-COWORK.md, ESPACAMENTO.md
---

# Plano de redesign — `/saogeraldo`

## 0. Sumário executivo (a posição, em uma tela)

A página está **bem construída e mal vestida**. O craft acumulado é real: contraste
medido par a par, orçamento de dobra fechado no celular, hidratação resolvida na
contagem, `#cadastro` único, navegação hard preservada, escala de espaçamento
documentada. Nada disso se toca.

O que falta é **registro**. A página fala com sotaque de landing de produto —
condensada, retangular, eficiente — e o catálogo fala com sotaque de leilão de
elite: serifa de contraste alto, fio duplo, small caps, data como monumento,
abertura sangrada. A distância entre os dois não é de cor (as paletas são primas)
nem de estrutura (a estrutura está certa). É de **ornamento e de voz tipográfica**.

Três movimentos resolvem, nesta ordem de retorno:

| # | Movimento | Por que é o que move |
|---|---|---|
| 1 | **Substância**: seção nova `Pista` com a ficha técnica AGREGADA dos 134 lotes | Ataca o "básico e direto" por onde não tem como imitar: dado real. Custo ~0,5 KB no bundle |
| 2 | **Voz**: uma serifa, em três lugares fechados — a data, a abertura sangrada, o crédito de origem | É a maior distância visual entre a página e o catálogo. Custo ~30 KB de fonte, só nesta rota |
| 3 | **Ornamento**: fio duplo, small caps e divisor sangrado como primitivos | Tira o registro "tile empilhado" sem tocar em uma linha de lógica |

**A tensão da marca está resolvida assim:** a base de tokens da Bula **fica**. O que
se importa do catálogo é o **repertório compositivo**, não a paleta. E a serifa
entra com um papel que resolve a tensão em vez de contorná-la — ver §3.2.

---

## 1. Diagnóstico do estado atual

### 1.1 O que fica INTOCADO, e por quê

| Arquivo | Por que não se toca |
|---|---|
| `_components/Formulario.tsx` (577 linhas) | É o KPI inteiro. Navegação hard, validação por passo, `aria-invalid`, 16px de input contra o zoom do iOS, MQL decidido no servidor. Consome `typo.monoLabel`, `typo.displayLg` e `typo.body` — por isso a §6.1 proíbe mutar `typo.*` |
| `_components/StickyCta.tsx` | `IntersectionObserver` em `#cadastro`, limiar de urgência em 3 dias, `tabIndex` alternado. Funciona e é tracking-adjacente |
| `_lib/analytics.ts` | Não empurra nada ao `dataLayer` **de propósito** (o container tem acionador catch-all). Tocar aqui é duplicar PageView |
| `_components/GoogleTagManager.tsx`, `_lib/utm.ts`, `_components/Obrigado.tsx` | Caminho de conversão |
| `_lib/evento.ts` | Fonte única do factual. Ganha zero campo novo neste plano |
| `src/app/touros/**`, `src/lib/**`, `src/app/api/**`, `src/app/layout.tsx` | Produção. Fora do raio de explosão |

### 1.2 O que está certo e só precisa vestir

- **Estrutura de seções**: Hero (com form na 1ª dobra) → oferta → serviço → prova → fecho. É a ordem certa para um KPI único. O redesign **insere uma seção**, não reordena as existentes.
- **Escala `space`**: já é em `clamp()` em px porque o root da app é **14px** e todo utilitário do Tailwind chega 12,5% menor que o nominal. Essa armadilha já foi paga. Todo espaçamento novo sai daqui.
- **Paleta**: `#0D0D0D` / `#C8A96E` / greige `#9A9488`, todos com contraste medido e aprovados em AA.
- **Foto como território, não como fundo**: a decisão de tirar a foto de trás do texto (Hero, comentário longo nas linhas 16–55) é a decisão mais madura do arquivo. O divisor sangrado da §4 segue exatamente essa regra: **nenhum texto de corpo assenta sobre foto**.

### 1.3 As seis lacunas — confirmadas, e uma corrigida

O diagnóstico trazido está correto em 5 de 6 pontos. Onde discordo, discordo com argumento.

| # | Lacuna | Veredito | Onde é resolvida |
|---|---|---|---|
| 1 | Ausência de serifa | **Confirmado.** Oswald em display + Inter em corpo + Plex Mono em rótulo achata identidade e operação no mesmo registro condensado | §3.2 · Onda 1 (T2) e Onda 3 (T5) |
| 2 | Sem ornamento de cerimônia | **Confirmado.** Existem hairlines de 1px, mas nenhum fio duplo, nenhum divisor ritual | §3.3 · Onda 2 (T4) |
| 3 | Data não é protagonista | **Confirmado, e é o pior.** `01 de agosto, sábado, às 12h` é um `<p>` de 15px em `Contagem.tsx:108` — a informação mais valiosa da página no menor corpo da coluna | §5 · Onda 3 (T5) |
| 4 | Sem divisor full-bleed | **Confirmado.** A única quebra de ritmo é a troca de superfície escuro→claro no `SubHero` | §4 · Onda 2 (T4) |
| 5 | `ProvaSocial` prova a Bula, não o leilão | **Confirmado como fato, REJEITADO como problema.** Ver §3.5 | §3.5 |
| 6 | Zero substância sobre o rebanho | **Confirmado, e é a maior oportunidade.** A página diz "são 134 lotes" e para aí | §2 e §4 · Onda 2 (T4) |

**Achado novo (não estava no diagnóstico):** `Fecho.tsx:3` importa `ArrowUp` do
`lucide-react` e o renderiza dentro do CTA dourado. Isso é **ícone linear flat** —
violação direta e literal da proibição do sistema de design ("nunca ícone flat ou
linear"). Sai na Onda 3 (T7). Honestidade sobre o ganho: **não é ganho de bundle**,
porque `Formulario.tsx` (fora de escopo) importa cinco ícones do mesmo pacote e
segura a dependência na rota. É conformidade de sistema, não performance.

### 1.4 Linha de base MEDIDA (28/07, na branch atual)

Tudo abaixo foi rodado, não estimado. São os números contra os quais o redesign
é julgado.

```
npm run build ............................. exit 0
npx tsc --noEmit .......................... exit 0
wc -c .next/server/app/saogeraldo.html .... 68.467 bytes
wc -c .next/server/app/touros.html ........ 62.891 bytes   (referência)
id="cadastro" no repo ..................... 1  (Hero.tsx:248)
href="#cadastro" .......................... 3  (Oferta, Fecho, StickyCta)
dataLayer.push na landing ................. 0
router.push / useRouter na landing ........ 0
topo de #cadastro @390×844 ................ 589px  (medido 28/07 por medir-dobra-saogeraldo.mjs;
                                                   Hero.tsx:48 ainda diz 590 — comentário a corrigir)
topo de #cadastro @375×667 ................ 582px  (bate com Hero.tsx:48)
topo de #cadastro @768×1024 ............... 635px
topo de #cadastro @1440×900 ............... 190px
```

**E os mesmos números no FIM (28/07, fechada a Onda 4).** É contra esta coluna
que o redesign se julga:

```
npm run build ............................. exit 0
npx tsc --noEmit .......................... exit 0
wc -c .next/server/app/saogeraldo.html .... 71.290 bytes   (+2.823 · teto 78.000 · sobram 6.710)
id="cadastro" no repo ..................... 1  (Hero.tsx:269)
dataLayer.push na landing ................. 0
router.push / useRouter na landing ........ 0
topo de #cadastro @390×844 ................ 579px  (−10 · portão 596 · sobram 17)
topo de #cadastro @375×667 ................ 571px  (−11)
topo de #cadastro @768×1024 ............... 651px  (+16 · sem portão · ver §5.1)
topo de #cadastro @1440×900 ............... 190px  (=)
```

Uma seção nova inteira entrou, a data virou monumento, seis seções ganharam
ornamento — e a página terminou **2,8 KB mais pesada e 10px mais curta na
dobra**. O porquê do peso não ter explodido está medido em §7.2, e não é o que
a equipe supunha.

---

## 2. O rebanho em pista — os números, medidos

Rodados sobre `.planning/leilao-sao-geraldo/lotes.json` (753 KB, 134 lotes, 160
animais). Nenhum número aqui é estimativa; todos saem do parser do catálogo
oficial. Comandos reproduzíveis em §7.1.

### 2.1 O que a agregação devolveu

| Grandeza | Cobertura | Valor |
|---|---|---|
| Lotes / animais | — | **134 lotes**, **160 animais** (130 lotes de 1 animal, 2 de 5, 2 de 10) |
| Tipo de lote | — | 129 individuais, 4 megalotes, 1 aspiração |
| Sexo | 159 de 160 | **159 MACHO**, 1 sem sexo no PDF (lote 3000, aspiração) |
| Idade | 158 de 160 | **156 entre 20 e 24 meses**; mediana **23**; 2 fora da faixa (43 e 48 meses) |
| Peso | 157 de 160 | mediana **780 kg**; faixa **560–1.045 kg**; 132 com ≥700 kg |
| CE | 158 de 160 | mediana **37 cm**; faixa **30–43,5 cm**; **140 com ≥34 cm**; 109 com ≥36 cm |
| IQG (TOP%) | 158 de 160 | **148 no TOP 5%**; 84 no TOP 1%; 155 no TOP 10% |
| iABCZ (DECA) | 159 de 160 | **158 na DECA 1**; 1 na DECA 2 |
| MGTe (TOP%) | 158 de 160 | 123 no TOP 5%; 59 no TOP 1% |
| Selos de touro de central | — | **55 dos 134 lotes** (56 animais). Por parente: 18 MÃE, 26 AVÓ MATERNA, 30 AVÓ PATERNA |
| Pais distintos | 160 animais | **25 reprodutores diferentes** |

**Por que IQG e MGTe cobrem 158 e não 160.** Os lotes **32** (`N298 DA 7P`) e **92**
(`N262 DA 7P`) trazem `***` na tabela **DEP/TOP% inteira** do PDF — conferível em
`catalogo-raw.txt`, no bloco do lote 32. O catálogo simplesmente não publica os
índices desses dois, então eles não entram no denominador. **Não é falha do
parser**, e por isso não há o que recuperar reprocessando o PDF. O iABCZ é um
bloco separado e sobrevive nos dois: só o lote `M3` fica de fora dele, daí 159.

### 2.2 O que VAI para a página — quatro monumentos e uma linha de apoio

Escolhidos por três critérios: legível para comprador de touro sem legenda,
verificável no catálogo, e forte o bastante para justificar o espaço.

```
TOP 5%    IQG — 148 DOS 158 AVALIADOS NO TOP 5% DA AVALIAÇÃO
20–24     MESES — A IDADE DE 156 DOS 158 COM IDADE NO CATÁLOGO
37 cm     CE MEDIANA — 140 DOS 158 COM 34 CM OU MAIS
55        LOTES COM MÃE OU AVÓ DE TOURO DE CENTRAL

apoio: 780 kg de peso mediano (560 a 1.045) · DECA 1 do iABCZ em 158 dos 159
       avaliados · 25 reprodutores diferentes na paternidade · 134 lotes, 160 animais.
```

**A disciplina que torna isso seguro sem validação do cliente:** todo monumento
**declara o próprio denominador**. "148 dos 158", "156 dos 158", "140 dos 158".
O BRIEF §7 proíbe claim numérico novo — e um agregado com denominador explícito
não é claim novo, é **contagem do que o catálogo diz**, com a lacuna do parser
visível na própria frase. Uma falha de parsing pode reduzir o denominador; nunca
pode inflar o numerador.

### 2.3 O que eu CORTO, e por quê

| Número | Por que fica de fora |
|---|---|
| "160 touros" | 1 animal (lote 3000, aspiração) não teve sexo extraído. Vira **"160 animais"**. Um adjetivo a menos, zero risco |
| MGTe TOP 5% (123 de 158) | Terceiro índice, mais fraco que o IQG e exige mais legenda. Substância não é acumular sigla |
| Máximo de peso isolado ("1.045 kg") | Um máximo isolado convida "me mostra esse" — pergunta de lote, que a página deliberadamente não responde. Entra só dentro da faixa |
| 38 dos 160 filhos de CASANOVA BONSUCESSO | Fato verdadeiro e comercialmente útil, mas ambíguo em vitrine: lê como concentração para uns e como pedigree forte para outros. É munição do assessor, não da página |
| `percentualAVenda: 50` em 2 lotes | É ressalva contratual (compra de fração), não argumento. Material para o assessor |
| Lotes ausentes na numeração (13, 24, 128) | Nota interna do parser. Nunca aparece |
| 33 avós maternos distintos | Sem significado de compra |

### 2.4 Como o número chega na página sem o JSON chegar junto

**Regra travada** (já está escrita em `copy.ts:99-102` e continua valendo): **nada
importa `lotes.json` em runtime.** Um `import` daquele arquivo arrasta 753 KB para
o bundle de uma landing de tráfego pago.

Mecanismo: um script Node lê o JSON e **escreve um módulo TS congelado**,
versionado no git.

```
scripts/agrega-ficha-saogeraldo.mjs   →   src/app/saogeraldo/_lib/ficha.ts   (767 bytes)
```

Mesmo padrão de `scripts/parse-catalogo-saogeraldo.mjs`, que já existe no repo.
O script tem modo `--check`, que recomputa e sai com código ≠0 se o arquivo
commitado divergir — vira portão de CI e impede que o número da tela e o número
do catálogo se separem em silêncio. O módulo carrega o hash curto de `lotes.json`
para provar de qual dado ele saiu. Sem `geradoEm`, para o `--check` ser determinístico.

---

## 3. Decisão de linguagem visual — resolvida

### 3.1 O que se importa e o que se rejeita

| Elemento do catálogo | Decisão | Argumento |
|---|---|---|
| Carvão `#2B1F13` como canvas | **REJEITADO** | As paletas são primas, mas trocar o canvas obriga a revalidar **todo par de contraste da página**. Medido: display em `#2B1F13` dá 14,72:1 contra 17,83:1 no `#0D0D0D`; o corpo greige cai de 6,45:1 para 5,32:1. Paga-se uma revalidação inteira por uma diferença que ninguém enxerga sem conta-gotas. **O que muda o registro é ornamento e tipografia, não 18 pontos de luminância** |
| Champagne `#B9A46F` | **REJEITADO** (mantém `#C8A96E`) | 7,96:1 contra 8,66:1. Mesma família, mesma leitura. Trocar é churn |
| Off-white `#FFFFFC` | **REJEITADO** (mantém `#F5F3EF`) | O parchment atual é mais quente e já tem os pares do tile claro verificados. O off-white do catálogo é simulação de papel para impressão |
| **Verde-musgo `#39553E`** | **IMPORTADO, com restrição dura** | Ver §3.4 |
| Azul-ardósia `#839BA2` | **REJEITADO** | `tokens.ts:6` declara "dourado = voltagem ÚNICA e escassa". Um terceiro accent destrói a regra que faz o dourado funcionar. E o bloco "transacional" do catálogo aqui é a `Oferta`, que já é dourada |
| **Serifa display de contraste alto** | **IMPORTADA, em papel fechado** | §3.2 |
| **Fio duplo, small caps, divisor sangrado** | **IMPORTADOS** | §3.3. É o repertório que tira a página do registro SaaS |
| Vinheta na foto | **IMPORTADA** | Já é vocabulário da casa: `Hero.tsx:74` faz exatamente isso com `SOMBRA_LOGO` |
| LUT quente por filtro CSS | **REJEITADO** | As fotos de `public/touros/ensaio/` já são de fim de tarde e já têm a dominante quente. Um `filter:` sobre `<Image fill>` em full-bleed força camada de composição no celular por um efeito que a foto já tem |
| Sistema anti-ícone | **IMPORTADO E APLICADO** | Sai o `ArrowUp` do `Fecho` (§1.3) |

### 3.2 A serifa — SIM, e este é o papel dela

**Decisão: entra UMA família serifada — Playfair Display — em três lugares
fechados. E ela NÃO herda o papel que tem no catálogo.**

O raciocínio que fecha a questão, e que é o mesmo que resolve a tensão da marca:

O sistema do catálogo diz *"serifa para o que é sobre identidade e status; sans
para o que é sobre operação"*. Importar essa regra **como está** quebraria a marca
da Bula: no sistema da Bula quem carrega identidade é o **Oswald** — está escrito
no brandbook e no root layout (*"Oswald — voz condensada da marca"*). Dar a
identidade à serifa demitiria o Oswald para lugar nenhum, porque o corpo já é do
Inter e o rótulo técnico já é do Plex Mono.

Então a regra se importa **girada**:

> **A serifa é a voz do EVENTO. O Oswald é a voz da BULA.**

A serifa diz o que pertence ao leilão como acontecimento — a data, a abertura do
rebanho, o crédito dos criatórios vendedores. O Oswald continua dizendo tudo que
pertence à assessoria — títulos de seção, CTAs, rótulos, números de ficha. Duas
vozes, dois donos, uma página. **É por isso que a marca continua sendo a Bula
mesmo com a página vestida de catálogo:** o criatório ganhou uma voz própria e
delimitada, em vez de tomar a página.

E isso resolve, de quebra, uma incoerência que estava para nascer: os **números da
ficha técnica ficam em Oswald**, não em serifa. Dado tabular é operação — é
exatamente o que o sistema do catálogo reserva à sans condensada. A serifa não
toca em número nenhum.

**Os quatro lugares. Lista fechada, verificável por `grep`:**

1. `Contagem.tsx` — a data-monumento (`01 AGOSTO`) e a linha `SÁBADO · 12H`
2. `Pista.tsx` — o título da abertura sangrada e o eyebrow dela
3. `Hero.tsx` — o crédito de origem no pé da seção (`LOTES DE FAZENDA SÃO GERALDO · 7P AGRO`)
4. `Footer.tsx` — o crédito dos criatórios no rodapé

> **Corrigido na Onda 4: eram "três lugares".** A lista original desta seção
> contradizia a própria §4.2, que manda o `Footer` levar o crédito dos
> criatórios em `<Cerimonia>` (T8). São dois créditos de vendedor, um no pé do
> Hero e outro no rodapé, e os dois são fala do EVENTO. O executado seguiu a
> §4.2; quem manda agora é esta lista de quatro.
>
> O `grep` do portão 9 lista um quinto arquivo, `ui.tsx`, e isso é por
> construção: é onde o primitivo `<Cerimonia>` mora (§6.2), não um consumidor.

Em nenhum outro lugar. Os eyebrows de `Oferta`, `SubHero`, `ProvaSocial` e `Fecho`
continuam em Oswald, porque ali quem fala é a Bula — e o eyebrow do próprio
`Hero` também: ele **já é** a small caps faux que esta seção define (Oswald em
caixa alta a 0.22em), então "o eyebrow ganha small caps" da §4.2 não pedia serifa
nenhuma. Dar a serifa a ele seria um quinto uso e entregaria a voz do evento a
uma linha que é da Bula.

**Como carrega:** `next/font/google`, `Playfair_Display`, **`weight: ['400']` só**,
`subsets: ['latin']`, `display: 'swap'`, `variable: '--font-serif'`, aplicado em
`src/app/saogeraldo/layout.tsx`. Nunca no root layout.

**Custo declarado, sem maquiagem:**

| Custo | Tamanho | Mitigação |
|---|---|---|
| Arquivo woff2 | **~30 KB**, uma instância estática, só na rota `/saogeraldo` | Peso único cravado. Playfair variável custaria ~2× e não existe hierarquia por peso neste uso — display de alto contraste não se emboldena, se aumenta |
| Requisição no caminho crítico | 1 preload; a data-monumento está **dentro da dobra** | `next/font` auto-hospeda: zero DNS/TLS para `fonts.gstatic.com` |
| CLS por FOUT | Real, e na dobra | `adjustFontFallback` (ligado por padrão no `next/font`) calibra as métricas do fallback Georgia. Portão de verificação em §7.2 |
| Risco de mistura | Alto se não houver regra | A lista fechada acima + o `grep` do portão 9 |
| Dependência de rede no build | `next/font` busca do Google no `next build` | Contingência declarada: se o build bloquear a busca, cai para `<link rel="stylesheet" precedence="default">` dentro de `saogeraldo/layout.tsx` — nunca no root |

**O que eu NÃO faço:** Abril Display (não é livre e não está no Google Fonts),
duas serifas, serifa em corpo, serifa em número, `font-feature-settings: 'smcp'`
(a versão do Google não garante o recurso no subset — as small caps são **faux**:
`uppercase` + corpo menor + `letter-spacing: 0.18em`, que é o que o `Eyebrow`
atual já faz com Oswald a 0.22em).

### 3.3 Ornamento — o vocabulário novo

**Fio duplo.** Duas hairlines de 1px com 3px de intervalo (o "~2pt" do sistema
resolve em 2,67px a 96dpi; 3px é o inteiro mais próximo e não borra). Altura
total 5px.

**A regra que decide onde ele entra** — sem ela cada agente inventa a sua:

> **Fio duplo marca fronteira de CERIMÔNIA. Hairline de 1px continua marcando
> fronteira de LISTA.**

Oito usos na página inteira, e nenhum a mais:

| Onde | Quantos | Papel |
|---|---|---|
| `Contagem.tsx` | 2 | Emoldura a data-monumento (substitui o `borderTop` de 1px atual) |
| `Pista.tsx` | 2 | Fecha a faixa sangrada e abre a ficha |
| `Hero.tsx` | 1 | Abre o crédito de origem no pé da seção (§4.2) |
| `Oferta.tsx` | 1 | Abre a grade de condições (§4.2 e §8, T6) |
| `Fecho.tsx` | 1 | Topo da seção (substitui o `borderTop` de 1px do `<Section>`) |
| `Footer.tsx` | 1 | Topo do rodapé (substitui o `borderTop` de 1px) |

> **Corrigido na Onda 4: eram "seis usos, em quatro arquivos".** Esta tabela
> contradizia a §4.2 e a §8, que mandam explicitamente o fio duplo abrir o
> crédito do `Hero` (T5) e a grade da `Oferta` (T6) — e o parágrafo abaixo
> chegava a dizer que a `Oferta` não receberia nenhum. O executado seguiu a
> §4.2/§8. `SubHero` e `ProvaSocial` continuam sem nenhum, como estava escrito.
>
> No código-fonte o `grep` conta **10** ocorrências, não 8: a `Contagem` declara
> 4, porque o ramo de evento encerrado tem os seus 2 e nunca coexiste com o ramo
> vivo. Oito é o número renderizado.

A grade da `Oferta` mantém o `gap-px` entre as células — aquilo é tabela, é
operação, é hairline simples por definição. O fio duplo dela abre a grade, não
divide as células. `SubHero` e `ProvaSocial` não recebem nenhum.

**Small caps de cerimônia.** `typo.cerimonia`: serifa, caixa alta, `0.18em` de
tracking, `clamp(11px, 1.3vw, 13px)`. Usado só nos quatro lugares da §3.2.

Uma regra de escrita que saiu da execução: **linha de cerimônia não termina em
ponto final.** Em caixa alta com 0.18em de tracking o ponto fica órfão — o
próprio tracking o separa da última palavra e ele lê como sujeira, não como
pontuação. Vale para o crédito do Hero, o do rodapé e a linha `SÁBADO · 12H`.

**Divisor sangrado.** Faixa full-bleed de foto, proporção ~2,6:1, abrindo a seção
`Pista`. Segue a regra de ouro do Hero: **nenhum texto de corpo sobre a foto** —
só o título de abertura em serifa, sobre vinheta, com o corpo caindo no `#0D0D0D`
sólido logo abaixo do fio duplo de fechamento.

Foto: **`/touros/ensaio/lote-de-cima.webp`** (218 KB de origem, a mais leve das
quatro, e o enquadramento elevado lê como faixa de rebanho no corte deitado).
Não repete a do Hero (`apartacao-peao.webp`). Abaixo da dobra: `priority={false}`,
`loading="lazy"`, `sizes="100vw"`. É foto de **ambiência**, não de lote — o BRIEF
proíbe placeholder de lote, não proíbe fotografia da fazenda.

### 3.4 Verde-musgo — entra como fio, nunca como painel

Medido, e o número decide:

```
corpo greige #9A9488 sobre #39553E ......... 2,74:1   REPROVA AA
dourado     #C8A96E sobre #39553E .......... 3,68:1   só AA-large
branco      #F5F5F5 sobre #39553E .......... 7,57:1   AA
```

Um painel sólido de verde-musgo com corpo em cima **reprova AA** — e AA é
requisito do BRIEF §7. Então:

- **Permitido:** fio de 1px em `#39553E`, e wash de **≤12%** de `#39553E` sobre
  `#0D0D0D` como fundo do bloco de ficha. A 10% o fundo efetivo é `#111412` e o
  corpo greige mantém **6,15:1** (contra 6,45:1 no preto puro). Continua AA, e o
  bloco ganha a temperatura que sinaliza "aqui é dado técnico".
- **Proibido:** `#39553E` como `background` de qualquer coisa que carregue texto.

Isso entrega o sinal do sistema de design sem quebrar a restrição que o cliente
não negocia.

### 3.5 `ProvaSocial` — o diagnóstico está certo, a conclusão não

É verdade que a faixa mostra criatórios clientes da Bula e não realização do
leilão. **E é assim que tem que ser.**

O BRIEF §1 trava: *"a marca da página é BULA ASSESSORIA; São Geraldo e 7P são os
vendedores"*. O KPI não é "venha ao leilão", é "**receba a seleção da Bula antes
do leilão**". A prova que sustenta esse pedido é prova da **Bula**. Trocar por
logos de criatório vendedor provaria a coisa errada.

E o bloco "Realização / Leiloeiras & Transmissão / Patrocínio" do HTML de
referência **não é construível aqui**: duas das três colunas estão **fora de
escopo por decisão do cliente** (local, canal de transmissão e leiloeira
responsável — BRIEF §4), e a terceira não tem asset nenhum no repositório. Um
bloco de créditos com uma coluna preenchida é pior do que nenhum.

**O que se faz em vez disso:** os vendedores já têm crédito na página, em
`Hero.tsx:269-274`, como um `<p>` de 12px em Plex Mono. Esse crédito é **promovido
a linha de cerimônia** — serifa small caps, sobre fio duplo. Os criatórios ganham
a dignidade que o catálogo dá a eles, dentro do único espaço que o BRIEF autoriza,
sem disputar a marca. É o terceiro dos três usos da serifa.

---

## 4. Nova arquitetura de seções

```
                            ANTES                          DEPOIS
  ┌──────────────────────────────────────┬──────────────────────────────────────┐
  │ Hero          dark   foto+copy+form  │ Hero          dark   + data-monumento │
  │                                      │                      + créd. cerimônia│
  │                                      │ ▸ Pista       dark   NOVA — abertura  │
  │                                      │                      sangrada + ficha │
  │ Oferta        dark   4 condições     │ Oferta        dark   + fio, + ritmo   │
  │ SubHero       light  4 passos Bula   │ SubHero       light  + eyebrow        │
  │ ProvaSocial   dark   marquee logos   │ ProvaSocial   dark   (quase intocada) │
  │ Fecho         dark   lista + CTA     │ Fecho         dark   + fio, − ícone   │
  │ Footer        dark                   │ Footer        dark   + fio            │
  │ StickyCta                            │ StickyCta            INTOCADA         │
  └──────────────────────────────────────┴──────────────────────────────────────┘
```

### 4.1 Por que `Pista` entra em segundo, e não em quarto

A narrativa passa a ser a de um catálogo: **o que está sendo vendido → em que
condição você compra → quem te ajuda → quem responde pela Bula → aja agora.**
Hoje a página pula direto de "tem hora marcada" para "30x sem juros", que é a
sequência de uma oferta, não de um leilão.

Contra-argumento honesto: uma seção de dado logo depois da dobra pode custar
profundidade de rolagem em tráfego pago. Mitigação embutida: **a `Pista` é uma
faixa, não uma tabela** — abertura sangrada + quatro números + uma linha de apoio.
Escaneia em três segundos. E ela fecha com âncora de volta ao `#cadastro`.

### 4.2 O papel de cada seção depois do redesign

| Seção | Papel | O que muda | Dono (§8) |
|---|---|---|---|
| **Hero** | Promessa + urgência + captura | Eyebrow ganha small caps; crédito de origem vira linha de cerimônia com fio duplo; ajuste do livro-caixa da dobra | T5 |
| **Contagem** | **A data como monumento** | Reescrita de superfície: fio duplo, `01 AGOSTO` em serifa, `SÁBADO · 12H` em small caps, depois os dígitos. Some o `<p>` de data e o label "O leilão começa em" — a data virou o próprio título. Lógica de hidratação e `setInterval` **intocadas** | T5 |
| **Pista** *(nova)* | Substância: o que está em pista | Componente novo. Abertura sangrada + 4 monumentos + linha de apoio + âncora quieta | T4 |
| **Oferta** | Em que condição você compra | Fio duplo abrindo a grade; `catalogo.nota` encurtada (o argumento "a Bula lê o catálogo por você" agora é da `Pista` — nenhum argumento aparece duas vezes) | T6 |
| **SubHero** | Como a Bula entra | Ganha o eyebrow que hoje não tem (Oswald, tile claro). Nada mais | T8 |
| **ProvaSocial** | Quem confia na Bula | Praticamente intocada. Só o eyebrow alinhado ao novo ritmo | T8 |
| **Fecho** | Último convite | Fio duplo no topo; **sai o `ArrowUp`**; CTA vira caps + rótulo, sem ícone | T7 |
| **Footer** | Créditos e legal | Fio duplo no topo; crédito dos criatórios em small caps | T8 |
| **StickyCta** | Intenção fora da dobra | **Nada.** Nem uma linha | — |

### 4.3 A nav fixa do HTML de referência — REJEITADA

O exemplo tem nav fixa. Não entra. Três razões, em ordem de peso:

1. A página tem **uma âncora** (`#cadastro`) e **um CTA**. Uma nav com um item é
   moldura sem quadro.
2. Custa dobra permanente no celular, e a dobra do celular está com **orçamento
   fechado** (§5). É o recurso mais caro da página.
3. A intenção fora da dobra já é coberta pela `StickyCta`, que ainda **some
   quando `#cadastro` volta à tela** — comportamento que uma nav fixa não tem.

O HTML de referência é vocabulário, não execução. Isto é exatamente o "muito
básico e direto" que o cliente sinalizou.

---

## 5. O livro-caixa da dobra (o portão que pode matar o redesign)

Medido em 28/07 por `scripts/medir-dobra-saogeraldo.mjs`: topo de `#cadastro` a
**589px** em 390×844 (o comentário em `Hero.tsx:48` diz 590 — 1px de diferença,
o número bom é o medido). A data-monumento
está **dentro** da dobra. Se ela empurrar o formulário, o redesign custou o KPI.

**Regra herdada da `ESPACAMENTO.md` §5.2, e ela continua valendo: dentro do Hero
no celular, todo `+X` exige um `−X`.**

### 5.1 Conta da `Contagem` reescrita (390px de viewport, tudo no piso do `clamp`)

| Movimento | Δ px |
|---|---|
| **SAI** `<p>` de data (`Contagem.tsx:108`) — 15px × 1,65 + `space.md` (20) | **−44,8** |
| **SAI** label "O leilão começa em" (`Contagem.tsx:79`) — 11px × 1,3 + `space.sm` (12) | **−26,3** |
| **ENTRA** fio duplo superior (5px, sobre a hairline de 1px que já existia) | +4 |
| **ENTRA** data-monumento serifa `clamp(26px, 7vw, 44px)` × 1,05 + `space.sm` acima | +39,3 |
| **ENTRA** `SÁBADO · 12H` small caps 11px × 1,4 + `space.xs` (8) | +23,4 |
| **ENTRA** fio duplo inferior (5px) + `space.sm` (12) | +17 |
| **AJUSTE** assento da contagem no `Hero.tsx:239`: `clamp(30px,5.4vw,64px)` → `clamp(20px,5.4vw,64px)` | **−10** |
| **NET no celular** | **+2,6px** |

Previsão: topo de `#cadastro` vai de **589px** (medido) para **~592px**. Portão em
§7.2: **≤ 596px**, que é o valor que a própria página já teve e foi aceito — sobram
**7px** de orçamento hoje, e o movimento gasta 2,6.

#### O que aconteceu de verdade (medido no fim da Onda 3)

A conta errou de sinal. O movimento não gastou 2,6px: ele **devolveu 10**.

| viewport | antes | depois | Δ |
|---|---|---|---|
| **390×844** (portão) | 589px | **579px** | **−10** |
| 375×667 | 582px | 571px | −11 |
| 768×1024 | 635px | 651px | +16 |
| 1440×900 | 190px | 190px | 0 |

**A causa, e ela é uma lição de método:** o rótulo "O leilão começa em" que saiu
era um `<span>` **inline**. Como inline, a caixa dele não era a entrelinha do
próprio preset (11px × 1,3 = 14,3px, que é o que a tabela acima assumiu) — era o
**strut da linha do bloco pai**, herdado a 1,65. Ele custava ~25px, não 14,3.
O `Hero.tsx:171` já avisava exatamente disso sobre o eyebrow (*"como item de flex
o eyebrow já era bloco; dentro deste div ele voltaria a ser inline e a linha
herdaria o strut do pai (1.65), gastando ~6px de dobra sem desenhar nada"*) — o
livro-caixa não aplicou o próprio aviso ao elemento vizinho.

**Regra para a próxima conta de dobra:** altura de texto só é `fontSize × lineHeight`
quando o elemento é **bloco**. Para inline, some o strut do pai ou meça no
navegador. Estimar inline é estimar errado.

O 768 subiu 16px porque naquela largura o monumento está no teto do `clamp`
(44px) enquanto o `h1` ainda está em `5.6vw` — ver a ressalva no fim desta seção.
Não há portão em 768 e o formulário continua na primeira tela.

**Os dois ajustes que pagam a conta são argumentados, não arbitrários:**

- O corpo do monumento cai para **26px no mínimo** (contra os 34px que a régua
  desktop pediria) porque no celular ele não pode ser maior que o `h1` (30px):
  a promessa vem antes da cerimônia na ordem de leitura de um anúncio pago.

  **RESSALVA MEDIDA na Onda 4, e ela é uma lacuna aberta.** A regra vale no
  celular e no desktop, mas **quebra na faixa de 629px a 786px**. O monumento é
  `clamp(26px, 7vw, 44px)` e o `h1` é `clamp(30px, 5.6vw, 52px)`: o monumento
  atinge o teto de 44px já em 629px de viewport, e o `h1` só chega lá em 786px.
  No meio dessa janela a cerimônia passa a promessa:

  | viewport | `h1` | monumento | |
  |---|---|---|---|
  | 390 | 30,0 | 27,3 | ok |
  | 629 | 35,2 | 44,0 | **monumento +25%** |
  | 700 | 39,2 | 44,0 | monumento +12% |
  | 768 | 43,0 | 44,0 | monumento +2% |
  | 786+ | ≥44,0 | 44,0 | ok |

  Na inspeção visual a hierarquia ainda se sustenta por PESO (Oswald 600
  condensado contra Playfair 400), mas por corpo ela inverte, e a regra escrita
  acima é sobre corpo. **Correção de uma linha, em `typo.dataMonumento`:
  `clamp(26px, 7vw, 44px)` → `clamp(26px, 5.2vw, 44px)`.** Isso preserva os dois
  extremos que o plano especificou (26px no piso do celular, 44px no teto do
  desktop) e mantém o monumento abaixo do `h1` em **toda** largura, porque 5,2vw
  fica sempre abaixo dos 5,6vw do `h1`. Não foi aplicada porque `tokens.ts` está
  congelado desde a Onda 1 e a Onda 4 não recebeu esse arquivo — é a primeira
  linha a mexer se o plano for reaberto.
- O assento cai de 30px para 20px porque **o fio duplo passou a fazer o trabalho
  de separação que o vazio fazia**. Ornamento que separa devolve o espaço que a
  ausência de ornamento exigia. Se o ornamento não estivesse entrando, esses 10px
  não poderiam sair.

**Desktop:** sem orçamento. Os máximos do `clamp` sobem à vontade (`44px` no
monumento, `64px` no assento). O desktop é onde a cerimônia fica realmente cara
e realmente boa.

### 5.2 Se estourar

Ordem de reclamação dos pixels, **antes** de tocar no monumento:

1. `Hero.tsx:186` — `marginTop` do `h1`: `clamp(12px,...)` → `clamp(10px,...)` (−2)
2. `Hero.tsx:145` — `paddingTop` da superfície: `clamp(24px,...)` → `clamp(20px,...)` (−4)
3. `Hero.tsx:166` — `rowGap` do grid: `clamp(24px,...)` → `clamp(20px,...)` (−4)

**Nunca:** remover o monumento, remover a serifa, reduzir a altura da faixa de
foto (`FAIXA`, `Hero.tsx:61` — a foto foi a queixa nº1 do cliente em 27/07) ou
mover o formulário. Se os três movimentos acima não bastarem, o monumento perde
a linha `SÁBADO · 12H` no mobile (`hidden sm:block`) e ganha ela de volta a partir
de `sm:` — a informação sobrevive no `<p>` do formulário (`copy-conversao.ts:20`).

---

## 6. O contrato: tokens e primitivos novos

### 6.1 `_lib/tokens.ts` — ADITIVO, sob pena de quebrar o formulário

**Nenhum valor existente de `typo.*`, `space.*`, `dark.*`, `light.*` muda.**
Motivo medido e já documentado em `ESPACAMENTO.md` §4.1: `Formulario.tsx` — que
está **fora de escopo** — consome `typo.monoLabel`, `typo.displayLg` e `typo.body`.
Mutar qualquer um deles redesenha o formulário **dentro da primeira dobra** sem
que o arquivo seja tocado. É a forma mais silenciosa de perder o KPI.

Entra, tudo novo:

```ts
font.serif        "var(--font-serif), 'Playfair Display', Georgia, serif"

rule              { hair: 1, gap: 3 }        // fio duplo = 1+3+1 = 5px

ink               { musgo: '#39553E', musgoWash: 'rgba(57,85,62,0.10)' }
                  // musgo: SÓ fio de 1px. musgoWash: SÓ fundo de bloco de ficha.
                  // #39553E sólido com corpo em cima = 2,74:1 = reprova AA.

typo.dataMonumento  serifa 400 · clamp(26px, 7vw, 44px) · lh 1.05 · ls -0.005em
typo.cerimonia      serifa 400 · uppercase · ls 0.18em · clamp(11px,1.3vw,13px) · lh 1.4
typo.aberturaSerif  serifa 400 · clamp(30px, 5.4vw, 60px) · lh 1.12 · ls -0.005em
typo.fichaValor     OSWALD 600 · clamp(34px, 6vw, 54px) · lh 1 · tabular-nums
typo.fichaRotulo    Plex Mono 500 · uppercase · ls 0.14em · clamp(10.5px,1.2vw,11.5px) · lh 1.45
```

`fichaValor` em **Oswald e não em serifa** — §3.2. Dado tabular é operação.

### 6.2 `_components/ui.tsx` — três primitivos novos

```tsx
<FioDuplo surface="dark" />                       // 1px + 3px + 1px
<Cerimonia surface="dark">TEXTO</Cerimonia>       // small caps serifadas (typo.cerimonia)
<Monumento valor="TOP 5%" rotulo="IQG — 148 …" /> // Oswald + Plex Mono, tabular
```

`Eyebrow`, `Section`, `Container`, `Reveal`, `Hairline`, `PillButton`,
`StatNumber`, `TopicCard`, `MultiLine` — **assinatura inalterada**. Nenhum prop
novo, nenhum default mexido. Componente compartilhado com quatro seções não muda
comportamento no meio de um redesign paralelo.

### 6.3 `_lib/ficha.ts` — gerado, congelado

Isto **espelha o arquivo que existe** (gerado na Onda 1, commit `fcf9f25`), não é
especificação a cumprir. Quem consome copia daqui e confere no arquivo:

```ts
export const FICHA = {
  fonteHash: 'aa25784f',                  // sha256 curto da fonte de hoje
  lotes: 134,
  animais: 160,
  idade:  { comDado: 158, naFaixa: 156, min: 20, max: 24, mediana: 23 },
  ce:     { comDado: 158, mediana: 37, acima34: 140, min: 30, max: 43.5 },
  peso:   { comDado: 157, mediana: 780, min: 560, max: 1045 },
  iqg:    { avaliados: 158, top5: 148, top1: 84 },
  iabcz:  { avaliados: 159, deca1: 158 },
  selos:  { lotes: 55, animais: 56 },
  pais:   { distintos: 25 },
} as const
```

**Atenção de quem monta a `Pista`:** o campo é `iqg.avaliados` (**158**), não
`iqg.total` (160) — o contrato dizia `total: 160` e estava errado; a causa está
na nota da §2.1. O rótulo do primeiro monumento lê **"148 DOS 158"**. Todo campo
`comDado`/`avaliados` existe para ser impresso junto do numerador, nunca omitido.

### 6.4 `_lib/copy.ts` — chaves novas, enumeradas

Escritas **todas na Onda 1**, inclusive as que só serão consumidas na Onda 3.
Isso é o que permite congelar `copy.ts` e rodar quatro agentes em paralelo depois.

| Chave | Consumida por | Nota |
|---|---|---|
| `hero.creditoOrigem` | `Hero.tsx` (T5) | Substitui a montagem inline de `EVENTO.vendedores` |
| `contagem.cerimonia` | `Contagem.tsx` (T5) | `SÁBADO · 12H` — derivado de `EVENTO`, não hardcoded |
| `pista.eyebrow` / `.title` / `.lead` | `Pista.tsx` (T4) | Abertura sangrada |
| `pista.rotulos[4]` | `Pista.tsx` (T4) | Os 4 rótulos da §2.2, **com denominador** |
| `pista.apoio` | `Pista.tsx` (T4) | A linha de apoio da §2.2. Recebe `FICHA` por parâmetro |
| `pista.fotoAlt` | `Pista.tsx` (T4) | Descrição factual, sem claim |
| `pista.ancora` | `Pista.tsx` (T4) | Link quieto de volta ao `#cadastro` |
| `subHero.eyebrow` | `SubHero.tsx` (T8) | Hoje a seção não tem eyebrow |
| `catalogo.nota` (**reescrita**) | `Oferta.tsx` (T6) | Perde "a Bula lê o catálogo por você — pedigree, avaliação genética e vídeo" porque a `Pista` passou a **mostrar** isso. Nenhum argumento duas vezes |

Regra que continua: nenhum valor factual mora em `copy.ts` — número de lote,
data e hora saem de `EVENTO`; agregado sai de `FICHA`.

---

## 7. Verificação

### 7.1 Reproduzir os números da §2

```bash
node -e "
const d=require('./.planning/leilao-sao-geraldo/lotes.json');
const A=d.lotes.flatMap(l=>l.animais.map(a=>({...a,_lote:l.lote})));
const n=x=>x!==null&&x!==undefined, med=a=>{a=[...a].sort((x,y)=>x-y);return a[Math.floor(a.length/2)]};
const id=A.map(a=>a.idadeMeses).filter(n), ce=A.map(a=>a.ceCm).filter(n), pe=A.map(a=>a.pesoKg).filter(n);
console.log('idade 20-24:', id.filter(x=>x>=20&&x<=24).length, '/', id.length);
console.log('CE mediana:', med(ce), '| >=34:', ce.filter(x=>x>=34).length, '/', ce.length);
console.log('peso mediana:', med(pe), '| faixa', Math.min(...pe), Math.max(...pe));
const iqg=A.map(a=>a.indices?.dep_top?.IQG?.TOP).filter(n);
console.log('IQG top5:', iqg.filter(t=>t<=5).length, '/', iqg.length);
console.log('iABCZ DECA1:', A.filter(a=>a.indices?.iabcz_deca?.iABCZ?.DECA===1).length, '/ 159');
console.log('lotes c/ selo:', new Set(A.filter(a=>(a.selosTouroDeCentral||[]).length).map(a=>a._lote)).size, '/ 134');
console.log('pais distintos:', new Set(A.map(a=>a.pedigree?.pai?.nome).filter(Boolean)).size);
"
```

Esperado, exatamente: `156 / 158` · `37 | >=34: 140 / 158` · `780 | 560 1045` ·
`148 / 158` · `158 / 159` · `55 / 134` · `25`.

**Correção de 28/07 (Onda 1 · T1), no denominador do IQG.** Este bloco trazia
`'/ 160'` **chumbado como string** na linha do IQG — o `console.log` imprimia o
literal, não contava nada. A contagem real é **148 de 158**: os lotes **32**
(`N298 DA 7P`) e **92** (`N262 DA 7P`) trazem `***` na tabela DEP/TOP% **inteira**
no PDF (conferível em `catalogo-raw.txt`, no bloco do lote 32) — o catálogo não
publica o índice deles, então eles não entram no denominador. Não é falha do
parser. A linha agora calcula o denominador em vez de afirmá-lo.

Importa porque **a página imprime esse denominador**: o primeiro monumento da
`Pista` tem que ler **"148 DOS 158"**. `ficha.ts` emite o campo como
`iqg.avaliados: 158` (espelhando `iabcz.avaliados`), não `iqg.total: 160`.
O `'/ 159'` do iABCZ e o `'/ 134'` dos selos seguem chumbados nesta linha, mas
foram conferidos e batem com a contagem. **§2.1, §2.2 e §6.3 já foram corrigidas**
na mesma varredura — o documento inteiro diz 158.

### 7.2 Portões — todos automatizáveis

Os comandos abaixo já saíram corrigidos da rodada da Onda 4: cinco deles eram
`grep` ingênuos que **acertavam comentário** e devolviam falso positivo. Onde o
comando mudou, o motivo está na coluna de aceite.

| # | Portão | Comando | Aceite | **Obtido (Onda 4)** |
|---|---|---|---|---|
| 1 | Tipos | `npx tsc --noEmit` | exit 0 | **exit 0** |
| 2 | Lint | `npm run lint` | zero warning novo | **126 warnings, 0 em `src/app/saogeraldo/` — os 126 são pré-existentes e nenhum é novo** |
| 3 | Build | `npm run build` | exit 0 | **exit 0** |
| 4 | **Peso do HTML** | `wc -c .next/server/app/saogeraldo.html` | **≤ 78.000 bytes** (base 68.467) | **71.290 — sobram 6.710** |
| 5 | **Sem `lotes.json` no bundle** | `grep -rEn "from ['\"].*lotes\.json\|require\(.*lotes\.json" src/` | 0 resultados. *(O grep antigo, por `lotes.json` solto, dava 3 — os três são COMENTÁRIOS avisando para não importar o arquivo. Contar aviso como violação é ruído.)* | **0 imports** (3 menções, todas em comentário) |
| 6 | **Ficha em dia** | `node scripts/agrega-ficha-saogeraldo.mjs --check` | exit 0 | **exit 0** — `sha256 aa25784f` |
| 7 | **`#cadastro` único** | `grep -rn 'id="cadastro"' src/app/saogeraldo/` | 1 linha, em `Hero.tsx` | **1**, `Hero.tsx:269` |
| 8 | **Tracking intacto** | `grep -rn "dataLayer" src/app/saogeraldo --include="*.tsx" --include="*.ts" \| grep -v GoogleTagManager \| grep -v "_lib/analytics"` · `grep -rEn "router\.push\(\|useRouter\(" src/app/saogeraldo/` | 0 · 0. *(As aspas nos `--include` são obrigatórias no zsh, senão o glob morre antes do grep. O segundo padrão pede o parêntese: sem ele, acerta o comentário de `Formulario.tsx:232` que explica por que ali NÃO se usa `router.push`.)* | **0 · 0** |
| 9 | **Serifa só onde o §3.2 autoriza** | `grep -rln "typo.cerimonia\|typo.dataMonumento\|typo.aberturaSerif\|<Cerimonia" src/app/saogeraldo/_components/` | `ui.tsx` (onde o primitivo mora) + os consumidores da §3.2 | **`ui.tsx`, `Contagem.tsx`, `Pista.tsx`, `Hero.tsx`, `Footer.tsx`** — ver §3.2, que passou a listar 4 consumidores |
| 10 | **Anti-ícone** | `grep -rn "from 'lucide-react'" src/app/saogeraldo/_components/` | só `Formulario.tsx` (fora de escopo) | **1 import, em `Formulario.tsx`** (o grep antigo também pegava o comentário do `Fecho.tsx` que registra a remoção do `ArrowUp`) |
| 11 | **Fio duplo na conta** | `grep -rc "<FioDuplo" src/app/saogeraldo/_components/*.tsx` | 8 usos renderizados, em 6 arquivos (§3.3) | **10 ocorrências em 6 arquivos = 8 no caminho renderizado** (a `Contagem` declara 4: 2 no ramo vivo e 2 no ramo de evento encerrado, que nunca coexistem) |
| 12 | **`typo`/`space` não mutados** | `git diff origin/main -- src/app/saogeraldo/_lib/tokens.ts` | só **adições** | **267 adições, 0 remoções** |
| 13 | **Dobra do celular** | `node scripts/medir-dobra-saogeraldo.mjs` (§7.3) | topo de `#cadastro` **≤ 596px** @390×844 | **579px — sobram 17** |
| 14 | Reduced motion | Playwright com `reducedMotion: 'reduce'` | marquee parado, contagem em 60s, `Reveal` sem transform | **marquee: nenhuma animação ativa · contagem sem os segundos e medida com relógio falso (+30s não mexe, +65s mexe) · `Reveal` sem transform.** Ressalva: 4 `TopicCard` do SubHero ficam em `translateY(18px)` permanente sob reduced motion — **pré-existente** (o `TopicCard` não foi tocado no redesign, `ui.tsx` só recebeu adições) |
| 15 | Contraste | 3 amostras de cor sobre `musgoWash` | ≥ 4,5:1 no corpo | fundo medido `rgb(17,20,17)`: **greige 6,15:1 · muted 8,55:1 · dourado 8,27:1 · branco 17,02:1** |

#### De onde o peso do HTML realmente vem — medido na Onda 4

O plano supôs, e a equipe supôs junto, que **ornamento custa peso**: mais fio,
mais monumento, mais bytes. A medição diz outra coisa, e a diferença é de uma
ordem de grandeza.

Medido em worktree isolada, sobre o mesmo commit, mudando **uma variável por vez**:

| O que | Δ bytes no HTML |
|---|---|
| **A fronteira servidor↔cliente** — `Hero`, `Pista` e `Footer` como componentes de servidor, contra os três com `'use client'` | **11.245** |
| Um `<svg>` do `lucide` renderizado inline (o `ArrowUp` que saiu do `Fecho`) | ~297 |
| Todo o ornamento novo de T5 junto — 2 fios duplos, o monumento em serifa e a linha de cerimônia, já descontando o `<p>` de data e o rótulo que saíram | +914 |

Ou seja: **o ornamento do redesign é 12× mais barato que a fronteira RSC**, e o
ícone do `lucide` é 38× mais barato. A intuição de que "o redesign engordou a
página" estava olhando para o lugar errado.

**O mecanismo.** Num componente de servidor, cada `style={{...}}` inline viaja
**duas vezes**: uma no HTML renderizado e outra no payload RSC, que é JSON
embutido em `<script>` com **as aspas escapadas a 3 bytes cada** (`\\\"`). Uma
seção inteira de estilos inline — que é o idioma desta página — paga o dobro mais
o imposto do escape. Marcar a seção com `'use client'` não muda um pixel do DOM:
muda **onde a costura cai**, e a subárvore some do payload.

**A conta fechada do redesign:**

```
antes do redesign ......................... 68.467 bytes
depois, com as três seções de servidor ..... 82.535   (+14.068 — estouraria o portão em 4,5 KB)
depois, com 'use client' nas três .......... 71.290   (+2.823 — e uma seção NOVA inteira dentro)
```

**Regra para a próxima página desta família:** numa landing de estilo inline,
`'use client'` numa seção estática é decisão de ORÇAMENTO, não de
interatividade — e é a alavanca mais forte que existe sobre o peso do HTML.
O contrapeso honesto: o código da seção passa a viajar no chunk de JS da rota.
Aqui isso é de graça, porque todas as outras seções já eram de cliente e o chunk
já era baixado; numa página com seções de servidor de verdade, a conta muda.

### 7.3 O medidor de dobra (Playwright já está no repo — `^1.60.0`, chromium instalado)

`scripts/medir-dobra-saogeraldo.mjs`: sobe `next start`, abre `/saogeraldo` em
**390×844**, lê
`document.getElementById('cadastro').getBoundingClientRect().top + scrollY`,
imprime e sai com código ≠0 acima de **596**. Roda também em 375×667 e 1440×900
como relatório (sem portão).

Sem isso, "a dobra continua ok" é opinião. Com isso, é `exit 0`.

### 7.4 Checkpoint humano — dois, e só dois

1. **Antes de fechar a Onda 3:** conferir 3 lotes sorteados da `Pista` contra
   `catalogo-raw.txt` — idade, CE, DECA. É a prova de que o parser não inventou.
2. **Antes do go-live:** mostrar o bloco de ficha ao cliente. Os números não
   precisam de validação (§2.2), mas **exibi-los é decisão comercial** e o
   cliente é dono dela.

---

## 8. Ondas de execução e dono por arquivo

O risco nº1 é colisão de edição. A regra que elimina esse risco:

> **Todo arquivo compartilhado muda cedo, por um dono só, e congela.**
> `tokens.ts`, `copy.ts`, `ficha.ts`, `ui.tsx`, `page.tsx` e `layout.tsx` são
> tocados nas Ondas 1 e 2. Da Onda 3 em diante, **estão congelados para todos**.

### Onda 1 — Fundação · 3 agentes em paralelo · arquivos disjuntos

| Tarefa | Dono exclusivo dos arquivos | Entrega |
|---|---|---|
| **T1 · DADOS** | `scripts/agrega-ficha-saogeraldo.mjs` *(novo)*, `src/app/saogeraldo/_lib/ficha.ts` *(novo, gerado)* | Script + módulo congelado + modo `--check` |
| **T2 · TOKENS** | `src/app/saogeraldo/_lib/tokens.ts`, `src/app/saogeraldo/layout.tsx` | `font.serif`, `rule`, `ink`, 5 presets novos; `next/font` no layout |
| **T3 · COPY** | `src/app/saogeraldo/_lib/copy.ts` | **Todas** as chaves da §6.4, inclusive as da Onda 3 |

**Nenhum dos três importa o trabalho do outro.** T2 não usa `FICHA`; T3 não usa
`typo`. Podem ir em qualquer ordem e commitar independentemente.

**T1 — critérios de pronto**
- `node scripts/agrega-ficha-saogeraldo.mjs` regrava `ficha.ts`; `--check` sai 0
- `ficha.ts` bate número a número com a §7.1
- `ficha.ts` < 1 KB e **não importa `lotes.json`**
- `grep -rn "lotes.json" src/` → 0
- **Risco:** o script apontar para caminho relativo errado ao rodar de outro cwd → resolver o caminho a partir de `import.meta.url`

**T2 — critérios de pronto**
- `git diff` de `tokens.ts` tem **zero linha removida** dentro de `typo`/`space`/`dark`/`light` (portão 12)
- Playfair Display carrega só em `/saogeraldo`; `document.fonts` na `/touros` não lista a família
- `npm run build` exit 0; peso do woff2 anotado no commit
- **Risco alto:** `next/font` mexe no layout que envolve o `GoogleTagManager` — o script do GTM não pode mudar de posição no DOM. Só a `className` do `<div>` muda

**T3 — critérios de pronto**
- Zero número factual em `copy.ts` (tudo por parâmetro, vindo de `EVENTO` ou `FICHA`)
- `catalogo.nota` reescrita e mais curta que a atual (232 caracteres)
- Nenhuma menção a frete, local, transmissão ou leiloeira
- Todos os 4 rótulos da `Pista` carregam **denominador**
- **Risco:** duplicar argumento entre `pista.lead` e `catalogo.nota` → checar lendo as duas em sequência

---

### Onda 2 — Primitivos e a seção nova · 1 agente, sozinho

Este é o arquivo mais quente do repositório e a peça com mais decisão nova.
**Um dono, três commits.** Ninguém mais roda nesta onda.

| Tarefa | Dono exclusivo | Commit |
|---|---|---|
| **T4 · ARQUITETURA** | `src/app/saogeraldo/_components/ui.tsx` | `feat(saogeraldo): fio duplo, cerimonia e monumento em ui.tsx` |
| | `src/app/saogeraldo/_components/Pista.tsx` *(novo)* | `feat(saogeraldo): secao Pista — abertura sangrada e ficha do rebanho` |
| | `src/app/saogeraldo/page.tsx` | `feat(saogeraldo): Pista entra depois do Hero` |

**Critérios de pronto**
- `FioDuplo`, `Cerimonia`, `Monumento` exportados; assinatura dos 9 primitivos existentes **inalterada** (`git diff` não mostra mudança de props ou defaults)
- `Pista.tsx` consome `FICHA` e `copy.pista`; **zero número literal** no JSX
- Foto sangrada com `priority={false}`, `sizes="100vw"`, `alt` de `copy.pista.fotoAlt`
- Nenhum texto de corpo sobre a foto — só o título serifado sobre vinheta
- Fundo da ficha em `ink.musgoWash` a ≤12%; corpo greige medido ≥4,5:1
- `page.tsx`: `<Pista />` entre `<Hero />` e `<Oferta />`. **Nada mais muda** — o diff de `page.tsx` é de 2 linhas + comentário
- `npm run build` exit 0; portão 4 (≤78 KB) já verificado nesta onda
- **Riscos:**
  - `ui.tsx` é importado por `Oferta`, `SubHero`, `ProvaSocial` e `Fecho`. Qualquer default alterado redesenha quatro seções às cegas → a regra é aditiva, e só
  - A foto sangrada é o maior item de peso do redesign → medir o transfer real em DevTools no perfil "Fast 3G" antes de fechar
  - `page.tsx` **congela** ao fim desta onda

---

### Onda 3 — Seções · 4 agentes em paralelo · um arquivo (ou par) cada

Congelados para todos: `page.tsx`, `ui.tsx`, `tokens.ts`, `copy.ts`, `ficha.ts`,
`layout.tsx`, `Formulario.tsx`, `StickyCta.tsx`, `analytics.ts`, `utm.ts`,
`GoogleTagManager.tsx`, `Obrigado.tsx`, `evento.ts`, e tudo fora de
`src/app/saogeraldo/`.

**Protocolo anticolisão:** se um agente da Onda 3 precisar de uma string ou de um
token que não existe, ele **não edita** `copy.ts` nem `tokens.ts`. Ele registra a
necessidade no corpo do commit com o prefixo `PRECISA:` e a Onda 4 aplica tudo num
commit consolidado. Foi para isso que a §6.4 enumerou as chaves antes.

| Tarefa | Dono exclusivo dos arquivos | Escopo |
|---|---|---|
| **T5 · DOBRA** | `_components/Hero.tsx` **+** `_components/Contagem.tsx` | Par indivisível |
| **T6 · OFERTA** | `_components/Oferta.tsx` | |
| **T7 · FECHO** | `_components/Fecho.tsx` | |
| **T8 · TILES** | `_components/SubHero.tsx`, `_components/ProvaSocial.tsx`, `_components/Footer.tsx` | Três arquivos leves, um dono |

**T5 · DOBRA — a tarefa de maior risco da onda**

`Hero` e `Contagem` são **um par indivisível**, pelo mesmo motivo que
`ESPACAMENTO.md` §7 travou T-3 com T-4: `Contagem` sozinha estoura o orçamento
de dobra; o crédito de −10px que paga a conta está em `Hero.tsx:239`. **Não
commitar um sem o outro.**

- Reescreve `Contagem`: fio duplo → `01 AGOSTO` (serifa, `typo.dataMonumento`) →
  `SÁBADO · 12H` (`typo.cerimonia`) → dígitos (Oswald, intocados) → fio duplo
- **Preservar textualmente:** `useState<Restante|null|undefined>`, o `undefined`
  como "ainda não montou", o `setInterval` com intervalo condicionado a
  `useSafeReducedMotion`, o `aria-hidden` na régua de dígitos, e o ramo
  `restante === null` (evento encerrado) — que também recebe o fio duplo
- `Hero`: eyebrow ganha small caps; crédito de origem vira `<Cerimonia>` sobre
  `<FioDuplo>`; assento da contagem `clamp(30px,…)` → `clamp(20px,…)`
- **Proibido:** mover, renomear ou envolver o `<div id="cadastro">`; alterar
  `FAIXA`, `FOTO_DESKTOP` ou `SOMBRA_LOGO`; tocar em `<LeadForm />`
- **Pronto quando:** portão 13 (`≤596px`) passa; portão 7 (`#cadastro` único)
  passa; contagem regressiva testada com `dataHoraISO` no passado e no futuro
- **Regressão:** se a dobra estourar, seguir a ordem de reclamação da §5.2. **Nunca**
  remover o monumento

**T6 · OFERTA**
- `<FioDuplo>` abrindo a grade de 4 condições; `gap-px` da grade **permanece** (é lista)
- `catalogo.nota` reescrita já vem pronta de T3 — o componente só consome
- **Proibido:** mexer no `href="#cadastro"` do CTA; mudar `PAGAMENTO`
- **Pronto quando:** os 4 valores continuam saindo de `evento.ts`; nenhuma string nova no JSX

**T7 · FECHO**
- `<FioDuplo>` no topo, substituindo o `borderTop` de 1px do `<Section>`
- **Remove `import { ArrowUp } from 'lucide-react'`** e o `<ArrowUp size={17} />`
  do CTA. O botão passa a ser rótulo em caixa alta, sem ícone
- Lista com hairlines de 1px **permanece** (é ficha, é lista — §3.3)
- **Proibido:** mexer no `href="#cadastro"`; mexer no `<style>` de `:focus-visible`
  (`Fecho.tsx:15-20`) — é acessibilidade de teclado
- **Pronto quando:** portão 10 passa; o CTA continua com `minHeight: 56`

**T8 · TILES**
- `SubHero`: ganha `<Eyebrow>` (Oswald, `surface="light"`) com `copy.subHero.eyebrow`.
  **Nada mais** — os `TopicCard` ficam como estão
- `ProvaSocial`: só alinha a folga do eyebrow ao ritmo novo. **O marquee, o
  `@keyframes`, o bloco de `prefers-reduced-motion`, os `scale` por logo e os
  `filter` de inversão são intocáveis** — foram calibrados logo a logo
- `Footer`: `<FioDuplo>` no topo; crédito dos criatórios em `<Cerimonia>`
- **Proibido:** mexer no array `CRIATORIOS`; mexer nos links legais e no
  `minHeight: 44` deles
- **Pronto quando:** portão 14 (reduced motion) passa; contraste do rodapé
  inalterado

---

### Onda 4 — Verificação e consolidação · 1 agente

| Tarefa | Arquivos |
|---|---|
| **T9 · VERIFICAÇÃO** | `scripts/medir-dobra-saogeraldo.mjs` *(novo)*; e só então, se houver `PRECISA:` pendente, um commit consolidado em `copy.ts`/`tokens.ts` |

- Roda os 15 portões da §7.2 e registra os valores obtidos ao lado dos esperados
- Aplica os `PRECISA:` da Onda 3 num único commit, com o escopo declarado na mensagem
- Inspeção visual em 375, 390, 768 e 1440
- `git diff --stat origin/main` — **nenhum arquivo fora do mapa da §8.1**
- Checkpoint humano 1 (§7.4) antes de fechar

### 8.1 Mapa de propriedade — tabela de bolso

| Arquivo | Onda | Dono | Depois disso |
|---|---|---|---|
| `scripts/agrega-ficha-saogeraldo.mjs` | 1 | T1 | livre |
| `_lib/ficha.ts` | 1 | T1 | **congelado** (só o script regrava) |
| `_lib/tokens.ts` | 1 | T2 | **congelado** até T9 |
| `layout.tsx` | 1 | T2 | **congelado** |
| `_lib/copy.ts` | 1 | T3 | **congelado** até T9 |
| `_components/ui.tsx` | 2 | T4 | **congelado** |
| `_components/Pista.tsx` | 2 | T4 | livre para T4 |
| `page.tsx` | 2 | T4 | **congelado** |
| `_components/Hero.tsx` | 3 | T5 | — |
| `_components/Contagem.tsx` | 3 | T5 | — |
| `_components/Oferta.tsx` | 3 | T6 | — |
| `_components/Fecho.tsx` | 3 | T7 | — |
| `_components/SubHero.tsx` | 3 | T8 | — |
| `_components/ProvaSocial.tsx` | 3 | T8 | — |
| `_components/Footer.tsx` | 3 | T8 | — |
| `scripts/medir-dobra-saogeraldo.mjs` | 4 | T9 | — |
| `_components/Formulario.tsx` · `StickyCta.tsx` · `_lib/analytics.ts` · `_lib/utm.ts` · `_lib/evento.ts` · `GoogleTagManager.tsx` · `Obrigado.tsx` | — | **ninguém** | intocados |
| `src/app/touros/**` · `src/lib/**` · `src/app/api/**` · `src/app/layout.tsx` · `next.config.mjs` | — | **ninguém** | produção |

**Nenhum arquivo aparece em duas linhas da mesma onda.** É a propriedade da tabela
que faz o paralelismo ser seguro; se uma tarefa precisar sair do seu conjunto, a
onda para e o dono se renegocia — não se abre exceção no meio.

---

## 9. O que fica de fora, e por quê

### 9.1 Travado pelo BRIEF — reabrir é erro

| Fora | Razão |
|---|---|
| Lista, galeria ou grade de lotes | Levava o HTML de 68 KB para 1,82 MB, pago **antes** de a pessoa ver o formulário. E o cliente decidiu |
| Thumbnails de vídeo do YouTube | Só existiriam como visual de lote — e não há seção de lote |
| Qualquer placeholder de foto de lote | Regra não negociável: o layout tem que ficar completo **sem** foto de lote. Nenhuma moldura vazia, silhueta ou "em breve" |
| Frete e mapa | Cortados por inteiro. A página **não menciona frete** — "frete grátis" genérico seria claim falso |
| Campo touro/matriz | Catálogo 100% macho |
| Local, transmissão, leiloeira | Fora de escopo por decisão do cliente. É o que inviabiliza o bloco de créditos do HTML de referência (§3.5) |
| Segunda instância do formulário | Duplicaria eventos de funil. `#cadastro` é único |
| Estado pós-01/08 | "Não preocupa" |
| String comercial hardcoded em componente | Tudo em `copy.ts` |
| Claim numérico novo | Só agregado com denominador declarado (§2.2) |

### 9.2 Rejeitado por decisão deste plano — com o argumento

| Fora | Razão |
|---|---|
| Nav fixa | Uma âncora, um CTA, dobra fechada. `StickyCta` já resolve melhor (§4.3) |
| Canvas `#2B1F13`, champagne `#B9A46F`, off-white `#FFFFFC` | Revalidação de contraste da página inteira por diferença imperceptível (§3.1) |
| Azul-ardósia `#839BA2` | Terceiro accent quebra "dourado é voltagem única" |
| Verde-musgo como painel sólido | Medido: 2,74:1 com o corpo. Reprova AA (§3.4) |
| LUT quente por `filter:` CSS | As fotos já são de fim de tarde; a camada de composição custa mais que o efeito |
| Segunda serifa, ou serifa em corpo/número | Proibição explícita do sistema + a regra de papel da §3.2 |
| `font-feature-settings: 'smcp'` | Recurso não garantido no subset do Google. Small caps **faux** |
| Troca do `ProvaSocial` por realização/patrocínio | Provaria a coisa errada, e duas das três colunas não existem (§3.5) |
| Mutar `typo.*` / `space.*` | `Formulario.tsx` consome, está fora de escopo, e vive na dobra (§6.1) |
| Refactor de `Formulario`, `StickyCta`, analytics ou rotas | É redesign de superfície. Lógica de conversão não se toca num redesign |
| Animação nova (parallax, contador animado, scroll-linked) | `Reveal` já dá o movimento da casa e já respeita `prefers-reduced-motion`. Movimento novo é custo de bateria e risco de acessibilidade por decoração |

### 9.3 Adiado, com preço declarado

| Adiado | Quando volta |
|---|---|
| Foto real de lote | Quando o cliente enviar. Entra como **enriquecimento** da faixa sangrada, nunca como preenchimento |
| Selo de frete por UF | Se o cliente aprovar a leitura do mapa vetorial. É aditivo e barato |
| Número validado de prova social | Se o `[VALIDAR]` da `/touros` for confirmado, entra em **uma linha** no `ProvaSocial` |
| Fio duplo em `Oferta`/`SubHero` | Deliberadamente ausente. Se a página ficar "pouco cerimoniosa" depois de pronta, é o próximo passo mais barato — e reversível |

---

## 10. Riscos, em ordem de dano

| # | Risco | Probabilidade | Dano | Mitigação |
|---|---|---|---|---|
| 1 | **Data-monumento empurra `#cadastro` para fora da dobra** | Média | **Perde o KPI** | Livro-caixa fechado (§5), ordem de reclamação (§5.2), portão 13 automatizado |
| 2 | **Colisão de edição entre terminais** | Alta se o mapa não for respeitado | Horas perdidas em merge | §8.1 · congelamento por onda · protocolo `PRECISA:` |
| 3 | **Alguém muta `typo.*` "só um pouquinho"** | Média | Redesenha o formulário sem tocar nele | Portão 12 (`git diff` sem linha removida) |
| 4 | Foto sangrada pesa mais que o previsto no 3G | Média | LCP pior abaixo da dobra | `lazy` + `sizes="100vw"` + medição em Fast 3G na Onda 2 |
| 5 | FOUT da serifa na dobra | Média | CLS visível na data | `adjustFontFallback` do `next/font` + peso único + portão 3 |
| 6 | Um agregado da `Pista` estar errado por falha do parser | Baixa | Claim falso em página de tráfego pago | Denominador explícito (§2.2) + `--check` (portão 6) + checkpoint humano 1 |
| 7 | Ornamento demais — a página vira pastiche | Média | Perde o registro que queria ganhar | Regra fechada: 6 fios duplos (portão 11), serifa em 3 arquivos (portão 9) |
| 8 | `next/font` falhar no build por rede | Baixa | Build quebrado | Contingência declarada em §3.2 |
| 9 | Peso do HTML crescer sem ninguém notar | Baixa | Landing lenta em mobile pago | Portão 4, com base medida de 68.467 bytes |

---

## 11. Resumo em uma tela

| Onda | Agentes | Entrega | Portão que fecha a onda |
|---|---|---|---|
| **1** | 3 em paralelo | `ficha.ts` gerado · serifa e tokens novos · copy completa | 1, 2, 5, 6, 12 |
| **2** | 1 sozinho | Primitivos de ornamento · seção `Pista` · `page.tsx` | 3, 4, 11 |
| **3** | 4 em paralelo | Data-monumento · Oferta · Fecho sem ícone · tiles | 7, 8, 9, 10, 13 |
| **4** | 1 | Medidor de dobra · consolidação · inspeção | todos os 15 + checkpoint humano |

**A frase que resume o plano:** a página não fica "mais bonita" por decoração —
ela ganha **substância** (a ficha do rebanho, computada e verificável),
**voz** (uma serifa que fala pelo evento enquanto o Oswald continua falando pela
Bula) e **cerimônia** (fio duplo, small caps, abertura sangrada), com o
formulário exatamente onde está, a dobra medida por script e o tracking sem uma
linha alterada.
