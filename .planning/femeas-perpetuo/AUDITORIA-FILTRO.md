# Auditoria do filtro `/femeas#para-quem`

**Data:** 06/08/2026 · **Branch:** `feat/femeas-perpetuo`
**Escopo:** só a seção `#para-quem` (`src/app/femeas/_components/ParaQuem.tsx`, copy em `_lib/copy.ts`).
**Método:** navegador real (Chromium/Playwright) em 390×844 e 1440×900, com animações neutralizadas, medindo o DOM renderizado. Nenhuma linha de código foi alterada.

---

## Veredito em uma frase

**O dono está certo, e as quatro rodadas anteriores erraram o alvo pelo mesmo motivo: todas trataram de fazer "ver duas colunas" — e no celular, que é onde ele revisa e onde está o tráfego, não existem duas colunas.** A seção empilha. O que ele vê é uma lista de 1.374px, 19 linhas de texto cinza de 16px, com dois rótulos de 20px e dois traços de 2px. No desktop a seção funciona razoavelmente. No iPhone ela não é um comparativo: é prosa.

E há um agravante medido, que ninguém tinha visto: **na posição natural de entrada da seção no celular, o título "NÃO é para você se" cai exatamente dentro da barra fixa do CTA e fica invisível.** A negação — a razão de a seção existir — nunca divide tela com a afirmação.

---

## 1. Por que ela lê como fraca — a evidência

### 1.1 É a única seção da página sem âncora nenhuma, e isso é mensurável de dois jeitos ao mesmo tempo

Medido em 390×844, seção a seção. `nonTextFrac` = fração da área da seção ocupada por `img`/`svg`/`video`. `maxFs` = maior corpo de texto renderizado dentro da seção.

| Seção | Altura | `maxFs` | Razão maxFs/corpo(16px) | Área não-texto |
|---|---|---|---|---|
| topo (hero) | 1418 | 38px | **2,38×** | **27,0%** |
| galeria | 1052 | 27px | 1,69× | **74,2%** |
| **para-quem** | **1374** | **27px** (é o próprio h2) | **1,25×** | **0,0%** |
| categorias | 858 | 40px | **2,50×** | 0,0% |
| jornada | 1567 | 34px | **2,13×** | **18,7%** |
| assessoria | 1175 | 27px | 1,13× | 3,0% |
| prova | 549 | 22px | 1,38× | **14,3%** |
| fecho | 533 | 29px | 1,81× | 0,0% |

**A regra que a página inteira obedece, menos aqui:** toda seção ou quebra 2,0× de razão tipográfica, ou carrega ≥3% de área não-texto. Categorias não tem imagem nenhuma e passa por escala (2,50×). Assessoria tem razão baixíssima (1,13×) e passa por diagrama (3%). `para-quem` **não faz nem um nem outro** — 1,25× e 0,0%. É a única linha da tabela sem nenhum dos dois mecanismos.

E o `maxFs` de 27px da seção é o **próprio `<h2>`**. Ou seja: dentro do corpo da seção nada sobe acima de 20px. Todas as outras seções têm pelo menos um elemento *maior* que o próprio título — o algarismo das categorias (40px) e o da jornada (34px) são maiores que os h2 de 27px que os encabeçam. Aqui o conteúdo peca por ficar sempre **abaixo** do título.

### 1.2 O tratamento 3 subiu o título, mas o marco continua menor que o texto que organiza

Foi essa a justificativa da rodada 3 ("os marcos mediam menos que o texto"). Medindo a **largura de tinta real** (Range API, não a caixa):

| Elemento | Largura de tinta | Contra a linha de corpo |
|---|---|---|
| `É para você se` (h3, 20px Oswald) | **109px** | 31% |
| `NÃO é para você se` (h3, 20px Oswald) | **147px** | 42% |
| Linhas de critério (16px Inter) | 272–347px | — |
| Filete | 355px × 2px | — |

Oswald é condensada. Subir 12→20px resolveu a altura, **não a massa**: o marco de estrutura continua ocupando de um terço a dois quintos da largura de cada linha que ele encabeça. O único elemento que cruza a coluna inteira é um traço de 2px.

**Tinta não-corpo da seção inteira no celular:** dois filetes de 355×2px = 1.420px² sobre 535.860px² de seção = **0,26%**. É esse o "dispositivo visual" que a seção tem hoje.

### 1.3 A queixa "ainda fraco" é de escala, e a escala foi para o lugar errado

A seção tem **6 níveis tipográficos** no celular (11 Oswald, 14 Inter, 16 Inter, 16/600 Inter, 20 Oswald, 27 Oswald) — nível suficiente. O problema não é falta de níveis; é que **os três níveis do topo (eyebrow 11 / h2 27 / h3 20) estão todos empilhados nos primeiros 292px** e os 1.082px restantes são um platô de 16px sem variação nenhuma. A seção gasta a hierarquia inteira antes do conteúdo começar.

### 1.4 O ritmo vertical não distingue "item" de "linha" tão bem quanto o código supõe

O comentário do componente afirma que "24px de branco já é o triplo do branco entre duas linhas". Medido: `line-height` 1,6 sobre 16px = 25,6px, ou seja **≈9,6px de branco entre linhas** contra 24px entre itens — 2,5×, não 3×. E 5 dos 9 itens ocupam 2 linhas (51px) ou 3 (77px). O olho, varrendo, vê blocos de 26/51/77px separados por 24: a distinção entre "próxima linha do mesmo critério" e "próximo critério" é fraca o bastante para os nove itens lerem como um parágrafo só. Foi exatamente por isso que os filetes existiam na versão 1 — eles resolviam um problema real, com a ferramenta errada.

### 1.5 ⚠️ Achado novo: a barra fixa engole o título "NÃO"

Com o scroll posicionado no topo da seção (`scrollY = 2469`, exatamente o topo de `#para-quem`) em 390×844:

| Elemento | Topo na viewport |
|---|---|
| `É para você se` | 292 |
| **`NÃO é para você se`** | **808** |
| Barra fixa `.femeas-sticky` | **768 → 845** |

O título da segunda coluna nasce **dentro** da faixa do CTA fixo. A viewport útil é de **768px**, não 844. A seção tem 1.374px = **1,79 tela útil**.

Consequência: **a afirmação e a negação nunca aparecem juntas em nenhum quadro do celular.** O dispositivo retórico da seção — "isto sim / aquilo não", lado a lado — é o único que o layout mobile não entrega. Nenhum dos quatro tratamentos tocou nisso, porque todos foram desenhados olhando as duas colunas do desktop.

### 1.6 O desktop está bem melhor que o celular, e isso explica o desencontro

Em 1440×900 a seção mede 1.098px, as duas colunas ficam lado a lado com goteira de 72px, os filetes têm 454px cada e o h2 sobe para 44px. Ali a oposição **se lê**. O laudo é claro: as quatro rodadas foram avaliadas no desktop e reprovadas no iPhone. É o mesmo componente com dois comportamentos diferentes, e só um deles está sendo julgado.

### 1.7 O que NÃO é o problema (descartado por medição)

- **Contraste.** Oliva 6,29:1 e terracota 6,23:1 sobre `#F5F3EF`; corpo `#4A4A4A` sobre o mesmo fundo. Tudo AA com folga. A cor semântica da rodada 4 está tecnicamente correta — ela só é invisível por área (0,26%), não por contraste.
- **Simetria punitiva.** As duas colunas estão de fato idênticas em geometria, tamanho, peso e luminância. A restrição está sendo respeitada. Nada a corrigir aqui.
- **Densidade de palavras.** 175 palavras / 1.374px = **127 palavras por 1.000px** no celular. A `categorias` faz **315** — duas vezes e meia mais densa — e não está sendo reprovada. **O filtro não é a seção mais densa da página; ele é a mais *monótona*.** A nota `[JA]` em `copy.ts` que chama o filtro de "seção mais densa por larga margem" está medindo a `categorias`, não esta. Cortar copy aqui não resolve o que o dono está vendo.

---

## 2. Duas direções, mais uma de baixo custo

Todas respeitam: 5 e 4 critérios intactos, colunas de mesmo peso, sem `✓`/`✗`, sem vermelho, sem acordeão. Nenhuma acrescenta traço, caixa ou ícone. Nenhuma mexe no `primeiroCampo` (950px no celular, e esta seção começa em 2.469px — está inteiramente abaixo dele; qualquer variação de altura aqui é irrelevante para aquele número).

### Direção A — Algarismo por critério (o dispositivo já aprovado duas vezes nesta página)

Cada critério ganha um numerador Oswald de 30–36px na cor da coluna, à esquerda, com o texto recuado. `01 02 03 04 05` na oliva, `01 02 03 04` na terracota — cada coluna reinicia em 01.

- **Resolve:** leva a razão tipográfica de 1,25× para **≈2,1×**, alinhando o filtro com categorias (2,50×) e jornada (2,13×). Cria **9 âncoras de varredura** onde hoje há 9 parágrafos, resolvendo 1.4 (a distinção item/linha passa a ser marcada por um objeto, não por 14px de diferença de branco). Faz o "5 contra 4" virar informação visível — hoje ninguém conta. E leva a cor semântica da rodada 4 de 0,26% de área para algo que existe na tela, sem inventar cor nova.
- **Não recai nas reprovadas:** não é painel nem borda (1), não é remoção (2), não é escala do título de coluna (3) — é escala no *item*, e o dono já aprovou esse mesmo elemento em duas outras seções desta página. Não é ícone: algarismo é texto, e o pictograma reprovado nas categorias era silhueta.
- **Custa:** o recuo encurta a medida no celular (355 → ~305px) e provavelmente acrescenta 1 linha em 2 ou 3 critérios, +60 a +120px de seção. Irrelevante para o `primeiroCampo`. Risco de leitura: numerar pode sugerir ordem de importância — mitigado por as duas colunas reiniciarem em 01, o que reforça o paralelismo em vez da hierarquia.
- **Risco residual:** é o quinto uso do mesmo dispositivo numa página que já tem algarismos nas categorias e na jornada. Pode soar repetitivo — é o contra-argumento honesto contra A.

### Direção B — Lema em Oswald abrindo cada critério

Cada critério passa a começar por um lema de 1 a 3 palavras em Oswald 18–20px, na cor da coluna, seguido da frase em Inter, na mesma linha. Ex.: **MARCA PRÓPRIA** — *Você quer criar Nelore PO registrado e, um dia, vender genética com o seu nome.* / **FÊMEA COMERCIAL** — *Você procura fêmea de gado comercial, para cria ou engorda.*

- **Resolve:** o problema real de leitura, que é que **hoje a seção não é varrível** — para saber se você se encaixa, precisa ler as nove frases inteiras. Com lema, o leitor varre nove rótulos em 3 segundos e só lê por extenso o que reconheceu. É o comportamento que um filtro precisa ter. Também injeta contraste de família e de cor a cada 50–77px, quebrando o platô de 1.082px descrito em 1.3.
- **Não recai nas reprovadas:** zero elemento novo — nenhum traço, caixa, ícone ou cor além do par existente. Não é a escala do título de coluna: é escala *dentro* do critério.
- **Custa:** **é copy nova** (9 lemas) e quem aprova copy é o JA — entra como proposta, não como implementação. Também é a mais arriscada quanto ao tom: um lema mal escolhido na coluna da direita ("VOLUME", "PREÇO") pode soar como etiqueta de rejeição, que é justamente o que a decisão travada proíbe. Os lemas do "não" precisam nomear a *intenção do comprador*, não julgá-la.
- **Combina com A.** A + B juntas resolvem escala e varredura ao mesmo tempo; separadas, B resolve mais e A é mais barata.

### Direção C — Consolidar os títulos (barata, cabe junto com A ou B)

A seção tem hoje três níveis de título nos primeiros 292px, e o `<h2>` — *"Antes de você preencher: isto aqui não é para todo mundo."* — **diz a mesma coisa que os dois `<h3>` dizem melhor e mais curto**. Proposta: rebaixar o h2 a olho/eyebrow (ou fundi-lo com o `lead`) e promover o par `É para você se` / `NÃO é para você se` ao posto de manchete da seção, em 27–30px no celular.

- **Resolve:** dá escala ao par **de graça**, sem acrescentar nenhum elemento — a escala vai para onde a oposição está, em vez de ficar num título genérico acima dela. Corta ~58px de altura, o que ajuda em 1.5 (aproxima o "NÃO" da dobra).
- **Não recai na rodada 3:** a rodada 3 subiu o h3 mantendo o h2 acima dele, o que obrigou a manter o h3 pequeno para não competir. Aqui o h3 *assume* o posto e o h2 sai da disputa. A restrição que travou a rodada 3 deixa de existir.
- **Custa:** perde-se o enquadramento "antes de você preencher", que é o que dá licença ao filtro. Precisa ir para o eyebrow ou para o `lead`. É mexida de copy — proposta, não decisão.
- **Sozinha não basta.** Continua 0% de área não-texto e o platô de 1.082px continua lá. C é multiplicador de A ou B, não substituto.

### O que NÃO recomendar, e por quê

- **Qualquer coisa desenhada olhando o desktop.** É o erro comum das quatro rodadas. Toda proposta desta seção precisa ser julgada em 390×844 com a barra fixa ligada — a viewport útil é 768px, não 844.
- **Reaproximar o "NÃO" da dobra encurtando a coluna do "sim".** Tira peso de um lado; vira punição pelo avesso.
- **Foto.** Confirmado: o material existente é lote em manejo e não ilustra critério. E a queda de 74,2% de área de imagem (galeria) para 0,0% (filtro) num único scroll é a transição mais brusca da página — vale registrar como hipótese de por que a percepção do dono é sistemática e não caprichosa, mas a resposta não é acrescentar foto aqui, e sim a seção parar de depender de contraste de superfície para existir.

---

## 3. Se for para escolher uma só

**A + C.** A é o único tratamento que ataca simultaneamente os três defeitos medidos (razão 1,25×, 0% de área, ritmo item/linha de 2,5×), usa vocabulário que este dono já aprovou duas vezes nesta mesma página, e não depende de aprovação de copy. C vem junto porque é gratuita e resolve o problema de dobra do item 1.5.

**B fica como a segunda rodada**, depois de o JA ver os nove lemas escritos — é a que mais melhora o funcionamento do filtro como filtro, e a única que exige o cliente na mesa.

---

## Arquivos consultados

- `/Users/joaogabrielsantosdosanjos/Documents/FORMULA-DO-BOI/pagina-eao/src/app/femeas/_components/ParaQuem.tsx`
- `/Users/joaogabrielsantosdosanjos/Documents/FORMULA-DO-BOI/pagina-eao/src/app/femeas/_lib/copy.ts` (`paraQuem`, e a nota `[JA]` de densidade acima de `categoriasSecao`)
- `/Users/joaogabrielsantosdosanjos/Documents/FORMULA-DO-BOI/pagina-eao/scripts/femeas/README.md`

Medições feitas com Chromium headless contra `http://localhost:3000/femeas` (servidor já em pé, nenhum outro subido), viewports 390×844 e 1440×900, `reducedMotion: reduce`.
