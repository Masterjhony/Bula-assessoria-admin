/**
 * Alinhador GERAL dos fechamentos ao HastaPro (FIL '2' = Bula Assessoria).
 *
 * Generaliza scripts/alinha-fechamentos-agosto-2026-hastapro.mjs para TODOS os
 * leiloes FIL 2 com lotes vendidos (sem PLANO hardcoded):
 *   - casa HastaPro x bula_leilao_fechamento por tokens do nome + data
 *     (fallback: mesma data +-1 e mesmo VGV, para nomes curtos tipo "32° 4R");
 *   - fechamento que ja bate em VGV/lotes/animais: nao mexe;
 *   - fechamento divergente: reconstroi lances/por_assessor/por_estado/
 *     compradores a partir do HastaPro, PRESERVANDO:
 *       . nome e etapa existentes (titulo vem da escala; etapa e workflow),
 *       . comissao_pct por assessor ja gravado (Fabio era 3% ate jun/2026),
 *       . lotes extras fonte='grupo-lances' que o HastaPro ainda nao registrou;
 *   - leilao FIL2 sem fechamento no sistema: cria (etapa=realizado).
 *
 * Fechamentos sem par no FIL2 (cobertura em leiloes FIL 01, eventos so do
 * grupo de lances) sao apenas listados — nao sao apagados nem alterados.
 *
 * Dry-run por padrao. Use --apply para gravar. Use --desde=YYYY-MM-DD para
 * limitar o periodo (default: tudo).
 */
import { createClient } from '@supabase/supabase-js'
import Firebird from 'node-firebird'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const DESDE = (process.argv.find(a => a.startsWith('--desde=')) || '').slice(8) || '2000-01-01'
const FB = {
  host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT || 3050), database: env.HASTAPRO_DATABASE,
  user: env.HASTAPRO_USER, password: env.HASTAPRO_PASSWORD, lowercase_keys: false, pageSize: 4096,
}
const fb = (sql, params = []) => new Promise((res, rej) => Firebird.attach(FB, (err, db) => {
  if (err) return rej(err)
  db.query(sql, params, (e, r) => { db.detach(); e ? rej(e) : res(r) })
}))

const r2 = n => Math.round(Number(n || 0) * 100) / 100
const fmt = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const str = v => String(v == null ? '' : v).replace(/\x00/g, '').trim()
const iso = d => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
const addD = (isoStr, n) => { const d = new Date(isoStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dayDiff = (a, b) => Math.abs((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000)

// HastaPro PRESTADORES (LOT_PISTEIRO) -> nome canonico dos fechamentos.
// Grafias compativeis com src/lib/assessor-normalize.ts.
const ASSESSOR = {
  '251002191112765': 'Fabio Omena',
  '251122122024148': 'Douglas Bispo',
  '251031200406473': 'Leonardo Serafim',
  '260707195925645': 'Nane',
  '250930184945119': 'Peralta',
  '251001161557564': 'Lucas Martins',
  '250905141925376': 'Matheus Alves',
  '260506110657950': 'Matheus Alves',
  '250930183027880': 'Bulinha (Felipe Andrade)',
  '251012115159815': 'Gustavo Rusa',
  '260414201928636': 'Marcelo Carneiro',
  '250930182057885': 'Laila Oliveira',
  '260127164929931': 'Valeria Borges',
  '251022152148884': 'Fabricio Hyppolito',
  '260211193816781': 'Bruno Ferro',
  '260614231317367': 'Leonardo Serafim', // LM Assessoria = empresa do Leonardo
}
const PCT = { 'Gustavo Rusa': 0.05, 'Lucas Martins': 0.0033, 'Matheus Alves': 0.0033 }
// Fabio operava a 3% ate junho/2026 (tabela do chefe 22/07 vale dali em diante)
const pctDe = (nome, dataLeilao) => {
  if (PCT[nome] != null) return PCT[nome]
  if (nome === 'Fabio Omena' && dataLeilao < '2026-07-01') return 0.03
  return 0.02
}
const keyNome = s => str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/* ---------- 1) HastaPro: leiloes FIL2 com venda ---------- */
const leiloes = (await fb(`
  select l.LEI_CODIGO, l.LEI_NOME, l.LEI_DATA, l.LEI_DATA_TERMINO,
         count(t.LOT_LOTE) as N_VENDIDOS
  from LEILAO l
  join LOTES t on t.LEI_CODIGO=l.LEI_CODIGO and t.FIL_CODIGO='2' and t.LOT_LANCE>0
  where l.FIL_CODIGO='2'
  group by l.LEI_CODIGO, l.LEI_NOME, l.LEI_DATA, l.LEI_DATA_TERMINO
  order by l.LEI_DATA`)).filter(l => iso(l.LEI_DATA) >= DESDE)

/* ---------- 2) fechamentos existentes ---------- */
const { data: fes, error: eFes } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,vgv_total,lotes_vendidos,animais_vendidos,origem,etapa,por_assessor,lances,observacoes')
  .order('data')
if (eFes) throw new Error(eFes.message)

/* ---------- 3) matching estavel ---------- */
const strip = x => str(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const STOP = new Set(['LEILAO', 'VIRTUAL', 'NELORE', 'DIA', 'DAS', 'DOS', 'THE', 'EDICAO', 'MEGA', 'EVENTO', 'AGROPECUARIA', 'FAZENDA', 'ETAPA'])
const tokens = x => new Set(strip(x).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)))
const overlap = (a, b) => { let n = 0; for (const t of a) if (b.has(t)) n++; return n }

const cands = []
for (const l of leiloes) {
  const dIni = iso(l.LEI_DATA), dFim = iso(l.LEI_DATA_TERMINO || l.LEI_DATA)
  const tk = tokens(l.LEI_NOME)
  for (const f of fes) {
    const dd = Math.min(dayDiff(f.data, dIni), dayDiff(f.data, dFim))
    if (dd > 4) continue
    const ov = overlap(tk, tokens(f.nome))
    const vgvIgual = null // preenchido depois (precisa dos lotes); fallback abaixo
    if (ov >= 2 || (ov >= 1 && dd <= 1)) cands.push({ lei: str(l.LEI_CODIGO), f, score: ov * 10 - dd })
  }
}
cands.sort((a, b) => b.score - a.score)
const matchLei = new Map(), usadoFe = new Set()
for (const c of cands) {
  if (matchLei.has(c.lei) || usadoFe.has(c.f.id)) continue
  matchLei.set(c.lei, c.f); usadoFe.add(c.f.id)
}

/* ---------- 4) processa cada leilao ---------- */
let criados = 0, atualizados = 0, iguais = 0
for (const p of leiloes) {
  const lei = str(p.LEI_CODIGO)
  const dataLeilao = iso(p.LEI_DATA)
  const nomeHp = str(p.LEI_NOME)

  const lotes = await fb(
    'select LOT_LOTE, LOT_QTD, LOT_LANCE, LOT_TOTAL, LOT_PISTEIRO from LOTES ' +
    "where FIL_CODIGO='2' and LEI_CODIGO=? and LOT_LANCE>0 order by LOT_ORDEM", [lei])
  const compradores = await fb(
    'select c.LOT_LOTE, c.COP_PORCENTAGEM, cl.CLI_NOME, cl.CLI_UF, f.FAZ_NOME from COMPRADORES c ' +
    'left join CLIENTES cl on cl.CLI_CODIGO=c.CLI_CODIGO ' +
    'left join FAZENDAS f on f.FAZ_CODIGO=c.FAZ_CODIGO and f.CLI_CODIGO=c.CLI_CODIGO ' +
    "where c.FIL_CODIGO='2' and c.LEI_CODIGO=?", [lei])
  const ofertados = (await fb("select count(*) as N from LOTES where FIL_CODIGO='2' and LEI_CODIGO=?", [lei]))[0].N

  const compPorLote = {}
  for (const c of compradores) {
    const k = str(c.LOT_LOTE)
    if (!compPorLote[k] || Number(c.COP_PORCENTAGEM || 0) > Number(compPorLote[k].COP_PORCENTAGEM || 0)) compPorLote[k] = c
  }

  const L = []
  for (const l of lotes) {
    const k = str(l.LOT_LOTE)
    const c = compPorLote[k]
    L.push({
      lote: k, animais: Number(l.LOT_QTD || 1), parcela: Number(l.LOT_LANCE || 0), parcelas: 30,
      vgv: r2(l.LOT_TOTAL), empresa: 'Bula Assessoria',
      assessor: ASSESSOR[str(l.LOT_PISTEIRO)] || 'A definir',
      comprador: c ? [str(c.CLI_NOME), str(c.FAZ_NOME), str(c.CLI_UF)].filter(Boolean).join(' · ') : 'A identificar',
      _uf: c ? str(c.CLI_UF) || null : null,
      _nomeComp: c ? str(c.CLI_NOME) : null, _faz: c ? str(c.FAZ_NOME) || null : null,
      _fonte: 'hastapro',
    })
  }

  // acha o fechamento: matcher por tokens; fallback data+-1 e VGV igual
  let alvo = matchLei.get(lei) || null
  const vgvHp = r2(L.reduce((s, x) => s + x.vgv, 0))
  if (!alvo) {
    alvo = fes.find(f => !usadoFe.has(f.id) && dayDiff(f.data, dataLeilao) <= 1 && Math.abs(r2(f.vgv_total) - vgvHp) <= 0.5) || null
    if (alvo) usadoFe.add(alvo.id)
  }

  // preserva extras (fonte grupo-lances) que o HP ainda nao tem
  const lotesHp = new Set(L.map(x => x.lote))
  const extras = (alvo?.lances || []).filter(x => x && x.fonte === 'grupo-lances' && !lotesHp.has(str(x.lote)))
  for (const e of extras) L.push({ ...e, _uf: e._uf ?? null, _nomeComp: e.comprador || null, _faz: null, _fonte: 'grupo-lances' })

  const vgv = r2(L.reduce((s, x) => s + Number(x.vgv || 0), 0))
  const animais = L.reduce((s, x) => s + Number(x.animais || 0), 0)
  const maior = L.reduce((m, x) => Math.max(m, Number(x.vgv || 0)), 0)

  // ja esta igual? (compara com HP + extras preservados)
  if (alvo && Math.abs(r2(alvo.vgv_total) - vgv) <= 0.5 && alvo.lotes_vendidos === L.length && alvo.animais_vendidos === animais) {
    iguais++
    continue
  }

  // comissao_pct preservada do fechamento existente (por nome canonizado)
  const pctExistente = new Map()
  for (const a of (alvo?.por_assessor || [])) {
    if (a && a.nome && a.comissao_pct != null) pctExistente.set(keyNome(a.nome), Number(a.comissao_pct))
  }
  const pctFinal = nome => pctExistente.has(keyNome(nome)) ? pctExistente.get(keyNome(nome)) : pctDe(nome, dataLeilao)

  const agg = (key) => {
    const m = {}
    for (const x of L) {
      const k = x[key] || (key === 'assessor' ? 'A definir' : null)
      if (!k) continue
      m[k] = m[k] || { vgv: 0, animais: 0, transacoes: 0 }
      m[k].vgv += Number(x.vgv || 0); m[k].animais += Number(x.animais || 0); m[k].transacoes++
    }
    return m
  }
  const porAssessor = Object.entries(agg('assessor'))
    .sort((a, b) => b[1].vgv - a[1].vgv)
    .map(([nome, v], i) => ({
      nome, empresa: 'Bula Assessoria', vgv: r2(v.vgv), animais: v.animais, transacoes: v.transacoes,
      posicao: i + 1, pct_total: vgv ? r2(v.vgv / vgv * 10000) / 10000 : 0,
      comissao_pct: pctFinal(nome), comissao: r2(v.vgv * pctFinal(nome)),
      ticket_medio: v.transacoes ? r2(v.vgv / v.transacoes) : 0,
    }))
  const porEstado = Object.entries(agg('_uf')).filter(([k]) => k && k !== 'A definir')
    .sort((a, b) => b[1].vgv - a[1].vgv)
    .map(([uf, v]) => ({ uf, estado: uf, vgv: r2(v.vgv), lotes: v.transacoes, animais: v.animais,
      pct_total: vgv ? r2(v.vgv / vgv * 10000) / 10000 : 0, ticket_medio: r2(v.vgv / v.transacoes) }))
  const compAgg = {}
  for (const x of L) {
    const k = x._nomeComp || 'A identificar'
    compAgg[k] = compAgg[k] || { vgv: 0, animais: 0, lotes: 0, uf: x._uf, fazenda: x._faz }
    compAgg[k].vgv += Number(x.vgv || 0); compAgg[k].animais += Number(x.animais || 0); compAgg[k].lotes++
  }
  const compradoresOut = Object.entries(compAgg).sort((a, b) => b[1].vgv - a[1].vgv)
    .map(([comprador, v], i) => ({ comprador, rank: i + 1, vgv: r2(v.vgv), lotes: v.lotes, animais: v.animais,
      uf: v.uf, cidade: null, fazenda: v.fazenda }))
  const comissao = r2(porAssessor.reduce((s, a) => s + a.comissao, 0))

  const hojeIso = new Date().toISOString().slice(0, 10)
  const nota = `Alinhado ao HastaPro FIL 2 (leilao ${lei}) em ${hojeIso} — origem=hastapro. ` +
    `${lotes.length} lotes HP${extras.length ? ` + ${extras.length} extra(s) do grupo de lances ainda nao registrados no HastaPro` : ''}. ` +
    'VGV = LOT_TOTAL; assessor = LOT_PISTEIRO; comissao_pct preservada do fechamento anterior quando existia.'

  const payload = {
    lotes_ofertados: Number(ofertados) || L.length, lotes_vendidos: L.length, animais_vendidos: animais,
    vgv_total: vgv, ticket_medio: L.length ? r2(vgv / L.length) : 0, maior_lance: maior,
    compradores_unicos: compradoresOut.length, estados_alcancados: porEstado.length,
    por_assessor: porAssessor, por_estado: porEstado, compradores: compradoresOut,
    lances: L.map(({ _uf, _nomeComp, _faz, _fonte, ...rest }) => Object.assign(rest, _fonte === 'grupo-lances' ? { fonte: 'grupo-lances' } : {})),
    distribuicao_empresa: [{ empresa: 'Bula Assessoria', vgv, animais, transacoes: L.length, pct_total: 1, ticket_medio: L.length ? r2(vgv / L.length) : 0 }],
    comissao_assessoria: comissao, origem: 'hastapro',
  }

  if (!alvo) {
    criados++
    console.log(`FECH +  ${dataLeilao}  ${nomeHp.slice(0, 52).padEnd(52)} VGV ${fmt(vgv).padStart(14)}  (${L.length} lotes / ${animais} anim)`)
    if (APPLY) {
      const { error } = await sb.from('bula_leilao_fechamento').insert({
        ...payload, nome: nomeHp, data: dataLeilao, etapa: 'realizado', observacoes: nota,
      })
      if (error) console.error('  ERRO insert: ' + error.message)
    }
  } else {
    atualizados++
    console.log(`FECH ~  ${dataLeilao}  ${(alvo.nome || '').slice(0, 40).padEnd(40)} VGV ${fmt(alvo.vgv_total).padStart(13)} -> ${fmt(vgv).padStart(13)}  (${alvo.lotes_vendidos} -> ${L.length} lotes)`)
    if (APPLY) {
      const { error } = await sb.from('bula_leilao_fechamento').update({
        ...payload,
        observacoes: [str(alvo.observacoes), nota].filter(Boolean).join('\n'),
      }).eq('id', alvo.id)
      if (error) console.error('  ERRO update: ' + error.message)
    }
  }
}
console.log(`\n-> ${criados} criados, ${atualizados} atualizados, ${iguais} ja iguais (nao tocados)`)

/* ---------- 5) fechamentos sem par no FIL2 (apenas informativo) ---------- */
const semPar = fes.filter(f => !usadoFe.has(f.id))
console.log(`\n=== Fechamentos sem par no HastaPro FIL2 (${semPar.length}) — NAO alterados ===`)
for (const f of semPar) console.log(`  ${f.data} ${f.nome} · VGV ${fmt(f.vgv_total)} · origem=${f.origem} · etapa=${f.etapa}`)
console.log(APPLY ? '\nAPLICADO.' : '\nDRY-RUN. Use --apply para gravar.')
