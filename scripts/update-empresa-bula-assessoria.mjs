// Preenche os dados legais da Bula Assessoria Pecuária Ltda em erp_empresas
// com base na 2ª alteração contratual (CNPJ 34.791.630/0001-43, sede Campo
// Grande/MS, Rua Quinze de Novembro 2.509, Jardim dos Estados, 79020-300).
//
// Tela do ERP mostrava UM card "Bula Remates / Bula Assessoria Pecuaria" só
// com regime preenchido. Esse mesmo card representa a entidade legal — vamos
// preencher os campos vazios sem trocar nome_fantasia (Bula Remates é o
// trade name visível ao mercado).
//
// Idempotente: update por id. Se não encontrar, insere.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Dados oficiais do contrato social consolidado (Junta Comercial MS,
// registro nº 55433085 em 21/11/2024).
const LEGAL = {
  razao_social: 'BULA ASSESSORIA PECUÁRIA LTDA',
  cnpj: '34.791.630/0001-43',
  endereco: 'Rua Quinze de Novembro, nº 2.509, Jardim dos Estados',
  cidade: 'Campo Grande',
  uf: 'MS',
  cep: '79020-300',
}

console.log('Listando empresas existentes...')
const { data: emps, error: selErr } = await supabase
  .from('erp_empresas')
  .select('id, razao_social, nome_fantasia, cnpj, regime_tributario, cidade, uf')
  .order('created_at', { ascending: true })

if (selErr) { console.error('SELECT erp_empresas falhou:', selErr.message); process.exit(1) }
console.log(`Encontradas ${emps?.length ?? 0} empresas:`)
for (const e of emps ?? []) {
  console.log(`  • ${e.id} | fantasia="${e.nome_fantasia || '—'}" | razão="${e.razao_social || '—'}" | cnpj=${e.cnpj || '—'}`)
}

// Procura por nome (fantasia ou razão) que contenha "bula" — só uma deve existir.
const matches = (emps ?? []).filter(e =>
  /bula/i.test(e.nome_fantasia || '') || /bula/i.test(e.razao_social || '')
)

if (matches.length === 0) {
  console.log('\nNenhuma empresa "Bula" encontrada — inserindo nova com nome_fantasia="Bula Remates".')
  const { data: ins, error: insErr } = await supabase
    .from('erp_empresas')
    .insert({
      ...LEGAL,
      nome_fantasia: 'Bula Remates',
      regime_tributario: 'simples',
      ativo: true,
    })
    .select('id')
    .single()
  if (insErr) { console.error('INSERT falhou:', insErr.message); process.exit(1) }
  console.log(`OK — empresa criada: id=${ins.id}`)
} else if (matches.length === 1) {
  const target = matches[0]
  console.log(`\nAtualizando empresa id=${target.id} ("${target.nome_fantasia}") com dados legais do contrato.`)
  const { error: updErr } = await supabase
    .from('erp_empresas')
    .update({ ...LEGAL, updated_at: new Date().toISOString() })
    .eq('id', target.id)
  if (updErr) { console.error('UPDATE falhou:', updErr.message); process.exit(1) }
  console.log('OK — empresa atualizada.')
} else {
  console.error(`\nERRO: ${matches.length} empresas "Bula" encontradas — ambíguo. Atualize manualmente ou refine o critério.`)
  for (const m of matches) console.error(`  - id=${m.id} fantasia="${m.nome_fantasia}" razão="${m.razao_social}"`)
  process.exit(1)
}

console.log('\nReleitura para conferência:')
const { data: after } = await supabase
  .from('erp_empresas')
  .select('id, razao_social, nome_fantasia, cnpj, ie, endereco, cidade, uf, cep, regime_tributario, email, telefone')
  .ilike('razao_social', '%bula%')
for (const e of after ?? []) {
  console.log(`  ${e.id}:`)
  console.log(`    Razão social: ${e.razao_social}`)
  console.log(`    Nome fantasia: ${e.nome_fantasia}`)
  console.log(`    CNPJ: ${e.cnpj}`)
  console.log(`    Endereço: ${e.endereco}`)
  console.log(`    Cidade/UF: ${e.cidade}/${e.uf}  CEP ${e.cep}`)
  console.log(`    Regime: ${e.regime_tributario}`)
  console.log(`    Email: ${e.email || '—'}  Tel: ${e.telefone || '—'}`)
}
