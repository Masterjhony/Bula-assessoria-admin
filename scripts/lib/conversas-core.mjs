/**
 * NÚCLEO COMPARTILHADO — coleta e enriquece as conversas do atendimento.
 * Usado por scripts/gera-resumo-conversas-atendimento.mjs (resumo geral) e
 * scripts/gera-planilha-por-assessor.mjs (divisão por região/assessor).
 *
 * coletaConversas() devolve as conversas reais (lead respondeu) já cruzadas com
 * qualificação do CRM (cabeças, I.E., interesse, etapa, documentos), analisadas
 * pela IA (resumo/nível de interesse/sinais) e pontuadas com o score de
 * prioridade + flag de "peixe grande". A análise da IA é cacheada em disco por
 * (telefone → id da última mensagem), então rodar de novo sem mensagens novas é
 * instantâneo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ── env (auto-contido: carrega .env ANTES de criar o client) ─────────────────
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
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'
const OR_KEY = process.env.OPENROUTER_API_KEY

// ── helpers ──────────────────────────────────────────────────────────────────
export const strv = (v) => (v == null ? '' : String(v)).trim()
/** Telefone canônico p/ casar variações (com/sem 55, com/sem o 9): DDD + últimos 8. */
export function canon(raw) {
    let d = String(raw || '').replace(/\D/g, '')
    if (!d) return ''
    if (d.startsWith('55') && d.length > 11) d = d.slice(2)
    if (d.length >= 10) return d.slice(0, 2) + d.slice(-8)
    return d
}
export function cabecasNum(s) {
    const m = String(s ?? '').match(/[\d.]+/)
    if (!m) return 0
    const n = parseInt(m[0].replace(/\./g, ''), 10)
    return Number.isFinite(n) ? n : 0
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchAll(table, columns, tune) {
    const out = []
    const size = 1000
    for (let from = 0; ; from += size) {
        let q = sb.from(table).select(columns).range(from, from + size - 1)
        if (tune) q = tune(q)
        const { data, error } = await q
        if (error) throw new Error(`${table}: ${error.message}`)
        out.push(...(data || []))
        if (!data || data.length < size) break
    }
    return out
}

// ── IA ───────────────────────────────────────────────────────────────────────
const SYS = `Você analisa UMA conversa do atendimento por WhatsApp da Bula Assessoria — uma assessoria que ajuda produtores rurais a comprar gado PARCELADO em leilões (habilitação de crédito, cadastro nas leiloeiras). O atendimento inicial é feito por uma IA ("João") que qualifica o lead. Leia a conversa e responda SÓ com JSON válido:
{
 "resumo": "2-3 frases em pt-BR: o que o lead quer, em que pé ficou a conversa e o tom dele",
 "nivel_interesse": "Quente" | "Morno" | "Frio" | "Sem interesse",
 "sinais_compra": "sinais concretos de intenção de compra/urgência, ou 'nenhum'",
 "cabecas": "quantidade de cabeças de gado que o lead mencionou (só número) ou ''",
 "objecoes": "principais dúvidas/objeções do lead, ou 'nenhuma'",
 "proxima_acao": "o próximo passo mais inteligente para converter esse lead"
}
Critério de nível: Quente = demonstrou intenção real/urgência ou avançou no cadastro; Morno = interessado mas ainda avaliando; Frio = respostas curtas/evasivas; Sem interesse = recusou, número errado, ou só respondeu automatismo. Seja honesto e específico.`

function transcript(c, maxMsgs = 60) {
    return c.list.slice(-maxMsgs).map((m) => {
        const who = m.direction === 'inbound' ? 'LEAD' : 'BULA'
        const body = (m.body || (m.media_type ? `[${m.media_type} enviado]` : '')).replace(/\s+/g, ' ').slice(0, 500)
        return `${who}: ${body}`
    }).join('\n')
}
async function analisa(c) {
    const lead = c.lead
    const ctx = lead ? `Contexto do CRM — nome: ${strv(lead.nome) || c.name || '?'}; cabeças cadastradas: ${strv(lead.quantidade_animais) || '?'}; interesse: ${strv(lead.interesse_principal) || strv(lead.interesse) || '?'}; cidade/UF: ${[strv(lead.cidade), strv(lead.estado)].filter(Boolean).join('/') || '?'}.` : ''
    const body = {
        model: MODEL, temperature: 0.2, max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: SYS },
            { role: 'user', content: `${ctx}\n\n── CONVERSA (${c.nIn} falas do lead) ──\n${transcript(c)}` },
        ],
    }
    for (let tries = 0; tries < 3; tries++) {
        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OR_KEY}` },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(45000),
            })
            if (!res.ok) { if (res.status === 429 || res.status >= 500) { await sleep(1500 * (tries + 1)); continue } throw new Error('OR ' + res.status) }
            const data = await res.json()
            let raw = data.choices?.[0]?.message?.content ?? ''
            const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
            if (s >= 0 && e > s) raw = raw.slice(s, e + 1)
            return JSON.parse(raw)
        } catch (err) {
            if (tries === 2) return { _erro: String(err?.message || err) }
            await sleep(1200 * (tries + 1))
        }
    }
    return {}
}

// ── score / etapa / nível ────────────────────────────────────────────────────
const STAGE = (s) => {
    const t = strv(s).toLowerCase()
    if (/cadastro/.test(t)) return { label: 'Cadastro', score: 16 }
    if (/captad|informa/.test(t)) return { label: 'Informações Captadas', score: 12 }
    if (/qualif/.test(t)) return { label: 'Qualificação', score: 8 }
    if (/conex/.test(t)) return { label: 'Conexão', score: 4 }
    if (/entrada/.test(t)) return { label: 'Entrada', score: 2 }
    if (/perd|lost/.test(t)) return { label: 'Perdidos', score: -12 }
    return { label: strv(s) || '—', score: 0 }
}
const NIVEL_SCORE = { 'Quente': 18, 'Morno': 9, 'Frio': 0, 'Sem interesse': -12 }
export function normNivel(v) {
    const t = strv(v).toLowerCase()
    if (t.startsWith('quent')) return 'Quente'
    if (t.startsWith('morn')) return 'Morno'
    if (t.startsWith('fri')) return 'Frio'
    if (t.includes('sem')) return 'Sem interesse'
    return ''
}

/**
 * Coleta e enriquece todas as conversas reais.
 * @param {{semIa?:boolean, max?:number, log?:(s:string)=>void}} opts
 */
export async function coletaConversas(opts = {}) {
    const { semIa = false, max = 0, log = () => {} } = opts

    log('→ Baixando mensagens do WhatsApp…')
    const msgs = await fetchAll(
        'whatsapp_messages',
        'id, phone, name, body, direction, media_type, created_at, lead_id',
        (q) => q.not('phone', 'ilike', '%@g.us%').order('created_at', { ascending: true }),
    )
    log(`  ${msgs.length} mensagens (fora grupos).`)

    const convos = new Map()
    for (const m of msgs) {
        const key = canon(m.phone)
        if (!key) continue
        if (!convos.has(key)) convos.set(key, { key, phone: m.phone, name: '', list: [], leadIds: new Set() })
        const c = convos.get(key)
        c.list.push(m)
        if (m.name && !c.name) c.name = m.name
        if (m.lead_id) c.leadIds.add(m.lead_id)
    }
    let conversas = [...convos.values()]
        .map((c) => {
            const nIn = c.list.filter((m) => m.direction === 'inbound').length
            return { ...c, nIn, nOut: c.list.length - nIn, media: c.list.some((m) => m.media_type) }
        })
        .filter((c) => c.nIn >= 1)
    log(`  ${conversas.length} conversas com resposta do lead.`)

    log('→ Carregando leads e qualificação…')
    const idsFromMsgs = new Set()
    for (const c of conversas) for (const id of c.leadIds) idsFromMsgs.add(id)
    const leadCols = 'id, nome, telefone, celular, email, cpf, inscricao_estadual, tem_inscricao_estadual,' +
        ' estado, cidade, quantidade_animais, interesse, interesse_principal, o_que_busca, momento_pecuaria,' +
        ' is_mql, is_preferencial, status, temperatura, score_serasa, source, origem, campaign,' +
        ' last_whatsapp_at, created_at, extra_data, arquivado'
    const leadsById = new Map()
    const idList = [...idsFromMsgs]
    for (let i = 0; i < idList.length; i += 200) {
        const { data, error } = await sb.from('crm_leads').select(leadCols).in('id', idList.slice(i, i + 200))
        if (error) throw new Error('crm_leads by id: ' + error.message)
        for (const l of data || []) leadsById.set(l.id, l)
    }
    const leadsWaAtivos = await fetchAll('crm_leads', leadCols, (q) => q.not('last_whatsapp_at', 'is', null))
    const phoneIndex = new Map()
    const idx = (l) => { for (const k of [canon(l.celular), canon(l.telefone)]) if (k && !phoneIndex.has(k)) phoneIndex.set(k, l) }
    for (const l of leadsWaAtivos) idx(l)
    for (const l of leadsById.values()) idx(l)
    log(`  ${leadsById.size} leads por conversa + ${leadsWaAtivos.length} com atividade WhatsApp.`)

    const docs = await fetchAll('crm_lead_documentos', 'lead_id, tipo')
    const docsByLead = new Map()
    for (const d of docs) {
        if (!docsByLead.has(d.lead_id)) docsByLead.set(d.lead_id, { count: 0, tipos: new Set() })
        const e = docsByLead.get(d.lead_id); e.count++; if (d.tipo) e.tipos.add(d.tipo)
    }

    for (const c of conversas) {
        let lead = null
        for (const id of c.leadIds) { if (leadsById.has(id)) { lead = leadsById.get(id); break } }
        if (!lead) lead = phoneIndex.get(c.key) || null
        c.lead = lead
    }
    conversas.sort((a, b) => b.nIn - a.nIn)
    if (max > 0) conversas = conversas.slice(0, max)

    // ── IA (com cache em disco) ──────────────────────────────────────────────
    const cachePath = path.join(ROOT, 'outputs', '.cache-conversas-ia.json')
    let cache = {}
    try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) } catch { /* sem cache ainda */ }

    if (!semIa && OR_KEY) {
        const pend = conversas.filter((c) => {
            const cx = cache[c.key]
            c._lastId = c.list.at(-1)?.id ?? ''
            if (cx && cx.lastId === c._lastId && cx.ia) { c.ia = cx.ia; return false }
            return true
        })
        log(`→ IA (${MODEL}): ${conversas.length - pend.length} do cache, ${pend.length} a analisar…`)
        const CONC = 6
        let done = 0
        for (let i = 0; i < pend.length; i += CONC) {
            const lote = pend.slice(i, i + CONC)
            const rs = await Promise.all(lote.map((c) => analisa(c)))
            lote.forEach((c, j) => { c.ia = rs[j] || {}; cache[c.key] = { lastId: c._lastId, ia: c.ia } })
            done += lote.length
            if (done % 30 === 0 || done === pend.length) log(`  ${done}/${pend.length}`)
        }
        try {
            fs.mkdirSync(path.join(ROOT, 'outputs'), { recursive: true })
            fs.writeFileSync(cachePath, JSON.stringify(cache))
        } catch { /* cache é best-effort */ }
    } else {
        for (const c of conversas) c.ia = cache[c.key]?.ia || {}
        log(semIa ? '→ IA pulada (--sem-ia).' : '→ OPENROUTER_API_KEY ausente — seguindo sem IA.')
    }

    // ── score + flag peixe grande ────────────────────────────────────────────
    for (const c of conversas) {
        const l = c.lead || {}, ia = c.ia || {}
        const nivel = normNivel(ia.nivel_interesse)
        const cab = Math.max(cabecasNum(l.quantidade_animais), cabecasNum(ia.cabecas))
        const doc = docsByLead.get(l.id) || { count: 0, tipos: new Set() }
        const temIe = /sim|s\b/i.test(strv(l.tem_inscricao_estadual)) || !!strv(l.inscricao_estadual)
        const st = STAGE(l.status)
        let s = 0
        if (cab >= 500) s += 30; else if (cab >= 200) s += 25; else if (cab >= 100) s += 20
        else if (cab >= 50) s += 12; else if (cab >= 10) s += 7; else if (cab >= 1) s += 4
        if (l.is_mql) s += 12
        if (temIe) s += 7
        if (l.is_preferencial) s += 4
        s += c.nIn >= 15 ? 15 : c.nIn >= 8 ? 12 : c.nIn >= 4 ? 8 : c.nIn >= 2 ? 5 : 2
        s += Math.min(doc.count * 5, 14)
        s += st.score
        s += NIVEL_SCORE[nivel] ?? 0
        c.score = Math.max(0, Math.min(100, Math.round(s)))
        c.cab = cab; c.doc = doc; c.temIe = temIe; c.nivel = nivel; c.stage = st.label
        c.peixe = c.score >= 55 || (cab >= 100 && (nivel === 'Quente' || nivel === 'Morno')) || (l.is_mql && c.nIn >= 6)
    }
    conversas.sort((a, b) => b.score - a.score || b.nIn - a.nIn)
    return { conversas, docsByLead }
}
