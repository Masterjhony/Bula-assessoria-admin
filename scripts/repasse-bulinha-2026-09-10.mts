/**
 * Fecha o repasse ao Bulinha (Felipe Andrade) decidido pelo chefe em 10/09/2026:
 * "vamos repassar ao Bulinha o valor do JMP + essa comissao dele - esse valor
 * referente a metade do imposto pago".
 *
 *   2a parcela do JMP (JBJ, entrou 08/09 no Sicredi)   165.667,50
 *   + comissao dele de agosto (2% sobre FIL '2')         3.960,00
 *   - metade do ISS da NF 618/619 ja pago                8.283,37
 *   = REPASSE                                          161.344,13
 *
 * O ERP ja tinha os tres pedacos como titulos separados, e a soma bate ao
 * centavo. NAO os fundo num titulo so: cada um tem natureza e rastro proprios
 * (o repasse e dinheiro de terceiro faturado no CNPJ da Bula; as comissoes sao
 * de fechamento, com evento_key e fechamento_id). O que muda e a DATA: as duas
 * comissoes saem do lote do dia 25 e passam para 10/09, para irem no mesmo PIX.
 *
 * [1] CP 637f0a9e  157.384,13  repasse JMP (ja liquido do 1/2 ISS)
 * [2] CP 523e404a    2.100,00  Excelencia Genetica 23/08, lote 21
 * [3] CP 3a138ee8    1.860,00  Naviraí Camparino Matrizes 22/08, lote 11
 *     ⚠ Este estava como "A definir: Peralta / Felipe Andrade". O print que o
 *     chefe mandou (quadro FIL '2', comprador VALDEMAR PISSINATTI GUERRA nos
 *     dois lotes, total 198.000,00 de VGV e 3.960,00 de 2%) atribui o lote 11
 *     a ele. Isso RESOLVE a duvida — ver a-definir-resolve-se-no-hastapro e
 *     atribuicao-lote-quem-postou-vs-quem-vendeu.
 *
 * ⚠ ACHADO: "Bulinha (Felipe Andrade)" (623cf381) e "Felipe Vilela Andrade"
 * (248eba5a, CPF 024.880.251-86) sao DOIS cadastros para a mesma pessoa. O
 * repasse aponta para um, as comissoes para o outro. Nao unifico aqui — mexer
 * em cadastro com titulo pago pendurado e outra tarefa —, mas fica declarado.
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
const TAG = '[REPASSE BULINHA 10/09]'
const DATA = '2026-09-10'
const P_FELIPE_VILELA = '248eba5a-3d89-46a1-b2d6-4c64424d78b9'
const P_BULINHA = '623cf381-2714-404e-b96a-cd04b1e43af9'

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const say = (s: string) => console.log(s)

let cps: any[] = []
for (let p = 0; ; p++) { const { data } = await sb.from('erp_contas_pagar').select('*').range(p * 1000, p * 1000 + 999); if (!data?.length) break; cps = cps.concat(data); if (data.length < 1000) break }
const cp = (pref: string) => { const t = cps.find(r => r.id.startsWith(pref)); if (!t) throw new Error('CP ' + pref); return t }

const FONTE = {
  tipo: 'usuario_atual', data: '2026-09-10',
  ref: 'Conversa Claude Code 10/09/2026 — decisao do chefe sobre o repasse do JMP',
  trecho: '"vamos repassar ao Bulinha o valor do JMP + essa comissao dele - esse valor referente a metade do imposto pago". '
    + 'Acompanhado do quadro FIL \'2\' (Naviraí Camparino Matrizes 22/08 lote 11 = 1.860,00 e Excelencia Genetica 23/08 lote 21 = 2.100,00, '
    + 'comprador VALDEMAR PISSINATTI GUERRA nos dois, VGV 198.000,00, 2% = 3.960,00) e do print do WhatsApp do financeiro '
    + '"Seria 165.667,50 - 8.283,37 = R$ 157.384,13".',
}

async function ajusta(pref: string, patch: Record<string, any>, nota: string, fecharApuracao = false) {
  const t = cp(pref)
  const obs = String(t.observacoes || '')
  if (obs.includes(TAG)) { say('  CP  ' + String(t.descricao).slice(0, 56).padEnd(57) + ' (ja ajustado)'); return t }
  const upd: Record<string, any> = { ...patch, observacoes: (obs ? obs + ' ' : '') + TAG + ' ' + nota }
  if (fecharApuracao) {
    const a = (t.apuracao && typeof t.apuracao === 'object') ? t.apuracao : {}
    const fontes = Array.isArray(a.fontes) ? a.fontes : []
    upd.apuracao = {
      ...a, natureza: 'obrigacao', valor_situacao: 'confirmado',
      fontes: [...fontes, FONTE], pendencias: [],
      pendencias_encerradas: [...(Array.isArray(a.pendencias_encerradas) ? a.pendencias_encerradas : []),
      ...(Array.isArray(a.pendencias) && a.pendencias.length ? [{ data: DATA, encerrada_por: FONTE.ref, textos: a.pendencias }] : [])],
    }
    delete upd.apuracao.nao_executar_pagamento
  }
  say('  CP  ' + String(t.descricao).slice(0, 56).padEnd(57) + brl(t.valor).padStart(12)
    + '  venc ' + t.vencimento + (patch.vencimento && patch.vencimento !== t.vencimento ? ' -> ' + patch.vencimento : ''))
  if (APPLY) { const { error } = await sb.from('erp_contas_pagar').update(upd).eq('id', t.id); if (error) throw error }
  return t
}

say('\n=== REPASSE AO BULINHA — composicao ===')
const rep = cp('637f0a9e'), c1 = cp('523e404a'), c2 = cp('3a138ee8')
const total = Number(rep.valor) + Number(c1.valor) + Number(c2.valor)
say('  2a parcela JMP (bruto) .................. ' + brl(165667.50).padStart(13))
say('  - metade do ISS da NF 618/619 ........... ' + brl(-8283.37).padStart(13))
say('  = repasse liquido (CP 637f0a9e) ........ ' + brl(rep.valor).padStart(13))
say('  + comissao Excelencia Genetica lote 21 . ' + brl(c1.valor).padStart(13))
say('  + comissao Naviraí Camparino lote 11 ... ' + brl(c2.valor).padStart(13))
say('  ' + '='.repeat(42))
say('  TOTAL A REPASSAR ....................... ' + brl(total).padStart(13))
say('  conferencia: 165.667,50 + 3.960,00 - 8.283,37 = ' + brl(165667.50 + 3960 - 8283.37))

say('\n=== AJUSTES ===')
await ajusta('637f0a9e', { vencimento: DATA },
  'Repasse fechado com o chefe em 10/09: JMP 165.667,50 + comissao 3.960,00 - metade do ISS 8.283,37 = 161.344,13, pagos juntos. '
  + 'Este titulo e a parte do JMP (157.384,13); as duas comissoes seguem em titulos proprios (523e404a e 3a138ee8) porque tem fechamento e evento_key. '
  + 'O dinheiro esta na aplicacao do Sicredi desde 08/09.')

await ajusta('523e404a', { vencimento: DATA, fornecedor_id: c1.fornecedor_id || P_BULINHA },
  'Antecipada do lote do dia 25 para sair no mesmo PIX do repasse do JMP, por decisao do chefe em 10/09. '
  + 'Excelencia Genetica 23/08, lote 21, lance 3.500 x 30 = VGV 105.000,00, comprador VALDEMAR PISSINATTI GUERRA, 2% = 2.100,00.', true)

await ajusta('3a138ee8', {
  vencimento: DATA, fornecedor_id: P_BULINHA,
  descricao: 'Comissão Felipe Andrade (Bulinha) — LEILÃO NAVIRAÍ CAMPARINO ESSÊNCIA BEZERRAS E NOVILHAS — lote 11',
}, 'ATRIBUICAO RESOLVIDA: estava "A definir: Peralta / Felipe Andrade". O quadro FIL \'2\' que o chefe mandou em 10/09 poe o lote 11 '
  + '(3.100 x 30 = 93.000,00, comprador VALDEMAR PISSINATTI GUERRA) como venda do Bulinha, 2% = 1.860,00. '
  + 'Antecipada do dia 25 para sair junto com o repasse do JMP.', true)

say('\n=== VERIFICACAO ===')
let cps2: any[] = []
for (let p = 0; ; p++) { const { data } = await sb.from('erp_contas_pagar').select('id,descricao,valor,vencimento,status,apuracao').range(p * 1000, p * 1000 + 999); if (!data?.length) break; cps2 = cps2.concat(data); if (data.length < 1000) break }
let soma = 0
for (const pref of ['637f0a9e', '523e404a', '3a138ee8']) {
  const t = cps2.find(r => r.id.startsWith(pref))!
  soma += Number(t.valor)
  const a: any = t.apuracao || {}
  say('  ' + pref + ' ' + t.vencimento + ' ' + brl(t.valor).padStart(12) + ' ' + String(t.status).padEnd(8)
    + ' apuracao ' + (a.natureza ?? '-') + '/' + (a.valor_situacao ?? '-') + (a.nao_executar_pagamento ? ' TRAVADO' : '')
    + '  ' + String(t.descricao).slice(0, 48))
}
say('  ' + 'SOMA'.padEnd(22) + brl(soma).padStart(12) + (Math.abs(soma - 161344.13) < 0.005 ? '  OK bate com 161.344,13' : '  ⚠ NAO BATE'))
if (!APPLY) say('\nDRY-RUN. Use --apply para gravar.')
