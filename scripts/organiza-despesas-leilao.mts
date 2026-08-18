/**
 * DESPESA OPERACIONAL POR LEILÃO — quem gastou, em qual leilão, e por quê.
 *
 *   npx tsx scripts/organiza-despesas-leilao.mts            (relatório)
 *   npx tsx scripts/organiza-despesas-leilao.mts --apply    (grava)
 *
 * POR QUE ESTE SCRIPT EXISTE
 * O ERP tinha 67 despesas operacionais (R$ 105.628,80 em passagem, estadia,
 * diária, alimentação, uniforme, estrutura) e NENHUMA vinculada a um leilão.
 * Sem esse vínculo não dá para saber o custo real de um leilão nem cobrar o
 * que é reembolsável, e a despesa vira um bolo mensal sem dono.
 *
 * O PADRÃO, medido no HastaPro (FIN_TITULOS.LEI_CODIGO amarra cada despesa ao
 * leilão, filial 2, 2026): dos 83 leilões com despesa, 23 têm despesa
 * operacional, somando R$ 80.309,52 — e são justamente os PRESENCIAIS. Os que
 * têm "VIRTUAL" no nome ficam em zero: leilão virtual não desloca equipe, não
 * paga hotel nem alimentação. Quando aparece despesa de deslocamento num
 * virtual, ou a despesa está no leilão errado ou o leilão está classificado
 * errado — nos dois casos é erro, e o relatório aponta.
 *
 * COMO VINCULA
 *   1. citação direta: os tokens distintivos do nome do leilão aparecem na
 *      descrição da despesa ("Passagem Douglas Leilao JMP" -> 10º Leilão JMP),
 *      com a data dentro da janela de viagem (30 dias antes a 45 depois).
 *   2. citação múltipla ("REEMBOLSO DESPESAS LEILÕES TRESMAR/JMP/FLOR DO
 *      ARATAU"): NÃO escolhe um. Marca `despesa-multi-leilao` e registra quais
 *      leilões dividem a conta — o rateio depende de critério que só o
 *      financeiro define, e chutar aqui viraria custo errado por leilão.
 *   3. sem citação: fica sem vínculo e entra no relatório. Proximidade de data
 *      sozinha não basta — em semana de feira há vários leilões na mesma data.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { ehDespesaOperacional, ehLeilaoVirtual, semAcento } from '../src/lib/erp-evento'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) as Record<string, string>
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const dia = 86400000

async function todos(t: string, sel: string): Promise<any[]> {
  const out: any[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(t).select(sel).range(i, i + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    out.push(...data); if (data.length < 1000) break
  }
  return out
}

// palavras que aparecem em quase todo nome de leilão e não identificam nada
const GENERICAS = new Set(['leilao', 'leilão', 'virtual', 'nelore', 'matrizes', 'touros', 'femeas',
  'fêmeas', 'macho', 'machos', 'especial', 'mega', 'edicao', 'edição', 'etapa', 'dia', 'da', 'de',
  'do', 'das', 'dos', 'e', 'a', 'o', 'agropecuaria', 'agropecuária', 'fazenda', 'genetica',
  'genética', 'selecao', 'seleção', 'evento', 'anos', 'bezerras', 'reprodutores', 'provados',
  'top', 'premium', 'safra', 'abertura', 'temporada', 'so', 'só', 'criador', 'grifes'])

// tokens puramente numéricos ficam de fora: o "2026" do nome do leilão casa
// com qualquer descrição que cite o ano e produz vínculo falso
const tokensDe = (nome: string) =>
  semAcento(String(nome || '')).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(t => t.length >= 4 && !/^\d+$/.test(t) && !GENERICAS.has(t))

const cats = await todos('erp_categorias', 'id,nome')
const catNome = new Map(cats.map(c => [c.id, String(c.nome)]))
const fech = await todos('bula_leilao_fechamento', 'id,nome,data,vgv_total,observacoes')
const cps = await todos('erp_contas_pagar', 'id,descricao,valor,status,vencimento,data_pagamento,categoria_id,fechamento_id,tags,observacoes')

/* ── 1. presencial x virtual ──────────────────────────────────────────────── */
console.log('═══ 1. MODALIDADE DOS LEILÕES (o nome é quem diz) ═══')
const virtuais = fech.filter(f => ehLeilaoVirtual(f.nome))
console.log(`  ${fech.length} fechamentos | ${virtuais.length} virtuais | ${fech.length - virtuais.length} presenciais/híbridos`)

/* ── 2. vincula despesa ao leilão ─────────────────────────────────────────── */
const CAT_OPER = /despesa operacional|viagem|passage|reembolso/i
const despesas = cps.filter(c => c.status !== 'cancelado'
  && (CAT_OPER.test(catNome.get(c.categoria_id) || '') || ehDespesaOperacional(c.descricao)))
console.log(`\n═══ 2. DESPESAS OPERACIONAIS: ${despesas.length} — ${brl(despesas.reduce((s, c) => s + Number(c.valor), 0))} ═══`)

let ligadas = 0, vLigadas = 0, multi = 0, vMulti = 0
const semDono: any[] = []
for (const c of despesas) {
  if (c.fechamento_id) continue
  const desc = semAcento(String(c.descricao)).toLowerCase()
  const ref = new Date(c.data_pagamento || c.vencimento).getTime()
  const candidatos = fech.filter(f => {
    const t = new Date(f.data).getTime()
    if (ref < t - 30 * dia || ref > t + 45 * dia) return false
    const toks = tokensDe(f.nome)
    if (!toks.length) return false
    return toks.some(tk => desc.includes(tk))
  })
  if (!candidatos.length) { semDono.push(c); continue }

  if (candidatos.length > 1) {
    multi++; vMulti += Number(c.valor)
    const nomes = candidatos.map(f => f.nome).join(' | ')
    console.log(`  ~ ${String(c.vencimento).slice(0, 10)} ${brl(c.valor).padStart(11)} ${String(c.descricao).slice(0, 44)}`)
    console.log(`      divide entre ${candidatos.length}: ${nomes.slice(0, 90)}`)
    if (APPLY) {
      await sb.from('erp_contas_pagar').update({
        tags: [...new Set([...(c.tags || []), 'despesa-multi-leilao'])],
        observacoes: [String(c.observacoes || '').trim(),
          `[organização] Despesa de mais de um leilão: ${nomes}. Não vinculada a um só porque o rateio depende de critério do financeiro — definir o critério e distribuir.`,
        ].filter(Boolean).join('\n'),
      }).eq('id', c.id)
    }
    continue
  }

  const f = candidatos[0]
  ligadas++; vLigadas += Number(c.valor)
  const alerta = ehLeilaoVirtual(f.nome) ? '   <== VIRTUAL com despesa de campo: conferir' : ''
  console.log(`  + ${String(c.vencimento).slice(0, 10)} ${brl(c.valor).padStart(11)} ${String(c.descricao).slice(0, 40)}`)
  console.log(`      -> ${String(f.data).slice(0, 10)} ${String(f.nome).slice(0, 58)}${alerta}`)
  if (APPLY) {
    await sb.from('erp_contas_pagar').update({
      fechamento_id: f.id,
      tags: [...new Set([...(c.tags || []), 'despesa-leilao'])],
    }).eq('id', c.id)
  }
}
console.log(`\n  -> ${ligadas} despesas vinculadas (${brl(vLigadas)})`)
console.log(`  -> ${multi} de leilão múltiplo, marcadas para rateio (${brl(vMulti)})`)
console.log(`  -> ${semDono.length} sem leilão identificável (${brl(semDono.reduce((s, c) => s + Number(c.valor), 0))})`)

/* ── 3. a regra: virtual não gasta em campo ───────────────────────────────── */
console.log('\n═══ 3. REGRA: LEILÃO VIRTUAL NÃO TEM DESPESA DE CAMPO ═══')
const porFech = new Map<string, number>()
// o que conta é o vínculo (tag posta aqui) ou a natureza do texto — um PIX
// "Leilao Cachoeirao" é despesa de campo mesmo sem a palavra "hotel"
for (const c of cps.filter(c => c.fechamento_id && c.status !== 'cancelado'
  && ((c.tags || []).includes('despesa-leilao') || ehDespesaOperacional(c.descricao)))) {
  porFech.set(c.fechamento_id, (porFech.get(c.fechamento_id) || 0) + Number(c.valor))
}
let violacoes = 0
for (const f of virtuais) {
  const v = porFech.get(f.id)
  if (!v) continue
  violacoes++
  console.log(`  ! ${String(f.data).slice(0, 10)} ${brl(v).padStart(11)} em ${String(f.nome).slice(0, 52)}`)
}
console.log(violacoes === 0
  ? '  OK — nenhum leilão virtual com despesa de deslocamento/estadia.'
  : `  ${violacoes} leilões virtuais com despesa de campo: ou a despesa está no leilão errado, ou o leilão não era virtual.`)

/* ── 4. custo por leilão ──────────────────────────────────────────────────── */
console.log('\n═══ 4. CUSTO OPERACIONAL POR LEILÃO ═══')
const linhas = fech.filter(f => porFech.has(f.id))
  .map(f => ({ f, v: porFech.get(f.id)! }))
  .sort((a, b) => b.v - a.v)
for (const { f, v } of linhas.slice(0, 20)) {
  const pct = Number(f.vgv_total) ? (v / Number(f.vgv_total) * 100).toFixed(2) + '% do VGV' : '—'
  console.log(`  ${String(f.data).slice(0, 10)} ${brl(v).padStart(12)} (${pct.padStart(14)})  ${String(f.nome).slice(0, 46)}`)
}
console.log(`  -> ${linhas.length} leilões com custo operacional | ${brl(linhas.reduce((s, l) => s + l.v, 0))}`)

console.log(APPLY ? '\nAPLICADO.' : '\nRELATÓRIO. Use --apply para gravar.')
