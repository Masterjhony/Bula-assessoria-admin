// Importa "contatos_whatsapp.xlsx" (extração de contatos do WhatsApp) para o CRM.
// Mesmo padrão do import da Base Unificada: INSERT direto (sem welcome/automação),
// dedup por telefone contra o CRM inteiro (paginado) e dentro do arquivo,
// segmentação por lista/etiqueta, enriquecimento dos compradores por nome.
//
// Fonte: aba "Unicos" (já deduplicada por telefone normalizado).
// Uso:  node scripts/import-contatos-whatsapp.mjs           (dry-run)
//       node scripts/import-contatos-whatsapp.mjs --commit  (grava)

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const COMMIT = process.argv.includes('--commit')
const ORIGEM = 'Contatos WhatsApp (extração)'
const XLSX_PATH = join(root, 'scripts', '_tmp-contatos.xlsx')
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
const titleCase = (v) => String(v || '').trim().toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase())

// Etiquetas entre parênteses ((GA), (PLP), (EAO), (Prod.)...) = marcadores de lista.
function extractLabels(...names) {
  const set = new Set()
  for (const n of names) for (const m of String(n || '').matchAll(/\(([^)]{1,20})\)/g)) {
    const t = nameKey(m[1]).replace(/\s+/g, '-')
    if (t && t.length <= 12) set.add(t)
  }
  return [...set]
}
// Remove as etiquetas e escolhe o nome real mais completo entre os candidatos.
function resolveName(nomePrincipal, nomesEncontrados) {
  const candidates = String(nomesEncontrados || nomePrincipal || '').split('|')
  let best = ''
  for (const c of candidates) {
    const clean = c.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
    const letters = clean.replace(/[^\p{L}]/gu, '').length
    if (letters >= 3 && clean.length > best.length) best = clean
  }
  if (!best) {
    const clean = String(nomePrincipal || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
    if (clean.replace(/[^\p{L}]/gu, '').length >= 3) best = clean
  }
  return best ? titleCase(best) : ''
}
// Origem crua ("EAO - Zildo/Williams e outros 929 contatos") -> rótulo curto.
function origemLabel(raw) {
  const s = String(raw || '').split(/ e outros | e mais /)[0].trim()
  return s || 'WhatsApp'
}

// ── 1) parse aba Unicos ──
const wb = XLSX.readFile(XLSX_PATH)
const sheet = wb.Sheets['Unicos'] || wb.Sheets[wb.SheetNames.find(n => /unico/i.test(n))]
const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })
const header = grid[0].map(h => String(h).toLowerCase().trim())
const ci = (frag) => header.findIndex(h => h.includes(frag))
const idx = {
  telNorm: ci('normaliz'), telExib: ci('exibido'), principal: ci('principal'),
  encontrados: ci('encontrados'), tipos: ci('tipos'), origens: ci('origen'), ocorr: ci('ocorr'),
}
const rows = []
for (let i = 1; i < grid.length; i++) {
  const r = grid[i]
  const phone = normalizePhone(r[idx.telNorm] || r[idx.telExib])
  if (!phone) continue
  const nome = resolveName(r[idx.principal], r[idx.encontrados])
  rows.push({
    phone,
    nome,
    labels: extractLabels(r[idx.principal], r[idx.encontrados]),
    origemRaw: String(r[idx.origens] ?? '').trim(),
    tipos: String(r[idx.tipos] ?? '').trim(),
    ocorrencias: Number(r[idx.ocorr]) || 1,
  })
}
console.log(`Aba Unicos: ${rows.length} contatos com telefone`)

// ── 2) dedup contra o CRM inteiro (paginado) + dentro do arquivo ──
const existing = new Set()
const existingNames = new Set()
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('crm_leads').select('telefone, nome, empresa').range(from, from + 999)
  if (error) { console.error('erro lendo existentes:', error.message); process.exit(1) }
  for (const l of data ?? []) {
    const p = normalizePhone(l.telefone); if (p) existing.add(p)
    if (l.nome) existingNames.add(nameKey(l.nome))
    if (l.empresa) existingNames.add(nameKey(l.empresa))
  }
  if (!data || data.length < 1000) break
}
console.log(`CRM atual: ${existing.size} telefones, ${existingNames.size} nomes`)

const seen = new Set()
const novos = []
let dupCrm = 0, dupFile = 0, semNome = 0
for (const r of rows) {
  if (existing.has(r.phone)) { dupCrm++; continue }
  if (seen.has(r.phone)) { dupFile++; continue }
  seen.add(r.phone)
  if (!r.nome) { semNome++; /* mantém: contato de WhatsApp com telefone tem valor */ r.nome = `Contato ${r.phone.slice(-4)}` }
  novos.push(r)
}

// ── 3) segmentação (resumo) ──
const by = (fn) => novos.reduce((m, r) => { const k = fn(r) || '—'; m[k] = (m[k] || 0) + 1; return m }, {})
const top = (obj, n = 12) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
const labelCounts = {}
for (const r of novos) for (const l of r.labels) labelCounts[l] = (labelCounts[l] || 0) + 1
console.log('\n──── DEDUP ────')
console.log(`Novos a importar: ${novos.length}`)
console.log(`Descartados: ${dupCrm} (telefone já no CRM) · ${dupFile} (dup no arquivo)`)
console.log(`Sem nome real (viram "Contato XXXX"): ${semNome}`)
console.log('\n──── SEGMENTAÇÃO (novos) ────')
console.log('Por ORIGEM (lista):', top(by(r => origemLabel(r.origemRaw))))
console.log('Por ETIQUETA:', top(labelCounts))

// ── 4) enriquecimento: compradores dos fechamentos com match por nome ──
{
  const { data: fech } = await supabase.from('bula_leilao_fechamento').select('compradores')
  const buyers = new Map()
  for (const f of fech ?? []) for (const c of f.compradores ?? []) {
    const k = nameKey(c.fazenda || c.comprador); if (k) buyers.set(k, c.fazenda || c.comprador)
  }
  const baseByName = new Map()
  for (const r of novos) { const k = nameKey(r.nome); if (k && !/^contato /i.test(r.nome)) baseByName.set(k, r) }
  const matched = [...buyers].filter(([k]) => baseByName.has(k) && !existingNames.has(k))
  console.log('\n──── ENRIQUECIMENTO ────')
  console.log(`Compradores dos fechamentos: ${buyers.size} · novos com match nesta lista: ${matched.length}`)
  console.log('Exemplos:', matched.slice(0, 10).map(([k, nm]) => `${nm} → ${baseByName.get(k).phone}`))
}

if (!COMMIT) { console.log('\n[DRY-RUN] nada gravado. Rode com --commit.'); process.exit(0) }

// ── 5) INSERT em lote (sem automações) ──
const { data: maxPos } = await supabase.from('crm_leads').select('position').order('position', { ascending: false }).limit(1)
let pos = (maxPos?.[0]?.position ?? 0) + 1000
const nowIso = new Date().toISOString()
const payloads = novos.map((r) => {
  const tags = ['contatos-whatsapp', ...r.labels.map(l => `lista-${l}`)].slice(0, 8)
  return {
    nome: r.nome,
    telefone: r.phone,
    status: 'ENTRADA',
    stage: 'novo',
    funnel_id: 'default',
    origem: ORIGEM,
    source: 'whatsapp-contatos',
    medium: 'import',
    campaign: 'contatos-whatsapp-2026',
    tags_whatsapp: tags,
    data_entrada: nowIso,
    position: (pos += 10),
    extra_data: {
      import_base: 'contatos-whatsapp',
      origem_raw: r.origemRaw,
      labels: r.labels,
      tipos: r.tipos || null,
      ocorrencias: r.ocorrencias,
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
console.log(`\n✅ Importados ${inserted} contatos em ENTRADA (origem="${ORIGEM}"). Nenhuma automação disparada.`)
