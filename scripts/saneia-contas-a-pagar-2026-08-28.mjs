/**
 * Saneia as contas a pagar para refletirem a operacao de HOJE.
 *
 * Pedido do chefe em 28/08/2026: "no inicio, quando desenvolvia o sistema, pedia
 * pra gerar despesas com base em estimativas. Depois passei a lancar as
 * conciliacoes via IA e nao verificava as divergencias. Muitas despesas que
 * tinhamos antes agora nao temos mais. O intuito e que essas contas a pagar
 * reflitam a realidade exata da nossa operacao hoje."
 *
 * O QUE O INVENTARIO MOSTROU (97 titulos vivos, R$ 456.178,86):
 *   395.421,86 sao `origem='estimativa'`, e 258.451,61 disso e FOLHA — que e
 *   legitima (reflexo do cadastro erp_folha_estrutura, nao orcamento). O resto
 *   das estimativas e que precisava de faxina.
 *
 * ✅ ESTRUTURA DE ESCRITORIO JA ESTAVA LIMPA: zero titulos vivos de aluguel,
 *    internet, manutencao, seguro Tokio, faxina ou material de escritorio.
 *    Os 12 titulos daquela epoca (R$ 19.752,00) ja estao cancelados.
 *
 * O QUE ESTE SCRIPT FAZ
 *
 * [1] CANCELA o que a operacao de hoje nao tem mais:
 *     · FGTS jul/2026 (950,00) e FGTS ago/2026 (950,00)
 *     · DARF empregados ago/2026 (2.225,46)
 *       A folha inteira e PJ — todos os 9 ativos em erp_folha_estrutura pagam
 *       por CNPJ. O ultimo encargo de CLT que saiu de verdade no extrato foi o
 *       DARF de 20/08 (1.114,60, competencia julho) e o FGTS de 01/07 (938,67);
 *       depois disso, nada. Esses tres sao projecao de um regime que acabou.
 *     · Marketing - trafego pago (2.500,00): o chefe paga o Meta quando paga e
 *       lanca na conciliacao. Nao ha contrato mensal.
 *     · Despesas operacionais - Melhoradores Especial (3.200,00): estimativa de
 *       despesa de leilao. Regra do chefe: "eu lanco junto com a validacao da
 *       conciliacao, a nao ser que eu peca antes".
 *
 * [2] CRIA no lugar a despesa REAL que ele apontou: a hospedagem do Hotel Villa
 *     Cerrado (R$ 1.914,00), reserva confirmada por WhatsApp — Felipe Peralta e
 *     Regiane Abreu, check-in 03/09 e check-out 06/09, 3 diarias de 319,00 por
 *     apartamento em 2 apartamentos, pagamento em Pix.
 *
 * [3] CORRIGE a categoria das faturas de cartao de setembro, que estavam em
 *     "Comissoes" (dre_grupo = custo_direto). Isso jogava R$ 7.329,97/mes de
 *     fatura de cartao dentro do custo direto da DRE, junto com comissao de
 *     assessor. O proprio gerador (projeta-cp-setembro-2026.mts) pedia
 *     'Cartão de Crédito' — a categoria nao casou na hora de gravar.
 *
 * O QUE FICA DE PROPOSITO (estimativa, mas obrigacao certa):
 *   ISSQN 20.424,70 e DAS 46.510,08 (15 e 22/09) — guias que vao vencer; o
 *   valor e que e estimado por escala de receita. Tirar subestimaria setembro
 *   em 67 mil. Quando o contador fechar a guia, o real substitui.
 *   Folha (258.451,61), socio Marcelo (44.286,20), contador, site, tarifas,
 *   seguros, assinaturas e integralizacao — todos recorrentes reais, varios em
 *   debito automatico.
 *
 * ⚠ A CORRECAO DURAVEL ESTA NO GERADOR, nao aqui: scripts/projeta-cp-setembro-
 * 2026.mts tem FGTS, DARF e marketing na lista de recorrentes e vai recria-los
 * na proxima projecao mensal. Ver a nota que este commit deixa la.
 *
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const fmt = n => brl(n).padStart(11)
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }
const TAG = '[SANEAMENTO CP 28/08]'

const CAT_VIAGEM = '98083139-0fbf-487a-9988-a08519ebf259' // Viagem/Passagens
const CAT_CARTAO = 'bd6c6ed1-054a-404c-ba21-08f424888c1f' // Cartão de Crédito
const CC_HOSPEDAGEM = '34a12f8d-c91c-474d-9d58-943d31c4b181'
const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'

const { data: cats } = await sb.from('erp_categorias').select('id,nome,dre_grupo')
const CN = Object.fromEntries((cats || []).map(c => [c.id, c]))
let cp = [], off = 0
for (;;) { const { data } = await sb.from('erp_contas_pagar').select('*').range(off, off + 999); cp = cp.concat(data || []); if (!data || data.length < 1000) break; off += 1000 }
const vivo = c => ['aberto', 'vencido', 'parcial'].includes(c.status) && !c.substituido_por
const falta = c => r2(Number(c.valor) - Number(c.valor_pago || 0))

/* ================= [0] retrato antes ======================================= */
const antes = cp.filter(vivo)
console.log('[0] ANTES: ' + antes.length + ' titulos vivos = ' + brl(antes.reduce((s, c) => s + falta(c), 0)))
console.log('    estimativa: ' + brl(antes.filter(c => c.origem === 'estimativa').reduce((s, c) => s + falta(c), 0))
  + '  |  real: ' + brl(antes.filter(c => c.origem === 'real').reduce((s, c) => s + falta(c), 0)) + '\n')

/* ================= [1] cancela o que a operacao nao tem mais =============== */
console.log('[1] CANCELA — estimativa de despesa que a operacao de hoje nao tem\n')
const CANCELAR = [
  { re: /^FGTS\/Guia CEF ref\. julho\/2026/i, valor: 950, motivo: 'Encargo de CLT. A folha e 100% PJ; o ultimo FGTS que saiu no extrato foi 938,67 em 01/07 e nao houve outro. Estimativa de um regime encerrado.' },
  { re: /^FGTS - competencia agosto\/2026/i, valor: 950, motivo: 'Idem — nao ha empregado CLT em agosto.' },
  { re: /^DARF empregados - competencia agosto\/2026/i, valor: 2225.46, motivo: 'Encargo de CLT. O ultimo DARF real foi 1.114,60 em 20/08 (competencia julho), ja menor que os 2.225,46 de junho — a folha CLT estava se encerrando. Nao ha competencia agosto.' },
  { re: /^Marketing - trafego pago$/i, valor: 2500, motivo: 'Nao ha contrato mensal de trafego. O chefe paga o Meta quando paga e lanca na conciliacao (foi assim em 10/08, 3.500,00, e em 27/08, 2.000,00).' },
  { re: /^Despesas operacionais - Melhoradores Especial/i, valor: 3200, motivo: 'Estimativa de despesa de leilao. Regra do chefe: despesa operacional se lanca na validacao da conciliacao, nao por projecao. Substituida pela hospedagem real do Hotel Villa Cerrado (1.914,00), criada nesta mesma rodada.' },
]
let cancelado = 0
for (const c of CANCELAR) {
  const alvos = cp.filter(x => vivo(x) && c.re.test(x.descricao || ''))
  if (!alvos.length) { console.log('  = nada a cancelar para ' + c.re.source.slice(0, 40) + ' (ja saiu)'); continue }
  for (const t of alvos) {
    if (Math.abs(Number(t.valor) - c.valor) > 0.005) { console.error('  ! ' + t.id.slice(0, 8) + ' vale ' + brl(t.valor) + ', esperado ' + brl(c.valor)); erros++; continue }
    if (Number(t.valor_pago || 0) > 0) { console.error('  ! ' + t.id.slice(0, 8) + ' ja tem pagamento — nao cancelo'); erros++; continue }
    cancelado = r2(cancelado + Number(t.valor))
    console.log('  ✕ ' + fmt(t.valor) + '  ' + String(t.vencimento) + '  ' + String(t.descricao).slice(0, 52))
    console.log('       ' + c.motivo.slice(0, 150))
    if (APPLY) fail((await sb.from('erp_contas_pagar').update({
      status: 'cancelado',
      observacoes: (String(t.observacoes || '') + '\n' + TAG + ' CANCELADO: ' + c.motivo).trim(),
      tags: [...new Set([...(t.tags || []), 'cancelado-saneamento-28-08'])],
    }).eq('id', t.id)).error, 'cancela ' + t.id.slice(0, 8))
  }
}
console.log('\n  total cancelado: ' + brl(cancelado))

/* ================= [2] cria a despesa real ================================= */
console.log('\n[2] CRIA — a despesa real que substitui a estimativa\n')
const HOTEL = {
  nome: 'HOTEL VILLA CERRADO', doc: '15.736.254/0001-40',
  valor: 1914.00, venc: '2026-09-03',
  desc: 'Hospedagem Hotel Villa Cerrado - Felipe Peralta e Regiane Abreu (03 a 06/09)',
  nota: 'Reserva confirmada por WhatsApp: 2 hospedes (Felipe Peralta e Regiane Abreu), check-in 03/09 a partir das 12h, check-out 06/09 ate as 12h, diaria de R$ 319,00, total R$ 1.914,00, pagamento em Pix, 02 apartamentos cama casal individual. CNPJ 15.736.254/0001-40. Substitui a estimativa de 3.200,00 do Melhoradores Especial. ⚠ VINCULO DE LEILAO A CONFIRMAR: a estadia (03-06/09) nao coincide com o Melhoradores (29/08, ACRISSUL/Campo Grande); a agenda tem TOUROS JACAMIN em 05/09 (Nova Mutum/MT). Conferir com o chefe a qual evento amarrar.',
}
let fornecedorId = null
const { data: pJa } = await sb.from('erp_pessoas').select('id,nome').or('documento.eq.' + HOTEL.doc + ',nome.ilike.%VILLA CERRADO%').maybeSingle()
if (pJa) { fornecedorId = pJa.id; console.log('  FORNECEDOR = ja existe ' + pJa.id.slice(0, 8) + '  ' + pJa.nome) }
else {
  console.log('  FORNECEDOR + criar  ' + HOTEL.nome + ' (' + HOTEL.doc + ')')
  if (APPLY) {
    const { data, error } = await sb.from('erp_pessoas').insert({
      tipo: 'pj', nome: HOTEL.nome, documento: HOTEL.doc, is_fornecedor: true, is_cliente: false, ativo: true,
      observacoes: TAG + ' Cadastrado a partir da reserva confirmada por WhatsApp em 28/08/2026.',
    }).select('id').single()
    fail(error, 'cria fornecedor hotel'); fornecedorId = data?.id ?? null
  }
}
const { data: cpJa } = await sb.from('erp_contas_pagar').select('id').eq('valor', HOTEL.valor).eq('vencimento', HOTEL.venc).maybeSingle()
if (cpJa) console.log('  CP  = ja existe ' + cpJa.id.slice(0, 8))
else {
  console.log('  CP  + ' + fmt(HOTEL.valor) + '  ' + HOTEL.venc + '  ' + HOTEL.desc.slice(0, 54))
  if (APPLY) fail((await sb.from('erp_contas_pagar').insert({
    descricao: HOTEL.desc, fornecedor_id: fornecedorId, categoria_id: CAT_VIAGEM, centro_custo_id: CC_HOSPEDAGEM,
    conta_bancaria_id: CONTA, valor: HOTEL.valor, valor_pago: 0,
    emissao: '2026-08-28', vencimento: HOTEL.venc, status: 'aberto', forma_pagamento: 'pix',
    parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma', origem: 'real',
    observacoes: TAG + ' ' + HOTEL.nota,
    tags: ['a-pagar', 'setembro', 'leilao', 'hospedagem'],
  })).error, 'cria CP hotel')
}

/* ================= [3] corrige a categoria das faturas de cartao =========== */
console.log('\n[3] CORRIGE — fatura de cartao estava em "Comissoes" (custo direto da DRE)\n')
const faturas = cp.filter(x => vivo(x) && /^Fatura cartao (VISA|MASTERCARD)/i.test(x.descricao || ''))
for (const t of faturas) {
  const atual = CN[t.categoria_id]
  if (t.categoria_id === CAT_CARTAO) { console.log('  = ' + fmt(t.valor) + '  ja esta em Cartão de Crédito'); continue }
  console.log('  ~ ' + fmt(t.valor) + '  ' + String(t.vencimento) + '  ' + String(t.descricao).slice(0, 44))
  console.log('       ' + (atual ? atual.nome + ' (dre=' + atual.dre_grupo + ')' : '?') + '  ->  Cartão de Crédito (dre=despesa_variavel)')
  if (APPLY) fail((await sb.from('erp_contas_pagar').update({
    categoria_id: CAT_CARTAO,
    observacoes: (String(t.observacoes || '') + '\n' + TAG + ' Categoria corrigida de "' + (atual ? atual.nome : '?') + '" para "Cartão de Crédito". Fatura de cartao nao e comissao — na categoria antiga ela entrava no custo direto da DRE junto com a comissao dos assessores.').trim(),
  }).eq('id', t.id)).error, 'categoria fatura')
}
const pagas = cp.filter(x => x.status === 'pago' && /^Fatura cartao (VISA|MASTERCARD)/i.test(x.descricao || '') && x.categoria_id !== CAT_CARTAO)
if (pagas.length) console.log('\n  ⚠ ' + pagas.length + ' fatura(s) JA PAGA(S) tambem estao em "Comissoes" (' + brl(pagas.reduce((s, c) => s + Number(c.valor), 0)) + ', venc. 24/08). Nao mexi: mudar categoria de titulo pago reescreve a DRE de agosto. Decidir a parte.')

/* ================= [4] retrato depois ====================================== */
console.log('\n[4] DEPOIS\n')
let cp2 = [], o2 = 0
for (;;) { const { data } = await sb.from('erp_contas_pagar').select('*').range(o2, o2 + 999); cp2 = cp2.concat(data || []); if (!data || data.length < 1000) break; o2 += 1000 }
const dep = cp2.filter(vivo)
console.log('  ' + dep.length + ' titulos vivos = ' + brl(dep.reduce((s, c) => s + falta(c), 0)))
const agg = {}
for (const c of dep) { const k = (CN[c.categoria_id]?.nome || '(sem categoria)') + ' :: ' + (c.origem || '?'); agg[k] = r2((agg[k] || 0) + falta(c)) }
for (const [k, v] of Object.entries(agg).sort((a, b) => b[1] - a[1])) console.log('    ' + fmt(v) + '  ' + k)

console.log('\n' + (APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.'))
