// Canonicaliza as categorias duplicadas do ERP.
// O seed criou várias categorias com o MESMO nome (ex.: 3x "Tarifas Bancarias",
// 4x "Folha (de) Pagamento"), o que espalha os lançamentos e quebra os agrupamentos
// de dashboard/fluxo de caixa. Este script:
//   1. agrupa categorias por (nome normalizado + tipo), com merges manuais de variantes;
//   2. elege canônica = a mais referenciada (movimentos + CP + CR + cartão);
//   3. remapeia todas as referências para a canônica;
//   4. exclui as duplicadas (que ficam com 0 referências).
// Uso: DRY_RUN=1 node scripts/canonicaliza-categorias-2026-07-06.mjs | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const TABELAS = ['erp_movimentos_bancarios', 'erp_contas_pagar', 'erp_contas_receber', 'erp_cartao_lancamentos']

// variantes de nome que são a MESMA categoria conceitual
const ALIASES = {
  'folha pagamento': 'folha de pagamento',
  'marketing/ads': 'marketing e publicidade',
  'alimentacao e consumo': 'alimentacao/refeicoes',
}
const norm = (s) => {
  let n = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  return ALIASES[n] || n
}

const { data: cats } = await sb.from('erp_categorias').select('id,nome,tipo')

// conta referências por categoria em cada tabela
const refs = {}
for (const t of TABELAS) {
  const { data, error } = await sb.from(t).select('id,categoria_id').not('categoria_id', 'is', null)
  if (error) throw new Error(`${t}: ${error.message}`)
  for (const r of data) {
    refs[r.categoria_id] = refs[r.categoria_id] || { total: 0 }
    refs[r.categoria_id].total++
    refs[r.categoria_id][t] = (refs[r.categoria_id][t] || 0) + 1
  }
}

// agrupa
const grupos = {}
for (const c of cats) {
  const k = `${norm(c.nome)}|${c.tipo}`
  grupos[k] = grupos[k] || []
  grupos[k].push(c)
}

console.log(DRY_RUN ? '*** DRY RUN ***\n' : '*** GRAVANDO ***\n')
let merged = 0, deleted = 0
for (const [k, list] of Object.entries(grupos)) {
  if (list.length < 2) continue
  // canônica = mais referenciada; empate -> nome "melhor" (mais longo) e id estável
  const sorted = [...list].sort((a, b) => (refs[b.id]?.total || 0) - (refs[a.id]?.total || 0) || b.nome.length - a.nome.length || a.id.localeCompare(b.id))
  const canon = sorted[0]
  const dups = sorted.slice(1)
  const totalDup = dups.reduce((s, d) => s + (refs[d.id]?.total || 0), 0)
  console.log(`${k}  -> canônica "${canon.nome}" ${canon.id.slice(0, 8)} (${refs[canon.id]?.total || 0} refs) | funde ${dups.length} dup(s), ${totalDup} refs`)
  // nome de exibição preferido quando a canônica venceu com nome de variante
  const PREFERRED = { 'marketing e publicidade': 'Marketing e Publicidade', 'folha de pagamento': 'Folha de Pagamento', 'alimentacao/refeicoes': 'Alimentacao/Refeicoes' }
  const prefer = PREFERRED[k.split('|')[0]]
  if (prefer && canon.nome !== prefer && !DRY_RUN) {
    await sb.from('erp_categorias').update({ nome: prefer }).eq('id', canon.id)
    console.log(`  renomeada canônica -> "${prefer}"`)
  }
  for (const d of dups) {
    if (!DRY_RUN) {
      for (const t of TABELAS) {
        const { error } = await sb.from(t).update({ categoria_id: canon.id }).eq('categoria_id', d.id)
        if (error) throw new Error(`remap ${t} ${d.id}: ${error.message}`)
      }
      const { error: delErr } = await sb.from('erp_categorias').delete().eq('id', d.id)
      if (delErr) { console.log(`  ! não excluiu ${d.id} (${delErr.message}) — referência fora das 4 tabelas?`); continue }
    }
    deleted++
  }
  merged++
}
console.log(`\nGrupos fundidos: ${merged} | categorias excluídas: ${deleted}`)

// resultado final
if (!DRY_RUN) {
  const { data: fin } = await sb.from('erp_categorias').select('id,nome,tipo').order('tipo').order('nome')
  console.log(`\nCategorias finais: ${fin.length}`)
  for (const c of fin) console.log(`  [${c.tipo}] ${c.nome}`)
}
