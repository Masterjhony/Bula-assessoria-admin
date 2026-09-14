/**
 * VENTRES VIP MATINHA (30/08/2026) — lotes 138/140/141 são lotes MÚLTIPLOS e pagam LANCE × 40.
 *
 * O caso (Ana Paula, 11/09): o e-mail da ADM financeiro da Matinha cobra 4% sobre
 * 84.000 nos lotes 138/141/140 e o HastaPro (Listagem Vendas Assessores/Pisteiros)
 * mostra 63.000. Quem está certo é a Matinha:
 *
 *   · A ORDEM DE ENTRADA oficial do leilão (PDF que o Fábio postou no grupo de lances
 *     em 30/08 16:29, bucket whatsapp-media …/2AA0A1A36746D9C840A3.pdf) fixa DUAS
 *     condições: "Lance vezes 30 (02+02+02+02+02+02+18)" para lote individual e
 *     "Condição de pagamento lotes MÚLTIPLOS: lance vezes 40 (02+02+02+02+02+02+02+26)".
 *   · Os lotes 138 (2 cab.), 140 (2 cab.) e 141 (3 cab.) estão na OE com QTD 2/2/3 —
 *     são múltiplos → 300 × 40 × 7 = 84.000 (24.000 + 24.000 + 36.000).
 *   · Os lotes 18 e 31 (Celso Lopes, via Douglas/Rusa) são individuais → ×30 →
 *     27.000 e 37.500, e por isso batem nas duas fontes.
 *   · O HastaPro cadastrou UMA condição para o leilão inteiro ("LANCE X 30
 *     (02 + 02 + 02 + 24)", CON 260831140900153) e aplicou aos 5 lotes → 63.000.
 *   · Confirmações independentes: a própria Matinha escreveu "Valor total de
 *     R$ 84.000,00" em 02/09 12:05 (pedido de desistência da Amanda Carla, depois
 *     "Resolvido sem cancelamento"); a planilha do Fábio de 02/09 traz 7 × 300 × 40.
 *
 * O que este script faz (Supabase; o HastaPro é só-leitura — a condição dos 3 lotes
 * tem de ser trocada para "40" na tela do HastaPro, como já foi feito no Touros
 * Matinha de 21/06, que tem condição "40" com 5 lotes):
 *   1. bula_leilao_fechamento 3cf166ae…: lotes 138/140/141 → 24.000/24.000/36.000
 *      (parcelas 40), Fábio 63.000→84.000 e 1.260→1.680, VGV 127.500→148.500,
 *      receita_bula = 5.940 (4% "sobre tudo que vender", e-mail de 11/09).
 *   2. erp_contas_pagar f40cd8e8… (Fábio, 1.680): sai de "em disputa" para confirmado.
 *   3. --cr: contas a receber pelo e-mail da Matinha, UMA POR CONSIGNATÁRIO (a Matinha
 *      rateia a comissão da Bula entre quem consignou o lote: Tangará Pecuária =
 *      Rancho da Matinha; Therencio; Thiago-TLMS = Granja Santiago, como no Touros
 *      de 21/06). Ventres VIP: Tangará 3.360 + Therencio 1.080 + Thiago 1.500 = 5.940.
 *      Expogenética: Tangará 4.260 + Thiago 840 = 5.100 — substitui o CR de 27.375
 *      (5% × 547.500, "criterio-a-confirmar"), que estava errado em critério e base
 *      (os 291.000 do José Fábio têm crédito e não pagam; o % real é 4%).
 *
 * Dry-run por padrão; --apply grava (backup em outputs/ventres-vip-matinha-2026-08-30/).
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
  let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  if (!(m[1] in process.env)) process.env[m[1]] = v
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const APPLY = process.argv.includes('--apply')
const CR = process.argv.includes('--cr')
const HOJE = '2026-09-14'
const OUT = 'outputs/ventres-vip-matinha-2026-08-30'
fs.mkdirSync(OUT, { recursive: true })
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const FECH_VENTRES = '3cf166ae-f4db-42f2-aaf1-15f98860f5b3'
const FECH_EXPO = '0c5c2ccb-8deb-476a-9970-eb967c58e254'
const CP_FABIO = 'f40cd8e8-c6e2-5a44-aeed-5ed70bdef52a'
const CR_EXPO_ANTIGO = '30bc3169-e4ed-4db2-bd10-2b86e4bf48c6'
const FONTE = 'OE "Virtual Ventres Vip Matinha" 30/08/2026 (lotes MÚLTIPLOS = lance × 40; lts 138/140/141 com 2/2/3 cab.) + e-mail ADM financeiro Rancho da Matinha 11/09/2026 08:55 (4% sobre tudo que vender)'

/* ── 1. fechamento ───────────────────────────────────────────────────────── */
const { data: f, error: ef } = await sb.from('bula_leilao_fechamento').select('*').eq('id', FECH_VENTRES).single()
if (ef || !f) { console.error('fechamento não encontrado', ef?.message); process.exit(1) }
fs.writeFileSync(`${OUT}/backup-fechamento-${FECH_VENTRES.slice(0, 8)}-${HOJE}.json`, JSON.stringify(f, null, 2))

const MULT = new Set(['138', '140', '141'])
const lances = (f.lances || []).map(l => {
  const lote = String(l.lote).trim()
  if (MULT.has(lote)) {
    const vgv = r2(Number(l.parcela) * 40 * Number(l.animais || 1))
    return { ...l, parcelas: 40, vgv, condicao: 'lote múltiplo: lance × 40 (OE do leilão)' }
  }
  return { ...l, parcelas: l.parcelas ?? 30 }
})
const vgvTotal = r2(lances.reduce((s, l) => s + Number(l.vgv), 0))
const porAssessor = (f.por_assessor || []).map(a => {
  const meus = lances.filter(l => String(l.assessor).trim().toUpperCase() === String(a.nome).trim().toUpperCase())
  const vgv = r2(meus.reduce((s, l) => s + Number(l.vgv), 0))
  const comissao = r2(meus.reduce((s, l) => s + (l.comissao_valor != null ? Number(l.comissao_valor) : Number(l.vgv) * Number(l.comissao_pct ?? a.comissao_pct ?? 0)), 0))
  return { ...a, vgv, comissao, ticket_medio: r2(vgv / (a.transacoes || meus.length || 1)), pct_total: vgv / vgvTotal }
})
const comissaoTotal = r2(porAssessor.reduce((s, a) => s + Number(a.comissao), 0))
const compradores = (f.compradores || []).map(c => {
  const dele = lances.filter(l => String(l.comprador || '').toUpperCase().startsWith(String(c.comprador).toUpperCase()))
  return dele.length ? { ...c, vgv: r2(dele.reduce((s, l) => s + Number(l.vgv), 0)) } : c
})
const receita = r2(vgvTotal * 0.04)
const nota = `[CORREÇÃO ${HOJE.split('-').reverse().join('/')}] Lotes 138/140/141 são lotes MÚLTIPLOS (2+2+3 cab.) e a OE do leilão fixa "lance vezes 40" para múltiplos; o HastaPro aplicou a condição ×30 do leilão inteiro (63.000). Corrigido para 300 × 40 × 7 = 84.000 (24.000 + 24.000 + 36.000), como no e-mail da ADM Matinha de 11/09 e na planilha do Fábio de 02/09. VGV ${brl(f.vgv_total)} → ${brl(vgvTotal)}; Fábio 1.260 → 1.680; receita Bula 4% = ${brl(receita)} (Tangará 3.360 + Therencio 1.080 + Thiago-TLMS 1.500). PENDENTE NO HASTAPRO: trocar a condição dos 3 lotes para "40" (o realinhamento por origem=hastapro reverteria para 63.000 enquanto isso não for feito). Fonte: ${FONTE}.`

console.log('=== 1. FECHAMENTO', f.nome, String(f.data).slice(0, 10))
for (const l of lances) console.log(`   lt ${String(l.lote).padEnd(4)} ${String(l.assessor).padEnd(14)} ${String(l.parcela).padStart(6)} × ${l.parcelas} × ${l.animais} = ${brl(l.vgv).padStart(10)}${MULT.has(String(l.lote)) ? '   ← era ' + brl(Number(l.parcela) * 30 * l.animais) : ''}`)
console.log(`   VGV ${brl(f.vgv_total)} → ${brl(vgvTotal)} · comissão ${brl(f.comissao_assessoria)} → ${brl(comissaoTotal)} · receita_bula ${brl(f.receita_bula)} → ${brl(receita)}`)
for (const a of porAssessor) console.log(`   ${a.nome.padEnd(16)} VGV ${brl(a.vgv).padStart(10)} · comissão ${brl(a.comissao).padStart(9)} (${(a.comissao_pct * 100).toFixed(0)}%)`)

/* ── 2. CP do Fábio ──────────────────────────────────────────────────────── */
const { data: cp } = await sb.from('erp_contas_pagar').select('id,descricao,valor,status,observacoes').eq('id', CP_FABIO).single()
console.log(`\n=== 2. CP FÁBIO ${cp ? brl(cp.valor) + ' [' + cp.status + ']' : 'não encontrado'} → confirmar 1.680,00 (2% × 84.000)`)

/* ── 3. CRs pelo e-mail da Matinha ───────────────────────────────────────── */
const { data: fe } = await sb.from('bula_leilao_fechamento').select('id,nome,data').eq('id', FECH_EXPO).single()
const { data: cat } = await sb.from('erp_categorias').select('id').eq('nome', 'Comissao Leilao').maybeSingle()
const { data: cat2 } = await sb.from('erp_categorias').select('id').eq('nome', 'Comissoes Recebidas').maybeSingle()
const categoriaId = cat?.id || cat2?.id
const maisDias = (d, n) => { const x = new Date(String(d).slice(0, 10) + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const ddmm = d => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`
const linha = (fech, quem, lotes, base, valor, docSufixo) => ({
  descricao: `${fech.nome} (${ddmm(fech.data)}) - COMISSAO BULA - ${quem}`,
  valor, vencimento: maisDias(fech.data, 45), emissao: String(fech.data).slice(0, 10), status: 'aberto', parcela: 1,
  categoria_id: categoriaId, fechamento_id: fech.id, tags: ['cobranca-leilao', 'email-matinha-2026-09-11'],
  numero_documento: `BULA-2026-CR-MATINHA-${docSufixo}`,
  observacoes: `[${HOJE.split('-').reverse().join('/')}] Resumo de fechamento enviado pela ADM financeiro do Rancho da Matinha (e-mail 11/09/2026 08:55, "Dados para NF"): ${quem} paga 4% sobre ${lotes} = ${brl(base)} × 4% = ${brl(valor)}. A Matinha rateia a comissão da Bula por consignatário — emitir NF/boleto para cada um. Vencimento = leilão + 45 dias (padrão); sem data confirmada.`,
})
const crs = [
  linha(f, 'TANGARÁ PECUÁRIA (Rancho da Matinha)', 'lotes 138, 140 e 141 (Amanda Carla, 7 cab., 300 × 40)', 84000, 3360, 'VENTRES-TANGARA'),
  linha(f, 'THERENCIO', 'lote 18 (Celso Lopes, 900 × 30)', 27000, 1080, 'VENTRES-THERENCIO'),
  linha(f, 'THIAGO-TLMS (Granja Santiago)', 'lote 31 (Celso Lopes, 1.250 × 30)', 37500, 1500, 'VENTRES-THIAGO'),
  linha(fe, 'TANGARÁ PECUÁRIA (Rancho da Matinha)', 'lotes 136, 134 e 107 (Agropecuária Sobre Rodas, 85.500) + 50% do lote 39 (Celso Lopes, 21.000)', 106500, 4260, 'EXPOGENETICA-TANGARA'),
  linha(fe, 'THIAGO-TLMS (Granja Santiago)', '50% do lote 39 (Celso Lopes, 21.000)', 21000, 840, 'EXPOGENETICA-THIAGO'),
]
const { data: crAntigo } = await sb.from('erp_contas_receber').select('id,descricao,valor,status,tags,substituido_por').eq('id', CR_EXPO_ANTIGO).single()
console.log(`\n=== 3. CONTAS A RECEBER pelo e-mail da Matinha ${CR ? '' : '(só com --cr)'}`)
for (const c of crs) console.log(`   + ${c.descricao.padEnd(78)} ${brl(c.valor).padStart(9)} · vence ${c.vencimento}`)
console.log(`   = Ventres VIP 5.940,00 · Expogenética 5.100,00 · total 11.040,00`)
console.log(`   − substitui CR ${CR_EXPO_ANTIGO.slice(0, 8)} "${crAntigo?.descricao}" ${brl(crAntigo?.valor)} [${crAntigo?.status}] ${crAntigo?.substituido_por ? '⚠ JÁ SUBSTITUÍDO' : ''}`)
console.log(`   ? lote E11 (pacote de embriões, Klysmann Douglas, 42.000, Douglas) está no HastaPro da Expogenética e NÃO está no e-mail — perguntar à Matinha se embrião paga os 4% (1.680).`)

if (!APPLY) { console.log('\nDRY-RUN. Use --apply (e --cr para os recebíveis).'); process.exit(0) }

/* ── grava ───────────────────────────────────────────────────────────────── */
const { error: e1 } = await sb.from('bula_leilao_fechamento').update({
  lances, por_assessor: porAssessor, compradores, vgv_total: vgvTotal, comissao_assessoria: comissaoTotal,
  ticket_medio: r2(vgvTotal / (f.lotes_vendidos || lances.length)),
  receita_bula: receita, acordo_pct_venda_cobertura: 0.04,
  acordo_descricao: '4% sobre tudo que a Bula vender (e-mail ADM financeiro Rancho da Matinha, 11/09/2026); rateado por consignatário',
  observacoes: [f.observacoes, nota].filter(Boolean).join('\n'), updated_at: new Date().toISOString(),
}).eq('id', FECH_VENTRES)
if (e1) { console.error('ERRO fechamento:', e1.message); process.exit(1) }
console.log('\n✓ fechamento atualizado')

if (cp) {
  const { error: e2 } = await sb.from('erp_contas_pagar').update({
    observacoes: [cp.observacoes, `[${HOJE.split('-').reverse().join('/')}] CONFIRMADO 1.680,00 = 2% × 84.000: lotes 138/140/141 são múltiplos e pagam lance × 40 pela OE do leilão; a Matinha cobra sobre 84.000. Não há mais disputa com 1.260.`].filter(Boolean).join('\n'),
    updated_at: new Date().toISOString(),
  }).eq('id', CP_FABIO)
  if (e2) console.error('ERRO CP:', e2.message); else console.log('✓ CP do Fábio anotado como confirmado (1.680)')
}

if (CR) {
  if (crAntigo?.substituido_por) { console.error('CR antigo já substituído — não recrio.'); process.exit(1) }
  const { data: jaTem } = await sb.from('erp_contas_receber').select('id,numero_documento').in('numero_documento', crs.map(c => c.numero_documento))
  if (jaTem?.length) { console.error('já existem:', jaTem.map(x => x.numero_documento).join(', ')); process.exit(1) }
  fs.writeFileSync(`${OUT}/backup-cr-expogenetica-${CR_EXPO_ANTIGO.slice(0, 8)}-${HOJE}.json`, JSON.stringify(crAntigo, null, 2))
  const { data: novos, error: e3 } = await sb.from('erp_contas_receber').insert(crs).select('id,numero_documento,valor')
  if (e3) { console.error('ERRO CR insert:', e3.message); process.exit(1) }
  for (const n of novos) console.log(`✓ CR ${n.numero_documento} ${brl(n.valor)} (${n.id.slice(0, 8)})`)
  const tangaraExpo = novos.find(n => n.numero_documento.endsWith('EXPOGENETICA-TANGARA'))
  const { error: e4 } = await sb.from('erp_contas_receber').update({
    status: 'cancelado', substituido_por: tangaraExpo.id, substituido_em: new Date().toISOString(),
    observacoes: `[${HOJE.split('-').reverse().join('/')}] SUBSTITUÍDO pelos CRs BULA-2026-CR-MATINHA-EXPOGENETICA-TANGARA (4.260) e -THIAGO (840) = 5.100, valores do e-mail da ADM Matinha de 11/09/2026 (4% sobre 127.500: lts 136/134/107 + lt 39). Este título usava 5% × 547.500 com critério a confirmar; os 291.000 do José Fábio têm crédito na Matinha e não pagam comissão.\n` + (crAntigo.observacoes || ''),
    updated_at: new Date().toISOString(),
  }).eq('id', CR_EXPO_ANTIGO)
  if (e4) console.error('ERRO CR antigo:', e4.message); else console.log(`✓ CR antigo ${brl(crAntigo.valor)} cancelado/substituído`)
}
console.log('APLICADO.')
