// Atualizações de fechamento pedidas pelo chefe em 2026-06-08 (imagem):
//   • LS Collection (31/05)  → faturamento R$ 1.645.000
//   • LS Now (30/05)         → faturamento R$ 1.197.000 + acordo 1% fat + 4% venda
//   • Tresmar (21/05)        → faturamento R$ 993.300
//   • 18º Mega Nelore Pará (30/05) → acordo 3% da venda (cobertura)
// NÃO mexe em receita_bula/sobra_bruta — só faturamento e acordo. Idempotente.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const here = dirname(fileURLToPath(import.meta.url)); const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root,'.env.local'),'utf-8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{autoRefreshToken:false,persistSession:false} })

const brl = n => Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
async function upd(id, patch, label) {
  const { data, error } = await sb.from('bula_leilao_fechamento')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    .select('id,nome,data,vgv_total,faturamento_total_leilao,acordo_pct_faturamento,acordo_pct_venda_cobertura,acordo_descricao,receita_bula').single()
  if (error) { console.error(`✗ ${label}:`, error.message); return null }
  const exp = (Number(data.acordo_pct_faturamento||0)*Number(data.faturamento_total_leilao||0))
            + (Number(data.acordo_pct_venda_cobertura||0)*Number(data.vgv_total||0))
  console.log(`✓ ${data.nome} (${data.data})`)
  console.log(`   fat=${data.faturamento_total_leilao!=null?brl(data.faturamento_total_leilao):'—'} | acordo: fat=${data.acordo_pct_faturamento??'—'} venda=${data.acordo_pct_venda_cobertura??'—'}`)
  console.log(`   receita ESPERADA pelo acordo = ${exp>0?brl(exp):'—'} | receita atual gravada = ${data.receita_bula!=null?brl(data.receita_bula):'—'}`)
  return data
}

// 1. LS Collection
await upd('84a96ad4-33b6-46e9-a71d-0452e68f36b8', { faturamento_total_leilao: 1645000 }, 'LS Collection')
// 2. LS Now + acordo 1% fat + 4% venda
await upd('b807e56f-c90b-4bfa-92ad-5b85cd7d8899', {
  faturamento_total_leilao: 1197000,
  acordo_pct_faturamento: 0.01, acordo_pct_venda_cobertura: 0.04,
  acordo_descricao: '1% do faturamento total + 4% da venda da cobertura',
}, 'LS Now')
// 3. Tresmar
await upd('811f774e-c4b2-4b6c-bc6b-fab286007b76', { faturamento_total_leilao: 993300 }, 'Tresmar')

// 3b. Flor do Aratau (07/06) → faturamento (acordo já cadastrado: 1% fat + 3% venda)
{
  const { data: rows } = await sb.from('bula_leilao_fechamento').select('id,nome').ilike('nome','%flor%aratau%')
  if (rows?.length === 1) await upd(rows[0].id, { faturamento_total_leilao: 1184900 }, 'Flor do Aratau')
  else console.warn('✗ Flor do Aratau: match não-único', rows?.map(r=>r.nome))
}

// 4. 18º Mega Nelore Pará (30/05) → acordo 3% da venda
{
  const { data: rows } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,data').ilike('nome','%mega%nelore%par%').eq('data','2026-05-30')
  if (!rows?.length) console.warn('✗ 18º Mega Nelore Pará (30/05): não encontrado')
  else if (rows.length>1) { console.warn('✗ 18º Mega Nelore: múltiplos —', rows.map(r=>r.nome)) }
  else await upd(rows[0].id, {
    acordo_pct_faturamento: null, acordo_pct_venda_cobertura: 0.03,
    acordo_descricao: '3% da venda da cobertura',
  }, '18º Mega Nelore Pará')
}
console.log('\nDone.')
