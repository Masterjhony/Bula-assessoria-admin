/**
 * Disparo de PRIMEIRO CONTATO para a base fria da Estância Bahia.
 *
 * Público: leads da tag/origem "Estancia Bahia" (listas ETB MT/PA/TO) que NUNCA
 * foram contatados por ninguém — nem nesta linha do CRM, nem em outra linha com
 * o mesmo telefone (a base "Contatos WhatsApp (extração)" tem sobreposição).
 *
 * Template: `bula_oportunidade` (MARKETING, aprovado). Escolhido porque é o único
 * aprovado que NÃO afirma "vi que você demonstrou interesse" — o que seria falso
 * para esta lista — e que NÃO promete condição (30x/frete) que a agenda não
 * confirma para o evento.
 *   {{1}} = primeiro nome   {{2}} = categoria   {{3}} = a oportunidade
 *
 * Ranking (os "mais promissores"): aparecer em 2+ listas independentes vale mais
 * que qualquer outro sinal — é o lead que a Bula/FdB já viu de mais de uma fonte.
 *
 * Dedup por origin: rodar duas vezes não manda duas vezes.
 *
 *   node scripts/disparo-estancia-bahia-frio.mjs                 # dry-run
 *   node scripts/disparo-estancia-bahia-frio.mjs --send          # envia
 *   node scripts/disparo-estancia-bahia-frio.mjs --send --limit 5
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
function loadEnv(file) {
    const p = path.join(ROOT, file)
    if (!fs.existsSync(p)) return
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (!m) continue
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        if (!(m[1] in process.env)) process.env[m[1]] = v
    }
}
loadEnv('.env.local')

const args = process.argv.slice(2)
const SEND = args.includes('--send')
const argVal = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
const ALVO = Number(argVal('--alvo') || 25)
const LIMIT = (() => { const v = argVal('--limit'); return v ? Number(v) : Infinity })()

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const PHONE_ID = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
if (!SUPA_URL || !SERVICE) { console.error('faltam credenciais Supabase'); process.exit(1) }
if (SEND && (!PHONE_ID || !TOKEN)) { console.error('faltam credenciais Cloud API pra enviar'); process.exit(1) }

const supabase = createClient(SUPA_URL, SERVICE)

const THROTTLE_MS = 1500
const TEMPLATE_NAME = 'bula_oportunidade'
const TEMPLATE_LANG = 'pt_BR'
const ORIGIN = 'frio-estancia-bahia:2026-07'
const BOT_STEP = 'primeiro_contato_frio'

// As duas variáveis de conteúdo. Nada aqui pode afirmar o que não sabemos:
// a agenda não confirma 30x/frete grátis para o EAO Baviera, então não citamos.
const VAR_CATEGORIA = 'Touros Nelore P.O.'
const VAR_OPORTUNIDADE = 'leilão de touros neste domingo (12/07), o Mega Evento EAO Baviera, com assessoria da Bula sem custo pra você'

const BODY_TMPL = `Olá, {nome}! 🐂\n\nApareceu uma oportunidade em *{categoria}*: {oportunidade}.\n\nQuer que eu te passe os detalhes, valores e condições?`

/* ── helpers (mesma semântica do resto do projeto) ─────────────────────────── */
function normalizePhone(input) {
    if (!input) return null
    let c = String(input).replace(/\D/g, '')
    if (!c) return null
    if (c.startsWith('55') && c.length >= 12) { /* já tem DDI */ }
    else if (c.length === 10 || c.length === 11) c = `55${c}`
    if (c.length < 12 || c.length > 13) return null
    return c
}
function phoneVariants(phone) {
    const v = new Set(); const d = String(phone).replace(/\D/g, ''); if (!d) return []
    v.add(d); if (d.startsWith('55')) v.add(d.slice(2)); else v.add(`55${d}`)
    const wo = d.startsWith('55') ? d.slice(2) : d
    if (wo.length === 11 && wo[2] === '9') { const x = wo.slice(0, 2) + wo.slice(3); v.add(x); v.add(`55${x}`) }
    else if (wo.length === 10) { const x = wo.slice(0, 2) + '9' + wo.slice(2); v.add(x); v.add(`55${x}`) }
    return [...v]
}
const firstName = full => (full ? String(full).trim().split(/\s+/)[0] : '')
const render = (t, vars) => t.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] == null ? '' : String(vars[k])))
function isJunkPhone(phone) {
    const d = String(phone).replace(/\D/g, ''); const nat = d.startsWith('55') ? d.slice(2) : d
    return new Set(nat.split('')).size <= 2
}
/** Celular (13 dígitos, nono dígito 9) — só ele recebe WhatsApp. */
const celularValido = f => /^55\d{2}9\d{8}$/.test(String(f))
/** Pessoa jurídica: template fala com produtor, não com razão social. */
const EMPRESA = /\b(LTDA|S\.?A\.?|EIRELI|EPP|COMERCIO|COMÉRCIO|AGROPECUARIA|AGROPECUÁRIA|GENETICS|IMOBILIARIA|TRANSPORT|BANCO|SUPERMERCADO)\b/i

/* ── público ───────────────────────────────────────────────────────────────── */
async function pullEstanciaBahia() {
    const rows = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
            .from('crm_leads')
            .select('id,nome,telefone,celular,email,contact_count,last_whatsapp_at,optout_whatsapp,handoff_humano,arquivado,tags_whatsapp,extra_data')
            .filter('extra_data->>origem_raw', 'ilike', '%Estancia Bahia%')
            .order('id')
            .range(from, from + 999)
        if (error) throw new Error(error.message)
        rows.push(...(data ?? []))
        if (!data || data.length < 1000) break
    }
    return rows
}

/** Telefones que já receberam ESTE disparo (dedup para reexecução). */
async function pullAlreadySent() {
    const already = new Set()
    const { data, error } = await supabase
        .from('whatsapp_messages').select('phone')
        .eq('direction', 'outbound').eq('origin', ORIGIN).in('status', ['sent', 'queued'])
    if (error) throw new Error(error.message)
    for (const r of data ?? []) { const p = normalizePhone(r.phone || ''); if (p) already.add(p) }
    return already
}

/**
 * "Nunca contatado" de verdade: o telefone não pode ter NENHUMA mensagem no
 * histórico, nenhum opt-out, e nenhuma OUTRA linha do CRM já trabalhada. Sem
 * esta checagem, um lead da base de extração levaria um "primeiro contato".
 */
async function virgem(lead, fone) {
    const v = phoneVariants(fone)
    const lista = v.map(x => `"${x}"`).join(',')
    const [{ count: msgs }, { count: outs }, { data: outros }] = await Promise.all([
        supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).in('phone', v),
        supabase.from('whatsapp_optouts').select('phone', { count: 'exact', head: true }).in('phone', v),
        supabase.from('crm_leads').select('id,contact_count,last_whatsapp_at,optout_whatsapp')
            .or(`telefone.in.(${lista}),celular.in.(${lista})`),
    ])
    if (msgs > 0 || outs > 0) return false
    return !(outros ?? []).some(o => o.id !== lead.id && ((o.contact_count ?? 0) > 0 || o.last_whatsapp_at || o.optout_whatsapp))
}

/** Score comercial. Estar em 2+ listas é o sinal mais forte que esta base tem. */
function score(lead) {
    const raw = lead.extra_data?.origem_raw ?? ''
    const tags = lead.tags_whatsapp ?? []
    let s = 0; const por = []
    if (raw.includes('|')) { s += 5; por.push('em 2+ listas') }
    if (/Maiores Compradores/i.test(raw)) { s += 4; por.push('maiores compradores') }
    if (lead.extra_data?.tipo === 'comprador') { s += 3; por.push('comprador') }
    if (/Touros/i.test(raw)) { s += 2; por.push('lista de touros') }
    if (tags.includes('uf-ms') || tags.includes('uf-mt')) { s += 2; por.push('MS/MT') }
    if (lead.email) { s += 1; por.push('e-mail') }
    return { s, por }
}

async function main() {
    console.log(`Template: ${TEMPLATE_NAME} (${TEMPLATE_LANG})  {{1}}=nome {{2}}=categoria {{3}}=oportunidade`)
    console.log(`Modo: ${SEND ? '🚨 ENVIO REAL' : 'DRY-RUN (nada é enviado)'}   alvo=${ALVO}\n`)

    const leads = await pullEstanciaBahia()
    const already = await pullAlreadySent()
    console.log(`Estância Bahia: ${leads.length} leads · já receberam este disparo: ${already.size}`)

    const desc = { contatado: 0, semCelular: 0, lixo: 0, empresa: 0, optout: 0, dup: 0, jaRecebeu: 0 }
    const vistos = new Set()
    const cand = []
    for (const l of leads) {
        if (l.optout_whatsapp || l.arquivado || l.handoff_humano) { desc.optout++; continue }
        if ((l.contact_count ?? 0) > 0 || l.last_whatsapp_at) { desc.contatado++; continue }
        const fone = normalizePhone(l.celular || l.telefone)
        if (!fone || !celularValido(fone)) { desc.semCelular++; continue }
        if (isJunkPhone(fone)) { desc.lixo++; continue }
        if (EMPRESA.test(l.nome ?? '')) { desc.empresa++; continue }
        if (vistos.has(fone)) { desc.dup++; continue }
        if (already.has(fone)) { desc.jaRecebeu++; continue }
        vistos.add(fone)
        const { s, por } = score(l)
        cand.push({ ...l, fone, score: s, porque: por })
    }
    cand.sort((a, b) => b.score - a.score || (a.nome ?? '').localeCompare(b.nome ?? ''))
    console.log(`Descartados → ${JSON.stringify(desc)}`)
    console.log(`Candidatos ordenados: ${cand.length}\n`)

    // Confirma "virgindade" só dos melhores, até fechar o alvo (1 query por lead).
    const audience = []
    for (const c of cand) {
        if (audience.length >= ALVO) break
        if (await virgem(c, c.fone)) audience.push(c)
        else console.log(`  ⤫ pulado (tem histórico em outra linha): ${c.nome} ${c.fone}`)
    }
    console.log(`\nPÚBLICO FINAL: ${audience.length}`)

    console.log(`\nPrévia da mensagem:\n${'─'.repeat(66)}`)
    console.log(render(BODY_TMPL, { nome: firstName(audience[0]?.nome) || 'Fulano', categoria: VAR_CATEGORIA, oportunidade: VAR_OPORTUNIDADE }))
    console.log('─'.repeat(66))
    console.log('\nDestinatários:')
    audience.forEach((a, i) => console.log(`${String(i + 1).padStart(2)}. [${a.score}] ${(a.nome ?? '').slice(0, 32).padEnd(32)} ${a.fone}  ${a.porque.join(', ')}`))

    if (!SEND) { console.log(`\n[DRY-RUN] Nada enviado. Rode com --send para disparar.`); return }

    const toSend = audience.slice(0, LIMIT === Infinity ? audience.length : LIMIT)
    console.log(`\n=== ENVIANDO para ${toSend.length} (throttle ${THROTTLE_MS}ms) ===`)
    let sent = 0, failed = 0
    for (let i = 0; i < toSend.length; i++) {
        const a = toSend[i]
        const fname = firstName(a.nome) || 'amigo(a)'
        const bodyLog = render(BODY_TMPL, { nome: fname, categoria: VAR_CATEGORIA, oportunidade: VAR_OPORTUNIDADE })
        const payload = {
            messaging_product: 'whatsapp', recipient_type: 'individual', to: a.fone, type: 'template',
            template: {
                name: TEMPLATE_NAME, language: { code: TEMPLATE_LANG },
                components: [{
                    type: 'body',
                    parameters: [
                        { type: 'text', text: fname },
                        { type: 'text', text: VAR_CATEGORIA },
                        { type: 'text', text: VAR_OPORTUNIDADE },
                    ],
                }],
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
            else { errMsg = json?.error?.message ? `${json.error.message} (code ${json.error.code})` : `HTTP ${res.status}` }
        } catch (e) { errMsg = e?.message || 'fetch_error' }

        await supabase.from('whatsapp_messages').insert({
            phone: a.fone, name: a.nome || 'Contato', body: bodyLog, direction: 'outbound',
            status, channel: 'cloud', intent: 'campaign', origin: ORIGIN, bot_step: BOT_STEP,
            lead_id: a.id, reason: messageId ?? (status === 'failed' ? 'send_failed' : null), error_msg: errMsg,
        })
        if (status === 'sent') {
            sent++
            await supabase.from('crm_leads').update({ last_whatsapp_at: new Date().toISOString() }).eq('id', a.id)
            console.log(`  ✓ ${a.fone} ${fname}`)
        } else { failed++; console.log(`  ✗ ${a.fone} ${fname}: ${errMsg}`) }

        if (i < toSend.length - 1) await new Promise(r => setTimeout(r, THROTTLE_MS))
    }
    console.log(`\n=== FIM === enviados ${sent}  falhas ${failed}  (de ${toSend.length})`)
}

main().catch(e => { console.error(e); process.exit(1) })
