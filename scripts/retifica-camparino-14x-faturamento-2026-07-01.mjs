// Retifica o fechamento do 41o Touros Camparino (06/06/2026) conforme o retorno
// do chefe no grupo Financeiro Bula Assessoria (WhatsApp, 01/07/2026):
//
//   1. Prazo: 14 parcelas, nao 30 (corrige VGV/participacao da cobertura).
//   2. Acordo: 0,5% sobre o FATURAMENTO TOTAL do leilao (R$ 2.048.830),
//      nao sobre o VGV da cobertura. -> receita = 0,5% x 2.048.830 = 10.244,15.
//
// Recalcula lances/agregacoes com PARCELAS=14 e ajusta fechamento, conta a
// receber (ERP), cronograma e card publico. Idempotente.
//
// Uso: node scripts/retifica-camparino-14x-faturamento-2026-07-01.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100

// ── Identificadores (do SELECT de verificacao) ──────────────────────────────
const FECHAMENTO_ID = 'ebfbce96-4c51-49e9-994b-1d117fdaf486'
const CRONO_ID = 'ffad5b3d-c785-40e5-9161-3c6268fcba6e'
const PUBLIC_ID = '9374a746-4746-429b-bd38-59ef5bfe8145'
const CR_DOCUMENTO = 'BULA-2026-CR-WPP-CAMPARINO-TOUROS-20260606'

// ── Parametros da retificacao ───────────────────────────────────────────────
const PARCELAS = 14
const CONDICAO = '14 parcelas'
const FATURAMENTO_TOTAL = 2_048_830
const ACORDO_PCT_FATURAMENTO = 0.005
const ACORDO_DESCRICAO = '0,5% do faturamento total do leilão'
const comissaoPctPorAssessor = new Map([
  ['Fabio Omena', 0.03],
  ['Leonardo Serafim', 0.02],
])
const nomesUf = new Map([
  ['MT', 'Mato Grosso'],
  ['PA', 'Para'],
])

async function main() {
  // 1) Le o fechamento atual (lances sao a fonte para recalcular).
  const { data: fech, error: selErr } = await sb
    .from('bula_leilao_fechamento')
    .select('id,nome,lances')
    .eq('id', FECHAMENTO_ID)
    .single()
  if (selErr) throw new Error(`SELECT fechamento: ${selErr.message}`)

  const lancesOrig = Array.isArray(fech.lances) ? fech.lances : []
  if (!lancesOrig.length) throw new Error('Fechamento sem lances; abortando.')

  // 2) Recalcula lances com 14 parcelas.
  const lances = lancesOrig.map((l) => {
    const animais = Number(l.animais || 1)
    const vgv = Number(l.parcela) * PARCELAS * animais
    const obsBase = (l.observacaoExtra || '').trim()
    return {
      ...l,
      parcelas: PARCELAS,
      vgv,
      observacao: [
        obsBase ? `${obsBase} Condicao usada no lancamento: ${CONDICAO}.` : `Condicao usada no lancamento: ${CONDICAO}.`,
        `VGV: ${brl(l.parcela)} x ${PARCELAS} x ${animais} = ${brl(vgv)}.`,
      ].join(' '),
    }
  })

  const vgv_total = lances.reduce((s, l) => s + l.vgv, 0)
  const animais_vendidos = lances.reduce((s, l) => s + Number(l.animais || 1), 0)
  const lotes_vendidos = lances.length
  const maior_lance = Math.max(...lances.map((l) => Number(l.parcela)))
  const ticket_medio = Math.round(vgv_total / animais_vendidos)

  // 3) por_assessor
  const byAssessor = new Map()
  for (const l of lances) {
    const cur = byAssessor.get(l.assessor) ?? { nome: l.assessor, empresa: l.empresa, transacoes: 0, animais: 0, vgv: 0 }
    cur.transacoes += 1
    cur.animais += Number(l.animais || 1)
    cur.vgv += l.vgv
    byAssessor.set(l.assessor, cur)
  }
  const por_assessor = [...byAssessor.values()]
    .sort((a, b) => b.vgv - a.vgv)
    .map((a, index) => {
      const pct = comissaoPctPorAssessor.get(a.nome) ?? 0
      const comissao = round2(a.vgv * pct)
      return {
        posicao: index + 1,
        nome: a.nome,
        empresa: a.empresa,
        transacoes: a.transacoes,
        animais: a.animais,
        vgv: a.vgv,
        ticket_medio: Math.round(a.vgv / a.animais),
        pct_total: Math.round((a.vgv / vgv_total) * 10000) / 10000,
        comissao,
        observacao: pct > 0
          ? `Comissao padrao aplicada: ${(pct * 100).toLocaleString('pt-BR')}% sobre o VGV.`
          : 'Sem regra de comissao padrao cadastrada; revisar antes de gerar conta a pagar.',
      }
    })
  const comissao_assessoria = round2(por_assessor.reduce((s, a) => s + a.comissao, 0))

  // 4) receita/sobra — agora sobre o FATURAMENTO TOTAL do leilao.
  const receita_bula = round2(FATURAMENTO_TOTAL * ACORDO_PCT_FATURAMENTO)
  const sobra_bruta = round2(receita_bula - comissao_assessoria)

  // 5) por_estado
  const byUf = new Map()
  for (const l of lances) {
    const cur = byUf.get(l.uf) ?? { uf: l.uf, lotes: 0, animais: 0, vgv: 0 }
    cur.lotes += 1
    cur.animais += Number(l.animais || 1)
    cur.vgv += l.vgv
    byUf.set(l.uf, cur)
  }
  const por_estado = [...byUf.values()]
    .sort((a, b) => b.vgv - a.vgv)
    .map((uf) => ({
      ...uf,
      estado: nomesUf.get(uf.uf) ?? uf.uf,
      pct_total: Math.round((uf.vgv / vgv_total) * 10000) / 10000,
      ticket_medio: Math.round(uf.vgv / uf.animais),
    }))

  // 6) compradores
  const byComp = new Map()
  for (const l of lances) {
    const key = `${l.comprador}|${l.fazenda}|${l.cidade}|${l.uf}`
    const cur = byComp.get(key) ?? { comprador: l.comprador, fazenda: l.fazenda, cidade: l.cidade, uf: l.uf, lotes: 0, animais: 0, vgv: 0 }
    cur.lotes += 1
    cur.animais += Number(l.animais || 1)
    cur.vgv += l.vgv
    byComp.set(key, cur)
  }
  const compradores = [...byComp.values()].sort((a, b) => b.vgv - a.vgv).map((c, i) => ({ rank: i + 1, ...c }))

  const observacoes = [
    'Fechamento registrado a partir das imagens de WhatsApp encaminhadas em 08/06/2026.',
    'RETIFICADO em 01/07/2026 conforme o chefe (grupo Financeiro Bula Assessoria):',
    `- Prazo corrigido de 30 para ${CONDICAO} (o 30x era suposicao; catalogo confirmou 14x).`,
    `- Acordo: 0,5% sobre o FATURAMENTO TOTAL do leilao (nao sobre o VGV da cobertura).`,
    `Faturamento total do leilao: ${brl(FATURAMENTO_TOTAL)} (83 cabecas, planilha oficial).`,
    `Cobertura Bula: ${lotes_vendidos} lotes / ${animais_vendidos} machos / ${brl(vgv_total)}.`,
    `Receita Bula: 0,5% x ${brl(FATURAMENTO_TOTAL)} = ${brl(receita_bula)}.`,
    `Comissao de assessoria (sobre o VGV da cobertura): ${brl(comissao_assessoria)}; sobra bruta: ${brl(sobra_bruta)}.`,
  ].join('\n')

  // ── UPDATE fechamento ─────────────────────────────────────────────────────
  const fechPayload = {
    lances,
    por_assessor,
    por_estado,
    compradores,
    vgv_total,
    ticket_medio,
    maior_lance,
    animais_vendidos,
    lotes_vendidos,
    compradores_unicos: compradores.length,
    estados_alcancados: por_estado.length,
    faturamento_total_leilao: FATURAMENTO_TOTAL,
    acordo_pct_faturamento: ACORDO_PCT_FATURAMENTO,
    acordo_pct_venda_cobertura: null,
    acordo_descricao: ACORDO_DESCRICAO,
    receita_bula,
    comissao_assessoria,
    sobra_bruta,
    observacoes,
    updated_at: new Date().toISOString(),
  }
  {
    const { error } = await sb.from('bula_leilao_fechamento').update(fechPayload).eq('id', FECHAMENTO_ID)
    if (error) throw new Error(`UPDATE fechamento: ${error.message}`)
    console.log(`Fechamento atualizado (id=${FECHAMENTO_ID})`)
  }

  // ── UPDATE conta a receber (ERP) ──────────────────────────────────────────
  {
    const obs = [
      `Provisao de fluxo de caixa do fechamento ${FECHAMENTO_ID}.`,
      `RETIFICADO 01/07/2026: 14 parcelas e acordo de 0,5% sobre o faturamento total.`,
      `Faturamento total: ${brl(FATURAMENTO_TOTAL)} | Receita Bula: 0,5% = ${brl(receita_bula)}.`,
      `VGV cobertura (14x): ${brl(vgv_total)}.`,
    ].join(' ')
    const { data, error } = await sb
      .from('erp_contas_receber')
      .update({ valor: receita_bula, observacoes: obs, updated_at: new Date().toISOString() })
      .eq('numero_documento', CR_DOCUMENTO)
      .select('id')
    if (error) throw new Error(`UPDATE conta a receber: ${error.message}`)
    console.log(`Conta a receber atualizada (${CR_DOCUMENTO}) -> ${data?.length || 0} linha(s)`)
  }

  // ── UPDATE cronograma ─────────────────────────────────────────────────────
  {
    const { error } = await sb
      .from('cronograma_leiloes')
      .update({
        venda_bula: brl(vgv_total),
        faturamento_realizado: brl(FATURAMENTO_TOTAL),
        comissao_receber: brl(receita_bula),
        comissao: ACORDO_DESCRICAO,
        contrato: CONDICAO,
      })
      .eq('id', CRONO_ID)
    if (error) throw new Error(`UPDATE cronograma: ${error.message}`)
    console.log(`Cronograma atualizado (id=${CRONO_ID})`)
  }

  // ── UPDATE card publico ───────────────────────────────────────────────────
  {
    const { error } = await sb
      .from('bula_leiloes')
      .update({ realizado_bula: vgv_total, condicao: CONDICAO, acordo_comissao: ACORDO_DESCRICAO })
      .eq('id', PUBLIC_ID)
    if (error) throw new Error(`UPDATE bula_leiloes: ${error.message}`)
    console.log(`Card publico atualizado (id=${PUBLIC_ID})`)
  }

  console.log('\nResumo da retificacao:')
  console.log(`  Prazo              : ${CONDICAO}`)
  console.log(`  Cobertura Bula     : ${lotes_vendidos} lotes / ${animais_vendidos} machos / ${brl(vgv_total)}`)
  console.log(`  Ticket medio       : ${brl(ticket_medio)}`)
  console.log(`  Faturamento total  : ${brl(FATURAMENTO_TOTAL)}`)
  console.log(`  Acordo             : ${ACORDO_DESCRICAO}`)
  console.log(`  Receita Bula       : ${brl(receita_bula)}`)
  console.log(`  Comissao assessoria: ${brl(comissao_assessoria)}`)
  console.log(`  Sobra bruta        : ${brl(sobra_bruta)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
