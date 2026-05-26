// Valida endpoints HTTP autenticados.
// Cria usuario temporario via service_role, faz signin e exercita as APIs.
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
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)

const BASE = process.env.BASE || 'http://localhost:3010'
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const tempEmail = `erp-test-${Date.now()}@bula-test.local`
const tempPwd = 'TestePwd!1Bula9'

console.log(`Criando usuario temporario: ${tempEmail}`)
const { data: created, error: errCreate } = await supa.auth.admin.createUser({
  email: tempEmail, password: tempPwd, email_confirm: true,
  user_metadata: { nome: 'ERP Test' },
})
if (errCreate) { console.error('Falha criando usuario:', errCreate.message); process.exit(1) }
const userId = created.user.id

let cookies = ''
const extractCookies = (headers) => {
  const sets = []
  if (typeof headers.getSetCookie === 'function') sets.push(...headers.getSetCookie())
  else for (const [k, v] of headers.entries()) if (k.toLowerCase() === 'set-cookie') sets.push(v)
  for (const sc of sets) {
    const pair = sc.split(';')[0]
    const [name] = pair.split('=')
    const list = cookies.split('; ').filter(Boolean).filter(p => !p.startsWith(name + '='))
    list.push(pair)
    cookies = list.join('; ')
  }
}
const req = async (path, opts = {}) => {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', cookie: cookies, ...(opts.headers || {}) },
  })
  extractCookies(res.headers)
  const text = await res.text()
  let json = null; try { json = JSON.parse(text) } catch (_) {}
  return { status: res.status, json, text }
}

let pass = 0, fail = 0
const ok = (name, c, extra = '') => { if (c) { console.log(`  OK   ${name}${extra ? ' (' + extra + ')' : ''}`); pass++ } else { console.log(`  FAIL ${name}${extra ? ' (' + extra + ')' : ''}`); fail++ } }

const cleanup = async () => {
  try { await supa.auth.admin.deleteUser(userId) } catch (_) {}
}

try {
  const signin = await req('/api/bula/auth/signin', { method:'POST', body: JSON.stringify({ email: tempEmail, password: tempPwd }) })
  ok('Login', signin.status === 200, `status=${signin.status}`)
  if (signin.status !== 200) { await cleanup(); process.exit(1) }

  const me = await req('/api/bula/auth/me')
  ok('GET /auth/me', me.status === 200 && me.json?.email === tempEmail)

  const endpoints = [
    '/api/erp/dashboard','/api/erp/plano-contas','/api/erp/categorias','/api/erp/centros-custo',
    '/api/erp/contas-bancarias','/api/erp/pessoas','/api/erp/contas-pagar','/api/erp/contas-receber',
    '/api/erp/movimentos','/api/erp/lancamentos','/api/erp/notas-fiscais','/api/erp/dre',
    '/api/erp/balanco','/api/erp/fluxo-caixa','/api/erp/empresas',
  ]
  for (const e of endpoints) {
    const r = await req(e)
    ok(`GET ${e}`, r.status === 200, `status=${r.status}`)
  }

  console.log('\n[CRUD fluxo completo]')
  const fornec = await req('/api/erp/pessoas', { method:'POST', body: JSON.stringify({ tipo:'pj', nome:'HTTP Fornec Teste', is_fornecedor:true }) })
  ok('POST pessoa (fornecedor)', fornec.status === 200)
  const fornecedorId = fornec.json?.id

  const banco = await req('/api/erp/contas-bancarias', { method:'POST', body: JSON.stringify({ nome:'Banco Teste HTTP', tipo:'corrente', saldo_inicial: 5000 }) })
  ok('POST conta bancaria', banco.status === 200)
  const bancoId = banco.json?.id

  const titulo = await req('/api/erp/contas-pagar', { method:'POST', body: JSON.stringify({
    descricao:'Titulo HTTP teste', fornecedor_id: fornecedorId, conta_bancaria_id: bancoId,
    valor: 750, vencimento: new Date().toISOString().slice(0,10),
  }) })
  ok('POST conta a pagar', titulo.status === 200 && titulo.json?.[0]?.id)
  const tituloId = titulo.json?.[0]?.id

  const pagar = await req(`/api/erp/contas-pagar/${tituloId}/pagar`, { method:'POST', body: JSON.stringify({ valor: 750, conta_bancaria_id: bancoId }) })
  ok('POST pagar', pagar.status === 200 && pagar.json?.titulo?.status === 'pago', `status=${pagar.json?.titulo?.status}`)

  const bancoDepois = await req(`/api/erp/contas-bancarias/${bancoId}`)
  ok('Saldo banco refletido (-750)', Number(bancoDepois.json?.saldo_atual) === 4250, `saldo=${bancoDepois.json?.saldo_atual}`)

  const dash = await req('/api/erp/dashboard')
  ok('Dashboard reflete pagamentos', dash.status === 200 && dash.json?.paid_30d >= 750, `paid_30d=${dash.json?.paid_30d}`)

  // Receber
  const cliente = await req('/api/erp/pessoas', { method:'POST', body: JSON.stringify({ tipo:'pj', nome:'HTTP Cli Teste', is_cliente:true }) })
  ok('POST pessoa (cliente)', cliente.status === 200)
  const clienteId = cliente.json?.id

  const tituloR = await req('/api/erp/contas-receber', { method:'POST', body: JSON.stringify({
    descricao:'Receber HTTP teste', cliente_id: clienteId, conta_bancaria_id: bancoId,
    valor: 2000, vencimento: new Date().toISOString().slice(0,10), total_parcelas: 2,
  }) })
  ok('POST conta a receber com parcelas', tituloR.status === 200 && tituloR.json?.length === 2)

  // Transferencia
  const banco2 = await req('/api/erp/contas-bancarias', { method:'POST', body: JSON.stringify({ nome:'Banco Destino HTTP', tipo:'corrente', saldo_inicial: 0 }) })
  ok('POST conta destino', banco2.status === 200)
  const banco2Id = banco2.json?.id
  const transf = await req('/api/erp/movimentos/transferencia', { method:'POST', body: JSON.stringify({ origem_id: bancoId, destino_id: banco2Id, valor: 1000 }) })
  ok('POST transferencia', transf.status === 200 && transf.json?.saida && transf.json?.entrada)

  // Lancamento
  const planoR = await req('/api/erp/plano-contas')
  const contas = planoR.json.filter(p => p.natureza === 'analitica').slice(0, 2)
  const lanc = await req('/api/erp/lancamentos', { method:'POST', body: JSON.stringify({
    historico: 'Lanc HTTP teste', data: new Date().toISOString().slice(0,10),
    partidas: [
      { plano_conta_id: contas[0].id, natureza:'debito', valor: 200 },
      { plano_conta_id: contas[1].id, natureza:'credito', valor: 200 },
    ],
  }) })
  ok('POST lancamento contabil', lanc.status === 200 && lanc.json?.id)

  // Lancamento desbalanceado deve falhar
  const lancBad = await req('/api/erp/lancamentos', { method:'POST', body: JSON.stringify({
    historico: 'Bad', data: new Date().toISOString().slice(0,10),
    partidas: [
      { plano_conta_id: contas[0].id, natureza:'debito', valor: 100 },
      { plano_conta_id: contas[1].id, natureza:'credito', valor: 50 },
    ],
  }) })
  ok('Lancamento desbalanceado rejeitado', lancBad.status === 400)

  // Conciliacao
  const movs = await req('/api/erp/movimentos?conta_bancaria_id=' + bancoId)
  const algumMov = movs.json?.[0]
  if (algumMov) {
    const conc = await req(`/api/erp/movimentos/${algumMov.id}/conciliar`, { method:'POST', body: JSON.stringify({ conciliado:true }) })
    ok('Conciliacao funciona', conc.status === 200 && conc.json?.conciliado === true)
  }

  // Cleanup
  for (const id of tituloR.json) await req(`/api/erp/contas-receber/${id.id}`, { method:'DELETE' })
  await req(`/api/erp/contas-pagar/${tituloId}`, { method:'DELETE' })
  await req(`/api/erp/lancamentos/${lanc.json.id}`, { method:'DELETE' })
  await req(`/api/erp/contas-bancarias/${bancoId}`, { method:'DELETE' })
  await req(`/api/erp/contas-bancarias/${banco2Id}`, { method:'DELETE' })
  await req(`/api/erp/pessoas/${fornecedorId}`, { method:'DELETE' })
  await req(`/api/erp/pessoas/${clienteId}`, { method:'DELETE' })
  console.log('  cleanup ok')

  await req('/api/bula/auth/signout', { method:'POST' })
} finally {
  await cleanup()
}

console.log(`\nResultado HTTP: ${pass} OK / ${fail} FAIL`)
process.exit(fail > 0 ? 1 : 0)
