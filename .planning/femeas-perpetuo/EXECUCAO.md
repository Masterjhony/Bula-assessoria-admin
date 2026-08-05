# Registro de execução — landing do perpétuo de fêmeas

Este arquivo é o **diário do que foi construído e do que mudou em relação ao
`PLAN.md`**. O plano é a intenção; isto é o que aconteceu quando ela encontrou
o código. Cada desvio abaixo tem o motivo, e o motivo importa mais que o desvio:
quem for continuar precisa saber se pode voltar atrás.

Última atualização: **05/08/2026**.

---

## Estado por fase

| Fase | Estado | Commit |
|---|---|---|
| 0 — modelo do funil | ✅ **feita** — `MODELO-FUNIL.md` | (documento, sem código) |
| 1 — decisões/infra | ⏳ aberta (C-10 domínio) | — |
| 2 — separação nos dados | ✅ **feita**, com desvio | `7642809` |
| 3 — rota/tokens/esqueleto | ✅ feita | `3d8c894` |
| 4 — copy e categorias | ✅ 1ª versão revisada pelo João Antônio | `ecb9af7`, `c0e77d0` |
| 5 — API + régua | ✅ **feita** | `7642809` |
| 6 — formulário | ✅ **feita** | `d092d62` |
| 7 — seções (visual) | ⏳ não começada | — |
| 8 — obrigado | ✅ T8.1/T8.4 feitas · ⏳ **T8.3 (agendamento) aberta** | `d092d62` |
| 9 — instrumentação/GTM | ⏳ depende de 6 | — |
| 10 — QA e go-live | ⏳ | — |
| 11 — melhoria contínua | ⏳ | — |

---

## Desvio 1 — a aba `LEADS FEMEAS` não existe, e não deve existir

**O plano dizia:** criar a aba `LEADS FEMEAS` e uma função
`appendLeadToFemeasTab` espelhando `appendLeadToSaoGeraldoTab`, porque
`appendLeadToPerpetuoSheet` marcaria o lead com o `form_name` de touros e o cron
`syncTourosLandingTabs` o distribuiria para as abas dos assessores de touros.

**O que o código diz hoje:** aquilo mudou em **31/07**, e o plano foi escrito
contra uma leitura desatualizada de `src/lib/jmp-sheets.ts` (as âncoras de linha
do plano não batem mais com o arquivo). A arquitetura atual é:

```
lead → LEADS GERAIS (registro, append bloqueante)
     → aba do INTERESSE dele: TOUROS | FEMEAS | EMBRIÕES | OUTROS
     → cron syncAbasPorInteresse() como rede de segurança
```

`appendLeadToSaoGeraldoTab` e `syncTourosLandingTabs` **não existem mais**;
`LEADS_BULA_PERPETUO_TAB` hoje é um alias de `LEADS GERAIS`. Já existe uma aba
**FEMEAS**, alimentada pelos leads de fêmeas do formulário do Meta.

**O que foi feito:** a aba **FEMEAS que já existe** virou a fila do SDR. Criar
`LEADS FEMEAS` ao lado dela daria ao SDR **duas superfícies para a mesma fila**,
com o cron alimentando só uma — exatamente o tipo de divergência silenciosa que
o plano queria evitar.

**Consequência boa, não planejada:** a pendência T2.3 (o trade-off "sem rede de
segurança, uma falha do Sheets perde o lead") **desapareceu**. Como o lead entra
na LEADS GERAIS de forma bloqueante e o cron redistribui, a rede existe sem
cron novo.

**Consequência ruim, registrada:** se o append na aba FEMEAS falhar, o cron
recupera a linha **sem as colunas próprias** (documento, categoria, projeto,
régua) — porque ele lê da LEADS GERAIS, que não tem essas colunas. O lead não se
perde; o **contexto de triagem**, sim. Por isso a falha é logada alto. Fechar
esse buraco de vez exigiria as colunas na base também, o que mexe numa aba em
produção — não vale no go-live.

**Critério de verificação do plano que ficou obsoleto:** o plano manda conferir
`grep appendLeadToPerpetuoSheet src/app/api/femeas/` → vazio. Hoje essa função é
o caminho comum de **todas** as landings (o nome é legado), então o grep
**encontra** e está certo. O critério correto é o que vale agora:

- `src/app/api/femeas/` não chama `appendLeadToInteresseTab` (usa a função
  própria, que garante as colunas do SDR);
- nenhuma linha aparece nas abas TOUROS/EMBRIÕES/OUTROS;
- `git diff --numstat src/lib/jmp-sheets.ts` → **138 inserções, 0 remoções**
  (INV-8 preservado: só adições, nenhuma função existente editada).

---

## Desvio 2 — o cabeçalho da aba (T2.2) foi encurtado

**O plano listava** 27 colunas, incluindo `'Já cria PO?'` e `'Objetivo'`.

**O que foi feito:** o bloco comum das abas (21 colunas) mais 9 próprias:

```
CPF/CNPJ · Categoria de interesse · Projeto · Régua automática ·
1º toque em · Aprovado · Motivo da recusa · Reunião agendada · Assessor da reunião
```

`'Já cria PO?'` e `'Objetivo'` **saíram porque a coluna `Momento` já os carrega**
na copy que o João Antônio revisou em 05/08: as quatro opções são "Já crio PO e
quero ampliar", "Tenho gado comercial e quero começar no PO", "Estou montando a
fazenda agora", "Ainda estou estudando". Duas colunas para a mesma informação
convidam a operação a preencher uma e ignorar a outra.

**Uma coluna que o plano não previu:** `'Régua automática'` (o `is_mql` do
servidor, `Sim`/`Não`). Ela fica **ao lado** da `'Aprovado'` de propósito: a
comparação entre as duas (T11.3) é o que revela se a mídia está sendo treinada
pelo sinal certo, e sem a coluna essa comparação exigiria cruzar PostHog com
planilha na mão.

⚠️ **As colunas entram no FIM da aba** (`ensureTourosLayout`/`ensureFemeasLayout`
só acrescentam, nunca reordenam). A aba FEMEAS já tem leads do Meta, então as 9
colunas novas aparecem depois de `Observações`. Se a equipe quiser outra ordem,
**quem move é gente, na planilha** — o código respeita a ordem que encontrar.

---

## Desvio 3 — o vocabulário dos selects veio do formulário do Meta

**O plano não decidia** as faixas de rebanho e de quantidade.

**O que foi feito:** `form.rebanhos` e `form.quantidades` em `_lib/copy.ts` usam
**exatamente** as faixas do formulário do Meta (`META_CABECAS`/`META_QTD` em
`jmp-sheets.ts`): `1 a 50 / 51 a 100 / 101 a 300 / 301 a 500 / mais de 500
cabeças` e `1 a 5 / 6 a 10 / 11 a 20 / 21 a 50 / mais de 50 matrizes / ainda não
sei`.

**Por quê:** os rótulos são gravados nas colunas `Cabeças` e `Qtd. desejada`, que
a equipe lê há meses com o vocabulário do Meta. Um terceiro vocabulário na mesma
coluna quebra qualquer relatório por faixa. As faixas do Meta também começam
baixo (`1 a 50`, e há `nenhuma`), que é o certo para um público que está
começando — as do `/touros` começam em `1 a 99` e sobem a `mais de 3000`.

A faixa `'mais de 50 matrizes'` **existe de propósito** e não deve ser removida
"para filtrar melhor": é a faixa que a rodada anterior trouxe em massa (50 a 70
cabeças a preço de comercial). Tirar a opção não tira a pessoa — só esconde da
equipe que ela chegou. A régua a trata como **sinal**, não como recusa.

---

## Desvio 4 — o documento aceita CNPJ, e o dígito verificador é conferido

A copy revisada pergunta **"CPF ou CNPJ"**. Produtor com fazenda em pessoa
jurídica é o comprador típico, não a exceção — recusar CNPJ derrubaria lead bom
por formalidade.

O repositório só tinha `cpfValido` (`src/lib/habilitacao-form.ts:52`). Foi
escrito `cnpjValido` em `_lib/qualificacao.ts`, e `documentoValido` decide pelo
comprimento. **As mesmas funções rodam no client e no servidor** — duas cópias da
mesma régua divergem, e quando divergem o lead passa no browser e é recusado no
servidor sem mensagem que explique.

⚠️ O plano mandava usar `cpfValido` e alertava para **não** seguir a versão fraca
de `crm-habilitacao-sync.ts:148` (só `length === 11`). Isso foi respeitado.

**Não** foi chamada `consultarInscricaoEstadualPorCpf` no submit (T5.2): é
consulta paga, com latência, e o lead ficaria esperando um provedor externo.
Fica para o pré-diagnóstico, em lote (Fase 11).

---

## Desvio 5 — o campo "projeto" é obrigatório (decisão a medir, não um dado)

`projeto` (texto livre, mín. 10 caracteres) é **obrigatório**. A copy já o
descreve como *"o campo que mais pesa na análise"*, e com a triagem manual ele é
o insumo nº 1 do SDR: vazio, ele liga no escuro.

⚠️ **É também o campo de maior risco de abandono de toda a lista.** Isto é uma
decisão tomada na direção da tese da página (atrito é o produto), **não um fato
medido**. Está instrumentado (`femeas_validation_failed` traz o campo) e é o
primeiro candidato a virar opcional se a Fase 11 mostrar que ele derruba o funil.
**Pendência C-01.**

---

## Verificação fechada — o SDR **não** precisa de permissão especial

O plano registrava como não verificado (item 10) se os 3 SDRs teriam acesso ao
`POST /api/agendamentos`, que exige `requireAdmin()`, e alertava que "dar admin a
três pessoas é decisão de segurança".

**A decisão não existe: não há papéis.** `src/lib/auth-helpers.ts:24` diz, no
próprio comentário, que *"no web-bula NÃO existe coluna `profiles.role`… qualquer
usuário autenticado é admin"*. `requireAdmin()` só confere se há sessão. Não há
`middleware.ts` no projeto restringindo a rota.

**O que isso significa na prática:** basta o SDR ter **login no sistema** para
registrar o agendamento — o loop de medição do KPI (T8.5) não depende de
concessão de privilégio.

**O que isso significa de risco, e que não é desta feature resolver:** qualquer
pessoa com login vê e escreve em tudo (agendamentos, CRM, financeiro — este
último tem whitelist própria por e-mail, `FINANCE_ADMIN_EMAILS`). Se os SDRs
forem contratados novos, eles entram com o mesmo alcance da diretoria. Vale
levantar com o cliente **antes** de criar os três logins; não é bloqueio do
go-live da landing.

---

## Fases 6 e 8 — o que foi medido, e o que ficou por medir

O formulário e as duas páginas de obrigado foram verificados **em navegador
real** (Playwright, 390×844), não por leitura de código: um `<form>` só na página
(INV-7), sem overflow horizontal, `font-size: 16px` nos quatro controles (é o
mecanismo do zoom do iOS, não estética), alvos de 50–56px, "Continuar" vazio
produzindo 4 `role="alert"` e levando o foco ao primeiro inválido, IBGE
devolvendo 247 cidades para GO, CPF de dígito repetido barrado com a mesma
mensagem da rota.

**INV-1 foi medido, não presumido:** um marcador em `window` não sobrevive à
navegação nas duas variantes — prova de load completo, não SPA. Sem isso o
gatilho Page View do GTM não roda e a conversão some **sem erro visível**.

**Quatro coisas continuam sem verificação, e três delas bloqueiam mídia:**

| O que | Por que não foi verificado | Bloqueia? |
|---|---|---|
| **Nenhum lead real caiu na aba FEMEAS** | O `fetch` foi stubado para não sujar a planilha de produção. Contrato conferido por leitura, payload por interceptação (bate campo a campo) — mas **ninguém viu uma linha cair** | **sim** |
| PostHog não recebeu nada | Sem `NEXT_PUBLIC_POSTHOG_KEY` o `analytics.ts` é no-op por desenho. As 5 chamadas existem com o prefixo certo; ingestão, não | **sim** — sem os eventos por passo, C-01 não tem como ser decidida |
| Tag de conversão do Meta na URL de obrigado | É configuração de container (GTM Preview). O mecanismo foi verificado; a tag, não | **sim** |
| `next build` | Outro dev server segurando o lock do `.next`. `tsc` + `eslint` + as 3 rotas renderizando em dev cobrem parte | não |

**Correção a uma leitura do agente:** ele registrou T8.3 como bloqueada por
`requireAdmin()`. **Não é uma questão de permissão** — ver a seção acima: qualquer
usuário autenticado passa. O que bloqueia T8.3 é o **desenho do caminho de
agendamento**, não o acesso a ele.

**Copy nova que o João Antônio ainda não leu:** `form.consent` (é texto legal —
define o que a pessoa autorizou), as mensagens de erro, o placeholder do campo
projeto e todo o bloco `obrigado.comum`. Ele revisou a v2 do `copy.ts`, que é
anterior a isso.

---

## O que NÃO foi feito, e por quê

1. **Não houve POST real na rota.** Escreveria na planilha de **produção** (a
   mesma que a equipe usa). O que foi executado de verdade: `tsc --noEmit`
   limpo e a régua + validadores rodados com CPF/CNPJ conhecidos
   (`529.982.247-25` e `11.222.333/0001-81` passam; os dígitos verificadores
   errados, não). O teste ponta a ponta fica para depois do formulário, com um
   lead cujo nome comece por "teste" — `isTourosTestLead` o mantém fora da aba
   de trabalho, **mas ele ainda entra na LEADS GERAIS**; apagar a linha depois é
   manual.
2. **Não abri a planilha.** A estrutura das abas vem do código. Se a equipe
   criou colunas à mão, o código não sabe — ele só acrescenta no fim.
3. **Não abri o GTM, a Vercel nem o Gerenciador de Anúncios.** Fases 1 e 9
   continuam tratando isso como descoberta.
4. **O CRM continua fora** (C-11, opção A do plano): só planilha. Lead em
   ENTRADA cairia no radar de disparo/followup e no concierge IA — a mesma razão
   que tirou o `/touros` do CRM em 24/07.

---

## Pendências que voltaram com força para o cliente

Nenhuma nova foi inventada. Mudou a **urgência** de três:

| # | O que é | Por que subiu |
|---|---|---|
| **C-09** | Condições de 30× e de frete grátis | A copy já diz "frete grátis **sob consulta**" (correção do João Antônio). Se houver restrição por praça, ela precisa estar escrita antes de subir campanha |
| **C-01** | Quais campos de atrito ficam | O formulário está sendo construído com o default. `projeto` obrigatório é a aposta mais arriscada da lista |
| **—** | A promessa de **acasalamento** | Não é copy, é **entrega**. João Antônio elogiou e alertou: exige formação e ir ao curral. Se a Bula não sustentar no volume da campanha, suavizar a copy **antes** de subir — promessa forte não cumprida queima o assessor na reunião, que é o KPI |
