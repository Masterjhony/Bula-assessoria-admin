// Documento de apresentação para a Márcia (Programa Leilões): leva de produtores
// PENDENTES com score de crédito > 400, com a ficha completa de cada um, para
// solicitar a aprovação em lote da habilitação para compra parcelada.
// Saída: PDF (apresentação) + PNG (capa/resumo) + HTML na Área de Trabalho.
// Uso: node scripts/gera-leva-programa-marcia.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { chromium } from 'playwright'

const SCORE_MIN = 400

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()

const str = v => { const s = String(v ?? '').trim(); return /^(null|undefined|nulo|n\/a|na|-|--|n[aã]o[ _]?tem|n[aã]o[ _]?possui|nenhuma?|sem)$/i.test(s) ? '' : s }
const digits = v => String(v ?? '').replace(/\D/g, '')
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const cap = s => { s = str(s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : '' }
const fmtCpf = v => { const d = digits(v); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (str(v) || '—') }
const fmtFone = v => { const d = digits(v).replace(/^55/, ''); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return str(v) || '—' }
const fmtData = d => { if (!d) return '—'; return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) }
const brl = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n || 0)

const { rows } = await db.query(`
  select c.cliente_key, c.codigo, c.enviado_at, c.crm_lead_id, l.nome leiloeira,
         d.nome, d.cpf, d.telefone, d.celular, d.email, d.estado, d.cidade,
         d.inscricao_estadual, d.tem_inscricao_estadual, d.score_serasa, d.pendencias_financeiras,
         d.quantidade_animais, d.o_que_busca, d.interesse_principal, d.momento_pecuaria, d.operacao_pecuaria,
         d.extra_data
  from cliente_leiloeira_cadastro c
  join leiloeiras l on l.id = c.leiloeira_id
  left join crm_leads d on d.id = c.crm_lead_id
  where c.status = 'enviado' and l.nome ilike '%programa%'
  order by c.enviado_at desc`)

const { rows: clis } = await db.query(`select match_key, score_credito, cpf, inscricao_estadual, tem_inscricao_estadual, telefone from clientes`)
const cliBy = new Map(clis.map(c => [c.match_key, c]))

const leadIds = rows.map(r => r.crm_lead_id).filter(Boolean)
const { rows: docs } = leadIds.length ? await db.query(`select lead_id, tipo, nome_arquivo, created_at from crm_lead_documentos where lead_id = any($1) order by created_at`, [leadIds]) : { rows: [] }
const docsByLead = new Map()
for (const d of docs) { const a = docsByLead.get(d.lead_id) || []; a.push(d); docsByLead.set(d.lead_id, a) }

await db.end()

const DOC_LABEL = { cpf: 'Documento com foto', identidade: 'Documento com foto', ie: 'Comprovante de I.E.', comprovante: 'Comprovante de propriedade', endereco: 'Comprovante de residência', matricula: 'Matrícula do imóvel', itr: 'ITR', renda: 'Comprovante de renda', outro: 'Documento' }
const FAIXA = n => n == null ? { label: '—', tone: 'muted' } : n >= 700 ? { label: 'Bom', tone: 'gold' } : n >= 500 ? { label: 'Razoável', tone: 'ink' } : n >= 400 ? { label: 'Regular', tone: 'graphite' } : { label: 'Baixo', tone: 'muted' }

function scoreOf(r) {
    const xd = r.extra_data || {}
    const cand = [r.score_serasa, Number((xd.credito || {}).score), cliBy.get(r.cliente_key)?.score_credito]
        .map(x => Number(x)).filter(x => Number.isFinite(x) && x > 0)
    return cand.length ? Math.max(...cand) : null
}

const enriched = rows.map(r => {
    const xd = r.extra_data || {}
    const cli = cliBy.get(r.cliente_key)
    const score = scoreOf(r)
    const credito = xd.credito || {}
    const protestos = Array.isArray(credito.protestos) ? credito.protestos : []
    const ie = str(r.inscricao_estadual) || str(cli?.inscricao_estadual)
    const temIe = (str(r.tem_inscricao_estadual) || str(cli?.tem_inscricao_estadual)).toLowerCase() === 'sim'
    const ieDispensada = str(xd.ie_dispensada_leilao)
    const dlist = docsByLead.get(r.crm_lead_id) || []
    const referencias = (Array.isArray(xd.referencias) ? xd.referencias : [])
        .map(x => typeof x === 'string' ? x : `${str(x?.nome)} ${str(x?.telefone)}`.trim()).map(str).filter(Boolean)
    return {
        cliente_key: r.cliente_key, codigo: r.codigo, enviado_at: r.enviado_at,
        nome: str(r.nome) || r.cliente_key,
        cpf: digits(r.cpf || cli?.cpf),
        fone: str(r.celular) || str(r.telefone) || str(cli?.telefone),
        email: str(r.email),
        uf: (str(r.estado) || '').toUpperCase(),
        cidade: str(r.cidade),
        endereco: str(xd.endereco_titular),
        fazenda: str(xd.fazenda_nome),
        fazCidade: str(xd.fazenda_cidade),
        fazUf: str(xd.fazenda_uf).toUpperCase(),
        ie, temIe, ieDispensada,
        score, faixa: FAIXA(score), protestos,
        pendencias: str(r.pendencias_financeiras),
        rebanho: str(r.quantidade_animais),
        busca: cap(str(r.o_que_busca) || str(r.interesse_principal)),
        sistema: cap(str(xd.sistema_producao).replace(/_/g, ' ')),
        rebanhoAtual: cap(str(xd.rebanho_atual)),
        objetivo: cap(str(xd.objetivo_compra_resumido)),
        momento: cap(str(r.momento_pecuaria)),
        referencias,
        docs: dlist.map(d => ({ tipo: String(d.tipo || 'outro'), label: DOC_LABEL[String(d.tipo || 'outro')] || DOC_LABEL.outro })),
    }
})

const leva = enriched.filter(e => e.score != null && e.score > SCORE_MIN).sort((a, b) => b.score - a.score)
const semScore = enriched.filter(e => e.score == null).length
const abaixo = enriched.filter(e => e.score != null && e.score <= SCORE_MIN).length

// stats da leva
const rebanhoTotal = leva.reduce((s, e) => { const m = String(e.rebanho).match(/\d+/g); return s + (m ? Math.max(...m.map(Number)) : 0) }, 0)
const semProtesto = leva.filter(e => e.protestos.length === 0).length
const scoreMedio = Math.round(leva.reduce((s, e) => s + e.score, 0) / (leva.length || 1))
const comIe = leva.filter(e => e.ie.replace(/\D/g, '').length >= 3 || e.temIe).length

console.log(`leva (score>${SCORE_MIN}): ${leva.length} · sem score: ${semScore} · <=${SCORE_MIN}: ${abaixo} · score médio ${scoreMedio}`)

// ── render ───────────────────────────────────────────────────────────────────
const genLabel = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
const chip = (label, tone) => `<span class="chip c-${tone}">${label}</span>`

const summaryRows = leva.map((e, i) => `
  <tr>
    <td class="rk">${i + 1}</td>
    <td class="nm">${esc(e.nome)}</td>
    <td>${esc([e.cidade, e.uf].filter(Boolean).join('/') || e.uf || '—')}</td>
    <td class="mono">${fmtCpf(e.cpf)}</td>
    <td class="sc"><b class="t-${e.faixa.tone}">${e.score}</b> <span>${e.faixa.label}</span></td>
    <td>${e.protestos.length ? `<span class="prot">${e.protestos.length} protesto${e.protestos.length > 1 ? 's' : ''}</span>` : '<span class="okp">sem protestos</span>'}</td>
    <td>${e.ie.replace(/\D/g, '').length >= 3 ? esc(e.ie) : e.temIe ? 'Declara ter' : e.ieDispensada ? 'Isenta (EAO)' : '<span class="falta">—</span>'}</td>
    <td>${esc(e.rebanho || '—')}</td>
  </tr>`).join('')

const val = (v, fallback = '<span class="falta">a coletar</span>') => (v && String(v).trim()) ? esc(v) : fallback

function ficha(e, i) {
    const linha = (rot, v, fb) => `<div class="fl"><span class="rot">${rot}</span><span class="vv">${val(v, fb)}</span></div>`
    const docsHtml = e.docs.length
        ? e.docs.map(d => `<span class="doc">${esc(d.label)}</span>`).join('')
        : '<span class="doc-none">Documentos em coleta com o cliente</span>'
    return `<div class="ficha">
    <div class="fh">
      <div class="fh-l"><span class="fh-rk">${i + 1}</span><div><div class="fh-nome">${esc(e.nome)}</div><div class="fh-loc">${esc([e.cidade, e.uf].filter(Boolean).join(' · ') || e.uf || '')}${e.codigo ? ` · ficha ${esc(e.codigo)}` : ''}</div></div></div>
      <div class="fh-score t-${e.faixa.tone}"><span class="fs-v">${e.score}</span><span class="fs-l">${e.faixa.label}</span></div>
    </div>
    <div class="fg">
      <div class="col">
        <div class="col-t">Titular</div>
        ${linha('CPF', fmtCpf(e.cpf))}
        ${linha('Telefone', fmtFone(e.fone))}
        ${linha('E-mail', e.email, '<span class="falta">—</span>')}
        ${linha('Endereço de correspondência', e.endereco)}
      </div>
      <div class="col">
        <div class="col-t">Propriedade</div>
        ${linha('Fazenda', e.fazenda)}
        ${linha('Cidade / UF', [e.fazCidade, e.fazUf].filter(Boolean).join('/'))}
        ${linha('Inscrição Estadual', e.ie.replace(/\D/g, '').length >= 3 ? e.ie : (e.temIe ? 'Produtor declara ter' : (e.ieDispensada ? `Isenta — ${e.ieDispensada}` : '')))}
      </div>
      <div class="col">
        <div class="col-t">Perfil do comprador</div>
        ${linha('Busca', e.busca)}
        ${linha('Rebanho', e.rebanho ? `${e.rebanho} cabeças` : '')}
        ${linha('Sistema', e.sistema, '<span class="falta">—</span>')}
        ${linha('Objetivo', e.objetivo, '<span class="falta">—</span>')}
      </div>
    </div>
    <div class="fcred">
      <div class="cred-b"><span class="cred-t">Crédito</span>
        <span class="cred-v">Score <b class="t-${e.faixa.tone}">${e.score}</b> · ${e.faixa.label} · ${e.protestos.length ? `<span class="prot">${e.protestos.length} protesto${e.protestos.length > 1 ? 's' : ''}${e.protestos.some(p => p.valor) ? ` (${brl(e.protestos.reduce((s, p) => s + (Number(p.valor) || 0), 0))})` : ''}</span>` : '<span class="okp">sem protestos / restrições</span>'}${e.pendencias && !/score|protesto/i.test(e.pendencias) ? ` · ${esc(e.pendencias)}` : ''}</span>
      </div>
      <div class="cred-b docs"><span class="cred-t">Documentos anexos</span><span class="cred-v">${docsHtml}</span></div>
    </div>
  </div>`
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  :root{--ink:#111;--graphite:#3a3a3a;--muted:#8a8a8a;--line:#e6e4df;--panel:#faf9f6;--gold:#C9A84C;
    --cond:'Arial Narrow','Oswald','Segoe UI',sans-serif;--sans:'Segoe UI',system-ui,sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);color:var(--ink);background:#eceae5;font-size:12px;line-height:1.42}
  .sheet{width:1000px;margin:0 auto;background:#fff;box-shadow:0 18px 60px rgba(0,0,0,.10)}
  .t-gold{color:var(--gold)!important}.t-ink{color:var(--ink)!important}.t-graphite{color:var(--graphite)!important}.t-muted{color:var(--muted)!important}
  /* capa */
  header{padding:34px 40px 26px;border-bottom:2px solid var(--ink)}
  .brand{font-family:var(--cond);text-transform:uppercase;letter-spacing:.24em;font-size:11px;color:var(--graphite);font-weight:700}
  h1{font-family:var(--cond);text-transform:uppercase;font-size:34px;line-height:1.02;font-weight:700;margin-top:8px}
  .para{color:var(--graphite);font-size:13px;margin-top:14px;max-width:760px;line-height:1.6}
  .para b{color:var(--ink)}
  .to{margin-top:16px;font-size:12px;color:var(--muted)}.to b{color:var(--ink);font-family:var(--cond);font-size:15px;letter-spacing:.02em}
  main{padding:26px 40px 36px}
  .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:26px}
  .kpi{background:#fff;padding:14px}
  .kpi .v{font-family:var(--cond);font-size:30px;font-weight:700;line-height:.9}
  .kpi .l{text-transform:uppercase;letter-spacing:.06em;font-size:9px;color:var(--muted);margin-top:6px;font-weight:600}
  .kpi.gold .v{color:var(--gold)}
  .sec-t{font-family:var(--cond);text-transform:uppercase;letter-spacing:.13em;font-size:13px;color:var(--graphite);font-weight:700;margin:0 0 14px;display:flex;align-items:center;gap:12px}
  .sec-t::after{content:'';flex:1;height:1px;background:var(--line)}
  /* summary table */
  table.sum{width:100%;border-collapse:collapse;margin-bottom:8px}
  table.sum th{font-family:var(--cond);text-transform:uppercase;letter-spacing:.04em;font-size:9.5px;color:var(--muted);text-align:left;padding:0 10px 8px 0;border-bottom:1.5px solid var(--ink);font-weight:700}
  table.sum td{padding:8px 10px 8px 0;border-bottom:1px solid var(--line);vertical-align:middle}
  table.sum tr:nth-child(even){background:#fbfbf9}
  .sum .rk{font-family:var(--cond);font-size:14px;color:var(--muted);font-weight:700;width:22px}
  .sum .nm{font-weight:700}
  .sum .mono{font-variant-numeric:tabular-nums;font-size:11px;color:var(--graphite)}
  .sum .sc b{font-family:var(--cond);font-size:16px}.sum .sc span{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
  .prot{color:#8a6d2f;font-size:11px;font-weight:600}.okp{color:var(--graphite);font-size:11px}
  .falta{color:#c0bdb5;font-style:italic}
  .note-inline{font-size:11px;color:var(--muted);margin:6px 0 4px}
  /* fichas */
  .ficha{border:1px solid var(--line);border-radius:5px;margin-bottom:16px;overflow:hidden;break-inside:avoid}
  .fh{display:flex;justify-content:space-between;align-items:center;background:#12100b;color:#fff;padding:12px 18px}
  .fh-l{display:flex;align-items:center;gap:14px}
  .fh-rk{font-family:var(--cond);font-size:22px;font-weight:700;color:var(--gold);min-width:24px}
  .fh-nome{font-family:var(--cond);font-size:19px;font-weight:700;letter-spacing:.01em;text-transform:uppercase}
  .fh-loc{font-size:10.5px;color:#b8b2a4;margin-top:1px}
  .fh-score{text-align:right;display:flex;flex-direction:column;line-height:1}
  .fh-score .fs-v{font-family:var(--cond);font-size:30px;font-weight:700}
  .fh-score .fs-l{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#b8b2a4;margin-top:2px}
  .fg{display:grid;grid-template-columns:repeat(3,1fr);gap:0}
  .col{padding:13px 18px;border-right:1px solid var(--line)}
  .col:last-child{border-right:none}
  .col-t{font-family:var(--cond);text-transform:uppercase;letter-spacing:.06em;font-size:10px;font-weight:700;color:var(--muted);margin-bottom:9px;border-bottom:1px solid var(--line);padding-bottom:5px}
  .fl{margin-bottom:8px}
  .fl .rot{display:block;font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
  .fl .vv{display:block;font-size:12px;font-weight:600;line-height:1.35;margin-top:1px}
  .fcred{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line);background:var(--panel)}
  .cred-b{padding:11px 18px}
  .cred-b.docs{border-left:1px solid var(--line)}
  .cred-t{display:block;font-family:var(--cond);text-transform:uppercase;letter-spacing:.06em;font-size:9.5px;font-weight:700;color:var(--muted);margin-bottom:5px}
  .cred-v{font-size:11.5px}.cred-v b{font-family:var(--cond);font-size:15px}
  .doc{display:inline-block;font-size:10px;background:#12100b;color:#fff;border-radius:3px;padding:2px 8px;margin:0 4px 4px 0}
  .doc-none{font-size:11px;color:var(--muted);font-style:italic}
  .close{margin-top:22px;border-top:2px solid var(--ink);padding-top:16px;font-size:12px;color:var(--graphite);line-height:1.6}
  .close b{color:var(--ink)}
  .ask{background:#12100b;color:#efece4;border-radius:5px;padding:14px 18px;margin-top:14px;font-size:12.5px;line-height:1.55}
  .ask b{color:var(--gold)}
  .note{font-size:10.5px;color:var(--muted);margin-top:16px;line-height:1.6}
  footer{padding:16px 40px 26px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:10px;color:var(--muted)}
  @media print{body{background:#fff}.sheet{box-shadow:none;width:auto}.ficha,tr{break-inside:avoid}}
</style></head><body>
<div class="sheet">
  <header>
    <div class="brand">Bula Assessoria · Habilitação de Compradores</div>
    <h1>Leva para aprovação<br>Programa Leilões</h1>
    <p class="para">Márcia, segue a relação de <b>${leva.length} produtores</b> já qualificados pela Bula e com <b>consulta de crédito acima de ${SCORE_MIN} pontos</b>, aguardando a análise da Programa para liberação da <b>compra parcelada</b> nos leilões. Todos os dados do titular, da propriedade e do perfil de compra estão detalhados abaixo — a intenção é submeter esta leva de uma vez para agilizar a habilitação antes dos próximos leilões.</p>
    <div class="to">Para: <b>Márcia — Programa Leilões</b> · De: Bula Assessoria · ${genLabel}</div>
  </header>
  <main>
    <div class="kpis">
      <div class="kpi gold"><div class="v">${leva.length}</div><div class="l">Produtores na leva</div></div>
      <div class="kpi"><div class="v">${scoreMedio}</div><div class="l">Score médio</div></div>
      <div class="kpi"><div class="v">${semProtesto}/${leva.length}</div><div class="l">Sem protestos</div></div>
      <div class="kpi"><div class="v">${comIe}/${leva.length}</div><div class="l">Com I.E.</div></div>
      <div class="kpi"><div class="v">${rebanhoTotal.toLocaleString('pt-BR')}</div><div class="l">Cabeças (rebanho)</div></div>
    </div>

    <h2 class="sec-t">Resumo da leva</h2>
    <table class="sum"><thead><tr>
      <th>#</th><th>Produtor</th><th>Local</th><th>CPF</th><th>Score</th><th>Restrições</th><th>Inscr. Estadual</th><th>Rebanho</th>
    </tr></thead><tbody>${summaryRows}</tbody></table>
    <div class="note-inline">Score de crédito consultado pela Bula (modelo Serasa-like 0–1000). Ordenado do maior para o menor.</div>

    <h2 class="sec-t" style="margin-top:26px">Fichas completas</h2>
    ${leva.map((e, i) => ficha(e, i)).join('')}

    <div class="close">
      <b>Resumo:</b> os ${leva.length} produtores acima estão com cadastro montado, crédito consultado (score médio ${scoreMedio}, ${semProtesto} sem qualquer protesto) e são compradores com perfil real de leilão.
    </div>
    <div class="ask">
      <b>Pedido à Programa:</b> podemos considerar esta leva <b>aprovada em bloco</b> para habilitação de compra parcelada? Onde faltar Inscrição Estadual ou algum documento com foto, a Bula complementa na sequência (mesma ficha, mesmo código) — mas gostaríamos de já liberar os que o crédito comporta, para não perderem os leilões deste mês.
    </div>
    <div class="note">
      Observação: há ainda <b>${semScore} produtores pendentes na Programa</b> com a consulta de score em andamento e <b>${abaixo}</b> abaixo de ${SCORE_MIN} — serão apresentados numa próxima leva, conforme a consulta de crédito for concluída. Este documento traz apenas os já pontuados acima de ${SCORE_MIN}.
    </div>
  </main>
  <footer><span>Bula Assessoria · Leva de habilitação — Programa Leilões</span><span>Confidencial · dados de crédito sob sigilo</span></footer>
</div>
</body></html>`

const desktop = join(homedir(), 'Desktop')
const htmlPath = join(desktop, 'Leva-Programa-Marcia.html')
const pdfPath = join(desktop, 'Leva-Programa-Marcia.pdf')
const pngPath = join(desktop, 'Leva-Programa-Marcia-resumo.png')
writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
await page.setViewportSize({ width: 1060, height: 1400 })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '9mm', bottom: '9mm', left: '8mm', right: '8mm' } })
// PNG do topo (capa + resumo): recorta a altura até o fim da tabela-resumo
const clipH = await page.evaluate(() => {
    const s = document.querySelector('.sec-t + table.sum') || document.querySelector('table.sum')
    const r = s.getBoundingClientRect(); return Math.ceil(r.bottom + window.scrollY + 40)
})
await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: 1000, height: clipH } })
await browser.close()

console.log('OK')
console.log('PDF :', pdfPath)
console.log('PNG :', pngPath)
console.log('HTML:', htmlPath)
