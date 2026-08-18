// Clientes-alvo para o Mega EAO Baviera (fim de semana 10–12/07/2026).
// Analisa os compradores dos fechamentos: em que leilões compraram, tipo de
// animal (touro/matriz/aspiração — inferido pelo nome do leilão), faixa de preço
// por cabeça e preferência. Ranqueia os melhores clientes por categoria do evento.
// Saída: PDF (multipágina) + PNG (resumo) + HTML na Área de Trabalho.
// Uso: node scripts/gera-clientes-alvo-eao.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()

// ── helpers ──────────────────────────────────────────────────────────────────
const nk = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const CAT_META = {
    touros: { label: 'Touros / reprodutores', short: 'Touros' },
    matrizes: { label: 'Matrizes / fêmeas', short: 'Matrizes' },
    embrioes: { label: 'Aspirações / embriões / doadoras', short: 'Aspirações' },
    bezerras: { label: 'Bezerras / bezerros', short: 'Bezerras' },
    geral: { label: 'Geral / misto', short: 'Geral' },
}
function categoria(nome) {
    const n = String(nome || '')
    if (/bezerr/i.test(n)) return 'bezerras'
    if (/embri|aspira|doadora|s[êe]men|\bdose/i.test(n)) return 'embrioes'
    if (/touro|reprodutor|\bmacho/i.test(n)) return 'touros'
    if (/matriz|f[êe]mea|ventre|novilha|prenhe|\bvaca/i.test(n)) return 'matrizes'
    return 'geral'
}
const milOf = n => {
    if (!n) return '—'
    if (n >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    return `R$ ${Math.round(n / 1000).toLocaleString('pt-BR')} mil`
}
const brl0 = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n || 0)
const fmtData = d => { const s = (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10)); const [y, m, dd] = s.split('-'); return dd ? `${dd}/${m}/${y}` : '—' }
const fmtFone = ph => { const d = String(ph || '').replace(/\D/g, '').replace(/^55/, ''); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return ph ? String(ph) : '' }
const percentil = (arr, q) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor((s.length - 1) * q)] }

// ── dados ──────────────────────────────────────────────────────────────────
const { rows: fechs } = await db.query(`select id, nome, data, compradores from bula_leilao_fechamento order by data`)

// telefones do CRM (paginado)
const leads = []
for (let off = 0; ; off += 1000) {
    const { rows } = await db.query(`select nome, empresa, celular, telefone, estado, cidade, cpf, inscricao_estadual, tem_inscricao_estadual from crm_leads where arquivado=false order by created_at limit 1000 offset ${off}`)
    leads.push(...rows); if (rows.length < 1000) break
}
const leadByName = new Map()
for (const l of leads) for (const nm of [l.nome, l.empresa]) { const k = nk(nm); if (k && !leadByName.has(k)) leadByName.set(k, l) }

// clientes manuais (telefone/preferência sobrepõem)
let clientesManual = []
try { const { rows } = await db.query(`select match_key, nome, telefone, uf, cidade, preferencias_categorias, observacoes from clientes`); clientesManual = rows } catch { }
const cliByKey = new Map(clientesManual.map(c => [c.match_key, c]))

await db.end()

// ── agrega compradores ──────────────────────────────────────────────────────
const buyers = new Map()
const catPrices = { touros: [], matrizes: [], embrioes: [], bezerras: [], geral: [] }
for (const f of fechs) {
    const cat = categoria(f.nome)
    for (const c of (f.compradores || [])) {
        const name = String(c.fazenda || c.comprador || '').trim()
        const key = nk(name); if (!key) continue
        let b = buyers.get(key)
        if (!b) { b = { key, name, comprador: String(c.comprador || '').trim(), cidade: c.cidade || '', uf: c.uf || '', compras: [], catAnimals: {}, catVgv: {}, catPerHead: {}, fechs: new Set() }; buyers.set(key, b) }
        if (c.cidade) b.cidade = c.cidade
        if (c.uf) b.uf = c.uf
        if (!b.comprador && c.comprador) b.comprador = String(c.comprador).trim()
        const animais = Number(c.animais) || 0, vgv = Number(c.vgv) || 0
        const perHead = animais > 0 ? vgv / animais : 0
        b.fechs.add(String(f.id))
        b.compras.push({ leilao: f.nome, data: f.data, cat, animais, vgv, lotes: Number(c.lotes) || 0, perHead })
        b.catAnimals[cat] = (b.catAnimals[cat] || 0) + animais
        b.catVgv[cat] = (b.catVgv[cat] || 0) + vgv
        if (perHead > 0) { (b.catPerHead[cat] = b.catPerHead[cat] || []).push(perHead); catPrices[cat].push(perHead) }
    }
}

// enriquece cada comprador
const clientes = [...buyers.values()].map(b => {
    const total = b.compras.reduce((s, x) => s + x.vgv, 0)
    const animals = b.compras.reduce((s, x) => s + x.animais, 0)
    const nfech = b.fechs.size
    const lead = leadByName.get(b.key) || (b.comprador ? leadByName.get(nk(b.comprador)) : undefined)
    const cli = cliByKey.get(b.key)
    const fone = (cli?.telefone || lead?.celular || lead?.telefone || '').replace(/\D/g, '')
    const uf = (b.uf || cli?.uf || lead?.estado || '').toUpperCase()
    const cidade = b.cidade || cli?.cidade || lead?.cidade || ''
    // preferência = categoria com mais animais (ignora geral se houver categoria específica)
    const catsOrdered = Object.entries(b.catAnimals).sort((x, y) => y[1] - x[1])
    const specific = catsOrdered.filter(([c]) => c !== 'geral')
    const pref = (specific[0] || catsOrdered[0] || ['geral', 0])[0]
    const ultima = b.compras.map(x => (x.data instanceof Date ? x.data.toISOString().slice(0, 10) : String(x.data || '').slice(0, 10))).filter(Boolean).sort().at(-1)
    const perHeadAll = b.compras.filter(x => x.perHead > 0).map(x => x.perHead)
    const tem_ie = String(cli?.tem_inscricao_estadual || lead?.tem_inscricao_estadual || (lead?.inscricao_estadual ? 'Sim' : '')).trim()
    return {
        ...b, total, animals, nfech, fone, uf, cidade, pref, ultima,
        priceMin: perHeadAll.length ? Math.min(...perHeadAll) : 0,
        priceMed: percentil(perHeadAll, 0.5),
        priceMax: perHeadAll.length ? Math.max(...perHeadAll) : 0,
        temContato: !!fone,
        temIE: /sim/i.test(tem_ie),
        tier: total >= 500000 ? 'VIP' : total >= 200000 ? 'Premium' : nfech >= 2 ? 'Recorrente' : 'Ocasional',
    }
})

// faixa histórica por categoria (referência de mercado)
const catFaixa = {}
for (const c of Object.keys(catPrices)) {
    const a = catPrices[c]
    catFaixa[c] = a.length ? { n: a.length, min: Math.min(...a), p25: percentil(a, 0.25), med: percentil(a, 0.5), p75: percentil(a, 0.75), max: Math.max(...a) } : null
}

// ── ranking por categoria do evento ─────────────────────────────────────────
function rankFor(cat) {
    return clientes
        .filter(c => (c.catAnimals[cat] || 0) > 0)
        .sort((a, b) => (b.catVgv[cat] || 0) - (a.catVgv[cat] || 0) || (b.ultima || '').localeCompare(a.ultima || ''))
}
const touros = rankFor('touros')
const matrizes = rankFor('matrizes')
const embrioes = rankFor('embrioes')
// adjacentes p/ aspirações: perfil premium (matrizes/geral alto ticket) que ainda não compraram embrião
const adjEmbri = clientes
    .filter(c => !(c.catAnimals.embrioes > 0) && c.total >= 150000 && (c.catAnimals.matrizes > 0 || c.pref === 'geral'))
    .sort((a, b) => b.total - a.total).slice(0, 10)
const vips = [...clientes].sort((a, b) => b.total - a.total).slice(0, 12)

// ── KPIs ────────────────────────────────────────────────────────────────────
const totalVgv = clientes.reduce((s, c) => s + c.total, 0)
const totalAnimals = clientes.reduce((s, c) => s + c.animals, 0)
const comContato = clientes.filter(c => c.temContato).length
const nLeiloes = new Set(fechs.map(f => f.id)).size

console.log(`clientes=${clientes.length} vgv=${brl0(totalVgv)} touros=${touros.length} matrizes=${matrizes.length} embrioes=${embrioes.length} comContato=${comContato}`)

// ── render helpers ───────────────────────────────────────────────────────────
const tierTag = t => `<span class="tier t-${t.toLowerCase()}">${t}</span>`
const foneCell = c => c.fone
    ? `<a class="fone" href="https://wa.me/55${c.fone.replace(/^55/, '')}">${esc(fmtFone(c.fone))}</a>`
    : `<span class="sem">sem contato</span>`
const priceBand = (c, cat) => {
    const arr = c.catPerHead[cat] || []
    if (!arr.length) return '—'
    const mn = Math.min(...arr), mx = Math.max(...arr), md = percentil(arr, 0.5)
    return mn === mx ? milOf(md) : `${milOf(mn)}–${milOf(mx)}<span class="med"> · méd ${milOf(md)}</span>`
}
const localOf = c => [c.cidade, c.uf].filter(Boolean).join('/') || '—'

function rankTable(list, cat, limit) {
    const rows = list.slice(0, limit).map((c, i) => `
    <tr>
      <td class="rk">${i + 1}</td>
      <td class="cli">
        <div class="nm">${esc(c.name)}${c.temIE ? '<span class="ie">I.E.</span>' : ''}</div>
        ${c.comprador && nk(c.comprador) !== c.key ? `<div class="sub">${esc(c.comprador)}</div>` : ''}
      </td>
      <td class="loc">${esc(localOf(c))}</td>
      <td class="fon">${foneCell(c)}</td>
      <td class="num">${c.catAnimals[cat] || 0}</td>
      <td class="band">${priceBand(c, cat)}</td>
      <td class="num tot">${milOf(c.catVgv[cat] || 0)}</td>
      <td class="tt">${tierTag(c.tier)}</td>
      <td class="ult">${fmtData(c.ultima)}</td>
    </tr>`).join('')
    return `<table class="rank"><thead><tr>
      <th>#</th><th>Cliente / fazenda</th><th>Local</th><th>Contato</th>
      <th>Cab. ${CAT_META[cat].short.toLowerCase()}</th><th>Faixa/cab.</th><th>VGV cat.</th><th>Perfil</th><th>Últ. compra</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="9" class="empty">Sem compradores registrados nesta categoria.</td></tr>'}</tbody></table>`
}

const faixaLine = cat => {
    const f = catFaixa[cat]
    if (!f) return ''
    return `<div class="faixa-ref">Faixa histórica ${CAT_META[cat].short.toLowerCase()} nos leilões Bula: <b>${milOf(f.min)}–${milOf(f.max)}/cab.</b> · mais comum ${milOf(f.p25)}–${milOf(f.p75)} · mediana ${milOf(f.med)} <span class="n">(${f.n} cab.)</span></div>`
}

// mini top-5 para a capa
const miniCard = (title, sub, list, cat) => `
  <div class="mini">
    <div class="mini-h"><span class="mini-t">${title}</span><span class="mini-s">${sub}</span></div>
    <ol class="mini-list">
      ${list.slice(0, 5).map(c => `<li><span class="mn">${esc(c.name)}</span><span class="mv">${milOf(cat ? (c.catVgv[cat] || 0) : c.total)}${c.temContato ? '' : ' <i class="nc">·s/ tel</i>'}</span></li>`).join('') || '<li class="empty">—</li>'}
    </ol>
  </div>`

const appendixRows = [...clientes].sort((a, b) => b.total - a.total).map(c => `
  <tr>
    <td class="nm">${esc(c.name)}</td>
    <td>${esc(localOf(c))}</td>
    <td>${foneCell(c)}</td>
    <td>${CAT_META[c.pref]?.short || '—'}</td>
    <td class="num">${c.animals}</td>
    <td class="num">${c.nfech}</td>
    <td class="band">${c.priceMin ? (c.priceMin === c.priceMax ? milOf(c.priceMed) : `${milOf(c.priceMin)}–${milOf(c.priceMax)}`) : '—'}</td>
    <td class="num tot">${brl0(c.total)}</td>
    <td>${fmtData(c.ultima)}</td>
  </tr>`).join('')

const genLabel = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  :root{--ink:#111;--graphite:#3a3a3a;--muted:#8a8a8a;--line:#e6e4df;--panel:#faf9f6;--gold:#C9A84C;
    --cond:'Arial Narrow','Oswald','Segoe UI',sans-serif;--sans:'Segoe UI',system-ui,sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);color:var(--ink);background:#fff;font-size:12px;line-height:1.4}
  .page{width:210mm;min-height:296mm;padding:16mm 15mm;margin:0 auto;background:#fff;position:relative;page-break-after:always}
  .page:last-child{page-break-after:auto}
  h1{font-family:var(--cond);text-transform:uppercase;letter-spacing:.01em;font-size:38px;line-height:.98;font-weight:700}
  .brand{font-family:var(--cond);text-transform:uppercase;letter-spacing:.26em;font-size:12px;color:var(--graphite);font-weight:700}
  .cap-head{border-bottom:2px solid var(--ink);padding-bottom:20px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:flex-end}
  .cap-sub{color:var(--muted);font-size:13px;margin-top:10px}.cap-sub b{color:var(--ink)}
  .gen{text-align:right;font-size:10.5px;color:var(--muted);line-height:1.6}
  /* event card */
  .event{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:22px}
  .ev{background:var(--panel);padding:14px 16px}
  .ev .d{font-family:var(--cond);font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
  .ev .t{font-size:11px;color:var(--muted);margin-top:2px}
  .ev.foco{background:#12100b;color:#fff}.ev.foco .t{color:#b8b2a4}
  /* kpis */
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:24px}
  .kpi{background:#fff;padding:15px 14px}
  .kpi .v{font-family:var(--cond);font-size:34px;font-weight:700;line-height:.9}
  .kpi .l{text-transform:uppercase;letter-spacing:.07em;font-size:9.5px;color:var(--muted);margin-top:6px;font-weight:600}
  .kpi.accent .v{color:var(--gold)}
  /* mini cards */
  .minis{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:6px}
  .mini{border:1px solid var(--line);border-top:3px solid var(--ink);padding:12px 14px}
  .mini:nth-child(3){border-top-color:var(--gold)}
  .mini-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px}
  .mini-t{font-family:var(--cond);text-transform:uppercase;letter-spacing:.05em;font-size:14px;font-weight:700}
  .mini-s{font-size:10px;color:var(--muted)}
  .mini-list{list-style:none}
  .mini-list li{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid #f0efea;font-size:11px}
  .mini-list li:last-child{border-bottom:none}
  .mn{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:135px}
  .mv{font-family:var(--cond);font-size:12.5px;white-space:nowrap}.nc{color:var(--muted);font-style:normal;font-size:9px}
  .cap-note{font-size:10.5px;color:var(--muted);margin-top:20px;border-top:1px solid var(--line);padding-top:12px}
  /* section */
  .sec-head{display:flex;align-items:baseline;justify-content:space-between;border-bottom:2px solid var(--ink);padding-bottom:8px;margin-bottom:4px}
  .sec-title{font-family:var(--cond);text-transform:uppercase;letter-spacing:.04em;font-size:24px;font-weight:700}
  .sec-when{font-size:12px;color:var(--graphite);font-weight:600}
  .sec-when b{font-family:var(--cond);font-size:15px}
  .faixa-ref{font-size:10.5px;color:var(--graphite);background:var(--panel);border:1px solid var(--line);padding:7px 10px;margin:10px 0 12px;border-radius:3px}
  .faixa-ref .n{color:var(--muted)}
  .sec-count{font-size:11px;color:var(--muted);margin-bottom:8px}
  /* rank table */
  table.rank{width:100%;border-collapse:collapse}
  table.rank th{font-family:var(--cond);text-transform:uppercase;letter-spacing:.05em;font-size:9.5px;color:var(--muted);text-align:left;
    padding:0 8px 7px 0;font-weight:700;border-bottom:1.5px solid var(--ink)}
  table.rank td{padding:7px 8px 7px 0;border-bottom:1px solid var(--line);vertical-align:middle}
  table.rank tr:nth-child(even){background:#fbfbf9}
  .rk{font-family:var(--cond);font-size:15px;color:var(--muted);font-weight:700;width:22px}
  .cli .nm{font-weight:700;font-size:12px}
  .cli .ie{font-size:8px;background:#12100b;color:var(--gold);border-radius:2px;padding:1px 4px;margin-left:6px;vertical-align:middle;letter-spacing:.04em;font-weight:700}
  .cli .sub{font-size:10px;color:var(--muted)}
  .loc{font-size:11px;color:var(--graphite);white-space:nowrap}
  .fone{color:var(--ink);font-weight:600;font-size:11px;text-decoration:none;border-bottom:1px dotted #bbb}
  .sem{color:#bbb;font-size:10px;font-style:italic}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .band{font-size:10.5px;white-space:nowrap}.band .med{color:var(--muted)}
  .tot{font-family:var(--cond);font-size:13px;font-weight:700;white-space:nowrap}
  .tier{font-size:8.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 6px;border-radius:3px;white-space:nowrap}
  .t-vip{background:var(--gold);color:#1a1608}.t-premium{background:#2b2b2b;color:#fff}
  .t-recorrente{background:#e7e4dc;color:#3a3a3a}.t-ocasional{background:#f2f1ec;color:#8a8a8a}
  .ult{font-size:10.5px;color:var(--graphite);white-space:nowrap}
  .empty{color:#bbb;padding:14px 0;font-style:italic}
  .adj-h{font-family:var(--cond);text-transform:uppercase;letter-spacing:.05em;font-size:13px;font-weight:700;margin:16px 0 4px;color:var(--graphite)}
  .adj-note{font-size:10.5px;color:var(--muted);margin-bottom:8px}
  /* appendix */
  table.appx{width:100%;border-collapse:collapse;font-size:10px}
  table.appx th{font-family:var(--cond);text-transform:uppercase;letter-spacing:.04em;font-size:8.5px;color:var(--muted);text-align:left;padding:0 6px 6px 0;border-bottom:1.5px solid var(--ink);font-weight:700}
  table.appx td{padding:4px 6px 4px 0;border-bottom:1px solid #eee}
  table.appx td.nm{font-weight:600}
  table.appx tr:nth-child(even){background:#fbfbf9}
  .foot{position:absolute;bottom:9mm;left:15mm;right:15mm;display:flex;justify-content:space-between;font-size:9px;color:var(--muted);border-top:1px solid var(--line);padding-top:6px}
  @media print{.page{margin:0}}
</style></head><body>

<!-- PÁGINA 1 · CAPA / RESUMO -->
<section class="page" id="capa">
  <div class="cap-head">
    <div>
      <div class="brand">Bula Assessoria · Inteligência de Clientes</div>
      <h1>Clientes-Alvo<br>Mega EAO Baviera</h1>
      <div class="cap-sub">Priorização de compradores para o evento de <b>10 a 12 de julho de 2026</b> · base: histórico de arremates nos leilões Bula</div>
    </div>
    <div class="gen">13º Mega Evento<br>EAO Baviera<br>Programa Leilões<br><br>gerado ${genLabel}</div>
  </div>

  <div class="event">
    <div class="ev"><div class="d">Sex 10/07 · Aspirações</div><div class="t">Sêmen · embriões · doadoras</div></div>
    <div class="ev"><div class="d">Sáb 11/07 · Fêmeas</div><div class="t">350 fêmeas PO (matrizes)</div></div>
    <div class="ev foco"><div class="d">Dom 12/07 · Touros</div><div class="t">500 touros PO · foco do evento</div></div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="v">${clientes.length}</div><div class="l">Compradores analisados</div></div>
    <div class="kpi accent"><div class="v">${milOf(totalVgv)}</div><div class="l">VGV histórico atribuído</div></div>
    <div class="kpi"><div class="v">${nLeiloes}</div><div class="l">Leilões cobertos</div></div>
    <div class="kpi"><div class="v">${comContato}</div><div class="l">Com contato no CRM</div></div>
  </div>

  <div class="minis">
    ${miniCard('Touros', `${touros.length} compradores`, touros, 'touros')}
    ${miniCard('Matrizes', `${matrizes.length} compradores`, matrizes, 'matrizes')}
    ${miniCard('VIP do evento', 'maiores compradores', vips, null)}
  </div>

  <div class="cap-note">
    <b>Como ler:</b> cada cliente é um comprador identificado nos fechamentos da Bula. O <b>tipo de animal</b> é inferido pelo nome do leilão em que ele arrematou
    (ex.: “Touros Provados”, “Matrizes Santa Nice”). A <b>faixa/cab.</b> é o preço por cabeça que ele efetivamente pagou. <b>Perfil</b>: VIP ≥ R$ 500 mil · Premium ≥ R$ 200 mil ·
    Recorrente = 2+ leilões. Priorize quem já comprou a mesma categoria do leilão, tem <b>I.E.</b> e contato — são os mais prováveis de arrematar de novo.
    Compradores sem telefone no CRM entram como oportunidade de cadastro.
  </div>
  <div class="foot"><span>Bula Assessoria · Clientes-Alvo EAO Baviera</span><span>Confidencial · uso interno</span></div>
</section>

<!-- PÁGINA 2 · TOUROS -->
<section class="page">
  <div class="sec-head"><span class="sec-title">1 · Touros / reprodutores</span><span class="sec-when">Leilão de Touros — <b>Domingo 12/07</b></span></div>
  ${faixaLine('touros')}
  <div class="sec-count">${touros.length} clientes já arremataram touros/reprodutores nos leilões da Bula — ranqueados pelo quanto investiram na categoria.</div>
  ${rankTable(touros, 'touros', 26)}
  <div class="foot"><span>Bula Assessoria · Clientes-Alvo EAO Baviera</span><span>1 · Touros</span></div>
</section>

<!-- PÁGINA 3 · MATRIZES -->
<section class="page">
  <div class="sec-head"><span class="sec-title">2 · Matrizes / fêmeas</span><span class="sec-when">Leilão de Fêmeas — <b>Sábado 11/07</b></span></div>
  ${faixaLine('matrizes')}
  <div class="sec-count">${matrizes.length} clientes já arremataram matrizes/fêmeas nos leilões da Bula.</div>
  ${rankTable(matrizes, 'matrizes', 26)}
  <div class="foot"><span>Bula Assessoria · Clientes-Alvo EAO Baviera</span><span>2 · Matrizes</span></div>
</section>

<!-- PÁGINA 4 · ASPIRAÇÕES -->
<section class="page">
  <div class="sec-head"><span class="sec-title">3 · Aspirações / embriões</span><span class="sec-when">Leilão de Aspirações — <b>Sexta 10/07</b></span></div>
  ${faixaLine('embrioes')}
  <div class="sec-count">${embrioes.length} cliente(s) com compra direta de aspiração/embrião no histórico. Aspiração é nicho — abaixo, o perfil premium mais provável de entrar.</div>
  ${rankTable(embrioes, 'embrioes', 10)}
  <div class="adj-h">Perfil premium — candidatos naturais à aspiração</div>
  <div class="adj-note">Grandes compradores de matrizes/genética (ticket ≥ R$ 150 mil) que ainda não arremataram aspiração — público ideal para doadoras e prenhes de aspiração.</div>
  ${rankTable(adjEmbri, 'geral', 10).replace('Cab. geral', 'Cab. total')}
  <div class="foot"><span>Bula Assessoria · Clientes-Alvo EAO Baviera</span><span>3 · Aspirações</span></div>
</section>

<!-- PÁGINA 5 · VIP -->
<section class="page">
  <div class="sec-head"><span class="sec-title">4 · VIPs & recorrentes</span><span class="sec-when">Convidar para <b>todo o evento</b></span></div>
  <div class="sec-count">Os maiores compradores da base, independentemente da categoria — trate como convite prioritário e atendimento consultivo nos 3 dias.</div>
  ${rankTable(vips, 'geral', 12).replace('Cab. geral', 'Cab. total')}
  <div class="cap-note" style="margin-top:26px"><b>Observação de dados:</b> ${clientes.length} compradores vêm dos fechamentos registrados; ${comContato} têm telefone no CRM (${Math.round(comContato / clientes.length * 100)}%).
  Os demais são oportunidade de enriquecimento de cadastro. Leilões de nome “misto/geral” (Naviraí, Kriz, Flor do Aratau…) não permitem separar touro de matriz — esses arremates entram como “Geral”.</div>
  <div class="foot"><span>Bula Assessoria · Clientes-Alvo EAO Baviera</span><span>4 · VIPs</span></div>
</section>

<!-- PÁGINA 6 · APÊNDICE -->
<section class="page">
  <div class="sec-head"><span class="sec-title">Apêndice · base completa</span><span class="sec-when">${clientes.length} compradores</span></div>
  <div class="sec-count">Todos os compradores identificados, ordenados por VGV total.</div>
  <table class="appx"><thead><tr>
    <th>Cliente / fazenda</th><th>Local</th><th>Contato</th><th>Preferência</th><th>Cab.</th><th>Leilões</th><th>Faixa/cab.</th><th>VGV total</th><th>Últ. compra</th>
  </tr></thead><tbody>${appendixRows}</tbody></table>
  <div class="foot"><span>Bula Assessoria · Clientes-Alvo EAO Baviera</span><span>Apêndice</span></div>
</section>

</body></html>`

// ── saída ────────────────────────────────────────────────────────────────────
const desktop = join(homedir(), 'Desktop')
const htmlPath = join(desktop, 'Clientes-Alvo-EAO-Baviera.html')
const pdfPath = join(desktop, 'Clientes-Alvo-EAO-Baviera.pdf')
const pngPath = join(desktop, 'Clientes-Alvo-EAO-Baviera-resumo.png')
writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true })
const capa = await page.$('#capa')
await capa.screenshot({ path: pngPath })
await browser.close()

console.log('OK')
console.log('PDF :', pdfPath)
console.log('PNG :', pngPath)
console.log('HTML:', htmlPath)
