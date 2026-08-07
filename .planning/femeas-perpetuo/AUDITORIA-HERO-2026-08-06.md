# Auditoria do hero, da ficha técnica, do filtro e do fecho — `/femeas`

**Data:** 06/08/2026, 21h40–21h55 · **Branch:** `feat/femeas-perpetuo`
**Escopo:** `#topo` (hero + ficha técnica), `#para-quem` (filtro), `#fecho`. A galeria fica de fora por decisão do dono ("no curral eu gostei").
**Método:** Chromium/Playwright em 390×844 e 1440×900, animação neutralizada, medindo o DOM renderizado e amostrando pixel do print via canvas. Nenhuma linha de `src/` foi alterada por esta auditoria.

---

## ⚠️ Aviso de método: a página se mexeu DURANTE a medição

Isto não é ressalva de estilo, é condição de leitura do laudo. Três estados diferentes foram medidos em 13 minutos:

| Hora | Estado | O que estava valendo |
|---|---|---|
| 21h42 | `HEAD = 431575f` | hero com eyebrow, aviso dourado fora do card, `primeiroCampo` **640** |
| 21h48 | `HEAD = ffe9000` | entrou card elevado × card afundado no filtro **e** fecho centralizado |
| 21h51 | worktree sujo | hero sem eyebrow, aviso movido para dentro do card, `primeiroCampo` **537** |

**Consequência prática:** os pedidos **5** (card salta / card afunda) e **6** (centralizar o fecho) **já foram implementados** enquanto esta auditoria rodava, e os pedidos **1** e **2** (limpar o hero) estão sendo implementados agora, sem commit. Este laudo, portanto, faz duas coisas:

- para **A** (hero), registra o estado que o dono viu no iPhone e mede o que a mudança em curso já resolveu;
- para **C** e **D**, deixa de ser "o que o tratamento precisa respeitar" e passa a ser **conferência do tratamento que já entrou** — que é mais útil, porque agora dá para medir em vez de estimar;
- para **B** (ficha técnica), nada foi tocado: o pedido 3 continua **inteiramente aberto**, e é o único dos seis que ninguém começou.

---

## A. HERO — os níveis de informação, contados e medidos

### A.1 O estado que o dono revisou (390×844, `HEAD = 431575f`)

Sete paradas de leitura antes do primeiro campo. `y` é a distância do topo absoluto da página.

| # | Nível | Elemento | Tamanho | Família | Palavras | Altura | `y` | Linhas |
|---|---|---|---|---|---|---|---|---|
| 1 | marca | `img` logo | 75,5 × 49px | — | 0 | 49 | 21 | — |
| 2 | eyebrow | `p` + filete 22px | 11px | Oswald caixa alta | 6 | 14,3 | 96 | 1 |
| 3 | manchete | `h1` | 38px | Oswald | 8 | 116,3 | 124,3 | 3 |
| 4 | olho | `p` | 16px | Inter | 21 | 76,8 | 261,5 | 3 |
| 5 | aviso dourado | `p` + filete lateral | 15px | Inter | 12 | 46,5 | 366,3 | 2 |
| 6 | título do card | `h2` | 20px | Oswald | 3 | 22,4 | 457,3 | 1 |
| 7 | subtítulo do card | `p` | 14px | Inter | 13 | 42 | 488,5 | 3 |
| — | **primeiro campo** | `input` | — | — | — | — | **639,8** | — |

**A pessoa lê 74 palavras antes de tocar no primeiro campo.** O `primeiroCampo` confirmado é **640px** numa tela de 844 — e a viewport útil é **767px**, não 844, porque a barra fixa do CTA ocupa 77px no pé. O campo fica a 83% da tela útil.

**O dono descreveu a estrutura com precisão literal.** "Um título, um subtítulo, outro subtítulo, subtítulo do subtítulo" são exatamente os níveis 3 → 4 → 5 → 7, e há ainda o nível 2 acima do título. Cinco blocos de texto em 500px.

### A.2 Quais níveis são redundantes entre si — medido

**Redundância 1 · eyebrow contra logo + manchete.** O eyebrow dizia `MATRIZES PO NELORE · BULA ASSESSORIA`. As duas metades já estavam na tela dentro dos mesmos 200px: a logo (nível 1, 49px de altura, `alt="Bula Assessoria"`) a 75px acima, e a manchete (nível 3) terminando em "Nelore PO" a 28px abaixo. **Zero informação nova, 14,3px de altura, 6 palavras, e uma sexta parada para o olho contar.** É o bloco mais barato de cortar da página.

**Redundância 2 · o aviso dourado contra o subtítulo do card.** Os dois falam do mesmo objeto (o formulário) e ficavam a 91px um do outro:

| | Texto | Palavras | `y` |
|---|---|---|---|
| aviso (nível 5) | "Cadastro analisado pela nossa equipe · Se aprovado, reunião com um assessor" | 12 | 366,3 |
| subtítulo do card (nível 7) | "Leva uns minutos. Quanto mais claro for o seu projeto, melhor a reunião." | 13 | 488,5 |

Ambos prometem "reunião", ambos são instrução sobre o preenchimento, e ambos usam 15px/14px Inter. São **25 palavras** para dizer duas coisas. O aviso ainda carregava dourado + filete lateral, ou seja, gastava a voltagem escassa da linguagem numa linha que o card repetia logo abaixo.

**Redundância 3 · o olho contra a manchete.** Não é redundância de conteúdo — a oposição "touro melhora o que você vende / matriz faz de você quem vende" é o argumento da página. É redundância **de peso**: 21 palavras a 16px em 3 linhas de 355px, imediatamente sob uma manchete de 38px que já tem massa própria. Não é candidato a corte; é candidato a não ganhar reforço nenhum ao redor.

### A.3 O que a mudança em curso já entregou (medido às 21h51)

| Número | Antes | Agora | Δ |
|---|---|---|---|
| `primeiroCampo` (390) | 640 | **537** | **−103px** |
| palavras antes do 1º campo | 74 | **55** | **−19** |
| paradas de texto antes do card | 4 | **2** | −2 |
| altura de `#topo` (390) | 1454 | 1351 | −103 |
| `primeiroCampo` (1440) | 399 | 399 | 0 |

Isso põe o `/femeas` **abaixo** do `/touros` (633px), que é o análogo. O eyebrow saiu e o aviso dourado foi movido para dentro do card, no lugar do subtítulo — as duas redundâncias medidas em A.2, exatamente. **Não há mais o que cortar na primeira dobra sem tirar argumento.**

---

## B. FICHA TÉCNICA — o pedido 3, e ele continua inteiramente aberto

`30x no boleto` · `Frete grátis sob consulta` · `R$ 0 custo da assessoria`. No celular a ficha vem **depois** do formulário (`y = 1130`, ou 1233 no estado anterior).

### B.1 Como está hoje, COM as três marcas SVG

Bloco de **355 × 165px**, filete de 1px `rgba(255,255,255,0.12)` no topo, `padding-top` 22px, três linhas com `gap` 20px.

| Linha | Altura | Marca SVG | Valor | `x` do valor | Tinta do valor | Rótulo | `x` do rótulo | Tinta do rótulo |
|---|---|---|---|---|---|---|---|---|
| 1 | 34px | 34×34 em `x=17,5` | `30x` 20px | 65,5 | **28,7px** | `no boleto` 11px | 104,2 | **73,3px** |
| 2 | 34px | 34×34 em `x=17,5` | `Frete grátis` 20px | 65,5 | 88,6px | `sob consulta` 11px | 164,1 | 97,7px |
| 3 | 34px | 34×34 em `x=17,5` | `R$ 0` 20px | 65,5 | **36,0px** | `custo da assessoria` 11px | 111,5 | **154,7px** |

Valor em Oswald 600 `#F5F5F5`; rótulo em IBM Plex Mono 11px `#B0B0B0`, caixa alta, `letter-spacing` 0,14em.

### B.2 Como fica SEM as marcas (medido com `#topo svg{display:none}`)

| | Com marcas | Sem marcas | Δ |
|---|---|---|---|
| Altura do bloco | 165px | **132,9px** | **−32,1px** |
| Altura de cada linha | 34px | **23,3px** | −10,7px |
| `x` do valor | 65,5 | **17,5** (na margem) | −48 |
| `x` do rótulo | 104,2 / 164,1 / 111,5 | **56,2 / 116,1 / 63,5** | — |
| Área não-texto do bloco | 3.468px² = **5,9%** | **0,0%** | — |

As marcas valem 32,1px de altura e são **100% da área não-texto** do bloco. Tirá-las devolve a ficha ao estado que a régua da página reprovou em 06/08: **1,25× de razão tipográfica (20px ÷ 16px) e 0,0% de área não-texto** — o único bloco da página a falhar nas duas metades ao mesmo tempo.

### B.3 Por que ele lê como "horroroso" — quatro defeitos verificáveis, e os quatro sobrevivem à saída do ícone

**1 · A hierarquia se inverte no eixo horizontal.** O valor é o dado dominante (20px, branco, Oswald) e o rótulo é o subordinado (11px, cinza, mono). Mas medindo a **tinta real**, o subordinado é mais largo que o dominante em duas das três linhas:

| Linha | Tinta do valor | Tinta do rótulo | Razão |
|---|---|---|---|
| `30x` / `no boleto` | 28,7px | 73,3px | **2,55× a favor do rótulo** |
| `Frete grátis` / `sob consulta` | 88,6px | 97,7px | 1,10× |
| `R$ 0` / `custo da assessoria` | 36,0px | 154,7px | **4,30× a favor do rótulo** |

O tracking de 0,14em em caixa alta faz 11px ocuparem mais linha que 20px. O olho vê três linhas em que a coisa pequena é a coisa comprida. Nenhum ajuste de tamanho de fonte conserta isso sozinho — é o tracking do rótulo mono.

**2 · Duas bordas serrilhadas, não uma.** Sem as marcas, os valores alinham em `x = 17,5`, mas o ponto onde o rótulo começa salta **56,2 → 116,1 → 63,5** — uma junção interna com **59,9px de jitter**. E as linhas terminam em **129,5 / 213,8 / 218,2** dentro de uma coluna de 355px: **88,7px de raggedness à direita**, e o bloco ocupa entre **36% e 61%** da medida disponível. Três linhas curtas, desalinhadas por dentro e por fora, num vão de 355px. É a definição geométrica de "desconfigurado".

**3 · Não há coluna, e a lista é uma tabela de três colunas escrita em uma linha.** As três condições são o mesmo tipo de dado (condição comercial), e a única estrutura que as agrupa é o `gap` de 20px. Sem filete, sem numeração, sem alinhamento de rótulo, sem escala diferencial: o dispositivo de "tópico" é o ícone, e o ícone vai sair.

**4 · A competição com a manchete, que travou o tamanho em 20px, NÃO EXISTE no celular.** É o achado que libera o conserto. O comentário em `Hero.tsx` diz que subir o valor "volta a brigar com a manchete de 68px". Medido:

| Viewport | `y` da manchete | `y` da ficha | Distância | Dividem a tela? |
|---|---|---|---|---|
| 390×844 (útil 767) | 96 → 212 | 1130 → 1295 | **918px** | **Nunca** |
| 1440×900 | 175 → 383 | 863 → 968 | 480px | Só os 37px do topo da ficha |

No celular a manchete e a ficha estão a 918px uma da outra — o dono precisa rolar mais de uma tela inteira entre as duas. **O teto de 20px é uma restrição de desktop aplicada ao bloco de celular**, e foi a mesma classe de erro que a auditoria do filtro documentou (quatro rodadas julgadas no desktop, reprovadas no iPhone). Há folga real para escala no celular; não há no desktop.

### B.4 O que o novo tratamento tipográfico precisa resolver

Em ordem de tamanho do defeito medido, e todos sem ícone e sem emoji:

1. **Matar o jitter de 59,9px na junção valor/rótulo.** Ou o rótulo desce para uma linha própria (aí os três alinham em `x = 17,5`), ou ganha coluna de largura travada. Qualquer coisa que deixe o rótulo flutuar atrás do valor mantém o defeito.
2. **Desfazer a inversão de tinta.** O rótulo mono com 0,14em de tracking em caixa alta é o que faz 11px ficarem mais largos que 20px. Baixar o tracking, tirar a caixa alta, ou trocar o mono por Inter resolve pela raiz.
3. **Dar ao bloco 2,0× de razão OU ≥3% de área não-texto, sem ícone.** A folga existe e está medida: no celular o valor pode subir bem acima de 32px sem tocar na manchete (918px de distância). 32px sobre corpo de 16px = 2,0× — a régua fecha só com escala, que é o dispositivo que o dono já aprovou duas vezes nesta página (categorias e jornada) e que não é ícone.
4. **Ocupar a medida.** Hoje as linhas usam 36–61% dos 355px. Valor em cima e rótulo embaixo, com o valor grande, leva cada linha a ocupar a coluna e faz o bloco parar de parecer um resto de tabela.

⚠️ **O que NÃO fazer:** devolver filete entre as linhas. Isso já foi tentado e reprovado — os três filetes viraram um em 06/08 justamente porque reticulavam a ficha e a transformavam em formulário. O vão pede régua porque o arranjo está errado; a régua não é a resposta.

---

## C. FILTRO — conferência do card elevado × card afundado (já implementado em `ffe9000`)

### C.1 As duas superfícies, medidas

`L` é luminância relativa. Pergaminho `#F5F3EF` → `L = 0,8975`.

| | Superfície | `L` | Δ`L` vs pergaminho | Contraste vs pergaminho | Corpo `#4A4A4A` | Cor do título |
|---|---|---|---|---|---|---|
| **sim** (elevado) | `#FFFFFF` | 1,0000 | **+11,4%** | **1,11:1** | 8,86:1 ✅ | oliva 6,97:1 ✅ |
| pergaminho | `#F5F3EF` | 0,8975 | — | — | 8,13:1 | — |
| **não** (afundado) | `#EDEAE2` | 0,8234 | **−8,3%** | **1,08:1** | 7,37:1 ✅ | terracota 5,74:1 ✅ |

**AA passa nos dois lados, com folga.** O problema, onde existe, não é de contraste de texto.

### C.2 ⚠️ BLOQUEADOR — a borda de 1px não faz o que o commit diz que faz

O commit `ffe9000` justifica assim: *"A borda de 1px fica nos dois, inclusive no branco, porque #FFFFFF sobre o pergaminho #F5F3EF mede 1,1:1 — no sol do iPhone o card branco some e sobra a sombra flutuando. Sombra nao substitui borda."*

O diagnóstico está certo e confirmado — o branco mede **1,11:1** sobre o pergaminho. Mas a borda escolhida, `rgba(26,20,10,0.08)`, foi medida no pixel do print:

| Aresta | RGB medido | Contraste vs pergaminho |
|---|---|---|
| borda de topo do card **sim** | `237,237,236` | **1,06:1** |
| borda de topo do card **não** | `215,212,204` | 1,34:1 |

**A borda do card branco mede 1,06:1 — MENOS que o preenchimento branco que ela existe para resgatar (1,11:1).** A borda é uma aresta mais fraca que a ausência dela. O conserto declarado não está implementado; o que segura o card branco na página é apenas a sombra projetada, que é exatamente o que o commit diz que não basta.

Medido no pixel, abaixo do card elevado:

| Distância abaixo do card | RGB | Contraste vs pergaminho |
|---|---|---|
| 6px | `209,206,201` | **1,42:1** |
| 18px | `228,225,220` | 1,18:1 |
| 40px | `243,241,237` | 1,01:1 |

A elevação inteira é uma banda de **~24px com pico de 1,42:1**. É o único sinal real do card "sim" — e ele desaparece por completo a 40px. Numa tela de iPhone sob sol, 1,42:1 numa banda de 24px é o primeiro sinal a se perder.

**Correção mínima:** a borda do card branco precisa medir pelo menos o que o pergaminho mede contra o branco, ou seja `≥1,11:1` — na prática, `rgba(26,20,10,0.14)` ou mais escura. Abaixo disso a borda é decorativa e a promessa do commit não se cumpre.

### C.3 Onde está a fronteira entre "afundado" e "punitivo", em números

A decisão travada que está escrita no próprio `ParaQuem.tsx`: *"se a terracota fosse mais escura que a oliva, a coluna do 'não' pesaria mais na página, que é exatamente o efeito punitivo que a decisão travada proíbe."* Essa regra foi escrita para a **tinta**. O commit `ffe9000` moveu a assimetria para a **superfície**, que é o mesmo eixo perceptual. Então a régua vale, e ela tem três limiares — dois passam, um não.

**Limiar 1 · Direção e magnitude do desvio. PASSA.**
O card elevado está **+11,4%** de `L` acima do pergaminho; o afundado, **−8,3%** abaixo. O desvio negativo é **73% do positivo**. A fronteira defensável: o afundamento não pode exceder a elevação (razão ≤1,0). Hoje 0,73 — dentro, com folga. Se o bege descesse a `#E4DFD2` (Δ`L` −17,6%) a razão passaria de 1,5 e a coluna do "não" viraria o elemento mais pesado da seção.

**Limiar 2 · Contraste do texto sobre a superfície afundada. PASSA, e o piso é longe.**

| Superfície | Δ`L` | Corpo `#4A4A4A` | Terracota `#824D28` |
|---|---|---|---|
| `#EDEAE2` ← hoje | −8,3% | 7,37:1 | 5,74:1 |
| `#E9E5DB` | −12,6% | 7,05:1 | 5,49:1 |
| `#E4DFD2` | −17,6% | 6,66:1 | 5,19:1 |
| `#DFD8C8` | −23,1% | 6,24:1 | 4,86:1 |
| `#D8D0BD` | **−29,4%** | 5,77:1 | **4,50:1 ← piso AA** |

**A acessibilidade só quebra a Δ`L` −29,4%.** Ou seja: AA não é a restrição que limita a profundidade. A restrição é perceptual, e cai muito antes — por volta de **Δ`L` −12% a −15%** a superfície deixa de ler como "mesmo papel, pressionado" e começa a ler como campo desabilitado. **Profundidade máxima que ainda lê como direcionamento: Δ`L` ≈ −15%, ou seja `#E9E5DB`.** Hoje está em −8,3%, com margem.

**Limiar 3 · A aresta escura no topo do "NÃO". ⚠️ NÃO PASSA.**
Amostragem de pixel descendo pelo topo de cada card:

| Profundidade | Card **sim** | vs pergaminho | Card **não** | vs pergaminho |
|---|---|---|---|---|
| borda (0px) | `237,237,236` | 1,06:1 | `215,212,204` | **1,34:1** |
| 4px | branco | 1,11:1 | `225,221,213` | **1,22:1** |
| 8px | branco | 1,11:1 | `233,230,222` | 1,13:1 |
| ≥14px | branco | 1,11:1 | `237,234,226` | 1,08:1 |

A sombra interna (`inset 0 3px 9px rgba(26,20,10,0.12)`) cria uma faixa escura de **~12px atravessando o topo da coluna da negação, com pico de 1,34:1** — e é o elemento não-textual de maior contraste de toda a seção. O card afirmativo não tem nada equivalente: sua aresta correspondente mede 1,06:1.

**A fronteira, em número:** as arestas de topo dos dois cards deveriam ficar dentro de ~0,10 de contraste uma da outra. Hoje a diferença é **0,28** — a negação é a única coluna com uma barra escura no cabeçalho, e barra escura no topo de uma lista é vocabulário de "bloqueado". É aqui, e só aqui, que o tratamento encosta no punitivo. **Conserto barato:** subir a borda do card branco (o mesmo conserto de C.2 — `rgba(26,20,10,0.14)` dá ~1,20:1) e baixar a sombra interna de 0,12 para ~0,08. As duas arestas encostam em ~1,20:1 e a assimetria volta a ser só de preenchimento, que é a que passa nos limiares 1 e 2.

### C.4 ⚠️ BLOQUEADOR — no celular a comparação não existe, e o tratamento é comparativo

Medido em 390, com a barra fixa de 77px descontada (viewport útil **767px**):

| | Card sim | Card não |
|---|---|---|
| Altura | **565,4px** | **387,9px** |
| `gap` entre eles | 52px | |
| Par completo | **1.005px** = **1,31 tela útil** | |
| Seção inteira | 1.551px = **2,02 telas úteis** | |

**Os dois cards nunca dividem um quadro no celular.** É o mesmo achado que a auditoria anterior registrou para as colunas, agora repetido para as superfícies: elevação é um dispositivo **relativo** — só significa alguma coisa contra a superfície vizinha — e o telefone não mostra as duas juntas. No desktop (print conferido) o efeito funciona e a negação **não** lê como punição. No iPhone o usuário vê um card branco com sombra por 1,31 tela, rola, e vê um card bege por mais 0,5 tela. Não há comparação; há dois cards.

**Agravante, e é o único ponto assimétrico que o desktop conserta e o celular não:** no desktop `height:100%` iguala os dois em **596,8px**. No celular a coluna do "não" tem **68,6% da altura** da coluna do "sim". Somando: no iPhone a coluna da negação é ao mesmo tempo **menor (−31%), mais escura (−8,3% de `L`) e afundada, com uma barra escura no topo**. Três assimetrias empilhadas onde a decisão travada permitia uma só (matiz). No desktop é uma só, e por isso o desktop passa.

### C.5 Altura que os cards acrescentaram

| | Antes (`e4b4a75`) | Depois (`ffe9000`) | Δ |
|---|---|---|---|
| `#para-quem` @390 | 1.425 | **1.551** | **+126px** |
| `#para-quem` @1440 | 1.134 | **1.277** | **+143px** |
| Página @390 | 8.628 | 8.755 | +127 |
| `primeiroCampo` @390 | 640 | **640** | **0** |
| `topoParaQuem` @390 | 2.506 | **2.506** | **0** |

O crescimento é inteiramente o `padding` dos cards (20px no celular, 32px no desktop, × 2 lados × 2 cards). **Não custou nada em `primeiroCampo`**, porque a seção mora inteira abaixo do formulário. Custo aceito.

---

## D. FECHO — conferência da centralização (já implementada em `ffe9000`)

### D.1 Medida de linha dos elementos centralizados

`1ch` é a largura do "0" da própria fonte do elemento — e é por isso que as classes `ch` mentem.

| Elemento | Viewport | Classe | `max-width` resolvido | Largura real da caixa | Caixa em ch | **Maior linha em ch** | Linhas |
|---|---|---|---|---|---|---|---|
| `h2` 29px Oswald | 390 | `max-w-[22ch]` | 346,4px | 346px | 40,6ch | **38,7ch** | 3 |
| `h2` 50px Oswald | 1440 | `max-w-[22ch]` | 597,3px | 597px | 71,7ch | **68,5ch** | 3 |
| lead 16px Inter | 390 | `max-w-[44ch]` | 444,1px | 355px | 40,2ch | **39,9ch** | 3 |
| lead 18px Inter | 1440 | `max-w-[44ch]` | 499,6px | 500px | 56,6ch | **55,1ch** | 3 |
| nota 15px Inter | 390 | `max-w-[40ch]` | 378,5px | 355px | 40,2ch | 37,3ch | 2 |
| nota 15px Inter | 1440 | `max-w-[40ch]` | 378,5px | 379px | 42,9ch | 37,3ch | 2 |

**Três coisas que isto revela:**

**1 · No iPhone, dois dos três limites de medida são inertes.** O contêiner mede **355px**. `44ch` do lead resolve para 444px e `40ch` da nota para 378,5px — **ambos maiores que a coluna**. Só o `22ch` do `h2` morde, e por 8,6px. **Na tela em que o dono fez o pedido, a única coisa que mudou foi o alinhamento; a medida de linha não mudou um pixel.** Se a intenção era "centralizar cobra medida mais curta", no celular a cobrança não foi paga — o lead centralizado roda os **39,9ch** cheios da coluna.

**2 · O commit diz "o olho caiu de 56ch para 44ch, que é o teto para prosa centralizada". Medido, ele caiu para 55,1ch.** A classe `44ch` produz 56,6ch de caixa em Inter 18px, porque o "0" do Inter é mais largo que a média das minúsculas. O ajuste foi real (de ~72ch para ~56,6ch), mas o número declarado no commit está 25% otimista, e 55,1ch continua acima do teto de 45–50ch que prosa centralizada sustenta.

**3 · O `h2` centralizado a 68,5ch no desktop é a medida mais fora da régua da seção.** Três linhas de 532 / 571 / 527px — quase iguais, o que faz o bloco ler como texto justificado em vez de manchete. Manchete centralizada sustenta ~40ch; esta faz **68,5**. O `textWrap: balance` que entrou está equilibrando as linhas, mas equilibrar linhas longas demais não as encurta. **`max-w-[22ch]` precisaria ser algo como `max-w-[14ch]`** para produzir os ~40ch reais no desktop — e no celular isso não teria efeito nenhum, porque a coluna já é o limite.

### D.2 Órfãs criadas pela centralização

Alinhamento à esquerda esconde última linha curta na margem; centralizado, ela fica no meio da coluna, que é onde mais aparece. Medido:

| Elemento | Viewport | Larguras das linhas | Última linha |
|---|---|---|---|
| nota | 390 | 329 / **67px** | **7,6ch — uma palavra ("aprovado") sozinha no centro** |
| nota | 1440 | 329 / **67px** | 7,6ch, idem |
| lead | 1440 | 486 / 445 / **138px** | 15,6ch sob duas linhas cheias |
| lead | 390 | 346 / 352 / 252 | 28,6ch — ok |
| `h2` | 390 e 1440 | equilibradas | ok (o `balance` está trabalhando) |

O print de 390 confirma a olho: **"aprovado" fica sozinho, centralizado, embaixo do botão.** É a única órfã visível da seção e é o último texto da página. O `h2` recebeu `textWrap: balance` nesta rodada; a nota e o lead não receberam.

### D.3 Alvo de toque do botão centralizado

| Viewport | Caixa | `min-height` | `x` | Centro do botão | Centro da coluna | ≥44px? |
|---|---|---|---|---|---|---|
| 390 | 310,4 × **54px** | 54px | 39,8 | 195,0 | 195,0 | ✅ **54px, 10px de folga** |
| 1440 | 310,4 × **54px** | 54px | 564,8 | 720,0 | 720,0 | ✅ |

**Passa nos dois, e a centralização é geométrica e exata.** Ressalva de leitura, não de acessibilidade: a 390 o botão ocupa **310,4 de 355px = 87% da coluna** — na prática ele lê como barra de largura cheia, e a centralização dele é indistinguível de `w-full`. O que efetivamente mudou no iPhone foi o alinhamento do texto e do kicker, não o do botão.

---

## Placar

| Item do dono | Estado | Veredito medido |
|---|---|---|
| 1. Limpar o hero | **implementado, sem commit** | ✅ 74 → 55 palavras, `primeiroCampo` 640 → 537 |
| 2. Priorizar o que leva ao cadastro | **implementado, sem commit** | ✅ aviso de análise foi para dentro do card, no lugar do subtítulo redundante |
| 3. Ficha 30×/frete/R$ 0, sem ícone | **não começou** | ⚠️ 4 defeitos medidos, todos sobrevivem à saída do ícone |
| 4. Galeria | fora de escopo | — |
| 5. Card elevado × afundado | **implementado (`ffe9000`)** | ⚠️ passa em AA e em profundidade; falha na borda (C.2) e some no celular (C.4) |
| 6. Centralizar o fecho | **implementado (`ffe9000`)** | ⚠️ botão ✅; medida de linha inerte no celular, 68,5ch no desktop, órfã de 1 palavra |

### Os três primeiros consertos, por tamanho do defeito medido

1. **BLOQUEADOR · A ficha técnica (pedido 3) não foi tocada e é o único pedido aberto.** Ao tirar as três marcas ela volta a 1,25× / 0,0% — reprovada nas duas metades da régua da página. O tratamento novo precisa resolver o jitter de 59,9px na junção, a inversão de tinta (rótulo 4,3× mais largo que o valor em `R$ 0`) e a raggedness de 88,7px. **A folga para escala existe e está medida: no celular a manchete está 918px acima da ficha e as duas nunca dividem a tela — o teto de 20px é restrição de desktop aplicada ao bloco errado.**
2. **BLOQUEADOR · A borda de 1px do card branco mede 1,06:1, menos que o próprio branco (1,11:1).** O commit `ffe9000` declara que essa borda existe para o card não sumir no sol; medida, ela é mais fraca que o que deveria resgatar. Subir para `rgba(26,20,10,0.14)` (~1,20:1). Junto: baixar a sombra interna do "não" de 0,12 para ~0,08, para as duas arestas de topo ficarem dentro de 0,10 de contraste — hoje a diferença é 0,28 e a barra escura de 12px no topo da negação é o único ponto onde o tratamento encosta no punitivo.
3. **ATENÇÃO · No celular a comparação elevado×afundado não acontece.** Os dois cards somam 1.005px contra 767px de tela útil e nunca aparecem juntos; e ali a coluna do "não" tem 68,6% da altura da do "sim" (o `height:100%` só age no desktop). Ou o par ganha um arranjo que caiba num quadro a 390, ou a diferença de superfície é um efeito que só o desktop vê — e o dono revisa no iPhone.

### Recomendações menores

4. `max-w-[22ch]` no `h2` do fecho produz **68,5ch reais** no desktop. Para ~40ch, seria `max-w-[14ch]`; no celular não muda nada, porque a coluna de 355px já é o limite.
5. `textWrap: balance` na nota e no lead do fecho — hoje só o `h2` tem, e a nota deixa **"aprovado" sozinho** como última palavra da página nos dois viewports.
6. O commit `ffe9000` declara o olho do fecho em 44ch; o medido é **55,1ch**. `ch` é a largura do "0", não a da letra média — vale corrigir o número na documentação para a próxima rodada não decidir em cima dele.

---

## Arquivos e ferramentas

- `src/app/femeas/_components/Hero.tsx` (worktree sujo às 21h51 — auditado nos dois estados)
- `src/app/femeas/_components/ParaQuem.tsx`, `Fecho.tsx`, `Formulario.tsx` (worktree sujo)
- `src/app/femeas/_lib/copy.ts` (`hero`, `fecho`), `_lib/tokens.ts`
- `scripts/femeas/medir-pagina.mjs` e `medir-densidade.mjs` — rodados; todas as seções passam na régua e nenhum invariante quebrou
- Prints em `.planning/ui-reviews/shots/` (`.gitignore` criado no diretório — binário não vai a commit)
- Medições próprias: Chromium/Playwright contra `http://localhost:3000/femeas`, 390×844 e 1440×900, `reducedMotion: reduce`, amostragem de pixel via canvas sobre o screenshot. Os scripts temporários foram removidos ao fim.
