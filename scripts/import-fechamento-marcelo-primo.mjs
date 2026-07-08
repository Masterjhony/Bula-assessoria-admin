// Cria os fechamentos de 07/07/2026 (cobertura Bula) a partir do arquivo
// fechamento_marcelo_primo.xlsx (extração do WhatsApp). Dois leilões:
//   • Nelore Kriz  (bloco reportado 22:32–22:33 de 07/07)
//   • Naviraí      (bloco reportado 10:36–10:37 de 08/07)
// Valor = lance (parcela mensal) × 30 parcelas × qtd. Comissão pisteiro 2%.
// receita_bula/sobra ficam pendentes (dependem do faturamento total + acordo).
//
// Uso:  node scripts/import-fechamento-marcelo-primo.mjs           (dry-run)
//       node scripts/import-fechamento-marcelo-primo.mjs --commit  (grava)

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
const PARCELAS = 30
const COMISSAO_PCT = 0.02
const DATA = '2026-07-07'
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const cleanAssessor = (v) => String(v || '').replace(/\s*[-–]?\s*(da\s+)?bula assessoria.*/i, '').replace(/[,\s]+$/, '').trim() || 'Não informado'
const BR_UF = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'])
// Pega a UF VÁLIDA mais ao fim (evita casar "DO"/"JO" de "do Norte"/"João").
const cleanUF = (v) => {
  const toks = String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().match(/[A-Z]{2}/g) || []
  for (let i = toks.length - 1; i >= 0; i--) if (BR_UF.has(toks[i])) return toks[i]
  return ''
}
const cleanCidade = (v) => String(v || '').replace(/\s*[-–/]\s*[A-Za-z]{2}\s*$/, '').trim()
const loteCount = (v) => (String(v || '').match(/\d+/g) || []).length || 1

// ── parse ──
const wb = XLSX.readFile(join(root, 'scripts', '_tmp-fech.xlsx'))
const g = XLSX.utils.sheet_to_json(wb.Sheets['Fechamento'], { header: 1, blankrows: false })
const hRow = g.findIndex((r) => r.includes('Lote(s)') && r.includes('Comprador / Cliente'))
const H = g[hRow]; const ci = (n) => H.indexOf(n)
const c = {
  data: ci('Data'), lote: ci('Lote(s)'), valor: ci('Valor informado'), qtd: ci('Qtd'),
  cat: ci('Categoria'), assessor: ci('Assessor / Origem'), comprador: ci('Comprador / Cliente'),
  fazenda: ci('Fazenda / Propriedade'), cidade: ci('Cidade / UF'),
}
const rows = []
for (let i = hRow + 1; i < g.length; i++) {
  const r = g[i]
  const serial = Number(r[c.data])
  if (!Number.isFinite(serial) || serial <= 0) continue // pula "Notas de leitura"
  const lance = Number(r[c.valor]) || 0
  const qtd = Number(r[c.qtd]) || 1
  rows.push({
    serial,
    lotes: loteCount(r[c.lote]),
    loteLabel: String(r[c.lote] ?? '').trim(),
    lance, qtd,
    categoria: String(r[c.cat] ?? '').trim(),
    assessor: cleanAssessor(r[c.assessor]),
    comprador: String(r[c.comprador] ?? '').trim(),
    fazenda: String(r[c.fazenda] ?? '').trim(),
    cidade: cleanCidade(r[c.cidade]),
    uf: cleanUF(r[c.cidade]),
    vgv: lance * PARCELAS * qtd,
  })
}
const serials = [...new Set(rows.map((r) => r.serial))].sort((a, b) => a - b)
// menor serial (07/07) = Kriz; maior (08/07) = Naviraí
const BLOCOS = [
  { nome: 'Leilão Virtual Nelore Kriz - 07/07/2026', serial: serials[0] },
  { nome: 'Leilão Naviraí - 07/07/2026', serial: serials[1] },
]

function buildFechamento(nome, blocoRows) {
  // compradores agregados por nome (usa fazenda quando não há comprador)
  const byBuyer = new Map()
  for (const r of blocoRows) {
    const nomeCli = r.comprador || r.fazenda || 'Não informado'
    const k = nomeCli.toLowerCase()
    let e = byBuyer.get(k)
    if (!e) { e = { comprador: nomeCli, fazenda: r.fazenda || nomeCli, cidade: r.cidade, uf: r.uf, lotes: 0, animais: 0, vgv: 0 }; byBuyer.set(k, e) }
    e.lotes += r.lotes; e.animais += r.qtd; e.vgv += r.vgv
    if (!e.cidade && r.cidade) e.cidade = r.cidade
    if (!e.uf && r.uf) e.uf = r.uf
  }
  const compradores = [...byBuyer.values()].sort((a, b) => b.vgv - a.vgv).map((e, i) => ({ rank: i + 1, ...e }))

  // por assessor (comissão 2%)
  const byAss = new Map()
  for (const r of blocoRows) {
    let e = byAss.get(r.assessor)
    if (!e) { e = { nome: r.assessor, empresa: 'Bula Assessoria', vgv: 0, animais: 0, transacoes: 0 }; byAss.set(r.assessor, e) }
    e.vgv += r.vgv; e.animais += r.qtd; e.transacoes += 1
  }
  const vgvTotal = blocoRows.reduce((s, r) => s + r.vgv, 0)
  const por_assessor = [...byAss.values()].sort((a, b) => b.vgv - a.vgv).map((e, i) => ({
    nome: e.nome, empresa: e.empresa, vgv: e.vgv, animais: e.animais, transacoes: e.transacoes,
    posicao: i + 1, comissao: Math.round(e.vgv * COMISSAO_PCT), comissao_pct: COMISSAO_PCT,
    pct_total: vgvTotal ? +(e.vgv / vgvTotal).toFixed(4) : 0,
    ticket_medio: e.animais ? Math.round(e.vgv / e.animais) : 0,
  }))
  const byUf = new Map()
  for (const r of blocoRows) { const e = byUf.get(r.uf) || { uf: r.uf, vgv: 0, animais: 0, transacoes: 0 }; e.vgv += r.vgv; e.animais += r.qtd; e.transacoes += 1; byUf.set(r.uf, e) }

  const animais = blocoRows.reduce((s, r) => s + r.qtd, 0)
  const lotes = blocoRows.reduce((s, r) => s + r.lotes, 0)
  return {
    nome, data: DATA,
    lotes_vendidos: lotes, animais_vendidos: animais, compradores_unicos: compradores.length,
    vgv_total: vgvTotal,
    ticket_medio: animais ? Math.round(vgvTotal / animais) : 0,
    maior_lance: Math.max(...blocoRows.map((r) => r.lance * PARCELAS)),
    estados_alcancados: new Set(blocoRows.map((r) => r.uf).filter(Boolean)).size,
    por_assessor, por_estado: [...byUf.values()], compradores,
    comissao_assessoria: por_assessor.reduce((s, a) => s + a.comissao, 0),
    receita_bula: null, sobra_bruta: null, // pendentes: dependem do faturamento total + acordo
    observacoes: 'Cobertura Bula extraída dos fechamentos do WhatsApp (07/07/2026). '
      + 'Valores = lance (parcela mensal) × 30. Comissão pisteiro 2%. '
      + 'Receita Bula pendente do faturamento total do leilão + acordo. '
      + 'Lote 37 e 38 (Kriz): lance R$600 assumido por cabeça (2 machos).',
  }
}

const fechamentos = BLOCOS.map((b) => buildFechamento(b.nome, rows.filter((r) => r.serial === b.serial)))

for (const f of fechamentos) {
  console.log(`\n════ ${f.nome} ════`)
  console.log(`VGV ${brl(f.vgv_total)} · ${f.animais_vendidos} animais · ${f.lotes_vendidos} lotes · ${f.compradores_unicos} compradores · comissão ${brl(f.comissao_assessoria)}`)
  console.log('Compradores:')
  for (const cp of f.compradores) console.log(`  #${cp.rank} ${cp.comprador} (${cp.fazenda}${cp.cidade ? ', ' + cp.cidade : ''}${cp.uf ? '/' + cp.uf : ''}) — ${cp.lotes} lote(s), ${cp.animais} animal(is), ${brl(cp.vgv)}`)
  console.log('Assessores:', f.por_assessor.map((a) => `${a.nome} ${brl(a.vgv)} (com. ${brl(a.comissao)})`).join(' · '))
}

if (!COMMIT) { console.log('\n[DRY-RUN] nada gravado. Rode com --commit.'); process.exit(0) }

for (const f of fechamentos) {
  // idempotência: não recria se já existe fechamento com o mesmo nome+data
  const { data: ex } = await supabase.from('bula_leilao_fechamento').select('id').eq('nome', f.nome).eq('data', f.data).maybeSingle()
  if (ex) { console.log(`já existe: ${f.nome} (id ${ex.id}) — pulado`); continue }
  const { data, error } = await supabase.from('bula_leilao_fechamento').insert({ ...f, updated_at: new Date().toISOString() }).select('id').single()
  if (error) { console.error(`ERRO ${f.nome}:`, error.message); continue }
  console.log(`✅ criado: ${f.nome} (id ${data.id})`)
}
