/**
 * Monta o fechamento de um leilão a partir do HastaPro, INCLUSIVE de outra
 * filial que não a '2'.
 *
 * A premissa "FIL 2 é a cobertura Bula" vale para os leilões que a Bula
 * assessora como terceiro. Mas quando quem conduz o pregão é a própria BULA
 * REMATES (filial '01'), o leilão inteiro fica lá — e a cobertura da Bula
 * Assessoria dentro dele são os lotes cujo PISTEIRO é da equipe. Foi assim que
 * o "LEILÃO VIRTUAL NELORE KRIZ REPRODUTORES" de 07/07 ficou fora do ERP: não
 * estava na filial 2, e ninguém olhava a 01.
 *
 * O leilão perdido custou caro: a comissão do Douglas de julho fechou R$ 1.602
 * a menos, e a diferença só apareceu quando ele reclamou.
 *
 * A equipe é reconhecida por `erp_folha_estrutura` (nome + apelidos), não por
 * lista fixa no código — assessor novo entra sozinho.
 *
 * REGRA DO BULINHA: Felipe Vilela Andrade recebe 2% normalmente, mas 0% quando
 * a leiloeira é a Bula Remates — que é exatamente este caso.
 *
 *   npx tsx scripts/importa-fechamento-hastapro.mts <FIL> <TRECHO_DO_NOME> <ANO-MES>
 *   npx tsx scripts/importa-fechamento-hastapro.mts 01 KRIZ 2026-07 --apply
 */
import fs from 'node:fs'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
}

const [FIL, TRECHO, COMPET] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const APPLY = process.argv.includes('--apply')
/**
 * Reescreve um fechamento que ja veio deste mesmo importador. Existe porque o
 * join de compradores multiplicava lote de cota e o VGV precisou ser refeito na
 * fonte — nao para reimportar por cima de fechamento conferido a mao.
 */
const REFAZER = process.argv.includes('--refazer')
if (!FIL || !TRECHO || !COMPET) {
    console.error('uso: npx tsx scripts/importa-fechamento-hastapro.mts <FIL> <TRECHO_NOME> <AAAA-MM> [--apply]')
    process.exit(1)
}
const de = `${COMPET}-01`
const ate = new Date(Number(COMPET.slice(0, 4)), Number(COMPET.slice(5, 7)), 0).toISOString().slice(0, 10)

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const fbOpts = {
    host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT!,
    database: process.env.HASTAPRO_DATABASE, user: process.env.HASTAPRO_USER,
    password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true,
}
const txt = (v: unknown) => (Buffer.isBuffer(v) ? v.toString('latin1') : v)
const norm = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, txt(v)]))
const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100
const chave = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// ── quem é da equipe Bula (folha do ERP, com apelidos) ──────────────────────
const { data: folha } = await sb.from('erp_folha_estrutura')
    .select('nome, apelidos, pagamento_nome, comissao_pct, ativo')
type Membro = { nome: string; pct: number; tokens: string[] }
/**
 * PISTEIRO é quem tem comissão na folha. Administrativo (João Eduardo, Luana,
 * Pedro…) não vai a pista e não pode reivindicar lote — foi exatamente por
 * incluí-los que "PEDRO PEREIRA JUNIOR", pisteiro de terceiro, virou "equipe
 * Bula" e trouxe R$ 4 milhões de VGV que não são nossos.
 */
const equipe: Membro[] = (folha ?? [])
    .filter(f => Number(f.comissao_pct || 0) > 0)
    .map(f => ({
        nome: String(f.nome),
        pct: Number(f.comissao_pct || 0),
        tokens: [f.nome, f.pagamento_nome, ...((f.apelidos as string[] | null) ?? [])]
            .filter(Boolean).map(n => chave(n)).filter(Boolean),
    }))
/**
 * Casa o nome do pisteiro do HastaPro com alguém da folha.
 *
 * A versão ingênua (substring) errava dos dois lados: "PEDRO PEREIRA JUNIOR"
 * casava com o funcionário "PEDRO" — que nem comissão tem —, e "Fabio de Omena
 * Gaia" NÃO casava com "Fábio Omena" porque o "de" no meio quebrava a
 * comparação posicional. Num universo de R$ 60 milhões, cada erro desses vale
 * milhões.
 *
 * Regra: apelido de uma palavra só exige nome idêntico. Com duas ou mais,
 * exige o primeiro nome igual E ao menos um sobrenome em comum — o que tolera
 * partículas ("de", "da") e nomes do meio.
 */
/**
 * QUEM, NUM PREGAO DA BULA REMATES, ESTA NA PISTA PELA REMATES.
 *
 * Num leilao conduzido pela propria Bula Remates (filial '01') a pista tem
 * gente das DUAS empresas. "Estar na folha da Bula" nao basta para o lote ser
 * cobertura da Assessoria — foi o que inflou o Sao Geraldo de 01/08 para
 * R$ 1.830.400 quando a venda da Assessoria ali e R$ 375.800 (decisao do Joao
 * em 26/08/2026, conferida contra o M1).
 *
 * A lista e explicita de proposito. O discriminador obvio seria o `ativo` da
 * folha — e ele ate acerta este caso por acidente — mas `ativo` fala de folha
 * de pagamento, nao de por quem a pessoa trabalhou no pregao: a Peralta e a
 * Laila estao com ativo=false e mesmo assim venderam pela Bula em agosto (CEN,
 * Marcondes, Camparino). Usar `ativo` daria o numero certo hoje e o errado no
 * dia em que alguem mexer no cadastro.
 *
 * PARA MUDAR: uma linha aqui, e rode
 * `npx tsx scripts/importa-fechamento-hastapro.mts 01 <TRECHO> <AAAA-MM> --refazer --apply`
 * nos leiloes da filial 01 afetados.
 */
const PISTA_DA_REMATES = [
    'BULINHA (FELIPE ANDRADE)',  // dono da Bula Remates
    'PERALTA',
    'LUCAS MARTINS',
    'LAILA',
]
const naPistaPelaRemates = (nomeDoMembro: string) =>
    PISTA_DA_REMATES.some(n => chave(n) === chave(nomeDoMembro))

function achaMembro(nomePisteiro: string): Membro | null {
    const alvo = chave(nomePisteiro)
    if (!alvo) return null
    const PARTICULAS = new Set(['de', 'da', 'do', 'dos', 'das', 'e'])
    const partes = (s: string) => s.split(' ').filter(w => w && !PARTICULAS.has(w))
    const pa = partes(alvo)
    for (const m of equipe) {
        for (const t of m.tokens) {
            if (!t) continue
            if (alvo === t) return m
            const pt = partes(t)
            // Apelido de uma palavra ("Peralta", "Laila") vale se aparecer em
            // qualquer posição — só chega aqui quem recebe comissão, então o
            // risco de colidir com um homônimo de terceiro é pequeno.
            if (pt.length === 1) { if (pa.includes(pt[0])) return m; continue }
            if (pa.length < 2 || pa[0] !== pt[0]) continue
            const sobrenomes = new Set(pa.slice(1))
            if (pt.slice(1).some(w => sobrenomes.has(w))) return m
        }
    }
    return null
}

// ── HastaPro ────────────────────────────────────────────────────────────────
const db = await new Promise<any>((res, rej) => Firebird.attach(fbOpts, (e: unknown, d: unknown) => e ? rej(e) : res(d)))
const q = (sql: string) => new Promise<Record<string, any>[]>((res, rej) =>
    db.query(sql, [], (e: unknown, r: Record<string, unknown>[]) => e ? rej(e) : res(r.map(norm) as Record<string, any>[])))

try {
    const leiloes = await q(`select FIL_CODIGO fil, LEI_CODIGO cod, LEI_NOME nome, LEI_DATA data, LEI_LOCAL leilocal, LEI_UF uf
        from LEILAO where FIL_CODIGO='${FIL}' and upper(LEI_NOME) like '%${TRECHO.toUpperCase()}%'
          and LEI_DATA between '${de}' and '${ate}'`)
    if (!leiloes.length) { console.error('nenhum leilao encontrado'); process.exit(1) }
    if (leiloes.length > 1) {
        console.error('mais de um leilao casou — refine o trecho:')
        for (const l of leiloes) console.error('   ' + String(l.data).slice(4, 15) + '  ' + String(l.nome).trim())
        process.exit(1)
    }
    const lei = leiloes[0]
    const dataISO = new Date(String(lei.data)).toISOString().slice(0, 10)
    console.log(`LEILAO: [fil ${String(lei.fil).trim()}] ${String(lei.nome).trim()}  ${dataISO}`)

    const lotes = await q(`select lo.LOT_LOTE lote, lo.LOT_QTD qtd, lo.LOT_TOTAL total, lo.LOT_LANCE lance,
            lo.LOT_PARCELAS parcelas, p.CLI_NOME pisteiro, c.CLI_NOME comprador, c.CLI_UF uf, f.FAZ_NOME fazenda
        from LOTES lo
        left join CLIENTES p on p.CLI_CODIGO = lo.LOT_PISTEIRO
        left join COMPRADORES co on co.FIL_CODIGO=lo.FIL_CODIGO and co.LEI_CODIGO=lo.LEI_CODIGO and co.LOT_LOTE=lo.LOT_LOTE
        left join CLIENTES c on c.CLI_CODIGO = co.CLI_CODIGO
        left join FAZENDAS f on f.FAZ_CODIGO = co.FAZ_CODIGO
        where lo.FIL_CODIGO='${lei.fil}' and lo.LEI_CODIGO='${lei.cod}'
        order by lo.LOT_LOTE`)

    // ── quais lotes são cobertura da Bula Assessoria ────────────────────────
    //
    // Na FILIAL 2 o leilao inteiro ja e cobertura da Assessoria — e a premissa
    // do cadastro. Filtrar por pisteiro ali descartaria lote legitimo cujo
    // pisteiro esta grafado diferente ou em branco.
    //
    // Na filial 01 (Bula Remates) o pregao e da leiloeira e so os lotes com
    // pisteiro da equipe sao nossos.
    const filialEhCoberturaInteira = String(lei.fil).trim() === '2'
    const daBula = lotes
        .map(l => ({ ...l, membro: achaMembro(String(l.pisteiro || '')) }))
        .filter(l => filialEhCoberturaInteira || (l.membro && !naPistaPelaRemates(l.membro.nome)))
    // Contar LINHAS aqui repete o mesmo erro do join: o Sao Geraldo tem 137
    // lotes no HastaPro e a observacao do fechamento dizia 145.
    const lotesDistintos = (xs: typeof lotes) => new Set(xs.map(x => String(x.lote).trim())).size
    const totalDeLotes = lotesDistintos(lotes)
    const cobertosPelaBula = lotesDistintos(daBula)
    const foraDaBula = totalDeLotes - cobertosPelaBula
    if (!daBula.length) { console.error('nenhum lote de cobertura da Bula'); process.exit(1) }

    // Bulinha não recebe comissão quando a leiloeira é a Bula Remates.
    const leiloeiraEhBulaRemates = String(lei.fil).trim() === '01'
    const ehBulinha = (nome: string) => /bulinha|felipe.*andrade/i.test(nome)

    // UM LOTE E UM LOTE, MESMO VENDIDO EM COTAS.
    //
    // `LOTES` tem uma linha por lote e `LOT_TOTAL` e o valor do lote inteiro.
    // `COMPRADORES` tem uma linha por COMPRADOR — e touro de central e vendido
    // em fracoes: o lote 2000 do Sao Geraldo tem 4 donos. O left join devolve
    // entao 4 linhas carregando os mesmos R$ 224.000, e somar as linhas conta o
    // mesmo touro quatro vezes. Foi assim que aquele leilao virou R$ 3,25 mi
    // quando a cobertura real e R$ 1,83 mi — R$ 1.422.000 de VGV que nunca
    // existiram, e comissao calculada em cima deles.
    //
    // Aqui as linhas voltam a ser um lote, e os compradores da cota entram
    // todos no mesmo registro, que e o que eles sao: donos do mesmo animal.
    const porLote = new Map<string, typeof daBula>()
    for (const l of daBula) {
        const k = String(l.lote).trim()
        porLote.set(k, [...(porLote.get(k) ?? []), l])
    }
    const lances = [...porLote.values()].map(linhas => {
        const l = linhas[0]
        const donos = [...new Set(linhas
            .map(x => [String(x.comprador || '').trim(), String(x.fazenda || '').trim()].filter(Boolean).join(' · '))
            .filter(Boolean))]
        return {
            lote: String(l.lote).trim(),
            vgv: r2(Number(l.total || 0)),
            animais: Number(l.qtd || 1),
            parcela: Number(l.lance || 0),
            parcelas: Number(String(l.parcelas || '').replace(/\D/g, '')) || null,
            assessor: l.membro?.nome ?? '(a definir)',
            empresa: 'Bula Assessoria',
            comprador: donos.join(' + ') || null,
            // Cota: quantos donos dividem o animal. Fica registrado para o
            // fechamento poder explicar por que ha varios nomes num lote so.
            cotas: donos.length > 1 ? donos.length : undefined,
        }
    })
    const vgvTotal = r2(lances.reduce((s, x) => s + x.vgv, 0))
    const animais = lances.reduce((s, x) => s + x.animais, 0)

    const porAssessor = [...new Map(lances.map(x => [x.assessor, x.assessor])).keys()].map(nome => {
        const meus = lances.filter(x => x.assessor === nome)
        const vgv = r2(meus.reduce((s, x) => s + x.vgv, 0))
        const membro = equipe.find(m => m.nome === nome)
        // Lote sem pisteiro identificado nao gera comissao automatica: melhor
        // ficar visivel como "(a definir)" do que atribuir a alguem por engano.
        const pct = !membro ? 0 : (leiloeiraEhBulaRemates && ehBulinha(nome) ? 0 : membro.pct / 100)
        return {
            nome, vgv, animais: meus.reduce((s, x) => s + x.animais, 0),
            transacoes: meus.length, empresa: 'Bula Assessoria',
            comissao: r2(vgv * pct), comissao_pct: pct,
            ticket_medio: r2(vgv / meus.length),
            pct_total: vgvTotal ? Number((vgv / vgvTotal).toFixed(6)) : 0,
        }
    }).sort((a, b) => b.vgv - a.vgv).map((a, i) => ({ ...a, posicao: i + 1 }))

    const porComprador = [...new Map(lances.map(x => [x.comprador || '(sem comprador)', x.comprador || '(sem comprador)'])).keys()]
        .map(c => {
            const meus = lances.filter(x => (x.comprador || '(sem comprador)') === c)
            const orig = daBula.find(l => [String(l.comprador || '').trim(), String(l.fazenda || '').trim()].filter(Boolean).join(' · ') === c)
            return {
                comprador: String(orig?.comprador || c).trim(), fazenda: String(orig?.fazenda || '').trim() || null,
                uf: String(orig?.uf || '').trim() || null, cidade: null,
                vgv: r2(meus.reduce((s, x) => s + x.vgv, 0)),
                lotes: meus.length, animais: meus.reduce((s, x) => s + x.animais, 0),
            }
        }).sort((a, b) => b.vgv - a.vgv).map((c, i) => ({ ...c, rank: i + 1 }))

    const porEstado = [...new Set(porComprador.map(c => c.uf).filter(Boolean))].map(uf => {
        const meus = porComprador.filter(c => c.uf === uf)
        const vgv = r2(meus.reduce((s, c) => s + c.vgv, 0))
        const lotesN = meus.reduce((s, c) => s + c.lotes, 0)
        return {
            uf, estado: uf, vgv, lotes: lotesN,
            animais: meus.reduce((s, c) => s + c.animais, 0),
            pct_total: vgvTotal ? Number((vgv / vgvTotal).toFixed(6)) : 0,
            ticket_medio: lotesN ? r2(vgv / lotesN) : 0,
        }
    }).sort((a, b) => b.vgv - a.vgv)

    const comissao = r2(porAssessor.reduce((s, a) => s + a.comissao, 0))

    console.log(`\nlotes no leilao: ${totalDeLotes}  |  cobertos pela Bula: ${cobertosPelaBula}  |  de terceiros: ${foraDaBula}`)
    console.log(`VGV coberto: R$ ${brl(vgvTotal)}   animais: ${animais}`)
    console.log('\npor assessor:')
    for (const a of porAssessor)
        console.log(`   ${a.nome.padEnd(26)} ${String(a.transacoes).padStart(2)} lotes  R$ ${String(brl(a.vgv)).padStart(12)}` +
            `  com. ${(a.comissao_pct * 100).toFixed(2)}% = R$ ${brl(a.comissao)}` +
            (a.comissao_pct === 0 ? '   (Bulinha nao recebe em leilao da Bula Remates)' : ''))
    console.log(`   ${'TOTAL COMISSAO'.padEnd(26)} ${' '.repeat(24)}R$ ${brl(comissao)}`)

    const { data: jaTem } = await sb.from('bula_leilao_fechamento')
        .select('id, nome, origem, vgv_total, lotes_vendidos').eq('data', dataISO)
    const dup = (jaTem ?? []).find(f => chave(f.nome).includes(chave(TRECHO)) || chave(TRECHO).includes(chave(f.nome)))
    // Fechamento montado a partir dos lances do grupo e provisorio: o parser so
    // ve o que alguem digitou no WhatsApp e subavalia lote com varios animais.
    // Quando o HastaPro tem o mesmo leilao, ele SUBSTITUI o provisorio.
    const substituivel = dup && dup.origem === 'lances-auto'
    const refazivel = !!dup && dup.origem === 'hastapro' && REFAZER
    if (dup && !substituivel && !refazivel) {
        console.log(`
JA EXISTE fechamento "${dup.nome}" em ${dataISO} — nada a fazer.` +
            (dup.origem === 'hastapro' ? ' Use --refazer para reescrever a partir do HastaPro.' : ''))
        process.exit(0)
    }
    if (refazivel) {
        console.log(`
REFAZ "${dup!.nome}": ${dup!.lotes_vendidos} lotes / R$ ${brl(dup!.vgv_total)}` +
            ` -> ${lances.length} lotes / R$ ${brl(vgvTotal)}`)
    }
    if (substituivel) {
        console.log(`\nSUBSTITUI o fechamento provisorio dos lances: "${dup!.nome}" ` +
            `(${dup!.lotes_vendidos} lotes, R$ ${brl(dup!.vgv_total)}) -> HastaPro (${lances.length} lotes, R$ ${brl(vgvTotal)})`)
    }

    if (!APPLY) { console.log('\n(dry-run) use --apply para gravar'); process.exit(0) }

    if (substituivel) {
        const { error } = await sb.from('bula_leilao_fechamento').delete().eq('id', dup!.id)
        if (error) { console.error('ERRO ao remover o provisorio:', error.message); process.exit(1) }
    }

    const registro = {
        nome: String(lei.nome).trim(), data: dataISO, local: String(lei.leilocal || '').trim() || null,
        vgv_total: vgvTotal, lotes_vendidos: lances.length, animais_vendidos: animais,
        ticket_medio: r2(vgvTotal / lances.length),
        maior_lance: r2(Math.max(...lances.map(x => x.vgv))),
        compradores_unicos: porComprador.length, estados_alcancados: porEstado.length,
        lances, por_assessor: porAssessor, compradores: porComprador, por_estado: porEstado,
        comissao_assessoria: comissao, origem: 'hastapro',
        observacoes: `Importado do HastaPro filial ${String(lei.fil).trim()} (${leiloeiraEhBulaRemates ? 'BULA REMATES' : 'terceiro'}) por ` +
            `scripts/importa-fechamento-hastapro.mts. O leilao inteiro tem ${totalDeLotes} lotes; ` +
            `${cobertosPelaBula} foram cobertos por pisteiro da equipe Bula e ${foraDaBula} por terceiros — ` +
            `o VGV aqui e a COBERTURA BULA, nao o faturamento do pregao.` +
            (leiloeiraEhBulaRemates ? ' Bulinha com 0% por ser leilao da Bula Remates.' : ''),
    }

    if (refazivel) {
        const { error } = await sb.from('bula_leilao_fechamento').update(registro).eq('id', dup!.id)
        if (error) { console.error('ERRO:', error.message); process.exit(1) }
        console.log(`
fechamento refeito: ${dup!.id}`)
        process.exit(0)
    }

    const { data: criado, error } = await sb.from('bula_leilao_fechamento').insert(registro).select('id').single()
    if (error) { console.error('ERRO:', error.message); process.exit(1) }
    console.log(`
fechamento criado: ${criado!.id}`)
} finally {
    db.detach()
}
