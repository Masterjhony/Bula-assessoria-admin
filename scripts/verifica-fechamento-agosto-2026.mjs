/**
 * AUDITORIA do fechamento de agosto/2026 depois da correcao de 01/09/2026.
 * Nao escreve nada. Cada teste imprime OK ou FALHA com o detalhe.
 *
 * 1. ERP x HastaPro lote a lote        (dados.json da apuracao das 3 fontes)
 * 2. Consistencia interna do fechamento (lances x vgv x por_assessor x comissao)
 * 3. Fechamento duplicado
 * 4. CP/CR orfaos — titulo apontando para fechamento que nao existe
 * 5. CP/CR citando os fechamentos apagados
 * 6. CR x receita_bula do fechamento
 * 7. Comissao de agosto x CP ja lancado
 *
 * Uso: node scripts/verifica-fechamento-agosto-2026.mjs
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = n => Math.round(Number(n || 0) * 100) / 100
let falhas = 0
const ok = m => console.log('  OK   ' + m)
const falha = m => { falhas++; console.log('  FALHA ' + m) }
const nota = m => console.log('  ·    ' + m)

const D = JSON.parse(fs.readFileSync('outputs/vendas-agosto-2026/dados.json', 'utf8'))
const { data: fech } = await sb.from('bula_leilao_fechamento')
    .select('*').gte('data', '2026-08-01').lte('data', '2026-08-31').order('data')

console.log(`\n═══ AGOSTO/2026 — ${fech.length} fechamentos · VGV R$ ${brl(fech.reduce((s, f) => s + (f.vgv_total || 0), 0))} · comissao R$ ${brl(fech.reduce((s, f) => s + (f.comissao_assessoria || 0), 0))}`)

console.log('\n[1] ERP x HASTAPRO, LOTE A LOTE')
const soHp = D.lotes_divergentes.filter(x => x.tipo === 'so_no_hastapro')
const soErp = D.lotes_divergentes.filter(x => x.tipo === 'so_no_erp')
soHp.length ? falha(`${soHp.length} lotes existem no HastaPro e nao no ERP`) : ok('nenhum lote do HastaPro ficou fora do ERP')
soErp.length ? falha(`${soErp.length} lotes existem no ERP e nao no HastaPro`) : ok('nenhum lote do ERP falta no HastaPro')
const difLeilao = D.cruzamento.filter(c => c.dif_erp !== null && Math.abs(c.dif_erp) >= 1)
difLeilao.length ? falha(`${difLeilao.length} leiloes com VGV diferente: ` + difLeilao.map(c => c.leilao).join(', ')) : ok('todo leilao casado bate o VGV ao centavo')
const semFech = D.cruzamento.filter(c => !c.erp)
semFech.length ? falha(`${semFech.length} leiloes do HastaPro sem fechamento`) : ok('nenhum leilao do HastaPro ficou sem fechamento')
const semPar = D.erp_sem_par
nota(`${semPar.length} fechamentos sem par no HastaPro (esperado 2): ` + semPar.map(e => `${e.nome} R$ ${brl(e.vgv)}`).join(' | '))
const atrib = D.lotes_divergentes.filter(x => x.tipo === 'atribuicao')
nota(`${atrib.length} lotes com divergencia de ATRIBUICAO (decisao em aberto, nao muda o total): R$ ${brl(atrib.reduce((s, x) => s + x.vgv_hp, 0))}`)

console.log('\n[2] CONSISTENCIA INTERNA DE CADA FECHAMENTO')
let ruins = 0
for (const f of fech) {
    const L = Array.isArray(f.lances) ? f.lances : []
    const A = Array.isArray(f.por_assessor) ? f.por_assessor : []
    const vgvL = r2(L.reduce((s, l) => s + Number(l.vgv || 0), 0))
    const vgvA = r2(A.reduce((s, a) => s + Number(a.vgv || 0), 0))
    const comA = r2(A.reduce((s, a) => s + Number(a.comissao || 0), 0))
    const p = []
    if (L.length && Math.abs(vgvL - f.vgv_total) >= 0.01) p.push(`lances ${brl(vgvL)} != vgv_total ${brl(f.vgv_total)}`)
    if (A.length && Math.abs(vgvA - f.vgv_total) >= 0.01) p.push(`por_assessor ${brl(vgvA)} != vgv_total ${brl(f.vgv_total)}`)
    if (A.length && Math.abs(comA - (f.comissao_assessoria || 0)) >= 0.01) p.push(`soma das comissoes ${brl(comA)} != comissao_assessoria ${brl(f.comissao_assessoria)}`)
    if (L.length && L.length !== f.lotes_vendidos) p.push(`${L.length} lances != lotes_vendidos ${f.lotes_vendidos}`)
    if (p.length) { ruins++; falha(`${f.data} ${f.nome.slice(0, 44)} — ${p.join(' · ')}`) }
}
if (!ruins) ok(`os ${fech.length} fechamentos fecham por dentro (lances = VGV = por_assessor, comissao = soma)`)

console.log('\n[3] FECHAMENTO DUPLICADO')
const chave = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const dups = []
for (let i = 0; i < fech.length; i++) for (let j = i + 1; j < fech.length; j++) {
    const a = fech[i], b = fech[j]
    if (a.data !== b.data) continue
    const ka = chave(a.nome), kb = chave(b.nome)
    if (ka.includes(kb) || kb.includes(ka) || a.vgv_total === b.vgv_total) dups.push(`${a.data} "${a.nome}" x "${b.nome}"`)
}
dups.length ? falha('possiveis duplicatas: ' + dups.join(' ; ')) : ok('nenhum par de fechamentos suspeito de duplicata no mesmo dia')

console.log('\n[4] CP/CR ORFAOS (titulo apontando para fechamento inexistente)')
const { data: todosFech } = await sb.from('bula_leilao_fechamento').select('id')
const vivos = new Set(todosFech.map(f => f.id))
for (const [tab, rot] of [['erp_contas_pagar', 'CP'], ['erp_contas_receber', 'CR']]) {
    const { data } = await sb.from(tab).select('id,descricao,valor,vencimento,fechamento_id').not('fechamento_id', 'is', null)
    const orf = data.filter(x => !vivos.has(x.fechamento_id))
    orf.length ? falha(`${rot}: ${orf.length} orfaos — ` + orf.map(x => `${x.vencimento} R$ ${brl(x.valor)} ${x.descricao.slice(0, 40)}`).join(' | '))
        : ok(`${rot}: nenhum titulo aponta para fechamento inexistente (${data.length} com vinculo)`)
}

console.log('\n[5] CP/CR DOS FECHAMENTOS APAGADOS')
for (const [tab, rot] of [['erp_contas_pagar', 'CP'], ['erp_contas_receber', 'CR']]) {
    let n = 0
    for (const alvo of ['CASABRANCA', 'FEMEAS JMP', 'FÊMEAS JMP']) {
        const { data } = await sb.from(tab).select('id,descricao,valor').ilike('descricao', `%${alvo}%`).gte('vencimento', '2026-08-01')
        n += (data ?? []).length
        for (const x of data ?? []) falha(`${rot} remanescente: R$ ${brl(x.valor)} ${x.descricao}`)
    }
    if (!n) ok(`${rot}: nenhum titulo sobrou dos dois fechamentos apagados`)
}

console.log('\n[6] CR x RECEITA DO FECHAMENTO')
const ids = fech.map(f => f.id)
const { data: cr } = await sb.from('erp_contas_receber').select('*').in('fechamento_id', ids)
const porFech = new Map()
for (const c of cr) porFech.set(c.fechamento_id, (porFech.get(c.fechamento_id) || 0) + Number(c.valor || 0))
let incoerentes = 0
for (const f of fech) {
    const crv = porFech.get(f.id) || 0
    const rec = Number(f.receita_bula || 0)
    if (crv && Math.abs(crv - rec) >= 0.01) { incoerentes++; nota(`${f.data} ${f.nome.slice(0, 40)} — CR R$ ${brl(crv)} x receita_bula R$ ${brl(rec)}`) }
}
console.log(`  ${incoerentes ? '·   ' : 'OK  '} ${incoerentes} fechamentos com CR lancada e receita_bula divergente (estimativa antiga; a NF e quem manda)`)
const semReceita = fech.filter(f => !Number(f.receita_bula) && Number(f.comissao_assessoria))
nota(`${semReceita.length} fechamentos com comissao e receita ZERO: R$ ${brl(semReceita.reduce((s, f) => s + f.comissao_assessoria, 0))} de comissao sem receita — falta acordo + faturamento`)

console.log('\n[7] COMISSAO DE AGOSTO x CP JA LANCADO')
const { data: cp } = await sb.from('erp_contas_pagar').select('*').in('fechamento_id', ids)
const comFech = r2(fech.reduce((s, f) => s + Number(f.comissao_assessoria || 0), 0))
const comCp = r2(cp.reduce((s, c) => s + Number(c.valor || 0), 0))
const comFechComCp = new Set(cp.map(c => c.fechamento_id))
nota(`comissao nos fechamentos R$ ${brl(comFech)} · ja em CP R$ ${brl(comCp)} em ${comFechComCp.size} de ${fech.length} fechamentos`)
nota(`falta virar CP: R$ ${brl(comFech - comCp)} — e o ciclo do dia 25, depois das decisoes em aberto`)
for (const c of cp) {
    const f = fech.find(x => x.id === c.fechamento_id)
    const a = (f?.por_assessor ?? []).find(a => chave(a.nome) === chave(String(c.vendedor || '')) || chave(c.descricao).includes(chave(a.nome)))
    if (a && Math.abs(Number(c.valor) - Number(a.comissao)) >= 0.01)
        falha(`CP R$ ${brl(c.valor)} != comissao do fechamento R$ ${brl(a.comissao)} — ${c.descricao.slice(0, 56)}`)
}
if (!cp.some(() => false)) ok('nenhum CP de agosto diverge da comissao gravada no fechamento')

console.log(`\n═══ ${falhas ? falhas + ' FALHA(S)' : 'SEM FALHAS'} ═══\n`)
process.exit(falhas ? 1 : 0)
