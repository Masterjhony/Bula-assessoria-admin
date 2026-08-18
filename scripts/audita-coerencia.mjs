/**
 * AUDITOR DE COERÊNCIA INTERNA (18/08/2026).
 *
 * Verifica as invariantes que amarram o sistema — os mesmos números que as
 * telas mostram, recalculados de forma independente. Qualquer FAIL significa
 * que duas partes do sistema discordam entre si.
 *
 * Rode a qualquer momento: `node scripts/audita-coerencia.mjs`
 * (só leitura; sai com código 1 se houver falha material)
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const mk = n => String(n ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

let pass = 0, fail = 0, warn = 0
const ok = (nome, extra = '') => { pass++; console.log(`  PASS  ${nome}${extra ? ' — ' + extra : ''}`) }
const bad = (nome, extra = '') => { fail++; console.log(`  FAIL  ${nome}${extra ? ' — ' + extra : ''}`) }
const meh = (nome, extra = '') => { warn++; console.log(`  WARN  ${nome}${extra ? ' — ' + extra : ''}`) }

async function all(table, cols, filtro = q => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filtro(sb.from(table).select(cols)).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

/* ════════ 1. FECHAMENTOS: agregados ↔ lances ↔ assessores ↔ compradores ═══ */
console.log('\n■ Fechamentos (bula_leilao_fechamento)')
{
  const fes = await all('bula_leilao_fechamento', 'id,nome,data,vgv_total,lotes_vendidos,animais_vendidos,comissao_assessoria,lances,por_assessor,por_estado,compradores,observacoes')
  let vgvDif = 0, lotesDif = 0, animaisDif = 0, assessorDif = 0, comissaoDif = 0, compradorDif = 0, estadoDif = 0, parciais = 0
  const detalhes = []
  for (const f of fes) {
    // tolerância de rateio: divisões manuais por comprador/estado carregam
    // centavos/arredondamentos — 0,1% do VGV (mín. R$ 0,50) não é incoerência.
    const tol = Math.max(0.5, r2(f.vgv_total) * 0.001)
    // fechamento marcado como [detalhe-parcial] declara explicitamente que os
    // lances documentam menos que o total apurado — vira WARN, não FAIL.
    const parcial = String(f.observacoes || '').includes('[detalhe-parcial')
    if (parcial) parciais++
    const lances = f.lances || []
    if (!lances.length) { checaListas(f, tol, parcial); continue } // agregados são a fonte
    const vgvL = r2(lances.reduce((s, l) => s + Number(l.vgv || 0), 0))
    const aniL = lances.reduce((s, l) => s + Number(l.animais || 0), 0)
    if (!parcial && Math.abs(vgvL - r2(f.vgv_total)) > tol) { vgvDif++; detalhes.push(`${f.nome}: vgv ${brl(f.vgv_total)} ≠ lances ${brl(vgvL)}`) }
    if (!parcial && lances.length !== f.lotes_vendidos) { lotesDif++; detalhes.push(`${f.nome}: lotes ${f.lotes_vendidos} ≠ lances ${lances.length}`) }
    if (!parcial && aniL > 0 && aniL !== f.animais_vendidos) { animaisDif++; detalhes.push(`${f.nome}: animais ${f.animais_vendidos} ≠ lances ${aniL}`) }
    const pa = f.por_assessor || []
    if (pa.length) {
      const vgvA = r2(pa.reduce((s, a) => s + Number(a.vgv || 0), 0))
      if (Math.abs(vgvA - r2(f.vgv_total)) > 0.5) { assessorDif++; detalhes.push(`${f.nome}: por_assessor ${brl(vgvA)} ≠ vgv ${brl(f.vgv_total)}`) }
      const com = r2(pa.reduce((s, a) => s + Number(a.comissao || 0), 0))
      if (f.comissao_assessoria != null && Math.abs(com - r2(f.comissao_assessoria)) > 0.5) { comissaoDif++; detalhes.push(`${f.nome}: comissões ${brl(com)} ≠ ${brl(f.comissao_assessoria)}`) }
    }
    checaListas(f, tol, parcial)
  }
  function checaListas(f, tol, parcial) {
    const pc = f.compradores || []
    if (pc.length && !parcial) {
      const vgvC = r2(pc.reduce((s, c) => s + Number(c.vgv || 0), 0))
      if (Math.abs(vgvC - r2(f.vgv_total)) > tol) { compradorDif++; detalhes.push(`${f.nome}: compradores ${brl(vgvC)} ≠ vgv ${brl(f.vgv_total)}`) }
    }
    const pe = f.por_estado || []
    if (pe.length) {
      const vgvE = r2(pe.reduce((s, e) => s + Number(e.vgv || 0), 0))
      // por_estado só cobre lotes com UF identificada — pode ser MENOR, nunca maior
      if (vgvE - r2(f.vgv_total) > tol) { estadoDif++; detalhes.push(`${f.nome}: por_estado ${brl(vgvE)} > vgv ${brl(f.vgv_total)}`) }
    }
  }
  const casos = [
    ['vgv_total = Σ lances.vgv', vgvDif], ['lotes_vendidos = nº de lances', lotesDif],
    ['animais_vendidos = Σ lances.animais', animaisDif], ['Σ por_assessor.vgv = vgv_total', assessorDif],
    ['comissao_assessoria = Σ comissões', comissaoDif], ['Σ compradores.vgv = vgv_total', compradorDif],
    ['por_estado nunca excede o VGV', estadoDif],
  ]
  for (const [nome, n] of casos) n === 0 ? ok(nome, `${fes.length} fechamentos`) : bad(nome, `${n} divergentes`)
  if (parciais) meh('fechamentos com detalhe de lances declaradamente parcial', `${parciais} (marcador [detalhe-parcial] em observações)`)
  for (const d of detalhes.slice(0, 12)) console.log(`        · ${d}`)
}

/* ════════ 2. ERP: saldos, cancelados, vínculos ════════════════════════════ */
console.log('\n■ ERP')
{
  // saldo_atual de cada conta = saldo_inicial + entradas − saídas (+/− transferências)
  const contas = await all('erp_contas_bancarias', 'id,nome,saldo_inicial,saldo_atual', q => q.eq('ativo', true))
  const movs = await all('erp_movimentos_bancarios', 'conta_bancaria_id,tipo,valor,transferencia_par_id,descricao')
  let saldoRuim = 0
  for (const c of contas) {
    const dele = movs.filter(m => m.conta_bancaria_id === c.id)
    let calc = Number(c.saldo_inicial || 0)
    for (const m of dele) {
      const v = Number(m.valor || 0)
      if (m.tipo === 'entrada') calc += v
      else if (m.tipo === 'saida') calc -= v
      else if (m.tipo === 'transferencia') calc -= v // transferência gravada na conta de origem sai; a par entra como entrada? verificar par
    }
    // transferências recebidas: tipo 'transferencia' com par na outra conta — heurística: se divergir, reporta
    if (Math.abs(calc - Number(c.saldo_atual || 0)) > 0.01) {
      // tenta com transferências como neutras (algumas casas registram os dois lados como entrada/saida)
      let calc2 = Number(c.saldo_inicial || 0)
      for (const m of dele) {
        const v = Number(m.valor || 0)
        if (m.tipo === 'entrada') calc2 += v
        else if (m.tipo === 'saida') calc2 -= v
      }
      if (Math.abs(calc2 - Number(c.saldo_atual || 0)) > 0.01) {
        saldoRuim++
        console.log(`        · ${c.nome}: saldo_atual ${brl(c.saldo_atual)} ≠ recalculado ${brl(calc)} / ${brl(calc2)}`)
      }
    }
  }
  saldoRuim === 0 ? ok('saldo_atual = saldo_inicial + movimentos', `${contas.length} contas`) : bad('saldo_atual = saldo_inicial + movimentos', `${saldoRuim} contas divergem`)

  const { count: movSemCat } = await sb.from('erp_movimentos_bancarios').select('id', { count: 'exact', head: true }).is('categoria_id', null)
  movSemCat === 0 ? ok('todo movimento tem categoria') : bad('todo movimento tem categoria', `${movSemCat} sem`)
  const { count: movPend } = await sb.from('erp_movimentos_bancarios').select('id', { count: 'exact', head: true }).neq('status_conciliacao', 'conciliado')
  movPend === 0 ? ok('todo movimento conciliado') : meh('todo movimento conciliado', `${movPend} pendentes`)

  const { count: catSemGrupo } = await sb.from('erp_categorias').select('id', { count: 'exact', head: true }).is('dre_grupo', null)
  catSemGrupo === 0 ? ok('toda categoria tem dre_grupo') : bad('toda categoria tem dre_grupo', `${catSemGrupo} sem — DRE joga no fallback`)

  // vínculo título ↔ movimento aponta para título não-cancelado
  const movVinc = movs.length // já carregado sem os campos; busca dedicada:
  const vincCp = await all('erp_movimentos_bancarios', 'id,conta_pagar_id', q => q.not('conta_pagar_id', 'is', null))
  const vincCr = await all('erp_movimentos_bancarios', 'id,conta_receber_id', q => q.not('conta_receber_id', 'is', null))
  const cpIds = new Set((await all('erp_contas_pagar', 'id,status')).filter(t => t.status !== 'cancelado').map(t => t.id))
  const crIds = new Set((await all('erp_contas_receber', 'id,status')).filter(t => t.status !== 'cancelado').map(t => t.id))
  const orfCp = vincCp.filter(m => !cpIds.has(m.conta_pagar_id)).length
  const orfCr = vincCr.filter(m => !crIds.has(m.conta_receber_id)).length
  orfCp + orfCr === 0 ? ok('movimento vinculado aponta p/ título vivo', `${vincCp.length + vincCr.length} vínculos`) : bad('movimento vinculado aponta p/ título vivo', `${orfCp + orfCr} órfãos/cancelados`)

  // CR de fechamento aponta para fechamento existente
  const crFech = await all('erp_contas_receber', 'id,fechamento_id,status', q => q.not('fechamento_id', 'is', null).neq('status', 'cancelado'))
  const fechIds = new Set((await all('bula_leilao_fechamento', 'id')).map(f => f.id))
  const crOrfao = crFech.filter(c => !fechIds.has(c.fechamento_id)).length
  crOrfao === 0 ? ok('CR de fechamento aponta p/ fechamento existente', `${crFech.length} CRs`) : bad('CR de fechamento aponta p/ fechamento existente', `${crOrfao} órfãs`)
}

/* ════════ 3. CLIENTES ↔ FECHAMENTOS ═══════════════════════════════════════ */
console.log('\n■ Clientes')
{
  const fes = await all('bula_leilao_fechamento', 'compradores')
  // MESMA regra de src/lib/clientes.ts (nomeCompradorCanonico): marcador de
  // pendência no campo fazenda não é identidade — o comprador assume.
  const PLACEHOLDER_SET = new Set(['', 'a identificar', 'a definir', 'confirmar', 'confirmar fazenda',
    'fazenda confirmar', 'nao identificado', 'sem fazenda', 'sem comprador', 'comprador', 'fazenda', 'x', 'xx', 'na', 'nd'])
  const ehPlaceholder = (nome) => {
    const k = mk(nome)
    return !k || k.length < 3 || PLACEHOLDER_SET.has(k) || /^confirmar/.test(k)
  }
  const nomeComprador = (fazenda, comprador) => {
    const f = String(fazenda ?? '').trim(), c = String(comprador ?? '').trim()
    if (f && !ehPlaceholder(f)) return f
    if (c && !ehPlaceholder(c)) return c
    return null
  }
  const keys = new Set()
  let semNome = 0
  for (const f of fes) for (const c of (f.compradores || [])) {
    const nome = nomeComprador(c.fazenda, c.comprador)
    if (nome) keys.add(mk(nome)); else semNome++
  }
  if (semNome) meh('compradores sem nome identificável na fonte', `${semNome} linhas (marcador de pendência no HastaPro)`)
  const rows = await all('clientes', 'match_key,assessor,uf')
  const byKey = new Map(rows.map(r => [r.match_key, r]))
  const semRow = [...keys].filter(k => !byKey.has(k))
  semRow.length === 0 ? ok('todo comprador de fechamento tem registro em clientes', `${keys.size} compradores`) : bad('todo comprador de fechamento tem registro em clientes', `${semRow.length} sem: ${semRow.slice(0, 5).join(', ')}`)
  const semAss = [...keys].filter(k => byKey.has(k) && !String(byKey.get(k).assessor || '').trim())
  semAss.length === 0 ? ok('todo comprador tem assessor vinculado') : meh('todo comprador tem assessor vinculado', `${semAss.length} sem (sem UF/fone/lote em fonte alguma)`)
  const dupes = rows.length - new Set(rows.map(r => r.match_key)).size
  dupes === 0 ? ok('match_key único em clientes') : bad('match_key único em clientes', `${dupes} duplicados`)
}

/* ════════ 4. CRM: contagens que o dashboard soma ══════════════════════════ */
console.log('\n■ CRM / Dashboard')
{
  const { count: total } = await sb.from('crm_leads').select('id', { count: 'exact', head: true }).eq('arquivado', false)
  const { count: frias } = await sb.from('crm_leads').select('id', { count: 'exact', head: true }).eq('arquivado', false).in('source', ['planilha', 'whatsapp-contatos'])
  const { count: jmp } = await sb.from('crm_leads').select('id', { count: 'exact', head: true }).eq('arquivado', false).in('source', ['jmp-bula-perpetuo-sheet', 'jmp-landing', 'jmp-sheet-repair'])
  const { count: outros } = await sb.from('crm_leads').select('id', { count: 'exact', head: true }).eq('arquivado', false)
    .not('source', 'in', '(planilha,whatsapp-contatos,jmp-bula-perpetuo-sheet,jmp-landing,jmp-sheet-repair)')
  // partição exata: frias + jmp + outros = total (nada fica sem classificação)
  frias + jmp + outros === total
    ? ok('partição de fontes cobre 100% dos leads', `${total} = ${frias} frias + ${jmp} campanha + ${outros} outros`)
    : bad('partição de fontes cobre 100% dos leads', `${frias}+${jmp}+${outros} ≠ ${total}`)
}

/* ════════ resultado ═══════════════════════════════════════════════════════ */
console.log(`\n═══ ${pass} PASS · ${warn} WARN · ${fail} FAIL ═══`)
process.exit(fail > 0 ? 1 : 0)
