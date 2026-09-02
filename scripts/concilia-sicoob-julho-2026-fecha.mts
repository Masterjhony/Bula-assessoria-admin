/**
 * JULHO/2026 — fecha o mes: apaga o ULTIMO lancamento-tampao do ERP.
 *
 * O Joao puxou em 02/09/2026 14:23 o extrato do mes inteiro
 * (`sicoob_2026_09_02_14_23_31.pdf`, 01 a 31/07, 74 lancamentos, saldo final
 * 25.208,83, validacao por saldo OK em todos os 20 dias). Ele resolve o que
 * faltava depois de `concilia-sicoob-julho-2026-detalha.mts`:
 *
 *   31/07  -6.672,06  MOVIMENTOS AGREGADOS 30-31/07  (mov db2803f6 / CP 2d2b9c1c)
 *
 * O tampao dizia "30-31/07" mas NAO HOUVE MOVIMENTO EM 30/07 — tudo caiu no
 * dia 31. Sao seis linhas, e o liquido das cinco saidas bate o tampao ao
 * centavo (1.348,31 + 1.928,82 + 2.867,85 + 525,00 + 2,08 = 6.672,06):
 *
 * [1] O KITO (2/3) ESTAVA NO DIA ERRADO. Os 15.030,00 estavam lancados em
 *     30/07 com a observacao "PROVAVEL: fechamento de julho concluiu Kito 1/2
 *     recebido em 30-31/07. Confirmar no extrato 30-31/07." O extrato confirma:
 *     e CRED.LIQ.COBRANCA de 31/07, com a tarifa de 2,08 do mesmo boleto no
 *     mesmo dia. A data e corrigida ANTES do import — senao a dedup por
 *     conteudo nao reconhece a linha e o credito entraria duas vezes.
 * [2] 31/07 -1.348,31 · -1.928,82 · -2.867,85  ADN Viagens (22.002.438/0001-41)
 *     Passagens do Leilao LS (7 e 8/08): volta Bula Goiania-CG; volta Peralta e
 *     Nane Goiania-CG; ida Cuiaba-Goiania de Peralta, Bula e Nane. Somam
 *     6.144,98 e sao a mesma viagem do PIX de 1.233,66 de 10/07.
 * [3] 31/07   -525,00  Formula do Boi (65.565.807/0001-17), SEM MEMO NENHUM no
 *     extrato. O Joao confirmou em 02/09: "foi referente a sistemas, pagamento
 *     Codex (Chat GPT)". Assinatura da OpenAI paga pela Formula do Boi e
 *     reembolsada — Software/Assinaturas, como a Anthropic (550,00 em 24/08),
 *     o banco de dados (180,00 em 18/08) e a Vercel (110,00 em 28/08).
 * [4] 31/07     -2,08  TARIFA COBRANCA — tarifa do boleto do Kito de [1].
 * [5] Apaga o tampao e o CP stub.
 *
 * Depois disso o ERP nao tem mais nenhum lancamento agregado: todo movimento
 * de 2026 e uma linha real de extrato.
 *
 * Fluxo (o script pede o import no meio, e reexecutavel em qualquer ordem):
 *   npx tsx scripts/concilia-sicoob-julho-2026-fecha.mts --apply
 *   node scripts/sicoob-pdf-para-csv.mjs "F:/sicoob_2026_09_02_14_23_31.pdf" jul.csv
 *   npx tsx scripts/importa-extrato.mts jul.csv --apply
 *   npx tsx scripts/concilia-sicoob-julho-2026-fecha.mts --apply
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const TAG = '[JULHO-FECHA 02/09]'
const FONTE = 'Extrato Sicoob 01-31/07/2026 (PDF sicoob_2026_09_02_14_23_31, 74 lancamentos, validacao por saldo OK)'
const SALDO_31_07 = 25208.83
const SALDO_HOJE = 60682.37

const CAT_VIAGEM   = '98083139-0fbf-487a-9988-a08519ebf259' // custo_direto
const CAT_SOFTWARE = '0edf60f2-bf96-44bd-8f93-ca5432b69830' // despesa_fixa
const CAT_TARIFAS  = 'f8ae3a53-bb4e-414e-97d1-ebdca81df658'
const CC_PASSAGENS = '9b685440-05c9-479a-b310-3311a11e36cd'
const P_SICOOB_T   = 'e5488a95-aef2-4288-aba6-428c5c5fbdb2'
const MOV_PLUG     = 'db2803f6-6e3b-4b26-8cfb-c2cabefcf408'
const CP_PLUG      = '2d2b9c1c-d0a9-4bbd-b0bb-6ee8c82b4bf9'

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const fmt = (n: any) => brl(n).padStart(12)
let erros = 0
const fail = (e: any, ctx: string) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }
const anexa = (antes: any, nota: string) => String(antes || '').includes(TAG) ? String(antes || '') : (String(antes || '') + '\n' + nota).trim()

console.log(APPLY ? '>>> APLICANDO <<<' : '>>> DRY-RUN (use --apply para gravar) <<<')

/* ---------- contrapartes por documento ------------------------------------ */
const { data: pessoas } = await sb.from('erp_pessoas').select('id,nome,documento')
const porDoc = (d: string) => (pessoas || []).find(p => String(p.documento || '').replace(/\D/g, '').startsWith(d))
const P_ADN = porDoc('22002438')
const P_FDB = porDoc('65565807')
if (!P_ADN || !P_FDB) { console.error('contraparte nao cadastrada: ADN=' + !!P_ADN + ' FDB=' + !!P_FDB); process.exit(1) }

/* ================= [1] Kito (2/3): 30/07 -> 31/07 ========================= */
console.log('\n[1] Kito (2/3) — 15.030,00 estava em 30/07; o extrato diz 31/07')
const { data: mvKito } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,valor,descricao,observacoes,conta_receber_id').eq('conta_bancaria_id', CONTA)
  .eq('tipo', 'entrada').eq('valor', 15030).gte('data', '2026-07-25').lte('data', '2026-07-31').maybeSingle()
if (!mvKito) { console.error('  ! movimento do Kito (2/3) nao encontrado em julho'); erros++ }
else if (mvKito.data === '2026-07-31') console.log('  (data ja corrigida)')
else {
  const NOTA_K = TAG + ' DATA CONFIRMADA pelo extrato do mes inteiro: o credito e CRED.LIQ.COBRANCA de 31/07/2026, com a tarifa de cobranca de 2,08 do mesmo boleto no mesmo dia. Estava em 30/07 como PROVAVEL, deduzido do fechamento de julho porque o extrato de 30-31/07 nunca tinha sido puxado. Nao houve movimento nenhum em 30/07.'
  console.log('  mov ' + String(mvKito.id).slice(0, 8) + '  ' + mvKito.data + ' -> 2026-07-31')
  if (APPLY) {
    fail((await sb.from('erp_movimentos_bancarios').update({ data: '2026-07-31', observacoes: anexa(mvKito.observacoes, NOTA_K) }).eq('id', mvKito.id)).error, 'corrige data do movimento Kito')
    if (mvKito.conta_receber_id) {
      const { data: crK } = await sb.from('erp_contas_receber').select('id,observacoes,data_recebimento').eq('id', mvKito.conta_receber_id).maybeSingle()
      if (crK) fail((await sb.from('erp_contas_receber').update({
        data_recebimento: '2026-07-31', observacoes: anexa(crK.observacoes, NOTA_K),
      }).eq('id', crK.id)).error, 'corrige data do CR Kito')
    }
  }
}

/* ---------- as cinco saidas reais de 31/07 -------------------------------- */
const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,tipo,valor,descricao,status_conciliacao,conta_pagar_id')
  .eq('conta_bancaria_id', CONTA).eq('data', '2026-07-31').eq('tipo', 'saida')
const pega = (valor: number) => (movs || []).find(m => Math.abs(Number(m.valor) - valor) < 0.005 && !/AGREGADOS/.test(String(m.descricao)))
const ALVOS = [1348.31, 1928.82, 2867.85, 525, 2.08]
const achados = ALVOS.map(pega)
if (achados.some(m => !m)) {
  console.log('\n--- FALTAM as saidas reais de 31/07 no ERP ---')
  ALVOS.forEach((v, i) => console.log('   ' + (achados[i] ? 'ok  ' : 'FALTA') + fmt(v)))
  console.log('\nRode agora (a data do Kito ja foi corrigida, entao a dedup vai reconhece-lo):')
  console.log('  node scripts/sicoob-pdf-para-csv.mjs "F:/sicoob_2026_09_02_14_23_31.pdf" jul.csv')
  console.log('  npx tsx scripts/importa-extrato.mts jul.csv --apply')
  console.log('  npx tsx scripts/concilia-sicoob-julho-2026-fecha.mts --apply')
  process.exit(erros ? 1 : 0)
}
const liquido = ALVOS.reduce((a, v) => a + v, 0)
console.log('\n--- trava de sanidade ---')
console.log('  liquido das 5 saidas ...... ' + fmt(liquido))
console.log('  tampao 30-31/07 ........... ' + fmt(6672.06))
if (Math.abs(liquido - 6672.06) > 0.005) { console.error('  ! nao batem — abortado'); process.exit(1) }
console.log('  batem ao centavo.')

/* ============ [2][3][4] classifica as cinco saidas ======================== */
const SAIDAS = [
  { valor: 1348.31, cat: CAT_VIAGEM, cc: CC_PASSAGENS, pessoa: P_ADN!.id,
    desc: 'BILHETE ADN VIAGENS - Leilao LS (7-8/08): volta Bula, Goiania -> Campo Grande',
    nota: TAG + ' Passagem de volta do Bula (Goiania -> Campo Grande) para o Leilao LS de 7 e 8/08, paga a ADN Viagens (22.002.438/0001-41). Uma das tres passagens do mesmo evento pagas em 31/07 (total 6.144,98); a primeira delas foi o PIX de 1.233,66 de 10/07.',
    tags: ['a-pagar', '2026', 'julho', 'passagem', 'espelho-extrato'] },
  { valor: 1928.82, cat: CAT_VIAGEM, cc: CC_PASSAGENS, pessoa: P_ADN!.id,
    desc: 'BILHETE ADN VIAGENS - Leilao LS (7-8/08): volta Peralta e Nane, Goiania -> Campo Grande',
    nota: TAG + ' Passagem de volta do Peralta e da Nane (Goiania -> Campo Grande) para o Leilao LS de 7 e 8/08, paga a ADN Viagens (22.002.438/0001-41).',
    tags: ['a-pagar', '2026', 'julho', 'passagem', 'espelho-extrato'] },
  { valor: 2867.85, cat: CAT_VIAGEM, cc: CC_PASSAGENS, pessoa: P_ADN!.id,
    desc: 'BILHETE ADN VIAGENS - Leilao LS (7-8/08): ida Peralta, Bula e Nane, Cuiaba -> Goiania',
    nota: TAG + ' Passagem de ida do Peralta, do Bula e da Nane (Cuiaba -> Goiania) para o Leilao LS de 7 e 8/08, paga a ADN Viagens (22.002.438/0001-41).',
    tags: ['a-pagar', '2026', 'julho', 'passagem', 'espelho-extrato'] },
  { valor: 525, cat: CAT_SOFTWARE, cc: null, pessoa: P_FDB!.id,
    desc: 'Assinatura Codex / ChatGPT (OpenAI) - reembolso via Formula do Boi',
    nota: TAG + ' PIX ao CNPJ 65.565.807/0001-17 (FORMULA DO BOI) sem memo nenhum no extrato. NATUREZA CONFIRMADA PELO JOAO em 02/09/2026: "foi referente a sistemas, pagamento Codex (Chat GPT)" — assinatura da OpenAI paga pela Formula do Boi e reembolsada. Mesma natureza da assinatura Anthropic/Claude (550,00 em 24/08), do plano de banco de dados (180,00 em 18/08) e da hospedagem Vercel (110,00 em 28/08): infraestrutura do sistema, categoria Software/Assinaturas.',
    tags: ['a-pagar', '2026', 'julho', 'software', 'espelho-extrato'] },
  { valor: 2.08, cat: CAT_TARIFAS, cc: null, pessoa: P_SICOOB_T,
    desc: 'Tarifa de cobranca Sicoob - liquidacao boleto Kito (2/3)',
    nota: TAG + ' Tarifa de cobranca do boleto do Kito (2/3) liquidado no mesmo dia (15.030,00).',
    tags: ['a-pagar', '2026', 'julho', 'tarifa', 'espelho-extrato'] },
]
for (const [i, s] of SAIDAS.entries()) {
  const mv = pega(s.valor)!
  console.log('\n[' + (i + 2) + '] 31/07  -' + fmt(s.valor) + '  ' + s.desc)
  let cpId: string | null = mv.conta_pagar_id ?? null
  const { data: ja } = await sb.from('erp_contas_pagar').select('id')
    .eq('categoria_id', s.cat).eq('vencimento', '2026-07-31').eq('valor', s.valor).maybeSingle()
  if (ja) { cpId = ja.id; console.log('    CP = ja existe ' + ja.id.slice(0, 8)) }
  else {
    console.log('    CP + criar e baixar')
    if (APPLY) {
      const { data, error } = await sb.from('erp_contas_pagar').insert({
        descricao: s.desc, fornecedor_id: s.pessoa, categoria_id: s.cat, centro_custo_id: s.cc,
        conta_bancaria_id: CONTA, valor: s.valor, valor_pago: s.valor,
        emissao: '2026-07-31', vencimento: '2026-07-31', data_pagamento: '2026-07-31',
        status: 'pago', forma_pagamento: 'pix', parcela: 1, total_parcelas: 1,
        recorrencia: 'nenhuma', origem: 'real', observacoes: s.nota, tags: s.tags,
      }).select('id').single()
      fail(error, 'cria CP ' + s.desc); cpId = data?.id ?? null
    }
  }
  if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
    categoria_id: s.cat, centro_custo_id: s.cc, pessoa_id: s.pessoa, conta_pagar_id: cpId,
    status_conciliacao: 'conciliado', conciliado: true,
    observacoes: [FONTE, s.nota].join(' | '),
  }).eq('id', mv.id)).error, 'concilia ' + s.desc)
}

/* ====== [6b] reclassifica o PIX de 525,00 se ele ja entrou como Servicos ==== */
// A 1a execucao deste script (02/09, antes da confirmacao do Joao) gravou os
// 525,00 em "Servicos de Terceiros" por analogia. Corrige em cima.
{
  const CAT_SERVICOS_ANTIGA = '1f72e05d-01ed-474b-bc83-90974be930f9'
  const mv525 = pega(525)!
  const { data: atual } = await sb.from('erp_movimentos_bancarios').select('categoria_id,conta_pagar_id').eq('id', mv525.id).maybeSingle()
  if (atual?.categoria_id === CAT_SERVICOS_ANTIGA) {
    console.log('\n[6b] 31/07  -' + fmt(525) + '  reclassifica de Servicos de Terceiros para Software/Assinaturas')
    if (APPLY) {
      fail((await sb.from('erp_movimentos_bancarios').update({ categoria_id: CAT_SOFTWARE }).eq('id', mv525.id)).error, 'reclassifica mov 525')
      if (atual.conta_pagar_id) fail((await sb.from('erp_contas_pagar').update({
        categoria_id: CAT_SOFTWARE, descricao: SAIDAS[3].desc, observacoes: SAIDAS[3].nota,
        tags: SAIDAS[3].tags,
      }).eq('id', atual.conta_pagar_id)).error, 'reclassifica CP 525')
    }
  }
}

/* ================= [5] apaga o ultimo tampao ============================== */
console.log('\n[7] 31/07  -' + fmt(6672.06) + '  APAGAR o tampao MOVIMENTOS AGREGADOS 30-31/07')
const { data: plug } = await sb.from('erp_movimentos_bancarios').select('id,descricao').eq('id', MOV_PLUG).maybeSingle()
if (!plug) console.log('    (ja removido)')
else if (!/AGREGADOS 30-31/.test(String(plug.descricao))) { console.error('    ! ' + MOV_PLUG.slice(0, 8) + ' nao e o tampao esperado'); erros++ }
else {
  console.log('    mov ' + MOV_PLUG.slice(0, 8) + ' + CP stub ' + CP_PLUG.slice(0, 8) + ' -> removidos')
  if (APPLY) {
    fail((await sb.from('erp_movimentos_bancarios').delete().eq('id', MOV_PLUG)).error, 'apaga movimento tampao')
    fail((await sb.from('erp_contas_pagar').delete().eq('id', CP_PLUG)).error, 'apaga CP tampao')
  }
}

/* ---------- fecho --------------------------------------------------------- */
const { data: ate31 } = await sb.from('erp_movimentos_bancarios').select('tipo,valor')
  .eq('conta_bancaria_id', CONTA).gte('data', '2026-07-01').lte('data', '2026-07-31')
const { data: conta } = await sb.from('erp_contas_bancarias').select('saldo_atual').eq('id', CONTA).maybeSingle()
const netJul = (ate31 || []).reduce((a, m) => a + (m.tipo === 'entrada' ? 1 : -1) * Number(m.valor), 0)
console.log('\n--- julho ---')
console.log('  lancamentos ... ' + (ate31?.length || 0) + '  (o extrato tem 74)')
console.log('  saldo 30/06 ... ' + fmt(73259.33))
console.log('  liquido do mes  ' + fmt(netJul))
console.log('  saldo 31/07 ... ' + fmt(73259.33 + netJul) + '  (extrato: ' + brl(SALDO_31_07) + ')')
console.log('\n--- saldo de hoje ---')
console.log('  ERP ........... ' + fmt(conta?.saldo_atual))
console.log('  esperado ...... ' + fmt(SALDO_HOJE))
console.log('  diferenca ..... ' + fmt(Number(conta?.saldo_atual || 0) - SALDO_HOJE))

const { data: resto } = await sb.from('erp_movimentos_bancarios').select('data,valor,descricao')
  .eq('conta_bancaria_id', CONTA).ilike('descricao', '%AGREGADOS%')
console.log('\n--- tampoes que sobram no ERP: ' + (resto?.length || 0))
for (const m of resto || []) console.log('  ' + m.data + '  ' + fmt(m.valor) + '  ' + m.descricao)
const { data: pend } = await sb.from('erp_movimentos_bancarios').select('data,valor,descricao')
  .eq('conta_bancaria_id', CONTA).gte('data', '2026-07-01').lte('data', '2026-07-31').neq('status_conciliacao', 'conciliado')
console.log('--- movimentos de julho fora de "conciliado": ' + (pend?.length || 0))
for (const m of pend || []) console.log('  ' + m.data + '  ' + fmt(m.valor) + '  ' + String(m.descricao).slice(0, 60))

console.log(erros ? '\n' + erros + ' ERRO(S).' : (APPLY ? '\nOK — gravado.' : '\nOK — dry-run limpo.'))
process.exit(erros ? 1 : 0)
