/**
 * Leitura de PDF de catálogo — a parte "abrir o arquivo pra ter certeza".
 *
 * Duas operações, ambas server-side:
 *
 *   samplePdfText()  extrai o texto de uma amostra de páginas. Custo zero e
 *                    resolve a maioria dos casos: a capa do catálogo traz o
 *                    nome do leilão e a data ("29/Agosto Sábado • 13h"), e a
 *                    ordem de entrada se identifica na primeira linha
 *                    ("ORDEM DE ENTRADA").
 *
 *   slicePdfPages()  recorta as primeiras páginas num PDF novo, pequeno. Serve
 *                    para os catálogos com capa vetorizada/imagem (Terra Brava
 *                    tem 110 páginas, 24 MB, e as 3 primeiras não têm nenhum
 *                    texto): a fatia de ~1 MB vai pra IA ler a capa como
 *                    imagem, em vez de mandar o arquivo inteiro — que além de
 *                    caro estoura o limite de payload do modelo.
 */

import { getDocumentProxy } from 'unpdf'
import { PDFDocument } from 'pdf-lib'

export type PdfSample = {
    /** Total de páginas do documento. */
    paginas: number
    /** Texto concatenado das páginas amostradas (com marcador [p<n>]). */
    texto: string
    /** Quantas das páginas amostradas tinham texto de verdade. */
    paginasComTexto: number
    /** Texto só das 3 primeiras páginas — é onde mora a capa. */
    capa: string
    /** true quando a capa é imagem (nenhum texto nas 3 primeiras páginas). */
    capaSemTexto: boolean
}

const MAX_SAMPLE_CHARS = 14_000

/**
 * Amostra: as 8 primeiras páginas (capa, índice, condições) e, se elas vierem
 * vazias, mais algumas espalhadas pelo miolo — nos catálogos com capa em
 * imagem é a página de lote que entrega o criatório ("DA TERRA BRAVA").
 */
export async function samplePdfText(buf: Uint8Array): Promise<PdfSample> {
    // CÓPIA obrigatória: o pdf.js toma posse do ArrayBuffer (detach). Sem isso
    // o `buf` do caller fica com 0 bytes e a fatia pro modelo sai vazia — foi
    // exatamente assim que o Terra Brava (capa em imagem) ficava sem leitura.
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const total = pdf.numPages

    const primeiras = range(1, Math.min(8, total))
    const textoPorPagina = new Map<number, string>()

    for (const n of primeiras) {
        textoPorPagina.set(n, await pageText(pdf, n))
    }

    const capa = primeiras
        .filter(n => n <= 3)
        .map(n => textoPorPagina.get(n) ?? '')
        .join(' ')
        .trim()

    let comTexto = [...textoPorPagina.values()].filter(Boolean).length
    if (comTexto < 2 && total > 8) {
        // Capa e índice em imagem — pega amostras do miolo.
        const passo = Math.max(1, Math.floor(total / 6))
        for (let n = 9; n <= total && textoPorPagina.size < 14; n += passo) {
            textoPorPagina.set(n, await pageText(pdf, n))
        }
        comTexto = [...textoPorPagina.values()].filter(Boolean).length
    }

    const texto = [...textoPorPagina.entries()]
        .filter(([, t]) => t)
        .sort((a, b) => a[0] - b[0])
        .map(([n, t]) => `[p${n}] ${t}`)
        .join('\n')
        .slice(0, MAX_SAMPLE_CHARS)

    return {
        paginas: total,
        texto,
        paginasComTexto: comTexto,
        capa,
        capaSemTexto: capa.length < 20,
    }
}

async function pageText(
    pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
    n: number,
): Promise<string> {
    try {
        const page = await pdf.getPage(n)
        const content = await page.getTextContent()
        return (content.items as Array<{ str?: string }>)
            .map(i => i.str ?? '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
    } catch {
        return ''
    }
}

/**
 * Recorta as `quantas` primeiras páginas num PDF novo. Devolve null quando o
 * arquivo não abre (protegido/corrompido) — o caller degrada pro texto.
 */
export async function slicePdfPages(buf: Uint8Array, quantas = 3): Promise<Uint8Array | null> {
    try {
        const src = await PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true })
        const total = src.getPageCount()
        if (total === 0) return null
        const out = await PDFDocument.create()
        const indices = range(0, Math.min(quantas, total) - 1)
        const paginas = await out.copyPages(src, indices)
        for (const p of paginas) out.addPage(p)
        return await out.save()
    } catch {
        return null
    }
}

function range(from: number, to: number): number[] {
    const out: number[] = []
    for (let i = from; i <= to; i++) out.push(i)
    return out
}
