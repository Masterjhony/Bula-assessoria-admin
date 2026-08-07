# A rodada visual de 06/08/2026 — `/femeas`

**Branch:** `feat/femeas-perpetuo` → mesclada na `main` em `946c669`
**Método:** tudo medido em navegador de verdade (Chromium/Playwright) em 390×844 e 1440×900, contra o servidor de dev. Nenhum número aqui é estimativa.

Este documento existe por um motivo específico: **três decisões travadas do projeto foram revertidas neste dia**, e a próxima pessoa que abrir estes arquivos vai encontrar comentários que dizem o contrário do que o código faz se ninguém registrar por quê.

---

## 1. O que o dono pediu, em ordem, e o que saiu

| # | Pedido (literal) | O que entrou | Commit |
|---|---|---|---|
| 1 | *"os ícones em CATEGORIAS estão totalmente feios e desconfigurados, retire eles"* | as seis marcas de categoria saíram; o peso visual virou algarismo de 40–52px | `6874fef` |
| 2 | *"muito texto, sem respiro, pouco visual"* (3ª vez) | redistribuição de foto, faixa na jornada, galeria edge-to-edge | `6874fef` |
| 3 | *"quero melhorar essa \[ficha\], tópicos mais visuais"* | três marcas SVG na ficha técnica | `431575f` |
| 4 | *"essa hero tá com muita informação — título, subtítulo, outro subtítulo, subtítulo do subtítulo"* | saiu o eyebrow; o aviso de análise desceu para dentro do card | `2f07ea8` |
| 5 | *"esse 30 vezes no boleto, frete grátis e zero reais tá horroroso. Procura um design em tópicos melhor, sem emoji, sem ícone"* | as marcas de 3 saíram; virou faixa de três colunas com filete | `2f07ea8` |
| 6 | *"o 'é para você' com card com sombras, um pouco 3D, como se estivesse pulando da tela; o 'não é' um pouco afundado"* | duas superfícies: branca elevada / bege rebaixada | `ffe9000` |
| 7 | *"centraliza a última seção inteira"* | fecho centralizado, botão incluído | `ffe9000` |
| 8 | *"coloque borda arredondada e um pouquinho mais de sombra"* | `radius.card` = 16px, sombra um degrau acima | `19c62e6` |
| 9 | *"o forms quero fundo liquid glass para dar leveza à primeira sessão"* | card do formulário translúcido, com blur ≥640px | `0355454` |
| 10 | *"aumente a sombra e a opacidade para parecer vidro mesmo"* | sombra projetada, dois fios de luz, blur 44px, base 0,52 | `1eea120` |

⚠️ **O pedido 3 foi desfeito pelo pedido 5, no mesmo dia.** As marcas da ficha viveram algumas horas. O desenho está preservado em `431575f` e a lição está em `marcas.tsx`.

---

## 2. Os números que mudaram

### `primeiroCampo` — o número sagrado da página

Distância do topo até o primeiro campo do formulário, no celular. Mede quanto a pessoa precisa rolar antes de começar a preencher.

```
1113 → antes de tudo
 950 → depois do carrossel de categorias
 763 → depois de a ficha técnica sair da frente
 640 → depois do reagrupamento de espaço + corte de copy
 633 → o /touros, que é o análogo e ERA a meta
 537 → depois da limpeza da primeira dobra   ← hoje
```

**É a primeira vez que a página fica abaixo do análogo que converte.** E foi corte, não redistribuição: saiu o eyebrow (bloco inteiro) e o aviso de análise mudou de lugar. Palavras lidas antes do primeiro campo: **74 → 55**.

### O resto

| Medida | Antes | Depois | Por quê |
|---|---|---|---|
| `topoParaQuem` (celular) | 2506 | 2317 | o filtro subiu 189px porque a hero encolheu |
| `paraQuem` (celular) | 1425 | 1551 | +126 do padding dos dois cards novos |
| `paraQuem` (desktop) | 1134 | 1277 | +143, mesmo motivo |
| `pagina` (celular) | 8628 | 8566 | a hero encolheu mais do que o filtro cresceu |
| ficha técnica (celular) | ~180px empilhada | 79px em faixa | três linhas viraram três colunas |

### Densidade — a régua da página

A regra que toda seção obedece: **ou quebra 2,0× de razão tipográfica, ou carrega ≥3% de área não-texto.** Hoje todas as oito passam. A régua virou script (`scripts/femeas/medir-densidade.mjs`) — antes era uma tabela num `.md`, e tabela em `.md` não roda.

---

## 3. As três decisões travadas que foram revertidas

Cada uma tem, no código, o aviso de que foi revertida e o que **continua** proibido.

### 3.1 "Canto reto, 0 a 4px" → `radius.card` = 16px

- **Onde:** `_lib/tokens.ts`, usado só pelas duas superfícies do filtro.
- **Por quê:** pedido direto (#8).
- **O que fica:** o raio mora no token, e não solto no componente, justamente para não virar hábito — quem quiser arredondar outra coisa tem que vir ao token e ler o aviso. Botão, campo e faixa continuam em `none`/`xs`/`sm`.

### 3.2 "Sem glass/blur, sem sombra suave" → o card do formulário é vidro

- **Onde:** `Formulario.tsx`, classe `.femeas-card-vidro`. Um elemento só.
- **Por quê:** pedidos #9 e #10.
- **O que fica:** dois escapes obrigatórios, os dois testados — navegador sem `backdrop-filter` (`@supports`) e usuário com "reduzir transparência" ligado recebem o card **sólido** `#141414`. Sem eles, o primeiro caso vira texto de formulário direto sobre foto de boi.

### 3.3 "As duas colunas do filtro têm tratamento idêntico" → uma salta, a outra afunda

- **Onde:** `ParaQuem.tsx`, objeto `superficie`.
- **Por quê:** pedido #6.
- **O que fica proibido, e não mudou:** vermelho de alarme, ✓/✗, acordeão, e qualquer coisa que leia como reprovação. **A tinta é idêntica nos dois lados** — corpo, título, algarismo e geometria são os mesmos. O que mudou foi a superfície debaixo do texto.
- **⚠️ O risco inverteu de sinal.** A preocupação antiga era o "não" pesar mais e soar punitivo. Agora ele pesa **menos** — e a coluna que existe para desqualificar pode filtrar menos. Isso não aparece em medição nenhuma da página: aparece semanas depois, na fila do SDR.

---

## 4. Erros de medição — a parte mais reaproveitável deste documento

Quatro medições erradas neste dia, todas por armadilha de ferramenta. Ficam aqui porque cada uma custou uma decisão de design.

| # | O que fiz | O que a ferramenta devolveu | O que era |
|---|---|---|---|
| 1 | `canvas.measureText` para a largura de "Frete grátis" | **83,0px** | mediu antes de a Oswald carregar — caiu no fallback |
| 2 | `getBoundingClientRect` no `<span>` do valor | **97,0px** | o span é `display:block` → devolveu a largura da **célula** |
| 3 | screenshot da caixa do texto para medir o fundo | luminância 0,91 | fotografou a **própria letra branca** |
| 4 | `getComputedStyle(...).color` depois de aplicar `color: transparent` | `rgba(0,0,0,0)` | o objeto é **vivo** — a leitura veio depois do override |

**A medida certa da largura de tinta é a Range API** (`range.selectNodeContents(el)` → `getBoundingClientRect`): 79,7px. Os 14px de diferença entre a medida errada e a certa quase travaram o tipo da faixa 2px abaixo do que cabe.

**E o erro nº 1 tinha um irmão mais caro:** o comentário que dizia *"nada de três colunas espremidas em 390px, onde 'Frete grátis' quebraria no meio da palavra"* nunca foi medido. Era suposição, e sustentou por rodadas o empilhamento que o dono acabou chamando de "horroroso".

### O aperto não estava onde parecia

Medindo a faixa de condições nos quatro tamanhos:

```
 390   tinta  79,7  ·  conteúdo  98,0  ·  folga 18,3
 768   tinta  79,7  ·  conteúdo 197,4  ·  folga 117,7
1024   tinta  99,8  ·  conteúdo 105,6  ·  folga  5,9   ← o ponto apertado
1440   tinta 115,2  ·  conteúdo 150,7  ·  folga 35,5
```

**Não é o iPhone.** É 1024px, onde o card de 468px já entrou na grade e o `clamp` já subiu o valor. A correção foi dar 15% mais largura à coluna do meio — a coluna mais estreita não pode ser justamente a que carrega o texto mais longo.

---

## 5. Contraste — o que está no limite

Medido amostrando o pixel real do fundo atrás de cada texto (percentil 90), com a foto ligada.

### Card de vidro do formulário

| | celular | desktop | mínimo |
|---|---|---|---|
| título do card | 13,66:1 | 10,18:1 | 3,0 |
| **linha dourada** | 6,83:1 | **4,88:1** | 4,5 |
| rótulo do campo | 14,77:1 | 9,36:1 | 4,5 |
| passo (mono) | 7,00:1 | 4,97:1 | 4,5 |
| dica de 14px | 8,19:1 | 7,03:1 | 4,5 |

⚠️ **A folga da linha dourada é 0,38 e era 0,70.** Foi ela que pagou o vidro mais forte. Não sobra para uma terceira rodada de "mais vidro" sem trocar a cor do texto ou escurecer o scrim do hero atrás do card.

⚠️ **Quando a foto nova chegar (14–15/08), esta medição tem que ser refeita.** O card mora no lado direito do hero, onde o scrim é mais fraco e o pelo branco do Nelore aparece. Foto mais clara ali reprova sem ninguém tocar numa linha de CSS.

### Cards do filtro

Corpo 9,0:1 no branco e 7,5:1 no bege. Títulos 6,97:1 e 5,74:1. Todos passam.

Dois defeitos que a auditoria pegou e foram corrigidos no mesmo dia:

- a borda do card branco era `rgba(26,20,10,0.08)` e media **1,06:1 — menos que o próprio branco sobre o pergaminho (1,11:1)**. O comentário dizia que ela salvava o card de sumir no sol do iPhone; ela era mais invisível que o problema. Foi para `0,14`;
- a sombra interna do card rebaixado desenhava uma barra de 12px a **1,34:1** no topo, contra 1,06:1 no outro card — 0,28 de diferença, quando o limite para não ler como carimbo de reprovação é ~0,10. Caiu de `0,12` para `0,08`.

---

## 6. Dois bugs que a rodada encontrou sem procurar

### 6.1 A barra fixa não sumia no pé da página — só para quem usa "reduzir movimento"

`StickyCta` guardava o **nó** que recebeu `observe()`. O `<Reveal/>` troca de árvore depois da montagem (renderiza `motion.div` e, quando `useSafeReducedMotion()` resolve para `true`, passa a renderizar um `<div>` pelado). Tipos diferentes → o React desmonta e remonta, e o observer fica olhando um nó destacado do documento.

```
sem reduzir movimento   scrollY 7784 · aria-hidden=true   (some, correto)
com reduzir movimento   scrollY 8002 · aria-hidden=false  (fica, errado)
```

O resultado era o dourado da barra empilhado com o dourado do botão do fecho — exatamente o que o comentário do `Fecho.tsx` promete que não acontece. Virou conta de retângulo, que relê o DOM e não se importa com troca de nó. **O `#cadastro` escapava por acidente** (não mora dentro de um `Reveal`); quem envolvesse o card do hero num recriaria o bug com a barra cobrindo o campo sendo preenchido.

### 6.2 A prova social estava fora da árvore de títulos

A manchete da faixa de criatórios era `<p>` — a única manchete de seção da página fora do outline. Quem navega por cabeçalho (rotor do VoiceOver, TalkBack) pulava a seção inteira. Virou `<h2>`, zero mudança na tela.

Junto: dica e mensagem de erro do formulário estavam em 12,5px — o menor texto de **leitura** da página, no único lugar onde a pessoa precisa ler para conseguir continuar. Foram para 14px, que o próprio formulário já usava em dois outros pontos.

---

## 7. O que NÃO foi feito, e por quê

### 7.1 A régua de inscrição estadual contradiz a copy da própria página — **decisão de cliente, pendente**

Achado pela avaliação de growth e conferido no código:

- o filtro convida: *"Você tem inscrição estadual, **ou está disposto a tirar**"* (`copy.ts`, `paraQuem.sim[2]`);
- o formulário reforça: *"Se você não tem, dá para resolver — marque 'não' e a gente orienta"* (`copy.ts:626`);
- o campo só oferece `['Sim', 'Não']` (`Formulario.tsx:574`);
- e `qualificacao.ts:137` rebaixa **todo mundo** que não responde exatamente `'Sim'`.

Ou seja: a página convida a marcar "não", promete orientar, e classifica a pessoa como não-qualificada — mandando o evento de menor valor para o Meta. **Precedente medido no próprio repositório: 11 de 18 leads do São Geraldo caíram só por isso.** O público declarado desta página é quem está *montando* fazenda agora, que é exatamente quem ainda não tem IE.

Correção proposta (não aplicada): opções `['Sim', 'Não, mas vou tirar', 'Não']`, e só a terceira rebaixa. **Mexe em quem vira MQL e em qual conversão dispara — é decisão de negócio, ligada à pendência C-04.**

### 7.2 A copy segue pendente de revisão do João Antônio

Nenhuma string foi reescrita nesta rodada. O eyebrow do hero e o `form.lead` deixaram de ser renderizados, mas **continuam em `copy.ts`**, sem uso — string apagada é o que ninguém consegue reconstituir numa revisão que ainda não aconteceu.

### 7.3 O item §1.5 da auditoria do filtro continua aberto — e piorou 58px

Com o topo de `#para-quem` na tela, o *"NÃO é para você se"* nasce em y=866 e a viewport útil é 768 (a barra fixa come 76). **Afirmação e negação nunca dividem quadro no celular**, e o algarismo por critério alongou a coluna do "sim". Toda saída óbvia está proibida pela decisão travada (encurtar o "sim", acordeão, duas colunas no celular). A que sobra é a Direção B da auditoria — nove lemas de 1 a 3 palavras — e ela depende do JA.

Agravante medido nesta rodada: **no celular os dois cards somam 1.005px contra 767 de tela útil.** Elevação é um dispositivo *comparativo*; o iPhone mostra um card de cada vez.

---

## 8. O que instrumentou junto

| Ferramenta | O que responde |
|---|---|
| `node scripts/femeas/medir-pagina.mjs` | alturas, `primeiroCampo`, invariantes estruturais, comparado com a referência |
| `node scripts/femeas/medir-densidade.mjs` | a régua (2,0× de razão **ou** ≥3% de área não-texto), seção por seção |
| `node scripts/femeas/capturar-secoes.mjs` | prints de cada seção em 390 e 1440 |
| `node scripts/femeas/medir-medicao.mjs` | se o GA4/dataLayer ainda dispara nas páginas de obrigado |

E o **escape do filtro ganhou UTM**: o link para o funil de touros saía pelado e chegava lá como tráfego direto, indistinguível de quem digitou o endereço. O filtro é duro de propósito, e a única coisa que justifica a dureza é que quem sai por ali não se perde — isso era afirmação sem número. Agora dá para responder quantos leads de touro vieram do filtro de fêmeas. **Se vier zero por semanas, o problema não é o filtro, é a saída.**

---

## 9. Se algo der errado, o primeiro suspeito

| Sintoma | Suspeito | Onde olhar |
|---|---|---|
| fila do SDR volta a encher de lead errado | o card do "não" pesa menos e filtra menos (§3.3) | `ParaQuem.tsx`, objeto `superficie` |
| cadastro cai sem explicação | a limpeza da hero tirou contexto demais | `git revert 2f07ea8` |
| texto do formulário fica ilegível no celular novo | a foto trocou e o vidro não foi remedido (§5) | `Formulario.tsx`, `.femeas-card-vidro` |
| lead com IE "vou tirar" não vira MQL | a contradição da régua (§7.1) | `qualificacao.ts:137` |
| rolagem travando no iPhone | `backdrop-filter` vazou para abaixo de 640px | `Formulario.tsx`, a media query |

Resguardos da mesclagem na `main`: branch `backup/main-2026-08-06` e tag `backup-main-pre-femeas-2026-08-06`, as duas em `86e441f`. O merge é `--no-ff`, então `git revert -m 1 946c669` tira a landing inteira sem desmontar os commits individuais.
