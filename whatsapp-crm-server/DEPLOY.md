# Deploy do servidor Baileys (WhatsApp CRM) num VPS

Servidor do **canal quente** (Baileys): conversas 1:1, encaminhamento de assessor,
inbound do bot e disparos pequenos. O canal de **massa** é a Cloud API oficial (não
precisa de VPS). Arquitetura completa: `docs/arquitetura-whatsapp-crm.md`.

## Pré-requisitos

- Droplet Ubuntu 24.04 (o de US$6/1GB já basta — Baileys é leve).
- Um subdomínio apontando para o IP do droplet, ex.: `wa.bulaassessoria.com`
  (registro **A** → IP). Necessário para o HTTPS (o painel admin é https e não
  carrega QR de http por mixed-content). Alternativa sem domínio: túnel Cloudflare
  (ver no fim).
- O mesmo `WHATSAPP_GROUP_TASK_SECRET` que está no `.env.local`/Vercel do Next.

## Passo a passo

1. **Copie o app para o VPS** (da sua máquina, na raiz do repo):
   ```bash
   scp -r whatsapp-crm-server root@SEU_IP:/opt/whatsapp-crm
   ```

2. **Crie o `.env` do servidor** no VPS (a partir do exemplo):
   ```bash
   ssh root@SEU_IP
   cd /opt/whatsapp-crm
   cp .env.example .env
   nano .env   # preencha NEXT_API_URL e WEBHOOK_SECRET (= WHATSAPP_GROUP_TASK_SECRET)
   ```

3. **Rode o bootstrap** (instala Node 20, systemd, Caddy com HTTPS):
   ```bash
   DOMAIN=wa.bulaassessoria.com bash deploy/bootstrap.sh
   ```

4. **Aponte o Next para o VPS** — no `.env.local` e na Vercel (produção):
   ```env
   WHATSAPP_SERVER_URL=https://wa.bulaassessoria.com
   ```
   Redeploy na Vercel para valer em produção.

5. **Escaneie o QR**: abra o painel admin → CRM → aba **WhatsApp**. O QR do canal
   Baileys aparece no card "Baileys (VPS)". Escaneie com o **número pessoal/comercial**
   que vai conduzir as conversas quentes (diferente do número oficial da Meta).

6. **Configure o webhook da Meta** (canal Cloud, para inbound da API oficial) — no
   Meta App → WhatsApp → Configuration:
   - Callback URL: `https://admin.bulaassessoria.com/api/whatsapp/inbound` (ou a rota
     de webhook da Cloud, conforme o fluxo) e o Verify Token correspondente.
   > O inbound do **Baileys** já é tratado pelo próprio servidor (event `messages.upsert`
   > → `NEXT_API_URL/api/whatsapp/inbound`). O webhook da Meta é só para a Cloud.

## Operação

```bash
systemctl status whatsapp-crm        # estado
journalctl -u whatsapp-crm -f        # logs ao vivo
systemctl restart whatsapp-crm       # reiniciar
curl -s http://127.0.0.1:3001/status # status local (conn + QR)
```

As sessões ficam em `/opt/whatsapp-crm/auth-sessions/<id>/` (uma pasta por inbox
Baileys) — **faça backup** (perdê-las = re-escanear QR).

## Multi-inbox: migrar a sessão única para o layout multi-sessão

A versão nova gerencia **N sessões Baileys** (mapa por `sessionId`), cada uma com
sua pasta de auth. A sessão histórica (número do João Antonio) vivia em `./auth`
no layout de sessão única. Para preservar o pareamento **sem re-escanear**, basta
mover a pasta com o serviço parado:

```bash
systemctl stop whatsapp-crm
cp -a /opt/whatsapp-crm/auth /opt/whatsapp-crm/auth.bak      # backup
mkdir -p /opt/whatsapp-crm/auth-sessions
mv /opt/whatsapp-crm/auth /opt/whatsapp-crm/auth-sessions/joao
# garanta no .env: SESSIONS_DIR=/opt/whatsapp-crm/auth-sessions e DEFAULT_SESSION_ID=joao
systemctl start whatsapp-crm
curl -s "http://127.0.0.1:3001/status?session=joao"          # deve voltar connected, sem QR
```

> Se você **esquecer** o `mv`, o servidor faz uma adoção automática no 1º boot:
> copia `./auth` (legado) para `auth-sessions/<default>` quando esta ainda não
> existe. O `mv` explícito com o serviço parado é o caminho recomendado (evita
> corrida de escrita de `creds.update`).

Endpoints passam a aceitar `?session=<id>` (sem o parâmetro → sessão default).
Gestão: `GET /sessions` (lista), `POST /sessions {id}` (cria + gera QR),
`DELETE /sessions?session=<id>` (encerra e apaga; a default é protegida).

## Sem domínio? Túnel Cloudflare nomeado (URL estável)

```bash
# no VPS
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
cloudflared tunnel login                 # autentica (1x, abre URL no browser)
cloudflared tunnel create whatsapp-crm
cloudflared tunnel route dns whatsapp-crm wa.bulaassessoria.com
# configure ~/.cloudflared/config.yml apontando para http://localhost:3001 e:
cloudflared tunnel run whatsapp-crm      # (ou como serviço systemd)
```
Difere do quick tunnel antigo (`trycloudflare.com`, URL efêmera): a nomeada é fixa.

## Notas de segurança

- O `.env` do servidor tem o `WEBHOOK_SECRET` — `chmod 600 .env`.
- Não exponha a porta 3001 publicamente; só o Caddy (443) deve ficar aberto.
- Rotacione segredos que tenham trafegado em texto.
