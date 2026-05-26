import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let pass = 0, fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { console.log(`  OK   ${name}${extra ? ' (' + extra + ')' : ''}`); pass++ }
  else { console.log(`  FAIL ${name}${extra ? ' (' + extra + ')' : ''}`); fail++ }
}

console.log('\n[1] Plano de contas (seed)')
{
  const { data, error } = await supa.from('erp_plano_contas').select('codigo,nome,tipo').order('codigo')
  check('Plano de contas tem ao menos 30 contas', !error && data && data.length >= 30, `total=${data?.length}`)
  const tipos = new Set((data || []).map(c => c.tipo))
  check('Contem ativo/passivo/patrimonio/receita/despesa', ['ativo','passivo','patrimonio','receita','despesa'].every(t => tipos.has(t)))
}

console.log('\n[2] Centros de custo (seed)')
{
  const { data } = await supa.from('erp_centros_custo').select('*')
  check('Centros de custo seed criados', data && data.length >= 5, `total=${data?.length}`)
}

console.log('\n[3] Categorias (seed)')
{
  const { data } = await supa.from('erp_categorias').select('*')
  const rec = (data || []).filter(c => c.tipo === 'receita').length
  const des = (data || []).filter(c => c.tipo === 'despesa').length
  check('Categorias seed criadas (receita+despesa)', rec >= 4 && des >= 10, `receita=${rec} despesa=${des}`)
}

console.log('\n[4] Conta bancaria padrao')
{
  const { data } = await supa.from('erp_contas_bancarias').select('*')
  check('Conta padrao Caixa criada', data && data.length >= 1, `total=${data?.length}`)
}

console.log('\n[5] CRUD: pessoa fornecedor')
let fornecedorId
{
  const { data, error } = await supa.from('erp_pessoas').insert({
    tipo:'pj', nome:'Fornecedor Teste S/A', documento:'00.000.000/0001-00', is_fornecedor:true, email:'forn@teste.com',
  }).select('*').single()
  fornecedorId = data?.id
  check('Insert fornecedor', !error && fornecedorId)
}

console.log('\n[6] CRUD: cliente')
let clienteId
{
  const { data, error } = await supa.from('erp_pessoas').insert({
    tipo:'pf', nome:'Cliente Teste', documento:'000.000.000-00', is_cliente:true,
  }).select('*').single()
  clienteId = data?.id
  check('Insert cliente', !error && clienteId)
}

console.log('\n[7] CRUD: conta a pagar + pagamento + saldo')
{
  const { data: banco } = await supa.from('erp_contas_bancarias').select('*').limit(1).single()
  const saldoAntes = Number(banco.saldo_atual || 0)
  const { data: cat } = await supa.from('erp_categorias').select('*').eq('tipo','despesa').limit(1).single()
  const { data: titulo, error } = await supa.from('erp_contas_pagar').insert({
    descricao:'Teste pagamento', fornecedor_id: fornecedorId, categoria_id: cat.id,
    conta_bancaria_id: banco.id, valor: 1500, vencimento: new Date().toISOString().slice(0,10),
  }).select('*').single()
  check('Insert titulo a pagar', !error && titulo?.id)

  // Simula pagamento (insere movimento)
  const { error: errMov } = await supa.from('erp_movimentos_bancarios').insert({
    conta_bancaria_id: banco.id, data: new Date().toISOString().slice(0,10), tipo:'saida',
    descricao:'Pagto titulo teste', valor: 1500, conta_pagar_id: titulo.id, origem:'pagamento',
  })
  check('Insert movimento de saida', !errMov)

  const { data: bancoDepois } = await supa.from('erp_contas_bancarias').select('saldo_atual').eq('id', banco.id).single()
  check('Trigger recalcula saldo automatico (saida)', Number(bancoDepois.saldo_atual) === saldoAntes - 1500, `antes=${saldoAntes} depois=${bancoDepois.saldo_atual}`)
}

console.log('\n[8] CRUD: conta a receber + recebimento + saldo')
{
  const { data: banco } = await supa.from('erp_contas_bancarias').select('*').limit(1).single()
  const saldoAntes = Number(banco.saldo_atual || 0)
  const { data: cat } = await supa.from('erp_categorias').select('*').eq('tipo','receita').limit(1).single()
  const { data: titulo, error } = await supa.from('erp_contas_receber').insert({
    descricao:'Teste recebimento', cliente_id: clienteId, categoria_id: cat.id,
    conta_bancaria_id: banco.id, valor: 2500, vencimento: new Date().toISOString().slice(0,10),
  }).select('*').single()
  check('Insert titulo a receber', !error && titulo?.id)

  const { error: errMov } = await supa.from('erp_movimentos_bancarios').insert({
    conta_bancaria_id: banco.id, data: new Date().toISOString().slice(0,10), tipo:'entrada',
    descricao:'Receb titulo teste', valor: 2500, conta_receber_id: titulo.id, origem:'recebimento',
  })
  check('Insert movimento de entrada', !errMov)

  const { data: bancoDepois } = await supa.from('erp_contas_bancarias').select('saldo_atual').eq('id', banco.id).single()
  check('Trigger recalcula saldo automatico (entrada)', Number(bancoDepois.saldo_atual) === saldoAntes + 2500, `antes=${saldoAntes} depois=${bancoDepois.saldo_atual}`)
}

console.log('\n[9] Lancamento contabil em partidas dobradas')
{
  const { data: contas } = await supa.from('erp_plano_contas').select('id').eq('natureza','analitica').limit(2)
  const { data: lanc, error } = await supa.from('erp_lancamentos').insert({
    data: new Date().toISOString().slice(0,10),
    historico: 'Teste lanc dobrado',
    valor_total: 500,
    origem: 'manual',
  }).select('*').single()
  check('Insert lancamento', !error && lanc?.id)

  const { error: errP } = await supa.from('erp_lancamento_partidas').insert([
    { lancamento_id: lanc.id, plano_conta_id: contas[0].id, natureza:'debito', valor: 500, ordem: 1 },
    { lancamento_id: lanc.id, plano_conta_id: contas[1].id, natureza:'credito', valor: 500, ordem: 2 },
  ])
  check('Insert partidas (debito+credito balanceados)', !errP)
}

console.log('\n[10] Funcao erp_atualizar_vencidos')
{
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 10)
  const { data: tit } = await supa.from('erp_contas_pagar').insert({
    descricao:'Vencido teste', valor: 100, vencimento: ontem.toISOString().slice(0,10), status:'aberto',
  }).select('*').single()
  await supa.rpc('erp_atualizar_vencidos')
  const { data: depois } = await supa.from('erp_contas_pagar').select('status').eq('id', tit.id).single()
  check('Funcao marca titulos vencidos', depois.status === 'vencido', `status=${depois?.status}`)
}

console.log('\n[11] View fluxo_caixa')
{
  const { data, error } = await supa.from('erp_fluxo_caixa').select('*').limit(10)
  check('View erp_fluxo_caixa funciona', !error && Array.isArray(data))
}

console.log('\n[12] Limpando dados de teste')
{
  await supa.from('erp_movimentos_bancarios').delete().or('descricao.eq.Pagto titulo teste,descricao.eq.Receb titulo teste')
  await supa.from('erp_contas_pagar').delete().in('descricao', ['Teste pagamento','Vencido teste'])
  await supa.from('erp_contas_receber').delete().eq('descricao', 'Teste recebimento')
  await supa.from('erp_lancamento_partidas').delete().eq('historico_complementar', 'Banco Caixa')
  await supa.from('erp_lancamentos').delete().eq('historico', 'Teste lanc dobrado')
  await supa.from('erp_pessoas').delete().in('id', [fornecedorId, clienteId].filter(Boolean))
  console.log('  OK   cleanup')
}

console.log(`\nResultado: ${pass} OK / ${fail} FAIL`)
process.exit(fail > 0 ? 1 : 0)
