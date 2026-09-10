/**
 * Conciliacao do pagamento do Mafra e do reembolso do Jacamim, ambos de
 * 10/09/2026 depois das 16h — o extrato das 16:00 nao os tinha.
 *
 * Fonte: "sicoob_2026_09_10_17_20_26.pdf" (saldo em conta 204.555,45 C).
 * ⚠ Este PDF NAO passa em scripts/sicoob-pdf-para-csv.mjs: nele o D/C cai
 * sozinho no cabecalho ("CRED.TRANSF.CONTAS ... C") e a coluna de valores fica
 * interleavada de um jeito que o parser nao reconstroi. Como o extrato das
 * 16:00 ja tinha sido importado e validado dia a dia, so o DELTA foi importado,
 * e ele fecha por aritmetica: 120.743,53 + 85.620,00 - 1.808,08 = 204.555,45,
 * exatamente o saldo que o extrato das 17:20 imprime.
 *
 * [1] +85.620,00  MAFRA. PIX de CARLOS ALBERTO M TERRA (***.818.678-**) —
 *     PESSOA FISICA, nao o CNPJ da leiloeira. Quita os dois titulos de agosto,
 *     mas o ERP tinha 88.202,00 lancados:
 *       femeas 01/08  70.345,00  = 1,25% x 5.627.600  -> recebido integral
 *       touros 02/08  17.857,00  = 0,35% x 5.102.000  -> recebido 15.275,00
 *     A tabela de acordo do Mafra (planilha do Drive, aba "Acordos com Marcas")
 *     para 3%-8% de cobertura — e a cobertura dos touros foi 3,49% — e de
 *     **0,3% do VGV**, nao 0,35%. A 0,3% o titulo valeria 15.306,00. O proprio
 *     titulo ja carregava a ressalva "confirmar o percentual com o chefe" desde
 *     17/08; o pagamento da leiloeira confirma a faixa de 0,3%.
 *     ⚠ Sobram 31,00 sem explicacao (15.306,00 esperado x 15.275,00 pago).
 *     Lancado como desconto, com a divergencia declarada — nao inventei origem.
 *
 * [2] -1.808,08  Reembolso ao Peralta (***.814.661-**), "Ref reembolso Jacamin
 *     alimentacao e combustivel". Segundo reembolso do Jacamim para ele no mes
 *     (o primeiro, de 3.035,00 da NFS 752, saiu em 09/09). CP criado a
 *     posteriori, mesmo padrao dos outros.
 *
 * Reexecutavel. Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const TAG = '[MAFRA 10/09]'
const FONTE = 'Fonte: extrato Sicoob sicoob_2026_09_10_17_20_26.pdf (saldo 204.555,45)'
const CONTA_SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const CAT_COMISSAO_LEIL = 'e74434bd-3366-4015-9268-15d6640cf15f'
const CAT_REEMBOLSO = '6e79fd9e-f837-4ff4-a73d-3d8bdabe7ce7'
const P_PERALTA = 'd742ed5b-0ab2-4934-b10e-9099106fa994'
const CR_FEMEAS = '0a42597a', CR_TOUROS = 'a5271107'
const SALDO_EXTRATO = 204555.45

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const say = (s: string) => console.log(s)

let crs: any[] = []
for (let p = 0; ; p++) { const { data } = await sb.from('erp_contas_receber').select('*').range(p * 1000, p * 1000 + 999); if (!data?.length) break; crs = crs.concat(data); if (data.length < 1000) break }
const cr = (pref: string) => { const t = crs.find(r => r.id.startsWith(pref)); if (!t) throw new Error('CR ' + pref); return t }

async function movimento(data: string, valor: number, trecho: string) {
  const { data: rows } = await sb.from('erp_movimentos_bancarios')
    .select('id,data,tipo,valor,descricao,observacoes')
    .eq('conta_bancaria_id', CONTA_SICOOB).eq('data', data).eq('valor', valor).ilike('descricao', '%' + trecho + '%')
  if (!rows || rows.length !== 1) throw new Error('movimento ambiguo/ausente: ' + data + ' ' + brl(valor) + ' -> ' + (rows?.length ?? 0))
  return rows[0]
}
async function classifica(mov: any, campos: Record<string, any>, nota: string) {
  const obs = String(mov.observacoes || '')
  say('  mov ' + mov.data + ' ' + brl(mov.valor).padStart(12) + '  ' + String(mov.descricao).slice(0, 56))
  if (APPLY) {
    const { error } = await sb.from('erp_movimentos_bancarios').update({
      ...campos, status_conciliacao: 'conciliado', conciliado: true,
      observacoes: obs.includes(TAG) ? obs : (obs ? obs + ' ' : '') + TAG + ' ' + nota,
    }).eq('id', mov.id)
    if (error) throw error
  }
}
async function baixaCR(pref: string, receb: number, desconto: number, nota: string) {
  const t = cr(pref)
  if (String(t.observacoes || '').includes(TAG)) { say('  CR  ' + String(t.descricao).slice(0, 52).padEnd(52) + ' (baixa ja dada)'); return t.id }
  const total = Number(t.valor_recebido || 0) + receb
  const status = total + 0.005 >= Number(t.valor) - desconto ? 'recebido' : 'parcial'
  say('  CR  ' + String(t.descricao).slice(0, 52).padEnd(52) + brl(t.valor).padStart(11) + (desconto ? ' -desc ' + brl(desconto) : '') + ' -> ' + brl(total).padStart(11) + ' [' + status + ']')
  if (APPLY) {
    const { error } = await sb.from('erp_contas_receber').update({
      status, valor_recebido: total, desconto, data_recebimento: '2026-09-10',
      forma_recebimento: 'pix', conta_bancaria_id: CONTA_SICOOB,
      observacoes: (t.observacoes ? t.observacoes + ' ' : '') + TAG + ' ' + nota,
    }).eq('id', t.id)
    if (error) throw error
  }
  return t.id
}

// ---------------------------------------------------------------------------
say('\n=== [1] MAFRA +85.620,00 ===')
{
  const mov = await movimento('2026-09-10', 85620.00, 'CARLOS ALBERTO M TERRA')
  const base = 'Pagamento do Mafra recebido em 10/09 por PIX de CARLOS ALBERTO M TERRA (***.818.678-**), pessoa fisica — '
    + 'nao veio do CNPJ da leiloeira. Quita as duas etapas de Redencao/PA de agosto. ' + FONTE + '.'
  const idF = await baixaCR(CR_FEMEAS, 70345.00, 0,
    base + ' Femeas 01/08: 1,25% x R$ 5.627.600 (cobertura 18,53%, faixa 15,01-20%) = 70.345,00, recebido integral.')
  const idT = await baixaCR(CR_TOUROS, 15275.00, 2582.00,
    base + ' Touros 02/08: o titulo estava a 0,35% (17.857,00) com a ressalva "confirmar o percentual" desde 17/08. '
    + 'A tabela do Mafra para 3%-8% de cobertura (a real foi 3,49%) e 0,3% do VGV = 15.306,00, e o pagamento confirma a faixa. '
    + 'Recebido 15.275,00 — ⚠ 31,00 A MENOS que os 15.306,00 da tabela, sem explicacao; diferenca minima, cobrar so se houver outro acerto.')
  await classifica(mov, { categoria_id: CAT_COMISSAO_LEIL, cliente_id: undefined, conta_receber_id: idF },
    base + ' Cobre os DOIS titulos (70.345,00 + 15.275,00); aponta para o das femeas, o maior.')
  say('  (rateio nao aplicado: nenhum CP condicionado depende destes dois titulos)')
}

// ---------------------------------------------------------------------------
say('\n=== [2] REEMBOLSO JACAMIM -1.808,08 ===')
{
  const mov = await movimento('2026-09-10', 1808.08, 'alimentacao e comb')
  const DOC = 'reemb-2026-09-10:peralta-jacamim-alimentacao'
  const { data: ja } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', DOC).maybeSingle()
  let cpId = ja?.id ?? null
  if (!cpId) {
    say('  CP+ Reembolso Peralta - Jacamim - alimentacao e combustivel  ' + brl(1808.08))
    if (APPLY) {
      const { data, error } = await sb.from('erp_contas_pagar').insert({
        descricao: 'Reembolso Peralta - leilao Jacamim - alimentacao e combustivel',
        valor: 1808.08, vencimento: '2026-09-10', emissao: '2026-09-10', status: 'aberto',
        categoria_id: CAT_REEMBOLSO, fornecedor_id: P_PERALTA, conta_bancaria_id: CONTA_SICOOB,
        numero_documento: DOC, origem: 'real', tags: ['a-pagar', 'reembolso', '2026', 'setembro', 'leilao'],
        apuracao: { natureza: 'obrigacao', valor_situacao: 'confirmado', pagamento_situacao: 'informado', fontes: [{ tipo: 'documento_original', data: '2026-09-10', ref: 'F:/sicoob_2026_09_10_17_20_26.pdf', trecho: 'PIX EMIT.OUTRA IF - ***.814.661-** - Ref reembolso Jacamin alimentacao e combustivel - 1.808,08 D em 10/09/2026.' }], pendencias: [] },
        observacoes: 'Lancado a posteriori a partir do extrato. Segundo reembolso do Jacamim ao Peralta no mes (o primeiro, 3.035,00 da NFS 752, saiu em 09/09). ' + FONTE + '.',
      }).select('id').single()
      if (error) throw error
      cpId = data!.id
    }
  } else say('  CP  Reembolso Peralta - Jacamim - alimentacao (ja existia)')
  if (APPLY && cpId) {
    const { data: t } = await sb.from('erp_contas_pagar').select('*').eq('id', cpId).single()
    if (t!.status !== 'pago') {
      const { error } = await sb.from('erp_contas_pagar').update({ status: 'pago', valor_pago: 1808.08, data_pagamento: '2026-09-10', forma_pagamento: 'pix' }).eq('id', cpId)
      if (error) throw error
      say('  CP  baixado (pago 10/09)')
    }
  }
  await classifica(mov, { categoria_id: CAT_REEMBOLSO, pessoa_id: P_PERALTA, ...(cpId ? { conta_pagar_id: cpId } : {}) },
    'Reembolso de alimentacao e combustivel do leilao Jacamim ao Peralta. ' + FONTE + '.')
}

// ---------------------------------------------------------------------------
say('\n=== VERIFICACAO ===')
const { data: c } = await sb.from('erp_contas_bancarias').select('id,nome,saldo_atual')
let tot = 0
for (const x of c || []) { tot += Number(x.saldo_atual || 0); say('  ' + String(x.nome).padEnd(46) + brl(x.saldo_atual).padStart(14)) }
say('  ' + 'CAIXA TOTAL'.padEnd(46) + brl(tot).padStart(14))
const sic = (c || []).find(x => x.id === CONTA_SICOOB)
say('  Sicoob x extrato 17:20: ' + brl(sic?.saldo_atual) + ' x ' + brl(SALDO_EXTRATO) + ' -> dif ' + brl(Number(sic?.saldo_atual || 0) - SALDO_EXTRATO))
const { data: pend } = await sb.from('erp_movimentos_bancarios').select('id,data,valor,descricao').neq('status_conciliacao', 'conciliado')
say('  Movimentos fora de conciliado: ' + (pend?.length ?? 0))
for (const m of pend || []) say('    ' + m.data + ' ' + brl(m.valor).padStart(12) + ' ' + String(m.descricao).slice(0, 60))
if (!APPLY) say('\nDRY-RUN. Use --apply para gravar.')
