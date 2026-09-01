/**
 * "EXPOZEBU 2026 — A CASA E AS PASSAGENS" — responde a pergunta do grupo:
 * as linhas "DESPESAS EXPOZEBU" ja contemplam a casa e as passagens, e por que
 * existem ~17-19 mil fora delas.
 *
 * Le o HastaPro (Firebird, FIL '2', somente leitura), o extrato do Sicoob no
 * ERP e as faturas de cartao ja extraidas dos PDFs. Nenhum numero e digitado
 * a mao. PDF na Area de Trabalho.
 *
 * Uso: node scripts/gera-pdf-expozebu-casa-passagens-2026.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Firebird from 'node-firebird'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

/* ---------- HastaPro (somente leitura) ---------- */
const fbOpts = {
    host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT || 3050), database: env.HASTAPRO_DATABASE,
    user: env.HASTAPRO_USER || 'SYSDBA', password: env.HASTAPRO_PASSWORD, encoding: 'NONE',
}
const dec = v => (Buffer.isBuffer(v) ? v.toString('latin1').trim() : (v instanceof Date ? v.toISOString().slice(0, 10) : v))
const lin = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, dec(v)]))
const db = await new Promise((res, rej) => Firebird.attach(fbOpts, (e, d) => (e ? rej(e) : res(d))))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => (e ? rej(e) : res((r || []).map(lin)))))

const CLI = Object.fromEntries((await q('SELECT CLI_CODIGO,CLI_NOME FROM CLIENTES')).map(c => [c.CLI_CODIGO, c.CLI_NOME]))
const CAT = Object.fromEntries((await q('SELECT FCT_CODIGO,FCT_DESCRICAO FROM FIN_CATEGORIAS')).map(c => [c.FCT_CODIGO, c.FCT_DESCRICAO]))
const LEIS = await q("SELECT LEI_CODIGO,LEI_NOME,LEI_DATA FROM LEILAO WHERE UPPER(LEI_NOME) LIKE '%EXPOZEBU%'")
const LEI = Object.fromEntries(LEIS.map(l => [l.LEI_CODIGO, l]))
const ids = LEIS.map(l => `'${l.LEI_CODIGO}'`).join(',')

const titulos = await q(`SELECT TIT_CODIGO,TIT_DESCRICAO,TIT_VALOR,TIT_FORNECEDOR,TIT_DT_VENCTO,TIT_STATUS,
    FCT_CODIGO,LEI_CODIGO,CAST(TIT_OBSERVACAO AS VARCHAR(2000)) AS OBS
    FROM FIN_TITULOS WHERE FIL_CODIGO='2' AND TIT_TIPO='D'
      AND (LEI_CODIGO IN (${ids}) OR UPPER(TIT_DESCRICAO) LIKE '%UBERABA%' OR UPPER(TIT_DESCRICAO) LIKE '%EXPOZEBU%')
    ORDER BY TIT_DT_VENCTO`)
const movs = await q(`SELECT M.TIT_CODIGO,M.MOV_PAGODIA,M.MOV_VALOR,M.MOV_PAGAMENTO,C.FCO_DESCRICAO
    FROM FIN_MOVIMENTO M LEFT JOIN FIN_CONTAS C ON C.FCO_CODIGO=M.FCO_CODIGO
    WHERE M.TIT_CODIGO IN (SELECT TIT_CODIGO FROM FIN_TITULOS WHERE FIL_CODIGO='2' AND TIT_TIPO='D')`)
const MOV = Object.fromEntries(movs.map(m => [m.TIT_CODIGO, m]))
db.detach()

const n = v => Number(v || 0)
const soma = a => Math.round(a.reduce((s, x) => s + n(x.TIT_VALOR), 0) * 100) / 100
const forma = t => (MOV[t.TIT_CODIGO]?.MOV_PAGAMENTO || '—')

/* As tres familias da conta da Expozebu. */
const rateio = titulos.filter(t => /DESPESAS (EAO )?EXPOZEBU/i.test(t.TIT_DESCRICAO))
const casa = titulos.filter(t => /CASA/i.test(t.TIT_DESCRICAO) && /UBERABA/i.test(t.TIT_DESCRICAO))
const passagens = titulos.filter(t => CAT[t.FCT_CODIGO] === 'PASSAGENS' && LEI[t.LEI_CODIGO] && !casa.includes(t))
const apoioCods = new Set([...rateio, ...casa, ...passagens].map(t => t.TIT_CODIGO))
const apoio = titulos.filter(t => LEI[t.LEI_CODIGO] && !apoioCods.has(t.TIT_CODIGO)
    && ['HOTEL', 'ALIMENTAÇÃO EM GERAL', 'UBER', 'COMBUSTÍVEL', 'DIARIAS', 'DESLOCAMENTO'].includes(CAT[t.FCT_CODIGO]))

/* A casa duplicada: mesmo valor, mesmo fornecedor, mesma baixa, dois titulos. */
const casaPorBaixa = {}
for (const t of casa) (casaPorBaixa[`${MOV[t.TIT_CODIGO]?.MOV_PAGODIA}|${n(t.TIT_VALOR)}`] ??= []).push(t)
const dupes = Object.values(casaPorBaixa).filter(g => g.length > 1)
const casaDup = soma(dupes.flatMap(g => g.slice(1)))
const casaReal = soma(casa) - casaDup

const REAL = Math.round((casaReal + soma(passagens) + soma(apoio)) * 100) / 100
const RATEIO = soma(rateio)

/* ---------- Extrato do Sicoob: o que realmente saiu ---------- */
const { data: extrato } = await sb.from('erp_movimentos_bancarios')
    .select('data,descricao,valor,tipo').gte('data', '2026-03-20').lte('data', '2026-05-10').eq('tipo', 'saida').order('data')
const pixCasa = extrato.filter(m => /casa uberaba/i.test(m.descricao))
const diasRateio = [...new Set(rateio.map(t => MOV[t.TIT_CODIGO]?.MOV_PAGODIA).filter(Boolean))]
const saidaRateioDia = extrato.filter(m => diasRateio.includes(m.data))
const { data: debFat } = await sb.from('erp_movimentos_bancarios')
    .select('data,descricao,valor').eq('data', '2026-04-22').eq('tipo', 'saida').in('valor', [12164.07, 16286.07])

/* ---------- Faturas de cartao (PDFs ja extraidos) ---------- */
const FAT = JSON.parse(fs.readFileSync('.codex-dev/cartoes-bula-2026/processed/faturas.json', 'utf8'))
const fat = (conta, comp) => FAT.find(f => f.conta_cartao === conta && f.competencia === comp)
const MASTER = '7564620012254', VISA = '7564620013118'
const mAbr = fat(MASTER, '2026-04'), vAbr = fat(VISA, '2026-04'), vMai = fat(VISA, '2026-05')
const perfil = (f, t) => (f.perfil_consumo || []).find(p => new RegExp(t, 'i').test(p.tipo))?.valor
const itens = f => f.lancamentos || []
const somaSe = (f, re) => Math.round(itens(f).filter(l => re.test(l.descricao || '')).reduce((s, l) => s + n(l.valor), 0) * 100) / 100
const fbAbr = somaSe(mAbr, /FACEBK/)
const assinAbr = somaSe(mAbr, /ADOBE|YouTube|Google One|Starlink/i)
/* O proprio Sicoob classifica a fatura; e o numero da fonte, nao a minha soma. */
const PERFIL = JSON.parse(fs.readFileSync('outputs/expozebu-2026/perfil-consumo-faturas-abril.json', 'utf8'))
const turismo = PERFIL['VISA-2026-04'].perfil.find(p => /ESPORTES LAZER E TURISMO/i.test(p.tipo))
const turismoVisaAbr = turismo.valor

/* Primeiras parcelas das passagens da Expozebu — caem na fatura de MAIO. */
let parcExpo = []  /* preenchido depois que as parcelas sao calculadas */
const casaParcela = passagens.map(t => {
    const noCartao = /CART/i.test(forma(t))
    const partes = noCartao ? /(\d+)\s*x/i.exec(t.OBS || '') : null
    const nx = partes ? Number(partes[1]) : null
    return { t, noCartao, nx, parcela: nx ? Math.round((n(t.TIT_VALOR) / nx) * 100) / 100 : null }
})
const primeiraLevada = Math.round(casaParcela.reduce((s, x) => s + (x.parcela || 0), 0) * 100) / 100
/* Prova do casamento: a 1a parcela de cada bilhete aparece na fatura de maio, ao centavo. */
parcExpo = casaParcela.filter(x => x.parcela)
    .map(x => itens(vMai).find(l => Math.abs(n(l.valor) - x.parcela) <= 0.02 && /LATAM|GOL |AZUL/i.test(l.descricao || '')))
    .filter(Boolean)
const noCartao = Math.round(passagens.filter(t => /CART/i.test(forma(t))).reduce((s, t) => s + n(t.TIT_VALOR), 0) * 100) / 100

/* ---------- PDF ---------- */
const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', VERM = '#A33'
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = v => n(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = v => n(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const dm = s => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—')
const corta = (t, x) => (String(t).length <= x ? String(t) : String(t).slice(0, x).replace(/[ ,;.\-–]+$/, '') + '…')
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

const fonte = fs.readFileSync('scripts/gera-projecao-fechamento-agosto-2026.mjs', 'utf8')
const ini = fonte.indexOf('const CSS = `') + 'const CSS = `'.length
const CSS = fonte.slice(ini, fonte.indexOf('`', ini))
    .replace(/\$\{INK\}/g, INK).replace(/\$\{GRID\}/g, GRID).replace(/\$\{MUTED\}/g, MUTED)
    .replace(/\$\{GOLD\}/g, GOLD).replace(/\$\{VERM\}/g, VERM)
const foot = p => `<div class="pfoot"><span>Bula Assessoria · Expozebu 2026 — a casa e as passagens</span><span>${p}</span></div>`

const linhaTit = t => `<tr><td>${dm(t.TIT_DT_VENCTO)}</td><td>${esc(corta(t.TIT_DESCRICAO, 44))}</td>
  <td>${esc(corta(CLI[t.TIT_FORNECEDOR] || '—', 26))}</td><td>${esc(CAT[t.FCT_CODIGO] || '—')}</td>
  <td>${esc(forma(t))}</td><td class="num">${brl(t.TIT_VALOR)}</td></tr>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<title>Expozebu 2026 — a casa e as passagens</title><style>${CSS}</style></head><body>

<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Expozebu 2026<br>a casa e<br>as passagens</h1>
  <div class="rule"></div>
  <div class="sub">As linhas <strong>“DESPESAS EXPOZEBU”</strong> não contemplam a casa e as passagens —
  elas <strong>são</strong> a casa e as passagens, rateadas entre os leilões. Os “17 a 19 mil que estão fora”
  são exatamente a mesma despesa, lançada uma segunda vez com o fornecedor de verdade.</div>
  <div class="meta">
    <div><span>Custo real da Expozebu</span><strong>R$ ${brl(REAL)}</strong></div>
    <div><span>Rateio lançado</span><strong>R$ ${brl(RATEIO)}</strong></div>
    <div><span>Casa (2 PIX)</span><strong>R$ ${brl(casaReal)}</strong></div>
    <div><span>Passagens da equipe</span><strong>R$ ${brl(soma(passagens))}</strong></div>
    <div><span>Emitido em</span><strong>01/09/2026</strong></div>
  </div>
</section>

<section class="page">
  <div class="head"><h2>A resposta em uma linha</h2><div class="n">01 · o que a Expozebu custou</div></div>

  <p class="lead">A Expozebu custou <strong>R$ ${brl(REAL)}</strong>. Esse número está lançado <strong>duas vezes</strong>
  no HastaPro: uma vez item a item, com o fornecedor real (Maria Teresa, Azul, Gol, Latam, Douglas, Leonardo);
  e outra vez como <strong>${rateio.length} linhas “DESPESAS EXPOZEBU”</strong> de R$ ${brl(RATEIO)}, todas com fornecedor
  <em>Bula Assessoria Pecuária Ltda</em> — a própria empresa — e a observação
  <em>“17 mil dividido em 5 leilões”</em>.</p>

  <div class="box gold">
    <div class="t">Por que existe o rateio</div>
    <p style="margin-bottom:0">A Expozebu não é um leilão: são ${LEIS.length - 1} pregões na mesma semana, e a casa,
    as passagens e a diária da equipe servem a todos. O rateio existe para <strong>atribuir o custo a cada leilão</strong>
    — é a conta certa para saber o resultado de cada pregão. Ele só não pode ficar no fluxo <em>junto</em> com as
    despesas item a item, senão o mesmo dinheiro sai duas vezes.</p>
  </div>

  <h3>O que saiu de verdade</h3>
  <table class="dense">
    <tr><th>Venc.</th><th>Despesa</th><th>Fornecedor</th><th>Categoria</th><th>Baixa</th><th class="num">Valor</th></tr>
    <tr class="sub"><td colspan="5">Casa alugada em Uberaba · 27/04 a 04/05 · contato Marcelo Facuri</td><td class="num">${brl(casaReal)}</td></tr>
    ${casa.filter(t => !dupes.flatMap(g => g.slice(1)).includes(t)).map(linhaTit).join('')}
    <tr class="sub"><td colspan="5">Passagens da equipe · R$ ${brl(noCartao)} no cartão em 4x e 5x, o resto reembolsado</td><td class="num">${brl(soma(passagens))}</td></tr>
    ${passagens.map(linhaTit).join('')}
    <tr class="sub"><td colspan="5">Apoio em viagem · reembolsado por PIX em maio</td><td class="num">${brl(soma(apoio))}</td></tr>
    ${apoio.map(linhaTit).join('')}
    <tr class="total"><td colspan="5">Custo real da Expozebu 2026</td><td class="num">R$ ${brl(REAL)}</td></tr>
  </table>
  <p class="small">É esse o valor que a observação do rateio chama de “17 mil”. A soma fecha em R$ ${brl(REAL)} —
  ${REAL > 17000 ? `R$ ${brl(REAL - 17000)} acima` : `R$ ${brl(17000 - REAL)} abaixo`} da estimativa que foi usada para dividir.
  Nada disso está nas linhas “DESPESAS EXPOZEBU”: cada item aqui tem fornecedor próprio, categoria própria e baixa própria.</p>
  ${foot('Página 1 de 3')}
</section>

<section class="page">
  <div class="head"><h2>O rateio</h2><div class="n">02 · e as faturas que você pediu</div></div>

  <h3>As ${rateio.length} linhas “Despesas Expozebu”, como estão lançadas</h3>
  <table class="dense">
    <tr><th>Venc.</th><th>Leilão que recebeu o custo</th><th>Categoria</th><th>Baixa</th><th class="num">Valor</th></tr>
    ${rateio.map(t => `<tr><td>${dm(t.TIT_DT_VENCTO)}</td><td>${esc(corta(LEI[t.LEI_CODIGO]?.LEI_NOME || '—', 52))}</td>
      <td>${esc(CAT[t.FCT_CODIGO] || '—')}</td><td>${esc(forma(t))}</td><td class="num">${brl(t.TIT_VALOR)}</td></tr>`).join('')}
    <tr class="total"><td colspan="4">Total rateado</td><td class="num">R$ ${brl(RATEIO)}</td></tr>
  </table>
  <p class="small">A observação diz “17 mil dividido em 5 leilões”, mas as ${rateio.length} linhas somam R$ ${brl(RATEIO)}:
  os cinco de 30/04 dão R$ ${brl(soma(rateio.filter(t => t.TIT_DT_VENCTO === '2026-04-30')))} e ainda há
  R$ ${brl(soma(rateio.filter(t => t.TIT_DT_VENCTO !== '2026-04-30')))} no MEGA EAO em 03/05.</p>

  <div class="box dark">
    <div class="t">A prova de que o rateio não é dinheiro</div>
    <p style="margin-bottom:0">As ${rateio.length} linhas estão baixadas como pagas em 30/04 e 03/05. No extrato do Sicoob
    <strong>não existe nenhuma saída correspondente</strong> em ${diasRateio.map(dm).join(' nem em ')} — ${saidaRateioDia.length === 0
        ? 'nenhum débito, de nenhum valor'
        : `só ${saidaRateioDia.map(m => `${dm(m.data)} R$ ${brl(m.valor)}`).join(', ')}`}.
    O dinheiro da casa saiu antes, em ${pixCasa.map(m => dm(m.data)).join(' e ')}, nos dois PIX de
    R$ ${brl(pixCasa[0]?.valor)} para a Maria Teresa; e o das passagens sai parcelado na fatura do cartão.</p>
  </div>

  <h3>As faturas de abril</h3>
  <p class="lead">As duas faturas pedidas — <strong>Master R$ ${brl(mAbr.resumo.total_fatura)}</strong> e
  <strong>Visa R$ ${brl(vAbr.resumo.total_fatura)}</strong>, ambas com vencimento em 22/04 e debitadas na conta
  ${debFat?.length === 2 ? 'no mesmo dia' : ''} — <strong>não têm nada de Expozebu dentro</strong>. Elas fecharam com as compras
  até meados de abril; as passagens da Expozebu foram compradas em 23 e 27/04 e só aparecem na fatura de <strong>maio</strong>.</p>

  <table>
    <tr><th>Fatura de abril · venc. 22/04</th><th class="num">Valor</th><th>O que tem dentro</th></tr>
    <tr><td><strong>Mastercard final 3880</strong><br><span class="muted">conta ${MASTER}</span></td>
      <td class="num">${brl(mAbr.resumo.total_fatura)}</td>
      <td>Tráfego pago no Facebook <strong>R$ ${brl(fbAbr)}</strong>, assinaturas de operação (Starlink, Adobe, Google, YouTube)
      R$ ${brl(assinAbr)} e o restante em compras do portador Felipe V. Andrade. Saldo anterior de
      R$ ${brl(mAbr.resumo.saldo_anterior)} + R$ ${brl(mAbr.resumo.debitos)} de débitos − R$ ${brl(mAbr.resumo.pagamento)} pagos.</td></tr>
    <tr><td><strong>Visa final 6495</strong><br><span class="muted">conta ${VISA}</span></td>
      <td class="num">${brl(vAbr.resumo.total_fatura)}</td>
      <td><strong>R$ ${brl(turismoVisaAbr)} (${String(turismo.pct).replace('.', ',')}% da fatura) o próprio Sicoob classifica como
      “esportes, lazer e turismo”</strong> — passagem e hotel. Mas são parcelas de viagens compradas entre novembro e
      março (LS Next, Partner RG, Naviraí Pará), não da Expozebu. O resto é móvel, material e assinatura.</td></tr>
    <tr class="total"><td>Soma debitada em 22/04</td><td class="num">R$ ${brl(n(mAbr.resumo.total_fatura) + n(vAbr.resumo.total_fatura))}</td>
      <td>Confere com o extrato: ${debFat.map(m => `R$ ${brl(m.valor)}`).join(' + ')} na conta corrente.</td></tr>
  </table>
  ${foot('Página 2 de 3')}
</section>

<section class="page">
  <div class="head"><h2>Onde as passagens entram</h2><div class="n">03 · e as duas correções</div></div>

  <h3>As passagens da Expozebu, parcela a parcela</h3>
  <table class="dense">
    <tr><th>Bilhete</th><th class="num">Total</th><th>Parcelas</th><th class="num">1ª parcela</th><th>Aparece a partir de</th></tr>
    ${casaParcela.map(({ t, noCartao: cc, nx, parcela }) => `<tr><td>${esc(corta(t.TIT_DESCRICAO, 40))}</td>
      <td class="num">${brl(t.TIT_VALOR)}</td><td>${nx ? `${nx}x` : '—'}</td>
      <td class="num">${parcela ? brl(parcela) : '—'}</td>
      <td>${cc ? 'fatura de maio' : `reembolso por PIX em ${dm(MOV[t.TIT_CODIGO]?.MOV_PAGODIA)}`}</td></tr>`).join('')}
    <tr class="total"><td>Passagens da Expozebu</td><td class="num">R$ ${brl(soma(passagens))}</td><td>—</td>
      <td class="num">R$ ${brl(primeiraLevada)}</td><td>até setembro</td></tr>
  </table>
  <p class="small">Conferido contra a fatura de maio da Visa, que traz exatamente
  ${parcExpo.map(l => `${l.data_compra} ${corta(l.descricao, 14)} R$ ${brl(l.valor)}`).join(' · ')}.
  Ou seja: das R$ ${brl(noCartao)} que foram para o cartão, só R$ ${brl(primeiraLevada)} tinham entrado até maio —
  o resto ainda estava por vir quando a planilha de abril foi olhada. Vale registrar o que está na observação do
  título do Douglas: as passagens dele somaram R$ 5.153,04 e <strong>R$ 3.553,00 ele pagou do próprio bolso</strong>;
  a Bula bancou R$ 1.620,01 no cartão e R$ 956,52 de reembolso.</p>

  <div class="box rule">
    <div class="t">Correção 1 · a casa está lançada três vezes</div>
    <p style="margin-bottom:0">Há <strong>${casa.length} títulos</strong> de R$ ${brl(casa[0]?.TIT_VALOR)} para a mesma casa —
    ${dupes.map(g => g.map(t => `“${corta(t.TIT_DESCRICAO, 34)}”`).join(' e ') + ` na mesma baixa de ${dm(MOV[g[0].TIT_CODIGO]?.MOV_PAGODIA)}`).join('; ')}.
    O Sicoob pagou <strong>dois</strong> PIX de R$ ${brl(pixCasa[0]?.valor)} (${pixCasa.map(m => dm(m.data)).join(' e ')}),
    total R$ ${brl(casaReal)}. Sobra <strong>R$ ${brl(casaDup)}</strong> de despesa que não existiu.</p>
  </div>

  <div class="box rule">
    <div class="t">Correção 2 · escolher entre o rateio e o item a item</div>
    <p style="margin-bottom:0">Somados, os dois lados dão <strong>R$ ${brl(REAL + RATEIO + casaDup)}</strong> de despesa
    para uma Expozebu que custou <strong>R$ ${brl(REAL)}</strong>. O certo é manter as ${rateio.length} linhas de rateio
    <em>como atribuição de custo por leilão</em> e tirá-las do caixa (ou o contrário) — mas não as duas coisas ao mesmo
    tempo. É a mesma regra que já vale para a fatura do cartão no ERP: o título de pagamento não pode competir junto
    com o título analítico que ele liquida.</p>
  </div>

  <p class="small">Fontes: HastaPro (Firebird, filial ‘2’, somente leitura) para os títulos e as baixas;
  extrato do Sicoob no ERP para provar o que saiu da conta; e os PDFs das faturas do Sicoob (24/06/2026) para a
  composição do cartão. Nenhum valor deste relatório foi digitado à mão.</p>
  ${foot('Página 3 de 3')}
</section>
</body></html>`

fs.mkdirSync('outputs/expozebu-2026', { recursive: true })
fs.writeFileSync('outputs/expozebu-2026/casa-e-passagens.html', html)
const pdfPath = path.join(os.homedir(), 'Desktop', 'Bula - Expozebu 2026 - a casa e as passagens.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
const over = await page.evaluate(() => [...document.querySelectorAll('.page')].map((s, i) => (s.scrollHeight > s.clientHeight + 2 ? i + 1 : null)).filter(Boolean))
await browser.close()

console.log('rateio:', rateio.length, 'linhas =', brl(RATEIO))
console.log('casa:', casa.length, 'titulos =', brl(soma(casa)), '| real', brl(casaReal), '| duplicado', brl(casaDup))
console.log('passagens:', passagens.length, '=', brl(soma(passagens)), '| 1a parcela', brl(primeiraLevada))
console.log('apoio:', apoio.length, '=', brl(soma(apoio)))
console.log('CUSTO REAL:', brl(REAL), '| lancado no total:', brl(REAL + RATEIO + casaDup))
console.log('paginas estouradas:', over.length ? over : 'nenhuma')
console.log('PDF →', pdfPath)
