/**
 * DE ONDE VEIO UMA PESSOA — o universo de leads como prova, não como palpite.
 *
 * A pergunta que isto responde: "este cadastro (ou este comprador) já era um
 * lead nosso?". Ela decide se um número entra ou não no funil da mídia, e por
 * isso o matching é DURO de propósito:
 *
 *   • CPF/CNPJ é prova.
 *   • Telefone é prova.
 *   • Nome exato só vale com 2 tokens ou mais — "Helio" e "Dienifer" batem com
 *     dezenas de gente na Base Unificada; nome de um termo é coringa.
 *   • Nome contido (todos os tokens do nome curto presentes no nome longo) só
 *     vale quando sobra UM candidato, ou quando a UF desempata para um só.
 *
 * Sem essas travas, "Adriano de Oliveira" casa com quatro pessoas diferentes e
 * o funil da mídia ganha um cadastro que não é dele.
 *
 * Também separa lead de MÍDIA (anúncio ou landing) de lead de LISTA IMPORTADA
 * (Base Unificada, lista antiga de fazendas, cadastro de habilitação): os dois
 * são "lead", mas só o primeiro foi pago com a verba do mês.
 */

export const soDigitos = s => String(s || '').replace(/\D/g, '')
export const foneKey = s => { const x = soDigitos(s).replace(/^55/, ''); return x.length >= 10 ? x.slice(-11) : '' }
export const nomeNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

const IGNORA = new Set(['dos', 'das', 'de', 'da', 'do', 'e', 'ltda', 'sa', 'me', 'epp', 'neto', 'filho', 'junior', 'jr'])
export const tokens = s => nomeNorm(s).split(' ').filter(t => t.length > 2 && !IGNORA.has(t))

/** Anúncio ou landing — o que a verba do mês pagou. */
export const ehMidia = o => /^meta —|^landing|formul/i.test(String(o || '').trim())
/** Lista fria importada: é lead, mas não foi a mídia que trouxe. */
export const ehLista = o => /base unificada|lista antiga|cadastro habilita/i.test(String(o || ''))

/** Índice consultável a partir dos registros de lead ({nome, fone, cpf, uf, origem, data, fonte}). */
export function indexaUniverso(registros) {
    const porCpf = new Map(), porFone = new Map(), porNome = new Map()
    const push = (m, k, v) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(v) }
    for (const u of registros) {
        const c = soDigitos(u.cpf)
        if (c.length === 11 || c.length === 14) push(porCpf, c, u)
        push(porFone, foneKey(u.fone), u)
        push(porNome, nomeNorm(u.nome), u)
    }
    return { registros, porCpf, porFone, porNome }
}

/** Casa uma pessoa contra o universo. Devolve {via, achados} ou null. */
export function casaNoUniverso(idx, { nome, cpf, fone, uf }) {
    const c = soDigitos(cpf)
    if (c.length === 11 || c.length === 14) { const a = idx.porCpf.get(c); if (a?.length) return { via: 'CPF', achados: a } }
    const f = foneKey(fone)
    if (f) { const a = idx.porFone.get(f); if (a?.length) return { via: 'telefone', achados: a } }
    const t = tokens(nome)
    if (t.length < 2) return null
    const exato = idx.porNome.get(nomeNorm(nome))
    if (exato?.length) return { via: 'nome exato', achados: exato }
    const cand = idx.registros.filter(u => { const tu = tokens(u.nome); return tu.length >= 2 && t.every(x => tu.includes(x)) })
    if (new Set(cand.map(x => nomeNorm(x.nome))).size === 1) return { via: 'nome contido', achados: cand }
    if (uf) {
        const naUf = cand.filter(x => String(x.uf || '').toUpperCase() === String(uf).toUpperCase())
        if (new Set(naUf.map(x => nomeNorm(x.nome))).size === 1) return { via: 'nome contido + UF', achados: naUf }
    }
    return null
}

/** 'midia' | 'lista' | 'outro' | 'sem-lead' */
export function classifica(achado) {
    if (!achado) return 'sem-lead'
    if (achado.achados.some(x => ehMidia(x.origem))) return 'midia'
    if (achado.achados.some(x => ehLista(x.origem))) return 'lista'
    return 'outro'
}

/** A linha de lead que serve de prova (a de mídia, se houver). */
export const provaDe = achado => achado?.achados.find(x => ehMidia(x.origem)) || achado?.achados[0] || null
