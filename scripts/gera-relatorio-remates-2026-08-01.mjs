// Relatório GERAL do grupo "Cadastros Bula Remates": todos os cadastros
// aprovados lá, com a distribuição por regionalidade.
//
// Fonte: registro do sistema (Baileys → whatsapp_messages + operational_items),
// 470 mensagens de 08/07/2026 até agora. O WhatsApp Web NÃO serve para isso:
// depois do relogin ele carrega só os últimos dois dias e para.
//
// Os dados da apuração vivem em scripts/lib/cadastros-aprovados-grupos.mjs.
//
// Uso: node scripts/gera-relatorio-remates-2026-08-01.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { chromium } from 'playwright'
import {
    linhasGrupo, linhasLista, ASSESSORES, ZONA_DO_ASSESSOR,
    NAO_APROVADOS_REMATES, esc, loadEnv,
} from './lib/cadastros-aprovados-grupos.mjs'

const env = loadEnv(readFileSync)
const HOJE = '1º de agosto de 2026'
const JID = '120363407740739645@g.us'

/* ── recorte do grupo ────────────────────────────────────────────────────── */
const aprovados = linhasGrupo.filter(r => r.grupo === 'Remates')
const listaRemates = linhasLista.filter(r => String(r.leiloeiras).includes('Remates'))
const semAssessor = aprovados.filter(r => r.assessor === null)
const comRessalva = aprovados.filter(r => String(r.obs).includes('⚠'))

const distribuicao = ASSESSORES.map(a => ({
    assessor: a,
    zonas: ZONA_DO_ASSESSOR[a],
    grupo: aprovados.filter(r => r.assessor === a),
    lista: listaRemates.filter(r => r.assessor === a),
}))

/* ── números do próprio grupo, direto do banco ───────────────────────────── */
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const { rows: [stat] } = await db.query(
    `select count(*) n, min(created_at) primeira, max(created_at) ultima
     from whatsapp_messages where phone = $1`, [JID])
await db.end()
const fmtDia = d => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/* ── HTML ────────────────────────────────────────────────────────────────── */
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Cadastros aprovados — Bula Remates — 01/08/2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 13mm 11mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #111; font-size: 9.5px; line-height: 1.45; margin: 0; padding-bottom: 8mm; }
  h1, h2 { font-family: 'Oswald', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: .02em; margin: 0; font-weight: 700; }
  h1 { font-size: 23px; line-height: 1.05; }
  h2 { font-size: 12.5px; margin: 16px 0 5px; padding-bottom: 3px; border-bottom: 1.5px solid #111; }
  .cap { border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
  .cap .sub { font-size: 10px; color: #444; margin-top: 4px; }
  .cap .meta { font-size: 8.6px; color: #666; text-align: right; }
  .cap .tot { font-family: 'Oswald', Arial, sans-serif; font-size: 34px; line-height: 1; color: #111; }
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
  .cards { display: flex; gap: 8px; margin-top: 6px; }
  .card { flex: 1; border: 1px solid #111; padding: 8px 10px; }
  .card .t { font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase; font-size: 11px; font-weight: 700; }
  .card .z { font-size: 8px; color: #666; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 5px; }
  .card .n { font-size: 26px; font-family: 'Oswald', Arial, sans-serif; line-height: 1; }
  .card .n small { font-size: 8.6px; color: #666; font-family: 'Segoe UI', Arial, sans-serif; }
  .card ol { margin: 6px 0 0; padding-left: 14px; font-size: 8.4px; }
  .avoid { break-inside: avoid; }
  footer { position: fixed; bottom: 4mm; left: 0; right: 0; font-size: 7.6px; color: #888; display: flex; justify-content: space-between; }
</style></head><body>

<div class="cap">
  <div>
    <h1>Cadastros Bula Remates</h1>
    <div class="sub">Relatório geral dos cadastros aprovados no grupo, com distribuição por regionalidade</div>
  </div>
  <div class="meta">
    <div class="tot">${aprovados.length}<small>aprovados no grupo</small></div>
    <div style="margin-top:6px">Bula Assessoria · ${HOJE}<br>${stat.n} mensagens lidas · ${fmtDia(stat.primeira)} a ${fmtDia(stat.ultima)}</div>
  </div>
</div>

<div class="box">
  <strong>De onde saiu.</strong> Do registro que o próprio sistema faz do grupo (${stat.n} mensagens), lidas uma a uma —
  a leiloeira decide em texto livre (“Apto”, “cadastro bom”, “Fulano aprovado”), então cada linha abaixo carrega a frase exata
  que a sustenta. Horários no fuso de Brasília, iguais aos do WhatsApp.
  <br><strong>O que falta:</strong> o grupo foi criado em <strong>10/06/2026</strong> e o sistema só registra a partir de 08/07 —
  esse primeiro mês não está aqui. O WhatsApp Web também não resolve: hoje ele carrega apenas 31/07 e 01/08 e para de puxar histórico.
  Para cobrir junho, só exportando a conversa pelo celular.
</div>

<h2>1. Aprovados no grupo (${aprovados.length})</h2>
<table>
  <thead><tr>
    <th style="width:22%">Cliente</th><th style="width:6%">Data</th>
    <th style="width:27%">Evidência no grupo</th><th style="width:5%">UF</th>
    <th style="width:14%">Assessor</th><th style="width:26%">Observação</th>
  </tr></thead>
  <tbody>${aprovados.map(r => `
    <tr>
      <td class="nome">${esc(r.cliente)}${r.cpf ? `<br><span class="micro">CPF ${esc(r.cpf)}</span>` : ''}${r.fone ? `<br><span class="micro">${esc(r.fone)}</span>` : ''}</td>
      <td class="num">${esc(r.data)}</td>
      <td class="ev">${esc(r.evidencia)}</td>
      <td class="num">${r.uf ? esc(r.uf) : '<span class="warn">—</span>'}</td>
      <td>${r.assessor ? `<strong>${esc(r.assessor)}</strong><br><span class="micro">${esc(r.criterio)}</span>` : '<span class="warn">A DEFINIR</span>'}</td>
      <td class="obs">${esc(r.obs || '')}</td>
    </tr>`).join('')}
  </tbody>
</table>

<h2>2. Distribuição por regionalidade</h2>
<div class="cards">
  ${distribuicao.map(d => `
  <div class="card avoid">
    <div class="t">${esc(d.assessor)}</div>
    <div class="z">${esc(d.zonas)}</div>
    <div class="n">${d.grupo.length + d.lista.length} <small>clientes (${d.grupo.length} do grupo + ${d.lista.length} da lista por e-mail)</small></div>
    <ol>${[...d.grupo.map(r => r.cliente), ...d.lista.map(r => r.cliente)].map(c => `<li>${esc(c)}</li>`).join('')}</ol>
  </div>`).join('')}
</div>
${semAssessor.length ? `
<div class="box grey avoid" style="margin-top:10px">
  <strong>${semAssessor.length} aprovados sem assessor definido</strong> — o grupo não informou UF nem direcionou ninguém:
  <ul>${semAssessor.map(r => `<li>${esc(r.cliente)} <span class="micro">(${esc(r.data)})</span></li>`).join('')}</ul>
</div>` : ''}

<h2>3. Aprovados que exigem decisão antes de vender (${comRessalva.length})</h2>
<div class="box">
  <ul>
    ${comRessalva.map(r => `<li><strong>${esc(r.cliente)}</strong> — ${esc(String(r.obs).replace('⚠ ', ''))}</li>`).join('')}
  </ul>
</div>

<h2>4. Reprovados, inaptos e bloqueados no período (${NAO_APROVADOS_REMATES.length})</h2>
<table>
  <thead><tr><th style="width:30%">Cliente</th><th style="width:8%">Data</th><th style="width:62%">Motivo registrado no grupo</th></tr></thead>
  <tbody>${NAO_APROVADOS_REMATES.map(r => `
    <tr><td class="nome">${esc(r.cliente)}</td><td class="num">${esc(r.data)}</td><td class="obs">${esc(r.motivo)}</td></tr>`).join('')}
  </tbody>
</table>

<h2>5. Aprovados da Bula Remates que vieram pela lista por e-mail (${listaRemates.length})</h2>
<div class="box grey">
  Não passaram pelo grupo — vieram da relação de cadastro que a leiloeira manda. Entram porque também estão aprovados.
</div>
<table>
  <thead><tr>
    <th style="width:30%">Cliente</th><th style="width:6%">UF</th><th style="width:18%">Cidade</th>
    <th style="width:20%">Responsável hoje</th><th style="width:20%">Assessor por zona</th><th style="width:6%">Situação</th>
  </tr></thead>
  <tbody>${listaRemates.map(r => `
    <tr>
      <td class="nome">${esc(r.cliente)}</td><td class="num">${esc(r.uf)}</td><td>${esc(r.cidade)}</td>
      <td>${esc(r.atual)}</td><td><strong>${esc(r.assessor)}</strong></td>
      <td>${r.divergente ? '<span class="warn">REALOCAR</span>' : 'ok'}</td>
    </tr>`).join('')}
  </tbody>
</table>

<h2>6. O que fazer com isto</h2>
<div class="box">
  <ul>
    <li><strong>Hênio Suassuna é o caso urgente:</strong> a leiloeira deu “Apto” em 31/07 (score 762, I.E. 3 anos, 600 ha) e a consulta interna deu “reprovado” em 01/08. Alguém precisa bater o martelo antes de o Fábio trabalhar o cliente.</li>
    <li><strong>Marusan Mendes de Souza</strong> foi recusado duas vezes pela Programa e aprovado pela Remates — é o efeito da revisão dos recusados da PL; vale repetir com os outros recusados.</li>
    <li><strong>Leandro O. Rios N. Santos</strong> é de MG (zona do Fábio) mas foi direcionado ao Leonardo — confirmar quem fica.</li>
    <li><strong>Braz de Oliveira</strong> está aprovado com teto de 1 ou 2 lotes — não tratar como cadastro cheio.</li>
    <li><strong>${semAssessor.length} aprovados seguem sem dono.</strong> Sem a UF da propriedade a regra de zona não decide — pedir cidade/UF a quem levou o cliente ao grupo.</li>
    <li><strong>Nenhum destes vira registro sozinho:</strong> só o cadastro do José Dias Dantas passou pela ficha automática (e foi recusado). Todo o resto é conversa no grupo, que o sistema não casa com cliente nenhum.</li>
  </ul>
</div>

<footer><span>Bula Assessoria — cadastros aprovados no grupo Cadastros Bula Remates</span><span>Uso interno · ${HOJE}</span></footer>
</body></html>`

/* ── saída ───────────────────────────────────────────────────────────────── */
const desktop = join(homedir(), 'Desktop')
const base = 'Cadastros-Aprovados-Bula-Remates-2026-08-01'
writeFileSync(join(desktop, base + '.html'), html, 'utf-8')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({
    path: join(desktop, base + '.pdf'),
    format: 'A4', printBackground: true, landscape: true,
    margin: { top: '10mm', bottom: '12mm', left: '9mm', right: '9mm' },
})
await browser.close()

console.log('PDF  → ' + join(desktop, base + '.pdf'))
console.log(`Aprovados no grupo: ${aprovados.length} · com ressalva: ${comRessalva.length} · sem assessor: ${semAssessor.length}`)
for (const d of distribuicao) console.log(`  ${d.assessor}: ${d.grupo.length} do grupo + ${d.lista.length} da lista`)
console.log(`Reprovados/inaptos: ${NAO_APROVADOS_REMATES.length} · mensagens lidas: ${stat.n}`)
