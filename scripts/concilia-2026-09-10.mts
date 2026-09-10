/**
 * Conciliacao 08-10/09/2026 - Sicoob + Sicredi - e os ajustes que os dois
 * extratos permitiram provar.
 *
 * Fontes (baixadas pelo Joao em 10/09/2026 16:00):
 *   "extrato sicoob.pdf"   periodo 01-10/09, saldo final 120.743,53 C
 *   "extrato sicredi.pdf"  periodo 26/08-10/09, CC -86,64 / investimentos 166.195,62
 * Convertidos por scripts/sicoob-pdf-para-csv.mjs (validacao por saldo OK) e
 * importados por scripts/importa-extrato.mts (Sicoob 11 novos / 22 dedup;
 * Sicredi 4 novos). Os dois fecham com diferenca 0,00 contra o extrato.
 *
 * [1] 08/09  tres saidas: contabilidade 1.058,00 (CP 0e71d7c5, venc 04/09),
 *     ClickWeb 218,30 (CP 60983905, venc 10/09) e Uber 19,30 (sem CP - corrida
 *     avulsa, classificada direto).
 *
 * [2] 09/09  quatro saidas do leilao Jacamim: Facebook 1.000,00 (CP criado a
 *     posteriori, mesmo padrao de 02 e 04/09), reembolsos Peralta 3.035,00
 *     (NFS 752) e Renato 1.324,00 (CPs criados) e Natan 983,28 (CP 4f105a22,
 *     que ja existia sem vencimento).
 *
 * [3] 10/09 +92.324,97 TED da EAO = CR 632f257e (NF639, venc 09/09) integral.
 *     A NF 639 confere: emitida 02/09/2026, competencia 09/2026, tomador EAO
 *     filial 0003, valor total 92.324,97. Os dois CR que ela substituiu
 *     (503091cc 48.556,50 + 55591ac2 31.501,80 = 80.058,30) ja tinham
 *     substituido_por preenchido mas seguiam com status 'vencido' - passam a
 *     'cancelado', senao continuam aparecendo como atraso na tela de CR
 *     (as somas ja os ignoravam via naoSubstituido()).
 *
 * [4] 10/09 +18.404,25 da Naviraí em tres creditos, e eles resolvem a duvida
 *     que estava aberta desde 21/08 (ver conferencia-navirai-julho-2026):
 *     a base da comissao e o A VISTA, nao o bruto. Prova: as tres notas que a
 *     propria Bula emitiu em 21/08 somam exatamente os 18.374,25 previstos
 *     naquele dia como cenario "se a Naviraí comissionar sobre o a vista".
 *       NF630  2.411,25  Fazenda Santa Marta
 *       NF631  8.490,00  Fazenda Marialva
 *       NF632  7.473,00  Chacara Naviraí
 *     Os dois CR caem de 9.825,00 -> 9.611,25 e 8.970,00 -> 8.763,00 (desconto
 *     213,75 e 207,00, lancados como desconto e nao como perda).
 *     ⚠ O banco creditou 2.441,25 contra a NF630 de 2.411,25: 30,00 A MAIOR.
 *     Vira CP contra o Claudio Sabino para devolver ou compensar.
 *
 * [5] SICREDI - o extrato desmentiu o ajuste de 82,65 de 03/09. A hipotese
 *     daquele dia (cesta 67,64 + integralizacao 20,00) acertou as RUBRICAS e
 *     errou data e conta: as duas sao debito da CC em 10/09, nao da aplicacao
 *     em 01/09. A linha e reaproveitada (mesma import_key, para nao brigar com
 *     o concilia-sicoob-2026-09-03 se ele rodar de novo) e passa a ser o ajuste
 *     de posicao da APLICACAO em 10/09, de 69,52, que e o que falta para a
 *     aplicacao bater os 166.195,62 que o extrato declara.
 *     Entra tambem a 2a parcela do JMP: +165.667,50 da JBJ em 08/09, aplicada
 *     no mesmo dia (165.666,50). Ela baixa os dois CR do JMP (58.484,00 +
 *     107.183,50 = 165.667,50, exato) e destrava o CP do repasse ao Felipe.
 *
 * [6] DAS Simples Nacional agosto/2026: o CP 883f97aa existia como placeholder
 *     ("aguardando guia", valor 0,00, sem vencimento). Recebe os 14.721,81 da
 *     guia 07.20.26253.9080780-0 e o vencimento 21/09/2026.
 *
 * [7] Comissao da Valéria Borges (1% de 75.300,00 = 753,00, lotes 56/71/81 do
 *     23o Genetica Aditiva 2a etapa): O CP JA EXISTIA (d02e43d2, venc 25/08,
 *     em aberto). Nao se cria outro. So faltava a evento_key - sem ela o
 *     gerador de comissoes nao reconhece o titulo e duplicaria na proxima
 *     rodada.
 *
 * [8] Repasse do JMP ao Felipe (CP 637f0a9e, 157.384,13): estava sem
 *     vencimento porque era "apos a segunda parcela". A parcela entrou em
 *     08/09 - o titulo ganha data.
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
const TAG = '[CONC 10/09]'
const FONTE = 'Fonte: extrato Sicoob 01-10/09 e extrato Sicredi 26/08-10/09, ambos de 10/09/2026 16:00'

const SALDO_SICOOB = 120743.53
const SALDO_SICREDI_CC = -86.64
const SALDO_SICREDI_INV = 166195.62

const CONTA_SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const CONTA_SICREDI_CC = 'af4724ec-e098-4e13-b172-04b2bfb1949d'
const CONTA_SICREDI_INV = '5879aa04-2d69-4b9a-a80c-d9e3eca7ac06'

const CAT_COMISSAO_LEIL = 'e74434bd-3366-4015-9268-15d6640cf15f' // receita
const CAT_MARKETING = '26762d4e-b517-48b9-98f3-155a6421264e'
const CAT_TARIFAS = 'f8ae3a53-bb4e-414e-97d1-ebdca81df658'
const CAT_SERVICOS = '1f72e05d-01ed-474b-bc83-90974be930f9'
const CAT_TRANSPORTE = '39139125-e4b4-4b9c-9438-28d775e9e637'
const CAT_VIAGEM = '98083139-0fbf-487a-9988-a08519ebf259'
const CAT_REEMBOLSO = '6e79fd9e-f837-4ff4-a73d-3d8bdabe7ce7'
const CAT_IMPOSTOS = '6d3270c8-2680-4cdd-a709-5b1520d1f430'
const CAT_APLICACAO = 'e7198fb9-acfc-4b22-a738-dcf72000dd31'
const CAT_INTEGR_CAP = '9e152b58-58ac-48b3-a17d-3b9d4a6acbb2'
const CAT_TRANSF_ENT = '2847979e-b319-4cad-9510-828c9d6bc1c0'

const CC_MARKETING = '70886cf3-c996-46de-a049-26581b3d08ad'
const CC_CONTADOR = '29fe62e8-c44e-4e8d-8157-bb8320f0f9c5'
const CC_IMPOSTO = 'ccca82b8-5852-4fbd-8d50-c37a3c5804f5'
const CC_TRANSPORTE = '61f58023-4552-48b9-8df9-5d08d08156c2'

const P_LUCAS_CONTABIL = '0310bb34-ff42-407e-a27f-d0e02346add6'
const P_CLICKWEB = '63d85b77-0882-43f8-aaf0-fab06fd3fc6d'
const P_UBER = '7429637a-8e60-44e2-a6d8-012b162500da'
const P_FACEBOOK = '51ebfcd7-2cb0-4ad0-9052-e73e8f68cc82'
const P_PERALTA = 'd742ed5b-0ab2-4934-b10e-9099106fa994'
const P_EAO = 'a835b5ce-4672-5b1d-bf99-9102e147881b'
const P_CLAUDIO = 'cf4a9f78-d543-4e0d-b477-0c7a2b038247'
const P_JBJ = 'd0c2ae7f-22bc-41f4-84bb-e0fd36943981'
const P_RECEITA = '094a2792-eb6b-4fa9-bdca-dc39ff3b0b4e'
const P_FELIPE = '248eba5a-3d89-46a1-b2d6-4c64424d78b9'
const P_VALERIA = 'a76f6ee2-76b9-4b87-bc50-b833c69eb29b'

const CP_CONTABIL_SET = '0e71d7c5'
const CP_CLICKWEB = '60983905'
const CP_NATAN = '4f105a22'
const CP_DAS_AGO = '883f97aa'
const CP_VALERIA = 'd02e43d2'
const CP_REPASSE_JMP = '637f0a9e'

const CR_EAO_NF639 = '632f257e'
const CR_EAO_FEM = '503091cc'
const CR_EAO_MACHOS = '55591ac2'
const CR_NAV_0507 = '95d8efab'
const CR_NAV_1607 = 'ea4cb443'
const CR_JMP_FEM = '747e8048'
const CR_JMP_TOUROS = 'c2e00d60'

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const say = (s: string) => console.log(s)

// Os ids acima sao prefixos: o banco guarda uuid inteiro.
const cacheCP = new Map<string, any>()
const cacheCR = new Map<string, any>()
async function carrega(tabela: 'erp_contas_pagar' | 'erp_contas_receber', cache: Map<string, any>) {
  let todos: any[] = []
  for (let p = 0; ; p++) {
    const { data } = await sb.from(tabela).select('*').range(p * 1000, p * 1000 + 999)
    if (!data?.length) break
    todos = todos.concat(data)
    if (data.length < 1000) break
  }
  for (const t of todos) cache.set(t.id.slice(0, 8), t)
}
await carrega('erp_contas_pagar', cacheCP)
await carrega('erp_contas_receber', cacheCR)
const cp = (pref: string) => { const t = cacheCP.get(pref); if (!t) throw new Error('CP nao encontrado: ' + pref); return t }
const cr = (pref: string) => { const t = cacheCR.get(pref); if (!t) throw new Error('CR nao encontrado: ' + pref); return t }

async function movimento(conta: string, data: string, valor: number, trecho: string) {
  const { data: rows } = await sb.from('erp_movimentos_bancarios')
    .select('id,data,tipo,valor,descricao,status_conciliacao,conta_pagar_id,conta_receber_id,categoria_id,pessoa_id,observacoes')
    .eq('conta_bancaria_id', conta).eq('data', data).eq('valor', valor).ilike('descricao', '%' + trecho + '%')
  if (!rows || rows.length !== 1) throw new Error('movimento ambiguo/ausente: ' + data + ' ' + brl(valor) + ' "' + trecho + '" -> ' + (rows?.length ?? 0))
  return rows[0]
}

async function classifica(mov: any, campos: Record<string, any>, nota: string) {
  const obs = String(mov.observacoes || '')
  const novaObs = obs.includes(TAG) ? obs : (obs ? obs + ' ' : '') + TAG + ' ' + nota
  say('  mov ' + mov.data + ' ' + brl(mov.valor).padStart(12) + '  ' + String(mov.descricao).slice(0, 56))
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
  if (obs.includes(TAG) || (t.status === 'pago' && jaPago >= Number(t.valor))) {
    say('  CP  ' + String(t.descricao).slice(0, 54).padEnd(54) + ' (baixa ja dada)')
    return t.id
  }
  const total = jaPago + valorPago
  const status = total + 0.005 >= Number(t.valor) ? 'pago' : 'parcial'
  say('  CP  ' + String(t.descricao).slice(0, 54).padEnd(54) + brl(t.valor).padStart(11) + ' -> pago ' + brl(total).padStart(11) + ' [' + status + ']')
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').update({
      status, valor_pago: total, data_pagamento: dataPag,
      forma_pagamento: t.forma_pagamento || 'pix',
      conta_bancaria_id: t.conta_bancaria_id || CONTA_SICOOB,
      observacoes: (obs ? obs + ' ' : '') + TAG + ' ' + nota,
    }).eq('id', t.id)
    if (error) throw error
  }
  return t.id
}

async function criaCP(campos: Record<string, any>, doc: string) {
  const { data: ja } = await sb.from('erp_contas_pagar').select('id,descricao').eq('numero_documento', doc).maybeSingle()
  if (ja) { say('  CP  ' + String(ja.descricao).slice(0, 54).padEnd(54) + ' (ja existia)'); return ja.id }
  say('  CP+ ' + String(campos.descricao).slice(0, 54).padEnd(54) + brl(campos.valor).padStart(11) + ' [criado]')
  if (!APPLY) return null
  const { data, error } = await sb.from('erp_contas_pagar').insert({ ...campos, numero_documento: doc, origem: 'real' }).select('id').single()
  if (error) throw error
  cacheCP.set(data!.id.slice(0, 8), { ...campos, id: data!.id, valor_pago: 0, status: campos.status || 'aberto' })
  return data!.id
}

async function baixaCR(pref: string, valorReceb: number, desconto: number, dataReceb: string, nota: string) {
  const t = cr(pref)
  const obs = String(t.observacoes || '')
  if (obs.includes(TAG)) { say('  CR  ' + String(t.descricao).slice(0, 54).padEnd(54) + ' (baixa ja dada)'); return t.id }
  const total = Number(t.valor_recebido || 0) + valorReceb
  const devido = Number(t.valor) - desconto
  const status = total + 0.005 >= devido ? 'recebido' : 'parcial'
  say('  CR  ' + String(t.descricao).slice(0, 54).padEnd(54) + brl(t.valor).padStart(11)
    + (desconto ? ' -desc ' + brl(desconto) : '') + ' -> recebido ' + brl(total).padStart(11) + ' [' + status + ']')
  if (APPLY) {
    const { error } = await sb.from('erp_contas_receber').update({
      status, valor_recebido: total, desconto, data_recebimento: dataReceb,
      forma_recebimento: t.forma_recebimento || 'transferencia',
      conta_bancaria_id: t.conta_bancaria_id || CONTA_SICOOB,
      observacoes: (obs ? obs + ' ' : '') + TAG + ' ' + nota,
    }).eq('id', t.id)
    if (error) throw error
  }
  return t.id
}

/**
 * Fecha a apuracao de um CP. A migration 0085 barra a baixa enquanto
 * `natureza` for projecao/em_verificacao ou `valor_situacao` for
 * a_apurar/em_disputa - de proposito: obrigacao sem prova nao se paga.
 * So se chama isto quando a prova ENTROU (guia, extrato, ordem do financeiro),
 * e a fonte nova fica registrada no proprio campo.
 */
async function fechaApuracao(pref: string, fonte: Record<string, any>, extra: Record<string, any> = {}) {
  const t = cp(pref)
  const a = (t.apuracao && typeof t.apuracao === 'object') ? t.apuracao : {}
  if (a.natureza === 'obrigacao' && a.valor_situacao === 'confirmado' && !a.nao_executar_pagamento) {
    say('      apuracao ja fechada'); return
  }
  const fontes = Array.isArray(a.fontes) ? a.fontes : []
  if (fontes.some((f: any) => f?.ref === fonte.ref)) { say('      apuracao ja tem esta fonte'); return }
  const nova: Record<string, any> = {
    ...a, ...extra,
    natureza: 'obrigacao', valor_situacao: 'confirmado',
    fontes: [...fontes, fonte],
    pendencias: [],
    pendencias_encerradas: [
      ...(Array.isArray(a.pendencias_encerradas) ? a.pendencias_encerradas : []),
      ...(Array.isArray(a.pendencias) && a.pendencias.length
        ? [{ data: '2026-09-10', encerrada_por: fonte.ref, textos: a.pendencias }] : []),
    ],
  }
  delete nova.nao_executar_pagamento
  say('      apuracao: natureza=' + (a.natureza ?? '-') + '/' + (a.valor_situacao ?? '-') + ' -> obrigacao/confirmado')
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').update({ apuracao: nova }).eq('id', t.id)
    if (error) throw error
    cacheCP.set(t.id.slice(0, 8), { ...t, apuracao: nova })
  }
}

/**
 * Rateio de um credito entre varios titulos. Necessario quando um PIX quita
 * mais de um CR: `conta_receber_id` e singular, e a condicao de pagamento da
 * 0085 exige o credito bancario INTEGRAL vinculado a cada titulo.
 */
async function rateia(movId: string, destinos: Array<[string, number, string]>, criterio: string) {
  const { data: ja } = await sb.from('erp_movimento_rateios').select('id').eq('movimento_id', movId)
  if (ja?.length) { say('      rateio ja registrado (' + ja.length + ' linhas)'); return }
  for (const [crId, valor, rot] of destinos) say('      rateio ' + brl(valor).padStart(12) + '  -> ' + rot)
  if (!APPLY) return
  const { error } = await sb.from('erp_movimento_rateios').insert(destinos.map(([crId, valor]) => ({
    movimento_id: movId, conta_receber_id: crId, valor, fundamento: 'documentado',
    evidencia: { criterio, fonte: FONTE, data: '2026-09-10' },
  })))
  if (error) throw error
}

async function pessoaPorNome(nome: string, obs: string) {
  const { data: ja } = await sb.from('erp_pessoas').select('id').eq('nome', nome).maybeSingle()
  if (ja) return ja.id
  say('  pessoa+ ' + nome)
  if (!APPLY) return null
  const { data, error } = await sb.from('erp_pessoas')
    .insert({ nome, razao_social: nome, tipo: 'pf', is_fornecedor: true, ativo: true, observacoes: obs }).select('id').single()
  if (error) throw error
  return data!.id
}

// ---------------------------------------------------------------------------
say('\n=== [1] SICOOB 08/09 - contabilidade, ClickWeb e Uber ===')
// ---------------------------------------------------------------------------
{
  const m1 = await movimento(CONTA_SICOOB, '2026-09-08', 1058.00, 'Contabilidade Honorario')
  const id1 = await baixaCP(CP_CONTABIL_SET, 1058.00, '2026-09-08', 'Honorarios de contabilidade de 09/2026, pagos em 08/09 por PIX a LUCAS MONTEIRO (45.702.373/0001-42). ' + FONTE + '.')
  await classifica(m1, { categoria_id: CAT_SERVICOS, centro_custo_id: CC_CONTADOR, pessoa_id: P_LUCAS_CONTABIL, conta_pagar_id: id1 },
    'Honorarios de contabilidade ref. agosto/2026 (competencia), serie DESPFIXA-CONTABIL-2026-09. ' + FONTE + '.')

  const m2 = await movimento(CONTA_SICOOB, '2026-09-08', 218.30, 'clickweb sistemas')
  const id2 = await baixaCP(CP_CLICKWEB, 218.30, '2026-09-08', 'Licenca ClickWeb paga em 08/09 por PIX a DHARMA SOLUCOES DIGITAIS (47.107.220/0001-82). ' + FONTE + '.')
  await classifica(m2, { categoria_id: CAT_SERVICOS, pessoa_id: P_CLICKWEB, conta_pagar_id: id2 },
    'Site ClickWeb - licenca CMS e hospedagem. ' + FONTE + '.')

  const m3 = await movimento(CONTA_SICOOB, '2026-09-08', 19.30, '17.895.646')
  await classifica(m3, { categoria_id: CAT_TRANSPORTE, centro_custo_id: CC_TRANSPORTE, pessoa_id: P_UBER },
    'Corrida avulsa Uber (17.895.646/0001-87). Sem contas a pagar: despesa de cartao/PIX imediato, nao ha obrigacao previa. ' + FONTE + '.')
}

// ---------------------------------------------------------------------------
say('\n=== [2] SICOOB 09/09 - leilao Jacamim (trafego + 3 reembolsos) ===')
// ---------------------------------------------------------------------------
{
  const m1 = await movimento(CONTA_SICOOB, '2026-09-09', 1000.00, 'campanha patrocinado visual')
  const idFb = await criaCP({
    descricao: 'Marketing - campanha patrocinada Nelore Visual (Facebook Ads)',
    valor: 1000, vencimento: '2026-09-09', emissao: '2026-09-09', status: 'aberto',
    categoria_id: CAT_MARKETING, centro_custo_id: CC_MARKETING, fornecedor_id: P_FACEBOOK,
    conta_bancaria_id: CONTA_SICOOB, tags: ['a-pagar', 'marketing', '2026', 'setembro'],
    observacoes: 'Lancado a posteriori a partir do extrato, mesmo padrao dos 2.500,00 de 02/09 e 04/09. ' + FONTE + '.',
  }, 'mkt-2026-09-09:facebook-nelore-visual')
  if (idFb) await baixaCP(String(idFb).slice(0, 8), 1000, '2026-09-09', 'Pago no PIX de 09/09 ao Facebook (13.347.016/0001-17). ' + FONTE + '.')
  await classifica(m1, { categoria_id: CAT_MARKETING, centro_custo_id: CC_MARKETING, pessoa_id: P_FACEBOOK, ...(idFb ? { conta_pagar_id: idFb } : {}) },
    'Trafego pago da campanha Nelore Visual. ' + FONTE + '.')

  const m2 = await movimento(CONTA_SICOOB, '2026-09-09', 3035.00, 'reembolso jacamin nfs 752')
  const idP = await criaCP({
    descricao: 'Reembolso Peralta - leilao Jacamim - NFS 752',
    valor: 3035, vencimento: '2026-09-09', emissao: '2026-09-09', status: 'aberto',
    categoria_id: CAT_REEMBOLSO, fornecedor_id: P_PERALTA, conta_bancaria_id: CONTA_SICOOB,
    nota_fiscal: '752', tags: ['a-pagar', 'reembolso', '2026', 'setembro', 'leilao'],
    observacoes: 'Lancado a posteriori a partir do extrato. CPF do favorecido (***.814.661-**) bate com Luiz Felipe Peralta Garcez. ' + FONTE + '.',
  }, 'reemb-2026-09-09:peralta-jacamim-nfs752')
  if (idP) await baixaCP(String(idP).slice(0, 8), 3035, '2026-09-09', 'Pago no PIX de 09/09. ' + FONTE + '.')
  await classifica(m2, { categoria_id: CAT_REEMBOLSO, pessoa_id: P_PERALTA, ...(idP ? { conta_pagar_id: idP } : {}) },
    'Reembolso de despesas do leilao Jacamim (NFS 752). ' + FONTE + '.')

  const m3 = await movimento(CONTA_SICOOB, '2026-09-09', 1324.00, 'reembolso jacamin Renato')
  const pRenato = await pessoaPorNome('Renato Raven', 'Cadastro criado na conciliacao de 10/09/2026. CPF mascarado no extrato: ***.481.241-**. Nome vem da observacao do CP do Natan ("viagem Jacamim/MT encaminhada por Renato Raven") - CONFIRMAR grafia e documento.')
  const idR = await criaCP({
    descricao: 'Reembolso Renato - leilao Jacamim',
    valor: 1324, vencimento: '2026-09-09', emissao: '2026-09-09', status: 'aberto',
    categoria_id: CAT_REEMBOLSO, ...(pRenato ? { fornecedor_id: pRenato } : {}), conta_bancaria_id: CONTA_SICOOB,
    tags: ['a-pagar', 'reembolso', '2026', 'setembro', 'leilao'],
    observacoes: 'Lancado a posteriori a partir do extrato. Favorecido ***.481.241-**. ' + FONTE + '.',
  }, 'reemb-2026-09-09:renato-jacamim')
  if (idR) await baixaCP(String(idR).slice(0, 8), 1324, '2026-09-09', 'Pago no PIX de 09/09. ' + FONTE + '.')
  await classifica(m3, { categoria_id: CAT_REEMBOLSO, ...(pRenato ? { pessoa_id: pRenato } : {}), ...(idR ? { conta_pagar_id: idR } : {}) },
    'Reembolso de despesas do leilao Jacamim. ' + FONTE + '.')

  const m4 = await movimento(CONTA_SICOOB, '2026-09-09', 983.28, 'reembolso Natan Jacamin')
  const pNatan = await pessoaPorNome('Natan (viagem Jacamim/MT)', 'Cadastro criado na conciliacao de 10/09/2026. CPF mascarado no extrato: ***.951.401-**. CONFIRMAR nome completo e documento.')
  // A pendencia deste titulo era "nao criar vencimento com base na data do print,
  // aguardar extrato posterior a 04/09". O extrato de 10/09 mostra o PIX de
  // 983,28 em 09/09 ao ***.951.401-**: e a prova que faltava.
  say('  CP  Reembolso Natan')
  await fechaApuracao(CP_NATAN, {
    tipo: 'documento_original', data: '2026-09-10',
    ref: 'F:/extrato sicoob.pdf | Sicoob CC 1.056-1, periodo 01-10/09/2026',
    trecho: 'PIX EMIT.OUTRA IF - Pagamento Pix - ***.951.401-** - Ref reembolso Natan Jacamin - 983,28 D em 09/09/2026.',
  }, { pagamento_situacao: 'informado', prazo_situacao: 'documentado' })
  if (APPLY && (!cp(CP_NATAN).fornecedor_id || !cp(CP_NATAN).vencimento)) {
    await sb.from('erp_contas_pagar').update({ ...(pNatan ? { fornecedor_id: pNatan } : {}), vencimento: '2026-09-09' }).eq('id', cp(CP_NATAN).id)
  }
  const idN = await baixaCP(CP_NATAN, 983.28, '2026-09-09', 'Pago no PIX de 09/09 (***.951.401-**). O titulo estava sem vencimento desde a auditoria de completude; recebe a data do pagamento comprovada pelo extrato. ' + FONTE + '.')
  await classifica(m4, { categoria_id: CAT_VIAGEM, ...(pNatan ? { pessoa_id: pNatan } : {}), conta_pagar_id: idN },
    'Reembolso da viagem do Natan ao leilao Jacamim/MT. ' + FONTE + '.')
}

// ---------------------------------------------------------------------------
say('\n=== [3] SICOOB 10/09 +92.324,97 - EAO Baviera (NF639) ===')
// ---------------------------------------------------------------------------
{
  const mov = await movimento(CONTA_SICOOB, '2026-09-10', 92324.97, 'EAO EMPREENDIMENTOS')
  const nota = 'TED da EAO (00.141.269/0001-98, cod. T1092363201) em 10/09, um dia depois do vencimento. '
    + 'Confere ao centavo com a NF 639 (emitida 02/09/2026, competencia 09/2026, tomador EAO filial 0003, R$ 92.324,97). '
    + 'Titulo consolidado do 13o Mega Baviera de julho - quita integralmente. ' + FONTE + '.'
  const id = await baixaCR(CR_EAO_NF639, 92324.97, 0, '2026-09-10', nota)
  await classifica(mov, { categoria_id: CAT_COMISSAO_LEIL, pessoa_id: P_EAO, conta_receber_id: id }, nota)

  for (const [pref, rot] of [[CR_EAO_FEM, 'Femeas 11/07'], [CR_EAO_MACHOS, 'Machos 12/07']] as [string, string][]) {
    const t = cr(pref)
    if (t.status === 'cancelado') { say('  CR  ' + String(t.descricao).slice(0, 54).padEnd(54) + ' (ja cancelado)'); continue }
    say('  CR  ' + String(t.descricao).slice(0, 54).padEnd(54) + brl(t.valor).padStart(11) + ' [' + t.status + ' -> cancelado]')
    if (APPLY) {
      const { error } = await sb.from('erp_contas_receber').update({
        status: 'cancelado',
        observacoes: (t.observacoes ? t.observacoes + ' ' : '') + TAG + ' Estimativa de ' + rot
          + ' substituida pela NF 639 (CR 632f257e, 92.324,97), recebida em 10/09. O campo substituido_por ja apontava para ela desde 09/09; '
          + 'o status seguia "vencido" e o titulo aparecia como atraso na tela de contas a receber, embora as somas ja o ignorassem. ' + FONTE + '.',
      }).eq('id', t.id)
      if (error) throw error
    }
  }
}

// ---------------------------------------------------------------------------
say('\n=== [4] SICOOB 10/09 +18.404,25 - Naviraí julho (NF 630/631/632) ===')
// ---------------------------------------------------------------------------
{
  const NOTA_BASE = 'A Naviraí comissionou sobre o A VISTA, nao sobre o bruto - duvida aberta em 21/08 e agora fechada. '
    + 'As tres notas emitidas pela Bula em 21/08 somam 18.374,25 (NF630 2.411,25 Fazenda Santa Marta + NF631 8.490,00 Fazenda Marialva '
    + '+ NF632 7.473,00 Chacara Naviraí), exatamente o cenario "a vista" previsto naquele dia (9.611,25 + 8.763,00). '

  const nota0507 = NOTA_BASE + 'Etapa 05/07: 9.825,00 bruto -> 9.611,25 a vista, desconto de 213,75. Quitado em 10/09. ' + FONTE + '.'
  const nota1607 = NOTA_BASE + 'Etapa 16/07: 8.970,00 bruto -> 8.763,00 a vista, desconto de 207,00. Quitado em 10/09. ' + FONTE + '.'
  const id1 = await baixaCR(CR_NAV_0507, 9611.25, 213.75, '2026-09-10', nota0507)
  const id2 = await baixaCR(CR_NAV_1607, 8763.00, 207.00, '2026-09-10', nota1607)

  const notaMov = 'Credito da Naviraí em 10/09 (Claudio Sabino Carvalho Filho, 029.566.706-03). Os tres creditos liquidam as duas '
    + 'etapas de julho juntas: as notas foram cortadas por TOMADOR (tres criadores), nao por etapa - cada uma diz "ETAPA 1 E 2". '
    + 'Rateio: 8.490,00 + 1.121,25 fecham a etapa de 05/07 e 7.473,00 + 1.290,00 a de 16/07. ' + FONTE + '.'
  await classifica(await movimento(CONTA_SICOOB, '2026-09-10', 8490.00, 'NF631'), { categoria_id: CAT_COMISSAO_LEIL, pessoa_id: P_CLAUDIO, conta_receber_id: id1 }, 'NF631 (Fazenda Marialva). ' + notaMov)
  await classifica(await movimento(CONTA_SICOOB, '2026-09-10', 7473.00, 'CRED.TR.CT.INTERCRE'), { categoria_id: CAT_COMISSAO_LEIL, pessoa_id: P_CLAUDIO, conta_receber_id: id2 }, 'NF632 (Chacara Naviraí). ' + notaMov)
  const movNf630 = await movimento(CONTA_SICOOB, '2026-09-10', 2441.25, 'NF630')
  await classifica(movNf630, { categoria_id: CAT_COMISSAO_LEIL, pessoa_id: P_CLAUDIO, conta_receber_id: id1 },
    'NF630 (Fazenda Santa Marta). ⚠ A nota e de 2.411,25 e o banco creditou 2.441,25: 30,00 A MAIOR, lancados como obrigacao contra o Claudio Sabino. ' + notaMov)
  // O credito da NF630 e o unico que se parte entre as duas etapas; os 30,00 a
  // maior ficam de fora do rateio de proposito - nao sao receita, sao devolucao.
  await rateia(movNf630.id, [[cr(CR_NAV_0507).id, 1121.25, 'etapa 05/07 (completa 9.611,25)'], [cr(CR_NAV_1607).id, 1290.00, 'etapa 16/07 (completa 8.763,00)']],
    'NF630 cobre as duas etapas (o texto da nota diz "ETAPA 01 E 02"); rateada pelo saldo que faltava em cada CR depois das NF631 e NF632. Os 30,00 restantes do credito sao recebimento a maior e viram obrigacao de devolucao, nao receita.')

  await criaCP({
    descricao: 'Naviraí - recebido a maior na NF630 (30,00) - devolver ou compensar',
    valor: 30, vencimento: null, emissao: '2026-09-10', status: 'aberto',
    categoria_id: CAT_REEMBOLSO, fornecedor_id: P_CLAUDIO, conta_bancaria_id: CONTA_SICOOB,
    nota_fiscal: '630', tags: ['a-pagar', '2026', 'setembro', 'a-confirmar'],
    observacoes: 'A NF 630 (Fazenda Santa Marta, emitida 21/08/2026) e de R$ 2.411,25 e o PIX de 10/09 creditou R$ 2.441,25. '
      + 'Diferenca de R$ 30,00 a favor da Naviraí. Sem vencimento: combinar devolucao ou compensacao no proximo acerto. ' + FONTE + '.',
  }, 'navirai-2026-09-10:sobra-nf630')
}

// ---------------------------------------------------------------------------
say('\n=== [5] SICREDI - 2a parcela do JMP, aplicacao e correcao do ajuste de 82,65 ===')
// ---------------------------------------------------------------------------
{
  const notaJmp = '2a e ultima parcela do 10o Leilao Nelore JMP (NF 618 femeas/bezerras + NF 619 touros, emitidas 15/07). '
    + 'A JBJ (15.689.716/0001-15) pagou 165.667,50 no Sicredi em 08/09 - dois dias antes do combinado (13/09) - '
    + 'e o dinheiro foi aplicado no mesmo dia. Soma exata dos dois titulos: 58.484,00 + 107.183,50. ' + FONTE + '.'
  const idF = await baixaCR(CR_JMP_FEM, 58484.00, 0, '2026-09-08', notaJmp)
  const idT = await baixaCR(CR_JMP_TOUROS, 107183.50, 0, '2026-09-08', notaJmp)
  const movJbj = await movimento(CONTA_SICREDI_CC, '2026-09-08', 165667.50, 'JBJ AGROPECUARIA')
  await classifica(movJbj, { categoria_id: CAT_COMISSAO_LEIL, pessoa_id: P_JBJ, conta_receber_id: idT }, notaJmp + ' O credito cobre os DOIS CR; aponta para o de touros (o maior) e o rateio faz a divisao exata.')
  // Sem este rateio o repasse ao Felipe NUNCA pode ser pago: a condicao da
  // migration 0085 exige o credito bancario integral vinculado a CADA titulo,
  // e conta_receber_id e singular.
  await rateia(movJbj.id, [[cr(CR_JMP_FEM).id, 58484.00, 'JMP femeas/bezerras 2/2 (NF618)'], [cr(CR_JMP_TOUROS).id, 107183.50, 'JMP touros 2/2 (NF619)']],
    'PIX unico da JBJ de 165.667,50 em 08/09 quitando as duas parcelas 2/2 do 10o Leilao Nelore JMP: 58.484,00 (NF618) + 107.183,50 (NF619).')

  // aplicacao 08/09: perna da CC ja veio no extrato, falta a perna da aplicacao
  const movApl = await movimento(CONTA_SICREDI_CC, '2026-09-08', 165666.50, 'APLICACAO FINANCEIRA')
  const KEY_APL = 'par:aplicacao-sicredi-2026-09-08'
  const { data: jaApl } = await sb.from('erp_movimentos_bancarios').select('id').eq('import_key', KEY_APL).maybeSingle()
  const notaApl = 'Varredura automatica do Sicredi: o valor recebido da JBJ foi aplicado no mesmo dia, deixando 1,00 na CC. ' + FONTE + '.'
  if (!jaApl) {
    say('  Sicredi Investimentos  entrada +165.666,50  APLICACAO FINANCEIRA (perna da aplicacao)')
    if (APPLY) {
      const { data: entInv, error } = await sb.from('erp_movimentos_bancarios').insert({
        conta_bancaria_id: CONTA_SICREDI_INV, data: '2026-09-08', tipo: 'entrada', valor: 165666.50,
        descricao: 'APLICACAO FINANCEIRA - recebimento da JBJ (2a parcela JMP) aplicado no mesmo dia',
        categoria_id: CAT_TRANSF_ENT, conciliado: true, status_conciliacao: 'conciliado',
        origem: 'ajuste_manual', documento: 'varredura', observacoes: notaApl,
        import_key: KEY_APL, transferencia_par_id: movApl.id,
      }).select('id').single()
      if (error) throw error
      await sb.from('erp_movimentos_bancarios').update({ transferencia_par_id: entInv!.id }).eq('id', movApl.id)
    }
  } else say('  (perna da aplicacao ja lancada)')
  await classifica(movApl, { categoria_id: CAT_APLICACAO }, notaApl)

  await classifica(await movimento(CONTA_SICREDI_CC, '2026-09-10', 20.00, 'INTEGR.CAPITAL'),
    { categoria_id: CAT_INTEGR_CAP }, 'Integralizacao de capital da cooperativa, debitada na CC em 10/09. ' + FONTE + '.')
  await classifica(await movimento(CONTA_SICREDI_CC, '2026-09-10', 67.64, 'CESTA DE RELACIONAMENTO'),
    { categoria_id: CAT_TARIFAS }, 'Cesta de relacionamento Sicredi, debitada na CC em 10/09. ' + FONTE + '.')

  // Correcao do ajuste de 82,65 de 03/09
  const KEY_AJUSTE = 'ajuste:sicredi-posicao-2026-09-03'
  const { data: aj } = await sb.from('erp_movimentos_bancarios').select('id,valor,data,descricao,observacoes').eq('import_key', KEY_AJUSTE).maybeSingle()
  if (!aj) say('  ⚠ ajuste de posicao de 03/09 nao encontrado - conferir a mao')
  else if (Number(aj.valor) === 69.52) say('  (ajuste de posicao ja corrigido para 69,52 em 10/09)')
  else {
    say('  ajuste de posicao  ' + brl(aj.valor) + ' (' + aj.data + ') -> 69,52 (2026-09-10)')
    if (APPLY) {
      const { error } = await sb.from('erp_movimentos_bancarios').update({
        data: '2026-09-10', valor: 69.52,
        descricao: 'AJUSTE DE POSICAO SICREDI (aplicacao) - fecha nos 166.195,62 do extrato de 10/09',
        observacoes: TAG + ' CORRIGE o ajuste de 82,65 lancado em 03/09. Aquele ajuste supunha que a cesta de relacionamento (67,64) '
          + 'e a integralizacao de capital (20,00) tinham saido da APLICACAO antes de 03/09. O extrato do Sicredi de 26/08-10/09 mostra que '
          + 'as duas sao debito da CONTA CORRENTE em 10/09 - e elas entraram como lancamentos reais neste lote. Mantido como ajuste de posicao '
          + 'apenas o residual da aplicacao: 598,64 (pos-resgate de 01/09) + 165.666,50 (aplicacao de 08/09) = 166.265,14 contra os '
          + '166.195,62 que o extrato declara -> 69,52. Rubrica ainda NAO decomposta: o extrato da APLICACAO continua sem ser importado '
          + '(ver observacoes da conta). ' + FONTE + '.',
      }).eq('id', aj.id)
      if (error) throw error
    }
  }
}

// ---------------------------------------------------------------------------
say('\n=== [6] DAS Simples Nacional - agosto/2026 ===')
// ---------------------------------------------------------------------------
{
  const t = cp(CP_DAS_AGO)
  if (Number(t.valor) === 14721.81) say('  CP  ' + String(t.descricao).slice(0, 54).padEnd(54) + ' (ja preenchido)')
  else {
    say('  CP  ' + String(t.descricao).slice(0, 54).padEnd(54) + brl(t.valor).padStart(11) + ' -> ' + brl(14721.81) + ' venc 21/09/2026')
    // O placeholder nasceu com sem_valor=true / a_apurar, e a 0085 proibe valor
    // <> 0 nesse estado. A guia chegou: fecha a apuracao no mesmo padrao do ISS
    // de agosto (CP 5feea2f0), com o documento fiscal declarado.
    await fechaApuracao(CP_DAS_AGO, {
      tipo: 'documento_original', data: '2026-09-10',
      ref: 'DAS Simples Nacional 07.20.26253.9080780-0 - agosto/2026 - recebida pelo chefe em 10/09/2026',
      trecho: 'Documento de Arrecadacao do Simples Nacional. BULA ASSESSORIA PECUARIA LTDA, CNPJ 34.791.630/0001-43. '
        + 'Periodo de apuracao agosto/2026, vencimento 21/09/2026, total R$ 14.721,81. '
        + 'IRPJ 5.152,63 + CSLL 2.208,27 + COFINS 2.359,91 + PIS 510,85 + INSS 4.490,15, sem multa nem juros.',
    }, {
      sem_valor: false, prazo_situacao: 'documentado', pagamento_situacao: 'pendente',
      fonte_prazo: 'Guia DAS 07.20.26253.9080780-0 fornecida pelo chefe',
      documento_fiscal: {
        tipo: 'DAS Simples Nacional', numero: '07.20.26253.9080780-0', valor: 14721.81,
        vencimento: '2026-09-21', competencia: '2026-08',
        composicao: { irpj: 5152.63, csll: 2208.27, cofins: 2359.91, pis: 510.85, inss: 4490.15 },
      },
      estimativa_anterior_nao_utilizada: {
        valor: 46510.08,
        motivo: 'Extrapolacao historica por fator 0,8328; sem guia ou memoria de calculo validada. '
          + 'A guia real veio 31.788,27 ABAIXO da projecao - a projecao escalava o DAS de julho, que carregava os 331.335,00 de nota do JMP.',
      },
    })
    if (APPLY) {
      const { error } = await sb.from('erp_contas_pagar').update({
        descricao: 'Simples Nacional (DAS) ref. agosto/2026 - guia 07.20.26253.9080780-0',
        valor: 14721.81, vencimento: '2026-09-21', emissao: '2026-09-10',
        categoria_id: CAT_IMPOSTOS, centro_custo_id: CC_IMPOSTO, fornecedor_id: P_RECEITA,
        conta_bancaria_id: CONTA_SICOOB, numero_documento: 'imp-ago:simples',
        tags: ['a-pagar', 'imposto', '2026', 'agosto', 'guia-original-conferida'],
        observacoes: (t.observacoes ? t.observacoes + ' ' : '') + TAG + ' Guia recebida em 10/09/2026. '
          + 'DAS 07.20.26253.9080780-0, periodo de apuracao agosto/2026, vencimento 21/09/2026, total R$ 14.721,81. '
          + 'Composicao: IRPJ 5.152,63 + CSLL 2.208,27 + COFINS 2.359,91 + PIS 510,85 + INSS 4.490,15. '
          + 'Junto com o ISSQN de agosto (CP 5feea2f0, 4.873,43, vence 15/09) fecha 19.595,24 de imposto da competencia. '
          + 'CNPJ 34.791.630/0001-43 (BULA ASSESSORIA PECUARIA LTDA).',
      }).eq('id', t.id)
      if (error) throw error
    }
  }
}

// ---------------------------------------------------------------------------
say('\n=== [7] Comissao da Valéria Borges - 1% de 75.300,00 (CONFERENCIA) ===')
// ---------------------------------------------------------------------------
{
  const t = cp(CP_VALERIA)
  say('  CP  ' + String(t.descricao).slice(0, 70))
  say('      valor ' + brl(t.valor) + ' | venc ' + t.vencimento + ' | status ' + t.status + ' | fornecedor ' + (t.fornecedor_id ? 'OK' : 'FALTA'))
  say('      -> JA ESTAVA LANCADO. Nao criar outro.')
  // O titulo estava travado: natureza=em_verificacao, valor_situacao=a_apurar e
  // nao_executar_pagamento=true. A pendencia era "confirmar vigencia do 1% para
  // julho antes de tornar a quantia exigivel" - a regra de 1% conhecida era de
  // 05/08 e o leilao e de 26/07. O chefe destravou isso hoje, mandando os tres
  // lotes e dizendo "ainda temos que pagar 1% disso referentes a vendas da
  // Valeria". Os lotes que ele mandou sao exatamente os do fechamento.
  await fechaApuracao(CP_VALERIA, {
    tipo: 'usuario_atual', data: '2026-09-10',
    ref: 'Conversa Claude Code 10/09/2026 - conciliacao dos extratos Sicoob/Sicredi',
    trecho: '"Ainda temos que pagar 1% disso referentes a vendas da Valeria ajuste isso ai e verifique se ja nao estava." '
      + 'Acompanhado da tabela dos lotes 56 (26.100,00), 71 (23.100,00) e 81 (26.100,00) = 75.300,00, 3 animais, ticket medio 25.100 - '
      + 'identica ao que o fechamento 50bf395a ja registrava. Confirma a vigencia do 1% para a competencia de julho/2026 e torna a quantia exigivel.',
  }, { prazo_situacao: 'regra_confirmada', pagamento_situacao: 'pendente' })
  const EK = 'comissao:50bf395a-fee9-4051-9d00-3a72e3c30cd0:valeria-borges'
  if (t.evento_key === EK) say('      evento_key ja preenchida')
  else {
    say('      evento_key ' + t.evento_key + ' -> ' + EK)
    if (APPLY) {
      const { error } = await sb.from('erp_contas_pagar').update({
        evento_key: EK,
        observacoes: (t.observacoes ? t.observacoes + ' ' : '') + TAG + ' Conferido contra o fechamento 50bf395a '
          + '(23o Leilao Genetica Aditiva - 2a etapa touros, 26/07/2026): lotes 56 (26.100,00), 71 (23.100,00) e 81 (26.100,00) '
          + '= VGV 75.300,00 x 1% = 753,00, os mesmos 3 animais e ticket medio de 25.100 que o chefe mandou. '
          + 'O titulo ja existia desde a geracao do fechamento; faltava a evento_key, sem a qual o gerador de comissoes nao '
          + 'reconhece o titulo e o duplicaria na proxima rodada. Segue EM ABERTO e vencido desde 25/08 - as comissoes de julho '
          + 'da Laila e do Peralta sairam em 02/09 e a da Valéria nao.',
      }).eq('id', t.id)
      if (error) throw error
    }
  }
}

// ---------------------------------------------------------------------------
say('\n=== [8] Repasse do JMP ao Felipe - condicao cumprida ===')
// ---------------------------------------------------------------------------
{
  const t = cp(CP_REPASSE_JMP)
  if (t.vencimento) say('  CP  ' + String(t.descricao).slice(0, 54).padEnd(54) + ' (ja tem vencimento ' + t.vencimento + ')')
  else {
    say('  CP  ' + String(t.descricao).slice(0, 54).padEnd(54) + brl(t.valor).padStart(11) + ' venc null -> 2026-09-10')
    if (APPLY) {
      const { error } = await sb.from('erp_contas_pagar').update({
        vencimento: '2026-09-10', fornecedor_id: t.fornecedor_id || P_FELIPE,
        observacoes: (t.observacoes ? t.observacoes + ' ' : '') + TAG + ' CONDICAO CUMPRIDA: a 2a parcela da JBJ (165.667,50) '
          + 'entrou no Sicredi em 08/09/2026 e foi aplicada no mesmo dia. O titulo estava sem vencimento por ser "apos a segunda parcela"; '
          + 'passa a vencer em 10/09/2026 (data da conciliacao), NAO retroativo a 08/09 para nao nascer vencido. '
          + 'A data efetiva de pagamento e decisao do chefe - ajustar se ele combinar outra. '
          + 'Lembrete do acordo: 165.667,50 - 8.283,37 (metade do ISS) = 157.384,13; sobram 8.283,37 para a Bula. ' + FONTE + '.',
      }).eq('id', t.id)
      if (error) throw error
    }
  }
}

// ---------------------------------------------------------------------------
say('\n=== [9] EAO - religar o CR consolidado ao fechamento ===')
// ---------------------------------------------------------------------------
// Cancelar as duas estimativas do bloco [3] deixou o fechamento das Femeas
// (receita_bula 48.556,50) sem nenhum CR vivo, e o motor da verdade acusou
// "fechamento com receita apurada virou CR de cobranca" FALHANDO. O titulo que
// cobra esse fechamento existe - e a NF639 - mas nasceu com fechamento_id nulo
// porque consolida DOIS eventos e o campo e singular.
{
  const FECH_FEMEAS = '135016c0-c0be-4e28-b80a-7fca4b759d1e'
  const FECH_MACHOS = '6a67f76b-5d50-48fe-9ab1-7eec161c4591'
  const t = cr(CR_EAO_NF639)
  if (t.fechamento_id) say('  CR  NF639 ja aponta para o fechamento ' + String(t.fechamento_id).slice(0, 8))
  else {
    say('  CR  NF639 fechamento_id null -> ' + FECH_FEMEAS.slice(0, 8) + ' (Femeas 11/07)')
    if (APPLY) {
      const { error } = await sb.from('erp_contas_receber').update({
        fechamento_id: FECH_FEMEAS,
        observacoes: (t.observacoes ? t.observacoes + ' ' : '') + TAG + ' Vinculado ao fechamento das Femeas (' + FECH_FEMEAS.slice(0, 8)
          + '), que e o unico dos dois com receita_bula apurada (48.556,50); o das Machos (' + FECH_MACHOS.slice(0, 8) + ') tem receita_bula nula. '
          + 'O campo fechamento_id e singular e esta NF cobre os DOIS eventos do 13o Mega Baviera - a ponte fica declarada aqui. '
          + '⚠ A NF veio 92.324,97 contra 80.058,30 das duas estimativas somadas: 12.266,67 a mais que ninguem explicou ainda. '
          + 'A receita_bula dos fechamentos NAO foi reescrita - ela sai da tabela de performance, e mexer nela mudaria comissao de assessor. '
          + 'Decisao do chefe. ' + FONTE + '.',
      }).eq('id', t.id)
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
  say('  ' + nome.padEnd(28) + brl(c?.saldo_atual).padStart(14) + ' x extrato ' + brl(esperado).padStart(14) + ' -> dif ' + brl(dif))
  return Math.abs(dif) < 0.005
}
const ok1 = conf('Sicoob CC', CONTA_SICOOB, SALDO_SICOOB)
const ok2 = conf('Sicredi CC', CONTA_SICREDI_CC, SALDO_SICREDI_CC)
const ok3 = conf('Sicredi Investimentos', CONTA_SICREDI_INV, SALDO_SICREDI_INV)

const { data: pend } = await sb.from('erp_movimentos_bancarios').select('id,data,valor,descricao').neq('status_conciliacao', 'conciliado')
say('  Movimentos fora de conciliado: ' + (pend?.length ?? 0))
for (const m of pend || []) say('    ' + m.data + ' ' + brl(m.valor).padStart(12) + ' ' + String(m.descricao).slice(0, 62))

if (!APPLY) say('\nDRY-RUN. Use --apply para gravar.')
else if (ok1 && ok2 && ok3 && !(pend?.length)) say('\nOK: as tres contas batem com o extrato e nao ha movimento pendente.')
else say('\n⚠ Conferir: alguma conta nao bate ou ha movimento pendente.')
