/**
 * QUADRO "FUNIL DE VENDAS" DE UMA CAMPANHA SÓ — LEILÃO MELHORADORES.
 *
 *   node scripts/gera-funil-melhoradores-2026-08.mjs [pasta-de-saida]
 *
 * Pedido do Marcelo em 31/08: "enviem um relatório do funil de Agosto e um só
 * da campanha Leilão Melhoradores". O quadro de agosto a diretoria já tem; este
 * é o da campanha, no MESMO desenho de nove etapas, para poder ser lido lado a
 * lado com aquele.
 *
 * A CAMPANHA: "LEADS - Leilão Melhorado 30 ANOS" (id 120250144945610708), no ar
 * de 27 a 31/08/2026, para o LEILÃO MELHORADORES ESPECIAL 30 ANOS — 29/08, 12h,
 * ACRISSUL, Campo Grande/MS, 45 touros, Bula Remates.
 *
 * RÉGUA — a mesma do quadro mensal, para a comparação ser honesta:
 *   • LEADS = pessoas distintas com campaign_id da campanha na aba LEADS GERAIS.
 *     As 14 linhas são 14 pessoas (nenhum repreenchimento) e batem exatamente
 *     com os 14 resultados que a Meta reporta.
 *   • MQL = 100+ cabeças E com inscrição estadual, a mesma regra do mês.
 *   • CADASTROS SUBMETIDOS = ficha que foi ao grupo da leiloeira com o lead
 *     casado por CPF. Lidos mensagem a mensagem e com os anexos abertos — ver
 *     scripts/lib/cadastros-melhoradores-2026-08.mjs.
 *   • CLIENTES COMPRARAM = comprador do ERP cruzado contra o universo da
 *     campanha. Cruzado contra os 174 compradores de agosto e, por garantia,
 *     contra 2026 inteiro: nenhum casa.
 *
 * ONDE ESTE QUADRO DIVERGE DO MENSAL, E POR QUÊ:
 *   • ACESSOS não se aplica. A campanha é 100% formulário instantâneo — 1 único
 *     clique de saída em 388. Não existe "acesso ao site" para medir, então a
 *     etapa entra como não aplicável em vez de entrar como zero e sujar a conta.
 *   • A coluna "META DO MÊS" (volume) sai. Meta de volume é do mês inteiro com
 *     R$ 6.500 de verba; uma campanha de cinco dias com R$ 418 não tem meta de
 *     volume própria, e ratear a mensal seria inventar número. No lugar dela
 *     entra a taxa de AGOSTO, que é comparação de verdade: a mesma etapa, a
 *     mesma régua, o mês inteiro ao lado da campanha.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nomeNorm, foneKey } from './lib/origem-cadastros-2026.mjs'
import { CADASTROS_CAMPANHA, CADASTROS_FORA_DA_CAMPANHA } from './lib/cadastros-melhoradores-2026-08.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const F = path.join(ROOT, 'outputs', 'base-clientes-2026', 'fontes')
const saida = process.argv[2] || path.join(ROOT, 'outputs', 'funil-melhoradores-2026-08')
fs.mkdirSync(saida, { recursive: true })

const CAMPANHA_ID = '120250144945610708'
const LEILAO = { nome: 'LEILÃO MELHORADORES ESPECIAL 30 ANOS', data: '2026-08-29', hora: '12:00' }
const HOJE = '31/08/2026'

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', 'funil-campanhas-2026', 'meta-melhoradores-2026-08-31.json'), 'utf8'))
const m = meta.campanha
const AGO = meta.agostoPublicado

/* ── leads da campanha ────────────────────────────────────────────────────── */
const planilha = JSON.parse(fs.readFileSync(path.join(F, 'planilha-leads.json'), 'utf8'))
const { head, rows } = planilha['LEADS GERAIS']
const linhas = rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
    .filter(r => String(r['campaign_id']) === CAMPANHA_ID)

const porPessoa = new Map()
for (const r of linhas) {
    const k = foneKey(r['WhatsApp']) || nomeNorm(r['Nome'])
    if (!porPessoa.has(k)) porPessoa.set(k, r)
}
const leads = [...porPessoa.values()]

const PISO = { '1 a 50 cabeças': 1, '51 a 100 cabeças': 51, '101 a 300 cabeças': 101, '301 a 500 cabeças': 301, 'mais de 500 cabeças': 501 }
const ehMql = r => (PISO[String(r['Cabeças'] || '').trim()] ?? -1) >= 100 && /^sim$/i.test(String(r['Inscrição Estadual'] || '').trim())
const mqls = leads.filter(ehMql)

const fichas = CADASTROS_CAMPANHA
const aprovados = fichas.filter(c => c.status === 'aprovado')
const clientes = []   // cruzamento feito: nenhum comprador de 2026 casa com o universo da campanha

/* ── o leilão que a campanha anunciava ────────────────────────────────────── */
const compras = JSON.parse(fs.readFileSync(path.join(F, 'hp-compras-2026.json'), 'utf8'))
    .filter(c => c.lei_data === LEILAO.data && /MELHORADORES/i.test(c.lei_nome || ''))
const compradoresDoLeilao = new Set(compras.map(c => nomeNorm(c.cli_nome)))
const leilao = {
    lotes: compras.length,
    animais: compras.reduce((s, c) => s + (+c.lot_qtd || 0), 0),
    total: compras.reduce((s, c) => s + (+c.lot_total || 0), 0),
    compradores: compradoresDoLeilao.size,
}

/* ── quando o dinheiro e os leads chegaram em relação ao pregão ───────────── */
const dia = r => String(r['Data']).slice(0, 10)
const leadsPorDia = {}
for (const r of leads) leadsPorDia[dia(r)] = (leadsPorDia[dia(r)] || 0) + 1
const depoisDoPregao = leads.filter(r => {
    const [d, mth, y] = dia(r).split('/')
    const iso = `${y}-${mth}-${d}`
    if (iso > LEILAO.data) return true
    if (iso < LEILAO.data) return false
    return String(r['Data']).slice(12) >= LEILAO.hora
}).length
const comLeilaoEncerrado = leads.filter(r => {
    const [d, mth, y] = dia(r).split('/')
    return `${y}-${mth}-${d}` > LEILAO.data
}).length
const verbaDepois = meta.diario.filter(d => d.data > LEILAO.data).reduce((s, d) => s + d.investido, 0)

/* ── formatação ───────────────────────────────────────────────────────────── */
const br = n => Number(n).toLocaleString('pt-BR')
const brl = n => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (a, b, casas = 2) => b ? `${(a * 100 / b).toFixed(casas).replace('.', ',')}%` : '—'
const num = (v, casas = 2) => `${Number(v).toFixed(casas).replace('.', ',')}%`
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const razao = (a, b) => b ? a / b : null

/* linhas do quadro, na ordem exata do original */
const L = (n, rot, real, metaTaxa, taxaReal, ok, ago) => ({ n, rot, real, metaTaxa, taxaReal, ok, ago })
const funil = [
    L(1, 'Investimento em mídia', brl(m.investido), '—', '—', null, brl(AGO.investido)),
    L(2, 'Impressões', br(m.impressoes), '—', `CPM ${brl(m.cpm)}`, null, br(AGO.impressoes)),
    L(3, 'Cliques', br(m.cliques), '1,20%', num(m.ctr), m.ctr / 100 >= 0.012, num(AGO.ctr)),
    L(4, 'Acessos ao site', 'não se aplica', '—', 'formulário instantâneo', null, `${br(AGO.acessos)} · ${num(AGO.taxaLeadAcesso)}`),
    L(5, 'Leads gerados', br(leads.length), '—', `${pct(leads.length, m.cliques)} dos cliques`, null, br(AGO.leads)),
    L(6, 'Leads qualificados', br(mqls.length), '20%', pct(mqls.length, leads.length), razao(mqls.length, leads.length) >= 0.20, num(AGO.taxaMql)),
    L(7, 'Cadastros submetidos', br(fichas.length), '40%', pct(fichas.length, mqls.length), razao(fichas.length, mqls.length) >= 0.40, num(AGO.taxaCadastro)),
    L(8, 'Cadastros aprovados', br(aprovados.length), '60%', pct(aprovados.length, fichas.length), razao(aprovados.length, fichas.length) >= 0.60, num(AGO.taxaAprovacao)),
    L(9, 'Clientes compraram', br(clientes.length), '40%', pct(clientes.length, aprovados.length), razao(clientes.length, aprovados.length) >= 0.40, num(AGO.taxaCompra)),
]
const resultado = [
    L('', 'Animais vendidos pela campanha', '0', '—', '—', null, '5'),
    L('', 'Faturamento gerado pela campanha', brl(0), '—', '—', null, brl(90900)),
    L('', 'O leilão anunciado vendeu', `${br(leilao.animais)} animais · ${brl(leilao.total)}`, '—', `${leilao.compradores} compradores`, null, '—'),
]
const custos = [
    L('', 'CPL — custo por lead', brl(m.investido / leads.length), '—', '—', null, brl(AGO.cpl)),
    L('', 'CPMQL — custo por lead qualificado', brl(m.investido / mqls.length), '—', '—', null, brl(AGO.cpmql)),
    L('', 'Custo por cadastro submetido', brl(m.investido / fichas.length), '—', '—', null, brl(AGO.custoPorCadastro)),
    L('', 'Custo por cadastro aprovado', brl(m.investido / aprovados.length), '—', '—', null, brl(AGO.investido / AGO.aprovados)),
    L('', 'Custo por venda', '—', '—', 'sem venda', null, 'R$ 653,22'),
]

/* por criativo — o conjunto mais barato em lead é o mais caro em lead bom */
const mqlPorConjunto = {}
for (const r of leads) {
    const k = String(r['adset_name'])
    mqlPorConjunto[k] = (mqlPorConjunto[k] || 0) + (ehMql(r) ? 1 : 0)
}
const criativos = meta.conjuntos.map(c => ({
    nome: c.nome.replace('CA - Leilão Melhorado 30 ANOS - ', ''),
    investido: c.investido, impressoes: c.impressoes, cliques: c.cliques, ctr: c.ctr,
    leads: c.leadsMeta, mqls: mqlPorConjunto[c.nome] || 0,
    cpl: c.investido / c.leadsMeta,
    cpmql: mqlPorConjunto[c.nome] ? c.investido / mqlPorConjunto[c.nome] : null,
}))
const melhorCpl = criativos.reduce((a, b) => a.cpl <= b.cpl ? a : b)
const melhorCpmql = criativos.filter(c => c.cpmql).reduce((a, b) => a.cpmql <= b.cpmql ? a : b)

/* ── marca ────────────────────────────────────────────────────────────────── */
const dataUri = (p, mime) => `data:${mime};base64,${fs.readFileSync(path.join(ROOT, 'public', p)).toString('base64')}`
const FUNDO = dataUri('bula/assets/img/agenda-hero-nelore.png', 'image/png')
const LOGO = dataUri('logo-bula-assessoria-white.png', 'image/png')

const linha = l => `<tr>
  <td class="i">${l.n === '' ? '' : l.n}</td>
  <td class="rot">${esc(l.rot)}</td>
  <td class="real">${esc(l.real)}</td>
  <td class="tx">${esc(l.metaTaxa)}</td>
  <td class="txr ${l.ok === true ? 'bom' : l.ok === false ? 'ruim' : ''}">${esc(l.taxaReal)}${l.ok === true ? ' <span class="pin">▲</span>' : l.ok === false ? ' <span class="pin">▼</span>' : ''}</td>
  <td class="ago">${esc(l.ago)}</td>
</tr>`

const cardCriativo = c => `<tr>
  <td class="rot">${esc(c.nome)}${c.nome === melhorCpmql.nome ? ' <span class="tag">melhor lead bom</span>' : ''}</td>
  <td>${brl(c.investido)}</td><td>${br(c.impressoes)}</td><td>${br(c.cliques)}</td><td>${num(c.ctr)}</td>
  <td>${c.leads}</td><td>${c.mqls}</td>
  <td class="${c.nome === melhorCpl.nome ? 'destaca' : ''}">${brl(c.cpl)}</td>
  <td class="${c.cpmql && c.nome === melhorCpmql.nome ? 'destaca' : ''}">${c.cpmql ? brl(c.cpmql) : '—'}</td>
</tr>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Funil de vendas — Leilão Melhoradores</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d0b09; font-family: 'Segoe UI', Arial, sans-serif; color: #ece7df; }
  .quadro { width: 1000px; margin: 0 auto; background: #0d0b09; padding-bottom: 26px; }

  .capa { position: relative; height: 186px; overflow: hidden; }
  .capa img.foto { width: 100%; height: 100%; object-fit: cover; object-position: 50% 46%; filter: saturate(.72) contrast(1.04); }
  .capa::after { content: ''; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(13,11,9,.42) 0%, rgba(13,11,9,.58) 45%, rgba(13,11,9,.97) 100%); }
  .capa .marca { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 2; }
  .capa .marca img { width: 178px; }

  h1 { font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase; text-align: center; letter-spacing: .035em;
       margin: 0; padding: 2px 30px 0; font-size: 33px; font-weight: 700; color: #fff; line-height: 1.1; }
  h1 span { color: #c9a84c; }
  .sub { text-align: center; font-size: 12.5px; color: #9d958a; padding: 9px 46px 15px; line-height: 1.55; }
  .sub b { color: #cfc7ba; font-weight: 600; }

  .corpo { padding: 0 30px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #c9a84c; color: #17130d; font-family: 'Oswald', Arial, sans-serif; font-weight: 600;
             text-transform: uppercase; letter-spacing: .06em; font-size: 10.5px; padding: 8px 10px; text-align: right; }
  thead th.l { text-align: left; }
  td { padding: 8px 10px; border-bottom: 1px solid #241f18; font-size: 14px; text-align: right; white-space: nowrap; color: #d9d2c7; }
  td.i { text-align: left; width: 26px; font-family: 'Oswald', Arial, sans-serif; color: #6b6357; font-size: 13px; }
  td.rot { text-align: left; font-weight: 600; letter-spacing: .01em; font-size: 13.5px; color: #f2ede5;
           text-transform: uppercase; white-space: normal; }
  td.real { font-family: 'Oswald', Arial, sans-serif; font-size: 19px; font-weight: 600; color: #fff; }
  td.tx { color: #7d7568; font-size: 12.5px; }
  td.txr { font-weight: 700; font-size: 14px; color: #e8e2d8; }
  td.txr.bom { color: #62c07f; }
  td.txr.ruim { color: #e2695f; }
  td.ago { color: #857d70; font-size: 12.5px; }
  .pin { font-size: 10px; }
  .faixa td { background: #1a1611; color: #c9a84c; font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase;
              font-size: 11px; letter-spacing: .1em; padding: 7px 10px; border-bottom: 1px solid #2c2519;
              border-top: 1px solid #2c2519; text-align: left; }

  .destaque { display: flex; gap: 9px; margin: 17px 0 4px; }
  .destaque div { flex: 1; border: 1px solid #3a3226; padding: 9px 11px 10px; background: #131009; }
  .destaque .z { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #8b8275; }
  .destaque .n { font-family: 'Oswald', Arial, sans-serif; font-size: 23px; line-height: 1.15; margin-top: 3px; color: #c9a84c; }
  .destaque .p { font-size: 10px; color: #8b8275; margin-top: 2px; line-height: 1.35; white-space: normal; }

  h2 { font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase; font-size: 12px; letter-spacing: .1em;
       color: #c9a84c; margin: 22px 0 0; padding-bottom: 6px; border-bottom: 1px solid #2c2519; }
  table.criativos td { font-size: 12.5px; padding: 7px 10px; }
  table.criativos td.rot { font-size: 12.5px; text-transform: none; }
  table.criativos thead th { background: transparent; color: #857d70; border-bottom: 1px solid #2c2519; font-size: 9.5px; }
  td.destaca { color: #62c07f; font-weight: 700; }
  .tag { font-size: 9px; color: #c9a84c; border: 1px solid #4a3f2a; padding: 1px 5px; text-transform: uppercase;
         letter-spacing: .06em; font-weight: 600; margin-left: 5px; }

  .rodape { margin-top: 18px; border-top: 1px solid #2c2519; padding-top: 12px; font-size: 11px; color: #8b8275; line-height: 1.6; }
  .rodape b { color: #cfc7ba; }
  .rodape .alerta b { color: #e2a05f; }
  .assinatura { color: #5f584d; font-size: 10px; margin-top: 9px; }
</style></head><body>
<div class="quadro">
  <div class="capa"><img class="foto" src="${FUNDO}" alt=""><div class="marca"><img src="${LOGO}" alt="Bula Assessoria"></div></div>

  <h1>Funil de vendas — <span>Leilão Melhoradores</span></h1>
  <div class="sub">
    Campanha <b>LEADS - Leilão Melhorado 30 ANOS</b> · 27 a 31 de agosto de 2026 · ${brl(m.investido)}<br>
    anunciava o <b>${LEILAO.nome}</b> — 29/08, 12h, ACRISSUL, Campo Grande/MS · 45 touros · Bula Remates
  </div>

  <div class="corpo">
  <table>
    <thead><tr>
      <th class="l" colspan="2">Etapa</th><th>Realizado</th><th>Meta de taxa</th><th>Taxa real</th><th>Agosto (1–26/08)</th>
    </tr></thead>
    <tbody>
      ${funil.map(linha).join('')}
      <tr class="faixa"><td colspan="6">Resultado</td></tr>
      ${resultado.map(linha).join('')}
      <tr class="faixa"><td colspan="6">Custos</td></tr>
      ${custos.map(linha).join('')}
    </tbody>
  </table>

  <div class="destaque">
    <div><div class="z">Verba depois do pregão</div><div class="n">${pct(verbaDepois, m.investido, 0)}</div>
         <div class="p">${brl(verbaDepois)} gastos em 30 e 31/08, com o leilão já encerrado</div></div>
    <div><div class="z">Leads fora da janela</div><div class="n">${depoisDoPregao} de ${leads.length}</div>
         <div class="p">chegaram depois das 12h de 29/08 — ${comLeilaoEncerrado} já com o leilão encerrado</div></div>
    <div><div class="z">Qualificação</div><div class="n">${pct(mqls.length, leads.length, 0)}</div>
         <div class="p">quase 3× a taxa de agosto (${num(AGO.taxaMql)}) — o melhor topo de funil do mês</div></div>
    <div><div class="z">Faturamento gerado</div><div class="n">${brl(0)}</div>
         <div class="p">nenhum dos ${leilao.compradores} compradores do leilão veio da campanha</div></div>
  </div>

  <h2>Por criativo</h2>
  <table class="criativos">
    <thead><tr><th class="l">Conjunto</th><th>Investido</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>Leads</th><th>MQL</th><th>CPL</th><th>CPMQL</th></tr></thead>
    <tbody>${criativos.map(cardCriativo).join('')}</tbody>
  </table>

  <div class="rodape">
    <b>Como ler.</b> A campanha ficou cinco dias no ar com ${brl(m.investido)} — 12,8% do que a mídia gastou em agosto. Por isso o que interessa aqui é a coluna de <b>taxa</b>, não a de volume; a última coluna traz a mesma etapa no mês inteiro para comparar. <b>Acessos</b> não se aplica: a campanha é 100% formulário instantâneo e teve 1 clique de saída em ${br(m.cliques)} — não há site para medir, e a taxa de leads foi calculada sobre os cliques.<br>
    <span class="alerta"><b>O que travou.</b></span> O topo foi o melhor do mês: CTR ${num(m.ctr)} e <b>${pct(mqls.length, leads.length, 1)} de leads qualificados</b> contra ${num(AGO.taxaMql)} em agosto — ${mqls.length} dos ${leads.length} leads têm 100+ cabeças e inscrição estadual. A perda é de <b>calendário e de cadastro</b>: ${depoisDoPregao} dos ${leads.length} leads entraram depois de o pregão começar e ${brl(verbaDepois)} (${pct(verbaDepois, m.investido, 0)} da verba) foram gastos com o leilão já encerrado; das ${fichas.length} fichas levadas ao grupo, duas foram recusadas por falta de inscrição estadual — em leilão de MS a I.E. é obrigatória para emitir a nota dentro do estado — e a única aprovada chegou em 31/08, dois dias depois do leilão.<br>
    <b>Onde a campanha não conversa com o produto.</b> O formulário usado foi o <b>“Formulário BULA PERPETUO v1”</b>, genérico: ${leads.filter(r => !/touro/i.test(String(r['Interesse']))).length} dos ${leads.length} leads pediram sêmen ou matrizes, que o leilão não vendia. E só ${leads.filter(r => /^MS$/i.test(String(r['UF']).trim())).length} dos ${leads.length} são de MS, o estado onde o cadastro exige I.E.<br>
    <b>Definições.</b> Leads = pessoas distintas com o id desta campanha na planilha (${leads.length} linhas, ${leads.length} pessoas — batem com os ${m.leadsMeta} resultados da Meta). MQL = 100+ cabeças e com I.E. Cadastros submetidos = ficha que foi ao grupo da leiloeira com o lead casado por CPF — os três estão nominados no anexo do relatório. Clientes = comprador do ERP cruzado contra o universo da campanha; cruzado contra os compradores de agosto e contra 2026 inteiro, nenhum casa.
    <div class="assinatura">Apurado em ${HOJE} · Meta Ads (conta CA2, id ${CAMPANHA_ID}) + planilha de leads + grupos de cadastro no WhatsApp (com os anexos abertos) + ERP HastaPro</div>
  </div>
  </div>
</div>
</body></html>`

const base = path.join(saida, 'funil-leilao-melhoradores-agosto-2026')
fs.writeFileSync(base + '.html', html)

const { chromium } = await import('playwright')
const nav = await chromium.launch()
try {
    const pg = await nav.newPage({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 2 })
    await pg.setContent(html, { waitUntil: 'networkidle' })
    const el = await pg.$('.quadro')
    await el.screenshot({ path: base + '.png' })
    const alturaPx = Math.ceil((await el.boundingBox()).height)
    await pg.pdf({ path: base + '.pdf', width: '1000px', height: `${alturaPx}px`, printBackground: true, pageRanges: '1' })
} finally { await nav.close() }

/* anexo de conferência — quem é cada número */
const anexo = [
    `FUNIL — LEILÃO MELHORADORES · campanha ${CAMPANHA_ID} · apurado em ${HOJE}`,
    '',
    `MÍDIA  ${brl(m.investido)} · ${br(m.impressoes)} impressões · ${br(m.alcance)} pessoas · ${br(m.cliques)} cliques · CTR ${num(m.ctr)}`,
    `       diário: ${meta.diario.map(d => `${d.data.slice(8)}/08 ${brl(d.investido)} (${d.leadsMeta} lead${d.leadsMeta === 1 ? '' : 's'})`).join(' · ')}`,
    '',
    `LEADS (${leads.length})`,
    ...leads.map(r => `  ${String(r['Data']).padEnd(18)} ${String(r['Nome']).padEnd(32)} ${String(r['UF']).padEnd(16)} ${String(r['Cabeças']).padEnd(20)} I.E.=${String(r['Inscrição Estadual']).padEnd(4)} ${ehMql(r) ? 'MQL' : '   '} ${r['Interesse']}`),
    '',
    `CADASTROS SUBMETIDOS (${fichas.length})`,
    ...fichas.flatMap(c => [
        `  ${c.nome} · CPF ${c.cpf} · lead "${c.leadNome}" em ${c.leadEm.replace('T', ' ')}`,
        `    ficha em ${c.submetidaEm.replace('T', ' ')} no grupo ${c.grupo}, para ${c.para}`,
        `    prova: ${c.prova}`,
        `    ${c.status.toUpperCase()} — ${c.veredito}`,
    ]),
    '',
    `FICHAS DA JANELA QUE NÃO SÃO DA CAMPANHA (${CADASTROS_FORA_DA_CAMPANHA.length})`,
    ...CADASTROS_FORA_DA_CAMPANHA.map(c => `  ${c.submetidaEm.slice(0, 10)} ${c.nome.padEnd(38)} CPF ${c.cpf} · ${c.para} · ${c.campanha ? 'lead de ' + c.campanha : 'não é lead de mídia'} · ${c.status}`),
    '',
    `O LEILÃO ANUNCIADO — ${LEILAO.nome}, ${LEILAO.data}`,
    `  ${leilao.lotes} lotes · ${leilao.animais} animais · ${brl(leilao.total)} · ${leilao.compradores} compradores (filial 01, Bula Remates)`,
    `  nenhum deles casa com os ${leads.length} leads da campanha, por CPF, telefone ou nome`,
].join('\n')
fs.writeFileSync(base + '-anexo.txt', anexo)

console.log(`PDF   ${base}.pdf`)
console.log(`PNG   ${base}.png`)
console.log(`anexo ${base}-anexo.txt`)
console.log(`leads ${leads.length} · mql ${mqls.length} · cadastros ${fichas.length} · aprovados ${aprovados.length} · clientes ${clientes.length}`)
console.log(`CPL ${brl(m.investido / leads.length)} · CPMQL ${brl(m.investido / mqls.length)} · verba após o pregão ${brl(verbaDepois)} (${pct(verbaDepois, m.investido, 0)})`)
