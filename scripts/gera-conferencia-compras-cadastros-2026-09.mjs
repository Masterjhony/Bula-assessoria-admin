/**
 * RELATÓRIO — QUEM DOS CADASTROS COMPROU (aba CADASTROS × ERP/fechamentos/pregão)
 *
 *   node scripts/gera-conferencia-compras-cadastros-2026-09.mjs [pasta-de-saida] [--refresh]
 *
 * Pedido do chefe (09/09/2026): validar na aba CADASTROS quais cadastros vindos
 * dos leads compraram e quais não compraram, e ajudar a terminar de preencher a
 * aba. Saída: PDF (leitura) + XLSX (trabalho) na Área de Trabalho.
 *
 * Somente LEITURA — nada é escrito na planilha. O que dá para preencher sai na
 * aba "Preencher" do XLSX, célula a célula, com a fonte de cada valor.
 *
 * Fontes e regras: scripts/lib/compras-cadastros-2026-09.mjs
 * Cache das fontes: outputs/conferencia-compras-cadastros-2026-09/fontes.json (--refresh rebusca)
 */
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { CSS, esc, num, pct } from './lib/relatorio-2026-visual.mjs'
import { novoWorkbook, novaAba, cabecalho, bloco, tabela, nota, caixa, impressao, MOEDA_RS } from './lib/xlsx-brand.mjs'
import {
    ROOT, carregaEnv, leAbaCadastros, leAbasDeLeads, leHastaPro, lePostgres,
    montaCompras, cruza, preenchimento, dig,
} from './lib/compras-cadastros-2026-09.mjs'
import { FICHAS } from './lib/varredura-cadastros-2026-09.mjs'

carregaEnv()
const HOJE = '09/09/2026'
const SAIDA = process.argv.find(a => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1])
    || path.join(homedir(), 'Desktop', 'Cadastros que compraram (09-09-2026)')
fs.mkdirSync(SAIDA, { recursive: true })
const DADOS = path.join(ROOT, 'outputs', 'conferencia-compras-cadastros-2026-09')
fs.mkdirSync(DADOS, { recursive: true })

/* ── dados ────────────────────────────────────────────────────────────────── */
const CACHE = path.join(DADOS, 'fontes.json')
let f
if (fs.existsSync(CACHE) && !process.argv.includes('--refresh')) {
    f = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
    console.log(`fontes do cache (${f.extraidoEm})`)
} else {
    console.log('lendo planilha, HastaPro e Postgres…')
    const [cadastros, leadsSheet, hp, pgd] = await Promise.all([leAbaCadastros(), leAbasDeLeads(), leHastaPro(), lePostgres()])
    f = { cadastros, leadsSheet, hp, pgd, extraidoEm: new Date().toISOString() }
    fs.writeFileSync(CACHE, JSON.stringify(f))
}
const agrisk = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', 'varredura-cadastros-2026-09', 'agrisk.json'), 'utf8'))
const compras = montaCompras(f)
const R = cruza({ cadastros: f.cadastros, compras, hp: f.hp, pgd: f.pgd, leadsSheet: f.leadsSheet, agrisk, fichas: FICHAS })
for (const r of R) r.preencher = preenchimento(r)
fs.writeFileSync(path.join(DADOS, 'resultado.json'), JSON.stringify(R, null, 1))

/* ── recortes ─────────────────────────────────────────────────────────────── */
const compraram = R.filter(r => r.comprou)
const VGV = compraram.reduce((a, r) => a + r.vgv, 0)
const bate = r => r.marcado === '' ? 'branco' : (r.marcado === 'SIM') === r.comprou ? 'ok' : 'diverge'
const divergentes = R.filter(r => bate(r) === 'diverge')
const verdeSemCompra = divergentes.filter(r => r.marcado === 'SIM')
const vermelhoComCompra = divergentes.filter(r => r.marcado === 'NÃO')
const brancos = R.filter(r => bate(r) === 'branco')
const cpfInvalido = R.filter(r => r.cpf && !r.cpfOk)
const cpfDeOutro = R.filter(r => r.cpfDeOutro.length)
const semCpf = R.filter(r => !r.cpf)
const duplicadas = (() => {
    const m = new Map()
    for (const r of R) { const k = r.cpf || r.nome.toUpperCase().replace(/\s+/g, ' ').trim(); if (!m.has(k)) m.set(k, []); m.get(k).push(r) }
    return [...m.values()].filter(v => v.length > 1)
})()

const MESES = [...new Set(R.map(r => r.mes))]
const porMes = MESES.map(m => {
    const l = R.filter(r => r.mes === m)
    return { mes: m, n: l.length, c: l.filter(r => r.comprou).length, vgv: l.reduce((a, r) => a + r.vgv, 0) }
})
const porSdr = [...new Set(R.map(r => r.sdr))].map(s => {
    const l = R.filter(r => r.sdr === s)
    return { sdr: s || '—', n: l.length, c: l.filter(r => r.comprou).length, vgv: l.reduce((a, r) => a + r.vgv, 0) }
}).sort((a, b) => b.n - a.n)

const COLUNAS = ['Telefone', 'Interesse', 'Cidade', 'Estado', 'CPF', 'IE', 'SCORE', 'PENDÊNCIAS', 'BULA REMATES', 'PROGRAMA', 'CAMPANHA']
const campoAtual = { Telefone: 'tel', Interesse: 'interesse', Cidade: 'cidade', Estado: 'uf', CPF: 'cpfTxt', IE: 'ie', SCORE: 'score', 'PENDÊNCIAS': 'pendencias', 'BULA REMATES': 'remates', PROGRAMA: 'programa', CAMPANHA: 'campanha' }
const preencheColuna = COLUNAS.map(c => ({
    coluna: c,
    vazias: R.filter(r => !String(r[campoAtual[c]] ?? '').trim()).length,
    propostas: R.filter(r => r.preencher[c]).length,
    fontes: [...new Set(R.filter(r => r.preencher[c]).map(r => r.preencher[c].fonte))].join(', '),
}))
const celulas = preencheColuna.reduce((a, c) => a + c.propostas, 0)
const vaziasTotal = preencheColuna.reduce((a, c) => a + c.vazias, 0)

const propostas = []
for (const r of R) for (const c of COLUNAS) if (r.preencher[c]) propostas.push({
    linha: r.linha, nome: r.nome, coluna: c, valor: r.preencher[c].valor,
    fonte: r.preencher[c].fonte, conferir: r.preencher[c].conferir || '',
})

const dataBrIso = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || '') }
const rs = v => 'R$ ' + num(v)
const fonteCurta = { HastaPro: 'ERP HastaPro', Fechamento: 'Fechamento do sistema', 'Lance no grupo': 'Pregão (grupo)', 'Carteira do assessor': 'Carteira do assessor' }
const provasTxt = r => r.provas.map(p => `${dataBrIso(p.data)} · ${p.evento}${p.lote ? ` · lote ${p.lote}` : ''}${p.valor ? ` · ${rs(p.valor)}` : (p.parcela ? ` · parcela ${rs(p.parcela)}` : '')} (${fonteCurta[p.fonte] || p.fonte})`).join(' | ')

/* ── PDF ──────────────────────────────────────────────────────────────────── */
const linhaVeredito = r => `<tr>
  <td class="num">${r.linha}</td>
  <td>${esc(r.mes)}</td>
  <td class="nome">${esc(r.nome)}${r.cpfTxt ? `<div class="micro">CPF ${esc(r.cpfTxt)}${r.cpf && !r.cpfOk ? ' <b>(inválido)</b>' : ''}</div>` : ''}</td>
  <td>${esc(r.sdr)}</td>
  <td>${esc(r.assessor || '—')}</td>
  <td class="${r.marcado === 'SIM' ? 'ok' : ''}">${r.marcado || '—'}</td>
  <td><b class="${r.comprou ? 'ok' : ''}">${r.comprou ? 'SIM' : 'NÃO'}</b></td>
  <td class="num">${r.vgv ? rs(r.vgv) : (r.soPregao ? '<span class="micro">a fechar</span>' : '—')}</td>
  <td class="micro">${esc(r.certeza)}</td>
  <td class="micro">${esc(r.eventos.join(' · ') || '—')}</td>
</tr>`

const caixaCaso = r => `<div class="caso">
  <div class="cabeca"><b>Linha ${r.linha} · ${esc(r.nome)}</b>
    <span class="tag">${r.marcado === 'SIM' ? 'marcado VERDE' : r.marcado === 'NÃO' ? 'marcado VERMELHO' : 'sem marcação'}</span>
    <span class="tag ${r.comprou ? 'v' : 'x'}">apurado: ${r.comprou ? 'COMPROU' : 'sem compra'}</span></div>
  <div class="micro">${esc([r.cidade, r.uf].filter(Boolean).join(' / ') || 'sem cidade')} · CPF ${esc(r.cpfTxt || '—')} · SDR ${esc(r.sdr)} · assessor ${esc(r.assessor || '—')}</div>
  <div class="prova">${r.provas.length ? esc(provasTxt(r)) : 'Nenhuma compra encontrada no ERP HastaPro (as duas filiais), nos fechamentos do sistema, nos lances cantados nos grupos nem na carteira dos assessores.'}</div>
  ${r.homonimos.length ? `<div class="micro">Homônimos descartados: ${esc(r.homonimos.join(' · '))}</div>` : ''}
</div>`

const corpo = `
<div class="cap">
  <div>
    <h1>Quem dos cadastros comprou<br>— e o que ainda dá para preencher</h1>
    <div class="sub">Aba <b>CADASTROS</b> da planilha "Leads — Bula Assessoria" (${R.length} linhas, abril a setembro/2026) cruzada linha a linha com o <b>ERP HastaPro</b> (filiais 01 e 2), os <b>fechamentos do sistema</b>, os <b>lances cantados nos grupos</b> e a <b>carteira dos assessores</b>.</div>
  </div>
  <div class="meta">
    <div class="tot">${compraram.length}<small>de ${R.length} compraram</small></div>
    <div style="margin-top:6px">Apurado em ${HOJE}<br>Bula Assessoria · Tecnologia</div>
  </div>
</div>

<div class="cards">
  <div class="card"><div class="z">Cadastros na aba</div><div class="n">${R.length}<small>linhas com nome</small></div></div>
  <div class="card"><div class="z">Compraram</div><div class="n">${compraram.length}<small>${pct(compraram.length, R.length)} da aba</small></div></div>
  <div class="card"><div class="z">Volume comprado</div><div class="n">${rs(VGV)}<small>VGV dos lotes</small></div></div>
  <div class="card"><div class="z">Marcação diverge</div><div class="n">${divergentes.length}<small>+ ${brancos.length} sem marcação</small></div></div>
  <div class="card"><div class="z">Células a preencher</div><div class="n">${celulas}<small>de ${vaziasTotal} vazias</small></div></div>
</div>

<div class="box alerta">
  <h3>A resposta em uma frase</h3>
  <p><b>${compraram.length} das ${R.length} pessoas da aba compraram em leilão que passou pela Bula — ${pct(compraram.length, R.length)} — e elas somam ${rs(VGV)}.</b>
  A coluna "Já comprou?" hoje é só cor, sem texto: ${R.filter(r => r.marcado === 'SIM').length} verdes, ${R.filter(r => r.marcado === 'NÃO').length} vermelhas e ${brancos.length} em branco.
  Contra o ERP, <b>${divergentes.length} dessas marcações não se sustentam</b>: ${vermelhoComCompra.length} estão marcadas como "não comprou" e compraram (${rs(vermelhoComCompra.reduce((a, r) => a + r.vgv, 0))} fora da conta) e ${verdeSemCompra.length} estão marcadas como "comprou" sem nenhuma compra em base nossa.</p>
</div>

<h2>1 · A régua — o que "comprou" quer dizer aqui</h2>
<p>Uma pessoa entra como <b>comprou</b> quando aparece como arrematante em pelo menos uma destas quatro fontes. Nenhuma delas sozinha fecha a conta, por isso as quatro são usadas juntas:</p>
<table><thead><tr><th style="width:44mm">Fonte</th><th style="width:22mm">Cobertura</th><th>O que ela prova — e o que ela não enxerga</th></tr></thead><tbody>
<tr><td class="nome">ERP HastaPro (Firebird)</td><td>desde 09/2025</td><td>É o registro oficial do arremate, com CPF do comprador e valor do lote. Cobre as duas filiais — FIL 01 (Bula Remates) e FIL 2 (Bula Assessoria). <b>Só entra leilão já fechado no ERP</b>: o pregão de setembro ainda não está lá.</td></tr>
<tr><td class="nome">Fechamentos do sistema</td><td>01 a 09/2026</td><td>O fechamento que a Bula monta por leilão, com comprador, lotes e VGV. Não traz CPF — o casamento é por nome.</td></tr>
<tr><td class="nome">Lance cantado no grupo</td><td>a partir de 06/2026</td><td>Pega a venda no dia do pregão, antes de virar fechamento. <b>O valor ali é a parcela</b>, não o VGV — por isso essas linhas aparecem como "a fechar".</td></tr>
<tr><td class="nome">Carteira do assessor</td><td>01 a 07/2026</td><td>A compra que o assessor registrou no módulo Clientes. É a única fonte de algumas vendas antigas.</td></tr>
</tbody></table>

<div class="box">
  <h3>Onde a régua é cega — declarar isto é parte da resposta</h3>
  <ul>
    <li><b>"Não comprou" aqui é "não comprou em leilão que passou pela Bula".</b> Se a pessoa arrematou direto com outra leiloeira, não existe base nossa que registre.</li>
    <li><b>Compra em nome de terceiro não casa.</b> Fazenda, esposa, empresa ou sócio no lugar do CPF do cadastro quebram o vínculo — foi assim que apareceram os casos de CPF de outra pessoa listados na seção 5.</li>
    <li><b>Homônimo é recusado, não chutado.</b> Quando o nome bate mas o CPF é outro, a linha fica sem compra em vez de ganhar uma venda que não é dela. ${R.filter(r => r.homonimos.length).length} linhas tiveram homônimos descartados.</li>
    <li><b>Leilão de setembro ainda não fechou.</b> ${R.filter(r => r.soPregao).length} pessoas aparecem só pelo lance no grupo — a compra existe, o valor ainda não.</li>
  </ul>
</div>

<div class="pg"></div>
<h2>2 · O placar por mês de entrada</h2>
<table><thead><tr><th style="width:30mm">Mês</th><th class="r" style="width:24mm">Cadastros</th><th class="r" style="width:24mm">Compraram</th><th class="r" style="width:20mm">Taxa</th><th class="r" style="width:30mm">VGV</th><th>Leitura</th></tr></thead><tbody>
${porMes.map(m => `<tr><td class="nome">${esc(m.mes)}</td><td class="num">${m.n}</td><td class="num">${m.c}</td><td class="num">${pct(m.c, m.n)}</td><td class="num">${m.vgv ? rs(m.vgv) : '—'}</td><td class="micro">${m.c === 0 ? 'nenhuma compra ainda' : m.mes === 'Setembro' ? 'pregão de 05/09 ainda sem valor fechado' : ''}</td></tr>`).join('')}
<tr class="tot"><td class="nome"><b>Total</b></td><td class="num"><b>${R.length}</b></td><td class="num"><b>${compraram.length}</b></td><td class="num"><b>${pct(compraram.length, R.length)}</b></td><td class="num"><b>${rs(VGV)}</b></td><td></td></tr>
</tbody></table>

<h3>2.1 · Por SDR que trouxe</h3>
<table><thead><tr><th style="width:40mm">SDR</th><th class="r" style="width:24mm">Cadastros</th><th class="r" style="width:24mm">Compraram</th><th class="r" style="width:20mm">Taxa</th><th class="r" style="width:30mm">VGV</th></tr></thead><tbody>
${porSdr.map(s => `<tr><td class="nome">${esc(s.sdr)}</td><td class="num">${s.n}</td><td class="num">${s.c}</td><td class="num">${pct(s.c, s.n)}</td><td class="num">${s.vgv ? rs(s.vgv) : '—'}</td></tr>`).join('')}
</tbody></table>

<div class="pg"></div>
<h2>3 · As ${divergentes.length} marcações que não se sustentam</h2>

<h3>3.1 · Marcadas como "não comprou" — e compraram (${vermelhoComCompra.length})</h3>
<p>São ${rs(vermelhoComCompra.reduce((a, r) => a + r.vgv, 0))} em compras que a aba não está contando.</p>
${vermelhoComCompra.map(caixaCaso).join('')}

<h3>3.2 · Marcadas como "comprou" — sem compra em nenhuma base nossa (${verdeSemCompra.length})</h3>
<p>Aqui a apuração não afirma que a pessoa não comprou: afirma que <b>a compra não está em nenhum sistema da Bula</b>. Ou ela comprou direto com outra leiloeira, ou comprou em nome de terceiro, ou a marcação foi otimista. Só quem atendeu resolve.</p>
${verdeSemCompra.map(caixaCaso).join('')}

<h3>3.3 · Sem marcação nenhuma (${brancos.length})</h3>
${brancos.map(caixaCaso).join('')}

<div class="pg"></div>
<h2>4 · As ${compraram.length} compras confirmadas</h2>
<table><thead><tr>
  <th style="width:8mm">Lin.</th><th style="width:36mm">Cliente</th><th style="width:16mm">Mês</th>
  <th style="width:24mm">Assessor</th><th class="r" style="width:24mm">VGV</th><th style="width:26mm">Como conferimos</th><th>Onde comprou</th>
</tr></thead><tbody>
${compraram.map(r => `<tr>
  <td class="num">${r.linha}</td><td class="nome">${esc(r.nome)}</td><td>${esc(r.mes)}</td>
  <td class="micro">${esc(r.assessor || '—')}</td>
  <td class="num">${r.vgv ? rs(r.vgv) : '<span class="micro">a fechar</span>'}</td>
  <td class="micro">${esc(r.certeza)}</td>
  <td class="micro">${esc(r.eventos.join(' · '))}</td>
</tr>`).join('')}
</tbody></table>

<div class="pg"></div>
<h2>5 · O que trava a conferência automática</h2>
<div class="box alerta">
  <h3>${cpfDeOutro.length} CPF que no ERP pertence a outra pessoa</h3>
  ${cpfDeOutro.map(r => `<p><b>Linha ${r.linha} · ${esc(r.nome)}</b> — o CPF ${esc(r.cpfTxt)} está no HastaPro em nome de <b>${esc(r.cpfDeOutro.join(', '))}</b>. A pessoa da linha ${r.comprou ? `foi confirmada por outro caminho (${esc(r.certeza)})` : 'não foi confirmada'}. ${r.homonimos.length ? `O mesmo nome aparece no ERP com o CPF ${esc(r.homonimos[0].replace(/^.*\(CPF /, '').replace(/\)$/, ''))} — é esse o CPF que casa com as compras.` : ''}</p>`).join('')}
</div>
<table><thead><tr><th style="width:34mm">Problema</th><th class="r" style="width:14mm">Qtd.</th><th>Linhas</th></tr></thead><tbody>
<tr><td class="nome">CPF inválido (dígito não fecha)</td><td class="num">${cpfInvalido.length}</td><td class="micro">${cpfInvalido.map(r => `${r.linha} ${esc(r.nome)} (${esc(r.cpfTxt)})`).join(' · ')}</td></tr>
<tr><td class="nome">Sem CPF</td><td class="num">${semCpf.length}</td><td class="micro">${semCpf.map(r => `${r.linha} ${esc(r.nome)}`).join(' · ')}</td></tr>
<tr><td class="nome">Nome/CPF repetido na aba</td><td class="num">${duplicadas.length}</td><td class="micro">${duplicadas.map(g => g.map(r => r.linha).join(' e ') + ' — ' + esc(g[0].nome)).join(' · ')}</td></tr>
</tbody></table>

<h2>6 · O que dá para preencher — ${celulas} células</h2>
<p>De ${vaziasTotal} células vazias nas colunas de trabalho, <b>${celulas} têm resposta em base nossa</b>. A proposta célula a célula, com a fonte de cada valor, está na aba <b>Preencher</b> do XLSX — para conferir antes de colar.</p>
<table><thead><tr><th style="width:34mm">Coluna</th><th class="r" style="width:20mm">Vazias</th><th class="r" style="width:24mm">Preenchíveis</th><th>De onde vem</th></tr></thead><tbody>
${preencheColuna.map(c => `<tr><td class="nome">${esc(c.coluna)}</td><td class="num">${c.vazias}</td><td class="num"><b>${c.propostas}</b></td><td class="micro">${esc(c.fontes || '— não há fonte nossa para essa coluna')}</td></tr>`).join('')}
</tbody></table>
<div class="box">
  <h3>O que NÃO dá para preencher — e por quê</h3>
  <ul>
    <li><b>SCORE</b> — ${preencheColuna.find(c => c.coluna === 'SCORE').propostas} dos ${preencheColuna.find(c => c.coluna === 'SCORE').vazias} vazios saem do número que a própria equipe escreveu no grupo ("Score 648"). O resto só existe atrás de uma consulta paga no AgRisk: a ficha sem consulta completa não mostra score.</li>
    <li><b>E-RURAL</b> — não existe grupo de cadastro da eRural. Não há fonte nenhuma para conferir essa coluna; todo ✓ nela é declaração.</li>
    <li><b>PENDÊNCIAS</b> — só temos os casos em que o grupo comentou restrição ou "sem restrições". Sem consulta nova, o resto fica em branco mesmo.</li>
  </ul>
</div>

<div class="pg"></div>
<h2>Anexo · As ${R.length} linhas, com veredito</h2>
<table><thead><tr>
  <th style="width:8mm">Lin.</th><th style="width:16mm">Mês</th><th style="width:40mm">Cliente</th><th style="width:24mm">SDR</th>
  <th style="width:22mm">Assessor</th><th style="width:14mm">Planilha</th><th style="width:14mm">Apurado</th>
  <th class="r" style="width:22mm">VGV</th><th style="width:26mm">Como conferimos</th><th>Onde comprou</th>
</tr></thead><tbody>
${R.map(linhaVeredito).join('')}
</tbody></table>

<footer><span>Bula Assessoria · Cadastros que compraram × aba CADASTROS</span><span>Apurado em ${HOJE} · ${R.length} linhas · ${compraram.length} compradores · ${rs(VGV)}</span></footer>
`

const EXTRA = `
  @page { size: A4; margin: 13mm 11mm 19mm; }
  body { padding-bottom: 0; }
  footer { bottom: 7mm; }
  h2, h3 { break-after: avoid; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .caso { border:1px solid #e2e2e2; border-left:3px solid #0a0a0a; padding:6px 9px; margin:7px 0; break-inside:avoid; }
  .caso .cabeca { font-size:9.5pt; margin-bottom:2px; }
  .caso .prova { font-size:8pt; color:#3a3a3a; margin-top:4px; }
  .tag { font-size:7.5pt; border:1px solid #d5d5d5; border-radius:3px; padding:0 4px; margin-left:6px; color:#6b6b6b; }
  .tag.v { border-color:#2c6539; color:#2c6539; }
  .tag.x { border-color:#9c2e27; color:#9c2e27; }
  .ok { color:#2c6539; }
`
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cadastros que compraram</title><style>${CSS}${EXTRA}</style></head><body>${corpo}</body></html>`
const base = 'Cadastros-que-compraram-2026-09-09'
fs.writeFileSync(path.join(SAIDA, `${base}.html`), html)

const { chromium } = await import('playwright')
const navegador = await chromium.launch()
try {
    const pag = await navegador.newPage()
    await pag.setContent(html, { waitUntil: 'networkidle' })
    await pag.pdf({ path: path.join(SAIDA, `${base}.pdf`), format: 'A4', printBackground: true })
} finally { await navegador.close() }

/* ── XLSX ─────────────────────────────────────────────────────────────────── */
const wb = novoWorkbook('Cadastros que compraram — 09/09/2026')

{   // Placar
    const ws = novaAba(wb, 'Placar')
    let l = cabecalho(ws, 'Quem dos cadastros comprou', `Aba CADASTROS × ERP HastaPro, fechamentos, pregão e carteira · apurado em ${HOJE}`, 5)
    l = bloco(ws, l, 'O placar', 5)
    l = tabela(ws, l, [
        { t: 'Situação', k: 's', w: 44 }, { t: 'Qtd.', k: 'q', w: 10, al: 'r', fmt: '#,##0' },
        { t: 'VGV', k: 'v', w: 18, al: 'r', fmt: MOEDA_RS }, { t: 'O que significa', k: 'o', w: 78 },
    ], [
        { s: 'Linhas na aba CADASTROS', q: R.length, v: null, o: 'Linhas com nome preenchido, de abril a setembro/2026.' },
        { s: 'Compraram', q: compraram.length, v: VGV, o: 'Aparecem como arrematantes em pelo menos uma das quatro fontes.', __cor: 'verde' },
        { s: 'Sem compra em base nossa', q: R.length - compraram.length, v: null, o: 'Não quer dizer que nunca compraram: quer dizer que não compraram em leilão que passou pela Bula.' },
        { s: 'Marcadas VERMELHO e compraram', q: vermelhoComCompra.length, v: vermelhoComCompra.reduce((a, r) => a + r.vgv, 0), o: 'Compra fora da conta da aba.', __cor: 'vermelho' },
        { s: 'Marcadas VERDE e sem compra', q: verdeSemCompra.length, v: null, o: 'Ou compraram fora da Bula, ou em nome de terceiro, ou a marcação foi otimista.', __cor: 'vermelho' },
        { s: 'Sem marcação', q: brancos.length, v: null, o: 'A coluna "Já comprou?" está em branco (sem cor).' },
        { s: 'Células preenchíveis', q: celulas, v: null, o: `De ${vaziasTotal} células vazias nas colunas de trabalho. Detalhe na aba "Preencher".` },
    ])
    l = bloco(ws, l, 'Por mês de entrada', 5)
    l = tabela(ws, l, [
        { t: 'Mês', k: 'mes', w: 20 }, { t: 'Cadastros', k: 'n', w: 14, al: 'r', fmt: '#,##0' },
        { t: 'Compraram', k: 'c', w: 14, al: 'r', fmt: '#,##0' }, { t: 'Taxa', k: 't', w: 12, al: 'r' },
        { t: 'VGV', k: 'vgv', w: 18, al: 'r', fmt: MOEDA_RS },
    ], [...porMes.map(m => ({ ...m, t: pct(m.c, m.n) })), { mes: 'Total', n: R.length, c: compraram.length, t: pct(compraram.length, R.length), vgv: VGV, __total: true }], { larguras: true, filtro: false })
    l = bloco(ws, l, 'Por SDR', 5)
    l = tabela(ws, l, [
        { t: 'SDR', k: 'sdr', w: 24 }, { t: 'Cadastros', k: 'n', w: 14, al: 'r', fmt: '#,##0' },
        { t: 'Compraram', k: 'c', w: 14, al: 'r', fmt: '#,##0' }, { t: 'Taxa', k: 't', w: 12, al: 'r' },
        { t: 'VGV', k: 'vgv', w: 18, al: 'r', fmt: MOEDA_RS },
    ], porSdr.map(s => ({ ...s, t: pct(s.c, s.n) })), { filtro: false })
    l = caixa(ws, l, 'A régua', '"Comprou" = arrematou em leilão que passou pela Bula, registrado no ERP HastaPro (FIL 01 e FIL 2), nos fechamentos do sistema, no lance cantado no grupo ou na carteira do assessor. Compra feita direto com outra leiloeira, ou em nome de fazenda/esposa/empresa, não aparece em base nossa. Homônimo é recusado em vez de chutado.', 5)
    impressao(ws, { paisagem: true, rodape: 'Bula Assessoria · Cadastros que compraram' })
}

{   // Já comprou — linha a linha
    const ws = novaAba(wb, 'Já comprou')
    let l = cabecalho(ws, 'Resposta linha a linha para a coluna "Já comprou?"', `${R.length} linhas da aba CADASTROS · apurado em ${HOJE}`, 11)
    l = tabela(ws, l, [
        { t: 'Linha', k: 'linha', w: 8, al: 'r' }, { t: 'Mês', k: 'mes', w: 12 }, { t: 'Nome', k: 'nome', w: 34 },
        { t: 'SDR', k: 'sdr', w: 18 }, { t: 'Assessor', k: 'assessor', w: 18 },
        { t: 'Marcado hoje', k: 'marcado', w: 13, al: 'c' }, { t: 'Já comprou?', k: 'apurado', w: 13, al: 'c' },
        { t: 'Bate?', k: 'bate', w: 12, al: 'c' }, { t: 'VGV', k: 'vgv', w: 16, al: 'r', fmt: MOEDA_RS },
        { t: 'Como conferimos', k: 'certeza', w: 24 }, { t: 'Onde comprou', k: 'onde', w: 60 },
    ], R.map(r => ({
        linha: r.linha, mes: r.mes, nome: r.nome, sdr: r.sdr, assessor: r.assessor,
        marcado: r.marcado || '—', apurado: r.comprou ? 'SIM' : 'NÃO',
        bate: bate(r) === 'ok' ? 'ok' : bate(r) === 'branco' ? 'sem marcação' : 'DIVERGE',
        vgv: r.vgv || null, certeza: r.certeza || '', onde: r.eventos.join(' · ') || (r.soPregao ? 'pregão sem valor fechado' : ''),
        __cor: bate(r) === 'diverge' ? 'vermelho' : (r.comprou ? 'verde' : undefined),
    })), { congelaCol: 3 })
    nota(ws, l, 'A coluna "Marcado hoje" lê a COR da célula na planilha (verde = comprou, vermelho = não). A coluna "Já comprou?" é a apuração contra o ERP e os fechamentos.', 11)
    impressao(ws, { paisagem: true, repetir: '1:6' })
}

{   // Divergências
    const ws = novaAba(wb, 'Divergências')
    let l = cabecalho(ws, 'As marcações que não se sustentam', `${divergentes.length} divergências + ${brancos.length} sem marcação`, 8)
    l = tabela(ws, l, [
        { t: 'Linha', k: 'linha', w: 8, al: 'r' }, { t: 'Nome', k: 'nome', w: 32 }, { t: 'Marcado', k: 'marcado', w: 12, al: 'c' },
        { t: 'Apurado', k: 'apurado', w: 12, al: 'c' }, { t: 'VGV', k: 'vgv', w: 16, al: 'r', fmt: MOEDA_RS },
        { t: 'Prova (ou ausência dela)', k: 'prova', w: 76 }, { t: 'O que fazer', k: 'acao', w: 46 },
    ], [...vermelhoComCompra, ...verdeSemCompra, ...brancos].map(r => ({
        linha: r.linha, nome: r.nome, marcado: r.marcado || '—', apurado: r.comprou ? 'SIM' : 'NÃO', vgv: r.vgv || null,
        prova: r.provas.length ? provasTxt(r) : 'Nenhuma compra no ERP (FIL 01 e 2), nos fechamentos, nos lances do grupo ou na carteira.',
        acao: r.comprou ? 'Marcar VERDE — a compra está no ERP.' : 'Confirmar com o SDR/assessor: comprou fora da Bula, em nome de terceiro, ou a marcação foi otimista?',
        __cor: r.comprou ? 'verde' : 'vermelho',
    })))
    impressao(ws, { paisagem: true })
}

{   // Preencher
    const ws = novaAba(wb, 'Preencher')
    let l = cabecalho(ws, 'Proposta de preenchimento, célula a célula', `${celulas} células com resposta em base nossa · conferir antes de colar`, 6)
    l = tabela(ws, l, [
        { t: 'Linha', k: 'linha', w: 8, al: 'r' }, { t: 'Nome', k: 'nome', w: 32 }, { t: 'Coluna', k: 'coluna', w: 16 },
        { t: 'Valor proposto', k: 'valor', w: 40 }, { t: 'Fonte', k: 'fonte', w: 30 },
        { t: 'Conferir — o registro está em outro nome', k: 'conferir', w: 34 },
    ], propostas.map(p => ({ ...p, __cor: p.conferir ? 'vermelho' : undefined })))
    l = bloco(ws, l, 'Resumo por coluna', 6)
    l = tabela(ws, l, [
        { t: 'Coluna', k: 'coluna', w: 18 }, { t: 'Vazias hoje', k: 'vazias', w: 14, al: 'r', fmt: '#,##0' },
        { t: 'Preenchíveis', k: 'propostas', w: 14, al: 'r', fmt: '#,##0' }, { t: 'De onde vem', k: 'fontes', w: 74 },
    ], preencheColuna, { larguras: false, filtro: false, congela: false })
    impressao(ws, { paisagem: true })
}

{   // Compras (detalhe)
    const ws = novaAba(wb, 'Compras (detalhe)')
    const linhas = []
    for (const r of compraram) for (const p of r.provas) linhas.push({
        linha: r.linha, nome: r.nome, fonte: fonteCurta[p.fonte] || p.fonte, filial: p.filial ? `FIL ${p.filial}` : '',
        data: dataBrIso(p.data), evento: p.evento, lote: String(p.lote ?? ''), valor: p.valor || null,
        parcela: p.parcela || null, via: p.via, comprador: p.nome,
    })
    let l = cabecalho(ws, 'Cada compra encontrada, com a fonte', `${linhas.length} registros de ${compraram.length} pessoas`, 10)
    l = tabela(ws, l, [
        { t: 'Linha', k: 'linha', w: 8, al: 'r' }, { t: 'Nome na aba', k: 'nome', w: 30 }, { t: 'Fonte', k: 'fonte', w: 20 },
        { t: 'Filial', k: 'filial', w: 9, al: 'c' }, { t: 'Data', k: 'data', w: 12, al: 'c' }, { t: 'Leilão', k: 'evento', w: 44 },
        { t: 'Lote', k: 'lote', w: 12 }, { t: 'VGV', k: 'valor', w: 15, al: 'r', fmt: MOEDA_RS },
        { t: 'Parcela', k: 'parcela', w: 12, al: 'r', fmt: MOEDA_RS }, { t: 'Como casou', k: 'via', w: 14 },
    ], linhas)
    nota(ws, l, 'O mesmo arremate aparece em mais de uma fonte (ERP e fechamento). O VGV do relatório NÃO soma as fontes: usa o ERP quando existe, senão o fechamento, senão a carteira.', 10)
    impressao(ws, { paisagem: true })
}

{   // Dados a corrigir
    const ws = novaAba(wb, 'Dados a corrigir')
    let l = cabecalho(ws, 'O que trava a conferência automática', 'CPF inválido, CPF de outra pessoa, duplicata e campo vazio', 5)
    const linhas = [
        ...cpfDeOutro.map(r => ({ tipo: 'CPF de outra pessoa', linha: r.linha, nome: r.nome, valor: r.cpfTxt, nota: `No HastaPro esse CPF é de ${r.cpfDeOutro.join(', ')}.${r.homonimos.length ? ` O mesmo nome aparece no ERP como ${r.homonimos[0]}.` : ''}`, __cor: 'vermelho' })),
        ...cpfInvalido.map(r => ({ tipo: 'CPF inválido', linha: r.linha, nome: r.nome, valor: r.cpfTxt, nota: 'Dígito verificador não fecha — nenhuma conferência automática vai casar.', __cor: 'vermelho' })),
        ...semCpf.map(r => ({ tipo: 'Sem CPF', linha: r.linha, nome: r.nome, valor: '', nota: r.preencher.CPF ? `Proposta: ${r.preencher.CPF.valor} (${r.preencher.CPF.fonte}).` : 'Sem CPF em base nossa.' })),
        ...duplicadas.flatMap(g => g.map(r => ({ tipo: 'Repetida na aba', linha: r.linha, nome: r.nome, valor: r.cpfTxt, nota: `Mesma pessoa nas linhas ${g.map(x => x.linha).join(' e ')}.` }))),
    ]
    l = tabela(ws, l, [
        { t: 'Problema', k: 'tipo', w: 22 }, { t: 'Linha', k: 'linha', w: 8, al: 'r' }, { t: 'Nome', k: 'nome', w: 32 },
        { t: 'Valor na planilha', k: 'valor', w: 20 }, { t: 'Nota', k: 'nota', w: 80 },
    ], linhas)
    impressao(ws, { paisagem: true })
}

await wb.xlsx.writeFile(path.join(SAIDA, `${base}.xlsx`))

console.log(`\n${R.length} linhas · ${compraram.length} compraram (${pct(compraram.length, R.length)}) · ${rs(VGV)}`)
console.log(`${divergentes.length} divergências · ${brancos.length} sem marcação · ${celulas} células preenchíveis`)
console.log(`\n→ ${SAIDA}`)
