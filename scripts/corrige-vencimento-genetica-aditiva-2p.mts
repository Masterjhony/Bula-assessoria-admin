/**
 * Corrige o vencimento da 2a parcela do 23o Mega Leilao Genetica Aditiva.
 *
 * Os dois CR estao com vencimento 08/09 e 09/09, que e a regra AUTOMATICA de
 * leilao + 45 dias — nao uma data que alguem prometeu. A data combinada, no
 * print da conversa do Joao de 26/08, e 26/09. A 1a parcela (9.141,23) entrou
 * em 27/08; falta 9.141,22.
 *
 * Isso importa duas vezes:
 *  - a previsao de caixa ate 20/09 contava 9.141,22 que nao vai cair na janela;
 *  - os titulos iam marcar "vencido" no dia 09/09, antes da hora.
 *
 * Reexecutavel. Dry-run por padrao; use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const NOVO_VENC = '2026-09-26'
const TAG = '[VENCIMENTO ACORDADO 03/09]'
const NOTA = TAG + ' Vencimento movido de {DE} para 26/09/2026: e a data COMBINADA da 2a parcela, '
  + 'confirmada no print da conversa do Joao de 26/08/2026. As datas de 08/09 e 09/09 eram a regra automatica '
  + 'de leilao+45d, que nao e promessa de ninguem. 1a parcela (9.141,23) recebida em 27/08.'
const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const { data: crs, error } = await sb.from('erp_contas_receber')
  .select('id,descricao,valor,valor_recebido,vencimento,status,observacoes')
  .ilike('descricao', '%GENETICA ADITIVA%').in('status', ['aberto', 'vencido', 'parcial'])
if (error) throw error

for (const cr of crs || []) {
  const saldo = Number(cr.valor) - Number(cr.valor_recebido || 0)
  if (cr.vencimento === NOVO_VENC || String(cr.observacoes || '').includes(TAG)) {
    console.log('  (ja corrigido) ' + cr.descricao.slice(0, 56))
    continue
  }
  console.log('  ' + String(cr.descricao).slice(0, 56).padEnd(56) + ' saldo ' + brl(saldo).padStart(10) + '  ' + cr.vencimento + ' -> ' + NOVO_VENC)
  if (APPLY) {
    const { error: e2 } = await sb.from('erp_contas_receber').update({
      vencimento: NOVO_VENC,
      status: 'parcial',
      observacoes: (cr.observacoes ? cr.observacoes + ' ' : '') + NOTA.replace('{DE}', cr.vencimento),
    }).eq('id', cr.id)
    if (e2) throw e2
  }
}
console.log(APPLY ? 'GRAVADO.' : 'DRY-RUN. Use --apply para gravar.')
