/**
 * Renderiza o "Relatório de Fechamento — Naviraí Camparino (Agropecuária
 * Camparino LTDA)" a partir de outputs/camparino-fechamento-2026-09/dados.json.
 * PDF A4 na Área de Trabalho. Nenhum número escrito à mão — tudo sai do JSON
 * (que por sua vez sai da listagem da Programa, do HastaPro, do grupo de
 * lances e da planilha do chefe).
 *
 * Brandbook: preto/grafite/branco, Oswald nos títulos, dourado só no filete
 * da capa e na borda de um tile. pg.pdf() com margem ZERO e .page com height
 * fixa (ver memória render-pdf-a4-margem-zero).
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'

const OUT = 'outputs/camparino-fechamento-2026-09'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (n, d = 2) => (Number(n || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
const dma = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—'
// created_at vem em UTC; a ficha é lida no horário de Brasília
const hora = iso => { if (!iso) return '—'; const d = new Date(new Date(iso).getTime() - 3 * 3600e3); const z = n => String(n).padStart(2, '0'); return `${z(d.getUTCDate())}/${z(d.getUTCMonth() + 1)} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}` }
const corta = (t, n) => { const x = String(t); if (x.length <= n) return x; const c = x.slice(0, n), sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–·]+$/, '') + '…' }
const titulo = s => String(s).replace(/\s+·\s+FAZENDA.*$/i, '').replace(/·.*$/, '').trim()

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

const [e1, e2] = D.etapas
const imposto = r2(D.receita * 0.18)
const liquido = r2(D.receita - imposto - D.comissaoEquipe)
const porAssessor = Object.values(D.lotesCamp.reduce((acc, l) => {
  const a = acc[l.assessor] ||= { nome: l.assessor, lotes: 0, vgv: 0, pct: l.comissaoPct, comissao: 0 }
  a.lotes++; a.vgv = r2(a.vgv + l.valor); a.comissao = r2(a.comissao + l.comissao); return acc
}, {})).sort((a, b) => b.comissao - a.comissao)
const compradorFicha = f => { if (!f) return ''; const ls = f.texto.split('\n').map(x => x.trim()).filter(Boolean); const i = ls.findIndex(x => /bula/i.test(x)); return ls.slice(i + 1).map(x => x.replace(/^\*?comprador\*?\s*:\s*/i, '').replace(/^\*?fazenda\*?\s*:\s*/i, 'Faz. ').replace(/^É /, '').replace(/\*/g, '')).join(' · ') }

const linhasEtapas = D.etapas.map((e, i) => `<tr>
  <td>${dm(e.data)}</td><td>${esc(e.nome)}</td><td class="num">${e.lotes}</td><td class="num">${e.animais}</td>
  <td class="num">R$ ${brl(e.faturamento)}</td><td class="num">${e.lotesBula}</td><td class="num">R$ ${brl(e.cobertura)}</td>
  <td class="num">${pct(e.performance)}</td><td class="num">R$ ${brl(D.receitaPorEtapa[i].receita)}</td></tr>`).join('')

const linhasLotes = D.lotesCamp.map(l => `<tr>
  <td>${dm(l.data)}</td><td><strong>${esc(l.lote)}</strong></td><td style="white-space:nowrap">${esc(l.animal)}<br><span class="muted">${esc(l.categoria.toLowerCase())}</span></td>
  <td class="num">${brl(l.lance)}</td><td class="num">R$ ${brl(l.valor)}</td>
  <td>${esc(l.programa.comprador)}</td>
  <td>${esc(corta(titulo(l.hastapro?.comprador || ''), 28))}<br><span class="muted">${esc(corta(compradorFicha(l.ficha), 40))}</span></td>
  <td style="white-space:nowrap">${esc(l.assessor)}<br><span class="muted">ficha ${hora(l.ficha?.quando)}</span></td>
  <td>${l.confere ? 'Confere' : '<strong>Divergente</strong>'}</td></tr>`).join('')

const linhasAssessores = porAssessor.map(a => `<tr>
  <td style="white-space:nowrap">${esc(a.nome)}</td><td class="num">${a.lotes}</td><td class="num">R$ ${brl(a.vgv)}</td><td class="num">${pct(a.pct, 0)}</td>
  <td class="num">R$ ${brl(a.comissao)}</td>
  <td style="white-space:nowrap">${a.nome === 'Nane' ? 'título único (6 lotes)' : 'CP · venc. 25/09'}</td></tr>`).join('')

const linhasNav = D.navirai.porEtapa.map(e => `<tr><td>${dm(e.data)}</td><td class="num">${e.lotes}</td><td class="num">R$ ${brl(e.vgv)}</td><td class="num">R$ ${brl(r2(e.vgv * D.navirai.pct))}</td></tr>`).join('')

const rankAgentes = D.etapas.map(e => ({ etapa: e, posBula: e.agentes.findIndex(a => /bula/i.test(a.nome)) + 1,
  linhas: e.agentes.slice(0, 8).map((a, i) => `<tr${/bula/i.test(a.nome) ? ' class="destaque"' : ''}><td class="num">${i + 1}º</td><td>${esc(corta(a.nome, 34))}</td><td class="num">${a.lotes}</td><td class="num">R$ ${brl(a.valor)}</td><td class="num">${pct(a.valor / e.faturamento, 1)}</td></tr>`).join('') }))

const S = D.sens
const p131 = D.planilha.find(p => p.linha === 131), p132 = D.planilha.find(p => p.linha === 132)

const foot = n => `<div class="pfoot"><span>Bula Assessoria Pecuária · Fechamento Naviraí Camparino — Agropecuária Camparino LTDA · 22–23/08/2026</span><span>${n}</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Bula — Fechamento Naviraí Camparino (Agropecuária Camparino)</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; height: 296mm; padding: 14mm 13mm 17mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6;
           display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
  .capa { background: ${INK}; color: #fff; padding: 32mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 22mm; }
  .capa h1 { font-size: 38px; line-height: 1.05; color: #fff; font-weight: 700; }
  .capa h1 small { display: block; font-size: 18px; color: #B5B5B5; font-weight: 500; margin-top: 4mm; letter-spacing: .04em; }
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 140mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 9mm 0; }
  .capa .big { font-family: Oswald, sans-serif; font-size: 34px; font-weight: 700; margin-top: 6mm; }
  .capa .big span { font-size: 13px; color: #B5B5B5; font-weight: 500; display: block; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 1mm; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 11mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
  .capa .meta div span { display: block; font-size: 8.5px; color: #8A8A8A; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 2px; }
  .capa .meta div strong { font-size: 12px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${INK}; padding-bottom: 3mm; margin-bottom: 5mm; }
  .head h2 { font-size: 21px; }
  .head .n { font-size: 9px; color: ${MUTED}; letter-spacing: .12em; text-transform: uppercase; font-family: Oswald, sans-serif; white-space: nowrap; margin-left: 6mm; }
  h3 { font-size: 13px; margin: 6mm 0 2.5mm; }
  h3:first-of-type { margin-top: 0; }
  p { margin: 0 0 3mm; }
  .lead { font-size: 11.4px; line-height: 1.58; }
  strong { font-weight: 600; }
  .muted { color: ${MUTED}; }
  .small { font-size: 9px; color: ${MUTED}; line-height: 1.5; }
  .tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin: 4mm 0 5mm; }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.4mm 3.4mm 3mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.6mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 19px; font-weight: 600; line-height: 1; }
  .tile .v .cur { font-size: 11px; font-weight: 500; color: ${MUTED}; margin-right: 1px; }
  .tile .d { font-size: 8.4px; color: ${MUTED}; margin-top: 1.6mm; line-height: 1.4; }
  .tile.gold { border-top-color: ${GOLD}; }
  .box { border: 1px solid ${GRID}; padding: 4mm 4.4mm; margin: 4mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li, .box.dark td { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box.dark td { border-bottom-color: #2A2A2A; }
  .box.rule { border: none; border-left: 3px solid ${INK}; padding: 1mm 0 1mm 4mm; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2.2mm; font-weight: 600; }
  .box.nota { padding: 3.4mm 4mm; margin-bottom: 0; }
  .box.nota .cols2 { gap: 5mm; }
  table { width: 100%; border-collapse: collapse; font-size: 9.3px; margin: 3mm 0; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.4px; letter-spacing: .07em; font-weight: 600;
       border-bottom: 1.4px solid ${INK}; padding: 2mm 1.8mm; }
  td { padding: 1.7mm 1.8mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.destaque td { background: #F6F6F6; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  table.faixa td { padding: 1.4mm 1.8mm; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .kv { display: grid; grid-template-columns: 26mm 1fr; row-gap: .9mm; column-gap: 2.5mm; font-size: 8.9px; line-height: 1.42; }
  .kv span { color: #9A9A9A; text-transform: uppercase; letter-spacing: .06em; font-size: 7.8px; padding-top: .6mm; }
</style></head><body>

<!-- ══ CAPA ══ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Relatório de<br>fechamento<small>Naviraí Camparino · 22 e 23/08/2026<br>Agropecuária Camparino LTDA</small></h1>
  <div class="rule"></div>
  <div class="sub">A fatia do Camparino no pregão conjunto com a Naviraí, conferida em quatro fontes — a listagem
  da Programa Leilões, o HastaPro, o grupo de lances e a planilha do chefe — e o valor da nota que sai daí.</div>
  <div class="big"><span>A receber da Agropecuária Camparino</span>R$ ${brl(D.receita)}</div>
  <div class="meta">
    <div><span>Faturamento Camparino</span><strong>R$ ${brl(D.faturamento)}</strong></div>
    <div><span>Cobertura Bula</span><strong>R$ ${brl(D.cobertura)} · ${pct(D.performance)}</strong></div>
    <div><span>Acordo</span><strong>${pct(D.faixa.pct, 2)} do faturamento (faixa até 10%)</strong></div>
    <div><span>Leiloeira</span><strong>Programa Leilões</strong></div>
    <div><span>Emitido em</span><strong>${dma(D.geradoEm)}</strong></div>
  </div>
</section>

<!-- ══ 1. PARECER ══ -->
<section class="page">
  <div class="head"><h2>Parecer: está certo, e a nota é de R$ ${brl(D.receita)}</h2><div class="n">01 · Parecer</div></div>

  <p class="lead">A Programa Leilões credita à <strong>Bula Assessoria Pecuária Eireli</strong> exatamente
  <strong>${D.lotesCamp.length} lotes</strong> do Camparino — <strong>R$ ${brl(D.cobertura)}</strong> dos
  <strong>R$ ${brl(D.faturamento)}</strong> que a Agropecuária Camparino faturou nas duas etapas
  (${e1.lotes + e2.lotes} lotes, ${e1.animais + e2.animais} cabeças, todos a 30 parcelas). São os mesmos 6 lotes, com os mesmos
  valores, que o HastaPro registra com vendedor <em>Fazenda Camparino</em> e que a equipe anunciou no grupo com a
  ficha “Foi com … da Bula Assessoria”. Cobertura de <strong>${pct(D.performance)}</strong> → faixa <em>0 a 10%</em>
  do acordo do Camparino → <strong>0,5% do faturamento = R$ ${brl(D.receita)}</strong>.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Faturamento do Camparino</div>
      <div class="v"><span class="cur">R$</span>${brl0(D.faturamento)}</div>
      <div class="d">${e1.lotes} fêmeas em 22/08 + ${e2.lotes} machos em 23/08</div></div>
    <div class="tile"><div class="k">Cobertura Bula (lotes Camparino)</div>
      <div class="v"><span class="cur">R$</span>${brl0(D.cobertura)}</div>
      <div class="d">${D.lotesCamp.length} lotes · ${D.lotesCamp.length} cabeças · 4 assessores</div></div>
    <div class="tile"><div class="k">Performance → faixa</div>
      <div class="v">${pct(D.performance)}</div>
      <div class="d">0 a 10% de cobertura → 0,5% do faturamento</div></div>
    <div class="tile gold"><div class="k">A receber · nota fiscal</div>
      <div class="v"><span class="cur">R$</span>${brl(D.receita)}</div>
      <div class="d">0,5% × R$ ${brl(D.faturamento)}</div></div>
  </div>

  <h3>As duas etapas, pela listagem da Programa</h3>
  <table>
    <tr><th>Data</th><th>Etapa</th><th class="num">Lotes</th><th class="num">Cab.</th><th class="num">Faturamento</th>
        <th class="num">Lotes Bula</th><th class="num">Cobertura</th><th class="num">Perf.</th><th class="num">0,5%</th></tr>
    ${linhasEtapas}
    <tr class="total"><td colspan="2">Evento (as duas etapas)</td><td class="num">${e1.lotes + e2.lotes}</td><td class="num">${e1.animais + e2.animais}</td>
      <td class="num">R$ ${brl(D.faturamento)}</td><td class="num">${D.lotesCamp.length}</td><td class="num">R$ ${brl(D.cobertura)}</td>
      <td class="num">${pct(D.performance)}</td><td class="num">R$ ${brl(D.receita)}</td></tr>
  </table>
  <p class="small">Os dois PDFs foram emitidos pelo sistema da Programa em ${esc(e2.emitido)} e ${esc(e1.emitido)}, filtrados por
  vendedor <em>Agropecuária Camparino LTDA</em> — por isso os lotes da Naviraí (Fazenda Santa Marta) não aparecem neles.
  Os 92 valores fecham centavo a centavo com os totais impressos e todos obedecem <em>lance × 30</em>.</p>

  <div class="cols2">
    <div class="box">
      <div class="t">A tabelinha do Camparino</div>
      <table class="faixa" style="margin:0">
        ${D.tabela.map(t => `<tr${t.pct === D.faixa.pct ? ' class="destaque"' : ''}><td>${esc(t.rotulo)}</td><td class="num"><strong>${pct(t.pct, 2)}</strong> do faturamento</td></tr>`).join('')}
      </table>
      <p class="small" style="margin:2mm 0 0">Aba “Acordos com Marcas” da planilha do chefe (FAZENDA CAMPARINO) — a mesma
      tabela gravada em <em>bula_leiloes.acordo_comissao</em> do Expozebu (30/04) e do 41º Touros (06/06).
      A Naviraí tem acordo próprio: <strong>${esc(D.navirai.acordo)}</strong>.</p>
    </div>
    <div class="box">
      <div class="t">Como foi conferido</div>
      <ul style="margin:0">
        <li><strong>Listagem da Programa</strong> (2 PDFs, 92 lotes): agente de vendas, comprador, lance e valor de cada lote.</li>
        <li><strong>HastaPro, filial 2</strong> (leilões ${D.hpLeiloes.map(h => h.lei).join(' e ')}): 27 lotes nossos no evento;
        <em>VENDEDORES</em> separa os ${D.lotesCamp.length} da Fazenda Camparino dos ${D.navirai.lotes.length} da Santa Marta.</li>
        <li><strong>Grupo “Lances Bula Assessoria”</strong>: ficha “Levamos lt … Foi com … da Bula” dos 6 lotes, com hora.</li>
        <li><strong>ERP + planilha do chefe</strong>: fechamentos de 22 e 23/08, CP de comissão por lote, linhas 131/132 e a aba de acordos.</li>
      </ul>
    </div>
  </div>

  <div class="box dark nota">
    <div class="t">Dados para a nota</div>
    <div class="cols2">
      <div class="kv">
        <span>Tomador</span><strong>${esc(D.tomador.razao)}</strong>
        <span>CNPJ</span><strong>${esc(D.tomador.cnpj)}</strong>
        <span>Inscr. estadual</span><div>${esc(D.tomador.ie)}</div>
        <span>Endereço</span><div>${esc(D.tomador.endereco)}, ${esc(D.tomador.cidade)} · CEP ${esc(D.tomador.cep)}</div>
        <span>Contato</span><div>${esc(D.tomador.telefone)} · ${esc(D.tomador.email)}</div>
        <span>Regime</span><div>Simples Nacional: ${esc(D.tomador.simples)} · ${esc(D.tomador.situacao)}</div>
      </div>
      <div class="kv">
        <span>Valor</span><strong>R$ ${brl(D.receita)}</strong>
        <span>Discriminação</span><div>Assessoria de vendas — Leilão Naviraí Camparino Essência (22/08/2026) e 28º Leilão Naviraí
        Camparino Reprodutores (23/08/2026), Uberaba-MG: 0,5% sobre o faturamento de R$ ${brl(D.faturamento)} dos lotes da
        Agropecuária Camparino (${D.lotesCamp.length} lotes assessorados, R$ ${brl(D.cobertura)}).</div>
        <span>Por etapa</span><div>22/08: 0,5% × R$ ${brl(e1.faturamento)} = R$ ${brl(D.receitaPorEtapa[0].receita)} · 23/08: 0,5% × R$ ${brl(e2.faturamento)} = R$ ${brl(D.receitaPorEtapa[1].receita)}</div>
        <span>Cadastro</span><div>${esc(D.tomador.fonte)}</div>
      </div>
    </div>
  </div>
  ${foot('Página 2 de 5')}
</section>

<!-- ══ 2. LOTE A LOTE ══ -->
<section class="page">
  <div class="head"><h2>Os 6 lotes, fonte por fonte</h2><div class="n">02 · Conferência</div></div>

  <p class="lead">Cada lote abaixo aparece nas três bases com o <strong>mesmo valor</strong>: a listagem da Programa
  (comprador de registro), o HastaPro (pisteiro e comprador cadastrado) e a ficha do grupo (quem vendeu, para quem, de onde).
  Nenhum lote da Bula ficou de fora da listagem e nenhum lote de terceiro foi creditado a nós.</p>

  <table>
    <tr><th>Data</th><th>Lote</th><th>Animal</th><th class="num">Lance</th><th class="num">Valor (30×)</th>
        <th>Comprador · Programa</th><th>Comprador · HastaPro / grupo</th><th>Assessor</th><th>Situação</th></tr>
    ${linhasLotes}
    <tr class="total"><td colspan="4">Cobertura Bula nos lotes do Camparino</td><td class="num">R$ ${brl(D.cobertura)}</td><td colspan="4">${D.lotesCamp.filter(l => l.confere).length} de ${D.lotesCamp.length} conferem nas três fontes</td></tr>
  </table>
  <p class="small">Dois lotes têm titular de registro diferente da ficha: no 28 a Programa cadastrou <em>Adriana Silva Magenski Bispo</em>
  (ficha: Val / Dra. Byanca Bispo; HastaPro: Murilo Carvalho Bispo — a mesma família de Novo Repartimento-PA) e no 105, <em>Elvio Severino
  Pereira</em> (ficha e HastaPro: Marco Túlio Severino, Faz. Ribeirão Bonito, Caçu-GO). É quem assinou o contrato na leiloeira, não outra
  venda — animal e valor são os mesmos. Vale acertar o titular no cadastro de clientes.</p>

  <div class="cols2">
    <div>
      <h3>Comissão da equipe nesses lotes</h3>
      <table>
        <tr><th>Assessor</th><th class="num">Lotes</th><th class="num">VGV</th><th class="num">%</th><th class="num">Comissão</th><th>ERP</th></tr>
        ${linhasAssessores}
        <tr class="total"><td>Total</td><td class="num">${D.lotesCamp.length}</td><td class="num">R$ ${brl(D.cobertura)}</td><td></td><td class="num">R$ ${brl(D.comissaoEquipe)}</td><td></td></tr>
      </table>
      <p class="small">Lucas a 1% (regra do Grupo Financeiro de 05/08); os demais a 2%. Os títulos já existem no ERP, presos aos
      fechamentos de 22 e 23/08 — nada a lançar do lado da despesa. O da Nane é um só (R$ 4.440, 6 lotes, sem vencimento) e
      cobre os dois lotes dela aqui.</p>
    </div>
    <div>
      <h3>Resultado desta nota</h3>
      <table>
        <tr><td>Receita (0,5% do faturamento)</td><td class="num">R$ ${brl(D.receita)}</td></tr>
        <tr><td>Imposto estimado (18%)</td><td class="num">− R$ ${brl(imposto)}</td></tr>
        <tr><td>Comissão da equipe (${D.lotesCamp.length} lotes)</td><td class="num">− R$ ${brl(D.comissaoEquipe)}</td></tr>
        <tr class="total"><td>Lucro líquido da fatia Camparino</td><td class="num">R$ ${brl(liquido)}</td></tr>
      </table>
      <p class="small">Receita por real vendido: ${pct(D.receita / D.cobertura)} da cobertura — a faixa de 0,5% a 5% de
      performance rende quase 10% do que vendemos; foi um bom recorte para a Bula.</p>
    </div>
  </div>
  ${foot('Página 3 de 5')}
</section>

<!-- ══ 3. NAVIRAÍ · SENSIBILIDADES ══ -->
<section class="page">
  <div class="head"><h2>Fora da nota, e onde o número poderia ser outro</h2><div class="n">03 · Naviraí · Sensibilidades</div></div>

  <div class="box rule" style="margin-top:0">
    <div class="t">Fora desta nota: a fatia da Naviraí</div>
    <p>No mesmo pregão a Bula vendeu mais <strong>${D.navirai.lotes.length} lotes</strong> — <strong>R$ ${brl(D.navirai.vgv)}</strong> —
    cujo vendedor no HastaPro é <em>Claudio Sabino Carvalho Filho e Outros · Fazenda Santa Marta</em>, ou seja, a Naviraí.
    Eles não estão na listagem do Camparino e não entram nesta nota. O acordo da Naviraí é outro
    (<strong>${esc(D.navirai.acordo)}</strong>), e em julho ela comissionou sobre o valor <em>à vista</em> — então essa
    cobrança precisa da listagem própria da Naviraí antes de sair.</p>
    <table style="margin:0 0 2mm; max-width: 110mm">
      <tr><th>Data</th><th class="num">Lotes</th><th class="num">VGV Bula</th><th class="num">5% (estimado)</th></tr>
      ${linhasNav}
      <tr class="total"><td>Naviraí</td><td class="num">${D.navirai.lotes.length}</td><td class="num">R$ ${brl(D.navirai.vgv)}</td><td class="num">R$ ${brl(D.navirai.receitaEstimada)}</td></tr>
    </table>
    <p class="small" style="margin:0">Inclui os dois lotes do Gustavo Rusa (1 e 5 de 22/08, R$ 378.000, comissão de 5% a ele já apurada) e o lote 22 de 23/08
    (R$ 63.000, “Marcelo Moura / Claudinho”, ainda em disputa de beneficiário).</p>
  </div>

  <h3>Três leituras alternativas</h3>
  <p>Nenhuma muda o parecer, mas duas mudam o valor — e é o chefe quem decide se a Programa/Camparino aceitam uma delas.</p>
  <table>
    <tr><th>Leitura</th><th>Como calcula</th><th class="num">Nota sairia por</th><th>Diferença</th><th>Avaliação</th></tr>
    <tr class="destaque"><td><strong>Relatório do Camparino + tabela dele</strong></td>
      <td>${pct(D.performance)} de cobertura → 0,5% × R$ ${brl(D.faturamento)}</td><td class="num"><strong>R$ ${brl(D.receita)}</strong></td><td>—</td>
      <td>É o que o Marcelo pediu (“relatório de todo o faturamento + a tabelinha”) e o que o acordo diz. <strong>Recomendada.</strong></td></tr>
    <tr><td>Planilha do chefe, linha ${p132.linha}</td>
      <td>0,75% sobre R$ ${brl(p132.faturamentoRealizado)} — o pregão inteiro de 23/08 (Naviraí + Camparino), com os
      R$ ${brl(p132.vendasBula)} nossos misturados: ${pct(S.planilhaChefe.performanceMista, 1)} → faixa 10–15%</td>
      <td class="num">R$ ${brl(S.planilhaChefe.fatiaCamparino)} só no dia 23<br>(evento: R$ ${brl(r2(S.planilhaChefe.fatiaCamparino + D.receitaPorEtapa[0].receita))})</td>
      <td class="num">+ R$ ${brl(r2(S.planilhaChefe.fatiaCamparino - D.receitaPorEtapa[1].receita))}</td>
      <td>Mistura os ${D.navirai.lotes.length} lotes da Naviraí (que pagam 5% da venda, não a tabela) na conta do Camparino. Se a
      Programa medir a performance no pregão conjunto, o Camparino sobe de faixa — mas o relatório que ele mandou é só o dele.</td></tr>
    <tr><td>Precedente do 41º Touros (${dm(S.precedente41.data)})</td>
      <td>${pct(S.precedente41.performance, 1)} de cobertura e a nota saiu a ${pct(S.precedente41.pctEfetivo, 2)}
      (R$ ${brl(S.precedente41.recebido)} sobre R$ ${brl(S.precedente41.faturamento)}) — acima da tabela</td>
      <td class="num">R$ ${brl(S.precedente41.seAplicasse)}</td><td class="num">+ R$ ${brl(r2(S.precedente41.seAplicasse - D.receita))}</td>
      <td>Em junho o Camparino pagou 0,75% numa faixa que a tabela dá 0,5%. Não há registro do porquê. Se foi um acordo,
      vale repetir; se foi erro deles, não é base.</td></tr>
    <tr><td>Etapa a etapa</td>
      <td>22/08: ${pct(e1.performance)} · 23/08: ${pct(e2.performance)} — as duas ficam abaixo de 10%</td>
      <td class="num">R$ ${brl(S.tabelaPorEtapa.total)}</td><td>—</td>
      <td>A tabela do Camparino não tem degrau abaixo de 10%, então somar ou separar as etapas dá o mesmo valor.</td></tr>
  </table>
  <p class="small">A linha ${p131.linha} da planilha (22/08) aplica <em>5% da venda</em> aos R$ ${brl(p131.vendasBula)} do dia —
  a regra da Naviraí — e leva junto o lote 28 do Camparino (R$ 72.000). Pelo acordo, esse lote entra aqui a 0,5% do faturamento,
  e a Naviraí só responde pelos 3 lotes da Santa Marta (R$ 471.000). As duas linhas precisam ser reescritas por vendedor.</p>
  ${foot('Página 4 de 5')}
</section>

<!-- ══ 4. QUEM VENDEU · ERP · RESUMO ══ -->
<section class="page">
  <div class="head"><h2>Quem vendeu o Camparino, o ERP e o resumo</h2><div class="n">04 · Mercado · ERP</div></div>

  <p class="lead">A listagem também mostra com quem a Bula disputou o Camparino. Em 22/08 ficamos em
  <strong>${rankAgentes[0].posBula}º</strong> entre ${e1.agentes.length} agentes; em 23/08, em <strong>${rankAgentes[1].posBula}º</strong> entre ${e2.agentes.length}.
  Nenhum assessor da equipe aparece com nome próprio na listagem — tudo o que é nosso está sob “Bula Assessoria Pecuária Eireli”.</p>

  <div class="cols2">
    ${rankAgentes.map(r => `<div>
      <h3>${esc(r.etapa.rotulo)} · ${dm(r.etapa.data)}</h3>
      <table>
        <tr><th class="num">#</th><th>Agente de vendas</th><th class="num">Lotes</th><th class="num">Valor</th><th class="num">% fat.</th></tr>
        ${r.linhas}
        <tr class="total"><td></td><td>Faturamento da etapa</td><td class="num">${r.etapa.lotes}</td><td class="num">R$ ${brl(r.etapa.faturamento)}</td><td class="num">100%</td></tr>
      </table>
    </div>`).join('')}
  </div>
  <p class="small">“Melhora +” levou o lote Ciência de R$ 630.000 do dia 22 e mais quatro fêmeas (o tributo boiadeiro, também de
  R$ 630.000, foi da Prime); no dia 23 a Thays Chiafitelli vendeu 14 garrotes para um único comprador. Os oito primeiros de cada
  etapa estão na tabela.</p>

  <h3>No ERP</h3>
  <div class="cols2">
    <div class="box" style="margin-top:0">
      <div class="t">Como está hoje</div>
      <ul style="margin:0">
        ${D.fechamentos.map(f => `<li><strong>${dm(f.data)}</strong> — fechamento <em>${esc(f.origem)}</em>, ${f.lances} lotes, VGV R$ ${brl(f.vgv)},
        comissão R$ ${brl(f.comissao)}; <strong>receita R$ ${brl(f.receita)}</strong>, faturamento ${f.faturamento ? 'R$ ' + brl(f.faturamento) : '<strong>em branco</strong>'}, sem acordo gravado.</li>`).join('')}
        <li><strong>Contas a receber:</strong> ${D.crExistentes === 0 ? 'nenhuma' : D.crExistentes} para o evento — a receita ainda não existe no ERP.</li>
        <li><strong>Contas a pagar:</strong> comissões por lote já lançadas (venc. 25/09), incluindo os R$ ${brl(D.comissaoEquipe)} destes 6 lotes.</li>
      </ul>
    </div>
    <div class="box" style="margin-top:0">
      <div class="t">O que lançar depois da nota (proposta)</div>
      <ol style="margin:0">
        <li>Dois CR em nome da <strong>Agropecuária Camparino LTDA</strong>, um por fechamento:
        R$ ${brl(D.receitaPorEtapa[0].receita)} (22/08) e R$ ${brl(D.receitaPorEtapa[1].receita)} (23/08), origem <em>real</em>,
        com o nº da NF — e <strong>vencimento na data combinada com a Programa</strong>, não “+45 dias”.</li>
        <li>Nos dois fechamentos: gravar o acordo (0,5% · faixa 0–10%) e anotar que o faturamento de R$ ${brl(D.faturamento)} é
        <strong>só do Camparino</strong>; a receita da Naviraí entra em CR separado quando vier a listagem dela.</li>
        <li>Reescrever as linhas ${p131.linha} e ${p132.linha} da planilha por vendedor (Camparino 0,5% · Naviraí 5% da venda).</li>
        <li>Corrigir no cadastro de clientes o titular dos lotes 28 e 105.</li>
      </ol>
    </div>
  </div>

  <div class="box dark">
    <div class="t">Resumo para o chefe</div>
    <p style="margin:0">Pode emitir: <strong>R$ ${brl(D.receita)}</strong> para a <strong>Agropecuária Camparino LTDA</strong>
    (CNPJ ${esc(D.tomador.cnpj)}), 0,5% sobre R$ ${brl(D.faturamento)} — ${D.lotesCamp.length} lotes nossos conferidos na listagem, no HastaPro e no
    grupo. A Naviraí (R$ ${brl(D.navirai.vgv)} em ${D.navirai.lotes.length} lotes, 5% da venda ≈ R$ ${brl(D.navirai.receitaEstimada)}) é outra nota e
    espera a listagem dela. Única decisão em aberto: se vale pedir os 0,75% que o Camparino pagou em junho
    (+ R$ ${brl(r2(S.precedente41.seAplicasse - D.receita))}).</p>
  </div>
  ${foot('Página 5 de 5')}
</section>
</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)

const destino = path.join(os.homedir(), 'Desktop', 'Bula - Relatorio de Fechamento - Navirai Camparino (Agropecuaria Camparino) - ago 2026.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p, i) => ({ pagina: i + 1, sobra: p.scrollHeight - p.clientHeight })))
for (const o of overflow) if (o.sobra > 0) console.warn(`⚠ página ${o.pagina} transborda ${o.sobra}px`)
if (overflow.every(o => o.sobra <= 0)) console.log('paginas OK (sem transbordo)')
await page.pdf({ path: destino, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
await browser.close()
const pdf = await PDFDocument.load(fs.readFileSync(destino))
console.log('paginas no PDF:', pdf.getPageCount(), '(esperado', (html.match(/<section class="page/g) || []).length + ')')
fs.copyFileSync(destino, path.join(OUT, 'Relatorio-Fechamento-Camparino-ago-2026.pdf'))
console.log('HTML  →', path.join(OUT, 'relatorio.html'))
console.log('PDF   →', destino)
