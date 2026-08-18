/**
 * Auditoria do que foi mexido no ERP em 11/08/2026. So le — nao grava nada.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const ok = (b, msg) => console.log((b ? '  OK   ' : '  FALHA') + '  ' + msg)

const { data: cats } = await sb.from('erp_categorias').select('id,nome')
const CN = Object.fromEntries(cats.map(c => [c.id, c.nome]))

console.log('=== 1. CONCILIACAO BANCARIA ===')
const { data: conta } = await sb.from('erp_contas_bancarias').select('saldo_atual').eq('id', CONTA).single()
ok(Number(conta.saldo_atual) === 120855.22, 'saldo_atual do Sicoob = R$ ' + brl(conta.saldo_atual) + ' (banco: 120.855,22)')
const { data: mv } = await sb.from('erp_movimentos_bancarios')
  .select('data,tipo,valor,descricao,conta_pagar_id,status_conciliacao')
  .eq('conta_bancaria_id', CONTA).gte('data', '2026-08-01').order('data')
console.log('  movimentos de agosto importados: ' + mv.length + ' (ultimo: ' + mv[mv.length - 1].data + ')')
const vinc = mv.filter(m => m.conta_pagar_id).length
console.log('  amarrados a um CP: ' + vinc + ' de ' + mv.length + '  |  sem amarracao: ' + (mv.length - vinc))
const dup = {}
for (const m of mv) { const k = m.data + '|' + m.valor + '|' + m.descricao.slice(0, 40); dup[k] = (dup[k] || 0) + 1 }
ok(!Object.values(dup).some(v => v > 1), 'sem movimentos duplicados em agosto')

console.log('\n=== 2. CONTAS A PAGAR DE AGOSTO ===')
const { data: cp } = await sb.from('erp_contas_pagar').select('*').lte('vencimento', '2026-08-31')
const abertos = cp.filter(c => ['aberto', 'vencido', 'parcial'].includes(c.status))
const saldo = abertos.reduce((s, c) => s + Number(c.valor) - Number(c.valor_pago || 0), 0)
const est = abertos.filter(c => (c.tags || []).includes('estimado')).reduce((s, c) => s + Number(c.valor) - Number(c.valor_pago || 0), 0)
console.log('  em aberto: ' + abertos.length + ' linhas | R$ ' + brl(saldo) + '  (firme R$ ' + brl(saldo - est) + ' + estimado R$ ' + brl(est) + ')')

console.log('\n=== 3. AS CORRECOES QUE VOCE PEDIU ===')
const todos = await sb.from('erp_contas_pagar').select('*')
const T = todos.data
// procura pela chave de idempotencia, nao pela descricao: ISSQN e Simples tambem
// existem como registros de julho ja pagos, e a busca por texto pegava aqueles.
const acha = chave => T.find(c => c.numero_documento === chave)

const nane = T.filter(c => (c.vendedor || '').includes('NANE') && c.status !== 'cancelado')
ok(nane.length > 0 && nane.every(c => c.vencimento === '2026-12-28'),
  'Nane: ' + nane.length + ' linhas, todas em 28/12, somando R$ ' + brl(nane.reduce((s, c) => s + Number(c.valor), 0)))
ok(!abertos.some(c => (c.vendedor || '').includes('NANE')), 'Nane nao aparece mais em agosto')

const ja = T.find(c => c.descricao.includes('FIXA SDR') && c.vencimento === '2026-08-25')
ok(ja?.status === 'cancelado', 'Joao Antonio (FIXA SDR ago): status = ' + ja?.status)

const bul = T.filter(c => c.descricao.includes('BULINHA'))
const bulAberto = bul.filter(c => ['aberto', 'vencido', 'parcial'].includes(c.status))
ok(bulAberto.length === 1 && Number(bulAberto[0].valor) === 7392,
  'Bulinha: ' + bulAberto.length + ' linha em aberto de R$ ' + brl(bulAberto[0]?.valor || 0) +
  ' (as 6 comissoes de R$ 58.872,00 estao pagas)')

const iss = acha('imp-jul:issqn')
ok(iss && Number(iss.valor) === 24524.81 && iss.vencimento === '2026-08-17',
  'ISSQN: R$ ' + brl(iss?.valor) + ' venc. ' + iss?.vencimento + ' | guia ' + (iss?.nota_fiscal || '-') +
  ' | estimado=' + ((iss?.tags || []).includes('estimado')))
const das = acha('imp-jul:simples')
ok(das && Number(das.valor) === 56000, 'Simples: R$ ' + brl(das?.valor) + ' venc. ' + das?.vencimento)

const alu = T.find(c => c.descricao.includes('Aluguel do escrit'))
ok(alu?.status === 'cancelado', 'Aluguel do escritorio: ' + alu?.status)
const cafeFut = T.filter(c => c.descricao.includes('quina de caf') && c.vencimento > '2026-08-31' && c.status !== 'cancelado')
ok(cafeFut.length === 0, 'Maquina de cafe: ' + cafeFut.length + ' recorrencia futura ativa (esperado 0)')

const casaPaga = T.find(c => c.numero_documento === 'desp-expo:casa')
const casaSaldo = T.find(c => c.numero_documento === 'desp-expo:casa-saldo')
ok(casaPaga?.status === 'pago' && Number(casaPaga.valor) === 2000 && Number(casaSaldo?.valor) === 5000,
  'Casa Uberaba: 1a parcela R$ ' + brl(casaPaga?.valor) + ' (' + casaPaga?.status + ') + saldo R$ ' + brl(casaSaldo?.valor))

for (const ch of ['pago-ago:trafego-pago', 'pago-ago:diarias-matheus-julho']) {
  const x = T.find(c => c.numero_documento === ch)
  ok(x?.status === 'pago', ch + ': R$ ' + brl(x?.valor) + ' (' + x?.status + ')')
}
const dobrado = T.find(c => c.numero_documento === 'desp-expo:equipe')
ok(dobrado?.status === 'cancelado', 'estimativa dobrada da passagem Expogenetica: ' + dobrado?.status)

console.log('\n=== 4. COMISSOES DE 25/08 POR ASSESSOR ===')
const c25 = abertos.filter(c => c.vencimento === '2026-08-25' && CN[c.categoria_id] === 'Comissão Funcionário')
const por = {}
for (const c of c25) por[c.vendedor || '(sem vendedor)'] = (por[c.vendedor || '(sem vendedor)'] || 0) + Number(c.valor)
for (const [n, v] of Object.entries(por).sort((a, b) => b[1] - a[1])) console.log('  ' + n.padEnd(22) + 'R$ ' + brl(v).padStart(11))
console.log('  ' + 'TOTAL'.padEnd(22) + 'R$ ' + brl(Object.values(por).reduce((s, v) => s + v, 0)).padStart(11))
ok(c25.every(c => c.vendedor), 'todos os CP de comissao de 25/08 tem o assessor gravado no campo vendedor')

console.log('\n=== 5. INCONSISTENCIAS ===')
const rusa = T.filter(c => c.descricao.includes('RUSA'))
const catsRusa = [...new Set(rusa.map(c => CN[c.categoria_id]))]
ok(catsRusa.length === 1, 'categoria dos CP do Rusa: ' + catsRusa.join(' + ') + (catsRusa.length > 1 ? '  <-- divergente' : ''))
const semCat = abertos.filter(c => !c.categoria_id)
ok(semCat.length === 0, semCat.length + ' CP em aberto sem categoria')
const zerados = abertos.filter(c => Number(c.valor) === 0)
ok(zerados.length === 0, zerados.length + ' CP em aberto com valor zero' +
  (zerados.length ? ': ' + zerados.map(c => c.descricao).join(', ') : ''))
const docs = T.filter(c => c.numero_documento).map(c => c.numero_documento)
const dupDoc = docs.filter((d, i) => docs.indexOf(d) !== i)
ok(dupDoc.length === 0, 'chaves de idempotencia duplicadas: ' + (dupDoc.length ? [...new Set(dupDoc)].join(', ') : 'nenhuma'))
