// Corrige a divergencia do fechamento do 9o Leilao Nelore Flor do Aratau
// (07/06/2026).
//
// Causa: duas edicoes parciais deixaram o registro inconsistente —
//   1. removeram o componente "3% da venda da cobertura" do acordo
//      (acordo_pct_venda_cobertura -> null), mas a receita_bula gravada
//      ainda incluia esses 3% (R$ 13.707) e a descricao continuava citando
//      "+ 3% da venda da cobertura";
//   2. o faturamento_total_leilao foi alterado (1.134.900 -> 1.184.900) sem
//      recalcular a receita_bula.
//
// Decisao do usuario (09/06/2026): o acordo do Flor do Aratau e' apenas
// 1% do faturamento total; o faturamento correto e' o atual (1.184.900).
//
//   Receita Bula = 1% x 1.184.900 = R$ 11.849,00
//   Sobra bruta  = 11.849,00 - 4.338,00 (comissao) = R$ 7.511,00
//
// Uso: node scripts/fix-fechamento-flor-aratau-acordo-2026-06-09.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100

const FECHAMENTO_ID = 'dd10dd7d-f4d1-4656-ba07-175c4ea3b81e'
const CRONO_ID = 'a06d0449-07fb-4072-930f-f8baa7593943'
const PUBLIC_ID = '74ed47dc-1f6b-4241-b346-f3558cc5e9d9'
const CR_DOCUMENTO = 'BULA-2026-CR-WPP-FLOR-DO-ARATAU-20260607'

const ACORDO_PCT_FATURAMENTO = 0.01
const ACORDO_DESCRICAO = '1% do faturamento total do leilao'

async function main() {
  const { data: fech, error: selErr } = await supabase
    .from('bula_leilao_fechamento')
    .select('id,nome,vgv_total,faturamento_total_leilao,comissao_assessoria,observacoes')
    .eq('id', FECHAMENTO_ID)
    .single()
  if (selErr) throw new Error(`SELECT fechamento: ${selErr.message}`)

  const faturamento = Number(fech.faturamento_total_leilao || 0) // mantem o atual (1.184.900)
  const comissao = Number(fech.comissao_assessoria || 0)
  const receitaBula = round2(faturamento * ACORDO_PCT_FATURAMENTO)
  const sobraBruta = round2(receitaBula - comissao)

  const observacoes = [
    'Fechamento registrado a partir das imagens de WhatsApp e do arquivo F:/Listagem.pdf (07/06/2026).',
    'Corrigido em 09/06/2026: acordo do leilao e apenas 1% do faturamento total.',
    'Removido o componente "3% da venda da cobertura" que tinha ficado orfao na receita apos edicoes parciais.',
    `Faturamento total: ${brl(faturamento)} | Receita Bula: 1% = ${brl(receitaBula)}.`,
    `Comissao de assessoria: ${brl(comissao)} | Sobra bruta: ${brl(sobraBruta)}.`,
  ].join('\n')

  {
    const { error } = await supabase
      .from('bula_leilao_fechamento')
      .update({
        acordo_pct_faturamento: ACORDO_PCT_FATURAMENTO,
        acordo_pct_venda_cobertura: null,
        acordo_descricao: ACORDO_DESCRICAO,
        receita_bula: receitaBula,
        sobra_bruta: sobraBruta,
        observacoes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', FECHAMENTO_ID)
    if (error) throw new Error(`UPDATE fechamento: ${error.message}`)
    console.log(`Fechamento corrigido (id=${FECHAMENTO_ID})`)
  }

  {
    const { error } = await supabase
      .from('cronograma_leiloes')
      .update({
        faturamento_realizado: brl(faturamento),
        comissao_receber: brl(receitaBula),
        comissao: ACORDO_DESCRICAO,
      })
      .eq('id', CRONO_ID)
    if (error) throw new Error(`UPDATE cronograma: ${error.message}`)
    console.log(`Cronograma atualizado (id=${CRONO_ID})`)
  }

  {
    const { error } = await supabase
      .from('bula_leiloes')
      .update({ acordo_comissao: ACORDO_DESCRICAO })
      .eq('id', PUBLIC_ID)
    if (error) throw new Error(`UPDATE bula_leiloes: ${error.message}`)
    console.log(`Card publico atualizado (id=${PUBLIC_ID})`)
  }

  {
    const obs = [
      `Provisao de fluxo de caixa do fechamento ${FECHAMENTO_ID}.`,
      `Acordo: ${ACORDO_DESCRICAO}.`,
      `Faturamento total: ${brl(faturamento)} | Receita Bula: 1% = ${brl(receitaBula)}.`,
      'Corrigido em 09/06/2026 (removido 3% da cobertura que estava orfao na receita).',
      'Vencimento tecnico D+45 ate confirmacao financeira definitiva.',
    ].join(' ')
    const { data: cr, error } = await supabase
      .from('erp_contas_receber')
      .update({ valor: receitaBula, observacoes: obs, updated_at: new Date().toISOString() })
      .eq('numero_documento', CR_DOCUMENTO)
      .select('id')
    if (error) throw new Error(`UPDATE conta a receber: ${error.message}`)
    if (!cr || cr.length === 0) console.log(`AVISO: conta a receber ${CR_DOCUMENTO} nao encontrada.`)
    else console.log(`Conta a receber atualizada (${CR_DOCUMENTO})`)
  }

  console.log('\nResumo:')
  console.log(`  Faturamento total  : ${brl(faturamento)}`)
  console.log(`  Acordo             : ${ACORDO_DESCRICAO}`)
  console.log(`  Receita Bula       : ${brl(receitaBula)}`)
  console.log(`  Comissao assessoria: ${brl(comissao)}`)
  console.log(`  Sobra bruta        : ${brl(sobraBruta)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
