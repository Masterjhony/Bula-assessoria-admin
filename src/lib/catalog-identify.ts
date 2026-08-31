/**
 * Identificação de um PDF capturado nos grupos de WhatsApp: o que é este
 * documento e de que leilão ele é.
 *
 * Antes o sistema decidia isso só pelo NOME DO ARQUIVO, e errava do jeito
 * previsível — "OE - Engenho de Serra.pdf" não casava com nada, "Catálogo -
 * 12º LNNMP COLONIAL 260821.pdf" empacava em 57%, e "Ranking_Completo_
 * Compradores_ExpoGenetica_2026_Bula.pdf" (que nem catálogo é) virava
 * candidato ambíguo. Agora o arquivo é ABERTO:
 *
 *   1. texto das primeiras páginas (grátis) — resolve a maioria;
 *   2. se a capa é imagem ou faltou data/nome, uma fatia de 3 páginas vai
 *      pra IA ler a capa (≈US$ 0,0006 por documento).
 *
 * O resultado é uma `EvidenciaDocumento`, e é ela — não o nome do arquivo —
 * que manda no casamento com o cronograma.
 */

import { DEFAULT_OPENROUTER_MODEL, isOpenRouterConfigured, parseLooseJson } from './openrouter'
import { samplePdfText, slicePdfPages } from './catalog-pdf'

export type TipoDocumento = 'catalogo' | 'ordem_entrada' | 'relatorio' | 'agenda' | 'outro'

/** Tipos que valem anexar a um leilão. O resto é ruído de grupo. */
export const TIPOS_ANEXAVEIS: TipoDocumento[] = ['catalogo', 'ordem_entrada']

export type EvidenciaDocumento = {
    tipo: TipoDocumento
    /** Nome do evento como impresso no documento. */
    evento_nome: string | null
    /** Melhor palpite da data do leilão (ISO). */
    data_leilao: string | null
    /** TODAS as datas plausíveis achadas na capa — o match aceita qualquer uma. */
    datas_capa: string[]
    /**
     * De onde veio a data. Só `conteudo` autoriza o matcher a ELIMINAR um
     * candidato por conflito de data — data tirada do nome do arquivo é palpite,
     * e palpite não descarta leilão.
     */
    data_origem: 'conteudo' | 'nome' | null
    hora: string | null
    leiloeira: string | null
    criadores: string[]
    local: string | null
    lotes: number | null
    paginas: number | null
    fonte: 'texto' | 'texto+ia' | 'ia' | 'nome'
    confianca: number
    /** Trecho da capa guardado pra auditoria na UI. */
    trecho: string
}

const MESES: Record<string, number> = {
    jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, março: 3,
    abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
    jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9,
    out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
}

const MESES_ALT = Object.keys(MESES).sort((a, b) => b.length - a.length).join('|')

function semAcento(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Capas de catálogo são diagramadas com letter-spacing, e o extrator devolve
 * "L e i l ã o  2 0 2 6". Junta as corridas de caracteres soltos pra que os
 * regex de data e os tokens de nome voltem a existir.
 */
export function juntarLetrasSoltas(texto: string): string {
    return texto.replace(/(?:(?<=^|\s)[\p{L}\p{N}](?=\s|$)\s?){3,}/gu, m =>
        m.replace(/\s+/g, ''),
    )
}

/**
 * Datas achadas no texto, em ISO. Quando o ano não aparece (muito comum:
 * "29/Agosto"), escolhe o ano que põe a data mais perto de `referencia` —
 * catálogo chega dias antes do leilão, não meses depois.
 */
export function extrairDatas(texto: string, referencia: Date): string[] {
    const t = semAcento(juntarLetrasSoltas(texto)).toLowerCase()
    const achadas: string[] = []

    const push = (dia: number, mes: number, ano: number | null) => {
        if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return
        const iso = resolverAno(dia, mes, ano, referencia)
        if (iso && !achadas.includes(iso)) achadas.push(iso)
    }

    // "29/Agosto", "23 DE AGOSTO DE 2026", "03 ago 26"
    const porExtenso = new RegExp(
        `\\b(\\d{1,2})\\s*(?:de\\s*)?[/\\-. ]?\\s*(${MESES_ALT})\\b(?:\\s*(?:de\\s*)?((?:\\d\\s*){2,4}))?`,
        'g',
    )
    for (const m of t.matchAll(porExtenso)) {
        const anoTxt = m[3]?.replace(/\s/g, '')
        push(Number(m[1]), MESES[m[2]], anoTxt ? Number(anoTxt) : null)
    }

    // "18/08/2026", "18.08.26", "18-08"
    for (const m of t.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/g)) {
        push(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null)
    }

    return achadas
}

function resolverAno(dia: number, mes: number, ano: number | null, referencia: Date): string | null {
    const candidatos: number[] = []
    if (ano != null) {
        candidatos.push(ano < 100 ? 2000 + ano : ano)
    } else {
        const base = referencia.getUTCFullYear()
        candidatos.push(base, base + 1, base - 1)
    }
    let melhor: { iso: string; dist: number } | null = null
    for (const a of candidatos) {
        if (a < 2020 || a > 2100) continue
        const d = new Date(Date.UTC(a, mes - 1, dia))
        if (d.getUTCMonth() !== mes - 1) continue // 31 de fevereiro e afins
        const dist = Math.abs(d.getTime() - referencia.getTime())
        // Sem ano explícito, a janela plausível é de ~1 mês atrás a ~8 meses à frente.
        if (ano == null) {
            const dias = (d.getTime() - referencia.getTime()) / 86_400_000
            if (dias < -45 || dias > 300) continue
        }
        if (!melhor || dist < melhor.dist) melhor = { iso: d.toISOString().slice(0, 10), dist }
    }
    return melhor?.iso ?? null
}

/** Datas escondidas no nome do arquivo: "260821" (AAMMDD), "23.08", "18 AGO". */
export function extrairDatasDoNome(fileName: string, referencia: Date): string[] {
    const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, '')
    const datas = extrairDatas(base, referencia)
    for (const m of base.matchAll(/\b(\d{2})(\d{2})(\d{2})\b/g)) {
        const [, a, b, c] = m
        // AAMMDD (260821 = 21/08/2026) é o formato que os catálogos usam.
        const iso = resolverAno(Number(c), Number(b), Number(a), referencia)
        if (iso && !datas.includes(iso)) datas.push(iso)
    }
    return datas
}

/**
 * Classifica o documento pelo texto.
 *
 * Título de capa quase sempre vem com letter-spacing — a ordem de entrada
 * aparece extraída como "O R D E M  D E  E N T R A D A". Por isso cada pista é
 * testada nas DUAS formas: no texto normal e no texto sem nenhum espaço.
 * Testar só a forma com espaços fazia toda ordem de entrada passar por
 * catálogo, e ela ia parar na página pública como se fosse oferta.
 */
function classificarPorTexto(texto: string, fileName = ''): { tipo: TipoDocumento; certo: boolean } {
    const t = semAcento(juntarLetrasSoltas(texto)).toLowerCase()
    const compacto = semAcento(texto).toLowerCase().replace(/\s+/g, '')
    const tem = (re: RegExp, compactoRe?: RegExp) =>
        re.test(t) || (compactoRe ? compactoRe.test(compacto) : false)

    if (tem(/\bordem de entrada\b/, /ordemdeentrada/)) return { tipo: 'ordem_entrada', certo: true }
    if (tem(/\branking (completo )?de compradores\b|\brelatorio executivo\b/, /rankingcompletodecompradores|relatorioexecutivo/)) {
        return { tipo: 'relatorio', certo: true }
    }
    if (tem(/\bagenda de leiloes\b|\bmapa de ocupacao\b/, /agendadeleiloes|mapadeocupacao/)) {
        return { tipo: 'agenda', certo: true }
    }

    const pistasCatalogo = [
        tem(/\bcatalogo\b/, /catalogo/),
        tem(/\blote\s*:\s*/, /lote:/),
        tem(/\biabcz\b/, /iabcz/),
        tem(/\bmgte\b/, /mgte/),
        tem(/\bpedigree\b/, /pedigree/),
        tem(/\bcondicoes de pagamento\b/, /condicoesdepagamento/),
        tem(/\bfrete gratis\b/, /fretegratis/),
    ].filter(Boolean).length

    // "O.E" no nome do arquivo é convenção fixa das leiloeiras para a ordem de
    // entrada. Só vale quando o conteúdo não afirmou outra coisa.
    const nomeDizOe = /^\s*o\.?\s*e\.?\s*[-–—•]/i.test(fileName) || /\bordem de entrada\b/i.test(fileName)
    if (nomeDizOe && pistasCatalogo < 3) return { tipo: 'ordem_entrada', certo: true }

    if (pistasCatalogo >= 2) return { tipo: 'catalogo', certo: true }
    if (pistasCatalogo === 1) return { tipo: 'catalogo', certo: false }
    return { tipo: 'outro', certo: false }
}

function contarLotes(texto: string): number | null {
    const nums = new Set<number>()
    for (const m of texto.matchAll(/\blote\s*:?\s*(\d{1,4})\b/gi)) {
        const n = Number(m[1])
        if (n > 0 && n < 5000) nums.add(n)
    }
    return nums.size > 0 ? nums.size : null
}

const PROMPT_IA = (hoje: string, fileName: string, trecho: string) => `Você está vendo as PRIMEIRAS PÁGINAS de um documento enviado num grupo de WhatsApp de leilões de gado (Brasil). Hoje é ${hoje}.
Nome do arquivo: "${fileName}"
${trecho ? `Texto já extraído do documento (pode estar incompleto/embaralhado):\n"""${trecho.slice(0, 3000)}"""\n` : ''}
Responda SÓ com JSON, sem comentários:
{"tipo":"catalogo|ordem_entrada|relatorio|agenda|outro",
 "evento_nome":"<nome do leilão exatamente como impresso, ou null>",
 "data_leilao":"<AAAA-MM-DD da data do EVENTO impressa, ou null>",
 "hora":"<ex 13h, 20h, ou null>",
 "leiloeira":"<empresa leiloeira, ou null>",
 "criadores":["<fazendas/criatórios/promotores impressos>"],
 "local":"<cidade-UF ou tatersal, ou null>",
 "confianca":<0 a 1>}

Regras rígidas:
- "catalogo" = oferta de lotes do leilão. "ordem_entrada" = lista da ordem de entrada dos lotes (costuma vir titulada ORDEM DE ENTRADA ou O.E.). "relatorio"/"agenda" = qualquer coisa que não seja documento de oferta de um leilão específico.
- data_leilao só quando a data do evento estiver IMPRESSA no documento ("29/Agosto Sábado 13h" → 2026-08-29). Sem ano impresso, use o ano que faça a data cair perto de hoje. Se não houver data impressa, use null — NUNCA deduza pelo nome do arquivo nem invente.
- evento_nome vem do documento; se só houver logotipo ilegível, use null.`

type RespostaIa = {
    tipo?: string
    evento_nome?: string | null
    data_leilao?: string | null
    hora?: string | null
    leiloeira?: string | null
    criadores?: string[] | null
    local?: string | null
    confianca?: number
}

async function lerCapaComIa(
    fatia: Uint8Array,
    fileName: string,
    trecho: string,
    hoje: string,
): Promise<RespostaIa | null> {
    const b64 = Buffer.from(fatia).toString('base64')
    try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://bulaassessoria.com',
                'X-Title': 'Bula Assessoria CRM',
            },
            body: JSON.stringify({
                model: DEFAULT_OPENROUTER_MODEL,
                temperature: 0,
                max_tokens: 1200,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: PROMPT_IA(hoje, fileName, trecho) },
                        { type: 'file', file: { filename: 'capa.pdf', file_data: `data:application/pdf;base64,${b64}` } },
                    ],
                }],
            }),
            signal: AbortSignal.timeout(120_000),
        })
        if (!res.ok) return null
        const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
        return parseLooseJson<RespostaIa>(json.choices?.[0]?.message?.content ?? '')
    } catch {
        return null
    }
}

function tipoValido(v: unknown): TipoDocumento | null {
    const t = String(v ?? '').trim().toLowerCase()
    return (['catalogo', 'ordem_entrada', 'relatorio', 'agenda', 'outro'] as const)
        .find(x => x === t) ?? null
}

function dataValida(v: unknown): string | null {
    const s = String(v ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
    const d = new Date(`${s}T12:00:00Z`)
    return Number.isNaN(d.getTime()) ? null : s
}

/**
 * Abre o PDF e devolve a evidência. `referencia` é a data de recebimento da
 * mensagem — é o que ancora o ano quando a capa só traz "29/Agosto".
 */
export async function identificarDocumento(
    buf: Uint8Array,
    fileName: string,
    referencia: Date = new Date(),
): Promise<EvidenciaDocumento> {
    const hojeIso = referencia.toISOString().slice(0, 10)

    let amostra: Awaited<ReturnType<typeof samplePdfText>> | null = null
    try {
        amostra = await samplePdfText(buf)
    } catch {
        amostra = null
    }

    const capa = amostra?.capa ?? ''
    const texto = amostra?.texto ?? ''
    const datasCapa = capa ? extrairDatas(capa, referencia) : []
    const classificacao = capa || texto
        ? classificarPorTexto(`${capa} ${texto}`, fileName)
        : { tipo: 'outro' as TipoDocumento, certo: false }

    const evidencia: EvidenciaDocumento = {
        tipo: classificacao.tipo,
        evento_nome: null,
        data_leilao: datasCapa[0] ?? null,
        datas_capa: datasCapa,
        data_origem: datasCapa.length > 0 ? 'conteudo' : null,
        hora: extrairHora(capa),
        leiloeira: null,
        criadores: [],
        local: null,
        lotes: texto ? contarLotes(texto) : null,
        paginas: amostra?.paginas ?? null,
        fonte: amostra ? 'texto' : 'nome',
        confianca: classificacao.certo && datasCapa.length > 0 ? 0.75 : 0.35,
        trecho: (capa || texto).slice(0, 800),
    }

    // A IA lê uma fatia de 3 páginas (≈1 MB, ≈US$0,0006) sempre que o documento
    // ainda pode virar anexo de leilão: mesmo com data e tipo já resolvidos pelo
    // texto, é dela que vêm o NOME DO EVENTO impresso na capa, a leiloeira e os
    // criatórios — os sinais que fazem o match ter certeza. Só pula quando o
    // texto já provou que o arquivo não é documento de leilão nenhum.
    const descartadoPeloTexto =
        classificacao.certo && (classificacao.tipo === 'relatorio' || classificacao.tipo === 'agenda')
    if (!descartadoPeloTexto && isOpenRouterConfigured()) {
        const fatia = await slicePdfPages(buf, 3)
        const ia = fatia ? await lerCapaComIa(fatia, fileName, capa || texto, hojeIso) : null
        if (ia) {
            const tipoIa = tipoValido(ia.tipo)
            // O texto é mais confiável que a IA quando disse algo com certeza.
            if (tipoIa && !classificacao.certo) evidencia.tipo = tipoIa
            evidencia.evento_nome = limpar(ia.evento_nome)
            evidencia.leiloeira = limpar(ia.leiloeira)
            evidencia.local = limpar(ia.local)
            evidencia.criadores = (ia.criadores ?? [])
                .map(c => limpar(c))
                .filter((c): c is string => !!c)
                .slice(0, 8)
            evidencia.hora = evidencia.hora ?? limpar(ia.hora)
            const dataIa = dataValida(ia.data_leilao)
            if (dataIa) {
                evidencia.data_leilao = evidencia.data_leilao ?? dataIa
                if (!evidencia.datas_capa.includes(dataIa)) evidencia.datas_capa.push(dataIa)
                evidencia.data_origem = 'conteudo'
            }
            evidencia.fonte = amostra ? 'texto+ia' : 'ia'
            evidencia.confianca = Math.max(
                evidencia.confianca,
                typeof ia.confianca === 'number' ? Math.min(1, Math.max(0, ia.confianca)) : 0.6,
            )
        }
    }

    // Última rede: data no nome do arquivo (só entra se o conteúdo não deu nenhuma).
    if (evidencia.datas_capa.length === 0) {
        const doNome = extrairDatasDoNome(fileName, referencia)
        if (doNome.length > 0) {
            evidencia.datas_capa = doNome
            evidencia.data_origem = 'nome'
        }
    }

    evidencia.data_leilao = melhorData(evidencia.datas_capa, referencia)
    return evidencia
}

/**
 * Entre as datas lidas, a mais provável de ser a do leilão.
 *
 * A capa mistura coisas — data de visitação, ano do logotipo, e às vezes a IA
 * lê o ano errado de um número estilizado. O critério é operacional: catálogo
 * circula ANTES do leilão e perto dele. Data anterior à chegada do arquivo é
 * quase sempre leitura errada, e vai pro fim da fila.
 *
 * O match continua testando TODAS as datas — esta escolha só define o que a UI
 * mostra como "data impressa".
 */
export function melhorData(datas: string[], referencia: Date): string | null {
    if (datas.length === 0) return null
    const ref = referencia.getTime()
    const pontuar = (iso: string) => {
        const t = Date.parse(`${iso}T12:00:00Z`)
        if (Number.isNaN(t)) return Number.POSITIVE_INFINITY
        const dias = (t - ref) / 86_400_000
        // Passado (além de 1 dia) é penalizado pesado, mas não descartado.
        return (dias < -1 ? 10_000 : 0) + Math.abs(dias)
    }
    return [...datas].sort((a, b) => pontuar(a) - pontuar(b))[0] ?? null
}

function extrairHora(texto: string): string | null {
    const t = juntarLetrasSoltas(texto)
    const m = t.match(/\b(\d{1,2})\s*(?:h|hs|horas|:\s*\d{2})\b/i)
    if (!m) return null
    const h = Number(m[1])
    return h >= 0 && h <= 23 ? `${h}h` : null
}

function limpar(v: unknown): string | null {
    const s = String(v ?? '').trim()
    if (!s || s.toLowerCase() === 'null' || s.length > 160) return null
    return s
}
