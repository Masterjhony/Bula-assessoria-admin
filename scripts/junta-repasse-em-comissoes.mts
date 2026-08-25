/**
 * Junta "Repasse Assessorias/Parceiros" em "Comissões".
 *
 * No DRE as duas linhas respondem a mesma pergunta — quanto a Bula paga a quem
 * vende — e separa-las obrigava a somar de cabeca para saber o custo real de
 * comissionamento. Pedido do chefe na revisao do DRE.
 *
 * A distincao entre equipe propria e parceiro externo (Rusa, assessorias) NAO
 * se perde: ela aparece no detalhe por beneficiario que o DRE agora abre embaixo
 * da linha. Categoria e para agrupar natureza; quem recebeu e outro eixo.
 *
 *   npx tsx scripts/junta-repasse-em-comissoes.mts           (dry-run)
 *   npx tsx scripts/junta-repasse-em-comissoes.mts --apply
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const APPLY = process.argv.includes('--apply')

const DESTINO = 'Comissão Funcionário'
const NOVO_NOME = 'Comissões'
const ABSORVIDA = 'Repasse Assessorias/Parceiros'
const TABELAS = ['erp_movimentos_bancarios', 'erp_contas_pagar', 'erp_contas_receber', 'erp_cartao_lancamentos'] as const

const { data: cats } = await sb.from('erp_categorias').select('id, nome, ativo')
const acha = (n: string) => (cats ?? []).find(c => c.nome === n)
const destino = acha(DESTINO) ?? acha(NOVO_NOME)
const absorvida = acha(ABSORVIDA)
if (!destino) { console.error('categoria de comissao nao encontrada'); process.exit(1) }
if (!absorvida) { console.log(`"${ABSORVIDA}" ja nao existe — nada a fazer.`); process.exit(0) }

let total = 0
for (const t of TABELAS) {
    const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('categoria_id', absorvida.id)
    if (count) { console.log(`  ${t.replace('erp_', '')}: ${count}`); total += count }
}
console.log(`\n"${ABSORVIDA}" -> "${NOVO_NOME}" (${total} linha(s))`)
if (!APPLY) { console.log('\n(dry-run) use --apply para gravar'); process.exit(0) }

for (const t of TABELAS) {
    const { error } = await sb.from(t).update({ categoria_id: destino.id }).eq('categoria_id', absorvida.id)
    if (error) console.error(`  ERRO ${t}: ${error.message}`)
}
await sb.from('erp_categorias').update({ ativo: false }).eq('id', absorvida.id)
await sb.from('erp_categorias').update({ nome: NOVO_NOME }).eq('id', destino.id)
console.log(`pronto: linhas repontadas e "${DESTINO}" renomeada para "${NOVO_NOME}"`)
