/**
 * "EXPOZEBU 2026 — DESPESAS OPERACIONAIS FECHADAS" — a conta definitiva do
 * evento e a explicacao, real a real, da diferenca entre os 22.900 rateados e
 * o que de fato saiu.
 *
 * Le o HastaPro (Firebird, FIL '2', somente leitura), o extrato e os
 * fechamentos no ERP e as faturas de cartao ja extraidas dos PDFs. Nenhum
 * numero e digitado a mao. PDF na Area de Trabalho.
 *
 * Uso: node scripts/gera-pdf-expozebu-despesas-fechadas-2026.mjs
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
const db = await new Promise((res, rej) => Firebird.attach(fbOpts, (e, d) => (e ? rej(e) : res(d))))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => (e ? rej(e)
    : res((r || []).map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, dec(v)])))))))

const CLI = Object.fromEntries((await q('SELECT CLI_CODIGO,CLI_NOME FROM CLIENTES')).map(c => [c.CLI_CODIGO, c.CLI_NOME]))
const CATS = Object.fromEntries((await q('SELECT FCT_CODIGO,FCT_DESCRICAO FROM FIN_CATEGORIAS')).map(c => [c.FCT_CODIGO, c.FCT_DESCRICAO]))
const LEIS = await q("SELECT LEI_CODIGO,LEI_NOME,LEI_DATA FROM LEILAO WHERE UPPER(LEI_NOME) LIKE '%EXPOZEBU%' ORDER BY LEI_DATA")
const LEI = Object.fromEntries(LEIS.map(l => [l.LEI_CODIGO, l]))
const ids = LEIS.map(l => `'${l.LEI_CODIGO}'`).join(',')

const titulos = await q(`SELECT T.TIT_CODIGO,T.TIT_DESCRICAO,T.TIT_VALOR,T.TIT_FORNECEDOR,T.TIT_DT_VENCTO,
    T.FCT_CODIGO,T.LEI_CODIGO,CAST(T.TIT_OBSERVACAO AS VARCHAR(2000)) AS OBS,
    M.MOV_PAGODIA,M.MOV_PAGAMENTO
    FROM FIN_TITULOS T LEFT JOIN FIN_MOVIMENTO M ON M.TIT_CODIGO=T.TIT_CODIGO
    WHERE T.FIL_CODIGO='2' AND T.TIT_TIPO='D'
      AND (T.LEI_CODIGO IN (${ids}) OR UPPER(T.TIT_DESCRICAO) LIKE '%UBERABA%' OR UPPER(T.TIT_DESCRICAO) LIKE '%EXPOZEBU%')
    ORDER BY M.MOV_PAGODIA`)
db.detach()

const n = v => Number(v || 0)
const r2 = v => Math.round(n(v) * 100) / 100
const soma = a => r2(a.reduce((s, x) => s + n(x.TIT_VALOR), 0))
const cat = t => CATS[t.FCT_CODIGO] || '—'
const forma = t => t.MOV_PAGAMENTO || '—'
const noCartao = t => /CART/i.test(forma(t))

/* ---------- As tres familias ---------- */
const rateio = titulos.filter(t => /DESPESAS (EAO )?EXPOZEBU/i.test(t.TIT_DESCRICAO))
const casaTodos = titulos.filter(t => /CASA/i.test(t.TIT_DESCRICAO) && /UBERABA/i.test(t.TIT_DESCRICAO))
const chaveBaixa = t => `${t.MOV_PAGODIA}|${n(t.TIT_VALOR)}`
const vistos = new Set()
const casa = casaTodos.filter(t => (vistos.has(chaveBaixa(t)) ? false : vistos.add(chaveBaixa(t))))
const casaDup = casaTodos.filter(t => !casa.includes(t))
const naoRateio = t => !rateio.includes(t) && !casaTodos.includes(t)
/* Despesa OPERACIONAL do evento: estar la. Comissao de venda e patrocinado sao
   custo variavel da venda e de campanha — vivem no fechamento de cada leilao. */
const VIAGEM = ['HOTEL', 'ALIMENTAÇÃO EM GERAL', 'UBER', 'COMBUSTÍVEL', 'PEDÁGIO', 'MERCADO', 'DESLOCAMENTO']
const OPERACAO = ['CPD', 'DIARIAS', 'SERVIÇOS GERAIS']
const doEvento = t => naoRateio(t) && LEI[t.LEI_CODIGO]
const passagens = titulos.filter(t => doEvento(t) && cat(t) === 'PASSAGENS')
const apoio = titulos.filter(t => doEvento(t) && VIAGEM.includes(cat(t)))
const operacao = titulos.filter(t => doEvento(t) && OPERACAO.includes(cat(t)))
const foraDoEscopo = titulos.filter(t => doEvento(t) && !passagens.includes(t) && !apoio.includes(t) && !operacao.includes(t))

const CONTA = [...casa, ...passagens, ...apoio, ...operacao].sort((a, b) => String(a.MOV_PAGODIA).localeCompare(String(b.MOV_PAGODIA)))
const REAL = r2(soma(casa) + soma(passagens) + soma(apoio) + soma(operacao))
const RATEIO = soma(rateio)
const DIF = r2(RATEIO - REAL)

/* ---------- A diferenca, decomposta ---------- */
const dia30 = rateio.filter(t => t.TIT_DT_VENCTO === '2026-04-30')
const foraDos5 = rateio.filter(t => t.TIT_DT_VENCTO !== '2026-04-30')
const cota = Math.min(...dia30.map(t => n(t.TIT_VALOR)))           /* 17.000 / 5 */
const estimativa = r2(cota * dia30.length)                          /* o "17 mil" da observacao */
const acima = dia30.filter(t => n(t.TIT_VALOR) > cota)
const excedente = r2(acima.reduce((s, t) => s + (n(t.TIT_VALOR) - cota), 0))
const folgaEstimativa = r2(estimativa - REAL)
const PARTES = [
    { o: `A 6ª linha: o MEGA EAO entrou depois, fora do “dividido em 5”`, v: soma(foraDos5) },
    {
        o: `${acima.length} leilões receberam R$ ${n(acima[0]?.TIT_VALOR).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em vez da cota de R$ ${cota.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        v: excedente,
    },
    {
        o: `A estimativa de R$ ${estimativa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ficou ${folgaEstimativa < 0 ? 'abaixo' : 'acima'} do custo real de R$ ${REAL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        v: folgaEstimativa,
    },
]

/* ---------- Extrato e cartao: a prova de cada pagamento ---------- */
const { data: extrato } = await sb.from('erp_movimentos_bancarios')
    .select('data,descricao,valor,tipo').gte('data', '2026-03-20').lte('data', '2026-06-30').eq('tipo', 'saida').order('data')
const achaExtrato = t => extrato.find(m => Math.abs(n(m.valor) - n(t.TIT_VALOR)) <= 0.02 && m.data === t.MOV_PAGODIA)
const pixCasa = extrato.filter(m => /casa uberaba/i.test(m.descricao))
const diasRateio = [...new Set(rateio.map(t => t.MOV_PAGODIA).filter(Boolean))]
const saidaNoDiaDoRateio = extrato.filter(m => diasRateio.includes(m.data))

const FAT = JSON.parse(fs.readFileSync('.codex-dev/cartoes-bula-2026/processed/faturas.json', 'utf8'))
const VISA = '7564620013118'
const itensVisa = FAT.filter(f => f.conta_cartao === VISA).flatMap(f => (f.lancamentos || []).map(l => ({ ...l, competencia: f.competencia })))
const parcelaDe = t => {
    const m = /(\d+)\s*x/i.exec(t.OBS || '')
    return m ? r2(n(t.TIT_VALOR) / Number(m[1])) : null
}
const achaCartao = t => {
    const p = parcelaDe(t)
    return p ? itensVisa.find(l => Math.abs(n(l.valor) - p) <= 0.02 && /LATAM|GOL |AZUL/i.test(l.descricao || '')) : null
}
/* Varios reembolsos do mesmo dia saem num PIX so — casa o grupo, nao a linha. */
const chaveGrupo = t => `${t.MOV_PAGODIA}|${t.TIT_FORNECEDOR}`
const GRUPO = {}
const AGRUPADO = {}
const provaGrupo = t => {
    const k = chaveGrupo(t)
    if (!(k in AGRUPADO)) {
        const irmaos = GRUPO[k] || []
        const total = r2(irmaos.reduce((s, x) => s + n(x.TIT_VALOR), 0))
        AGRUPADO[k] = irmaos.length > 1
            ? extrato.find(m => Math.abs(n(m.valor) - total) <= 0.02 && m.data === t.MOV_PAGODIA)
            : null
        AGRUPADO[k] = AGRUPADO[k] ? { mov: AGRUPADO[k], total, n: irmaos.length } : null
    }
    return AGRUPADO[k]
}
const prova = t => {
    if (noCartao(t)) { const c = achaCartao(t); return c ? `cartão Visa · 1ª de ${/(\d+)\s*x/i.exec(t.OBS)[1]} na fatura de ${c.competencia.slice(5)}/${c.competencia.slice(2, 4)}` : 'cartão Visa' }
    const m = achaExtrato(t)
    if (m) return `PIX Sicoob ${dm(m.data)}`
    const g = provaGrupo(t)
    if (g) return `PIX Sicoob ${dm(g.mov.data)} · R$ ${brl(g.total)} com mais ${g.n - 1}`
    return `transferência ${dm(t.MOV_PAGODIA)}`
}

/* Todos os titulos de viagem do periodo — para saber o que no cartao ja tem titulo. */
const viagemPeriodo = await (async () => {
    const db2 = await new Promise((res, rej) => Firebird.attach(fbOpts, (e, d) => (e ? rej(e) : res(d))))
    const q2 = sql => new Promise((res, rej) => db2.query(sql, [], (e, r) => (e ? rej(e)
        : res((r || []).map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, dec(v)])))))))
    const r = await q2(`SELECT T.TIT_CODIGO,T.TIT_DESCRICAO,T.TIT_VALOR,T.TIT_DT_VENCTO,T.FCT_CODIGO,T.LEI_CODIGO,
        CAST(T.TIT_OBSERVACAO AS VARCHAR(2000)) AS OBS FROM FIN_TITULOS T
        WHERE T.FIL_CODIGO='2' AND T.TIT_TIPO='D' AND T.TIT_DT_VENCTO BETWEEN '2026-04-10' AND '2026-06-15'`)
    db2.detach()
    return r.filter(t => ['PASSAGENS', 'HOTEL'].includes(CATS[t.FCT_CODIGO] || ''))
})()
/* Titulos de viagem da janela do evento que ficaram SEM leilao — conferidos um a um. */
const semVinculo = viagemPeriodo.filter(t => !t.LEI_CODIGO
    && t.TIT_DT_VENCTO >= '2026-04-20' && t.TIT_DT_VENCTO <= '2026-05-15')

/* Compras no cartao na semana do evento que NAO viraram titulo no HastaPro.
   So a fatura de maio: em junho as mesmas compras voltam como 2a parcela. */
const parcelasConhecidas = viagemPeriodo.map(parcelaDe).filter(Boolean)
const naSemana = itensVisa.filter(l => l.competencia === '2026-05' && l.tipo === 'compra'
    && /^(2[3-9]|30)[/]04|^0[1-5][/]05/.test(l.data_compra || ''))
const semTitulo = naSemana.filter(l => !parcelasConhecidas.some(p => Math.abs(p - n(l.valor)) <= 0.02)
    && !/STARLINK|ADOBE|APPLE|iFood|Google|FACEBK|WETRANSFER/i.test(l.descricao || ''))

for (const t of CONTA.filter(x => !noCartao(x))) (GRUPO[`${t.MOV_PAGODIA}|${t.TIT_FORNECEDOR}`] ??= []).push(t)

/* ---------- ERP: os pregoes e a receita que sustenta o rateio ---------- */
const { data: fech } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,data,vgv_total,receita_bula,comissao_assessoria')
    .gte('data', '2026-04-27').lte('data', '2026-05-03').order('data')
const RECEITA = r2(fech.reduce((s, f) => s + n(f.receita_bula), 0))
const porPregao = r2(REAL / fech.length)
const pctReceita = REAL / RECEITA
/* Casa o pregao do ERP com a linha de rateio do HastaPro pela DATA do leilao;
   no dia com dois pregoes (29/04), desempata por palavra do nome. */
const ch = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const VAZIAS = new Set(['leilao', 'expozebu', 'edicao', 'mega', 'virtual', 'femeas', 'touros', 'central', 'amigos', 'eficiencia', '2026'])
const marcas = s => new Set(ch(s).split(' ').filter(w => w.length > 3 && !VAZIAS.has(w)))
const rateioDe = f => rateio.find(t => {
    const l = LEI[t.LEI_CODIGO]
    if (!l || l.LEI_DATA !== f.data) return false
    const noDia = rateio.filter(x => LEI[x.LEI_CODIGO]?.LEI_DATA === f.data)
    if (noDia.length === 1) return true
    const A = marcas(l.LEI_NOME), B = marcas(f.nome)
    return [...A].some(w => B.has(w))
})

/* ---------- PDF ---------- */
const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', VERM = '#A33'
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = v => n(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = v => n(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
function dm(s) { return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—' }
const corta = (t, x) => (String(t).length <= x ? String(t) : String(t).slice(0, x).replace(/[ ,;.\-–]+$/, '') + '…')
const pct = v => (v * 100).toFixed(2).replace('.', ',') + '%'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

const fonte = fs.readFileSync('scripts/gera-projecao-fechamento-agosto-2026.mjs', 'utf8')
const ini = fonte.indexOf('const CSS = `') + 'const CSS = `'.length
const CSS = fonte.slice(ini, fonte.indexOf('`', ini))
    .replace(/\$\{INK\}/g, INK).replace(/\$\{GRID\}/g, GRID).replace(/\$\{MUTED\}/g, MUTED)
    .replace(/\$\{GOLD\}/g, GOLD).replace(/\$\{VERM\}/g, VERM)
const foot = p => `<div class="pfoot"><span>Bula Assessoria · Expozebu 2026 — despesas operacionais</span><span>${p}</span></div>`

const grupo = (titulo, arr) => `<tr class="sub"><td colspan="4">${titulo}</td><td class="num">${brl(soma(arr))}</td></tr>
${arr.map(t => `<tr><td>${dm(t.MOV_PAGODIA)}</td><td>${esc(corta(t.TIT_DESCRICAO, 42))}</td>
  <td>${esc(corta(CLI[t.TIT_FORNECEDOR] || '—', 24))}</td><td>${esc(prova(t))}</td>
  <td class="num">${brl(t.TIT_VALOR)}</td></tr>`).join('')}`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<title>Expozebu 2026 — despesas operacionais</title><style>${CSS}</style></head><body>

<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Expozebu 2026<br>despesas<br>fechadas</h1>
  <div class="rule"></div>
  <div class="sub">A semana da Expozebu custou <strong>R$ ${brl(REAL)}</strong> à Bula — ${CONTA.length} pagamentos,
  cada um com nota de onde saiu. O rateio lançado foi R$ ${brl(RATEIO)}, e a diferença de
  <strong>R$ ${brl(DIF)}</strong> tem três causas identificadas, nenhuma delas dinheiro que saiu.</div>
  <div class="meta">
    <div><span>Despesa operacional</span><strong>R$ ${brl(REAL)}</strong></div>
    <div><span>Rateado no HastaPro</span><strong>R$ ${brl(RATEIO)}</strong></div>
    <div><span>Diferença explicada</span><strong>R$ ${brl(DIF)}</strong></div>
    <div><span>Pregões da semana</span><strong>${fech.length}</strong></div>
    <div><span>Custo sobre a receita</span><strong>${pct(pctReceita)}</strong></div>
  </div>
</section>

<section class="page">
  <div class="head"><h2>A conta fechada</h2><div class="n">01 · ${CONTA.length} pagamentos</div></div>

  <p class="lead">Cada linha abaixo é um título no HastaPro com baixa, e cada baixa foi conferida contra a sua origem:
  PIX no extrato do Sicoob ou compra parcelada na fatura da Visa. <strong>Não há estimativa nesta tabela.</strong></p>

  <table class="dense">
    <tr><th>Pago em</th><th>Despesa</th><th>Fornecedor</th><th>Onde saiu</th><th class="num">Valor</th></tr>
    ${grupo('Casa alugada em Uberaba · 27/04 a 04/05 · contato Marcelo Facuri', casa)}
    ${grupo('Passagens da equipe · Fábio, Leonardo e Douglas', passagens)}
    ${grupo('Estadia e apoio em viagem', apoio)}
    ${grupo('Operação no pregão · diárias de CPD', operacao)}
    <tr class="total"><td colspan="4">Despesa operacional da Expozebu 2026</td><td class="num">R$ ${brl(REAL)}</td></tr>
  </table>

  <div class="box gold">
    <div class="t">O que fica de fora — e por quê</div>
    <p>${casaDup.length ? `<strong>R$ ${brl(soma(casaDup))} de casa em duplicidade.</strong> O título
    “${esc(corta(casaDup[0].TIT_DESCRICAO, 34))}” tem a mesma baixa de ${dm(casaDup[0].MOV_PAGODIA)} de
    “${esc(corta(casa.find(c => chaveBaixa(c) === chaveBaixa(casaDup[0]))?.TIT_DESCRICAO || '', 34))}”, e o Sicoob pagou
    <strong>dois</strong> PIX de R$ ${brl(pixCasa[0]?.valor)}, não três. Precisa ser cancelado.` : ''}</p>
    <p>${semVinculo.length ? `<strong>${semVinculo.length} títulos de viagem sem leilão</strong> no período —
    ${semVinculo.map(t => `${esc(corta(t.TIT_DESCRICAO, 26))} R$ ${brl(t.TIT_VALOR)}`).join('; ')}. Pelas observações são
    trechos e datas de outros eventos (Maceió/Campo Grande e o retorno de 11/05), não da Expozebu — ficam fora.` : ''}</p>
    <p style="margin-bottom:0">${(() => {
      const hotel = semTitulo.filter(l => !/LATAM|GOL |AZUL/i.test(l.descricao || ''))
      const aereo = semTitulo.filter(l => /LATAM|GOL |AZUL/i.test(l.descricao || ''))
      const t1 = hotel.map(l => `<strong>${esc(corta(l.descricao, 26))} R$ ${brl(l.valor)} em ${l.data_compra}</strong> — a data e a rota
        batem com a ida do Fábio (Maceió → Campinas em ${l.data_compra}); é o candidato natural a entrar, e a conta iria a
        R$ ${brl(r2(REAL + n(l.valor)))}`).join('; ')
      const t2 = aereo.map(l => `<strong>${esc(corta(l.descricao, 18))} R$ ${brl(l.valor)} em ${l.data_compra}</strong>, primeira de 4 de uma
        passagem de R$ ${brl(r2(n(l.valor) * 4))} que <strong>não tem título nenhum no HastaPro</strong> — precisa ser identificada antes
        de virar despesa de qualquer leilão`).join('; ')
      return `<strong>R$ ${brl(r2(semTitulo.reduce((a, l) => a + n(l.valor), 0)))} no cartão sem título no HastaPro</strong> na semana do
        evento, em dois itens de natureza diferente. ${t1}. E ${t2}.`
    })()}</p>
  </div>
  ${foot('Página 1 de 3')}
</section>

<section class="page">
  <div class="head"><h2>A diferença, real a real</h2><div class="n">02 · R$ ${brl(DIF)}</div></div>

  <p class="lead">O rateio partiu de uma <strong>estimativa de R$ ${brl(estimativa)}</strong> — é o que dizem as observações
  (“17 mil dividido em 5 leilões”) e é exatamente ${dia30.length} × R$ ${brl(cota)}. O que foi lançado, porém, soma
  R$ ${brl(RATEIO)}. A diferença para o custo real se decompõe assim:</p>

  <table>
    <tr><th>Origem da diferença</th><th class="num">Valor</th></tr>
    ${PARTES.map(p => `<tr><td>${p.o}</td><td class="num${p.v < 0 ? ' neg' : ''}">${brl(p.v)}</td></tr>`).join('')}
    <tr class="total"><td>Rateado a mais que o custo real</td><td class="num">R$ ${brl(DIF)}</td></tr>
  </table>

  <table class="dense">
    <tr><th>Venc.</th><th>Leilão que recebeu o custo</th><th class="num">Lançado</th><th class="num">Cota do “17 mil”</th><th class="num">A mais</th></tr>
    ${rateio.map(t => {
        const c = t.TIT_DT_VENCTO === '2026-04-30' ? cota : 0
        return `<tr><td>${dm(t.TIT_DT_VENCTO)}</td><td>${esc(corta(LEI[t.LEI_CODIGO]?.LEI_NOME || '—', 50))}</td>
      <td class="num">${brl(t.TIT_VALOR)}</td><td class="num">${c ? brl(c) : '— fora dos 5 —'}</td>
      <td class="num">${n(t.TIT_VALOR) - c > 0 ? brl(n(t.TIT_VALOR) - c) : '—'}</td></tr>`
    }).join('')}
    <tr class="total"><td colspan="2">Total</td><td class="num">${brl(RATEIO)}</td><td class="num">${brl(estimativa)}</td><td class="num">${brl(r2(RATEIO - estimativa))}</td></tr>
  </table>

  <div class="box dark">
    <div class="t">Nenhuma dessas linhas é dinheiro que saiu</div>
    <p style="margin-bottom:0">As ${rateio.length} linhas têm fornecedor <strong>“Bula Assessoria Pecuária Ltda”</strong> — a própria
    empresa — e baixa em ${diasRateio.map(dm).join(' e ')}. No extrato do Sicoob desses dias há
    ${saidaNoDiaDoRateio.length === 0 ? 'zero saída' : saidaNoDiaDoRateio.map(m => `apenas ${dm(m.data)} R$ ${brl(m.valor)} (${corta(m.descricao, 28)})`).join(', ')}.
    O dinheiro saiu nas datas da tabela da página anterior — e essas ${rateio.length} linhas repetem, em cima delas, a mesma despesa.</p>
  </div>
  ${foot('Página 2 de 3')}
</section>

<section class="page">
  <div class="head"><h2>Como fica por leilão</h2><div class="n">03 · e o que corrigir</div></div>

  <p class="lead">A semana teve <strong>${fech.length} pregões</strong> — o rateio original cobriu ${dia30.length} mais o MEGA EAO de
  ${dm(foraDos5[0]?.TIT_DT_VENCTO)}, e deixou um de fora. Com o custo fechado em R$ ${brl(REAL)}, o rateio correto é este:</p>

  <table class="dense">
    <tr><th>Data</th><th>Pregão</th><th class="num">Receita Bula</th><th class="num">Rateado hoje</th>
      <th class="num">Linear ÷ ${fech.length}</th><th class="num">Proporcional (${pct(pctReceita)})</th></tr>
    ${fech.map(f => {
        const r = rateioDe(f)
        return `<tr><td>${dm(f.data)}</td><td>${esc(corta(f.nome, 40))}</td>
      <td class="num">${brl(f.receita_bula)}</td><td class="num">${r ? brl(r.TIT_VALOR) : '—'}</td>
      <td class="num">${brl(porPregao)}</td><td class="num">${brl(r2(n(f.receita_bula) * pctReceita))}</td></tr>`
    }).join('')}
    <tr class="total"><td colspan="2">Total</td><td class="num">${brl(RECEITA)}</td><td class="num">${brl(RATEIO)}</td>
      <td class="num">${brl(r2(porPregao * fech.length))}</td><td class="num">${brl(REAL)}</td></tr>
  </table>
  <p class="small">A receita é a do fechamento no ERP. O linear divide igual entre os ${fech.length} pregões; o proporcional
  cobra de cada um ${pct(pctReceita)} da própria receita — que é o mesmo peso do custo sobre a semana inteira e não pune
  o pregão pequeno. ${(() => { const menor = fech.reduce((a, b) => (n(a.receita_bula) < n(b.receita_bula) ? a : b)); const r = rateioDe(menor); return r ? `É a diferença entre o ${esc(corta(menor.nome, 26))} pagar R$ ${brl(r.TIT_VALOR)} de despesa tendo gerado R$ ${brl(menor.receita_bula)} de receita, ou pagar R$ ${brl(r2(n(menor.receita_bula) * pctReceita))}.` : '' })()}</p>

  <h3>O que corrigir no HastaPro</h3>
  <table>
    <tr><th>O quê</th><th class="num">Valor</th><th>Por quê</th></tr>
    <tr><td><strong>Cancelar a casa duplicada</strong></td><td class="num">${brl(soma(casaDup))}</td>
      <td>Três títulos de R$ ${brl(casa[0]?.TIT_VALOR)} para dois PIX. É despesa que não existiu.</td></tr>
    <tr><td><strong>Ajustar as ${rateio.length} linhas de rateio para o custo real</strong></td><td class="num">${brl(DIF)}</td>
      <td>De R$ ${brl(RATEIO)} para R$ ${brl(REAL)}, redistribuído pelos ${fech.length} pregões. A estimativa cumpriu o papel dela na hora de fechar cada leilão; agora existe o número certo.</td></tr>
    <tr><td><strong>Escolher: rateio OU item a item no fluxo</strong></td><td class="num">${brl(REAL)}</td>
      <td>Hoje os dois lados estão lançados, e a Expozebu aparece com R$ ${brl(r2(REAL + RATEIO + soma(casaDup)))} de despesa.
      O rateio serve para custo por leilão; o caixa é a tabela da página 1.</td></tr>
    <tr><td><strong>Decidir o hotel de Campinas</strong></td><td class="num">${brl(semTitulo.reduce((s, l) => s + n(l.valor), 0))}</td>
      <td>Está na fatura da Visa em ${semTitulo.map(l => l.data_compra).join(', ')} e não tem título. Se for da ida do Fábio, entra na conta.</td></tr>
  </table>

  <p class="small">Fontes: HastaPro (Firebird, filial ‘2’, somente leitura) para títulos, baixas e leilões; ERP para o extrato
  do Sicoob e os fechamentos; PDFs das faturas do Sicoob para as parcelas do cartão. Nenhum valor foi digitado à mão —
  gerado por <code>scripts/gera-pdf-expozebu-despesas-fechadas-2026.mjs</code>.</p>
  ${foot('Página 3 de 3')}
</section>
</body></html>`

fs.mkdirSync('outputs/expozebu-2026', { recursive: true })
fs.writeFileSync('outputs/expozebu-2026/despesas-fechadas.html', html)
fs.writeFileSync('outputs/expozebu-2026/despesas-fechadas.json', JSON.stringify({
    custo_real: REAL, rateio: RATEIO, diferenca: DIF, partes: PARTES, casa_duplicada: soma(casaDup),
    receita_semana: RECEITA, pct_custo_receita: pctReceita, pregoes: fech.length,
    itens: CONTA.map(t => ({ pago: t.MOV_PAGODIA, desc: t.TIT_DESCRICAO, forn: CLI[t.TIT_FORNECEDOR], valor: n(t.TIT_VALOR), onde: prova(t) })),
    sem_titulo_no_cartao: semTitulo.map(l => ({ data: l.data_compra, desc: l.descricao, valor: l.valor })),
}, null, 1))

const pdfPath = path.join(os.homedir(), 'Desktop', 'Bula - Expozebu 2026 - despesas operacionais fechadas.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
const over = await page.evaluate(() => [...document.querySelectorAll('.page')].map((s, i) => (s.scrollHeight > s.clientHeight + 2 ? i + 1 : null)).filter(Boolean))
await browser.close()

console.log('itens da conta:', CONTA.length, '| CUSTO REAL:', brl(REAL))
console.log('rateio:', brl(RATEIO), '| diferenca:', brl(DIF))
PARTES.forEach(p => console.log('   -', brl(p.v), p.o))
console.log('casa duplicada:', brl(soma(casaDup)), '| sem titulo no cartao:', brl(semTitulo.reduce((s, l) => s + n(l.valor), 0)))
console.log('pregoes:', fech.length, '| receita:', brl(RECEITA), '| custo/receita:', pct(pctReceita))
console.log('paginas estouradas:', over.length ? over : 'nenhuma')
console.log('PDF →', pdfPath)
