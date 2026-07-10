/**
 * Relatório do LANÇAMENTO — 13º Mega Evento EAO Baviera (leilão 12/07).
 *
 * Gera a planilha pedida pelo Marcelo (Impressos, Cliques, Lead, MQL, Captação
 * info, Cadastros submetidos, Cadastros aprovados + conversão Leads x Resposta)
 * na Área de Trabalho. Números de mídia vieram do conector Meta (contas CA1/CA2
 * Bula 360) em 10/07/2026; o funil sai do CRM ao vivo.
 *
 *   node scripts/relatorio-lancamento-eao-2026-07-10.mjs
 */
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import fs from 'node:fs'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const isEao = (l) => {
    const xd = l.extra_data ?? {}
    if (String(xd.evento ?? '').startsWith('mega-eao-baviera')) return true
    const utm = xd.utm ?? {}
    return /eao/i.test([utm.campaign, utm.content, utm.source].map(v => String(v ?? '')).join(' '))
}
const cpfOk = v => String(v ?? '').replace(/\D/g, '').length === 11
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

const leads = []
for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.from('crm_leads')
        .select('id, nome, telefone, celular, cpf, status, estado, is_mql, created_at, inscricao_estadual, tem_inscricao_estadual, quantidade_animais, extra_data, arquivado')
        .range(off, off + 999)
    if (error) throw new Error(error.message)
    leads.push(...(data ?? []))
    if (!data || data.length < 1000) break
}
const cohort = leads.filter(isEao)

const inboundLeads = new Set()
for (let off = 0; off < 60000; off += 1000) {
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
const { data: cads } = await sb.from('cliente_leiloeira_cadastro').select('crm_lead_id, status').not('crm_lead_id', 'is', null)
const fichaLeads = new Set((cads ?? []).map(c => c.crm_lead_id))
const aprovadoLeads = new Set((cads ?? []).filter(c => c.status === 'aprovado').map(c => c.crm_lead_id))

const rows = cohort.map(l => {
    const xd = l.extra_data ?? {}
    const respondeu = inboundLeads.has(l.id)
    const etapa = norm(l.status)
    const infoCaptada = cpfOk(l.cpf) || (docsPorLead.get(l.id) ?? 0) > 0 || ['INFO CAPTADAS', 'INFORMACOES CAPTADAS', 'CADASTRO'].includes(etapa)
    const ficha = fichaLeads.has(l.id) || Boolean(xd.cadastro_submetido_at) || Boolean(xd.ficha_estado_enviado)
    const aprovado = aprovadoLeads.has(l.id) || xd.cadastro_status === 'aprovado' || Boolean(xd.cadastro_aprovado)
    return {
        Nome: l.nome, Telefone: l.celular || l.telefone || '', 'Entrou em': String(l.created_at).slice(0, 10),
        Etapa: l.status, 'Respondeu?': respondeu ? 'Sim' : 'Não', MQL: l.is_mql ? 'Sim' : 'Não',
        'CPF captado': cpfOk(l.cpf) ? 'Sim' : 'Não',
        'I.E.': String(l.inscricao_estadual ?? '').trim() ? 'Sim' : (norm(l.tem_inscricao_estadual) === 'SIM' ? 'Declarada' : 'Não'),
        Docs: docsPorLead.get(l.id) ?? 0, 'Info captada': infoCaptada ? 'Sim' : 'Não',
        'Ficha submetida': ficha ? 'Sim' : 'Não', 'Cadastro aprovado': aprovado ? 'Sim' : 'Não',
        Rebanho: l.quantidade_animais ?? '', UF: l.estado ?? '',
    }
})
const n = rows.length
const c = k => rows.filter(r => r[k] === 'Sim').length
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '—')

// ── Meta Ads (colhido via conector em 10/07/2026, contas CA1/CA2 Bula 360) ──
const metaDiario = [
    { Dia: '08/07/2026', Campanha: 'LEADS - FORMS INST EAO — Cópia', Impressões: 11661, Cliques: 154, 'Investimento (R$)': 153.43, Leads: 20 },
    { Dia: '08/07/2026', Campanha: 'LEADS - FORMS INST EAO (original, pausada)', Impressões: 2689, Cliques: 15, 'Investimento (R$)': 35.39, Leads: 0 },
    { Dia: '09/07/2026', Campanha: 'LEADS - FORMS INST EAO — Cópia', Impressões: 73104, Cliques: 860, 'Investimento (R$)': 760.41, Leads: 71 },
    { Dia: '10/07/2026 (parcial)', Campanha: 'LEADS - FORMS INST EAO — Cópia', Impressões: 23882, Cliques: 195, 'Investimento (R$)': 214.82, Leads: 10 },
]
const IMPRESSOES = 111056, CLIQUES = 1221, GASTO = 1162.15, LEADS_META = 101

const respostas = c('Respondeu?'), mql = c('MQL'), info = c('Info captada'), fichas = c('Ficha submetida'), aprovados = c('Cadastro aprovado')
const resumo = [
    ['RELATÓRIO DO LANÇAMENTO — 13º MEGA EVENTO EAO BAVIERA (leilão 12/07)', ''],
    ['Gerado em', '10/07/2026 — dados parciais: leilão ainda não aconteceu'],
    ['', ''],
    ['MÍDIA (Meta Ads — campanhas EAO, no ar desde 08/07)', ''],
    ['Impressões', IMPRESSOES],
    ['Alcance (contas únicas)', 69696],
    ['Cliques', CLIQUES],
    ['CTR', pct(CLIQUES, IMPRESSOES)],
    ['Investimento (R$)', GASTO],
    ['Leads (formulário Meta)', LEADS_META],
    ['Custo por lead (R$)', Number((GASTO / LEADS_META).toFixed(2))],
    ['', ''],
    ['FUNIL NO CRM (leads da campanha EAO — Meta + landing)', ''],
    ['Leads no CRM', n],
    ['Responderam no WhatsApp (Leads x Resposta)', `${respostas} (${pct(respostas, n)})`],
    ['MQL', `${mql} (${pct(mql, n)})`],
    ['Captação de info (CPF, docs ou etapa Info+)', `${info} (${pct(info, n)})`],
    ['Cadastros submetidos às leiloeiras', `${fichas} (${pct(fichas, n)})`],
    ['Cadastros aprovados', `${aprovados} (${pct(aprovados, n)})`],
    ['', ''],
    ['Custo por MQL (R$)', mql ? Number((GASTO / mql).toFixed(2)) : '—'],
    ['Custo por cadastro submetido (R$)', fichas ? Number((GASTO / fichas).toFixed(2)) : '—'],
]

const campanhasMeta = [
    { Conta: 'CA2 - Bula 360', Campanha: 'LEADS - FORMS INST EAO — Cópia', Status: 'ATIVA', Impressões: 108367, Cliques: 1206, CTR: '1,11%', 'Investimento (R$)': 1126.76, Alcance: 67194, Leads: 101, 'CPL (R$)': 11.16 },
    { Conta: 'CA2 - Bula 360', Campanha: 'LEADS - FORMS INST EAO', Status: 'PAUSADA', Impressões: 2689, Cliques: 15, CTR: '0,56%', 'Investimento (R$)': 35.39, Alcance: 2502, Leads: 0, 'CPL (R$)': '' },
    { Conta: 'CA2 - Bula 360', Campanha: 'LEADS - FORMS INST PERPETUO', Status: 'ATIVA', Impressões: 46496, Cliques: 1281, CTR: '2,76%', 'Investimento (R$)': 473.46, Alcance: 33059, Leads: 242, 'CPL (R$)': 1.96 },
    { Conta: 'CA2 - Bula 360', Campanha: 'LEADS - FORMS INST MAGDA Macho', Status: 'PAUSADA', Impressões: 130199, Cliques: 2978, CTR: '2,29%', 'Investimento (R$)': 1223.30, Alcance: 88753, Leads: 369, 'CPL (R$)': 3.32 },
    { Conta: 'CA1 - Bula 360', Campanha: 'CORTE PERPÉTUO', Status: 'ATIVA', Impressões: 121679, Cliques: 1761, CTR: '', 'Investimento (R$)': 1227.53, Alcance: '', Leads: 93, 'CPL (R$)': 13.20 },
    { Conta: 'CA1 - Bula 360', Campanha: '03/06 CACHOEIRÃO', Status: 'PAUSADA', Impressões: 85846, Cliques: 1132, CTR: '', 'Investimento (R$)': 764.34, Alcance: '', Leads: 84, 'CPL (R$)': 9.10 },
    { Conta: 'CA1 - Bula 360', Campanha: '20/06 RIO BONITO - TOUROS', Status: 'ATIVA', Impressões: 40378, Cliques: 459, CTR: '', 'Investimento (R$)': 520.22, Alcance: '', Leads: 21, 'CPL (R$)': 24.77 },
    { Conta: 'CA1 - Bula 360', Campanha: '11/06 TRESMAR', Status: 'ATIVA', Impressões: 18040, Cliques: 348, CTR: '', 'Investimento (R$)': 355.04, Alcance: '', Leads: 35, 'CPL (R$)': 10.14 },
    { Conta: 'CA1 - Bula 360', Campanha: 'MARCA 15 - RECONHECIMENTO', Status: 'ATIVA', Impressões: 229574, Cliques: 538, CTR: '', 'Investimento (R$)': 372.19, Alcance: 156731, Leads: '', 'CPL (R$)': '' },
]

const wb = XLSX.utils.book_new()
const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
wsResumo['!cols'] = [{ wch: 52 }, { wch: 48 }]
XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo Lançamento')
const wsDia = XLSX.utils.json_to_sheet(metaDiario)
wsDia['!cols'] = [{ wch: 20 }, { wch: 42 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 8 }]
XLSX.utils.book_append_sheet(wb, wsDia, 'Meta por dia')
const wsCamp = XLSX.utils.json_to_sheet(campanhasMeta)
wsCamp['!cols'] = [{ wch: 14 }, { wch: 38 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 10 }]
XLSX.utils.book_append_sheet(wb, wsCamp, 'Campanhas Meta (contexto)')
rows.sort((a, b) =>
    (b['Ficha submetida'] + b.MQL + b['Respondeu?']).localeCompare(a['Ficha submetida'] + a.MQL + a['Respondeu?'])
    || String(a.Nome ?? '').localeCompare(String(b.Nome ?? '')))
const wsLeads = XLSX.utils.json_to_sheet(rows)
wsLeads['!cols'] = [{ wch: 32 }, { wch: 15 }, { wch: 11 }, { wch: 16 }, { wch: 11 }, { wch: 6 }, { wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 12 }, { wch: 15 }, { wch: 16 }, { wch: 14 }, { wch: 5 }]
XLSX.utils.book_append_sheet(wb, wsLeads, 'Leads EAO (detalhe)')

const out = 'C:/Users/Notebook-Acer/Desktop/Relatorio_Lancamento_EAO_2026-07-10.xlsx'
XLSX.writeFile(wb, out)
console.log('planilha:', out)
console.log(JSON.stringify({ leadsCRM: n, respostas, mql, info, fichas, aprovados }))
