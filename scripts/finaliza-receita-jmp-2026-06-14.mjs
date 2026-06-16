// Finaliza receita/sobra dos fechamentos do 10o Leilao Nelore JMP apos a leiloeira
// (Programa Leiloes) informar o faturamento total do leilao.
//
// Fonte: "Somatoria - Leiloes JMP 2026.pdf" (COMPARATIVO Nelore JMP), enviado 16/06/2026:
//   - Total Fêmeas (13/06): R$ 10.996.800,00 (232,5 animais)
//   - Total Machos  (14/06): R$ 22.498.400,00 (922,5 animais)
//   - Somatoria 2026: R$ 33.495.200,00 / 1155 animais / 162 compradores / 17 estados
//
// Acordo Bula x JMP = 0,5% sobre o faturamento TOTAL do leilao.
//
// Uso:
//   DRY_RUN=1 node scripts/finaliza-receita-jmp-2026-06-14.mjs
//   node scripts/finaliza-receita-jmp-2026-06-14.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => n == null ? '(pendente)' : `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const round2 = (n) => Math.round(n * 100) / 100
const addDays = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }

const ACORDO_PCT = 0.005
const CLIENTE_ID = 'cdfed41f-ff46-4519-8dff-10d8d8fccaa5' // PROGRAMA LEILOES
const CATEGORIA_ID = 'e74434bd-3366-4015-9268-15d6640cf15f' // Comissao Leilao

const ALVOS = [
  {
    fechamentoId: 'c0f291bb-17bc-4b10-b320-c5ed6e767057',
    rotulo: 'Touros 14/06',
    data: '2026-06-14',
    cronogramaNome: '%TOUROS%JMP%',
    faturamento_total_leilao: 22498400,
    crDescricao: '10o LEILAO NELORE JMP - TOUROS - COMISSAO BULA',
    crDoc: 'BULA-2026-CR-JMP-TOUROS-20260614',
    crTags: ['leilao', '2026', 'junho', 'jmp', 'touros', 'comissao'],
  },
  {
    fechamentoId: 'cd19dba3-792d-42e3-a563-f6025528dd51',
    rotulo: 'Bezerras/Femeas 13/06',
    data: '2026-06-13',
    cronogramaNome: '%BEZERRAS%JMP%',
    faturamento_total_leilao: 10996800,
    crDescricao: '10o LEILAO NELORE JMP - FEMEAS/BEZERRAS - COMISSAO BULA',
    crDoc: 'BULA-2026-CR-JMP-FEMEAS-20260613',
    crTags: ['leilao', '2026', 'junho', 'jmp', 'femeas', 'bezerras', 'comissao'],
  },
]

const ACORDO_DESC = (fat) =>
  `Acordo especial Bula x JMP: 0,5% sobre o faturamento total do leilao. ` +
  `Faturamento total (Programa Leiloes): ${brl(fat)}. Receita Bula = 0,5% x ${brl(fat)} = ${brl(round2(fat * ACORDO_PCT))}.`

console.log(DRY_RUN ? '*** DRY RUN — nada sera gravado ***' : '*** GRAVANDO EM PRODUCAO ***')

for (const alvo of ALVOS) {
  // estado atual
  const { data: fech, error: selErr } = await supabase
    .from('bula_leilao_fechamento')
    .select('id,nome,vgv_total,comissao_assessoria,observacoes')
    .eq('id', alvo.fechamentoId).single()
  if (selErr) throw new Error(`SELECT fechamento ${alvo.rotulo}: ${selErr.message}`)

  const fat = alvo.faturamento_total_leilao
  const receita_bula = round2(fat * ACORDO_PCT)
  const comissao = Number(fech.comissao_assessoria || 0)
  const sobra_bruta = round2(receita_bula - comissao)

  console.log(`\n================ ${alvo.rotulo} — ${fech.nome} ================`)
  console.log(`  Faturamento total leilao : ${brl(fat)}`)
  console.log(`  Receita Bula (0,5%)      : ${brl(receita_bula)}`)
  console.log(`  Comissao pisteiros       : ${brl(comissao)}`)
  console.log(`  Sobra bruta              : ${brl(sobra_bruta)}`)
  console.log(`  Imposto est. (18% receita): ${brl(round2(receita_bula * 0.18))}`)
  console.log(`  Lucro liq. (s/ despesas) : ${brl(round2(receita_bula - comissao - receita_bula * 0.18))}`)

  const novaObs =
    (fech.observacoes ? fech.observacoes + '\n' : '') +
    `[16/06/2026] Faturamento total informado pela leiloeira (Somatoria Leiloes JMP 2026): ${brl(fat)}. ` +
    `Receita Bula finalizada em 0,5% = ${brl(receita_bula)}; sobra bruta = ${brl(sobra_bruta)}. ` +
    `Conta a receber gerada (${alvo.crDoc}).`

  if (!DRY_RUN) {
    const { error: updErr } = await supabase.from('bula_leilao_fechamento').update({
      faturamento_total_leilao: fat,
      receita_bula,
      sobra_bruta,
      acordo_pct_faturamento: ACORDO_PCT,
      acordo_descricao: ACORDO_DESC(fat),
      observacoes: novaObs,
      updated_at: new Date().toISOString(),
    }).eq('id', alvo.fechamentoId)
    if (updErr) throw new Error(`UPDATE fechamento ${alvo.rotulo}: ${updErr.message}`)
    console.log(`  -> fechamento atualizado`)

    // cronograma
    const { error: cronErr } = await supabase.from('cronograma_leiloes').update({
      comissao_receber: brl(receita_bula),
      faturamento_realizado: brl(fat),
    }).eq('data', alvo.data).ilike('nome', alvo.cronogramaNome)
    if (cronErr) console.log(`  (aviso) cronograma nao atualizado: ${cronErr.message}`)
    else console.log(`  -> cronograma atualizado`)

    // conta a receber (idempotente por numero_documento)
    const crPayload = {
      descricao: alvo.crDescricao,
      cliente_id: CLIENTE_ID,
      categoria_id: CATEGORIA_ID,
      valor: receita_bula,
      valor_recebido: 0,
      emissao: alvo.data,
      vencimento: addDays(alvo.data, 45),
      status: 'aberto',
      numero_documento: alvo.crDoc,
      parcela: 1,
      total_parcelas: 1,
      recorrencia: 'nenhuma',
      observacoes:
        `Comissao Bula = 0,5% sobre o faturamento total do leilao (${brl(fat)}) = ${brl(receita_bula)}. ` +
        `Origem do faturamento: Somatoria - Leiloes JMP 2026 (leiloeira Programa Leiloes), recebida 16/06/2026. ` +
        `Vinculado ao fechamento ${alvo.fechamentoId}. Vencimento tecnico D+45.`,
      tags: alvo.crTags,
      anexos: [],
    }
    const { data: existingCr, error: selCrErr } = await supabase
      .from('erp_contas_receber').select('id').eq('numero_documento', alvo.crDoc).maybeSingle()
    if (selCrErr) throw new Error(`SELECT CR ${alvo.rotulo}: ${selCrErr.message}`)
    if (existingCr) {
      const { error } = await supabase.from('erp_contas_receber')
        .update({ ...crPayload, updated_at: new Date().toISOString() }).eq('id', existingCr.id)
      if (error) throw new Error(`UPDATE CR ${alvo.rotulo}: ${error.message}`)
      console.log(`  -> conta a receber ATUALIZADA (id=${existingCr.id}) ${brl(receita_bula)}`)
    } else {
      const { data, error } = await supabase.from('erp_contas_receber').insert(crPayload).select('id').single()
      if (error) throw new Error(`INSERT CR ${alvo.rotulo}: ${error.message}`)
      console.log(`  -> conta a receber CRIADA (id=${data.id}) ${brl(receita_bula)} venc ${crPayload.vencimento}`)
    }
  } else {
    console.log(`  [DRY_RUN] nada gravado. CR seria ${alvo.crDoc} = ${brl(receita_bula)} venc ${addDays(alvo.data, 45)}`)
  }
}

console.log('\nConcluido.')
