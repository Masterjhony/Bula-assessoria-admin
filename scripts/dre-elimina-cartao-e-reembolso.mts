/**
 * Tira "Cartao de Credito" e "REEMBOLSO" da DRE.
 *
 * Pedido do Marcelo (grupo, 24/08): "Nao existe categoria cartao de credito e
 * reembolso, as despesas precisam ser classificadas". Decisao do Joao (26/08):
 *
 *   Cartao de Credito -> Comissoes (custo_direto)
 *     Os 17 movimentos dessa categoria sao 100% PAGAMENTO DE FATURA, nao gasto.
 *     E a fatura de agosto confirma o que a memoria ja dizia: todas as compras
 *     dos dois cartoes vem sob "GASTOS DE FELIPE V ANDRADE". Pagar a fatura e a
 *     forma de quitar o que a Bula deve a ele — logo, comissao.
 *     O gasto discriminado continua existindo, mas onde ele pode ser auditado:
 *     ERP > Cartoes > Fatura > lancamentos, um por estabelecimento.
 *
 *   REEMBOLSO -> Despesa Operacional Leilao (custo_direto)
 *     Reembolso a assessor e custo direto de leilao. Os tres com descricao
 *     clara confirmam (Leilao Kriz, reemissao de passagens da Expogenetica,
 *     TAG de estrada).
 *
 * ⚠ DUPLA CONTAGEM TRATADA AQUI
 * Os dois CP de fatura de agosto (MASTERCARD 1.380,13 + VISA 5.949,84 =
 * 7.329,97) sao a LIQUIDACAO do CP 739d2a76 "SALDO DEVIDO A BULINHA"
 * (7.392,00 − 62,03 de desconto = 7.329,97), que ja esta em Comissoes.
 * Jogar os dois em Comissoes sem mais nada faria a DRE por COMPETENCIA contar
 * a mesma comissao duas vezes. Por isso eles recebem `origem = 'sintetico'`:
 * e exatamente o que esse marcador existe para dizer — titulo agregado de
 * pagamento, que vale no caixa e nao vale na competencia, onde quem responde
 * pela despesa e o titulo analitico.
 *
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
let erros = 0
const fail = (e: { message: string } | null, ctx: string) => { if (e) { console.error('   ERRO ' + ctx + ': ' + e.message); erros++ } }

const CARTAO = 'bd6c6ed1-054a-404c-ba21-08f424888c1f'
const REEMBOLSO = '6e79fd9e-f837-4ff4-a73d-3d8bdabe7ce7'
const COMISSOES = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'
const DESP_LEILAO = '562264eb-8134-4990-a56b-d884279acf90'
/** Os dois CP de fatura que liquidam o saldo devido ao Bulinha. */
const CP_LIQUIDA_BULINHA = ['b2d86004', '2e82dcd6']
const NOTA_CARTAO = ' [DRE 26/08] Recategorizado de "Cartao de Credito" para Comissoes: pagamento de fatura nao e despesa de estrutura — as compras do cartao sao 100% GASTOS DE FELIPE V ANDRADE e a fatura abate o que a Bula deve a ele. O gasto discriminado vive em ERP > Cartoes > Fatura > lancamentos.'
const NOTA_REEMB = ' [DRE 26/08] Recategorizado de "REEMBOLSO" para Despesa Operacional Leilao: reembolso a assessor e custo direto do leilao.'
const NOTA_SINT = ' [DRE 26/08] Marcado origem=sintetico: este titulo e a LIQUIDACAO do CP 739d2a76 (SALDO DEVIDO A BULINHA, 7.392,00 com 62,03 de desconto), que ja responde pela comissao na competencia. Vale no caixa, nao vale na competencia — senao a mesma comissao conta duas vezes.'

const PLANO = [
    { de: CARTAO, para: COMISSOES, nome: 'Cartao de Credito -> Comissoes', nota: NOTA_CARTAO },
    { de: REEMBOLSO, para: DESP_LEILAO, nome: 'REEMBOLSO -> Despesa Operacional Leilao', nota: NOTA_REEMB },
]

for (const p of PLANO) {
    console.log('\n' + '='.repeat(76) + '\n' + p.nome + '\n' + '='.repeat(76))

    const { data: movs } = await sb.from('erp_movimentos_bancarios')
        .select('id,data,tipo,valor,descricao,observacoes').eq('categoria_id', p.de).order('data')
    console.log(`  movimentos (${(movs || []).length}) — total ${brl((movs || []).reduce((s, m) => s + Number(m.valor), 0))}`)
    for (const m of movs || []) {
        console.log(`    ${m.data}  ${brl(m.valor).padStart(11)}  ${(m.descricao || '').slice(0, 58)}`)
        if (APPLY) fail((await sb.from('erp_movimentos_bancarios')
            .update({ categoria_id: p.para, observacoes: (m.observacoes || '') + p.nota })
            .eq('id', m.id)).error, 'mov ' + m.id.slice(0, 8))
    }

    const { data: cps } = await sb.from('erp_contas_pagar')
        .select('id,vencimento,valor,status,descricao,observacoes,origem').eq('categoria_id', p.de).order('vencimento')
    console.log(`  CP (${(cps || []).length})`)
    for (const c of cps || []) {
        const liquida = CP_LIQUIDA_BULINHA.includes(c.id.slice(0, 8))
        console.log(`    ${c.vencimento}  ${String(c.status).padEnd(9)} ${brl(c.valor).padStart(10)}  ${(c.descricao || '').slice(0, 46)}${liquida ? '   << origem -> sintetico' : ''}`)
        const patch: Record<string, unknown> = { categoria_id: p.para, observacoes: (c.observacoes || '') + p.nota }
        if (liquida) { patch.origem = 'sintetico'; patch.observacoes = String(patch.observacoes) + NOTA_SINT }
        if (APPLY) fail((await sb.from('erp_contas_pagar').update(patch).eq('id', c.id)).error, 'cp ' + c.id.slice(0, 8))
    }
}

/* ---- desativa as duas categorias para nao voltarem a ser escolhidas ------- */
console.log('\n' + '='.repeat(76) + '\nDesativando as categorias\n' + '='.repeat(76))
for (const id of [CARTAO, REEMBOLSO]) {
    const { data: c } = await sb.from('erp_categorias').select('id,nome,ativo').eq('id', id).single()
    console.log(`  ${c!.nome} — ativo ${c!.ativo} -> false`)
    if (APPLY) fail((await sb.from('erp_categorias').update({ ativo: false }).eq('id', id)).error, 'cat ' + c!.nome)
}

/* ---- confere que nada ficou para tras ------------------------------------ */
console.log('\nConferencia final')
for (const id of [CARTAO, REEMBOLSO]) {
    const [mv, cp, cr, cl] = await Promise.all([
        sb.from('erp_movimentos_bancarios').select('id', { count: 'exact', head: true }).eq('categoria_id', id),
        sb.from('erp_contas_pagar').select('id', { count: 'exact', head: true }).eq('categoria_id', id),
        sb.from('erp_contas_receber').select('id', { count: 'exact', head: true }).eq('categoria_id', id),
        sb.from('erp_cartao_lancamentos').select('id', { count: 'exact', head: true }).eq('categoria_id', id),
    ])
    console.log(`  ${id.slice(0, 8)}  mov ${mv.count} · CP ${cp.count} · CR ${cr.count} · lanc.cartao ${cl.count}`)
}

console.log('\n' + (APPLY ? (erros ? `*** ${erros} erro(s) ***` : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.'))
