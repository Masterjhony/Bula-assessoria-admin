/**
 * Relatório dos LEADS AVANÇADOS (muita informação captada) para a Área de Trabalho.
 * Para cada lead: status (etapa + cadastros nas leiloeiras), tudo o que foi captado
 * (titular, propriedade, perfil, crédito, documentos) e — pela fonte única
 * `computeHabilitacaoChecklist` — o que ainda FALTA.
 * Saída: PDF + HTML na Área de Trabalho.
 *   npx tsx scripts/gera-relatorio-leads-avancados.mts
 */
import fs from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
import pg from 'pg'
import { chromium } from 'playwright'
import { computeHabilitacaoChecklist } from '../src/lib/crm-habilitacao'

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()

const str = (v: unknown) => { const s = String(v ?? '').trim(); return /^(null|undefined|nulo|n\/a|na|-|--|n[aã]o[ _]?tem|n[aã]o[ _]?possui|nenhuma?|sem)$/i.test(s) ? '' : s }
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const cap = (s: unknown) => { const t = str(s); return t ? t.charAt(0).toUpperCase() + t.slice(1) : '' }
const fmtCpf = (v: unknown) => { const d = digits(v); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (str(v) || '—') }
const fmtFone = (v: unknown) => { const d = digits(v).replace(/^55/, ''); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return str(v) || '—' }
const fmtData = (d: unknown) => d ? new Date(d as string).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n || 0)
const FAIXA = (n: number | null) => n == null ? { label: '—', tone: 'muted' } : n >= 700 ? { label: 'Bom', tone: 'gold' } : n >= 500 ? { label: 'Razoável', tone: 'ink' } : n >= 400 ? { label: 'Regular', tone: 'graphite' } : { label: 'Baixo', tone: 'muted' }
const STATUS_TONE: Record<string, string> = { aprovado: 'ok', enviado: 'send', recusado: 'no' }
const STATUS_LABEL: Record<string, string> = { aprovado: 'Aprovado', enviado: 'Enviado', recusado: 'Recusado' }

// ── Candidatos: avançados (cadastro em leiloeira OU checklist notificado OU
//    CPF + propriedade/endereço captados) ──────────────────────────────────
const { rows } = await db.query(`
  select d.id, d.nome, d.cpf, d.telefone, d.celular, d.email, d.cidade, d.estado,
         d.inscricao_estadual, d.tem_inscricao_estadual, d.score_serasa, d.pendencias_financeiras,
         d.quantidade_animais, d.o_que_busca, d.interesse_principal, d.momento_pecuaria,
         d.stage, d.extra_data, d.created_at, d.updated_at
  from crm_leads d
  where coalesce(d.arquivado,false) = false
    -- quem já foi recusado por alguma leiloeira não consta no relatório
    and not exists (select 1 from cliente_leiloeira_cadastro cr where cr.crm_lead_id = d.id and cr.status = 'recusado')
    and (
      exists (select 1 from cliente_leiloeira_cadastro c where c.crm_lead_id = d.id)
      or (d.extra_data->>'habilitacao_notificada_at') is not null
      or (length(regexp_replace(coalesce(d.cpf,''),'\\D','','g')) = 11
          and (coalesce(d.extra_data->>'fazenda_nome','') <> '' or coalesce(d.extra_data->>'endereco_titular','') <> ''))
  )`)

const ids = rows.map(r => r.id)
const { rows: cadRows } = ids.length ? await db.query(`
  select c.crm_lead_id, l.nome leiloeira, c.status, c.codigo, c.enviado_at, c.decidido_at
  from cliente_leiloeira_cadastro c join leiloeiras l on l.id = c.leiloeira_id
  where c.crm_lead_id = any($1) order by c.enviado_at desc nulls last`, [ids]) : { rows: [] }
const cadByLead = new Map<string, any[]>()
for (const c of cadRows) { const a = cadByLead.get(c.crm_lead_id) || []; a.push(c); cadByLead.set(c.crm_lead_id, a) }

const { rows: docRows } = ids.length ? await db.query(`
  select lead_id, tipo, nome_arquivo from crm_lead_documentos where lead_id = any($1) order by created_at`, [ids]) : { rows: [] }
const docsByLead = new Map<string, any[]>()
for (const d of docRows) { const a = docsByLead.get(d.lead_id) || []; a.push(d); docsByLead.set(d.lead_id, a) }

await db.end()

const enriched = rows.map(r => {
    const x = (r.extra_data || {}) as Record<string, unknown>
    const dlist = docsByLead.get(r.id) || []
    const cads = cadByLead.get(r.id) || []
    const credito = (x.credito || {}) as any
    const protestos = Array.isArray(credito.protestos) ? credito.protestos : []
    const score = r.score_serasa != null ? Number(r.score_serasa) : (Number(credito.score) || null)
    const ieDispensada = str(x.ie_dispensada_leilao)
    const cl = computeHabilitacaoChecklist({
        nome: r.nome, cpf: r.cpf, telefone: r.telefone, celular: r.celular, email: r.email,
        inscricao_estadual: r.inscricao_estadual, tem_inscricao_estadual: r.tem_inscricao_estadual,
        extra_data: x, docsCount: dlist.length, docTipos: dlist.map(d => String(d.tipo || 'outro')),
        ieDispensadaPara: ieDispensada || null,
    })
    const desejaveisFaltando = cl.items.filter(i => i.optional && !i.done).map(i => i.label)
    return {
        id: r.id, nome: str(r.nome) || '—',
        cpf: digits(r.cpf), fone: str(r.celular) || str(r.telefone), email: str(r.email),
        uf: (str(r.estado) || '').toUpperCase(), cidade: str(r.cidade),
        endereco: str(x.endereco_titular),
        fazenda: str(x.fazenda_nome), fazCidade: str(x.fazenda_cidade), fazUf: str(x.fazenda_uf).toUpperCase(),
        ie: str(r.inscricao_estadual), temIe: str(r.tem_inscricao_estadual).toLowerCase() === 'sim', ieDispensada,
        score, faixa: FAIXA(score), protestos,
        rebanho: str(r.quantidade_animais), sistema: cap(String(x.sistema_producao ?? '').replace(/_/g, ' ')),
        rebanhoAtual: cap(x.rebanho_atual), objetivo: cap(x.objetivo_compra_resumido),
        busca: cap(str(r.o_que_busca) || str(r.interesse_principal)), momento: cap(r.momento_pecuaria),
        referencias: (Array.isArray(x.referencias) ? x.referencias : []).map((v: any) => typeof v === 'string' ? v : `${str(v?.nome)} ${str(v?.telefone)}`.trim()).map(str).filter(Boolean),
        docs: dlist.map(d => ({ tipo: String(d.tipo || 'outro'), nome: String(d.nome_arquivo || '') })),
        cads, stage: str(r.stage), atualizado: r.updated_at,
        cl, faltaObrig: cl.missingLabels, faltaDesej: desejaveisFaltando,
        // "riqueza": itens preenchidos (obrigatórios feitos + valores de perfil)
        captados: cl.done + [str(x.sistema_producao), str(x.objetivo_compra_resumido), str(r.quantidade_animais), str(r.o_que_busca) || str(r.interesse_principal), (Array.isArray(x.referencias) && x.referencias.length) ? '1' : ''].filter(Boolean).length,
    }
})

// "Muitas informações captadas" e avançados: checklist com ≥6 itens OU já em leiloeira.
const leads = enriched
    .filter(e => e.cl.done >= 6 || e.cads.length > 0)
    .sort((a, b) => (b.cl.complete ? 1 : 0) - (a.cl.complete ? 1 : 0) || (b.score ?? -1) - (a.score ?? -1) || b.captados - a.captados)

// ── stats ──
const prontos = leads.filter(e => e.cl.complete).length
const enviados = leads.filter(e => e.cads.some(c => c.status === 'enviado' || c.status === 'aprovado')).length
const aprovados = leads.filter(e => e.cads.some(c => c.status === 'aprovado')).length
const comScore = leads.filter(e => e.score != null).length
const comDocs = leads.filter(e => e.docs.length > 0).length
const genLabel = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
console.log(`leads no relatório: ${leads.length} · prontos ${prontos} · enviados ${enviados} · aprovados ${aprovados}`)

// ── render ──
const statusChips = (e: typeof leads[number]) => e.cads.length
    ? e.cads.map(c => `<span class="chip c-${STATUS_TONE[c.status] || 'muted'}">${esc((c.leiloeira || '').replace(/leilões/i, '').trim())}: ${STATUS_LABEL[c.status] || esc(c.status)}${c.codigo ? ` · ${esc(c.codigo)}` : ''}</span>`).join('')
    : '<span class="chip c-muted">Não enviado a leiloeira</span>'

const summaryRows = leads.map((e, i) => `
  <tr>
    <td class="rk">${i + 1}</td>
    <td class="nm">${esc(e.nome)}</td>
    <td>${esc([e.cidade, e.uf].filter(Boolean).join('/') || e.uf || '—')}</td>
    <td class="sc">${e.score != null ? `<b class="t-${e.faixa.tone}">${e.score}</b>` : '<span class="falta">—</span>'}</td>
    <td>${e.cl.complete ? '<span class="okp">Pronto</span>' : `<span class="prot">${e.cl.done}/${e.cl.total}</span>`}</td>
    <td>${e.faltaObrig.length ? `<span class="prot">${e.faltaObrig.map(esc).join(', ')}</span>` : (e.faltaDesej.length ? `<span class="minor">só ${e.faltaDesej.map(esc).join(', ')}</span>` : '<span class="okp">nada</span>')}</td>
  </tr>`).join('')

const val = (v: unknown, fb = '<span class="falta">a coletar</span>') => (v && String(v).trim()) ? esc(v) : fb
const linha = (rot: string, v: unknown, fb?: string) => `<div class="fl"><span class="rot">${rot}</span><span class="vv">${val(v, fb)}</span></div>`

function ficha(e: typeof leads[number], i: number) {
    const docsHtml = e.docs.length
        ? e.docs.map(d => `<span class="doc">${esc(d.nome || d.tipo)}</span>`).join('')
        : '<span class="doc-none">Nenhum documento coletado</span>'
    const faltaHtml = (!e.faltaObrig.length && !e.faltaDesej.length)
        ? '<span class="okp">Nada — habilitação completa ✔</span>'
        : [
            ...e.faltaObrig.map(f => `<span class="need need-x">${esc(f)}</span>`),
            ...e.faltaDesej.map(f => `<span class="need need-o">${esc(f)} <i>(se possível)</i></span>`),
        ].join('')
    const ieTxt = e.ie.replace(/\D/g, '').length >= 3 ? e.ie : (e.temIe ? 'Declara ter (nº pendente)' : (e.ieDispensada ? `Dispensada — ${e.ieDispensada}` : ''))
    return `<div class="ficha">
    <div class="fh">
      <div class="fh-l"><span class="fh-rk">${i + 1}</span><div><div class="fh-nome">${esc(e.nome)}</div><div class="fh-loc">${esc([e.cidade, e.uf].filter(Boolean).join(' · ') || e.uf || '')}${e.fone ? ` · ${esc(fmtFone(e.fone))}` : ''}</div></div></div>
      ${e.score != null ? `<div class="fh-score t-${e.faixa.tone}"><span class="fs-v">${e.score}</span><span class="fs-l">${e.faixa.label}</span></div>` : '<div class="fh-score t-muted"><span class="fs-l">sem<br>score</span></div>'}
    </div>
    <div class="fstatus">${statusChips(e)}<span class="prog">Habilitação ${e.cl.done}/${e.cl.total}${e.cl.complete ? ' · pronto' : ''}</span></div>
    <div class="fg">
      <div class="col">
        <div class="col-t">Titular</div>
        ${linha('CPF', fmtCpf(e.cpf))}
        ${linha('Telefone', fmtFone(e.fone))}
        ${linha('E-mail', e.email, '<span class="falta">—</span>')}
        ${linha('Endereço', e.endereco)}
      </div>
      <div class="col">
        <div class="col-t">Propriedade</div>
        ${linha('Fazenda', e.fazenda)}
        ${linha('Cidade / UF', [e.fazCidade, e.fazUf].filter(Boolean).join('/'))}
        ${linha('Inscrição Estadual', ieTxt)}
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
      <div class="cred-b"><span class="cred-t">Crédito</span><span class="cred-v">${e.score != null ? `Score <b class="t-${e.faixa.tone}">${e.score}</b> · ${e.faixa.label} · ${e.protestos.length ? `<span class="prot">${e.protestos.length} protesto${e.protestos.length > 1 ? 's' : ''}${e.protestos.some((p: any) => p.valor) ? ` (${brl(e.protestos.reduce((s: number, p: any) => s + (Number(p.valor) || 0), 0))})` : ''}</span>` : '<span class="okp">sem protestos</span>'}` : '<span class="falta">consulta pendente</span>'}</span></div>
      <div class="cred-b docs"><span class="cred-t">Documentos</span><span class="cred-v">${docsHtml}</span></div>
    </div>
    <div class="ffalta"><span class="cred-t">O que falta</span><span class="need-wrap">${faltaHtml}</span></div>
  </div>`
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  :root{--ink:#111;--graphite:#3a3a3a;--muted:#8a8a8a;--line:#e6e4df;--panel:#faf9f6;--gold:#C9A84C;
    --cond:'Arial Narrow','Oswald','Segoe UI',sans-serif;--sans:'Segoe UI',system-ui,sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);color:var(--ink);background:#eceae5;font-size:12px;line-height:1.42}
  .sheet{width:1000px;margin:0 auto;background:#fff;box-shadow:0 18px 60px rgba(0,0,0,.10)}
  .t-gold{color:var(--gold)!important}.t-ink{color:var(--ink)!important}.t-graphite{color:var(--graphite)!important}.t-muted{color:var(--muted)!important}
  header{padding:34px 40px 26px;border-bottom:2px solid var(--ink)}
  .brand{font-family:var(--cond);text-transform:uppercase;letter-spacing:.24em;font-size:11px;color:var(--graphite);font-weight:700}
  h1{font-family:var(--cond);text-transform:uppercase;font-size:34px;line-height:1.02;font-weight:700;margin-top:8px}
  .para{color:var(--graphite);font-size:13px;margin-top:14px;max-width:780px;line-height:1.6}
  .para b{color:var(--ink)}
  .to{margin-top:16px;font-size:12px;color:var(--muted)}
  main{padding:26px 40px 36px}
  .kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:26px}
  .kpi{background:#fff;padding:14px}
  .kpi .v{font-family:var(--cond);font-size:28px;font-weight:700;line-height:.9}
  .kpi .l{text-transform:uppercase;letter-spacing:.05em;font-size:8.5px;color:var(--muted);margin-top:6px;font-weight:600}
  .kpi.gold .v{color:var(--gold)}
  .sec-t{font-family:var(--cond);text-transform:uppercase;letter-spacing:.13em;font-size:13px;color:var(--graphite);font-weight:700;margin:0 0 14px;display:flex;align-items:center;gap:12px}
  .sec-t::after{content:'';flex:1;height:1px;background:var(--line)}
  table.sum{width:100%;border-collapse:collapse;margin-bottom:8px}
  table.sum th{font-family:var(--cond);text-transform:uppercase;letter-spacing:.04em;font-size:9.5px;color:var(--muted);text-align:left;padding:0 10px 8px 0;border-bottom:1.5px solid var(--ink);font-weight:700}
  table.sum td{padding:8px 10px 8px 0;border-bottom:1px solid var(--line);vertical-align:middle}
  table.sum tr:nth-child(even){background:#fbfbf9}
  .sum .rk{font-family:var(--cond);font-size:14px;color:var(--muted);font-weight:700;width:22px}
  .sum .nm{font-weight:700}.sum .sc b{font-family:var(--cond);font-size:16px}
  .prot{color:#8a6d2f;font-size:11px;font-weight:600}.okp{color:#4a6b2f;font-size:11px;font-weight:600}
  .minor{color:var(--muted);font-size:11px}.falta{color:#c0bdb5;font-style:italic}
  .ficha{border:1px solid var(--line);border-radius:5px;margin-bottom:16px;overflow:hidden;break-inside:avoid}
  .fh{display:flex;justify-content:space-between;align-items:center;background:#12100b;color:#fff;padding:12px 18px}
  .fh-l{display:flex;align-items:center;gap:14px}
  .fh-rk{font-family:var(--cond);font-size:22px;font-weight:700;color:var(--gold);min-width:24px}
  .fh-nome{font-family:var(--cond);font-size:19px;font-weight:700;letter-spacing:.01em;text-transform:uppercase}
  .fh-loc{font-size:10.5px;color:#b8b2a4;margin-top:1px}
  .fh-score{text-align:right;display:flex;flex-direction:column;line-height:1}
  .fh-score .fs-v{font-family:var(--cond);font-size:30px;font-weight:700}
  .fh-score .fs-l{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#b8b2a4;margin-top:2px}
  .fstatus{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:10px 18px;background:var(--panel);border-bottom:1px solid var(--line)}
  .chip{font-size:9.5px;font-weight:600;padding:3px 9px;border-radius:20px;text-transform:uppercase;letter-spacing:.03em}
  .c-ok{background:#e7efe0;color:#3e5c25}.c-send{background:#efe9d8;color:#7a6320}.c-no{background:#f3e0e0;color:#8a3030}.c-muted{background:#efeee9;color:#8a8a8a}
  .prog{margin-left:auto;font-size:10px;color:var(--muted);font-family:var(--cond);text-transform:uppercase;letter-spacing:.05em}
  .fg{display:grid;grid-template-columns:repeat(3,1fr)}
  .col{padding:13px 18px;border-right:1px solid var(--line)}.col:last-child{border-right:none}
  .col-t{font-family:var(--cond);text-transform:uppercase;letter-spacing:.06em;font-size:10px;font-weight:700;color:var(--muted);margin-bottom:9px;border-bottom:1px solid var(--line);padding-bottom:5px}
  .fl{margin-bottom:8px}.fl .rot{display:block;font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
  .fl .vv{display:block;font-size:12px;font-weight:600;line-height:1.35;margin-top:1px}
  .fcred{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line);background:var(--panel)}
  .cred-b{padding:11px 18px}.cred-b.docs{border-left:1px solid var(--line)}
  .cred-t{display:block;font-family:var(--cond);text-transform:uppercase;letter-spacing:.06em;font-size:9.5px;font-weight:700;color:var(--muted);margin-bottom:5px}
  .cred-v{font-size:11.5px}.cred-v b{font-family:var(--cond);font-size:15px}
  .doc{display:inline-block;font-size:10px;background:#12100b;color:#fff;border-radius:3px;padding:2px 8px;margin:0 4px 4px 0}
  .doc-none{font-size:11px;color:var(--muted);font-style:italic}
  .ffalta{padding:11px 18px;border-top:1px solid var(--line);background:#fffdf7}
  .need-wrap{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
  .need{font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:3px}
  .need-x{background:#f3e6e6;color:#8a3030}.need-o{background:#efeadb;color:#7a6320;font-weight:500}
  .need i{font-style:italic;font-weight:400;opacity:.8}
  .note{font-size:10.5px;color:var(--muted);margin-top:16px;line-height:1.6}
  footer{padding:16px 40px 26px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:10px;color:var(--muted)}
  @media print{body{background:#fff}.sheet{box-shadow:none;width:auto}.ficha,tr{break-inside:avoid}}
</style></head><body>
<div class="sheet">
  <header>
    <div class="brand">Bula Assessoria · Habilitação de Compradores</div>
    <h1>Leads avançados<br>Status &amp; o que falta</h1>
    <p class="para">Relação dos <b>${leads.length} leads mais avançados</b> da base — os que já têm o cadastro bem preenchido pela captação (dados do titular, propriedade, perfil de compra e, quando houve, consulta de crédito). Para cada um: <b>o status</b> (etapa e cadastro nas leiloeiras), <b>tudo que foi captado</b> e, pela régua de habilitação, <b>o que ainda falta</b> para fechar.</p>
    <div class="to">Gerado em ${genLabel} · uso interno</div>
  </header>
  <main>
    <div class="kpis">
      <div class="kpi gold"><div class="v">${leads.length}</div><div class="l">Leads avançados</div></div>
      <div class="kpi"><div class="v">${prontos}</div><div class="l">Habilitação pronta</div></div>
      <div class="kpi"><div class="v">${enviados}</div><div class="l">Enviados a leiloeira</div></div>
      <div class="kpi"><div class="v">${aprovados}</div><div class="l">Aprovados</div></div>
      <div class="kpi"><div class="v">${comScore}/${leads.length}</div><div class="l">Com score</div></div>
      <div class="kpi"><div class="v">${comDocs}/${leads.length}</div><div class="l">Com documento</div></div>
    </div>

    <h2 class="sec-t">Resumo</h2>
    <table class="sum"><thead><tr>
      <th>#</th><th>Lead</th><th>Local</th><th>Score</th><th>Habilit.</th><th>O que falta</th>
    </tr></thead><tbody>${summaryRows}</tbody></table>

    <h2 class="sec-t" style="margin-top:26px">Fichas detalhadas</h2>
    ${leads.map((e, i) => ficha(e, i)).join('')}

    <div class="note">
      Critério: leads com pelo menos 6 dos 10 itens de habilitação preenchidos <b>ou</b> já com cadastro em alguma leiloeira. "O que falta" segue a régua única de habilitação — itens obrigatórios (nome, CPF, telefone, endereço, I.E., fazenda, cidade/UF) e os desejáveis "(se possível)" (documento com foto, comprovante de residência). Score consultado pela Bula (0–1000); "consulta pendente" = ainda não pontuado.
    </div>
  </main>
  <footer><span>Bula Assessoria · Relatório de leads avançados</span><span>Confidencial · dados sob sigilo</span></footer>
</div>
</body></html>`

const desktop = join(homedir(), 'Desktop')
const htmlPath = join(desktop, 'Relatorio-Leads-Avancados.html')
const pdfPath = join(desktop, 'Relatorio-Leads-Avancados.pdf')
fs.writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
await page.setViewportSize({ width: 1060, height: 1400 })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '9mm', bottom: '9mm', left: '8mm', right: '8mm' } })
await browser.close()

console.log('OK')
console.log('PDF :', pdfPath)
console.log('HTML:', htmlPath)
