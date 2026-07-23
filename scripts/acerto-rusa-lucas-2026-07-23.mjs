// Acerto 23/07/2026 — Gustavo Rusa (lotes dos compradores dele) + Lucas Martins (pago 10/07 NF 04).
//
// GUSTAVO RUSA — extrato do chefe (WhatsApp 23/07): total a receber 88.435,00,
// já pago 64.945,00 (CP RUSA MAIO/JUNHO, pago 13/07, conciliado), restam
// 23.490,00 referentes aos lotes dos compradores dele (Dr Celso Lopes /
// Pedro Pontes = compradores do Rusa, 5% sobre VGV = parcela × 30):
//   NAVIRAI 16/07: lotes 8 (1.550) e 80 (1.300) -> 4.275  [JÁ no ERP + CP]
//   EAO FÊMEAS 11/07: lotes 20/27/28/31/36/135 -> 13.125  [JÁ no ERP + CP]
//   SANTA CRUZ 15/07: lote 124 (670) -> 1.005   [estava no Douglas — transfere]
//   NAVIRAI 16/07: lote 2 (920) -> 1.380        [estava no Douglas — transfere]
//   SANTA CRUZ 19/07: lotes 42 (1.620) e 39 (850) -> 3.705  [sem fechamento — cria]
// Douglas perde os lotes em JULHO (junho dele não é tocado — já conciliado).
//
// LUCAS MARTINS — planilha COMISSAO LUCAS, TOTAL 2.758,50 pago 10/07 NF 04
// (PIX Sicoob 10/07 "Ref Lucas Comissao Matinha 19do5 MNO 11do6 e JMP 15do6"):
//   Matinha Golden 19/05: com 90 (já correto) -> marca pago
//   MNO 11/06 (cronograma 10/06, Bula Remates): sem fechamento -> cria (90, pago)
//   JMP Touros 14/06: com 1.701,81 (0,33%) -> 2.578,50 (0,5%, % da época) + pago
// CP do JMP-Lucas vira o consolidado de 2.758,50, baixado e conciliado com o
// movimento do extrato. O Matinha 21/06 (432) NÃO está na planilha paga —
// fica em aberto para o próximo ciclo (não é tocado).
//
// Uso: DRY_RUN=1 node scripts/acerto-rusa-lucas-2026-07-23.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100
const now = () => new Date().toISOString()
const PAGO_REF = 'pago 10/07 NF 04'
const DR_CELSO = 'NELORE GRÃO PARA - DR CELSO LOPES'

const IDS = {
  scJul15: '4d2f3c39-a7e6-4a60-97ca-7e9bff637c0c',
  navirai: '0ba4d4d9-0235-4cfe-9db4-ae49208e7f75',
  golden: '24946720-edb5-4f8f-99b0-bd5ae5a67cbf',
  jmp: 'c0f291bb-17bc-4b10-b320-c5ed6e767057',
  cpRusaNavirai: '31d8c925-7612-44d8-be2b-2fad82936564',
  cpLucasJmp: '915bf73e-8fa3-422b-85b5-0b666505812c',
  movLucas: '1055adac-9f26-47f1-8c82-1b46c0c48681',
  contaSicoob: 'e0eca43c-1a2c-4077-ab54-801eb5d692e7',
  fornRusa: 'a2c9ec8c-27c0-40f4-a944-0cdcf25c6134',
  catComissao: '5dcdc58a-d81b-4a4c-a81a-5e703e6a1a90',
}

const fetchFech = async (id) => {
  const { data, error } = await sb.from('bula_leilao_fechamento').select('*').eq('id', id).single()
  if (error) { console.error('erro lendo fechamento', id, error.message); process.exit(1) }
  return data
}
const updFech = async (id, upd) => {
  if (DRY_RUN) return
  const { error } = await sb.from('bula_leilao_fechamento').update({ ...upd, updated_at: now() }).eq('id', id)
  if (error) { console.error('ERRO update fechamento', id, error.message); process.exit(1) }
}

/* ============ 1) SANTA CRUZ 15/07 — lote 124 Douglas -> Rusa 5% ============ */
{
  const f = await fetchFech(IDS.scJul15)
  console.log(`\n[1] ${f.nome} (${f.data})`)
  const jaTem = (f.por_assessor || []).some((a) => /rusa/i.test(a.nome))
  if (jaTem) console.log('  já ajustado (Rusa presente). pula.')
  else {
    const lances = (f.lances || []).map((l) => String(l.lote) === '124' ? { ...l, assessor: 'Gustavo Rusa' } : l)
    const dg = (f.por_assessor || []).find((a) => /douglas/i.test(a.nome))
    const pa = [
      { ...dg, posicao: 1, vgv: 22500, comissao: 450, comissao_pct: 0.02, transacoes: 1, animais: 1, ticket_medio: 22500, pct_total: r2(22500 / 42600 * 10000) / 10000 },
      { posicao: 2, nome: 'Gustavo Rusa', empresa: 'Bula Assessoria', transacoes: 1, animais: 1, vgv: 20100, ticket_medio: 20100, pct_total: r2(20100 / 42600 * 10000) / 10000, comissao_pct: 0.05, comissao: 1005 },
    ]
    console.log('  lote 124 (Dr Celso): Douglas -> Gustavo Rusa (5% = 1.005,00)')
    console.log(`  Douglas: 852,00 -> 450,00 | comissao_assessoria: ${brl(f.comissao_assessoria)} -> ${brl(1455)}`)
    await updFech(IDS.scJul15, { lances, por_assessor: pa, comissao_assessoria: 1455 })
    if (!DRY_RUN) console.log('  ✔ gravado')
  }
}

/* ============ 2) NAVIRAI 16/07 — lote 2 -> Rusa (920 x 30 = 27.600) + lances 8/80 ============ */
{
  const f = await fetchFech(IDS.navirai)
  console.log(`\n[2] ${f.nome} (${f.data})`)
  const rusa = (f.por_assessor || []).find((a) => /rusa/i.test(a.nome))
  if (rusa && Number(rusa.vgv) === 113100) console.log('  já ajustado. pula.')
  else {
    let lances = (f.lances || []).map((l) =>
      String(l.lote) === '2' ? { ...l, assessor: 'Gustavo Rusa', parcela: 920, vgv: 27600 } : l)
    // lances 8/80 do Rusa (já contados no por_assessor/vgv_total, faltavam no detalhe)
    if (!lances.some((l) => String(l.lote) === '8'))
      lances.push({ lote: '8', parcela: 1550, vgv: 46500, animais: 1, assessor: 'Gustavo Rusa', comprador: DR_CELSO, empresa: 'Bula Assessoria', uf: 'PA' })
    if (!lances.some((l) => String(l.lote) === '80'))
      lances.push({ lote: '80', parcela: 1300, vgv: 39000, animais: 1, assessor: 'Gustavo Rusa', comprador: DR_CELSO, empresa: 'Bula Assessoria', uf: 'PA' })
    const vgvTotal = 187200 // 113.100 Rusa + 28.500 Peralta + 24.000 Douglas + 21.600 Fábio
    const pa = (f.por_assessor || []).map((a) => {
      if (/rusa/i.test(a.nome)) return { ...a, vgv: 113100, comissao: 5655, comissao_pct: 0.05, transacoes: 3, animais: 3, ticket_medio: 37700, pct_total: r2(113100 / vgvTotal * 10000) / 10000 }
      if (/douglas/i.test(a.nome)) return { ...a, vgv: 24000, comissao: 480, comissao_pct: 0.02, transacoes: 1, animais: 1, ticket_medio: 24000, pct_total: r2(24000 / vgvTotal * 10000) / 10000 }
      return { ...a, pct_total: r2(Number(a.vgv) / vgvTotal * 10000) / 10000 }
    }).sort((a, b) => b.vgv - a.vgv).map((a, i) => ({ ...a, posicao: i + 1 }))
    const comAss = r2(pa.reduce((s, a) => s + (Number(a.comissao) || 0), 0)) // 7.137,00
    console.log('  lote 2 (Dr Celso): Douglas -> Gustavo Rusa, parcela 920,99->920,00 (vgv 27.600) -> com 1.380,00')
    console.log('  + lances 8 e 80 (Dr Celso, já no VGV do Rusa) adicionados ao detalhe')
    console.log(`  Rusa: 4.275,00 -> 5.655,00 | Douglas: 1.032,59 -> 480,00`)
    console.log(`  vgv_total: ${brl(f.vgv_total)} -> ${brl(vgvTotal)} | comissao_assessoria: ${brl(f.comissao_assessoria)} -> ${brl(comAss)}`)
    await updFech(IDS.navirai, { lances, por_assessor: pa, vgv_total: vgvTotal, comissao_assessoria: comAss })
    if (!DRY_RUN) console.log('  ✔ gravado')
  }
}

/* ============ 3) SANTA CRUZ 19/07 — cria fechamento (lotes 42 e 39 do Rusa) ============ */
let scJul19Id = null
{
  const { data: exist } = await sb.from('bula_leilao_fechamento').select('id').eq('data', '2026-07-19').ilike('nome', '%santa cruz%')
  console.log('\n[3] NELORE SANTA CRUZ - 19/07/2026')
  if (exist && exist.length) { scJul19Id = exist[0].id; console.log('  fechamento já existe. pula.') }
  else {
    const novo = {
      nome: 'NELORE SANTA CRUZ - 19/07/2026', data: '2026-07-19', local: 'PROGRAMA LEILÕES',
      origem: 'manual', etapa: 'realizado',
      lotes_vendidos: 2, animais_vendidos: 2, vgv_total: 74100, ticket_medio: 37050,
      comissao_assessoria: 3705,
      lances: [
        { lote: '42', parcela: 1620, vgv: 48600, animais: 1, assessor: 'Gustavo Rusa', comprador: DR_CELSO, empresa: 'Bula Assessoria', uf: 'PA' },
        { lote: '39', parcela: 850, vgv: 25500, animais: 1, assessor: 'Gustavo Rusa', comprador: DR_CELSO, empresa: 'Bula Assessoria', uf: 'PA' },
      ],
      por_assessor: [{ posicao: 1, nome: 'Gustavo Rusa', empresa: 'Bula Assessoria', transacoes: 2, animais: 2, vgv: 74100, ticket_medio: 37050, pct_total: 1, comissao_pct: 0.05, comissao: 3705 }],
      observacoes: 'Fechamento MANUAL criado do acerto Gustavo Rusa (WhatsApp do chefe, 23/07/2026): lotes 42 (1.620x30) e 39 (850x30), comprador Dr Celso Lopes, 5%. Cronograma tem NELORE SANTA CRUZ em 14, 15 e 19/07 — este cobre só os lotes do Rusa no dia 19/07; parte financeira (receita/acordo) é passo manual no ERP.',
      updated_at: now(),
    }
    console.log(`  cria: vgv 74.100,00 · Rusa 5% = 3.705,00 (lotes 42 e 39, Dr Celso)`)
    if (!DRY_RUN) {
      const { data, error } = await sb.from('bula_leilao_fechamento').insert([novo]).select('id').single()
      if (error) { console.error('  ERRO insert:', error.message); process.exit(1) }
      scJul19Id = data.id
      console.log('  ✔ criado', scJul19Id)
    }
  }
}

/* ============ 4) CP Rusa Navirai 4.275 -> 5.655 (+ lote 2) ============ */
{
  const { data: cp } = await sb.from('erp_contas_pagar').select('*').eq('id', IDS.cpRusaNavirai).single()
  console.log(`\n[4] CP Rusa Navirai: ${brl(cp.valor)} -> ${brl(5655)} (status ${cp.status})`)
  if (Number(cp.valor) === 5655) console.log('  já ajustado. pula.')
  else if (cp.status !== 'aberto') console.log('  ⚠ CP não está aberto — não mexo.')
  else if (!DRY_RUN) {
    const { error } = await sb.from('erp_contas_pagar').update({
      valor: 5655,
      observacoes: String(cp.observacoes || '') + ' [ACERTO 23/07] + lote 2 (920x30=27.600 x 5% = 1.380,00) Dr Celso Lopes, transferido do Douglas Bispo. Base total 113.100 x 5% = 5.655,00. Fechamento 0ba4d4d9 já cadastrado e ajustado.',
      updated_at: now(),
    }).eq('id', IDS.cpRusaNavirai)
    if (error) { console.error('  ERRO:', error.message); process.exit(1) }
    console.log('  ✔ atualizado')
  }
}

/* ============ 5) CPs Rusa Santa Cruz (1.005 + 3.705) ============ */
{
  console.log('\n[5] CPs Rusa Santa Cruz')
  const mk = async (doc, valor, desc, obs, fechId) => {
    const { data: dup } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', doc)
    if (dup && dup.length) { console.log(`  ${doc} já existe. pula.`); return }
    console.log(`  cria ${doc}: ${brl(valor)}`)
    if (DRY_RUN) return
    const { error } = await sb.from('erp_contas_pagar').insert([{
      descricao: desc, fornecedor_id: IDS.fornRusa, categoria_id: IDS.catComissao,
      valor, emissao: '2026-07-23', vencimento: '2026-07-27', status: 'aberto',
      numero_documento: doc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
      observacoes: obs, tags: ['a-pagar', 'comissao', '2026', 'leilao', 'santa-cruz', 'rusa'],
      fechamento_id: fechId || null, vendedor: 'Financeiro / Comercial',
    }])
    if (error) { console.error('  ERRO:', error.message); process.exit(1) }
    console.log('  ✔ criado')
  }
  await mk('BULA-2026-CP-COM-RUSA-SANTA-CRUZ-15-07', 1005,
    'COMISSAO PARCEIRO GUSTAVO RUSA (5%) - NELORE SANTA CRUZ - 15/07/2026',
    '[ACERTO-RUSA 23/07] Lote 124 (670x30=20.100) Dr Celso Lopes, 5% = 1.005,00. Transferido do Douglas Bispo (comprador é do Rusa). Vinculado ao fechamento 4d2f3c39-a7e6-4a60-97ca-7e9bff637c0c.',
    IDS.scJul15)
  await mk('BULA-2026-CP-COM-RUSA-SANTA-CRUZ-19-07', 3705,
    'COMISSAO PARCEIRO GUSTAVO RUSA (5%) - NELORE SANTA CRUZ - 19/07/2026',
    '[ACERTO-RUSA 23/07] Lotes 42 (1.620x30=48.600) e 39 (850x30=25.500) Dr Celso Lopes, base 74.100 x 5% = 3.705,00.' + (scJul19Id ? ` Vinculado ao fechamento ${scJul19Id}.` : ''),
    scJul19Id)
}

/* ============ 6) LUCAS — Golden Boys 19/05: marca pago ============ */
{
  const f = await fetchFech(IDS.golden)
  console.log(`\n[6] ${f.nome}`)
  const pa = (f.por_assessor || []).map((a) => /lucas/i.test(a.nome) ? { ...a, pago: true, pago_ref: PAGO_REF } : a)
  const lucas = pa.find((a) => /lucas/i.test(a.nome))
  if (!lucas) { console.error('  Lucas não encontrado — ABORTA'); process.exit(1) }
  if ((f.por_assessor || []).find((a) => /lucas/i.test(a.nome))?.pago === true) console.log('  já pago. pula.')
  else {
    console.log(`  Lucas com=${brl(lucas.comissao)} -> pago=true (${PAGO_REF})`)
    await updFech(IDS.golden, { por_assessor: pa })
    if (!DRY_RUN) console.log('  ✔ gravado')
  }
}

/* ============ 7) LUCAS — cria fechamento Nelore MNO (90, pago) ============ */
{
  const { data: exist } = await sb.from('bula_leilao_fechamento').select('id').ilike('nome', '%mno%')
  console.log('\n[7] Nelore MNO - 10/06/2026')
  if (exist && exist.length) console.log('  fechamento MNO já existe. pula.')
  else {
    console.log('  cria: vgv 18.000 · Lucas 0,5% = 90,00 · pago')
    if (!DRY_RUN) {
      const { error } = await sb.from('bula_leilao_fechamento').insert([{
        nome: 'Nelore MNO - 10/06/2026', data: '2026-06-10', local: 'BULA REMATES',
        origem: 'manual', etapa: 'realizado',
        lotes_vendidos: 1, animais_vendidos: 1, vgv_total: 18000, ticket_medio: 18000,
        comissao_assessoria: 90,
        lances: [],
        por_assessor: [{ posicao: 1, nome: 'Lucas Martins', empresa: 'Bula Assessoria', transacoes: 1, animais: 1, vgv: 18000, ticket_medio: 18000, pct_total: 1, comissao_pct: 0.005, comissao: 90, pago: true, pago_ref: PAGO_REF }],
        observacoes: 'Fechamento MANUAL criado da planilha COMISSAO LUCAS (paga 10/07/2026, NF 04): venda no leilão Nelore MNO (Bula Remates; cronograma 10/06, planilha e PIX citam 11/06), valor 18.000 x 0,5% = 90,00. Sem detalhe de lote na planilha.',
        updated_at: now(),
      }])
      if (error) { console.error('  ERRO:', error.message); process.exit(1) }
      console.log('  ✔ criado')
    }
  }
}

/* ============ 8) LUCAS — JMP: 1.701,81 -> 2.578,50 (0,5%) + pago ============ */
{
  const f = await fetchFech(IDS.jmp)
  console.log(`\n[8] ${f.nome}`)
  const cur = (f.por_assessor || []).find((a) => /lucas/i.test(a.nome))
  if (!cur) { console.error('  Lucas não encontrado — ABORTA'); process.exit(1) }
  if (Number(cur.comissao) === 2578.5 && cur.pago === true) console.log('  já ajustado. pula.')
  else {
    const delta = r2(2578.5 - (Number(cur.comissao) || 0)) // +876,69
    const pa = (f.por_assessor || []).map((a) => /lucas/i.test(a.nome)
      ? { ...a, comissao: 2578.5, comissao_pct: 0.005, pago: true, pago_ref: PAGO_REF } : a)
    const comAss = r2((Number(f.comissao_assessoria) || 0) + delta)
    const sobra = f.sobra_bruta == null ? null : r2(Number(f.sobra_bruta) - delta)
    console.log(`  Lucas: ${brl(cur.comissao)} (0,33%) -> ${brl(2578.5)} (0,5%, % da época) + pago`)
    console.log(`  comissao_assessoria: ${brl(f.comissao_assessoria)} -> ${brl(comAss)} | sobra_bruta: ${brl(f.sobra_bruta)} -> ${sobra == null ? '—' : brl(sobra)}`)
    const upd = { por_assessor: pa, comissao_assessoria: comAss }
    if (sobra != null) upd.sobra_bruta = sobra
    await updFech(IDS.jmp, upd)
    if (!DRY_RUN) console.log('  ✔ gravado')
  }
}

/* ============ 9) CP Lucas consolidado 2.758,50, pago, conciliado ============ */
{
  const { data: cp } = await sb.from('erp_contas_pagar').select('*').eq('id', IDS.cpLucasJmp).single()
  console.log(`\n[9] CP Lucas: ${brl(cp.valor)} (${cp.status}) -> ${brl(2758.5)} pago 10/07 NF 04`)
  if (cp.status === 'pago') console.log('  já pago. pula.')
  else if (!DRY_RUN) {
    const { error } = await sb.from('erp_contas_pagar').update({
      descricao: 'COMISSAO LUCAS MARTINS - MAI/JUN 2026 (Matinha Golden 19/05 R$90 + MNO 11/06 R$90 + JMP Touros 14/06 R$2.578,50)',
      valor: 2758.5, valor_pago: 2758.5, status: 'pago', data_pagamento: '2026-07-10',
      forma_pagamento: 'transferencia', conta_bancaria_id: IDS.contaSicoob, nota_fiscal: 'NF 04',
      observacoes: String(cp.observacoes || '') + ' [CONCILIADO 23/07] Consolidado conforme planilha COMISSAO LUCAS: Matinha Golden 19/05 (18.000x0,5%=90) + MNO 11/06 (18.000x0,5%=90) + JMP Touros 14/06 (515.700x0,5%=2.578,50) = 2.758,50, pago 10/07 NF 04 via PIX Sicoob (movimento 1055adac). O % da época do Lucas era 0,5% (tabela 0,33% vale de 22/07 em diante). Matinha Virtual 21/06 (CP 432,00) NÃO entra: não consta na planilha paga, segue em aberto p/ próximo ciclo.',
      updated_at: now(),
    }).eq('id', IDS.cpLucasJmp)
    if (error) { console.error('  ERRO:', error.message); process.exit(1) }
    console.log('  ✔ baixado')
  }
}

/* ============ 10) Movimento do extrato -> vincula ao CP (conciliado) ============ */
{
  const { data: mov } = await sb.from('erp_movimentos_bancarios').select('id,conta_pagar_id,status_conciliacao').eq('id', IDS.movLucas).single()
  console.log(`\n[10] Movimento PIX 2.758,50 (10/07): vinculo=${mov.conta_pagar_id ? 'já vinculado' : '—'}`)
  if (mov.conta_pagar_id) console.log('  já vinculado. pula.')
  else if (!DRY_RUN) {
    const { error } = await sb.from('erp_movimentos_bancarios').update({
      conta_pagar_id: IDS.cpLucasJmp, conciliado: true, status_conciliacao: 'conciliado',
    }).eq('id', IDS.movLucas)
    if (error) { console.error('  ERRO:', error.message); process.exit(1) }
    console.log('  ✔ conciliado')
  }
}

console.log(DRY_RUN ? '\nDRY RUN concluído. Rode sem DRY_RUN para gravar.' : '\nConcluído.')
