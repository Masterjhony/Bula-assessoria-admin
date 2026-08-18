// Relatório de desempenho das CAMPANHAS DA EAO (13º Mega Baviera): investimento
// em mídia (Meta Ads / conector) + disparos por fora da lista + funil da coorte
// no CRM até a habilitação, com o "aprovado" CORRIGIDO (só decisão real da
// leiloeira conta). Saída: PDF + HTML na Área de Trabalho.
//   node scripts/gera-relatorio-eao.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { chromium } from 'playwright'

// ── Valores da MÍDIA (Meta Ads, via conector — conta CA2, 15/05–12/07/2026) ──
const META = {
    campanhas: [
        { nome: 'LEADS - FORMS INST EAO — Cópia', spend: 2887.76, impr: 258685, reach: 129735, clicks: 3506, ctr: 1.36, cpc: 0.82, leads: 216, cpl: 13.37 },
        { nome: 'LEADS - FORMS INST EAO', spend: 35.39, impr: 2689, reach: 2502, clicks: 15, ctr: 0.56, cpc: 2.36, leads: 0, cpl: 0 },
    ],
}
const mSpend = META.campanhas.reduce((s, c) => s + c.spend, 0)
const mImpr = META.campanhas.reduce((s, c) => s + c.impr, 0)
const mReach = META.campanhas.reduce((s, c) => s + c.reach, 0)
const mClicks = META.campanhas.reduce((s, c) => s + c.clicks, 0)
const mLeads = META.campanhas.reduce((s, c) => s + c.leads, 0)
const cplEfetivo = mLeads ? mSpend / mLeads : 0

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const q = async (s, p) => (await db.query(s, p)).rows
const n = v => Number(v || 0)
const fmt = v => n(v).toLocaleString('pt-BR')
const brl = v => 'R$ ' + n(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const pct = (a, b) => b ? `${(100 * a / b).toFixed(a / b < 0.1 ? 1 : 0)}%` : '—'

// disparos EAO por fora da lista
const disparos = await q(`select origin, count(distinct phone) fones, count(*) msgs, min(created_at)::date dia
  from whatsapp_messages where direction='outbound'
  and (origin ilike '%eao%' or origin ilike '%estancia%' or origin ilike '%baviera%')
  group by 1 order by 2 desc`)
const dpFones = (await q(`select distinct regexp_replace(phone::text,'\\D','','g') f from whatsapp_messages
  where direction='outbound' and (origin ilike '%eao%' or origin ilike '%estancia%' or origin ilike '%baviera%') and phone is not null`)).map(r => r.f).filter(Boolean)
const totalDisparos = disparos.reduce((s, d) => s + n(d.fones), 0)
const respDisparos = n((await q(`select count(distinct regexp_replace(phone::text,'\\D','','g')) c from whatsapp_messages where direction='inbound' and regexp_replace(phone::text,'\\D','','g') = any($1)`, [dpFones]))[0].c)

// coorte EAO (landing + disparos) — funil por status
const COORTE = `(origem ilike '%eao%' or origem ilike '%baviera%' or regexp_replace(coalesce(celular,telefone,'')::text,'\\D','','g') = any($1))`
const c = (await q(`select
  count(*) total,
  count(*) filter (where status<>'ENTRADA') moveram,
  count(*) filter (where status in ('QUALIFICAÇÃO','INFORMAÇÕES CAPTADAS','CADASTRO')) qualif,
  count(*) filter (where extra_data->'credito' is not null) credito,
  count(*) filter (where (extra_data->>'habilitacao_notificada_at') is not null) checklist,
  count(*) filter (where status='PERDIDOS') perdidos
  from crm_leads where coalesce(arquivado,false)=false and ${COORTE}`, [dpFones]))[0]
const landingEao = n((await q(`select count(*) c from crm_leads where coalesce(arquivado,false)=false and (origem ilike '%eao%' or origem ilike '%baviera%')`))[0].c)
const cadCoorte = (await q(`with co as (select id from crm_leads where coalesce(arquivado,false)=false and ${COORTE})
  select count(distinct crm_lead_id) enviados, count(distinct crm_lead_id) filter (where status='aprovado' and decidido_at is not null) aprov_real
  from cliente_leiloeira_cadastro where crm_lead_id in (select id from co)`, [dpFones]))[0]

// APROVADO corrigido — sistema todo (não só EAO): real vs backfill
const ap = (await q(`select
  count(*) filter (where status='aprovado') aprovado_sistema,
  count(*) filter (where status='aprovado' and decidido_at is not null) aprovado_real,
  count(*) filter (where status='recusado' and decidido_at is not null) recusado_real,
  count(distinct cliente_key) filter (where status in ('enviado','aprovado','recusado')) enviados_dist
  from cliente_leiloeira_cadastro`))[0]

// divulgação por GIF (fêmeas + touros) — do bucket já sabemos; conta grupos
await db.end()

const genLabel = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const dispRows = disparos.map(d => `<tr><td class="nm">${esc(d.origin.replace(/:.*/, ''))}</td><td>${fmt(d.fones)}</td><td class="mut">${fmt(d.msgs)} msgs</td></tr>`).join('')
const campRows = META.campanhas.map(c => `<tr>
  <td class="nm">${esc(c.nome)}</td><td>${brl(c.spend)}</td><td>${fmt(c.impr)}</td><td>${fmt(c.clicks)}</td>
  <td><b class="t-ink">${fmt(c.leads)}</b></td><td>${c.leads ? brl(c.cpl) : '—'}</td></tr>`).join('')

// funil da coorte
const funil = [
    { l: 'Leads gerados (mídia EAO)', v: mLeads, note: `CPL ${brl(cplEfetivo)}`, tone: 'ink' },
    { l: 'Coorte rastreada no CRM', v: n(c.total), note: `landing ${landingEao} + ${totalDisparos} disparos`, tone: 'graphite' },
    { l: 'Avançaram no funil', v: n(c.moveram), note: '', tone: 'graphite' },
    { l: 'Em qualificação', v: n(c.qualif), note: '', tone: 'graphite' },
    { l: 'Consulta de crédito', v: n(c.credito), note: '', tone: 'gold' },
    { l: 'Checklist de habilitação OK', v: n(c.checklist), note: '', tone: 'gold' },
    { l: 'Enviados à leiloeira', v: n(cadCoorte.enviados), note: '', tone: 'gold' },
    { l: 'Aprovados REAIS (OK da leiloeira)', v: n(cadCoorte.aprov_real), note: '', tone: 'gold' },
]
const funMax = Math.max(mLeads, n(c.total), 1)
const funilRows = funil.map((f, i) => {
    const w = Math.max(2, 100 * f.v / funMax)
    const conv = i > 0 && funil[i - 1].v ? pct(f.v, funil[i - 1].v) : ''
    return `<div class="fun-row"><div class="fun-l">${esc(f.l)}</div>
      <div class="fun-bar"><div class="fun-fill t-bg-${f.tone}" style="width:${w}%"></div><span class="fun-v">${fmt(f.v)}</span></div>
      <div class="fun-c">${f.note ? `<span class="mut">${esc(f.note)}</span>` : (conv ? `<span class="conv">→ ${conv}</span>` : '')}</div></div>`
}).join('')

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
  h1{font-family:var(--cond);text-transform:uppercase;font-size:33px;line-height:1.02;font-weight:700;margin-top:8px}
  .para{color:var(--graphite);font-size:13px;margin-top:14px;max-width:800px;line-height:1.6}.para b{color:var(--ink)}
  .to{margin-top:14px;font-size:12px;color:var(--muted)}
  main{padding:26px 40px 36px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:14px}
  .kpi{background:#fff;padding:14px}.kpi .v{font-family:var(--cond);font-size:28px;font-weight:700;line-height:.9}
  .kpi .l{text-transform:uppercase;letter-spacing:.05em;font-size:8.5px;color:var(--muted);margin-top:6px;font-weight:600}
  .kpi .s{font-size:10px;color:var(--graphite);margin-top:3px}.kpi.gold .v{color:var(--gold)}
  .sec-t{font-family:var(--cond);text-transform:uppercase;letter-spacing:.13em;font-size:13px;color:var(--graphite);font-weight:700;margin:26px 0 14px;display:flex;align-items:center;gap:12px}
  .sec-t::after{content:'';flex:1;height:1px;background:var(--line)}
  table.rep{width:100%;border-collapse:collapse}
  table.rep th{font-family:var(--cond);text-transform:uppercase;letter-spacing:.04em;font-size:9.5px;color:var(--muted);text-align:left;padding:0 8px 8px 0;border-bottom:1.5px solid var(--ink);font-weight:700}
  table.rep td{padding:7px 8px 7px 0;border-bottom:1px solid var(--line);font-size:11.5px}
  table.rep .nm{font-weight:700}.rep b{font-family:var(--cond);font-size:15px}.mut{color:var(--muted)}
  .fun-row{display:grid;grid-template-columns:230px 1fr 120px;align-items:center;gap:10px;margin-bottom:7px}
  .fun-l{font-size:11px;font-weight:600;text-align:right;color:var(--graphite)}
  .fun-bar{position:relative;background:#f2f0ea;border-radius:3px;height:26px;display:flex;align-items:center}
  .fun-fill{height:100%;border-radius:3px;min-width:3px}
  .fun-v{position:absolute;left:10px;font-family:var(--cond);font-size:15px;font-weight:700;color:#fff;mix-blend-mode:difference}
  .fun-c{font-size:10px}.conv{color:var(--muted);font-weight:600}
  .cols2{display:grid;grid-template-columns:1fr 1fr;gap:22px}
  .callout{border:1px solid var(--gold);background:#fffdf5;border-radius:6px;padding:16px 18px;margin-top:8px}
  .callout h3{font-family:var(--cond);text-transform:uppercase;font-size:14px;letter-spacing:.04em;color:#8a6d2f}
  .callout .big{display:flex;gap:28px;margin:10px 0 6px}
  .callout .big .v{font-family:var(--cond);font-size:30px;font-weight:700;line-height:1}
  .callout .big .v.gd{color:var(--gold)}.callout .big .v.no{color:#8a3030}
  .callout .big .l{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
  .callout p{font-size:11px;color:var(--graphite);line-height:1.55;margin-top:6px}
  .note{font-size:10.5px;color:var(--muted);margin-top:16px;line-height:1.6}
  footer{padding:16px 40px 26px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:10px;color:var(--muted)}
  @media print{body{background:#fff}.sheet{box-shadow:none;width:auto}table,.callout{break-inside:avoid}}
</style></head><body>
<div class="sheet">
  <header>
    <div class="brand">Bula Assessoria · Desempenho · Campanhas EAO</div>
    <h1>Campanhas EAO<br>13º Mega Baviera</h1>
    <p class="para">Validação completa das campanhas da <b>EAO / 13º Mega Baviera</b>: o <b>investimento em mídia</b> (Meta Ads, via conector), os <b>disparos que fizemos por fora</b> da lista de captação, e o <b>funil da coorte</b> no CRM até a habilitação. O "aprovado" foi <b>corrigido</b>: só conta quem recebeu o OK da leiloeira pelo canal de decisão — o resto é backfill de importação.</p>
    <div class="to">Atualizado em ${genLabel} · valores de mídia via conector Meta (conta CA2) · uso interno</div>
  </header>
  <main>
    <div class="kpis">
      <div class="kpi"><div class="v">${brl(mSpend)}</div><div class="l">Investido em mídia (EAO)</div></div>
      <div class="kpi"><div class="v">${fmt(mLeads)}</div><div class="l">Leads da mídia</div><div class="s">CPL ${brl(cplEfetivo)}</div></div>
      <div class="kpi"><div class="v">${fmt(totalDisparos)}</div><div class="l">Disparos por fora (WhatsApp)</div><div class="s">${fmt(respDisparos)} responderam</div></div>
      <div class="kpi gold"><div class="v">${fmt(n(cadCoorte.aprov_real))}</div><div class="l">Aprovados reais (coorte EAO)</div></div>
    </div>

    <h2 class="sec-t">1 · Investimento em mídia (Meta Ads)</h2>
    <table class="rep"><thead><tr><th>Campanha</th><th>Investido</th><th>Impressões</th><th>Cliques</th><th>Leads</th><th>Custo/lead</th></tr></thead>
    <tbody>${campRows}<tr style="font-weight:700;border-top:1.5px solid var(--ink)"><td>TOTAL EAO</td><td>${brl(mSpend)}</td><td>${fmt(mImpr)}</td><td>${fmt(mClicks)}</td><td><b class="t-gold">${fmt(mLeads)}</b></td><td>${brl(cplEfetivo)}</td></tr></tbody></table>
    <div class="note">Alcance ${fmt(mReach)} pessoas · CTR 1,36% · CPC R$ 0,82. A campanha "— Cópia" concentrou o orçamento (${brl(META.campanhas[0].spend)}) e gerou os ${fmt(mLeads)} leads; a original ficou sem verba.</div>

    <div class="cols2" style="margin-top:22px">
      <div>
        <h2 class="sec-t" style="margin-top:0">2 · Disparos por fora da lista</h2>
        <table class="rep"><thead><tr><th>Origem do disparo</th><th>Alcançados</th><th></th></tr></thead><tbody>${dispRows}
        <tr style="font-weight:700;border-top:1.5px solid var(--ink)"><td>TOTAL</td><td>${fmt(totalDisparos)}</td><td class="mut">${fmt(respDisparos)} responderam</td></tr></tbody></table>
        <div class="note">Abordagens ativas via WhatsApp (Baileys/oficial) a quem não veio pela landing: qualificados do EAO, base fria da Bahia (região da Fazenda Baviera) e quem interagiu no Instagram. Além disso, a <b>divulgação por GIF</b> dos melhores lotes (fêmeas e touros) foi enviada aos grupos.</div>
      </div>
      <div>
        <h2 class="sec-t" style="margin-top:0">3 · Funil da coorte EAO</h2>
        ${funilRows}
      </div>
    </div>

    <h2 class="sec-t">4 · Correção do "aprovado" (validação)</h2>
    <div class="callout">
      <h3>Aprovado ≠ habilitação completa no sistema</h3>
      <div class="big">
        <div><div class="v">${fmt(n(ap.aprovado_sistema))}</div><div class="l">"Aprovado" no sistema</div></div>
        <div><div class="v gd">${fmt(n(ap.aprovado_real))}</div><div class="l">Aprovado REAL (OK da leiloeira)</div></div>
        <div><div class="v no">${fmt(n(ap.recusado_real))}</div><div class="l">Recusados reais</div></div>
        <div><div class="v">${fmt(n(ap.enviados_dist))}</div><div class="l">Fichas enviadas</div></div>
      </div>
      <p>Dos ${fmt(n(ap.aprovado_sistema))} registros marcados como "aprovado", só <b>${fmt(n(ap.aprovado_real))}</b> vieram de uma decisão real da leiloeira (resposta no grupo, com <i>decidido_at</i>). O restante é <b>backfill de importação</b> (08/07) — cadastros marcados aprovado direto na planilha, sem o OK efetivo. <b>Habilitação completa de verdade = quem a leiloeira aprovou pelo canal.</b> Na coorte EAO especificamente, aprovados reais até agora: <b>${fmt(n(cadCoorte.aprov_real))}</b>.</p>
    </div>

    <div class="note">
      Metodologia: valores de mídia puxados do conector Meta (conta CA2, campanhas com "EAO" no nome, 15/05–12/07). Coorte EAO no CRM = leads da landing 13º Baviera + telefones dos disparos EAO/Baviera/Estância. Funil por <i>status</i> do CRM. "Aprovado real" = cliente_leiloeira_cadastro com status aprovado E decidido_at preenchido (decisão via grupo). ${fmt(n(c.perdidos))} da coorte marcados PERDIDOS.
    </div>
  </main>
  <footer><span>Bula Assessoria · Campanhas EAO — 13º Mega Baviera</span><span>Confidencial · mídia + funil</span></footer>
</div>
</body></html>`

const desktop = join(homedir(), 'Desktop')
const htmlPath = join(desktop, 'Relatorio-Campanhas-EAO.html')
const pdfPath = join(desktop, 'Relatorio-Campanhas-EAO.pdf')
writeFileSync(htmlPath, html, 'utf-8')
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
await page.setViewportSize({ width: 1060, height: 1400 })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '9mm', bottom: '9mm', left: '8mm', right: '8mm' } })
await browser.close()
console.log('OK\nPDF :', pdfPath)
console.log(`\nMÍDIA: ${brl(mSpend)} · ${mLeads} leads · CPL ${brl(cplEfetivo)}`)
console.log(`disparos: ${totalDisparos} (resp ${respDisparos}) · coorte ${c.total} (qualif ${c.qualif}, credito ${c.credito}, checklist ${c.checklist}, enviados ${cadCoorte.enviados}, aprov_real ${cadCoorte.aprov_real})`)
console.log(`APROVADO sistema ${ap.aprovado_sistema} · REAL ${ap.aprovado_real} · recusado_real ${ap.recusado_real}`)
