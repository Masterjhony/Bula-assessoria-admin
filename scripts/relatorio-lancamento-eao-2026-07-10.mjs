/**
 * Relatório do LANÇAMENTO — 13º Mega Evento EAO Baviera (leilão 12/07).
 *
 * Planilha pedida pelo Marcelo (Impressos, Cliques, Lead, MQL, Captação info,
 * Cadastros submetidos, Cadastros aprovados + conversão Leads x Resposta) na
 * Área de Trabalho, formatada em PRETO E BRANCO (regra da casa p/ relatórios —
 * sem verde/dourado). Mídia via conector Meta (10/07/2026); funil do CRM ao vivo.
 *
 * Correções do 1º envio: "cadastros submetidos/aprovados" contam a OPERAÇÃO de
 * cadastro do período (todas as leiloeiras), não só leads UTM-EAO — foi como o
 * Marcelo leu ("submeteu bem mais"). São 27 submetidos e 2 aprovados.
 *
 *   node scripts/relatorio-lancamento-eao-2026-07-10.mjs
 */
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import fs from 'node:fs'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const isEao = (l) => {
    const xd = l?.extra_data ?? {}
    if (String(xd.evento ?? '').startsWith('mega-eao-baviera')) return true
    const utm = xd.utm ?? {}
    return /eao/i.test([utm.campaign, utm.content, utm.source].map(v => String(v ?? '')).join(' '))
}
const cpfOk = v => String(v ?? '').replace(/\D/g, '').length === 11
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

// ── carga do CRM ────────────────────────────────────────────────────────────
const leads = []
for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.from('crm_leads')
        .select('id, nome, telefone, celular, cpf, status, estado, is_mql, created_at, inscricao_estadual, tem_inscricao_estadual, quantidade_animais, extra_data, arquivado')
        .range(off, off + 999)
    if (error) throw new Error(error.message)
    leads.push(...(data ?? []))
    if (!data || data.length < 1000) break
}
const leadById = Object.fromEntries(leads.map(l => [l.id, l]))
const cohort = leads.filter(l => !l.arquivado && isEao(l))

const inboundLeads = new Set()
for (let off = 0; off < 80000; off += 1000) {
    const { data } = await sb.from('whatsapp_messages').select('lead_id').eq('direction', 'inbound').not('lead_id', 'is', null).range(off, off + 999)
    for (const m of data ?? []) inboundLeads.add(m.lead_id)
    if (!data || data.length < 1000) break
}
const docsPorLead = new Map()
for (let off = 0; ; off += 1000) {
    const { data } = await sb.from('crm_lead_documentos').select('lead_id').range(off, off + 999)
    for (const d of data ?? []) docsPorLead.set(d.lead_id, (docsPorLead.get(d.lead_id) ?? 0) + 1)
    if (!data || data.length < 1000) break
}

// ── cadastros da OPERAÇÃO (todas as leiloeiras) no período do lançamento ─────
const { data: leilData } = await sb.from('leiloeiras').select('id, nome')
const nomeLeiloeira = Object.fromEntries((leilData ?? []).map(l => [l.id, l.nome]))
const { data: cadsRaw } = await sb.from('cliente_leiloeira_cadastro')
    .select('crm_lead_id, cliente_key, status, enviado_at, aprovado_at, decidido_at, leiloeira_id')
    .not('crm_lead_id', 'is', null)
    .gte('enviado_at', '2026-07-08')
    .order('enviado_at')
// consolida por lead (o mesmo lead pode ir a 2 leiloeiras)
const cadPorLead = new Map()
for (const c of cadsRaw ?? []) {
    const cur = cadPorLead.get(c.crm_lead_id) ?? { leiloeiras: [], status: new Set(), enviado_at: c.enviado_at }
    cur.leiloeiras.push(nomeLeiloeira[c.leiloeira_id] ?? '?')
    cur.status.add(c.status)
    if (c.enviado_at < cur.enviado_at) cur.enviado_at = c.enviado_at
    cadPorLead.set(c.crm_lead_id, cur)
}
const statusConsolidado = s => s.has('aprovado') ? 'Aprovado' : s.has('enviado') ? 'Aguardando' : s.has('recusado') ? 'Recusado' : '—'
const cadastros = [...cadPorLead.entries()].map(([id, v]) => {
    const l = leadById[id]
    return {
        Nome: l?.nome ?? id, Telefone: l?.celular || l?.telefone || '',
        Leiloeira: [...new Set(v.leiloeiras)].join(', '), Status: statusConsolidado(v.status),
        'Enviado em': String(v.enviado_at).slice(0, 10),
        MQL: l?.is_mql ? 'Sim' : 'Não', 'Origem EAO': isEao(l) ? 'Sim' : 'Não',
        UF: l?.estado ?? '', Rebanho: l?.quantidade_animais ?? '',
    }
})
const ordStatus = { Aprovado: 0, Aguardando: 1, Recusado: 2 }
cadastros.sort((a, b) => (ordStatus[a.Status] - ordStatus[b.Status]) || String(a.Nome).localeCompare(String(b.Nome)))
const submetidos = cadastros.length
const aprovados = cadastros.filter(c => c.Status === 'Aprovado').length
const recusados = cadastros.filter(c => c.Status === 'Recusado').length
const aguardando = cadastros.filter(c => c.Status === 'Aguardando').length

// ── funil EAO (topo) ────────────────────────────────────────────────────────
const detalheEao = cohort.map(l => {
    const etapa = norm(l.status)
    const infoCaptada = cpfOk(l.cpf) || (docsPorLead.get(l.id) ?? 0) > 0 || ['INFO CAPTADAS', 'INFORMACOES CAPTADAS', 'CADASTRO'].includes(etapa)
    return {
        Nome: l.nome, Telefone: l.celular || l.telefone || '', 'Entrou em': String(l.created_at).slice(0, 10),
        Etapa: l.status, 'Respondeu?': inboundLeads.has(l.id) ? 'Sim' : 'Não', MQL: l.is_mql ? 'Sim' : 'Não',
        'CPF captado': cpfOk(l.cpf) ? 'Sim' : 'Não',
        'I.E.': String(l.inscricao_estadual ?? '').trim() ? 'Sim' : (norm(l.tem_inscricao_estadual) === 'SIM' ? 'Declarada' : 'Não'),
        Docs: docsPorLead.get(l.id) ?? 0, 'Info captada': infoCaptada ? 'Sim' : 'Não',
        UF: l.estado ?? '', Rebanho: l.quantidade_animais ?? '',
    }
})
const nEao = detalheEao.length
const cE = k => detalheEao.filter(r => r[k] === 'Sim').length
const respostas = cE('Respondeu?'), mql = cE('MQL'), info = cE('Info captada')
const pct = (a, b) => (b ? a / b : 0)

// ── mídia (conector Meta, 10/07/2026) ───────────────────────────────────────
const IMPRESSOES = 111056, CLIQUES = 1221, GASTO = 1162.15, LEADS_META = 101, ALCANCE = 69696
const metaDiario = [
    { Dia: '08/07/2026', Campanha: 'LEADS - FORMS INST EAO — Cópia', Impressões: 11661, Cliques: 154, Investimento: 153.43, Leads: 20 },
    { Dia: '08/07/2026', Campanha: 'LEADS - FORMS INST EAO (original)', Impressões: 2689, Cliques: 15, Investimento: 35.39, Leads: 0 },
    { Dia: '09/07/2026', Campanha: 'LEADS - FORMS INST EAO — Cópia', Impressões: 73104, Cliques: 860, Investimento: 760.41, Leads: 71 },
    { Dia: '10/07/2026 (parcial)', Campanha: 'LEADS - FORMS INST EAO — Cópia', Impressões: 23882, Cliques: 195, Investimento: 214.82, Leads: 10 },
]
const campanhasMeta = [
    { Conta: 'CA2 - Bula 360', Campanha: 'LEADS - FORMS INST EAO — Cópia', Status: 'ATIVA', Impressões: 108367, Cliques: 1206, CTR: 0.0111, Investimento: 1126.76, Alcance: 67194, Leads: 101, CPL: 11.16 },
    { Conta: 'CA2 - Bula 360', Campanha: 'LEADS - FORMS INST EAO', Status: 'PAUSADA', Impressões: 2689, Cliques: 15, CTR: 0.0056, Investimento: 35.39, Alcance: 2502, Leads: 0, CPL: null },
    { Conta: 'CA2 - Bula 360', Campanha: 'LEADS - FORMS INST PERPETUO', Status: 'ATIVA', Impressões: 46496, Cliques: 1281, CTR: 0.0276, Investimento: 473.46, Alcance: 33059, Leads: 242, CPL: 1.96 },
    { Conta: 'CA2 - Bula 360', Campanha: 'LEADS - FORMS INST MAGDA Macho', Status: 'PAUSADA', Impressões: 130199, Cliques: 2978, CTR: 0.0229, Investimento: 1223.30, Alcance: 88753, Leads: 369, CPL: 3.32 },
    { Conta: 'CA1 - Bula 360', Campanha: 'CORTE PERPÉTUO', Status: 'ATIVA', Impressões: 121679, Cliques: 1761, CTR: null, Investimento: 1227.53, Alcance: null, Leads: 93, CPL: 13.20 },
    { Conta: 'CA1 - Bula 360', Campanha: '03/06 CACHOEIRÃO', Status: 'PAUSADA', Impressões: 85846, Cliques: 1132, CTR: null, Investimento: 764.34, Alcance: null, Leads: 84, CPL: 9.10 },
    { Conta: 'CA1 - Bula 360', Campanha: '20/06 RIO BONITO - TOUROS', Status: 'ATIVA', Impressões: 40378, Cliques: 459, CTR: null, Investimento: 520.22, Alcance: null, Leads: 21, CPL: 24.77 },
    { Conta: 'CA1 - Bula 360', Campanha: '11/06 TRESMAR', Status: 'ATIVA', Impressões: 18040, Cliques: 348, CTR: null, Investimento: 355.04, Alcance: null, Leads: 35, CPL: 10.14 },
    { Conta: 'CA1 - Bula 360', Campanha: 'MARCA 15 - RECONHECIMENTO', Status: 'ATIVA', Impressões: 229574, Cliques: 538, CTR: null, Investimento: 372.19, Alcance: 156731, Leads: null, CPL: null },
]

// ═══ ESTILO (preto e branco) ═════════════════════════════════════════════════
const PRETO = 'FF111111', GRAFITE = 'FF3A3A3A', CINZA = 'FFF2F2F2', CINZA2 = 'FFFAFAFA', BORDA = 'FFD9D9D9'
const fonte = 'Calibri'
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
wb.created = new Date('2026-07-10T12:00:00')

const thinBorder = { top: { style: 'thin', color: { argb: BORDA } }, left: { style: 'thin', color: { argb: BORDA } }, bottom: { style: 'thin', color: { argb: BORDA } }, right: { style: 'thin', color: { argb: BORDA } } }
function headerRow(ws, row) {
    row.eachCell(c => {
        c.font = { name: fonte, bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
        c.alignment = { vertical: 'middle', horizontal: 'left' }
        c.border = thinBorder
    })
    row.height = 22
}
function zebra(ws, startRow) {
    for (let r = startRow; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        const fill = (r - startRow) % 2 === 0 ? CINZA2 : 'FFFFFFFF'
        row.eachCell(c => {
            c.font = c.font ?? { name: fonte, size: 11 }
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
            c.border = thinBorder
            c.alignment = { vertical: 'middle', ...(c.alignment ?? {}) }
        })
    }
}

// ── Aba 1: Resumo do lançamento ─────────────────────────────────────────────
const ws1 = wb.addWorksheet('Resumo Lançamento', { views: [{ showGridLines: false }] })
ws1.columns = [{ width: 4 }, { width: 44 }, { width: 20 }, { width: 22 }]
ws1.mergeCells('B2:D2')
const titulo = ws1.getCell('B2')
titulo.value = 'RELATÓRIO DO LANÇAMENTO'
titulo.font = { name: fonte, bold: true, size: 18, color: { argb: 'FFFFFFFF' } }
titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
titulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
ws1.getRow(2).height = 34
ws1.mergeCells('B3:D3')
const sub = ws1.getCell('B3')
sub.value = '13º Mega Evento EAO Baviera · leilão 12/07 · dados parciais em 10/07/2026'
sub.font = { name: fonte, italic: true, size: 11, color: { argb: 'FFFFFFFF' } }
sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAFITE } }
sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
ws1.getRow(3).height = 20

let r = 5
const secao = (txt) => {
    ws1.mergeCells(`B${r}:D${r}`)
    const cell = ws1.getCell(`B${r}`)
    cell.value = txt
    cell.font = { name: fonte, bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAFITE } }
    cell.alignment = { vertical: 'middle', indent: 1 }
    ws1.getRow(r).height = 20
    r++
}
const kpi = (label, valor, obs = '') => {
    ws1.getCell(`B${r}`).value = label
    ws1.getCell(`B${r}`).font = { name: fonte, size: 11 }
    const cv = ws1.getCell(`C${r}`)
    cv.value = valor
    cv.font = { name: fonte, bold: true, size: 12, color: { argb: PRETO } }
    cv.alignment = { horizontal: 'right' }
    if (obs) { ws1.getCell(`D${r}`).value = obs; ws1.getCell(`D${r}`).font = { name: fonte, italic: true, size: 10, color: { argb: GRAFITE } } }
    for (const col of ['B', 'C', 'D']) {
        const c = ws1.getCell(`${col}${r}`)
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: (r % 2 === 0) ? CINZA2 : 'FFFFFFFF' } }
        c.border = { bottom: { style: 'hair', color: { argb: BORDA } } }
        c.alignment = { vertical: 'middle', ...(c.alignment ?? {}) }
    }
    ws1.getRow(r).height = 18
    r++
}
const pctFmt = x => `${(x * 100).toFixed(1)}%`
const brl = x => `R$ ${x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

secao('MÍDIA · Meta Ads (campanha EAO, no ar desde 09/07)')
kpi('Impressões', IMPRESSOES.toLocaleString('pt-BR'))
kpi('Alcance (contas únicas)', ALCANCE.toLocaleString('pt-BR'))
kpi('Cliques', CLIQUES.toLocaleString('pt-BR'), `CTR ${pctFmt(pct(CLIQUES, IMPRESSOES))}`)
kpi('Investimento', brl(GASTO))
kpi('Leads (formulário Meta)', LEADS_META, `custo por lead ${brl(GASTO / LEADS_META)}`)
r++
secao('FUNIL DE QUALIFICAÇÃO · leads da campanha EAO no CRM')
kpi('Leads no CRM (EAO)', nEao)
kpi('Responderam no WhatsApp', respostas, `Leads × Resposta = ${pctFmt(pct(respostas, nEao))}`)
kpi('MQL', mql, pctFmt(pct(mql, nEao)))
kpi('Captação de info (CPF/docs/etapa)', info, pctFmt(pct(info, nEao)))
r++
secao('CADASTROS · operação do período (todas as leiloeiras)')
kpi('Cadastros submetidos', submetidos, 'desde 08/07, leads distintos')
kpi('Cadastros APROVADOS', aprovados, 'Hélio Gomes e Thomas Bianchine')
kpi('Aguardando decisão', aguardando)
kpi('Recusados', recusados)
r++
secao('EFICIÊNCIA')
kpi('Custo por MQL', mql ? brl(GASTO / mql) : '—')
kpi('Custo por cadastro submetido', submetidos ? brl(GASTO / submetidos) : '—')

// ── Aba 2: Cadastros (detalhe) ──────────────────────────────────────────────
const ws2 = wb.addWorksheet('Cadastros submetidos', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] })
ws2.columns = [
    { header: 'Nome', key: 'Nome', width: 34 }, { header: 'Telefone', key: 'Telefone', width: 15 },
    { header: 'Leiloeira', key: 'Leiloeira', width: 18 }, { header: 'Status', key: 'Status', width: 13 },
    { header: 'Enviado em', key: 'Enviado em', width: 12 }, { header: 'MQL', key: 'MQL', width: 6 },
    { header: 'Origem EAO', key: 'Origem EAO', width: 11 }, { header: 'UF', key: 'UF', width: 5 }, { header: 'Rebanho', key: 'Rebanho', width: 14 },
]
cadastros.forEach(c => ws2.addRow(c))
headerRow(ws2, ws2.getRow(1))
zebra(ws2, 2)
// destaque de status por texto (sem cor forte: negrito p/ aprovado, itálico cinza p/ recusado)
for (let i = 2; i <= ws2.rowCount; i++) {
    const st = ws2.getCell(`D${i}`)
    if (st.value === 'Aprovado') st.font = { name: fonte, bold: true, color: { argb: PRETO } }
    else if (st.value === 'Recusado') st.font = { name: fonte, italic: true, color: { argb: GRAFITE } }
}

// ── Aba 3: Meta por dia ─────────────────────────────────────────────────────
const ws3 = wb.addWorksheet('Meta por dia', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] })
ws3.columns = [
    { header: 'Dia', key: 'Dia', width: 20 }, { header: 'Campanha', key: 'Campanha', width: 40 },
    { header: 'Impressões', key: 'Impressões', width: 12 }, { header: 'Cliques', key: 'Cliques', width: 10 },
    { header: 'Investimento', key: 'Investimento', width: 14 }, { header: 'Leads', key: 'Leads', width: 8 },
]
metaDiario.forEach(m => ws3.addRow(m))
headerRow(ws3, ws3.getRow(1))
zebra(ws3, 2)
ws3.getColumn('Impressões').numFmt = '#,##0'
ws3.getColumn('Investimento').numFmt = 'R$ #,##0.00'

// ── Aba 4: Campanhas Meta (contexto) ────────────────────────────────────────
const ws4 = wb.addWorksheet('Campanhas Meta', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] })
ws4.columns = [
    { header: 'Conta', key: 'Conta', width: 14 }, { header: 'Campanha', key: 'Campanha', width: 36 },
    { header: 'Status', key: 'Status', width: 10 }, { header: 'Impressões', key: 'Impressões', width: 12 },
    { header: 'Cliques', key: 'Cliques', width: 9 }, { header: 'CTR', key: 'CTR', width: 8 },
    { header: 'Investimento', key: 'Investimento', width: 14 }, { header: 'Alcance', key: 'Alcance', width: 10 },
    { header: 'Leads', key: 'Leads', width: 8 }, { header: 'CPL', key: 'CPL', width: 10 },
]
campanhasMeta.forEach(m => ws4.addRow(m))
headerRow(ws4, ws4.getRow(1))
zebra(ws4, 2)
ws4.getColumn('Impressões').numFmt = '#,##0'
ws4.getColumn('CTR').numFmt = '0.00%'
ws4.getColumn('Investimento').numFmt = 'R$ #,##0.00'
ws4.getColumn('CPL').numFmt = 'R$ #,##0.00'

// ── Aba 5: Leads EAO (detalhe) ──────────────────────────────────────────────
const ws5 = wb.addWorksheet('Leads EAO', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] })
ws5.columns = [
    { header: 'Nome', key: 'Nome', width: 32 }, { header: 'Telefone', key: 'Telefone', width: 15 },
    { header: 'Entrou em', key: 'Entrou em', width: 11 }, { header: 'Etapa', key: 'Etapa', width: 16 },
    { header: 'Respondeu?', key: 'Respondeu?', width: 11 }, { header: 'MQL', key: 'MQL', width: 6 },
    { header: 'CPF captado', key: 'CPF captado', width: 12 }, { header: 'I.E.', key: 'I.E.', width: 10 },
    { header: 'Docs', key: 'Docs', width: 6 }, { header: 'Info captada', key: 'Info captada', width: 12 },
    { header: 'UF', key: 'UF', width: 5 }, { header: 'Rebanho', key: 'Rebanho', width: 14 },
]
detalheEao.sort((a, b) => (b['Respondeu?'] + b.MQL).localeCompare(a['Respondeu?'] + a.MQL) || String(a.Nome ?? '').localeCompare(String(b.Nome ?? '')))
detalheEao.forEach(l => ws5.addRow(l))
headerRow(ws5, ws5.getRow(1))
zebra(ws5, 2)

const base = 'C:/Users/Notebook-Acer/Desktop/Relatorio_Lancamento_EAO_2026-07-10.xlsx'
let out = base
for (let i = 2; i < 20; i++) {
    try { fs.writeFileSync(out, '', { flag: 'a' }); break } // testa se dá pra abrir p/ escrita
    catch { out = base.replace('.xlsx', `_v${i}.xlsx`) }
}
await wb.xlsx.writeFile(out)
console.log('planilha:', out)
console.log(JSON.stringify({ leadsEAO: nEao, respostas, mql, info, submetidos, aprovados, aguardando, recusados }))
