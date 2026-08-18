/**
 * Submete à leiloeira BULA REMATES (por e-mail, de contato@bulaassessoria.com) os
 * cadastros do relatório "Leads Avançados" que atendam TODOS os filtros:
 *   • Inscrição Estadual (nº real OU declara ter)
 *   • Score de crédito consultado
 *   • Propriedade (nome da fazenda captado)
 *   • Documento de identificação enviado (CNH ou identidade) — arquivo real
 *
 * NÃO são todos os leads do relatório — apenas os que passam nesse filtro. Os
 * documentos de identificação vão como ANEXOS no e-mail.
 *
 * Uso:
 *   node scripts/submete-leads-avancados-bula-remates.mjs          # dry-run (só lista)
 *   node scripts/submete-leads-avancados-bula-remates.mjs --send   # envia de verdade
 */
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const SEND = process.argv.includes('--send')
const DOCS_BUCKET = 'cliente-documentos'

const str = (v) => { const s = String(v ?? '').trim(); return /^(null|undefined|nulo|n\/a|na|-|--|n[aã]o[ _]?tem|n[aã]o[ _]?possui|nenhuma?|sem)$/i.test(s) ? '' : s }
const digits = (v) => String(v ?? '').replace(/\D/g, '')
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fmtCpf = (v) => { const d = digits(v); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (str(v) || '—') }
const fmtFone = (v) => { const d = digits(v).replace(/^55/, ''); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return str(v) || '—' }

// Documento de identificação (CNH ou identidade / documento pessoal com foto).
// Neste sistema o pipeline classifica a foto do documento pessoal com o tipo
// 'cpf' (é o mesmo critério de `computeHabilitacaoChecklist`: tipos.has('cpf')
// ⇒ "Documento pessoal com foto"). Também aceitamos tipos/nomes explícitos de
// identidade/CNH/RG. Excluímos comprovantes de endereço e matrícula.
const isDocIdent = (tipo, nome) => {
  const t = String(tipo || '').toLowerCase()
  const n = String(nome || '').toLowerCase()
  if (/(comprovante|endereco|residencia|matricula|itr|energ)/.test(`${t} ${n}`)) return false
  if (['cpf', 'identidade', 'rg', 'cnh', 'identificacao'].includes(t)) return true
  return /(identidade|identifica|cnh|rg\b|carteira|habilita|documento[_ ]?pessoal|doc[_ ]?foto|foto[_ ]?doc)/.test(n)
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()

// ── leiloeira Bula Remates ──
const { rows: leilRows } = await db.query(
  `select id, nome, email_cadastro, ativo from leiloeiras where lower(nome) like '%bula%remat%' or lower(nome) like '%remat%' order by nome`)
console.log('Leiloeiras candidatas (Bula Remates):')
for (const l of leilRows) console.log(`  • ${l.nome} — email_cadastro=${l.email_cadastro || '(vazio)'} — ativo=${l.ativo} — id=${l.id}`)
const remates = leilRows.find(l => /bula\s*remat/i.test(l.nome)) || leilRows[0]

// ── mesmos candidatos do relatório "Leads Avançados" ──
const { rows } = await db.query(`
  select d.id, d.nome, d.cpf, d.telefone, d.celular, d.email, d.cidade, d.estado,
         d.inscricao_estadual, d.tem_inscricao_estadual, d.score_serasa,
         d.stage, d.extra_data
  from crm_leads d
  where coalesce(d.arquivado,false) = false
    and not exists (select 1 from cliente_leiloeira_cadastro cr where cr.crm_lead_id = d.id and cr.status = 'recusado')
    and (
      exists (select 1 from cliente_leiloeira_cadastro c where c.crm_lead_id = d.id)
      or (d.extra_data->>'habilitacao_notificada_at') is not null
      or (length(regexp_replace(coalesce(d.cpf,''),'\\D','','g')) = 11
          and (coalesce(d.extra_data->>'fazenda_nome','') <> '' or coalesce(d.extra_data->>'endereco_titular','') <> ''))
  )`)

const ids = rows.map(r => r.id)
const { rows: docRows } = ids.length ? await db.query(
  `select lead_id, tipo, nome_arquivo, path from crm_lead_documentos where lead_id = any($1) order by created_at`, [ids]) : { rows: [] }
const docsByLead = new Map()
for (const d of docRows) { const a = docsByLead.get(d.lead_id) || []; a.push(d); docsByLead.set(d.lead_id, a) }

await db.end()

// ── aplica o filtro exigido ──
const matched = []
for (const r of rows) {
  const x = r.extra_data || {}
  const ieNum = str(r.inscricao_estadual).replace(/\D/g, '').length >= 3
  const temIe = str(r.tem_inscricao_estadual).toLowerCase() === 'sim'
  const temIE = ieNum || temIe
  const score = r.score_serasa != null ? Number(r.score_serasa) : (Number(x?.credito?.score) || null)
  const temScore = score != null && !Number.isNaN(score)
  const fazenda = str(x.fazenda_nome)
  const temProp = fazenda.length >= 2
  const docs = docsByLead.get(r.id) || []
  const docsIdent = docs.filter(d => d.path && isDocIdent(d.tipo, d.nome_arquivo))
  const temDocIdent = docsIdent.length > 0

  if (temIE && temScore && temProp && temDocIdent) {
    matched.push({
      id: r.id, nome: str(r.nome) || '—', cpf: digits(r.cpf),
      fone: str(r.celular) || str(r.telefone), email: str(r.email),
      cidade: str(r.cidade), uf: (str(r.estado) || '').toUpperCase(),
      ie: str(r.inscricao_estadual), ieNum, score,
      fazenda, fazCidade: str(x.fazenda_cidade), fazUf: str(x.fazenda_uf).toUpperCase(),
      endereco: str(x.endereco_titular), docsIdent, allDocs: docs,
    })
  }
}

matched.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

console.log(`\nTotal de leads avançados avaliados: ${rows.length}`)
console.log(`Passaram no filtro (IE + Score + Propriedade + Doc de identificação): ${matched.length}\n`)
for (const m of matched) {
  console.log(`  ✔ ${m.nome} — ${[m.cidade, m.uf].filter(Boolean).join('/')} — score ${m.score} — IE ${m.ieNum ? m.ie : '(declara ter)'} — fazenda "${m.fazenda}"`)
  for (const d of m.docsIdent) console.log(`       doc: ${d.nome_arquivo} [${d.tipo}]  (${d.path})`)
}

if (!SEND) {
  console.log('\n[DRY-RUN] Nada enviado. Rode com --send para enviar o e-mail à Bula Remates.')
  process.exit(0)
}

if (!matched.length) { console.log('\nNenhum lead no filtro — nada a enviar.'); process.exit(0) }
if (!remates?.email_cadastro) { console.error('\nBula Remates sem email_cadastro — abortando.'); process.exit(1) }

// ── baixa os anexos do Storage ──
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const attachments = []
const seen = new Set()
for (const m of matched) {
  const first = (m.nome.split(/\s+/)[0] || 'lead').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const d of m.docsIdent) {
    if (seen.has(d.path)) continue
    seen.add(d.path)
    const { data, error } = await supabase.storage.from(DOCS_BUCKET).download(d.path)
    if (error || !data) { console.error(`  ! falha ao baixar ${d.path}: ${error?.message}`); continue }
    const buf = Buffer.from(await data.arrayBuffer())
    const ext = path.extname(d.nome_arquivo || d.path) || ''
    const base = (d.nome_arquivo || `doc${ext}`).replace(/[^\w.\-]+/g, '_')
    attachments.push({ filename: `${first}-${base}`, content: buf })
  }
}
console.log(`\nAnexos baixados: ${attachments.length}`)

// ── monta o e-mail ──
const rowCell = (label, value) =>
  `<tr><td style="padding:3px 12px 3px 0;color:#666;font-size:12px;white-space:nowrap">${label}</td><td style="padding:3px 0;font-size:12px"><b>${esc(value) || '—'}</b></td></tr>`
const fichaHtml = (m, i) => `
  <div style="border:1px solid #e6e4df;border-radius:6px;margin:0 0 14px;overflow:hidden">
    <div style="background:#12100b;color:#fff;padding:9px 14px;font-size:14px;font-weight:700">
      ${i + 1}. ${esc(m.nome)} <span style="color:#C9A84C;font-weight:600;font-size:12px">· score ${m.score}</span>
    </div>
    <div style="padding:10px 14px">
      <table style="border-collapse:collapse">
        ${rowCell('CPF', fmtCpf(m.cpf))}
        ${rowCell('Telefone', fmtFone(m.fone))}
        ${rowCell('E-mail', m.email)}
        ${rowCell('Cidade/UF', [m.cidade, m.uf].filter(Boolean).join('/'))}
        ${rowCell('Endereço', m.endereco)}
        ${rowCell('Inscrição Estadual', m.ieNum ? m.ie : 'Declara ter (nº pendente)')}
        ${rowCell('Fazenda', m.fazenda)}
        ${rowCell('Fazenda — Cidade/UF', [m.fazCidade, m.fazUf].filter(Boolean).join('/'))}
        ${rowCell('Score de crédito', String(m.score))}
        ${rowCell('Documento(s) anexado(s)', m.docsIdent.map(d => d.nome_arquivo).join(', '))}
      </table>
    </div>
  </div>`

const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#111">
  <h2 style="font-size:18px;margin:0 0 6px">Bula Assessoria — Submissão de cadastros para habilitação</h2>
  <p style="font-size:13px;color:#444;line-height:1.55;margin:0 0 6px">
    Prezados, seguem <b>${matched.length} cadastro(s)</b> de compradores indicados pela Bula Assessoria para habilitação nos leilões.
  </p>
  <p style="font-size:12.5px;color:#7a6320;background:#fffaf0;border:1px solid #efe3c2;border-radius:5px;padding:9px 12px;line-height:1.5;margin:0 0 16px">
    <b>Observação:</b> esta relação <b>não contempla toda a base</b> — são apenas os cadastros que já reúnem
    <b>Inscrição Estadual</b>, <b>consulta de crédito (score)</b>, <b>propriedade</b> e <b>documento de identificação (CNH ou identidade) anexado</b>.
    Os documentos de identificação seguem em anexo neste e-mail.
  </p>
  ${matched.map(fichaHtml).join('')}
  <p style="font-size:11px;color:#999;margin-top:18px">Enviado pela Bula Assessoria · contato@bulaassessoria.com</p>
</div>`

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
})

const info = await transporter.sendMail({
  from: process.env.SMTP_FROM || `Bula Assessoria <${process.env.SMTP_USER}>`,
  to: remates.email_cadastro,
  subject: `Bula Assessoria — ${matched.length} cadastro(s) para habilitação (com documentos)`,
  html,
  text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  attachments,
})

console.log(`\n✅ E-mail enviado para ${remates.nome} <${remates.email_cadastro}>`)
console.log(`   messageId: ${info.messageId}`)
console.log(`   leads: ${matched.length} · anexos: ${attachments.length}`)
