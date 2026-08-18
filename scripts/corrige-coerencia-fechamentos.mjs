/**
 * CORRETIVO DE COERÊNCIA INTERNA dos fechamentos (18/08/2026).
 *
 * Regras (agregados que pagaram comissão/CR são a fonte de verdade):
 *   1. Comissão por assessor sem valor -> rateio EXATO do restante de
 *      comissao_assessoria proporcional ao VGV (fecha ao centavo; valores
 *      explícitos são preservados — mesma regra do rateio de abril).
 *      Se todos têm valor e a soma difere do total -> total = soma (o
 *      granular vence o campo agregado desatualizado).
 *   2. Lances que fecham o VGV exatamente = detalhe COMPLETO -> lotes_vendidos
 *      e animais_vendidos passam a bater com os lances.
 *   3. Lances que documentam MENOS que o VGV = detalhe PARCIAL -> marcador
 *      explícito em observacoes (o auditor rebaixa para WARN; nada fica
 *      silenciosamente incoerente).
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
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const MARCADOR = '[detalhe-parcial'

const { data: fes, error } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,vgv_total,lotes_vendidos,animais_vendidos,comissao_assessoria,lances,por_assessor,observacoes')
  .order('data')
if (error) throw new Error(error.message)

let mudados = 0
for (const f of fes || []) {
  const set = {}
  const notas = []

  /* ── 1. comissões por assessor ── */
  const pa = Array.isArray(f.por_assessor) ? f.por_assessor.map(a => ({ ...a })) : []
  const total = f.comissao_assessoria != null ? r2(f.comissao_assessoria) : null
  if (pa.length) {
    const isNum = a => a.comissao != null && a.comissao !== '' && !Number.isNaN(Number(a.comissao))
    const explicitos = pa.filter(isNum)
    const faltantes = pa.filter(a => !isNum(a))
    const somaExp = r2(explicitos.reduce((s, a) => s + Number(a.comissao), 0))
    if (faltantes.length && total != null && total > 0) {
      const resto = r2(total - somaExp)
      if (resto >= -0.01) {
        const vgvFalt = faltantes.reduce((s, a) => s + (Number(a.vgv) || 0), 0)
        let acumulado = 0
        faltantes.forEach((a, i) => {
          const parte = i === faltantes.length - 1
            ? r2(resto - acumulado) // o último fecha ao centavo
            : r2(vgvFalt > 0 ? resto * ((Number(a.vgv) || 0) / vgvFalt) : resto / faltantes.length)
          a.comissao = parte
          if (a.comissao_pct == null && Number(a.vgv) > 0) a.comissao_pct = r2(parte / Number(a.vgv) * 10000) / 10000
          acumulado = r2(acumulado + parte)
        })
        set.por_assessor = pa
        notas.push(`rateadas ${faltantes.length} comissões (${brl(resto)}) por VGV`)
      } else {
        console.log(`  ! ${f.nome}: comissões explícitas (${brl(somaExp)}) EXCEDEM o total (${brl(total)}) — não tocado, conferir`)
      }
    } else if (!faltantes.length && total != null && Math.abs(somaExp - total) > 0.5) {
      set.comissao_assessoria = somaExp
      notas.push(`comissao_assessoria ${brl(total)} -> ${brl(somaExp)} (soma por assessor)`)
    }
  }

  /* ── 2/3. lances × agregados ── */
  const lances = Array.isArray(f.lances) ? f.lances : []
  if (lances.length) {
    const vgvL = r2(lances.reduce((s, l) => s + Number(l.vgv || 0), 0))
    const aniL = lances.reduce((s, l) => s + Number(l.animais || 0), 0)
    const vgvF = r2(f.vgv_total)
    if (Math.abs(vgvL - vgvF) <= 0.5) {
      // detalhe completo: agregados de contagem acompanham os lances
      if (f.lotes_vendidos !== lances.length) { set.lotes_vendidos = lances.length; notas.push(`lotes ${f.lotes_vendidos} -> ${lances.length} (nº de lances, que fecham o VGV)`) }
      if (aniL > 0 && f.animais_vendidos !== aniL) { set.animais_vendidos = aniL; notas.push(`animais ${f.animais_vendidos} -> ${aniL} (soma dos lances)`) }
    } else if (vgvL < vgvF - 0.5 && !String(f.observacoes || '').includes(MARCADOR)) {
      set.observacoes = [String(f.observacoes || '').trim(),
        `${MARCADOR}: os lances registrados documentam ${brl(vgvL)} (${lances.length} lote(s)) de um VGV total de ${brl(vgvF)} apurado no fechamento/relatório — o restante não tem detalhe lote a lote na fonte disponível. Marcado em 18/08/2026.]`]
        .filter(Boolean).join('\n')
      notas.push(`marcado detalhe-parcial (lances ${brl(vgvL)} de ${brl(vgvF)})`)
    }
  }

  if (!Object.keys(set).length) continue
  mudados++
  console.log(`~ ${String(f.data).slice(0, 10)} ${f.nome}\n    ${notas.join('\n    ')}`)
  if (APPLY) {
    const { error: e2 } = await sb.from('bula_leilao_fechamento').update(set).eq('id', f.id)
    if (e2) console.error('  ERRO: ' + e2.message)
  }
}
console.log(`\n-> ${mudados} fechamentos ajustados`)
console.log(APPLY ? 'APLICADO.' : 'DRY-RUN. Use --apply para gravar.')
