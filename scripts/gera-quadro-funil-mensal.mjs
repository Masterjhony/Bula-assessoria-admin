/**
 * QUADRO "META FUNIL DE VENDAS MENSAL" COM O REALIZADO DO MÊS.
 *
 *   node scripts/gera-quadro-funil-mensal.mjs [pasta-de-saida]
 *
 * A diretoria acompanha o funil naquele quadro preto de nove linhas. Este script
 * repete o MESMO quadro, na mesma ordem, com o que aconteceu de verdade ao lado
 * da meta — em PNG (para mandar no grupo, do jeito que o quadro circula) e em
 * PDF.
 *
 * RÉGUA (a mesma do quadro, para a comparação ser honesta):
 *   • O universo é o das campanhas que veicularam no mês, com as landings de
 *     cada uma. Campanha encerrada antes do mês não entra.
 *   • LEADS GERADOS conta pessoa que chegou NO MÊS (o quadro é mensal).
 *   • CADASTROS SUBMETIDOS conta ficha que foi ao grupo da leiloeira no mês e
 *     tem lead casado por CPF, telefone ou nome — não a etapa "CADASTRO OK" da
 *     planilha, que é a régua da equipe e diverge (ver o relatório operacional).
 *   • CLIENTES COMPRARAM cruza os compradores do mês no ERP contra o universo.
 *   • CUSTO POR VENDA é por ANIMAL, como no quadro original (R$ 6.500 ÷ 40).
 *
 * As taxas são o que importa: volume depende de quanto se investe, taxa mede a
 * operação. Por isso cada linha traz a taxa realizada ao lado da meta de taxa.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CADASTROS_AGOSTO } from './lib/cadastros-agosto-2026.mjs'
import { nomeNorm, foneKey, indexaUniverso, casaNoUniverso, provaDe, ehMidia } from './lib/origem-cadastros-2026.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const F = path.join(ROOT, 'outputs', 'base-clientes-2026', 'fontes')
const saida = process.argv[2] || path.join(ROOT, 'outputs', 'operacional-campanhas-2026-08')
fs.mkdirSync(saida, { recursive: true })

const MES = '2026-08', HOJE = '26/08/2026'
const ORIGENS = [
    'Meta — LEAD - PERPETUO TOURO', 'Landing Touros',
    'Meta — LEADS - PERPETUO FEMEAS', 'Landing Fêmeas — Funil Perpétuo',
    'Meta — LEADS - Expogenética',
    'Meta — LEADS - SAO GERALDO', 'Landing São Geraldo',
]
const CAMPANHAS_ATIVAS = ['120249455058620708', '120249845218920708', '120249975819240708', '120249560579230708']

/* ── mídia do mês ─────────────────────────────────────────────────────────── */
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', 'funil-campanhas-2026', 'meta-estrutura-2026-08-26.json'), 'utf8'))
const m = { investido: 0, impressoes: 0, cliques: 0, cliquesSaida: 0, acessos: 0 }
for (const id of CAMPANHAS_ATIVAS) {
    const x = meta.mensal[id]?.[MES]; if (!x) continue
    for (const k of Object.keys(m)) m[k] += x[k] || 0
}

/* ── leads ────────────────────────────────────────────────────────────────── */
const planilha = JSON.parse(fs.readFileSync(path.join(F, 'planilha-leads.json'), 'utf8'))
const abas = {}
for (const [a, { head, rows }] of Object.entries(planilha)) abas[a] = rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
const iso = d => { const x = String(d).match(/(\d{2})\/(\d{2})\/(\d{4})/); return x ? `${x[3]}-${x[2]}-${x[1]}` : '' }
const ehTeste = r => /teste|test lead|dummy/i.test(String(r['Nome'] || ''))
const porPessoa = new Map()
for (const r of abas['LEADS GERAIS']) {
    if (!ORIGENS.includes(String(r['Origem'])) || ehTeste(r)) continue
    const k = foneKey(r['WhatsApp']) || nomeNorm(r['Nome'])
    const j = porPessoa.get(k)
    if (!j || iso(r['Data']) < iso(j['Data'])) porPessoa.set(k, r)
}
const universo = [...porPessoa.values()]
const leads = universo.filter(r => iso(r['Data']).startsWith(MES))
const PISO = { '1 a 50 cabeças': 1, '51 a 100 cabeças': 51, '101 a 300 cabeças': 101, '301 a 500 cabeças': 301, 'mais de 500 cabeças': 501, '1 a 99 cabeças': 1, '100 a 500 cabeças': 100, '501 a 1000 cabeças': 501, 'mais de 1000 cabeças': 1001, 'nenhuma': 0 }
const ehMql = r => (PISO[String(r['Cabeças'] || '').trim()] ?? null) >= 100 && /^sim$/i.test(String(r['Inscrição Estadual'] || '').trim())
const mqls = leads.filter(ehMql)

/* ── cadastros e vendas ───────────────────────────────────────────────────── */
const fichas = CADASTROS_AGOSTO.filter(c => ORIGENS.includes(c.origemLead))
const aprovados = fichas.filter(c => c.status === 'aprovado')

const idx = indexaUniverso(universo.map(r => ({ nome: r['Nome'], fone: r['WhatsApp'], cpf: r['cpf'] || r['cpf_(brazil)'] || '', uf: r['UF'], origem: r['Origem'], data: r['Data'] })))
const compras = JSON.parse(fs.readFileSync(path.join(F, 'hp-compras-2026.json'), 'utf8')).filter(c => String(c.lei_data || '').startsWith(MES))
const porComprador = new Map()
for (const c of compras) {
    const k = nomeNorm(c.cli_nome)
    if (!porComprador.has(k)) porComprador.set(k, { nome: c.cli_nome, cpf: c.cli_cpfcnpj, fone: c.cli_celular || c.cli_fonecom1 || c.cli_foneres, uf: c.cli_uf, linhas: [] })
    porComprador.get(k).linhas.push(c)
}
const clientes = []
for (const p of porComprador.values()) {
    const a = casaNoUniverso(idx, p); if (!a) continue
    if (!a.achados.some(x => ORIGENS.includes(x.origem))) continue
    clientes.push({ nome: p.nome, animais: p.linhas.reduce((s, x) => s + (+x.lot_qtd || 0), 0), valor: p.linhas.reduce((s, x) => s + (+x.lot_total || 0), 0) })
}
const animais = clientes.reduce((s, c) => s + c.animais, 0)
const faturamento = clientes.reduce((s, c) => s + c.valor, 0)

/* ── formatação ───────────────────────────────────────────────────────────── */
const br = n => Number(n).toLocaleString('pt-BR')
const brl = n => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const tx = (a, b, casas = 2) => b ? `${(a * 100 / b).toFixed(casas).replace('.', ',')}%` : '—'
const nEsc = (a, b) => b ? a / b : 0

/* linhas do quadro, na ordem exata do original */
const L = (rot, meta, real, metaTaxa, taxaReal, ok, nota) => ({ rot, meta, real, metaTaxa, taxaReal, ok, nota })
const funil = [
    L('INVESTIMENTO EM MÍDIA', 'R$ 6.500,00', brl(m.investido), '', tx(m.investido, 6500, 1), null, `${tx(m.investido, 6500, 0)} da verba usada`),
    L('IMPRESSÕES', br(650000), br(m.impressoes), '', tx(m.impressoes, 650000, 1), null, `CPM real ${brl(m.investido / m.impressoes * 1000)}`),
    L('CLIQUES', br(7800), br(m.cliques), '1,20%', tx(m.cliques, m.impressoes), nEsc(m.cliques, m.impressoes) >= 0.012, 'CTR acima da meta'),
    L('ACESSOS', br(5850), br(m.acessos), '75%', tx(m.acessos, m.cliques), nEsc(m.acessos, m.cliques) >= 0.75, 'duas campanhas são formulário instantâneo — não passam pelo site'),
    L('LEADS GERADOS', br(702), br(leads.length), '12%', tx(leads.length, m.acessos), nEsc(leads.length, m.acessos) >= 0.12, 'na meta de taxa'),
    L('LEADS QUALIFICADOS', '140,4', br(mqls.length), '20%', tx(mqls.length, leads.length), nEsc(mqls.length, leads.length) >= 0.20, '100+ cabeças e com I.E.'),
    L('CADASTROS SUBMETIDOS', '56,16', br(fichas.length), '40%', tx(fichas.length, mqls.length), nEsc(fichas.length, mqls.length) >= 0.40, 'ficha no grupo da leiloeira, com lead casado'),
    L('CADASTROS APROVADOS', '33,696', br(aprovados.length), '60%', tx(aprovados.length, fichas.length), nEsc(aprovados.length, fichas.length) >= 0.60, 'acima da meta'),
    L('CLIENTES COMPRARAM', '13,5', br(clientes.length), '40%', tx(clientes.length, aprovados.length), nEsc(clientes.length, aprovados.length) >= 0.40, 'os dois são lead de julho que amadureceu'),
]
const resultado = [
    L('ANIMAIS VENDIDOS', br(40), br(animais), '', '', null, ''),
    L('TICKET MÉDIO', brl(25000), animais ? brl(faturamento / animais) : '—', '', '', null, ''),
    L('FATURAMENTO CLIENTES DIGITAL', 'R$ 1.010.880,00', brl(faturamento), '', tx(faturamento, 1010880, 1), null, ''),
]
const custos = [
    L('CPL', 'R$ 9,26', brl(m.investido / leads.length), '', '', null, ''),
    L('CPMQL', 'R$ 46,30', brl(m.investido / mqls.length), '', '', null, ''),
    L('CUSTO POR CADASTRO', 'R$ 115,74', brl(m.investido / fichas.length), '', '', null, ''),
    L('CUSTO POR VENDA', 'R$ 160,75', animais ? brl(m.investido / animais) : '—', '', '', null, 'por animal, como no quadro original'),
]

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const linha = l => `<tr>
  <td class="rot">${esc(l.rot)}</td>
  <td class="meta">${esc(l.meta)}</td>
  <td class="real">${esc(l.real)}</td>
  <td class="tx">${esc(l.metaTaxa)}</td>
  <td class="txr ${l.ok === true ? 'bom' : l.ok === false ? 'ruim' : ''}">${esc(l.taxaReal)}${l.ok === true ? ' <span class="pin">▲</span>' : l.ok === false ? ' <span class="pin">▼</span>' : ''}</td>
</tr>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Funil de vendas — agosto/2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; font-family: 'Segoe UI', Arial, sans-serif; color: #111; }
  .quadro { width: 1000px; margin: 0 auto; padding: 26px 30px 22px; background: #fff; }
  h1 { font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase; text-align: center; letter-spacing: .04em;
       background: #111; color: #fff; margin: 0; padding: 13px 10px 11px; font-size: 25px; font-weight: 600; }
  .sub { text-align: center; font-size: 12.5px; color: #555; padding: 9px 0 14px; border-bottom: 2px solid #111; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #111; color: #fff; font-family: 'Oswald', Arial, sans-serif; font-weight: 500;
             text-transform: uppercase; letter-spacing: .05em; font-size: 12px; padding: 9px 12px; text-align: right; }
  thead th.l { text-align: left; }
  td { padding: 9px 12px; border-bottom: 1px solid #e2e2e2; font-size: 15px; text-align: right; white-space: nowrap; }
  td.rot { text-align: left; font-weight: 600; letter-spacing: .01em; font-size: 14px; }
  td.meta { color: #9a9a9a; }
  td.real { font-family: 'Oswald', Arial, sans-serif; font-size: 20px; font-weight: 600; }
  td.tx { color: #9a9a9a; font-size: 13.5px; }
  td.txr { font-weight: 700; font-size: 15px; }
  td.txr.bom { color: #1c7a3c; }
  td.txr.ruim { color: #b02a26; }
  .pin { font-size: 11px; }
  tr.bloco td { border-bottom: none; padding-top: 20px; }
  .tit { font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase; font-size: 13px; letter-spacing: .06em;
         background: #f0f0f0; padding: 7px 12px; border-top: 2px solid #111; }
  .rodape { margin-top: 16px; border-top: 2px solid #111; padding-top: 11px; font-size: 11.5px; color: #555; line-height: 1.5; }
  .rodape b { color: #111; }
  .destaque { display: flex; gap: 10px; margin: 16px 0 4px; }
  .destaque div { flex: 1; border: 1.5px solid #111; padding: 9px 11px; }
  .destaque .z { font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em; color: #666; }
  .destaque .n { font-family: 'Oswald', Arial, sans-serif; font-size: 22px; line-height: 1.15; margin-top: 2px; }
  .destaque .p { font-size: 10.5px; color: #666; }
</style></head><body>
<div class="quadro">
  <h1>Funil de vendas — realizado de agosto</h1>
  <div class="sub">1º a 26 de agosto de 2026 · campanhas no ar no mês: Perpétuo Touro, Perpétuo Fêmeas, Expogenética e São Geraldo (com as landings de cada uma)</div>
  <table>
    <thead><tr><th class="l">Etapa</th><th>Meta do mês</th><th>Realizado</th><th>Meta de taxa</th><th>Taxa real</th></tr></thead>
    <tbody>
      ${funil.map(linha).join('')}
      <tr><td colspan="5" class="tit">Resultado</td></tr>
      ${resultado.map(linha).join('')}
      <tr><td colspan="5" class="tit">Custos</td></tr>
      ${custos.map(linha).join('')}
    </tbody>
  </table>

  <div class="destaque">
    <div><div class="z">Verba usada</div><div class="n">${tx(m.investido, 6500, 0)}</div><div class="p">${brl(m.investido)} de R$ 6.500,00</div></div>
    <div><div class="z">Taxas dentro da meta</div><div class="n">${funil.filter(l => l.ok === true).length} de ${funil.filter(l => l.ok !== null).length}</div><div class="p">CTR, lead/acesso, MQL e aprovação</div></div>
    <div><div class="z">Mídia parada desde</div><div class="n">20/08</div><div class="p">6 dias sem lead novo</div></div>
    <div><div class="z">Faturamento gerado</div><div class="n">${brl(faturamento)}</div><div class="p">${clientes.length} compradores · ${animais} animais</div></div>
  </div>

  <div class="rodape">
    <b>Como ler.</b> A coluna de volume depende de quanto se investe — com metade da verba (${tx(m.investido, 6500, 0)}), metade do funil. A coluna de <b>taxa</b> é que mede a operação, e nela ${funil.filter(l => l.ok === true).length} das ${funil.filter(l => l.ok !== null).length} etapas estão dentro ou acima da meta.<br>
    <b>Onde a taxa não bate.</b> <b>Acessos</b>: Expogenética e os conjuntos de formulário instantâneo não passam pelo site, então a conta acesso÷clique não se aplica a eles — considerando só os cliques de saída, ${br(m.acessos)} de ${br(m.cliquesSaida)} chegaram (${tx(m.acessos, m.cliquesSaida, 0)}).
    <b>Cadastros</b>: ${fichas.length} fichas para ${mqls.length} MQL — é o degrau mais estreito do mês, e o único ponto onde a operação, não a verba, explica a perda.<br>
    <b>Definições.</b> Leads = pessoas distintas que entraram no mês. Cadastros submetidos = ficha que foi ao grupo da leiloeira com o lead identificado por CPF, telefone ou nome (a etapa "CADASTRO OK" da planilha marca ${br(17)} no mesmo período — a diferença está no relatório operacional). Clientes = compradores de agosto no ERP cruzados com o universo. Custo por venda é por animal, como no quadro original.<br>
    <span style="color:#888">Apurado em ${HOJE} · planilha de leads + grupos de cadastro no WhatsApp + Meta Ads (conta CA2) + ERP HastaPro</span>
  </div>
</div>
</body></html>`

const base = path.join(saida, 'quadro-funil-agosto-2026')
fs.writeFileSync(base + '.html', html)

const { chromium } = await import('playwright')
const nav = await chromium.launch()
try {
    const pg = await nav.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 2 })
    await pg.setContent(html, { waitUntil: 'networkidle' })
    const el = await pg.$('.quadro')
    await el.screenshot({ path: base + '.png' })
    await pg.pdf({ path: base + '.pdf', format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } })
} finally { await nav.close() }

console.log(`PNG  ${base}.png`)
console.log(`PDF  ${base}.pdf`)
console.log(`investido ${brl(m.investido)} · impressões ${br(m.impressoes)} · cliques ${br(m.cliques)} · acessos ${br(m.acessos)}`)
console.log(`leads ${leads.length} · mql ${mqls.length} · cadastros ${fichas.length} · aprovados ${aprovados.length} · clientes ${clientes.length} · ${brl(faturamento)}`)
