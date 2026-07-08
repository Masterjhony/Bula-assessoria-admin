/**
 * Saneamento pós-bug do cap-1000 no import da planilha (08/07/2026):
 *
 *  1. BACKFILL de telefones: crm_leads.telefone/celular gravados formatados
 *     ("(22) 98108-0075") viram o canônico só-dígitos com DDI (5522981080075) —
 *     é o formato das whatsapp_messages; sem isso o vínculo conversa↔lead falha.
 *  2. DEDUP de leads: o import via cron enxergava só 1000 dos 15k+ leads e
 *     recriava leads existentes (novo card + welcome de novo). Remove as cópias
 *     criadas na janela do bug (>= 2026-07-07, origem planilha, ENTRADA, sem
 *     docs), mantendo o lead MAIS ANTIGO e re-apontando as mensagens pra ele.
 *     Backup completo das linhas removidas em outputs/.
 *
 *   node scripts/fix-telefones-e-dups.mjs           # dry-run (mostra o plano)
 *   node scripts/fix-telefones-e-dups.mjs --apply   # aplica
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
const APPLY = process.argv.includes('--apply')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function canonPhone(v) {
    const d = String(v || '').replace(/\D/g, '')
    if (!d) return null
    if (d.startsWith('55') && d.length >= 12 && d.length <= 13) return d
    if (d.length === 10 || d.length === 11) return `55${d}`
    return d
}

// ── carrega TODOS os leads (paginado) ────────────────────────────────────────
const leads = []
for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
        .from('crm_leads')
        .select('id, nome, telefone, celular, email, origem, status, created_at, contact_count, arquivado')
        .order('created_at', { ascending: true })
        .range(from, from + 999)
    if (error) { console.error(error.message); process.exit(1) }
    leads.push(...(data ?? []))
    if (!data || data.length < 1000) break
}
console.log(`Total de leads: ${leads.length}`)

// ── 1. backfill de telefones formatados ─────────────────────────────────────
const backfill = []
for (const l of leads) {
    const patch = {}
    for (const col of ['telefone', 'celular']) {
        const raw = l[col]
        if (!raw) continue
        if (/^\d+$/.test(String(raw).trim())) {
            // já é dígito puro — só completa DDI se faltou
            const canon = canonPhone(raw)
            if (canon && canon !== String(raw).trim()) patch[col] = canon
            continue
        }
        const canon = canonPhone(raw)
        if (canon) patch[col] = canon
    }
    if (Object.keys(patch).length) backfill.push({ id: l.id, nome: l.nome, patch })
}
console.log(`\n1) BACKFILL: ${backfill.length} lead(s) com telefone/celular fora do formato canônico`)
for (const b of backfill.slice(0, 5)) console.log(`   ex.: ${b.nome} → ${JSON.stringify(b.patch)}`)

// ── 2. duplicatas da janela do bug ───────────────────────────────────────────
const byPhone = new Map()
for (const l of leads) {
    const key = canonPhone(l.celular) || canonPhone(l.telefone)
    if (!key) continue
    if (!byPhone.has(key)) byPhone.set(key, [])
    byPhone.get(key).push(l)
}

const toDelete = []
for (const [phone, group] of byPhone) {
    if (group.length < 2) continue
    // mantém o mais antigo; candidatas a remoção = cópias da janela do bug
    const sorted = [...group].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const keeper = sorted[0]
    for (const dup of sorted.slice(1)) {
        const isBugWindow = dup.created_at >= '2026-07-07'
        const isPlanilha = String(dup.origem || '').startsWith('Planilha — Cópia de LEADS BULA')
        const isEntrada = String(dup.status || '') === 'ENTRADA'
        const semInteracao = !dup.contact_count || dup.contact_count === 0
        if (isBugWindow && isPlanilha && isEntrada && semInteracao) {
            toDelete.push({ phone, keeper: { id: keeper.id, nome: keeper.nome, created_at: keeper.created_at }, dup })
        }
    }
}
console.log(`\n2) DUPLICATAS na janela do bug: ${toDelete.length} lead(s) a remover (mantendo o original)`)
for (const d of toDelete.slice(0, 8)) {
    console.log(`   ${d.dup.nome} (${d.phone}) — dup ${d.dup.created_at.slice(0, 16)} → mantém ${d.keeper.created_at.slice(0, 16)}`)
}

if (!APPLY) { console.log('\n[DRY-RUN] Nada aplicado. Rode com --apply.'); process.exit(0) }

// ── aplica ───────────────────────────────────────────────────────────────────
console.log('\nAplicando…')
let bOk = 0
for (const b of backfill) {
    const { error } = await sb.from('crm_leads').update(b.patch).eq('id', b.id)
    if (error) console.warn(`  backfill falhou ${b.id}: ${error.message}`)
    else bOk++
}
console.log(`  backfill: ${bOk}/${backfill.length}`)

// backup antes de remover
const hoje = new Date().toISOString().slice(0, 10)
const outDir = path.join(ROOT, 'outputs')
fs.mkdirSync(outDir, { recursive: true })
if (toDelete.length) {
    const ids = toDelete.map(d => d.dup.id)
    const { data: fullRows } = await sb.from('crm_leads').select('*').in('id', ids)
    fs.writeFileSync(path.join(outDir, `leads-dups-removidos-${hoje}.json`), JSON.stringify(fullRows ?? [], null, 1))
    console.log(`  backup: outputs/leads-dups-removidos-${hoje}.json (${(fullRows ?? []).length} linhas)`)
}

let dOk = 0
for (const d of toDelete) {
    // re-aponta mensagens do dup para o lead original (histórico não se perde)
    await sb.from('whatsapp_messages').update({ lead_id: d.keeper.id }).eq('lead_id', d.dup.id)
    const { error } = await sb.from('crm_leads').delete().eq('id', d.dup.id)
    if (error) {
        // FK inesperada? arquiva em vez de deixar duplicado à mostra
        console.warn(`  delete falhou ${d.dup.id} (${error.message}) — arquivando`)
        await sb.from('crm_leads').update({ arquivado: true }).eq('id', d.dup.id)
    } else dOk++
}
console.log(`  duplicatas removidas: ${dOk}/${toDelete.length}`)
console.log('\n✔ Saneamento concluído.')
