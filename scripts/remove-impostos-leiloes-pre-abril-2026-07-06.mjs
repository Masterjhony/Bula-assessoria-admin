// Remove as CPs de "Imposto sobre Receita (18%)" provisionadas para leilões
// ANTERIORES a abril/2026 (emissão = data do leilão < 2026-04-01), a pedido do
// chefe (06/07): manter só imposto de leilões de abril em diante.
// Todas as guias afetadas estão em ABERTO (não pagas) — são provisões, sem baixa.
// Segurança: só apaga status != 'pago' e categoria = Imposto 18%.
// Uso: DRY_RUN=1 node scripts/remove-impostos-leiloes-pre-abril-2026-07-06.mjs | sem DRY_RUN apaga.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const CAT_IMP = '8a26acfb-90a8-4895-8ce0-55fd0d9a9958'
const CORTE = '2026-04-01' // emissão (data do leilão) < isto -> apaga

const { data: alvo, error } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,status,emissao,vencimento')
  .eq('categoria_id', CAT_IMP).lt('emissao', CORTE).order('emissao')
if (error) throw new Error(error.message)

const naoPagas = alvo.filter((c) => c.status !== 'pago')
const pagas = alvo.filter((c) => c.status === 'pago')
console.log(`${DRY_RUN ? '*** DRY RUN ***' : '*** APAGANDO ***'}`)
console.log(`Imposto de leilões < abril: ${alvo.length} | apagáveis (não pagas): ${naoPagas.length} | pagas (NÃO apaga): ${pagas.length}`)
console.log(`Valor a remover: R$ ${brl(naoPagas.reduce((s, c) => s + Number(c.valor), 0))}\n`)
for (const c of naoPagas) console.log(`  ${c.emissao} venc ${c.vencimento} R$ ${brl(c.valor).padStart(9)} ${c.descricao.slice(0, 55)}`)
if (pagas.length) { console.log('\n⚠ PAGAS preservadas:'); for (const c of pagas) console.log(`  ${c.emissao} ${c.descricao}`) }

// checa movimentos vinculados (não deveria haver, pois nenhuma foi paga)
const ids = naoPagas.map((c) => c.id)
const { data: movLink } = await sb.from('erp_movimentos_bancarios').select('id,conta_pagar_id').in('conta_pagar_id', ids)
if (movLink && movLink.length) console.log(`\n⚠ ${movLink.length} movimento(s) apontam p/ essas CPs — o FK (on delete set null) desvincula automaticamente.`)

if (DRY_RUN) { console.log('\n[DRY_RUN] nada apagado.'); process.exit(0) }

const { error: delErr, count } = await sb.from('erp_contas_pagar').delete({ count: 'exact' }).in('id', ids)
if (delErr) throw new Error(delErr.message)
console.log(`\n-> ${count} CP(s) de imposto REMOVIDAS.`)

// confere o que sobrou
const { data: rest } = await sb.from('erp_contas_pagar').select('emissao,valor').eq('categoria_id', CAT_IMP)
const byMes = rest.reduce((m, c) => { const k = c.emissao.slice(0, 7); m[k] = m[k] || { n: 0, v: 0 }; m[k].n++; m[k].v += Number(c.valor); return m }, {})
console.log('\nImposto restante (por mês de leilão):')
for (const [k, x] of Object.entries(byMes).sort()) console.log(`  ${k}: ${x.n}x R$ ${brl(x.v)}`)
