/**
 * Converte o PDF de extrato do Sicredi (internet banking, conta 53609-7) no
 * CSV que o importador do ERP entende (ERP › Conciliação › Importar extrato,
 * ou scripts/importa-extrato.mts --conta sicredi).
 *
 * Par do scripts/sicoob-pdf-para-csv.mjs. NÃO é script-por-período: recebe
 * qualquer PDF do mesmo layout e sai um CSV genérico.
 *
 * Uso: node scripts/sicredi-pdf-para-csv.mjs <extrato.pdf> [saida.csv] [--desde AAAA-MM-DD]
 *   --desde  emite só os lançamentos a partir da data (a validação por saldo
 *            continua sendo feita no extrato inteiro). Serve quando o começo do
 *            período já está no ERP em outra forma (ex.: resgates agregados).
 * Requer `pdftotext` (poppler) no PATH.
 *
 * O layout é tabular e cada linha traz o SALDO após o lançamento: a validação
 * é linha a linha a partir do SALDO ANTERIOR — divergiu, sai com erro.
 * O rodapé traz "Saldo Atual" (conta corrente) e "Saldo de investimentos com
 * resgate automático" (a aplicação): os dois são impressos para conferência.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const NUM = '-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}'
const LINHA = new RegExp(`^(\\d{2}/\\d{2}/\\d{4}) (.*?) (${NUM}) (${NUM})$`)
const DOCUMENTO = /^(PIX_DEB|PIX_CRED|CAPTACAO|TED|DOC|\d+)$/
const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const num = (s) => Number(s.replace(/\./g, '').replace(',', '.'))
const iso = (d) => d.split('/').reverse().join('-')

export function parseSicrediTexto(txt) {
    const linhas = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const periodo = linhas.find((l) => /^Extrato \(Per/.test(l)) || ''
    const per = periodo.match(/(\d{2}\/\d{2}\/\d{4}) a (\d{2}\/\d{2}\/\d{4})/)
    if (!per) throw new Error('nao achei o periodo no cabecalho (linha "Extrato (Período de ...)")')

    const ant = linhas.find((l) => /^SALDO ANTERIOR/.test(l))
    if (!ant) throw new Error('extrato sem SALDO ANTERIOR - nao da pra validar')
    const saldoAnterior = num(ant.replace(/^SALDO ANTERIOR\s*/, ''))

    const lancamentos = []
    for (const l of linhas) {
        const m = l.match(LINHA)
        if (!m) continue
        let historico = m[2].trim()
        let documento = ''
        const partes = historico.split(' ')
        if (partes.length > 1 && DOCUMENTO.test(partes[partes.length - 1])) { documento = partes.pop(); historico = partes.join(' ') }
        lancamentos.push({ data: iso(m[1]), historico, documento, valor: num(m[3]), saldo: num(m[4]) })
    }

    const rodape = (rot) => { const l = linhas.find((x) => x.startsWith(rot)); const v = l && l.match(/(-?)R\$ ?(\d{1,3}(?:\.\d{3})*,\d{2})/); return v ? (v[1] === '-' ? -1 : 1) * num(v[2]) : null }
    return {
        periodo: { de: iso(per[1]), ate: iso(per[2]) },
        saldoAnterior, lancamentos,
        saldoAtualCC: rodape('Saldo Atual'),
        saldoInvestimentos: rodape('Saldo de investimentos com resgate autom'),
    }
}

/** Reconstroi o saldo linha a linha e confronta com a coluna Saldo do extrato. */
export function validaPorSaldo({ saldoAnterior, lancamentos, saldoAtualCC }) {
    let corrente = saldoAnterior
    const erros = []
    for (const l of lancamentos) {
        corrente = Math.round((corrente + l.valor) * 100) / 100
        if (Math.round(Math.abs(corrente - l.saldo) * 100) > 0)
            erros.push(`${l.data} ${brl(l.valor)} ${l.historico}: calculado ${brl(corrente)} != extrato ${brl(l.saldo)}`)
    }
    if (saldoAtualCC !== null && Math.round(Math.abs(corrente - saldoAtualCC) * 100) > 0)
        erros.push(`saldo final calculado ${brl(corrente)} != "Saldo Atual" do rodape ${brl(saldoAtualCC)}`)
    return { erros, saldoFinal: corrente }
}

export function paraCsv({ lancamentos }, desde = null) {
    const sel = desde ? lancamentos.filter((l) => l.data >= desde) : lancamentos
    const linhas = ['DATA;DOCUMENTO;HISTORICO;VALOR;SALDO']
    for (const l of sel) linhas.push([
        l.data.split('-').reverse().join('/'),
        l.documento.replace(/;/g, ','),
        l.historico.replace(/;/g, ','),
        l.valor.toFixed(2).replace('.', ','),
        l.saldo.toFixed(2).replace('.', ','),
    ].join(';'))
    return { csv: linhas.join('\n') + '\n', emitidos: sel.length }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2)
    const desde = args.includes('--desde') ? args[args.indexOf('--desde') + 1] : null
    const posicionais = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--desde')
    const [pdf, saida] = posicionais
    if (!pdf) { console.error('uso: node scripts/sicredi-pdf-para-csv.mjs <extrato.pdf> [saida.csv] [--desde AAAA-MM-DD]'); process.exit(1) }
    const txt = execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', pdf, '-'], { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 })
    const parsed = parseSicrediTexto(txt)
    const { erros, saldoFinal } = validaPorSaldo(parsed)
    console.log(`Periodo: ${parsed.periodo.de} a ${parsed.periodo.ate}  |  lancamentos: ${parsed.lancamentos.length}`)
    console.log(`Saldo anterior: ${brl(parsed.saldoAnterior)}  ->  saldo final calculado: ${brl(saldoFinal)}`)
    console.log(`Rodape: Saldo Atual (CC) ${parsed.saldoAtualCC === null ? '?' : brl(parsed.saldoAtualCC)}  |  investimentos ${parsed.saldoInvestimentos === null ? '?' : brl(parsed.saldoInvestimentos)}`)
    if (erros.length) { console.error('\nVALIDACAO POR SALDO FALHOU:'); for (const e of erros) console.error('  ' + e); process.exit(2) }
    console.log('Validacao por saldo: OK (todas as linhas batem com o extrato)')
    const { csv, emitidos } = paraCsv(parsed, desde)
    if (desde) console.log(`Emitindo so a partir de ${desde}: ${emitidos} de ${parsed.lancamentos.length}`)
    if (saida) { writeFileSync(saida, csv, 'utf-8'); console.log(`CSV: ${saida}`) }
    else process.stdout.write('\n' + csv)
}
