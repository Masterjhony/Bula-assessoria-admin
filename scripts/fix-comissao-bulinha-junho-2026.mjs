// Ajuste da comissão do Bulinha (Felipe Andrade) em junho/2026.
//
// Contexto: Bulinha é dono da Bula Remates / Fórmula do Boi. Nas vendas dessas
// empresas dele, ele NÃO tem comissão (regra confirmada pelo chefe + PDF da Ana
// "LISTAGEM VENDAS ASSESSORES/PISTEIROS - FELIPE VENDAS JUNHO", 23/07/2026,
// que traz todas as vendas dele a 0,00%). Hoje o ERP lançou os 2% indevidos.
//
// Corrige em 3 fechamentos onde Bulinha aparece:
//   c1afc577  8o Jacamim Fêmeas 07/06   (Bula Remates)   com 540    -> 0
//   cd19dba3  Bezerras Nelore JMP 13/06 (Fórmula do Boi)  com 1.260  -> 0
//   c0f291bb  10o Nelore JMP Touros 14/06(Fórmula do Boi) com 29.986 -> 0
//
// Para cada fechamento:
//   - por_assessor[].comissao do Bulinha -> 0 (real, explícito)
//   - comissao_assessoria (custo total pisteiros) -= delta removido
//   - sobra_bruta (lucro bruto) += delta (ajuste por DELTA, preserva a base da
//     planilha-mestra; não recalcula pela fórmula)
//
// E cancela os 3 CPs (contas a pagar) da comissão indevida (2%), status
// 'cancelado' + nota (não apaga — política do ERP + trilha de auditoria).
//
// Uso: DRY_RUN=1 node scripts/fix-comissao-bulinha-junho-2026.mjs   (simula)
//      node scripts/fix-comissao-bulinha-junho-2026.mjs             (grava)
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
const isBulinha = (nome) => /bulinha|felipe\s+.*andrade|felipe\s+vilela/i.test(String(nome || ''))
const NOTA = ' [AJUSTE 23/07/2026] Bulinha é dono da Bula Remates/Fórmula do Boi — nessas vendas ele NÃO tem comissão (PDF pisteiros FELIPE VENDAS JUNHO, todas 0,00%). Comissão de 2% zerada e CP cancelado.'

const FECHAMENTOS = [
  'c1afc577-062e-4473-8a53-0d10e6802392', // 8o Jacamim Fêmeas 07/06
  'cd19dba3-792d-42e3-a563-f6025528dd51', // Bezerras Nelore JMP 13/06
  'c0f291bb-17bc-4b10-b320-c5ed6e767057', // 10o Nelore JMP Touros 14/06
]
const CPS = [
  '3191dc97-8cd9-4632-ade1-55209e4f2cd7', // 29.986
  'fb4868ff-9a54-4c81-8cb2-739fc93c50a6', // 1.260
  '30a04017-24de-4b74-a2d1-dfb2eeb6ba27', // 540
]

console.log(DRY_RUN ? '=== DRY RUN (nada é gravado) ===\n' : '=== GRAVANDO EM PRODUÇÃO ===\n')

// ---- Fechamentos ----
for (const id of FECHAMENTOS) {
  const { data: f, error } = await sb.from('bula_leilao_fechamento').select('*').eq('id', id).single()
  if (error) { console.error('erro lendo', id, error.message); process.exit(1) }
  const pa = Array.isArray(f.por_assessor) ? f.por_assessor.map((a) => ({ ...a })) : []
  let delta = 0
  for (const a of pa) {
    if (isBulinha(a.nome)) {
      const antigo = Number(a.comissao) || 0
      if (antigo !== 0) { delta = r2(delta + antigo); a.comissao = 0 }
    }
  }
  console.log(`[${id}] ${f.nome}`)
  if (delta === 0) { console.log('  já ajustado (Bulinha 0). pula.\n'); continue }
  const comAntes = Number(f.comissao_assessoria) || 0
  const sobAntes = f.sobra_bruta == null ? null : Number(f.sobra_bruta)
  const comDepois = r2(comAntes - delta)
  const sobDepois = sobAntes == null ? null : r2(sobAntes + delta)
  console.log(`  Bulinha comissão removida: ${brl(delta)}`)
  console.log(`  comissao_assessoria: ${brl(comAntes)} -> ${brl(comDepois)}`)
  console.log(`  sobra_bruta:         ${sobAntes == null ? '—' : brl(sobAntes)} -> ${sobDepois == null ? '—' : brl(sobDepois)}`)
  if (!DRY_RUN) {
    const upd = { por_assessor: pa, comissao_assessoria: comDepois, updated_at: new Date().toISOString() }
    if (sobDepois != null) upd.sobra_bruta = sobDepois
    const { error: e2 } = await sb.from('bula_leilao_fechamento').update(upd).eq('id', id)
    if (e2) { console.error('  ERRO update:', e2.message); process.exit(1) }
    console.log('  ✔ gravado')
  }
  console.log('')
}

// ---- CPs (cancelar com nota) ----
console.log('--- Contas a Pagar (cancelar) ---')
for (const cid of CPS) {
  const { data: c, error } = await sb.from('erp_contas_pagar').select('*').eq('id', cid).single()
  if (error) { console.error('erro lendo CP', cid, error.message); process.exit(1) }
  console.log(`[${cid}] ${c.descricao} — ${brl(c.valor)} — status atual: ${c.status}`)
  if (c.status === 'cancelado') { console.log('  já cancelado. pula.\n'); continue }
  if (c.status === 'pago' || Number(c.valor_pago) > 0) { console.error('  ⚠ CP PAGO/parcial — NÃO cancelo automaticamente. Verifique manualmente.\n'); continue }
  if (!DRY_RUN) {
    const { error: e2 } = await sb.from('erp_contas_pagar').update({
      status: 'cancelado',
      observacoes: String(c.observacoes || '') + NOTA,
      projeto: 'Cancelado 23/07 — Bulinha 0% (dono)',
      updated_at: new Date().toISOString(),
    }).eq('id', cid)
    if (e2) { console.error('  ERRO update CP:', e2.message); process.exit(1) }
    console.log('  ✔ cancelado')
  }
  console.log('')
}

console.log(DRY_RUN ? 'DRY RUN concluído. Rode sem DRY_RUN para gravar.' : 'Concluído.')
