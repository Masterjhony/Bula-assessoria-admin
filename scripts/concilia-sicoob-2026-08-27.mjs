/**
 * Conciliacao Sicoob 26/08 -> 27/08/2026.
 *
 * Fonte: extrato PDF sicoob_2026_08_27_15_48_37.pdf (periodo 01/08 a 27/08,
 * saldo final 33.764,45 C), convertido por scripts/sicoob-pdf-para-csv.mjs e
 * importado por scripts/importa-extrato.mts (3 novos, 58 deduplicados).
 *
 * Segunda fonte desta sessao: "Relatorio de Nota Fiscal" da Prefeitura de Campo
 * Grande (emitido 27/08 15:16, 9 NFS-e ativas de agosto/2026, total 96.335,08).
 * E ele que amarra o lancamento [2].
 *
 * Os tres lancamentos de 27/08:
 *   -2.000,00  PIX 13.347.016/0001-17 (FACEBOOK SERVICOS ONLINE) "Ref trafego pago Meta"
 *   +9.141,23  PIX GENETICA ADITIVA AGROPECUARIA LTDA "nf 636"
 *   +4.580,00  PIX MACIEL PEREIRA DA SILVA (CPF ***.115.574-**)
 *
 * [1] META — mesma despesa de 10/08 (3.500,00 ao mesmo CNPJ). Vira CP real
 *     lancado a posteriori (a despesa saiu direto pelo banco, sem CP previo),
 *     categoria Marketing e Publicidade, centro de custo Prestacoes Servico
 *     Marketing. A estimativa de setembro (aa2525b3, 2.500,00 em 10/09) NAO e
 *     tocada: e outro mes.
 *
 * [2] GENETICA ADITIVA — o achado desta conciliacao. NF 636 (emitida 25/08
 *     15:52) vale R$ 18.282,45 e o PIX e EXATAMENTE metade: 9.141,23. Primeira
 *     de 2 parcelas.
 *
 *     18.282,45 nao batia com nenhum CR do ERP, que tinha o 23o Mega Leilao
 *     Genetica Aditiva lancado em dois titulos somando 27.762,65:
 *       1a etapa femeas 25/07 ... 6.318,90  (0,35% x faturamento 1.805.400)
 *       2a etapa touros 26/07 .. 21.443,75  (0,50% x faturamento 4.288.750)
 *     Ambos sao estimativas de 17/08 tiradas da planilha-mestra, que marcava so
 *     "COBRAR" sem percentual. O 0,35% nem existe na tabela de acordo.
 *
 *     Aplicando a tabela de performance (acordo padrao da Bula, confirmado em
 *     24/08) ao EVENTO INTEIRO, que e como a leiloeira faturou — uma NF so para
 *     as duas etapas:
 *       cobertura Bula .. 56.700 + 235.500 = 292.200
 *       faturamento ... 1.805.400 + 4.288.750 = 6.094.150
 *       performance ... 292.200 / 6.094.150 = 4,795%  -> faixa 3% a 4,9%
 *       comissao ...... 0,3% do faturamento = 18.282,45  == NF 636, ao centavo
 *
 *     O ERP errou porque aplicou a tabela ETAPA A ETAPA: isolada, a 2a etapa da
 *     performance 5,49% e sobe para a faixa de 0,5%. Consolidado, o evento fica
 *     em 4,795% e paga 0,3%. E a mesma armadilha de granularidade que ja mordeu
 *     na comissao do Leonardo (26/08) — so que do lado da receita: o degrau da
 *     tabela e do EVENTO, nao do pregao.
 *
 *     Correcao: os dois CR passam a 0,3% do proprio faturamento (5.416,20 e
 *     12.866,25, soma 18.282,45), recebem 50% cada (2.708,10 + 6.433,13 =
 *     9.141,23) e ficam parciais aguardando a 2a parcela de 9.141,22. Os
 *     fechamentos recebem faturamento_total_leilao e acordo_pct_faturamento,
 *     que estavam em branco — sem eles a validacao receita_bula x acordo nao
 *     tem como conferir nada.
 *     A receita a receber cai 9.480,20: era cobranca que nao existia.
 *
 * [3] MACIEL PEREIRA DA SILVA — e o vendedor unico do 2o Leilao Pintado Raiz
 *     (05/05/2026, Agreste Leiloes). O proprio fechamento b6370f22 registra:
 *     "39 lotes / R$ 458.800 (Maciel Pereira da Silva como vendedor unico
 *     listado)" e "Acordo: 1% sobre faturamento total R$ 458.800 = R$ 4.588".
 *     Esse e o CR-055 (89ede42d), vencido desde 10/07, o "cliente enrolando"
 *     que em 05/08 disse a Ana que "tentou pagar e o PIX estava errado".
 *     Pagou 4.580,00 — 8,00 a menos. Baixado como recebido com desconto de
 *     8,00 registrado (o titulo continua valendo 4.588 para nao descolar da
 *     receita apurada do fechamento). Se o chefe quiser cobrar os 8,00, e so
 *     zerar o desconto e voltar para parcial.
 *
 * [5] Faxina que veio junto: quatro movimentos anteriores estavam classificados
 *     e documentados, mas sem vinculo de titulo — cada um quita VARIOS titulos
 *     e conta_receber_id/conta_pagar_id sao singulares, entao as sessoes
 *     anteriores deixaram em branco. Isso fazia o audita-coerencia acusar
 *     "entrada/saida operacional sem titulo". Passam a apontar para o MAIOR
 *     titulo do lote, como este script fez com a Genetica Aditiva; o rateio
 *     completo ja esta (e continua) na observacao de cada movimento:
 *       20/08  +19.810,50  Bula Remates (Kirz + Neloraco)
 *       25/08  +10.712,95  Guadalupe 1a parcela (Femeas + Touros)
 *       21/08   -6.178,45  ADN Viagens (passagens Fabio + Leonardo)
 *       24/08  -11.908,00  Douglas Bispo (10 comissoes + complemento)
 *     Ficam de fora de proposito os PIX de 25/08 ao Leonardo (5.262,00) e ao
 *     Fabio (8.826,00): a divergencia de atribuicao dos lotes 26/30 da EAO
 *     Baviera continua aberta e o vinculo tem de continuar visivelmente ausente.
 *
 * Reexecutavel: cada bloco confere o estado antes de gravar e nao repete nota.
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7' // Sicoob CC 1.056-1
const DIA = '2026-08-27'
const OBS = 'Extrato Sicoob 01-27/08/2026 (PDF sicoob_2026_08_27_15_48_37)'
const TAG = '[CONCILIADO 27/08]'
const SALDO_EXTRATO = 33764.45

const CAT_COMISSAO_LEILAO = 'e74434bd-3366-4015-9268-15d6640cf15f' // receita
const CAT_MARKETING       = '26762d4e-b517-48b9-98f3-155a6421264e' // despesa
const CC_MARKETING        = '70886cf3-c996-46de-a049-26581b3d08ad' // Prestacoes Servico Marketing
const P_FACEBOOK          = '51ebfcd7-2cb0-4ad0-9052-e73e8f68cc82' // FACEBOOK SERVICOS ONLINE DO BRASIL LTDA
const P_ADITIVA           = '721c14a5-c343-4f38-bf3f-84a9405635c0' // GENETICA ADITIVA (10.966.405/0001-32)

const CR_FEMEAS  = 'ab6574a9-3c5b-4561-93b8-f0d39a6abc31'
const CR_TOUROS  = '07df3346-2129-4dc0-8fbd-09b78e8aa9b9'
const FE_FEMEAS  = 'ce9612c4-c688-4652-8e31-acd29bf976d0'
const FE_TOUROS  = '50bf395a-fee9-4051-9d00-3a72e3c30cd0'
const CR_PINTADO = '89ede42d-1389-423e-8bb3-6ec0d99143b3'

// Tabela de performance aplicada ao EVENTO (as duas etapas juntas), nao por pregao.
const ADITIVA = {
  pct: 0.003,
  femeas: { faturamento: 1805400, cobertura: 56700 },
  touros: { faturamento: 4288750, cobertura: 235500 },
}
ADITIVA.femeas.devido = Math.round(ADITIVA.femeas.faturamento * ADITIVA.pct * 100) / 100 //  5.416,20
ADITIVA.touros.devido = Math.round(ADITIVA.touros.faturamento * ADITIVA.pct * 100) / 100 // 12.866,25
ADITIVA.femeas.parcela1 = 2708.10
ADITIVA.touros.parcela1 = 6433.13 // 12.866,25 / 2 arredondado para cima; fecha os 9.141,23
const NF636 = ADITIVA.femeas.devido + ADITIVA.touros.devido

const fmt = n => Number(n).toFixed(2).padStart(11)
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }
/** Anexa a nota so uma vez: reexecutar o script nao pode empilhar o mesmo texto. */
const anexa = (antes, nota) => String(antes || '').includes(TAG) ? String(antes || '') : (String(antes || '') + '\n' + nota).trim()

/* ---------- travas de sanidade antes de tocar em qualquer coisa ------------- */
if (Math.abs(NF636 - 18282.45) > 0.005) { console.error('NF 636 nao fecha: ' + NF636); process.exit(1) }
if (Math.abs(ADITIVA.femeas.parcela1 + ADITIVA.touros.parcela1 - 9141.23) > 0.005) { console.error('parcelas nao somam o PIX'); process.exit(1) }

const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,tipo,valor,descricao,status_conciliacao')
  .eq('conta_bancaria_id', CONTA).eq('data', DIA)
// Aceita o movimento ja conciliado de propósito: o script tem de poder rodar de
// novo depois de aplicado sem estourar na primeira trava.
const acha = (tipo, valor) => (movs || []).find(m => m.tipo === tipo && Math.abs(Number(m.valor) - valor) < 0.005)
const movMeta    = acha('saida', 2000)
const movAditiva = acha('entrada', 9141.23)
const movMaciel  = acha('entrada', 4580)
if (!movMeta || !movAditiva || !movMaciel) {
  console.error('FALTAM movimentos pendentes de 27/08 (2.000,00 / 9.141,23 / 4.580,00).')
  console.error('Rode antes: node scripts/sicoob-pdf-para-csv.mjs <pdf> <csv> && npx tsx scripts/importa-extrato.mts <csv> --apply')
  process.exit(1)
}

/* ================= [1] META / FACEBOOK -2.000,00 =========================== */
console.log('\n[1] -2.000,00 FACEBOOK SERVICOS ONLINE (13.347.016/0001-17) — trafego pago Meta')
const NOTA_META = TAG + ' Trafego pago Meta, pago por PIX em 27/08 ao CNPJ 13.347.016/0001-17. Mesma natureza do PIX de 10/08 (3.500,00, CP 58488d48). CP lancado a posteriori: a despesa saiu direto pelo banco, sem CP previo. Nao substitui a estimativa de setembro (CP aa2525b3, 2.500,00 em 10/09) — e outro mes.'
let cpMetaId = null
const { data: cpJa } = await sb.from('erp_contas_pagar').select('id,valor,status')
  .eq('categoria_id', CAT_MARKETING).eq('vencimento', DIA).eq('valor', 2000).maybeSingle()
if (cpJa) { cpMetaId = cpJa.id; console.log('  CP  = ja existe ' + cpJa.id) }
else {
  console.log('  CP  + criar e ja baixar ' + fmt(2000) + '  Marketing - campanha de trafego pago (Meta)')
  if (APPLY) {
    const { data, error } = await sb.from('erp_contas_pagar').insert({
      descricao: 'Marketing - campanha de trafego pago (Meta)',
      fornecedor_id: P_FACEBOOK, categoria_id: CAT_MARKETING, centro_custo_id: CC_MARKETING,
      conta_bancaria_id: CONTA, valor: 2000, valor_pago: 2000,
      emissao: DIA, vencimento: DIA, data_pagamento: DIA,
      status: 'pago', forma_pagamento: 'pix',
      parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma', origem: 'real',
      observacoes: NOTA_META,
      tags: ['marketing', '2026', 'agosto'],
    }).select('id').single()
    fail(error, 'cria CP Meta'); cpMetaId = data?.id ?? null
  }
}
console.log('  MOV ' + movMeta.data + ' -' + fmt(movMeta.valor) + ' -> conciliado')
if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
  categoria_id: CAT_MARKETING, centro_custo_id: CC_MARKETING, pessoa_id: P_FACEBOOK,
  conta_pagar_id: cpMetaId, status_conciliacao: 'conciliado', conciliado: true,
  observacoes: [OBS, NOTA_META].join(' | '),
}).eq('id', movMeta.id)).error, 'classifica Meta')

/* ================= [2] GENETICA ADITIVA +9.141,23 ========================== */
console.log('\n[2] +9.141,23 GENETICA ADITIVA — NF 636 (18.282,45), 1a de 2 parcelas')
console.log('    performance do evento ' + (292200 / 6094150 * 100).toFixed(3) + '% -> faixa 3%-4,9% -> 0,3% do faturamento 6.094.150,00 = ' + brl(NF636))

// Trava: nenhum outro CR pode estar pendurado nesses dois fechamentos, senao a
// receita apurada deixa de bater com a soma dos titulos.
const { data: crDoFech } = await sb.from('erp_contas_receber').select('id,valor,status,descricao,fechamento_id').in('fechamento_id', [FE_FEMEAS, FE_TOUROS])
const outros = (crDoFech || []).filter(c => c.id !== CR_FEMEAS && c.id !== CR_TOUROS && c.status !== 'cancelado')
if (outros.length) { console.error('  ! ha outros CR nesses fechamentos: ' + outros.map(c => c.id.slice(0, 8) + ' ' + brl(c.valor)).join(', ')); erros++ }

const NOTA_ADITIVA = TAG + ' Valor corrigido pela NF 636 (emitida 25/08/2026, R$ 18.282,45 para as duas etapas do 23o Mega Leilao Genetica Aditiva). O acordo e a tabela de performance padrao aplicada ao EVENTO: cobertura 292.200 / faturamento 6.094.150 = 4,795% -> faixa 3% a 4,9% -> 0,3% do faturamento. O valor anterior vinha da estimativa de 17/08 (planilha-mestra so dizia "COBRAR"), que aplicou a tabela etapa a etapa e jogou a 2a etapa na faixa de 0,5%. Recebida a 1a de 2 parcelas por PIX em 27/08 (total 9.141,23 = metade da NF).'

const ETAPAS = [
  { nome: '1a etapa FEMEAS 25/07', cr: CR_FEMEAS, fe: FE_FEMEAS, antes: 6318.90, ...ADITIVA.femeas },
  { nome: '2a etapa TOUROS 26/07', cr: CR_TOUROS, fe: FE_TOUROS, antes: 21443.75, ...ADITIVA.touros },
]
for (const e of ETAPAS) {
  const { data: cr } = await sb.from('erp_contas_receber').select('id,valor,valor_recebido,status,observacoes,tags').eq('id', e.cr).maybeSingle()
  if (!cr) { console.log('  ! CR ' + e.cr.slice(0, 8) + ' nao existe'); erros++; continue }
  if (Math.abs(Number(cr.valor) - e.antes) > 0.005 && Math.abs(Number(cr.valor) - e.devido) > 0.005) {
    console.log('  ! CR ' + e.cr.slice(0, 8) + ' vale ' + brl(cr.valor) + ', esperado ' + brl(e.antes) + ' (ou ' + brl(e.devido) + ' se ja corrigido)'); erros++; continue
  }
  console.log('\n  ' + e.nome)
  console.log('    CR  ' + e.cr.slice(0, 8) + '  valor ' + brl(cr.valor) + ' -> ' + brl(e.devido) + '   (0,3% x ' + brl(e.faturamento) + ')')
  console.log('    CR  recebido ' + fmt(e.parcela1) + '  (1a de 2)  -> parcial, falta ' + brl(e.devido - e.parcela1))
  if (APPLY) fail((await sb.from('erp_contas_receber').update({
    valor: e.devido, valor_recebido: e.parcela1,
    cliente_id: P_ADITIVA, nota_fiscal: '636',
    data_recebimento: DIA, status: 'parcial', forma_recebimento: 'pix',
    conta_bancaria_id: CONTA, parcela: 1, total_parcelas: 2,
    observacoes: anexa(cr.observacoes, NOTA_ADITIVA + ' Rateio desta etapa: 0,3% x ' + brl(e.faturamento) + ' = ' + brl(e.devido) + '; 1a parcela ' + brl(e.parcela1) + '.'),
    tags: [...new Set([...(cr.tags || []), 'nf-636', 'parcelado-2x'])],
  }).eq('id', e.cr)).error, 'corrige CR ' + e.nome)

  // O fechamento tinha faturamento e acordo em branco: sem isso a validacao
  // receita_bula x acordo nao consegue conferir nada e a receita fica orfa.
  const { data: fe } = await sb.from('bula_leilao_fechamento').select('id,nome,receita_bula,faturamento_total_leilao,vgv_total,observacoes').eq('id', e.fe).maybeSingle()
  if (!fe) { console.log('    ! fechamento ' + e.fe.slice(0, 8) + ' nao existe'); erros++; continue }
  if (Math.abs(Number(fe.vgv_total) - e.cobertura) > 0.005) { console.log('    ! VGV do fechamento e ' + brl(fe.vgv_total) + ', esperado ' + brl(e.cobertura)); erros++; continue }
  console.log('    FECH ' + e.fe.slice(0, 8) + '  receita_bula ' + brl(fe.receita_bula) + ' -> ' + brl(e.devido) + '  | faturamento_total ' + brl(fe.faturamento_total_leilao) + ' -> ' + brl(e.faturamento) + '  | acordo_pct_faturamento -> 0,3%')
  if (APPLY) fail((await sb.from('bula_leilao_fechamento').update({
    receita_bula: e.devido,
    faturamento_total_leilao: e.faturamento,
    acordo_pct_faturamento: ADITIVA.pct,
    acordo_descricao: 'Tabela de performance padrao aplicada ao EVENTO (2 etapas juntas): cobertura 292.200 / faturamento 6.094.150 = 4,795% -> faixa 3% a 4,9% -> 0,3% do faturamento total. Confirmado pela NF 636 de 25/08/2026 (R$ 18.282,45 para as duas etapas).',
    observacoes: anexa(fe.observacoes, '[27/08/2026 CONCILIACAO] ' + NOTA_ADITIVA),
  }).eq('id', e.fe)).error, 'corrige fechamento ' + e.nome)
}

const notaMovAditiva = 'NF 636 (25/08/2026, R$ 18.282,45) — 23o Mega Leilao Genetica Aditiva, 1a etapa femeas 25/07 + 2a etapa touros 26/07, faturadas numa nota so. Este PIX e a 1a de 2 parcelas (metade exata). Rateio pelos dois titulos do evento: CR ' + CR_FEMEAS.slice(0, 8) + ' (femeas) ' + brl(ADITIVA.femeas.parcela1) + ' + CR ' + CR_TOUROS.slice(0, 8) + ' (touros) ' + brl(ADITIVA.touros.parcela1) + ' = 9.141,23. O campo conta_receber_id aponta para o titulo dos touros por ser a maior parcela; o rateio completo esta aqui e na observacao dos dois titulos. Falta a 2a parcela de 9.141,22. Acordo: tabela de performance aplicada ao evento (4,795% -> 0,3% do faturamento de 6.094.150). Os dois CR foram corrigidos de 27.762,65 para 18.282,45 nesta conciliacao.'
console.log('\n  MOV ' + movAditiva.data + ' +' + fmt(movAditiva.valor) + ' -> conciliado (rateado nos 2 titulos)')
if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
  categoria_id: CAT_COMISSAO_LEILAO, pessoa_id: P_ADITIVA,
  conta_receber_id: CR_TOUROS, status_conciliacao: 'conciliado', conciliado: true,
  observacoes: [OBS, TAG + ' ' + notaMovAditiva].join(' | '),
}).eq('id', movAditiva.id)).error, 'classifica Aditiva')

/* ================= [3] MACIEL PEREIRA DA SILVA +4.580,00 =================== */
console.log('\n[3] +4.580,00 MACIEL PEREIRA DA SILVA — CR-055, 2o Leilao Pintado Raiz (05/05)')
let pMacielId = null
const { data: pJa } = await sb.from('erp_pessoas').select('id,nome').ilike('nome', 'MACIEL PEREIRA DA SILVA').maybeSingle()
if (pJa) { pMacielId = pJa.id; console.log('  PESSOA = ja existe ' + pJa.id) }
else {
  console.log('  PESSOA + criar  MACIEL PEREIRA DA SILVA (pf, CPF ***.115.574-**)')
  if (APPLY) {
    const { data, error } = await sb.from('erp_pessoas').insert({
      tipo: 'pf', nome: 'MACIEL PEREIRA DA SILVA', documento: '***.115.574-**',
      is_cliente: true, is_fornecedor: false, ativo: true,
      observacoes: 'Vendedor unico do 2o Leilao Pintado Raiz (05/05/2026, Agreste Leiloes) — ver fechamento b6370f22. Pagou a comissao Bula (CR-055) por PIX em 27/08/2026. CPF vem mascarado no extrato do Sicoob; completar quando houver documento.',
    }).select('id').single()
    fail(error, 'cria pessoa Maciel'); pMacielId = data?.id ?? null
  }
}

const NOTA_MACIEL = TAG + ' RECEBIDO em 27/08/2026 por PIX de MACIEL PEREIRA DA SILVA (CPF ***.115.574-**), que o fechamento b6370f22 registra como vendedor unico do 2o Leilao Pintado Raiz (39 lotes / R$ 458.800). Fecha a cobranca que estava vencida desde 10/07 e que em 05/08 o cliente dizia estar tentando pagar "com o PIX errado". Pagou 4.580,00 contra 4.588,00 devidos (1% do faturamento): os 8,00 de diferenca ficam registrados como desconto para o titulo fechar sem descolar da receita apurada do fechamento. Se for para cobrar os 8,00, zerar o desconto e voltar o status para parcial.'
const { data: crP } = await sb.from('erp_contas_receber').select('id,valor,valor_recebido,status,observacoes,tags').eq('id', CR_PINTADO).maybeSingle()
if (!crP) { console.error('  ! CR-055 ' + CR_PINTADO.slice(0, 8) + ' nao existe'); erros++ }
else if (Math.abs(Number(crP.valor) - 4588) > 0.005) { console.error('  ! CR-055 vale ' + brl(crP.valor) + ', esperado 4.588,00'); erros++ }
else {
  console.log('  CR  ' + CR_PINTADO.slice(0, 8) + '  ' + brl(crP.valor) + ' (' + crP.status + ') -> recebido ' + brl(4580) + ' + desconto ' + brl(8))
  if (APPLY) fail((await sb.from('erp_contas_receber').update({
    valor_recebido: 4580, desconto: 8,
    data_recebimento: DIA, status: 'recebido', forma_recebimento: 'pix', conta_bancaria_id: CONTA,
    observacoes: anexa(crP.observacoes, NOTA_MACIEL),
    tags: [...new Set([...(crP.tags || []).filter(t => t !== 'cobranca-devedor-enrola'), 'recebido-27-08-2026', 'desconto-residual'])],
  }).eq('id', CR_PINTADO)).error, 'baixa CR-055')
}
console.log('  MOV ' + movMaciel.data + ' +' + fmt(movMaciel.valor) + ' -> conciliado')
if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
  categoria_id: CAT_COMISSAO_LEILAO, pessoa_id: pMacielId,
  conta_receber_id: CR_PINTADO, status_conciliacao: 'conciliado', conciliado: true,
  observacoes: [OBS, NOTA_MACIEL].join(' | '),
}).eq('id', movMaciel.id)).error, 'classifica Maciel')

/* ================= [5] vinculos que faltavam em recebimentos multi-titulo === */
console.log('\n[5] Movimentos multi-titulo sem vinculo (audita-coerencia acusava "sem titulo")')
const MULTI = [
  {
    mov: 'd2d069ee-696e-4d0a-b826-aaa3f5e7e471', cr: 'f7487417-3d6c-4bcb-867b-9a0cc33b2826', data: '2026-08-20', valor: 19810.50,
    porque: 'ACERTO BULA REMATES de 20/08: quita Kirz 10.164,00 integral (CR f7487417) + Neloraco PO 9.646,50 parcial (CR 84700163). Aponta para o Kirz por ser o maior; o rateio ja esta na observacao do movimento. NF 629 (20/08, R$ 19.810,50) confirma o valor.',
  },
  {
    mov: 'b05f1763-ae63-4065-b340-a188a6c91795', cr: '6d4939ab-cbd4-492e-a4f3-615373ff5034', data: '2026-08-25', valor: 10712.95,
    porque: '1a parcela do 20o Guadalupe (NF 628, R$ 21.425,90 em 2x): quita FEMEAS 18/07 3.000,00 (CR e09f0fde) + TOUROS 19/07 7.712,95 (CR 6d4939ab). Aponta para o maior; rateio na observacao do movimento. 2a parcela vence 25/09.',
  },
  {
    mov: '9eafca9b-f30a-4ac5-9c0d-6f2c9a15c407', cp: '3605b2ed-5ce7-49c8-958a-409dbf24a6e9', data: '2026-08-21', valor: 6178.45, tipo: 'saida',
    pessoa: '1a8727ee-5ea5-4b91-aa9f-6099fa545c3e', // ADILSON DA SILVA (ADN Viagens)
    porque: 'Passagens da Expogenetica pagas a ADN Viagens (22.002.438/0001-41): quita BILHETE/BOLETO FABIO OMENA 4.196,87 (CP 3605b2ed) + LEONARDO FRANCISCO 1.981,58 (CP ef6374fa). Aponta para o maior; rateio na observacao do movimento.',
  },
  {
    mov: 'e8c961d7-0d6f-4fa4-844f-f9353984857c', cp: '580b96ea-a29a-41f1-868e-5b899633eab7', data: '2026-08-24', valor: 11908.00, tipo: 'saida',
    porque: 'Comissao de julho do Douglas Bispo (GRUPO AGROBISPO): quita 10 titulos de 25/08 (10.116,00) + complemento de 1.792,00 (CP 07023e5f). Aponta para o maior do lote (Nelore Sorriso Femeas, 3.180,00); rateio na observacao do movimento. Saldo de 320,00 (lote 19 do Nelore Sorriso) segue em aberto, sem titulo.',
  },
]
for (const x of MULTI) {
  const curto = x.mov.slice(0, 8)
  const ehSaida = x.tipo === 'saida'
  const tabela = ehSaida ? 'erp_contas_pagar' : 'erp_contas_receber'
  const campo = ehSaida ? 'conta_pagar_id' : 'conta_receber_id'
  const rotulo = ehSaida ? 'CP' : 'CR'
  const alvo = ehSaida ? x.cp : x.cr
  const { data: mv } = await sb.from('erp_movimentos_bancarios').select('id,data,valor,conta_receber_id,conta_pagar_id,observacoes').eq('id', x.mov).maybeSingle()
  if (!mv) { console.log('  ! movimento ' + curto + ' nao encontrado'); erros++; continue }
  if (mv.data !== x.data || Math.abs(Number(mv.valor) - x.valor) > 0.005) { console.log('  ! movimento ' + curto + ' nao confere (' + mv.data + ' ' + brl(mv.valor) + ')'); erros++; continue }
  if (mv[campo]) { console.log('  = ' + curto + ' ' + mv.data + ' ' + fmt(mv.valor) + ' ja vinculado a ' + String(mv[campo]).slice(0, 8)); continue }
  const { data: tit } = await sb.from(tabela).select('id,descricao,valor,status').eq('id', alvo).maybeSingle()
  if (!tit) { console.log('  ! ' + rotulo + ' ' + alvo.slice(0, 8) + ' nao existe'); erros++; continue }
  console.log('  + ' + curto + ' ' + mv.data + ' ' + fmt(mv.valor) + ' -> ' + rotulo + ' ' + alvo.slice(0, 8) + ' (' + brl(tit.valor) + ', ' + tit.status + ')  ' + (tit.descricao || '').slice(0, 45))
  const patch = {
    [campo]: tit.id, status_conciliacao: 'conciliado', conciliado: true,
    observacoes: String(mv.observacoes || '').includes('[VINCULO 27/08]') ? mv.observacoes : (String(mv.observacoes || '') + ' [VINCULO 27/08] ' + x.porque).trim(),
  }
  if (x.pessoa) patch.pessoa_id = x.pessoa
  if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update(patch).eq('id', mv.id)).error, 'vincula ' + curto)
}

/* ================= [4] validacao por saldo ================================= */
console.log('\n[4] Validacao por saldo')
const { data: conta } = await sb.from('erp_contas_bancarias').select('saldo_atual,saldo_inicial').eq('id', CONTA).single()
let all = [], from = 0
for (;;) {
  const { data } = await sb.from('erp_movimentos_bancarios').select('tipo,valor').eq('conta_bancaria_id', CONTA).range(from, from + 999)
  all = all.concat(data || [])
  if (!data || data.length < 1000) break
  from += 1000
}
const net = all.reduce((s, m) => s + (m.tipo === 'entrada' ? 1 : m.tipo === 'saida' ? -1 : 0) * Number(m.valor), 0)
const calc = Math.round((Number(conta.saldo_inicial) + net) * 100) / 100
console.log('  gravado ' + fmt(conta.saldo_atual) + ' | recalculado ' + fmt(calc) + ' | extrato ' + fmt(SALDO_EXTRATO))
console.log(Math.abs(calc - SALDO_EXTRATO) < 0.005 ? '  OK saldo bate com o extrato.' : '  ATENCAO diferenca de R$ ' + Math.abs(calc - SALDO_EXTRATO).toFixed(2))

console.log('\n' + (APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.'))
