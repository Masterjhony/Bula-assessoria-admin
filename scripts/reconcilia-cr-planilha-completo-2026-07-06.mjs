// Reconciliação completa CRs/impostos abril+ com a planilha mestra FINANCEIRO BULA 2026,
// usando o banco como árbitro onde há lastro. (06/07/2026)
//
//  - Terra Brava abr: banco confirma 3.990 (Pix 25/05) -> corrige ERP 6.930 -> 3.990.
//  - MRA abr, Matrizes Santa Fé, Matinha Matrizes: "recebido" no ERP SEM lastro no banco;
//    alinha ao valor da planilha (fonte-mestra) mantendo recebido c/ data do "PAGO" da planilha.
//  - Márcio de Rezende MRA: planilha = COBRADO (não recebido) -> volta p/ aberto.
//  - Nelore Pintado Raiz: planilha "A RECEBER 10/07" -> aberto, venc 10/07.
//  - Cachoeirão abr/14: planilha NÃO COBRAR -> CR cancelado + apaga o imposto provisionado.
//  - Impostos alinhados a 18% da receita correta (valores da própria planilha).
//  - KRIZ (jun/16): faltava CR -> cria 16.122 (aberto, venc 15/07) + preenche receita_bula do fechamento.
//
// Idempotente. Uso: DRY_RUN=1 node scripts/reconcilia-cr-planilha-completo-2026-07-06.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const now = () => new Date().toISOString()
const log = (s) => console.log(s)

log(DRY_RUN ? '*** DRY RUN ***\n' : '*** GRAVANDO EM PRODUÇÃO ***\n')

// ───────────── 1) CRs: valor/status ─────────────
const CR_UPDATES = [
  { doc: 'BULA-2026-CR-043', nome: 'Terra Brava (abr/19)', set: { valor: 3990, valor_recebido: 3990, status: 'recebido', data_recebimento: '2026-05-25' }, obs: 'Corrigido 6.930->3.990: banco confirma Pix 3.990 em 25/05 (Eduardo Pinheiro). Alinhado à planilha mestra.' },
  { doc: 'BULA-2026-CR-045', nome: 'MRA (abr/22)', set: { valor: 11795, valor_recebido: 11795, status: 'recebido', data_recebimento: '2026-06-15' }, obs: 'Alinhado à planilha (1% do faturamento). ERP tinha 14.340 sem lastro no banco.' },
  { doc: 'BULA-2026-CR-056', nome: 'Matrizes Santa Fé', set: { valor: 9200, valor_recebido: 9200, status: 'recebido', data_recebimento: '2026-06-19' }, obs: 'Alinhado à planilha. ERP tinha 20.610 sem lastro no banco.' },
  { doc: 'BULA-2026-CR-059', nome: 'Matinha Matrizes', set: { valor: 8850, valor_recebido: 8850, status: 'recebido', data_recebimento: '2026-06-11' }, obs: 'Alinhado à planilha. ERP tinha 20.930,70 sem lastro no banco (planilha prevê ainda nf600 6.313 p/ 15/07 à parte).' },
  { doc: 'BULA-2026-CR-EXTRA-NELORE-MARCIO-DE', nome: 'Márcio de Rezende MRA', set: { status: 'aberto', valor_recebido: 0, data_recebimento: null }, obs: 'Planilha = COBRADO (ainda não recebido, previsão 09/07). ERP estava recebido sem lastro; voltou p/ aberto.' },
  { doc: 'BULA-2026-CR-055', nome: 'Nelore Pintado Raiz', set: { status: 'aberto', vencimento: '2026-07-10' }, obs: 'Planilha "A RECEBER 10/07" — status aberto, vencimento 10/07.' },
  { doc: 'BULA-2026-CR-042', nome: 'Cachoeirão (abr/14) NÃO COBRAR', set: { status: 'cancelado', valor_recebido: 0 }, obs: 'Planilha = NÃO COBRAR (decisão Bula 18/05). CR cancelada; imposto provisionado removido.' },
]
for (const u of CR_UPDATES) {
  const { data: cr } = await sb.from('erp_contas_receber').select('id,valor,status,valor_recebido').eq('numero_documento', u.doc).maybeSingle()
  if (!cr) { log(`[!] CR não encontrada: ${u.doc}`); continue }
  const antes = `${brl(cr.valor)}/${cr.status}`
  const depois = `${brl(u.set.valor ?? cr.valor)}/${u.set.status ?? cr.status}`
  log(`CR ${u.nome.padEnd(28)} ${antes} -> ${depois}`)
  if (!DRY_RUN) {
    const { error } = await sb.from('erp_contas_receber').update({ ...u.set, observacoes: u.obs, updated_at: now() }).eq('id', cr.id)
    if (error) throw new Error(`${u.doc}: ${error.message}`)
  }
}

// ───────────── 2) Impostos = 18% da receita correta ─────────────
const { data: cats } = await sb.from('erp_categorias').select('id,nome')
const CAT_IMP = cats.find((c) => c.nome.includes('Imposto sobre Receita')).id
const IMP_UPDATES = [
  { match: 'LEILÃO MRA', para: 2123.10 },
  { match: 'MATRIZES SANTA FÉ', para: 1656.00 },
  { match: 'MATINHA MATRIZES', para: 1593.00 },
  { match: 'SANTA NAZARE EXCELENCIA', para: 2057.04 },
  { match: 'TERRA BRAVA', para: 718.20 }, // Terra Brava abr (leilão 19/04)
]
log('')
for (const u of IMP_UPDATES) {
  const { data: cp } = await sb.from('erp_contas_pagar').select('id,descricao,valor').eq('categoria_id', CAT_IMP).ilike('descricao', `%${u.match}%`)
  const only = (cp || []).filter((c) => !/EXPOZEBU|MATINHA - |TOUROS TERRA/i.test(c.descricao)) // evita casar Expozebu/variantes
  if (only.length !== 1) { log(`[!] imposto "${u.match}": ${only.length} candidatos (${(only).map((c) => c.descricao).join(' | ')}) — PULANDO`); continue }
  const c = only[0]
  log(`Imposto ${c.descricao.slice(0, 40).padEnd(40)} ${brl(c.valor)} -> ${brl(u.para)}`)
  if (!DRY_RUN) await sb.from('erp_contas_pagar').update({ valor: u.para, observacoes: 'Ajustado a 18% da receita correta (planilha mestra, 06/07).', updated_at: now() }).eq('id', c.id)
}

// Cachoeirão: apaga imposto provisionado (não cobrar -> sem receita -> sem imposto)
{
  const { data: cp } = await sb.from('erp_contas_pagar').select('id,descricao,valor').eq('categoria_id', CAT_IMP).ilike('descricao', '%CACHOEIRAO%')
  for (const c of cp || []) {
    log(`Imposto REMOVER ${c.descricao.slice(0, 40)} ${brl(c.valor)} (Cachoeirão não cobrar)`)
    if (!DRY_RUN) await sb.from('erp_contas_pagar').delete().eq('id', c.id)
  }
}

// ───────────── 3) KRIZ: cria CR + preenche receita_bula do fechamento ─────────────
log('')
const KRIZ_DOC = 'BULA-2026-CR-KRIZ-20260616'
const KRIZ_FECH = 'ff55a57e-7aab-4105-a794-7125a41b7efe'
const { data: krizEx } = await sb.from('erp_contas_receber').select('id').eq('numero_documento', KRIZ_DOC).maybeSingle()
if (krizEx) log('[=] CR KRIZ já existe')
else {
  log(`CR KRIZ criar: 16.122,00 aberto venc 2026-07-15`)
  if (!DRY_RUN) {
    const { error } = await sb.from('erp_contas_receber').insert({
      descricao: 'LEILÃO NELORE KRIZ - REMATES', valor: 16122, status: 'aberto',
      emissao: '2026-06-16', vencimento: '2026-07-15', numero_documento: KRIZ_DOC, fechamento_id: KRIZ_FECH,
      observacoes: 'Criada 06/07 da planilha mestra (2% cobertura, A RECEBER 15/07). Faltava no ERP.',
    })
    if (error) throw new Error(`KRIZ CR: ${error.message}`)
    await sb.from('bula_leilao_fechamento').update({ receita_bula: 16122, updated_at: now() }).eq('id', KRIZ_FECH)
  }
}

log(DRY_RUN ? '\n[DRY_RUN] nada gravado.' : '\nConcluído.')
