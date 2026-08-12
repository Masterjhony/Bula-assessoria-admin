// Relatório de desempenho da CAMPANHA GERAL (end-to-end): captação → evolução
// das conversas → fundo do funil (habilitação). Consulta ao vivo e renderiza
// PDF + HTML na Área de Trabalho, no padrão Brandbook (preto/branco + dourado).
//
// As contagens de conversa saem do CTE_ATENDIMENTO (lib/atendimento-oficial.mjs),
// espelho da fonte única do app. Antes este relatório contava `distinct phone`
// sobre a tabela inteira: entravam os 27 grupos de leiloeira e todo o histórico
// do Baileys, e "contatados" saía na casa dos milhares.
//   node scripts/gera-relatorio-campanha-geral.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { chromium } from 'playwright'
import { CTE_ATENDIMENTO } from './lib/atendimento-oficial.mjs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const n = v => Number(v || 0)
const fmt = v => n(v).toLocaleString('pt-BR')
const pct = (a, b) => b ? `${(100 * a / b).toFixed(a / b < 0.1 ? 1 : 0)}%` : '—'
const q = async (sql, p) => (await db.query(sql, p)).rows

const NA = `coalesce(arquivado,false)=false`
const totalLeads = n((await q(`select count(*) c from crm_leads where ${NA}`))[0].c)
const byStatus = Object.fromEntries((await q(`select status, count(*) c from crm_leads where ${NA} group by 1`)).map(r => [r.status, n(r.c)]))
const entrada = byStatus['ENTRADA'] || 0
const conexao = byStatus['CONEXÃO'] || 0
const qualif = byStatus['QUALIFICAÇÃO'] || 0
const info = byStatus['INFORMAÇÕES CAPTADAS'] || 0
const cadastro = byStatus['CADASTRO'] || 0
const perdidos = byStatus['PERDIDOS'] || 0
const moveram = conexao + qualif + info + cadastro // saíram da ENTRADA

const conv = (await q(`${CTE_ATENDIMENTO}
  select (select count(*) from primeiro) contatados,
         (select count(*) from resposta where respondeu) responderam,
         (select count(*) from disparo) disparos,
         (select count(distinct k) from entrada) escreveram`))[0]
const contatados = n(conv.contatados), responderam = n(conv.responderam)
const disparos = n(conv.disparos), escreveram = n(conv.escreveram)

const hab = (await q(`select
  count(*) filter (where extra_data->'credito' is not null) credito,
  count(*) filter (where coalesce(score_serasa,(extra_data->'credito'->>'score')::numeric) is not null) score,
  count(*) filter (where coalesce(score_serasa,(extra_data->'credito'->>'score')::numeric) > 400) score400,
  count(*) filter (where (extra_data->>'habilitacao_notificada_at') is not null) checklist
  from crm_leads where ${NA}`))[0]

const cadLeil = await q(`select l.nome, c.status, count(*) c, count(distinct c.crm_lead_id) leads from cliente_leiloeira_cadastro c join leiloeiras l on l.id=c.leiloeira_id group by 1,2`)
const leilAgg = {}
for (const r of cadLeil) { const a = leilAgg[r.nome] || { enviado: 0, aprovado: 0, recusado: 0 }; a[r.status] = n(r.c); leilAgg[r.nome] = a }
const distEnviados = n((await q(`select count(distinct cliente_key) c from cliente_leiloeira_cadastro where status in ('enviado','aprovado','recusado')`))[0].c)
const distAprovados = n((await q(`select count(distinct cliente_key) c from cliente_leiloeira_cadastro where status='aprovado'`))[0].c)

const serie = await q(`${CTE_ATENDIMENTO}
  select (created_at at time zone 'America/Sao_Paulo')::date dia,
  count(distinct k) filter (where direction='inbound') responderam,
  count(*) filter (where direction='inbound') msgs_in,
  count(*) filter (where direction='outbound') msgs_out
  from oficial group by 1 having (created_at at time zone 'America/Sao_Paulo')::date >= '2026-06-24' order by 1`)

const origens = await q(`select coalesce(nullif(trim(origem),''),'(sem origem)') origem, count(*) c, min(created_at)::date desde
  from crm_leads where ${NA} group by 1 order by 2 desc limit 8`)

// Duas campanhas nomeadas (landing/evento próprios)
async function campanha(label, like) {
    const ids = (await q(`select id, celular, telefone from crm_leads where ${NA} and origem ilike $1`, [like]))
    const total = ids.length
    const fones = ids.map(r => String(r.celular || r.telefone || '').replace(/\D/g, '')).filter(Boolean)
    let resp = 0
    if (fones.length) resp = n((await q(`select count(distinct phone) c from whatsapp_messages where direction='inbound' and regexp_replace(phone::text,'\\D','','g') = any($1)`, [fones]))[0].c)
    return { label, total, resp }
}
const campJmp = await campanha('JMP — Nelore (jun)', '%jmp%')
const campEao = await campanha('EAO — Baviera (jul)', '%eao%')

await db.end()

const genLabel = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const maxResp = Math.max(...serie.map(s => n(s.responderam)), 1)

// ── barras do funil ──
const funil = [
    { l: 'Captação (base total)', v: totalLeads, tone: 'ink' },
    { l: 'Saíram da entrada (Conexão+)', v: moveram, tone: 'graphite' },
    { l: 'Responderam em até 72h', v: responderam, tone: 'graphite' },
    { l: 'Qualificação', v: qualif + info + cadastro, tone: 'graphite' },
    { l: 'Consulta de crédito', v: n(hab.credito), tone: 'gold' },
    { l: 'Enviados às leiloeiras', v: distEnviados, tone: 'gold' },
    { l: 'Aprovados (habilitados)', v: distAprovados, tone: 'gold' },
]
const funMax = totalLeads
const funilRows = funil.map((f, i) => {
    const w = Math.max(1.5, 100 * f.v / funMax)
    const conv = i > 0 ? pct(f.v, funil[i - 1].v) : ''
    return `<div class="fun-row">
      <div class="fun-l">${esc(f.l)}</div>
      <div class="fun-bar"><div class="fun-fill t-bg-${f.tone}" style="width:${w}%"></div><span class="fun-v">${fmt(f.v)}</span></div>
      <div class="fun-c">${conv ? `<span class="conv">→ ${conv}</span>` : ''}</div>
    </div>`
}).join('')

const serieBars = serie.map(s => {
    const h = Math.round(100 * n(s.responderam) / maxResp)
    const d = new Date(s.dia)
    const dl = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
    return `<div class="sb"><div class="sb-bar" style="height:${Math.max(2, h)}%" title="${n(s.responderam)}"></div><div class="sb-v">${n(s.responderam) || ''}</div><div class="sb-x">${dl}</div></div>`
}).join('')

const leilRows = Object.entries(leilAgg).map(([nome, a]) => `
  <tr><td class="nm">${esc(nome)}</td>
    <td>${fmt((a.enviado || 0) + (a.aprovado || 0) + (a.recusado || 0))}</td>
    <td><b class="t-ink">${fmt(a.aprovado || 0)}</b></td>
    <td>${fmt(a.enviado || 0)}</td>
    <td>${a.recusado ? `<span class="prot">${fmt(a.recusado)}</span>` : '0'}</td></tr>`).join('')

const origRows = origens.map(o => `<tr><td class="nm">${esc(o.origem)}</td><td>${fmt(o.c)}</td><td class="mut">${new Date(o.desde).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td></tr>`).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  :root{--ink:#111;--graphite:#3a3a3a;--muted:#8a8a8a;--line:#e6e4df;--panel:#faf9f6;--gold:#C9A84C;
    --cond:'Arial Narrow','Oswald','Segoe UI',sans-serif;--sans:'Segoe UI',system-ui,sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);color:var(--ink);background:#eceae5;font-size:12px;line-height:1.42}
  .sheet{width:1000px;margin:0 auto;background:#fff;box-shadow:0 18px 60px rgba(0,0,0,.10)}
  .t-ink{color:var(--ink)}.t-gold{color:var(--gold)}
  .t-bg-ink{background:#12100b}.t-bg-graphite{background:var(--graphite)}.t-bg-gold{background:var(--gold)}
  header{padding:34px 40px 26px;border-bottom:2px solid var(--ink)}
  .brand{font-family:var(--cond);text-transform:uppercase;letter-spacing:.24em;font-size:11px;color:var(--graphite);font-weight:700}
  h1{font-family:var(--cond);text-transform:uppercase;font-size:34px;line-height:1.02;font-weight:700;margin-top:8px}
  .para{color:var(--graphite);font-size:13px;margin-top:14px;max-width:800px;line-height:1.6}.para b{color:var(--ink)}
  .to{margin-top:14px;font-size:12px;color:var(--muted)}
  main{padding:26px 40px 36px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:14px}
  .kpi{background:#fff;padding:14px}
  .kpi .v{font-family:var(--cond);font-size:29px;font-weight:700;line-height:.9}
  .kpi .l{text-transform:uppercase;letter-spacing:.05em;font-size:8.5px;color:var(--muted);margin-top:6px;font-weight:600}
  .kpi .s{font-size:10px;color:var(--graphite);margin-top:3px}
  .kpi.gold .v{color:var(--gold)}
  .sec-t{font-family:var(--cond);text-transform:uppercase;letter-spacing:.13em;font-size:13px;color:var(--graphite);font-weight:700;margin:26px 0 14px;display:flex;align-items:center;gap:12px}
  .sec-t::after{content:'';flex:1;height:1px;background:var(--line)}
  .fun-row{display:grid;grid-template-columns:210px 1fr 60px;align-items:center;gap:10px;margin-bottom:7px}
  .fun-l{font-size:11px;font-weight:600;text-align:right;color:var(--graphite)}
  .fun-bar{position:relative;background:#f2f0ea;border-radius:3px;height:26px;display:flex;align-items:center}
  .fun-fill{height:100%;border-radius:3px;min-width:3px}
  .fun-v{position:absolute;left:10px;font-family:var(--cond);font-size:15px;font-weight:700;color:#fff;mix-blend-mode:difference}
  .fun-c{font-size:10px}.conv{color:var(--muted);font-weight:600}
  .chart{border:1px solid var(--line);border-radius:5px;padding:16px 18px 8px;background:var(--panel)}
  .bars{display:flex;align-items:flex-end;gap:5px;height:150px}
  .sb{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end}
  .sb-bar{width:74%;background:linear-gradient(180deg,var(--gold),#a98a3a);border-radius:3px 3px 0 0}
  .sb-v{font-size:8.5px;color:var(--graphite);font-weight:700;margin-top:3px}
  .sb-x{font-size:7.5px;color:var(--muted);margin-top:2px;white-space:nowrap;transform:rotate(-90deg);transform-origin:center;height:24px;display:flex;align-items:center}
  .chart-cap{font-size:10.5px;color:var(--muted);margin-top:10px}
  .cols2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  table.rep{width:100%;border-collapse:collapse}
  table.rep th{font-family:var(--cond);text-transform:uppercase;letter-spacing:.04em;font-size:9.5px;color:var(--muted);text-align:left;padding:0 8px 8px 0;border-bottom:1.5px solid var(--ink);font-weight:700}
  table.rep td{padding:7px 8px 7px 0;border-bottom:1px solid var(--line);font-size:11.5px}
  table.rep .nm{font-weight:700}.rep b{font-family:var(--cond);font-size:15px}
  .mut{color:var(--muted)}.prot{color:#8a3030;font-weight:600}
  .camp{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .camp-c{border:1px solid var(--line);border-radius:5px;padding:16px 18px}
  .camp-c h3{font-family:var(--cond);text-transform:uppercase;font-size:15px;letter-spacing:.02em}
  .camp-c .cn{display:flex;gap:22px;margin-top:10px}
  .camp-c .cn .cv{font-family:var(--cond);font-size:26px;font-weight:700}
  .camp-c .cn .cl{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
  .note{font-size:10.5px;color:var(--muted);margin-top:18px;line-height:1.6}
  footer{padding:16px 40px 26px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:10px;color:var(--muted)}
  @media print{body{background:#fff}.sheet{box-shadow:none;width:auto}.chart,table,.camp-c{break-inside:avoid}}
</style></head><body>
<div class="sheet">
  <header>
    <div class="brand">Bula Assessoria · Desempenho de Campanha</div>
    <h1>Campanha geral<br>Da captação à habilitação</h1>
    <p class="para">Panorama de ponta a ponta: da <b>captação</b> (${fmt(totalLeads)} leads na base) à <b>evolução das conversas</b> no WhatsApp e ao <b>fundo do funil</b> — a habilitação para compra parcelada nas leiloeiras. As duas frentes de captação (<b>JMP/Nelore</b> em junho e <b>EAO/Baviera</b> em julho) alimentam o mesmo funil de qualificação da Bula.</p>
    <div class="to">Atualizado em ${genLabel} · uso interno</div>
  </header>
  <main>
    <div class="kpis">
      <div class="kpi"><div class="v">${fmt(totalLeads)}</div><div class="l">Leads na base</div></div>
      <div class="kpi"><div class="v">${fmt(contatados)}</div><div class="l">Abordados na API oficial</div><div class="s">${fmt(responderam)} responderam em 72h · ${pct(responderam, contatados)}</div></div>
      <div class="kpi"><div class="v">${fmt(qualif + info + cadastro)}</div><div class="l">Em qualificação+</div></div>
      <div class="kpi gold"><div class="v">${fmt(distAprovados)}</div><div class="l">Habilitados (aprovados)</div></div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="v">${fmt(n(hab.credito))}</div><div class="l">Consultas de crédito</div></div>
      <div class="kpi"><div class="v">${fmt(n(hab.score))}</div><div class="l">Com score</div><div class="s">${fmt(n(hab.score400))} acima de 400</div></div>
      <div class="kpi"><div class="v">${fmt(n(hab.checklist))}</div><div class="l">Checklist de habilitação OK</div></div>
      <div class="kpi"><div class="v">${fmt(distEnviados)}</div><div class="l">Enviados às leiloeiras</div></div>
    </div>

    <h2 class="sec-t">O funil, do topo ao fundo</h2>
    ${funilRows}
    <div class="note" style="margin-top:12px">Percentual = conversão da etapa anterior. A base é dominada por leads importados/frios (${fmt(entrada)} em ENTRADA); a evolução real acontece de <b>Responderam</b> em diante, onde o concierge qualifica e a habilitação avança. ${perdidos} marcados como PERDIDOS.</div>

    <h2 class="sec-t">Evolução das conversas (respostas/dia)</h2>
    <div class="chart">
      <div class="bars">${serieBars}</div>
      <div class="chart-cap">Nº de pessoas que responderam no WhatsApp por dia. Duas ondas visíveis: a <b>primeira leva de qualificação</b> (fim de jun, welcome da base) e a <b>onda EAO/habilitação</b> (08–12 jul), quando o concierge e a captação do evento aceleraram.</div>
    </div>

    <h2 class="sec-t">As duas campanhas de captação</h2>
    <div class="camp">
      <div class="camp-c"><h3>${esc(campJmp.label)}</h3><div class="cn"><div><div class="cv">${fmt(campJmp.total)}</div><div class="cl">Leads</div></div><div><div class="cv">${fmt(campJmp.resp)}</div><div class="cl">Responderam</div></div></div></div>
      <div class="camp-c"><h3>${esc(campEao.label)}</h3><div class="cn"><div><div class="cv">${fmt(campEao.total)}</div><div class="cl">Leads</div></div><div><div class="cv">${fmt(campEao.resp)}</div><div class="cl">Responderam</div></div></div></div>
    </div>
    <div class="cols2" style="margin-top:16px">
      <div>
        <h2 class="sec-t" style="margin-top:6px">Origens da base</h2>
        <table class="rep"><thead><tr><th>Origem</th><th>Leads</th><th>Desde</th></tr></thead><tbody>${origRows}</tbody></table>
      </div>
      <div>
        <h2 class="sec-t" style="margin-top:6px">Fundo do funil — habilitação</h2>
        <table class="rep"><thead><tr><th>Leiloeira</th><th>Fichas</th><th>Aprov.</th><th>Enviad.</th><th>Recus.</th></tr></thead><tbody>${leilRows}</tbody></table>
        <div class="note">${fmt(distEnviados)} leads distintos enviados; ${fmt(distAprovados)} habilitados a comprar parcelado. O envio da ficha vai à leiloeira pelo grupo (WhatsApp) e a decisão volta pelo mesmo canal.</div>
      </div>
    </div>
  </main>
  <footer><span>Bula Assessoria · Relatório de campanha (captação → habilitação)</span><span>Confidencial</span></footer>
</div>
</body></html>`

const desktop = join(homedir(), 'Desktop')
const htmlPath = join(desktop, 'Relatorio-Campanha-Geral.html')
const pdfPath = join(desktop, 'Relatorio-Campanha-Geral.pdf')
writeFileSync(htmlPath, html, 'utf-8')
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
await page.setViewportSize({ width: 1060, height: 1400 })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '9mm', bottom: '9mm', left: '8mm', right: '8mm' } })
await browser.close()
console.log('OK\nPDF :', pdfPath, '\nHTML:', htmlPath)
console.log(`\natendimento (API oficial): ${disparos} disparos · ${contatados} pessoas · ${responderam} responderam (${pct(responderam, contatados)}) · ${escreveram} escreveram`)
console.log(`funil: total ${totalLeads} · moveram ${moveram} · responderam ${responderam} · qualif ${qualif} · credito ${hab.credito} · checklist ${hab.checklist} · enviados ${distEnviados} · aprovados ${distAprovados}`)
