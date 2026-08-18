// Relatório da SEMANA — campanhas Meta Ads e cadastros aprovados de
// 27/07/2026 a 01/08/2026.
//
// Fontes (extração literal):
// - Meta Ads (conector oficial), janela 27/07 → 01/08:
//     CA2 - Bula 360 (2705134163151418): LEADS - SAO GERALDO, LEAD - PERPETUO TOURO
//     CA1 - Bula 360 (1155240258865815): CORTE TUPÃ
//     Nenhuma outra campanha teve entrega na janela.
// - Planilha "Leads JMP", aba LEADS GERAIS: 97 leads na janela.
//   MQL = piso da faixa ≥100 cabeças E I.E. = Sim (evaluateMql, crm-types.ts).
// - Cadastros: relatório "Cadastros Bula Remates" de 01/08 (grupo apurado
//   mensagem a mensagem) — no grupo da Programa não houve decisão na janela.
//
// Saídas: outputs/relatorio-campanhas-semana-2026-08-01.{html,pdf}
//         Desktop/Relatorio Semanal Campanhas e Cadastros - 27-07 a 01-08-2026.pdf
//
// Uso: node scripts/gera-relatorio-campanhas-semana-2026-08-01.mjs

import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'outputs')
const desktop = join(process.env.USERPROFILE || '', 'Desktop')
const stem = 'relatorio-campanhas-semana-2026-08-01'
const desktopName = 'Relatorio Semanal Campanhas e Cadastros - 27-07 a 01-08-2026'
mkdirSync(outputDir, { recursive: true })

// ---------------------------------------------------------------------------
// 1) Meta Ads na semana
// ---------------------------------------------------------------------------

const campanhas = [
  {
    nome: 'LEADS - SAO GERALDO', conta: 'CA2', status: 'Ativa', inicio: '29/07',
    investido: 1413.59, impressoes: 123241, alcance: 96363, freq: 1.28, cliques: 2398,
    ctr: 1.95, cpc: 0.59, cpm: 11.47, leads: 26, cpl: 54.37, lpv: 812,
    nota: 'Toda a vida da campanha cabe nesta semana. Mistura formulário da Meta e landing — o CPL do painel não é o custo real.',
  },
  {
    nome: 'LEAD - PERPETUO TOURO', conta: 'CA2', status: 'Ativa', inicio: '24/07',
    investido: 1192.58, impressoes: 99745, alcance: 56415, freq: 1.77, cliques: 1390,
    ctr: 1.39, cpc: 0.86, cpm: 11.96, leads: null, cpl: null, lpv: 693,
    nota: 'Otimizada por pixel: 7 conversões "MQL Perpetuo Touros" a R$ 170,37 na semana — contra R$ 116,69 no acumulado. Piorou.',
  },
  {
    nome: 'CORTE TUPÃ', conta: 'CA1', status: 'Ativa', inicio: '27/07',
    investido: 345.48, impressoes: 28377, alcance: 13673, freq: 2.08, cliques: 523,
    ctr: 1.84, cpc: 0.66, cpm: 12.17, leads: 7, cpl: 49.35, lpv: null,
    nota: 'Campanha de leilão: o lead cai no formulário da leiloeira e não entra na nossa planilha.',
  },
]

// ---------------------------------------------------------------------------
// 2) Régua da casa — planilha de leads
// ---------------------------------------------------------------------------

const frentes = [
  { nome: 'São Geraldo', campanha: 'LEADS - SAO GERALDO', investido: 1413.59, leads: 51, mql: 22, ie: 37 },
  { nome: 'Touros Perpétuo', campanha: 'LEAD - PERPETUO TOURO', investido: 1192.58, leads: 45, mql: 8, ie: 19 },
]
const leadsSemana = 97
const mqlSemana = 30
const ieSemana = 57
const investCa2 = 2606.17
const investTotal = 2951.65

const serie = [
  { d: '27/07', touros: [13, 2], sg: null },
  { d: '28/07', touros: [9, 1], sg: null },
  { d: '29/07', touros: [11, 4], sg: [12, 5] },
  { d: '30/07', touros: [6, 1], sg: [15, 7] },
  { d: '31/07', touros: [5, 0], sg: [17, 6] },
  { d: '01/08', touros: [1, 0], sg: [7, 4] },
]

const plataformasMeta = [
  { camp: 'São Geraldo', plat: 'Instagram', investido: 875.36, impressoes: 97721, cliques: 822, ctr: 0.84, cpm: 8.96, leads: 13, cpl: 67.34 },
  { camp: 'São Geraldo', plat: 'Facebook', investido: 325.74, impressoes: 23068, cliques: 1130, ctr: 4.90, cpm: 14.12, leads: 13, cpl: 25.06 },
  { camp: 'São Geraldo', plat: 'Audience Network', investido: 211.89, impressoes: 2419, cliques: 443, ctr: 18.31, cpm: 87.60, leads: 0, cpl: null },
  { camp: 'Perpétuo Touro', plat: 'Instagram', investido: 932.50, impressoes: 82381, cliques: 990, ctr: 1.20, cpm: 11.32, leads: null, cpl: null, lpv: 540 },
  { camp: 'Perpétuo Touro', plat: 'Facebook', investido: 241.52, impressoes: 16450, cliques: 354, ctr: 2.15, cpm: 14.68, leads: null, cpl: null, lpv: 119 },
  { camp: 'Perpétuo Touro', plat: 'Audience Network', investido: 15.51, impressoes: 692, cliques: 43, ctr: 6.21, cpm: 22.41, leads: null, cpl: null, lpv: 30 },
]

// Como o lead se identificou na planilha (utm/platform gravado no formulário).
const plataformasPlanilha = [
  { plat: 'Facebook', investido: 567.26, leads: 78, mql: 25 },
  { plat: 'Instagram', investido: 1807.86, leads: 11, mql: 3 },
  { plat: 'Site (direto)', investido: null, leads: 7, mql: 2 },
]

const ufs = [
  ['MG', 13, 6], ['SP', 12, 1], ['MA', 9, 2], ['BA', 9, 2], ['RO', 5, 4],
  ['RJ', 5, 2], ['MS', 5, 2], ['TO', 4, 1], ['PA', 4, 1], ['MT', 3, 2], ['PE', 3, 1], ['DF', 2, 1],
]

// ---------------------------------------------------------------------------
// 3) Cadastros da semana — grupo Cadastros Bula Remates
// ---------------------------------------------------------------------------

const aprovados = [
  { data: '28/07', nome: 'Cliente consultado a pedido do Douglas', uf: '—', assessor: 'Leonardo Serafim', ev: '"cadastro bom!" → "Passei para o Serafim"', lead: null, obs: 'Sem nome no grupo — identificar com o Douglas.' },
  { data: '30/07', nome: 'Marcus André Madeira Campos Almeida', uf: '—', assessor: 'A DEFINIR', ev: '"opa cadastro bom" · score 890/1000', lead: 'provável · "Marcus almeida" (MA, 501–1000 cab.) — Landing São Geraldo, 30/07', obs: 'Único aprovado da semana ainda sem assessor.' },
  { data: '30/07', nome: 'Trajano Pinheiro', uf: 'MG', assessor: 'Leonardo Serafim', ev: '"score bom, cadastro ok!"', lead: null, obs: 'MG é zona do Fábio — grupo direcionou ao Leonardo. I.E. de corte com 0 ano.' },
  { data: '31/07', nome: 'Laércio José Oliveira Almeida', uf: 'MG', assessor: 'Leonardo Serafim', ev: '"cadastro bom, aprovado"', lead: 'Landing São Geraldo, 30/07 · 100–500 cab. · I.E. Sim (MQL)', obs: 'MG é zona do Fábio.' },
  { data: '31/07', nome: 'Altair Cacho — Faz. Terra Preta', uf: 'MS', assessor: 'Leonardo Serafim', ev: 'Consulta do João → "Top" → direcionado', lead: 'Landing São Geraldo, 31/07 · 100–500 cab. · I.E. Sim (MQL)', obs: 'Aprovação implícita; grupo comentou "é o Galdino… está dando b.o." — checar antes de parcelar.' },
  { data: '31/07', nome: 'Hênio Suassuna Ferreira', uf: 'PB', assessor: 'Fábio Omena Gaia', ev: '"Henio aprovado" · score 762 · 600 ha', lead: null, obs: 'Não confundir com Hênio Pablo Farias Silva, reprovado em 01/08.' },
  { data: '31/07', nome: 'Marusan Mendes de Souza', uf: '—', assessor: 'Leonardo Serafim', ev: '"Marusan aprovado"', lead: null, obs: 'Recusado 2× na Programa (14 e 20/07) e aprovado na Remates — veio da revisão dos recusados.' },
  { data: '31/07', nome: 'Leandro Oliveira Rios Natal dos Santos', uf: 'MG', assessor: 'Leonardo Serafim', ev: '"Leandro aprovado" · score 988', lead: 'provável · "Leandro rios" (MG, 100–500 cab.) — Landing Touros, 28/07 (MQL)', obs: 'MG é zona do Fábio. Área arrendada até 2029.' },
  { data: '31/07', nome: 'Rodrigo de Proença Oliveira Braga', uf: 'RJ', assessor: 'Fábio Omena Gaia', ev: 'Ficha score 689 · I.E. 2 meses — "Apto"', lead: 'Landing São Geraldo, 30/07 · 1–99 cab. · I.E. Sim', obs: 'Processo trabalhista de R$ 500 mil apontado na 1ª consulta — conferir antes de parcelar.' },
  { data: '31/07', nome: 'Carlos Augusto dos Santos Sousa', uf: 'MA', assessor: 'Douglas Bispo', ev: 'Ficha score 900 · 139 ha próprios', lead: null, obs: 'I.E. não confirmada: o Maranhão bloqueia consulta no Sintegra — não desabona.' },
  { data: '01/08', nome: 'Wellington Ferreira dos Santos', uf: 'PA', assessor: 'Douglas Bispo', ev: '"cadastro bom do wellington"', lead: 'Meta — LEADS - FORMS INST EAO (10/07) · 101–300 cab. · I.E. Sim', obs: 'Lead de campanha anterior à semana, fechado agora — o ciclo levou 22 dias.' },
  { data: '01/08', nome: 'Braz de Oliveira Bueno', uf: 'PA', assessor: 'Douglas Bispo', ev: '"dá pra vender com cautela — 1 ou 2 lotes"', lead: null, obs: 'Aprovado COM LIMITE — não tratar como cadastro cheio.' },
  { data: '01/08', nome: 'Fabio Rafael da Cunha Silva', uf: 'MG', assessor: 'Leonardo Serafim', ev: '"cadastro ok Fabio" (o Fabio é o cliente)', lead: 'Meta — LEADS - SAO GERALDO, 01/08 · 51–100 cab. · I.E. Sim', obs: 'MG é zona do Fábio Omena.' },
  { data: '01/08', nome: 'Geniuce (CNPJ 53.748.659/0001-07)', uf: '—', assessor: 'Fábio Omena Gaia', ev: '5 CNPJs desde 1985, sem dívidas · I.E. ativa de corte', lead: null, obs: 'Sem área própria: alinhar prazo de arrendamento × 30 parcelas. Quer dois touros.' },
  { data: '01/08', nome: 'Davison Avelino Gomes Pinto', uf: 'SP', assessor: 'Fábio Omena Gaia', ev: '"DAVISON AVELINO GOMES PINTO — cadastro bom"', lead: 'Landing São Geraldo, 31/07 · 100–500 cab. · I.E. Sim (MQL)', obs: '' },
]

const reprovados = [
  { data: '28/07', nome: 'José Dias Dantas (CAD-8B5ED)', motivo: 'RECUSADO — único cadastro do período submetido pela ficha automática' },
  { data: '31/07', nome: 'Maria Sabrina Neta / neto (Galdino)', motivo: 'Bloqueado com a leiloeira: "bloqueia até na assessoria, pra ninguém tentar vender em outra". CPF restrito' },
  { data: '31/07', nome: 'Denis Igor Silva Santos', motivo: '23 anos e com restrição — reprovado' },
  { data: '01/08', nome: 'Hênio Pablo Farias Silva — Malhada/BA', motivo: 'Sem I.E. e com restrição — reprovado' },
  { data: '01/08', nome: 'Gabriel Licínio Holanda Peruchi', motivo: 'INAPTO — "única opção pra ele é à vista"' },
  { data: '01/08', nome: 'Hélio (sobrenome não citado)', motivo: 'Com restrições e protestos — reprovado' },
  { data: '01/08', nome: 'Dienifer', motivo: 'INAPTA — score 387, restrições de R$ 1.297, I.E. não compatível com produção rural' },
  { data: '01/08', nome: 'Cliente sem nome (manhã de 01/08)', motivo: 'Não possui I.E.; score razoável — não aprovado' },
  { data: '01/08', nome: 'CNPJ aberto há 2 meses', motivo: '"averiguar melhor" — sem decisão até o fechamento da apuração' },
]

const porAssessor = [
  { nome: 'Leonardo Serafim', zona: 'Centro-Oeste + Sul', n: 7, clientes: ['Cliente s/ nome (28/07)', 'Trajano Pinheiro', 'Laércio José O. Almeida', 'Altair Cacho', 'Marusan Mendes de Souza', 'Leandro O. R. Natal dos Santos', 'Fabio Rafael da Cunha Silva'] },
  { nome: 'Fábio Omena Gaia', zona: 'Nordeste (exc. MA) + Sudeste', n: 4, clientes: ['Hênio Suassuna Ferreira', 'Rodrigo de Proença O. Braga', 'Geniuce (CNPJ)', 'Davison Avelino Gomes Pinto'] },
  { nome: 'Douglas Bispo', zona: 'Norte + Maranhão', n: 3, clientes: ['Carlos Augusto dos Santos Sousa', 'Wellington Ferreira dos Santos', 'Braz de Oliveira Bueno'] },
  { nome: 'A definir', zona: 'sem UF e sem direcionamento', n: 1, clientes: ['Marcus André M. C. Almeida'] },
]

// ---------------------------------------------------------------------------
const brl = (n) => n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (n) => n == null ? '—' : n.toLocaleString('pt-BR')
const pct = (n) => n == null ? '—' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const tot = campanhas.reduce((a, c) => ({
  investido: a.investido + c.investido, impressoes: a.impressoes + c.impressoes, cliques: a.cliques + c.cliques,
}), { investido: 0, impressoes: 0, cliques: 0 })
const comLead = aprovados.filter(a => a.lead).length
const decididos = aprovados.length + reprovados.length - 1 // o CNPJ de 01/08 ficou sem decisão

const cel = (v) => v ? `${v[0]} <span class="mq">/${v[1]}</span>` : '<span class="off">—</span>'

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Semana 27/07 a 01/08/2026 — campanhas e cadastros</title>
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
  .card ol { margin: 5px 0 0; padding-left: 13px; font-size: 8.2px; }
  .bar { display: inline-block; height: 7px; background: #111; vertical-align: middle; }
  .mq { color: #666; }
  .off { color: #bbb; }
  .avoid { break-inside: avoid; }
  .pg { break-before: page; }
  footer { position: fixed; bottom: 4mm; left: 0; right: 0; font-size: 7.4px; color: #888; display: flex; justify-content: space-between; }
</style></head><body>

<div class="cap">
  <div>
    <h1>Semana de 27/07 a 01/08</h1>
    <div class="sub">Campanhas Meta Ads, leads qualificados e cadastros decididos nos grupos — o que a semana comprou e o que ela entregou</div>
  </div>
  <div class="meta">
    <div class="tot">R$ ${brl(tot.investido)}<small>investido em 6 dias</small></div>
    <div style="margin-top:6px">Bula Assessoria · 3 de agosto de 2026<br>3 campanhas com entrega · 97 leads · 15 aprovados</div>
  </div>
</div>

<div class="cards">
  <div class="card"><div class="z">Investimento</div><div class="n">R$ ${brl(tot.investido)}<small>CA2 R$ ${brl(investCa2)} · CA1 R$ 345,48</small></div></div>
  <div class="card"><div class="z">Entrega</div><div class="n">${num(tot.impressoes)}<small>impressões · ${num(tot.cliques)} cliques</small></div></div>
  <div class="card"><div class="z">Leads na planilha</div><div class="n">${leadsSemana}<small>R$ ${brl(investCa2 / leadsSemana)} por lead</small></div></div>
  <div class="card"><div class="z">MQL (≥100 cab. + I.E.)</div><div class="n">${mqlSemana}<small>${pct(mqlSemana / leadsSemana * 100)} dos leads · R$ ${brl(investCa2 / mqlSemana)} por MQL</small></div></div>
  <div class="card"><div class="z">Cadastros aprovados</div><div class="n">${aprovados.length}<small>${comLead} com lead de origem rastreado</small></div></div>
</div>

<div class="box">
  <strong>A semana em uma frase.</strong> Foi a melhor semana do mês em qualidade de lead — <strong>${pct(mqlSemana / leadsSemana * 100)} de MQL</strong>
  contra 13,3% no acumulado de julho — porque as duas campanhas no ar eram de touros com landing, e não formulário nativo.
  Em paralelo, o grupo da Bula Remates decidiu ${decididos} cadastros e aprovou ${aprovados.length}.
  <br><br><strong>Como ler.</strong> A Meta chama de <em>lead</em> quem preencheu o formulário. A régua da casa é o
  <strong>MQL: 100 cabeças ou mais E Inscrição Estadual</strong> — a mesma que o sistema aplica. Toda campanha aparece nas duas leituras.
</div>

<h2>1. As três campanhas que rodaram</h2>
<table>
  <thead><tr>
    <th style="width:24%">Campanha</th><th style="width:6%">Conta</th>
    <th class="r" style="width:9%">Investido</th><th class="r" style="width:9%">Impressões</th><th class="r" style="width:8%">Alcance</th>
    <th class="r" style="width:5%">Freq.</th><th class="r" style="width:7%">Cliques</th><th class="r" style="width:5%">CTR</th>
    <th class="r" style="width:5%">CPC</th><th class="r" style="width:5%">CPM</th><th class="r" style="width:6%">Leads</th><th class="r" style="width:6%">CPL</th>
  </tr></thead>
  <tbody>
    ${campanhas.map(c => `<tr>
      <td class="nome">${esc(c.nome)}<br><span class="micro">${esc(c.nota)}</span></td>
      <td>${c.conta}<br><span class="micro">desde ${c.inicio}</span></td>
      <td class="num">${brl(c.investido)}</td><td class="num">${num(c.impressoes)}</td><td class="num">${num(c.alcance)}</td>
      <td class="num">${c.freq.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="num">${num(c.cliques)}</td><td class="num">${pct(c.ctr)}</td><td class="num">${brl(c.cpc)}</td><td class="num">${brl(c.cpm)}</td>
      <td class="num">${c.leads == null ? '<span class="micro">pixel</span>' : num(c.leads)}</td><td class="num">${brl(c.cpl)}</td>
    </tr>`).join('')}
  </tbody>
  <tfoot><tr>
    <td colspan="2">Total da semana</td><td class="num">${brl(tot.investido)}</td><td class="num">${num(tot.impressoes)}</td>
    <td class="num">—</td><td class="num">—</td><td class="num">${num(tot.cliques)}</td>
    <td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">33</td><td class="num">—</td>
  </tr></tfoot>
</table>
<div class="box grey avoid">
  Nenhuma outra campanha teve entrega na janela: EAO e Perpétuo (formulário) pararam em 12/07, e as demais da CA1 estão com verba zerada.
  A conta Fórmula do Boi não gastou nada.
</div>

<h2>2. A régua da casa — o que custou o lead que presta</h2>
<table>
  <thead><tr>
    <th style="width:20%">Frente</th><th style="width:22%">Campanha</th>
    <th class="r" style="width:11%">Investido</th><th class="r" style="width:8%">Leads</th><th class="r" style="width:9%">CPL real</th>
    <th class="r" style="width:7%">MQL</th><th class="r" style="width:8%">% MQL</th><th class="r" style="width:11%">Custo/MQL</th><th style="width:4%"></th>
  </tr></thead>
  <tbody>
    ${[...frentes].sort((a, b) => (a.investido / a.mql) - (b.investido / b.mql)).map(f => {
      const cm = f.investido / f.mql
      return `<tr>
        <td class="nome">${esc(f.nome)}</td><td class="micro">${esc(f.campanha)}</td>
        <td class="num">${brl(f.investido)}</td><td class="num">${f.leads}</td><td class="num">${brl(f.investido / f.leads)}</td>
        <td class="num">${f.mql}</td><td class="num">${pct(f.mql / f.leads * 100)}</td>
        <td class="num warn">${brl(cm)}</td>
        <td><span class="bar" style="width:${Math.round(cm / 150 * 34)}px"></span></td>
      </tr>`
    }).join('')}
  </tbody>
  <tfoot><tr>
    <td colspan="2">Total CA2</td><td class="num">${brl(investCa2)}</td><td class="num">${leadsSemana}</td>
    <td class="num">${brl(investCa2 / leadsSemana)}</td><td class="num">${mqlSemana}</td>
    <td class="num">${pct(mqlSemana / leadsSemana * 100)}</td><td class="num">${brl(investCa2 / mqlSemana)}</td><td></td>
  </tr></tfoot>
</table>
<div class="box avoid">
  <strong>São Geraldo custa metade do Touros por lead qualificado.</strong> As duas campanhas cobram praticamente o mesmo por lead
  (R$ 27,72 e R$ 26,50), mas o São Geraldo entrega <strong>43,1% de MQL</strong> contra <strong>17,8%</strong> do Touros — e por isso o
  MQL sai a R$ 64,25 de um lado e R$ 149,07 do outro. Vale notar que o Touros vem <em>piorando</em>: no acumulado desde 24/07 ele estava
  em 25,7% de MQL; nesta semana caiu para 17,8%, e o próprio pixel da Meta encareceu de R$ 116,69 para R$ 170,37 por conversão.
</div>

<h2>3. Dia a dia — leads e MQL</h2>
<div class="box grey">Lê-se <strong>leads<span class="mq">/MQL</span></strong>. O São Geraldo entrou no ar em 29/07.</div>
<table>
  <thead><tr><th style="width:16%">Dia</th><th class="r" style="width:28%">Touros Perpétuo</th><th class="r" style="width:28%">São Geraldo</th><th class="r" style="width:28%">Total do dia</th></tr></thead>
  <tbody>
    ${serie.map(s => {
      const l = (s.touros?.[0] || 0) + (s.sg?.[0] || 0)
      const m = (s.touros?.[1] || 0) + (s.sg?.[1] || 0)
      return `<tr><td class="num">${s.d}</td><td class="num">${cel(s.touros)}</td><td class="num">${cel(s.sg)}</td><td class="num">${l} <span class="mq">/${m}</span></td></tr>`
    }).join('')}
  </tbody>
</table>
<div class="box avoid">
  <strong>O Touros morreu durante a semana.</strong> Começou em 27/07 com 13 leads e terminou em 01/08 com 1 — e, mais grave,
  os últimos três dias somaram <strong>zero MQL</strong>. A frequência (1,77) confirma o motivo: é o mesmo público sendo reimpactado.
  A campanha já deveria ter trocado de criativo ou de verba na quinta-feira.
  <br><br>
  <strong>O São Geraldo sustentou.</strong> Entrou em 29/07 e manteve 4 a 7 MQL por dia até o fim da janela — foi ele que segurou
  a qualidade da semana inteira.
</div>

<h2 class="pg">4. Onde o dinheiro entrega — e onde some</h2>
<h3>Como a Meta reporta</h3>
<table>
  <thead><tr>
    <th style="width:18%">Campanha</th><th style="width:16%">Plataforma</th>
    <th class="r" style="width:12%">Investido</th><th class="r" style="width:12%">Impressões</th><th class="r" style="width:10%">Cliques</th>
    <th class="r" style="width:9%">CTR</th><th class="r" style="width:10%">CPM</th><th class="r" style="width:7%">Leads</th><th class="r" style="width:10%">CPL</th>
  </tr></thead>
  <tbody>
    ${plataformasMeta.map(p => `<tr>
      <td class="nome">${esc(p.camp)}</td>
      <td>${p.plat === 'Audience Network' ? `<span class="warn">${p.plat}</span>` : p.plat}</td>
      <td class="num">${brl(p.investido)}</td><td class="num">${num(p.impressoes)}</td><td class="num">${num(p.cliques)}</td>
      <td class="num">${pct(p.ctr)}</td><td class="num">${brl(p.cpm)}</td>
      <td class="num">${p.leads == null ? `<span class="micro">${p.lpv ?? '—'} LPV</span>` : num(p.leads)}</td>
      <td class="num">${brl(p.cpl)}</td>
    </tr>`).join('')}
  </tbody>
</table>

<h3>Como o lead se identificou na planilha</h3>
<table>
  <thead><tr>
    <th style="width:24%">Plataforma</th><th class="r" style="width:18%">Verba recebida</th><th class="r" style="width:14%">Leads</th>
    <th class="r" style="width:12%">MQL</th><th class="r" style="width:16%">Custo/lead</th><th class="r" style="width:16%">Custo/MQL</th>
  </tr></thead>
  <tbody>
    ${plataformasPlanilha.map(p => `<tr>
      <td class="nome">${p.plat}</td>
      <td class="num">${p.investido == null ? '<span class="micro">tráfego direto</span>' : `${brl(p.investido)} <span class="micro">(${(p.investido / investCa2 * 100).toFixed(0)}%)</span>`}</td>
      <td class="num">${p.leads}</td><td class="num">${p.mql}</td>
      <td class="num">${p.investido == null ? '—' : brl(p.investido / p.leads)}</td>
      <td class="num warn">${p.investido == null ? '—' : brl(p.investido / p.mql)}</td>
    </tr>`).join('')}
  </tbody>
</table>
<div class="box avoid">
  <strong>A verba está na rede errada — e dois sistemas dizem a mesma coisa.</strong> O Instagram levou
  <strong>R$ 1.807,86 (69% da verba)</strong> e devolveu 11 leads e 3 MQL. O Facebook levou <strong>R$ 567,26 (22%)</strong>
  e devolveu <strong>78 leads e 25 MQL</strong> — R$ 22,69 por MQL contra R$ 602,62 do Instagram.
  O painel da Meta aponta na mesma direção por outro caminho: no São Geraldo, mesmos 13 leads em cada rede,
  com o Facebook custando <strong>R$ 25,06</strong> e o Instagram <strong>R$ 67,34</strong>.
  <span class="micro">(A leitura da planilha vem da tag utm/platform gravada no formulário; ela não bate lead a lead com a atribuição da Meta,
  mas as duas leituras concordam na direção — e é a planilha que o assessor trabalha.)</span>
  <br><br>
  <strong>Audience Network: R$ 227,40 na semana, zero lead.</strong> No São Geraldo foram R$ 211,89 para 443 cliques, 358 visitas à
  landing e nenhum formulário preenchido — CTR de 18,31% e CPM de R$ 87,60, a assinatura clássica de clique acidental em aplicativo.
  Excluir esse posicionamento é a decisão de maior retorno imediato e não tem contra-argumento.
</div>

<h2>5. Quem respondeu</h2>
<div style="display:flex; gap:12px">
  <div style="flex:1">
    <h3>Perfil</h3>
    <div class="box grey" style="margin-top:4px">
      <strong>88 dos 97 leads pediram touro</strong> — e 30 deles são MQL (34,1%). Os outros 9 (bezerras, matrizes, sêmen, embriões)
      não geraram um único MQL. As duas campanhas da semana eram de touros: o público veio coerente com a oferta,
      que é exatamente o que não acontecia no formulário do Perpétuo.
      <br><br>
      <strong>57 dos 97 declararam Inscrição Estadual</strong> (58,8%), contra 40,7% no acumulado de julho.
    </div>
  </div>
  <div style="flex:1">
    <h3>Top estados por MQL</h3>
    <table>
      <thead><tr><th style="width:26%">UF</th><th class="r" style="width:24%">Leads</th><th class="r" style="width:20%">MQL</th><th class="r" style="width:30%">% MQL</th></tr></thead>
      <tbody>${ufs.map(([u, l, m]) => `<tr><td class="nome">${u}</td><td class="num">${l}</td><td class="num">${m}</td><td class="num">${pct(m / l * 100)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="micro" style="margin-top:5px">
      Rondônia fez 4 MQL em 5 leads (80%) e Mato Grosso 2 em 3. São Paulo trouxe 12 leads e 1 MQL — o mesmo padrão do mês:
      o norte agropecuário converte, o Sudeste urbano infla volume.
    </div>
  </div>
</div>

<h2 class="pg">6. Cadastros decididos na semana — grupo Bula Remates</h2>
<div class="box grey">
  ${decididos} decisões registradas entre 28/07 e 01/08, todas no grupo <strong>Cadastros Bula Remates</strong> —
  no grupo da Programa não houve nenhuma decisão na janela. Cada linha carrega a frase que a sustenta.
</div>
<div class="cards">
  <div class="card"><div class="z">Aprovados</div><div class="n">${aprovados.length}<small>${((aprovados.length / decididos) * 100).toFixed(0)}% das decisões</small></div></div>
  <div class="card"><div class="z">Reprovados / inaptos</div><div class="n">${reprovados.length - 1}<small>+1 sem decisão até o fechamento</small></div></div>
  <div class="card"><div class="z">Com lead de origem</div><div class="n">${comLead}<small>de ${aprovados.length} aprovados</small></div></div>
  <div class="card"><div class="z">Pela ficha automática</div><div class="n">1<small>José Dias Dantas — e foi recusado</small></div></div>
</div>

<h3>Os ${aprovados.length} aprovados</h3>
<table>
  <thead><tr>
    <th style="width:5%">Data</th><th style="width:19%">Cliente</th><th style="width:4%">UF</th>
    <th style="width:12%">Assessor</th><th style="width:20%">Evidência no grupo</th><th style="width:18%">Lead de origem</th><th style="width:22%">Observação</th>
  </tr></thead>
  <tbody>
    ${aprovados.map(a => `<tr>
      <td class="num">${a.data}</td><td class="nome">${esc(a.nome)}</td><td class="num">${a.uf}</td>
      <td>${a.assessor === 'A DEFINIR' ? `<span class="warn">${a.assessor}</span>` : `<strong>${esc(a.assessor)}</strong>`}</td>
      <td style="font-style:italic">${esc(a.ev)}</td>
      <td>${a.lead ? esc(a.lead) : '<span class="micro">não está na base de leads</span>'}</td>
      <td>${esc(a.obs)}</td>
    </tr>`).join('')}
  </tbody>
</table>

<h3>Distribuição por assessor</h3>
<div class="cards">
  ${porAssessor.map(p => `<div class="card avoid">
    <div class="z">${esc(p.zona)}</div>
    <div style="font-family:'Oswald',Arial,sans-serif;text-transform:uppercase;font-size:10.5px;font-weight:700">${esc(p.nome)}</div>
    <div class="n">${p.n}<small>aprovados na semana</small></div>
    <ol>${p.clientes.map(c => `<li>${esc(c)}</li>`).join('')}</ol>
  </div>`).join('')}
</div>

<h3>Reprovados, inaptos e bloqueados</h3>
<table>
  <thead><tr><th style="width:7%">Data</th><th style="width:30%">Cliente</th><th style="width:63%">Motivo registrado no grupo</th></tr></thead>
  <tbody>
    ${reprovados.map(r => `<tr><td class="num">${r.data}</td><td class="nome">${esc(r.nome)}</td><td>${esc(r.motivo)}</td></tr>`).join('')}
  </tbody>
</table>

<h2>7. O que a semana mostrou</h2>
<div class="box">
  <ul>
    <li><strong>O São Geraldo é o modelo a repetir.</strong> 43,1% de MQL e R$ 64,25 por lead qualificado, sustentando o número dia após dia.
      Quatro dos ${aprovados.length} aprovados da semana vieram de leads dessa landing — Laércio, Altair, Rodrigo de Proença e Davison —
      todos com decisão em 24 a 48 horas depois do cadastro. É o ciclo mais curto que já apareceu nesses relatórios.</li>
    <li><strong>Trocar a verba do Instagram para o Facebook.</strong> 69% do dinheiro na rede que fez 3 MQL, 22% na que fez 25.
      Duas fontes independentes apontam o mesmo. Começar invertendo metade e medir uma semana.</li>
    <li><strong>Cortar Audience Network.</strong> R$ 227,40 na semana, zero lead, terceira semana seguida com a mesma assinatura.</li>
    <li><strong>O Touros precisa de criativo novo ou de pausa.</strong> Três dias seguidos sem MQL com frequência subindo é dinheiro
      comprando a mesma pessoa de novo.</li>
    <li><strong>Três aprovados de MG foram para o Leonardo</strong> — Trajano, Leandro Rios e Fabio Rafael. Pela regra de zona, MG é do
      Fábio Omena. Ou a regra muda, ou os três trocam de mão; hoje o CRM e o grupo discordam.</li>
    <li><strong>Quatro aprovados exigem decisão antes de vender:</strong> Altair Cacho (comentário de b.o. na mesma conversa),
      Rodrigo de Proença (processo trabalhista de R$ 500 mil), Braz de Oliveira (teto de 1 a 2 lotes) e Marusan
      (recusado duas vezes pela Programa).</li>
    <li><strong>A automação segue fora do jogo.</strong> Dos ${decididos} cadastros decididos, <strong>um</strong> passou pela ficha automática —
      e foi recusado. Os outros ${decididos - 1} são conversa solta no grupo, que o sistema não casa com cliente nenhum.
      Enquanto o lead ID não for gravado na ficha, o vínculo campanha → cadastro vai continuar sendo feito por reconhecimento de nome, como aqui.</li>
    <li><strong>30 MQL na semana, ${comLead} cadastros com origem rastreada.</strong> O gargalo não está na mídia: está entre o MQL
      e a submissão da ficha.</li>
  </ul>
</div>

<footer><span>Bula Assessoria — semana de 27/07 a 01/08/2026</span><span>Uso interno · 3 de agosto de 2026</span></footer>
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
