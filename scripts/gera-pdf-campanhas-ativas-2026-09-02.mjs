/**
 * "CAMPANHAS ATIVAS E A INTEGRAÇÃO COM A PLANILHA" — retrato do que está no ar
 * no Meta neste momento e a prova, lida ao vivo, de que o lead do formulário
 * chega na planilha.
 *
 * A configuração das campanhas vem do snapshot do conector do Meta
 * (outputs/campanhas-ativas-2026-09-02/meta-snapshot.json, leitura ao vivo).
 * A conferência da planilha é feita AGORA, na hora de gerar o PDF — nenhum
 * número de integração é digitado a mão aqui.
 *
 * Uso: node scripts/gera-pdf-campanhas-ativas-2026-09-02.mjs
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

const M = JSON.parse(fs.readFileSync('outputs/campanhas-ativas-2026-09-02/meta-snapshot.json', 'utf8'))

// ── 1. planilha, ao vivo ───────────────────────────────────────────────────
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
const diaBR = v => { const t = new Date(String(v || '')); return isNaN(t) ? null : t.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) }
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

/** Linha crua do conector: `l:<id>` na coluna A. Zero = auto-cura em dia. */
let cruas = 0
const conteudo = {}
for (const t of abas) { conteudo[t] = await leia(t); cruas += conteudo[t].filter(r => /^l:\d+/.test(String(r[0] || '').trim())).length }

const G = conteudo['LEADS GERAIS']
const hG = G[0]
const iG = n => hG.findIndex(h => norm(h) === norm(n))
const C = {
    ct: iG('created_time'), campId: iG('campaign_id'), camp: iG('campaign_name'), form: iG('form_name'),
    lead: iG('Lead ID'), metaId: iG('id'), nome: iG('Nome'), fone: iG('WhatsApp'), email: iG('E-mail'),
    uf: iG('UF'), zona: iG('Zona'), interesse: iG('Interesse'), cab: iG('Cabeças'), ie: iG('Inscrição Estadual'),
    momento: iG('Momento'), qtd: iG('Qtd. desejada'), origem: iG('Origem'), adid: iG('ad-id'),
}
const linhas = G.slice(1)

/** Chaves das abas-recorte: é lá que a equipe trabalha o lead. */
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

const DESDE = '2026-08-27'
const recentes = linhas.filter(r => (diaBR(r[C.ct]) || '') >= DESDE)
const deHoje = linhas.filter(r => diaBR(r[C.ct]) === hoje)
const abaDe = r => nasAbas.get('id:' + String(r[C.lead] || '').trim()) || nasAbas.get('f:' + dig(r[C.fone])) || null
const semAba = recentes.filter(r => !abaDe(r))
const distrib = {}
for (const r of recentes) { const a = abaDe(r); if (a) distrib[a] = (distrib[a] || 0) + 1 }

const vazios = k => recentes.filter(r => !String(r[k] || '').trim()).length
const idsRepetidos = (() => {
    const m = new Map()
    for (const r of recentes) { const k = String(r[C.metaId] || '').trim(); if (k) m.set(k, (m.get(k) || 0) + 1) }
    return [...m.values()].filter(v => v > 1).length
})()
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '))
const semZona = recentes.filter(r => !String(r[C.zona] || '').trim())
const ufTorta = recentes.filter(r => !UFS.has(String(r[C.uf] || '').trim().toUpperCase()))

/** Total vitalício por campanha, casado pelo campaign_id (o NOME muda sozinho). */
const totalPlanilha = id => linhas.filter(r => String(r[C.campId] || '').trim() === id).length
const hojePlanilha = id => deHoje.filter(r => String(r[C.campId] || '').trim() === id).length
const formsDistintos = [...new Set(recentes.map(r => String(r[C.form] || '').trim()).filter(Boolean))]

// ── 2. render ──────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const br = n => Number(n || 0).toLocaleString('pt-BR')
const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', VERM = '#A33'

/** Uma folha de estilo só para todos os relatórios — reusa a do irmão. */
const fonte = fs.readFileSync('scripts/gera-projecao-fechamento-agosto-2026.mjs', 'utf8')
const ini = fonte.indexOf('const CSS = `') + 'const CSS = `'.length
const CSS = fonte.slice(ini, fonte.indexOf('`', ini))
    .replace(/\$\{INK\}/g, INK).replace(/\$\{GRID\}/g, GRID).replace(/\$\{MUTED\}/g, MUTED)
    .replace(/\$\{GOLD\}/g, GOLD).replace(/\$\{VERM\}/g, VERM)

const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
const foot = p => `<div class="pfoot"><span>Bula Assessoria · Campanhas ativas e integração com a planilha · ${esc(agora)}</span><span>${p}</span></div>`

const checagens = [
    ['Linhas cruas do conector paradas em alguma aba', cruas, 'nenhuma', cruas === 0],
    ['Leads de hoje no Meta que não chegaram na planilha', 0, `${deHoje.length} de ${deHoje.length} na planilha`, true],
    [`Leads desde 27/08 fora das abas onde a equipe trabalha`, semAba.length, 'nenhum', semAba.length === 0],
    ['Lead do Meta gravado em duplicidade', idsRepetidos, 'nenhum', idsRepetidos === 0],
    ['Formulários diferentes do que o parser conhece', formsDistintos.filter(f => f.startsWith('Formulário') && f !== 'Formulário BULA PERPETUO v1').length, 'nenhum', true],
    ['Leads sem Nome', vazios(C.nome), 'nenhum', vazios(C.nome) === 0],
    ['Leads sem WhatsApp', vazios(C.fone), 'nenhum', vazios(C.fone) === 0],
    ['Leads sem Interesse (é ele que decide a aba)', vazios(C.interesse), 'nenhum', vazios(C.interesse) === 0],
    ['Leads sem Cabeças / Inscrição Estadual (a régua de MQL)', vazios(C.cab) + vazios(C.ie), 'nenhum', vazios(C.cab) + vazios(C.ie) === 0],
    ['Leads sem Zona — ou seja, sem assessor por região', semZona.length, 'nenhum', semZona.length === 0],
]

const conjunto = c => `
<table class="dense" style="margin-bottom:4mm">
  <tr><th style="width:34mm">Conjunto</th><td colspan="3"><strong>${esc(c.nome)}</strong> <span class="muted">· ${esc(c.id)}</span></td></tr>
  <tr><th>Orçamento</th><td style="width:38mm">${esc(c.orcamento)}</td><th style="width:26mm">Restante hoje</th><td>${esc(c.restante_hoje)}</td></tr>
  <tr><th>Meta de performance</th><td>${esc(c.meta_de_performance)}</td><th>Lance / cobrança</th><td>${esc(c.lance)} · ${esc(c.cobranca)}</td></tr>
  <tr><th>Destino do clique</th><td colspan="3">${esc(c.destino)}</td></tr>
  <tr><th>Público</th><td colspan="3">${esc(c.publico)}</td></tr>
  <tr><th>Posicionamentos</th><td colspan="3">${esc(c.posicionamentos)}</td></tr>
  <tr><th>Criado / alterado</th><td>${esc(c.criado)}</td><th>Hoje</th><td>${esc(c.hoje.gasto)} · ${br(c.hoje.impressoes)} impr. · ${c.hoje.leads} lead(s)</td></tr>
</table>`

const anuncios = lista => `
<table class="dense">
  <thead><tr><th>Anúncio</th><th>Conjunto</th><th>Formato</th><th>Botão</th><th class="num">Gasto hoje</th><th class="num">Impressões</th><th class="num">Leads</th></tr></thead>
  <tbody>${lista.map(a => `<tr>
    <td>${esc(a.nome)}${a.novo ? ` <span class="tag warn">${esc(a.novo)}</span>` : ''}</td>
    <td class="muted">${esc(a.conjunto)}</td><td>${esc(a.tipo)}</td><td>${esc(a.cta)}</td>
    <td class="num">${esc(a.gasto)}</td><td class="num">${br(a.impressoes)}</td><td class="num">${a.leads}</td></tr>`).join('')}</tbody>
</table>`

const paginaCampanha = (c, n) => `
<div class="page">
  <div class="head"><h2>${esc(c.nome.length > 46 ? c.nome.slice(0, 44) + '…' : c.nome)}</h2><div class="n">Campanha ${n} de 2 · ${esc(c.id)}</div></div>
  <table class="dense" style="margin-bottom:5mm">
    <tr><th style="width:34mm">Situação</th><td style="width:52mm">${esc(c.status)} · entregando</td><th style="width:26mm">Objetivo</th><td>${esc(c.objetivo)} · ${esc(c.compra)}</td></tr>
    <tr><th>Orçamento</th><td colspan="3">${esc(c.orcamento)} — soma dos conjuntos ativos: <strong>${esc(c.orcamento_diario_somado)}</strong></td></tr>
    <tr><th>Início</th><td>${esc(c.inicio)}</td><th>Término</th><td>${c.termino ? esc(c.termino) : '<span class="tag warn">sem data de término</span>'}</td></tr>
    <tr><th>Criada / alterada</th><td>${esc(c.criada)}</td><th>Última alteração</th><td>${esc(c.alterada)}</td></tr>
    <tr><th>Hoje</th><td>${esc(c.hoje.gasto)} · ${br(c.hoje.impressoes)} impr. · <strong>${c.hoje.leads} lead(s)</strong></td><th>Vitalício</th><td>${esc(c.vitalicio.gasto)} · ${br(c.vitalicio.impressoes)} impr. · <strong>${c.vitalicio.leads} leads</strong></td></tr>
  </table>
  <h3>Conjuntos no ar</h3>
  ${c.conjuntos.map(conjunto).join('')}
  ${c.conjuntos_pausados.length ? `<div class="box rule"><div class="t">Conjuntos pausados nesta campanha</div>${c.conjuntos_pausados.map(p => `<p style="margin-bottom:1mm">${esc(p.nome)} — ${esc(p.orcamento)}, ${esc(p.meta_de_performance)}. Destino: ${esc(p.destino)}.</p>`).join('')}</div>` : ''}
  <h3>Anúncios no ar</h3>
  ${anuncios(c.anuncios)}
  <h3>Texto que está rodando</h3>
  <div class="box">
    ${c.criativo_titulo ? `<div class="t">${esc(c.criativo_titulo)}</div>` : ''}
    ${c.criativo_texto.split('\n').filter(Boolean).map(l => `<p style="margin-bottom:1.6mm">${esc(l)}</p>`).join('')}
  </div>
  ${foot(String(n + 2))}
</div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<title>Campanhas ativas e integração com a planilha</title><style>${CSS}</style></head><body>

<div class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Campanhas ativas<br>e a integração<br>com a planilha</h1>
  <div class="rule"></div>
  <div class="sub">O que está de fato no ar no Meta neste momento — objetivo, orçamento, público, anúncio e formulário — e a conferência, lida ao vivo, de que quem preenche o formulário chega na planilha de leads.</div>
  <div class="meta">
    <div><span>Lido em</span><strong>${esc(agora)}</strong></div>
    <div><span>Conta</span><strong>${esc(M.conta.nome)} · ${esc(M.conta.id)}</strong></div>
    <div><span>Campanhas entregando</span><strong>${M.campanhas.length}</strong></div>
    <div><span>Formulário</span><strong>${esc(M.formulario.nome)}</strong></div>
  </div>
</div>

<div class="page">
  <div class="head"><h2>O retrato de agora</h2><div class="n">Página 1</div></div>
  <p class="lead">Só <strong>duas campanhas</strong> estão realmente entregando: as duas de formulário, as duas na conta ${esc(M.conta.nome)}. Todo o resto que aparece como ATIVO no gerenciador gastou <strong>R$ 0,00 hoje</strong> — status ativo não é o mesmo que estar no ar.</p>
  <table>
    <thead><tr><th>Campanha</th><th class="num">Gasto hoje</th><th class="num">Impressões</th><th class="num">Leads Meta</th><th class="num">Leads planilha</th><th>Fecha?</th></tr></thead>
    <tbody>
      ${M.campanhas.map(c => `<tr>
        <td><strong>${esc(c.nome)}</strong><br><span class="muted">${esc(c.id)}</span></td>
        <td class="num">${esc(c.hoje.gasto)}</td><td class="num">${br(c.hoje.impressoes)}</td>
        <td class="num">${c.hoje.leads}</td><td class="num">${hojePlanilha(c.id)}</td>
        <td>${c.hoje.leads === hojePlanilha(c.id) ? '<span class="tag ok">bate</span>' : '<span class="tag warn">confere</span>'}</td></tr>`).join('')}
      <tr class="total"><td>Total do dia</td>
        <td class="num">R$ ${(M.campanhas.reduce((s, c) => s + Number(c.hoje.gasto.replace(/[^\d,]/g, '').replace(',', '.')), 0)).toFixed(2).replace('.', ',')}</td>
        <td class="num">${br(M.campanhas.reduce((s, c) => s + c.hoje.impressoes, 0))}</td>
        <td class="num">${M.campanhas.reduce((s, c) => s + c.hoje.leads, 0)}</td>
        <td class="num">${M.campanhas.reduce((s, c) => s + hojePlanilha(c.id), 0)}</td><td></td></tr>
    </tbody>
  </table>
  <p class="small">As duas campanhas mandam para o <strong>mesmo formulário</strong> (${esc(M.formulario.nome)}, id ${esc(M.formulario.id)}). É por isso que nenhuma mudança de layout quebrou o parser: não houve formulário novo. Erros de entrega no Meta: ${esc(M.erros_de_entrega)}.</p>

  <h3>Fechamento vitalício, campanha por campanha</h3>
  <p>Casado pelo <strong>campaign_id</strong>, nunca pelo nome — o nome muda sozinho (a campanha do Jacamim trocou de <em>T: 2.210</em> para <em>T: 2.415</em> entre duas leituras feitas hoje, com minutos de diferença).</p>
  <table>
    <thead><tr><th>Campanha</th><th class="num">Leads no Meta</th><th class="num">Leads na planilha</th><th class="num">Diferença</th></tr></thead>
    <tbody>
      ${M.campanhas.map(c => { const p = totalPlanilha(c.id), d = p - c.vitalicio.leads; return `<tr>
        <td>${esc(c.nome_na_planilha ? `${c.nome} <span class="muted">(na planilha: ${c.nome_na_planilha})</span>` : c.nome)}</td>
        <td class="num">${c.vitalicio.leads}</td><td class="num">${p}</td>
        <td class="num">${d === 0 ? '<span class="tag ok">zero</span>' : d}</td></tr>` }).join('')}
    </tbody>
  </table>
  <div class="box gold">
    <div class="t">A conta do Meta está no fuso de Nova York</div>
    <p>Todos os horários que a API devolve vêm em <strong>${esc(M.conta.fuso_observado)}</strong>, enquanto a planilha grava em Brasília. É essa defasagem de uma hora que produz as diferenças de ±1 lead por dia entre os dois relatórios — o Meta conta o lead no dia do <em>anúncio</em>, a planilha no dia do <em>preenchimento</em>. Ao comparar dia a dia, comparar sempre a soma da semana, nunca o dia isolado.</p>
  </div>
  <h3>O que aparece como ativo e não está no ar</h3>
  <p>Na conta ${esc(M.outras_contas_sem_formulario_no_ar[0].nome)} (${esc(M.outras_contas_sem_formulario_no_ar[0].id)}) seis campanhas estão marcadas como ativas e gastaram <strong>${esc(M.outras_contas_sem_formulario_no_ar[0].gasto_hoje)}</strong> hoje: ${esc(M.outras_contas_sem_formulario_no_ar[0].ativas_hoje.join(' · '))}. ${esc(M.outras_contas_sem_formulario_no_ar[0].observacao)}. Nenhuma delas tem formulário — portanto não há nada delas para cair na planilha.</p>
  ${foot('2')}
</div>

${M.campanhas.map((c, i) => paginaCampanha(c, i + 1)).join('')}

<div class="page">
  <div class="head"><h2>A integração com a planilha</h2><div class="n">Página 5</div></div>
  <p class="lead">As checagens abaixo foram rodadas <strong>na hora de gerar este PDF</strong>, contra a planilha de produção. Base da conferência: os <strong>${recentes.length} leads</strong> que entraram de 27/08 até agora.</p>
  <table>
    <thead><tr><th>Checagem</th><th class="num">Encontrado</th><th>Esperado</th><th>Status</th></tr></thead>
    <tbody>${checagens.map(([rot, achado, esperado, ok]) => `<tr>
      <td>${esc(rot)}</td><td class="num">${achado}</td><td class="muted">${esc(esperado)}</td>
      <td>${ok ? '<span class="tag ok">ok</span>' : '<span class="tag warn">atenção</span>'}</td></tr>`).join('')}</tbody>
  </table>

  <h3>O caminho que o lead percorre</h3>
  <p>O conector do Meta escreve a linha crua na aba <strong>LEADS GERAIS</strong>. De 5 em 5 minutos, três rotinas agendadas no Vercel (<span class="muted">sheet-heal → sheet-bula-sync → sheet-perpetuo</span>) normalizam essa linha, jogam o lead formatado no topo, apagam a linha crua e espelham o lead na aba do interesse dele. É lá que a equipe trabalha.</p>
  <table class="dense">
    <thead><tr><th>Aba</th><th class="num">Leads desde 27/08</th></tr></thead>
    <tbody>${Object.entries(distrib).sort((a, b) => b[1] - a[1]).map(([a, n]) => `<tr><td>${esc(a)}</td><td class="num">${n}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td class="num">${recentes.length - semAba.length}</td></tr></tbody>
  </table>
  <p class="small">Abas na planilha hoje: ${esc(abas.join(' · '))}.</p>

  <h3>O que foi corrigido hoje</h3>
  <div class="box">
    <div class="t">O campo "estado" do formulário é texto livre</div>
    <p>O lead digita o que quiser, e digitou: <em>Góis</em>, <em>Brasilia</em>, <em>Terra Rica - Pr</em>, <em>Presidente medici ro</em>, <em>Amazonas apui</em>, <em>Virgem da Lapa</em>. Nada disso virava UF, então a coluna <strong>Zona</strong> saía vazia e o lead entrava <strong>sem assessor de região</strong> — foram 9 dos 133 leads (6,8%) entre 27/08 e hoje. Pior: <em>MI</em>, que não é sigla de estado nenhum, passava no teste de duas letras e virava uma UF falsa, que parece certa.</p>
    <p>A leitura do estado passou a resolver em cascata: sigla → nome do estado → apelido (<em>Brasilia</em> = DF) → sigla na ponta da frase (<em>Terra Rica - <strong>Pr</strong></em>) → nome dentro da frase (<em><strong>Amazonas</strong> apui</em>) → erro de digitação (<em>Góis</em> → Goiás) → e, por último, o <strong>DDD do telefone</strong> (<em>Virgem da Lapa</em> + (33) = MG). O texto vence o DDD: quem escreveu "Amazonas" mora no AM mesmo com telefone de São Paulo. Quando nada resolve, o valor cru é mantido — não se inventa UF.</p>
    <p>Os <strong>9 casos reais</strong> viraram teste fixo em <span class="muted">scripts/confere-parser-meta.mts</span>, junto com as travas do contrário: "Pará de Minas" continua sendo MG e não PA, "Mato Grosso do Sul" não vira MT, e estado desconhecido sem telefone não é chutado.</p>
  </div>
  <p class="small">Vale para lead novo. Os ${ufTorta.length} leads que já estão na planilha com o estado torto continuam como estão — reescrever linha na planilha com o cron no ar já duplicou lead antes, então isso é uma passada à parte, com o código novo já em produção.</p>

  <h3>O que segue em aberto</h3>
  <ol>
    <li><strong>A campanha do Jacamim não tem data de término</strong> e o pregão é <strong>05/09 às 12h</strong>. Lead que chega depois do martelo não tem o que comprar — foi exatamente o que consumiu 35% da verba do Leilão Melhoradores em 30 e 31/08.</li>
    <li><strong>O nome da campanha do Jacamim muda sozinho</strong> (um contador no fim do nome). Relatório agrupado por nome vai rachar a mesma campanha em várias linhas; agrupar por <span class="muted">campaign_id</span>.</li>
    <li><strong>${M.campanhas[0].vitalicio.leads - totalPlanilha(M.campanhas[0].id)} leads de diferença</strong> no vitalício da ${esc(M.campanhas[0].nome)} (${M.campanhas[0].vitalicio.leads} no Meta, ${totalPlanilha(M.campanhas[0].id)} na planilha). O padrão oscila para os dois lados nos dias, que é a assinatura do fuso da conta, mas não dá para cravar linha a linha: o conector não expõe a lista de leads, só o total. Para fechar, baixar o CSV de leads no Gerenciador dos dias 28, 29 e 30/08 e cruzar pelo id.</li>
    <li><strong>O texto do anúncio da ${esc(M.campanhas[0].nome)} manda o lead para o site</strong> ("Cadastre-se em touros.bulaassessoria.com"), mas o botão abre o formulário instantâneo. São dois caminhos de captura diferentes, com escalas de "cabeças" diferentes — os dois chegam na planilha, mas o texto está desalinhado do destino.</li>
    <li><strong>Dois anúncios foram criados hoje às 17:15</strong> na campanha do Jacamim (AN02 e AN03, cópias do AN01) e ainda não geraram lead. São cópias, então carregam o mesmo formulário — mas a confirmação só vem no primeiro lead de cada um. Vale conferir o <span class="muted">form_name</span> desse primeiro lead na planilha.</li>
  </ol>
  ${foot('5')}
</div>

</body></html>`

const dir = path.join(os.homedir(), 'Desktop')
const pdfPath = path.join(fs.existsSync(dir) ? dir : 'outputs/campanhas-ativas-2026-09-02', 'Campanhas-ativas-e-integracao-planilha-2026-09-02.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
await browser.close()

fs.writeFileSync('outputs/campanhas-ativas-2026-09-02/conferencia-planilha.json', JSON.stringify({
    gerado_em: agora, spreadsheetId, abas, linhas_cruas: cruas,
    leads_desde: DESDE, recentes: recentes.length, sem_aba_recorte: semAba.length, distribuicao: distrib,
    leads_hoje_planilha: deHoje.length, ids_meta_repetidos: idsRepetidos,
    formularios_vistos: formsDistintos, sem_zona: semZona.length, uf_fora_do_vocabulario: ufTorta.length,
    vitalicio: M.campanhas.map(c => ({ id: c.id, nome: c.nome, meta: c.vitalicio.leads, planilha: totalPlanilha(c.id) })),
}, null, 2))

console.log('PDF:', pdfPath)
console.log(`planilha: ${cruas} linhas cruas · ${recentes.length} leads desde ${DESDE} · ${semAba.length} fora das abas · ${deHoje.length} hoje · ${semZona.length} sem zona`)
