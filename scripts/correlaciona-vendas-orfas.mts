/**
 * Resolve as vendas órfãs do grupo genérico de lances por CORRELAÇÃO EM
 * CASCATA, quando o nome do grupo não desambigua.
 *
 * O grupo "Lances Bula Assessoria" cobre vários leilões, então em dia com dois
 * pregões ele não diz de quem é a venda. Mas o dado nunca está ausente de
 * verdade — está espalhado. A cascata, do sinal mais forte para o mais fraco:
 *
 *   1. LOTE JÁ LANÇADO   — o lote aparece nos lances de um fechamento existente
 *                          (HastaPro/manual). É prova, não indício.
 *   2. FAIXA DO CATÁLOGO — o número do lote existe no catálogo de um leilão e
 *                          não no do outro (outputs/gif-lotes-<slug>/lotes.json).
 *   3. CATEGORIA         — o catálogo diz o sexo/tipo do lote e a venda também.
 *   4. EXCLUSÃO         — o outro leilão da data já está fechado e o lote não
 *                          consta nele; sobra um só candidato.
 *   5. JANELA DE PREGÃO — vendas capturadas em bloco pertencem ao mesmo pregão.
 *                          Em 21/08 o lote 48 entrou às 13h26 (BRT) e os lotes
 *                          18/19/24/29 entre 22h01 e 23h42 — e o catálogo do
 *                          Premium Colonial (que começa 20h) contém estes e não
 *                          contém o 48. Dois sinais independentes concordando.
 *   6. COMPRADOR/ASSESSOR— mesma dupla (assessor, comprador) de outra venda já
 *                          atribuída no mesmo dia.
 *
 * O que a cascata não resolve continua órfão. Chutar paga comissão ao leilão
 * errado, e isso é pior do que não lançar.
 *
 *   npx tsx scripts/correlaciona-vendas-orfas.mts          (dry-run)
 *   npx tsx scripts/correlaciona-vendas-orfas.mts --apply
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
const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const soNum = (s: unknown) => String(s ?? '').replace(/\D/g, '')
const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Palavras que aparecem em quase todo nome de leilao e nao identificam nada.
 * Sem esta lista, "LEILAO TOUROS FAZENDA SAO GERALDO" casava com "LEILAO
 * NELORE MAFRA" pela palavra "leilao" — e o Sao Geraldo era dado como ja
 * lancado quando nao era.
 */
const GENERICAS = new Set(['leilao', 'leiloes', 'virtual', 'edicao', 'etapa', 'mega', 'evento',
    'especial', 'nelore', 'femeas', 'touros', 'matrizes', 'fazenda', 'agropecuaria', 'premium'])
const distintivas = (nome: string) => semAcento(nome).toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 3 && !GENERICAS.has(w))
/** Dois nomes falam do mesmo evento se compartilham ao menos uma palavra distintiva. */
const mesmoEvento = (a: string, b: string) => {
    const tb = semAcento(b).toLowerCase()
    return distintivas(a).some(w => tb.includes(w))
}

/** Catálogos já parseados pelo pipeline de GIFs — a faixa de lotes de cada leilão. */
const CATALOGOS: { arquivo: string; casaCom: RegExp }[] = [
    { arquivo: 'outputs/gif-lotes-genetica-aditiva-2026-08-19/lotes.json', casaCom: /genetica adit/i },
    { arquivo: 'outputs/gif-lotes-santa-nice-2026-08-19/lotes.json', casaCom: /santa nice/i },
    { arquivo: 'outputs/gif-lotes-premium-colonial-2026-08/raw_lotes.json', casaCom: /premium colonial/i },
]
const lotesDoCatalogo = (arquivo: string): Set<string> => {
    try {
        const d = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
        const arr = Array.isArray(d) ? d : (d.lotes || Object.values(d)[0])
        return new Set(arr.map((x: Record<string, unknown>) => soNum(x.lote)).filter(Boolean))
    } catch { return new Set() }
}
const catalogos = CATALOGOS.map(c => ({ ...c, lotes: lotesDoCatalogo(c.arquivo) }))

// ── dados ───────────────────────────────────────────────────────────────────
const { data: orfas } = await sb.from('bula_leilao_vendas')
    .select('id, leilao_data, lote, valor, sexo, comprador, assessor, raw_text, created_at')
    .is('cronograma_id', null).not('leilao_data', 'is', null).order('created_at')
if (!orfas?.length) { console.log('nenhuma venda orfa.'); process.exit(0) }

const datas = [...new Set(orfas.map(v => String(v.leilao_data).slice(0, 10)))]
const { data: crons } = await sb.from('cronograma_leiloes').select('id, nome, data').in('data', datas)
const { data: fechs } = await sb.from('bula_leilao_fechamento').select('id, nome, data, lances').in('data', datas)
const { data: jaAtribuidas } = await sb.from('bula_leilao_vendas')
    .select('leilao_data, lote, comprador, assessor, cronograma_id')
    .not('cronograma_id', 'is', null).in('leilao_data', datas)

type Decisao = { venda: typeof orfas[number]; cronId: string | null; cronNome: string; evidencia: string }
const decisoes: Decisao[] = []

for (const v of orfas) {
    const d = String(v.leilao_data).slice(0, 10)
    const candidatos = (crons ?? []).filter(c => String(c.data).slice(0, 10) === d)
    const loteNum = soNum(v.lote)
    let dec: Decisao | null = null

    // 1. o lote já está lançado nos lances de um fechamento da data
    for (const f of (fechs ?? []).filter(x => String(x.data).slice(0, 10) === d)) {
        const lotes = new Set(((f.lances ?? []) as { lote?: unknown }[]).map(l => soNum(l.lote)))
        if (!loteNum || !lotes.has(loteNum)) continue
        const alvo = candidatos.find(c => mesmoEvento(c.nome, f.nome))
        if (alvo) { dec = { venda: v, cronId: alvo.id, cronNome: alvo.nome, evidencia: `lote ${v.lote} ja consta nos lances de "${f.nome.slice(0, 34)}"` } }
        break
    }

    // 2. faixa do catálogo — existe num, não existe no outro
    if (!dec && loteNum) {
        const comLote = catalogos.filter(c => c.lotes.size && c.lotes.has(loteNum))
        const semLote = catalogos.filter(c => c.lotes.size && !c.lotes.has(loteNum))
        const candComLote = candidatos.filter(c => comLote.some(k => k.casaCom.test(semAcento(c.nome))))
        const candSemLote = candidatos.filter(c => semLote.some(k => k.casaCom.test(semAcento(c.nome))))
        if (candComLote.length === 1 && candSemLote.length >= 1) {
            dec = { venda: v, cronId: candComLote[0].id, cronNome: candComLote[0].nome, evidencia: `lote ${v.lote} esta no catalogo deste leilao e nao no do outro` }
        } else if (!candComLote.length && candSemLote.length === 1 && candidatos.length === 2) {
            const outro = candidatos.find(c => c.id !== candSemLote[0].id)!
            dec = { venda: v, cronId: outro.id, cronNome: outro.nome, evidencia: `lote ${v.lote} nao existe no catalogo de "${candSemLote[0].nome.slice(0, 26)}"` }
        }
    }

    // 4. exclusão: o outro leilão da data já está fechado e não tem este lote
    if (!dec && loteNum && candidatos.length === 2) {
        const fechadosDaData = (fechs ?? []).filter(x => String(x.data).slice(0, 10) === d)
        for (const f of fechadosDaData) {
            const lotes = new Set(((f.lances ?? []) as { lote?: unknown }[]).map(l => soNum(l.lote)))
            if (!lotes.size || lotes.has(loteNum)) continue
            const dono = candidatos.find(c => mesmoEvento(c.nome, f.nome))
            if (!dono) continue
            const outro = candidatos.find(c => c.id !== dono.id)
            if (outro) {
                dec = {
                    venda: v, cronId: outro.id, cronNome: outro.nome,
                    evidencia: `"${dono.nome.slice(0, 26)}" ja esta fechado e nao tem o lote ${v.lote} — sobra este`,
                }
            }
            break
        }
    }

    // 5. janela de pregão: vendas capturadas em bloco são do mesmo leilão
    if (!dec && candidatos.length === 2) {
        const doDia = decisoes.filter(x => String(x.venda.leilao_data).slice(0, 10) === d && x.cronId)
        const t = (x: { created_at?: unknown }) => new Date(String(x.created_at ?? '')).getTime()
        const meu = t(v as { created_at?: unknown })
        if (Number.isFinite(meu) && doDia.length) {
            const JANELA = 4 * 3600 * 1000
            const mesmoBloco = doDia.filter(x => Math.abs(t(x.venda as { created_at?: unknown }) - meu) <= JANELA)
            const ids = [...new Set(mesmoBloco.map(x => x.cronId))]
            if (ids.length === 1) {
                const alvo = candidatos.find(c => c.id === ids[0])!
                dec = { venda: v, cronId: alvo.id, cronNome: alvo.nome, evidencia: 'capturada na mesma janela de pregao de vendas ja atribuidas' }
            } else if (!mesmoBloco.length) {
                // Bloco separado de tudo que já foi atribuído: é o outro pregão do dia.
                const usados = [...new Set(doDia.map(x => x.cronId))]
                const livres = candidatos.filter(c => !usados.includes(c.id))
                if (livres.length === 1) {
                    dec = { venda: v, cronId: livres[0].id, cronNome: livres[0].nome, evidencia: 'bloco de horario separado do outro pregao do dia' }
                }
            }
        }
    }

    // 6. mesma dupla (assessor, comprador) de outra venda já atribuída no dia
    if (!dec && (v.comprador || v.assessor)) {
        const chave = (x: { comprador?: unknown; assessor?: unknown }) =>
            `${String(x.comprador ?? '').slice(0, 14).toLowerCase()}|${String(x.assessor ?? '').slice(0, 14).toLowerCase()}`
        const iguais = (jaAtribuidas ?? []).filter(x =>
            String(x.leilao_data).slice(0, 10) === d && chave(x) === chave(v) && chave(v).replace('|', ''))
        const ids = [...new Set(iguais.map(x => x.cronograma_id))]
        if (ids.length === 1) {
            const alvo = candidatos.find(c => c.id === ids[0])
            if (alvo) dec = { venda: v, cronId: alvo.id, cronNome: alvo.nome, evidencia: `mesmo comprador/assessor de outra venda ja atribuida no dia` }
        }
    }

    decisoes.push(dec ?? { venda: v, cronId: null, cronNome: '—', evidencia: 'sem sinal suficiente' })
}

// ── relatório ───────────────────────────────────────────────────────────────
console.log(`vendas orfas: ${decisoes.length}\n`)
for (const d of decisoes) {
    const marca = d.cronId ? '  OK ' : '  ?? '
    console.log(`${marca}${String(d.venda.leilao_data).slice(0, 10)} lote ${String(d.venda.lote).padEnd(9)} ` +
        `R$ ${String(brl(d.venda.valor)).padStart(9)}  ->  ${d.cronNome.slice(0, 38)}`)
    console.log(`        ${d.evidencia}`)
}
const ok = decisoes.filter(d => d.cronId)
console.log(`\nresolvidas: ${ok.length}/${decisoes.length}`)

if (!APPLY) { console.log('\n(dry-run) use --apply para gravar'); process.exit(0) }

for (const d of ok) {
    const { error } = await sb.from('bula_leilao_vendas').update({ cronograma_id: d.cronId }).eq('id', d.venda.id)
    if (error) console.error('  ERRO', d.venda.id, error.message)
}
console.log(`\nassociadas: ${ok.length}`)

// ── fechamento só onde ainda não existe (checagem por DATA, não por nome) ────
console.log('\nfechamentos:')
const porCron = new Map<string, string>()
for (const d of ok) porCron.set(d.cronId!, d.cronNome)
for (const [id, nome] of porCron) {
    const { data: cron } = await sb.from('cronograma_leiloes').select('data').eq('id', id).maybeSingle()
    const dataLeilao = String(cron?.data || '').slice(0, 10)
    const { data: jaExiste } = await sb.from('bula_leilao_fechamento').select('id, nome').eq('data', dataLeilao)
    const meu = (jaExiste ?? []).find(f => mesmoEvento(nome, f.nome))
    if (meu) { console.log(`  ${nome.slice(0, 40)}: ja lancado como "${meu.nome.slice(0, 40)}" — nao reconstruido`); continue }
    const r = await rebuildFechamentoFromLances(sb, id)
    console.log(`  ${nome.slice(0, 40)}: ${JSON.stringify(r)}`)
}
