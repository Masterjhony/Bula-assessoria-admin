/**
 * Conciliacao Sicoob 01-02/09/2026 + perna do Sicredi que faltava.
 *
 * Fonte: "sicoob_2026_09_03_15_11_57.pdf" (periodo 01-03/09, saldo final
 * 33.379,76 C em 02/09), baixado pelo Joao em 03/09/2026 15:11, convertido por
 * scripts/sicoob-pdf-para-csv.mjs (validacao por saldo OK) e importado por
 * scripts/importa-extrato.mts (13 novos / 3 deduplicados).
 *
 * POR QUE 13 NOVOS: o extrato de 01/09 que fechou a conciliacao de agosto foi
 * emitido as 15:11 daquele dia e so tinha 3 lancamentos (tarifa, CRED.LIQ do
 * Kito e o PIX de 12.000 do Sicredi). Os NOVE PIX da folha de agosto cairam
 * depois e nunca entraram. Por isso o ERP marcava 60.682,37 e o banco, 33.379,76.
 *
 * [1] 01/09  FOLHA DE AGOSTO/2026 - 47.951,61 em 9 PIX. Cada um baixa o seu CP.
 *     ATENCAO: DOUGLAS BISPO recebeu 10.000,00 contra CP de 12.500,00 (que e o
 *     valor canonico de erp_folha_estrutura). Fica 'parcial' com 2.500,00 em
 *     aberto - decisao do Joao: ou paga o saldo, ou o fixo do Douglas mudou e a
 *     estrutura precisa ser corrigida por reprojeta-folha.mts.
 *
 * [2] 02/09 +24.904,00 CRED.TRANSF.CONTAS BULA REMATES "ACERTO ASSESSORIA SAO
 *     GERALDO" = parcial do CR 977bf923 (50.198,00, venc. 20/09).
 *     ATENCAO: 24.904,00 e EXATAMENTE metade de 1% x R$ 4.980.800,00 - o
 *     faturamento que o HastaPro (FIL 01) registra para o evento. O CR foi
 *     lancado sobre R$ 5.019.800,00 (planilha-mestra do Drive). Se a base certa
 *     for a do HastaPro o titulo vale 49.808,00 e o saldo e 24.904,00; pela base
 *     atual o saldo e 25.294,00. Diferenca de 390,00 a confirmar com a Remates.
 *
 * [3] 02/09  -2.500,00 trafego pago do leilao Jacamin, PIX ao Facebook
 *     (13.347.016/0001-17). O CP estimado de marketing de setembro estava
 *     cancelado; CP real lancado a posteriori (mesmo padrao do Vercel de 28/08).
 *
 * [4] 02/09  -675,00 Laila e -1.080,00 Peralta = os 1.755,00 de comissao de
 *     julho decididos em 02/09. Baixam os CPs eccf1fc9 e b0d82692 (venc. 25/08).
 *     Peralta estava sem fornecedor no titulo; recebe o cadastro (CPF bate com
 *     o ***.814.661-** do extrato).
 *
 * [5] 01/09  PERNA DO SICREDI do PIX de 12.000,00 de mesma titularidade, que em
 *     01/09 ficou declarada como pendencia porque o extrato do Sicredi nao
 *     existia. O Joao confirmou em 03/09 que a conta ficou com 515,99. Lanca o
 *     par completo, no mesmo formato do PIX de 15.000,00 de 04/08:
 *       Investimentos -12.000,00 (resgate)  ->  CC +12.000,00
 *       CC -12.000,00  <->  Sicoob +12.000,00 (transferencia_par_id)
 *     ATENCAO: sobram 82,65. 12.598,64 - 12.000,00 = 598,64, mas a conta tem
 *     515,99. Entra como AJUSTE DE POSICAO na aplicacao (mesmo padrao do ajuste
 *     de 1.978,56 de 03/08), com a decomposicao a confirmar quando o extrato do
 *     Sicredi entrar. A hipotese que fecha ao centavo e cesta de relacionamento
 *     67,64 + integralizacao de capital 20,00 - rendimento 4,99.
 *
 * Reexecutavel: cada bloco confere o estado antes de gravar e nao repete nota.
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const TAG = '[CONCILIADO 03/09]'
const FONTE = 'Extrato Sicoob 01-03/09/2026 ("sicoob_2026_09_03_15_11_57.pdf", emitido 03/09/2026 15:11)'
const SALDO_EXTRATO = 33379.76

const CONTA_SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const CONTA_SICREDI_CC = 'af4724ec-e098-4e13-b172-04b2bfb1949d'
const CONTA_SICREDI_INV = '5879aa04-2d69-4b9a-a80c-d9e3eca7ac06'

const CAT_FOLHA = '4c79d95f-a8a4-4aff-9f7a-cd82f974c4b3'         // despesa
const CAT_COMISSOES = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'     // despesa
const CAT_MARKETING = '26762d4e-b517-48b9-98f3-155a6421264e'     // despesa
const CAT_COMISSAO_LEIL = 'e74434bd-3366-4015-9268-15d6640cf15f' // receita
const CAT_TRANSF_ENT = '2847979e-b319-4cad-9510-828c9d6bc1c0'    // receita / ignorar
const CAT_TRANSF_SAI = '1d83b7e5-aa77-4e1d-a774-64ecfda0b746'    // despesa / ignorar
const CAT_TARIFAS = 'f8ae3a53-bb4e-414e-97d1-ebdca81df658'       // despesa / financeiro

const CC_COMISSAO = '52dd8ed0-0c0a-4524-86bd-01dc121487b3'
const CC_MARKETING = '70886cf3-c996-46de-a049-26581b3d08ad'

const P_FACEBOOK = '51ebfcd7-2cb0-4ad0-9052-e73e8f68cc82'
const P_LAILA = '5b3d757f-46c3-45eb-8439-dd602c93fad8'
const P_PERALTA = 'd742ed5b-0ab2-4934-b10e-9099106fa994'
const P_REMATES = '0e458050-bf86-4c52-9a4e-a06d0b94a386'
const CR_SAO_GERALDO = '977bf923-0df3-4385-83e6-7334a99b9795'
const CP_LAILA = 'eccf1fc9-e5f2-43d5-92bf-b837628104d6'
const CP_PERALTA = 'b0d82692-237b-42de-b083-bcb76b2d7c46'

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const say = (s: string) => console.log(s)

async function movimento(data: string, valor: number, trecho: string) {
  const { data: rows } = await sb.from('erp_movimentos_bancarios')
    .select('id,data,tipo,valor,descricao,status_conciliacao,conta_pagar_id,conta_receber_id,categoria_id,pessoa_id,observacoes')
    .eq('conta_bancaria_id', CONTA_SICOOB).eq('data', data).eq('valor', valor).ilike('descricao', '%' + trecho + '%')
  if (!rows || rows.length !== 1) throw new Error('movimento ambiguo/ausente: ' + data + ' ' + brl(valor) + ' "' + trecho + '" -> ' + (rows?.length ?? 0))
  return rows[0]
}

async function classifica(mov: any, campos: Record<string, any>, nota: string) {
  const obs = String(mov.observacoes || '')
  const novaObs = obs.includes(TAG) ? obs : (obs ? obs + ' ' : '') + TAG + ' ' + nota
  const patch = { ...campos, status_conciliacao: 'conciliado', conciliado: true, observacoes: novaObs }
  say('  mov ' + mov.data + ' ' + brl(mov.valor).padStart(11) + '  ' + String(mov.descricao).slice(0, 58))
  if (APPLY) {
    const { error } = await sb.from('erp_movimentos_bancarios').update(patch).eq('id', mov.id)
    if (error) throw error
  }
}

async function baixaCP(cpId: string, valorPago: number, dataPag: string, nota: string) {
  const { data: cp, error } = await sb.from('erp_contas_pagar').select('*').eq('id', cpId).single()
  if (error || !cp) throw new Error('CP nao encontrado: ' + cpId)
  const jaPago = Number(cp.valor_pago || 0)
  const obs = String(cp.observacoes || '')
  // Reexecucao: a marca do lote e a prova de que esta baixa ja foi dada. Sem
  // isso um segundo --apply somaria valor_pago de novo (o Douglas, que fica
  // 'parcial', passaria de 10.000 para 20.000).
  if (obs.includes(TAG) || (cp.status === 'pago' && jaPago >= Number(cp.valor))) {
    say('  CP  ' + String(cp.descricao).slice(0, 52).padEnd(52) + ' (baixa ja dada — nada a fazer)')
    return
  }
  const total = jaPago + valorPago
  const status = total + 0.005 >= Number(cp.valor) ? 'pago' : 'parcial'
  const novaObs = obs.includes(TAG) ? obs : (obs ? obs + ' ' : '') + TAG + ' ' + nota
  say('  CP  ' + String(cp.descricao).slice(0, 52).padEnd(52) + ' ' + brl(cp.valor).padStart(10) + ' -> pago ' + brl(total).padStart(10) + ' [' + status + ']')
  if (APPLY) {
    const { error: e2 } = await sb.from('erp_contas_pagar').update({
      status, valor_pago: total, data_pagamento: dataPag,
      forma_pagamento: cp.forma_pagamento || 'pix',
      conta_bancaria_id: cp.conta_bancaria_id || CONTA_SICOOB,
      observacoes: novaObs,
    }).eq('id', cpId)
    if (e2) throw e2
  }
}

// ---------------------------------------------------------------------------
// [1] Folha de agosto/2026 - 9 PIX de 01/09
// ---------------------------------------------------------------------------
say('\n=== [1] FOLHA DE AGOSTO/2026 (paga em 01/09) ===')
const FOLHA: Array<[string, number, string, string]> = [
  ['Ref salario Agosto Luana', 1161.29, 'c6a0df12-bc44-49cf-8eb9-faddd643ebfb', 'eeccb91b-f4bf-4be1-af64-5363330674a2'],
  ['Ref salario Agosto M1', 6000.00, '48fa00ff-ecd3-4df5-9d10-20c70e2bd8e7', '1f0cbda7-40a4-40aa-8d3e-5e7ac2a6bee4'],
  ['Ref salario Agosto Pedro', 1290.32, '00bfaa77-6bef-4b21-9ac2-e1c3b1e7da0c', '405cf221-de1b-4afa-94b7-5f79ef035183'],
  ['Ref Salario Joao Gabriel Agosto', 2000.00, '9ede4844-eafc-427a-83a2-a5ada50afb76', '6a6e21ec-22b1-4f24-a7b1-143a9744f3a5'],
  ['Ref salario Joao Antonio Agosto', 2000.00, '3f35239f-0f1d-44cc-8088-721a96855818', 'f3a7d916-b20d-4cd9-8636-0aa92e5529ad'],
  ['Ref salario Agosto Fabio', 7000.00, 'e3bcce6c-b6e5-4990-bab1-4eb18d490e70', 'c5919834-4e98-4f07-88a8-0892e4f7c247'],
  ['Ref Salario Agosto Douglas', 10000.00, '20ae6d66-84c5-4d9f-ada1-9096696ffc9c', 'e2ea805a-ce5e-4b69-836e-2b178c61bcf3'],
  ['LEONARDO SERAFIM FRANCISCO', 13500.00, 'e05bf5b2-3dd6-4e94-99f4-034b0b34bd48', '96c3b208-be13-4b37-b8bd-5dfe885e2600'],
  ['Ref Agosto salario joao', 5000.00, 'dd5ee55c-03c6-42ae-a35c-c7108889307e', '72f9c999-48cc-4d5a-8ab0-9db5fb758418'],
]
let somaFolha = 0
for (const [trecho, valor, cpId, pessoaId] of FOLHA) {
  const mov = await movimento('2026-09-01', valor, trecho)
  const { data: cp } = await sb.from('erp_contas_pagar').select('centro_custo_id,valor').eq('id', cpId).single()
  const falta = Number(cp!.valor) - valor
  const nota = falta > 0.005
    ? 'Folha de agosto/2026 paga em 01/09. PARCIAL: ' + brl(valor) + ' de ' + brl(cp!.valor) + '; restam ' + brl(falta) + '. ' + FONTE + '.'
    : 'Folha de agosto/2026 paga em 01/09. ' + FONTE + '.'
  await classifica(mov, { categoria_id: CAT_FOLHA, centro_custo_id: cp!.centro_custo_id, pessoa_id: pessoaId, conta_pagar_id: cpId }, nota)
  await baixaCP(cpId, valor, '2026-09-01', nota)
  somaFolha += valor
}
say('  --> folha paga em 01/09: ' + brl(somaFolha) + ' (estrutura canonica 50.451,61 - faltam 2.500,00 do Douglas)')

// ---------------------------------------------------------------------------
// [2] 02/09 +24.904,00 - parcial do CR Sao Geraldo
// ---------------------------------------------------------------------------
say('\n=== [2] ACERTO ASSESSORIA SAO GERALDO (+24.904,00 em 02/09) ===')
{
  const mov = await movimento('2026-09-02', 24904.00, 'ACERTO ASSESSORIA')
  const { data: cr } = await sb.from('erp_contas_receber').select('*').eq('id', CR_SAO_GERALDO).single()
  const jaReceb = Number(cr!.valor_recebido || 0)
  const total = String(cr!.observacoes || '').includes(TAG) ? jaReceb : jaReceb + 24904
  const saldo = Number(cr!.valor) - total
  const status = saldo <= 0.005 ? 'recebido' : 'parcial'
  const nota = 'Parcial da Bula Remates em 02/09 ("ACERTO ASSESSORIA SAO GERALDO", doc 3042216). '
    + 'Recebido ' + brl(total) + ' de ' + brl(cr!.valor) + '; saldo ' + brl(saldo) + '. '
    + 'ATENCAO: 24.904,00 e exatamente metade de 1% x R$ 4.980.800,00, o faturamento do evento no HastaPro (FIL 01, 137 lotes). '
    + 'O titulo foi lancado sobre R$ 5.019.800,00 (planilha-mestra do Drive, 13/08). Se a base certa for a do HastaPro o titulo '
    + 'vale 49.808,00 e o saldo cai para 24.904,00 - diferenca de 390,00 a confirmar com a Bula Remates. ' + FONTE + '.'
  await classifica(mov, { categoria_id: CAT_COMISSAO_LEIL, pessoa_id: P_REMATES, conta_receber_id: CR_SAO_GERALDO }, nota)
  say('  CR  ' + String(cr!.descricao).slice(0, 52).padEnd(52) + ' ' + brl(cr!.valor).padStart(10) + ' -> recebido ' + brl(total) + ' [' + status + '] saldo ' + brl(saldo))
  if (APPLY && !String(cr!.observacoes || '').includes(TAG)) {
    const { error } = await sb.from('erp_contas_receber').update({
      status, valor_recebido: total,
      forma_recebimento: cr!.forma_recebimento || 'transferencia',
      conta_bancaria_id: CONTA_SICOOB,
      observacoes: (cr!.observacoes ? cr!.observacoes + ' ' : '') + TAG + ' ' + nota,
    }).eq('id', CR_SAO_GERALDO)
    if (error) throw error
  }
}

// ---------------------------------------------------------------------------
// [3] 02/09 -2.500,00 trafego pago Jacamin (Facebook)
// ---------------------------------------------------------------------------
say('\n=== [3] TRAFEGO PAGO - LEILAO JACAMIN (-2.500,00 em 02/09) ===')
{
  const mov = await movimento('2026-09-02', 2500.00, 'trafego pago leilao jacamin')
  const NUMDOC = 'BULA-2026-CP-TRAFEGO-JACAMIN-20260902'
  const { data: existente } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', NUMDOC).maybeSingle()
  let cpId = existente?.id ?? null
  const nota = 'Trafego pago do Leilao Jacamin, PIX ao Facebook Servicos Online do Brasil (13.347.016/0001-17). '
    + 'CP real lancado a posteriori - o CP estimado de marketing de 10/09 estava cancelado. ' + FONTE + '.'
  if (!cpId) {
    say('  CP  (novo) Trafego pago - Leilao Jacamin (Facebook Ads)          2.500,00 -> pago')
    if (APPLY) {
      const { data: novo, error } = await sb.from('erp_contas_pagar').insert({
        descricao: 'Trafego pago - Leilao Jacamin (Facebook Ads)', fornecedor_id: P_FACEBOOK,
        categoria_id: CAT_MARKETING, centro_custo_id: CC_MARKETING, conta_bancaria_id: CONTA_SICOOB,
        valor: 2500, valor_pago: 2500, emissao: '2026-09-02', vencimento: '2026-09-02',
        data_pagamento: '2026-09-02', status: 'pago', forma_pagamento: 'pix', numero_documento: NUMDOC,
        origem: 'real', tags: ['a-pagar', 'marketing', '2026', 'setembro', 'leilao'],
        observacoes: TAG + ' ' + nota,
      }).select('id').single()
      if (error) throw error
      cpId = novo!.id
    }
  } else say('  CP  (ja existe) ' + cpId)
  await classifica(mov, { categoria_id: CAT_MARKETING, centro_custo_id: CC_MARKETING, pessoa_id: P_FACEBOOK, conta_pagar_id: cpId }, nota)
}

// ---------------------------------------------------------------------------
// [4] 02/09 comissoes de julho: Laila 675,00 e Peralta 1.080,00
// ---------------------------------------------------------------------------
say('\n=== [4] COMISSOES DE JULHO - LAILA E PERALTA (1.755,00 em 02/09) ===')
{
  const nota = 'Comissao de julho/2026 paga em 02/09, conforme decidido em 02/09: 1.755,00 agora '
    + '(Laila 675,00 + Peralta 1.080,00) e o restante em 25/09. ' + FONTE + '.'
  const laila = await movimento('2026-09-02', 675.00, '66.991.669')
  await classifica(laila, { categoria_id: CAT_COMISSOES, centro_custo_id: CC_COMISSAO, pessoa_id: P_LAILA, conta_pagar_id: CP_LAILA },
    nota + ' PIX ao CNPJ 66.991.669/0001-09 (L. S. Servicos e Assessoria Veterinaria, empresa da Laila).')
  await baixaCP(CP_LAILA, 675.00, '2026-09-02', nota)

  const peralta = await movimento('2026-09-02', 1080.00, '814.661')
  await classifica(peralta, { categoria_id: CAT_COMISSOES, centro_custo_id: CC_COMISSAO, pessoa_id: P_PERALTA, conta_pagar_id: CP_PERALTA }, nota)
  await baixaCP(CP_PERALTA, 1080.00, '2026-09-02', nota)
  const { data: cpP } = await sb.from('erp_contas_pagar').select('fornecedor_id').eq('id', CP_PERALTA).single()
  if (!cpP?.fornecedor_id) {
    say('  CP Peralta estava sem fornecedor -> Luiz Felipe Peralta Garcez (009.814.661-09)')
    if (APPLY) await sb.from('erp_contas_pagar').update({ fornecedor_id: P_PERALTA }).eq('id', CP_PERALTA)
  }
}

// ---------------------------------------------------------------------------
// [5] Perna do Sicredi do PIX de 12.000,00 + ajuste de posicao
// ---------------------------------------------------------------------------
say('\n=== [5] SICREDI - perna do PIX de 12.000,00 de 01/09 + ajuste de posicao ===')
{
  const sicoobEnt = await movimento('2026-09-01', 12000.00, 'PIX REC.OUTRA IF MT')
  const notaPar = '[SICREDI 01/09] Perna oposta do PIX de mesma titularidade recebido no Sicoob em 01/09. '
    + 'Confirmada pelo Joao em 03/09: apos a transferencia a conta do Sicredi ficou com 515,99. '
    + 'Lancada no formato do PIX de 15.000,00 de 04/08 - resgate da aplicacao para a CC e saida da CC para o Sicoob.'

  const KEY_RESG_INV = 'ajuste:sicredi-resg-2026-09-01-inv'
  const KEY_RESG_CC = 'ajuste:sicredi-resg-2026-09-01-cc'
  const KEY_TRANSF = 'par:transf-sicredi-sicoob-2026-09-01'
  const { data: jaExiste } = await sb.from('erp_movimentos_bancarios').select('id,import_key').in('import_key', [KEY_RESG_INV, KEY_RESG_CC, KEY_TRANSF])
  const tem = new Set((jaExiste || []).map(x => x.import_key))

  if (!tem.has(KEY_TRANSF)) {
    say('  Sicredi Investimentos  saida   -12.000,00  RESGATE ENVIADO A CC 53609-7 (varredura)')
    say('  Sicredi CC             entrada +12.000,00  RESG.APLIC.FIN.AVISO PREV')
    say('  Sicredi CC             saida   -12.000,00  TRANSFERENCIA PARA SICOOB (par do credito de 01/09)')
    if (APPLY) {
      const { error: e1 } = await sb.from('erp_movimentos_bancarios').insert([
        {
          conta_bancaria_id: CONTA_SICREDI_INV, data: '2026-09-01', tipo: 'saida', valor: 12000,
          descricao: 'RESGATE ENVIADO A CC 53609-7 (varredura) - cobre o PIX de 12.000,00 ao Sicoob',
          categoria_id: CAT_TRANSF_SAI, conciliado: true, status_conciliacao: 'conciliado',
          origem: 'ajuste_manual', documento: 'varredura', observacoes: notaPar, import_key: KEY_RESG_INV,
        },
        {
          conta_bancaria_id: CONTA_SICREDI_CC, data: '2026-09-01', tipo: 'entrada', valor: 12000,
          descricao: 'RESG.APLIC.FIN.AVISO PREV - resgate da aplicacao para cobrir o PIX de 12.000,00 ao Sicoob',
          categoria_id: CAT_TRANSF_ENT, conciliado: true, status_conciliacao: 'conciliado',
          origem: 'ajuste_manual', documento: 'varredura', observacoes: notaPar, import_key: KEY_RESG_CC,
        },
      ])
      if (e1) throw e1
      const { data: saidaCC, error: e2 } = await sb.from('erp_movimentos_bancarios').insert({
        conta_bancaria_id: CONTA_SICREDI_CC, data: '2026-09-01', tipo: 'saida', valor: 12000,
        descricao: 'TRANSFERENCIA PARA SICOOB - PIX mesma titularidade (Bula 34.791.630/0001-43)',
        categoria_id: CAT_TRANSF_SAI, conciliado: true, status_conciliacao: 'conciliado',
        origem: 'manual', transferencia_par_id: sicoobEnt.id,
        observacoes: notaPar, import_key: KEY_TRANSF,
      }).select('id').single()
      if (e2) throw e2
      await sb.from('erp_movimentos_bancarios').update({ transferencia_par_id: saidaCC!.id }).eq('id', sicoobEnt.id)
    }
  } else say('  (par do Sicredi ja lancado)')

  const KEY_AJUSTE = 'ajuste:sicredi-posicao-2026-09-03'
  const { data: temAjuste } = await sb.from('erp_movimentos_bancarios').select('id').eq('import_key', KEY_AJUSTE).maybeSingle()
  if (!temAjuste) {
    say('  Sicredi Investimentos  saida       -82,65  AJUSTE DE POSICAO (para fechar em 515,99)')
    if (APPLY) {
      const { error } = await sb.from('erp_movimentos_bancarios').insert({
        conta_bancaria_id: CONTA_SICREDI_INV, data: '2026-09-01', tipo: 'saida', valor: 82.65,
        descricao: 'AJUSTE DE POSICAO SICREDI - tarifas/rendimentos ainda nao extratados',
        categoria_id: CAT_TARIFAS, conciliado: true, status_conciliacao: 'conciliado',
        origem: 'ajuste_manual', documento: 'posicao',
        observacoes: '[SICREDI 03/09] Ancora a posicao do Sicredi nos 515,99 que o Joao confirmou em 03/09/2026. '
          + 'O ERP derivava 12.598,64; menos os 12.000,00 da transferencia sobrariam 598,64 - a diferenca e 82,65. '
          + 'Mesmo padrao do ajuste de 1.978,56 de 03/08. A decomposicao ainda NAO foi conferida no extrato do Sicredi; '
          + 'a hipotese que fecha ao centavo e cesta de relacionamento 67,64 + integralizacao de capital 20,00 - rendimento 4,99. '
          + 'SUBSTITUIR por lancamentos reais quando o extrato do Sicredi de agosto/setembro entrar.',
        import_key: KEY_AJUSTE,
      })
      if (error) throw error
    }
  } else say('  (ajuste de posicao ja lancado)')
}

// ---------------------------------------------------------------------------
// Verificacao final
// ---------------------------------------------------------------------------
say('\n=== VERIFICACAO ===')
const { data: contas } = await sb.from('erp_contas_bancarias').select('id,nome,saldo_atual').order('nome')
for (const c of contas || []) say('  ' + String(c.nome).padEnd(48) + brl(c.saldo_atual).padStart(12))
const sicoob = (contas || []).find(c => c.id === CONTA_SICOOB)
say('  Sicoob x extrato: ' + brl(sicoob?.saldo_atual) + ' x ' + brl(SALDO_EXTRATO) + ' -> diferenca ' + brl(Number(sicoob?.saldo_atual || 0) - SALDO_EXTRATO))
const sicrediTotal = (contas || []).filter(c => /sicredi/i.test(String(c.nome))).reduce((s, c) => s + Number(c.saldo_atual || 0), 0)
say('  Sicredi total: ' + brl(sicrediTotal) + ' (declarado pelo Joao em 03/09: 515,99)')

const { data: pend } = await sb.from('erp_movimentos_bancarios').select('id,data,valor,descricao').neq('status_conciliacao', 'conciliado')
say('  Movimentos fora de conciliado: ' + (pend?.length ?? 0))
for (const m of pend || []) say('    ' + m.data + ' ' + brl(m.valor) + ' ' + String(m.descricao).slice(0, 60))

say(APPLY ? '\nGRAVADO.' : '\nDRY-RUN. Use --apply para gravar.')
