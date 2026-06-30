// Conciliação automática SEGURA. Só aplica match quando é inequívoco:
//   - valor EXATO entre movimento e título;
//   - existe UM ÚNICO título aberto com aquele valor e UM ÚNICO movimento sem
//     vínculo com aquele valor na janela [emissao-5d, vencimento+45d]
//     (paga-se DEPOIS de emitir e perto do vencimento — mata o erro de "pagar
//     junho em maio");
//   - confiança reforçada: valor "quebrado" (com centavos / não múltiplo de 100)
//     OU o favorecido bate no nome. Sem isso, NÃO aplica (deixa pra revisão).
// O que não der com segurança, NÃO faz (fica pendente).
//
// Uso: DRY_RUN=1 node scripts/concilia-extrato-seguro.mjs | sem DRY_RUN aplica.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const cents = (n) => Math.round(Number(n || 0) * 100)
const addD = (iso, d) => { const x = new Date(iso + 'T00:00:00'); x.setDate(x.getDate() + d); return x }
const D = (iso) => new Date(iso + 'T00:00:00')
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const round100 = (n) => cents(n) % 10000 === 0 // múltiplo de R$100,00
const toks = (s) => [...new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4))]
  .filter((t) => !['comissao', 'leilao', 'bula', 'assessoria', 'ref', 'folha', 'despesas', '2026', 'junho', 'maio', 'abril'].includes(t))
const nameMatch = (movDesc, nome, desc) => { const h = norm(movDesc); return [...toks(nome), ...toks(desc)].some((t) => h.includes(t)) }

async function run(tipoMov, tab, pagoField, dataField, linkField, statusDone) {
  const cliField = tab === 'erp_contas_pagar' ? 'fornecedor_id' : 'cliente_id'
  const { data: movs } = await sb.from('erp_movimentos_bancarios').select('id,data,valor,descricao').eq('tipo', tipoMov).is(linkField, null)
  const { data: titulos } = await sb.from(tab).select(`id,descricao,valor,vencimento,emissao,status,pessoa:erp_pessoas!${cliField}(nome)`).in('status', ['aberto', 'vencido', 'parcial'])
  const movByVal = new Map(); for (const m of movs || []) { const k = cents(m.valor); if (!movByVal.has(k)) movByVal.set(k, []); movByVal.get(k).push(m) }
  const titByVal = new Map(); for (const t of titulos || []) { const k = cents(t.valor); if (!titByVal.has(k)) titByVal.set(k, []); titByVal.get(k).push(t) }
  const matches = [], skip = []
  for (const [val, ts] of titByVal) {
    const movs0 = movByVal.get(val) || []
    if (ts.length !== 1) continue // valor com vários títulos -> ambíguo, pula
    const t = ts[0]
    const lo = addD(t.emissao, -5), hi = addD(t.vencimento, 45)
    const inWin = movs0.filter((m) => D(m.data) >= lo && D(m.data) <= hi)
    if (inWin.length !== 1) continue // 0 ou vários movimentos na janela -> não aplica
    const m = inWin[0]
    const nm = nameMatch(m.descricao, t.pessoa?.nome, t.descricao)
    if (round100(t.valor) && !nm) { skip.push({ t, m, motivo: 'valor redondo sem nome' }); continue }
    matches.push({ t, m, nm })
  }
  return { tab, pagoField, dataField, linkField, statusDone, matches, skip }
}

const cp = await run('saida', 'erp_contas_pagar', 'valor_pago', 'data_pagamento', 'conta_pagar_id', 'pago')
const cr = await run('entrada', 'erp_contas_receber', 'valor_recebido', 'data_recebimento', 'conta_receber_id', 'recebido')

let md = '# Conciliação segura — matches inequívocos\n\n'
let total = 0
for (const [lbl, R] of [['CONTAS A PAGAR', cp], ['CONTAS A RECEBER', cr]]) {
  md += `## ${lbl}\nAplicáveis: ${R.matches.length} | Pulados (redondo s/ nome): ${R.skip.length}\n\n`
  console.log(`=== ${lbl} === aplicar ${R.matches.length} | pular ${R.skip.length}`)
  for (const x of R.matches) { md += `- ✅ ${brl(x.t.valor)} | ${x.t.status} venc ${x.t.vencimento} | "${x.t.descricao}" ↔ ${x.m.data} "${x.m.descricao.slice(0, 55)}" ${x.nm ? '·nome✓' : ''}\n`; console.log(`  ✅ ${brl(x.t.valor)} | "${x.t.descricao.slice(0,45)}" ↔ ${x.m.data} ${x.nm ? 'nome✓' : ''}`) }
  for (const x of R.skip) md += `- ⏸ ${brl(x.t.valor)} | "${x.t.descricao}" (${x.motivo})\n`
  md += '\n'
}

if (!DRY_RUN) {
  for (const R of [cp, cr]) for (const x of R.matches) {
    await sb.from('erp_movimentos_bancarios').update({ [R.linkField]: x.t.id, conciliado: true }).eq('id', x.m.id)
    await sb.from(R.tab).update({ status: R.statusDone, [R.pagoField]: x.t.valor, [R.dataField]: x.m.data, updated_at: new Date().toISOString() }).eq('id', x.t.id)
    total++
  }
  console.log(`\nAPLICADOS: ${total}`)
}
try { mkdirSync(join(root, 'outputs'), { recursive: true }) } catch {}
writeFileSync(join(root, 'outputs', 'conciliacao-segura.md'), md)
console.log(DRY_RUN ? '[DRY_RUN] relatório em outputs/conciliacao-segura.md' : 'relatório em outputs/conciliacao-segura.md')
