# Modelo do funil de fêmeas — a conta inversa

**Fase 0 do `PLAN.md`. Zero código: é aritmética, e ela decide quanto tráfego
comprar, quanto atrito o formulário precisa carregar e se a meta fecha.**

Escrito em **05/08/2026**. Toda taxa aqui está marcada **[MEDIDO]** (com fonte e
janela) ou **[ASSUMIDO]**. Nenhuma sem rótulo — porque a diferença entre as duas
é a diferença entre planejar e chutar, e este funil não tem histórico próprio.

**A resposta em uma frase:** para entregar **40 reuniões/mês**, esta página
precisa de **254 a 690 leads/mês**, o que custa **R$ 7,4 mil a R$ 26,7 mil/mês**
de mídia — e o que decide onde nesse intervalo a conta cai é **uma taxa que
ninguém mediu ainda**, a de aprovação do cadastro (`t_aprov`).

---

## 1. O benchmark, e a regra de uso que evita um erro de 10x

Apuração cruzando o export do Gerenciador de Anúncios com a planilha do CRM.
**Janela: 25/07 a 01/08/2026**, as duas campanhas somadas (`LEAD - PERPETUO
TOURO` + `LEADS - SAO GERALDO`). **[MEDIDO]**

| Etapa | Volume | Custo unitário |
|---|---:|---:|
| Investido | **R$ 3.398,27** | 1.984,68 perpétuo + 1.413,59 São Geraldo |
| Impressões | 272.192 | — |
| Cliques no link | 2.941 (CTR 1,08%) | **CPC R$ 1,16** |
| Acessos à página (GA4) | 3.135 | — |
| **Formulários preenchidos** | **116** | **R$ 29,30** |
| Contatos (tentativa registrada pelo time) | 109 | R$ 31,18 |
| **Cadastros (etapa CADASTRO OK)** | **15** | **R$ 226,55** |

**Fonte:** `~/Downloads/cruzamento-ads-crm-25jul-01ago-2026.html` — externa ao
repositório por pedido explícito. **Nenhuma cópia dela foi adicionada aqui.**

> **A regra que evita o erro de 10x:** use **R$ 226,55** onde a conta pedir custo
> por *cadastro*; use **R$ 29,30** onde pedir custo de *entrada no funil*.
> **Nunca os dois na mesma conta** — um é 7,7x o outro, e eles medem coisas
> diferentes.

"Cadastro", na fala do cliente, é a **etapa CADASTRO OK no CRM** — não
preenchimento de formulário. Foi essa a ambiguidade que a Fase 0 existia para
resolver, e ela está resolvida.

**Fonte de verdade do gasto = export do Gerenciador, não `outputs/`.** Os
arquivos antigos em `outputs/` foram construídos sobre a API com token vencido e
**subcontam gasto** (ver `scripts/lib/midia-27jul-01ago-2026.mjs:1–8`). Onde eles
divergem, é recorte diferente, não conflito: aquele resumo cobre 27/07–01/08 e só
o perpétuo (R$ 1.192,58); a diferença de R$ 792,10 para os R$ 1.984,68 são os
dias 25 e 26.

### Duas ressalvas que precisam sobreviver a qualquer citação destes números

**1. O custo por cadastro é exato no total e é uma FAIXA por campanha.** Dos 15
cadastros, só **12 são rastreáveis** até a campanha — 3 tiveram a etapa
atualizada depois do export.

| Campanha | Custo por cadastro |
|---|---|
| **Perpétuo Touro** | **R$ 283,53 a R$ 496,17** |
| São Geraldo (leilão) | R$ 128,51 a R$ 176,70 |
| Blended (exato) | R$ 226,55 |

**2. R$ 226,55 é média puxada para baixo por um leilão.** São Geraldo é evento
único, com **data como motor de urgência** — um perpétuo não tem esse motor. O
benchmark limpo para calibrar **outro perpétuo** é o do perpétuo isolado, que é
mais caro: **R$ 283,53 a R$ 496,17**. A diferença entre as duas bases não é
detalhe: é **2,2x de verba**.

---

## 2. A cadeia inversa

```
reuniões realizadas/mês          = 40                          [META]
÷ t_show   (comparecimento)      = 75%      [ASSUMIDO]   → 53 agendamentos/mês
÷ t_agenda (aprovado → agendado) = 60%      [ASSUMIDO]   → 89 aprovados/mês
÷ t_aprov  (lead → aprovado)     = ?        [O BURACO]   → leads/mês
÷ t_lp     (acesso → formulário) = ?        [teto 3,9%]  → acessos/mês
× CPC                            = R$ 1,16  [MEDIDO]     → verba/mês
```

**`t_aprov` é a única incógnita que importa, e ela move a verba em 3x.** O plano
não escolhe entre as duas premissas defensáveis — ele afirma que **medir isso
primeiro vale mais que qualquer outra decisão desta fase**:

| Premissa de `t_aprov` | leads/mês | Verba a R$ 29,30/formulário | Triagem/dia útil |
|---|---:|---:|---:|
| **35%** — otimista; assume que o atrito do formulário faz a triagem funcionar | 254 | **R$ 7.442** | 12 |
| **12,9%** — **[MEDIDO]**: 15 cadastros ÷ 116 formulários, janela 25/07–01/08 | **690** | **R$ 20.217** | **31** |

⚠️ **Não confirmar isto por um segundo caminho que é o mesmo caminho.** "89
aprovados × R$ 226,55 = R$ 20.163" dá o mesmo número **por construção**:
R$ 226,55 é exatamente R$ 29,30 ÷ 12,9%. Citar os dois como duas evidências é
contar a mesma coisa duas vezes.

**Na base do perpétuo isolado** (ressalva 2), que é o benchmark correto para
calibrar um perpétuo: 89 aprovados × R$ 283,53 a R$ 496,17 = **R$ 25.234 a
R$ 44.159/mês**.

**E os 12,9% não são o mesmo portão que o fêmeas usa.** CADASTRO OK é habilitação
completa (documento, crédito); a "aprovação do cadastro" da jornada de fêmeas é
um portão **mais leve**, antes da reunião. A verdade está **entre 12,9% e 35%**, e
o intervalo vale de R$ 7,4k a R$ 20k/mês. **É o número mais caro que ainda não
sabemos.**

### Checagem pelo outro lado da cadeia (`t_lp`)

| Landing | Acesso → formulário |
|---|---:|
| `/touros` (perpétuo) | **3,9%** [MEDIDO] — teto observado numa landing nossa de público qualificado |
| `/saogeraldo` (leilão) | 2,1% [MEDIDO] |
| Blended da janela | 3,7% (116 ÷ 3.135) |

⚠️ **O blended fica colado no touros porque "acesso" e "formulário" não são o
mesmo funil nas duas campanhas:** o São Geraldo rodou pesado em Formulário
Instantâneo, e lead de Instant Form **nunca toca a landing**
(`ANALISE-VERBA-SAOGERALDO-2026-07-31.md` §3.3). **Não derivar volume por campanha
a partir do blended.**

**A landing de fêmeas adiciona atrito de propósito, então a premissa realista
fica ABAIXO de 3,9%. Cenário-base: 3,0%.**

```
690 leads ÷ 3,0% = 23.000 acessos × R$ 1,16 = R$ 26.680/mês
690 leads ÷ 3,7% = 18.649 acessos × R$ 1,16 = R$ 21.633/mês
```

**A queda de 3,7% → 3,0% custa ~23% de verba.** Esse é exatamente o preço que a
pendência **C-01** negocia quando decide quantos campos de atrito ficam no
formulário — e é por isso que o formulário nasce instrumentado por passo, em vez
de nascer com uma opinião.

⚠️ **Não há nenhum dado de funil de FÊMEAS neste repositório.** `t_show`,
`t_agenda`, `t_aprov` e `t_lp` do fêmeas são **[ASSUMIDO]**. O que foi medido é o
funil de **touros** — o análogo mais próximo disponível, não o mesmo público.

---

## 3. Capacidade: são 3 SDRs, e o gargalo virou condição

**Decidido em 05/08:** o pré-diagnóstico é **manual** (nada de automatizar
triagem nesta versão) e quem o faz é o **SDR**, que também opera o agendamento.

```
formulário → SDR (pré-diagnóstico manual + agendamento) → reunião com assessor
```

Triagem e agendamento são **toques da mesma pessoa** e competem pelo mesmo dia.
Teto do time: **3 × 7 = 21 toques/dia**, 462/mês.

⚠️ **A referência de 7 toques/dia é do TIME INTEIRO durante um lançamento**
(`ANALISE-VERBA-SAOGERALDO-2026-07-31.md` §7), não o teto de uma pessoa dedicada
— que provavelmente é maior. **[ASSUMIDO]**, e a primeira semana substitui.

### A divergência de conta que muda a conclusão

A conta rápida — *"a 12,9%, 40 reuniões/mês pedem ~310 leads, ~14 toques/dia,
~4,7 por SDR"* — **está aritmeticamente certa, mas para `t_aprov` = 35%, não para
12,9%.** Ela colapsa dois elos: `310 × 0,129 ≈ 40` trata **aprovado como sinônimo
de reunião realizada**. Entre um e outro existem `t_agenda` (60%) e `t_show`
(75%) — combinados, **45%**.

| | conta rápida | modelo completo |
|---|---|---|
| Aprovados para 40 reuniões | 40 | **88,9** |
| Leads a 12,9% | ~310 | **689** |
| Toques/dia no time | ~14 | **33,7** |
| Por SDR/dia | ~4,7 | **11,2** |

**Os ~14/dia e ~4,7/SDR aparecem no modelo — em `t_aprov` = 35%.** A conta estava
certa; o rótulo é que trocou. A 12,9% o time fica **1,6x acima** da referência; a
35%, **33% abaixo**.

### Cenário (a) — 3 SDRs + 3 assessores (seis pessoas)

Os assessores não competem pelo teto do SDR (0,6 reunião/dia cada, folgado).

| `t_aprov` | leads/mês | toques/mês | time/dia | **por SDR/dia** | vs. referência de 7 |
|---|---:|---:|---:|---:|---|
| **12,9%** [MEDIDO] | 689 | 742 | 33,7 | **11,2** | 🔴 1,6x acima |
| 20% | 444 | 498 | 22,6 | 7,5 | 🟡 no limite |
| **21,8%** | 408 | 461 | 21,0 | **7,0** | ⚖️ **break-even** |
| 30% | 296 | 350 | 15,9 | 5,3 | 🟢 folga |
| **35%** [otimista] | 254 | 307 | 14,0 | **4,7** | 🟢 33% abaixo |
| 50% | 178 | 231 | 10,5 | 3,5 | 🟢 folga larga |

> **Cenário (a) fecha se `t_aprov` ≥ ~22%.** Não é "fecha com folga" nem "não
> fecha" — é **condicional**, e a condição é exatamente o que o formulário de
> alto atrito existe para comprar. O análogo medido (12,9%) está **abaixo**; a
> premissa otimista (35%), **bem acima**. A resposta vem das primeiras 200
> submissões, não de estimativa.

### Cenário (b) — as mesmas 3 pessoas acumulando SDR e assessor

A reunião consultiva sai do **mesmo dia** que a triagem. Para somar, é preciso
converter uma reunião de 1h em toques, e **essa conversão nunca foi medida**:
adoto **1 reunião = 5 toque-equivalentes** (1h de reunião + preparo + follow-up
≈ 1,5h, contra ~15–20 min por toque). **[ASSUMIDO]**

Carga fixa/mês = 53 agendamentos + 40 reuniões × 5 = **253 toque-equivalentes**,
antes de triar um único lead.

| `t_aprov` | carga total/mês | time/dia | **por pessoa/dia** |
|---|---:|---:|---:|
| 12,9% [MEDIDO] | 942 | 42,8 | **14,3** 🔴 |
| 35% [otimista] | 507 | 23,1 | **7,7** 🔴 |
| **42,6%** | 462 | 21,0 | **7,0** ⚖️ break-even |
| 50% | 431 | 19,6 | **6,5** 🟢 |

> **Cenário (b) exige `t_aprov` ≥ ~43% — quase o dobro do (a). E 43% está acima
> da premissa otimista de 35%: no cenário (b), nem o cenário bom fecha.**

⚠️ **E (b) é frágil justamente na premissa que ninguém mediu:**

| 1 reunião = | break-even `t_aprov` |
|---|---|
| 3 toque-equivalentes | 30,8% |
| **5** (adotado) | **42,6%** |
| 8 toque-equivalentes | **impossível** — a carga fixa sozinha estoura o teto |

A reunião de fêmeas é longa **por desenho** (fazenda, projeto, orçamento). Se ela
custar mais que 5 toques, **(b) não fecha em nenhuma `t_aprov`**. Este número
precisa ser medido antes de qualquer promessa de meta no cenário (b).

---

## 4. C-14 — a pendência que o modelo não resolve

O cliente disse "3 assessores" antes e "3 SDRs" agora. **São seis pessoas (a) ou
as mesmas três acumulando (b)?**

| | Cenário (a) — 6 pessoas | Cenário (b) — 3 acumulando |
|---|---|---|
| Limiar de `t_aprov` para 40 reuniões/mês | **~22%** | **~43%** |
| A premissa otimista (35%) fecha? | **sim, com folga** | **não** |
| Depende de número não medido? | não | **sim** (custo da reunião em toques) |

> **Muda a decisão, e muda de forma binária:** a 35%, (a) fecha com 33% de folga
> e (b) fica 10% acima do teto. Enquanto C-14 não for respondida, **planejar por
> (a) e medir para (b)** — (a) é o cenário declarado pelo cliente e o mais
> provável, mas se (b) for a realidade, o limiar dobra e o formulário passa a ser
> o **único** caminho.

**Esta pendência está aberta com o cliente.** O modelo entrega os dois cenários
com seus limiares; escolher entre eles é decisão de quem monta o time.

### O limiar, que vale nos dois cenários

```
t_aprov < 22%   → nem o cenário (a) fecha. Reabrir capacidade ou meta.
22% ≤ t < 43%   → (a) fecha; (b) não. A resposta de C-14 passa a ser decisiva.
t_aprov ≥ 43%   → fecha nos dois. A meta de 40 deixa de ser a restrição.
```

**O que o formulário precisa entregar:** levar `t_aprov` de **12,9% para ~22%** —
melhora de **1,7x**, plausível para um formulário desenhado para filtrar somado
às seções "para quem é / para quem não é".

⚠️ **O que a folga NÃO compra:** margem para comprar lead sem triar. A 12,9% e com
3 SDRs a carga ainda é 11,2/SDR/dia, acima da referência. **A folga é condicional
ao formulário funcionar**, e o sinal de que não funcionou aparece **na fila**, não
no relatório de mídia.

---

## 5. Sinais de falsificação — o modelo dizendo onde ele erra

Cada taxa vira um alarme com valor e prazo. Se um destes disparar, **o modelo
está errado e a decisão muda** — não é métrica de acompanhamento.

```
t_aprov < 25% após 200 leads   → as duas alavancas não estão funcionando; 40
                                 reuniões/mês é inalcançável com o time atual.
                                 Renegociar meta ou escalar triagem.
t_aprov ≥ 45% após 200 leads   → as alavancas funcionam; recalcular a verba —
                                 ela cai ~3x em relação ao cenário medido.
t_lp < 2,1%                    → o atrito passou do ponto: a landing de fêmeas
                                 converte pior que uma landing de LEILÃO.
                                 Reabrir C-01 com o dado por passo do formulário.
t_show < 60%                   → o agendamento está frouxo (lembrete/no-show);
                                 comprar mais lead não resolve.
custo/formulário > R$ 45       → o público de fêmea é mais caro que o de touro
                                 (R$ 29,30 medido); a conta inversa inteira muda.
custo/aprovado > R$ 500        → passou do teto do perpétuo isolado (R$ 496,17).
                                 Parar antes de escalar verba, não depois.

── capacidade dos 3 SDRs ────────────────────────────────────────────────
fila cresce 2 semanas seguidas   → a entrada é maior que a vazão. NÃO comprar
                                   mais lead: o backlog já é mídia paga parada
                                   (`ANALISE` §7 mediu R$ 603 nessa situação).
lead sem 1º toque em >24h        → a cadência quebrou, e cadência é tratada
  em >20% dos casos                como o fator decisivo de conversão. É sinal
                                   de teto, não de desleixo.
ritmo médio por SDR <5/dia       → o teto real é menor que os 7/dia assumidos.
  com fila NÃO vazia               A 5/dia, o break-even do cenário (a) sobe de
                                   22% para ~30%.
t_aprov < 22% após 200 leads     → nem o cenário (a) fecha. A meta de 40 volta
                                   à mesa junto com C-14.
```

> **Regra de leitura: os sinais de capacidade valem MAIS que os de mídia.** Verba
> resolve numerador; nenhum deles resolve denominador.

---

## 6. Onde cada número vai ser lido

O modelo só é falsificável se as taxas existirem em algum lugar. Elas existem:

| Taxa | Onde é lida | Já existe? |
|---|---|---|
| `t_lp` (acesso → formulário) | PostHog: `femeas_view` → `femeas_lead_submitted` | ✅ `_lib/analytics.ts` |
| Abandono por passo | PostHog: `femeas_step_reached`, `femeas_validation_failed` | 🔵 Fase 6 |
| `t_aprov` (lead → aprovado) | Planilha, aba **FEMEAS**, coluna **"Aprovado"** | ✅ criada na Fase 2 |
| Cadência (1º toque) | Planilha, aba FEMEAS, coluna **"1º toque em"** | ✅ criada na Fase 2 |
| `t_agenda`, `t_show` | Colunas **"Reunião agendada"** / tabela `agendamentos` | ✅ / ⏳ T8.3 |
| Régua × aprovação humana | Colunas **"Régua automática"** × **"Aprovado"** | ✅ criada na Fase 2 |
| Custo por formulário/aprovado | Export do Gerenciador × planilha | ✅ processo já existe |

⚠️ **As cinco colunas de operação nascem vazias e dependem de a equipe
preencher.** Se o SDR não registrar 1º toque e aprovação, `t_aprov` não existe e
este modelo inteiro fica sem realimentação — a página vira uma aposta cega. **É a
única dependência humana do modelo, e é a mais provável de falhar.**
