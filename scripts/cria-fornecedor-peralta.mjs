// Cria o cadastro de fornecedor "Peralta" (assessor/parceiro) e vincula a CP de
// comissão do Touros RS a ele. Idempotente.
// Uso: DRY_RUN=1 node scripts/cria-fornecedor-peralta.mjs | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// 1) fornecedor Peralta (cria se não existir)
let { data: forn } = await sb.from('erp_pessoas').select('id,nome').ilike('nome', '%peralta%').maybeSingle()
if (forn) {
  console.log('Já existe fornecedor:', forn.id, forn.nome)
} else {
  console.log('Criando fornecedor PERALTA (assessor/parceiro)...')
  if (!DRY_RUN) {
    const { data, error } = await sb.from('erp_pessoas').insert({
      tipo: 'pf', nome: 'Peralta', is_fornecedor: true,
      observacoes: 'Assessor/parceiro comercial. Comissão 2% (confirmada pelo chefe em jun/2026, leilão Touros RS). Completar CPF/contato.',
    }).select('id,nome').single()
    if (error) { console.error('Erro:', error.message); process.exit(1) }
    forn = data
    console.log('-> criado', forn.id)
  } else { console.log('[DRY_RUN] criaria fornecedor'); }
}

// 2) vincular a CP do Touros RS
const doc = 'BULA-2026-CP-COM-TOUROS-RS-PERALTA'
if (!DRY_RUN && forn) {
  const { error } = await sb.from('erp_contas_pagar').update({ fornecedor_id: forn.id, updated_at: new Date().toISOString() }).eq('numero_documento', doc)
  if (error) { console.error('Erro CP:', error.message); process.exit(1) }
  console.log('-> CP', doc, 'vinculada ao fornecedor Peralta')
}
console.log('Concluído.')
