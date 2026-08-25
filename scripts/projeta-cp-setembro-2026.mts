/**
 * Projeta as contas a pagar RECORRENTES de setembro/2026.
 *
 * Setembro tinha só folha, sócio, comissões e contador — R$ 135 mil. Faltava
 * tudo que se repete todo mês e ninguém lança até chegar: imposto, fatura de
 * cartão, marketing, assinaturas, tarifas. O fluxo de caixa mostrava setembro
 * mais leve do que ele é, que é o pior erro que uma projeção pode ter.
 *
 * COMO CADA VALOR FOI ESTIMADO
 * · ISS e DAS — o imposto que vence em setembro é sobre a competência AGOSTO.
 *   A alíquota do Simples é progressiva (RBT12) e subiu forte de junho para
 *   julho, então projetar por percentual fixo erra feio. O que se faz aqui é
 *   escalar o imposto de julho pela razão entre as receitas de agosto e julho —
 *   mesmo perfil de faturamento, volume diferente. É estimativa, e está
 *   marcada como tal: quando o contador fechar a guia, o real substitui.
 * · Cartões — último valor conhecido, não média. As faturas vêm caindo desde o
 *   fechamento do escritório; a média puxaria para cima um custo que não existe
 *   mais.
 * · Demais — valor observado nos últimos meses, que se repete.
 *
 * Tudo entra com `origem='estimativa'` E tag 'orcamento'. As DUAS convenções,
 * de propósito: o Balanço filtra compromisso futuro pela tag e o resto do ERP
 * pela origem; usar só uma foi o que fez R$ 17 mil de CR estimado entrar no
 * Balanço como ativo real.
 *
 * O `evento_key` faz o título real (quando o dinheiro sair) SUBSTITUIR esta
 * previsão em vez de somar junto — sem ele, o mesmo compromisso conta duas
 * vezes (migration 0074).
 *
 *   npx tsx scripts/projeta-cp-setembro-2026.mts           (dry-run)
 *   npx tsx scripts/projeta-cp-setembro-2026.mts --apply
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const { eventoKey } = await import('../src/lib/erp-evento')

const APPLY = process.argv.includes('--apply')
const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100

const { data: cats } = await sb.from('erp_categorias').select('id, nome')
const catId = (nome: string) => (cats ?? []).find(c => c.nome === nome)?.id ?? null

// ── base para os impostos: receita de caixa de julho e agosto ───────────────
const recIds = new Set((await sb.from('erp_categorias').select('id, dre_grupo')).data
    ?.filter(c => c.dre_grupo === 'receita').map(c => c.id) ?? [])
async function receitaDoMes(ym: string) {
    const de = `${ym}-01`, ate = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).toISOString().slice(0, 10)
    const { data } = await sb.from('erp_movimentos_bancarios')
        .select('valor, tipo, categoria_id').gte('data', de).lte('data', ate).eq('tipo', 'entrada')
    return (data ?? []).filter(m => recIds.has(m.categoria_id as string)).reduce((s, m) => s + Number(m.valor || 0), 0)
}
const recJul = await receitaDoMes('2026-07')
const recAgo = await receitaDoMes('2026-08')
const fator = recJul > 0 ? recAgo / recJul : 1
console.log(`receita jul R$ ${brl(recJul)} · ago R$ ${brl(recAgo)} · fator ${fator.toFixed(4)}`)

const ISS_JUL = 24524.81, DAS_JUL = 55846.64
const projetados = [
    { desc: 'ISSQN ref. agosto/2026 (estimado)', valor: r2(ISS_JUL * fator), venc: '2026-09-15', cat: 'Impostos e Taxas' },
    { desc: 'Simples Nacional (DAS) ref. agosto/2026 (estimado)', valor: r2(DAS_JUL * fator), venc: '2026-09-22', cat: 'Impostos e Taxas' },
    { desc: 'DARF empregados - competencia agosto/2026', valor: 2225.46, venc: '2026-09-21', cat: 'Impostos e Taxas' },
    { desc: 'FGTS - competencia agosto/2026', valor: 950.00, venc: '2026-09-07', cat: 'Encargos Sociais' },
    { desc: 'Fatura cartao VISA (deb. automatico)', valor: 5949.84, venc: '2026-09-22', cat: 'Cartão de Crédito' },
    { desc: 'Fatura cartao MASTERCARD (deb. automatico)', valor: 1380.13, venc: '2026-09-22', cat: 'Cartão de Crédito' },
    { desc: 'Marketing - trafego pago', valor: 2500.00, venc: '2026-09-10', cat: 'Marketing e Publicidade' },
    { desc: 'Site ClickWeb - hospedagem bulaassessoria.com', valor: 218.30, venc: '2026-09-10', cat: 'Servicos de Terceiros' },
    { desc: 'Sistema / banco de dados - fatura mensal', valor: 180.00, venc: '2026-09-18', cat: 'Software/Assinaturas' },
    { desc: 'Assinatura Anthropic / Claude IA', valor: 550.00, venc: '2026-09-24', cat: 'Software/Assinaturas' },
    { desc: 'Pacote de servicos bancarios Sicoob', valor: 129.90, venc: '2026-09-10', cat: 'Tarifas Bancarias' },
    { desc: 'Integralizacao de capital cooperativa', valor: 39.00, venc: '2026-09-10', cat: 'Integralizacao Capital Cooperativa' },
]

// ── o que já existe em setembro (não duplicar) ─────────────────────────────
const { data: jaTem } = await sb.from('erp_contas_pagar')
    .select('descricao, valor, vencimento, status')
    .gte('vencimento', '2026-09-01').lte('vencimento', '2026-09-30').neq('status', 'cancelado')
const chaveSimples = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const existe = (d: string) => (jaTem ?? []).some(t => {
    const a = chaveSimples(d).split(' ').filter(w => w.length > 3)
    const b = chaveSimples(String(t.descricao))
    return a.length > 0 && a.slice(0, 2).every(w => b.includes(w))
})

console.log(`\nCP JA LANCADOS EM SETEMBRO: ${jaTem?.length ?? 0} (R$ ${brl((jaTem ?? []).reduce((s, t) => s + Number(t.valor || 0), 0))})`)
console.log('\nA PROJETAR:')
let total = 0
const criar = projetados.filter(p => {
    if (existe(p.desc)) { console.log(`  ja existe, pulando: ${p.desc}`); return false }
    if (!catId(p.cat)) { console.log(`  CATEGORIA INEXISTENTE "${p.cat}", pulando: ${p.desc}`); return false }
    total += p.valor
    console.log(`  ${p.venc}  R$ ${String(brl(p.valor)).padStart(11)}  ${p.cat.padEnd(34)} ${p.desc}`)
    return true
})
console.log(`\n  total a projetar: R$ ${brl(total)}`)
console.log(`  setembro passa de R$ ${brl((jaTem ?? []).reduce((s, t) => s + Number(t.valor || 0), 0))} para R$ ` +
    `${brl((jaTem ?? []).reduce((s, t) => s + Number(t.valor || 0), 0) + total)}`)

if (!APPLY) { console.log('\n(dry-run) use --apply para gravar'); process.exit(0) }

let ok = 0
for (const p of criar) {
    const key = eventoKey({ descricao: p.desc, vencimento: p.venc, tipo: 'pagar' })
    const { error } = await sb.from('erp_contas_pagar').insert({
        descricao: p.desc, valor: p.valor, emissao: '2026-09-01', vencimento: p.venc,
        status: 'aberto', categoria_id: catId(p.cat),
        origem: 'estimativa', evento_key: key,
        tags: ['a-pagar', 'setembro', 'orcamento'],
        observacoes: 'Projecao de recorrentes de setembro/2026 (scripts/projeta-cp-setembro-2026.mts). ' +
            (p.cat === 'Impostos e Taxas' && /ISSQN|DAS/i.test(p.desc)
                ? `Estimado escalando o imposto de julho pela razao entre a receita de agosto e a de julho (fator ${fator.toFixed(4)}). Substituir pelo valor real quando a guia sair.`
                : 'Valor observado nos ultimos meses.'),
    })
    if (error) console.error(`  ERRO ${p.desc}: ${error.message}`)
    else ok++
}
console.log(`\ncriados: ${ok}/${criar.length}`)
