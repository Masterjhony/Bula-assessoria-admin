// Fechamentos parciais (cobertura Bula) informados por WhatsApp em 25/06/2026.
//
// Dois leilões NOVOS (o 3º print — KatiSpera — já está em
// add-fechamento-katispera-matrizes-2026-06-20.mjs; não é refeito aqui):
//
//   A) LEILÃO VIRTUAL TOUROS MATINHA (21/06/2026) — Programa Leilões / Canal Rural.
//      Acordo (bula_leiloes): 0,33% do faturamento total + 5% da venda (cobertura).
//      Catálogo confirma 21/06, 220 touros. A CONDIÇÃO de pagamento NÃO consta no
//      texto do catálogo (só genética); assumidas 30 parcelas — REVISAR se diferente.
//        • bateria 13 - 560,00 - 5M (Fábio Omena): GR Agropecuária / Guy Rangel, Tucuruí-PA.
//        • lote 26 - 720,00 - 1M (Lucas Martins, assessor): comprador não informado.
//      Faturamento total da leiloeira pendente -> provisiona só os 5% da venda agora.
//
//   B) LEILÃO TOUROS PROVADOS TERRA BRAVA — Junho/2026 (consolida 16-18/06, a pedido
//      do cliente: "é um leilão só"). Programa Leilões. 30 parcelas. 8 touros (1M cada).
//      Acordo (bula_leiloes 16/06) é por PERFORMANCE:
//        a partir de 5% perf -> 0,5% do faturamento bruto; 12,5% -> 0,75%; 20% -> 1%;
//        25% -> 1,25%; 30% -> 1,5%; ABAIXO de 5% -> 5% do que vender.
//      Sem faturamento/performance da leiloeira, provisiona o PISO conservador
//      (5% da venda da cobertura) — REVISAR quando a leiloeira informar performance.
//        • lt 138 610 / lt 59 670 / lt 114 680 / lt 37 720 (Fábio Omena) -> Agenor Teixeira, Faz. do Ermo-RJ.
//        • lt 08 700 (Douglas) -> Maxwell Carvalho, Vale da Serra, Monte do Carmo-TO.
//        • lt 57 680 (Douglas) -> Antonio Carlos da Silveira, Faz. OBB, Iuiú-BA.
//        • lt 96 700 (Douglas) -> Ivo Beato, Estrela Viva, Novo Repartimento-PA.
//        • lt 42 730 (Douglas) -> Amadeu Ferino, Sítio do Meio, Lagoa Nova-RN.
//
// Comissão de assessoria: Fábio Omena 3%, Douglas Bispo 2%, Lucas Martins 2% (sobre VGV cobertura).
//
// Uso: DRY_RUN=1 node scripts/add-fechamentos-matinha-terrabrava-junho-2026.mjs
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
const addDays = (iso, d) => { const x = new Date(`${iso}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }

// IDs fixos (validados no preflight)
const LEILOEIRA_ID = 'cdfed41f-ff46-4519-8dff-10d8d8fccaa5' // PROGRAMA LEILOES
const CAT_RECEITA = 'e74434bd-3366-4015-9268-15d6640cf15f'  // Comissao Leilao (receita)
const CAT_DESPESA = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'  // Comissão Funcionário (despesa)
const CC_ASSESSORES = '52dd8ed0-0c0a-4524-86bd-01dc121487b3' // COM02
const FORN = {
  'Fábio Omena': '1739c44b-b46a-4c1d-8adf-f6509fb44891',
  'Douglas Bispo': '25642186-16ad-4306-9eb7-8f3372b63f00',
  'Lucas Martins': 'a2a337fb-efa2-44ff-9dd7-61616510a78c',
}
const PCT = { 'Fábio Omena': 0.03, 'Douglas Bispo': 0.02, 'Lucas Martins': 0.02 }
const UF_NOME = { PA: 'Pará', RJ: 'Rio de Janeiro', TO: 'Tocantins', BA: 'Bahia', RN: 'Rio Grande do Norte' }

// ---------- montagem de um fechamento a partir dos lotes de cobertura ----------
function build(cfg) {
  const lots = cfg.lots.map((l) => ({ ...l, vgv: l.parcela * cfg.parcelas * l.animais, empresa: l.empresa || 'Bula Assessoria', vendedor: cfg.vendedor }))
  const vgv_total = r2(lots.reduce((s, l) => s + l.vgv, 0))
  const animais = lots.reduce((s, l) => s + l.animais, 0)
  const receita_bula = r2(vgv_total * cfg.acordo_pct_venda)

  const byA = new Map()
  for (const l of lots) {
    const cur = byA.get(l.assessor) || { nome: l.assessor, empresa: l.empresa, transacoes: 0, animais: 0, vgv: 0 }
    cur.transacoes += 1; cur.animais += l.animais; cur.vgv += l.vgv
    byA.set(l.assessor, cur)
  }
  const por_assessor = [...byA.values()].sort((a, b) => b.vgv - a.vgv).map((a, i) => {
    const pct = PCT[a.nome] ?? 0
    return { posicao: i + 1, nome: a.nome, empresa: a.empresa, transacoes: a.transacoes, animais: a.animais, vgv: r2(a.vgv), ticket_medio: Math.round(a.vgv / a.animais), pct_total: r2(a.vgv / vgv_total * 100) / 100, comissao_pct: pct, comissao: r2(a.vgv * pct) }
  })
  const comissao_assessoria = r2(por_assessor.reduce((s, a) => s + a.comissao, 0))
  const sobra_bruta = r2(receita_bula - comissao_assessoria)

  const byC = new Map()
  for (const l of lots) {
    const k = `${l.comprador}|${l.uf}`
    const cur = byC.get(k) || { comprador: l.comprador, fazenda: l.fazenda, cidade: l.cidade, uf: l.uf, lotes: 0, animais: 0, vgv: 0 }
    cur.lotes += 1; cur.animais += l.animais; cur.vgv += l.vgv
    byC.set(k, cur)
  }
  const compradores = [...byC.values()].sort((a, b) => b.vgv - a.vgv).map((c, i) => ({ rank: i + 1, ...c, vgv: r2(c.vgv) }))

  const byU = new Map()
  for (const l of lots) {
    const cur = byU.get(l.uf) || { uf: l.uf, lotes: 0, animais: 0, vgv: 0 }
    cur.lotes += 1; cur.animais += l.animais; cur.vgv += l.vgv
    byU.set(l.uf, cur)
  }
  const por_estado = [...byU.values()].sort((a, b) => b.vgv - a.vgv).map((u) => ({ ...u, vgv: r2(u.vgv), estado: UF_NOME[u.uf] || u.uf, pct_total: r2(u.vgv / vgv_total * 100) / 100, ticket_medio: Math.round(u.vgv / u.animais) }))

  const payload = {
    nome: cfg.nome, data: cfg.data, local: 'Virtual',
    lotes_ofertados: lots.length, lotes_vendidos: lots.length, animais_vendidos: animais,
    vgv_total, ticket_medio: Math.round(vgv_total / animais), maior_lance: Math.max(...lots.map((l) => l.vgv)),
    compradores_unicos: compradores.length, estados_alcancados: por_estado.length,
    por_assessor, por_estado, compradores,
    lances: lots.map((l) => ({ lote: l.lote, animais: l.animais, vgv: l.vgv, parcela: l.parcela, parcelas: cfg.parcelas, assessor: l.assessor, empresa: l.empresa, vendedor: l.vendedor, comprador: `${l.comprador} · ${l.fazenda} · ${l.cidade}/${l.uf}` })),
    perfil_genetico: [],
    faturamento_total_leilao: null,
    acordo_pct_faturamento: cfg.acordo_pct_faturamento ?? null,
    acordo_pct_venda_cobertura: cfg.acordo_pct_venda,
    acordo_descricao: cfg.acordo_descricao,
    receita_bula, comissao_assessoria, sobra_bruta,
    observacoes: cfg.observacoes({ vgv_total, animais, receita_bula, comissao_assessoria, sobra_bruta, lotes: lots.length }),
  }
  return { lots, vgv_total, animais, receita_bula, comissao_assessoria, sobra_bruta, por_assessor, payload }
}

// ===================== A) MATINHA =====================
const matinha = {
  key: 'MATINHA-VIRTUAL-20260621',
  nome: 'Leilão Virtual Touros Matinha - 21/06/2026',
  data: '2026-06-21',
  parcelas: 30, // assumido (não consta no texto do catálogo) — REVISAR
  vendedor: 'Rancho da Matinha',
  acordo_pct_venda: 0.05,
  acordo_pct_faturamento: 0.0033,
  acordo_descricao: '0,33% do faturamento total + 5% da venda (cobertura). Provisão atual: só os 5% da venda; 0,33% do faturamento pendente da leiloeira.',
  bulaLeilaoId: '59bcceb3-7822-4b63-bf8f-55b4ac941498',
  cronoId: '12094cc7-cd2c-48bb-8ba6-1ac9b813c269',
  lots: [
    { lote: 'bateria 13', parcela: 560, animais: 5, assessor: 'Fábio Omena', comprador: 'GR Agropecuária - Guy Rangel', fazenda: 'GR Agropecuária', cidade: 'Tucuruí', uf: 'PA' },
    { lote: '26', parcela: 720, animais: 1, assessor: 'Lucas Martins', comprador: 'Não informado', fazenda: 'Não informada', cidade: 'Não informada', uf: 'PA' },
  ],
  observacoes: (a) => [
    'Fechamento parcial (cobertura Bula) a partir das mensagens de WhatsApp encaminhadas em 25/06/2026 ("Fechamento Matinha Junho").',
    'Leilão Virtual Touros Matinha (21/06/2026), Programa Leilões, transmissão Canal Rural — 220 touros melhoradores (catálogo confere).',
    `Cobertura Bula: ${a.lotes} lotes / ${a.animais} touros / ${brl(a.vgv_total)} (parcela × 30 parcelas).`,
    'CONDIÇÃO assumida em 30 parcelas — não consta no texto do catálogo (página de termos é imagem). Revisar se for outra.',
    `Acordo: 0,33% do faturamento + 5% da venda. Provisionado agora só 5% da venda da cobertura = ${brl(a.receita_bula)}; 0,33% do faturamento total pendente da leiloeira.`,
    `Comissão de assessoria: ${brl(a.comissao_assessoria)} (Fábio Omena 3% na bateria 13; Lucas Martins 2% no lote 26). Sobra bruta parcial ${brl(a.sobra_bruta)}.`,
    'Lote 26: assessor Lucas Martins (confirmado pelo cliente); comprador não informado na mensagem.',
  ].join('\n'),
}

// ===================== B) TERRA BRAVA =====================
const terra = {
  key: 'TERRABRAVA-PROVADOS-JUNHO-2026',
  nome: 'Leilão Touros Provados Terra Brava - Junho/2026 (16-18/06)',
  data: '2026-06-16',
  parcelas: 30,
  vendedor: 'Terra Brava Agropecuária',
  acordo_pct_venda: 0.05, // PISO (abaixo de 5% de performance). Tiers reais por faturamento.
  acordo_pct_faturamento: null,
  acordo_descricao: 'Acordo por performance: 5% perf=0,5% faturamento; 12,5%=0,75%; 20%=1%; 25%=1,25%; 30%=1,5%; abaixo de 5%=5% da venda. Provisionado o piso (5% da venda da cobertura) — revisar com performance/faturamento da leiloeira.',
  bulaLeilaoId: 'b52272d9-0e70-426b-96d3-297b4ee8f847', // 16/06 (carrega o acordo de performance)
  cronoId: '62798f46-da7b-4afe-956f-4375f14d9256',
  lots: [
    { lote: '138', parcela: 610, animais: 1, assessor: 'Fábio Omena', comprador: 'Agenor Teixeira', fazenda: 'Fazenda do Ermo', cidade: 'Não informada', uf: 'RJ' },
    { lote: '59', parcela: 670, animais: 1, assessor: 'Fábio Omena', comprador: 'Agenor Teixeira', fazenda: 'Fazenda do Ermo', cidade: 'Não informada', uf: 'RJ' },
    { lote: '114', parcela: 680, animais: 1, assessor: 'Fábio Omena', comprador: 'Agenor Teixeira', fazenda: 'Fazenda do Ermo', cidade: 'Não informada', uf: 'RJ' },
    { lote: '37', parcela: 720, animais: 1, assessor: 'Fábio Omena', comprador: 'Agenor Teixeira', fazenda: 'Fazenda do Ermo', cidade: 'Não informada', uf: 'RJ' },
    { lote: '08', parcela: 700, animais: 1, assessor: 'Douglas Bispo', comprador: 'Maxwell Carvalho', fazenda: 'Fazenda Vale da Serra', cidade: 'Monte do Carmo', uf: 'TO' },
    { lote: '57', parcela: 680, animais: 1, assessor: 'Douglas Bispo', comprador: 'Antonio Carlos da Silveira', fazenda: 'Fazenda OBB', cidade: 'Iuiú', uf: 'BA' },
    { lote: '96', parcela: 700, animais: 1, assessor: 'Douglas Bispo', comprador: 'Ivo Beato', fazenda: 'Fazenda Estrela Viva', cidade: 'Novo Repartimento', uf: 'PA' },
    { lote: '42', parcela: 730, animais: 1, assessor: 'Douglas Bispo', comprador: 'Amadeu Ferino', fazenda: 'Fazenda Sítio do Meio', cidade: 'Lagoa Nova', uf: 'RN' },
  ],
  observacoes: (a) => [
    'Fechamento parcial (cobertura Bula) a partir das mensagens de WhatsApp encaminhadas em 25/06/2026 ("Fechamento Terra Brava Junho").',
    'Consolida os Leilões Touros Provados Terra Brava de 16, 17 e 18/06/2026 num único fechamento (a pedido do cliente: "é um leilão só"). Programa Leilões.',
    `Cobertura Bula: ${a.lotes} touros / ${brl(a.vgv_total)} (parcela × 30 parcelas).`,
    'Acordo por PERFORMANCE (0,5% a 1,5% do faturamento bruto; piso de 5% da venda abaixo de 5% de performance).',
    `Receita provisionada no PISO conservador = 5% da venda da cobertura = ${brl(a.receita_bula)}. Revisar quando a leiloeira informar performance + faturamento.`,
    `Comissão de assessoria: ${brl(a.comissao_assessoria)} (Fábio Omena 3% nos lotes 138/59/114/37; Douglas Bispo 2% nos lotes 08/57/96/42). Sobra bruta provisória ${brl(a.sobra_bruta)}.`,
  ].join('\n'),
}

const FECHAMENTOS = [matinha, terra]

// ---------- preflight ----------
async function preflight() {
  const checks = [
    ['erp_pessoas', LEILOEIRA_ID, 'Leiloeira'],
    ['erp_pessoas', FORN['Fábio Omena'], 'Fábio Omena'],
    ['erp_pessoas', FORN['Douglas Bispo'], 'Douglas Bispo'],
    ['erp_pessoas', FORN['Lucas Martins'], 'Lucas Martins'],
    ['erp_categorias', CAT_RECEITA, 'Cat. receita'],
    ['erp_categorias', CAT_DESPESA, 'Cat. despesa'],
    ['erp_centros_custo', CC_ASSESSORES, 'CC assessores'],
  ]
  console.log('\nPreflight de IDs:')
  for (const [table, id, label] of checks) {
    const { data, error } = await sb.from(table).select('id,nome').eq('id', id).maybeSingle()
    if (error) throw new Error(`${label}: ${error.message}`)
    if (!data) throw new Error(`${label}: id ${id} NÃO encontrado em ${table} — abortar.`)
    console.log(`  ok ${label.padEnd(14)} -> ${data.nome}`)
  }
}

// ---------- gravação por fechamento ----------
async function grava(cfg) {
  const b = build(cfg)
  console.log(`\n================ ${cfg.nome} ================`)
  console.log(`  VGV cobertura : ${brl(b.vgv_total)} (${b.animais} touros · ${b.lots.length} lotes)`)
  console.log(`  Receita prov. : ${brl(b.receita_bula)}  (${(cfg.acordo_pct_venda * 100)}% da venda)`)
  for (const a of b.por_assessor) console.log(`    ${a.nome.padEnd(14)} ${a.transacoes} lt / ${brl(a.vgv).padStart(13)} @ ${(a.comissao_pct * 100)}% = ${brl(a.comissao)}`)
  console.log(`  Comissão tot. : ${brl(b.comissao_assessoria)} | Sobra bruta: ${brl(b.sobra_bruta)}`)
  console.log(`  Imposto 18%   : ${brl(b.receita_bula * 0.18)} | Lucro líq.: ${brl(b.receita_bula - b.comissao_assessoria - b.receita_bula * 0.18)}`)

  if (DRY_RUN) return

  // 1) fechamento (upsert por nome+data)
  const { data: ex } = await sb.from('bula_leilao_fechamento').select('id').eq('nome', cfg.nome).eq('data', cfg.data).maybeSingle()
  let fechId
  if (ex) { const { error } = await sb.from('bula_leilao_fechamento').update({ ...b.payload, updated_at: new Date().toISOString() }).eq('id', ex.id); if (error) throw new Error(error.message); fechId = ex.id; console.log(`  -> fechamento ATUALIZADO (${fechId})`) }
  else { const { data, error } = await sb.from('bula_leilao_fechamento').insert(b.payload).select('id').single(); if (error) throw new Error(error.message); fechId = data.id; console.log(`  -> fechamento CRIADO (${fechId})`) }

  // 2) bula_leiloes + cronograma
  await sb.from('bula_leiloes').update({ realizado_bula: b.vgv_total, condicao: `${cfg.parcelas} parcelas`, status: 'concluido' }).eq('id', cfg.bulaLeilaoId)
  await sb.from('cronograma_leiloes').update({ venda_bula: brl(b.vgv_total), comissao_receber: brl(b.receita_bula), contrato: `${cfg.parcelas} parcelas` }).eq('id', cfg.cronoId)
  console.log('  -> bula_leiloes + cronograma atualizados')

  // 3) conta a receber (comissão Bula provisionada)
  const crDoc = `BULA-2026-CR-${cfg.key}`
  const crPayload = {
    descricao: `${cfg.nome.toUpperCase()} - COMISSAO BULA`, cliente_id: LEILOEIRA_ID, categoria_id: CAT_RECEITA,
    valor: b.receita_bula, valor_recebido: 0, emissao: cfg.data, vencimento: addDays(cfg.data, 45), status: 'aberto',
    numero_documento: crDoc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
    observacoes: `Provisão = ${(cfg.acordo_pct_venda * 100)}% da venda da cobertura (${brl(b.vgv_total)}) = ${brl(b.receita_bula)}. Faturamento total/performance da leiloeira pendente. Vinculado ao fechamento ${fechId}.`,
    tags: ['leilao', '2026', 'junho', cfg.key.toLowerCase(), 'comissao', 'provisao'], anexos: [],
  }
  { const { data: exCr } = await sb.from('erp_contas_receber').select('id').eq('numero_documento', crDoc).maybeSingle()
    if (exCr) { await sb.from('erp_contas_receber').update({ ...crPayload, updated_at: new Date().toISOString() }).eq('id', exCr.id); console.log(`  -> CR ATUALIZADA ${brl(b.receita_bula)}`) }
    else { const { data, error } = await sb.from('erp_contas_receber').insert(crPayload).select('id').single(); if (error) throw new Error(error.message); console.log(`  -> CR CRIADA (${data.id}) ${brl(b.receita_bula)}`) } }

  // 4) comissões a pagar (uma por assessor)
  for (const a of b.por_assessor) {
    const slug = a.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const doc = `BULA-2026-CP-COM-${cfg.key}-${slug}`
    const cp = {
      descricao: `COMISSAO ${cfg.nome.toUpperCase()} - ${a.nome.toUpperCase()} (${a.comissao_pct * 100}%)`,
      fornecedor_id: FORN[a.nome], categoria_id: CAT_DESPESA, centro_custo_id: CC_ASSESSORES,
      valor: a.comissao, emissao: cfg.data, vencimento: '2026-07-25', status: 'aberto',
      numero_documento: doc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
      observacoes: `Comissão ${a.comissao_pct * 100}% sobre VGV de cobertura ${brl(a.vgv)} no ${cfg.nome}. Vinculado ao fechamento ${fechId}.`,
      tags: ['a-pagar', 'comissao', '2026', 'leilao', cfg.key.toLowerCase(), slug.toLowerCase()], anexos: [],
    }
    if (!FORN[a.nome]) { console.log(`  !! sem fornecedor_id para ${a.nome} — CP NÃO criada`); continue }
    const { data: exCp } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', doc).maybeSingle()
    if (exCp) { await sb.from('erp_contas_pagar').update({ ...cp, updated_at: new Date().toISOString() }).eq('id', exCp.id); console.log(`  -> CP ATUALIZADA ${a.nome} ${brl(a.comissao)}`) }
    else { const { error } = await sb.from('erp_contas_pagar').insert(cp); if (error) throw new Error(error.message); console.log(`  -> CP CRIADA ${a.nome} ${brl(a.comissao)}`) }
  }
}

console.log(DRY_RUN ? '*** DRY RUN ***' : '*** GRAVANDO EM PRODUÇÃO ***')
await preflight()
for (const cfg of FECHAMENTOS) await grava(cfg)
console.log(DRY_RUN ? '\n[DRY_RUN] nada gravado.' : '\nConcluído.')
