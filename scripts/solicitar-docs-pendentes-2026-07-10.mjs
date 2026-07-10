/**
 * Solicita a DOCUMENTAÇÃO EXTRA dos cadastros pendentes de aprovação.
 *
 * Contexto (10/07/2026): a Programa Leilões (Márcia) passou a analisar SÓ os
 * cadastros com documentação completa — propriedade rural + movimentação
 * comprovada no meio pecuário. Os cadastros já enviados que estão incompletos
 * ficam parados na fila dela. Este script pede ao lead o que falta, priorizando
 * o comprovante de MOVIMENTAÇÃO (GTA/nota de gado/cartão de produtor) — o único
 * item que nenhuma consulta preenche.
 *
 * Público: leads com cadastro em status 'enviado' (aguardando decisão) que
 * ainda não têm o pacote completo. Fora da janela de 24h → template aprovado
 * `documento_pendente` ({{1}}=nome, {{2}}=documento que falta).
 *
 * Dedup por origin: rodar duas vezes não manda duas vezes.
 *
 *   node scripts/solicitar-docs-pendentes-2026-07-10.mjs           # dry-run
 *   node scripts/solicitar-docs-pendentes-2026-07-10.mjs --send    # envia
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const args = process.argv.slice(2)
const SEND = args.includes('--send')
const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const PHONE_ID = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const ORIGIN = 'docs-pendentes-completar:2026-07-10'
const THROTTLE_MS = 2000
const TEMPLATE = 'documento_pendente'
const limpo = v => { const s = String(v ?? '').trim(); return /^(null|undefined|nulo|n\/a|-)$/i.test(s) ? '' : s }
const firstName = full => (full ? String(full).trim().split(/\s+/)[0] : 'produtor(a)')
const normalizePhone = input => {
    let c = String(input ?? '').replace(/\D/g, '')
    if (!(c.startsWith('55') && c.length >= 12) && (c.length === 10 || c.length === 11)) c = `55${c}`
    return c.length >= 12 && c.length <= 13 ? c : null
}

/**
 * O que falta para o cadastro ser ANALISÁVEL — lista oficial de análise de
 * crédito PF da leiloeira (Márcia/Programa, 07/2026).
 */
function faltando(lead, tipos) {
    const xd = lead.extra_data ?? {}
    const t = new Set(tipos)
    const refs = (Array.isArray(xd.referencias) ? xd.referencias : []).filter(Boolean)
    const faltam = []
    if (!t.has('cpf')) faltam.push('identidade')
    if (!t.has('endereco')) faltam.push('endereco')
    if (!t.has('matricula')) faltam.push('matricula')
    if (!t.has('itr')) faltam.push('itr')
    if (!t.has('renda')) faltam.push('renda')
    if (refs.length < 3) faltam.push('referencias')
    return faltam
}

/** Texto do {{2}} — a lista de documentos que a leiloeira exige, em linguagem do produtor. */
function textoDocumento(faltam) {
    const M = {
        identidade: 'documento pessoal com foto + uma selfie segurando o documento',
        endereco: 'comprovante de endereço no seu nome',
        matricula: 'certidão de matrícula atualizada do imóvel rural (do cartório)',
        itr: 'o ITR do imóvel',
        renda: 'comprovante de renda (declaração de Imposto de Renda e extrato bancário dos últimos 3 meses)',
        referencias: '3 referências (comerciais ou pessoais) com telefone',
    }
    const partes = faltam.map(f => M[f]).filter(Boolean)
    // A Meta limita o parâmetro do template; se faltar muita coisa, resume.
    if (partes.length > 3) return `${partes.slice(0, 3).join('; ')}; e mais alguns itens que te explico na sequência`
    return partes.join('; ')
}

// cadastros com lead vinculado — separa pendentes de já aprovados
const { data: cads } = await sb.from('cliente_leiloeira_cadastro')
    .select('crm_lead_id, leiloeira_id, status').not('crm_lead_id', 'is', null)
const aprovadoAlgumLugar = new Set((cads ?? []).filter(c => c.status === 'aprovado').map(c => c.crm_lead_id))
const pendentes = (cads ?? []).filter(c => c.status === 'enviado')
// Quem já foi APROVADO em alguma leiloeira sai: cliente habilitado não é
// incomodado por documento de um cadastro pendente em outra leiloeira.
const leadIds = [...new Set(pendentes.map(c => c.crm_lead_id).filter(id => !aprovadoAlgumLugar.has(id)))]
console.log(`cadastros pendentes (enviado): ${pendentes.length} · leads distintos: ${leadIds.length} (excluídos ${aprovadoAlgumLugar.size} já aprovados)`)

// docs por lead
const docsPorLead = new Map()
for (let off = 0; ; off += 1000) {
    const { data } = await sb.from('crm_lead_documentos').select('lead_id, tipo').in('lead_id', leadIds).range(off, off + 999)
    for (const d of data ?? []) {
        const arr = docsPorLead.get(d.lead_id) ?? []
        arr.push(String(d.tipo || 'outro')); docsPorLead.set(d.lead_id, arr)
    }
    if (!data || data.length < 1000) break
}

// já solicitados neste disparo (dedup)
const jaPedido = new Set()
{
    const { data } = await sb.from('whatsapp_messages').select('phone').eq('origin', ORIGIN).in('status', ['sent', 'queued'])
    for (const r of data ?? []) { const p = normalizePhone(r.phone); if (p) jaPedido.add(p) }
}

const { data: leads } = await sb.from('crm_leads')
    .select('id, nome, telefone, celular, estado, optout_whatsapp, arquivado, extra_data')
    .in('id', leadIds)

const alvos = []
for (const l of leads ?? []) {
    if (l.optout_whatsapp || l.arquivado) continue
    const fone = normalizePhone(l.celular || l.telefone)
    if (!fone) continue
    const tipos = docsPorLead.get(l.id) ?? []
    const faltam = faltando(l, tipos)
    if (!faltam.length) continue // já está completo — nada a pedir
    if (jaPedido.has(fone)) continue
    alvos.push({ id: l.id, nome: l.nome, fone, uf: l.estado, faltam, doc2: textoDocumento(faltam) })
}
alvos.sort((a, b) => a.faltam.length - b.faltam.length)

console.log(`\nleads a solicitar documentação: ${alvos.length}\n`)
alvos.forEach((a, i) => console.log(
    `${String(i + 1).padStart(2)}. ${(a.nome ?? '').slice(0, 30).padEnd(30)} ${a.fone} (${a.uf ?? '—'}) · falta: ${a.faltam.join('+')}`,
))
if (alvos[0]) {
    console.log(`\nPrévia (${alvos[0].nome}):`)
    console.log(`Olá, ${firstName(alvos[0].nome)}! Para concluir seu cadastro, ainda falta um documento: ${alvos[0].doc2}. Pode enviar por aqui mesmo que a gente segue com o processo.`)
}

if (!SEND) { console.log('\n[DRY-RUN] Nada enviado. Rode com --send para solicitar.'); process.exit(0) }
if (!PHONE_ID || !TOKEN) { console.error('faltam credenciais Cloud API'); process.exit(1) }

console.log(`\n=== ENVIANDO ${alvos.length} (throttle ${THROTTLE_MS}ms) ===`)
let sent = 0, failed = 0
for (let i = 0; i < alvos.length; i++) {
    const a = alvos[i]
    const nome = firstName(a.nome)
    const payload = {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: a.fone, type: 'template',
        template: {
            name: TEMPLATE, language: { code: 'pt_BR' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: nome }, { type: 'text', text: a.doc2 }] }],
        },
    }
    let status = 'failed', messageId = null, errMsg = null
    try {
        const res = await fetch(`https://graph.facebook.com/${GRAPH}/${PHONE_ID}/messages`, {
            method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
        })
        const json = await res.json().catch(() => null)
        if (res.ok) { status = 'sent'; messageId = json?.messages?.[0]?.id ?? null }
        else errMsg = json?.error?.message ? `${json.error.message} (code ${json.error.code})` : `HTTP ${res.status}`
    } catch (e) { errMsg = e?.message || 'fetch_error' }

    await sb.from('whatsapp_messages').insert({
        phone: a.fone, name: a.nome || 'Contato',
        body: `Olá, ${nome}! Para concluir seu cadastro, ainda falta um documento: ${a.doc2}. Pode enviar por aqui mesmo que a gente segue com o processo.`,
        direction: 'outbound', status, channel: 'cloud', intent: 'campaign', origin: ORIGIN, bot_step: 'docs_pendentes',
        lead_id: a.id, reason: messageId ?? (status === 'failed' ? 'send_failed' : null), error_msg: errMsg,
    })
    if (status === 'sent') {
        sent++
        await sb.from('crm_leads').update({ last_whatsapp_at: new Date().toISOString() }).eq('id', a.id)
        console.log(`  ✓ ${a.fone} ${nome}`)
    } else { failed++; console.log(`  ✗ ${a.fone} ${nome}: ${errMsg}`) }
    if (i < alvos.length - 1) await new Promise(r => setTimeout(r, THROTTLE_MS))
}
console.log(`\n=== FIM === enviados ${sent} · falhas ${failed}`)
