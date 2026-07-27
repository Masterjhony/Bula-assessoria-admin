# Auditoria Meta — consolidação em UM pixel

**Data:** 27/07/2026 · **Container:** `GTM-K8RXFDDT` (versão publicada)
**Escopo:** somente Meta. GA4 e Google Ads ficaram de fora por decisão do Boss.
**Base:** complementa `AUDITORIA-MEDICAO.md` — não repete o que já está lá.

## Método

Mesma técnica da auditoria anterior, aprofundada na camada Meta: a config publicada do
container é servida publicamente. Baixei, isolei o blob `var data`, e desta vez resolvi as
cadeias completas — tag → macro → lookup → template.

```bash
curl -s "https://www.googletagmanager.com/gtm.js?id=GTM-K8RXFDDT" -o gtm.js
```

Também fiz **um** GET no healthcheck público do container server-side (§6). Nenhuma
credencial usada, nada alterado, nada no Events Manager acessado.

---

## 0. Correção à auditoria anterior (Meta)

Dois achados de `AUDITORIA-MEDICAO.md` estão corretos para o GA4 e **incorretos para o Meta**.
A extração estava certa; faltava resolver o lookup e o template. Registro aqui porque isso
muda a decisão de consolidação.

**`macro[10]` contém a chave `gtm.dom` → `PageView`.** O mapa completo:

| Evento do dataLayer | Evento Meta |
|---|---|
| `add_payment_info` | AddPaymentInfo |
| `add_to_cart` | AddToCart |
| `add_to_wishlist` | AddToWishlist |
| `begin_checkout` | InitiateCheckout |
| `generate_lead` | **Lead** |
| **`gtm.dom`** | **PageView** |
| `page_view` | PageView |
| `purchase` | Purchase |
| `search` | Search |
| `sign_up` | CompleteRegistration |
| `view_item` | ViewContent |

E o template é o **`tmSimo-GTM-WebTemplate` v2.0.8**, cuja lógica compilada é:

```
aE = (listaDeEventosPadrao.indexOf(nomeResolvido) == -1) ? "trackSingleCustom" : "trackSingle"
```

Ou seja: nome que **é** evento padrão sai como `trackSingle` (padrão), não como custom.

**Consequências das duas correções:**

- ❌ *"toda página envia ao Meta um evento customizado chamado `gtm.dom`"* — **não.** Vira
  `PageView` padrão. (Para o **GA4** a crítica continua válida: a `tag[2]` usa o nome cru.)
- ❌ *"o pixel principal nunca recebe um PageView padrão"* — **não.** O `1539…` recebe
  `PageView` padrão em **toda** página, via regra 1.

Isso é bom: o pixel principal tem cobertura de PageView site-wide. E é justamente o que
sustenta a recomendação de qual pixel sobrevive.

---

## 1. Qual pixel sobrevive: **`1539780341180483`**

A evidência é assimétrica a ponto de não haver escolha real.

| Critério (do container) | `1539780341180483` | `899641089812500` |
|---|---|---|
| Tags que o usam | `tag[3]` | `tag[4]` |
| Quando dispara | regra 1 (**toda página**) + regra 2 (catch-all) | **só** URL contendo `/obrigado-jmp.html` **e** `event=gtm.js` |
| Eventos que envia | `PageView` + qualquer evento mapeado (`Lead`, `InitiateCheckout`, …) | **apenas** `PageView` |
| `eventID` (dedup) | **sim** — `vtp_eventId = macro[9]` | **não** — parâmetro ausente |
| Advanced Matching | ausente (desligado) | `false` explícito |
| Integrado ao caminho server-side | **sim** (§6) | não |

**Justificativa técnica:**

1. **Só o `1539…` pode ter histórico relevante.** O `899…` dispara em **uma única URL
   legada** e envia **só PageView** — nunca recebeu evento de conversão. Um pixel que
   nunca viu `Lead` não tem sinal de conversão para o algoritmo aprender.
2. **Só o `1539…` está preparado para deduplicação.** É o único com `eventID`, e é o único
   amarrado à arquitetura cliente+servidor (§6). Aposentar ele significaria refazer essa
   integração inteira.
3. **O custo de migração é assimétrico.** Aposentar o `899…` = remover 1 tag e 1 regra
   (`rule[3]`) e apagar `macro[15]`. Aposentar o `1539…` = reescrever `tag[3]`, `macro[9]`,
   `macro[13]`, as regras 1 e 2, e reconfigurar o container server-side.

> **Ressalva honesta:** isto prova qual pixel tem a *arquitetura*. Não prova qual está
> **vinculado às campanhas ativas** nem qual tem **volume de eventos** — isso só o Events
> Manager responde (§7). Se o `899…` estiver amarrado a campanhas rodando, a ordem dos
> passos muda, mas não a escolha do sobrevivente.

---

## 2. O que se perde ao aposentar o `899641089812500`

Decisão de negócio. O que se perde de verdade:

**Perde-se, sem recuperação:**
- **Públicos personalizados de site** construídos nesse pixel. Público **não se transfere**
  entre pixels — não existe migração, exportação nem merge. Um público de "visitantes de
  `/obrigado-jmp.html`" morre com o pixel.
- **Semelhantes (lookalikes)** derivados desses públicos. Um lookalike é ancorado no público
  de origem; sem a origem sendo alimentada, ele deixa de ser atualizável.
- **Conversões personalizadas** definidas sobre ele, e o histórico de otimização de qualquer
  campanha que as use. Trocar o pixel de uma campanha ativa **reinicia a fase de aprendizado**.

**NÃO se perde:**
- **Relatório histórico.** Os eventos já registrados continuam visíveis no Events Manager e
  no Ads Manager. Aposentar um pixel não apaga o passado.
- **Nada precisa ser deletado.** "Aposentar" aqui = **parar de enviar eventos**. O pixel
  continua existindo. Isso torna a ação reversível: se algo quebrar, basta religar a tag.

**A nuance que importa:** públicos de site do Meta têm janela de retenção (até 180 dias).
Um público do `899…` não some no dia seguinte — ele **decai** conforme a janela passa e
ninguém novo entra. Existe, portanto, uma janela para reconstruir o equivalente no `1539…`
antes que o público antigo perca utilidade.

**Mitigação recomendada:** antes de desligar, criar no `1539…` os públicos equivalentes.
Como o `1539…` já recebe PageView em toda página (incluindo `/obrigado-jmp.html`, coberta
pela regra 1), **os dados para reconstruir esses públicos já estão sendo coletados nele**.
Isso reduz muito o custo real da consolidação — provavelmente a zero, dependendo de quais
públicos existem hoje (pergunta §7).

---

## 3. Plano de consolidação

Ordenado por risco crescente. Cada passo diz de quem é.

### Fase 0 — Antes de tocar em qualquer coisa (Events Manager · **humano, Boss**)
1. Listar campanhas ativas e o pixel de cada uma.
2. Listar públicos e semelhantes por pixel, e quais campanhas os usam.
3. Listar conversões personalizadas por pixel e **ler a regra de cada uma** (§5).
4. Confirmar se `1539…` e `899…` estão no mesmo Business Manager.

> Se qualquer campanha ativa usar o `899…`, **pare** e trate migração de campanha antes —
> trocar pixel de campanha viva reinicia aprendizado e não deve ser feito no meio de um
> lançamento com data marcada.

### Fase 1 — Reconstruir antes de desligar (Events Manager · **humano, Boss**)
5. Criar no `1539…` os públicos equivalentes aos do `899…`. Os dados já existem lá.
6. Deixar rodando em paralelo por um período de acúmulo antes de desligar a fonte antiga.

### Fase 2 — GTM (workspace dedicado · **humano, com revisão**)
7. Em **workspace novo**, remover `tag[4]` e `rule[3]`. Remover `macro[15]` se ficar órfão.
8. Adicionar as tags de conversão do §4 no `1539…`.
9. Validar no **Preview**: em `/obrigado-jmp.html` deve sair PageView só do `1539…`; nas URLs
   de obrigado deve sair `PageView` + `Lead`.
10. Publicar.

> ⚠️ **Publicar sobe o workspace inteiro.** A auditoria anterior já indicava trabalho não
> publicado no container (o acionador de touros que o código descreve e o container não tem).
> Conferir o que mais está no workspace antes de publicar, ou o publish leva junto.

### Fase 3 — Verificação (**humano**)
11. Events Manager → Test Events: confirmar `Lead` chegando com o valor certo por URL.
12. Confirmar que o `899…` parou de receber eventos.
13. Só então considerar o `899…` aposentado. **Não deletar** — deixar inativo.

---

## 4. MQL vs. lead comum no pixel único

### O problema, hoje

Não existe acionador para nenhuma URL de obrigado além da `/obrigado-jmp.html`. Buscas no
container: `touros` → **0**, `saogeraldo` → **0**.

E as landings novas **não empurram nada ao dataLayer** (decisão de código, correta). Logo a
regra 2 (catch-all) não tem o que disparar nelas.

> **Resultado líquido: hoje, quando um lead do leilão converte, o Meta recebe apenas
> `PageView`. Nenhum `Lead`. O pixel não tem como otimizar por lead — nem por volume, nem
> por valor.** Este é o achado mais grave desta auditoria para o lançamento.

### O desenho recomendado

A régua de MQL é decidida no servidor e **já está codificada na URL** — `/obrigado-saogeraldo-mql`
vs `/obrigado-saogeraldo-lead`. Isso é tudo que o Meta precisa: não é necessário passar valor
pelo dataLayer (o que reacionaria o catch-all).

**Duas tags no `1539…`, evento padrão `Lead`, disparo por Page View de URL:**

| Tag | Aciona quando a URL contém | Evento | `value` | `currency` |
|---|---|---|---|---|
| Lead — SG MQL | `/obrigado-saogeraldo-mql` | `Lead` | maior | BRL |
| Lead — SG comum | `/obrigado-saogeraldo-lead` | `Lead` | menor | BRL |

Por que **`Lead` padrão** e não um evento customizado por funil: evento padrão entra nos
modelos de otimização do Meta; evento customizado raro **fragmenta o volume** e deixa a
campanha presa na fase de aprendizado. Um leilão de janela curta não tem volume para bancar
um evento próprio.

Por que **`value` diferente** e não duas conversões separadas: é assim que se otimiza por
*lead que vale*. Com value-based bidding, o algoritmo persegue o `value` — MQL valendo mais
faz ele buscar quem tem ≥100 cabeças + IE, não quem preenche formulário.

**Os números de `value` não estão nesta auditoria de propósito** — não vi dado de ticket
médio nem de taxa de conversão por faixa. Definir isso é decisão do Boss com a mídia; o que
o desenho exige é apenas que **MQL > comum**, e que o gradiente seja relevante.

**Separação por funil** (para relatório e para campanha) sai de `content_category` ou de
Conversões Personalizadas por URL — ver §5.

### Alternativa de risco zero, se o lançamento for iminente

Se não houver janela para publicar o container: criar **Conversões Personalizadas** no
Events Manager sobre o `PageView` que **já dispara** nas URLs de obrigado. Funciona sem
tocar no GTM, e dá metas separadas por funil. Limitações: `value` fixo por regra, sinal mais
fraco que evento padrão, e há teto de conversões personalizadas por conta.

Recomendo a alternativa como **ponte**, não como destino.

---

## 5. Dedup e contaminação entre os três funis

### 5.1 Contaminação — o risco concreto

Três funis passam a dividir o `1539…`: JMP, touros perpétuo e leilão São Geraldo. Todos
disparam `PageView` em toda página, via regra 1. A separação **só** pode vir da URL.

As URLs de obrigado, hoje:

```
/obrigado-jmp.html            ← JMP
/obrigado-touros-lead|mql     ← touros perpétuo
/obrigado-saogeraldo-lead|mql ← leilão São Geraldo
```

> ✅ **CONFIRMADO PELO BOSS EM 27/07, e é pior do que a hipótese.** A regra real do
> perpétuo é `URL contém obrigado` **E** `URL contém mql`. Nossa URL
> `/obrigado-saogeraldo-mql` contém as duas palavras → **casa**. Análise completa e
> decisão pendente no **§8**.

> 🔴 **Uma Conversão Personalizada com regra `URL contém "obrigado"` casa com os três.**
> Todo lead do leilão viraria conversão do perpétuo e do JMP simultaneamente. Nenhuma
> configuração de GTM impede isso — a regra vive no Events Manager.

A auditoria anterior já levantou isso; reforço com as strings exatas. **Regra de isolamento:
toda conversão personalizada tem que casar o segmento do funil**, nunca só `obrigado`:

| Funil | Regra correta |
|---|---|
| JMP | URL contém `obrigado-jmp` |
| Touros perpétuo | URL contém `obrigado-touros` |
| Leilão SG | URL contém `obrigado-saogeraldo` |

Note que `obrigado-touros` **não** casa com `obrigado-saogeraldo` — os prefixos são
disjuntos. O desenho de URL já isola; o que falha é regra preguiçosa.

### 5.2 Dedup — está arquitetado, mas não pude verificar o outro lado

O container **tem** um caminho server-side montado, e ele é claramente para Meta:

- `tag[1]` (Google tag) define
  `transport_url = https://server-side-tagging-3hk3e67aaq-uc.a.run.app` e `send_page_view=false`.
- `tag[2]` (GA4 event) envia ao servidor, além dos parâmetros normais:

| Parâmetro | Valor | Para que serve |
|---|---|---|
| `event_id` | `macro[9]` | **mesma** chave do `eventID` do pixel no browser |
| `event_name` | `macro[10]` | nome do evento **no vocabulário do Meta**, não do GA4 |
| `x-fb-ck-fbp` | cookie `_fbp` | parâmetro que a tag de CAPI lê no server |
| `x-fb-ck-fbc` | cookie `_fbc` | idem |

- `macro[9]` = `"a462b4b5-…-1e9a0b9aeb77_" + gtm.start + "." + gtm.uniqueEventId` — o **mesmo**
  valor vai ao pixel do browser (`tag[3].vtp_eventId`) e ao servidor.

Isto é um desenho coerente de **Pixel + CAPI com deduplicação por `event_id`**. Quem montou
sabia o que estava fazendo. O healthcheck do container server-side responde **200**, então
ele está no ar.

**O que não consigo verificar:** a config do container server-side **não é pública**
(`/gtm.js` → 400). Não sei se existe tag de CAPI lá dentro, para **qual pixel** ela envia,
nem se o token está válido. Vira pergunta (§7).

**As três armadilhas de dedup, se o CAPI estiver ativo:**

1. **Nome de evento tem que bater.** Dedup do Meta exige `event_name` **e** `event_id`
   iguais nos dois lados. O `event_name` que vai ao servidor é `macro[10]`, resolvido a
   partir do `event` do dataLayer. Nas landings novas, que não empurram nada, o evento é
   `gtm.dom` → resolve para `PageView`. **Se eu adicionar uma tag de `Lead` no browser
   (§4), o servidor continuará mandando `PageView` naquela página** — não haverá par para
   deduplicar. O `Lead` ficaria só no browser, sem a redundância do CAPI.
2. **`eventID` só existe no `tag[3]`.** Qualquer tag nova de `Lead` precisa receber
   `macro[9]` explicitamente, ou nasce sem chave de dedup.
3. **Um `event_id` por evento por page load.** `macro[9]` usa `uniqueEventId`, que é um
   contador por carregamento. Isso é adequado — mas significa que o ID **não é reproduzível
   pelo servidor da aplicação**. O `event_id` que nossa rota gera (`crypto.randomUUID()` no
   `Formulario`) **não tem relação nenhuma** com o `macro[9]`. São dois espaços de ID
   distintos. Se um dia alguém mandar CAPI direto do nosso backend, **não vai deduplicar
   contra o pixel** — vai dobrar a contagem.

> O item 3 é a armadilha mais fácil de cair, porque o código *parece* já resolver dedup: a
> rota devolve `id` e o `Formulario` passa `eventId` ao `trackLeadConversion`. Esse ID hoje
> vai só ao PostHog. Ele **não** é o ID que o Meta usa.

### 5.3 Isolamento recomendado, em uma frase

Um pixel, evento `Lead` padrão para todos os funis, `value` diferenciando MQL de comum, e a
separação entre funis feita por **URL** — em Conversão Personalizada e em `content_category`
— nunca por regra genérica de `obrigado`.

---

## 6. Inventário Meta do container (referência)

```
tag[3]  __cvt_5RM3Q  pixel = 1539780341180483  (macro 13)
        eventName    = "variable" → macro[10] (lookup)
        eventId      = macro[9]
        dispara em   : rule[1] (event=gtm.dom) e rule[2] (catch-all)

tag[4]  __cvt_5RM3Q  pixel = 899641089812500   (macro 15)
        eventName    = "standard" → "PageView"
        eventId      = ausente
        advancedMatching = false · consent = true
        dispara em   : rule[3] (URL contém /obrigado-jmp.html E event=gtm.js)

template: tmSimo-GTM-WebTemplate v2.0.8
          padrão → fbq trackSingle · não-padrão → fbq trackSingleCustom

server-side: https://server-side-tagging-3hk3e67aaq-uc.a.run.app  (/healthy → 200)
```

---

## 7. O que exige o login do Boss

Nada abaixo é acessível sem credencial. Cada pergunta traz o motivo.

### Bloqueia a decisão de consolidação
- [ ] **Quais campanhas ativas usam o `899641089812500`?**
      *Motivo:* se houver alguma, trocar o pixel reinicia a fase de aprendizado dela. Muda o
      cronograma, não a escolha do sobrevivente.
- [ ] **Volume de eventos dos últimos 28 dias em cada pixel.**
      *Motivo:* confirma no dado real o que o container sugere — que o `899…` quase não
      recebe evento. É a evidência que fecha a justificativa.
- [ ] **Os dois pixels estão no mesmo Business Manager?**
      *Motivo:* se não, a consolidação envolve compartilhamento de ativos entre contas, o
      que tem burocracia própria.

### Bloqueia o lançamento (mais urgente que a consolidação)
- [ ] **Qual a regra exata de cada Conversão Personalizada existente?**
      *Motivo:* se alguma for `URL contém obrigado`, os três funis se contaminam no dia em
      que o leilão subir. É o risco de §5.1 e custa 5 minutos para conferir.
- [ ] **Existe tag de Meta CAPI no container server-side? Para qual pixel ID?**
      *Motivo:* define se o `Lead` do browser terá par para deduplicar (§5.2, item 1). Se
      houver CAPI apontando para um pixel e o browser para outro, a conta já está dobrando
      contagem hoje.

### Necessário para não perder ativo
- [ ] **Quais públicos e semelhantes existem em cada pixel, e quais campanhas os usam?**
      *Motivo:* público não se transfere entre pixels (§2). É o que precisa ser recriado no
      `1539…` **antes** de desligar o outro.
- [ ] **Qualidade de correspondência de evento (EMQ) de cada pixel.**
      *Motivo:* o Advanced Matching está desligado nos dois. Saber o EMQ atual diz quanto se
      ganharia ligando — e se vale entrar nesse escopo.

### Necessário para calibrar valor
- [ ] **Ticket médio e taxa de fechamento de MQL vs. lead comum.**
      *Motivo:* é o que define os números de `value` do §4. Sem isso, o gradiente seria
      chute, e chute em value-based bidding ensina a coisa errada ao algoritmo.

---

> **Nada foi alterado.** Auditoria somente leitura: download da config pública do container e
> um GET no healthcheck público do container server-side. Nenhum acesso ao Events Manager,
> nenhuma mudança no GTM, nenhuma mudança em código.

---

## 8. ~~Contaminação CONFIRMADA — análise das saídas A e B~~ — **SEÇÃO INVALIDADA**

> 🔴 **TODA A §8 ESTÁ MORTA. NÃO EXECUTE NADA DAQUI.** Superada por
> `GTM.md` §4.3 em 27/07/2026.
>
> **Por quê:** a §8 inteira parte de que a regra do perpétuo é
> `URL contém obrigado` **E** `URL contém mql`. As regras foram **lidas direto na
> conta pela Meta API** e não são isso. A regra real de `MQL Perpetuo Touros`
> (id `1411024464255046`, pixel `1539780341180483`) é:
>
> ```
> PageView  E  URL contém  https://touros.bulaassessoria.com/obrigado-touros-mql
> ```
>
> Um único `contains`, **com o hostname inteiro dentro**. `saogeraldo.bulaassessoria.com`
> não casa. **Não existe colisão.** A §8.1, que era a base de tudo, está errada.
>
> **Consequências:**
> - **Saída A (estreitar a regra do perpétuo): CANCELADA.** A regra já é
>   host-específica. Não há o que estreitar, nada a editar no perpétuo, e portanto
>   nenhum risco de recriar conversão / reapontar conjunto / reiniciar aprendizado.
>   A "pergunta bloqueante" da §8.5 sobre editabilidade ficou **sem objeto**.
> - **Saída B (renomear para `-qualificado` / `-simples`): CANCELADA.** As URLs
>   `/obrigado-saogeraldo-mql` e `/obrigado-saogeraldo-lead` **ficam como estão**.
>   Nada a renomear em rota, `Formulario.tsx`, GTM ou docs.
> - **O pré-requisito "ler a regra do lead comum do perpétuo" está RESPONDIDO:**
>   essa conversão **não existe**. O pixel `1539780341180483` tem exatamente duas
>   conversões — `MQL Perpetuo Touros` e `lead-leilao-jmp` — e a segunda também
>   casa host inteiro (`https://jmp.bulaassessoria.com/obrigado-jmp.html`).
>
> **O que sobrevive desta seção:** só o item 5 da §8.4 — criar as Conversões
> Personalizadas **do lançamento**, com regra específica. Está em `GTM.md` §7.3.
>
> **A regra frouxa que de fato existe** (`LEAD-WPP`, `URL contém /obrigado`) está
> em **outro pixel** (`2009772743084271`, conta `Formula do Boi!`) que não dispara
> nas páginas do São Geraldo ⇒ inerte para este projeto. Detalhe em `GTM.md` §4.3.
>
> Texto original preservado abaixo apenas como registro do raciocínio descartado.

---

**Dado novo, conferido pelo Boss na conta em 27/07:** ⚠️ *(este "dado" é o que se
provou incorreto — ver o bloco acima)*

1. A Conversão Personalizada do perpétuo tem regra **`URL contém obrigado` E `URL contém mql`**
   — não é só `obrigado`, como a §5.1 levantou por hipótese.
2. Para o leilão São Geraldo **a Conversão Personalizada ainda não existe.** Falta criar.

### 8.1 A colisão, verificada

| URL | casa `obrigado` + `mql`? | Tem tráfego hoje? |
|---|---|---|
| `/obrigado-jmp.html` | não | sim |
| `/obrigado-touros-lead` | não | sim |
| **`/obrigado-touros-mql`** | **sim** | **sim** |
| **`/obrigado-saogeraldo-mql`** | **sim** ← colisão | **não** (não lançou) |
| `/obrigado-saogeraldo-lead` | não | não |

Contaminação real: todo lead MQL do leilão seria contado **também** como conversão do
perpétuo. O Boss está certo no diagnóstico.

> Note a última coluna. Ela é o fato que decide esta seção.

### 8.2 Saída A — estreitar a regra do perpétuo para `obrigado-touros`

**O que muda no conjunto de eventos que casam com a regra:**

| | Antes (`obrigado` + `mql`) | Depois (`obrigado-touros` + `mql`) |
|---|---|---|
| URLs com tráfego que casam | `/obrigado-touros-mql` | `/obrigado-touros-mql` |
| URLs sem tráfego que casam | `/obrigado-saogeraldo-mql` | — |

**O conjunto de eventos reais é IDÊNTICO.** Estreitar a regra **hoje** remove exatamente
**zero** eventos, porque a única URL que a regra frouxa pegava a mais ainda não existe em
produção — o leilão não lançou.

Isso desmonta a premissa de risco:

- **Volume não cai** → a campanha não entra em "aprendizado limitado" por queda de volume.
- **Meta não reprocessa histórico** ao editar uma Conversão Personalizada — verdade, e aqui é
  irrelevante: não há histórico divergente a reprocessar, o conjunto não muda.
- **Reset de aprendizado vem de edição significativa no conjunto de anúncios**, não da edição
  da regra de uma conversão. O conjunto continua apontando para a **mesma** Conversão
  Personalizada, com o **mesmo ID**. Nada no conjunto de anúncios é tocado.

**O único risco real de A**, e é um risco condicional:

> Se o Meta **não permitir editar a regra no lugar** e exigir **recriar** a Conversão
> Personalizada, nasce um **ID novo**. Aí o conjunto de anúncios precisa ser reapontado — e
> **reapontar o evento de otimização de um conjunto ativo É edição significativa e reinicia
> o aprendizado.** É o cenário que o Boss teme, e ele só se materializa por esse caminho.

Isso é verificável em 1 minuto na tela da conversão: se existir "Editar" na regra, A é seguro.
**Não tenho como verificar — não tenho acesso.** Vira a pergunta bloqueante do §8.5.

### 8.3 Saída B — renomear nossas URLs

`/obrigado-saogeraldo-qualificado` e `/obrigado-saogeraldo-simples` não contêm `mql` → não
casam com a regra do perpétuo. Resolve **a colisão conhecida**, sem tocar em produção alheia.

**Mas B tem um furo que o A não tem:**

O perpétuo tem **duas** páginas de obrigado (`-mql` e `-lead`). O Boss leu a regra da conversão
de **MQL**. **A regra da conversão do lead comum do perpétuo é desconhecida.** Se ela for
`URL contém obrigado` — a hipótese frouxa original — então:

| URL da opção B | casa `obrigado` puro? |
|---|---|
| `/obrigado-saogeraldo-qualificado` | **sim** ← ainda contamina |
| `/obrigado-saogeraldo-simples` | **sim** ← ainda contamina |

Ou seja: **B só é seguro se a outra regra do perpétuo também for específica.** Enquanto isso
não for lido, B dá uma sensação de segurança que pode não existir. E o mesmo `LEIA A OUTRA
REGRA` é pré-requisito de B — então B não elimina a ida ao Events Manager, só troca o que se
faz lá.

**Custos de B, todos do nosso lado, a 5 dias do leilão:**

- Renomear 2 pastas de rota.
- 2 strings de redirect no `Formulario.tsx`.
- Acionadores do GTM usam **Page Path com match exato** → os dois precisam ser reescritos.
- 17 ocorrências no `GTM.md`, mais `INFRA-TRACKING.md` e esta auditoria.
- Refazer a verificação de 200 nas páginas novas.

**E B deixa a mina no chão:** a regra frouxa continua lá. Ninguém poderá usar a palavra `mql`
numa URL da casa, para sempre, e o próximo funil repete o problema.

### 8.4 Recomendação: **A, feita agora**, com B como plano de queda

Discordo da leitura do Boss, e o fundamento é a coluna "tem tráfego hoje" da §8.1.

O princípio "não mexa em produção véspera de lançamento" é correto em geral. Ele não se aplica
aqui porque **esta edição específica não altera nenhum evento**. Não há como uma mudança que
deixa o conjunto de eventos idêntico degradar o aprendizado de uma campanha — não existe
mecanismo para isso. O que reinicia aprendizado é edição no conjunto de anúncios ou queda de
volume, e A não causa nenhum dos dois.

**E o mais importante: a janela está se fechando na direção contrária à intuição.**

- **A feita HOJE:** remove zero eventos. Risco praticamente nulo.
- **A feita DEPOIS do leilão:** aí sim os eventos do São Geraldo já estarão inflando o
  perpétuo, e estreitar a regra vira uma **queda real de volume** na conversão que a campanha
  otimiza. *Aí* existe risco de aprendizado — exatamente o que se queria evitar.

Adiar A não a torna mais segura. Torna-a mais perigosa. E B não substitui A: só empurra A
para a pior janela possível, além de contaminar o relatório do perpétuo durante o leilão
inteiro, o que suja a leitura de performance dos dois funis justamente na semana que importa.

**Ordem recomendada:**

1. Abrir a Conversão Personalizada de MQL do perpétuo e verificar se a regra é **editável no
   lugar**. *(1 minuto)*
2. Ler a regra da conversão de **lead comum** do perpétuo — pré-requisito de A **e** de B.
3. **Se editável:** estreitar para `obrigado-touros` + `mql`. Zero evento afetado. Mantemos
   nossas URLs, que são semanticamente claras e já estão em código, doc e GTM.
4. **Se exigir recriar:** cair para **B**. Aí o argumento do Boss passa a valer integralmente
   — reapontar conjunto ativo reinicia aprendizado, e não se faz isso a 5 dias do leilão.
5. Criar as Conversões Personalizadas do São Geraldo (obrigatório nos dois caminhos), com
   regra **específica**: `URL contém obrigado-saogeraldo-mql` / `-lead`.

> Se a decisão for B mesmo com a regra editável, é decisão de negócio legítima — o custo é
> nosso e o controle é nosso, como o Boss disse. Só não é a opção de menor risco técnico, e
> ela deixa a dívida para uma janela pior.

### 8.5 Perguntas que travam a decisão

- [ ] **A regra da Conversão Personalizada de MQL do perpétuo é editável no lugar, mantendo o
      mesmo ID?** *Motivo:* é o único fator que decide entre A e B. Editável → A é quase sem
      risco. Exige recriar → A vira o cenário que o Boss teme, e B passa a ser a escolha certa.
- [ ] **Qual a regra da Conversão Personalizada do LEAD COMUM do perpétuo?** *Motivo:* se for
      `URL contém obrigado`, **B não resolve** — `qualificado` e `simples` também contêm
      `obrigado`. É pré-requisito das duas saídas.
- [ ] **"O pixel do São Geraldo já está criado" — é um pixel NOVO (terceiro) ou é o `1539…` já
      apontado para as páginas do leilão?** *Motivo:* se foi criado um terceiro pixel, isso
      contraria a consolidação do §1 e muda todo o desenho de §4 e §5. Precisa ser esclarecido
      antes de qualquer implementação.

### 8.6 O que muda em código se a decisão for B

Nada disto foi executado — aguardando decisão.

| Arquivo | Mudança |
|---|---|
| `src/app/obrigado-saogeraldo-mql/` | renomear → `obrigado-saogeraldo-qualificado/` |
| `src/app/obrigado-saogeraldo-lead/` | renomear → `obrigado-saogeraldo-simples/` |
| `src/app/saogeraldo/_components/Formulario.tsx` | 2 strings no `window.location.assign` |
| `.planning/leilao-sao-geraldo/GTM.md` | 17 ocorrências, incl. os acionadores de Page Path exato |
| `.planning/leilao-sao-geraldo/INFRA-TRACKING.md` | allowlist de paths do §2.2 |
| esta auditoria | §4 e §5 |

A navegação hard, a régua de MQL no servidor e a resposta `{ id, is_mql }` **não mudam** — só
mudam os destinos. O risco técnico da renomeação é baixo; o custo é de coordenação e de
refazer verificação.
