// Gera o relatório XLSX de Contas a Pagar + Pagamentos (validação financeiro 06/07/2026)
// Fonte: scripts/_tmp-relatorio-cp.json (coletado do Supabase pelo _tmp-relatorio-cp.mjs)
// Saída: Área de trabalho do usuário.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const d = JSON.parse(readFileSync(join(root, 'scripts', '_tmp-relatorio-cp.json'), 'utf-8'))
const OUT = 'C:/Users/Notebook-Acer/Desktop/Relatorio-Financeiro-ContasAPagar-Bula-2026-07-06.xlsx'
const HOJE = '2026-07-06'

const r2 = (n) => Math.round(Number(n) * 100) / 100
const sum = (arr, f = (x) => x.valor) => r2(arr.reduce((s, x) => s + Number(f(x) || 0), 0))
const diasAtraso = (venc) => Math.max(0, Math.round((new Date(HOJE) - new Date(venc)) / 86400000))

const abertas = d.cps.filter((c) => ['aberto', 'vencido', 'parcial'].includes(c.status))
const vencidas = d.cps.filter((c) => c.status === 'vencido')
const pagas = d.cps.filter((c) => c.status === 'pago')
const impostos = d.cps.filter((c) => c.cat === 'Imposto sobre Receita (18%)')
const movsSaida = d.movsSaida

// ───────────────────────── helpers de aba ─────────────────────────
const wb = XLSX.utils.book_new()
function addSheet(nome, rows, colWidths) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  if (colWidths) ws['!cols'] = colWidths.map((w) => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws, nome)
  return ws
}

// ───────────────────────── 1. RESUMO ─────────────────────────
const porCatAberto = {}
for (const c of abertas) { porCatAberto[c.cat] = porCatAberto[c.cat] || { n: 0, v: 0 }; porCatAberto[c.cat].n++; porCatAberto[c.cat].v = r2(porCatAberto[c.cat].v + c.valor) }
const porMesVenc = {}
for (const c of abertas) { const m = c.venc.slice(0, 7); porMesVenc[m] = porMesVenc[m] || { n: 0, v: 0 }; porMesVenc[m].n++; porMesVenc[m].v = r2(porMesVenc[m].v + c.valor) }
const saidasVinculadas = movsSaida.filter((m) => m.cpId)

const resumo = [
  ['RELATÓRIO FINANCEIRO — CONTAS A PAGAR & PAGAMENTOS', '', '', ''],
  [`Bula Assessoria Pecuária LTDA · gerado em 06/07/2026 · fonte: ERP (Supabase) conciliado com extratos Sicoob/Sicredi`],
  [],
  ['VISÃO GERAL', 'Qtde', 'Valor (R$)', 'Obs'],
  ['CPs VENCIDAS (não pagas)', vencidas.length, sum(vencidas), 'inclui provisões de imposto e despesas de leilões antigos'],
  ['CPs ABERTAS (a vencer)', abertas.length - vencidas.length, r2(sum(abertas) - sum(vencidas)), 'vencimentos futuros (comissões jun em 25/07 etc.)'],
  ['TOTAL EM ABERTO', abertas.length, sum(abertas), ''],
  ['CPs PAGAS (registradas no ERP)', pagas.length, sum(pagas, (c) => c.pago || c.valor), 'ver aba "Pagas"'],
  [],
  ['⚠ QUESTÃO MONTANTE × INDIVIDUAL', '', '', ''],
  ['Saídas no extrato (jan–jul)', movsSaida.length, sum(movsSaida), 'todo o dinheiro que saiu do banco'],
  ['Saídas COM CP vinculada', saidasVinculadas.length, sum(saidasVinculadas), 'só isso está amarrado título↔banco'],
  ['Saídas SEM CP vinculada', movsSaida.length - saidasVinculadas.length, r2(sum(movsSaida) - sum(saidasVinculadas)), 'pagamentos em montante/ref-mês, despesas sem título, transferências'],
  ['→ Leitura', '', '', 'As CPs são LANÇADAS individualmente (por leilão/pessoa) mas o PAGAMENTO sai em montante mensal. Por isso há CPs individuais "vencidas" cujo valor JÁ SAIU do caixa dentro de um Pix maior. Ver aba "Montante × CPs".'],
  [],
  ['⚠ IMPOSTOS (provisão 18% sobre receita)', '', '', ''],
  ['Guias de imposto provisionadas em aberto', impostos.filter((c) => c.status !== 'pago').length, sum(impostos.filter((c) => c.status !== 'pago')), 'ver aba "Impostos 18%"'],
  ['Guias de imposto pagas', impostos.filter((c) => c.status === 'pago').length, sum(impostos.filter((c) => c.status === 'pago'), (c) => c.pago || c.valor), ''],
  ['→ Leitura', '', '', 'O ERP provisiona 18% por leilão (fechamento a fechamento), mas o recolhimento real é por guia mensal (DAS/DARF sobre o faturamento do mês). Nenhum pagamento de DAS aparece no extrato Sicoob — ou sai do Sicredi, ou está acumulando passivo. VALIDAR COM O CONTADOR.'],
  [],
  ['EM ABERTO POR CATEGORIA', 'Qtde', 'Valor (R$)'],
  ...Object.entries(porCatAberto).sort((a, b) => b[1].v - a[1].v).map(([k, x]) => [k, x.n, x.v]),
  [],
  ['EM ABERTO POR MÊS DE VENCIMENTO', 'Qtde', 'Valor (R$)'],
  ...Object.entries(porMesVenc).sort().map(([k, x]) => [k, x.n, x.v]),
]
addSheet('Resumo', resumo, [46, 10, 16, 90])

// ───────────────────────── 2. ABERTAS & VENCIDAS ─────────────────────────
const abertasRows = [
  ['Vencimento', 'Dias atraso', 'Status', 'Valor (R$)', 'Categoria', 'Fornecedor', 'Descrição', 'Documento'],
  ...abertas.sort((a, b) => a.venc.localeCompare(b.venc)).map((c) => [
    c.venc, c.status === 'vencido' ? diasAtraso(c.venc) : '', c.status, c.valor, c.cat, c.forn, c.desc, c.doc,
  ]),
  [],
  ['TOTAL', '', '', sum(abertas)],
]
addSheet('Abertas e Vencidas', abertasRows, [12, 10, 9, 13, 26, 26, 70, 38])

// ───────────────────────── 3. IMPOSTOS 18% ─────────────────────────
const impMes = {}
for (const c of impostos) { const m = c.venc.slice(0, 7); impMes[m] = impMes[m] || { n: 0, v: 0 }; impMes[m].n++; impMes[m].v = r2(impMes[m].v + c.valor) }
const impostosRows = [
  ['PROVISÃO DE IMPOSTO 18% SOBRE RECEITA — POR LEILÃO'],
  ['A provisão é criada por fechamento de leilão. O recolhimento real é mensal (guia). Use a coluna "Competência" p/ casar com a guia do mês.'],
  [],
  ['Competência (venc)', 'Status', 'Valor (R$)', 'Leilão / Descrição'],
  ...impostos.sort((a, b) => a.venc.localeCompare(b.venc)).map((c) => [c.venc, c.status, c.valor, c.desc]),
  [],
  ['SUBTOTAL POR MÊS', '', '', ''],
  ...Object.entries(impMes).sort().map(([m, x]) => [m, `${x.n} guias`, x.v, '']),
  [],
  ['TOTAL PROVISIONADO EM ABERTO', '', sum(impostos.filter((c) => c.status !== 'pago')), ''],
]
addSheet('Impostos 18%', impostosRows, [16, 10, 14, 80])

// ───────────────────────── 4. PAGAS ─────────────────────────
const pagasRows = [
  ['Data pagto', 'Venc.', 'Valor pago (R$)', 'Categoria', 'Fornecedor', 'Descrição', 'Amarrada ao extrato?'],
  ...pagas.sort((a, b) => String(a.dtPag).localeCompare(String(b.dtPag))).map((c) => {
    const mov = movsSaida.find((m) => m.cpId === c.id)
    return [c.dtPag || '—', c.venc, c.pago || c.valor, c.cat, c.forn, c.desc, mov ? `SIM (${mov.data})` : 'NÃO — sem movimento vinculado']
  }),
  [],
  ['TOTAL', '', sum(pagas, (c) => c.pago || c.valor)],
]
addSheet('Pagas', pagasRows, [12, 12, 15, 26, 26, 66, 26])

// ───────────────────────── 5. SAÍDAS DO EXTRATO ─────────────────────────
const saidasRows = [
  ['Data', 'Valor (R$)', 'Categoria', 'Conciliação', 'CP vinculada', 'Descrição'],
  ...movsSaida.sort((a, b) => a.data.localeCompare(b.data)).map((m) => {
    const cp = m.cpId ? d.cps.find((c) => c.id === m.cpId) : null
    return [m.data, m.valor, m.cat, m.conc, cp ? cp.desc.slice(0, 50) : '', m.desc]
  }),
  [],
  ['TOTAL', sum(movsSaida)],
]
addSheet('Saídas do Extrato', saidasRows, [12, 13, 26, 13, 52, 70])

// ───────────────────────── 6. MONTANTE × CPs ─────────────────────────
const CHAVES = [
  { nome: 'Fábio Omena / FO Assessoria', extrato: /fabio|59\.791\.094|FO ASSESSORIA/i, cp: /F[ÁA]BIO/i },
  { nome: 'Douglas Bispo / Bispo Agro', extrato: /douglas|bispo|50\.938\.748/i, cp: /DOUGLAS/i },
  { nome: 'Leonardo Serafim', extrato: /leonardo|serafim/i, cp: /LEONARDO|SERAFIM/i },
  { nome: 'RUSA Assessoria', extrato: /rusa/i, cp: /RUSA/i },
  { nome: 'Fórmula do Boi', extrato: /formula|65\.565\.807/i, cp: /FORMULA|F[ÓO]RMULA/i },
  { nome: 'Bulinha (Felipe Andrade)', extrato: /bulinha|felipe/i, cp: /BULINHA|FELIPE/i },
  { nome: 'Lucas Martins', extrato: /lucas\s*martins/i, cp: /LUCAS MARTINS/i },
  { nome: 'Marcelo Carneiro', extrato: /marcelo/i, cp: /MARCELO/i },
  { nome: 'Peralta', extrato: /peralta/i, cp: /PERALTA/i },
]
const montanteRows = [
  ['MONTANTE PAGO (extrato) × CPs INDIVIDUAIS — por fornecedor-chave'],
  ['Os pagamentos saem em Pix "ref. mês" enquanto as CPs são lançadas por leilão. Compare o total pago no extrato com o que consta pago/aberto em CPs.'],
  ['Identificação por nome/CNPJ na descrição do extrato — pagamentos sem memo não entram na conta do fornecedor.'],
  [],
  ['Fornecedor', 'Pago no extrato (R$)', 'movs', 'CPs pagas (R$)', 'CPs EM ABERTO (R$)', 'qtde abertas', 'Diferença extrato − (pagas+abertas)', 'Leitura'],
]
for (const k of CHAVES) {
  const movsK = movsSaida.filter((m) => k.extrato.test(m.desc))
  const cpsPagasK = pagas.filter((c) => k.cp.test(c.desc) || k.cp.test(c.forn))
  const cpsAbertasK = abertas.filter((c) => k.cp.test(c.desc) || k.cp.test(c.forn))
  const pagoExt = sum(movsK); const vPagas = sum(cpsPagasK, (c) => c.pago || c.valor); const vAbertas = sum(cpsAbertasK)
  const dif = r2(pagoExt - vPagas - vAbertas)
  montanteRows.push([k.nome, pagoExt, movsK.length, vPagas, vAbertas, cpsAbertasK.length,
    dif,
    dif > 0 ? 'saiu MAIS dinheiro do que há em títulos → conta-corrente do fornecedor (gado/adiantos misturados) ou títulos faltando'
      : dif < 0 ? 'há títulos além do que já saiu → parte das CPs abertas ainda vai ser paga (ou foi paga pelo Sicredi)'
        : 'fecha',
  ])
}
montanteRows.push([])
montanteRows.push(['⚠ Não casar 1:1 movimento × CP nesses casos: o extrato do assessor é conta-corrente (mistura comissão, folha, gado, reembolso).'])
montanteRows.push(['Sugestão de processo: 1 CP consolidada "ref. mês" por fornecedor OU baixa em lote das CPs individuais no valor do Pix montante.'])
addSheet('Montante x CPs', montanteRows, [30, 18, 7, 15, 17, 12, 26, 80])

// ───────────────────────── 7. PENDÊNCIAS DE VALIDAÇÃO ─────────────────────────
const pagasSemMov = pagas.filter((c) => !movsSaida.some((m) => m.cpId === c.id))
const vencTop = [...vencidas].sort((a, b) => b.valor - a.valor).slice(0, 15)
const pend = [
  ['PENDÊNCIAS PARA VALIDAR (ordem de prioridade)'],
  [],
  ['1. MAIORES CPs VENCIDAS — confirmar se já foram pagas em montante (Sicoob/Sicredi) e baixar, ou agendar pagamento'],
  ['Venc.', 'Dias', 'Valor (R$)', 'Descrição'],
  ...vencTop.map((c) => [c.venc, diasAtraso(c.venc), c.valor, c.desc]),
  [],
  ['2. IMPOSTOS — R$ ' + sum(impostos.filter((c) => c.status !== 'pago')).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' provisionados sem recolhimento visível no extrato Sicoob.'],
  ['   Validar com o contador: regime (Simples/presumido?), guias já recolhidas (de qual conta saem?) e se a provisão 18% está superestimada.'],
  [],
  ['3. CPs PAGAS SEM MOVIMENTO DE EXTRATO VINCULADO (baixadas "na mão") — conferir de onde saiu o dinheiro:'],
  ['Data pagto', '', 'Valor (R$)', 'Descrição'],
  ...pagasSemMov.map((c) => [c.dtPag || '—', '', c.pago || c.valor, c.desc]),
  [],
  ['4. CONTA SICREDI — referência de saldo é de 30/06 (-R$ 1.176,55). Boa parte das despesas de leilão/repasses antigos pode ter saído de lá. Importar extrato Sicredi de julho p/ fechar o ciclo.'],
  ['5. CARTÃO "A VENCER DIA 22/05" R$ 25.000 — vencida há 36 dias, sem identificação de fatura. Confirmar se é a fatura do cartão Sicoob (módulo Cartões) e baixar contra o débito da fatura.'],
  ['6. RUSA R$ 64.945 (comissão parceiro maio/junho) — extrato Sicoob mostra R$ 20.740 pagos em 29/06 ("comissões Rusa dos leilões Santa..."). Validar se abate parcialmente essa CP.'],
]
addSheet('Pendências', pend, [14, 8, 14, 100])

XLSX.writeFile(wb, OUT)
console.log('OK ->', OUT)
console.log(`Abas: Resumo | Abertas e Vencidas (${abertas.length}) | Impostos 18% (${impostos.length}) | Pagas (${pagas.length}) | Saídas do Extrato (${movsSaida.length}) | Montante x CPs | Pendências`)
