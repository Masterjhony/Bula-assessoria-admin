/**
 * PLANILHA DA BASE DE CLIENTES 2026 (XLSX) — o entregável operacional.
 *
 *   node scripts/gera-xlsx-base-clientes-2026.mjs
 *
 * Abas:
 *   BASE DE CLIENTES  — uma linha por comprador, com as colunas que a diretoria
 *                       pediu (nome, telefone, e-mail, CPF, cidade/UF, score,
 *                       volume no período, categorias/preferências) + a coluna
 *                       de auditoria que diz de onde cada linha veio.
 *   COMPRAS           — o detalhe lote a lote, para conferir qualquer total.
 *   LEILÕES 2026      — o universo de 100 eventos e o VGV de cada um.
 *   A COMPLETAR       — só quem está sem CPF ou sem telefone: é a fila de
 *                       trabalho para fechar o cadastro.
 *   DICIONÁRIO        — o que cada coluna significa e de onde saiu.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base-clientes.json'), 'utf8'))
const leiloes = JSON.parse(fs.readFileSync(path.join(DIR, 'leiloes-2026.json'), 'utf8'))
const compras = JSON.parse(fs.readFileSync(path.join(DIR, 'compras-2026.json'), 'utf8'))

const destino = process.argv[2] || path.join(DIR, 'Base-Clientes-Bula-2026.xlsx')

const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
wb.created = new Date()

const PRETO = 'FF111111'
const cabecalho = (ws, larguras) => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
    ws.getRow(1).alignment = { vertical: 'middle' }
    ws.getRow(1).height = 22
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.columns.forEach((c, i) => { c.width = larguras[i] || 14 })
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }
}
const DINHEIRO = '"R$" #,##0.00'

/* ── aba 1: base de clientes ──────────────────────────────────────────────── */

const ws1 = wb.addWorksheet('BASE DE CLIENTES')
ws1.columns = [
    { header: 'NOME', key: 'nome' },
    { header: 'TELEFONE', key: 'telefone' },
    { header: 'E-MAIL', key: 'email' },
    { header: 'CPF/CNPJ', key: 'cpf' },
    { header: 'CIDADE', key: 'cidade' },
    { header: 'UF', key: 'uf' },
    { header: 'FAZENDA', key: 'fazenda' },
    { header: 'INSCRIÇÃO ESTADUAL', key: 'inscricaoEstadual' },
    { header: 'SCORE', key: 'score' },
    { header: 'FAIXA DO SCORE', key: 'scoreFaixa' },
    { header: 'VOLUME DE COMPRA 2026', key: 'volumeCompra' },
    { header: 'LOTES', key: 'lotes' },
    { header: 'ANIMAIS', key: 'animais' },
    { header: 'LEILÕES', key: 'leiloes' },
    { header: 'TICKET MÉDIO POR LOTE', key: 'ticketMedio' },
    { header: '1ª COMPRA', key: 'primeiraCompra' },
    { header: 'ÚLTIMA COMPRA', key: 'ultimaCompra' },
    { header: 'RECORRENTE', key: 'recorrente' },
    { header: 'CATEGORIAS COMPRADAS', key: 'categorias' },
    { header: 'INTERESSE DECLARADO', key: 'interesseDeclarado' },
    { header: 'MOMENTO NA PECUÁRIA', key: 'momentoPecuaria' },
    { header: 'REBANHO DECLARADO', key: 'rebanhoDeclarado' },
    { header: 'ASSESSOR', key: 'assessor' },
    { header: 'ORIGEM DO LEAD', key: 'origemLead' },
    { header: 'CLASSE DA ORIGEM', key: 'origemClasse' },
    { header: 'CAMPANHA', key: 'campanha' },
    { header: 'ENTRADA DO LEAD', key: 'dataEntradaLead' },
    { header: 'COMPRA APÓS O LEAD?', key: 'atribuivelCampanha' },
    { header: 'CADASTRO EM LEILOEIRA', key: 'cadastroLeiloeira' },
    { header: 'ABORDADO NO WHATSAPP', key: 'abordadoWhatsapp' },
    { header: 'RESPONDEU', key: 'respondeuWhatsapp' },
    { header: 'FONTE DA COMPRA', key: 'fonteCompra' },
    { header: 'FONTES DO CADASTRO', key: 'enriquecidoPor' },
    { header: 'OUTROS NOMES', key: 'nomesAlternativos' },
]
const simNao = v => v === true ? 'Sim' : v === false ? 'Não' : ''
for (const p of base) {
    ws1.addRow({
        ...p,
        recorrente: simNao(p.recorrente),
        atribuivelCampanha: simNao(p.atribuivelCampanha),
        abordadoWhatsapp: simNao(p.abordadoWhatsapp),
        respondeuWhatsapp: simNao(p.respondeuWhatsapp),
    })
}
cabecalho(ws1, [34, 16, 28, 17, 20, 5, 26, 19, 8, 13, 20, 7, 8, 8, 19, 11, 12, 12, 26, 20, 24, 17, 22, 30, 14, 30, 14, 17, 18, 18, 11, 24, 22, 30])
ws1.getColumn('volumeCompra').numFmt = DINHEIRO
ws1.getColumn('ticketMedio').numFmt = DINHEIRO
// Total no rodapé. O intervalo tem de ser fechado ANTES de criar a linha do
// total: usar ws.rowCount depois de escrever nela inclui a própria célula na
// soma e o Excel abre com erro de referência circular.
const ultima = ws1.rowCount
const fim = ultima + 1
ws1.getCell(`A${fim}`).value = `TOTAL — ${base.length} clientes`
ws1.getCell(`K${fim}`).value = { formula: `SUM(K2:K${ultima})` }
ws1.getCell(`K${fim}`).numFmt = DINHEIRO
ws1.getRow(fim).font = { bold: true }

/* ── aba 2: compras ───────────────────────────────────────────────────────── */

const ws2 = wb.addWorksheet('COMPRAS')
ws2.columns = [
    { header: 'CLIENTE', key: 'cliente' }, { header: 'DATA', key: 'data' },
    { header: 'LEILÃO', key: 'leilao' }, { header: 'LOTES', key: 'lotes' },
    { header: 'ANIMAIS', key: 'animais' }, { header: 'VALOR', key: 'valor' },
    { header: 'CATEGORIA', key: 'categorias' }, { header: 'ASSESSOR/PISTEIRO', key: 'assessor' },
    { header: 'FONTE', key: 'fonte' },
]
for (const c of compras) ws2.addRow({ ...c, categorias: (c.categorias || []).join(', ') })
cabecalho(ws2, [34, 11, 52, 7, 8, 16, 20, 26, 18])
ws2.getColumn('valor').numFmt = DINHEIRO

/* ── aba 3: leilões ───────────────────────────────────────────────────────── */

const ws3 = wb.addWorksheet('LEILÕES 2026')
ws3.columns = [
    { header: 'DATA', key: 'data' }, { header: 'LEILÃO', key: 'nome' },
    { header: 'UF', key: 'uf' }, { header: 'LOTES', key: 'lotes' },
    { header: 'VGV COBERTURA BULA', key: 'vgv' }, { header: 'FONTE', key: 'fonte' },
]
for (const l of leiloes) ws3.addRow(l)
cabecalho(ws3, [11, 58, 5, 7, 21, 14])
ws3.getColumn('vgv').numFmt = DINHEIRO
const ultima3 = ws3.rowCount
const f3 = ultima3 + 1
ws3.getCell(`A${f3}`).value = `TOTAL — ${leiloes.length} leilões`
ws3.getCell(`E${f3}`).value = { formula: `SUM(E2:E${ultima3})` }
ws3.getCell(`E${f3}`).numFmt = DINHEIRO
ws3.getRow(f3).font = { bold: true }

/* ── aba 4: fila de trabalho ──────────────────────────────────────────────── */

const faltando = base.filter(p => !p.cpf || !p.telefone)
    .sort((a, b) => b.volumeCompra - a.volumeCompra)
const ws4 = wb.addWorksheet('A COMPLETAR')
ws4.columns = [
    { header: 'NOME', key: 'nome' }, { header: 'FALTA', key: 'falta' },
    { header: 'VOLUME 2026', key: 'volumeCompra' }, { header: 'UF', key: 'uf' },
    { header: 'CIDADE', key: 'cidade' }, { header: 'FAZENDA', key: 'fazenda' },
    { header: 'TELEFONE', key: 'telefone' }, { header: 'CPF/CNPJ', key: 'cpf' },
    { header: 'ASSESSOR', key: 'assessor' }, { header: 'ÚLTIMA COMPRA', key: 'ultimaCompra' },
]
for (const p of faltando) {
    const falta = [!p.cpf && 'CPF', !p.telefone && 'telefone', !p.email && 'e-mail'].filter(Boolean).join(' + ')
    ws4.addRow({ ...p, falta })
}
cabecalho(ws4, [34, 24, 16, 5, 20, 26, 16, 17, 22, 13])
ws4.getColumn('volumeCompra').numFmt = DINHEIRO

/* ── aba 5: dicionário ────────────────────────────────────────────────────── */

const ws5 = wb.addWorksheet('DICIONÁRIO')
ws5.columns = [{ header: 'COLUNA', key: 'c' }, { header: 'O QUE É / DE ONDE VEM', key: 'd' }]
const dic = [
    ['NOME', 'Nome do comprador no ERP HastaPro (filial BULA ASSESSORIA). Entre parênteses, a razão social quando difere.'],
    ['TELEFONE / E-MAIL / CPF', 'Do ERP quando existe; senão do cadastro de clientes, do CRM, da planilha de leads ou das listas por assessor (Desktop/BASE CLIENTES). A coluna FONTES DO CADASTRO diz quais bases souberam.'],
    ['SCORE', 'Score de crédito consultado (clientes.score_credito / crm_leads.score_serasa). Vazio = nunca foi consultado para esta pessoa.'],
    ['VOLUME DE COMPRA 2026', 'Soma do que a pessoa arrematou em leilões com cobertura Bula em 2026, lote a lote. Lote dividido entre dois compradores entra rateado pelo percentual.'],
    ['LEILÕES', 'Em quantos eventos distintos comprou no ano. RECORRENTE = comprou em mais de um.'],
    ['CATEGORIAS COMPRADAS', 'Deduzida do nome do leilão (touros / matrizes / bezerras / embriões), porque o ERP não tipifica o lote.'],
    ['ORIGEM DO LEAD / CLASSE', 'Onde a pessoa aparece como lead. CLASSE separa "campanha" (anúncio ou landing) de "base-fria" (lista importada) — sem isso a mídia leva crédito por contato antigo.'],
    ['COMPRA APÓS O LEAD?', 'Sim só quando existe compra com data POSTERIOR à entrada do lead. É a única forma de a campanha reivindicar a venda.'],
    ['ABORDADO NO WHATSAPP / RESPONDEU', 'Métrica oficial da API Cloud (mesma regra do app, conferida contra a fatura da Meta).'],
    ['FONTE DA COMPRA', 'hastapro = ERP lote a lote; carteira = lançamento manual do assessor; podio-fechamento = pódio do fechamento (leilão que não entrou no ERP).'],
    ['OUTROS NOMES', 'Grafias alternativas encontradas para a mesma pessoa; ficam registradas para o merge poder ser conferido.'],
]
for (const [c, d] of dic) ws5.addRow({ c, d })
cabecalho(ws5, [30, 130])
ws5.getColumn('d').alignment = { wrapText: true, vertical: 'top' }

await wb.xlsx.writeFile(destino)
console.log('XLSX:', destino)
console.log('  clientes:', base.length, '| compras:', compras.length, '| leilões:', leiloes.length, '| a completar:', faltando.length)
