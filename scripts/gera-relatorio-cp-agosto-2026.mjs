/**
 * Relatorio de Contas a Pagar - AGOSTO/2026 (Bula Assessoria Pecuaria).
 * Fonte: ERP (erp_contas_pagar / erp_contas_receber / erp_contas_bancarias),
 * com o extrato Sicoob conciliado ate 11/08/2026.
 * Saida: HTML + PDF em outputs/contas-a-pagar-agosto-2026/.
 * Identidade: preto e branco (brandbook), sem verde/dourado.
 */
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const HOJE = '2026-08-11'
const OUTDIR = 'outputs/contas-a-pagar-agosto-2026'
fs.mkdirSync(OUTDIR, { recursive: true })

const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dia = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : ''
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* ---------------- dados ---------------- */
const { data: cats } = await sb.from('erp_categorias').select('id,nome')
const CN = Object.fromEntries(cats.map(c => [c.id, c.nome]))

const { data: cpRaw } = await sb.from('erp_contas_pagar').select('*')
  .lte('vencimento', '2026-08-31').in('status', ['aberto', 'vencido', 'parcial']).order('vencimento')
const { data: pgRaw } = await sb.from('erp_contas_pagar').select('*')
  .eq('status', 'pago').gte('data_pagamento', '2026-08-01').lte('data_pagamento', '2026-08-31')
  .order('data_pagamento')
const { data: crRaw } = await sb.from('erp_contas_receber').select('vencimento,descricao,valor,valor_recebido,status')
  .lte('vencimento', '2026-08-31').in('status', ['aberto', 'vencido', 'parcial'])
const { data: contas } = await sb.from('erp_contas_bancarias').select('nome,saldo_atual,tipo,ativo')

const norm = c => ({
  venc: c.vencimento, desc: c.descricao, valor: Number(c.valor),
  pago: Number(c.valor_pago || 0), saldo: Number(c.valor) - Number(c.valor_pago || 0),
  status: c.status, cat: CN[c.categoria_id] || 'Sem categoria',
  tags: c.tags || [], obs: c.observacoes || '', vendedor: c.vendedor || null,
  estimado: (c.tags || []).includes('estimado'),
})
const cp = cpRaw.map(norm)
let pagos = pgRaw.map(c => ({ ...norm(c), dt: c.data_pagamento, valor: Number(c.valor_pago || c.valor) }))

/* Acertos de comissao viram UMA linha por beneficiario, e o valor e o que saiu do
   caixa EM AGOSTO — nao o total do CP. O acerto do Fabio, por exemplo, soma
   R$ 60.645,00 em 13 lancamentos, mas R$ 40.430,00 ja tinham saido em 24/07;
   so R$ 20.215,00 sao caixa de agosto. */
/* Casa so por data + nome: o Rusa e parceiro e cai em "Repasse Assessorias/
   Parceiros", nao em "Comissao Funcionario" — filtrar por categoria deixava
   parte do acerto de fora do grupo e contava o valor duas vezes. */
const GRUPOS_PAGOS = [
  { rotulo: 'Restante das comissoes de junho — FÁBIO OMENA',
    dt: '2026-08-10', casa: /COMISSAO.*OMENA/i, cat: 'Comissão Funcionário', caixaAgosto: 20215.00,
    nota: 'acerto de R$ 60.645,00 em 13 leiloes; R$ 40.430,00 saíram em 24/07' },
  { rotulo: 'Comissoes de julho — GUSTAVO RUSA (parceiro, 5%)',
    dt: '2026-08-10', casa: /RUSA/i, cat: 'Repasse Assessorias/Parceiros', caixaAgosto: 29535.00,
    nota: 'NF 34; inclui o complemento de R$ 6.045,00 apurado na conciliacao' },
]
for (const g of GRUPOS_PAGOS) {
  const membros = pagos.filter(p => p.dt === g.dt && g.casa.test(p.desc))
  if (!membros.length) continue
  const somaCp = membros.reduce((s, p) => s + p.valor, 0)
  console.log('  grupo "' + g.rotulo + '": ' + membros.length + ' CP somando R$ ' + somaCp.toFixed(2) +
    ' -> caixa de agosto R$ ' + g.caixaAgosto.toFixed(2))
  pagos = pagos.filter(p => !membros.includes(p))
  pagos.push({ dt: g.dt, desc: g.rotulo, cat: g.cat, valor: g.caixaAgosto,
    n: membros.length, nota: g.nota, tags: [], estimado: false })
}
pagos.sort((a, b) => a.dt.localeCompare(b.dt) || b.valor - a.valor)

const totalAberto = cp.reduce((s, c) => s + c.saldo, 0)
const totalPago = pagos.reduce((s, c) => s + c.valor, 0)
const totalEstimado = cp.filter(c => c.estimado).reduce((s, c) => s + c.saldo, 0)
const totalFirme = totalAberto - totalEstimado
const crAberto = crRaw.reduce((s, c) => s + Number(c.valor) - Number(c.valor_recebido || 0), 0)
const saldoSicoob = Number(contas.find(c => c.nome.includes('Sicoob'))?.saldo_atual || 0)
const saldoSicredi = contas.filter(c => c.nome.includes('Sicredi')).reduce((s, c) => s + Number(c.saldo_atual || 0), 0)

/* ---------------- blocos ---------------- */
const has = (c, t) => c.tags.includes(t)
const blocos = [
  { id: 'atrasado', titulo: 'Vencidos de julho ainda em aberto',
    nota: 'Compromissos que passaram do vencimento e continuam sem baixa. Entram no caixa de agosto.',
    filtro: c => c.venc < '2026-08-01' },
  { id: 'comjul', titulo: 'Comissoes de assessores — referencia julho/2026',
    nota: 'Vencimento em 25/08, conforme o ciclo (dia 25 do mes seguinte). Base: os 14 fechamentos de julho, 2% sobre o VGV de cada assessor. A Nane fica de fora: a comissao dela e acumulada a parte e paga de uma vez em dezembro.',
    filtro: c => c.venc >= '2026-08-01' && has(c, 'comissao') },
  { id: 'folha', titulo: 'Folha e fixos de estrutura',
    filtro: c => c.venc >= '2026-08-01' && (has(c, 'folha') || has(c, 'despesa-fixa')) },
  { id: 'imposto', titulo: 'Impostos e encargos',
    nota: 'O ISSQN ja chegou com valor fechado (guia 1674646, venc. 17/08). O DAS do Simples ainda nao foi emitido — o valor abaixo e estimado a partir da base tributada que a propria guia do ISSQN revelou.',
    filtro: c => c.venc >= '2026-08-01' && (has(c, 'imposto') || c.cat === 'Impostos e Taxas' || c.cat === 'Encargos Sociais' || c.cat === 'Seguros') },
  { id: 'leilao', titulo: 'Despesas operacionais de leiloes e Expogenetica',
    nota: 'Uberaba concentra 6 leiloes entre 10 e 20/08. Estimativa a partir do custo realizado de julho.',
    filtro: c => c.venc >= '2026-08-01' && (has(c, 'leilao') || c.cat === 'Despesa Operacional Leilao' || c.cat === 'Viagem/Passagens') },
  { id: 'outros', titulo: 'Reembolsos e demais lancamentos', filtro: () => true },
]
const usados = new Set()
for (const b of blocos) {
  b.itens = cp.filter(c => !usados.has(c) && b.filtro(c))
  b.itens.forEach(c => usados.add(c))
  b.total = b.itens.reduce((s, c) => s + c.saldo, 0)
}

/* ---------------- cronograma semanal ---------------- */
const semanas = [
  ['Ate 15/08', c => c.venc <= '2026-08-15'],
  ['16 a 22/08', c => c.venc >= '2026-08-16' && c.venc <= '2026-08-22'],
  ['23 a 31/08', c => c.venc >= '2026-08-23'],
].map(([label, f]) => {
  const itens = cp.filter(f)
  return { label, total: itens.reduce((s, c) => s + c.saldo, 0), n: itens.length }
})

/* ---------------- HTML ---------------- */
const linha = c => `<tr${c.estimado ? ' class="est"' : ''}>
  <td class="dt">${dia(c.venc)}</td>
  <td>${esc(c.desc)}${c.estimado ? ' <span class="tag">estimado</span>' : ''}${c.status === 'vencido' ? ' <span class="tag alerta">vencido</span>' : ''}${c.pago > 0 ? ` <span class="tag">R$ ${brl(c.pago)} ja pago</span>` : ''}</td>
  <td class="cat">${esc(c.cat)}</td>
  <td class="num">${brl(c.saldo)}</td></tr>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Contas a Pagar — Agosto/2026 — Bula Assessoria</title>
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111; margin: 0; font-size: 10pt; line-height: 1.45; }
  h1 { font-size: 21pt; letter-spacing: .03em; text-transform: uppercase; margin: 0 0 2mm; }
  h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: .06em; margin: 9mm 0 2mm;
       border-bottom: 1.5pt solid #111; padding-bottom: 1.5mm; page-break-after: avoid; }
  h3 { font-size: 9.5pt; text-transform: uppercase; letter-spacing: .05em; margin: 5mm 0 1.5mm;
       page-break-after: avoid; }
  table.resumo { margin-bottom: 4mm; } table.resumo td { padding: 2mm 1.5mm; }
  .sub { color: #555; font-size: 9.5pt; margin: 0 0 6mm; }
  header { border-bottom: 3pt solid #111; padding-bottom: 4mm; margin-bottom: 6mm; }
  .kpis { display: flex; gap: 3mm; margin: 0 0 5mm; }
  .kpi { flex: 1; border: 1pt solid #111; padding: 3mm; }
  .kpi .l { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .07em; color: #444; }
  .kpi .v { font-size: 14pt; font-weight: 700; margin-top: 1mm; }
  .kpi .n { font-size: 7.5pt; color: #666; margin-top: .5mm; }
  .kpi.dark { background: #111; color: #fff; } .kpi.dark .l, .kpi.dark .n { color: #bbb; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { text-align: left; text-transform: uppercase; font-size: 7.5pt; letter-spacing: .05em;
       border-bottom: 1pt solid #111; padding: 1.5mm 1.5mm; color: #333; }
  td { padding: 1.6mm 1.5mm; border-bottom: .4pt solid #ddd; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .dt { white-space: nowrap; color: #444; width: 13mm; }
  .cat { color: #666; font-size: 8pt; width: 38mm; }
  tr.est td { color: #444; }
  .tag { font-size: 6.8pt; text-transform: uppercase; letter-spacing: .05em; border: .5pt solid #999;
         padding: 0 1mm; color: #555; white-space: nowrap; }
  .tag.alerta { border-color: #111; background: #111; color: #fff; }
  tfoot td { border-top: 1.2pt solid #111; border-bottom: none; font-weight: 700; padding-top: 2mm; }
  .nota { font-size: 8.5pt; color: #555; margin: 0 0 2.5mm; }
  .bloco { page-break-inside: avoid; margin-bottom: 6mm; }
  ul { margin: 0 0 4mm; padding-left: 5mm; } li { margin-bottom: 1.5mm; font-size: 9pt; }
  .caixa { border: 1pt solid #111; padding: 4mm; margin-bottom: 5mm; }
  footer { margin-top: 8mm; border-top: 1pt solid #111; padding-top: 2mm; font-size: 7.5pt; color: #666; }
</style></head><body>

<header>
  <h1>Contas a Pagar — Agosto/2026</h1>
  <div class="sub">Bula Assessoria Pecuaria Ltda · posicao de 11/08/2026 · extrato Sicoob conciliado ate 11/08</div>
</header>

<div class="kpis">
  <div class="kpi dark"><div class="l">A pagar ate 31/08</div><div class="v">R$ ${brl(totalAberto)}</div>
    <div class="n">${cp.length} lancamentos em aberto</div></div>
  <div class="kpi"><div class="l">Ja pago em agosto</div><div class="v">R$ ${brl(totalPago)}</div>
    <div class="n">${pagos.length} baixas de 01 a 11/08</div></div>
  <div class="kpi"><div class="l">Total do mes</div><div class="v">R$ ${brl(totalAberto + totalPago)}</div>
    <div class="n">pago + a pagar</div></div>
</div>

<div class="kpis">
  <div class="kpi"><div class="l">Saldo em conta</div><div class="v">R$ ${brl(saldoSicoob)}</div>
    <div class="n">Sicoob 1.056-1 em 11/08${saldoSicredi ? ' · Sicredi R$ ' + brl(saldoSicredi) : ''}</div></div>
  <div class="kpi"><div class="l">A receber ate 31/08</div><div class="v">R$ ${brl(crAberto)}</div>
    <div class="n">${crRaw.length} titulos em aberto</div></div>
  <div class="kpi"><div class="l">Cobertura</div><div class="v">${((saldoSicoob + crAberto) / totalAberto).toFixed(2)}x</div>
    <div class="n">(caixa + a receber) / a pagar</div></div>
</div>

<h2>Onde o dinheiro sai — cronograma</h2>
<table><thead><tr><th>Janela</th><th class="num">Lancamentos</th><th class="num">Valor</th></tr></thead><tbody>
${semanas.map(s => `<tr><td>${s.label}</td><td class="num">${s.n}</td><td class="num">${brl(s.total)}</td></tr>`).join('')}
</tbody><tfoot><tr><td>Total a pagar</td><td class="num">${cp.length}</td><td class="num">${brl(totalAberto)}</td></tr></tfoot></table>

<p class="nota" style="margin-top:3mm">Do total a pagar, <strong>R$ ${brl(totalFirme)}</strong> sao compromissos firmes
(valor ja conhecido) e <strong>R$ ${brl(totalEstimado)}</strong> sao estimativas — guias de imposto ainda nao emitidas
e despesas de leilao que so fecham no fim do mes. As linhas estimadas estao marcadas ao longo do relatorio.</p>

${blocos.filter(b => b.itens.length).map(b => {
  if (b.id !== 'comjul') return `
<h2>${esc(b.titulo)} — R$ ${brl(b.total)}</h2>
${b.nota ? `<p class="nota">${esc(b.nota)}</p>` : ''}
<table><thead><tr><th>Venc.</th><th>Descricao</th><th>Categoria</th><th class="num">Valor</th></tr></thead>
<tbody>${b.itens.map(linha).join('')}</tbody>
<tfoot><tr><td colspan="3">Subtotal</td><td class="num">${brl(b.total)}</td></tr></tfoot></table>`

  // Comissoes: uma secao por assessor, com o leilao que gerou cada parcela.
  const grupos = {}
  for (const c of b.itens) (grupos[c.vendedor || 'SEM ASSESSOR'] ||= []).push(c)
  const ordem = Object.entries(grupos)
    .map(([nome, itens]) => ({ nome, itens, total: itens.reduce((s, c) => s + c.saldo, 0) }))
    .sort((a, b2) => b2.total - a.total)
  const limpa = d => esc(d.replace(/^COMISSAO\s+/i, '').replace(/\s*-\s*[^-()]+\(\d+%\)\s*$/i, ''))
  return `
<h2>${esc(b.titulo)} — R$ ${brl(b.total)}</h2>
${b.nota ? `<p class="nota">${esc(b.nota)}</p>` : ''}
<table class="resumo"><thead><tr><th>Assessor</th><th class="num">Leiloes</th><th class="num">A pagar em 25/08</th></tr></thead>
<tbody>${ordem.map(g => `<tr><td><strong>${esc(g.nome)}</strong></td><td class="num">${g.itens.length}</td><td class="num"><strong>${brl(g.total)}</strong></td></tr>`).join('')}</tbody>
<tfoot><tr><td>Total das comissoes</td><td class="num">${b.itens.length}</td><td class="num">${brl(b.total)}</td></tr></tfoot></table>

${ordem.map(g => `<div class="bloco"><h3>${esc(g.nome)} — R$ ${brl(g.total)}</h3>
<table><thead><tr><th>Venc.</th><th>Leilao que gerou a comissao</th><th class="num">Valor</th></tr></thead>
<tbody>${g.itens.sort((x, y) => y.saldo - x.saldo).map(c => `<tr${c.estimado ? ' class="est"' : ''}>
  <td class="dt">${dia(c.venc)}</td><td>${limpa(c.desc)}</td><td class="num">${brl(c.saldo)}</td></tr>`).join('')}</tbody>
<tfoot><tr><td colspan="2">Subtotal ${esc(g.nome)}</td><td class="num">${brl(g.total)}</td></tr></tfoot></table></div>`).join('')}`
}).join('')}

<h2>Ja pago entre 01 e 11/08 — R$ ${brl(totalPago)}</h2>
<p class="nota">Saida de caixa de agosto, conferida contra o extrato do Sicoob. Os acertos de comissao aparecem
como uma linha por beneficiario, pelo valor que efetivamente saiu no mes.</p>
<table><thead><tr><th>Pago</th><th>Descricao</th><th>Categoria</th><th class="num">Valor</th></tr></thead>
<tbody>${pagos.map(c => `<tr><td class="dt">${dia(c.dt)}</td><td>${esc(c.desc)}${c.n ? ` <span class="tag">${c.n} leiloes</span>` : ''}${c.nota ? `<br><span class="cat">${esc(c.nota)}</span>` : ''}</td><td class="cat">${esc(c.cat)}</td><td class="num">${brl(c.valor)}</td></tr>`).join('')}</tbody>
<tfoot><tr><td colspan="3">Total pago</td><td class="num">${brl(totalPago)}</td></tr></tfoot></table>

<h2>Premissas das estimativas</h2>
<div class="caixa"><ul>
  <li><strong>Comissoes de julho (R$ 47.250,00):</strong> 2% sobre o VGV de cada assessor nos 14 fechamentos de julho.
      Douglas Bispo R$ 22.248, Leonardo Serafim R$ 10.740, Fabio Omena R$ 9.624, Nane R$ 2.748, Peralta R$ 1.080,
      Nane/Fabio R$ 420 e R$ 390 com beneficiario a definir.</li>
  <li><strong>ISSQN R$ 24.524,81 — valor fechado.</strong> Guia 1674646 da SEFAZ de Campo Grande, competencia 07/2026,
      vencimento 17/08. Receita tributada de <strong>R$ 490.496,32</strong> a aliquota de 5,00%.</li>
  <li><strong>Simples Nacional R$ 56.000 — estimativa recalibrada pela guia do ISSQN.</strong> A guia mostrou que a
      base tributada de julho foi quase o dobro da de junho (R$ 490.496,32 contra R$ 251.335,60). Dois metodos
      independentes convergem: a razao DAS/ISSQN se manteve em 2,30 nos ultimos tres meses e daria R$ 56.454;
      a aliquota efetiva do DAS de junho foi 11,40%, o que daria R$ 55.932. A estimativa anterior de R$ 28.000
      olhava a receita que <em>entrou em caixa</em> (R$ 301.988) e nao a receita <em>por competencia</em> — por isso
      ficava pela metade. Confirmar a guia com o contador.</li>
  <li><strong>Expogenetica:</strong> as passagens sao valor firme — os dois bilhetes da ADN Viagens de 22/08
      (R$ 6.178,45, ida 13/08 e volta 24/08 para Uberaba). Alem delas, so a casa/estrutura em Uberaba, R$ 7.000
      no mesmo padrao da Expozebu (2 parcelas de R$ 3.500), com R$ 2.000 ja pagos em 11/08.</li>
  <li><strong>Despesa operacional so em leilao presencial.</strong> Onde o leilao e virtual ninguem viaja e nao ha
      custo — os 3 virtuais de agosto (Nelore Diamante 12/08, Bambu 13/08 e Bambu Selecoes 27/08) entram zerados.
      Sobram dois blocos presenciais fora da janela da Expogenetica:
      <strong>Premium Colonial + Navirai Camparino (21 a 23/08), R$ 3.000</strong> — so hospedagem e diarias, no padrao
      realizado de R$ 990 para 3 pessoas por diaria, ja que a equipe esta em viagem pelos bilhetes da ADN; e
      <strong>Melhoradores 30 Anos em Campo Grande (29/08), R$ 3.200</strong> — passagem propria R$ 2.000 (media das
      passagens pagas em 2026) mais R$ 1.200 de hospedagem e diarias.</li>
  <li><strong>Aluguel do escritorio: fora.</strong> Confirmado no WhatsApp em 11/08 que nao ha aluguel a pagar
      referente ao mes passado — os R$ 3.292,00 foram cancelados. A maquina de cafe (R$ 150,00) fica, mas e a
      ultima cobranca; as recorrencias de setembro a dezembro foram encerradas.</li>
  <li><strong>Reembolso do Douglas R$ 1.800:</strong> espelha o reembolso de 06/07 (R$ 1.772,15). O do Fabio saiu
      de verdade em 07/08 (R$ 4.008,21) e o do Leonardo em 07/08 (R$ 6.141,10) — ja constam como pagos.</li>
</ul></div>

<h2>Pendencias que ainda podem mexer no numero</h2>
<div class="caixa"><ul>
  <li><strong>Bilhetes da ADN Viagens (Adilson).</strong> Os dois de 22/08 estao lancados (Leonardo R$ 1.981,58 +
      Fabio Omena Gaia R$ 4.196,87 = R$ 6.178,45, ida 13/08 e volta 24/08 para Uberaba). Em 30/07 o Adilson informou
      que outros tres bilhetes — Regiane, Luiz Felipe Garcez e Felipe Andrade (Cuiaba/Goiania e volta Goiania/Campo Grande)
      — ainda nao tinham sido pagos. <strong>Confirmar o saldo com ele</strong>: nao ha valor fechado para lancar.</li>
  <li><strong>Comissao do Gustavo Rusa de julho.</strong> O PIX de 10/08 foi de R$ 29.535,00 e os quatro lancamentos
      do ERP somavam R$ 23.490,00. A diferenca de R$ 6.045,00 entrou como complemento ja pago — conferir com a Ana
      quais leiloes de julho a geraram.</li>
  <li><strong>Seis leiloes de agosto estao sem modalidade no cronograma</strong> (Mega Genetica EAO 14/08,
      Matinha Expogenetica 16/08, Genetica Aditiva e Santa Nice 19/08, Femeas JMP 21/08 e Sabia Dourado 30/08).
      Como a despesa operacional so nasce quando alguem viaja, esses eventos estao com custo zero — se algum deles
      for presencial, entra despesa que hoje nao esta prevista.</li>
  <li><strong>Energia eletrica do escritorio</strong> esta cadastrada com valor zero. Lancar a fatura quando chegar.</li>
  <li><strong>R$ 390,00 de comissao sem beneficiario</strong> no 20o Guadalupe Touros (lote de R$ 19.500 com assessor
      "a definir"), alem de R$ 147.600 de VGV no Nelore Santa Cruz de 19/07 sem assessor atribuido — esse segundo caso
      nao gerou comissao e pode virar cobranca depois.</li>
  <li><strong>Nane — R$ 3.168,00 acumulados para dezembro.</strong> Ela nao recebe mes a mes: a comissao fica
      contabilizada a parte e sai de uma vez em 28/12. Julho foi o primeiro mes com venda dela, entao esse e o
      montante acumulado ate agora (R$ 2.748,00 do 20o Guadalupe Touros mais R$ 420,00 de um lote compartilhado).
      <strong>Esse lote compartilhado com o Fabio Omena precisa de divisao definida</strong> — se for meio a meio,
      R$ 210,00 sao do Fabio e poderiam sair ja em 25/08, em vez de esperar dezembro.</li>
  <li><strong>Peralta</strong> aparece com comissao em julho (R$ 1.080) mas esta como inativo no cadastro da equipe.
      Confirmar se segue no mesmo criterio de pagamento.</li>
</ul></div>

<footer>
  Gerado em ${dia(HOJE)}/2026 a partir do ERP da Bula. Fonte de caixa: extrato Sicoob conciliado ate 11/08/2026
  (saldo R$ ${brl(saldoSicoob)}, batendo com o banco). Valores marcados como "estimado" sao projecoes com premissa declarada.
</footer>
</body></html>`

const htmlPath = path.join(OUTDIR, 'contas-a-pagar-agosto-2026.html')
fs.writeFileSync(htmlPath, html)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
const pdfPath = path.join(OUTDIR, 'Contas-a-Pagar-Agosto-2026-Bula.pdf')
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true,
  margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' } })
await browser.close()

console.log('HTML: ' + htmlPath)
console.log('PDF : ' + pdfPath)
console.log('A pagar ate 31/08: R$ ' + brl(totalAberto) + '  (firme R$ ' + brl(totalFirme) + ' + estimado R$ ' + brl(totalEstimado) + ')')
console.log('Ja pago em agosto: R$ ' + brl(totalPago))
console.log('Total do mes:      R$ ' + brl(totalAberto + totalPago))
