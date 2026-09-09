import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { evidenciaTitulo, provaVigente, type MovimentoEvidencia, type ProvaBancaria, type RateioBancario } from '../src/lib/erp-evidencias'
const m:MovimentoEvidencia={id:'pix',valor:100,data:'2026-08-10',tipo:'entrada',conta_bancaria_id:'banco',conta_receber_id:'a'}
const p:ProvaBancaria={movimento_id:'pix',valor:100,data_bancaria:'2026-08-10',tipo:'entrada',conta_bancaria_id:'banco',alcance:'individual',documento:'extrato.pdf',sha256:'a'.repeat(64)}
const rates:RateioBancario[]=[{movimento_id:'pix',conta_receber_id:'a',valor:30,fundamento:'cadastrado'},{movimento_id:'pix',conta_receber_id:'b',valor:70,fundamento:'cadastrado'}]
test('um PIX para dois títulos não é duplicado nem imputado inteiro ao maior',()=>{
 const a=evidenciaTitulo({id:'a',valor_recebido:30},'receber',[m],rates,[p])
 const b=evidenciaTitulo({id:'b',valor_recebido:70},'receber',[m],rates,[p])
 assert.equal(a.vinculado+b.vinculado,100);assert.equal(a.diferenca,0);assert.equal(b.diferenca,0)
 assert.equal(a.grau,'rateio_cadastrado');assert.equal(b.grau,'rateio_cadastrado')
 assert.equal(evidenciaTitulo({id:'a',valor_recebido:30},'receber',[m],[],[p]).grau,'divergente')
})
test('documento fica sem efeito se valor, conta, sentido ou data mudarem',()=>{
 for(const changed of [{...m,valor:101},{...m,tipo:'saida'},{...m,data:'2026-08-11'},{...m,conta_bancaria_id:'outra'}])assert.equal(provaVigente(changed,p),false)
 assert.equal(evidenciaTitulo({id:'a',valor_recebido:100},'receber',[m],[],[{...p,data_bancaria:'2026-08-11'}]).grau,'pendente')
})
test('diferenças, estornos, grupos e parcelas sem fundamento não recebem selo de certeza',()=>{
 assert.equal(evidenciaTitulo({id:'a',valor_recebido:100},'receber',[{...m,tipo:'saida'}],[],[p]).grau,'divergente')
 assert.equal(evidenciaTitulo({id:'a',valor_recebido:100},'receber',[m],[],[{...p,alcance:'grupo'}]).grau,'conferido_em_grupo')
 assert.equal(evidenciaTitulo({id:'a',valor_recebido:30},'receber',[m],[{...rates[0],fundamento:'divergente'},rates[1]],[p]).grau,'rateio_pendente')
 assert.equal(evidenciaTitulo({id:'a',valor_recebido:100},'receber',[m],[{...rates[0],valor:100},rates[1]],[p]).grau,'divergente')
 assert.equal(evidenciaTitulo({id:'a',valor_recebido:100},'receber',[],[],[]).grau,'pendente')
 assert.equal(evidenciaTitulo({id:'a',valor_recebido:0},'receber',[],[],[]).grau,'sem_liquidacao')
})
test('pagamentos parciais e vários bancos somam apenas o valor baixado',()=>{
 const a=evidenciaTitulo({id:'a',valor_recebido:150},'receber',[m,{...m,id:'pix2',valor:50}],[],[p,{...p,movimento_id:'pix2',valor:50}])
 assert.equal(a.grau,'conferido');assert.equal(a.liquidado,150);assert.equal(a.com_prova_bancaria,150)
 const b=evidenciaTitulo({id:'a',valor_recebido:150},'receber',[m,{...m,id:'pix2',valor:50}],[],[p])
 assert.equal(b.grau,'pendente');assert.equal(b.com_prova_bancaria,100)
})
test('detalhe do título mostra parcela própria, ressalva e falha de consulta sem afirmar certeza',async()=>{
 const src=fs.readFileSync('src/app/erp/erp.html','utf8').match(/<script>([\s\S]*?)<\/script>/)![1]
 const ast=ts.createSourceFile('erp.js',src,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
 const fn=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='carregarEvidenciasTitulo')!.getText(ast)
 const box={innerHTML:'',textContent:''};let fail=false
 const e=evidenciaTitulo({id:'a',valor_recebido:30},'receber',[m],[{...rates[0],fundamento:'divergente',evidencia:{ressalva:'<b>Fonte conflitante</b>'}},rates[1]],[p])
 const ctx=vm.createContext({api:async()=>{if(fail)throw new Error('offline');return e},document:{getElementById:()=>box},encodeURIComponent,fmtDate:(d:string)=>d,fmtBRL:(v:number)=>v.toFixed(2),escapeHtml:(s:string)=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;')})
 vm.runInContext(fn,ctx);await vm.runInContext("carregarEvidenciasTitulo('receber','a')",ctx)
 assert.match(box.innerHTML,/30.00 neste título/);assert.match(box.innerHTML,/movimento total 100.00/)
 assert.match(box.innerHTML,/precisa de confirmação/);assert.match(box.innerHTML,/&lt;b&gt;Fonte conflitante/)
 fail=true;await vm.runInContext("carregarEvidenciasTitulo('receber','a')",ctx)
 assert.match(box.textContent,/não foi validada/)
})
