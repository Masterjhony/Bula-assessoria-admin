// Acrescenta as movimentacoes da conta Sicredi (caixa de leiloes) de 09 e 10/07/2026.
// A ERP ia so ate 03/07. Fonte: Extrato Sicredi (PDF IB) periodo 29/06-14/07/2026, exportado 14/07.
// Padrao da conta: RECEBIMENTO PIX (entrada) -> APLICACAO FINANCEIRA (transferencia = varredura
// automatica p/ o investimento); RESG.APLIC.FIN (transferencia = resgate p/ cobrir debitos).
//   09/07  +120,00 PIX Bula Remates | +16.666,58 PIX E-RURAL | -16.786,58 aplicacao (varredura)
//   10/07  -20,00 integr. capital | -67,64 cesta relacionamento | +86,64 resgate
// Saldo do banco (conta corrente) = R$ 0,00 (dinheiro no investimento c/ resgate automatico
// = R$ 73.603,39, fora da conta). Reancora saldo_inicial p/ o trigger derivar 0,00.
// NAO da baixa automatica: o E-RURAL 16.666,58 provavelmente e o recebimento do CR LS
// AGROPECUARIA E-RURAL (valor pre-ajuste era 16.666,58; CR hoje 18.754) — CONFERIR/baixar manual.
// Idempotente (chave natural). Uso: DRY_RUN=1 node scripts/import-extrato-sicredi-jul-09-10-2026.mjs
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
const FONTE = 'Extrato Sicredi (PDF IB) 29/06-14/07/2026, exportado 14/07/2026'
const CAT = {
  RECEBIMENTO_CLIENTE: 'ee101d8d-4c90-4cbc-8139-a156e046e20f',
  OUTRAS_RECEITAS: 'bf73ee5c-3b29-42dc-95d7-e3d37cffd604',
  APLICACAO_FINANCEIRA: 'e7198fb9-acfc-4b22-a738-dcf72000dd31',
  INTEGRALIZACAO: '9e152b58-58ac-48b3-a17d-3b9d4a6acbb2',
  TARIFAS: 'f8ae3a53-bb4e-414e-97d1-ebdca81df658',
}

const MOVS = [
  { data: '2026-07-09', tipo: 'entrada', valor: 120.00, desc: 'RECEBIMENTO PIX 50059339000131 BULA REMATES LTDA', doc: 'PIX_CRED', cat: CAT.OUTRAS_RECEITAS, status: 'classificado', obs: 'Repasse/entrada de Bula Remates LTDA (50.059.339/0001-31).' },
  { data: '2026-07-09', tipo: 'entrada', valor: 16666.58, desc: 'RECEBIMENTO PIX 31793454000190 E-RURAL ATIVIDADE', doc: 'PIX_CRED', cat: CAT.RECEBIMENTO_CLIENTE, status: 'classificado', obs: 'Recebimento via leiloeira E-RURAL. PROVAVEL baixa do CR LS AGROPECUARIA - E-RURAL (valor pre-ajuste 16.666,58; CR no ERP hoje 18.754). CONFERIR e baixar manualmente.' },
  { data: '2026-07-09', tipo: 'transferencia', valor: 16786.58, desc: 'APLICACAO FINANCEIRA', doc: 'CAPTACAO', cat: CAT.APLICACAO_FINANCEIRA, status: 'classificado', obs: 'Varredura automatica p/ aplicacao (caixa dos leiloes).' },
  { data: '2026-07-10', tipo: 'saida', valor: 20.00, desc: 'INTEGR.CAPITAL SUBSCRITO', doc: '1', cat: CAT.INTEGRALIZACAO, status: 'classificado', obs: 'Integralizacao de capital subscrito (cooperativa).' },
  { data: '2026-07-10', tipo: 'saida', valor: 67.64, desc: 'CESTA DE RELACIONAMENTO', doc: '', cat: CAT.TARIFAS, status: 'classificado', obs: 'Tarifa cesta de relacionamento Sicredi.' },
  { data: '2026-07-10', tipo: 'transferencia', valor: 86.64, desc: 'RESG.APLIC.FIN.AVISO PREV', doc: 'CAPTACAO', cat: CAT.APLICACAO_FINANCEIRA, status: 'classificado', obs: 'Resgate do investimento p/ cobrir os debitos do dia (caixa dos leiloes).' },
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
  console.log(`[+] ${m.data} ${m.tipo.padEnd(13)} ${brl(m.valor).padStart(13)} ${m.desc.slice(0, 45)}`)
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
console.log(`\n${DRY_RUN ? '[DRY_RUN] nada gravado.' : 'Concluido.'} novos: ${inserted} | ja existiam: ${skipped}`)
