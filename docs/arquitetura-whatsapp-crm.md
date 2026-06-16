# Arquitetura WhatsApp do CRM — disparos, guard rails e canais (oficial + Baileys)

> Documento de **desenho + status**. Define como integrar os dois canais de
> WhatsApp ao CRM de forma funcional, anti-ban e escalável.
> Decisão de UX aprovada: **cockpit no CRM + Central como ferramenta de edição profunda**.

### Status de implementação

Migrations 0030–0032 **já aplicadas no banco** (via `scripts/apply-sql.mjs`).
Typecheck e `next build` limpos.

- ✅ **Fase 1 — Gateway + guard rails:**
  - `src/lib/whatsapp-guardrails.ts` — config, opt-out (flag + tabela, em lote),
    cap diário + warmup, dedup, jitter, contadores.
  - `src/lib/whatsapp-gateway.ts` — `sendOutbound` (roteamento + guard rails + log unificado).
  - `src/lib/whatsapp-cloud-api.ts` — `sendSingleViaCloudApi`.
  - `0030_whatsapp_gateway.sql` (channel/intent, counters, RPC, guardrails),
    `0031_whatsapp_counter_by.sql` (incremento em lote).
  - `crm-whatsapp-assessor.ts` refatorado; `POST /api/whatsapp/send`.
  - **Campanha pelos guard rails:** opt-out por número, cap diário (recusa
    informativa quando estoura), contagem no orçamento — em `campaigns/[id]/send`.
- ✅ **Fase 2 — Templates Meta:**
  - `0032_whatsapp_template_meta.sql` (meta_status/category/language/…).
  - `createWhatsappCloudTemplate` + `syncMetaTemplateStatuses` + `toMetaBody`.
  - `POST /templates/[id]/submit` e `POST /templates/sync`.
  - UI na aba Templates: submeter à Meta (categoria), badge de status, sincronizar.
- ✅ **Fase 3 — Ações no card:**
  - `CRMConversationDrawer` (thread + compor + picker de template) no `CRMModal`.
  - `/api/whatsapp/send` aceita `templateId` (aprovado→Cloud; senão renderiza→Baileys).
- ✅ **Fase 4 — Cockpit:**
  - `GET /api/whatsapp/cockpit` (saúde Baileys + Cloud, uso/cap, guard rails).
  - `CRMWhatsappView` reescrito: dois canais, uso do dia, guard rails, deep-links,
    telemetria de assessor.
- ✅ **Fase 0 (VPS):** **deployado e no ar** em `161.35.100.177:3001`.
  - `server.js` reescrito p/ produção: inbound webhook → `/api/whatsapp/inbound`,
    `/campaign-send` (com mídia + enquete), **jitter** 8–25s, e **guard de token**
    (`API_TOKEN` / header `x-vps-token`) — porta pública protegida.
  - `systemd` (`whatsapp-crm.service`, auto-restart + boot), Node 20, `ufw`
    (SSH + 3001). Sessão em estado `qr`, aguardando scan.
  - Next envia o token via `src/lib/whatsapp-vps.ts` (`vpsHeaders`) em todas as
    chamadas ao VPS.
  - Deploy via `deploy/bootstrap.sh`; playbook em `DEPLOY.md`.
  - **Pendente do usuário:** escanear o QR (cockpit, local ou prod) e replicar os
    envs na Vercel.
- 🟡 **Cloud API:** env (`WHATSAPP_CLOUD_*` + `WHATSAPP_GROUP_TASK_SECRET`) wired
  no `.env.local`. **Token Meta fornecido está EXPIRADO** (era embedded-signup,
  curto) — trocar por um **System User token permanente** e replicar na Vercel.

### Refinamentos conhecidos (não bloqueiam)

- Jitter real no loop de massa do Baileys vive no VPS (4s fixo hoje); o helper
  `jitterDelayMs` está pronto para quando o `server.js` for atualizado.
- UI para **editar** os guard rails (hoje só leitura no cockpit; valores em
  `site_settings.whatsapp_guardrails`).
- Gating de campanha Cloud a só-templates-aprovados na UI de Campanhas (o backend
  já tem o status; a seleção ainda não filtra).

---

## 1. Princípio central: um gateway, dois transportes, roteamento por política

Hoje cada caminho de envio fala direto com um transporte:

- `crm-whatsapp-assessor.ts` → `POST {VPS}/send-direct` (Baileys, fixo)
- `campaigns/[id]/send/route.ts` → Cloud API **se configurado**, senão `{VPS}/campaign-send`
- bot inbound → resposta inline pelo `/api/whatsapp/inbound`

Isso espalha regra de negócio (anti-ban, opt-out, log) por vários lugares e torna
impossível ter um teto único. A proposta é **um único ponto de saída**:

```
  CRM card / Assessor / Campanha / Bot
                │
                ▼
      ┌───────────────────────┐
      │   whatsapp-gateway.ts │  ← política + guard rails + log unificado
      └───────────┬───────────┘
        roteamento │
        ┌──────────┴───────────┐
        ▼                      ▼
   Baileys (VPS)         Cloud API (oficial)
   canal "quente"        canal "frio/escala"
```

Toda mensagem que sai do sistema passa por `enqueueOutbound(...)` no gateway. O
gateway decide o transporte, aplica os guard rails **antes** de chamar o transporte
e grava em `whatsapp_messages` com a coluna `channel`.

---

## 2. Os dois canais e quando usar cada um (a regra que você descreveu)

| Situação | Canal | Por quê |
|---|---|---|
| Resposta 1:1 a quem nos mandou msg **nas últimas 24h** (sessão aberta) | **Baileys** | Grátis, instantâneo, texto livre, conversa natural |
| Mensagem 1:1 para contato **frio** (fora das 24h) | **Cloud API** + template aprovado | Fora da janela, só template passa; sem risco de ban |
| **Disparo em massa / marketing** | **Cloud API** | Não toma ban; Meta cobra por conversa mas é seguro em escala |
| Notificação interna pequena (handoff p/ número do próprio assessor) | **Baileys** | Volume baixo, número conhecido, instantâneo |
| Conversa do Inbox (operador respondendo lead) | **Baileys** se janela aberta; senão template via Cloud | Mantém histórico no mesmo número |

**Regra de fallback do gateway:**
1. Se a política manda Baileys mas o VPS está `disconnected` **e** a mensagem é
   elegível a template → cai pra Cloud.
2. Se manda Cloud mas Cloud não está configurado → segura na fila (`held`) e alerta.
3. Massa **nunca** cai pra Baileys (proteção dura contra ban).

> A "janela de 24h" é derivada de `crm_leads.last_whatsapp_at` + última inbound em
> `whatsapp_messages` (direction='inbound'). O gateway calcula `sessionOpen(lead)`.

---

## 3. O Dispatch Gateway (coração) — responsabilidades

`src/lib/whatsapp-gateway.ts` (novo). API única:

```ts
enqueueOutbound({
  to: { phone, leadId?, name? },
  content: { kind: 'text'|'template'|'media'|'poll', ... },
  intent: 'crm_reply'|'assessor'|'campaign'|'bot'|'broadcast',
  channelHint?: 'baileys'|'cloud'|'auto',   // default 'auto'
  campaignId?, templateId?, origin
}) → { channel, status: 'sent'|'queued'|'held'|'blocked', reason? }
```

Responsabilidades, **em ordem**:
1. **Normalizar** telefone (reusa `normalizePhone`/`phoneVariants` de `whatsapp-central.ts`).
2. **Checar opt-out** (`whatsapp_optouts` + `crm_leads.optout_whatsapp`) → `blocked`.
3. **Resolver canal** pela política da seção 2.
4. **Aplicar guard rails** (seção 4) → pode virar `held`/`blocked`.
5. **Chamar o transporte** (Baileys `/send-direct` ou `postCloudMessage`).
6. **Logar** em `whatsapp_messages` com `channel`, `intent`, `status`.
7. **Atualizar** `crm_leads.last_whatsapp_at`.

Todos os caminhos atuais (`maybeNotifyAssessorOnLeadStage`, campaign send, bot)
passam a chamar o gateway em vez de falar direto com o transporte. Sem regressão:
o gateway encapsula o que esses caminhos já faziam, só que com teto único.

---

## 4. Guard rails anti-ban (o "não tomar ban")

Aplicados no gateway. A maioria importa para o **Baileys** (número pessoal, banível);
no Cloud servem para qualidade/custo. Configuráveis em `site_settings.whatsapp_guardrails`.

| # | Guard rail | Regra proposta | Estado hoje |
|---|---|---|---|
| 1 | **Opt-out** | Bloqueia se número em `whatsapp_optouts` ou lead `optout_whatsapp=true` | Parcial (só campanha) → centralizar |
| 2 | **Rate limit c/ jitter** | Baileys: intervalo aleatório 8–25s (não fixo 4s); máx N/min | Só 4s fixo |
| 3 | **Cap diário + warmup** | Número novo/reconectado começa baixo (ex: 30/dia) e sobe +20/dia até teto (ex: 300/dia). Contador em `whatsapp_send_counters` | Inexistente |
| 4 | **Janela de horário** | Disparos não-transacionais só em horário comercial (reusa `isWithinAllowedHours`) | Existe só p/ bot |
| 5 | **Dedup/cooldown** | Não repetir mesmo número na mesma campanha/template dentro de X h | Inexistente |
| 6 | **Variação de conteúdo** | Massa por Baileys: pequenas variações de texto (spintax leve) p/ não ter fingerprint idêntico. Cloud usa template (não precisa) | Inexistente |
| 7 | **Lotes humanizados** | Massa: lotes de ~20–40 com pausa maior entre lotes | Fila sequencial simples |
| 8 | **Monitor de qualidade** | Cloud: ler `quality_rating` + messaging limit tier do número; Baileys: saúde de conexão. Auto-pausar canal se cair p/ RED/desconectar | Inexistente |
| 9 | **Checagem onWhatsApp** | Confirmar que número existe antes de enviar | Já existe no Baileys |

**Auto-pausa inteligente:** se o monitor detectar `quality_rating=RED`, pico de
falhas, ou desconexão repetida, o gateway entra em modo `held` para `broadcast` e
alerta no cockpit — em vez de continuar disparando e queimar o número.

---

## 5. Ciclo de vida de templates Meta (submissão p/ aprovação) — **lacuna nova**

Hoje `whatsapp-cloud-api.ts` só **lê** templates aprovados (`fetchWhatsappCloudTemplates`)
e sincroniza p/ `whatsapp_templates`. Falta **criar e submeter**.

**Backend (novo em `whatsapp-cloud-api.ts`):**
- `createWhatsappCloudTemplate({ name, category, language, components })`
  → `POST /{WABA_ID}/message_templates` (category MARKETING|UTILITY|AUTHENTICATION).
- `getWhatsappCloudTemplateStatus(name)` → polling de status.
- **Webhook** `message_template_status_update` (estender `/api/whatsapp/central/templates`
  ou novo route) → atualiza status local quando a Meta aprova/rejeita.

**Modelo:** estender `whatsapp_templates` com:
`meta_template_id`, `meta_status` (LOCAL|PENDING|APPROVED|REJECTED), `meta_category`,
`meta_language`, `meta_rejected_reason`, `components` (JSONB).

**UI (aba Templates da Central):** botão "Submeter à Meta" → escolhe categoria,
idioma, corpo com variáveis `{{1}}` → submete → mostra badge de status. **Só
templates `APPROVED` ficam selecionáveis para campanhas de massa via Cloud.**

---

## 6. Integração com os cards do CRM (ações por lead)

Hoje `CRMModal.tsx` só tem o campo "Celular / WhatsApp" — nenhuma ação. Adicionar:

- **Botão "Conversa"** no card/modal → abre um **drawer de conversa** que lê o
  thread de `whatsapp_messages` daquele `lead_id` (inbound+outbound) e tem caixa de
  compor. Enviar → gateway (`intent: 'crm_reply'`): Baileys se sessão aberta, senão
  exige template (mostra aviso "fora da janela de 24h, escolha um template").
- **Botão "Template"** → escolhe template aprovado → gateway roteia p/ Cloud.
- **Badge de status** no card: sessão aberta (verde) / fora da janela / opt-out / handoff.
- **Bulk (seleção no kanban/lista)** → "Criar campanha" pré-preenchida com os leads
  selecionados como segmento → fluxo de Campanhas (Cloud massa).

Reusa componentes existentes: `CRMContactsHistory.tsx` (já existe) como base do thread.

---

## 7. Cockpit — a aba WhatsApp do CRM redesenhada

`CRMWhatsappView.tsx` deixa de ser stub e vira o **painel operacional**. Não duplica a
Central; faz deep-link pra ela na edição profunda.

**Layout do cockpit:**
1. **Saúde dos 2 canais** (lado a lado):
   - *Baileys (VPS):* status/QR, saúde de conexão, **uso do dia vs cap** (ex: 84/300),
     fase de warmup.
   - *Cloud API:* número, `quality_rating` (GREEN/YELLOW/RED), tier de limite, configurado?
2. **Guard rails ativos** (resumo + toggle de pausa por canal).
3. **Encaminhamento p/ assessor** (mantém o card atual de telemetria).
4. **Atalhos**: "Inbox", "Templates", "Campanhas", "Fluxo" → deep-link `/sistema/whatsapp?tab=...`.
5. **Últimos disparos** (já existe) + filtro por canal.

A Central (`/sistema/whatsapp`) continua sendo onde se **edita** fluxo, cria template,
monta campanha. O cockpit é onde se **opera e vigia**.

---

## 8. Modelo de dados — o que existe e o que adicionar

**Já existe (migration 0010):** `whatsapp_messages` (log inbound+outbound),
`whatsapp_templates` (+media/poll), `whatsapp_campaigns/_steps/_recipients`,
`whatsapp_flows`, `whatsapp_optouts`, `whatsapp_auth`. `crm_leads` já tem
`optout_whatsapp`, `handoff_humano`, `interesse_principal`, `last_whatsapp_at`,
`tags_whatsapp`.

**Adicionar (nova migration 0029):**
- `whatsapp_messages.channel` TEXT ('baileys'|'cloud') + `intent` TEXT.
- `whatsapp_templates`: colunas Meta da seção 5.
- `whatsapp_send_counters` (novo): `channel`, `day` (date), `sent_count`,
  `warmup_cap` — base do cap diário/warmup.
- `site_settings.whatsapp_guardrails` (JSONB): tetos, jitter, horário, warmup ramp.

---

## 9. Reconexão do VPS (você ficou em dúvida de como alcançar)

Hoje `WHATSAPP_SERVER_URL` aponta para um **Cloudflare quick tunnel** criado por
`scripts/reactivate-crm-whatsapp.ps1`, que roda o Baileys **localmente** + túnel
efêmero. Quick tunnel troca de URL a cada reinício → frágil pra produção.

**Recomendação (com o VPS que você liberou):**
1. Deployar `whatsapp-crm-server/server.js` **no VPS** sob `pm2` (auto-restart) ou `systemd`.
2. Pôr atrás de um reverse proxy (Caddy/Nginx) com **subdomínio fixo + HTTPS**
   (ex: `https://wa.bulaassessoria.com`), protegido por um header secreto.
3. Apontar `WHATSAPP_SERVER_URL=https://wa.bulaassessoria.com` na Vercel (estável,
   sem túnel efêmero).
4. Persistir a auth do Baileys (hoje `useMultiFileAuthState` em disco; mover p/
   `whatsapp_auth` no Supabase, que já existe, evita perder sessão em redeploy).

> Para eu finalizar o passo a passo de deploy preciso só do **host/IP do VPS e SO**
> (não da senha). Posso entregar um script de provisionamento (pm2 + Caddy) pronto.

---

## 10. Plano de execução por fases (quando autorizar a implementar)

- **Fase 0 — Reconectar VPS:** deploy `server.js` no VPS com URL estável; escanear QR;
  canal Baileys verde. (Ops + script de provisionamento.)
- **Fase 1 — Gateway + guard rails:** `whatsapp-gateway.ts`, migration 0029
  (channel/counters/guardrails), refatorar assessor+campanha+bot p/ usar o gateway.
  Entrega o "não tomar ban" mesmo sem UI nova.
- **Fase 2 — Templates Meta:** create/submit/status + webhook + UI na aba Templates;
  travar massa Cloud a templates aprovados.
- **Fase 3 — Ações no card:** drawer de conversa + enviar template + badge + bulk→campanha.
- **Fase 4 — Cockpit:** redesenhar `CRMWhatsappView` (saúde dos 2 canais, guard rails,
  monitor de qualidade, deep-links pra Central).

Cada fase é entregável e validável isoladamente. Sugiro a ordem 0→1→2→3→4: Fase 1
protege o número antes de qualquer volume; Fase 0 é pré-requisito operacional.

---

## 11. Decisões em aberto / riscos

- **Custo Cloud API:** Meta cobra por conversa de marketing. Massa via Cloud é segura
  mas tem custo — vale um teto de gasto/dia no guard rail.
- **Janela de 24h:** depende de inbound registrada; se o VPS ficou off, sessões
  "abertas" podem estar desatualizadas. O gateway deve ser conservador (na dúvida, template).
- **Número do Baileys vs número oficial:** idealmente **números diferentes** — o
  pessoal (Baileys) para conversa quente, o oficial (Cloud) para massa. Confirmar se
  são o mesmo número (se forem, a estratégia de canais muda).
- **Warmup:** se o número Baileys é antigo e já aquecido, o cap inicial pode ser
  maior; se for novo, começar bem baixo.
