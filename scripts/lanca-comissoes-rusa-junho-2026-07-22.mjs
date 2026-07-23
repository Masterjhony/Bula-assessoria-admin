// Comissões do GUSTAVO RUSA em junho/2026 conforme a lista do chefe (22/07).
// Regra da lista: VGV = parcela × 30 (lote 1004 Central do JMP Touros é × 40);
// comissão = 5% do VGV. Confere lote a lote com os totais ✅ que ele passou.
//
// Correção do erro anterior: as entradas do Rusa estavam com comissao = 0
// ("já paga no CP consolidado MAIJUN"). A página Bônus e Comissionamento mostra
// o que foi GANHO no leilão — o pagamento é o título no Contas a Pagar, que
// segue existindo (BULA-2026-CP-COM-RUSA-MAIJUN, 64.945, pago 30/06). Lançar a
// comissão aqui NÃO cria segundo pagamento.
//
// Também remove a linha "Não informado" (45.000) do Matinha 21/06 — pedido do
// chefe. A venda continua no leilão (vgv_total preservado), só deixa de
// aparecer como assessor.
//
// Uso: node scripts/lanca-comissoes-rusa-junho-2026-07-22.mjs --apply  (sem flag = dry-run)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const MARK = '[LISTA-RUSA 22/07]'
const r2 = (n) => Math.round(n * 100) / 100

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
console.log(APPLY ? '>>> APPLY' : '>>> DRY-RUN (use --apply)')

// vgv/comissao conferidos contra os totais ✅ da lista do chefe
const RUSA = [
  { id: '9e017caf-8899-4852-99a5-d506bb5905b6', leilao: 'Cachoeirao 03/06',      vgv: 207000,   comissao: 10350,
    det: 'Lote 1 (5.000, Alfredo José Cardoso) + Lote 2 aspiração (800, C+4) + Lote Aspiração Gaia (1.100, C+4) = 6.900 × 30 = 207.000 × 5%. Lista do chefe: "PÉROLAS DO CACHOEIRÃO — Total R$ 10.350 ✅".', transacoes: 3, animais: 3 },
  { id: '982e286e-7741-480a-bfc9-cf01f7f428ce', leilao: 'Santa Nice 06/06',      vgv: 168000,   comissao: 8400,
    det: 'Lotes 38 (1.250), 15 (1.800), 5 (1.400) Dr Celso Lopes + 47 (1.150) Pedro Pontes = 5.600 × 30 = 168.000 × 5%. Lista do chefe: "SANTA NICE — Total R$ 8.400 ✅".', transacoes: 4, animais: 4 },
  { id: '990ca7e3-61a6-433b-a9a7-6f8093beb183', leilao: 'Tresmar 11/06',         vgv: 25500,    comissao: 1275,
    det: 'Lote 19 (850, Pedro Pontes) × 30 = 25.500 × 5%. Lista do chefe: "TRESMAR — Total R$ 1.275 ✅".', transacoes: 1, animais: 1 },
  { id: 'cd19dba3-792d-42e3-a563-f6025528dd51', leilao: 'JMP Bezerras 13/06',    vgv: 333000,   comissao: 16650,
    det: 'Lotes 23 (3.500), 53 (2.600), 110 (800) Itajaí = 6.900 × 30 = 207.000 × 5% = 10.350; + Lote 20 (4.200, C+4) × 30 = 126.000 × 5% = 6.300. Lista do chefe: dois blocos "JMP BEZERRAS" ✅.', transacoes: 4, animais: 4 },
  { id: 'c0f291bb-17bc-4b10-b320-c5ed6e767057', leilao: 'JMP Touros 14/06',      vgv: 95308.80, comissao: 4765.44,
    det: 'Lote 19 (2.400, Lindoalmir/João Alfredo) × 30 = 72.000 × 5% = 3.600; + Lote 1004 Central (582,72, Alfredo José Cardoso) × 40 = 23.308,80 × 5% = 1.165,44. Lista do chefe: bloco de Total R$ 11.065 ✅ (junto com o lote 20 das Bezerras).', transacoes: 2, animais: 2 },
  { id: 'ff55a57e-7aab-4105-a794-7125a41b7efe', leilao: 'Kriz Matrizes 16/06',   vgv: 24000,    comissao: 1200,
    det: 'Lote 30 (800, Pedro Pontes) × 30 = 24.000 × 5%. Lista do chefe: "NELORE KRIZ — Total R$ 1.200 ✅".', transacoes: 1, animais: 1 },
  { id: '000dfda9-ae2e-4b79-a50d-3f537cf33143', leilao: 'KatiSpera 20/06',       vgv: 20100,    comissao: 1005,
    det: 'Lote 61 (670, Dr Celso Lopes) × 30 = 20.100 × 5%. Lista do chefe: "MATRIZES KATISPERA — Total R$ 1.005 ✅".', transacoes: 1, animais: 1 },
  { id: '1afff4c2-1a60-4580-b8c6-2d9d5c63dffd', leilao: 'MEAB & Modelo 23/06',   vgv: 105000,   comissao: 5250,
    det: 'Lote 1 (1.500, Alfredo José Cardoso) + Lote Aspiração (2.000, C+4) = 3.500 × 30 = 105.000 × 5%. Lista do chefe: "NELORE MEAB E MODELO — Total R$ 5.250 ✅".', transacoes: 2, animais: 2 },
]

let totalCom = 0
for (const r of RUSA) {
  const { data: f, error } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,vgv_total,comissao_assessoria,por_assessor').eq('id', r.id).single()
  if (error) throw error
  let ass = JSON.parse(JSON.stringify(f.por_assessor || []))
  const existente = ass.find((a) => /RUSA/i.test(a.nome || ''))
  const entrada = {
    vgv: r.vgv, nome: 'Gustavo Rusa', empresa: 'Bula Assessoria', comissao: r.comissao, comissao_pct: 0.05,
    animais: r.animais, transacoes: r.transacoes, ticket_medio: Math.round(r.vgv / r.animais),
    observacao: `${MARK} ${r.det}`,
  }
  if (existente) Object.assign(existente, entrada)
  else ass.push(entrada)
  ass = ass.sort((a, b) => (Number(b.vgv) || 0) - (Number(a.vgv) || 0)).map((a, i) => ({ ...a, posicao: i + 1 }))
  const vgvTotal = r2(ass.reduce((s, a) => s + (Number(a.vgv) || 0), 0))
  const comTotal = r2(ass.reduce((s, a) => s + (Number(a.comissao) || 0), 0))
  console.log(`${r.leilao}: Rusa vgv ${r.vgv} comissao ${r.comissao} | leilão: vgv ${f.vgv_total} -> ${vgvTotal}, comissao ${f.comissao_assessoria} -> ${comTotal}`)
  totalCom += r.comissao
  if (APPLY) {
    const { error: e2 } = await sb.from('bula_leilao_fechamento')
      .update({ por_assessor: ass, vgv_total: vgvTotal, comissao_assessoria: comTotal }).eq('id', r.id)
    if (e2) throw e2
  }
}
console.log(`\nTotal Rusa junho: ${r2(totalCom)}`)

// --- remove "Não informado" do Matinha 21/06 (vgv_total preservado) ---
{
  const ID = '2ffd63ed-ee77-49cf-afc2-8fe077c9550e'
  const { data: f, error } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,vgv_total,comissao_assessoria,por_assessor,observacoes').eq('id', ID).single()
  if (error) throw error
  const ni = (f.por_assessor || []).find((a) => /N[AÃ]O INFORMADO/i.test(a.nome || ''))
  if (!ni) console.log('\n= Matinha: "Não informado" já removido')
  else {
    const ass = (f.por_assessor || []).filter((a) => !/N[AÃ]O INFORMADO/i.test(a.nome || ''))
      .sort((a, b) => (Number(b.vgv) || 0) - (Number(a.vgv) || 0)).map((a, i) => ({ ...a, posicao: i + 1 }))
    const obs = `${MARK} Linha "Não informado" (VGV ${ni.vgv}, 1 venda, sem comissão) removida do comissionamento a pedido do chefe. A venda continua no leilão — vgv_total preservado em ${f.vgv_total}.\n${f.observacoes || ''}`.trim()
    console.log(`\nMatinha 21/06: remove "Não informado" (vgv ${ni.vgv}); vgv_total mantido em ${f.vgv_total}`)
    if (APPLY) {
      const { error: e2 } = await sb.from('bula_leilao_fechamento')
        .update({ por_assessor: ass, observacoes: obs }).eq('id', ID)
      if (e2) throw e2
    }
  }
}
console.log('Feito.' + (APPLY ? '' : ' (dry-run)'))
