// Acerta o saldo_inicial das contas para que o saldo derivado pelo trigger
// (saldo_atual = saldo_inicial + Σ movimentos — ver erp_recalc_saldo/trg_mov_saldo
// na migration 0002) bata com o BANCO. Nunca gravar saldo_atual direto: o trigger
// sobrescreve no próximo toque em qualquer movimento da conta.
//
// SICOOB: saldo_inicial = 172.894,12 — validado em 3 pontos do Internet Banking
//   (06/07/2026): 29/06=56.594,02 ✓ | 30/06=73.259,33 ✓ | 06/07=133.090,30 ✓.
// SICREDI: última referência conhecida é saldo -1.176,55 na conferência de 30/06
//   (ver memória do import Sicredi). Deriva o saldo_inicial a partir disso.
//   ⚠ CONFERIR no IB Sicredi quando possível — é referência, não extrato do dia.
//
// Uso: DRY_RUN=1 node scripts/ajusta-saldos-iniciais-2026-07-06.mjs | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100

const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const ALVOS = [
  { nome: 'Sicoob', alvoSaldo: 133090.30, saldoInicialFixo: 172894.12 },
  { nome: 'Sicredi', alvoSaldo: -1176.55, saldoInicialFixo: null }, // deriva do alvo
]

const { data: contas } = await sb.from('erp_contas_bancarias').select('id,nome,saldo_inicial,saldo_atual').eq('ativo', true)
for (const alvo of ALVOS) {
  const conta = contas.find((c) => c.nome.toLowerCase().includes(alvo.nome.toLowerCase()))
  if (!conta) { console.log(`[!] conta ${alvo.nome} não encontrada`); continue }
  const { data: movs } = await sb.from('erp_movimentos_bancarios').select('tipo,valor').eq('conta_bancaria_id', conta.id)
  const net = r2(movs.reduce((s, m) => s + (m.tipo === 'entrada' ? 1 : m.tipo === 'saida' ? -1 : 0) * Number(m.valor), 0))
  const saldoInicial = alvo.saldoInicialFixo != null ? alvo.saldoInicialFixo : r2(alvo.alvoSaldo - net)
  const saldoResultante = r2(saldoInicial + net)
  console.log(`${conta.nome}: net movs ${brl(net)} | saldo_inicial ${brl(conta.saldo_inicial)} -> ${brl(saldoInicial)} | saldo_atual ${brl(conta.saldo_atual)} -> ${brl(saldoResultante)} (alvo ${brl(alvo.alvoSaldo)})`)
  if (Math.abs(saldoResultante - alvo.alvoSaldo) > 0.01) { console.log('  [!] resultado nao bate com o alvo — revisar'); continue }
  if (DRY_RUN) continue
  const { error } = await sb.from('erp_contas_bancarias').update({ saldo_inicial: saldoInicial, updated_at: new Date().toISOString() }).eq('id', conta.id)
  if (error) throw new Error(error.message)
  const { data: rec, error: e2 } = await sb.rpc('erp_recalc_saldo', { p_conta: conta.id })
  if (e2) throw new Error(e2.message)
  console.log(`  -> recalculado: ${brl(rec)}`)
}
console.log(DRY_RUN ? '\n[DRY_RUN] nada gravado.' : '\nConcluído.')
