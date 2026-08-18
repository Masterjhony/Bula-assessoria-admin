/**
 * Preenche erp_contas_pagar.vendedor nos CP de comissao de julho/2026, para que o
 * ERP e o relatorio consigam abrir a conta por assessor (e nao so por leilao).
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

// "COMISSAO <leilao> - <NOME> (2%)"  ->  NOME
const extrai = (desc) => {
  const m = desc.match(/^COMISSAO\s+.*\s-\s([^-()]+?)\s*\(\d+%\)\s*$/i)
  if (m) return m[1].trim()
  const f = desc.match(/^COMISSAO FIXA SDR\s*-\s*([^-]+?)\s*-\s*ref/i)
  if (f) return f[1].trim()
  return null
}
const CANON = {
  'FABIO OMENA': 'FÁBIO OMENA', 'FÁBIO OMENA': 'FÁBIO OMENA',
  'LEONARDO SERAFIM': 'LEONARDO SERAFIM', 'DOUGLAS BISPO': 'DOUGLAS BISPO',
  'NANE': 'NANE', 'PERALTA': 'PERALTA', 'NANE / FABIO OMENA': 'NANE / FÁBIO OMENA',
  'A DEFINIR': 'A DEFINIR', 'JOÃO ANTONIO': 'JOÃO ANTONIO',
}

const { data: cps } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,vendedor,vencimento')
  .eq('vencimento', '2026-08-25').ilike('descricao', 'COMISSAO%').order('descricao')

const porAssessor = {}
let semMatch = 0
for (const cp of cps || []) {
  const bruto = extrai(cp.descricao)
  if (!bruto) { semMatch++; console.log('SEM MATCH: ' + cp.descricao); continue }
  const nome = CANON[bruto.toUpperCase()] || bruto.toUpperCase()
  porAssessor[nome] = (porAssessor[nome] || 0) + Number(cp.valor)
  if (cp.vendedor !== nome && APPLY) {
    const { error } = await sb.from('erp_contas_pagar').update({ vendedor: nome }).eq('id', cp.id)
    if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
  }
}

console.log('\n=== COMISSOES REF. JULHO/2026 — VENCIMENTO 25/08 ===')
let tot = 0
for (const [n, v] of Object.entries(porAssessor).sort((a, b) => b[1] - a[1])) {
  tot += v
  console.log('  ' + n.padEnd(22) + 'R$ ' + v.toFixed(2).padStart(11))
}
console.log('  ' + 'TOTAL'.padEnd(22) + 'R$ ' + tot.toFixed(2).padStart(11))
console.log('\n' + (cps?.length || 0) + ' lancamentos, ' + semMatch + ' sem match. ' + (APPLY ? 'APLICADO' : 'DRY-RUN'))
