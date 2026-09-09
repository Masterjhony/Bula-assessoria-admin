export interface MovimentoEvidencia {
  id: string; valor: number | string; data: string; tipo: string; conta_bancaria_id: string
  conta_pagar_id?: string | null; conta_receber_id?: string | null
}
export interface ProvaBancaria {
  movimento_id: string; valor: number | string; data_bancaria: string; tipo: string
  conta_bancaria_id: string; alcance: 'individual' | 'grupo'; documento: string; sha256: string
}
export interface RateioBancario {
  movimento_id: string; valor: number | string; conta_pagar_id?: string | null; conta_receber_id?: string | null
  fundamento: 'documentado' | 'cadastrado' | 'divergente'; evidencia?: { ressalva?: string }
}
export interface TituloEvidencia { id: string; valor_pago?: number | string; valor_recebido?: number | string; origem?: string | null; tags?: string[] | null }
const cents=(n: number|string|undefined)=>{
  const v=Number(n??0),c=Math.round(v*100)
  if(!Number.isFinite(v)||!Number.isSafeInteger(c))throw new Error('Valor inválido na evidência financeira')
  return c
}
/** A prova vale apenas para o fato bancário capturado; não para sua finalidade. */
export function provaVigente(m: MovimentoEvidencia,p?: ProvaBancaria) {
  return !!p && p.movimento_id===m.id && p.conta_bancaria_id===m.conta_bancaria_id && p.tipo===m.tipo && p.data_bancaria.slice(0,10)===m.data.slice(0,10) && cents(p.valor)===cents(m.valor)
}
/** Rateio explícito substitui o vínculo legado; nunca soma os dois caminhos. */
export function evidenciaTitulo(t: TituloEvidencia,modo:'pagar'|'receber',movimentos:MovimentoEvidencia[],rateios:RateioBancario[],provas:ProvaBancaria[]) {
  const field=modo==='pagar'?'conta_pagar_id':'conta_receber_id',sentido=modo==='pagar'?'saida':'entrada'
  const proofMap=new Map(provas.map(p=>[p.movimento_id,p])),groups=new Map<string,RateioBancario[]>()
  for(const r of rateios){const g=groups.get(r.movimento_id)||[];g.push(r);groups.set(r.movimento_id,g)}
  const vinculos=[]
  let vinculado=0,comProva=0,comGrupo=0,invalido=false,rateioPendente=false,rateioDivergente=false
  for(const m of movimentos){
    const all=groups.get(m.id)||[],mine=all.filter(r=>r[field]===t.id)
    if(all.length&&!mine.length)continue
    if(!all.length&&m[field]!==t.id)continue
    const valor=all.length?mine.reduce((s,r)=>s+cents(r.valor),0):cents(m.valor)
    const ruim=m.tipo!==sentido||valor<=0||all.reduce((s,r)=>s+cents(r.valor),0)>cents(m.valor)
    invalido ||= ruim
    const p=proofMap.get(m.id),valid=provaVigente(m,p)&&!ruim
    vinculado+=valor
    if(valid)comProva+=valor
    if(valid&&p!.alcance==='grupo')comGrupo+=valor
    rateioPendente ||= mine.some(r=>r.fundamento!=='documentado')
    rateioDivergente ||= mine.some(r=>r.fundamento==='divergente')
    vinculos.push({movimento_id:m.id,data:m.data.slice(0,10),valor_movimento:cents(m.valor)/100,valor_titulo:valor/100,
      rateado:all.length>0,prova:valid?p!.alcance:p?'desatualizada':'ausente',documento:valid?p!.documento:null,
      ressalvas:mine.map(r=>r.evidencia?.ressalva).filter(Boolean)})
  }
  const liquidado=cents(modo==='pagar'?t.valor_pago:t.valor_recebido),delta=vinculado-liquidado
  const grau=invalido||delta!==0&&vinculos.length>0?'divergente':liquidado===0?'sem_liquidacao':comProva!==liquidado?'pendente':rateioDivergente?'rateio_pendente':rateioPendente?'rateio_cadastrado':comGrupo?'conferido_em_grupo':'conferido'
  const texto={divergente:'Vínculos e baixa precisam de revisão',sem_liquidacao:'Sem liquidação para conferir',conferido_em_grupo:'Valor liquidado confere; há identificação bancária em grupo',conferido:'Valor liquidado confere com o extrato',pendente:'Liquidação ainda sem comprovação bancária integral',rateio_pendente:'Pagamento em lote confirmado; atribuição desta parcela precisa de confirmação',rateio_cadastrado:'Pagamento em lote confirmado; rateio cadastral fecha com as baixas'}[grau]
  return {grau,texto,liquidado:liquidado/100,vinculado:vinculado/100,com_prova_bancaria:comProva/100,diferenca:delta/100,rateio_pendente:rateioPendente,
    fundamento_comercial:'Valor devido, beneficiário, competência e empresa responsável exigem documentação própria. A conferência bancária não os certifica.',vinculos}
}
