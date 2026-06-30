// Importa os movimentos FALTANTES do extrato Sicredi de junho/2026 a partir do
// extrato atualizado baixado em 30/06/2026 (sicredi_1782844572585.pdf, 01/06 a
// 30/06).
//
// Contexto: a importacao anterior parou no debito TOKIO MARINE de 24/06 (saldo
// -1.176,55, que bate com o saldo_atual da conta no ERP). O extrato novo so
// acrescenta os 2 resgates de aplicacao de 24/06 que cobrem aquele debito e
// ZERAM a conta (saldo final 0,00):
//   - 24/06 entrada 947,88 RESG.APLIC.FIN.AVISO PREV  -> saldo apos -228,67
//   - 24/06 entrada 228,67 RESG.APLIC.FIN.AVISO PREV  -> saldo apos    0,00
//
// Conciliacao: resgates/aplicacoes automaticos sao varredura interna (fora do
// P&L) e seguem o padrao da conta -> categoria "Resgate Aplicacao Financeira",
// status 'conciliado'. Nada a casar com titulo CR/CP.
//
// Uso: DRY_RUN=1 node scripts/import-extrato-sicredi-junho-2026.mjs   (revisao)
//                node scripts/import-extrato-sicredi-junho-2026.mjs   (grava em prod)
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

const SICREDI = 'af4724ec-e098-4e13-b172-04b2bfb1949d'
const ARQ = 'sicredi_1782844572585.pdf'
const CAT_RESGATE = '67fbaf99-9539-4433-936a-d8f499363a34' // Resgate Aplicacao Financeira

const MOVS = [
  { data: '2026-06-24', tipo: 'entrada', valor: 947.88, descricao: 'RESG.APLIC.FIN.AVISO PREV CAPTACAO', saldoApos: -228.67 },
  { data: '2026-06-24', tipo: 'entrada', valor: 228.67, descricao: 'RESG.APLIC.FIN.AVISO PREV CAPTACAO', saldoApos: 0 },
]

const obs = (m) => `Extrato Sicredi 01/06/2026 a 30/06/2026 | Arquivo: ${ARQ} | Saldo extrato apos: ${m.saldoApos} | Grupo: Aplicacao/Resgate automatico | Conciliacao: varredura interna (fora do P&L)`
const docId = (m) => 'SICREDI-2026-' + createHash('md5').update(`${m.data}|${m.tipo}|${r2(m.valor)}|${m.descricao}|${m.saldoApos}`).digest('hex').slice(0, 16).toUpperCase()

console.log(DRY_RUN ? '*** DRY RUN (nada gravado) ***\n' : '*** GRAVANDO EM PRODUCAO ***\n')

let inserted = 0, skipped = 0
for (const m of MOVS) {
  const { data: ex } = await sb.from('erp_movimentos_bancarios')
    .select('id').eq('conta_bancaria_id', SICREDI).eq('data', m.data).eq('tipo', m.tipo)
    .eq('valor', r2(m.valor)).eq('descricao', m.descricao).maybeSingle()
  if (ex) { console.log(`[=] JA EXISTE ${m.data} ${m.tipo} ${brl(m.valor)} :: ${m.descricao}`); skipped++; continue }

  const payload = {
    conta_bancaria_id: SICREDI,
    data: m.data,
    tipo: m.tipo,
    descricao: m.descricao,
    valor: r2(m.valor),
    categoria_id: CAT_RESGATE,
    origem: 'importacao_sicredi_2026',
    documento: docId(m),
    observacoes: obs(m),
    status_conciliacao: 'conciliado',
    conciliado: true,
  }

  if (DRY_RUN) { console.log(`[+] ${m.data} ${m.tipo} ${brl(m.valor).padStart(12)} [conciliado] ${m.descricao} (saldo apos ${brl(m.saldoApos)})`); inserted++; continue }

  const { error } = await sb.from('erp_movimentos_bancarios').insert(payload)
  if (error) { console.error(`[ERRO] ${m.descricao} ${m.valor}: ${error.message}`); continue }
  console.log(`[+] inserido ${m.data} ${m.tipo} ${brl(m.valor)} [conciliado]`)
  inserted++
}

console.log(`\nResumo: ${inserted} inseridos, ${skipped} ja existiam.`)
if (!DRY_RUN) {
  const { data: saldo } = await sb.from('erp_contas_bancarias').select('saldo_atual').eq('id', SICREDI).single()
  console.log(`Saldo Sicredi apos import: ${brl(saldo?.saldo_atual)} (esperado R$ 0,00)`)
}
