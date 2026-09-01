/**
 * "A ZONA CINZENTA ACABOU" — o veredito de cada leilao da filial '01' em que a
 * equipe da Bula vendeu, decidido por correlacao, sem depender de decisao
 * previa da diretoria.
 *
 * Le o JSON produzido por scripts/correlaciona-cobertura-filiais-2026.mjs
 * (que por sua vez le Firebird + ERP + a aba Leiloes da planilha).
 *
 * Uso: node scripts/gera-pdf-cobertura-resolvida-2026.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

const D = JSON.parse(fs.readFileSync('outputs/cobertura-filiais-2026/correlacao.json', 'utf8'))
const n = v => Number(v || 0)
const r2 = v => Math.round(n(v) * 100) / 100
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = v => n(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = v => n(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const mi = v => (n(v) / 1e6).toFixed(2).replace('.', ',')
const dm = s => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—')
const corta = (t, x) => (String(t).length <= x ? String(t) : String(t).slice(0, x).replace(/[ ,;.\-–]+$/, '') + '…')

const daAssessoria = D.linhas.filter(l => l.veredito.startsWith('ASSESSORIA'))
const daRemates = D.linhas.filter(l => l.veredito.startsWith('REMATES'))
const aDecidir = D.linhas.filter(l => l.veredito === 'A DECIDIR')
const P = D.planilha
const naFil2 = P.eventos_cobrados - P.cobrados_que_estao_na_fil01.n - P.cobrados_sem_leilao_no_hastapro.n
const receitaNaFil2 = r2(P.receita_total - P.cobrados_que_estao_na_fil01.receita - P.cobrados_sem_leilao_no_hastapro.receita)

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', VERM = '#A33'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const fonte = fs.readFileSync('scripts/gera-projecao-fechamento-agosto-2026.mjs', 'utf8')
const ini = fonte.indexOf('const CSS = `') + 'const CSS = `'.length
const CSS = fonte.slice(ini, fonte.indexOf('`', ini))
    .replace(/\$\{INK\}/g, INK).replace(/\$\{GRID\}/g, GRID).replace(/\$\{MUTED\}/g, MUTED)
    .replace(/\$\{GOLD\}/g, GOLD).replace(/\$\{VERM\}/g, VERM)
const foot = p => `<div class="pfoot"><span>Bula Assessoria · A zona cinzenta acabou</span><span>${p}</span></div>`

const linhaTab = l => `<tr><td>${dm(l.data)}</td><td>${esc(corta(l.leilao, 40))}</td>
  <td class="num">${brl0(l.vgvCinza)}</td><td>${esc(corta(l.quem, 30))}</td>
  <td>${esc(l.nf || l.status || (l.comissaoFil01 ? `comissão de R$ ${brl0(l.comissaoFil01)} paga pela ‘01’` : l.fechamento ? 'fechamento no ERP' : ''))}</td></tr>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<title>A zona cinzenta acabou</title><style>${CSS}</style></head><body>

<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>A zona<br>cinzenta<br>acabou</h1>
  <div class="rule"></div>
  <div class="sub">Não era preciso decidir nada: <strong>a regra já estava no banco</strong>. Quem paga a comissão do
  lote define de quem é a venda — e em 2026 <strong>nenhum</strong> leilão da filial ‘01’ teve comissão paga pela
  filial ‘2’. Os ${D.zona_cinzenta.leiloes} leilões em disputa foram resolvidos um a um: ${daAssessoria.length} são da
  Assessoria, ${daRemates.length} são da Remates, <strong>${aDecidir.length} ficaram sem resposta</strong>.</div>
  <div class="meta">
    <div><span>Em disputa</span><strong>R$ ${mi(D.zona_cinzenta.vgv)} mi</strong></div>
    <div><span>Da Assessoria</span><strong>R$ ${mi(D.veredito.assessoria.vgv)} mi · ${daAssessoria.length} leilões</strong></div>
    <div><span>Da Remates</span><strong>R$ ${mi(D.veredito.remates.vgv)} mi · ${daRemates.length} leilões</strong></div>
    <div><span>Sem resposta</span><strong>${aDecidir.length}</strong></div>
    <div><span>Apurado em</span><strong>${dm('2026-' + D.gerado.slice(5))}/${D.gerado.slice(0, 4)}</strong></div>
  </div>
</section>

<section class="page">
  <div class="head"><h2>A regra que já existia</h2><div class="n">01 · quem paga a comissão</div></div>

  <p class="lead">Procurei a evidência em cascata, começando pela mais forte. O HastaPro não deixa um título apontar
  para leilão de outra filial — são <strong>zero nos dois sentidos</strong> —, então a comissão de cada lote nasce,
  obrigatoriamente, <strong>na filial que pagou</strong>. É esse o registro que decide a cobertura, e ele está
  preenchido desde janeiro.</p>

  <table>
    <tr><th class="num">#</th><th>Evidência</th><th>Decide</th><th class="num">Resolveu</th></tr>
    <tr><td class="num">1</td><td>Comissão do leilão paga pela filial ‘2’</td><td>Assessoria</td><td class="num">0 leilões</td></tr>
    <tr><td class="num">2</td><td>Evento cobrado na planilha, com NF e status de recebimento</td><td>Assessoria</td>
      <td class="num">${D.linhas.filter(l => l.veredito.includes('cobrado')).length} leilões</td></tr>
    <tr><td class="num">3</td><td>Fechamento no ERP com receita apurada</td><td>Assessoria</td>
      <td class="num">${D.linhas.filter(l => l.veredito.includes('fechamento')).length} leilão</td></tr>
    <tr><td class="num">4</td><td>Comissão paga <strong>só</strong> pela filial ‘01’</td><td>Remates</td>
      <td class="num">${daRemates.length} leilões</td></tr>
    <tr class="total"><td colspan="3">Resíduo sem resposta</td><td class="num">${aDecidir.length}</td></tr>
  </table>

  <div class="box gold">
    <div class="t">O caso que fecha o argumento</div>
    <p style="margin-bottom:0">A <strong>Valéria Borges</strong> era o maior nome da “zona cinzenta” (R$ 2,85 mi
    vendidos dentro da ‘01’). A filial ‘01’ paga o <strong>salário dela — R$ 4.250 por mês, de fevereiro a agosto</strong> —
    e todas as comissões de venda e captação dos leilões Só Criador, Original Grifes, Legado MRA e Só Florão.
    A filial ‘2’ pagou a ela duas coisas no ano: R$ 3.384,00 de um leilão de Gir e Girolando e R$ 369,00 no
    23º Genética Aditiva. <strong>Ela vende pela Remates</strong> — não havia dúvida a resolver, havia dado a ler.</p>
  </div>

  <h3>Os ${daAssessoria.length} que são da Assessoria — R$ ${brl0(D.veredito.assessoria.vgv)} de VGV</h3>
  <table class="dense">
    <tr><th>Data</th><th>Leilão (cadastrado na filial ‘01’)</th><th class="num">VGV da equipe</th><th>Quem vendeu</th><th>Prova</th></tr>
    ${daAssessoria.map(linhaTab).join('')}
    <tr class="total"><td colspan="2">Cobertura da Assessoria dentro de pregões da Remates</td>
      <td class="num">${brl0(D.veredito.assessoria.vgv)}</td><td colspan="2">receita já cobrada: R$ ${brl(D.veredito.assessoria.receita)}</td></tr>
  </table>
  ${foot('Página 1 de 3')}
</section>

<section class="page">
  <div class="head"><h2>Os que são da Remates</h2><div class="n">02 · e o furo verdadeiro</div></div>

  <table class="dense">
    <tr><th>Data</th><th>Leilão</th><th class="num">VGV da equipe</th><th>Quem vendeu</th><th>Prova</th></tr>
    ${daRemates.map(linhaTab).join('')}
    <tr class="total"><td colspan="2">Venda da Remates, com o vendedor dela</td><td class="num">${brl0(D.veredito.remates.vgv)}</td><td colspan="2"></td></tr>
  </table>

  <div class="box dark">
    <div class="t">Então a separação está certa — o furo é outro</div>
    <p>A filial do leilão não está atribuindo venda errada: cada um desses ${daRemates.length} pregões tem o vendedor
    da Remates e a comissão paga por ela. <strong>O furo é que a cobertura da Assessoria dentro de pregões da Remates
    não fica registrada em lugar nenhum</strong> — são R$ ${brl0(D.veredito.assessoria.vgv)} de VGV e
    R$ ${brl(D.veredito.assessoria.receita)} de receita que a Assessoria faturou, com nota fiscal, e que nenhum
    relatório da filial ‘2’ mostra.</p>
    <p style="margin-bottom:0">É por isso que a conta parecia não bater: não há venda no lugar errado, há
    <strong>faturamento sem lastro de lote</strong> do lado da Assessoria.</p>
  </div>

  <h3>De onde a receita realmente vem</h3>
  <p>Dos <strong>${P.eventos_cobrados} eventos</strong> que a Bula cobrou de janeiro a agosto
  (R$ ${brl(P.receita_total)}), a maior parte é de <strong>leiloeiras de terceiros</strong> — e é por isso que o
  HastaPro, que é o sistema da Remates, nunca vai ter a receita inteira.</p>
  <table class="dense">
    <tr><th>Leiloeira</th><th class="num">Eventos</th><th class="num">Receita</th><th class="num">% da receita</th></tr>
    ${P.por_leiloeira.slice(0, 8).map(x => `<tr><td>${esc(x.leiloeira)}</td><td class="num">${x.n}</td>
      <td class="num">${brl0(x.receita)}</td><td class="num">${(x.receita / P.receita_total * 100).toFixed(1).replace('.', ',')}%</td></tr>`).join('')}
  </table>
  ${foot('Página 2 de 3')}
</section>

<section class="page">
  <div class="head"><h2>O que fazer</h2><div class="n">03 · sem esperar decisão</div></div>

  <p class="lead">A proposta anterior começava com “a diretoria precisa decidir a zona cinzenta”. <strong>Não precisa
  mais</strong> — a correlação decidiu, com evidência que dá para auditar leilão a leilão. O que sobra é trabalho de
  registro, e ele tem ordem.</p>

  <div class="op"><div class="l1"><span class="nm">1 · Vincular os ${daAssessoria.length} eventos da ‘01’ ao faturamento da Assessoria</span>
    <span class="vl">R$ ${brl0(D.veredito.assessoria.vgv)} de VGV</span></div>
    <div class="l2">É a lista da página 1, já com NF e status de recebimento.</div>
    <p style="margin-top:2mm">Cada um desses leilões tem lote da nossa equipe, foi cobrado e tem nota. Vinculá-los ao
    fechamento da Assessoria no ERP fecha, de uma vez, o buraco entre “o que faturamos” e “o que temos lote para provar”.</p></div>

  <div class="op"><div class="l1"><span class="nm">2 · Cadastrar os eventos que não existem no HastaPro</span>
    <span class="vl">${P.cobrados_sem_leilao_no_hastapro.n} eventos · R$ ${brl0(P.cobrados_sem_leilao_no_hastapro.receita)}</span></div>
    <div class="l2">Cobrados, recebidos — e sem leilão nenhum em nenhuma filial.</div>
    <p style="margin-top:2mm">${naFil2} dos ${P.eventos_cobrados} eventos cobrados já casam com a filial ‘2’
    (R$ ${brl0(receitaNaFil2)}), ${P.cobrados_que_estao_na_fil01.n} estão na ‘01’ e
    ${P.cobrados_sem_leilao_no_hastapro.n} não estão em lugar nenhum. Esses últimos são de leiloeiras de terceiros que
    ninguém cadastrou — sem eles, nenhuma apuração pelo HastaPro fecha, por melhor que seja a separação de filiais.</p></div>

  <div class="op"><div class="l1"><span class="nm">3 · O pedido ao fornecedor fica menor</span><span class="vl">um campo</span></div>
    <div class="l2">E agora com a regra já provada.</div>
    <p style="margin-top:2mm">Não é “separar melhor as filiais” nem refazer nada: é <strong>marcar no lote de quem é a
    cobertura</strong>, para o pregão da Remates poder ter lote da Assessoria sem duplicar o evento. A tabela
    <code>ASSESSORIA</code> já grava quem assessorou e com que percentual — falta só a filial do prestador. Enquanto
    não vier, a regra “quem pagou a comissão” resolve, e está implementada em
    <code>scripts/correlaciona-cobertura-filiais-2026.mjs</code>.</p></div>

  <div class="op"><div class="l1"><span class="nm">4 · A receita continua nascendo fora do HastaPro</span><span class="vl">${P.por_leiloeira[0]?.leiloeira}: ${(P.por_leiloeira[0]?.receita / P.receita_total * 100).toFixed(0)}%</span></div>
    <div class="l2">Isso não é defeito da separação — é o desenho do negócio.</div>
    <p style="margin-top:2mm">A Assessoria fatura sobre leilões que a Remates não conduz. A fonte da receita é a
    agenda/fechamento da própria Bula, com a <strong>NFS-e como árbitro</strong>; o HastaPro entra como base de lote e
    conferência. Puxar o Relatório de Nota Fiscal do ano na Prefeitura fecha janeiro e fevereiro, que são os meses em
    que as três bases mais divergem.</p></div>

  <p class="small">Método: cascata de evidência por leilão — comissão paga (Firebird, <code>FIN_TITULOS</code> +
  <code>LEI_CODIGO</code>), cobrança na aba Leilões da planilha (nome + data ±3 dias), fechamento no ERP. Quem é da
  equipe sai da folha somada aos assessores que os fechamentos reconhecem. Dados brutos em
  <code>outputs/cobertura-filiais-2026/correlacao.json</code>.</p>
  ${foot('Página 3 de 3')}
</section>
</body></html>`

fs.writeFileSync('outputs/cobertura-filiais-2026/zona-cinzenta.html', html)
const pdfPath = path.join(os.homedir(), 'Desktop', 'Bula - A zona cinzenta acabou (cobertura por filial).pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
const over = await page.evaluate(() => [...document.querySelectorAll('.page')].map((s, i) => (s.scrollHeight > s.clientHeight + 2 ? i + 1 : null)).filter(Boolean))
await browser.close()

console.log('Assessoria:', daAssessoria.length, 'leiloes ·', brl0(D.veredito.assessoria.vgv), 'VGV ·', brl(D.veredito.assessoria.receita), 'receita')
console.log('Remates   :', daRemates.length, 'leiloes ·', brl0(D.veredito.remates.vgv), 'VGV')
console.log('A decidir :', aDecidir.length)
console.log('eventos cobrados:', P.eventos_cobrados, '| na FIL2', naFil2, '| na FIL01', P.cobrados_que_estao_na_fil01.n, '| sem leilao', P.cobrados_sem_leilao_no_hastapro.n)
console.log('paginas estouradas:', over.length ? over : 'nenhuma')
console.log('PDF →', pdfPath)
