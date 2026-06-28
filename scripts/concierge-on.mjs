/**
 * Liga/desliga o concierge de WhatsApp (IA) no banco (site_settings.crm_concierge).
 * Preserva model/persona já configurados.
 *
 * Uso:  node scripts/concierge-on.mjs on       # ativa (linha única de automação)
 *       node scripts/concierge-on.mjs off      # desativa (volta ao fluxo legado)
 *       node scripts/concierge-on.mjs status   # mostra a config atual
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
    const out = {}
    for (const f of ['.env.local', '.env']) {
        if (!fs.existsSync(f)) continue
        for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
            if (!m) continue
            let v = m[2].trim()
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
            if (!(m[1] in out)) out[m[1]] = v
        }
    }
    return out
}

const env = loadEnvLocal()
const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('❌ Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local'); process.exit(1) }

const action = (process.argv[2] || 'status').toLowerCase()
const supabase = createClient(url, key)
const KEY = 'crm_concierge'

const { data } = await supabase.from('site_settings').select('value').eq('key', KEY).maybeSingle()
const current = data?.value || { enabled: false, model: '', persona: '' }

if (action === 'status') {
    console.log('crm_concierge:', JSON.stringify(current, null, 2))
    process.exit(0)
}

const enabled = action === 'on'
const next = { enabled, model: current.model || '', persona: current.persona || '' }
const { error } = await supabase.from('site_settings').upsert(
    { key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' },
)
if (error) { console.error('❌ Falha ao salvar:', error.message); process.exit(1) }
console.log(`✅ Concierge ${enabled ? 'ATIVADO' : 'desativado'}. Config:`, JSON.stringify(next))
if (enabled && !(env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY)) {
    console.log('⚠️  OPENROUTER_API_KEY ainda ausente — a IA só vai responder quando a chave existir no ambiente (Vercel + .env.local).')
}
