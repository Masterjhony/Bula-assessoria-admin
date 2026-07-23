// Preparação do pagamento de comissões de 27/07/2026 — dois ajustes:
//
// 1) BULINHA — planilha "COMISSÃO BULINHA" do chefe (23/07), total R$ 58.872,00:
//    03/05 EAO 703.000x2%=14.060 · 09/05 4R 510.300x2%=10.206 · 15/05 JEM
//    127.500x2%=2.550 · 07/06 Jacamim 540 · 13/06 JMP Bezerras 1.260 ·
//    14/06 JMP Touros 30.256. Junho já está lançado (fechamentos + CPs =
//    32.056). MAIO não estava: lança a comissão nos 3 fechamentos de maio e
//    cria os 3 CPs (26.816). Obs.: no EAO 03/05 a planilha usa base 703.000
//    (lances capturados somam 603.000) e no 4R a cobertura do Bulinha
//    (510.300) não tinha sido capturada — planilha do chefe é a fonte.
//
// 2) MATHEUS (Mateus Alves) — JMP Touros 14/06: planilha da equipe usou 3%
//    (2.169), mas o chefe confirmou 0,33%. Base ERP = 3 lotes do Rufino
//    Kuhnem Junior (28, 165, 129) = 72.300 -> 0,33% = R$ 238,59. (O "96.300"
//    da planilha não fecha nem com as próprias linhas dela, que somam 72.300.)
//    Lança 238,59 no fechamento e cria o CP.
//
// Uso: DRY_RUN=1 node scripts/ajusta-bulinha-maio-matheus-2026-07-23.mjs
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
const MARK = '[PLANILHA-BULINHA 23/07]'

const FORN_BULINHA = '623cf381-2714-404e-b96a-cd04b1e43af9'
const FORN_MATHEUS = '9c7b8e5e-02cf-4f55-aba2-e9302a18549b' // Mateus Alves da Silva
const CAT_COMISSAO = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'
const CC_PARCEIROS = '3350800e-d771-4963-a0c9-342ed268ca4a'

const fetchFech = async (id) => {
  const { data, error } = await sb.from('bula_leilao_fechamento').select('*').eq('id', id).single()
  if (error) { console.error('erro lendo', id, error.message); process.exit(1) }
  return data
}
const updFech = async (id, upd) => {
  if (DRY_RUN) return
  const { error } = await sb.from('bula_leilao_fechamento').update({ ...upd, updated_at: now() }).eq('id', id)
  if (error) { console.error('ERRO update', id, error.message); process.exit(1) }
}
const isBulinha = (n) => /bulinha|felipe\s+.*andrade|felipe\s+vilela/i.test(String(n || ''))

console.log(DRY_RUN ? '=== DRY RUN ===' : '=== GRAVANDO ===')

/* ---- 1a) EAO Touros 03/05: Bulinha 703.000 x 2% = 14.060 ---- */
{
  const f = await fetchFech('293de295-32b9-4256-976e-ef344b2667b8')
  console.log(`\n[EAO 03/05] ${f.nome}`)
  const cur = (f.por_assessor || []).find((a) => isBulinha(a.nome))
  if (cur && Number(cur.comissao) === 14060) console.log('  já ajustado. pula.')
  else {
    const pa = (f.por_assessor || []).map((a) => isBulinha(a.nome)
      ? { ...a, vgv: 703000, comissao: 14060, comissao_pct: 0.02, observacao: `${MARK} VALOR 703.000 x 2% = 14.060 (planilha COMISSÃO BULINHA; lances capturados somam 603.000 — diferença sem detalhe de lote).` }
      : a)
    // Fábio segue por rateio: comissao_assessoria − 14.060 = 1.125 (3% dele, valor original)
    const comAss = r2(1125 + 14060)
    const vgvTotal = r2(Number(f.vgv_total) - 603000 + 703000)
    const sobra = r2(Number(f.receita_bula) - comAss)
    console.log(`  Bulinha: vgv 603.000 -> 703.000 · com (rateio 1.059,13) -> ${brl(14060)}`)
    console.log(`  vgv_total ${brl(f.vgv_total)} -> ${brl(vgvTotal)} | comissao_assessoria ${brl(f.comissao_assessoria)} -> ${brl(comAss)} | sobra ${brl(f.sobra_bruta)} -> ${brl(sobra)}`)
    await updFech(f.id, { por_assessor: pa, vgv_total: vgvTotal, comissao_assessoria: comAss, sobra_bruta: sobra })
    if (!DRY_RUN) console.log('  ✔ gravado')
  }
}

/* ---- 1b) 4R 09/05: adiciona Bulinha 510.300 x 2% = 10.206 ---- */
{
  const f = await fetchFech('b3d1c05c-2d37-4f9d-b1e4-a21c12540619')
  console.log(`\n[4R 09/05] ${f.nome}`)
  if ((f.por_assessor || []).some((a) => isBulinha(a.nome))) console.log('  Bulinha já presente. pula.')
  else {
    const pa = [...(f.por_assessor || []), {
      nome: 'Bulinha (Felipe Andrade)', empresa: 'Bula Assessoria', vgv: 510300, comissao: 10206,
      comissao_pct: 0.02, transacoes: 1, animais: 1, ticket_medio: 510300,
      observacao: `${MARK} VALOR 510.300 x 2% = 10.206 (planilha COMISSÃO BULINHA; cobertura não havia sido capturada neste fechamento).`,
    }].sort((a, b) => (Number(b.vgv) || 0) - (Number(a.vgv) || 0)).map((a, i) => ({ ...a, posicao: i + 1 }))
    const vgvTotal = r2(Number(f.vgv_total) + 510300)
    const comAss = r2(Number(f.comissao_assessoria) + 10206)
    const sobra = r2(Number(f.receita_bula) - comAss)
    console.log(`  + Bulinha vgv 510.300 com ${brl(10206)}`)
    console.log(`  vgv_total ${brl(f.vgv_total)} -> ${brl(vgvTotal)} | comissao_assessoria ${brl(f.comissao_assessoria)} -> ${brl(comAss)} | sobra ${brl(f.sobra_bruta)} -> ${brl(sobra)}`)
    await updFech(f.id, { por_assessor: pa, vgv_total: vgvTotal, comissao_assessoria: comAss, sobra_bruta: sobra })
    if (!DRY_RUN) console.log('  ✔ gravado')
  }
}

/* ---- 1c) JEM 15/05: adiciona Bulinha 127.500 x 2% = 2.550 ---- */
{
  const f = await fetchFech('006321ae-0437-4250-bb32-2437822183bd')
  console.log(`\n[JEM 15/05] ${f.nome}`)
  if ((f.por_assessor || []).some((a) => isBulinha(a.nome))) console.log('  Bulinha já presente. pula.')
  else {
    const pa = [{
      posicao: 1, nome: 'Bulinha (Felipe Andrade)', empresa: 'Bula Assessoria', vgv: 127500, comissao: 2550,
      comissao_pct: 0.02, transacoes: 1, animais: 1, ticket_medio: 127500, pct_total: 1,
      observacao: `${MARK} VALOR 127.500 x 2% = 2.550 (planilha COMISSÃO BULINHA).`,
    }]
    const sobra = r2(Number(f.receita_bula) - 2550)
    console.log(`  + Bulinha vgv 127.500 com ${brl(2550)} | vgv_total 0 -> 127.500 | comissao 0 -> 2.550 | sobra ${brl(f.sobra_bruta)} -> ${brl(sobra)}`)
    await updFech(f.id, { por_assessor: pa, vgv_total: 127500, comissao_assessoria: 2550, sobra_bruta: sobra })
    if (!DRY_RUN) console.log('  ✔ gravado')
  }
}

/* ---- 2) JMP Touros: Mateus Alves 72.300 x 0,33% = 238,59 ---- */
{
  const f = await fetchFech('c0f291bb-17bc-4b10-b320-c5ed6e767057')
  console.log(`\n[JMP 14/06] ${f.nome}`)
  const cur = (f.por_assessor || []).find((a) => /mateus|matheus/i.test(String(a.nome || '')))
  if (!cur) { console.error('  Mateus não encontrado — ABORTA'); process.exit(1) }
  if (Number(cur.comissao) === 238.59) console.log('  já ajustado. pula.')
  else {
    const delta = r2(238.59 - (Number(cur.comissao) || 0))
    const pa = (f.por_assessor || []).map((a) => /mateus|matheus/i.test(String(a.nome || ''))
      ? { ...a, comissao: 238.59, comissao_pct: 0.0033, observacao: '[AJUSTE 23/07] 0,33% confirmado pelo chefe (planilha da equipe usava 3%). Base 72.300 (lotes 28/165/129, Rufino Kuhnem Junior).' }
      : a)
    const comAss = r2(Number(f.comissao_assessoria) + delta)
    const sobra = f.sobra_bruta == null ? null : r2(Number(f.sobra_bruta) - delta)
    console.log(`  Mateus Alves: ${brl(cur.comissao)} -> ${brl(238.59)} (0,33% de 72.300)`)
    console.log(`  comissao_assessoria ${brl(f.comissao_assessoria)} -> ${brl(comAss)} | sobra ${brl(f.sobra_bruta)} -> ${sobra == null ? '—' : brl(sobra)}`)
    const upd = { por_assessor: pa, comissao_assessoria: comAss }
    if (sobra != null) upd.sobra_bruta = sobra
    await updFech(f.id, upd)
    if (!DRY_RUN) console.log('  ✔ gravado')
  }
}

/* ---- 3) CPs (venc 27/07) ---- */
{
  console.log('\n[CPs]')
  const mk = async (doc, fornecedor_id, valor, desc, obs, fechId) => {
    const { data: dup } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', doc)
    if (dup && dup.length) { console.log(`  ${doc} já existe. pula.`); return }
    console.log(`  cria ${doc}: ${brl(valor)}`)
    if (DRY_RUN) return
    const { error } = await sb.from('erp_contas_pagar').insert([{
      descricao: desc, fornecedor_id, categoria_id: CAT_COMISSAO, centro_custo_id: CC_PARCEIROS,
      valor, emissao: '2026-07-23', vencimento: '2026-07-27', status: 'aberto',
      numero_documento: doc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
      observacoes: obs, tags: ['a-pagar', 'comissao', '2026', 'leilao'],
      fechamento_id: fechId || null, vendedor: 'Financeiro / Comercial',
    }])
    if (error) { console.error('  ERRO:', error.message); process.exit(1) }
    console.log('  ✔ criado')
  }
  await mk('BULA-2026-CP-COM-EAO-MAIO-BULINHA', FORN_BULINHA, 14060,
    'COMISSAO 6º MEGA EAO TOUROS (03/05) - BULINHA (FELIPE ANDRADE) (2%)',
    `${MARK} 703.000 x 2% = 14.060 conforme planilha COMISSÃO BULINHA do chefe (23/07). Vinculado ao fechamento 293de295-32b9-4256-976e-ef344b2667b8.`,
    '293de295-32b9-4256-976e-ef344b2667b8')
  await mk('BULA-2026-CP-COM-4R-MAIO-BULINHA', FORN_BULINHA, 10206,
    'COMISSAO 32º LEILAO 4R (09/05) - BULINHA (FELIPE ANDRADE) (2%)',
    `${MARK} 510.300 x 2% = 10.206 conforme planilha COMISSÃO BULINHA do chefe (23/07). Vinculado ao fechamento b3d1c05c-2d37-4f9d-b1e4-a21c12540619.`,
    'b3d1c05c-2d37-4f9d-b1e4-a21c12540619')
  await mk('BULA-2026-CP-COM-JEM-MAIO-BULINHA', FORN_BULINHA, 2550,
    'COMISSAO 2º NELORE JEM (15/05) - BULINHA (FELIPE ANDRADE) (2%)',
    `${MARK} 127.500 x 2% = 2.550 conforme planilha COMISSÃO BULINHA do chefe (23/07). Vinculado ao fechamento 006321ae-0437-4250-bb32-2437822183bd.`,
    '006321ae-0437-4250-bb32-2437822183bd')
  await mk('BULA-2026-CP-COM-JMP-TOUROS-MATHEUS-ALVES', FORN_MATHEUS, 238.59,
    'COMISSAO 10O LEILÃO JMP TOUROS - MATHEUS ALVES (0,33%)',
    '[AJUSTE 23/07] 72.300 (lotes 28/165/129, Rufino Kuhnem Junior) x 0,33% = 238,59. Chefe confirmou 0,33% — a planilha da equipe usava 3% (2.169) e um total de base (96.300) que não fecha com as próprias linhas (72.300). Vinculado ao fechamento c0f291bb-17bc-4b10-b320-c5ed6e767057.',
    'c0f291bb-17bc-4b10-b320-c5ed6e767057')
}

console.log(DRY_RUN ? '\nDRY RUN concluído.' : '\nConcluído.')
