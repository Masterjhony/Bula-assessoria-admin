/**
 * NÚCLEO DO FUNIL POR CAMPANHA (2026) — um funil por campanha, apurado fonte a fonte.
 *
 * Este módulo NÃO decide nada sozinho: ele carrega as fontes, atribui cada lead
 * à campanha por CAMADAS DE PROVA (da mais forte para a mais fraca) e devolve o
 * porquê de cada atribuição, para que qualquer número do painel possa ser
 * cobrado linha a linha.
 *
 * ORDEM DAS CAMADAS (a primeira que resolver, vence — e a divergência entre
 * camadas é registrada, nunca engolida):
 *   1. ad-id / ad_id  → anúncio → conjunto → campanha   (prova direta, Meta)
 *   2. campaign_id    → campanha                        (prova direta, Meta)
 *   3. adset_id       → conjunto → campanha             (prova direta, Meta)
 *   4. utm_medium     → nome exato de campanha          (padrão das landings)
 *   5. campaign_name  → nome exato de campanha
 *   6. Origem "Meta — X" → nome exato de campanha
 *   7. utm_campaign / campaign_name → nome de CONJUNTO, e só quando esse nome
 *      existe em UMA campanha só. Nome de conjunto repetido em duas campanhas
 *      (é o caso de "CA -LEADS - PERPETUO", "CA -LEADS -EAO TOUROS/FEMEA" e
 *      "CA - LEILAO JMP TOUROS/FEMEAS") NÃO atribui — vira 'ambiguo'.
 *   8. utm_campaign que é um ID de conjunto → campanha
 *
 * O que sobra sem prova nenhuma fica como 'sem-campanha' e é reportado à parte.
 * Nada é distribuído por rateio: lead sem prova não vira número de campanha.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const F = path.join(ROOT, 'outputs', 'base-clientes-2026', 'fontes')
export const OUT = path.join(ROOT, 'outputs', 'funil-campanhas-2026')

/* ── normalizadores (mesmos do resto da casa) ─────────────────────────────── */

export const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Telefone canônico: só dígitos, sem DDI, 10–11 dígitos. '' quando não presta. */
export function foneKey(v) {
    let d = String(v ?? '').replace(/\D/g, '')
    if (!d) return ''
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
    if (d.length < 10) return ''
    return d.slice(-11)
}

/** CPF/CNPJ só dígitos. */
export function docKey(v) {
    const d = String(v ?? '').replace(/\D/g, '')
    return d.length === 11 || d.length === 14 ? d : ''
}

/** Nome normalizado: sem acento, minúsculo, espaços colapsados. */
export function nomeKey(v) {
    const s = semAcento(v).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    return s.length >= 5 && s.split(' ').length >= 2 ? s : ''
}

/** "16/08/2026, 21:57" | "2026-08-16..." → "2026-08-16". '' quando não dá. */
export function dataIso(v) {
    const s = String(v ?? '').trim()
    const br = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (br) return `${br[3]}-${br[2]}-${br[1]}`
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
    return iso ? iso[1] : ''
}

/** Piso da faixa de cabeças: "101-300"→101, "1 a 50 cabeças"→1, "nenhuma"→0. */
export function pisoCabecas(v) {
    const s = String(v ?? '').trim().toLowerCase()
    if (!s) return null
    if (s === 'nenhuma') return 0
    const m = s.match(/\d+/)
    return m ? Number(m[0]) : null
}

/** Inscrição Estadual declarada (flag "Sim" ou número preenchido). */
export const temIE = (flag, numero) =>
    String(flag ?? '').trim().toLowerCase() === 'sim' || String(numero ?? '').trim().length > 0

/** MQL = a MESMA regra do app (src/lib/crm-types.ts): piso ≥100 cabeças E IE. */
export const ehMql = (cabecas, ieFlag, ieNum) => {
    const p = pisoCabecas(cabecas)
    return p != null && p >= 100 && temIE(ieFlag, ieNum)
}

/* ── lixo de formulário (leads de teste da equipe e dummy data da Meta) ───── */

export function ehLixo(l) {
    const n = semAcento(l.nome ?? '').trim()
    const d = String(l.fone ?? '').replace(/\D/g, '')
    if (/test(e)?\b|\[teste\]|apagar|^(sdsad|asdf|qwer|aaa+|xxx+)/i.test(n)) return true
    if (/^\d{4}-\d{2}-\d{2}T/.test(n)) return true                     // nome veio como timestamp
    if (/<test lead|dummy data/i.test(String(l.campanhaRotulo ?? ''))) return true
    if (/importacao de validacao/i.test(semAcento(l.origem ?? ''))) return true
    if (d && (/(\d)\1{5,}/.test(d) || /^(\d\d)\1{2,}/.test(d.slice(2)))) return true
    return false
}

/* ── carga das fontes ─────────────────────────────────────────────────────── */

export const carregaJson = (dir, nome) => JSON.parse(fs.readFileSync(path.join(dir, `${nome}.json`), 'utf8'))

export function carregaPlanilha() {
    const p = carregaJson(F, 'planilha-leads')
    const abas = {}
    for (const [aba, { head, rows }] of Object.entries(p)) {
        abas[aba] = rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
    }
    return abas
}

export function carregaMeta() {
    const arquivos = fs.readdirSync(OUT).filter(f => /^meta-estrutura-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    const m = JSON.parse(fs.readFileSync(path.join(OUT, arquivos[arquivos.length - 1]), 'utf8'))
    const porId = new Map(m.campanhas.map(c => [c.id, c]))
    const conjPorId = new Map(m.conjuntos.map(s => [s.id, s]))
    // nome de campanha → id (nomes de campanha são únicos nesta conta; se um dia
    // deixarem de ser, a duplicata cai em 'ambiguo' em vez de escolher sozinha)
    const campPorNome = new Map()
    for (const c of m.campanhas) {
        const k = chaveNome(c.nome)
        campPorNome.set(k, campPorNome.has(k) ? '__ambiguo__' : c.id)
    }
    // Nome de conjunto → campanha. Homônimo em duas campanhas normalmente é
    // ambíguo — MENOS quando um dos homônimos nunca teve entrega: conjunto com
    // zero impressão não gerou lead nenhum, então o outro é o único candidato.
    // (É o caso de "CA - LEILAO JMP TOUROS 14/06", que existe nas duas campanhas
    // JMP mas só veiculou na "13/06 e 14/06 LEADS JMP SITE".)
    const campPorNomeConjunto = new Map()
    const conjuntosPorNome = new Map()
    for (const s of m.conjuntos) {
        const k = chaveNome(s.nome)
        if (!conjuntosPorNome.has(k)) conjuntosPorNome.set(k, [])
        conjuntosPorNome.get(k).push(s)
    }
    for (const [k, lista] of conjuntosPorNome) {
        const comEntrega = lista.filter(s => (s.impressoes || 0) > 0)
        const campanhas = new Set(comEntrega.map(s => s.campanha))
        campPorNomeConjunto.set(k, campanhas.size === 1 ? [...campanhas][0] : '__ambiguo__')
    }
    // Nome de anúncio (é o que a landing grava em utm_content) → campanha, quando
    // todos os anúncios com aquele nome pertencem à mesma campanha.
    const campPorNomeAnuncio = new Map()
    for (const a of Object.values(m.anuncios ?? {})) {
        const k = chaveNome(a.nome)
        if (!k) continue
        const atual = campPorNomeAnuncio.get(k)
        if (atual === undefined) campPorNomeAnuncio.set(k, a.campanha)
        else if (atual !== a.campanha) campPorNomeAnuncio.set(k, '__ambiguo__')
    }
    return { snapshot: m, porId, conjPorId, campPorNome, campPorNomeConjunto, campPorNomeAnuncio }
}

/** Nome comparável: sem acento, minúsculo, traços/espaços colapsados. */
export const chaveNome = s => semAcento(s).toLowerCase().replace(/[–—]/g, '-').replace(/[^a-z0-9]+/g, ' ').trim()

/* ── atribuição de campanha, camada a camada ─────────────────────────────── */

/**
 * Descobre a campanha de um registro da planilha, por VOTAÇÃO entre fontes
 * independentes. Cada campo do registro vota no máximo uma vez.
 *
 * Por que votação e não uma ordem fixa: o `ad-id` que a landing grava pode ser
 * o de uma visita ANTERIOR (o parâmetro fica guardado no navegador), enquanto
 * os utm da URL são os do clique de agora. Foi o que apareceu em três leads do
 * remarketing de São Geraldo, em que o ad-id apontava para campanhas de junho e
 * julho e todo o resto da linha — conjunto, criativo e nome da campanha —
 * apontava São Geraldo. Sozinho, o ad-id levaria o lead para a campanha errada.
 *
 * `Origem` NÃO vota: ela é escrita como "Meta — <campaign_name>", ou seja, é
 * espelho do campaign_name. Contá-la seria contar o mesmo voto duas vezes.
 *
 * @returns {{campanha:string|null, via:string, votos:object[], conflito:boolean}}
 */
export function atribuiCampanha(reg, meta) {
    const { snapshot, conjPorId, porId, campPorNome, campPorNomeConjunto, campPorNomeAnuncio } = meta
    const ads = snapshot.anuncios ?? {}

    // ── camada 0: TRIO COERENTE ──────────────────────────────────────────────
    // Quando anúncio, conjunto e campanha nomeados na mesma linha formam um trio
    // que existe de verdade na estrutura da conta (este anúncio mora neste
    // conjunto, que mora nesta campanha), não há o que discutir: é prova
    // estrutural, verificada contra a Meta, e vence qualquer voto isolado.
    // Foi o que desempatou os leads do JMP em que a coluna `ad-id` e a coluna
    // `ad_name` da MESMA linha apontavam anúncios diferentes.
    const trio = trioCoerente(reg, meta)
    if (trio) return { campanha: trio.campanha, via: trio.via, votos: [], conflito: false }

    const votos = []
    const vota = (campanha, via) => { if (campanha && campanha !== '__ambiguo__') votos.push({ campanha, via }) }
    let ambiguo = false

    // 1. identificadores diretos do Meta
    const idAnuncio = [reg['ad-id'], reg['ad_id']].map(v => String(v ?? '').trim()).find(v => /^\d{10,}$/.test(v))
    if (idAnuncio && ads[idAnuncio]) vota(ads[idAnuncio].campanha, 'ad-id')
    const idCamp = String(reg['campaign_id'] ?? '').trim()
    if (/^\d{10,}$/.test(idCamp) && porId.has(idCamp)) vota(idCamp, 'campaign_id')
    const idConj = String(reg['adset_id'] ?? '').trim()
    if (/^\d{10,}$/.test(idConj) && conjPorId.has(idConj)) vota(conjPorId.get(idConj).campanha, 'adset_id')

    // 2. campos de texto — cada um resolve pelo que for: id de conjunto, nome de
    //    campanha ou nome de conjunto. Um voto por campo.
    const resolveTexto = valor => {
        const bruto = String(valor ?? '').trim()
        if (!bruto || /^\{\{.*\}\}$/.test(bruto)) return null           // macro não substituída
        if (/^\d{10,}$/.test(bruto) && conjPorId.has(bruto)) return conjPorId.get(bruto).campanha
        if (/^\d{10,}$/.test(bruto) && porId.has(bruto)) return bruto
        const k = chaveNome(bruto)
        const porCamp = campPorNome.get(k)
        if (porCamp && porCamp !== '__ambiguo__') return porCamp
        const porConj = campPorNomeConjunto.get(k)
        if (porConj === '__ambiguo__') { ambiguo = true; return null }
        if (porConj) return porConj
        return null
    }
    for (const campo of ['utm_campaign', 'utm_medium', 'campaign_name', 'adset_name']) {
        vota(resolveTexto(reg[campo]), campo)
    }
    // 3. criativo: utm_content guarda o NOME do anúncio
    const kAnuncio = chaveNome(reg['utm_content'] ?? reg['ad_name'] ?? '')
    if (kAnuncio) {
        const c = campPorNomeAnuncio.get(kAnuncio)
        if (c === '__ambiguo__') ambiguo = true
        else vota(c, 'utm_content')
    }

    if (!votos.length) return { campanha: null, via: ambiguo ? 'ambiguo' : 'sem-prova', votos: [], conflito: false }

    const contagem = new Map()
    for (const v of votos) contagem.set(v.campanha, (contagem.get(v.campanha) ?? 0) + 1)
    const ranking = [...contagem].sort((a, b) => b[1] - a[1])
    const conflito = ranking.length > 1
    if (conflito && ranking[0][1] === ranking[1][1]) {
        return { campanha: null, via: 'empate', votos, conflito: true }
    }
    const campanha = ranking[0][0]
    const via = votos.filter(v => v.campanha === campanha).map(v => v.via).join('+')
    return { campanha, via, votos, conflito }
}

/**
 * Procura um anúncio que satisfaça, ao mesmo tempo, o nome de anúncio, o nome
 * de conjunto e o nome de campanha declarados na linha. Aceita o par
 * (anúncio + conjunto) quando a campanha não vem nomeada — é o caso das
 * landings, que gravam utm_campaign = conjunto e utm_content = anúncio.
 *
 * @returns {{campanha:string, via:string}|null}
 */
export function trioCoerente(reg, meta) {
    const { snapshot, conjPorId, porId } = meta
    const ads = Object.entries(snapshot.anuncios ?? {})
    const kAnuncio = chaveNome(reg['ad_name'] ?? '')
    const kConjunto = chaveNome(reg['adset_name'] ?? '')
    const kCampanha = chaveNome(reg['campaign_name'] ?? '')
    const tenta = (kA, kS, kC, via) => {
        if (!kA || !kS) return null
        const achados = new Set()
        for (const [, a] of ads) {
            if (chaveNome(a.nome) !== kA) continue
            const conj = conjPorId.get(a.conjunto)
            if (!conj || chaveNome(conj.nome) !== kS) continue
            if (kC && chaveNome(porId.get(a.campanha)?.nome ?? '') !== kC) continue
            achados.add(a.campanha)
        }
        return achados.size === 1 ? { campanha: [...achados][0], via } : null
    }
    return tenta(kAnuncio, kConjunto, kCampanha, 'trio-conector')
        || tenta(chaveNome(reg['utm_content'] ?? ''), chaveNome(reg['utm_campaign'] ?? ''), '', 'par-utm')
}

/** Origem que não é anúncio nenhum (importação, lista fria, cadastro avulso). */
export function classeOrigem(origem, campanhaRotulo) {
    const o = semAcento(origem).toLowerCase()
    const c = semAcento(campanhaRotulo).toLowerCase()
    if (/lista antiga|base unificada|contatos whatsapp/.test(o)) return 'base-fria'
    if (/^meta|landing|forms inst|perpetuo|sao geraldo|jmp/.test(o)) return 'campanha'
    if (/^(ca -|ca-|leads -|lead -|leilao jmp|\d{15,})/.test(c)) return 'campanha'
    if (/instagram/.test(o)) return 'organico'
    if (/habilitacao|indicacao/.test(o)) return 'direto'
    return o ? 'outro' : 'sem-origem'
}
