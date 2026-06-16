#!/usr/bin/env bash
# Bootstrap do servidor Baileys (WhatsApp CRM) num droplet Ubuntu 24.04 limpo.
#
# Pré-requisito: copie a pasta whatsapp-crm-server/ para /opt/whatsapp-crm no VPS
#   scp -r whatsapp-crm-server root@SEU_IP:/opt/whatsapp-crm
# e crie /opt/whatsapp-crm/.env a partir do .env.example (preenchido).
#
# Depois, no VPS (como root):
#   cd /opt/whatsapp-crm && DOMAIN=wa.bulaassessoria.com bash deploy/bootstrap.sh
#
# DOMAIN é opcional: se setado, configura Caddy com HTTPS automático (Let's
# Encrypt) — exige um registro A do DOMAIN apontando para o IP do droplet.
# Sem DOMAIN, o serviço sobe em :PORT e você expõe via túnel (ver DEPLOY.md).
set -euo pipefail

APP_DIR=/opt/whatsapp-crm
DOMAIN="${DOMAIN:-}"

echo "==> [1/6] Pacotes base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg

echo "==> [2/6] Node.js 20 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> [3/6] Dependências do app"
cd "$APP_DIR"
[ -f .env ] || { echo "ERRO: $APP_DIR/.env não existe. Crie a partir do .env.example."; exit 1; }
npm install --omit=dev

echo "==> [4/6] systemd service"
cat > /etc/systemd/system/whatsapp-crm.service <<UNIT
[Unit]
Description=WhatsApp CRM Baileys server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=always
RestartSec=5
User=root
StandardOutput=append:/var/log/whatsapp-crm.log
StandardError=append:/var/log/whatsapp-crm.log

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable whatsapp-crm
systemctl restart whatsapp-crm
echo "    serviço iniciado. Logs: journalctl -u whatsapp-crm -f  (ou /var/log/whatsapp-crm.log)"

if [ -n "$DOMAIN" ]; then
  echo "==> [5/6] Caddy (HTTPS automático) para $DOMAIN"
  if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    apt-get update -y
    apt-get install -y caddy
  fi
  PORT_VAL="$(grep -E '^PORT=' .env | cut -d= -f2 | tr -d '[:space:]')"
  PORT_VAL="${PORT_VAL:-3001}"
  cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
    reverse_proxy 127.0.0.1:$PORT_VAL
}
CADDY
  systemctl restart caddy
  echo "    Caddy no ar. Aponte WHATSAPP_SERVER_URL=https://$DOMAIN no Next/Vercel."
else
  echo "==> [5/6] DOMAIN não setado — pulando Caddy. Exponha via túnel (ver DEPLOY.md)."
fi

echo "==> [6/6] Firewall (opcional)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH || true
  ufw allow 80,443/tcp || true
  echo "    (ufw não foi habilitado automaticamente — rode 'ufw enable' se quiser)"
fi

echo ""
echo "Pronto. Status:  curl -s http://127.0.0.1:\${PORT_VAL:-3001}/status"
echo "QR aparece no painel admin (aba CRM > WhatsApp) assim que WHATSAPP_SERVER_URL apontar pra cá."
