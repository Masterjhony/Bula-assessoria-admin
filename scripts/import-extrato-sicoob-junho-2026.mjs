// Importa os movimentos FALTANTES do extrato Sicoob de junho/2026 (23/06 -> 30/06)
// a partir do extrato atualizado baixado em 30/06/2026
// (sicoob_2026_06_30_15_22_34.pdf, periodo 01/06 a 30/06).
//
// Contexto: a importacao anterior parou em 22/06 (saldo do dia 90.359,38, que
// bate exatamente com o saldo_atual da conta no ERP). Este script acrescenta os
// 15 movimentos de 23/06 a 30/06 e fecha o saldo em 55.426,02 (saldo final 30/06).
//
// Conciliacao BANCARIA (casar movimento <-> titulo CR/CP): so o que casa com
// alta confianca:
//   - ENTRADA 29/06 R$ 3.825,00 (Jose Eduardo Guimaraes Motta / TED) <-> CR
//     "LEILAO NELORE JEM" (venc 29/06, R$ 3.825,00) -> valor + data + nome.
// O resto fica classificado/pendente para revisao humana (ex.: as comissoes
// FdB/RUSA/GIR nao tem titulo de valor exato; os CP de comissao sao "PROVISORIO"
// arredondados, entao nao se concilia automatico).
//
// Uso: DRY_RUN=1 node scripts/import-extrato-sicoob-junho-2026.mjs   (revisao)
//                node scripts/import-extrato-sicoob-junho-2026.mjs   (grava em prod)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100
const now = () => new Date().toISOString()

const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const ARQ = 'sicoob_2026_06_30_15_22_34.pdf'
const CAT = {
  RECEBIMENTO_CLIENTE: 'ee101d8d-4c90-4cbc-8139-a156e046e20f',
  COMISSAO_LEILAO: 'e74434bd-3366-4015-9268-15d6640cf15f',
  MARKETING: '82d7c557-e8b4-40aa-963e-928b44b1bf54', // Marketing e Publicidade
  COMISSAO_FUNCIONARIO: 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e',
  REPASSE: '5dcdc58a-d81b-4a4c-a81a-5e703e6a1a90', // Repasse Assessorias/Parceiros
  DESP_OP_LEILAO: '562264eb-8134-4990-a56b-d884279acf90',
  OUTRAS_DESPESAS: '9e20f375-b070-4991-95f8-723210cf9bd0',
  TRANSF_INTERNA_SAIDA: '1d83b7e5-aa77-4e1d-a774-64ecfda0b746',
}
// CR a conciliar
const CR_NELORE_JEM = '6cc9b1dc-ac84-45c3-9c10-564538bd51a1'

// Movimentos faltantes 23/06 -> 30/06 (newest do extrato; validados contra os
// SALDO DO DIA: 22/06=90.359,38 ... 30/06=55.426,02).
const MOVS = [
  // ----- 23/06 -----
  { data: '2026-06-23', tipo: 'saida', valor: 29.90, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '47.759.745 0001-00', ref: '', cat: CAT.OUTRAS_DESPESAS, status: 'pendente' },
  { data: '2026-06-23', tipo: 'saida', valor: 3000.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: 'FacebookDirectBR', docContraparte: '13.347.016 0001-17', ref: 'FacebookDirectBR', cat: CAT.MARKETING, status: 'classificado' },
  { data: '2026-06-23', tipo: 'saida', valor: 76.46, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '34.767.927 0001-73', ref: '', cat: CAT.OUTRAS_DESPESAS, status: 'pendente' },
  { data: '2026-06-23', tipo: 'saida', valor: 50.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '12.900.936 0001-58', ref: '', cat: CAT.OUTRAS_DESPESAS, status: 'pendente' },
  // ----- 24/06 -----
  { data: '2026-06-24', tipo: 'entrada', valor: 3990.00, header: 'PIX RECEB.OUTRA IF', docBanco: 'Pix', contraparte: 'EDUARDO PINHEIRO CAMPOS', docContraparte: '***.530.756-**', ref: '', cat: CAT.RECEBIMENTO_CLIENTE, status: 'classificado' },
  // ----- 25/06 -----
  { data: '2026-06-25', tipo: 'saida', valor: 3594.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '***.770.065-**', ref: 'NF 30 Douglas Comissoes de Maio', cat: CAT.COMISSAO_FUNCIONARIO, status: 'classificado' },
  { data: '2026-06-25', tipo: 'saida', valor: 200.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '***.514.801-**', ref: 'limpeza escritorio Afonso Pena', cat: CAT.OUTRAS_DESPESAS, status: 'classificado' },
  // ----- 26/06 -----
  { data: '2026-06-26', tipo: 'saida', valor: 50.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '12.900.936 0001-58', ref: '', cat: CAT.OUTRAS_DESPESAS, status: 'pendente' },
  { data: '2026-06-26', tipo: 'saida', valor: 3384.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '66.146.790 0001-26', ref: 'NF 6 Comissao Leilao GIR e Girolando dia 31do5', cat: CAT.REPASSE, status: 'classificado' },
  { data: '2026-06-26', tipo: 'saida', valor: 15596.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '65.565.807 0001-17', ref: 'NF 7 Ref comissoes Abril e Maio Formula do Boi', cat: CAT.REPASSE, status: 'classificado' },
  { data: '2026-06-26', tipo: 'entrada', valor: 5640.00, header: 'PIX RECEB.OUTRA IF', docBanco: 'Pix', contraparte: 'GENETICA ADITIVA AGROPECUARIA LTDA', docContraparte: '10.966.405 0001-32', ref: '', cat: CAT.RECEBIMENTO_CLIENTE, status: 'classificado' },
  // ----- 29/06 -----
  { data: '2026-06-29', tipo: 'saida', valor: 20740.00, header: 'DB.TR.C.DIF.TIT.INT', docBanco: '2883005', contraparte: 'RUSA ASSESSORIA PECUARIA LTDA', docContraparte: '34.791.630 0001-43', ref: 'Ref As comissoes Rusa dos Leiloes Santa', cat: CAT.TRANSF_INTERNA_SAIDA, status: 'classificado' },
  { data: '2026-06-29', tipo: 'entrada', valor: 3825.00, header: 'CRÉD.TED-STR', docBanco: '367851806', contraparte: 'JOSE EDUARDO GUIMARAES MOTTA', docContraparte: '401.263.661-87', ref: 'CODIGO TED: T1074146567 | PAGAMENTOS DIVERSOS', cat: CAT.COMISSAO_LEILAO, status: 'conciliado', conciliarCR: CR_NELORE_JEM },
  { data: '2026-06-29', tipo: 'saida', valor: 500.00, header: 'PIX EMIT.OUTRA IF', docBanco: 'Pix', contraparte: '', docContraparte: '***.637.981-**', ref: '', cat: CAT.OUTRAS_DESPESAS, status: 'pendente' },
  // ----- 30/06 -----
  { data: '2026-06-30', tipo: 'saida', valor: 1168.00, header: 'DÉB.TIT.COMPE.EFETI', docBanco: '2861517', contraparte: '', docContraparte: '', ref: 'Hotel Leonardo JMP', cat: CAT.DESP_OP_LEILAO, status: 'classificado' },
]

function descricao(m) {
  const tail = m.contraparte || m.ref
  return m.header + (tail ? ` - ${tail}` : '')
}
function observacoes(m) {
  const parts = [`Extrato Sicoob 01/06/2026 a 30/06/2026`, `Arquivo: ${ARQ}`]
  if (m.docBanco) parts.push(`Doc banco: ${m.docBanco}`)
  if (m.contraparte) parts.push(`Contraparte: ${m.contraparte}`)
  if (m.docContraparte) parts.push(`Documento contraparte: ${m.docContraparte}`)
  if (m.ref) parts.push(`Obs: ${m.ref}`)
  parts.push(m.conciliarCR ? 'Conciliacao: casado com titulo CR (NELORE JEM)' : (m.status === 'pendente' ? 'Conciliacao: sem categoria confiavel; aguarda revisao' : 'Conciliacao: sem titulo exato; classificado por descricao'))
  return parts.join(' | ')
}
function docId(m) {
  return 'SICOOB-2026-' + createHash('md5').update(`${m.data}|${m.tipo}|${r2(m.valor)}|${descricao(m)}`).digest('hex').slice(0, 16).toUpperCase()
}

console.log(DRY_RUN ? '*** DRY RUN (nada gravado) ***\n' : '*** GRAVANDO EM PRODUCAO ***\n')

let inserted = 0, skipped = 0, conciliated = 0
for (const m of MOVS) {
  const desc = descricao(m)
  // idempotencia por chave natural
  const { data: ex } = await sb.from('erp_movimentos_bancarios')
    .select('id').eq('conta_bancaria_id', SICOOB).eq('data', m.data).eq('tipo', m.tipo)
    .eq('valor', r2(m.valor)).eq('descricao', desc).maybeSingle()
  if (ex) { console.log(`[=] JA EXISTE ${m.data} ${m.tipo} ${brl(m.valor)} :: ${desc.slice(0, 50)}`); skipped++; continue }

  const payload = {
    conta_bancaria_id: SICOOB,
    data: m.data,
    tipo: m.tipo,
    descricao: desc,
    valor: r2(m.valor),
    categoria_id: m.cat || null,
    origem: 'importacao_sicoob_2026',
    documento: docId(m),
    observacoes: observacoes(m),
    status_conciliacao: m.status,
    conciliado: m.status !== 'pendente',
  }

  if (DRY_RUN) {
    console.log(`[+] ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(14)} [${m.status}] ${desc.slice(0, 55)}`)
    if (m.conciliarCR) console.log(`     -> CONCILIA com CR ${m.conciliarCR} (baixa: recebido)`)
    inserted++
    continue
  }

  const { data: novo, error } = await sb.from('erp_movimentos_bancarios').insert(payload).select('id').single()
  if (error) { console.error(`[ERRO] ${desc}: ${error.message}`); continue }
  console.log(`[+] inserido ${m.data} ${m.tipo} ${brl(m.valor)} [${m.status}]`)
  inserted++

  if (m.conciliarCR) {
    const { data: t, error: et } = await sb.from('erp_contas_receber').select('id,valor').eq('id', m.conciliarCR).single()
    if (et) { console.error(`[ERRO CR] ${et.message}`); continue }
    await sb.from('erp_movimentos_bancarios').update({ conta_receber_id: m.conciliarCR, conciliado: true, status_conciliacao: 'conciliado', updated_at: now() }).eq('id', novo.id)
    await sb.from('erp_contas_receber').update({ status: 'recebido', data_recebimento: m.data, valor_recebido: t.valor, forma_recebimento: 'transferencia', updated_at: now() }).eq('id', m.conciliarCR)
    console.log(`     -> CR NELORE JEM baixado (recebido ${brl(t.valor)} em ${m.data})`)
    conciliated++
  }
}

console.log(`\nResumo: ${inserted} inseridos, ${skipped} ja existiam, ${conciliated} conciliados com titulo.`)

if (!DRY_RUN) {
  const { data: saldo } = await sb.from('erp_contas_bancarias').select('saldo_atual').eq('id', SICOOB).single()
  console.log(`Saldo Sicoob apos import: ${brl(saldo?.saldo_atual)} (esperado R$ 55.426,02)`)
}
