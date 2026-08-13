/**
 * BASE ÚNICA DE CLIENTES E DO FUNIL 2026 — núcleo compartilhado dos relatórios
 * pedidos pela diretoria em 13/08/2026.
 *
 * Existe porque a resposta para "quem comprou pela Bula em 2026" não mora em
 * lugar nenhum: mora em cinco lugares que discordam entre si. Este módulo é o
 * único ponto onde essa discordância é resolvida, com a regra escrita à vista.
 *
 * FONTES DE COMPRA (e por que cada uma entra)
 *   A. HastaPro, filial '2' (BULA ASSESSORIA) — ERP do leiloeiro, lote a lote.
 *      É a fonte autoritativa: todo lote de FIL '2' já nasce com pisteiro da
 *      equipe Bula, então FIL '2' *é* a cobertura Bula (conferido: os 15
 *      pisteiros de 2026 são todos da casa). 82 leilões, R$ 20,27 mi.
 *   B. clientes.compras_manuais — a carteira que os assessores lançam à mão.
 *      Cobre os leilões de leiloeiras que não passam pelo HastaPro da Bula.
 *   C. bula_leilao_fechamento.compradores (jsonb) — só o pódio de cada leilão
 *      (top 3, com `rank`). Não é cadastro: serve para achar comprador grande
 *      de leilão que não entrou no ERP.
 *   D. bula_leilao_vendas — parser dos grupos de lance. O `valor` ali é a
 *      PARCELA, não o total, então daqui só se aproveita IDENTIDADE
 *      (nome, fazenda, cidade, UF, assessor) — nunca dinheiro.
 *
 * REGRA ANTI-DUPLA-CONTAGEM: cada leilão do universo é atendido por UMA fonte
 * de dinheiro. Se o leilão existe no HastaPro, vale A e ponto. Se não existe,
 * valem B e C (deduplicados entre si). Sem isso o mesmo lote do Mafra entraria
 * duas vezes e o VGV inflaria ~20%.
 *
 * IDENTIDADE: CPF > telefone canônico > nome. O nome sozinho é a última opção
 * porque o ERP grava "Dr Celso Lopes" e a carteira grava "Celso Lopes" — casam,
 * mas casar por nome tem risco de homônimo, então a base marca COMO casou.
 */
import fs from 'node:fs'
import path from 'node:path'

/* ── normalizadores de identidade ─────────────────────────────────────────── */

export const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
export const digitos = s => String(s ?? '').replace(/\D/g, '')

/** Telefone canônico: sem DDI 55 e sem o nono dígito — espelha foneKey() do TS. */
export function foneKey(v) {
    let d = digitos(v)
    if (!d) return ''
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
    if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3)
    return d.length >= 10 ? d : ''
}

/** CPF/CNPJ só-dígitos. Devolve '' se não tiver o tamanho legal. */
export function docKey(v) {
    const d = digitos(v)
    return (d.length === 11 || d.length === 14) ? d : ''
}

/** Palavras que o pessoal cola no nome e que atrapalham o casamento. */
const RUIDO = /\b(dr|dra|sr|sra|srta|fazenda|faz|agropecuaria|agropec|agro|nelore|sitio|granja|grupo|cia|ltda|me|epp|eireli|filho|neto|espolio)\b/g

export function nomeNorm(v) {
    return semAcento(v).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}
/** Miolo do nome, sem títulos nem razão social — "DR CELSO LOPES" → "celso lopes". */
export function nomeKey(v) {
    const s = nomeNorm(v).toLowerCase().replace(RUIDO, ' ').replace(/\s+/g, ' ').trim()
    return s.split(' ').filter(x => x.length > 2).join(' ')
}
/** Primeiro + último token: casa "MAURO CESAR" com "MAURO CESAR DA SILVA". */
export function nomeKeyCurta(v) {
    const t = nomeKey(v).split(' ').filter(Boolean)
    if (!t.length) return ''
    return t.length === 1 ? t[0] : `${t[0]} ${t[t.length - 1]}`
}
/** Conjunto de tokens do nome — a base do casamento por nome. */
export function nomeTokens(v) {
    return new Set(nomeKey(v).split(' ').filter(x => x.length > 2))
}
/**
 * Dois nomes são a mesma pessoa quando compartilham ao menos 2 tokens e esses
 * tokens cobrem o nome mais curto quase inteiro. É o que faz
 * "NELORE GRÃO PARA - DR CELSO LOPES" casar com "Dr Celso Lopes" sem casar
 * "José Carlos Silva" com "Ana Paula Silva" (1 token só, e cobertura baixa).
 */
export function mesmoNome(a, b) {
    const A = nomeTokens(a), B = nomeTokens(b)
    if (!A.size || !B.size) return false
    const inter = [...A].filter(x => B.has(x)).length
    if (inter < 2) return inter === 1 && A.size === 1 && B.size === 1
    return inter / Math.min(A.size, B.size) >= 0.6
}

/* ── casamento de leilões entre HastaPro e fechamentos ────────────────────── */

const STOP = new Set(['leilao', 'virtual', 'de', 'do', 'da', 'das', 'dos', 'edicao', 'etapa', 'mega', 'evento', 'especial', 'anos', '2026', 'dia'])
const tokensLeilao = s => new Set(
    semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/)
        .map(x => x.toLowerCase())
        .filter(x => x.length >= 2 && !STOP.has(x) && !/^\d+[oa]?$/.test(x)))
const overlap = (a, b) => { const i = [...a].filter(x => b.has(x)).length; return i / Math.min(a.size, b.size) || 0 }
export const diasEntre = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000

/**
 * Casa cada leilão do HastaPro com o fechamento correspondente.
 * Valor idêntico + data próxima vence nome, porque as etiquetas de etapa vivem
 * trocadas entre as duas bases (Naviraí 1ª/2ª, EAO fêmeas/touros) enquanto o
 * valor do dia bate exatamente.
 */
export function casaLeiloes(leiloesHp, fechamentos) {
    const usados = new Set()
    const par = new Map()
    for (const h of leiloesHp) {
        const c = fechamentos.filter(s => !usados.has(s.id) && s.vgv === h.vgv && diasEntre(h.data, s.data) <= 3)
        if (c.length === 1) { usados.add(c[0].id); par.set(h.id, { sb: c[0], via: 'valor+data' }) }
    }
    for (const h of leiloesHp) {
        if (par.has(h.id)) continue
        let melhor = null, score = 0
        for (const s of fechamentos) {
            if (usados.has(s.id) || diasEntre(h.data, s.data) > 2) continue
            const j = overlap(tokensLeilao(h.nome), tokensLeilao(s.nome))
            if (j > score) { score = j; melhor = s }
        }
        if (melhor && score >= 0.45) { usados.add(melhor.id); par.set(h.id, { sb: melhor, via: 'nome+data', score }) }
    }
    return { par, soFechamento: fechamentos.filter(s => !usados.has(s.id)) }
}

/* ── índice de identidade ─────────────────────────────────────────────────── */

/**
 * Índice que aceita consulta por documento, telefone ou nome, nessa ordem de
 * confiança. Guarda a lista por chave de nome para poder recusar match quando
 * há homônimo — é melhor deixar o campo vazio do que atribuir compra a outro.
 */
export class Identidades {
    constructor() {
        this.porDoc = new Map()
        this.porFone = new Map()
        this.porToken = new Map()   // token → [{ registro, nome }] — índice invertido
    }
    add(registro, { doc, fone, nome } = {}) {
        const d = docKey(doc); if (d && !this.porDoc.has(d)) this.porDoc.set(d, registro)
        const f = foneKey(fone); if (f && !this.porFone.has(f)) this.porFone.set(f, registro)
        for (const t of nomeTokens(nome)) {
            if (!this.porToken.has(t)) this.porToken.set(t, [])
            this.porToken.get(t).push({ registro, nome: String(nome ?? '') })
        }
    }
    /** Devolve { registro, via } ou null. `via` entra na base para auditoria. */
    busca({ doc, fone, nome } = {}) {
        const d = docKey(doc); if (d && this.porDoc.has(d)) return { registro: this.porDoc.get(d), via: 'cpf' }
        const f = foneKey(fone); if (f && this.porFone.has(f)) return { registro: this.porFone.get(f), via: 'telefone' }
        // candidatos: quem compartilha ao menos um token, depois filtra por mesmoNome
        const vistos = new Set(), achados = []
        for (const t of nomeTokens(nome)) {
            for (const c of (this.porToken.get(t) || [])) {
                if (vistos.has(c.registro)) continue
                vistos.add(c.registro)
                if (mesmoNome(nome, c.nome)) achados.push(c.registro)
            }
        }
        if (achados.length === 1) return { registro: achados[0], via: 'nome' }
        return null // nenhum, ou homônimo: recusa em vez de chutar
    }
}

/* ── util ─────────────────────────────────────────────────────────────────── */

export const carrega = (dir, nome) => JSON.parse(fs.readFileSync(path.join(dir, `${nome}.json`), 'utf8'))
export const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
export const num = n => (Number(n) || 0).toLocaleString('pt-BR')
export const pct = (a, b) => b ? `${(a * 100 / b).toFixed(1).replace('.', ',')}%` : '—'
