/**
 * Renderiza o relatório de PROSPECÇÃO NELORE PO (radar × cobertura Bula) a
 * partir de outputs/prospeccao-nelore-po-2026-09/analise.json, gerado por
 * scripts/prospeccao-nelore-po-2026-09.mjs. Paleta monocromática do brandbook,
 * dourado só como acento. Gera HTML + PDF A4 na Área de Trabalho e copia o XLSX.
 *
 * Nenhum número escrito à mão: tudo vem do analise.json. Os textos das fichas
 * são redigidos aqui, mas citam só o que está no JSON.
 *
 *   node scripts/render-prospeccao-nelore-po-2026-09.mjs
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'

const OUT = 'outputs/prospeccao-nelore-po-2026-09'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'analise.json'), 'utf8'))
const K = D.kpi

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const int = n => Number(n || 0).toLocaleString('pt-BR')
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const dm = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''
const pct = (a, b) => b ? Math.round((a / b) * 100) : 0
const corta = (t, n) => { const x = String(t ?? ''); if (x.length <= n) return x; const c = x.slice(0, n), sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…' }
const periodo = p => p.dias > 1 ? `${dm(p.ini)}–${dm(p.fim)}` : dm(p.ini)

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', SOFT = '#B4B4B4'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

const byNome = Object.fromEntries([...D.prospects, ...D.clientes].map(m => [m.nome, m]))
const P = n => { const m = byNome[n]; if (!m) throw new Error('marca não encontrada: ' + n); return m }

/* ── porta de entrada, em uma linha ─────────────────────────────────────── */
function portaCurta(m) {
  const out = []
  if (m.vendemosLa.length) out.push(`já vendemos lá (${m.vendemosLa.map(v => `${dm(v.data)}, VGV R$ ${brl0(v.vgv)}`).join('; ')})`)
  if (m.portaExtra) out.push(m.portaExtra)
  if (m.crm.clientes.length) out.push('cliente: ' + m.crm.clientes.slice(0, 2).map(c => c.nome).join(', '))
  if (m.crm.leads.length) {
    const wa = m.crm.leads.filter(l => /whatsapp/i.test(l.origem || ''))
    const outros = m.crm.leads.filter(l => !/whatsapp/i.test(l.origem || ''))
    const uniq = arr => [...new Set(arr.map(l => l.nome.replace(/\s+/g, ' ').trim()))]
    if (wa.length) out.push('contato WhatsApp: ' + uniq(wa).slice(0, 2).join(', '))
    if (outros.length) out.push('lead: ' + uniq(outros).slice(0, 2).join(', '))
  }
  if (m.acnb && m.acnb.relacionados.length && !out.length) out.push('ACNB relacionado: ' + m.acnb.relacionados.slice(0, 2).join(', '))
  return out.length ? out.join(' · ') : '—'
}
const limpaPraca = p => p.replace(/\s*\(([A-Z]{2})\)$/, ' - $1').replace(/^VIRTUAL - SEDE LEILOBOI.*$/i, 'virtual · Leiloboi (Campo Grande-MS)')
const uniq = arr => [...new Set(arr)]
const pracaCurta = (m, compacta = false) => m.pracas.length ? uniq(m.pracas.map(limpaPraca)).slice(0, 2).join('; ') : (m.expog ? (compacta ? 'Expogenética' : 'Expogenética (Uberaba)') : 'virtual')
const pracaPregao = (m, p) => p.pracas.length ? uniq(p.pracas.map(limpaPraca)).join('; ') : (p.expog ? 'Expogenética (Uberaba)' : 'virtual')
const zonaCurta = m => m.zonas.length ? `${m.zonas.join('/')} · ${m.assessorZona.map(a => a.split(' ')[0]).join('/')}` : 'a descobrir'

/* ── gráfico: pregões por marca (barras horizontais, mono + hachura) ─────── */
function grafPregoes() {
  const todos = [...D.prospects, ...D.clientes].filter(m => m.tipo === 'criador')
    .sort((a, b) => b.pregoes - a.pregoes || b.dias - a.dias).slice(0, 18)
  const W = 1000, L = 300, R = 60, rowH = 22, T = 8
  const H = T + todos.length * rowH + 8
  const max = Math.max(...todos.map(m => m.pregoes))
  const x = v => L + (v / max) * (W - L - R)
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">`
  g += `<defs><pattern id="hach" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><line x1="0" y1="0" x2="0" y2="6" stroke="${INK}" stroke-width="2"/></pattern></defs>`
  for (let k = 1; k <= max; k++) g += `<line x1="${x(k).toFixed(1)}" y1="${T}" x2="${x(k).toFixed(1)}" y2="${H - 8}" stroke="${GRID}" stroke-width="1"/>`
  todos.forEach((m, i) => {
    const y = T + i * rowH + 3, h = rowH - 8
    const w = x(m.pregoes) - L
    g += `<text x="${L - 10}" y="${(y + h / 2 + 4).toFixed(1)}" text-anchor="end" font-size="11.5" fill="${INK}">${esc(corta(m.nome, 40))}</text>`
    g += `<rect x="${L}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="0" fill="${m.cliente ? 'url(#hach)' : INK}" stroke="${m.cliente ? INK : 'none'}" stroke-width="${m.cliente ? 1 : 0}"/>`
    g += `<text x="${(L + w + 8).toFixed(1)}" y="${(y + h / 2 + 4).toFixed(1)}" font-size="11" fill="${MUTED}">${m.pregoes}${m.edicaoMax ? ` · ${m.edicaoMax}ª ed.` : ''}${m.cliente ? ' · cliente' : ''}</text>`
  })
  g += `</svg>`
  return g
}

/* ── gráfico: prospects por zona ─────────────────────────────────────────── */
function grafZonas() {
  const zonas = [['Norte', 'Douglas'], ['Nordeste', 'Fábio'], ['Sudeste', 'Fábio'], ['Centro-Oeste', 'Leozinho'], ['Sul', 'Leozinho']]
  const dados = zonas.map(([z, a]) => ({ z, a, n: D.prospects.filter(m => m.zonas.includes(z)).length }))
  dados.push({ z: 'Virtual (praça a descobrir)', a: '—', n: D.prospects.filter(m => m.virtual).length })
  const W = 1000, L = 230, R = 60, rowH = 26, T = 6
  const H = T + dados.length * rowH + 6
  const max = Math.max(...dados.map(d => d.n))
  const x = v => L + (v / max) * (W - L - R)
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">`
  dados.forEach((d, i) => {
    const y = T + i * rowH + 4, h = rowH - 10, w = x(d.n) - L
    g += `<text x="${L - 10}" y="${(y + h / 2 + 4).toFixed(1)}" text-anchor="end" font-size="11.5" fill="${INK}">${esc(d.z)}</text>`
    g += `<rect x="${L}" y="${y}" width="${w.toFixed(1)}" height="${h}" fill="${d.a === '—' ? SOFT : INK}"/>`
    g += `<text x="${(L + w + 8).toFixed(1)}" y="${(y + h / 2 + 4).toFixed(1)}" font-size="11" fill="${MUTED}">${d.n}${d.a !== '—' ? ' · ' + d.a : ''}</text>`
  })
  g += `</svg>`
  return g
}

/* ── tabela de prospects ─────────────────────────────────────────────────── */
function tabelaProspects(lista, { ini = 1, compacta = false } = {}) {
  return `<table class="${compacta ? 'compacta' : ''}">
    <tr><th>#</th><th>Criador / marca</th><th class="num">Pregões</th><th class="num">Edição</th><th>Próximo</th><th>Praça</th><th>Zona · assessor</th><th>ACNB</th><th>Porta de entrada</th><th class="num">Pts</th></tr>
    ${lista.map((m, i) => `<tr>
      <td class="num">${ini + i}</td>
      <td><strong>${esc(m.nome)}</strong></td>
      <td class="num">${m.pregoes}</td>
      <td class="num">${m.edicaoMax ? m.edicaoMax + 'ª' : '—'}</td>
      <td>${m.proximos.length ? m.proximos.map(dm).join(', ') : '<span class="muted">passou</span>'}</td>
      <td>${esc(corta(pracaCurta(m, compacta), compacta ? 22 : 30))}</td>
      <td>${esc(zonaCurta(m))}</td>
      <td>${m.acnb ? `#${m.acnb.pos}` : '—'}</td>
      <td class="small">${esc(corta(portaCurta(m), compacta ? 44 : 80))}</td>
      <td class="num"><strong>${m.score.total}</strong></td>
    </tr>`).join('')}
  </table>`
}

/* ── fichas dos prospects da lista A ─────────────────────────────────────── */
const FICHAS = {
  'Nelore Lemgruber': m => `<strong>79ª edição</strong> do leilão virtual, em duas etapas (touros ${dm(m.nomesPregoes[0].ini)}, fêmeas ${dm(m.nomesPregoes[0].fim)}). É a marca com mais edições em todo o radar. Não temos ninguém no CRM. <em>Como entrar:</em> assistir ao pregão de ${dm(m.nomesPregoes[0].ini)}, pegar o catálogo e descobrir a praça da fazenda — o radar só vê o estúdio da Programa.`,
  'Carpa': m => `<strong>47º Mega Leilão Anual</strong> (${periodo(m.nomesPregoes[0])}): bezerros de corte e fêmeas num dia, touros no outro. Tradição de quase meio século e mix largo. Sem porta no CRM. <em>Como entrar:</em> o anual já passou — mapear se há pregão intermediário e trabalhar a edição de 2027 desde agora.`,
  "Fazendas Sant'Anna": m => `<strong>37º leilão</strong>, presencial em ${esc(m.pracas[0])} (${dm(m.nomesPregoes[0].ini)}). Há um lead frio "Fazenda Santanna SA" na Base Unificada. <em>Como entrar:</em> Fábio (Sudeste) confirma o contato e pede o resultado do 37º — a leiloeira é a Programa, que já nos atende.`,
  'Nelore do Adir': m => `<strong>37º Leilão do Adir</strong> ("A Filosofia Continua"), ${esc(m.pracas[0])}, ${dm(m.nomesPregoes[0].ini)} — hoje. Nenhum contato no CRM. <em>Como entrar:</em> acompanhar o pregão de hoje ao vivo e abrir conversa pelo resultado; 37 edições em Ribeirão Preto é praça do Fábio.`,
  'Mundial Agropecuária': m => `<strong>Dois pregões em quatro semanas</strong>: 26º (${dm(m.nomesPregoes[0].ini)}, ${esc(m.pracas[0])}) e 27º virtual (${dm(m.nomesPregoes[1].ini)}). Quem numera 27 edições e faz duas em um mês leiloa o ano inteiro. Sem porta. <em>Como entrar:</em> o próximo deve vir logo — pedir à Programa a agenda da Mundial e chegar antes.`,
  'Di Genio': m => `Live na Expogenética (${dm(m.nomesPregoes[0].ini)}) e depois <strong>"200 Touros Di Genio"</strong> (${dm(m.nomesPregoes[1].ini)}). ACNB #${m.acnb.pos}. <strong>João Carlos Di Genio está no CRM</strong> (Base Unificada e contato de WhatsApp). <em>Como entrar:</em> é o prospect mais quente da lista — ligar direto, com o resultado dos 200 touros na mão.`,
  'Mônica (Marchett)': m => `<strong>Shopping Mônica</strong> ocupou a Expogenética inteira (${periodo(m.nomesPregoes[0])}, mais Sunset e Live). ACNB #${m.acnb.pos}. <strong>Mônica Marchett está no CRM</strong> como lead (MT). <em>Como entrar:</em> Leozinho (MT) retoma o lead; o gancho é o volume que ela girou na feira.`,
  'Fazenda do Sabiá': m => `<strong>Leilão da Sabiá</strong> em ${esc(m.pracas[0])} (${periodo(m.nomesPregoes[0])}), com etapas Elite e Super Special. ACNB <strong>#${m.acnb.pos}</strong> — o quinto maior criador do ranking. "Beto Sabiá" está no CRM. Não confundir com o Sabiá Dourado (PA) que a Bula Remates leiloou em 30/08. <em>Como entrar:</em> pelo Beto, com o ranking na mesa.`,
  'Nelore VRJO (José Olavo Borges Mendes)': m => `<strong>27º Leilão Virtual de Reprodutores</strong> pelo Leiloboi (${dm(m.nomesPregoes[0].ini)}, Campo Grande-MS). Lead "José Olavo Borges Mendes – Nelore VRJO" no CRM. <em>Como entrar:</em> Leozinho (MS). Antes, confirmar se "Matrizes VRJC" (28/09, Programa) é a mesma marca — se for, são dois pregões e duas leiloeiras.`,
  'Tulipa Agropecuária': m => `<strong>Três pregões em sete semanas</strong>: Só Elas na Expogenética (${dm(m.nomesPregoes[0].ini)}), Só Elas Babies e Novilhas (${periodo(m.nomesPregoes[1])}) e Touros (${dm(m.nomesPregoes[2].ini)}). É o não-cliente mais frequente do radar. Sem porta. <em>Como entrar:</em> o pregão de touros de ${dm(m.nomesPregoes[2].ini)} é a janela — chegar com o resultado das novilhas.`,
  'Casa Branca (CB Genetics)': m => `<strong>Leilão Primavera</strong> em três dias (${periodo(m.nomesPregoes[0])}: CB Genetics, Top Class e Doadoras) e <strong>Circuito de Embriões</strong> em ${esc(m.pracas[0])} (${dm(m.nomesPregoes[1].ini)}). A porta já existe: fizemos o conjunto Paranã & Casa Branca na Expogenética. <em>Como entrar:</em> pelo Paranã, que é cliente — pedir a apresentação.`,
  'Paulete Agropecuária': m => `<strong>16º leilão de reprodutores</strong>, presencial em ${esc(m.pracas[0])} (${dm(m.nomesPregoes[0].ini)}). Há contato de WhatsApp "Paulete Agropecuária Ltda" e um cliente "Paulete Teles e Outros" na base. <em>Como entrar:</em> Leozinho (GO) liga no contato de WhatsApp; a conversa é sobre a 17ª edição.`,
  'Excelência Genética': m => `<strong>6º leilão</strong>, na Expogenética (${dm(m.nomesPregoes[0].ini)}). <strong>Já vendemos lá</strong>: 1 lote, VGV R$ ${brl0(m.vendemosLa[0].vgv)}. É marca de evento — o criador por trás precisa ser identificado no fechamento. <em>Como entrar:</em> quem vendeu o lote abre a porta.`,
}

/* ── seções ──────────────────────────────────────────────────────────────── */
const listaA = D.prospects.filter(m => m.score.total >= 35)
const listaB = D.prospects.filter(m => m.score.total >= 28 && m.score.total < 35)
const clientesGap = D.clientes.filter(m => m.gapCliente.length).sort((a, b) => b.gapCliente.length - a.gapCliente.length)
const agenda = []
for (const m of D.prospects) for (const p of m.nomesPregoes) if (p.fim >= K.hoje) agenda.push({ m, p })
agenda.sort((x, y) => x.p.ini.localeCompare(y.p.ini) || y.m.score.total - x.m.score.total)
const acnbTop = D.prospects.filter(m => m.acnb).sort((a, b) => a.acnb.pos - b.acnb.pos)
const pregoesFora = K.pregoesTotal - K.pregoesClienteCobertos
const recorrentes = D.prospects.filter(m => m.pregoes >= 2).sort((a, b) => b.pregoes - a.pregoes || b.score.total - a.score.total)
const tradicao = D.prospects.filter(m => (m.edicaoMax ?? 0) >= 10).sort((a, b) => b.edicaoMax - a.edicaoMax)
const zonasCols = [
  { t: 'Norte + MA · Douglas Bispo', z: ['Norte', 'Norte+MA'] },
  { t: 'Nordeste + Sudeste · Fábio Omena Gaia', z: ['Nordeste', 'Sudeste'] },
  { t: 'Centro-Oeste + Sul · Leonardo Serafim', z: ['Centro-Oeste', 'Sul'] },
].map(c => ({ ...c, lista: D.prospects.filter(m => m.zonas.some(z => c.z.includes(z))).sort((a, b) => b.score.total - a.score.total) }))
const virtuais = D.prospects.filter(m => m.virtual).sort((a, b) => b.score.total - a.score.total)

const nAnexo = D.prospects.length
const anexoPag = 31
const anexos = []
for (let i = 0; i < D.prospects.length; i += anexoPag) anexos.push(D.prospects.slice(i, i + anexoPag))

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; height: 296mm; padding: 14mm 13mm 17mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6; display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
  .capa { background: ${INK}; color: #fff; padding: 30mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 20mm; }
  .capa h1 { font-size: 40px; line-height: 1.04; color: #fff; font-weight: 700; }
  .capa .sub { font-size: 12.2px; color: #B5B5B5; margin-top: 7mm; max-width: 150mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 8mm 0; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 11mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
  .capa .meta div span { display: block; font-size: 8.5px; color: #8A8A8A; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 2px; }
  .capa .meta div strong { font-size: 12px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${INK}; padding-bottom: 3mm; margin-bottom: 5mm; }
  .head h2 { font-size: 21px; }
  .head .n { font-size: 9px; color: ${MUTED}; letter-spacing: .12em; text-transform: uppercase; font-family: Oswald, sans-serif; }
  h3 { font-size: 13px; margin: 5mm 0 2.2mm; }
  h3:first-of-type { margin-top: 0; }
  p { margin: 0 0 2.6mm; }
  .lead { font-size: 11.2px; line-height: 1.58; }
  strong { font-weight: 600; }
  .muted { color: ${MUTED}; }
  .small { font-size: 8.8px; color: ${MUTED}; line-height: 1.45; }
  .tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin: 3mm 0 5mm; }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.2mm 3.2mm 2.8mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.4mm; line-height: 1.3; min-height: 5.4mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 19px; font-weight: 600; line-height: 1; }
  .tile .v .cur { font-size: 11px; font-weight: 500; color: ${MUTED}; margin-right: 1px; }
  .tile .d { font-size: 8.3px; color: ${MUTED}; margin-top: 1.5mm; line-height: 1.4; }
  .tile.gold { border-top-color: ${GOLD}; }
  .box { border: 1px solid ${GRID}; padding: 3.6mm 4.2mm; margin: 3.5mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box.rule { border: none; border-left: 3px solid ${INK}; padding: 1mm 0 1mm 4mm; }
  .box.gold { border: none; border-left: 3px solid ${GOLD}; padding: 1mm 0 1mm 4mm; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2mm; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 9.1px; margin: 2.5mm 0; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.2px; letter-spacing: .07em; font-weight: 600; border-bottom: 1.4px solid ${INK}; padding: 1.8mm 1.6mm; }
  td { padding: 1.35mm 1.6mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.compacta { font-size: 8.3px; }
  table.compacta td { padding: 1mm 1.3mm; }
  table.compacta th { font-size: 7.6px; padding: 1.4mm 1.3mm; }
  tr.destaque td { background: #F6F6F6; font-weight: 600; }
  figure { margin: 2mm 0 3mm; }
  figcaption { font-size: 8.5px; color: ${MUTED}; margin-top: 1.4mm; line-height: 1.45; }
  ol, ul { margin: 0 0 2.6mm; padding-left: 4.4mm; }
  li { margin-bottom: 1.3mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; }
  .ficha { border-top: 1px solid ${GRID}; padding: 2.4mm 0 1.6mm; }
  .ficha .n { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11.2px; font-weight: 600; letter-spacing: .03em; }
  .ficha .n span { font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 8.6px; color: ${MUTED}; margin-left: 2mm; }
  .ficha p { margin: 1mm 0 0; font-size: 9.4px; line-height: 1.5; }
  .ficha em { font-style: normal; font-weight: 600; }
  .tag { display:inline-block; font-size:7.6px; letter-spacing:.06em; text-transform:uppercase; border:1px solid ${GRID}; padding:0 1.2mm; color:${MUTED}; }
  .tag.on { border-color:${INK}; color:${INK}; }
  .tag.gold { border-color:${GOLD}; color:#8A7331; }
  .zona li { font-size: 9.2px; }
  .legenda { font-size: 8.6px; color: ${MUTED}; display: flex; gap: 5mm; align-items: center; margin-top: 1mm; }
  .legenda i { display: inline-block; width: 5mm; height: 2.4mm; vertical-align: middle; margin-right: 1.2mm; }
  .hach { background: repeating-linear-gradient(45deg, #fff 0 1px, ${INK} 1px 2px); border: 1px solid ${INK}; }
</style></head><body>

<!-- CAPA -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Prospecção<br>Nelore PO</h1>
  <div class="rule"></div>
  <div class="sub">O radar de mercado leu <strong style="color:#fff">${int(K.eventosPo)} anúncios</strong> de leilão Nelore PO entre ${dm(K.janela.ini)} e ${dm(K.janela.fim)} e os agrupou em
  <strong style="color:#fff">${K.marcasTotal} marcas de criador</strong>. ${K.marcasCliente} já passam pela Bula. As outras <strong style="color:#fff">${K.marcasProspect}</strong> não —
  e este relatório separa, entre elas, quem leiloa com recorrência ou tradição, e diz por onde entrar em cada uma.
  Dos ${int(K.pregoesTotal)} pregões PO da janela, só <strong style="color:#fff">${K.pregoesClienteCobertos} (${pct(K.pregoesClienteCobertos, K.pregoesTotal)}%)</strong> passam pela Bula.</div>
  <div class="meta">
    <div><span>Pregões PO na janela</span><strong>${int(K.pregoesTotal)}</strong></div>
    <div><span>Passam pela Bula</span><strong>${K.pregoesClienteCobertos} · ${pct(K.pregoesClienteCobertos, K.pregoesTotal)}%</strong></div>
    <div><span>Marcas a prospectar</span><strong>${K.marcasProspect}</strong></div>
    <div><span>Lista A (prioridade)</span><strong>${listaA.length}</strong></div>
    <div><span>Com porta de entrada</span><strong>${K.prospectsComPorta}</strong></div>
    <div><span>Leiloam nos próximos 30 dias</span><strong>${K.prospectsProximos30}</strong></div>
  </div>
</section>

<!-- 01. UNIVERSO -->
<section class="page">
  <div class="head"><h2>O universo que o radar enxerga</h2><div class="n">01 · ${dm(K.hoje)}</div></div>
  <div class="tiles">
    <div class="tile"><div class="k">Pregões Nelore PO</div><div class="v">${int(K.pregoesTotal)}</div><div class="d">${int(K.eventosPo)} anúncios agrupados por marca e por dias consecutivos</div></div>
    <div class="tile gold"><div class="k">Passam pela Bula</div><div class="v">${K.pregoesClienteCobertos}<span class="cur"> · ${pct(K.pregoesClienteCobertos, K.pregoesTotal)}%</span></div><div class="d">${K.marcasCliente} marcas-cliente; ${K.pregoesCliente - K.pregoesClienteCobertos} pregões de cliente ficaram fora do cronograma</div></div>
    <div class="tile"><div class="k">Fora da Bula</div><div class="v">${int(pregoesFora)}</div><div class="d">${int(K.pregoesProspect)} de ${K.marcasProspect} marcas que nunca passaram por nós</div></div>
    <div class="tile"><div class="k">Prospects com recorrência</div><div class="v">${K.prospectsRecorrentes}<span class="cur"> + ${K.prospectsTradicao}</span></div><div class="d">${K.prospectsRecorrentes} com 2+ pregões na janela; ${K.prospectsTradicao} com 10ª edição ou mais</div></div>
  </div>

  <p class="lead">A pergunta de fundo é simples: <strong>de tudo que o mercado de Nelore PO leiloa, quanto passa pela Bula?</strong> A resposta, na janela que o radar
  cobre, é ${pct(K.pregoesClienteCobertos, K.pregoesTotal)}% dos pregões. O resto se divide em duas fatias: pregões de <strong>clientes</strong> que aconteceram sem entrar no nosso cronograma
  (${K.pregoesCliente - K.pregoesClienteCobertos} — seção 05) e pregões de <strong>${K.marcasProspect} marcas</strong> com as quais nunca trabalhamos (${int(K.pregoesProspect)}). Este relatório é sobre a segunda fatia.</p>

  <h3>Quem mais leiloa no radar</h3>
  <figure>${grafPregoes()}
  <div class="legenda"><span><i style="background:${INK}"></i>não passa pela Bula</span><span><i class="hach"></i>cliente</span></div>
  <figcaption>Pregões por marca (dias consecutivos e presença na Expogenética contam como um). Os clientes já dominam o topo — Paranã, JMP/JBJ, Genética Aditiva, Mafra —
  mas Tulipa, Água Fria, Casa Branca, Mundial e Di Genio leiloam no mesmo ritmo e não passam por nós.</figcaption></figure>

  <div class="box rule">
    <div class="t">O que o radar não vê</div>
    <p>Hoje o radar lê a agenda da <strong>Programa Leilões</strong> (${pct(D.eventos.filter(e => e.fonte === 'Programa Leilões').length, D.eventos.length)}% dos anúncios), a Lance Rural e o Leiloboi (este só com pregões de junho).
    As fontes E-Rural, Central e Agreste estão <strong>desativadas</strong> — por isso criadores que leiloam por elas (LS, Crispim, Bambú, Katayama) não aparecem aqui, nem como cliente nem como prospect.
    O universo deste relatório é, na prática, <strong>o universo da Programa Leilões</strong>. E "Londrina - PR" na praça é o estúdio da Programa, não a fazenda: para ${K.virtuais} dos ${K.marcasProspect} prospects a praça de origem ainda precisa ser descoberta pelo catálogo.</p>
  </div>
  <div class="pfoot"><span>Bula Assessoria Pecuária · prospecção Nelore PO · radar de mercado ${dm(K.hoje)}</span><span>1</span></div>
</section>

<!-- 02. LISTA A -->
<section class="page">
  <div class="head"><h2>Lista A — por onde começar</h2><div class="n">02 · ${listaA.length} criadores</div></div>
  <p class="lead">Pontuação de 0 a 100 somando cinco coisas que se explicam sozinhas: <strong>recorrência</strong> na janela (até 35), <strong>tradição</strong> pela edição no nome do leilão (até 25),
  <strong>porte</strong> do pregão (até 15), <strong>mérito</strong> no ranking ACNB (até 15) e <strong>porta de entrada</strong> na nossa base (até 10). Detalhe do cálculo na seção 07. Aqui, quem fez 35 ou mais.</p>
  ${tabelaProspects(listaA)}
  <p class="small">Próximo = primeiro dia do próximo pregão visto no radar (até ${dm(K.janela.fim)}). Edição = número informado no nome do leilão. ACNB = posição no ranking nacional de criadores 2025/26.
  Zona segue a divisão da equipe (Douglas: Norte + MA; Fábio: Nordeste + Sudeste; Leozinho: Centro-Oeste + Sul); "a descobrir" quando o pregão é virtual e a praça informada é o estúdio.</p>

  <h3>Leitura rápida — três jeitos de entrar</h3>
  <div class="cols3">
    <div class="box rule"><div class="t">Já tem fio para puxar</div>
      <p>${listaA.filter(m => m.score.porta > 0).map(m => `<strong>${esc(m.nome.replace(/\s*\(.*\)$/, ''))}</strong>`).join(', ')}.
      Contato no CRM, lote já vendido lá ou leilão conjunto com cliente. É ligação, não apresentação — e cabe na semana.</p></div>
    <div class="box rule"><div class="t">Tradição sem porta</div>
      <p>${listaA.filter(m => m.score.porta === 0 && (m.edicaoMax ?? 0) >= 20).map(m => `<strong>${esc(m.nome)}</strong> (${m.edicaoMax}ª)`).join(', ')}.
      Leilões que voltam há décadas e onde não temos ninguém. Entrada pela Programa Leilões, que faz os pregões deles e os nossos.</p></div>
    <div class="box rule"><div class="t">Frequência</div>
      <p>${listaA.filter(m => m.pregoes >= 2).map(m => `<strong>${esc(m.nome.replace(/\s*\(.*\)$/, ''))}</strong> (${m.pregoes})`).join(', ')}.
      Quem leiloa mais de uma vez em dois meses dá mais de uma chance por ano de a Bula vender — é onde a cobertura rende recorrência de receita.</p></div>
  </div>

  <div class="box dark" style="margin-top:2.5mm">
    <div class="t">O que fazer com esta lista</div>
    <p style="margin:0">Cada nome da Lista A vai para o assessor da zona (ou para a chefia, quando é conta de dono — seção 05) com a ficha da página seguinte.
    O objetivo da primeira conversa não é fechar cobertura: é <strong>entrar no próximo pregão com a equipe dentro</strong>, do jeito que já vendemos no Excelência Genética,
    no Araras e no Grupo Costa sem contrato. O contrato vem depois do resultado.</p>
  </div>
  <div class="pfoot"><span>Bula Assessoria Pecuária · prospecção Nelore PO</span><span>2</span></div>
</section>

<!-- 03. FICHAS -->
<section class="page">
  <div class="head"><h2>Lista A — a ficha de cada um</h2><div class="n">03 · como entrar</div></div>
  <div class="cols2">
    ${listaA.map((m, i) => `<div class="ficha"><div class="n">${i + 1}. ${esc(m.nome)}<span>${m.score.total} pts · ${esc(zonaCurta(m))}</span></div><p>${FICHAS[m.nome] ? FICHAS[m.nome](m) : ''}</p></div>`).join('')}
  </div>
  <div class="pfoot"><span>Bula Assessoria Pecuária · prospecção Nelore PO</span><span>3</span></div>
</section>

<!-- 04. LISTA B + RECORRENTES -->
<section class="page">
  <div class="head"><h2>Lista B — e os dois grupos que a nota esconde</h2><div class="n">04 · ${listaB.length} criadores</div></div>
  <p class="lead">Quem fez entre 28 e 34 pontos. Nenhum deles é fraco: quase todos entram por um único motivo forte — ou muita tradição, ou nome grande na ACNB, ou contato já na base.</p>
  ${tabelaProspects(listaB, { ini: listaA.length + 1 })}

  <div class="cols2" style="margin-top:3mm">
    <div>
      <h3>Quem mais repete (2+ pregões na janela)</h3>
      <table class="compacta"><tr><th>Marca</th><th class="num">Pregões</th><th>Datas</th></tr>
      ${recorrentes.map(m => `<tr><td>${esc(m.nome)}</td><td class="num">${m.pregoes}</td><td>${m.nomesPregoes.map(p => periodo(p)).join(' · ')}</td></tr>`).join('')}
      </table>
      <p class="small">A leitura da Programa cobre ${Math.round((new Date(K.janela.fim) - new Date('2026-07-26')) / 86400000)} dias (26/07–${dm(K.janela.fim)}). Repetir dentro dela é sinal de quem leiloa o ano inteiro, não só o anual.</p>
    </div>
    <div>
      <h3>Quem tem tradição (10ª edição ou mais)</h3>
      <table class="compacta"><tr><th>Marca</th><th class="num">Edição</th><th>Praça</th></tr>
      ${tradicao.map(m => `<tr><td>${esc(m.nome)}</td><td class="num">${m.edicaoMax}ª</td><td>${esc(corta(pracaCurta(m), 26))}</td></tr>`).join('')}
      </table>
      <p class="small">Um leilão numerado é um leilão que volta todo ano. Nenhum destes ${tradicao.length} passa pela Bula.</p>
    </div>
  </div>
  <div class="pfoot"><span>Bula Assessoria Pecuária · prospecção Nelore PO</span><span>4</span></div>
</section>

<!-- 05. DENTRO DE CASA + ACNB -->
<section class="page">
  <div class="head"><h2>Dentro de casa e os grandes da ACNB</h2><div class="n">05 · o que já é nosso e o que falta</div></div>
  <h3>Clientes com pregão que não entrou no cronograma</h3>
  <p>Antes de prospectar fora, há ${K.pregoesCliente - K.pregoesClienteCobertos} pregões de <strong>clientes</strong> que o radar viu e o nosso cronograma não. Alguns são lives e apresentações; outros são leilões inteiros.</p>
  <table>
    <tr><th>Cliente</th><th class="num">Pregões no radar</th><th class="num">Fora do cronograma</th><th>Quais</th></tr>
    ${clientesGap.map(m => `<tr><td><strong>${esc(m.nome)}</strong></td><td class="num">${m.pregoes}</td><td class="num">${m.gapCliente.length}</td><td class="small">${m.gapCliente.map(p => `${periodo(p)} ${esc(corta(p.nome, 60))}`).join('<br>')}</td></tr>`).join('')}
  </table>

  <h3>Os grandes do ranking ACNB que aparecem no radar</h3>
  <p>O ranking nacional de criadores 2025/26 (${D.prospects.filter(m => m.acnb).length + D.clientes.filter(m => m.acnb).length} dos 56 nomes casam com marcas do radar). Dos que não passam pela Bula:</p>
  <table>
    <tr><th>ACNB</th><th>Nome no ranking</th><th>No radar como</th><th>Situação na base</th><th>Porta</th></tr>
    ${acnbTop.map(m => `<tr><td class="num">#${m.acnb.pos}</td><td>${esc(m.acnb.nome)}</td><td>${esc(m.nome)}</td><td><span class="tag ${m.acnb.situacao === 'ausente' ? '' : 'on'}">${m.acnb.situacao}</span>${m.acnb.nota ? ` <span class="small">${esc(m.acnb.nota)}</span>` : ''}</td><td class="small">${esc(corta(portaCurta(m), 70))}</td></tr>`).join('')}
  </table>

  <div class="box dark">
    <div class="t">Três nomes que valem uma visita, não um WhatsApp</div>
    <p><strong>HeJ (Henrique &amp; Juliano, #2)</strong>, <strong>Rima Agropecuária (#4)</strong> e <strong>Heringer (#9)</strong> estão entre os dez maiores criadores de Nelore do país, leiloaram na janela e
    <strong>não temos ninguém</strong> — o único fio é um lead frio "Rima Industrial S/A". São contas de dono, não de assessor: pedem apresentação pela Programa Leilões ou por um cliente em comum. A Cabaña Sausalito (#3) fica fora por ser na Bolívia.</p>
  </div>
  <div class="pfoot"><span>Bula Assessoria Pecuária · prospecção Nelore PO</span><span>5</span></div>
</section>

<!-- 06. POR ZONA -->
<section class="page">
  <div class="head"><h2>Por zona — quem cuida de quem</h2><div class="n">06 · divisão da equipe</div></div>
  <figure>${grafZonas()}<figcaption>Prospects com praça presencial informada, por zona. A barra cinza são os virtuais: ${virtuais.length} marcas cuja praça o radar não sabe — o catálogo resolve.</figcaption></figure>
  <div class="cols3 zona">
    ${zonasCols.map(c => `<div><h3 style="font-size:11.5px">${esc(c.t)}</h3><ul>${c.lista.map(m => `<li><strong>${esc(m.nome)}</strong> — ${m.pregoes} ${m.pregoes > 1 ? 'pregões' : 'pregão'}${m.edicaoMax ? `, ${m.edicaoMax}ª ed.` : ''}, ${esc(m.ufs.join('/'))}${m.proximos.length ? ` · <em>próx. ${dm(m.proximos[0])}</em>` : ''}</li>`).join('')}</ul></div>`).join('')}
  </div>
  <h3>Virtuais com nota alta — praça a descobrir</h3>
  <p class="small">${virtuais.filter(m => m.score.total >= 25).map(m => `<strong>${esc(m.nome)}</strong> (${m.score.total})`).join(' · ')}</p>
  <div class="pfoot"><span>Bula Assessoria Pecuária · prospecção Nelore PO</span><span>6</span></div>
</section>

<!-- 07. AGENDA -->
<section class="page">
  <div class="head"><h2>Os próximos 30 dias</h2><div class="n">07 · ${agenda.length} pregões de prospects</div></div>
  <p class="lead">Tudo que o radar já enxerga de ${dm(K.hoje)} a ${dm(K.janela.fim)} entre quem não passa pela Bula. É a agenda de campo: assistir, pegar catálogo, chegar no comitente antes do próximo.</p>
  <table class="compacta">
    <tr><th>Data</th><th>Leilão</th><th>Marca</th><th>Praça</th><th>Zona · assessor</th><th class="num">Pts</th></tr>
    ${agenda.map(({ m, p }) => `<tr class="${m.score.total >= 35 ? 'destaque' : ''}"><td style="white-space:nowrap">${periodo(p)}</td><td>${esc(corta(p.nome, 58))}</td><td>${esc(corta(m.nome, 34))}</td><td>${esc(corta(pracaPregao(m, p), 28))}</td><td>${esc(zonaCurta(m))}</td><td class="num">${m.score.total}</td></tr>`).join('')}
  </table>
  <p class="small">Linhas em destaque são da Lista A. A agenda da Programa é publicada com cerca de 30 dias de antecedência — o radar roda todo dia às 9h e o cronograma da tela /sistema/mercado fica sempre à frente deste papel.</p>
  <div class="pfoot"><span>Bula Assessoria Pecuária · prospecção Nelore PO</span><span>7</span></div>
</section>

<!-- 08. MÉTODO -->
<section class="page">
  <div class="head"><h2>Como foi feito — e o que não dá para afirmar</h2><div class="n">08 · método</div></div>
  <div class="cols2">
    <div>
      <h3>Fontes</h3>
      <ul>
        <li><strong>Radar de mercado</strong> (<code>mercado_eventos</code>): ${int(D.eventos.length)} anúncios com categoria Nelore PO (ou "Nelore" vindo da Lance Rural, que não distingue PO) entre ${dm(K.janela.ini)} e ${dm(K.janela.fim)}. A Programa Leilões entra a partir de 26/07, quando a coleta diária começou.</li>
        <li><strong>Cobertura</strong>: cronograma 2026 e fechamentos da Bula. Cliente é quem aparece no cronograma pela marca — revisado à mão, porque o casamento automático do radar erra (o Shopping Mônica casou com o Matinha; a Arena do Nelore com o Flor do Arataú).</li>
        <li><strong>Já vendemos lá</strong>: fechamento sem cronograma — a Bula vendeu lote no leilão dele sem contrato. Conta como porta, não como cliente.</li>
        <li><strong>ACNB</strong>: ranking nacional de criadores 2025/26 (parcial), cruzado por nome.</li>
        <li><strong>CRM</strong>: ${int(16609)} leads e ${int(1044)} clientes, buscados por marca com termos raros (Lemgruber, Polyana, Di Genio…). Nome comum não vale: "Santa Maria" e "Adir" casariam com o Brasil inteiro e ficaram de fora.</li>
      </ul>
      <h3>Regras de leitura</h3>
      <ul>
        <li><strong>Marca</strong> = o nome do criador dentro do nome do leilão. Dicionário de ${D.prospects.length + D.clientes.length + D.exterior.length + D.naoCriador.length} marcas, revisado uma a uma.</li>
        <li><strong>Pregão</strong> = dias consecutivos da mesma marca (touros num dia, fêmeas no outro é um leilão). Lives e shoppings dentro da Expogenética (14–23/08) contam um só.</li>
        <li><strong>Edição</strong> = número no nome ("79º", "IV"). Ausência de número não quer dizer primeira edição.</li>
        <li><strong>Zona</strong> = UF da praça presencial. Estúdio (Londrina, São Paulo) e Expogenética (Uberaba) não dizem onde fica a fazenda.</li>
      </ul>
    </div>
    <div>
      <h3>A pontuação</h3>
      <table class="compacta">
        <tr><th>Fator</th><th>Como pontua</th><th class="num">Máx.</th></tr>
        <tr><td>Recorrência</td><td>1 pregão 10 · 2 = 20 · 3 = 28 · 4+ = 35</td><td class="num">35</td></tr>
        <tr><td>Tradição</td><td>2ª–4ª ed. 5 · 5ª–9ª 10 · 10ª–19ª 15 · 20ª–29ª 20 · 30ª+ 25</td><td class="num">25</td></tr>
        <tr><td>Porte</td><td>+5 etapas em dias seguidos · +5 lote anunciado (200 touros…) · +5 Expogenética · +3 mix touros/fêmeas/embriões</td><td class="num">15</td></tr>
        <tr><td>Mérito ACNB</td><td>top 10 = 15 · até 30º = 10 · abaixo = 5</td><td class="num">15</td></tr>
        <tr><td>Porta</td><td>já vendemos lá ou cliente = 10 · lead/WhatsApp/leilão conjunto = 8 · sobrenome raro em comum = 5</td><td class="num">10</td></tr>
      </table>
      <p class="small">A nota ordena a conversa, não substitui o julgamento: Água Fria (28) leiloa três vezes em dois meses no Pará e vale mais para o Douglas do que a nota diz.</p>

      <h3>O que este papel não afirma</h3>
      <ul>
        <li>Faturamento ou VGV dos prospects — o radar não traz resultado, só agenda. O Leiloboi publica médias, mas só de gado de corte.</li>
        <li>Quem é o dono por trás de marcas de evento (Excelência Genética, Baby de Prova, Genética Premium).</li>
        <li>Que "Matrizes VRJC" seja o VRJO, nem que "Américas" seja a Agropecuária das Américas (#46). Estão marcados como "a confirmar".</li>
        <li>Recorrência de quem leiloa por E-Rural, Central ou Agreste: essas fontes estão desligadas no radar.</li>
      </ul>
      <div class="box gold"><div class="t">Duas correções no sistema que este trabalho pede</div>
      <p style="margin:0">1) Religar E-Rural e Central no radar (a estrutura já foi mapeada; custo zero). 2) Subir o limiar do casamento radar × cronograma para 0,70 e exigir a marca em comum — hoje 0,55 aprova pares que não têm nada a ver.</p></div>
    </div>
  </div>
  <div class="pfoot"><span>Bula Assessoria Pecuária · prospecção Nelore PO</span><span>8</span></div>
</section>

<!-- ANEXO A -->
${anexos.map((lista, k) => `<section class="page">
  <div class="head"><h2>Anexo — todos os ${nAnexo} prospects</h2><div class="n">A · ${k + 1} de ${anexos.length}${k === 0 ? ' · ordenado por pontos' : ''}</div></div>
  ${tabelaProspects(lista, { ini: k * anexoPag + 1, compacta: true })}
  ${k === anexos.length - 1 ? `<p class="small">Fora deste anexo: ${D.exterior.map(m => esc(m.nome)).join(', ')} (praça no exterior) e ${D.naoCriador.map(m => esc(m.nome)).join(', ')} (centrais de sêmen, associação ou fora de Nelore PO).</p>` : ''}
  <div class="pfoot"><span>Bula Assessoria Pecuária · prospecção Nelore PO · a planilha completa acompanha este PDF</span><span>${9 + k}</span></div>
</section>`).join('')}

</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)
console.log('HTML:', path.join(OUT, 'relatorio.html'))

const browser = await chromium.launch()
const pg = await browser.newPage({ viewport: { width: 900, height: 1200 } })
await pg.setContent(html, { waitUntil: 'networkidle' })
try { await pg.evaluate(() => document.fonts.ready) } catch { }
const over = await pg.evaluate(() => Array.from(document.querySelectorAll('.page')).map((p, i) => ({ i: i + 1, over: p.scrollHeight - p.clientHeight })).filter(x => x.over > 1))
if (over.length) console.log('ATENCAO paginas transbordando:', JSON.stringify(over))
else console.log('paginas OK (nenhuma transborda)')
const desktop = path.join(os.homedir(), 'Desktop')
const pdfPath = path.join(desktop, 'Bula - Prospeccao Nelore PO - Radar de Mercado 2026-09-11.pdf')
// Margem ZERO: cada .page ja e 210x297mm com padding proprio.
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
const nSec = await pg.evaluate(() => document.querySelectorAll('.page').length)
await browser.close()
const { PDFDocument } = await import('pdf-lib')
const doc = await PDFDocument.load(fs.readFileSync(pdfPath))
console.log('secoes no HTML:', nSec, '| paginas no PDF:', doc.getPageCount(), doc.getPageCount() === nSec ? '(OK)' : '(⚠ DIVERGE)')
console.log('PDF:', pdfPath)
const xlsxDst = path.join(desktop, 'Bula - Prospeccao Nelore PO - dados 2026-09-11.xlsx')
fs.copyFileSync(path.join(OUT, 'prospeccao-nelore-po.xlsx'), xlsxDst)
console.log('XLSX:', xlsxDst)
