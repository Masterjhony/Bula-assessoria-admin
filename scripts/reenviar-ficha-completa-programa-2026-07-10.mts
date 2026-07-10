/**
 * Re-posta a FICHA COMPLETA ATUALIZADA na Programa Leilões para os cadastros
 * pendentes que já conformam à régua da Márcia (Nome, CPF, I.E., endereço,
 * telefone) — corrigindo as fichas antigas que foram enviadas incompletas.
 *
 * Só toca em cadastros 'enviado' (não recusados/aprovados) na Programa, cita o
 * mesmo código e anexa os documentos que o lead tiver. Não duplica cadastro.
 *
 *   npx tsx scripts/reenviar-ficha-completa-programa-2026-07-10.mts          # dry-run
 *   npx tsx scripts/reenviar-ficha-completa-programa-2026-07-10.mts --send   # envia
 */
import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
import { createClient } from '@supabase/supabase-js'
import { computeHabilitacaoChecklist } from '../src/lib/crm-habilitacao'
import { ieDispensadaParaLead } from '../src/lib/concierge-campanha'
import { reenviarFichaAtualizada } from '../src/lib/leiloeira-whatsapp-cadastro'

const SEND = process.argv.includes('--send')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const limpo = (v: unknown) => { const s = String(v ?? '').trim(); return /^(null|undefined|nulo|n\/a|-)$/i.test(s) ? '' : s }
const cpfOk = (v: unknown) => String(v ?? '').replace(/\D/g, '').length === 11

const { data: leil } = await sb.from('leiloeiras').select('id, nome')
const programaId = (leil ?? []).find(l => /programa/i.test(l.nome))?.id

const { data: cads } = await sb.from('cliente_leiloeira_cadastro').select('crm_lead_id, status, leiloeira_id').not('crm_lead_id', 'is', null)
// leads com cadastro 'enviado' na PROGRAMA, sem decisão em nenhum lugar
const decididos = new Set((cads ?? []).filter(c => c.status === 'aprovado' || c.status === 'recusado').map(c => c.crm_lead_id))
const naProgramaEnviado = [...new Set((cads ?? [])
    .filter(c => c.leiloeira_id === programaId && c.status === 'enviado' && !decididos.has(c.crm_lead_id))
    .map(c => c.crm_lead_id))]

const conformes: Array<{ id: string; nome: string }> = []
for (const id of naProgramaEnviado) {
    const { data: l } = await sb.from('crm_leads').select('*').eq('id', id).single()
    const xd = l.extra_data ?? {}
    // Régua da Márcia (I.E. de verdade — número ou declarada; NÃO conta dispensa do EAO)
    const nomeOk = /\S+\s+\S+/.test(limpo(l.nome))
    const ieOk = limpo(l.inscricao_estadual).length >= 3 || String(l.tem_inscricao_estadual).toLowerCase() === 'sim'
    const endOk = limpo(xd.endereco_titular).length >= 8
    const foneOk = Boolean(limpo(l.celular) || limpo(l.telefone))
    if (nomeOk && cpfOk(l.cpf) && ieOk && endOk && foneOk) conformes.push({ id, nome: l.nome })
}

console.log(`Conformes à régua da Márcia na Programa (enviado, não decididos): ${conformes.length}`)
conformes.forEach((c, i) => console.log(`  ${i + 1}. ${c.nome}`))

if (!SEND) { console.log('\n[DRY-RUN] Nada enviado. Rode com --send para re-postar a ficha completa.'); process.exit(0) }

console.log('\n=== RE-ENVIANDO FICHA COMPLETA À PROGRAMA ===')
for (const c of conformes) {
    const r = await reenviarFichaAtualizada(sb, c.id, /programa/i)
    if (r.enviados.length) console.log(`  ✓ ${c.nome} → ${r.enviados.map(e => `${e.leiloeira} (${e.codigo}, ${e.anexos} anexo)`).join(', ')}`)
    else console.log(`  ✗ ${c.nome}: ${r.erros.join('; ') || 'nada enviado'}`)
    await new Promise(res => setTimeout(res, 1500))
}
console.log('\n=== FIM ===')
