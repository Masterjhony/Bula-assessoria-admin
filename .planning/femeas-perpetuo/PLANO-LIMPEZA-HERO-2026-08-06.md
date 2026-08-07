# Plano executável — rodada de limpeza do hero e do filtro

**Data:** 06/08/2026, noite · **Branch:** `feat/femeas-perpetuo` · **Página:** `/femeas`
**Piso da rodada (último estado bom conhecido):** `6974edf`
**Servidor de dev:** já de pé em `:3000`. **Não subir outro.**

Este documento é **ordem, dependência, invariante, verificação e rollback**. Ele
não mede e não desenha — as duas coisas são de outras equipes, e as saídas delas
entram aqui como **insumo**:

| Insumo | Quem produz | O que este plano faz com ele |
|---|---|---|
| `.planning/femeas-perpetuo/AUDITORIA-HERO-2026-08-06.md` | equipe de medição | destrava a T3 (hero) |
| `.planning/femeas-perpetuo/PROPOSTAS-FICHA-2026-08-06.md` | equipe de desenho | destrava a T4 (ficha) |

---

## 0. Estado no momento de escrever

O dono fez cinco pedidos. Três já se moveram enquanto este plano era escrito —
registrar isso é metade do trabalho, porque **rollback só existe se cada item
tiver um commit próprio**, e um deles já nasceu acoplado.

| # | Pedido do dono | Estado agora | Arquivo | Commit |
|---|---|---|---|---|
| 1 | "limpa o hero, muita informação" | **em voo, não commitado** — o eyebrow saiu | `Hero.tsx` (acima do form), `_lib/copy.ts` | — |
| 2 | "a ficha 30×/frete/R$ 0 tá horrorosa, tópicos, sem ícone" | **aberto** — espera `PROPOSTAS-FICHA` | `Hero.tsx` (`FichaTecnica`), `marcas.tsx` | — |
| 3 | "no curral eu gostei" | **nada a fazer** — vira invariante de não-toque | `Galeria.tsx`, `public/femeas/` | — |
| 4 | card elevado × card afundado | **entrou**, verificação humana pendente | `ParaQuem.tsx` | `ffe9000` |
| 5 | centralizar o fecho e o botão | **entrou**, verificação pendente | `Fecho.tsx` | `ffe9000` |

Commits da rodada anterior, que são o chão desta: `431575f` (marcas da ficha + a
régua vira script), `d734946` (prova social na árvore de títulos), `6974edf`
(barra fixa some com "reduzir movimento"). Nenhum dos quatro está publicado — a
branch está **4 commits à frente do `origin`**, o que torna reescrita de
histórico segura até o primeiro push.

**O defeito que já existe:** `ffe9000` traz os pedidos 4 e 5 **no mesmo commit**.
Reverter um reverte o outro. É a primeira tarefa deste plano.

---

## 1. (A) Sequência, com dependência explícita

```
T1 desacoplar ffe9000 ──► T2 verificar 4 e 5 (scripts + iPhone)
                                    │
AUDITORIA-HERO ─────────────────────┴──► T3 item 1 (hero acima do form)
                                                     │
PROPOSTAS-FICHA ─────────────────────────────────────┴──► T4 item 2 (ficha)
                                                                  │
                                                                  ▼
                                                  T5 verificação da rodada
                                                                  │
                                                                  ▼
                                                  T6 mensagem ao João Antônio
```

| T | Tarefa | Entrada obrigatória | Região que ela POSSUI | Saída |
|---|---|---|---|---|
| **T1** | Partir `ffe9000` em dois commits | branch não publicada | `scripts/femeas/medir-pagina.mjs` (o `REFERENCIA` vai com o commit do filtro) | 2 commits: um do filtro, um do fecho |
| **T2** | Verificar 4 e 5 | T1 | nenhuma (só lê) | veredito: mantém ou reverte |
| **T3** | Limpar o hero | `AUDITORIA-HERO` | `Hero.tsx` do `<div className="relative">` até o fim do bloco de promessa (eyebrow, h1, lead, ctaNote) + `_lib/copy.ts` | 1 commit |
| **T4** | Redesenhar a ficha | `PROPOSTAS-FICHA` **e** T3 fechada | `Hero.tsx`: `FichaTecnica` e suas duas chamadas + `marcas.tsx` | 1 commit |
| **T5** | Verificação da rodada | T3, T4 | `medir-pagina.mjs` (`REFERENCIA`) | 1 commit |
| **T6** | Mensagem ao JA | T5 | nenhuma | mensagem única, escrita |

### Por que 4 e 5 são independentes entre si

Arquivos disjuntos (`ParaQuem.tsx` × `Fecho.tsx`), nenhum importa o outro,
nenhum dos dois mora acima do formulário — logo nenhum dos dois pode mexer no
`primeiroCampo`. O único acoplamento que existe hoje é **de commit**, e T1 o
desfaz. Depois de T1 eles podem ser revertidos, revisados e reaplicados em
qualquer ordem.

### Por que 1 e 2 se tocam, e por que 1 vem antes

A ficha **mora dentro do hero**: mesma `<section id="topo">`, mesmo arquivo, e
renderizada duas vezes (desktop no pé da coluna de promessa via `sm:mt-auto`,
celular depois do formulário). Duas consequências:

1. **Mesmo arquivo → commits atômicos exigem serialização.** Nunca os dois ao
   mesmo tempo. Árvore limpa entre um e outro, senão o rollback isolado morre.
2. **A ficha é julgada CONTRA o hero que vai ao ar.** Se ela for redesenhada
   primeiro e depois dois blocos de texto saírem acima dela, o peso relativo
   dela na coluna muda e o desenho é julgado duas vezes — e foi assim que este
   elemento chegou à quarta rodada. O inverso não é verdade: cortar texto acima
   não depende de como a ficha ficou.

**Exceção que não é exceção:** no celular a ficha já está **abaixo** do
formulário. Ali ela não disputa a primeira dobra com nada, e o pedido 1 e o
pedido 2 são visualmente independentes. A dependência é de **arquivo e de
julgamento**, não de layout no celular.

### Regra de posse (dois itens, um arquivo)

Enquanto T3 estiver aberta, **ninguém toca em `FichaTecnica`**. Enquanto T4
estiver aberta, **ninguém toca no bloco de promessa**. Se um terminal já estiver
com `Hero.tsx` sujo quando este plano chegar — e está —, a regra é: **quem está
dentro termina e commita antes de qualquer outro abrir o arquivo.**

---

## 2. (B) Invariantes — cada um com o comando que prova

Os cinco que o dono já conhece estão confirmados abaixo (P1, P2, P3, P4, P5) com
os números reais lidos do repositório. Os outros nove completam a régua desta
rodada específica.

| ID | Invariante | Comando | Esperado |
|---|---|---|---|
| **P1** | `primeiroCampo` **não cresce**. Hoje **640** no celular / **399** no desktop | `node scripts/femeas/medir-pagina.mjs` | nenhum `⚠️ PIOROU` na linha `primeiroCampo` |
| **P2** | Exatamente **1 `<form>`** na página (INV-7 — o fecho manda para `#cadastro`, nunca duplica) | `node scripts/femeas/medir-pagina.mjs` · e no DOM: `curl -s localhost:3000/femeas \| grep -o '<form' \| wc -l` | `1` |
| **P3** | **9 critérios** (5+4) e **6 cartões** de categoria seguem no DOM | `node scripts/femeas/medir-pagina.mjs` | sem os avisos de `9 critérios` / `6 cartões` |
| **P4** | **Nenhuma seção reprova na régua** (ou 2,0× de razão tipográfica, ou ≥3% de área não-texto) | `node scripts/femeas/medir-densidade.mjs` | `0` reprovadas nos dois viewports |
| **P5** | **Sem rolagem lateral em 390** | `node scripts/femeas/medir-pagina.mjs` | `rolagemLateral: false` |
| **P6** | **Copy fora do componente** (INV-5): nenhuma string comercial nova no JSX | `grep -rn "30x\|R\$ 0\|Frete grátis" src/app/femeas/_components/ \| grep -v "//"` | vazio |
| **P7** | **Galeria intocada** (pedido 3 é "não mexe") | `git diff --name-only 6974edf..HEAD \| grep -i "galeria\|public/femeas"` | vazio |
| **P8** | **Touros e São Geraldo intocados** (INV-8, estão em produção convertendo) | `git diff --name-only 6974edf..HEAD \| grep -E "app/(touros\|saogeraldo)"` | vazio |
| **P9** | **AA sobre o scrim do hero.** O h1 subiu ao sair o eyebrow, e o fundo dali é degradê: quem mexe na posição do texto mexe no contraste dele | `node scripts/femeas/capturar-secoes.mjs` + amostragem de pixel pelo método de `public/femeas/README.md` | texto grande ≥3:1, texto <24px ≥4,5:1 |
| **P10** | **O par semântico segue casado.** Era 6,29:1 (oliva) e 6,23:1 (terracota) sobre o mesmo pergaminho — delta 0,06. Agora os fundos são diferentes | mesmo método de P9, medindo cada título contra o **seu próprio** card | ambos ≥4,5:1 **e** delta ≤ **0,5** |
| **P11** | **O algarismo do filtro não encolhe.** É ele que faz `#para-quem` passar na régua (2,0×); cartão que espreme o número derruba P4 | `grep -n "clamp(32px, 3.6vw, 38px)" src/app/femeas/_components/ParaQuem.tsx` + P4 | presente, e P4 verde |
| **P12** | **Tipos limpos** sem derrubar o dev que está de pé | `npx tsc --noEmit` | sem erro. **Não** rodar `npm run build` com o `:3000` rodando |
| **P13** | **A medição não regrediu** (a rodada é visual, mas mexe em `#cadastro` e no `#fecho-cta`) | `node scripts/femeas/medir-medicao.mjs` | `femeas_mql` e `femeas_lead` nas duas páginas de obrigado. `Meta /tr: NENHUM` é esperado em headless |
| **P14** | **Alvo ≥44px e foco visível** (INV-6) — o botão do fecho mudou de caixa | DevTools no botão centralizado e no link de escape do filtro | altura ≥44px, anel de foco visível no `Tab` |

### Duas armadilhas de comando, para os gates não mentirem

- **`grep -c` conta LINHAS, não ocorrências.** O HTML do Next vem numa linha só,
  então `curl ... | grep -c '<form'` devolve `1` mesmo com dois formulários.
  Use `grep -o ... | wc -l`. (O `T10.2` do `PLAN.md` tem essa falha; P2 acima é a
  versão correta.)
- **Comentário conta como ocorrência.** Este repositório comenta muito: `grep -c
  "border"` em `ParaQuem.tsx` devolve **3** hoje, e os três são código. Ao usar
  contagem como portão, filtre antes (`grep -v "//"`) e diga o número esperado —
  senão o próprio comentário que explica o portão o invalida.

### A catraca do `primeiroCampo`

`REFERENCIA` em `medir-pagina.mjs` **só desce**. Se um corte no hero fizer o
número cair (é o efeito esperado da T3), **baixe a referência no mesmo commit**.
Sem isso o ganho vira crédito, e a próxima rodada gasta os pixels de volta sem
que nenhum script reclame. Subir a referência do `primeiroCampo` é proibido em
qualquer circunstância; as demais chaves (`paraQuem`, `pagina`, …) acompanham a
mudança e vão sempre **no mesmo commit** que as causou.

---

## 3. (C) O risco de cada pedido, com o precedente do repositório

### 3.1 · Pedido 1 — limpar o hero mexe em COPY, e a copy tem dono

**O precedente:** `_lib/copy.ts` está em `v2`, revisada pelo João Antônio em
05/08. A rodada de 06/08 **já cortou sem ele**: `hero.lead` de 37 → 21 palavras
e `hero.ctaNote` de 16 → 11, ambos marcados no arquivo como *"pendente do JA"*.
A janela de revisão dele é **antes de 13/08**. Esta rodada é o **segundo** corte
sobre texto que ele ainda não leu — e cada corte novo aumenta a chance de ele
revisar uma página que já não existe.

**A regra do arquivo, que separa o que pode do que não pode:** *"a regra do corte
foi MECÂNICA, NÃO EDITORIAL, e é isso que a torna segura de repetir"*. Vale aqui
igual:

**Pode sair sem aval — é corte mecânico e reversível:**
- **Bloco inteiro que é redundância literal na mesma dobra.** O eyebrow
  (`MATRIZES PO NELORE · BULA ASSESSORIA`) é o caso: a logo assina *Bula
  Assessoria* 26px acima e a manchete termina em *Nelore PO* logo abaixo. Saiu
  informação zero. **Feito.**
- **Esconder por breakpoint, nunca apagar.** O precedente existe e está medido:
  `.femeas-filtro-explica` tira a segunda oração de 5 dos 9 critérios abaixo de
  640px, com **um nó de texto** partido em dois, para o leitor de tela do celular
  ouvir a versão curta e não as duas. O mesmo padrão serve ao `hero.lead`: o
  celular lê a frase que remata, o desktop lê as duas.
- **Geometria** — vão, agrupamento, ordem visual. Não é copy.
- Em todos os casos: **a redação anterior fica comentada ao lado**, como já é a
  prática do arquivo (*"nada foi apagado"*), e a string continua exportada mesmo
  sem uso, porque apagar string é a mudança mais cara de desfazer numa revisão
  que ainda não aconteceu.

**Vira proposta, não implementação:**
- **Reescrever qualquer frase.** Palavra nova é do JA, sem exceção.
- **Mexer nas duas frases do `hero.lead`.** O arquivo é explícito: elas são a
  oposição que sustenta a página (*touro melhora o que você vende / matriz faz de
  você quem vende*) e *"mexer nelas não estava em discussão"*.
- **Remover qualquer uma das três informações do `ctaNote`** — existe ANÁLISE,
  ela é CONDICIONAL, e o que se ganha é REUNIÃO COM ASSESSOR. Não é enfeite: é o
  filtro trabalhando antes do primeiro campo, e é o único ponto da primeira dobra
  que protege o KPI real (reunião agendada), não o cadastro.
- **Qualquer claim `[VALIDAR]`** — acasalamento continua pendente da equipe
  técnica.

**A prioridade que o dono pediu ("o que é de extrema importância pro cara que vai
virar lead qualificado"), do mais para o menos importante:**

1. o que está sendo vendido — `h1`;
2. que existe análise e nem todo mundo passa — `ctaNote`;
3. o que acontece depois do cadastro (reunião) — `ctaNote`;
4. a oposição touro × matriz — `lead`;
5. as condições comerciais (30× / frete / R$ 0) — a ficha.

**Consequência operacional:** se algo tem que sair da primeira dobra, sai **de
baixo para cima nessa lista**. A ficha primeiro (no celular já está abaixo do
formulário), depois o `lead`. O `ctaNote` é o **último** a sair — apesar de ser,
na descrição do dono, "mais um subtítulo". Ele parece redundante e é o oposto:
é o que faz o lead chegar qualificado.

**Risco físico, não editorial:** ⚠️ o `Hero.tsx` registra que *"quem mexe na
POSIÇÃO do texto mexe no CONTRASTE dele, porque o fundo aqui é um degradê"* — o
scrim do celular teve o primeiro stop subido de 0,72 para 0,78 na rodada
anterior justamente por causa disso. Com o eyebrow fora, a manchete subiu para
uma faixa mais clara e **o elemento crítico do topo mudou de identidade**. P9 é
obrigatório antes de fechar T3.

### 3.2 · Pedido 2 — "sem ícone" derruba uma decisão tomada há horas

**O precedente:** `431575f`, hoje, colocou **três marcas SVG** na ficha
(`MARCAS_FICHA` em `marcas.tsx`), e a justificativa foi numérica: a ficha media
**1,25× / 0,0%** no celular e **1,63× / 0,0%** no desktop — reprovava as duas
metades da régua. Subir o tipo estava fechado (a 32px+ o número volta a competir
com a manchete de 68px, que foi o defeito da rodada 1), então sobrou desenho.

**O pedido de hoje diz "sem emoji, sem ícone".** Isso derruba as marcas. É
decisão do dono e ela vale. O que o plano registra é o **custo e o que fica
proibido mesmo assim**:

⚠️ **Nenhum gate automático vai avisar se a ficha voltar a ficar fraca.** A régua
(`medir-densidade.mjs`) mede **por seção**, e `#topo` passa com folga por causa
da foto do hero (27% de área não-texto). A ficha não é uma seção. Foi medida
à parte, ad hoc. **O juiz do pedido 2 é o dono no iPhone**, e é por isso que T4
termina em conferência humana, não em script.

**Caixa de restrições para a proposta (o que já foi tentado e reprovado nas
quatro rodadas anteriores — não repropor):**

| Proibido | Por quê, medido |
|---|---|
| Ícone, pictograma, emoji, SVG | pedido literal do dono, 06/08 |
| Número em 32px+ | volta a competir com a manchete `clamp(38,6.2vw,68)` — foi a rodada 1, com 36px |
| Filete acima de cada célula | reticulava a ficha e a fazia ler como **tabela de formulário** — rodada 2 |
| Rótulo em dourado | o dourado é voltagem única e escassa (`tokens.ts`); gastá-lo em condição comercial enfraquece eyebrow, aviso e botão — rodada 2 |
| `justify-between` com valor de um lado e rótulo do outro | 330px de vão num iPhone; valor e rótulo são **um dado só** — rodada 3 |
| Encolher o valor abaixo de 20px | some dentro do próprio bloco |

**O que a proposta ainda tem disponível:** agrupamento, ordem, caixa alta,
tracking, hierarquia invertida rótulo/valor, um único filete de abertura (o que
existe hoje), e o `flex-wrap` que salva o bloco a 200% de zoom / Dynamic Type.

**Higiene de código junto:** ao remover o uso, `MARCAS_FICHA` vira código morto —
sai do `marcas.tsx` no mesmo commit, e o item 2 do rodapé daquele arquivo é
reescrito. O arquivo **não pode ficar afirmando o contrário do que o código faz**;
esse comentário já foi reescrito uma vez hoje pelo mesmo motivo.

### 3.3 · Pedido 4 — o dono reabriu uma decisão travada, e ela cede só num eixo

**A decisão travada, em três lugares:** `PLAN.md` T7.2 (*"a coluna 'não é' não
pode parecer punitiva"*), o cabeçalho de `ParaQuem.tsx` e o rodapé de
`marcas.tsx`. A razão nunca foi estética: **quem se reconhece na coluna da
direita é comprador do funil de TOUROS**, e o link de escape no pé da seção
existe para ele. Qualquer coisa que leia como erro custa o lead duas vezes —
perde aqui e não chega lá.

**Registro:** em 06/08 à noite o dono pediu card elevado à esquerda e afundado à
direita. **Ele decidiu, e a decisão vale.** A restrição não some: ela passa a
valer **só no eixo Z**.

**Continua proibido, mesmo com a decisão nova:**

- vermelho de alarme, `✓`/`✗`, acordeão escondendo a coluna da direita, a palavra
  "reprovado" ou qualquer sinônimo;
- tamanho, peso, geometria, padding e largura diferentes entre as colunas;
- tinta diferente: corpo em `light.body` **dos dois lados**, algarismos idênticos,
  títulos no mesmo tamanho — só o matiz muda, como sempre foi;
- remover critério: seguem **5 e 4**.

**Como a volta do card NÃO recria o defeito da manhã.** O que o dono reprovou
hoje cedo não era "o card": eram **dezesseis traços numa seção de nove frases** —
duas caixas brancas com borda de 1px **mais sete filetes** separando critérios
dentro delas. O que voltou foram **duas superfícies**; **os sete filetes internos
não voltaram**. Três regras derivadas disso, que o executor não pode afrouxar:

1. **Zero filete entre critérios.** O respiro (24px no celular, 30px acima)
   continua sendo o separador. Ele já era o triplo do branco entre duas linhas.
2. **A goteira não volta ao valor antigo.** Ela abriu de `clamp(16,2.4vw,28)`
   para `clamp(44,6vw,72)` quando os painéis saíram. Com card, ela **fica larga**
   — goteira estreita entre duas caixas é exatamente a densidade que ele
   reprovou.
3. **A borda de 1px é permitida e é obrigatória.** `#FFFFFF` sobre `#F5F3EF` mede
   **1,1:1**: no sol de um iPhone o card branco some e sobra sombra flutuando.
   Sombra não substitui borda. Duas bordas ≠ dezesseis traços.

**⚠️ O achado que ainda não foi medido, e que é o risco real deste item.** A
regra registrada em `ParaQuem.tsx` é que *"as duas luminâncias são casadas de
propósito — 6,29:1 e 6,23:1, e a diferença de 0,06 é invisível; se a terracota
fosse mais escura que a oliva, a coluna do 'não' pesaria mais na página"*. Com
fundos diferentes (`#FFFFFF` × `#EDEAE2`) **o par deixou de estar casado por
construção**. O commit `ffe9000` mediu o **corpo** (9,0:1 e 7,5:1) e **não mediu
os títulos**. É o que P10 cobra.

E a direção do desvio inverteu o medo original: o risco agora **não** é a coluna
do "não" pesar mais — é ela pesar **menos**, ler como desabilitada, e o filtro
filtrar menos. Isso não aparece na tela; aparece semanas depois, na fila do SDR,
como volume de lead errado — que é o problema declarado do cliente.

**Sinal de que passou do ponto** (qualquer um destes já é sinal):

1. **Medido:** delta de contraste entre os dois títulos, cada um contra o seu
   próprio card, **maior que 0,5** — ou qualquer um abaixo de 4,5:1.
2. **Medido:** o rebaixo mais fundo que o salto. Em luminância, o afundado tem
   que se afastar do pergaminho **menos** do que o elevado se afasta.
3. **Humano:** alguém lendo a coluna da direita em voz alta diz *"reprovado"* /
   *"não posso"* em vez de *"não é o meu caso"*.
4. **Humano:** o olho de quem entra na seção vai **primeiro** à coluna da direita.
   Profundidade atrai atenção; o rebaixo não pode atrair.
5. **Campo (semanas):** o link *"Ver a assessoria de touros"* para de ser clicado.
   A saída digna virou beco.

### 3.4 · Pedido 5 — centralizar cobra medida de linha

Texto centralizado perde a âncora vertical da margem esquerda: o olho tem que
reencontrar o começo de cada linha, e isso só é indolor em linha curta.

**Os tetos, em `ch`:**

| Elemento | Teto | Observação |
|---|---|---|
| `h2` do fecho | **22ch** | já era curto, intocado |
| olho (`fecho.lead`) | **44ch** | era 56ch alinhado à esquerda. **44ch é o teto para prosa centralizada** |
| `ctaNote` | **40ch** | linha única de ficha |

**E o teste que vale mais que o número:** **≤3 linhas renderizadas em 1440** e
**≤4 em 390**. Bloco centralizado é lido como **forma**, não como parágrafo; a
partir da quarta linha a leitura em zigue-zague aparece mesmo dentro do teto de
`ch`. No celular a medida real já é ~38ch (a coluna é mais estreita que o
limite), então os tetos só agem do tablet para cima.

**Riscos colaterais que o `ch` não cobre:**

- **`#fecho-cta` virou `flex flex-col items-center`.** O `StickyCta` não usa
  `IntersectionObserver` (virou conta de retângulo em 06/08, por causa de um bug
  real com `<Reveal/>`) e lê **o wrapper inteiro**, botão + nota, com
  `FRACAO_VISIVEL = 0.15`. O wrapper mudou de caixa: **conferir que a barra fixa
  ainda some no pé da página**, e conferir **com "reduzir movimento" ligado** —
  foi exatamente esse o bug de `6974edf`.
- **Alvo de toque** do botão centralizado ≥44px (P14).
- **Superfície:** o fecho é exceção registrada na régua de densidade (a âncora
  dele é o botão dourado preenchido, e bloco pintado não conta como área
  não-texto). Centralizar não muda isso — mas **não remova o botão preenchido**,
  ou a exceção deixa de ter fundamento e a seção reprova de verdade.

---

## 4. (D) O que fica de fora desta rodada — declarado

- **A galeria.** Pedido 3 é *"eu gostei"*. Não se toca — vira o invariante P7.
- **Foto nova.** Os quatro arquivos de `public/femeas/` estão todos em uso, um em
  cada lugar. Só há material novo a partir de **14–15/08**.
- **Reescrever copy.** Esta rodada **corta, esconde por breakpoint ou propõe**.
  Palavra nova é do João Antônio.
- **Os lemas por critério** (direção B da `AUDITORIA-FILTRO.md`). É a melhor
  melhoria disponível para o filtro e depende do JA. Segunda rodada.
- **Categorias, jornada, assessoria, prova social, rodapé.** Fora do pedido.
- **Reordenar seções.** A galeria logo depois do hero é decisão do dono, com o
  custo já medido e registrado em `page.tsx` (+1280px no celular até o filtro).
  Se voltar à mesa, volta por dado da fila do SDR, não por gosto.
- **`src/app/touros/`, `src/app/saogeraldo/` e suas APIs** (INV-8, em produção).
- **Formulário, API, planilha, GTM/medição.** Nada nesta rodada muda evento.
- **Performance/Lighthouse, SEO/OG, domínio.** São a Fase 10 do `PLAN.md`.

---

## 5. (E) Como desfazer cada item isoladamente

Os commits são atômicos por item. O piso da rodada é **`6974edf`**.

| Item | Commit | Como desfazer só ele |
|---|---|---|
| 4 — cards do filtro | `ffe9000` **(acoplado — ver T1)** | depois de T1: `git revert <sha-do-filtro>` |
| 5 — fecho centralizado | `ffe9000` **(acoplado — ver T1)** | depois de T1: `git revert <sha-do-fecho>` |
| 1 — hero limpo | commit de T3 | `git revert <sha-T3>` |
| 2 — ficha | commit de T4 | `git revert <sha-T4>` |
| rodada inteira | — | `git revert --no-commit` dos quatro, num commit só. **Não** `git reset --hard 6974edf`: há outros terminais na mesma branch |

### T1 — desacoplar `ffe9000`, e é a primeira coisa a fazer

A branch está **4 commits à frente do `origin`** e nada foi publicado, então
reescrever é seguro. Duas saídas, em ordem de preferência:

1. `git reset --soft ffe9000~1`, depois dois commits: um só com `ParaQuem.tsx`
   **e o trecho do `REFERENCIA` que o filtro causou** (`paraQuem`, parte de
   `pagina`), outro só com `Fecho.tsx` e o resto do `REFERENCIA`.
2. Se alguém já tiver commitado por cima: `git revert -n ffe9000`, depois
   `git checkout ffe9000 -- <o arquivo que fica>` e dois commits.

### Quatro armadilhas de rollback, todas reais neste repositório

1. **⚠️ NUNCA `git revert 431575f` para tirar as marcas da ficha.** Aquele commit
   também **criou `scripts/femeas/medir-densidade.mjs`** e reescreveu o
   `README.md` dos scripts. Revertê-lo **apaga a régua da página**. Tirar as
   marcas é uma **edição nova** (remover import, uso e `MARCAS_FICHA`), não um
   revert.
2. **`ffe9000` traz dois pedidos.** Enquanto T1 não rodar, reverter o card
   reverte o fecho. É por isso que T1 é a primeira tarefa e não a última.
3. **T3 e T4 tocam o mesmo arquivo.** Reverter T3 depois de T4 conflita em
   `Hero.tsx`. Se os dois precisarem sair, **reverta na ordem inversa** (T4,
   depois T3). Se só um precisar sair, é a posse por região (§1) que torna o
   revert limpo — respeitá-la é o que compra o rollback isolado.
4. **`REFERENCIA` anda junto com o código que mudou a altura.** Um revert de
   componente sem o revert do `REFERENCIA` deixa `medir-pagina.mjs` reprovando
   uma página correta, e a próxima pessoa perde meia hora atrás de um defeito que
   não existe. **Sempre no mesmo commit.**

---

## 6. Pronto quando

- [ ] T1 feita: `ffe9000` virou dois commits, cada pedido com o seu
- [ ] P1 a P14 verdes (P13 uma vez, no fim)
- [ ] Conferência humana no **iPhone real**, não em DevTools, com as três
      perguntas: *(a)* a hero ficou mais limpa? *(b)* a ficha parou de estar
      horrorosa? *(c)* o filtro voltou a parecer formulário?
- [ ] `REFERENCIA` atualizado no mesmo commit de cada mudança de altura, e o
      `primeiroCampo` **só para baixo**
- [ ] Nenhum `[VALIDAR]` / `[JA]` visível na página renderizada
- [ ] Comentários dos arquivos tocados atualizados — este repositório trata
      comentário desatualizado como defeito, e nesta rodada três decisões
      registradas foram derrubadas pelo dono (marcas da ficha, colunas idênticas,
      alinhamento do fecho). O arquivo não pode ficar dizendo o contrário do que
      o código faz.

## 7. A mensagem ao João Antônio (T6) — uma só, escrita

O que subiu como **corte mecânico** (feito, reversível, texto original comentado
ao lado): o eyebrow do hero, e o que a T3 fechar. O que espera **aval dele**: a
redação de `hero.lead` (já cortada de 37→21 palavras em 06/08, sem ele), a de
`hero.ctaNote` (16→11), e os nove lemas da direção B da auditoria do filtro, se
essa rodada for adiante. Janela dele: **antes de 13/08**.
