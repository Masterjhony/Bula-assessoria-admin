/** Detalhe de uma célula: mesmas datas, exclusões e opção de orçamento da matriz. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { hojeFinanceiro } from '@/lib/erp-contas'
import { leituraCompleta } from '@/lib/erp-leitura'
import { diaNaCurva, type TituloPrevisao } from '@/lib/erp-previsao'
import { compromissoFuturo, devido, ehTransferencia } from '@/lib/verdade/fatos'

export async function computeFluxoDetalhe(sb: SupabaseClient, opts: {categoria:string;de:string;ate:string;incluirOrcamento?:boolean}) {
  const {categoria,de,ate} = opts
  if (!categoria || !de || !ate) throw new Error('categoria, de e ate sao obrigatorios')
  const incluirOrcamento = opts.incluirOrcamento !== false, hoje = hojeFinanceiro()
  const semCategoria = categoria.startsWith('sem-')
  const tipoSem = categoria === 'sem-entrada' ? 'entrada' : 'saida'
    const {data:cats} = await leituraCompleta(() => sb.from('erp_categorias').select('id,dre_grupo'))
    const dre = {dreGrupo:new Map<string,string>(cats.filter(c=>c.dre_grupo).map(c=>[c.id,c.dre_grupo]))}
    const {data:rawMovs} = await leituraCompleta(() => {
      let q = sb.from('erp_movimentos_bancarios').select('id,data,tipo,valor,descricao,conta_pagar_id,conta_receber_id,categoria_id,transferencia_par_id')
        .gte('data', de).lte('data', ate < hoje ? ate : hoje).in('tipo',['entrada','saida'])
      q = semCategoria ? q.is('categoria_id', null) : q.eq('categoria_id', categoria)
      if (semCategoria) q = q.eq('tipo',tipoSem)
      return q
    })
    const movs = rawMovs.filter(m=>!ehTransferencia(m,dre)).sort((a,b)=>String(a.data).localeCompare(String(b.data)))
    const previstos: {id:string|null;descricao:string|null;vencimento:string;valor:number;natureza:string;status:string;origem:string|null;tags:string[]|null;projetado:boolean;vencido:boolean}[] = []
    for (const [tabela, chave, natureza, modo] of [
      ['erp_contas_pagar','valor_pago','saida','pagar'],
      ['erp_contas_receber','valor_recebido','entrada','receber'],
    ] as const) {
      if (semCategoria && tipoSem !== natureza) continue
      const cols = `id,descricao,valor,desconto,juros,multa,vencimento,status,origem,tags,substituido_por,categoria_id,${chave}${modo==='pagar'?',apuracao':''}`
      const {data} = await leituraCompleta(() => {
        const q = sb.from(tabela).select(cols).in('status',['aberto','parcial','vencido'])
          .gte('vencimento',de > hoje ? de : hoje).lte('vencimento',ate)
        return semCategoria ? q.is('categoria_id', null) : q.eq('categoria_id', categoria)
      })
      for (const r of data as unknown as (TituloPrevisao & {categoria_id:string|null})[]) {
        if (ehTransferencia({categoria_id:r.categoria_id,transferencia_par_id:null},dre)) continue
        const dia = diaNaCurva(r, modo, hoje, incluirOrcamento), valor = devido(r,chave)
        if (!dia || dia < de || dia > ate || valor <= 0) continue
        previstos.push({id:r.id||null,descricao:r.descricao||null,vencimento:dia,valor:Math.round(valor*100)/100,
          natureza,status:r.status,origem:r.origem,tags:r.tags,projetado:compromissoFuturo(r),vencido:false})
      }
    }
    previstos.sort((a,b)=>a.vencimento.localeCompare(b.vencimento))
    const somaMov = movs.reduce((s,m)=>s+Number(m.valor||0),0), somaPrev = previstos.reduce((s,p)=>s+p.valor,0)
    const r2 = (n:number)=>Math.round(n*100)/100
    return {categoria,de,ate,incluir_orcamento:incluirOrcamento,
      realizado:{itens:movs,total:r2(somaMov)},previsto:{itens:previstos,total:r2(somaPrev)},total:r2(somaMov+somaPrev)}
}
