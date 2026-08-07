/**
 * Parser de extrato bancário (OFX e CSV/texto) para o importador do ERP.
 *
 * Substitui os scripts-por-período (scripts/import-extrato-sicoob-jul-*.mjs):
 * o extrato baixado no internet banking entra pela tela de Conciliação, é
 * deduplicado por `import_key` e cai como movimento PENDENTE — classificar e
 * conciliar continua sendo decisão humana.
 *
 * Princípio: nada é descartado em silêncio. Toda linha que não vira movimento
 * volta em `ignoradas` com o motivo, para quem importou conferir.
 */

import { createHash } from 'node:crypto'

export type FormatoExtrato = 'ofx' | 'csv'

export interface LinhaExtrato {
    data: string                 // ISO (YYYY-MM-DD)
    descricao: string
    valor: number                // sempre positivo; o sinal vive em `tipo`
    tipo: 'entrada' | 'saida'
    documento: string
    import_key: string
    saldo_apos: number | null
}

export interface ExtratoParseado {
    formato: FormatoExtrato
    linhas: LinhaExtrato[]
    ignoradas: Array<{ linha: string; motivo: string }>
    saldo_final: number | null   // saldo informado pelo próprio extrato, quando houver
    data_saldo: string | null
}

/** "1.234,56" / "-167,70" / "167,70D" / "(167,70)" / "1234.56" → number */
export function parseValorBR(raw: string): number | null {
    let s = (raw || '').trim()
    if (!s) return null
    let negativo = false

    // sufixo/prefixo de débito-crédito usado por vários bancos
    const dc = s.match(/(^|\s)([DC])$/i)
    if (dc) { negativo = dc[2].toUpperCase() === 'D'; s = s.slice(0, dc.index).trim() }
    if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1) }
    if (s.startsWith('-')) { negativo = true; s = s.slice(1) }
    if (s.startsWith('+')) s = s.slice(1)

    s = s.replace(/R\$/gi, '').replace(/\s/g, '')
    if (!s) return null

    // pt-BR usa vírgula decimal; se só há ponto, decide pelo formato do grupo
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')

    const n = Number(s)
    if (!Number.isFinite(n)) return null
    return negativo ? -n : n
}

/** "04/08/2026", "04/08/26", "2026-08-04", "20260804" → ISO */
export function parseDataBR(raw: string): string | null {
    const s = (raw || '').trim()
    if (!s) return null
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    m = s.match(/^(\d{4})(\d{2})(\d{2})/)          // OFX: 20260804[120000[-3:BRT]]
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
    if (m) {
        const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
        return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
    return null
}

function chave(partes: string[]): string {
    return createHash('sha1').update(partes.join('|')).digest('hex').slice(0, 24)
}

function normalizaTexto(s: string): string {
    return (s || '').replace(/\s+/g, ' ').trim()
}

/* ------------------------------------------------------------------ OFX --- */

function parseOfx(conteudo: string): ExtratoParseado {
    const linhas: LinhaExtrato[] = []
    const ignoradas: Array<{ linha: string; motivo: string }> = []

    const campo = (bloco: string, tag: string): string => {
        // OFX é SGML: a tag costuma não ter fechamento, o valor vai até a
        // próxima tag ou fim de linha.
        const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))
        return m ? m[1].trim() : ''
    }

    for (const bloco of conteudo.split(/<STMTTRN>/i).slice(1)) {
        const corpo = bloco.split(/<\/STMTTRN>/i)[0]
        const data = parseDataBR(campo(corpo, 'DTPOSTED'))
        const valor = parseValorBR(campo(corpo, 'TRNAMT'))
        if (!data || valor === null) {
            ignoradas.push({ linha: normalizaTexto(corpo).slice(0, 120), motivo: 'sem data ou valor legível' })
            continue
        }
        if (valor === 0) {
            ignoradas.push({ linha: normalizaTexto(corpo).slice(0, 120), motivo: 'valor zero' })
            continue
        }
        const fitid = campo(corpo, 'FITID')
        const memo = normalizaTexto(campo(corpo, 'MEMO') || campo(corpo, 'NAME')) || 'Lançamento'
        linhas.push({
            data,
            descricao: memo,
            valor: Math.abs(valor),
            tipo: valor >= 0 ? 'entrada' : 'saida',
            documento: campo(corpo, 'CHECKNUM') || fitid,
            // FITID é único por instituição — é a melhor chave de dedup possível
            import_key: fitid ? `ofx:${fitid}` : `ofxh:${chave([data, String(valor), memo])}`,
            saldo_apos: null,
        })
    }

    const bal = conteudo.match(/<LEDGERBAL>[\s\S]*?<\/LEDGERBAL>/i)?.[0] || ''
    return {
        formato: 'ofx',
        linhas,
        ignoradas,
        saldo_final: bal ? parseValorBR(bal.match(/<BALAMT>([^<\r\n]*)/i)?.[1] || '') : null,
        data_saldo: bal ? parseDataBR(bal.match(/<DTASOF>([^<\r\n]*)/i)?.[1] || '') : null,
    }
}

/* ------------------------------------------------------- CSV / texto colado */

function separaCampos(linha: string, delim: string): string[] {
    const out: string[] = []
    let atual = '', aspas = false
    for (let i = 0; i < linha.length; i++) {
        const c = linha[i]
        if (c === '"') { aspas = !aspas; continue }
        if (c === delim && !aspas) { out.push(atual); atual = ''; continue }
        atual += c
    }
    out.push(atual)
    return out.map(s => s.trim())
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Não adianta "adivinhar" o delimitador contando colunas: em extrato pt-BR a
 * vírgula dos centavos ganha da ponto-e-vírgula na contagem. Então tentamos
 * cada candidato de verdade e ficamos com o que produziu mais lançamentos
 * válidos (empate → menos linhas ignoradas).
 */
function parseCsv(conteudo: string): ExtratoParseado {
    const tentativas = [';', '\t', ',', '|'].map(d => parseCsvComDelim(conteudo, d))
    return tentativas.reduce((melhor, atual) =>
        atual.linhas.length > melhor.linhas.length ||
        (atual.linhas.length === melhor.linhas.length && atual.ignoradas.length < melhor.ignoradas.length)
            ? atual : melhor)
}

function parseCsvComDelim(conteudo: string, delim: string): ExtratoParseado {
    const linhas: LinhaExtrato[] = []
    const ignoradas: Array<{ linha: string; motivo: string }> = []

    const cruas = conteudo.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (!cruas.length) return { formato: 'csv', linhas, ignoradas, saldo_final: null, data_saldo: null }

    // Cabeçalho: procura nas primeiras linhas uma que nomeie data e valor.
    // Extratos de banco costumam ter 3-8 linhas de miolo (agência, conta,
    // período) antes da tabela de verdade.
    let idxCabecalho = -1
    let col = { data: -1, doc: -1, hist: -1, valor: -1, saldo: -1, tipo: -1 }
    for (let i = 0; i < Math.min(cruas.length, 15); i++) {
        const campos = separaCampos(cruas[i], delim).map(semAcento)
        const achar = (...alvos: string[]) => campos.findIndex(c => alvos.some(a => c === a || c.includes(a)))
        const d = achar('data', 'dt movimento', 'dt.')
        const v = achar('valor', 'montante')
        if (d >= 0 && v >= 0) {
            idxCabecalho = i
            col = {
                data: d,
                doc: achar('documento', 'doc', 'nr. doc'),
                hist: achar('historico', 'descricao', 'lancamento', 'memo'),
                valor: v,
                saldo: achar('saldo'),
                tipo: achar('tipo', 'd/c', 'debito/credito', 'natureza'),
            }
            break
        }
    }

    const corpo = idxCabecalho >= 0 ? cruas.slice(idxCabecalho + 1) : cruas
    const porDia = new Map<string, number>()   // ordem dentro do dia → dedup estável

    for (const bruta of corpo) {
        const campos = separaCampos(bruta, delim)
        if (campos.length < 2) { ignoradas.push({ linha: bruta.slice(0, 120), motivo: 'linha sem colunas suficientes' }); continue }

        // Sem cabeçalho reconhecido, cai no palpite posicional: a 1ª coluna que
        // vira data é a data.
        const data = parseDataBR(col.data >= 0 ? campos[col.data] : (campos.find(c => parseDataBR(c)) || ''))
        if (!data) { ignoradas.push({ linha: bruta.slice(0, 120), motivo: 'sem data reconhecível (cabeçalho? rodapé?)' }); continue }

        let valor: number | null = null
        if (col.valor >= 0) valor = parseValorBR(campos[col.valor])
        else {
            // Layout mais comum sem cabeçalho é "...;valor;saldo": com dois ou
            // mais números na linha, o último é saldo e o penúltimo é o valor.
            const numericos = campos.map(parseValorBR).filter((n): n is number => n !== null && n !== 0)
            valor = numericos.length >= 2 ? numericos[numericos.length - 2] : (numericos[0] ?? null)
        }
        if (valor === null) { ignoradas.push({ linha: bruta.slice(0, 120), motivo: 'sem valor reconhecível' }); continue }
        if (valor === 0) { ignoradas.push({ linha: bruta.slice(0, 120), motivo: 'valor zero' }); continue }

        // coluna D/C separada manda no sinal quando existe
        if (col.tipo >= 0) {
            const t = semAcento(campos[col.tipo])
            if (/^d|debito|saida|pag/.test(t)) valor = -Math.abs(valor)
            else if (/^c|credito|entrada|receb/.test(t)) valor = Math.abs(valor)
        }

        const historico = normalizaTexto(col.hist >= 0 ? campos[col.hist] : campos.filter(c => !parseDataBR(c) && parseValorBR(c) === null).join(' ')) || 'Lançamento'
        const documento = normalizaTexto(col.doc >= 0 ? campos[col.doc] : '')
        const saldo = col.saldo >= 0 ? parseValorBR(campos[col.saldo]) : null

        const seq = (porDia.get(data) ?? 0) + 1
        porDia.set(data, seq)

        linhas.push({
            data,
            descricao: historico,
            valor: Math.abs(valor),
            tipo: valor >= 0 ? 'entrada' : 'saida',
            documento,
            // CSV não traz id do lançamento: a chave é o conteúdo + a ordem no
            // dia, o que torna reimportar o mesmo arquivo idempotente e ainda
            // permite dois lançamentos idênticos no mesmo dia (seq diferente).
            import_key: `csv:${chave([data, String(valor), historico, documento, String(seq)])}`,
            saldo_apos: saldo,
        })
    }

    const ultimaComSaldo = [...linhas].reverse().find(l => l.saldo_apos !== null)
    return {
        formato: 'csv',
        linhas,
        ignoradas,
        saldo_final: ultimaComSaldo?.saldo_apos ?? null,
        data_saldo: ultimaComSaldo?.data ?? null,
    }
}

/* ---------------------------------------------------------------- público -- */

export function parseExtrato(conteudo: string): ExtratoParseado {
    const ehOfx = /<OFX>|<STMTTRN>|OFXHEADER/i.test(conteudo)
    const r = ehOfx ? parseOfx(conteudo) : parseCsv(conteudo)
    // extrato costuma vir do mais novo pro mais velho; grava em ordem cronológica
    r.linhas.sort((a, b) => a.data.localeCompare(b.data))
    return r
}
