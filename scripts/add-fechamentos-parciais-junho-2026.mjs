// Fechamentos PARCIAIS de 4 leilões de junho/2026 que estavam sem fechamento.
// Cobertura conhecida = lotes do Fábio Omena na "PLANILHA COMISSÃO BULA junho26.xlsx".
// Faturamento total do leilão e cobertura de outros assessores ficam PENDENTES
// (a completar quando vier o resumo da leiloeira) — por isso receita_bula e a
// conta a receber NÃO são criadas aqui. Cria fechamento + CP de comissão (Fábio 3%).
//
// Idempotente (fechamento por nome+data; CP por numero_documento).
// Uso: DRY_RUN=1 node scripts/add-fechamentos-parciais-junho-2026.mjs | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n) => Math.round(Number(n) * 100) / 100

const CAT_COMISSAO = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e' // Comissão Funcionário
const CC_ASSESSORES = '52dd8ed0-0c0a-4524-86bd-01dc121487b3' // COM02
const FORN_FABIO = '1739c44b-b46a-4c1d-8adf-f6509fb44891'
const PARCELAS = 30

const LEILOES = [
  { slug: 'TRESMAR-JUN', nome: '3º Leilão Nelore Tresmar - 11/06/2026', data: '2026-06-11', blKey: 'TRESMAR',
    lots: [{ lote: '29', tipo: 'fêmea', vgv: 30000, comprador: 'João Pereira' }] },
  { slug: 'RIO-BONITO', nome: '8º Fazenda Rio Bonito - 20/06/2026', data: '2026-06-20', blKey: 'RIO BONITO',
    lots: [{ lote: '36', tipo: 'macho', vgv: 16500, comprador: 'Vanilda Ferreira' }] },
  { slug: 'MEAB-MODELO', nome: 'Leilão Virtual Nelore MEAB & Fazenda Modelo - 23/06/2026', data: '2026-06-23', blKey: 'MEAB',
    lots: [{ lote: '7', tipo: 'fêmea', vgv: 30600, comprador: 'Rodrigo Rocha' }, { lote: '15', tipo: 'fêmea', vgv: 27600, comprador: 'Rodrigo Rocha' }, { lote: '19', tipo: 'fêmea', vgv: 22500, comprador: 'Rodrigo Rocha' }] },
  { slug: 'MAGDA', nome: 'Leilão Nelore Magda Na Origem - 28/06/2026', data: '2026-06-28', blKey: 'MAGDA',
    lots: [{ lote: '25', tipo: 'macho', vgv: 48000, comprador: 'Klaus' }] },
]

for (const L of LEILOES) {
  const vgv_total = L.lots.reduce((s, l) => s + l.vgv, 0)
  const comissao = r2(vgv_total * 0.03)
  const por_assessor = [{ posicao: 1, nome: 'Fábio Omena', empresa: 'Bula Assessoria', transacoes: L.lots.length, animais: L.lots.length, vgv: vgv_total, comissao_pct: 0.03, comissao }]
  const observacoes = [
    `FECHAMENTO PARCIAL (montado na conferência 30/06). Cobertura conhecida: lotes do Fábio Omena na planilha de comissão de junho.`,
    `Cobertura Bula (parcial): ${L.lots.length} lote(s) / ${brl(vgv_total)} (parcela × ${PARCELAS}). Comissão Fábio 3% = ${brl(comissao)}.`,
    `PENDENTE: faturamento total do leilão (base do 1% da receita Bula), acordo da leiloeira e cobertura de outros assessores. Conta a receber NÃO emitida até o faturamento ser confirmado.`,
  ].join('\n')
  const payload = {
    nome: L.nome, data: L.data, local: 'Virtual',
    lotes_ofertados: L.lots.length, lotes_vendidos: L.lots.length, animais_vendidos: L.lots.length,
    vgv_total, ticket_medio: Math.round(vgv_total / L.lots.length), maior_lance: Math.max(...L.lots.map((l) => l.vgv)),
    compradores_unicos: new Set(L.lots.map((l) => l.comprador)).size, estados_alcancados: 0,
    por_assessor, por_estado: [], compradores: [],
    lances: L.lots.map((l) => ({ lote: l.lote, animais: 1, vgv: l.vgv, parcela: Math.round(l.vgv / PARCELAS), parcelas: PARCELAS, assessor: 'Fábio Omena', empresa: 'Bula Assessoria', comprador: l.comprador })),
    perfil_genetico: [],
    faturamento_total_leilao: null, acordo_pct_faturamento: null, acordo_pct_venda_cobertura: null,
    acordo_descricao: 'PENDENTE — aguardando resumo/faturamento da leiloeira.',
    receita_bula: null, comissao_assessoria: comissao, sobra_bruta: null, observacoes,
  }

  console.log(`\n${L.nome}\n  VGV cobertura(parcial): ${brl(vgv_total)} | Comissão Fábio: ${brl(comissao)} | Receita: PENDENTE`)
  if (DRY_RUN) { console.log('  [DRY_RUN]'); continue }

  const { data: ex } = await sb.from('bula_leilao_fechamento').select('id').eq('data', L.data).ilike('nome', `%${L.blKey}%`).maybeSingle()
  let fechId
  if (ex) { await sb.from('bula_leilao_fechamento').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', ex.id); fechId = ex.id; console.log('  -> fechamento ATUALIZADO', fechId) }
  else { const { data, error } = await sb.from('bula_leilao_fechamento').insert(payload).select('id').single(); if (error) throw new Error(error.message); fechId = data.id; console.log('  -> fechamento CRIADO', fechId) }

  await sb.from('bula_leiloes').update({ realizado_bula: vgv_total }).eq('data', L.data).ilike('nome', `%${L.blKey}%`)

  const doc = `BULA-2026-CP-COM-${L.slug}-FABIO`
  const cp = {
    descricao: `COMISSAO ${L.nome.toUpperCase()} - FÁBIO OMENA (3%)`,
    fornecedor_id: FORN_FABIO, categoria_id: CAT_COMISSAO, centro_custo_id: CC_ASSESSORES,
    valor: comissao, emissao: L.data, vencimento: '2026-07-25', status: 'aberto',
    numero_documento: doc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
    observacoes: `Comissão 3% sobre VGV de cobertura ${brl(vgv_total)}. Fechamento PARCIAL ${fechId}. Gerada na conferência 30/06.`,
    tags: ['a-pagar', 'comissao', '2026', 'leilao', L.slug.toLowerCase(), 'parcial'],
  }
  const { data: exCp } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', doc).maybeSingle()
  if (exCp) { await sb.from('erp_contas_pagar').update({ ...cp, updated_at: new Date().toISOString() }).eq('id', exCp.id); console.log('  -> CP comissão ATUALIZADA', brl(comissao)) }
  else { const { error } = await sb.from('erp_contas_pagar').insert(cp); if (error) throw new Error(error.message); console.log('  -> CP comissão CRIADA', brl(comissao), doc) }
}
console.log('\nConcluído.')
