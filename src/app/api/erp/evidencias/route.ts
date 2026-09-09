import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'
import { leituraCompleta } from '@/lib/erp-leitura'
import { evidenciaTitulo, type MovimentoEvidencia, type ProvaBancaria, type RateioBancario } from '@/lib/erp-evidencias'

export async function GET(req:NextRequest) {
  const g=await guard(req);if(g.error)return g.error
  const id=req.nextUrl.searchParams.get('id'),modo=req.nextUrl.searchParams.get('modo')
  if(!id||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)||!['pagar','receber'].includes(modo||''))return fail('Título e tipo inválidos')
  try {
    const sb=admin(),table=modo==='pagar'?'erp_contas_pagar':'erp_contas_receber'
    const select=modo==='pagar'?'id,valor_pago,origem,tags':'id,valor_recebido,origem,tags'
    const {data:t,error}=await sb.from(table).select(select).eq('id',id).single()
    if(error)return fail(error.message,404)
    // Leituras paginadas completas: ausência de uma página não vira ausência de prova.
    const [m,r,p]=await Promise.all([
      leituraCompleta<MovimentoEvidencia>(()=>sb.from('erp_movimentos_bancarios').select('id,valor,data,tipo,conta_bancaria_id,conta_pagar_id,conta_receber_id')),
      leituraCompleta<RateioBancario>(()=>sb.from('erp_movimento_rateios').select('*')),
      leituraCompleta<ProvaBancaria>(()=>sb.from('erp_movimento_evidencias').select('*')),
    ])
    return ok(evidenciaTitulo(t,modo as 'pagar'|'receber',m.data,r.data,p.data))
  }catch(e){return fail((e as Error).message,500)}
}
