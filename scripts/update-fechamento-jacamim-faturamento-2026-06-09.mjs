// Completa o fechamento do 8o Leilao Jacamim Femeas (07/06/2026) com o
// faturamento total da leiloeira e o acordo renegociado.
//
// Contexto:
// - Em 07/06 o fechamento ficou com pendencia: faltava o faturamento total
//   da leiloeira (acordo antigo: 1% do faturamento + 3% da venda da cobertura,
//   so os 3% da cobertura tinham sido provisionados = R$ 6.021,00).
// - Em 09/06/2026 o usuario encaminhou por WhatsApp o "Faturamento jacamim"
//   (imagem do resumo oficial do 8o Leilao Femeas Jacamim) e informou que o
//   acordo MUDOU para 0,5% da venda (= 0,5% do faturamento total do leilao).
//
// Fonte do faturamento (imagem do resumo oficial):
//   Novilhas IND.  : 40  x media 21.465,00  = 858.600,00
//   Novilhas MULT. : 74  x media 16.940,54  = 1.253.600,00
//   Vacas          : 25  x media 18.576,00  = 464.400,00
//   Paridas Femea  : 38  x media 25.773,68  = 979.400,00
//   Paridas Macho  : 29  x media 25.720,69  = 745.900,00
//   TOTAL          : 206 x media 20.883,01  = 4.301.900,00
//
// Uso: node scripts/update-fechamento-jacamim-faturamento-2026-06-09.mjs

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

// ── Identificadores do leilao (do script original de criacao) ───────────────
const FECHAMENTO_ID = 'c1afc577-062e-4473-8a53-0d10e6802392'
const CRONO_ID = '86aa71a3-b9f2-4615-b5ff-fa3b4c480382'
const PUBLIC_ID = '24913ec2-fcbb-4d82-a9bd-a45aec8f70e3'
const CR_DOCUMENTO = 'BULA-2026-CR-WPP-JACAMIM-FEMEAS-20260607'

// ── Dados novos ─────────────────────────────────────────────────────────────
const FATURAMENTO_TOTAL = 4_301_900
const FATURAMENTO_ANIMAIS = 206
const FATURAMENTO_MEDIA = 20_883.01
const ACORDO_PCT_FATURAMENTO = 0.005
const ACORDO_DESCRICAO = '0,5% da venda (faturamento total do leilao)'

async function main() {
  // 1) Le o fechamento atual para reaproveitar vgv_total e comissao_assessoria.
  const { data: fech, error: selErr } = await supabase
    .from('bula_leilao_fechamento')
    .select('id,nome,vgv_total,comissao_assessoria,observacoes')
    .eq('id', FECHAMENTO_ID)
    .single()
  if (selErr) throw new Error(`SELECT fechamento: ${selErr.message}`)

  const vgvCobertura = Number(fech.vgv_total || 0)
  const comissaoAssessoria = Number(fech.comissao_assessoria || 0)
  const receitaBula = round2(FATURAMENTO_TOTAL * ACORDO_PCT_FATURAMENTO)
  const sobraBruta = round2(receitaBula - comissaoAssessoria)

  const observacoes = [
    'Fechamento registrado a partir das imagens de WhatsApp enviadas em 08/06/2026.',
    'Atualizado em 09/06/2026 com o faturamento total da leiloeira e o acordo renegociado.',
    `Faturamento total do leilao: ${brl(FATURAMENTO_TOTAL)} (${FATURAMENTO_ANIMAIS} animais, media ${brl(FATURAMENTO_MEDIA)}).`,
    `Acordo MUDOU: antes 1% do faturamento + 3% da venda da cobertura; agora 0,5% da venda (faturamento total).`,
    `Cobertura Bula: 8 lotes / 8 femeas / ${brl(vgvCobertura)}.`,
    `Receita Bula: 0,5% x ${brl(FATURAMENTO_TOTAL)} = ${brl(receitaBula)}.`,
    `Comissao de assessoria (sobre a cobertura): ${brl(comissaoAssessoria)}; sobra bruta: ${brl(sobraBruta)}.`,
  ].join('\n')

  // 2) Atualiza o fechamento.
  const fechPayload = {
    faturamento_total_leilao: FATURAMENTO_TOTAL,
    acordo_pct_faturamento: ACORDO_PCT_FATURAMENTO,
    acordo_pct_venda_cobertura: null,
    acordo_descricao: ACORDO_DESCRICAO,
    receita_bula: receitaBula,
    sobra_bruta: sobraBruta,
    observacoes,
    updated_at: new Date().toISOString(),
  }
  {
    const { error } = await supabase
      .from('bula_leilao_fechamento')
      .update(fechPayload)
      .eq('id', FECHAMENTO_ID)
    if (error) throw new Error(`UPDATE fechamento: ${error.message}`)
    console.log(`Fechamento atualizado (id=${FECHAMENTO_ID})`)
  }

  // 3) Atualiza o cronograma.
  {
    const { error } = await supabase
      .from('cronograma_leiloes')
      .update({
        faturamento_realizado: brl(FATURAMENTO_TOTAL),
        comissao_receber: brl(receitaBula),
        comissao: ACORDO_DESCRICAO,
      })
      .eq('id', CRONO_ID)
    if (error) throw new Error(`UPDATE cronograma: ${error.message}`)
    console.log(`Cronograma atualizado (id=${CRONO_ID})`)
  }

  // 4) Atualiza o card publico do leilao.
  {
    const { error } = await supabase
      .from('bula_leiloes')
      .update({ acordo_comissao: ACORDO_DESCRICAO })
      .eq('id', PUBLIC_ID)
    if (error) throw new Error(`UPDATE bula_leiloes: ${error.message}`)
    console.log(`Card publico atualizado (id=${PUBLIC_ID})`)
  }

  // 5) Atualiza a conta a receber (provisao de fluxo de caixa).
  {
    const obs = [
      `Provisao de fluxo de caixa do fechamento ${FECHAMENTO_ID}.`,
      `Acordo: ${ACORDO_DESCRICAO}.`,
      `Faturamento total: ${brl(FATURAMENTO_TOTAL)} | Receita Bula: 0,5% = ${brl(receitaBula)}.`,
      'Atualizado em 09/06/2026 (faturamento confirmado e acordo renegociado).',
      'Vencimento tecnico D+45 ate confirmacao financeira definitiva.',
    ].join(' ')
    const { error } = await supabase
      .from('erp_contas_receber')
      .update({ valor: receitaBula, observacoes: obs, updated_at: new Date().toISOString() })
      .eq('numero_documento', CR_DOCUMENTO)
    if (error) throw new Error(`UPDATE conta a receber: ${error.message}`)
    console.log(`Conta a receber atualizada (${CR_DOCUMENTO})`)
  }

  console.log('\nResumo:')
  console.log(`  Faturamento total  : ${brl(FATURAMENTO_TOTAL)} (${FATURAMENTO_ANIMAIS} animais)`)
  console.log(`  Acordo             : ${ACORDO_DESCRICAO}`)
  console.log(`  Cobertura Bula     : ${brl(vgvCobertura)}`)
  console.log(`  Receita Bula       : ${brl(receitaBula)}`)
  console.log(`  Comissao assessoria: ${brl(comissaoAssessoria)}`)
  console.log(`  Sobra bruta        : ${brl(sobraBruta)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
