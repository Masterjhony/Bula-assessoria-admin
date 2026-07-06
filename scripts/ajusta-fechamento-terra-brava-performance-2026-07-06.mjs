// Ajusta o fechamento do Leilão Touros Provados Terra Brava (16-18/06) aplicando o
// acordo de PERFORMANCE agora que a leiloeira informou o faturamento total.
//
// Relatório da leiloeira (Terra Brava Agropecuária):
//   1ª etapa 22 touros R$ 507.900 | 2ª 26 R$ 565.800 | 3ª 31 R$ 645.600
//   TOTAL 79 touros / R$ 1.719.300,00 (média 21.763,29) | 52 compradores | 16 estados.
//
// Performance Bula = venda cobertura 164.700 ÷ faturamento 1.719.300 = 9,58%.
// Escala do acordo: <5%=5% da venda (piso); >=5%=0,5% fat.; >=12,5%=0,75%; >=20%=1%;
//   >=25%=1,25%; >=30%=1,5%. 9,58% cai na faixa >=5% -> 0,5% do faturamento bruto.
// Receita Bula = 0,5% x 1.719.300 = R$ 8.596,50 (antes provisionada no piso 8.235).
//
// Também atualiza a CR (conta a receber) vinculada de 8.235 -> 8.596,50.
// Idempotente. Uso: DRY_RUN=1 node scripts/ajusta-fechamento-terra-brava-performance-2026-07-06.mjs
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

const FECH_ID = '8d6ac3ae-4e38-4120-a49c-eafbc09c507f'
const FATURAMENTO = 1719300
const VGV_COBERTURA = 164700
const COMISSAO = 4098
const PCT = 0.005 // faixa >=5% de performance
const performance = VGV_COBERTURA / FATURAMENTO
const receita = r2(PCT * FATURAMENTO)          // 8.596,50
const sobra = r2(receita - COMISSAO)           // 4.498,50
const imposto = r2(receita * 0.18)             // 1.547,37 (derivado na UI)
const lucroLiq = r2(receita - COMISSAO - imposto) // 2.951,13 (derivado na UI)

const acordoDescricao = [
  `Acordo por performance (contrato Terra Brava). Faturamento total do leilão (relatório da leiloeira, 3 etapas): ${brl(FATURAMENTO)} — 79 touros, média R$ 21.763,29, 52 compradores, 16 estados.`,
  `Venda da cobertura Bula ${brl(VGV_COBERTURA)} → performance = ${(performance * 100).toFixed(2)}% → faixa ≥5% = 0,5% do faturamento bruto. Receita = 0,5% × ${brl(FATURAMENTO)} = ${brl(receita)}.`,
  `Escala: ≥5%=0,5%; ≥12,5%=0,75%; ≥20%=1%; ≥25%=1,25%; ≥30%=1,5%; abaixo de 5%=5% da venda (piso).`,
].join(' ')

const observacoes = [
  'Fechamento parcial (cobertura Bula) a partir das mensagens de WhatsApp encaminhadas em 25/06/2026 ("Fechamento Terra Brava Junho").',
  'Consolida os Leilões Touros Provados Terra Brava de 16, 17 e 18/06/2026 num único fechamento (a pedido do cliente: "é um leilão só"). Programa Leilões.',
  `Cobertura Bula: 8 touros / ${brl(VGV_COBERTURA)} (parcela × 30 parcelas).`,
  `[Ajuste 06/07] Faturamento total informado pela leiloeira: ${brl(FATURAMENTO)} (1ª etapa 22/${brl(507900)}; 2ª 26/${brl(565800)}; 3ª 31/${brl(645600)}; média R$ 21.763,29; 52 compradores; 16 estados). Performance Bula = 164.700 ÷ 1.719.300 = ${(performance * 100).toFixed(2)}% → faixa ≥5% do acordo = 0,5% do faturamento bruto. Receita Bula = 0,5% × 1.719.300 = ${brl(receita)} (antes provisionada no piso ${brl(8235)}).`,
  `Comissão de assessoria: ${brl(COMISSAO)} (Fábio Omena 3% nos lotes 138/59/114/37; Douglas Bispo 2% nos lotes 08/57/96/42). Sobra bruta ${brl(sobra)}.`,
].join('\n')

console.log(`${DRY_RUN ? '*** DRY RUN ***' : '*** GRAVANDO ***'}  Terra Brava (16-18/06)`)
console.log(`  Faturamento: ${brl(FATURAMENTO)} | Performance: ${(performance * 100).toFixed(2)}% | Faixa: 0,5% do faturamento`)
console.log(`  Receita: ${brl(8235)} (piso) -> ${brl(receita)}`)
console.log(`  Sobra bruta: ${brl(4137)} -> ${brl(sobra)} | Imposto(UI): ${brl(imposto)} | Lucro líq(UI): ${brl(lucroLiq)}`)

const payloadFech = {
  faturamento_total_leilao: FATURAMENTO,
  acordo_pct_faturamento: PCT,
  acordo_pct_venda_cobertura: null,
  receita_bula: receita,
  sobra_bruta: sobra,
  acordo_descricao: acordoDescricao,
  observacoes,
  updated_at: new Date().toISOString(),
}

// CR vinculada
const { data: crs } = await sb.from('erp_contas_receber')
  .select('id,descricao,valor,status,vencimento,fechamento_id')
  .ilike('descricao', '%TERRA BRAVA%').gte('vencimento', '2026-07-01')
console.log('\n  CR candidatas:')
for (const c of crs || []) console.log(`    ${c.id.slice(0, 8)} ${c.status} ${c.vencimento} ${brl(c.valor)} ${c.descricao.slice(0, 55)}`)
const cr = (crs || []).find((c) => /JUNHO|16-18|PROVADOS/i.test(c.descricao) && Number(c.valor) === 8235)

if (DRY_RUN) { console.log('\n[DRY_RUN] nada gravado.'); process.exit(0) }

const { error: e1 } = await sb.from('bula_leilao_fechamento').update(payloadFech).eq('id', FECH_ID)
if (e1) throw new Error('fechamento: ' + e1.message)
console.log('\n  -> fechamento ATUALIZADO', FECH_ID)

if (cr) {
  const { error: e2 } = await sb.from('erp_contas_receber').update({
    valor: receita,
    observacoes: `Receita Bula por performance (0,5% do faturamento ${brl(FATURAMENTO)}). Ajustada de ${brl(8235)} (piso) para ${brl(receita)} em 06/07 com o relatório da leiloeira.`,
    updated_at: new Date().toISOString(),
  }).eq('id', cr.id)
  if (e2) throw new Error('CR: ' + e2.message)
  console.log(`  -> CR ATUALIZADA ${cr.id.slice(0, 8)} ${brl(8235)} -> ${brl(receita)}`)
} else {
  console.log('  (aviso) CR de 8.235 não localizada automaticamente — ajustar manualmente se existir.')
}
console.log('\nConcluído.')
