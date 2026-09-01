/**
 * "A RECEITA E AS DUAS FILIAIS" — por que a receita nao fecha em nenhuma das
 * tres bases, o que a separacao FIL 01 / FIL 2 do HastaPro nao resolve, e a
 * proposta para fechar.
 *
 * Le o Firebird do HastaPro (somente leitura) e os fechamentos do ERP. Nenhum
 * numero digitado a mao, fora os totais da planilha do financeiro (marcados).
 *
 * Uso: node scripts/gera-pdf-receita-filiais-proposta-2026.mjs
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

const fbOpts = {
    host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT || 3050), database: env.HASTAPRO_DATABASE,
    user: env.HASTAPRO_USER || 'SYSDBA', password: env.HASTAPRO_PASSWORD, encoding: 'NONE',
}
const dec = v => (Buffer.isBuffer(v) ? v.toString('latin1').trim() : (v instanceof Date ? v.toISOString().slice(0, 10) : v))
const db = await new Promise((res, rej) => Firebird.attach(fbOpts, (e, d) => (e ? rej(e) : res(d))))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => (e ? rej(e)
    : res((r || []).map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, dec(v)])))))))

const n = v => Number(v || 0)
const r2 = v => Math.round(n(v) * 100) / 100
const ATE = '2026-08-31'

const FILIAIS = await q('SELECT FIL_CODIGO,FIL_NOME,FIL_RAZAOSOCIAL,FIL_CNPJ FROM FILIAIS')
const PRE = Object.fromEntries((await q('SELECT PRE_CODIGO,PRE_NOME FROM PRESTADORES')).map(p => [p.PRE_CODIGO, p.PRE_NOME]))
const titulos = await q(`SELECT FIL_CODIGO,TIT_TIPO,COUNT(*) N,SUM(TIT_VALOR) V FROM FIN_TITULOS
    WHERE TIT_DT_VENCTO BETWEEN '2026-01-01' AND '${ATE}' GROUP BY FIL_CODIGO,TIT_TIPO`)
const lotes = await q(`SELECT FIL_CODIGO,LEI_CODIGO,LOT_LOTE,LOT_TOTAL,LOT_DATA_VENDA,LOT_PISTEIRO
    FROM LOTES WHERE LOT_DATA_VENDA BETWEEN '2026-01-01' AND '${ATE}'`)
const assess = await q('SELECT FIL_CODIGO,LEI_CODIGO,LOT_LOTE,PRE_CODIGO,COMISSAO,TIPO FROM ASSESSORIA')
const leiloes = await q(`SELECT FIL_CODIGO,COUNT(*) N FROM LEILAO WHERE LEI_DATA BETWEEN '2026-01-01' AND '${ATE}' GROUP BY FIL_CODIGO`)
db.detach()

const tit = (fil, tipo) => titulos.find(t => t.FIL_CODIGO === fil && t.TIT_TIPO === tipo) || { N: 0, V: 0 }
const AK = new Map()
for (const a of assess) AK.set([a.FIL_CODIGO, a.LEI_CODIGO, a.LOT_LOTE, a.TIPO].join('|'), a)
const assessorDe = l => PRE[AK.get([l.FIL_CODIGO, l.LEI_CODIGO, l.LOT_LOTE, 'VENDA'].join('|'))?.PRE_CODIGO] || PRE[l.LOT_PISTEIRO] || ''

/** A lista que hoje só existe num comentário de código (importa-fechamento-hastapro.mts). */
const PISTA_DA_REMATES = [/BULINHA|FELIPE VILELA|FELIPE ANDRADE/i, /PERALTA/i, /LUCAS MARTINS/i, /LAILA/i]

/* Quem é da equipe sai da FOLHA do ERP — a mesma fonte que o importador usa
   para reconhecer pisteiro. Regex solta poria "FABRICIO MANEJO" e "BRUNO PARÁ",
   que são pisteiros de outras assessorias, dentro da conta. */
const { data: folha } = await sb.from('erp_folha_estrutura').select('nome,apelidos,funcao,empresa')
const { data: fechAss } = await sb.from('bula_leilao_fechamento').select('por_assessor').gte('data', '2026-01-01')
const ch = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const PARTICULAS = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E'])
const partes = s => ch(s).split(' ').filter(w => w.length > 2 && !PARTICULAS.has(w))
/* A folha sozinha nao basta: a Valeria vendeu 2,8 mi e nao esta nela. Somamos
   quem o ERP ja reconhece como assessor nos fechamentos de 2026. */
const doErp = [...new Set((fechAss || []).flatMap(f => (f.por_assessor || []).map(a => a?.nome || a?.assessor || '')))]
const CONHECIDOS = [...(folha || []).flatMap(p => [p.nome, ...(Array.isArray(p.apelidos) ? p.apelidos : [])]), ...doErp]
    .filter(Boolean).map(partes).filter(a => a.length >= 2)
/* Apelidos de uma palavra so que sao inequivocos na pista. "PEDRO" e "LUANA"
   ficam de fora de proposito: casariam com "Pedro Pereira Junior", que e de
   outra assessoria. */
const APELIDO_UNICO = new Set(['BULINHA', 'PERALTA', 'LAILA', 'NANE', 'RUSA'])
const daEquipe = nome => {
    const a = partes(nome)
    if (!a.length) return false
    if (a.some(w => APELIDO_UNICO.has(w))) return true
    return CONHECIDOS.some(b => a.filter(w => b.includes(w)).length >= 2)
}

const vgvDe = ls => r2(ls.reduce((s, l) => s + n(l.LOT_TOTAL), 0))
const lotesFil2 = lotes.filter(l => l.FIL_CODIGO === '2')
const lotesFil01 = lotes.filter(l => l.FIL_CODIGO === '01')
const daEquipeNoFil01 = lotesFil01.filter(l => daEquipe(assessorDe(l)))
const naPista = daEquipeNoFil01.filter(l => PISTA_DA_REMATES.some(re => re.test(assessorDe(l))))
const cinzenta = daEquipeNoFil01.filter(l => !PISTA_DA_REMATES.some(re => re.test(assessorDe(l))))

const porPessoa = {}
for (const l of cinzenta) {
    /* "Fabio de Omena Gaia" com slice(0,2) vira "Fabio de" — pula as particulas. */
    const nome = assessorDe(l).split(' ').filter(w => !PARTICULAS.has(ch(w))).slice(0, 2).join(' ')
    ;(porPessoa[nome] ??= { v: 0, n: 0 })
    porPessoa[nome].v += n(l.LOT_TOTAL); porPessoa[nome].n++
}
const cinzaOrd = Object.entries(porPessoa).sort((a, b) => b[1].v - a[1].v)
const semAssessoria = lotesFil2.filter(l => !AK.get(['2', l.LEI_CODIGO, l.LOT_LOTE, 'VENDA'].join('|')))

/* ------------------------------------------------------------------ ERP   */
const { data: fech } = await sb.from('bula_leilao_fechamento')
    .select('data,nome,vgv_total,receita_bula,comissao_assessoria').gte('data', '2026-01-01').lte('data', ATE)
const RECEITA_ERP = r2(fech.reduce((s, f) => s + n(f.receita_bula), 0))
const VGV_ERP = r2(fech.reduce((s, f) => s + n(f.vgv_total), 0))
const semReceita = fech.filter(f => !n(f.receita_bula))
const mesesSemReceita = [...new Set(semReceita.map(f => String(f.data).slice(0, 7)))].sort()

/** Único número digitado: total da aba DRE da planilha do financeiro (01/09). */
const RECEITA_PLANILHA = 1562672.26
const RECEITA_HASTAPRO = r2(n(tit('2', 'R').V))

/* ------------------------------------------------------------------ PDF   */
const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', VERM = '#A33'
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = v => n(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = v => n(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const mi = v => (n(v) / 1e6).toFixed(1).replace('.', ',')
const pct = v => (v * 100).toFixed(1).replace('.', ',') + '%'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

const fonte = fs.readFileSync('scripts/gera-projecao-fechamento-agosto-2026.mjs', 'utf8')
const ini = fonte.indexOf('const CSS = `') + 'const CSS = `'.length
const CSS = fonte.slice(ini, fonte.indexOf('`', ini))
    .replace(/\$\{INK\}/g, INK).replace(/\$\{GRID\}/g, GRID).replace(/\$\{MUTED\}/g, MUTED)
    .replace(/\$\{GOLD\}/g, GOLD).replace(/\$\{VERM\}/g, VERM)
const foot = p => `<div class="pfoot"><span>Bula Assessoria · A receita e as duas filiais</span><span>${p}</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<title>A receita e as duas filiais</title><style>${CSS}</style></head><body>

<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>A receita<br>e as duas<br>filiais</h1>
  <div class="rule"></div>
  <div class="sub">A separação FIL 01 / FIL 2 não vai fazer a receita aparecer no HastaPro — porque
  <strong>o financeiro do HastaPro não é fonte de receita para ninguém</strong>: a filial ‘01’ tem
  ${tit('01', 'R').N} títulos de recebimento no ano inteiro, somando R$ ${brl(tit('01', 'R').V)}. A receita nasce
  no <strong>lote</strong>, e a filial pertence ao <strong>leilão</strong>. É esse descasamento que precisa ser resolvido.</div>
  <div class="meta">
    <div><span>Receita na planilha</span><strong>R$ ${brl0(RECEITA_PLANILHA)}</strong></div>
    <div><span>No ERP (fechamentos)</span><strong>R$ ${brl0(RECEITA_ERP)}</strong></div>
    <div><span>No HastaPro FIL 2</span><strong>R$ ${brl0(RECEITA_HASTAPRO)}</strong></div>
    <div><span>Zona cinzenta</span><strong>R$ ${mi(vgvDe(cinzenta))} mi de VGV</strong></div>
    <div><span>Apurado em</span><strong>01/09/2026</strong></div>
  </div>
</section>

<section class="page">
  <div class="head"><h2>O diagnóstico</h2><div class="n">01 · três bases, três respostas</div></div>

  <p class="lead">A mesma pergunta — “quanto a Bula Assessoria faturou de janeiro a agosto” — tem três respostas,
  e nenhuma das três está completa. A diferença não é erro de conta: é que <strong>cada base mede uma coisa
  diferente</strong>, e a que deveria arbitrar (a nota fiscal) não está em nenhuma delas.</p>

  <table>
    <tr><th>Base</th><th class="num">Receita jan–ago</th><th>O que ela realmente mede</th></tr>
    <tr><td><strong>Planilha do financeiro</strong> (aba DRE)</td><td class="num">R$ ${brl(RECEITA_PLANILHA)}</td>
      <td>Digitada a partir da aba Leilões, pelo mês do leilão. É a mais completa — e a única que cobre janeiro e fevereiro.</td></tr>
    <tr><td><strong>ERP</strong> (fechamentos)</td><td class="num">R$ ${brl(RECEITA_ERP)}</td>
      <td>VGV × acordo da leiloeira, por evento. Mas <strong>${semReceita.length} dos ${fech.length} fechamentos estão sem <code>receita_bula</code></strong> — ${mesesSemReceita.slice(0, 2).join(' e ')} inteiros zerados.</td></tr>
    <tr><td><strong>HastaPro</strong> (FIN_TITULOS, filial 2)</td><td class="num">R$ ${brl(RECEITA_HASTAPRO)}</td>
      <td>${tit('2', 'R').N} títulos lançados à mão. Abril inteiro zerado. Cobre ${pct(RECEITA_HASTAPRO / RECEITA_PLANILHA)} da planilha.</td></tr>
  </table>

  <div class="box dark">
    <div class="t">O fato que decide o resto</div>
    <p style="margin-bottom:0">O módulo financeiro do HastaPro <strong>não é usado para receita por nenhuma das duas
    empresas</strong>. Na filial ‘01’ (Bula Remates) há <strong>${tit('01', 'D').N} títulos de despesa</strong>
    (R$ ${brl0(tit('01', 'D').V)}) e <strong>${tit('01', 'R').N} de recebimento, somando R$ ${brl(tit('01', 'R').V)}</strong> no ano.
    Não é um problema da separação: é que a receita de leilão nasce do <em>lote</em> (valor × comissão), e ninguém
    a redigita como título. Pedir ao programador deles para “consertar a separação” não faz a receita aparecer.</p>
  </div>

  <table class="dense">
    <tr><th>Filial</th><th>Empresa</th><th class="num">Leilões</th><th class="num">Lotes vendidos</th><th class="num">VGV</th>
      <th class="num">Títulos de despesa</th><th class="num">Títulos de receita</th></tr>
    ${FILIAIS.filter(f => ['01', '2', '3'].includes(f.FIL_CODIGO)).map(f => `<tr>
      <td><strong>${esc(f.FIL_CODIGO)}</strong></td><td>${esc(f.FIL_NOME)}</td>
      <td class="num">${leiloes.find(l => l.FIL_CODIGO === f.FIL_CODIGO)?.N || 0}</td>
      <td class="num">${lotes.filter(l => l.FIL_CODIGO === f.FIL_CODIGO).length}</td>
      <td class="num">${brl0(vgvDe(lotes.filter(l => l.FIL_CODIGO === f.FIL_CODIGO)))}</td>
      <td class="num">${tit(f.FIL_CODIGO, 'D').N} · ${brl0(tit(f.FIL_CODIGO, 'D').V)}</td>
      <td class="num">${tit(f.FIL_CODIGO, 'R').N} · ${brl0(tit(f.FIL_CODIGO, 'R').V)}</td></tr>`).join('')}
  </table>
  <p class="small">Lotes com data de venda entre 01/01 e 31/08/2026. O VGV da filial ‘01’ é o giro da leiloeira inteira,
  não receita da Bula — a Assessoria fatura um percentual sobre a parte que ela cobre.</p>
  ${foot('Página 1 de 3')}
</section>

<section class="page">
  <div class="head"><h2>Por que a separação não fecha</h2><div class="n">02 · o erro é de projeto</div></div>

  <p class="lead">A separação que o programador deles fez é <strong>por leilão</strong>: o evento nasce na filial ‘01’
  ou na ‘2’. Só que <strong>a receita da Assessoria nasce no lote</strong> — a equipe vende dentro de leilões de
  terceiros e também dentro dos pregões da própria Remates. Não existe campo dizendo “este lote é cobertura da
  Assessoria”, então tudo o que a equipe vendeu num pregão da Remates fica do lado errado da linha.</p>

  <div class="placar">
    <div class="col"><div class="cap">O que está na filial ‘2’</div>
      <div class="lin big"><span>Lotes vendidos</span><strong>${lotesFil2.length}</strong></div>
      <div class="lin big"><span>VGV</span><strong>R$ ${mi(vgvDe(lotesFil2))} mi</strong></div>
      <div class="lin"><span>Sem linha em ASSESSORIA</span><strong>${semAssessoria.length} lotes · R$ ${brl0(vgvDe(semAssessoria))}</strong></div>
    </div>
    <div class="seta">→</div>
    <div class="col dep"><div class="cap">Vendido pela equipe dentro da ‘01’</div>
      <div class="lin big"><span>Lotes</span><strong>${daEquipeNoFil01.length}</strong></div>
      <div class="lin big"><span>VGV</span><strong>R$ ${mi(vgvDe(daEquipeNoFil01))} mi</strong></div>
      <div class="lin"><span>Pista da Remates</span><strong>R$ ${mi(vgvDe(naPista))} mi (${naPista.length} lotes)</strong></div>
      <div class="lin"><span><strong>Zona cinzenta</strong></span><strong>R$ ${mi(vgvDe(cinzenta))} mi (${cinzenta.length} lotes)</strong></div>
    </div>
  </div>

  <h3>A zona cinzenta, por quem vendeu</h3>
  <p>São lotes vendidos por gente da <strong>Assessoria</strong> dentro de pregões da <strong>Remates</strong> —
  fora da “pista da Remates” (Bulinha, Peralta, Lucas Martins e Laila, que vendem pela leiloeira). Hoje essa lista
  existe em <strong>um comentário de código</strong>, não em regra de negócio escrita nem em campo do sistema.</p>
  <table class="dense">
    <tr><th>Quem vendeu</th><th class="num">Lotes</th><th class="num">VGV na filial ‘01’</th>
      <th class="num">Receita a 1%</th><th class="num">a 2%</th></tr>
    ${cinzaOrd.map(([nome, d]) => `<tr><td>${esc(nome)}</td><td class="num">${d.n}</td>
      <td class="num">${brl0(d.v)}</td><td class="num">${brl0(d.v * 0.01)}</td><td class="num">${brl0(d.v * 0.02)}</td></tr>`).join('')}
    <tr class="total"><td>Total em disputa</td><td class="num">${cinzenta.length}</td><td class="num">${brl0(vgvDe(cinzenta))}</td>
      <td class="num">${brl0(vgvDe(cinzenta) * 0.01)}</td><td class="num">${brl0(vgvDe(cinzenta) * 0.02)}</td></tr>
  </table>
  <p class="small">As duas últimas colunas são só ordem de grandeza — o acordo real varia por leiloeira e por evento.
  Servem para dizer o tamanho da decisão: entre R$ ${brl0(vgvDe(cinzenta) * 0.01)} e R$ ${brl0(vgvDe(cinzenta) * 0.02)}
  de receita que hoje não está em lugar nenhum.</p>

  <div class="box gold">
    <div class="t">O que já funciona e ninguém usa</div>
    <p style="margin-bottom:0">A tabela <code>ASSESSORIA</code> do HastaPro já grava, <strong>por lote</strong>, quem
    assessorou e com que percentual (<code>PRE_CODIGO</code> + <code>COMISSAO</code> + <code>TIPO</code>). Ela cobre
    ${pct(1 - semAssessoria.length / lotesFil2.length)} dos lotes da filial ‘2’ — só ${semAssessoria.length} ficaram sem linha de VENDA.
    <strong>É nela que a cobertura deve ser lida</strong>, não na filial do leilão.</p>
  </div>
  ${foot('Página 2 de 3')}
</section>

<section class="page">
  <div class="head"><h2>A proposta</h2><div class="n">03 · quatro movimentos</div></div>

  <div class="op"><div class="l1"><span class="nm">1 · Decidir a zona cinzenta</span><span class="vl">R$ ${mi(vgvDe(cinzenta))} mi de VGV</span></div>
    <div class="l2">Decisão da diretoria, não técnica — e ela trava todo o resto.</div>
    <p style="margin-top:2mm">A venda da Valéria, do Leonardo, do Douglas e do Fábio <strong>dentro de um pregão da
    Bula Remates</strong> gera receita para a Assessoria ou fica com a leiloeira? Enquanto não houver resposta escrita,
    nenhuma DRE das duas empresas fecha, e a mesma venda pode ser contada duas vezes ou nenhuma. Precisa de uma linha:
    <em>“cobertura da Assessoria é o lote com assessor X, Y, Z, esteja o leilão na filial que estiver”</em>.</p></div>

  <div class="op"><div class="l1"><span class="nm">2 · Marcar a cobertura no LOTE</span><span class="vl">pedido ao fornecedor</span></div>
    <div class="l2">É o conserto de verdade da separação — e é barato para eles.</div>
    <p style="margin-top:2mm">O pedido ao programador do HastaPro não é “separar melhor as filiais”: é
    <strong>um campo no lote</strong> dizendo de quem é a cobertura (ou, mais simples, passar a gravar a filial do
    <em>prestador</em> na linha da tabela <code>ASSESSORIA</code>, que já existe). Com isso, um pregão da Remates pode
    ter lotes cobertos pela Assessoria sem precisar duplicar o evento — que é a origem das
    <strong>cascas vazias</strong> (leilões cadastrados duas vezes, um em cada filial, um deles sem lote nenhum).</p></div>

  <div class="op"><div class="l1"><span class="nm">3 · Fechar a receita onde ela nasce</span><span class="vl">${semReceita.length} fechamentos</span></div>
    <div class="l2">No nosso ERP, não no HastaPro.</div>
    <p style="margin-top:2mm">Receita = <strong>VGV coberto × acordo da leiloeira</strong>. O HastaPro entrega a base
    (lote a lote, das duas filiais); o acordo vive no ERP. Hoje ${semReceita.length} dos ${fech.length} fechamentos de 2026 estão
    sem <code>receita_bula</code> — por isso o ERP mostra R$ ${brl0(RECEITA_ERP)} contra R$ ${brl0(RECEITA_PLANILHA)} da planilha.
    Preencher esses ${semReceita.length} é o trabalho que transforma a planilha em sistema.</p></div>

  <div class="op"><div class="l1"><span class="nm">4 · Deixar a nota fiscal arbitrar</span><span class="vl">o critério</span></div>
    <div class="l2">Ordem de precedência, para parar de escolher fonte no caso a caso.</div>
    <table class="dense" style="margin-top:2mm">
      <tr><th class="num">#</th><th>Fonte</th><th>Vale para</th></tr>
      <tr><td class="num">1</td><td><strong>NFS-e emitida</strong> (Prefeitura de Campo Grande)</td><td>O que foi de fato faturado. É o que o fisco vê e o que o ISS confirma.</td></tr>
      <tr><td class="num">2</td><td><strong>Recebimento no extrato</strong></td><td>O que entrou. Fecha o caixa e prova a NF.</td></tr>
      <tr><td class="num">3</td><td><strong>Fechamento do ERP</strong> (VGV × acordo)</td><td>O que ainda não faturou — a receita a competir no mês do leilão.</td></tr>
      <tr><td class="num">4</td><td><strong>HastaPro FIN_TITULOS</strong></td><td>Só conferência. Nunca fonte primária de receita.</td></tr>
    </table>
    <p class="small" style="margin-top:1mm">Hoje só temos o Relatório de Nota Fiscal de agosto (9 NFS-e, R$ 96.335,08).
    Puxar o do ano inteiro na Prefeitura é uma tarde de trabalho e resolve janeiro e fevereiro, que são justamente
    os meses em que a planilha e o ERP mais divergem.</p></div>

  <div class="box rule">
    <div class="t">O que eu faço aqui, assim que a decisão 1 sair</div>
    <p style="margin-bottom:0">Um apurador que lê as <strong>duas filiais</strong>, monta a cobertura pela tabela
    <code>ASSESSORIA</code> (não pela filial do leilão), aplica o acordo de cada leiloeira e devolve receita por
    evento e por mês — com a conferência contra a NF e contra o extrato do lado. É o mesmo motor da DRE do HastaPro
    que já está rodando, com a base trocada do título para o lote.</p>
  </div>
  ${foot('Página 3 de 3')}
</section>
</body></html>`

fs.mkdirSync('outputs/receita-filiais-2026', { recursive: true })
fs.writeFileSync('outputs/receita-filiais-2026/proposta.html', html)
const pdfPath = path.join(os.homedir(), 'Desktop', 'Bula - A receita e as duas filiais (proposta).pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
const over = await page.evaluate(() => [...document.querySelectorAll('.page')].map((s, i) => (s.scrollHeight > s.clientHeight + 2 ? i + 1 : null)).filter(Boolean))
await browser.close()

console.log('FIL 01: D', tit('01', 'D').N, brl0(tit('01', 'D').V), '| R', tit('01', 'R').N, brl(tit('01', 'R').V))
console.log('FIL 2 : D', tit('2', 'D').N, brl0(tit('2', 'D').V), '| R', tit('2', 'R').N, brl(tit('2', 'R').V))
console.log('VGV FIL2', brl0(vgvDe(lotesFil2)), '| FIL01', brl0(vgvDe(lotesFil01)))
console.log('equipe na FIL01:', daEquipeNoFil01.length, 'lotes', brl0(vgvDe(daEquipeNoFil01)))
console.log('  pista da Remates:', naPista.length, brl0(vgvDe(naPista)), '| ZONA CINZENTA:', cinzenta.length, brl0(vgvDe(cinzenta)))
console.log('ERP: receita', brl0(RECEITA_ERP), '| sem receita_bula', semReceita.length, 'de', fech.length)
console.log('paginas estouradas:', over.length ? over : 'nenhuma')
console.log('PDF →', pdfPath)
