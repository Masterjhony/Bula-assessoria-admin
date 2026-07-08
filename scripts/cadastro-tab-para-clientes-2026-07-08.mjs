// Coloca o pessoal da aba "Cadastro" (planilha Leads JMP) no sistema, direto —
// sem depender do sync por cor/nome (que só via 1000 leads e lia a aba errada
// "Cadastro JMP"). Para cada linha:
//   • upsert em `clientes` por match_key (sem sobrescrever dado bom existente);
//   • onde PROGRAMA LEILÕES / BULA REMATES == APROVADO → cliente_leiloeira_cadastro
//     status 'aprovado' na leiloeira correspondente;
//   • vincula crm_lead_id se a pessoa já existe no CRM (por CPF/e-mail/telefone).
//
//   node scripts/cadastro-tab-para-clientes-2026-07-08.mjs           # dry-run
//   node scripts/cadastro-tab-para-clientes-2026-07-08.mjs --apply   # grava
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const SID = '1caFGyHlqF-fic0y5zsnO1GRty4J61upMcjVI8e8V5F8'
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON
let creds; try { creds = JSON.parse(raw) } catch { creds = { client_email: raw.match(/"client_email"\s*:\s*"([^"]+)"/)?.[1], private_key: raw.match(/"private_key"\s*:\s*"([\s\S]*?)"\s*[,}]/)?.[1] } }
const auth = new google.auth.JWT({ email: creds.client_email, key: creds.private_key.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
const sheets = google.sheets({ version: 'v4', auth })

// mesma normalização de clienteMatchKey (src/lib/clientes.ts)
const matchKey = n => String(n ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const onlyDigits = s => String(s ?? '').replace(/\D/g, '')
const nuc = s => onlyDigits(s).replace(/^55/, '').slice(-8)
const em = s => String(s ?? '').trim().toLowerCase()
const isAprovado = v => String(v ?? '').trim().toUpperCase() === 'APROVADO'
function interessesDe(txt) {
  const t = String(txt ?? '').toLowerCase(); const out = []
  if (/touro/.test(t)) out.push('Touros')
  if (/matriz/.test(t)) out.push('Matrizes')
  if (/bezerr/.test(t)) out.push('Bezerras')
  return out
}
function parseIE(v) {
  const s = String(v ?? '').trim()
  if (!s || /n[ãa]o\s*tem/i.test(s)) return { tem: 'Não', ie: '' }
  return { tem: 'Sim', ie: s }
}

// 1) leiloeiras
const { data: leils } = await sb.from('leiloeiras').select('id,nome')
const leilId = nome => (leils || []).find(l => matchKey(l.nome) === matchKey(nome))?.id || null
const PROGRAMA = leilId('Programa Leilões'), BULA = leilId('Bula Remates')
if (!PROGRAMA || !BULA) { console.error('Leiloeiras não encontradas:', { PROGRAMA, BULA }); process.exit(1) }

// 2) aba Cadastro
const rows = ((await sheets.spreadsheets.values.get({ spreadsheetId: SID, range: 'Cadastro!A2:M' })).data.values || []).filter(r => String(r[5] ?? '').trim())

// 3) todos os leads do CRM (paginado) p/ vincular crm_lead_id
let leads = [], from = 0
while (true) { const { data } = await sb.from('crm_leads').select('id,nome,telefone,celular,email,cpf').range(from, from + 999); if (!data?.length) break; leads = leads.concat(data); if (data.length < 1000) break; from += 1000 }
const byPhone = new Map(), byEmail = new Map(), byCpf = new Map()
for (const l of leads) { for (const p of [l.telefone, l.celular]) { const n = nuc(p); if (n && !byPhone.has(n)) byPhone.set(n, l.id) } if (l.email) byEmail.set(em(l.email), l.id); if (onlyDigits(l.cpf).length >= 11) byCpf.set(onlyDigits(l.cpf), l.id) }

// 4) clientes existentes por match_key
const { data: cliExist } = await sb.from('clientes').select('id,match_key,nome,telefone,email,cidade,uf,cpf,inscricao_estadual,crm_lead_id')
const cliByKey = new Map((cliExist || []).map(c => [c.match_key, c]))

let novos = 0, atualizados = 0, vinc = 0, aprovAdd = 0
console.log(`\n=== ${rows.length} cadastros | ${APPLY ? 'APLICANDO' : 'DRY-RUN'} ===\n`)
for (const r of rows) {
  const [progSt, bulaSt, sdr, assessor, email, nome, tel, uf, interesse, cidade, cabecas, cpf, ie] = r
  const key = matchKey(nome); if (!key) continue
  const cpfD = onlyDigits(cpf)
  const { tem, ie: ieVal } = parseIE(ie)
  const crmLeadId = byCpf.get(cpfD) || byEmail.get(em(email)) || byPhone.get(nuc(tel)) || null
  const exist = cliByKey.get(key)
  const aprovadas = [isAprovado(progSt) && 'Programa Leilões', isAprovado(bulaSt) && 'Bula Remates'].filter(Boolean)

  // Regra do chefe: só os APROVADOS vão para Clientes. Os demais já estão no CRM
  // como leads (todos CRM✓) — ficam onde estão.
  if (!aprovadas.length) {
    console.log(`·  ${nome} — sem aprovação, mantido como lead no CRM${crmLeadId ? '' : ' (⚠ não achei no CRM)'}`)
    continue
  }

  // payload sem clobber: só preenche campo vazio no existente
  const keep = (novo, velho) => (String(velho ?? '').trim() ? velho : (novo ?? ''))
  const obs = `Cadastro (aba Cadastro)${sdr ? ' · SDR: ' + String(sdr).trim() : ''}${assessor ? ' · Assessor: ' + String(assessor).trim() : ''}`
  const payload = {
    match_key: key,
    nome: String(nome).trim(),
    telefone: keep(String(tel ?? '').trim(), exist?.telefone),
    email: keep(String(email ?? '').trim(), exist?.email),
    cidade: keep(String(cidade ?? '').trim(), exist?.cidade),
    uf: keep(String(uf ?? '').trim().toUpperCase(), exist?.uf),
    cpf: keep(cpfD, exist?.cpf),
    inscricao_estadual: keep(ieVal, exist?.inscricao_estadual),
    tem_inscricao_estadual: tem,
    interesses: interessesDe(interesse),
    momento_pecuaria: '',
    perfil: 'Cadastro', status: 'quente',
    observacoes: obs,
    crm_lead_id: exist?.crm_lead_id || crmLeadId,
  }

  console.log(`${exist ? '↻' : '＋'} ${nome}${cpfD ? ' · CPF ' + cpfD : ''} · ${uf || '—'}${crmLeadId ? ' · CRM✓' : ' · CRM✗'} · aprovado: ${aprovadas.join(', ') || '—'}`)
  if (exist) atualizados++; else novos++
  if (crmLeadId && !exist?.crm_lead_id) vinc++
  aprovAdd += aprovadas.length

  if (APPLY) {
    const { data: up, error } = await sb.from('clientes').upsert(payload, { onConflict: 'match_key' }).select('id,match_key').single()
    if (error) { console.error('  ✗ cliente:', error.message); continue }
    for (const nm of aprovadas) {
      const lid = nm === 'Programa Leilões' ? PROGRAMA : BULA
      const { error: e2 } = await sb.from('cliente_leiloeira_cadastro').upsert(
        { cliente_key: key, leiloeira_id: lid, status: 'aprovado', aprovado_at: new Date().toISOString() },
        { onConflict: 'cliente_key,leiloeira_id' })
      if (e2) console.error(`  ✗ leiloeira ${nm}:`, e2.message)
    }
  }
}
console.log(`\nResumo: ${novos} novos · ${atualizados} atualizados · ${vinc} vinculados ao CRM · ${aprovAdd} vínculos leiloeira aprovada`)
console.log(APPLY ? '✓ aplicado' : '(dry-run — rode com --apply para gravar)')
