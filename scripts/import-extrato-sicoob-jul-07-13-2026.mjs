// Importa os movimentos do extrato Sicoob de 07/07 (o debito 3.620,67 que o import
// anterior perdeu) ate 13/07/2026 — a conciliacao no ERP so ia ate 07/07.
// Fonte: Extrato Sicoob (Internet Banking), periodo lido 07/07–13/07/2026 em 14/07/2026.
//
// Validacao por saldo (banco, SALDO DO DIA do extrato):
//   07/07=110.514,98  08/07=101.475,12  09/07=98.074,84  10/07=94.993,78  13/07=75.240,55
//   ERP antes deste import: saldo_atual Sicoob = 114.135,65 (ia so ate 07/07 e SEM o 3.620,67).
//   net dos movimentos abaixo = -38.895,10  ->  114.135,65 - 38.895,10 = 75.240,55 (bate com o banco).
//
// Baixas amarradas (valor exato + semantica):
//  - 07/07 -3.620,67 "Ref as despesas Fabio Mes de Junho" (FO Assessoria 59.791.094)
//      -> CP "DESPESAS JUNHO FABIO" (1776a29e, R$ 3.620,67, aberto) PAGA.
//  - 13/07 +7.281,00 OSMAN LOUREIRO FARIAS NETO
//      -> CR "LEILAO SELECAO NELORE FLOC - COMISSAO BULA" (cc8d10e6, R$ 7.281, aberto) RECEBIDA.
//
// Deliberadamente NAO baixadas (importadas como 'classificado'/'pendente' c/ nota):
//  - Comissoes que nao casam com titulo unico: Rusa 7.455 (CP aberta e consolidada 64.945),
//    Lucas 2.758,50 (3 leiloes; CPs parciais nao somam), Laila 442,50 (sem CP), Parceiro JMP 6.570 (sem CP exata).
//  - Diarias Junho 2.100 (pago a CPF ***.031.349-**): valor coincide com uma CP de comissao
//    Fabio, mas memo/beneficiario diferentes -> tratado como despesa, sem baixa.
//  - Pass-through Leilao Prata 2025: +38.000 (Francisco Prata) e -38.000 (Felipe Vilela) no mesmo
//    dia -> Transferencias Internas (dinheiro de leilao passando; fora do P&L). CONFERIR.
//  - Reembolso Leonardo Kriz 2.030,20 (sem CP), taxas/multas/hoteis/passagens: despesas classificadas.
//
// Idempotente (movimento por chave natural conta+data+tipo+valor+descricao).
// Uso: DRY_RUN=1 node scripts/import-extrato-sicoob-jul-07-13-2026.mjs   (nada grava)
//      node scripts/import-extrato-sicoob-jul-07-13-2026.mjs             (grava em producao)
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
const SALDO_BANCO = 75240.55
const FONTE = 'Extrato Sicoob (Internet Banking) periodo 07/07-13/07/2026, lido em 14/07/2026'

const CAT = {
  RECEBIMENTO_CLIENTE: 'ee101d8d-4c90-4cbc-8139-a156e046e20f',
  OUTRAS_RECEITAS: 'bf73ee5c-3b29-42dc-95d7-e3d37cffd604',
  REEMBOLSO: '6e79fd9e-f837-4ff4-a73d-3d8bdabe7ce7',
  REPASSE: '5dcdc58a-d81b-4a4c-a81a-5e703e6a1a90',
  COMISSAO_FUNC: 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e',
  DESP_OP_LEILAO: '562264eb-8134-4990-a56b-d884279acf90',
  VIAGEM: '98083139-0fbf-487a-9988-a08519ebf259',
  IMPOSTOS: '6d3270c8-2680-4cdd-a709-5b1520d1f430',
  TARIFAS: 'f8ae3a53-bb4e-414e-97d1-ebdca81df658',
  JUROS_MULTAS: 'd41a665c-be01-42b0-a607-76b5b893b7f7',
  INTEGRALIZACAO: '9e152b58-58ac-48b3-a17d-3b9d4a6acbb2',
  ALIMENTACAO: 'b26ffe87-f4d6-4060-b697-a7f698c35f7d',
  OUTRAS_DESPESAS: '20c2defd-415c-42cc-8939-fcd8cf104280',
  TRANSF_ENTRADA: '2847979e-b319-4cad-9510-828c9d6bc1c0',
  TRANSF_SAIDA: '1d83b7e5-aa77-4e1d-a774-64ecfda0b746',
}

const CP_DESPESAS_FABIO_JUN = '1776a29e-c04e-4350-912c-81beb67e9c28' // 3.620,67 aberto
const CR_FLOC_OSMAN = 'cc8d10e6-82c0-49e7-ae56-efc34eefe1c5'          // 7.281,00 aberto

// Movimentos novos (mais antigos primeiro)
const MOVS = [
  // ----- 07/07 (debito perdido no import anterior) -----
  { data: '2026-07-07', tipo: 'saida', valor: 3620.67, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: 'FO ASSESSORIA PECUARIA', docContraparte: '59.791.094 0001-07', ref: 'Ref as despesas Fabio Mes de Junho', cat: CAT.REEMBOLSO, status: 'conciliado', cpId: CP_DESPESAS_FABIO_JUN, nota: 'Baixa CP DESPESAS JUNHO FABIO (valor exato). Perdido no import anterior de 07/07.' },
  // ----- 08/07 -----
  { data: '2026-07-08', tipo: 'saida', valor: 44.82, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: 'PAO & TAL CONVENIENCIAS LTDA', docContraparte: '33.780.388 0001-40', ref: 'Solicitacao Pix', cat: CAT.ALIMENTACAO, status: 'classificado', nota: 'Conveniencia (mesmo CNPJ do pix 79,37 de 06/07).' },
  { data: '2026-07-08', tipo: 'saida', valor: 836.00, header: 'DEB.TIT.COMPE.EFETI', docBanco: '2907765', contraparte: '', docContraparte: '', ref: 'Hotel Leonardo Leilao Meab e Modelo', cat: CAT.DESP_OP_LEILAO, status: 'classificado' },
  { data: '2026-07-08', tipo: 'saida', valor: 1640.00, header: 'DEB.TIT.COMPE.EFETI', docBanco: '2907761', contraparte: '', docContraparte: '', ref: 'Hotel Marcelo reuniao Bula e Leonardo', cat: CAT.DESP_OP_LEILAO, status: 'classificado' },
  { data: '2026-07-08', tipo: 'saida', valor: 2388.84, header: 'DEB.TIT.COMPE.EFETI', docBanco: '2907414', contraparte: '', docContraparte: '', ref: 'Ref Hotel Douglas e Fabio Leilao JMP e T', cat: CAT.DESP_OP_LEILAO, status: 'classificado' },
  { data: '2026-07-08', tipo: 'saida', valor: 2100.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '***.031.349-**', ref: 'Ref as diarias de Junho', cat: CAT.COMISSAO_FUNC, status: 'classificado', nota: 'Diarias equipe junho. Valor coincide com CP comissao Fabio Sao Francisco 2.100 mas beneficiario e memo diferentes -> NAO baixado.' },
  { data: '2026-07-08', tipo: 'saida', valor: 2030.20, header: 'DEB.TRANSF.INTERCRE', docBanco: '2906309', contraparte: 'LEONARDO SERAFIM FRANCISCO LTDA', docContraparte: '', ref: 'Reembolso Despesas Leonardo Leilao Kriz', cat: CAT.REEMBOLSO, status: 'classificado', nota: 'Sem CP correspondente aberta.' },
  // ----- 09/07 -----
  { data: '2026-07-09', tipo: 'saida', valor: 266.88, header: 'DEB.TIT.COMPE.EFETI', docBanco: '2909996', contraparte: '', docContraparte: '', ref: 'Multa Unidas', cat: CAT.JUROS_MULTAS, status: 'classificado' },
  { data: '2026-07-09', tipo: 'saida', valor: 133.40, header: 'DEB.TIT.COMPE.EFETI', docBanco: '2909993', contraparte: '', docContraparte: '', ref: 'Multa Unidas', cat: CAT.JUROS_MULTAS, status: 'classificado' },
  { data: '2026-07-09', tipo: 'saida', valor: 3000.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '13.347.016 0001-17', ref: 'solicitado Joao', cat: CAT.OUTRAS_DESPESAS, status: 'pendente', nota: 'IDENTIFICAR: pix 3.000 p/ 13.347.016/0001-17, memo "solicitado Joao".' },
  // ----- 10/07 -----
  { data: '2026-07-10', tipo: 'saida', valor: 39.00, header: 'DEB.PARCELAS SUBSC', docBanco: '46026', contraparte: '', docContraparte: '', ref: 'Parcela subscricao/integralizacao', cat: CAT.INTEGRALIZACAO, status: 'classificado' },
  { data: '2026-07-10', tipo: 'saida', valor: 129.90, header: 'DEBITO PACOTE SERV', docBanco: '129', contraparte: '', docContraparte: '', ref: 'Debito pacote de servicos', cat: CAT.TARIFAS, status: 'classificado' },
  { data: '2026-07-10', tipo: 'saida', valor: 1233.66, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '22.002.438 0001-41', ref: 'passagem Fabio Leilao LS 7de8', cat: CAT.VIAGEM, status: 'classificado' },
  { data: '2026-07-10', tipo: 'saida', valor: 2758.50, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '***.510.291-**', ref: 'Ref Lucas Comissao Matinha 19do5 MNO 11do6 e JMP 15do6', cat: CAT.COMISSAO_FUNC, status: 'classificado', nota: 'Comissao Lucas consolidada de 3 leiloes (Matinha+MNO+JMP). CPs abertas parciais nao somam 2.758,50 -> nao baixado.' },
  { data: '2026-07-10', tipo: 'entrada', valor: 1080.00, header: 'PIX RECEB.OUTRA IF', docBanco: 'Pix', contraparte: 'TANGARA PECUARIA PART LTD', docContraparte: '31.376.908 0001-28', ref: 'nfse2026000616 Rancho da Matinha', cat: CAT.RECEBIMENTO_CLIENTE, status: 'classificado', nota: 'NFS-e 2026000616. Sem CR correspondente (nao e o CR Matinha Embryo Programa 2.400).' },
  // ----- 13/07 -----
  { data: '2026-07-13', tipo: 'saida', valor: 6570.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '***.919.892-**', ref: 'Ref Comissao de Parceiro JMP', cat: CAT.REPASSE, status: 'classificado', nota: 'Comissao parceiro JMP p/ CPF. Sem CP exata -> nao baixado.' },
  { data: '2026-07-13', tipo: 'saida', valor: 7455.00, header: 'DEB.TRANSF.INTERCRE', docBanco: '2919587', contraparte: 'RUSA ASSESSORIA PECUARIA LTDA', docContraparte: '', ref: 'NF 26 Comissao Rusa Nelore Kriz 16do6 Ka', cat: CAT.REPASSE, status: 'classificado', nota: 'NF 26 Rusa. CP aberta Rusa e consolidada (64.945) -> nao baixado (seria parcial).' },
  { data: '2026-07-13', tipo: 'entrada', valor: 7281.00, header: 'PIX RECEB.OUTRA IF', docBanco: 'Pix', contraparte: 'OSMAN LOUREIRO FARIAS NETO', docContraparte: '***.768.784-**', ref: '', cat: CAT.RECEBIMENTO_CLIENTE, status: 'conciliado', crId: CR_FLOC_OSMAN, nota: 'Baixa CR LEILAO SELECAO NELORE FLOC - COMISSAO BULA (valor exato 7.281).' },
  { data: '2026-07-13', tipo: 'entrada', valor: 0.05, header: 'PIX RECEB.OUTRA IF', docBanco: 'Pix', contraparte: 'Joao Eduardo Lucas Pereira', docContraparte: '***.037.156-**', ref: '', cat: CAT.OUTRAS_RECEITAS, status: 'classificado', nota: 'Pix teste 0,05.' },
  { data: '2026-07-13', tipo: 'saida', valor: 442.50, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '66.991.669 0001-09', ref: 'Laila Comissao Leilao 4R 9do5', cat: CAT.COMISSAO_FUNC, status: 'classificado', nota: 'Comissao Laila leilao 4R. Sem CP -> nao baixado.' },
  { data: '2026-07-13', tipo: 'saida', valor: 12566.78, header: 'DEB.CONV.PREFEITURA', docBanco: '2917616', contraparte: '', docContraparte: '', ref: 'Guia ISSQN Bula Assessoria', cat: CAT.IMPOSTOS, status: 'classificado' },
  { data: '2026-07-13', tipo: 'saida', valor: 38000.00, header: 'TRANSF.PIX SICOOB', docBanco: '2917338', contraparte: 'FELIPE VILELA ANDRADE', docContraparte: '', ref: 'Recebimento Leilao Prata 2025', cat: CAT.TRANSF_SAIDA, status: 'classificado', nota: 'PASS-THROUGH Leilao Prata 2025: contrapartida da entrada 38.000 de Francisco Prata no mesmo dia. Dinheiro de leilao (fora do P&L). CONFERIR categoria.' },
  { data: '2026-07-13', tipo: 'entrada', valor: 38000.00, header: 'PIX RECEB.OUTRA IF', docBanco: 'Pix', contraparte: 'FRANCISCO PRATA MENDONCA', docContraparte: '***.652.525-**', ref: 'Leilao Prata 2025', cat: CAT.TRANSF_ENTRADA, status: 'classificado', nota: 'PASS-THROUGH Leilao Prata 2025: sai no mesmo dia p/ Felipe Vilela Andrade. Dinheiro de leilao (fora do P&L). CONFERIR categoria.' },
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

// validacao por saldo
const net = MOVS.reduce((s, m) => s + (m.tipo === 'entrada' ? m.valor : -m.valor), 0)
const { data: contaAntes } = await sb.from('erp_contas_bancarias').select('saldo_atual').eq('id', SICOOB).single()
const saldoAntes = Number(contaAntes.saldo_atual)
console.log(DRY_RUN ? '*** DRY RUN (nada gravado) ***' : '*** GRAVANDO EM PRODUCAO ***')
console.log(`Movimentos: ${MOVS.length} | net ${brl(net)}`)
console.log(`Saldo ERP antes: ${brl(saldoAntes)} + net = ${brl(r2(saldoAntes + net))} (banco: ${brl(SALDO_BANCO)})\n`)
if (r2(saldoAntes + net) !== SALDO_BANCO) throw new Error(`Saldo de verificacao NAO bate (${brl(r2(saldoAntes + net))} != ${brl(SALDO_BANCO)}) — abortando.`)

// 1) Baixa CP DESPESAS JUNHO FABIO (paga 07/07)
{
  const { data: cp } = await sb.from('erp_contas_pagar').select('id,status,valor').eq('id', CP_DESPESAS_FABIO_JUN).single()
  if (cp.status === 'pago') console.log('[=] CP DESPESAS JUNHO FABIO ja paga')
  else if (DRY_RUN) console.log(`[~] baixar CP DESPESAS JUNHO FABIO ${brl(cp.valor)} (paga 07/07)`)
  else {
    const { error } = await sb.from('erp_contas_pagar').update({
      status: 'pago', valor_pago: cp.valor, data_pagamento: '2026-07-07', forma_pagamento: 'pix', updated_at: now(),
    }).eq('id', CP_DESPESAS_FABIO_JUN)
    if (error) throw new Error(`baixa CP Fabio despesas: ${error.message}`)
    console.log(`[~] CP DESPESAS JUNHO FABIO baixada ${brl(cp.valor)} (paga 07/07)`)
  }
}

// 2) Baixa CR FLOC / Osman (recebida 13/07)
{
  const { data: cr } = await sb.from('erp_contas_receber').select('id,status,valor').eq('id', CR_FLOC_OSMAN).single()
  if (cr.status === 'recebido') console.log('[=] CR FLOC Osman ja recebida')
  else if (DRY_RUN) console.log(`[~] baixar CR FLOC/Osman ${brl(cr.valor)} (recebida 13/07)`)
  else {
    const { error } = await sb.from('erp_contas_receber').update({
      status: 'recebido', valor_recebido: cr.valor, data_recebimento: '2026-07-13', forma_recebimento: 'pix', updated_at: now(),
    }).eq('id', CR_FLOC_OSMAN)
    if (error) throw new Error(`baixa CR FLOC Osman: ${error.message}`)
    console.log(`[~] CR FLOC/Osman baixada ${brl(cr.valor)} (recebida 13/07)`)
  }
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
    conta_receber_id: m.crId || null, conta_pagar_id: m.cpId || null,
  }
  if (DRY_RUN) { console.log(`[+] ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(13)} [${m.status}]${m.cpId ? ' CP✓' : ''}${m.crId ? ' CR✓' : ''} ${desc.slice(0, 46)}`); inserted++; continue }
  const { error } = await sb.from('erp_movimentos_bancarios').insert(payload)
  if (error) throw new Error(`mov ${m.data} ${brl(m.valor)}: ${error.message}`)
  console.log(`[+] ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(13)} [${m.status}] ${desc.slice(0, 55)}`)
  inserted++
}

// 4) saldo: derivado por trigger; recalcula e confere com o banco
if (!DRY_RUN) {
  const { data: rec, error } = await sb.rpc('erp_recalc_saldo', { p_conta: SICOOB })
  if (error) throw new Error(`saldo: ${error.message}`)
  console.log(`\nSaldo derivado da conta apos import: ${brl(rec)} (banco: ${brl(SALDO_BANCO)}) ${r2(rec) === SALDO_BANCO ? '✓ BATE' : '✗ NAO BATE'}`)
}
console.log(`\nConcluido. Movimentos novos: ${inserted} | ja existiam: ${skipped}`)
console.log('PENDENTES: pix 3.000 (09/07, 13.347.016/0001-17 "solicitado Joao"); confirmar categoria do pass-through Leilao Prata 38k (Transferencias Internas).')
