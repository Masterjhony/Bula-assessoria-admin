/**
 * Gera o fechamento dos leilões que têm lances capturados e nenhum fechamento.
 *
 * A captura do grupo grava a venda em `bula_leilao_vendas`, mas o fechamento só
 * nasce quando alguém manda reconstruir. Leilão cujas vendas ficaram ligadas e
 * que nunca gerou fechamento fica invisível para o ERP inteiro — sem VGV, sem
 * comissão, sem cobrança.
 *
 * NÃO reconstrói onde já existe fechamento na mesma data para o mesmo evento.
 * A comparação ignora palavras genéricas ("leilão", "nelore", "fêmeas"…): com
 * elas, "LEILÃO TOUROS FAZENDA SÃO GERALDO" casava com "LEILÃO NELORE MAFRA" e
 * o São Geraldo era dado como lançado sem estar.
 *
 *   npx tsx scripts/fecha-leiloes-com-lances.mts           (dry-run)
 *   npx tsx scripts/fecha-leiloes-com-lances.mts --apply
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const l of fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
    if (!l || l.startsWith('#') || !l.includes('=')) continue
    const i = l.indexOf('=')
    process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, '')
}
const { rebuildFechamentoFromLances } = await import('../src/lib/lances-fechamento')

const APPLY = process.argv.includes('--apply')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})

const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const GENERICAS = new Set(['leilao', 'leiloes', 'virtual', 'edicao', 'etapa', 'mega', 'evento',
    'especial', 'nelore', 'femeas', 'touros', 'matrizes', 'fazenda', 'agropecuaria', 'premium', 'reserva',
    // nomes de FEIRA, nao de leilao: varios leiloes diferentes acontecem dentro
    // da mesma feira e compartilham a palavra.
    'expogenetica', 'expozebu', 'expoinel'])
const distintivas = (nome: string) => semAcento(nome).toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 3 && !GENERICAS.has(w))
const mesmoEvento = (a: string, b: string) => {
    const tb = semAcento(b).toLowerCase()
    return distintivas(a).some(w => tb.includes(w))
}

// cronogramas que têm venda capturada
const { data: vendas } = await sb.from('bula_leilao_vendas')
    .select('cronograma_id, valor').not('cronograma_id', 'is', null)
const porCron = new Map<string, { n: number; comValor: number }>()
for (const v of vendas ?? []) {
    const a = porCron.get(v.cronograma_id as string) || { n: 0, comValor: 0 }
    a.n++; if (v.valor != null) a.comValor++
    porCron.set(v.cronograma_id as string, a)
}

const ids = [...porCron.keys()]
const { data: crons } = await sb.from('cronograma_leiloes').select('id, nome, data').in('id', ids)
const datas = [...new Set((crons ?? []).map(c => String(c.data).slice(0, 10)))]
const { data: fechs } = await sb.from('bula_leilao_fechamento').select('id, nome, data, vgv_total').in('data', datas)

let criados = 0, pulados = 0
for (const c of (crons ?? []).sort((a, b) => String(a.data).localeCompare(String(b.data)))) {
    const stats = porCron.get(c.id)!
    const d = String(c.data).slice(0, 10)
    const jaTem = (fechs ?? []).find(f => String(f.data).slice(0, 10) === d && mesmoEvento(c.nome, f.nome))
    if (jaTem) { pulados++; continue }
    if (!stats.comValor) {
        console.log(`  ${d} ${c.nome.slice(0, 42)}: ${stats.n} venda(s) sem valor — nada a fechar`)
        continue
    }
    if (!APPLY) {
        console.log(`  ${d} ${c.nome.slice(0, 42)}: SERIA criado (${stats.comValor} lote(s) com valor)`)
        criados++
        continue
    }
    const r = await rebuildFechamentoFromLances(sb, c.id)
    console.log(`  ${d} ${c.nome.slice(0, 42)}: ${JSON.stringify(r)}`)
    criados++
}
console.log(`\ncronogramas com lances: ${ids.length} | ja fechados: ${pulados} | ${APPLY ? 'criados' : 'a criar'}: ${criados}`)
if (!APPLY) console.log('(dry-run) use --apply para gravar')
