// Retifica os fechamentos de MAIO/2026 com base nas Planilhas Financeiras da
// Ana Paula (pasta "Fechamentos Ana" no desktop, impressas em 21/07/2026) —
// ela era a responsável pelo financeiro e é a fonte de verdade do que foi
// efetivamente cobrado, recebido e pago por leilão.
//
// O que este script faz (e por quê):
//   1. bula_leilao_fechamento: corrige receita_bula (real cobrado, batendo
//      com os CRs conciliados no ERP), comissao_assessoria (soma real paga
//      por leilão), preenche despesas_variaveis (campo estava 0 em TODOS —
//      hotel/diária/uber/patrocinado etc. da Ana) e recalcula sobra_bruta.
//      Preenche por_assessor[].comissao (comissão REAL por assessor) onde o
//      mapeamento é inequívoco. Append em observacoes com a fonte.
//   2. Cria os fechamentos que NÃO existiam no sistema: RIBALTA 60 ANOS
//      (14/05, receita 58.890) e NELORE JEM (15/05, receita 3.825) — só com
//      o financeiro (sem dados de venda/cobertura; vgv 0 + observação).
//   3. erp_contas_receber: vincula fechamento_id nos CRs órfãos dos leilões
//      de maio (Kito/Marcio→4R, Tresmar, Matinha Matrizes, Ribalta, JEM).
//
// O que ele NÃO faz (decisão consciente):
//   - Não cria CP de comissões já pagas (o caixa/extrato já está conciliado
//     banco-como-árbitro até 20/07; lançar de novo duplicaria despesa).
//   - Não cria CR para receitas já recebidas sem CR (mesmo motivo).
//   - Não mexe na receita do Santa Fé (sistema 20.610 × Ana 14.000 Fireman ×
//     CR Agreste 9.200 — três números; divergência vai para observação).
//
// Idempotente: marca [ANA-2026-07] nas observações e pula quem já tem.
// Uso: DRY_RUN=1 node scripts/retifica-fechamentos-ana-maio-2026.mjs
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

const MARK = '[ANA-2026-07]'
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

// ── Dataset extraído das 12 planilhas da Ana (21/07/2026) ───────────────────
// comissoes: { <chave do assessor no por_assessor>: valor } — chave é um
// pedaço do nome (case-insensitive) p/ casar com por_assessor[].nome.
// FDB LTDA paga → entra na linha do Marcelo Carneiro (payable Fórmula do Boi).
const RETIFICACOES = [
  {
    id: '145dbec3', nome: 'EAO Fêmeas 02/05',
    receita: 54669.29, comissao: 24939.00, despesas: 4213.00,
    comissoes: { fabio: 11979.00, marcelo: 960.00 },
    obs: 'Receita real EAO 02+03/05 = R$ 80.272,00 recebida 03/07 (0,33% fat.; CRs 052/053 conciliados). Comissões pagas: Fábio LT 31/75/76/96 R$ 11.979 (07/07), Rusa LT 36/49/86/83 R$ 12.000 (12/06), Marcelo R$ 960 (26/06). Despesas: rateio Expozebu R$ 3.500 + patrocinado R$ 413 + diária Matheus R$ 300.',
  },
  {
    id: '293de295', nome: 'EAO Touros 03/05',
    receita: 25602.72, comissao: 1125.00, despesas: 300.00,
    comissoes: { fabio: 1125.00 },
    obs: 'Receita real conjunta com 02/05 (ver CR-053). Comissão paga: Fábio LT 119 R$ 1.125 (07/07). Diária Matheus R$ 300. Venda de cavalo MT M04 (Jaime Rodrigues, R$ 56.000) sem comissão.',
  },
  {
    id: 'b6370f22', nome: 'Pintado Raiz 05/05',
    receita: null, comissao: 3996.00, despesas: 0,
    comissoes: { fabio: 3996.00 },
    obs: 'Comissões pagas 07/07: Fábio LT1/24/25/27/29/33/34/40/42/44/46/47 R$ 3.564 + LT9 R$ 432. Receita R$ 4.588 (1% fat.) segue EM ABERTO no CR-055 (vencida 05/05).',
  },
  {
    id: '3314a71a', nome: 'Santa Fé 07/05',
    receita: null, comissao: null, despesas: 150.00,
    comissoes: { fabio: 1890.00, marcelo: 600.00, douglas: 2280.00 },
    obs: 'Comissões pagas: Fábio LT 8/25 R$ 1.890 (07/07), FdB LT 20 R$ 600 (26/06), Douglas LT 12/13/15/16/30/32 R$ 2.280 (25/06). ⚠ Receita divergente entre fontes: sistema R$ 20.610 × Ana R$ 14.000 (Fireman, recebido 19/06) × CR Agreste R$ 9.200 (recebido 21/06) — conferir com a diretoria antes de retificar.',
  },
  {
    id: 'b3d1c05c', nome: '32º 4R 09/05',
    receita: 82230.00, comissao: 4477.50, despesas: 1733.20,
    comissoes: { fabio: 2205.00, marcelo: 1830.00 },
    obs: 'Receita real: Kito R$ 45.090 (3× R$ 15.030 — 1ª recebida 30/06, demais 30/07 e 30/08) + Marcio MRA R$ 37.140 (vencido). Comissões pagas: Fábio LT 40/94 R$ 2.205, FdB LT 76/91+104/11/83 R$ 1.830, Laila R$ 442,50 (13/07). Despesas: alimentação/patrocinado/diária/hotel R$ 1.733,20.',
  },
  {
    id: 'a9f50214', nome: 'Santa Nazaré 14/05',
    receita: 11428.00, comissao: 4568.00, despesas: 582.87,
    comissoes: { fabio: 744.00, marcelo: 3824.00 },
    obs: 'Receita real R$ 11.428 (1% fat.) — EM ABERTO desde 14/05 (CR-058 vencido). Comissões pagas: Fábio LT 20 R$ 744 (07/07), FdB LT 32/35/36/42 R$ 3.824 (26/06). Despesas: tráfego Douglas R$ 286,85 + combustível Fábio R$ 296,02.',
  },
  {
    id: '24946720', nome: 'Golden Boys Matinha 19/05',
    receita: 8216.40, comissao: 504.00, despesas: 350.00,
    comissoes: { fabio: 414.00, lucas: 90.00 },
    obs: 'Receita real R$ 8.216,40 recebida 15/07 (NF 599 Tangará: 0,30% × fat. R$ 2.032.800 + 5% s/ vendas Tangará LT 203/245). ⚠ Nota da Ana: a NF 599 recebeu junto os leilões de 15/05 e 17/05; NF 600 R$ 6.313 (Sr. JR Fernandes) recebida no Sicredi em 15/07. Comissões pagas: Fábio LT 245 R$ 414, Lucas LT 203 R$ 90.',
  },
  {
    id: '811f774e', nome: 'Tresmar 21/05',
    receita: null, comissao: 5088.00, despesas: 350.00,
    comissoes: { douglas: 1314.00, fabio: 1584.00, marcelo: 1290.00 },
    obs: 'Receita R$ 9.933 recebida 15/06 (Bula Remates). Comissões pagas: Douglas LT 27/28/29/37 R$ 1.314, Fábio LT 8/31/32 R$ 1.584, FdB LT1 R$ 1.290, Fabricio R$ 900 (acerto 10/07). Patrocinado Fábio R$ 350.',
  },
  {
    id: 'b807e56f', nome: 'LS Now 30/05',
    receita: 16666.58, comissao: 3042.00, despesas: 5697.63,
    comissoes: { fabricio: 1800.00, fabio: 1242.00 },
    obs: 'Receita real R$ 16.666,58 (1% fat + 4% vendas, E Rural) recebida 09/07. Comissões pagas: Fábio LT 10/25 R$ 1.242, Fabricio R$ 1.800 (acerto 10/07). Despesas de viagem Fábio (passagem Maceió/Goiânia, hotel, uber, táxi, alimentação, patrocinado) + diária Matheus = R$ 5.697,63.',
  },
  {
    id: '84a96ad4', nome: 'LS Collection 31/05',
    receita: 17833.31, comissao: null, despesas: 475.50,
    comissoes: {},
    obs: 'Receita real R$ 17.833,31 (1% fat + 4% vendas, E Rural) recebida 30/06. Comissões (já corretas): FdB LT 11 R$ 432, Fábio LT 16/36 R$ 1.080. Diária Matheus R$ 300 + alimentação Fábio R$ 175,50.',
  },
]

// Fechamentos que não existiam no sistema (Ana tinha o financeiro)
const NOVOS = [
  {
    nome: 'Leilão Especial 60 Anos de Seleção Ribalta – 14/05/2026',
    data: '2026-05-14', local: 'Dourados/MS',
    receita: 58890.00, comissao: 0, despesas: 2935.02,
    crDoc: 'BULA-2026-CR-057-RIBALTA',
    obs: 'Fechamento criado em 21/07/2026 a partir da Planilha Financeira da Ana (sem dados de venda/cobertura da equipe — só financeiro). Receita R$ 58.890 (Ricardo Goulart Carvalho Filho) recebida 26/05. ⚠ PAGO NA CONTA PF SICOOB DO FELIPE — SEM NOTA. Despesas de campo (hotéis, alimentação, táxi, uber, patrocinado) R$ 2.935,02.',
  },
  {
    nome: '2º Leilão Touros de Produtor para Produtor – Nelore JEM – 15/05/2026',
    data: '2026-05-15', local: null,
    receita: 3825.00, comissao: 0, despesas: 0,
    crDoc: 'BULA-2026-CR-EXTRA-NELORE-JEM',
    obs: 'Fechamento criado em 21/07/2026 a partir da Planilha Financeira da Ana (sem dados de venda/cobertura — só financeiro). Receita R$ 3.825 (José Eduardo Motta, comissão de venda 3%) recebida 29/06. Sem despesas.',
  },
]

// CRs órfãos → vincular ao fechamento certo (numero_documento → id do fech.)
const VINCULOS_CR = [
  { doc: 'BULA-2026-CR-EXTRA-NELORE-MARCOS-DE', fech: 'b3d1c05c' },
  { doc: 'BULA-2026-CR-KITO-20260509-B1', fech: 'b3d1c05c' },
  { doc: 'BULA-2026-CR-KITO-20260509-B2', fech: 'b3d1c05c' },
  { doc: 'BULA-2026-CR-EXTRA-NELORE-MARCIO-DE', fech: 'b3d1c05c' },
  { doc: 'BULA-2026-CR-061-TRESMAR', fech: '811f774e' },
  { doc: 'BULA-2026-CR-059', fech: '89d648a7' },
]

// ── Execução ────────────────────────────────────────────────────────────────
const { data: fechs, error: e1 } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,receita_bula,comissao_assessoria,sobra_bruta,despesas_variaveis,por_assessor,observacoes')
  .gte('data', '2026-05-01').lte('data', '2026-05-31')
if (e1) { console.error(e1); process.exit(1) }
const byPrefix = (p) => fechs.find((f) => f.id.startsWith(p))

console.log(`${DRY_RUN ? '=== DRY RUN ===' : '=== APLICANDO ==='}\n`)

// 1) Retificações
for (const r of RETIFICACOES) {
  const f = byPrefix(r.id)
  if (!f) { console.log(`✗ ${r.nome}: fechamento ${r.id} não encontrado — PULADO`); continue }
  if ((f.observacoes || '').includes(MARK)) { console.log(`· ${r.nome}: já retificado — pulado`); continue }

  const receita = r.receita != null ? r.receita : Number(f.receita_bula) || 0
  const comissao = r.comissao != null ? r.comissao : Number(f.comissao_assessoria) || 0
  const porAssessor = (f.por_assessor || []).map((a) => {
    const nomeLower = String(a.nome || '').toLowerCase()
    for (const [chave, valor] of Object.entries(r.comissoes)) {
      if (nomeLower.includes(chave)) return { ...a, comissao: valor }
    }
    return a
  })
  const payload = {
    receita_bula: receita,
    comissao_assessoria: comissao,
    sobra_bruta: receita - comissao,
    despesas_variaveis: r.despesas,
    por_assessor: porAssessor,
    observacoes: `${f.observacoes ? f.observacoes + '\n\n' : ''}${MARK} Financeiro retificado conforme Planilha Financeira da Ana (21/07/2026): ${r.obs}`,
    updated_at: new Date().toISOString(),
  }
  console.log(`→ ${r.nome}`)
  console.log(`   receita  ${brl(f.receita_bula)} → ${brl(receita)}${r.receita == null ? ' (mantida)' : ''}`)
  console.log(`   comissão ${brl(f.comissao_assessoria)} → ${brl(comissao)}${r.comissao == null ? ' (mantida)' : ''}`)
  console.log(`   desp.var ${brl(f.despesas_variaveis)} → ${brl(r.despesas)} · sobra → ${brl(receita - comissao)}`)
  if (!DRY_RUN) {
    const { error } = await sb.from('bula_leilao_fechamento').update(payload).eq('id', f.id)
    if (error) { console.error('   ERRO:', error.message); process.exit(1) }
  }
}

// 2) Fechamentos novos (Ribalta, JEM)
for (const n of NOVOS) {
  const { data: exists } = await sb.from('bula_leilao_fechamento').select('id').eq('data', n.data).ilike('nome', `%${n.nome.slice(0, 20)}%`)
  if (exists && exists.length) { console.log(`· ${n.nome}: já existe — pulado`); continue }
  console.log(`＋ CRIAR fechamento: ${n.nome} · receita ${brl(n.receita)} · desp.var ${brl(n.despesas)}`)
  if (!DRY_RUN) {
    const { data: created, error } = await sb.from('bula_leilao_fechamento').insert({
      nome: n.nome, data: n.data, local: n.local,
      vgv_total: 0, lotes_ofertados: 0, lotes_vendidos: 0, animais_vendidos: 0,
      receita_bula: n.receita, comissao_assessoria: n.comissao,
      sobra_bruta: n.receita - n.comissao, despesas_variaveis: n.despesas,
      observacoes: `${MARK} ${n.obs}`,
    }).select('id').single()
    if (error) { console.error('   ERRO:', error.message); process.exit(1) }
    // vincula o CR correspondente ao fechamento recém-criado
    const { error: e2 } = await sb.from('erp_contas_receber').update({ fechamento_id: created.id }).eq('numero_documento', n.crDoc)
    if (e2) console.error('   aviso: não vinculou CR', n.crDoc, e2.message)
    else console.log(`   CR ${n.crDoc} vinculado ao novo fechamento`)
  }
}

// 3) Vínculos de CRs órfãos
for (const v of VINCULOS_CR) {
  const f = byPrefix(v.fech)
  if (!f) { console.log(`✗ vínculo ${v.doc}: fechamento ${v.fech} não achado`); continue }
  const { data: cr } = await sb.from('erp_contas_receber').select('id,fechamento_id,descricao').eq('numero_documento', v.doc).maybeSingle()
  if (!cr) { console.log(`✗ CR ${v.doc} não encontrado`); continue }
  if (cr.fechamento_id) { console.log(`· CR ${v.doc}: já vinculado — pulado`); continue }
  console.log(`⛓ CR ${v.doc} → ${f.nome.slice(0, 40)}`)
  if (!DRY_RUN) {
    const { error } = await sb.from('erp_contas_receber').update({ fechamento_id: f.id }).eq('id', cr.id)
    if (error) console.error('   ERRO:', error.message)
  }
}

console.log('\nConcluído.' + (DRY_RUN ? ' (nada gravado — rode sem DRY_RUN para aplicar)' : ''))
