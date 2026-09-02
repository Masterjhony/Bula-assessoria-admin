/**
 * Conciliacao Sicoob 28/08 -> 01/09/2026 + fechamento da conciliacao de AGOSTO.
 *
 * Fonte: "extrato agosto.pdf" (01-31/08, saldo final 33.654,45 C) e
 * "extrato setembro.pdf" (01/09, saldo final 60.682,37 C), baixados pelo Joao em
 * 01/09/2026 15:12, convertidos por scripts/sicoob-pdf-para-csv.mjs (validacao
 * por saldo OK nos dois) e importados por scripts/importa-extrato.mts
 * (agosto: 1 novo / 61 deduplicados; setembro: 3 novos).
 *
 * Pedido do chefe (01/09, 11:48): "Algumas saidas de Agosto nao estao
 * conciliadas. Finaliza essa conciliacao no detalhe e me envia um excel".
 * Sobravam TRES saidas de agosto fora de 'conciliado' — e as tres fecham aqui.
 *
 * [1] 25/08  -5.262,00  LEONARDO SERAFIM  (estava 'classificado', sem titulo)
 * [2] 25/08  -8.826,00  FABIO OMENA       (estava 'classificado', sem titulo)
 *     Os dois ficaram deliberadamente sem vinculo em 26/08 porque a atribuicao
 *     dos lotes 26 e 30 da EAO Baviera Femeas estava em disputa. A disputa
 *     ACABOU em 28/08 (commit c12b98a, scripts/corrige-atribuicao-julho-2026.mjs):
 *     a mensagem formal do grupo — "Foi com <X> da Bula Assessoria" — e o
 *     registro primario do arremate, e ela mostrou que o parser tinha lido quem
 *     POSTOU, nao quem VENDEU. Corrigidos 10 lotes de julho, os dois PIX passaram
 *     a fechar ao centavo e os 12 titulos foram baixados com data_pagamento
 *     25/08. O que faltava era so o vinculo do MOVIMENTO — e e exatamente isso
 *     que o chefe esta vendo como "nao conciliado".
 *     Convencao (erp-conciliacao-24-08): movimento que quita varios titulos
 *     aponta para o MAIOR do lote e o rateio completo vive na observacao.
 *
 * [3] 28/08   -110,00  Plano de hospedagem Vercel, reembolsado ao Joao Eduardo
 *     (CPF ***.037.156-**). Mesma natureza do PIX de 18/08 (180,00, "sistema
 *     fatura banco de dados", CP c2500d2e). CP lancado a posteriori.
 *
 * Setembro (para o extrato nao entrar sujo na proxima conciliacao):
 * [4] 01/09    -2,08  TARIFA COBRANCA — tarifa do boleto liquidado em [5].
 * [5] 01/09 +15.030,00 CRED.LIQ.COBRANCA = 3a e ULTIMA parcela do Kito
 *     (CR c273d095, boleto BULA-2026-CR-KITO-20260509-B2, venc. 30/08). Fecha
 *     os 45.090,00 do acordo 4R que a Assessoria recebe em dinheiro — era o
 *     unico saldo do 4R ainda em aberto.
 * [6] 01/09 +12.000,00 PIX de MESMA TITULARIDADE = transferencia interna
 *     (dre 'ignorar'). A perna do Sicredi NAO e lancada: o extrato Sicredi de
 *     setembro nao existe ainda. Fica declarado como pendencia.
 *
 * [7] Faxina de detalhe pedida pelo "no detalhe": o PIX de 39,00 de 10/08 estava
 *     em "Outras Despesas" com a nota "contraparte nao identificada". O CNPJ
 *     21.986.213/0001-04 esta cadastrado: BOLOS & CIA. Vira Alimentacao/Refeicoes.
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
const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7' // Sicoob CC 1.056-1
const TAG = '[CONCILIADO 01/09]'
const FONTE_AGO = 'Extrato Sicoob 01-31/08/2026 ("extrato agosto.pdf", emitido 01/09/2026 15:11)'
const FONTE_SET = 'Extrato Sicoob 01/09/2026 ("extrato setembro.pdf", emitido 01/09/2026 15:11)'
const SALDO_EXTRATO = 60682.37

const CAT_COMISSOES     = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e' // despesa / custo_direto
const CAT_COMISSAO_LEIL = 'e74434bd-3366-4015-9268-15d6640cf15f' // receita
const CAT_SOFTWARE      = '0edf60f2-bf96-44bd-8f93-ca5432b69830' // despesa / despesa_fixa
const CAT_TARIFAS       = 'f8ae3a53-bb4e-414e-97d1-ebdca81df658' // despesa / financeiro
const CAT_TRANSF_ENT    = '2847979e-b319-4cad-9510-828c9d6bc1c0' // receita / ignorar
const CAT_ALIMENTACAO   = 'b26ffe87-f4d6-4060-b697-a7f698c35f7d' // despesa / despesa_variavel
const CAT_OUTRAS_DESP   = '20c2defd-415c-42cc-8939-fcd8cf104280'
const CC_COMISSAO       = '52dd8ed0-0c0a-4524-86bd-01dc121487b3' // Comissao Assessores

const P_LEONARDO = '105bb753-2271-4529-8373-771a7b9a3866'
const P_FABIO    = 'c5919834-4e98-4f07-88a8-0892e4f7c247'
const P_JOAO_ED  = '72f9c999-48cc-4d5a-8ab0-9db5fb758418'
const P_SICOOB_T = 'e5488a95-aef2-4288-aba6-428c5c5fbdb2'
const P_BOLOS    = '6fe48064-1416-4f96-93f9-136566dee83d'
const CR_KITO3   = 'c273d095-7933-4b86-b28b-3c445df1af2d'

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const fmt = (n: any) => brl(n).padStart(12)
let erros = 0
const fail = (e: any, ctx: string) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }
const anexa = (antes: any, nota: string) => String(antes || '').includes(TAG) ? String(antes || '') : (String(antes || '') + '\n' + nota).trim()

console.log(APPLY ? '>>> APLICANDO <<<' : '>>> DRY-RUN (use --apply para gravar) <<<')

/* ---------- localiza os movimentos ---------------------------------------- */
const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,tipo,valor,descricao,status_conciliacao,observacoes,conta_pagar_id,conta_receber_id')
  .eq('conta_bancaria_id', CONTA).gte('data', '2026-08-25').lte('data', '2026-09-01')
const acha = (data: string, tipo: string, valor: number) =>
  (movs || []).find(m => m.data === data && m.tipo === tipo && Math.abs(Number(m.valor) - valor) < 0.005)

const mvLeo    = acha('2026-08-25', 'saida', 5262)
const mvFabio  = acha('2026-08-25', 'saida', 8826)
const mvVercel = acha('2026-08-28', 'saida', 110)
const mvTarifa = acha('2026-09-01', 'saida', 2.08)
const mvKito   = acha('2026-09-01', 'entrada', 15030)
const mvTransf = acha('2026-09-01', 'entrada', 12000)
const faltando = Object.entries({ mvLeo, mvFabio, mvVercel, mvTarifa, mvKito, mvTransf }).filter(([, v]) => !v).map(([k]) => k)
if (faltando.length) {
  console.error('FALTAM movimentos no ERP: ' + faltando.join(', '))
  console.error('Rode antes: node scripts/sicoob-pdf-para-csv.mjs "<pdf>" <csv> && npx tsx scripts/importa-extrato.mts <csv> --apply')
  process.exit(1)
}

/* ---------- resolve os titulos de comissao de julho baixados em 25/08 ------ */
const { data: cpJul } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,valor_pago,status,vendedor,data_pagamento')
  .eq('data_pagamento', '2026-08-25')
const doVendedor = (re: RegExp) => (cpJul || []).filter(c => re.test(String(c.vendedor || '')))
const lotLeo = doVendedor(/^LEONARDO/i).sort((a, b) => Number(b.valor) - Number(a.valor))
const lotFab = doVendedor(/F.BIO/i).sort((a, b) => Number(b.valor) - Number(a.valor))
const somaLeo = lotLeo.reduce((a, c) => a + Number(c.valor_pago || 0), 0)
const somaFab = lotFab.reduce((a, c) => a + Number(c.valor_pago || 0), 0)

// O adiantamento de 120,00 do Fabio vive num titulo PARCIAL, nao no lote de 25/08.
const { data: cpSC } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,valor_pago,status')
  .ilike('descricao', '%NELORE SANTA CRUZ - 19/07/2026 - FABIO OMENA%').maybeSingle()
const adiantFab = Number(cpSC?.valor_pago || 0)

console.log('\n--- travas de sanidade ---')
console.log('  Leonardo: ' + lotLeo.length + ' titulos = ' + brl(somaLeo) + '  (PIX 5.262,00)')
console.log('  Fabio   : ' + lotFab.length + ' titulos = ' + brl(somaFab) + ' + adiantamento ' + brl(adiantFab) + ' = ' + brl(somaFab + adiantFab) + '  (PIX 8.826,00)')
if (Math.abs(somaLeo - 5262) > 0.005) { console.error('  ! lote do Leonardo nao fecha o PIX'); erros++ }
if (Math.abs(somaFab + adiantFab - 8826) > 0.005) { console.error('  ! lote do Fabio nao fecha o PIX'); erros++ }
if (erros) { console.error('\nAbortado: as travas nao passaram.'); process.exit(1) }

const linha = (c: any) => '      - ' + brl(c.valor_pago).padStart(9) + '  ' + String(c.descricao).replace(/^COMISSAO /, '').slice(0, 78)
console.log('  Leonardo:'); lotLeo.forEach(c => console.log(linha(c)))
console.log('  Fabio:');    lotFab.forEach(c => console.log(linha(c)))
if (cpSC) console.log('      - ' + brl(adiantFab).padStart(9) + '  ADIANTAMENTO sobre ' + String(cpSC.descricao).replace(/^COMISSAO /, '').slice(0, 66) + ' (titulo de ' + brl(cpSC.valor) + ', segue parcial)')

const rateio = (lote: any[]) => lote.map(c => brl(c.valor_pago) + ' ' + String(c.descricao).replace(/^COMISSAO /, '')).join(' + ')

/* ================= [1] LEONARDO -5.262,00 (25/08) ========================== */
console.log('\n[1] 25/08  -' + fmt(5262) + '  LEONARDO SERAFIM FRANCISCO LTDA — comissao de julho/2026')
const NOTA_LEO = TAG + ' Comissao de julho/2026 do Leonardo Serafim, QUITADA e agora vinculada. A divergencia de atribuicao dos lotes 26 e 30 da EAO Baviera Femeas, que em 26/08 impediu o vinculo, foi RESOLVIDA em 28/08 (script corrige-atribuicao-julho-2026.mjs): a mensagem formal do grupo de lances ("Foi com Leo da Bula assessoria") e o registro primario do arremate — o parser tinha lido quem POSTOU o lance, nao quem VENDEU. Os dois lotes sao do Leonardo. O PIX cobre 5 titulos, todos com data_pagamento 25/08: '
  + rateio(lotLeo) + '. NAO houve pagamento em duplicidade (a conclusao de 27/08 foi retificada). Segue em aberto, sem erro, o que ele nao cobrou: Base Genetica Santa Cruz lt116 510,00 + 23o Genetica Aditiva 2a etapa 1.962,00 = 2.472,00. Vinculo aponta para o MAIOR titulo do lote (' + lotLeo[0].id.slice(0, 8) + ', ' + brl(lotLeo[0].valor) + '); conta_pagar_id e singular.'
console.log('    -> conta_pagar_id = ' + lotLeo[0].id.slice(0, 8) + '  |  status = conciliado')
if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
  categoria_id: CAT_COMISSOES, centro_custo_id: CC_COMISSAO, pessoa_id: P_LEONARDO,
  conta_pagar_id: lotLeo[0].id, status_conciliacao: 'conciliado', conciliado: true,
  observacoes: [FONTE_AGO, NOTA_LEO].join(' | '),
}).eq('id', mvLeo!.id)).error, 'concilia Leonardo')

/* ================= [2] FABIO -8.826,00 (25/08) ============================= */
console.log('\n[2] 25/08  -' + fmt(8826) + '  FO ASSESSORIA PECUARIA (Fabio Omena) — comissao de julho/2026')
const NOTA_FAB = TAG + ' Comissao de julho/2026 do Fabio Omena, QUITADA e agora vinculada. Mesma resolucao de 28/08 do lancamento do Leonardo: corrigida a atribuicao de 10 lotes de julho pela mensagem formal do grupo, o PIX passou a fechar ao centavo. Cobre 7 titulos com data_pagamento 25/08 (' + brl(somaFab) + '): '
  + rateio(lotFab) + '; mais ' + brl(adiantFab) + ' de ADIANTAMENTO sobre ' + String(cpSC?.descricao || '') + ' (titulo de ' + brl(cpSC?.valor) + ' criado em 28/08 — os lotes 45, 46 e 47 estavam "A definir" com comissao_pct 0 e nunca haviam virado titulo; segue PARCIAL, restam ' + brl(Number(cpSC?.valor || 0) - adiantFab) + '). ATENCAO: o titulo NANE / FABIO OMENA (Guadalupe Touros, 420,00) esta na regra de diferimento de dezembro e mesmo assim entrou neste PIX. Vinculo aponta para o MAIOR titulo do lote (' + lotFab[0].id.slice(0, 8) + ', ' + brl(lotFab[0].valor) + '); conta_pagar_id e singular.'
console.log('    -> conta_pagar_id = ' + lotFab[0].id.slice(0, 8) + '  |  status = conciliado')
if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
  categoria_id: CAT_COMISSOES, centro_custo_id: CC_COMISSAO, pessoa_id: P_FABIO,
  conta_pagar_id: lotFab[0].id, status_conciliacao: 'conciliado', conciliado: true,
  observacoes: [FONTE_AGO, NOTA_FAB].join(' | '),
}).eq('id', mvFabio!.id)).error, 'concilia Fabio')

/* ================= [3] VERCEL -110,00 (28/08) ============================== */
console.log('\n[3] 28/08  -' + fmt(110) + '  Plano de hospedagem Vercel (reembolso ao Joao Eduardo)')
const NOTA_VER = TAG + ' Plano de hospedagem da Vercel (infraestrutura do sistema web-bula), pago no cartao do Joao Eduardo e reembolsado por PIX ao CPF ***.037.156-**. Mesma natureza do PIX de 18/08 (180,00, "sistema fatura banco de dados", CP c2500d2e) e do de 24/08 (550,00, assinatura Anthropic). CP lancado a posteriori: a despesa saiu direto pelo banco, sem CP previo.'
let cpVercel: string | null = null
const { data: cpVja } = await sb.from('erp_contas_pagar').select('id')
  .eq('categoria_id', CAT_SOFTWARE).eq('vencimento', '2026-08-28').eq('valor', 110).maybeSingle()
if (cpVja) { cpVercel = cpVja.id; console.log('    CP = ja existe ' + cpVja.id.slice(0, 8)) }
else {
  console.log('    CP + criar e baixar  Software/Assinaturas - Hospedagem Vercel (sistema)')
  if (APPLY) {
    const { data, error } = await sb.from('erp_contas_pagar').insert({
      descricao: 'Hospedagem Vercel - plano do sistema (reembolso Joao Eduardo)',
      fornecedor_id: P_JOAO_ED, categoria_id: CAT_SOFTWARE, conta_bancaria_id: CONTA,
      valor: 110, valor_pago: 110,
      emissao: '2026-08-28', vencimento: '2026-08-28', data_pagamento: '2026-08-28',
      status: 'pago', forma_pagamento: 'pix',
      parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma', origem: 'real',
      observacoes: NOTA_VER, tags: ['a-pagar', '2026', 'agosto', 'software', 'espelho-extrato'],
    }).select('id').single()
    fail(error, 'cria CP Vercel'); cpVercel = data?.id ?? null
  }
}
if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
  categoria_id: CAT_SOFTWARE, pessoa_id: P_JOAO_ED, conta_pagar_id: cpVercel,
  status_conciliacao: 'conciliado', conciliado: true,
  observacoes: [FONTE_AGO, NOTA_VER].join(' | '),
}).eq('id', mvVercel!.id)).error, 'concilia Vercel')

/* ================= [4] TARIFA COBRANCA -2,08 (01/09) ======================= */
console.log('\n[4] 01/09  -' + fmt(2.08) + '  TARIFA COBRANCA (tarifa do boleto liquidado em [5])')
const NOTA_TAR = TAG + ' Tarifa de cobranca do Sicoob referente a liquidacao do boleto do Kito (CRED.LIQ.COBRANCA de 15.030,00 no mesmo dia). Mesmo par que ja apareceu em 03/08 e 11/08.'
let cpTarifa: string | null = null
const { data: cpTja } = await sb.from('erp_contas_pagar').select('id')
  .eq('categoria_id', CAT_TARIFAS).eq('vencimento', '2026-09-01').eq('valor', 2.08).maybeSingle()
if (cpTja) { cpTarifa = cpTja.id; console.log('    CP = ja existe ' + cpTja.id.slice(0, 8)) }
else {
  console.log('    CP + criar e baixar  Tarifas Bancarias - tarifa de cobranca')
  if (APPLY) {
    const { data, error } = await sb.from('erp_contas_pagar').insert({
      descricao: 'Tarifa de cobranca Sicoob - liquidacao boleto Kito (3/3)',
      fornecedor_id: P_SICOOB_T, categoria_id: CAT_TARIFAS, conta_bancaria_id: CONTA,
      valor: 2.08, valor_pago: 2.08,
      emissao: '2026-09-01', vencimento: '2026-09-01', data_pagamento: '2026-09-01',
      status: 'pago', forma_pagamento: 'debito automatico',
      parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma', origem: 'real',
      observacoes: NOTA_TAR, tags: ['a-pagar', '2026', 'setembro', 'tarifa', 'espelho-extrato'],
    }).select('id').single()
    fail(error, 'cria CP tarifa'); cpTarifa = data?.id ?? null
  }
}
if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
  categoria_id: CAT_TARIFAS, pessoa_id: P_SICOOB_T, conta_pagar_id: cpTarifa,
  status_conciliacao: 'conciliado', conciliado: true,
  observacoes: [FONTE_SET, NOTA_TAR].join(' | '),
}).eq('id', mvTarifa!.id)).error, 'concilia tarifa')

/* ================= [5] KITO +15.030,00 (01/09) ============================= */
console.log('\n[5] 01/09  +' + fmt(15030) + '  CRED.LIQ.COBRANCA = Kito 3/3 (CR ' + CR_KITO3.slice(0, 8) + ', venc. 30/08)')
const { data: crKito } = await sb.from('erp_contas_receber').select('id,valor,valor_recebido,status,observacoes,tags,cliente_id').eq('id', CR_KITO3).maybeSingle()
if (!crKito) { console.error('    ! CR do Kito nao encontrado'); erros++ }
else if (Math.abs(Number(crKito.valor) - 15030) > 0.005) { console.error('    ! CR do Kito vale ' + brl(crKito.valor) + ', esperado 15.030,00'); erros++ }
else {
  const NOTA_KITO = TAG + ' RECEBIDA em 01/09/2026 por liquidacao de boleto (CRED.LIQ.COBRANCA de 15.030,00, tarifa de 2,08 no mesmo dia), 2 dias apos o vencimento de 30/08. Era o UNICO saldo do acordo 4R ainda em aberto: com esta parcela fecham os 45.090,00 (3 x 15.030,00) que a Assessoria recebe em dinheiro do Kito.'
  // As 3 parcelas sao a mesma serie do mesmo fechamento; a 1/3 tem cliente e a
  // 3/3 nasceu sem. Herdar o cliente da serie evita "contraparte —" no relatorio.
  const { data: crKito1 } = await sb.from('erp_contas_receber').select('cliente_id')
    .eq('numero_documento', 'BULA-2026-CR-EXTRA-NELORE-MARCOS-DE').maybeSingle()
  const clienteKito = crKito.cliente_id ?? crKito1?.cliente_id ?? null
  console.log('    CR ' + brl(crKito.valor_recebido) + ' -> ' + brl(15030) + '  |  status ' + crKito.status + ' -> recebido' + (crKito.cliente_id ? '' : '  |  cliente herdado da parcela 1/3'))
  if (APPLY) fail((await sb.from('erp_contas_receber').update({
    valor_recebido: 15030, data_recebimento: '2026-09-01', status: 'recebido',
    forma_recebimento: 'Boleto (liquidacao cobranca)', conta_bancaria_id: CONTA,
    cliente_id: clienteKito,
    observacoes: anexa(crKito.observacoes, NOTA_KITO),
    tags: Array.from(new Set([...(crKito.tags || []), 'data_confirmada'])),
  }).eq('id', CR_KITO3)).error, 'baixa CR Kito')
  if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
    categoria_id: CAT_COMISSAO_LEIL, pessoa_id: clienteKito, conta_receber_id: CR_KITO3,
    status_conciliacao: 'conciliado', conciliado: true,
    observacoes: [FONTE_SET, NOTA_KITO].join(' | '),
  }).eq('id', mvKito!.id)).error, 'concilia Kito')
}

/* ================= [6] TRANSFERENCIA INTERNA +12.000,00 (01/09) ============ */
console.log('\n[6] 01/09  +' + fmt(12000) + '  PIX de MESMA TITULARIDADE — transferencia interna')
const NOTA_TRF = TAG + ' PIX recebido de OUTRA IF com MESMA TITULARIDADE (BULA ASSESSORIA PECUARIA LTDA, 34.791.630/0001-43): e transferencia entre contas da propria Bula, nao receita — entra com dre_grupo "ignorar", como o PIX de 15.000,00 de 04/08. Origem provavel: varredura/resgate da conta Sicredi (a aplicacao tinha 12.598,64). ATENCAO: a PERNA DO SICREDI NAO FOI LANCADA — o extrato Sicredi de setembro ainda nao foi baixado, e inventar o lancamento seria pior que deixar declarado. Ate ele entrar, o saldo consolidado do Sicredi esta superestimado em 12.000,00; o saldo do Sicoob esta certo e bate ao centavo com o extrato.'
if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
  categoria_id: CAT_TRANSF_ENT, status_conciliacao: 'conciliado', conciliado: true,
  observacoes: [FONTE_SET, NOTA_TRF].join(' | '),
}).eq('id', mvTransf!.id)).error, 'concilia transferencia interna')

/* ================= [7] faxina: BOLOS & CIA -39,00 (10/08) ================== */
console.log('\n[7] 10/08  -' + fmt(39) + '  CNPJ 21.986.213/0001-04 = BOLOS & CIA (estava "nao identificada")')
const { data: mvBolos } = await sb.from('erp_movimentos_bancarios')
  .select('id,observacoes,categoria_id,pessoa_id,conta_pagar_id').eq('conta_bancaria_id', CONTA)
  .eq('data', '2026-08-10').eq('tipo', 'saida').eq('valor', 39)
  .ilike('descricao', '%21.986.213%').maybeSingle()
if (!mvBolos) console.log('    (movimento nao encontrado — provavelmente ja tratado)')
else {
  const NOTA_BOL = TAG + ' Contraparte identificada na base de pessoas: CNPJ 21.986.213/0001-04 = BOLOS & CIA. Reclassificado de "Outras Despesas" para Alimentacao/Refeicoes.'
  console.log('    -> categoria Alimentacao/Refeicoes, pessoa BOLOS & CIA')
  if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
    categoria_id: CAT_ALIMENTACAO, pessoa_id: P_BOLOS,
    observacoes: anexa(mvBolos.observacoes, NOTA_BOL),
  }).eq('id', mvBolos.id)).error, 'reclassifica Bolos')
  if (mvBolos.conta_pagar_id) {
    const { data: cpB } = await sb.from('erp_contas_pagar').select('id,observacoes,categoria_id').eq('id', mvBolos.conta_pagar_id).maybeSingle()
    if (cpB && cpB.categoria_id === CAT_OUTRAS_DESP && APPLY) fail((await sb.from('erp_contas_pagar').update({
      categoria_id: CAT_ALIMENTACAO, fornecedor_id: P_BOLOS, observacoes: anexa(cpB.observacoes, NOTA_BOL),
    }).eq('id', cpB.id)).error, 'reclassifica CP Bolos')
  }
}

/* ================= [8] resto: DARF de 01/07 preso em 'classificado' ======== */
// Era o UNICO movimento do ERP inteiro fora de 'conciliado' depois de [1]-[7].
// Ja tinha titulo baixado (CP f3467ddf, DARF EMPREGADOS competencia junho/2026),
// pessoa preenchida e conciliado=true — so o status nunca foi promovido.
console.log('\n[8] 01/07  -' + fmt(2225.46) + '  DARF Empregados (competencia junho/2026) — promover para conciliado')
const { data: mvDarf } = await sb.from('erp_movimentos_bancarios')
  .select('id,observacoes,conta_pagar_id,status_conciliacao').eq('conta_bancaria_id', CONTA)
  .eq('data', '2026-07-01').eq('tipo', 'saida').eq('valor', 2225.46).maybeSingle()
if (!mvDarf) console.log('    (movimento nao encontrado)')
else if (mvDarf.status_conciliacao === 'conciliado') console.log('    (ja conciliado)')
else if (!mvDarf.conta_pagar_id) { console.error('    ! sem titulo vinculado — nao promover'); erros++ }
else {
  const NOTA_DARF = TAG + ' Promovido de "classificado" para "conciliado": o titulo ja estava baixado (CP ' + String(mvDarf.conta_pagar_id).slice(0, 8) + ', DARF EMPREGADOS - COMPETENCIA JUNHO/2026, 2.225,46) e a contraparte identificada (00.394.460/0058-87, Receita Federal). So o status nunca tinha sido promovido — era o unico movimento do ERP fora de "conciliado".'
  console.log('    -> status classificado -> conciliado (CP ' + String(mvDarf.conta_pagar_id).slice(0, 8) + ')')
  if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
    status_conciliacao: 'conciliado', conciliado: true,
    observacoes: anexa(mvDarf.observacoes, NOTA_DARF),
  }).eq('id', mvDarf.id)).error, 'promove DARF')
}

/* ---------- fecho: saldo + varredura de agosto ---------------------------- */
const { data: conta } = await sb.from('erp_contas_bancarias').select('saldo_atual,nome').eq('id', CONTA).maybeSingle()
console.log('\n--- saldo ---')
console.log('  extrato ....... ' + fmt(SALDO_EXTRATO))
console.log('  ERP ........... ' + fmt(conta?.saldo_atual))
console.log('  diferenca ..... ' + fmt(Number(conta?.saldo_atual || 0) - SALDO_EXTRATO))

const { data: pend } = await sb.from('erp_movimentos_bancarios')
  .select('data,tipo,valor,descricao,status_conciliacao').eq('conta_bancaria_id', CONTA)
  .gte('data', '2026-08-01').lte('data', '2026-09-30').neq('status_conciliacao', 'conciliado').order('data')
console.log('\n--- movimentos ago/set fora de "conciliado": ' + (pend?.length || 0))
for (const m of pend || []) console.log('  ' + m.data + ' ' + (m.tipo === 'saida' ? '-' : '+') + fmt(m.valor) + ' [' + m.status_conciliacao + '] ' + String(m.descricao).slice(0, 70))

console.log(erros ? '\n' + erros + ' ERRO(S).' : (APPLY ? '\nOK — gravado.' : '\nOK — dry-run limpo.'))
process.exit(erros ? 1 : 0)
