// Classifica em lote os movimentos PENDENTES de junho/2026 (Sicoob + Sicredi),
// zerando a fila de revisao. Nenhum tem titulo CR/CP de valor compativel, entao
// nao se forca baixa: passam de 'pendente' -> 'classificado' (revisado) com uma
// categoria atribuida por regra (CNPJ/ref do extrato).
//
// Regras (identificaveis):
//   - doc 154.931 / "Flavio"          -> Comissao Funcionario (acerto Flavio Jacques)
//   - doc 59.791.094 / "despesas Fabio"-> Despesa Operacional Leilao
//   - doc 65.565.807 (Formula do Boi)  -> Repasse Assessorias/Parceiros
//   - "IFOOD" / "Cafe"                 -> Alimentacao/Refeicoes
//   - resto (PIX pequenos sem ref)     -> Outras Despesas
//
// Uso: DRY_RUN=1 node scripts/classificar-pendentes-junho-2026.mjs
//                node scripts/classificar-pendentes-junho-2026.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const now = () => new Date().toISOString()

const CAT = {
  COMISSAO_FUNCIONARIO: 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e',
  DESP_OP_LEILAO: '562264eb-8134-4990-a56b-d884279acf90',
  REPASSE: '5dcdc58a-d81b-4a4c-a81a-5e703e6a1a90',
  ALIMENTACAO: 'b26ffe87-f4d6-4060-b697-a7f698c35f7d', // Alimentacao/Refeicoes
  OUTRAS_DESPESAS: '9e20f375-b070-4991-95f8-723210cf9bd0',
}
const ACC = { 'e0eca43c-1a2c-4077-ab54-801eb5d692e7': 'SICOOB', 'af4724ec-e098-4e13-b172-04b2bfb1949d': 'SICREDI' }

function classify(o) {
  const s = (o || '').toUpperCase()
  if (s.includes('154.931') || s.includes('FLAVIO')) return ['Comissao Funcionario', CAT.COMISSAO_FUNCIONARIO]
  if (s.includes('59.791.094') || s.includes('DESPESAS FABIO')) return ['Despesa Operacional Leilao', CAT.DESP_OP_LEILAO]
  if (s.includes('65.565.807')) return ['Repasse Assessorias/Parceiros', CAT.REPASSE]
  if (s.includes('IFOOD') || s.includes('CAFE')) return ['Alimentacao/Refeicoes', CAT.ALIMENTACAO]
  return ['Outras Despesas', CAT.OUTRAS_DESPESAS]
}

console.log(DRY_RUN ? '*** DRY RUN ***\n' : '*** GRAVANDO EM PRODUCAO ***\n')
let total = 0
const tally = {}
for (const [id, nome] of Object.entries(ACC)) {
  const { data } = await sb.from('erp_movimentos_bancarios')
    .select('id,data,valor,descricao,observacoes,categoria_id')
    .eq('conta_bancaria_id', id).eq('status_conciliacao', 'pendente')
    .gte('data', '2026-06-01').lte('data', '2026-06-30').order('valor', { ascending: false })
  console.log(`\n### ${nome} (${data.length}) ###`)
  for (const r of data) {
    const [label, catId] = classify(`${r.descricao} ${r.observacoes}`)
    tally[label] = (tally[label] || 0) + 1
    console.log(`  ${r.data} ${brl(r.valor).padStart(13)} -> ${label}`)
    total++
    if (DRY_RUN) continue
    const obs = (r.observacoes || '') + ' | Classificado em lote 30/06 (revisao conciliacao junho)'
    const { error } = await sb.from('erp_movimentos_bancarios')
      .update({ categoria_id: r.categoria_id || catId, status_conciliacao: 'classificado', conciliado: true, observacoes: obs, updated_at: now() })
      .eq('id', r.id)
    if (error) console.error(`    [ERRO] ${r.id}: ${error.message}`)
  }
}
console.log(`\nResumo (${total}):`, JSON.stringify(tally))
