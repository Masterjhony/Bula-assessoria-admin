# Avaliação de growth — landing do perpétuo de fêmeas

**Data:** 06/08/2026
**Página:** `/femeas` (host de produção: `femeas.bulaassessoria.com`)
**KPI avaliado:** reunião agendada com assessor. Cadastro é meio, não fim.
**Gargalo declarado:** hora de assessor / SDR. Não é volume de lead.

---

## 0. Nota de método — o que foi e o que NÃO foi medido

⚠️ **Não consegui rodar o Playwright nesta sessão.** O thread não tem shell, e o
`WebFetch` não alcança `localhost`. Portanto **nenhum número desta avaliação foi
medido por mim ao vivo**. Tudo que é numérico aqui vem de uma destas três fontes,
e cada afirmação diz de qual:

1. **Medido no repo, por outra pessoa, com o script oficial** — as referências de
   `scripts/femeas/medir-pagina.mjs` (`primeiroCampo`, `topoParaQuem`, alturas de
   seção) e as medições de contraste de `public/femeas/README.md`. Trato como
   fato porque foram produzidas por ferramenta e estão versionadas.
2. **Derivado por soma dessas referências** — sempre marcado como *derivado*.
3. **Lido no código** — breakpoints, ordem de DOM, regras de validação, régua.
   Isso é leitura direta da fonte e não depende de renderização.

O que fica **sem verificação** e precisa de uma passada com Playwright antes de
qualquer mudança de layout: onde exatamente cai a linha de corte da dobra no
Safari do iPhone (barra de endereço variável), e se a ficha de condições está de
fato fora da primeira dobra no 390 (eu concluo que sim por soma, mas não vi).

### As referências que uso o tempo todo

De `scripts/femeas/medir-pagina.mjs`, bloco `REFERENCIA`:

| medida | mobile 390×844 | desktop 1440×900 |
|---|---|---|
| `primeiroCampo` (topo → 1º campo) | **537** | 399 |
| `topoParaQuem` (topo → o filtro) | **2.315** | 2.044 |
| altura do filtro | 1.551 | 1.277 |
| altura das categorias | 858 | 1.318 |
| altura total da página | **8.564** | 8.720 |

Derivados por soma (não medidos): categorias começam em ~**3.870** no mobile; a
faixa de logos (`ProvaSocial`) cai por volta de **7.000** no mobile — ou seja, a
~8,3 telas de rolagem do topo.

### Os números da mídia, e o que eles já dizem antes da página

Rodada anterior: R$ 3.398,27 · 2.941 cliques (R$ 1,16) · 116 cadastros
(R$ 29,30) · 15 qualificados (R$ 226,55).

Três leituras que mudam a ordem de prioridade deste laudo inteiro:

- **Clique → cadastro = 3,94%.** Para um formulário de **4 passos e 12 campos**,
  com CPF, inscrição estadual e campo aberto obrigatório, isso é alto — está na
  mesma faixa de uma landing de formulário curto. **O atrito não está matando a
  taxa de página.** Quem recomendar "encurtar o formulário para converter mais"
  está resolvendo um problema que esta página não tem.
- **Cadastro → qualificado = 12,9%.** É aqui que a verba morre. R$ 226,55 por
  qualificado contra R$ 29,30 por cadastro significa que **87% do investimento
  virou lead que não serve** — e cada um desses queimou triagem de SDR, que é o
  recurso escasso declarado.
- **A alavanca de maior efeito não está na página.** Se a qualificação subir de
  12,9% para 25% com o mesmo CPL, o custo por qualificado cai de R$ 226,55 para
  ~R$ 117 e a fila do SDR cai pela metade **sem cortar verba**. Nenhuma mudança
  de copy ou layout disponível nesta página tem esse tamanho de efeito. A
  variável que mexe na *composição* do lead é a **promessa do anúncio**.

Guardo isso para a seção 5, mas ele governa tudo: **esta página está razoável; o
anúncio é que está trazendo o público errado.**

---

## 1. A promessa e a dobra

### 1.1 O que o criador vê, em ordem, no 390

Lendo o DOM de `Hero.tsx` (não renderizado):

1. Foto de Nelore a pasto, banda de `clamp(300px, 44svh, 460px)` → **371px** numa
   tela de 844, com scrim pesado (medido: manchete a 11,25:1, olho a 7,95:1).
2. Logo Bula branca, centralizada, 56px de altura.
3. `h1` **"Crie a sua própria marca de Nelore PO."** em `clamp(38px, 6.2vw, 68px)`
   → **38px** no 390, `max-w-[14ch]`, `textWrap: balance` → 3 linhas.
4. Olho cinza 16px, 2 frases, ~3 linhas.
5. Card do formulário: título "Cadastro para análise", linha **dourada**
   "Cadastro analisado pela nossa equipe · Se aprovado, reunião com um assessor",
   barra "Passo 1 / 4 · Seu projeto", e o primeiro `select` em **y=537**.

⚠️ **O eyebrow saiu** (`hero.eyebrow` continua em `copy.ts` sem uso) e o aviso de
análise **mudou de casa** — foi do hero para dentro do card. As duas decisões são
de 06/08 e as duas estão certas: a segunda, em particular, é a melhor decisão de
copy da página. A frase que estabelece a regra do jogo passou a ser lida **colada
no primeiro campo**, que é onde ela decide alguma coisa.

**A dobra está boa.** `primeiroCampo` 537 numa tela útil de ~750px (844 menos a
barra do Safari) significa que a pessoa vê promessa **e** começa a preencher sem
rolar. Isso é melhor que o `/touros` (633), que é o análogo que já converte.
Nenhuma das recomendações abaixo deve ser aceita se piorar esse número sem
contrapartida declarada.

### 1.2 Isso vende? Para quem sim

**Para o criador de gado comercial com ambição de subir de categoria.** É o
público-alvo declarado e a manchete fala com ele em cheio: "sua própria marca" é
promessa de **identidade e status**, não de retorno — e status é exatamente o que
se compra num Nelore PO. O olho é a melhor coisa escrita na página:

> "Quem compra touro melhora o bezerro que vende. Quem compra matriz PO passa a
> produzir o touro que os outros compram."

Isso é uma **inversão de papel** em duas frases, e ela faz o trabalho de uma
página inteira: define o produto pela mudança de posição do comprador no mercado,
não pelo animal. Não mexer nessas duas frases. Elas são o ativo.

### 1.3 Para quem NÃO vende — e este é o defeito nº 1 da dobra

**(a) Para quem JÁ cria PO e quer ampliar.** A manchete diz "*Crie* a sua própria
marca" — uma promessa que esse comprador **já cumpriu**. Ele lê a página como
"isto é para iniciante" e sai.

E ele não é um público hipotético: o próprio formulário tem a opção
`'Já crio PO e quero ampliar o plantel'` como **primeiro** item de `form.momentos`
(`copy.ts:632`), e a régua `REGRA_FEMEAS` não o exclui de nada. É o comprador de
**maior ticket e menor custo de convencimento da página inteira** — ele já sabe o
que é PO, já tem IE, já comprou em leilão. E a primeira dobra, o filtro (item 1 do
"é para você" diz "*quer* criar") e o fecho ("todo criatório começou com alguém
decidindo *começar*") falam todos com o iniciante. **Ele lê a página inteira sem
se ver em lugar nenhum.**

**(b) Ambiguidade de "marca".** Em pecuária, "marca" é literalmente o ferro da
fazenda. Um comprador de comercial pode ler "crie a sua própria marca" como
"monte a sua fazenda" e clicar. A palavra "PO" na mesma frase resolve para quem
sabe o que é PO — e não resolve para quem não sabe, que é justamente o lead
errado. Não é motivo para trocar a manchete (o ganho para o público certo é maior
que a perda), mas é motivo para o **anúncio** carregar "registrado" e "leilão".

### 1.4 O que um comprador de matriz PO precisaria ver e NÃO vê

**1. Que a compra acontece em LEILÃO.** Não está em lugar nenhum da primeira
dobra. Está enterrado como justificativa de campo ("sem ela não há como comprar
em leilão"), nunca como **modelo do negócio**. Isso é grave por dois lados:

- *Qualificação*: "leilão" é uma das palavras mais filtrantes disponíveis. Quem
  quer ir na fazenda, ver o animal e negociar preço se autoexclui na hora. Quem
  já comprou em leilão se reconhece e sobe de temperatura.
- *Expectativa*: alguém preenche 12 campos e descobre na reunião que precisa
  disputar lance numa data marcada. Isso queima o assessor na reunião, que é o
  KPI.

**2. Um único fato verificável.** A primeira dobra tem uma logo e duas frases de
argumento. Zero prova. Num ticket alto e ciclo consultivo, a ordem de decisão é
*credibilidade → promessa → oferta*, e aqui a credibilidade só chega a ~7.000px
(derivado). Ver seção 4.1.

**3. Que existe caminho financeiro.** "30x no boleto" é a resposta de preço mais
forte que a página tem, e no mobile ela está **depois do formulário**
(`FichaTecnica className="... sm:hidden"`, `Hero.tsx:521`). A decisão de descê-la
é boa e está medida (valia ~200px de `primeiroCampo`), mas o efeito colateral é
real: **quem ainda não decidiu preencher não recebe a única condição comercial da
página.** Vira teste, não mudança direta — ver 4.5.

### 1.5 Frases concretas

**Manchete — MANTER como está.** É boa, foi aprovada e o custo de mexer é alto.
A inclusão de quem já cria PO resolve-se no olho e no filtro, mais barato.

**Olho — a frase que eu mudaria.**

*Hoje* (`copy.ts:114`, 21 palavras):
> Quem compra touro melhora o bezerro que vende. Quem compra matriz PO passa a
> produzir o touro que os outros compram.

*Substituta proposta* (33 palavras, as duas primeiras frases **intocadas**):
> Quem compra touro melhora o bezerro que vende. Quem compra matriz PO passa a
> produzir o touro que os outros compram. Começando ou ampliando, a compra é em
> leilão — com assessor Bula do lado.

**O que a terceira frase faz, e é o que a versão de 05/08 não fazia:**
- `Começando ou ampliando` — 3 palavras que devolvem à página o comprador que já
  cria PO. É a correção do defeito 1.3(a), e é a mais barata do laudo.
- `a compra é em leilão` — põe o mecanismo na primeira dobra. Filtra e alinha
  expectativa ao mesmo tempo.
- `com assessor Bula do lado` — devolve ao hero a promessa de acompanhamento que
  saiu em 06/08, **sem** reintroduzir "acasalamento", que é a promessa
  `[VALIDAR]` pendente da equipe técnica.

**O que isso custa, dito com honestidade:** reverte parte do corte de 06/08. São
~118 → ~186 caracteres, o que a 16px dentro de ~350px úteis leva o olho de ~3
para ~5 linhas → **`primeiroCampo` de 537 para ~575** (estimativa minha, não
medida — rodar `medir-pagina.mjs` antes de subir). Ainda fica **abaixo dos 633 do
/touros**. Vale porque o que entra é informação que muda *quem* preenche, e o que
saiu em 06/08 era serviço já repetido em outras duas seções.

⚠️ Se o JA recusar o crescimento, a versão mínima que salva o essencial é trocar
só a última oração e ficar em 27 palavras:
> …o touro que os outros compram. A compra é em leilão, com assessor do lado.

Aí perde-se "começando ou ampliando", e o comprador de PO ativo continua sem
lugar na dobra — mas o filtro ainda pode recebê-lo (ver 3.1).

---

## 2. O atrito está no lugar certo?

### 2.1 O mapa de esforço × valor

| ponto | o que a página PEDE | o que ela já DEU até ali |
|---|---|---|
| y=537 (1º campo) | o passo 1 inteiro: 4 respostas, uma delas dissertativa | uma manchete, duas frases, uma foto. **Zero fato.** |
| y≈1.400 (ficha) | nada | 30x no boleto, frete, R$0 assessoria |
| y=2.315 (filtro) | leitura de 9 critérios | as fotos do lote |
| y≈3.870 (categorias) | escolher mentalmente uma porta | — |
| y≈7.000 (logos) | nada | **a prova social** |

**O diagnóstico não é "pede muito".** É que **a ordem dos argumentos está
invertida em relação à ordem do esforço**: tudo que faria alguém topar 4 passos
(condições comerciais, prova, mecanismo) chega *depois* do pedido. O único ativo
de valor acima do primeiro campo é a manchete.

Isso não é fatal — 3,94% de clique→cadastro prova que funciona. Mas é onde está o
teto: a pessoa que preenche hoje é a que já chegou convencida do anúncio. Quem
chega em dúvida não tem com o que se convencer antes de ser cobrado.

### 2.2 Que campo eu tiraria do passo 1 — e por quê

Passo 1 (`STEP_FIELDS[0]`): `momento`, `categoria`, `quantidade`, `projeto`.

**`momento` — MANTER.** Melhor primeira pergunta da página. Separa "já crio PO"
de "ainda estou estudando" na primeira interação, e é uma pergunta que a pessoa
sabe responder sobre si mesma sem esforço. Abrir com ela é correto.

**`quantidade` — MANTER, é o filtro nº 1.** É o único campo do passo 1 que entra
na régua (`quantidadesForaDaFaixa: ['mais de 50 matrizes']`). E a decisão de
manter "mais de 50 matrizes" na lista está certa e bem argumentada no código:
tirar a opção não tira a pessoa, só esconde da equipe que ela chegou.

**`categoria` — ESTE É O CAMPO QUE EU TIRARIA DO PASSO 1.**

O argumento, em três partes:

1. **É a pergunta que o público declarado não tem como responder.** O público é
   "quem quer montar criatório". Esse comprador não sabe a diferença prática
   entre novilha, prenhe e pacote 3-em-1 — e a página **admite isso duas vezes**:
   criou a opção `CATEGORIA_INDECISO` ("Ainda não sei — quero orientação",
   `categorias.ts:90`) e escreveu no passo 04 da jornada "*te direciona para a
   categoria por onde faz sentido você começar*".
2. **A página só explica as seis categorias 3.300px ABAIXO do campo que as
   pergunta.** O formulário está em y=537; a seção `#categorias` em y≈3.870
   (derivado). Perguntar antes de explicar é a definição de atrito que não
   qualifica.
3. **Ela não entra na régua.** `avaliarLeadFemeas()` não olha `categoria`. Ela é
   contexto para o SDR — e contexto respondido no chute é *pior* que contexto
   ausente, porque o SDR age em cima dele.

**Para onde mover:** passo 2 ("Sua fazenda"). Ali ela convive com UF e rebanho,
que também são contexto, e quem chegou ao passo 2 já investiu — a chance de
responder com atenção sobe.

**O que se perde:** o passo 1 fica com 3 campos e a curva de esforço abre mais
leve, o que teoricamente deixa passar mais gente. Discordo que isso seja perda:
os dois campos que **de fato** desqualificam (`quantidade` e `projeto`) continuam
no passo 1, e são eles que fazem o trabalho.

**Se o JA não quiser mover** (é decisão de dado — `categoria` é o `id` gravado no
CRM e o relatório é cortado por ele), a correção de 30 segundos é reordenar as
opções para que **"Ainda não sei — quero orientação" seja a PRIMEIRA da lista**,
não a última. Hoje `CATEGORIA_OPTIONS` a coloca no fim (`Formulario.tsx:59`), e
uma opção de escape no fim de uma lista de 7 lê como último recurso. Na frente,
ela lê como resposta legítima — e a resposta honesta vale mais que a resposta
inventada.

**`projeto` — MANTER, e é o único ponto onde eu AUMENTARIA o atrito.**

É o maior atrito da página e o de maior valor declarado ("é o campo que mais pesa
na análise"). Mas a validação não sustenta a promessa:

```
const PROJETO_MIN = 10   // Formulario.tsx:65
```

**Dez caracteres.** "quero gado" passa. "boi" não passa, "bois bons" passa. Se
este campo é o que mais pesa na análise, um mínimo de 10 caracteres significa que
na prática **ele não filtra ninguém** — só produz um pedaço de texto inútil na
planilha do SDR, que ainda assim tem de ser lido.

**Proposta:** `PROJETO_MIN` de 10 → **40** caracteres, espelhado em
`src/app/api/femeas/lead/route.ts` (o comentário do arquivo avisa que os dois têm
de mudar juntos, senão passa no browser e morre no servidor).

40 caracteres é aproximadamente uma frase curta — "tenho 200 hectares em Goiás e
quero começar" tem 46. Não pede redação; pede uma frase.

**O que isso custa:** abandono no passo 1. E o custo é **exatamente o objetivo** —
é o único abandono da página inteira que é lucro. Quem não escreve 40 caracteres
sobre o próprio projeto não vai a uma reunião de uma hora com assessor.

**Como medir se exagerei:** `femeas_validation_failed` já emite `fields`
(`Formulario.tsx:208`). Se `projeto` passar a aparecer em mais de ~25% das
tentativas do passo 1, o mínimo está alto demais. O instrumento já existe; é só
olhar.

### 2.3 Onde há atrito que só CUSTA e não qualifica

**(a) `cidade` — select dependente do IBGE.** `Formulario.tsx:154-169` faz `fetch`
para `servicodados.ibge.gov.br` a cada troca de UF. O campo já é opcional, mas
fica **desabilitado** até a UF ser escolhida e mostra "Carregando…" enquanto
espera. Numa conexão de fazenda, isso é um campo que trava e uma API de terceiro
que pode simplesmente não responder (o `.catch` deixa a lista vazia, e o usuário
vê um select vazio sem explicação).

Não entra na régua. **Proposta:** trocar por `<input type="text">` opcional.
**O que se perde:** a normalização do nome da cidade na planilha — passa a haver
"Rio Verde", "rio verde" e "R. Verde" na mesma coluna. É perda real para
relatório geográfico. Por isso classifico como **segunda onda**, não prioridade.

**(b) `inscricaoEstadual` binário — e aqui está o defeito mais caro do laudo.**

O filtro da página diz (`copy.ts:239`):
> "Você tem inscrição estadual, **ou está disposto a tirar**."

O microcopy do campo diz (`copy.ts:626`):
> "Se você não tem, dá para resolver — marque 'não' e a gente orienta."

E a régua faz (`qualificacao.ts:137`):
```
if (REGRA_FEMEAS.exigeInscricaoEstadual && entrada.inscricaoEstadual !== 'Sim') {
  motivos.push('sem_inscricao_estadual')
}
```

**A copy convida quem não tem IE, e a régua o rebaixa.** As opções do campo são
só `['Sim', 'Não']` (`Formulario.tsx:574`), então quem "está disposto a tirar" —
o exato perfil que a página diz aceitar — cai em `is_mql: false`, vai para
`/obrigado-femeas-lead` e **manda ao Meta o evento de valor baixo**.

Isso não perde lead (a triagem é manual, e o comentário do arquivo é explícito
sobre isso). **Perde MÍDIA**: o algoritmo aprende a evitar quem está montando
fazenda agora, que é o público declarado da página.

E existe precedente medido no próprio repositório, citado em `qualificacao.ts:16`:
na apuração do São Geraldo, **11 de 18 leads caíram só por não ter IE**.

**Proposta concreta:** três opções em vez de duas.

```
['Sim', 'Não, mas vou tirar', 'Não']
```

E a régua só empurra `sem_inscricao_estadual` na terceira. Custo: um botão a mais
no passo 4 (o `flex gap-3` já se adapta; em 390px três alvos de 50px cabem, mas
**medir** — pode ser preciso empilhar). Ganho: copy, régua e sinal de mídia
passam a dizer a mesma coisa.

**Esta é a correção de maior impacto do laudo, e ela não é de copy — é de dado.**

**(c) Rascunho não persiste.** `useState(EMPTY)` sem `localStorage`. Quem abandona
no passo 3 e volta pelo sticky CTA recomeça do zero. Num formulário de 4 passos
isso é perda pura — não reduz atrito, reduz **desistência de quem já topou o
atrito**. Recomendo persistir tudo menos `documento`.

**(d) `email` opcional mal sinalizado.** Está entre WhatsApp e consentimento, com
"(opcional)" no rótulo em Oswald caixa-alta 12,5px. Lê como obrigatório. Menor,
mas de graça de consertar.

**(e) O que NÃO é atrito ruim e não deve ser tocado:** `documento` com dígito
verificador no passo 4. É o melhor atrito da página — vem por último (quem chegou
já investiu três passos), tem porquê ao lado ("Não consultamos crédito sem falar
com você antes"), e entra na régua. Manter exatamente como está.

---

## 3. A seção de desqualificação

### 3.1 Os nove critérios, um a um

**Antes: onde ela está.** `topoParaQuem` mobile = **2.315px**, ou ~2,7 telas de
rolagem — e **depois do formulário**. Consequência que precisa estar escrita:
**quem clica no anúncio, vê o card e preenche direto nunca lê o filtro.** O filtro
só pega quem hesita e rola.

Isso não o torna inútil — ele serve a quem hesita e dá munição ao SDR ("está
escrito na página, item 1"). Mas significa que **o filtro real desta página é o
passo 1 do formulário e a criativa do anúncio**, não esta seção. Priorizo de
acordo.

#### Coluna "É para você se" (oliva, card elevado)

| # | critério | veredito |
|---|---|---|
| 01 | "Você quer criar Nelore PO registrado e, um dia, vender genética com o seu nome." | **Ruído funcional, mas manter.** Ninguém se autoexclui. É o espelho do hero e abre a coluna com aspiração — trabalho retórico, não de filtro. ⚠️ **Mas exclui quem já cria.** Ver reescrita abaixo. |
| 02 | "Você já tem fazenda e estrutura para criar — ou está montando agora, com projeto na cabeça." | **Ruído deliberado.** O "ou está montando agora" abre para todo mundo. É inclusão intencional e coerente com `minimoDeCabecas: null`. Manter. |
| 03 | "Você tem inscrição estadual, ou está disposto a tirar." | **DESQUALIFICA DE VERDADE.** Único critério da coluna com consequência operacional. O melhor item dos cinco. ⚠️ E é o que diverge da régua — ver 2.3(b). |
| 04 | "Você quer alguém do lado para escolher o animal, montar o acasalamento e organizar a compra." | **Desqualifica por preferência.** Quem quer comprar sozinho se reconhece. Força média. ⚠️ Depende da entrega de "acasalamento", que está `[VALIDAR]` com a equipe técnica. Se a Bula não sustentar, **este critério cai junto com o cartão da assessoria** — não só o cartão. |
| 05 | "Você entende que criatório é projeto de anos, não de safra." | **Desqualifica bem.** Filtra quem quer retorno rápido, que é o público do funil de touros. Manter palavra por palavra. |

**Reescrita proposta do item 01** — é a correção do defeito 1.3(a) dentro do
filtro, custo zero de altura:

> **Hoje:** "Você quer criar Nelore PO registrado e, um dia, vender genética com o
> seu nome."
>
> **Proposta:** "Você quer criar Nelore PO registrado — ou já cria e quer subir o
> nível do plantel."

Perde-se "vender genética com o seu nome", que é bonito e é o eco do hero. Ganha-se
o comprador de maior ticket da página, que hoje lê os cinco itens e não se encontra
em nenhum. A frase do hero continua dizendo aquilo; não precisa ser dita duas vezes.

**Falta um sexto critério, e é o do modelo do negócio.** Nenhum dos nove menciona
leilão. Proposta:

> "Você topa comprar em leilão, na data do leilão, com o assessor do lado no lance."

Isso desqualifica o comportamento clássico do comprador comercial — "vou lá ver e
levo se gostar" — e alinha expectativa antes da reunião. Custo: uma frase numa
seção que **não é a mais densa da página** (127 palavras/1000px contra 315 das
categorias, conforme a auditoria registrada em `ParaQuem.tsx:255`). Cabe.

#### Coluna "NÃO é para você se" (terracota, card afundado)

| # | critério | veredito |
|---|---|---|
| 01 | "Você procura fêmea de gado comercial, para cria ou engorda." | **O melhor item da página.** É a origem nº 1 do lead errado, dita na linguagem em que a pessoa se reconhece. Intocável. |
| 02 | "Você quer dezenas de matrizes de uma vez a preço de comercial." | **Desqualifica, mas está afastando comprador legítimo no celular.** Ver abaixo — é o defeito mais fino e mais caro da seção. |
| 03 | "Você quer só uma tabela de preços." | **Boa.** É o substituto da objeção de preço que a página não pode responder. Manter. |
| 04 | "Você quer comprar hoje e receber amanhã sem falar com ninguém." | **Fraca.** Quase ninguém se reconhece nessa descrição literalmente — ninguém se acha impaciente. Custo é uma linha, então manter, mas não conta como filtro. |

**O defeito do item 02.** A regra de corte de 06/08 esconde a segunda oração
abaixo de 640px (`.femeas-filtro-explica { display: none }`, `ParaQuem.tsx:349`).
O corte foi mecânico e seguro em 8 dos 9 critérios. **Neste ele mudou o sentido.**

No desktop lê-se:
> "Você quer dezenas de matrizes de uma vez a preço de comercial. **Matriz PO não
> tem esse preço.**"

No celular — que é onde está o tráfego — sobra:
> "Você quer dezenas de matrizes de uma vez a preço de comercial."

O julgamento pretendido está em "a preço de comercial", que é o **fim** da frase e
é a parte que ninguém aplica a si mesmo (ninguém acha que quer pagar preço de
comercial; acha que quer um preço justo). O que fica de fato lido é
**"não é para quem quer dezenas"** — que é exatamente o que a revisão do João
Antônio de 05/08 proibiu, quando ele mandou tirar "e criatório sério não começa
por volume".

O comprador que se perde aqui é o de **maior LTV da página**: o cara com caixa
para 30 matrizes. **Custa duas vezes**, porque ele também não vai para touros.

**Reescrita proposta** — move o julgamento para o começo da frase, onde o corte
mobile não o alcança:

```ts
{
  criterio: 'Você espera pagar por matriz PO o preço de uma fêmea comercial.',
  explicacao: 'Matriz PO não tem esse preço, em nenhuma quantidade.',
}
```

O critério visível no celular passa a julgar **só o preço**. A explicação, no
desktop, passa a **proteger explicitamente o comprador de volume** ("em nenhuma
quantidade" diz: o problema nunca foi quantos você quer).

⚠️ Regra geral que vale registrar: **o corte mobile é seguro quando a segunda
oração é justificativa; é perigoso quando o critério carrega a qualificação no
fim da frase.** Revalidar os 9 sob essa lente sempre que a copy mudar.

### 3.2 O link de escape

```
escape: 'Procura touro para melhorar a vacada que você já tem? Esse é o nosso
         outro trabalho, e ele é bem mais rápido.'
escapeCta: 'Ver a assessoria de touros'
escapeHref: 'https://touros.bulaassessoria.com'
```

**Posição: certa.** Pé da seção, atrás de um filete, depois das duas colunas. Quem
se reconheceu à direita chega nele naturalmente. No mobile as colunas empilham,
então o "não é para você" fica imediatamente acima do escape — que é o melhor
arranjo possível. Não mexer.

**Escrita: boa, com duas correções.**

1. "**Esse é o nosso outro trabalho**" é frio e vago. "Trabalho" não diz nada ao
   leitor, e este é o momento em que a página precisa **transferir** a confiança
   que acabou de construir para outro domínio inteiro.
2. "**e ele é bem mais rápido**" está certo — é o diferencial real do outro funil
   — mas descreve o processo, não o que a pessoa ganha.

**Substituta proposta:**
> "Procura touro para melhorar a vacada que você já tem? É a mesma equipe, num
> processo bem mais curto — e é para lá que a gente te leva."

"A mesma equipe" faz a transferência de confiança. "É para lá que a gente te leva"
mantém o tom de acolhimento (a decisão travada diz que a coluna do "não" não pode
ler como reprovação) e evita "é lá que você **deve** começar", que soaria como
veredito.

⚠️ Não usei "mesmo parcelamento" nem nenhum claim sobre as condições do outro
funil. Se o `/touros` de fato oferece 30× no boleto, "mesma equipe, mesmas
condições" é mais forte — mas isso é **[VALIDAR — precisa do cliente]**, não
posso afirmar.

**⚠️ E o defeito de medição, que é o mais importante desta subseção:**

`escapeHref` é uma URL **sem nenhuma UTM**. Quem sai daqui chega em
`touros.bulaassessoria.com` como **tráfego direto**, e a mídia não consegue
atribuir nada.

Consequência: **o escape é a única coisa que justifica o filtro ser tão duro** — a
tese inteira é "quem não serve aqui vale mais lá" — e hoje **não existe um único
número que prove que ele funciona.** Se ninguém clica, o filtro está só perdendo
lead; se muita gente clica, o filtro está pagando o próprio custo. Não dá para
saber.

**Correção, barata:**
```
escapeHref: 'https://touros.bulaassessoria.com/?utm_source=femeas&utm_medium=escape&utm_campaign=perpetuo'
```
E, se der, repassar as UTMs originais da sessão (o `captureUtms()` já existe em
`_lib/utm.ts`) para o clique herdar a origem de mídia real. Somar a isso um
`trackFunnel('femeas_escape_touros')` no clique fecha o loop do lado de cá.

---

## 4. O que falta para converter, na ordem em que eu faria

### 4.1 PRIMEIRO: prova social — mover o que existe, depois pedir o que falta

**O estado hoje.** 10 logos de criatório, em marquee, sem número, em y≈**7.000**
no mobile (derivado). Numa página de 8.564px, a prova chega **na oitava tela de
rolagem** — depois do filtro, das categorias, da jornada e da assessoria.

A reescrita de 06/08 acertou o defeito grave (o eyebrow agora diz
"CRIATÓRIOS ATENDIDOS PELA BULA", ou seja, a **atribuição** está visível e não só
no `aria-label`). Sem isso a faixa não provava nada sobre a Bula. Bom conserto.

O que falta é **posição** e **substância**, nessa ordem.

**(a) Mover `ProvaSocial` para logo DEPOIS de `ParaQuem`** (entre o filtro e as
categorias). Aproxima a prova de ~7.000 para ~3.870 (derivado) — **corta 3.100px
de distância** — e não custa **um pixel** de `topoParaQuem`, porque entra depois
do filtro.

E a lógica narrativa fica melhor do que está: quem acabou de se reconhecer na
coluna do "sim" recebe imediatamente a prova de que existem criatórios formados
atendidos pela Bula. **Valida o "sim" que ele acabou de dar por dentro.**

⚠️ Custo de superfície: hoje a sequência de fundos é `filtro (pergaminho) →
categorias (#0D0D0D)`. Inserindo a prova (`#0D0D0D`) no meio, ela encosta nas
categorias, que também são `#0D0D0D` — dois blocos escuros colados, exatamente o
problema que a galeria teve. Solução já usada na página: subir a prova para
`#141414`, como a `Assessoria` e a `Galeria` fazem. **Uma linha.**

**(b) Pedir UM número ao cliente.** [VALIDAR — precisa do cliente] A pendência
C-07 já existe. Em ordem de valor para *esta* página:

1. **Nº de criatórios de Nelore PO que a Bula ajudou a MONTAR** — não "atendidos".
   "Montar" é palavra por palavra a promessa do hero. É o número certo.
2. Nº de matrizes PO compradas com assessor Bula em leilão nos últimos 12 meses.
3. Nº de leilões acompanhados por ano / anos de atuação.

Formulação pronta para quando o número chegar — encaixa sem tocar no componente,
porque `ProvaSocial.tsx` já lê `eyebrow` e `title` de `copy.ts`:

```ts
eyebrow: 'CRIATÓRIOS ATENDIDOS PELA BULA',
title: '[N] criatórios começaram assim. Hoje vendem genética com o nome deles no catálogo.',
```
⚠️ **[VALIDAR — precisa do cliente]**. Não subir sem o número confirmado.

**(c) O que eu pediria ANTES do número: um depoimento nomeado.**

Se eu pudesse pedir **uma coisa só** ao cliente, não seria a estatística — seria
**um criatório da faixa, com nome, cidade e uma frase** sobre por onde começou.
Formato: áudio de WhatsApp de cliente já atendido, transcrito.

Por quê: é o único ativo que responde **três objeções ao mesmo tempo** — preço
(alguém como eu conseguiu), risco (deu certo) e prova (tem nome e cidade). E é de
graça de produzir. Um número diz que a Bula é grande; um nome diz que **funcionou
para alguém parecido comigo**, que é a única pergunta que o comprador de ticket
alto está fazendo.

Formato proposto, uma frase, sob a faixa de logos:
> "Comecei com [N] matrizes e um projeto na cabeça. Hoje meu nome está no
> catálogo." — [Nome], [Criatório], [Cidade/UF]
⚠️ **[VALIDAR — precisa do cliente]**, inclusive a autorização de uso do nome.

### 4.2 SEGUNDO: a objeção de preço, sem dizer preço

A decisão de não ter preço está travada e eu não a contesto. Mas o custo dela
precisa estar escrito: **a pessoa preenche 12 campos sem saber se cabe no bolso
dela**, e o abandono causado por isso é invisível — acontece *antes* do
`femeas_form_started`, então não aparece em nenhum evento.

Três alavancas que respondem preço sem dar preço:

**(a) "30x no boleto" está no lugar errado no mobile.** É a resposta de preço mais
forte que a página tem e ela vem *depois* do formulário. Não mudo direto — o
custo em `primeiroCampo` e a queixa do dono sobre paradas no hero são reais. **Vira
variante de teste** (4.5).

**(b) Dar uma régua RELATIVA na seção de categorias.** `categorias.ts:9` registra
que "a ordem é a de CUSTO DE ENTRADA crescente, do mais acessível ao mais caro" —
e essa informação, que é **exatamente a que o leitor procura**, não está escrita
em lugar nenhum da tela. Ela existe só no comentário do código.

Proposta, acrescentando à `nota` da seção (`copy.ts:335`):
> **Hoje:** "Todas as categorias podem ser parceladas em 30× no boleto, com frete
> grátis sob consulta."
>
> **Proposta:** "As seis estão em ordem de desembolso, da menor entrada para a
> maior. Todas podem ser parceladas em 30× no boleto, com frete grátis sob
> consulta."

Dá ao leitor uma escada sem dar um único número, e transforma a seção de "seis
opções que não sei diferenciar" em "seis degraus, escolho pelo meu caixa".
⚠️ **[VALIDAR]** — o próprio `categorias.ts` marca a ordem como pendente de
confirmação do João Antônio. Se a ordem real não for essa, esta frase não pode
subir.

**(c) Tirar o medo do pedido mínimo.** O `porques.rebanho` já faz isso muito bem
para o rebanho ("Não existe número mínimo"). O campo `quantidade` **não tem
`porque` nenhum** — e é justamente onde a pessoa se pergunta "quantas eu preciso
comprar para eles me atenderem?".

Proposta de `porques.quantidade` (campo novo):
> "Não existe pedido mínimo. A gente conversa a partir do que você pode agora."

Isso é seguro (não promete preço, não promete número) e responde a objeção
silenciosa mais provável do formulário. Se o cliente confirmar que já houve
criatório iniciado com uma única matriz, a versão forte é "Tem criatório que
começou com uma" — **[VALIDAR — precisa do cliente]**.

### 4.3 TERCEIRO: risco e garantia

O risco desta página **não é dinheiro** — a reunião é grátis e isso já está dito
em três lugares (`jornada.passos[2]`, `obrigado.comum.ressalva`, `hero.stats`).
O risco real é **dado**: "vou entregar meu CPF e minha inscrição estadual para um
site que vi no Instagram".

Metade já está respondida, e bem, no `porques.cpf`:
> "Não consultamos crédito sem falar com você antes."

Falta a outra metade: **o que acontece com o dado se o cadastro não for aprovado.**
A linha que existe hoje no pé do formulário é genérica:
> `ui.sigilo: 'Seus dados ficam só com a Bula.'`

**Proposta:**
> "Seus dados ficam só com a Bula e não são repassados a terceiros."

Evita de propósito qualquer promessa sobre leiloeiras — porque
`assessoria.itens[2]` diz que "o cadastro nas leiloeiras é feito por nós", ou
seja, **há** repasse previsto no fluxo de compra. Uma frase como "não vão para
leiloeira nenhuma" seria uma promessa que o serviço contradiz. ⚠️ Se o time
quiser algo mais forte, precisa ser redigido junto com quem conhece o fluxo de
habilitação — **[VALIDAR]**.

### 4.4 QUARTO: urgência — e por que ela é a ÚLTIMA da lista

Não há nenhuma, e é funil perpétuo. A urgência disponível e **honesta** é a do
calendário de leilão: a compra acontece em leilão, leilões têm data, e catálogo
esgota. Isso é verdadeiro por construção, não inventado.

Formulação possível, no `fecho.ctaNote` ou no `submitNote`:
> "A compra acontece em leilão, e leilão tem data. Quanto antes a reunião, mais
> catálogo você tem para escolher."
⚠️ **[VALIDAR — precisa do cliente]** que o calendário sustenta isso.

**Mas eu deixaria por último, e o motivo é o gargalo.** Urgência acelera volume.
O recurso escasso declarado é **hora de assessor**. Acrescentar urgência a um
funil cujo gargalo é a capacidade de atendimento é otimizar o lado errado da
equação — enche mais rápido uma fila que já não vaza. Só depois que a taxa de
qualificação subir é que urgência vira ganho em vez de problema.

### 4.5 O que eu CORTARIA

Pouca coisa, e isso é elogio à página.

- **Nada de copy essencial.** Os nove critérios ficam todos (cortar critério é
  cortar o filtro).
- **`cidade` como select IBGE** → input de texto. Perde-se normalização
  geográfica. Segunda onda.
- **A `explicacao` escondida do critério 02 do "não"** — não corto o corte, corrijo
  a frase (3.1). O corte foi certo em 8 de 9; o nono precisa de reescrita.
- **Dependência registrada, não corte:** se a equipe técnica não sustentar
  "Acasalamento" (`[VALIDAR]` em `assessoria.itens`), cai o cartão **e** o
  critério 04 da coluna do "é para você", que também o promete. Os dois têm de
  sair juntos — deixar o critério sem o serviço é prometer na página o que a
  reunião vai desdizer, e desdizer na reunião é queimar o KPI.

### 4.6 O TESTE que eu rodaria PRIMEIRO — e por que NÃO é um A/B de página

**A conta de amostra, primeiro.** Base atual de clique→cadastro: 3,94%. Para
detectar um *lift* relativo de 20% (3,94% → 4,73%) com poder 80% e alfa 5%, são
da ordem de **~9.500 sessões por braço** — a R$ 1,16 o clique, **~R$ 11 mil por
braço, R$ 22 mil no teste**. A rodada inteira anterior custou R$ 3.398.

**Conclusão dura: um A/B clássico de conversão de cadastro nesta página é
inviável com esta verba.** Qualquer "vencedor" declarado com 116 conversões vai
ser ruído lido como sinal. Não rodar.

**O teste que eu rodaria: promessa do ANÚNCIO, medida por qualificação.**

Duas criativas, mesma URL, `utm_content` diferente:

- **Braço A — promessa de identidade** (a atual, espelho da página):
  > "Crie a sua própria marca de Nelore PO."

- **Braço B — promessa de mecanismo + filtro embutido:**
  > "Matriz Nelore PO, comprada em leilão com assessor do lado. O cadastro é
  > analisado — nem todo mundo passa."

**Métrica primária: reuniões agendadas por R$ mil investido.** Não CPL. Não CPA
de cadastro. **Reunião.**
**Métricas secundárias:** % `is_mql=true`, % aprovado na coluna do SDR, e o mix de
`momento`/`quantidade` de cada braço.

**Por que isto é detectável e o A/B de página não é:** a taxa que estou medindo é
12,9% (cadastro→qualificado), não 3,94%. E a hipótese não é de lift de 20% — é de
**dobrar**. Efeito grande sobre base grande precisa de amostra pequena: **~60
cadastros por braço** bastam para separar 13% de 26% com confiança razoável. Isso
cabe em uma rodada de verba parecida com a anterior.

**Hipótese explícita, para não haver dúvida sobre o que é vitória:** o braço B
traz **menos** cadastro e **mais** reunião. Se o CPL de B subir e o custo por
reunião cair, **B ganha**. Quem olhar só o CPL vai declarar A vencedor e vai
estar errado.

**Se B ganhar, a página muda para acompanhá-lo:** "leilão" sobe para o hero
(que é a proposta 1.5), e o aviso de análise ganha ainda mais peso.

**Se eu tivesse um segundo teste** (não é o pedido, mas registro para não se
perder): variante do passo 1 — A = atual; B = sem `categoria` e com
`PROJETO_MIN = 40`. Métrica: `femeas_step_reached step=2` sobre
`femeas_form_started`, que é uma taxa alta (provavelmente 40–70%) e portanto
detectável com poucas centenas de sessões, não milhares. A instrumentação para
isso **já existe e já está no ar** (`Formulario.tsx:204-214`), o que torna o teste
quase gratuito.

---

## 5. O anúncio e a página

### 5.1 A promessa que o anúncio PRECISA fazer

Quatro elementos. Faltando qualquer um, a página herda um problema que ela não
consegue resolver sozinha:

1. **A palavra que separa: "PO" ou "registrado".** Sem ela chega comprador de
   comercial — que é literalmente o que aconteceu na rodada anterior. Não é
   opcional, é a única barreira de vocabulário disponível.
2. **O mecanismo: "em leilão, com assessor".** Filtra quem quer negociar na
   fazenda e quem está caçando preço. É a segunda palavra mais filtrante depois
   de "PO".
3. **O processo: "cadastro analisado" / "reunião".** Isso **pré-vende o atrito
   antes do clique**. Sem isso, o formulário de 4 passos lê como erro de
   construção; com isso, lê como seleção — e seleção é desejável para quem é o
   público certo.
4. **O destinatário: "para quem quer montar criatório próprio — ou ampliar o
   plantel PO".** A segunda metade recupera o comprador ativo (1.3a).

### 5.2 A promessa que faria a página FALHAR

- **Qualquer preço, inclusive "30× no boleto" como manchete.** Parcelamento como
  chamada atrai comprador de preço, e esta página **não tem preço para entregar**.
  O clique morre na dobra e a pessoa sai achando que foi enganada. É a pior
  criativa possível para esta landing, e é tentadora justamente porque converte
  clique barato.
- **"Fêmea Nelore" sem "PO".** Traz o comercial. Já custou uma rodada.
- **"Lote de matrizes", "vacas prenhas", qualquer promessa de volume.** Traz o
  perfil "50 a 70 cabeças a preço de comercial", que é a origem nº 2 do lead
  errado.
- **Retorno rápido: "aumente o valor do seu bezerro", "renda em 12 meses".** Essa
  é a promessa do funil de **touros**, e a copy da página é explícita sobre a
  diferença de tom ser deliberada (`copy.ts:49-54`). Aqui ela atrai quem vai
  reprovar no critério 05 do filtro — só que depois de já ter custado triagem.
- **"Fale com um especialista no WhatsApp".** Não existe WhatsApp direto (decisão
  travada) e o KPI é reunião. O clique chega procurando um botão que a página não
  tem, e o abandono é total.

### 5.3 Público do Meta

Em ordem de valor esperado:

**1. Dados próprios — o ativo mais barato e o que mais falta.**
   - *Retargeting qualificado:* visitantes de `/femeas` que chegaram ao filtro ou
     dispararam `femeas_form_started` e **não** converteram. Esse público já se
     autoqualificou por comportamento e é o mais barato de reengajar.
   - *LAL 1% de COMPRADORES, não de leads.* Semelhante construído sobre quem
     efetivamente comprou matriz em leilão com a Bula. Semelhante de lista de
     lead ensina o algoritmo a achar mais gente que **preenche formulário**;
     semelhante de comprador ensina a achar quem **compra**. A diferença é toda a
     diferença neste funil.
     ⚠️ **[VALIDAR — precisa do cliente]** — exige subir a lista de compradores ao
     Meta, e isso é decisão e dado do cliente.

**2. Interesses de nicho de PO, nunca "agronegócio".** ABCZ, ExpoZebu, Nelore,
   leilão de gado, canais e revistas do setor. A composição da rodada anterior
   (muito comercial, muito volume barato) tem a assinatura de segmentação por
   "pecuária/agronegócio", que é o balde onde mora o comprador de comercial.

**3. Advantage+, mas só depois de consertar o sinal.** E este é o ponto que liga
   a seção 2 à mídia: hoje a régua manda `is_mql: false` para **todo mundo que
   não tem IE**, incluindo quem "está disposto a tirar" — que é o público que a
   página convida em duas frases. Se o Meta otimizar para o evento de valor alto
   com esse sinal, **ele vai aprender a evitar quem está montando fazenda agora**.
   O ajuste dos três estados de IE (2.3b) é pré-requisito, não melhoria.

### 5.4 O que a primeira dobra precisa PROVAR para não queimar clique

Quatro coisas, e a página entrega uma e meia:

| o que precisa provar | está na 1ª dobra? |
|---|---|
| que é a mesma coisa do anúncio (a palavra "PO" repetida) | **sim** — a manchete termina em "Nelore PO" |
| que existe gente de verdade atrás disso | **não** — só a logo. Zero fato. |
| que a compra é em leilão | **não** — não aparece em lugar nenhum |
| que existe caminho financeiro | **não no mobile** — "30× no boleto" está depois do formulário |

A proposta de olho em 1.5 resolve a terceira. A proposta de prova social em 4.1
resolve a segunda parcialmente (aproxima, mas não sobe até o hero). A quarta fica
para o teste de 4.5. A primeira já está resolvida e não deve ser mexida.

---

## 6. Resumo executivo — ordem de execução

**Bloco 1 — muda quem chega (maior efeito, menor custo)**
1. Teste de criativa A/B por **qualificação**, não por CPL (4.6).
2. IE com três estados no formulário **e** na régua (2.3b). Conserta o sinal de
   mídia e alinha copy e dado.
3. Terceira frase no olho do hero: "Começando ou ampliando, a compra é em
   leilão — com assessor Bula do lado" (1.5). Custo ~+38px em `primeiroCampo`,
   **medir com `medir-pagina.mjs` antes de subir**.

**Bloco 2 — muda quem preenche até o fim**
4. `PROJETO_MIN` 10 → 40, espelhado na rota (2.2).
5. `categoria` sai do passo 1 (ou "Ainda não sei" vira a primeira opção) (2.2).
6. Reescrita do critério 02 do "não é para você" (3.1) — hoje ele afasta o
   comprador grande no celular.
7. Item 01 do "é para você" passa a incluir quem já cria PO (3.1).

**Bloco 3 — prova e confiança**
8. `ProvaSocial` sobe para depois do filtro, com fundo `#141414` (4.1a).
9. UTM no `escapeHref` + evento de clique (3.2) — sem isso o escape é fé.
10. Depoimento nomeado **[VALIDAR — precisa do cliente]** (4.1c).
11. Número de criatórios **[VALIDAR — precisa do cliente]** (4.1b).

**Bloco 4 — depois que a qualificação subir**
12. Régua relativa de desembolso nas categorias **[VALIDAR]** (4.2b).
13. `porques.quantidade` — "não existe pedido mínimo" (4.2c).
14. Persistência de rascunho em `localStorage` (2.3c).
15. Urgência de calendário de leilão **[VALIDAR — precisa do cliente]** (4.4).
16. `cidade` vira input livre (2.3a).

---

## 7. Pendências que este laudo abre

| # | o quê | com quem |
|---|---|---|
| G-01 | Rodar `medir-pagina.mjs` depois da mudança do olho — `primeiroCampo` não pode passar de 633 | time |
| G-02 | Nº de criatórios que a Bula ajudou a montar | **cliente** |
| G-03 | Depoimento nomeado (nome, criatório, cidade, autorização) | **cliente** |
| G-04 | A ordem de custo das seis categorias confere? | João Antônio |
| G-05 | Calendário de leilão sustenta a linha de urgência? | **cliente** |
| G-06 | Lista de COMPRADORES (não leads) para LAL no Meta | **cliente** |
| G-07 | "Acasalamento" se sustenta? Se não, cai o cartão E o critério 04 do filtro | equipe técnica |
| G-08 | Três estados de IE cabem em 390px lado a lado, ou precisam empilhar? | medir |
| G-09 | Esta avaliação não teve Playwright — revalidar a leitura de dobra no 390 | time |
