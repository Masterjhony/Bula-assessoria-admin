// Import único: leads do Instagram Direct (arquivo
// Bula_Assessoria_Leads_Instagram_2026-06-23_a_2026-06-24.xlsx, aba "Leads")
// → CRM (em ENTRADA) + aba "Cópia de LEADS BULA" da planilha do Google.
//
// Idempotente: dedup por e-mail/telefone tanto no CRM quanto na aba, então
// re-rodar não duplica. NÃO reescreve a planilha existente — só ACRESCENTA.
// Uso:  node scripts/import-instagram-leads-2026-06-24.mjs           (dry-run)
//       node scripts/import-instagram-leads-2026-06-24.mjs --apply   (aplica)
import { readFileSync } from 'node:fs'
import XLSX from 'xlsx'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const FILE = 'Bula_Assessoria_Leads_Instagram_2026-06-23_a_2026-06-24.xlsx'
const SHEET_ID = '1caFGyHlqF-fic0y5zsnO1GRty4J61upMcjVI8e8V5F8'
const TAB = 'Cópia de LEADS BULA'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim().replace(/^﻿/, ''), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

// ── helpers ───────────────────────────────────────────────────────────────
const UF_BY_NAME = new Map(Object.entries({
  'acre':'AC','alagoas':'AL','amapa':'AP','amazonas':'AM','bahia':'BA','ceara':'CE',
  'distrito federal':'DF','espirito santo':'ES','goias':'GO','maranhao':'MA','mato grosso':'MT',
  'mato grosso do sul':'MS','minas gerais':'MG','para':'PA','paraiba':'PB','parana':'PR',
  'pernambuco':'PE','piaui':'PI','rio de janeiro':'RJ','rio grande do norte':'RN',
  'rio grande do sul':'RS','rondonia':'RO','roraima':'RR','santa catarina':'SC','sao paulo':'SP',
  'sergipe':'SE','tocantins':'TO',
}))
const deaccent = (s) => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim()
const toUF = (s) => { const d = deaccent(s); if (/^[A-Za-z]{2}$/.test(d)) return d.toUpperCase(); return UF_BY_NAME.get(d.toLowerCase()) || String(s||'').trim() }
const fmtPhone = (raw) => { const d = String(raw||'').replace(/\D/g,'').replace(/^55/,''); if (d.length===11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`; if (d.length===10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`; return String(raw||'').trim() }
const phoneKey = (raw) => { let d = String(raw||'').replace(/\D/g,'').replace(/^55/,''); return d.length>=8 ? d.slice(-8) : '' } // núcleo p/ dedup
const emailKey = (e) => String(e||'').trim().toLowerCase()
const parseCabecasFloor = (v) => { v=String(v||'').trim().toLowerCase(); if(!v) return null; if(v==='nenhuma') return 0; const m=v.match(/\d+/); return m?Number(m[0]):null }
const isIeSim = (v) => deaccent(v).toLowerCase().startsWith('sim')
// Excel serial (wall-clock naive, fuso Brasília) → componentes
function excelParts(serial) {
  const days = Math.floor(serial); const frac = serial - days
  const ms = Math.round(days * 86400000) + Date.UTC(1899,11,30) + Math.round(frac*86400)*1000
  const dt = new Date(ms)
  const p = (n)=>String(n).padStart(2,'0')
  return { iso: `${dt.getUTCFullYear()}-${p(dt.getUTCMonth()+1)}-${p(dt.getUTCDate())}T${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}:00-03:00`,
           label: `${p(dt.getUTCDate())}/${p(dt.getUTCMonth()+1)}/${dt.getUTCFullYear()}, ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}` }
}

// ── 1) lê o xlsx ────────────────────────────────────────────────────────────
const wb = XLSX.readFile(FILE)
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Leads'], { header: 1, defval: '' })
const H = rows[0].map(h => String(h||'').trim().toLowerCase())
const col = (name) => H.indexOf(name)
const ci = { data: col('data/hora'), nome: col('nome completo'), ig: col('usuario ig'), email: col('email'),
  tel: col('telefone'), uf: col('estado'), momento: col('momento na pecuaria'), cab: col('cabecas'),
  ie: col('inscricao estadual'), int: col('interesse'), qtd: col('qtd. desejada') }

const leads = rows.slice(1).filter(r => r.some(c => String(c||'').trim())).map(r => {
  const when = typeof r[ci.data]==='number' ? excelParts(r[ci.data]) : { iso: null, label: '' }
  return {
    dataLabel: when.label, dataIso: when.iso,
    nome: String(r[ci.nome]||'').trim(), ig: String(r[ci.ig]||'').trim(),
    email: String(r[ci.email]||'').trim(), telefone: fmtPhone(r[ci.tel]),
    uf: toUF(r[ci.uf]), momento: String(r[ci.momento]||'').trim(), cabecas: String(r[ci.cab]||'').trim(),
    ie: isIeSim(r[ci.ie]) ? 'Sim' : 'Não', interesse: String(r[ci.int]||'').trim(),
    qtd: String(r[ci.qtd]||'').trim(),
  }
}).filter(l => l.nome || l.email || l.telefone)
console.log(`Arquivo: ${leads.length} leads do Instagram lidos.`)

// ── 2) Supabase service-role: dedup + insert no CRM ─────────────────────────
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: crm, error: crmErr } = await supa.from('crm_leads').select('id, email, telefone, celular')
if (crmErr) throw new Error('CRM select: '+crmErr.message)
const crmEmails = new Set(crm.map(c => emailKey(c.email)).filter(Boolean))
const crmPhones = new Set(crm.flatMap(c => [phoneKey(c.celular), phoneKey(c.telefone)]).filter(Boolean))
const inCrm = (l) => (emailKey(l.email) && crmEmails.has(emailKey(l.email))) || (phoneKey(l.telefone) && crmPhones.has(phoneKey(l.telefone)))

const newForCrm = leads.filter(l => !inCrm(l))
console.log(`CRM: ${leads.length - newForCrm.length} já existem, ${newForCrm.length} novos.`)

let maxPos = Number((await supa.from('crm_leads').select('position').order('position',{ascending:false}).limit(1)).data?.[0]?.position ?? 0)
const crmPayload = newForCrm.map(l => {
  maxPos += 1000
  const isMql = (parseCabecasFloor(l.cabecas) ?? -1) >= 100 && l.ie === 'Sim'
  return {
    nome: l.nome || l.email || l.telefone, email: l.email || null,
    telefone: l.telefone || null, celular: l.telefone || null,
    estado: l.uf || null, cidade: null, momento_pecuaria: l.momento || null,
    quantidade_animais: l.cabecas || null, interesse: l.interesse || null, o_que_busca: l.qtd || null,
    tem_inscricao_estadual: l.ie, status: 'ENTRADA', funnel_id: 'default', is_mql: isMql,
    origem: 'Instagram Direct (@bulaassessoria)', source: 'instagram-direct', source_page: 'Instagram Direct',
    data_entrada: l.dataIso || new Date().toISOString(), position: maxPos,
    extra_data: { instagram_user: l.ig, instagram_import: { file: FILE, importedAt: new Date().toISOString() } },
  }
})

// ── 3) Google Sheets: dedup contra a aba + append (normalizado) ─────────────
const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
const auth = new google.auth.JWT({ email: creds.client_email, key: creds.private_key.replace(/\\n/g,'\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version:'v4', auth })
const norm = (v) => String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
const headerRow = ((await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A1:BL1` })).data.values?.[0]||[]).map(v=>String(v||'').trim())
const idxByName = {}; headerRow.forEach((h,i)=>{ if(!(norm(h) in idxByName)) idxByName[norm(h)] = i })
const idx = (name) => idxByName[norm(name)]
// varre a aba inteira p/ coletar e-mails e núcleos de telefone já presentes
const grid = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:BL` })).data.values || []
const tabEmails = new Set(), tabPhones = new Set()
for (const r of grid) for (const cell of r) {
  const s = String(cell||'')
  const em = s.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/); if (em) tabEmails.add(em[0])
  const pk = phoneKey(s); if (pk) tabPhones.add(pk)
}
const inTab = (l) => (emailKey(l.email) && tabEmails.has(emailKey(l.email))) || (phoneKey(l.telefone) && tabPhones.has(phoneKey(l.telefone)))
const newForTab = leads.filter(l => !inTab(l))
console.log(`Aba "${TAB}": ${leads.length - newForTab.length} já presentes, ${newForTab.length} a acrescentar.`)

const width = Math.max(headerRow.length, 18)
const sheetRows = newForTab.map(l => {
  const row = Array.from({length: width}, ()=> '')
  const set = (name, val) => { const i = idx(name); if (i!=null) row[i] = val ?? '' }
  set('Data', l.dataLabel); set('Nome', l.nome); set('E-mail', l.email); set('WhatsApp', l.telefone)
  set('UF', l.uf); set('Momento', l.momento); set('Cabeças', l.cabecas); set('Inscrição Estadual', l.ie)
  set('Interesse', l.interesse); set('Qtd. desejada', l.qtd)
  set('utm_source', 'instagram-direct'); set('utm_content', l.ig ? '@'+l.ig : '')
  return row
})

// ── resumo / apply ──────────────────────────────────────────────────────────
console.log('\n=== Prévia (até 20) ===')
newForCrm.slice(0,20).forEach(l => console.log(`  + ${l.nome} | ${l.email} | ${l.telefone} | ${l.uf} | ${l.cabecas}/${l.ie} | mql=${(parseCabecasFloor(l.cabecas)??-1)>=100 && l.ie==='Sim'}`))

if (!APPLY) { console.log('\n[DRY-RUN] nada gravado. Rode com --apply para aplicar.'); process.exit(0) }

if (crmPayload.length) {
  const { error } = await supa.from('crm_leads').insert(crmPayload)
  if (error) throw new Error('CRM insert: '+error.message)
  console.log(`\n✓ CRM: ${crmPayload.length} leads inseridos em ENTRADA.`)
} else console.log('\n✓ CRM: nada a inserir.')

if (sheetRows.length) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, includeGridData: false })
  const sheetId = meta.data.sheets.find(s=>s.properties.title===TAB).properties.sheetId
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{
    appendCells: { sheetId, rows: sheetRows.map(r=>({ values: r.map(v=>({ userEnteredValue: { stringValue: String(v??'') } })) })), fields: 'userEnteredValue' }
  }] } })
  console.log(`✓ Aba "${TAB}": ${sheetRows.length} linhas acrescentadas.`)
} else console.log(`✓ Aba "${TAB}": nada a acrescentar.`)
