# Auditoria de medição — GTM · Meta · GA4

**Data:** 27/07/2026 · **Container auditado:** `GTM-K8RXFDDT` (versão publicada)
**Objetivo:** entender como Pageview e MQL são medidos hoje, para melhorar a qualidade do tráfego pago.

## Como esta auditoria foi feita

A configuração publicada de um container GTM é servida **publicamente** em
`https://www.googletagmanager.com/gtm.js?id=GTM-K8RXFDDT`. Baixei e decodifiquei o blob de
configuração (`tags`, `predicates`, `rules`, `macros`). **Nenhuma credencial foi usada** e nada
foi alterado. Tudo abaixo é fato extraído do container publicado, não inferência.

Reprodutível:
```bash
curl -s "https://www.googletagmanager.com/gtm.js?id=GTM-K8RXFDDT" -o gtm.js
```

---

## 1. O que existe no container

**5 tags, 6 condições, 4 regras.** Inventário completo:

| Tag | Tipo | Configuração |
|---|---|---|
| `tag[0]`, `tag[1]` | Google tag | GA4 `G-X00P526WF7` |
| `tag[2]` | GA4 Event (`__gaawe`) | nome do evento = **valor cru do `event` do dataLayer** |
| `tag[3]` | Meta Pixel | **`1539780341180483`** · evento *variável* (via lookup) |
| `tag[4]` | Meta Pixel | **`899641089812500`** · evento padrão **PageView** |

**Duas contas de pixel diferentes.** Elas não conversam entre si.

### As 4 regras de disparo

| Regra | Condição | Dispara |
|---|---|---|
| 0 | `event = gtm.init` | Google tag |
| 1 | `event = gtm.dom` | Google tag + **GA4 Event** + **Meta `1539…`** |
| 2 | **qualquer `event`** *a menos que* contenha `gtm.` | **GA4 Event** + **Meta `1539…`** |
| 3 | URL contém `/obrigado-jmp.html` **e** `event = gtm.js` | Meta `899…` PageView |

### O mapa de eventos do Meta (`macro[10]`)

Traduz nome de evento GA4 → evento padrão do Meta: `generate_lead`→`Lead`,
`begin_checkout`→`InitiateCheckout`, `add_to_cart`→`AddToCart`, etc.
**Com `setDefaultValue = true` e default = o próprio nome cru.**
Ou seja: evento que não está no mapa vira **evento customizado com o nome literal**.

---

## 2. 🔴 Achados críticos

### 2.1 O MQL de touros NÃO é medido no GTM

Não existe **nenhum** acionador para `/obrigado-touros-mql` ou `/obrigado-touros-lead`.
Buscas no container publicado: `touros` → **0 ocorrências**. `obrigado` → **apenas `obrigado-jmp`**.

O comentário em `src/app/touros/_lib/analytics.ts` afirma que *"a tag (fb_conversions_mpi) roda
no GTM pelo gatilho Page View da URL de obrigado (/obrigado-touros-mql)"*. **Esse acionador não
existe na versão publicada.** A documentação do código descreve algo que não está no ar.

**Consequência:** ou o perpétuo converte por *Conversão Personalizada por URL* no Events Manager
(fora do GTM), ou não está sendo medido. Só o Events Manager responde — exige login.

### 2.2 Lixo entrando em GA4 e Meta em todo pageview

A regra 1 dispara no evento `gtm.dom`, e o nome do evento GA4 é o **valor cru** do `event`.
Resultado: **toda página envia ao GA4 um evento literalmente chamado `gtm.dom`**, e ao Meta um
evento customizado de mesmo nome (não está no mapa → cai no default).

Isso polui os relatórios dos dois lados e degrada qualquer otimização baseada em evento.

### 2.3 O catch-all é mais amplo do que se pensava

A regra 2 (`event` casa `.+` **exceto** contendo `gtm.`) dispara **GA4 Event e Meta Pixel** a
cada push ao `dataLayer`. Não era só o Meta, como o código sugeria.

Na `main`, `touros/_lib/analytics.ts` **empurra ao dataLayer** (`touros_view`,
`touros_form_started`, `touros_step_attempt`, `touros_validation_failed`…). Cada um vira um
evento GA4 e um evento Meta. O commit `e437ed1`, que remove esses pushes, **está numa branch não
mergeada** — a produção do perpétuo roda com o problema ativo.

> A landing nova (`/saogeraldo`) **não** empurra nada ao dataLayer — verificado. Ela é imune ao
> catch-all. Essa proteção é de CÓDIGO: se alguém reintroduzir push, o problema aparece nela também.

### 2.4 Não existe conversão de Google Ads

Nenhuma tag `AW-`, nenhum rótulo de conversão. **O Google Ads não recebe conversão pelo GTM.**
Qualquer otimização por lance inteligente depende de importar conversão do GA4 — o que exige
que os eventos do GA4 estejam limpos, e hoje não estão (2.2 e 2.3).

### 2.5 O PageView padrão do Meta cobre uma página só

O único `PageView` padrão é a `tag[4]`, e ela dispara **exclusivamente** em `/obrigado-jmp.html`
— e no pixel `899…`, não no `1539…`. O pixel principal nunca recebe um `PageView` padrão; o que
chega nele é o evento-lixo de 2.2.

---

## 3. O que isso significa para o tráfego pago

O pedido é melhorar a qualidade do tráfego pago. Os três problemas que mais atrapalham isso:

1. **Não há sinal de conversão limpo para o algoritmo aprender.** Sem conversão no Google Ads e
   com eventos poluídos no GA4/Meta, o lance inteligente otimiza por ruído.
2. **Não há diferenciação de valor entre MQL e lead comum no que o container envia.** A régua de
   MQL (≥100 cabeças + IE) existe e é decidida no servidor, mas essa qualificação não chega às
   plataformas via GTM. As plataformas otimizam por volume, não por lead que vale.
3. **Evento-lixo em todo pageview** degrada modelagem, públicos semelhantes e atribuição.

---

## 4. O que só você pode verificar (exige login)

Nada abaixo é acessível sem credencial. São perguntas objetivas, com o motivo de cada uma:

### Meta — Events Manager
- [ ] **A regra da Conversão Personalizada do perpétuo.** Se for `URL contém obrigado` em vez de
      `obrigado-touros`, **todo lead do leilão São Geraldo vira conversão do perpétuo** e nenhuma
      config de GTM impede. É o risco mais imediato do lançamento.
- [ ] Quais dos dois pixels (`1539…` / `899…`) está de fato ligado às campanhas ativas.
- [ ] Qualidade de correspondência de evento e se há deduplicação por `event_id`.
- [ ] Se existem eventos customizados chamados `gtm.dom` ou `touros_*` sujando a conta.

### GA4 — `G-X00P526WF7`
- [ ] Quais eventos estão marcados como **evento-chave (conversão)**.
- [ ] Se `gtm.dom` aparece na lista de eventos (confirma 2.2 no dado real).
- [ ] Se há vínculo ativo com o Google Ads e quais conversões são importadas.

### Google Ads
- [ ] Quais ações de conversão existem e quais estão em "conversões primárias".
- [ ] Se alguma vem do GA4 e se está sendo usada para lance.

---

## 5. Recomendações, em ordem de impacto

1. **Ler a regra da Conversão Personalizada no Meta antes de subir campanha do leilão.**
   Bloqueia contaminação entre os dois funis. Custo: 5 minutos.
2. **Mergear o `e437ed1`** (remoção dos pushes ao dataLayer) na `main`, para o perpétuo parar de
   alimentar o catch-all. Já está pronto, só não foi mergeado.
3. **Corrigir a regra 1**, para o `gtm.dom` não virar evento em GA4/Meta. É uma exceção a
   adicionar — mas mexe em regra que já está no ar; fazer em workspace próprio e testar no Preview.
4. **Criar conversão de Google Ads**, nem que seja via importação do GA4, para as campanhas
   poderem otimizar por lead.
5. **Levar a régua de MQL às plataformas.** As URLs de obrigado separadas já resolvem isso por
   Conversão Personalizada — é o desenho do lançamento e vale retroaplicar ao perpétuo.

> **Nada aqui foi alterado.** Esta auditoria é somente leitura. Qualquer mudança no container
> deve ser feita em workspace dedicado: publicar sobe o workspace inteiro, e há indício de
> trabalho não publicado (o acionador de touros que o código descreve e o container não tem).
