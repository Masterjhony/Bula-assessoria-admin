/**
 * FOLHA: vencimento na data REAL de pagamento (18/08/2026).
 *
 * Padrão apurado no extrato conciliado (jan–ago/2026): a folha da competência
 * do mês N sai do banco entre os dias 2 e 6 do mês N+1.
 *   · salário de junho  → pago em 02–06/07 (R$ 41.333,33)
 *   · salário de julho  → pago em 03/08     (R$ 33.100,00)
 *
 * Os títulos, porém, estavam com vencimento no ÚLTIMO DIA DA COMPETÊNCIA
 * (31/07, 31/08...). Efeitos colaterais que isso causava:
 *   · a folha de agosto aparecia como "a pagar em 13 dias" quando na verdade
 *     só sai em setembro — o mês de agosto ficava R$ 33.100 mais pesado;
 *   · virava dívida "vencida" no dia 1º do mês seguinte, sem ter atrasado;
 *   · a leitura do painel ficava incoerente com o extrato (a folha que saiu em
 *     agosto era a de julho, já baixada).
 *
 * Correção: vencimento = dia 5 do mês seguinte à competência (mediana do
 * padrão real), competência preservada na descrição. Só mexe em título EM
 * ABERTO — nada que já foi pago é reescrito.
 *
 * Dry-run por padrão; --apply grava.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const DIA_PAGAMENTO = 5

const { data: cat } = await sb.from('erp_categorias').select('id').eq('nome', 'Folha de Pagamento').single()
const { data: titulos, error } = await sb.from('erp_contas_pagar')
  .select('id,descricao,vencimento,valor,status,observacoes')
  .eq('categoria_id', cat.id)
  .in('status', ['aberto', 'parcial', 'vencido'])
  .order('vencimento')
if (error) throw new Error(error.message)

let n = 0
for (const t of titulos || []) {
  const venc = String(t.vencimento).slice(0, 10)
  const [ano, mes] = venc.split('-').map(Number)
  // competência = mês do vencimento atual; pagamento = dia 5 do mês seguinte
  const alvoAno = mes === 12 ? ano + 1 : ano
  const alvoMes = mes === 12 ? 1 : mes + 1
  const novo = `${alvoAno}-${String(alvoMes).padStart(2, '0')}-${String(DIA_PAGAMENTO).padStart(2, '0')}`
  if (novo === venc) continue
  n++
  console.log(`~ ${t.descricao.slice(0, 52).padEnd(52)} ${brl(t.valor).padStart(14)}  ${venc} -> ${novo}`)
  if (APPLY) {
    const nota = `[18/08/2026] Vencimento ajustado de ${venc} para ${novo}: a folha da competência sai do banco no início do mês seguinte (padrão medido no extrato: dias 2–6).`
    const { error: e2 } = await sb.from('erp_contas_pagar')
      .update({ vencimento: novo, observacoes: [String(t.observacoes || '').trim(), nota].filter(Boolean).join('\n') })
      .eq('id', t.id)
    if (e2) console.error('  ERRO: ' + e2.message)
  }
}
console.log(`\n-> ${n} títulos de folha reprogramados para a data real de pagamento`)
console.log(APPLY ? 'APLICADO.' : 'DRY-RUN. Use --apply para gravar.')
