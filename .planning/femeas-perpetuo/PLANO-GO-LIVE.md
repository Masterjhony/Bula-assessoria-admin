---
project: web-bula
feature: femeas-perpetuo
type: plano-de-go-live
escopo: Fase 9 (instrumentação) + Fase 10 (QA e go-live) + dependências de terceiro
nao_cobre: Fase 11 (começa depois do go-live)
container: GTM-K8RXFDDT
pixel: 1539780341180483
dominio: femeas.bulaassessoria.com
base_de_diff: 7e63df3
created: 2026-08-06
---

# Plano de go-live — landing do perpétuo de fêmeas

**O que é:** a lista executável do que falta para `/femeas` entrar no ar com
campanha paga. Cada item diz **quem faz**, **o que a pessoa precisa ter em mãos**
e **como se sabe que ficou pronto**.

**O que não é:** não é resumo do projeto e não substitui nada. O estado real está
em `EXECUCAO.md`; a intenção original, no `PLAN.md`; a amarração com a medição,
em `MODELO-FUNIL.md` §6; o material de imagem, em `MATERIAL-NECESSARIO.md`.
Onde este plano precisa de algo que já está escrito, ele **referencia**.

**A razão de este documento existir separado:** quem escreveu o código **não tem
acesso à Vercel, ao GTM, ao Gerenciador de Anúncios nem a credenciais de
Google/Supabase** (`EXECUCAO.md` §"O que NÃO pode ser verificado por quem
escreveu o código"). Boa parte do que falta não é programação — é trabalho de
quem tem acesso. Uma lista que não separe as duas coisas é uma lista que ninguém
consegue executar.

**Fases 0 a 8 estão feitas** (com seis desvios registrados). Nada abaixo repete
trabalho já entregue.

---

## 1. Os quatro responsáveis

Sempre que uma tarefa citar uma sigla, é uma destas:

| Sigla | Quem | O que só essa pessoa pode fazer | Precisa ter |
|---|---|---|---|
| **DEV** | quem programa | rodar gates, corrigir código, ler HTML renderizado | o repositório. Nada mais |
| **INFRA** | quem tem acesso à Vercel e à Hostinger | DNS, domínio, SSL, allowlist de paths, variáveis de ambiente, deploy | login da Hostinger (zona `bulaassessoria.com`) e do time da Vercel que **é dono do projeto** — a CLI de `jgdosantos` não enxerga o projeto (`INFRA-TRACKING.md` §1.5) |
| **MEDIÇÃO** | quem administra o GTM e o Gerenciador | criar/publicar tags, Preview, Conversões Personalizadas | conta Google com permissão no container `254974309` (conta `6359934056`) e acesso ao Events Manager da conta CA2 - Bula 360 |
| **CLIENTE** | Marcelo, João Antônio, coordenação | material de imagem, revisão de copy, decisões comerciais, aprovação para subir tráfego | as fotos, os números que só eles têm, e meia hora de leitura |

**OPERAÇÃO** (os 3 SDRs) aparece uma vez, em C-11 — é a única dependência humana
do modelo de funil, e a mais provável de falhar (`MODELO-FUNIL.md` §6).

---

## 2. O que foi MEDIDO em 06/08, e que muda o plano

Tudo abaixo é comando reproduzível rodado hoje, não leitura de documento.
Onde o resultado contradiz um documento anterior, está dito.

| # | Medição | Comando | Consequência |
|---|---|---|---|
| **M-1** | `femeas.bulaassessoria.com` **não existe no DNS** | `dig +short femeas.bulaassessoria.com` → vazio | É o item que trava mais coisa. Ver A-1 |
| **M-2** | `touros.` e `saogeraldo.` são **CNAME para `b5c073c43bb3d852.vercel-dns-017.com`** | `dig +short touros.bulaassessoria.com` | É a receita exata a replicar, não uma suposição |
| **M-3** | O container GTM continua na **versão 9: 5 tags, 4 acionadores, 6 condições** | script de A-10 / B-10 | **As tags do São Geraldo nunca foram publicadas.** A linha de base do `GTM.md` §7.4 continua válida palavra por palavra — e o acesso ao container segue sendo o gargalo suspeito |
| **M-4** | `Page Hostname` e `Page Path` já estão habilitados no container (macros 16 e 17); o pixel do perpétuo é `1539780341180483` (macro 13) | idem | Nada a criar no passo "Variáveis" do GTM |
| **M-5** | A allowlist por host funciona e está completa no São Geraldo: `/obrigado-saogeraldo-mql` → 200, `/api/saogeraldo/lead` → 405, `/agenda` → 308 | bloco `curl` de A-3 | O precedente foi executado por alguém **depois** de 27/07. Quem fez, faz de novo |
| **M-6** | `public/femeas/` só tem o `README.md` — **`og-femeas.jpg` não existe** | `ls public/femeas/` | Todo link compartilhado hoje sai com card quebrado (`MATERIAL-NECESSARIO.md` §1) |
| **M-7** | Os gates de T9.3 **passam** — mas só na versão corrigida | bloco de B-1 | Ver o aviso abaixo. Os comandos do `PLAN.md` reprovam código correto |

### O aviso que vale mais que os outros: dois gates do PLAN.md estão quebrados

Não é detalhe de sintaxe — é a diferença entre bloquear o deploy por um motivo
real e bloquear por um artefato do comando.

1. **`grep -rn "dataLayer" src/app/femeas/_lib/analytics.ts` → deveria ser vazio,
   e devolve 5 linhas.** As cinco são **comentários que explicam o INV-2**. O
   arquivo está certo; o gate se autoinvalida — é o mesmo fenômeno que o
   `GTM.md` §6.3 documentou ao medir `assign=2 push=1` sem filtro de comentário.
   Vale igual para `grep -rn "touros" src/app/femeas/_lib/`, que acha mais de 20
   ocorrências, todas em comentário, mais uma legítima em código
   (`copy.ts:129 escapeHref: '/touros'` — o link de escape é copy deliberada).

2. **`git diff --name-only main` acusa 57 arquivos de `touros/` e `saogeraldo/`
   alterados.** Não há regressão nenhuma: **`main` está 162 commits atrás desta
   branch** (`git rev-list --left-right --count main...HEAD` → `0 162`). A base
   correta é o pai do primeiro commit de fêmeas, **`7e63df3`**. Contra ela o gate
   fica vazio e `src/lib/jmp-sheets.ts` mede **138 inserções, 0 remoções** —
   exatamente o que o `EXECUCAO.md` (Desvio 1) registrou.

As versões que funcionam estão em **B-1**. Usar as de lá, não as do `PLAN.md`.

---

## 3. Ordem, e o que não pode ser invertido

```
A-1 DNS ──► A-2 domínio+SSL ──► A-3 allowlist ──┬──► A-5 deploy em produção
                                                │
                                                └──► B-8 Preview do GTM ──► B-9 publicar
                                                          ▲
A-10 acesso ao GTM ──► B-2 workspace limpo ──► B-3..B-6 criar ─┘

A-5 (ou um preview) ──► A-6 roteiro das 6 conferências na planilha
A-7 og-femeas.jpg ──► C-6 (SEO/OG)
A-9 copy revisada ──► C-5 ──► C-12 aprovação para subir tráfego
B-9 ──► B-10 diff ──► B-11/B-12 Events Manager ──► C-10 ──► TRÁFEGO
```

**O primeiro item que trava todos os outros é A-1: o registro DNS na Hostinger.**
Sem hostname não há como validar o acionador do GTM (a condição casa
`Page Hostname`, e o Preview roda contra **produção**, nunca contra
`*.vercel.app` — `GTM.md` §2, "pegadinha de teste"), e não se compra tráfego para
um domínio que não resolve. Ele também é o de maior lead time: propagação de DNS
mais emissão de certificado.

**O que NÃO depende do DNS, e por isso deve começar em paralelo hoje:**

| Pode rodar já | Por quê |
|---|---|
| **A-6** (roteiro das 6 conferências na planilha) | Precisa de credenciais, não de domínio. Um preview `*.vercel.app` basta |
| **A-7 / A-8** (material de imagem) | O prazo é a gravação de 14–15/08, não o DNS |
| **A-9** (revisão de copy) | Janela do João Antônio: **antes de 13/08**, ou depois de 18/08 (`PLAN.md` §6) |
| **A-10 / B-2** (acesso ao GTM e limpeza do workspace) | Foi o passo vermelho de 27/07 e M-3 sugere que continua |
| **B-1, C-9** (gates e build) | Só repositório |

**As três inversões proibidas:**

| Não inverter | Por quê |
|---|---|
| **B-2 antes de B-9** | Publicar no GTM publica o **workspace inteiro**. Se houver trabalho de terceiro pendente no workspace 10, ele sobe junto para produção (`GTM.md` §2 Passo 0) |
| **A-3 antes de B-8** | Se a página de obrigado responder 308 em vez de 200, o pageview vai para `/`, o acionador não casa e **a conversão nunca dispara, sem erro visível em lugar nenhum**. É a falha mais cara e mais silenciosa deste projeto (`GTM.md` §6.1) |
| **B-11 antes de C-10/tráfego** | Subir tráfego sem confirmar que a conversão do perpétuo de touros exclui o fêmeas é repetir o `ANALISE` §10 item 7, em que **todo MQL do leilão contava como conversão do perpétuo** |

---

## 4. Bloco A — dependências de terceiro

### A-1 · Criar o registro DNS `femeas` na Hostinger

**Quem:** INFRA · **Bloqueia:** A-2, A-3, A-5, B-8, B-9, todo o go-live

**Precisa ter em mãos:** login da Hostinger, zona `bulaassessoria.com`
(`NS: aster.dns-parking.com` / `helios.dns-parking.com` — a zona **não** é da
Vercel: `INFRA-TRACKING.md` §1.3).

**O que fazer:** criar `femeas` como **CNAME** para
`b5c073c43bb3d852.vercel-dns-017.com` — o mesmo alvo de `touros` e `saogeraldo`
[MEDIDO 06/08, M-2].

**Pronto quando:**
```bash
dig +short femeas.bulaassessoria.com
```
devolve o CNAME e os dois `A` (`216.150.1.193`, `216.150.16.193`), como
`touros` devolve hoje. Vazio = ainda não propagou.

---

### A-2 · Adicionar o domínio no projeto da Vercel e emitir o certificado

**Quem:** INFRA · **Depende de:** A-1 · **Bloqueia:** A-3, B-8

**Precisa ter em mãos:** acesso ao **time que é dono do projeto** na Vercel. Fica
registrado que essa conta não foi identificada por quem investigou: a CLI
autenticada como `jgdosantos` tem zero projetos e zero domínios, e
`vercel domains inspect` responde *"You don't have access"*
(`INFRA-TRACKING.md` §1.5). Se ninguém souber de quem é a conta, **isto vira o
bloqueio nº 1 do projeto** e precisa subir para o cliente antes de qualquer coisa.

**Pronto quando:** `curl -sSI https://femeas.bulaassessoria.com/` responde sem
erro de TLS.

---

### A-3 · Replicar o rewrite da raiz e a allowlist de paths

**Quem:** INFRA · **Depende de:** A-2 · **Bloqueia:** A-5, B-8

**Precisa ter em mãos:** a mesma tela onde `touros` e `saogeraldo` foram
configurados. O mapeamento host→rota é **100% platform-side**: não há
`middleware.ts`, e `next.config.mjs` só tem `headers()` de cache
(`INFRA-TRACKING.md` §1.1, reconferido hoje).

**O que fazer:** o host `femeas.*` precisa de (a) rewrite da raiz `/` → `/femeas`
e (b) allowlist liberando exatamente estes paths:

```
/femeas
/obrigado-femeas-mql
/obrigado-femeas-lead
/api/femeas/lead
/privacidade   /termos
estáticos: /femeas/*.jpg|webp|png|svg, /favicon.ico, /manifest.webmanifest
```

Tudo que pertence ao app interno (`/agenda`, `/sistema`, `/cadastro`,
`/habilitacao`, `/institucional`, `/leiloes`) deve continuar caindo em 308 → `/`,
como já acontece nos outros dois hosts.

**Pronto quando** este bloco der exatamente estes códigos:

```bash
for p in / /femeas /obrigado-femeas-mql /obrigado-femeas-lead /api/femeas/lead /agenda; do
  printf '\n--- %s\n' "$p"
  curl -sS -o /dev/null -D - "https://femeas.bulaassessoria.com$p" \
    | grep -Ei '^(HTTP/|location:|x-matched-path:)'
done
```

| Path | Aceite |
|---|---|
| `/` | **200** com `x-matched-path: /femeas` |
| `/obrigado-femeas-mql` e `-lead` | **200**. Qualquer `location:` reprova — é o 308 silencioso que mata a conversão |
| `/api/femeas/lead` | **405** (a rota é POST-only; 405 prova que foi alcançada) |
| `/agenda` | 308 → `/` |

---

### A-4 · Conferir as variáveis de ambiente na Vercel

**Quem:** INFRA · **Bloqueia:** nada do go-live; **bloqueia a Fase 11 inteira**

**O que conferir, e nada além disso:**

| Variável | O que fazer |
|---|---|
| `NEXT_PUBLIC_GTM_ID` | **Deixar como está.** O default no código já é `GTM-K8RXFDDT`. ATENÇÃO: esta env é **compartilhada com `/touros` e `/saogeraldo`** — mudar o valor "para separar o fêmeas" derruba o tracking dos três juntos (`GTM.md` §6.2) |
| `NEXT_PUBLIC_POSTHOG_KEY` | **Conferir se existe e tem valor.** Sem ela o `analytics.ts` é no-op por desenho, e os 8 eventos `femeas_*` não chegam a lugar nenhum |
| `NEXT_PUBLIC_POSTHOG_HOST` | default `https://us.i.posthog.com` |

**Não criar `NEXT_PUBLIC_GTM_ID_FEMEAS`** nem env por landing. Já foi cancelado
uma vez, pelo mesmo motivo (`GTM.md` §6.2).

**Por que isto importa mais do que parece:** `MODELO-FUNIL.md` §6 lê `t_lp` e o
abandono por passo em PostHog. Sem a key, **C-01 não tem como ser decidida** — o
campo `projeto`, que é a aposta mais arriscada da página (Desvio 5), continuaria
sendo opinião. É a diferença entre a Fase 11 existir e não existir.

**Pronto quando:** INFRA confirma por escrito o estado das três, e — depois de
A-5 — um acesso à landing produz `femeas_view` no PostHog.

---

### A-5 · Subir o deploy

**Quem:** INFRA (com DEV) · **Depende de:** A-3

**Precisa ter em mãos:** a branch `feat/femeas-perpetuo` mesclada ou apontada no
projeto. Fica registrada uma pergunta em aberto que só o dono da conta responde:
**a produção não se comporta como o código de `origin/main`** — hipótese 1 do
`INFRA-TRACKING.md` §1.5 é que o projeto Vercel aponte para outro repo/branch. Se
for o caso, **o código precisa ir para o repo certo**, e isso muda A-5 de lugar.

**Pronto quando:** `https://femeas.bulaassessoria.com/` renderiza a landing (não
a home do app, não 404), e o HTML traz o snippet do GTM.

---

### A-6 · Executar o roteiro das 6 conferências na planilha

**Quem:** INFRA, ou quem tiver credenciais de Google/Supabase ·
**Depende de:** um ambiente com credenciais (preview basta — **não depende do DNS**)

**O roteiro já está escrito e não se reescreve aqui:** `EXECUCAO.md` §"O roteiro
para quem tiver o acesso — 6 conferências, uma vez só". Executar **na ordem**.

**Por que é obrigatório e não "seria bom":** três das quatro coisas sem
verificação bloqueiam mídia, e a primeira delas é que **nenhum lead real caiu na
aba FEMEAS** — o contrato foi conferido por leitura e o payload por interceptação,
mas ninguém viu uma linha cair (`EXECUCAO.md` §"Fases 6 e 8").

**ATENÇÃO, e está no roteiro:** isso escreve na **planilha viva**. O
`spreadsheetId` vem do `jmp_config` no Supabase e é compartilhado — não existe
planilha de teste, e a remoção das linhas é manual.

**Pronto quando:** as 6 conferências passam, e quem executou registra o resultado
de cada uma no `EXECUCAO.md`. As duas mais importantes: a linha **não** aparece em
TOUROS/EMBRIÕES/OUTROS, e o reenvio com o mesmo `event_id` **não** cria linha nova.

---

### A-7 · `og-femeas.jpg`

**Quem:** CLIENTE (Marcelo) · **Bloqueia:** C-6 · **Já causa dano hoje**

Especificação e motivo: `MATERIAL-NECESSARIO.md` §1. Resumo do que não pode ser
negociado: **1200×630, JPG (não WEBP), recorte pronto.**

**Pronto quando:** o arquivo está em `public/femeas/og-femeas.jpg`,
`curl -sI https://femeas.bulaassessoria.com/femeas/og-femeas.jpg` devolve 200 com
`content-type: image/jpeg`, e o link colado num WhatsApp mostra o card com imagem.

---

### A-8 · As seis fotos de categoria

**Quem:** CLIENTE (Marcelo) · **Não bloqueia o go-live** — é o item 2 da lista de
cortáveis (`PLAN.md` §Corte mínimo)

Especificação: `MATERIAL-NECESSARIO.md` §2. A regra que não pode ser afrouxada:
**ou vêm as seis, ou nenhuma.** A janela é a gravação de 14–15/08, e `embrioes`
precisa ser combinado antes (não há animal para fotografar).

**Pronto quando:** os seis `categoria-<id>.webp` existem em `public/femeas/` com
os ids de `_lib/categorias.ts`, e o mapa vazio do `Categorias.tsx` foi ligado
conforme `public/femeas/README.md`.

---

### A-9 · Fechar a copy que ainda depende do cliente

**Quem:** CLIENTE (João Antônio, mais Marcelo no comercial) · **Bloqueia:** C-5, C-12

**Precisa ter em mãos:** `src/app/femeas/_lib/copy.ts` (é onde toda a copy vive —
INV-5; ele revisa sem tocar em componente).

**O que ainda não foi lido por ele** (`EXECUCAO.md` §"Fases 6 e 8" e Desvio 6):
`form.consent` (texto legal — define o que a pessoa autorizou), as mensagens de
erro, o placeholder do campo projeto, o bloco `obrigado.comum` inteiro,
`provaSocial`, os `eyebrow` de seção, `rodape` e `hero.fotoAlt`.

**O que é decisão comercial, não revisão de texto** — cada uma com dono:

| Item | Marcação no código | De quem é a decisão |
|---|---|---|
| Prazo de contato na página de obrigado | `copy.ts:467,473` → `'[VALIDAR] Em até 24 horas úteis.'` | CLIENTE. A T8.4 exige **prazo concreto** no `-mql`; hoje o número é palpite marcado |
| Condições de 30× e frete grátis (**restrição por praça**) | C-09 | CLIENTE. A copy já diz "sob consulta" |
| Prova social com número | C-07 | CLIENTE **fornece o número ou não existe número**. Não estimar (`MATERIAL-NECESSARIO.md` §"E o que NÃO é foto") |
| A promessa de **acasalamento** | não é copy, é entrega | CLIENTE. Se a Bula não sustentar no volume da campanha, **suavizar antes de subir tráfego** — promessa forte não cumprida queima o assessor na reunião, que é o KPI |
| URL do perpétuo de touros no botão de escape | `copy.ts:125` `[VALIDAR]` | DEV confere contra `touros.bulaassessoria.com` (já responde 200) |

**Pronto quando:** aprovação **por escrito** (T10.5), e nenhum `[VALIDAR]`
sobrando em texto que vá à tela. A função `semMarcacao()` apaga a marcação no
render de propósito — ela some da tela mas **continua no arquivo** como lembrete
da pendência, então "não aparece na página" não é prova de que foi decidido.

---

### A-10 · Garantir acesso ao container do GTM

**Quem:** MEDIÇÃO / CLIENTE · **Bloqueia:** B-2 a B-9 · **Começar hoje**

**Precisa ter em mãos:** conta Google com permissão de **publicação** no container
`254974309` (conta `6359934056`), workspace 10:
`https://tagmanager.google.com/#/container/accounts/6359934056/containers/254974309/workspaces/10`

**Por que isto está no topo da lista e não no meio:** em 27/07 este passo estava
vermelho — o Chrome estava logado em `joaoeduardo.lp1@gmail.com`, que não enxerga
nenhuma conta do GTM (`GTM.md` §10). E a medição de hoje sugere que nada mudou:
**o container continua na versão 9, com as mesmas 5 tags e 4 acionadores de
27/07** [MEDIDO, M-3] — ou seja, as 4 alterações do São Geraldo **nunca foram
publicadas**, apesar de o leilão ter rodado.

**Duas coisas que esse fato levanta, e nenhuma delas é afirmação:**

1. Ou o São Geraldo mediu pela **Rota B** (Conversão Personalizada por URL no
   Events Manager, sem publicar nada no GTM — `GTM.md` §8), ou não mediu.
   **Quem tem acesso ao Events Manager responde isso em dois minutos**, e a
   resposta decide se o fêmeas segue a Rota A ou a Rota B (ver B-13).
2. As 4 alterações do São Geraldo podem estar **pendentes dentro do workspace 10**.
   Se estiverem, publicar o fêmeas **arrasta as delas para produção**. É o que a
   B-2 existe para descobrir, e é bloqueante.

**Pronto quando:** a pessoa abre o workspace 10 e consegue ver a aba "Alterações".

---

## 5. Bloco B — Fase 9, instrumentação

### B-1 · Gates anti-regressão (T9.3, na versão que funciona)

**Quem:** DEV · **Depende de:** nada · **Estado hoje: todos verdes** [MEDIDO 06/08]

Usar estes comandos, **não** os do `PLAN.md` T9.3 — o motivo está em §2, e é que
os de lá reprovam código correto. O filtro de comentário não é decoração: os
arquivos documentam a própria regra em prosa, e sem o filtro o comentário que
protege a regra faz o teste falhar sozinho.

```bash
# base do trabalho de fêmeas — NÃO usar `main` (162 commits atrás)
BASE=7e63df3

# G1 · INV-2 — a landing não empurra nada ao dataLayer (é o que mantém o
#      acionador catch-all R2 inerte). GoogleTagManager.tsx é excluído: o push
#      dele é o gtm.start do snippet oficial, que contém "gtm." e é excluído
#      pelo próprio catch-all.
grep -rn --include='*.ts' --include='*.tsx' 'dataLayer\.push\|pushDataLayer' \
  src/app/femeas src/app/obrigado-femeas-mql src/app/obrigado-femeas-lead \
  | grep -v 'GoogleTagManager.tsx' | grep -vE ':[[:space:]]*(//|\*)'
# aceite: vazio

# G2 · INV-1 — navegação hard
F=src/app/femeas/_components/Formulario.tsx
printf 'assign=%s push=%s\n' \
  "$(grep -vE '^[[:space:]]*(//|\*|/\*)' "$F" | grep -c 'window\.location\.assign')" \
  "$(grep -vE '^[[:space:]]*(//|\*|/\*)' "$F" | grep -c 'router\.push')"
# aceite: assign=1 push=0

# G3 · GTM montado nas duas páginas de obrigado
grep -l 'GoogleTagManager' src/app/obrigado-femeas-mql/page.tsx src/app/obrigado-femeas-lead/page.tsx
# aceite: as duas

# G4 · sem redirect automático no obrigado (C-12 decidiu: sem grupo de WhatsApp)
grep -vE '^[[:space:]]*(//|\*|/\*)' src/app/femeas/_components/Obrigado.tsx \
  | grep -nE 'location\.|redirect|setTimeout'
# aceite: vazio

# G5 · INV-4 — namespace próprio (a falha R-1, que já aconteceu uma vez)
grep -rn --include='*.ts' --include='*.tsx' "touros_\|sg7p" src/app/femeas/ \
  | grep -vE ':[[:space:]]*(//|\*)'
# aceite: vazio
grep -c "femeas_utm" src/app/femeas/_lib/utm.ts        # aceite: 1
grep -rn --include='*.ts' --include='*.tsx' "'/touros'\|\"/touros\"" src/app/femeas/ \
  | grep -vE ':[[:space:]]*(//|\*)'
# aceite: EXATAMENTE 1 — copy.ts:129 escapeHref. Qualquer outra ocorrência reprova

# G6 · INV-8 — nenhuma rota em produção tocada
git diff --name-only $BASE...HEAD \
  | grep -E "src/app/(touros|saogeraldo)/|src/app/api/(touros|saogeraldo)/"
# aceite: vazio
git diff --numstat $BASE...HEAD -- src/lib/jmp-sheets.ts
# aceite: "138  0" — só adições

# G7 · escopo — nenhum disparo de WhatsApp, nenhum insert no CRM
grep -rn "dispatchCrmWelcome\|baileys\|whatsapp/send" src/app/femeas/ src/app/api/femeas/
# aceite: vazio
```

**Qualquer um falhando bloqueia o deploy.** Rodar antes de A-5 e de novo antes de
subir tráfego.

---

### B-2 · Inspecionar o workspace 10 antes de criar qualquer coisa

**Quem:** MEDIÇÃO · **Depende de:** A-10 · **BLOQUEANTE**

Procedimento: `GTM.md` §2 Passo 0 — não se reescreve aqui. O resumo do que está
em jogo: publicar no GTM publica **o workspace inteiro**, não as suas alterações.

**O que fazer:** abrir a aba "Alterações" do workspace 10 e anotar **tudo** que
já está lá, como linha de base.

**O desfecho depende do que aparecer:**

| Se a aba mostrar | O que fazer |
|---|---|
| vazia | seguir para B-3 |
| as 4 alterações do São Geraldo (`pv_sg_*`, `fb_sg_*`) pendentes | **PARE.** Falar com quem cuida do leilão: publicar o fêmeas subiria as tags dele junto. Ou publica-se as duas coisas conscientemente, ou vai-se de Rota B (B-13) |
| qualquer item de terceiro | **PARE e reporte.** Criar é seguro; **publicar** é que arrasta |

**Pronto quando:** a lista está anotada e a decisão (seguir / limpar / Rota B)
está registrada com nome de quem decidiu.

---

### B-3 · Acionador `pv_femeas_obrigado_mql`

**Quem:** MEDIÇÃO · **Depende de:** B-2

Acionadores → Novo → **Visualização de página** (Page View — não DOM Ready, não
Window Loaded).

- Dispara em: **Alguns eventos de visualização de página**
- Condição 1: `Page Path` — **é igual a** — `/obrigado-femeas-mql`
- Condição 2: `Page Hostname` — **é igual a** — `femeas.bulaassessoria.com`

Nome: **`pv_femeas_obrigado_mql`**

Nada a criar em "Variáveis": `Page Path` e `Page Hostname` já estão habilitados
[MEDIDO, M-4].

**Por que não colide com o perpétuo de touros:** `é igual a` é match exato, a
string `femeas` está no path, o hostname é uma segunda trava, e **criar acionador
é aditivo** — ele só age quando uma tag o referencia, e nenhuma das 5 tags
existentes o referencia. A tabela completa desse raciocínio está em `GTM.md` §2
("Por que não colide com o perpétuo") e vale igual aqui.

**Pronto quando:** aparece na aba "Alterações" como item **Adicionado**.

---

### B-4 · Acionador `pv_femeas_obrigado_lead`

**Quem:** MEDIÇÃO · Idêntico a B-3, trocando a condição 1 por
`/obrigado-femeas-lead`. Nome: **`pv_femeas_obrigado_lead`**.

---

### B-5 · Tag `fb_femeas_mql`

**Quem:** MEDIÇÃO · **Depende de:** B-3

Tags → Novo → **o mesmo template de Meta Pixel já instalado no container** (o que
as tags T3/T4 usam). **Não instalar template novo da galeria.**

| Campo | Valor |
|---|---|
| Pixel ID | `1539780341180483` — escolher **pelo ID, nunca pelo nome**: existe um quase-homônimo `Perpetuo TOUROS` (`2063779524517301`) que **não** é o do perpétuo (`GTM.md` §3) |
| Event Type | `Custom` |
| Event Name | `femeas_mql` |
| Event ID | vazio |
| value / currency / Object Properties | **vazio** |
| Acionamento | `pv_femeas_obrigado_mql` |
| Exceções | nenhuma |
| Avançado | padrão (`uma vez por evento`) |

Nome: **`fb_femeas_mql`**

**Sobre o nome do evento:** `femeas_mql` não colide com nenhum dos 8 eventos
`femeas_*` do PostHog (`femeas_view`, `femeas_form_started`,
`femeas_step_attempt`, `femeas_step_reached`, `femeas_validation_failed`,
`femeas_submit_attempt`, `femeas_lead_submitted`) [MEDIDO 06/08] — e nem poderia
chegar ao container, já que o `analytics.ts` não empurra nada ao `dataLayer`
(INV-2). Os dois universos são separados de propósito: PostHog mede o **passo a
passo**, o pixel mede a **conversão**.

---

### B-6 · Tag `fb_femeas_lead`

**Quem:** MEDIÇÃO · Idêntica a B-5, com Event Name **`femeas_lead`** e
acionamento `pv_femeas_obrigado_lead`. Nome: **`fb_femeas_lead`**.

---

### B-7 · O que NÃO fazer no container

**Quem:** MEDIÇÃO · Lista fechada, herdada de `GTM.md` §2 Passo 5 e §4.4:

- Não criar tag GA4 nova (T0/T1/T2 já cobrem GA4 em todas as páginas — seria
  evento duplicado no relatório).
- Não ligar os eventos novos ao caminho CAPI/sGTM. Sem par CAPI não há o que
  deduplicar, e é por isso que o Event ID fica vazio.
- Não usar evento **padrão** (`Lead`, `CompleteRegistration`). O pixel é
  compartilhado: um `Lead` padrão do fêmeas entra no mesmo balde de otimização do
  perpétuo de touros. Evento customizado é o que mantém os dois separados.
- Não colocar `value`/`currency` na tag — vai na Conversão Personalizada (B-12),
  isolado.
- Não abrir, renomear ou editar **R0–R3** nem **T0–T4**, nem a tabela de consulta
  de nomes de evento, nem a variável de `event_id` do perpétuo.

**Resumo do que sobe: 4 itens, todos "Adicionado", nenhum "Modificado".**

---

### B-8 · Preview do GTM ponta a ponta (T9.4)

**Quem:** MEDIÇÃO, com DEV acompanhando · **Depende de:** A-3, A-5, B-6

**Precisa ter em mãos:** o domínio de produção no ar (A-3 verde) e a extensão
Meta Pixel Helper. **O Preview roda contra produção, não contra `*.vercel.app`**
— por causa da condição de hostname. **Não relaxar o hostname para testar em
preview:** isso abriria o pixel de produção para deploys de preview.

**Roteiro:** GTM → workspace 10 → Visualizar → `https://femeas.bulaassessoria.com`
→ Connect → preencher e enviar. A navegação é hard no mesmo host, então o Tag
Assistant mantém a sessão e a página de obrigado aparece como um novo container na
linha do tempo.

**Rodar duas vezes, e é o par que prova a separação:**

| Rodada | Como produzir | Aceite |
|---|---|---|
| **aprovado** | documento válido + inscrição estadual = **Sim** + quantidade na faixa | cai em `/obrigado-femeas-mql`; `fb_femeas_mql` em **Tags Fired, 1 vez**; `fb_femeas_lead` em **Not Fired** |
| **não aprovado** | inscrição estadual = **Não** | cai em `/obrigado-femeas-lead`; `fb_femeas_lead` **1 vez**; **`fb_femeas_mql` NÃO dispara** |

Mais quatro conferências, na página de MQL:

1. Properties da tag: pixel `1539780341180483`, event name `femeas_mql`, **sem**
   `value`/`currency`.
2. Varrer **todos** os eventos da linha do tempo daquela página: `fb_femeas_mql`
   aparece em **exatamente um**. Em dois, o acionador está errado.
3. No evento **DOM Ready**, T3 dispara `PageView` — **isso é esperado**, é o
   acionador R1, que não tem filtro de URL. Nome diferente, logo não é duplicação.
4. Aba Variables: `Page Path` = `/obrigado-femeas-mql`,
   `Page Hostname` = `femeas.bulaassessoria.com`.

**Regressão, ainda em Preview:** abrir
`https://touros.bulaassessoria.com/obrigado-touros-mql` e conferir que
`fb_femeas_mql` e `fb_femeas_lead` estão em **Tags Not Fired**.

**Meta Pixel Helper**, na página de MQL: um `femeas_mql` e um `PageView`. Dois
`femeas_mql` = falha.

---

### B-9 · Publicar e anotar a versão

**Quem:** MEDIÇÃO · **Depende de:** B-2 resolvida e B-8 verde

1. Aba **Alterações**: confirmar **exatamente 4 itens**, todos "Adicionado".
   Um quinto item ⇒ **PARE** (volta para B-2).
2. Enviar → nome da versão: `FEM — conversão perpétuo fêmeas (2 tags + 2 acionadores)`.
3. **Anotar o número da versão publicada.** A auditada hoje é a **9** [MEDIDO],
   então a sua será a próxima. É o ponto de rollback
   (`Versões → versão anterior → Publicar`).

---

### B-10 · Diff da configuração publicada — a prova de que o perpétuo não mudou

**Quem:** MEDIÇÃO ou DEV (**não exige credencial** — a config publicada é servida
publicamente em `gtm.js`) · **Depende de:** B-9

```bash
python3 - <<'PY'
import json,re,urllib.request
s=urllib.request.urlopen("https://www.googletagmanager.com/gtm.js?id=GTM-K8RXFDDT",timeout=25).read().decode('utf8','replace')
d=json.loads(re.search(r'var data = (\{.*?\});\n',s,re.S).group(1))['resource']
print("versao publicada:",d['version'])
print("tags:",len(d['tags']),"| acionadores:",len(d['rules']),"| condicoes:",len(d['predicates']))
for i,x in enumerate(d['rules']): print("rule",i,x)
for i,p in enumerate(d['predicates']): print("pred",i,p['function'],p.get('arg1'))
PY
```

**Linha de base [MEDIDO 06/08, e idêntica à de 27/07]:**

```
versao publicada: 9
tags: 5 | acionadores: 4 | condicoes: 6
rule 0 [['if', 0], ['add', 0]]
rule 1 [['if', 1], ['add', 1, 2, 3]]
rule 2 [['if', 3], ['unless', 2], ['add', 2, 3]]
rule 3 [['if', 4, 5], ['add', 4]]
pred 0 _eq gtm.init   pred 1 _eq gtm.dom   pred 2 _cn gtm.
pred 3 _re .+         pred 4 _cn /obrigado-jmp.html   pred 5 _eq gtm.js
```

**Aceite pós-publicação:** `tags: 7`, `acionadores: 6`, `condicoes: 10` (as 6
antigas + dois `_eq` de path e dois `_eq` de hostname). As **rules 0–3 com o mesmo
conteúdo e os mesmos índices de tag**, e as **preds 0–5 idênticas**. Qualquer
divergência ali ⇒ alguma coisa do perpétuo foi alterada ⇒ **rollback imediato**.

**ATENÇÃO:** se o São Geraldo for publicado junto (ver B-2), a linha de base muda
para `tags: 7 / acionadores: 6 / condicoes: 10` **antes** do fêmeas, e o aceite
vira `9 / 8 / 14`. Rodar o script **imediatamente antes** de publicar, para
capturar a base do dia — não confiar nesta tabela sem reconferir.

---

### B-11 · Confirmar que o fêmeas não envenena a conversão do perpétuo (T9.2)

**Quem:** MEDIÇÃO · **Depende de:** acesso ao Events Manager ·
**Bloqueia:** C-10 e o tráfego

**O que fazer:** Events Manager → pixel `1539780341180483` → Conversões
Personalizadas → **ler** (não editar) as regras.

**O que a evidência de 27/07 diz** (lida direto na Meta API, `GTM.md` §4.3): as
duas conversões existentes casam a **URL completa com hostname** —
`touros.bulaassessoria.com/obrigado-touros-mql` e
`jmp.bulaassessoria.com/obrigado-jmp.html`. `femeas.bulaassessoria.com` não casa
com nenhuma, logo **não há contaminação por essa via**.

**Por que reconferir mesmo assim:** são 10 dias e uma campanha de leilão de
diferença, e o item §10-7 do `ANALISE` registra que **todo MQL do leilão já
contou como conversão do perpétuo** uma vez. A leitura custa dois minutos.

**Enquanto está ali, responder a pergunta de A-10:** existem conversões
personalizadas do São Geraldo por URL? Se existirem, o leilão foi medido pela
Rota B — e isso é o argumento mais forte para o fêmeas ir pelo mesmo caminho
(B-13).

**Pronto quando:** está escrito, com data, que nenhuma conversão do perpétuo de
touros casa `femeas.bulaassessoria.com`.

---

### B-12 · Criar as Conversões Personalizadas do fêmeas

**Quem:** MEDIÇÃO / mídia · **Depende de:** B-9 (ou B-13)

| Nome | Regra | Valor |
|---|---|---|
| `FEM — MQL` | evento `femeas_mql` | `100` BRL |
| `FEM — Lead` | evento `femeas_lead` | `10` BRL |

Os pesos são os mesmos `VALUE_MQL`/`VALUE_NON_MQL` de
`src/app/femeas/_lib/analytics.ts` — o que importa é o **gradiente**, não o
número absoluto. O valor vai **aqui**, não na tag (B-7), para ficar isolado e não
entrar no faturamento reportado do pixel compartilhado.

A campanha de fêmeas otimiza por **`FEM — MQL`**.

**ATENÇÃO, e isto é da mídia, não do implementador:** `is_mql` é o veredito do
**servidor**, e o portão real do funil é o `Aprovado` do SDR. Se os dois
discordarem, o algoritmo está sendo treinado por um alvo que não é o portão real —
é a T11.3, e é a razão pela qual a coluna `Régua automática` foi criada ao lado da
`Aprovado` (Desvio 2). Não é trabalho de agora; é o que se lê no primeiro mês.

---

### B-13 · Rota B — conversão sem publicar nada no GTM (contingência)

**Quem:** MEDIÇÃO · **Usar se:** B-2 travar (workspace sujo) ou A-10 não resolver

Descrita em `GTM.md` §8. Como o acionador R1 (`gtm.dom`) já manda `PageView` de
**toda** página do host novo, dá para medir só no Events Manager:

| Conversão | Regra |
|---|---|
| `FEM — MQL` | `PageView` **e** URL contém `obrigado-femeas-mql` |
| `FEM — Lead` | `PageView` **e** URL contém `obrigado-femeas-lead` |

Zero alteração no GTM, zero publicação, zero risco sobre o perpétuo. Custo: não
gera nome de evento próprio no pixel, e a janela de atribuição só começa a contar
a partir da criação da conversão.

**Se a Rota B for usada, A-3 fica ainda mais crítica** — a regra é a URL, e um
308 na página de obrigado apaga a conversão inteira.

**Esta é uma decisão de MEDIÇÃO, não do DEV**, e ela precisa ser registrada com
nome e data — inclusive porque M-3 sugere que ela já pode ter sido a decisão
prática do São Geraldo, sem nunca ter sido escrita.

---

### B-14 · Conferir a UTM ponta a ponta (T9.5)

**Quem:** DEV (o passo (c)) + quem tem o ambiente com credenciais (o passo (a)) ·
**Depende de:** A-5 e A-6

Abrir a landing com
`?utm_source=meta&utm_medium=cpc&utm_campaign=femeas&ad-id=123&fbclid=abc`,
enviar o cadastro, e conferir as três pontas:

| # | O quê | Aceite |
|---|---|---|
| (a) | as colunas de UTM chegaram na aba **FEMEAS** | `utm_source=meta`, `utm_campaign=femeas`, `ad-id=123` na linha |
| (b) | a chave em `sessionStorage` | `femeas_utm` — **e nenhuma escrita em `touros_utm`** |
| (c) | abrir `/touros` na mesma sessão | nem sobrescreve nem é sobrescrito: as duas chaves coexistem |

**O item (c) é o teste que ninguém rodou no fork do São Geraldo, e é por isso que
a regressão R-1 passou despercebida.** Rodar no navegador, DevTools →
Application → Session Storage.

---

## 6. Bloco C — Fase 10, QA e go-live

A lista da Fase 10 já está no `PLAN.md` e não se reescreve. O que muda aqui é
**quem faz cada item e o que ele depende**. O corte mínimo declarado
(`PLAN.md` §Corte mínimo de go-live) mantém como obrigatórios: **T10.1, T10.2,
T10.7, T10.9, T10.10 e T10.11**.

| ID | Item da Fase 10 | Quem | Depende de | Como se sabe que ficou pronto |
|---|---|---|---|---|
| **C-1** | T10.1 · Funcional | INFRA + DEV | A-6 | As 6 conferências de A-6 passaram. As 7 recusas do servidor **já estão provadas por `curl`** (`EXECUCAO.md` §"O teste da rota") — não refazer |
| **C-2** | T10.2 · Invariantes | DEV | B-1 | Os 7 gates de B-1 verdes, mais INV-6 no DevTools (inputs 16px, alvos ≥44px) e INV-7 medido **no HTML renderizado**: `curl -s https://femeas.bulaassessoria.com/ \| grep -c 'id="cadastro"'` = **1**. Medir no DOM, não na árvore de arquivos — o São Geraldo tem `id="cadastro"` em dois arquivos e um deles nem é importado |
| **C-3** | T10.3 · Acessibilidade | DEV | — | Contraste AA, `htmlFor` em todas as labels, erros com `role="alert"`, teclado completo com **anel de foco visível**, `prefers-reduced-motion` sem animação. Parte já medida em navegador real (`EXECUCAO.md` §"Fases 6 e 8"); o que falta é o teclado e o contraste nas superfícies novas da Fase 7 |
| **C-4** | T10.4 · Mobile e performance | DEV | A-5 | Lighthouse mobile: **Performance ≥ 90, LCP < 2,5s, CLS < 0,1**. Em **celular real**, não só DevTools. A página está sem foto hoje, então o LCP é texto — quando A-7/A-8 entrarem, **remedir**: hero com `priority` e `sizes`, resto `lazy` |
| **C-5** | T10.5 · Conteúdo | CLIENTE + DEV | A-9 | Nenhum `[VALIDAR]`/`[PENDENTE]` no HTML renderizado (`curl -s … \| grep -c 'VALIDAR'` = 0), nenhum claim numérico não fornecido pelo cliente, e a copy de "para quem não é" **aprovada por escrito** |
| **C-6** | T10.6 · SEO/OG | DEV | A-7 | `title`/`description` próprios; OG **1200×630 em JPG** respondendo 200; `robots: index` na landing e `noindex` nos dois obrigados (já está assim no código) |
| **C-7** | T10.7 · Domínio | INFRA | A-1..A-3 | O bloco `curl` de A-3 com todos os aceites |
| **C-8** | T10.8 · Escopo e não-regressão | DEV | — | G6 e G7 de B-1, **com `BASE=7e63df3`**. Usar `main` aqui dá 57 falsos positivos (§2) |
| **C-9** | T10.9 · Build | DEV | — | `npm run build` limpo. **Nunca foi rodado** — outro dev server segurava o lock do `.next` (`EXECUCAO.md`). É o único item da lista que ainda é incógnita técnica pura |
| **C-10** | T10.10 · Separação de campanha | MEDIÇÃO | B-11 | Registrado por escrito que as regras de conversão do perpétuo de touros excluem o fêmeas. **Sem isso, não sobe tráfego** |
| **C-11** | T10.11 · Operação pronta | CLIENTE + OPERAÇÃO | A-6 | Ver abaixo |
| **C-12** | T10.12 · Aprovação para subir tráfego | CLIENTE | C-1..C-11 | Por escrito |

### C-11, detalhado — porque é o item que não tem comando de verificação

**Quem:** CLIENTE (define) + os 3 SDRs (executam) · **Bloqueia:** subir tráfego

Não é burocracia: `MODELO-FUNIL.md` §6 diz, com todas as letras, que as cinco
colunas de operação **nascem vazias** e que se o SDR não registrar 1º toque e
aprovação, **`t_aprov` não existe e o modelo inteiro fica sem realimentação** — a
página vira aposta cega. É a única dependência humana do modelo, e a mais provável
de falhar.

O que precisa estar escrito **antes do primeiro dia de tráfego** (T8.5):

1. **Os nomes dos 3 SDRs.**
2. **A regra de divisão da fila.** Sem ela, três pessoas na mesma aba produzem
   lead tocado duas vezes e lead tocado nenhuma. Ordem de chegada ou faixa de UF
   resolve — o que não resolve é "combinar depois".
3. **Onde olhar:** aba **FEMEAS** (não existe aba `LEADS FEMEAS` — ver
   `EXECUCAO.md` Desvio 1). As 9 colunas próprias estão **no fim da aba**, depois
   de `Observações`, porque `ensureFemeasLayout` só acrescenta (Desvio 2). Se a
   equipe quiser outra ordem, **quem move é gente, na planilha**.
4. **O que preencher:** `1º toque em`, `Aprovado`, `Motivo da recusa`,
   `Reunião agendada`, `Assessor da reunião`.
5. **Em quanto tempo.** Cadência é tratada como o fator decisivo de conversão, e o
   sinal de alarme já está definido: lead sem 1º toque em >24h em >20% dos casos
   (`MODELO-FUNIL.md` §5).

**Uma trava que já foi verificada e não é problema:** os SDRs **não** precisam de
permissão especial para registrar o agendamento. `requireAdmin()` só confere se há
sessão — basta ter login no sistema (`EXECUCAO.md` §"Verificação fechada").
**O que continua aberto é o desenho do caminho de agendamento (T8.3)**, não o
acesso a ele. Fica registrado o risco lateral, que **não é desta feature
resolver**: qualquer pessoa com login vê e escreve em tudo. Se os SDRs forem
contratados novos, vale levantar com o cliente **antes** de criar os três logins.

---

## 7. Pendências que continuam abertas, e de quem é cada decisão

Nenhuma inventada aqui. O que este plano faz é dizer **quem decide** cada uma.

| # | Pendência | De quem é a decisão | Trava o go-live? |
|---|---|---|---|
| **C-01** | quais campos de atrito ficam | CLIENTE, **com dado** (Fase 11, ~200 leads) | não — o formulário nasce medindo |
| **C-07** | prova social com número | CLIENTE **fornece ou não existe** | não (cortável) |
| **C-08** | preço/faixa por categoria | CLIENTE | não — campo `null` some da UI |
| **C-09** | 30× e frete grátis, com restrição por praça | CLIENTE | **sim, para a copy** (A-9) |
| **C-14** | 3 SDRs + 3 assessores, ou as mesmas 3 pessoas acumulando | CLIENTE | não — mas move o limiar de `t_aprov` de ~22% para ~43% |
| **prazo de contato** | "24 horas úteis" está marcado `[VALIDAR]` no `copy.ts` | CLIENTE | **sim** — a T8.4 exige prazo concreto no `-mql` (A-9) |
| **acasalamento** | a promessa é **entrega**, não copy | CLIENTE | **sim, se não for sustentável** no volume da campanha (A-9) |
| **T8.3** | o desenho do caminho de agendamento | CLIENTE + MEDIÇÃO | não no corte mínimo — fica o manual, opção (B) |
| **Rota A ou Rota B** no GTM | MEDIÇÃO, à luz de A-10/B-11 | **sim** — mas as duas rotas entregam conversão (B-13) |
| **de quem é a conta Vercel dona do projeto** | CLIENTE | **sim** — é o bloqueio nº 1 se ninguém souber (A-2) |

---

## 8. O que este plano não cobre

- **Fase 11** (melhoria contínua) — começa **depois** do go-live. As pontas que
  ela vai puxar já estão instaladas: os 8 eventos `femeas_*`, a coluna
  `Régua automática` ao lado de `Aprovado`, e `Motivo da recusa`.
- **Corrigir R-1 e R-2 nos análogos** (`/saogeraldo` com `touros_utm`, `/touros`
  empurrando ao `dataLayer`). Diagnosticados, com risco próprio e escopo próprio.
- **Meta CAPI server-side.** O `event_id` já é gerado e está pronto para dedup.
- **Qualquer alteração em `src/app/touros/` ou `src/app/saogeraldo/`** (INV-8).

---

## 9. Contagem

**36 tarefas:** 10 de dependência de terceiro (A), 14 de instrumentação (B),
12 de QA e go-live (C).

**Por responsável** (uma tarefa pode ter dois donos; conta pelo dono principal):

| Responsável | Tarefas |
|---|---|
| **INFRA** (Vercel/Hostinger) | 6 — A-1, A-2, A-3, A-4, A-5, A-6 |
| **MEDIÇÃO** (GTM/Events Manager) | 11 — A-10, B-2 a B-13 (menos B-1 e B-14) |
| **DEV** | 8 — B-1, B-14, C-2, C-3, C-4, C-6, C-8, C-9 |
| **CLIENTE** | 7 — A-7, A-8, A-9, C-5, C-11, C-12, e as decisões da §7 |
| **compartilhadas** | 4 — C-1, C-7, C-10, B-8 |

**Caminho crítico:**
`A-1 → A-2 → A-3 → A-5 → B-8 → B-9 → B-10 → B-11 → C-10 → C-12 → tráfego`
com `A-10 → B-2 → B-3..B-6` correndo em paralelo e desaguando em B-8.

**O item que trava todos os outros: A-1** — o CNAME `femeas` na Hostinger, que
hoje não existe [MEDIDO 06/08]. Tem o maior lead time do plano (propagação +
SSL), e sem ele não há hostname para o acionador do GTM casar, nem domínio para
comprar tráfego. **Se houver um único item a executar hoje, é esse.**
