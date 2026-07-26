/**
 * Backfill: preenche `clientes.responsavel` pela regra de zona quando está vazio.
 *
 * NÃO envia mensagem, NÃO manda e-mail, NÃO sobrescreve responsável já definido.
 * A regra canônica vive em src/lib/assessor-zona.ts — este script é o backfill
 * único da base existente; daqui em diante a alocação deve sair de lá.
 *
 * UF em cascata: clientes.uf → UF do lead de origem → DDD do telefone.
 * Quando a UF declarada e a do DDD apontam para assessores diferentes, o cliente
 * é marcado como CONFLITO e NÃO é alocado — vai para conferência humana.
 *
 *   node scripts/aloca-clientes-por-zona.mjs           # dry-run
 *   node scripts/aloca-clientes-por-zona.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
for (const f of ['.env.local', '.env']) {
  const p = path.join(ROOT, f)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
}
const APPLY = process.argv.includes('--apply')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Espelho de src/lib/assessor-zona.ts (script .mjs não importa TS).
// Se mudar lá, mude aqui — ou melhor: rode este backfill só uma vez e aposente.
const UF_DO_ASSESSOR = {
  'Douglas Bispo':    ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO', 'MA'],
  'Fábio Omena Gaia': ['AL', 'BA', 'CE', 'PB', 'PE', 'PI', 'RN', 'SE', 'ES', 'MG', 'RJ', 'SP'],
  'Leonardo Serafim': ['MS', 'MT', 'GO', 'DF', 'PR', 'RS', 'SC'],
}
const ASSESSOR_POR_UF = Object.fromEntries(
  Object.entries(UF_DO_ASSESSOR).flatMap(([a, ufs]) => ufs.map(uf => [uf, a])))

const UF_BY_DDD = {
  11:'SP',12:'SP',13:'SP',14:'SP',15:'SP',16:'SP',17:'SP',18:'SP',19:'SP',
  21:'RJ',22:'RJ',24:'RJ',27:'ES',28:'ES',
  31:'MG',32:'MG',33:'MG',34:'MG',35:'MG',37:'MG',38:'MG',
  41:'PR',42:'PR',43:'PR',44:'PR',45:'PR',46:'PR',
  47:'SC',48:'SC',49:'SC',51:'RS',53:'RS',54:'RS',55:'RS',
  61:'DF',62:'GO',64:'GO',63:'TO',65:'MT',66:'MT',67:'MS',
  68:'AC',69:'RO',71:'BA',73:'BA',74:'BA',75:'BA',77:'BA',
  79:'SE',81:'PE',87:'PE',82:'AL',83:'PB',84:'RN',85:'CE',88:'CE',
  86:'PI',89:'PI',91:'PA',93:'PA',94:'PA',92:'AM',97:'AM',
  95:'RR',96:'AP',98:'MA',99:'MA',
}
function ufFromPhone(phone) {
  let d = String(phone ?? '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.length < 10) return null
  return UF_BY_DDD[Number(d.slice(0, 2))] ?? null
}
const normUf = (v) => {
  const u = String(v ?? '').trim().toUpperCase()
  return ASSESSOR_POR_UF[u] ? u : null
}

const { data: clientes, error } = await supabase
  .from('clientes')
  .select('match_key, nome, uf, telefone, responsavel, crm_lead_id, status')
if (error) { console.error(error.message); process.exit(1) }

const leadIds = clientes.map(c => c.crm_lead_id).filter(Boolean)
const leadsById = new Map()
for (let i = 0; i < leadIds.length; i += 200) {
  const { data } = await supabase.from('crm_leads')
    .select('id, estado, celular, telefone, extra_data').in('id', leadIds.slice(i, i + 200))
  for (const l of data ?? []) leadsById.set(l.id, l)
}

const semResp = clientes.filter(c => !String(c.responsavel ?? '').trim())
console.log(`${clientes.length} clientes | ${semResp.length} sem assessor\n`)

const plano = []
const conflitos = []
const semUf = []

for (const c of semResp) {
  const lead = c.crm_lead_id ? leadsById.get(c.crm_lead_id) : null
  const ufFazenda = normUf(lead?.extra_data?.fazenda_uf)
  const ufCadastro = normUf(c.uf) ?? normUf(lead?.estado)
  const ufDdd = normUf(ufFromPhone(c.telefone || lead?.celular || lead?.telefone))

  const declarada = ufCadastro ?? ufFazenda
  const uf = declarada ?? ufDdd
  if (!uf) { semUf.push(c); continue }

  if (declarada && ufDdd && ASSESSOR_POR_UF[declarada] !== ASSESSOR_POR_UF[ufDdd]) {
    conflitos.push({ c, declarada, ufDdd })
    continue
  }
  plano.push({ c, uf, assessor: ASSESSOR_POR_UF[uf], fonte: declarada ? 'cadastro' : 'ddd' })
}

const porAssessor = {}
for (const p of plano) porAssessor[p.assessor] = (porAssessor[p.assessor] ?? 0) + 1
console.log('A ALOCAR:')
for (const [a, n] of Object.entries(porAssessor).sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(3)}  ${a}`)
console.log('')
for (const p of plano) console.log(`  ${p.assessor.padEnd(18)} ← ${p.c.nome} (${p.uf}, por ${p.fonte})`)

if (conflitos.length) {
  console.log(`\nCONFLITO — NÃO alocados (${conflitos.length}), UF declarada ≠ UF do DDD:`)
  for (const k of conflitos) console.log(`  ${k.c.nome}: declarada ${k.declarada} (${ASSESSOR_POR_UF[k.declarada]}) vs DDD ${k.ufDdd} (${ASSESSOR_POR_UF[k.ufDdd]})`)
}
if (semUf.length) {
  console.log(`\nSEM UF — NÃO alocados (${semUf.length}):`)
  for (const c of semUf) console.log(`  ${c.nome} (tel=${c.telefone || '-'})`)
}

if (!APPLY) { console.log('\nDRY-RUN — rode com --apply para gravar.\n'); process.exit(0) }

let ok = 0
for (const p of plano) {
  const { error: e } = await supabase.from('clientes')
    .update({ responsavel: p.assessor })
    .eq('match_key', p.c.match_key)
    .or('responsavel.is.null,responsavel.eq.')   // corrida: só grava se ainda estiver vazio
  if (e) console.log(`  ! ${p.c.nome}: ${e.message}`); else ok++
}
console.log(`\nAPLICADO: ${ok}/${plano.length} clientes alocados.\n`)
