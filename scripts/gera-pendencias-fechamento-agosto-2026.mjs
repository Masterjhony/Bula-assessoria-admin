/**
 * "O que falta no fechamento de agosto/2026" — inventario das pendencias do
 * fechamento da Bula Assessoria, item a item, com a ORIGEM de cada dado e o
 * PONTO QUE PRECISA SER VALIDADO. PDF (brandbook) + XLSX na Area de Trabalho.
 *
 * Pedido do Joao em 01/09/2026, depois do Marcelo apontar no Grupo Financeiro
 * que faltavam as vendas do Nelore Pintado Engenho da Serra (29/08) e do Sabia
 * Dourado (30/08) no fechamento do mes.
 *
 * FONTES
 *   1. outputs/vendas-agosto-2026/dados.json — a apuracao das 3 fontes de
 *      31/08 (HastaPro FIL '2' + FIL '01', web-bula, grupos de WhatsApp).
 *      Dela saem os 7 leiloes sem fechamento, os lotes divergentes, a
 *      atribuicao e o financeiro. Nenhum desses numeros e digitado aqui.
 *   2. CURADOS[] — o que a apuracao de 31/08 NAO podia ver: os dois pregoes
 *      que nao existem no HastaPro e as perguntas que ficaram abertas no grupo
 *      em 31/08 e 01/09. Cada um traz o trecho literal da mensagem que o
 *      origina, para conferencia.
 *
 * Uso: node scripts/gera-pendencias-fechamento-agosto-2026.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'

const D = JSON.parse(fs.readFileSync('outputs/vendas-agosto-2026/dados.json', 'utf8'))

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
const corta = (t, n) => { const x = String(t); if (x.length <= n) return x; const c = x.slice(0, n), sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…' }
const curto = n => {
    const s = String(n || '').trim()
    for (const [re, nome] of [[/Peralta/i, 'Peralta'], [/Nane|Regiane/i, 'Nane'], [/Felipe Vilela|Bulinha/i, 'Bulinha'], [/Laila/i, 'Laila'], [/Rusa/i, 'Gustavo Rusa'], [/Lucas Martins/i, 'Lucas Martins']]) if (re.test(s)) return nome
    const p = s.split(/\s+/).filter(w => !['de', 'da', 'do', 'dos', 'das', 'e'].includes(w.toLowerCase()))
    return p.slice(0, 2).join(' ') || s
}

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', VERM = '#A33'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

/* ═══ 1. LEILÕES COM VENDA E SEM FECHAMENTO ═══════════════════════════════
 * Sai direto do cruzamento: tudo que tem lote no HastaPro e nenhum fechamento
 * no web-bula. A nota de cada um é curada — a apuração acha o buraco, ela não
 * sabe por que ele está lá. */
const NOTA_SEM_FECH = {
    'LEILÃO SÓ CRIADOR FÊMEAS E MACHOS DE ALTO PADRÃO': {
        origem: 'HastaPro, filial ‘01’ (pregão da própria Bula Remates). Lote 16A, 20 animais, R$ 2.500 de parcela, pisteiro Nane.',
        validar: 'É cobertura dentro de pregão da Remates — decidir se entra no painel de vendas antes de criar o fechamento. A Nane só existe em CLIENTES no HastaPro, então o importador não a resolve como pisteiro.',
        onde: 'importador de fechamento + cadastro do HastaPro',
    },
    '6º LEILÃO EXCELÊNCIA GENÉTICA': {
        origem: 'HastaPro filial ‘2’. Lote 21, R$ 3.500 de parcela, pisteiro Bulinha (Felipe Andrade).',
        validar: '⚠ Esse lote HOJE está lançado DENTRO do fechamento do 28º Naviraí de 23/08, como “A definir”. Criar o fechamento próprio e tirar o lote do Naviraí — senão o valor conta duas vezes quando o leilão for lançado.',
        onde: 'web-bula · fechamento do Naviraí 23/08',
    },
    'LEILÃO VIRTUAL TERRA BRAVA AGROPECUÁRIA - FÊMEAS PO': {
        origem: 'HastaPro filial ‘2’ + grupo “Lances Bula Assessoria” (lote 19 do Léo às 01h39 e lote 45 do Fábio às 02h18 de 27/08).',
        validar: 'Só importar. Mas o 2º dia — Terra Brava TOUROS, 27/08 — não tem venda em fonte nenhuma, e o Marcelo perguntou no grupo se tivemos. Confirmar com Léo e Fábio.',
        onde: 'importador de fechamento',
    },
    'LEILÃO NELORE DO XINGU': {
        origem: 'HastaPro filial ‘2’ + grupo (“Levamos lt extra - 3100 - 1F … Nelore Flor do Aratau, Dr Eron, Novo Repartimento-PA”, 27/08 00h53).',
        validar: 'O leilão NÃO existe na agenda (nem em cronograma_leiloes nem em bula_leiloes) — cadastrar antes. E o lote entrou como “EXTRA”, sem número.',
        onde: 'agenda + importador de fechamento',
    },
    'LEILÃO GENÉTICA SÃO JOSÉ - 30 ANOS DE SELEÇÃO': {
        origem: 'HastaPro filial ‘01’ (pregão da Bula Remates). Lotes 28, 36 e 37 — 17 animais a R$ 550 de parcela, todos com a Nane.',
        validar: 'Mesma decisão do Só Criador: é cobertura em pregão da Remates. E de novo a Nane, que o importador não resolve.',
        onde: 'importador de fechamento + cadastro do HastaPro',
    },
    'LEILÃO VIRTUAL VENTRES VIP MATINHA': {
        origem: 'HastaPro filial ‘2’, 5 lotes: 18 e 31 do Douglas (R$ 27.000 e R$ 37.500) e 138, 140 e 141 do Fábio (7 animais a R$ 300).',
        validar: '⚠ Os lotes 18 e 31 foram anunciados no grupo às 15h59 e 17h10 de 30/08 e depois reencaminhados no Financeiro como “vendas do Douglas no leilão Sabiá Dourado”. O HastaPro os coloca aqui, no Matinha. Um dos dois está errado — e a diferença importa: Sabiá Dourado é pregão da Bula Remates (filial ‘01’), Matinha é filial ‘2’.',
        onde: 'HastaPro · confirmar com Douglas',
    },
    '1º LEILÃO NELORE ASJ': {
        origem: 'HastaPro filial ‘2’ + grupo (lote 24, 2 fêmeas a R$ 330, e lote 07 a R$ 370 — os dois do Fábio, a ficha do 24 assinada “ASJ 👆🏻”).',
        validar: 'Só importar. As duas fontes já batem ao centavo (R$ 30.900).',
        onde: 'importador de fechamento',
    },
}
const semFechamento = D.cruzamento.filter(c => !c.erp).map(c => ({
    data: c.data, leilao: c.leilao, filial: c.filial, vgv: c.hp.vgv, lotes: c.hp.lotes, animais: c.hp.animais,
    ...(NOTA_SEM_FECH[c.leilao] || { origem: 'HastaPro', validar: '—', onde: 'importador de fechamento' }),
}))
const SEM_FECH_VGV = semFechamento.reduce((s, x) => s + x.vgv, 0)

/* ═══ 2. OS QUE NÃO ESTÃO EM FONTE NENHUMA ════════════════════════════════
 * A apuração de 31/08 não podia enxergar: não há lote no HastaPro nem
 * fechamento no web-bula. Só existem como ficha de WhatsApp. */
const CURADOS = [
    {
        data: '2026-08-29',
        leilao: 'NELORE PINTADO ENGENHO DA SERRA',
        vgv: 53600, lotes: 4, animais: 4, assessor: 'Douglas Bispo',
        detalhe: [
            ['41', 350, 40, 14000], ['52', 380, 40, 15200], ['59', 300, 40, 12000], ['39', 310, 40, 12400],
        ],
        origem: 'Só o WhatsApp. Postado no grupo “Bula Assessoria l Assessor” entre 29/08 22h14 e 30/08 00h17, e reencaminhado por Marcelo no Grupo Financeiro em 01/09 16h44. Comprador: Marta Carneiro da Silva, Rancho Alto Bonito, Novo Repartimento-PA.',
        validar: 'Três coisas. (1) O leilão não existe na agenda nem no HastaPro — não se sabe a leiloeira nem a filial. (2) A parcela aqui é ×40, não ×30: 350+380+300+310 = 1.340 × 40 = R$ 53.600. O Marcelo falou em “51.100 a mais de venda no mês” — faltam R$ 2.500 de explicação, e quem estiver com o número errado erra a comissão do Douglas. (3) Sem lote no HastaPro, esta venda não aparece em painel nenhum.',
        onde: 'agenda + HastaPro + fechamento',
    },
    {
        data: '2026-08-30',
        leilao: 'LEILÃO SABIÁ DOURADO',
        vgv: null, lotes: null, animais: null, assessor: 'Douglas Bispo',
        detalhe: [],
        origem: 'Agenda (bula_leiloes, leiloeira Bula Remates, status “concluído”) e um print do Douglas enviado no Grupo Financeiro em 31/08 16h46 (“Vendas Douglas no leilão Sabiá Dourado”). Nenhum lote no HastaPro em nome deste leilão.',
        validar: '⚠ É o item mais aberto do mês. Ou as vendas do Douglas de 30/08 são estas — e então o HastaPro as lançou no leilão errado (Ventres VIP Matinha) — ou o Sabiá Dourado tem vendas próprias que ninguém registrou. O print do Douglas resolve em um minuto; sem ele não dá para fechar agosto.',
        onde: 'confirmar com Douglas · HastaPro',
    },
]
const CURADO_VGV = CURADOS.reduce((s, x) => s + (x.vgv || 0), 0)

/* ═══ 3. LOTES FALTANDO E SOBRANDO DENTRO DE FECHAMENTO QUE JÁ EXISTE ═════ */
const dv = t => D.lotes_divergentes.filter(x => x.tipo === t)
const faltando = dv('so_no_hastapro')
const sobrando = dv('so_no_erp')
const FALTANDO_VGV = faltando.reduce((s, x) => s + x.vgv_hp, 0)
const SOBRANDO_VGV = sobrando.reduce((s, x) => s + x.vgv_erp, 0)
const NOTA_LOTE = {
    'LEILÃO TOUROS SÃO GERALDO E 7P AGRO': 'Os dois lotes são da Nane. O importador só resolve pisteiro em PRESTADORES e ela existe apenas em CLIENTES — cadastrá-la lá conserta painel, fechamento e comissão de uma vez.',
    '28º LEILÃO NAVIRAÍ CAMPARINO - REPRODUTORES': 'Lotes que estão no HastaPro e não entraram no fechamento. O mesmo fechamento carrega o lote 21 (R$ 105.000), que é de outro leilão.',
    'LEILÃO NAVIRAÍ CAMPARINO - MATRIZES ESSÊNCIA': 'Lote que está no fechamento e não tem par no HastaPro — ou não foi lançado lá, ou o número do lote está trocado.',
}

/* ═══ 4. FECHAMENTOS SEM PAR NO HASTAPRO ═════════════════════════════════ */
const NOTA_SEM_PAR = {
    'LEILÃO MATRIZES PREMIUM KATISPERA': 'Nasceu do parser de lances (17/08) e existe no grupo, mas não tem um único lote no HastaPro. Ou a venda não foi lançada lá, ou o fechamento é fantasma. Enquanto não se decide, R$ 5.850 de comissão estão comprometidos.',
    'LEILÃO NELORE PARANÃ E CASABRANCA EXPOGENÉTICA': 'Fechamento com o assessor “A definir” — ninguém está creditado pela venda. Resolve-se no HastaPro, olhando o pisteiro do lote.',
    'FÊMEAS JMP': '⚠ É duplicata: o lote 48 do Shopping Naviraí de 15/08, repostado num segundo grupo seis dias depois. Já saiu da apuração da Expogenética, mas segue no ERP inflando agosto em R$ 41.400. Apagar.',
}
const semPar = D.erp_sem_par.map(e => ({ ...e, nota: NOTA_SEM_PAR[e.nome] || '—' }))
const SEM_PAR_VGV = semPar.reduce((s, x) => s + x.vgv, 0)

/* ═══ 5. A CONTA QUE FECHA ════════════════════════════════════════════════
 * O ERP tem R$ 6.845.800 e o mês apurado nas 3 fontes é R$ 7.230.700. A
 * diferença tem de ser exatamente o que falta menos o que sobra — se não
 * fechar, é sinal de pendência não achada. */
const ERP = D.fontes.erp.vgv
const OFICIAL = D.consolidado.oficial
const entra = SEM_FECH_VGV + FALTANDO_VGV
const sai = SEM_PAR_VGV + SOBRANDO_VGV
const CONFERE = Math.abs((ERP + entra - sai) - OFICIAL) < 1

/* ═══ 6. ATRIBUIÇÃO E DINHEIRO ═══════════════════════════════════════════ */
const atribuicao = dv('atribuicao')
const rusa = atribuicao.filter(x => /Rusa/i.test(x.assessor_erp || ''))
const aDefinir = atribuicao.filter(x => /definir/i.test(x.assessor_erp || ''))
const outrosAtrib = atribuicao.filter(x => !/Rusa|definir/i.test(x.assessor_erp || ''))
const ATRIB_VGV = atribuicao.reduce((s, x) => s + (x.vgv_hp || 0), 0)
const FIN = D.financeiro

/* ═══ 7. PERGUNTAS ABERTAS DO GRUPO ══════════════════════════════════════ */
const ABERTAS = [
    ['29/08', 'LEILÃO MELHORADORES ESPECIAL 30 ANOS (Bula Remates)', 'Marcelo perguntou “Tivemos venda Bula Assessoria?” em 31/08 e a resposta ficou no ar. Nenhuma venda em fonte nenhuma.'],
    ['27/08', 'TERRA BRAVA 50 ANOS — 2º DIA, TOUROS', 'Agenda tem o pregão, HastaPro não tem lote, grupo não tem ficha. Marcelo perguntou “Não tivemos vendas?”.'],
    ['29/08', '4º LEILÃO NELORE CRISPIM', 'Mesma situação: GIF de lotes foi produzido, venda nenhuma registrada.'],
    ['—', 'DOIS LOTES SEM DONO', 'Em 31/08 19h15 alguém respondeu no grupo “teve por mim, conta? rs — vendi dois lotes, restante ngm dos meninos vendeu”. Esses dois lotes não estão em fonte nenhuma. Descobrir quem, qual leilão e se contam como venda da Bula.'],
]

/* ═══════════════════════════════════ HTML ═══════════════════════════════ */
const CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 13mm 17mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6; display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
  .capa { background: ${INK}; color: #fff; padding: 32mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 24mm; }
  .capa h1 { font-size: 40px; line-height: 1.05; color: #fff; font-weight: 700; }
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 142mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 9mm 0; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 11mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
  .capa .meta div span { display: block; font-size: 8.5px; color: #8A8A8A; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 2px; }
  .capa .meta div strong { font-size: 12px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${INK}; padding-bottom: 3mm; margin-bottom: 6mm; }
  .head h2 { font-size: 21px; }
  .head .n { font-size: 9px; color: ${MUTED}; letter-spacing: .12em; text-transform: uppercase; font-family: Oswald, sans-serif; }
  h3 { font-size: 12.5px; margin: 6mm 0 2mm; }
  h3:first-of-type { margin-top: 0; }
  p { margin: 0 0 3mm; }
  .lead { font-size: 11.4px; line-height: 1.58; }
  strong { font-weight: 600; }
  .muted { color: ${MUTED}; }
  .small { font-size: 8.8px; color: ${MUTED}; line-height: 1.45; margin-top: -1mm; }
  .tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin: 4mm 0 6mm; }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.4mm 3.4mm 3mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.6mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 19px; font-weight: 600; line-height: 1; }
  .tile .v .cur { font-size: 11px; font-weight: 500; color: ${MUTED}; margin-right: 1px; }
  .tile .d { font-size: 8.4px; color: ${MUTED}; margin-top: 1.6mm; line-height: 1.4; }
  .tile.gold { border-top-color: ${GOLD}; }
  .box { border: 1px solid ${GRID}; padding: 4mm 4.4mm; margin: 4mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box.rule { border: none; border-left: 3px solid ${INK}; padding: 1mm 0 1mm 4mm; }
  .box.gold { border-left: 3px solid ${GOLD}; border-top: none; border-right: none; border-bottom: none; padding: 1mm 0 1mm 4mm; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2.2mm; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 9.3px; margin: 2.5mm 0; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.4px; letter-spacing: .07em; font-weight: 600; border-bottom: 1.4px solid ${INK}; padding: 2mm 1.8mm; }
  td { padding: 1.6mm 1.8mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  tr.sub td { background: #FAFAFA; font-weight: 600; }
  .neg { color: ${VERM}; }
  .tag { display: inline-block; font-family: Oswald, sans-serif; font-size: 7.4px; letter-spacing: .07em; text-transform: uppercase; border: 1px solid ${GRID}; padding: .4mm 1.4mm; color: ${MUTED}; white-space: nowrap; }
  .tag.ok { border-color: ${INK}; color: ${INK}; }
  .tag.warn { border-color: ${GOLD}; color: #8A7024; background: #FCF8EE; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .item { border-top: 1px solid ${GRID}; padding: 3mm 0 2.4mm; }
  .item:first-of-type { border-top: 1.4px solid ${INK}; }
  .item .cab { display: flex; justify-content: space-between; align-items: baseline; gap: 4mm; }
  .item .cab .nm { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; font-weight: 600; letter-spacing: .03em; }
  .item .cab .vl { font-family: Oswald, sans-serif; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
  .item .sub2 { font-size: 8.4px; color: ${MUTED}; text-transform: uppercase; letter-spacing: .07em; margin: .8mm 0 1.8mm; }
  .item p { margin: 0 0 1.4mm; font-size: 9.5px; }
  .item .lbl { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8px; letter-spacing: .08em; color: ${MUTED}; margin-right: 1.5mm; }
  table.dense td { padding: 1.05mm 1.8mm; }
  table.dense th { padding: 1.5mm 1.8mm; }`

const foot = p => `<div class="pfoot"><span>Bula Assessoria · O que falta no fechamento de agosto/2026</span><span>${p}</span></div>`

const itemHtml = (o, i) => `
<div class="item">
  <div class="cab"><span class="nm">${i}. ${esc(corta(o.leilao, 46))}</span>
    <span class="vl">${o.vgv === null ? '<span class="tag warn">valor a apurar</span>' : 'R$ ' + brl0(o.vgv)}</span></div>
  <div class="sub2">${dm(o.data)} · ${o.filial ? 'filial ‘' + o.filial + '’ · ' : ''}${o.lotes ? o.lotes + ' lote' + (o.lotes > 1 ? 's' : '') : 'lotes não apurados'}${o.animais ? ' · ' + o.animais + ' animais' : ''} · ${esc(o.onde)}</div>
  <p><span class="lbl">Origem</span>${esc(o.origem)}</p>
  <p><span class="lbl">Validar</span>${esc(o.validar)}</p>
</div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<title>O que falta no fechamento de agosto 2026</title>
<style>${CSS}</style></head><body>

<!-- ══ CAPA ══ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>O que falta<br>em agosto</h1>
  <div class="rule"></div>
  <div class="sub">Inventário das pendências do fechamento da Bula Assessoria — <strong>leilão a leilão e lote a lote</strong>,
  com a origem de cada dado e o ponto exato que precisa ser validado antes de fechar o mês.</div>
  <div class="meta">
    <div><span>Pendências</span><strong>${semFechamento.length + CURADOS.length + faltando.length + sobrando.length + semPar.length} itens</strong></div>
    <div><span>Leilões sem fechamento</span><strong>R$ ${brl0(SEM_FECH_VGV)}</strong></div>
    <div><span>Fora de toda fonte</span><strong>R$ ${brl0(CURADO_VGV)}+</strong></div>
    <div><span>Atribuição em aberto</span><strong>R$ ${brl0(ATRIB_VGV)}</strong></div>
    <div><span>Emitido em</span><strong>01/09/2026</strong></div>
  </div>
</section>

<!-- ══ 1. O MAPA ══ -->
<section class="page">
  <div class="head"><h2>O mapa da diferença</h2><div class="n">01 · Visão geral</div></div>

  <p class="lead">O ERP fechou agosto em <strong>R$ ${brl0(ERP)}</strong>. A apuração das três fontes de 31/08 deu
  <strong>R$ ${brl0(OFICIAL)}</strong>. A diferença de <strong>R$ ${brl0(OFICIAL - ERP)}</strong> não é um mistério:
  é a soma exata do que falta lançar menos o que está lançado a mais. E, além dela, há
  <strong>R$ ${brl0(CURADO_VGV)}</strong> que <em>nenhuma</em> das três fontes enxerga.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Fechamentos no ERP hoje</div>
      <div class="v"><span class="cur">R$</span>${brl0(ERP)}</div>
      <div class="d">${D.fontes.erp.fechamentos} fechamentos de agosto</div></div>
    <div class="tile"><div class="k">Falta lançar</div>
      <div class="v"><span class="cur">R$</span>${brl0(entra)}</div>
      <div class="d">${semFechamento.length} leilões inteiros + ${faltando.length} lotes soltos</div></div>
    <div class="tile"><div class="k">Está lançado a mais</div>
      <div class="v"><span class="cur">R$</span>${brl0(sai)}</div>
      <div class="d">${semPar.length} fechamentos + ${sobrando.length} lotes sem par</div></div>
    <div class="tile gold"><div class="k">Fora de toda fonte</div>
      <div class="v"><span class="cur">R$</span>${brl0(CURADO_VGV)}</div>
      <div class="d">Engenho da Serra + Sabiá Dourado (a apurar)</div></div>
  </div>

  <h3>A conta fecha ao centavo</h3>
  <table>
    <tr><th>Movimento</th><th>O que é</th><th class="num">Valor</th></tr>
    <tr><td>Fechamentos de agosto no ERP</td><td class="muted">o que está lançado hoje</td><td class="num">R$ ${brl(ERP)}</td></tr>
    <tr><td>+ Leilões com venda e sem fechamento</td><td class="muted">${semFechamento.length} pregões, do Só Criador ao ASJ</td><td class="num">+ ${brl(SEM_FECH_VGV)}</td></tr>
    <tr><td>+ Lotes que faltam em fechamento existente</td><td class="muted">São Geraldo (Nane) e Naviraí</td><td class="num">+ ${brl(FALTANDO_VGV)}</td></tr>
    <tr><td>− Fechamentos sem par no HastaPro</td><td class="muted">Katispera, Paranã/Casabranca e a duplicata FÊMEAS JMP</td><td class="num neg">− ${brl(SEM_PAR_VGV)}</td></tr>
    <tr><td>− Lotes lançados a mais</td><td class="muted">lote 21 (é de outro leilão) e lote 9 do Naviraí Matrizes</td><td class="num neg">− ${brl(SOBRANDO_VGV)}</td></tr>
    <tr class="total"><td>Resultado</td><td>${CONFERE ? 'igual à apuração das três fontes' : '⚠ NÃO fecha — há pendência não mapeada'}</td>
      <td class="num">R$ ${brl(ERP + entra - sai)}</td></tr>
  </table>
  <p class="small">Cada correção desta lista move o ERP na direção do número apurado. Como a soma fecha exatamente,
  não há pendência escondida <em>dentro</em> das três fontes — o que sobra de risco está justamente no que
  nenhuma delas vê, na página 3.</p>

  <div class="box dark">
    <div class="t">O que decide o mês</div>
    <p>Depois de tudo lançado, agosto passa de R$ ${brl0(ERP)} para <strong>R$ ${brl0(OFICIAL + CURADO_VGV)}</strong>
    (já somando o Engenho da Serra) — sem contar o Sabiá Dourado, que ainda não tem valor.</p>
    <p style="margin-bottom:0">A meta de 12% sobre a agenda divulgada era R$ ${brl0(D.meta.alvo_agenda_divulgada)}.
    Com as pendências lançadas, o realizado vai a <strong>${((OFICIAL + CURADO_VGV) / D.meta.agenda_divulgada * 100).toFixed(2).replace('.', ',')}%</strong> —
    mas isso continua valendo só na leitura que <strong>soma a cobertura em pregão da Bula Remates</strong>
    (R$ ${brl0(D.consolidado.hp01_bula.vgv)}). Sem ela, o painel mostra ${D.meta.so_painel.pct_agenda_divulgada.toFixed(2).replace('.', ',')}% e a meta não bate.
    Essa decisão continua pendente e é anterior a qualquer lançamento.</p>
  </div>
  ${foot('Página 2 de 6')}
</section>

<!-- ══ 2. FORA DE TODA FONTE ══ -->
<section class="page">
  <div class="head"><h2>O que nenhuma fonte vê</h2><div class="n">02 · Prioridade</div></div>

  <p class="lead">Estes dois pregões não têm lote no HastaPro, nem fechamento no web-bula, nem linha na planilha.
  Existem <strong>apenas como ficha de WhatsApp</strong> — e foi exatamente o que o Marcelo apontou no grupo.
  São os únicos itens do mês que <em>aumentam</em> o total apurado; todo o resto é remanejamento.</p>

  ${CURADOS.map((o, i) => itemHtml(o, i + 1)).join('')}

  <h3>Os quatro lotes do Engenho da Serra</h3>
  <table>
    <tr><th>Lote</th><th class="num">Parcela</th><th class="num">Parcelas</th><th class="num">VGV</th><th>Comprador</th></tr>
    ${CURADOS[0].detalhe.map(([lt, p, n, v]) => `<tr><td>${lt}</td><td class="num">R$ ${brl0(p)}</td><td class="num">${n}×</td>
      <td class="num">R$ ${brl(v)}</td><td class="muted">Marta Carneiro da Silva · Rancho Alto Bonito · Novo Repartimento-PA</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td class="num"></td><td class="num">4 lotes</td><td class="num">R$ ${brl(CURADOS[0].vgv)}</td><td></td></tr>
  </table>
  <p class="small">O Marcelo anunciou “51.100 a mais de venda no mês”. Pela ficha, são R$ 53.600 — a parcela é ×40,
  e não ×30 como na maioria dos leilões. <strong>A diferença de R$ 2.500 precisa ser resolvida antes de lançar</strong>,
  porque é ela que define a comissão do Douglas (2%: R$ 1.072 contra R$ 1.022).</p>

  <div class="box gold">
    <div class="t">O nó do Sabiá Dourado</div>
    <p style="margin-bottom:0">Em 30/08 o Douglas anunciou dois lotes no grupo de lances — lote 18 (R$ 900 de parcela) e
    lote 31 (R$ 1.250), R$ 64.500 juntos. O HastaPro registrou os dois dentro do <strong>Ventres VIP Matinha</strong>.
    No Grupo Financeiro, o mesmo par foi apresentado como <strong>“vendas do Douglas no leilão Sabiá Dourado”</strong>.
    Se o certo for Sabiá Dourado, esses R$ 64.500 mudam de leilão <em>e de filial</em> — Sabiá Dourado é pregão da
    Bula Remates, cuja cobertura o painel não mostra. Se o certo for o Matinha, então o Sabiá Dourado ficou sem
    nenhuma venda registrada e o print do Douglas está apontando outra coisa.</p>
  </div>
  ${foot('Página 3 de 6')}
</section>

<!-- ══ 3. LEILÕES SEM FECHAMENTO ══ -->
<section class="page">
  <div class="head"><h2>Leilões com venda e sem fechamento</h2><div class="n">03 · ${semFechamento.length} pregões</div></div>

  <p class="lead">Todos têm lote lançado no HastaPro e nenhum fechamento no web-bula. Somam
  <strong>R$ ${brl0(SEM_FECH_VGV)}</strong> — ${((SEM_FECH_VGV / OFICIAL) * 100).toFixed(1).replace('.', ',')}% de agosto.
  Cinco são de 26 e 30/08, depois do último import; os outros dois têm causa própria.</p>

  ${semFechamento.map((o, i) => itemHtml(o, i + 1)).join('')}
  ${foot('Página 4 de 6')}
</section>

<!-- ══ 4. LOTES ══ -->
<section class="page">
  <div class="head"><h2>Lotes fora do lugar</h2><div class="n">04 · Dentro dos fechamentos</div></div>

  <h3>Faltam no fechamento — R$ ${brl0(FALTANDO_VGV)}</h3>
  <table class="dense">
    <tr><th class="num">Data</th><th>Leilão</th><th>Lote</th><th>Assessor no HastaPro</th><th class="num">VGV</th></tr>
    ${faltando.map(x => `<tr><td class="num">${dm(x.data)}</td><td>${esc(corta(x.leilao, 40))}</td><td>${esc(x.lote)}</td>
      <td>${esc(curto(x.assessor_hp))}</td><td class="num">R$ ${brl(x.vgv_hp)}</td></tr>`).join('')}
    <tr class="total"><td></td><td>${faltando.length} lotes</td><td></td><td></td><td class="num">R$ ${brl(FALTANDO_VGV)}</td></tr>
  </table>
  ${[...new Set(faltando.map(x => x.leilao))].map(l => `<p class="small"><strong>${esc(corta(l, 44))}:</strong> ${esc(NOTA_LOTE[l] || '')}</p>`).join('')}

  <h3>Sobram no fechamento — R$ ${brl0(SOBRANDO_VGV)}</h3>
  <table class="dense">
    <tr><th class="num">Data</th><th>Leilão</th><th>Lote</th><th>Assessor no ERP</th><th class="num">VGV</th></tr>
    ${sobrando.map(x => `<tr><td class="num">${dm(x.data)}</td><td>${esc(corta(x.leilao, 40))}</td><td>${esc(x.lote)}</td>
      <td>${esc(curto(x.assessor_erp))}</td><td class="num">R$ ${brl(x.vgv_erp)}</td></tr>`).join('')}
    <tr class="total"><td></td><td>${sobrando.length} lotes</td><td></td><td></td><td class="num">R$ ${brl(SOBRANDO_VGV)}</td></tr>
  </table>
  <p class="small"><strong>Lote 21 (R$ 105.000):</strong> é do 6º Leilão Excelência Genética, item 2 da página anterior.
  Enquanto ele estiver dentro do Naviraí, criar o fechamento do Excelência conta o valor duas vezes — tirar um antes de pôr o outro.</p>

  <h3>Fechamentos sem par no HastaPro — R$ ${brl0(SEM_PAR_VGV)}</h3>
  ${semPar.map((o, i) => `<div class="item"><div class="cab"><span class="nm">${i + 1}. ${esc(corta(o.nome, 44))}</span>
    <span class="vl">R$ ${brl0(o.vgv)}</span></div>
    <div class="sub2">${dm(o.data)} · origem ${esc(o.origem)} · ${o.lotes || 1} lote</div>
    <p>${esc(o.nota)}</p></div>`).join('')}
  ${foot('Página 5 de 6')}
</section>

<!-- ══ 5. ATRIBUIÇÃO, DINHEIRO E PERGUNTAS ══ -->
<section class="page">
  <div class="head"><h2>Atribuição, dinheiro e o que ficou sem resposta</h2><div class="n">05 · Decisões</div></div>

  <h3>Atribuição: ${atribuicao.length} lotes, R$ ${brl0(ATRIB_VGV)}</h3>
  <p>O lote existe nas duas bases e com o mesmo valor — muda <strong>quem levou o crédito</strong>. Nada aqui altera o
  total do mês; altera o ranking e a comissão de cada um.</p>
  <table class="dense">
    <tr><th>Grupo</th><th class="num">Lotes</th><th class="num">VGV</th><th>O que precisa ser decidido</th></tr>
    <tr><td>Direcionamento do Rusa</td><td class="num">${rusa.length}</td><td class="num">R$ ${brl(rusa.reduce((s, x) => s + x.vgv_hp, 0))}</td>
      <td>ERP credita o Rusa, HastaPro credita o pisteiro que estava na pista. É a zona cinzenta do acordo de parceria — decidir a regra, não lote a lote.</td></tr>
    <tr><td>“A definir” no ERP</td><td class="num">${aDefinir.length}</td><td class="num">R$ ${brl(aDefinir.reduce((s, x) => s + x.vgv_hp, 0))}</td>
      <td>Ninguém está creditado. O HastaPro já sabe quem foi em todos eles — resolve-se copiando o pisteiro.</td></tr>
    <tr><td>Outros conflitos</td><td class="num">${outrosAtrib.length}</td><td class="num">R$ ${brl(outrosAtrib.reduce((s, x) => s + x.vgv_hp, 0))}</td>
      <td>Inclui o lote 22 do Naviraí (R$ 63.000) em nome de “MARCELO MOURA”, que não é da equipe: é o comprador entrando como pisteiro.</td></tr>
    <tr class="total"><td>Total</td><td class="num">${atribuicao.length}</td><td class="num">R$ ${brl(ATRIB_VGV)}</td><td></td></tr>
  </table>
  <p class="small">A Nane aparece em ${D.qualidade.so_em_clientes.length === 1 ? 'todos' : 'vários'} os pregões da Remates e o importador não a reconhece:
  ela só existe em CLIENTES no HastaPro, não em PRESTADORES. <strong>Cadastrá-la em PRESTADORES conserta painel, fechamento e comissão de uma vez</strong> — é a correção de maior alcance da lista.</p>

  <h3>O dinheiro que falta junto</h3>
  <ul>
    <li><strong>R$ ${brl0(FIN.comissao_sem_receita)} de comissão em ${FIN.fechamentos_sem_receita.length} fechamentos com receita ZERO.</strong>
    A despesa está lançada e a receita que a cobre não — falta o acordo e o faturamento do leilão em cada um. Quase toda a Expogenética está aqui.</li>
    <li><strong>Matinha 16/08:</strong> o Marcelo avisou que o José Fábio tem crédito lá e que “não vamos receber nada, nem Rusa”. A venda de R$ 460.500 conta no VGV, a receita é zero e os <strong>R$ 19.200 de comissão precisam ser cancelados</strong> — definir se cai só a parte do Rusa (R$ 16.650) ou o fechamento inteiro.</li>
    <li><strong>Lucas Martins está com 0,33% na folha</strong> e o Grupo Financeiro fixou 1% em 05/08. Os R$ 96.000 dele valem R$ 316,80 ou R$ 960 conforme o percentual — corrigir antes de gerar a comissão de agosto.</li>
    <li><strong>Comissão comprometida R$ ${brl0(FIN.comissao_assessores)} × receita reconhecida R$ ${brl0(FIN.receita_bula)}.</strong> Enquanto os acordos não entrarem, agosto mostra despesa sem a receita correspondente.</li>
  </ul>

  <h3>Perguntas que ficaram sem resposta no grupo</h3>
  <table class="dense">
    <tr><th class="num">Data</th><th>Item</th><th>Situação</th></tr>
    ${ABERTAS.map(([d, t, s]) => `<tr><td class="num">${d}</td><td>${esc(t)}</td><td class="muted">${esc(s)}</td></tr>`).join('')}
  </table>

  <div class="box rule">
    <div class="t">A ordem para resolver</div>
    <ol style="margin-bottom:0">
      <li><strong>Pedir o print do Douglas</strong> (Sabiá Dourado) e fechar a dúvida dos R$ 64.500 — é o que trava o mês.</li>
      <li><strong>Acertar os R$ 2.500</strong> do Engenho da Serra: 51.100 do Marcelo × 53.600 da ficha.</li>
      <li><strong>Cadastrar a Nane em PRESTADORES</strong> no HastaPro — conserta São Geraldo, Só Criador e São José de uma vez.</li>
      <li><strong>Tirar o lote 21 do Naviraí</strong> e criar o fechamento do 6º Excelência Genética, nessa ordem.</li>
      <li><strong>Apagar a duplicata FÊMEAS JMP</strong> e decidir Katispera e Paranã/Casabranca.</li>
      <li><strong>Importar os 7 pregões</strong> que faltam e só então gerar comissão de agosto.</li>
    </ol>
  </div>
  ${foot('Página 6 de 6')}
</section>
</body></html>`

fs.mkdirSync('outputs/pendencias-agosto-2026', { recursive: true })
fs.writeFileSync('outputs/pendencias-agosto-2026/relatorio.html', html)

/* ═══ PDF ═════════════════════════════════════════════════════════════════ */
const desktop = path.join(os.homedir(), 'Desktop')
const pdfPath = path.join(desktop, 'Bula - O Que Falta no Fechamento de Agosto 2026.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
await browser.close()

/* ═══ XLSX ════════════════════════════════════════════════════════════════ */
const wb = XLSX.utils.book_new()
const add = (nome, linhas, cols) => {
    const ws = XLSX.utils.aoa_to_sheet(linhas)
    ws['!cols'] = cols || [{ wch: 14 }, { wch: 44 }, { wch: 14 }, { wch: 8 }, { wch: 60 }, { wch: 60 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, ws, nome)
}
const CHECK = [
    ['#', 'Categoria', 'Data', 'Item', 'Valor', 'Lotes', 'Origem do dado', 'O que precisa validar', 'Onde se resolve'],
    ...CURADOS.map((o, i) => [i + 1, 'Fora de toda fonte', o.data, o.leilao, o.vgv, o.lotes, o.origem, o.validar, o.onde]),
    ...semFechamento.map((o, i) => [CURADOS.length + i + 1, 'Leilão sem fechamento', o.data, o.leilao, o.vgv, o.lotes, o.origem, o.validar, o.onde]),
    ...faltando.map((x, i) => [CURADOS.length + semFechamento.length + i + 1, 'Lote faltando', x.data, `${x.leilao} — lote ${x.lote}`, x.vgv_hp, 1,
        `HastaPro, pisteiro ${x.assessor_hp}`, NOTA_LOTE[x.leilao] || 'Lançar o lote no fechamento existente.', 'web-bula · fechamento']),
    ...sobrando.map((x, i) => [CURADOS.length + semFechamento.length + faltando.length + i + 1, 'Lote sobrando', x.data, `${x.leilao} — lote ${x.lote}`, -x.vgv_erp, 1,
        `web-bula, creditado a ${x.assessor_erp}`, NOTA_LOTE[x.leilao] || 'Sem par no HastaPro — conferir número do lote.', 'web-bula · fechamento']),
    ...semPar.map((o, i) => [CURADOS.length + semFechamento.length + faltando.length + sobrando.length + i + 1, 'Fechamento sem par', o.data, o.nome, -o.vgv, o.lotes ?? 1,
        `web-bula, origem ${o.origem}`, o.nota, 'web-bula · fechamento']),
]
add('Checklist', CHECK, [{ wch: 5 }, { wch: 22 }, { wch: 12 }, { wch: 50 }, { wch: 14 }, { wch: 7 }, { wch: 66 }, { wch: 88 }, { wch: 32 }])
add('A conta que fecha', [
    ['Movimento', 'O que é', 'Valor'],
    ['Fechamentos de agosto no ERP', `${D.fontes.erp.fechamentos} fechamentos`, ERP],
    ['+ Leilões sem fechamento', `${semFechamento.length} pregões`, SEM_FECH_VGV],
    ['+ Lotes faltando', `${faltando.length} lotes`, FALTANDO_VGV],
    ['- Fechamentos sem par', `${semPar.length} fechamentos`, -SEM_PAR_VGV],
    ['- Lotes sobrando', `${sobrando.length} lotes`, -SOBRANDO_VGV],
    ['= Resultado', CONFERE ? 'bate com a apuração das 3 fontes' : 'NÃO bate', ERP + entra - sai],
    ['Apuração das 3 fontes (31/08)', 'HastaPro FIL 2 + cobertura Remates', OFICIAL],
    [],
    ['+ Fora de toda fonte', 'Engenho da Serra (Sabiá Dourado a apurar)', CURADO_VGV],
    ['= Agosto depois de tudo lançado', 'sem o Sabiá Dourado', OFICIAL + CURADO_VGV],
], [{ wch: 40 }, { wch: 46 }, { wch: 16 }])
add('Lotes Engenho da Serra', [
    ['Lote', 'Parcela', 'Nº parcelas', 'VGV', 'Assessor', 'Comprador', 'Cidade/UF'],
    ...CURADOS[0].detalhe.map(([lt, p, n, v]) => [lt, p, n, v, 'Douglas Bispo', 'Marta Carneiro da Silva · Rancho Alto Bonito', 'Novo Repartimento-PA']),
    ['TOTAL', '', '', CURADOS[0].vgv, '', 'Marcelo anunciou 51.100 — diferença de 2.500 a resolver', ''],
], [{ wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 48 }, { wch: 24 }])
add('Atribuicao', [
    ['Data', 'Leilão', 'Lote', 'VGV', 'Assessor HastaPro', 'Assessor ERP'],
    ...atribuicao.map(x => [x.data, x.leilao, x.lote, x.vgv_hp, x.assessor_hp, x.assessor_erp]),
], [{ wch: 12 }, { wch: 50 }, { wch: 9 }, { wch: 14 }, { wch: 30 }, { wch: 26 }])
add('Receita zero', [
    ['Data', 'Leilão', 'VGV', 'Comissão comprometida', 'Receita'],
    ...FIN.fechamentos_sem_receita.map(f => [f.data, f.nome, f.vgv, f.comissao, 0]),
    ['TOTAL', `${FIN.fechamentos_sem_receita.length} fechamentos`, '', FIN.comissao_sem_receita, 0],
], [{ wch: 12 }, { wch: 50 }, { wch: 14 }, { wch: 22 }, { wch: 12 }])
add('Perguntas abertas', [['Data', 'Item', 'Situação'], ...ABERTAS], [{ wch: 10 }, { wch: 46 }, { wch: 100 }])
const xlsxPath = path.join(desktop, 'Bula - O Que Falta no Fechamento de Agosto 2026.xlsx')
XLSX.writeFile(wb, xlsxPath)

console.log('itens no checklist:', CHECK.length - 1)
console.log('a conta fecha?', CONFERE, '|', ERP + entra - sai, 'vs', OFICIAL)
console.log('PDF  →', pdfPath)
console.log('XLSX →', xlsxPath)
