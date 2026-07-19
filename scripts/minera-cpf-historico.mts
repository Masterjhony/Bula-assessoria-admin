/**
 * MINERAÇÃO DE CPF NO HISTÓRICO DE CONVERSAS (custo zero).
 * Leads sem CPF que já conversaram podem ter digitado o CPF antes de a captura
 * automática existir (ela só roda na fase de habilitação, e só desde 07/2026).
 * Varre as mensagens INBOUND, extrai CPF com validação de dígito verificador
 * (extrairCpf, o mesmo do concierge) e regras de precisão:
 *   - candidato FORMATADO (000.000.000-00) vale sempre;
 *   - candidato "cru" (11 dígitos) só vale se a própria msg fala em CPF ou a
 *     msg anterior nossa pediu CPF (contexto), e nunca se for o nº do telefone.
 * Grava cpf + extra_data.cpf_fonte='conversa-historico' (auditável).
 *
 *   npx tsx scripts/minera-cpf-historico.mts            # dry-run
 *   npx tsx scripts/minera-cpf-historico.mts --apply    # grava
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const { extrairCpf } = await import('../src/lib/crm-lead-autofill')
const APPLY = process.argv.includes('--apply')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
function variants(phone: string): Set<string> {
    const v = new Set<string>(); const d = digits(phone); if (!d) return v
    v.add(d); if (d.startsWith('55')) v.add(d.slice(2)); else v.add('55' + d)
    const wo = d.startsWith('55') ? d.slice(2) : d
    if (wo.length === 11 && wo[2] === '9') { const x = wo.slice(0, 2) + wo.slice(3); v.add(x); v.add('55' + x) }
    else if (wo.length === 10) { const x = wo.slice(0, 2) + '9' + wo.slice(2); v.add(x); v.add('55' + x) }
    return v
}

// leads ativos sem CPF, com telefone
const leads: any[] = []
for (let from = 0; ; from += 1000) {
    const { data } = await s.from('crm_leads').select('id, nome, cpf, telefone, celular, extra_data, last_whatsapp_at').eq('arquivado', false).range(from, from + 999)
    if (!data || !data.length) break
    leads.push(...data); if (data.length < 1000) break
}
const alvo = leads.filter(l => digits(l.cpf).length !== 11 && (l.telefone || l.celular) && l.last_whatsapp_at)
const byVariant = new Map<string, any>()
for (const l of alvo) for (const v of variants(l.telefone || l.celular)) byVariant.set(v, l)
console.log(`alvo: ${alvo.length} leads sem CPF que já conversaram`)

// histórico completo (in+out; out serve de contexto "pedimos CPF?")
const msgs: any[] = []
for (let from = 0; ; from += 1000) {
    const { data } = await s.from('whatsapp_messages').select('phone, direction, body, created_at').not('phone', 'is', null).order('created_at', { ascending: true }).range(from, from + 999)
    if (!data || !data.length) break
    msgs.push(...data); if (data.length < 1000) break
}
console.log(`histórico varrido: ${msgs.length} mensagens`)

const byPhone = new Map<string, any[]>()
for (const m of msgs) {
    const p = digits(m.phone)
    if (!p || p.includes('@')) continue
    if (!byPhone.has(p)) byPhone.set(p, [])
    byPhone.get(p)!.push(m)
}

const achados: { lead: any; cpf: string; quando: string; trecho: string; sinal: string }[] = []
const vistos = new Set<string>()
for (const [phone, lista] of byPhone) {
    const lead = byVariant.get(phone)
    if (!lead || vistos.has(lead.id)) continue
    const foneDigits = variants(phone)
    for (let i = 0; i < lista.length; i++) {
        const m = lista[i]
        if (m.direction !== 'inbound') continue
        const body = String(m.body ?? '')
        // Ficha de cadastro encaminhada fala de OUTRA pessoa — nunca minerar dela.
        if (/FICHA P[FJ]|#CAD\b/i.test(body)) continue
        const formatado = /\d{3}[.\s]\d{3}[.\s]\d{3}[-.\s]\d{2}/.test(body)
        const falaCpf = /\bcpf\b/i.test(body)
        const anterior = [...lista.slice(0, i)].reverse().find(x => x.direction === 'outbound')
        const pedimosCpf = anterior ? /\bcpf\b/i.test(String(anterior.body ?? '')) : false
        if (!formatado && !falaCpf && !pedimosCpf) continue
        const cpf = extrairCpf(body)
        if (!cpf) continue
        if (foneDigits.has(cpf) || foneDigits.has('55' + cpf)) continue // é o telefone, não CPF
        achados.push({
            lead, cpf, quando: m.created_at.slice(0, 10),
            trecho: body.replace(/\s+/g, ' ').slice(0, 70),
            sinal: formatado ? 'formatado' : (pedimosCpf ? 'pedimos antes' : 'msg fala CPF'),
        })
        vistos.add(lead.id)
        break
    }
}

console.log(`\nCPFs encontrados no histórico: ${achados.length}`)
for (const a of achados.slice(0, 15)) {
    console.log(`  ${(a.lead.nome || '(sem nome)').slice(0, 22).padEnd(24)} ${a.cpf.slice(0, 3)}*****${a.cpf.slice(-2)}  [${a.sinal}] ${a.quando}  "${a.trecho}"`)
}

if (!APPLY) { console.log('\n[DRY-RUN] Nada gravado. Rode com --apply para gravar.'); process.exit(0) }
let ok = 0
for (const a of achados) {
    const { error } = await s.from('crm_leads').update({
        cpf: a.cpf,
        extra_data: { ...(a.lead.extra_data ?? {}), cpf_fonte: 'conversa-historico', cpf_capturado_at: new Date().toISOString(), cpf_msg_data: a.quando },
    }).eq('id', a.lead.id).is('cpf', null)
    if (!error) ok++
}
// leads cujo cpf é '' em vez de null
for (const a of achados) {
    await s.from('crm_leads').update({
        cpf: a.cpf,
        extra_data: { ...(a.lead.extra_data ?? {}), cpf_fonte: 'conversa-historico', cpf_capturado_at: new Date().toISOString(), cpf_msg_data: a.quando },
    }).eq('id', a.lead.id).eq('cpf', '')
}
console.log(`\n✅ Gravados (cpf antes vazio): ~${ok}+ de ${achados.length}`)
