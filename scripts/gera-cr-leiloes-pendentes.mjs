/**
 * GERA AS CONTAS A RECEBER DOS LEILÕES QUE FALTAM COBRAR (18/08/2026).
 *
 * Pedido do João: "a receber temos os leilões de julho que temos que começar a
 * cobrar". Nove leilões realizados (jul/ago) nunca viraram título de cobrança.
 *
 * REGRAS derivadas do histórico dos recebíveis já lançados:
 *   · vencimento = data do leilão + 45 dias (padrão em 90% dos títulos);
 *   · descrição  = "<LEILAO> (<dd/mm>) - COMISSAO BULA";
 *   · valor      = % sobre o VGV de cobertura da Bula. O % dominante é 5%;
 *     quando o criador já tem histórico, usa-se o percentual efetivamente
 *     cobrado no leilão anterior dele (coluna "base" abaixo).
 *
 * Todo título nasce com a tag 'criterio-a-confirmar' e a memória de cálculo na
 * observação: é cobrança a fazer, e o percentual precisa do aceite do João /
 * do acordo assinado com a leiloeira antes de virar fatura.
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
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const dia = d => String(d || '').slice(0, 10)
const maisDias = (iso, n) => { const d = new Date(dia(iso) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const ddmm = iso => { const [, m, d] = dia(iso).split('-'); return `${d}/${m}` }

/**
 * Critério por leilão pendente. `pct` incide sobre o VGV de cobertura da Bula.
 * `base` documenta de onde veio o percentual — é o que o João precisa validar.
 */
const PLANO = [
  { nome: 'MEGA EVENTO EAO BAVIERA — Machos', pct: 0.0860,
    base: 'mesmo % efetivo do EAO Baviera Fêmeas de 11/07 (R$ 48.556,50 ÷ R$ 564.900 = 8,60%), que combina 0,33% do faturamento total + fatia da cobertura' },
  { nome: 'LEILÃO VIRTUAL BASE GENÉTICA SANTA CRUZ - 1ª ETAPA – 14/07/2026', pct: 0.05,
    base: 'padrão dominante de 5% da cobertura (criador sem histórico de recebível)' },
  { nome: 'NELORE SANTA CRUZ', pct: 0.05,
    base: 'padrão dominante de 5% da cobertura (criador sem histórico de recebível)' },
  { nome: 'NELORE SANTA CRUZ - 19/07/2026', pct: 0.05,
    base: 'padrão dominante de 5% da cobertura (criador sem histórico de recebível)' },
  { nome: '30º NELORAÇO IRMÃOS HIPÓLITO', pct: 0.05,
    base: 'padrão dominante de 5% da cobertura (criador sem histórico de recebível)' },
  { nome: '7º LEILÃO ESSÊNCIA GENÉTICA - NELORE DA BAMBÚ', pct: 0.05,
    base: 'padrão dominante de 5% da cobertura' },
  { nome: 'LEILÃO TERRA BRAVA AGROPECUÁRIA EXPOGENÉTICA', pct: 0.1119,
    base: '% efetivo do Terra Brava Touros Provados de 16/06 (R$ 7.215 ÷ R$ 64.500 = 11,19%)' },
  { nome: 'LEILÃO MATINHA EXPOGENÉTICA 2026', pct: 0.05,
    base: '% do Leilão Matrizes Matinha de 17/05 (R$ 8.850 ÷ R$ 177.000 = 5,00%)' },
  { nome: 'LEILÃO MATRIZES PREMIUM KATISPERA', pct: 0.06,
    base: '% do 3º Leilão Matrizes KatiSpera de 20/06 (R$ 11.106 ÷ R$ 185.100 = 6,00%)' },
]

const { data: fes } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,vgv_total').gte('data', '2026-07-01').order('data')
const { data: crs } = await sb.from('erp_contas_receber')
  .select('fechamento_id').not('fechamento_id', 'is', null).neq('status', 'cancelado')
const comCR = new Set((crs || []).map(c => c.fechamento_id))
const { data: cat } = await sb.from('erp_categorias').select('id').eq('nome', 'Comissao Leilao').maybeSingle()
const { data: cat2 } = await sb.from('erp_categorias').select('id').eq('nome', 'Comissoes Recebidas').maybeSingle()
const categoriaId = cat?.id || cat2?.id

let total = 0, n = 0
const lancar = []
for (const p of PLANO) {
  const f = (fes || []).find(x => x.nome === p.nome && !comCR.has(x.id))
  if (!f) { console.log(`  ! não encontrei fechamento pendente para "${p.nome}"`); continue }
  const valor = r2(Number(f.vgv_total) * p.pct)
  const venc = maisDias(f.data, 45)
  lancar.push({ f, p, valor, venc })
  total += valor; n++
  console.log(`  + ${dia(f.data)} ${f.nome.slice(0, 44).padEnd(44)} VGV ${brl(f.vgv_total).padStart(13)} × ${(p.pct * 100).toFixed(2)}% = ${brl(valor).padStart(12)} · vence ${venc}`)
  console.log(`       base: ${p.base}`)
}
console.log(`\n-> ${n} recebíveis a lançar · ${brl(total)}`)

if (!APPLY) { console.log('\nDRY-RUN. Use --apply para gravar.'); process.exit(0) }

let ok = 0
for (const x of lancar) {
  const payload = {
    descricao: `${x.f.nome} (${ddmm(x.f.data)}) - COMISSAO BULA`,
    valor: x.valor,
    vencimento: x.venc,
    emissao: dia(x.f.data),
    status: 'aberto',
    parcela: 1,
    categoria_id: categoriaId,
    fechamento_id: x.f.id,
    tags: ['criterio-a-confirmar', 'cobranca-leilao'],
    observacoes: `[18/08/2026] Cobrança gerada a partir do fechamento: VGV de cobertura ${brl(x.f.vgv_total)} × ${(x.p.pct * 100).toFixed(2)}% = ${brl(x.valor)}. Vencimento = leilão + 45 dias (padrão dos recebíveis). CRITÉRIO A CONFIRMAR — ${x.p.base}.`,
  }
  const { error } = await sb.from('erp_contas_receber').insert(payload)
  if (error) console.error('  ERRO: ' + error.message)
  else ok++
}
console.log(`\n-> ${ok} recebíveis criados`)
console.log('APLICADO.')
