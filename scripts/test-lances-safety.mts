#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  parseLanceMessage,
  parcelaDeclarada,
  termosPagamentoDeclarados,
} from '../src/lib/whatsapp-lances'
import {
  avaliarVendaParaPublicacao,
  normalizarAliasLote,
  normalizarIdentidadeLote,
  rebuildFechamentoFromLances,
} from '../src/lib/lances-fechamento'

function venda(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    lote: '1',
    valor: 2800,
    parcelas: 30,
    pricing_basis: 'por_lote',
    quantity_scope: 'por_lote',
    status: 'validado',
    fonte: 'manual',
    message_id: 'msg-1',
    group_jid: 'grupo@g.us',
    comprador: null,
    assessor: null,
    fazenda: null,
    cidade: null,
    uf: null,
    animais: 1,
    raw_text: null,
    ...overrides,
  } as never
}

const quantidadeECondicao = termosPagamentoDeclarados('Vendido lote 100 x 2 animais por 2.800 x 30')
assert.equal(quantidadeECondicao.parcela, 2800)
assert.equal(quantidadeECondicao.parcelas, 30)
assert.equal(quantidadeECondicao.ambiguo, false)
assert.equal(parcelaDeclarada('Vendido lote 100 x 2 animais por 2.800 x 30'), 2800)

const centavos = termosPagamentoDeclarados('Parcela R$ 2.800,50 x 30')
assert.equal(centavos.parcela, 2800.5)
assert.equal(centavos.parcelas, 30)

const quarenta = termosPagamentoDeclarados('Levamos lote 8 por 430x40')
assert.deepEqual({ parcela: quarenta.parcela, parcelas: quarenta.parcelas }, { parcela: 430, parcelas: 40 })

const conflito = termosPagamentoDeclarados('Condição anotada 430x30; depois corrigiram para 430x40')
assert.equal(conflito.ambiguo, true)
assert.equal(conflito.parcela, null)
assert.equal(conflito.parcelas, null)

const multi = parseLanceMessage('Levamos lt 43, 42, 44, 49 e 50 - 450,00x40 - 16F\nFoi com Douglas Bispo da Bula')
assert.ok(multi)
assert.equal(multi?.parcelas, 40)
assert.equal(multi?.quantityScope, 'total_da_mensagem')
assert.ok(multi?.ambiguousReasons.includes('quantidade_total_em_mensagem_multilote'))

const unico = parseLanceMessage('Levamos lt 9 - 1.100,00 x 30 - 1F\nFoi com Fabio Omena da Bula')
assert.ok(unico)
assert.equal(unico?.parcelas, 30)
assert.equal(unico?.quantityScope, 'por_lote')
assert.equal(unico?.pricingBasis, 'por_lote')

assert.equal(avaliarVendaParaPublicacao(venda({ status: 'revisar', fonte: 'ia' })).eligible, false)
assert.equal(avaliarVendaParaPublicacao(venda({ status: 'auto', fonte: 'parser', parcelas: null })).eligible, false)
assert.equal(avaliarVendaParaPublicacao(venda()).eligible, true)
assert.equal(avaliarVendaParaPublicacao(venda({ parcelas: 40 })).eligible, true)
assert.equal(avaliarVendaParaPublicacao(venda({ animais: 16, quantity_scope: 'total_da_mensagem' })).eligible, false)
assert.equal(normalizarIdentidadeLote(' Lote 21-A '), '21-A')
assert.equal(normalizarIdentidadeLote('lt 21 - A'), '21-A')
assert.equal(normalizarIdentidadeLote('21/22'), '21/22')
assert.equal(normalizarAliasLote('01'), normalizarAliasLote('1'))
assert.equal(normalizarAliasLote('21-A'), normalizarAliasLote('21A'))
assert.equal(normalizarAliasLote('M04'), normalizarAliasLote('M4'))
assert.equal(normalizarAliasLote('21/22'), '21/22')
assert.equal(avaliarVendaParaPublicacao(venda({ lote: '  ' })).eligible, false)

let closureWrites = 0
const salesQuery = {
  eq() { return this },
  is() { return this },
  order() { return this },
  then(resolve: (value: unknown) => unknown) {
    return Promise.resolve(resolve({ data: [venda()], error: null }))
  },
}
const existingClosuresQuery = {
  eq() { return this },
  is() { return this },
  then(resolve: (value: unknown) => unknown) {
    return Promise.resolve(resolve({ data: null, error: { message: 'simulated read failure' } }))
  },
}
const readFailureMock = {
  from(table: string) {
    if (table === 'cronograma_leiloes') return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: 'cron-1', nome: 'Leilão teste', data: '2026-08-27', leiloeira: 'Teste' },
            error: null,
          }),
        }),
      }),
    }
    if (table === 'bula_leilao_vendas') return { select: () => salesQuery }
    if (table === 'bula_leilao_fechamento') return {
      select: () => existingClosuresQuery,
      insert: () => { closureWrites += 1; throw new Error('write must not happen') },
    }
    throw new Error(`unexpected table ${table}`)
  },
}
const readFailureResult = await rebuildFechamentoFromLances(readFailureMock as never, 'cron-1')
assert.equal(readFailureResult.error, 'falha_leitura_fechamentos_existentes')
assert.equal(closureWrites, 0)

console.log('OK: invariantes de captura/validação/publicação de lances preservadas.')
