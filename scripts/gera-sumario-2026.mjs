/**
 * SUMÁRIO EXECUTIVO (PDF de 1 página) — a folha de rosto da pasta.
 *
 *   node scripts/gera-sumario-2026.mjs [pasta-de-saida]
 *
 * Existe porque a diretoria vai abrir a pasta antes de abrir os relatórios:
 * diz o que há em cada arquivo, dá as cinco respostas diretas e lista, sem
 * rodeio, o que ainda falta para fechar os números.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pagina, paraPdf, esc, brl, brl0, num, pct, dataBr } from './lib/relatorio-2026-visual.mjs'
import { INVESTIDO_APURADO, APURADO_ATE } from './lib/midia-2026.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const saida = process.argv[2] || DIR

const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base-clientes.json'), 'utf8'))
const leiloes = JSON.parse(fs.readFileSync(path.join(DIR, 'leiloes-2026.json'), 'utf8'))
const compras = JSON.parse(fs.readFileSync(path.join(DIR, 'compras-2026.json'), 'utf8'))
const f = JSON.parse(fs.readFileSync(path.join(DIR, 'funil-2026.json'), 'utf8'))

const HOJE = '13/08/2026'
const VGV = Math.round(leiloes.reduce((a, l) => a + l.vgv, 0) * 100) / 100
const VGV_BASE = Math.round(base.reduce((a, p) => a + p.volumeCompra, 0) * 100) / 100
const semCadastro = base.filter(p => !p.cpf || !p.telefone)
const aprovados = f.cadastros.manual.aprovados
const submetidos = f.cadastros.sistema.pessoas

const html = pagina('Sumário — Bula 2026', `
<div class="cap">
  <div><h1>Base de clientes e campanhas — 2026</h1>
  <div class="sub">Sumário da pasta: o que foi apurado, o que os números dizem e o que ainda falta fechar.</div></div>
  <div class="meta">Bula Assessoria<br>Base: 01/01 a 13/08/2026<br>Emitido em ${HOJE}</div>
</div>

<h2>O que há nesta pasta</h2>
<table>
  <thead><tr><th>Arquivo</th><th>Para que serve</th></tr></thead>
  <tbody>
    <tr><td class="nome">1 — Desempenho das Campanhas e Conversão</td>
      <td>O funil do ano inteiro: leads, qualificados, cadastros submetidos, aprovados, quantos compraram e quanto venderam. Traz custo por lead, por cadastro e CAC.</td></tr>
    <tr><td class="nome">2 — Base de Clientes Ativos</td>
      <td>Quem compra: volume, concentração, geografia, categorias, assessor, recorrência — e o diagnóstico do cadastro.</td></tr>
    <tr><td class="nome">Base-Clientes-Bula-2026.xlsx</td>
      <td>A base para trabalhar. Abas: BASE DE CLIENTES (${num(base.length)} pessoas), COMPRAS (${num(compras.length)} arremates conferíveis), LEILÕES (${num(leiloes.length)}), <strong>A COMPLETAR</strong> (a fila de cadastro) e DICIONÁRIO.</td></tr>
  </tbody>
</table>

<h2>As respostas, em uma linha cada</h2>
<table>
  <thead><tr><th>Pergunta</th><th class="r">Resposta</th><th>Ressalva</th></tr></thead>
  <tbody>
    <tr><td class="et">Quanto a Bula vendeu em 2026</td><td class="num q">${brl0(VGV)}</td>
      <td>Cobertura Bula em ${num(leiloes.length)} leilões, de 01/01 a 13/08. Soma o ERP e os fechamentos que nunca foram lançados nele.</td></tr>
    <tr><td class="et">Quantos clientes compraram</td><td class="num q">${num(base.length)}</td>
      <td>${brl0(VGV_BASE)} identificados; o resto é leilão sem comprador nominal registrado.</td></tr>
    <tr><td class="et">Quantos leads entraram</td><td class="num q">${num(f.leads.total)}</td>
      <td>Só de junho em diante — antes disso não havia captação registrada. ${num(f.leads.deCampanha)} vieram de campanha.</td></tr>
    <tr><td class="et">Quantos são qualificados</td><td class="num q">${num(f.leads.mql)}</td>
      <td>${pct(f.leads.mql, f.leads.total)} — regra oficial: ≥ 100 cabeças e Inscrição Estadual.</td></tr>
    <tr><td class="et">Quantos cadastros submetemos</td><td class="num q">${num(submetidos)}</td>
      <td>Pessoas registradas no sistema, em julho, para 2 leiloeiras. Depois de 08/07 o registro parou.</td></tr>
    <tr><td class="et">Quantos foram aprovados</td><td class="num q">${num(aprovados)}</td>
      <td>Apuração manual dos grupos até 01/08, com a frase que sustenta cada decisão. Não divida pelos ${num(submetidos)}: universos diferentes.</td></tr>
    <tr><td class="et">Quantos aprovados compraram</td><td class="num q">${num(f.conversao.aprovadosQueCompraram)}</td>
      <td>Somando ${brl0(f.conversao.vgvDosAprovados)} de compra no ano.</td></tr>
    <tr><td class="et">Quanto a campanha vendeu</td><td class="num q">${brl0(f.conversao.vgvAtribuivel)}</td>
      <td><strong>${num(f.conversao.atribuiveis)} clientes</strong> que compraram DEPOIS de entrar como lead. É o único recorte que a mídia pode reivindicar.</td></tr>
    <tr><td class="et">Investido em mídia</td><td class="num q">${brl0(INVESTIDO_APURADO)}</td>
      <td>Piso apurado até ${dataBr(APURADO_ATE)} — falta autenticar o conector da Meta para fechar o ano.</td></tr>
    <tr><td class="et">Custo por cadastro</td><td class="num q">${brl(INVESTIDO_APURADO / submetidos)}</td>
      <td>Investido ÷ cadastros submetidos. Por cadastro aprovado: ${brl(INVESTIDO_APURADO / aprovados)}.</td></tr>
    <tr><td class="et">CAC</td><td class="num q">${brl(INVESTIDO_APURADO / f.conversao.atribuiveis)}</td>
      <td>Investido ÷ ${num(f.conversao.atribuiveis)} clientes atribuíveis. Sobe se o investido real for maior.</td></tr>
  </tbody>
</table>

<h2>As três coisas que mais pesam</h2>
<div class="box alerta">
  <ul>
    <li><strong>A base está incompleta onde mais importa.</strong> ${num(semCadastro.length)} dos ${num(base.length)} clientes
      (${pct(semCadastro.length, base.length)}) não têm CPF ou telefone — e compraram
      ${brl0(semCadastro.reduce((a, p) => a + p.volumeCompra, 0))} este ano. Nenhum comprador de 2026 teve score consultado.
      Enquanto o CPF não for obrigatório no ato do arremate, toda medição de campanha continuará sendo um piso.</li>
    <li><strong>A venda de 2026 ainda é do assessor, não da mídia.</strong>
      ${pct(base.filter(p => !p.origemClasse).reduce((a, p) => a + p.volumeCompra, 0), VGV_BASE)} do volume vem de gente
      que nunca passou por lead. A mídia começou em junho e o que ela comprovadamente trouxe até agora são
      ${num(f.conversao.atribuiveis)} clientes. Isso não condena a mídia — mostra que ela é nova e que a régua para
      julgá-la precisa ser o ciclo (1 a 37 dias entre lead e arremate), não o mês fechado.</li>
    <li><strong>Duas etapas do funil não se medem sozinhas.</strong> A aprovação das leiloeiras depende de alguém ler o
      WhatsApp e anotar, e o investimento depende de um conector desautenticado. São as duas correções que mais
      aumentam a confiança do próximo relatório.</li>
  </ul>
</div>

<h2>Para fechar o que ficou em aberto</h2>
<div class="box grey">
  <ul>
    <li><strong>Autenticar o conector da Meta</strong> e puxar 2026 inteiro nas contas CA1 e CA2. É o único item que
      muda números já publicados (todos os custos por etapa sobem se o investido real for maior).</li>
    <li><strong>Trabalhar a aba A COMPLETAR</strong> da planilha, de cima para baixo — está ordenada por volume comprado.</li>
    <li><strong>Consultar score dos ${num(base.filter(p => p.cpf).length)} clientes que já têm CPF</strong>, o que dá para
      fazer sem depender de cadastro novo.</li>
    <li><strong>Fazer o parser entender as decisões em texto livre nos grupos</strong> (“cadastro ok”, “aprovado”), para
      a etapa de aprovação voltar a existir no sistema.</li>
  </ul>
</div>
<p class="micro">Apuração reproduzível: <code>node scripts/extrai-fontes-2026.mjs</code> →
<code>monta-base-2026.mjs</code> → <code>monta-funil-2026.mjs</code> → os três geradores.
Fontes: HastaPro (ERP), Supabase, planilha de leads, grupos de WhatsApp e snapshots do conector Meta.</p>
<footer><span>Bula Assessoria — Sumário 2026</span><span>Emitido em ${HOJE}</span></footer>
`)

fs.mkdirSync(saida, { recursive: true })
fs.writeFileSync(path.join(DIR, 'sumario-2026.html'), html)
const pdfPath = path.join(saida, '0 - LEIA PRIMEIRO - Sumario.pdf')
await paraPdf(html, pdfPath)
console.log('PDF:', pdfPath)
