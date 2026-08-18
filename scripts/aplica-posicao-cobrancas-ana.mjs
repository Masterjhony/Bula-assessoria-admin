/**
 * POSIÇÃO DAS COBRANÇAS — conversa com a Ana Paula (18/08/2026).
 *
 * Recuperada do history-sync da sessão `joao-automation` na VPS
 * (/opt/whatsapp-crm/history-dumps, JID 132998192185410@lid). A conversa não
 * estava no banco porque a fonte "Bula - Ana Paula" está cadastrada em
 * operational_sources com inbox_id='joao', e a sessão que roda hoje é
 * 'joao-automation' — a allowlist nunca casa e as mensagens 1:1 são
 * descartadas (corrigido em migration à parte).
 *
 * Mensagem de 05/08 18:49 (Ana), status de cada leilão vencido:
 *   18/03 Lagoa dos Patos — "falei com Fábio ontem, que você disse que ele não
 *          sabia com quem tínhamos fechado"; acordo é 1% sobre o faturamento de
 *          R$ 650.000 (João, 04/08). Ana em 04/08: "o Pix está certo; errado é
 *          a mentira de não querer pagar".
 *   05/05 Pintado Raiz — "ontem tentou pagar e disse que o PIX estava errado".
 *   09/05 MRA — "Bula estava fazendo acordo" / Kito — "pagando boleto".
 *   14/05 Santa Nazaré — "Leonardo pagou o leilão de junho e deixou esse
 *          pendente".
 *   30/05 Mega Nelore — "é o Henrique, que disse que teve problemas com o
 *          financeiro".
 *
 * Outra decisão (10/08): sobre o saldo do Bulinha de R$ 7.392 — João: "posso
 * provisionar ou é aquele esquema de deixar guardado?" / Ana: "deixa
 * aguardado". O título fica marcado como retido, não como atraso de pagamento.
 *
 * Só grava informação financeira/operacional; o resto da conversa é privado e
 * não entra no sistema.
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

/** casa pelo texto da descrição do título (recebíveis vencidos) */
const POSICOES = [
  {
    match: /lagoa dos patos/i, tag: 'cobranca-devedor-enrola',
    nota: 'POSIÇÃO 05/08 (Ana): "Falei com o Fábio ontem — ele disse que não sabia com quem tínhamos fechado". Acordo do leilão de 18/03: 1% sobre o faturamento de R$ 650.000 = R$ 6.500. Em 04/08 a Ana reforçou: "o Pix está certo; errado é a mentira de não querer pagar". COBRANÇA ATIVA — devedor postergando.',
  },
  {
    match: /pintado raiz/i, tag: 'cobranca-devedor-enrola',
    nota: 'POSIÇÃO 05/08 (Ana): o cliente "tentou pagar e disse que o PIX estava errado" — os dados bancários conferidos estão corretos (Bula Sicoob, ag. 4620, c/c 1056-1, CNPJ 34.791.630/0001-43). Reenviar o Pix e cobrar.',
  },
  {
    match: /MRA/i, tag: 'revisar-acordo-4r',
    nota: 'POSIÇÃO 05/08 (Ana): "MRA — a Bula estava fazendo acordo". Combina com o acordo do 4R relatado no grupo Financeiro em 06/08 (abatimento com a Remates + repasse ao Grupo MRA). NÃO cobrar antes de fechar o acordo — o valor pode já estar compensado.',
  },
  {
    match: /kito/i, tag: 'cobranca-em-dia',
    nota: 'POSIÇÃO 05/08 (Ana): "Kito — pagando boleto". Recebimento em curso, parcelado; acompanhar a próxima parcela.',
  },
  {
    match: /santa nazar/i, tag: 'cobranca-pendente',
    nota: 'POSIÇÃO 05/08 (Ana): "Santa Nazaré — o Leonardo pagou o leilão de junho e deixou este ainda pendente". Cobrar o remanescente de 14/05.',
  },
  {
    match: /mega (leilao|leilão) nelore|18[ªa] mega/i, tag: 'cobranca-devedor-enrola',
    nota: 'POSIÇÃO 05/08 (Ana): "Mega Nelore — é o Henrique, que disse que teve problemas com o financeiro". Cobrança em aberto; retomar contato.',
  },
]

console.log('=== RECEBÍVEIS VENCIDOS: posição da Ana (05/08) ===')
const { data: crs } = await sb.from('erp_contas_receber')
  .select('id,descricao,vencimento,valor,status,observacoes,tags')
  .in('status', ['vencido', 'aberto', 'parcial'])
let n = 0
for (const c of crs || []) {
  const p = POSICOES.find(x => x.match.test(c.descricao))
  if (!p) continue
  n++
  console.log(`  ~ ${String(c.vencimento).slice(0, 10)} ${brl(c.valor).padStart(12)} [${c.status}] ${c.descricao.slice(0, 52)}`)
  console.log(`      -> ${p.tag}`)
  if (APPLY) {
    const texto = `[18/08/2026] ${p.nota}`
    if (String(c.observacoes || '').includes('POSIÇÃO 05/08')) continue
    await sb.from('erp_contas_receber').update({
      observacoes: [String(c.observacoes || '').trim(), texto].filter(Boolean).join('\n'),
      tags: [...new Set([...(c.tags || []), p.tag])],
    }).eq('id', c.id)
  }
}
console.log(`  -> ${n} recebíveis com posição registrada`)

/* ── saldo do Bulinha: retido por decisão, não é atraso ─────────────────── */
console.log('\n=== SALDO DO BULINHA — retido por decisão (10/08) ===')
{
  const { data: cp } = await sb.from('erp_contas_pagar')
    .select('id,descricao,vencimento,valor,status,observacoes,tags')
    .ilike('descricao', '%BULINHA%').in('status', ['aberto', 'parcial', 'vencido'])
  for (const t of cp || []) {
    console.log(`  ~ ${String(t.vencimento).slice(0, 10)} ${brl(t.valor).padStart(11)} [${t.status}] ${t.descricao.slice(0, 56)}`)
    if (APPLY) {
      const texto = '[18/08/2026] RETIDO POR DECISÃO (conversa com a Ana, 10/08): perguntado se deveria provisionar o pagamento, a resposta foi "deixa aguardado". Não é atraso de pagamento — é retenção deliberada, junto com os acertos do Rusa e 1/3 do Fábio que foram postergados.'
      if (String(t.observacoes || '').includes('RETIDO POR DECISÃO')) continue
      await sb.from('erp_contas_pagar').update({
        observacoes: [String(t.observacoes || '').trim(), texto].filter(Boolean).join('\n'),
        tags: [...new Set([...(t.tags || []), 'retido-por-decisao'])],
      }).eq('id', t.id)
    }
  }
}

/* ── passagem do LS paga no cartão da Remates: abate em comissão ─────────── */
console.log('\n=== PASSAGEM LS (reemissão) — paga pela Remates, abate em comissão ===')
{
  const { data: cp } = await sb.from('erp_contas_pagar')
    .select('id,descricao,vencimento,valor,status,observacoes,tags')
    .or('descricao.ilike.%passagem%,descricao.ilike.%BILHETE%').in('status', ['aberto', 'parcial', 'vencido'])
  for (const t of cp || []) {
    console.log(`  ~ ${String(t.vencimento).slice(0, 10)} ${brl(t.valor).padStart(11)} ${t.descricao.slice(0, 58)}`)
  }
  console.log('  (informativo: a reemissão do bilhete do LS de 07/08 — tarifa R$ 1.663,78 + taxas R$ 166,37 + multa R$ 550,00 = R$ 2.380,15 — foi paga no CARTÃO DA REMATES e será abatida em comissão a pagar à Assessoria; não sai do caixa da Bula.)')
}

console.log(APPLY ? '\nAPLICADO.' : '\nDRY-RUN. Use --apply para gravar.')
