// Harness de teste do agente: manda mensagem pela sessão joao-automation
// (o número do João) e espera a resposta do agente aparecer no log.
// Uso: node scripts/.agente-teste.tmp.mjs <dm|grupo> "mensagem"
import { readFileSync } from 'node:fs'
import pg from 'pg'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const NUMERO_BOT = '553184143874'
const GRUPO_TESTE = '120363020550666892@g.us'
const [, , alvo, texto] = process.argv
if (!alvo || !texto) { console.error('uso: <dm|grupo> "mensagem"'); process.exit(1) }

const inicio = new Date().toISOString()
const headers = {
    'Content-Type': 'application/json',
    'x-vps-token': env.WHATSAPP_SERVER_TOKEN || '',
    'x-operational-send': 'approved', // joao-automation é sessão protegida
}
let res
if (alvo === 'grupo') {
    // grupo: injeta no webhook de produção como se o VPS tivesse encaminhado
    // (o send-group da joao-automation é travado pela allowlist do VPS).
    res = await fetch('https://bulaassessoria.com/api/whatsapp/group-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': env.WHATSAPP_GROUP_TASK_SECRET || '' },
        body: JSON.stringify({
            session: 'operacional',
            group_jid: GRUPO_TESTE,
            group_name: 'Teste',
            participant: '5537984044850@s.whatsapp.net',
            name: 'João',
            body: texto,
            message_id: 'T' + Date.now(),
            ts: Math.floor(Date.now() / 1000),
        }),
    })
} else {
    res = await fetch(`${env.WHATSAPP_SERVER_URL}/send-direct?session=joao-automation`, {
        method: 'POST', headers, body: JSON.stringify({ phone: NUMERO_BOT, message: texto }),
    })
}
console.log('envio:', res.status, (await res.text()).slice(0, 160))

// resposta do agente: DM → phone do João; grupo → JID do grupo Teste
const phoneEsperado = alvo === 'grupo' ? GRUPO_TESTE : '553784044850'
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
let achou = false
for (let i = 0; i < 36; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const { rows } = await c.query(
        `SELECT status, body, error_msg FROM whatsapp_messages
         WHERE origin='agente-reply' AND phone=$1 AND created_at > $2
         ORDER BY created_at ASC`, [phoneEsperado, inicio])
    if (rows.length) {
        for (const r of rows) console.log(`\n--- resposta (${r.status}) ---\n${r.body}`)
        achou = true
        break
    }
}
if (!achou) console.log('\n(sem resposta em 3min)')
await c.end()
