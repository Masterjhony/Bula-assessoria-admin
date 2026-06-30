// Abate (marca como pagas) as contas a pagar de comissão de ABRIL e MAIO/2026.
// Base: conversa com a financeira anterior (30/06/2026) — "abril e maio já foram
// pagos; agora temos que pagar junho". Junho fica em aberto (vence 25/07).
//
// Abril (venc 20/05): Leonardo 6.252, Marcelo 4.300, Fábio 24.855 (Douglas 13.644 já pago).
// Maio (venc 25/06, PROVISÓRIO): Fábio 20.763, Douglas 9.114.
//
// Idempotente: só mexe em quem ainda não está 'pago'.
// Uso: DRY_RUN=1 node scripts/abate-comissoes-abril-maio-2026.mjs | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const NOTA = 'Quitado conforme confirmação da financeira anterior (conversa 30/06/2026): abril e maio pagos. Valores de maio eram provisórios — conferir contra o detalhamento por leilão ao consolidar.'

// id -> data de pagamento (proxy = vencimento; financeira confirmou quitação)
const ALVOS = [
  { sel: 'REF. COMISSAO DE ABRIL', dp: '2026-05-20' },
  { sel: 'REF. COMISSAO DE MAIO', dp: '2026-06-25' },
]

let n = 0, soma = 0
for (const a of ALVOS) {
  const { data: rows } = await sb.from('erp_contas_pagar')
    .select('id,descricao,valor,status,observacoes,fornecedor:erp_pessoas!fornecedor_id(nome)')
    .ilike('descricao', `%${a.sel}%`).neq('status', 'pago')
  for (const c of rows || []) {
    console.log(`  ${DRY_RUN ? '[dry]' : '->'} pago ${brl(c.valor)} | ${c.fornecedor?.nome || '-'} | ${c.descricao}`)
    n++; soma += Number(c.valor || 0)
    if (DRY_RUN) continue
    const obsAdd = (c.observacoes ? c.observacoes + '\n' : '') + NOTA
    const { error } = await sb.from('erp_contas_pagar').update({
      status: 'pago', valor_pago: c.valor, data_pagamento: a.dp, observacoes: obsAdd, updated_at: new Date().toISOString(),
    }).eq('id', c.id)
    if (error) { console.error('Erro:', error.message); process.exit(1) }
  }
}
console.log(`\n${DRY_RUN ? '[DRY_RUN] ' : ''}${n} CP marcadas pagas | total ${brl(soma)}`)
