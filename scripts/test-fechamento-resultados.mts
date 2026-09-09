import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const known = { id: 'known', nome: 'Conhecido', data: '2026-04-14', receita_bula: 100, comissao_assessoria: 20, sobra_bruta: 80, despesas_variaveis: 5 }
const zero = { ...known, id: 'zero', nome: 'Zero', receita_bula: 0, comissao_assessoria: 0, sobra_bruta: 0, despesas_variaveis: 0 }
const unknown = { ...known, id: 'unknown', nome: 'Pendente', sobra_bruta: null }

function erpContext(rows: object[]) {
  const script = fs.readFileSync('src/app/erp/erp.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1]
  const ast = ts.createSourceFile('erp.js', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  assert.equal(ast.parseDiagnostics.length, 0, 'JavaScript do ERP deve ser válido')
  const names = ['flImposto', 'flDespesas', 'flLucroLiquido', 'flResumoResultado', 'flValorResultado', 'flCorResultado', 'flNotaResultado', 'renderFechamentoLeiloes', 'flOpenDetail', 'flExportCSV', 'acPayloadFromForm', 'resChart']
  const functions = ast.statements.filter(s => ts.isFunctionDeclaration(s) && names.includes(s.name?.text || '')).map(s => s.getText(ast)).join('\n')
  const page = { innerHTML: '' }; let detail = ''; let blob: Blob | undefined
  const ctx = vm.createContext({
    state: { fechamentos: rows, recebimentos: [], filters: {} }, FL_IMPOSTO_PCT: .18, FL_MESES: [], RES_MESES: ['jan', 'fev', 'mar'], fmtCompact: (v: unknown) => String(v),
    flFilteredRows: () => rows, flLeiloeirasPanel: () => '', flResolverAcordo: () => null, flReceitaEsperada: () => null,
    flDataCurta: (s: string) => s, flRecebChip: () => '', flComissaoAssessores: () => [], flRecebimentoSection: () => '', flLancesSection: () => '',
    fmtBRL: (v: number) => `R$ ${Number(v).toFixed(2)}`, escapeHtml: (s: unknown) => String(s ?? ''),
    document: { getElementById: () => page, createElement: () => ({ click() {} }) },
    openModal: (html: string) => { detail = html }, toast() {}, Blob,
    URL: { createObjectURL(b: Blob) { blob = b; return 'blob:test' }, revokeObjectURL() {} },
    acRound: (v: number) => Math.round(v * 100) / 100,
  })
  vm.runInContext(functions, ctx)
  return { ctx, page, detail: () => detail, csv: async () => blob?.text() }
}

test('linha e detalhe preservam desconhecido, zero e resultado conhecido', async () => {
  const { ctx, page, detail } = erpContext([unknown, zero, known])
  assert.equal(ctx.flLucroLiquido(unknown), null)
  assert.equal(ctx.flLucroLiquido(zero), 0)
  assert.equal(ctx.flLucroLiquido(known), 57) // cálculo e imposto18% existentes
  assert.equal(ctx.flLucroLiquido({ ...known, receita_bula: null }), null)
  assert.equal(ctx.flLucroLiquido({ ...known, comissao_assessoria: null }), null)
  await ctx.renderFechamentoLeiloes()
  const pendingRow = page.innerHTML.match(/<tr[^>]*onclick="flOpenDetail\('unknown'\)"[\s\S]*?<\/tr>/)![0]
  assert.equal((pendingRow.match(/Não apurado/g) || []).length, 2)
  ctx.flOpenDetail('unknown')
  assert.equal((detail().match(/Não apurado/g) || []).length, 2)
  assert.match(page.innerHTML, /Subtotal cadastrado: R\$ 80.00/)
  assert.match(page.innerHTML, /Subtotal cadastrado: R\$ 57.00/)
  assert.match(page.innerHTML, /1 resultado não apurado/)
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.flResumoResultado([null, null]))), { total: null, parcial: null, apurados: 0, pendentes: 2 })
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.flResumoResultado([0, 80]))), { total: 80, parcial: 80, apurados: 2, pendentes: 0 })
})

test('CSV deixa resultados desconhecidos vazios, explicita situação e conserva zero', async () => {
  const { ctx, csv } = erpContext([unknown, zero, known])
  ctx.flExportCSV()
  const lines = (await csv())!.split('\n').map(line => line.split(';').map(s => s.replace(/^"|"$/g, '')))
  assert.equal(lines[0][13], 'Situacao do Resultado')
  assert.deepEqual([lines[1][9], lines[1][12], lines[1][13]], ['', '', 'Não apurado'])
  assert.deepEqual([lines[2][9], lines[2][12], lines[2][13]], ['0', '0', 'Calculado com campos preenchidos'])
  assert.deepEqual([lines[3][9], lines[3][12]], ['80', '57'])
})

test('editar acordo não transforma resultado não apurado em valor calculado', () => {
  const { ctx } = erpContext([])
  const form = { row: unknown, receita: 100, comissao: 20, despesas: 5, descricao: '', pctFat: null, pctVenda: null, fat: null }
  ctx.acReadForm = () => form
  assert.equal(ctx.acPayloadFromForm('x').sobra_bruta, null)
  ctx.acReadForm = () => ({ ...form, row: known })
  assert.equal(ctx.acPayloadFromForm('x').sobra_bruta, 80)
  assert.ok(!('sobra_bruta' in ctx.acPayloadFromForm('x', true)))
})

test('gráfico de lucro quebra a linha no mês sem resultado e mantém zero', () => {
  const { ctx } = erpContext([])
  const svg = ctx.resChart([{ lucro_liquido: 57 }, { lucro_liquido: null }, { lucro_liquido: 0 }], { series: [{ key: 'lucro_liquido', label: 'Lucro', color: '#123456', breakGaps: true }] })
  const d = svg.match(/<path d="([^"]*)" fill="none"/)[1]
  assert.equal((d.match(/M/g) || []).length, 2)
  assert.ok(!d.includes('L'), 'Não ligar resultados através do mês desconhecido')
  assert.equal((svg.match(/r="3"/g) || []).length, 2, 'Zero conhecido continua desenhado')
})

async function resultados(rows: object[], finance = true, historical: object[] = []) {
  const source = fs.readFileSync('src/app/api/erp/resultados/route.ts', 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const selected: string[] = []
  const sb = { from(table: string) {
    const q = { select(s: string) { selected.push(s); return q }, order() { return q }, range() { return q }, then(resolve: (v: unknown) => unknown) { return Promise.resolve(resolve({ data: table === 'bula_leilao_fechamento' ? rows : historical, error: null })) } }
    return q
  } }
  const ctx = vm.createContext({ exports: {}, require: (name: string) => name === '@/lib/erp'
    ? { admin: () => sb, guard: async () => ({}), ok: (x: object) => x, fail: (x: string) => { throw new Error(x) } }
    : { getIsFinanceAdmin: async () => finance } })
  vm.runInContext(code, ctx)
  const result = await ctx.exports.GET({})
  assert.ok(selected.some(s => s.includes('sobra_bruta')))
  return result
}

test('API propaga lacuna por mês e ano sem contaminar subtotal conhecido', async () => {
  const r = await resultados([unknown, known, zero, { ...known, data: '2026-05-01' }])
  const a = r.porAno['2026']
  assert.equal(a.meses[3].lucro_liquido, null)
  assert.equal(a.meses[3].lucro_liquido_parcial, 57)
  assert.equal(a.meses[3].lucros_apurados, 2)
  assert.equal(a.meses[3].lucros_pendentes, 1)
  assert.equal(a.meses[4].lucro_liquido, 57)
  assert.equal(a.total.lucro_liquido, null)
  assert.equal(a.total.lucro_liquido_parcial, 114)
  assert.equal(a.meses[5].lucro_liquido, null)
  assert.equal(a.meses[5].lucros_pendentes, 0)
  assert.equal(a.total.imposto, 54) // tratamento de tributo não alterado
})

test('API distingue todos desconhecidos de zero conhecido e preserva histórico', async () => {
  const unknowns = await resultados([unknown, unknown])
  assert.equal(unknowns.porAno['2026'].total.lucro_liquido, null)
  assert.equal(unknowns.porAno['2026'].total.lucro_liquido_parcial, null)
  assert.equal(unknowns.porAno['2026'].total.lucros_pendentes, 2)
  const zeros = await resultados([zero])
  assert.equal(zeros.porAno['2026'].total.lucro_liquido, 0)
  assert.equal(zeros.porAno['2026'].total.lucros_pendentes, 0)
  const hist = await resultados([], true, [{ ano: 2025, mes: 0, receita: 1000, leiloes: 10 }])
  assert.equal(hist.porAno['2025'].total.receita, 1000)
  assert.equal(hist.porAno['2025'].total.lucro_liquido, null)
})

test('API não expõe subtotal financeiro a usuário sem permissão', async () => {
  const r = await resultados([known, unknown], false)
  const a = r.porAno['2026']
  assert.equal(a.total.lucro_liquido, null)
  assert.equal(a.total.lucro_liquido_parcial, null)
  assert.equal(a.meses[3].lucro_liquido_parcial, null)
})
