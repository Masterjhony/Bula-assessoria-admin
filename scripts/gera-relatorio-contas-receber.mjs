// Relatório de Contas a Receber, segmentado em:
//   1) VENCIDOS               (status=vencido, vencimento < hoje)
//   2) A RECEBER — COM DATA   (aberto/parcial, vencimento >= hoje)
//   3) A RECEBER — SEM DATA   (sem vencimento definido)
// Uso: node scripts/gera-relatorio-contas-receber.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const HOJE = '2026-07-15' // data de referência
await supa.rpc('erp_atualizar_vencidos')

const { data: rows, error } = await supa
  .from('erp_contas_receber')
  .select('descricao,valor,valor_recebido,emissao,vencimento,status,numero_documento,observacoes,tags,cliente:erp_pessoas!cliente_id(nome)')
  .in('status', ['aberto', 'parcial', 'vencido'])
  .order('vencimento')
if (error) { console.error(error.message); process.exit(1) }

const brl = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const saldo = (r) => Number(r.valor) - Number(r.valor_recebido || 0)
const dt = (iso) => iso.split('-').reverse().join('/')
const diasAtraso = (iso) => Math.round((new Date(HOJE) - new Date(iso)) / 86400000)
const isProvisao = (r) => /provis/i.test(r.observacoes || '')
const obsLimpa = (r) => ((r.observacoes || '').trim()
  .replace(/^\s*(VALOR RETIFICADO|RECEBIDO|CANCELADO|NOTA)\s*—\s*[^:]*:\s*/i, '')
  .replace(/\s*\[CONFERIR\]\s*/gi, '')
  .replace(/\s*15\/07\/2026 \(conferencia Ana Paula\):\s*/gi, '')).trim()

// SO tem data quem tem data REAL confirmada (tag data_confirmada). O resto = sem data.
const temData = (r) => (r.tags || []).includes('data_confirmada')
const vencidos = rows.filter((r) => temData(r) && r.vencimento < HOJE)
const comData = rows.filter((r) => temData(r) && r.vencimento >= HOJE)
const semData = rows.filter((r) => !temData(r))

vencidos.sort((a, b) => a.vencimento.localeCompare(b.vencimento))
comData.sort((a, b) => a.vencimento.localeCompare(b.vencimento))

const sum = (arr) => arr.reduce((s, r) => s + saldo(r), 0)
const totV = sum(vencidos), totC = sum(comData), totS = sum(semData)
const totGeral = totV + totC + totS

// faixas de aging para vencidos
const faixa = (d) => d <= 30 ? '1–30 dias' : d <= 60 ? '31–60 dias' : d <= 90 ? '61–90 dias' : '90+ dias'
const aging = {}
for (const r of vencidos) { const f = faixa(diasAtraso(r.vencimento)); aging[f] = (aging[f] || 0) + saldo(r) }

let md = ''
md += `# Relatório de Contas a Receber\n\n`
md += `**Data de referência:** ${dt(HOJE)}  \n`
md += `**Fonte:** ERP Bula — \`erp_contas_receber\` (status pendentes: aberto / parcial / vencido)\n\n`
md += `---\n\n`
md += `## Resumo\n\n`
md += `| Segmento | Títulos | Valor (R$) | % |\n|---|---:|---:|---:|\n`
const pct = (v) => totGeral ? ((v / totGeral) * 100).toFixed(1) + '%' : '—'
md += `| 🔴 Vencidos | ${vencidos.length} | ${brl(totV)} | ${pct(totV)} |\n`
md += `| 🟢 A receber — com data prevista | ${comData.length} | ${brl(totC)} | ${pct(totC)} |\n`
md += `| ⚪ A receber — sem data | ${semData.length} | ${brl(totS)} | ${pct(totS)} |\n`
md += `| **Total a receber** | **${rows.length}** | **${brl(totGeral)}** | **100%** |\n\n`

md += `### Envelhecimento dos vencidos\n\n`
md += `| Faixa de atraso | Valor (R$) |\n|---|---:|\n`
for (const f of ['1–30 dias', '31–60 dias', '61–90 dias', '90+ dias']) {
  if (aging[f]) md += `| ${f} | ${brl(aging[f])} |\n`
}
md += `\n---\n\n`

function bloco(titulo, arr, showAtraso) {
  let s = `## ${titulo} — ${arr.length} títulos · R$ ${brl(sum(arr))}\n\n`
  if (!arr.length) { s += `_Nenhum título nesta condição._\n\n`; return s }
  const colData = showAtraso ? 'Venc.' : 'Data prevista'
  s += `| ${colData} | ${showAtraso ? 'Atraso · ' : ''}Cliente | Descrição | Valor (R$) | Observações | Doc. |\n`
  s += `|---|---|---|---:|---|---|\n`
  for (const r of arr) {
    const cli = (r.cliente?.nome || '—')
    const desc = (r.descricao || '').replace(/\|/g, '/') + (isProvisao(r) ? ' _(provisão)_' : '')
    const at = showAtraso ? `${diasAtraso(r.vencimento)}d · ` : ''
    const obs = obsLimpa(r).replace(/\|/g, '/').replace(/\n+/g, ' ')
    s += `| ${dt(r.vencimento)} | ${at}${cli} | ${desc} | ${brl(saldo(r))} | ${obs} | ${r.numero_documento || ''} |\n`
  }
  s += `\n`
  return s
}

md += bloco('🔴 VENCIDOS', vencidos, true)
md += bloco('🟢 A RECEBER — COM DATA PREVISTA', comData, false)
md += bloco('⚪ A RECEBER — SEM DATA', semData, false)

// nota sobre provisões dentro de "com data"
const provs = comData.filter(isProvisao)
if (provs.length) {
  md += `---\n\n`
  md += `> **Nota:** ${provs.length} título(s) marcado(s) como _(provisão)_ em "com data prevista" são provisões de fluxo de caixa `
  md += `(vencimento por convenção emissão+45d, **não** data firme acordada com o cliente), somando R$ ${brl(sum(provs))}. `
  md += `No ERP todo título carrega um vencimento (\`vencimento\` é NOT NULL), por isso "A receber — sem data" fica vazio; `
  md += `as provisões são o equivalente prático de "sem data firme".\n`
}

const outDir = join(root, 'outputs')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, `contas-receber-${HOJE}.md`)
writeFileSync(outPath, md, 'utf-8')

// resumo no terminal
console.log(md)
console.log('\n>>> Arquivo:', outPath)
