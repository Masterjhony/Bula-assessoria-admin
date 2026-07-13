/**
 * RESUMO GERAL DAS CONVERSAS DO ATENDIMENTO (WhatsApp / concierge IA)
 * ------------------------------------------------------------------
 * Varre todas as conversas reais do sistema (leads que de fato responderam),
 * cruza cada uma com a qualificação do CRM (cabeças de gado, I.E., interesse,
 * etapa do funil, documentos enviados) e usa a IA para ler a conversa e dizer,
 * em 2-3 frases, como ela foi + o nível de interesse + sinais de compra.
 *
 * Calcula um SCORE DE PRIORIDADE por lead pra separar os "peixes grandes" —
 * os que mais compensam investir tempo — e escreve uma planilha .xlsx formatada
 * na Área de Trabalho, com 3 abas:
 *   1) Conversas   — tudo, ranqueado por prioridade
 *   2) Peixes Grandes — só os quentes/grandes
 *   3) Panorama    — números gerais
 *
 *   node scripts/gera-resumo-conversas-atendimento.mjs
 *   node scripts/gera-resumo-conversas-atendimento.mjs --sem-ia   # pula a IA (rápido)
 *   node scripts/gera-resumo-conversas-atendimento.mjs --max 100  # limita conversas
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

// ── env ──────────────────────────────────────────────────────────────────────
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

const args = process.argv.slice(2)
const hasFlag = (n) => args.includes(n)
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const SEM_IA = hasFlag('--sem-ia')
const MAX_CONVERSAS = Number(argOf('--max', 0)) || 0
const CONCURRENCY = 6
const MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'
const OR_KEY = process.env.OPENROUTER_API_KEY

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ── helpers ──────────────────────────────────────────────────────────────────
/** Telefone canônico p/ casar variações (com/sem 55, com/sem o 9): DDD + últimos 8. */
function canon(raw) {
    let d = String(raw || '').replace(/\D/g, '')
    if (!d) return ''
    if (d.startsWith('55') && d.length > 11) d = d.slice(2)
    if (d.length >= 10) return d.slice(0, 2) + d.slice(-8)
    return d
}
const strv = (v) => (v == null ? '' : String(v)).trim()
function cabecasNum(s) {
    const m = String(s ?? '').match(/[\d.]+/)
    if (!m) return 0
    const n = parseInt(m[0].replace(/\./g, ''), 10)
    return Number.isFinite(n) ? n : 0
}

/** Puxa TODAS as linhas de uma query paginando (PostgREST corta em 1000). */
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

// ── 1. Todas as mensagens (o log é pequeno, ~10k) ────────────────────────────
console.log('→ Baixando mensagens do WhatsApp…')
const msgs = await fetchAll(
    'whatsapp_messages',
    'phone, name, body, direction, media_type, created_at, lead_id',
    (q) => q.not('phone', 'ilike', '%@g.us%').order('created_at', { ascending: true }),
)
console.log(`  ${msgs.length} mensagens (fora grupos).`)

// ── 2. Agrupa por telefone canônico → conversas ──────────────────────────────
const convos = new Map() // canon → { key, phone, name, list, leadIds:Set }
for (const m of msgs) {
    const key = canon(m.phone)
    if (!key) continue
    if (!convos.has(key)) convos.set(key, { key, phone: m.phone, name: '', list: [], leadIds: new Set() })
    const c = convos.get(key)
    c.list.push(m)
    if (m.name && !c.name) c.name = m.name
    if (m.lead_id) c.leadIds.add(m.lead_id)
}

// Só conversas de verdade: o lead respondeu ao menos 1x.
let conversas = [...convos.values()]
    .map((c) => {
        const nIn = c.list.filter((m) => m.direction === 'inbound').length
        const nOut = c.list.length - nIn
        const media = c.list.some((m) => m.media_type)
        return { ...c, nIn, nOut, media }
    })
    .filter((c) => c.nIn >= 1)
console.log(`  ${conversas.length} conversas com resposta do lead.`)

// ── 3. Leads (dados de qualificação) ─────────────────────────────────────────
console.log('→ Carregando leads e qualificação…')
const idsFromMsgs = new Set()
for (const c of conversas) for (const id of c.leadIds) idsFromMsgs.add(id)

const leadCols = 'id, nome, telefone, celular, email, cpf, inscricao_estadual, tem_inscricao_estadual,' +
    ' estado, cidade, quantidade_animais, interesse, interesse_principal, o_que_busca, momento_pecuaria,' +
    ' is_mql, is_preferencial, status, temperatura, score_serasa, source, origem, campaign,' +
    ' last_whatsapp_at, created_at, extra_data, arquivado'

// Leads referenciados nas conversas (por id) + todos que tiveram atividade de WhatsApp (p/ fallback por telefone)
const leadsById = new Map()
const idList = [...idsFromMsgs]
for (let i = 0; i < idList.length; i += 200) {
    const chunk = idList.slice(i, i + 200)
    const { data, error } = await sb.from('crm_leads').select(leadCols).in('id', chunk)
    if (error) throw new Error('crm_leads by id: ' + error.message)
    for (const l of data || []) leadsById.set(l.id, l)
}
const leadsWaAtivos = await fetchAll('crm_leads', leadCols, (q) => q.not('last_whatsapp_at', 'is', null))
const phoneIndex = new Map()
const indexLeadPhones = (l) => {
    for (const k of [canon(l.celular), canon(l.telefone)]) if (k && !phoneIndex.has(k)) phoneIndex.set(k, l)
}
for (const l of leadsWaAtivos) indexLeadPhones(l)
for (const l of leadsById.values()) indexLeadPhones(l)
console.log(`  ${leadsById.size} leads por conversa + ${leadsWaAtivos.length} com atividade WhatsApp.`)

// ── 4. Documentos por lead ───────────────────────────────────────────────────
const docs = await fetchAll('crm_lead_documentos', 'lead_id, tipo')
const docsByLead = new Map()
for (const d of docs) {
    if (!docsByLead.has(d.lead_id)) docsByLead.set(d.lead_id, { count: 0, tipos: new Set() })
    const e = docsByLead.get(d.lead_id)
    e.count++
    if (d.tipo) e.tipos.add(d.tipo)
}

// Resolve o lead de cada conversa
for (const c of conversas) {
    let lead = null
    for (const id of c.leadIds) { if (leadsById.has(id)) { lead = leadsById.get(id); break } }
    if (!lead) lead = phoneIndex.get(c.key) || null
    c.lead = lead
}

// Ordena por engajamento p/ analisar as mais ricas primeiro; aplica --max se pedido
conversas.sort((a, b) => b.nIn - a.nIn)
if (MAX_CONVERSAS > 0) conversas = conversas.slice(0, MAX_CONVERSAS)

// ── 5. Análise por IA (resumo + interesse + sinais) ──────────────────────────
function transcript(c, maxMsgs = 60) {
    return c.list.slice(-maxMsgs).map((m) => {
        const who = m.direction === 'inbound' ? 'LEAD' : 'BULA'
        const body = (m.body || (m.media_type ? `[${m.media_type} enviado]` : '')).replace(/\s+/g, ' ').slice(0, 500)
        return `${who}: ${body}`
    }).join('\n')
}

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!SEM_IA && OR_KEY) {
    console.log(`→ Analisando ${conversas.length} conversas com IA (${MODEL})…`)
    let done = 0
    for (let i = 0; i < conversas.length; i += CONCURRENCY) {
        const lote = conversas.slice(i, i + CONCURRENCY)
        const rs = await Promise.all(lote.map((c) => analisa(c)))
        lote.forEach((c, j) => { c.ia = rs[j] || {} })
        done += lote.length
        if (done % 30 === 0 || done === conversas.length) console.log(`  ${done}/${conversas.length}`)
    }
} else {
    console.log(SEM_IA ? '→ Pulando IA (--sem-ia).' : '→ OPENROUTER_API_KEY ausente — seguindo sem IA.')
    for (const c of conversas) c.ia = {}
}

// ── 6. Score de prioridade + flag de "peixe grande" ──────────────────────────
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
function normNivel(v) {
    const t = strv(v).toLowerCase()
    if (t.startsWith('quent')) return 'Quente'
    if (t.startsWith('morn')) return 'Morno'
    if (t.startsWith('fri')) return 'Frio'
    if (t.includes('sem')) return 'Sem interesse'
    return ''
}

for (const c of conversas) {
    const l = c.lead || {}
    const ia = c.ia || {}
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
    c.cab = cab
    c.doc = doc
    c.temIe = temIe
    c.nivel = nivel
    c.stage = st.label
    c.peixe = c.score >= 55 || (cab >= 100 && (nivel === 'Quente' || nivel === 'Morno')) || (l.is_mql && c.nIn >= 6)
}
conversas.sort((a, b) => b.score - a.score || b.nIn - a.nIn)

// ── 7. Planilha .xlsx formatada ──────────────────────────────────────────────
console.log('→ Gerando planilha…')
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
wb.created = new Date()

const INK = 'FF141414'      // preto grafite (cabeçalho)
const GOLD = 'FFC9A84C'     // dourado fosco do brandbook (acento cirúrgico)
const ZEBRA = 'FFF5F5F3'
const GOLD_SOFT = 'FFFBF3DA'
const HOT = 'FFF3D9A6'
const WARM = 'FFEFE4C4'
const RED = 'FFF3C6C6'

const COLS = [
    { h: 'Prioridade', k: 'score', w: 11 },
    { h: '🔥', k: 'peixe', w: 5 },
    { h: 'Nome', k: 'nome', w: 26 },
    { h: 'WhatsApp', k: 'wa', w: 22 },
    { h: 'Cidade/UF', k: 'local', w: 18 },
    { h: 'Cabeças', k: 'cab', w: 10 },
    { h: 'Interesse', k: 'interesse', w: 22 },
    { h: 'Nível (IA)', k: 'nivel', w: 13 },
    { h: 'Etapa', k: 'stage', w: 20 },
    { h: 'MQL', k: 'mql', w: 7 },
    { h: 'Tem I.E.', k: 'ie', w: 9 },
    { h: 'Msgs lead', k: 'nIn', w: 10 },
    { h: 'Msgs Bula', k: 'nOut', w: 10 },
    { h: 'Docs', k: 'docs', w: 16 },
    { h: 'Resumo da conversa (IA)', k: 'resumo', w: 60 },
    { h: 'Sinais de compra (IA)', k: 'sinais', w: 34 },
    { h: 'Objeções (IA)', k: 'objecoes', w: 28 },
    { h: 'Próxima ação (IA)', k: 'proxima', w: 40 },
    { h: 'Última interação', k: 'ultima', w: 15 },
    { h: 'Origem/Campanha', k: 'origem', w: 24 },
]

function rowFor(c) {
    const l = c.lead || {}
    const ia = c.ia || {}
    const foneRaw = strv(l.celular) || strv(l.telefone) || strv(c.phone)
    const foneDig = foneRaw.replace(/\D/g, '')
    const wa = foneDig ? `https://wa.me/${foneDig.startsWith('55') ? foneDig : '55' + foneDig}` : ''
    const local = [strv(l.cidade), strv(l.estado)].filter(Boolean).join('/')
    const interesse = strv(l.interesse_principal) || strv(l.interesse) || strv(l.o_que_busca)
    const docsTxt = c.doc.count ? `${c.doc.count} (${[...c.doc.tipos].join(', ')})` : '—'
    const ultima = strv(l.last_whatsapp_at) || strv(c.list.at(-1)?.created_at)
    return {
        score: c.score,
        peixe: c.peixe ? '🔥' : '',
        nome: strv(l.nome) || c.name || '(sem nome)',
        wa: { text: foneRaw || '—', hyperlink: wa || undefined },
        local,
        cab: c.cab || '',
        interesse,
        nivel: c.nivel || (SEM_IA ? '—' : ''),
        stage: c.stage,
        mql: l.is_mql ? 'Sim' : '',
        ie: c.temIe ? 'Sim' : 'Não',
        nIn: c.nIn,
        nOut: c.nOut,
        docs: docsTxt,
        resumo: strv(ia.resumo) || (ia._erro ? '(falha IA)' : ''),
        sinais: strv(ia.sinais_compra),
        objecoes: strv(ia.objecoes),
        proxima: strv(ia.proxima_acao),
        ultima: ultima ? ultima.slice(0, 10) : '',
        origem: [strv(l.origem) || strv(l.source), strv(l.campaign)].filter(Boolean).join(' · '),
    }
}

function styleSheet(ws, rows, title) {
    // Cabeçalho
    ws.columns = COLS.map((c) => ({ header: c.h, key: c.k, width: c.w }))
    const head = ws.getRow(1)
    head.height = 26
    head.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        cell.border = { bottom: { style: 'medium', color: { argb: GOLD } } }
    })
    // Linhas
    rows.forEach((r, i) => {
        const excelRow = ws.addRow(r)
        excelRow.height = 42
        const zebra = i % 2 === 1
        excelRow.eachCell((cell, col) => {
            cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
            if (zebra && !r.peixe) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
            cell.border = { bottom: { style: 'hairline', color: { argb: 'FFDDDDDD' } } }
        })
        if (r.peixe) {
            excelRow.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_SOFT } } })
        }
        // Centraliza colunas curtas
        for (const key of ['score', 'peixe', 'cab', 'nivel', 'mql', 'ie', 'nIn', 'nOut', 'ultima']) {
            const cell = excelRow.getCell(key)
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
        }
        // Prioridade em negrito
        const sc = excelRow.getCell('score'); sc.font = { bold: true, size: 12 }
        // Cor do nível
        const nv = excelRow.getCell('nivel')
        if (r.nivel === 'Quente') nv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOT } }
        else if (r.nivel === 'Morno') nv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARM } }
        else if (r.nivel === 'Sem interesse') nv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } }
        if (r.nivel === 'Quente') nv.font = { bold: true }
        // Link do WhatsApp em azul
        const waCell = excelRow.getCell('wa')
        if (r.wa?.hyperlink) waCell.font = { color: { argb: 'FF1155CC' }, underline: true }
    })
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } }
    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }]
    // Barra de dados na coluna Prioridade
    const last = ws.rowCount
    if (last > 1) {
        ws.addConditionalFormatting({
            ref: `A2:A${last}`,
            rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 100 }], color: { argb: GOLD }, gradient: false }],
        })
    }
}

const wsAll = wb.addWorksheet('Conversas', { views: [{ showGridLines: false }] })
styleSheet(wsAll, conversas.map(rowFor), 'Conversas')

const peixes = conversas.filter((c) => c.peixe)
const wsPeixe = wb.addWorksheet('🔥 Peixes Grandes', { views: [{ showGridLines: false }] })
styleSheet(wsPeixe, peixes.map(rowFor), 'Peixes Grandes')

// ── Panorama ─────────────────────────────────────────────────────────────────
const wsP = wb.addWorksheet('Panorama', { views: [{ showGridLines: false }] })
wsP.columns = [{ width: 42 }, { width: 22 }]
const cont = (fn) => conversas.filter(fn).length
const totalCab = conversas.reduce((a, c) => a + (c.cab || 0), 0)
const panor = [
    ['PANORAMA DAS CONVERSAS DO ATENDIMENTO', ''],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    ['', ''],
    ['Conversas reais (lead respondeu)', conversas.length],
    ['🔥 Peixes grandes', peixes.length],
    ['Leads MQL (≥100 cabeças + I.E.)', cont((c) => c.lead?.is_mql)],
    ['', ''],
    ['Nível QUENTE', cont((c) => c.nivel === 'Quente')],
    ['Nível MORNO', cont((c) => c.nivel === 'Morno')],
    ['Nível FRIO', cont((c) => c.nivel === 'Frio')],
    ['Sem interesse', cont((c) => c.nivel === 'Sem interesse')],
    ['', ''],
    ['Com documentos enviados', cont((c) => c.doc.count > 0)],
    ['Com I.E.', cont((c) => c.temIe)],
    ['Etapa Cadastro', cont((c) => c.stage === 'Cadastro')],
    ['Etapa Informações Captadas', cont((c) => c.stage === 'Informações Captadas')],
    ['', ''],
    ['Total de cabeças (soma declarada)', totalCab.toLocaleString('pt-BR')],
    ['Conversa mais engajada (msgs do lead)', conversas.reduce((m, c) => Math.max(m, c.nIn), 0)],
]
panor.forEach((r, i) => {
    const row = wsP.addRow(r)
    if (i === 0) {
        row.height = 26
        row.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
        wsP.mergeCells(1, 1, 1, 2)
        row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' }
        row.getCell(1).border = { bottom: { style: 'medium', color: { argb: GOLD } } }
    } else {
        row.getCell(1).font = { bold: /^(Conversas reais|🔥|Nível QUENTE|Com documentos)/.test(String(r[0])) }
        row.getCell(2).font = { bold: true }
        row.getCell(2).alignment = { horizontal: 'right' }
    }
})

// ── Salva na Área de Trabalho ────────────────────────────────────────────────
const hoje = new Date().toISOString().slice(0, 10)
const desktop = path.join(os.homedir(), 'Desktop')
const outPath = path.join(desktop, `Resumo-Conversas-Atendimento-${hoje}.xlsx`)
await wb.xlsx.writeFile(outPath)

console.log('\n✅ Planilha gerada:')
console.log('   ' + outPath)
console.log(`   ${conversas.length} conversas · ${peixes.length} peixes grandes`)
console.log('\nTop 10 por prioridade:')
for (const c of conversas.slice(0, 10)) {
    const l = c.lead || {}
    console.log(`   ${String(c.score).padStart(3)} ${c.peixe ? '🔥' : '  '} ${(strv(l.nome) || c.name || '?').slice(0, 28).padEnd(28)} ${String(c.cab || '').padStart(4)}cab ${c.nivel || ''}`)
}
