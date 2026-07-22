// Ajusta fechamentos (Admin) + CPs de comissão (ERP) de JUNHO/2026 conforme as
// planilhas de fechamento dos próprios assessores (pasta "Fechamento assessores 0626",
// 22/07/2026): COMISSAO JUNHO DOUGLAS.xlsx, PLANILHA COMISSÃO BULA junho26 (Fábio),
// planilha Leo.jpeg (Leonardo Serafim). Vendas canceladas depois do leilão fazem o
// sistema divergir; as planilhas são a condição real das comissões.
//
// O que faz:
//   1. bula_leilao_fechamento.por_assessor: seta vgv/comissao/pct/animais/transacoes
//      dos 3 assessores por leilão conforme planilha; recalcula vgv_total e
//      comissao_assessoria (soma dos pisteiros). Camparino: lote "Não informado"
//      (24.500) reatribuído ao Fábio. FLOC: atribuição Douglas↔Fábio corrigida.
//      Tresmar: adiciona Douglas (30.000) e Leonardo (126.000). Flor do Aratau:
//      "Não informado" (312.300/14 animais) = Douglas, 0,5% pago pela Bula Remates
//      (R$ 5.674,50 — fora do ERP Assessoria).
//   2. erp_contas_pagar: atualiza valores divergentes, cria CPs faltantes
//      (Kriz/MEAB/Tresmar), e flaga p/ conferência CPs que NÃO constam na planilha
//      do assessor (Douglas: Santa Nice 3.360 e JMP Bezerras 2.520) — sem apagar.
//      Conflito Flor do Aratau lote 01 (Fábio reivindica 3.690; regra do áudio Rusa
//      manda p/ Gustavo Rusa) fica flagado, valor mantido em 639 (lote 05).
//
// Uso: node scripts/ajusta-comissoes-junho-planilhas-assessores-2026-07-22.mjs        (dry-run)
//      node scripts/ajusta-comissoes-junho-planilhas-assessores-2026-07-22.mjs --apply
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const MARK = '[FECH-ASSESSORES-0626 22/07]'
const VENC = '2026-07-27'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const deacc = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const key = (s) => deacc(s).trim().toUpperCase().replace(/\s+/g, ' ')
const r2 = (n) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// 1) Fechamentos: valores-alvo por assessor (das planilhas)
// ---------------------------------------------------------------------------
const FECH = {
  // 41o Touros Camparino - 06/06 — Fábio: lotes 58/68/32/14 (14x); lote "Não informado" 24.500 era o lote 32 dele
  'ebfbce96-4c51-49e9-994b-1d117fdaf486': {
    removeEntries: [{ nomeKey: 'NAO INFORMADO', vgv: 24500 }],
    set: {
      'FABIO OMENA': { vgv: 93100, comissao: 2793, comissao_pct: 0.03, animais: 4, transacoes: 4, obs: 'Planilha do assessor 21/07: lotes 58, 68, 32 e 14 (parcelas 14x). Inclui o lote 32 (24.500) que estava como "Não informado".' },
    },
  },
  // 8o Jacamim Femeas - 07/06 — Fábio: lotes 55/44/83 (3 lotes, antes 2)
  'c1afc577-062e-4473-8a53-0d10e6802392': {
    set: {
      'FABIO OMENA': { vgv: 73200, comissao: 2196, comissao_pct: 0.03, animais: 3, transacoes: 3, obs: 'Planilha do assessor 21/07: lotes 55 e 44 (Nelore Beca) + 83 (Nelore Zibungo).' },
    },
  },
  // 3º Nelore Tresmar - 11/06 — planilhas trazem Douglas (lote 17) e Leonardo (lotes 1 e 15) que não estavam no fechamento
  '990ca7e3-61a6-433b-a9a7-6f8093beb183': {
    add: [
      { vgv: 30000, nome: 'Douglas Bispo', animais: 1, empresa: 'Bula Assessoria', comissao: 600, transacoes: 1, comissao_pct: 0.02, observacao: `${MARK} Planilha do assessor: lote 17 (Luciano Pereira), 1.000x30.` },
      { vgv: 126000, nome: 'Leonardo Serafim', animais: 2, empresa: 'Bula Assessoria', comissao: 2520, transacoes: 2, comissao_pct: 0.02, observacao: `${MARK} Planilha do assessor (foto 21/07): lotes 1 (2.200x30) e 15 (2.000x30), comprador Joel.` },
    ],
  },
  // 10o JMP Touros - 14/06 — Douglas caiu p/ 234.100 (cancelamento ~48k); Fábio subiu p/ 1.315.000
  'c0f291bb-17bc-4b10-b320-c5ed6e767057': {
    set: {
      'DOUGLAS BISPO': { vgv: 234100, comissao: 4682, comissao_pct: 0.02, animais: 10, transacoes: 4, obs: 'Planilha do assessor 21/07: lotes 221 (4x550x40), 188 (4x600x40), 87 (870x30), 80 (800x30). VGV caiu de 282.100 (venda cancelada ~48.000).' },
      'FABIO OMENA': { vgv: 1315000, comissao: 39450, comissao_pct: 0.03, animais: 9, transacoes: 9, obs: 'Planilha do assessor 21/07: 9 lotes incl. 1001/1003/1005 (Tera Confinamento). Base subiu 3.000 vs anterior (1.312.000).' },
    },
  },
  // Seleção Nelore Floc - 15/06 — atribuição trocada: Douglas ficou c/ lotes 11 e 13; Fábio c/ 24, 17e23, 30 (mesmo VGV total do leilão)
  'd55a15c3-e057-40fc-adb4-d10f1ad97313': {
    set: {
      'DOUGLAS BISPO': { vgv: 30600, comissao: 612, comissao_pct: 0.02, animais: 2, transacoes: 2, obs: 'Planilha do assessor 21/07: lotes 11 e 13 (Ricardo Brasileiro). Atribuição corrigida (antes 62.400).' },
      'FABIO OMENA': { vgv: 66300, comissao: 1989, comissao_pct: 0.03, animais: 4, transacoes: 3, obs: 'Planilha do assessor 21/07: lotes 24, 17e23 (Adenilson Tedesco) e 30 (Francisco Alex). Atribuição corrigida (antes 34.500).' },
    },
  },
  // Touros Provados Terra Brava (16-18/06) — Fábio: 3 lotes 60.000 (1 lote ~20.400 cancelado); Douglas confere
  '8d6ac3ae-4e38-4120-a49c-eafbc09c507f': {
    set: {
      'FABIO OMENA': { vgv: 60000, comissao: 1800, comissao_pct: 0.03, animais: 3, transacoes: 3, obs: 'Planilha do assessor 21/07: lotes 37, 138 e 59 (Agenor). VGV caiu de 80.400 (venda cancelada ~20.400).' },
    },
  },
  // Kriz Matrizes - 16/06 — Douglas: 261.000 (antes 285.000, cancelamento ~24k); Leonardo confere
  'ff55a57e-7aab-4105-a794-7125a41b7efe': {
    set: {
      'DOUGLAS BISPO': { vgv: 261000, comissao: 5220, comissao_pct: 0.02, animais: 17, transacoes: 12, obs: 'Planilha do assessor 21/07: 12 lotes / 17 animais. VGV caiu de 285.000 (venda cancelada ~24.000).' },
    },
  },
  // 3º Matrizes KatiSpera - 20/06 — Douglas: 165.000 (antes 185.100)
  '000dfda9-ae2e-4b79-a50d-3f537cf33143': {
    set: {
      'DOUGLAS BISPO': { vgv: 165000, comissao: 3300, comissao_pct: 0.02, animais: 10, transacoes: 2, obs: 'Planilha do assessor 21/07: lotes 89 e 91 (5+5, Mauro Cesar). VGV caiu de 185.100 (cancelamento ~20.100).' },
    },
  },
  // Matinha - 21/06 — Fábio: BAT 13 em 40 parcelas (112.000, antes 84.000 em 30x)
  '2ffd63ed-ee77-49cf-afc2-8fe077c9550e': {
    set: {
      'FABIO OMENA': { vgv: 112000, comissao: 3360, comissao_pct: 0.03, animais: 5, transacoes: 1, obs: 'Planilha do assessor 21/07: BAT 13, 5 animais, 560x40 (Guy Rangel) — parcelamento 40x, não 30x.' },
    },
  },
  // MEAB & Modelo - 23/06 — Douglas: 434.100 c/ 2 lotes @5% (Henrique Areas); Leonardo confere
  '1afff4c2-1a60-4580-b8c6-2d9d5c63dffd': {
    set: {
      'DOUGLAS BISPO': { vgv: 434100, comissao: 10185, comissao_pct: null, animais: 23, transacoes: 23, obs: 'Planilha do assessor 21/07: 23 lotes. Lotes 16 (28.500) e 14 (21.600) do Henrique Areas a 5% (=2.505); demais 384.000 a 2% (=7.680). VGV caiu de 452.100 (cancelamento ~18.000).' },
    },
  },
  // 9o Flor do Aratau - 07/06 — "Não informado" (312.300/14 animais) = Douglas (0,5% via Bula Remates); Fábio lote 05 = 21.300
  'dd10dd7d-f4d1-4656-ba07-175c4ea3b81e': {
    rename: [{ nomeKey: 'NAO INFORMADO', vgv: 312300, nome: 'Douglas Bispo', empresa: 'Bula Remates', obs: 'Planilha do assessor 21/07: "VENDI 14 ANIMAIS". Comissão 0,5% sobre faturamento total do leilão (1.134.900) = R$ 5.674,50, paga pela BULA REMATES — fora do ERP da Assessoria.' }],
    add: [
      { vgv: 123000, nome: 'Gustavo Rusa', animais: 1, empresa: 'Outro', comissao: 0, transacoes: 1, comissao_pct: 0.05, observacao: `${MARK} Lote 01 (Diego Batista, 4.100x30). Regra do áudio 30/06: comissão 5% (6.150) é do Rusa, já lançada à parte — zerada aqui p/ não duplicar. Fábio reivindica este lote na planilha 21/07 (PENDENTE decisão do chefe).` },
    ],
    set: {
      'FABIO OMENA': { vgv: 21300, comissao: 639, comissao_pct: 0.03, animais: 1, transacoes: 1, obs: 'Planilha do assessor 21/07: lote 05 (André Caetano), 710x30 = 21.300 (antes 21.600). Lote 01 segue regra do áudio (comissão do Gustavo Rusa) — reivindicação do Fábio (3.690 + corte 594) PENDENTE de decisão do chefe.' },
    },
  },
}

// ---------------------------------------------------------------------------
// 2) CPs: updates de valor, criações e flags
// ---------------------------------------------------------------------------
const CP_UPDATE = [
  { doc: 'BULA-2026-CP-COM-CAMPARINO-FABIO-OMENA', valor: 2793, note: 'Ajustado de 4.410 p/ 2.793 (planilha do assessor: base 93.100 x 3%, lotes 58/68/32/14 em 14x).' },
  { doc: 'BULA-2026-CP-COM-CAMPARINO-LEONARDO-SERAFIM', valor: 392, note: 'Ajustado de 840 p/ 392 (planilha do assessor: só lote 82, 19.600 x 2%).' },
  { doc: 'BULA-2026-CP-COM-JACAMIM-FABIO-OMENA', valor: 2196, note: 'Ajustado de 1.593 p/ 2.196 (planilha do assessor: 3 lotes, base 73.200 x 3%).' },
  { doc: 'BULA-2026-CP-COM-JMP-TOUROS-FABIO', valor: 39450, note: 'Ajustado de 39.360 p/ 39.450 (planilha do assessor: base 1.315.000 x 3%).' },
  { doc: 'BULA-2026-CP-COM-JMP-TOUROS-DOUGLAS', valor: 4682, note: 'Ajustado de 5.642 p/ 4.682 (planilha do assessor: base 234.100 x 2%; venda cancelada ~48.000).' },
  { doc: 'BULA-2026-CP-COM-FLOC-DOUGLAS', valor: 612, note: 'Ajustado de 1.248 p/ 612 (planilha do assessor: lotes 11 e 13, base 30.600 x 2%; atribuição FLOC corrigida c/ Fábio).' },
  { doc: 'BULA-2026-CP-COM-FLOC-FABIO', valor: 1989, note: 'Ajustado de 1.035 p/ 1.989 (planilha do assessor: 3 lotes, base 66.300 x 3%; atribuição FLOC corrigida c/ Douglas).' },
  { doc: 'BULA-2026-CP-COM-TERRABRAVA-PROVADOS-JUNHO-2026-FABIO-OMENA', valor: 1800, note: 'Ajustado de 2.412 p/ 1.800 (planilha do assessor: 3 lotes, base 60.000 x 3%; venda cancelada ~20.400).' },
  { doc: 'BULA-2026-CP-COM-KATISPERA-DOUGLAS', valor: 3300, note: 'Ajustado de 3.702 p/ 3.300 (planilha do assessor: base 165.000 x 2%; cancelamento ~20.100).' },
  { doc: 'BULA-2026-CP-COM-MATINHA-VIRTUAL-20260621-FABIO-OMENA', valor: 3360, note: 'Ajustado de 2.520 p/ 3.360 (planilha do assessor: BAT 13 em 40 parcelas — base 112.000 x 3%).' },
  { doc: 'BULA-2026-CP-COM-FLOR-ARATAU-FABIO-OMENA', valor: 639, note: 'Ajustado de 648 p/ 639 (planilha do assessor: lote 05 = 710x30 = 21.300 x 3%). PENDENTE decisão do chefe: Fábio reivindica lote 01 (3.690) + corte 40 fêmeas a 0,5% (594), mas regra do áudio 30/06 manda a comissão do lote 01 p/ o Gustavo Rusa.' },
]

// referência p/ fornecedor_id/categoria_id dos novos CPs
const REF_DOC = {
  DOUGLAS: 'BULA-2026-CP-COM-KATISPERA-DOUGLAS',
  LEONARDO: 'BULA-2026-CP-COM-MAGDA-LEONARDO-SERAFIM',
}
const CP_CREATE = [
  { doc: 'BULA-2026-CP-COM-TRESMAR-JUN-DOUGLAS', ref: 'DOUGLAS', valor: 600, descricao: 'COMISSAO 3º LEILÃO NELORE TRESMAR - 11/06/2026 - DOUGLAS BISPO (2%)', obs: 'Comissão 2% sobre VGV de cobertura 30.000,00 (lote 17, Luciano Pereira). Vinculado ao fechamento 990ca7e3-61a6-433b-a9a7-6f8093beb183.' },
  { doc: 'BULA-2026-CP-COM-TRESMAR-JUN-LEONARDO', ref: 'LEONARDO', valor: 2520, descricao: 'COMISSAO 3º LEILÃO NELORE TRESMAR - 11/06/2026 - LEONARDO SERAFIM (2%)', obs: 'Comissão 2% sobre VGV de cobertura 126.000,00 (lotes 1 e 15, comprador Joel). Vinculado ao fechamento 990ca7e3-61a6-433b-a9a7-6f8093beb183.' },
  { doc: 'BULA-2026-CP-COM-KRIZ-MATRIZES-DOUGLAS', ref: 'DOUGLAS', valor: 5220, descricao: 'COMISSAO LEILÃO KRIZ MATRIZES - 16/06/2026 - DOUGLAS BISPO (2%)', obs: 'Comissão 2% sobre VGV de cobertura 261.000,00 (12 lotes / 17 animais). Vinculado ao fechamento ff55a57e-7aab-4105-a794-7125a41b7efe. CP estava faltando no ERP.' },
  { doc: 'BULA-2026-CP-COM-KRIZ-MATRIZES-LEONARDO', ref: 'LEONARDO', valor: 2652, descricao: 'COMISSAO LEILÃO KRIZ MATRIZES - 16/06/2026 - LEONARDO SERAFIM (2%)', obs: 'Comissão 2% sobre VGV de cobertura 132.600,00 (lotes 32/24/35/19/20/22/23/27). Vinculado ao fechamento ff55a57e-7aab-4105-a794-7125a41b7efe. CP estava faltando no ERP.' },
  { doc: 'BULA-2026-CP-COM-MEAB-MODELO-DOUGLAS', ref: 'DOUGLAS', valor: 10185, descricao: 'COMISSAO LEILÃO NELORE MEAB & FAZENDA MODELO - 23/06/2026 - DOUGLAS BISPO (2%/5%)', obs: 'Comissão sobre VGV de cobertura 434.100,00: lotes 16 e 14 (Henrique Areas, 50.100) a 5% = 2.505 + demais (384.000) a 2% = 7.680. Vinculado ao fechamento 1afff4c2-1a60-4580-b8c6-2d9d5c63dffd. CP estava faltando no ERP.' },
  { doc: 'BULA-2026-CP-COM-MEAB-MODELO-LEONARDO', ref: 'LEONARDO', valor: 2292, descricao: 'COMISSAO LEILÃO NELORE MEAB & FAZENDA MODELO - 23/06/2026 - LEONARDO SERAFIM (2%)', obs: 'Comissão 2% sobre VGV de cobertura 114.600,00 (lotes 23/24/3/24 Modelo). Vinculado ao fechamento 1afff4c2-1a60-4580-b8c6-2d9d5c63dffd. CP estava faltando no ERP.' },
]

const CP_FLAG = [
  { doc: 'BULA-2026-CP-COM-SANTA-NICE-DOUGLAS-BISPO', note: 'CONFERIR ANTES DE PAGAR: esta venda NÃO consta na planilha de fechamento do Douglas (0626). Confirmar se as 4 vendas (168.000) foram canceladas ou se ele esqueceu de listar.' },
  { doc: 'BULA-2026-CP-COM-JMP-FEMEAS-DOUGLAS', note: 'CONFERIR ANTES DE PAGAR: esta venda NÃO consta na planilha de fechamento do Douglas (0626). Confirmar se a venda (126.000, bezerras 13/06) foi cancelada ou se ele esqueceu de listar.' },
  { doc: 'BULA-2026-CP-COM-MEAB-MODELO-FABIO', note: 'Planilha do Fábio 21/07 lista estes 3 lotes (Rodrigo Rocha, 80.700) como "VENDA SEM APROVACAO", fora do total dele. Mantido aguardando decisão.' },
]

// ---------------------------------------------------------------------------
// execução
// ---------------------------------------------------------------------------
const log = (...a) => console.log(...a)
log(APPLY ? '>>> APPLY' : '>>> DRY-RUN (use --apply para gravar)')

// --- fechamentos ---
const ids = Object.keys(FECH)
const { data: fechs, error: eF } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,vgv_total,comissao_assessoria,por_assessor').in('id', ids)
if (eF) throw eF

for (const f of fechs) {
  const plan = FECH[f.id]
  let ass = Array.isArray(f.por_assessor) ? JSON.parse(JSON.stringify(f.por_assessor)) : []

  for (const rm of plan.removeEntries || []) {
    const i = ass.findIndex((a) => key(a.nome) === rm.nomeKey && Number(a.vgv) === rm.vgv)
    if (i >= 0) ass.splice(i, 1)
  }
  for (const rn of plan.rename || []) {
    const a = ass.find((x) => key(x.nome) === rn.nomeKey && Number(x.vgv) === rn.vgv)
    if (a) { a.nome = rn.nome; if (rn.empresa) a.empresa = rn.empresa; a.observacao = `${MARK} ${rn.obs}` }
  }
  for (const [nomeKey, s] of Object.entries(plan.set || {})) {
    const a = ass.find((x) => key(x.nome) === nomeKey)
    if (!a) { log(`  !! ${f.nome}: assessor ${nomeKey} não encontrado`); continue }
    a.vgv = s.vgv; a.comissao = s.comissao; a.animais = s.animais; a.transacoes = s.transacoes
    if (s.comissao_pct !== undefined) a.comissao_pct = s.comissao_pct
    a.observacao = `${MARK} ${s.obs}`
    if (a.ticket_medio !== undefined) a.ticket_medio = s.animais ? Math.round(s.vgv / s.animais) : 0
  }
  for (const addEntry of plan.add || []) {
    if (!ass.some((x) => key(x.nome) === key(addEntry.nome))) ass.push(addEntry)
  }
  const vgvTotal = r2(ass.reduce((s, a) => s + (Number(a.vgv) || 0), 0))
  const comTotal = r2(ass.reduce((s, a) => s + (Number(a.comissao) || 0), 0))
  ass = ass.sort((a, b) => (Number(b.vgv) || 0) - (Number(a.vgv) || 0)).map((a, i) => {
    const out = { ...a, posicao: i + 1 }
    if (out.pct_total !== undefined) out.pct_total = vgvTotal > 0 ? r2(((Number(a.vgv) || 0) / vgvTotal) * 10000) / 100 / 100 : 0
    return out
  })
  log(`\n${f.nome}`)
  log(`  vgv_total ${f.vgv_total} -> ${vgvTotal} | comissao_assessoria ${f.comissao_assessoria} -> ${comTotal}`)
  for (const a of ass) log(`   - ${a.nome}: vgv ${a.vgv} comissao ${a.comissao}`)
  if (APPLY) {
    const { error } = await sb.from('bula_leilao_fechamento')
      .update({ por_assessor: ass, vgv_total: vgvTotal, comissao_assessoria: comTotal }).eq('id', f.id)
    if (error) throw error
  }
}

// --- CPs: updates ---
log('\n--- CP updates ---')
for (const u of CP_UPDATE) {
  const { data: cp, error } = await sb.from('erp_contas_pagar')
    .select('id,valor,status,observacoes').eq('numero_documento', u.doc).maybeSingle()
  if (error) throw error
  if (!cp) { log(`  !! CP não encontrado: ${u.doc}`); continue }
  if (cp.status === 'pago') { log(`  !! ${u.doc} já está PAGO (${cp.valor}) — não alterado; conferir manualmente`); continue }
  log(`  ${u.doc}: ${cp.valor} -> ${u.valor}`)
  if (APPLY) {
    const obs = cp.observacoes?.includes(MARK) ? cp.observacoes : `${cp.observacoes || ''}\n${MARK} ${u.note}`.trim()
    const { error: e2 } = await sb.from('erp_contas_pagar').update({ valor: u.valor, observacoes: obs }).eq('id', cp.id)
    if (e2) throw e2
  }
}

// --- CPs: criações ---
log('\n--- CP criações ---')
const refIds = {}
for (const [k, doc] of Object.entries(REF_DOC)) {
  const { data } = await sb.from('erp_contas_pagar').select('fornecedor_id,categoria_id').eq('numero_documento', doc).maybeSingle()
  refIds[k] = data
}
for (const c of CP_CREATE) {
  const { data: exists } = await sb.from('erp_contas_pagar').select('id,valor').eq('numero_documento', c.doc).maybeSingle()
  if (exists) { log(`  = já existe ${c.doc} (${exists.valor})`); continue }
  const ref = refIds[c.ref]
  if (!ref) { log(`  !! sem referência p/ ${c.ref}`); continue }
  log(`  + ${c.doc}: ${c.valor}`)
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').insert({
      descricao: c.descricao, fornecedor_id: ref.fornecedor_id, categoria_id: ref.categoria_id,
      valor: c.valor, emissao: '2026-07-22', vencimento: VENC, status: 'aberto',
      numero_documento: c.doc, observacoes: `${MARK} ${c.obs} Gerada a partir da planilha de fechamento do assessor (pasta 0626).`,
    })
    if (error) throw error
  }
}

// --- CPs: flags ---
log('\n--- CP flags (sem mudança de valor) ---')
for (const fl of CP_FLAG) {
  const { data: cp } = await sb.from('erp_contas_pagar').select('id,observacoes').eq('numero_documento', fl.doc).maybeSingle()
  if (!cp) { log(`  !! CP não encontrado: ${fl.doc}`); continue }
  if (cp.observacoes?.includes(MARK)) { log(`  = já flagado ${fl.doc}`); continue }
  log(`  ~ flag ${fl.doc}`)
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar')
      .update({ observacoes: `${MARK} ${fl.note}\n${cp.observacoes || ''}`.trim() }).eq('id', cp.id)
    if (error) throw error
  }
}

log('\nFeito.' + (APPLY ? '' : ' (dry-run — nada gravado)'))
