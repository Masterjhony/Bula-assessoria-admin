// Retrofit do historico da varredura Sicredi (05/08/2026, apos criar a conta
// "Sicredi - Investimentos"): as varreduras eram uma perna so, tipo
// 'transferencia' (que o trigger de saldo IGNORA), e apareciam na conciliacao
// com sinal ERRADO (+ na aplicacao), parecendo duplicidade do recebimento.
//
// O que faz:
//  1) converte cada varredura da CC em par de verdade:
//     APLICACAO -> saida na CC + entrada em Investimentos;
//     RESG      -> entrada na CC + saida em Investimentos;
//     categoria = Transferencias Internas (fora do resultado), pernas ligadas
//     por transferencia_par_id, pessoa = entidade da varredura.
//  2) converte as transferencias externas (PIX p/ Sicoob, Felipe etc.) de
//     'transferencia' para entrada/saida (sinal certo na tela e no saldo).
//  3) REMOVE o par "transferencia de posicao" de 29.577,20 criado hoje — com o
//     historico espelhado ele duplicaria a posicao.
//  4) re-ancora saldo_inicial das duas contas: CC deriva R$ 0,00 (varredura) e
//     Investimentos deriva R$ 27.598,64 (posicao do app 03/08). O saldo_inicial
//     de Investimentos passa a representar posicao pre-2026 + rendimentos ainda
//     nao importados (extrato da aplicacao pendente).
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
const MARK = '[RETROFIT-VARREDURA 05/08]'

const CC = 'af4724ec-e098-4e13-b172-04b2bfb1949d'
const ALVO_INVEST = 27598.64
const CAT_TRANSF_SAIDA = '1d83b7e5-aa77-4e1d-a774-64ecfda0b746'
const CAT_TRANSF_ENTRADA = '2847979e-b319-4cad-9510-828c9d6bc1c0'

console.log(DRY_RUN ? '*** DRY RUN ***\n' : '*** GRAVANDO ***\n')

const { data: invest } = await sb.from('erp_contas_bancarias').select('id,nome,saldo_inicial').ilike('nome', '%Sicredi%Investimentos%').single()
const { data: varredura } = await sb.from('erp_pessoas').select('id').ilike('nome', '%SICREDI%Aplicacao%varredura%').single()

const movs = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('erp_movimentos_bancarios')
    .select('id,data,tipo,valor,descricao,categoria_id,observacoes,documento,transferencia_par_id')
    .eq('conta_bancaria_id', CC).order('data').range(from, from + 999)
  if (error) throw error
  movs.push(...data)
  if (data.length < 1000) break
}

const isResg = (m) => /RESG\.?APLIC/i.test(m.descricao || '')
const isAplic = (m) => /^APLICACAO FINANCEIRA/i.test(m.descricao || '')

// 3) remove o par de posicao de hoje (fica redundante com o espelhamento)
{
  const { data: par } = await sb.from('erp_movimentos_bancarios').select('id,conta_bancaria_id').eq('documento', 'SICREDI-SEPARACAO-POSICAO-2026-08-05')
  if (par && par.length) {
    console.log(`[-] removendo par de transferencia de posicao de hoje (${par.length} pernas — redundante com o retrofit)`)
    if (!DRY_RUN) {
      const { error } = await sb.from('erp_movimentos_bancarios').delete().eq('documento', 'SICREDI-SEPARACAO-POSICAO-2026-08-05')
      if (error) throw error
    }
  } else console.log('[=] par de posicao ja removido')
}

// 1+2) conversao das pernas
let sweeps = 0, externas = 0, espelhos = 0
for (const m of movs.filter((x) => x.tipo === 'transferencia')) {
  if (isAplic(m) || isResg(m)) {
    const aplic = isAplic(m)
    // perna CC
    if (!DRY_RUN) {
      const { error } = await sb.from('erp_movimentos_bancarios').update({
        tipo: aplic ? 'saida' : 'entrada',
        categoria_id: aplic ? CAT_TRANSF_SAIDA : CAT_TRANSF_ENTRADA,
        pessoa_id: varredura.id,
        observacoes: `${m.observacoes ? m.observacoes + ' ' : ''}${MARK} Convertida em par de transferencia CC<->Investimentos (antes era perna unica tipo 'transferencia', com sinal ambiguo na tela).`,
        updated_at: now(),
      }).eq('id', m.id)
      if (error) throw error
    }
    sweeps++
    // perna espelho em Investimentos (idempotente por documento)
    const doc = `SICREDI-VARR-ESPELHO-${m.id.slice(0, 8)}`
    const { data: ex } = await sb.from('erp_movimentos_bancarios').select('id').eq('documento', doc).maybeSingle()
    if (!ex) {
      if (!DRY_RUN) {
        const { data: novo, error } = await sb.from('erp_movimentos_bancarios').insert({
          conta_bancaria_id: invest.id, data: m.data,
          tipo: aplic ? 'entrada' : 'saida',
          categoria_id: aplic ? CAT_TRANSF_ENTRADA : CAT_TRANSF_SAIDA,
          descricao: aplic ? 'APLICACAO RECEBIDA DA CC 53609-7 (varredura)' : 'RESGATE ENVIADO A CC 53609-7 (varredura)',
          valor: m.valor, pessoa_id: varredura.id, documento: doc, origem: 'transferencia',
          transferencia_par_id: m.id, status_conciliacao: 'conciliado', conciliado: true,
          observacoes: `${MARK} Perna espelho da varredura de ${m.data} (${brl(m.valor)}).`,
        }).select('id').single()
        if (error) throw error
        await sb.from('erp_movimentos_bancarios').update({ transferencia_par_id: novo.id, updated_at: now() }).eq('id', m.id)
      }
      espelhos++
    }
  } else {
    // transferencia externa (Sicoob, Felipe, etc.): sinal pelo texto
    const entrada = /RECEBIMENTO PIX|CRED/i.test(m.descricao || '')
    if (!DRY_RUN) {
      const { error } = await sb.from('erp_movimentos_bancarios').update({
        tipo: entrada ? 'entrada' : 'saida',
        observacoes: `${m.observacoes ? m.observacoes + ' ' : ''}${MARK} Tipo corrigido de 'transferencia' para ${entrada ? 'entrada' : 'saida'} (sinal certo na tela e no saldo).`,
        updated_at: now(),
      }).eq('id', m.id)
      if (error) throw error
    }
    externas++
  }
}
console.log(`varreduras convertidas: ${sweeps} (espelhos novos: ${espelhos}) | transferencias externas corrigidas: ${externas}`)

// 4) re-ancoragem dos saldos
if (!DRY_RUN) {
  // zera saldo_inicial para medir o net derivado de cada conta
  const net = async (conta) => {
    const { data: c } = await sb.from('erp_contas_bancarias').select('saldo_inicial').eq('id', conta).single()
    const { data: s } = await sb.rpc('erp_recalc_saldo', { p_conta: conta })
    return r2(Number(s) - Number(c.saldo_inicial))
  }
  const netCC = await net(CC)
  const netInv = await net(invest.id)
  const iniCC = r2(0 - netCC)             // CC real hoje = 0,00
  const iniInv = r2(ALVO_INVEST - netInv) // Investimentos hoje = 27.598,64
  await sb.from('erp_contas_bancarias').update({ saldo_inicial: iniCC, updated_at: now() }).eq('id', CC)
  await sb.from('erp_contas_bancarias').update({
    saldo_inicial: iniInv, updated_at: now(),
    observacoes: `${MARK} saldo_inicial ${brl(iniInv)} = posicao pre-2026 + rendimentos ainda nao importados (extrato da aplicacao pendente). Ajustar quando o extrato da aplicacao entrar.`,
  }).eq('id', invest.id)
  const { data: sCC } = await sb.rpc('erp_recalc_saldo', { p_conta: CC })
  const { data: sInv } = await sb.rpc('erp_recalc_saldo', { p_conta: invest.id })
  console.log(`\nsaldo_inicial CC: ${brl(iniCC)} | Investimentos: ${brl(iniInv)}`)
  console.log(`CC (varredura): ${brl(sCC)} ${r2(sCC) === 0 ? '✓' : '✗'}`)
  console.log(`Investimentos:  ${brl(sInv)} ${r2(sInv) === ALVO_INVEST ? '✓' : '✗'}`)
  console.log(`Total Sicredi:  ${brl(r2(Number(sCC) + Number(sInv)))} ${r2(Number(sCC) + Number(sInv)) === ALVO_INVEST ? '✓ inalterado' : '✗'}`)
}
