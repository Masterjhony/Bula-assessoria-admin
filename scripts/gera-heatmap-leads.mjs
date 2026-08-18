// Heatmap / panorama dos leads que chegaram desde ontem.
// Segmenta por estágio de atendimento (contatados, sem resposta, responderam,
// interesse de compra, documentos) + heatmap de entradas por hora.
// Gera HTML + PNG direto na Área de Trabalho.
// Uso: node scripts/gera-heatmap-leads.mjs
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

// Janela: entrou ontem ou hoje (fuso Brasília), não arquivado.
const W = `(coalesce(l.data_entrada, l.created_at) at time zone 'America/Sao_Paulo')::date >= ((now() at time zone 'America/Sao_Paulo')::date - interval '1 day') and coalesce(l.arquivado,false)=false`
const ADV = `('QUALIFICAÇÃO','INFORMAÇÕES CAPTADAS','CADASTRO')`

// --- Funil / KPIs -----------------------------------------------------------
const f = (await db.query(`
 with base as (select l.* from crm_leads l where ${W}),
 resp as (select distinct lead_id from whatsapp_messages where direction='inbound' and lead_id is not null),
 docs as (select distinct lead_id from crm_lead_documentos)
 select
  count(*)::int total,
  count(*) filter (where last_whatsapp_at is not null or contact_count>0)::int contatados,
  count(*) filter (where b.id in (select lead_id from resp) or status in ${ADV})::int engajaram,
  count(*) filter (where (last_whatsapp_at is not null or contact_count>0)
                     and not (b.id in (select lead_id from resp) or status in ${ADV}))::int sem_resposta,
  count(*) filter (where is_mql=true or b.id in (select lead_id from docs) or status in ('INFORMAÇÕES CAPTADAS','CADASTRO'))::int interesse,
  count(*) filter (where b.id in (select lead_id from docs))::int com_docs,
  count(*) filter (where is_mql=true)::int mql
 from base b`)).rows[0]

// --- Heatmap por hora × dia -------------------------------------------------
const heat = (await db.query(`
 select (coalesce(l.data_entrada,l.created_at) at time zone 'America/Sao_Paulo')::date::text d,
   extract(hour from (coalesce(l.data_entrada,l.created_at) at time zone 'America/Sao_Paulo'))::int h,
   count(*)::int n
 from crm_leads l where ${W} group by 1,2`)).rows

// --- Por origem -------------------------------------------------------------
const bySrc = (await db.query(`
 with base as (select l.* from crm_leads l where ${W}),
 resp as (select distinct lead_id from whatsapp_messages where direction='inbound' and lead_id is not null)
 select coalesce(nullif(source,''),coalesce(nullif(origem,''),'(sem origem)')) src,
   count(*)::int n,
   count(*) filter (where id in (select lead_id from resp) or status in ${ADV})::int eng
 from base group by 1 order by 2 desc`)).rows

// --- Leads mais quentes -----------------------------------------------------
const hot = (await db.query(`
 with base as (select l.* from crm_leads l where ${W}),
 resp as (select lead_id, count(*)::int c from whatsapp_messages where direction='inbound' and lead_id is not null group by 1),
 docs as (select lead_id, count(*)::int c from crm_lead_documentos group by 1)
 select b.nome, b.estado, b.cidade, b.status, b.quantidade_animais,
   coalesce(nullif(b.source,''),coalesce(nullif(b.origem,''),'—')) src,
   b.is_mql, coalesce(r.c,0)::int inbound, coalesce(d.c,0)::int docs,
   (case when d.c>0 then 3 else 0 end)
   + (case when b.is_mql then 2 else 0 end)
   + (case when b.status in ('INFORMAÇÕES CAPTADAS','CADASTRO') then 2
           when b.status='QUALIFICAÇÃO' then 1 else 0 end)
   + least(coalesce(r.c,0),3) as score
 from base b left join resp r on r.lead_id=b.id left join docs d on d.lead_id=b.id
 where coalesce(r.c,0)>0 or coalesce(d.c,0)>0 or b.is_mql or b.status in ${ADV}
 order by score desc, inbound desc nulls last
 limit 14`)).rows

await db.end()

// --- Datas / rótulos --------------------------------------------------------
const fmtBR = (dstr) => {
    const [y, m, d] = dstr.split('-')
    return `${d}/${m}`
}
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) // yyyy-mm-dd
const yest = new Date(Date.now() - 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const days = [yest, today]
const nowLabel = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// matriz heat[dia][hora]
const heatMap = {}
let heatMax = 0
for (const r of heat) { heatMap[`${r.d}|${r.h}`] = r.n; if (r.n > heatMax) heatMax = r.n }
const dayTotals = days.map(d => heat.filter(r => r.d === d).reduce((s, r) => s + r.n, 0))

// rampa sequencial monocromática (grafite) — 1 hue, claro→escuro (CVD-safe)
const ramp = (n) => {
    if (!n) return { bg: '#ffffff', border: '#ececec', fg: 'transparent' }
    const t = Math.pow(n / heatMax, 0.72) // realça faixas médias
    // interpola #e9e6df (claro, quente-neutro) → #111111 (grafite quase preto)
    const lerp = (a, b) => Math.round(a + (b - a) * t)
    const r = lerp(0xE9, 0x11), g = lerp(0xE6, 0x11), b = lerp(0xDF, 0x11)
    return { bg: `rgb(${r},${g},${b})`, border: 'transparent', fg: t > 0.5 ? '#fff' : '#3a3a3a' }
}

const pct = (a, b) => b ? Math.round((a / b) * 100) : 0
const tempClass = (s) => s >= 5 ? 'quente' : s >= 2 ? 'morno' : 'frio'
const tempLabel = (s) => s >= 5 ? 'Quente' : s >= 2 ? 'Morno' : 'Frio'

// horas com algum registro (compacta a grade)
const activeHours = [...new Set(heat.map(r => r.h))].sort((a, b) => a - b)
const hourSpan = activeHours.length ? { min: Math.min(...activeHours), max: Math.max(...activeHours) } : { min: 8, max: 20 }
const hours = []
for (let h = hourSpan.min; h <= hourSpan.max; h++) hours.push(h)

// --- Funil ------------------------------------------------------------------
const funnel = [
    { label: 'Entraram', n: f.total, sub: 'novos leads na base' },
    { label: 'Contatados', n: f.contatados, sub: '1º contato disparado' },
    { label: 'Responderam', n: f.engajaram, sub: 'engajaram / qualificaram' },
    { label: 'Interesse de compra', n: f.interesse, sub: 'MQL, doc ou avançados' },
    { label: 'Enviaram documentos', n: f.com_docs, sub: 'entraram no cadastro' },
]

// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const heatCells = days.map((d, di) => {
    const cells = hours.map(h => {
        const n = heatMap[`${d}|${h}`] || 0
        const c = ramp(n)
        return `<td class="hc" style="background:${c.bg};border-color:${c.border};color:${c.fg}">${n || ''}</td>`
    }).join('')
    return `<tr><th class="hday">${di === 0 ? 'Ontem' : 'Hoje'}<span>${fmtBR(d)}</span></th>${cells}<th class="htot">${dayTotals[di]}</th></tr>`
}).join('')

const hourHead = hours.map(h => `<th class="hh">${String(h).padStart(2, '0')}</th>`).join('')

const srcRows = bySrc.map(s => {
    const label = s.src === 'jmp-bula-perpetuo-sheet' ? 'Meta Ads / Planilha'
        : s.src === 'jmp-landing' ? 'Landing JMP'
            : s.src === 'whatsapp' ? 'WhatsApp' : s.src
    const w = pct(s.n, f.total)
    const rr = pct(s.eng, s.n)
    return `<tr>
    <td class="src-name">${esc(label)}</td>
    <td class="src-bar"><div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div><b>${s.n}</b></td>
    <td class="src-rr">${s.eng} <span>(${rr}%)</span></td>
  </tr>`
}).join('')

const hotRows = hot.map(h => {
    const t = tempClass(h.score)
    const loc = [h.cidade, h.estado].filter(Boolean).join('/') || '—'
    const sig = []
    if (h.inbound > 0) sig.push(`${h.inbound} resp.`)
    if (h.docs > 0) sig.push(`${h.docs} doc`)
    if (h.is_mql) sig.push('MQL')
    return `<tr>
    <td><span class="dot ${t}"></span></td>
    <td class="hn">${esc(h.nome || '(sem nome)')}</td>
    <td class="hl">${esc(loc)}</td>
    <td class="hq">${esc(h.quantidade_animais || '—')}</td>
    <td class="hst">${esc((h.status || '').replace('INFORMAÇÕES CAPTADAS', 'INFO CAPTADAS'))}</td>
    <td class="hsig">${sig.map(x => `<span>${esc(x)}</span>`).join('')}</td>
    <td class="htmp ${t}">${tempLabel(h.score)}</td>
  </tr>`
}).join('')

const funnelBars = funnel.map((s, i) => {
    const w = Math.max(pct(s.n, f.total), 7)
    const conv = i === 0 ? '' : `<span class="conv">${pct(s.n, funnel[i - 1].n)}% do passo anterior</span>`
    return `<div class="fn-row">
    <div class="fn-meta"><span class="fn-label">${s.label}</span><span class="fn-sub">${s.sub}</span></div>
    <div class="fn-barwrap"><div class="fn-bar" style="width:${w}%"><span>${s.n}</span></div>${conv}</div>
  </div>`
}).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  :root{
    --ink:#111; --graphite:#3a3a3a; --muted:#8a8a8a; --line:#e6e4df;
    --surface:#ffffff; --panel:#faf9f6; --gold:#C9A84C;
    --cond:'Arial Narrow','Oswald','Segoe UI',sans-serif;
    --sans:'Segoe UI',system-ui,-apple-system,sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);color:var(--ink);background:#eceae5;padding:40px}
  .sheet{width:1180px;margin:0 auto;background:var(--surface);border:1px solid var(--line);
    box-shadow:0 18px 60px rgba(0,0,0,.10)}
  /* header */
  header{padding:34px 44px 26px;border-bottom:2px solid var(--ink);display:flex;justify-content:space-between;align-items:flex-end}
  .brand{font-family:var(--cond);text-transform:uppercase;letter-spacing:.26em;font-size:13px;color:var(--graphite);font-weight:700}
  h1{font-family:var(--cond);text-transform:uppercase;letter-spacing:.02em;font-size:40px;line-height:1;font-weight:700;margin-top:8px}
  .period{color:var(--muted);font-size:13.5px;margin-top:11px;letter-spacing:.01em}
  .period b{color:var(--ink)}
  .gen{text-align:right;font-size:11.5px;color:var(--muted);line-height:1.7}
  .gen .big{font-family:var(--cond);font-size:52px;color:var(--ink);font-weight:700;letter-spacing:.01em;display:block;line-height:.9}
  .gen .big-l{text-transform:uppercase;letter-spacing:.22em;font-size:10px;color:var(--graphite)}
  main{padding:30px 44px 40px}
  .sec-t{font-family:var(--cond);text-transform:uppercase;letter-spacing:.16em;font-size:14px;color:var(--graphite);
    font-weight:700;margin:0 0 16px;display:flex;align-items:center;gap:12px}
  .sec-t::after{content:'';flex:1;height:1px;background:var(--line)}
  /* KPI tiles */
  .kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:34px}
  .kpi{background:var(--surface);padding:18px 16px 16px}
  .kpi .v{font-family:var(--cond);font-size:44px;font-weight:700;line-height:.9;letter-spacing:.01em}
  .kpi .l{text-transform:uppercase;letter-spacing:.08em;font-size:10.5px;color:var(--muted);margin-top:8px;font-weight:600}
  .kpi .p{font-size:11px;color:var(--graphite);margin-top:3px}
  .kpi.accent{background:#12100b}
  .kpi.accent .v{color:var(--gold)} .kpi.accent .l{color:#cfc9bb} .kpi.accent .p{color:#9c968a}
  .kpi.warn .v{color:var(--graphite)}
  /* funnel */
  .grid2{display:grid;grid-template-columns:1.15fr .85fr;gap:44px;margin-bottom:36px}
  .fn-row{margin-bottom:15px}
  .fn-meta{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px}
  .fn-label{font-family:var(--cond);text-transform:uppercase;letter-spacing:.05em;font-size:15px;font-weight:700}
  .fn-sub{font-size:11px;color:var(--muted)}
  .fn-barwrap{display:flex;align-items:center;gap:12px}
  .fn-bar{height:34px;background:var(--ink);border-radius:0 4px 4px 0;display:flex;align-items:center;justify-content:flex-end;
    padding-right:12px;min-width:52px;transition:none}
  .fn-bar span{color:#fff;font-family:var(--cond);font-size:20px;font-weight:700}
  .fn-row:nth-child(1) .fn-bar{background:#111}
  .fn-row:nth-child(2) .fn-bar{background:#2b2b2b}
  .fn-row:nth-child(3) .fn-bar{background:#4a4a4a}
  .fn-row:nth-child(4) .fn-bar{background:#6f6f6f}
  .fn-row:nth-child(5) .fn-bar{background:var(--gold)}
  .fn-row:nth-child(5) .fn-bar span{color:#1a1608}
  .conv{font-size:11px;color:var(--muted);white-space:nowrap}
  /* source */
  table{border-collapse:collapse;width:100%}
  .src-table td{padding:9px 0;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle}
  .src-name{font-weight:600;width:42%}
  .src-bar{width:40%} .src-bar b{font-family:var(--cond);font-size:15px;margin-left:10px}
  .bar-track{display:inline-block;width:120px;height:8px;background:#eee;border-radius:4px;overflow:hidden;vertical-align:middle}
  .bar-fill{height:100%;background:var(--graphite)}
  .src-rr{text-align:right;font-weight:600;font-size:13px}
  .src-rr span{color:var(--muted);font-weight:400;font-size:11.5px}
  /* heatmap */
  .heat-wrap{margin-bottom:36px}
  .heat{border-collapse:separate;border-spacing:3px}
  .heat th.hh{font-size:10.5px;color:var(--muted);font-weight:600;padding:0 0 4px;text-align:center;width:34px}
  .heat th.hday{text-align:left;font-family:var(--cond);text-transform:uppercase;letter-spacing:.06em;font-size:14px;font-weight:700;padding-right:14px;white-space:nowrap}
  .heat th.hday span{display:block;font-size:11px;color:var(--muted);font-weight:400;letter-spacing:0}
  .heat td.hc{width:34px;height:34px;text-align:center;border:1px solid;border-radius:5px;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums}
  .heat th.htot{font-family:var(--cond);font-size:17px;font-weight:700;padding-left:12px;color:var(--ink)}
  .heat .corner{font-size:10px;color:var(--muted);text-align:right;padding-right:8px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
  .heat-legend{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:11px;color:var(--muted)}
  .heat-legend .scale{display:flex;gap:3px}
  .heat-legend i{width:22px;height:12px;border-radius:2px;display:block;border:1px solid var(--line)}
  .heat-note{font-size:11.5px;color:var(--muted);margin-top:6px}
  /* hot table */
  .hot-table{margin-top:2px}
  .hot-table th{font-family:var(--cond);text-transform:uppercase;letter-spacing:.07em;font-size:10.5px;color:var(--muted);
    text-align:left;padding:0 10px 9px 0;font-weight:700;border-bottom:1.5px solid var(--ink)}
  .hot-table td{padding:9px 10px 9px 0;border-bottom:1px solid var(--line);font-size:12.5px;vertical-align:middle}
  .hot-table .hn{font-weight:600}
  .hot-table .hl,.hot-table .hq{color:var(--graphite);white-space:nowrap}
  .hot-table .hst{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--graphite)}
  .hsig span{display:inline-block;font-size:10px;background:#f0efea;border:1px solid var(--line);border-radius:3px;padding:1px 6px;margin-right:4px;color:var(--graphite)}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%}
  .dot.quente{background:var(--gold)} .dot.morno{background:var(--graphite)} .dot.frio{background:#cfcdc7}
  .htmp{font-family:var(--cond);text-transform:uppercase;letter-spacing:.06em;font-size:11.5px;font-weight:700;text-align:right}
  .htmp.quente{color:var(--gold)} .htmp.morno{color:var(--graphite)} .htmp.frio{color:var(--muted)}
  footer{padding:20px 44px 30px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:11px;color:var(--muted)}
  .legend-inline{display:flex;gap:18px}
  .legend-inline span{display:flex;align-items:center;gap:6px}
</style></head><body>
<div class="sheet">
  <header>
    <div>
      <div class="brand">Bula Assessoria · CRM</div>
      <h1>Panorama de Leads</h1>
      <div class="period">Entradas de <b>ontem (${fmtBR(yest)})</b> e <b>hoje (${fmtBR(today)})</b> · fuso Brasília</div>
    </div>
    <div class="gen">
      <span class="big-l">Total</span>
      <span class="big">${f.total}</span>
      novos leads<br>atualizado ${nowLabel}
    </div>
  </header>
  <main>
    <div class="kpis">
      <div class="kpi"><div class="v">${f.total}</div><div class="l">Entraram</div><div class="p">desde ontem</div></div>
      <div class="kpi"><div class="v">${f.contatados}</div><div class="l">Contatados</div><div class="p">${pct(f.contatados, f.total)}% da base</div></div>
      <div class="kpi warn"><div class="v">${f.sem_resposta}</div><div class="l">Sem resposta</div><div class="p">${pct(f.sem_resposta, f.contatados)}% dos contatados</div></div>
      <div class="kpi"><div class="v">${f.engajaram}</div><div class="l">Responderam</div><div class="p">${pct(f.engajaram, f.contatados)}% dos contatados</div></div>
      <div class="kpi accent"><div class="v">${f.interesse}</div><div class="l">Interesse compra</div><div class="p">${f.mql} são MQL</div></div>
      <div class="kpi"><div class="v">${f.com_docs}</div><div class="l">Enviaram docs</div><div class="p">no cadastro</div></div>
    </div>

    <div class="grid2">
      <div>
        <h2 class="sec-t">Funil de atendimento</h2>
        ${funnelBars}
      </div>
      <div>
        <h2 class="sec-t">Por origem</h2>
        <table class="src-table"><tbody>${srcRows}</tbody></table>
        <div class="heat-note" style="margin-top:14px">Coluna direita: quantos <b>responderam / qualificaram</b> e a taxa sobre o total da origem.</div>
      </div>
    </div>

    <div class="heat-wrap">
      <h2 class="sec-t">Heatmap · entradas por hora</h2>
      <table class="heat">
        <thead><tr><th class="corner">Hora →</th>${hourHead}<th class="corner">Total</th></tr></thead>
        <tbody>${heatCells}</tbody>
      </table>
      <div class="heat-legend">
        <span>Menos</span>
        <span class="scale">
          <i style="background:${ramp(1).bg}"></i>
          <i style="background:${ramp(Math.round(heatMax*.35)).bg}"></i>
          <i style="background:${ramp(Math.round(heatMax*.6)).bg}"></i>
          <i style="background:${ramp(Math.round(heatMax*.8)).bg}"></i>
          <i style="background:${ramp(heatMax).bg}"></i>
        </span>
        <span>Mais leads (pico: ${heatMax}/h)</span>
      </div>
    </div>

    <div>
      <h2 class="sec-t">Leads mais quentes</h2>
      <table class="hot-table">
        <thead><tr><th></th><th>Nome</th><th>Local</th><th>Cabeças</th><th>Etapa</th><th>Sinais</th><th style="text-align:right">Temperatura</th></tr></thead>
        <tbody>${hotRows || '<tr><td colspan="7" style="color:#999;padding:16px 0">Nenhum lead engajado ainda no período.</td></tr>'}</tbody>
      </table>
    </div>
  </main>
  <footer>
    <div class="legend-inline">
      <span><span class="dot quente"></span>Quente — respondeu + doc/MQL</span>
      <span><span class="dot morno"></span>Morno — respondeu/qualificou</span>
      <span><span class="dot frio"></span>Frio — contatado, sem resposta</span>
    </div>
    <div>Fonte: CRM Bula · crm_leads + WhatsApp + documentos</div>
  </footer>
</div>
</body></html>`

const desktop = join(homedir(), 'Desktop')
const stamp = today.replace(/-/g, '')
const htmlPath = join(desktop, `Panorama-Leads-${stamp}.html`)
const pngPath = join(desktop, `Panorama-Leads-${stamp}.png`)
writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
await page.setViewportSize({ width: 1260, height: 1400 })
await page.setContent(html, { waitUntil: 'networkidle' })
const sheet = await page.$('.sheet')
await sheet.screenshot({ path: pngPath })
await browser.close()

console.log('OK')
console.log('Funil:', f)
console.log('HTML :', htmlPath)
console.log('PNG  :', pngPath)
