/**
 * VÍNCULO E COBRANÇA RETROATIVA DOS LEILÕES (18/08/2026).
 *
 * O João apontou o Leilão Nelore Magda (28/06) fora da lista — e a varredura
 * do ano inteiro mostrou que ele era a ponta do iceberg: 45 fechamentos nunca
 * tiveram conta a receber vinculada. Ao cruzar com os recebíveis existentes:
 *
 *   · 23 JÁ FORAM COBRADOS, mas o título ficou sem `fechamento_id` — só falta
 *     amarrar (não muda dinheiro nenhum, corrige a rastreabilidade);
 *   · 22 nunca viraram cobrança. Em 18 deles a Bula já PAGOU comissão ao
 *     assessor (R$ 74 mil) — ou seja, operou o leilão e não faturou o criador.
 *
 * ETAPA 1 (--vincular): amarra CR → fechamento quando houver candidato único,
 * data posterior ao leilão e valor entre 0,5% e 25% do VGV (faixa dos acordos
 * reais). Ambíguo não é tocado.
 *
 * ETAPA 2 (--cobrar): cria a cobrança dos leilões órfãos QUE TIVERAM COMISSÃO
 * PAGA — a comissão é a prova de que a Bula assessorou o evento. Percentual =
 * histórico do próprio criador quando existe, senão 5% (padrão dominante).
 * Vencimento = leilão + 45 dias, então cobranças antigas nascem VENCIDAS: é o
 * retrato correto de uma cobrança atrasada.
 *
 * Leilão sem comissão paga fica de fora e é listado — pode ser evento em que a
 * Bula não teve participação comercial.
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
const FASE_VINCULAR = process.argv.includes('--vincular')
const FASE_COBRAR = process.argv.includes('--cobrar')

const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const dia = d => String(d || '').slice(0, 10)
const maisDias = (iso, n) => { const d = new Date(dia(iso) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const ddmm = iso => { const [, m, d] = dia(iso).split('-'); return `${d}/${m}` }
const mk = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const STOP = new Set(['leilao', 'nelore', 'virtual', 'mega', 'evento', 'etapa', '2026', 'dia'])
const toks = s => mk(s).split(' ').filter(w => w.length > 3 && !STOP.has(w))

/**
 * Desambiguação: dois eventos do mesmo criador só podem ser o mesmo título se
 * a CATEGORIA (matrizes/reprodutores/touros/fêmeas…) e a ETAPA (1ª/2ª) baterem.
 * Sem isso o matcher casava a 1ª etapa do Naviraí com a 2ª — trocando cobranças.
 */
// prefixos → categoria canônica (o extrato abrevia: "2ª ETAPA REPR.")
const CAT_PREFIXOS = [
  ['matriz', 'MATRIZ'], ['reprodut', 'REPR'], ['repr', 'REPR'], ['touro', 'TOURO'],
  ['femea', 'FEMEA'], ['bezerr', 'BEZERRO'], ['embri', 'EMBRIAO'], ['macho', 'MACHO'],
]
const CATEGORIAS = CAT_PREFIXOS.map(([p]) => p)
const ORDINAIS = { '1': '1', '1a': '1', 'primeira': '1', 'i': '1', '2': '2', '2a': '2', 'segunda': '2', 'ii': '2', '3': '3', '3a': '3', 'terceira': '3' }
function marcadores(s) {
  const t = mk(s)
  const cats = [...new Set(CAT_PREFIXOS.filter(([p]) => t.includes(p)).map(([, c]) => c))]
  const palavras = t.split(' ')
  const ords = new Set()
  palavras.forEach((w, i) => {
    const o = ORDINAIS[w]
    // só conta ordinal que qualifica "etapa"/"dia" ou vem colado à categoria
    if (o && (palavras[i + 1] === 'etapa' || palavras[i + 1] === 'dia' || CATEGORIAS.includes(palavras[i + 1]))) ords.add(o)
  })
  return { cats, ords: [...ords] }
}
function compativel(nomeA, nomeB) {
  const a = marcadores(nomeA), b = marcadores(nomeB)
  if (a.cats.length && b.cats.length && !a.cats.some(c => b.cats.includes(c))) return false
  if (a.ords.length && b.ords.length && !a.ords.some(o => b.ords.includes(o))) return false
  return true
}

/** criador → % efetivo sobre a cobertura, derivado dos recebíveis já cobrados */
const PCT_POR_CRIADOR = [
  [/matinha/i, 0.05], [/katispera/i, 0.06], [/terra brava/i, 0.1119], [/\beao\b/i, 0.0860],
  [/navirai|naviraí/i, 0.05], [/camparino/i, 0.005], [/guadalupe/i, 0.05], [/santa naz/i, 0.0529],
  [/tresmar/i, 0.0543], [/cachoeirao|cachoeirão/i, 0.069], [/\bls\b|collection|galeria|next|\bnow\b/i, 0.10],
  [/parana|paranã/i, 0.05], [/sorriso/i, 0.05], [/bambu|bambú|essencia|essência/i, 0.05],
]
const pctDe = nome => (PCT_POR_CRIADOR.find(([re]) => re.test(nome))?.[1]) ?? 0.05
const baseDe = nome => PCT_POR_CRIADOR.find(([re]) => re.test(nome))
  ? `percentual efetivo já praticado com este criador nos recebíveis anteriores`
  : `padrão dominante de 5% da cobertura (criador sem recebível anterior)`

const { data: fes } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,vgv_total,comissao_assessoria').order('data')
const { data: crs } = await sb.from('erp_contas_receber')
  .select('id,descricao,vencimento,valor,status,fechamento_id').neq('status', 'cancelado')
const { data: cat } = await sb.from('erp_categorias').select('id').eq('nome', 'Comissao Leilao').maybeSingle()
const { data: cat2 } = await sb.from('erp_categorias').select('id').eq('nome', 'Comissoes Recebidas').maybeSingle()
const categoriaId = cat?.id || cat2?.id

const comCR = new Set((crs || []).filter(c => c.fechamento_id).map(c => c.fechamento_id))
const semVinc = (crs || []).filter(c => !c.fechamento_id)
const orfaos = (fes || []).filter(f => !comCR.has(f.id) && Number(f.vgv_total) > 0)

/* ── ETAPA 1: vincular CR já existente ao fechamento ─────────────────────── */
if (FASE_VINCULAR) {
  console.log('=== VÍNCULO CR → FECHAMENTO (não muda valores) ===')
  const usados = new Set()
  let n = 0
  for (const f of orfaos) {
    const t = toks(f.nome)
    if (!t.length) continue
    const cand = semVinc.filter(c =>
      !usados.has(c.id) &&
      dia(c.vencimento) >= dia(f.data) &&
      t.filter(w => mk(c.descricao).includes(w)).length >= Math.min(2, t.length) &&
      compativel(f.nome, c.descricao) &&
      Number(c.valor) >= Number(f.vgv_total) * 0.005 &&
      Number(c.valor) <= Number(f.vgv_total) * 0.25)
    if (cand.length !== 1) continue     // ambíguo ou nenhum: não arrisca
    const c = cand[0]
    usados.add(c.id)
    n++
    console.log(`  ${dia(f.data)} ${f.nome.slice(0, 42).padEnd(42)} <- ${brl(c.valor).padStart(12)} ${String(c.descricao).slice(0, 40)} (${c.status})`)
    if (APPLY) {
      const { error } = await sb.from('erp_contas_receber')
        .update({ fechamento_id: f.id }).eq('id', c.id)
      if (error) console.error('    ERRO: ' + error.message)
    }
  }
  console.log(`\n-> ${n} recebíveis amarrados ao fechamento correspondente`)
}

/* ── ETAPA 2: cobrar os leilões que ficaram sem faturamento ──────────────── */
if (FASE_COBRAR) {
  // recarrega vínculos (a etapa 1 pode ter rodado agora)
  const { data: crs2 } = await sb.from('erp_contas_receber')
    .select('id,descricao,vencimento,valor,status,fechamento_id,tags').neq('status', 'cancelado')
  const jaTem = new Set((crs2 || []).filter(c => c.fechamento_id).map(c => c.fechamento_id))

  /**
   * TRAVA ANTI-COBRANÇA-DUPLA. O vínculo automático é conservador de propósito
   * (exige 2 tokens + categoria compatível), então sobram recebíveis que
   * cobrem o leilão sem terem sido amarrados — ex.: três pagamentos "SEMANA
   * GENETICA GUADALUPE - PROGRAMA" (R$ 14.228) para dois fechamentos, ou
   * "LEILÃO REPRODUTORES CAMPARINO - MATHEUS" (R$ 20.000).
   *
   * Antes de faturar qualquer coisa: se existir recebível cujo NOME DO CRIADOR
   * bate e a data cai na janela do evento (-30 a +150 dias), o leilão é tratado
   * como possivelmente já cobrado e NÃO gera título — só entra no relatório.
   */
  const GENERICO = new Set(['leilao', 'nelore', 'virtual', 'mega', 'evento', 'etapa', 'touros', 'matrizes',
    'femeas', 'bezerras', 'bezerros', 'machos', 'genetica', 'agropecuaria', 'fazenda', 'comissao', 'bula',
    'programa', 'remates', 'rural', 'safra', 'anos', 'edicao', 'especial', 'premium', 'selecao', 'origem'])
  const fortes = s => [...new Set(mk(s).split(' ').filter(w => w.length >= 5 && !GENERICO.has(w)))]
  const candidatosDe = (f) => {
    const tf = fortes(f.nome)
    if (!tf.length) return []
    const ini = maisDias(f.data, -30), fim = maisDias(f.data, 150)
    return (crs2 || []).filter(c =>
      !(Array.isArray(c.tags) && c.tags.includes('espelho-extrato')) &&
      dia(c.vencimento) >= ini && dia(c.vencimento) <= fim &&
      tf.some(w => mk(c.descricao).includes(w)))
  }

  const elegiveis = (fes || []).filter(f => !jaTem.has(f.id) && Number(f.vgv_total) > 0 && Number(f.comissao_assessoria) > 0)
  const possivelmenteCobrado = []
  const paraCobrar = []
  for (const f of elegiveis) {
    const cand = candidatosDe(f)
    if (cand.length) possivelmenteCobrado.push({ f, cand })
    else paraCobrar.push(f)
  }
  const semComissao = (fes || []).filter(f => !jaTem.has(f.id) && Number(f.vgv_total) > 0 && !(Number(f.comissao_assessoria) > 0))

  console.log('=== POSSIVELMENTE JÁ COBRADO (recebível do mesmo criador na janela do evento) ===')
  for (const x of possivelmenteCobrado) {
    console.log(`  ${dia(x.f.data)} ${x.f.nome.slice(0, 44).padEnd(44)} VGV ${brl(x.f.vgv_total).padStart(13)}`)
    for (const c of x.cand.slice(0, 3)) console.log(`       ${dia(c.vencimento)} ${brl(c.valor).padStart(12)} [${c.status}] ${String(c.descricao).slice(0, 52)}`)
  }
  console.log(`  -> ${possivelmenteCobrado.length} leilões NÃO serão faturados (conferir manualmente)\n`)

  console.log('\n=== COBRANÇA A LANÇAR (leilão com comissão paga = a Bula assessorou) ===')
  let total = 0
  for (const f of paraCobrar) {
    const pct = pctDe(f.nome)
    const valor = r2(Number(f.vgv_total) * pct)
    const venc = maisDias(f.data, 45)
    total += valor
    const atraso = venc < new Date().toISOString().slice(0, 10) ? ' [VENCIDA]' : ''
    console.log(`  ${dia(f.data)} ${f.nome.slice(0, 44).padEnd(44)} VGV ${brl(f.vgv_total).padStart(13)} × ${(pct * 100).toFixed(2)}% = ${brl(valor).padStart(12)} vence ${venc}${atraso}`)
    if (APPLY) {
      const { error } = await sb.from('erp_contas_receber').insert({
        descricao: `${f.nome} (${ddmm(f.data)}) - COMISSAO BULA`,
        valor, vencimento: venc, emissao: dia(f.data), status: 'aberto', parcela: 1,
        categoria_id: categoriaId, fechamento_id: f.id,
        tags: ['criterio-a-confirmar', 'cobranca-retroativa'],
        observacoes: `[18/08/2026] Cobrança retroativa: o leilão foi assessorado (comissão de ${brl(f.comissao_assessoria)} já paga aos assessores) e nunca foi faturado ao criador. Base: VGV de cobertura ${brl(f.vgv_total)} × ${(pct * 100).toFixed(2)}% — ${baseDe(f.nome)}. Vencimento = leilão + 45 dias. CRITÉRIO A CONFIRMAR.`,
      })
      if (error) console.error('    ERRO: ' + error.message)
    }
  }
  console.log(`\n-> ${paraCobrar.length} cobranças · ${brl(total)}`)

  console.log(`\n=== FORA (sem comissão paga — conferir se a Bula participou comercialmente) ===`)
  for (const f of semComissao) console.log(`  ${dia(f.data)} ${f.nome.slice(0, 50).padEnd(50)} VGV ${brl(f.vgv_total)}`)
}

if (!FASE_VINCULAR && !FASE_COBRAR) console.log('Use --vincular e/ou --cobrar (e --apply para gravar).')
else if (!APPLY) console.log('\nDRY-RUN. Use --apply para gravar.')
