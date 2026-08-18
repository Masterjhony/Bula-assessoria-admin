// Relatório completo das campanhas Meta Ads que estiveram ativas — janela
// 01/07/2026 a 02/08/2026 — cruzado com os leads da planilha (MQL) e com os
// cadastros aprovados apurados nos grupos de WhatsApp.
//
// Fontes (extração literal, não recalcular à mão):
// - Meta Ads (conector oficial), janela 01/07 → 02/08:
//     CA2 - Bula 360 (2705134163151418)  — campanhas da Bula
//     CA1 - Bula 360 (1155240258865815)  — campanhas dos leilões
//     Formula do Boi (1630761758131744)  — SEM entrega na janela
// - Planilha "Leads JMP - Bula Assessoria", aba LEADS GERAIS (729 leads na
//   janela). MQL = piso da faixa ≥100 cabeças E I.E. = Sim (evaluateMql,
//   src/lib/crm-types.ts).
// - Cadastros aprovados: os dois relatórios já consolidados no Desktop —
//     Cadastros-Aprovados-Grupos-2026-07-31 (grupos Programa + Remates)
//     Cadastros-Aprovados-Bula-Remates-2026-08-01 (Remates, com documentos)
//
// Saídas: outputs/relatorio-campanhas-2026-08-03.{html,pdf}
//         Desktop/Relatorio Campanhas Meta Ads - Desempenho e Cadastros - 03-08-2026.pdf
//
// Uso: node scripts/gera-relatorio-campanhas-2026-08-03.mjs

import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'outputs')
const desktop = join(process.env.USERPROFILE || '', 'Desktop')
const stem = 'relatorio-campanhas-2026-08-03'
const desktopName = 'Relatorio Campanhas Meta Ads - Desempenho e Cadastros - 03-08-2026'
mkdirSync(outputDir, { recursive: true })

// ---------------------------------------------------------------------------
// 1) Meta Ads — campanhas com entrega na janela
// ---------------------------------------------------------------------------

// Conta CA2: as campanhas da Bula. São estas que alimentam a planilha de leads.
const ca2 = [
  {
    nome: 'LEADS - FORMS INST EAO — Cópia', status: 'Pausada', inicio: '08/07',
    investido: 2887.76, impressoes: 258815, alcance: 129735, freq: 1.99, cliques: 3509,
    ctr: 1.36, cpc: 0.82, cpm: 11.16, leads: 216, cpl: 13.37, lpv: 75,
  },
  {
    nome: 'LEAD - PERPETUO TOURO', status: 'Ativa', inicio: '24/07',
    investido: 2100.41, impressoes: 154048, alcance: 74798, freq: 2.06, cliques: 2423,
    ctr: 1.57, cpc: 0.87, cpm: 13.63, leads: null, cpl: null, lpv: 1160,
    nota: 'Otimizada por pixel (MQL Perpetuo Touros): 18 conversões a R$ 116,69. O lead cai na planilha pela landing, não no formulário da Meta.',
  },
  {
    nome: 'LEADS - SAO GERALDO', status: 'Ativa', inicio: '29/07',
    investido: 1413.59, impressoes: 123241, alcance: 96363, freq: 1.28, cliques: 2398,
    ctr: 1.95, cpc: 0.59, cpm: 11.47, leads: 26, cpl: 54.37, lpv: 812,
    nota: 'Mistura formulário da Meta e landing — por isso o CPL do painel (R$ 54,37) não é o custo real do lead.',
  },
  {
    nome: 'LEADS - FORMS INST PERPETUO', status: 'Pausada', inicio: '23/06',
    investido: 817.01, impressoes: 91471, alcance: 70243, freq: 1.30, cliques: 2056,
    ctr: 2.25, cpc: 0.40, cpm: 8.93, leads: 382, cpl: 2.14, lpv: 172,
  },
  {
    nome: 'LEADS - FORMS INST EAO', status: 'Pausada', inicio: '08/07',
    investido: 35.39, impressoes: 2689, alcance: 2502, freq: 1.07, cliques: 15,
    ctr: 0.56, cpc: 2.36, cpm: 13.16, leads: 0, cpl: null, lpv: null,
    nota: 'Primeira versão, trocada pela "Cópia" no mesmo dia.',
  },
]

// Conta CA1: campanhas de leilão. Os leads caem no formulário da leiloeira e
// NÃO entram na nossa planilha.
const ca1 = [
  { nome: 'CORTE PERPÉTUO / 13 de Julho', status: 'Ativa', investido: 2706.57, impressoes: 256076, alcance: 64520, cliques: 3248, ctr: 1.27, cpc: 0.83, cpm: 10.57, leads: 154, cpl: 17.58 },
  { nome: 'CORTE TUPÃ', status: 'Ativa', investido: 345.48, impressoes: 28377, alcance: 13673, cliques: 523, ctr: 1.84, cpc: 0.66, cpm: 12.17, leads: 7, cpl: 49.35 },
  { nome: 'CORTE PERPÉTUO', status: 'Ativa', investido: 270.56, impressoes: 30666, alcance: 14771, cliques: 478, ctr: 1.56, cpc: 0.57, cpm: 8.82, leads: 20, cpl: 13.53 },
]

// ---------------------------------------------------------------------------
// 2) A régua real — leads e MQL da planilha, por frente
// ---------------------------------------------------------------------------

const frentes = [
  { nome: 'EAO (formulário Meta)', campanhas: 'LEADS - FORMS INST EAO + Cópia', investido: 2923.15, leads: 216, mql: 48, ie: 100 },
  { nome: 'São Geraldo (form + landing)', campanhas: 'LEADS - SAO GERALDO', investido: 1413.59, leads: 51, mql: 22, ie: 37 },
  { nome: 'Touros Perpétuo (landing)', campanhas: 'LEAD - PERPETUO TOURO', investido: 2100.41, leads: 74, mql: 19, ie: 38 },
  { nome: 'Perpétuo (formulário Meta)', campanhas: 'LEADS - FORMS INST PERPETUO', investido: 817.01, leads: 387, mql: 8, ie: 121 },
]

// Curva diária — leads/MQL por frente (planilha).
const serie = [
  { d: '08/07', eao: [18, 7], perp: null, touros: null, sg: null },
  { d: '09/07', eao: [70, 10], perp: [14, 2], touros: null, sg: null },
  { d: '10/07', eao: [42, 7], perp: [150, 4], touros: null, sg: null },
  { d: '11/07', eao: [68, 19], perp: [167, 2], touros: null, sg: null },
  { d: '12/07', eao: [18, 5], perp: [56, 0], touros: null, sg: null },
  { d: '24/07', eao: null, perp: null, touros: [1, 0], sg: null },
  { d: '25/07', eao: null, perp: null, touros: [15, 4], sg: null },
  { d: '26/07', eao: null, perp: null, touros: [13, 7], sg: null },
  { d: '27/07', eao: null, perp: null, touros: [13, 2], sg: null },
  { d: '28/07', eao: null, perp: null, touros: [9, 1], sg: null },
  { d: '29/07', eao: null, perp: null, touros: [11, 4], sg: [12, 5] },
  { d: '30/07', eao: null, perp: null, touros: [6, 1], sg: [15, 7] },
  { d: '31/07', eao: null, perp: null, touros: [5, 0], sg: [17, 6] },
  { d: '01/08', eao: null, perp: null, touros: [1, 0], sg: [7, 4] },
]

// Plataformas — recorte das 3 campanhas de julho da CA2 com entrega relevante.
const plataformas = [
  { camp: 'EAO — Cópia', plat: 'Instagram', investido: 2430.19, impressoes: 228364, cliques: 2559, ctr: 1.12, cpm: 10.64, leads: 189, cpl: 12.86 },
  { camp: 'EAO — Cópia', plat: 'Facebook', investido: 442.04, impressoes: 30159, cliques: 909, ctr: 3.01, cpm: 14.66, leads: 27, cpl: 16.37 },
  { camp: 'EAO — Cópia', plat: 'Audience Network', investido: 14.67, impressoes: 237, cliques: 38, ctr: 16.03, cpm: 61.88, leads: 0, cpl: null },
  { camp: 'Perpétuo Touro', plat: 'Instagram', investido: 1580.76, impressoes: 125522, cliques: 1549, ctr: 1.23, cpm: 12.59, leads: null, cpl: null, lpv: 790 },
  { camp: 'Perpétuo Touro', plat: 'Facebook', investido: 412.03, impressoes: 27065, cliques: 714, ctr: 2.64, cpm: 15.22, leads: null, cpl: null, lpv: 234 },
  { camp: 'Perpétuo Touro', plat: 'Audience Network', investido: 102.88, impressoes: 1142, cliques: 152, ctr: 13.31, cpm: 90.09, leads: null, cpl: null, lpv: 127 },
  { camp: 'São Geraldo', plat: 'Instagram', investido: 875.36, impressoes: 97721, cliques: 822, ctr: 0.84, cpm: 8.96, leads: 13, cpl: 67.34, lpv: 260 },
  { camp: 'São Geraldo', plat: 'Facebook', investido: 325.74, impressoes: 23068, cliques: 1130, ctr: 4.90, cpm: 14.12, leads: 13, cpl: 25.06, lpv: 192 },
  { camp: 'São Geraldo', plat: 'Audience Network', investido: 211.89, impressoes: 2419, cliques: 443, ctr: 18.31, cpm: 87.60, leads: 0, cpl: null, lpv: 358 },
]

const ufs = [
  ['MG', 119, 15], ['SP', 104, 5], ['BA', 57, 7], ['GO', 54, 8], ['RJ', 43, 6],
  ['PA', 43, 7], ['MA', 39, 6], ['MT', 32, 10], ['PR', 27, 2], ['CE', 25, 1],
  ['MS', 19, 5], ['TO', 19, 2], ['PE', 19, 4], ['RO', 9, 6], ['AC', 9, 3],
]

const interesses = [
  ['Bezerras PO', 349, 11], ['Touros', 219, 69], ['Matrizes PO', 118, 8],
  ['Embriões', 27, 6], ['Sêmen', 15, 3],
]

// ---------------------------------------------------------------------------
// 3) Do lead ao cadastro aprovado
// ---------------------------------------------------------------------------

// Aprovados que casaram, por nome, com um lead da base — com a origem do lead.
const rastreados = [
  { nome: 'Hélio Gomes Silva', origem: 'Meta — LEADS - FORMS INST EAO — Cópia', data: '09/07', uf: 'MG', perfil: '+500 cabeças · I.E. Sim', pago: true },
  { nome: 'Márcio de Vasconcelos Martins', origem: 'Meta — LEADS - FORMS INST EAO — Cópia', data: '11/07', uf: 'RO', perfil: '+500 cabeças · I.E. Sim', pago: true },
  { nome: 'Wellington Ferreira dos Santos', origem: 'Meta — LEADS - FORMS INST EAO — Cópia', data: '10/07', uf: 'PA', perfil: '101–300 cabeças · I.E. Sim', pago: true, nota: 'Vínculo registrado pelo próprio relatório da Remates (estava na aba TOUROS desde 10/07).' },
  { nome: 'Rúlio Victor Pereira Oliveira', origem: 'Meta — LEADS - FORMS INST PERPETUO', data: '24/06', uf: 'MG', perfil: '+500 cabeças · I.E. Sim', pago: true },
  { nome: 'Laércio José Oliveira Almeida', origem: 'Landing São Geraldo', data: '30/07', uf: 'MG', perfil: '100–500 cabeças · I.E. Sim', pago: true },
  { nome: 'Altair Cacho', origem: 'Landing São Geraldo', data: '31/07', uf: 'MS', perfil: '100–500 cabeças · I.E. Sim', pago: true },
  { nome: 'Rodrigo de Proença Oliveira Braga', origem: 'Landing São Geraldo', data: '30/07', uf: 'RJ', perfil: '1–99 cabeças · I.E. Sim', pago: true },
  { nome: 'Davison Avelino Gomes Pinto', origem: 'Landing São Geraldo', data: '31/07', uf: 'SP', perfil: '100–500 cabeças · I.E. Sim', pago: true },
  { nome: 'Pedro Leão', origem: 'Meta — LEADS JMP SITE (13–14/06)', data: '12/06', uf: 'PB', perfil: '1–50 cabeças · I.E. Sim', pago: true },
  { nome: 'Carlos Fernando Machado Junior', origem: 'Meta — LEADS JMP SITE (13–14/06)', data: '12/06', uf: 'ES', perfil: '1–50 cabeças · I.E. Sim', pago: true },
  { nome: 'Octacilio Carlos Valcher', origem: 'Meta — Leilão JMP Forms Insta', data: '12/06', uf: 'ES', perfil: '1–50 cabeças · I.E. Sim', pago: true },
  { nome: 'Dirceu de Oliveira Valente', origem: 'Cadastro habilitação', data: '10/06', uf: 'RJ', perfil: '1–50 cabeças · I.E. Sim', pago: false },
  { nome: 'Daniel Cunha Câmara', origem: 'Cadastro habilitação', data: '12/06', uf: 'GO', perfil: '301–500 cabeças · I.E. Sim', pago: false },
  { nome: 'Deiglames Oliveira Silva', origem: 'Cadastro habilitação', data: '—', uf: 'MA', perfil: '101–300 cabeças · I.E. Sim', pago: false },
  { nome: 'Leonardo de Oliveira', origem: 'Cadastro habilitação', data: '—', uf: 'MG', perfil: 'I.E. Sim', pago: false },
  { nome: 'Antonio Francisco Slongo', origem: 'Cadastro habilitação', data: '—', uf: 'PR', perfil: '—', pago: false },
  { nome: 'Pablo Pinheiro Costa', origem: 'Cadastro habilitação', data: '12/06', uf: 'MA', perfil: '101–300 cabeças · I.E. Sim', pago: false },
  { nome: 'Marcelo Oliveira', origem: 'Cadastro habilitação', data: '13/06', uf: 'MG', perfil: '+500 cabeças · I.E. Sim', pago: false },
  { nome: 'José Luiz Antunes', origem: 'Cadastro habilitação', data: '—', uf: 'MG', perfil: '1–50 cabeças · I.E. Sim', pago: false },
  { nome: 'Adeildo Duão de Oliveira', origem: 'Lista antiga de fazendas', data: '12/06', uf: 'MS', perfil: '+500 cabeças · I.E. Sim', pago: false },
  { nome: 'Juliano Labiak', origem: 'Lista antiga de fazendas', data: '10/06', uf: 'MT', perfil: '101–300 cabeças · I.E. Sim', pago: false },
  { nome: 'Amadeu Ferino de Medeiros', origem: 'Lista antiga de fazendas', data: '12/06', uf: 'RN', perfil: '1–50 cabeças · I.E. Sim', pago: false },
  { nome: 'Marcelo Clemente Araújo', origem: 'Lista antiga de fazendas', data: '13/06', uf: 'PA', perfil: '+500 cabeças · I.E. Sim', pago: false },
  { nome: 'Edvaldo Lemos Fernandes Silva', origem: 'Lista antiga de fazendas', data: '11/06', uf: 'MG', perfil: '101–300 cabeças · I.E. Sim', pago: false },
  { nome: 'Maxwell de Sousa e Silva de Carvalho', origem: 'Lista antiga de fazendas', data: '10/06', uf: 'TO', perfil: '1–50 cabeças · I.E. Sim', pago: false },
]

const semLead = [
  'Thomas Bianchine', 'Luiz do Couro', 'Edilberto Pereira Sarubi', 'Marcelo Augusto Gomes Cataldo',
  'José Aladino Barbosa dos Santos', 'João Carlos Viana Bregantini', 'Ejamal Muhd Shihadeh Khalil',
  'Valquiria Soares Montel', 'Valdy Junior Correia Evangelista', 'Hermann Gomes Sarmento',
  'Idelson Peres Pereira', 'Sidiney Thomaz Neto', 'Neuza das Graças Sousa',
  'Marcus André Madeira Campos Almeida', 'Trajano Pinheiro', 'Hênio Suassuna Ferreira',
  'Marusan Mendes de Souza', 'Leandro Oliveira Rios Natal dos Santos',
  'Carlos Augusto dos Santos Sousa', 'Braz de Oliveira Bueno', 'Fabio Rafael da Cunha Silva',
  'Ivana S. Potenza Magão',
]

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------
const brl = (n) => n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (n) => n == null ? '—' : n.toLocaleString('pt-BR')
const pct = (n) => n == null ? '—' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const totCa2 = ca2.reduce((a, c) => ({
  investido: a.investido + c.investido, impressoes: a.impressoes + c.impressoes,
  cliques: a.cliques + c.cliques, leads: a.leads + (c.leads || 0),
}), { investido: 0, impressoes: 0, cliques: 0, leads: 0 })
const totCa1 = ca1.reduce((a, c) => ({
  investido: a.investido + c.investido, impressoes: a.impressoes + c.impressoes,
  cliques: a.cliques + c.cliques, leads: a.leads + c.leads,
}), { investido: 0, impressoes: 0, cliques: 0, leads: 0 })

const investTotal = totCa2.investido + totCa1.investido
const leadsPlanilha = 729
const mqlTotal = 97
const custoPorMql = totCa2.investido / mqlTotal
const pagos = rastreados.filter(r => r.pago).length
const proprios = rastreados.filter(r => !r.pago).length
const aprovadosTotal = 47

const linhaSerie = (s) => {
  const c = (v) => v ? `${v[0]} <span class="mq">/${v[1]}</span>` : '<span class="off">—</span>'
  return `<tr><td class="num">${s.d}</td><td class="num">${c(s.eao)}</td><td class="num">${c(s.perp)}</td><td class="num">${c(s.touros)}</td><td class="num">${c(s.sg)}</td></tr>`
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Campanhas Meta Ads — desempenho e cadastros — 03/08/2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 13mm 11mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #111; font-size: 9.4px; line-height: 1.45; margin: 0; padding-bottom: 8mm; }
  h1, h2, h3 { font-family: 'Oswald', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: .02em; margin: 0; font-weight: 700; }
  h1 { font-size: 23px; line-height: 1.05; }
  h2 { font-size: 12.5px; margin: 17px 0 5px; padding-bottom: 3px; border-bottom: 1.5px solid #111; }
  h3 { font-size: 10.5px; margin: 11px 0 3px; }
  .cap { border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
  .cap .sub { font-size: 10px; color: #444; margin-top: 4px; }
  .cap .meta { font-size: 8.6px; color: #666; text-align: right; }
  .cap .tot { font-family: 'Oswald', Arial, sans-serif; font-size: 32px; line-height: 1; }
  .cap .tot small { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.4px; color: #666; display: block; text-transform: uppercase; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: #111; color: #fff; font-size: 8.2px; text-transform: uppercase; letter-spacing: .04em; text-align: left; padding: 5px 6px; font-weight: 600; }
  th.r, td.num { text-align: right; }
  td { border-bottom: .6px solid #d5d5d5; padding: 4px 6px; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  tfoot td { border-top: 1.5px solid #111; border-bottom: none; font-weight: 700; background: #fff !important; }
  .nome { font-weight: 600; }
  .num { white-space: nowrap; }
  .micro { font-size: 8px; color: #777; }
  .warn { font-weight: 700; }
  .box { border: 1px solid #111; padding: 9px 11px; margin: 8px 0 4px; }
  .box.grey { border: none; background: #f2f2f2; }
  ul { margin: 4px 0 0; padding-left: 15px; }
  li { margin-bottom: 3px; }
  .cards { display: flex; gap: 7px; margin: 8px 0; }
  .card { flex: 1; border: 1px solid #111; padding: 7px 9px; }
  .card .z { font-size: 7.6px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .card .n { font-size: 21px; font-family: 'Oswald', Arial, sans-serif; line-height: 1.05; margin-top: 2px; }
  .card .n small { font-size: 8px; color: #666; font-family: 'Segoe UI', Arial, sans-serif; display: block; letter-spacing: 0; text-transform: none; }
  .bar { display: inline-block; height: 7px; background: #111; vertical-align: middle; }
  .bar.o { background: #bbb; }
  .mq { color: #666; }
  .off { color: #bbb; }
  .avoid { break-inside: avoid; }
  .pg { break-before: page; }
  footer { position: fixed; bottom: 4mm; left: 0; right: 0; font-size: 7.4px; color: #888; display: flex; justify-content: space-between; }
</style></head><body>

<div class="cap">
  <div>
    <h1>Campanhas Meta Ads — desempenho completo</h1>
    <div class="sub">Do investimento ao cadastro aprovado: o que as campanhas entregaram, o que virou lead qualificado e o que chegou a virar cliente habilitado</div>
  </div>
  <div class="meta">
    <div class="tot">R$ ${brl(investTotal)}<small>investido · 01/07 a 02/08</small></div>
    <div style="margin-top:6px">Bula Assessoria · 3 de agosto de 2026<br>Contas CA1 + CA2 · ${ca2.length + ca1.length} campanhas com entrega</div>
  </div>
</div>

<div class="cards">
  <div class="card"><div class="z">Investimento</div><div class="n">R$ ${brl(investTotal)}<small>CA2 R$ ${brl(totCa2.investido)} · CA1 R$ ${brl(totCa1.investido)}</small></div></div>
  <div class="card"><div class="z">Alcance / impressões</div><div class="n">${num(totCa2.impressoes + totCa1.impressoes)}<small>impressões · ${num(totCa2.cliques + totCa1.cliques)} cliques</small></div></div>
  <div class="card"><div class="z">Leads na planilha</div><div class="n">${leadsPlanilha}<small>R$ ${brl(totCa2.investido / leadsPlanilha)} por lead</small></div></div>
  <div class="card"><div class="z">MQL (≥100 cab. + I.E.)</div><div class="n">${mqlTotal}<small>13,3% dos leads · R$ ${brl(custoPorMql)} por MQL</small></div></div>
  <div class="card"><div class="z">Cadastros aprovados</div><div class="n">${aprovadosTotal}<small>${pagos} rastreáveis a campanha paga</small></div></div>
</div>

<div class="box">
  <strong>Como ler este relatório.</strong> O painel da Meta conta <em>lead</em> como quem preencheu o formulário — não como quem serve para
  vender. Por isso toda campanha aparece aqui duas vezes: primeiro o que a Meta reporta, depois a régua da casa —
  <strong>MQL = 100 cabeças ou mais E Inscrição Estadual</strong>, a mesma regra que o sistema aplica (<span class="micro">evaluateMql</span>).
  A diferença entre as duas leituras é o assunto deste documento: a campanha de lead mais barato do mês é também a que produziu
  quase nenhum comprador.
  <br><br><strong>Fontes.</strong> Meta Ads pelo conector oficial (contas CA1 e CA2 — a conta Fórmula do Boi não teve entrega na janela);
  leads da planilha “Leads JMP”, aba LEADS GERAIS (${leadsPlanilha} leads na janela); cadastros aprovados dos dois relatórios já
  consolidados entre planilha e grupos de WhatsApp (31/07 e 01/08).
</div>

<h2>1. Conta CA2 — campanhas da Bula</h2>
<div class="box grey">São as campanhas cujos leads caem na nossa planilha. Tudo que este relatório chama de lead e MQL vem daqui.</div>
<table>
  <thead><tr>
    <th style="width:23%">Campanha</th><th style="width:7%">Status</th>
    <th class="r" style="width:9%">Investido</th><th class="r" style="width:8%">Impressões</th><th class="r" style="width:8%">Alcance</th>
    <th class="r" style="width:6%">Cliques</th><th class="r" style="width:5%">CTR</th><th class="r" style="width:5%">CPC</th><th class="r" style="width:5%">CPM</th>
    <th class="r" style="width:6%">Leads</th><th class="r" style="width:6%">CPL</th>
  </tr></thead>
  <tbody>
    ${ca2.map(c => `<tr>
      <td class="nome">${esc(c.nome)}${c.nota ? `<br><span class="micro">${esc(c.nota)}</span>` : ''}</td>
      <td>${c.status}<br><span class="micro">desde ${c.inicio}</span></td>
      <td class="num">${brl(c.investido)}</td><td class="num">${num(c.impressoes)}</td><td class="num">${num(c.alcance)}</td>
      <td class="num">${num(c.cliques)}</td><td class="num">${pct(c.ctr)}</td><td class="num">${brl(c.cpc)}</td><td class="num">${brl(c.cpm)}</td>
      <td class="num">${c.leads == null ? '<span class="micro">pixel</span>' : num(c.leads)}</td><td class="num">${brl(c.cpl)}</td>
    </tr>`).join('')}
  </tbody>
  <tfoot><tr>
    <td colspan="2">Total CA2</td><td class="num">${brl(totCa2.investido)}</td><td class="num">${num(totCa2.impressoes)}</td>
    <td class="num">—</td><td class="num">${num(totCa2.cliques)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td>
    <td class="num">${num(totCa2.leads)}</td><td class="num">—</td>
  </tr></tfoot>
</table>

<h2>2. Conta CA1 — campanhas de leilão</h2>
<div class="box grey">
  Leads destas campanhas caem no formulário da leiloeira e <strong>não entram na nossa planilha</strong> — por isso não têm MQL aqui.
  Entram no relatório porque saíram do mesmo orçamento.
</div>
<table>
  <thead><tr>
    <th style="width:26%">Campanha</th><th style="width:8%">Status</th>
    <th class="r" style="width:10%">Investido</th><th class="r" style="width:10%">Impressões</th><th class="r" style="width:9%">Alcance</th>
    <th class="r" style="width:8%">Cliques</th><th class="r" style="width:6%">CTR</th><th class="r" style="width:6%">CPC</th><th class="r" style="width:6%">CPM</th>
    <th class="r" style="width:6%">Leads</th><th class="r" style="width:7%">CPL</th>
  </tr></thead>
  <tbody>
    ${ca1.map(c => `<tr>
      <td class="nome">${esc(c.nome)}</td><td>${c.status}</td>
      <td class="num">${brl(c.investido)}</td><td class="num">${num(c.impressoes)}</td><td class="num">${num(c.alcance)}</td>
      <td class="num">${num(c.cliques)}</td><td class="num">${pct(c.ctr)}</td><td class="num">${brl(c.cpc)}</td><td class="num">${brl(c.cpm)}</td>
      <td class="num">${num(c.leads)}</td><td class="num">${brl(c.cpl)}</td>
    </tr>`).join('')}
  </tbody>
  <tfoot><tr>
    <td colspan="2">Total CA1</td><td class="num">${brl(totCa1.investido)}</td><td class="num">${num(totCa1.impressoes)}</td>
    <td class="num">—</td><td class="num">${num(totCa1.cliques)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td>
    <td class="num">${num(totCa1.leads)}</td><td class="num">—</td>
  </tr></tfoot>
</table>

<h2 class="pg">3. A régua da casa — quanto custou cada lead que presta</h2>
<div class="box">
  Mesmas campanhas, outra pergunta. <strong>CPL</strong> é o que a Meta cobra por um formulário preenchido; <strong>custo por MQL</strong> é o
  que custa alguém com rebanho e I.E. — quem o assessor consegue trabalhar. A ordem das campanhas muda por completo entre uma coluna e outra.
</div>
<table>
  <thead><tr>
    <th style="width:22%">Frente</th><th style="width:20%">Campanha</th>
    <th class="r" style="width:10%">Investido</th><th class="r" style="width:7%">Leads</th><th class="r" style="width:8%">CPL real</th>
    <th class="r" style="width:6%">MQL</th><th class="r" style="width:8%">% MQL</th><th class="r" style="width:10%">Custo/MQL</th><th style="width:9%"></th>
  </tr></thead>
  <tbody>
    ${[...frentes].sort((a, b) => (a.investido / a.mql) - (b.investido / b.mql)).map(f => {
      const cm = f.investido / f.mql
      const w = Math.round((cm / 115) * 62)
      return `<tr>
        <td class="nome">${esc(f.nome)}</td><td class="micro">${esc(f.campanhas)}</td>
        <td class="num">${brl(f.investido)}</td><td class="num">${num(f.leads)}</td><td class="num">${brl(f.investido / f.leads)}</td>
        <td class="num">${f.mql}</td><td class="num">${pct(f.mql / f.leads * 100)}</td>
        <td class="num warn">${brl(cm)}</td>
        <td><span class="bar" style="width:${w}px"></span></td>
      </tr>`
    }).join('')}
  </tbody>
  <tfoot><tr>
    <td colspan="2">Total das frentes da Bula</td>
    <td class="num">${brl(totCa2.investido)}</td><td class="num">${leadsPlanilha}</td><td class="num">${brl(totCa2.investido / leadsPlanilha)}</td>
    <td class="num">${mqlTotal}</td><td class="num">${pct(mqlTotal / leadsPlanilha * 100)}</td><td class="num">${brl(custoPorMql)}</td><td></td>
  </tr></tfoot>
</table>
<div class="box grey avoid">
  <strong>O lead barato saiu caro.</strong> A campanha <em>LEADS - FORMS INST PERPETUO</em> entregou o lead mais barato do mês —
  <strong>R$ 2,11</strong> — e é a pior de todas na conta que importa: <strong>2,1% de MQL</strong>, R$ 102,13 por lead aproveitável.
  Foram 387 pessoas cadastradas para 8 qualificadas. No extremo oposto, <em>São Geraldo</em> custou 13× mais por lead (R$ 27,72) e
  entrega <strong>43,1% de MQL</strong> — 22 aproveitáveis em 51. O formulário nativo do Instagram enche a planilha; a landing com
  vídeo filtra antes de gastar o tempo do assessor.
</div>

<h2>4. Curva diária — leads e MQL por frente</h2>
<div class="box grey">Lê-se <strong>leads<span class="mq">/MQL</span></strong>. As frentes não se sobrepõem no calendário: EAO e Perpétuo rodaram de 08 a 12/07, Touros a partir de 24/07 e São Geraldo a partir de 29/07.</div>
<table>
  <thead><tr>
    <th style="width:14%">Dia</th><th class="r" style="width:21%">EAO (form)</th><th class="r" style="width:21%">Perpétuo (form)</th>
    <th class="r" style="width:21%">Touros (landing)</th><th class="r" style="width:23%">São Geraldo</th>
  </tr></thead>
  <tbody>${serie.map(linhaSerie).join('')}</tbody>
</table>
<div class="box avoid">
  <strong>Dois padrões que se repetem.</strong> Primeiro, o pico de volume nunca é o pico de qualidade: em 10 e 11/07 o Perpétuo
  despejou 317 leads e produziu 6 MQL, enquanto o EAO, com menos da metade do volume, fez 26. Segundo, as frentes de landing
  <strong>degradam com os dias</strong> — Touros começou em 26/07 com 7 MQL e terminou a semana com 0, e São Geraldo caiu de 7 para
  4 depois do terceiro dia. É o mesmo público sendo reimpactado (frequência 2,06 no Touros): dá para prever quando a campanha
  vira desperdício e trocar o criativo antes disso.
</div>

<h2 class="pg">5. Onde o dinheiro entrega — e onde some</h2>
<table>
  <thead><tr>
    <th style="width:17%">Campanha</th><th style="width:14%">Plataforma</th>
    <th class="r" style="width:11%">Investido</th><th class="r" style="width:11%">Impressões</th><th class="r" style="width:9%">Cliques</th>
    <th class="r" style="width:8%">CTR</th><th class="r" style="width:9%">CPM</th><th class="r" style="width:8%">Leads</th><th class="r" style="width:9%">CPL</th>
  </tr></thead>
  <tbody>
    ${plataformas.map(p => `<tr>
      <td class="nome">${esc(p.camp)}</td>
      <td>${p.plat === 'Audience Network' ? `<span class="warn">${p.plat}</span>` : p.plat}</td>
      <td class="num">${brl(p.investido)}</td><td class="num">${num(p.impressoes)}</td><td class="num">${num(p.cliques)}</td>
      <td class="num">${pct(p.ctr)}</td><td class="num">${brl(p.cpm)}</td>
      <td class="num">${p.leads == null ? `<span class="micro">${p.lpv ?? '—'} LPV</span>` : num(p.leads)}</td>
      <td class="num">${brl(p.cpl)}</td>
    </tr>`).join('')}
  </tbody>
</table>
<div class="box avoid">
  <strong>Audience Network é dinheiro jogado fora — e dá para provar.</strong> Nas três campanhas ela repete a mesma assinatura:
  CTR de <strong>13% a 18%</strong> (contra 1% a 3% no Instagram), CPM de <strong>R$ 62 a R$ 90</strong> (contra R$ 9 a R$ 15) e
  <strong>zero lead</strong>. No São Geraldo foram R$ 211,89 para 443 cliques, 358 visitas à landing e nenhum formulário preenchido;
  no Touros, R$ 102,88 para 127 visitas e nenhum MQL. Somando as três, <strong>R$ 329,44 do mês</strong> — 4,5% da verba da CA2 —
  foram para uma rede que produz clique acidental em aplicativo, não interesse. Excluir a Audience Network dos posicionamentos é a
  decisão de maior retorno imediato deste relatório.
  <br><br>
  <strong>Facebook e Instagram fazem papéis diferentes.</strong> O Instagram carrega o volume (R$ 4,9 mil dos R$ 7,3 mil da CA2), mas no
  São Geraldo o Facebook entregou o mesmo número de leads (13) gastando 2,7× menos — <strong>R$ 25,06 contra R$ 67,34</strong>.
  Vale testar o São Geraldo com verba invertida entre as duas redes.
</div>

<h2>6. Quem responde — perfil e geografia</h2>
<div style="display:flex; gap:12px">
  <div style="flex:1">
    <h3>Por interesse declarado</h3>
    <table>
      <thead><tr><th style="width:40%">Interesse</th><th class="r" style="width:20%">Leads</th><th class="r" style="width:18%">MQL</th><th class="r" style="width:22%">% MQL</th></tr></thead>
      <tbody>${interesses.map(([n, l, m]) => `<tr><td class="nome">${n}</td><td class="num">${l}</td><td class="num">${m}</td><td class="num">${pct(m / l * 100)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="micro" style="margin-top:5px">
      <strong>Touros é a única frente que qualifica.</strong> 219 leads e 69 MQL (31,5%). “Bezerras PO” trouxe 349 leads e 11 MQL
      (3,2%) — é o público do formulário do Perpétuo, que responde à isca e não tem rebanho.
    </div>
  </div>
  <div style="flex:1">
    <h3>Top estados por MQL</h3>
    <table>
      <thead><tr><th style="width:24%">UF</th><th class="r" style="width:24%">Leads</th><th class="r" style="width:20%">MQL</th><th class="r" style="width:32%">% MQL</th></tr></thead>
      <tbody>${ufs.map(([u, l, m]) => `<tr><td class="nome">${u}</td><td class="num">${l}</td><td class="num">${m}</td><td class="num">${pct(m / l * 100)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="micro" style="margin-top:5px">
      <strong>SP e CE gastam sem devolver.</strong> São Paulo trouxe 104 leads e 5 MQL (4,8%); o Ceará, 25 leads e 1 MQL.
      Já Rondônia fez 6 MQL em 9 leads (66,7%) e Mato Grosso, 10 em 32 (31,3%). O norte agropecuário converte;
      o Sudeste urbano infla o volume.
    </div>
  </div>
</div>

<h2 class="pg">7. Do lead ao cadastro aprovado — o elo que faltava</h2>
<div class="box">
  Esta é a parte que os relatórios anteriores não fechavam. Peguei os <strong>${aprovadosTotal} cadastros aprovados</strong> apurados nos
  grupos (relatórios de 31/07 e 01/08) e procurei cada nome na base de leads. Resultado: <strong>${rastreados.length} têm um lead
  correspondente</strong> e ${semLead.length} não aparecem em lugar nenhum. Dos rastreados, <strong>${pagos} vieram de campanha paga</strong>
  e ${proprios} de canal próprio (ficha de habilitação ou lista antiga de fazendas).
</div>
<div class="cards">
  <div class="card"><div class="z">Aprovados no período</div><div class="n">${aprovadosTotal}<small>21 grupo Remates · 11 grupo Programa · 17 lista por e-mail (já sem duplicados)</small></div></div>
  <div class="card"><div class="z">Vieram de campanha paga</div><div class="n">${pagos}<small>${(pagos / aprovadosTotal * 100).toFixed(0)}% do total · R$ ${brl(totCa2.investido / pagos)} por cadastro</small></div></div>
  <div class="card"><div class="z">Vieram de canal próprio</div><div class="n">${proprios}<small>ficha de habilitação e lista antiga de fazendas</small></div></div>
  <div class="card"><div class="z">Sem rastro na base</div><div class="n">${semLead.length}<small>chegaram direto pelo grupo, sem passar por lead</small></div></div>
</div>

<h3>Os ${pagos} cadastros aprovados que a mídia paga trouxe</h3>
<table>
  <thead><tr>
    <th style="width:26%">Cliente</th><th style="width:28%">Campanha de origem</th><th style="width:8%">Data</th>
    <th style="width:5%">UF</th><th style="width:33%">Perfil no formulário</th>
  </tr></thead>
  <tbody>
    ${rastreados.filter(r => r.pago).map(r => `<tr>
      <td class="nome">${esc(r.nome)}</td><td>${esc(r.origem)}</td><td class="num">${r.data}</td>
      <td class="num">${r.uf}</td><td>${esc(r.perfil)}${r.nota ? `<br><span class="micro">${esc(r.nota)}</span>` : ''}</td>
    </tr>`).join('')}
  </tbody>
</table>

<h3>Os ${proprios} que vieram de canal próprio</h3>
<table>
  <thead><tr>
    <th style="width:26%">Cliente</th><th style="width:28%">Origem do lead</th><th style="width:8%">Data</th>
    <th style="width:5%">UF</th><th style="width:33%">Perfil</th>
  </tr></thead>
  <tbody>
    ${rastreados.filter(r => !r.pago).map(r => `<tr>
      <td class="nome">${esc(r.nome)}</td><td>${esc(r.origem)}</td><td class="num">${r.data}</td>
      <td class="num">${r.uf}</td><td>${esc(r.perfil)}</td>
    </tr>`).join('')}
  </tbody>
</table>

<div class="box grey avoid">
  <strong>Os ${semLead.length} aprovados sem nenhum lead na base</strong> — chegaram ao grupo pela mão do assessor, sem passar por formulário:
  <br>${semLead.map(n => esc(n)).join(' · ')}
</div>

<h2>8. Onde o funil vaza</h2>
<div class="box">
  <ul>
    <li><strong>A automação está fora do jogo.</strong> No período inteiro, <strong>um único cadastro</strong> foi submetido pela ficha
      automática (José Dias Dantas) — e foi recusado. Os outros ${aprovadosTotal - 1} viraram cadastro por conversa solta no grupo, que o
      sistema não casa com cliente nenhum. Enquanto isso não mudar, todo relatório de origem vai depender de cruzar nome à mão, como este.</li>
    <li><strong>R$ ${brl(totCa2.investido)} de mídia produziram ${pagos} cadastros aprovados rastreáveis</strong> — R$ ${brl(totCa2.investido / pagos)}
      por cadastro. Não é um número ruim para o ticket de um comprador de touro; é um número <em>cego</em>, porque depende de
      reconhecimento de nome. Com o lead ID gravado na ficha de cadastro, essa conta sairia sozinha.</li>
    <li><strong>97 MQL geraram 11 cadastros aprovados.</strong> Onde foram parar os outros 86? Essa é a pergunta mais cara do relatório:
      o gargalo não está na mídia, está entre o MQL e a submissão da ficha.</li>
    <li><strong>Nenhum dos ${totCa1.leads} leads da CA1 aparece na nossa planilha.</strong> R$ ${brl(totCa1.investido)} de campanhas de leilão
      entregam lead direto para a leiloeira e nós não temos visibilidade nenhuma sobre o que acontece depois.</li>
    <li><strong>Junho da Bula Remates (10/06 a 07/07) segue sem apuração</strong> — o sistema só registra o grupo a partir de 08/07.
      Se houve aprovação nesse mês, ela não está em nenhum destes números.</li>
  </ul>
</div>

<h2>9. O que fazer com isto</h2>
<div class="box">
  <ul>
    <li><strong>Cortar Audience Network de todas as campanhas.</strong> R$ 329,44 no mês, zero lead, assinatura de clique acidental
      em três campanhas independentes. É a única recomendação aqui que não tem contra-argumento.</li>
    <li><strong>Parar de comprar lead de formulário nativo para o Perpétuo.</strong> R$ 2,11 o lead e 2,1% de MQL: a planilha enche,
      o assessor perde o dia. Migrar a verba para o modelo de landing com vídeo, que é o que São Geraldo (43,1%) e Touros (25,7%) fazem.</li>
    <li><strong>Testar o São Geraldo com verba invertida entre Facebook e Instagram.</strong> Mesmos 13 leads cada, R$ 25,06 contra R$ 67,34.</li>
    <li><strong>Trocar criativo no 3º dia de campanha de landing.</strong> Touros e São Geraldo mostram a mesma queda de MQL a partir daí,
      com frequência subindo — é reimpacto do mesmo público.</li>
    <li><strong>Gravar o lead ID na ficha de cadastro.</strong> É o que transforma este cruzamento manual de nomes em relatório automático —
      e o que permitiria responder de verdade quanto custa um comprador habilitado.</li>
    <li><strong>Atacar os 86 MQL que não viraram cadastro</strong> antes de aumentar verba. Comprar mais lead sem resolver essa passagem
      é pagar duas vezes pelo mesmo gargalo.</li>
  </ul>
</div>

<footer><span>Bula Assessoria — campanhas Meta Ads · janela 01/07 a 02/08/2026</span><span>Uso interno · 3 de agosto de 2026</span></footer>
</body></html>`

const htmlPath = join(outputDir, `${stem}.html`)
const pdfPath = join(outputDir, `${stem}.pdf`)
writeFileSync(htmlPath, html, 'utf-8')
console.log(`HTML: ${htmlPath}`)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`file://${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
await browser.close()
console.log(`PDF: ${pdfPath}`)

const dest = join(desktop, `${desktopName}.pdf`)
copyFileSync(pdfPath, dest)
console.log(`Desktop: ${dest}`)
