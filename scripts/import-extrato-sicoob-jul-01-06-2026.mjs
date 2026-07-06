// Importa os movimentos do extrato Sicoob de 30/06 (tarde) a 06/07/2026, lidos
// direto do Internet Banking em 06/07/2026 (período 30/06–06/07, conferido dia a dia).
//
// Validação por saldo (banco): 29/06=56.594,02 -> 30/06=73.259,33 -> 01/07=85.123,12
//   -> 02/07=75.948,44 -> 03/07=140.920,45 -> 06/07=133.090,30 (saldo atual).
// ERP antes deste import: último movimento 30/06 (hotel), saldo lógico 55.426,02.
// 55.426,02 + net deste import (+77.664,28) = 133.090,30 ✓ bate com o banco.
//
// Amarração:
//  - Entradas casadas com CR já baixadas (datas de recebimento conferem):
//      30/06 +17.833,31 E-RURAL           <-> CR LEILÃO LS AGROPECUARIA
//      01/07 +15.030,00 LIQ.COBRANÇA      <-> CR NELORE MARCOS DE REZENDE (KITO)
//      02/07 +15.501,22 TED JOSE H V M.   <-> CR 41o TOUROS CAMPARINO
//      03/07 +80.272,01 EAO NF 608        <-> CR MATRIZES EAO (54.669,29) + TOUROS EAO (25.602,72)
//  - Saídas de folha junho baixam as CP BULA-2026-CP-FOLHA-JUN-* (vencidas):
//      Leonardo 13.500 (02/07) | Fábio 11.700 (03/07) | Douglas 3.600 (03/07)
//      João Eduardo 3.000 (06/07) | João Gabriel 2.000 (06/07)
//  - Contador 1.058 (06/07) casa com CP DESPFIXA-CONTABIL-2026-07 (já paga).
//  - CP novas (pagas) para: DARF 2.225,46, guia CEF/FGTS 938,67, NF 8 Formula 5.000,
//      Digital Net 142,92, reembolso Douglas 1.772,15.
//  - Sem título (fica classificado/pendente): tarifa 2,08, pix 32,98 (17.895.646/0001-87),
//      salário 6.000 (***.308.191-**) — IDENTIFICAR com o financeiro.
//  - Ao final: erp_contas_bancarias.saldo_atual = 133.090,30 (fonte: banco).
//
// Idempotente (movimento por chave natural; CP novas por numero_documento).
// Uso: DRY_RUN=1 node scripts/import-extrato-sicoob-jul-01-06-2026.mjs | sem DRY_RUN grava.
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
const SALDO_BANCO = 133090.30
const FONTE = 'Extrato Sicoob (Internet Banking) 30/06/2026 a 06/07/2026, lido em 06/07/2026'

const CAT = {
  RECEBIMENTO_CLIENTE: 'ee101d8d-4c90-4cbc-8139-a156e046e20f',
  FOLHA: '4c79d95f-a8a4-4aff-9f7a-cd82f974c4b3',
  IMPOSTOS: '6d3270c8-2680-4cdd-a709-5b1520d1f430',
  TARIFAS: 'f8ae3a53-bb4e-414e-97d1-ebdca81df658',
  ENERGIA_TELEFONE: 'fc04a834-ddb9-4311-a6de-29bb87785088',
  REPASSE: '5dcdc58a-d81b-4a4c-a81a-5e703e6a1a90',
  DESP_OP_LEILAO: '562264eb-8134-4990-a56b-d884279acf90',
  OUTRAS: '20c2defd-415c-42cc-8939-fcd8cf104280',
  SERVICOS_TERCEIROS: '421660db-5009-43a3-95da-48f204db6ebd',
}
const CC = {
  IMP: 'ccca82b8-5852-4fbd-8d50-c37a3c5804f5',
  OP02_ESTRUTURA: 'da0324cb-abf6-4633-8175-cd80997267aa',
  COM02_ASSESSORES: '52dd8ed0-0c0a-4524-86bd-01dc121487b3',
  COM03_PARCEIROS: '3350800e-d771-4963-a0c9-342ed268ca4a',
}
const FORN = {
  FORMULA_DO_BOI: 'b2bbeb01-12a8-4fef-ad4c-888664a3c02f', // 65.565.807/0001-17
  DIGITAL_NET: 'f9aacd21-a469-4014-8dd0-32d37f911a41', // 08.929.889/0001-06
  DOUGLAS_BISPO: 'e2ea805a-ce5e-4b69-836e-2b178c61bcf3',
}
// CR já baixadas (datas de recebimento conferem com o extrato)
const CR = {
  LS_ERURAL: '59f9672a-f978-47a3-b4ab-cdf203966c5e',
  KITO: '95631c0c-9848-4459-9ca7-9a5e79c76484',
  CAMPARINO: '666022ec-d025-4941-a917-8fad6764e881',
  MATRIZES_EAO: 'a616c62b-42f7-485e-ae61-99698b84d72e',
  TOUROS_EAO: '5f7ee022-bd0f-4dd3-8167-fc82d123a6e5',
}
// CP de folha junho a baixar (numero_documento -> forma/data de pagamento)
const BAIXAS_FOLHA = {
  'BULA-2026-CP-FOLHA-JUN-LEONARDO': { data: '2026-07-02', forma: 'transferencia' },
  'BULA-2026-CP-FOLHA-JUN-FABIOOMENNA': { data: '2026-07-03', forma: 'pix' },
  'BULA-2026-CP-FOLHA-JUN-DOUGLASBISPO': { data: '2026-07-03', forma: 'pix' },
  'BULA-2026-CP-FOLHA-JUN-JOAOEDUARDO': { data: '2026-07-06', forma: 'pix' },
  'BULA-2026-CP-FOLHA-JUN-JOAOGABRIEL': { data: '2026-07-06', forma: 'pix' },
}

// CP novas (já pagas) espelhando pagamentos sem título
const CPS_NOVAS = [
  { doc: 'BULA-2026-CP-DARF-EMPREGADOS-JUN2026', descricao: 'DARF EMPREGADOS - COMPETÊNCIA JUNHO/2026', valor: 2225.46,
    categoria_id: CAT.IMPOSTOS, centro_custo_id: CC.IMP, fornecedor_id: null, data: '2026-07-01', forma: 'pix',
    obs: 'Pix 01/07 p/ 00.394.460/0058-87 (Tesouro/RFB), memo "Darf Empregados". Encargos da folha jun/2026.' },
  { doc: 'BULA-2026-CP-GUIA-CEF-JUN2026', descricao: 'GUIA CAIXA ECONÔMICA (FGTS provável) - COMPETÊNCIA JUNHO/2026', valor: 938.67,
    categoria_id: CAT.IMPOSTOS, centro_custo_id: CC.IMP, fornecedor_id: null, data: '2026-07-01', forma: 'pix',
    obs: 'Pix 01/07 p/ 00.360.305/0001-04 (Caixa Econômica Federal), sem memo. Provável FGTS jun/2026 — CONFIRMAR guia.' },
  { doc: 'BULA-2026-CP-REPASSE-FORMULA-NF8', descricao: 'NF 8 - PARCERIA FORMULA DO BOI (LEILÃO 02/06)', valor: 5000,
    categoria_id: CAT.REPASSE, centro_custo_id: CC.COM03_PARCEIROS, fornecedor_id: FORN.FORMULA_DO_BOI, data: '2026-07-02', forma: 'pix',
    obs: 'Pix 02/07 p/ 65.565.807/0001-17 (Formula do Boi), memo "NF 8 Parceria Formula 2de6".' },
  { doc: 'BULA-2026-CP-DIGITALNET-ULTIMA-2026-07', descricao: 'DIGITAL NET - INTERNET ESCRITÓRIO (ÚLTIMO PAGAMENTO)', valor: 142.92,
    categoria_id: CAT.ENERGIA_TELEFONE, centro_custo_id: CC.OP02_ESTRUTURA, fornecedor_id: FORN.DIGITAL_NET, data: '2026-07-02', forma: 'boleto',
    obs: 'Débito de título 02/07, memo "Digital Net - último pagamento" (contrato encerrado).' },
  { doc: 'BULA-2026-CP-REEMB-DOUGLAS-TRESMAR-JMP-ARATAU', descricao: 'REEMBOLSO DESPESAS LEILÕES TRESMAR/JMP/FLOR DO ARATAU - DOUGLAS BISPO', valor: 1772.15,
    categoria_id: CAT.DESP_OP_LEILAO, centro_custo_id: CC.COM02_ASSESSORES, fornecedor_id: FORN.DOUGLAS_BISPO, data: '2026-07-06', forma: 'pix',
    obs: 'Pix 06/07 p/ ***.770.065-** (Douglas Bispo Carvalho), memo "Reembolso Despesas Leilao Tresmar JMP e Flor do Aratau".' },
]

// Movimentos do extrato (na ordem do banco, mais antigos primeiro)
const MOVS = [
  // ----- 30/06 (tarde; faltava no import anterior) -----
  { data: '2026-06-30', tipo: 'entrada', valor: 17833.31, header: 'PIX RECEB.OUTRA IF', docBanco: 'Pix', contraparte: 'E-RURAL ATIVIDADES DE INTERNET LTDA', docContraparte: '31.793.454 0001-90', ref: '', cat: CAT.RECEBIMENTO_CLIENTE, status: 'conciliado', crId: CR.LS_ERURAL, nota: 'CR LEILÃO LS AGROPECUARIA (31/05) - E-RURAL' },
  // ----- 01/07 -----
  { data: '2026-07-01', tipo: 'saida', valor: 2225.46, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '00.394.460 0058-87', ref: 'Darf Empregados', cat: CAT.IMPOSTOS, status: 'conciliado', cpDoc: 'BULA-2026-CP-DARF-EMPREGADOS-JUN2026' },
  { data: '2026-07-01', tipo: 'saida', valor: 938.67, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '00.360.305 0001-04', ref: 'Guia CEF (FGTS provavel)', cat: CAT.IMPOSTOS, status: 'conciliado', cpDoc: 'BULA-2026-CP-GUIA-CEF-JUN2026' },
  { data: '2026-07-01', tipo: 'saida', valor: 2.08, header: 'TARIFA COBRANÇA', docBanco: '272664', contraparte: '', docContraparte: '', ref: '', cat: CAT.TARIFAS, status: 'classificado' },
  { data: '2026-07-01', tipo: 'entrada', valor: 15030.00, header: 'CRÉD.LIQUIDAÇÃO COBRANÇA', docBanco: '272244', contraparte: '', docContraparte: '', ref: '', cat: CAT.RECEBIMENTO_CLIENTE, status: 'conciliado', crId: CR.KITO, nota: 'CR LEILÃO NELORE - MARCOS DE REZENDE - KITO - LEILOBOI' },
  // ----- 02/07 -----
  { data: '2026-07-02', tipo: 'saida', valor: 32.98, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '17.895.646 0001-87', ref: '', cat: CAT.OUTRAS, status: 'pendente' },
  { data: '2026-07-02', tipo: 'saida', valor: 5000.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '65.565.807 0001-17', ref: 'NF 8 Parceria Formula 2de6', cat: CAT.REPASSE, status: 'conciliado', cpDoc: 'BULA-2026-CP-REPASSE-FORMULA-NF8' },
  { data: '2026-07-02', tipo: 'saida', valor: 142.92, header: 'DÉB.TIT.COMPE.EFETI', docBanco: '2892671', contraparte: '', docContraparte: '', ref: 'Digital Net - ultimo pagamento', cat: CAT.ENERGIA_TELEFONE, status: 'conciliado', cpDoc: 'BULA-2026-CP-DIGITALNET-ULTIMA-2026-07' },
  { data: '2026-07-02', tipo: 'entrada', valor: 15501.22, header: 'CRÉD.TED-STR', docBanco: '368292587', contraparte: 'JOSE H V MARTINS', docContraparte: '037.312.786-34', ref: 'CODIGO TED: T1075351119', cat: CAT.RECEBIMENTO_CLIENTE, status: 'conciliado', crId: CR.CAMPARINO, nota: 'CR 41o TOUROS CAMPARINO - COBERTURA BULA' },
  { data: '2026-07-02', tipo: 'saida', valor: 13500.00, header: 'DB.TR.C.DIF.TIT.INT', docBanco: '2891348', contraparte: 'LEONARDO SERAFIM FRANCISCO LTDA', docContraparte: '', ref: 'NF 12 Servicos Prestados Leonardo', cat: CAT.FOLHA, status: 'conciliado', cpDoc: 'BULA-2026-CP-FOLHA-JUN-LEONARDO' },
  { data: '2026-07-02', tipo: 'saida', valor: 6000.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '***.308.191-**', ref: 'Salario Mes de Junho', cat: CAT.FOLHA, status: 'classificado', nota: 'IDENTIFICAR: salario 6.000 sem CP de folha correspondente' },
  // ----- 03/07 -----
  { data: '2026-07-03', tipo: 'saida', valor: 11700.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '59.791.094 0001-07', ref: 'NF 25 Fabio Prestacao Servicos Junho', cat: CAT.FOLHA, status: 'conciliado', cpDoc: 'BULA-2026-CP-FOLHA-JUN-FABIOOMENNA' },
  { data: '2026-07-03', tipo: 'saida', valor: 3600.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '50.938.748 0001-08', ref: 'NF 33 Douglas Servicos Prestados Junho', cat: CAT.FOLHA, status: 'conciliado', cpDoc: 'BULA-2026-CP-FOLHA-JUN-DOUGLASBISPO' },
  { data: '2026-07-03', tipo: 'entrada', valor: 80272.01, header: 'CRED.TRANSF.CONTAS INTERCREDIS', docBanco: '3178', contraparte: 'EAO EMPREENDIMENTOS AGROPECUARIOS E ORGA', docContraparte: '00.141.269 0007-83', ref: 'BULA ASSESSORIA NF 608', cat: CAT.RECEBIMENTO_CLIENTE, status: 'conciliado', crId: CR.MATRIZES_EAO, nota: 'Paga DUAS CR: MATRIZES EAO 54.669,29 (vinculada) + TOUROS EAO 25.602,72 (id 5f7ee022). Soma exata 80.272,01.' },
  // ----- 06/07 -----
  { data: '2026-07-06', tipo: 'saida', valor: 1772.15, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '***.770.065-**', ref: 'Reembolso Despesas Leilao Tresmar JMP e Flor do Aratau', cat: CAT.DESP_OP_LEILAO, status: 'conciliado', cpDoc: 'BULA-2026-CP-REEMB-DOUGLAS-TRESMAR-JMP-ARATAU' },
  { data: '2026-07-06', tipo: 'saida', valor: 2000.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '***.168.746-**', ref: 'Fixo Gabriel Marketing Junho', cat: CAT.FOLHA, status: 'conciliado', cpDoc: 'BULA-2026-CP-FOLHA-JUN-JOAOGABRIEL' },
  { data: '2026-07-06', tipo: 'saida', valor: 3000.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '***.037.156-**', ref: 'Ref Fixo Joao Mes de Junho', cat: CAT.FOLHA, status: 'conciliado', cpDoc: 'BULA-2026-CP-FOLHA-JUN-JOAOEDUARDO' },
  { data: '2026-07-06', tipo: 'saida', valor: 1058.00, header: 'DÉB.TIT.COMPE.EFETI', docBanco: '2889714', contraparte: '', docContraparte: '', ref: 'Contador', cat: CAT.SERVICOS_TERCEIROS, status: 'conciliado', cpDoc: 'DESPFIXA-CONTABIL-2026-07' },
]

function descricao(m) {
  const tail = m.contraparte || m.ref
  return m.header + (tail ? ` - ${tail}` : '')
}
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
function docId(m) {
  return 'SICOOB-2026-' + createHash('md5').update(`${m.data}|${m.tipo}|${r2(m.valor)}|${descricao(m)}`).digest('hex').slice(0, 16).toUpperCase()
}

// saldo de verificação
const net = MOVS.reduce((s, m) => s + (m.tipo === 'entrada' ? m.valor : -m.valor), 0)
console.log(DRY_RUN ? '*** DRY RUN (nada gravado) ***' : '*** GRAVANDO EM PRODUCAO ***')
console.log(`Movimentos: ${MOVS.length} | net ${brl(net)} | 55.426,02 + net = ${brl(r2(55426.02 + net))} (banco: ${brl(SALDO_BANCO)})\n`)
if (r2(55426.02 + net) !== SALDO_BANCO) throw new Error('Saldo de verificacao NAO bate — abortando.')

// 1) CP novas (pagas)
const cpIdByDoc = {}
for (const c of CPS_NOVAS) {
  const payload = {
    descricao: c.descricao, fornecedor_id: c.fornecedor_id, categoria_id: c.categoria_id, centro_custo_id: c.centro_custo_id,
    valor: c.valor, emissao: c.data, vencimento: c.data, status: 'pago', data_pagamento: c.data, valor_pago: c.valor,
    forma_pagamento: c.forma, numero_documento: c.doc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
    observacoes: `${c.obs} | Criada no import do extrato 06/07 para amarrar o pagamento ao titulo.`,
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

// 2) Baixa das CP de folha junho + contabilidade (ids por numero_documento)
const docsCP = [...Object.keys(BAIXAS_FOLHA), 'DESPFIXA-CONTABIL-2026-07']
const { data: cpsExist } = await sb.from('erp_contas_pagar').select('id,numero_documento,status,valor').in('numero_documento', docsCP)
for (const cp of cpsExist || []) {
  cpIdByDoc[cp.numero_documento] = cp.id
  const bx = BAIXAS_FOLHA[cp.numero_documento]
  if (!bx) continue
  if (cp.status === 'pago') { console.log(`[=] CP folha ja paga ${cp.numero_documento}`); continue }
  if (DRY_RUN) { console.log(`[~] baixar CP folha ${cp.numero_documento} ${brl(cp.valor)} (pago ${bx.data})`); continue }
  const { error } = await sb.from('erp_contas_pagar').update({
    status: 'pago', data_pagamento: bx.data, valor_pago: cp.valor, forma_pagamento: bx.forma, updated_at: now(),
  }).eq('id', cp.id)
  if (error) throw new Error(`baixa ${cp.numero_documento}: ${error.message}`)
  console.log(`[~] CP folha BAIXADA ${cp.numero_documento} ${brl(cp.valor)} (pago ${bx.data})`)
}

// 3) Movimentos do extrato
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
    conta_pagar_id: m.cpDoc ? (cpIdByDoc[m.cpDoc] || null) : null,
  }
  if (m.cpDoc && !cpIdByDoc[m.cpDoc] && !DRY_RUN) throw new Error(`CP nao encontrada p/ doc ${m.cpDoc}`)
  if (DRY_RUN) { console.log(`[+] ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(13)} [${m.status}]${m.cpDoc ? ' CP:' + m.cpDoc : ''}${m.crId ? ' CR✓' : ''} ${desc.slice(0, 48)}`); inserted++; continue }
  const { error } = await sb.from('erp_movimentos_bancarios').insert(payload)
  if (error) throw new Error(`mov ${m.data} ${brl(m.valor)}: ${error.message}`)
  console.log(`[+] ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(13)} [${m.status}] ${desc.slice(0, 55)}`)
  inserted++
}

// 4) saldo da conta: NAO gravar saldo_atual direto — o trigger trg_mov_saldo deriva
//    saldo_atual = saldo_inicial + Σ movimentos e sobrescreve qualquer valor manual.
//    O acerto correto (via saldo_inicial) esta em scripts/ajusta-saldos-iniciais-2026-07-06.mjs.
if (!DRY_RUN) {
  const { data: rec, error } = await sb.rpc('erp_recalc_saldo', { p_conta: SICOOB })
  if (error) throw new Error(`saldo: ${error.message}`)
  console.log(`\nSaldo derivado da conta apos import: ${brl(rec)} (banco: ${brl(SALDO_BANCO)}).`)
}
console.log(`\nConcluido. Movimentos novos: ${inserted} | ja existiam: ${skipped}`)
console.log('PENDENTES DE IDENTIFICACAO: salario 6.000 (02/07, ***.308.191-**), pix 32,98 (02/07, 17.895.646/0001-87).')
console.log('FOLHA JUNHO ainda em aberto: JOAO ANTONIO 2.000 (vencida 30/06, sem pagamento no extrato).')
