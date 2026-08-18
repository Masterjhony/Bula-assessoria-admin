/**
 * LEILÃO 4R (09/05/2026) — liquidação do acordo relatado pelo Guilherme Galassi
 * no grupo "Financeiro Bula Assessoria" em 06/08/2026.
 *
 * Texto da mensagem (resumido): a Assessoria teria a receber 2% do faturamento
 * conforme NF emitida; após conversa com o Felipe houve acordo de abatimentos
 * entre as comissões em aberto na Remates e repasses de comissão ao Grupo MRA
 * (captações e apoio a leilões); fechadas as contas o saldo de R$ 15.076,75 foi
 * repassado à Remates por orientação do Felipe, porque na data Assessoria e
 * Remates eram representadas somente pelo Felipe e a Remates apoiou o leilão com
 * estrutura (hotel, carros, combustível, alimentação, marketing, escritório e
 * material gráfico). Ficou definido que a Remates repassa à Assessoria SOMENTE o
 * valor para cobertura do imposto da NF.
 *
 * A aritmética fecha exatamente com o que está no banco:
 *   faturamento do leilão .................... R$ 4.123.500,00
 *   NF a 2% = títulos emitidos ............... R$    82.230,00
 *      MRA (Marcio de Rezende) ............... R$    37.140,00
 *      Kito (Marcos de Rezende) 3x 15.030 .... R$    45.090,00
 *   recebido em banco (01/07 e 30/07) ........ R$    30.060,00  (Kito 1 e 2)
 *   a receber (Kito 3, venc. 30/08) .......... R$    15.030,00  "pagando boleto" (Ana, 05/08)
 *   título do MRA ............................ R$    37.140,00
 *      (-) saldo repassado à Remates ......... R$    15.076,75
 *      = abatimento de dívidas da Assessoria . R$    22.063,25
 *   imposto devolvido pela Remates 06/08 ..... R$     1.857,00  = 12,32% de 15.076,75
 *                                                              (já no extrato, PIX Bula Remates)
 *
 * Efeitos aplicados:
 *  1. o acordo do fechamento passa de 1% para 2% do faturamento (é o que a NF diz);
 *  2. o título do MRA é LIQUIDADO POR COMPENSAÇÃO — cancelado com o histórico,
 *     porque não há mais nada a cobrar em dinheiro (não pode virar "recebido":
 *     nenhum real entrou no banco e isso inflaria o caixa);
 *  3. a devolução de imposto de 06/08 sai de "Estornos e Devolucoes" para uma
 *     categoria de recuperação de imposto (dre_grupo=imposto), onde ABATE a linha
 *     de impostos da DRE em vez de virar receita financeira;
 *  4. a tag `revisar-acordo-4r` sai dos títulos — a pendência está resolvida.
 *
 * Dry-run por padrão; --apply grava.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const MEMORIA = [
  'ACORDO DO 4R — Guilherme Galassi no grupo Financeiro, 06/08/2026.',
  'A Assessoria tinha a receber 2% do faturamento (R$ 4.123.500,00) conforme NF emitida = R$ 82.230,00 em títulos.',
  'Após conversa com o Felipe houve abatimento entre as comissões em aberto na Remates e os repasses de comissão ao Grupo MRA (captações e apoio a leilões).',
  'Fechadas as contas sobrou R$ 15.076,75, repassado à REMATES por orientação do Felipe — na data Assessoria e Remates eram representadas somente por ele, e a Remates apoiou o leilão com estrutura (hotel, aluguel de carros, combustível, alimentação, marketing, apoio de escritório e material gráfico).',
  'Ficou definido que a Remates repassa à Assessoria SOMENTE o valor de cobertura do imposto da NF — recebido em 06/08/2026: R$ 1.857,00 (12,32% de R$ 15.076,75), PIX da Bula Remates, já conciliado no extrato.',
  'Aritmética: 37.140,00 (título do MRA) menos 15.076,75 (repassado à Remates) = 22.063,25 de dívidas abatidas. O Kito pagou 2 das 3 parcelas (R$ 15.030,00 em 01/07 e 30/07); a 3a vence 30/08 e continua a receber.',
].join(' ')

/* ── 1. acordo do fechamento: 1% -> 2% ──────────────────────────────────── */
console.log('=== 1. FECHAMENTO 4R — acordo passa a 2% do faturamento (NF) ===')
const { data: f } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,faturamento_total_leilao,receita_bula,acordo_pct_faturamento,acordo_descricao,observacoes')
  .ilike('nome', '%4R%').maybeSingle()
if (!f) { console.error('fechamento 4R nao encontrado'); process.exit(1) }
console.log(`  ${f.nome} · faturamento ${brl(f.faturamento_total_leilao)} · receita_bula ${brl(f.receita_bula)}`)
console.log(`  acordo: ${f.acordo_pct_faturamento} -> 0.02   (${f.acordo_descricao || 'sem descrição'})`)
if (APPLY) {
  await sb.from('bula_leilao_fechamento').update({
    acordo_pct_faturamento: 0.02,
    acordo_descricao: '2% sobre o faturamento total do leilão, conforme NF emitida (grupo Financeiro, 06/08/2026)',
    observacoes: [String(f.observacoes || '').trim(), `[18/08/2026] ${MEMORIA} Obs.: os títulos somam R$ 82.230,00, R$ 240,00 abaixo de 2% exatos sobre o faturamento cadastrado — diferença imaterial, o valor da NF é o autoritativo.`].filter(Boolean).join('\n'),
  }).eq('id', f.id)
}

/* ── 2. título do MRA: liquidado por compensação ────────────────────────── */
console.log('\n=== 2. TÍTULO DO MRA — liquidado por compensação (sai da cobrança) ===')
const { data: crs } = await sb.from('erp_contas_receber')
  .select('id,descricao,vencimento,valor,status,observacoes,tags').eq('fechamento_id', f.id).order('vencimento')
for (const c of crs || []) {
  const ehMra = /MRA|MARCIO DE REZENDE/i.test(c.descricao)
  const tags = (c.tags || []).filter(t => t !== 'revisar-acordo-4r')
  if (ehMra && c.status !== 'cancelado') {
    console.log(`  x ${String(c.vencimento).slice(0, 10)} ${brl(c.valor).padStart(12)} [${c.status}] ${c.descricao.slice(0, 50)}`)
    console.log('      -> cancelado: LIQUIDADO POR COMPENSAÇÃO (nada a cobrar em dinheiro)')
    if (APPLY) {
      await sb.from('erp_contas_receber').update({
        status: 'cancelado',
        observacoes: [String(c.observacoes || '').trim(),
          `[18/08/2026] LIQUIDADO POR COMPENSAÇÃO — não há mais o que cobrar. ${MEMORIA} Este título não é baixado como "recebido" porque nenhum valor entrou no caixa da Bula: R$ 22.063,25 quitaram dívidas da Assessoria e R$ 15.076,75 ficaram com a Remates. A contrapartida em dinheiro foi só o imposto (R$ 1.857,00 em 06/08).`,
        ].filter(Boolean).join('\n'),
        tags: [...new Set([...tags, 'liquidado-por-compensacao', 'acordo-4r-2026-08-06'])],
      }).eq('id', c.id)
    }
  } else if ((c.tags || []).includes('revisar-acordo-4r')) {
    console.log(`  ~ ${String(c.vencimento).slice(0, 10)} ${brl(c.valor).padStart(12)} [${c.status}] ${c.descricao.slice(0, 50)}  -> tira 'revisar-acordo-4r'`)
    if (APPLY) {
      const extra = c.status === 'aberto'
        ? `\n[18/08/2026] ÚNICO SALDO A RECEBER DO 4R. O acordo de 06/08 tratou apenas do título do MRA; esta parcela do Kito segue normal — a Ana confirmou em 05/08 que ele está "pagando boleto".`
        : ''
      await sb.from('erp_contas_receber').update({
        tags, observacoes: (String(c.observacoes || '').trim() + extra).trim() || null,
      }).eq('id', c.id)
    }
  }
}

/* ── 3. devolução do imposto: recuperação de imposto, não estorno ───────── */
console.log('\n=== 3. DEVOLUÇÃO DO IMPOSTO DA NF (06/08, R$ 1.857,00) ===')
let catId = null
{
  const NOME = 'Recuperacao de Imposto sobre NF'
  const { data: ja } = await sb.from('erp_categorias').select('id,nome').eq('nome', NOME).maybeSingle()
  if (ja) { catId = ja.id; console.log(`  categoria já existe: ${NOME}`) }
  else {
    console.log(`  criar categoria "${NOME}" (tipo receita, dre_grupo=imposto -> ABATE a linha de impostos)`)
    if (APPLY) {
      const { data: nova } = await sb.from('erp_categorias')
        .insert({ nome: NOME, tipo: 'receita', dre_grupo: 'imposto', cor: '#7aa2f7' }).select('id').single()
      catId = nova?.id
    }
  }
  const { data: mv } = await sb.from('erp_movimentos_bancarios')
    .select('id,data,valor,descricao,categoria_id,conta_receber_id,observacoes')
    .eq('valor', 1857).ilike('descricao', '%IMPOSTO NF%').maybeSingle()
  if (mv) {
    console.log(`  ${String(mv.data).slice(0, 10)} ${brl(mv.valor)} — reclassificar de "Estornos e Devolucoes"`)
    if (APPLY && catId) {
      await sb.from('erp_movimentos_bancarios').update({
        categoria_id: catId,
        observacoes: [String(mv.observacoes || '').trim(), `[18/08/2026] Cobertura do imposto da NF do 32º Leilão 4R (09/05/2026), devolvida pela Bula Remates conforme o acordo de 06/08. Equivale a 12,32% sobre os R$ 15.076,75 que ficaram com a Remates. Classificado como recuperação de imposto para abater a linha de impostos da DRE — não é receita nova.`].filter(Boolean).join('\n'),
      }).eq('id', mv.id)
      if (mv.conta_receber_id) {
        await sb.from('erp_contas_receber').update({ fechamento_id: f.id, categoria_id: catId }).eq('id', mv.conta_receber_id)
      }
    }
  } else console.log('  movimento não encontrado')
}

/* ── 4. conferência ─────────────────────────────────────────────────────── */
console.log('\n=== 4. SITUAÇÃO DO 4R APÓS A LIQUIDAÇÃO ===')
{
  const { data: pos } = await sb.from('erp_contas_receber')
    .select('descricao,vencimento,valor,status').eq('fechamento_id', f.id).order('vencimento')
  let aberto = 0, recebido = 0
  for (const c of pos || []) {
    if (['aberto', 'parcial', 'vencido'].includes(c.status)) aberto += Number(c.valor)
    if (c.status === 'recebido') recebido += Number(c.valor)
    console.log(`  ${String(c.vencimento).slice(0, 10)} ${brl(c.valor).padStart(12)} [${c.status}] ${c.descricao.slice(0, 48)}`)
  }
  console.log(`  -> recebido em caixa ${brl(recebido)} | ainda a receber ${brl(aberto)}`)
}
console.log(APPLY ? '\nAPLICADO.' : '\nDRY-RUN. Use --apply para gravar.')
