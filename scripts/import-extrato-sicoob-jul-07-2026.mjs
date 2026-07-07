// Importa os movimentos do extrato Sicoob que faltavam: fim de 06/07 (entraram
// depois da leitura intraday do import anterior) + 07/07/2026.
// Fonte: sicoob_2026_07_07_16_51_18.pdf (período 01/07–07/07, lido 07/07 16:51).
//
// Validação por saldo (banco): 03/07=140.920,45 -> 06/07=150.909,30 -> 07/07=114.135,65.
// ERP antes deste import: saldo lógico 133.090,30 (leitura intraday de 06/07).
// Diferença de 06/07 = +17.819,00 = exatamente os 4 movimentos tardios de 06/07
// (+19.650,00 −79,37 −1.533,33 −218,30). 07/07 = −36.773,65.
// 133.090,30 + 17.819,00 − 36.773,65 = 114.135,65 ✓ bate com o banco.
//
// Amarração:
//  - 06/07 +19.650,00 MARCELO PROCOPIO GRISI <-> CR LEILAO MATRIZES SANTA NICE
//    (aberto, valor exato; planilha: "A RECEBER 06/07").
//  - 06/07 −1.533,33 "Fixo Joao Antonio SRD proporcional 23 dias" baixa a CP
//    FOLHA-JUN-JOAOANTONIO ajustando o valor 2.000 -> 1.533,33 (proporcional).
//  - 06/07 −218,30 boleto Click Web (site bulaassessoria.com) -> CP nova paga.
//  - 07/07 −36.849,00 "NF 26 Fabio Comissao Maio" (59.791.094 = FO Assessoria)
//    -> CP nova paga (comissão maio consolidada; o provisório de maio 20.763 já
//    estava "pago" por confirmação verbal — CONFERIR consolidação com o financeiro).
//  - 07/07 −444,65 Formula do Boi "gastos cartao desenvolvimento sistema" -> CP nova paga.
//  - 07/07 +1.520,00 CENTRAL LEILOES LTDA: SEM CR correspondente — classificado;
//    identificar o leilão (possível comissão E-RURAL/Katayama via Central).
//  - 07/07 −1.000,00 "Collab com pecuaria Brasil" -> CP nova paga (Marketing).
//  - 06/07 −79,37 pix p/ 33.780.388/0001-40 sem memo -> pendente (identificar).
//
// Idempotente (movimento por chave natural; CP novas por numero_documento).
// Uso: DRY_RUN=1 node scripts/import-extrato-sicoob-jul-07-2026.mjs | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100
const now = () => new Date().toISOString()

const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const SALDO_ERP_ANTES = 133090.30
const SALDO_BANCO = 114135.65
const FONTE = 'Extrato Sicoob (PDF sisbr) 01/07/2026 a 07/07/2026, emitido 07/07/2026 16:51'

const CAT = {
  RECEBIMENTO_CLIENTE: 'ee101d8d-4c90-4cbc-8139-a156e046e20f',
  FOLHA: '4c79d95f-a8a4-4aff-9f7a-cd82f974c4b3',
  SERVICOS_TERCEIROS: '1f72e05d-01ed-474b-bc83-90974be930f9',
  MARKETING: '26762d4e-b517-48b9-98f3-155a6421264e',
  OUTRAS: '20c2defd-415c-42cc-8939-fcd8cf104280',
}
const CC = {
  OP02_ESTRUTURA: 'da0324cb-abf6-4633-8175-cd80997267aa',
  COM02_ASSESSORES: '52dd8ed0-0c0a-4524-86bd-01dc121487b3',
}
const PES = {
  FO_ASSESSORIA: 'c5919834-4e98-4f07-88a8-0892e4f7c247',
  FORMULA_DO_BOI: 'b2bbeb01-12a8-4fef-ad4c-888664a3c02f',
  CLICKWEB: 'ea0a776a-43ee-42e6-92ea-433c5b6528e1',
}
const CR_SANTA_NICE = '77780a96-4823-40a6-b4f5-e57a9b1ba3ed' // 19.650,00 aberto
const CP_FOLHA_JOAOANTONIO = '5631f8dd-7d90-4d2f-b597-21a8541ac316' // 2.000 vencido

// categoria Comissão Funcionário (buscada por nome em runtime)
const { data: catCom } = await sb.from('erp_categorias').select('id').eq('nome', 'Comissão Funcionário').single()

const CPS_NOVAS = [
  { doc: 'BULA-2026-CP-CLICKWEB-SITE-2026-07', descricao: 'CLICK WEB - HOSPEDAGEM SITE bulaassessoria.com', valor: 218.30,
    categoria_id: CAT.SERVICOS_TERCEIROS, centro_custo_id: CC.OP02_ESTRUTURA, fornecedor_id: PES.CLICKWEB, data: '2026-07-06', forma: 'boleto',
    obs: 'Débito de título 06/07 (doc 2900455), memo "Boleto Click Web site bulaassessoria.com".' },
  { doc: 'BULA-2026-CP-COMISSAO-MAIO-FABIO-NF26', descricao: 'NF 26 - COMISSÃO MAIO/2026 - FÁBIO OMENA (FO ASSESSORIA)', valor: 36849.00,
    categoria_id: catCom.id, centro_custo_id: CC.COM02_ASSESSORES, fornecedor_id: PES.FO_ASSESSORIA, data: '2026-07-07', forma: 'pix',
    obs: 'Pix 07/07 p/ 59.791.094/0001-07 (FO Assessoria), memo "NF 26 Fabio Comissao Maio". ATENÇÃO: provisório de maio (20.763) já constava pago por confirmação verbal — conferir consolidação (provisório x NF 26) com o financeiro.' },
  { doc: 'BULA-2026-CP-FORMULA-CARTAO-SISTEMA-2026-07', descricao: 'REEMBOLSO FORMULA DO BOI - GASTOS CARTÃO (DESENVOLVIMENTO SISTEMA)', valor: 444.65,
    categoria_id: CAT.SERVICOS_TERCEIROS, centro_custo_id: CC.OP02_ESTRUTURA, fornecedor_id: PES.FORMULA_DO_BOI, data: '2026-07-07', forma: 'pix',
    obs: 'Pix 07/07 p/ 65.565.807/0001-17 (Formula do Boi), memo "ref gastos com cartao desenvolvimento sistema".' },
  { doc: 'BULA-2026-CP-COLLAB-PECUARIA-BRASIL-2026-07', descricao: 'COLLAB PECUÁRIA BRASIL (DIVULGAÇÃO)', valor: 1000.00,
    categoria_id: CAT.MARKETING, centro_custo_id: CC.OP02_ESTRUTURA, fornecedor_id: null, data: '2026-07-07', forma: 'pix',
    obs: 'Pix 07/07 p/ 49.103.031/0001-67, memo "Collab com pecuaria Brasil". Identificar parceiro/perfil.' },
]

// Movimentos novos (mais antigos primeiro)
const MOVS = [
  // ----- 06/07 (tardios; faltavam no import intraday) -----
  { data: '2026-07-06', tipo: 'saida', valor: 79.37, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '33.780.388 0001-40', ref: 'Solicitacao Pix', cat: CAT.OUTRAS, status: 'pendente', nota: 'IDENTIFICAR: pix 79,37 p/ 33.780.388/0001-40 sem memo' },
  { data: '2026-07-06', tipo: 'saida', valor: 1533.33, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '***.266.771-**', ref: 'Fixo Joao Antonio SRD proporcional 23 dias', cat: CAT.FOLHA, status: 'conciliado', cpId: CP_FOLHA_JOAOANTONIO, nota: 'Folha junho João Antonio proporcional 23 dias (2.000 x 23/30)' },
  { data: '2026-07-06', tipo: 'saida', valor: 218.30, header: 'DÉB.TIT.COMPE.EFETI', docBanco: '2900455', contraparte: '', docContraparte: '', ref: 'Boleto Click Web site bulaassessoria.com', cat: CAT.SERVICOS_TERCEIROS, status: 'conciliado', cpDoc: 'BULA-2026-CP-CLICKWEB-SITE-2026-07' },
  { data: '2026-07-06', tipo: 'entrada', valor: 19650.00, header: 'PIX RECEB.OUTRA IF', docBanco: 'Pix', contraparte: 'MARCELO PROCOPIO GRISI', docContraparte: '***.351.858-**', ref: '', cat: CAT.RECEBIMENTO_CLIENTE, status: 'conciliado', crId: CR_SANTA_NICE, nota: 'CR LEILAO MATRIZES SANTA NICE 2026 - COBERTURA BULA (19.650,00, planilha: A RECEBER 06/07)' },
  // ----- 07/07 -----
  { data: '2026-07-07', tipo: 'saida', valor: 36849.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: 'FO ASSESSORIA PECUARIA', docContraparte: '59.791.094 0001-07', ref: 'NF 26 Fabio Comissao Maio', cat: catCom.id, status: 'conciliado', cpDoc: 'BULA-2026-CP-COMISSAO-MAIO-FABIO-NF26' },
  { data: '2026-07-07', tipo: 'saida', valor: 444.65, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: 'FORMULA DO BOI', docContraparte: '65.565.807 0001-17', ref: 'ref gastos com cartao desenvolvimento sistema', cat: CAT.SERVICOS_TERCEIROS, status: 'conciliado', cpDoc: 'BULA-2026-CP-FORMULA-CARTAO-SISTEMA-2026-07' },
  { data: '2026-07-07', tipo: 'entrada', valor: 1520.00, header: 'CRED.TR.CT.INTERCRE', docBanco: '3188', contraparte: 'CENTRAL LEILOES LTDA', docContraparte: '', ref: '', cat: CAT.RECEBIMENTO_CLIENTE, status: 'classificado', nota: 'SEM CR correspondente — identificar o leilão (Central Leilões paga comissões E-RURAL/Katayama)' },
  { data: '2026-07-07', tipo: 'saida', valor: 1000.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '49.103.031 0001-67', ref: 'Collab com pecuaria Brasil', cat: CAT.MARKETING, status: 'conciliado', cpDoc: 'BULA-2026-CP-COLLAB-PECUARIA-BRASIL-2026-07' },
]

function descricao(m) { const tail = m.contraparte || m.ref; return m.header + (tail ? ` - ${tail}` : '') }
function observacoes(m) {
  const parts = [FONTE]
  if (m.docBanco) parts.push(`Doc banco: ${m.docBanco}`)
  if (m.contraparte) parts.push(`Contraparte: ${m.contraparte}`)
  if (m.docContraparte) parts.push(`Documento contraparte: ${m.docContraparte}`)
  if (m.ref) parts.push(`Obs: ${m.ref}`)
  if (m.nota) parts.push(m.nota)
  parts.push(m.status === 'conciliado' ? 'Conciliacao: casado com titulo' : m.status === 'pendente' ? 'Conciliacao: sem categoria confiavel; aguarda revisao' : 'Conciliacao: classificado por descricao, sem titulo')
  return parts.join(' | ')
}
function docId(m) { return 'SICOOB-2026-' + createHash('md5').update(`${m.data}|${m.tipo}|${r2(m.valor)}|${descricao(m)}`).digest('hex').slice(0, 16).toUpperCase() }

// validação por saldo
const net = MOVS.reduce((s, m) => s + (m.tipo === 'entrada' ? m.valor : -m.valor), 0)
console.log(DRY_RUN ? '*** DRY RUN (nada gravado) ***' : '*** GRAVANDO EM PRODUCAO ***')
console.log(`Movimentos: ${MOVS.length} | net ${brl(net)} | ${brl(SALDO_ERP_ANTES)} + net = ${brl(r2(SALDO_ERP_ANTES + net))} (banco: ${brl(SALDO_BANCO)})\n`)
if (r2(SALDO_ERP_ANTES + net) !== SALDO_BANCO) throw new Error('Saldo de verificacao NAO bate — abortando.')

// 1) CP novas (pagas)
const cpIdByDoc = {}
for (const c of CPS_NOVAS) {
  const payload = {
    descricao: c.descricao, fornecedor_id: c.fornecedor_id, categoria_id: c.categoria_id, centro_custo_id: c.centro_custo_id,
    valor: c.valor, emissao: c.data, vencimento: c.data, status: 'pago', data_pagamento: c.data, valor_pago: c.valor,
    forma_pagamento: c.forma, numero_documento: c.doc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
    observacoes: `${c.obs} | Criada no import do extrato 07/07 para amarrar o pagamento ao titulo.`,
    tags: ['a-pagar', '2026', 'extrato-sicoob'],
  }
  const { data: ex } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', c.doc).maybeSingle()
  if (ex) { cpIdByDoc[c.doc] = ex.id; console.log(`[=] CP ja existe ${c.doc}`); continue }
  if (DRY_RUN) { console.log(`[+] CP nova (paga) ${brl(c.valor).padStart(13)} ${c.descricao.slice(0, 60)}`); continue }
  const { data, error } = await sb.from('erp_contas_pagar').insert(payload).select('id').single()
  if (error) throw new Error(`CP ${c.doc}: ${error.message}`)
  cpIdByDoc[c.doc] = data.id
  console.log(`[+] CP criada (paga) ${brl(c.valor).padStart(13)} ${c.doc}`)
}

// 2) Baixa da folha João Antonio (proporcional 23 dias: 2.000 -> 1.533,33)
{
  const { data: cp } = await sb.from('erp_contas_pagar').select('id,status,valor').eq('id', CP_FOLHA_JOAOANTONIO).single()
  if (cp.status === 'pago') console.log('[=] CP folha João Antonio ja paga')
  else if (DRY_RUN) console.log(`[~] baixar CP folha JOÃO ANTONIO: valor 2.000 -> 1.533,33 (proporcional 23 dias), pago 06/07`)
  else {
    const { error } = await sb.from('erp_contas_pagar').update({
      valor: 1533.33, valor_pago: 1533.33, status: 'pago', data_pagamento: '2026-07-06', forma_pagamento: 'pix', updated_at: now(),
      observacoes: 'Folha junho/2026 João Antonio (SDR). Pago proporcional a 23 dias (2.000 x 23/30 = 1.533,33) conforme pix de 06/07 — valor do título ajustado ao efetivamente devido/pago.',
    }).eq('id', CP_FOLHA_JOAOANTONIO)
    if (error) throw new Error(`baixa folha João Antonio: ${error.message}`)
    console.log('[~] CP folha JOÃO ANTONIO baixada: 1.533,33 (proporcional), pago 06/07')
  }
}

// 3) Baixa da CR Santa Nice (recebida 06/07)
{
  const { data: cr } = await sb.from('erp_contas_receber').select('id,status,valor').eq('id', CR_SANTA_NICE).single()
  if (cr.status === 'recebido') console.log('[=] CR Santa Nice ja recebida')
  else if (DRY_RUN) console.log(`[~] baixar CR SANTA NICE ${brl(cr.valor)} (recebida 06/07, Marcelo Procopio Grisi)`)
  else {
    const { error } = await sb.from('erp_contas_receber').update({
      status: 'recebido', valor_recebido: cr.valor, data_recebimento: '2026-07-06', forma_recebimento: 'pix', updated_at: now(),
    }).eq('id', CR_SANTA_NICE)
    if (error) throw new Error(`baixa CR Santa Nice: ${error.message}`)
    console.log(`[~] CR SANTA NICE baixada ${brl(cr.valor)} (recebida 06/07)`)
  }
}

// 4) Movimentos do extrato
let inserted = 0, skipped = 0
for (const m of MOVS) {
  const desc = descricao(m)
  const { data: ex } = await sb.from('erp_movimentos_bancarios')
    .select('id').eq('conta_bancaria_id', SICOOB).eq('data', m.data).eq('tipo', m.tipo)
    .eq('valor', r2(m.valor)).eq('descricao', desc).maybeSingle()
  if (ex) { console.log(`[=] JA EXISTE ${m.data} ${m.tipo} ${brl(m.valor)} :: ${desc.slice(0, 50)}`); skipped++; continue }

  const payload = {
    conta_bancaria_id: SICOOB, data: m.data, tipo: m.tipo, descricao: desc, valor: r2(m.valor),
    categoria_id: m.cat || null, origem: 'importacao_sicoob_2026', documento: docId(m), observacoes: observacoes(m),
    status_conciliacao: m.status, conciliado: m.status !== 'pendente',
    conta_receber_id: m.crId || null,
    conta_pagar_id: m.cpId || (m.cpDoc ? (cpIdByDoc[m.cpDoc] || null) : null),
  }
  if (m.cpDoc && !cpIdByDoc[m.cpDoc] && !DRY_RUN) throw new Error(`CP nao encontrada p/ doc ${m.cpDoc}`)
  if (DRY_RUN) { console.log(`[+] ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(13)} [${m.status}]${m.cpDoc ? ' CP:' + m.cpDoc : ''}${m.cpId ? ' CP✓' : ''}${m.crId ? ' CR✓' : ''} ${desc.slice(0, 48)}`); inserted++; continue }
  const { error } = await sb.from('erp_movimentos_bancarios').insert(payload)
  if (error) throw new Error(`mov ${m.data} ${brl(m.valor)}: ${error.message}`)
  console.log(`[+] ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(13)} [${m.status}] ${desc.slice(0, 55)}`)
  inserted++
}

// 5) saldo: derivado por trigger; recalcula e confere com o banco
if (!DRY_RUN) {
  const { data: rec, error } = await sb.rpc('erp_recalc_saldo', { p_conta: SICOOB })
  if (error) throw new Error(`saldo: ${error.message}`)
  console.log(`\nSaldo derivado da conta apos import: ${brl(rec)} (banco: ${brl(SALDO_BANCO)}).`)
}
console.log(`\nConcluido. Movimentos novos: ${inserted} | ja existiam: ${skipped}`)
console.log('PENDENTES DE IDENTIFICACAO: pix 79,37 (06/07, 33.780.388/0001-40); entrada 1.520,00 CENTRAL LEILOES (07/07) sem CR; conferir NF 26 comissao maio Fabio x provisorio 20.763 ja pago.')
