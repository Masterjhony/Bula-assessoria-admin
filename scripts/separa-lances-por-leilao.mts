/**
 * Tira do fechamento provisório (lances do grupo) os lotes que o HastaPro
 * atribui a OUTRO leilão do mesmo dia.
 *
 * "Quando tem leilões no mesmo dia, Lances do Pregão não divide por leilão, faz
 * total de vendas do dia." O parser do grupo captura o arremate mas não sabe de
 * qual pregão ele é, então tudo cai no primeiro leilão daquela data. O HastaPro
 * sabe — ele tem o lote amarrado ao leilão certo.
 *
 * Aqui o HastaPro manda: lote que já está num fechamento `hastapro` sai do
 * fechamento `lances-auto` do mesmo dia, e o provisório é recalculado. Se
 * sobrar vazio, ele é removido (era só a soma do dia).
 *
 * IDENTIDADE DO LOTE = (número, valor). O número sozinho não identifica nada —
 * todo leilão tem lote 1, 2, 3 — e comparar só por ele daria "duplicado" para
 * o 28º Naviraí Camparino (R$ 948 mil) contra o Marcondes (R$ 37,5 mil) porque
 * ambos têm um lote "01".
 *
 *   npx tsx scripts/separa-lances-por-leilao.mts           (dry-run)
 *   npx tsx scripts/separa-lances-por-leilao.mts --apply
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
const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100
type Lance = { lote?: unknown; vgv?: number; animais?: number; assessor?: string; comprador?: string | null }
const idLote = (l: Lance) => String(l.lote ?? '').replace(/\D/g, '') + '|' + Math.round(Number(l.vgv || 0) * 100)

const { data: fechs } = await sb.from('bula_leilao_fechamento')
    .select('id, nome, data, vgv_total, lotes_vendidos, animais_vendidos, comissao_assessoria, origem, lances, por_assessor')
    .gte('data', '2026-01-01')

const porData = new Map<string, typeof fechs>()
for (const f of fechs ?? []) {
    const d = String(f.data).slice(0, 10)
    porData.set(d, [...(porData.get(d) ?? []), f] as typeof fechs)
}

type Plano = { alvo: NonNullable<typeof fechs>[number]; dono: string; fica: Lance[]; sai: Lance[] }
const planos: Plano[] = []

for (const [, doDia] of porData) {
    if ((doDia ?? []).length < 2) continue
    const hp = (doDia ?? []).filter(f => f.origem === 'hastapro')
    if (!hp.length) continue
    const donoDoLote = new Map<string, string>()
    for (const h of hp) for (const l of (h.lances ?? []) as Lance[]) donoDoLote.set(idLote(l), h.nome)

    for (const prov of (doDia ?? []).filter(f => f.origem === 'lances-auto')) {
        const lances = (prov.lances ?? []) as Lance[]
        const sai = lances.filter(l => donoDoLote.has(idLote(l)))
        if (!sai.length) continue
        planos.push({
            alvo: prov, dono: donoDoLote.get(idLote(sai[0]))!,
            fica: lances.filter(l => !donoDoLote.has(idLote(l))), sai,
        })
    }
}

console.log(`FECHAMENTOS PROVISORIOS COM LOTE DE OUTRO LEILAO: ${planos.length}\n`)
for (const p of planos) {
    const vgvSai = r2(p.sai.reduce((s, l) => s + Number(l.vgv || 0), 0))
    const vgvFica = r2(p.fica.reduce((s, l) => s + Number(l.vgv || 0), 0))
    console.log(`  ${String(p.alvo.data).slice(0, 10)}  "${p.alvo.nome.slice(0, 44)}"`)
    console.log(`     ${p.sai.length} lote(s) (R$ ${brl(vgvSai)}) pertencem a "${p.dono.slice(0, 40)}"`)
    console.log(p.fica.length
        ? `     fica com ${p.fica.length} lote(s), R$ ${brl(vgvFica)} (era ${p.alvo.lotes_vendidos}, R$ ${brl(p.alvo.vgv_total)})`
        : `     fica VAZIO — era so a soma do dia, sera removido`)
}

if (!APPLY) { console.log('\n(dry-run) use --apply para gravar'); process.exit(0) }

for (const p of planos) {
    if (!p.fica.length) {
        const { error } = await sb.from('bula_leilao_fechamento').delete().eq('id', p.alvo.id)
        console.log(error ? `  ERRO: ${error.message}` : `  removido: ${p.alvo.nome.slice(0, 46)}`)
        continue
    }
    // Recalcula o que depende dos lances, para os agregados continuarem sendo a
    // soma das partes (é o que a auditoria de coerência verifica).
    const vgv = r2(p.fica.reduce((s, l) => s + Number(l.vgv || 0), 0))
    const animais = p.fica.reduce((s, l) => s + Number(l.animais || 0), 0)
    const antigos = (p.alvo.por_assessor ?? []) as { nome?: string; comissao_pct?: number }[]
    const pctDe = (nome: string) => Number(antigos.find(a => a.nome === nome)?.comissao_pct ?? 0)
    const nomes = [...new Set(p.fica.map(l => String(l.assessor ?? '(a definir)')))]
    const porAssessor = nomes.map(nome => {
        const meus = p.fica.filter(l => String(l.assessor ?? '(a definir)') === nome)
        const v = r2(meus.reduce((s, l) => s + Number(l.vgv || 0), 0))
        const pct = pctDe(nome)
        return {
            nome, vgv: v, animais: meus.reduce((s, l) => s + Number(l.animais || 0), 0),
            transacoes: meus.length, empresa: 'Bula Assessoria',
            comissao: r2(v * pct), comissao_pct: pct,
            ticket_medio: r2(v / meus.length),
            pct_total: vgv ? Number((v / vgv).toFixed(6)) : 0,
        }
    }).sort((a, b) => b.vgv - a.vgv).map((a, i) => ({ ...a, posicao: i + 1 }))

    const { error } = await sb.from('bula_leilao_fechamento').update({
        lances: p.fica, vgv_total: vgv, lotes_vendidos: p.fica.length, animais_vendidos: animais,
        por_assessor: porAssessor,
        comissao_assessoria: r2(porAssessor.reduce((s, a) => s + a.comissao, 0)),
        ticket_medio: r2(vgv / p.fica.length),
        observacoes: `${String((p.alvo as { observacoes?: string }).observacoes ?? '').trim()} ` +
            `[LANCES SEPARADOS] ${p.sai.length} lote(s) saiu/sairam para "${p.dono}" conforme o HastaPro — ` +
            `o parser do grupo nao divide por leilao quando ha dois pregoes no mesmo dia.`.trim(),
    }).eq('id', p.alvo.id)
    console.log(error ? `  ERRO: ${error.message}` : `  ajustado: ${p.alvo.nome.slice(0, 40)} -> ${p.fica.length} lotes, R$ ${brl(vgv)}`)
}
