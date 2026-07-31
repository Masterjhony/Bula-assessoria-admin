// Um PDF POR ASSESSOR com os clientes dele: os cadastros aprovados nos grupos
// das leiloeiras que caem na zona dele (ou que o grupo direcionou), os aprovados
// da lista da leiloeira, e a carteira que ele já tem hoje em CLIENTES.
//
// Mesma apuração do relatório geral — os dados vêm de
// scripts/lib/cadastros-aprovados-grupos.mjs, para os dois nunca divergirem.
// O que este script faz a mais é ir ao banco buscar telefone/CPF de quem já
// existe na base e a carteira atual de cada um.
//
// Uso: node scripts/gera-relatorio-por-assessor-2026-07-31.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { chromium } from 'playwright'
import { distribuicao, semAssessor, esc, loadEnv } from './lib/cadastros-aprovados-grupos.mjs'

const env = loadEnv(readFileSync)
const HOJE = '31 de julho de 2026'

/* Chave de nome: minúsculo, sem acento, sem o que vem depois do travessão
   (as fichas do grupo trazem "Fulano — Faz. Tal", a base guarda só o nome). */
const chave = s => String(s ?? '')
    .split(/[—–]/)[0]
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()

const { rows: clientes } = await db.query(
    `select nome, uf, cidade, telefone, cpf, responsavel, status, perfil, recorrente, created_at
     from clientes order by nome`)
const { rows: leads } = await db.query(
    `select nome, estado uf, cidade, coalesce(celular, telefone) telefone, cpf
     from crm_leads where coalesce(arquivado, false) = false`)

const porNome = new Map()
for (const l of leads) if (!porNome.has(chave(l.nome))) porNome.set(chave(l.nome), { ...l, origem: 'lead' })
for (const c of clientes) porNome.set(chave(c.nome), { ...c, origem: 'cliente' }) // cliente ganha do lead

const fmtFone = v => {
    const d = String(v ?? '').replace(/\D/g, '')
    if (d.length === 13 && d.startsWith('55')) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
    // 12 dígitos com DDI: o nono dígito não foi cadastrado. Formata como está —
    // inventar o 9 aqui é entregar telefone que não completa a ligação.
    if (d.length === 12 && d.startsWith('55')) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    return String(v ?? '')
}

/** "Cidade / UF" ignorando travessão-placeholder vindo da planilha. */
const cidadeUf = (cidade, uf) =>
    [cidade, uf].map(s => String(s ?? '').trim()).filter(s => s && s !== '—' && s !== '-').join(' / ') || '—'

/** Completa contato/cidade com o que a base tem, sem sobrescrever o que veio do grupo. */
function enriquecer(row, assessor) {
    const b = porNome.get(chave(row.cliente))
    return {
        ...row,
        fone: row.fone || (b?.telefone ? fmtFone(b.telefone) : ''),
        cidade: row.cidade || b?.cidade || '',
        cpf: row.cpf || b?.cpf || '',
        naBase: b ? (b.origem === 'cliente' ? 'CLIENTES' : 'CRM') : null,
        jaSeu: b?.origem === 'cliente' && b.responsavel === assessor,
    }
}

/* ── HTML ────────────────────────────────────────────────────────────────── */
const CSS = `
  @page { size: A4; margin: 13mm 11mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #111; font-size: 9.6px; line-height: 1.45; margin: 0; padding-bottom: 8mm; }
  h1, h2 { font-family: 'Oswald', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: .02em; margin: 0; font-weight: 700; }
  h1 { font-size: 24px; line-height: 1.05; }
  h2 { font-size: 12.5px; margin: 16px 0 5px; padding-bottom: 3px; border-bottom: 1.5px solid #111; }
  .cap { border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
  .cap .zona { font-size: 10px; color: #444; margin-top: 5px; text-transform: uppercase; letter-spacing: .06em; }
  .cap .meta { font-size: 8.6px; color: #666; text-align: right; }
  .cap .tot { font-family: 'Oswald', Arial, sans-serif; font-size: 34px; line-height: 1; }
  .cap .tot small { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.6px; color: #666; display: block; text-transform: uppercase; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: #111; color: #fff; font-size: 8.4px; text-transform: uppercase; letter-spacing: .04em; text-align: left; padding: 5px 6px; font-weight: 600; }
  td { border-bottom: .6px solid #d5d5d5; padding: 5px 6px; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .nome { font-weight: 600; }
  .num { white-space: nowrap; }
  .ev { color: #333; font-style: italic; }
  .obs { color: #444; }
  .micro { font-size: 8px; color: #777; }
  .warn { font-weight: 700; }
  .box { border: 1px solid #111; padding: 9px 11px; margin: 8px 0 4px; }
  .box.grey { border: none; background: #f2f2f2; }
  ul { margin: 4px 0 0; padding-left: 15px; }
  li { margin-bottom: 2px; }
  .vazio { color: #666; font-style: italic; padding: 6px 0; }
  footer { position: fixed; bottom: 4mm; left: 0; right: 0; font-size: 7.6px; color: #888; display: flex; justify-content: space-between; }
`

function paginaAssessor(d) {
    const grupo = d.grupo.map(r => enriquecer(r, d.assessor))
    const lista = d.lista.map(r => enriquecer(r, d.assessor))
    const carteira = clientes.filter(c => c.responsavel === d.assessor)
    const aAssumir = [...grupo, ...lista].filter(r => !r.jaSeu)
    const realocar = lista.filter(r => r.divergente)

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Carteira ${esc(d.assessor)} — 31/07/2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>

<div class="cap">
  <div>
    <h1>${esc(d.assessor)}</h1>
    <div class="zona">${esc(d.zonas)}</div>
  </div>
  <div class="meta">
    <div class="tot">${grupo.length + lista.length}<small>clientes aprovados nesta apuração</small></div>
    <div style="margin-top:6px">Bula Assessoria · ${HOJE}<br>cadastros aprovados nos grupos · 08/07 a 31/07/2026</div>
  </div>
</div>

<div class="box">
  <strong>O que é esta lista.</strong> São os cadastros <strong>aprovados pelas leiloeiras</strong> (Bula Remates e Programa Leilões)
  que caem na sua região — ou que o próprio grupo direcionou para você. ${aAssumir.length
        ? `<strong>${aAssumir.length} ainda não estão na sua carteira em CLIENTES</strong> e precisam ser assumidos.`
        : 'Todos já estão na sua carteira em CLIENTES.'}
  A aprovação é da leiloeira: o cliente está habilitado a comprar parcelado.
</div>

<h2>1. Aprovados no grupo (${grupo.length})</h2>
${grupo.length ? `
<table>
  <thead><tr>
    <th style="width:23%">Cliente</th><th style="width:13%">Contato</th><th style="width:11%">Cidade / UF</th>
    <th style="width:8%">Leiloeira</th><th style="width:6%">Data</th>
    <th style="width:22%">Como foi aprovado</th><th style="width:17%">O que falta</th>
  </tr></thead>
  <tbody>${grupo.map(r => `
    <tr>
      <td class="nome">${esc(r.cliente)}${r.cpf ? `<br><span class="micro">CPF ${esc(r.cpf)}</span>` : ''}</td>
      <td class="num">${esc(r.fone || '—')}</td>
      <td>${esc(cidadeUf(r.cidade, r.uf))}</td>
      <td>${esc(r.grupo === 'Remates' ? 'Bula Remates' : 'Programa')}</td>
      <td class="num">${esc(r.data)}</td>
      <td class="ev">${esc(r.evidencia)}</td>
      <td class="obs">${r.jaSeu ? 'Já está na sua carteira. ' : '<span class="warn">Assumir em CLIENTES. </span>'}${esc(r.obs || '')}</td>
    </tr>`).join('')}
  </tbody>
</table>` : '<div class="vazio">Nenhum cadastro aprovado no grupo caiu na sua região no período.</div>'}

<h2>2. Aprovados pela lista da leiloeira (${lista.length})</h2>
${lista.length ? `
<div class="box grey">
  Vieram das relações de cadastro que as leiloeiras mandam por e-mail — aprovação igual, só não passou pelo grupo.
  ${realocar.length ? `<strong>${realocar.length} está${realocar.length > 1 ? 'ão' : ''} hoje com outro responsável e deve${realocar.length > 1 ? 'm' : ''} passar para você pela regra de zona.</strong>` : ''}
</div>
<table>
  <thead><tr>
    <th style="width:26%">Cliente</th><th style="width:14%">Contato</th><th style="width:14%">Cidade / UF</th>
    <th style="width:16%">Leiloeiras</th><th style="width:15%">Responsável hoje</th><th style="width:15%">Situação</th>
  </tr></thead>
  <tbody>${lista.map(r => `
    <tr>
      <td class="nome">${esc(r.cliente)}${r.cpf ? `<br><span class="micro">CPF ${esc(r.cpf)}</span>` : ''}${r.obs ? `<br><span class="micro">${esc(r.obs)}</span>` : ''}</td>
      <td class="num">${esc(r.fone || '—')}</td>
      <td>${esc(cidadeUf(r.cidade, r.uf))}</td>
      <td>${esc(r.leiloeiras)}</td>
      <td>${esc(r.atual)}</td>
      <td>${r.divergente ? '<span class="warn">PASSAR PARA VOCÊ</span>' : (r.jaSeu ? 'já é seu' : 'conferir')}</td>
    </tr>`).join('')}
  </tbody>
</table>` : '<div class="vazio">Nenhum.</div>'}

<h2>3. Sua carteira hoje em CLIENTES (${carteira.length})</h2>
${carteira.length ? `
<table>
  <thead><tr>
    <th style="width:34%">Cliente</th><th style="width:16%">Contato</th><th style="width:20%">Cidade / UF</th>
    <th style="width:14%">CPF</th><th style="width:16%">Situação</th>
  </tr></thead>
  <tbody>${carteira.map(c => `
    <tr>
      <td class="nome">${esc(c.nome)}</td>
      <td class="num">${esc(fmtFone(c.telefone) || '—')}</td>
      <td>${esc(cidadeUf(c.cidade, c.uf))}</td>
      <td class="num">${esc(c.cpf || '—')}</td>
      <td>${esc(c.status || '—')}${c.recorrente ? ' · recorrente' : ''}</td>
    </tr>`).join('')}
  </tbody>
</table>` : '<div class="vazio">Você ainda não tem cliente nenhum atribuído em CLIENTES.</div>'}

<h2>4. O que fazer</h2>
<div class="box">
  <ul>
    ${aAssumir.length ? `<li><strong>Assumir ${aAssumir.length} cliente${aAssumir.length > 1 ? 's' : ''} em CLIENTES</strong> — eles estão aprovados e sem dono na base.</li>` : ''}
    ${realocar.length ? `<li><strong>${realocar.length} ${realocar.length > 1 ? 'realocações' : 'realocação'}</strong> — hoje ${realocar.map(r => esc(r.cliente)).join(', ')} aparece${realocar.length > 1 ? 'm' : ''} com outro responsável.</li>` : ''}
    ${grupo.filter(r => !r.fone).length ? `<li><strong>${grupo.filter(r => !r.fone).length} sem telefone na base</strong> — pegar o contato com quem levou o cliente ao grupo antes de ligar.</li>` : ''}
    <li>Cliente aprovado tem prazo curto de interesse: falar com ele enquanto o cadastro está fresco.</li>
    <li>Dúvida sobre a aprovação? A frase exata da leiloeira está na coluna “como foi aprovado”.</li>
  </ul>
</div>

<footer><span>Bula Assessoria — carteira de ${esc(d.assessor)} · apuração dos grupos de cadastro</span><span>Uso interno</span></footer>
</body></html>`
}

/* ── saída ───────────────────────────────────────────────────────────────── */
const desktop = join(homedir(), 'Desktop')
const browser = await chromium.launch()
for (const d of distribuicao) {
    const html = paginaAssessor(d)
    const base = 'Carteira-' + d.assessor.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-') + '-2026-07-31'
    writeFileSync(join(desktop, base + '.html'), html, 'utf-8')
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.pdf({
        path: join(desktop, base + '.pdf'),
        format: 'A4', printBackground: true, landscape: true,
        margin: { top: '10mm', bottom: '12mm', left: '9mm', right: '9mm' },
    })
    await page.close()
    const carteira = clientes.filter(c => c.responsavel === d.assessor).length
    console.log(`${d.assessor}: grupo ${d.grupo.length} · lista ${d.lista.length} · carteira atual ${carteira} → ${base}.pdf`)
}
await browser.close()
console.log(`\n(${semAssessor.length} aprovados seguem sem assessor — estão no relatório geral, não entram em carteira nenhuma.)`)
await db.end()
