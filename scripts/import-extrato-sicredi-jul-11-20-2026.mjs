// Acrescenta as movimentacoes da conta Sicredi (caixa de leiloes) de 11 a 20/07/2026.
// O ERP ia ate 10/07. Fonte: Extrato Sicredi (Internet Banking, sessao do Joao),
// periodo 11/07-20/07/2026, lido em 20/07/2026.
//
// Extrato (saldo por linha, conta corrente):
//   15/07 +6.313,00 PIX JOSE ANTONIO FERNAND(ES) | +1.520,00 PIX KATAYAMA AGRONEGOCIO
//         -7.832,00 APLICACAO FINANCEIRA (varredura) -> saldo 1,00
//   17/07 -51.871,50 PAGAMENTO PIX FELIPE VILELA ANDRADE (doc CX577128)
//         +51.598,04 e +272,46 RESG.APLIC.FIN.AVISO PREV -> saldo 0,00
// Saldo conta corrente em 20/07 = R$ 0,00 (padrao varredura).
// Saldo de investimentos com resgate automatico em 20/07 = R$ 29.577,20
//   (era 73.603,39 em 14/07 — resgates de 51.870,50 cobriram o pagamento ao Vilela).
//
// NAO da baixa automatica (conferir manualmente):
//  - Katayama +1.520,00: PROVAVEL CR "KATAYAMA TRILOGIA (1-2/06) - COMISSAO BULA"
//    (60daa4cf, R$ 1.512,00, venc 17/07, vencido) — difere R$ 8,00. CONFERIR e baixar manual.
//  - Jose Antonio +6.313,00: nenhum CR aberto com esse valor. IDENTIFICAR origem.
//  - Felipe Vilela -51.871,50: mesmo beneficiario dos pass-through anteriores (38k, 98k);
//    tratado como Transferencia Interna - Saida (dinheiro de leilao, fora do P&L). CONFERIR.
//
// Idempotente (chave natural conta+data+tipo+valor+descricao).
// Uso: DRY_RUN=1 node scripts/import-extrato-sicredi-jul-11-20-2026.mjs
//      node scripts/import-extrato-sicredi-jul-11-20-2026.mjs
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
const SALDO_BANCO = 0.00
const SALDO_APLICACAO = 29577.20
const FONTE = 'Extrato Sicredi (Internet Banking) 11/07-20/07/2026, lido em 20/07/2026'
const CAT = {
  RECEBIMENTO_CLIENTE: 'ee101d8d-4c90-4cbc-8139-a156e046e20f',
  APLICACAO_FINANCEIRA: 'e7198fb9-acfc-4b22-a738-dcf72000dd31',
  TRANSF_SAIDA: '1d83b7e5-aa77-4e1d-a774-64ecfda0b746',
}

const MOVS = [
  { data: '2026-07-15', tipo: 'entrada', valor: 6313.00, desc: 'RECEBIMENTO PIX 10909280843 JOSE ANTONIO FERNAND', doc: 'PIX_CRED', cat: CAT.RECEBIMENTO_CLIENTE, status: 'classificado', obs: 'Recebimento de leilao (caixa). Nenhum CR aberto com 6.313,00 — IDENTIFICAR origem.' },
  { data: '2026-07-15', tipo: 'entrada', valor: 1520.00, desc: 'RECEBIMENTO PIX 37176287000115 KATAYAMA AGRONEGO', doc: 'PIX_CRED', cat: CAT.RECEBIMENTO_CLIENTE, status: 'classificado', obs: 'PROVAVEL CR KATAYAMA TRILOGIA (60daa4cf, R$ 1.512, venc 17/07) — difere R$ 8,00. CONFERIR e baixar manual.' },
  { data: '2026-07-15', tipo: 'transferencia', valor: 7832.00, desc: 'APLICACAO FINANCEIRA', doc: 'CAPTACAO', cat: CAT.APLICACAO_FINANCEIRA, status: 'classificado', obs: 'Varredura automatica p/ aplicacao (caixa dos leiloes).' },
  { data: '2026-07-17', tipo: 'saida', valor: 51871.50, desc: 'PAGAMENTO PIX 02488025186 FELIPE VILELA ANDRADE', doc: 'CX577128', cat: CAT.TRANSF_SAIDA, status: 'classificado', obs: 'Repasse de leilao a Felipe Vilela Andrade (mesmo beneficiario dos pass-through 38k/98k). Dinheiro de leilao, fora do P&L. CONFERIR.' },
  { data: '2026-07-17', tipo: 'transferencia', valor: 51598.04, desc: 'RESG.APLIC.FIN.AVISO PREV', doc: 'CAPTACAO', cat: CAT.APLICACAO_FINANCEIRA, status: 'classificado', obs: 'Resgate do investimento p/ cobrir o pagamento do dia (caixa dos leiloes).' },
  { data: '2026-07-17', tipo: 'transferencia', valor: 272.46, desc: 'RESG.APLIC.FIN.AVISO PREV', doc: 'CAPTACAO', cat: CAT.APLICACAO_FINANCEIRA, status: 'classificado', obs: 'Resgate complementar p/ zerar o dia (caixa dos leiloes).' },
]

const docId = (m) => 'SICREDI-2026-' + createHash('md5').update(`${m.data}|${m.tipo}|${r2(m.valor)}|${m.desc}`).digest('hex').slice(0, 16).toUpperCase()

console.log(DRY_RUN ? '*** DRY RUN ***\n' : '*** GRAVANDO ***\n')
let inserted = 0, skipped = 0
for (const m of MOVS) {
  const { data: ex } = await sb.from('erp_movimentos_bancarios').select('id')
    .eq('conta_bancaria_id', SICREDI).eq('data', m.data).eq('tipo', m.tipo).eq('valor', r2(m.valor)).eq('descricao', m.desc).maybeSingle()
  if (ex) { console.log(`[=] ja existe ${m.data} ${m.tipo} ${brl(m.valor)}`); skipped++; continue }
  const payload = {
    conta_bancaria_id: SICREDI, data: m.data, tipo: m.tipo, descricao: m.desc, valor: r2(m.valor),
    categoria_id: m.cat, origem: 'importacao_sicredi_2026', documento: docId(m),
    observacoes: `${FONTE} | Doc banco: ${m.doc || '—'} | ${m.obs}`, status_conciliacao: m.status, conciliado: m.status !== 'pendente',
  }
  console.log(`[+] ${m.data} ${m.tipo.padEnd(13)} ${brl(m.valor).padStart(13)} ${m.desc.slice(0, 48)}`)
  if (!DRY_RUN) { const { error } = await sb.from('erp_movimentos_bancarios').insert(payload); if (error) throw new Error(error.message) }
  inserted++
}

// reancora saldo_inicial p/ o trigger derivar o saldo real do banco (R$ 0,00)
const { data: all } = await sb.from('erp_movimentos_bancarios').select('tipo,valor').eq('conta_bancaria_id', SICREDI)
const net = r2(all.reduce((s, x) => s + (x.tipo === 'entrada' ? 1 : x.tipo === 'saida' ? -1 : 0) * Number(x.valor), 0))
const novoInicial = r2(SALDO_BANCO - net)
console.log(`\nNet entrada/saida (${all.length} movs): ${brl(net)} | saldo_inicial p/ derivar ${brl(SALDO_BANCO)} = ${brl(novoInicial)}`)
if (!DRY_RUN) {
  await sb.from('erp_contas_bancarias').update({ saldo_inicial: novoInicial, updated_at: now() }).eq('id', SICREDI)
  const { data: rec } = await sb.rpc('erp_recalc_saldo', { p_conta: SICREDI })
  console.log(`-> saldo Sicredi recalculado: ${brl(rec)} ${r2(rec) === SALDO_BANCO ? '(BATE com o banco)' : '(NAO BATE!)'}`)
}
console.log(`\nSaldo da aplicacao (fora da conta corrente) em 20/07: ${brl(SALDO_APLICACAO)}`)
console.log(`${DRY_RUN ? '[DRY_RUN] nada gravado.' : 'Concluido.'} novos: ${inserted} | ja existiam: ${skipped}`)
