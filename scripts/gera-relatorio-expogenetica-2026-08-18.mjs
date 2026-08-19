/**
 * RELATÓRIO EXPOGENÉTICA 2026 — custo x resultado da Bula Assessoria.
 *
 * Pedido do chefe (18/08, WhatsApp): "relação de custo Expogenética até agora:
 * hospedagem, passagem e expectativa de reembolso" + leitura do João: "tenho a
 * impressão que essa Expogenética não vai se pagar".
 *
 * Fontes (nada é digitado à mão, exceto as PREMISSAS marcadas):
 *   - erp_contas_pagar        -> custos pagos e comprometidos
 *   - bula_leilao_fechamento  -> cobertura vendida pela Bula (alinhada ao HastaPro FIL 2)
 *   - erp_contas_receber      -> receita provisionada e critério de cobrança
 *   - cronograma_leiloes      -> agenda da feira
 *
 * Saída:
 *   outputs/relatorio-expogenetica-2026/{dados.json,relatorio.html}
 *   <Desktop>/Bula - Expogenetica 2026 - Custo x Resultado - 18-08-2026.{pdf,xlsx}
 */
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const DESKTOP = 'C:/Users/Notebook-Acer/Desktop'
const OUT = 'outputs/relatorio-expogenetica-2026'
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brl = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const brl0 = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const pct = n => `${(Number(n || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

const D = { gerado: '2026-08-18' }

/* ═══════ PREMISSAS — o que não está no ERP (aparece marcado no relatório) ═══ */
const P = {
  casaTotal: 9000,           // informado pelo João (18/08). ERP só tem a 1ª parcela de 2.000.
  uniformesTotal: 480,       // informado pelo João (18/08). ERP só tem a entrada de 240.
  reembolsoBase: 9000,
  reembolsoMin: 7000,
  reembolsoMax: 12000,
  pessoasCampo: 4,           // Fábio Omena, Leonardo Serafim, Douglas Bispo, Marcelo
  diasCasa: 10,              // casa de 14 a 24/08 (logística no grupo de assessores, 11/08)
  aliquota: 0.18,            // imposto sobre receita (critério dos fechamentos do ERP)
  comissaoPadrao: 0.02,      // assessor Bula
  comissaoRusa: 0.05,        // parceiro Gustavo Rusa (regra: paga-se Rusa OU o assessor)
  fixoMesEquipeCampo: 24100, // salários jul/26 pagos 03/08: Leonardo 13.500 + Fábio 7.000 + Douglas 3.600
}

/* ═══════ 1. CUSTOS ═════════════════════════════════════════════════════════ */
const { data: cps } = await sb.from('erp_contas_pagar').select('*')
  .gte('vencimento', '2026-07-01').lte('vencimento', '2026-09-30')
const acha = frag => cps.find(c => c.descricao.toUpperCase().includes(frag.toUpperCase()) && c.status !== 'cancelado')

// Os dois PIX de 17/07 para a ADN Viagens (Marcelo R$ 2.081,92 e Leo R$ 2.421,43), cujo memo
// dizia "EXPOGENETICA", foram excluidos a pedido do Joao em 18/08: nao sao desta feira.
// Continuam no ERP com a tag despesa-multi-leilao apontando para Terra Brava/Matinha — reclassificar.
const CUSTO_IDS = [
  { k: 'Despesas EXPOGENETICA - casa/estrutura', rot: 'Casa em Uberaba — 1ª parcela', quem: 'Locador Uberaba' },
  { k: 'ENTRADA UNIFORMES EXPOGENETICA', rot: 'Uniformes da equipe — entrada', quem: '68.392.671/0001-89' },
  { k: 'REEMBOLSO BULA REMATES - reemissao', rot: 'Reemissão de passagens (reembolso Bula Remates)', quem: 'Bula Remates' },
  { k: 'BILHETE/BOLETO - LEONARDO FRANCISCO', rot: 'Bilhete aéreo — Leonardo Francisco', quem: 'ADN Viagens' },
  { k: 'BILHETE/BOLETO - FABIO OMENA GAIA', rot: 'Bilhete aéreo — Fábio Omena Gaia', quem: 'ADN Viagens' },
]

D.custos = CUSTO_IDS.map(({ k, rot, quem }) => {
  const c = acha(k)
  if (!c) throw new Error(`CP não encontrada no ERP: ${k}`)
  return {
    data: (c.data_pagamento || c.vencimento).slice(0, 10),
    item: rot, quem, valor: Number(c.valor),
    situacao: c.status === 'pago' ? 'pago' : 'agendado',
    fonte: 'ERP · contas a pagar',
  }
})

const casaPaga = D.custos.filter(c => /Casa em Uberaba/.test(c.item)).reduce((s, c) => s + c.valor, 0)
const unifPago = D.custos.filter(c => /Uniformes/.test(c.item)).reduce((s, c) => s + c.valor, 0)
D.casaPaga = casaPaga
D.unifPago = unifPago
D.custos.push({
  data: 'até 24/08', item: 'Casa em Uberaba — saldo do aluguel', quem: 'Locador Uberaba',
  valor: r2(P.casaTotal - casaPaga), situacao: 'a pagar', fonte: `Total de ${brl0(P.casaTotal)} informado pelo João`,
})
D.custos.push({
  data: 'a definir', item: 'Uniformes da equipe — saldo', quem: '68.392.671/0001-89',
  valor: r2(P.uniformesTotal - unifPago), situacao: 'a pagar', fonte: `Total de ${brl0(P.uniformesTotal)} informado pelo João`,
})
D.custos.push({
  data: 'set/2026', item: 'Reembolso da equipe (prestação de contas)', quem: 'Fábio, Leonardo, Douglas, Marcelo',
  valor: P.reembolsoBase, situacao: 'estimado', fonte: 'Estimativa — critério na seção 02',
})

D.custoPago = r2(D.custos.filter(c => c.situacao === 'pago').reduce((s, c) => s + c.valor, 0))
D.custoAgendado = r2(D.custos.filter(c => c.situacao === 'agendado' || c.situacao === 'a pagar').reduce((s, c) => s + c.valor, 0))
D.custoEstimado = r2(D.custos.filter(c => c.situacao === 'estimado').reduce((s, c) => s + c.valor, 0))
D.custoTotal = r2(D.custoPago + D.custoAgendado + D.custoEstimado)
D.custoMin = r2(D.custoTotal - P.reembolsoBase + P.reembolsoMin)
D.custoMax = r2(D.custoTotal - P.reembolsoBase + P.reembolsoMax)
D.custoConfirmado = r2(D.custoPago + D.custoAgendado)
D.passagensTotal = r2(D.custos.filter(c => /Passagem|Bilhete|Reemissão/.test(c.item)).reduce((s, c) => s + c.valor, 0))

/* ═══════ 2. O QUE A FEIRA JÁ ENTREGOU ══════════════════════════════════════ */
const { data: fech } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,vgv_total,lotes_vendidos,animais_vendidos,por_assessor,compradores')
  .gte('data', '2026-08-10').lte('data', '2026-08-23').order('data')
const { data: crs } = await sb.from('erp_contas_receber').select('descricao,valor,vencimento,observacoes,status')
  .gte('vencimento', '2026-09-20').lte('vencimento', '2026-10-15')

const crDo = frag => crs.find(c => c.descricao.toUpperCase().includes(frag.toUpperCase()))
const fechDe = frag => fech.find(f => f.nome.toUpperCase().includes(frag.toUpperCase()))

const REALIZADOS = [
  { data: '2026-08-10', nome: 'Leilão Guadalupe Agropecuária', frag: null },
  { data: '2026-08-12', nome: 'Leilão Elo de Prova (RG, Sino e Beem)', frag: null },
  { data: '2026-08-14', nome: 'Mega Genética EAO', frag: null },
  { data: '2026-08-15', nome: 'Terra Brava Agropecuária', frag: 'TERRA BRAVA', crFrag: 'TERRA BRAVA' },
  { data: '2026-08-16', nome: 'Matinha Expogenética', frag: 'MATINHA', crFrag: 'MATINHA' },
  { data: '2026-08-17', nome: 'Matrizes Premium KatiSpera', frag: 'KATISPERA', crFrag: 'KATISPERA (17' },
  { data: '2026-08-18', nome: 'Nelore Mafra Agronova & Amigos', frag: null },
]

D.realizados = REALIZADOS.map(l => {
  const f = l.frag ? fechDe(l.frag) : null
  const cr = l.crFrag ? crDo(l.crFrag) : null
  return {
    data: l.data, nome: l.nome,
    cobertura: f ? Number(f.vgv_total) : 0,
    lotes: f ? f.lotes_vendidos : 0,
    receita: cr ? Number(cr.valor) : 0,
    criterio: cr?.observacoes?.match(/×\s*([\d.,]+%)/)?.[1] || '—',
    recebimento: cr ? cr.vencimento.slice(0, 10) : '—',
    obs: f ? '' : 'sem venda registrada pela Bula',
  }
})
D.coberturaRealizada = r2(D.realizados.reduce((s, l) => s + l.cobertura, 0))
D.receitaRealizada = r2(D.realizados.reduce((s, l) => s + l.receita, 0))
D.lotesRealizados = D.realizados.reduce((s, l) => s + (l.lotes || 0), 0)
D.leiloesComVenda = D.realizados.filter(l => l.cobertura > 0).length
D.leiloesZerados = D.realizados.length - D.leiloesComVenda

/* ═══════ 3. COMISSÕES ══════════════════════════════════════════════════════ */
// Só os leilões da agenda da feira — o Essência Genética de 13/08 é virtual (e-Rural), fora dela.
const NA_FEIRA = ['TERRA BRAVA', 'MATINHA', 'KATISPERA']
const comissoesERP = []
for (const f of fech.filter(x => NA_FEIRA.some(n => x.nome.toUpperCase().includes(n)))) {
  for (const a of (f.por_assessor || [])) {
    comissoesERP.push({ leilao: f.nome, quem: a.nome, base: Number(a.vgv), pctv: a.comissao_pct, valor: r2(Number(a.comissao)) })
  }
}
D.comissoesERP = comissoesERP
D.comissaoERPTotal = r2(comissoesERP.reduce((s, c) => s + c.valor, 0))

// Lotes anunciados no grupo "Lances Bula" com direcionamento técnico do Gustavo Rusa
D.rusaLotes = [
  { leilao: 'Matinha Expogenética', lote: '12', vgv: 108000 },
  { leilao: 'Matinha Expogenética', lote: '15', vgv: 93000 },
  { leilao: 'Matinha Expogenética', lote: '34', vgv: 90000 },
  { leilao: 'Matinha Expogenética', lote: '22', vgv: 87000 },
  { leilao: 'Matrizes Premium KatiSpera', lote: '3', vgv: 117000 },
]
D.rusaBase = r2(D.rusaLotes.reduce((s, l) => s + l.vgv, 0))
D.rusaPctCobertura = r2(D.rusaBase / D.coberturaRealizada)
D.comissaoCenarioRusa = r2(D.comissaoERPTotal - D.rusaBase * P.comissaoPadrao + D.rusaBase * P.comissaoRusa)
D.rusaImpacto = r2(D.comissaoCenarioRusa - D.comissaoERPTotal)

/* ═══════ 4. RESULTADO DO QUE JÁ ACONTECEU ══════════════════════════════════ */
const resultado = (receita, comissao, custo) => {
  const imposto = r2(receita * P.aliquota)
  return { receita: r2(receita), comissao: r2(comissao), imposto, custo: r2(custo), resultado: r2(receita - comissao - imposto - custo) }
}
D.parcialERP = resultado(D.receitaRealizada, D.comissaoERPTotal, D.custoTotal)
D.parcialRusa = resultado(D.receitaRealizada, D.comissaoCenarioRusa, D.custoTotal)

/* ═══════ 5. PROJEÇÃO 19 a 23/08 ════════════════════════════════════════════ */
const RESTANTES = [
  { data: '2026-08-19', nome: '9º Genética Aditiva Expogenética', cob: 150000, pctEfetivo: 0.0950, base: 'jul/26: R$ 27.762,65 sobre cobertura de R$ 292.200 (2 etapas)' },
  { data: '2026-08-19', nome: 'Reserva Expogenética Santa Nice', cob: 150000, pctEfetivo: 0.0436, base: 'jun/26: R$ 15.030 sobre cobertura de R$ 345.000' },
  { data: '2026-08-20', nome: 'Nelore Paranã e Casabranca', cob: 250000, pctEfetivo: 0.0500, base: '09/08/26: 5% sobre cobertura de R$ 278.100' },
  { data: '2026-08-21', nome: '12º Premium Colonial', cob: 100000, pctEfetivo: 0.0500, base: 'sem histórico — usado o padrão de 5% da cobertura' },
  { data: '2026-08-21', nome: 'Fêmeas JMP', cob: 150000, pctEfetivo: null, receitaFixa: true, base: 'acordo JMP/JBJ paga 0,5% do FATURAMENTO TOTAL. 10º JMP (jun): R$ 116.968 só nas fêmeas/bezerras' },
  { data: '2026-08-22', nome: 'Naviraí Camparino — Bezerras e Novilhas', cob: 160000, pctEfetivo: 0.0520, base: 'média Camparino/Naviraí 2026: R$ 26.579 sobre R$ 510.800' },
  { data: '2026-08-23', nome: '28º Naviraí Camparino — Reprodutores', cob: 150000, pctEfetivo: 0.0520, base: 'média Camparino/Naviraí 2026: R$ 26.579 sobre R$ 510.800' },
]
const projeta = (fator, jmp) => {
  const linhas = RESTANTES.map(l => {
    const cob = r2(l.cob * fator)
    return { ...l, cobProjetada: cob, receitaProjetada: l.receitaFixa ? jmp : r2(cob * l.pctEfetivo) }
  })
  const cobertura = r2(linhas.reduce((s, l) => s + l.cobProjetada, 0))
  const receita = r2(linhas.reduce((s, l) => s + l.receitaProjetada, 0))
  return { linhas, cobertura, receita, comissao: r2(cobertura * P.comissaoPadrao) }
}
const CEN = {
  conservador: { fator: 0.6, jmp: 20000 },
  base: { fator: 1.0, jmp: 40000 },
  otimista: { fator: 1.4, jmp: 80000 },
}
D.projecaoBase = projeta(CEN.base.fator, CEN.base.jmp)
D.cenarios = Object.entries(CEN).map(([nome, c]) => {
  const p = projeta(c.fator, c.jmp)
  const rERP = resultado(D.receitaRealizada + p.receita, D.comissaoERPTotal + p.comissao, D.custoTotal)
  const rRusa = resultado(D.receitaRealizada + p.receita, D.comissaoCenarioRusa + p.comissao, D.custoTotal)
  return {
    nome, fator: c.fator, jmp: c.jmp,
    coberturaRestante: p.cobertura, receitaRestante: p.receita,
    coberturaFeira: r2(D.coberturaRealizada + p.cobertura),
    ...rERP, resultadoRusa: rRusa.resultado,
  }
})

/* ═══════ 6. PONTO DE EQUILÍBRIO ════════════════════════════════════════════ */
D.margemUnitaria = r2(0.05 - P.comissaoPadrao - 0.05 * P.aliquota)
D.margemUnitariaRusa = r2(0.05 - P.comissaoRusa - 0.05 * P.aliquota)
D.coberturaEquilibrio = r2(D.custoTotal / D.margemUnitaria)
D.pctEquilibrioFeito = r2(D.coberturaRealizada / D.coberturaEquilibrio)
D.faltaCobertura = r2(D.coberturaEquilibrio - D.coberturaRealizada)

/* ═══════ 7. CAIXA ══════════════════════════════════════════════════════════ */
D.caixa = {
  saiuJulho: r2(D.custos.filter(c => c.data.startsWith('2026-07')).reduce((s, c) => s + c.valor, 0)),
  saiAgosto: r2(D.custos.filter(c => c.data.startsWith('2026-08') || c.data === 'até 24/08').reduce((s, c) => s + c.valor, 0)),
  saiSetembro: r2(P.reembolsoBase + D.comissaoERPTotal),
  primeiraEntrada: D.realizados.filter(l => l.recebimento !== '—').map(l => l.recebimento).sort()[0],
}
D.caixa.giroNegativo = r2(D.caixa.saiuJulho + D.caixa.saiAgosto + D.caixa.saiSetembro)

D.folhaAlocada = r2(P.fixoMesEquipeCampo * (P.diasCasa / 30))
D.parcialComFolha = r2(D.parcialERP.resultado - D.folhaAlocada)

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify({ P, ...D }, null, 1))

/* ═══════ 8. HTML ═══════════════════════════════════════════════════════════ */
const logo = fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const sinal = n => n < 0 ? 'neg' : 'pos'
const dt = s => /^\d{4}-/.test(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) : s

const linhasCusto = D.custos.map(c => `<tr class="${c.situacao === 'estimado' ? 'est' : ''}">
  <td>${dt(c.data)}</td><td>${c.item}</td><td class="sub">${c.quem}</td>
  <td class="num">${brl(c.valor)}</td>
  <td><span class="tag t-${c.situacao.replace(/ /g, '')}">${c.situacao}</span></td></tr>`).join('')

const linhasReal = D.realizados.map(l => `<tr class="${l.cobertura ? '' : 'zero'}">
  <td>${dt(l.data)}</td><td>${l.nome}</td>
  <td class="num">${l.cobertura ? brl0(l.cobertura) : '—'}</td>
  <td class="num">${l.lotes || '—'}</td>
  <td class="num">${l.receita ? brl(l.receita) : '—'}</td>
  <td class="num sub">${l.criterio}</td>
  <td class="sub">${l.receita ? dt(l.recebimento) : l.obs}</td></tr>`).join('')

const linhasProj = D.projecaoBase.linhas.map(l => `<tr>
  <td>${dt(l.data)}</td><td>${l.nome}</td>
  <td class="num">${brl0(l.cobProjetada)}</td>
  <td class="num">${l.pctEfetivo ? pct(l.pctEfetivo) : '0,5% s/ faturamento'}</td>
  <td class="num">${brl0(l.receitaProjetada)}</td>
  <td class="sub small">${l.base}</td></tr>`).join('')

const linhasCen = D.cenarios.map(c => `<tr>
  <td><b>${c.nome[0].toUpperCase() + c.nome.slice(1)}</b><div class="sub small">cobertura a ${Math.round(c.fator * 100)}% da base · JMP ${brl0(c.jmp)}</div></td>
  <td class="num">${brl0(c.coberturaFeira)}</td>
  <td class="num">${brl0(c.receita)}</td>
  <td class="num">${brl0(c.comissao)}</td>
  <td class="num">${brl0(c.imposto)}</td>
  <td class="num">${brl0(c.custo)}</td>
  <td class="num ${sinal(c.resultado)}"><b>${brl0(c.resultado)}</b></td>
  <td class="num ${sinal(c.resultadoRusa)}">${brl0(c.resultadoRusa)}</td></tr>`).join('')

const linhasComissao = D.comissoesERP.map(c => `<tr>
  <td>${c.leilao.replace('LEILÃO ', '')}</td><td>${c.quem}</td>
  <td class="num">${brl0(c.base)}</td><td class="num">${pct(c.pctv)}</td>
  <td class="num">${brl(c.valor)}</td></tr>`).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, Arial, sans-serif; color: #16181d; font-size: 8.9pt; line-height: 1.4; }
  .page { padding: 9mm 12mm; }
  .brk { page-break-before: always; }
  h1, h2, h3, .k { font-family: Oswald, Arial, sans-serif; text-transform: uppercase; letter-spacing: .04em; font-weight: 500; }
  header { background: #0c0d10; color: #fff; padding: 9mm 12mm 7mm; }
  header img { height: 34px; opacity: .95; }
  header h1 { font-size: 20pt; margin-top: 5mm; line-height: 1.05; }
  header .sub { color: #9aa0aa; font-size: 8.6pt; margin-top: 3mm; }
  header .gold { color: #C9A84C; }
  h2 { font-size: 12pt; margin: 5mm 0 2.4mm; padding-bottom: 1.6mm; border-bottom: 1.6pt solid #0c0d10; }
  h2 .n { color: #C9A84C; margin-right: 3mm; }
  h3 { font-size: 9.6pt; margin: 5mm 0 2mm; color: #3d424c; }
  p { margin-bottom: 2.4mm; }
  .lead { font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; margin: 2.5mm 0 3mm; }
  th { font-family: Oswald, Arial, sans-serif; text-transform: uppercase; font-size: 7.4pt; letter-spacing: .05em;
       text-align: left; color: #5a616e; border-bottom: 1pt solid #c9ccd2; padding: 1.8mm 2mm; font-weight: 500; }
  td { padding: 1.5mm 2mm; border-bottom: .4pt solid #e6e8ec; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sub { color: #6b727f; }
  .small { font-size: 7.6pt; line-height: 1.3; }
  tr.zero td { color: #9aa0aa; }
  tr.est td { background: #fbf7ec; }
  tfoot td { border-top: 1.2pt solid #0c0d10; border-bottom: none; font-weight: 600; padding-top: 2.2mm; }
  .tag { font-family: Oswald, Arial, sans-serif; font-size: 6.8pt; text-transform: uppercase; letter-spacing: .05em;
         padding: .6mm 2mm; border-radius: 2mm; white-space: nowrap; }
  .t-pago { background: #e8f0e9; color: #2f6b3c; }
  .t-agendado, .t-apagar { background: #eceef2; color: #444a55; }
  .t-estimado { background: #f6ecd2; color: #8a6a12; }
  .cards { display: flex; gap: 3mm; margin: 3mm 0 1mm; }
  .card { flex: 1; border: .6pt solid #d5d8de; border-radius: 2mm; padding: 2.6mm; }
  .card .k { font-size: 7.2pt; color: #6b727f; }
  .card .v { font-family: Oswald, Arial, sans-serif; font-size: 14pt; margin-top: 1.2mm; }
  .card .d { font-size: 7.4pt; color: #6b727f; margin-top: .8mm; line-height: 1.3; }
  .card.dark { background: #0c0d10; border-color: #0c0d10; }
  .card.dark .k { color: #9aa0aa; } .card.dark .v { color: #fff; } .card.dark .d { color: #9aa0aa; }
  .neg { color: #a12a24; } .pos { color: #2f6b3c; }
  .card .v.neg { color: #e0655c; }
  .box { border-left: 2.4pt solid #C9A84C; background: #faf7f0; padding: 2.6mm 3.6mm; margin: 2.6mm 0; }
  .box.alert { border-left-color: #a12a24; background: #fdf3f2; }
  .box .k { font-size: 8.4pt; margin-bottom: 1.4mm; }
  ul { margin: 1mm 0 2mm 4.5mm; } li { margin-bottom: 1.2mm; }
  footer { margin-top: 7mm; padding-top: 2.5mm; border-top: .6pt solid #d5d8de; font-size: 7.4pt; color: #8b919c; }
</style></head><body>

<header>
  <img src="data:image/png;base64,${logo}">
  <h1>Expogenética 2026<br><span class="gold">Custo × Resultado</span></h1>
  <div class="sub">Bula Assessoria · apuração fechada em 18/08/2026 · 7 dos 14 leilões da agenda já realizados<br>
  Fonte: ERP (contas a pagar e a receber), fechamentos alinhados ao HastaPro FIL 2 e grupo Lances Bula.</div>
</header>

<div class="page">

<h2><span class="n">01</span>A resposta curta</h2>
<p class="lead">Sua impressão está certa. Com o que já aconteceu, a Expogenética está <b>no vermelho</b>:
os ${D.leiloesComVenda} leilões em que a Bula vendeu geraram <b>${brl(D.receitaRealizada)}</b> de receita,
enquanto a feira já custou <b>${brl(D.custoTotal)}</b> — e sobre a receita ainda incidem comissão e imposto.
Resultado parcial: <b class="${sinal(D.parcialERP.resultado)}">${brl(D.parcialERP.resultado)}</b>.
A feira só vira positiva se os 7 leilões de 19 a 23/08 entregarem.</p>

<div class="cards">
  <div class="card dark"><div class="k">Custo da feira</div><div class="v">${brl0(D.custoTotal)}</div>
    <div class="d">${brl0(D.custoConfirmado)} confirmados + ${brl0(D.custoEstimado)} de reembolso estimado<br>faixa de ${brl0(D.custoMin)} a ${brl0(D.custoMax)}</div></div>
  <div class="card"><div class="k">Receita até agora</div><div class="v">${brl0(D.receitaRealizada)}</div>
    <div class="d">sobre ${brl0(D.coberturaRealizada)} de cobertura vendida<br>entra a partir de ${dt(D.caixa.primeiraEntrada)}</div></div>
  <div class="card"><div class="k">Comissão + imposto</div><div class="v">${brl0(D.parcialERP.comissao + D.parcialERP.imposto)}</div>
    <div class="d">${brl0(D.parcialERP.comissao)} de comissão (2%) e ${brl0(D.parcialERP.imposto)} de imposto (18%)</div></div>
  <div class="card"><div class="k">Resultado parcial</div><div class="v ${sinal(D.parcialERP.resultado)}">${brl0(D.parcialERP.resultado)}</div>
    <div class="d">${brl0(D.parcialRusa.resultado)} se a comissão do Rusa entrar a 5%</div></div>
</div>

<h2><span class="n">02</span>O custo, item a item</h2>
<table>
  <thead><tr><th>Data</th><th>Item</th><th>Fornecedor</th><th class="num">Valor</th><th>Situação</th></tr></thead>
  <tbody>${linhasCusto}</tbody>
  <tfoot>
    <tr><td colspan="3">Pago até hoje</td><td class="num">${brl(D.custoPago)}</td><td></td></tr>
    <tr><td colspan="3">Comprometido (agendado ou a pagar)</td><td class="num">${brl(D.custoAgendado)}</td><td></td></tr>
    <tr><td colspan="3">Reembolso estimado da equipe</td><td class="num">${brl(D.custoEstimado)}</td><td></td></tr>
    <tr><td colspan="3"><b>Custo total da Expogenética</b></td><td class="num"><b>${brl(D.custoTotal)}</b></td><td></td></tr>
  </tfoot>
</table>
<p class="sub small">Passagens somam ${brl(D.passagensTotal)} · hospedagem ${brl0(P.casaTotal)} · uniformes ${brl0(P.uniformesTotal)} · reembolso estimado ${brl0(P.reembolsoBase)}.</p>

</div>

<div class="page brk">

<h2><span class="n">02b</span>A estimativa de reembolso</h2>
<h3>Como cheguei aos ${brl0(P.reembolsoBase)} de reembolso</h3>
<p>Não há prestação de contas fechada. A estimativa parte de ${P.pessoasCampo} pessoas em campo por ${P.diasCasa} dias
com a hospedagem já paga (a casa cobre de 14 a 24/08), restando alimentação, deslocamento local e extras.
Âncoras do próprio ERP: reembolsos de julho pagos em 07/08 — Leonardo ${brl0(6141.10)} e Fábio ${brl0(4008.21)};
Douglas ${brl0(1772.15)} por dois leilões presenciais em junho; diárias do Matheus ${brl0(2700)} no mês.
Trabalho com <b>${brl0(P.reembolsoBase)}</b>, em uma faixa de ${brl0(P.reembolsoMin)} a ${brl0(P.reembolsoMax)}.</p>

<div class="box">
  <div class="k">Comparação: a casa da Expozebu custou menos</div>
  A casa de Uberaba da Expozebu saiu em duas parcelas e a última, de ${brl0(3500)}, foi paga em 29/04
  ("Final casa Uberaba 2de2" no extrato) — algo em torno de ${brl0(7000)} no total.
  A desta Expogenética está em ${brl0(P.casaTotal)}, cerca de ${Math.round((P.casaTotal / 7000 - 1) * 100)}% acima.
</div>

<h2><span class="n">03</span>O que a feira já entregou</h2>
<table>
  <thead><tr><th>Data</th><th>Leilão</th><th class="num">Cobertura Bula</th><th class="num">Lotes</th><th class="num">Receita Bula</th><th class="num">Critério</th><th>Recebe em</th></tr></thead>
  <tbody>${linhasReal}</tbody>
  <tfoot><tr><td colspan="2">Total — 7 leilões realizados</td>
    <td class="num">${brl0(D.coberturaRealizada)}</td><td class="num">${D.lotesRealizados}</td>
    <td class="num">${brl(D.receitaRealizada)}</td><td colspan="2"></td></tr></tfoot>
</table>
<p class="sub small">Cobertura = valor dos lotes vendidos pela assessoria da Bula (fechamento alinhado ao HastaPro FIL 2).
Receita Bula = o que se cobra do criador ou da leiloeira, já provisionado em contas a receber com vencimento de leilão + 45 dias.</p>

<div class="box alert">
  <div class="k">${D.leiloesZerados} dos 7 leilões não renderam nada</div>
  Guadalupe (10/08), Elo de Prova (12/08), Mega Genética EAO (14/08) e Mafra Agronova (18/08) passaram sem uma
  única venda registrada pela Bula — nem no HastaPro, nem no grupo Lances Bula. Só o EAO movimentou
  ${brl0(4742800)} de VGV oficial na feira. A equipe estava em campo, com casa e passagem pagas, nesses quatro dias.
</div>

</div>

<div class="page brk">

<h2><span class="n">04</span>Comissões já comprometidas</h2>
<table>
  <thead><tr><th>Leilão</th><th>Quem</th><th class="num">Base</th><th class="num">%</th><th class="num">Comissão</th></tr></thead>
  <tbody>${linhasComissao}</tbody>
  <tfoot><tr><td colspan="4">Total (vence 25/09, exceto a da Nane em 28/12)</td><td class="num">${brl(D.comissaoERPTotal)}</td></tr></tfoot>
</table>
<p class="sub small">A comissão do KatiSpera (17/08) ainda não virou conta a pagar — o fechamento entrou pelo grupo de lances e
o HastaPro ainda não registrou o leilão. Pelos 2% padrão seriam ${brl(117000 * 0.02)}.</p>

<div class="box alert">
  <div class="k">O que explica o resultado: ${pct(D.rusaPctCobertura)} da venda saiu com direcionamento do Gustavo Rusa</div>
  <p>Dos ${brl0(D.coberturaRealizada)} vendidos, <b>${brl0(D.rusaBase)}</b> vêm de lotes anunciados no grupo como
  "com direcionamento técnico Gustavo Rusa" — Matinha lotes 12, 15, 34 e 22 (Nelore Pérola / José Fábio) e o lote 3 do KatiSpera.
  A regra registrada no ERP é explícita: <i>paga-se o Rusa OU o assessor no mesmo lote</i>, e o Rusa recebe <b>5%</b>.</p>
  <p>Nesses lotes a Bula recebe cerca de 5% do criador e paga 5% ao parceiro: <b>trabalha de graça e ainda recolhe imposto sobre a receita</b>.
  Aplicada a regra, a comissão sobe de ${brl0(D.comissaoERPTotal)} para ${brl0(D.comissaoCenarioRusa)}
  (${brl0(D.rusaImpacto)} a mais) e o resultado parcial cai para <b class="neg">${brl0(D.parcialRusa.resultado)}</b>.</p>
  <p><b>Precisa de decisão:</b> confirmar se esses compradores são clientes do Rusa antes de fechar as comissões de setembro.</p>
</div>

</div>

<div class="page brk">

<h2><span class="n">05</span>O que ainda pode entrar — 19 a 23/08</h2>
<p>Sete leilões restantes. A cobertura projetada usa o porte histórico de cada criador; a receita usa o
percentual efetivo que aquele criador já pagou à Bula em 2026 — não um percentual de tabela.</p>
<table>
  <thead><tr><th>Data</th><th>Leilão</th><th class="num">Cobertura projetada</th><th class="num">% efetivo</th><th class="num">Receita projetada</th><th>Base do percentual</th></tr></thead>
  <tbody>${linhasProj}</tbody>
  <tfoot><tr><td colspan="2">Cenário base</td><td class="num">${brl0(D.projecaoBase.cobertura)}</td><td></td>
    <td class="num">${brl0(D.projecaoBase.receita)}</td><td></td></tr></tfoot>
</table>

<h2><span class="n">06</span>Como a feira fecha</h2>
<table>
  <thead><tr><th>Cenário</th><th class="num">Cobertura da feira</th><th class="num">Receita</th><th class="num">Comissão</th><th class="num">Imposto</th><th class="num">Custo</th><th class="num">Resultado</th><th class="num">Se Rusa a 5%</th></tr></thead>
  <tbody>${linhasCen}</tbody>
</table>
<p class="sub small">Comissão dos leilões restantes a 2% da cobertura projetada. Imposto de 18% sobre a receita, mesmo critério
dos fechamentos do ERP. Custo fixo em ${brl0(D.custoTotal)} nos três cenários.</p>

<div class="box">
  <div class="k">Ponto de equilíbrio: ${brl0(D.coberturaEquilibrio)} de cobertura na feira inteira</div>
  <p>No regime normal a Bula recebe ~5% da cobertura, paga 2% ao assessor e 18% de imposto sobre a receita —
  sobram <b>${pct(D.margemUnitaria)}</b> de cada real vendido. Para cobrir ${brl0(D.custoTotal)} de custo,
  a feira precisa de <b>${brl0(D.coberturaEquilibrio)}</b> de cobertura.
  Já foram ${brl0(D.coberturaRealizada)} — <b>${pct(D.pctEquilibrioFeito)}</b> do necessário.
  Faltam ${brl0(D.faltaCobertura)} em sete leilões, ou ${brl0(D.faltaCobertura / 7)} por leilão;
  a média realizada até aqui foi de ${brl0(D.coberturaRealizada / 7)}.</p>
  <p>Nos lotes com o Rusa a 5% a margem unitária é <b class="neg">${pct(D.margemUnitariaRusa)}</b> — vender mais nessa
  condição aumenta o prejuízo em vez de reduzir.</p>
</div>

</div>

<div class="page brk">

<h2><span class="n">07</span>O efeito no caixa</h2>
<p>O custo sai agora e a receita entra em outubro. Saem ${brl0(D.caixa.saiAgosto)} em agosto
(casa, uniformes e bilhetes aéreos) e ${brl0(D.caixa.saiSetembro)} em setembro
(reembolso e comissões em 25/09). A primeira entrada é só em <b>${dt(D.caixa.primeiraEntrada)}</b>,
e os ${brl0(D.receitaRealizada)} se completam em outubro.
Em caixa, a feira é um desembolso de cerca de ${brl0(D.caixa.giroNegativo)} antes da primeira cobrança ser paga.</p>

<h3>Leitura mais dura: com o custo da equipe</h3>
<p>Os ${brl0(D.custoTotal)} são só o desembolso extra. Somando ${P.diasCasa} dias dos salários dos assessores
que ficaram em campo (${brl0(P.fixoMesEquipeCampo)}/mês ÷ 30 × ${P.diasCasa} = ${brl0(D.folhaAlocada)}),
o resultado parcial vai para <b class="${sinal(D.parcialComFolha)}">${brl0(D.parcialComFolha)}</b>.</p>

<h2><span class="n">08</span>O que precisa ser decidido ou confirmado</h2>
<ul>
  <li><b>Comissão do Rusa</b> — confirmar se Nelore Pérola / José Fábio e os demais compradores do Matinha e do KatiSpera
      são clientes dele. Diferença de ${brl0(D.rusaImpacto)} nas comissões de setembro.</li>
  <li><b>Casa e uniformes</b> — os totais de ${brl0(P.casaTotal)} e ${brl0(P.uniformesTotal)} vieram de você; o ERP só tem
      ${brl0(D.casaPaga)} e ${brl0(D.unifPago)} lançados. Os saldos de ${brl0(P.casaTotal - D.casaPaga)} e ${brl0(P.uniformesTotal - D.unifPago)}
      precisam virar conta a pagar para não aparecerem de surpresa no extrato.</li>
  <li><b>Critério do Terra Brava</b> — a conta a receber de ${brl(11984.49)} usa 11,19%, o percentual efetivo do
      Terra Brava de junho. Se o acordo desta edição for de 5%, a receita cai para ${brl(107100 * 0.05)}.</li>
  <li><b>Comissão do KatiSpera</b> — ainda não lançada; aguarda o leilão entrar no HastaPro.</li>
  <li><b>Passagens de 17/07</b> — os dois PIX para a ADN Viagens (Marcelo ${brl(2081.92)} e Léo ${brl(2421.43)})
      saíram do cálculo a seu pedido: não são desta feira. Só que o memo no extrato dizia "EXPOGENETICA" e no ERP
      elas seguem marcadas como despesa de Terra Brava/Matinha — precisam ser reclassificadas para o evento certo,
      senão voltam a aparecer como custo da Expogenética no fechamento do mês.</li>
  <li><b>EAO e Mafra</b> — leilões grandes, equipe presente e zero venda registrada. Vale conferir com os assessores
      se houve venda não reportada no grupo antes de dar o mês por fechado.</li>
  <li><b>JMP de 21/08</b> — é o único leilão restante cujo acordo paga sobre o faturamento total (0,5%) e não sobre a
      cobertura. Sozinho ele decide se a feira fecha positiva; vale saber o tamanho esperado do evento.</li>
</ul>

<footer>
  Bula Assessoria · Expogenética 2026 · gerado em 18/08/2026 a partir do ERP e do HastaPro (FIL 2).
  Valores marcados como estimados ou projetados não são fato registrado — estão identificados linha a linha.
</footer>

</div>
</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)

const browser = await chromium.launch()
const pg = await browser.newPage()
await pg.setContent(html, { waitUntil: 'networkidle' })
const pdfPath = path.join(DESKTOP, 'Bula - Expogenetica 2026 - Custo x Resultado - 18-08-2026.pdf')
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
await browser.close()

/* ═══════ 9. XLSX ═══════════════════════════════════════════════════════════ */
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.custos.map(c => ({
  Data: c.data, Item: c.item, Fornecedor: c.quem, Valor: c.valor, 'Situação': c.situacao, Fonte: c.fonte,
}))), 'Custos')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.realizados.map(l => ({
  Data: l.data, 'Leilão': l.nome, 'Cobertura Bula': l.cobertura, Lotes: l.lotes,
  'Receita Bula': l.receita, 'Critério': l.criterio, 'Recebe em': l.recebimento, 'Obs': l.obs,
}))), 'Realizado')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.comissoesERP.map(c => ({
  'Leilão': c.leilao, Quem: c.quem, Base: c.base, '%': c.pctv, 'Comissão': c.valor,
}))), 'Comissoes')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.rusaLotes.map(l => ({
  'Leilão': l.leilao, Lote: l.lote, VGV: l.vgv, 'Comissão 2%': r2(l.vgv * 0.02), 'Comissão Rusa 5%': r2(l.vgv * 0.05),
}))), 'Lotes Rusa')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.projecaoBase.linhas.map(l => ({
  Data: l.data, 'Leilão': l.nome, 'Cobertura projetada': l.cobProjetada,
  '% efetivo': l.pctEfetivo, 'Receita projetada': l.receitaProjetada, 'Base do percentual': l.base,
}))), 'Projecao')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.cenarios.map(c => ({
  'Cenário': c.nome, 'Cobertura da feira': c.coberturaFeira, Receita: c.receita, 'Comissão': c.comissao,
  Imposto: c.imposto, Custo: c.custo, Resultado: c.resultado, 'Resultado se Rusa 5%': c.resultadoRusa,
}))), 'Cenarios')
let xlsxPath = path.join(DESKTOP, 'Bula - Expogenetica 2026 - Custo x Resultado - 18-08-2026.xlsx')
try {
  XLSX.writeFile(wb, xlsxPath)
} catch (e) {
  // Excel segura o arquivo aberto (EBUSY) — grava ao lado em vez de perder a rodada
  if (e.code !== 'EBUSY') throw e
  xlsxPath = xlsxPath.replace(/\.xlsx$/, ' (atualizado).xlsx')
  XLSX.writeFile(wb, xlsxPath)
  console.log('AVISO: o xlsx original estava aberto no Excel; gravei em', xlsxPath)
}

console.log('PDF   ->', pdfPath)
console.log('XLSX  ->', xlsxPath)
console.log('')
console.log('custo total          ', D.custoTotal.toFixed(2), `(confirmado ${D.custoConfirmado.toFixed(2)})`)
console.log('cobertura realizada  ', D.coberturaRealizada.toFixed(2))
console.log('receita realizada    ', D.receitaRealizada.toFixed(2))
console.log('comissao ERP         ', D.comissaoERPTotal.toFixed(2), '| cenario Rusa', D.comissaoCenarioRusa.toFixed(2))
console.log('parcial ERP          ', D.parcialERP.resultado.toFixed(2))
console.log('parcial Rusa         ', D.parcialRusa.resultado.toFixed(2))
console.log('parcial c/ folha     ', D.parcialComFolha.toFixed(2))
console.log('equilibrio cobertura ', D.coberturaEquilibrio.toFixed(2), `(feito ${(D.pctEquilibrioFeito * 100).toFixed(1)}%)`)
D.cenarios.forEach(c => console.log('  ' + c.nome.padEnd(12), 'receita', c.receita.toFixed(0), '| resultado', c.resultado.toFixed(0), '| c/ Rusa', c.resultadoRusa.toFixed(0)))
