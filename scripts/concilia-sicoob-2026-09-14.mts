/**
 * Conciliacao Sicoob 10-14/09/2026 - os 11 lancamentos que entraram depois do
 * extrato das 17:20 de 10/09, e os ajustes que eles provam.
 *
 * Fonte: "sicoob_2026_09_14_18_22_45.pdf" (periodo 01-14/09, saldo final
 * 112.365,03 C), convertido por scripts/sicoob-pdf-para-csv.mjs (validacao por
 * saldo dia a dia OK, 46 lancamentos em 8 dias) e importado por
 * scripts/importa-extrato.mts (11 novos / 35 dedup). O ERP fecha em 0,00.
 *
 * [1] 10/09  pacote de servicos 129,90 e integralizacao de capital 39,00.
 *     Cairam DEPOIS do extrato das 17:20 (que fechava em 204.555,45; o dia
 *     fechou em 204.386,55). Os dois CP ja existiam como projecao de
 *     recorrentes (2421086e e 8bc9933b, em_verificacao/a_apurar) - o extrato e
 *     a fatura que faltava para fechar a apuracao e dar baixa.
 *
 * [2] 11/09  +13.644,98 da E-RURAL (31.793.454/0001-90). Fecha ao centavo tres
 *     titulos: Sorriso Femeas 7.149,98 (NF635, vencido desde 26/08) + Sorriso
 *     Touros 5.670,00 (NF637, venc 18/09) + Bambu 825,00 (NF638, venc 27/09).
 *     Um credito, tres CR -> rateio. O CR do Bambu estava sem cliente; o
 *     pagador e a E-Rural.
 *
 * [3] 11/09  -32.817,50 "metade comissao Rusa Agosto". Os 16 CP do Rusa com
 *     vencimento 25/09 somam 65.635,00 - a metade e EXATAMENTE 32.817,50.
 *     Cada titulo recebe 50% (parcial) e o movimento e rateado nos 16. Dois
 *     deles (Parana lotes 42 e 123, a 5%) estavam a_apurar com
 *     nao_executar_pagamento porque o acordo especifico do Parana nao foi
 *     localizado; o financeiro pagou a metade de um total que os inclui a 5%,
 *     e e essa decisao que fecha a apuracao - a fonte fica registrada.
 *
 * [4] 11/09  -2.997,00 Valeria (66.146.790/0001-26). O CP d02e43d2 valia
 *     753,00 (1% x 75.300, 3 lotes). Ela cobrou 3% x 99.900 (4 lotes: o 15,
 *     de 24.600, ficou fora do ERP por nao ter mensagem formal - ver memoria
 *     valeria-genetica-aditiva-lote-15) e o chefe pagou exatamente isso.
 *     O titulo passa a 2.997,00 com a decisao registrada; o fechamento
 *     50bf395a NAO e reescrito (mexer nele muda comissao de outros).
 *
 * [5] 11/09  -792,00 "comissao venda Raphael Coelho", pago ao CPF do Marcelo
 *     Carneiro (105.096.756-97, Formula do Boi). Nao havia titulo. A unica
 *     conta que fecha exata: 2% x (21.000 lote 07 Perolas Cachoeirao 14/04 +
 *     18.600 lote 10 Nelore MRA 22/04) = 792,00 - as duas compras do Raphael
 *     Coelho no ERP, ambas com assessor Matheus Amormino / Formula do Boi. Mas
 *     as comissoes de abril/maio da Formula do Boi foram acertadas na NF 7
 *     (15.596,00, 26/06); pode ser residual dali ou venda nova (Shopping Nelore
 *     Visual 09-12/09, campanha do proprio Marcelo). CP criado a posteriori,
 *     marcado a-confirmar - a resposta e do chefe.
 *
 * [6] 11/09  -960,00 Lucas Martins (044.510.291-80) = os dois CP de 480,00
 *     (lotes 117 e 16 do 28o Navirai, 1% x 48.000 cada), pagos 14 dias antes
 *     do nominal 25/09. Rateio 480/480.
 *
 * [7] 11/09  -63.500,00 "acordo societario Marcelo retirada trimestral" = CP
 *     3160f623 (distribuicao:marcelo-carneiro:2026-T1). A apuracao estava
 *     obrigacao/a_apurar (memoria de calculo dos 35% nunca conferida). O
 *     pagamento e a decisao do chefe; as pendencias vao para o historico.
 *
 * [8] 14/09  -4.000,00 Facebook "trafego pago" - CP a posteriori, mesmo
 *     padrao dos 02, 04 e 09/09.
 *
 * [9] 14/09  -550,00 ao Joao Eduardo "sistemas Codex" - reembolso da
 *     assinatura OpenAI (em julho foram 525,00 via Formula do Boi). CP criado.
 *     ⚠ 550,00 e tambem o valor da assinatura Anthropic (CP bae817e7, venc
 *     24/09, NAO tocado) - se o memo estiver errado, repontar.
 *
 * [10] 14/09 -50,00 a ***.978.691-**, sem memo e sem cadastro que case.
 *     Fica CLASSIFICADO sem dono, de proposito (regra: sem chute).
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
const TAG = '[CONC 14/09]'
const HOJE = '2026-09-14'
const PDF = 'F:/sicoob_2026_09_14_18_22_45.pdf'
const FONTE = 'Fonte: extrato Sicoob 01-14/09/2026, emitido 14/09/2026 18:22 (sicoob_2026_09_14_18_22_45.pdf), saldo 112.365,03'
const SALDO_SICOOB = 112365.03

const CONTA_SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'

const CAT_COMISSAO_LEIL = 'e74434bd-3366-4015-9268-15d6640cf15f' // receita
const CAT_COMISSAO_ASSESSOR = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'
const CAT_MARKETING = '26762d4e-b517-48b9-98f3-155a6421264e'
const CAT_SOFTWARE = '0edf60f2-bf96-44bd-8f93-ca5432b69830'
const CAT_TARIFAS = 'f8ae3a53-bb4e-414e-97d1-ebdca81df658'
const CAT_INTEGR_CAP = '9e152b58-58ac-48b3-a17d-3b9d4a6acbb2'
const CAT_DISTRIBUICAO = '72478f52-d190-4f09-9c58-802ffc88abca'

const CC_COMISSAO = '52dd8ed0-0c0a-4524-86bd-01dc121487b3'
const CC_MARKETING = '70886cf3-c996-46de-a049-26581b3d08ad'
const CC_DISTRIBUICAO = 'e36a7d0f-55eb-4224-bf6f-312a4931053d'

const P_ERURAL = '7deed7a0-234a-44c8-8000-5b00b90753ed'
const P_RUSA = 'a2c9ec8c-27c0-40f4-a944-0cdcf25c6134'
const P_VALERIA = 'a76f6ee2-76b9-4b87-bc50-b833c69eb29b'
const P_MARCELO = '8fbf5ebf-7181-4f1d-99c2-d19f80c9f92b'
const P_LUCAS_DOC = 'bdb3df6f-c200-4be2-a449-441aea9a0c91' // ficha com CPF (a dos CP e a "Lucas Martins" sem doc)
const P_FACEBOOK = '51ebfcd7-2cb0-4ad0-9052-e73e8f68cc82'
const P_JOAO = '72f9c999-48cc-4d5a-8ab0-9db5fb758418'
const P_SICOOB_TARIFAS = 'e5488a95-aef2-4288-aba6-428c5c5fbdb2'
const P_SICOOB_BANCO = '9641946f-63f1-4c33-b145-e188afc30700'

const CP_PACOTE = '2421086e'
const CP_INTEGR = '8bc9933b'
const CP_VALERIA = 'd02e43d2'
const CP_MARCELO_T1 = '3160f623'
const CP_LUCAS_117 = '4ddd26d7'
const CP_LUCAS_16 = '1ce53653'
const CP_RUSA_MAIOR = '445cd8c9' // 11.250,00 Navirai Camparino lote 5 - o vinculo singular do movimento

const CR_SORRISO_FEM = '54128961'
const CR_SORRISO_TOUROS = '49a2e0d1'
const CR_BAMBU = '0392b9b1'

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100
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
  return todos
}
const todosCP = await carrega('erp_contas_pagar', cacheCP)
await carrega('erp_contas_receber', cacheCR)
const cp = (pref: string) => { const t = cacheCP.get(pref); if (!t) throw new Error('CP nao encontrado: ' + pref); return t }
const cr = (pref: string) => { const t = cacheCR.get(pref); if (!t) throw new Error('CR nao encontrado: ' + pref); return t }

async function movimento(data: string, valor: number, trecho: string) {
  const { data: rows } = await sb.from('erp_movimentos_bancarios')
    .select('id,data,tipo,valor,descricao,status_conciliacao,conta_pagar_id,conta_receber_id,categoria_id,pessoa_id,observacoes')
    .eq('conta_bancaria_id', CONTA_SICOOB).eq('data', data).eq('valor', valor).ilike('descricao', '%' + trecho + '%')
  if (!rows || rows.length !== 1) throw new Error('movimento ambiguo/ausente: ' + data + ' ' + brl(valor) + ' "' + trecho + '" -> ' + (rows?.length ?? 0))
  return rows[0]
}

async function classifica(mov: any, campos: Record<string, any>, nota: string, status: 'conciliado' | 'classificado' = 'conciliado') {
  const obs = String(mov.observacoes || '')
  const novaObs = obs.includes(TAG) ? obs : (obs ? obs + ' ' : '') + TAG + ' ' + nota
  say('  mov ' + mov.data + ' ' + (mov.tipo === 'entrada' ? '+' : '-') + brl(mov.valor).padStart(11) + '  ' + String(mov.descricao).slice(0, 56) + (status !== 'conciliado' ? '  [' + status + ']' : ''))
  if (APPLY) {
    const { error } = await sb.from('erp_movimentos_bancarios')
      .update({ ...campos, status_conciliacao: status, conciliado: true, observacoes: novaObs }).eq('id', mov.id)
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
  const total = r2(jaPago + valorPago)
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
    cacheCP.set(pref, { ...t, status, valor_pago: total, observacoes: obs + ' ' + TAG })
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

async function baixaCR(pref: string, valorReceb: number, dataReceb: string, nota: string) {
  const t = cr(pref)
  const obs = String(t.observacoes || '')
  if (obs.includes(TAG)) { say('  CR  ' + String(t.descricao).slice(0, 54).padEnd(54) + ' (baixa ja dada)'); return t.id }
  const total = r2(Number(t.valor_recebido || 0) + valorReceb)
  const devido = Number(t.valor) - Number(t.desconto || 0)
  const status = total + 0.005 >= devido ? 'recebido' : 'parcial'
  say('  CR  ' + String(t.descricao).slice(0, 54).padEnd(54) + brl(t.valor).padStart(11) + ' -> recebido ' + brl(total).padStart(11) + ' [' + status + ']')
  if (APPLY) {
    const { error } = await sb.from('erp_contas_receber').update({
      status, valor_recebido: total, data_recebimento: dataReceb,
      forma_recebimento: t.forma_recebimento || 'pix',
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
 * a_apurar/em_disputa - de proposito. So se chama quando a prova ENTROU, e a
 * fonte nova fica registrada no proprio campo.
 */
async function fechaApuracao(pref: string, fonte: Record<string, any>, extra: Record<string, any> = {}) {
  const t = cp(pref)
  const a = (t.apuracao && typeof t.apuracao === 'object') ? t.apuracao : {}
  if (a.natureza === 'obrigacao' && a.valor_situacao === 'confirmado' && !a.nao_executar_pagamento) return
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
        ? [{ data: HOJE, encerrada_por: fonte.ref, textos: a.pendencias }] : []),
    ],
  }
  delete nova.nao_executar_pagamento
  say('      apuracao: ' + (a.natureza ?? '-') + '/' + (a.valor_situacao ?? '-') + (a.nao_executar_pagamento ? ' (nao_executar_pagamento)' : '') + ' -> obrigacao/confirmado')
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').update({ apuracao: nova }).eq('id', t.id)
    if (error) throw error
    cacheCP.set(pref, { ...t, apuracao: nova })
  }
}

/** Rateio de um movimento entre varios titulos (CP ou CR). Roda DEPOIS das baixas: o trigger exige baixa >= rateio. */
async function rateia(movId: string, lado: 'conta_pagar_id' | 'conta_receber_id', destinos: Array<[string, number, string]>, criterio: string) {
  const { data: ja } = await sb.from('erp_movimento_rateios').select('id').eq('movimento_id', movId)
  if (ja?.length) { say('      rateio ja registrado (' + ja.length + ' linhas)'); return }
  for (const [, valor, rot] of destinos) say('      rateio ' + brl(valor).padStart(12) + '  -> ' + rot)
  if (!APPLY) return
  const { error } = await sb.from('erp_movimento_rateios').insert(destinos.map(([id, valor]) => ({
    movimento_id: movId, [lado]: id, valor, fundamento: 'documentado',
    evidencia: { criterio, fonte: FONTE, data: HOJE },
  })))
  if (error) throw error
}

const fonteExtrato = (trecho: string) => ({ tipo: 'documento_original', data: HOJE, ref: PDF + ' | Sicoob CC 1.056-1, periodo 01-14/09/2026', trecho })

// ---------------------------------------------------------------------------
say('\n=== [1] SICOOB 10/09 - pacote de servicos 129,90 e integralizacao 39,00 ===')
// ---------------------------------------------------------------------------
{
  const mP = await movimento('2026-09-10', 129.90, 'PACOTE')
  say('  CP  Pacote de servicos')
  await fechaApuracao(CP_PACOTE, fonteExtrato('DEB PACOTE SERVIÇOS - DOC.: 129 - 129,90 D em 10/09/2026.'), { pagamento_situacao: 'informado', prazo_situacao: 'documentado' })
  const idP = await baixaCP(CP_PACOTE, 129.90, '2026-09-10', 'Debito em conta de 10/09 (DOC 129), mesmo valor de junho, julho e agosto. Caiu depois do extrato das 17:20 de 10/09 - por isso o dia fechou em 204.386,55 e nao em 204.555,45. ' + FONTE + '.')
  await classifica(mP, { categoria_id: CAT_TARIFAS, pessoa_id: P_SICOOB_TARIFAS, conta_pagar_id: idP }, 'Pacote mensal de servicos Sicoob. ' + FONTE + '.')

  const mI = await movimento('2026-09-10', 39.00, 'SUBS/INTEG')
  say('  CP  Integralizacao de capital')
  await fechaApuracao(CP_INTEGR, fonteExtrato('DEB.PARC.SUBS/INTEG - DOC.: 46026 - 39,00 D em 10/09/2026.'), { pagamento_situacao: 'informado', prazo_situacao: 'documentado' })
  const idI = await baixaCP(CP_INTEGR, 39.00, '2026-09-10', 'Parcela de subscricao/integralizacao de capital da cooperativa, debitada em 10/09 (DOC 46026), mesmo valor de junho e julho. ' + FONTE + '.')
  await classifica(mI, { categoria_id: CAT_INTEGR_CAP, pessoa_id: P_SICOOB_BANCO, conta_pagar_id: idI }, 'Integralizacao de capital Sicoob (parcela mensal). ' + FONTE + '.')
}

// ---------------------------------------------------------------------------
say('\n=== [2] SICOOB 11/09 +13.644,98 - E-RURAL (Sorriso femeas + touros + Bambu) ===')
// ---------------------------------------------------------------------------
{
  const mov = await movimento('2026-09-11', 13644.98, 'E-RURAL')
  const base = 'PIX da E-RURAL ATIVIDADES DE INTERNET LTDA (31.793.454/0001-90) em 11/09, 13.644,98, que fecha ao centavo tres titulos: '
    + 'Sorriso Femeas 7.149,98 (NF635) + Sorriso Touros 5.670,00 (NF637) + Bambu 825,00 (NF638). ' + FONTE + '.'
  const idF = await baixaCR(CR_SORRISO_FEM, 7149.98, '2026-09-11', base + ' Este titulo vencia em 26/08 (leilao+45d) - recebido 16 dias depois. Os 800,02 abaixo da estimativa de 17/08 continuam sem explicacao pela formula do acordo (ver nota da NF 635).')
  const idT = await baixaCR(CR_SORRISO_TOUROS, 5670.00, '2026-09-11', base + ' Recebido 7 dias antes do vencimento de regra (18/09).')
  const idB = await baixaCR(CR_BAMBU, 825.00, '2026-09-11', base + ' Recebido 16 dias antes do vencimento de regra (27/09). O titulo estava sem cliente: o pagador e a E-Rural (leilao virtual na plataforma dela), cadastro vinculado agora.')
  if (APPLY && !cr(CR_BAMBU).cliente_id) {
    const { error } = await sb.from('erp_contas_receber').update({ cliente_id: P_ERURAL }).eq('id', cr(CR_BAMBU).id)
    if (error) throw error
  }
  await classifica(mov, { categoria_id: CAT_COMISSAO_LEIL, pessoa_id: P_ERURAL, conta_receber_id: idF },
    base + ' Um credito para tres CR: aponta para o das Femeas (o maior) e o rateio faz a divisao exata. Fica em aberto com a E-Rural so o LS Galeria II (57.840,00, venc 21/09).')
  await rateia(mov.id, 'conta_receber_id', [
    [cr(CR_SORRISO_FEM).id, 7149.98, 'Sorriso Femeas 12/07 (NF635)'],
    [cr(CR_SORRISO_TOUROS).id, 5670.00, 'Sorriso Touros 04/08 (NF637)'],
    [cr(CR_BAMBU).id, 825.00, 'Essencia Genetica Bambu 13/08 (NF638)'],
  ], 'PIX unico da E-Rural de 13.644,98 em 11/09 = 7.149,98 + 5.670,00 + 825,00, as tres notas em aberto (635/637/638) exceto o LS Galeria II, que ainda nao foi faturado.')
}

// ---------------------------------------------------------------------------
say('\n=== [3] SICOOB 11/09 -32.817,50 - Rusa, metade de agosto (16 titulos) ===')
// ---------------------------------------------------------------------------
{
  const mov = await movimento('2026-09-11', 32817.50, 'RUSA ASSESSORIA')
  const rusa = todosCP.filter(t => t.fornecedor_id === P_RUSA && t.vencimento === '2026-09-25' && t.status !== 'cancelado' && !t.substituido_por)
    .sort((a, b) => Number(b.valor) - Number(a.valor))
  const total = r2(rusa.reduce((s, t) => s + Number(t.valor), 0))
  say('  ' + rusa.length + ' CP do Rusa com vencimento 25/09 somam ' + brl(total) + ' -> metade ' + brl(total / 2))
  if (Math.abs(total / 2 - 32817.50) > 0.005) throw new Error('a metade dos CP do Rusa nao bate com o PIX de 32.817,50 - conferir antes de gravar')
  if (!rusa.some(t => t.id.startsWith(CP_RUSA_MAIOR))) throw new Error('CP ' + CP_RUSA_MAIOR + ' nao esta entre os do Rusa de 25/09')

  const notaBase = 'PIX de 11/09 a RUSA ASSESSORIA PECUARIA LTDA, "Ref metade comissao Rusa Agosto", 32.817,50 = 50% dos 16 titulos de agosto '
    + '(65.635,00, vencimento 25/09). Cada titulo recebe metade e fica PARCIAL; a outra metade segue em aberto para 25/09. ' + FONTE + '.'
  const destinos: Array<[string, number, string]> = []
  for (const t of rusa) {
    const pref = t.id.slice(0, 8)
    const metade = r2(Number(t.valor) / 2)
    const a = t.apuracao || {}
    if (a.valor_situacao !== 'confirmado' || a.natureza !== 'obrigacao' || a.nao_executar_pagamento) {
      say('  CP  ' + String(t.descricao).slice(0, 54))
      const parana = a.valor_situacao !== 'confirmado'
      await fechaApuracao(pref, fonteExtrato('DB.TR.C.DIF.TIT.INT - FAV.: RUSA ASSESSORIA PECUARIA LTDA - Ref metade comissao Rusa Agosto - 32.817,50 D em 11/09/2026 = 50% de 65.635,00, total dos 16 titulos de agosto incluindo este.'), {
        pagamento_situacao: 'informado',
        decisao_pagamento: parana
          ? 'O financeiro pagou em 11/09 a metade de um total que inclui este lote a 5%. E a decisao que faltava; o acerto especifico do Parana continua sem documento localizado, mas o percentual foi adotado no pagamento.'
          : 'O financeiro pagou em 11/09 a metade do total dos 16 titulos; a trava nao_executar_pagamento cai porque o pagamento e a execucao decidida pelo chefe.',
      })
    }
    await baixaCP(pref, metade, '2026-09-11', notaBase)
    destinos.push([t.id, metade, String(t.descricao).replace('Comissão Gustavo Rusa — ', '').slice(0, 60)])
    // A outra metade continua na curva de 25/09: `pagamento_situacao='informado'`
    // tiraria o titulo inteiro da programacao de saida (src/lib/erp-apuracao.ts,
    // pagamentoNaCurva). Fica 'pendente' com o parcial declarado ao lado.
    const atual = cp(pref).apuracao || {}
    if (atual.pagamento_situacao !== 'pendente' || !atual.pagamento_parcial) {
      const nova = { ...atual, pagamento_situacao: 'pendente', pagamento_parcial: { data: '2026-09-11', valor: metade, restante: r2(Number(t.valor) - metade), vencimento_restante: '2026-09-25', fonte: 'PIX "metade comissao Rusa Agosto" de 11/09' } }
      if (APPLY) {
        const { error } = await sb.from('erp_contas_pagar').update({ apuracao: nova }).eq('id', t.id)
        if (error) throw error
        cacheCP.set(pref, { ...cp(pref), apuracao: nova })
      }
    }
  }
  await classifica(mov, { categoria_id: CAT_COMISSAO_ASSESSOR, centro_custo_id: CC_COMISSAO, pessoa_id: P_RUSA, conta_pagar_id: cp(CP_RUSA_MAIOR).id },
    notaBase + ' O vinculo singular aponta para o maior titulo (Navirai Camparino lote 5, 11.250,00); o rateio nos 16 e o que vale.')
  await rateia(mov.id, 'conta_pagar_id', destinos, 'Metade de cada um dos 16 titulos de comissao do Rusa de agosto/2026 (vencimento 25/09), conforme o memo do PIX "metade comissao Rusa Agosto". Soma dos 16 = 65.635,00; 50% = 32.817,50, o valor do movimento.')
}

// ---------------------------------------------------------------------------
say('\n=== [4] SICOOB 11/09 -2.997,00 - Valeria: 3% x 99.900 (4 lotes), nao 1% x 75.300 ===')
// ---------------------------------------------------------------------------
{
  const mov = await movimento('2026-09-11', 2997.00, 'Valeria')
  const t = cp(CP_VALERIA)
  if (Number(t.valor) === 2997) say('  CP  ' + String(t.descricao).slice(0, 54).padEnd(54) + ' (ja em 2.997,00)')
  else {
    say('  CP  ' + String(t.descricao).slice(0, 54).padEnd(54) + brl(t.valor).padStart(11) + ' -> ' + brl(2997) + ' (3% x 99.900, 4 lotes)')
    if (APPLY) {
      const a = t.apuracao || {}
      const { error } = await sb.from('erp_contas_pagar').update({
        valor: 2997,
        descricao: 'COMISSAO 23º LEILÃO GENÉTICA ADITIVA - 2ª ETAPA TOUROS – 26/07/2026 - VALÉRIA BORGES (3%, 4 lotes)',
        tags: [...new Set([...(t.tags || []), 'percentual-3pct-decisao-chefe', 'lote-15-fora-do-fechamento'])],
        apuracao: {
          ...a,
          fontes: [...(a.fontes || []), fonteExtrato('PIX EMIT.OUTRA IF - 66.146.790 0001-26 - Ref comissao vendas Agosto Valeria - 2.997,00 D em 11/09/2026.'),
            { tipo: 'planilha_do_beneficiario', data: '2026-09-11', ref: 'Tabela enviada pela Valeria em 11/09/2026 (ver memoria valeria-genetica-aditiva-lote-15)', trecho: '4 lotes (15, 56, 71, 81), R$ 99.900,00, 3% = R$ 2.997,00' }],
          lotes: [
            { lote: '15', vgv: 24600, comprador: 'Santini Basso (Bandeirantes/MS)', origem: 'HastaPro FIL 2 LOT_PISTEIRO + grupo Lances (sem mensagem formal)' },
            { lote: '56', vgv: 26100, comprador: 'Thiago Passos' }, { lote: '71', vgv: 23100, comprador: 'Santino Basso' }, { lote: '81', vgv: 26100, comprador: 'Antonio Sergio Passos' },
          ],
          comissao_pct: 0.03,
          valor_anterior: { valor: 753, regra: '1% x 75.300 (3 lotes), Grupo Financeiro 05/08', motivo_substituicao: 'O chefe pagou 3% x 99.900 em 11/09 - o valor cobrado pela Valeria, precedente do Gir e Girolando de 31/05 (3.384,00 a 3%).' },
          pagamento_situacao: 'informado',
        },
        observacoes: (t.observacoes ? t.observacoes + ' ' : '') + TAG + ' VALOR CORRIGIDO 753,00 -> 2.997,00 pelo pagamento. '
          + 'A Valeria cobrou em 11/09 3% sobre 4 lotes (15 + 56 + 71 + 81 = 99.900,00) e o PIX de 11/09 e exatamente 2.997,00. '
          + 'O lote 15 (24.600, Santini Basso) nunca entrou no fechamento 50bf395a porque nao houve mensagem formal "Levamos" - o HastaPro (FIL 2) o da a ela. '
          + 'O percentual de 3% e decisao do chefe manifestada no pagamento (a regra do Grupo Financeiro de 05/08 dizia 1%; o precedente dela e o Gir e Girolando de 31/05, pago a 3%). '
          + 'O fechamento NAO foi reescrito: receita_bula e por_assessor saem da tabela de performance e mexer neles muda comissao de outros assessores. ' + FONTE + '.',
      }).eq('id', t.id)
      if (error) throw error
      cacheCP.set(CP_VALERIA, { ...t, valor: 2997 })
    }
  }
  const id = await baixaCP(CP_VALERIA, 2997.00, '2026-09-11', 'Pago no PIX de 11/09 a 66.146.790/0001-26 (VALERIA BORGES DA SILVA ARAUJO), "Ref comissao vendas Agosto Valeria" - o leilao e de 26/07, pago no ciclo de agosto. ' + FONTE + '.')
  await classifica(mov, { categoria_id: CAT_COMISSAO_ASSESSOR, centro_custo_id: CC_COMISSAO, pessoa_id: P_VALERIA, conta_pagar_id: id },
    'Comissao da Valeria Borges no 23o Genetica Aditiva 2a etapa (26/07): 3% x 99.900 (4 lotes). ' + FONTE + '.')
}

// ---------------------------------------------------------------------------
say('\n=== [5] SICOOB 11/09 -792,00 - "comissao venda Raphael Coelho" ao Marcelo Carneiro (A CONFIRMAR) ===')
// ---------------------------------------------------------------------------
{
  const mov = await movimento('2026-09-11', 792.00, 'Raphael Coelho')
  const id = await criaCP({
    descricao: 'Comissao venda Raphael Coelho - Marcelo Carneiro (Formula do Boi) - A CONFIRMAR origem',
    valor: 792, vencimento: '2026-09-11', emissao: '2026-09-11', status: 'aberto',
    categoria_id: CAT_COMISSAO_ASSESSOR, centro_custo_id: CC_COMISSAO, fornecedor_id: P_MARCELO,
    conta_bancaria_id: CONTA_SICOOB, tags: ['a-pagar', 'comissao', '2026', 'setembro', 'a-confirmar'],
    apuracao: {
      natureza: 'obrigacao', valor_situacao: 'confirmado', pagamento_situacao: 'informado',
      fontes: [fonteExtrato('PIX EMIT.OUTRA IF - Pagamento Pix - ***.096.756-** - Ref comissao venda Raphael Coelho - 792,00 D em 11/09/2026.')],
      pendencias: ['Identificar a venda: nao ha titulo, fechamento nem mensagem de grupo de agosto/setembro com Raphael Coelho. Hipotese aritmetica (fecha exato): 2% x (21.000 lote 07 Perolas Cachoeirao 14/04 + 18.600 lote 10 Nelore MRA 22/04) = 792,00 - as duas compras do Raphael Coelho no ERP, assessor Matheus Amormino / Formula do Boi. Mas as comissoes de abril/maio da Formula do Boi foram acertadas na NF 7 (15.596,00, 26/06). Alternativa: venda nova no Shopping Nelore Visual (09-12/09), campanha do proprio Marcelo. Confirmar com o chefe.'],
    },
    observacoes: 'Lancado a posteriori a partir do extrato: PIX de 11/09 ao CPF ***.096.756-** (Marcelo Carneiro Lucas Pereira, 105.096.756-97, Formula do Boi) com memo "comissao venda Raphael Coelho". '
      + 'Nenhum titulo, fechamento ou mensagem de grupo recente cita essa venda. O unico Raphael Coelho do ERP comprou dois lotes em abril (Perolas Cachoeirao lt 07, 21.000; Nelore MRA lt 10, 18.600), '
      + 'ambos por Matheus Amormino / Formula do Boi, e 2% x 39.600 = 792,00 exato - mas abril/maio da Formula do Boi ja foram acertados na NF 7 de 26/06 (15.596,00). '
      + 'Pode ser residual daquele acerto ou venda nova (Shopping Nelore Visual, 09-12/09). Registrado como pago; a ORIGEM e pergunta para o chefe. ' + FONTE + '.',
  }, 'com-2026-09-11:marcelo-carneiro:raphael-coelho')
  if (id) await baixaCP(String(id).slice(0, 8), 792, '2026-09-11', 'Pago no PIX de 11/09. ' + FONTE + '.')
  await classifica(mov, { categoria_id: CAT_COMISSAO_ASSESSOR, centro_custo_id: CC_COMISSAO, pessoa_id: P_MARCELO, ...(id ? { conta_pagar_id: id } : {}) },
    'Comissao "venda Raphael Coelho" paga ao Marcelo Carneiro - origem da venda A CONFIRMAR (ver o CP). ' + FONTE + '.')
}

// ---------------------------------------------------------------------------
say('\n=== [6] SICOOB 11/09 -960,00 - Lucas Martins (lotes 117 e 16 do 28o Navirai) ===')
// ---------------------------------------------------------------------------
{
  const mov = await movimento('2026-09-11', 960.00, 'Lucas Martins')
  const nota = 'PIX de 11/09 a ***.510.291-** (Lucas Martins Duraes Braganca, 044.510.291-80), "Ref comissao Lucas Martins Agosto", 960,00 = 480,00 + 480,00 '
    + '(lotes 117 e 16 do 28o Navirai Camparino de 23/08, 1% x 48.000 cada). Pago 14 dias antes do nominal 25/09. ' + FONTE + '.'
  const id117 = await baixaCP(CP_LUCAS_117, 480, '2026-09-11', nota)
  const id16 = await baixaCP(CP_LUCAS_16, 480, '2026-09-11', nota)
  await classifica(mov, { categoria_id: CAT_COMISSAO_ASSESSOR, centro_custo_id: CC_COMISSAO, pessoa_id: P_LUCAS_DOC, conta_pagar_id: id117 },
    nota + ' Cobre os DOIS titulos; aponta para o do lote 117 e o rateio divide. Pessoa = a ficha com CPF (os CP apontam para a ficha "Lucas Martins" sem documento - cadastro duplicado, fusao pendente).')
  await rateia(mov.id, 'conta_pagar_id', [[id117, 480, 'Navirai 23/08 lote 117'], [id16, 480, 'Navirai 23/08 lote 16']],
    'PIX unico de 960,00 quitando os dois titulos de 480,00 do Lucas Martins (competencia agosto/2026).')
}

// ---------------------------------------------------------------------------
say('\n=== [7] SICOOB 11/09 -63.500,00 - Marcelo, 35% do lucro, 1o trimestre ===')
// ---------------------------------------------------------------------------
{
  const mov = await movimento('2026-09-11', 63500.00, 'acordo societario Marcelo')
  say('  CP  ' + String(cp(CP_MARCELO_T1).descricao).slice(0, 70))
  await fechaApuracao(CP_MARCELO_T1, fonteExtrato('PIX EMIT.OUTRA IF - Pagamento Pix - ***.096.756-** - Ref acordo societario Marcelo retirada trimestral - 63.500,00 D em 11/09/2026.'), {
    pagamento_situacao: 'informado', prazo_situacao: 'documentado',
    decisao_pagamento: 'Pago em 11/09/2026 pelo valor que o proprio Marcelo apresentou em 02/09 (63.500,00). A memoria de calculo dos 35% sobre o lucro do trimestre jun-ago nunca foi conferida de forma independente (a reapuracao de 21/08 dava 44.286,20); o pagamento e a decisao do chefe e encerra a pendencia como obrigacao - a conferencia do calculo vira assunto de DRE, nao de caixa.',
  })
  const id = await baixaCP(CP_MARCELO_T1, 63500, '2026-09-11', 'Pago no PIX de 11/09 ao CPF ***.096.756-** (Marcelo Carneiro Lucas Pereira), "Ref acordo societario Marcelo retirada trimestral". '
    + 'O relatorio de fluxo de 10/09 dizia que os 63.500 nao cabiam sem cortar 31.367,23 de outros compromissos; o chefe pagou no dia seguinte ao EAO e ao Mafra. ' + FONTE + '.')
  await classifica(mov, { categoria_id: CAT_DISTRIBUICAO, centro_custo_id: CC_DISTRIBUICAO, pessoa_id: P_MARCELO, conta_pagar_id: id },
    'Remuneracao de socio - Marcelo Carneiro - 35% do lucro, 1o trimestre (jun-ago/2026). Nao e despesa da operacao: grupo de DRE "distribuicao". ' + FONTE + '.')
}

// ---------------------------------------------------------------------------
say('\n=== [8] SICOOB 14/09 -4.000,00 - Facebook, trafego pago ===')
// ---------------------------------------------------------------------------
{
  const mov = await movimento('2026-09-14', 4000.00, 'trafego pago')
  const id = await criaCP({
    descricao: 'Marketing - trafego pago (Facebook Ads) - 14/09',
    valor: 4000, vencimento: '2026-09-14', emissao: '2026-09-14', status: 'aberto',
    categoria_id: CAT_MARKETING, centro_custo_id: CC_MARKETING, fornecedor_id: P_FACEBOOK,
    conta_bancaria_id: CONTA_SICOOB, tags: ['a-pagar', 'marketing', '2026', 'setembro'],
    apuracao: { natureza: 'obrigacao', valor_situacao: 'confirmado', pagamento_situacao: 'informado', fontes: [fonteExtrato('PIX EMIT.OUTRA IF - 13.347.016 0001-17 - Ref trafego pago - 4.000,00 D em 14/09/2026.')], pendencias: [] },
    observacoes: 'Lancado a posteriori a partir do extrato, mesmo padrao dos 2.500,00 de 02 e 04/09 e dos 1.000,00 de 09/09. O memo nao diz a campanha ("Ref trafego pago"); a semana teve Shopping Nelore Visual (12/09) e Touros AZ (12/09). ' + FONTE + '.',
  }, 'mkt-2026-09-14:facebook-trafego')
  if (id) await baixaCP(String(id).slice(0, 8), 4000, '2026-09-14', 'Pago no PIX de 14/09 ao Facebook (13.347.016/0001-17). ' + FONTE + '.')
  await classifica(mov, { categoria_id: CAT_MARKETING, centro_custo_id: CC_MARKETING, pessoa_id: P_FACEBOOK, ...(id ? { conta_pagar_id: id } : {}) },
    'Trafego pago (Facebook Ads), campanha nao declarada no memo. ' + FONTE + '.')
}

// ---------------------------------------------------------------------------
say('\n=== [9] SICOOB 14/09 -550,00 - "sistemas Codex", reembolso ao Joao Eduardo ===')
// ---------------------------------------------------------------------------
{
  const mov = await movimento('2026-09-14', 550.00, 'sistemas Codex')
  const id = await criaCP({
    descricao: 'Assinatura Codex / ChatGPT (OpenAI) - reembolso Joao Eduardo',
    valor: 550, vencimento: '2026-09-14', emissao: '2026-09-14', status: 'aberto',
    categoria_id: CAT_SOFTWARE, fornecedor_id: P_JOAO, conta_bancaria_id: CONTA_SICOOB,
    tags: ['a-pagar', '2026', 'setembro', 'software'],
    apuracao: { natureza: 'obrigacao', valor_situacao: 'confirmado', pagamento_situacao: 'informado', fontes: [fonteExtrato('PIX EMIT.OUTRA IF - ***.037.156-** - Ref sistemas Codex - 550,00 D em 14/09/2026.')], pendencias: [] },
    observacoes: 'Lancado a posteriori a partir do extrato: PIX de 14/09 ao CPF ***.037.156-** (Joao Eduardo, o mesmo dos reembolsos de Anthropic 24/08, Vercel 28/08 e banco de dados 18/08) com memo "sistemas Codex". '
      + 'Em julho a assinatura da OpenAI foi 525,00 via Formula do Boi (CP 2b4d042a). ⚠ 550,00 e tambem o valor da assinatura Anthropic/Claude, cujo CP de setembro (bae817e7, venc 24/09) NAO foi tocado - se o memo estiver trocado, repontar este pagamento para la. ' + FONTE + '.',
  }, 'sicoob14:assinatura-codex-openai')
  if (id) await baixaCP(String(id).slice(0, 8), 550, '2026-09-14', 'Pago no PIX de 14/09. ' + FONTE + '.')
  await classifica(mov, { categoria_id: CAT_SOFTWARE, pessoa_id: P_JOAO, ...(id ? { conta_pagar_id: id } : {}) },
    'Reembolso ao Joao Eduardo da assinatura Codex/ChatGPT (OpenAI) - infraestrutura do sistema. ' + FONTE + '.')
}

// ---------------------------------------------------------------------------
say('\n=== [10] SICOOB 14/09 -50,00 - ***.978.691-**, sem memo e sem cadastro ===')
// ---------------------------------------------------------------------------
{
  const mov = await movimento('2026-09-14', 50.00, '978.691')
  // Nenhuma regra fecha: CPF mascarado nao casa com pessoa alguma e o PIX nao
  // tem referencia. Fica classificado sem dono, de proposito (sem chute).
  await classifica(mov, {}, 'PIX de 50,00 em 14/09 a ***.978.691-**, sem memo. O CPF nao casa com nenhum cadastro e nao ha titulo. SEM DONO de proposito - identificar com o chefe antes de classificar. ' + FONTE + '.', 'classificado')
}

// ---------------------------------------------------------------------------
say('\n=== VERIFICACAO ===')
// ---------------------------------------------------------------------------
const { data: contas } = await sb.from('erp_contas_bancarias').select('id,nome,saldo_atual').order('nome')
let total = 0
for (const c of contas || []) { total += Number(c.saldo_atual || 0); say('  ' + String(c.nome).padEnd(46) + brl(c.saldo_atual).padStart(14)) }
say('  ' + 'CAIXA TOTAL'.padEnd(46) + brl(total).padStart(14))
const sic = (contas || []).find(x => x.id === CONTA_SICOOB)
const dif = Number(sic?.saldo_atual || 0) - SALDO_SICOOB
say('  Sicoob x extrato 18:22: ' + brl(sic?.saldo_atual) + ' x ' + brl(SALDO_SICOOB) + ' -> dif ' + brl(dif))
const { data: pend } = await sb.from('erp_movimentos_bancarios').select('id,data,valor,descricao,status_conciliacao').neq('status_conciliacao', 'conciliado')
say('  Movimentos fora de conciliado: ' + (pend?.length ?? 0))
for (const m of pend || []) say('    ' + m.data + ' ' + brl(m.valor).padStart(12) + ' [' + m.status_conciliacao + '] ' + String(m.descricao).slice(0, 60))

if (!APPLY) say('\nDRY-RUN. Use --apply para gravar.')
else if (Math.abs(dif) < 0.005) say('\nOK: Sicoob bate com o extrato. ' + (pend?.length ? 'Resta ' + pend.length + ' movimento(s) sem dono (esperado: o PIX de 50,00).' : 'Nenhum movimento pendente.'))
else say('\n⚠ Conferir: o Sicoob nao bate com o extrato.')
