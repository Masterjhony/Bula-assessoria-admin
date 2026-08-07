# submit duplicado — diagnóstico

**Data:** 30/07/2026 · **Frente:** infra & tracking · **Status:** diagnóstico fechado, patch pronto, NÃO aplicado
**Gatilho:** GA4 mostra `form_submit` com 202 disparos para 66 usuários = 3,06 por pessoa.

> Escopo desta apuração: só o submit duplicado. A captura em dois estágios e o corte de campos
> foram descartados pelo Boss em 30/07 e não estão aqui.

---

## Resposta curta

| Pergunta | Resposta |
|---|---|
| O disparo triplo gera linha duplicada na aba? | **Não pelo caminho comum.** Quase todo `form_submit` do GA4 morre antes do `fetch`. |
| A dedup pega? Por qual chave? | Chave = coluna **`Lead ID`** da aba. E **não pega** o caso que importa — a chave é sorteada de novo a cada tentativa. |
| Os 14 são 14 pessoas? | **Não consigo ler a aba daqui.** E o `Lead ID` não responde isso: ele é único por tentativa, por construção. Confira pela coluna **WhatsApp**. |
| É o GA4 ou o código chama submit 3x? | **Não é o código.** Um `handleSubmit` = um `fetch`, com trava de reentrada. É o Enhanced Measurement contando **passo** num formulário de 3 passos — `form_submit ÷ form_start = 1,07` (§3). |
| Que taxa reportar? | **3,54% (14 ÷ 396).** Os 79,5% e o "~17%" que eu tinha citado somam os dois funis e não descrevem o lançamento (§3c). |

---

## 1. A chave de deduplicação, e por que ela não dispara

Cadeia completa, verificada:

1. `Formulario.tsx:195-198` — o `eventId` é sorteado com `crypto.randomUUID()` **dentro** do
   `handleSubmit`, depois do portão de validação. **Uma tentativa, um id novo.**
2. Vai no corpo como `event_id`.
3. `api/saogeraldo/lead/route.ts:116,156` — vira `sheetLead.leadId`.
4. `jmp-sheets.ts:1927-1930` — `appendLeadToSaoGeraldoTab()` chama `tourosSeenIds()`, que lê a
   coluna cujo cabeçalho normaliza para `leadid` (o rótulo é **`Lead ID`**, `TOUROS_HEADER`) no
   intervalo `LEADS SAO GERALDO!A2:…` e monta um `Set`. Se o id já estiver lá, devolve
   `{skipped: true, reason: 'duplicate'}`.
5. `route.ts:166` — `'duplicate'` conta como sucesso e nenhuma linha nova é escrita.

**Então a leitura do Boss está certa: a dedup existe e o `'duplicate'` é tratado como sucesso de
propósito. O que ela não faz é pegar gente.**

O caso que ela foi escrita para cobrir é: a pessoa envia → o servidor **grava a linha** → a resposta
se perde no 4G → o `fetch` rejeita → o formulário mostra "Tente novamente" → a pessoa clica de novo.
Nessa segunda tentativa o código sorteia **um id novo**. Chave nova ⇒ `tourosSeenIds` não reconhece
⇒ **segunda linha, mesmo produtor**. A dedup só pegaria um replay literal do mesmo POST (um proxy
reenviando o mesmo corpo), que não é o que acontece na vida real.

Segundo buraco, menor: se `event_id` vier vazio, `if (row.leadId)` pula a checagem inteira e
acrescenta direto (`jmp-sheets.ts:1927`).

**Consequência:** o número de linhas duplicadas na aba é igual ao número de vezes que uma gravação
deu certo e a resposta não voltou. Não é zero por construção — é "raro, e ninguém está medindo".

---

## 2. Se os 14 são 14 pessoas

Não tenho como ler a aba: sem credencial do Google aqui, e a conta Vercel do cliente continua
inacessível (pendência #3 do `INFRA-TRACKING.md §5`), então também não há log de servidor para
contar os POST que entraram.

**Não confira pelo `Lead ID`.** Ele é sorteado por tentativa, então 14 ids distintos são garantidos
e não provam nada.

Confira assim, em 30 segundos, com a aba aberta:

1. Ordene por **WhatsApp**. O número é normalizado por `aplicarMascaraTelefone` antes de gravar,
   então a mesma pessoa aparece sempre com a mesma máscara — repetição é repetição de verdade.
2. Dois registros com o mesmo WhatsApp, geralmente com **Data** a poucos minutos de distância, são
   uma pessoa contada duas vezes.
3. Em paralelo, olhe **Nome**: mesmo nome com dois números costuma ser a pessoa corrigindo o
   telefone depois de um erro — também é um lead só.

Meu palpite, e é palpite: **poucas ou nenhuma**. Os 3,06 disparos por pessoa quase todos morrem
antes do `fetch` (§3), e duplicar exige o caminho estreito "gravou e a resposta sumiu".

---

## 3. De onde vêm os 3,06 disparos

**Não é o código chamando submit três vezes.** Fatos:

- `handleSubmit` faz **um** `fetch` por invocação. Não há laço, não há retry automático, e há trava
  de reentrada (`if (status === 'submitting') return`, `Formulario.tsx:183`).
- A landing **não manda nada para o GA4**. `saogeraldo/_lib/analytics.ts` só chama
  `posthog.capture` (linhas 87 e 110) e não existe `dataLayer.push` em `src/app/saogeraldo/` — é o
  gate G1 do `GTM.md §6.3`. Ou seja, `form_submit` **não pode** ter saído do nosso código.

`form_start` e `form_submit` são do **Enhanced Measurement do GA4** ("interações com formulário").
O `form_submit` escuta o evento `submit` **do DOM**, e dispara mesmo com `preventDefault()`. O
formulário inteiro é **um único `<form>`** (`Formulario.tsx:274`), então todo `submit` conta,
tenha virado cadastro ou não:

- clicar **ENVIAR CADASTRO** com um campo faltando → o handler volta no portão de validação.
  Evento contado, nenhum `fetch`, nenhuma linha.
- clicar de novo depois de um erro de servidor → mais um evento contado.

O que **não** infla: teclar Enter nos passos 1 e 2. Nesses passos não existe botão `type="submit"`
renderizado (o "Continuar" é `type="button"`), e pela regra de *implicit submission* do HTML um
formulário sem botão de envio só submete implicitamente se tiver exatamente um campo que bloqueia —
o passo 1 tem três. Então a navegação entre passos não entra na conta.

**Leitura: `form_submit` é contador de TENTATIVA, não de cadastro.** 202 tentativas, 66 pessoas,
14 linhas.

### Fechamento com o relatório de eventos (30/07)

| Evento | Disparos | Usuários | Por usuário |
|---|---:|---:|---:|
| `page_view` | 1.705 | 1.436 | 1,23 |
| `gtm.dom` | 1.578 | 1.302 | 1,30 |
| `user_engagement` | 221 | 143 | 1,57 |
| `form_start` | 188 | 83 | 2,27 |
| `form_submit` | 202 | 66 | 3,06 |

**a) Multiplicação uniforme do container está descartada.** `page_view` em 1,23 e `gtm.dom` em 1,30
são praticamente 1 por usuário. Se o container estivesse duplicando evento de GA4, apareceria aí
primeiro. Não aparece.

**b) 2,27 vs 3,06 não são "multiplicadores diferentes".** Os denominadores são diferentes: 83
usuários e 66 usuários. Os 66 que enviaram são um subconjunto mais engajado dos 83 que começaram, e
por isso geram mais eventos de qualquer tipo. Comparar as duas razões entre si não mede nada.

**A comparação com escopo igual é evento contra evento: `form_submit` ÷ `form_start` = 202 / 188 =
1,07.** Praticamente um disparo de envio para cada disparo de início.

**c) Isso mata a hipótese de martelada no portão de validação.** Se as pessoas estivessem clicando
ENVIAR três vezes contra um erro, `form_submit` seria muito maior que `form_start`. É 1,07.

**d) Conclusão final sobre a origem.** O que infla `form_start` para 2,27 infla `form_submit` na
mesma proporção — os dois andam juntos porque são o **mesmo contador de interação**, aplicado a um
formulário de **3 passos** (verificado: `TOTAL = 3` em `touros/Formulario.tsx:72` e em
`saogeraldo/Formulario.tsx:73` — a premissa de 2 passos não confere). Uma pessoa que atravessa os 3
passos de um `<form>` único produz interação repetida, e o Enhanced Measurement conta interação, não
cadastro.

**O disparo triplo não é três envios. É um envio contado umas três vezes por uma métrica que conta
passo, num formulário de três passos.** Não é o nosso código: um `handleSubmit` = um `fetch`, com
trava de reentrada, e a landing não empurra nada para o GA4.

---

## 3b. O veredito de "não gera linha duplicada" muda?

**Não. Fica mais firme.** Com `form_submit` a 1,07 por `form_start` e 14 linhas na aba, quase todo
disparo do GA4 morre antes do `fetch` — é contagem de passo, não tentativa de gravação. O único
caminho que ainda produz linha duplicada é o estreito do §1: gravou, a resposta se perdeu, a pessoa
reenviou com id novo. Esse continua aberto e continua sem cobertura da dedup.

---

## 3c. Que taxa de conclusão reportar

**Correção de um número meu:** eu disse que o concluído seria "~17% de 83". Está errado e não deve
ser usado — dividi as 14 linhas do São Geraldo pelos `form_start` dos **dois** funis somados. Pelo
mesmo motivo, os 79,5% também não descrevem o São Geraldo.

`page_view` tem 1.436 usuários; a landing do lançamento tem 396. Ou seja, **cerca de 3/4 desses
eventos de formulário são do perpétuo**. Nenhuma razão tirada de 83 / 66 / 54 diz alguma coisa sobre
o lançamento.

**O que reportar:** a conversão que você já calculou — **14 leads ÷ 396 usuários = 3,54% da
landing**. É a única com escopo casado dos dois lados: usuários da landing do lançamento contra
linhas da aba do lançamento.

**Como obter a conclusão de formulário do lançamento, se quiser o número:** o mesmo relatório de
eventos com filtro de hostname `saogeraldo.bulaassessoria.com`. Aí `form_start` e as 14 linhas ficam
no mesmo escopo e a razão passa a significar alguma coisa.

**Checagem cruzada que vale 1 minuto:** se 54 usuários chegaram ao "Cadastro confirmado" nos dois
funis e 14 são do São Geraldo, o perpétuo deveria mostrar ~40 leads na mesma janela. Se a aba do
perpétuo não tiver ~40, o 54 está inflado pelo mesmo contador de passo e não é gente.

---

## 4. Correção — pronta, NÃO aplicada

`patches/event-id-idempotente.patch` · 1 arquivo, +40/-5 · `git apply` a partir de `2559d75`
Passa em `tsc --noEmit` e `eslint` sem erro. **Não foi para a árvore de trabalho nem para o branch.**

O arquivo é `src/app/saogeraldo/_components/Formulario.tsx`, que é da frente de UI — a mudança é de
idempotência, não de interface, mas quem aplicar deve avisar o dono do arquivo.

Faz duas coisas:

1. **`eventIdRef`** — sorteia o `event_id` uma vez por formulário montado e **reusa em todo
   reenvio**. É isso que faz a dedup da planilha finalmente valer: a segunda tentativa chega com a
   chave da primeira e `tourosSeenIds` reconhece. Também conserta o `event_id` como chave de dedup
   navegador×CAPI no Meta, que hoje muda a cada tentativa e portanto não deduplica nada.
   O id não vaza entre cadastros: o sucesso navega para a página de obrigado com load completo, o
   formulário desmonta e o ref morre junto.
2. **`submittingRef`** — trava de reentrada em ref em vez de estado. O `status` só vale na
   renderização em que o handler foi criado; dois cliques disparados antes de o React recommitar
   leem ambos `'idle'` e passam. O ref é escrito no mesmo tique.

**O que ela NÃO toca, de propósito:** campos, passos, régua de MQL, navegação hard para
`/obrigado-saogeraldo-*`, o append bloqueante, e nada em `src/app/touros/` ou `/api/touros/`.

**Risco de aplicar:** baixo. O caminho feliz é idêntico — mesmo payload, mesma resposta, mesma
navegação. O que muda só aparece na segunda tentativa, que hoje gera linha nova e passaria a cair na
dedup.
**Risco de não aplicar:** duplicata silenciosa na aba sempre que uma gravação der certo e a resposta
se perder. Com 14 leads, uma duplicata é 7% da base — e é a equipe ligando duas vezes para o mesmo
produtor.

**Recomendação:** depois de 01/08. Não há emergência: o efeito é raro, e a 2 dias do leilão qualquer
deploy no caminho do único KPI custa mais do que corrige.
