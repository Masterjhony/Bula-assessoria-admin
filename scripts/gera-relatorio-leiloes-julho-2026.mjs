// Gera o Relatório de Desempenho dos Leilões — Julho/2026 (PDF, brandbook preto/branco + dourado <5%).
// Fontes: bula_leiloes, bula_leilao_fechamento, bula_leilao_vendas, cronograma_leiloes
// (snapshot em outputs/relatorio-julho-2026-raw.json, gerado por relatorio-leiloes-julho-2026-dados.mjs).
// Uso: node scripts/relatorio-leiloes-julho-2026-dados.mjs && node scripts/gera-relatorio-leiloes-julho-2026.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = JSON.parse(readFileSync(join(root, 'outputs', 'relatorio-julho-2026-raw.json'), 'utf-8'))
const { leiloes, fechamentos, vendas, cronograma } = raw

const isJul = (d) => typeof d === 'string' && d.startsWith('2026-07')
const brl0 = (n) => 'R$ ' + Math.round(Number(n || 0)).toLocaleString('pt-BR')
const num = (n) => Number(n || 0).toLocaleString('pt-BR')
const dmy = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

const cronJul = cronograma.filter((c) => isJul(c.data)).sort((a, b) => a.data.localeCompare(b.data))
const fechJul = fechamentos.filter((f) => isJul(f.data)).sort((a, b) => a.data.localeCompare(b.data))
const vendasJul = vendas.filter((v) => isJul(v.leilao_data))

// ── matching cronograma ↔ fechamento (mesma data + tokens distintivos em comum) ──
const STOP = new Set(['LEILAO', 'VIRTUAL', 'ETAPA', 'EVENTO', 'MEGA', 'NELORE', 'BASE', 'GENETICA', 'AGROPECUARIA', 'DE', 'DO', 'DA', 'E'])
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const tokens = (s) => new Set(norm(s).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/)
  .map((t) => t.replace(/^(TOUROS|MACHOS)$/, 'TOUROS').replace(/^FEMEA(S)?$/, 'FEMEAS'))
  .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+[ºª]?$/.test(t)))
// exceção: GENETICA distingue "Genética Aditiva"; volto com ela quando o par tiver ADITIVA
const score = (a, b) => { const tb = tokens(b); let s = 0; for (const t of tokens(a)) if (tb.has(t)) s++; return s }

const matchedCron = new Map() // cron.id -> fechamento
const extraFech = []
for (const f of fechJul) {
  const cands = cronJul.filter((c) => c.data === f.data && !matchedCron.has(c.id))
    .map((c) => ({ c, s: score(f.nome, c.nome) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)
  if (cands.length) matchedCron.set(cands[0].c.id, f)
  else extraFech.push(f)
}
const semFechamento = cronJul.filter((c) => !matchedCron.has(c.id))

// ── agregados ──
const sum = (arr, k) => arr.reduce((s, x) => s + Number(x[k] || 0), 0)
const lotesOfert = sum(fechJul, 'lotes_ofertados')
const lotesVend = sum(fechJul, 'lotes_vendidos')
const animais = sum(fechJul, 'animais_vendidos')
const vgvTotal = sum(fechJul, 'vgv_total')
const taxaVenda = lotesOfert ? (100 * lotesVend / lotesOfert) : 0
const ticketAnimal = animais ? vgvTotal / animais : 0
const ticketLote = lotesVend ? vgvTotal / lotesVend : 0

const ranking = [...fechJul].sort((a, b) => Number(b.vgv_total) - Number(a.vgv_total))

// maior lance individual (maior VGV de lote entre todos os lances dos fechamentos)
let topLance = null
for (const f of fechJul) for (const l of f.lances || []) {
  if (!topLance || Number(l.vgv || 0) > Number(topLance.vgv)) topLance = { ...l, leilao: f.nome, data: f.data }
}
const categoria = (nomeLeilao, l) => {
  const n = norm(nomeLeilao)
  const base = /FEMEA|MATRIZ|DOADORA/.test(n) ? 'Fêmeas' : /TOURO|MACHO/.test(n) ? 'Machos' : ''
  const qtd = Number(l.animais || 1)
  return base ? `${base}${qtd > 1 ? ` (lote com ${qtd} animais)` : ''}` : `Lote com ${qtd} animais`
}

console.log(`Cronograma jul: ${cronJul.length} | Fechamentos jul: ${fechJul.length} (${matchedCron.size} do cronograma + ${extraFech.length} extra) | Sem fechamento: ${semFechamento.length}`)
console.log(`Lotes ${lotesVend}/${lotesOfert} (${taxaVenda.toFixed(1)}%) | Animais ${animais} | VGV ${brl0(vgvTotal)} | Ticket/animal ${brl0(ticketAnimal)} | Ticket/lote ${brl0(ticketLote)}`)
console.log('Maior lance:', topLance && `${brl0(topLance.vgv)} · ${topLance.leilao} · lote ${topLance.lote} · ${topLance.comprador}`)
for (const c of semFechamento) console.log('  SEM FECHAMENTO:', dmy(c.data), c.nome)
for (const f of extraFech) console.log('  EXTRA (fora do cronograma):', dmy(f.data), f.nome)

// ── HTML ──
const logoWhite = readFileSync(join(root, 'public', 'logo-bula-assessoria-white.png')).toString('base64')
const maxVgv = Number(ranking[0]?.vgv_total || 1)
const cap = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')

const barRows = ranking.map((f, i) => `
  <div class="bar-row">
    <div class="bar-label">${cap(f.nome)}</div>
    <div class="bar-track"><div class="bar" style="width:${Math.max(2, 100 * Number(f.vgv_total) / maxVgv).toFixed(1)}%"></div>
      <span class="bar-val">${brl0(f.vgv_total)}</span></div>
  </div>`).join('')

const rankRows = ranking.map((f, i) => `
  <tr>
    <td class="pos">${i + 1}º</td>
    <td class="nome">${cap(f.nome)}</td>
    <td>${dmy(f.data)}</td>
    <td class="r">${num(f.lotes_vendidos)}</td>
    <td class="r">${num(f.animais_vendidos)}</td>
    <td class="r">${num(f.compradores_unicos)}</td>
    <td class="r strong">${brl0(f.vgv_total)}</td>
    <td class="r">${brl0(f.ticket_medio)}</td>
  </tr>`).join('')

const pendRows = semFechamento.map((c) => `
  <tr>
    <td>${dmy(c.data)}</td>
    <td class="nome">${cap(c.nome)}</td>
    <td>${cap(c.criador || '—')}</td>
    <td>${cap(c.leiloeira || '—')}</td>
  </tr>`).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --ink:#0B0B0B; --graphite:#3A3A3A; --muted:#6E6E6E; --line:#E4E1DB; --gold:#C9A84C; --paper:#FFFFFF; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter', Arial, sans-serif; color:var(--ink); background:var(--paper); font-size:10.5px; line-height:1.45; }
  .page { padding:0 46px 30px; }
  h1,h2,.kpi-label,.pos { font-family:'Oswald','Arial Narrow',sans-serif; text-transform:uppercase; }

  header { background:var(--ink); color:#fff; padding:30px 46px 26px; display:flex; align-items:center; justify-content:space-between; }
  header img { height:52px; }
  .htitle { text-align:right; }
  .htitle .kicker { font-size:10px; letter-spacing:3px; color:#BBB; text-transform:uppercase; }
  .htitle h1 { font-size:25px; font-weight:500; letter-spacing:1.5px; margin-top:2px; }
  .htitle .sub { font-size:10px; color:var(--gold); letter-spacing:2px; text-transform:uppercase; margin-top:4px; }

  h2 { font-size:14px; font-weight:600; letter-spacing:2px; margin:26px 0 10px; padding-bottom:6px; border-bottom:2px solid var(--ink); position:relative; }
  h2::after { content:''; position:absolute; left:0; bottom:-2px; width:34px; height:2px; background:var(--gold); }

  .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:18px; }
  .kpi { border:1px solid var(--line); border-top:3px solid var(--ink); padding:11px 13px 10px; }
  .kpi-label { font-size:9px; letter-spacing:1.6px; color:var(--muted); font-weight:500; }
  .kpi-value { font-size:21px; font-weight:700; margin-top:3px; letter-spacing:-.3px; }
  .kpi-note { font-size:8.5px; color:var(--muted); margin-top:2px; }

  table { width:100%; border-collapse:collapse; }
  th { font-size:8.5px; text-transform:uppercase; letter-spacing:1.2px; color:var(--muted); font-weight:600; text-align:left; padding:6px 8px; border-bottom:1.5px solid var(--ink); }
  td { padding:6px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
  tbody tr:nth-child(even) td { background:#FAF9F7; }
  td.r, th.r { text-align:right; font-variant-numeric:tabular-nums; }
  td.strong { font-weight:700; }
  td.pos { font-weight:600; color:var(--graphite); width:26px; }
  td.nome { font-weight:500; }
  tfoot td { border-top:2px solid var(--ink); border-bottom:none; font-weight:700; background:none !important; white-space:nowrap; }

  .bar-row { display:grid; grid-template-columns:230px 1fr; align-items:center; gap:10px; margin-bottom:5px; }
  .bar-label { font-size:8.8px; color:var(--graphite); text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bar-track { display:flex; align-items:center; gap:7px; }
  .bar { height:11px; background:var(--graphite); border-radius:0 3px 3px 0; }
  .bar-row:first-child .bar { background:var(--ink); }
  .bar-val { font-size:8.8px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; }

  .destaque { border:1px solid var(--line); border-left:4px solid var(--gold); padding:14px 18px; display:flex; align-items:baseline; gap:22px; margin-top:4px; }
  .destaque .valor { font-size:27px; font-weight:700; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .destaque .det { font-size:10px; color:var(--graphite); }
  .destaque .det b { color:var(--ink); }

  .nota { font-size:8.6px; color:var(--muted); margin-top:8px; }
  .nota li { margin:3px 0 0 14px; }
  footer { margin-top:26px; padding-top:8px; border-top:1px solid var(--line); font-size:8.5px; color:var(--muted); display:flex; justify-content:space-between; }
  .avoid-break { break-inside:avoid; }
</style></head><body>

<header>
  <img src="data:image/png;base64,${logoWhite}" alt="Bula Assessoria">
  <div class="htitle">
    <div class="kicker">Relatório de Desempenho</div>
    <h1>Leilões · Julho 2026</h1>
    <div class="sub">Cobertura Bula Assessoria</div>
  </div>
</header>

<div class="page">
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Leilões no mês</div><div class="kpi-value">${cronJul.length}</div><div class="kpi-note">cronograma oficial de julho</div></div>
    <div class="kpi"><div class="kpi-label">Com fechamento</div><div class="kpi-value">${fechJul.length}</div><div class="kpi-note">${matchedCron.size} do cronograma + ${extraFech.length} avulso (${cap(extraFech.map((f) => f.nome.split(' - ')[0]).join(', ') || '—')})</div></div>
    <div class="kpi"><div class="kpi-label">Lotes vendidos</div><div class="kpi-value">${num(lotesVend)}<span style="font-size:12px;color:var(--muted);font-weight:500"> / ${num(lotesOfert)}</span></div><div class="kpi-note">taxa de venda ${taxaVenda.toFixed(0)}% (lotes com atuação Bula)</div></div>
    <div class="kpi"><div class="kpi-label">Animais vendidos</div><div class="kpi-value">${num(animais)}</div><div class="kpi-note">em ${num(lotesVend)} lotes</div></div>
    <div class="kpi"><div class="kpi-label">VGV do mês</div><div class="kpi-value">${brl0(vgvTotal)}</div><div class="kpi-note">valor geral de vendas · cobertura Bula</div></div>
    <div class="kpi"><div class="kpi-label">Ticket médio</div><div class="kpi-value">${brl0(ticketAnimal)}</div><div class="kpi-note">por animal · ${brl0(ticketLote)} por lote</div></div>
  </div>

  <div class="avoid-break">
  <h2>Ranking por VGV</h2>
  ${barRows}
  </div>

  <div class="avoid-break">
  <table style="margin-top:12px">
    <thead><tr><th></th><th>Leilão</th><th>Data</th><th class="r">Lotes</th><th class="r">Animais</th><th class="r">Compradores</th><th class="r">VGV</th><th class="r">Ticket/animal</th></tr></thead>
    <tbody>${rankRows}</tbody>
    <tfoot><tr><td></td><td>Total do mês</td><td></td><td class="r">${num(lotesVend)}</td><td class="r">${num(animais)}</td><td class="r">${num(sum(fechJul, 'compradores_unicos'))}*</td><td class="r">${brl0(vgvTotal)}</td><td class="r">${brl0(ticketAnimal)}</td></tr></tfoot>
  </table>
  <div class="nota">* Soma dos compradores únicos de cada leilão — um mesmo comprador pode aparecer em mais de um leilão.</div>
  </div>

  <div class="avoid-break">
  <h2>Maior lance individual do mês</h2>
  <div class="destaque">
    <div class="valor">${brl0(topLance.vgv)}</div>
    <div class="det">
      <b>${cap(topLance.leilao)}</b> · ${dmy(topLance.data)}<br>
      Lote ${cap(topLance.lote)} · ${categoria(topLance.leilao, topLance)} · ${num(topLance.parcelas || 30)} parcelas de ${brl0(Number(topLance.vgv) / Number(topLance.parcelas || 30))}<br>
      Comprador: <b>${cap(topLance.comprador)}</b>
    </div>
  </div>
  </div>

  <div class="avoid-break">
  <h2>Leilões sem fechamento cadastrado</h2>
  <table>
    <thead><tr><th>Data</th><th>Leilão</th><th>Criador</th><th>Leiloeira</th></tr></thead>
    <tbody>${pendRows}</tbody>
  </table>
  <div class="nota">${semFechamento.length} leilões do cronograma de julho ainda sem fechamento no sistema — sem registro de venda com atuação da Bula até a data deste relatório.</div>
  </div>

  <div class="avoid-break">
  <h2>Nota metodológica</h2>
  <ul class="nota">
    <li>Fontes: <b>cronograma_leiloes</b> (agenda oficial), <b>bula_leiloes</b> (agenda operacional), <b>bula_leilao_fechamento</b> (fechamentos) e <b>bula_leilao_vendas</b> (${vendasJul.length} lances capturados ao vivo pelo parser do grupo "Lances Bula" em julho).</li>
    <li>O fechamento registra a <b>cobertura Bula</b>: lotes vendidos com atuação dos pisteiros da Bula Assessoria — não é o faturamento total do leilão. Por isso "lotes ofertados" reflete os lotes com atuação Bula e a taxa de venda tende a 100%.</li>
    <li>VGV = valor geral de vendas (parcela × nº de parcelas, por lote). Ticket médio = VGV ÷ animais vendidos.</li>
    <li>Maior lance individual = lote de maior VGV entre todos os lances registrados nos fechamentos do mês.</li>
  </ul>
  </div>

  <footer>
    <span>Bula Assessoria · bulaassessoria.com</span>
    <span>Gerado em 06/08/2026 · dados do sistema em tempo real</span>
  </footer>
</div>
</body></html>`

const htmlPath = join(root, 'outputs', 'Relatorio-Leiloes-Julho-2026-Bula.html')
writeFileSync(htmlPath, html)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
const pdfPath = join(root, 'outputs', 'Relatorio-Leiloes-Julho-2026-Bula.pdf')
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF gerado:', pdfPath)
