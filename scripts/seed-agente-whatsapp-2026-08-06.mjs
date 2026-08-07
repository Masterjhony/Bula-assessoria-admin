// Seed da config do agente interno (site_settings.whatsapp_agente).
// Papéis: admin = João e Marcelo (irrestrito); assessor = restrito aos
// próprios leads (campo `assessor` = fragmento que casa com crm_leads.responsavel).
// Uso: node scripts/seed-agente-whatsapp-2026-08-06.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const config = {
    enabled: true,
    session: 'operacional',
    trigger: '@bula', // legado, não usado — em grupo vale a MENÇÃO ao numeroBot
    groupJid: null,
    // Grupos internos onde o agente responde QUANDO MENCIONADO (@ do contato):
    // Notificações/Automações CRM + grupo dos assessores.
    groupJids: ['120363408309548059@g.us', '120363425959659407@g.us'],
    numeroBot: '553184143874', // número do WhatsApp operacional
    lidBot: '241876099711227', // LID do contato (menção pode chegar como @<lid>)
    model: 'anthropic/claude-sonnet-5',
    maxHistory: 30,
    thinkingSeconds: 4,
    numeros: [
        // Admin (irrestrito): SÓ João Eduardo e Marcelo.
        { phone: '5537984044850', nome: 'João', role: 'admin', assessor: null },
        { phone: '5531994149161', nome: 'Marcelo', role: 'admin', assessor: null },
        { phone: '5567998894887', nome: 'João Antônio', role: 'assessor', assessor: 'Antônio' },
        { phone: '5599984901010', nome: 'Douglas', role: 'assessor', assessor: 'Douglas' },
        { phone: '5582981313050', nome: 'Fábio', role: 'assessor', assessor: 'Omena' },
        { phone: '5566999399319', nome: 'Leonardo', role: 'assessor', assessor: 'Serafim' },
        { phone: '5563992224343', nome: 'Lucas', role: 'assessor', assessor: 'Freitas' },
    ],
}

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ('whatsapp_agente', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(config)],
)
const { rows } = await client.query("SELECT value FROM site_settings WHERE key = 'whatsapp_agente'")
console.log('whatsapp_agente gravado:')
console.log(JSON.stringify(rows[0].value, null, 2))
await client.end()
