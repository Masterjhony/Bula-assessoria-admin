// Importa a "Base Unificada de Leads" (xlsx no Drive) para o CRM (crm_leads).
//
// Segurança: INSERT direto no Supabase — NÃO passa pelo createLead, então NÃO
// dispara welcome/automação (nada de 14k mensagens no WhatsApp). Idempotente:
// dedup por telefone contra os leads existentes e dentro do próprio arquivo;
// re-rodar não duplica (marca origem='base-unificada').
//
// Uso:
//   node scripts/import-base-unificada-leads.mjs            (dry-run: só resumo)
//   node scripts/import-base-unificada-leads.mjs --commit   (grava)
//
// Colunas esperadas: #, NOME, FAZENDA, CIDADE, UF, TELEFONE, EMAIL, TIPO,
//                    CAT. INTERESSE, ORIGEM, STATUS CONTATO, BDR

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { google } from 'googleapis'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const COMMIT = process.argv.includes('--commit')
const FILE_ID = '19PBxMJsIZ5J3x9zhjD_9RnGEou42QF41'
const ORIGEM = 'Base Unificada Leads (Bula/FdB)'
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// ── helpers ──
const normalizePhone = (v) => {
  const d = String(v || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('55')) return d
  if (d.length >= 10 && d.length <= 11) return `55${d}`
  return d
}
const nameKey = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const firstEmail = (v) => String(v || '').trim().split(/[\s,;]+/).filter(x => x.includes('@'))[0] || ''
const titleCase = (v) => String(v || '').trim().toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase())

// ORIGEM crua -> tag curta + rótulo legível
function origemTag(raw) {
  const s = String(raw || '').toLowerCase()
  const par = /\(([^)]+)\)/.exec(raw || '')?.[1]?.trim()
  if (/bula remates/.test(s)) return { tag: 'bula-remates', label: 'Bula Remates' }
  if (/f[óo]rmula do boi|fdb/.test(s)) return { tag: 'formula-do-boi', label: 'Fórmula do Boi' }
  if (par) return { tag: nameKey(par).replace(/\s+/g, '-').slice(0, 24), label: par }
  return { tag: 'base-unificada', label: raw || 'Base' }
}

// ── 1) download via service account ──
const xlsxPath = join(root, 'scripts', '_tmp-base-leads.xlsx')
if (!existsSync(xlsxPath)) {
  const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const auth = new google.auth.JWT(creds.client_email, undefined, creds.private_key, ['https://www.googleapis.com/auth/drive.readonly'])
  const drive = google.drive({ version: 'v3', auth })
  try {
    const res = await drive.files.get({ fileId: FILE_ID, alt: 'media' }, { responseType: 'arraybuffer' })
    writeFileSync(xlsxPath, Buffer.from(res.data))
    console.log('Baixado:', Buffer.from(res.data).length, 'bytes')
  } catch (e) {
    console.error('SEM ACESSO ao arquivo (403/404). Compartilhe com:', creds.client_email)
    console.error(e?.errors?.[0]?.message || e.message)
    process.exit(1)
  }
}

// ── 2) parse (todas as abas com as colunas esperadas) ──
const wb = XLSX.readFile(xlsxPath)
const HEADERS = ['#', 'NOME', 'FAZENDA', 'CIDADE', 'UF', 'TELEFONE', 'EMAIL', 'TIPO', 'CAT. INTERESSE', 'ORIGEM', 'STATUS CONTATO', 'BDR']
const rows = []
for (const sheetName of wb.SheetNames) {
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false })
  // acha a linha de header (contém NOME e TELEFONE)
  let hIdx = grid.findIndex(r => r.map(c => String(c).toUpperCase().trim()).includes('NOME') && r.map(c => String(c).toUpperCase().trim()).some(c => c.includes('TELEFONE')))
  if (hIdx < 0) continue
  const header = grid[hIdx].map(c => String(c).toUpperCase().trim())
  const col = (name) => header.findIndex(h => h === name || h.startsWith(name.split('.')[0]))
  const idx = {
    nome: col('NOME'), fazenda: col('FAZENDA'), cidade: col('CIDADE'), uf: col('UF'),
    telefone: col('TELEFONE'), email: col('EMAIL'), tipo: col('TIPO'),
    interesse: header.findIndex(h => h.includes('INTERESSE')), origem: col('ORIGEM'),
    statusContato: header.findIndex(h => h.includes('STATUS')), bdr: header.findIndex(h => h.includes('BDR')),
  }
  for (let i = hIdx + 1; i < grid.length; i++) {
    const r = grid[i]
    const nome = String(r[idx.nome] ?? '').trim()
    if (!nome) continue
    rows.push({
      sheet: sheetName,
      nome: titleCase(nome),
      fazenda: String(r[idx.fazenda] ?? '').trim(),
      cidade: titleCase(r[idx.cidade] ?? ''),
      uf: String(r[idx.uf] ?? '').trim().toUpperCase().slice(0, 2),
      telefone: normalizePhone(r[idx.telefone]),
      email: firstEmail(r[idx.email]),
      tipo: String(r[idx.tipo] ?? '').trim().toLowerCase(),
      interesse: String(r[idx.interesse] ?? '').trim().toLowerCase(),
      origemRaw: String(r[idx.origem] ?? '').trim(),
      statusContato: String(r[idx.statusContato] ?? '').trim(),
      bdr: String(r[idx.bdr] ?? '').trim(),
    })
  }
}
console.log(`Linhas lidas: ${rows.length} (abas: ${wb.SheetNames.join(', ')})`)

// ── 3) dedup: contra existentes + dentro do arquivo ──
const existing = new Set()
const existingNames = new Set()
{
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from('crm_leads').select('telefone, nome, empresa').range(from, from + 999)
    if (error) { console.error('erro lendo existentes:', error.message); process.exit(1) }
    for (const l of data ?? []) {
      const p = normalizePhone(l.telefone); if (p) existing.add(p)
      if (l.nome) existingNames.add(nameKey(l.nome))
      if (l.empresa) existingNames.add(nameKey(l.empresa))
    }
    if (!data || data.length < 1000) break
    from += 1000
  }
}
console.log(`Leads existentes: ${existing.size} telefones, ${existingNames.size} nomes`)

const seenPhone = new Set()
const seenNoPhone = new Set()
const novos = []
let dupExistTel = 0, dupFileTel = 0, dupNome = 0, semContato = 0
for (const r of rows) {
  if (r.telefone) {
    if (existing.has(r.telefone)) { dupExistTel++; continue }
    if (seenPhone.has(r.telefone)) { dupFileTel++; continue }
    seenPhone.add(r.telefone)
  } else {
    if (!r.email) { semContato++; continue } // sem telefone e sem e-mail = descartar
    const k = `${nameKey(r.nome)}|${r.email.toLowerCase()}`
    if (seenNoPhone.has(k)) { dupFileTel++; continue }
    seenNoPhone.add(k)
    if (existingNames.has(nameKey(r.nome))) { dupNome++; continue }
  }
  novos.push(r)
}

// ── 4) segmentação (resumo) ──
const by = (fn) => novos.reduce((m, r) => { const k = fn(r) || '—'; m[k] = (m[k] || 0) + 1; return m }, {})
const top = (obj, n = 12) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
console.log('\n──── DEDUP ────')
console.log(`Novos a importar: ${novos.length}`)
console.log(`Descartados: ${dupExistTel} (tel já no CRM) · ${dupFileTel} (dup no arquivo) · ${dupNome} (nome já no CRM, sem tel) · ${semContato} (sem telefone e sem e-mail)`)
console.log('\n──── SEGMENTAÇÃO (novos) ────')
console.log('Por TIPO:', top(by(r => r.tipo)))
console.log('Por ORIGEM:', top(by(r => origemTag(r.origemRaw).label)))
console.log('Por UF:', top(by(r => r.uf), 15))
console.log('Por CAT. INTERESSE:', top(by(r => r.interesse)))
console.log('Com telefone:', novos.filter(r => r.telefone).length, '· Com e-mail:', novos.filter(r => r.email).length)

// ── 5) enriquecimento: quantos COMPRADORES (fechamentos) sem telefone no CRM
//     passam a ter match por nome com a base ──
{
  const { data: fech } = await supabase.from('bula_leilao_fechamento').select('compradores')
  const buyerKeys = new Set()
  for (const f of fech ?? []) for (const c of f.compradores ?? []) {
    const k = nameKey(c.fazenda || c.comprador); if (k) buyerKeys.add(k)
  }
  const baseNameKeys = new Map()
  for (const r of novos) {
    for (const nm of [r.nome, r.fazenda]) { const k = nameKey(nm); if (k) baseNameKeys.set(k, r) }
  }
  const matched = [...buyerKeys].filter(k => baseNameKeys.has(k) && !existingNames.has(k))
  console.log('\n──── ENRIQUECIMENTO ────')
  console.log(`Compradores dos fechamentos: ${buyerKeys.size} · com match na base (novo telefone/cidade): ${matched.length}`)
  console.log('Exemplos:', matched.slice(0, 10).map(k => { const r = baseNameKeys.get(k); return `${r.nome} → ${r.telefone || r.email}` }))
}

if (!COMMIT) {
  console.log('\n[DRY-RUN] nada gravado. Rode com --commit para importar.')
  process.exit(0)
}

// ── 6) INSERT em lote (sem automações) ──
const { data: maxPos } = await supabase.from('crm_leads').select('position').order('position', { ascending: false }).limit(1)
let pos = (maxPos?.[0]?.position ?? 0) + 1000
const nowIso = new Date().toISOString()
const payloads = novos.map((r) => {
  const og = origemTag(r.origemRaw)
  const tags = ['base-unificada', og.tag, r.tipo && `tipo-${r.tipo}`, r.uf && `uf-${r.uf.toLowerCase()}`].filter(Boolean)
  return {
    nome: r.nome,
    empresa: r.fazenda || null,
    telefone: r.telefone || null,
    email: r.email || null,
    cidade: r.cidade || null,
    estado: r.uf || null,
    interesse_principal: r.interesse || null,
    o_que_busca: r.interesse || null,
    status: 'ENTRADA',
    stage: 'novo',
    funnel_id: 'default',
    origem: ORIGEM,
    source: 'planilha',
    medium: 'import',
    campaign: 'base-unificada-2026',
    tags_whatsapp: tags,
    data_entrada: nowIso,
    position: (pos += 10),
    extra_data: {
      import_base: 'base-unificada',
      origem_raw: r.origemRaw,
      tipo: r.tipo || null,
      status_contato: r.statusContato || null,
      bdr: r.bdr || null,
      imported_at: nowIso,
    },
  }
})

let inserted = 0
for (let i = 0; i < payloads.length; i += 500) {
  const batch = payloads.slice(i, i + 500)
  const { error } = await supabase.from('crm_leads').insert(batch)
  if (error) { console.error(`ERRO no lote ${i}:`, error.message); process.exit(1) }
  inserted += batch.length
  console.log(`inseridos ${inserted}/${payloads.length}`)
}
console.log(`\n✅ Importados ${inserted} leads em ENTRADA (origem="${ORIGEM}"). Nenhuma automação disparada.`)
