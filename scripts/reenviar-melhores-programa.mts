/**
 * Envia à Programa Leilões (grupo Baileys) os "melhores por score" que ainda não
 * foram enviados. Dois caminhos:
 *   • já 'enviado' na Programa  → reenviarFichaAtualizada (re-posta com o score).
 *   • ainda não enviado         → submitLeadCadastroToLeiloeiraGroups filtrado
 *                                 só na Programa (submissão nova).
 *
 *   npx tsx scripts/reenviar-melhores-programa.mts          # dry-run
 *   npx tsx scripts/reenviar-melhores-programa.mts --send   # envia
 */
import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
import { createClient } from '@supabase/supabase-js'
import { reenviarFichaAtualizada, submitLeadCadastroToLeiloeiraGroups } from '../src/lib/leiloeira-whatsapp-cadastro'

const SEND = process.argv.includes('--send')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const PROGRAMA = /programa/i

// Régua completa (nome/CPF/I.E./endereço/fone) E COM DOCUMENTOS — vão com anexo.
const ALVOS = [
    'Marcia Guimaraes Medrado', 'Márcio de Vasconcelos Martins',
]

const { data: leads } = await sb.from('crm_leads').select('id, nome').in('nome', ALVOS)
const { data: leil } = await sb.from('leiloeiras').select('id, nome')
const programaId = (leil ?? []).find(l => PROGRAMA.test(l.nome))?.id
const { data: cads } = await sb.from('cliente_leiloeira_cadastro')
    .select('crm_lead_id, status, leiloeira_id').eq('leiloeira_id', programaId)
const enviadoNaPrograma = new Set((cads ?? [])
    .filter(c => c.status === 'enviado').map(c => c.crm_lead_id))

console.log(`Melhores a enviar à Programa: ${leads?.length ?? 0}`)
for (const l of leads ?? []) console.log(`  • ${l.nome} — ${enviadoNaPrograma.has(l.id) ? 're-envio (já enviado)' : 'submissão nova'}`)

if (!SEND) { console.log('\n[DRY-RUN] Nada enviado. Rode com --send.'); process.exit(0) }

console.log('\n=== ENVIANDO À PROGRAMA ===')
for (const l of leads ?? []) {
    if (enviadoNaPrograma.has(l.id)) {
        const r = await reenviarFichaAtualizada(sb, l.id, PROGRAMA)
        if (r.enviados.length) console.log(`  ✓ ${l.nome} (re-envio) → ${r.enviados.map(e => `${e.codigo}, ${e.anexos} anexo`).join(', ')}`)
        else console.log(`  ✗ ${l.nome}: ${r.erros.join('; ') || 'nada enviado'}`)
    } else {
        const r = await submitLeadCadastroToLeiloeiraGroups(sb, l.id, PROGRAMA)
        if (r.sent) console.log(`  ✓ ${l.nome} (nova) → Programa (${r.sent} enviado)`)
        else console.log(`  ✗ ${l.nome}: ${r.skipped.map(s => `${s.leiloeira}: ${s.reason}`).join('; ') || 'nada enviado'}`)
    }
    await new Promise(res => setTimeout(res, 1500))
}
console.log('\n=== FIM ===')
