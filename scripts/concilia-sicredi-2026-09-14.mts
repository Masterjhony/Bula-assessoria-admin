/**
 * Conciliacao Sicredi 08-14/09/2026 - o repasse do JMP ao Felipe saiu, e a
 * aplicacao ficou com 4.765,08.
 *
 * Fonte: "sicredi_1789422736137.pdf" (periodo 30/08-14/09, CC 0,00,
 * investimentos 4.765,08), convertido por scripts/sicredi-pdf-para-csv.mjs
 * (validacao linha a linha OK) e importado a partir de 08/09 por
 * scripts/importa-extrato.mts --conta "Sicredi - Conta Corrente" (5 novos).
 * Os lancamentos de 01/09 ficaram fora do importador porque o ERP ja os tinha
 * em outra forma - ver [0].
 *
 * [0] 01/09  o resgate de 12.000,00 foi lancado em 03/09 como UMA linha
 *     inferida ("no formato do PIX de 15.000 de 04/08"). O extrato mostra DOIS
 *     resgates: 4.672,98 + 7.327,02. Mesmo total, mesmo saldo do dia - a
 *     hipotese acertou o valor e errou a forma. A linha da CC vira o resgate de
 *     7.327,02 e entra a de 4.672,98 ao lado; a perna da aplicacao (uma saida
 *     de 12.000,00) fica como esta, porque o extrato da aplicacao continua sem
 *     ser importado.
 *
 * [1] 10/09  -150.000,00 e 11/09 -11.344,13 a FELIPE VILELA ANDRADE
 *     (024.880.251-86) = 161.344,13, o repasse fechado com o chefe em 10/09
 *     (JMP 165.667,50 + comissao 3.960,00 - metade do ISS 8.283,37). Tres
 *     titulos: repasse 637f0a9e (157.384,13) + comissoes 3a138ee8 (1.860,00,
 *     Navirai Camparino lote 11) e 523e404a (2.100,00, Excelencia Genetica
 *     lote 21). O primeiro PIX cobre 150.000,00 do repasse; o segundo fecha os
 *     7.384,13 restantes e as duas comissoes (7.384,13 + 1.860 + 2.100 =
 *     11.344,13 exato). Rateio no segundo. O repasse era condicionado ao
 *     recebimento integral da 2a parcela do JMP - a condicao esta cumprida
 *     desde 10/09 (CR baixados e credito da JBJ rateado).
 *
 * [2] 10/09  resgates 515,85 + 149.570,79 e 11/09 11.344,13 - varredura
 *     automatica cobrindo os dois PIX. So a perna da CC veio no extrato; a
 *     perna da aplicacao entra aqui com transferencia_par_id, no formato de
 *     08/09 (par:aplicacao-sicredi-2026-09-08).
 *
 * [3] Aplicacao: 166.195,62 (posicao de 10/09) - 161.430,77 de resgates =
 *     4.764,85; o extrato declara 4.765,08. Residual de +0,23 - compativel com
 *     rendimento liquido de IOF de dois dias (a aplicacao de 165.666,50 ficou
 *     de 08 a 10/09; IOF regressivo come ~93-96% do rendimento). Entra como
 *     ajuste de posicao datado e marcado, no mesmo padrao dos anteriores, ate
 *     o extrato da aplicacao entrar e decompor.
 *
 * Reexecutavel. Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const TAG = '[SICREDI 14/09]'
const HOJE = '2026-09-14'
const PDF = 'F:/sicredi_1789422736137.pdf'
const FONTE = 'Fonte: extrato Sicredi 30/08-14/09/2026 (sicredi_1789422736137.pdf, baixado 14/09/2026 18:52), CC 0,00 / investimentos 4.765,08'
const SALDO_CC = 0.00
const SALDO_INV = 4765.08

const CONTA_CC = 'af4724ec-e098-4e13-b172-04b2bfb1949d'
const CONTA_INV = '5879aa04-2d69-4b9a-a80c-d9e3eca7ac06'

const CAT_TRANSF_ENT = '2847979e-b319-4cad-9510-828c9d6bc1c0'
const CAT_TRANSF_SAI = '1d83b7e5-aa77-4e1d-a774-64ecfda0b746'
const CAT_RECEITA_FIN = 'b6e3222b-52ca-4aab-ae1e-4ba270550c3c'
const CAT_COMISSAO_ASSESSOR = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'
const CC_COMISSAO = '52dd8ed0-0c0a-4524-86bd-01dc121487b3'
const CC_PARCEIROS = '3350800e-d771-4963-a0c9-342ed268ca4a'

const P_FELIPE = '248eba5a-3d89-46a1-b2d6-4c64424d78b9'   // Felipe Vilela Andrade, CPF 024.880.251-86 (o do PIX)
const P_SICREDI_APL = '168b5d0a-e4a3-4777-8576-0bb6326c7b1d'

const CP_REPASSE = '637f0a9e'
const CP_COM_LOTE11 = '3a138ee8'
const CP_COM_LOTE21 = '523e404a'

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100
const say = (s: string) => console.log(s)

const cacheCP = new Map<string, any>()
{
  let todos: any[] = []
  for (let p = 0; ; p++) {
    const { data } = await sb.from('erp_contas_pagar').select('*').range(p * 1000, p * 1000 + 999)
    if (!data?.length) break
    todos = todos.concat(data)
    if (data.length < 1000) break
  }
  for (const t of todos) cacheCP.set(t.id.slice(0, 8), t)
}
const cp = (pref: string) => { const t = cacheCP.get(pref); if (!t) throw new Error('CP nao encontrado: ' + pref); return t }

async function movimento(conta: string, data: string, valor: number, trecho: string) {
  const { data: rows } = await sb.from('erp_movimentos_bancarios')
    .select('id,data,tipo,valor,descricao,status_conciliacao,conta_pagar_id,categoria_id,pessoa_id,observacoes,transferencia_par_id,import_key')
    .eq('conta_bancaria_id', conta).eq('data', data).eq('valor', valor).ilike('descricao', '%' + trecho + '%')
  if (!rows || rows.length !== 1) throw new Error('movimento ambiguo/ausente: ' + data + ' ' + brl(valor) + ' "' + trecho + '" -> ' + (rows?.length ?? 0))
  return rows[0]
}

async function classifica(mov: any, campos: Record<string, any>, nota: string) {
  const obs = String(mov.observacoes || '')
  const novaObs = obs.includes(TAG) ? obs : (obs ? obs + ' ' : '') + TAG + ' ' + nota
  say('  mov ' + mov.data + ' ' + (mov.tipo === 'entrada' ? '+' : '-') + brl(mov.valor).padStart(12) + '  ' + String(mov.descricao).slice(0, 56))
  if (APPLY) {
    const { error } = await sb.from('erp_movimentos_bancarios')
      .update({ ...campos, status_conciliacao: 'conciliado', conciliado: true, observacoes: novaObs }).eq('id', mov.id)
    if (error) throw error
  }
}

async function baixaCP(pref: string, valorPago: number, dataPag: string, nota: string) {
  const t = cp(pref)
  const jaPago = Number(t.valor_pago || 0)
  const obs = String(t.observacoes || '')
  if (t.status === 'pago' && jaPago + 0.005 >= Number(t.valor)) { say('  CP  ' + String(t.descricao).slice(0, 54).padEnd(54) + ' (ja pago)'); return t.id }
  const total = r2(jaPago + valorPago)
  const status = total + 0.005 >= Number(t.valor) ? 'pago' : 'parcial'
  say('  CP  ' + String(t.descricao).slice(0, 54).padEnd(54) + brl(t.valor).padStart(11) + ' -> pago ' + brl(total).padStart(11) + ' [' + status + ']')
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').update({
      status, valor_pago: total, data_pagamento: dataPag,
      forma_pagamento: t.forma_pagamento || 'pix',
      conta_bancaria_id: CONTA_CC,
      apuracao: { ...(t.apuracao || {}), pagamento_situacao: 'informado' },
      observacoes: obs.includes(TAG) ? obs : (obs ? obs + ' ' : '') + TAG + ' ' + nota,
    }).eq('id', t.id)
    if (error) throw error
    cacheCP.set(pref, { ...t, status, valor_pago: total, observacoes: obs + ' ' + TAG })
  }
  return t.id
}

async function rateia(movId: string, destinos: Array<[string, number, string]>, criterio: string) {
  const { data: ja } = await sb.from('erp_movimento_rateios').select('id').eq('movimento_id', movId)
  if (ja?.length) { say('      rateio ja registrado (' + ja.length + ' linhas)'); return }
  for (const [, valor, rot] of destinos) say('      rateio ' + brl(valor).padStart(12) + '  -> ' + rot)
  if (!APPLY) return
  const { error } = await sb.from('erp_movimento_rateios').insert(destinos.map(([id, valor]) => ({
    movimento_id: movId, conta_pagar_id: id, valor, fundamento: 'documentado',
    evidencia: { criterio, fonte: FONTE, data: HOJE },
  })))
  if (error) throw error
}

/** Perna da aplicacao para um resgate que so veio pela CC. */
async function pernaResgate(movCC: any, key: string, nota: string) {
  const { data: ja } = await sb.from('erp_movimentos_bancarios').select('id').eq('import_key', key).maybeSingle()
  if (ja) { say('      (perna da aplicacao ja lancada)'); return }
  say('      Sicredi Investimentos  saida  -' + brl(movCC.valor).padStart(11) + '  RESGATE ENVIADO A CC (varredura)')
  if (!APPLY) return
  const { data: sai, error } = await sb.from('erp_movimentos_bancarios').insert({
    conta_bancaria_id: CONTA_INV, data: movCC.data, tipo: 'saida', valor: Number(movCC.valor),
    descricao: 'RESGATE ENVIADO A CC 53609-7 (varredura) - ' + nota,
    categoria_id: CAT_TRANSF_SAI, pessoa_id: P_SICREDI_APL, conciliado: true, status_conciliacao: 'conciliado',
    origem: 'ajuste_manual', documento: 'varredura', observacoes: TAG + ' Perna da aplicacao do resgate que o extrato da CC mostra em ' + movCC.data + '. ' + FONTE + '.',
    import_key: key, transferencia_par_id: movCC.id,
  }).select('id').single()
  if (error) throw error
  await sb.from('erp_movimentos_bancarios').update({ transferencia_par_id: sai!.id }).eq('id', movCC.id)
}

// ---------------------------------------------------------------------------
say('\n=== [0] 01/09 - o resgate de 12.000,00 eram DOIS: 4.672,98 + 7.327,02 ===')
// ---------------------------------------------------------------------------
{
  const KEY_AGREGADO = 'ajuste:sicredi-resg-2026-09-01-cc'
  const KEY_PARTE1 = 'ajuste:sicredi-resg-2026-09-01-cc-4672.98'
  const { data: agg } = await sb.from('erp_movimentos_bancarios').select('id,valor,descricao,observacoes').eq('import_key', KEY_AGREGADO).maybeSingle()
  const { data: p1 } = await sb.from('erp_movimentos_bancarios').select('id').eq('import_key', KEY_PARTE1).maybeSingle()
  if (!agg) say('  ⚠ linha agregada de 12.000,00 nao encontrada - conferir a mao')
  else if (Number(agg.valor) === 7327.02 && p1) say('  (ja substituido pelos dois resgates reais)')
  else {
    say('  CC 01/09  +12.000,00 (inferido)  ->  +7.327,02 + 4.672,98 (extrato)')
    if (APPLY) {
      const nota = TAG + ' SUBSTITUI a linha inferida de 12.000,00 lancada em 03/09: o extrato de 30/08-14/09 mostra dois resgates em 01/09, '
        + '4.672,98 e 7.327,02 (RESG.APLIC.FIN.AVISO PREV, doc CAPTACAO). Mesmo total, mesmo saldo do dia. A perna da aplicacao segue como uma saida de 12.000,00. ' + FONTE + '.'
      const { error: e1 } = await sb.from('erp_movimentos_bancarios').update({
        valor: 7327.02, descricao: 'RESG.APLIC.FIN.AVISO PREV - resgate 2/2 de 01/09 (7.327,02) para cobrir o PIX de 12.000,00 ao Sicoob',
        documento: 'CAPTACAO', observacoes: (agg.observacoes ? agg.observacoes + ' ' : '') + nota,
      }).eq('id', agg.id)
      if (e1) throw e1
      if (!p1) {
        const { error: e2 } = await sb.from('erp_movimentos_bancarios').insert({
          conta_bancaria_id: CONTA_CC, data: '2026-09-01', tipo: 'entrada', valor: 4672.98,
          descricao: 'RESG.APLIC.FIN.AVISO PREV - resgate 1/2 de 01/09 (4.672,98) para cobrir o PIX de 12.000,00 ao Sicoob',
          categoria_id: CAT_TRANSF_ENT, pessoa_id: P_SICREDI_APL, conciliado: true, status_conciliacao: 'conciliado',
          origem: 'importacao', documento: 'CAPTACAO', observacoes: nota, import_key: KEY_PARTE1,
        })
        if (e2) throw e2
      }
    }
  }
}

// ---------------------------------------------------------------------------
say('\n=== [1] 10 e 11/09 - repasse do JMP ao Felipe: 150.000,00 + 11.344,13 = 161.344,13 ===')
// ---------------------------------------------------------------------------
{
  const m1 = await movimento(CONTA_CC, '2026-09-10', 150000.00, 'FELIPE VILELA')
  const m2 = await movimento(CONTA_CC, '2026-09-11', 11344.13, 'FELIPE VILELA')
  const base = 'Repasse fechado com o chefe em 10/09 (JMP 165.667,50 + comissao de agosto 3.960,00 - metade do ISS 8.283,37 = 161.344,13), pago em dois PIX do Sicredi '
    + 'a FELIPE VILELA ANDRADE (024.880.251-86): 150.000,00 em 10/09 e 11.344,13 em 11/09, ambos cobertos por resgate da aplicacao no mesmo dia. ' + FONTE + '.'

  say('  10/09')
  const idRep = await baixaCP(CP_REPASSE, 150000.00, '2026-09-10', base + ' Este PIX cobre 150.000,00 do repasse; os 7.384,13 restantes sairam no PIX de 11/09.')
  await classifica(m1, { categoria_id: cp(CP_REPASSE).categoria_id, centro_custo_id: cp(CP_REPASSE).centro_custo_id || CC_PARCEIROS, pessoa_id: P_FELIPE, conta_pagar_id: idRep },
    base + ' Parte 1: 150.000,00 do titulo do repasse (157.384,13).')

  say('  11/09')
  await baixaCP(CP_REPASSE, 7384.13, '2026-09-11', base + ' Fechado no PIX de 11/09 (7.384,13 restantes).')
  const id11 = await baixaCP(CP_COM_LOTE11, 1860.00, '2026-09-11', base + ' Comissao do lote 11 do Navirai Camparino (22/08), antecipada do dia 25 para sair no mesmo PIX.')
  const id21 = await baixaCP(CP_COM_LOTE21, 2100.00, '2026-09-11', base + ' Comissao do lote 21 do Excelencia Genetica (23/08), antecipada do dia 25 para sair no mesmo PIX.')
  await classifica(m2, { categoria_id: cp(CP_REPASSE).categoria_id, centro_custo_id: cp(CP_REPASSE).centro_custo_id || CC_PARCEIROS, pessoa_id: P_FELIPE, conta_pagar_id: idRep },
    base + ' Parte 2: 7.384,13 do repasse + 1.860,00 (lote 11) + 2.100,00 (lote 21) = 11.344,13 exato. Aponta para o repasse; o rateio divide.')
  await rateia(m2.id, [[idRep, 7384.13, 'Repasse JMP ao Felipe (saldo do titulo)'], [id11, 1860.00, 'Comissao Bulinha - Navirai Camparino lote 11'], [id21, 2100.00, 'Comissao Bulinha - Excelencia Genetica lote 21']],
    'PIX de 11.344,13 em 11/09 = 7.384,13 (saldo do repasse de 157.384,13 apos os 150.000,00 de 10/09) + 1.860,00 + 2.100,00 (as duas comissoes de agosto do Felipe, antecipadas para o mesmo PIX). Total dos dois PIX = 161.344,13, o valor fechado com o chefe.')
}

// ---------------------------------------------------------------------------
say('\n=== [2] resgates da aplicacao que cobriram os PIX (perna da aplicacao) ===')
// ---------------------------------------------------------------------------
{
  const notaCC = 'Varredura automatica do Sicredi: resgate da aplicacao para cobrir o PIX ao Felipe do mesmo dia. ' + FONTE + '.'
  const r1 = await movimento(CONTA_CC, '2026-09-10', 515.85, 'RESG.APLIC')
  await classifica(r1, { categoria_id: CAT_TRANSF_ENT, pessoa_id: P_SICREDI_APL }, notaCC + ' Primeiro dos dois resgates de 10/09 (515,85 + 149.570,79 = 150.086,64 = PIX 150.000,00 + cesta 67,64 + integralizacao 20,00).')
  await pernaResgate(r1, 'par:resgate-sicredi-2026-09-10-515.85', 'cobre o PIX de 150.000,00 ao Felipe (1/2)')
  const r2m = await movimento(CONTA_CC, '2026-09-10', 149570.79, 'RESG.APLIC')
  await classifica(r2m, { categoria_id: CAT_TRANSF_ENT, pessoa_id: P_SICREDI_APL }, notaCC + ' Segundo resgate de 10/09.')
  await pernaResgate(r2m, 'par:resgate-sicredi-2026-09-10-149570.79', 'cobre o PIX de 150.000,00 ao Felipe (2/2)')
  const r3 = await movimento(CONTA_CC, '2026-09-11', 11344.13, 'RESG.APLIC')
  await classifica(r3, { categoria_id: CAT_TRANSF_ENT, pessoa_id: P_SICREDI_APL }, notaCC + ' Cobre o PIX de 11.344,13.')
  await pernaResgate(r3, 'par:resgate-sicredi-2026-09-11-11344.13', 'cobre o PIX de 11.344,13 ao Felipe')
}

// ---------------------------------------------------------------------------
say('\n=== [3] posicao da aplicacao: 4.764,85 calculado x 4.765,08 no extrato ===')
// ---------------------------------------------------------------------------
{
  const KEY = 'ajuste:sicredi-posicao-2026-09-14'
  const { data: ja } = await sb.from('erp_movimentos_bancarios').select('id,valor').eq('import_key', KEY).maybeSingle()
  const { data: c } = await sb.from('erp_contas_bancarias').select('saldo_atual').eq('id', CONTA_INV).single()
  // em dry-run as pernas de [2] ainda nao existem: simula
  const { data: pernas } = await sb.from('erp_movimentos_bancarios').select('valor').eq('conta_bancaria_id', CONTA_INV).in('import_key', ['par:resgate-sicredi-2026-09-10-515.85', 'par:resgate-sicredi-2026-09-10-149570.79', 'par:resgate-sicredi-2026-09-11-11344.13'])
  const faltam = 161430.77 - (pernas || []).reduce((s, x) => s + Number(x.valor), 0)
  const calculado = r2(Number(c!.saldo_atual) - faltam - (ja ? Number(ja.valor) : 0))
  const residual = r2(SALDO_INV - calculado)
  say('  aplicacao apos os resgates: ' + brl(calculado) + '  |  extrato: ' + brl(SALDO_INV) + '  ->  residual ' + brl(residual))
  if (ja) say('  (ajuste de ' + brl(ja.valor) + ' ja lancado)')
  else if (Math.abs(residual) < 0.005) say('  (sem residual)')
  else {
    say('  ajuste de posicao  ' + (residual > 0 ? '+' : '-') + brl(Math.abs(residual)) + ' em ' + HOJE + ' (hipotese: rendimento liquido de IOF)')
    if (APPLY) {
      const { error } = await sb.from('erp_movimentos_bancarios').insert({
        conta_bancaria_id: CONTA_INV, data: HOJE, tipo: residual > 0 ? 'entrada' : 'saida', valor: Math.abs(residual),
        descricao: 'AJUSTE DE POSICAO SICREDI (aplicacao) - fecha nos 4.765,08 do extrato de 14/09',
        categoria_id: residual > 0 ? CAT_RECEITA_FIN : CAT_TRANSF_SAI, pessoa_id: P_SICREDI_APL, conciliado: true, status_conciliacao: 'conciliado',
        origem: 'ajuste_manual', documento: 'ajuste', import_key: KEY,
        observacoes: TAG + ' HIPOTESE, nao fato: 166.195,62 (posicao de 10/09, que ja carregava o ajuste de 69,52) - 161.430,77 de resgates (515,85 + 149.570,79 + 11.344,13) = 4.764,85; '
          + 'o extrato declara 4.765,08. Os 0,23 sao compativeis com rendimento liquido de IOF (a aplicacao de 165.666,50 ficou de 08 a 10/09; IOF regressivo come ~93-96% do rendimento). '
          + 'Substituir quando o extrato da APLICACAO for importado - nunca deixar virar saldo. ' + FONTE + '.',
      })
      if (error) throw error
    }
  }
}

// ---------------------------------------------------------------------------
say('\n=== VERIFICACAO ===')
// ---------------------------------------------------------------------------
const { data: contas } = await sb.from('erp_contas_bancarias').select('id,nome,saldo_atual').order('nome')
let total = 0
for (const c of contas || []) { total += Number(c.saldo_atual || 0); say('  ' + String(c.nome).padEnd(46) + brl(c.saldo_atual).padStart(14)) }
say('  ' + 'CAIXA TOTAL'.padEnd(46) + brl(total).padStart(14))
const conf = (nome: string, id: string, esperado: number) => {
  const c = (contas || []).find(x => x.id === id)
  const dif = Number(c?.saldo_atual || 0) - esperado
  say('  ' + nome.padEnd(24) + brl(c?.saldo_atual).padStart(14) + ' x extrato ' + brl(esperado).padStart(12) + ' -> dif ' + brl(dif))
  return Math.abs(dif) < 0.005
}
const ok1 = conf('Sicredi CC', CONTA_CC, SALDO_CC)
const ok2 = conf('Sicredi Investimentos', CONTA_INV, SALDO_INV)
const { data: pend } = await sb.from('erp_movimentos_bancarios').select('id,data,valor,descricao,status_conciliacao').neq('status_conciliacao', 'conciliado')
say('  Movimentos fora de conciliado: ' + (pend?.length ?? 0))
for (const m of pend || []) say('    ' + m.data + ' ' + brl(m.valor).padStart(12) + ' [' + m.status_conciliacao + '] ' + String(m.descricao).slice(0, 60))
if (!APPLY) say('\nDRY-RUN. Use --apply para gravar.')
else if (ok1 && ok2) say('\nOK: Sicredi CC e aplicacao batem com o extrato.')
else say('\n⚠ Conferir: alguma conta do Sicredi nao bate.')
