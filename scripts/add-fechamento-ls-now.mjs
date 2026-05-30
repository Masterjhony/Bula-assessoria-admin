// Cria o fechamento do "2º Leilão LS Now" (LS Agropecuária / e-rural, 30/05/2026).
// Fonte: mensagens encaminhadas por Marcelo Primo Carneiro (WhatsApp, 17:16–17:25)
// + dashboard de faturamento (RuralPlay/e-rural).
//
// Fronteira de dados (memória fechamento-vs-erp-data-boundary): este registro
// guarda SÓ dados comerciais/operacionais. NÃO preenche receita_bula,
// comissao_assessoria, sobra_bruta nem acordo_* (esses vivem no ERP).
//
// Convenção (igual aos fechamentos anteriores): VGV = parcela × nº de parcelas.
//   - Lotes LS Now (touros): 40 parcelas (informado "40x").
//   - Lotes Nelore FPA (fêmeas): 30 parcelas (decisão do chefe).
// Idempotente: busca por nome+data e atualiza em vez de duplicar.
//
// Uso: node scripts/add-fechamento-ls-now.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NOME = '2º Leilão LS Now – 30/05/2026'
const DATA = '2026-05-30'
const FATURAMENTO_TOTAL = 1_197_000   // dashboard (auction/leiloeira)

// ── Cobertura Bula — 1 lance por linha (parcela × parcelas) ──
const lances = [
  { uf: 'TO', lote: '10', parcela: 780,   parcelas: 40, animais: 1, sexo: 'M', empresa: 'Bula Assessoria', assessor: 'Fábio Omena',  vendedor: 'LS Agropecuária', comprador: 'Agmar Inácio de Oliveira', fazenda: 'Fazenda Santa Luzia',      cidade: 'Coméia',               observacao: '1 touro Nelore P.O. — parcela R$ 780 × 40' },
  { uf: 'MT', lote: '25', parcela: 600,   parcelas: 40, animais: 1, sexo: 'M', empresa: 'Bula Assessoria', assessor: 'Fábio Omena',  vendedor: 'LS Agropecuária', comprador: 'Sr José Roberto Mazon',    fazenda: 'Fazenda Vale do Ipê',     cidade: 'Ribeirão Cascalheira', observacao: '1 touro — parcela R$ 600 × 40' },
  { uf: 'PA', lote: '30', parcela: 9000,  parcelas: 30, animais: 1, sexo: 'F', empresa: 'Bula Assessoria', assessor: 'Fábio Omena',  vendedor: 'LS Agropecuária', comprador: 'Nelore FPA',               fazenda: 'Fazenda Paraíso do Acará', cidade: '',                    observacao: '1 fêmea — parcela R$ 9.000 × 30 (parcela alta para fêmea; conferir valor)' },
  { uf: 'PA', lote: '31', parcela: 1600,  parcelas: 30, animais: 1, sexo: 'F', empresa: 'Bula Assessoria', assessor: 'Douglas Bispo', vendedor: 'LS Agropecuária', comprador: 'Nelore FPA',               fazenda: 'Fazenda Paraíso do Acará', cidade: '',                    observacao: '1 fêmea — parcela R$ 1.600 × 30' },
  { uf: 'PA', lote: '32', parcela: 1450,  parcelas: 30, animais: 1, sexo: 'F', empresa: 'Bula Assessoria', assessor: 'Fábio Omena',  vendedor: 'LS Agropecuária', comprador: 'Nelore FPA',               fazenda: 'Fazenda Paraíso do Acará', cidade: '',                    observacao: '1 fêmea — parcela R$ 1.450 × 30' },
  { uf: 'PA', lote: '33', parcela: 1250,  parcelas: 30, animais: 1, sexo: 'F', empresa: 'Bula Assessoria', assessor: 'Fábio Omena',  vendedor: 'LS Agropecuária', comprador: 'Nelore FPA',               fazenda: 'Fazenda Paraíso do Acará', cidade: '',                    observacao: '1 fêmea — parcela R$ 1.250 × 30' },
].map((l) => ({ ...l, vgv: l.parcela * l.parcelas }))

// ── Derivações ───────────────────────────────────────────────
const vgv_total = lances.reduce((s, l) => s + l.vgv, 0)
const animais_vendidos = lances.reduce((s, l) => s + l.animais, 0)
const lotes_vendidos = lances.length
const maior_lance = Math.max(...lances.map((l) => l.parcela))
const ticket_medio = Math.round(vgv_total / animais_vendidos)

// por_assessor (agregado)
const byAssessor = new Map()
for (const l of lances) {
  const cur = byAssessor.get(l.assessor) ?? { nome: l.assessor, empresa: l.empresa, transacoes: 0, animais: 0, vgv: 0 }
  cur.transacoes += 1; cur.animais += l.animais; cur.vgv += l.vgv
  byAssessor.set(l.assessor, cur)
}
const por_assessor = [...byAssessor.values()]
  .sort((a, b) => b.vgv - a.vgv)
  .map((a, i) => ({
    posicao: i + 1, nome: a.nome, empresa: a.empresa,
    transacoes: a.transacoes, animais: a.animais, vgv: a.vgv,
    ticket_medio: Math.round(a.vgv / a.animais),
    pct_total: Math.round((a.vgv / vgv_total) * 10000) / 10000,
  }))

// compradores (agregado, ranqueado)
const byComprador = new Map()
for (const l of lances) {
  const cur = byComprador.get(l.comprador) ?? { comprador: l.comprador, fazenda: l.fazenda, cidade: l.cidade, uf: l.uf, lotes: 0, animais: 0, vgv: 0 }
  cur.lotes += 1; cur.animais += l.animais; cur.vgv += l.vgv
  byComprador.set(l.comprador, cur)
}
const compradores = [...byComprador.values()]
  .sort((a, b) => b.vgv - a.vgv)
  .map((c, i) => ({ rank: i + 1, ...c }))

// por_estado (agregado)
const byUf = new Map()
for (const l of lances) {
  const cur = byUf.get(l.uf) ?? { uf: l.uf, lotes: 0, animais: 0, vgv: 0 }
  cur.lotes += 1; cur.animais += l.animais; cur.vgv += l.vgv
  byUf.set(l.uf, cur)
}
const por_estado = [...byUf.values()].sort((a, b) => b.vgv - a.vgv)

const compradores_unicos = compradores.length
const estados_alcancados = por_estado.length
const cobertura = ((vgv_total / FATURAMENTO_TOTAL) * 100).toFixed(2)

const observacoes = [
  'Leilão da LS Agropecuária (e-rural / RuralPlay), modalidade virtual — touros Nelore P.O. (30/05) + garrotas (LS Collection). Fonte: mensagens encaminhadas por Marcelo Primo Carneiro no WhatsApp (17:16–17:25) + dashboard de faturamento.',
  `TOTAL DO LEILÃO (dashboard): faturamento R$ ${FATURAMENTO_TOTAL.toLocaleString('pt-BR')} · 40 lotes vendidos (40/40) · 55 animais (24 touros Nelore P.O. + 31 garrotas Nelore P.O.) · 27 compradores · média por animal R$ 21.763,63.`,
  `NOSSA COBERTURA (Bula): ${lotes_vendidos} lotes / ${animais_vendidos} animais / R$ ${vgv_total.toLocaleString('pt-BR')} / ${compradores_unicos} compradores / ${estados_alcancados} UFs → cobertura ${cobertura}% do faturamento.`,
  'Convenção de VGV: parcela × parcelas. Touros LS Now em 40 parcelas ("40x"); fêmeas Nelore FPA em 30 parcelas (decisão do chefe).',
  'Por assessor: Fábio Omena (Bula) — 5 lances / 5 animais / R$ 406.200 (lotes 10, 25, 30, 32, 33). Douglas Bispo (Bula) — 1 lance / 1 fêmea / R$ 48.000 (lote 31). Compradores: Nelore FPA / Fazenda Paraíso do Acará-PA levou os 4 lotes de fêmeas (lotes 30–33).',
  '⚠ PENDÊNCIAS (fora do VGV/ranking até confirmação):',
  '  (a) Lote M5 — 4 machos, parcela R$ 500 × 40 (≈ R$ 80.000): encaminhado sem "Levamos"/assessor/comprador. Confirmar se é cobertura Bula e quem assessorou.',
  '  (b) Arthur Lopes / Fazenda Recanto / Novo Repartimento-PA, com Fabricio Hyppolito (Bula Assessoria): sem nº de lote e sem valor → VGV pendente. OBS: Fabricio Hyppolito não está no roster (leiloes_equipe) — cadastrar se for assessor recorrente.',
  '  (c) Lote 30: parcela R$ 9.000 × 30 = R$ 270.000 — valor alto para uma fêmea; conferir a parcela.',
  'Acordo comercial: 3% do faturamento total (receita Bula = 3% × R$ 1.197.000 = R$ 35.910). Acordo, comissões e receita são tratados no ERP, não neste registro (fronteira de dados).',
].join('\n')

const payload = {
  nome: NOME,
  data: DATA,
  local: '',
  lotes_ofertados: 40,
  lotes_vendidos,
  animais_vendidos,
  vgv_total,
  ticket_medio,
  maior_lance,
  compradores_unicos,
  estados_alcancados,
  por_assessor,
  por_estado,
  compradores,
  lances,
  perfil_genetico: [],
  faturamento_total_leilao: FATURAMENTO_TOTAL,
  observacoes,
  // receita_bula / comissao_assessoria / sobra_bruta / acordo_* → ERP (não setados)
}

// ── Upsert idempotente ───────────────────────────────────────
const { data: existing, error: selErr } = await supabase
  .from('bula_leilao_fechamento')
  .select('id')
  .eq('nome', NOME)
  .eq('data', DATA)
  .maybeSingle()
if (selErr) { console.error('SELECT:', selErr.message); process.exit(1) }

if (existing) {
  const { error } = await supabase
    .from('bula_leilao_fechamento')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) { console.error('UPDATE:', error.message); process.exit(1) }
  console.log(`Fechamento atualizado (id=${existing.id})`)
} else {
  const { data: ins, error } = await supabase
    .from('bula_leilao_fechamento')
    .insert(payload)
    .select('id')
    .single()
  if (error) { console.error('INSERT:', error.message); process.exit(1) }
  console.log(`Fechamento criado (id=${ins.id})`)
}

console.log(`\nResumo:`)
console.log(`  VGV cobertura Bula : R$ ${vgv_total.toLocaleString('pt-BR')}`)
console.log(`  Faturamento leilão : R$ ${FATURAMENTO_TOTAL.toLocaleString('pt-BR')}`)
console.log(`  Cobertura          : ${cobertura}%`)
console.log(`  Lotes/animais      : ${lotes_vendidos}/${animais_vendidos}`)
console.log(`  Ticket médio       : R$ ${ticket_medio.toLocaleString('pt-BR')}`)
console.log(`  Maior parcela      : R$ ${maior_lance.toLocaleString('pt-BR')}`)
console.log(`  Assessores         : ${por_assessor.map((a) => `${a.nome} (R$ ${a.vgv.toLocaleString('pt-BR')})`).join(', ')}`)
