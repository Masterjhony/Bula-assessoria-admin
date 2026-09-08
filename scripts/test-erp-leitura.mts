import test from 'node:test'
import assert from 'node:assert/strict'
import { leituraCompleta } from '../src/lib/erp-leitura'
import { aplicarPrazoRecebimento, prazoDaParcela, recebimentoConfirmado } from '../src/lib/erp-prazos'

test('painel não perde movimentos após a primeira página nem publica subtotal quando uma página falha', async () => {
  const rows = Array.from({length: 1201}, (_, id) => ({id, valor: 0.01}))
  const query = (fail = false) => () => ({order(column: string) {
    assert.equal(column, 'id')
    return {range: async (from: number, to: number) => ({data: rows.slice(from, to + 1), error: fail && from >= 500 ? {message: 'segunda página falhou'} : null})}
  }})
  const full = await leituraCompleta(query())
  assert.equal(full.data.length, 1201)
  assert.equal(full.data.reduce((s, r) => s + Math.round(r.valor * 100), 0), 1201)
  await assert.rejects(leituraCompleta(query(true)), /segunda página/)
})

test('uma promessa não contamina datas de parcelas geradas automaticamente', () => {
  const body = aplicarPrazoRecebimento({vencimento:'2026-01-31', prazo_confirmado:true, fonte_prazo:'Cliente confirmou em mensagem de 15/01'})
  assert.equal(recebimentoConfirmado({...body, ...prazoDaParcela(body, 1, '2026-01-31')}), true)
  const segunda = prazoDaParcela(body, 2, '2026-02-28')
  assert.equal(recebimentoConfirmado(segunda), false)
  assert.deepEqual(segunda.tags, ['cobranca-em:2026-02-28'])
  assert.throws(() => aplicarPrazoRecebimento({vencimento:'2026-02-30', prazo_confirmado:false}), /data válida/)
})
