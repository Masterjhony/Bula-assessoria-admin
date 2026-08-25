/**
 * Comissão da Laila em julho/2026 passa de 2% para 1%.
 *
 * Decisão do grupo financeiro em 05/08/2026 (Lucas, Laila e Valéria a 1%).
 * Precisa ser corrigida em TRÊS lugares, senão o ERP se contradiz:
 *
 *   1. `por_assessor` dos fechamentos de julho — é de onde sai o relatório
 *      "leilão a leilão" e a conferência que o assessor recebe;
 *   2. `comissao_assessoria` do fechamento — o total tem que continuar sendo a
 *      soma das partes, ou a auditoria de coerência acusa;
 *   3. o CP em aberto do ciclo — é o que de fato vai sair do caixa;
 *   4. `erp_folha_estrutura` — senão todo cálculo futuro volta a usar 2%.
 *
 *   npx tsx scripts/corrige-comissao-laila-julho.mts           (dry-run)
 *   npx tsx scripts/corrige-comissao-laila-julho.mts --apply
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const APPLY = process.argv.includes('--apply')
const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100
const NOVO_PCT = 0.01
const DE = '2026-07-01', ATE = '2026-07-31'
const ehLaila = (s: unknown) => /laila/i.test(String(s ?? ''))
const TAG = '[COMISSAO 1% 05/08]'

// ── 1 e 2. fechamentos de julho ────────────────────────────────────────────
const { data: fechs } = await sb.from('bula_leilao_fechamento')
    .select('id, nome, data, por_assessor, comissao_assessoria').gte('data', DE).lte('data', ATE)

type Linha = { nome?: string; vgv?: number; comissao?: number; comissao_pct?: number }
let deltaTotal = 0
const planos: { id: string; nome: string; data: string; antes: number; depois: number; novoTotal: number; pa: Linha[] }[] = []

for (const f of fechs ?? []) {
    const pa = ((f.por_assessor ?? []) as Linha[])
    if (!pa.some(a => ehLaila(a.nome))) continue
    const novo = pa.map(a => {
        if (!ehLaila(a.nome)) return a
        return { ...a, comissao_pct: NOVO_PCT, comissao: r2(Number(a.vgv || 0) * NOVO_PCT) }
    })
    const antes = r2(pa.filter(a => ehLaila(a.nome)).reduce((s, a) => s + Number(a.comissao || 0), 0))
    const depois = r2(novo.filter(a => ehLaila(a.nome)).reduce((s, a) => s + Number(a.comissao || 0), 0))
    const novoTotal = r2(novo.reduce((s, a) => s + Number(a.comissao || 0), 0))
    deltaTotal += depois - antes
    planos.push({ id: f.id, nome: f.nome, data: String(f.data).slice(0, 10), antes, depois, novoTotal, pa: novo })
}

console.log('FECHAMENTOS DE JULHO COM A LAILA:')
for (const p of planos)
    console.log(`  ${p.data} ${p.nome.slice(0, 40).padEnd(40)} comissao Laila R$ ${String(brl(p.antes)).padStart(9)}` +
        ` -> R$ ${String(brl(p.depois)).padStart(9)}   (total do leilao vira R$ ${brl(p.novoTotal)})`)
console.log(`  efeito na comissao de julho: R$ ${brl(deltaTotal)}`)

// ── 3. CP em aberto do ciclo ───────────────────────────────────────────────
const idsFech = planos.map(p => p.id)
const { data: cps } = await sb.from('erp_contas_pagar')
    .select('id, descricao, valor, status, vencimento, fechamento_id, observacoes')
    .ilike('descricao', '%LAILA%').neq('status', 'cancelado')
const alvoCp = (cps ?? []).filter(c => c.fechamento_id && idsFech.includes(c.fechamento_id))
console.log(`\nTITULOS A PAGAR LIGADOS A ESSES FECHAMENTOS: ${alvoCp.length}`)
for (const c of alvoCp) {
    const novo = r2(Number(c.valor) / 2) // de 2% para 1% = metade
    console.log(`  ${c.vencimento} ${String(c.status).padEnd(9)} R$ ${String(brl(c.valor)).padStart(9)} -> R$ ${String(brl(novo)).padStart(9)}  ${String(c.descricao).slice(0, 46)}`)
    if (c.status === 'pago') console.log('     ATENCAO: ja pago — a diferenca vira acerto, o titulo NAO e alterado')
}

// ── 4. cadastro da folha ───────────────────────────────────────────────────
const { data: folha } = await sb.from('erp_folha_estrutura').select('id, nome, comissao_pct').ilike('nome', '%LAILA%')
for (const f of folha ?? [])
    console.log(`\nFOLHA: ${f.nome} comissao_pct ${f.comissao_pct}% -> ${NOVO_PCT * 100}%`)

if (!APPLY) { console.log('\n(dry-run) use --apply para gravar'); process.exit(0) }

for (const p of planos) {
    const { error } = await sb.from('bula_leilao_fechamento')
        .update({ por_assessor: p.pa, comissao_assessoria: p.novoTotal }).eq('id', p.id)
    console.log(error ? `  ERRO ${p.nome}: ${error.message}` : `  ok ${p.nome.slice(0, 44)}`)
}
for (const c of alvoCp) {
    if (c.status === 'pago') { console.log(`  pulado (ja pago): ${String(c.descricao).slice(0, 44)}`); continue }
    const novo = r2(Number(c.valor) / 2)
    const { error } = await sb.from('erp_contas_pagar').update({
        valor: novo,
        observacoes: `${String(c.observacoes ?? '').trim()} ${TAG} Comissao de 2% para 1% conforme decisao do grupo financeiro de 05/08/2026.`.trim(),
    }).eq('id', c.id)
    console.log(error ? `  ERRO CP: ${error.message}` : `  ok CP ${String(c.descricao).slice(0, 44)} -> R$ ${brl(novo)}`)
}
for (const f of folha ?? []) {
    const { error } = await sb.from('erp_folha_estrutura').update({ comissao_pct: NOVO_PCT * 100 }).eq('id', f.id)
    console.log(error ? `  ERRO folha: ${error.message}` : `  ok folha ${f.nome} -> ${NOVO_PCT * 100}%`)
}
