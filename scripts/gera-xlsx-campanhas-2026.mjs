/**
 * PLANILHA DAS CAMPANHAS META 2026 (XLSX) — os dados oficiais para filtrar.
 *
 *   node scripts/gera-xlsx-campanhas-2026.mjs [destino.xlsx]
 *
 * Abas:
 *   FUNIL DIGITAL   — as 13 campanhas do funil de cadastros, com totais.
 *   MENSAL          — investimento e leads por campanha por mês.
 *   PILOTO WHATSAPP — as 3 campanhas de abr–jun na conta Formula do Boi.
 *   DIVULGACAO      — as maiores campanhas de leilão da agência (fora do funil).
 *   REGIOES CA2     — investimento por estado.
 *   DICIONARIO      — escopos e a regra de qual número usar para quê.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { META_LIVE, INVESTIDO_APURADO, LEADS_META, FUNIL_WHATSAPP, DIVULGACAO_LEILOES } from './lib/midia-2026.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const destino = process.argv[2] || path.join(DIR, 'Campanhas-Meta-2026.xlsx')

const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
wb.created = new Date()

const PRETO = 'FF111111'
const estilo = ws => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
    ws.getRow(1).alignment = { vertical: 'middle' }
    ws.getRow(1).height = 22
    ws.views = [{ state: 'frozen', ySplit: 1 }]
}
const MOEDA = '#,##0.00" "'
const INT = '#,##0'

/* FUNIL DIGITAL */
{
    const ws = wb.addWorksheet('FUNIL DIGITAL')
    ws.columns = [
        { header: 'CAMPANHA', key: 'nome', width: 38 },
        { header: 'CONTA', key: 'conta', width: 8 },
        { header: 'OBJETIVO', key: 'obj', width: 16 },
        { header: 'STATUS', key: 'st', width: 10 },
        { header: 'INVESTIDO (R$)', key: 'inv', width: 15, style: { numFmt: MOEDA } },
        { header: 'IMPRESSOES', key: 'imp', width: 13, style: { numFmt: INT } },
        { header: 'ALCANCE', key: 'alc', width: 12, style: { numFmt: INT } },
        { header: 'CLIQUES', key: 'cli', width: 10, style: { numFmt: INT } },
        { header: 'LEADS (META)', key: 'lead', width: 12, style: { numFmt: INT } },
        { header: 'OBSERVACAO', key: 'obs', width: 55 },
    ]
    estilo(ws)
    for (const c of [...META_LIVE.campanhasFunil].sort((a, b) => b.total.investido - a.total.investido)) {
        ws.addRow({ nome: c.nome, conta: c.conta, obj: c.objetivo, st: c.status, inv: c.total.investido, imp: c.total.impressoes, alc: c.total.alcance || null, cli: c.total.cliques, lead: c.total.leadsMeta ?? null, obs: c.total.obsLeads || '' })
    }
    const ult = ws.rowCount
    const tot = ws.addRow({ nome: 'TOTAL FUNIL DIGITAL', inv: { formula: `SUM(E2:E${ult})` }, imp: { formula: `SUM(F2:F${ult})` }, cli: { formula: `SUM(H2:H${ult})` }, lead: { formula: `SUM(I2:I${ult})` } })
    tot.font = { bold: true }
}

/* MENSAL */
{
    const ws = wb.addWorksheet('MENSAL')
    ws.columns = [
        { header: 'MES', key: 'mes', width: 10 },
        { header: 'CAMPANHA', key: 'nome', width: 38 },
        { header: 'CONTA', key: 'conta', width: 8 },
        { header: 'INVESTIDO (R$)', key: 'inv', width: 15, style: { numFmt: MOEDA } },
        { header: 'IMPRESSOES', key: 'imp', width: 13, style: { numFmt: INT } },
        { header: 'CLIQUES', key: 'cli', width: 10, style: { numFmt: INT } },
        { header: 'LEADS (META)', key: 'lead', width: 12, style: { numFmt: INT } },
    ]
    estilo(ws)
    const linhas = []
    for (const c of [...META_LIVE.campanhasFunil, ...META_LIVE.campanhasFunilWhatsApp]) {
        for (const [m, v] of Object.entries(c.mensal)) {
            linhas.push({ mes: m, nome: c.nome, conta: c.conta, inv: v.investido, imp: v.impressoes ?? null, cli: v.cliques ?? null, lead: v.leadsMeta ?? null })
        }
    }
    linhas.sort((a, b) => a.mes.localeCompare(b.mes) || b.inv - a.inv)
    for (const l of linhas) ws.addRow(l)
}

/* PILOTO WHATSAPP */
{
    const ws = wb.addWorksheet('PILOTO WHATSAPP')
    ws.columns = [
        { header: 'CAMPANHA', key: 'nome', width: 32 },
        { header: 'INICIO', key: 'ini', width: 12 },
        { header: 'INVESTIDO (R$)', key: 'inv', width: 15, style: { numFmt: MOEDA } },
        { header: 'IMPRESSOES', key: 'imp', width: 13, style: { numFmt: INT } },
        { header: 'CLIQUES', key: 'cli', width: 10, style: { numFmt: INT } },
        { header: 'LEADS (META)', key: 'lead', width: 12, style: { numFmt: INT } },
        { header: 'OBSERVACAO', key: 'obs', width: 55 },
    ]
    estilo(ws)
    for (const c of META_LIVE.campanhasFunilWhatsApp) {
        ws.addRow({ nome: c.nome, ini: c.inicio, inv: c.total.investido, imp: c.total.impressoes, cli: c.total.cliques, lead: c.total.leadsMeta, obs: 'Lead caía direto no WhatsApp (piloto pré-planilha). Conta Formula do Boi.' })
    }
    for (const c of META_LIVE.campanhasAwareness) {
        ws.addRow({ nome: c.nome, ini: c.inicio, inv: c.total.investido, imp: c.total.impressoes, cli: c.total.cliques, lead: null, obs: 'Awareness (alcance), sem captação de lead.' })
    }
}

/* DIVULGACAO */
{
    const ws = wb.addWorksheet('DIVULGACAO LEILOES')
    ws.columns = [
        { header: 'CAMPANHA (CA1, fora do funil)', key: 'nome', width: 45 },
        { header: 'INVESTIDO (R$)', key: 'inv', width: 15, style: { numFmt: MOEDA } },
    ]
    estilo(ws)
    for (const c of DIVULGACAO_LEILOES.maiores) ws.addRow({ nome: c.nome, inv: c.investido })
    const tot = ws.addRow({ nome: `TOTAL das ${DIVULGACAO_LEILOES.qtdCampanhas} campanhas (incl. menores que as listadas)`, inv: DIVULGACAO_LEILOES.totalInvestido })
    tot.font = { bold: true }
}

/* REGIOES */
{
    const ws = wb.addWorksheet('REGIOES CA2')
    ws.columns = [
        { header: 'ESTADO', key: 'uf', width: 24 },
        { header: 'INVESTIDO (R$)', key: 'inv', width: 15, style: { numFmt: MOEDA } },
        { header: 'IMPRESSOES', key: 'imp', width: 13, style: { numFmt: INT } },
        { header: 'CLIQUES', key: 'cli', width: 10, style: { numFmt: INT } },
    ]
    estilo(ws)
    for (const r of META_LIVE.regioesCA2_2026) ws.addRow({ uf: r.regiao, inv: r.investido, imp: r.impressoes, cli: r.cliques })
}

/* DICIONARIO */
{
    const ws = wb.addWorksheet('DICIONARIO')
    ws.columns = [{ header: 'ESCOPO / REGRA', key: 'a', width: 30 }, { header: 'EXPLICACAO', key: 'b', width: 110 }]
    estilo(ws)
    ;[
        ['Fonte', 'Conector oficial Meta Ads MCP, extração ao vivo em 14/08/2026, janela 01/01–14/08/2026, contas CA1/CA2 (BM Bula 360) e Formula do Boi. Dump: outputs/base-clientes-2026/fontes/meta-live-2026-08-14.json.'],
        ['FUNIL DIGITAL', `As 13 campanhas cujos leads caem na planilha da Bula (CA2 inteira + Corte Perpétuo ×2 e Corte Tupã na CA1). Total R$ ${INVESTIDO_APURADO.toFixed(2)}. É ESTE o número que se divide por leads, MQL, cadastros e clientes.`],
        ['PILOTO WHATSAPP', `Abril–junho, conta Formula do Boi: R$ ${FUNIL_WHATSAPP.investido.toFixed(2)}, ${FUNIL_WHATSAPP.leadsMeta} leads direto no WhatsApp. Não entra no custo por lead da planilha.`],
        ['DIVULGACAO LEILOES', `R$ ${DIVULGACAO_LEILOES.totalInvestido.toFixed(2)} em ${DIVULGACAO_LEILOES.qtdCampanhas} campanhas da agência divulgando leilões/perfis — o lead vai para a leiloeira. NUNCA somar com o funil ao calcular custo de captação.`],
        ['LEADS (META)', `O que a própria Meta reporta (${LEADS_META} no funil). Campanhas de landing própria (PERPETUO TOURO/FEMEAS, JMP SITE) aparecem com 0–1 porque o formulário é nosso — a conversão real está na planilha de leads.`],
        ['16.500 do relatório interno', 'Era o retrato correto do funil em 02/08 (nossa apuração de snapshots dava 16.499,31). O oficial de 14/08 é maior porque as campanhas continuaram rodando.'],
    ].forEach(([a, b]) => ws.addRow({ a, b }))
    ws.getColumn('b').alignment = { wrapText: true, vertical: 'top' }
}

await wb.xlsx.writeFile(destino)
console.log('XLSX:', destino)
