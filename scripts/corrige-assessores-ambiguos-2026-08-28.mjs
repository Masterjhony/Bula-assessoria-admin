/**
 * Desambiguação dos nomes de assessor no comissionamento (28/08/2026).
 *
 * Corrige as entradas de `por_assessor`/`lances` que não são pessoa da equipe
 * — validadas lote a lote no HastaPro (LOT_PISTEIRO + tabela ASSESSORIA),
 * na captura do grupo de lances e na planilha COMISSAO AGOSTO do Douglas:
 *
 *  1. Cachoeirão 03/06, lote 43 — "Fabricio Hyppolito" é o COMPRADOR
 *     (Faz. Sabiá Dourado/PA), não assessor. Pisteiro = Felipe Vilela Andrade
 *     (Bulinha). Leilão é da BULA REMATES (FIL '01') → Bulinha 0% (regra do
 *     chefe 23/07). O lote são 3 animais / R$ 49.500 (o ERP tinha 1 × 16.500,
 *     que é o valor POR ANIMAL). A CP de R$ 330 já estava cancelada.
 *  2. Naviraí Reprodutores 23/08, lote 59 — "Com Douglas Bispo - Bula
 *     Assessoria - Julimar Belarmino": Julimar é o comprador; assessor =
 *     Douglas Bispo (HastaPro + planilha do próprio Douglas).
 *  3. Guadalupe Touros 19/07, lote 60 — "Nane / Fábio Omena" → Fábio Omena
 *     (decisão do João, 28/08). O cliente (Reinaldo Tavares, Faz. N. Sra. de
 *     Fátima) é dele no lote 25 do mesmo pregão e a CP de R$ 420 já foi
 *     baixada contra o PIX do Fábio de 25/08.
 *  4. Cadastro de Equipe: "Fábio Omena Gaia" e "Laila Oliveira" viram apelidos
 *     — sem isso a tela mostra o Fábio e a Laila partidos em duas pessoas.
 *
 * NÃO mexe nos lotes 11 (22/08) e 21 (23/08) do Condomínio Magda/Jacamim:
 * HastaPro diz Bulinha, o grupo diz Peralta — pendente de decisão.
 *
 * Uso: node scripts/corrige-assessores-ambiguos-2026-08-28.mjs [--apply]
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const APPLY = process.argv.includes('--apply')
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100
const log = (...a) => console.log(...a)

const CACHOEIRAO = '9e017caf-8899-4852-99a5-d506bb5905b6'
const NAVIRAI = '41ba14d3-4c76-4180-957d-730d283a3365'
const GUADALUPE = 'c8cba93d-8fa9-4e80-9aa7-e2706a2d54b4'

/** Reagrega por_assessor a partir dos lances, preservando pct/comissão por nome.
 * Entradas antigas SEM lance correspondente (VGV lançado só no agregado — é o
 * caso do Gustavo Rusa no Cachoeirão) são preservadas intactas: este script
 * desambigua nome, não faz saneamento de cobertura. */
function reagrega(lances, anterior, removidos = []) {
  const prev = new Map((anterior || []).map((a) => [String(a.nome || '').trim(), a]))
  const comLance = new Set(lances.filter((v) => v && !v.cancelada).map((v) => String(v.assessor || 'A definir').trim()))
  const fora = new Set(removidos.map((n) => String(n).trim()))
  const orfaos = (anterior || []).filter((a) => {
    const n = String(a.nome || '').trim()
    return !comLance.has(n) && !fora.has(n)
  })
  const by = new Map()
  for (const v of lances) {
    if (!v || v.cancelada) continue
    const nome = String(v.assessor || 'A definir').trim()
    const cur = by.get(nome) || { nome, empresa: v.empresa || 'Bula Assessoria', transacoes: 0, animais: 0, vgv: 0 }
    cur.transacoes += 1
    cur.animais += Number(v.animais) || 0
    cur.vgv = r2(cur.vgv + (Number(v.vgv) || 0))
    by.set(nome, cur)
  }
  const total = [...by.values()].reduce((s, a) => s + a.vgv, 0) + orfaos.reduce((s, a) => s + (Number(a.vgv) || 0), 0)
  const doLance = [...by.values()].map((a) => {
    const p = prev.get(a.nome)
    const pct = p?.comissao_pct != null ? Number(p.comissao_pct) : 0.02
    return {
      ...(p || {}),
      nome: a.nome, empresa: p?.empresa || a.empresa,
      transacoes: a.transacoes, animais: a.animais, vgv: a.vgv,
      ticket_medio: a.animais ? Math.round(a.vgv / a.animais) : 0,
      comissao_pct: pct,
      comissao: p?.comissao != null ? r2(a.vgv * pct) : p?.comissao,
    }
  })
  return [...doLance, ...orfaos].sort((a, b) => (Number(b.vgv) || 0) - (Number(a.vgv) || 0))
    .map((a, i) => ({ ...a, posicao: i + 1, pct_total: total ? r2((Number(a.vgv) || 0) / total * 100) / 100 : 0 }))
}

async function corrige(id, titulo, mutador) {
  const { data: f, error } = await sb.from('bula_leilao_fechamento').select('*').eq('id', id).single()
  if (error) throw new Error(`${titulo}: ${error.message}`)
  const lances = JSON.parse(JSON.stringify(f.lances || []))
  const antes = { vgv: f.vgv_total, com: f.comissao_assessoria, an: f.animais_vendidos, por: f.por_assessor }
  const patch = mutador(lances, f)
  if (!patch) { log(`\n== ${titulo}: nada a fazer`); return }

  const vivos = lances.filter((v) => v && !v.cancelada)
  const por_assessor = reagrega(lances, f.por_assessor, patch.removeNomes || [])
  for (const [nome, campos] of Object.entries(patch.override || {})) {
    const a = por_assessor.find((x) => String(x.nome).trim() === nome)
    if (a) Object.assign(a, campos)
  }
  // VGV/animais saem do por_assessor final (inclui o que só existe no agregado)
  const vgv = r2(por_assessor.reduce((s, a) => s + (Number(a.vgv) || 0), 0))
  const animais = por_assessor.reduce((s, a) => s + (Number(a.animais) || 0), 0)
  const comissao = r2(por_assessor.reduce((s, a) => s + (Number(a.comissao) || 0), 0))

  log(`\n== ${titulo}`)
  log('   VGV        ', brl(antes.vgv), '→', brl(vgv))
  log('   animais    ', antes.an, '→', animais)
  log('   comissão   ', brl(antes.com), '→', brl(comissao))
  log('   por_assessor:')
  for (const a of por_assessor) log('      ' + String(a.nome).padEnd(30), brl(a.vgv).padStart(13), 'pct=' + a.comissao_pct, 'com=' + brl(a.comissao))

  if (!APPLY) { log('   [dry-run] nada gravado'); return }
  const { error: e2 } = await sb.from('bula_leilao_fechamento').update({
    lances, por_assessor, vgv_total: vgv, animais_vendidos: animais,
    lotes_vendidos: vivos.length, comissao_assessoria: comissao,
    maior_lance: vivos.reduce((m, v) => Math.max(m, Number(v.vgv) || 0), 0),
    ticket_medio: animais ? Math.round(vgv / animais) : 0,
    observacoes: [f.observacoes, patch.nota].filter(Boolean).join('\n'),
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (e2) throw new Error(`${titulo}: ${e2.message}`)
  log('   ✓ gravado')
}

// 1) Cachoeirão — lote 43
await corrige(CACHOEIRAO, 'Destaques da Safra Nelore Cachoeirão 03/06 — lote 43', (lances) => {
  const l = lances.find((v) => String(v.lote) === '43')
  if (!l) return null
  l.assessor = 'Bulinha (Felipe Andrade)'
  l.comprador = 'FABRICIO OSÓRIO HYPPOLITO · FAZENDA SABIA DOURADO · PA'
  l.uf = 'PA'
  l.animais = 3
  l.vgv = 49500
  l.valor = 550
  l.parcelas = 30
  l.fonte = 'hastapro'
  return { removeNomes: ['Fabricio Hyppolito'],
    override: { 'Bulinha (Felipe Andrade)': { comissao: 0, comissao_pct: 0, empresa: 'Bula Assessoria' } },
    nota: '[DESAMBIGUACAO 28/08/2026] Lote 43: "Fabricio Hyppolito" era o COMPRADOR (cliente HastaPro 251010095116153, Faz. Sabia Dourado/PA), nao assessor — pisteiro/ASSESSORIA=VENDA e Felipe Vilela Andrade (Bulinha). Leilao e da BULA REMATES (FIL 01) => Bulinha 0%. Lote sao 3 animais x 550 x 30 = 49.500 (o ERP tinha 1 animal e 16.500, que e o valor por animal). A CP de 330,00 ja estava cancelada em 27/07.' }
})

// 2) Naviraí Reprodutores — lote 59
await corrige(NAVIRAI, '28º Naviraí Camparino Reprodutores 23/08 — lote 59', (lances) => {
  const l = lances.find((v) => String(v.assessor || '').startsWith('Com Douglas Bispo'))
  if (!l) return null
  l.assessor = 'Douglas Bispo'
  l.comprador = 'JULIMAR BELARMINO DA SILVA · FAZENDA RIO DOS SONHOS · PA'
  l.uf = 'PA'
  return { removeNomes: ['Com Douglas Bispo - Bula Assessoria - Julimar Belarmino'], nota: '[DESAMBIGUACAO 28/08/2026] Lote 59: o parser gravou a frase inteira da mensagem como assessor. Julimar Belarmino e o COMPRADOR; assessor = Douglas Bispo (HastaPro LOT_PISTEIRO + planilha COMISSAO AGOSTO do proprio Douglas, linha "TOUROS NAVIRAI/CAMPARINO 23/08 lote 59 33.000 JULIMAR BELARMINO").' }
})

// 3) Guadalupe Touros — lote 60
await corrige(GUADALUPE, '20º Guadalupe Agropecuária Touros 19/07 — lote 60', (lances) => {
  const l = lances.find((v) => String(v.assessor || '').trim() === 'Nane / Fábio Omena')
  if (!l) return null
  l.assessor = 'Fábio Omena'
  return { removeNomes: ['Nane / Fábio Omena'], nota: '[DESAMBIGUACAO 28/08/2026] Lote 60 (Sr. Reinaldo e dona Maria Tavares, Faz. Nossa Senhora de Fatima, Vila Bela/MT): a mensagem do grupo declara "a Nane e o Fabio Omena". Decisao do Joao em 28/08: 100% Fabio Omena — o cliente e dele (lote 25 do mesmo pregao declara so o Fabio) e a CP de 420,00 ja foi baixada contra o PIX de 25/08 pago ao Fabio. Sem ajuste financeiro.' }
})

// 4) Cadastro de Equipe — apelidos que faltam
const apelidosNovos = [
  ['FABIO OMENNA', ['Fábio Omena Gaia', 'Fabio Omena Gaia']],
  ['LAILA', ['Laila Oliveira', 'Laila de Sousa Oliveira']],
]
log('\n== Cadastro de Equipe (erp_folha_estrutura): apelidos que faltavam')
for (const [nome, novos] of apelidosNovos) {
  const { data: e } = await sb.from('erp_folha_estrutura').select('id,nome,apelidos').eq('nome', nome).maybeSingle()
  if (!e) { log(`   ${nome}: nao encontrado`); continue }
  const atual = e.apelidos || []
  const falta = novos.filter((n) => !atual.some((a) => a.toLowerCase() === n.toLowerCase()))
  if (!falta.length) { log(`   ${nome}: ja tem`); continue }
  log(`   ${nome}: ${JSON.stringify(atual)} + ${JSON.stringify(falta)}`)
  if (APPLY) {
    const { error } = await sb.from('erp_folha_estrutura').update({ apelidos: [...atual, ...falta] }).eq('id', e.id)
    if (error) throw new Error(`${nome}: ${error.message}`)
    log('   ✓ gravado')
  }
}

log('\n' + (APPLY ? 'APLICADO.' : 'DRY-RUN — rode com --apply para gravar.'))
