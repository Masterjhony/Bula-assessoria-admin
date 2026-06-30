// Despesas fixas de estrutura (overhead) — recorrentes mensais.
//
// Origem: conversa com a responsável anterior pelo financeiro (Ana Paula), 30/06/2026:
//   - Aluguel: R$ 3.292,00/mês (fixo)
//   - Energia: VARIÁVEL (cobrada junto do aluguel) — entra como placeholder p/ lançar a conta real
//   - Máquina de café: R$ 150,00/mês
//   - Contabilidade: R$ 1.058,00/mês
//
// Por que: o DRE não tinha nenhum custo de estrutura lançado (overhead), só leilão→
// receita→comissão→imposto. Sem isso o lucro líquido da empresa fica superestimado.
//
// Gera 1 conta a pagar por mês (recorrencia='mensal', tag 'despesa-fixa') no intervalo
// MES_INI..MES_FIM. Idempotente: usa numero_documento estável (DESPFIXA-<chave>-AAAA-MM)
// e pula o que já existe.
//
// Uso:
//   DRY_RUN=1 node scripts/seed-despesas-fixas-2026.mjs   # só mostra o que faria
//   node scripts/seed-despesas-fixas-2026.mjs              # grava
//
// Premissas ajustáveis: dia de vencimento (DIA_VENC) e o valor da energia (variável,
// nasce 0 p/ ser preenchido com a conta do mês). Ajuste e rode de novo se precisar.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── Parâmetros ──────────────────────────────────────────────────────────────
const MES_INI = '2026-07' // inclusive
const MES_FIM = '2026-12' // inclusive
const DIA_VENC = 10       // dia do vencimento (premissa — ajustar se souber a data real)

// IDs reais (sondados em 30/06/2026)
const PLANO_ADM = '8689266d-f98d-475d-ae09-5e8369a55640'        // 4.3 Despesas Administrativas
const CC_ESTRUTURA = 'da0324cb-abf6-4633-8175-cd80997267aa'      // OP02 Aluguel, Água, Luz e Internet
const CC_CONTADOR = '29fe62e8-c44e-4e8d-8157-bb8320f0f9c5'       // ADM05 Contador, Jurídico e Prestadores Serviço
const CAT_ALUGUEL = '3b23018a-36c7-4dcb-90e0-8f2b3a00b35d'       // Aluguel
const CAT_ENERGIA = 'fc04a834-ddb9-4311-a6de-29bb87785088'       // Energia/Agua/Telefone
const CAT_TERCEIROS = '421660db-5009-43a3-95da-48f204db6ebd'     // Servicos de Terceiros
const CAT_CONSUMO = '9ff471c0-15fd-4085-a920-31a70d562b52'       // Alimentacao e Consumo
const BANCO_SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'      // Sicoob - pagamentos PIX

// Definição de cada despesa fixa
const DESPESAS = [
  { chave: 'ALUGUEL', descricao: 'Aluguel do escritório', valor: 3292.00, cat: CAT_ALUGUEL, cc: CC_ESTRUTURA, obs: 'Despesa fixa de estrutura. Valor fixo/mês.' },
  { chave: 'CONTABIL', descricao: 'Honorários de contabilidade', valor: 1058.00, cat: CAT_TERCEIROS, cc: CC_CONTADOR, obs: 'Despesa fixa de estrutura. Honorário contábil mensal.' },
  { chave: 'CAFE', descricao: 'Máquina de café (escritório)', valor: 150.00, cat: CAT_CONSUMO, cc: CC_ESTRUTURA, obs: 'Despesa fixa de estrutura.' },
  { chave: 'ENERGIA', descricao: 'Energia elétrica (escritório)', valor: 0.00, cat: CAT_ENERGIA, cc: CC_ESTRUTURA, obs: 'Despesa VARIÁVEL — cobrada junto do aluguel. Preencher com a conta do mês.' },
]

function* meses(ini, fim) {
  let [ay, am] = ini.split('-').map(Number)
  const [fy, fm] = fim.split('-').map(Number)
  while (ay < fy || (ay === fy && am <= fm)) {
    yield `${ay}-${String(am).padStart(2, '0')}`
    am++; if (am > 12) { am = 1; ay++ }
  }
}

const rows = []
for (const ym of meses(MES_INI, MES_FIM)) {
  const vencimento = `${ym}-${String(DIA_VENC).padStart(2, '0')}`
  const emissao = `${ym}-01`
  for (const d of DESPESAS) {
    rows.push({
      numero_documento: `DESPFIXA-${d.chave}-${ym}`,
      descricao: d.descricao,
      categoria_id: d.cat,
      centro_custo_id: d.cc,
      plano_conta_id: PLANO_ADM,
      conta_bancaria_id: BANCO_SICOOB,
      valor: d.valor,
      emissao,
      vencimento,
      forma_pagamento: 'pix',
      recorrencia: 'mensal',
      status: 'aberto',
      observacoes: d.obs,
      tags: ['despesa-fixa'],
    })
  }
}

// Idempotência: pula numero_documento já existente
const docs = rows.map((r) => r.numero_documento)
const { data: existentes, error: errEx } = await sb
  .from('erp_contas_pagar').select('numero_documento').in('numero_documento', docs)
if (errEx) { console.error('Erro ao checar existentes:', errEx.message); process.exit(1) }
const jaExiste = new Set((existentes || []).map((r) => r.numero_documento))
const novos = rows.filter((r) => !jaExiste.has(r.numero_documento))

console.log(`Período: ${MES_INI}..${MES_FIM} | candidatos: ${rows.length} | já existem: ${jaExiste.size} | a inserir: ${novos.length}`)
const totalMes = DESPESAS.reduce((s, d) => s + d.valor, 0)
console.log(`Total fixo conhecido/mês (sem energia variável): ${brl(totalMes)}`)
for (const r of novos) console.log(`  + ${r.vencimento} | ${r.descricao} | ${brl(r.valor)} | ${r.numero_documento}`)

if (DRY_RUN) { console.log('\n[DRY_RUN] nada gravado.'); process.exit(0) }
if (!novos.length) { console.log('\nNada novo a inserir.'); process.exit(0) }

const { data, error } = await sb.from('erp_contas_pagar').insert(novos).select('id')
if (error) { console.error('Erro ao inserir:', error.message); process.exit(1) }
console.log(`\nOK — ${data.length} contas a pagar criadas.`)
