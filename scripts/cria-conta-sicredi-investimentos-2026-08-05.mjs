// Separa a APLICACAO da Sicredi em conta propria (pedido do Joao Eduardo,
// 05/08/2026): "Sicredi - Investimentos". A CC 53609-7 e varredura e vive em
// ~R$ 0; manter CC + aplicacao somadas numa conta so confundia a conciliacao.
//
// O que faz:
//  1) cria a conta "Sicredi - Investimentos (aplicacao 53609-7)" (tipo
//     'investimento', saldo_inicial 0);
//  2) move para ela o ajuste de posicao de -1.978,56 (03/08) — evento da
//     aplicacao, nao da CC;
//  3) transfere a posicao de 29.577,20 da CC para a nova conta em 05/08 com um
//     PAR de transferencia interna (tipo entrada/saida + categoria
//     Transferencias Internas + transferencia_par_id) — fora do resultado,
//     dentro do saldo;
//  4) valida: CC = 0,00 · Investimentos = 27.598,64 · total inalterado.
//
// Convencao DAQUI EM DIANTE (imports):
//  - recebimento de leilao: entrada na CC (receita);
//  - varredura (APLICACAO/RESG do extrato): par de transferencia CC<->Invest;
//  - rendimento/IR da aplicacao (extrato da aplicacao): entrada/saida na
//    conta Investimentos.
// Idempotente. DRY_RUN=1 simula.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100
const now = () => new Date().toISOString()
const MARK = '[SICREDI-INVEST 05/08]'

const CC = 'af4724ec-e098-4e13-b172-04b2bfb1949d'
const POSICAO = 29577.20   // aplicacao antes do ajuste de -1.978,56
const APP_0308 = 27598.64  // posicao do app em 03/08
const CAT_TRANSF_SAIDA = '1d83b7e5-aa77-4e1d-a774-64ecfda0b746'
const CAT_TRANSF_ENTRADA = '2847979e-b319-4cad-9510-828c9d6bc1c0'

console.log(DRY_RUN ? '*** DRY RUN ***\n' : '*** GRAVANDO ***\n')

// 1) conta nova
let invest
{
  const { data: hit } = await sb.from('erp_contas_bancarias').select('id,nome,saldo_atual').ilike('nome', '%Sicredi%Investimentos%').maybeSingle()
  if (hit) { invest = hit; console.log(`[=] conta ja existe: ${hit.nome} (${brl(hit.saldo_atual)})`) }
  else if (DRY_RUN) { invest = { id: null }; console.log('[+] conta nova (dry): Sicredi - Investimentos (aplicacao 53609-7)') }
  else {
    const { data, error } = await sb.from('erp_contas_bancarias').insert({
      nome: 'Sicredi - Investimentos (aplicacao 53609-7)', banco: 'Sicredi', agencia: '0911', conta: '53609-7',
      tipo: 'investimento', saldo_inicial: 0, moeda: 'BRL', cor: '#1E7A2E', ativo: true,
      observacoes: `${MARK} Aplicacao com resgate automatico vinculada a CC 53609-7 (varredura). A CC vive em ~R$ 0; o dinheiro dos leiloes fica aqui. Rendimentos/IR entram nesta conta quando o extrato da aplicacao for importado.`,
    }).select('id,nome').single()
    if (error) throw error
    invest = data
    console.log(`[+] conta nova: ${data.nome}`)
  }
}

// 2) move o ajuste de -1.978,56 (03/08) para a conta de investimentos
{
  const { data: aj } = await sb.from('erp_movimentos_bancarios').select('id,conta_bancaria_id,observacoes')
    .eq('data', '2026-08-03').eq('valor', 1978.56).ilike('descricao', 'AJUSTE POSICAO APLICACAO%').maybeSingle()
  if (!aj) console.log('[!] ajuste de 1.978,56 nao encontrado')
  else if (aj.conta_bancaria_id === invest.id) console.log('[=] ajuste ja esta na conta de investimentos')
  else {
    console.log('[~] ajuste -1.978,56 (03/08) movido para a conta Investimentos')
    if (!DRY_RUN) {
      const { error } = await sb.from('erp_movimentos_bancarios').update({
        conta_bancaria_id: invest.id,
        observacoes: `${aj.observacoes ? aj.observacoes + ' ' : ''}${MARK} Movido para a conta Sicredi - Investimentos (evento da aplicacao, nao da CC).`,
        updated_at: now(),
      }).eq('id', aj.id)
      if (error) throw error
    }
  }
}

// 3) par de transferencia de posicao (29.577,20) em 05/08
{
  const DOC = 'SICREDI-SEPARACAO-POSICAO-2026-08-05'
  const { data: ex } = await sb.from('erp_movimentos_bancarios').select('id').eq('documento', DOC)
  if (ex && ex.length) console.log(`[=] transferencia de posicao ja existe (${ex.length} pernas)`)
  else if (DRY_RUN) console.log(`[+] par de transferencia ${brl(POSICAO)} CC -> Investimentos (05/08)`)
  else {
    const base = {
      data: '2026-08-05', valor: POSICAO, documento: DOC, origem: 'transferencia',
      status_conciliacao: 'conciliado', conciliado: true,
      observacoes: `${MARK} Separacao da aplicacao em conta propria: posicao de ${brl(POSICAO)} (20/07) transferida da CC para "Sicredi - Investimentos". Com o ajuste de -1.978,56 ja movido, a conta de investimentos deriva ${brl(APP_0308)} (posicao do app em 03/08) e a CC volta a R$ 0,00 (varredura).`,
    }
    const { data: saida, error: e1 } = await sb.from('erp_movimentos_bancarios').insert({
      ...base, conta_bancaria_id: CC, tipo: 'saida', categoria_id: CAT_TRANSF_SAIDA,
      descricao: 'TRANSFERENCIA DE POSICAO - aplicacao separada em conta propria',
    }).select('id').single()
    if (e1) throw e1
    const { data: entrada, error: e2 } = await sb.from('erp_movimentos_bancarios').insert({
      ...base, conta_bancaria_id: invest.id, tipo: 'entrada', categoria_id: CAT_TRANSF_ENTRADA,
      descricao: 'TRANSFERENCIA DE POSICAO - recebida da CC 53609-7', transferencia_par_id: saida.id,
    }).select('id').single()
    if (e2) throw e2
    await sb.from('erp_movimentos_bancarios').update({ transferencia_par_id: entrada.id, updated_at: now() }).eq('id', saida.id)
    console.log(`[+] par de transferencia criado (${brl(POSICAO)})`)
  }
}

// 4) validacao
if (!DRY_RUN) {
  const { data: sCC } = await sb.rpc('erp_recalc_saldo', { p_conta: CC })
  const { data: sInv } = await sb.rpc('erp_recalc_saldo', { p_conta: invest.id })
  const total = r2(Number(sCC) + Number(sInv))
  console.log(`\nCC (varredura): ${brl(sCC)} ${r2(sCC) === 0 ? '✓' : '✗ (esperado 0,00)'}`)
  console.log(`Investimentos:  ${brl(sInv)} ${r2(sInv) === APP_0308 ? '✓' : '✗ (esperado ' + brl(APP_0308) + ')'}`)
  console.log(`Total Sicredi:  ${brl(total)} ${total === APP_0308 ? '✓ inalterado' : '✗'}`)
}
