/**
 * Importa um extrato bancário (CSV ou OFX) pela linha de comando, com a MESMA
 * lógica da tela (ERP › Conciliação › Importar) — `src/lib/extrato-aplicar`.
 *
 * Serve para o caminho do Sicoob, que só entrega PDF: primeiro
 * `node scripts/sicoob-pdf-para-csv.mjs extrato.pdf saida.csv`, depois este.
 * Genérico de propósito: NÃO é script-por-período, aceita qualquer arquivo do
 * mesmo formato e deduplica no banco por `import_key` + conteúdo.
 *
 * Uso:
 *   npx tsx scripts/importa-extrato.mts <arquivo> [--conta <uuid|trecho do nome>] [--apply]
 *
 * Sem `--apply` roda em dry-run (nada é gravado). Sem `--conta`, usa a Sicoob
 * Conta Corrente se ela for a única correspondência óbvia.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { aplicaExtrato } from '../src/lib/extrato-aplicar'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const arquivo = argv.find(a => !a.startsWith('--'))
const contaArg = argv.includes('--conta') ? argv[argv.indexOf('--conta') + 1] : ''
if (!arquivo) { console.error('uso: npx tsx scripts/importa-extrato.mts <arquivo> [--conta <uuid|nome>] [--apply]'); process.exit(1) }

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })

const { data: contas } = await sb.from('erp_contas_bancarias').select('id, nome, ativo')
const achadas = (contas || []).filter(c =>
    contaArg
        ? (c.id === contaArg || String(c.nome || '').toLowerCase().includes(contaArg.toLowerCase()))
        : /sicoob/i.test(String(c.nome || '')) && /corrente/i.test(String(c.nome || '')))
if (achadas.length !== 1) {
    console.error(achadas.length ? 'mais de uma conta bate com --conta:' : 'nenhuma conta bate com --conta:')
    for (const c of contas || []) console.error('  ' + c.id + '  ' + c.nome)
    process.exit(1)
}
const conta = achadas[0]

const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r = await aplicaExtrato({
    sb,
    contaId: conta.id,
    conteudo: fs.readFileSync(arquivo, 'utf8'),
    dryRun: !APPLY,
})

console.log('Conta ......... ' + r.conta)
console.log('Arquivo ....... ' + arquivo + '  (formato ' + r.formato + ')')
console.log('Periodo ....... ' + r.periodo.de + ' a ' + r.periodo.ate)
console.log('Lidos ......... ' + r.lidos + '  |  novos ' + r.novos + '  |  duplicados (ja no ERP) ' + r.duplicados)
console.log('Entradas ...... ' + brl(r.entradas) + '  |  saidas ' + brl(r.saidas))
if (r.ignoradas_total) {
    console.log('Ignoradas ..... ' + r.ignoradas_total)
    for (const i of r.ignoradas) console.log('    - ' + i.motivo + ': ' + i.linha.slice(0, 90))
}
if (r.novos) {
    console.log('\nLancamentos novos:')
    for (const l of (APPLY ? r.amostra : r.amostra))
        console.log('  ' + l.data + '  ' + (l.tipo === 'entrada' ? '+' : '-') + brl(l.valor).padStart(12) + '  ' + l.descricao.slice(0, 86))
    if (r.novos > r.amostra.length) console.log('  ... e mais ' + (r.novos - r.amostra.length))
}
console.log('\nSaldo do extrato .. ' + (r.saldo_extrato === null ? '(nao informado)' : brl(r.saldo_extrato)))
console.log('Saldo da conta .... ' + brl(r.saldo_apos) + (APPLY ? '' : ' (previsto)'))
console.log('Diferenca ......... ' + (r.diferenca === null ? '-' : brl(r.diferenca)))
if (r.diferenca !== null && Math.abs(r.diferenca) >= 0.005) console.log('  *** ATENCAO: o ERP nao bate com o extrato ***')
console.log('\n' + (APPLY ? 'GRAVADO (' + r.novos + ' movimento(s) como pendente).' : 'DRY-RUN. Use --apply para gravar.'))
