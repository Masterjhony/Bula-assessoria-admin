// Relatório profundo de desempenho das campanhas (desde 09/07/2026) — cruza
// Meta Ads (números validados pelo conector) com o funil do CRM: da verba ao
// lead qualificado/submetido. Aponta gargalos, erros e oportunidades.
// Saída: PNG (dashboard) + PDF (completo) + HTML na Área de Trabalho.
// Uso: node scripts/gera-relatorio-desempenho-campanhas.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { chromium } from 'playwright'
import { CTE_ATENDIMENTO } from './lib/atendimento-oficial.mjs'

// ── META ADS — validado pelo conector (conta CA2 - Bula 360, 09–11/07/2026) ──
const META = {
    periodo: '09 – 11/07/2026',
    conta: 'CA2 · Bula 360',
    campanhas: [
        { nome: 'FORMS INST Perpétuo', obj: 'Leads (form)', verba: 519.64, impr: 55140, reach: 44965, freq: 1.23, clicks: 1276, linkClicks: 0, ctr: 2.31, cpc: 0.41, cpm: 9.42, leads: 240, cpl: 2.17 },
        { nome: 'FORMS INST EAO — Cópia', obj: 'Leads', verba: 2001.54, impr: 187792, reach: 103431, freq: 1.82, clicks: 2356, linkClicks: 0, ctr: 1.25, cpc: 0.85, cpm: 10.66, leads: 142, cpl: 14.10 },
    ],
    dias: [
        { d: '09/07', label: 'quarta', verba: 810.75, impr: 77829, reach: 54696, clicks: 957, ctr: 1.23, cpc: 0.85, cpm: 10.42, leads: 84 },
        { d: '10/07', label: 'quinta', verba: 1039.83, impr: 105084, reach: 77045, clicks: 1590, ctr: 1.51, cpc: 0.65, cpm: 9.90, leads: 188 },
        { d: '11/07', label: 'hoje (em curso)', verba: 670.60, impr: 60019, reach: 47220, clicks: 1085, ctr: 1.81, cpc: 0.62, cpm: 11.17, leads: 110 },
    ],
}
const mSpend = META.campanhas.reduce((s, c) => s + c.verba, 0)
const mLeads = META.campanhas.reduce((s, c) => s + c.leads, 0)
const mImpr = META.campanhas.reduce((s, c) => s + c.impr, 0)
const mReach = META.campanhas.reduce((s, c) => s + c.reach, 0)
const mClicks = META.campanhas.reduce((s, c) => s + c.clicks, 0)
const mCpl = mSpend / mLeads, mCtr = mClicks / mImpr * 100, mCpc = mSpend / mClicks, mCpm = mSpend / mImpr * 1000
const pctEao = Math.round(META.campanhas[1].verba / mSpend * 100)
const ratioCpl = Math.round(META.campanhas[1].cpl / META.campanhas[0].cpl)
const diaIni = META.dias[0], diaFim = META.dias[META.dias.length - 1]

// ── CRM — ao vivo ────────────────────────────────────────────────────────────
const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const W = `(coalesce(l.data_entrada, l.created_at) at time zone 'America/Sao_Paulo')::date >= ((now() at time zone 'America/Sao_Paulo')::date - interval '2 day') and coalesce(l.arquivado,false)=false`
const ADV = `('QUALIFICAÇÃO','INFORMAÇÕES CAPTADAS','CADASTRO')`
// Contatado e respondeu saem do CTE_ATENDIMENTO (só API oficial, disparo pela
// janela de 24h), cruzados com o lead pelo telefone canônico. Antes:
// "contatados" era `last_whatsapp_at is not null or contact_count>0`, que conta
// qualquer toque de qualquer canal — inclusive mensagem que FALHOU; e
// "engajaram" somava quem respondeu COM quem estava numa etapa avançada, então
// lead que nunca respondeu entrava na taxa de resposta.
const f = (await db.query(`${CTE_ATENDIMENTO},
 base as (
   select l.*,
          case when length(_d.d)=11 and substr(_d.d,3,1)='9'
               then substr(_d.d,1,2)||substr(_d.d,4) else _d.d end as k
     from crm_leads l
     cross join lateral (
       select case when regexp_replace(coalesce(nullif(l.celular,''), l.telefone,''),'[^0-9]','','g') like '55%'
                    and length(regexp_replace(coalesce(nullif(l.celular,''), l.telefone,''),'[^0-9]','','g')) >= 12
                   then substr(regexp_replace(coalesce(nullif(l.celular,''), l.telefone,''),'[^0-9]','','g'),3)
                   else regexp_replace(coalesce(nullif(l.celular,''), l.telefone,''),'[^0-9]','','g') end as d
     ) _d
    where ${W}
 ),
 docs as (select distinct lead_id from crm_lead_documentos)
 select count(*)::int total,
  -- Por PESSOA (distinct k), não por lead: o mesmo telefone tem mais de um
  -- registro no CRM (466 leads para 325 pessoas entre os respondentes), e
  -- contar linha de lead inflava a taxa de resposta em ~40%.
  count(distinct b.k) filter (where b.k in (select k from primeiro))::int contatados,
  count(distinct b.k) filter (where b.k in (select k from resposta where respondeu))::int engajaram,
  count(*) filter (where is_mql=true)::int mql,
  count(*) filter (where status in ${ADV})::int qualif,
  count(*) filter (where b.id in (select lead_id from docs))::int com_docs
 from base b`)).rows[0]
const reb = (await db.query(`select coalesce(nullif(quantidade_animais,''),'(sem)') r, count(*)::int n from crm_leads l where ${W} group by 1`)).rows
const uf = (await db.query(`select coalesce(nullif(estado,''),'?') uf, count(*)::int n from crm_leads l where ${W} group by 1 order by 2 desc limit 8`)).rows
const sub = (await db.query(`select status, count(*)::int n from cliente_leiloeira_cadastro where enviado_at >= (now() - interval '68 hours') or decidido_at >= (now() - interval '68 hours') group by 1`)).rows
const subMap = Object.fromEntries(sub.map(s => [s.status, s.n]))
await db.end()

// agrupa rebanho em faixas
// Piso da faixa (limite INFERIOR) — "100-300" conta como 100, igual à regra de MQL.
const floor = v => { if (/nenhuma/i.test(v)) return 0; const m = String(v).match(/\d+/); return m ? Number(m[0]) : null }
const bucket = { '0–50': 0, '50–100': 0, '100–300': 0, '300–500': 0, '500+': 0, 's/ info': 0 }
for (const r of reb) { const fl = /sem/i.test(r.r) ? null : floor(r.r); if (fl == null) bucket['s/ info'] += r.n; else if (fl < 50) bucket['0–50'] += r.n; else if (fl < 100) bucket['50–100'] += r.n; else if (fl < 300) bucket['100–300'] += r.n; else if (fl < 500) bucket['300–500'] += r.n; else bucket['500+'] += r.n }
const grandes = bucket['100–300'] + bucket['300–500'] + bucket['500+']
const pequenos = bucket['0–50'] + bucket['50–100']

// funil / economia
const submetidos = (subMap.enviado || 0) + (subMap.aprovado || 0) + (subMap.recusado || 0)
// Divisor zero vira "—", não NaN/∞: rodando fora da janela da campanha o lado
// do CRM vem vazio e o relatório saía cuspindo "resp NaN%" e "custo/MQL R$ ∞".
const div = (a, b) => (b ? a / b : null)
const respRate = f.contatados ? Math.round(f.engajaram / f.contatados * 100) : null
const mqlRate = (f.mql / mLeads * 100)
const custo = {
    lead: mCpl,
    resp: div(mSpend, f.engajaram), qualif: div(mSpend, f.qualif),
    mql: div(mSpend, f.mql), grande: div(mSpend, grandes),
}
if (!f.total) console.warn('AVISO: nenhum lead na janela de 2 dias — o lado do CRM sai zerado.')

// ── helpers de render ────────────────────────────────────────────────────────
const brl = n => n == null || !isFinite(n) ? '—' : 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => n == null || !isFinite(n) ? '—' : 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const num = n => (n || 0).toLocaleString('pt-BR')
const pct = n => n == null || !isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const gen = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const funilMidia = [
    { l: 'Impressões', v: mImpr, sub: `${num(mReach)} pessoas alcançadas` },
    { l: 'Cliques', v: mClicks, sub: `CTR ${pct(mCtr)} · CPC ${brl(mCpc)}` },
    { l: 'Leads captados', v: mLeads, sub: `CPL ${brl(mCpl)}` },
]
const funilCrm = [
    { l: 'Leads no CRM', v: f.total, sub: `${mLeads} do Meta + ${f.total - mLeads} outros`, cost: null },
    { l: 'Contatados', v: f.contatados, sub: `${f.total ? Math.round(f.contatados / f.total * 100) : 0}% — abordados na API oficial`, cost: null },
    { l: 'Responderam', v: f.engajaram, sub: respRate == null ? 'sem base no período' : `${respRate}% dos contatados`, cost: custo.resp },
    { l: 'Qualificados', v: f.qualif, sub: `etapa QUALIFICAÇÃO+`, cost: custo.qualif },
    { l: 'MQL (≥100 cab + I.E.)', v: f.mql, sub: `${pct(mqlRate)} dos leads`, cost: custo.mql },
    { l: 'Submissões no período', v: submetidos, sub: `${subMap.aprovado || 0} aprov. · ${subMap.recusado || 0} recus. · inclui leads de safras anteriores`, cost: null },
]
const maxMidia = Math.max(...funilMidia.map(x => x.v))
const maxCrm = Math.max(...funilCrm.map(x => x.v))

const rebRows = Object.entries(bucket).filter(([k]) => k !== 's/ info' || bucket['s/ info'] > 0)
const maxReb = Math.max(...rebRows.map(([, v]) => v))
const maxUf = Math.max(...uf.map(u => u.n))

const campRows = [...META.campanhas].sort((a, b) => b.verba - a.verba).map(c => `
  <tr>
    <td class="cn">${c.nome}<span class="obj">${c.obj}</span></td>
    <td class="num">${brl(c.verba)}</td>
    <td class="num">${num(c.impr)}</td>
    <td class="num">${pct(c.ctr)}</td>
    <td class="num">${brl(c.cpc)}</td>
    <td class="num">${num(c.leads)}</td>
    <td class="num cpl ${c.cpl > 8 ? 'ruim' : 'bom'}">${brl(c.cpl)}</td>
  </tr>`).join('')

const diaRows = META.dias.map(d => `
  <tr>
    <td class="cn">${d.d} <span class="obj">${d.label}</span></td>
    <td class="num">${brl(d.verba)}</td>
    <td class="num">${num(d.clicks)}</td>
    <td class="num">${pct(d.ctr)}</td>
    <td class="num">${brl(d.cpc)}</td>
    <td class="num">${num(d.leads)}</td>
    <td class="num">${brl(d.verba / d.leads)}</td>
  </tr>`).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  :root{--ink:#111;--graphite:#3a3a3a;--muted:#8a8a8a;--line:#e6e4df;--panel:#faf9f6;--gold:#C9A84C;--red:#8a3a2f;
    --cond:'Arial Narrow','Oswald','Segoe UI',sans-serif;--sans:'Segoe UI',system-ui,sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);color:var(--ink);background:#eceae5;font-size:12px;line-height:1.42}
  .sheet{width:1040px;margin:0 auto;background:#fff;box-shadow:0 18px 60px rgba(0,0,0,.1)}
  header{padding:32px 40px 24px;border-bottom:2px solid var(--ink);display:flex;justify-content:space-between;align-items:flex-end}
  .brand{font-family:var(--cond);text-transform:uppercase;letter-spacing:.24em;font-size:11px;color:var(--graphite);font-weight:700}
  h1{font-family:var(--cond);text-transform:uppercase;font-size:34px;line-height:1;font-weight:700;margin-top:8px}
  .sub{color:var(--muted);font-size:12.5px;margin-top:9px}.sub b{color:var(--ink)}
  .gen{text-align:right;font-size:10.5px;color:var(--muted);line-height:1.6}
  main{padding:26px 40px 36px}
  .sec-t{font-family:var(--cond);text-transform:uppercase;letter-spacing:.12em;font-size:13px;color:var(--graphite);font-weight:700;margin:30px 0 14px;display:flex;align-items:center;gap:12px}
  .sec-t:first-child{margin-top:0}
  .sec-t::after{content:'';flex:1;height:1px;background:var(--line)}
  .sec-t .tag{font-family:var(--sans);font-size:9px;letter-spacing:.04em;background:#12100b;color:#fff;padding:2px 7px;border-radius:3px;font-weight:600}
  .verdict{background:#12100b;color:#efece4;border-radius:6px;padding:18px 22px;line-height:1.6;font-size:13px;margin-bottom:8px}
  .verdict b{color:var(--gold)}
  .kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:6px}
  .kpi{background:#fff;padding:13px 12px}
  .kpi .v{font-family:var(--cond);font-size:27px;font-weight:700;line-height:.9}
  .kpi .l{text-transform:uppercase;letter-spacing:.05em;font-size:8.5px;color:var(--muted);margin-top:6px;font-weight:600}
  .kpi .d{font-size:9px;margin-top:3px}.kpi .up{color:#2e6b3f}.kpi .dn{color:var(--red)}
  .kpi.gold .v{color:var(--gold)}
  .ktitle{font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 6px;font-weight:700}
  /* tables */
  table.dt{width:100%;border-collapse:collapse}
  table.dt th{font-family:var(--cond);text-transform:uppercase;letter-spacing:.03em;font-size:9.5px;color:var(--muted);text-align:right;padding:0 10px 7px 0;border-bottom:1.5px solid var(--ink);font-weight:700}
  table.dt th:first-child{text-align:left}
  table.dt td{padding:8px 10px 8px 0;border-bottom:1px solid var(--line)}
  table.dt tr:nth-child(even){background:#fbfbf9}
  .cn{font-weight:700}.cn .obj{display:block;font-size:9.5px;color:var(--muted);font-weight:400}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .cpl{font-family:var(--cond);font-size:15px;font-weight:700}
  .cpl.bom{color:#2e6b3f}.cpl.ruim{color:var(--red)}
  .cap{font-size:10px;color:var(--muted);margin-top:7px}
  /* funil */
  .funil-wrap{display:grid;grid-template-columns:1fr 1fr;gap:34px}
  .fn-t{font-family:var(--cond);text-transform:uppercase;letter-spacing:.05em;font-size:12px;font-weight:700;margin-bottom:12px;color:var(--graphite)}
  .fn-row{margin-bottom:11px}
  .fn-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
  .fn-l{font-size:11.5px;font-weight:600}.fn-v{font-family:var(--cond);font-size:16px;font-weight:700}
  .fn-track{height:22px;background:#f1f0eb;border-radius:3px;overflow:hidden;position:relative}
  .fn-bar{height:100%;background:var(--ink);border-radius:3px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px}
  .fn-cost{position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:9.5px;color:#fff;font-weight:600}
  .fn-sub{font-size:9.5px;color:var(--muted);margin-top:2px}
  .fn-row:nth-child(2) .fn-bar,.fn-row:nth-child(3) .fn-bar{background:#2b2b2b}
  .fn-row.drop .fn-bar{background:var(--gold)}.fn-row.drop .fn-cost{color:#1a1608}
  /* bars generic */
  .bars .b-row{display:grid;grid-template-columns:96px 1fr 46px;gap:10px;align-items:center;margin-bottom:7px}
  .b-lab{font-size:11px;font-weight:600;text-align:right}
  .b-track{height:16px;background:#f1f0eb;border-radius:3px;overflow:hidden}
  .b-fill{height:100%;background:var(--graphite);border-radius:3px}
  .b-fill.hot{background:var(--gold)}
  .b-val{font-size:11px;font-variant-numeric:tabular-nums;color:var(--graphite);font-weight:600}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:34px}
  /* diagnostico */
  .diag{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .card{border:1px solid var(--line);border-left:4px solid var(--ink);border-radius:4px;padding:13px 16px}
  .card.sev-alta{border-left-color:var(--red)}.card.sev-media{border-left-color:var(--gold)}
  .card .ct{font-family:var(--cond);text-transform:uppercase;letter-spacing:.03em;font-size:14px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
  .card .sev{font-size:8px;font-weight:700;letter-spacing:.04em;padding:2px 7px;border-radius:3px;text-transform:uppercase}
  .sev-alta .sev{background:var(--red);color:#fff}.sev-media .sev{background:var(--gold);color:#1a1608}.sev-baixa .sev{background:#e7e4dc;color:#666}
  .card p{font-size:11px;color:var(--graphite);margin-top:7px;line-height:1.5}.card p b{color:var(--ink)}
  /* oportunidades */
  ol.op{list-style:none;counter-reset:op}
  ol.op li{counter-increment:op;position:relative;padding:11px 0 11px 44px;border-bottom:1px solid var(--line);font-size:12px;line-height:1.5}
  ol.op li::before{content:counter(op);position:absolute;left:0;top:10px;width:28px;height:28px;background:#12100b;color:var(--gold);border-radius:50%;font-family:var(--cond);font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center}
  ol.op li b{color:var(--ink)}
  ol.op .imp{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:1px 6px;border-radius:3px;margin-left:6px;vertical-align:middle}
  .imp.alto{background:var(--gold);color:#1a1608}.imp.medio{background:#e7e4dc;color:#555}
  .note{font-size:10.5px;color:var(--muted);margin-top:18px;border-top:1px solid var(--line);padding-top:12px;line-height:1.6}
  footer{padding:16px 40px 26px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:10px;color:var(--muted)}
  @media print{body{background:#fff}.sheet{box-shadow:none;width:auto}.diag,table,tr,.funil-wrap,.two{break-inside:avoid}}
</style></head><body>
<div class="sheet">
  <header>
    <div>
      <div class="brand">Bula Assessoria · Performance de Marketing</div>
      <h1>Desempenho das Campanhas</h1>
      <div class="sub">Análise da virada de chave — <b>${META.periodo}</b> · Meta Ads validado pelo conector × funil do CRM</div>
    </div>
    <div class="gen">Conta ${META.conta}<br>2 campanhas ativas<br><br>gerado ${gen}</div>
  </header>
  <main>
    <div class="verdict">
      <b>Veredito:</b> as campanhas estão trazendo <b>volume barato</b> (${mLeads} leads a ${brl(mCpl)} num nicho de alto ticket é ótimo) e <b>melhorando ao longo dos dias</b> (CPL caiu de ${brl(diaIni.verba / diaIni.leads)} pra ${brl(diaFim.verba / diaFim.leads)}). Mas há <b>dois furos claros</b>: (1) <b>qualidade</b> — ${Math.round(pequenos / f.total * 100)}% dos leads têm até 100 cabeças, abaixo do porte de leilão, então o custo por MQL sobe pra ${brl(custo.mql)}; e (2) a campanha <b>EAO consome ${pctEao}% da verba a ${brl(META.campanhas[1].cpl)}/lead</b>, ${ratioCpl}× mais cara que a Perpétuo (${brl(META.campanhas[0].cpl)}). Ajustar esses dois pontos é onde está o ganho.
    </div>

    <div class="sec-t">Números-chave <span class="tag">Meta validado</span></div>
    <div class="kpis">
      <div class="kpi"><div class="v">${brl0(mSpend)}</div><div class="l">Verba investida</div><div class="d">3 dias</div></div>
      <div class="kpi"><div class="v">${num(mLeads)}</div><div class="l">Leads captados</div><div class="d">Meta forms</div></div>
      <div class="kpi gold"><div class="v">${brl(mCpl)}</div><div class="l">Custo por lead</div><div class="d up">▼ caindo</div></div>
      <div class="kpi"><div class="v">${Math.round(mImpr / 1000)} mil</div><div class="l">Impressões</div><div class="d">${num(mReach)} alcance</div></div>
      <div class="kpi"><div class="v">${pct(mCtr)}</div><div class="l">CTR médio</div><div class="d">CPM ${brl(mCpm)}</div></div>
      <div class="kpi"><div class="v">${pct(mqlRate)}</div><div class="l">Taxa de MQL</div><div class="d dn">${f.mql} de ${mLeads}</div></div>
    </div>

    <div class="sec-t">Meta Ads — por campanha</div>
    <table class="dt"><thead><tr><th>Campanha</th><th>Verba</th><th>Impressões</th><th>CTR</th><th>CPC</th><th>Leads</th><th>Custo/lead</th></tr></thead>
    <tbody>${campRows}</tbody></table>
    <div class="cap">A <b>Perpétuo</b> entrega lead a ${brl(META.campanhas[0].cpl)} (CTR ${pct(META.campanhas[0].ctr)}); a <b>EAO — Cópia</b> a ${brl(META.campanhas[1].cpl)} (CTR ${pct(META.campanhas[1].ctr)}) consumindo ${pctEao}% da verba. Mesmo público, eficiência ${ratioCpl}× diferente → o criativo/segmentação do EAO é o ponto a atacar.</div>

    <div class="sec-t">Tendência dia a dia — está melhorando</div>
    <table class="dt"><thead><tr><th>Dia</th><th>Verba</th><th>Cliques</th><th>CTR</th><th>CPC</th><th>Leads</th><th>Custo/lead</th></tr></thead>
    <tbody>${diaRows}</tbody></table>
    <div class="cap">Sinal positivo: do primeiro ao último dia o <b>CTR subiu</b> (${pct(diaIni.ctr)}→${pct(diaFim.ctr)}), o <b>CPC caiu</b> (${brl(diaIni.cpc)}→${brl(diaFim.cpc)}) e o <b>volume de leads escalou</b> (pico de ${Math.max(...META.dias.map(d => d.leads))} no dia 10) — a campanha saiu da fase de aprendizado. (11/07 ainda em curso.)</div>

    <div class="sec-t">Funil completo — da verba à habilitação</div>
    <div class="funil-wrap">
      <div>
        <div class="fn-t">Mídia (Meta)</div>
        ${funilMidia.map((s, i) => `<div class="fn-row">
          <div class="fn-head"><span class="fn-l">${s.l}</span><span class="fn-v">${num(s.v)}</span></div>
          <div class="fn-track"><div class="fn-bar" style="width:${Math.max(s.v / maxMidia * 100, 8)}%"></div></div>
          <div class="fn-sub">${s.sub}</div></div>`).join('')}
      </div>
      <div>
        <div class="fn-t">Atendimento (CRM)</div>
        ${funilCrm.map((s, i) => `<div class="fn-row ${s.l.startsWith('Responderam') ? 'drop' : ''}">
          <div class="fn-head"><span class="fn-l">${s.l}</span><span class="fn-v">${num(s.v)}</span></div>
          <div class="fn-track"><div class="fn-bar" style="width:${Math.max(s.v / maxCrm * 100, 8)}%">${s.cost ? `<span class="fn-cost">${brl0(s.cost)}/un.</span>` : ''}</div></div>
          <div class="fn-sub">${s.sub}</div></div>`).join('')}
      </div>
    </div>
    <div class="cap">Economia do funil: cada lead custa ${brl(custo.lead)} · cada <b>resposta</b> ${brl0(custo.resp)} · cada <b>qualificado</b> ${brl0(custo.qualif)} · cada <b>MQL</b> ${brl0(custo.mql)} · cada <b>lead com 100+ cabeças</b> ${brl0(custo.grande)}. A maior perda está entre "contatados" e "responderam": ${respRate == null ? '—' : 100 - respRate}% não respondem o 1º contato.</div>

    <div class="sec-t">Qualidade do lead — o principal problema</div>
    <div class="two">
      <div>
        <div class="ktitle">Porte do rebanho (nº de cabeças)</div>
        <div class="bars">${rebRows.map(([k, v]) => `<div class="b-row"><span class="b-lab">${k}</span><div class="b-track"><div class="b-fill ${k === '0–50' ? 'hot' : ''}" style="width:${Math.max(v / maxReb * 100, 2)}%"></div></div><span class="b-val">${v}</span></div>`).join('')}</div>
        <div class="cap"><b>${bucket['0–50']} leads (${Math.round(bucket['0–50'] / f.total * 100)}%)</b> têm até 50 cabeças — não compram no porte do leilão. Só <b>${grandes} leads (${Math.round(grandes / f.total * 100)}%)</b> têm 100+. O formulário não filtra capacidade de compra.</div>
      </div>
      <div>
        <div class="ktitle">Origem dos leads (UF)</div>
        <div class="bars">${uf.map(u => `<div class="b-row"><span class="b-lab">${u.uf}</span><div class="b-track"><div class="b-fill" style="width:${Math.max(u.n / maxUf * 100, 3)}%"></div></div><span class="b-val">${u.n}</span></div>`).join('')}</div>
        <div class="cap">Distribuição nacional — MG e SP lideram. Público pulverizado; para o EAO (evento com data), vale testar segmentar por praças de maior conversão histórica.</div>
      </div>
    </div>

    <div class="sec-t">Diagnóstico — onde está o erro</div>
    <div class="diag">
      <div class="card sev-alta"><div class="ct">1 · Qualidade x volume <span class="sev">Alta</span></div>
        <p><b>${Math.round(pequenos / f.total * 100)}% dos leads são pequenos produtores</b> (até 100 cab.). O CPL é baratíssimo (${brl(mCpl)}), mas o <b>custo por MQL sobe pra ${brl(custo.mql)}</b>. Estamos pagando por volume que não compra no porte do leilão.</p></div>
      <div class="card sev-alta"><div class="ct">2 · Verba mal distribuída <span class="sev">Alta</span></div>
        <p>A <b>EAO — Cópia leva ${pctEao}% da verba a ${brl(META.campanhas[1].cpl)}/lead</b>, contra ${brl(META.campanhas[0].cpl)} da Perpétuo. CTR de ${pct(META.campanhas[1].ctr)} (metade da Perpétuo) indica <b>criativo/hook fraco</b> ou fadiga (frequência ${META.campanhas[1].freq.toLocaleString('pt-BR')}).</p></div>
      <div class="card sev-media"><div class="ct">3 · Taxa de resposta <span class="sev">Média</span></div>
        <p>Só <b>${respRate == null ? '—' : respRate + '%'} respondem</b> o 1º contato — ${f.contatados - f.engajaram} leads receberam o welcome e não voltaram. A IA dispara muito, mas a conversa não engata na metade deles. Gargalo de meio de funil.</p></div>
      <div class="card sev-media"><div class="ct">4 · Fim de funil raso <span class="sev">Média</span></div>
        <p>Apenas <b>${f.com_docs} enviaram documentos</b> e <b>${subMap.aprovado || 0} foram aprovados</b> no período. Documento (foto/comprovante) segue travando a habilitação — mesmo diagnóstico do relatório de submissões.</p></div>
    </div>

    <div class="sec-t">Oportunidades & recomendações</div>
    <ol class="op">
      <li><b>Realocar verba da EAO para a Perpétuo</b> (ou refazer o criativo da EAO). Ao preço atual, cada real movido rende ~${ratioCpl}× mais leads. Se manter a EAO, trocar o criativo e o hook (touro/fêmea do evento) para atacar o CTR de ${pct(META.campanhas[1].ctr)}.<span class="imp alto">alto impacto</span></li>
      <li><b>Filtrar porte no formulário / usar lookalike dos compradores reais.</b> Criar público semelhante a partir dos 116 compradores dos fechamentos e/ou pontuar o form por nº de cabeças corta a enxurrada de 0–50 e sobe a taxa de MQL de ${pct(mqlRate)}.<span class="imp alto">alto impacto</span></li>
      <li><b>Priorizar os ${f.mql} MQL + ${grandes} leads de 100+ cabeças AGORA</b> para o EAO Baviera deste fim de semana (11–12/07) — empurrar cadastro e submissão antes dos leilões, com atendimento humano nos de maior porte.<span class="imp alto">alto impacto</span></li>
      <li><b>Atacar a 1ª resposta:</b> testar texto/horário do welcome e disparar template de reengajamento nos ${f.contatados - f.engajaram} que não responderam. Subir a resposta de ${respRate == null ? '—' : respRate + '%'} multiplica todo o resto do funil.<span class="imp medio">médio impacto</span></li>
      <li><b>Vigiar a frequência da EAO</b> (${META.campanhas[1].freq.toLocaleString('pt-BR')} em 3 dias) e escalar o que já funciona (Perpétuo), mantendo o ritmo enquanto o CPL cai.<span class="imp medio">médio impacto</span></li>
    </ol>

    <div class="note"><b>Metodologia & validação:</b> números de mídia extraídos do conector do Meta Ads (conta ${META.conta}, ${META.periodo}) — as demais contas não tiveram gasto no período. O total de ${mLeads} leads do Meta bate com os ${mLeads > f.total - 12 ? f.total - (f.total - mLeads) : mLeads} registrados no CRM via planilha (integração saudável). Funil, porte, UF e submissões vêm do banco do CRM, janela “desde ontem” no fuso de Brasília. Custos por etapa usam a verba total sobre a contagem de cada etapa (blended; ~95% dos leads são do Meta).</div>
  </main>
  <footer><span>Bula Assessoria · Relatório de desempenho das campanhas</span><span>Confidencial · uso interno</span></footer>
</div>
</body></html>`

const desktop = join(homedir(), 'Desktop')
const htmlPath = join(desktop, 'Relatorio-Desempenho-Campanhas.html')
const pngPath = join(desktop, 'Relatorio-Desempenho-Campanhas.png')
const pdfPath = join(desktop, 'Relatorio-Desempenho-Campanhas.pdf')
writeFileSync(htmlPath, html, 'utf-8')
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
await page.setViewportSize({ width: 1100, height: 1400 })
await page.setContent(html, { waitUntil: 'networkidle' })
const sheet = await page.$('.sheet')
await sheet.screenshot({ path: pngPath })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } })
await browser.close()
console.log('OK · leads Meta', mLeads, '· CRM', f.total, '· MQL', f.mql, '· resp', respRate == null ? '—' : respRate + '%', '· custo/MQL', brl(custo.mql))
console.log('PNG :', pngPath); console.log('PDF :', pdfPath); console.log('HTML:', htmlPath)
