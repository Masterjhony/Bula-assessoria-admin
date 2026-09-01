/**
 * CORRECAO DO FECHAMENTO DE AGOSTO/2026 — a parte que o importador do HastaPro
 * nao faz. Os 9 leiloes que tem lote no HastaPro foram importados por
 * `scripts/importa-fechamento-hastapro.mts`; aqui ficam as tres operacoes que
 * dependem de decisao ja tomada e provada:
 *
 *  A) NAVIRAI MATRIZES 22/08 — tirar o lote 9 (R$ 33.000). Ele e o lote 09 do
 *     4o Pepitas Colonial do MESMO DIA, que ja o contem: mesmo valor, mesma
 *     parcela (1.100 x30), mesmo comprador (Bruno Machado). A ficha do grupo
 *     nao dizia de que leilao era e o parser casou pelo evento da agenda.
 *     ⚠ NAO se refaz este fechamento pelo HastaPro de proposito: a atribuicao
 *     do Gustavo Rusa (lotes 1 e 5, direcionamento) e decisao humana e o
 *     HastaPro credita o pisteiro. Aqui so o lote duplicado sai.
 *
 *  B) APAGAR dois fechamentos que sao duplicata comprovada:
 *     - "NELORE PARANA E CASABRANCA" 20/08 (84.000) = lote 09 do CEN & Fazenda
 *       Modelo do mesmo dia, ja lancado la (a ficha diz "leilao modelo").
 *     - "FEMEAS JMP" 21/08 (41.400) = lote 48 do Shopping Navirai de 15/08,
 *       repostado em outro grupo 6 dias depois (a ficha comeca com "*Shopping
 *       Navirai*"). E o unico lote 48 do periodo no HastaPro.
 *
 *  C) CRIAR o "NELORE PINTADO ENGENHO DA SERRA" 29/08 — 4 lotes do Douglas que
 *     so existem como ficha de WhatsApp. Entra com origem 'lances-auto' de
 *     proposito: se o HastaPro receber o leilao depois, o importador substitui
 *     sozinho.
 *
 * Nao cria nem apaga CP/CR: o inventario de 01/09 confirmou que NENHUM titulo
 * aponta para os fechamentos tocados aqui. A comissao de agosto vira CP no
 * ciclo do dia 25, depois das decisoes em aberto.
 *
 * Backup previo: outputs/backup-correcao-agosto-2026-09-01.json
 * Dry-run por padrao. Use --apply para gravar.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const uf = s => (String(s || '').match(/\/([A-Z]{2})\s*$/) || [])[1] || null

/** Nenhuma escrita acontece sem antes provar que nenhum titulo aponta para o registro. */
async function semTitulos(id, nome) {
    const [{ data: cp }, { data: cr }] = await Promise.all([
        sb.from('erp_contas_pagar').select('id,descricao,valor').eq('fechamento_id', id),
        sb.from('erp_contas_receber').select('id,descricao,valor').eq('fechamento_id', id),
    ])
    if ((cp ?? []).length || (cr ?? []).length) {
        console.error(`ABORTA: "${nome}" tem ${cp.length} CP e ${cr.length} CR ligados — resolver antes.`)
        for (const x of [...cp, ...cr]) console.error('   ', x.valor, x.descricao)
        process.exit(1)
    }
    return true
}

/* ═══ A) NAVIRAÍ MATRIZES — tirar o lote 9 ════════════════════════════════ */
const { data: nav } = await sb.from('bula_leilao_fechamento')
    .select('*').eq('data', '2026-08-22').ilike('nome', '%NAVIRA%').single()
await semTitulos(nav.id, nav.nome)

const fora = nav.lances.find(l => String(l.lote) === '9')
const lances = nav.lances.filter(l => String(l.lote) !== '9')
if (!fora) { console.error('ABORTA: lote 9 nao encontrado em ' + nav.nome); process.exit(1) }

const vgv = r2(lances.reduce((s, l) => s + l.vgv, 0))
const porAssessor = [...new Set(lances.map(l => l.assessor))].map(nome => {
    const meus = lances.filter(l => l.assessor === nome)
    const v = r2(meus.reduce((s, l) => s + l.vgv, 0))
    /* percentual vem do proprio fechamento — nao se reescreve acordo aqui */
    const pct = nav.por_assessor.find(a => a.nome === nome)?.comissao_pct ?? 0.02
    return {
        nome, vgv: v, animais: meus.reduce((s, l) => s + (l.animais || 1), 0),
        empresa: 'Bula Assessoria', transacoes: meus.length,
        comissao: r2(v * pct), comissao_pct: pct,
        ticket_medio: r2(v / meus.length), pct_total: Number((v / vgv).toFixed(6)),
    }
}).sort((a, b) => b.vgv - a.vgv).map((a, i) => ({ ...a, posicao: i + 1 }))

const porComprador = [...new Set(lances.map(l => l.comprador || '(sem comprador)'))].map(c => {
    const meus = lances.filter(l => (l.comprador || '(sem comprador)') === c)
    const v = r2(meus.reduce((s, l) => s + l.vgv, 0))
    return { comprador: c, uf: uf(c), vgv: v, lotes: meus.length, animais: meus.reduce((s, l) => s + (l.animais || 1), 0) }
}).sort((a, b) => b.vgv - a.vgv).map((c, i) => ({ ...c, rank: i + 1 }))

const porEstado = [...new Set(lances.map(l => uf(l.comprador)).filter(Boolean))].map(u => {
    const meus = lances.filter(l => uf(l.comprador) === u)
    const v = r2(meus.reduce((s, l) => s + l.vgv, 0))
    return { uf: u, estado: u, vgv: v, lotes: meus.length, animais: meus.reduce((s, l) => s + (l.animais || 1), 0), pct_total: Number((v / vgv).toFixed(6)), ticket_medio: r2(v / meus.length) }
}).sort((a, b) => b.vgv - a.vgv)

const navPatch = {
    lances, por_assessor: porAssessor, compradores: porComprador, por_estado: porEstado,
    vgv_total: vgv, lotes_vendidos: lances.length,
    animais_vendidos: lances.reduce((s, l) => s + (l.animais || 1), 0),
    ticket_medio: r2(vgv / lances.length), maior_lance: r2(Math.max(...lances.map(l => l.vgv))),
    compradores_unicos: porComprador.length, estados_alcancados: porEstado.length,
    comissao_assessoria: r2(porAssessor.reduce((s, a) => s + a.comissao, 0)),
    observacoes: `${nav.observacoes || ''} [01/09/2026] Removido o lote 9 (R$ 33.000, Douglas, comprador Bruno Machado): e o lote 09 do 4o LEILAO PEPITAS COLONIAL do mesmo dia 22/08, que ja o contem (mesmo valor, mesma parcela de 1.100 x30, mesmo comprador). A ficha do grupo nao dizia de que leilao era e o parser casou pelo evento da agenda. Atribuicao do Gustavo Rusa nos lotes 1 e 5 preservada de proposito — e decisao de direcionamento, nao o pisteiro do HastaPro.`.trim(),
}
console.log(`A) ${nav.nome}`)
console.log(`   ${nav.lotes_vendidos} lotes / R$ ${brl(nav.vgv_total)} / com. ${brl(nav.comissao_assessoria)}`)
console.log(`-> ${navPatch.lotes_vendidos} lotes / R$ ${brl(navPatch.vgv_total)} / com. ${brl(navPatch.comissao_assessoria)}`)
for (const a of porAssessor) console.log(`      ${a.nome.padEnd(16)} R$ ${String(brl(a.vgv)).padStart(11)}  ${(a.comissao_pct * 100).toFixed(0)}% = R$ ${brl(a.comissao)}`)

/* ═══ B) APAGAR as duas duplicatas ════════════════════════════════════════ */
const APAGAR = [
    { data: '2026-08-20', like: '%PARANÃ E CASABRANCA%' },
    { data: '2026-08-21', like: '%JMP%' },
]
const paraApagar = []
for (const a of APAGAR) {
    const { data } = await sb.from('bula_leilao_fechamento').select('*').eq('data', a.data).ilike('nome', a.like)
    if ((data ?? []).length !== 1) { console.error(`ABORTA: ${a.like} casou ${data?.length ?? 0} fechamentos`); process.exit(1) }
    await semTitulos(data[0].id, data[0].nome)
    paraApagar.push(data[0])
}
console.log('\nB) apagar')
for (const f of paraApagar) console.log(`   ${f.data} ${f.nome} — R$ ${brl(f.vgv_total)} / com. ${brl(f.comissao_assessoria)}`)

/* ═══ C) CRIAR o Engenho da Serra ═════════════════════════════════════════ */
const LOTES_ENGENHO = [['41', 350], ['52', 380], ['59', 300], ['39', 310]]
const PARCELAS_ENGENHO = 40
const COMPRADOR = 'MARTA CARNEIRO DA SILVA · RANCHO ALTO BONITO/PA'
const lancesEng = LOTES_ENGENHO.map(([lote, parcela]) => ({
    lote, parcela, parcelas: PARCELAS_ENGENHO, vgv: parcela * PARCELAS_ENGENHO, animais: 1,
    assessor: 'DOUGLAS BISPO', empresa: 'Bula Assessoria', comprador: COMPRADOR,
}))
const vgvEng = r2(lancesEng.reduce((s, l) => s + l.vgv, 0))
const engenho = {
    nome: 'LEILÃO NELORE PINTADO ENGENHO DA SERRA', data: '2026-08-29', local: null,
    vgv_total: vgvEng, lotes_vendidos: lancesEng.length, animais_vendidos: 4,
    ticket_medio: r2(vgvEng / 4), maior_lance: r2(Math.max(...lancesEng.map(l => l.vgv))),
    compradores_unicos: 1, estados_alcancados: 1, lances: lancesEng,
    por_assessor: [{
        nome: 'DOUGLAS BISPO', vgv: vgvEng, animais: 4, empresa: 'Bula Assessoria', posicao: 1,
        transacoes: 4, comissao: r2(vgvEng * 0.02), comissao_pct: 0.02,
        ticket_medio: r2(vgvEng / 4), pct_total: 1,
    }],
    compradores: [{ comprador: 'MARTA CARNEIRO DA SILVA', fazenda: 'RANCHO ALTO BONITO', cidade: 'Novo Repartimento', uf: 'PA', vgv: vgvEng, lotes: 4, animais: 4, rank: 1 }],
    por_estado: [{ uf: 'PA', estado: 'PA', vgv: vgvEng, lotes: 4, animais: 4, pct_total: 1, ticket_medio: r2(vgvEng / 4) }],
    comissao_assessoria: r2(vgvEng * 0.02), origem: 'lances-auto',
    observacoes: 'Montado em 01/09/2026 a partir das fichas do grupo "Bula Assessoria l Assessor" (29/08 22h14 a 30/08 00h17), reencaminhadas por Marcelo no Grupo Financeiro em 01/09. NAO existe no HastaPro nem na agenda — origem lances-auto de proposito, para o importador do HastaPro substituir sozinho quando o leilao for lancado la. ATENCAO A PARCELA: este leilao e x40, nao x30 (350+380+300+310 = 1.340 x 40 = 53.600). O Marcelo anunciou "51.100 a mais de venda no mes" — a diferenca de R$ 2.500 segue em aberto e muda a comissao do Douglas em R$ 50.',
}
console.log('\nC) criar')
console.log(`   ${engenho.data} ${engenho.nome} — ${engenho.lotes_vendidos} lotes / R$ ${brl(engenho.vgv_total)} / com. ${brl(engenho.comissao_assessoria)}`)

const { data: jaEng } = await sb.from('bula_leilao_fechamento').select('id').eq('data', '2026-08-29').ilike('nome', '%ENGENHO%')
if ((jaEng ?? []).length) { console.error('ABORTA: ja existe fechamento do Engenho da Serra'); process.exit(1) }

/* ═══ aplica ══════════════════════════════════════════════════════════════ */
if (!APPLY) { console.log('\n(dry-run) use --apply para gravar'); process.exit(0) }

const up = await sb.from('bula_leilao_fechamento').update(navPatch).eq('id', nav.id)
if (up.error) { console.error('ERRO A:', up.error.message); process.exit(1) }
console.log('\nA) atualizado', nav.id)

for (const f of paraApagar) {
    const del = await sb.from('bula_leilao_fechamento').delete().eq('id', f.id)
    if (del.error) { console.error('ERRO B:', del.error.message); process.exit(1) }
    console.log('B) apagado', f.id, f.nome)
}

const ins = await sb.from('bula_leilao_fechamento').insert(engenho).select('id').single()
if (ins.error) { console.error('ERRO C:', ins.error.message); process.exit(1) }
console.log('C) criado', ins.data.id)
