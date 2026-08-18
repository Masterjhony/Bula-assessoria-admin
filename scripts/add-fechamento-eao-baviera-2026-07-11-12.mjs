// Fechamentos do MEGA EVENTO EAO BAVIERA — Fêmeas (SÁB 11/07) e Machos (DOM 12/07).
//
// Fonte: lances encaminhados pelo Marcelo Primo Carneiro no WhatsApp (12-13/07/2026),
// cobertura Bula por lote ("Foi com <pisteiro> da Bula Assessoria").
//
// Definições confirmadas pelo cliente (13/07/2026):
// - O valor de cada lance é a PARCELA mensal; condição 30 parcelas.
// - VGV do lote = parcela × 30 (NÃO multiplica pela quantidade de animais).
// - Comissão do pisteiro Bula = 2% sobre o VGV de cobertura.
// - Lances SEM valor informado ficam de FORA por ora (sinalizados abaixo):
//     Fêmeas: M04 (3F, Fábio Omena)
//     Machos: 474 (Nane + Felipinho Capucci) e 513/515 (Nane)
// - Parte financeira (acordo %, receita Bula, imposto, lucro) é o passo separado
//   no ERP (Fechamento Leilões). Faturamento total do dia dos MACHOS ainda não
//   foi enviado pela leiloeira. Por isso receita_bula/acordo ficam nulos aqui.
//
// Cria SOMENTE os registros em bula_leilao_fechamento (não mexe em bula_leiloes,
// cronograma, agenda nem ERP). comissao_assessoria é preenchida (custo 2%).
//
// Uso: DRY_RUN=1 node scripts/add-fechamento-eao-baviera-2026-07-11-12.mjs
//      (sem DRY_RUN grava em produção)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100
const PARCELAS = 30
const COMISSAO_PCT = 0.02
const VENDEDOR = 'EAO Baviera'

const UF_NOME = { PA: 'Pará', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PR: 'Paraná', MA: 'Maranhão', BA: 'Bahia', AC: 'Acre' }

// vgv = parcela × 30 (por LOTE, sem multiplicar por animais — confirmado pelo cliente).
function buildFechamento({ nome, data, local, lots, faturamento_total_leilao, observacoesExtra }) {
  const L = lots.map((l) => ({ ...l, vgv: r2(l.parcela * PARCELAS), empresa: 'Bula Assessoria' }))
  const vgv_total = r2(L.reduce((s, l) => s + l.vgv, 0))
  const total_animais = L.reduce((s, l) => s + l.animais, 0)

  // por assessor
  const byA = new Map()
  for (const l of L) {
    const cur = byA.get(l.assessor) || { nome: l.assessor, empresa: l.empresa, transacoes: 0, animais: 0, vgv: 0 }
    cur.transacoes += 1; cur.animais += l.animais; cur.vgv += l.vgv
    byA.set(l.assessor, cur)
  }
  const por_assessor = [...byA.values()].sort((a, b) => b.vgv - a.vgv).map((a, i) => ({
    posicao: i + 1, nome: a.nome, empresa: a.empresa, transacoes: a.transacoes, animais: a.animais, vgv: r2(a.vgv),
    ticket_medio: Math.round(a.vgv / a.animais), pct_total: r2(a.vgv / vgv_total * 100) / 100,
    comissao_pct: COMISSAO_PCT, comissao: r2(a.vgv * COMISSAO_PCT),
  }))
  const comissao_assessoria = r2(por_assessor.reduce((s, a) => s + a.comissao, 0))

  // compradores
  const byC = new Map()
  for (const l of L) {
    const k = `${l.comprador}|${l.uf}`
    const cur = byC.get(k) || { comprador: l.comprador, fazenda: l.fazenda, cidade: l.cidade, uf: l.uf, lotes: 0, animais: 0, vgv: 0 }
    cur.lotes += 1; cur.animais += l.animais; cur.vgv += l.vgv
    byC.set(k, cur)
  }
  const compradores = [...byC.values()].sort((a, b) => b.vgv - a.vgv).map((c, i) => ({ rank: i + 1, ...c, vgv: r2(c.vgv) }))

  // por estado
  const byE = new Map()
  for (const l of L) {
    const cur = byE.get(l.uf) || { uf: l.uf, estado: UF_NOME[l.uf] || l.uf, lotes: 0, animais: 0, vgv: 0 }
    cur.lotes += 1; cur.animais += l.animais; cur.vgv += l.vgv
    byE.set(l.uf, cur)
  }
  const por_estado = [...byE.values()].sort((a, b) => b.vgv - a.vgv).map((e) => ({
    ...e, vgv: r2(e.vgv), ticket_medio: Math.round(e.vgv / e.animais), pct_total: r2(e.vgv / vgv_total * 100) / 100,
  }))

  const distribuicao_empresa = [{ empresa: 'Bula Assessoria', transacoes: L.length, animais: total_animais, vgv: vgv_total, pct_total: 1, ticket_medio: Math.round(vgv_total / total_animais) }]

  const lances = L.map((l) => ({
    lote: l.lote, animais: l.animais, vgv: l.vgv, parcela: l.parcela, parcelas: PARCELAS,
    assessor: l.assessor, empresa: l.empresa, vendedor: VENDEDOR,
    comprador: [l.comprador, l.fazenda, l.cidade ? `${l.cidade}/${l.uf}` : l.uf].filter(Boolean).join(' · '),
  }))

  const observacoes = [
    `Fechamento de cobertura Bula do MEGA EVENTO EAO BAVIERA (${data}) — dados dos lances encaminhados pelo Marcelo Primo Carneiro no WhatsApp.`,
    `Cobertura Bula: ${L.length} lotes / ${total_animais} animais / VGV ${brl(vgv_total)} (parcela × ${PARCELAS} por lote).`,
    `Comissão pisteiros 2% = ${brl(comissao_assessoria)}.`,
    `PENDENTE (passo ERP): acordo/receita Bula e imposto. ${faturamento_total_leilao ? `Faturamento total do dia = ${brl(faturamento_total_leilao)}.` : 'Faturamento total do dia ainda não informado pela leiloeira.'}`,
    observacoesExtra,
  ].filter(Boolean).join('\n')

  const payload = {
    nome, data, local,
    lotes_ofertados: L.length, lotes_vendidos: L.length, animais_vendidos: total_animais,
    vgv_total, ticket_medio: Math.round(vgv_total / total_animais), maior_lance: Math.max(...L.map((l) => l.vgv)),
    compradores_unicos: compradores.length, estados_alcancados: por_estado.length,
    por_assessor, por_estado, compradores, lances,
    perfil_genetico: [], lotes_catalogo: [], distribuicao_empresa,
    faturamento_total_leilao: faturamento_total_leilao ?? null,
    acordo_pct_faturamento: null, acordo_pct_venda_cobertura: null, acordo_descricao: null,
    receita_bula: null, sobra_bruta: null, comissao_assessoria,
    observacoes,
  }
  return { payload, vgv_total, total_animais, comissao_assessoria, por_assessor, L }
}

// ---- FÊMEAS — SÁBADO 11/07 (sem M04, que veio sem valor) ----
const femeas = buildFechamento({
  nome: 'MEGA EVENTO EAO BAVIERA — Fêmeas',
  data: '2026-07-11', local: '',
  faturamento_total_leilao: 14714090,
  observacoesExtra: 'Lote M04 (3F, Fábio Omena) fora por não ter valor informado. M13 é 1 Macho Mangalarga vendido no dia das fêmeas. Lote 30: comprador atribuído a Elias Abdo (Cruzeiro do Oeste/PR); msg também citava Dr Romualdo.',
  lots: [
    { lote: 'M13', parcela: 1500, animais: 1, assessor: 'Douglas Bispo', comprador: 'Fabio Lopes da Selaria Mineira', fazenda: 'Fazenda Rancho Grande', cidade: 'Altamira', uf: 'PA' },
    { lote: '19', parcela: 2000, animais: 1, assessor: 'Fabio Omena', comprador: 'Sr Luiz Carlos Freitas', fazenda: 'Nelore Tresmar', cidade: '', uf: 'MS' },
    { lote: '20', parcela: 1900, animais: 1, assessor: 'Douglas Bispo', comprador: 'Nelore Grão Pará - Dr Celso Lopes', fazenda: 'Fazenda Flor de Minas', cidade: 'Ourilândia do Norte', uf: 'PA' },
    { lote: '26', parcela: 1650, animais: 1, assessor: 'Léo Serafim', comprador: 'Dr Romualdo - Nelore Tavares/Nelore Leão', fazenda: '', cidade: 'João Pinheiro', uf: 'MG' },
    { lote: '27', parcela: 1550, animais: 1, assessor: 'Douglas Bispo', comprador: 'Nelore Grão Pará - Dr Celso Lopes', fazenda: 'Fazenda Flor de Minas', cidade: 'Ourilândia do Norte', uf: 'PA' },
    { lote: '28', parcela: 1200, animais: 1, assessor: 'Douglas Bispo', comprador: 'Nelore Grão Pará - Dr Celso Lopes', fazenda: 'Fazenda Flor de Minas', cidade: 'Ourilândia do Norte', uf: 'PA' },
    { lote: '30', parcela: 1550, animais: 1, assessor: 'Léo Serafim', comprador: 'Elias Abdo - Nelore Abba', fazenda: '', cidade: 'Cruzeiro do Oeste', uf: 'PR' },
    { lote: '31', parcela: 1900, animais: 1, assessor: 'Douglas Bispo', comprador: 'Nelore Grão Pará - Dr Celso Lopes', fazenda: 'Fazenda Flor de Minas', cidade: 'Ourilândia do Norte', uf: 'PA' },
    { lote: '36', parcela: 1100, animais: 1, assessor: 'Douglas Bispo', comprador: 'Nelore Grão Pará - Dr Celso Lopes', fazenda: 'Fazenda Flor de Minas', cidade: 'Ourilândia do Norte', uf: 'PA' },
    { lote: '135', parcela: 1100, animais: 1, assessor: 'Douglas Bispo', comprador: 'Pedro Pontes', fazenda: 'Nelore São Caetano', cidade: 'Tucumã', uf: 'PA' },
  ],
})

// ---- MACHOS — DOMINGO 12/07 (sem 474 e 513/515, que vieram sem valor) ----
const machos = buildFechamento({
  nome: 'MEGA EVENTO EAO BAVIERA — Machos',
  data: '2026-07-12', local: '',
  faturamento_total_leilao: null,
  observacoesExtra: 'Lotes 474 (Nane + Felipinho Capucci) e 513/515 (Nane), compradores Marcos Rodrigo Capucci (Faz. Santo Antônio, Rio Verde MS), fora por não terem valor informado. Lote 410 sem quantidade explícita na msg — assumido 1 animal.',
  lots: [
    { lote: '348', parcela: 700, animais: 2, assessor: 'Douglas Bispo', comprador: 'Deiglames Oliveira', fazenda: 'Fazenda Canaã', cidade: 'Montes Altos', uf: 'MA' },
    { lote: '349', parcela: 750, animais: 3, assessor: 'Laila', comprador: 'Luis Antonio', fazenda: 'Fazenda Santa Lucia Planalto', cidade: '', uf: 'BA' },
    { lote: '351', parcela: 1400, animais: 1, assessor: 'Nane', comprador: 'Alcindo Torrezan', fazenda: 'Fazenda Cachimbo', cidade: 'Campo Grande', uf: 'MS' },
    { lote: '396', parcela: 670, animais: 3, assessor: 'Douglas Bispo', comprador: 'Edilberto Sarubi', fazenda: 'Fazenda Flor da Mata', cidade: 'Oriximiná', uf: 'PA' },
    { lote: '410', parcela: 1300, animais: 1, assessor: 'Nane', comprador: 'Alcindo Torrezan', fazenda: 'Fazenda Cachimbo', cidade: 'Campo Grande', uf: 'MS' },
    { lote: '417', parcela: 750, animais: 1, assessor: 'Fabio Omena', comprador: 'Nael', fazenda: 'Fazenda Boa Vista', cidade: 'Sena Madureira', uf: 'AC' },
    { lote: '456', parcela: 700, animais: 1, assessor: 'Fabio Omena', comprador: 'Paulo de Moraes', fazenda: 'Fazenda Ana Luiza', cidade: 'Barra do Corda', uf: 'MA' },
  ],
})

function printResumo(tag, f) {
  console.log(`\n== ${f.payload.nome} — ${f.payload.data} ==`)
  console.log(`  VGV cobertura : ${brl(f.vgv_total)}  (${f.L.length} lotes · ${f.total_animais} animais)`)
  console.log(`  Comissão 2%   : ${brl(f.comissao_assessoria)}`)
  for (const a of f.por_assessor) console.log(`    ${a.nome.padEnd(16)} ${String(a.transacoes).padStart(2)} lt · ${brl(a.vgv).padStart(14)} · com ${brl(a.comissao)}`)
  for (const l of f.L) console.log(`    lt ${String(l.lote).padEnd(4)} ${l.animais}an × ${brl(l.parcela)}/parc × ${PARCELAS} = ${brl(l.vgv).padStart(13)}  -> ${l.comprador}`)
}

console.log(DRY_RUN ? '*** DRY RUN ***' : '*** GRAVANDO EM PRODUÇÃO ***')
printResumo('femeas', femeas)
printResumo('machos', machos)

async function upsertFechamento(payload) {
  const { data: ex, error: selErr } = await sb.from('bula_leilao_fechamento').select('id').eq('data', payload.data).eq('nome', payload.nome).maybeSingle()
  if (selErr) throw new Error(`SELECT: ${selErr.message}`)
  if (ex) {
    const { error } = await sb.from('bula_leilao_fechamento').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', ex.id)
    if (error) throw new Error(`UPDATE: ${error.message}`)
    return { id: ex.id, action: 'ATUALIZADO' }
  }
  const { data, error } = await sb.from('bula_leilao_fechamento').insert({ ...payload, updated_at: new Date().toISOString() }).select('id').single()
  if (error) throw new Error(`INSERT: ${error.message}`)
  return { id: data.id, action: 'CRIADO' }
}

if (DRY_RUN) { console.log('\n[DRY_RUN] nada gravado.'); process.exit(0) }

for (const f of [femeas, machos]) {
  const res = await upsertFechamento(f.payload)
  console.log(`-> ${f.payload.nome}: fechamento ${res.action} (${res.id})`)
}
console.log('\nConcluído.')
