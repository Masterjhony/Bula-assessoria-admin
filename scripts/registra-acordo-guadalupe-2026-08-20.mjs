/**
 * 20o Leilao Guadalupe Agropecuaria (18-20/07/2026) - acordo e condicao de pagamento
 * confirmados no WhatsApp com a Guadalupe (print do Joao, 20/08/2026).
 *
 * A leiloeira mandou o fechamento da comissao:
 *    5%   sobre venda no sabado   (18/07 - femeas, cobertura Bula)
 *    0,5% sobre faturamento de domingo (19/07)
 *    5%   sobre venda na segunda  (20/07 - touros, cobertura Bula)
 *    total a receber R$ 21.425,90
 * Joao propos 2x com a 1a parcela ate 25/08 e a Guadalupe aceitou ("pode ser desse jeito sim!").
 *
 * Conferencia (bate exato, por isso o acordo pode ser gravado com seguranca):
 *    sabado  : 5,0% x  60.000,00 (cobertura femeas 1d6e69a3) =  3.000,00
 *    domingo : 0,5% x 3.043.180,00 (faturamento do domingo)  = 15.215,90
 *    segunda : 5,0% x  64.200,00 (cobertura touros 8ce45792) =  3.210,00
 *                                                    TOTAL  = 21.425,90
 *    (o faturamento dos 2 pregoes de touros era 3.952.180,00; 3.952.180 - 3.043.180 = 909.000 = segunda)
 *
 * O ERP tinha 32.641,35 (o touros de domingo estava a 0,75% sobre o faturamento
 * dos DOIS pregoes, faixa "acima de 20 touros" da tabela escalonada que nunca foi confirmada,
 * e o pregao de segunda estava com receita_bula = 0). Diferenca: -11.215,45.
 *
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const TAG = '[ACORDO GUADALUPE 20/08]'
const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const CLIENTE = 'cdfed41f-ff46-4519-8dff-10d8d8fccaa5' // PROGRAMA LEILOES
const CAT_REC = 'e74434bd-3366-4015-9268-15d6640cf15f' // receita Comissao Leilao
const F_FEMEAS = '1d6e69a3-ff25-404e-9c0a-dc7384620de1' // 18/07 sabado
const F_DOMINGO = 'c8cba93d-8fa9-4e80-9aa7-e2706a2d54b4' // 19/07 domingo
const F_SEGUNDA = '8ce45792-c83f-4a8f-ae13-78bcf055aeeb' // 20/07 segunda
const fmt = n => Number(n).toFixed(2).padStart(11)
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }
const r2 = n => Math.round(n * 100) / 100

const NOTA_ACORDO = 'Acordo confirmado pela Guadalupe no WhatsApp em 20/08/2026: 5% sobre a venda de sabado (18/07), '
  + '0,5% sobre o faturamento de domingo (19/07) e 5% sobre a venda de segunda (20/07). '
  + 'Total da comissao = R$ 21.425,90, a receber em 2 parcelas de R$ 10.712,95 (1a ate 25/08, aceite da leiloeira).'

/* ---------- 1) fechamentos: receita_bula e acordo ---------- */
const FEC = [
  { id: F_FEMEAS, nome: 'Guadalupe Femeas 18/07 (sabado)', receita: 3000.00, comissao: 1200.00,
    set: { acordo_pct_venda_cobertura: 0.05, acordo_pct_faturamento: null,
      acordo_descricao: '5% sobre a venda da cobertura Bula no sabado (18/07) - confirmado pela leiloeira em 20/08/2026' } },
  { id: F_DOMINGO, nome: 'Guadalupe Touros 19/07 (domingo)', receita: 15215.90, comissao: 4698.00,
    set: { acordo_pct_faturamento: 0.005, acordo_pct_venda_cobertura: null, faturamento_total_leilao: 3043180.00,
      acordo_descricao: '0,5% sobre o faturamento do pregao de domingo (19/07) = R$ 3.043.180,00 - confirmado pela leiloeira em 20/08/2026' } },
  { id: F_SEGUNDA, nome: 'Guadalupe Touros 20/07 (segunda)', receita: 3210.00, comissao: 1284.00,
    set: { acordo_pct_venda_cobertura: 0.05, acordo_pct_faturamento: null,
      acordo_descricao: '5% sobre a venda da cobertura Bula na segunda (20/07) - confirmado pela leiloeira em 20/08/2026' } },
]
let somaFec = 0
for (const f of FEC) {
  const { data: cur } = await sb.from('bula_leilao_fechamento')
    .select('receita_bula,sobra_bruta,comissao_assessoria,observacoes').eq('id', f.id).single()
  const sobra = r2(f.receita * 0.82 - f.comissao)
  somaFec += f.receita
  console.log('FEC ' + f.nome.padEnd(34) + ' receita ' + fmt(cur.receita_bula) + ' -> ' + fmt(f.receita)
    + ' | sobra ' + fmt(cur.sobra_bruta) + ' -> ' + fmt(sobra))
  if (APPLY) {
    const { error } = await sb.from('bula_leilao_fechamento').update(Object.assign({}, f.set, {
      receita_bula: f.receita, sobra_bruta: sobra,
      observacoes: ((cur.observacoes || '') + '\n' + TAG + ' ' + NOTA_ACORDO).trim(),
    })).eq('id', f.id)
    fail(error, 'fechamento ' + f.nome)
  }
}
console.log('  soma receita_bula Guadalupe: ' + fmt(somaFec) + '  (WhatsApp: 21.425,90)')
console.log('')

/* ---------- 2) contas a receber: 2 parcelas de 10.712,95 ---------- */
const CR_FEMEAS = 'BULA-2026-CR-GUADALUPE-FEMEAS-20260718'
const CR_TOUROS = 'BULA-2026-CR-GUADALUPE-TOUROS-20260719'

// P1 = 25/08: femeas 3.000,00 + parte do domingo 7.712,95 = 10.712,95
// P2 = 25/09: resto do domingo 7.502,95 + segunda 3.210,00 = 10.712,95
const upd = [
  { doc: CR_FEMEAS, valor: 3000.00, venc: '2026-08-25', parcela: 1,
    descricao: '20o LEILAO GUADALUPE AGROPECUARIA - FEMEAS 18/07 (5% cobertura) - COMISSAO BULA - parc. 1/2',
    nota: 'Vencimento movido de 01/09 para 25/08: compoe a 1a parcela acordada (3.000,00 + 7.712,95 do pregao de domingo = 10.712,95).' },
  { doc: CR_TOUROS, valor: 7712.95, venc: '2026-08-25', parcela: 1,
    descricao: '20o LEILAO GUADALUPE AGROPECUARIA - TOUROS 19/07 domingo (0,5% faturamento) - COMISSAO BULA - parc. 1/2',
    nota: 'Valor do pregao de domingo corrigido de 29.641,35 (0,75% sobre o faturamento dos DOIS pregoes) para 15.215,90 '
      + '(0,5% sobre o faturamento do domingo, R$ 3.043.180,00), conforme o acordo confirmado pela leiloeira. '
      + 'Deste total, 7.712,95 entram na 1a parcela (25/08) e 7.502,95 na 2a (25/09).' },
]
for (const u of upd) {
  const { data: cr } = await sb.from('erp_contas_receber')
    .select('id,descricao,valor,vencimento,status,observacoes').eq('numero_documento', u.doc).single()
  if (!cr) { console.log('CR  ! nao encontrada: ' + u.doc); erros++; continue }
  if (cr.status === 'recebido') { console.log('CR  = ja recebida, nao mexo: ' + u.doc); continue }
  console.log('CR  ~ ' + fmt(cr.valor) + ' -> ' + fmt(u.valor) + '  venc ' + cr.vencimento + ' -> ' + u.venc + '  ' + u.doc)
  if (APPLY) {
    const { error } = await sb.from('erp_contas_receber').update({
      valor: u.valor, vencimento: u.venc, descricao: u.descricao,
      parcela: u.parcela, total_parcelas: 2,
      observacoes: ((cr.observacoes || '') + ' ' + TAG + ' ' + NOTA_ACORDO + ' ' + u.nota).trim(),
    }).eq('id', cr.id)
    fail(error, 'CR ' + u.doc)
  }
}

const novasCR = [
  { doc: CR_TOUROS + '-P2', valor: 7502.95, venc: '2026-09-25', emissao: '2026-07-19', fech: F_DOMINGO,
    descricao: '20o LEILAO GUADALUPE AGROPECUARIA - TOUROS 19/07 domingo (0,5% faturamento) - COMISSAO BULA - parc. 2/2',
    parcela: 2,
    nota: 'Saldo do pregao de domingo (15.215,90 - 7.712,95) na 2a parcela do acordo.' },
  { doc: 'BULA-2026-CR-GUADALUPE-TOUROS-20260720', valor: 3210.00, venc: '2026-09-25', emissao: '2026-07-20', fech: F_SEGUNDA,
    descricao: '20o LEILAO GUADALUPE AGROPECUARIA - TOUROS 20/07 segunda (5% cobertura) - COMISSAO BULA - parc. 2/2',
    parcela: 2,
    nota: 'Pregao de segunda-feira (fechamento 8ce45792, cobertura Bula R$ 64.200,00) nao tinha conta a receber no ERP - '
      + 'a receita_bula estava zerada porque o acordo dos touros nunca havia sido confirmado. Entra na 2a parcela.' },
]
for (const n of novasCR) {
  const { data: ja } = await sb.from('erp_contas_receber').select('id').eq('numero_documento', n.doc).limit(1)
  if (ja && ja.length) { console.log('CR  = ja existe  ' + n.doc); continue }
  console.log('CR  + ' + fmt(n.valor) + '  venc ' + n.venc + '  ' + n.descricao.slice(0, 60))
  if (APPLY) {
    const { error } = await sb.from('erp_contas_receber').insert({
      descricao: n.descricao, valor: n.valor, emissao: n.emissao, vencimento: n.venc, status: 'aberto',
      cliente_id: CLIENTE, categoria_id: CAT_REC, numero_documento: n.doc,
      parcela: n.parcela, total_parcelas: 2, fechamento_id: n.fech, origem: 'real',
      tags: ['a-receber', '2026', 'julho', 'leilao'],
      observacoes: TAG + ' ' + NOTA_ACORDO + ' ' + n.nota,
    })
    fail(error, 'CR nova ' + n.doc)
  }
}
console.log('')

/* ---------- 3) conferencia ---------- */
const { data: todas } = await sb.from('erp_contas_receber')
  .select('descricao,valor,vencimento,status').ilike('descricao', '%20o LEILAO GUADALUPE%').order('vencimento')
let t = 0
const porVenc = {}
for (const c of todas || []) {
  if (c.status === 'cancelado') continue
  t += Number(c.valor); porVenc[c.vencimento] = (porVenc[c.vencimento] || 0) + Number(c.valor)
  console.log('  ' + c.vencimento + fmt(c.valor) + '  ' + c.status.padEnd(9) + c.descricao.slice(0, 74))
}
console.log('')
for (const [v, s] of Object.entries(porVenc).sort()) console.log('  PARCELA ' + v + fmt(s) + (Math.abs(s - 10712.95) < 0.005 ? '  OK' : '  !! esperado 10.712,95'))
console.log('  TOTAL ' + fmt(t) + (Math.abs(t - 21425.90) < 0.005 ? '  OK bate com o WhatsApp' : '  !! esperado 21.425,90'))
console.log(APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.')
