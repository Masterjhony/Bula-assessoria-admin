/**
 * SUMÁRIO EXECUTIVO (PDF de 1–2 páginas) — a folha de rosto da pasta.
 *
 *   node scripts/gera-sumario-2026.mjs [pasta-de-saida]
 *
 * Existe porque a diretoria vai abrir a pasta antes de abrir os relatórios:
 * diz o que há em cada arquivo, dá as respostas diretas, explica o mecanismo
 * de verificação (nenhum número com fonte única) e lista o que ainda falta.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pagina, paraPdf, esc, brl, brl0, num, pct, dataBr } from './lib/relatorio-2026-visual.mjs'
import { INVESTIDO_APURADO, LEADS_META, FUNIL_WHATSAPP, DIVULGACAO_LEILOES, APURADO_ATE } from './lib/midia-2026.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const saida = process.argv[2] || DIR

const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base-clientes.json'), 'utf8'))
const leiloes = JSON.parse(fs.readFileSync(path.join(DIR, 'leiloes-2026.json'), 'utf8'))
const compras = JSON.parse(fs.readFileSync(path.join(DIR, 'compras-2026.json'), 'utf8'))
const f = JSON.parse(fs.readFileSync(path.join(DIR, 'funil-2026.json'), 'utf8'))

const HOJE = '14/08/2026'
const VGV = Math.round(leiloes.reduce((a, l) => a + l.vgv, 0) * 100) / 100
const VGV_BASE = Math.round(base.reduce((a, p) => a + p.volumeCompra, 0) * 100) / 100
const semCadastro = base.filter(p => !p.cpf || !p.telefone)
const aprovados = f.cadastros.manual.aprovados
const submetidos = f.cadastros.sistema.pessoas

const html = pagina('Sumário — Bula 2026', `
<div class="cap">
  <div><h1>Base de clientes e campanhas — 2026</h1>
  <div class="sub">Sumário da pasta: o que foi apurado, como cada número foi conferido e o que ainda falta fechar.
  Investimento em mídia agora OFICIAL, puxado ao vivo das contas de anúncio em 14/08.</div></div>
  <div class="meta">Bula Assessoria<br>Base: 01/01 a 14/08/2026<br>Emitido em ${HOJE}</div>
</div>

<h2>O que há nesta pasta</h2>
<table>
  <thead><tr><th>Arquivo</th><th>Para que serve</th></tr></thead>
  <tbody>
    <tr><td class="nome">1 — Desempenho das Campanhas e Conversão</td>
      <td>O funil do ano: leads, qualificados, cadastros, aprovados, quem comprou e quanto. Traz o investimento oficial
      da Meta campanha a campanha, a comparação com o funil-meta mensal da diretoria e a tabela de triangulação
      (como cada número foi conferido).</td></tr>
    <tr><td class="nome">2 — Meta Ads: Investimento Oficial</td>
      <td>Só mídia, em detalhe: as 4 contas, cada campanha, mês a mês, leads reportados pela Meta, top regiões — e a
      conciliação com o valor de R$ 16.500 usado no relatório interno.</td></tr>
    <tr><td class="nome">3 — Base de Clientes Ativos</td>
      <td>Quem compra: volume, concentração, geografia, categorias, assessor, recorrência — e o diagnóstico do cadastro.</td></tr>
    <tr><td class="nome">4 — Cadastros Aprovados nas Leiloeiras</td>
      <td>A lista nominal dos ${num(aprovados)} aprovados (${num(f.cadastros.manual.registros)} registros), com os dados de
      cadastro de cada um e a frase do grupo que sustenta a decisão.</td></tr>
    <tr><td class="nome">Base-Clientes-Bula-2026.xlsx</td>
      <td>A base para trabalhar. Abas: BASE DE CLIENTES (${num(base.length)} pessoas), COMPRAS (${num(compras.length)} arremates conferíveis), LEILÕES (${num(leiloes.length)}), <strong>A COMPLETAR</strong> (a fila de cadastro) e DICIONÁRIO.</td></tr>
    <tr><td class="nome">Cadastros-Aprovados-2026.xlsx · Campanhas-Meta-2026.xlsx</td>
      <td>As mesmas informações dos PDFs 4 e 2 em planilha, para filtrar e conferir.</td></tr>
  </tbody>
</table>

<h2>Como saber se um número daqui está certo</h2>
<div class="box">
  <p><strong>Regra desta apuração: nenhum número entra com uma fonte só.</strong> Cada variável foi buscada em pelo
  menos duas fontes independentes (Meta API × planilha × sistema × ERP × grupos de WhatsApp); quando divergem, vale a
  mais verificável e a diferença fica escrita — a tabela “triangulação”, no relatório 1, mostra fonte por fonte e o
  veredito de cada variável. Vale o alerta inverso também: <strong>números do sistema admin sozinhos não são prova</strong>
  (o CRM tem 91% de importação em massa e o registro de cadastros parou em 08/07) — por isso planilha, ERP e grupos
  são sempre consultados junto.</p>
</div>

<h2>As respostas, em uma linha cada</h2>
<table>
  <thead><tr><th>Pergunta</th><th class="r">Resposta</th><th>Ressalva</th></tr></thead>
  <tbody>
    <tr><td class="et">Quanto a Bula vendeu em 2026</td><td class="num q">${brl0(VGV)}</td>
      <td>Cobertura Bula em ${num(leiloes.length)} leilões, de 01/01 a 14/08. Soma o ERP e os fechamentos que nunca foram lançados nele.</td></tr>
    <tr><td class="et">Quantos clientes compraram</td><td class="num q">${num(base.length)}</td>
      <td>${brl0(VGV_BASE)} identificados; o resto é leilão sem comprador nominal registrado.</td></tr>
    <tr><td class="et">Investido em mídia (funil)</td><td class="num q">${brl(INVESTIDO_APURADO)}</td>
      <td><strong>Oficial</strong> — Meta API ao vivo, 14/08. O “16.500” interno era o retrato correto de 02/08. Fora do funil: ${brl(DIVULGACAO_LEILOES.totalInvestido)} de divulgação de leilões (agência) e ${brl(FUNIL_WHATSAPP.investido)} do piloto WhatsApp (abr–jun).</td></tr>
    <tr><td class="et">Quantos leads entraram</td><td class="num q">${num(f.leads.total)}</td>
      <td>Planilha, junho em diante; ${num(f.leads.deCampanha)} de campanha. A meta mensal de 702 leads foi batida em junho e julho.</td></tr>
    <tr><td class="et">Quantos são qualificados</td><td class="num q">${num(f.leads.mql)}</td>
      <td>${pct(f.leads.mql, f.leads.total)} — regra oficial: ≥ 100 cabeças e Inscrição Estadual. De campanha: ${num(f.leads.mqlDeCampanha)}.</td></tr>
    <tr><td class="et">Quantos cadastros submetemos</td><td class="num q">${num(submetidos)}</td>
      <td>Pessoas registradas no sistema, em julho. Depois de 08/07 o registro parou — a diretoria conta 81 com os envios manuais; o verdadeiro está nesse intervalo.</td></tr>
    <tr><td class="et">Quantos foram aprovados</td><td class="num q">${num(aprovados)}</td>
      <td>Pessoas (os 51 da lista têm 2 duplicados). Apuração manual dos grupos até 01/08, com a frase que sustenta cada decisão.</td></tr>
    <tr><td class="et">Quantos aprovados compraram</td><td class="num q">${num(f.conversao.aprovadosQueCompraram)}</td>
      <td>Somando ${brl0(f.conversao.vgvDosAprovados)} de compra no ano.</td></tr>
    <tr><td class="et">Quanto a campanha vendeu</td><td class="num q">${brl0(f.conversao.vgvAtribuivel)}</td>
      <td><strong>${num(f.conversao.atribuiveis)} clientes</strong> que compraram DEPOIS de entrar como lead. É o único recorte que a mídia pode reivindicar.</td></tr>
    <tr><td class="et">Custo por cadastro</td><td class="num q">${brl(INVESTIDO_APURADO / submetidos)}</td>
      <td>Investido ÷ cadastros submetidos. Por cadastro aprovado: ${brl(INVESTIDO_APURADO / aprovados)}.</td></tr>
    <tr><td class="et">CAC</td><td class="num q">${brl(INVESTIDO_APURADO / f.conversao.atribuiveis)}</td>
      <td>Investido ÷ ${num(f.conversao.atribuiveis)} clientes atribuíveis.</td></tr>
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
      que nunca passou por lead. A mídia começou em junho, bate a meta de leads, e o que ela comprovadamente trouxe até
      agora são ${num(f.conversao.atribuiveis)} clientes — o funil quebra no degrau lead→cadastro, não no anúncio.</li>
    <li><strong>Uma etapa do funil não se mede sozinha.</strong> A aprovação das leiloeiras depende de alguém ler o
      WhatsApp e anotar, e os cadastros enviados depois de 08/07 não deixaram rastro. É a correção que mais aumenta a
      confiança do próximo relatório — o investimento, que era a outra lacuna, fechou em 14/08 com o acesso à Meta.</li>
  </ul>
</div>

<h2>Para fechar o que ficou em aberto</h2>
<div class="box grey">
  <ul>
    <li><strong>Trabalhar a aba A COMPLETAR</strong> da planilha, de cima para baixo — está ordenada por volume comprado.</li>
    <li><strong>Consultar score dos ${num(base.filter(p => p.cpf).length)} clientes que já têm CPF</strong>, o que dá para
      fazer sem depender de cadastro novo.</li>
    <li><strong>Fazer o parser entender as decisões em texto livre nos grupos</strong> (“cadastro ok”, “aprovado”), para
      a etapa de aprovação voltar a existir no sistema.</li>
    <li><strong>Registrar TODO envio de cadastro no sistema</strong>, mesmo o feito à mão no WhatsApp — senão o degrau
      mais quebrado do funil segue invisível.</li>
  </ul>
</div>
<p class="micro">Apuração reproduzível: <code>node scripts/extrai-fontes-2026.mjs</code> →
<code>monta-base-2026.mjs</code> → <code>monta-funil-2026.mjs</code> → os geradores.
Fontes: Meta Ads (conector oficial, extração ${dataBr(APURADO_ATE)}), HastaPro (ERP), Supabase, planilha de leads e
grupos de WhatsApp.</p>
<footer><span>Bula Assessoria — Sumário 2026</span><span>Emitido em ${HOJE}</span></footer>
`)

fs.mkdirSync(saida, { recursive: true })
fs.writeFileSync(path.join(DIR, 'sumario-2026.html'), html)
const pdfPath = path.join(saida, '0 - LEIA PRIMEIRO - Sumario.pdf')
await paraPdf(html, pdfPath)
console.log('PDF:', pdfPath)
