// Projeta a FOLHA FIXA mensal (e a comissão fixa do SDR) como contas a pagar
// até o fim do ano — demanda do chefe (19/07/2026): "Subir custos fixos
// mensais projetados para o ano todo".
//
// Fonte dos valores: erp_folha_estrutura (cadastro canônico, migration 0056,
// seed da planilha "FOLHA & ESTRUTURA DE COMISSÕES"). A estrutura (aluguel/
// contabilidade/café/energia) já está projetada até dez/2026 pelo
// seed-despesas-fixas-2026.mjs — este script cobre o que faltava: a folha.
//
// Padrão dos lançamentos = folha de junho (BULA-2026-CP-FOLHA-JUN-*):
//   - 1 CP por colaborador/mês, emissão dia 1º, vencimento no último dia do mês
//   - categoria "Folha de Pagamento"; fornecedor herdado do lançamento de junho
//   - centro de custo: COM01 Salários Comerciais (assessores/SDR) ou
//     OP01 Salários Operacionais (tecnologia/marketing)
//   - comissão fixa do SDR (R$ 2.000/mês): CP separada, vencimento dia 25 do
//     mês SEGUINTE (ciclo normal de comissões), categoria Comissão Funcionário
// Idempotente: numero_documento estável; o que já existe é pulado.
//
// Uso:
//   DRY_RUN=1 node scripts/projeta-folha-fixa-2026.mjs   # só mostra
//   node scripts/projeta-folha-fixa-2026.mjs             # grava
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').replace(/^﻿/, '').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── Parâmetros ──────────────────────────────────────────────────────────────
const MES_INI = '2026-07' // inclusive
const MES_FIM = '2026-12' // inclusive

// IDs reais (sondados em 21/07/2026)
const CAT_FOLHA = '4c79d95f-a8a4-4aff-9f7a-cd82f974c4b3'     // Folha de Pagamento
const CAT_COMISSAO = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'  // Comissão Funcionário

const MES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MES_ABBR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const slug = (nome) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase()

function* meses(ini, fim) {
  let [y, m] = ini.split('-').map(Number)
  const [fy, fm] = fim.split('-').map(Number)
  while (y < fy || (y === fy && m <= fm)) {
    yield { y, m }
    m++; if (m > 12) { m = 1; y++ }
  }
}
const ultimoDia = (y, m) => new Date(y, m, 0).getDate()

// centros de custo por função (sondados: COM01 Salários Comerciais, OP01
// Salários Operacionais, COM02 Comissão Assessores)
const { data: centros } = await sb.from('erp_centros_custo').select('id,codigo')
const ccByCod = Object.fromEntries((centros || []).map((c) => [c.codigo, c.id]))
const centroDe = (funcao) => /assessor|sdr|parceiro/i.test(funcao || '') ? ccByCod['COM01'] : ccByCod['OP01']

// estrutura canônica
const { data: estrutura, error: e1 } = await sb.from('erp_folha_estrutura').select('*').eq('ativo', true).order('ordem')
if (e1) { console.error(e1); process.exit(1) }

// fornecedor herdado do lançamento de junho (match por slug do nome)
const { data: junho } = await sb.from('erp_contas_pagar').select('numero_documento,fornecedor_id').ilike('numero_documento', 'BULA-2026-CP-FOLHA-JUN-%')
const fornecedorDe = (nome) => (junho || []).find((r) => r.numero_documento.endsWith(`-${slug(nome)}`))?.fornecedor_id || null

// já existentes (idempotência)
const { data: existentes } = await sb.from('erp_contas_pagar').select('numero_documento').or('numero_documento.ilike.BULA-2026-CP-FOLHA-%,numero_documento.ilike.BULA-2026-CP-COM-SDR-%')
const jaTem = new Set((existentes || []).map((r) => r.numero_documento))

const inserts = []
for (const { y, m } of meses(MES_INI, MES_FIM)) {
  const mesNome = MES_NOME[m - 1], abbr = MES_ABBR[m - 1]
  const venc = `${y}-${String(m).padStart(2, '0')}-${String(ultimoDia(y, m)).padStart(2, '0')}`
  const emissao = `${y}-${String(m).padStart(2, '0')}-01`
  for (const col of estrutura) {
    if (!(Number(col.salario_fixo) > 0)) continue
    const doc = `BULA-2026-CP-FOLHA-${abbr}-${slug(col.nome)}`
    if (jaTem.has(doc)) continue
    inserts.push({
      descricao: `Folha ${mesNome}/${y} - ${col.nome}`,
      numero_documento: doc,
      valor: Number(col.salario_fixo),
      emissao, vencimento: venc, status: 'aberto',
      categoria_id: CAT_FOLHA,
      centro_custo_id: centroDe(col.funcao),
      fornecedor_id: fornecedorDe(col.nome),
      recorrencia: 'mensal',
      tags: ['folha', String(y), mesNome.toLowerCase(), 'projecao-anual'],
      observacoes: `Folha fixa de ${col.funcao || 'colaborador'} — projeção anual de custos fixos (erp_folha_estrutura, 21/07/2026).`,
    })
  }
  // comissão fixa mensal (SDR): vence dia 25 do mês seguinte, ciclo normal
  for (const col of estrutura) {
    if (!(Number(col.comissao_fixa) > 0)) continue
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
    const doc = `BULA-2026-CP-COM-SDR-${slug(col.nome)}-${y}-${String(m).padStart(2, '0')}`
    if (jaTem.has(doc)) continue
    inserts.push({
      descricao: `COMISSAO FIXA ${(col.funcao || '').toUpperCase()} - ${col.nome} - ref. ${mesNome}/${y}`,
      numero_documento: doc,
      valor: Number(col.comissao_fixa),
      emissao, vencimento: `${ny}-${String(nm).padStart(2, '0')}-25`, status: 'aberto',
      categoria_id: CAT_COMISSAO,
      centro_custo_id: ccByCod['COM02'] || centroDe(col.funcao),
      fornecedor_id: fornecedorDe(col.nome),
      recorrencia: 'mensal',
      tags: ['comissao', String(y), mesNome.toLowerCase(), 'projecao-anual'],
      observacoes: `Comissão fixa mensal (${brl(col.comissao_fixa)}) — erp_folha_estrutura, projeção anual 21/07/2026.`,
    })
  }
}

const total = inserts.reduce((s, r) => s + r.valor, 0)
console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${inserts.length} títulos a criar · total ${brl(total)}`)
for (const r of inserts) console.log(' ', r.vencimento, '|', brl(r.valor).padStart(14), '|', r.descricao)
if (!DRY_RUN && inserts.length) {
  const { error } = await sb.from('erp_contas_pagar').insert(inserts)
  if (error) { console.error(error); process.exit(1) }
  console.log('OK — títulos criados.')
}
