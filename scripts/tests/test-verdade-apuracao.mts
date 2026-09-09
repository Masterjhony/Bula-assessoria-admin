import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGO, porId } from '../../src/lib/verdade/catalogo'
import { VALIDACOES } from '../../src/lib/verdade/validacoes'
import type { Fatos, FolhaLinha, Titulo } from '../../src/lib/verdade/fatos'
import type { VariavelResolvida } from '../../src/lib/verdade/tipos'
import { listarTitulosContas, pagamentoNoRecorte, prepararTituloContas } from '../../src/lib/erp-contas'
import type { SupabaseClient } from '@supabase/supabase-js'

// Fixtures em memória: nenhum cliente Supabase, credencial ou gravação externa.
const fatos = (patch: Partial<Fatos> = {}): Fatos => ({
  hoje: '2026-09-09', foto_em: '2026-09-09T12:00:00Z', contas: [], movimentos: [],
  cp: [], cr: [], categorias: [], fechamentos: [], agenda: [], vendasCapturadas: [],
  cartoes: [], faturas: [], cartaoLancamentos: [], folha: [], pessoas: [], plano: [],
  lancamentos: [], partidas: [], centros: [], resultadosHistorico: [],
  dreGrupo: new Map(), catNome: new Map(), transferencias: new Set(), ...patch,
})
const titulo = (id: string, valor: number, patch: Partial<Titulo> = {}): Titulo => ({
  id, valor, descricao: id, vencimento: null, emissao: null, desconto: 0, juros: 0, multa: 0,
  valor_pago: 0, valor_recebido: 0, status: 'aberto', origem: 'real', tags: [],
  substituido_por: null, substituido_em: null, categoria_id: null, conta_bancaria_id: null,
  fechamento_id: null, evento_key: null, observacoes: null, created_at: null, updated_at: null,
  apuracao: { natureza: 'obrigacao', valor_situacao: 'confirmado' }, ...patch,
})
const calcular = (id: string, f: Fatos, dep: Record<string, VariavelResolvida> = {}) => {
  const def = porId(id)
  assert.ok(def, id)
  return def.calcular(f, dep)
}
const validar = (id: string, f: Fatos) => {
  const def = VALIDACOES.find(x => x.id === id)
  assert.ok(def, id)
  return def.checar(f)
}

test('obrigação estimada permanece no total, sem virar atraso ou saída confirmada', () => {
  const f = fatos({ cp: [
    titulo('obrigação vencida', 100, { vencimento: '2026-09-01' }),
    titulo('obrigação programada', 200, { vencimento: '2026-09-12' }),
    titulo('Marcelo trimestre', 63500, { origem: 'estimativa', apuracao: { natureza: 'obrigacao', valor_situacao: 'a_apurar', previsao_mes: '2026-09-01' } }),
    titulo('Felipe condicionado', 157384.13, { vencimento: '2026-09-01', apuracao: { natureza: 'obrigacao', valor_situacao: 'confirmado', condicao: { tipo: 'recebimento', titulos_ids: ['JMP'], descricao: 'Após a segunda parcela' } } }),
    titulo('pagamento informado', 3600, { vencimento: '2026-09-01', apuracao: { natureza: 'obrigacao', pagamento_situacao: 'informado' } }),
    titulo('folha projetada', 5000, { origem: 'real', vencimento: '2026-09-12', apuracao: { natureza: 'projecao', valor_situacao: 'a_apurar' } }),
    titulo('substituído', 1000, { vencimento: '2026-09-01', substituido_por: 'outro' }),
  ], cr: [
    titulo('CR prometido', 500, { vencimento: '2026-09-12', tags: ['data-acordada'] }),
    titulo('CR sem data', 900),
    titulo('CR vencido', 700, { vencimento: '2026-08-01', tags: ['data-acordada'] }),
  ] })
  const obrigacoes = calcular('pagar.compromissado', f)
  assert.equal(obrigacoes.valor, 224784.13)
  assert.ok(obrigacoes.cobertura.lacunas.some(x => x.valor === 63500 && x.impacto === 'valor'))
  assert.equal(calcular('pagar.projetado', f).valor, 5000)
  assert.equal(calcular('pagar.vencido', f).valor, 100)
  const fluxo = calcular('fluxo.projetado', f, { 'caixa.saldo': { valor: 1000 } as VariavelResolvida })
  assert.equal(fluxo.valor, -3700)
  assert.ok(fluxo.composicao?.some(x => x.rotulo.includes('obrigações sem programação') && x.valor === 224484.13))
  assert.ok(fluxo.composicao?.some(x => x.rotulo.includes('custos futuros') && x.valor === -5000))
})

test('comissão sem dia certo não desaparece nem contamina o próximo vencimento', () => {
  const f = fatos({ cp: [
    titulo('Comissão com data', 200, { vencimento: '2026-09-12', fornecedor_id: 'douglas' }),
    titulo('Comissão Nane dezembro', 3060, { origem: 'estimativa', apuracao: { natureza: 'obrigacao', valor_situacao: 'confirmado', previsao_mes: '2026-12-01' } }),
    titulo('Comissão previsão', 700, { vencimento: '2026-09-10', apuracao: { natureza: 'projecao' } }),
  ] })
  for (const id of ['comissao.proximo_ciclo', 'comissao.devida_por_assessor']) {
    const r = calcular(id, f)
    assert.equal(r.valor, 200)
    assert.ok(r.cobertura.lacunas.some(x => x.valor === 3060 && x.motivo.includes('programação')))
  }
})

test('título sem data não quebra nenhum cálculo ou validação do catálogo', () => {
  const f = fatos({ cp: [titulo('Sem data', 1)], cr: [titulo('CR sem data', 2)] })
  for (const def of CATALOGO) assert.doesNotThrow(() => def.calcular(f, {}), def.id)
  for (const def of VALIDACOES) assert.doesNotThrow(() => def.checar(f), def.id)
  assert.equal(calcular('pagar.vencido', f).valor, 0)
  assert.equal(calcular('receber.vencido', f).valor, 0)
})

test('acordo comercial no texto não confirma prazo de recebimento', () => {
  const f = fatos({ cr: [titulo('CR', 900, { vencimento: '2026-08-01', observacoes: 'Acordo 1% sobre faturamento; data ainda não acordada' })] })
  assert.ok(validar('vencimento_automatico_sem_acordo', f))
  assert.equal(calcular('receber.vencido', f).valor, 0)
  f.cr[0].tags = ['data-acordada']
  assert.equal(validar('vencimento_automatico_sem_acordo', f), null)
  assert.equal(calcular('receber.vencido', f).valor, 900)
})

test('duplicidade respeita natureza explícita mesmo quando a origem antiga diverge', () => {
  const f = fatos({ cp: [
    titulo('obrigação', 500, { origem: 'estimativa', evento_key: 'evento' }),
    titulo('projeção', 500, { origem: 'real', evento_key: 'evento', apuracao: { natureza: 'projecao' } }),
  ] })
  assert.ok(validar('previsao_e_real_no_mesmo_evento', f))
  f.cp[1].substituido_por = 'obrigação'
  assert.equal(validar('previsao_e_real_no_mesmo_evento', f), null)
})

const pessoa = (id: string, nome: string): FolhaLinha => ({ id, nome, salario_fixo: 3000, fornecedor_id: id, ativo: true, funcao: null, comissao_pct: null, comissao_fixa: null, empresa: 'Bula Assessoria', pagamento_nome: null, apelidos: [] })
test('folha usa competência explícita, soma parcelas e distingue pessoas homônimas', () => {
  const folha = pessoa('eduardo', 'João Eduardo')
  const apuracao = { natureza: 'projecao' as const, competencia_inicio: '2026-09-01', competencia_fim: '2026-09-30' }
  const f = fatos({ folha: [folha], cp: [
    titulo('Folha João Eduardo parcela 1', 1000, { fornecedor_id: 'eduardo', vencimento: '2026-10-05', apuracao }),
    titulo('Folha João Eduardo parcela 2', 2000, { fornecedor_id: 'eduardo', vencimento: null, apuracao }),
    titulo('Folha outubro João Eduardo', 3000, { fornecedor_id: 'eduardo', vencimento: '2026-11-05', apuracao: { natureza: 'projecao', competencia_inicio: '2026-10-01', competencia_fim: '2026-10-31' } }),
  ] })
  assert.equal(calcular('folha.custo_projetado_mes', f).valor, 3000)
  assert.match(calcular('folha.custo_projetado_mes', f).formula || '', /2026-09/)
  assert.equal(calcular('folha.meses_projetados', f).valor, '2026-10-31')
  assert.equal(validar('folha_cadastro_x_projecao', f), null)
  f.folha.push(pessoa('gabriel', 'João Gabriel'))
  const falta = validar('folha_pessoa_sem_titulo', f)
  assert.ok(falta)
  assert.match(falta.detalhe, /João Gabriel/)
  assert.doesNotMatch(falta.detalhe, /João Eduardo/)
})

test('projeção de folha sem qualquer referência não inventa um mês', () => {
  const f = fatos({ cp: [titulo('Folha sem competência', 3000, { apuracao: { natureza: 'projecao' } })] })
  const horizonte = calcular('folha.meses_projetados', f)
  assert.equal(horizonte.valor, null)
  assert.equal(horizonte.composicao?.[0].valor, 0)
  assert.equal(calcular('folha.custo_projetado_mes', f).cobertura.lacunas[0]?.linhas, 1)
})

test('filtro de período conserva obrigação com mês previsto e condição sem data', () => {
  const marcelo = titulo('Marcelo', 63500, { apuracao: { natureza: 'obrigacao', valor_situacao: 'a_apurar', previsao_mes: '2026-09-01' } })
  assert.equal(pagamentoNoRecorte(marcelo, '2026-09-15', '2026-09-20'), true)
  assert.equal(pagamentoNoRecorte(marcelo, '2026-10-01', '2026-10-31'), false)
  assert.equal(pagamentoNoRecorte(marcelo, null, '2026-08-31'), false)
  const condicionado = titulo('JMP', 157384.13, { apuracao: { natureza: 'obrigacao', condicao: { tipo: 'recebimento', titulos_ids: ['JMP'], descricao: 'Segunda parcela' } } })
  assert.equal(pagamentoNoRecorte(condicionado, '2026-09-01', '2026-09-30'), true)
  assert.equal(pagamentoNoRecorte(condicionado, '2027-01-01', null), true)
  const firme = titulo('Vencimento confirmado', 100, { vencimento: '2026-09-12' })
  assert.equal(pagamentoNoRecorte(firme, '2026-09-15', '2026-09-20'), false)
  assert.equal(pagamentoNoRecorte(firme, '2026-09-12', '2026-09-12'), true)
})

test('CP sem data após primeira página é incluído no recorte sem filtro SQL por vencimento', async () => {
  const rows = Array.from({ length: 500 }, (_, i) => titulo('antigo-' + i, 1, { vencimento: '2026-08-01' }))
  rows.push(titulo('Marcelo mês', 63500, { apuracao: { natureza: 'obrigacao', valor_situacao: 'a_apurar', previsao_mes: '2026-09-01' } }))
  rows.push(titulo('Repasse condicionado sem mês', 100))
  let pages = 0
  const sb = { from() {
    let de = 0, ate = 0
    const q = {
      select() { return q }, order() { return q }, eq() { return q }, or() { return q },
      range(a: number, b: number) { de = a; ate = b; return q },
      gte() { throw new Error('CP com data desconhecida não pode ser eliminado no SQL') },
      lte() { throw new Error('CP com data desconhecida não pode ser eliminado no SQL') },
      then(resolve: (value: unknown) => unknown) { pages++; return Promise.resolve(resolve({ data: rows.slice(de, ate + 1), error: null })) },
    }
    return q
  } } as unknown as SupabaseClient
  const result = await listarTitulosContas(sb, 'pagar', new URLSearchParams({ from: '2026-09-01', to: '2026-09-30', status: 'aberto' }), '2026-09-09')
  assert.equal(pages, 2)
  assert.deepEqual(result.map(x => x.id), ['Marcelo mês', 'Repasse condicionado sem mês'])
  assert.equal(result[0].vencimento, null)
  assert.equal(result[0].financeiro.apuracao?.previsao_mes, '2026-09-01')
})

test('projeção futura não é apresentada como dívida vencida por uma data antiga', () => {
  const t = titulo('Folha previsão sem confirmação', 3000, { vencimento: '2026-09-01', apuracao: { natureza: 'projecao' } })
  assert.equal(prepararTituloContas(t, 'pagar', '2026-09-09').status, 'aberto')
})
