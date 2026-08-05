---
project: web-bula
feature: femeas-perpetuo
type: phased-build-plan
route: /femeas
domain: femeas.bulaassessoria.com   # [PENDENTE C-10]
base_fork: src/app/touros/
analogo_secundario: src/app/saogeraldo/
source_of_truth: reunião 05/08/2026 — Marcelo Carneiro, João Antônio, João Gabriel
created: 2026-08-05
---

# Plano de Construção — Landing do Funil Perpétuo de FÊMEAS (Bula Assessoria)

## Visão Geral

Segunda landing de **funil perpétuo** dentro do app `web-bula`, na rota nova
`src/app/femeas/`, rodando **ao mesmo tempo** que o perpétuo de touros
(`src/app/touros/`). Não substitui nada; convive.

**KPI único:** **reunião de assessoria agendada** — não "cadastro". Essa é a
diferença estrutural em relação às duas landings existentes, e ela reorganiza
tudo o que vem depois (formulário, obrigado, instrumentação, meta de verba).

**Meta declarada:** ≥ 40 reuniões/mês, com 3 assessores disponíveis.

---

## 1. A tese: fêmea não é touro, e o funil não pode ser o mesmo

| | Perpétuo TOUROS (`/touros`) | Perpétuo FÊMEAS (`/femeas`) |
|---|---|---|
| Quem compra | tem vaca comercial, quer bezerro melhor | está montando **criatório próprio** de PO |
| Motivação | melhorar o produto que já vende | **fazer os próprios touros** para vender a outros |
| Ciclo | curto — assessor manda o número, vende em 5 min | longo, consultivo |
| Pós-cadastro | passa o número do assessor no WhatsApp | **SDR faz pré-diagnóstico manual e agenda uma reunião** (§2.1) |
| Narrativa | "o touro certo se paga no bezerro" | "crie sua própria marca de Nelore PO" |
| Produto | touro PO | embriões · bezerras · novilhas · prenhes · pacote 3-em-1 (parida + prenha) · doadoras |
| Risco de campanha | lead frio (não responde WhatsApp) | **lead desqualificado em volume** |

**A decisão que muda a arquitetura:** pós-cadastro a página **não** entrega o
número do assessor. Ela conduz a uma **reunião agendada**. Isso significa que
a página de obrigado do fêmeas não é uma cópia de
`src/app/touros/_components/Obrigado.tsx` com texto trocado — ela tem uma função
nova (Fase 8).

---

## 2. O problema que a página existe para resolver

Da reunião, textualmente:

- **João Antônio:** *"a fêmea chama muito, vai cair muita gente."*
- O criativo "crie seu criatório" da última rodada trouxe **gente querendo fêmea
  de gado comercial** (não PO) e **gente querendo comprar 50–70 cabeças**
  (inviável).
- **Marcelo, encerrando:** *"vamos melhorar a qualificação dessa página, tem que
  ser um trem bem robusto."*

**As duas alavancas acordadas — e elas são complementares, não alternativas:**

1. **Atrito no formulário** — pedir CPF, inscrição estadual e afins, sinalizando
   "aqui não é brincadeira". Combinado com qualificação manual por WhatsApp:
   João Gabriel disse preferir *"um pouco dos dois"*.
2. **Seções "para quem é" / "para quem não é"** — filtrar **antes** do
   formulário, na leitura.

**Uma terceira função do atrito, que a reunião não nomeou mas a aritmética da
Fase 0 nomeia:** o formulário de alto atrito não serve só para *filtrar* — ele
serve para **pré-executar parte do pré-diagnóstico**. Com a triagem decidida como
manual e concentrada em uma pessoa (§2.1), o formulário deixa de ser filtro e
vira **infraestrutura de capacidade** (Fase 0, T0.3.1).

---

## 2.1 O funil com o SDR (decidido em 05/08)

Três decisões do cliente que mudam o **desenho**, não só a configuração:

| # | Decisão | Fecha |
|---|---|---|
| 1 | **São 3 assessores**, não 2 | C-13 |
| 2 | **O pré-diagnóstico é manual.** Nada de automatizar triagem nesta versão — o formulário coleta e organiza; **quem decide é gente** | C-03 |
| 3 | **Quem opera o agendamento é o SDR — e é o mesmo SDR que faz o pré-diagnóstico** | C-02 |
| 4 | **São 3 SDRs**, não um (correção de 05/08) | — |

⚠️ **Aberto: 3 SDRs + 3 assessores (seis pessoas) ou as mesmas 3 acumulando os
dois papéis?** É a pendência **C-14**, e ela muda o limiar de `t_aprov` de ~22%
para ~43% (Fase 0, T0.3). Não resolvida aqui.

```
formulário → SDR (pré-diagnóstico manual + agendamento) → reunião com assessor
```

**A decisão 3 é a que mais mexe no plano.** Existe um papel dedicado entre o
formulário e o assessor, e três consequências saem daí:

- **O lead de fêmeas NÃO é roteado direto para aba de assessor**, como o de
  touros faz via `tourosTabDaUF()` (`src/lib/jmp-sheets.ts:1559`). Ele vai para
  uma **fila do SDR** — aba única, sem divisão por UF (Fase 2).
- **Triagem e agendamento são toques da mesma pessoa** e competem pelo mesmo
  dia — agora com teto de **3 × 7 = 21 toques/dia**. A conta de capacidade soma
  os dois, e no cenário (b) de C-14 soma também a reunião (Fase 0, T0.3).
- **Existem dois portões, e confundi-los quebra a medição** (Fase 5, T5.3):
  o veredito do servidor (`is_mql`, instantâneo) é **sinal para o algoritmo de
  mídia**; o veredito do SDR (`Aprovado`, manual) é **o portão real do funil**.

⚠️ A decisão 1 (3 assessores) descreve o roteamento do funil de **touros**. O de
fêmeas não passa por `tourosTabDaUF()`, então **C-13 não bloqueia nada aqui** —
ela volta a importar só no momento em que o SDR escolhe para qual assessor mandar
a reunião (Fase 8).

---

## 3. O que já está verificado no código (âncoras reais)

Tudo abaixo foi lido neste repositório antes de planejar. Cada linha é reusável
ou é uma armadilha a evitar.

| O quê | Onde | Uso no plano |
|---|---|---|
| Landing perpétua de touros (fork base) | `src/app/touros/` — `page.tsx`, `layout.tsx`, `_components/`, `_lib/` | Fases 3, 6, 7 |
| Landing de lançamento (2º análogo + `README.md` com as regras duras) | `src/app/saogeraldo/` | Fases 3, 9 |
| Rota de lead do perpétuo | `src/app/api/touros/lead/route.ts` | Fase 5 (fork) |
| Rota de lead do lançamento (fork já feito, com o comentário que explica a armadilha da planilha) | `src/app/api/saogeraldo/lead/route.ts:47–67` | Fase 5 |
| Régua de MQL canônica | `src/lib/crm-types.ts:136` → `DEFAULT_JMP_MQL_RULE = { min_cabecas: 100, require_ie: true }` | Fase 5 (**precisa mudar** para fêmeas) |
| Avaliador de MQL (servidor) | `src/lib/crm-types.ts:196` → `evaluateMql()` | Fase 5 |
| Funil do CRM | `src/lib/crm-types.ts:151` → `JMP_FUNNEL_ID = 'default'` | Fase 2 |
| Aba-arquivo do perpétuo | `src/lib/jmp-sheets.ts:18` → `LEADS_BULA_PERPETUO_TAB = 'LEADS BULA - PERPETUO'` | Fase 2 |
| Append da landing na aba-arquivo | `src/lib/jmp-sheets.ts:808` → `appendLeadToPerpetuoSheet()` | Fase 2 |
| **Marcador de funil na aba-arquivo (armadilha)** | `src/lib/jmp-sheets.ts:783` e `:1532` → `form_name` fixo `'Landing Touros — Funil Perpétuo'` | Fase 2 |
| **Cron que varre por esse `form_name`** | `src/lib/jmp-sheets.ts:1985` (dentro de `syncTourosLandingTabs`), chamado em `src/app/api/jmp/sheet-perpetuo/route.ts:35` | Fase 2 |
| Abas de trabalho por assessor | `src/lib/jmp-sheets.ts:1518–1520` (`LEADS TOUROS`, `LEADS DOUGLAS`, `LEADS JOAO ANTONIO`) | Fase 2 |
| Roteamento UF → assessor (**divide entre 2; hoje são 3**) | `src/lib/jmp-sheets.ts:1559–1567` → `tourosTabDaUF()` | Fase 2 — **o fêmeas NÃO usa**: vai para a fila do SDR (§2.1) |
| Cabeçalho das abas de trabalho (tem coluna `'Qtd. de touros'`) | `src/lib/jmp-sheets.ts:1571–1575` → `TOUROS_HEADER` | Fase 2 |
| Aba dedicada de lançamento (modelo do que fazer) | `src/lib/jmp-sheets.ts:1903–1933` → `LEADS_SAO_GERALDO_TAB` + `appendLeadToSaoGeraldoTab()` | Fase 2 |
| Shape do lead que a planilha aceita | `src/lib/jmp-sheets.ts:307–329` → `interface SheetLead` | Fase 2 |
| Máscara/normalização de WhatsApp | `src/lib/telefone.ts` → `aplicarMascaraTelefone`, `normalizarWhatsapp`, `whatsappValido` | Fases 5, 6 |
| **Validação de CPF com dígito verificador** | `src/lib/habilitacao-form.ts:52` → `cpfValido()` (e `src/lib/crm-lead-autofill.ts:35`) | Fase 6 |
| **Consulta server-side de Inscrição Estadual por CPF+UF** | `src/lib/state-registration-provider.ts:261` → `consultarInscricaoEstadualPorCpf()`; gate em `:366` `isFiscalApiConfigured()` | Fase 5 (opcional) |
| Termômetro do lead (6 dimensões + gargalo) | `src/lib/lead-score.ts:65` → `computeLeadScore()` | Fase 11 |
| Qualificação normalizada do lead | `src/lib/crm-qualificacao.ts` | Fase 11 |
| **Tabela de agendamentos já existe** | `supabase/migrations/0008_agenda_agendamentos.sql:84`; `source` restrito a `calendly \| google \| manual` (`:115`) | Fase 8 |
| Ponte Calendly → Google Calendar → `agendamentos` | `src/lib/agendamentos-sync.ts:1–34` (o Calendly Free **não tem API/webhook**; a ponte é o Google Calendar) | Fase 8 |
| Link de agenda default já configurado | `src/lib/agendamentos-sync.ts:28` → `https://calendly.com/joaoeduardo-lp1/contato-cliente` | Fase 8 — **descartado no go-live** (agenda de uma pessoa; são 3 assessores). Volta na Fase 11 |
| API de agendamentos (GET/POST, `requireAdmin`) | `src/app/api/agendamentos/route.ts` | Fase 8 |
| GTM único, separação por URL de obrigado | `src/app/touros/_components/GoogleTagManager.tsx:14` → default `GTM-K8RXFDDT`; `src/app/saogeraldo/_components/GoogleTagManager.tsx:8–12` (decisão do cliente 27/07: **não se cria container novo**) | Fase 9 |
| Regra de cache de assets | `next.config.mjs:22–39` | Fase 3 |
| Crons da Vercel (o `sheet-perpetuo` **não** está aqui — roda por GitHub Actions) | `vercel.json`; ver comentário em `src/app/api/jmp/sheet-perpetuo/route.ts:6–9` | Fase 2 |

### 3.1 Duas regressões reais encontradas nos análogos — não repetir

Estas não são hipóteses. São `grep` reproduzíveis, hoje, no `main` desta branch.

**R-1 — O fork do São Geraldo nunca trocou o namespace, e está poluindo o
perpétuo de touros.**

```
src/app/saogeraldo/_lib/utm.ts:29      const STORAGE_KEY = 'touros_utm'
src/app/saogeraldo/_lib/analytics.ts:75    ph?.capture('touros_view', …)
src/app/saogeraldo/_lib/analytics.ts:110   posthog?.capture('touros_lead_submitted', …)
```

O `.planning/leilao-sao-geraldo/PLAN.md` (T2.2, T9.1, T9.5) mandava trocar para
`sg7p_utm` / `sg7p_*`. Não foi feito. Consequência: no PostHog, os eventos das
duas landings estão no **mesmo nome**, e em ambiente de mesma origem
(localhost/preview) a atribuição de UTM de uma sobrescreve a da outra.

> **Isso é exatamente o mesmo problema que o cliente pediu para resolver com a
> "separação por aba de interesse".** Já falhou uma vez, num plano que
> explicitamente mandava não falhar. A Fase 9 deste plano transforma isso em
> `grep` de bloqueio de merge, não em instrução de texto.

**R-2 — Os dois análogos discordam sobre `dataLayer`, e o `/touros` está do lado
arriscado.**

```
src/app/touros/_lib/analytics.ts:33–38   pushDataLayer() → win.dataLayer.push(payload)
src/app/touros/_lib/analytics.ts:85, 98  usa em initAnalytics() e trackFunnel()

src/app/saogeraldo/_lib/analytics.ts:4   "Este módulo NÃO toca o dataLayer"
src/app/saogeraldo/README.md:63–65       "Nada é empurrado ao dataLayer. O container
                                          tem um acionador catch-all; qualquer push
                                          duplicaria PageView e dispararia Meta/GA4
                                          a cada micro-evento."
```

Não dá para forkar "o padrão da casa" porque não existe um. **Decisão deste
plano: o fêmeas segue o São Geraldo — zero push ao `dataLayer`** (INV-2). É o
lado seguro dado o acionador catch-all descrito no README, e é o lado que
sobreviveu a uma campanha real com medição auditada.

⚠️ **Não incluí no escopo desta feature** verificar se o `/touros` está
duplicando conversão hoje por causa disso. É uma auditoria do `/touros`, com
risco próprio (a rota está em produção convertendo), e vira item da Fase 11.

---

## 4. INVARIANTES — não podem regredir no fork

Herdados do `.planning/leilao-sao-geraldo/PLAN.md` §INVARIANTES, mais os
específicos deste funil. Cada um tem comando de guarda na Fase 10.

| # | Invariante | Porquê |
|---|---|---|
| **INV-1** | Navegação pós-submit é **HARD** (`window.location.assign`), nunca `router.push` | Só um load completo dispara o gatilho Page View do GTM, onde a tag de conversão do Meta roda. Ver `src/app/touros/_components/Formulario.tsx:228–237` e `src/app/saogeraldo/README.md:57–61` |
| **INV-2** | `_lib/analytics.ts` **não empurra nada ao `dataLayer`** | Acionador catch-all no container duplicaria PageView. Ver R-2 acima |
| **INV-3** | Veredito de qualificação é do **SERVIDOR**, nunca do browser | O client é falsificável e o veredito escolhe URL de obrigado e valor de conversão. `src/app/api/touros/lead/route.ts:116–119` |
| **INV-4** | **Namespace próprio em tudo**: `femeas_utm`, `femeas_*` no PostHog, `interesse: 'femeas-po'`, aba própria na planilha | É a falha R-1. Sem isso, os dois perpétuos viram um só nos dados |
| **INV-5** | Toda copy comercial em `_lib/copy.ts` — zero string comercial hardcoded em componente | João Antônio revisa copy sem tocar em componente |
| **INV-6** | Mobile-first: inputs `font-size: 16px`, alvos ≥44px, contraste AA, `prefers-reduced-motion` respeitado | `src/app/touros/_components/Formulario.tsx:546–555` já faz; tráfego é mobile |
| **INV-7** | **Um único formulário na página**, em `#cadastro` | Duas instâncias duplicam os eventos de funil (`src/app/saogeraldo/README.md:67–69`) |
| **INV-8** | **Nenhuma alteração em `src/app/touros/`, `src/app/api/touros/`, `src/app/saogeraldo/` ou `src/app/api/saogeraldo/`** | As duas rotas estão em produção convertendo. Toda mudança em `src/lib/jmp-sheets.ts` é **aditiva** (funções novas), nunca edição de função existente |

---

## 5. Convenções de nomenclatura (travadas — usar exatamente assim)

Definidas aqui para nenhum executor inventar variação. É a correção direta de R-1.

| Item | Valor |
|---|---|
| Rota da página | `src/app/femeas/` |
| Rota da API | `src/app/api/femeas/lead/route.ts` |
| Obrigado (aprovado/prioritário) | `src/app/obrigado-femeas-mql/page.tsx` |
| Obrigado (lead) | `src/app/obrigado-femeas-lead/page.tsx` |
| Assets | `public/femeas/` |
| `source` / rótulo do funil | `'femeas-perpetuo'` |
| `origem` | `'Landing Fêmeas — Funil Perpétuo'` |
| `interesse` (coluna da planilha) | `'femeas-po'` |
| `form_name` na aba-arquivo | `'Landing Fêmeas — Funil Perpétuo'` |
| Aba de trabalho na planilha | `'LEADS FEMEAS'` |
| Chave de UTM em `sessionStorage` | `'femeas_utm'` (**não** `touros_utm`) |
| Prefixo de eventos PostHog | `femeas_*` (`femeas_view`, `femeas_form_started`, `femeas_lead_submitted`, `femeas_reuniao_agendada`, …) |
| Container GTM | `GTM-K8RXFDDT` (o mesmo — decisão do cliente 27/07) |
| Domínio | `femeas.bulaassessoria.com` — **[PENDENTE C-10]** |

---

## 6. Estrutura de fases e dependências

```
Fase 0 (modelo do funil)  ─┐
Fase 1 (decisões/infra)  ──┴─► Fase 2 (dados: separação touros/fêmeas)
                                      │
Fase 3 (rota/tokens/cache) ───────────┤
Fase 4 (copy + categorias) ───────────┤
                                      ├─► Fase 5 (API + régua de fêmeas)
                                      │        │
                                      │        ├─► Fase 6 (formulário de atrito)
                                      │        └─► Fase 8 (obrigado + agendamento)
                                      └─► Fase 7 (seções da página)
Fases 5+6+7+8 ─► Fase 9 (instrumentação) ─► Fase 10 (QA + go-live) ─► Fase 11 (melhoria contínua)
```

**Ordem recomendada:** 0 e 1 em paralelo → **2 e 3 em paralelo** → 4 → 5 →
6 (paralelo com 7) → 8 → 9 → 10 → 11 (contínua).

**Estado em 05/08 (fim do dia):** Fases **3, 4, 2 e 5 feitas** (`3d8c894`,
`ecb9af7`, `c0e77d0`, `7642809`). Fases **6 e 8** em execução. Fases 0, 1 e 7
seguem desbloqueadas e não começadas.

⚠️ **Antes de executar qualquer fase, leia `EXECUCAO.md` neste diretório.** A
Fase 2 deste plano foi escrita contra uma versão de `src/lib/jmp-sheets.ts` que
mudou em 31/07 — a aba `LEADS FEMEAS` que ele manda criar **não deve ser
criada**, porque a aba `FEMEAS` já existe e é ela que virou a fila do SDR. As
âncoras de linha do plano para aquele arquivo também não batem mais. O
`EXECUCAO.md` registra esse e os outros quatro desvios, com o motivo de cada um.

**Caminho crítico:** `0 → 1 → 2 → 3 → 4 → 5 → 6 → 8 → 9 → 10`.

**Dependência externa não bloqueante:** leilão em **29/08**, com gravações na
fazenda em **14 ou 15/08**. Concorre por atenção da mesma equipe (Marcelo faz os
criativos, João Antônio apoia na copy). Não bloqueia código, mas **bloqueia
revisão de copy e produção de criativo** na janela 14–16/08. Planejar as Fases 4
e 7 para fechar **antes de 13/08** ou **depois de 18/08**.

---

## Fase 0 — Modelo do funil e taxas-alvo (conta inversa)

**Objetivo:** transformar "40 reuniões/mês" em uma cadeia de taxas nomeadas, e
descobrir **qual delas precisa ser verdadeira** para a meta fechar. Fase de
aritmética. **Zero código.**

**Por que é a Fase 0 e não um apêndice:** a conta inversa determina o volume de
lead que o funil precisa suportar; o volume determina se **um** SDR dá conta da
triagem manual (decidida em 05/08) e quanto atrito o formulário precisa comprar
(pendência C-01). Planejar formulário antes de fazer a conta é chutar — e, com
triagem manual, o formulário é a **única** alavanca de escala que sobra.

### T0.1 — O benchmark, reconciliado. **C-05 fechado em 05/08.**

O *"R$ 250 por cadastro"* da ata é **conta de cabeça feita ao vivo na chamada**
("3400 dividido por 15"). A apuração precisa, cruzando o export do Gerenciador
de Anúncios com a planilha do CRM, foi feita nesta sessão e fecha a pendência.

**Recorte:** janela **25/07 a 01/08/2026**, as **duas campanhas somadas**
(`LEAD - PERPETUO TOURO` + `LEADS - SAO GERALDO`). É a janela pedida
textualmente na reunião: *"janela de tempo de São Geraldo, mas perpétuo dia 25"*.

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
repositório por pedido explícito. **Não copiar para o projeto.**

**A ambiguidade que este plano levantou era procedente, e a resposta é a terceira
opção:** "cadastro", na fala do cliente, é **a etapa CADASTRO OK no CRM** — não
preenchimento de formulário.

> **Regra de uso, e é aqui que mora o erro de 10x:** use **R$ 226,55** onde a
> conta pedir custo por *cadastro*; use **R$ 29,30** onde pedir custo de *entrada
> no funil*. **Nunca misturar os dois.**

**Por que `outputs/resumo-ads-27jul-01ago-2026.html` mostra outros números — é
recorte diferente, não conflito.** Aquele arquivo cobre **27/07–01/08** e **só o
perpétuo** (R$ 1.192,58). A ponte fecha: perpétuo em 25/07–01/08 = R$ 1.984,68;
em 27/07–01/08 = R$ 1.192,58; a diferença de **R$ 792,10** são os dias 25 e 26.
Além disso, os arquivos antigos em `outputs/` foram construídos sobre a API com
token vencido e **subcontam gasto** — o comentário em
`scripts/lib/midia-27jul-01ago-2026.mjs:1–8` documenta exatamente esse episódio.

> **Fonte de verdade do gasto = export do Gerenciador, não `outputs/`.**
> Vale para todo número de mídia deste plano e dos próximos.

**Duas ressalvas que precisam sobreviver a qualquer citação destes números:**

1. **O custo por cadastro é exato no total e é uma FAIXA por campanha.** Dos 15
   cadastros, só **12 são rastreáveis** até a campanha — 3 tiveram a etapa
   atualizada depois do export.

   | Campanha | Custo por cadastro |
   |---|---|
   | **Perpétuo Touro** | **R$ 283,53 a R$ 496,17** |
   | São Geraldo (leilão) | R$ 128,51 a R$ 176,70 |
   | Blended (exato) | R$ 226,55 |

2. **R$ 226,55 é média puxada para baixo por um leilão.** São Geraldo é evento
   único, com data como motor de urgência — um perpétuo não tem esse motor.
   **O benchmark limpo para calibrar OUTRO perpétuo é o do perpétuo isolado, que
   é mais caro: R$ 283,53 a R$ 496,17.** Todo cenário abaixo roda nas duas
   versões, e a diferença entre elas não é detalhe: é 2,2x de verba.

### T0.2 — A cadeia inversa

```
reuniões realizadas/mês          = 40                          [META]
÷ t_show   (comparecimento)      = 75%      [ASSUMIDO]   → 53 agendamentos/mês
÷ t_agenda (aprovado → agendado) = 60%      [ASSUMIDO]   → 89 aprovados/mês
÷ t_aprov  (lead → aprovado)     = ?        [O BURACO]   → leads/mês
÷ t_lp     (acesso → formulário) = ?        [teto 3,9%]  → acessos/mês
× CPC                            = R$ 1,16  [MEDIDO]     → verba/mês
```

**`t_aprov` é a única incógnita que importa, e ela move a verba em 3x.** Duas
premissas defensáveis, e o plano não escolhe entre elas — ele diz que medir isso
primeiro vale mais que qualquer outra decisão da Fase 0:

| Premissa de `t_aprov` | leads/mês | Verba a R$ 29,30/formulário | Triagem/dia útil |
|---|---:|---:|---:|
| **35%** — otimista; assume que o atrito do formulário faz a triagem funcionar | 254 | **R$ 7.442** | 12 |
| **12,9%** — **[MEDIDO]**: 15 cadastros ÷ 116 formulários na janela 25/07–01/08 | **690** | **R$ 20.217** | **31** |

⚠️ **O caminho "89 aprovados × R$ 226,55 = R$ 20.163" dá o mesmo número por
construção, não por confirmação independente** — R$ 226,55 é exatamente
R$ 29,30 ÷ 12,9%. Citar os dois como se fossem duas evidências é contar a mesma
coisa duas vezes.

**Na base do perpétuo isolado** (ressalva 2 de T0.1), que é o benchmark correto
para calibrar um perpétuo: 89 aprovados × R$ 283,53 a R$ 496,17 =
**R$ 25.234 a R$ 44.159/mês**.

**Os 12,9% e o "cadastro aprovado" do fêmeas não são a mesma coisa** — CADASTRO
OK é habilitação completa (documento, crédito), e a "aprovação do cadastro" da
jornada de fêmeas é um portão mais leve, antes da reunião. A verdade está
**entre 12,9% e 35%**, e o intervalo vale de R$ 7,4k a R$ 20k/mês. É o número
mais caro que este plano ainda não sabe.

**Checagem pelo outro lado da cadeia (`t_lp`):**

| Landing | Acesso → formulário |
|---|---:|
| `/touros` (perpétuo) | **3,9%** [MEDIDO] — teto observado numa landing nossa de público qualificado |
| `/saogeraldo` (leilão) | 2,1% [MEDIDO] |
| Blended da janela | 3,7% (116 ÷ 3.135) |

⚠️ **O blended fica colado no touros porque "acesso" e "formulário" não são o
mesmo funil nas duas campanhas:** o São Geraldo rodou pesado em Formulário
Instantâneo, e lead de Instant Form **nunca toca a landing**
(`ANALISE-VERBA-SAOGERALDO-2026-07-31.md` §3.3: o criativo `03` fez 10 de 10
leads por essa rota). Não derivar volume por campanha a partir do blended.

**A landing de fêmeas adiciona atrito de propósito, então a premissa realista
fica ABAIXO de 3,9%.** Cenário-base: **3,0%**.
690 leads ÷ 3,0% = 23.000 acessos × R$ 1,16 = **R$ 26.680/mês**.
A 3,7% seriam R$ 21.633. **A queda de 3,7% → 3,0% custa ~23% de verba** — e esse
é exatamente o preço que a pendência **C-01** está negociando quando decide
quantos campos de atrito ficam no formulário.

**Continua valendo: não há nenhum dado de funil de FÊMEAS neste repositório.**
`t_show`, `t_agenda`, `t_aprov` e `t_lp` do fêmeas são **[ASSUMIDO]**. O que foi
medido é o funil de touros, e ele é o análogo mais próximo disponível — não é o
mesmo público.

### T0.3 — Capacidade: **são 3 SDRs**, e o gargalo vira condição

**Correção de premissa em 05/08:** são **3 SDRs**, não um. A versão anterior
desta fase modelou uma pessoa e produziu um pedido de recurso que **não existe**.
O que existe é uma **condição**, e ela é mensurável nas primeiras semanas.

**Decidido em 05/08 (fecha C-02 e C-03):** o pré-diagnóstico é **manual** — nada
de automatizar triagem nesta versão — e quem o faz é o **SDR**, que também opera
o agendamento:

```
formulário → SDR (pré-diagnóstico manual + agendamento) → reunião com assessor
```

Triagem e agendamento continuam sendo **toques da mesma pessoa** e competem pelo
mesmo dia. O que mudou é o teto: **3 × 7 = 21 toques/dia**, 462/mês.

#### Antes de tudo: uma divergência de conta que muda a conclusão

A conta rápida do coordenador — *"a 12,9% de aprovação, 40 reuniões/mês pedem
~310 leads/mês, ~14 toques/dia no time, ~4,7 por SDR"* — **está aritmeticamente
certa, mas para `t_aprov` = 35%, não para 12,9%.**

O motivo é que ela colapsa dois elos da cadeia: `310 × 0,129 ≈ 40` trata
**aprovado como sinônimo de reunião realizada**. Entre um e outro existem
`t_agenda` (60%) e `t_show` (75%) — combinados, **45%**. Com eles, 40 reuniões
exigem **88,9 aprovados**, não 40.

| | conta rápida | modelo completo |
|---|---|---|
| Aprovados para 40 reuniões | 40 | **88,9** |
| Leads a 12,9% | ~310 | **689** |
| Toques/dia no time | ~14 | **33,7** |
| Por SDR/dia | ~4,7 | **11,2** |

**Os ~14/dia e ~4,7/SDR aparecem no modelo — em `t_aprov` = 35%.** A conta estava
certa; o rótulo é que trocou. E a diferença importa: a 12,9% o time fica **1,6x
acima** da referência de 7/dia; a 35% fica **33% abaixo**.

#### Cenário (a) — 3 SDRs + 3 assessores (seis pessoas)

Teto do time de SDR: **21 toques/dia · 462/mês**. Os assessores não competem por
esse teto (0,6 reunião/dia cada, folgado).

| `t_aprov` | leads/mês | toques/mês | time/dia | **por SDR/dia** | vs. referência de 7 |
|---|---:|---:|---:|---:|---|
| **12,9%** [MEDIDO] | 689 | 742 | 33,7 | **11,2** | 🔴 1,6x acima |
| 20% | 444 | 498 | 22,6 | 7,5 | 🟡 no limite |
| **21,8%** | 408 | 461 | 21,0 | **7,0** | ⚖️ **break-even** |
| 30% | 296 | 350 | 15,9 | 5,3 | 🟢 folga |
| **35%** [premissa otimista] | 254 | 307 | 14,0 | **4,7** | 🟢 33% abaixo |
| 50% | 178 | 231 | 10,5 | 3,5 | 🟢 folga larga |

> **Cenário (a) fecha se `t_aprov` ≥ ~22%.** Não é "fecha com folga" nem "não
> fecha" — é **condicional**, e a condição é exatamente o que o formulário de
> alto atrito existe para comprar. O análogo medido (12,9%, funil de touros)
> está **abaixo**; a premissa otimista (35%) está **bem acima**. A resposta vem
> nas primeiras 200 submissões, não de estimativa.

#### Cenário (b) — as mesmas 3 pessoas acumulando SDR e assessor

Aqui a reunião consultiva **sai do mesmo dia** que a triagem e o agendamento.
Para somar, é preciso converter uma reunião de 1h em toques — e **essa conversão
é [ASSUMIDO], nunca foi medida**. Adoto **1 reunião = 5 toque-equivalentes**
(1h de reunião + preparo + follow-up ≈ 1,5h, contra ~15–20 min por toque).

Carga fixa/mês = 53 agendamentos + 40 reuniões × 5 = **253 toque-equivalentes**,
antes de triar um único lead.

| `t_aprov` | carga total/mês | time/dia | **por pessoa/dia** |
|---|---:|---:|---:|
| 12,9% [MEDIDO] | 942 | 42,8 | **14,3** 🔴 |
| 35% [premissa otimista] | 507 | 23,1 | **7,7** 🔴 |
| 50% | 431 | 19,6 | **6,5** 🟢 |
| **42,6%** | 462 | 21,0 | **7,0** ⚖️ break-even |

> **Cenário (b) exige `t_aprov` ≥ ~43% — quase o dobro do (a).** E 43% está
> **acima da premissa otimista de 35%**: no cenário (b), nem o cenário bom fecha.

⚠️ **E (b) é frágil na premissa que ninguém mediu.** Sensibilidade ao custo da
reunião:

| 1 reunião = | break-even `t_aprov` |
|---|---|
| 3 toque-equivalentes | 30,8% |
| **5** (adotado) | **42,6%** |
| 8 toque-equivalentes | **impossível** — a carga fixa sozinha estoura o teto |

**A viabilidade de (b) depende de um número que não existe em lugar nenhum.**
Se a reunião consultiva de fêmeas for mais pesada que 5 toques — e ela é longa
por desenho (fazenda, projeto, orçamento) —, (b) não fecha em nenhuma `t_aprov`.

### T0.3.1 — O que decidir, e o que apenas medir

**O pedido de recurso saiu.** No lugar dele ficam uma pendência e um limiar.

**A pendência — C-14, e o plano não a resolve.** O cliente disse "3 assessores"
antes e "3 SDRs" agora. São seis pessoas (a) ou as mesmas três acumulando (b)?

| | Cenário (a) — 6 pessoas | Cenário (b) — 3 acumulando |
|---|---|---|
| Limiar de `t_aprov` para 40 reuniões/mês | **~22%** | **~43%** |
| A premissa otimista (35%) fecha? | **sim, com folga** | **não** |
| Depende de número não medido? | não | **sim** (custo da reunião em toques) |

> **Sim, muda a decisão** — e muda de forma binária na premissa que já temos:
> a 35%, (a) fecha com 33% de folga e (b) fica 10% acima do teto. Enquanto C-14
> não for respondida, **planejar por (a) e medir para (b)**: (a) é o cenário
> declarado pelo cliente e o mais provável, mas se (b) for a realidade, o limiar
> dobra e o formulário passa a ser o único caminho.

**O limiar, que vale nos dois cenários.** `t_aprov` deixou de ser curiosidade e
virou **o número que decide se a meta fecha**:

```
t_aprov < 22%   → nem o cenário (a) fecha. Reabrir capacidade ou meta.
22% ≤ t < 43%   → (a) fecha; (b) não. A resposta de C-14 passa a ser decisiva.
t_aprov ≥ 43%   → fecha nos dois. A meta de 40 deixa de ser a restrição.
```

**O formulário continua sendo a alavanca — mudou o que ele precisa entregar.**
Com triagem manual (C-03), a régua automática no servidor sai de cena como
alavanca de escala e sobra **uma só**: o formulário. A diferença é que ele não
precisa mais fazer o impossível (a versão anterior deste plano pedia 88% de
aprovação com um SDR). **Ele precisa levar `t_aprov` de 12,9% para ~22%** —
uma melhora de 1,7x, plausível para um formulário desenhado para filtrar somada
às seções "para quem é / para quem não é".

⚠️ **O que a folga NÃO compra:** margem para comprar lead sem triar. A 12,9% e
com 3 SDRs, a carga ainda é 11,2/SDR/dia — acima da referência. **A folga é
condicional ao formulário funcionar**, e o sinal de que não funcionou aparece na
fila, não no relatório de mídia (T0.4).

### T0.4 — Sinais de falsificação do modelo

Cada taxa vira um alarme com valor e prazo. Agora com números medidos como
referência, não com placeholders:

```
t_aprov < 25% após 200 leads   → as duas alavancas não estão funcionando; 40
                                 reuniões/mês é inalcançável com o time atual.
                                 Renegociar meta ou escalar triagem (C-03).
t_aprov ≥ 45% após 200 leads   → as alavancas funcionam; recalcular a verba —
                                 ela cai ~3x em relação ao cenário medido.
t_lp < 2,1%                    → o atrito passou do ponto: a landing de fêmeas
                                 converte pior que uma landing de LEILÃO.
                                 Reabrir C-01 com o dado por passo (T6.4).
t_show < 60%                   → o agendamento está frouxo (lembrete/no-show);
                                 comprar mais lead não resolve.
custo/formulário > R$ 45       → o público de fêmea é mais caro que o de touro
                                 (R$ 29,30 medido); a conta inversa inteira muda.
custo/aprovado > R$ 500        → passou do teto do perpétuo isolado (R$ 496,17).
                                 Parar antes de escalar verba, não depois.

── capacidade dos 3 SDRs (T0.3) ─────────────────────────────────────────
fila cresce 2 semanas seguidas   → a entrada é maior que a vazão. NÃO comprar
                                   mais lead: o backlog já é mídia paga parada
                                   (`ANALISE` §7 mediu R$ 603 nessa situação).
lead sem 1º toque em >24h         → a cadência quebrou, e cadência é tratada
  em >20% dos casos                como o fator decisivo de conversão. É sinal
                                   de teto, não de desleixo.
ritmo médio por SDR <5/dia         → o teto real é menor que os 7/dia assumidos.
  com fila NÃO vazia               Recalcular os limiares de T0.3: a 5/dia o
                                   break-even do cenário (a) sobe de 22% p/ ~30%.
t_aprov < 22% após 200 leads       → nem o cenário (a) fecha. A meta de 40 volta
                                   à mesa junto com C-14.
```

**Regra de leitura, e ela não mudou com os 3 SDRs:** os sinais de capacidade
valem **mais** que os de mídia. Verba resolve numerador; nenhum deles resolve
denominador. **O que mudou é que agora há folga para testar isso em vez de ser
bloqueio** — mas a folga é condicional a `t_aprov`, e só a fila responde.

**Critério de verificação:**
- `.planning/femeas-perpetuo/MODELO-FUNIL.md` existe, com as 5 taxas nomeadas, os
  dois cenários de `t_aprov`, as duas bases de custo (blended e perpétuo
  isolado), os dois testes de capacidade e os ≥6 sinais de falsificação.
- Toda taxa está marcada **[MEDIDO]** (com fonte e janela) ou **[ASSUMIDO]**.
  Nenhuma sem rótulo.
- Os números da apuração de 25/07–01/08 estão citados com a **fonte externa**
  nomeada, e **nenhuma cópia dela foi adicionada ao repositório**.
- As duas ressalvas de T0.1 (faixa por campanha; média puxada pelo leilão) estão
  no documento, não só neste plano.
- Nenhum lugar do documento usa R$ 226,55 e R$ 29,30 na mesma conta.
- O documento responde, em uma frase: *quantos leads/mês esta página precisa
  entregar, quanto isso custa, e qual `t_aprov` faz a meta fechar.*
- Os **dois cenários de C-14** estão modelados com seus limiares (~22% e ~43%),
  e a pendência foi **enviada ao cliente** — o plano não escolhe entre eles.
- A conversão "1 reunião = 5 toque-equivalentes" do cenário (b) está marcada
  **[ASSUMIDO]** com a tabela de sensibilidade (3 / 5 / 8), porque ela sozinha
  decide se aquele cenário é viável.
- A divergência entre a conta rápida e o modelo completo (t_agenda × t_show)
  está registrada — para ninguém refazer a conta colapsada depois.

**Dependências:** nenhuma.

---

## Fase 1 — Decisões travadas, pendências e infraestrutura

**Objetivo:** eliminar as incógnitas que **não estão no código** e que,
descobertas tarde, viram bloqueio de go-live. Descoberta + registro. **Zero
código de página.**

### T1.1 — Auditar como o subdomínio do perpétuo está roteado na Vercel

Não há `middleware.ts` nem rewrite em `next.config.mjs`/`vercel.json` neste
repositório — verificado: `vercel.json` só tem `crons`. O mapeamento
`touros.bulaassessoria.com` → `/touros` é feito **no painel da Vercel**.

Registrar em `.planning/femeas-perpetuo/INFRA.md`: (a) alias direto ou rewrite?
(b) se rewrite, qual regra? (c) registro DNS e destino; (d) status do SSL.

### T1.2 — Criar o domínio do fêmeas espelhando T1.1

⚠️ **Item de maior lead time do plano.** Propagação de DNS + emissão de SSL leva
horas. Executar assim que o nome for confirmado (C-10), não na véspera.

### T1.3 — Confirmar a decisão de GTM

Default: **reusar `GTM-K8RXFDDT`** (mesmo container), estendendo os gatilhos de
Page View para `/obrigado-femeas-mql` e `/obrigado-femeas-lead`. É a decisão que
o cliente já tomou em 27/07 para o São Geraldo
(`src/app/saogeraldo/_components/GoogleTagManager.tsx:8–12`). **Sem estender os
gatilhos, a conversão do fêmeas simplesmente não existe.**

### T1.4 — Disparar UMA mensagem consolidada de pendências ao cliente

Não 13 perguntas soltas — uma mensagem com os defaults já propostos, para o
cliente validar ou corrigir. Lista: as **9 pendências abertas** na seção
"Pendências — fechadas e abertas", no fim deste plano. **Anexar o pedido de
recurso de T0.3.1** — é a pergunta mais cara e não é dado que falta, é decisão. Registrar timestamp do envio em `INFRA.md`.

### T1.5 — Registrar a janela de indisponibilidade da equipe

Leilão 29/08; gravações na fazenda em 14 ou 15/08. Marcelo (criativos) e João
Antônio (copy) ficam indisponíveis nessa faixa. Escrever em `INFRA.md` a data
alvo de fechamento das Fases 4 e 7 **antes de 13/08**.

**Critério de verificação:**
- `.planning/femeas-perpetuo/INFRA.md` existe com 5 seções preenchidas: Domínio,
  GTM, Planilha/CRM, Pendências (com status), Janela da equipe.
- O domínio escolhido resolve com SSL válido (pode dar 404 nesta fase — a rota
  ainda não existe; o que importa é resolver).
- A estratégia de roteamento está escrita, não na cabeça de alguém.

**Dependências:** nenhuma. Roda em paralelo com a Fase 0.

---

## Fase 2 — Arquitetura de dados: separação touros × fêmeas

**Objetivo:** os dois perpétuos rodam ao mesmo tempo, os leads caem no mesmo
destino, **separados por interesse** — e essa separação existe de verdade na
planilha, no CRM e na instrumentação, não só no discurso.

**Esta fase é onde o pedido "separados por aba de interesse" vira código.**

### A armadilha, nomeada

`appendLeadToPerpetuoSheet()` (`src/lib/jmp-sheets.ts:808`) grava na aba-arquivo
`'LEADS BULA - PERPETUO'` **marcando a linha com `form_name` fixo**
`'Landing Touros — Funil Perpétuo'` (`:783`). O cron
`syncTourosLandingTabs()` (`:1941`) varre a aba-arquivo **filtrando exatamente
por esse `form_name`** (`:1985`) e distribui as linhas para
`LEADS TOUROS` / `LEADS DOUGLAS` / `LEADS JOAO ANTONIO`.

> **Se a rota de fêmeas chamar `appendLeadToPerpetuoSheet()` como está, todo lead
> de fêmea aparece nas abas dos assessores do perpétuo de touros.** É
> literalmente a armadilha documentada em
> `src/app/api/saogeraldo/lead/route.ts:56–61`, e é o motivo de a rota do
> São Geraldo ter aba própria.

### T2.1 — Destino do lead: a fila do SDR. **Decidido.**

`LEADS FEMEAS` **é a fila de trabalho do SDR** — aba única, sem divisão por UF
(§2.1). O lead de fêmeas não passa por `tourosTabDaUF()`, então o fato de aquela
função dividir entre 2 assessores enquanto existem 3 (C-13) **não afeta esta
fase**. Isso simplifica o cabeçalho e elimina uma decisão.

| Opção | Custo | Consequência |
|---|---|---|
| **(A) Aba dedicada `LEADS FEMEAS`**, espelhando `appendLeadToSaoGeraldoTab` (`:1910`) | ~1 função nova | Separação total. Perde o registro na aba-arquivo |
| **(B) Aba-arquivo + `form_name` próprio** | Parametrizar `buildPerpetuoLandingRow` (**edita função em produção — viola INV-8**) | Arquivo único, mas mexe no caminho do `/touros` |
| **(C) Aba-arquivo com `form_name` de touros** | zero | **Proibido.** É a armadilha acima |

**Default recomendado: (A) + variante aditiva de (B).** Criar em
`src/lib/jmp-sheets.ts`, **como funções novas, sem tocar nas existentes**:

- `LEADS_FEMEAS_TAB = 'LEADS FEMEAS'` e `FEMEAS_FORM_NAME = 'Landing Fêmeas — Funil Perpétuo'`
- `appendLeadToFemeasTab(lead)` — espelho de `appendLeadToSaoGeraldoTab` (`:1910`),
  reusando `ensureTourosLayout`, `tourosSeenIds`, `writeTourosRows` (idempotência
  por `Lead ID`, criação da aba, resolução por nome de coluna).

⚠️ **Não reusar `buildTourosRow()` verbatim.** `TOUROS_HEADER` (`:1571–1575`) tem
a coluna literal **`'Qtd. de touros'`** — usá-la para fêmeas rotula o dado
errado na tela da operação. Criar `FEMEAS_HEADER` com as colunas do funil de
fêmeas (ver T2.2) e um `buildFemeasRow` próprio.

### T2.2 — Definir o cabeçalho da aba `LEADS FEMEAS`

Base: `TOUROS_HEADER`, com as substituições que o funil exige.

```
'Atendido por', 'Data', 'Nome', 'WhatsApp', 'E-mail', 'CPF', 'UF', 'Zona',
'Cidade', 'Momento', 'Cabeças', 'Inscrição Estadual', 'Categoria de interesse',
'Quantidade desejada', 'Já cria PO?', 'Objetivo', 'Lead ID',
'1º toque em', 'Aprovado', 'Motivo da recusa', 'Reunião agendada',
'Assessor da reunião', 'utm_source', 'utm_campaign', 'utm_content', 'ad-id',
'Observações'
```

**As cinco colunas do meio são a fila do SDR**, e cada uma existe por um motivo
medido, não por completude:

| Coluna | Quem preenche | Para quê |
|---|---|---|
| `'1º toque em'` | SDR | Mede a **cadência**, tratada na reunião como o fator decisivo de conversão. Sem ela, "atende rápido" não é verificável |
| `'Aprovado'` | SDR | **O portão real do funil.** É o numerador de `t_aprov` (Fase 0) |
| `'Motivo da recusa'` | SDR | É o que ensina o formulário. Sem o motivo, C-01 se decide no achismo |
| `'Reunião agendada'` | SDR | Numerador do KPI |
| `'Assessor da reunião'` | SDR | Distribui entre os **3** assessores (C-13) no momento do agendamento |

Regras herdadas que **não** mudam:
- `'Atendido por'` e `'Observações'` são da equipe — **o código nunca escreve
  nessas colunas** (`src/lib/jmp-sheets.ts:1570`).
- `ensureTourosLayout` só **acrescenta** coluna no fim; colunas criadas pela
  equipe são preservadas.
- Leads de teste não vão para a aba de trabalho (`isTourosTestLead`, `:1645`).

As colunas `'Aprovado'` e `'Reunião agendada'` nascem vazias — são preenchidas
pela operação (ou pela Fase 8, se o agendamento for automatizado). Existem desde
o dia 1 porque **são as duas colunas que medem o KPI real da página**, e criar
coluna depois numa planilha com fórmulas da equipe custa mais caro.

### T2.3 — Ligar a aba ao cron de auto-cura (opcional, com trade-off)

`syncTourosLandingTabs()` serve de rede de segurança: se o append do cadastro
falhar, o cron recupera na próxima passada. Para o fêmeas, essa rede só existe
se o lead estiver na aba-arquivo — o que a opção (A) não faz.

**Trade-off explícito:** sem rede de segurança, uma falha do Google Sheets no
momento do submit perde o lead. **Mitigação sem cron:** manter o append
**bloqueante** (como em `src/app/api/saogeraldo/lead/route.ts:161–173`), devolvendo
erro ao lead para ele reenviar, em vez de best-effort silencioso.
**Default: append bloqueante, sem cron novo nesta fase.** Item da Fase 11.

### T2.4 — Decidir CRM: entra ou não entra

O `/touros` **deixou de gravar em `crm_leads` em 24/07**, por decisão do cliente
(`src/app/api/touros/lead/route.ts:38–45`): lead em ENTRADA cai no radar dos
disparos/followups e no concierge IA, e aquela campanha é de atendimento 100%
manual.

**Para o fêmeas a decisão precisa ser tomada de novo, porque o funil é outro:**
o KPI é reunião agendada, e a tabela `agendamentos` tem `lead_id` referenciando
o CRM (`src/app/api/agendamentos/route.ts:17–22`). **Sem lead no CRM, o
agendamento não amarra em ninguém.**

Opções: (A) só planilha, como o touros — agendamento amarra por telefone/e-mail;
(B) CRM + planilha, com `source='femeas-perpetuo'` e concierge/followup
**explicitamente desligados** para essa `source`.
**Default recomendado: (A) para o go-live**, (B) como evolução da Fase 11 — (B)
exige auditar o concierge e o `inactivity-sweep`, o que é escopo próprio.
**Pendência C-11.**

⚠️ **O SDR reforça (A), não (B).** Com triagem manual e fila em planilha, o SDR
trabalha numa superfície só e o CRM não acrescenta nada ao go-live — acrescenta
risco (o lead em ENTRADA cai no radar de disparo/followup e no concierge IA,
exatamente o que a decisão de 24/07 evitou). (B) volta a fazer sentido quando o
agendamento for automatizado e precisar de `lead_id` (Fase 8, opção A).

**Critério de verificação:**
- `grep -n "appendLeadToPerpetuoSheet\|appendLeadToTourosTabs" src/app/api/femeas/` → **vazio**.
- `git diff --stat` sobre `src/lib/jmp-sheets.ts` mostra **apenas adições**;
  nenhuma linha existente alterada (INV-8).
- POST de teste na rota de fêmeas cria linha em `LEADS FEMEAS` e **nenhuma** em
  `LEADS BULA - PERPETUO`, `LEADS TOUROS`, `LEADS DOUGLAS`, `LEADS JOAO ANTONIO`.
- Segundo POST com o mesmo `event_id` → `{ skipped: true, reason: 'duplicate' }`,
  sem linha nova.
- Rodar o cron `sheet-perpetuo` depois do POST de teste e conferir que a aba
  `LEADS TOUROS` **não ganhou** o lead de fêmeas.
- A coluna `'Interesse'` da linha lê `femeas-po`, não `touros-po`.
- A aba tem as cinco colunas de fila do SDR, **todas vazias** após um POST — o
  código nunca escreve nelas.
- Nenhuma coluna de divisão por assessor na entrada: o roteamento por UF do
  funil de touros **não** foi replicado (§2.1).

**Dependências:** Fase 1 (T1.4 — decisão do destino).

---

## Fase 3 — Rota, tokens, cache e esqueleto

**Objetivo:** existir `/femeas` renderizando um esqueleto, com `_lib`/`_components`
no lugar e assets servidos com cache correto.

### Estratégia de fork — explícita, para não virar cópia-cega

| Arquivo do `/touros` | Ação | Motivo |
|---|---|---|
| `_lib/tokens.ts` | **copiar sem alterar** | Design system da Bula; a marca é a mesma |
| `_lib/useSafeReducedMotion.ts` | **copiar sem alterar** | Utilitário puro |
| `_lib/utm.ts` | copiar, **trocar `STORAGE_KEY` para `'femeas_utm'`** (linha 29) | Correção direta de R-1 |
| `_components/ui.tsx` | **copiar sem alterar** | Primitivos |
| `_components/GoogleTagManager.tsx` | copiar sem alterar (mesmo container) | Decisão T1.3 |
| `_lib/analytics.ts` | copiar **do `/saogeraldo`**, não do `/touros`; renomear para `femeas_*` | INV-2 / R-2 |
| `_components/Formulario.tsx` | copiar e **reestruturar** | Fase 6 — aqui a lógica MUDA (atrito) |
| `_components/Obrigado.tsx` | copiar e **reestruturar** | Fase 8 — função nova (agendamento) |
| `_lib/copy.ts` | **reescrever do zero** | Fase 4 |
| `_components/Hero.tsx`, `SubHero.tsx`, `Ensaio.tsx`, `ProvaSocial.tsx`, `Fecho.tsx`, `Footer.tsx`, `StickyCta.tsx` | reescrever adaptando | Fase 7 |
| `_components/WhatsappRedirect.tsx` | **não copiar por padrão** | Ver Fase 8: o pós-cadastro do fêmeas é agendamento, não grupo |

### Tarefas

- **T3.1** — Criar `src/app/femeas/page.tsx` (Server Component) empilhando stubs
  na ordem final: `<Hero/> <ParaQuem/> <Categorias/> <Jornada/> <ProvaSocial/>
  <Fecho/> <Footer/> <StickyCta/>`.
  Criar `src/app/femeas/layout.tsx` espelhando `src/app/touros/layout.tsx`: Inter
  com `interFeatures`, `<GoogleTagManager/>`, `metadata` + `viewport`,
  `metadataBase: new URL('https://femeas.bulaassessoria.com')`.
- **T3.2** — Copiar os utilitários conforme a tabela. **`STORAGE_KEY = 'femeas_utm'`.**
- **T3.3** — Criar `public/femeas/` com `README.md` listando os assets esperados
  (`hero-mobile.webp`, `hero-desktop.webp`, `og-femeas.jpg` 1200×630, fotos de
  categoria). **OG em JPG, não WEBP** — o WhatsApp não renderiza WEBP de forma
  confiável no preview (`src/app/saogeraldo/README.md:27`).
- **T3.4** — ~~Adicionar `femeas` ao grupo `:dir` da regra de cache~~ →
  **regra PRÓPRIA em `next.config.mjs`.** ✅ Feito no commit `3d8c894`.

  **Desvio deliberado em relação ao que este plano pedia, e o desvio está certo.**
  A instrução original era somar `femeas` ao grupo
  `:dir(touros|criatorios|institucional)`. Isso **editaria uma regex que serve a
  rota de touros**, que está em produção convertendo — colide com **INV-8**. O
  precedente já existia no repositório: o São Geraldo ganhou bloco próprio pelo
  mesmo motivo, com a justificativa escrita em `next.config.mjs`
  (*"Regra PRÓPRIA, e não um item a mais na regra do /touros acima: aquela rota
  está em produção convertendo e não se mexe"*).

  Perfil idêntico (`max-age=86400, stale-while-revalidate=604800`); o que muda é
  a superfície de risco. **Custo: 12 linhas duplicadas. Benefício: zero chance de
  quebrar o cache do `/touros` por um erro de regex.** Registrado aqui porque o
  plano estava errado, não o executor.
- **T3.5** — Confirmar que a landing é chrome-free (nenhum header/nav global do
  app vaza), igual ao `/touros` e ao `/saogeraldo`.

**Critério de verificação:**
- `npm run dev` → `http://localhost:3000/femeas` retorna **200**, renderiza os 8
  stubs, sem navbar do app e sem erro no console.
- `grep -rn "touros\|sg7p" src/app/femeas/_lib/ src/app/femeas/_components/ui.tsx` → **vazio**.
- `grep -n "femeas_utm" src/app/femeas/_lib/utm.ts` → **encontra**.
- `grep -n "dataLayer" src/app/femeas/_lib/analytics.ts` → **vazio** (INV-2).
- `curl -sI http://localhost:3000/femeas/og-femeas.jpg | grep -i cache-control` →
  `public, max-age=86400, stale-while-revalidate=604800`.
- `npx tsc --noEmit` limpo.

**Dependências:** Fase 1 (domínio para o `metadataBase`; o DNS não bloqueia o build).

---

## Fase 4 — Copy: o sonho, o filtro e as categorias

**Objetivo:** centralizar em `src/app/femeas/_lib/` **tudo** que o cliente pode
querer mudar — copy comercial e dados de produto. **INV-5.**

Esta é a fase de maior dependência humana do plano: **João Antônio apoia na
redação e tira dúvidas de domínio** (ele é criador). Fechar **antes de 13/08**
(ver T1.5).

### T4.1 — `_lib/copy.ts` — hero e narrativa do sonho

Ângulo central, das palavras da reunião: **"crie sua própria marca de Nelore PO"**
/ **"seu próprio criatório"**. Não é "compre fêmea" — é *comece a produzir os
seus próprios touros para vender a outros*.

Estrutura espelhando `src/app/touros/_lib/copy.ts` (`hero`, `subHero`, `form`,
`obrigado`), com os blocos novos deste funil.

⚠️ **Regra herdada:** todo claim numérico novo entra marcado `[VALIDAR]` até o
cliente confirmar. O `/touros` tem precedente vivo — `hero.proof` em
`src/app/touros/_lib/copy.ts:32–33` está `[VALIDAR]` desde 24/07 e foi ao ar
assim. Repetir o padrão **e** cobrar a validação na Fase 10.

### T4.2 — `_lib/copy.ts` — "para quem é" / "para quem não é"

Alavanca de qualificação nº 2, acordada na reunião. Duas listas explícitas, na
página, **antes** do formulário.

O conteúdo tem que sair dos **problemas reais da última rodada**, não de
generalidade:

```
paraQuem = [
  'Quem quer começar (ou expandir) um criatório de Nelore PO',
  'Quem quer produzir os próprios touros — para usar e para vender',
  'Quem tem inscrição estadual e estrutura para receber animal PO',
  ...
]
paraQuemNao = [
  'Quem procura fêmea de gado COMERCIAL — a Bula não trabalha essa ponta aqui',
  'Quem quer comprar 50, 70 cabeças de uma vez — não é o formato deste projeto',
  ...
]
```

⚠️ **Os dois exemplos acima são os dois casos que a campanha anterior atraiu.**
Estão no plano como fatos da reunião, mas a redação final é do João Antônio —
**é ele quem sabe dizer "não" sem ofender criador**, e uma seção de exclusão mal
escrita queima a marca com o público que a Bula quer. Marcar `[COPY — J.A.]`.

### T4.3 — `_lib/categorias.ts` — as seis categorias de plantel

**Dado, não desenho.** Uma entrada por categoria, consumida pela seção da página
(Fase 7) **e** pelo select do formulário (Fase 6) — **fonte única**.

```
export const CATEGORIAS = [
  { id: 'embrioes',   label: 'Embriões',                    ... },
  { id: 'bezerras',   label: 'Bezerras',                    ... },
  { id: 'novilhas',   label: 'Novilhas',                    ... },
  { id: 'prenhes',    label: 'Prenhes',                     ... },
  { id: 'pacote-3em1',label: 'Pacote 3-em-1 (parida + prenha)', ... },
  { id: 'doadoras',   label: 'Doadoras',                    ... },
] as const
```

⚠️ **Regra de duplicação, herdada de `src/app/saogeraldo/README.md:73–75`:** as
listas de opção do formulário existem em **dois** lugares — client e servidor
(`route.ts`) — e precisam concordar. **Uma terceira cópia é como o lead começa a
ser recusado sem ninguém entender por quê.** Solução aqui: o servidor importa o
`id` de `_lib/categorias.ts` e monta o `Set` de validação a partir dele; a lista
literal existe **uma vez só**.

### T4.4 — `_lib/copy.ts` — assessoria 360 e facilidades comerciais

Argumentos que o cliente pediu explicitamente:
- assessoria gratuita de técnicos especializados;
- acompanhamento técnico;
- **"assessoria 360"**: apoio no financeiro, no acasalamento e no resto;
- **parcelamento em 30× no boleto**;
- **frete grátis**.

⚠️ **"Frete grátis" precisa de escopo antes de ir ao ar.** O catálogo do São
Geraldo tem **faixa sob consulta e região sem entrega** — `src/app/saogeraldo/_lib/frete.ts`
existe justamente porque a divisão UF→faixa foi lida do PDF pixel a pixel e
**confirmada pelo cliente em 28/07** (SC e RS caíram em "não é possível a
entrega", contra a intuição). E a `ANALISE-VERBA-SAOGERALDO-2026-07-31.md` §9
manda, textualmente: *"Não escreva 'frete grátis' em lugar nenhum"* sem essa
divisão. **Pendência C-09.** Default seguro: renderizar "frete incluso —
condições por região, o assessor confirma na reunião" até a divisão chegar.
Nunca prometer UF específica sem dado.

Mesma regra para **30× no boleto**: transcrever a condição literal (quem
financia, entrada, carência), não parafrasear. `_lib/evento.ts:64–69` do São
Geraldo é o modelo de como isso fica versionado.

**Critério de verificação:**
- `grep -rn "criatório\|30x\|frete\|embri" src/app/femeas/_components/ -i` → **vazio** (INV-5).
- `grep -rn "PENDENTE\|VALIDAR" src/app/femeas/` lista ocorrências **apenas** em `_lib/`.
- Os 6 `id` de `CATEGORIAS` aparecem **uma única vez** no repositório como
  literal; o servidor os importa (`grep -rn "'bezerras'" src/` → 1 resultado).
- Revisão do João Antônio registrada por escrito (data + o que mudou), com foco
  na seção "para quem não é".
- Nenhum claim numérico sem `[VALIDAR]` ou sem confirmação registrada.

**Dependências:** Fase 3. **Bloqueia** Fases 6 e 7. **Janela da equipe: fechar antes de 13/08.**

---

## Fase 5 — API de lead, validação e a régua de qualificação de fêmeas

**Objetivo:** o lead de fêmeas entra com atribuição própria, **toda** a validação
é revalidada no servidor, e o veredito de qualificação — que decide a URL de
obrigado e o valor da conversão — é do servidor (INV-3).

**Decisão de arquitetura:** **rota nova** `src/app/api/femeas/lead/route.ts`,
forkada de `src/app/api/touros/lead/route.ts`. Parametrizar a rota existente
seria menos código e **violaria INV-8** (mexeria numa rota em produção). Uma
cópia de ~200 linhas isola telemetria, validação e destino.

### T5.1 — Forkar o route handler

**Preservar sem alterar** (é infraestrutura paga com bug em produção):
- normalização de telefone antes de validar (`aplicarMascaraTelefone` +
  `normalizarWhatsapp`, `route.ts:56–62`) — quem cola o próprio número manda
  `5531988887777`;
- e-mail **opcional** (`:50–53`) — o funil é WhatsApp; exigir e-mail é atrito que
  **não qualifica**;
- consentimento de WhatsApp obrigatório (`:79–81`);
- revalidação server-side de **todos** os selects contra `Set` (`:82–92`);
- retorno `ok({ id, is_mql })` — é o veredito que a landing usa para escolher a
  URL de obrigado, e é a navegação hard para lá que dispara a conversão.

**Alterar:** `source`/rótulo → `'femeas-perpetuo'`; `interesse` → `'femeas-po'`;
`host` default → domínio de fêmeas; prefixo de log → `[femeas lead]`; append →
`appendLeadToFemeasTab` (Fase 2); campos novos de atrito (T5.2); régua (T5.3).

⚠️ **Não importar `dispatchCrmWelcome` nem nenhum disparo de WhatsApp.** Mesma
regra do `/touros` e do `/saogeraldo`.

### T5.2 — Validar os campos de atrito no servidor

**CPF:** reusar `cpfValido()` de `src/lib/habilitacao-form.ts:52` — valida
dígito verificador, não só comprimento. (`src/lib/crm-habilitacao-sync.ts:148`
usa a versão fraca, só `length === 11`; **não seguir essa**.)

**Inscrição estadual:** hoje o `/touros` pergunta `'Sim'/'Não'` e confia. Com CPF
+ UF em mãos, existe caminho para **verificar de verdade**:
`consultarInscricaoEstadualPorCpf({ cpf, uf })` em
`src/lib/state-registration-provider.ts:261` (Infosimples → FiscalAPI →
Direct Data, nessa precedência).

⚠️ **É consulta paga e tem latência.** Não pode rodar de forma bloqueante no
caminho do submit — o lead ficaria esperando um provedor externo. **Default:
não chamar no submit.** Registrar CPF + UF e deixar a consulta para o
pré-diagnóstico (Fase 11), onde `crm-habilitacao-sync.ts` já faz isso em lote e
com cache. Gate: `isFiscalApiConfigured()` (`:366`) — sem env, no-op silencioso.

### T5.3 — Os DOIS portões. Não confundir, sob pena de otimizar mídia pelo alvo errado

Com o pré-diagnóstico decidido como **manual** (C-03), o servidor **não triagem
ninguém**. Existem dois vereditos, com donos e funções diferentes:

| | `is_mql` (servidor) | `Aprovado` (SDR) |
|---|---|---|
| Quem decide | régua determinística, no submit | **gente**, no pré-diagnóstico |
| Quando | instantâneo | horas depois |
| Para que serve | escolher a URL de obrigado e o **valor da conversão** enviado ao Meta | **decidir se vira reunião** |
| É o portão do funil? | **não** | **sim** |
| Onde vive | `route.ts` → `ok({ id, is_mql })` | coluna `'Aprovado'` na aba `LEADS FEMEAS` |

⚠️ **O servidor continua precisando de um veredito mesmo com triagem manual** —
não para filtrar, mas porque **INV-3** exige que a URL de obrigado e o valor da
conversão saiam do servidor, e é esse valor que ensina o algoritmo de mídia. Sem
`is_mql`, o Meta otimiza por volume de formulário, que é exatamente o erro que a
campanha anterior cometeu.

⚠️ **E os dois precisam ser comparados**, senão a mídia aprende o alvo errado: se
`is_mql` não prevê `Aprovado`, o algoritmo está sendo treinado por um sinal que
não corresponde ao portão real. **Essa comparação é a T11.3**, e é o motivo de a
coluna `'Motivo da recusa'` existir na Fase 2.

### T5.3.1 — A régua do servidor. **Não copiar a de touros.**

`DEFAULT_JMP_MQL_RULE` é `{ min_cabecas: 100, require_ie: true }`
(`src/lib/crm-types.ts:136`). Ela foi desenhada para **comprador de touro**: quem
tem ≥100 vacas comerciais precisa de touro.

**Para fêmeas essa régua provavelmente está ativamente errada.** O cliente-alvo
declarado é *quem está começando um criatório próprio* — pode ter rebanho
pequeno e ser exatamente o comprador certo. A régua de touros **reprovaria** o
perfil que a página existe para atrair.

E há precedente documentado: a `ANALISE-VERBA-SAOGERALDO-2026-07-31.md` §9 já
mostrou que a régua ≥100+IE **subestima o inventário atendível em ~35%** — 11 de
18 leads fora da régua caíram só por não ter IE — e §10 item 15 recomenda
**"separar a régua de assessoria da régua de compra"**.

**Ação:** criar `src/app/femeas/_lib/qualificacao.ts` com uma régua própria,
explícita e testável, composta dos sinais que o formulário coleta:

```
- já cria PO? (sim = sinal forte)
- categoria de interesse (doadora/embrião = projeto sério; bezerra = entrada)
- quantidade desejada (faixa coerente; 50–70 cabeças = sinal de INVIÁVEL, não de bom)
- tem IE?
- tem CPF válido?
- rebanho atual (contexto, não corte)
```

⚠️ **Pendência C-04 — mas ela ficou MENOS urgente com a triagem manual.** Como
`is_mql` não decide quem é atendido (o SDR decide), errar a régua custa
**eficiência de mídia**, não lead perdido. O plano entrega a **estrutura** (função
pura, testável, com os pesos numa constante única) e um **default declarado**:
`is_mql = cpfValido && temIE && quantidadeDentroDaFaixaViavel`. **Não usar
`min_cabecas: 100`.** A calibração vem do dado real na T11.3.

⚠️ **Não implementar recusa automática.** Nenhum lead pode ser descartado pelo
servidor: `is_mql: false` escolhe outra página de obrigado e outro valor de
conversão — **o lead entra na fila do SDR do mesmo jeito**. Descarte automático
contradiz C-03 e esconde do SDR justamente os casos que ensinam o formulário.

⚠️ **Nomenclatura:** manter o campo de retorno como `is_mql` para não quebrar o
contrato que o formulário e o GTM já esperam — mas documentar no topo do arquivo
que **aqui "MQL" significa "aprovado pela régua de fêmeas"**, e não a régua
canônica do `crm-types`. Renomear o campo é mudança de contrato com o container
do GTM, e não vale o risco no go-live.

**Critério de verificação:**
- `curl -X POST localhost:3000/api/femeas/lead` com payload mínimo válido → **200** `{ id, is_mql }`.
- Sem `whatsappConsent` → **400**.
- CPF com dígito verificador inválido → **400** (não só `length`).
- Categoria fora de `CATEGORIAS` → **400** (validação por `Set` derivado de `_lib/categorias.ts`).
- Quantidade na faixa "inviável" → `is_mql: false` **e a linha aparece na aba
  `LEADS FEMEAS` normalmente** (sem descarte automático — C-03).
- Dois POSTs, um `is_mql: true` e outro `false`, geram **duas linhas** na fila do
  SDR; a diferença aparece só na URL de obrigado e no valor da conversão.
- `grep -rn "DEFAULT_JMP_MQL_RULE" src/app/api/femeas/` → **vazio** (régua própria, INV-3 + C-04).
- `grep -rn "dispatchCrmWelcome\|whatsapp/send\|baileys" src/app/api/femeas/` → **vazio**.
- `grep -rn "consultarInscricaoEstadual" src/app/api/femeas/lead/route.ts` → **vazio** (não é caminho de submit).

**Dependências:** Fase 2 (destino do lead), Fase 4 (`categorias.ts`).

---

## Fase 6 — Formulário de alto atrito — CRÍTICA

**Objetivo:** o formulário que sinaliza *"aqui não é brincadeira"*, filtra o
público errado **e** pré-executa parte do pré-diagnóstico (Fase 0, T0.3).

**Base:** `src/app/touros/_components/Formulario.tsx` — 3 passos
(`TOTAL = 3`, `STEP_LABELS`, `STEP_FIELDS` nas linhas 72–80), validação por
passo, foco no primeiro erro, `aria-invalid`/`aria-describedby`,
`inputStyle` com `fontSize: 16` e `minHeight: 50` (`:546–555`), autocomplete de
cidade via IBGE por UF (`:120–135`).

### A tensão central, dita abertamente

Atrito **filtra** e atrito **derruba conversão** — as duas coisas, sempre. A
`ANALISE-VERBA-SAOGERALDO-2026-07-31.md` §10 item 9 já registra como hipótese
aberta que **"o formulário de 7 campos em 3 passos"** é possivelmente a maior
alavanca de conversão fora de mídia — na direção de **reduzir** campos. Este
plano vai na direção oposta, de propósito, porque o problema deste funil é o
inverso (excesso de lead ruim, não escassez de lead).

**Consequência de método: o atrito precisa ser medido, não assumido.** O
formulário nasce instrumentado por passo (T6.4) para que a decisão de manter ou
tirar campo seja tomada com dado, não com opinião.

> **E há uma segunda consequência, que veio das decisões de 05/08:** com a
> triagem **manual** (C-03), a régua automática sai de cena e o formulário é a
> **única alavanca de escala** do funil. Com **3 SDRs**, o alvo dele é concreto e
> modesto: **levar `t_aprov` de 12,9% para ~22%** — 1,7x —, que é o break-even do
> cenário (a) da Fase 0. Se C-14 resolver para o cenário (b) (3 pessoas
> acumulando), o alvo dobra para ~43% e o formulário vira o **único** caminho.
> Em qualquer dos dois, ele deixou de ser filtro de qualidade e virou
> **infraestrutura de capacidade** — é o que justifica ir contra a recomendação
> do `ANALISE` §10 item 9 de reduzir campos.

### T6.1 — Reestruturar em 4 passos, ordenados por custo psicológico crescente

| Passo | Campos | Racional |
|---|---|---|
| 1 · Seu projeto | já cria PO? · objetivo (montar criatório / expandir / produzir touro para vender) · categoria de interesse | **Qualifica antes de pedir dado pessoal.** Quem não se reconhece aqui sai antes de virar lead — e sai de graça |
| 2 · Sua fazenda | UF · cidade (IBGE) · rebanho atual · momento na pecuária | Contexto; baixo atrito |
| 3 · Seus dados | nome · WhatsApp · e-mail (opcional) · consentimento | Contato |
| 4 · Formalização | **CPF** · **inscrição estadual** · quantidade desejada | **O atrito de sinalização.** Vem por último de propósito: quem chegou aqui já investiu 3 passos |

⚠️ **Isto inverte a ordem do `/touros`**, onde contato sobe para o 1º passo
(comentário explícito em `Formulario.tsx:73–74`: *"captura o dado de lead o
quanto antes"*). A inversão é **deliberada e é o ponto da página**: o `/touros`
quer capturar cedo; o `/femeas` quer **descartar** cedo. O `ANALISE` §10 item 9
manda testar isso, e a Fase 11 testa.

### T6.2 — Campos de atrito e sua validação

- **CPF** — máscara + `cpfValido` (dígito verificador) do lado do client, mesma
  função do servidor (`src/lib/habilitacao-form.ts:52`). Microcopy explicando
  **para que serve**: *"o CPF é o que permite a Bula habilitar sua compra e
  parcelar em 30×"*. Atrito sem justificativa é abandono; atrito justificado é
  sinal.
- **Inscrição estadual** — manter o padrão de dois botões do `/touros`
  (`Formulario.tsx:408–431`), não `select`.
- **Quantidade desejada** — faixas por categoria. **A faixa "50 a 70 cabeças" tem
  que existir como opção** para o lead se autodeclarar; o servidor a trata como
  sinal de inviável (Fase 5, T5.3). Filtrar tirando a opção esconde o dado.

⚠️ **Quais campos exatos de atrito são aceitáveis sem matar a conversão é
PENDÊNCIA C-01, e não tem resposta certa a priori.** O plano entrega os campos
acima como default (são os que a reunião nomeou: "CPF, inscrição estadual e
afins") e a instrumentação para medir o custo de cada um. **Não adicionar
faturamento, área em hectares ou renda sem decisão explícita** — são os campos
com maior taxa de abandono em formulário de lead e não estão na lista da reunião.

### T6.3 — Preservar integralmente do análogo

Máscara de telefone; validação por passo; `focusFirstError`; `AnimatePresence`
com fallback de `prefers-reduced-motion` (`:264–266`); geração de `event_id`
(`crypto.randomUUID` com fallback, `:194–197`); envio dos UTMs;
**`window.location.assign`** para a URL de obrigado (**INV-1** — não trocar por
`router.push` "para ficar mais suave": quebra a conversão do GTM sem erro
visível); estado de erro que **não perde os dados** do lead.

### T6.4 — Instrumentar o funil do formulário por passo

Eventos `femeas_form_started`, `femeas_step_attempt`, `femeas_step_reached`,
`femeas_validation_failed` (com `fields`), `femeas_submit_attempt` — espelhando
`Formulario.tsx:140,163,165,171,185`, com o prefixo trocado.

**Isto não é enfeite: é o instrumento que decide C-01.** Sem `step_reached` por
passo e `validation_failed` por campo, não há como saber se o CPF derrubou 5% ou
40% dos leads.

**Critério de verificação:**
- Em 390px: 4 passos, coluna única, sem scroll horizontal, sem zoom ao focar
  input (medir `font-size: 16px` no DevTools).
- Preencher e enviar → linha em `LEADS FEMEAS` com **todos** os campos, e
  navegação com **load completo** (aba Network: documento novo, não SPA) — INV-1.
- CPF inválido bloqueia com mensagem visível e `role="alert"`.
- Erro de rede → estado de erro com retry, **dados preservados no formulário**.
- `grep -n "location.assign" src/app/femeas/_components/Formulario.tsx` → **encontra**.
- `grep -n "useRouter\|router.push" src/app/femeas/_components/Formulario.tsx` → **vazio**.
- PostHog recebe os 5 eventos de passo, com prefixo `femeas_`.
- Navegação por teclado completa, com anel de foco visível (herdar o bloco
  `:focus-visible` — ver commit `6ba4085`, que adicionou isso ao São Geraldo por
  WCAG 2.4.7 AA).

**Dependências:** Fase 4 (`categorias.ts` + microcopy), Fase 5 (endpoint).

---

## Fase 7 — Seções da página

**Objetivo:** a página que vende o sonho e filtra na leitura. Mobile-first.

Ordem de leitura definida na Fase 3 (T3.1). Racional de cada bloco:

- **T7.1 · `Hero.tsx`** — fork estrutural do `src/app/touros/_components/Hero.tsx`
  (o layout já é o certo: logo → eyebrow → título → **formulário na 1ª dobra**,
  `#cadastro` mora dentro do card — ver `src/app/touros/page.tsx:9–13`).
  Manchete = o sonho ("sua própria marca de Nelore PO"), não o produto.
  Imagem `priority`, `sizes="100vw"`, sem CLS.

- **T7.2 · `ParaQuem.tsx`** — as duas listas de T4.2, lado a lado no desktop,
  empilhadas no mobile. **Posição: logo após o hero, antes das categorias.**
  Filtrar cedo é o ponto; enterrar essa seção no fim da página anula a alavanca.
  ⚠️ Tratamento visual: a coluna "não é" **não pode** parecer punitiva. Mesmo
  peso tipográfico das duas, sem vermelho, sem ícone de proibido. É
  direcionamento, não rejeição.

- **T7.3 · `Categorias.tsx`** — as 6 categorias de `_lib/categorias.ts`. Cards
  com foto, nome e uma linha de "para que serve no seu projeto".
  ⚠️ **Não inventar preço nem disponibilidade.** Se `preco`/`estoque` forem
  `null`, o campo é **omitido da UI**, nunca renderizado como "sob consulta" ou
  "a definir" — regra herdada de `.planning/leilao-sao-geraldo/PLAN.md` T3.1.
  Pendência **C-08**.

- **T7.4 · `Jornada.tsx`** — a jornada desenhada na reunião, explícita na página:
  `lead → pré-diagnóstico → aprovação do cadastro → agendamento → reunião
  (fazenda, projeto, orçamento) → direcionamento para a categoria certa`.
  Aqui entra a **assessoria 360** (financeiro, acasalamento, acompanhamento
  técnico). Esta seção faz o trabalho que a `Conscientizacao` fazia no `/touros`:
  planta a expectativa do que acontece depois. **Sem ela, o lead não sabe que vai
  para uma reunião e o no-show sobe.**

- **T7.5 · `ProvaSocial.tsx`** — fork do `/touros`. Marquee de logos de
  `/criatorios/*.png` com os `scale`/`detail` **já calibrados — não recalibrar**
  (o ajuste de massa visual dos PNGs é sensível e já foi pago), incluindo o
  fallback de `prefers-reduced-motion` que vira grade centralizada.
  ⚠️ **A prova social do `/touros` é de touro** (`+1.000 touros PO apartados`,
  `copy.ts:33`, ainda `[VALIDAR]`). Para fêmeas ela é **fraca ou irrelevante** —
  o comprador quer ver criatório formado, não touro apartado. Prova social de
  fêmeas é pendência **C-07**; até chegar, usar formulação qualitativa sem número.

- **T7.6 · `Fecho.tsx` + `StickyCta.tsx` + `Footer.tsx`** — forks diretos. O
  Fecho é o último convite com CTA que devolve ao card do hero (**não** duplica o
  formulário — INV-7). Sticky só no mobile, some quando `#cadastro` entra na tela.

**Critério de verificação:**
- Em 390px: nenhum overflow horizontal; nenhum texto de corpo abaixo de 15px.
- "Para quem é / não é" aparece **antes** das categorias na ordem do DOM.
- Categoria sem preço/estoque renderiza **sem lacuna visual** (nada de "—" ou "a definir").
- `grep -rn "R\$\|embri\|doadora" src/app/femeas/_components/ -i` → **vazio** (INV-5).
- Marquee vira grade estática com `prefers-reduced-motion: reduce`, sem corte visual.
- Contraste AA medido em todas as superfícies. Atenção ao `light.gold` — no São
  Geraldo ele mede **2,44:1 sobre fundo claro e reprova em qualquer tamanho**
  (`src/app/saogeraldo/README.md:94–96`); rótulo pequeno dourado sobre claro usa
  `light.goldText`.
- Um leitor externo, no celular, consegue dizer em 30s: (a) o que é vendido,
  (b) se ele se encaixa, (c) o que acontece depois de se cadastrar.

**Dependências:** Fase 4 (copy). Roda em paralelo com a Fase 6.

---

## Fase 8 — Obrigado e agendamento da reunião — CRÍTICA

**Objetivo:** entregar o KPI real. Aqui a página deixa de ser fork.

**A decisão travada:** pós-cadastro **não** se passa o número do assessor —
**agenda-se uma reunião de verdade.**

### T8.1 — Criar as duas páginas de obrigado

`src/app/obrigado-femeas-mql/page.tsx` e `src/app/obrigado-femeas-lead/page.tsx`,
espelhando `src/app/obrigado-touros-mql/page.tsx`: `<GoogleTagManager/>` +
componente de conteúdo, `metadata.robots: { index: false, follow: false }`.
URLs separadas habilitam metas de conversão por URL — é assim que o Meta e o
Google medem os dois níveis.

### T8.2 — **Não** copiar o `WhatsappRedirect`

`src/app/touros/_components/WhatsappRedirect.tsx` redireciona ao grupo de
WhatsApp em 8s, com `GROUP_URL` hardcoded na linha 9.

⚠️ **Copiar isso quebra o funil de fêmeas de duas formas:** (a) tira o lead da
página antes do agendamento; (b) o redirect automático em 8s roda **depois** do
Page View do GTM, mas não deixa tempo de nada acontecer na tela. Grupo de
WhatsApp é ativo valioso (`ANALISE` §10 item 14), mas aqui ele é **item
secundário**, nunca o destino automático. Pendência **C-12**.

### T8.3 — O caminho de agendamento: **opção (B), confirmada. C-02 fechada.**

**Quem opera o agendamento é o SDR**, o mesmo que faz o pré-diagnóstico (§2.1).
Isso confirma a opção **(B)** — que já era o default recomendado — e a torna
decisão, não sugestão. A ordem `aprovação → agendamento` da reunião fica
preservada por construção: **é a mesma pessoa fazendo as duas coisas, em
sequência.**

**Implementação:** a página de obrigado **não agenda**. Ela diz o que vai
acontecer e em quanto tempo. O SDR, depois do pré-diagnóstico, marca a reunião e
registra via `POST /api/agendamentos` (`source: 'manual'`,
`src/app/api/agendamentos/route.ts:70`), com:
- `tags: ['femeas-perpetuo']` — é o único carimbo de funil disponível
  (`agendamentos.source` só aceita `calendly|google|manual`,
  `supabase/migrations/0008_agenda_agendamentos.sql:115`, e não há coluna de
  funil);
- `responsible_member_id` = o assessor escolhido entre os **3** (C-13);
- `invitee_phone` — sem `lead_id` (decisão C-11), o telefone é o que amarra a
  reunião ao lead da planilha.

⚠️ **`POST /api/agendamentos` exige `requireAdmin()`** (`route.ts:71`) — e agora
são **3 pessoas**, não uma. Confirmar que os três SDRs têm esse nível de acesso,
**ou** que registram pela tela existente da agenda. Se nenhum dos dois for
verdade, o registro do KPI depende de repasse e o loop de T8.5 quebra em
silêncio. **Continua sendo bloqueio, e triplicou de superfície:** dar admin a
três pessoas é decisão de segurança, não de conveniência — vale checar se a tela
da agenda resolve sem elevar privilégio.

**As duas opções descartadas, e por quê (registrado para não voltarem):**

| Opção | Por que não |
|---|---|
| **(A) Embed de Calendly no obrigado** | O `calendly_event_url` default aponta para **uma** pessoa (`src/lib/agendamentos-sync.ts:28`), e são 3 assessores. Além disso o Calendly Free **não tem API nem webhook** (`agendamentos-sync.ts:4–6`): a sincronia é polling do Google Calendar, com latência. Vira item da Fase 11, quando existir uma agenda por assessor |
| **(C) Agendar direto no obrigado, sem pré-diagnóstico** | Contradiz a jornada e enche a agenda dos 3 assessores de lead desqualificado — **é exatamente o problema que a página existe para resolver** |

**A tabela original, mantida para referência da decisão:**

| Opção | Como | Prós | Contras |
|---|---|---|---|
| **(A) Embed de Calendly na página de obrigado** | Já existe link configurado: `src/lib/agendamentos-sync.ts:28` → `https://calendly.com/joaoeduardo-lp1/contato-cliente`. O evento cai no Google Calendar; `agendamentos-sync.ts` materializa em `agendamentos` (`source='calendly'`) | Zero backend novo. A ponte já existe e roda | **Agenda de UMA pessoa.** São 3 assessores. E o Calendly Free **não tem API nem webhook** (`agendamentos-sync.ts:4–6`) — a sincronia é por polling do Google Calendar |
| **(B) Agendamento manual pós-aprovação** | A página de obrigado diz "vamos analisar e chamar para marcar"; a equipe agenda via `POST /api/agendamentos` (`source='manual'`, `src/app/api/agendamentos/route.ts:70`) | Preserva o pré-diagnóstico **antes** do agendamento — que é a jornada acordada | Depende de operação humana; latência mata conversão |
| **(C) Agendar direto no obrigado, sem pré-diagnóstico** | Calendly aberto para todo mundo | Máxima conversão | **Contradiz a jornada da reunião** e enche a agenda dos 3 assessores de lead desqualificado. É exatamente o problema que a página existe para resolver |

⚠️ **A latência continua sendo o risco assumido da opção (B)** — "depende de
operação humana" —, mas **com 3 SDRs ela deixa de ser gargalo estrutural e vira
risco de cadência**. A mitigação não é técnica: é a coluna `'1º toque em'`
(Fase 2, T2.2) e o sinal "lead sem 1º toque em >24h em >20% dos casos" (T0.4).
Cadência é tratada na reunião como o fator decisivo de conversão, e três pessoas
não garantem cadência sozinhas — só tornam-na possível.

### T8.4 — Copy do obrigado por variante

⚠️ **Cuidado que a decisão do SDR introduz:** com triagem manual, **nenhuma** das
duas páginas pode prometer reunião como certa — quem decide isso é o SDR, depois,
e a página não sabe. A diferença entre as variantes é de **prioridade e tom**,
não de promessa.

- **`-mql`**: confirma, explica que **um especialista vai entrar em contato para
  entender o projeto e, se fizer sentido, marcar uma conversa**, e dá **prazo
  concreto** de contato — não "em breve".
- **`-lead`**: confirma e explica o contato, **sem** linguagem de prioridade.

**As duas descrevem a reunião** (fazenda, projeto, orçamento), porque é isso que
reduz no-show depois. O que muda é a expectativa de fila.

⚠️ **A diferença de copy entre as duas é o que evita no-show e o que evita
frustração.** No `/touros` a diferença entre as variantes é uma linha
(`src/app/touros/_lib/copy.ts:83–96`) porque lá as duas levam ao mesmo lugar.
Aqui elas levam a lugares diferentes.

### T8.5 — Fechar o loop de medição do KPI

O KPI é **reunião realizada**, e ele acontece **fora da página**. Com C-02
fechada, o dono está definido: **o SDR** preenche `'1º toque em'`, `'Aprovado'`,
`'Motivo da recusa'`, `'Reunião agendada'` e `'Assessor da reunião'` na aba
`LEADS FEMEAS` (Fase 2, T2.2).

Registrar em `INFRA.md`: **os nomes dos 3 SDRs**, a frequência de atualização e
como a fila é dividida entre eles. **Sem isso o funil não tem numerador** e a
Fase 0 vira ficção.

⚠️ **Cobertura em folga deixou de ser item crítico.** Com uma pessoa, ausência
parava o funil; com três, é redistribuição. Fica como nota operacional — **o que
continua valendo é a divisão da fila**: sem regra de quem pega qual lead, três
pessoas na mesma aba produzem lead tocado duas vezes e lead tocado nenhuma. Um
critério simples (por ordem de chegada, ou por faixa de UF) resolve, e precisa
estar escrito antes do primeiro dia de tráfego.

**Critério de verificação:**
- `/obrigado-femeas-mql` e `/obrigado-femeas-lead` retornam 200 e trazem o GTM no HTML.
- As duas têm `robots: noindex`.
- `grep -rn "WhatsappRedirect\|chat.whatsapp.com" src/app/femeas/ src/app/obrigado-femeas-*/` →
  **vazio**, salvo decisão explícita de C-12 registrada em `INFRA.md`.
- Caminho aprovado leva a `-mql`; caminho não aprovado leva a `-lead` (dois POSTs de teste).
- A copy do `-mql` contém prazo concreto de contato; a do `-lead` **não** promete reunião.
- Um agendamento de teste aparece em `agendamentos` com `tags` contendo
  `'femeas-perpetuo'` e `responsible_member_id` preenchido.
- O SDR consegue, com o acesso que tem hoje, registrar um agendamento de teste —
  **verificado por ele, não presumido** (`requireAdmin` em `route.ts:71`).
- Nenhuma das duas páginas de obrigado promete reunião como certa.
- `INFRA.md` nomeia a pessoa responsável por atualizar as duas colunas de KPI.

**Dependências:** Fase 4 (copy), Fase 5 (veredito). **Desbloqueada** — C-02
fechada em 05/08: o SDR opera, opção (B) confirmada.

---

## Fase 9 — Instrumentação e separação nos dados

**Objetivo:** a conversão chega ao Meta com a arquitetura que já funciona, e os
dois perpétuos são **distinguíveis em todos os destinos**. É a correção estrutural
de R-1.

### T9.1 — `_lib/analytics.ts` a partir do São Geraldo

Copiar `src/app/saogeraldo/_lib/analytics.ts` (não o do `/touros` — ver R-2).
Renomear **todos** os eventos para `femeas_*`, incluindo os dois que o fork
anterior esqueceu (`touros_view` → `femeas_view`, `touros_lead_submitted` →
`femeas_lead_submitted`).

**PRESERVAR (INV-2):** o módulo **não** empurra nada ao `dataLayer`. Manter o
comentário de topo do original — ele é a documentação viva da decisão.
PostHog continua no-op sem `NEXT_PUBLIC_POSTHOG_KEY`.
`trackLeadConversion` mantém `value` diferenciado (aprovado / não aprovado) e o
`event_id` para dedup futuro com CAPI.

### T9.2 — Estender os gatilhos no GTM

No container `GTM-K8RXFDDT`: gatilhos de Page View casando
`/obrigado-femeas-mql` e `/obrigado-femeas-lead`, com a tag de conversão do Meta
disparando neles. **Sem isso a conversão do fêmeas não existe.** Registrar em
`INFRA.md` o nome exato de tag e gatilho criados.

⚠️ Há uma dívida conhecida e registrada: `ANALISE` §10 item 7 diz que **todo MQL
do leilão contava como conversão do perpétuo**, envenenando a campanha perpétua,
e §10 item 17 registra o bug do `gtm.dom` virando evento. **Verificar que as
regras de conversão do perpétuo de touros excluem `femeas`** antes de subir
tráfego — senão o fêmeas envenena o touros exatamente como o São Geraldo
envenenou.

### T9.3 — Verificação anti-regressão (bloqueia merge)

```bash
# INV-1 — navegação hard
grep -n "location.assign" src/app/femeas/_components/Formulario.tsx      # deve achar
grep -rn "useRouter\|router.push" src/app/femeas/_components/Formulario.tsx  # vazio

# INV-2 — analytics não toca o dataLayer
grep -rn "dataLayer" src/app/femeas/_lib/analytics.ts                    # vazio

# INV-4 — namespace próprio (a falha R-1)
grep -rn "touros\|sg7p" src/app/femeas/_lib/ | grep -v '^#'              # vazio
grep -n "femeas_utm" src/app/femeas/_lib/utm.ts                          # deve achar
grep -rn "posthog?.capture('femeas_" src/app/femeas/_lib/analytics.ts    # deve achar
grep -rn "capture('touros_" src/app/femeas/                              # vazio

# INV-8 — nenhuma rota em produção tocada
git diff --name-only main | grep -E "src/app/(touros|saogeraldo)/|src/app/api/(touros|saogeraldo)/"  # vazio
```

Qualquer um falhando = **bloquear o deploy**.

### T9.4 — Validar ponta a ponta com GTM Preview

Abrir a landing com Preview conectado → preencher → submeter → verificar que **na
URL de obrigado** o Page View disparou e a tag do Meta rodou. Confirmar com o
Meta Pixel Helper. **Rodar duas vezes: aprovado e não aprovado.**

### T9.5 — Conferir UTM ponta a ponta

Abrir com `?utm_source=meta&utm_medium=cpc&utm_campaign=femeas&ad-id=123&fbclid=abc`,
submeter, e confirmar: (a) as colunas de UTM chegaram na aba `LEADS FEMEAS`;
(b) a chave em `sessionStorage` é **`femeas_utm`**; (c) abrir `/touros` na mesma
sessão **não** sobrescreve nem é sobrescrito.

⚠️ **O item (c) é o teste que ninguém rodou no fork do São Geraldo**, e é por
isso que R-1 passou despercebido.

**Critério de verificação:**
- Os comandos de T9.3 passam, todos.
- GTM Preview mostra a conversão nos dois caminhos.
- Meta Pixel Helper mostra **um** evento `Lead` por cadastro — não dois.
- PostHog: os eventos de `/femeas` e de `/touros` aparecem com nomes distintos,
  em relatórios separáveis.
- Sem `NEXT_PUBLIC_POSTHOG_KEY`: página carrega e converte, console limpo.

**Dependências:** Fases 5, 6, 8.

---

## Fase 10 — QA, acessibilidade, performance e go-live

**Objetivo:** validar ponta a ponta e liberar tráfego.

- **T10.1 · Funcional.** Cadastro real cria linha correta em `LEADS FEMEAS`;
  veredito avaliado no servidor; UTMs gravados; consentimento bloqueando; erro de
  rede mostra estado de erro sem perder o lead; CPF inválido bloqueia.
- **T10.2 · Invariantes.** Os 8 reconferidos um a um, com os comandos de T9.3
  mais: INV-6 (DevTools: inputs 16px, alvos ≥44px), INV-7 (**um só `#cadastro`
  na página renderizada**:
  `curl -s http://localhost:3000/femeas | grep -c 'id="cadastro"'` = 1).
  ⚠️ Medir no **HTML renderizado**, não na árvore de código:
  `src/app/saogeraldo/` tem `id="cadastro"` em dois arquivos (`Hero.tsx:269` e
  `Captura.tsx:29`), mas o `Hero` não é importado por `page.tsx` — um `grep` no
  diretório de componentes daria falso positivo; um `grep` no DOM não dá.
- **T10.3 · Acessibilidade.** Contraste AA em todas as superfícies; labels
  associadas via `htmlFor`; erros com `role="alert"` e `aria-describedby`;
  navegação por teclado completa com **anel de foco visível** (WCAG 2.4.7 AA —
  ver commit `6ba4085`); `prefers-reduced-motion` sem animação em marquee e
  reveals.
- **T10.4 · Mobile e performance.** Teste em celular real, não só DevTools.
  Lighthouse mobile: **Performance ≥ 90, LCP < 2,5s, CLS < 0,1**. Todas as
  imagens com `sizes`; hero `priority`; resto `lazy`.
- **T10.5 · Conteúdo.** Nenhum `[PENDENTE]`/`[VALIDAR]` visível na página
  renderizada. Nenhum claim numérico não validado no ar. **A copy de "para quem
  não é" revisada e aprovada pelo João Antônio, por escrito.** As condições de
  30× e frete conferidas literalmente contra o que o cliente enviou.
- **T10.6 · SEO/OG.** `title`/`description` próprios; OG 1200×630 **em JPG**;
  `robots: index` na landing, `noindex` nos dois obrigados.
- **T10.7 · Domínio.** O subdomínio abre a landing (não 404, não a home do app)
  com SSL válido.
- **T10.8 · Escopo e não-regressão.**
  `grep -rn "dispatchCrmWelcome\|baileys\|whatsapp/send" src/app/femeas/ src/app/api/femeas/` → vazio.
  `git diff` não toca `src/app/touros/`, `src/app/saogeraldo/` nem suas APIs (INV-8).
  `src/lib/jmp-sheets.ts`: só adições.
- **T10.9 · Build.** `npm run build` limpo.
- **T10.10 · Separação de campanha.** Antes de subir tráfego, conferir no
  Gerenciador que as regras de conversão do **perpétuo de touros** excluem o
  fêmeas (T9.2). Não repetir o envenenamento do §10 item 7 do `ANALISE`.
- **T10.11 · Operação pronta.** O responsável pelo pré-diagnóstico sabe onde
  olhar (aba `LEADS FEMEAS`), o que preencher (`Aprovado`, `Reunião agendada`) e
  em quanto tempo — **a cadência de atendimento é tratada como o fator decisivo
  de conversão** ("atende o lead rápido, na hora que ele chega, os caras
  convertem"). Sem esse combinado, subir tráfego é comprar backlog.
- **T10.12 · Aprovação do cliente** para subir tráfego, por escrito.

**Critério de verificação:** checklist 100% ✔; build verde; um lead de teste
percorrendo formulário → planilha → obrigado → conversão no Meta; domínio com SSL.

**Dependências:** Fase 9.

---

## Fase 11 — Ciclo de melhoria contínua (o que o perpétuo permite)

**Objetivo:** o perpétuo não tem data de morte — diferente do São Geraldo, cada
semana de tráfego é dado que melhora a próxima. Esta fase é **operação recorrente**,
não entrega única.

### T11.1 — Cadência de leitura semanal

Toda semana, um número por elo da cadeia da Fase 0. O documento vivo é
`.planning/femeas-perpetuo/MODELO-FUNIL.md`, com uma linha por semana:

```
semana | leads | t_aprov | agendamentos | t_show | reuniões | CPL | custo/reunião
```

**Regra:** quando uma taxa medida substituir uma assumida, trocar o rótulo
`[ASSUMIDO]` por `[MEDIDO]` e **recalcular a conta inversa inteira**. O modelo
não é decoração.

### T11.2 — Decidir C-01 com dado, não com opinião

Após ~200 leads, ler `femeas_step_reached` e `femeas_validation_failed` por
campo (Fase 6, T6.4), cruzando com `'Aprovado'` e `'Motivo da recusa'` da fila do
SDR. **A pergunta é quantitativa, e agora tem as duas pontas:** quanto o campo
custou em conversão (`t_lp`) e quanto comprou em `t_aprov`.

**A régua de decisão vem da Fase 0:** um campo que derruba `t_lp` em 10% mas
sobe `t_aprov` de 12,9% para 20% **paga-se com folga** — a carga diária do SDR
cai de 33,7 para 22,6. Um campo que derruba `t_lp` e não move `t_aprov` sai.
Sem a coluna `'Motivo da recusa'`, essa conta não existe.

### T11.3 — Confrontar os dois portões: `is_mql` × `Aprovado`

**A tarefa mais importante desta fase.** O servidor manda `is_mql` ao Meta como
sinal de valor; o SDR decide `Aprovado`. Se os dois não concordarem, **o
algoritmo está sendo treinado por um alvo que não é o portão real** — e mídia
otimizada pelo alvo errado é o erro mais caro do funil.

Matriz de confusão, mensal:

```
                 Aprovado=sim   Aprovado=não
is_mql=true          A               B     ← B alto = mídia comprando lead que o SDR recusa
is_mql=false         C               D     ← C alto = mídia subvalorizando lead bom
```

`B` e `C` altos → recalibrar a régua de T5.3.1 (C-04). Os pesos vivem numa
constante única justamente para isso. É o mesmo caminho que
`src/lib/lead-score.ts:53–54` documenta para o termômetro: *"priors de projeto…
com ~8 semanas de dados dá pra ajustar por regressão logística"*.

### T11.4 — Ligar o termômetro do lead ao pré-diagnóstico

`computeLeadScore()` (`src/lib/lead-score.ts:65`) devolve prontidão **e o
gargalo** — a dimensão mais baixa — com uma instrução curta de destrave.

⚠️ **Com a triagem manual (C-03), isto NÃO é automação de triagem — é
priorização de fila.** O SDR continua decidindo; o score só diz **por quem
começar** quando a fila tem 30 nomes e o dia tem 7 toques. É a diferença entre
ajudar a pessoa e substituí-la, e a decisão do cliente foi explícita.
Depende de C-11 (lead no CRM) para ter os sinais de entrada.

### T11.5 — Backlog técnico herdado

| Item | Origem | Por quê |
|---|---|---|
| Auditar se o `/touros` duplica conversão via `dataLayer` | R-2 deste plano | Rota em produção; risco próprio, escopo próprio |
| Corrigir `STORAGE_KEY`/eventos do `/saogeraldo` | R-1 deste plano | Dívida corrente que polui o perpétuo |
| Meta CAPI server-side | `.planning/touros-perpetuo/PLAN.md` §Adiado | `event_id` já é gerado e está pronto para dedup |
| Rede de segurança por cron para `LEADS FEMEAS` | Fase 2, T2.3 | Hoje o append é bloqueante, sem auto-cura |
| Lookalike 1% da base de aprovados | `ANALISE` §10 item 5 | Única forma de o algoritmo enxergar a régua, que vive no servidor e não chega ao pixel. Precisa de **dias** de acúmulo |

**Critério de verificação:** existe uma linha nova em `MODELO-FUNIL.md` por
semana desde o go-live, e pelo menos uma taxa mudou de `[ASSUMIDO]` para
`[MEDIDO]` no primeiro mês.

**Dependências:** Fase 10 (tráfego rodando).

---

## Pendências — fechadas e abertas

### ✅ Fechadas em 05/08 (4 de 13)

| # | Pendência | Resolução | Onde entrou no plano |
|---|---|---|---|
| **C-02** | Quem opera o agendamento | **O SDR** — e é o mesmo que faz o pré-diagnóstico. Confirma a opção (B): agendamento manual pós-aprovação via `POST /api/agendamentos` | §2.1 · Fase 8 T8.3, T8.5 |
| **C-03** | Pré-diagnóstico manual ou automatizado | **Manual.** Nada de automatizar triagem nesta versão: o formulário coleta e organiza, **quem decide é gente** | §2.1 · Fase 0 T0.3 · Fase 5 T5.3 · Fase 6 |
| **C-05** | Unidade e fonte do benchmark "R$250 por cadastro" | **Etapa CADASTRO OK.** Apuração 25/07–01/08, duas campanhas: R$ 3.398,27 → 116 formulários (R$ 29,30) · 109 contatos (R$ 31,18) · **15 cadastros (R$ 226,55)** | Fase 0 T0.1, T0.2 |
| **C-13** | Quantos assessores e como dividir | **São 3.** O `tourosTabDaUF()` (2 assessores) está desatualizado — mas descreve o funil de **touros**; o de fêmeas roteia para a **fila do SDR** | §2.1 · Fase 2 T2.1 · Fase 8 T8.3 |

⚠️ **A correção de 05/08 (são 3 SDRs, não um) removeu o pedido de recurso que
esta seção trazia.** Com 3 SDRs, a meta de 40 reuniões/mês **fecha** — desde que
`t_aprov` cruze **~22%** (cenário a) ou **~43%** (cenário b). O que sobrou no
lugar é a pendência **C-14** abaixo e um limiar mensurável nas primeiras 200
submissões. Ver Fase 0, T0.3 e T0.3.1.

### ⏳ Abertas (10)

Nenhuma delas bloqueia o caminho crítico. **Nenhuma foi inventada por este plano.**

| # | Pendência | Fase | Bloqueia? | Default proposto |
|---|---|---|---|---|
| **C-01** | **Quais campos exatos de atrito são aceitáveis sem matar a conversão** | 6 | não | CPF + IE + quantidade (os nomeados na reunião). **Nada de faturamento/hectares/renda.** Medir e decidir na Fase 11. **Subiu de importância:** com triagem manual, é a única alavanca de escala |
| **C-04** | **Régua do servidor** — `≥100 cabeças + IE` reprovaria o público-alvo | 5 | não | `cpfValido && temIE && quantidadeViável`, **sem `min_cabecas`**. **Baixou de urgência:** com triagem manual, errar custa eficiência de mídia, não lead perdido |
| **C-06** | **Verba mensal disponível** para o funil de fêmeas | 0 | não | Nenhum. A Fase 0 entrega a verba **necessária** por cenário (R$ 7,4k a R$ 44k/mês, conforme `t_aprov` e base de custo) |
| **C-07** | **Prova social de fêmeas** (a do `/touros` é de touro apartado) | 7 | não | Formulação qualitativa sem número até chegar material |
| **C-08** | **Preço/faixa de preço e disponibilidade por categoria** | 7 | não | Campo `null` → omitido da UI. Nunca "sob consulta" na tela |
| **C-09** | **Condições exatas de 30× no boleto e de frete grátis** (restrição geográfica!) | 4 | não | Transcrição literal do que o cliente enviar. **Sem divisão UF→faixa, não escrever "frete grátis"** |
| **C-10** | **Domínio/subdomínio** da landing | 1, 3 | não (mas lead time longo) | `femeas.bulaassessoria.com` |
| **C-11** | **Lead de fêmeas entra no `crm_leads`?** | 2, 8 | não | **Não** no go-live. O SDR reforça isso: fila em planilha, superfície única |
| **C-12** | **Grupo de WhatsApp na página de obrigado?** | 8 | não | **Não** — o destino do fêmeas é a reunião, não o grupo |
| **C-14** | **3 SDRs + 3 assessores (6 pessoas) ou as mesmas 3 acumulando os dois papéis?** | 0, 8 | não (mas muda o limiar) | **(a) 6 pessoas** — é o que a leitura literal das duas falas do cliente sugere. Muda o break-even de `t_aprov` de **~22%** para **~43%**, e a 35% o cenário (b) **não fecha**. Ver Fase 0 T0.3 |

---

## 🟢 Por onde começar — fases desbloqueadas

Com C-02, C-03, C-05 e C-13 fechadas, este é o estado de cada fase **hoje**.

| Fase | Estado | O que ainda falta |
|---|---|---|
| **0** — modelo do funil | ✅ **FEITA** — `MODELO-FUNIL.md` escrito | Falta só **mandar C-14 ao cliente** (6 pessoas ou 3 acumulando). O documento entrega os dois cenários com seus limiares (~22% e ~43%); escolher entre eles é decisão de quem monta o time |
| **1** — decisões/infra | 🟢 **pode rodar** | T1.2 (criar domínio) espera C-10, mas T1.1 (auditar Vercel) e T1.3 (GTM) rodam já |
| **2** — separação nos dados | ✅ **FEITA** — commit `7642809` | Feita **de outro jeito**: a aba `FEMEAS` que já existia virou a fila do SDR, com 9 colunas próprias. Não existe aba `LEADS FEMEAS`. Ver `EXECUCAO.md`, desvios 1 e 2 |
| **3** — rota/tokens/cache | ✅ **FEITA** — commit `3d8c894` | Rota, tokens, `ui.tsx`, GTM, `analytics.ts`, `utm.ts` (com `femeas_utm`), layout, stubs, `public/femeas/README.md` e a regra de cache. **Desvio registrado em T3.4** (regra própria em vez do grupo `:dir`) |
| **4** — copy e categorias | 🔵 **EM ANDAMENTO** — não mexer | `_lib/copy.ts` e `_lib/categorias.ts` estão sendo escritos agora, 1ª versão para o João Antônio corrigir. O **texto final** espera C-07/C-08/C-09 e a revisão dele (janela: **antes de 13/08**) |
| **5** — API + régua | ✅ **FEITA** — commit `7642809` | `src/app/api/femeas/lead/route.ts` + `_lib/qualificacao.ts` (régua própria, sem `min_cabecas`). C-04 ficou com o default do plano. Ver `EXECUCAO.md`, desvios 4 e 5 |
| **6** — formulário | ✅ **FEITA** — commit `d092d62` | 4 passos, campos de atrito e os 5 eventos por passo. C-01 segue aberta — o formulário nasce com o default e **medindo** |
| **7** — seções | 🟡 **liberada, depende só de conteúdo** | Tratamento visual. C-07 (prova social de fêmeas) e C-08 (preço) seguem abertas |
| **8** — obrigado + agendamento | ✅ **T8.1/T8.4 FEITAS** — `d092d62` · ⏳ **T8.3 aberta** | As duas páginas existem, sem WhatsApp e sem dizer "aprovado". **T8.3 (o caminho de agendamento) é o KPI e continua aberta.** ✅ O acesso do SDR foi checado: `requireAdmin()` só exige sessão — não é problema de permissão (ver `EXECUCAO.md`) |
| **9–11** | 🔴 | Dependem das anteriores |

### Confirmação pedida: Fases 2 e 3 podem rodar em paralelo?

**Sim, e não há ordem obrigatória entre elas.** Tocam arquivos disjuntos:

```
Fase 2 → src/lib/jmp-sheets.ts          (apenas ADIÇÕES — INV-8)
Fase 3 → src/app/femeas/**, next.config.mjs
```

Nenhuma importa código da outra. Rodar as duas juntas é o melhor uso da janela
antes de 13/08.

### As três ordens que NÃO devem ser invertidas

| Ordem | Por quê |
|---|---|
| **T2.2 (cabeçalho da aba) antes da Fase 5** | A rota escreve nas colunas. Definir o cabeçalho depois significa reescrever `buildFemeasRow` e, pior, alterar uma aba que o SDR já estiver usando |
| **Fase 4 (`categorias.ts`) antes da Fase 6** | O formulário **importa** as categorias. Se ele inventar a própria lista, recria o bug da "terceira cópia" documentado em `src/app/saogeraldo/README.md:73–75` — *"é como o lead começa a ser recusado sem ninguém entender por quê"* |
| **Fase 5 antes da Fase 6** | O formulário precisa do endpoint e do contrato de resposta (`{ id, is_mql }`) para escolher a URL de obrigado. Construir o form contra um endpoint imaginário é como INV-1 se perde |

⚠️ **Uma armadilha de execução, já que a Fase 2 vai primeiro:** `ensureTourosLayout`
só **acrescenta** coluna no fim de uma aba existente. Se a aba `LEADS FEMEAS` for
criada com um cabeçalho e depois o cabeçalho mudar, as colunas novas entram **no
fim**, fora de ordem, e a aba fica ilegível para quem trabalha nela. **Fechar
T2.2 antes de criar a aba de verdade**, não depois.

---

## Fora de escopo (declarado)

- **Qualquer alteração em `src/app/touros/`, `src/app/saogeraldo/` ou suas APIs.**
  As duas rotas estão em produção convertendo (INV-8).
- **Qualquer disparo/automação de WhatsApp** (`dispatchCrmWelcome`, Baileys,
  Cloud API, concierge). Mesma regra dos dois análogos.
- **Mudança de schema do CRM.** A tabela `agendamentos` já existe e é suficiente.
- **Meta Conversions API server-side.** `event_id` já é gerado e está pronto;
  implementação fica para a Fase 11.
- **A/B testing.** Sem volume no go-live. Fase 11.
- **Corrigir as regressões R-1/R-2 nos análogos.** Diagnosticadas e registradas
  aqui, mas consertá-las é escopo próprio, com risco próprio.
- **Dashboard de conversão.** Os eventos vão para PostHog/Meta/GA4; construir
  painel é outro trabalho.

---

## ✂️ Corte mínimo de go-live

Se o prazo apertar (janela 14–18/08 da equipe), **entrega-se isto e nada menos**:

**Obrigatório:**
- Fase 0 (a conta inversa — sem ela não se sabe quanto tráfego comprar)
- Fase 1 (domínio + GTM)
- Fase 2 (separação de dados — **é o pedido explícito do cliente**)
- Fase 3, Fase 4 (copy + categorias)
- Fase 5 (API + régua própria)
- Fase 6 (formulário)
- Fase 8 T8.1 + T8.4 (obrigado com a copy certa)
- Fase 9 (tracking validado no Preview)
- Fase 10 itens T10.1, T10.2, T10.7, T10.9, T10.10, T10.11

**Cortável, nesta ordem:**
1. **T7.5** prova social → fica sem a faixa de logos
2. **T7.3** grade de categorias → vira lista de texto (as categorias continuam
   no formulário, que é onde elas qualificam)
3. **T8.3** caminho de agendamento automatizado → fica o manual (opção B)
4. **T7.6** sticky CTA
5. **T11.x** inteira → começa depois

**Nunca cortável:** o formulário, o veredito no servidor, a navegação hard, a
aba `LEADS FEMEAS` separada, os gatilhos de conversão no GTM e a seção "para
quem é / para quem não é". Sem a última, a página é a campanha anterior de novo
— *"a fêmea chama muito, vai cair muita gente"*.

---

## O que eu NÃO consegui verificar

Registro explícito, para ninguém tratar suposição como fato:

1. **~~O benchmark de custo~~ — RESOLVIDO em 05/08 (C-05).** A apuração
   25/07–01/08 fechou os números (Fase 0, T0.1). Fica registrado o que **eu** não
   verifiquei: **não abri `~/Downloads/cruzamento-ads-crm-25jul-01ago-2026.html`**
   — os números vieram do coordenador. Eles são internamente consistentes
   (R$ 3.398,27 ÷ 15 = R$ 226,55 ✓; ÷ 116 = R$ 29,30 ✓; ÷ 2.941 = R$ 1,16 ✓) e a
   ponte com `outputs/` fecha (R$ 1.984,68 − R$ 1.192,58 = R$ 792,10 nos dias 25
   e 26 ✓), mas **conferi a aritmética, não a fonte**.
2. **Não abri o painel da Vercel, o container do GTM nem o Gerenciador de
   Anúncios.** Tudo sobre domínio, gatilhos e regras de conversão vem de
   comentários de código e de documentos de planejamento anteriores. As Fases 1 e
   9 tratam isso como descoberta, não como fato.
3. **Não abri a planilha do Google.** A estrutura das abas vem de
   `src/lib/jmp-sheets.ts`. Se a equipe criou colunas ou abas manualmente, o
   código não sabe — e `ensureTourosLayout` só acrescenta no fim.
4. **Não sei se o `/touros` está duplicando conversão hoje** por causa do
   `dataLayer` (R-2). Sei que os dois análogos discordam e que o README do São
   Geraldo trata o push como perigoso. Verificar isso exige o GTM Preview em
   produção — Fase 11.
5. **Não há nenhum dado histórico de funil de fêmeas neste repositório.**
   `t_show`, `t_agenda`, `t_aprov` e `t_lp` do fêmeas seguem **[ASSUMIDO]**. A
   campanha anterior de fêmeas que o cliente mencionou (a do criativo "crie seu
   criatório") **não tem apuração versionada aqui** — se existir em algum lugar,
   é o dado mais valioso disponível e deve substituir os cenários da Fase 0.
6. **Não sei se `femeas.bulaassessoria.com` está disponível** nem qual nome o
   cliente prefere (C-10).
7. **Não vi material de criativo, foto ou vídeo de fêmeas.** `public/` tem
   galeria de touros e logos de criatórios; não auditei se há foto de matriz
   utilizável. A Fase 7 assume que Marcelo produz — e ele está em gravação em
   14–15/08.
8. **Não existe medição de throughput de um SDR dedicado.** Os 7 toques/dia da
   Fase 0 são do **time inteiro**, durante um lançamento
   (`ANALISE-VERBA-SAOGERALDO-2026-07-31.md` §7) — não são o teto de uma pessoa
   dedicada, que provavelmente é maior. Com 3 SDRs isso deixou de ser bloqueio,
   mas continua sendo a premissa que define o limiar de `t_aprov`: se o ritmo
   real for 5/dia em vez de 7, o break-even do cenário (a) sobe de 22% para ~30%.
   Medir na primeira semana e substituir.
9. **Ninguém mediu quanto custa uma reunião consultiva em "toques".** A
   conversão de 1 reunião = 5 toque-equivalentes, usada no cenário (b) de C-14,
   é **[ASSUMIDO] e sustenta a conclusão inteira daquele cenário**: a 3
   toque-equivalentes o break-even é 31%, a 8 é impossível. Se C-14 resolver
   para (b), este número precisa ser medido antes de qualquer promessa de meta.
10. **Não verifiquei se os 3 SDRs têm permissão de admin.**
   `POST /api/agendamentos` exige `requireAdmin()`
   (`src/app/api/agendamentos/route.ts:71`). Se não tiverem, o registro do KPI
   depende de repasse e o loop de T8.5 quebra em silêncio. **Checável hoje** — e
   dar admin a três pessoas é decisão de segurança, não de conveniência.
