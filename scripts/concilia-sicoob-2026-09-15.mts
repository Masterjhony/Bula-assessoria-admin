/**
 * Conciliacao Sicoob 15/09/2026 - os 4 lancamentos do dia que entraram depois
 * do extrato de 14/09 18:22, mais o titulo a receber da Colonial (NF 643) e o
 * hotel do Joao em BH, que os documentos do dia provam.
 *
 * Fonte: "sicoob_2026_09_15_18_57_35.pdf" (periodo 01-15/09, saldo final
 * 106.653,78 C), convertido por scripts/sicoob-pdf-para-csv.mjs (validacao por
 * saldo dia a dia OK, 50 lancamentos em 9 dias) e importado por
 * scripts/importa-extrato.mts (4 novos / 46 dedup). O ERP fecha em 0,00.
 * ⚠ Extrato do mesmo dia e parcial por definicao (ver conciliacao-2026-09-10):
 * o que cair depois das 18:57 so aparece no proximo.
 *
 * [1] 15/09  -4.873,43 DEB.CONV.PREFEITURA - REF ISSQN. E a guia 1786806 do
 *     ISSQN de agosto (DAM ISS AVULSO 08-2026), CP 5feea2f0, ja com apuracao
 *     obrigacao/confirmado desde 09/09 (guia original conferida). Debito
 *     automatico no vencimento. Baixa integral.
 *
 * [2] 15/09  -122,60 e -62,04 DEB. CONV. SEGUROS. Os dois CP (1c884cd6 e
 *     598b7193) existiam desde 17/08 pelo bloco "Lancamentos futuros" do
 *     extrato daquele dia, sem fornecedor. Mesmo par de valores de 17/08.
 *     Baixa integral; fornecedor passa a ser o Sicoob (banco).
 *
 * [3] 15/09  -653,18 PIX ao Joao Eduardo "pagamento estadia Leo BH cartao
 *     joao". Documento: F:/reserva Leo.pdf = confirmacao Booking.com
 *     5249.952.565, Hotel Abba Uno (Betim/MG), 16-18/09, hospede Leonardo
 *     Serafim, 1 adulto, pre-pagamento: 622,08 + 5% ISS 31,10 = 653,18 EXATO.
 *     Pago no cartao do Joao e reembolsado pela Bula no mesmo dia. CP criado a
 *     posteriori. O evento da viagem nao esta no memo: as passagens ADN de
 *     14/09 (Sinop -> Belo Horizonte -> Maringa -> Sinop, CP 92f31e0f/8ecd17fb/
 *     5aa395e5) mostram que a viagem e real; a agenda de 17/09 tem o "1o Leilao
 *     Fazenda Bela Aurora" sem local cadastrado. Hipotese, nao afirmacao.
 *
 * [4] Hotel do PROPRIO Joao em BH: F:/confirmacao hotel.pdf = Booking.com
 *     6034.917.103, Hotel Continental (Av. Parana 241, Centro, BH), 16-18/09,
 *     hospede Joao Eduardo Lucas Pereira, 484,46 + 5% ISS 24,22 = 508,68,
 *     "nao e necessario pre-pagamento" (paga no hotel, no check-out 18/09).
 *     Nao saiu do banco ainda: vira CP ABERTO com vencimento 18/09, valor
 *     confirmado pela reserva, com a pendencia declarada de confirmar que e
 *     despesa da Bula (mesma viagem do Leonardo).
 *
 * [5] COLONIAL AGROPECUARIA LTDA (22.681.381/0004-05, Fazenda Colonial,
 *     Verdelandia/MG) - NF 643/U emitida 15/09/2026 14:43, competencia
 *     09/2026, R$ 11.340,00, ISS 5% 567,00 nao retido, "REFERENTE AO LEILAO
 *     PEPITAS COLONIAL EXPOGENETICA DIA 22/08/2026". PDF chegou pela Ana Paula
 *     as 18:50 (operational_items 9c61abab, bucket whatsapp-media). O Aurelio
 *     (Colonial) escreveu as 13:07: "Incluindo os lotes que faltam, a comissao
 *     ficou no valor de R$ 11.340,00" - o mesmo numero fechado lote a lote em
 *     11/09 (memoria colonial-janauba-agosto-2026-conferencia): 378.000 x 3%,
 *     sendo 117.000 do 12o Noite Nacional (21/08, lotes 18/19/24) + 261.000 do
 *     4o Pepitas (22/08, lotes 9/19/24/25/26/27/32/33/37, lote 19 a 22.500).
 *     ⚠ A NF descreve so o Pepitas 22/08, mas o valor cobre os DOIS pregoes.
 *     Nao havia CR nem cadastro da Colonial. O Joao informou em 15/09 que o
 *     pagamento "deve ocorrer amanha (16/09)" - e a data do titulo, marcada
 *     como informada, nao como acordo assinado. O CR aponta para o fechamento
 *     do Pepitas (8d11a2ff, o da NF); o do Noite Nacional (7904f010) fica na
 *     observacao - fechamento_id e singular, mesmo caso da NF 639.
 *     Os dois fechamentos tem receita_bula = 0 e sem acordo_pct: nada e
 *     reescrito neles. A planilha-mestra (aba Leiloes) ainda traz 5.850 +
 *     9.765 = 15.615 EM FECHAMENTO: 4.275 acima da NF, porque soma lotes de
 *     outros vendedores (Terra Boa lt 29, ZAN lt 53, Agropontieri lt 54) e o
 *     lote 19 a 27.000. Esses 138.000 x 3% = 4.140 sao cobranca a parte, sem
 *     acordo - ficam como pendencia, nao como titulo.
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
const TAG = '[CONC 15/09]'
const HOJE = '2026-09-15'
const PDF = 'F:/sicoob_2026_09_15_18_57_35.pdf'
const FONTE = 'Fonte: extrato Sicoob 01-15/09/2026, emitido 15/09/2026 18:57 (sicoob_2026_09_15_18_57_35.pdf), saldo 106.653,78'
const SALDO_SICOOB = 106653.78

const CONTA_SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'

const CAT_IMPOSTOS = '6d3270c8-2680-4cdd-a709-5b1520d1f430'
const CAT_SEGUROS = '4e96d8bf-f4f7-47d9-8d1b-f8035e7be97e'
const CAT_VIAGEM = '98083139-0fbf-487a-9988-a08519ebf259' // Viagem/Passagens (custo direto) - mesmo das hospedagens Villa Cerrado
const CAT_COMISSAO_LEIL = 'e74434bd-3366-4015-9268-15d6640cf15f' // receita

const CC_IMPOSTO = 'ccca82b8-5852-4fbd-8d50-c37a3c5804f5'
const CC_HOSPEDAGEM = '34a12f8d-c91c-474d-9d58-943d31c4b181'

const P_PREFEITURA = 'b3d7d5e3-54a3-490f-a8a8-0aee1fffe969'
const P_SICOOB_BANCO = '9641946f-63f1-4c33-b145-e188afc30700'
const P_JOAO = '72f9c999-48cc-4d5a-8ab0-9db5fb758418'

const CP_ISSQN = '5feea2f0'
const CP_SEG_122 = '1c884cd6'
const CP_SEG_62 = '598b7193'

const FECH_PEPITAS = '8d11a2ff-1164-4dfe-941e-99dd43f023cc'
const FECH_PREMIUM = '7904f010-0493-4505-944f-3a9f1d34de16'

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100
const say = (s: string) => console.log(s)

const cacheCP = new Map<string, any>()
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
await carrega('erp_contas_pagar', cacheCP)
const cp = (pref: string) => { const t = cacheCP.get(pref); if (!t) throw new Error('CP nao encontrado: ' + pref); return t }

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

async function baixaCP(pref: string, valorPago: number, dataPag: string, nota: string, extra: Record<string, any> = {}) {
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
    const a = (t.apuracao && typeof t.apuracao === 'object') ? t.apuracao : {}
    const fontes = Array.isArray(a.fontes) ? a.fontes : []
    const fonte = fonteExtrato(String(t.descricao).slice(0, 60) + ' - ' + brl(valorPago) + ' D em ' + dataPag.split('-').reverse().join('/') + '.')
    const apuracao = { ...a, pagamento_situacao: 'informado', fontes: fontes.some((f: any) => f?.ref === fonte.ref) ? fontes : [...fontes, fonte] }
    const { error } = await sb.from('erp_contas_pagar').update({
      status, valor_pago: total, data_pagamento: dataPag,
      forma_pagamento: t.forma_pagamento || 'debito_automatico',
      conta_bancaria_id: t.conta_bancaria_id || CONTA_SICOOB,
      apuracao,
      ...extra,
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

const fonteExtrato = (trecho: string) => ({ tipo: 'documento_original', data: HOJE, ref: PDF + ' | Sicoob CC 1.056-1, periodo 01-15/09/2026', trecho })

// ---------------------------------------------------------------------------
say('\n=== [1] SICOOB 15/09 -4.873,43 - ISSQN agosto/2026 (guia 1786806) ===')
// ---------------------------------------------------------------------------
{
  const mov = await movimento('2026-09-15', 4873.43, 'ISSQN')
  const t = cp(CP_ISSQN)
  const a = t.apuracao || {}
  if (a.natureza !== 'obrigacao' || a.valor_situacao !== 'confirmado') throw new Error('ISSQN: apuracao nao esta fechada (' + a.natureza + '/' + a.valor_situacao + ') - conferir antes de baixar')
  if (Math.abs(Number(t.valor) - 4873.43) > 0.005) throw new Error('ISSQN: valor do CP (' + brl(t.valor) + ') difere do debito')
  const id = await baixaCP(CP_ISSQN, 4873.43, '2026-09-15',
    'Debito automatico em conta no vencimento (DEB.CONV.PREFEITURA - REF ISSQN, DOC 3066829), 4.873,43 = exatamente a guia 1786806 (DAM ISS AVULSO 08/2026) conferida em 09/09. ' + FONTE + '.',
    { fornecedor_id: t.fornecedor_id || P_PREFEITURA, centro_custo_id: t.centro_custo_id || CC_IMPOSTO })
  await classifica(mov, { categoria_id: CAT_IMPOSTOS, centro_custo_id: CC_IMPOSTO, pessoa_id: P_PREFEITURA, conta_pagar_id: id },
    'ISSQN de agosto/2026, guia 1786806, debitado em conta no vencimento. Com o DAS de 21/09 (14.721,81) fecha o imposto da competencia de agosto em 19.595,24. ' + FONTE + '.')
}

// ---------------------------------------------------------------------------
say('\n=== [2] SICOOB 15/09 -122,60 e -62,04 - seguros Sicoob (debito automatico) ===')
// ---------------------------------------------------------------------------
for (const [pref, valor] of [[CP_SEG_122, 122.60], [CP_SEG_62, 62.04]] as Array<[string, number]>) {
  const mov = await movimento('2026-09-15', valor, 'SEGUROS')
  const t = cp(pref)
  if (Math.abs(Number(t.valor) - valor) > 0.005) throw new Error('seguro ' + pref + ': valor do CP difere')
  const id = await baixaCP(pref, valor, '2026-09-15',
    'Debito automatico "DEB. CONV. SEGUROS" (SICOOB SEG) em 15/09, mesmo par de valores de 17/08 (122,60 + 62,04). O CP nasceu em 17/08 pelo bloco "Lancamentos futuros" daquele extrato. ' + FONTE + '.',
    { fornecedor_id: t.fornecedor_id || P_SICOOB_BANCO })
  await classifica(mov, { categoria_id: CAT_SEGUROS, pessoa_id: P_SICOOB_BANCO, conta_pagar_id: id },
    'Seguro Sicoob (convenio), debito mensal automatico. ' + FONTE + '.')
}

// ---------------------------------------------------------------------------
say('\n=== [3] SICOOB 15/09 -653,18 - estadia do Leonardo em BH (Hotel Abba Uno), reembolso ao Joao ===')
// ---------------------------------------------------------------------------
{
  const mov = await movimento('2026-09-15', 653.18, 'estadia Leo')
  const id = await criaCP({
    descricao: 'Hospedagem Leonardo Serafim - Hotel Abba Uno (Betim/MG) 16-18/09 - Booking 5249.952.565 - reembolso Joao Eduardo (cartao)',
    valor: 653.18, vencimento: '2026-09-15', emissao: '2026-09-15', status: 'aberto',
    categoria_id: CAT_VIAGEM, centro_custo_id: CC_HOSPEDAGEM, fornecedor_id: P_JOAO,
    conta_bancaria_id: CONTA_SICOOB, tags: ['a-pagar', '2026', 'setembro', 'viagem', 'hospedagem', 'reembolso'],
    apuracao: {
      natureza: 'obrigacao', valor_situacao: 'confirmado', pagamento_situacao: 'informado', prazo_situacao: 'documentado',
      fontes: [
        fonteExtrato('PIX EMIT.OUTRA IF - Pagamento Pix - ***.037.156-** - Ref pagamento estadia Leo BH cartao joao - 653,18 D em 15/09/2026.'),
        { tipo: 'documento_original', data: HOJE, ref: 'F:/reserva Leo.pdf | Booking.com confirmacao 5249.952.565, PIN 5239', trecho: 'Hotel Abba Uno, Rua Araticum 151, Betim/MG. Entrada 16/09/2026 (a partir das 15:00), saida 18/09/2026, 1 quarto / 2 diarias, hospede Leonardo Serafim, 1 adulto. Preco: 1 quarto 622,08 + 5% ISS 31,10 = R$ 653,18. Pre-pagamento do preco total cobrado no cartao.' },
      ],
      pendencias: ['Evento da viagem nao declarado no memo nem na reserva. As passagens ADN de 14/09 (Sinop -> Belo Horizonte -> Maringa -> Sinop) confirmam a viagem do Leonardo; a agenda de 17/09 tem o 1o Leilao Fazenda Bela Aurora sem local cadastrado. Vincular ao evento quando o fechamento existir.'],
    },
    observacoes: 'Lancado a posteriori a partir do extrato: PIX de 15/09 ao CPF ***.037.156-** (Joao Eduardo) com memo "pagamento estadia Leo BH cartao joao". '
      + 'A confirmacao Booking 5249.952.565 (F:/reserva Leo.pdf, baixada 15/09 17:07) fecha ao centavo: Hotel Abba Uno, Betim/MG, 16-18/09, hospede Leonardo Serafim, 622,08 + ISS 31,10 = 653,18, pre-pago no cartao. '
      + 'E despesa de viagem de assessor (mesmo tratamento das hospedagens do Villa Cerrado), reembolsada ao Joao no mesmo dia. ' + FONTE + '.',
  }, 'sicoob15:hospedagem-leonardo-abba-uno-betim-2026-09-16')
  if (id) await baixaCP(String(id).slice(0, 8), 653.18, '2026-09-15', 'Pago no PIX de 15/09 ao Joao Eduardo (reembolso do cartao). ' + FONTE + '.', { forma_pagamento: 'pix' })
  await classifica(mov, { categoria_id: CAT_VIAGEM, centro_custo_id: CC_HOSPEDAGEM, pessoa_id: P_JOAO, ...(id ? { conta_pagar_id: id } : {}) },
    'Reembolso ao Joao Eduardo da hospedagem do Leonardo Serafim em Betim/MG (Hotel Abba Uno, 16-18/09, Booking 5249.952.565), paga no cartao dele. ' + FONTE + '.')
}

// ---------------------------------------------------------------------------
say('\n=== [4] Hotel do Joao em BH (Hotel Continental, 16-18/09) - 508,68, paga no check-out ===')
// ---------------------------------------------------------------------------
{
  await criaCP({
    descricao: 'Hospedagem Joao Eduardo - Hotel Continental (Centro, Belo Horizonte/MG) 16-18/09 - Booking 6034.917.103 - pagamento no hotel',
    valor: 508.68, vencimento: '2026-09-18', emissao: '2026-09-15', status: 'aberto',
    categoria_id: CAT_VIAGEM, centro_custo_id: CC_HOSPEDAGEM, fornecedor_id: null,
    conta_bancaria_id: CONTA_SICOOB, tags: ['a-pagar', '2026', 'setembro', 'viagem', 'hospedagem', 'reserva-confirmada'],
    apuracao: {
      natureza: 'obrigacao', valor_situacao: 'confirmado', pagamento_situacao: 'pendente', prazo_situacao: 'documentado',
      previsao_mes: '2026-09-01',
      fontes: [
        { tipo: 'documento_original', data: HOJE, ref: 'F:/confirmacao hotel.pdf | Booking.com confirmacao 6034.917.103, PIN 9587', trecho: 'Hotel Continental - Proximo ao Mercado Central, Av. Parana 241, Centro, Belo Horizonte/MG. Entrada 16/09/2026 (a partir das 14:00), saida 18/09/2026 (ate 12:00), 1 quarto duplo deluxe / 2 diarias, hospede Joao Eduardo Lucas Pereira, 1 adulto. Preco: 484,46 + 5% ISS 24,22 = R$ 508,68. "Nao e necessario pre-pagamento"; cancelamento gratuito ate 15/09 16:10.' },
      ],
      pendencias: ['Confirmar que a estadia do Joao em BH e despesa da Bula (mesma viagem do Leonardo, reserva no e-mail pessoal). O pagamento sera no hotel, provavelmente no cartao e reembolsado depois - o CP existe para o caixa enxergar a saida de 18/09.'],
    },
    observacoes: 'Lancado a partir da confirmacao Booking 6034.917.103 (F:/confirmacao hotel.pdf, baixada 15/09 16:11): Hotel Continental, Belo Horizonte, 16-18/09, hospede Joao Eduardo, 484,46 + ISS 24,22 = 508,68, sem pre-pagamento. '
      + 'Mesma viagem em que a estadia do Leonardo (Betim, 653,18) foi paga e reembolsada em 15/09. Nao ha debito bancario ainda: titulo aberto para o vencimento do check-out (18/09).',
  }, 'booking:6034.917.103:hotel-continental-bh-2026-09-16')
}

// ---------------------------------------------------------------------------
say('\n=== [5] COLONIAL AGROPECUARIA - NF 643 (11.340,00) - CR com data informada 16/09 ===')
// ---------------------------------------------------------------------------
{
  // pessoa
  let pessoaId: string | null = null
  const { data: pj } = await sb.from('erp_pessoas').select('id,nome,documento').ilike('documento', '%22.681.381%')
  if (pj?.length) { pessoaId = pj[0].id; say('  pessoa ' + pj[0].nome + ' (ja existia)') }
  else {
    say('  pessoa+ COLONIAL AGROPECUARIA LTDA 22.681.381/0004-05 [criada]')
    if (APPLY) {
      const { data, error } = await sb.from('erp_pessoas').insert({
        tipo: 'pj', nome: 'COLONIAL AGROPECUARIA LTDA', razao_social: 'COLONIAL AGROPECUARIA LTDA', documento: '22.681.381/0004-05',
        endereco: 'Fazenda Colonial - Estrada Vila Nova de Pocoes', cidade: 'Verdelandia', uf: 'MG', cep: '39458-000',
        is_cliente: true, is_fornecedor: false, ativo: true,
        observacoes: 'Criador (Nelore), leiloes pela Programa Leiloes. Fazenda Colonial, Insc. 001.098.541-0540. Contato financeiro: Aurelio (WhatsApp +55 38 8825-0047, fora da allowlist do VPS). Cadastro criado em 15/09/2026 a partir da NF 643.',
      }).select('id').single()
      if (error) throw error
      pessoaId = data!.id
    }
  }

  const DOC = 'BULA-2026-CR-COLONIAL-NF643'
  const { data: ja } = await sb.from('erp_contas_receber').select('id,descricao,valor,vencimento,status').eq('numero_documento', DOC).maybeSingle()
  if (ja) say('  CR  ' + String(ja.descricao).slice(0, 54).padEnd(54) + brl(ja.valor).padStart(11) + ' (ja existia, venc ' + ja.vencimento + ', ' + ja.status + ')')
  else {
    say('  CR+ Colonial Agropecuaria - NF 643 - 21/08 + 22/08'.padEnd(58) + brl(11340).padStart(11) + ' [criado, venc 16/09]')
    if (APPLY) {
      const { error } = await sb.from('erp_contas_receber').insert({
        descricao: 'COLONIAL AGROPECUARIA - 12o Noite Nacional Matrizes Premium (21/08) + 4o Pepitas Colonial Expogenetica (22/08) - COMISSAO BULA - NF 643',
        cliente_id: pessoaId, categoria_id: CAT_COMISSAO_LEIL, conta_bancaria_id: CONTA_SICOOB,
        valor: 11340, desconto: 0, juros: 0, multa: 0, valor_recebido: 0,
        emissao: '2026-09-15', vencimento: '2026-09-16', status: 'aberto', forma_recebimento: 'pix',
        numero_documento: DOC, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
        nota_fiscal: '643', fechamento_id: FECH_PEPITAS, origem: 'real',
        tags: ['a-receber', '2026', 'setembro', 'leilao', 'nf-643', 'nf-confirmada', 'data-informada-chefe', 'conferencia-lote-a-lote'],
        observacoes: '[CONC 15/09] NF 643/U emitida 15/09/2026 14:43:11 (competencia 09/2026), tomador COLONIAL AGROPECUARIA LTDA 22.681.381/0004-05, Fazenda Colonial, Verdelandia/MG. Valor R$ 11.340,00, ISSQN 5% 567,00 nao retido, sem descontos. '
          + 'Descricao da NF: "REFERENTE AO LEILAO PEPITAS COLONIAL EXPOGENETICA DIA 22/08/2026" - mas o VALOR cobre os dois pregoes da Colonial: 3% x 378.000 = 117.000 (12o Noite Nacional Matrizes Premium, 21/08, lotes 18/19/24) + 261.000 (4o Pepitas Colonial, 22/08, lotes 9/19/24/25/26/27/32/33/37, lote 19 a 22.500 pela listagem da Programa). '
          + 'Conferencia lote a lote fechada em 11/09 (outputs/noite-nacional-2026-09/colonial-validacao-2026-09-11.md); a Colonial confirmou por WhatsApp em 15/09 13:07 (Aurelio: "Incluindo os lotes que faltam, a comissao ficou no valor de R$ 11.340,00"). '
          + 'PDF da NF recebido da Ana Paula as 18:50 (operational_items 9c61abab-612e-4d7f-8797-492d9d2f1be0, whatsapp-media/baileys/joao-automation/556796631382/3EB0D9390EADC397C70B39.pdf); copia em outputs/conciliacao-2026-09-15/. '
          + 'VENCIMENTO 16/09 = data informada pelo Joao em 15/09 ("esse pagamento deve ocorrer amanha"), nao acordo escrito da Colonial. '
          + 'fechamento_id aponta para o Pepitas (8d11a2ff); o Noite Nacional e o 7904f010 - os dois tem receita_bula 0 e sem acordo_pct, e NAO foram reescritos. '
          + 'A planilha-mestra (aba Leiloes) traz 5.850 + 9.765 = 15.615 EM FECHAMENTO: os 4.275 a mais sao lotes de outros vendedores no mesmo pregao (Terra Boa lt 29 78.000, Nelore ZAN lt 53 24.000, Agropontieri lt 54 36.000 = 4.140 a 3%) e o lote 19 a 27.000 em vez de 22.500 (135). Cobranca desses tres criadores e a parte e sem acordo - pendencia, nao titulo.',
      })
      if (error) throw error
    }
  }
}

// ---------------------------------------------------------------------------
say('\n=== [6] TERRA BRAVA EXPOGENETICA (15/08) - valor combinado 0,5% x 937.260 = 4.686,30 (ANOTACAO, sem mexer no valor) ===')
// ---------------------------------------------------------------------------
// Print do WhatsApp (Joao, 15/09 ~19h): Marcelo encaminhou a mensagem enviada ao
// Paulo Camilo (Terra Brava PO): "Leilao Expogenetica - Faturamento total
// R$ 937.260,00 - Vendas Bula R$ 107.100,00 (11,4%) - Comissao R$ 937.260,00 x
// 0,5% = R$ 4.686,30" e a resposta "Combinado, pode emitir a NF nos mesmos
// dados por favor". Coerente com a tabela de performance do contrato Terra
// Brava (Touros Provados 16/06: performance >= 5% -> 0,5% do faturamento bruto).
// O CR 2e6e1690 esta em 11.984,49 (11,19% "criterio a confirmar", 18/08). O
// Joao pediu para VALIDAR antes de proceder/emitir nota: fica anotado, o valor
// so muda quando a NF sair.
{
  const TAG_TB = 'valor-acordado-4686.30-a-validar'
  const { data: tb } = await sb.from('erp_contas_receber').select('id,descricao,valor,vencimento,status,tags,observacoes').eq('numero_documento', 'BULA-2026-CR-TERRABRAVA-EXPOGENETICA-20260815').maybeSingle()
  const alvo = tb || (await sb.from('erp_contas_receber').select('id,descricao,valor,vencimento,status,tags,observacoes').ilike('descricao', 'LEIL%TERRA BRAVA AGROPECU%EXPOGEN%').neq('status', 'cancelado').maybeSingle()).data
  if (!alvo) say('  CR  Terra Brava Expogenetica nao encontrado - nada a anotar')
  else if ((alvo.tags || []).includes(TAG_TB)) say('  CR  ' + String(alvo.descricao).slice(0, 54).padEnd(54) + ' (ja anotado)')
  else {
    say('  CR  ' + String(alvo.descricao).slice(0, 54).padEnd(54) + brl(alvo.valor).padStart(11) + ' -> anotado: combinado 4.686,30 (a validar; valor NAO alterado)')
    if (APPLY) {
      const { error } = await sb.from('erp_contas_receber').update({
        tags: [...new Set([...(alvo.tags || []), TAG_TB, 'acordo-whatsapp-15-09'])],
        observacoes: (alvo.observacoes ? alvo.observacoes + '\n' : '') + '[CONC 15/09] VALOR COMBINADO INFORMADO: 0,5% x faturamento total 937.260,00 = 4.686,30 (vendas Bula 107.100 = 11,4% -> faixa >= 5% da tabela de performance do contrato Terra Brava, mesma regra do Touros Provados 16/06). '
          + 'Mensagem do Marcelo ao Paulo Camilo (Terra Brava PO), encaminhada ao Joao em 15/09 ~19h: "Comissao R$ 937.260,00 x 0,5% = R$ 4.686,30" / "Combinado, pode emitir a NF nos mesmos dados". '
          + 'Os 11.984,49 deste titulo (11,19% "criterio a confirmar", de 18/08) ficam 7.298,19 acima do combinado; a planilha-mestra traz 5.355 (5% x 107.100). O Joao pediu para VALIDAR antes de emitir a NF - o valor do titulo NAO foi alterado nesta rodada; corrigir para 4.686,30 (e trocar a tag criterio-a-confirmar) quando a NF for emitida.',
      }).eq('id', alvo.id)
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
const sic = (contas || []).find(x => x.id === CONTA_SICOOB)
const dif = Number(sic?.saldo_atual || 0) - SALDO_SICOOB
say('  Sicoob x extrato 18:57: ' + brl(sic?.saldo_atual) + ' x ' + brl(SALDO_SICOOB) + ' -> dif ' + brl(dif))
const { data: pend } = await sb.from('erp_movimentos_bancarios').select('id,data,valor,descricao,status_conciliacao').neq('status_conciliacao', 'conciliado')
say('  Movimentos fora de conciliado: ' + (pend?.length ?? 0))
for (const m of pend || []) say('    ' + m.data + ' ' + brl(m.valor).padStart(12) + ' [' + m.status_conciliacao + '] ' + String(m.descricao).slice(0, 60))

if (!APPLY) say('\nDRY-RUN. Use --apply para gravar.')
else if (Math.abs(dif) < 0.005) say('\nOK: Sicoob bate com o extrato. ' + (pend?.length ? 'Resta ' + pend.length + ' movimento(s) sem dono (esperado: o PIX de 50,00 de 14/09).' : 'Nenhum movimento pendente.'))
else say('\n⚠ Conferir: o Sicoob nao bate com o extrato.')
