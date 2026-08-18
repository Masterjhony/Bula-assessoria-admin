// Relatório das submissões de cadastro às leiloeiras + heatmap do checklist de
// documentos exigidos (lista oficial da leiloeira). Mostra, por lead submetido,
// o que já tem e o que falta — para o chefe tratar as pendências com a leiloeira.
// Saída: PNG (heatmap) + PDF (completo) + HTML na Área de Trabalho.
// Uso: node scripts/gera-relatorio-submissoes-leiloeiras.mjs
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

// ── sanitizadores (fiéis a crm-habilitacao.ts) ───────────────────────────────
const str = v => { const s = String(v ?? '').trim(); return /^(null|undefined|nulo|n\/a|na|-|--|n[aã]o[ _]?tem|n[aã]o[ _]?possui|nenhuma?|sem)$/i.test(s) ? '' : s }
const digits = v => String(v ?? '').replace(/\D/g, '')
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fmtData = d => { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }) }

// ── dados ────────────────────────────────────────────────────────────────────
const { rows: subs } = await db.query(`
  select c.cliente_key, c.leiloeira_id, c.status, c.canal, c.codigo, c.crm_lead_id,
         c.enviado_at, c.decidido_at, c.decidido_por, l.nome leiloeira
  from cliente_leiloeira_cadastro c left join leiloeiras l on l.id = c.leiloeira_id
  order by c.enviado_at desc nulls last`)

const leadIds = [...new Set(subs.map(s => s.crm_lead_id).filter(Boolean))]
const { rows: leads } = leadIds.length ? await db.query(`
  select id, nome, telefone, celular, email, cpf, estado, cidade, inscricao_estadual, tem_inscricao_estadual, extra_data
  from crm_leads where id = any($1)`, [leadIds]) : { rows: [] }
const leadById = new Map(leads.map(l => [l.id, l]))

const { rows: docs } = leadIds.length ? await db.query(`select lead_id, tipo from crm_lead_documentos where lead_id = any($1)`, [leadIds]) : { rows: [] }
const docsByLead = new Map()
for (const d of docs) { const a = docsByLead.get(d.lead_id) || []; a.push(d.tipo); docsByLead.set(d.lead_id, a) }

const { rows: clientes } = await db.query(`select match_key, nome, telefone, cpf, inscricao_estadual, tem_inscricao_estadual, cidade, uf from clientes`)
const cliByKey = new Map(clientes.map(c => [c.match_key, c]))
let cdocs = []; try { const r = await db.query(`select cliente_key, tipo from cliente_documentos`); cdocs = r.rows } catch { }
const cdocByKey = new Map(); for (const d of cdocs) { const a = cdocByKey.get(d.cliente_key) || []; a.push(d.tipo); cdocByKey.set(d.cliente_key, a) }

await db.end()

// ── dedup por cliente ────────────────────────────────────────────────────────
const byClient = new Map()
for (const s of subs) {
    let e = byClient.get(s.cliente_key)
    if (!e) { e = { key: s.cliente_key, leadId: s.crm_lead_id, leiloeiras: [], statuses: [], enviado_at: s.enviado_at }; byClient.set(s.cliente_key, e) }
    if (!e.leadId && s.crm_lead_id) e.leadId = s.crm_lead_id
    if (s.enviado_at && (!e.enviado_at || s.enviado_at > e.enviado_at)) e.enviado_at = s.enviado_at
    e.leiloeiras.push({ nome: s.leiloeira || '—', status: s.status, canal: s.canal, codigo: s.codigo })
    e.statuses.push(s.status)
}

// ── checklist (7 itens oficiais da leiloeira) ────────────────────────────────
const ITEMS = [
    { key: 'nome', label: 'Nome', full: 'Nome completo' },
    { key: 'cpf', label: 'CPF', full: 'CPF' },
    { key: 'ie', label: 'I.E.', full: 'Inscrição estadual' },
    { key: 'endereco', label: 'Endereço', full: 'Endereço de correspondência' },
    { key: 'telefone', label: 'Telefone', full: 'Telefone' },
    { key: 'doc_foto', label: 'Doc. c/ foto', full: 'Documento pessoal com foto', opt: true },
    { key: 'comp_res', label: 'Comp. resid.', full: 'Comprovante de residência', opt: true },
]

function computa(e) {
    const lead = e.leadId ? leadById.get(e.leadId) : null
    const cli = cliByKey.get(e.key)
    const xd = (lead?.extra_data) || {}
    const tipos = new Set([...(docsByLead.get(e.leadId) || []), ...(cdocByKey.get(e.key) || [])])
    const semantic = new Set(Array.isArray(xd.docs_recebidos) ? xd.docs_recebidos.map(String) : [])
    const temArquivo = (docsByLead.get(e.leadId) || []).length + (cdocByKey.get(e.key) || []).length >= 1
    const nome = str(lead?.nome) || str(cli?.nome) || e.key
    const cpf = digits(lead?.cpf || cli?.cpf)
    const fone = str(lead?.celular) || str(lead?.telefone) || str(cli?.telefone)
    const endereco = str(xd.endereco_titular)
    const ie = str(lead?.inscricao_estadual) || str(cli?.inscricao_estadual)
    const temIe = (str(lead?.tem_inscricao_estadual) || str(cli?.tem_inscricao_estadual)).toLowerCase() === 'sim'
    const ieDispensada = Boolean(str(xd.ie_dispensada_leilao))
    const uf = (str(lead?.estado) || str(cli?.uf) || '').toUpperCase()
    const done = {
        nome: /\S+\s+\S+/.test(nome),
        cpf: cpf.length === 11,
        ie: ie.replace(/\D/g, '').length >= 3 || temIe || ieDispensada,
        endereco: endereco.length >= 8,
        telefone: fone.length >= 8,
        doc_foto: temArquivo && (semantic.has('identidade') || tipos.has('cpf')),
        comp_res: temArquivo && (semantic.has('comprovante_endereco') || tipos.has('endereco') || tipos.has('comprovante')),
    }
    // I.E. isenta (EAO) é um 3º estado — nem cobrança nem verde pleno
    const ieIsenta = !(ie.replace(/\D/g, '').length >= 3 || temIe) && ieDispensada
    const situacao = e.statuses.includes('aprovado') ? 'aprovado'
        : e.statuses.includes('enviado') ? 'enviado' : 'recusado'
    return { nome, uf, done, ieIsenta, situacao, lead: !!lead }
}

const rows = [...byClient.values()].map(e => ({ ...e, ...computa(e) }))
    .sort((a, b) => {
        const ord = { enviado: 0, recusado: 1, aprovado: 2 }
        const dA = ITEMS.filter(i => a.done[i.key]).length, dB = ITEMS.filter(i => b.done[i.key]).length
        return (ord[a.situacao] - ord[b.situacao]) || (dA - dB) || String(a.enviado_at) < String(b.enviado_at) ? 1 : -1
    })

// ── métricas ─────────────────────────────────────────────────────────────────
const N = rows.length
const bySit = { enviado: rows.filter(r => r.situacao === 'enviado'), aprovado: rows.filter(r => r.situacao === 'aprovado'), recusado: rows.filter(r => r.situacao === 'recusado') }
const pend = bySit.enviado
const fillAll = Object.fromEntries(ITEMS.map(i => [i.key, rows.filter(r => r.done[i.key]).length]))
const fillPend = Object.fromEntries(ITEMS.map(i => [i.key, pend.filter(r => r.done[i.key]).length]))
const mediaCompleta = Math.round(rows.reduce((s, r) => s + ITEMS.filter(i => r.done[i.key]).length, 0) / N / ITEMS.length * 100)

console.log(`submetidos=${N} pendentes=${pend.length} aprovados=${bySit.aprovado.length} recusados=${bySit.recusado.length} completude=${mediaCompleta}%`)

// ── render ───────────────────────────────────────────────────────────────────
const genLabel = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const pctBar = (n, tot) => {
    const p = tot ? Math.round(n / tot * 100) : 0
    return `<div class="fr">
      <div class="fr-l">${''}</div>
      <div class="fr-track"><div class="fr-fill" style="width:${p}%"></div></div>
      <div class="fr-v">${n}<span>/${tot}</span> · ${p}%</div>
    </div>`
}

const cell = (r, item) => {
    if (item.key === 'ie' && r.ieIsenta) return `<td class="c isenta" title="I.E. dispensada (EAO)">isenta</td>`
    const ok = r.done[item.key]
    return `<td class="c ${ok ? 'ok' : 'no'}">${ok ? '<span class="ck">✓</span>' : '<span class="x">–</span>'}</td>`
}
const sitChip = s => `<span class="sit s-${s}">${s === 'enviado' ? 'Pendente' : s === 'aprovado' ? 'Aprovado' : 'Recusado'}</span>`
const leiloChips = r => [...new Set(r.leiloeiras.map(l => l.nome))].map(n => `<span class="lc">${esc(n)}</span>`).join('')
const codigos = r => [...new Set(r.leiloeiras.map(l => l.codigo).filter(Boolean))].join(', ')

function heatSection(title, list, hint) {
    if (!list.length) return ''
    const body = list.map(r => {
        const d = ITEMS.filter(i => r.done[i.key]).length
        return `<tr>
      <td class="nm"><span class="nome">${esc(r.nome)}</span>${r.uf ? `<span class="uf">${r.uf}</span>` : ''}<div class="meta">${leiloChips(r)}${codigos(r) ? `<span class="cod">${esc(codigos(r))}</span>` : ''}</div></td>
      ${ITEMS.map(i => cell(r, i)).join('')}
      <td class="score"><b>${d}</b><span>/7</span></td>
    </tr>`
    }).join('')
    return `<div class="hsec">
    <div class="hsec-h"><span class="hsec-t">${title}</span><span class="hsec-n">${list.length} ${list.length === 1 ? 'lead' : 'leads'}${hint ? ` · ${hint}` : ''}</span></div>
    <table class="heat"><thead><tr><th class="nm">Lead / fazenda</th>${ITEMS.map(i => `<th class="c${i.opt ? ' opt' : ''}">${i.label}${i.opt ? '<i>se possível</i>' : ''}</th>`).join('')}<th class="score">Compl.</th></tr></thead>
    <tbody>${body}</tbody></table>
  </div>`
}

// pendentes: o que falta (ação)
const acao = pend.map(r => {
    const faltam = ITEMS.filter(i => !(i.key === 'ie' && r.ieIsenta) && !r.done[i.key])
    return `<tr>
    <td class="nm">${esc(r.nome)}${r.uf ? ` <span class="uf">${r.uf}</span>` : ''}</td>
    <td>${leiloChips(r)}</td>
    <td class="cod">${esc(codigos(r)) || '—'}</td>
    <td class="falt">${faltam.length ? faltam.map(i => `<span class="ft${i.opt ? ' opt' : ''}">${i.full}</span>`).join('') : '<span class="okall">Completo ✓</span>'}</td>
  </tr>`
}).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  :root{--ink:#111;--graphite:#3a3a3a;--muted:#8a8a8a;--line:#e6e4df;--panel:#faf9f6;--gold:#C9A84C;
    --cond:'Arial Narrow','Oswald','Segoe UI',sans-serif;--sans:'Segoe UI',system-ui,sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);color:var(--ink);background:#eceae5;font-size:12px;line-height:1.4}
  .sheet{width:1000px;margin:0 auto;background:#fff;box-shadow:0 18px 60px rgba(0,0,0,.10)}
  header{padding:30px 38px 22px;border-bottom:2px solid var(--ink);display:flex;justify-content:space-between;align-items:flex-end}
  .brand{font-family:var(--cond);text-transform:uppercase;letter-spacing:.24em;font-size:11px;color:var(--graphite);font-weight:700}
  h1{font-family:var(--cond);text-transform:uppercase;font-size:33px;line-height:1;font-weight:700;margin-top:7px}
  .sub{color:var(--muted);font-size:12.5px;margin-top:9px;max-width:620px}.sub b{color:var(--ink)}
  .gen{text-align:right;font-size:10.5px;color:var(--muted);line-height:1.6}
  main{padding:24px 38px 34px}
  .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:26px}
  .kpi{background:#fff;padding:14px 14px}
  .kpi .v{font-family:var(--cond);font-size:32px;font-weight:700;line-height:.9}
  .kpi .l{text-transform:uppercase;letter-spacing:.06em;font-size:9.5px;color:var(--muted);margin-top:6px;font-weight:600}
  .kpi.gold .v{color:var(--gold)}
  .sec-t{font-family:var(--cond);text-transform:uppercase;letter-spacing:.13em;font-size:13px;color:var(--graphite);font-weight:700;margin:0 0 14px;display:flex;align-items:center;gap:12px}
  .sec-t::after{content:'';flex:1;height:1px;background:var(--line)}
  /* fill-rate */
  .furos{margin-bottom:12px}
  .fr-row{display:grid;grid-template-columns:150px 1fr;gap:14px;align-items:center;margin-bottom:9px}
  .fr-name{font-size:12px;font-weight:600}.fr-name i{font-style:normal;color:var(--muted);font-weight:400;font-size:10px}
  .fr{display:grid;grid-template-columns:1fr 118px;gap:12px;align-items:center}
  .fr-track{height:12px;background:#efeee9;border-radius:6px;overflow:hidden}
  .fr-fill{height:100%;background:var(--ink);border-radius:6px}
  .fr-v{font-size:11px;color:var(--graphite);font-variant-numeric:tabular-nums;white-space:nowrap}.fr-v span{color:var(--muted)}
  .low .fr-fill{background:var(--gold)}
  .callout{background:#12100b;color:#efece4;border-radius:5px;padding:14px 18px;margin:16px 0 26px;font-size:12.5px;line-height:1.55}
  .callout b{color:var(--gold)}
  /* heatmap */
  .hsec{margin-bottom:20px}
  .hsec-h{display:flex;align-items:baseline;gap:12px;margin-bottom:6px;border-bottom:1.5px solid var(--ink);padding-bottom:5px}
  .hsec-t{font-family:var(--cond);text-transform:uppercase;letter-spacing:.05em;font-size:16px;font-weight:700}
  .hsec-n{font-size:10.5px;color:var(--muted)}
  table.heat{width:100%;border-collapse:separate;border-spacing:2px}
  table.heat th{font-family:var(--cond);text-transform:uppercase;letter-spacing:.03em;font-size:9.5px;color:var(--muted);font-weight:700;padding:0 0 6px;text-align:center;vertical-align:bottom}
  table.heat th.nm{text-align:left}
  table.heat th.c{width:64px}table.heat th.c i{display:block;font-size:7px;color:#bbb;font-weight:400;letter-spacing:0;text-transform:none}
  table.heat th.opt{color:#b3b3b3}
  table.heat th.score{width:44px}
  td.nm{padding:5px 10px 5px 2px;border-bottom:1px solid #f0efea;min-width:240px}
  td.nm .nome{font-weight:600;font-size:12px}
  td.nm .uf{font-size:9px;color:var(--muted);background:#f0efea;border-radius:2px;padding:1px 5px;margin-left:6px;vertical-align:middle}
  td.nm .meta{margin-top:2px;display:flex;gap:5px;align-items:center;flex-wrap:wrap}
  .lc{font-size:8.5px;color:var(--graphite);background:#f2f1ec;border:1px solid var(--line);border-radius:2px;padding:1px 5px}
  .cod{font-size:8.5px;color:var(--muted);font-family:var(--cond);letter-spacing:.02em}
  td.c{width:64px;height:30px;text-align:center;border-radius:4px;font-size:13px;font-weight:700}
  td.c.ok{background:#12100b;color:#fff}
  td.c.no{background:#fff;border:1.4px solid #e2e0da}
  td.c.no .x{color:#d8d5cd;font-size:15px}
  td.c.isenta{background:#f3efe3;border:1px dashed #d8cca0;color:#9c8b52;font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.02em}
  td.score{text-align:center;font-family:var(--cond);font-size:14px;border-bottom:1px solid #f0efea}
  td.score span{color:var(--muted);font-size:10px}
  .sit{font-size:8.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:2px 7px;border-radius:3px}
  .s-enviado{background:var(--gold);color:#1a1608}.s-aprovado{background:#12100b;color:#fff}.s-recusado{background:#e7e4dc;color:#8a8a8a}
  .legend{display:flex;gap:20px;margin:8px 0 22px;font-size:10.5px;color:var(--graphite);align-items:center}
  .legend .sw{display:inline-block;width:15px;height:15px;border-radius:3px;vertical-align:middle;margin-right:6px}
  .sw.ok{background:#12100b}.sw.no{background:#fff;border:1.4px solid #e2e0da}.sw.is{background:#f3efe3;border:1px dashed #d8cca0}
  /* ação */
  table.acao{width:100%;border-collapse:collapse;margin-top:2px}
  table.acao th{font-family:var(--cond);text-transform:uppercase;letter-spacing:.04em;font-size:9.5px;color:var(--muted);text-align:left;padding:0 8px 7px 0;border-bottom:1.5px solid var(--ink);font-weight:700}
  table.acao td{padding:8px 8px 8px 0;border-bottom:1px solid var(--line);vertical-align:top;font-size:11.5px}
  table.acao td.nm{font-weight:600;min-width:150px}.acao .uf{font-size:9px;color:var(--muted)}
  .acao .cod{font-family:var(--cond);color:var(--graphite);font-size:11px;white-space:nowrap}
  .ft{display:inline-block;font-size:10px;background:#12100b;color:#fff;border-radius:3px;padding:2px 7px;margin:0 4px 4px 0}
  .ft.opt{background:#fff;color:var(--graphite);border:1px solid var(--line)}
  .okall{color:var(--graphite);font-weight:600}
  .note{font-size:10.5px;color:var(--muted);margin-top:16px;border-top:1px solid var(--line);padding-top:12px;line-height:1.6}
  footer{padding:16px 38px 26px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:10px;color:var(--muted)}
  @media print{body{background:#fff}.sheet{box-shadow:none;width:auto}.hsec,tr{break-inside:avoid}}
</style></head><body>
<div class="sheet">
  <header>
    <div>
      <div class="brand">Bula Assessoria · Cadastro em Leiloeiras</div>
      <h1>Submissões & Checklist</h1>
      <div class="sub">Panorama dos leads submetidos às leiloeiras e o status dos <b>7 dados exigidos</b> (lista oficial da leiloeira) — o que já temos e o que falta, para tratar as pendências.</div>
    </div>
    <div class="gen">${N} leads submetidos<br>Programa Leilões · Bula Remates<br><br>gerado ${genLabel}</div>
  </header>
  <main>
    <div class="kpis">
      <div class="kpi"><div class="v">${N}</div><div class="l">Leads submetidos</div></div>
      <div class="kpi gold"><div class="v">${bySit.aprovado.length}</div><div class="l">Aprovados</div></div>
      <div class="kpi"><div class="v">${pend.length}</div><div class="l">Pendentes</div></div>
      <div class="kpi"><div class="v">${bySit.recusado.length}</div><div class="l">Recusados</div></div>
      <div class="kpi"><div class="v">${mediaCompleta}%</div><div class="l">Completude média</div></div>
    </div>

    <h2 class="sec-t">Onde estão os furos — preenchimento por item</h2>
    <div class="furos">
      ${ITEMS.map(i => {
        const n = fillAll[i.key], p = Math.round(n / N * 100)
        return `<div class="fr-row ${p < 60 ? 'low' : ''}">
          <div class="fr-name">${i.full}${i.opt ? ' <i>(se possível)</i>' : ''}</div>
          ${pctBar(n, N)}
        </div>`
    }).join('')}
    </div>
    <div class="callout">
      <b>Leitura rápida:</b> Nome, CPF e Telefone estão 100% completos. Os furos que valem conversar com a leiloeira são os
      <b>documentos anexos</b> — documento com foto (${fillAll.doc_foto}/${N}) e comprovante de residência (${fillAll.comp_res}/${N}) —
      além de <b>Inscrição Estadual</b> (${fillAll.ie}/${N}) e <b>endereço de correspondência</b> (${fillAll.endereco}/${N}).
      Entre os <b>${pend.length} pendentes</b>, é aí que a habilitação está travando.
    </div>

    <h2 class="sec-t">Heatmap do checklist por lead</h2>
    <div class="legend">
      <span><span class="sw ok"></span>Tem o dado</span>
      <span><span class="sw no"></span>Falta</span>
      <span><span class="sw is"></span>I.E. isenta (EAO)</span>
      <span style="margin-left:auto">Ordenado: pendentes primeiro, menos completos no topo</span>
    </div>
    ${heatSection('Pendentes', pend, 'aguardando decisão da leiloeira — foco da ação')}
    ${heatSection('Aprovados', bySit.aprovado, 'já habilitados')}
    ${heatSection('Recusados', bySit.recusado, 'exigem retrabalho')}

    <h2 class="sec-t" style="margin-top:28px">Pendentes — o que falta pedir</h2>
    <table class="acao"><thead><tr><th>Lead</th><th>Leiloeira</th><th>Código</th><th>Itens faltantes</th></tr></thead>
    <tbody>${acao || '<tr><td colspan="4" style="color:#999;padding:14px 0">Nenhum pendente.</td></tr>'}</tbody></table>

    <div class="note">
      <b>Como foi montado:</b> “submetido” = lead com ficha enviada à leiloeira (tabela de cadastros). O checklist segue a <b>lista oficial da leiloeira</b>
      (Nome, CPF, Inscrição Estadual, Endereço de correspondência, Telefone e — “se possível” — documento com foto e comprovante de residência).
      Um item só conta como “tem” com dado real (a marcação da IA só vale com arquivo por trás). <b>Ressalvas de dado:</b> os aprovados via e-mail (backfill de 08/07)
      não têm endereço/documentos detalhados no sistema, por isso aparecem com furos nessas colunas mesmo já habilitados — para eles, o gap é informativo, não bloqueio.
      A <b>I.E.</b> é dispensada para leads da campanha EAO (marcados “isenta”).
    </div>
  </main>
  <footer><span>Bula Assessoria · Submissões & Checklist de habilitação</span><span>Confidencial · uso interno</span></footer>
</div>
</body></html>`

const desktop = join(homedir(), 'Desktop')
const htmlPath = join(desktop, 'Relatorio-Submissoes-Leiloeiras.html')
const pngPath = join(desktop, 'Relatorio-Submissoes-Leiloeiras.png')
const pdfPath = join(desktop, 'Relatorio-Submissoes-Leiloeiras.pdf')
writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
await page.setViewportSize({ width: 1060, height: 1400 })
await page.setContent(html, { waitUntil: 'networkidle' })
const sheet = await page.$('.sheet')
await sheet.screenshot({ path: pngPath })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } })
await browser.close()

console.log('OK')
console.log('PNG :', pngPath)
console.log('PDF :', pdfPath)
console.log('HTML:', htmlPath)
