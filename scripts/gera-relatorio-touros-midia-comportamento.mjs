// Relatório completo da campanha LEAD - PERPETUO TOURO: mídia (Meta Ads) +
// comportamento na landing (PostHog). Data-base 25/07/2026, 14h20 (MS).
//
// Fontes:
// - Conector oficial do Meta Ads, conta CA2 - Bula 360 (2705134163151418),
//   campanha 120249455058620708.
// - PostHog projeto 430113 via HogQL, janela 24/07 00h00 UTC → 25/07 18h20 UTC
//   (= 23/07 21h → 25/07 14h20 no horário de MS, fuso da conta de anúncio).
//
// FUSO: a máquina está em Brasília (UTC-3), a conta de anúncio em MS (UTC-4) e
// o PostHog devolve UTC. Tudo que é exibido está convertido para MS — é o fuso
// em que o Meta reporta e em que a equipe opera.
//
// Saídas:
// - outputs/relatorio-touros-midia-comportamento-2026-07-25.{html,pdf}
// - Desktop/Relatorio Campanha Touros - Midia e Comportamento - 25-07-2026.pdf
//
// Uso:
//   node scripts/gera-relatorio-touros-midia-comportamento.mjs

import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'outputs')
const desktop = join(process.env.USERPROFILE || '', 'Desktop')
const outputStem = 'relatorio-touros-midia-comportamento-2026-07-25'
const desktopStem = 'Relatorio Campanha Touros - Midia e Comportamento - 25-07-2026'
mkdirSync(outputDir, { recursive: true })

// ---------------------------------------------------------------------------
// 1) Mídia — Meta Ads (conector oficial)
// ---------------------------------------------------------------------------

const meta = {
  campanha: 'LEAD - PERPETUO TOURO',
  id: '120249455058620708',
  conta: 'CA2 - Bula 360 (2705134163151418)',
  objetivo: 'OUTCOME_LEADS — otimizada para a conversão de pixel "MQL Perpetuo Touros"',
  inicio: '24/07/2026 13h51',
  fim: 'sem data de encerramento',
  investido: 237.09,
  impressoes: 12594,
  alcance: 8452,
  frequencia: 1.490062,
  cliques: 299,
  ctr: 2.37,
  cpc: 0.79,
  cpm: 18.83,
  engajamentos: 3533,
  mqlAtribuido: 1,
}

// Cliques do Meta por criativo (métrica "cliques", que inclui interação no
// próprio anúncio — não é clique de saída).
const metaCriativos = {
  'video-perpetuo-touro03': { investido: 128.98, impressoes: 6932, alcance: 5704, cliques: 187, ctr: 2.70, cpm: 18.61 },
  'video-perpetuo-touro02': { investido: 64.03, impressoes: 3315, alcance: 2678, cliques: 62, ctr: 1.87, cpm: 19.32 },
  'video-perpetuo-touro01': { investido: 44.08, impressoes: 2347, alcance: 1939, cliques: 50, ctr: 2.13, cpm: 18.78 },
}

// ---------------------------------------------------------------------------
// 2) Comportamento — PostHog (HogQL)
// ---------------------------------------------------------------------------

const ph = {
  views: 335,
  pessoas: 267,
  formIniciado: 25,
  pessoasForm: 22,
  submitTentado: 27,
  pessoasSubmit: 12,
  leadEnviado: 12,
  pessoasLead: 10,
  validacaoFalhou: 31,
  cliques: 702,
  rageclicks: 20,
  pessoasRageclick: 10,
  mqlPessoas: 4,
  naoMqlPessoas: 6,
}

// Acessos por hora (UTC, como o PostHog devolve) — convertidos para MS na
// montagem do gráfico.
const porHoraUtc = [
  ['2026-07-24T00', 2, 1, 0, 0], ['2026-07-24T01', 6, 3, 1, 0], ['2026-07-24T09', 1, 1, 0, 0],
  ['2026-07-24T10', 1, 1, 0, 0], ['2026-07-24T12', 1, 1, 1, 0], ['2026-07-24T13', 2, 2, 1, 1],
  ['2026-07-24T14', 2, 2, 0, 0], ['2026-07-24T15', 10, 4, 0, 1], ['2026-07-24T16', 12, 7, 1, 1],
  ['2026-07-24T17', 29, 25, 0, 0], ['2026-07-24T18', 68, 52, 8, 0], ['2026-07-24T19', 12, 12, 1, 0],
  ['2026-07-24T20', 1, 1, 0, 0], ['2026-07-24T22', 2, 1, 0, 0], ['2026-07-24T23', 3, 3, 0, 0],
  ['2026-07-25T00', 11, 9, 1, 1], ['2026-07-25T01', 19, 16, 1, 0], ['2026-07-25T02', 8, 8, 0, 0],
  ['2026-07-25T03', 9, 7, 1, 0], ['2026-07-25T04', 2, 2, 0, 0], ['2026-07-25T08', 1, 1, 0, 0],
  ['2026-07-25T09', 6, 6, 0, 0], ['2026-07-25T10', 11, 10, 0, 0], ['2026-07-25T11', 27, 24, 5, 3],
  ['2026-07-25T12', 20, 17, 0, 1], ['2026-07-25T13', 24, 22, 1, 1], ['2026-07-25T14', 17, 15, 2, 2],
  ['2026-07-25T15', 15, 15, 1, 1], ['2026-07-25T16', 7, 7, 0, 0], ['2026-07-25T17', 4, 4, 0, 0],
  ['2026-07-25T18', 2, 2, 0, 0],
]

// Funil por criativo: cada pessoa herda o utm_content do primeiro acesso dela.
const funilCriativo = [
  { criativo: 'video-perpetuo-touro03', visitantes: 138, form: 13, leads: 4, mql: 1, rage: 15 },
  { criativo: 'video-perpetuo-touro02', visitantes: 56, form: 2, leads: 2, mql: 0, rage: 2 },
  { criativo: 'video-perpetuo-touro01', visitantes: 32, form: 1, leads: 0, mql: 0, rage: 1 },
  { criativo: '{{ad.name}} (UTM quebrada)', visitantes: 4, form: 1, leads: 1, mql: 1, rage: 0 },
  { criativo: 'sem UTM (orgânico/direto)', visitantes: 37, form: 5, leads: 3, mql: 2, rage: 2 },
]

const origens = [
  { nome: 'instagram.com', views: 112, pessoas: 105 },
  { nome: 'l.facebook.com', views: 80, pessoas: 57 },
  { nome: 'm.facebook.com', views: 61, pessoas: 54 },
  { nome: 'direto / desconhecido', views: 55, pessoas: 27 },
  { nome: 'www.facebook.com', views: 13, pessoas: 13 },
  { nome: 'facebook.com', views: 10, pessoas: 10 },
  { nome: 'www.google.com', views: 1, pessoas: 1 },
]

const dispositivos = [
  { nome: 'Mobile', views: 287, pessoas: 246 },
  { nome: 'Desktop', views: 48, pessoas: 21 },
]

const sistemas = [
  { os: 'Android', nav: 'Chrome', views: 175 },
  { os: 'iOS', nav: 'Mobile Safari', views: 100 },
  { os: 'Windows', nav: 'Chrome', views: 31 },
  { os: 'Mac OS X', nav: 'Chrome', views: 14 },
  { os: 'iOS', nav: 'navegador do Facebook', views: 10 },
  { os: 'outros', nav: '—', views: 5 },
]

const ufs = [
  { uf: 'Minas Gerais', views: 79, pessoas: 42, leads: 2 },
  { uf: 'São Paulo', views: 52, pessoas: 46, leads: 1 },
  { uf: 'Bahia', views: 25, pessoas: 20, leads: 0 },
  { uf: 'Paraná', views: 20, pessoas: 15, leads: 2 },
  { uf: 'Maranhão', views: 14, pessoas: 12, leads: 1 },
  { uf: 'Rio de Janeiro', views: 13, pessoas: 11, leads: 1 },
  { uf: 'Mato Grosso', views: 12, pessoas: 10, leads: 0 },
  { uf: 'Pará', views: 12, pessoas: 11, leads: 0 },
  { uf: 'Goiás', views: 11, pessoas: 9, leads: 0 },
  { uf: 'Distrito Federal', views: 9, pessoas: 9, leads: 0 },
]
const leadsOutrasUfs = [
  { uf: 'Ceará', leads: 1 }, { uf: 'Paraíba', leads: 1 }, { uf: 'Sergipe', leads: 1 },
]

const passos = [
  { passo: '1 · Nome, WhatsApp e consentimento', tentativas: 31, concluiram: 16 },
  { passo: '2 · UF e nº de cabeças', tentativas: 17, concluiram: 14 },
  { passo: '3 · Nº de touros e Inscrição Estadual', tentativas: 27, concluiram: 12 },
]

const travas = [
  { campos: 'quantos touros + Inscrição Estadual', etapa: 'passo 3', eventos: 13, pessoas: 11 },
  { campos: 'nome + WhatsApp + consentimento', etapa: 'passo 1', eventos: 12, pessoas: 8 },
  { campos: 'UF + nº de cabeças', etapa: 'passo 2', eventos: 3, pessoas: 3 },
  { campos: 'só o consentimento do WhatsApp', etapa: 'passo 1', eventos: 2, pessoas: 2 },
  { campos: 'nome + WhatsApp + e-mail + consentimento', etapa: 'passo 1', eventos: 1, pessoas: 1 },
]

const cliquesTop = [
  { alvo: 'CTA "Quero o touro certo pro meu rebanho"', cliques: 93, pessoas: 25 },
  { alvo: 'Botão "Continuar" (avançar passo)', cliques: 39, pessoas: 20 },
  { alvo: 'CTA "Garanta o touro certo pro seu rebanho"', cliques: 27, pessoas: 2 },
  { alvo: 'Checkbox de consentimento do WhatsApp', cliques: 21, pessoas: 7 },
  { alvo: 'CTA "Quero o touro certo"', cliques: 14, pessoas: 11 },
  { alvo: 'Opção "Sim"', cliques: 10, pessoas: 8 },
  { alvo: 'Campo "Nome completo"', cliques: 8, pessoas: 4 },
  { alvo: 'Link "Termos"', cliques: 7, pessoas: 6 },
  { alvo: 'Link "Privacidade"', cliques: 4, pessoas: 4 },
  { alvo: 'Aviso "Falha ao enviar. Tente novamente."', cliques: 3, pessoas: 1 },
]

const rageTop = [
  { alvo: 'CTA "Quero o touro certo pro meu rebanho"', n: 8, pessoas: 2 },
  { alvo: '(elemento sem texto)', n: 3, pessoas: 3 },
  { alvo: 'Link "Privacidade"', n: 2, pessoas: 2 },
  { alvo: 'Checkbox de consentimento do WhatsApp', n: 2, pessoas: 1 },
  { alvo: 'Link "Termos"', n: 1, pessoas: 1 },
  { alvo: 'Campo "Nome completo"', n: 1, pessoas: 1 },
  { alvo: 'CTA "Garanta o touro certo pro seu rebanho"', n: 1, pessoas: 1 },
  { alvo: 'Aviso "Falha ao enviar. Tente novamente."', n: 1, pessoas: 1 },
]

const abandono = [
  { onde: 'Saiu sem tocar no formulário', pessoas: 243 },
  { onde: 'Parou num erro de validação', pessoas: 6 },
  { onde: 'Abriu o formulário e parou', pessoas: 5 },
  { onde: 'Avançou um passo e parou', pessoas: 1 },
  { onde: 'Tentou enviar e não conseguiu', pessoas: 1 },
  { onde: 'Viu um produto e parou', pessoas: 1 },
]

const engajamento = { umaVisita: 234, duas: 20, tresOuMais: 13 }
const tempoAteLead = { medianaSeg: 103, mediaSeg: 1432, convertidos: 10 }
const datacenter = [
  { cidade: 'Prineville (datacenter Meta, EUA)', views: 6 },
  { cidade: 'Boardman (datacenter AWS, EUA)', views: 5 },
  { cidade: 'Clonee (datacenter Meta, Irlanda)', views: 4 },
]

// ---------------------------------------------------------------------------
// 3) Derivados
// ---------------------------------------------------------------------------

const r2 = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (v, d = 1) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`
const dec = (v, d = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const mmss = (s) => {
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}min` : `${m}min${String(r).padStart(2, '0')}s`
}

const pagos = funilCriativo.filter((f) => f.criativo !== 'sem UTM (orgânico/direto)')
const organico = funilCriativo.find((f) => f.criativo === 'sem UTM (orgânico/direto)')
const visitantesPagos = pagos.reduce((a, f) => a + f.visitantes, 0)
const formPagos = pagos.reduce((a, f) => a + f.form, 0)
const leadsPagos = pagos.reduce((a, f) => a + f.leads, 0)
const mqlPagos = pagos.reduce((a, f) => a + f.mql, 0)

const custoVisitante = r2(meta.investido / visitantesPagos)
const custoForm = r2(meta.investido / formPagos)
const custoLead = r2(meta.investido / leadsPagos)
const custoMql = r2(meta.investido / mqlPagos)
const aproveitamentoClique = r2((visitantesPagos / meta.cliques) * 100)

const taxaForm = r2((ph.pessoasForm / ph.pessoas) * 100)
const taxaLead = r2((ph.pessoasLead / ph.pessoas) * 100)
const taxaMql = r2((ph.mqlPessoas / ph.pessoas) * 100)
const taxaFormLead = r2((ph.pessoasLead / ph.pessoasForm) * 100)
const perdaSubmit = ph.pessoasSubmit - ph.pessoasLead
const shareMobile = r2((dispositivos[0].pessoas / (dispositivos[0].pessoas + dispositivos[1].pessoas)) * 100)
const cliquesPorPessoaCta = r2(cliquesTop[0].cliques / cliquesTop[0].pessoas)
const viewsDatacenter = datacenter.reduce((a, d) => a + d.views, 0)
const shareSaiSemTocar = r2((abandono[0].pessoas / ph.pessoas) * 100)
const totalLeadsUf = ufs.reduce((a, u) => a + u.leads, 0) + leadsOutrasUfs.reduce((a, u) => a + u.leads, 0)

// ---------------------------------------------------------------------------
// 4) Gráficos
// ---------------------------------------------------------------------------

const C = {
  black: '#171717', charcoal: '#242424', gold: '#C5A34C', gray: '#666666',
  midGray: '#9a9a9a', line: '#e2e2e2', paleGray: '#f3f3f3', white: '#ffffff',
}

function graficoFunil() {
  const etapas = [
    { nome: 'Acessaram a página', n: ph.pessoas, nota: `${int(ph.views)} acessos` },
    { nome: 'Abriram o formulário', n: ph.pessoasForm, nota: `${pct(taxaForm)} de quem acessou` },
    { nome: 'Tentaram enviar', n: ph.pessoasSubmit, nota: `${int(ph.submitTentado)} tentativas` },
    { nome: 'Enviaram o cadastro', n: ph.pessoasLead, nota: `${pct(taxaLead)} de quem acessou` },
    { nome: 'São MQL (≥100 cabeças + IE)', n: ph.mqlPessoas, nota: `${pct(taxaMql)} de quem acessou` },
  ]
  const W = 1040, H = 292
  const left = 250, right = 210, top = 30
  const w = W - left - right
  const rowH = (H - top - 16) / etapas.length
  const max = etapas[0].n

  const linhas = etapas.map((e, i) => {
    const yy = top + rowH * i + rowH * 0.16
    const bh = rowH * 0.6
    const bw = Math.max(3, (e.n / max) * w)
    const fill = i === etapas.length - 1 ? C.gold : C.charcoal
    const queda = i === 0 ? '' : `<text x="${W - 16}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="10.5" fill="${C.gray}">${esc(e.nota)}</text>`
    return `<text x="${left - 14}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="11.5" fill="${C.black}">${esc(e.nome)}</text>
      <rect x="${left}" y="${yy}" width="${bw}" height="${bh}" fill="${fill}" rx="1.5"/>
      <text x="${left + bw + 9}" y="${yy + bh / 2 + 5}" font-size="14" font-weight="700" fill="${C.charcoal}">${int(e.n)}</text>
      ${i === 0 ? `<text x="${W - 16}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="10.5" fill="${C.gray}">${esc(e.nota)}</text>` : queda}`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="16" y="18" font-size="13" font-weight="700" fill="${C.black}" letter-spacing="0.6">FUNIL EM PESSOAS ÚNICAS — DO ACESSO AO MQL</text>
    ${linhas}
  </svg>`
}

function graficoHoras() {
  // UTC → MS (−4h) e preenchimento das horas vazias.
  const pontos = porHoraUtc.map(([iso, views, pessoas, form, leads]) => {
    const d = new Date(`${iso}:00:00Z`)
    const ms = new Date(d.getTime() - 4 * 3600 * 1000)
    return { t: ms.getTime(), dia: ms.getUTCDate(), hora: ms.getUTCHours(), views, pessoas, form, leads }
  }).filter((p) => p.t >= Date.UTC(2026, 6, 24, 0)) // a partir de 24/07 00h MS
  const inicio = Date.UTC(2026, 6, 24, 0)
  const fim = Math.max(...pontos.map((p) => p.t))
  const serie = []
  for (let t = inicio; t <= fim; t += 3600 * 1000) {
    const achado = pontos.find((p) => p.t === t)
    const d = new Date(t)
    serie.push(achado || { t, dia: d.getUTCDate(), hora: d.getUTCHours(), views: 0, pessoas: 0, form: 0, leads: 0 })
  }

  const W = 1040, H = 300
  const left = 52, right = 20, top = 40, bottom = 52
  const w = W - left - right
  const h = H - top - bottom
  const max = 72
  const stepX = w / serie.length
  const yV = (v) => top + h - (v / max) * h

  let grid = ''
  for (let i = 0; i <= 4; i += 1) {
    const yy = top + (h * i) / 4
    grid += `<line x1="${left}" y1="${yy}" x2="${W - right}" y2="${yy}" stroke="${C.line}"/>`
    grid += `<text x="${left - 9}" y="${yy + 4}" text-anchor="end" font-size="11" fill="${C.gray}">${Math.round(max * (4 - i) / 4)}</text>`
  }

  const barras = serie.map((p, i) => {
    const x = left + stepX * i
    const bw = Math.max(2, stepX * 0.66)
    const yy = yV(p.views)
    const marcaLead = p.leads > 0
      ? `<circle cx="${x + bw / 2}" cy="${yy - 11}" r="6.5" fill="${C.gold}"/>
         <text x="${x + bw / 2}" y="${yy - 8}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${C.black}">${p.leads}</text>`
      : ''
    const rotulo = p.hora % 4 === 0
      ? `<text x="${x + bw / 2}" y="${H - 30}" text-anchor="middle" font-size="9.5" fill="${C.gray}">${String(p.hora).padStart(2, '0')}h</text>`
      : ''
    const marcaDia = p.hora === 0
      ? `<text x="${x + bw / 2}" y="${H - 14}" text-anchor="middle" font-size="10" font-weight="700" fill="${C.black}">${String(p.dia).padStart(2, '0')}/07</text>`
      : ''
    return `<rect x="${x}" y="${yy}" width="${bw}" height="${top + h - yy}" fill="${C.charcoal}" rx="1"/>${marcaLead}${rotulo}${marcaDia}`
  }).join('')

  // Marco do go-live: 24/07 13h51 MS
  const idxGo = serie.findIndex((p) => p.dia === 24 && p.hora === 13)
  const xGo = left + stepX * idxGo + stepX * 0.85
  // Rótulo à ESQUERDA da linha e dentro da área do gráfico: acima, bate no título.
  const marco = `<line x1="${xGo}" y1="${top}" x2="${xGo}" y2="${top + h}" stroke="${C.gold}" stroke-width="2"/>
    <text x="${xGo - 8}" y="${top + 14}" text-anchor="end" font-size="10.5" font-weight="700" fill="${C.gold}">CAMPANHA NO AR · 13h51</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="16" y="18" font-size="13" font-weight="700" fill="${C.black}" letter-spacing="0.6">ACESSOS POR HORA (MS) · CÍRCULO DOURADO = CADASTROS NAQUELA HORA</text>
    ${grid}${barras}${marco}
  </svg>`
}

function graficoCriativos() {
  const W = 1040, H = 250
  const left = 235, right = 300, top = 34, bottom = 20
  const w = W - left - right
  const rowH = (H - top - bottom) / funilCriativo.length
  const max = Math.max(...funilCriativo.map((f) => f.visitantes))

  const linhas = funilCriativo.map((f, i) => {
    const yy = top + rowH * i + rowH * 0.2
    const bh = rowH * 0.52
    const bw = Math.max(3, (f.visitantes / max) * w)
    const pago = f.criativo !== 'sem UTM (orgânico/direto)'
    const taxa = f.visitantes ? (f.leads / f.visitantes) * 100 : 0
    return `<text x="${left - 12}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="11" fill="${C.black}">${esc(f.criativo)}</text>
      <rect x="${left}" y="${yy}" width="${bw}" height="${bh}" fill="${pago ? C.charcoal : C.midGray}" rx="1.5"/>
      <text x="${left + bw + 8}" y="${yy + bh / 2 + 4}" font-size="11" font-weight="700" fill="${C.charcoal}">${f.visitantes}</text>
      <text x="${W - 16}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="10.5" fill="${C.gray}">${f.leads} cadastro${f.leads === 1 ? '' : 's'} · ${f.mql} MQL · ${pct(taxa)} de conversão</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="16" y="18" font-size="13" font-weight="700" fill="${C.black}" letter-spacing="0.6">VISITANTES ÚNICOS POR CRIATIVO E O QUE VIROU CADASTRO</text>
    ${linhas}
  </svg>`
}

function graficoTravas() {
  const W = 1040, H = 190
  const left = 300, right = 190, top = 32, bottom = 16
  const w = W - left - right
  const rowH = (H - top - bottom) / travas.length
  const max = Math.max(...travas.map((t) => t.pessoas))

  const linhas = travas.map((t, i) => {
    const yy = top + rowH * i + rowH * 0.2
    const bh = rowH * 0.54
    const bw = Math.max(3, (t.pessoas / max) * w)
    return `<text x="${left - 12}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="11" fill="${C.black}">${esc(t.campos)}</text>
      <rect x="${left}" y="${yy}" width="${bw}" height="${bh}" fill="${i === 0 ? C.gold : C.charcoal}" rx="1.5"/>
      <text x="${left + bw + 8}" y="${yy + bh / 2 + 4}" font-size="11" font-weight="700" fill="${C.charcoal}">${t.pessoas} pessoas</text>
      <text x="${W - 16}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="10.5" fill="${C.gray}">${esc(t.etapa)}</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="16" y="18" font-size="13" font-weight="700" fill="${C.black}" letter-spacing="0.6">ONDE O CADASTRO TRAVA — CAMPOS QUE REPROVARAM</text>
    ${linhas}
  </svg>`
}

// ---------------------------------------------------------------------------
// 5) HTML
// ---------------------------------------------------------------------------

const kpi = (rotulo, valor, nota, destaque) => `
  <div class="kpi${destaque ? ' destaque' : ''}">
    <div class="kpi-rotulo">${esc(rotulo)}</div>
    <div class="kpi-valor">${valor}</div>
    ${nota ? `<div class="kpi-nota">${nota}</div>` : ''}
  </div>`

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Campanha Touros — Mídia e Comportamento — 25/07/2026</title>
<style>
  @page { size: A4; margin: 14mm 13mm 16mm 13mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: ${C.black}; font-size: 10.5pt; line-height: 1.5; }
  h1, h2, h3 { font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }
  .capa { background: ${C.black}; color: ${C.white}; padding: 22px 24px 20px; margin-bottom: 4px; }
  .capa h1 { font-size: 22pt; line-height: 1.12; letter-spacing: 0.04em; }
  .capa .sub { color: #c9c9c9; font-size: 10pt; margin-top: 8px; text-transform: none; letter-spacing: 0; }
  .regua { height: 4px; background: ${C.gold}; margin-bottom: 20px; }
  h2 { font-size: 12.5pt; border-bottom: 2px solid ${C.black}; padding-bottom: 5px; margin: 26px 0 12px; }
  h3 { font-size: 10.5pt; color: ${C.charcoal}; margin: 18px 0 8px; letter-spacing: 0.08em; }
  p { margin: 0 0 9px; }
  .lede { font-size: 11pt; }
  .kpis { display: flex; gap: 9px; margin: 14px 0 6px; }
  .kpi { flex: 1; border: 1px solid ${C.line}; border-top: 3px solid ${C.black}; padding: 9px 11px 10px; }
  .kpi-rotulo { font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.09em; color: ${C.gray}; }
  .kpi-valor { font-size: 15.5pt; font-weight: 700; margin-top: 3px; line-height: 1.1; }
  .kpi-nota { font-size: 8.6pt; color: ${C.gray}; margin-top: 2px; }
  .kpi.destaque { border-top-color: ${C.gold}; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9.4pt; }
  thead th { background: ${C.charcoal}; color: ${C.white}; font-size: 8.2pt; text-transform: uppercase; letter-spacing: 0.06em; padding: 7px 8px; text-align: right; font-weight: 700; }
  thead th:first-child { text-align: left; }
  tbody td { padding: 6px 8px; text-align: right; border-bottom: 1px solid ${C.line}; }
  tbody td:first-child { text-align: left; }
  tbody tr:nth-child(even) { background: ${C.paleGray}; }
  tbody tr.total td { font-weight: 700; border-top: 2px solid ${C.black}; border-bottom: none; background: ${C.white}; }
  tbody tr.marcada { background: #faf5e6; }
  tbody tr.marcada td:first-child { box-shadow: inset 3px 0 0 ${C.gold}; }
  .grafico { border: 1px solid ${C.line}; padding: 10px 8px 4px; margin: 10px 0 14px; }
  .caixa { border: 1px solid ${C.black}; border-left: 5px solid ${C.gold}; padding: 11px 14px; margin: 12px 0; }
  .caixa h3 { margin-top: 0; }
  .caixa p:last-child { margin-bottom: 0; }
  .caixa.alerta { border-left-color: ${C.black}; background: ${C.paleGray}; }
  ol, ul { margin: 0 0 10px; padding-left: 20px; }
  li { margin-bottom: 5px; }
  .duas { display: flex; gap: 16px; }
  .duas > div { flex: 1; }
  .rodape { margin-top: 22px; padding-top: 9px; border-top: 1px solid ${C.line}; font-size: 8.4pt; color: ${C.gray}; }
  .quebra { page-break-before: always; }
  .evita-quebra { page-break-inside: avoid; }
  .nota-fonte { font-size: 8.6pt; color: ${C.gray}; margin: -4px 0 12px; }
  .cadeia { display: flex; align-items: stretch; gap: 0; margin: 14px 0 10px; }
  .elo { flex: 1; border: 1px solid ${C.line}; padding: 9px 8px; text-align: center; position: relative; }
  .elo + .elo { border-left: none; }
  .elo-n { font-size: 15pt; font-weight: 700; line-height: 1.1; }
  .elo-r { font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.07em; color: ${C.gray}; margin-top: 2px; }
  .elo-c { font-size: 8.6pt; color: ${C.charcoal}; margin-top: 4px; font-weight: 700; }
  .elo.fim { background: ${C.black}; color: ${C.white}; }
  .elo.fim .elo-r, .elo.fim .elo-c { color: #c9c9c9; }
</style>
</head>
<body>

<div class="capa">
  <h1>Campanha Touros<br>Mídia + comportamento</h1>
  <div class="sub">
    <strong>LEAD - PERPETUO TOURO</strong> · no ar desde 24/07/2026 13h51 · Bula Assessoria<br>
    Extração de <strong>25/07/2026, 14h20</strong> (horário MS) · Meta Ads (conector oficial) + PostHog (HogQL)
  </div>
</div>
<div class="regua"></div>

<h2>1 · A cadeia inteira, da impressão ao MQL</h2>

<div class="cadeia">
  <div class="elo"><div class="elo-n">${int(meta.impressoes)}</div><div class="elo-r">impressões</div><div class="elo-c">${brl(meta.cpm)} / mil</div></div>
  <div class="elo"><div class="elo-n">${int(meta.cliques)}</div><div class="elo-r">cliques</div><div class="elo-c">${brl(meta.cpc)} cada</div></div>
  <div class="elo"><div class="elo-n">${int(visitantesPagos)}</div><div class="elo-r">visitantes pagos</div><div class="elo-c">${brl(custoVisitante)} cada</div></div>
  <div class="elo"><div class="elo-n">${int(formPagos)}</div><div class="elo-r">abriram o form</div><div class="elo-c">${brl(custoForm)} cada</div></div>
  <div class="elo"><div class="elo-n">${int(leadsPagos)}</div><div class="elo-r">cadastros</div><div class="elo-c">${brl(custoLead)} cada</div></div>
  <div class="elo fim"><div class="elo-n">${int(mqlPagos)}</div><div class="elo-r">MQL</div><div class="elo-c">${brl(custoMql)} cada</div></div>
</div>
<p class="nota-fonte">
  Impressões, cliques e custo vêm do Meta. Visitantes, formulário, cadastros e MQL vêm do PostHog, contando
  <strong>pessoas únicas</strong> com UTM de anúncio. O tráfego orgânico/direto (${organico.visitantes} visitantes,
  ${organico.leads} cadastros, ${organico.mql} MQL) está fora desta linha — entra na seção 3.
</p>

<div class="caixa">
  <h3>O que os dois sistemas juntos revelam</h3>
  <p><strong>1. A conversão ESTÁ funcionando — o Meta é que enxerga pouco.</strong> O painel do Meta mostra
  <strong>1 MQL</strong>. O PostHog registra <strong>${ph.leadEnviado} cadastros enviados por ${ph.pessoasLead} pessoas,
  ${ph.mqlPessoas} delas MQL</strong>. O evento dispara normalmente; o Meta só contabiliza a conversão que consegue
  atribuir ao clique dele. Ou seja: a campanha entregou <strong>${ph.mqlPessoas}x mais MQL</strong> do que o relatório
  de mídia sugere, e o custo real por MQL é <strong>${brl(custoMql)}</strong> — não ${brl(meta.investido)}.</p>
  <p><strong>2. O problema não é atrair, é converter.</strong> ${pct(shareSaiSemTocar)} das pessoas
  (${abandono[0].pessoas} de ${ph.pessoas}) <strong>saem sem tocar no formulário</strong>. De cada 100 que acessam,
  ${dec(taxaForm, 0)} abrem o cadastro e ${dec(taxaLead, 0)} concluem.</p>
  <p><strong>3. O passo 3 é onde o dinheiro escapa.</strong> ${travas[0].pessoas} pessoas foram reprovadas nos campos
  <em>quantos touros</em> + <em>Inscrição Estadual</em> — exatamente os dois que definem se o lead é MQL. São pessoas
  que já deram nome, WhatsApp, UF e rebanho e travaram no último passo.</p>
</div>

<h2>2 · Mídia — o que o Meta entregou</h2>
<p class="nota-fonte">
  Campanha ${meta.id} · ${esc(meta.conta)} · ${esc(meta.objetivo)} · início ${meta.inicio} · ${esc(meta.fim)}
</p>

<div class="kpis">
  ${kpi('Investido', brl(meta.investido))}
  ${kpi('Impressões', int(meta.impressoes))}
  ${kpi('Alcance', int(meta.alcance))}
  ${kpi('Frequência', dec(meta.frequencia))}
</div>
<div class="kpis">
  ${kpi('Cliques', int(meta.cliques))}
  ${kpi('CTR', pct(meta.ctr, 2))}
  ${kpi('CPC', brl(meta.cpc))}
  ${kpi('CPM', brl(meta.cpm))}
  ${kpi('MQL atribuído', String(meta.mqlAtribuido), 'o PostHog vê ' + ph.mqlPessoas, true)}
</div>

<p>CTR de ${pct(meta.ctr, 2)} é forte — <strong>86% acima</strong> da campanha de corte que rodou em paralelo
(1,27%). O criativo de touro prende. A frequência de ${dec(meta.frequencia)} mostra público ainda fresco:
não há sinal de saturação em 24 horas.</p>

<p>Dos ${int(meta.cliques)} cliques que o Meta registra, ${int(visitantesPagos)} viraram visitante identificado no
PostHog (${pct(aproveitamentoClique)}). A diferença não é necessariamente perda: a métrica "cliques" do Meta
inclui interações no próprio anúncio (curtir, ver perfil, expandir legenda), não só clique de saída para o site.</p>

<h2>3 · Acessos — o que o PostHog viu</h2>

<div class="kpis">
  ${kpi('Acessos', int(ph.views), `${int(ph.pessoas)} pessoas únicas`)}
  ${kpi('Cliques na página', int(ph.cliques), 'capturados automaticamente')}
  ${kpi('Cadastros', int(ph.leadEnviado), `${int(ph.pessoasLead)} pessoas`)}
  ${kpi('MQL', int(ph.mqlPessoas), `${int(ph.naoMqlPessoas)} não-MQL`, true)}
</div>

<div class="grafico evita-quebra">${graficoHoras()}</div>

<p>O tráfego responde <strong>na hora</strong>: a campanha subiu às 13h51 e o pico veio no mesmo intervalo —
68 acessos de 52 pessoas entre 14h e 15h. O segundo pico é a manhã seguinte (7h–10h), janela em que também
saíram 7 dos ${ph.leadEnviado} cadastros. Antes do go-live a página tinha tráfego residual de teste.</p>

<h3>3.1 · De onde vem</h3>
<div class="duas">
  <div>
    <table>
      <thead><tr><th>Origem</th><th>Acessos</th><th>Pessoas</th></tr></thead>
      <tbody>
        ${origens.map((o) => `<tr><td>${esc(o.nome)}</td><td>${int(o.views)}</td><td>${int(o.pessoas)}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div>
    <table>
      <thead><tr><th>Dispositivo</th><th>Acessos</th><th>Pessoas</th></tr></thead>
      <tbody>
        ${dispositivos.map((d) => `<tr><td>${esc(d.nome)}</td><td>${int(d.views)}</td><td>${int(d.pessoas)}</td></tr>`).join('')}
      </tbody>
    </table>
    <table>
      <thead><tr><th>Sistema · navegador</th><th>Acessos</th></tr></thead>
      <tbody>
        ${sistemas.map((s) => `<tr><td>${esc(s.os)} · ${esc(s.nav)}</td><td>${int(s.views)}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>
<p><strong>${pct(shareMobile)} das pessoas entram pelo celular</strong> — Android/Chrome e iPhone/Safari respondem
por 82% dos acessos. Qualquer ajuste de página precisa ser decidido olhando a tela do celular, não a do computador.
O Instagram é a porta principal (112 acessos), seguido do Facebook mobile.</p>

<h3>3.2 · Onde estão — e a campanha NÃO é de MS</h3>
<table>
  <thead><tr><th>Estado</th><th>Acessos</th><th>Pessoas</th><th>Viraram cadastro</th></tr></thead>
  <tbody>
    ${ufs.map((u) => `<tr${u.leads > 0 ? ' class="marcada"' : ''}><td>${esc(u.uf)}</td>
      <td>${int(u.views)}</td><td>${int(u.pessoas)}</td><td>${u.leads || '—'}</td></tr>`).join('')}
    ${leadsOutrasUfs.map((u) => `<tr class="marcada"><td>${esc(u.uf)}</td><td>—</td><td>—</td><td>${u.leads}</td></tr>`).join('')}
  </tbody>
</table>
<p>Diferente da campanha de corte (99,7% em Mato Grosso do Sul), esta está <strong>nacional e pulverizada</strong>:
Minas lidera em acessos, São Paulo vem logo atrás, e os ${totalLeadsUf} cadastros se espalham por 8 estados —
<strong>nenhum deles em MS</strong>. Vale decidir se isso é intencional: se a operação de touros atende o país
inteiro, está certo; se o atendimento é regional, há verba indo para onde a Bula não fecha.</p>

<p class="nota-fonte">
  ${viewsDatacenter} dos ${ph.views} acessos vêm de datacenter (${datacenter.map((d) => esc(d.cidade)).join(', ')}) —
  são robôs de pré-visualização do Meta e da AWS, não pessoas. Representam ${pct((viewsDatacenter / ph.views) * 100)}
  do total e estão contados nos números acima.
</p>

<div class="quebra"></div>

<h2>4 · O funil — onde as pessoas somem</h2>

<div class="grafico evita-quebra">${graficoFunil()}</div>

<table class="evita-quebra">
  <thead><tr><th>Etapa</th><th>Pessoas</th><th>% do acesso</th><th>Passa para a etapa seguinte</th></tr></thead>
  <tbody>
    <tr><td>Acessaram a página</td><td>${ph.pessoas}</td><td>100,0%</td><td>${pct(taxaForm)}</td></tr>
    <tr><td>Abriram o formulário</td><td>${ph.pessoasForm}</td><td>${pct(taxaForm)}</td><td>${pct((ph.pessoasSubmit / ph.pessoasForm) * 100)}</td></tr>
    <tr><td>Tentaram enviar</td><td>${ph.pessoasSubmit}</td><td>${pct((ph.pessoasSubmit / ph.pessoas) * 100)}</td><td>${pct((ph.pessoasLead / ph.pessoasSubmit) * 100)}</td></tr>
    <tr><td>Enviaram o cadastro</td><td>${ph.pessoasLead}</td><td>${pct(taxaLead)}</td><td>${pct((ph.mqlPessoas / ph.pessoasLead) * 100)}</td></tr>
    <tr class="marcada"><td><strong>São MQL (≥100 cabeças + IE)</strong></td><td><strong>${ph.mqlPessoas}</strong></td><td><strong>${pct(taxaMql)}</strong></td><td>—</td></tr>
  </tbody>
</table>

<h3>4.1 · Passo a passo do formulário</h3>
<table>
  <thead><tr><th>Passo</th><th>Tentativas de avançar</th><th>Conseguiram</th><th>Taxa de reprovação</th></tr></thead>
  <tbody>
    ${passos.map((p) => `<tr${(1 - p.concluiram / p.tentativas) >= 0.4 ? ' class="marcada"' : ''}>
      <td>${esc(p.passo)}</td><td>${p.tentativas}</td><td>${p.concluiram}</td>
      <td>${pct((1 - p.concluiram / p.tentativas) * 100)}</td></tr>`).join('')}
  </tbody>
</table>

<div class="grafico evita-quebra">${graficoTravas()}</div>

<div class="caixa evita-quebra">
  <h3>Leitura — dois gargalos distintos</h3>
  <p><strong>Passo 1 reprova metade de quem tenta</strong> (31 tentativas → 16 avançaram). O campo que mais barra é
  a combinação nome + WhatsApp + <em>consentimento</em>: 8 pessoas esqueceram de marcar a caixinha de autorização
  do WhatsApp. É atrito puro, sem ganho — a caixa poderia vir marcada, ou o consentimento poderia estar no texto
  do botão ("Ao continuar, autorizo o contato pelo WhatsApp").</p>
  <p><strong>Passo 3 é o mais caro.</strong> ${travas[0].pessoas} pessoas travaram em <em>quantos touros</em> +
  <em>Inscrição Estadual</em>. Quem chega ali já investiu 3 telas de dados. Perder o lead nesse ponto é perder o
  lead mais quente que existe — e são justamente os campos que decidem o MQL. Alternativa: aceitar o cadastro sem IE,
  marcando-o como "a confirmar", e deixar o SDR resolver isso na conversa do WhatsApp.</p>
</div>

<h3>4.2 · Onde cada pessoa parou</h3>
<table>
  <thead><tr><th>Último passo antes de sair</th><th>Pessoas</th><th>% de quem não converteu</th></tr></thead>
  <tbody>
    ${abandono.map((a) => `<tr><td>${esc(a.onde)}</td><td>${a.pessoas}</td>
      <td>${pct((a.pessoas / abandono.reduce((s, x) => s + x.pessoas, 0)) * 100)}</td></tr>`).join('')}
  </tbody>
</table>

<div class="kpis">
  ${kpi('Só 1 visita', int(engajamento.umaVisita), 'de ' + ph.pessoas + ' pessoas')}
  ${kpi('Voltaram 2×', int(engajamento.duas))}
  ${kpi('Voltaram 3× ou +', int(engajamento.tresOuMais))}
  ${kpi('Tempo até cadastrar', mmss(tempoAteLead.medianaSeg), `mediana · média ${mmss(tempoAteLead.mediaSeg)}`)}
</div>
<p>Quem decide, decide rápido: a <strong>metade dos cadastros sai em menos de 2 minutos</strong> do primeiro acesso.
A média puxada para ${mmss(tempoAteLead.mediaSeg)} vem de poucas pessoas que voltaram horas depois para concluir —
o que reforça o valor de reengajar quem abriu o formulário e não terminou.</p>

<div class="quebra"></div>

<h2>5 · Cliques e atrito na página</h2>

<div class="duas">
  <div>
    <h3>Mais clicados</h3>
    <table>
      <thead><tr><th>Elemento</th><th>Cliques</th><th>Pessoas</th></tr></thead>
      <tbody>
        ${cliquesTop.map((c) => `<tr${c.cliques / c.pessoas >= 3 ? ' class="marcada"' : ''}>
          <td>${esc(c.alvo)}</td><td>${int(c.cliques)}</td><td>${int(c.pessoas)}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div>
    <h3>Cliques de raiva (rageclick)</h3>
    <table>
      <thead><tr><th>Elemento</th><th>Nº</th><th>Pessoas</th></tr></thead>
      <tbody>
        ${rageTop.map((r) => `<tr${r.n >= 8 ? ' class="marcada"' : ''}>
          <td>${esc(r.alvo)}</td><td>${int(r.n)}</td><td>${int(r.pessoas)}</td></tr>`).join('')}
      </tbody>
    </table>
    <p class="nota-fonte">Rageclick = a pessoa clica várias vezes seguidas no mesmo ponto. É o sinal mais direto
    de "cliquei e não aconteceu nada".</p>
  </div>
</div>

<div class="caixa evita-quebra">
  <h3>O CTA principal está pedindo socorro</h3>
  <p>O botão <em>"Quero o touro certo pro meu rebanho"</em> levou <strong>${cliquesTop[0].cliques} cliques de apenas
  ${cliquesTop[0].pessoas} pessoas</strong> — <strong>${dec(cliquesPorPessoaCta, 1)} cliques por pessoa</strong> no
  mesmo botão. E concentrou <strong>${rageTop[0].n} dos ${ph.rageclicks} rageclicks</strong> da página.</p>
  <p>Ninguém clica 4 vezes num botão que responde. Ou a rolagem até o formulário é lenta o suficiente para a pessoa
  achar que não funcionou, ou o botão não dá retorno visual no toque. <strong>É o ajuste de maior retorno da lista</strong>:
  mexe no topo do funil, onde estão ${abandono[0].pessoas} das ${ph.pessoas} pessoas.</p>
</div>

<h2>6 · Desempenho por criativo — mídia cruzada com comportamento</h2>

<div class="grafico evita-quebra">${graficoCriativos()}</div>

<table class="evita-quebra">
  <thead>
    <tr><th>Criativo</th><th>Investido</th><th>Cliques (Meta)</th><th>Visitantes</th><th>R$/visitante</th><th>Abriram form</th><th>Cadastros</th><th>MQL</th></tr>
  </thead>
  <tbody>
    ${funilCriativo.map((f) => {
      const m = metaCriativos[f.criativo]
      return `<tr${f.criativo.startsWith('sem UTM') ? ' class="marcada"' : ''}>
        <td>${esc(f.criativo)}</td>
        <td>${m ? brl(m.investido) : '—'}</td>
        <td>${m ? int(m.cliques) : '—'}</td>
        <td>${int(f.visitantes)}</td>
        <td>${m ? brl(m.investido / f.visitantes) : '—'}</td>
        <td>${f.form}</td><td>${f.leads}</td><td>${f.mql}</td></tr>`
    }).join('')}
    <tr class="total"><td>Total</td><td>${brl(meta.investido)}</td><td>${int(meta.cliques)}</td>
      <td>${int(ph.pessoas)}</td><td>${brl(custoVisitante)}</td>
      <td>${funilCriativo.reduce((a, f) => a + f.form, 0)}</td>
      <td>${funilCriativo.reduce((a, f) => a + f.leads, 0)}</td>
      <td>${funilCriativo.reduce((a, f) => a + f.mql, 0)}</td></tr>
  </tbody>
</table>

<ul>
  <li><strong>touro03 é o motor:</strong> 54% do investimento, ${funilCriativo[0].visitantes} visitantes
  (${brl(metaCriativos['video-perpetuo-touro03'].investido / funilCriativo[0].visitantes)} cada — o mais barato),
  4 cadastros e 1 MQL. É o criativo a escalar.</li>
  <li><strong>touro01 não entregou nada:</strong> ${brl(metaCriativos['video-perpetuo-touro01'].investido)} gastos,
  32 visitantes, <strong>zero cadastro</strong>. E é o visitante mais caro
  (${brl(metaCriativos['video-perpetuo-touro01'].investido / funilCriativo[2].visitantes)}). Candidato a corte.</li>
  <li><strong>O tráfego orgânico converte 3x melhor:</strong> ${organico.visitantes} visitantes sem UTM geraram
  ${organico.leads} cadastros e <strong>${organico.mql} MQL</strong> — metade dos MQL da janela, sem custo de mídia.
  Quem chega por conta própria já vem decidido.</li>
</ul>

<h2>7 · Três defeitos técnicos encontrados</h2>

<div class="caixa alerta">
  <h3>1 · Anúncio com a UTM quebrada</h3>
  <p>4 acessos chegaram com <code>utm_campaign={{adset.name}}</code> e <code>utm_content={{ad.name}}</code> —
  as macros do Meta <strong>não foram substituídas</strong>, o que indica um anúncio com a URL montada errada
  (chaves duplas escapadas ou digitadas à mão). Detalhe que dói: <strong>esses 4 acessos geraram 1 MQL</strong> —
  a conversão veio, mas fica órfã na análise, sem saber de qual criativo nasceu. Corrigir a URL do anúncio.</p>
</div>

<div class="caixa alerta">
  <h3>2 · Mesma campanha gravada com dois nomes</h3>
  <p>Aparecem <code>CA - PERPETUO TOURO WEB</code> (244 acessos) e <code>CA+-+PERPETUO+TOURO+WEB</code>
  (20 acessos) — o mesmo nome, um deles com espaços codificados como <code>+</code>. Fragmenta qualquer relatório
  por campanha em duas linhas. Padronizar o nome na URL (sem espaços, ou sempre codificado igual).</p>
</div>

<div class="caixa alerta">
  <h3>3 · Uma falha real de envio</h3>
  <p>O aviso <em>"Falha ao enviar. Tente novamente."</em> foi clicado 3 vezes por 1 pessoa em 24/07, e há
  <strong>${perdaSubmit} pessoas que tentaram enviar e não constam como cadastro</strong>
  (${ph.pessoasSubmit} tentaram, ${ph.pessoasLead} concluíram). Também chama atenção o volume de tentativas:
  ${ph.submitTentado} tentativas de envio para ${ph.leadEnviado} cadastros gravados. Vale olhar o log da rota de
  cadastro no período — pode ser validação do servidor recusando algo que a tela aceitou.</p>
</div>

<div class="quebra"></div>

<h2>8 · O que fazer</h2>

<h3>Ajustes na página — maior retorno, menor esforço</h3>
<ol>
  <li><strong>Consertar o CTA principal.</strong> ${dec(cliquesPorPessoaCta, 1)} cliques por pessoa e
  ${rageTop[0].n} rageclicks dizem que o botão não responde à altura. Dar retorno visual imediato no toque e
  encurtar/acelerar a rolagem até o formulário.</li>
  <li><strong>Tirar a caixinha de consentimento do caminho.</strong> 8 pessoas foram barradas por ela no passo 1.
  Mover o consentimento para o texto do botão resolve sem perder a base legal.</li>
  <li><strong>Não travar o cadastro na Inscrição Estadual.</strong> ${travas[0].pessoas} pessoas morreram no passo 3,
  nos campos que definem o MQL. Aceitar o envio com IE "a confirmar" e deixar o SDR fechar isso no WhatsApp —
  o lead entra no CRM em vez de evaporar.</li>
  <li><strong>Testar tudo pelo celular.</strong> ${pct(shareMobile)} das pessoas são mobile; decisão de layout
  tomada no desktop está olhando 8% do público.</li>
</ol>

<h3>Mídia</h3>
<ol start="5">
  <li><strong>Escalar o touro03</strong> — visitante mais barato, 4 dos 7 cadastros pagos.</li>
  <li><strong>Cortar o touro01</strong> — ${brl(metaCriativos['video-perpetuo-touro01'].investido)} sem nenhum cadastro
  e o visitante mais caro.</li>
  <li><strong>Decidir a geografia.</strong> Os cadastros vieram de 8 estados e nenhum de MS. Se o atendimento de
  touros é nacional, manter; se é regional, a segmentação precisa mudar.</li>
  <li><strong>Não julgar a campanha pelo número de MQL do painel do Meta.</strong> Ele mostra
  ${meta.mqlAtribuido}; a realidade da página é ${ph.mqlPessoas}. Para decisão de verba, usar o número do PostHog
  (ou do CRM).</li>
</ol>

<h3>Correções técnicas</h3>
<ol start="9">
  <li>Corrigir a URL do anúncio com <code>{{ad.name}}</code> não substituído.</li>
  <li>Padronizar o nome da campanha na UTM (hoje grava em duas grafias).</li>
  <li>Investigar as ${perdaSubmit} tentativas de envio que não viraram cadastro e o erro de 24/07.</li>
</ol>

<div class="caixa">
  <h3>A conta que interessa</h3>
  <p>Com ${brl(meta.investido)} em 24 horas a campanha entregou <strong>${leadsPagos} cadastros pagos</strong>
  (${brl(custoLead)} cada) e <strong>${mqlPagos} MQL pagos</strong> (${brl(custoMql)} cada). Só de destravar o passo 3,
  as ${travas[0].pessoas} pessoas que já tinham dado nome, WhatsApp e rebanho <strong>dobrariam com folga o
  resultado da mesma verba</strong> — sem gastar um real a mais em mídia.</p>
</div>

<div class="rodape">
  Mídia: API oficial do Meta Ads, campanha ${meta.id}, conta ${esc(meta.conta)}.
  Comportamento: PostHog (projeto 430113) via HogQL, janela 24/07 00h00 UTC → 25/07 18h20 UTC — equivalente a
  23/07 21h00 → 25/07 14h20 no horário de MS, fuso em que o Meta reporta. "Pessoas" são identificadores únicos do
  PostHog: mesma pessoa em dois aparelhos conta duas vezes. MQL = ≥100 cabeças + Inscrição Estadual, veredito dado
  pelo servidor no momento do cadastro. Nenhum número foi estimado — todos vêm de consulta direta às duas fontes.
  Script: <em>scripts/gera-relatorio-touros-midia-comportamento.mjs</em>
</div>

</body>
</html>`

// ---------------------------------------------------------------------------
// 6) Escrita e PDF
// ---------------------------------------------------------------------------

const htmlPath = join(outputDir, `${outputStem}.html`)
const pdfPath = join(outputDir, `${outputStem}.pdf`)
writeFileSync(htmlPath, html, 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.emulateMedia({ media: 'print' })
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#666;padding:0 13mm;display:flex;justify-content:space-between;">
    <span>Bula Assessoria · Campanha Touros · Mídia + Comportamento · 25/07/2026</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`,
  margin: { top: '14mm', right: '13mm', bottom: '16mm', left: '13mm' },
})
await browser.close()

if (desktop) copyFileSync(pdfPath, join(desktop, `${desktopStem}.pdf`))

console.log('HTML:', htmlPath)
console.log('PDF :', pdfPath)
if (desktop) console.log('PDF (Desktop):', join(desktop, `${desktopStem}.pdf`))
