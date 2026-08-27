/**
 * Retifica a receita do LEILAO NELORE SORRISO - ETAPA FEMEAS (12/07/2026).
 *
 * O ERP tinha R$ 7.950,00, que era ESTIMATIVA de 17/08: 5% sobre a cobertura de
 * R$ 159.000 (3 lotes — 02 R$ 15.000, 19 R$ 80.000, 13 R$ 64.000, todos do
 * comprador Mauro Cesar / Fazenda Mudanca / PA).
 *
 * O valor real e R$ 7.149,98, confirmado por DUAS fontes independentes em
 * 27/08/2026:
 *   1. Relatorio de Nota Fiscal da Prefeitura de Campo Grande — NF 635, emitida
 *      25/08/2026 15:46, valor do servico R$ 7.149,98.
 *   2. Portal da e-Rural (print do Joao): "LEILAO NELORE SORRISO - ETAPA FEMEAS
 *      · 3 itens consolidados · Venda 12/07/2026 · Vencimento 30/07/2026 ·
 *      R$ 7.149,98 · Aguardando pagamento". Os "3 itens" sao exatamente os 3
 *      lotes do fechamento.
 *
 * A NF e o que a Bula cobrou; a estimativa era so uma conta de percentual. Vence
 * a NF — mesma regra aplicada a Genetica Aditiva em 27/08.
 *
 * ⚠ A diferenca de R$ 800,02 NAO se explica pela formula do acordo. A taxa
 * implicita da NF e 4,4968% da cobertura. A unica decomposicao limpa e o lote 19
 * (R$ 80.000) ter saido a 4% em vez de 5% (4.000,00 -> 3.199,98), com os outros
 * dois a 5%. E hipotese, nao fato: CONFERIR COM A E-RURAL (Vivian) se ha
 * desconto de plataforma ou taxa diferente por lote. Enquanto nao se confirma, o
 * ERP fica com o valor faturado e a duvida registrada — nao com um percentual
 * inventado. Por isso `acordo_pct_venda_cobertura` continua em branco.
 *
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const CR = '54128961-a2d5-4a8e-9a4d-8f70b8a4c8f6'
const FE = '3df75f54-c2dc-4ba6-8c1d-cf9d1fb098dd'
const ANTES = 7950.00
const NF = 7149.98
const TAG = '[NF 635 · 27/08/2026]'
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }
const anexa = (antes, nota) => String(antes || '').includes(TAG) ? String(antes || '') : (String(antes || '') + '\n' + nota).trim()

const NOTA = TAG + ' Valor retificado de ' + brl(ANTES) + ' para ' + brl(NF) + '. Os ' + brl(ANTES) + ' eram estimativa de 17/08 (5% x cobertura de 159.000). O valor faturado e ' + brl(NF) + ', confirmado pela NF 635 no Relatorio de Nota Fiscal da Prefeitura de Campo Grande (emissao 25/08/2026 15:46) e pelo portal da e-Rural ("3 itens consolidados", vencimento 30/07/2026, aguardando pagamento). Diferenca de 800,02 SEM explicacao pela formula do acordo — taxa implicita 4,4968%; a unica decomposicao limpa e o lote 19 a 4% em vez de 5%. CONFERIR COM A E-RURAL antes de tratar como regra.'

// Acha os registros sem depender de UUID decorado.
const { data: crs } = await sb.from('erp_contas_receber').select('id,descricao,valor,valor_recebido,status,vencimento,nota_fiscal,observacoes,tags,fechamento_id').ilike('descricao', '%SORRISO%ETAPA FEMEAS%')
const cr = (crs || [])[0]
if (!cr) { console.error('CR do Sorriso Femeas nao encontrado'); process.exit(1) }
if (crs.length > 1) { console.error('mais de um CR bate com o filtro: ' + crs.map(c => c.id.slice(0, 8)).join(', ')); process.exit(1) }
if (Math.abs(Number(cr.valor) - ANTES) > 0.005 && Math.abs(Number(cr.valor) - NF) > 0.005) {
  console.error('CR vale ' + brl(cr.valor) + ', esperado ' + brl(ANTES) + ' (ou ' + brl(NF) + ' se ja retificado)'); process.exit(1)
}
if (Number(cr.valor_recebido || 0) > 0) { console.error('CR ja tem recebimento parcial — parar e revisar a mao'); process.exit(1) }

console.log('CR   ' + cr.id.slice(0, 8) + '  ' + brl(cr.valor) + ' -> ' + brl(NF) + '   (' + cr.status + ', vence ' + cr.vencimento + ')')
console.log('     ' + cr.descricao)
if (APPLY) fail((await sb.from('erp_contas_receber').update({
  valor: NF, nota_fiscal: '635',
  observacoes: anexa(cr.observacoes, NOTA),
  tags: [...new Set([...(cr.tags || []), 'nf-635', 'valor-retificado'])],
}).eq('id', cr.id)).error, 'retifica CR')

const { data: fe } = await sb.from('bula_leilao_fechamento').select('id,nome,vgv_total,receita_bula,acordo_pct_venda_cobertura,acordo_descricao,observacoes').eq('id', cr.fechamento_id || FE).maybeSingle()
if (!fe) { console.error('fechamento nao encontrado'); process.exit(1) }
if (Math.abs(Number(fe.vgv_total) - 159000) > 0.005) { console.error('VGV do fechamento e ' + brl(fe.vgv_total) + ', esperado 159.000,00'); process.exit(1) }
console.log('FECH ' + fe.id.slice(0, 8) + '  receita_bula ' + brl(fe.receita_bula) + ' -> ' + brl(NF) + '   (VGV ' + brl(fe.vgv_total) + ', taxa implicita ' + (NF / Number(fe.vgv_total) * 100).toFixed(4) + '%)')
if (APPLY) fail((await sb.from('bula_leilao_fechamento').update({
  receita_bula: NF,
  acordo_descricao: 'Faturado por NF 635 (25/08/2026) em R$ 7.149,98 — 4,4968% da cobertura de R$ 159.000. NAO e os 5% que a estimativa de 17/08 assumiu; a diferenca de 800,02 esta por esclarecer com a e-Rural.',
  observacoes: anexa(fe.observacoes, NOTA),
}).eq('id', fe.id)).error, 'retifica fechamento')

console.log('\n' + (APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.'))
