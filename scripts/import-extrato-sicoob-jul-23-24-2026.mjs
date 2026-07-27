// Importa os movimentos do extrato Sicoob de 23/07 e 24/07/2026 — a conciliacao
// no ERP ia ate 22/07. Fonte: extrato PDF sicoob_2026_07_27_13_21_06.pdf
// (periodo 01/07-27/07/2026, emitido em 27/07/2026 13:21).
//
// Validacao por saldo (banco, SALDO DO DIA do extrato):
//   22/07=42.828,87 (ancora, bate com o ERP)  23/07=94.028,97  24/07=1.317,97
//   net dos movimentos abaixo = -41.510,90 -> 42.828,87 - 41.510,90 = 1.317,97 (bate).
//
// O dia 24/07 e o CICLO DE COMISSOES DE JUNHO/2026 (venc. 27/07, antecipado):
//   -28.493,00 Douglas (NF 35)   = soma EXATA das 9 CPs de junho dele  -> todas PAGAS
//   -21.788,00 Leonardo (NF 13)  = soma EXATA das 10 CPs de junho dele -> todas PAGAS
//   -40.430,00 Fabio (NF 27 "1de2") = 2/3 de 60.645,00 (13 CPs de junho).
//        Decisao do chefe: 2/3 agora, 1/3 (R$ 20.215,00) no/apos 10/08.
//        -> as 13 CPs viram 'parcial' com valor_pago = 2/3 do valor (todas divisiveis
//           por 3, o rateio fecha em 40.430,00 sem centavo de sobra) e vencimento do
//           saldo remanejado para 10/08/2026.
//   -2.000,00 trafego/captacao touros (13.347.016/0001-17, mesma agencia de trafego
//        dos pix de marketing anteriores) -> Marketing e Publicidade, classificado.
//        NAO baixa a CP "BONUS META BATIDA JMP - JOAO ANTONIO" (mesmo valor, outro
//        beneficiario e outro memo).
//
// FORA da base dos 2/3: a CP 47d40e98 "COMISSAO LEILAO VIRTUAL NELORE MEAB &
// FAZENDA MODELO - FABIO OMENA (3%)" (R$ 2.421,00) nao entrou nos 60.645,00 do
// acerto — fica intocada, em aberto, para conferencia.
//
// 23/07 +51.200,10 BULA REMATES "REF NF 624 LEILOES NELORE KRIZ IPB RIO BO":
//   nao casa (nem sozinho nem em combinacao) com CR aberta — as CRs Remates em
//   aberto sao Kriz 16.122 + Rio Bonito 825 = 16.947 e a de IPB ja esta recebida.
//   Importado como 'classificado' em Comissoes Recebidas (mesmo tratamento dos
//   creditos Bula Remates anteriores). CONFERIR o rateio da NF 624.
//
// Idempotente (movimento por chave natural conta+data+tipo+valor+descricao; CPs
// so mudam se ainda estiverem 'aberto').
// Uso: DRY_RUN=1 node scripts/import-extrato-sicoob-jul-23-24-2026.mjs  (nada grava)
//      node scripts/import-extrato-sicoob-jul-23-24-2026.mjs            (grava em producao)
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
const SALDO_BANCO = 1317.97
const PAGO_EM = '2026-07-24'
const FONTE = 'Extrato Sicoob (PDF sicoob_2026_07_27_13_21_06.pdf) periodo 01/07-27/07/2026, lido em 27/07/2026'

const CAT = {
  COMISSOES_RECEBIDAS: '0153d30c-e167-40c6-9c5a-2605bd39dc6e',
  COMISSAO_FUNC: 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e',
  MARKETING: '26762d4e-b517-48b9-98f3-155a6421264e',
}

// --- CPs do ciclo de junho, por assessor (venc. 27/07). Prefixos resolvidos
// para o id completo na consulta abaixo, que tambem confere as somas. ---
const DOUGLAS_IDS = [
  '71eb3e23', 'c817c3d0', '0a57c994', '9dda0533', 'fbd00dd3', 'b083aca3', '247b86ed', 'be1a32bd', '5ea6e5d9',
]
const LEONARDO_IDS = [
  'fcabdc03', 'be7b1dae', '31d36807', '6b3ceef2', '97059ee8', 'e0f67f04', '849190fd', 'f14552b6', '5e6540fe', '9319ce66',
]
// Base dos 60.645,00 do Fabio — NAO inclui 47d40e98 (MEAB Virtual 2.421,00)
const FABIO_IDS = [
  'd967e7d5', '93bf5798', '24db0aa8', 'f47d8d03', 'b6c9bb44', '07807ec9', 'bb90cb25',
  '7d36a0a1', 'fa709132', '168f53a3', '159270bc', '27cf8a8f', 'f551345b',
]

const DOUGLAS_TOTAL = 28493.00
const LEONARDO_TOTAL = 21788.00
const FABIO_BASE = 60645.00
const FABIO_PAGO = 40430.00 // 2/3
const FABIO_SALDO = 20215.00 // 1/3, vence 10/08/2026
const VENC_SALDO = '2026-08-10'

const MOVS = [
  {
    data: '2026-07-23', tipo: 'entrada', valor: 51200.10, header: 'TRANSF.RECEB-PIX SI', docBanco: '2945714',
    contraparte: 'BULA REMATES LTDA', docContraparte: '50.059.339 0001-31',
    ref: 'REF NF 624 LEILOES NELORE KRIZ IPB RIO BONITO', cat: CAT.COMISSOES_RECEBIDAS, status: 'classificado',
    nota: 'Acerto Bula Remates NF 624. Nao casa com CR aberta (Kriz 16.122 + Rio Bonito 825 = 16.947; IPB ja recebida) — CONFERIR o rateio da NF 624 e amarrar as CRs.',
  },
  {
    data: '2026-07-24', tipo: 'saida', valor: 40430.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix',
    contraparte: 'FO ASSESSORIA PECUARIA (FABIO OMENA)', docContraparte: '59.791.094 0001-07',
    ref: 'NF 27 Fabio 1de2 Comissao Junho', cat: CAT.COMISSAO_FUNC, status: 'conciliado',
    nota: `Comissao junho/2026 de Fabio Omena: 2/3 de ${brl(FABIO_BASE)} (13 CPs). Saldo de 1/3 (${brl(FABIO_SALDO)}) remanejado para ${VENC_SALDO}. CPs marcadas como 'parcial' com valor_pago = 2/3.`,
  },
  {
    data: '2026-07-24', tipo: 'saida', valor: 21788.00, header: 'DB.TR.C.DIF.TIT.INT', docBanco: '2947883',
    contraparte: 'LEONARDO SERAFIM FRANCISCO LTDA', docContraparte: '',
    ref: 'NF 13 Leonardo Comissao Junho', cat: CAT.COMISSAO_FUNC, status: 'conciliado',
    nota: 'Comissao junho/2026 de Leonardo Serafim, quitada integral: soma exata das 10 CPs de junho (todas baixadas).',
  },
  {
    data: '2026-07-24', tipo: 'saida', valor: 28493.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix',
    contraparte: 'DOUGLAS BISPO', docContraparte: '50.938.748 0001-08',
    ref: 'NF 35 Douglas Comissao Junho', cat: CAT.COMISSAO_FUNC, status: 'conciliado',
    nota: 'Comissao junho/2026 de Douglas Bispo, quitada integral: soma exata das 9 CPs de junho (todas baixadas).',
  },
  {
    data: '2026-07-24', tipo: 'saida', valor: 2000.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix',
    contraparte: '', docContraparte: '13.347.016 0001-17',
    ref: 'trafego captacao clientes touros', cat: CAT.MARKETING, status: 'classificado',
    nota: 'Mesma agencia de trafego dos pix de marketing anteriores (13.347.016/0001-17). NAO baixa a CP BONUS META BATIDA JMP - JOAO ANTONIO (mesmo valor, outro beneficiario).',
  },
]

function descricao(m) { const tail = m.contraparte || m.ref; return m.header + (tail ? ` - ${tail}` : '') }
function observacoes(m) {
  const parts = [FONTE]
  if (m.docBanco) parts.push(`Doc banco: ${m.docBanco}`)
  if (m.contraparte) parts.push(`Contraparte: ${m.contraparte}`)
  if (m.docContraparte) parts.push(`Documento contraparte: ${m.docContraparte}`)
  if (m.ref) parts.push(`Obs: ${m.ref}`)
  if (m.nota) parts.push(m.nota)
  parts.push(m.status === 'conciliado' ? 'Conciliacao: casado com titulos' : m.status === 'pendente' ? 'Conciliacao: sem categoria confiavel; aguarda revisao' : 'Conciliacao: classificado por descricao, sem titulo')
  return parts.join(' | ')
}
function docId(m) { return 'SICOOB-2026-' + createHash('md5').update(`${m.data}|${m.tipo}|${r2(m.valor)}|${descricao(m)}`).digest('hex').slice(0, 16).toUpperCase() }

// ---------- resolve as CPs pelos prefixos e confere os totais ----------
const { data: cpsAll, error: eCp } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,valor_pago,status,vencimento,observacoes')
  .eq('vencimento', '2026-07-27')
if (eCp) throw eCp
const byPrefix = (pref) => {
  const hit = cpsAll.filter((c) => c.id.startsWith(pref))
  if (hit.length !== 1) throw new Error(`prefixo ${pref} resolveu ${hit.length} CPs (esperado 1)`)
  return hit[0]
}
const douglas = DOUGLAS_IDS.map(byPrefix)
const leonardo = LEONARDO_IDS.map(byPrefix)
const fabio = FABIO_IDS.map(byPrefix)
const soma = (arr) => r2(arr.reduce((s, c) => s + Number(c.valor), 0))
if (soma(douglas) !== DOUGLAS_TOTAL) throw new Error(`Douglas soma ${brl(soma(douglas))} != ${brl(DOUGLAS_TOTAL)}`)
if (soma(leonardo) !== LEONARDO_TOTAL) throw new Error(`Leonardo soma ${brl(soma(leonardo))} != ${brl(LEONARDO_TOTAL)}`)
if (soma(fabio) !== FABIO_BASE) throw new Error(`Fabio soma ${brl(soma(fabio))} != ${brl(FABIO_BASE)}`)
const fabioRateio = fabio.map((c) => ({ cp: c, pago: r2(Number(c.valor) * 2 / 3) }))
const fabioSomaPago = r2(fabioRateio.reduce((s, x) => s + x.pago, 0))
if (fabioSomaPago !== FABIO_PAGO) throw new Error(`Rateio 2/3 do Fabio soma ${brl(fabioSomaPago)} != ${brl(FABIO_PAGO)}`)

// ---------- validacao por saldo ----------
const net = r2(MOVS.reduce((s, m) => s + (m.tipo === 'entrada' ? m.valor : -m.valor), 0))
const { data: contaAntes } = await sb.from('erp_contas_bancarias').select('saldo_atual').eq('id', SICOOB).single()
const saldoAntes = Number(contaAntes.saldo_atual)
console.log(DRY_RUN ? '*** DRY RUN (nada gravado) ***' : '*** GRAVANDO EM PRODUCAO ***')
console.log(`Movimentos: ${MOVS.length} | net ${brl(net)}`)
console.log(`Saldo ERP antes: ${brl(saldoAntes)} + net = ${brl(r2(saldoAntes + net))} (banco 24/07: ${brl(SALDO_BANCO)})`)
if (r2(saldoAntes + net) !== SALDO_BANCO) throw new Error(`Saldo de verificacao NAO bate (${brl(r2(saldoAntes + net))} != ${brl(SALDO_BANCO)}) — abortando.`)
console.log(`Conferencia CPs: Douglas ${brl(soma(douglas))} (${douglas.length}) | Leonardo ${brl(soma(leonardo))} (${leonardo.length}) | Fabio base ${brl(soma(fabio))} (${fabio.length}) -> 2/3 = ${brl(fabioSomaPago)}\n`)

// ---------- 1) Douglas e Leonardo: quitacao integral ----------
for (const [nome, lista, nf] of [['Douglas Bispo', douglas, 'NF 35'], ['Leonardo Serafim', leonardo, 'NF 13']]) {
  console.log(`--- ${nome} (${nf}) — quitacao integral ---`)
  for (const cp of lista) {
    if (cp.status === 'pago') { console.log(`[=] ja pago ${brl(cp.valor)} ${cp.descricao.slice(0, 55)}`); continue }
    if (cp.status !== 'aberto') throw new Error(`CP ${cp.id} em status inesperado '${cp.status}'`)
    const obs = `${cp.observacoes ? cp.observacoes + ' ' : ''}[24/07/2026] Pago no ciclo de comissoes de junho/2026 — ${nf}, PIX ${brl(cp.valor)} dentro do lote de ${brl(soma(lista))}. ${FONTE}.`
    if (DRY_RUN) { console.log(`[~] PAGAR ${brl(cp.valor).padStart(13)} ${cp.descricao.slice(0, 55)}`); continue }
    const { error } = await sb.from('erp_contas_pagar').update({
      status: 'pago', valor_pago: Number(cp.valor), data_pagamento: PAGO_EM, forma_pagamento: 'pix',
      conta_bancaria_id: SICOOB, observacoes: obs, updated_at: now(),
    }).eq('id', cp.id)
    if (error) throw new Error(`baixa CP ${cp.id}: ${error.message}`)
    console.log(`[~] PAGO ${brl(cp.valor).padStart(13)} ${cp.descricao.slice(0, 55)}`)
  }
}

// ---------- 2) Fabio: 2/3 pagos, 1/3 em aberto para 10/08 ----------
console.log(`\n--- Fabio Omena (NF 27 1de2) — 2/3 de ${brl(FABIO_BASE)} ---`)
for (const { cp, pago } of fabioRateio) {
  const saldo = r2(Number(cp.valor) - pago)
  if (cp.status === 'parcial' && r2(Number(cp.valor_pago)) === pago) { console.log(`[=] ja parcial ${brl(pago)} de ${brl(cp.valor)}`); continue }
  if (cp.status !== 'aberto') throw new Error(`CP ${cp.id} em status inesperado '${cp.status}'`)
  const obs = `${cp.observacoes ? cp.observacoes + ' ' : ''}[24/07/2026] Ciclo de comissoes junho/2026 — NF 27 (1de2): pagos 2/3 (${brl(pago)}) via PIX em 24/07, dentro do lote de ${brl(FABIO_PAGO)}. Saldo de 1/3 (${brl(saldo)}) reprogramado para ${VENC_SALDO} (NF 27 2de2), por decisao do chefe. ${FONTE}.`
  if (DRY_RUN) { console.log(`[~] PARCIAL ${brl(pago).padStart(13)} de ${brl(cp.valor).padStart(13)} (saldo ${brl(saldo)}) ${cp.descricao.slice(0, 45)}`); continue }
  const { error } = await sb.from('erp_contas_pagar').update({
    status: 'parcial', valor_pago: pago, data_pagamento: PAGO_EM, forma_pagamento: 'pix',
    conta_bancaria_id: SICOOB, vencimento: VENC_SALDO, observacoes: obs, updated_at: now(),
  }).eq('id', cp.id)
  if (error) throw new Error(`parcial CP ${cp.id}: ${error.message}`)
  console.log(`[~] PARCIAL ${brl(pago).padStart(13)} de ${brl(cp.valor).padStart(13)} (saldo ${brl(saldo)} -> ${VENC_SALDO}) ${cp.descricao.slice(0, 45)}`)
}

// ---------- 3) Movimentos do extrato ----------
console.log('\n--- Movimentos bancarios ---')
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
    conta_receber_id: null, conta_pagar_id: null,
  }
  if (DRY_RUN) { console.log(`[+] ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(13)} [${m.status}] ${desc.slice(0, 46)}`); inserted++; continue }
  const { error } = await sb.from('erp_movimentos_bancarios').insert(payload)
  if (error) throw new Error(`mov ${m.data} ${brl(m.valor)}: ${error.message}`)
  console.log(`[+] ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(13)} [${m.status}] ${desc.slice(0, 55)}`)
  inserted++
}

// ---------- 4) saldo derivado ----------
if (!DRY_RUN) {
  const { data: rec, error } = await sb.rpc('erp_recalc_saldo', { p_conta: SICOOB })
  if (error) throw new Error(`saldo: ${error.message}`)
  console.log(`\nSaldo derivado da conta apos import: ${brl(rec)} (banco: ${brl(SALDO_BANCO)}) ${r2(rec) === SALDO_BANCO ? '✓ BATE' : '✗ NAO BATE'}`)
}
console.log(`\nConcluido. Movimentos novos: ${inserted} | ja existiam: ${skipped}`)
console.log(`Em aberto do Fabio apos isso: ${brl(FABIO_SALDO)} (saldo 1/3, venc ${VENC_SALDO}) + R$ 2.421,00 (MEAB Virtual, fora da base — CONFERIR).`)
