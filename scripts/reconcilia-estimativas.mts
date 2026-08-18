/**
 * PREVISÃO x REAL x LOTE — um compromisso, uma linha que conta.
 *
 *   npx tsx scripts/reconcilia-estimativas.mts            (relatório)
 *   npx tsx scripts/reconcilia-estimativas.mts --apply    (grava)
 *
 * POR QUE ESTE SCRIPT EXISTE
 * O ERP produzia duas — às vezes três — linhas para o mesmo fato:
 *
 *   1. PREVISÃO: folha do mês seguinte, provisão de imposto, débito agendado,
 *      orçamento de despesa de leilão. Quando o pagamento real acontecia, a
 *      previsão continuava aberta e o "a pagar em 30 dias" cobrava de novo o
 *      que já tinha sido pago.
 *
 *   2. LOTE: o financeiro paga 13 comissões de leilão num PIX só. O extrato
 *      gera UM título (o pagamento) e os 13 analíticos por assessor/leilão já
 *      existiam. Nenhum dos dois é falso — mas somados dobram a despesa.
 *
 * O sintoma media R$ 269.663,74: os títulos pagos de 2026 excediam em 16,6% o
 * que de fato saiu do banco.
 *
 * A correção é estrutural. Cada título passa a declarar:
 *   origem      real | estimativa | sintetico
 *   evento_key  a identidade do FATO econômico (src/lib/erp-evento.ts)
 *
 * Com isso o trigger da migration 0074 encerra a previsão assim que o real
 * aparece — venha ele deste script, do importador de extrato, da UI do ERP ou
 * de qualquer rota futura. E o título de lote vira 'sintetico' (migration
 * 0075): continua sendo o caixa, sai da competência, onde os analíticos
 * respondem pela despesa.
 *
 * Idempotente: só grava o que mudou, pode rodar quantas vezes quiser. As
 * chaves são conservadoras — sem certeza da família do evento, `evento_key`
 * fica nula e o título é deixado em paz. Chave errada uniria compromissos
 * diferentes, e cancelar título por engano é pior do que uma previsão a mais.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { eventoKey, ehEstimativa, politicaSubstituicao, pessoaDoTexto } from '../src/lib/erp-evento'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) as Record<string, string>
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const cent = (n: number) => Math.round(Number(n || 0) * 100)

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

const COLS = 'id,descricao,valor,valor_pago,status,vencimento,data_pagamento,tags,categoria_id,fechamento_id,origem,evento_key,substituido_por,observacoes'
const COLS_CR = COLS.replace('valor_pago', 'valor_recebido').replace('data_pagamento', 'data_recebimento')

/* ══ ETAPA 1 — previsão x real ═══════════════════════════════════════════ */
console.log('══════ ETAPA 1: PREVISÃO x REAL ══════')
for (const tabela of ['erp_contas_pagar', 'erp_contas_receber']) {
  const rows = await todos(tabela, tabela.endsWith('pagar') ? COLS : COLS_CR)
  const alvo = rows.map(r => ({
    r,
    origem: r.origem === 'sintetico' ? 'sintetico' : (ehEstimativa(r.tags) ? 'estimativa' : 'real'),
    key: eventoKey({ descricao: r.descricao, vencimento: r.vencimento, fechamento_id: r.fechamento_id }),
  }))
  const comKey = alvo.filter(a => a.key)
  console.log(`\n${tabela}: ${rows.length} títulos | ${alvo.filter(a => a.origem === 'estimativa').length} previsões | ${comKey.length} com chave`)

  const porKey = new Map<string, typeof alvo>()
  for (const a of comKey) {
    if (!porKey.has(a.key!)) porKey.set(a.key!, [])
    porKey.get(a.key!)!.push(a)
  }
  let pares = 0, valor = 0
  for (const [key, g] of porKey) {
    const prev = g.filter(a => a.origem === 'estimativa' && a.r.status !== 'cancelado')
    const real = g.filter(a => a.origem === 'real' && a.r.status !== 'cancelado')
    if (!prev.length || !real.length) continue
    const pol = politicaSubstituicao(key)
    const vPrev = prev.reduce((s, a) => s + Number(a.r.valor), 0)
    const vReal = real.reduce((s, a) => s + Number(a.r.valor), 0)
    if (pol === 'agregada' && vReal < vPrev) continue
    pares++; valor += vPrev
    console.log(`  x ${key} [${pol}] — previsão ${brl(vPrev)} encerrada pelo real ${brl(vReal)}`)
  }
  console.log(`  -> ${pares} eventos | ${brl(valor)} de previsão que o real já cobriu`)

  if (!APPLY) continue
  let n = 0
  // previsões primeiro: quando o real for gravado, o trigger já as encontra
  for (const fase of ['estimativa', 'real', 'sintetico']) {
    for (const a of alvo.filter(x => x.origem === fase)) {
      if (a.r.origem === a.origem && a.r.evento_key === a.key) continue
      await sb.from(tabela).update({ origem: a.origem, evento_key: a.key }).eq('id', a.r.id)
      n++
    }
  }
  console.log(`  gravado: ${n} títulos classificados`)
}

/* ══ ETAPA 2 — pagamento em lote x analíticos ════════════════════════════ */
console.log('\n══════ ETAPA 2: PAGAMENTO EM LOTE x ANALÍTICOS ══════')
{
  const cats = await todos('erp_categorias', 'id,nome')
  const catNome = new Map(cats.map(c => [c.id, String(c.nome)]))
  const movs = await todos('erp_movimentos_bancarios', 'id,conta_pagar_id')
  const comMov = new Set(movs.filter(m => m.conta_pagar_id).map(m => m.conta_pagar_id))
  const cps = await todos('erp_contas_pagar', COLS)

  const pago = (c: any) => ['pago', 'parcial'].includes(c.status)
  const vl = (c: any) => Number(c.valor_pago || c.valor || 0)
  const ehEspelho = (c: any) => (c.tags || []).includes('espelho-extrato')
  const ehComissao = (c: any) => /comiss|repasse/i.test(catNome.get(c.categoria_id) || '')

  const analiticos = cps.filter(c => pago(c) && !ehEspelho(c) && !comMov.has(c.id) && ehComissao(c))
  // o pagamento do lote pode ter caído em QUALQUER categoria no extrato (PIX
  // genérico, reembolso, transferência) — quem restringe é a pessoa + a janela
  // de datas em torno da baixa dos analíticos, não a categoria
  const espelhos = cps.filter(c => pago(c) && ehEspelho(c) && c.origem !== 'sintetico')

  const porPessoa = new Map<string, { an: any[]; es: any[] }>()
  const põe = (c: any, lado: 'an' | 'es') => {
    const p = pessoaDoTexto(c.descricao); if (!p) return
    if (!porPessoa.has(p)) porPessoa.set(p, { an: [], es: [] })
    porPessoa.get(p)![lado].push(c)
  }
  analiticos.forEach(c => põe(c, 'an'))
  espelhos.forEach(c => põe(c, 'es'))

  /** Subconjunto de espelhos cuja soma é exatamente o total dos analíticos. */
  function subconjunto(es: any[], alvoCent: number): any[] | null {
    const itens = es.slice(0, 18)
    let achado: any[] | null = null
    const busca = (i: number, soma: number, acc: any[]) => {
      if (achado) return
      if (soma === alvoCent && acc.length) { achado = acc.slice(); return }
      if (i >= itens.length || soma > alvoCent) return
      busca(i + 1, soma + cent(vl(itens[i])), [...acc, itens[i]])
      busca(i + 1, soma, acc)
    }
    busca(0, 0, [])
    return achado
  }

  let lotes = 0, valorLote = 0
  const pendentes: string[] = []
  for (const [p, g] of porPessoa) {
    if (!g.an.length || !g.es.length) {
      if (g.an.length) pendentes.push(`${p}: ${g.an.length} analíticos (${brl(g.an.reduce((s, c) => s + vl(c), 0))}) sem nenhum pagamento-espelho`)
      continue
    }
    const alvoCent = g.an.reduce((s, c) => s + cent(vl(c)), 0)
    // só pagamentos numa janela plausível em torno da baixa dos analíticos
    const datas = g.an.map(c => new Date(c.data_pagamento).getTime()).sort((a, b) => a - b)
    const ini = datas[0] - 20 * 86400000
    const fim = datas[datas.length - 1] + 20 * 86400000
    const janela = g.es.filter(c => {
      const t = new Date(c.data_pagamento).getTime()
      return t >= ini && t <= fim
    })
    const sub = subconjunto(janela, alvoCent)
    if (!sub) {
      pendentes.push(`${p}: ${g.an.length} analíticos ${brl(alvoCent / 100)} não fecham com nenhum subconjunto dos ${janela.length} pagamentos na janela (de ${g.es.length} do beneficiário)`)
      continue
    }
    lotes++; valorLote += alvoCent / 100
    console.log(`\n  ${p}: ${g.an.length} analíticos = ${brl(alvoCent / 100)}`)
    for (const c of sub) console.log(`     LOTE ${String(c.data_pagamento).slice(0, 10)} ${brl(vl(c)).padStart(12)} ${String(c.descricao).slice(0, 52)}`)
    console.log('     -> pagamentos marcados como sintéticos (caixa); analíticos respondem pela competência')

    if (APPLY) {
      const key = `comissao-lote:${p}`
      for (const c of sub) {
        const nota = `[reconciliação] Pagamento em lote: este título é o CAIXA de ${g.an.length} comissões analíticas de ${p} (total ${brl(alvoCent / 100)}), que continuam respondendo pela competência. Marcado como sintético para a despesa não entrar duas vezes na DRE.`
        await sb.from('erp_contas_pagar').update({
          origem: 'sintetico',
          evento_key: key,
          observacoes: [String(c.observacoes || '').trim(), nota].filter(Boolean).join('\n'),
        }).eq('id', c.id)
      }
      for (const c of g.an) {
        await sb.from('erp_contas_pagar').update({ evento_key: key }).eq('id', c.id)
      }
    }
  }
  console.log(`\n  -> ${lotes} lotes reconciliados | ${brl(valorLote)} que estava contado em dobro`)
  if (pendentes.length) {
    console.log('  --- sem par comprovável (mantidos como estão) ---')
    for (const p of pendentes) console.log(`     . ${p}`)
  }
}

/* ══ ETAPA 2.5 — o extrato copiou um título que já existia ═══════════════ */
console.log('\n══════ ETAPA 2.5: CÓPIA DO EXTRATO SOBRE TÍTULO EXISTENTE ══════')
{
  // Quando o financeiro já tinha lançado o título ("REF. COMISSAO DE ABRIL") e
  // depois o extrato foi espelhado, nasceu um SEGUNDO título para o mesmo
  // pagamento — o do extrato, que ficou com o movimento bancário, enquanto o
  // original ficou pago e sem movimento. Somados, dobram a despesa.
  //
  // O par é seguro quando o valor bate ao centavo, as datas são vizinhas e há
  // um único candidato. Nesse caso o título do extrato é a cópia: o movimento
  // passa para o título de negócio (que tem categoria, leilão e histórico) e a
  // cópia é encerrada apontando para ele.
  const movs = await todos('erp_movimentos_bancarios', 'id,data,tipo,valor,descricao,conta_pagar_id')
  const cps = await todos('erp_contas_pagar', COLS)
  const pago = (c: any) => ['pago', 'parcial'].includes(c.status)
  const vl = (c: any) => Number(c.valor_pago || c.valor || 0)
  const ehEspelho = (c: any) => (c.tags || []).includes('espelho-extrato')
  const movDe = new Map<string, any>()
  for (const m of movs) if (m.conta_pagar_id) movDe.set(m.conta_pagar_id, m)

  const negocio = cps.filter(c => pago(c) && !ehEspelho(c) && !movDe.has(c.id) && c.origem !== 'sintetico')
  const copias = cps.filter(c => pago(c) && ehEspelho(c) && movDe.has(c.id) && c.status !== 'cancelado')
  console.log(`  títulos de negócio pagos sem movimento: ${negocio.length} | cópias do extrato: ${copias.length}`)

  const usada = new Set<string>()
  let n = 0, valor = 0
  for (const c of negocio) {
    const alvo = cent(vl(c))
    const ref = new Date(c.data_pagamento).getTime()
    const cands = copias.filter(e => !usada.has(e.id) && cent(vl(e)) === alvo
      && Math.abs(new Date(e.data_pagamento).getTime() - ref) <= 3 * 86400000)
    if (cands.length !== 1) continue
    const copia = cands[0]
    usada.add(copia.id); n++; valor += vl(c)
    console.log(`  x ${String(c.data_pagamento).slice(0, 10)} ${brl(vl(c)).padStart(12)}  ${String(c.descricao).slice(0, 42)}`)
    console.log(`      cópia encerrada: ${String(copia.descricao).slice(0, 58)}`)
    if (APPLY) {
      const mov = movDe.get(copia.id)
      await sb.from('erp_movimentos_bancarios').update({ conta_pagar_id: c.id }).eq('id', mov.id)
      await sb.from('erp_contas_pagar').update({
        status: 'cancelado',
        substituido_por: c.id,
        substituido_em: new Date().toISOString(),
        observacoes: [String(copia.observacoes || '').trim(),
          `[reconciliação] Cópia do extrato para um pagamento que já tinha título próprio: "${c.descricao}" (${brl(vl(c))}). O movimento bancário passou para o título original e esta linha foi encerrada — mantê-la contaria a despesa duas vezes.`,
        ].filter(Boolean).join('\n'),
      }).eq('id', copia.id)
    }
  }
  console.log(`  -> ${n} cópias encerradas | ${brl(valor)} de despesa contada em dobro`)
}

/* ══ ETAPA 3 — o caixa fecha? ═══════════════════════════════════════════ */
console.log('\n══════ ETAPA 3: TÍTULOS PAGOS x SAÍDA DO BANCO ══════')
{
  const cats = await todos('erp_categorias', 'id,nome,dre_grupo')
  const ignorar = new Set(cats.filter(c => c.dre_grupo === 'ignorar').map(c => c.id))
  const movs = await todos('erp_movimentos_bancarios', 'data,tipo,valor,categoria_id')
  const cps = await todos('erp_contas_pagar', 'valor,valor_pago,status,data_pagamento,categoria_id,origem')
  const mes = (d: any) => String(d).slice(0, 7)
  const acc = new Map<string, { banco: number; tit: number }>()
  for (const m of movs.filter(m => m.tipo === 'saida' && !ignorar.has(m.categoria_id))) {
    const g = acc.get(mes(m.data)) || { banco: 0, tit: 0 }; g.banco += Number(m.valor || 0); acc.set(mes(m.data), g)
  }
  // competência: sintéticos ficam de fora (os analíticos já respondem)
  for (const c of cps.filter(c => ['pago', 'parcial'].includes(c.status) && c.data_pagamento && !ignorar.has(c.categoria_id) && c.origem !== 'sintetico')) {
    const g = acc.get(mes(c.data_pagamento)) || { banco: 0, tit: 0 }; g.tit += Number(c.valor_pago || c.valor || 0); acc.set(mes(c.data_pagamento), g)
  }
  let tb = 0, tt = 0
  for (const k of [...acc.keys()].sort()) {
    const g = acc.get(k)!; tb += g.banco; tt += g.tit
    const d = g.tit - g.banco
    console.log(`  ${k}  banco ${brl(g.banco).padStart(14)} | títulos ${brl(g.tit).padStart(14)} | dif ${brl(d).padStart(13)}${Math.abs(d) > 5000 ? '  <==' : ''}`)
  }
  console.log(`  TOTAL    banco ${brl(tb).padStart(14)} | títulos ${brl(tt).padStart(14)} | dif ${brl(tt - tb).padStart(13)}  (${((tt - tb) / tb * 100).toFixed(1)}%)`)
}

console.log(APPLY ? '\nAPLICADO.' : '\nRELATÓRIO. Use --apply para gravar.')
