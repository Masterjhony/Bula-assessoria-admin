// Relatório GERAL: cadastros aprovados nos grupos de cadastro das leiloeiras
// (Cadastros Bula Remates + Cadastros Bula e Programa), com a distribuição pelo
// critério de regionalidade (assessor-zona.ts).
//
// Os dados da apuração vivem em scripts/lib/cadastros-aprovados-grupos.mjs —
// mesma fonte do relatório por assessor, para os dois nunca divergirem.
//
// Uso: node scripts/gera-relatorio-cadastros-aprovados-grupos-2026-07-31.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { chromium } from 'playwright'
import {
    linhasGrupo, linhasLista, distribuicao, semAssessor,
    NAO_APROVADOS, SEM_IDENTIFICACAO, esc, loadEnv,
} from './lib/cadastros-aprovados-grupos.mjs'

const env = loadEnv(readFileSync)
const HOJE = '31 de julho de 2026'

const tabelaGrupo = rows => `
<table>
  <thead><tr>
    <th style="width:24%">Cliente</th><th style="width:8%">Grupo</th><th style="width:6%">Data</th>
    <th style="width:26%">Evidência no grupo</th><th style="width:6%">UF</th>
    <th style="width:14%">Assessor</th><th style="width:16%">Observação</th>
  </tr></thead>
  <tbody>${rows.map(r => `
    <tr>
      <td class="nome">${esc(r.cliente)}</td>
      <td>${esc(r.grupo)}</td>
      <td class="num">${esc(r.data)}</td>
      <td class="ev">${esc(r.evidencia)}</td>
      <td class="num">${r.uf ? esc(r.uf) : '<span class="warn">—</span>'}</td>
      <td>${r.assessor ? `<strong>${esc(r.assessor)}</strong><br><span class="micro">${esc(r.criterio)}</span>` : '<span class="warn">A DEFINIR</span>'}</td>
      <td class="obs">${esc(r.obs || '')}${r.uf ? '' : `<span class="micro"> ${esc(r.ufFonte)}</span>`}</td>
    </tr>`).join('')}
  </tbody>
</table>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Cadastros aprovados nos grupos — 31/07/2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #111; font-size: 9.4px; line-height: 1.45; margin: 0; padding-bottom: 8mm; }
  h1, h2, h3 { font-family: 'Oswald', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: .02em; margin: 0; font-weight: 700; }
  h1 { font-size: 21px; line-height: 1.1; }
  h2 { font-size: 13px; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #111; }
  h3 { font-size: 11px; margin: 12px 0 4px; }
  .cap { border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
  .cap .sub { font-size: 10px; color: #444; margin-top: 4px; }
  .cap .meta { font-size: 9px; color: #666; margin-top: 6px; }
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
  .card .n small { font-size: 9px; color: #666; font-family: 'Segoe UI', Arial, sans-serif; }
  .card ol { margin: 6px 0 0; padding-left: 14px; font-size: 8.4px; }
  .avoid { break-inside: avoid; }
  footer { position: fixed; bottom: 4mm; left: 0; right: 0; font-size: 7.6px; color: #888; display: flex; justify-content: space-between; }
</style></head><body>

<div class="cap">
  <h1>Cadastros aprovados nos grupos de cadastro</h1>
  <div class="sub">Bula Remates e Programa Leilões — apuração das conversas dos grupos, com distribuição por regionalidade</div>
  <div class="meta">Bula Assessoria · emitido em ${HOJE} · janela apurada: 08/07/2026 a 31/07/2026</div>
</div>

<div class="box">
  <strong>Como foi apurado — e o que falta.</strong>
  A leitura é das conversas dos dois grupos, mensagem por mensagem: no grupo a leiloeira responde em texto livre
  (“Fulano&nbsp;-&nbsp;OK”, “Apto”, “cadastro bom”), quase sempre citando a ficha, então cada linha abaixo vem com a frase
  que a sustenta. Cobertura: <strong>Cadastros Bula e Programa</strong> foi criado em 07/07/2026 e está apurado de ponta a ponta;
  <strong>Cadastros Bula Remates</strong> foi criado em 10/06/2026, mas o sistema só registra esse grupo a partir de 08/07 —
  <strong>o período de 10/06 a 07/07 não existe nem no servidor nem no WhatsApp Web</strong> (o navegador só carrega os últimos dias),
  ele está apenas nos celulares. Se houve aprovação nesse mês, ela não está aqui.
</div>

<h2>1. Aprovados com decisão registrada no grupo (${linhasGrupo.length} lançamentos — 21 cadastros, um deles com dois clientes)</h2>
${tabelaGrupo(linhasGrupo)}

<h2>2. Distribuição por regionalidade</h2>
<div class="cards">
  ${distribuicao.map(d => `
  <div class="card avoid">
    <div class="t">${esc(d.assessor)}</div>
    <div class="z">${esc(d.zonas)}</div>
    <div class="n">${d.grupo.length + d.lista.length} <small>clientes (${d.grupo.length} do grupo + ${d.lista.length} da lista${d.repetidos ? `; ${d.repetidos} aparecem nas duas e contam uma vez` : ''})</small></div>
    <ol>${[...d.grupo.map(r => r.cliente), ...d.lista.map(r => r.cliente)].map(c => `<li>${esc(c)}</li>`).join('')}</ol>
  </div>`).join('')}
</div>
<div class="box grey avoid" style="margin-top:10px">
  <strong>${semAssessor.length} cadastros aprovados sem assessor definido</strong> — nenhuma UF foi informada no grupo e o cliente não está na base:
  <ul>${semAssessor.map(r => `<li>${esc(r.cliente)} <span class="micro">(${esc(r.grupo)}, ${esc(r.data)})</span></li>`).join('')}</ul>
  Sem a UF da propriedade a regra de zona não decide — e chutar pelo DDD é como o cliente vai parar no assessor errado.
</div>

<h2>3. Aprovados que o sistema conhece pela lista da leiloeira (${linhasLista.length})</h2>
<div class="box grey">
  Estes vieram das relações de cadastro das leiloeiras (canal e-mail), não de uma decisão no grupo. Entram no relatório porque
  também são cadastro aprovado — e porque em ${linhasLista.filter(r => r.divergente).length} deles o responsável de hoje não é o assessor da zona.
</div>
<table>
  <thead><tr>
    <th style="width:28%">Cliente</th><th style="width:6%">UF</th><th style="width:14%">Cidade</th>
    <th style="width:14%">Leiloeiras</th><th style="width:15%">Responsável hoje</th><th style="width:15%">Assessor por zona</th><th style="width:8%">Situação</th>
  </tr></thead>
  <tbody>${linhasLista.map(r => `
    <tr>
      <td class="nome">${esc(r.cliente)}${r.obs ? `<br><span class="micro">${esc(r.obs)}</span>` : ''}</td>
      <td class="num">${esc(r.uf)}</td><td>${esc(r.cidade)}</td><td>${esc(r.leiloeiras)}</td>
      <td>${esc(r.atual)}</td><td><strong>${esc(r.assessor)}</strong></td>
      <td>${r.divergente ? '<span class="warn">REALOCAR</span>' : 'ok'}</td>
    </tr>`).join('')}
  </tbody>
</table>

<h2>4. Aprovações que não dá para atribuir a ninguém</h2>
<div class="box grey">
  Três decisões positivas no grupo da Programa responderam a uma ficha citada, sem nome no texto — e a citação não foi guardada.
  Só é possível recuperar abrindo a conversa no celular:
  <ul>${SEM_IDENTIFICACAO.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
</div>

<h2>5. Não aprovados e pendentes no período (${NAO_APROVADOS.length})</h2>
<table>
  <thead><tr><th style="width:34%">Cliente</th><th style="width:16%">Grupo</th><th style="width:12%">Data</th><th style="width:38%">Motivo</th></tr></thead>
  <tbody>${NAO_APROVADOS.map(r => `
    <tr><td class="nome">${esc(r.cliente)}</td><td>${esc(r.grupo)}</td><td class="num">${esc(r.data)}</td><td class="obs">${esc(r.motivo)}</td></tr>`).join('')}
  </tbody>
</table>

<h2>6. O que fazer com isto</h2>
<div class="box">
  <ul>
    <li><strong>${semAssessor.length} aprovados sem UF</strong> — pedir a cidade/UF da propriedade a quem levou o cliente (Douglas e Marcelo, na maioria) e só então alocar.</li>
    <li><strong>${linhasLista.filter(r => r.divergente).length} clientes com responsável fora da zona</strong> — realocar em CLIENTES conforme a coluna “assessor por zona”.</li>
    <li><strong>Marcelo Cataldo está duplicado</strong> em CLIENTES, com dois responsáveis diferentes — unificar no Fábio (MG).</li>
    <li><strong>Daniel Cunha Câmara</strong> aparece reprovado na Programa (14/07) e aprovado nas listas das duas leiloeiras — confirmar qual vale antes de trabalhar o cliente.</li>
    <li><strong>Junho da Bula Remates (10/06 a 07/07)</strong> — se precisar dessa janela, exportar a conversa pelo celular; nenhum sistema tem esse trecho.</li>
    <li><strong>Nada disso vira registro sozinho:</strong> no período, só um cadastro (José Dias Dantas) passou pela ficha automática — todo o resto é conversa solta no grupo, que o sistema não consegue casar com cliente nenhum.</li>
  </ul>
</div>

<footer><span>Bula Assessoria — cadastros aprovados nos grupos · 08/07 a 31/07/2026</span><span>Uso interno</span></footer>
</body></html>`

/* ── saída ───────────────────────────────────────────────────────────────── */
const desktop = join(homedir(), 'Desktop')
const base = 'Cadastros-Aprovados-Grupos-2026-07-31'
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

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const { rows: chk } = await db.query(`select status, count(*) n from cliente_leiloeira_cadastro group by status order by n desc`)
await db.end()
console.log('PDF  → ' + join(desktop, base + '.pdf'))
console.log('HTML → ' + join(desktop, base + '.html'))
console.log('Aprovados no grupo: ' + linhasGrupo.length + ' · lista da leiloeira: ' + linhasLista.length + ' · sem assessor: ' + semAssessor.length)
for (const d of distribuicao) console.log(`  ${d.assessor}: ${d.grupo.length + d.lista.length} (grupo ${d.grupo.length} / lista ${d.lista.length})`)
console.log('cliente_leiloeira_cadastro: ' + JSON.stringify(chk))
