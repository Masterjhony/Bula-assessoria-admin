/**
 * RELATÓRIO DE REEMBOLSOS — AGOSTO/2026 (PDF + XLSX na Área de Trabalho)
 * Dados em scripts/dados-reembolsos-agosto-2026.mjs (apurados nas DMs do
 * WhatsApp da sessão joao-automation + comprovantes do bucket whatsapp-media).
 */
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { META, ASSESSORES, ITENS, EVENTOS, PENDENCIAS, RASTRO } from './dados-reembolsos-agosto-2026.mjs'

const DESKTOP = 'C:/Users/Notebook-Acer/Desktop'
const PASTA = path.join(DESKTOP, 'Bula - Reembolsos Agosto 2026 (03-09-2026)')
const OUT = 'outputs/reembolsos-agosto-2026'
fs.mkdirSync(PASTA, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })

const brl = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const brl0 = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
const r2 = n => Math.round(n * 100) / 100

/* ── agregações ───────────────────────────────────────────────────────── */
const TODOS = ASSESSORES.flatMap(a => ITENS[a.id].map(i => ({ ...i, quem: a.nome.split(' ')[0], id: a.id })))
const soma = arr => r2(arr.reduce((s, i) => s + i.valor, 0))

const A_PAGAR = r2(ASSESSORES.reduce((s, a) => s + a.liquido, 0))
const COMPENSADO = soma(TODOS.filter(i => i.evento === 'perolas'))

const porEvento = Object.keys(EVENTOS).map(k => {
  const itens = TODOS.filter(i => i.evento === k)
  return {
    k, ...EVENTOS[k], total: soma(itens),
    douglas: soma(itens.filter(i => i.id === 'douglas')),
    fabio: soma(itens.filter(i => i.id === 'fabio')),
    leonardo: soma(itens.filter(i => i.id === 'leonardo')),
    n: itens.length,
  }
}).filter(e => e.total > 0).sort((a, b) => b.total - a.total)

const COMP_LABEL = {
  ok: ['documento fiscal', 't-ok'],
  divergente: ['nota diverge', 't-fix'],
  parcial: ['parcial', 't-est'],
  fraco: ['sem nota fiscal', 't-est'],
  nao: ['sem comprovante', 't-fix'],
}
const compDe = id => {
  const it = ITENS[id]
  const g = k => soma(it.filter(i => i.comp === k))
  return { ok: g('ok'), divergente: g('divergente'), parcial: g('parcial'), fraco: g('fraco'), nao: g('nao'), total: soma(it) }
}
const COMP = Object.fromEntries(ASSESSORES.map(a => [a.id, compDe(a.id)]))
const TOTAL_LINHAS = soma(TODOS)
const COM_DOC = r2(TODOS.filter(i => i.comp === 'ok').reduce((s, i) => s + i.valor, 0))
const SEM_DOC = r2(TODOS.filter(i => i.comp === 'nao').reduce((s, i) => s + i.valor, 0))
const EXPO_TOTAL = r2((porEvento.find(e => e.k === 'expo')?.total || 0) + (porEvento.find(e => e.k === 'misto')?.total || 0) + 155.30)

/* ── PDF ──────────────────────────────────────────────────────────────── */
const logo = fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

const linhasResumo = ASSESSORES.map(a => `<tr>
  <td><b>${a.nome}</b><div class="sub small">${a.empresa}</div><div class="sub small">enviou em ${a.enviouEm}</div></td>
  <td class="num">${brl(a.bruto)}</td>
  <td class="num">${a.abatimento ? '<span class="neg">− ' + brl(a.abatimento) + '</span>' : '—'}</td>
  <td class="num"><b>${brl(a.liquido)}</b></td>
  <td class="small">${a.pix}${a.pixAlerta ? ' <span class="tag t-est">conferir</span>' : ''}</td></tr>`).join('')

const linhasEvento = porEvento.map(e => `<tr>
  <td><b>${e.nome}</b><div class="sub small">${e.data} · ${e.tipo}${e.vgv ? ' · VGV ' + brl0(e.vgv) : ''}</div>
      <div class="sub small">${e.nota}</div></td>
  <td class="num">${e.douglas ? brl(e.douglas) : '—'}</td>
  <td class="num">${e.fabio ? brl(e.fabio) : '—'}</td>
  <td class="num">${e.leonardo ? brl(e.leonardo) : '—'}</td>
  <td class="num"><b>${brl(e.total)}</b></td>
  <td class="num sub">${e.vgv ? (e.total / e.vgv * 100).toFixed(2).replace('.', ',') + '%' : '—'}</td></tr>`).join('')

const tabelaItens = a => {
  const it = ITENS[a.id]
  const linhas = it.map(i => {
    const [lbl, cls] = COMP_LABEL[i.comp]
    return `<tr>
      <td class="ctr">${i.data}</td>
      <td>${i.desc}${i.obs ? `<div class="sub small">${i.obs}</div>` : ''}</td>
      <td class="small sub">${EVENTOS[i.evento].nome}</td>
      <td class="ctr"><span class="tag ${cls}">${lbl}</span></td>
      <td class="num">${brl(i.valor)}</td></tr>`
  }).join('')
  const c = COMP[a.id]
  return `<h3>${a.nome} — ${it.length} lançamentos, ${brl(c.total)}</h3>
  <table><thead><tr><th class="ctr">Data</th><th>Despesa</th><th>Leilão / evento</th><th class="ctr">Comprovante</th><th class="num">Valor</th></tr></thead>
  <tbody>${linhas}</tbody>
  <tfoot><tr><td colspan="4">${a.id === 'douglas'
      ? `Total dos dois relatórios — o de 12/08 (${brl(COMPENSADO)}) já foi compensado; a pagar agora ${brl(a.liquido)}`
      : a.bruto !== c.total ? `Total das linhas · ele pediu ${brl(a.bruto)}` : 'Total das linhas'}</td><td class="num">${brl(c.total)}</td></tr></tfoot></table>`
}

const grau = { alto: ['t-fix', 'decide antes de pagar'], medio: ['t-est', 'confere'], baixo: ['t-est', 'anota'], info: ['t-ok', 'contexto'] }
const linhasPend = PENDENCIAS.map(p => `<tr>
  <td class="ctr"><span class="tag ${grau[p.grau][0]}">${grau[p.grau][1]}</span></td>
  <td class="ctr small"><b>${p.quem}</b></td>
  <td><b>${p.titulo}</b><div class="sub small">${p.texto}</div></td></tr>`).join('')

const linhasRastro = RASTRO.map(r => `<tr><td class="ctr small">${r.quando}</td><td class="ctr small"><b>${r.quem}</b></td><td class="small">${r.o}</td></tr>`).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, Arial, sans-serif; color: #16181d; font-size: 9pt; line-height: 1.45; }
  .page { padding: 10mm 13mm 8mm; }
  .brk { page-break-before: always; }
  h1,h2,h3,.k,.tag,th,.v { font-family: Oswald, Arial, sans-serif; text-transform: uppercase; letter-spacing: .04em; font-weight: 500; }
  header { background: #0c0d10; color: #fff; padding: 11mm 13mm 8mm; }
  header img { height: 32px; opacity: .95; }
  header h1 { font-size: 21pt; margin-top: 6mm; line-height: 1.05; letter-spacing: .02em; }
  header .gold { color: #C9A84C; }
  header .sub { color: #9aa0aa; font-size: 8.4pt; margin-top: 3.5mm; line-height: 1.5; }
  h2 { font-size: 11.5pt; margin: 6mm 0 2.5mm; padding-bottom: 1.8mm; border-bottom: 1.5pt solid #0c0d10; }
  h2 .n { color: #C9A84C; margin-right: 2.5mm; }
  h2:first-child { margin-top: 0; }
  h3 { font-size: 9pt; margin: 5mm 0 2mm; color: #4a5058; }
  p { margin-bottom: 2.5mm; }
  .lead { font-size: 9.8pt; }
  table { width: 100%; border-collapse: collapse; margin: 2.5mm 0 2mm; }
  th { font-size: 7.2pt; text-align: left; color: #5a616e; border-bottom: 1pt solid #c2c6cd; padding: 2mm; }
  td { padding: 1.7mm 2mm; border-bottom: .4pt solid #e8eaee; vertical-align: middle; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.ctr, th.ctr { text-align: center; }
  .sub { color: #6b727f; } .small { font-size: 7.4pt; line-height: 1.35; }
  tfoot td { border-top: 1.2pt solid #0c0d10; border-bottom: none; font-weight: 600; padding-top: 2.4mm; }
  .tag { font-size: 6.6pt; padding: .7mm 1.8mm; border-radius: 1.5mm; white-space: nowrap; }
  .t-ok { background: #e6efe8; color: #2c6539; }
  .t-est { background: #f7efd9; color: #86680f; }
  .t-fix { background: #fbeae8; color: #9c2e27; }
  .cards { display: flex; gap: 3mm; margin: 4mm 0 2mm; }
  .card { flex: 1; border: .6pt solid #d7dade; border-radius: 2mm; padding: 3mm; }
  .card .k { font-size: 6.9pt; color: #6b727f; }
  .card .v { font-size: 15pt; margin-top: 1.5mm; letter-spacing: 0; }
  .card .d { font-size: 7.1pt; color: #6b727f; margin-top: 1mm; line-height: 1.35; }
  .card.dark { background: #0c0d10; border-color: #0c0d10; }
  .card.dark .k { color: #9aa0aa; } .card.dark .v { color: #fff; } .card.dark .d { color: #9aa0aa; }
  .card.gold { border-color: #C9A84C; border-width: 1pt; }
  .card.gold .v { color: #8a6d1f; }
  .neg { color: #9c2e27; } .pos { color: #2c6539; }
  .box { border-left: 2.2pt solid #C9A84C; background: #faf8f2; padding: 3mm 4mm; margin: 3mm 0; }
  .box .k { font-size: 8.2pt; margin-bottom: 1.5mm; }
  .box.dark { border-left-color: #0c0d10; background: #f4f5f7; }
  ul { margin: 1.5mm 0 2mm 4.5mm; } li { margin-bottom: 1.2mm; }
  .barra { display: flex; height: 5mm; border-radius: 1mm; overflow: hidden; margin: 2mm 0 1.5mm; }
  .barra span { display: block; }
  .leg { display: flex; gap: 5mm; font-size: 7.2pt; color: #4a5058; }
  .leg i { display: inline-block; width: 2.6mm; height: 2.6mm; border-radius: .6mm; margin-right: 1.2mm; vertical-align: middle; }
  footer { margin-top: 6mm; padding-top: 2.5mm; border-top: .6pt solid #d7dade; font-size: 7.1pt; color: #8b919c; line-height: 1.5; }
</style></head><body>

<header>
  <img src="data:image/png;base64,${logo}">
  <h1>Reembolsos de <span class="gold">agosto/2026</span><br>assessores de pista</h1>
  <div class="sub">Douglas Bispo · Fábio Omena · Leonardo Serafim — o que cada um mandou, o que tem comprovante e em que leilão a despesa entra.<br>
  Apurado em ${META.hoje} nas conversas 1:1 do WhatsApp (sessão Baileys <b>joao-automation</b>), com os anexos baixados do bucket e conferência no ERP.</div>
</header>

<div class="page">
  <div class="cards">
    <div class="card dark"><div class="k">A pagar hoje</div><div class="v">${brl(A_PAGAR)}</div><div class="d">três assessores, líquido de abatimento</div></div>
    <div class="card"><div class="k">Douglas</div><div class="v">${brl(ASSESSORES[0].liquido)}</div><div class="d">${brl(ASSESSORES[0].bruto)} − ${brl(ASSESSORES[0].abatimento)} que ele devolve</div></div>
    <div class="card"><div class="k">Fábio</div><div class="v">${brl(ASSESSORES[1].liquido)}</div><div class="d">as linhas dele somam ${brl(COMP.fabio.total)}</div></div>
    <div class="card"><div class="k">Leonardo</div><div class="v">${brl(ASSESSORES[2].liquido)}</div><div class="d">100% com documento fiscal</div></div>
  </div>

  <h2><span class="n">1</span>O que pagar hoje</h2>
  <table>
    <thead><tr><th>Assessor</th><th class="num">Declarado</th><th class="num">Abatimento</th><th class="num">A pagar</th><th>Destino</th></tr></thead>
    <tbody>${linhasResumo}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${brl(ASSESSORES.reduce((s, a) => s + a.bruto, 0))}</td><td class="num neg">− ${brl(ASSESSORES.reduce((s, a) => s + a.abatimento, 0))}</td><td class="num">${brl(A_PAGAR)}</td><td></td></tr></tfoot>
  </table>

  <div class="box">
    <div class="k">O abatimento do Douglas, explicado por ele mesmo</div>
    Ele comprou as passagens da Expogenética das quatro pessoas e mandou as notas em 12/08, no mesmo dia em que mandou o
    reembolso do Pérolas do Tapajós (${brl(COMPENSADO)}). Nos áudios de 12/08 e 24/08 ele faz a conta em voz alta:
    <i>“tem que repassar para a Bula 397,54… aí a gente vai abatendo num acerto nosso”</i>. Por isso o Pérolas <b>não entra
    no pagamento de hoje</b> — ele já foi compensado contra a passagem — e os R$ 397,54 saem do reembolso da Expogenética.
  </div>

  <h2><span class="n">2</span>Em que leilão a despesa entra</h2>
  <table>
    <thead><tr><th>Leilão / evento</th><th class="num">Douglas</th><th class="num">Fábio</th><th class="num">Leonardo</th><th class="num">Total</th><th class="num">% do VGV</th></tr></thead>
    <tbody>${linhasEvento}</tbody>
    <tfoot><tr><td>Total lançado (inclui o Pérolas já compensado)</td>
      <td class="num">${brl(COMP.douglas.total)}</td><td class="num">${brl(COMP.fabio.total)}</td><td class="num">${brl(COMP.leonardo.total)}</td>
      <td class="num">${brl(TOTAL_LINHAS)}</td><td></td></tr></tfoot>
  </table>

  <div class="box dark">
    <div class="k">A Expogenética bateu na estimativa</div>
    Somando o que os três gastaram na feira — a hospedagem mista do Douglas por inteiro e a fatia de Uber de Uberaba
    do Fábio — o reembolso de equipe da Expogenética 2026 fica em <b>${brl(EXPO_TOTAL)}</b> (sem a hospedagem mista,
    ${brl(r2(EXPO_TOTAL - 492))}). O fechamento
    da feira (28/08) trabalhou com <b>R$ 5.000</b> de reembolso, número que o Marcelo fixou no grupo Financeiro.
    A diferença cabe dentro do arredondamento: o custo da feira não muda.
  </div>
</div>

<div class="page brk">
  <h2><span class="n">3</span>O que tem comprovante</h2>
  <p class="lead">Dos ${brl(TOTAL_LINHAS)} lançados, <b>${brl(COM_DOC)}</b> vieram com documento fiscal legível (NFC-e, NFS-e, BP-e ou
  contrato) e <b>${brl(SEM_DOC)}</b> vieram só como linha de planilha. Toda a diferença está no Fábio.</p>
  <table>
    <thead><tr><th>Assessor</th><th class="num">Documento fiscal</th><th class="num">Parcial / sem NF</th><th class="num">Sem comprovante</th><th class="num">Cobertura</th></tr></thead>
    <tbody>
      ${ASSESSORES.map(a => {
        const c = COMP[a.id]
        const cob = (c.ok + c.divergente) / c.total
        return `<tr><td><b>${a.nome.split(' ')[0]}</b><div class="sub small">${ITENS[a.id].length} lançamentos</div></td>
          <td class="num">${brl(c.ok + c.divergente)}</td>
          <td class="num">${brl(c.parcial + c.fraco)}</td>
          <td class="num">${c.nao ? '<span class="neg">' + brl(c.nao) + '</span>' : '—'}</td>
          <td class="num"><b>${(cob * 100).toFixed(0)}%</b></td></tr>`
      }).join('')}
    </tbody>
  </table>
  <div class="barra">
    <span style="width:${COM_DOC / TOTAL_LINHAS * 100}%;background:#2c6539"></span>
    <span style="width:${(TOTAL_LINHAS - COM_DOC - SEM_DOC) / TOTAL_LINHAS * 100}%;background:#C9A84C"></span>
    <span style="width:${SEM_DOC / TOTAL_LINHAS * 100}%;background:#9c2e27"></span>
  </div>
  <div class="leg">
    <span><i style="background:#2c6539"></i>documento fiscal — ${brl(COM_DOC)}</span>
    <span><i style="background:#C9A84C"></i>parcial, sem NF ou nota divergente — ${brl(r2(TOTAL_LINHAS - COM_DOC - SEM_DOC))}</span>
    <span><i style="background:#9c2e27"></i>sem comprovante — ${brl(SEM_DOC)}</span>
  </div>
  <p class="small sub" style="margin-top:2.5mm">Tudo o que os três mandaram está na subpasta <b>Comprovantes</b>, ao lado deste PDF, separado por assessor — os cupons e notas
  lidos um a um, mais as planilhas de despesa e as notas do mensal que vieram na mesma conversa.</p>

  <h2><span class="n">4</span>O que precisa de decisão</h2>
  <table><tbody>${linhasPend}</tbody></table>
</div>

<div class="page brk">
  <h2><span class="n">5</span>Lançamento a lançamento</h2>
  ${ASSESSORES.map(tabelaItens).join('')}

  <h2><span class="n">6</span>Rastro — o que chegou pelo WhatsApp</h2>
  <table><thead><tr><th class="ctr">Quando</th><th class="ctr">Quem</th><th>O quê</th></tr></thead><tbody>${linhasRastro}</tbody></table>

  <footer>
    Bula Assessoria Pecuária · Reembolsos de agosto/2026 · gerado em ${META.hoje}.<br>
    Fonte: ${META.fonte}<br>
    Os valores por assessor são os que cada um declarou na própria planilha; a coluna de comprovante reflete o documento
    efetivamente recebido e lido. Nenhum destes reembolsos estava lançado no ERP até esta data.
  </footer>
</div>
</body></html>`

const htmlPath = path.join(OUT, 'relatorio.html')
fs.writeFileSync(htmlPath, html)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto('file://' + path.resolve(htmlPath).replace(/\\/g, '/'))
await page.waitForTimeout(1200)
const pdfPath = path.join(PASTA, 'Bula - Reembolsos Agosto 2026.pdf')
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
await browser.close()

/* ── XLSX ─────────────────────────────────────────────────────────────── */
// A planilha é um artefato próprio (capa, aba de aprovação, filtros, moeda):
// mora em scripts/xlsx-reembolsos-agosto-2026.mjs e lê os mesmos dados.
const xlsxPath = path.join(PASTA, 'Bula - Reembolsos Agosto 2026.xlsx')
execFileSync('node', ['scripts/xlsx-reembolsos-agosto-2026.mjs', xlsxPath], { stdio: 'inherit' })

/* ── comprovantes ao lado ─────────────────────────────────────────────── */
const SRC = path.join(OUT, 'anexos')
let copiados = 0
if (fs.existsSync(SRC)) {
  for (const quem of fs.readdirSync(SRC)) {
    const destDir = path.join(PASTA, 'Comprovantes', quem)
    fs.mkdirSync(destDir, { recursive: true })
    for (const f of fs.readdirSync(path.join(SRC, quem))) {
      fs.copyFileSync(path.join(SRC, quem, f), path.join(destDir, f))
      copiados++
    }
  }
}

console.log('PDF  :', pdfPath)
console.log('XLSX :', xlsxPath)
console.log('Comprovantes copiados:', copiados)
console.log('A pagar hoje:', brl(A_PAGAR), '| linhas lançadas:', brl(TOTAL_LINHAS), '| Expogenética:', brl(EXPO_TOTAL))
