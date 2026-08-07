# Decisão de verba — Leilão São Geraldo e 7P · 31/07/2026, 16h24

**Janela:** ~19h (31/07 16h30 → 01/08 11h00). **Leilão:** 01/08, sábado, 12h.
**Verba:** liberada pelo cliente, acima de R$500/dia. **Verba não é a restrição.**
**Base de fatos:** print do Gerenciador (16h24, 4 conjuntos ativos) + **export por anúncio 28–31/07** +
`DADOS-LEADS-META-2026-07-31.md` (31 leads, 13 MQL) + `RECONCILIACAO-SUBGASTO.md` + `PLANO-48H.md` +
`LEADS-INSTANTFORM-DESALINHADOS.md` + `BRIEF.md`.

---

## 0. Três afirmações minhas que os dados derrubaram

Registro antes de recomendar, porque as três mudam a decisão:

**1. "O RMKT satura por frequência, teto de R$150." Errado por ~7x.** O Gerenciador mostra alcance de
**8.346** no RMKT e **6.662** na cópia, com frequência de **1,52 e 1,19**. Não há saturação. **O RMKT
deve receber o maior orçamento, não um teto.**

**2. "Existe teto rígido de conta em ~R$158/dia." Falsificado.** O orçamento subiu de R$300 para
R$900/dia e a entrega subiu de R$157,90 para **~R$361/dia**. Teto rígido não deixa passar 2,3x.

**3. "Não há dado de criativo suficiente para decidir." Havia — e é a maior alavanca da conta.** Com o
export por anúncio cruzado com a planilha, a diferença entre criativos é maior que a diferença entre
conjuntos, entre faixas de idade e entre UFs. **Ver seção 3.**

E uma correção aritmética minha: eu vinha usando **R$48,68/MQL** como custo blended (13 MQL ÷
R$632,83). Está errado — 2 dos 13 MQL vieram de tráfego não pago. O custo correto por MQL pago é
**R$58,57** (11 MQL pagos ÷ R$644,31). Todas as projeções deste documento usam R$58,57.

---

## 1. O QUADRO POR CONJUNTO

| Conjunto | Início | Orç/dia | Usado | Impr. | Alcance | Freq. | CPM | Result. | Custo/result. | Evento |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| RMKT — **Cópia** | 30/jul | R$300 | R$72,39 | 7.918 | 6.662 | 1,19 | **R$9,14** | 3 | R$24,13 | Múltiplas conv. |
| Aberto — **Cópia** | 31/jul | R$300 | R$99,40 | 2.839 | 2.426 | 1,17 | **R$35,01** | **0** | — | Lead Sao geraldo |
| **RMKT** | 29/jul | **R$100** | R$187,16 | 12.673 | 8.346 | 1,52 | R$14,77 | **12** | **R$15,60** | Múltiplas conv. |
| **Aberto** | 29/jul | R$200 | R$273,05 | 16.514 | 11.069 | 1,49 | R$16,53 | 5 | R$54,61 | MQL-Sao-Geraldo |
| RMKT - **escala** | — | ? | R$0 | 0 | 0 | — | — | 0 | — | `06` em análise |
| **Total** | | **R$900** | **R$632,83** | 40.015 | 24.395 | | R$15,81 | 20 | | |

### O orçamento está na ordem inversa da performance

| Conjunto | Custo/resultado | Rank performance | Orç/dia | Rank orçamento |
|---|---:|---:|---:|---:|
| RMKT | R$15,60 | **1º (melhor)** | R$100 | **4º (menor)** |
| RMKT — Cópia | R$24,13 | 2º | R$300 | 1º (empate) |
| Aberto | R$54,61 | 3º | R$200 | 3º |
| Aberto — Cópia | **— (zero)** | **4º (pior)** | R$300 | 1º (empate) |

**Os extremos estão perfeitamente invertidos.** O RMKT entregou R$187,16 em 2,7 dias operando a **70%
de um orçamento de R$100/dia** — a melhor taxa de entrega da conta. Com R$300/dia desde 29/jul e
mesmo a uma taxa pior (50%), teria entregado R$405 em vez de R$187,16: a R$15,60, **26 resultados em
vez de 12**.

> **+14 a +24 resultados perdidos em 2,7 dias por ter deixado o melhor conjunto da conta em
> R$100/dia.**

### Aviso de unidade — R$15,60 e R$54,61 NÃO medem a mesma coisa

Os RMKT otimizam por **"Múltiplas conversões"** (cesta ampla); o Aberto por **`MQL-Sao-Geraldo`** (o
evento mais estreito do funil). A razão de 3,5x entre eles está inflada.

**A prova disso está no export por anúncio:** o criativo `01` fez **4 resultados no Aberto** e a
planilha registra exatamente **4 MQL** para ele — mas **13 leads**. Ou seja, o Aberto conta só MQL, o
RMKT conta a cesta. Toda comparação entre eles pelo painel é apples-to-oranges.

**A comparação válida é a da planilha**, onde a régua de MQL é nossa e igual para todos:
**CPMQL RMKT R$21,74 × Aberto R$46,34 = 2,1x.** É esse 2,1x que sustenta a decisão, não o 3,5x.

---

## 2. AS CÓPIAS — desligar UMA, e consertar o criativo da outra

O `PLANO-48H` dizia **"Editar. Não duplicar."** Foi duplicado. Mas **o conserto certo a 19h do evento
não é o conserto que seria certo a 5 dias.**

### A canibalização é menor do que parece — e a frequência é o motivo

Canibalização entre conjuntos sobrepostos dói quando o público satura. **Com frequência de 1,19 e
1,52, não é o caso.** Sobreposição medida: soma dos alcances 28.503 contra 24.395 deduplicados =
**~4.100 pessoas em comum, 14%**. Existe, mas é pequena. **Os dois RMKT são hoje capacidade de
entrega aditiva, não concorrentes.**

### O custo real da duplicação é orçamento parado, não leilão

| Conjunto | Orç/dia | Entrega est./dia | % | Orçamento parado |
|---|---:|---:|---:|---:|
| RMKT — Cópia | R$300 | ~R$43 | **14%** | **R$257** |
| Aberto — Cópia | R$300 | ~R$146 | 49% | **R$154** |
| RMKT | R$100 | ~R$70 | **70%** | R$30 |
| Aberto | R$200 | ~R$102 | 51% | R$98 |
| **Total** | **R$900** | **~R$361** | **40%** | **R$539** |

**As duas Cópias seguram R$411 dos R$539/dia parados — 76% do subgasto atual — enquanto o melhor
conjunto está preso em R$100/dia.**

### DESLIGAR — `CA - SAO GERALDO - web - Aberto — Cópia`

O argumento **não** é o zero resultado. 0 em R$99,40 é amostra pequena (se o CPL real fosse R$50, a
chance de observar zero é ~13,5%). O argumento é o **CPM de R$35,01**, que tem 2.839 impressões por
trás e portanto é confiável: **2,1x o CPM do próprio original (R$16,53)** e 2,2x o da conta, no mesmo
leilão, no mesmo dia, para o mesmo tipo de público.

**Reforço vindo do export:** o criativo dominante nas Cópias é o `04` (reconstrução por subtração —
ver §3), cujo CPM médio na conta é **R$14,23, o mais barato de todos**. Um conjunto rodando o
criativo mais barato da conta e pagando **CPM R$35,01** só se explica pelo **conjunto**, não pelo
criativo. Isso fecha a decisão.

**Quantificando:** os R$99,40, ao CPM do original, teriam comprado **6.013 impressões** em vez de
2.839 — **perda de 3.174 impressões, 53% do que o dinheiro deveria ter comprado**. Pela taxa do
próprio original (16.514 impressões → 5 MQL), isso é **~1 MQL queimado só pelo prêmio de CPM**, mais
~1,8 MQL esperados que não vieram. **Custo total: R$99 gastos, ~2 MQL não entregues, em um dia.**

### MANTER — `CA - SAO GERALDO - web e inst RMKT — Cópia` — mas trocar o criativo dela hoje

Ela tem o **CPM mais barato da conta (R$9,14)** sobre 7.918 impressões — número confiável. Mas o
export revela o problema: **o melhor criativo da conta (`03`) tem R$0 e ZERO impressões dentro
dela.** Ela está rodando principalmente o `04`, que produziu **0 MQL** em R$172,24 na conta inteira.

**Portanto os R$24,13/resultado dela provavelmente são R$24,13 por lead NÃO qualificado.**

**Decisão: manter o conjunto (capacidade barata, sem saturação) e consertar o que roda dentro dele —
matar o `04`, subir o `03`.** Isso converte "capacidade barata rodando o pior criativo" em
"capacidade barata rodando o melhor". É a edição de maior retorno por minuto do documento.

**Falsificação, e vale 30 segundos às 22h:** se a frequência de qualquer RMKT passar de **3**, o
público começou a saturar e aí sim consolide num só. Abaixo de 3, os dois são aditivos.

---

## 3. CRIATIVO — a maior alavanca da conta, e ela também está invertida

### 3.1 O agregado do painel (unidades misturadas — usar só para ver a alocação)

| Anúncio | Gasto | % verba | Impr. | Result. | Custo/result. | CPM |
|---|---:|---:|---:|---:|---:|---:|
| **03** | R$117,74 | **18%** | 7.338 | **10** | **R$11,77** | R$16,05 |
| **01** | R$297,76 | **46%** | 18.627 | 5 | R$59,55 | R$15,99 |
| **04** | R$172,24 | **27%** | 12.105 | 3 | R$57,41 | R$14,23 |
| 05 | R$33,92 | 5% | 1.760 | 2 | R$16,96 | R$19,27 |
| 02 | R$22,65 | 4% | 858 | **0** | — | **R$26,40** |
| 06 | R$0 | 0% | 0 | 0 | em análise | — |
| **Total** | **R$644,31** | | 40.688 | 20 | R$32,22 | R$15,83 |

**`01` + `04` = 73% da verba → 40% dos resultados. `03` + `05` = 23% da verba → 60% dos resultados.**

*Ressalva de unidade:* esta coluna "Resultados" soma eventos **diferentes** entre conjuntos
(Múltiplas conversões / MQL / Lead). Serve para ver a alocação, **não** para ranquear criativo. Os
dois rankings confiáveis vêm abaixo.

*Conferência:* o export soma R$644,31 e o print de conjuntos soma R$632,83 — diferença de R$11,48,
compatível com o export começar em 28/07 e os conjuntos em 29/07. Não é material.

### 3.2 O ranking limpo #1 — dentro do RMKT (mesmo público, mesmo leilão, mesmo evento)

| Anúncio | Gasto | Result. | Custo/result. | CPM | Impressões (deriv.) | 1 result. a cada |
|---|---:|---:|---:|---:|---:|---:|
| **03** | R$99,29 | **10** | **R$9,93** | R$15,37 | 6.460 | **646 impr.** |
| 01 | R$53,59 | 1 | R$53,59 | R$14,65 | 3.658 | 3.658 impr. |
| 05 | R$17,88 | 1 | R$17,88 | — | ~930 | ~930 impr. |
| 04 | R$17,16 | **0** | — | — | ~1.200 | — |

**Os CPM são praticamente iguais (R$15,37 vs R$14,65). Logo a diferença é CONVERSÃO do criativo, não
custo de mídia.** Por impressão, **o `03` converte 5,7x melhor que o `01` no mesmo público.**

**Força estatística — e é a primeira coisa desta conta que chega perto de ser significativa:** se os
dois tivessem a mesma taxa real, a divisão esperada dos 11 resultados entre eles (proporcional às
impressões) seria 7,0 / 4,0. O observado é **10 / 1**. Probabilidade de um desvio desse tamanho ou
maior por acaso: **~5% (unicaudal)**. Não é prova definitiva, mas é **uma ordem de grandeza mais forte
que qualquer outra comparação deste projeto** — RMKT vs Aberto, faixa etária, UF, plataforma, todas
são mais fracas que esta.

### 3.3 O ranking limpo #2 — CPMQL por criativo (régua nossa, igual para todos)

Cruzando o gasto do export com os leads e MQL da planilha (`DADOS §3`), que aplicam a mesma régua
`≥100 cabeças E IE` a todo mundo:

| Criativo | Gasto | % verba | Leads | MQL | CPL | **CPMQL** | Rota dominante |
|---|---:|---:|---:|---:|---:|---:|---|
| **05** | R$33,92 | 5% | 2 | 2 | R$16,96 | **R$16,96** | misto |
| **03** | R$117,74 | 18% | 10 | **5** | **R$11,77** | **R$23,55** | **Instant Form 10/10** |
| 01 | R$297,76 | **46%** | 13 | 4 | R$22,90 | **R$74,44** | Landing 12/13 |
| **04** | R$172,24 | **27%** | 2 | **0** | **R$86,12** | **— (infinito)** | Instant Form |
| 02 | R$22,65 | 4% | 0 | 0 | — | — | — |
| **Total pago** | **R$644,31** | | **27** | **11** | **R$23,86** | **R$58,57** | |

**Na única unidade que é igual para todos, o `03` custa R$23,55/MQL contra R$74,44 do `01` — 3,2x
melhor — e o `01` levou 46% da verba.**

### 3.4 O `04` é o maior desperdício isolado da conta — e isso É defensável estatisticamente

**R$172,24 (27% da verba) → 2 leads → 0 MQL. CPL de R$86,12 = 3,7x o CPL da conta (R$23,86).**

"0 MQL em 2 leads" é n pequeno e não decide nada. Mas o número relevante aqui não é o de MQL — é o de
**gasto e impressões**, que é grande: R$172,24 e 12.105 impressões. Ao CPL da conta, esse dinheiro
deveria ter produzido **7,5 leads**. Produziu 2. Probabilidade disso por acaso: **~2%.**

**O `04` é significativamente pior que a conta na taxa de lead, com p≈2%. Desligar em todos os
conjuntos, agora.** E ele é o criativo que domina as duas Cópias — desligá-lo conserta as duas de uma
vez.

### 3.5 O tamanho do prêmio — em duas versões, uma honesta e uma ilustrativa

**Versão ilustrativa (limite superior, NÃO é previsão):** à eficiência do `03` (R$11,77/result), os
R$644,31 teriam produzido **~55 resultados em vez de 20**. Em MQL: ao CPMQL do `03` (R$23,55), os
R$621,66 dos criativos atribuídos teriam produzido **~26 MQL em vez de 11**. **Isso assume que o `03`
mantém a taxa no público frio, que é exatamente o que não está provado.** Serve para dimensionar o
prêmio, não para prometer.

**Versão defensável (só onde a comparação é limpa):** dentro do RMKT, os R$88,63 que foram para
`01`+`04`+`05` produziram **2 resultados**. Ao custo do `03` (R$9,93), teriam produzido **8,9**.
**+7 resultados, numa comparação apples-to-apples de verdade.** É esse número que eu levo para a
decisão.

### 3.6 A RESSALVA QUE NÃO PODE SER OMITIDA — o `03` nunca foi testado no frio

| Onde | Gasto do `03` | Impressões | Resultados |
|---|---:|---:|---:|
| RMKT (quente) | R$99,29 | 6.460 | **10** |
| **Aberto (frio)** | **R$7,44** | **592** | **0** |
| RMKT — Cópia | **R$0** | **0** | 0 |

**Os 10 resultados do `03` vieram TODOS de retarget. No frio ele tem 592 impressões.**

**Quanto isso é "ausência de teste" e não "resultado ruim":** à taxa do próprio `03` (1 resultado a
cada 646 impressões), 592 impressões produziriam **0,92 resultado esperado**. A chance de observar
zero é **40%**. **Ou seja: o zero do `03` no frio é o resultado mais provável mesmo que ele seja
ótimo.** Não informa nada. Escalar o `03` para o frio é **aposta informada, não fato**.

**E há um confundidor que eu preciso nomear:** o `03` roda **Instant Form (10 de 10 leads)** e o `01`
roda **landing (12 de 13)**. Parte da diferença de 5,7x pode ser **fricção de formulário**, não
qualidade de vídeo — o formulário da landing tem 7 campos obrigatórios em 3 passos. **Podemos estar
medindo rota, não criativo.**

Dois fatos que atenuam, sem eliminar, esse confundidor:
1. **A qualidade não cai na rota fácil:** o `03` faz **50% de MQL** (5/10) contra 31% do `01` (4/13).
   Instant Form não trouxe lead pior — trouxe melhor.
2. **O `04` também roda Instant Form e fez 0 MQL em R$172,24.** Se a rota explicasse tudo, o `04`
   teria performado. Logo há componente de criativo real.

**Conclusão prática, e ela é a mesma nos dois casos:** seja criativo ou rota, **o caminho `03` +
Instant Form é o que está produzindo, e é para lá que o dinheiro vai.**

### 3.7 O `05` é a aposta mais barata da conta

R$33,92 (5% da verba), 2 leads, **2 MQL**, **CPMQL R$16,96 — o melhor da conta**. E produziu **nos
dois conjuntos** (1 no quente com R$17,88, 1 no frio com R$6,51 e apenas 359 impressões).
**n=2, então isto não é conclusão — é a aposta com melhor razão upside/custo do documento.** Subir o
`05` custa quase nada e ele é o único além do `01` com resultado no frio.

### 3.8 Conflito entre duas recomendações minhas — e como resolver

A seção 6 recomenda, como plano B, mudar o local de conversão do Aberto para **"Site apenas"**, para
estancar o vazamento do Instant Form. **Mas o `03` produz via Instant Form.** Aplicar o plano B no
Aberto **desliga o mecanismo do melhor criativo exatamente no conjunto em que queremos testá-lo.**

**Resolução:** o **plano A (reapontar o destino da entrega do Instant Form) passa a valer muito mais
que o plano B.** Se o plano A sair, tudo funciona junto. Se só o plano B for possível, **aceite que o
`03` não será testado no frio** e coloque o dinheiro dele integralmente no retarget, onde ele está
provado e onde o Instant Form continua funcionando.

---

## 4. O QUINTO CONJUNTO — `RMKT - escala` com o `06` em análise

**Trate como zero. Não conte com ele.**

- R$0 gastos, 0 impressões, criativo `06` em **`pending_process`** (revisão do Meta).
- A revisão pode liberar em minutos ou em 24h+. Com **19h de janela**, apostar nisso é apostar num
  sorteio.
- Mesmo se liberar: conjunto novo, zero histórico, rampa do zero — e o `06` **nunca produziu um único
  resultado em lugar nenhum**. É o criativo com menos informação da conta.

**Três ações de 2 minutos, mesmo tratando-o como zero:**
1. **Adicione o `03` a esse conjunto agora.** Se a revisão liberar, ele roda o criativo provado em vez
   de um desconhecido. Se não liberar, você não perdeu nada.
2. **Coloque a data de término 01/08 11h00 nele também.** Este é o risco concreto: um conjunto que
   sai de revisão às 10h de sábado e **não** tem data de término queima orçamento o fim de semana
   inteiro num leilão que já acabou.
3. **Não aloque expectativa de entrega a ele.** Todo número da seção 5 assume R$0 vindo daqui.

**O nome "escala" mostra que a intenção estava certa** — alguém identificou que o retarget precisava
de mais capacidade. Chegou tarde e com o criativo errado. Fica para a seção 8.

---

## 5. A DECISÃO — consolidação, criativo, orçamentos e degraus

### Princípio

**66% para retarget, 34% para público novo** — inverso do normal, e o relógio é a razão: a 19h do
pregão o valor de captar público frio despenca (quem vê o anúncio às 9h de sábado tem 3h para se
cadastrar, ser atendido e decidir), enquanto o valor de fechar quem já viu o catálogo é máximo. E não
há saturação impedindo escalar o quente (frequência 1,19 / 1,52).

**No nível de criativo, o princípio é mais simples: o dinheiro segue o `03`.**

### Degrau 1 — AGORA, 16h30. Um único save. Orçamento, desligamentos e criativo.

**Conjuntos:**

| Ação | Conjunto | De | Para |
|---|---|---|---|
| **DESLIGAR** | `Aberto — Cópia` | R$300/dia | **OFF** |
| **SUBIR** | `RMKT` | R$100/dia | **R$600/dia** |
| **SUBIR** | `RMKT — Cópia` | R$300/dia | **R$400/dia** |
| **SUBIR** | `Aberto` | R$200/dia | **R$500/dia** |
| **CRIAR** | Limite de Gastos da **Campanha** | — | **R$900** para o restante da janela |
| **DEFINIR** | Data e hora de término, em **todos**, inclusive o `escala` | — | **01/08, 11h00** |

**Anúncios — é aqui que está o maior ganho:**

| Ação | Anúncio | Onde | O número |
|---|---|---|---|
| **DESLIGAR** | **`04`** | **Todos os conjuntos** | R$172,24 (27% da verba), 2 leads, **0 MQL**, CPL R$86,12 = 3,7x a conta, **p≈2%** |
| **DESLIGAR** | **`02`** | Todos | R$22,65, 0 leads, **CPM R$26,40** — o pior da conta (1,67x) |
| **ADICIONAR** | **`03`** | `RMKT — Cópia` (hoje R$0 / 0 impressões) e `RMKT - escala` | O melhor criativo está **ausente** do 2º melhor conjunto. Custo zero, upside direto |
| **DESLIGAR** | `01` e `04` | **Só dentro do `RMKT`** | No mesmo público, `01` fez 1 resultado com R$53,59 contra 10 do `03`. Libera R$70,75/período para o `03` |
| **MANTER** | `01` | **Só no `Aberto` (frio)** | É o **único** criativo com produção comprovada no frio: 4 MQL, 13.884 impressões. **Não desligar** |
| **SUBIR** | `05` | Nos dois RMKT e no Aberto | CPMQL R$16,96, o melhor da conta, com 5% da verba. n=2 — aposta barata, não conclusão |

**Desligar `04` + `02` libera 30% da verba histórica que produziu 2 leads e 0 MQL entre os dois.**

**Por que R$1.500/dia nominais para uma expectativa de ~R$545 real.** Dois multiplicadores que se
somam:
1. **A conta entrega ~40% do que é pedido.**
2. **São 16h30.** O Meta distribui orçamento diário ao longo do **dia inteiro do calendário**. Restam
   7,5h de 24h = **31% do dia**. Um orçamento de R$600/dia entrega no máximo ~R$187 hoje — e ~40%
   disso na prática.

Multiplicando, para tirar ~R$250 nas próximas 7,5h é preciso pedir da ordem de R$1.500/dia. **Não é
agressividade, é aritmética de relógio.** O **Limite de Gastos da Campanha (R$900)** é o freio que
torna isso seguro.

**Data de término 01/08 11h00 é obrigatória.** A página fica no ar depois do evento (BRIEF §4) e nada
impede a verba de queimar num leilão que já aconteceu. **Perda evitada: até R$900.** 11h e não 12h
porque lead que chega às 11h55 não é atendido antes do pregão.

**Por que NÃO mexer em segmentação neste save:** o pico é **17h–21h (45% dos 31 leads)** e começa em
30 minutos. Orçamento e ligar/desligar anúncio são mudanças leves; segmentação faz o Meta re-avaliar
entrega justo na melhor janela do dia. Vai no Degrau 2.

### Degrau 2 — 22h00, depois do pico. Um único save.

| Ação | Onde | O número |
|---|---|---|
| **Idade 35 a 65+** | 3 conjuntos | R$151,38/MQL em 18–34 contra R$66,80/MQL em 35+ (2,27x). **+1 a +2 MQL**. Mínimo 35 e não 45: a banda 35–44 nunca apareceu em relatório |
| **Excluir SP** (**não** BA) | Só no Aberto | `RECONCILIACAO` mandou cortar SP **e** BA por "0 MQL em 14 leads". **Os dados de 31/07 derrubam a BA:** o perfil dos 13 MQL lista `BA = 1`. **Não corte BA.** SP fica como aposta barata de evidência fraca |
| **Audience Network — conferir antes** | Quebra por posicionamento | **Prioridade rebaixada.** Os CPM medidos (R$14,77 / R$16,53 / R$9,14) são incompatíveis com participação grande de um posicionamento de CPM R$106,64. Se AN <5% do gasto, pule; se >10%, corte |
| **Ler frequência dos dois RMKT** | Coluna Frequência | Se **>3**, consolide num só. Abaixo de 3, mantenha os dois |
| **O teste do `03` no frio** | Só no `Aberto` | Ver abaixo |

**Como forçar o teste do `03` no frio, e o risco de cada versão:**

| Versão | O que fazer | Risco | Veredito |
|---|---|---|---|
| **Recomendada** | Já feito no Degrau 1: `02` e `04` desligados no Aberto (R$47,48, 0 resultados). Sobram `01`, `03`, `05` disputando o orçamento | Baixo. Não remove o produtor conhecido | **FAZER.** Mas seja honesto: **pode não bastar** — a entrega intra-conjunto do Meta já escolheu o `01` (13.884 impressões contra 592). Liberar orçamento não obriga a redistribuir |
| **Forçada** | Pausar também o `01` no Aberto, deixando só `03` e `05` | **Alto.** Remove o único criativo com 4 MQL comprovados no frio. Risco: ~3,5 resultados perdidos nas 19h se o `03` não pegar. Upside se pegar: ~15 | **NÃO fazer no Degrau 2. Reavaliar às 00h05** — se o `03` tiver conseguido >1.500 impressões no frio e ≥1 resultado, promova; se continuar sufocado abaixo de 1.000 impressões, aí sim pause o `01` para as últimas 11h, quando o valor de público frio já é baixo e a aposta é barata |
| **Conjunto frio dedicado só com `03`+`05`** | Criar conjunto novo | Rampa própria; entrega ~R$100–150 em 19h e não dá leitura limpa antes do pregão | **NÃO.** O mesmo dinheiro no retarget compra o `03` a R$9,93 **provado**. Vai para a seção 8 como o teste nº1 da próxima campanha |

**E lembre do §3.8:** se o plano B (Aberto → "Site apenas") for aplicado, o teste do `03` no frio
**morre por construção**, porque o `03` produz via Instant Form. Nesse cenário, não gaste um minuto
tentando — jogue tudo do `03` no retarget.

### Degrau 3 — 00h05 de 01/08
Novo dia de calendário, novo orçamento diário. Reconfirme os valores do Degrau 1 e **verifique que a
data de término 01/08 11h00 continua de pé em todos os conjuntos, inclusive o `escala`.** Reavalie o
teste do `03` no frio conforme o critério acima.

### Degrau 4 — 06h00 de 01/08
Se o Limite de Gastos da Campanha ainda tiver folga >R$300, suba o **`RMKT` para R$800/dia** — melhor
custo, sem saturação, público mais quente na manhã do leilão. **Nada novo sobe. Nenhum criativo novo.
Nenhum conjunto novo.**

### 11h00 — término automático. Verba depois disso é perda pura.

### Alocação resultante

| Conjunto | Orç/dia | Criativos ativos | Alvo 19h | % |
|---|---:|---|---:|---:|
| `RMKT` | R$600 | **`03`** + `05` | ~R$230 | **42%** |
| `RMKT — Cópia` | R$400 | **`03`** + `05` | ~R$130 | 24% |
| `Aberto` | R$500 | `01` + **`03`** + `05` | ~R$185 | 34% |
| `Aberto — Cópia` | OFF | — | R$0 | 0% |
| `RMKT - escala` | manter | `03` (+`06` se liberar) | **R$0 planejado** | 0% |
| **Total** | **R$1.500 nominais** | | **~R$545 real** | **100%** |

**Retarget 66% · Frio 34%.** Antes: 41% retarget. **`04` e `02` fora de todos.**

**Risco assumido, dito abertamente:** desligar a Aberto-Cópia remove ~R$146/dia de entrega ao vivo, e
os originais só absorvem isso com algumas horas de atraso. **Se às 22h o total entregue estiver abaixo
de R$200, religue a Aberto-Cópia** — com 13h restantes, entrega cara vale mais que entrega nenhuma.

---

## 6. VALE TROCAR O EVENTO DE OTIMIZAÇÃO DO ABERTO? — **NÃO. Mantenha `MQL-Sao-Geraldo`.**

Reverte a recomendação de LPV do `RECONCILIACAO-SUBGASTO.md`. Cinco razões:

**1. A tese de "evento raro estrangula a entrega" foi falsificada pelo painel.** O Aberto entregou
**R$273,05, 16.514 impressões, alcance 11.069, CPM R$16,53**. Conjunto estrangulado por escassez de
evento não entrega isso a CPM de mercado. **Ele entrega; entrega caro.** Problemas diferentes.

**2. O teste direto existe e aponta para o outro lado.** A Aberto-Cópia otimiza pelo evento **mais
fácil** ("Lead Sao geraldo") e entregou **0 em R$99,40, a CPM R$35,01**. O original, no evento **mais
difícil**, entregou 5 MQL a CPM R$16,53. Confundido pela cópia ser nova — não trato como prova. Mas é
o único experimento disponível e **não apoia afrouxar o evento**.

**3. R$54,61 por comprador qualificado provavelmente já é barato.** A 22% de conversão MQL→CADASTRO OK
(2 de 9 tocados), são **~R$248 por cadastro habilitado**, num produto cujo ticket é um touro Nelore PO
com selo de mãe de touro de central. **Não se conserta o que está barato.**

**4. O reset custa 21% a 42% da janela.** Trocar evento reinicia a entrega: 4 a 8 horas de
volatilidade sobre **19**. Você paga integral e não recebe o benefício, que seria sair do aprendizado
— impossível por qualquer caminho (≈50 eventos/7 dias = ~7/dia contra 1,85 MQL/dia observado).

**5. O problema do Aberto é criativo, não evento.** O export mostra que **46% da verba da conta foi
para o `01`, a R$74,44/MQL**, e que o `03` nunca recebeu impressão no frio. **Trocar o evento tentaria
consertar com o algoritmo aquilo que a alocação de criativo já explica.** Conserte o criativo
primeiro; é reversível, é grátis e não reseta nada.

**Os RMKT ficam em "Múltiplas conversões" pelo mesmo princípio:** está funcionando.

**O que ficaria certo com 3 semanas em vez de 19h:** a Conversão Personalizada ampla (`URL contém
obrigado-saogeraldo`), que acumularia os ~50 eventos/7 dias. O desenho do `RECONCILIACAO` não estava
errado — o relógio mudou. Vai para a seção 8.

---

## 7. O QUE NÃO É MÍDIA E RENDE MAIS QUE MÍDIA

> Com verba livre isto não some — fica mais gritante. Comprar lead ficou fácil. Atender continua
> sendo de graça, e continua não acontecendo.

| Etapa | Leads | dos quais MQL |
|---|---:|---:|
| **(não tocado)** | **10** | **4** |
| NÃO RESPONDEU | 8 | 3 |
| QUALIFICAÇÃO | 10 | 3 |
| INFORMAÇÃO CAPTADAS | 1 | 1 |
| **CADASTRO OK** | **2** | **2** |

**29 dos 31 leads não chegaram a CADASTRO OK. 32% nunca foram tocados.**

### O teto que agora manda na campanha

A equipe tocou **21 leads em 3 dias = 7 toques/dia.** Em 19h isso são **~6 toques** — e o backlog já é
de **29 leads**.

| Entrega nas 19h | Leads novos | Toques disponíveis | Leads que ninguém liga antes das 12h |
|---:|---:|---:|---:|
| ~R$286 (não fazer nada) | ~12 | ~6 | 6 + os 29 do backlog |
| **~R$545 (plano da seção 5)** | **~23** | **~6** | **17 + os 29 do backlog** |
| ~R$700 (entrega destravada) | ~29 | ~6 | 23 + os 29 do backlog |

**Dobrar a entrega dobra os leads comprados e não muda em nada quantos são atendidos.**

### A ação que a verba livre destrava, e que não é mídia

**Compre horas humanas hoje à noite.** Duas a três pessoas no telefone das **17h às 21h** — a janela
em que 45% dos leads chegaram, ou seja, a janela em que essas pessoas atendem. Custo: algumas centenas
de reais, **menos que meio dia de orçamento novo**. Retorno: sobe o teto de ~6 para ~18–20 toques.

**É isso que faz a seção 5 valer a pena.** É a única alavanca do documento que aumenta o
**denominador**, em vez de aumentar o numerador de uma fração que já não está sendo consumida.

### Quanto vale o backlog, em reais de mídia

- Os **4 MQL não tocados** custariam, ao CPMQL do `03` (R$23,55), **R$94 de mídia** — e ainda
  precisariam ser atendidos. Já estão pagos: **custo marginal zero.**
- Os **10 MQL vivos e não fechados** (4 não tocados + 3 não responderam + 3 em qualificação) =
  **~R$236 de mídia equivalente**.
- O backlog completo de 29 leads = **~R$603 de gasto já realizado** (29/31 × R$644,31) — **mais que a
  alocação inteira das 19h (R$545)**, disponível a custo zero.

**Conversão:** 2 CADASTRO OK de 9 MQL tocados = **22%**. Aplicado aos 4 MQL não tocados: **~1 CADASTRO
OK adicional**. Produzir esse mesmo 1 via mídia custaria ~4,5 MQL = **~R$106 no `03`**, mais tempo de
entrega, mais o mesmo atendimento que hoje não acontece.

### O inventário atendível é 20, não 13

A régua `≥100 cabeças **E** IE` existe para priorizar **assessoria**, não para definir **comprador de
leilão**. Um pecuarista com 60 cabeças e IE compra um touro sem problema — e 12 dos 13 MQL querem
**1 a 5 touros**. Dos 18 fora da régua, **11 caíram só por não ter IE**. O inventário elegível para
comprar é de **~20 leads**. A equipe trabalha uma régua **35% mais estreita** que a oportunidade real.

### As seis ações não-mídia, por ROI nas 19h

| # | Ação | Tempo | Por quê |
|---|---|---|---|
| **1** | **Escalar 2–3 pessoas para o telefone hoje, 17h–21h** | 1 telefonema | Sobe o teto de atendimento de 6 para ~18–20. É o que faz a seção 5 valer |
| **2** | **Reapontar a entrega do Formulário Instantâneo (plano A)** | 15 min | **Subiu de prioridade com o export.** O `03` — melhor criativo da conta, R$23,55/MQL — produz **10 de 10 leads via Instant Form**. O plano B ("Site apenas") **desliga o mecanismo do melhor criativo**. Plano A preserva as duas coisas |
| **3** | **`scripts/resgata-leads-instantform-saogeraldo.mjs`** — dry-run, conferir mapa 12–21, `--apply` | 30 min | Desbloqueia os 9 leads de Instant Form nunca tocados. **Quase todos são do `03`** — são os leads mais qualificados da conta (50% de MQL) e são justamente os invisíveis |
| **4** | **Ligar nos 7 MQL vivos** (4 não tocados + 3 não responderam), 17h–21h | ~1h, 2 assessores | ~R$165 de mídia equivalente, já paga |
| **5** | **Última chamada nos 29 não fechados** — trabalhar os **20 com IE**, não só os 13 MQL. Liderar com **30 parcelas** | 30 min | Custo zero. Ver seção 9 |
| **6** | **Grupo de WhatsApp** (`9217adc`) como broadcast na manhã do leilão | 10 min | Audiência própria, custo zero, e é onde o fecho acontece |

**As ações 1, 2 e 3 vêm ANTES do save do Degrau 1.**

---

## 8. HIERARQUIA DAS ALAVANCAS — o que vale quanto

| # | Alavanca | Valor nas 19h | Base |
|---|---|---|---|
| **1** | **Atendimento: 2–3 pessoas no telefone hoje** | destrava R$603 de mídia já paga + tudo que a mídia nova comprar | teto de 6 toques vs 23 leads comprados |
| **2** | **Criativo: matar `04`+`02`, escalar `03`+`05`** | **+3 a +6 MQL** | 30% da verba produzindo 0 MQL migra para R$23,55/MQL. Dentro do RMKT, +7 resultados numa comparação limpa (p≈5%) |
| **3** | **Orçamento: `RMKT` R$100 → R$600** | +2 a +4 MQL | melhor conjunto com menor orçamento; 70% de taxa de entrega |
| **4** | **Desligar `Aberto — Cópia`** | ~+2 MQL | CPM R$35,01 = 2,1x o do próprio original, sobre 2.839 impressões |
| **5** | **Idade 35 a 65+** | +1 a +2 MQL | R$151,38 vs R$66,80 por MQL (2,27x) |
| **6** | **Verificar Entrega / cobrança** | pré-requisito | 40% de entrega sobre R$900/dia autorizados |
| **7** | Excluir SP (não BA) | ~0 | evidência fraca; entra de graça no save |

**A alavanca de criativo passou a valer mais que a de orçamento e mais que a de conjunto.** Isso é
novo neste documento e vem inteiramente do export por anúncio.

### O subgasto — persiste, mas a composição mudou

**R$900/dia autorizados, ~R$361/dia entregues, 40%.** A subentrega percentual piorou (era 53% com
R$300/dia) enquanto a absoluta melhorou 2,3x. As duas coisas juntas dizem: **não existe teto rígido em
R$158/dia.** O que existe é (i) rampa de conjunto novo, que explica **R$411 dos R$539/dia** de gap, e
(ii) resíduo de **R$128/dia nos originais** (RMKT 70%, Aberto 51%) — a mesma assinatura de 29–30/07.

**5 minutos de verificação, antes de digitar orçamento:**

| Ordem | Checar | Onde | Tempo |
|---|---|---|---|
| 1 | **Coluna "Entrega"** dos conjuntos | "Limitado pelo limite de gastos da conta" / "pelo orçamento" é decisivo. **Vale mais que os outros três juntos** — distingue teto de conta de rampa | 1 min |
| 2 | Limite de gastos da conta | ☰ → Cobrança → Configurações de pagamento | 2 min |
| 3 | Limite de faturamento / cartão | Mesma tela. Cobrança recusada estrangula em silêncio | 2 min |
| 4 | Gasto do perpétuo hoje | Rodava a ~R$281/dia contra R$200 informados | 2 min |

Se a coluna não acusar limitação, **pare de caçar o teto e execute a seção 5** — a subentrega é rampa,
e consolidar orçamento nos conjuntos que já pacem é exatamente o conserto dela.

---

## 9. LEITURA HONESTA DA QUALIDADE E O TETO REAL

**42% de MQL (13 de 31)** é alto, mas é régua de **elegibilidade**, não de **intenção de compra**. Só
2 dos 13 MQL chegaram a CADASTRO OK (15%). **O problema não é o topo do funil; é o meio** — e
orçamento não conserta meio de funil.

**12 dos 13 MQL querem 1 a 5 touros.** O comprador captado é o pequeno e médio. A condição *"acima de
4 lotes: 1+29"* **quase não se aplica a ninguém que captamos**. Lidere com **30 parcelas
(2+2+2+2+2+20)** e **10% à vista** — incondicionais e feitas para quem compra 1 a 2 touros. Vale para
WhatsApp e grupo, **não** para os anúncios: editar criativo reinicia a entrega, e os `03`/`01`
carregam 23 dos 31 leads e a prova social dos posts.

**Não escreva "frete grátis" em lugar nenhum.** O catálogo tem faixa sob consulta e **região sem
entrega no Norte**; o mapa nunca foi lido (BRIEF §4). Claim genérico seria falso. A alternativa
correta é o silêncio.

**A geografia está pulverizada, não concentrada:** MG=4, MS=2, BA/SE/GO/PA/MA/RO/PE com 1 cada. E
**PA e RO estão entre os MQL**, com o catálogo declarando região sem entrega no Norte — **~15% dos MQL
podem estar em UF sem entrega ou sob consulta**. A ação **não** é cortar PA/RO no geo (o BRIEF proíbe
deduzir por geografia); **é o assessor perguntar o município antes de investir tempo de fecho.**

**Facebook 9 × Instagram 3 não é CPMQL** sem split de gasto por plataforma. **Não corte Instagram com
esse número.**

### O teto real

134 lotes; compradores de 1 a 5 touros; vender o catálogo exigiria **30 a 130 compradores**. A
campanha produziu **13 MQL e 2 CADASTRO OK**, a **R$58,57 por MQL pago**.

| Cenário nas 19h | Entrega | CPMQL esperado | MQL | CADASTRO OK (@22%) |
|---|---:|---:|---:|---:|
| Não fazer nada (pace atual, mix atual) | ~R$286 | R$58,57 | ~5 | 1 |
| **Plano da seção 5 (criativo + orçamento)** | **~R$545** | **R$40–55** | **10–14** | **2–3** |
| Plano + entrega destravada | ~R$700 | R$40–55 | 13–17 | 3–4 |
| **Verba infinita** | **~R$700** | — | **igual à linha acima** | **igual** |

**O CPMQL esperado MELHORA de R$58,57 para R$40–55 — e essa é a única linha do documento em que
gastar mais e gastar melhor acontecem juntos.** Vem inteiramente de tirar 30% da verba do `04`/`02`
(0 MQL) e colocar no `03` (R$23,55/MQL).

**A última linha responde ao "teto com verba infinita": ~R$700 de entrega, ~15 MQL, 3–4 CADASTRO OK.
Autorizar R$2.000/dia não muda uma célula.** A restrição deixou de ser dinheiro — é pacing de
conjunto, revisão de anúncio e tempo de calendário. E o que realmente trava são os **6 toques**
disponíveis na equipe.

**Para o cliente, sem enfeite:** esta campanha **não é o motor de venda do leilão** — é complemento. O
leilão será vendido pela base de relacionamento do criatório e da leiloeira. Dito isso, **3 a 4
CADASTRO OK**, num produto cujo ticket é um touro Nelore PO com selo de mãe de touro de central,
pagam R$545 de mídia com folga larga. **Teto baixo em volume, alto em retorno.**

---

## 10. O QUE FICA PARA DEPOIS DO LEILÃO

| # | Ativo | Por que é permanente |
|---|---|---|
| **1** | **O criativo `03` e o par `03` + Instant Form** | R$23,55/MQL, 50% de taxa de MQL, 5,7x a conversão do `01` no mesmo público (p≈5%). **É o achado mais valioso desta campanha.** Guarde o arquivo, o corte e a associação com a rota |
| **2** | **O teste que ficou faltando: `03` no público FRIO** | 592 impressões não testam nada. **Teste nº1 da próxima campanha:** conjunto frio dedicado com `03` e `05`, orçamento igual, 7 dias. Custa pouco e resolve a única pergunta grande que sobrou |
| **3** | **O `05`** | CPMQL R$16,96 com 5% da verba e resultado nos dois públicos. Nunca teve chance. n=2 — merece verba de teste real, não conclusão |
| **4** | **O público de retarget "web e inst"** — alcance 8.346 a **frequência 1,52** | Ativo mais rentável da conta e **comprovadamente longe de saturar**. Renomeie para perene e **não deixe expirar** |
| **5** | **A lista dos 31 leads** — 20 com IE, 13 MQL | Semente do **Lookalike 1%** que não deu tempo. Única forma de o algoritmo enxergar "≥100 cabeças + IE", porque a régua vive no servidor e não chega ao pixel. Precisa de **dias** |
| **6** | **Conversão Personalizada `URL contém obrigado-saogeraldo`** como evento de otimização | Inútil em 19h, **correta em setembro**: num ciclo de 3–4 semanas acumula os ~50 eventos/7 dias |
| **7** | **Corrigir a regra do perpétuo — excluir `saogeraldo`** | **3 minutos, dano contínuo.** Todo MQL do leilão conta como conversão do perpétuo, envenenando uma campanha que **segue rodando depois de 01/08**. Dívida corrente, não do leilão |
| **8** | **Reapontar o Instant Form (plano A)** | Instant Form e landing convertem em MQL a **43% vs 41%** — e o `03` faz **50%**. A rota é a melhor da conta; o encanamento é que está errado. Se hoje sair só o plano B, isto vira prioridade de 02/08 |
| **9** | **O formulário de 7 campos em 3 passos** | O confundidor do §3.6 vira hipótese de produto: se parte da vantagem do `03` é fricção de formulário, **reduzir campos da landing é a maior alavanca de conversão fora de mídia**. Testar em agosto |
| **10** | **"Editar, não duplicar" — agora com fatura** | R$411/dia de orçamento parado em conjuntos novos que não pacem, 76% do subgasto. Não é doutrina, é preço |
| **11** | **O conjunto `RMKT - escala`** | A intenção estava certa — o retarget precisava de capacidade. Chegou tarde e com criativo em revisão. **Regra para a próxima: conjunto de escala sobe 72h antes, com criativo já aprovado** |
| **12** | **O número de pacing desta noite** | O primeiro dado real de **quanto esta conta entrega quando orçamento não é o limite**. Anote a entrega por conjunto às 11h de 01/08. Dimensiona toda campanha futura |
| **13** | **Pico 17h–21h (45% dos leads)** | Regra de programação em campanha com orçamento vitalício, e regra de escala de atendimento |
| **14** | **Grupo de WhatsApp da página de obrigado** (`9217adc`) | Audiência própria, custo zero, sobrevive a qualquer campanha |
| **15** | **Segunda régua: "comprador de leilão" = tem IE** | A régua de MQL subestima o inventário atendível em **~35%**. Separe a régua de **assessoria** da de **compra** |
| **16** | **O teto de atendimento: 7 toques/dia** | O número mais importante que esta campanha produziu. Enquanto for 7, **nenhuma verba acima de ~R$400/dia faz sentido em janela curta** |
| **17** | **Correção do GTM (`gtm.dom` virando evento)** | Adiada de propósito. **A partir de 02/08 o risco acabou.** Não deixe morrer junto com a campanha |

---

## 11. CHECKLIST DAS PRÓXIMAS 19H

**16h30 — antes do pico:**
1. Coluna "Entrega" dos conjuntos. 1 min. Distingue teto de conta de rampa.
2. Telefonema escalando 2–3 pessoas para 17h–21h.
3. Reapontar Instant Form — **plano A**, não B (o plano B desliga o mecanismo do `03`).
4. **Save único.** Conjuntos: desligar `Aberto — Cópia` · `RMKT` R$100→R$600 · `RMKT — Cópia`
   R$300→R$400 · `Aberto` R$200→R$500 · Limite de Gastos da Campanha R$900 · **término 01/08 11h00 em
   todos, inclusive o `escala`**. Anúncios: desligar **`04`** e **`02`** em todos · desligar `01` e
   `04` **dentro do `RMKT`** · adicionar **`03`** ao `RMKT — Cópia` e ao `escala` · subir `05` ·
   manter `01` **só no Aberto**. **Sem tocar em segmentação.**

**17h–21h — pico (45% dos leads):**
5. Dry-run + `--apply` do script de resgate (os leads invisíveis são quase todos do `03`).
6. Ligação nos 7 MQL vivos, depois nos 20 com IE. Perguntar o município (Norte).
7. Última chamada nos 29 — liderando com 30 parcelas, jamais com frete.

**22h — save único de segmentação:**
8. Idade 35 a 65+ · excluir SP (**não BA**) · conferir share de Audience Network · ler frequência dos
   dois RMKT (>3 consolida num só).
9. **Checkpoint de entrega:** se o total estiver abaixo de R$200, **religue a Aberto-Cópia**.

**00h05 de 01/08:** reconfirmar orçamentos e datas de término. **Decidir o teste do `03` no frio:** se
ele tiver >1.500 impressões e ≥1 resultado no Aberto, promova; se continuar sufocado abaixo de 1.000
impressões, pause o `01` no Aberto para as últimas 11h.

**06h00:** se houver folga >R$300 no limite de campanha, `RMKT` para R$800/dia. Nada novo sobe.

**11h00:** término automático.
