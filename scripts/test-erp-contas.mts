import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { hojeFinanceiro, listarTitulosContas, parcelarTitulo, prepararTituloContas } from '../src/lib/erp-contas'
import type { Titulo } from '../src/lib/verdade/fatos'
import type { SupabaseClient } from '@supabase/supabase-js'

const base = {id:'firme',descricao:'Obrigação documentada',status:'aberto',valor:100,desconto:0,juros:0,multa:0,valor_pago:0,valor_recebido:0,vencimento:'2026-09-10',origem:'real',tags:[],substituido_por:null} as unknown as Titulo

test('parcelas conservam centavos, inclusive centavo único, e fim de mês',()=>{
  assert.deepEqual(parcelarTitulo(100,'2026-01-31',3),[
    {parcela:1,valor:33.33,vencimento:'2026-01-31'},
    {parcela:2,valor:33.33,vencimento:'2026-02-28'},
    {parcela:3,valor:33.34,vencimento:'2026-03-31'},
  ])
  assert.equal(parcelarTitulo(1,'2028-01-31',2)[1].vencimento,'2028-02-29')
  assert.equal(parcelarTitulo(1,'2026-12-31',2)[1].vencimento,'2027-01-31')
  for(const amount of [0,0.01,1,100,12866.25,331335])for(const count of [1,2,3,7,60]){
    assert.equal(parcelarTitulo(amount,'2026-01-31',count).reduce((s,p)=>s+Math.round(p.valor*100),0),Math.round(amount*100))
  }
  for(const [amount,date,count] of [[NaN,'2026-01-01',1],[Infinity,'2026-01-01',1],[-1,'2026-01-01',1],[1,'2026-02-30',1],[1,'2026-01-01',1.5],[1,'2026-01-01',0],[1,'2026-01-01',61],[0.001,'2026-01-01',1]] as const)assert.throws(()=>parcelarTitulo(amount,date,count))
})

test('posição é derivada sem mutar o registro nem depender do fuso UTC',()=>{
  assert.equal(hojeFinanceiro(new Date('2026-09-09T01:00:00Z')),'2026-09-08')
  const r={...base,status:'parcial',vencimento:'2026-09-01',valor_pago:25,desconto:5,juros:3,multa:2}
  const p=prepararTituloContas(r,'pagar','2026-09-08')
  assert.equal(p.status,'vencido');assert.equal(p.status_registrado,'parcial');assert.equal(p.financeiro.saldo,75);assert.equal(r.status,'parcial')
  assert.equal(prepararTituloContas({...r,vencimento:'2026-09-08'},'pagar','2026-09-08').status,'parcial')
  assert.equal(prepararTituloContas({...r,substituido_por:'outro'},'pagar','2026-09-08').financeiro.ativo,false)
  assert.equal(prepararTituloContas({...r,status:'cancelado'},'pagar','2026-09-08').financeiro.ativo,false)
  assert.equal(prepararTituloContas({...base,tags:['orcamento']},'pagar','2026-09-08').financeiro.projecao,true)
})

test('API lê mais de mil títulos, normaliza vencidos antes do filtro e rejeita erro em página posterior',async()=>{
 const rows=Array.from({length:1203},(_,i)=>({...base,id:String(i),vencimento:i%2?'2026-09-01':'2026-09-10'}))
 const calls: unknown[]=[]
 const fake=(fail=false)=>({from(table:string){let from=0,to=0;const q={select(s:string){calls.push(['select',table,s]);return q},order(s:string){calls.push(['order',s]);return q},range(a:number,b:number){from=a;to=b;calls.push(['range',a,b]);return q},eq(){return q},gte(){return q},lte(){return q},or(s:string){calls.push(['or',s]);return q},then(resolve:(v:unknown)=>unknown){return Promise.resolve(resolve({data:rows.slice(from,to+1),error:fail&&from>=500?{message:'falha de leitura'}:null}))}};return q}} as unknown as SupabaseClient)
 const all=await listarTitulosContas(fake(),'pagar',new URLSearchParams(),'2026-09-08')
 assert.equal(all.length,1203)
 assert.equal((await listarTitulosContas(fake(),'pagar',new URLSearchParams({status:'vencido'}),'2026-09-08')).length,601)
 await assert.rejects(()=>listarTitulosContas(fake(true),'receber',new URLSearchParams(),'2026-09-08'),/falha de leitura/)
 await listarTitulosContas(fake(),'receber',new URLSearchParams({q:'Nome (teste), 10%'}),'2026-09-08')
 assert.ok(calls.some(c=>Array.isArray(c)&&c[0]==='or'&&!/[()]/.test(c[1])))
})

// Exercita a função que realmente desenha a tela e seu exportador, em memória.
const html=fs.readFileSync('src/app/erp/erp.html','utf8')
const source=html.match(/<script>([\s\S]*?)<\/script>/)![1]
const ast=ts.createSourceFile('erp.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
const names=['renderContas','exportContasCsv','toggleSelAllContas']
const functions=ast.statements.filter(s=>(ts.isFunctionDeclaration(s)&&names.includes(s.name?.text||''))||(ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(ast)==='prazoRecebimentoConfirmado'))).map(s=>s.getText(ast)).join('\n')

test('tela, aging e CSV usam a mesma natureza; baixa parcial e cancelados não distorcem os totais',async()=>{
 const rows=[base,{...base,id:'projecao',descricao:'Folha futura',valor:900,origem:'estimativa'}, {...base,id:'orcamento',descricao:'Orçamento',valor:200,tags:['orcamento']}, {...base,id:'cancelado',descricao:'Cancelado',valor:500,status:'cancelado'}, {...base,id:'substituido',descricao:'Substituído',valor:700,substituido_por:'firme'}, {...base,id:'parcial',descricao:'Parcial',valor:100,valor_pago:25,status:'parcial'}].map(r=>prepararTituloContas(r,'pagar','2026-09-08'))
 const page={innerHTML:''};let exported:Blob|undefined
 const state={filters:{} as Record<string,string>,contasSel:new Set(),categorias:[],centros:[],cp:[],cr:[],contasVisiveis:{} as Record<string,typeof rows>}
 const context=vm.createContext({state,api:async()=>rows,render(){},renderTituloDrawer(){},URLSearchParams,Set,Map,Blob,Math,Number,Date,String,Array,Object,console,
 localStorage:{getItem:()=>null},today:()=> '2026-09-08',fmtDate:(x:string)=>x,fmtDateShort:(x:string)=>x,fmtBRL:(x:number)=>Number(x).toFixed(2),escapeHtml:(x:unknown)=>String(x??''),statusChip:(x:string)=>x,
 document:{getElementById:()=>page,createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},URL:{createObjectURL:(b:Blob)=>{exported=b;return'blob:test'},revokeObjectURL(){}},toast(){},setTimeout(){}})
 vm.runInContext(functions,context)
 const render=()=>vm.runInContext("renderContas('pagar')",context)
 await render()
 assert.deepEqual(Array.from(state.contasVisiveis.pagar,r=>r.id).sort(),['firme','parcial'])
 vm.runInContext("toggleSelAllContas('pagar',true)",context)
 assert.deepEqual([...state.contasSel].sort(),['firme','parcial'])
 state.contasSel.clear()
 assert.match(page.innerHTML,/Próximos 30 dias <b class="money">175.00/)
 assert.match(page.innerHTML,/Baixado nos títulos<\/div>\s*<div[^>]*>25.00/)
 vm.runInContext("exportContasCsv('pagar')",context)
 const csv=await exported!.text();assert.match(csv,/Obrigação documentada/);assert.doesNotMatch(csv,/Folha futura|Cancelado|Substituído/)
 state.filters.compromisso='projecao';await render()
 assert.deepEqual(Array.from(state.contasVisiveis.pagar,r=>r.id).sort(),['orcamento','projecao'])
 assert.match(page.innerHTML,/Próximos 30 dias <b class="money">1100.00/)
 vm.runInContext("exportContasCsv('pagar')",context);assert.match(await exported!.text(),/Folha futura/)
 state.filters.compromisso='todos';await render();assert.equal(state.contasVisiveis.pagar.length,4)
 rows.splice(0,rows.length,...[
  {...base,id:'sem-data',descricao:'Cobrança sem promessa',vencimento:'2026-08-01',status:'vencido'},
  {...base,id:'confirmado',descricao:'Pagamento combinado',vencimento:'2026-09-10',valor:50,tags:['data-acordada']},
 ].map(r=>prepararTituloContas(r,'receber','2026-09-08')))
 await vm.runInContext("renderContas('receber')",context)
 assert.match(page.innerHTML,/Data a confirmar/)
 assert.match(page.innerHTML,/Próximos 30 dias <b class="money">50.00/)
 assert.match(page.innerHTML,/total com data futura <b class="money">50.00/)
 assert.doesNotMatch(page.innerHTML,/38d em atraso/)
 vm.runInContext("exportContasCsv('receber')",context)
 const crCsv=await exported!.text();assert.match(crCsv,/Pagamento confirmado/);assert.match(crCsv,/Data a confirmar/)
 assert.ok(crCsv.split('\n').find(l=>l.includes('Cobrança sem promessa'))!.includes(';"";"100,00"'))
})
