import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarPrazoRecebimento, recebimentoConfirmado, referenciaCobranca } from '../src/lib/erp-prazos'
import { prepararTituloContas } from '../src/lib/erp-contas'
import { computeFluxoCaixa } from '../src/lib/erp-dashboards'
import type { Titulo } from '../src/lib/verdade/fatos'
import type { SupabaseClient } from '@supabase/supabase-js'

test('data automática não é promessa nem atraso; acompanhamento usa leilão + 30 dias',()=>{
 const t={id:'cr',valor:100,valor_recebido:0,status:'vencido',vencimento:'2026-08-01',tags:[],observacoes:'Acordo comercial; data ainda não acordada',fechamento:{data:'2026-08-01'}} as unknown as Titulo
 const r=prepararTituloContas(t,'receber','2026-09-08')
 assert.equal(r.status,'aberto');assert.equal(r.financeiro.prazo_confirmado,false);assert.equal(r.financeiro.data_cobranca,'2026-08-31')
 assert.equal(t.status,'vencido');assert.equal(r.financeiro.saldo,100)
 assert.equal(prepararTituloContas({...t,tags:['data-acordada']},'receber','2026-09-08').status,'vencido')
 assert.equal(referenciaCobranca({tags:[]}),null)
 assert.equal(referenciaCobranca({tags:['cobranca-em:2026-09-12']},'2026-08-01'),'2026-09-12')
})

test('confirmar exige fonte; mudar data por outro cliente invalida confirmação antiga',()=>{
 const antigo={vencimento:'2026-09-10',tags:['leilao','data-acordada'],observacoes:'Histórico',status:'vencido',valor_recebido:0}
 assert.throws(()=>aplicarPrazoRecebimento({prazo_confirmado:true,vencimento:'2026-09-12'},antigo),/quem confirmou/)
 const p=aplicarPrazoRecebimento({prazo_confirmado:true,vencimento:'2026-09-12',fonte_prazo:'Cliente confirmou por WhatsApp em 08/09'},antigo)
 assert.ok(recebimentoConfirmado(p));assert.match(String(p.observacoes),/Histórico\n\[DATA ACORDADA 2026-09-12\]/)
 assert.ok(!('prazo_confirmado' in p));assert.ok(!('fonte_prazo' in p))
 const mudou=aplicarPrazoRecebimento({vencimento:'2026-09-15'},antigo)
 assert.equal(recebimentoConfirmado(mudou),false)
 const indef=aplicarPrazoRecebimento({prazo_confirmado:false,vencimento:'2026-09-18'},antigo)
 assert.equal(indef.status,'aberto');assert.deepEqual(indef.tags,['leilao','cobranca-em:2026-09-18'])
})

test('fluxo mantém recebíveis sem data fora da curva sem escondê-los',async()=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const base={vencimento:date,valor:100,valor_recebido:0,desconto:0,juros:0,multa:0,status:'aberto',tags:[],origem:'real',substituido_por:null,categoria_id:null}
 const tables:Record<string,unknown[]>={erp_contas_bancarias:[{saldo_atual:1000}],erp_movimentos_bancarios:[],erp_contas_pagar:[],erp_categorias:[],erp_contas_receber:[base,{...base,valor:200,tags:['data-acordada']} ]}
 const sb={from(name:string){const q={select(){return q},order(){return q},range(){return q},eq(){return q},in(){return q},gte(){return q},lte(){return q},then(resolve:(x:unknown)=>unknown){return Promise.resolve(resolve({data:tables[name]||[],error:null}))}};return q}} as unknown as SupabaseClient
 const r=await computeFluxoCaixa(sb,{dias:7,passado:0})
 assert.equal(r.sem_data.entrada,100);assert.equal(r.sem_data.titulos_entrada,1)
 assert.equal(r.vencido.entrada,0)
 const serialized=JSON.stringify(r);assert.ok(serialized.includes('1200'))
})
