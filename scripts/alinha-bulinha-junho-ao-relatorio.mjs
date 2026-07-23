// Alinha as vendas do Bulinha em junho/2026 ao relatório de pisteiros da Ana
// ("LISTAGEM VENDAS ASSESSORES/PISTEIROS — FELIPE VENDAS JUNHO", 23/07/2026),
// que é a fonte de verdade das vendas dele no mês.
//
// Relatório x ERP:
//   Jacamim 07/06    1 lote  · 1 an. · 27.000,00     -> ERP igual  ✓
//   Bezerras JMP 13/06 2 lotes · 2 an. · 63.000,00   -> ERP igual  ✓
//   Touros JMP 14/06  33 lotes · 54 an. · 1.512.800  -> ERP tinha 1.499.300 (-13.500)
//
// Só o VGV do Touros JMP diverge. Corrige para o valor do relatório e refaz a
// comissão de 2% (leilão da PROGRAMA LEILÕES, não é Bula Remates -> 2% devidos).
//   vgv        1.499.300,00 -> 1.512.800,00  (+13.500)
//   comissão      29.986,00 ->    30.256,00  (+270 = 2%)
//   vgv_total  4.175.708,80 -> 4.189.208,80  (mantém = soma dos assessores)
//   comissao_assessoria 90.985,25 -> 91.255,25
//   sobra_bruta         27.402,19 -> 27.132,19  (custo sobe 270)
// e o CP da comissão: 29.986,00 -> 30.256,00
//
// Uso: DRY_RUN=1 node scripts/alinha-bulinha-junho-ao-relatorio.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100
const isBulinha = (n) => /bulinha|felipe\s+.*andrade|felipe\s+vilela/i.test(String(n || ''))

const FECH = 'c0f291bb-17bc-4b10-b320-c5ed6e767057'
const CP = '3191dc97-8cd9-4632-ade1-55209e4f2cd7'
const VGV_RELATORIO = 1512800   // subtotal do relatório p/ o 10º JMP Touros
const PCT = 0.02

console.log(DRY_RUN ? '=== DRY RUN ===\n' : '=== GRAVANDO ===\n')

const { data: f, error } = await sb.from('bula_leilao_fechamento').select('*').eq('id', FECH).single()
if (error) { console.error(error.message); process.exit(1) }

const pa = (f.por_assessor || []).map((a) => ({ ...a }))
const alvo = pa.find((a) => isBulinha(a.nome))
if (!alvo) { console.error('Bulinha não encontrado — ABORTA'); process.exit(1) }

const vgvAntes = Number(alvo.vgv) || 0
const comAntes = Number(alvo.comissao) || 0
if (vgvAntes === VGV_RELATORIO) { console.log('VGV já alinhado ao relatório. Nada a fazer.'); process.exit(0) }

const deltaVgv = r2(VGV_RELATORIO - vgvAntes)
const comDepois = r2(VGV_RELATORIO * PCT)
const deltaCom = r2(comDepois - comAntes)
alvo.vgv = VGV_RELATORIO
alvo.comissao = comDepois

const vgvTotDepois = r2((Number(f.vgv_total) || 0) + deltaVgv)
const comAssDepois = r2((Number(f.comissao_assessoria) || 0) + deltaCom)
const sobraDepois = f.sobra_bruta == null ? null : r2(Number(f.sobra_bruta) - deltaCom)

console.log(`${f.nome}`)
console.log(`  Bulinha vgv:      ${brl(vgvAntes)} -> ${brl(VGV_RELATORIO)}   (${deltaVgv > 0 ? '+' : ''}${brl(deltaVgv)})`)
console.log(`  Bulinha comissão: ${brl(comAntes)} -> ${brl(comDepois)}   (${deltaCom > 0 ? '+' : ''}${brl(deltaCom)})`)
console.log(`  vgv_total:        ${brl(f.vgv_total)} -> ${brl(vgvTotDepois)}`)
console.log(`  comissao_assessoria: ${brl(f.comissao_assessoria)} -> ${brl(comAssDepois)}`)
console.log(`  sobra_bruta:      ${brl(f.sobra_bruta)} -> ${sobraDepois == null ? '—' : brl(sobraDepois)}`)

if (!DRY_RUN) {
  const upd = { por_assessor: pa, vgv_total: vgvTotDepois, comissao_assessoria: comAssDepois, updated_at: new Date().toISOString() }
  if (sobraDepois != null) upd.sobra_bruta = sobraDepois
  const { error: e2 } = await sb.from('bula_leilao_fechamento').update(upd).eq('id', FECH)
  if (e2) { console.error('ERRO:', e2.message); process.exit(1) }
  console.log('  ✔ fechamento atualizado')
}

const { data: cp } = await sb.from('erp_contas_pagar').select('*').eq('id', CP).single()
console.log(`\nCP: ${brl(cp.valor)} -> ${brl(comDepois)} (status ${cp.status})`)
if (cp.status === 'pago' || Number(cp.valor_pago) > 0) { console.error('  ⚠ CP pago — não altero.'); process.exit(0) }
if (!DRY_RUN) {
  const { error: e3 } = await sb.from('erp_contas_pagar').update({
    valor: comDepois,
    observacoes: String(cp.observacoes || '') + ` [23/07/2026] Valor alinhado ao relatório de pisteiros FELIPE VENDAS JUNHO: VGV de cobertura ${brl(VGV_RELATORIO)} (era ${brl(vgvAntes)}), comissão 2% = ${brl(comDepois)}.`,
    updated_at: new Date().toISOString(),
  }).eq('id', CP)
  if (e3) { console.error('ERRO CP:', e3.message); process.exit(1) }
  console.log('  ✔ CP atualizado')
}
console.log(DRY_RUN ? '\nDRY RUN concluído.' : '\nConcluído.')
