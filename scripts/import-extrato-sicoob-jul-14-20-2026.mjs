// Importa os movimentos do extrato Sicoob de 14/07 a 20/07/2026 — a conciliacao
// no ERP ia ate 13/07. Fonte: Extrato Sicoob (Internet Banking via sessao do
// Joao), periodo 14/07-20/07/2026, lido em 20/07/2026.
//
// Validacao por saldo (banco, SALDO DO DIA do extrato):
//   13/07=75.240,55 (ancora, bate com o ERP)  14/07=74.850,92  15/07=74.668,14
//   17/07=82.206,79  20/07=53.546,76
//   net dos movimentos abaixo = -21.693,79 -> 75.240,55 - 21.693,79 = 53.546,76 (bate).
//
// Baixas amarradas (valor exato + semantica):
//  - 17/07 +12.042,00 MARCOS MARTINS VILLELA
//      -> CR "8o LEILAO JACAMIM FEMEAS - COBERTURA BULA" (f1897712, R$ 12.042, venc 22/07) RECEBIDA.
//  - 20/07 -28.660,03 DEB.CONV.TRIBUTOS FEDERAIS RFB "Simples Nacional da Bula"
//      -> CP "DAS SIMPLES NACIONAL - COMPETENCIA JUNHO/2026" (8078a8b1, R$ 28.660,03, venc 20/07) PAGA.
//
// Demais: alvara prefeitura (impostos), 2x seguros Sicoob SEG, 2x passagens
// EXPOGENETICA (viagem: Marcelo e Leo, Expogenetica CG) — despesas classificadas.
//
// Idempotente (movimento por chave natural conta+data+tipo+valor+descricao).
// Uso: DRY_RUN=1 node scripts/import-extrato-sicoob-jul-14-20-2026.mjs   (nada grava)
//      node scripts/import-extrato-sicoob-jul-14-20-2026.mjs             (grava em producao)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100
const now = () => new Date().toISOString()

const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const SALDO_BANCO = 53546.76
const FONTE = 'Extrato Sicoob (Internet Banking) periodo 14/07-20/07/2026, lido em 20/07/2026'

const CAT = {
  RECEBIMENTO_CLIENTE: 'ee101d8d-4c90-4cbc-8139-a156e046e20f',
  IMPOSTOS: '6d3270c8-2680-4cdd-a709-5b1520d1f430',
  SEGUROS: '4e96d8bf-f4f7-47d9-8d1b-f8035e7be97e',
  VIAGEM: '98083139-0fbf-487a-9988-a08519ebf259',
}

const CR_JACAMIM_VILLELA = 'f1897712-a15a-46ac-82cb-407ca43f8f58' // 12.042,00 aberto venc 22/07
const CP_SIMPLES_JUN = '8078a8b1-63b7-4641-ac44-aaaa3bd7adfe'     // 28.660,03 aberto venc 20/07

// Movimentos novos (mais antigos primeiro)
const MOVS = [
  { data: '2026-07-14', tipo: 'saida', valor: 389.63, header: 'DEB.CONV.PREFEITURA', docBanco: '2923368', contraparte: '', docContraparte: '', ref: 'Alvara Bula Assessoria', cat: CAT.IMPOSTOS, status: 'classificado' },
  { data: '2026-07-15', tipo: 'saida', valor: 119.71, header: 'DEB.CONV.SEGUROS', docBanco: 'SICOOB SEG', contraparte: 'SICOOB SEG', docContraparte: '', ref: 'Seguro Sicoob SEG', cat: CAT.SEGUROS, status: 'classificado' },
  { data: '2026-07-15', tipo: 'saida', valor: 63.07, header: 'DEB.CONV.SEGUROS', docBanco: 'SICOOB SEG', contraparte: 'SICOOB SEG', docContraparte: '', ref: 'Seguro Sicoob SEG', cat: CAT.SEGUROS, status: 'classificado' },
  { data: '2026-07-17', tipo: 'saida', valor: 2081.92, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '22.002.438 0001-41', ref: 'EXPOGENETICA passagem Marcelo ida e volta CG', cat: CAT.VIAGEM, status: 'classificado', nota: 'Mesma agencia de viagens dos pix anteriores (22.002.438/0001-41).' },
  { data: '2026-07-17', tipo: 'saida', valor: 2421.43, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '22.002.438 0001-41', ref: 'EXPOGENETICA Passagem Leo ida e volta', cat: CAT.VIAGEM, status: 'classificado', nota: 'Mesma agencia de viagens dos pix anteriores (22.002.438/0001-41).' },
  { data: '2026-07-17', tipo: 'entrada', valor: 12042.00, header: 'PIX RECEB.OUTRA IF', docBanco: 'Pix', contraparte: 'MARCOS MARTINS VILLELA', docContraparte: '***.073.156-**', ref: '', cat: CAT.RECEBIMENTO_CLIENTE, status: 'conciliado', crId: CR_JACAMIM_VILLELA, nota: 'Baixa CR 8o LEILAO JACAMIM FEMEAS - COBERTURA BULA (valor exato 12.042).' },
  { data: '2026-07-20', tipo: 'saida', valor: 28660.03, header: 'DEB.CONV.TRIBUTOS FEDERAIS - RFB', docBanco: '2922353', contraparte: '', docContraparte: '', ref: 'Simples Nacional da Bula', cat: CAT.IMPOSTOS, status: 'conciliado', cpId: CP_SIMPLES_JUN, nota: 'Baixa CP DAS SIMPLES NACIONAL COMPETENCIA JUNHO/2026 (valor exato, venc 20/07).' },
]

function descricao(m) { const tail = m.contraparte || m.ref; return m.header + (tail ? ` - ${tail}` : '') }
function observacoes(m) {
  const parts = [FONTE]
  if (m.docBanco) parts.push(`Doc banco: ${m.docBanco}`)
  if (m.contraparte) parts.push(`Contraparte: ${m.contraparte}`)
  if (m.docContraparte) parts.push(`Documento contraparte: ${m.docContraparte}`)
  if (m.ref) parts.push(`Obs: ${m.ref}`)
  if (m.nota) parts.push(m.nota)
  parts.push(m.status === 'conciliado' ? 'Conciliacao: casado com titulo' : m.status === 'pendente' ? 'Conciliacao: sem categoria confiavel; aguarda revisao' : 'Conciliacao: classificado por descricao, sem titulo')
  return parts.join(' | ')
}
function docId(m) { return 'SICOOB-2026-' + createHash('md5').update(`${m.data}|${m.tipo}|${r2(m.valor)}|${descricao(m)}`).digest('hex').slice(0, 16).toUpperCase() }

// validacao por saldo
const net = MOVS.reduce((s, m) => s + (m.tipo === 'entrada' ? m.valor : -m.valor), 0)
const { data: contaAntes } = await sb.from('erp_contas_bancarias').select('saldo_atual').eq('id', SICOOB).single()
const saldoAntes = Number(contaAntes.saldo_atual)
console.log(DRY_RUN ? '*** DRY RUN (nada gravado) ***' : '*** GRAVANDO EM PRODUCAO ***')
console.log(`Movimentos: ${MOVS.length} | net ${brl(net)}`)
console.log(`Saldo ERP antes: ${brl(saldoAntes)} + net = ${brl(r2(saldoAntes + net))} (banco: ${brl(SALDO_BANCO)})\n`)
if (r2(saldoAntes + net) !== SALDO_BANCO) throw new Error(`Saldo de verificacao NAO bate (${brl(r2(saldoAntes + net))} != ${brl(SALDO_BANCO)}) — abortando.`)

// 1) Baixa CR Jacamim / Villela (recebida 17/07)
{
  const { data: cr } = await sb.from('erp_contas_receber').select('id,status,valor').eq('id', CR_JACAMIM_VILLELA).single()
  if (cr.status === 'recebido') console.log('[=] CR Jacamim/Villela ja recebida')
  else if (DRY_RUN) console.log(`[~] baixar CR Jacamim/Villela ${brl(cr.valor)} (recebida 17/07)`)
  else {
    const { error } = await sb.from('erp_contas_receber').update({
      status: 'recebido', valor_recebido: cr.valor, data_recebimento: '2026-07-17', forma_recebimento: 'pix', updated_at: now(),
    }).eq('id', CR_JACAMIM_VILLELA)
    if (error) throw new Error(`baixa CR Jacamim: ${error.message}`)
    console.log(`[~] CR Jacamim/Villela baixada ${brl(cr.valor)} (recebida 17/07)`)
  }
}

// 2) Baixa CP DAS Simples Nacional junho (paga 20/07)
{
  const { data: cp } = await sb.from('erp_contas_pagar').select('id,status,valor').eq('id', CP_SIMPLES_JUN).single()
  if (cp.status === 'pago') console.log('[=] CP Simples Nacional junho ja paga')
  else if (DRY_RUN) console.log(`[~] baixar CP Simples Nacional junho ${brl(cp.valor)} (paga 20/07)`)
  else {
    const { error } = await sb.from('erp_contas_pagar').update({
      status: 'pago', valor_pago: cp.valor, data_pagamento: '2026-07-20', forma_pagamento: 'debito_convenio', updated_at: now(),
    }).eq('id', CP_SIMPLES_JUN)
    if (error) throw new Error(`baixa CP Simples: ${error.message}`)
    console.log(`[~] CP Simples Nacional junho baixada ${brl(cp.valor)} (paga 20/07)`)
  }
}

// 3) Movimentos do extrato
let inserted = 0, skipped = 0
for (const m of MOVS) {
  const desc = descricao(m)
  const { data: ex } = await sb.from('erp_movimentos_bancarios')
    .select('id').eq('conta_bancaria_id', SICOOB).eq('data', m.data).eq('tipo', m.tipo)
    .eq('valor', r2(m.valor)).eq('descricao', desc).maybeSingle()
  if (ex) { console.log(`[=] JA EXISTE ${m.data} ${m.tipo} ${brl(m.valor)} :: ${desc.slice(0, 50)}`); skipped++; continue }

  const payload = {
    conta_bancaria_id: SICOOB, data: m.data, tipo: m.tipo, descricao: desc, valor: r2(m.valor),
    categoria_id: m.cat || null, origem: 'importacao_sicoob_2026', documento: docId(m), observacoes: observacoes(m),
    status_conciliacao: m.status, conciliado: m.status !== 'pendente',
    conta_receber_id: m.crId || null, conta_pagar_id: m.cpId || null,
  }
  if (DRY_RUN) { console.log(`[+] ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(13)} [${m.status}]${m.cpId ? ' CP✓' : ''}${m.crId ? ' CR✓' : ''} ${desc.slice(0, 46)}`); inserted++; continue }
  const { error } = await sb.from('erp_movimentos_bancarios').insert(payload)
  if (error) throw new Error(`mov ${m.data} ${brl(m.valor)}: ${error.message}`)
  console.log(`[+] ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(13)} [${m.status}] ${desc.slice(0, 55)}`)
  inserted++
}

// 4) saldo: derivado por trigger; recalcula e confere com o banco
if (!DRY_RUN) {
  const { data: rec, error } = await sb.rpc('erp_recalc_saldo', { p_conta: SICOOB })
  if (error) throw new Error(`saldo: ${error.message}`)
  console.log(`\nSaldo derivado da conta apos import: ${brl(rec)} (banco: ${brl(SALDO_BANCO)}) ${r2(rec) === SALDO_BANCO ? '✓ BATE' : '✗ NAO BATE'}`)
}
console.log(`\nConcluido. Movimentos novos: ${inserted} | ja existiam: ${skipped}`)
