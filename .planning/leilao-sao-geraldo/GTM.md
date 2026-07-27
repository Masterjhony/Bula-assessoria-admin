---
project: web-bula
feature: leilao-sao-geraldo
type: runbook-gtm
container: GTM-K8RXFDDT
conta_gtm: 6359934056
container_id: 254974309
workspace: 10
versao_publicada_auditada: 9
pixel_meta: 1539780341180483
ga4: G-X00P526WF7
urls_de_conversao:
  - /obrigado-saogeraldo-mql
  - /obrigado-saogeraldo-lead
executor: HUMANO na interface do GTM (nenhum agente tem acesso ao container)
created: 2026-07-27
updated: 2026-07-27 (§3 e §4.3 fechados por leitura direta da Meta API; §2 Passo 0 invertido)
supersedes:
  - INFRA-TRACKING.md §4.2 (que recomendava container novo)
  - AUDITORIA-META.md §8 (saídas A/B — canceladas, ver §4.3)
---

# GTM — Configuração de conversão do Leilão São Geraldo e 7P

> **Quem executa isto é uma pessoa, na interface web do GTM.** Nenhum agente tem
> acesso ao container. Este documento é escrito em nível de "abra o GTM e faça
> isto". Onde houver comando de terminal, é verificação — não configuração.

---

## 0. Decisão do cliente (27/07) — TRAVADA, não reabrir

| # | Decisão | Consequência prática |
|---|---|---|
| D-01 | **Mesmo container** do perpétuo de touros: `GTM-K8RXFDDT` | Não se cria container novo. `INFRA-TRACKING.md §4.2` está **superado** por este documento |
| D-02 | Só **criar eventos/tags** dentro dele, acionados pela **URL de MQL** | Nenhuma tag existente é alterada |
| D-03 | **Mesmo pixel** do perpétuo ("está tudo certinho") | Pixel `1539780341180483` (evidência na §1) |
| D-04 | Não mexer em `src/app/touros/` nem em `/api/touros/` | Estão em produção |

**Consequência de D-01 que precisa ficar dita:** a partir de agora **um único
container serve dois funis em produção**. Toda alteração publicada nele afeta o
perpétuo de touros **e** o funil antigo do JMP no mesmo instante. É por isso que
a §4 existe.

---

## 1. Auditoria do container ao vivo — o que ele REALMENTE tem hoje

> **Isto não é suposição.** A configuração publicada de um container do GTM é
> servida publicamente em `gtm.js`. Foi baixada e decodificada em 27/07/2026.
> Comando reprodutível na §7.4. **Versão publicada auditada: 9.**

### 1.1 Variáveis já habilitadas (não precisa criar nenhuma)

| Variável | Situação |
|---|---|
| `{{Page URL}}` | habilitada e **em uso** (condição do funil JMP) |
| `{{Page Hostname}}` | **habilitada**, sem uso hoje |
| `{{Page Path}}` | **habilitada**, sem uso hoje |
| `{{Event}}`, `{{Referrer}}`, cookies `_fbp` / `_fbc` | habilitadas |

→ **Nada a fazer no passo "Variáveis".** As duas que este plano usa
(`Page Path`, `Page Hostname`) já existem.

### 1.2 Acionadores publicados — os 4 que existem

| # | Acionador (condição real) | Dispara |
|---|---|---|
| R0 | `Event = gtm.init` (Inicialização) | T0 |
| R1 | `Event = gtm.dom` (**DOM Ready — TODAS as páginas, sem filtro de URL**) | T1, T2, T3 |
| R2 | `Event` casa `.+` **E NÃO contém** `gtm.` ← **O CATCH-ALL** | T2, T3 |
| R3 | `Page URL` contém `/obrigado-jmp.html` **E** `Event = gtm.js` | T4 |

### 1.3 Tags publicadas — as 5 que existem

| # | Tag | Destino | Aciona em |
|---|---|---|---|
| T0 | Google tag (GA4) | `G-X00P526WF7` | R0 |
| T1 | Google tag (GA4) com `transport_url` server-side, `send_page_view=false` | sGTM `server-side-tagging-3hk3e67aaq-uc.a.run.app` | R1 |
| T2 | GA4 Event — nome = `{{Event}}`, com `event_id`, `_fbp`, `_fbc` | **relay CAPI** via sGTM | R1 **e R2** |
| T3 | **Meta Pixel** — nome do evento por tabela de consulta | **pixel `1539780341180483`** | R1 **e R2** |
| T4 | Meta Pixel — `PageView` | pixel `899641089812500` (funil JMP antigo) | R3 |

**T3 é o `fb_conversions_mpi`.** T2 é o par server-side dele: mesmo `event_id`
(`a462b4b5-…_` + id do evento) → **navegador + CAPI deduplicados**.

**A tabela de consulta de T3** traduz o nome do evento do dataLayer para o nome
do Meta: `gtm.dom → PageView`, `page_view → PageView`, `generate_lead → Lead`,
`purchase → Purchase`, `sign_up → CompleteRegistration`, etc. **Sem
correspondência, passa o nome cru como evento customizado.**

### 1.4 As três leituras que mudam o plano

**(a) O perpétuo NÃO tem acionador de URL no container.**
Não existe, na versão publicada, nenhum acionador casando
`/obrigado-touros-mql`. O único acionador por URL é o do JMP
(`/obrigado-jmp.html`). O comentário em `src/app/touros/_lib/analytics.ts` —
*"a tag fb_conversions_mpi roda no GTM pelo gatilho Page View da URL de
obrigado. Valor e moeda ficam fixos na própria tag"* — **descreve uma intenção
que nunca foi publicada**. T3 não tem `value` nem `currency` configurados.

**(b) Então como o perpétuo converte hoje?** Por R1 (`gtm.dom`, todas as
páginas), T3 manda `PageView` ao pixel em **toda** página. A separação
MQL/não-MQL só pode estar sendo feita por **Conversão Personalizada por URL no
Events Manager** — fora do GTM. Isso precisa ser confirmado (§7.2) porque é
onde mora o risco real de contaminação (§4.3).

**(c) O catch-all está vivo e disparando no perpétuo agora.**
`src/app/touros/_lib/analytics.ts` **ainda empurra** ao dataLayer
(`touros_view`, `touros_form_started`, `touros_step_attempt`…). Cada push
casa R2 e dispara T2+T3 → o Meta recebe um evento customizado por micro-passo
do funil. Não é teoria: é o estado de produção. **Não corrigir — é `touros/`,
fora de escopo (D-04).** Está aqui só para provar que R2 morde.

---

## 2. O que criar no GTM — passo a passo

> Tempo estimado: 20 minutos. **Nenhuma tag ou acionador existente é aberto,
> renomeado ou editado.**

### Passo 0 — Trabalhar DENTRO do workspace 10 (decisão do Boss, 27/07)

> ⚠️ **Esta seção foi invertida em 27/07.** A versão anterior mandava criar um
> workspace dedicado. **O Boss travou o contrário:** usar o **workspace 10**, o
> que o link dele abre. Não criar workspace novo, não criar container novo.
>
> `https://tagmanager.google.com/#/container/accounts/6359934056/containers/254974309/workspaces/10`

**O que a decisão custa, e que continua valendo:** publicar no GTM publica **o
workspace inteiro**, não só as suas 4 alterações. Sem workspace próprio, você
perde o isolamento — qualquer trabalho pendente de terceiro no workspace 10 sobe
junto com o seu.

**Por isso o Passo 0 vira uma INSPEÇÃO, e ela é bloqueante:**

1. Abrir a aba **"Alterações"** do workspace 10 **antes de criar qualquer coisa**.
2. Anotar **tudo** que já está lá — é a linha de base.
3. Se houver item pendente que **não é seu**: **PARE e reporte ao Boss.** Não
   publique. Criar as 4 alterações é seguro (ver §2 "Resumo do que sobe"); é o
   **publicar** que arrastaria o trabalho alheio para produção.
4. Só publique quando "Alterações" listar **exatamente os seus 4 itens** — ou
   quando o dono do que estiver pendente liberar.

Se o workspace 10 estiver sujo e não der para limpar a tempo, a saída é a §8
(**Rota B**), que entrega a conversão **sem publicar nada no GTM**.

### Passo 1 — Acionador `pv_sg_obrigado_mql`

Acionadores → Novo → Configuração → **Visualização de página** (Page View, não
DOM Ready, não Window Loaded).

- Dispara em: **Alguns eventos de visualização de página**
- Condição 1: `Page Path` — **é igual a** — `/obrigado-saogeraldo-mql`
- Condição 2: `Page Hostname` — **é igual a** — `saogeraldo.bulaassessoria.com`

Salvar como **`pv_sg_obrigado_mql`**.

### Passo 2 — Acionador `pv_sg_obrigado_lead`

Idêntico, trocando a condição 1 por `/obrigado-saogeraldo-lead`.
Salvar como **`pv_sg_obrigado_lead`**.

#### Por que não colide com o perpétuo

| Ponto | Verificação |
|---|---|
| `é igual a` é match **exato** | `/obrigado-saogeraldo-mql` nunca casa `/obrigado-touros-mql` |
| A string `saogeraldo` está no path | mesmo sem o hostname, é impossível colidir |
| Trava dupla de hostname | `saogeraldo.*` ≠ `touros.*` |
| Criar acionador é **aditivo** | acionador só age quando uma tag o referencia. As 5 tags existentes não referenciam estes. **Criar acionador tem risco zero sobre o perpétuo.** |
| Path de saogeraldo no host de touros | a allowlist do `touros.*` devolve **308 → `/`** para path desconhecido (INFRA §1.4) — não existe pageview nesse path lá |

> ⚠️ **Pegadinha de teste:** com `Page Hostname é igual a saogeraldo.bulaassessoria.com`,
> a tag **não dispara em preview `*.vercel.app`**. A validação da §7 é feita no
> **domínio de produção**. Não relaxe o hostname para testar em preview — trocar
> por "não contém touros" abriria o pixel de produção para deploys de preview.

### Passo 3 — Tag `fb_sg_mql`

Tags → Novo → Configuração da tag → escolha **o mesmo template de Meta Pixel já
instalado no container** (o que T3 e T4 usam). Não instale template novo da
galeria.

| Campo | Valor |
|---|---|
| **Pixel ID** | `1539780341180483` |
| **Event Type / Tipo de evento** | `Custom` (evento customizado) |
| **Event Name** | `saogeraldo_mql` |
| **Event ID** | *deixar vazio* |
| **Object Properties / value / currency** | *deixar vazio* — ver nota abaixo |
| **Acionamento** | `pv_sg_obrigado_mql` |
| **Exceções** | nenhuma |
| Opções avançadas | deixar o padrão (`uma vez por evento`) |

Salvar como **`fb_sg_mql`**.

### Passo 4 — Tag `fb_sg_lead`

Idêntica, com **Event Name = `saogeraldo_lead`** e acionamento
`pv_sg_obrigado_lead`. Salvar como **`fb_sg_lead`**.

### Passo 5 — NÃO fazer

- ❌ Não criar tag GA4 nova. T0/T1/T2 já cobrem GA4 em todas as páginas; uma tag
  GA4 nova nas URLs de obrigado seria evento duplicado no relatório.
- ❌ Não ligar os eventos novos ao caminho CAPI/sGTM (T2 / `server-side-tagging-…`).
  Aquele container server-side é infra compartilhada e não faz parte deste escopo.
  Sem par CAPI, não há o que deduplicar — por isso o Event ID fica vazio.
- ❌ Não usar evento **padrão** (`Lead`, `CompleteRegistration`). O pixel é
  compartilhado: um `Lead` padrão vindo do lançamento entraria no mesmo balde de
  otimização do perpétuo. Evento customizado é o que mantém os dois separados.
- ❌ Não colocar `value`/`currency` na tag. O pixel é compartilhado — valor
  falso na tag contamina o faturamento reportado do perpétuo. **Se a mídia quiser
  value-based bidding, o valor vai na Conversão Personalizada** (§7.3), onde fica
  isolado no lançamento. Referência de peso, se pedirem: MQL `100`, lead `10`,
  BRL — os mesmos `VALUE_MQL` / `VALUE_NON_MQL` de `saogeraldo/_lib/analytics.ts`.

### Resumo do que sobe

| Item | Nome | Tipo |
|---|---|---|
| Acionador | `pv_sg_obrigado_mql` | Page View · Path = `/obrigado-saogeraldo-mql` + Host = `saogeraldo.bulaassessoria.com` |
| Acionador | `pv_sg_obrigado_lead` | Page View · Path = `/obrigado-saogeraldo-lead` + mesmo host |
| Tag | `fb_sg_mql` | Meta Pixel `1539780341180483` · custom `saogeraldo_mql` |
| Tag | `fb_sg_lead` | Meta Pixel `1539780341180483` · custom `saogeraldo_lead` |

**4 itens. Nenhuma edição em item existente.** A aba "Alterações" do workspace
deve listar exatamente estes 4 — se listar um quinto, pare (§4.2).

---

## 3. Pixel — ✅ CONFIRMADO em 27/07, nada a perguntar

Lido direto na conta via Meta API. Não é mais um passo pendente:

| Pixel | Nome na conta | Situação |
|---|---|---|
| **`1539780341180483`** | `Pixel-Touro-Perpetuo` | **ativo, disparou em 27/07** — é o do perpétuo. É este que vai nas tags novas |
| `899641089812500` | `Pixel-Pagina-Leilao-JMP` | funil antigo do JMP (T4). Não usar |
| `2063779524517301` | `Perpetuo TOUROS` | criado 22/07, **nunca disparou**. Não usar |
| `1554501569413504` | `Pixel - Forms Instantaneos JMP` | forms instantâneos do JMP. Não usar |

Todos na conta **CA2 - Bula 360** (`2705134163151418`), BM Bula 360 Filial.
A conversão ativa do perpétuo (`MQL Perpetuo Touros`) aponta para
`1539780341180483` — o que fecha a evidência: **é o pixel que a campanha de
touros otimiza hoje.** O campo Pixel ID das §2.3/§2.4 está correto.

> Cuidado com o quase-homônimo: existe um pixel chamado **`Perpetuo TOUROS`**
> (`2063779524517301`) que **não é** o do perpétuo. Quem escolher pelo nome na
> interface erra. Escolha pelo ID.

---

## 4. RISCOS — a parte perigosa

### 4.1 O catch-all (R2) — veredito: **inerte nas URLs novas, e nada a mexer**

**O que é:** acionador de **Evento personalizado** com condição
`Event` **não contém** `gtm.`, disparando T2 (CAPI) e T3 (pixel).

**Ele pode disparar nas URLs novas?** Um acionador de Evento personalizado no
GTM só é avaliado quando **algo empurra um objeto com a chave `event` para o
`dataLayer`**. Ele não é avaliado em pageview, DOM ready, scroll ou clique.
Levantamento de tudo que poderia empurrar nas páginas novas:

| Origem possível | Empurra evento sem `gtm.`? |
|---|---|
| `saogeraldo/_lib/analytics.ts` | **Não** — só PostHog, por decisão. Verificado por grep (§6, gate G1) |
| `saogeraldo/_components/*`, páginas de obrigado | **Não** — zero `dataLayer.push` |
| Snippet do próprio GTM | `gtm.start`, `gtm.js`, `gtm.dom`, `gtm.load` — **todos contêm `gtm.`** → excluídos |
| Acionadores nativos do GTM (scroll, clique, timer, form, visibilidade, vídeo) | `gtm.scrollDepth`, `gtm.click`, `gtm.timer`, `gtm.formSubmit`, `gtm.elementVisibility`, `gtm.video` — **todos contêm `gtm.`** → excluídos |
| PostHog (`posthog-js`) | não escreve no `dataLayer` |
| Next.js / framer-motion / next-image | não escrevem no `dataLayer` |

> **Veredito: enquanto o código da landing nova não empurrar nada ao
> `dataLayer`, R2 não tem o que disparar. A blindagem é de CÓDIGO, não de
> container — e já está no ar. Não se toca em R2.**

**A blindagem tem que ser mantida por teste, não por memória.** É exatamente o
tipo de invariante que morre num refactor bem-intencionado ("vou padronizar o
tracking e mandar tudo pro dataLayer"). Gate G1 da §6 é a trava.

### 4.2 O risco maior é R1, e ele não é do catch-all

**R1 (`gtm.dom`) dispara T1, T2 e T3 em TODA página onde o container carrega —
sem nenhum filtro de URL ou hostname.** Como o container agora carrega em
`/saogeraldo` e nas duas páginas de obrigado, a consequência é:

| O que acontece nas páginas novas | Gravidade |
|---|---|
| Meta recebe `PageView` no pixel `1539780341180483` (navegador + CAPI) | **Esperado e desejável.** É o que constrói público e atribuição |
| GA4 `G-X00P526WF7` recebe evento de página do host novo | **Aceitável.** Segmentável por hostname. Não corrigir |
| Na página de MQL, dispara `fb_sg_mql` (em `gtm.js`) **e** `PageView` (em `gtm.dom`) | **Sem duplicação.** São eventos de nomes diferentes. `saogeraldo_mql` dispara **uma vez** |

**Não existe tag de conversão do perpétuo disparando em "All Pages"** — porque
não existe tag de conversão por URL no container (§1.4a). Esse era o cenário
catastrófico e a auditoria descartou.

### 4.3 Contaminação no Events Manager — **DESCARTADA por leitura direta da conta**

> ✅ **RESOLVIDO EM 27/07 — as regras foram lidas na API do Meta, não por
> memória.** O risco desta seção **não existe**. Nada a editar no perpétuo, nada
> a renomear nas nossas URLs.

**As regras reais, como estão gravadas na conta** (lidas via Meta API, 27/07):

| Conversão Personalizada | Conta | Pixel | Regra real |
|---|---|---|---|
| `MQL Perpetuo Touros` (id `1411024464255046`) | CA2 - Bula 360 (`2705134163151418`) | `1539780341180483` | `PageView` **E** URL contém `https://touros.bulaassessoria.com/obrigado-touros-mql` |
| `lead-leilao-jmp` (id `27199188126398754`) | CA2 - Bula 360 | `1539780341180483` | `PageView` **E** URL contém `https://jmp.bulaassessoria.com/obrigado-jmp.html` |

**As duas regras carregam o hostname inteiro.** `saogeraldo.bulaassessoria.com`
não casa com `touros.bulaassessoria.com` nem com `jmp.bulaassessoria.com` —
**nenhuma URL do leilão pode entrar em nenhuma conversão do perpétuo.**

#### Três correções ao que este documento afirmava

1. **A regra do perpétuo NÃO é `URL contém obrigado` E `URL contém mql`.** É um
   único `contains` com a URL completa, host incluído. A colisão descrita na
   versão anterior desta seção — e toda a análise de saídas A/B em
   `AUDITORIA-META.md` §8 — partia dessa premissa e **cai junto com ela**.
2. **Não existe Conversão Personalizada de "lead comum" do perpétuo.** O pixel
   `1539780341180483` tem exatamente **duas** conversões, as da tabela acima. O
   "pré-requisito bloqueante das duas saídas" (ler a outra regra) está
   respondido: a outra regra não existe.
3. **Existe uma regra frouxa na casa, mas ela não nos alcança.** `LEAD-WPP`
   (id `985645647246798`, conta `Formula do Boi!` `1630761758131744`) é
   `PageView` **E** URL contém `/obrigado` — genérica de verdade. Só que ela vive
   no pixel **`2009772743084271`** (`Formula-boi-pixel-wpp`), e esse pixel **não
   dispara nas páginas do São Geraldo**: lá o GTM só carrega
   `1539780341180483` (T3). Conversão Personalizada só avalia eventos do próprio
   pixel ⇒ **inerte para nós**. Fica registrada porque é uma mina para qualquer
   funil futuro que use aquele pixel.

#### O que isso cancela

| Item | Status |
|---|---|
| Saída A — estreitar a regra do perpétuo para `obrigado-touros` | **CANCELADA.** Não há o que estreitar; a regra já é host-específica |
| Saída B — renomear para `-qualificado` / `-simples` | **CANCELADA.** As URLs deste documento ficam como estão |
| "Verificar se a regra do perpétuo é editável no lugar" | **Sem objeto.** Nenhuma edição no perpétuo é necessária |
| Risco de reiniciar o aprendizado da campanha do perpétuo | **Zero.** Nada é tocado na conta do perpétuo |

**Confirmação de brinde (§3):** o pixel `1539780341180483` se chama
`Pixel-Touro-Perpetuo`, está ativo e disparou hoje (27/07). É o pixel certo — o
campo Pixel ID das tags `fb_sg_mql` / `fb_sg_lead` está correto como escrito.

**O que sobra de trabalho no Events Manager:** só criar as conversões **do
lançamento** (§7.3). Nenhuma leitura ou edição pendente no perpétuo.

### 4.4 O que NÃO tocar — lista fechada

| Item | Motivo |
|---|---|
| **R0, R1, R2, R3** (os 4 acionadores) | R1 e R2 movem o perpétuo. R3 move o funil JMP |
| **T0, T1, T2, T3, T4** (as 5 tags) | T3 = `fb_conversions_mpi`, convertendo agora. T2 é o par CAPI dele — mexer numa e não na outra quebra a dedup |
| A tabela de consulta de nomes de evento (`gtm.dom → PageView` …) | é ela que faz T3 mandar `PageView`. Uma linha a mais aqui muda o nome do evento do perpétuo |
| A variável de `event_id` (`a462b4b5-…`) | é a chave de dedup navegador↔CAPI do perpétuo |
| O container server-side `server-side-tagging-3hk3e67aaq-uc.a.run.app` | infra compartilhada, fora deste escopo |
| Pixel `899641089812500` e a condição `/obrigado-jmp.html` | outro funil, outro dono |
| `src/app/touros/**` e `src/app/api/touros/**` | D-04 |

### 4.5 Contingência — só se a §7.2 provar contaminação

**Não faça isto preventivamente.** Se, e somente se, o Events Manager provar que
os eventos do host novo estão entrando nas conversões do perpétuo, a intervenção
de menor superfície é:

> Adicionar uma **exceção** à tag T3 com um acionador cuja condição seja
> `Page Hostname` **é igual a** `saogeraldo.bulaassessoria.com`.

É demonstravelmente inerte em `touros.bulaassessoria.com` (a condição nunca é
verdadeira lá). Ainda assim **é edição em tag de produção**: anote o número da
versão publicada antes, e saiba que o rollback é
`Versões → versão anterior → Publicar`. E note que isso **desliga o `PageView`
do lançamento**, o que enfraquece a atribuição do próprio leilão — é troca, não
ganho puro. Decisão da mídia, não do implementador.

---

## 5. Publicação

1. Workspace **10** → **Visualizar** primeiro (§7.1). Não publique nada antes do
   Preview passar.
2. Aba **Alterações**: confirmar **exatamente 4 itens**, todos "Adicionado",
   nenhum "Modificado" e nenhum "Excluído". **Item de terceiro na lista ⇒ PARE**
   (§2 Passo 0) — publicar sobe o workspace inteiro.
3. **Enviar** → Nome da versão: `SG — conversão leilão (2 tags + 2 acionadores)`.
   Descrição: colar o resumo da §2 ("Resumo do que sobe").
4. **Anotar o número da versão publicada** (a auditada hoje é a 9; a sua será a
   próxima). É o ponto de rollback.
5. Rodar a §7.4 (diff da configuração publicada) — a verificação automática de
   que nada do perpétuo mudou.

---

## 6. Pré-requisitos de CÓDIGO e INFRA — checklist bloqueante

> Nenhuma linha de código precisa ser escrita para a conversão funcionar. O
> código já está correto. Estes itens são **verificação** e **infra**.

### 6.1 Infra (humano, Vercel + Hostinger) — BLOQUEANTE

- [ ] **DNS**: `saogeraldo.bulaassessoria.com` resolvendo. **Hoje: NXDOMAIN**
      (verificado em 27/07, `dig +short` volta vazio). CNAME criado na
      **Hostinger** — a zona não é da Vercel. Ver `INFRA-TRACKING.md §2.2`.
- [ ] Domínio adicionado no projeto da Vercel + certificado emitido.
- [ ] **Allowlist replicada** (`INFRA-TRACKING.md §2.2 passo 5`) incluindo
      explicitamente `/obrigado-saogeraldo-mql`, `/obrigado-saogeraldo-lead` e
      `/api/saogeraldo/lead`.
- [ ] **As duas páginas de obrigado respondem 200, nunca 3xx.** Um 308 aqui move
      o pageview para `/` — o acionador não casa e **a conversão nunca dispara,
      sem erro visível em lugar nenhum**. É a falha mais cara e mais silenciosa
      deste projeto.

```bash
for p in / /obrigado-saogeraldo-mql /obrigado-saogeraldo-lead; do
  printf '\n--- %s\n' "$p"
  curl -sS -o /dev/null -D - "https://saogeraldo.bulaassessoria.com$p" \
    | grep -Ei '^(HTTP/|location:|x-matched-path:)'
done
```
Aceite: raiz **200** com `x-matched-path: /saogeraldo`; as duas de obrigado
**200**. Qualquer `location:` = reprovado.

### 6.2 Variáveis de ambiente na Vercel

- [ ] **`NEXT_PUBLIC_GTM_ID`** — deixar **como está**. O default no código já é
      `GTM-K8RXFDDT`, que é o container certo (D-01).

> ⚠️ **`NEXT_PUBLIC_GTM_ID` é COMPARTILHADA com `/touros`.** Os dois componentes
> (`touros/_components/GoogleTagManager.tsx` e
> `saogeraldo/_components/GoogleTagManager.tsx`) leem a **mesma** env. Mudar o
> valor dela para "separar" o lançamento **derruba o tracking do perpétuo junto**.
> Se um dia for preciso separar, cria-se uma env nova — não se reaproveita esta.

- [ ] **NÃO criar `NEXT_PUBLIC_GTM_ID_SAOGERALDO`.** `INFRA-TRACKING.md §2.2
      item 6` e `§4.2` pediam isso quando a recomendação era container novo.
      **D-01 superou.** Criar essa env hoje é ruído que confunde quem vier depois.
- [ ] `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` — opcionais, não
      afetam a conversão (PostHog é NO-OP sem key).

### 6.3 Gates de código — rodar antes do deploy e no CI

**G1 — a landing não empurra nada ao `dataLayer`** (é o que mantém R2 inerte):

```bash
grep -rn --include='*.ts' --include='*.tsx' 'dataLayer\.push\|pushDataLayer' \
  src/app/saogeraldo src/app/obrigado-saogeraldo-mql src/app/obrigado-saogeraldo-lead \
  | grep -v 'GoogleTagManager.tsx' \
  | grep -vE ':[[:space:]]*(//|\*)'
```
Aceite: **saída vazia**. (O `GoogleTagManager.tsx` é excluído de propósito: o
push dele é o `gtm.start` do snippet oficial, que **contém `gtm.`** e portanto é
excluído pelo próprio catch-all.)

**G2 — navegação hard preservada** (só load completo dispara Page View):

```bash
F=src/app/saogeraldo/_components/Formulario.tsx
printf 'assign=%s push=%s\n' \
  "$(grep -vE '^[[:space:]]*(//|\*|/\*)' "$F" | grep -c 'window\.location\.assign')" \
  "$(grep -vE '^[[:space:]]*(//|\*|/\*)' "$F" | grep -c 'router\.push')"
```
Aceite: **`assign=1 push=0`**. Trocar por `router.push` mata a conversão
silenciosamente (commits `d697127` / `e437ed1`).

> O filtro de comentários **não é decoração**. O arquivo documenta a decisão em
> prosa ("navegação HARD … NÃO `router.push`"), então um `grep -c` cru devolve
> `assign=2 push=1` e o gate se autoinvalida — o próprio comentário que protege a
> regra faria o teste passar/reprovar pelo motivo errado. Medido hoje: sem filtro
> `2` e `1`; com filtro `1` e `0`.

**G3 — GTM montado nas duas páginas de obrigado:**

```bash
grep -l 'GoogleTagManager' \
  src/app/obrigado-saogeraldo-mql/page.tsx src/app/obrigado-saogeraldo-lead/page.tsx
```
Aceite: **as duas** aparecem. Sem o container na página de obrigado não há Page
View para acionar nada.

**G4 — sem redirect automático na página de obrigado:**

```bash
grep -vE '^[[:space:]]*(//|\*|/\*)' src/app/saogeraldo/_components/Obrigado.tsx \
  | grep -nE 'location\.|redirect|setTimeout'
```
Aceite: **saída vazia**. (Mesmo cuidado do G2: sem o filtro de comentários, o
cabeçalho do arquivo — que cita `window.location.assign` e "não há redirect
automático" — reprovaria o gate sozinho.)

Verificado hoje: a `Obrigado` do São Geraldo é server component estático, sem
redirect para grupo de WhatsApp — diferente da de touros. Se um link de grupo for
adicionado depois, ele **não pode** ser redirect automático rápido: o usuário
sairia da página antes de a tag disparar.

**G5 — MQL decidido no servidor:** `/api/saogeraldo/lead` devolve `{ id, is_mql }`
via `evaluateMql(DEFAULT_JMP_MQL_RULE, …)` e o client só escolhe a URL a partir
disso. Já está assim — não alterar. É o que garante que a URL de MQL significa
MQL de verdade.

### 6.4 Ajuste de comentário no código (opcional, baixa prioridade)

Os comentários de `src/app/saogeraldo/_lib/analytics.ts` (linhas ~4-16 e ~96-100)
afirmam que *"valor/moeda ficam fixos na própria tag do GTM"* e que existe
acionador de Page View de conversão herdado do perpétuo. A auditoria da §1.4(a)
mostra que **nada disso está publicado**. Vale corrigir para o texto refletir a
realidade (tag sem `value`, valor na Conversão Personalizada). **Só toca arquivo
de `saogeraldo/` — nunca `touros/` (D-04).** Não bloqueia nada.

---

## 7. Verificação

### 7.1 Preview / Debug do GTM — a conversão dispara UMA vez, e na URL certa

Pré-requisito: §6.1 verde (o domínio de produção no ar). O Preview roda contra
**produção**, não contra `*.vercel.app` — por causa da condição de hostname (§2).

1. GTM → workspace `Leilão São Geraldo` → **Visualizar**.
2. URL: `https://saogeraldo.bulaassessoria.com` → **Connect**.
3. Preencher o formulário com **rebanho ≥ 100 cabeças** e **inscrição estadual =
   Sim** → enviar.
4. A navegação é **hard, no mesmo host** — o Tag Assistant mantém a sessão e a
   página de obrigado aparece como um novo container na linha do tempo à esquerda.

**Critérios de aceite, no container de `/obrigado-saogeraldo-mql`:**

| # | Verificar | Esperado |
|---|---|---|
| 1 | Evento **Container Loaded** (`gtm.js`) → aba **Tags** | `fb_sg_mql` em **Tags Fired**, **1 vez** |
| 2 | Mesma tela | `fb_sg_lead` em **Tags Not Fired** |
| 3 | Clicar em `fb_sg_mql` → Properties | Pixel `1539780341180483`, event name `saogeraldo_mql`, sem `value`/`currency` |
| 4 | Varrer **todos** os eventos da linha do tempo dessa página | `fb_sg_mql` aparece em **exatamente um**. Se aparecer em dois, o acionador está errado |
| 5 | Evento **DOM Ready** | T3 dispara `PageView` — **esperado**, é R1 (§4.2). Nome diferente ⇒ não é duplicação |
| 6 | Aba **Variables** no evento de Container Loaded | `Page Path` = `/obrigado-saogeraldo-mql`, `Page Hostname` = `saogeraldo.bulaassessoria.com` |

5. Repetir com **"1 a 99 cabeças"** (ou IE = Não) → cai em
   `/obrigado-saogeraldo-lead`:

| # | Verificar | Esperado |
|---|---|---|
| 7 | Tags Fired | `fb_sg_lead` **1 vez** |
| 8 | Tags Not Fired | **`fb_sg_mql` NÃO disparou** ← este é o critério que separa MQL de lead comum |

6. Na landing `/saogeraldo` (antes de enviar o form): **nenhuma das duas tags
   novas dispara** — só T1/T2/T3 no DOM Ready.
7. **Regressão do perpétuo:** ainda em Preview, abrir
   `https://touros.bulaassessoria.com/obrigado-touros-mql`. Aceite: `fb_sg_mql` e
   `fb_sg_lead` em **Tags Not Fired**, e as tags do perpétuo com o mesmo
   comportamento de sempre.

**Meta Pixel Helper** (extensão do Chrome), na página de MQL: um evento
`saogeraldo_mql` e um `PageView`. Dois `saogeraldo_mql` = falha, volte ao passo 4.

### 7.2 Events Manager — sem duplicação, sem contaminação

Events Manager → pixel `1539780341180483`:

- [ ] **Test Events** → "Test browser events" → abrir a URL do teste → enviar um
      lead MQL. Aceite: `saogeraldo_mql` aparece **uma vez**. Duas linhas com o
      mesmo timestamp = duplicação (navegador + CAPI sem dedup) — não deve
      acontecer, já que os eventos novos não têm par CAPI (§2 passo 5).
- [ ] **Overview / Eventos** (após tráfego real): `saogeraldo_mql` e
      `saogeraldo_lead` listados como eventos customizados.
- [ ] **Diagnóstico**: nenhum aviso novo de evento duplicado ou de parâmetro
      faltando.
- [ ] **Volume do perpétuo antes × depois:** anotar o volume diário do evento do
      perpétuo **antes** de publicar. 24h depois, comparar. Salto inexplicado =
      contaminação, vá para §4.5.
- [x] ~~**AUDITORIA DAS CONVERSÕES PERSONALIZADAS DO PERPÉTUO (§4.3) — só LER**~~
      **FEITO em 27/07 via Meta API.** As duas conversões do pixel
      `1539780341180483` casam a **URL completa com hostname**
      (`touros.bulaassessoria.com` / `jmp.bulaassessoria.com`). O leilão não
      casa com nenhuma. **Nada a corrigir, nada a reportar à mídia.** Evidência
      e IDs na §4.3.

### 7.3 Conversões Personalizadas do lançamento (mídia)

Para as campanhas do leilão poderem otimizar:

| Nome | Regra | Valor (opcional) |
|---|---|---|
| `SG — MQL` | evento `saogeraldo_mql` | `100` BRL |
| `SG — Lead` | evento `saogeraldo_lead` | `10` BRL |

O valor vai **aqui**, não na tag (§2 passo 5) — assim o peso fica isolado no
lançamento e não entra no faturamento reportado do pixel compartilhado. Campanha
de leilão otimiza por **`SG — MQL`**.

### 7.4 Diff da configuração publicada — prova de que o perpétuo não mudou

A configuração publicada do container é pública. Rodar **depois de publicar**:

```bash
python3 - <<'PY'
import json,re,urllib.request
s=urllib.request.urlopen("https://www.googletagmanager.com/gtm.js?id=GTM-K8RXFDDT",timeout=20).read().decode('utf8','replace')
d=json.loads(re.search(r'var data = (\{.*?\});\n',s,re.S).group(1))['resource']
print("versao publicada:",d['version'])
print("tags:",len(d['tags']),"| acionadores:",len(d['rules']),"| condicoes:",len(d['predicates']))
for i,x in enumerate(d['rules']): print("rule",i,x)
for i,p in enumerate(d['predicates']): print("pred",i,p['function'],p.get('arg1'))
PY
```

**Linha de base auditada em 27/07 (versão 9) — o que TEM que continuar idêntico:**

```
tags: 5 | acionadores: 4 | condicoes: 6
rule 0 [['if', 0], ['add', 0]]
rule 1 [['if', 1], ['add', 1, 2, 3]]
rule 2 [['if', 3], ['unless', 2], ['add', 2, 3]]
rule 3 [['if', 4, 5], ['add', 4]]
pred 0 _eq gtm.init      pred 1 _eq gtm.dom       pred 2 _cn gtm.
pred 3 _re .+            pred 4 _cn /obrigado-jmp.html    pred 5 _eq gtm.js
```

**Aceite pós-publicação:**
- `tags: 7` (5 antigas + 2 novas), `acionadores: 6` (4 + 2), `condicoes: 10`
  (6 + 4: dois `_eq` de path e dois `_eq` de hostname).
- As **rules 0 a 3 aparecem com o mesmo conteúdo** e os índices de tag dentro
  delas (`add 0`, `add 1,2,3`, `add 2,3`, `add 4`) **inalterados**.
- As **preds 0 a 5 idênticas**.
- Qualquer divergência nas rules/preds 0–5 ⇒ **alguma coisa do perpétuo foi
  alterada** ⇒ rollback imediato para a versão anterior e investigar.

---

## 8. Rota B — conversão sem publicar nada no GTM (contingência)

Registrado porque a auditoria o tornou possível e porque **é literalmente o que o
perpétuo faz hoje** (§1.4b). Não substitui D-02 — é plano de contingência se o
acesso ou a janela de publicação do GTM travar antes de 01/08.

Como R1 já manda `PageView` (navegador + CAPI) de **toda** página do host novo,
dá para medir a conversão **só no Events Manager**, com Conversões
Personalizadas por URL:

| Conversão | Regra |
|---|---|
| `SG — MQL` | `PageView` **e** URL contém `obrigado-saogeraldo-mql` |
| `SG — Lead` | `PageView` **e** URL contém `obrigado-saogeraldo-lead` |

- ✅ **Zero alteração no GTM. Zero publicação. Zero risco sobre o perpétuo.**
- ✅ Funciona desde o minuto em que o domínio sobe (§6.1) — sem depender de
  acesso ao container.
- ⚠️ Depende de a URL não mudar, e a janela de atribuição só começa a contar a
  partir da criação da conversão personalizada.
- ⚠️ Não gera nome de evento próprio no pixel — a separação vive só na conversão.

**Se a Rota B for usada, as §6 e §7.1 continuam obrigatórias** — a exigência de
200 na página de obrigado é ainda mais crítica aqui, porque a regra é a URL.

---

## 9. Mão humana × código

### Só humano, na interface (não automatizável)

| Onde | O quê | § |
|---|---|---|
| **GTM** | Criar workspace dedicado | 2.0 |
| **GTM** | Criar 2 acionadores | 2.1–2.2 |
| **GTM** | Criar 2 tags | 2.3–2.4 |
| **GTM** | Conferir a aba "Alterações" (exatamente 4 itens) | 5 |
| **GTM** | Preview/Debug: 8 critérios | 7.1 |
| **GTM** | Publicar versão e anotar o número | 5 |
| **Events Manager** | Confirmar qual pixel a mídia usa | 3 |
| **Events Manager** | Test Events, diagnóstico, volume antes×depois | 7.2 |
| **Events Manager** | **Ler** as regras de URL das conversões do perpétuo | 7.2 / 4.3 |
| **Events Manager** | Criar `SG — MQL` e `SG — Lead` (com valor) | 7.3 |
| **Vercel** | Domínio, certificado, allowlist de paths | 6.1 |
| **Hostinger** | CNAME `saogeraldo` | 6.1 |

### Código — já está pronto; o trabalho é **não quebrar**

| Situação | Arquivo |
|---|---|
| ✅ Container montado nas páginas de obrigado | `obrigado-saogeraldo-{mql,lead}/page.tsx` |
| ✅ Container = `GTM-K8RXFDDT` por default | `saogeraldo/_components/GoogleTagManager.tsx` |
| ✅ Zero `dataLayer.push` (mantém R2 inerte) | `saogeraldo/_lib/analytics.ts` |
| ✅ Navegação hard `window.location.assign` | `saogeraldo/_components/Formulario.tsx` |
| ✅ MQL decidido no servidor | `api/saogeraldo/lead/route.ts` |
| ✅ Obrigado sem redirect automático | `saogeraldo/_components/Obrigado.tsx` |
| ⬜ Gates G1–G5 no CI | §6.3 |
| ⬜ (opcional) corrigir comentários desatualizados | §6.4 |

**Nenhum código novo é necessário para a conversão funcionar.**

---

## 10. Ordem de execução

```
0. ACESSO  conta Google com permissão no container 254974309   ← BLOQUEANTE HOJE
1. §6.1  DNS + domínio + allowlist + 200 nas páginas de obrigado   ← BLOQUEANTE
2. §6.3  Gates G1–G5 verdes
3. §3    ✅ FEITO — pixel 1539780341180483 confirmado na conta (27/07)
4. §2    Passo 0: inspecionar "Alterações" do workspace 10 (BLOQUEANTE),
         depois criar 2 acionadores + 2 tags  (não publicar)
5. §7.1  Preview/Debug — os 8 critérios   ← exige o passo 1 pronto
6. §5    Publicar (conferir "Alterações" = 4 itens) e anotar a versão
7. §7.4  Diff da config publicada — provar que rules/preds 0–5 não mudaram
8. §7.3  Conversões Personalizadas do lançamento
9. §7.2  Events Manager 24h depois: volume do perpétuo antes×depois
10.      Só então subir tráfego pago
```

**Estado em 27/07:** passo 0 vermelho (o Chrome está logado em
`joaoeduardo.lp1@gmail.com`, que não enxerga nenhuma conta do GTM) e passo 1
vermelho (`saogeraldo.bulaassessoria.com` = NXDOMAIN). Passo 3 verde. §4.3
resolvido e descartado.

**Se travar no passo 4 ou 6 por falta de acesso ao GTM → §8 (Rota B), que só
depende dos passos 1 e 8.**

---

## 11. Registro — o que este documento decidiu e o que superou

| Item | Status |
|---|---|
| `INFRA-TRACKING.md §4.2` — "container novo, recomendado" | **SUPERADO** por D-01 |
| `INFRA-TRACKING.md §4.3` — config de container novo | **SUPERADO** pela §2 |
| `INFRA-TRACKING.md §2.2 item 6` / `§2.3` — env `NEXT_PUBLIC_GTM_ID_SAOGERALDO` | **CANCELADO** — não criar (§6.2) |
| `INFRA-TRACKING.md §4.2` — "todo Page View do lançamento dispararia as tags de conversão do perpétuo" | **Parcialmente refutado** pela auditoria: as tags do perpétuo disparam `PageView` no host novo (R1), mas **não existe tag de conversão por URL no container** (§1.4a). A conversão do perpétuo mora no Events Manager — e é lá que está o risco (§4.3) |
| `INFRA-TRACKING.md §4.5` — nomes `saogeraldo_lead` / `saogeraldo_mql` | **MANTIDO** (§2.3–2.4) |
| `INFRA-TRACKING.md §5` pendência 4 — "container novo vs. único" | **RESOLVIDA** por D-01 |
| `analytics.ts` — "valor e moeda ficam fixos na própria tag" | **Não corresponde ao publicado.** O valor vai na Conversão Personalizada (§7.3). Comentário a corrigir (§6.4) |
| Base de auditoria para rollback | **versão 9**, 27/07/2026 (§7.4) |
| §2 Passo 0 — "criar workspace dedicado" | **INVERTIDO** por decisão do Boss (27/07): usar o **workspace 10**. Virou inspeção bloqueante da aba "Alterações" |
| §4.3 — "contaminação CONFIRMADA, regra `obrigado` + `mql`" | **REFUTADO** pela leitura das regras na Meta API (27/07). A regra real casa a URL completa com hostname. Zero colisão |
| `AUDITORIA-META.md` §8 — saídas A e B, e a "pergunta bloqueante" sobre editabilidade | **SUPERADO** pela §4.3 deste documento. Ambas as saídas canceladas: nada a editar no perpétuo, nada a renomear |
| `AUDITORIA-META.md` §8.3 — "ler a regra do lead comum do perpétuo" | **RESPONDIDO:** essa conversão **não existe**. O pixel tem só duas conversões (§4.3) |
