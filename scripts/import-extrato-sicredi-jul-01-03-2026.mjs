// Acrescenta as movimentações da conta Sicredi (varredura de leilões) de 01 e 03/07/2026,
// lidas do app Sicredi em 06/07/2026. Padrão da conta: RECEBIMENTO PIX (entrada) ->
// APLICACAO FINANCEIRA (transferencia, varredura automática p/ o investimento).
//   01/07  +1.178,69 PIX Tokio Marine (estorno/indeniz. do seguro debitado 24/06) | -1.177,69 aplicação
//   03/07  +4.050,00 PIX Claudio Sabino Carva (comprador)                         | -4.050,00 aplicação
// Saldo atual do banco (conta corrente): R$ 1,00 -> reancora saldo_inicial p/ o trigger derivar 1,00.
// Idempotente (chave natural). Uso: DRY_RUN=1 node scripts/import-extrato-sicredi-jul-01-03-2026.mjs
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
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100
const now = () => new Date().toISOString()

const SICREDI = 'af4724ec-e098-4e13-b172-04b2bfb1949d'
const SALDO_BANCO = 1.00
const FONTE = 'Extrato Sicredi (app) — lido em 06/07/2026'
const CAT = {
  RECEBIMENTO_CLIENTE: 'ee101d8d-4c90-4cbc-8139-a156e046e20f',
  OUTRAS_RECEITAS: 'bf73ee5c-3b29-42dc-95d7-e3d37cffd604',
  APLICACAO_FINANCEIRA: 'e7198fb9-acfc-4b22-a738-dcf72000dd31',
}

const MOVS = [
  { data: '2026-07-01', tipo: 'entrada', valor: 1178.69, desc: 'RECEBIMENTO PIX 33164021000100 TOKIO MARINE SEGU', cat: CAT.OUTRAS_RECEITAS, status: 'classificado', obs: 'Estorno/indenização de seguro Tokio Marine (contrapartida do débito convênio Tokio Marine de 24/06 = -1.177,55).' },
  { data: '2026-07-01', tipo: 'transferencia', valor: 1177.69, desc: 'APLICACAO FINANCEIRA', cat: CAT.APLICACAO_FINANCEIRA, status: 'classificado', obs: 'Varredura automática p/ aplicação (caixa dos leilões).' },
  { data: '2026-07-03', tipo: 'entrada', valor: 4050.00, desc: 'RECEBIMENTO PIX 02956670603 CLAUDIO SABINO CARVA', cat: CAT.OUTRAS_RECEITAS, status: 'classificado', obs: 'A RECEBER — reembolso das Despesas Operacionais do Leilão Naviraí Expozebu (contrapartida da CP "Despesas - LEILÃO NAViRAÍ - EXPOZEBU" R$ 4.050, vencida 27/05). Pago via PIX por Claudio Sabino Carvalho.' },
  { data: '2026-07-03', tipo: 'transferencia', valor: 4050.00, desc: 'APLICACAO FINANCEIRA', cat: CAT.APLICACAO_FINANCEIRA, status: 'classificado', obs: 'Varredura automática p/ aplicação (caixa dos leilões).' },
]

const docId = (m) => 'SICREDI-2026-' + createHash('md5').update(`${m.data}|${m.tipo}|${r2(m.valor)}|${m.desc}`).digest('hex').slice(0, 16).toUpperCase()

console.log(DRY_RUN ? '*** DRY RUN ***\n' : '*** GRAVANDO ***\n')
let inserted = 0, skipped = 0
for (const m of MOVS) {
  const { data: ex } = await sb.from('erp_movimentos_bancarios').select('id')
    .eq('conta_bancaria_id', SICREDI).eq('data', m.data).eq('tipo', m.tipo).eq('valor', r2(m.valor)).eq('descricao', m.desc).maybeSingle()
  if (ex) { console.log(`[=] já existe ${m.data} ${m.tipo} ${brl(m.valor)}`); skipped++; continue }
  const payload = {
    conta_bancaria_id: SICREDI, data: m.data, tipo: m.tipo, descricao: m.desc, valor: r2(m.valor),
    categoria_id: m.cat, origem: 'importacao_sicredi_2026', documento: docId(m),
    observacoes: `${FONTE} | ${m.obs}`, status_conciliacao: m.status, conciliado: m.status !== 'pendente',
  }
  console.log(`[+] ${m.data} ${m.tipo.padEnd(13)} ${brl(m.valor).padStart(13)} ${m.desc.slice(0, 45)}`)
  if (!DRY_RUN) { const { error } = await sb.from('erp_movimentos_bancarios').insert(payload); if (error) throw new Error(error.message) }
  inserted++
}

// reancora saldo_inicial p/ o trigger derivar o saldo real do banco (R$ 1,00)
const { data: all } = await sb.from('erp_movimentos_bancarios').select('tipo,valor').eq('conta_bancaria_id', SICREDI)
const net = r2(all.reduce((s, x) => s + (x.tipo === 'entrada' ? 1 : x.tipo === 'saida' ? -1 : 0) * Number(x.valor), 0))
const novoInicial = r2(SALDO_BANCO - net)
console.log(`\nNet entrada/saída (${all.length} movs): ${brl(net)} | saldo_inicial p/ derivar ${brl(SALDO_BANCO)} = ${brl(novoInicial)}`)
if (!DRY_RUN) {
  await sb.from('erp_contas_bancarias').update({ saldo_inicial: novoInicial, updated_at: now() }).eq('id', SICREDI)
  const { data: rec } = await sb.rpc('erp_recalc_saldo', { p_conta: SICREDI })
  console.log(`-> saldo Sicredi recalculado: ${brl(rec)}`)
}
console.log(`\n${DRY_RUN ? '[DRY_RUN] nada gravado.' : 'Concluído.'} novos: ${inserted} | já existiam: ${skipped}`)
