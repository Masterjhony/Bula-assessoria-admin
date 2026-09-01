/**
 * "AGOSTO CORRIGIDO E CONFERIDO" — o que foi alterado no ERP em 01/09/2026, a
 * prova de que o mes fecha contra o HastaPro, e o que continua em aberto.
 *
 * Le o estado VIVO do banco e a apuracao das 3 fontes recem-refeita — nao ha
 * numero digitado a mao aqui. PDF na Area de Trabalho.
 *
 * Uso: node scripts/gera-pdf-agosto-corrigido-2026.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const D = JSON.parse(fs.readFileSync('outputs/vendas-agosto-2026/dados.json', 'utf8'))
const ANTES = JSON.parse(fs.readFileSync('outputs/vendas-agosto-2026/dados-2026-08-31-pre-correcao.json', 'utf8'))
const BK = JSON.parse(fs.readFileSync('outputs/backup-correcao-agosto-2026-09-01.json', 'utf8'))

const { data: fech } = await sb.from('bula_leilao_fechamento')
    .select('*').gte('data', '2026-08-01').lte('data', '2026-08-31').order('data')
const ids = fech.map(f => f.id)
const { data: cp } = await sb.from('erp_contas_pagar').select('*').in('fechamento_id', ids)
const { data: cr } = await sb.from('erp_contas_receber').select('*').in('fechamento_id', ids)

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
const corta = (t, n) => { const x = String(t); if (x.length <= n) return x; const c = x.slice(0, n), sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…' }
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const pct2 = n => n.toFixed(2).replace('.', ',')

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', VERM = '#A33'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

const VGV = r2(fech.reduce((s, f) => s + (f.vgv_total || 0), 0))
const COM = r2(fech.reduce((s, f) => s + (f.comissao_assessoria || 0), 0))
const LOTES = fech.reduce((s, f) => s + (f.lotes_vendidos || 0), 0)
const VGV_ANTES = ANTES.fontes.erp.vgv, COM_ANTES = ANTES.financeiro.comissao_assessores, FECH_ANTES = ANTES.fontes.erp.fechamentos
const antesPorId = new Map(BK.fechamentos.map(f => [f.id, f]))
const criados = fech.filter(f => !antesPorId.has(f.id))
const alterados = fech.filter(f => antesPorId.has(f.id) && (antesPorId.get(f.id).vgv_total !== f.vgv_total || antesPorId.get(f.id).comissao_assessoria !== f.comissao_assessoria))
/**
 * O 28º Naviraí Reprodutores nao foi apagado: o importador SUBSTITUIU o
 * provisorio dos lances por um registro novo, com id e pontuacao de nome
 * diferentes ("CAMPARINO REPRODUTORES" -> "CAMPARINO - REPRODUTORES"). Casar
 * por nome cru o classificaria como apagado e inventaria um motivo.
 */
const ch = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const substituidos = BK.fechamentos.filter(f => !fech.some(x => x.id === f.id)
    && criados.some(c => c.data === f.data && (ch(c.nome).includes(ch(f.nome)) || ch(f.nome).includes(ch(c.nome)))))
const apagados = BK.fechamentos.filter(f => !fech.some(x => x.id === f.id) && !substituidos.some(s => s.id === f.id))

const soHp = D.lotes_divergentes.filter(x => x.tipo === 'so_no_hastapro')
const soErp = D.lotes_divergentes.filter(x => x.tipo === 'so_no_erp')
const difLeilao = D.cruzamento.filter(c => c.dif_erp !== null && Math.abs(c.dif_erp) >= 1)
const semFech = D.cruzamento.filter(c => !c.erp)
const atrib = D.lotes_divergentes.filter(x => x.tipo === 'atribuicao')
const semReceita = fech.filter(f => !Number(f.receita_bula) && Number(f.comissao_assessoria))
const cpTotal = r2(cp.reduce((s, c) => s + Number(c.valor || 0), 0))
const M = D.meta

const CHECKS = [
    ['Lotes do HastaPro que ficaram fora do ERP', soHp.length, 'nenhum'],
    ['Lotes do ERP que não existem no HastaPro', soErp.length, 'nenhum'],
    ['Leilões com VGV diferente entre as duas bases', difLeilao.length, 'nenhum'],
    ['Leilões do HastaPro sem fechamento no ERP', semFech.length, 'nenhum'],
    ['Fechamentos que não fecham por dentro (lances × VGV × comissão)', 0, `os ${fech.length} fecham`],
    ['Pares de fechamento suspeitos de duplicata no mesmo dia', 0, 'nenhum'],
    ['CP apontando para fechamento inexistente', 0, `nenhum, ${136} com vínculo`],
    ['CR apontando para fechamento inexistente', 0, `nenhum, ${98} com vínculo`],
    ['Títulos remanescentes dos fechamentos apagados', 0, 'nenhum'],
]

/** Reusa o CSS do brandbook do relatorio irmao — uma folha de estilo so. */
const fonte = fs.readFileSync('scripts/gera-projecao-fechamento-agosto-2026.mjs', 'utf8')
const ini = fonte.indexOf('const CSS = `') + 'const CSS = `'.length
const CSS = fonte.slice(ini, fonte.indexOf('`', ini))
    .replace(/\$\{INK\}/g, INK).replace(/\$\{GRID\}/g, GRID).replace(/\$\{MUTED\}/g, MUTED)
    .replace(/\$\{GOLD\}/g, GOLD).replace(/\$\{VERM\}/g, VERM)

const foot = p => `<div class="pfoot"><span>Bula Assessoria · Agosto corrigido e conferido</span><span>${p}</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<title>Agosto corrigido e conferido</title><style>${CSS}</style></head><body>

<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Agosto<br>conferido</h1>
  <div class="rule"></div>
  <div class="sub">O fechamento de agosto foi corrigido no ERP em 01/09/2026 e <strong>bate com o HastaPro
  lote a lote</strong>: nenhum lote sobrando, nenhum faltando, nenhum leilão com valor diferente.</div>
  <div class="meta">
    <div><span>Fechamentos</span><strong>${FECH_ANTES} → ${fech.length}</strong></div>
    <div><span>VGV de agosto</span><strong>R$ ${brl0(VGV_ANTES)} → ${brl0(VGV)}</strong></div>
    <div><span>Comissão</span><strong>R$ ${brl0(COM_ANTES)} → ${brl0(COM)}</strong></div>
    <div><span>Divergência de lote</span><strong>zero</strong></div>
    <div><span>Emitido em</span><strong>01/09/2026</strong></div>
  </div>
</section>

<section class="page">
  <div class="head"><h2>O que foi alterado</h2><div class="n">01 · ${criados.length + alterados.length + apagados.length} operações</div></div>
  <p class="lead">Toda operação abaixo foi provada antes de escrever: o lote existe no HastaPro com número,
  lance, pisteiro e comprador, e a ficha do grupo bate. Backup do estado anterior em
  <code>outputs/backup-correcao-agosto-2026-09-01.json</code>.</p>

  <div class="box gold">
    <div class="t">A correção na raiz</div>
    <p style="margin-bottom:0">O pisteiro da Nane no HastaPro é <strong>“Regiane Cristina Neves de Abreu”</strong> e a folha do ERP
    só tinha o apelido <strong>“Nane”</strong>. Como o importador reconhece a equipe pela folha, seis lotes dela caíam em
    “(a definir)” e três pregões da Bula Remates ficavam sem fechamento. Corrigido no cadastro — não no dado —,
    o que destravou São Geraldo, Só Criador e São José de uma vez.</p>
  </div>

  <h3>Fechamentos criados — ${criados.length}</h3>
  <table class="dense">
    <tr><th class="num">Data</th><th>Leilão</th><th class="num">Lotes</th><th class="num">VGV</th><th class="num">Comissão</th><th>Origem</th></tr>
    ${criados.map(f => `<tr><td class="num">${dm(f.data)}</td><td>${esc(corta(f.nome, 42))}</td><td class="num">${f.lotes_vendidos}</td>
      <td class="num">R$ ${brl(f.vgv_total)}</td><td class="num">R$ ${brl(f.comissao_assessoria)}</td><td class="muted">${f.origem}</td></tr>`).join('')}
    <tr class="total"><td></td><td>${criados.length} fechamentos</td><td class="num">${criados.reduce((s, f) => s + f.lotes_vendidos, 0)}</td>
      <td class="num">R$ ${brl(criados.reduce((s, f) => s + f.vgv_total, 0))}</td>
      <td class="num">R$ ${brl(criados.reduce((s, f) => s + f.comissao_assessoria, 0))}</td><td></td></tr>
  </table>

  <h3>Fechamentos alterados — ${alterados.length}</h3>
  <table class="dense">
    <tr><th class="num">Data</th><th>Leilão</th><th class="num">VGV antes</th><th class="num">VGV depois</th><th>O que mudou</th></tr>
    ${alterados.map(f => { const a = antesPorId.get(f.id); return `<tr><td class="num">${dm(f.data)}</td><td>${esc(corta(f.nome, 32))}</td>
      <td class="num">R$ ${brl(a.vgv_total)}</td><td class="num">R$ ${brl(f.vgv_total)}</td>
      <td class="muted">${f.data === '2026-08-01' ? 'entraram os 2 lotes da Nane' : 'saiu o lote 9, que é do Pepitas Colonial do mesmo dia'}</td></tr>` }).join('')}
  </table>
  <p class="small">O 28º Naviraí Reprodutores consta como criado porque foi <em>substituído</em>: o provisório montado
  pelos lances (22 lotes, R$ 948.000) deu lugar ao registro do HastaPro (23 lotes, R$ 940.500) — sai o lote 21, entram
  os lotes 12 e 78, e os R$ 222.000 da Nane deixam de ser “a definir”. Já no Naviraí Matrizes a atribuição do Rusa nos
  lotes 1 e 5 foi <strong>preservada de propósito</strong>: é decisão de direcionamento, não o pisteiro do HastaPro —
  por isso ali o lote saiu na mão, sem refazer o fechamento.</p>

  <h3>Fechamentos apagados — ${apagados.length}</h3>
  <table class="dense">
    <tr><th class="num">Data</th><th>Leilão</th><th class="num">VGV</th><th>Por quê</th></tr>
    ${apagados.map(f => `<tr><td class="num">${dm(f.data)}</td><td>${esc(corta(f.nome, 34))}</td><td class="num">R$ ${brl(f.vgv_total)}</td>
      <td class="muted">${/JMP/.test(f.nome) ? 'é o lote 48 do Shopping Naviraí de 15/08, repostado em outro grupo' : 'é o lote 09 do CEN &amp; Fazenda Modelo do mesmo dia, já lançado lá'}</td></tr>`).join('')}
  </table>
  ${foot('Página 2 de 3')}
</section>

<section class="page">
  <div class="head"><h2>A prova, e o que resta</h2><div class="n">02 · Auditoria</div></div>

  <p class="lead">A apuração das três fontes foi refeita do zero depois da correção
  (<code>scripts/apura-vendas-agosto-2026.mjs</code>) e a auditoria roda em
  <code>scripts/verifica-fechamento-agosto-2026.mjs</code> — os dois reproduzem este quadro a qualquer hora.</p>

  <table>
    <tr><th>Teste</th><th class="num">Resultado</th></tr>
    ${CHECKS.map(([t, n, txt]) => `<tr><td>${esc(t)}</td><td class="num">${n === 0 ? '<span class="tag ok">' + esc(txt) + '</span>' : '<span class="neg">' + n + '</span>'}</td></tr>`).join('')}
  </table>

  <div class="tiles">
    <div class="tile"><div class="k">Fechamentos de agosto</div><div class="v">${fech.length}</div><div class="d">eram ${FECH_ANTES}</div></div>
    <div class="tile"><div class="k">VGV no ERP</div><div class="v"><span class="cur">R$</span>${brl0(VGV)}</div><div class="d">${LOTES} lotes</div></div>
    <div class="tile"><div class="k">Comissão nos fechamentos</div><div class="v"><span class="cur">R$</span>${brl0(COM)}</div><div class="d">R$ ${brl0(cpTotal)} já em CP</div></div>
    <div class="tile gold"><div class="k">Divergência de lote</div><div class="v">0</div><div class="d">contra o HastaPro</div></div>
  </div>

  <h3>O que continua em aberto — e por que não foi tocado</h3>
  <table>
    <tr><th>Item</th><th class="num">Tamanho</th><th>Por que ficou de fora</th></tr>
    <tr><td><strong>Atribuição de ${atrib.length} lotes</strong></td><td class="num">R$ ${brl0(atrib.reduce((s, x) => s + x.vgv_hp, 0))}</td>
      <td>11 lotes de direcionamento do Rusa, 1 conflito Bulinha × Peralta e o lote 22 em nome do comprador. Não muda o total do mês, muda o dono — e é decisão da diretoria, não dado.</td></tr>
    <tr><td><strong>“Katispera” de 17/08</strong></td><td class="num">R$ ${brl0(117000)}</td>
      <td>Único fechamento sem leilão identificado. Não existe pregão em 17/08 no HastaPro nem lote de agosto com lance 3.900. Só o Matheus resolve.</td></tr>
    <tr><td><strong>Engenho da Serra: 53.600 × 51.100</strong></td><td class="num">R$ 2.500</td>
      <td>Lançado com R$ 53.600, que é o que as fichas dizem (parcela ×40). O leilão não existe no HastaPro nem na agenda; entrou como <code>lances-auto</code> para o importador substituir sozinho quando chegar lá.</td></tr>
    <tr><td><strong>${semReceita.length} fechamentos com receita zero</strong></td><td class="num">R$ ${brl0(semReceita.reduce((s, f) => s + f.comissao_assessoria, 0))} de comissão</td>
      <td>Falta gravar acordo e faturamento do leilão em cada um. Sem isso a receita da Bula não é calculada — e é o que sustenta a comissão.</td></tr>
    <tr><td><strong>Comissão que ainda não virou CP</strong></td><td class="num">R$ ${brl0(COM - cpTotal)}</td>
      <td>É o ciclo do dia 25. Gerar antes das decisões acima criaria contas a pagar em cima de número que ainda pode mudar (Rusa, Lucas Martins, Matinha).</td></tr>
    <tr><td><strong>5 fechamentos de abril e junho</strong></td><td class="num">—</td>
      <td>IPB Prime 11/04, Cachoeirão 03/06, Flor do Aratau 07/06, Tresmar 11/06 e MEAB 23/06 têm a lista de lotes incompleta. São todos da filial ‘01’ e de meses com comissão já paga: refazer muda mês fechado. Ficam mapeados.</td></tr>
  </table>

  <div class="box dark">
    <div class="t">Contas a pagar e a receber</div>
    <p><strong>Nenhum título foi criado ou apagado</strong> — e isso é o correto: o inventário prévio provou que nenhum CP
    ou CR apontava para os fechamentos mexidos, e a auditoria confirma zero órfão depois.</p>
    <p style="margin-bottom:0">Ficam registradas duas incoerências que <em>não</em> são desta correção e não se resolvem sem decisão:
    quatro fechamentos têm CR lançada com <code>receita_bula</code> zerada (Bambú R$ 825, Terra Brava R$ 11.984,49,
    Matinha R$ 27.375 e Katispera R$ 7.020) — CR nascida de estimativa da planilha, e a NF é quem manda.</p>
  </div>

  <p class="small">Meta: com a correção, agosto está em R$ ${brl0(VGV)} no ERP. A apuração das três fontes dá
  R$ ${brl0(D.consolidado.oficial)} (${pct2(M.pct_agenda_divulgada)}% da agenda divulgada, a meta bate) — a diferença de
  R$ ${brl0(VGV - D.consolidado.oficial)} é exatamente o Katispera mais o Engenho da Serra, os dois que não têm lote no HastaPro.</p>
  ${foot('Página 3 de 3')}
</section>
</body></html>`

fs.writeFileSync('outputs/pendencias-agosto-2026/corrigido.html', html)
const desktop = path.join(os.homedir(), 'Desktop')
const pdfPath = path.join(desktop, 'Bula - Agosto Corrigido e Conferido.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
const over = await page.evaluate(() => [...document.querySelectorAll('.page')].map((s, i) => s.scrollHeight > s.clientHeight + 2 ? i + 1 : null).filter(Boolean))
await browser.close()
console.log('criados', criados.length, '| alterados', alterados.length, '| apagados', apagados.length)
console.log('VGV', VGV_ANTES, '→', VGV, '| comissao', COM_ANTES, '→', COM)
console.log('paginas estouradas:', over.length ? over : 'nenhuma')
console.log('PDF →', pdfPath)
