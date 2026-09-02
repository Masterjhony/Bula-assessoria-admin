/**
 * "CAMPANHAS ATIVAS HOJE" — só o que está no ar no dia (Brasília), a
 * configuração de cada uma e como o dia está indo até agora. Sem histórico,
 * sem fechamento de período.
 *
 * A configuração e as métricas do dia vêm do snapshot do conector do Meta
 * (outputs/campanhas-ativas-2026-09-02/meta-hoje.json, recorte date_preset=today).
 * A conferência da planilha é do DIA e é feita na hora de gerar o PDF.
 *
 * Uso: node scripts/gera-pdf-campanhas-ativas-hoje.mjs [--png]
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import { google } from 'googleapis'
import pg from 'pg'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))

const M = JSON.parse(fs.readFileSync('outputs/campanhas-ativas-2026-09-02/meta-hoje.json', 'utf8'))

// ── a planilha, HOJE, lida agora ───────────────────────────────────────────
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const { rows: cfg } = await db.query("select value from jmp_config where key='sheets'")
await db.end()
const spreadsheetId = cfg[0].value.spreadsheetId

const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})
const sheets = google.sheets({ version: 'v4', auth })
const abas = (await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }))
    .data.sheets.map(s => s.properties.title)
const leia = async t => (await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${t}'!A1:BZ` })).data.values ?? []

const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const dig = v => String(v || '').replace(/\D/g, '').replace(/^55/, '')
/** O dia é o de BRASÍLIA — o "hoje" do Meta é o de Nova York e começa 1h antes. */
const diaBR = v => { const t = new Date(String(v || '')); return isNaN(t) ? null : t.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) }
const horaBR = v => { const t = new Date(String(v || '')); return isNaN(t) ? '' : t.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) }
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

let cruas = 0
const conteudo = {}
for (const t of abas) { conteudo[t] = await leia(t); cruas += conteudo[t].filter(r => /^l:\d+/.test(String(r[0] || '').trim())).length }

const G = conteudo['LEADS GERAIS']
const iG = n => G[0].findIndex(h => norm(h) === norm(n))
const C = {
    ct: iG('created_time'), campId: iG('campaign_id'), form: iG('form_name'), lead: iG('Lead ID'),
    nome: iG('Nome'), fone: iG('WhatsApp'), uf: iG('UF'), zona: iG('Zona'), interesse: iG('Interesse'),
    cab: iG('Cabeças'), ie: iG('Inscrição Estadual'), origem: iG('Origem'),
}
const deHoje = G.slice(1).filter(r => diaBR(r[C.ct]) === hoje).sort((a, b) => new Date(a[C.ct]) - new Date(b[C.ct]))

/** Em qual aba-recorte o lead foi parar — é lá que a equipe trabalha. */
const nasAbas = new Map()
for (const t of ['TOUROS', 'FEMEAS', 'EMBRIÕES', 'OUTROS']) {
    const a = conteudo[t]; if (!a?.length) continue
    const li = a[0].findIndex(h => norm(h) === norm('Lead ID'))
    const fi = a[0].findIndex(h => norm(h) === norm('WhatsApp'))
    for (const r of a.slice(1)) {
        const id = String(r[li] || '').trim(), f = dig(r[fi])
        if (id) nasAbas.set('id:' + id, t)
        if (f) nasAbas.set('f:' + f, t)
    }
}
const abaDe = r => nasAbas.get('id:' + String(r[C.lead] || '').trim()) || nasAbas.get('f:' + dig(r[C.fone])) || null
const naPlanilha = id => deHoje.filter(r => String(r[C.campId] || '').trim() === id).length
const deFormularioHoje = deHoje.filter(r => M.campanhas.some(c => c.id === String(r[C.campId] || '').trim()))
const semAbaHoje = deFormularioHoje.filter(r => !abaDe(r)).length
const metaHoje = M.campanhas.reduce((s, c) => s + c.hoje.leads, 0)
/** De qual campanha o lead veio — ou "landing", quando não passou pelo Meta. */
const origemCurta = r => {
    const c = M.campanhas.find(x => x.id === String(r[C.campId] || '').trim())
    if (!c) return 'landing'
    return c.nome.startsWith('Leads | Leilão') ? 'Jacamim' : c.nome.replace('LEAD - ', '')
}

// ── render ─────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const br = n => Number(n || 0).toLocaleString('pt-BR')
const num = v => String(v || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
const soma = arr => arr.reduce((s, v) => s + Number(num(v) || 0), 0)
const brl = n => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', VERM = '#A33'

const fonte = fs.readFileSync('scripts/gera-projecao-fechamento-agosto-2026.mjs', 'utf8')
const ini = fonte.indexOf('const CSS = `') + 'const CSS = `'.length
const CSS = fonte.slice(ini, fonte.indexOf('`', ini))
    .replace(/\$\{INK\}/g, INK).replace(/\$\{GRID\}/g, GRID).replace(/\$\{MUTED\}/g, MUTED)
    .replace(/\$\{GOLD\}/g, GOLD).replace(/\$\{VERM\}/g, VERM)

const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
const foot = p => `<div class="pfoot"><span>Bula Assessoria · Campanhas ativas em ${esc(M.dia)} · lido às ${esc(agora.split(', ')[1])}</span><span>${p}</span></div>`

const gastoTotal = soma(M.campanhas.map(c => c.hoje.gasto))
const orcadoTotal = soma(M.campanhas.map(c => c.orcamento_diario_somado))

const paginaCampanha = (c, folha) => `
<div class="page">
  <div class="head"><h2>${esc(c.nome.length > 42 ? c.nome.slice(0, 40) + '…' : c.nome)}</h2><div class="n">${esc(c.id)}</div></div>
  <table class="dense" style="margin-bottom:4mm">
    <tr><th style="width:30mm">Situação</th><td style="width:48mm">${esc(c.status)}</td><th style="width:26mm">Objetivo</th><td>${esc(c.objetivo)}</td></tr>
    <tr><th>Orçamento</th><td colspan="3">${esc(c.orcamento)} — soma dos conjuntos no ar: <strong>${esc(c.orcamento_diario_somado)}</strong></td></tr>
    <tr><th>No ar desde</th><td>${esc(c.inicio)}</td><th>Término</th><td>${c.termino ? esc(c.termino) : '<span class="tag warn">sem data de término</span>'}</td></tr>
    <tr><th>Última alteração</th><td colspan="3">${esc(c.alterada)}</td></tr>
    <tr><th>Formulário</th><td colspan="3">${esc(M.formulario.nome)} <span class="muted">· id ${esc(M.formulario.id)}</span></td></tr>
  </table>

  <h3 style="margin-top:3.5mm">O dia até agora</h3>
  <table class="dense">
    <thead><tr><th class="num">Gasto</th><th class="num">Impressões</th><th class="num">Alcance</th><th class="num">Freq.</th><th class="num">Cliques</th><th class="num">CTR</th><th class="num">CPM</th><th class="num">Leads</th><th class="num">Custo/lead</th></tr></thead>
    <tbody><tr>
      <td class="num"><strong>${esc(c.hoje.gasto)}</strong></td><td class="num">${br(c.hoje.impressoes)}</td><td class="num">${br(c.hoje.alcance)}</td>
      <td class="num">${esc(c.hoje.frequencia)}</td><td class="num">${br(c.hoje.cliques)}</td><td class="num">${esc(c.hoje.ctr)}</td>
      <td class="num">${esc(c.hoje.cpm)}</td><td class="num"><strong>${c.hoje.leads}</strong></td><td class="num">${esc(c.hoje.cpl)}</td>
    </tr></tbody>
  </table>

  <h3 style="margin-top:3.5mm">Conjuntos no ar</h3>
  <table class="dense">
    <thead><tr><th>Conjunto</th><th class="num">Orçam./dia</th><th class="num">Restante</th><th class="num">Gasto</th><th class="num">Impr.</th><th class="num">CTR</th><th class="num">CPM</th><th class="num">Leads</th><th class="num">Custo/lead</th></tr></thead>
    <tbody>${c.conjuntos.map(j => `<tr>
      <td><strong>${esc(j.nome)}</strong></td>
      <td class="num">${esc(j.orcamento)}</td><td class="num">${esc(j.restante)}</td>
      <td class="num">${esc(j.hoje.gasto)}</td><td class="num">${br(j.hoje.impressoes)}</td>
      <td class="num">${esc(j.hoje.ctr)}</td><td class="num">${esc(j.hoje.cpm)}</td>
      <td class="num">${j.hoje.leads}</td><td class="num">${esc(j.hoje.cpl)}</td></tr>`).join('')}</tbody>
  </table>
  <div class="box rule" style="margin-top:2.5mm;font-size:9px;line-height:1.42">
    <div class="t">Público e entrega</div>
    <p style="margin-bottom:1.4mm">Nos três: <strong>${esc(c.publico_comum)}</strong>. Meta de performance ${esc(c.conjuntos[0].meta_de_performance)}. ${esc(c.entrega_comum)}</p>
    ${c.conjuntos.map(j => `<p style="margin-bottom:1mm"><strong>${esc(j.nome.split('|')[0].trim())}</strong> — ${esc(j.publico)}.</p>`).join('')}
  </div>

  <h3 style="margin-top:3.5mm">Anúncios no ar</h3>
  <table class="dense">
    <thead><tr><th>Anúncio</th><th>Conjunto</th><th>Formato</th><th>Botão</th><th class="num">Gasto</th><th class="num">Impr.</th><th class="num">CTR</th><th class="num">Leads</th></tr></thead>
    <tbody>${c.anuncios.map(a => `<tr>
      <td>${esc(a.nome)}${a.nota ? ` <span class="tag warn">${esc(a.nota)}</span>` : ''}</td>
      <td class="muted">${esc(a.conjunto)}</td><td>${esc(a.tipo)}</td><td>${esc(a.cta)}</td>
      <td class="num">${esc(a.gasto)}</td><td class="num">${br(a.impressoes)}</td><td class="num">${esc(a.ctr)}</td>
      <td class="num">${a.leads}</td></tr>`).join('')}</tbody>
  </table>

  <h3 style="margin-top:3.5mm">Texto que está rodando</h3>
  <div class="box" style="font-size:9px;line-height:1.4;padding:3mm 4mm">
    ${c.criativo_titulo ? `<div class="t">${esc(c.criativo_titulo)}</div>` : ''}
    ${c.criativo_texto.split('@@').map(l => `<p style="margin-bottom:1.1mm">${esc(l)}</p>`).join('')}
  </div>
  ${foot(String(folha))}
</div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<title>Campanhas ativas hoje</title><style>${CSS}</style></head><body>

<div class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Campanhas<br>ativas hoje</h1>
  <div class="rule"></div>
  <div class="sub">O que está de fato no ar em ${esc(M.dia)} — configuração de cada campanha, conjunto e anúncio, e como o dia está indo até este momento.</div>
  <div class="meta">
    <div><span>Dia</span><strong>${esc(M.dia)} · Brasília</strong></div>
    <div><span>Lido em</span><strong>${esc(agora)}</strong></div>
    <div><span>Conta</span><strong>${esc(M.conta.nome)}</strong></div>
    <div><span>Campanhas no ar</span><strong>${M.campanhas.length}</strong></div>
  </div>
</div>

<div class="page">
  <div class="head"><h2>O dia até agora</h2><div class="n">Página 1</div></div>
  <p class="lead">Duas campanhas estão entregando em ${esc(M.dia)}, as duas de formulário e as duas na conta ${esc(M.conta.nome)}. As duas usam o <strong>mesmo formulário</strong> (${esc(M.formulario.nome)}).</p>
  <table>
    <thead><tr><th>Campanha</th><th class="num">Gasto</th><th class="num">Impr.</th><th class="num">Alcance</th><th class="num">Cliques</th><th class="num">CTR</th><th class="num">CPM</th><th class="num">Leads</th><th class="num">Custo/lead</th></tr></thead>
    <tbody>
      ${M.campanhas.map(c => `<tr>
        <td><strong>${esc(c.nome.length > 40 ? c.nome.slice(0, 38) + '…' : c.nome)}</strong><br><span class="muted">${esc(c.orcamento_diario_somado)} orçados</span></td>
        <td class="num">${esc(c.hoje.gasto)}</td><td class="num">${br(c.hoje.impressoes)}</td><td class="num">${br(c.hoje.alcance)}</td>
        <td class="num">${br(c.hoje.cliques)}</td><td class="num">${esc(c.hoje.ctr)}</td><td class="num">${esc(c.hoje.cpm)}</td>
        <td class="num"><strong>${c.hoje.leads}</strong></td><td class="num">${esc(c.hoje.cpl)}</td></tr>`).join('')}
      <tr class="total"><td>Total do dia</td><td class="num">${brl(gastoTotal)}</td>
        <td class="num">${br(M.campanhas.reduce((s, c) => s + c.hoje.impressoes, 0))}</td>
        <td class="num">${br(M.campanhas.reduce((s, c) => s + c.hoje.alcance, 0))}</td>
        <td class="num">${br(M.campanhas.reduce((s, c) => s + c.hoje.cliques, 0))}</td>
        <td class="num"></td><td class="num"></td>
        <td class="num">${metaHoje}</td>
        <td class="num">${brl(gastoTotal / Math.max(metaHoje, 1))}</td></tr>
    </tbody>
  </table>
  <p class="small">Orçamento diário somado dos conjuntos no ar: <strong>${brl(orcadoTotal)}</strong>. Gasto até agora: <strong>${brl(gastoTotal)}</strong> (${Math.round(gastoTotal / orcadoTotal * 100)}%). Erros de entrega no Meta: ${esc(M.erros_de_entrega)}.</p>

  <h3>Os leads do dia caíram na planilha</h3>
  <table class="dense">
    <thead><tr><th>Hora (Brasília)</th><th>Nome</th><th>Veio de</th><th>UF</th><th>Interesse</th><th>Cabeças</th><th>I.E.</th><th>Aba</th></tr></thead>
    <tbody>${deHoje.map(r => `<tr>
      <td>${esc(horaBR(r[C.ct]))}</td><td>${esc(r[C.nome])}</td><td class="muted">${esc(origemCurta(r))}</td><td>${esc(r[C.uf])}</td>
      <td>${esc(r[C.interesse])}</td><td>${esc(r[C.cab])}</td><td>${esc(r[C.ie])}</td>
      <td>${abaDe(r) ? `<span class="tag ok">${esc(abaDe(r))}</span>` : '<span class="tag warn">fora</span>'}</td></tr>`).join('')}</tbody>
  </table>
  <table class="dense" style="margin-top:3mm">
    <thead><tr><th>Checagem do dia</th><th class="num">Meta</th><th class="num">Planilha</th><th>Status</th></tr></thead>
    <tbody>
      ${M.campanhas.map(c => `<tr><td>${esc(c.nome.length > 40 ? c.nome.slice(0, 38) + '…' : c.nome)}</td>
        <td class="num">${c.hoje.leads}</td><td class="num">${naPlanilha(c.id)}</td>
        <td>${naPlanilha(c.id) === c.hoje.leads ? '<span class="tag ok">bate</span>'
          : naPlanilha(c.id) > c.hoje.leads ? '<span class="tag ok">planilha à frente</span>'
          : '<span class="tag warn">confere</span>'}</td></tr>`).join('')}
      <tr><td>Leads do formulário que não chegaram na aba de trabalho</td><td class="num">—</td><td class="num">${semAbaHoje}</td><td>${semAbaHoje === 0 ? '<span class="tag ok">nenhum</span>' : '<span class="tag warn">atenção</span>'}</td></tr>
      <tr><td>Linha crua do conector parada em alguma aba</td><td class="num">—</td><td class="num">${cruas}</td><td>${cruas === 0 ? '<span class="tag ok">nenhuma</span>' : '<span class="tag warn">atenção</span>'}</td></tr>
    </tbody>
  </table>
  <p class="small">${deFormularioHoje.length > metaHoje ? `<strong>A planilha está à frente do Meta:</strong> ${deFormularioHoje.length} leads de formulário já gravados contra ${metaHoje} que o relatório do Meta já contabilizou. O relatório do Meta atrasa alguns minutos — o lead chegou na planilha antes de aparecer no gerenciador. ` : ''}${deHoje.length > deFormularioHoje.length ? `Os outros ${deHoje.length - deFormularioHoje.length} lead(s) do dia vieram das landings, não do formulário do Meta. ` : ''}O "hoje" do Meta segue o fuso da conta (${esc(M.conta.fuso)}).</p>

  <h3>O que olhar antes de virar o dia</h3>
  <ol>
    <li><strong>A campanha do Jacamim não tem data de término</strong> e o pregão é <strong>05/09 às 12h</strong>. Ela precisa parar no dia do martelo — lead que chega depois não tem o que comprar.</li>
    <li><strong>Dois anúncios foram criados hoje às 17:15</strong> na campanha do Jacamim (AN02 e AN03, cópias do AN01). O AN03 já começou a entregar; o AN02 ainda não saiu. Como são cópias, carregam o mesmo formulário — a confirmação vem no primeiro lead de cada um.</li>
    <li><strong>O nome da campanha do Jacamim muda sozinho</strong> — tem um contador no fim (<em>T: 2.415</em>). Relatório agrupado por nome racha a mesma campanha em várias; agrupar por <span class="muted">campaign_id</span>.</li>
    <li>Na conta ${esc(M.ativas_sem_entrega.conta)}, ${esc(M.ativas_sem_entrega.observacao)}: ${esc(M.ativas_sem_entrega.campanhas.join(' · '))}.</li>
  </ol>
  ${foot('1')}
</div>

${M.campanhas.map((c, i) => paginaCampanha(c, i + 2)).join('')}

</body></html>`

const dir = path.join(os.homedir(), 'Desktop')
const pdfPath = path.join(fs.existsSync(dir) ? dir : 'outputs/campanhas-ativas-2026-09-02', 'Campanhas-ativas-hoje-2026-09-02.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
if (process.argv.includes('--png')) {
    const dirPng = 'outputs/campanhas-ativas-2026-09-02/paginas-hoje'
    fs.mkdirSync(dirPng, { recursive: true })
    const folhas = await page.$$('.page')
    for (let i = 0; i < folhas.length; i++) {
        const mm = await folhas[i].evaluate(el => el.getBoundingClientRect().height / (96 / 25.4))
        console.log(`folha ${i + 1}: ${mm.toFixed(0)}mm${mm > 298 ? '  <-- ESTOUROU' : ''}`)
        await folhas[i].screenshot({ path: `${dirPng}/folha-${i + 1}.png` })
    }
}
await browser.close()

console.log('PDF:', pdfPath)
console.log(`hoje: ${metaHoje} leads no Meta · ${deFormularioHoje.length} do formulário na planilha · ${deHoje.length} no total · ${cruas} linhas cruas`)
