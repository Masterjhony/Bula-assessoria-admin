// Relatório de simulação das comissões de 27/07/2026 pelo critério antigo:
// pagar somente as comissões de leilões cuja receita da Bula foi recebida.
//
// Saídas:
//   outputs/analise-comissoes-criterio-recebimento-2026-07-27.html
//   outputs/analise-comissoes-criterio-recebimento-2026-07-27.pdf
//   Desktop/Analise Comissoes - Criterio de Recebimento - 27-07-2026.pdf
//
// Uso: node scripts/gera-relatorio-comissoes-criterio-recebimento-2026-07-27.mjs

import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'outputs')
const desktop = join(process.env.USERPROFILE || '', 'Desktop')

const brl = (value) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const pct = (value) => `${Number(value || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})}%`
const r2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const resumo = [
  { nome: 'Fábio Omena', original: 60645, elegivel: 12000 },
  { nome: 'Douglas Bispo', original: 28493, elegivel: 3420 },
  { nome: 'Gustavo Rusa', original: 23490, elegivel: 0 },
  { nome: 'Leonardo Serafim', original: 21788, elegivel: 7184 },
  { nome: 'Bulinha (Felipe Andrade)', original: 7392.53, elegivel: 0 },
  { nome: 'João Antônio', original: 2000, elegivel: 0 },
  { nome: 'Matheus Alves', original: 238.59, elegivel: 0 },
].map((row) => ({ ...row, reter: r2(row.original - row.elegivel) }))

const pagar = [
  { pessoa: 'Fábio Omena', data: '03/06', leilao: 'Destaques da Safra Nelore Cachoeirão', valor: 1008, evidencia: 'Recebido em 15/06; controle do ERP' },
  { pessoa: 'Fábio Omena', data: '06/06', leilao: '41º Touros Camparino', valor: 2793, evidencia: 'Recebido em 02/07; extrato vinculado' },
  { pessoa: 'Fábio Omena', data: '06/06', leilao: 'Matrizes Santa Nice', valor: 2475, evidencia: 'Recebido em 06/07; extrato vinculado' },
  { pessoa: 'Fábio Omena', data: '07/06', leilao: '9º Nelore Flor do Aratau', valor: 639, evidencia: 'Marcado recebido; sem vínculo bancário' },
  { pessoa: 'Fábio Omena', data: '07/06', leilao: '8º Jacamim Fêmeas', valor: 2196, evidencia: 'Recebido em 17/07; extrato vinculado' },
  { pessoa: 'Fábio Omena', data: '11/06', leilao: '3º Nelore Tresmar', valor: 900, evidencia: 'Recebido em 15/06; título ainda não vinculado ao fechamento' },
  { pessoa: 'Fábio Omena', data: '15/06', leilao: 'Seleção Nelore Floc', valor: 1989, evidencia: 'Recebido em 13/07; extrato vinculado' },

  { pessoa: 'Douglas Bispo', data: '03/06', leilao: 'Destaques da Safra Nelore Cachoeirão', valor: 1818, evidencia: 'Recebido em 15/06; controle do ERP' },
  { pessoa: 'Douglas Bispo', data: '07/06', leilao: '8º Jacamim Fêmeas', valor: 390, evidencia: 'Recebido em 17/07; extrato vinculado' },
  { pessoa: 'Douglas Bispo', data: '11/06', leilao: '3º Nelore Tresmar', valor: 600, evidencia: 'Recebido em 15/06; título ainda não vinculado ao fechamento' },
  { pessoa: 'Douglas Bispo', data: '15/06', leilao: 'Seleção Nelore Floc', valor: 612, evidencia: 'Recebido em 13/07; extrato vinculado' },

  { pessoa: 'Leonardo Serafim', data: '03/06', leilao: 'Destaques da Safra Nelore Cachoeirão', valor: 360, evidencia: 'Recebido em 15/06; controle do ERP' },
  { pessoa: 'Leonardo Serafim', data: '06/06', leilao: '41º Touros Camparino', valor: 392, evidencia: 'Recebido em 02/07; extrato vinculado' },
  { pessoa: 'Leonardo Serafim', data: '06/06', leilao: 'Matrizes Santa Nice', valor: 1890, evidencia: 'Recebido em 06/07; extrato vinculado' },
  { pessoa: 'Leonardo Serafim', data: '07/06', leilao: '8º Jacamim Fêmeas — venda 1', valor: 1032, evidencia: 'Recebido em 17/07; extrato vinculado' },
  { pessoa: 'Leonardo Serafim', data: '07/06', leilao: '8º Jacamim Fêmeas — venda 2', valor: 990, evidencia: 'Recebido em 17/07; extrato vinculado' },
  { pessoa: 'Leonardo Serafim', data: '11/06', leilao: '3º Nelore Tresmar', valor: 2520, evidencia: 'Recebido em 15/06; título ainda não vinculado ao fechamento' },
]

const reter = [
  { pessoa: 'Fábio Omena', leilao: '1º Nelore São Francisco', valor: 2100, motivo: 'Conta a receber cancelada: provisão sem lastro' },
  { pessoa: 'Fábio Omena', leilao: '10º Nelore JMP — Touros', valor: 39450, motivo: 'Receita em aberto; parcelas previstas para 14/08 e 13/09' },
  { pessoa: 'Fábio Omena', leilao: 'Touros Provados Terra Brava', valor: 1800, motivo: 'Conta a receber em aberto' },
  { pessoa: 'Fábio Omena', leilao: '8º Fazenda Rio Bonito', valor: 495, motivo: 'Conta a receber vencida, sem baixa' },
  { pessoa: 'Fábio Omena', leilao: 'Touros Matinha', valor: 3360, motivo: 'R$ 5.600 vinculados à venda do Fábio continuam em aberto' },
  { pessoa: 'Fábio Omena', leilao: 'Nelore Magda na Origem', valor: 1440, motivo: 'Sem título/baixa de recebimento vinculada' },

  { pessoa: 'Douglas Bispo', leilao: '10º Nelore JMP — Touros', valor: 4682, motivo: 'Receita em aberto' },
  { pessoa: 'Douglas Bispo', leilao: 'Touros Provados Terra Brava', valor: 1686, motivo: 'Conta a receber em aberto' },
  { pessoa: 'Douglas Bispo', leilao: 'Nelore Kriz Matrizes', valor: 5220, motivo: 'Conta a receber vencida, sem baixa' },
  { pessoa: 'Douglas Bispo', leilao: 'Matrizes KatiSpera', valor: 3300, motivo: 'Conta a receber em aberto' },
  { pessoa: 'Douglas Bispo', leilao: 'MEAB & Fazenda Modelo', valor: 10185, motivo: 'Conta a receber vencida, sem baixa' },

  { pessoa: 'Gustavo Rusa', leilao: 'Saldo de julho — 4 eventos/lotes', valor: 23490, motivo: 'Nenhum título ou baixa de recebimento vinculado aos eventos' },

  { pessoa: 'Leonardo Serafim', leilao: '10º Nelore JMP — Touros', valor: 8400, motivo: 'Receita em aberto' },
  { pessoa: 'Leonardo Serafim', leilao: 'Nelore Kriz Matrizes', valor: 2652, motivo: 'Conta a receber vencida, sem baixa' },
  { pessoa: 'Leonardo Serafim', leilao: 'MEAB & Fazenda Modelo', valor: 2292, motivo: 'Conta a receber vencida, sem baixa' },
  { pessoa: 'Leonardo Serafim', leilao: 'Nelore Magda na Origem', valor: 1260, motivo: 'Sem título/baixa de recebimento vinculada' },

  { pessoa: 'Bulinha (Felipe Andrade)', leilao: 'Líquido indicado no relatório original', valor: 7392.53, motivo: 'Comissões elegíveis não superam os gastos de cartão; pagar R$ 0' },
  { pessoa: 'João Antônio', leilao: 'Bônus do JMP — Touros', valor: 2000, motivo: 'Evento ainda não recebido' },
  { pessoa: 'Matheus Alves', leilao: '10º Nelore JMP — Touros', valor: 238.59, motivo: 'Evento ainda não recebido' },
]

const evidencias = [
  { leilao: 'Cachoeirão', situacao: 'Recebido', data: '15/06', valorReceita: 10914, banco: 'Não vinculado', nota: 'Há outro título cancelado de R$ 14.340; ele foi ignorado.' },
  { leilao: 'Camparino', situacao: 'Recebido', data: '02/07', valorReceita: 19401.22, banco: 'Sim', nota: 'Dois títulos recebidos.' },
  { leilao: 'Santa Nice', situacao: 'Recebido', data: '06/07', valorReceita: 19650, banco: 'Sim', nota: 'Baixa bancária vinculada.' },
  { leilao: 'Flor do Aratau', situacao: 'Recebido', data: '—', valorReceita: 11346, banco: 'Não vinculado', nota: 'Status recebido no controle; falta data/baixa bancária.' },
  { leilao: 'Jacamim Fêmeas', situacao: 'Recebido', data: '17/07', valorReceita: 12042, banco: 'Sim', nota: 'Baixa bancária vinculada.' },
  { leilao: 'Tresmar (11/06)', situacao: 'Recebido', data: '15/06', valorReceita: 12075, banco: 'Não vinculado', nota: 'Título recebido existe, mas está sem fechamento_id.' },
  { leilao: 'Floc', situacao: 'Recebido', data: '13/07', valorReceita: 7281, banco: 'Sim', nota: 'Baixa bancária vinculada.' },
]

const originalTotal = r2(resumo.reduce((sum, row) => sum + row.original, 0))
const elegivelTotal = r2(resumo.reduce((sum, row) => sum + row.elegivel, 0))
const reterTotal = r2(resumo.reduce((sum, row) => sum + row.reter, 0))
const pagarItensTotal = r2(pagar.reduce((sum, row) => sum + row.valor, 0))
const reterItensTotal = r2(reter.reduce((sum, row) => sum + row.valor, 0))
const creditoFabio = 10530
const desembolsoComCredito = r2(elegivelTotal - creditoFabio)
const somenteExtrato = 14759
const somenteExtratoComCredito = 5306

assert.equal(originalTotal, 144047.12)
assert.equal(elegivelTotal, 22604)
assert.equal(reterTotal, 121443.12)
assert.equal(pagarItensTotal, elegivelTotal)
assert.equal(reterItensTotal, reterTotal)
assert.equal(desembolsoComCredito, 12074)

const pessoasPagar = [...new Set(pagar.map((row) => row.pessoa))]
const blocosPagar = pessoasPagar.map((pessoa) => {
  const itens = pagar.filter((row) => row.pessoa === pessoa)
  const total = r2(itens.reduce((sum, row) => sum + row.valor, 0))
  return `
    <section class="person-block">
      <div class="person-head"><strong>${esc(pessoa)}</strong><strong>${brl(total)}</strong></div>
      <table class="detail">
        <thead><tr><th>Data</th><th>Leilão</th><th class="right">Comissão</th><th>Evidência do recebimento</th></tr></thead>
        <tbody>${itens.map((row) => `
          <tr>
            <td>${esc(row.data)}</td>
            <td>${esc(row.leilao)}</td>
            <td class="right money">${brl(row.valor)}</td>
            <td>${esc(row.evidencia)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>`
}).join('')

const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Análise de comissões — critério de recebimento</title>
  <style>
    @page { size: A4; margin: 11mm 10mm 13mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #151515; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 10.2px; line-height: 1.35; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #151515; padding-bottom: 10px; }
    .header.first-repeat { padding-top: 11mm; }
    .brand { font-size: 20px; font-weight: 800; letter-spacing: 2.6px; text-transform: uppercase; }
    .brand small { display: block; margin-top: 2px; color: #666; font-size: 8px; font-weight: 400; letter-spacing: 1.8px; }
    .meta { color: #555; font-size: 8.7px; line-height: 1.45; text-align: right; }
    .gold-rule { width: 64px; height: 3px; margin: 7px 0 13px; background: #c5a34c; }
    h1 { margin: 0; font-size: 17px; letter-spacing: 1.2px; text-transform: uppercase; }
    .subtitle { margin: 4px 0 13px; color: #555; font-size: 10px; }
    h2 { margin: 17px 0 7px; font-size: 12px; letter-spacing: .8px; text-transform: uppercase; }
    h3 { margin: 12px 0 6px; font-size: 10.5px; }
    .hero { display: grid; grid-template-columns: 1.15fr .85fr; gap: 10px; margin-top: 10px; }
    .hero-main { padding: 13px 15px; color: #fff; background: #151515; }
    .hero-main .label { color: #d9c17e; font-size: 8.5px; letter-spacing: 1.1px; text-transform: uppercase; }
    .hero-main .amount { margin-top: 3px; font-size: 27px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .hero-main .line { margin-top: 5px; color: #ddd; font-size: 9px; }
    .hero-side { padding: 11px 13px; border: 1px solid #cfcfcf; background: #fafafa; }
    .hero-side .small { color: #666; font-size: 8.5px; text-transform: uppercase; letter-spacing: .7px; }
    .hero-side .amount { margin: 2px 0 7px; font-size: 19px; font-weight: 800; }
    .callout { margin: 10px 0 0; padding: 8px 10px; border-left: 3px solid #c5a34c; background: #f8f5eb; }
    .callout strong { color: #55430e; }
    .note { color: #555; font-size: 9px; }
    .danger { border-left-color: #a7463f; background: #fbf2f1; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th { padding: 4px 5px; border-bottom: 1.5px solid #202020; color: #555; font-size: 8px; letter-spacing: .55px; text-align: left; text-transform: uppercase; }
    td { padding: 4px 5px; border-bottom: 1px solid #dedede; vertical-align: top; }
    .right { text-align: right; }
    .money { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .summary td { font-size: 10px; }
    .summary .total td { padding-top: 7px; border-top: 2px solid #151515; border-bottom: none; font-size: 11.5px; font-weight: 800; }
    .summary .pay { color: #315f29; font-weight: 700; }
    .summary .hold { color: #8b3f37; }
    .pill { display: inline-block; padding: 1px 5px; border-radius: 10px; background: #e8f1e5; color: #315f29; font-size: 8px; font-weight: 700; }
    .person-block { margin-top: 9px; break-inside: avoid; }
    .person-head { display: flex; justify-content: space-between; padding: 5px 7px; color: #fff; background: #222; letter-spacing: .4px; }
    .detail td:nth-child(1) { width: 44px; }
    .detail td:nth-child(3) { width: 78px; }
    .detail td:nth-child(4) { width: 205px; color: #555; font-size: 9px; }
    .page-break { break-before: page; }
    .hold-table td:nth-child(1) { width: 120px; }
    .hold-table td:nth-child(3) { width: 84px; }
    .hold-table td:nth-child(4) { color: #555; font-size: 9px; }
    .evidence td:nth-child(2), .evidence td:nth-child(3), .evidence td:nth-child(5) { white-space: nowrap; }
    .evidence td:nth-child(6) { color: #555; font-size: 9px; }
    .footer { margin-top: 17px; padding-top: 7px; border-top: 1px solid #bbb; color: #777; font-size: 8px; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">Bula Assessoria<small>Assessoria Pecuária</small></div>
    <div class="meta">Documento interno<br>Posição consultada em 23/07/2026<br>Pagamento previsto: 27/07/2026</div>
  </div>
  <div class="gold-rule"></div>
  <h1>Comissões pelo critério de recebimento</h1>
  <div class="subtitle">Simulação do modelo anterior: pagar somente comissões de leilões cuja receita da Bula já foi recebida.</div>

  <div class="hero">
    <div class="hero-main">
      <div class="label">Valor elegível pelo critério antigo</div>
      <div class="amount">${brl(elegivelTotal)}</div>
      <div class="line">15,7% do relatório original de ${brl(originalTotal)}</div>
    </div>
    <div class="hero-side">
      <div class="small">Se abater o crédito do Fábio</div>
      <div class="amount">${brl(desembolsoComCredito)}</div>
      <div class="note">Crédito documentado: ${brl(creditoFabio)}. Aplicar somente se o abatimento estiver aprovado.</div>
    </div>
  </div>

  <div class="callout">
    <strong>Conclusão:</strong> pelo critério antigo, pagar ${brl(elegivelTotal)} e reter ${brl(reterTotal)}.
    Com o crédito de ${brl(creditoFabio)} contra o Fábio, o desembolso em caixa seria ${brl(desembolsoComCredito)}.
  </div>

  <h2>Resumo por beneficiário</h2>
  <table class="summary">
    <thead><tr><th>Beneficiário</th><th class="right">Relatório original</th><th class="right">Pagar agora</th><th class="right">Reter</th><th class="right">% liberado</th></tr></thead>
    <tbody>
      ${resumo.map((row) => `
        <tr>
          <td>${esc(row.nome)}</td>
          <td class="right money">${brl(row.original)}</td>
          <td class="right money pay">${brl(row.elegivel)}</td>
          <td class="right money hold">${brl(row.reter)}</td>
          <td class="right">${pct(row.original ? row.elegivel / row.original * 100 : 0)}</td>
        </tr>`).join('')}
      <tr class="total">
        <td>Total</td>
        <td class="right money">${brl(originalTotal)}</td>
        <td class="right money pay">${brl(elegivelTotal)}</td>
        <td class="right money hold">${brl(reterTotal)}</td>
        <td class="right">15,7%</td>
      </tr>
    </tbody>
  </table>

  <h2>Decisão sugerida</h2>
  <div class="callout">
    <strong>1.</strong> Autorizar ${brl(elegivelTotal)} pelo critério operacional antigo; ou ${brl(desembolsoComCredito)} se o crédito do Fábio já estiver aprovado para abatimento.
  </div>
  <div class="callout">
    <strong>2.</strong> Manter ${brl(reterTotal)} em aberto até a respectiva receita entrar e ser baixada.
  </div>
  <div class="callout">
    <strong>3.</strong> Antes do pagamento, pedir comprovação de Cachoeirão, Flor do Aratau e Tresmar, que somam ${brl(7845)} de comissões liberadas no controle, mas ainda não têm baixa bancária vinculada.
  </div>

  <div class="page-break"></div>
  <div class="header first-repeat">
    <div class="brand">Bula Assessoria<small>Análise de comissões</small></div>
    <div class="meta">Critério de recebimento<br>Pagamento 27/07/2026</div>
  </div>
  <div class="gold-rule"></div>
  <h2>Comissões liberadas</h2>
  ${blocosPagar}

  <div class="page-break"></div>
  <div class="header">
    <div class="brand">Bula Assessoria<small>Análise de comissões</small></div>
    <div class="meta">Critério de recebimento<br>Pagamento 27/07/2026</div>
  </div>
  <div class="gold-rule"></div>
  <h2>Comissões retidas</h2>
  <table class="hold-table">
    <thead><tr><th>Beneficiário</th><th>Leilão / referência</th><th class="right">Valor</th><th>Motivo</th></tr></thead>
    <tbody>
      ${reter.map((row) => `
        <tr>
          <td>${esc(row.pessoa)}</td>
          <td>${esc(row.leilao)}</td>
          <td class="right money">${brl(row.valor)}</td>
          <td>${esc(row.motivo)}</td>
        </tr>`).join('')}
      <tr class="total">
        <td colspan="2"><strong>Total retido</strong></td>
        <td class="right money"><strong>${brl(reterTotal)}</strong></td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <h2>Casos especiais</h2>
  <div class="callout">
    <strong>Bulinha — pagar ${brl(0)}.</strong>
    Pelo recorte conservador, EAO, JEM e Jacamim geram ${brl(17150)} de comissões elegíveis.
    Contra ${brl(51479.47)} de cartão, sobra saldo negativo de ${brl(34329.47)} a compensar.
    Mesmo que o 4R parcialmente recebido fosse incluído por inteiro, o saldo continuaria negativo em ${brl(24123.47)}; portanto, o pagamento permanece zero.
  </div>
  <div class="callout">
    <strong>Fábio — crédito anterior de ${brl(creditoFabio)}.</strong>
    O ERP documenta comissão paga em dobro nos lotes 30/32/33 do 18º Mega Nelore, direcionados pelo Rusa.
    Sem o crédito, pagar ${brl(12000)}. Com o abatimento aprovado, pagar ${brl(1470)} ao Fábio.
  </div>
  <div class="callout">
    <strong>Matinha.</strong>
    O controle registra ${brl(1090)} já recebido de outra venda, mas os ${brl(5600)} ligados à venda do Fábio seguem em aberto.
    Por isso a comissão de ${brl(3360)} foi retida.
  </div>

  <h2>Evidências dos leilões liberados</h2>
  <table class="evidence">
    <thead><tr><th>Leilão</th><th>Situação</th><th>Recebido em</th><th class="right">Receita Bula</th><th>Extrato</th><th>Nota de controle</th></tr></thead>
    <tbody>${evidencias.map((row) => `
      <tr>
        <td>${esc(row.leilao)}</td>
        <td><span class="pill">${esc(row.situacao)}</span></td>
        <td>${esc(row.data)}</td>
        <td class="right money">${brl(row.valorReceita)}</td>
        <td>${esc(row.banco)}</td>
        <td>${esc(row.nota)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <h2>Cenário ainda mais conservador</h2>
  <div class="callout danger">
    Se “recebido” significar obrigatoriamente <strong>baixa bancária vinculada no ERP</strong>, excluem-se temporariamente Cachoeirão, Flor do Aratau e Tresmar.
    Nesse caso, liberar ${brl(somenteExtrato)}. Após usar o crédito do Fábio até o limite da comissão dele, o desembolso cai para ${brl(somenteExtratoComCredito)} e ainda sobra ${brl(1077)} de crédito do Fábio para o próximo ciclo.
  </div>

  <h2>Critério aplicado e limitações</h2>
  <div class="note">
    <strong>Regra principal:</strong> foram incluídos títulos válidos marcados como “recebido” no ERP; títulos cancelados foram ignorados.
    Quando o título recebido não estava ligado ao fechamento, o vínculo foi identificado pelo nome/data do leilão.
    Leilões sem título, com título aberto/vencido, cancelado sem receita ou recebimento parcial sem rastreio da venda do assessor foram retidos.
    Esta é uma simulação de autorização de caixa; não altera o ERP nem marca comissões como pagas.
  </div>

  <div class="footer"><span>Bula Assessoria — documento de uso interno</span><span>Comissões · critério de recebimento · 27/07/2026</span></div>
</body>
</html>`

mkdirSync(outputDir, { recursive: true })
const htmlPath = join(outputDir, 'analise-comissoes-criterio-recebimento-2026-07-27.html')
const pdfPath = join(outputDir, 'analise-comissoes-criterio-recebimento-2026-07-27.pdf')
const desktopPath = join(desktop, 'Analise Comissoes - Criterio de Recebimento - 27-07-2026.pdf')

writeFileSync(htmlPath, html, 'utf8')

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  const pdfOptions = {
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  }
  await page.pdf({ ...pdfOptions, path: pdfPath })
  await page.pdf({ ...pdfOptions, path: desktopPath })
} finally {
  await browser.close()
}

console.log(`Original: ${brl(originalTotal)}`)
console.log(`Critério antigo: ${brl(elegivelTotal)}`)
console.log(`Retido: ${brl(reterTotal)}`)
console.log(`Com crédito do Fábio: ${brl(desembolsoComCredito)}`)
console.log(`PDF: ${pdfPath}`)
console.log(`Área de Trabalho: ${desktopPath}`)
