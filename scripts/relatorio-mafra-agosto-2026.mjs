// Conferência do fechamento dos leilões NELORE MAFRA (Redenção/PA) de agosto/2026
// direto no HastaPró (Firebird, SOMENTE LEITURA) cruzado com o sistema Bula.
// Saída: PDF no padrão brandbook na Área de Trabalho.
// Uso: node scripts/relatorio-mafra-agosto-2026.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import FirebirdNS from 'node-firebird'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const Firebird = FirebirdNS.default ?? FirebirdNS
const dec = v => Buffer.isBuffer(v) ? v.toString('latin1').trim()
    : v instanceof Date ? v.toISOString().slice(0, 10)
    : Array.isArray(v) ? v.map(dec)
    : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dec(x)])) : v
const db = await new Promise((res, rej) => Firebird.attach({
    host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT || 3050), database: env.HASTAPRO_DATABASE,
    user: env.HASTAPRO_USER || 'SYSDBA', password: env.HASTAPRO_PASSWORD, encoding: 'NONE',
}, (e, d) => e ? rej(e) : res(d)))
const q = (sql, p = []) => new Promise((res, rej) => db.query(sql, p, (e, r) => e ? rej(e) : res((r ?? []).map(dec))))

const FEMEAS = '260801161934455', TOUROS = '260805074106574'

const lotes = await q(`
    SELECT L.LEI_CODIGO, L.LOT_LOTE, L.LOT_QTD, L.LOT_LANCE, L.LOT_TOTAL, L.LOT_DATA_VENDA,
           P.PRE_NOME AS PISTEIRO, C.CLI_NOME AS COMPRADOR, C.CLI_UF, CO.COP_COMPAGO
    FROM LOTES L
    LEFT JOIN PRESTADORES P ON P.PRE_CODIGO = L.LOT_PISTEIRO
    LEFT JOIN COMPRADORES CO ON CO.LEI_CODIGO = L.LEI_CODIGO AND CO.LOT_LOTE = L.LOT_LOTE AND CO.FIL_CODIGO = L.FIL_CODIGO
    LEFT JOIN CLIENTES C ON C.CLI_CODIGO = CO.CLI_CODIGO
    WHERE L.LEI_CODIGO IN (?, ?) ORDER BY L.LEI_CODIGO, L.LOT_TOTAL DESC`, [FEMEAS, TOUROS])

const titulos = await q(`
    SELECT T.TIT_TIPO, T.TIT_DESCRICAO, T.TIT_VALOR, T.TIT_DT_VENCTO, T.TIT_STATUS, T.LEI_CODIGO,
           P.PRE_NOME AS FORNECEDOR
    FROM FIN_TITULOS T LEFT JOIN PRESTADORES P ON P.PRE_CODIGO = T.TIT_FORNECEDOR
    WHERE T.LEI_CODIGO IN (?, ?) ORDER BY T.TIT_TIPO DESC, T.TIT_DT_VENCTO`, [FEMEAS, TOUROS])
db.detach()

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const { data: fech } = await sb.from('bula_leilao_fechamento')
    .select('data, nome, lotes_vendidos, animais_vendidos, vgv_total, receita_bula, origem, por_assessor')
    .gte('data', '2026-08-01').lt('data', '2026-08-05')

const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => 'R$ ' + Math.round(Number(n || 0)).toLocaleString('pt-BR')
const canon = s => String(s || '').trim().replace(/\s+/g, ' ')
const nomeAssessor = s => /omena/i.test(s) ? 'Fábio Omena Gaia' : /douglas/i.test(s) ? 'Douglas Bispo' : canon(s) || '(sem pisteiro)'

const pregoes = [
    { id: FEMEAS, nome: 'Leilão Nelore Mafra — Edição Redenção/PA · 320 Fêmeas', data: '01/08/2026', curto: 'Fêmeas' },
    { id: TOUROS, nome: 'Leilão Nelore Mafra — Edição Redenção/PA · 220 Touros', data: '02/08/2026', curto: 'Touros' },
].map(p => {
    const ls = lotes.filter(l => l.LEI_CODIGO === p.id)
    return { ...p, lotes: ls, n: ls.length, animais: ls.reduce((s, l) => s + Number(l.LOT_QTD || 0), 0), vgv: ls.reduce((s, l) => s + Number(l.LOT_TOTAL || 0), 0) }
})
const tot = {
    n: pregoes.reduce((s, p) => s + p.n, 0),
    animais: pregoes.reduce((s, p) => s + p.animais, 0),
    vgv: pregoes.reduce((s, p) => s + p.vgv, 0),
}

// venda por assessor (pisteiro do HastaPró) x comissão de 2% lançada como CP
const porAss = new Map()
for (const l of lotes) {
    const k = nomeAssessor(l.PISTEIRO)
    const cur = porAss.get(k) ?? { nome: k, lotes: 0, animais: 0, vgv: 0, cp: 0 }
    cur.lotes++; cur.animais += Number(l.LOT_QTD || 0); cur.vgv += Number(l.LOT_TOTAL || 0)
    porAss.set(k, cur)
}
for (const t of titulos.filter(t => t.TIT_TIPO === 'D' && t.FORNECEDOR)) {
    const k = nomeAssessor(t.FORNECEDOR)
    if (porAss.has(k)) porAss.get(k).cp += Number(t.TIT_VALOR || 0)
}
const assessores = [...porAss.values()].map(a => ({ ...a, devido: a.vgv * 0.02, gap: a.vgv * 0.02 - a.cp })).sort((x, y) => y.vgv - x.vgv)
const totCp = assessores.reduce((s, a) => s + a.cp, 0)
const totDevido = assessores.reduce((s, a) => s + a.devido, 0)

// concentração de compradores
const porComp = new Map()
for (const l of lotes) {
    const k = canon(l.COMPRADOR) || '(sem comprador)'
    const cur = porComp.get(k) ?? { nome: k, uf: l.CLI_UF || '—', lotes: 0, animais: 0, vgv: 0 }
    cur.lotes++; cur.animais += Number(l.LOT_QTD || 0); cur.vgv += Number(l.LOT_TOTAL || 0)
    porComp.set(k, cur)
}
const compradores = [...porComp.values()].sort((x, y) => y.vgv - x.vgv)

const cr = titulos.filter(t => t.TIT_TIPO === 'R')
const receita4 = tot.vgv * 0.04
const fechFemeas = (fech ?? []).find(f => f.data === '2026-08-01')
const fechTouros = (fech ?? []).find(f => f.data === '2026-08-02')

const linhaLote = l => `<tr>
  <td class="c">${l.LOT_LOTE}</td><td class="c">${l.LOT_QTD}</td>
  <td class="r">${Number(l.LOT_LANCE).toLocaleString('pt-BR')}</td>
  <td class="c">${Math.round(l.LOT_TOTAL / (l.LOT_LANCE * l.LOT_QTD))}x</td>
  <td class="r">${brl0(l.LOT_TOTAL)}</td>
  <td>${canon(l.COMPRADOR) || '—'}</td><td class="c">${l.CLI_UF || '—'}</td>
  <td>${nomeAssessor(l.PISTEIRO)}</td></tr>`

const tabelaLotes = p => `<table>
  <thead><tr><th style="width:40px" class="c">Lote</th><th style="width:34px" class="c">Qtd</th><th style="width:58px" class="r">Parcela</th><th style="width:44px" class="c">Parc.</th><th style="width:84px" class="r">VGV</th><th>Comprador</th><th style="width:30px" class="c">UF</th><th style="width:118px">Assessor (pisteiro)</th></tr></thead>
  <tbody>${p.lotes.map(linhaLote).join('')}</tbody>
  <tfoot><tr><td class="c">${p.n}</td><td class="c">${p.animais}</td><td></td><td></td><td class="r">${brl0(p.vgv)}</td><td colspan="3"></td></tr></tfoot></table>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root { --preto:#0b0b0c; --grafite:#2a2a2e; --cinza:#6d6d74; --linha:#e3e3e6; --ouro:#C9A84C; }
  body { font-family:'Inter',sans-serif; color:var(--preto); font-size:11px; }
  .page { page-break-after:always; padding:44px 50px; min-height:1050px; position:relative; }
  .page:last-child { page-break-after:auto; }
  h1,h2,h3 { font-family:'Oswald',sans-serif; text-transform:uppercase; letter-spacing:.06em; }
  .capa { background:var(--preto); color:#fff; display:flex; flex-direction:column; justify-content:space-between; }
  .capa .marca { font-family:'Oswald'; font-size:15px; letter-spacing:.35em; color:#fff; }
  .capa .titulo { font-size:50px; line-height:1.05; font-weight:600; }
  .capa .sub { color:#9a9aa2; margin-top:14px; font-size:13px; letter-spacing:.05em; }
  .fio { width:64px; height:3px; background:var(--ouro); margin:26px 0; }
  .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:#26262b; border:1px solid #26262b; }
  .kpi { background:var(--preto); padding:20px 18px; }
  .kpi .v { font-family:'Oswald'; font-size:24px; font-weight:500; color:#fff; }
  .kpi .l { font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:#8b8b93; margin-top:6px; }
  .rodape-capa { display:flex; justify-content:space-between; color:#8b8b93; font-size:9.5px; letter-spacing:.08em; }
  h2 { font-size:19px; font-weight:600; margin-bottom:4px; }
  h3 { font-size:12.5px; font-weight:500; margin:20px 0 2px; }
  .sub2 { color:var(--cinza); font-size:10.5px; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  th { font-family:'Oswald'; font-size:9px; letter-spacing:.12em; text-transform:uppercase; text-align:left; color:#fff; background:var(--preto); padding:7px 8px; }
  td { padding:6px 8px; border-bottom:1px solid var(--linha); font-size:10px; }
  tr:nth-child(even) td { background:#f7f7f8; }
  .c { text-align:center; } .r { text-align:right; font-variant-numeric:tabular-nums; }
  tfoot td { font-weight:600; border-top:2px solid var(--preto); border-bottom:none; background:#fff !important; }
  .bloco { border:1px solid var(--linha); border-left:3px solid var(--ouro); padding:13px 15px; margin:10px 0; }
  .bloco b { font-size:11px; }
  .bloco p { color:var(--grafite); margin-top:4px; line-height:1.5; }
  .alerta { border-left-color:var(--preto); background:#f7f7f8; }
  .nota { color:var(--cinza); font-size:9.5px; line-height:1.55; margin-top:14px; }
  .pagfoot { position:absolute; bottom:24px; left:50px; right:50px; display:flex; justify-content:space-between; color:#a0a0a8; font-size:8.5px; letter-spacing:.1em; text-transform:uppercase; }
</style></head><body>

<div class="page capa">
  <div>
    <div class="marca">BULA — ASSESSORIA PECUÁRIA</div>
    <div style="margin-top:140px">
      <div class="fio"></div>
      <h1 class="titulo">Fechamento<br>Nelore Mafra<br>Agosto / 2026</h1>
      <div class="sub">EDIÇÃO REDENÇÃO/PA · CONFERÊNCIA NO HASTAPRÓ (FIL 2 — BULA ASSESSORIA)</div>
    </div>
  </div>
  <div>
    <div class="kpis">
      <div class="kpi"><div class="v">${brl0(tot.vgv)}</div><div class="l">VGV da cobertura Bula</div></div>
      <div class="kpi"><div class="v">2</div><div class="l">Pregões (01 e 02/08)</div></div>
      <div class="kpi"><div class="v">${tot.n}</div><div class="l">Lotes vendidos</div></div>
      <div class="kpi"><div class="v">${tot.animais}</div><div class="l">Animais</div></div>
    </div>
    <div style="height:20px"></div>
    <div class="rodape-capa"><span>EMITIDO EM 11/08/2026</span><span>FONTE PRIMÁRIA: HASTAPRÓ · CRUZADO COM O SISTEMA BULA</span></div>
  </div>
</div>

<div class="page">
  <h2>Resumo dos dois pregões</h2>
  <div class="sub2">Cobertura da assessoria (FIL 2). VGV = parcela × nº de parcelas × cabeças, exatamente como o HastaPró registra.</div>
  <table>
    <thead><tr><th style="width:58px" class="c">Data</th><th>Pregão</th><th style="width:44px" class="c">Lotes</th><th style="width:52px" class="c">Animais</th><th style="width:96px" class="r">VGV</th><th style="width:92px" class="r">Média/cabeça</th></tr></thead>
    <tbody>${pregoes.map(p => `<tr><td class="c">${p.data}</td><td>${p.curto} — Nelore Mafra</td><td class="c">${p.n}</td><td class="c">${p.animais}</td><td class="r">${brl0(p.vgv)}</td><td class="r">${brl0(p.vgv / p.animais)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td></td><td>TOTAL</td><td class="c">${tot.n}</td><td class="c">${tot.animais}</td><td class="r">${brl(tot.vgv)}</td><td class="r">${brl0(tot.vgv / tot.animais)}</td></tr></tfoot>
  </table>

  <h3>Venda por assessor × comissão lançada no HastaPró</h3>
  <div class="sub2">Atribuição pelo campo pisteiro do lote. Comissão devida a 2% do VGV; "lançado" = contas a pagar já abertas no HastaPró.</div>
  <table>
    <thead><tr><th>Assessor</th><th style="width:44px" class="c">Lotes</th><th style="width:52px" class="c">Animais</th><th style="width:96px" class="r">VGV</th><th style="width:82px" class="r">2% devido</th><th style="width:82px" class="r">Lançado</th><th style="width:78px" class="r">A lançar</th></tr></thead>
    <tbody>${assessores.map(a => `<tr><td>${a.nome}</td><td class="c">${a.lotes}</td><td class="c">${a.animais}</td><td class="r">${brl0(a.vgv)}</td><td class="r">${brl(a.devido)}</td><td class="r">${brl(a.cp)}</td><td class="r">${a.gap > 0.5 ? brl(a.gap) : '—'}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>TOTAL</td><td class="c">${tot.n}</td><td class="c">${tot.animais}</td><td class="r">${brl0(tot.vgv)}</td><td class="r">${brl(totDevido)}</td><td class="r">${brl(totCp)}</td><td class="r">${brl(totDevido - totCp)}</td></tr></tfoot>
  </table>

  <h3>Compradores</h3>
  <div class="sub2">Concentração da carteira dos dois pregões. Nenhuma compra consta como paga no HastaPró até 11/08.</div>
  <table>
    <thead><tr><th>Comprador</th><th style="width:30px" class="c">UF</th><th style="width:44px" class="c">Lotes</th><th style="width:52px" class="c">Animais</th><th style="width:96px" class="r">VGV</th><th style="width:64px" class="r">% do total</th></tr></thead>
    <tbody>${compradores.map(c => `<tr><td>${c.nome}</td><td class="c">${c.uf}</td><td class="c">${c.lotes}</td><td class="c">${c.animais}</td><td class="r">${brl0(c.vgv)}</td><td class="r">${(c.vgv / tot.vgv * 100).toFixed(1)}%</td></tr>`).join('')}</tbody>
  </table>
  <div class="pagfoot"><span>Bula Assessoria Pecuária</span><span>Fechamento Nelore Mafra Ago/2026 · pág. 2/5</span></div>
</div>

<div class="page">
  <h2>O que precisa de decisão</h2>
  <div class="sub2">Pendências identificadas no cruzamento HastaPró × sistema Bula × ERP</div>

  <div class="bloco alerta"><b>1 · O pregão de fêmeas (01/08) não existe no fechamento do sistema Bula</b>
    <p>O HastaPró registra <b>${pregoes[0].n} lotes · ${pregoes[0].animais} animais · ${brl0(pregoes[0].vgv)}</b> em 01/08. No sistema Bula não há nenhum fechamento nessa data — só o de touros (02/08). São <b>${brl0(pregoes[0].vgv)}</b> de cobertura fora do consolidado de agosto, o que hoje subavalia o mês inteiro.</p></div>

  <div class="bloco alerta"><b>2 · A receita da Bula no Mafra ainda não foi definida</b>
    <p>O único contas a receber ligado ao leilão é <b>"${cr[0]?.TIT_DESCRICAO ?? '—'}"</b> no valor simbólico de <b>${brl(cr[0]?.TIT_VALOR ?? 0)}</b>, vencimento ${cr[0]?.TIT_DT_VENCTO ?? '—'}, ainda ABERTO — é um marcador, não o valor real. O acordo registrado no cronograma é <b>"4% da venda a 1,5% do faturamento"</b>. Aplicando o mesmo critério do Mafra de abril (4% sobre a venda da Bula — ${brl0(19200)} sobre ${brl0(480000)}), a receita destes dois pregões seria <b>${brl0(receita4)}</b>. Se o acordo tiver caído para a faixa de 1,5% do faturamento total do leilão, é preciso o mapa de vendas da leiloeira para calcular — dado que não está no HastaPró.</p></div>

  <div class="bloco alerta"><b>3 · Faltam ${brl(totDevido - totCp)} de comissão de assessor lançados</b>
    <p>Comissão devida a 2%: <b>${brl(totDevido)}</b>. Lançado em contas a pagar do HastaPró: <b>${brl(totCp)}</b>. A diferença corresponde a lotes que ficaram de fora da base de cálculo — ${brl0(75600)} de venda do Douglas e ${brl0(93600)} do Fábio (incluindo o lote 1000 das fêmeas, de ${brl0(60000)}, e o lote 38 dos touros, de ${brl0(33600)}).</p></div>

  <div class="bloco alerta"><b>4 · Atribuição divergente no pregão de touros</b>
    <p>O fechamento do sistema Bula (origem: captura do grupo de lances) registra Fábio Omena com 4 lotes / ${brl0(99600)} e Douglas com 3 / ${brl0(78600)}. O HastaPró, pelo campo pisteiro, registra o inverso: Douglas com 5 lotes / ${brl0(123600)} e Fábio com 2 / ${brl0(54600)} — e a conta a pagar de ${brl0(1992)} (2% de ${brl0(99600)}) foi aberta em nome do <b>Douglas</b>. Os três registros discordam entre si; a comissão só deve ser paga depois de fechar quem atendeu cada lote.</p></div>

  <div class="bloco alerta"><b>5 · Nada do Mafra de agosto chegou ao ERP</b>
    <p>Não há contas a receber nem a pagar do Mafra de agosto no ERP da Bula — nem a comissão a receber da leiloeira, nem as comissões dos assessores, nem o imposto de 18%. O ERP está enxergando agosto sem este leilão.</p></div>

  <p class="nota"><b>Observação de data.</b> Os pregões estão cadastrados como 01/08 (fêmeas) e 02/08 (touros), mas os lotes foram lançados no HastaPró em 04/08 e 05/08 — lançamento retroativo, sem impacto no valor. <b>Recebimento.</b> Todos os ${tot.n} lotes estão com pagamento em aberto (COP_COMPAGO = N) e sem nota emitida.</p>
  <div class="pagfoot"><span>Bula Assessoria Pecuária</span><span>Fechamento Nelore Mafra Ago/2026 · pág. 3/5</span></div>
</div>

<div class="page">
  <h2>${pregoes[0].curto} — 01/08/2026</h2>
  <div class="sub2">${pregoes[0].n} lotes · ${pregoes[0].animais} animais · ${brl(pregoes[0].vgv)} — lote a lote, do maior para o menor</div>
  ${tabelaLotes(pregoes[0])}
  <p class="nota">Lote 1000 é lote avulso (1 cabeça, parcela de ${brl0(2000)} em 30x). O sistema Bula não tem fechamento para este pregão.</p>
  <div class="pagfoot"><span>Bula Assessoria Pecuária</span><span>Fechamento Nelore Mafra Ago/2026 · pág. 4/5</span></div>
</div>

<div class="page">
  <h2>${pregoes[1].curto} — 02/08/2026</h2>
  <div class="sub2">${pregoes[1].n} lotes · ${pregoes[1].animais} animais · ${brl(pregoes[1].vgv)} — lote a lote, do maior para o menor</div>
  ${tabelaLotes(pregoes[1])}
  <p class="nota">Fechamento correspondente no sistema Bula: ${fechTouros ? `${fechTouros.lotes_vendidos} lotes · ${fechTouros.animais_vendidos} animais · ${brl(fechTouros.vgv_total)} — <b>bate com o HastaPró no total</b>, diverge apenas na atribuição por assessor (item 4).` : 'não encontrado.'}</p>

  <h3>Títulos financeiros vinculados ao Mafra no HastaPró</h3>
  <table>
    <thead><tr><th style="width:52px" class="c">Tipo</th><th>Descrição</th><th style="width:118px">Favorecido</th><th style="width:82px" class="r">Valor</th><th style="width:62px" class="c">Vencto</th><th style="width:56px" class="c">Status</th></tr></thead>
    <tbody>${titulos.map(t => `<tr><td class="c">${t.TIT_TIPO === 'R' ? 'Receber' : 'Pagar'}</td><td>${canon(t.TIT_DESCRICAO)}</td><td>${t.FORNECEDOR ? nomeAssessor(t.FORNECEDOR) : 'Nelore Mafra'}</td><td class="r">${brl(t.TIT_VALOR)}</td><td class="c">${String(t.TIT_DT_VENCTO).slice(8, 10)}/${String(t.TIT_DT_VENCTO).slice(5, 7)}</td><td class="c">${t.TIT_STATUS}</td></tr>`).join('')}</tbody>
  </table>
  <p class="nota"><b>Metodologia.</b> Consulta somente leitura ao HastaPró (filial 2 = Bula Assessoria) em 11/08/2026, tabelas LEILAO, LOTES, COMPRADORES, CLIENTES, PRESTADORES e FIN_TITULOS. Cruzamento com bula_leilao_fechamento, bula_leiloes, cronograma_leiloes, erp_contas_receber e erp_contas_pagar do sistema Bula. Nenhum dado foi alterado em nenhuma das bases.</p>
  <div class="pagfoot"><span>Bula Assessoria Pecuária</span><span>Fechamento Nelore Mafra Ago/2026 · pág. 5/5</span></div>
</div>
</body></html>`

const outDir = join(root, 'outputs', 'fechamento-mafra-agosto-2026')
mkdirSync(outDir, { recursive: true })
const htmlPath = join(outDir, 'fechamento-mafra-agosto-2026.html')
writeFileSync(htmlPath, html, 'utf-8')
const pdfPath = 'C:/Users/Notebook-Acer/Desktop/Fechamento-Nelore-Mafra-Agosto-2026-Bula.pdf'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
await browser.close()

console.log('VGV total cobertura:', brl(tot.vgv), '| lotes', tot.n, '| animais', tot.animais)
console.log('Femeas 01/08 no sistema Bula:', fechFemeas ? 'existe' : 'AUSENTE')
console.log('Comissao 2% devida', brl(totDevido), '| lancada', brl(totCp), '| gap', brl(totDevido - totCp))
console.log('Maior comprador:', compradores[0].nome, brl(compradores[0].vgv), (compradores[0].vgv / tot.vgv * 100).toFixed(1) + '%')
console.log('PDF:', pdfPath)
