import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeFluxoCaixa, computeDre, computeErpDashboard } from '../src/lib/erp-dashboards'
import { computeFluxoDetalhe } from '../src/lib/erp-fluxo-detalhe'
import { computePrevistoRealizado } from '../src/lib/erp-previsto-realizado'
import { cenarioComReservas, pendenciaPrevisao, tituloNaCurva } from '../src/lib/erp-previsao'
import { prepararTituloContas } from '../src/lib/erp-contas'
import { aplicarPrazoComissao } from '../src/lib/erp-comissoes-prazo-adaptador'

type Row = Record<string, any>
/** Query in memory applies projections and pagination: omitted SELECT fields
 * and totals that accidentally stop at the first page cannot pass unnoticed. */
function memory(tables: Record<string, Row[]>): SupabaseClient {
  return {from(table:string){
    let rows=[...(tables[table]||[])], cols='*', start=0, end=Infinity
    const q:any={
      select(c:string){cols=c;return q}, range(a:number,b:number){start=a;end=b;return q},
      eq(k:string,v:any){rows=rows.filter(r=>r[k]===v);return q},
      neq(k:string,v:any){rows=rows.filter(r=>r[k]!==v);return q},
      is(k:string,v:any){rows=rows.filter(r=>(r[k]??null)===v);return q},
      in(k:string,v:any[]){rows=rows.filter(r=>v.includes(r[k]));return q},
      gte(k:string,v:any){rows=rows.filter(r=>r[k]!=null&&r[k]>=v);return q},
      lte(k:string,v:any){rows=rows.filter(r=>r[k]!=null&&r[k]<=v);return q},
      or(s:string){if(s==='origem.is.null,origem.neq.sintetico')rows=rows.filter(r=>r.origem!=='sintetico');else throw Error(s);return q},
      order(k:string,o:any={}){rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(o.ascending===false?-1:1));return q},
      limit(n:number){end=n-1;return q},
      then(resolve:any,reject:any){
        const data=rows.slice(start,end+1).map(r=>cols==='*'||cols.includes('(')?r:Object.fromEntries(cols.split(',').map(c=>[c,r[c]])))
        return Promise.resolve({data,error:null}).then(resolve,reject)
      }
    };return q
  }} as unknown as SupabaseClient
}
const base={valor:0,desconto:0,juros:0,multa:0,valor_pago:0,valor_recebido:0,status:'aberto',origem:'real',tags:[],substituido_por:null,fechamento_id:null,apuracao:{},vencimento:null}
const cp=(id:string,valor:number,extra:Row={})=>({...base,id,descricao:id,valor,categoria_id:'desp',...extra})
const cr=(id:string,valor:number,extra:Row={})=>({...base,id,descricao:id,valor,categoria_id:'rec',...extra})
const mov=(id:string,valor:number,tipo:string,data:string,extra:Row={})=>({id,valor,tipo,data,categoria_id:tipo==='entrada'?'rec':'desp',conta_bancaria_id:'banco',transferencia_par_id:null,...extra})
function fixture():Record<string,Row[]> {return {
  erp_categorias:[{id:'rec',nome:'Receitas',tipo:'receita',dre_grupo:'receita'},{id:'desp',nome:'Comissões',tipo:'despesa',dre_grupo:'custo_direto'},{id:'transfer',nome:'Entre contas',tipo:'despesa',dre_grupo:'ignorar'}],
  erp_contas_bancarias:[{id:'banco',nome:'Sicoob',saldo_atual:18168.18,ativo:true}],
  erp_movimentos_bancarios:[mov('reembolso',10874.24,'saida','2026-09-04')],
  erp_contas_receber:[cr('JMP',165667.50,{vencimento:'2026-09-10',tags:['data-acordada']}),cr('Naviraí',18374.25,{vencimento:'2026-09-10',tags:['data-acordada']}),cr('sem-data',100000,{vencimento:'2026-09-10'}),cr('vencido',300,{vencimento:'2026-09-08',tags:['data-acordada']})],
  erp_contas_pagar:[
    cp('Rusa',65635,{vencimento:'2026-09-25',apuracao:{natureza:'obrigacao',valor_situacao:'confirmado',competencia_fim:'2026-08-31'}}),
    cp('ISS',4873.43,{vencimento:'2026-09-15'}),
    cp('Felipe',157384.13,{apuracao:{natureza:'obrigacao',valor_situacao:'confirmado',condicao:{tipo:'recebimento',titulos_ids:['JMP'],descricao:'Após a segunda parcela JMP'}}}),
    cp('Marcelo',63500,{apuracao:{natureza:'obrigacao',valor_situacao:'a_apurar',prazo_situacao:'condicionado_ao_caixa',previsao_mes:'2026-09-01',condicao_pagamento:'Em setembro, conforme caixa'}}),
    cp('DAS',0,{apuracao:{natureza:'em_verificacao',sem_valor:true,previsao_mes:'2026-09-01'}}),
    cp('Adilson',0,{apuracao:{sem_valor:true}}),
    cp('Honorários',1058,{vencimento:'2026-09-04',apuracao:{pagamento_situacao:'informado'}}),
    cp('Site',218.30,{vencimento:'2026-09-10',apuracao:{pagamento_situacao:'informado'}}),
    cp('Projeção outubro',5000,{vencimento:'2026-10-05',origem:'estimativa',tags:['orcamento'],apuracao:{natureza:'projecao'}}),
    cp('sintético',999999,{vencimento:'2026-09-10',origem:'sintetico'}),
    cp('substituído',999999,{vencimento:'2026-09-10',substituido_por:'Rusa'}),
    cp('cancelado',999999,{vencimento:'2026-09-10',status:'cancelado'}),
    cp('transferência',999999,{vencimento:'2026-09-10',categoria_id:'transfer'})
  ],bula_leilao_fechamento:[],erp_lancamentos:[]
}}
function clock(t:any){t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-09T15:00:00Z')})}
test('setembro: curva, reservas e pendências preservam dimensões independentes',async t=>{
  clock(t);const tables=fixture(), sb=memory(tables)
  const d=await computeFluxoCaixa(sb,{dias:60,passado:30,incluirOrcamento:false})
  assert.equal(d.serie.reduce((s,r)=>s+r.entrada_prev,0),184041.75)
  assert.equal(d.serie.reduce((s,r)=>s+r.saida_prev,0),70508.43)
  assert.equal(d.serie.find(r=>r.data==='2026-09-09')!.entrada_prev,0,'vencido não migra para hoje')
  assert.equal(d.serie.at(-1)!.saldo,131701.5)
  assert.deepEqual(d.cenario_reservas,{reserva_condicionada:220884.13,saldo_apos_reservas:-89182.63,titulos_condicionados:2,reservas_em_apuracao:1,valores_a_definir:2})
  const marcelo=d.pendencias_previsao.find(p=>p.id==='Marcelo')!
  assert.equal(marcelo.situacao,'em_apuracao');assert.equal(marcelo.condicionado,true);assert.equal(marcelo.mes,'2026-09')
  assert.equal(d.pendencias_previsao.find(p=>p.id==='sem-data')!.mes,null)
  assert.equal(d.pendencias_previsao.find(p=>p.id==='DAS')!.valor,null)
  assert.equal(d.pendencias_previsao.filter(p=>p.situacao==='quitacao_informada').reduce((s,p)=>s+p.valor!,0),1276.30)
  assert.equal(d.cobertura_caixa.ultima_data_movimento,'2026-09-04')
  assert.equal(d.cobertura_caixa.por_conta.banco,'2026-09-04')
  const apiTitulo=prepararTituloContas(tables.erp_contas_pagar.find(x=>x.id==='Marcelo') as any,'pagar','2026-09-09')
  assert.equal(apiTitulo.financeiro.na_curva,false);assert.equal(apiTitulo.financeiro.apuracao!.condicionado,true)
})
test('cada célula e detalhe usam o mesmo cenário, exclusões e paginação',async t=>{
  clock(t);const tables=fixture()
  tables.erp_contas_pagar.push(...Array.from({length:1101},(_,i)=>cp('micro'+i,1,{vencimento:'2026-09-12'})))
  for(const incluirOrcamento of [true,false]){
    const d=await computeFluxoCaixa(memory(tables),{dias:60,passado:30,gran:'mes',incluirOrcamento})
    for(const linha of [...d.matriz.receitas,...d.matriz.despesas]) for(const [i,b] of d.matriz.buckets.entries()){
      const det=await computeFluxoDetalhe(memory(tables),{categoria:linha.categoria_id,de:b.from,ate:b.to,incluirOrcamento})
      assert.equal(det.realizado.total,linha.realizado[i]);assert.equal(det.previsto.total,linha.previsto[i])
      assert.ok(!det.previsto.itens.some(r=>['Site','Honorários','sintético','substituído','cancelado','transferência','sem-data','vencido'].includes(r.id!)))
    }
    assert.equal(d.orcamento_previsto.saida,incluirOrcamento?5000:0)
  }
})
test('previsto integral mantém pagamento parcial; realizado só movimento do mês',async t=>{
  clock(t);const tables=fixture()
  tables.erp_contas_pagar=[cp('parcial',100,{vencimento:'2026-09-10',valor_pago:60,status:'parcial'}),...tables.erp_contas_pagar.filter(x=>['Marcelo','DAS','Projeção outubro'].includes(x.id))]
  tables.erp_movimentos_bancarios=[mov('agosto',40,'saida','2026-08-28'),mov('setembro',20,'saida','2026-09-04'),mov('futuro',999,'saida','2026-09-30'),mov('transfer',999,'saida','2026-09-04',{categoria_id:'transfer'})]
  const r=await computePrevistoRealizado(memory(tables),2026)
  assert.equal(r.meses[8].prev_saida,100);assert.equal(r.meses[8].real_saida,20)
  assert.equal(r.meses[8].prev_entrada,184341.75,'inclui a programação histórica vencida, não a data automática sem acordo')
  assert.equal(r.meses[9].orcamento_saida,5000);assert.equal(r.meses[9].real_saida,null)
  assert.ok(r.pendencias_previsao.some(p=>p.id==='Marcelo'));assert.ok(r.pendencias_previsao.some(p=>p.id==='DAS'&&p.valor===null))
  const dash=await computeErpDashboard(memory(tables),{from:'2026-09-01',to:'2026-09-30'})
  assert.equal(dash.previsto_saida,40,'dashboard descreve saldo restante, distinto da programação integral')
  assert.equal(dash.pago_periodo,20,'não soma baixa acumulada 60 como realização de setembro')
})
test('competência agosto não muda para pagamento setembro; orçamento e legado são explícitos',async t=>{
  clock(t);const tables=fixture()
  tables.erp_contas_pagar=tables.erp_contas_pagar.filter(x=>['Rusa','Projeção outubro'].includes(x.id))
  tables.erp_contas_receber=[cr('receita',100000,{vencimento:'2026-09-10',fechamento_id:'leilao',tags:['data-acordada']}),cr('legado estimado',200,{origem:'estimativa',vencimento:'2026-08-20'})]
  tables.bula_leilao_fechamento=[{id:'leilao',data:'2026-08-01'}]
  const ago=await computeDre(memory(tables),{from:'2026-08-01',to:'2026-08-31',regime:'competencia'})
  assert.equal(ago.receitas,100200);assert.equal(ago.despesas,65635)
  assert.equal(ago.receitas_com_origem_estimada,1);assert.equal(ago.resultado_provisorio,true)
  const set=await computeDre(memory(tables),{from:'2026-09-01',to:'2026-09-30',regime:'competencia'})
  assert.equal(set.despesas,0)
  const caixa=await computeDre(memory(tables),{from:'2026-09-01',to:'2026-09-30',regime:'caixa'})
  assert.equal(caixa.despesas,10874.24)
})
test('zero conhecido, valor desconhecido, ajuste útil e pagamento informado não se confundem',()=>{
  assert.equal(pendenciaPrevisao(cp('zero',0) as any,'pagar'),null)
  const unknown=pendenciaPrevisao(cp('desconhecido',0,{apuracao:{sem_valor:true,condicao_pagamento:'caixa',prazo_situacao:'condicionado_ao_caixa'}}) as any,'pagar')!
  assert.equal(unknown.valor,null);assert.equal(unknown.condicionado,true)
  const weekend=cp('25 domingo',500,{vencimento:'2026-10-25',apuracao:{prazo_situacao:'ajuste_dia_util_pendente'}})
  assert.equal(tituloNaCurva(weekend as any,'pagar'),false)
  assert.equal(pendenciaPrevisao(weekend as any,'pagar')!.mes,'2026-10')
  const informed=pendenciaPrevisao(cp('pagamento informado',500,{apuracao:{pagamento_situacao:'informado',prazo_situacao:'condicionado_ao_caixa'}}) as any,'pagar')!
  assert.equal(cenarioComReservas(1000,[unknown,informed]).reserva_condicionada,0)
})
test('UI exibe reserva, referência em apuração, desconhecido e transmite opção de orçamento',()=>{
  const html=readFileSync(new URL('../src/app/erp/erp.html',import.meta.url),'utf8')
  const script=html.slice(html.indexOf('function caixaCoberturaHtml'),html.indexOf('async function fxDetalhe'))
  const ctx:any={fmtBRL:(n:number)=>String(n),fmtDate:(s:string)=>s,escapeHtml:(s:string)=>s};vm.createContext(ctx);vm.runInContext(script,ctx)
  const ps=[pendenciaPrevisao(fixture().erp_contas_pagar.find(x=>x.id==='Marcelo') as any,'pagar')!,pendenciaPrevisao(fixture().erp_contas_pagar.find(x=>x.id==='DAS') as any,'pagar')!]
  const r=ctx.reservasPrevisaoHtml(cenarioComReservas(1000,ps),ps)
  assert.match(r,/63500/);assert.match(r,/referência em apuração/);assert.match(r,/conforme caixa/);assert.match(r,/Não representa caixa livre/)
  const p=ctx.previsaoPendenciasHtml(ps);assert.match(p,/valor a definir/);assert.match(p,/2026-09/)
  assert.match(html,/orcamento=\$\{state.filters.fluxoOrc===false\?0:1\}/)
  assert.match(html,/Saldo cadastrado/);assert.doesNotMatch(html,/>Saldo Hoje</)
  // Parse the full inline application, including nested template expressions.
  for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    const source=ts.createSourceFile('erp.js',m[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
    assert.equal((source as any).parseDiagnostics.length,0)
  }
})

test('novas comissões e edição preservam competência, exceções e evidência de valor',()=>{
  const make=(extra:Row={})=>({...cp('comissão',123,{descricao:'Comissão assessor',apuracao:{natureza:'em_verificacao',sem_valor:true,valor_situacao:'em_disputa'}}),comissao_assessor:true,competencia_comissao:'2026-08',...extra})
  const nova=aplicarPrazoComissao(make()) as any
  assert.equal(nova.vencimento,'2026-09-25');assert.equal(nova.apuracao.competencia_fim,'2026-08-31')
  assert.equal(nova.apuracao.sem_valor,true);assert.equal(nova.apuracao.valor_situacao,'em_disputa')
  assert.equal(nova.apuracao.prazo_situacao,'regra_confirmada')
  assert.ok(!('comissao_assessor' in nova));assert.ok(!('competencia_comissao' in nova))
  assert.throws(()=>aplicarPrazoComissao(make({competencia_comissao:'',emissao:'2026-08-01'})),/competência/)
  for(const [competencia,nominal] of [['2026-09','2026-10-25'],['2026-11','2026-12-25']]){
    const p=aplicarPrazoComissao(make({competencia_comissao:competencia})) as any
    assert.equal(p.vencimento,nominal);assert.equal(p.apuracao.prazo_situacao,'ajuste_dia_util_pendente');assert.equal(tituloNaCurva({...base,...p} as any,'pagar'),false)
  }
  for(const id of ['Felipe','Marcelo']){
    const old=fixture().erp_contas_pagar.find(x=>x.id===id)!
    const p=aplicarPrazoComissao({comissao_assessor:true,competencia_comissao:'2026-08',apuracao:{valor_situacao:'a_apurar'}},old) as any
    assert.ok(!('vencimento' in p));assert.equal(p.apuracao.condicao?.descricao||p.apuracao.condicao_pagamento,old.apuracao.condicao?.descricao||old.apuracao.condicao_pagamento)
  }
  const especial=aplicarPrazoComissao(make({vencimento:'2026-09-24',excecao_prazo_comissao:true,fonte_prazo_comissao:'Acerto do financeiro com o assessor'})) as any
  assert.equal(especial.vencimento,'2026-09-24');assert.ok(especial.tags.includes('data-acordada'))
  assert.equal((aplicarPrazoComissao({observacoes:'Documento adicional'},especial) as any).apuracao.regra_vencimento.aplicacao,'prazo_especifico_preservado')
  assert.throws(()=>aplicarPrazoComissao(make({vencimento:'2026-02-31',excecao_prazo_comissao:true,fonte_prazo_comissao:'Acerto inválido'})),/data válida/)
  const nane=aplicarPrazoComissao(make({apuracao:{beneficiario:'Nane'}})) as any
  assert.equal(nane.apuracao.previsao_mes,'2026-12-01');assert.equal(nane.vencimento,null)
  const naneComDefault=aplicarPrazoComissao(make({vencimento:'2026-09-09',apuracao:{beneficiario:'Nane'}})) as any
  assert.equal(naneComDefault.vencimento,null,'dia preenchido sem fonte não substitui o acerto de dezembro')
  const naneComAcerto=aplicarPrazoComissao(make({vencimento:'2026-12-18',apuracao:{beneficiario:'Nane'},excecao_prazo_comissao:true,fonte_prazo_comissao:'Acerto específico com Nane em dezembro'})) as any
  assert.equal(naneComAcerto.vencimento,'2026-12-18');assert.equal(naneComAcerto.apuracao.regra_vencimento.data_operacional,'2026-12-18')
  const domingo=aplicarPrazoComissao(make({competencia_comissao:'2026-09',apuracao:{natureza:'obrigacao',valor_situacao:'confirmado',pendencias:['Conferir documento comercial']}})) as any
  const ajustada=aplicarPrazoComissao({vencimento:'2026-10-23',excecao_prazo_comissao:true,fonte_prazo_comissao:'Financeiro confirmou sexta-feira anterior'},domingo) as any
  assert.equal(ajustada.apuracao.prazo_situacao,'prazo_especifico')
  assert.equal(ajustada.apuracao.regra_vencimento.data_nominal,'2026-10-25')
  assert.equal(ajustada.apuracao.regra_vencimento.data_operacional,'2026-10-23')
  assert.equal(ajustada.apuracao.regra_vencimento.direcao_ajuste,'anterior')
  assert.equal(tituloNaCurva({...base,...domingo,...ajustada} as any,'pagar'),true)
  assert.ok(!ajustada.tags.includes('ajuste-dia-util-pendente'))
  assert.deepEqual(ajustada.apuracao.pendencias,['Conferir documento comercial'])
  assert.equal(ajustada.apuracao.pendencias_prazo_superadas.length,1)
  const controle=aplicarPrazoComissao({observacoes:'Controle'},make({apuracao:{competencia_fim:'2026-08-31',regra_vencimento:{elegibilidade:'comissao_assessor',aplicacao:'controle_sem_nova_obrigacao'}}})) as any
  assert.ok(!('previsao_mes' in controle.apuracao));assert.equal(controle.vencimento??null,null)
})

test('snapshot privado: coerência dos painéis após a programação aplicada',{skip:!process.env.ERP_SNAPSHOT_QA},async t=>{
  clock(t)
  const snapshot=JSON.parse(readFileSync(process.env.ERP_SNAPSHOT_QA!,'utf8'))
  const tables=snapshot.data as Record<string,Row[]>
  for(const rows of Object.values(tables))for(const r of rows)for(const k of ['vencimento','emissao','data','data_pagamento','data_recebimento'])if(typeof r[k]==='string')r[k]=r[k].slice(0,10)
  const fluxo=await computeFluxoCaixa(memory(tables),{dias:60,passado:30})
  const fluxoSemOrc=await computeFluxoCaixa(memory(tables),{dias:60,passado:30,incluirOrcamento:false})
  const dashboard=await computeErpDashboard(memory(tables),{from:'2026-09-01',to:'2026-09-30'})
  const previsto=await computePrevistoRealizado(memory(tables),2026)
  const dreAgosto=await computeDre(memory(tables),{from:'2026-08-01',to:'2026-08-31',regime:'competencia'})
  const dreSetembro=await computeDre(memory(tables),{from:'2026-09-01',to:'2026-09-30',regime:'caixa'})
  assert.equal(fluxo.cenario_reservas.reserva_condicionada,220884.13)
  const dia10=fluxo.serie.find(r=>r.data==='2026-09-10')!
  assert.equal(dia10.entrada_prev,184041.75)
  for(const linha of [...fluxo.matriz.receitas,...fluxo.matriz.despesas])for(const [i,b] of fluxo.matriz.buckets.entries()){
    const det=await computeFluxoDetalhe(memory(tables),{categoria:linha.categoria_id,de:b.from,ate:b.to})
    assert.equal(det.realizado.total,linha.realizado[i]);assert.equal(det.previsto.total,linha.previsto[i])
  }
  const report={snapshot:snapshot.capturado_em,fluxo,fluxo_sem_orcamento:fluxoSemOrc,dashboard,previsto,dre_agosto:dreAgosto,dre_setembro_caixa:dreSetembro}
  if(process.env.ERP_QA_OUTPUT)writeFileSync(process.env.ERP_QA_OUTPUT,JSON.stringify(report,null,2))
})
