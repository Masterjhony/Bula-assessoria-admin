import {programarComissao,FONTE_REGRA,type TituloComissao,type ApuracaoComissao} from './erp-comissoes-prazo'
import type { SupabaseClient } from '@supabase/supabase-js'
const categoriaComissao='d53cf26d-af3b-406f-8a6d-b46dcd65d78e'
const record=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{}
const str=(x:unknown)=>typeof x==='string'?x:''
const normal=(x:unknown)=>str(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const pendenciaCompetencia='Identificar a competência da comissão ou vincular fechamento com data. Emissão e data preenchida sem acerto não definem o ciclo do dia 25.'

/** POST/PATCH: contexto adicional só pode vir do fechamento/fornecedor consultado no banco. */
export function aplicarPrazoComissao(
 body:Record<string,unknown>,atual?:Record<string,unknown>,
 consultado:{dataFechamento?:string;fechamentoId?:string;nomeFornecedor?:string}={}
):Record<string,unknown>{
 const {comissao_assessor:marcada,competencia_comissao:mesInformado,excecao_prazo_comissao:excecaoPedida,fonte_prazo_comissao:fonte,...patch}=body
 const a={...record(atual?.apuracao),...record(body.apuracao)} as ApuracaoComissao
 if(body.apuracao!==undefined)patch.apuracao=a
 const regra=record(a.regra_vencimento)
 const merged={...atual,...patch,apuracao:a} as TituloComissao
 const tags=Array.isArray(merged.tags)?merged.tags:[]
 const elegivel=marcada===true||regra.elegibilidade==='comissao_assessor'||tags.includes('comissao')||merged.categoria_id===categoriaComissao
 if(!elegivel)return patch
 if(mesInformado){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(str(mesInformado)))throw Error('Competência da comissão inválida')
  if(!a.competencia_fim?.startsWith(str(mesInformado))&&!a.competencia_inicio?.startsWith(str(mesInformado))){
   a.competencia_inicio=str(mesInformado)+'-01'
   a.competencia_fim=new Date(Date.UTC(Number(str(mesInformado).slice(0,4)),Number(str(mesInformado).slice(5,7)),0)).toISOString().slice(0,10)
   a.fontes=[...(a.fontes||[]),{tipo:'conferencia_financeiro',ref:'Competência informada no formulário de comissão',trecho:str(mesInformado),data:new Date().toISOString()}]
  }
 }
 const beneficiario=str(a.beneficiario)||str(merged.vendedor)||consultado.nomeFornecedor||''
 const nome=normal(beneficiario)
 const repasseEspecial=/^repasse\b/.test(normal(merged.descricao))||
  (/(?:marcelo carneiro|remuneracao de socio)/.test(normal(merged.descricao))&&!/^comissao\b/.test(normal(merged.descricao)))
 if(merged.substituido_por||['pago','cancelado'].includes(merged.status||'')||a.condicao||a.prazo_situacao==='condicionado_ao_caixa'||repasseEspecial)return patch
 let excecao=str(regra.aplicacao)
 if(nome==='nane'||regra.excecao==='nane_acumulado_dezembro')excecao='nane_dezembro'
 else if(/\bnane\b/.test(nome)||/\bnane\b/.test(normal(merged.descricao))||regra.aplicacao==='depende_beneficiario')excecao='beneficiario_com_prazo_alternativo'
 else if(a.prazo_situacao==='excecao_documentada'||regra.aplicacao==='prazo_especifico_preservado')excecao='prazo_especifico'
 if(excecaoPedida!==undefined&&typeof excecaoPedida!=='boolean')throw Error('Exceção de prazo inválida')
 if(excecaoPedida===true){
  if(!str(fonte).trim()||str(fonte).trim().length<8)throw Error('Informe o documento ou acerto que sustenta o prazo específico da comissão')
  const data=str(merged.vencimento).slice(0,10),parsed=new Date(data+'T12:00:00Z')
  if(!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(data)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==data)throw Error('Informe uma data válida para o prazo específico')
  excecao='prazo_especifico'
  a.fontes=[...(a.fontes||[]),{tipo:'conferencia_financeiro',ref:str(fonte).trim(),trecho:'Exceção específica à regra de pagamento de comissão dia25.',data:new Date().toISOString()}]
  merged.tags=[...new Set([...tags,'data-acordada'])]
 }
 const dia=a.competencia_fim||a.competencia_inicio||consultado.dataFechamento
 const competencia=str(dia).slice(0,7)
 const competenciaFonte=a.competencia_fim?'apuracao.competencia_fim':a.competencia_inicio?'apuracao.competencia_inicio':consultado.dataFechamento&&consultado.fechamentoId?'bula_leilao_fechamento:'+consultado.fechamentoId+':data':null
 if(!competenciaFonte||!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)){
  a.pendencias=[...new Set([...(a.pendencias||[]),pendenciaCompetencia])]
  const especificoComFonte=excecaoPedida===true||((merged.tags||[]).includes('data-acordada')
   && (a.fontes||[]).some(f=>f.ref&&f.ref!==FONTE_REGRA.ref))
  if(especificoComFonte){
   a.prazo_situacao='prazo_especifico'
   a.competencia_em_verificacao=true
   return {...patch,apuracao:a,tags:merged.tags}
  }
  const anterior=str(merged.vencimento).slice(0,10)
  if(anterior)a.data_referencia_anterior=anterior
  a.prazo_situacao='competencia_em_verificacao'
  return {...patch,vencimento:null,apuracao:a,tags:(merged.tags||[]).filter(tag=>tag!=='data-acordada')}
 }
 if((a.pendencias||[]).includes(pendenciaCompetencia)){
  a.pendencias=(a.pendencias||[]).filter(p=>p!==pendenciaCompetencia)
  a.pendencias_prazo_superadas=[...new Set([...(Array.isArray(a.pendencias_prazo_superadas)?a.pendencias_prazo_superadas:[]),pendenciaCompetencia])]
  delete a.competencia_em_verificacao
 }
 const result=programarComissao(merged,{comissao_assessor:true,competencia,competencia_fonte:competenciaFonte,beneficiario,excecao,repasse_especial:repasseEspecial})
 if(result.acao==='preservar')return patch
 return {...patch,...result.patch}
}

/** O relacionamento é consultado no servidor, sem aceitar data externa como
 * se fosse a data do fechamento persistido. Não executa nenhuma escrita. */
export async function prepararPrazoComissao(sb:SupabaseClient,body:Record<string,unknown>,atual?:Record<string,unknown>) {
 const t={...atual,...body}
 const [fechamento,pessoa]=await Promise.all([
  t.fechamento_id?sb.from('bula_leilao_fechamento').select('id,data').eq('id',String(t.fechamento_id)).single():Promise.resolve({data:null,error:null}),
  t.fornecedor_id?sb.from('erp_pessoas').select('nome').eq('id',String(t.fornecedor_id)).single():Promise.resolve({data:null,error:null}),
 ])
 if(fechamento.error)throw Error(fechamento.error.message)
 if(pessoa.error)throw Error(pessoa.error.message)
 const patch=aplicarPrazoComissao(body,atual,{
  dataFechamento:fechamento.data?.data,fechamentoId:fechamento.data?.id,nomeFornecedor:pessoa.data?.nome,
 })
 if(Number(body.total_parcelas||1)>1&&record(record(patch.apuracao).regra_vencimento).aplicacao==='regra_geral'){
  throw Error('Comissão parcelada precisa de prazo específico e fonte do acerto; o dia 25 não define o calendário das demais parcelas')
 }
 return patch
}
