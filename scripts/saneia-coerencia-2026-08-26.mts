/**
 * Saneamento de coerencia — 26/08/2026. Só correções MECANICAS, cada uma com a
 * regra de onde veio. O que exige decisao de negocio NAO esta aqui (vai no
 * relatorio da varredura).
 *
 * [1] Flags de conciliacao contraditorias no movimento (conciliado=true com
 *     status=classificado). A dupla (status_conciliacao, conciliado) tem que
 *     andar junta; o par Bula Remates 19.810,50 ficou classificado de proposito
 *     (rateio pendente), entao o booleano e que esta errado.
 *
 * [2] Campos das faturas de cartao jan-jun recompostos a partir dos proprios
 *     lancamentos, na semantica canonica da validacao `fatura_bate_com_lancs`:
 *       debitos    = Σ tipo 'compra'
 *       encargos   = Σ 'anuidade' + 'seguro' + 'encargo'
 *       pagamentos = -Σ 'pagamento'
 *     `total_fatura` NUNCA e tocado: ele e o debito bancario real, conciliado
 *     com o extrato (movimento_id). O valor declarado no PDF vai para as
 *     observacoes — nada some em silencio.
 *
 * [3] CR com status 'recebido' e data_recebimento nula (imports de jan-jun,
 *     anteriores ao modulo de conciliacao). Sem movimento vinculado para dar a
 *     data real, entra o VENCIMENTO como aproximacao declarada — tag
 *     'data-recebimento-aproximada' + nota. Sem isso o dinheiro nunca aparece
 *     em "recebido no periodo" de mes nenhum, que e pior que a aproximacao.
 *
 * [4] Dois CP de seguro com origem='estimativa' sem a tag 'orcamento' — as duas
 *     convencoes de compromisso futuro têm que coincidir (verdade/convencoes).
 *
 * Dry-run por padrao; --apply grava.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const f = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100
let erros = 0
const fail = (e: { message: string } | null, ctx: string) => { if (e) { console.error('   ERRO ' + ctx + ': ' + e.message); erros++ } }

/* ═══ [1] flags do movimento ═══ */
console.log('\n[1] Flags de conciliacao contraditorias')
const { data: incoerentes } = await sb.from('erp_movimentos_bancarios')
    .select('id,data,valor,descricao,status_conciliacao,conciliado')
    .eq('conciliado', true).neq('status_conciliacao', 'conciliado')
for (const m of incoerentes || []) {
    console.log(`   mov ${String(m.id).slice(0, 8)} ${m.data} ${f(m.valor)} status=${m.status_conciliacao} conciliado=true -> false  (${String(m.descricao).slice(0, 44)})`)
    if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({ conciliado: false }).eq('id', m.id)).error, 'mov ' + String(m.id).slice(0, 8))
}
if (!(incoerentes || []).length) console.log('   nada a corrigir')

/* ═══ [2] campos das faturas jan-jun ═══ */
console.log('\n[2] Campos das faturas de cartao recompostos dos lancamentos')
const { data: faturas } = await sb.from('erp_cartao_faturas').select('*').order('competencia')
const { data: lancs } = await sb.from('erp_cartao_lancamentos').select('fatura_id,tipo,valor')
const ENCARGO = new Set(['anuidade', 'seguro', 'encargo'])
for (const ft of faturas || []) {
    const ls = (lancs || []).filter(l => l.fatura_id === ft.id)
    if (!ls.length) { console.log(`   ${ft.competencia} ${String(ft.cartao_id).slice(0, 8)}: SEM LANCAMENTOS — pulando (nao ha itemizacao para recompor)`); continue }
    const soma = (pred: (t: string) => boolean) => r2(ls.filter(l => pred(String(l.tipo || ''))).reduce((s, l) => s + Number(l.valor), 0))
    const compras = soma(t => t === 'compra')
    const encargos = soma(t => ENCARGO.has(t))
    const pagamentos = r2(-soma(t => t === 'pagamento'))
    const estornos = soma(t => t === 'estorno')
    const totalCalc = r2(compras + encargos + estornos)

    const difs: string[] = []
    if (Math.abs(compras - r2(Number(ft.debitos))) > 0.05) difs.push(`debitos ${f(ft.debitos)} -> ${f(compras)}`)
    if (Math.abs(encargos - r2(Number(ft.encargos))) > 0.05) difs.push(`encargos ${f(ft.encargos)} -> ${f(encargos)}`)
    if (Math.abs(pagamentos - r2(Number(ft.pagamentos))) > 0.05) difs.push(`pagamentos ${f(ft.pagamentos)} -> ${f(pagamentos)}`)
    if (!difs.length) continue

    const totalOk = Math.abs(totalCalc - r2(Number(ft.total_fatura))) <= 0.05
    console.log(`   ${ft.competencia} ${String(ft.cartao_id).slice(0, 8)}: ${difs.join(' | ')}${totalOk ? '' : `  ⚠ total ${f(ft.total_fatura)} != itens ${f(totalCalc)} — lancamentos incompletos, so anotando`}`)
    if (!totalOk) {
        if (APPLY) fail((await sb.from('erp_cartao_faturas').update({
            observacoes: ((ft.observacoes || '') + ` [COERENCIA 26/08] Itens somam ${f(totalCalc)} contra total ${f(ft.total_fatura)} — a itemizacao do PDF esta incompleta para esta fatura; campos declarados mantidos.`).trim(),
        }).eq('id', ft.id)).error, 'fatura ' + ft.competencia)
        continue
    }
    if (APPLY) fail((await sb.from('erp_cartao_faturas').update({
        debitos: compras, encargos, pagamentos,
        observacoes: ((ft.observacoes || '') + ` [COERENCIA 26/08] Campos recompostos dos lancamentos (semantica canonica: debitos=compras, encargos=anuidade+seguro+encargo, pagamentos=-Σpagamento). Valores do PDF: debitos ${f(ft.debitos)}, encargos ${f(ft.encargos)}, pagamentos ${f(ft.pagamentos)}. total_fatura intocado (e o debito bancario conciliado).`).trim(),
    }).eq('id', ft.id)).error, 'fatura ' + ft.competencia)
}

/* ═══ [3] CR recebido sem data_recebimento ═══ */
console.log('\n[3] CR recebido sem data_recebimento (imports pre-modulo)')
const { data: semData } = await sb.from('erp_contas_receber')
    .select('id,descricao,valor,vencimento,tags,observacoes')
    .eq('status', 'recebido').is('data_recebimento', null)
for (const c of semData || []) {
    console.log(`   ${String(c.id).slice(0, 8)} ${f(c.valor).padStart(11)}  data_recebimento <- vencimento ${c.vencimento}  ${String(c.descricao).slice(0, 46)}`)
    if (APPLY) fail((await sb.from('erp_contas_receber').update({
        data_recebimento: c.vencimento,
        tags: [...new Set([...(c.tags || []), 'data-recebimento-aproximada'])],
        observacoes: ((c.observacoes || '') + ' [COERENCIA 26/08] data_recebimento aproximada pelo vencimento: o titulo veio de import anterior ao modulo de conciliacao, esta recebido, mas sem data o valor nunca aparecia no "recebido no periodo" de mes nenhum. Sem movimento bancario vinculado para dar a data exata.').trim(),
    }).eq('id', c.id)).error, 'cr ' + String(c.id).slice(0, 8))
}
if (!(semData || []).length) console.log('   nada a corrigir')

/* ═══ [4] convencao de compromisso futuro nos CP abertos ═══ */
console.log('\n[4] CP estimativa aberto sem tag orcamento')
const { data: cpsEst } = await sb.from('erp_contas_pagar')
    .select('id,descricao,valor,status,tags').eq('origem', 'estimativa')
    .in('status', ['aberto', 'parcial', 'vencido'])
for (const c of cpsEst || []) {
    if ((c.tags || []).includes('orcamento')) continue
    console.log(`   CP ${String(c.id).slice(0, 8)} ${f(c.valor).padStart(10)} ${c.status}  + tag orcamento  ${String(c.descricao).slice(0, 46)}`)
    if (APPLY) fail((await sb.from('erp_contas_pagar').update({
        tags: [...new Set([...(c.tags || []), 'orcamento'])],
    }).eq('id', c.id)).error, 'cp ' + String(c.id).slice(0, 8))
}

console.log('\n' + (APPLY ? (erros ? `*** ${erros} erro(s) ***` : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.'))
