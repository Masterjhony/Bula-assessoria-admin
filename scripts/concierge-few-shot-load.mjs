/**
 * CARREGA os exemplos de ouro (few-shot) revisados na config do concierge.
 *
 * Lê um JSON (o que o minerador gerou, já aparado por um humano) e grava em
 * site_settings.crm_concierge.fewShots — de onde runConcierge() os injeta no
 * prompt filtrados pelo segmento do lead.
 *
 *   node scripts/concierge-few-shot-load.mjs outputs/concierge-few-shot-2026-07-17.json
 *   node scripts/concierge-few-shot-load.mjs <arquivo.json> --dry   # só mostra, não grava
 *   node scripts/concierge-few-shot-load.mjs --clear                # zera os exemplos
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (!m) continue
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        if (!(m[1] in process.env)) process.env[m[1]] = v
    }
}

const CONCIERGE_KEY = 'crm_concierge'
const VALIDOS = ['iniciante', 'produtor_comercial', 'criador_po', 'indefinido', 'qualquer']
const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const CLEAR = args.includes('--clear')
const file = args.find(a => !a.startsWith('--'))

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Config atual (não sobrescreve os outros campos).
const { data: cur } = await sb.from('site_settings').select('value').eq('key', CONCIERGE_KEY).maybeSingle()
const config = (cur?.value ?? {})

let fewShots = []
if (CLEAR) {
    console.log('Zerando os exemplos de ouro.')
} else {
    if (!file) { console.error('Informe o JSON: node scripts/concierge-few-shot-load.mjs <arquivo.json>'); process.exit(1) }
    if (!fs.existsSync(file)) { console.error('Arquivo não encontrado:', file); process.exit(1) }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(raw)) { console.error('O JSON precisa ser uma lista de exemplos.'); process.exit(1) }
    for (const r of raw) {
        const gatilho = String(r?.gatilho ?? '').trim()
        const resposta = String(r?.resposta ?? '').trim()
        if (!gatilho || !resposta) continue
        const seg = String(r?.segmento ?? '').trim()
        fewShots.push({
            tema: String(r?.tema ?? 'outro').trim() || 'outro',
            segmento: VALIDOS.includes(seg) ? seg : 'qualquer',
            gatilho, resposta,
        })
    }
    console.log(`${fewShots.length} exemplos válidos (de ${raw.length} no arquivo).`)
    const porTema = {}
    for (const e of fewShots) porTema[e.tema] = (porTema[e.tema] || 0) + 1
    console.log('Por tema:', JSON.stringify(porTema))
}

if (DRY) { console.log('\n[--dry] nada gravado.'); process.exit(0) }

const value = { ...config, fewShots }
const { error } = await sb.from('site_settings')
    .upsert({ key: CONCIERGE_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
if (error) { console.error('Erro ao gravar:', error.message); process.exit(1) }
console.log(`\n✔ Gravado em site_settings.${CONCIERGE_KEY}.fewShots (${fewShots.length} exemplos).`)
console.log('  A próxima resposta do concierge já usa os exemplos do segmento do lead.')
