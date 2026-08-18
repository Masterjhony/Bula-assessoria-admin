// Cria as Contas a Pagar dos impostos de JUNHO/2026 que faltavam e amarra o ISSQN
// (ja pago 13/07) ao movimento bancario correspondente.
//
//  1) DAS Simples Nacional Junho/2026 — R$ 28.660,03, vence 20/07/2026 (A PAGAR).
//     Doc 07.20.26195.8355505-1. Composicao: IRPJ 1.723,91 + CSLL 1.508,42 +
//     COFINS 5.525,14 + PIS 1.198,12 + INSS 18.704,44.
//  2) ISSQN Junho/2026 — R$ 12.566,78, JA PAGO 13/07 (guia DEB.CONV.PREFEITURA).
//     Cria a CP como paga e vincula o movimento e6c534ec (baixa).
//
// Nao mexe em saldo (CP aberta nao gera movimento; a baixa do ISSQN so seta o FK
// no movimento ja existente). Idempotente por numero_documento / vinculo ja feito.
// Uso: DRY_RUN=1 node scripts/add-impostos-junho-2026.mjs  |  sem DRY_RUN grava.
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
const now = () => new Date().toISOString()

const CAT_IMPOSTOS = '6d3270c8-2680-4cdd-a709-5b1520d1f430'
const CC_ESTRUTURA = 'da0324cb-abf6-4633-8175-cd80997267aa'
const MOV_ISSQN = 'e6c534ec-3b91-4b60-8c60-4babb0336271'

const CPS = [
  {
    doc: 'BULA-2026-CP-DAS-SIMPLES-JUN-2026',
    descricao: 'DAS SIMPLES NACIONAL - COMPETENCIA JUNHO/2026',
    valor: 28660.03, emissao: '2026-06-30', vencimento: '2026-07-20', status: 'aberto',
    obs: 'Documento de Arrecadacao do Simples Nacional. Doc 07.20.26195.8355505-1. Competencia 06/2026, vence 20/07/2026. Composicao: IRPJ 1.723,91 | CSLL 1.508,42 | COFINS 5.525,14 | PIS 1.198,12 | INSS 18.704,44 = 28.660,03.',
  },
  {
    doc: 'BULA-2026-CP-ISSQN-JUN-2026',
    descricao: 'ISSQN - COMPETENCIA JUNHO/2026',
    valor: 12566.78, emissao: '2026-06-30', vencimento: '2026-07-13', status: 'pago',
    data_pagamento: '2026-07-13', valor_pago: 12566.78, forma_pagamento: 'convenio',
    obs: 'Guia ISSQN Bula Assessoria (DEB.CONV.PREFEITURA, doc banco 2917616). Paga 13/07/2026. Vinculada ao movimento do extrato Sicoob.',
    linkMov: MOV_ISSQN,
  },
]

console.log(DRY_RUN ? '*** DRY RUN (nada gravado) ***\n' : '*** GRAVANDO EM PRODUCAO ***\n')

for (const c of CPS) {
  const payload = {
    descricao: c.descricao, fornecedor_id: null, categoria_id: CAT_IMPOSTOS, centro_custo_id: CC_ESTRUTURA,
    valor: c.valor, emissao: c.emissao, vencimento: c.vencimento, status: c.status,
    data_pagamento: c.data_pagamento || null, valor_pago: c.valor_pago || 0, forma_pagamento: c.forma_pagamento || null,
    numero_documento: c.doc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
    observacoes: c.obs, tags: ['a-pagar', '2026', 'impostos', 'junho'],
  }
  const { data: ex } = await sb.from('erp_contas_pagar').select('id,status').eq('numero_documento', c.doc).maybeSingle()
  let cpId = ex?.id
  if (ex) {
    console.log(`[=] CP ja existe ${c.doc} (${ex.status})`)
  } else if (DRY_RUN) {
    console.log(`[+] CP nova ${c.status.padEnd(6)} ${brl(c.valor).padStart(13)}  ${c.descricao}`)
  } else {
    const { data, error } = await sb.from('erp_contas_pagar').insert(payload).select('id').single()
    if (error) throw new Error(`CP ${c.doc}: ${error.message}`)
    cpId = data.id
    console.log(`[+] CP criada ${c.status.padEnd(6)} ${brl(c.valor).padStart(13)}  ${c.descricao}`)
  }

  // vincular movimento (baixa do ISSQN)
  if (c.linkMov) {
    const { data: mov } = await sb.from('erp_movimentos_bancarios').select('id,conta_pagar_id,status_conciliacao').eq('id', c.linkMov).single()
    if (mov.conta_pagar_id) {
      console.log(`    [=] movimento ISSQN ja vinculado (CP ${mov.conta_pagar_id.slice(0, 8)})`)
    } else if (DRY_RUN) {
      console.log(`    [~] vincular movimento ${c.linkMov.slice(0, 8)} -> CP ISSQN (conciliado)`)
    } else {
      const { error } = await sb.from('erp_movimentos_bancarios').update({
        conta_pagar_id: cpId, status_conciliacao: 'conciliado', conciliado: true, updated_at: now(),
      }).eq('id', c.linkMov)
      if (error) throw new Error(`vincular mov ISSQN: ${error.message}`)
      console.log(`    [~] movimento ISSQN vinculado -> CP ${String(cpId).slice(0, 8)} (conciliado)`)
    }
  }
}

console.log('\nConcluido. DAS Simples (28.660,03) fica A PAGAR venc 20/07; ISSQN (12.566,78) PAGO 13/07 e conciliado.')
console.log('Saldo do banco inalterado (CP aberta nao gera movimento; baixa do ISSQN so amarra o movimento existente).')
