import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const ASSESSORIA = 'Bula Assessoria', REMATES = 'Bula Remates'
// Regressão do fechamento Flor do Arataú de 07/06: a ocorrência é da
// Remates, embora Douglas esteja cadastrado na equipe da Assessoria.
const flor = {
  id: 'flor', nome: '9º Leilão Nelore Flor do Arataú', data: '2026-06-07', comissao_assessoria: 0,
  por_assessor: [{ nome: 'Douglas Bispo', empresa: REMATES, vgv: 312300, animais: 14, transacoes: 14, comissao: 0 }],
  lances: [{ assessor: 'Douglas Bispo', lote: 'Flor', comprador: 'Compra Remates', vgv: 312300, animais: 14 }],
}
const assessoria = {
  id: 'assessoria', nome: 'Evento Assessoria', data: '2026-06-08', comissao_assessoria: 2000,
  por_assessor: [{ nome: 'Douglas', empresa: ASSESSORIA, vgv: 100000, animais: 2, transacoes: 1, comissao: 2000, pago: true }],
  lances: [{ assessor: 'Douglas', lote: 'Assessoria', comprador: 'Compra Assessoria', vgv: 100000, animais: 2 }],
}

function erpContext(rows: object[], titulos: object[] = []) {
  const script = fs.readFileSync('src/app/erp/erp.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1]
  const ast = ts.createSourceFile('erp.js', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  assert.equal(ast.parseDiagnostics.length, 0)
  const names = new Set(['coStrip', 'coKey', 'CO_CANONICO', 'coEquipeMaps', 'coCanonNome', 'coEmpresaFixa', 'coNorm', 'coNomesTitulo', 'coBeneficiariosTitulo', 'CO_EMPRESAS', 'coEmpresa', 'coEmpresaOcorrencia', 'coTitulosNoPeriodo', 'coOpcoesAssessores', 'coFiltrarOpcoes', 'coFilteredFechamentos', 'flComissaoAssessores', 'coAggregate', 'coVendasDe', 'renderComissionamento', 'coOpenDetail', 'coFiltroDesc', 'coPdf', 'coPdfGeral', 'coExportCSV'])
  const code = ast.statements.filter(s => ts.isFunctionDeclaration(s) ? names.has(s.name?.text || '') : ts.isVariableStatement(s) && s.declarationList.declarations.some(d => names.has(d.name.getText(ast)))).map(s => s.getText(ast)).join('\n')
  const page = { innerHTML: '' }; let detail = '', pdf = ''; let blob: Blob | undefined
  const ctx = vm.createContext({
    state: { fechamentos: structuredClone(rows), cp: titulos, filters: {}, folhaEstrutura: [{ nome: 'Douglas Bispo', apelidos: ['Douglas Bispo', 'Douglas'], empresa: ASSESSORIA }, { nome: 'Somente Financeiro', empresa: ASSESSORIA }] },
    FL_MESES: [], api: async () => titulos,
    fmtBRL: (n: number) => `R$ ${n.toFixed(2)}`, escapeHtml: (s: unknown) => String(s ?? ''), flDataCurta: (s: string) => s,
    valorTituloHtml: () => '', apuracaoBadge: () => '', toast() {},
    openModal: (html: string) => { detail = html },
    document: { getElementById: () => page, createElement: () => ({ click() {} }) },
    window: { open: () => ({ document: { write: (html: string) => { pdf = html }, close() {} } }) },
    Blob, URL: { createObjectURL(b: Blob) { blob = b; return 'blob:test' }, revokeObjectURL() {} },
  })
  vm.runInContext(code, ctx)
  return { ctx, page, detail: () => detail, pdf: () => pdf, csv: async () => blob?.text() }
}

test('empresa explícita prevalece e o filtro separa o VGV real da Flor antes da soma', () => {
  const { ctx } = erpContext([flor, assessoria])
  const all = ctx.coAggregate()[0]
  assert.deepEqual([...all.empresas].sort(), [ASSESSORIA, REMATES])
  assert.equal(all.vgv, 412300)
  assert.equal(all.comissao, 0)
  assert.equal(all.comissaoPaga, 2000)
  ctx.state.filters.coEmpresa = ASSESSORIA
  const a = ctx.coAggregate()[0]
  assert.equal(a.vgv, 100000)
  assert.equal(a.animais, 2)
  assert.equal(a.transacoes, 1)
  assert.equal(a.comissaoPaga, 2000)
  assert.deepEqual([...a.leiloes.map((l: { id: string }) => l.id)], ['assessoria'])
  ctx.state.filters.coEmpresa = REMATES
  const r = ctx.coAggregate()[0]
  assert.equal(r.vgv, 312300)
  assert.equal(r.comissao, 0)
  assert.equal(r.comissaoPaga, 0)
  assert.equal(r.leiloes[0].empresa, REMATES)
})

test('cadastro é fallback apenas quando a ocorrência não identifica empresa', () => {
  const fallback = { ...assessoria, por_assessor: [{ ...assessoria.por_assessor[0], empresa: '  ' }] }
  const uncertain = { ...flor, por_assessor: [{ ...flor.por_assessor[0], empresa: 'Vínculo a confirmar' }] }
  const { ctx } = erpContext([fallback, uncertain])
  assert.equal(ctx.coAggregate(ASSESSORIA)[0].vgv, 100000)
  assert.equal(ctx.coAggregate('Vínculo a confirmar')[0].vgv, 312300)
  assert.equal(ctx.coAggregate(REMATES).length, 0)
  ctx.state.filters.coLeilao = 'flor'
  assert.equal(ctx.coAggregate(ASSESSORIA).length, 0)
})

test('mesmo assessor em duas empresas no mesmo evento não duplica lances nem inventa atribuição', () => {
  const mixed = {
    id: 'mixed', nome: 'Misto', data: '2026-06-09', comissao_assessoria: 300,
    por_assessor: [
      { nome: 'Douglas', empresa: ASSESSORIA, vgv: 1000, comissao: 100 },
      { nome: 'Douglas Bispo', empresa: REMATES, vgv: 2000, comissao: 200 },
    ],
    lances: [
      { assessor: 'Douglas', empresa: 'BULA ASSESSORIA', lote: 'A', vgv: 1000 },
      { assessor: 'Douglas', empresa: REMATES, lote: 'R', vgv: 2000 },
      { assessor: 'Douglas', lote: 'Indefinido', vgv: 50 },
      { assessor: 'Douglas', empresa: ASSESSORIA, lote: 'Cancelado', vgv: 3000, cancelada: true },
    ],
  }
  const { ctx, detail, pdf } = erpContext([mixed])
  assert.equal(ctx.coVendasDe(ctx.coAggregate()[0]).length, 3)
  const a = ctx.coAggregate(ASSESSORIA)[0]
  assert.equal(a.vgv, 1000)
  assert.equal(a.comissao, 100)
  assert.equal(a.leiloes[0].share, 1 / 3, 'participação mantém o denominador do evento inteiro')
  const vendas = ctx.coVendasDe(a)
  assert.equal(vendas.length, 1)
  assert.equal(vendas[0].lote, 'A')
  assert.equal(vendas.semEmpresa, 1)
  ctx.state.coCache = [a]
  ctx.coOpenDetail(0); ctx.coPdf(0)
  for (const html of [detail(), pdf()]) assert.match(html, /1 lance\(s\) sem empresa definida/)
  const r = ctx.coAggregate(REMATES)[0]
  assert.equal(ctx.coVendasDe(r)[0].lote, 'R')
})

test('tela, detalhe e dois PDFs usam o mesmo recorte; opções das outras empresas continuam acessíveis', async () => {
  const cp = { id: 'cp-only', descricao: 'Comissão isolada', vendedor: 'Somente Financeiro', status: 'aberto', categoria: { nome: 'Comissões' }, financeiro: { ativo: true, saldo: 50 }, apuracao: { competencia_fim: '2026-06-30' } }
  const douglasCP = { ...cp, id: 'cp-douglas', vendedor: 'Douglas', descricao: 'CP Douglas da Assessoria' }
  const { ctx, page, detail, pdf } = erpContext([flor, assessoria], [cp, douglasCP])
  ctx.state.filters.coEmpresa = ASSESSORIA
  await ctx.renderComissionamento()
  assert.equal(ctx.state.coCache[0].vgv, 100000)
  assert.match(page.innerHTML, /<option value="Bula Remates"/)
  assert.match(page.innerHTML, /<option value="SOMENTE FINANCEIRO"/)
  assert.match(page.innerHTML, /Comissão isolada/)
  assert.ok(!page.innerHTML.includes('R$ 412300.00'))
  ctx.coOpenDetail(0)
  ctx.coPdf(0)
  for (const html of [detail(), pdf()]) {
    assert.ok(html.includes('Evento Assessoria'))
    assert.ok(html.includes('Compra Assessoria'))
    assert.ok(!html.includes('Flor do Arataú'))
    assert.ok(!html.includes('Compra Remates'))
  }
  ctx.coPdfGeral()
  assert.ok(pdf().includes('R$ 100000.00'))
  assert.ok(!pdf().includes('Flor do Arataú'))
  ctx.state.filters.coEmpresa = REMATES
  await ctx.renderComissionamento()
  assert.equal(ctx.state.coCache[0].vgv, 312300)
  assert.match(page.innerHTML, /Contas da Bula Assessoria · assessores selecionados/)
  assert.match(page.innerHTML, /O filtro de empresa se refere às vendas\. Estas contas são da Bula Assessoria/)
  assert.match(page.innerHTML, /CP Douglas da Assessoria/)
  ctx.coOpenDetail(0)
  assert.match(detail(), /Contas da Bula Assessoria · período selecionado/)
  ctx.coPdf(0)
  assert.ok(pdf().includes('Flor do Arataú'))
  assert.ok(!pdf().includes('CP Douglas da Assessoria'), 'PDF de vendas não mistura títulos financeiros')
  assert.ok(!pdf().includes('Evento Assessoria'))
})

test('CSV identifica a empresa de cada ocorrência e mantém somente o recorte selecionado', async () => {
  const { ctx, csv } = erpContext([flor, assessoria])
  ctx.state.coCache = ctx.coAggregate()
  ctx.coExportCSV()
  const lines = (await csv())!.split('\n').slice(1).map(line => line.split(';'))
  assert.equal(lines.find(l => l[2].includes('Flor'))![1], '"Bula Remates"')
  assert.equal(lines.find(l => l[2].includes('Evento'))![1], '"Bula Assessoria"')
  ctx.state.coCache = ctx.coAggregate(ASSESSORIA)
  ctx.coExportCSV()
  const filtered = (await csv())!
  assert.equal(filtered.split('\n').length, 2)
  assert.ok(!filtered.includes('Flor do Arataú'))
  assert.ok(filtered.includes('"100000"'))
})
