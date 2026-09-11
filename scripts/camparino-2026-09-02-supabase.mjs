// Tudo que o Supabase sabe do Camparino: leilões, cronograma, fechamentos (com lances), CR e CP.
// Saída: outputs/camparino-fechamento-2026-09/supabase-camparino.json
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
  .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const j = (x) => JSON.stringify(x)
const out = {}
console.log('### bula_leiloes')
{ const { data, error } = await sb.from('bula_leiloes').select('id,nome,data,horario,local,leiloeira,cronograma_id,status,modelo,tipo,animais,acordo_comissao,catalogo_url,condicao,realizado_bula,meta_bula').ilike('nome','%camparino%').order('data')
  if (error) console.error(error); out.bula_leiloes = data; for (const r of data||[]) console.log(j(r)) }
console.log('### cronograma_leiloes')
{ const { data, error } = await sb.from('cronograma_leiloes').select('*').or('nome.ilike.%camparino%,criador.ilike.%camparino%').order('data')
  if (error) console.error(error); out.cronograma = data; for (const r of data||[]) console.log(j(r)) }
console.log('### bula_leilao_fechamento')
{ const { data, error } = await sb.from('bula_leilao_fechamento').select('*').or('nome.ilike.%camparino%,local.ilike.%camparino%').order('data')
  if (error) console.error(error); out.fechamentos = data; for (const r of data||[]) { const { lances, por_assessor, compradores, por_estado, perfil_genetico, lotes_catalogo, distribuicao_empresa, ...rest } = r; console.log(j(rest)); console.log('  por_assessor:', j(por_assessor)); console.log('  lances:', (lances||[]).length); for (const l of lances||[]) console.log('    ', j(l)) } }
console.log('### erp_contas_receber')
{ const { data, error } = await sb.from('erp_contas_receber').select('id,numero_documento,descricao,valor,valor_recebido,emissao,vencimento,data_recebimento,status,fechamento_id,nota_fiscal,observacoes,origem,evento_key,created_at').ilike('descricao','%camparino%').order('vencimento')
  if (error) console.error(error); out.cr = data; for (const r of data||[]) console.log(j(r)) }
console.log('### erp_contas_pagar')
{ const { data, error } = await sb.from('erp_contas_pagar').select('id,numero_documento,descricao,valor,valor_pago,vencimento,status,fechamento_id,observacoes,origem,evento_key,apuracao').ilike('descricao','%camparino%').order('vencimento')
  if (error) console.error(error); out.cp = data; for (const r of data||[]) console.log(j(r)) }
fs.writeFileSync('outputs/camparino-fechamento-2026-09/supabase-camparino.json', JSON.stringify(out, null, 2))
