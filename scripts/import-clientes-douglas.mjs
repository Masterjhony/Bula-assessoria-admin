// Importa a carteira de clientes do assessor Douglas (Checklist_Clientes_Douglas.xlsx)
// para o MÓDULO CLIENTES (tabela overlay `clientes`, upsert por match_key).
//
// Diferente das importações de leads: aqui são CLIENTES (compradores reais via
// assessor). Quem já é cliente (comprador dos fechamentos, mesmo nome) recebe
// MERGE — o overlay completa sem duplicar e sem apagar dados existentes
// (telefone/perfil/compras preservados). Quem é novo entra como card de cliente.
//
// O arquivo NÃO traz contato (telefone/CPF/cidade) — esses campos ficam vazios
// (não sobrescrevem nada). O que agrega: assessor (Douglas Bispo/Gustavo Rusa),
// resumo de compras e interesse (F→Matrizes, M→Touros).
//
// Uso:  node scripts/import-clientes-douglas.mjs           (dry-run)
//       node scripts/import-clientes-douglas.mjs --commit  (grava)

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
const XLSX_PATH = join(root, 'scripts', '_tmp-douglas.xlsx')
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const nameKey = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
// Capitaliza a 1ª letra de cada palavra SEM quebrar letras acentuadas no meio
// (\b trata á/é/ã como fronteira e geraria "JosÉ"/"GalvÃo").
const titleCase = (v) => String(v || '').trim().toLowerCase()
  .replace(/(^|[\s\-'/().])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
function interessesFromTipos(tipos) {
  const toks = String(tipos || '').toUpperCase().split(/[,\s]+/).filter(Boolean)
  const out = new Set()
  if (toks.includes('F')) out.add('Matrizes')
  if (toks.includes('M')) out.add('Touros')
  return [...out]
}

// ── parse aba Checklist ──
const wb = XLSX.readFile(XLSX_PATH)
const g = XLSX.utils.sheet_to_json(wb.Sheets['Checklist'], { header: 1, blankrows: false })
const hRow = g.findIndex(r => r.includes('Cliente') && r.includes('Assessor'))
const H = g[hRow]; const col = (n) => H.indexOf(n)
const c = {
  cliente: col('Cliente'), carteira: col('Carteira'), assessor: col('Assessor'),
  compras: col('Compras'), leiloes: col('Leilões'), valor: col('Valor compra'),
  tipo: col('Tipo'), tipos: col('Tipos'), ultimo: col('Último leilão'),
}
const clientes = []
for (let i = hRow + 1; i < g.length; i++) {
  const r = g[i]
  const nome = titleCase(r[c.cliente])
  if (!nome || String(r[c.tipo] || '').toLowerCase() !== 'cliente') continue
  clientes.push({
    nome,
    matchKey: nameKey(nome),
    assessor: String(r[c.assessor] || '').trim(),
    carteira: String(r[c.carteira] || '').trim(),
    compras: Number(r[c.compras]) || 0,
    leiloes: Number(r[c.leiloes]) || 0,
    valor: Number(r[c.valor]) || 0,
    tipos: String(r[c.tipos] || '').trim(),
    ultimo: String(r[c.ultimo] || '').trim(),
  })
}
console.log(`Clientes no arquivo: ${clientes.length}`)

// ── aba Detalhes: compras por leilão/lote, agrupadas por cliente ──
const excelToISO = (serial) => {
  const n = Number(serial); if (!Number.isFinite(n) || n <= 0) return ''
  return new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
}
const tipoLabel = (t) => ({ F: 'fêmea', M: 'macho' })[String(t || '').toUpperCase()] || ''
const catFromTipo = (t) => ({ F: 'Matrizes', M: 'Touros' })[String(t || '').toUpperCase()] || 'Leilões'
const gd = XLSX.utils.sheet_to_json(wb.Sheets['Detalhes'], { header: 1, blankrows: false })
const dh = gd[0].map(h => String(h).trim()); const dcol = (n) => dh.findIndex(h => h.toLowerCase().startsWith(n.toLowerCase()))
const dc = {
  cliente: dcol('Cliente'), data: dcol('Data'), leilao: dcol('Leilão'), lote: dcol('Lote'),
  tipo: dcol('Tipo'), qtd: dcol('Qtd'), lance: dcol('Lance'), parcelas: dcol('Parcelas'), valor: dcol('Valor venda'),
}
const comprasByKey = new Map()
for (let i = 1; i < gd.length; i++) {
  const r = gd[i]; const k = nameKey(r[dc.cliente]); if (!k) continue
  const lote = String(r[dc.lote] ?? '').trim()
  const parcelas = Number(r[dc.parcelas]) || 0
  const tl = tipoLabel(r[dc.tipo])
  const descricao = [lote ? `Lote ${lote}` : 'Lote —', tl, parcelas ? `${parcelas}x` : ''].filter(Boolean).join(' · ')
  const item = {
    id: `douglas-${i}`,
    data: excelToISO(r[dc.data]),
    descricao,
    leilao: String(r[dc.leilao] ?? '').trim() || undefined,
    categoria: catFromTipo(r[dc.tipo]),
    cabecas: Number(r[dc.qtd]) || undefined,
    valor: Number(r[dc.valor]) || 0,
  }
  const arr = comprasByKey.get(k) ?? []; arr.push(item); comprasByKey.set(k, arr)
}

// ── contexto: compradores dos fechamentos + tabela clientes + leads (p/ crm_lead_id) ──
const { data: fech } = await supabase.from('bula_leilao_fechamento').select('compradores')
const buyers = new Set()
for (const f of fech ?? []) for (const b of f.compradores ?? []) { for (const nm of [b.fazenda, b.comprador]) { const k = nameKey(nm); if (k) buyers.add(k) } }
const { data: cliRows } = await supabase.from('clientes').select('match_key')
const cliKeys = new Set((cliRows ?? []).map(r => r.match_key))
const leadByName = new Map()
for (let from = 0; ; from += 1000) {
  const { data } = await supabase.from('crm_leads').select('id, nome, empresa').range(from, from + 999)
  for (const l of data ?? []) for (const nm of [l.nome, l.empresa]) { const k = nameKey(nm); if (k && !leadByName.has(k)) leadByName.set(k, l.id) }
  if (!data || data.length < 1000) break
}

const perfilDe = (valor, leiloes, compras) => valor >= 500000 ? 'Premium' : (leiloes > 1 || compras > 1) ? 'Recorrente' : 'Ocasional'
let jaCliente = 0, novos = 0
const payloads = clientes.map((x) => {
  const isBuyer = buyers.has(x.matchKey)
  const inCli = cliKeys.has(x.matchKey)
  if (isBuyer || inCli) jaCliente++; else novos++
  const assessorTag = x.assessor || 'Douglas'
  const detalhes = (comprasByKey.get(x.matchKey) ?? []).sort((a, b) => (a.data || '').localeCompare(b.data || ''))
  // Observações: resumo + detalhamento das compras (leilão, lote, parcelas, valor).
  const linhas = [
    `Carteira ${x.carteira || 'Douglas'} (assessor ${x.assessor || 'Douglas'}) — ${x.compras} compra(s) em ${x.leiloes} leilão(ões), ${brl(x.valor)}.`,
  ]
  for (const d of detalhes) {
    linhas.push(`• ${d.data ? d.data.split('-').reverse().join('/') + ' ' : ''}${d.leilao || 'Leilão'} — ${d.descricao}${d.valor ? `, ${brl(d.valor)}` : ''}`)
  }
  return {
    row: {
      match_key: x.matchKey,
      nome: x.nome,
      status: 'ativo',
      recorrente: x.leiloes > 1 || x.compras > 1,
      interesses: interessesFromTipos(x.tipos),
      tags: ['Carteira Douglas', assessorTag],
      observacoes: linhas.join('\n'),
      compras_manuais: detalhes,
      // perfil só para NOVO (nos já-clientes o overlay preserva o derivado dos fechamentos)
      perfil: (isBuyer || inCli) ? '' : perfilDe(x.valor, x.leiloes, x.compras),
      // contato deixado vazio de propósito → o overlay preserva o que já existe
      crm_lead_id: leadByName.get(x.matchKey) ?? null,
    },
    isBuyer, inCli, nDetalhes: detalhes.length,
  }
})
console.log(`Compras detalhadas (aba Detalhes) casadas: ${payloads.reduce((s, p) => s + p.nDetalhes, 0)} linhas`)

console.log(`\nJá clientes (merge/complemento): ${jaCliente} · Novos (entram como cliente): ${novos}`)
console.log('Assessores:', [...new Set(clientes.map(x => x.assessor))].join(', '))
console.log('Valor total carteira:', brl(clientes.reduce((s, x) => s + x.valor, 0)))
console.log('exemplos novos:', payloads.filter(p => !p.isBuyer && !p.inCli).slice(0, 8).map(p => p.row.nome))

if (!COMMIT) { console.log('\n[DRY-RUN] nada gravado. Rode com --commit.'); process.exit(0) }

// ── upsert por match_key (idempotente; ON CONFLICT match_key preserva o resto) ──
// Só gravamos as colunas que agregam — o merge de exibição (getClientes) já
// preserva compras/telefone/perfil derivados. Para NÃO apagar dados de contato
// de quem já tem linha na tabela, fazemos update seletivo quando a linha existe.
let upserted = 0
for (const { row } of payloads) {
  const { data: exists } = await supabase.from('clientes').select('match_key, tags, interesses').eq('match_key', row.match_key).maybeSingle()
  if (exists) {
    // merge: une tags/interesses, não toca em contato/perfil já existentes
    const tags = [...new Set([...(Array.isArray(exists.tags) ? exists.tags : []), ...row.tags])]
    const interesses = [...new Set([...(Array.isArray(exists.interesses) ? exists.interesses : []), ...row.interesses])]
    const { error } = await supabase.from('clientes').update({
      status: row.status, recorrente: row.recorrente, tags, interesses,
      observacoes: row.observacoes, compras_manuais: row.compras_manuais, crm_lead_id: row.crm_lead_id,
    }).eq('match_key', row.match_key)
    if (error) { console.error('update', row.match_key, error.message); continue }
  } else {
    const { error } = await supabase.from('clientes').insert(row)
    if (error) { console.error('insert', row.match_key, error.message); continue }
  }
  upserted++
}
console.log(`\n✅ ${upserted}/${payloads.length} clientes gravados no módulo Clientes (carteira Douglas). Sem duplicar; contato preservado.`)
