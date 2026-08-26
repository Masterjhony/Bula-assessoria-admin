/**
 * Zera a baixa residual de titulos CANCELADOS.
 *
 * A validacao `cancelado_sem_baixa` do motor de verdade acusa: "o caixa diz que
 * aconteceu, o titulo diz que nao existe". Nao muda soma nenhuma (cancelado ja
 * esta fora de todas elas) — o que muda e o titulo parar de afirmar duas coisas
 * contraditorias ao mesmo tempo. Dry-run por padrao; --apply grava.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
  .filter(l=>l.includes('=')&&!l.startsWith('#'))
  .map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim().replace(/^"|"$/g,'')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{autoRefreshToken:false,persistSession:false} })
const APPLY = process.argv.includes('--apply')
const f=(n:any)=>Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2})

// 1) o substituto do CP existe e esta pago?
const { data: sub } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,valor_pago,status,data_pagamento').eq('id','a8c04ef4-0594-405d-b945-43f60c08e96b').maybeSingle()
console.log('substituto do CP 2ebec1e7:', sub ? `${sub.status} ${f(sub.valor)} pago ${f(sub.valor_pago)} em ${sub.data_pagamento} — ${String(sub.descricao).slice(0,50)}` : 'NAO EXISTE')
if (!sub || sub.status !== 'pago') { console.error('  substituto nao esta pago — NAO limpar, conferir antes'); process.exit(1) }

const NOTA = ' [VERDADE 26/08] Baixa residual zerada: o titulo esta cancelado e nao pode registrar pagamento/recebimento. Nenhuma soma muda (cancelado ja ficava fora de todas).'
const alvos = [
  { t:'erp_contas_pagar',   id:'2ebec1e7-6aa6-42f8-b3d9-3f486209826f', campos:{ valor_pago:0, data_pagamento:null } },
  { t:'erp_contas_receber', id:'b5da8100-2914-4a59-b34a-ecc973b02f82', campos:{ valor_recebido:0, data_recebimento:null } },
]
for (const a of alvos) {
  const { data: r } = await sb.from(a.t).select('id,descricao,status,observacoes').eq('id', a.id).single()
  if (r!.status !== 'cancelado') { console.error('  ' + a.id + ' nao esta cancelado — abortando'); process.exit(1) }
  console.log(`\n ${a.t} ${a.id}\n   ${String(r!.descricao).slice(0,70)}\n   -> ${JSON.stringify(a.campos)}`)
  if (APPLY) {
    const { error } = await sb.from(a.t).update({ ...a.campos, observacoes: (r!.observacoes || '') + NOTA }).eq('id', a.id)
    if (error) { console.error('   ERRO', error.message); process.exit(1) }
  }
}
console.log('\n' + (APPLY ? 'APLICADO.' : 'DRY-RUN. Use --apply para gravar.'))
