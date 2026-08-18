/**
 * DECISÕES DO FINANCEIRO APLICADAS AO ERP (18/08/2026).
 *
 * Fontes: instrução direta do João + leitura do grupo "Financeiro Bula
 * Assessoria" (169 mensagens, 09/07 a 18/08).
 *
 * 1. ESCRITÓRIO ENCERRADO — o João avisou que não há mais nada a pagar de
 *    escritório (máquina de café, aluguel, contas). Os títulos recorrentes em
 *    aberto são cancelados com a justificativa.
 *
 * 2. LEILÃO 4R (mensagem de 06/08, Guilherme): a Assessoria teria 2% do
 *    faturamento por NF, mas houve acordo de abatimento com a Remates e
 *    repasse ao Grupo MRA; o saldo de R$ 15.076,75 foi repassado à Remates por
 *    orientação do Felipe, e "a Remates repassará à Assessoria somente o valor
 *    para cobertura do imposto da NF". Os recebíveis ligados a esse leilão
 *    ficam MARCADOS para revisão — não altero valor sem o número do imposto.
 *
 * 3. NELORE MEAB (20/07 e 18/08): três vendas do Fábio foram CANCELADAS pelo
 *    dono do leilão (CPF do comprador com pendência e I.E. em outro nome).
 *    O fechamento e a comissão precisam refletir isso — marcado para revisão.
 *
 * 4. VENDAS DO MATEUS creditadas ao Fábio (18/08): "não acho justo pagarmos 2%
 *    para o Fábio, sendo que a venda foi realizada pelo Mateus — se for acertar
 *    é 1% diretamente com o Mateus". Comissões nessa condição ficam marcadas.
 *
 * Só cancela/edita o que é instrução explícita; o resto vira observação
 * rastreável no próprio título.
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
const nota = t => `[18/08/2026] ${t}`

/* ── 1. escritório encerrado ─────────────────────────────────────────────── */
console.log('=== 1. ESCRITÓRIO ENCERRADO (cancelar recorrentes) ===')
{
  const { data } = await sb.from('erp_contas_pagar')
    .select('id,descricao,vencimento,valor,status')
    .in('status', ['aberto', 'parcial', 'vencido'])
  const RE = /escrit[oó]rio|m[aá]quina de caf[eé]|aluguel|energia el[eé]trica|internet|[aá]gua\b|condom[ií]nio/i
  const alvo = (data || []).filter(t => RE.test(t.descricao))
  for (const t of alvo) {
    console.log(`  - ${String(t.vencimento).slice(0, 10)} ${brl(t.valor).padStart(11)} ${t.descricao}`)
    if (APPLY) {
      await sb.from('erp_contas_pagar').update({
        status: 'cancelado',
        observacoes: nota('Cancelado: a Bula não mantém mais o escritório — sem despesa de aluguel, café, energia ou internet a pagar (instrução do João, financeiro).'),
      }).eq('id', t.id)
    }
  }
  if (!alvo.length) console.log('  (nenhum título de escritório em aberto)')
}

/* ── 2. leilão 4R: acordo de compensação com a Remates ───────────────────── */
console.log('\n=== 2. LEILÃO 4R — acordo de 06/08 (marcar para revisão) ===')
{
  const { data: f } = await sb.from('bula_leilao_fechamento').select('id,nome').ilike('nome', '%4R%').maybeSingle()
  if (f) {
    const { data: crs } = await sb.from('erp_contas_receber')
      .select('id,descricao,vencimento,valor,status').eq('fechamento_id', f.id)
    const texto = nota('ACORDO 4R (Financeiro, 06/08): a Assessoria teria 2% do faturamento por NF, mas houve abatimento das comissões em aberto na Remates e repasse ao Grupo MRA. O saldo de R$ 15.076,75 foi repassado à REMATES por orientação do Felipe. Ficou definido que a Remates devolve à Assessoria apenas o valor do imposto da NF. REVISAR o valor deste título — o que a Assessoria tem a receber é só o imposto.')
    for (const c of crs || []) {
      if (c.status === 'cancelado') continue
      console.log(`  ~ ${String(c.vencimento).slice(0, 10)} ${brl(c.valor).padStart(12)} [${c.status}] ${c.descricao.slice(0, 56)}`)
      if (APPLY) {
        const { data: atual } = await sb.from('erp_contas_receber').select('observacoes,tags').eq('id', c.id).single()
        await sb.from('erp_contas_receber').update({
          observacoes: [String(atual?.observacoes || '').trim(), texto].filter(Boolean).join('\n'),
          tags: [...new Set([...(atual?.tags || []), 'revisar-acordo-4r'])],
        }).eq('id', c.id)
      }
    }
  }
}

/* ── 3. Nelore MEAB: vendas canceladas pelo dono do leilão ──────────────── */
console.log('\n=== 3. NELORE MEAB — 3 vendas canceladas (marcar fechamento e comissões) ===')
{
  const { data: f } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,data,vgv_total,observacoes').ilike('nome', '%MEAB%').maybeSingle()
  if (f) {
    console.log(`  fechamento: ${f.nome} · VGV ${brl(f.vgv_total)}`)
    const texto = nota('ATENÇÃO (Financeiro, 20/07 e 18/08): três vendas do Fábio neste leilão foram CANCELADAS pelo dono do leilão — o comprador estava com pendência no CPF e a I.E. em nome de terceiro. O VGV e a comissão precisam ser recalculados sem esses lotes.')
    if (APPLY) {
      await sb.from('bula_leilao_fechamento').update({
        observacoes: [String(f.observacoes || '').trim(), texto].filter(Boolean).join('\n'),
      }).eq('id', f.id)
    }
    const { data: cps } = await sb.from('erp_contas_pagar')
      .select('id,descricao,valor,status').ilike('descricao', 'COMISSAO%MEAB%').neq('status', 'cancelado')
    for (const c of cps || []) {
      console.log(`  ~ comissão ${brl(c.valor).padStart(11)} [${c.status}] ${c.descricao.slice(0, 58)}`)
      if (APPLY) {
        const { data: atual } = await sb.from('erp_contas_pagar').select('observacoes,tags').eq('id', c.id).single()
        await sb.from('erp_contas_pagar').update({
          observacoes: [String(atual?.observacoes || '').trim(), texto].filter(Boolean).join('\n'),
          tags: [...new Set([...(atual?.tags || []), 'revisar-venda-cancelada'])],
        }).eq('id', c.id)
      }
    }
  }
}

/* ── 4. vendas do Mateus creditadas ao Fábio ────────────────────────────── */
console.log('\n=== 4. COMISSÕES DO FÁBIO sobre vendas feitas pelo Mateus (marcar) ===')
{
  const { data: cps } = await sb.from('erp_contas_pagar')
    .select('id,descricao,valor,status,vencimento')
    .ilike('descricao', '%FÁBIO OMENA%').in('status', ['aberto', 'parcial', 'vencido'])
  const texto = nota('EM DISCUSSÃO (Financeiro, 18/08): parte das vendas creditadas ao Fábio foi realizada pelo Mateus. Definição do João: "não é justo pagar 2% ao Fábio quando quem vendeu foi o Mateus — se for acertar, é 1% direto com o Mateus". Conferir a autoria lote a lote antes de pagar.')
  console.log(`  ${(cps || []).length} comissões do Fábio em aberto — marcadas para conferência de autoria`)
  if (APPLY) {
    for (const c of cps || []) {
      const { data: atual } = await sb.from('erp_contas_pagar').select('observacoes,tags').eq('id', c.id).single()
      await sb.from('erp_contas_pagar').update({
        observacoes: [String(atual?.observacoes || '').trim(), texto].filter(Boolean).join('\n'),
        tags: [...new Set([...(atual?.tags || []), 'conferir-autoria-venda'])],
      }).eq('id', c.id)
    }
  }
}

console.log(APPLY ? '\nAPLICADO.' : '\nDRY-RUN. Use --apply para gravar.')
