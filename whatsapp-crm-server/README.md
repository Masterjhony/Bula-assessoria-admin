# WhatsApp CRM Server

Servidor Baileys local para a aba WhatsApp do CRM. Ele executa apenas o fluxo de
encaminhamento de leads para usuários da equipe.

Endpoints:

- `GET /status`: status da sessão e QR Code.
- `GET /queue`: tamanho da fila.
- `POST /send-direct`: envia mensagem livre `{ "phone": "...", "message": "..." }`.
- `GET /groups`: lista os grupos de que a sessão participa (`{ id, subject, size }`) — para descobrir o JID do grupo.
- `POST /send-group`: envia para um grupo `{ "groupId": "...@g.us", "message": "..." }` (sem checagem onWhatsApp).
- `POST /pair`: conecta por número (alternativa ao QR) `{ "phone": "5567..." }` → retorna `{ "pairing_code": "XXXXXXXX" }` para digitar no WhatsApp (Aparelhos conectados → Conectar com número).

Uso local:

```bash
cd whatsapp-crm-server
npm install
npm start
```

No `.env.local` do Next, deixe:

```env
WHATSAPP_SERVER_URL=http://localhost:3001
```

A sessão fica salva em `whatsapp-crm-server/auth/`, que não deve ir para o Git.
