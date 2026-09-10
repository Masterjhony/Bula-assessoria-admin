/**
 * Duas decisoes do chefe em 10/09/2026:
 *   1) O Marcelo sera pago AMANHA (11/09).
 *   2) "o valor do Rusa e isso, ta errado la" — a Planilha de Vendas Bula
 *      filtrada por GUSTAVO RUSA fecha em R$ 65.635,00 (16 lotes, 17 animais,
 *      R$ 1.401.500,00 de VGV). O ERP tinha R$ 97.960,00.
 *
 * A conciliacao fecha ao centavo: 97.960,00 - 34.935,00 (4 titulos que nao
 * estao na planilha) + 2.610,00 (1 que falta) = 65.635,00. QUINZE das
 * dezesseis linhas da planilha ja batiam exatamente com um titulo do ERP.
 *
 * ⚠ NEM TODO O AJUSTE E OBVIO — os fechamentos discordam da planilha em dois
 * casos, e onde discordam eu NAO escolhi sozinho: tirei o Rusa (que e o que o
 * chefe determinou) e deixei o dinheiro visivel como "a definir", em vez de
 * entregar a outra pessoa por minha conta. Comissao some de titulo, nao some
 * de quem vendeu.
 *
 * [A] LS GALERIA 07/08 — 22.800,00. CP era "A definir: Gustavo Rusa / Fabio
 *     Omena". O fechamento a125d78a poe os lotes 04 (150.000) e 19 (306.000)
 *     no Rusa (5% = 22.800). A planilha do chefe NAO tem LS Galeria, e o
 *     periodo dela (01-30/08) cobre o dia 07/08. Conflito real: fica "A
 *     definir" SEM o Rusa; sobra o Fabio Omena como unico candidato, mas quem
 *     confirma e o chefe.
 *
 * [B] SABIA DOURADO 30/08 — 5.535,00. CP era "A definir: Rusa / Douglas".
 *     Aqui NAO ha conflito: o fechamento a3157c98 tem 29 lotes e TODOS sao do
 *     DOUGLAS BISPO, nenhum do Rusa. Planilha e fechamento concordam ->
 *     resolvido para Douglas Bispo.
 *
 * [C] PEROLAS DO TAPAJOS 08/08 — 4.500,00 (lote 44) + 2.100,00 (lote 47).
 *     Estavam atribuidos direto ao Rusa, sem "a definir". O fechamento
 *     ef8870d4 confirma Rusa nos dois lotes; a planilha do chefe nao os traz.
 *     Conflito real -> viram "A definir", com as duas fontes declaradas.
 *
 * [D] MATRIZES PREMIUM COLONIAL 21/08, lote 29 — 2.610,00 (3% de 87.000).
 *     Esta na planilha e NAO existe no ERP: o 12o Leilao Premium Colonial de
 *     21/08 aparece como "EM FECHAMENTO" na planilha do Drive e nao tem
 *     `bula_leilao_fechamento`. CP criado a partir da planilha, sem
 *     fechamento_id — quando o fechamento entrar, casar por evento_key.
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
const TAG = '[RUSA/MARCELO 10/09]'
const ALVO_RUSA = 65635.00
const FONTE = 'Fonte: "Planilha de Vendas Bula" filtrada por GUSTAVO RUSA, mandada pelo chefe em 10/09/2026 — '
  + '16 lotes, 17 animais, VGV R$ 1.401.500,00, total liquido R$ 65.635,00.'

const CAT_COMISSOES = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'
const CC_COMISSAO = '52dd8ed0-0c0a-4524-86bd-01dc121487b3'
const CONTA_SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const say = (s: string) => console.log(s)

let cps: any[] = [], pes: any[] = []
for (let p = 0; ; p++) { const { data } = await sb.from('erp_contas_pagar').select('*').range(p * 1000, p * 1000 + 999); if (!data?.length) break; cps = cps.concat(data); if (data.length < 1000) break }
{ const { data } = await sb.from('erp_pessoas').select('id,nome'); pes = data ?? [] }
const nomeP = (id: any) => pes.find(p => p.id === id)?.nome ?? ''
const cp = (pref: string) => { const t = cps.find(r => r.id.startsWith(pref)); if (!t) throw new Error('CP ' + pref); return t }
const vivo = (t: any) => t.status !== 'cancelado' && t.status !== 'pago' && !t.substituido_por
const saldo = (t: any) => Math.round((Number(t.valor) - Number(t.desconto || 0) - Number(t.valor_pago || 0)) * 100) / 100

async function patch(pref: string, upd: Record<string, any>, nota: string) {
  const t = cp(pref)
  const obs = String(t.observacoes || '')
  if (obs.includes(TAG)) { say('  ' + pref + '  (ja ajustado)'); return }
  say('  ' + pref + '  ' + brl(t.valor).padStart(11) + '  ' + String(t.descricao).slice(0, 44))
  if (upd.descricao) say('        -> ' + String(upd.descricao).slice(0, 78))
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar')
      .update({ ...upd, observacoes: (obs ? obs + ' ' : '') + TAG + ' ' + nota }).eq('id', t.id)
    if (error) throw error
  }
}

const P_DOUGLAS = pes.find(p => /douglas bispo/i.test(p.nome))?.id ?? null
const P_RUSA = pes.find(p => /gustavo rusa/i.test(p.nome))?.id ?? null

// ---------------------------------------------------------------------------
say('\n=== [1] MARCELO — pagar amanha (11/09) ===')
await patch('3160f623', { vencimento: '2026-09-11' },
  'O chefe decidiu em 10/09 pagar amanha. O titulo estava sem vencimento desde a auditoria de completude. '
  + 'ATENCAO: pelo fluxo de 10/09, pagar os 63.500 leva o mes a fechar em -16.195,60 e o caixa fura o zero em 25/09 — decisao tomada com o numero na mesa.')

// ---------------------------------------------------------------------------
say('\n=== [2] LS GALERIA — tira o Rusa, conflito declarado ===')
await patch('3889f0dd', {
  descricao: 'Comissão A definir (Fábio Omena?) — 2º LEILÃO LS GALERIA — lotes 04 e 19',
  fornecedor_id: null,
}, 'RUSA REMOVIDO: a planilha de vendas dele nao traz o LS Galeria, e o periodo dela (01-30/08) cobre o dia 07/08. '
  + '⚠ CONFLITO: o fechamento a125d78a atribui os lotes 04 (150.000) e 19 (306.000) ao Rusa, 5% = 22.800,00. '
  + 'Como as duas fontes discordam, NAO atribui ao Fabio Omena por conta propria — fica a definir. Ele e o unico candidato que sobra do par original. ' + FONTE)

// ---------------------------------------------------------------------------
say('\n=== [3] SABIA DOURADO — resolvido para o Douglas ===')
await patch('79370478', {
  descricao: 'Comissão Douglas Bispo — LEILÃO SABIÁ DOURADO',
  ...(P_DOUGLAS ? { fornecedor_id: P_DOUGLAS } : {}),
}, 'RESOLVIDO: era "A definir: Rusa / Douglas". As duas fontes concordam em excluir o Rusa — a planilha dele nao tem Sabia Dourado, '
  + 'e o fechamento a3157c98 tem 29 lotes, TODOS do Douglas Bispo, nenhum do Rusa. ' + FONTE)

// ---------------------------------------------------------------------------
say('\n=== [4] PEROLAS DO TAPAJOS — conflito, volta para a definir ===')
for (const [pref, lote] of [['98db8a41', 'lote 44'], ['f7a0dd9b', 'lote 47']] as [string, string][]) {
  await patch(pref, {
    descricao: 'Comissão A definir — 14º LEILÃO PÉROLAS DO TAPAJÓS — ' + lote,
    fornecedor_id: null,
  }, 'RUSA REMOVIDO: nao esta na planilha de vendas dele, e o periodo cobre o dia 08/08. '
    + '⚠ CONFLITO: o fechamento ef8870d4 atribui os lotes 44 (90.000) e 47 (42.000) ao Rusa (5% = 4.500 + 2.100). '
    + 'O restante do leilao e do Douglas Bispo. Fica a definir ate o chefe dizer de quem sao. ' + FONTE)
}

// ---------------------------------------------------------------------------
say('\n=== [5] MATRIZES PREMIUM COLONIAL lote 29 — falta no ERP ===')
{
  const DOC = 'com-ago26:rusa:premium-colonial-2026-08-21:lote29'
  const { data: ja } = await sb.from('erp_contas_pagar').select('id,descricao').eq('numero_documento', DOC).maybeSingle()
  if (ja) say('  (ja existe: ' + String(ja.descricao).slice(0, 60) + ')')
  else {
    say('  CP+ Comissão Gustavo Rusa — MATRIZES PREMIUM COLONIAL — lote 29   ' + brl(2610))
    if (APPLY) {
      const { error } = await sb.from('erp_contas_pagar').insert({
        descricao: 'Comissão Gustavo Rusa — 12º LEILÃO PREMIUM COLONIAL (21/08) — lote 29',
        valor: 2610, vencimento: '2026-09-25', emissao: '2026-08-21', status: 'aberto',
        categoria_id: CAT_COMISSOES, centro_custo_id: CC_COMISSAO, ...(P_RUSA ? { fornecedor_id: P_RUSA } : {}),
        conta_bancaria_id: CONTA_SICOOB, numero_documento: DOC, origem: 'real', vendedor: 'GUSTAVO RUSA',
        evento_key: 'comissao:premium-colonial-2026-08-21:gustavo-rusa:lote29',
        tags: ['a-pagar', 'comissao', '2026', 'agosto', 'leilao'],
        apuracao: { natureza: 'obrigacao', valor_situacao: 'confirmado', pagamento_situacao: 'pendente', pendencias: [], fontes: [{ tipo: 'usuario_atual', data: '2026-09-10', ref: 'Planilha de Vendas Bula — GUSTAVO RUSA (chefe, 10/09/2026)', trecho: 'MATRIZES PREMIUM COLONIAL, 21/08/2026, lote 29, F, 1 animal, lance 2.900,00 x 30 = VGV 87.000,00, 3,00% = R$ 2.610,00.' }] },
        observacoes: TAG + ' Estava na planilha do chefe e NAO existia no ERP. O 12o Leilao Premium Colonial de 21/08 consta como '
          + '"EM FECHAMENTO" na planilha do Drive e nao tem bula_leilao_fechamento — por isso o gerador de comissoes nunca criou o titulo. '
          + 'Criado sem fechamento_id; casar por evento_key quando o fechamento entrar. 3% de 87.000,00 (lance 2.900 x 30). ' + FONTE,
      })
      if (error) throw error
    }
  }
}

// ---------------------------------------------------------------------------
say('\n=== VERIFICACAO ===')
let cps2: any[] = []
for (let p = 0; ; p++) { const { data } = await sb.from('erp_contas_pagar').select('*').range(p * 1000, p * 1000 + 999); if (!data?.length) break; cps2 = cps2.concat(data); if (data.length < 1000) break }
const rusa = cps2.filter(t => vivo(t) && /rusa/i.test(String(t.descricao) + ' ' + nomeP(t.fornecedor_id)) && saldo(t) > 0.005)
const tot = Math.round(rusa.reduce((s, t) => s + saldo(t), 0) * 100) / 100
say('  Titulos do Rusa em aberto: ' + rusa.length)
for (const t of rusa.sort((a, b) => b.valor - a.valor)) say('    ' + brl(saldo(t)).padStart(11) + '  ' + String(t.descricao).slice(0, 66))
say('  ' + 'TOTAL'.padEnd(11) + brl(tot).padStart(13) + '  x planilha ' + brl(ALVO_RUSA)
  + '  -> dif ' + brl(tot - ALVO_RUSA) + (Math.abs(tot - ALVO_RUSA) < 0.005 ? '  OK' : '  ⚠ NAO BATE'))
const marc = cps2.find(t => t.id.startsWith('3160f623'))
say('  Marcelo: ' + brl(marc.valor) + ' venc ' + marc.vencimento + ' [' + marc.status + ']')
if (!APPLY) say('\nDRY-RUN. Use --apply para gravar.')
