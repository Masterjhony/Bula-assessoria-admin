/**
 * Converte o PDF de extrato do Sicoob (internet banking) no CSV que o
 * importador do ERP entende (ERP › Conciliação › Importar extrato).
 *
 * Existe porque o Sicoob só entrega PDF pela tela e o download do OFX é passo
 * manual — ver memória `erp-importador-extrato`. NÃO é script-por-período:
 * recebe qualquer PDF do mesmo layout e sai um CSV genérico.
 *
 * Uso: node scripts/sicoob-pdf-para-csv.mjs <extrato.pdf> [saida.csv]
 * Requer `pdftotext` (poppler) no PATH.
 *
 * Valida sozinho: reconstrói o saldo dia a dia a partir do SALDO ANTERIOR e
 * compara com o "SALDO DO DIA" que o próprio extrato imprime. Divergiu, sai
 * com erro — não adianta importar um extrato que não fecha.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const VALOR = /^(\d{1,3}(?:\.\d{3})*,\d{2})([DC*])?$/
const DATA = /^(\d{2}\/\d{2})\s+(.*)$/
const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const num = (s) => Number(s.replace(/\./g, '').replace(',', '.'))

export function parseSicoobTexto(txt) {
    const linhas = txt.split(/\r?\n/).map((l) => l.trim())
    const fim = linhas.findIndex((l) => l === 'RESUMO')
    const corpo = linhas.slice(0, fim > 0 ? fim : linhas.length).filter(Boolean)

    const periodo = corpo.find((l) => l.startsWith('PER')) || ''
    const ano = (periodo.match(/(\d{4})\s*$/) || periodo.match(/\/(\d{4})/) || [])[1]
    if (!ano) throw new Error('nao achei o ano no cabecalho (linha PERIODO:)')

    // Quebra em blocos: cada bloco comeca numa linha "DD/MM ..."
    const blocos = []
    for (const l of corpo) {
        const m = l.match(DATA)
        if (m) blocos.push({ dia: m[1], cabecalho: m[2], detalhes: [] })
        else if (blocos.length) blocos[blocos.length - 1].detalhes.push(l)
    }

    const lancamentos = []
    const saldosDia = new Map()
    let saldoAnterior = null

    for (const b of blocos) {
        // O valor pode vir colado no cabecalho ("... 550,00D"), no fim do
        // cabecalho com o D/C na linha seguinte, ou sozinho nas linhas de baixo.
        let valor = null
        let sinal = null
        let resto = b.cabecalho
        let consumidas = 0
        const mCab = b.cabecalho.match(/\s(\d{1,3}(?:\.\d{3})*,\d{2})([DC*])?$/)
        if (mCab) {
            valor = num(mCab[1])
            sinal = mCab[2] || null
            resto = b.cabecalho.slice(0, mCab.index).trim()
        }
        for (let i = 0; i < b.detalhes.length; i++) {
            const m = b.detalhes[i].match(VALOR)
            if (valor === null && m) { valor = num(m[1]); sinal = m[2] || null; consumidas = i + 1; continue }
            if (sinal === null && valor !== null && /^[DC*]$/.test(b.detalhes[i])) { sinal = b.detalhes[i]; consumidas = i + 1; continue }
            break
        }
        const detalhes = b.detalhes.slice(consumidas)
        const iso = `${ano}-${b.dia.slice(3, 5)}-${b.dia.slice(0, 2)}`

        if (/^SALDO ANTERIOR/.test(resto)) { saldoAnterior = { data: iso, valor: sinal === 'D' ? -valor : valor }; continue }
        if (/^SALDO BLOQ/.test(resto)) continue
        if (/^SALDO DO DIA/.test(resto)) { saldosDia.set(iso, sinal === 'D' ? -valor : valor); continue }
        if (valor === null) throw new Error(`bloco sem valor: ${b.dia} ${b.cabecalho}`)
        if (!sinal) throw new Error(`bloco sem D/C: ${b.dia} ${b.cabecalho}`)

        // O PDF quebra a linha em ~40 colunas; religa o que foi partido no meio
        // da palavra ("expogenetic"+"a") em vez de deixar lixo na descricao.
        let doc = ''
        const partes = []
        for (const d of detalhes) {
            if (d.startsWith('DOC.:')) { doc = d.slice(5).trim(); continue }
            if (partes.length && partes[partes.length - 1].length >= 38) partes[partes.length - 1] += d
            else partes.push(d)
        }
        lancamentos.push({
            data: iso,
            historico: [resto, ...partes].join(' - ').replace(/\s+/g, ' ').trim(),
            documento: doc,
            valor: sinal === 'D' ? -valor : valor,
        })
    }

    return { ano, saldoAnterior, saldosDia, lancamentos }
}

/** Reconstroi o saldo dia a dia e confronta com o SALDO DO DIA impresso. */
export function validaPorSaldo({ saldoAnterior, saldosDia, lancamentos }) {
    if (!saldoAnterior) throw new Error('extrato sem SALDO ANTERIOR - nao da pra validar')
    const dias = [...new Set(lancamentos.map((l) => l.data))].sort()
    let corrente = saldoAnterior.valor
    const erros = []
    for (const dia of dias) {
        corrente += lancamentos.filter((l) => l.data === dia).reduce((s, l) => s + l.valor, 0)
        corrente = Math.round(corrente * 100) / 100
        const impresso = saldosDia.get(dia)
        if (impresso === undefined) { erros.push(`${dia}: extrato nao imprimiu SALDO DO DIA`); continue }
        if (Math.round(Math.abs(corrente - impresso) * 100) > 0) {
            erros.push(`${dia}: calculado ${brl(corrente)} != extrato ${brl(impresso)} (dif ${brl(corrente - impresso)})`)
        }
    }
    return { erros, saldoFinal: corrente, dias }
}

export function paraCsv({ lancamentos, saldosDia }) {
    const ultimoDoDia = new Map()
    for (const l of lancamentos) ultimoDoDia.set(l.data, l)
    const linhas = ['DATA;DOCUMENTO;HISTORICO;VALOR;SALDO']
    for (const l of [...lancamentos].sort((a, b) => a.data.localeCompare(b.data))) {
        const saldo = ultimoDoDia.get(l.data) === l ? (saldosDia.get(l.data) ?? '') : ''
        linhas.push([
            l.data.split('-').reverse().join('/'),
            l.documento.replace(/;/g, ','),
            l.historico.replace(/;/g, ','),
            l.valor.toFixed(2).replace('.', ','),
            saldo === '' ? '' : Number(saldo).toFixed(2).replace('.', ','),
        ].join(';'))
    }
    return linhas.join('\n') + '\n'
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const pdf = process.argv[2]
    if (!pdf) { console.error('uso: node scripts/sicoob-pdf-para-csv.mjs <extrato.pdf> [saida.csv]'); process.exit(1) }
    const txt = execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', pdf, '-'], { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 })
    const parsed = parseSicoobTexto(txt)
    const { erros, saldoFinal, dias } = validaPorSaldo(parsed)
    console.log(`Lancamentos: ${parsed.lancamentos.length} em ${dias.length} dia(s)`)
    console.log(`Saldo anterior (${parsed.saldoAnterior.data}): ${brl(parsed.saldoAnterior.valor)}`)
    console.log(`Saldo final calculado: ${brl(saldoFinal)}`)
    if (erros.length) { console.error('\nVALIDACAO POR SALDO FALHOU:'); for (const e of erros) console.error('  ' + e); process.exit(2) }
    console.log('Validacao por saldo: OK (todos os dias batem com o extrato)')
    const saida = process.argv[3]
    const csv = paraCsv(parsed)
    if (saida) { writeFileSync(saida, csv, 'utf-8'); console.log(`CSV: ${saida}`) }
    else process.stdout.write('\n' + csv)
}
