/**
 * CORRIGE A COMISSÃO DO MEGA EVENTO EAO BAVIERA — MACHOS (12/07/2026).
 *
 *   npx tsx scripts/corrige-comissao-eao-machos-jul2026.mts            (simula)
 *   npx tsx scripts/corrige-comissao-eao-machos-jul2026.mts --apply    (grava)
 *
 * Os três títulos abertos para 25/08 somam exatamente os R$ 7.326 apurados no
 * fechamento — mas a distribuição entre as pessoas está trocada. Como o total
 * fecha, nenhuma conferência por valor pegaria: só a comparação nome a nome
 * contra `por_assessor` mostra.
 *
 *   pessoa            fechamento    título de 25/08
 *   Nane                   3.060    — (lançado como "Leonardo Serafim")
 *   Douglas Bispo          2.046    2.916
 *   Laila Oliveira         1.350    — (lançado como "Fábio Omena")
 *   Fábio Omena              870    1.350
 *
 * A Nane não entra em 25/08 de jeito nenhum: o combinado é acumular o ano e
 * pagar tudo em 28/12, e o título dela nessa data já existe. Então o de
 * "Leonardo Serafim" é cancelado, não redirecionado — senão a comissão dela
 * seria paga duas vezes.
 *
 * Depois da correção o leilão paga R$ 4.266 em 25/08 (Douglas + Laila + Fábio)
 * e R$ 3.060 em 28/12 (Nane). Soma 7.326, o apurado.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').replace(/^﻿/, '').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])) as Record<string, string>
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const APPLY = process.argv.includes('--apply')
const brl = (n: number) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const FECHAMENTO = '6a67f76b-5d50-48fe-9ab1-7eec161c4591'
const NOTA = '[CORRECAO 21/08/2026] Os titulos de 25/08 deste leilao somavam o total certo (R$ 7.326,00) com os nomes trocados entre as pessoas. Conferido contra por_assessor do fechamento: Nane 3.060 (paga em 28/12, acumulado), Douglas Bispo 2.046, Laila Oliveira 1.350, Fabio Omena 870.'

const AJUSTES = [
  { id: '5ac2a39a-8ca9-463f-a6c8-798910121111', quem: 'DOUGLAS BISPO', de: 2916, para: 2046 },
  { id: '0ebcc33d-df43-4780-a79c-ff52ed71d6c5', quem: 'FABIO OMENA', de: 1350, para: 870 },
]
const CANCELAR = { id: 'ac9e7f0b-3f9b-4453-8d22-4aaad8daa81e', quem: 'LEONARDO SERAFIM', valor: 3060 }
const CRIAR = {
  doc: 'com-jul26:6a67f76b:laila-oliveira',
  descricao: 'COMISSAO MEGA EVENTO EAO BAVIERA — Machos - LAILA OLIVEIRA (2%)',
  valor: 1350,
  fornecedor: '5b3d757f-46c3-45eb-8439-dd602c93fad8', // Laila de Sousa Oliveira
}

// molde: copia categoria/centro/emissão de um título irmão, para o novo nascer
// com a mesma cascata de referências dos outros
const { data: molde } = await sb.from('erp_contas_pagar')
  .select('categoria_id,centro_custo_id,emissao,vencimento,tags,origem').eq('id', AJUSTES[0].id).single()

console.log(`\nMEGA EVENTO EAO BAVIERA — Machos (12/07) · apurado R$ 7.326,00\n`)
for (const a of AJUSTES) console.log(`  ajustar   ${a.quem.padEnd(18)} ${brl(a.de)} → ${brl(a.para)}`)
console.log(`  cancelar  ${CANCELAR.quem.padEnd(18)} ${brl(CANCELAR.valor)}  (é a Nane; ela recebe em 28/12)`)
console.log(`  criar     ${'LAILA OLIVEIRA'.padEnd(18)} ${brl(CRIAR.valor)}`)
const novo25 = AJUSTES.reduce((s, a) => s + a.para, 0) + CRIAR.valor
console.log(`\n  25/08 passa de ${brl(AJUSTES.reduce((s, a) => s + a.de, 0) + CANCELAR.valor)} para ${brl(novo25)}`)
console.log(`  28/12 (Nane, já lançado): ${brl(CANCELAR.valor)}   ·   soma ${brl(novo25 + CANCELAR.valor)}`)

if (!APPLY) { console.log('\n[SIMULAÇÃO] rode com --apply para gravar.\n'); process.exit(0) }

for (const a of AJUSTES) {
  const { error } = await sb.from('erp_contas_pagar')
    .update({ valor: a.para, observacoes: NOTA }).eq('id', a.id)
  if (error) { console.error(a.quem, error.message); process.exit(1) }
}
{
  const { error } = await sb.from('erp_contas_pagar')
    .update({ status: 'cancelado', observacoes: `${NOTA}\nCANCELADO: este titulo era a comissao da NANE lancada com o nome errado. Ela nao recebe por leilao — acumula e recebe tudo em 28/12, onde o titulo dela ja existe. Pagar aqui seria pagar duas vezes.` })
    .eq('id', CANCELAR.id)
  if (error) { console.error('cancelar', error.message); process.exit(1) }
}
{
  const { error } = await sb.from('erp_contas_pagar').insert({
    descricao: CRIAR.descricao,
    numero_documento: CRIAR.doc,
    valor: CRIAR.valor,
    emissao: molde!.emissao,
    vencimento: molde!.vencimento,
    status: 'aberto',
    categoria_id: molde!.categoria_id,
    centro_custo_id: molde!.centro_custo_id,
    fornecedor_id: CRIAR.fornecedor,
    fechamento_id: FECHAMENTO,
    origem: molde!.origem,
    evento_key: `comissao:${FECHAMENTO}:laila-oliveira`,
    tags: molde!.tags,
    observacoes: `${NOTA}\nCriado: a comissao da Laila estava apurada no fechamento mas nao tinha titulo — o valor dela havia sido lancado sob o nome do Fabio Omena.`,
  })
  if (error) { console.error('criar', error.message); process.exit(1) }
}
console.log('\nOK — 2 ajustados, 1 cancelado, 1 criado.\n')
