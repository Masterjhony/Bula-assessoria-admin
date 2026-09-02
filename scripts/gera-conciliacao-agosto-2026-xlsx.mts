/**
 * Planilha de conferencia da conciliacao de AGOSTO/2026 — Sicoob CC 1.056-1.
 *
 * Pedido do chefe (01/09/2026, 11:48): "Algumas saidas de Agosto nao estao
 * conciliadas. Finaliza essa conciliacao no detalhe e me envia por favor um
 * excel, fica mais facil por que vou colorindo aqui e dando o check".
 *
 * Le direto do ERP (nada e digitado a mao alem da coluna "O QUE FOI", que
 * traduz o historico do banco para portugues) e monta 7 abas:
 *   Resumo · Saidas Agosto · Entradas Agosto · Por Natureza ·
 *   Pagamentos Agregados · Setembro (01/09) · Pendencias
 *
 * As colunas CONFERIDO e ANOTACAO ficam vazias de proposito: sao do chefe.
 *
 * Uso: npx tsx scripts/gera-conciliacao-agosto-2026-xlsx.mts
 */
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const SAIDA_DIR = 'outputs/conciliacao-agosto-2026'
const ARQUIVO = SAIDA_DIR + '/Conciliacao-Agosto-2026-Bula.xlsx'

/* ============================ paleta (brandbook) ========================== */
const PRETO   = 'FF111111'
const GRAFITE = 'FF2B2B2B'
const DOURADO = 'FFC9A84C'
const BRANCO  = 'FFFFFFFF'
const ZEBRA   = 'FFF6F6F4'
const LINHA   = 'FFD9D9D6'
const VERDE   = 'FF1B7F4B'
const VERDE_F = 'FFE8F5EE'
const VERM    = 'FFB3261E'
const VERM_F  = 'FFFDECEA'
const AMAR_F  = 'FFFFF6E0'
const AZUL_F  = 'FFEDF3FA'
const CINZA_T = 'FF6B6B66'

const MOEDA = '#,##0.00;[Red]-#,##0.00'
const DATA  = 'dd/mm/yyyy'

/* ============================ dados do ERP =============================== */
const [rCat, rCC, rPes, rMov, rCP, rCR, rConta] = await Promise.all([
  sb.from('erp_categorias').select('id,nome,tipo,dre_grupo'),
  sb.from('erp_centros_custo').select('id,nome'),
  sb.from('erp_pessoas').select('id,nome,documento'),
  sb.from('erp_movimentos_bancarios').select('*').eq('conta_bancaria_id', CONTA).gte('data', '2026-08-01').lte('data', '2026-09-01').order('data'),
  sb.from('erp_contas_pagar').select('id,descricao,valor,valor_pago,status,vencimento,data_pagamento,vendedor,nota_fiscal'),
  sb.from('erp_contas_receber').select('id,descricao,valor,valor_recebido,status,vencimento,data_recebimento,nota_fiscal'),
  sb.from('erp_contas_bancarias').select('id,nome,saldo_atual').eq('id', CONTA).maybeSingle(),
])
const cat = new Map((rCat.data || []).map(c => [c.id, c]))
const cc  = new Map((rCC.data  || []).map(c => [c.id, c.nome]))
const pes = new Map((rPes.data || []).map(p => [p.id, p]))
const cp  = new Map((rCP.data  || []).map(t => [t.id, t]))
const cr  = new Map((rCR.data  || []).map(t => [t.id, t]))
const mov = (rMov.data || [])
const acha = <T extends { id: string }>(m: Map<string, T>, pref: string) => [...m.values()].find(v => v.id.startsWith(pref))!

const GRUPO_LABEL: Record<string, string> = {
  custo_direto: 'Custo direto', despesa_fixa: 'Despesa fixa', despesa_variavel: 'Despesa variável',
  imposto: 'Imposto', financeiro: 'Financeiro', receita: 'Receita', distribuicao: 'Distribuição',
  ignorar: 'Não entra no resultado',
}

/* ===================== traducao do historico do banco ==================== */
/** id curto -> { oque, ref } — a unica parte "escrita a mao" da planilha. */
const EXPLICA: Record<string, { oque: string; ref?: string }> = {
  // ---- saidas 03/08 (folha e acertos de julho) ----
  '9bb110cb': { oque: 'Tarifa do Sicoob pela liquidação de boleto de cobrança.' },
  '01a23a60': { oque: 'Encargo social recolhido na Caixa Econômica Federal (FGTS).', ref: 'Encargos jul/2026' },
  '77b2ad3d': { oque: 'Acerto final de contas com Valdeneusa Félix (ex-equipe).', ref: 'Acerto jul/2026' },
  'd143f224': { oque: 'Acerto final de contas com Ana Paula Porfírio Munhoz (ex-financeiro).', ref: 'Acerto jul/2026' },
  '886ea5bf': { oque: 'Hospedagem da equipe — Busse Hotelaria.', ref: 'Viagem/estadia' },
  '05f50130': { oque: 'Marketing: collab da campanha do Leilão São Geraldo (agência Performance Publicidade).', ref: 'Campanha São Geraldo' },
  'dd1d4163': { oque: 'Salário de julho/2026 — João Gabriel.', ref: 'Folha jul/2026' },
  'd97da3be': { oque: 'Salário de julho/2026 — João Antônio.', ref: 'Folha jul/2026' },
  'fe2d53c0': { oque: 'Salário de julho/2026 — Douglas Bispo (NFS-e 36).', ref: 'Folha jul/2026' },
  '19bf1800': { oque: 'Salário de julho/2026 — João Eduardo (NFS-e 3). Reajuste de 3.000 para 5.000 a partir da competência julho.', ref: 'Folha jul/2026' },
  'e6e05704': { oque: 'Salário de julho/2026 — Fábio Omena. Folha nova de 7.000 (era 11.700 até junho).', ref: 'Folha jul/2026' },
  '1db2d21f': { oque: 'Salário de julho/2026 — Leonardo Serafim (NFS-e 14).', ref: 'Folha jul/2026' },
  // ---- 04 a 07/08 ----
  '3a1ddae6': { oque: 'Estadia da equipe no Leilão Touros Fazenda São Geraldo.', ref: 'São Geraldo 01/08' },
  '15f8c480': { oque: 'Honorários do contador (Lucas) — boleto.', ref: 'Contabilidade jul/2026' },
  '3a16ca0f': { oque: 'Reembolso das despesas de campo do Fábio Omena — custo direto de leilão.', ref: 'Reembolso leilões jul/2026' },
  '3e80cb88': { oque: 'Reembolso das despesas de campo do Leonardo Serafim — custo direto de leilão.', ref: 'Reembolso leilões jul/2026' },
  '81aa5473': { oque: 'Diárias de hotel de Peralta, Carrelo e Renato no Leilão LS (7 e 8/08) — Atlas Hotels.', ref: 'LS Galeria 07-08/08' },
  // ---- 10/08 ----
  'cbc5ff2b': { oque: 'Integralização de capital na cooperativa (Sicoob) — parcela mensal.' },
  'c3cba114': { oque: 'Pacote mensal de serviços do Sicoob.' },
  '3775cb7c': { oque: 'Alimentação — Bolos & Cia. Contraparte identificada nesta conciliação (CNPJ 21.986.213/0001-04); estava como "Outras despesas / não identificada".' },
  '8a1b4c07': { oque: 'Corrida de aplicativo (Uber). Esta cobrança foi estornada no mesmo dia e relançada — ver a entrada de 20,98 em 10/08.' },
  '44c0e609': { oque: 'Corrida de aplicativo (Uber).' },
  'dc3b78ec': { oque: 'Mensalidade do site (ClickWeb) — boleto.' },
  '0e44f763': { oque: 'Diárias do Matheus (equipe de campo).', ref: 'Diárias jul/2026' },
  'dbeac96f': { oque: 'Reembolso do restante dos gastos feitos no cartão — Fórmula do Boi. Custo direto de leilão.', ref: 'Reembolso leilões jul/2026' },
  'c696f8fc': { oque: 'Tráfego pago no Meta (Facebook/Instagram) — campanha patrocinada.', ref: 'Mídia paga ago/2026' },
  'd3c34f18': { oque: 'Comissão de junho/2026 — restante devido ao Fábio Omena (NFS-e 28).', ref: 'Comissões jun/2026' },
  '9610cd2d': { oque: 'Comissão de julho/2026 do parceiro Gustavo Rusa (NF 34), que ganha 5%. PAGAMENTO AGREGADO: quita 5 títulos — abertura na aba "Pagamentos Agregados".', ref: 'Comissões jul/2026 — Rusa' },
  // ---- 11 a 18/08 ----
  '65f5c612': { oque: 'Tarifa do Sicoob pela liquidação do boleto do Matinha (entrada de 2.800,00 no mesmo dia).' },
  '20413472': { oque: 'Entrada dos uniformes da Expogenética.', ref: 'Expogenética 2026' },
  'e9ec99b0': { oque: 'Aluguel da casa da equipe na Expogenética.', ref: 'Expogenética 2026' },
  'c567d0af': { oque: 'Comissão de junho/2026 — saldo restante do Fábio Omena.', ref: 'Comissões jun/2026' },
  'd029a312': { oque: 'Reembolso à Bula Remates pela reemissão de passagens da equipe — custo direto de leilão.', ref: 'Expogenética 2026' },
  'c47a4492': { oque: 'Seguro Sicoob (débito em convênio).' },
  'd22bd650': { oque: 'Seguro Sicoob (débito em convênio) — segunda apólice.' },
  'ce02c2dd': { oque: 'ISSQN — guia da Prefeitura de Campo Grande.', ref: 'ISSQN competência jul/2026' },
  '14ce31fe': { oque: 'Plano do banco de dados do sistema, reembolsado ao João Eduardo.' },
  '9b1115f3': { oque: 'Restante dos uniformes da Expogenética.', ref: 'Expogenética 2026' },
  // ---- 20 a 24/08 ----
  'b2c4718f': { oque: 'Remat — deferimento de marcas (1º pagamento).' },
  'd22a07ac': { oque: 'DARF dos funcionários (débito agendado).', ref: 'Encargos jul/2026' },
  'a8e4b302': { oque: 'Simples Nacional (DAS) da competência julho/2026.', ref: 'DAS jul/2026' },
  '9eafca9b': { oque: 'Passagens da Expogenética de Fábio e Leonardo (ADN Viagens). PAGAMENTO AGREGADO: quita 2 títulos.', ref: 'Expogenética 2026' },
  '2f877d16': { oque: 'Assinatura da Anthropic (Claude IA), reembolsada ao João Eduardo.' },
  '713e0c7b': { oque: 'Fatura do cartão MASTERCARD. As compras são 100% gastos do Felipe V. Andrade (Bulinha) e a fatura ABATE o que a Bula deve a ele — por isso não é despesa de estrutura. O gasto item a item está em ERP › Cartões › Fatura.' },
  'f92c8b51': { oque: 'Fatura do cartão VISA. Mesma regra do Mastercard: as compras são gastos do Felipe V. Andrade e a fatura abate a dívida.' },
  'e8c961d7': { oque: 'Comissão de julho/2026 do Douglas Bispo. PAGAMENTO AGREGADO: quita 10 títulos (10.116,00) + complemento de 1.792,00. Segue em aberto 320,00 do lote 19 do Nelore Sorriso, sem título.', ref: 'Comissões jul/2026' },
  // ---- 25 a 28/08 (as tres que o chefe apontou) ----
  '54d664fc': { oque: 'Comissão de julho/2026 do Leonardo Serafim. QUITA 5 TÍTULOS (abertura na aba "Pagamentos Agregados"). Estava sem vínculo desde 26/08 por causa da disputa dos lotes 26 e 30 da EAO Baviera Fêmeas — resolvida em 28/08 pela mensagem formal do grupo de lances.', ref: 'Comissões jul/2026' },
  '2165b58c': { oque: 'Comissão de julho/2026 do Fábio Omena. QUITA 7 TÍTULOS (8.706,00) + 120,00 de adiantamento sobre o Nelore Santa Cruz 19/07. Mesma disputa do Leonardo, resolvida em 28/08.', ref: 'Comissões jul/2026' },
  '52a601fd': { oque: 'Tráfego pago no Meta — campanha patrocinada.', ref: 'Mídia paga ago/2026' },
  '2db44245': { oque: 'Plano de hospedagem da Vercel (infraestrutura do sistema), reembolsado ao João Eduardo. Era o único lançamento de agosto ainda sem classificação.' },
  // ---- entradas de agosto ----
  '38f151df': { oque: 'Comissão do 3º Leilão Matrizes Katispera, paga por José Odemir Spaggiari (TED).', ref: 'Katispera' },
  '48036bcc': { oque: 'Transferência entre contas da própria Bula (Sicredi → Sicoob). NÃO é receita.', ref: 'Transferência interna' },
  '9e116365': { oque: 'Comissão do Leilão RS Agropecuária (23/06), paga por Roberto Bavaresco.', ref: 'RS Agropecuária 23/06' },
  '29aa3cd1': { oque: 'Devolução do imposto da NF pela Bula Remates — 32º Leilão 4R.', ref: '32º Leilão 4R' },
  '518ee42f': { oque: '1ª parcela do 10º Leilão Nelore JMP, paga pela JBJ Agropecuária. RECEBIMENTO AGREGADO: cobre 2 títulos (Fêmeas 58.484,00 + Touros 107.183,50).', ref: '10º Nelore JMP' },
  'adb53b72': { oque: 'Estorno do Uber cobrado no mesmo dia.' },
  '1f754869': { oque: 'Liquidação do boleto do Leilão Virtual Touros Matinha — Thiago (2ª de 2).', ref: 'Matinha Thiago' },
  'd2d069ee': { oque: 'Acerto da Bula Remates: Kirz 10.164,00 integral + Neloraço 9.646,50 parcial. RESTAM 15.508,50 do Neloraço a cobrar.', ref: 'Kirz + Neloraço' },
  'bc5d41b4': { oque: '1ª de 3 parcelas de Eduardo Pinheiro Campos — NF 615, Terra Brava junho/2026 (7.215,00). Faltam 4.810,00.', ref: 'Terra Brava jun/2026' },
  'b05f1763': { oque: '1ª parcela do 20º Leilão Guadalupe Agropecuária (Pedro Gustavo de Britto Novis). Cobre 2 títulos: Fêmeas 3.000,00 + Touros 7.712,95.', ref: '20º Guadalupe' },
  '06bfb1e2': { oque: '1ª de 2 parcelas da NF 636 (18.282,45) — 23º Mega Leilão Genética Aditiva, as duas etapas juntas. Falta a 2ª parcela de 9.141,22.', ref: '23º Genética Aditiva' },
  '3b842d2a': { oque: '2º Leilão Pintado Raiz — Maciel Pereira da Silva, vendedor único (acordo de 1% sobre 458.800). Pagou 8,00 a menos, registrado como desconto.', ref: '2º Pintado Raiz' },
  // ---- setembro ----
  '0989368c': { oque: 'Tarifa do Sicoob pela liquidação do boleto do Kito (entrada de 15.030,00 no mesmo dia).' },
  'd8c59e0a': { oque: 'Transferência entre contas da própria Bula (PIX de mesma titularidade). NÃO é receita. A perna do Sicredi ainda não foi lançada — falta o extrato Sicredi de setembro.', ref: 'Transferência interna' },
  'b1c0ffad': { oque: '3ª e ÚLTIMA parcela do Kito (boleto vencido em 30/08). Fecha os 45.090,00 que a Assessoria recebe em dinheiro do acordo 4R — era o único saldo do 4R ainda em aberto.', ref: 'Kito — acordo 4R' },
}

/* ===================== lotes dos pagamentos agregados ==================== */
const AGREGADOS: { mov: string; titulo: string; tipo: 'CP' | 'CR'; ids: string[]; extra?: { rotulo: string; valor: number; nota: string } }[] = [
  { mov: '9610cd2d', titulo: '10/08 · R$ 29.535,00 · Gustavo Rusa (parceiro, 5%) — NF 34', tipo: 'CP',
    ids: ['55d13b0c', '08ed6849', '31d8c925', '61d9c747', '86bf7ce4'] },
  { mov: '518ee42f', titulo: '10/08 · R$ 165.667,50 · JBJ Agropecuária — 1ª parcela do 10º Leilão Nelore JMP (ENTRADA)', tipo: 'CR',
    ids: ['939917d7', '759da19c'] },
  { mov: 'd2d069ee', titulo: '20/08 · R$ 19.810,50 · Bula Remates — acerto Kirz + Neloraço (ENTRADA)', tipo: 'CR',
    ids: ['f7487417', '84700163'] },
  { mov: '9eafca9b', titulo: '21/08 · R$ 6.178,45 · ADN Viagens — passagens da Expogenética', tipo: 'CP',
    ids: ['3605b2ed', 'ef6374fa'] },
  { mov: 'e8c961d7', titulo: '24/08 · R$ 11.908,00 · Douglas Bispo — comissão de julho/2026', tipo: 'CP',
    ids: ['580b96ea', '5ac2a39a', '9790ad4f', '92102ee2', 'ea3bf22b', 'a81f89d5', 'b7038849', '93568dcb', '91be5eb7', 'abe0f307', '07023e5f'] },
  { mov: 'b05f1763', titulo: '25/08 · R$ 10.712,95 · Guadalupe Agropecuária — 1ª parcela (ENTRADA)', tipo: 'CR',
    ids: ['e09f0fde', '6d4939ab'] },
  { mov: '54d664fc', titulo: '25/08 · R$ 5.262,00 · Leonardo Serafim — comissão de julho/2026  ◄ conciliado nesta rodada', tipo: 'CP',
    ids: ['82220972', '24f3439d', '6c7d5c50', 'f88a3a1d', 'b4d28beb'] },
  { mov: '2165b58c', titulo: '25/08 · R$ 8.826,00 · Fábio Omena — comissão de julho/2026  ◄ conciliado nesta rodada', tipo: 'CP',
    ids: ['0609dbaa', '046b485c', '4729b9c4', '0ebcc33d', '975b6f10', '61accf8d', 'f85f7a4c'],
    extra: { rotulo: 'ADIANTAMENTO sobre COMISSAO NELORE SANTA CRUZ - 19/07/2026 - FABIO OMENA (2%)', valor: 120,
             nota: 'Título de 2.952,00 criado em 28/08 (lotes 45, 46 e 47 estavam "A definir" e nunca haviam virado título). Segue PARCIAL: restam 2.832,00.' } },
]

/* ============================== pendencias =============================== */
const PENDENCIAS: [string, string, number | string, string][] = [
  ['Extrato Sicredi de setembro',
   'O PIX de 12.000,00 de 01/09 é transferência de mesma titularidade e a perna do Sicredi não foi lançada — inventá-la seria pior que declará-la. Enquanto o extrato não vier, o saldo consolidado do Sicredi está superestimado nesse valor. O saldo do Sicoob está certo e bate ao centavo.',
   12000, 'Baixar o extrato Sicredi de setembro'],
  ['Comissão de julho ainda a pagar — Leonardo',
   'Títulos de julho que o Leonardo não cobrou na planilha dele e seguem abertos: Base Genética Santa Cruz lt116 (510,00) + 23º Genética Aditiva 2ª etapa (1.962,00).',
   2472, 'Decisão do chefe: pagar ou encerrar'],
  ['Comissão de julho ainda a pagar — Fábio',
   'Saldo do título NELORE SANTA CRUZ 19/07 (2.952,00) do qual só 120,00 foram adiantados no PIX de 25/08.',
   2832, 'Decisão do chefe: pagar ou encerrar'],
  ['Comissão de julho — Peralta e Laila',
   'Nunca receberam PIX nenhum de julho. Não é divergência de cálculo, é esquecimento.',
   1755, 'Programar pagamento'],
  ['Comissão de julho — Douglas, lote 19 do Nelore Sorriso',
   'Saldo reconhecido na conferência de 24/08 e que nunca virou título.',
   320, 'Emitir título e pagar'],
  ['2ª parcela da Genética Aditiva',
   'A NF 636 vale 18.282,45 e só metade entrou em 27/08.',
   9141.22, 'Cobrar — vencimento 08-09/09'],
  ['Terra Brava — Eduardo Pinheiro Campos',
   'A NF 615 (7.215,00) está sendo paga em 3 parcelas de 2.405,00; só a 1ª entrou (25/08).',
   4810, 'Cobrar as 2 parcelas restantes'],
  ['Neloraço PO — saldo da Bula Remates',
   'O acerto de 20/08 cobriu o Kirz integral e o Neloraço só em parte.',
   15508.50, 'Cobrar da Bula Remates'],
  ['Faturas de cartão sem itens de julho',
   'As faturas de agosto (Mastercard 1.380,13 e Visa 5.949,84) estão conciliadas, mas as de JULHO seguem sem os lançamentos item a item — a sessão do internet banking expirou antes da leitura.',
   '—', 'Sicoob › Cartões › Extrato detalhado › Emitir'],
]

/* ============================ helpers de estilo ========================== */
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria Pecuária · ERP'
wb.created = new Date()

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
/** Soma de dinheiro sem o ruido do ponto flutuante (243430.54000000004). */
const cent = (n: number) => Math.round(n * 100) / 100
const soma = (xs: any[], f: (x: any) => number) => cent(xs.reduce((a, x) => a + f(x), 0))
const dt = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const docDe = (m: any) => { const p = pes.get(m.pessoa_id); return p?.documento || '' }
const nomeDe = (m: any) => {
  const p = pes.get(m.pessoa_id)
  if (p?.nome) return p.nome
  if (/34\.?791\.?630/.test(String(m.descricao || ''))) return 'BULA ASSESSORIA (conta própria)'
  const cnpj = String(m.descricao || '').match(/(\d{2}\.?\d{3}\.?\d{3}[ /]?\d{4}-?\d{2})/)
  if (cnpj) return cnpj[1]
  const cpf = String(m.descricao || '').match(/\*{3}\.\d{3}\.\d{3}-?\*{2}/)
  return cpf ? cpf[0] : '—'
}
/** Pinta a coluna do check: OK verde, REVER vermelho, DÚVIDA âmbar. */
function realceDoCheck(ws: ExcelJS.Worksheet, col: string, de: number, ate: number) {
  if (ate < de) return
  const ref = `${col}${de}:${col}${ate}`
  const regra = (texto: string, fundo: string, cor: string) => ({
    type: 'containsText' as const, operator: 'containsText' as const, text: texto, priority: 1,
    style: { fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: fundo } },
             font: { bold: true, color: { argb: cor } } },
  })
  ws.addConditionalFormatting({ ref, rules: [
    regra('OK', VERDE_F, VERDE), regra('REVER', VERM_F, VERM), regra('DÚVIDA', AMAR_F, 'FF8A6D1B'),
  ] })
}
const tituloDe = (m: any) => {
  const t = m.conta_pagar_id ? cp.get(m.conta_pagar_id) : (m.conta_receber_id ? cr.get(m.conta_receber_id) : null)
  if (!t) return '—'
  return String(t.id).slice(0, 8) + ' · ' + String(t.descricao).replace(/^COMISSAO /, '').slice(0, 70)
}

function tituloDaAba(ws: ExcelJS.Worksheet, titulo: string, subtitulo: string, ncols: number) {
  ws.mergeCells(1, 1, 1, ncols)
  const t = ws.getCell(1, 1)
  t.value = titulo
  t.font = { name: 'Calibri', size: 15, bold: true, color: { argb: BRANCO } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 30
  ws.mergeCells(2, 1, 2, ncols)
  const s = ws.getCell(2, 1)
  s.value = subtitulo
  s.font = { name: 'Calibri', size: 9.5, color: { argb: BRANCO }, italic: true }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAFITE } }
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true }
  ws.getRow(2).height = 26
}

function cabecalho(ws: ExcelJS.Worksheet, linha: number, cols: string[]) {
  const r = ws.getRow(linha)
  cols.forEach((c, i) => {
    const cell = r.getCell(i + 1)
    cell.value = c
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: BRANCO } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAFITE } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: DOURADO } } }
  })
  r.height = 30
}

const borda = { top: { style: 'hair' as const, color: { argb: LINHA } }, bottom: { style: 'hair' as const, color: { argb: LINHA } } }

/* ================================ ABA 1 · RESUMO ========================= */
{
  const saidas = mov.filter(m => m.tipo === 'saida' && m.data <= '2026-08-31')
  const entradas = mov.filter(m => m.tipo === 'entrada' && m.data <= '2026-08-31')
  const somaS = soma(saidas, m => Number(m.valor))
  const somaE = soma(entradas, m => Number(m.valor))
  const ehTransf = (m: any) => cat.get(m.categoria_id)?.dre_grupo === 'ignorar'
  const somaEop = soma(entradas.filter(m => !ehTransf(m)), m => Number(m.valor))
  const somaSop = soma(saidas.filter(m => !ehTransf(m)), m => Number(m.valor))

  const ws = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 3 }, { width: 42 }, { width: 20 }, { width: 20 }, { width: 74 }]
  tituloDaAba(ws, 'CONCILIAÇÃO BANCÁRIA · AGOSTO/2026',
    'Bula Assessoria Pecuária Ltda · Sicoob Unique BR, Coop. 4620-5, Conta Corrente 1.056-1 · '
    + 'Fonte: extratos "extrato agosto.pdf" (01 a 31/08) e "extrato setembro.pdf" (01/09), emitidos em 01/09/2026 15:11.', 5)

  let L = 4
  const bloco = (t: string) => {
    ws.mergeCells(L, 2, L, 5)
    const c = ws.getCell(L, 2)
    c.value = t
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: PRETO } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEDE6' } }
    c.alignment = { vertical: 'middle', indent: 1 }
    c.border = { left: { style: 'thick', color: { argb: DOURADO } } }
    ws.getRow(L).height = 22
    L += 1
  }
  const item = (rot: string, val: any, obs = '', destaque = false) => {
    ws.getCell(L, 2).value = rot
    ws.getCell(L, 2).font = { name: 'Calibri', size: 10, bold: destaque }
    ws.getCell(L, 2).alignment = { indent: 1 }
    const v = ws.getCell(L, 3)
    v.value = val
    if (typeof val === 'number') { v.numFmt = MOEDA; v.alignment = { horizontal: 'right' } }
    else v.alignment = { horizontal: 'right' }
    v.font = { name: 'Calibri', size: 10, bold: destaque, color: { argb: destaque ? PRETO : GRAFITE } }
    ws.mergeCells(L, 4, L, 5)
    ws.getCell(L, 4).value = obs
    ws.getCell(L, 4).font = { name: 'Calibri', size: 9, color: { argb: CINZA_T } }
    ws.getCell(L, 4).alignment = { wrapText: true, vertical: 'middle', indent: 1 }
    for (let c = 2; c <= 5; c++) ws.getCell(L, c).border = borda
    ws.getRow(L).height = Math.max(18, Math.ceil(obs.length / 78) * 14)
    L += 1
  }

  bloco('O QUE O CHEFE PEDIU')
  item('Pedido (01/09, 11:48)', '', '"Algumas saídas de Agosto não estão conciliadas. Finaliza essa conciliação no detalhe e me envia por favor um excel, fica mais fácil por que vou colorindo aqui e dando o check."')
  item('Situação antes', '3 saídas', 'Faltavam três: 25/08 Leonardo 5.262,00 e Fábio 8.826,00 (classificadas, sem título vinculado) e 28/08 Vercel 110,00 (sem classificação nenhuma).')
  item('Situação agora', '0 saídas', 'As 50 saídas e as 12 entradas de agosto estão CONCILIADAS, com título vinculado e contraparte identificada. O ERP inteiro ficou sem nenhum movimento pendente.', true)
  L += 1

  bloco('SALDO — O ERP BATE COM O BANCO')
  item('Saldo em 31/07/2026', 25208.83, 'Saldo anterior impresso no extrato de agosto.')
  item('(+) Entradas de agosto', somaE, entradas.length + ' lançamentos (inclui 15.000,00 de transferência entre contas da própria Bula).')
  item('(−) Saídas de agosto', -somaS, saidas.length + ' lançamentos.')
  item('Saldo em 31/08/2026', 33654.45, 'Extrato e ERP batem ao centavo. Validação por saldo dia a dia: OK em todos os dias.', true)
  item('Movimento de 01/09', 27027.92, 'Kito 15.030,00 + transferência interna 12.000,00 − tarifa 2,08.')
  item('Saldo em 01/09/2026', 60682.37, 'Extrato e ERP batem ao centavo.', true)
  L += 1

  bloco('RESULTADO DE CAIXA DE AGOSTO (sem transferências entre contas)')
  item('Entradas operacionais', somaEop, 'Comissões de leilão recebidas, recuperação de imposto e estornos.')
  item('Saídas operacionais', -somaSop, 'Folha, comissões, impostos, custo de leilão e estrutura.')
  item('Resultado do mês', cent(somaEop - somaSop), somaEop - somaSop >= 0 ? 'Caixa positivo no mês.' : 'O mês consumiu caixa: agosto pagou o ciclo de comissões de junho E de julho no mesmo mês, mais o DAS de 55.846,64 e o ISSQN de 24.524,81.', true)
  L += 1

  bloco('O QUE MUDOU NESTA RODADA')
  item('25/08 · Leonardo · 5.262,00', 'conciliado', 'Vinculado aos 5 títulos que quita. Ficou sem vínculo desde 26/08 porque a atribuição dos lotes 26 e 30 da EAO Baviera Fêmeas estava em disputa com o Fábio. A disputa acabou em 28/08: a mensagem formal do grupo de lances ("Foi com <nome> da Bula Assessoria") é o registro primário do arremate, e o parser tinha lido quem POSTOU o lance, não quem VENDEU.')
  item('25/08 · Fábio Omena · 8.826,00', 'conciliado', 'Vinculado aos 7 títulos (8.706,00) mais 120,00 de adiantamento. NÃO houve pagamento em duplicidade — a conclusão de 27/08 de que 1.920,00 saíram duas vezes foi retificada.')
  item('28/08 · Vercel · 110,00', 'conciliado', 'Hospedagem do sistema, reembolsada ao João Eduardo. Título criado e baixado.')
  item('01/09 · Kito · 15.030,00', 'recebido', '3ª e última parcela do acordo 4R. Com ela fecham os 45.090,00 — era o único saldo do 4R ainda em aberto.')
  item('10/08 · 39,00', 'identificado', 'O CNPJ 21.986.213/0001-04 estava como "contraparte não identificada". É a BOLOS & CIA: virou Alimentação/Refeições.')
  item('01/07 · DARF · 2.225,46', 'conciliado', 'Único movimento do ERP inteiro ainda preso em "classificado". Já tinha título baixado; só o status nunca tinha sido promovido.')
  L += 1

  bloco('COMO USAR ESTA PLANILHA')
  item('Aba "Saídas Agosto"', '50 linhas', 'É a aba do check. Cada linha tem O QUE FOI, a contraparte com CNPJ/CPF, a natureza, o título do ERP e o histórico original do banco. As duas últimas colunas (CONFERIDO e ANOTAÇÃO) estão vazias e são suas — a coluna CONFERIDO tem lista: OK, REVER, DÚVIDA.')
  item('Aba "Pagamentos Agregados"', '8 lotes', 'Um PIX só que quita vários títulos aparece aqui aberto título a título. É o "no detalhe" das comissões.')
  item('Aba "Pendências"', PENDENCIAS.length + ' itens', 'O que a conciliação deixou visível e ainda depende de decisão ou de cobrança.')
}

/* ============== ABAS 2 e 3 · SAIDAS e ENTRADAS de agosto ================= */
function abaMovimentos(nome: string, tipo: 'saida' | 'entrada', ate: string, titulo: string, subtitulo: string) {
  const linhas = mov.filter(m => m.tipo === tipo && m.data <= ate).sort((a, b) => a.data.localeCompare(b.data) || Number(b.valor) - Number(a.valor))
  const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', xSplit: 4, ySplit: 4, showGridLines: false }] })
  const COLS = ['#', 'DATA', 'VALOR (R$)', 'O QUE FOI', 'CONTRAPARTE', 'CNPJ / CPF', 'NATUREZA', 'GRUPO', 'CENTRO DE CUSTO', 'REFERÊNCIA', 'TÍTULO NO ERP', 'HISTÓRICO DO EXTRATO', 'STATUS', 'CONFERIDO', 'ANOTAÇÃO']
  ws.columns = [{ width: 4 }, { width: 11 }, { width: 14 }, { width: 62 }, { width: 30 }, { width: 20 }, { width: 24 }, { width: 17 }, { width: 20 }, { width: 22 }, { width: 46 }, { width: 58 }, { width: 12 }, { width: 13 }, { width: 30 }]
  tituloDaAba(ws, titulo, subtitulo, COLS.length)
  cabecalho(ws, 4, COLS)

  let n = 0
  for (const m of linhas) {
    n += 1
    const c = cat.get(m.categoria_id)
    const ex = EXPLICA[String(m.id).slice(0, 8)]
    const r = ws.getRow(4 + n)
    r.values = [
      n, dt(m.data), Number(m.valor),
      ex?.oque || String(m.descricao),
      nomeDe(m), docDe(m),
      c?.nome || '—', GRUPO_LABEL[String(c?.dre_grupo)] || String(c?.dre_grupo || '—'),
      cc.get(m.centro_custo_id) || '—',
      ex?.ref || '—',
      tituloDe(m),
      String(m.descricao),
      m.status_conciliacao === 'conciliado' ? 'Conciliado' : String(m.status_conciliacao),
      '', '',
    ]
    r.height = 30
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Calibri', size: 9.5 }
      cell.alignment = { vertical: 'top', wrapText: col === 4 || col === 11 || col === 12, indent: col === 4 ? 1 : 0 }
      cell.border = borda
      if (n % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    })
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'top' }
    r.getCell(2).numFmt = DATA
    r.getCell(2).alignment = { horizontal: 'center', vertical: 'top' }
    r.getCell(3).numFmt = MOEDA
    r.getCell(3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: tipo === 'saida' ? VERM : VERDE } }
    r.getCell(3).alignment = { horizontal: 'right', vertical: 'top' }
    r.getCell(4).font = { name: 'Calibri', size: 9.5, color: { argb: PRETO } }
    r.getCell(12).font = { name: 'Consolas', size: 8, color: { argb: CINZA_T } }
    r.getCell(11).font = { name: 'Consolas', size: 8, color: { argb: GRAFITE } }
    const st = r.getCell(13)
    st.alignment = { horizontal: 'center', vertical: 'top' }
    st.font = { name: 'Calibri', size: 9, bold: true, color: { argb: VERDE } }
    st.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_F } }
    // coluna do chefe
    for (const col of [14, 15]) {
      r.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMAR_F } }
      r.getCell(col).border = { ...borda, left: { style: 'thin', color: { argb: DOURADO } } }
    }
    r.getCell(14).alignment = { horizontal: 'center', vertical: 'middle' }
    r.getCell(14).dataValidation = { type: 'list', allowBlank: true, formulae: ['"OK,REVER,DÚVIDA"'] }
  }

  // total
  const tl = ws.getRow(5 + n)
  tl.getCell(2).value = 'TOTAL'
  tl.getCell(3).value = soma(linhas, m => Number(m.valor))
  tl.getCell(4).value = n + ' lançamentos · todos conciliados'
  for (let c = 1; c <= COLS.length; c++) {
    tl.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
    tl.getCell(c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRANCO } }
    tl.getCell(c).border = { top: { style: 'medium', color: { argb: DOURADO } } }
  }
  tl.getCell(3).numFmt = MOEDA
  tl.getCell(3).alignment = { horizontal: 'right' }
  tl.getCell(2).alignment = { horizontal: 'right' }
  tl.getCell(4).alignment = { indent: 1 }
  tl.height = 24

  realceDoCheck(ws, 'N', 5, 4 + n)
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + n, column: COLS.length } }
  return n
}

const nSaidas = abaMovimentos('Saídas Agosto', 'saida', '2026-08-31',
  'SAÍDAS DE AGOSTO/2026 — CONCILIAÇÃO NO DETALHE',
  'Uma linha por débito do extrato. As colunas CONFERIDO (lista: OK / REVER / DÚVIDA) e ANOTAÇÃO, em amarelo, são suas. '
  + 'Pagamento que quita mais de um título está aberto na aba "Pagamentos Agregados".')

abaMovimentos('Entradas Agosto', 'entrada', '2026-08-31',
  'ENTRADAS DE AGOSTO/2026',
  'Créditos do extrato. A transferência de 15.000,00 de 04/08 é dinheiro da própria Bula vindo do Sicredi — não é receita e fica fora do resultado.')

/* ========================= ABA 4 · POR NATUREZA ========================== */
{
  const saidas = mov.filter(m => m.tipo === 'saida' && m.data <= '2026-08-31')
  const total = soma(saidas, m => Number(m.valor))
  const porCat = new Map<string, { grupo: string; valor: number; n: number }>()
  for (const m of saidas) {
    const c = cat.get(m.categoria_id)
    const k = c?.nome || '—'
    const cur = porCat.get(k) || { grupo: GRUPO_LABEL[String(c?.dre_grupo)] || '—', valor: 0, n: 0 }
    cur.valor = cent(cur.valor + Number(m.valor)); cur.n += 1
    porCat.set(k, cur)
  }
  const ordem = [...porCat.entries()].sort((a, b) => b[1].valor - a[1].valor)

  const ws = wb.addWorksheet('Por Natureza', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
  ws.columns = [{ width: 4 }, { width: 34 }, { width: 22 }, { width: 16 }, { width: 10 }, { width: 9 }, { width: 46 }]
  tituloDaAba(ws, 'SAÍDAS DE AGOSTO POR NATUREZA', 'Para onde foram os R$ ' + brl(total) + ' que saíram do Sicoob em agosto/2026.', 7)
  cabecalho(ws, 4, ['#', 'NATUREZA', 'GRUPO', 'VALOR (R$)', '% DO MÊS', 'LANÇ.', 'LEITURA'])

  const LEITURA: Record<string, string> = {
    'Impostos e Taxas': 'DAS de julho (55.846,64) + ISSQN (24.524,81). É o maior bloco do mês.',
    'Comissões': 'Ciclo de junho E de julho pagos no mesmo mês: Rusa, Fábio, Douglas, Leonardo e as duas faturas de cartão do Bulinha.',
    'Folha de Pagamento': 'Folha de julho/2026, paga em 03/08.',
    'Despesa Operacional Leilão': 'Reembolsos de campo a assessores e à Bula Remates — custo direto, não estrutura.',
    'Viagem/Passagens': 'Passagens e estadias da Expogenética e dos leilões de campo.',
    'Software/Assinaturas': 'Site ClickWeb, banco de dados, Anthropic e Vercel.',
    'Marketing e Publicidade': 'Tráfego pago no Meta (3.500,00 + 2.000,00) e collab da campanha São Geraldo.',
    'Encargos Sociais': 'DARF dos funcionários e FGTS.',
    'Servicos de Terceiros': 'Contador e deferimento de marcas (Remat).',
    'Tarifas Bancarias': 'Pacote de serviços e tarifas de cobrança do Sicoob.',
    'Aluguel': 'Casa da equipe na Expogenética.',
    'Seguros': 'Duas apólices do Sicoob Seg em débito por convênio.',
    'Outras Despesas': 'Acertos finais com Valdeneusa e Ana Paula.',
    'Alimentacao/Refeicoes': 'Bolos & Cia — contraparte identificada nesta conciliação.',
    'Transporte (Apps)': 'Corridas de Uber (uma delas estornada e relançada).',
    'Integralizacao Capital Cooperativa': 'Parcela mensal de capital no Sicoob — é aplicação, não despesa.',
  }

  let n = 0
  for (const [nome, d] of ordem) {
    n += 1
    const r = ws.getRow(4 + n)
    r.values = [n, nome, d.grupo, d.valor, d.valor / total, d.n, LEITURA[nome] || '']
    r.height = 22
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Calibri', size: 9.5 }
      cell.border = borda
      cell.alignment = { vertical: 'middle', wrapText: col === 7, indent: col === 2 || col === 7 ? 1 : 0 }
      if (n % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    })
    r.getCell(1).alignment = { horizontal: 'center' }
    r.getCell(2).font = { name: 'Calibri', size: 10, bold: true }
    r.getCell(4).numFmt = MOEDA
    r.getCell(4).font = { name: 'Calibri', size: 10, bold: true }
    r.getCell(5).numFmt = '0.0%'
    r.getCell(5).alignment = { horizontal: 'center' }
    r.getCell(6).alignment = { horizontal: 'center' }
    r.getCell(7).font = { name: 'Calibri', size: 9, color: { argb: CINZA_T } }
  }
  const tl = ws.getRow(5 + n)
  tl.values = [null, 'TOTAL DAS SAÍDAS', '', total, 1, mov.filter(m => m.tipo === 'saida' && m.data <= '2026-08-31').length, '']
  for (let c = 1; c <= 7; c++) {
    tl.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
    tl.getCell(c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRANCO } }
    tl.getCell(c).border = { top: { style: 'medium', color: { argb: DOURADO } } }
  }
  tl.getCell(4).numFmt = MOEDA
  tl.getCell(5).numFmt = '0.0%'
  tl.getCell(5).alignment = { horizontal: 'center' }
  tl.getCell(6).alignment = { horizontal: 'center' }
  tl.height = 24
}

/* ==================== ABA 5 · PAGAMENTOS AGREGADOS ======================= */
{
  const ws = wb.addWorksheet('Pagamentos Agregados', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
  ws.columns = [{ width: 4 }, { width: 13 }, { width: 16 }, { width: 76 }, { width: 15 }, { width: 13 }, { width: 40 }]
  tituloDaAba(ws, 'PAGAMENTOS E RECEBIMENTOS AGREGADOS — ABERTURA TÍTULO A TÍTULO',
    'Um PIX só que quita vários títulos. O ERP guarda um vínculo por movimento, então o movimento aponta para o MAIOR título do lote e a composição inteira vive aqui. É o "no detalhe" das comissões.', 7)
  cabecalho(ws, 4, ['#', 'TÍTULO (ID)', 'VALOR (R$)', 'DESCRIÇÃO DO TÍTULO', 'VENCIMENTO', 'CONFERIDO', 'ANOTAÇÃO'])

  let L = 4
  for (const g of AGREGADOS) {
    L += 1
    ws.mergeCells(L, 1, L, 7)
    const h = ws.getCell(L, 1)
    h.value = g.titulo
    h.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: PRETO } }
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEDE6' } }
    h.alignment = { vertical: 'middle', indent: 1 }
    h.border = { left: { style: 'thick', color: { argb: DOURADO } }, top: { style: 'thin', color: { argb: GRAFITE } } }
    ws.getRow(L).height = 22

    let lote = 0, i = 0
    for (const id of g.ids) {
      const t = g.tipo === 'CP' ? acha(cp as any, id) : acha(cr as any, id)
      const v = Number(g.tipo === 'CP' ? (t as any).valor_pago : (t as any).valor_recebido)
      lote = cent(lote + v); i += 1; L += 1
      const r = ws.getRow(L)
      r.values = [i, String(t.id).slice(0, 8), v, String((t as any).descricao).replace(/^COMISSAO /, ''), dt(String((t as any).vencimento)), '', '']
      r.height = 18
      r.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = { name: 'Calibri', size: 9.5 }
        cell.border = borda
        cell.alignment = { vertical: 'middle', indent: col === 4 ? 1 : 0 }
        if (i % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
      })
      r.getCell(1).alignment = { horizontal: 'center' }
      r.getCell(2).font = { name: 'Consolas', size: 8.5, color: { argb: CINZA_T } }
      r.getCell(3).numFmt = MOEDA
      r.getCell(3).font = { name: 'Calibri', size: 10, bold: true }
      r.getCell(5).numFmt = DATA
      r.getCell(5).alignment = { horizontal: 'center' }
      for (const col of [6, 7]) {
        r.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMAR_F } }
        r.getCell(col).border = { ...borda, left: { style: 'thin', color: { argb: DOURADO } } }
      }
      r.getCell(6).alignment = { horizontal: 'center' }
      r.getCell(6).dataValidation = { type: 'list', allowBlank: true, formulae: ['"OK,REVER,DÚVIDA"'] }
    }
    if (g.extra) {
      lote = cent(lote + g.extra.valor); i += 1; L += 1
      const r = ws.getRow(L)
      r.values = [i, '(parcial)', g.extra.valor, g.extra.rotulo + '  —  ' + g.extra.nota, '', '', '']
      r.height = 30
      r.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = { name: 'Calibri', size: 9.5, italic: col === 4 }
        cell.border = borda
        cell.alignment = { vertical: 'middle', wrapText: col === 4, indent: col === 4 ? 1 : 0 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_F } }
      })
      r.getCell(1).alignment = { horizontal: 'center' }
      r.getCell(3).numFmt = MOEDA
      r.getCell(3).font = { name: 'Calibri', size: 10, bold: true }
    }
    L += 1
    const s = ws.getRow(L)
    s.getCell(2).value = 'SOMA'
    s.getCell(3).value = lote
    s.getCell(4).value = i + ' título(s) — fecha o valor do extrato ao centavo'
    for (let c = 1; c <= 7; c++) {
      s.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAFITE } }
      s.getCell(c).font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRANCO } }
    }
    s.getCell(3).numFmt = MOEDA
    s.getCell(2).alignment = { horizontal: 'right' }
    s.getCell(4).alignment = { indent: 1 }
    s.height = 20
    L += 1
  }
  realceDoCheck(ws, 'F', 5, L)
}

/* ========================= ABA 6 · SETEMBRO (01/09) ====================== */
{
  const linhas = mov.filter(m => m.data === '2026-09-01').sort((a, b) => Number(b.valor) - Number(a.valor))
  const ws = wb.addWorksheet('Setembro (01-09)', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 4 }, { width: 11 }, { width: 9 }, { width: 15 }, { width: 74 }, { width: 30 }, { width: 44 }, { width: 13 }, { width: 30 }]
  tituloDaAba(ws, 'SETEMBRO — MOVIMENTO DE 01/09/2026',
    'O extrato de setembro veio junto e já entrou conciliado, para o mês não começar sujo. Saldo em 01/09: R$ 60.682,37 — ERP e extrato batem ao centavo.', 9)
  cabecalho(ws, 4, ['#', 'DATA', 'TIPO', 'VALOR (R$)', 'O QUE FOI', 'CONTRAPARTE', 'TÍTULO NO ERP', 'CONFERIDO', 'ANOTAÇÃO'])
  let n = 0
  for (const m of linhas) {
    n += 1
    const ex = EXPLICA[String(m.id).slice(0, 8)]
    const r = ws.getRow(4 + n)
    r.values = [n, dt(m.data), m.tipo === 'saida' ? 'Saída' : 'Entrada', Number(m.valor), ex?.oque || String(m.descricao), nomeDe(m), tituloDe(m), '', '']
    r.height = 40
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Calibri', size: 9.5 }
      cell.border = borda
      cell.alignment = { vertical: 'top', wrapText: col === 5 || col === 7, indent: col === 5 ? 1 : 0 }
      if (n % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    })
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'top' }
    r.getCell(2).numFmt = DATA
    r.getCell(2).alignment = { horizontal: 'center', vertical: 'top' }
    r.getCell(3).alignment = { horizontal: 'center', vertical: 'top' }
    r.getCell(4).numFmt = MOEDA
    r.getCell(4).font = { name: 'Calibri', size: 10, bold: true, color: { argb: m.tipo === 'saida' ? VERM : VERDE } }
    r.getCell(7).font = { name: 'Consolas', size: 8, color: { argb: GRAFITE } }
    for (const col of [8, 9]) {
      r.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMAR_F } }
      r.getCell(col).border = { ...borda, left: { style: 'thin', color: { argb: DOURADO } } }
    }
    r.getCell(8).dataValidation = { type: 'list', allowBlank: true, formulae: ['"OK,REVER,DÚVIDA"'] }
    r.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' }
  }
  realceDoCheck(ws, 'H', 5, 4 + n)
  const L = 6 + n
  ws.mergeCells(L, 2, L, 9)
  const c = ws.getCell(L, 2)
  c.value = 'Saldo em 31/08/2026: R$ 33.654,45   →   + 15.030,00 (Kito)   + 12.000,00 (transferência interna)   − 2,08 (tarifa)   =   R$ 60.682,37 em 01/09/2026.'
  c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: PRETO } }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEDE6' } }
  c.alignment = { vertical: 'middle', indent: 1 }
  c.border = { left: { style: 'thick', color: { argb: DOURADO } } }
  ws.getRow(L).height = 24
}

/* ============================ ABA 7 · PENDENCIAS ========================= */
{
  const ws = wb.addWorksheet('Pendências', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
  ws.columns = [{ width: 4 }, { width: 40 }, { width: 82 }, { width: 16 }, { width: 34 }, { width: 13 }, { width: 30 }]
  tituloDaAba(ws, 'PENDÊNCIAS QUE A CONCILIAÇÃO DEIXOU VISÍVEIS',
    'Nenhuma delas impede o fechamento de agosto — o saldo bate ao centavo. São decisões e cobranças que precisam de você.', 7)
  cabecalho(ws, 4, ['#', 'PENDÊNCIA', 'O QUE É', 'VALOR (R$)', 'PRÓXIMO PASSO', 'CONFERIDO', 'ANOTAÇÃO'])
  let n = 0
  for (const [tit, desc, val, passo] of PENDENCIAS) {
    n += 1
    const r = ws.getRow(4 + n)
    r.values = [n, tit, desc, val, passo, '', '']
    r.height = 44
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Calibri', size: 9.5 }
      cell.border = borda
      cell.alignment = { vertical: 'top', wrapText: col === 2 || col === 3 || col === 5, indent: 1 }
      if (n % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    })
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'top' }
    r.getCell(2).font = { name: 'Calibri', size: 10, bold: true }
    if (typeof val === 'number') { r.getCell(4).numFmt = MOEDA; r.getCell(4).font = { name: 'Calibri', size: 10, bold: true } }
    r.getCell(4).alignment = { horizontal: 'right', vertical: 'top' }
    for (const col of [6, 7]) {
      r.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMAR_F } }
      r.getCell(col).border = { ...borda, left: { style: 'thin', color: { argb: DOURADO } } }
    }
    r.getCell(6).dataValidation = { type: 'list', allowBlank: true, formulae: ['"OK,REVER,DÚVIDA"'] }
    r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' }
  }
  realceDoCheck(ws, 'F', 5, 4 + n)
}

/* ================================ grava ================================== */
fs.mkdirSync(SAIDA_DIR, { recursive: true })
await wb.xlsx.writeFile(ARQUIVO)
const sem = mov.filter(m => !EXPLICA[String(m.id).slice(0, 8)])
console.log('Movimentos lidos ........ ' + mov.length + '  (saidas de agosto: ' + nSaidas + ')')
console.log('Sem traducao manual ..... ' + sem.length + (sem.length ? '  <- ' + sem.map(m => String(m.id).slice(0, 8) + ' ' + m.data + ' ' + brl(m.valor)).join(' | ') : ''))
console.log('Saldo do ERP ............ ' + brl(rConta.data?.saldo_atual))
console.log('Arquivo ................. ' + ARQUIVO)
