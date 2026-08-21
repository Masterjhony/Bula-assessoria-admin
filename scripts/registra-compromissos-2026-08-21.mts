/**
 * REGISTRA NO ERP OS QUATRO COMPROMISSOS INFORMADOS EM 21/08/2026.
 *
 *   npx tsx scripts/registra-compromissos-2026-08-21.mts            (simula)
 *   npx tsx scripts/registra-compromissos-2026-08-21.mts --apply    (grava)
 *
 * 1. NAVIRAÍ — a leiloeira paga R$ 18.374,25 em 10/09. O ERP tinha
 *    R$ 18.795,00, que é 5% sobre o BRUTO (R$ 375.900). A planilha da Naviraí
 *    é LÍQUIDA do desconto à vista (R$ 367.485) — a diferença de R$ 420,75 é
 *    desconto, não erro de base. Entra como DESCONTO nos dois títulos, rateado
 *    pela cobertura de cada um: assim a cobertura continua batendo com o
 *    fechamento e o líquido bate com o que a leiloeira vai depositar.
 *
 * 2. GUADALUPE — R$ 21.425,90 em 2x, a primeira até 25/08 e a segunda 30 dias
 *    depois. Os quatro títulos já existem com as datas certas; o que faltava
 *    era a marca de DATA ACORDADA. Sem ela, o fluxo de caixa trata esses
 *    vencimentos como o palpite de leilão+45d que valia para todo o resto.
 *
 * 3. NANE — as comissões dela não são pagas por leilão: acumulam e saem todas
 *    em dezembro. Faltava o título do EAO Baviera Machos (12/07).
 *
 * 4. MARCELO — contrato de 17/07/2026: 35% do LUCRO, pagos trimestralmente,
 *    contando de junho. Primeiro trimestre (jun–ago) vence agora. O valor sai
 *    do mesmo motor que alimenta o relatório (dados.json), não da mão.
 *
 * A "cascata de referências" de cada título: fechamento_id (qual leilão),
 * evento_key (qual fato econômico) e origem — para o trigger da migration 0074
 * encerrar a previsão quando o pagamento real chegar do extrato.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { eventoKey } from '../src/lib/erp-evento'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').replace(/^﻿/, '').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])) as Record<string, string>
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const APPLY = process.argv.includes('--apply')
const r2 = (n: number) => Math.round(Number(n || 0) * 100) / 100
const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const D = JSON.parse(fs.readFileSync('outputs/resultado-comercial-2026-08-21/dados.json', 'utf8'))

const CAT_SOCIO = '72478f52-d190-4f09-9c58-802ffc88abca'   // Remuneracao de Socio (dre_grupo distribuicao)
const CAT_COMISSAO = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e' // Comissão Funcionário
const CC_SOC02 = 'e36a7d0f-55eb-4224-bf6f-312a4931053d'     // Distribuição de Lucros
const CC_COM02 = '52dd8ed0-0c0a-4524-86bd-01dc121487b3'     // Comissão Assessores
const MARCELO = '8fbf5ebf-7181-4f1d-99c2-d19f80c9f92b'      // Marcelo Carneiro Lucas Pereira

const plano: string[] = []
const say = (s: string) => { plano.push(s); console.log(s) }

/* ── 1. NAVIRAÍ: desconto à vista e data de pagamento ────────────────────── */

const NAVIRAI_LIQUIDO = 18374.25 // planilha da leiloeira: 5% sobre 367.485,00
const NAVIRAI_VENC = '2026-09-10'
const { data: nav } = await sb.from('erp_contas_receber')
  .select('id,numero_documento,descricao,valor,desconto,vencimento,observacoes,tags')
  .in('numero_documento', ['BULA-2026-CR-NAVIRAI-MATRIZES-20260705', 'BULA-2026-CR-NAVIRAI-2ETAPA-20260716'])

const brutoNav = r2((nav || []).reduce((s, c) => s + Number(c.valor), 0))
const descontoTotal = r2(brutoNav - NAVIRAI_LIQUIDO)
say(`\n1. NAVIRAÍ — bruto ${brl(brutoNav)} · líquido da leiloeira ${brl(NAVIRAI_LIQUIDO)} · desconto à vista ${brl(descontoTotal)}`)

const updatesNav: Array<{ id: string; desconto: number; obs: string; tags: string[]; doc: string; liq: number }> = []
let descontoAlocado = 0
;(nav || []).forEach((c, i) => {
  const ultimo = i === (nav || []).length - 1
  // rateio pela cobertura de cada leilão; a última linha absorve o centavo
  const parte = ultimo ? r2(descontoTotal - descontoAlocado) : r2(descontoTotal * (Number(c.valor) / brutoNav))
  descontoAlocado = r2(descontoAlocado + parte)
  const linha = `[ACORDO 21/08/2026] A Naviraí paga em 10/09 o líquido de ${brl(NAVIRAI_LIQUIDO)} pelos dois pregões: 5% sobre a venda LÍQUIDA de ${brl(367485)}, não sobre a bruta de ${brl(375900)}. O desconto à vista de ${brl(descontoTotal)} entra rateado pela cobertura — aqui, ${brl(parte)}. Data acordada com a leiloeira.`
  updatesNav.push({
    id: c.id, desconto: parte, doc: c.numero_documento, liq: r2(Number(c.valor) - parte),
    obs: String(c.observacoes || '').includes('[ACORDO 21/08/2026]') ? String(c.observacoes) : `${c.observacoes || ''}\n${linha}`.trim(),
    tags: [...new Set([...(c.tags || []), 'data-acordada'])],
  })
  say(`   ${c.numero_documento}  bruto ${brl(Number(c.valor))} − desconto ${brl(parte)} = ${brl(r2(Number(c.valor) - parte))}  · vence ${NAVIRAI_VENC}`)
})
say(`   soma dos líquidos: ${brl(r2(updatesNav.reduce((s, u) => s + u.liq, 0)))}`)

/* ── 2. GUADALUPE: marcar a data como acordada ───────────────────────────── */

const { data: gua } = await sb.from('erp_contas_receber')
  .select('id,numero_documento,descricao,valor,vencimento,observacoes,tags')
  .ilike('descricao', '%GUADALUPE%').in('status', ['aberto', 'vencido', 'parcial']).order('vencimento')
const totalGua = r2((gua || []).reduce((s, c) => s + Number(c.valor), 0))
say(`\n2. GUADALUPE — ${brl(totalGua)} em 2x, ${gua?.length} títulos`)
const notaGua = `[ACORDO 21/08/2026] Confirmado pelo chefe: a Guadalupe paga ${brl(totalGua)} em 2 parcelas iguais — a 1ª até 25/08 e a 2ª 30 dias depois. Data ACORDADA com a leiloeira, não é o vencimento automático de leilão+45d.`
for (const c of gua || []) {
  say(`   ${String(c.vencimento).slice(0, 10)}  ${brl(Number(c.valor))}  ${String(c.descricao).slice(0, 54)}`)
}

/* ── 3. NANE: o título que faltava ───────────────────────────────────────── */

const { data: fechNane } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,por_assessor').gte('data', '2026-01-01')
const { data: cpsNane } = await sb.from('erp_contas_pagar')
  .select('numero_documento,fechamento_id,valor,descricao').ilike('descricao', '%NANE%').neq('status', 'cancelado')
const jaTemNane = new Set((cpsNane || []).map((c) => c.numero_documento))

const faltamNane: any[] = []
for (const f of fechNane || []) {
  for (const a of (f.por_assessor || []) as any[]) {
    if (!/^nane$/i.test(String(a?.nome || '').trim())) continue
    const doc = `BULA-2026-CP-COM-NANE-${String(f.data).slice(0, 10).replace(/-/g, '')}`
    if (jaTemNane.has(doc)) continue
    const jaLancado = (cpsNane || []).some((c) => c.fechamento_id === f.id && Math.abs(Number(c.valor) - Number(a.comissao)) < 0.01)
    if (jaLancado) continue
    faltamNane.push({
      doc, fechamento_id: f.id, valor: r2(Number(a.comissao)),
      descricao: `COMISSAO ${f.nome} - NANE (${(Number(a.comissao_pct) * 100).toFixed(2)}%)`,
      data: String(f.data).slice(0, 10),
    })
  }
}
say(`\n3. NANE — comissões acumuladas, pagas todas em 28/12. Faltam ${faltamNane.length} título(s):`)
for (const n of faltamNane) say(`   ${brl(n.valor)}  ${n.descricao.slice(0, 62)}`)

/* ── 4. MARCELO: 35% do lucro do trimestre jun–ago ───────────────────────── */

const S = D.socio.realizado
const docSocio = 'BULA-2026-CP-SOCIO-MARCELO-T1'
// O rótulo carrega o TRIMESTRE do contrato, não o mês: é ele que vira a chave
// do evento (distribuicao:<pessoa>:<ano>-T<n>) e liga esta previsão ao PIX que
// vier do extrato. Só "Junho–Agosto/2026" faria a chave virar a competência de
// agosto, e o pagamento do trimestre seguinte casaria com o título errado.
const descSocio = `REMUNERACAO DE SOCIO - MARCELO CARNEIRO - 35% do lucro - 1o trimestre do contrato, ref. ${String(S.trimestre).replace('–', ' a ')}`
const { data: jaSocio } = await sb.from('erp_contas_pagar').select('id,valor,status').eq('numero_documento', docSocio).maybeSingle()
// Enquanto o trimestre não é pago, o título acompanha a apuração: reprocessar
// a folha de um mês muda o lucro e tem de mudar a participação junto. Título
// já pago não se mexe.
const socioDivergente = !!jaSocio && jaSocio.status !== 'pago' && Math.abs(Number(jaSocio.valor) - S.valor) > 0.01
say(`\n4. MARCELO — 35% do lucro de ${S.trimestre}`)
for (const m of S.meses) say(`   ${String(m.nome).padEnd(9)} lucro ${brl(m.lucro)}`)
say(`   lucro do trimestre ${brl(S.lucro)} × 35% = ${brl(S.valor)}  · vence ${S.vencimento}  ${
  socioDivergente ? `(atualizar: está ${brl(Number(jaSocio!.valor))})` : jaSocio ? '(já existe, sem mudança)' : '(criar)'}`)
say(`   evento_key: ${eventoKey({ descricao: descSocio, vencimento: S.vencimento })}`)

/* ── grava ───────────────────────────────────────────────────────────────── */

if (!APPLY) { console.log('\n[SIMULAÇÃO] rode com --apply para gravar.\n'); process.exit(0) }

for (const u of updatesNav) {
  const { error } = await sb.from('erp_contas_receber')
    .update({ desconto: u.desconto, vencimento: NAVIRAI_VENC, status: 'aberto', observacoes: u.obs, tags: u.tags })
    .eq('id', u.id)
  if (error) { console.error('naviraí', u.doc, error.message); process.exit(1) }
}

for (const c of gua || []) {
  const obs = String(c.observacoes || '')
  const { error } = await sb.from('erp_contas_receber')
    .update({
      observacoes: obs.includes('[ACORDO 21/08/2026]') ? obs : `${obs}\n${notaGua}`.trim(),
      tags: [...new Set([...(c.tags || []), 'data-acordada'])],
    }).eq('id', c.id)
  if (error) { console.error('guadalupe', c.numero_documento, error.message); process.exit(1) }
}

for (const n of faltamNane) {
  const { error } = await sb.from('erp_contas_pagar').insert({
    descricao: n.descricao,
    numero_documento: n.doc,
    valor: n.valor,
    emissao: n.data,
    vencimento: D.nane.vencimento,
    status: 'aberto',
    categoria_id: CAT_COMISSAO,
    centro_custo_id: CC_COM02,
    fechamento_id: n.fechamento_id,
    origem: 'estimativa',
    evento_key: eventoKey({ descricao: n.descricao, vencimento: D.nane.vencimento, fechamento_id: n.fechamento_id }),
    tags: ['comissao', '2026', 'nane-acumulado', 'orcamento'],
    observacoes: `[21/08/2026] Comissão da Nane do leilão de ${n.data.split('-').reverse().join('/')}. Combinado: as comissões dela não saem por leilão — acumulam e são pagas de uma vez em 28/12.`,
  })
  if (error) { console.error('nane', n.doc, error.message); process.exit(1) }
}

if (socioDivergente) {
  const { error } = await sb.from('erp_contas_pagar').update({
    valor: S.valor,
    observacoes: `[21/08/2026] Contrato de sociedade de 17/07/2026: 35% do LUCRO, pagos trimestralmente, contagem a partir de ${D.socio.inicio}.\nBase reapurada: lucro de ${brl(S.lucro)} no trimestre ${S.trimestre} — ${S.meses.map((m: any) => `${m.nome} ${brl(m.lucro)}`).join(' · ')}.\nNão há participação sobre prejuízo: em trimestre negativo o valor é zero.\nSocietário (não é caixa): 15% integralizados no ato por doação, mais 5% por semestre em 4 semestres conforme metas do conselho de sócios.`,
  }).eq('id', jaSocio!.id)
  if (error) { console.error('sócio (update)', error.message); process.exit(1) }
}

if (!jaSocio && S.valor > 0) {
  const { error } = await sb.from('erp_contas_pagar').insert({
    descricao: descSocio,
    numero_documento: docSocio,
    valor: S.valor,
    emissao: '2026-08-31',
    vencimento: S.vencimento,
    status: 'aberto',
    categoria_id: CAT_SOCIO,
    centro_custo_id: CC_SOC02,
    fornecedor_id: MARCELO,
    recorrencia: 'trimestral',
    origem: 'estimativa',
    evento_key: eventoKey({ descricao: descSocio, vencimento: S.vencimento }),
    tags: ['socio', 'distribuicao', '2026', 'orcamento'],
    observacoes: [
      `[21/08/2026] Contrato de sociedade de 17/07/2026: Marcelo é remunerado com 35% do LUCRO, pagos trimestralmente. A contagem começou em ${D.socio.inicio}, então o 1º trimestre é ${S.trimestre} e vence agora.`,
      `Base: lucro apurado de ${brl(S.lucro)} (receita − imposto 18% − comissão de assessores − despesa operacional de leilão − custo fixo), mês a mês: ${S.meses.map((m: any) => `${m.nome} ${brl(m.lucro)}`).join(' · ')}.`,
      `Não há participação sobre prejuízo: em trimestre negativo o valor é zero.`,
      `Societário (não é caixa): 15% integralizados no ato por doação, mais 5% por semestre em 4 semestres conforme metas do conselho de sócios.`,
    ].join('\n'),
  })
  if (error) { console.error('sócio', error.message); process.exit(1) }
}

console.log(`\nOK — Naviraí ${updatesNav.length} título(s) ajustado(s), Guadalupe ${gua?.length} marcado(s), Nane ${faltamNane.length} criado(s), sócio ${socioDivergente ? 'atualizado' : jaSocio ? 'inalterado' : 'criado'}.\n`)
