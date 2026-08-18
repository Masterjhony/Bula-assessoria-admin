/**
 * SYNC CLIENTES <- HastaPro + fechamentos (pedido do chefe, 18/08/2026):
 *   1. "Ter os dados preenchidos corretamente de cada cliente" — enriquece a
 *      tabela `clientes` com CPF/telefone/e-mail/cidade/UF do CLIENTES do
 *      HastaPro (qualquer filial; a pessoa é a mesma — memória FIL 01).
 *   2. "Todos os cadastros devem estar aqui" — cria a linha em `clientes` para
 *      TODO comprador presente nos fechamentos que ainda não tem registro.
 *   3. "Linkar clientes a assessores" — correlação em CASCATA:
 *        a) lances dos fechamentos: assessor com mais VGV nos lotes daquele
 *           comprador (casando por nome do comprador E da fazenda);
 *        b) HastaPro: LOT_PISTEIRO dos lotes do cliente em QUALQUER filial
 *           (pega cobertura Bula em leilões FIL 01, ex.: Kriz);
 *        c) zona por UF (Douglas=Norte+MA · Fabio=NE−MA+SE · Leonardo=CO+Sul).
 *      Ninguém com compra fica sem assessor.
 *
 * A CHAVE do cliente é a MESMA do módulo (getClientes): nameKey(fazenda ||
 * comprador). A 1ª versão deste script usou comprador||fazenda e criou
 * registros com chave errada — o marcador em `observacoes` permite limpar.
 *
 * Regra de ouro: dado manual NUNCA é sobrescrito — só preenche campo vazio
 * (exceção: `assessor` é recalculado a cada run; use --keep-assessor p/ manter).
 *
 * Dry-run por padrão; --apply grava. Idempotente — pode rodar em cron.
 */
import { createClient } from '@supabase/supabase-js'
import Firebird from 'node-firebird'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const KEEP_ASSESSOR = process.argv.includes('--keep-assessor')
const FB = {
  host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT || 3050), database: env.HASTAPRO_DATABASE,
  user: env.HASTAPRO_USER, password: env.HASTAPRO_PASSWORD, lowercase_keys: false, pageSize: 4096,
}
const fb = (sql, params = []) => new Promise((res, rej) => Firebird.attach(FB, (err, db) => {
  if (err) return rej(err)
  db.query(sql, params, (e, r) => { db.detach(); e ? rej(e) : res(r) })
}))
const str = v => String(v == null ? '' : v).replace(/\x00/g, '').trim()
const matchKey = nome => str(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const digits = v => str(v).replace(/\D/g, '')
const fmtCpf = d => d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d

// espelho de src/lib/assessor-normalize.ts — grafias unificadas
const CANON = new Map([
  ['fabio omena', 'Fabio Omena'], ['fabio omena gaia', 'Fabio Omena'], ['fabio de omena gaia', 'Fabio Omena'],
  ['fabio mena', 'Fabio Omena'], ['fabinho', 'Fabio Omena'],
  ['leo', 'Leonardo Serafim'], ['leo serafim', 'Leonardo Serafim'], ['leonardo', 'Leonardo Serafim'],
  ['lm assessoria', 'Leonardo Serafim'], ['marcelo carneiro leonardo serafim', 'Leonardo Serafim'],
  ['mateus alves', 'Matheus Alves'],
  ['bulinha', 'Bulinha (Felipe Andrade)'], ['felipe andrade', 'Bulinha (Felipe Andrade)'],
  ['felipe vilela andrade', 'Bulinha (Felipe Andrade)'],
])
const canonAssessor = nome => CANON.get(matchKey(nome)) || str(nome)
const PLACEHOLDER_RE = /^(a identificar|a definir|nao identificado|sem comprador|comprador)$/

// HastaPro PRESTADORES (LOT_PISTEIRO) -> nome canonico (mesmo mapa do alinhador)
const PISTEIRO = {
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
  '260614231317367': 'Leonardo Serafim',
}

// zona por UF (espelho de src/lib/assessor-zona.ts)
const ZONA = {}
for (const uf of ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO', 'MA']) ZONA[uf] = 'Douglas Bispo'
for (const uf of ['AL', 'BA', 'CE', 'PB', 'PE', 'PI', 'RN', 'SE', 'ES', 'MG', 'RJ', 'SP']) ZONA[uf] = 'Fabio Omena'
for (const uf of ['MS', 'MT', 'GO', 'DF', 'PR', 'RS', 'SC']) ZONA[uf] = 'Leonardo Serafim'

// último recurso de UF: DDD do telefone (cliente sem UF em nenhuma fonte)
const DDD_UF = { 11: 'SP', 12: 'SP', 13: 'SP', 14: 'SP', 15: 'SP', 16: 'SP', 17: 'SP', 18: 'SP', 19: 'SP', 21: 'RJ', 22: 'RJ', 24: 'RJ', 27: 'ES', 28: 'ES', 31: 'MG', 32: 'MG', 33: 'MG', 34: 'MG', 35: 'MG', 37: 'MG', 38: 'MG', 41: 'PR', 42: 'PR', 43: 'PR', 44: 'PR', 45: 'PR', 46: 'PR', 47: 'SC', 48: 'SC', 49: 'SC', 51: 'RS', 53: 'RS', 54: 'RS', 55: 'RS', 61: 'DF', 62: 'GO', 63: 'TO', 64: 'GO', 65: 'MT', 66: 'MT', 67: 'MS', 68: 'AC', 69: 'RO', 71: 'BA', 73: 'BA', 74: 'BA', 75: 'BA', 77: 'BA', 79: 'SE', 81: 'PE', 82: 'AL', 83: 'PB', 84: 'RN', 85: 'CE', 86: 'PI', 87: 'PE', 88: 'CE', 89: 'PI', 91: 'PA', 92: 'AM', 93: 'PA', 94: 'PA', 95: 'RR', 96: 'AP', 97: 'AM', 98: 'MA', 99: 'MA' }
const dddUf = fone => { const d = digits(fone).replace(/^55/, ''); return d.length >= 10 ? DDD_UF[Number(d.slice(0, 2))] || null : null }

/* ── 1. HastaPro: melhor registro cadastral de cada pessoa (todas as filiais) ── */
const hpClientes = await fb(`
  select c.FIL_CODIGO, c.CLI_NOME, c.CLI_CPFCNPJ, c.CLI_CELULAR, c.CLI_FONECOM1, c.CLI_FONERES,
         c.CLI_EMAIL, c.CLI_UF, ci.CID_MUNICIPIO
  from CLIENTES c left join CIDADES ci on ci.CID_CODIGO = c.CLI_CID_CODIGO`)
// A MESMA pessoa existe em mais de uma filial com fichas complementares
// (a FIL 2 costuma ter só o nome; a FIL 01 tem UF/fone/CPF). Campo a campo,
// vale o primeiro valor não-vazio — FIL 2 primeiro, depois as outras.
const hpByKey = new Map()
const hpRows = [...hpClientes].sort((a, b) => (str(b.FIL_CODIGO) === '2' ? 1 : 0) - (str(a.FIL_CODIGO) === '2' ? 1 : 0))
for (const c of hpRows) {
  const k = matchKey(c.CLI_NOME)
  if (!k) continue
  const cand = {
    nome: str(c.CLI_NOME),
    cpf: digits(c.CLI_CPFCNPJ) || null,
    fone: digits(c.CLI_CELULAR) || digits(c.CLI_FONECOM1) || digits(c.CLI_FONERES) || null,
    email: str(c.CLI_EMAIL).toLowerCase() || null,
    uf: str(c.CLI_UF).toUpperCase() || null,
    cidade: str(c.CID_MUNICIPIO) || null,
  }
  const atual = hpByKey.get(k)
  if (!atual) { hpByKey.set(k, cand); continue }
  for (const campo of ['cpf', 'fone', 'email', 'uf', 'cidade']) if (!atual[campo] && cand[campo]) atual[campo] = cand[campo]
}
console.log(`HastaPro: ${hpClientes.length} registros de cliente, ${hpByKey.size} pessoas únicas`)

/* ── 2. HastaPro: pisteiro por comprador em QUALQUER filial (correlação b) ── */
const hpLotes = await fb(`
  select t.LOT_PISTEIRO, t.LOT_TOTAL, cl.CLI_NOME, f.FAZ_NOME
  from LOTES t
  join COMPRADORES co on co.LEI_CODIGO=t.LEI_CODIGO and co.FIL_CODIGO=t.FIL_CODIGO and co.LOT_LOTE=t.LOT_LOTE
  left join CLIENTES cl on cl.CLI_CODIGO=co.CLI_CODIGO
  left join FAZENDAS f on f.FAZ_CODIGO=co.FAZ_CODIGO and f.CLI_CODIGO=co.CLI_CODIGO
  where t.LOT_LANCE>0 and t.LOT_PISTEIRO is not null`)
const addVgv = (map, k, assessor, vgv) => {
  if (!k || !assessor) return
  const m = map.get(k) || new Map()
  m.set(assessor, (m.get(assessor) || 0) + vgv)
  map.set(k, m)
}
const hpAssessorVgv = new Map() // key(nome OU fazenda) -> Map(assessor -> vgv)
for (const l of hpLotes) {
  const assessor = PISTEIRO[str(l.LOT_PISTEIRO)]
  if (!assessor) continue
  const vgv = Number(l.LOT_TOTAL) || 0
  addVgv(hpAssessorVgv, matchKey(l.CLI_NOME), assessor, vgv)
  addVgv(hpAssessorVgv, matchKey(l.FAZ_NOME), assessor, vgv)
}
console.log(`HastaPro: ${hpLotes.length} lotes com pisteiro Bula (todas as filiais)`)

/* ── 3. fechamentos: compradores (chave = fazenda||comprador, igual getClientes) ── */
const { data: fes } = await sb.from('bula_leilao_fechamento').select('id,nome,data,compradores,lances')
const lancesAssessorVgv = new Map() // key -> Map(assessor -> vgv)   (correlação a)
const compradores = new Map() // key -> { nome, comprador, uf, fazenda }
for (const f of fes || []) {
  for (const c of f.compradores || []) {
    const fazenda = str(c.fazenda || c.comprador)
    const k = matchKey(fazenda)
    if (!k || PLACEHOLDER_RE.test(k)) continue
    if (!compradores.has(k)) {
      compradores.set(k, { nome: fazenda, comprador: str(c.comprador) || null, uf: str(c.uf).toUpperCase() || null, fazenda: str(c.fazenda) || null })
    } else if (!compradores.get(k).uf && str(c.uf)) compradores.get(k).uf = str(c.uf).toUpperCase()
  }
  for (const l of f.lances || []) {
    const assessor = canonAssessor(l.assessor)
    if (!assessor || /a definir/i.test(assessor)) continue
    const vgv = Number(l.vgv) || 0
    // comprador do lance vem como "NOME · FAZENDA · UF" — registra cada parte
    const partes = str(l.comprador).split('·').map(p => matchKey(p)).filter(p => p.length > 2 && !PLACEHOLDER_RE.test(p))
    for (const p of new Set(partes)) addVgv(lancesAssessorVgv, p, assessor, vgv)
  }
}
console.log(`Fechamentos: ${compradores.size} compradores únicos (chave fazenda||comprador)`)

const melhor = (map, ...keys) => {
  const agg = new Map()
  for (const k of keys) {
    const m = k ? map.get(k) : null
    if (m) for (const [a, v] of m) agg.set(a, (agg.get(a) || 0) + v)
  }
  // fallback por CONTINÊNCIA: "vinicius baleeiro" (lance) casa com
  // "vinicius baleeiro pereira guimaraes" (comprador) — nomes curtos vs completos.
  if (!agg.size) {
    for (const k of keys) {
      if (!k || k.length < 8) continue
      for (const [mk2, m] of map) {
        if (mk2.length < 8) continue
        if (k.startsWith(mk2 + ' ') || mk2.startsWith(k + ' ') || k === mk2) {
          for (const [a, v] of m) agg.set(a, (agg.get(a) || 0) + v)
        }
      }
    }
  }
  if (!agg.size) return null
  return [...agg.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/* ── 4. limpeza: linhas da 1ª rodada com chave errada (marcador) ─────────── */
const MARCADOR = 'Criado pelo sync HastaPro/fechamentos (18/08/2026).'
{
  const { data: legado } = await sb.from('clientes').select('id,match_key,observacoes').eq('observacoes', MARCADOR)
  const ruins = (legado || []).filter(r => !compradores.has(r.match_key))
  if (ruins.length) {
    console.log(`Limpeza: ${ruins.length} registros da 1ª rodada com chave de comprador (não de fazenda) — removendo`)
    if (APPLY) {
      for (let i = 0; i < ruins.length; i += 100) {
        const { error } = await sb.from('clientes').delete().in('id', ruins.slice(i, i + 100).map(r => r.id))
        if (error) console.error('  ERRO delete: ' + error.message)
      }
    }
  }
}

/* ── 5. upsert em `clientes` (manual vence; só preenche vazio) ───────────── */
const { data: rows } = await sb.from('clientes').select('*')
const byKey = new Map((rows || []).map(r => [r.match_key, r]))

let criados = 0, atualizados = 0, semMudanca = 0, semAssessor = 0
for (const [k, comp] of compradores) {
  const row = byKey.get(k)
  const kComprador = comp?.comprador ? matchKey(comp.comprador) : null
  const hp = hpByKey.get(k) || (kComprador ? hpByKey.get(kComprador) : null)
  const uf = comp?.uf || row?.uf || hp?.uf || dddUf(row?.telefone || hp?.fone) || null

  // cascata: lances -> pisteiro HastaPro (qualquer filial) -> zona por UF
  const assessor =
    melhor(lancesAssessorVgv, k, kComprador) ||
    melhor(hpAssessorVgv, k, kComprador) ||
    (uf ? ZONA[uf] || null : null)
  if (!assessor) semAssessor++

  if (!row) {
    criados++
    const payload = {
      match_key: k,
      nome: comp.nome,
      responsavel: comp.comprador || null,
      telefone: hp?.fone || null,
      email: hp?.email || null,
      cidade: hp?.cidade || null,
      uf,
      cpf: hp?.cpf ? fmtCpf(hp.cpf) : null,
      assessor,
      observacoes: MARCADOR,
    }
    console.log(`+ ${payload.nome}${uf ? ' (' + uf + ')' : ''}${assessor ? ' -> ' + assessor : ' [SEM ASSESSOR]'}`)
    if (APPLY) {
      const { error } = await sb.from('clientes').insert(payload)
      if (error) console.error('  ERRO insert: ' + error.message)
    }
    continue
  }

  const set = {}
  const fill = (campo, valor) => { if (valor && !str(row[campo])) set[campo] = valor }
  fill('telefone', hp?.fone)
  fill('email', hp?.email)
  fill('cidade', hp?.cidade)
  fill('uf', uf)
  fill('cpf', hp?.cpf ? fmtCpf(hp.cpf) : null)
  fill('responsavel', comp.comprador)
  if (assessor && (!str(row.assessor) || !KEEP_ASSESSOR)) {
    if (str(row.assessor) !== assessor) set.assessor = assessor
  }
  if (!Object.keys(set).length) { semMudanca++; continue }
  atualizados++
  console.log(`~ ${row.nome}: ${Object.entries(set).map(([c, v]) => `${c}=${v}`).join(' · ')}`)
  if (APPLY) {
    const { error } = await sb.from('clientes').update(set).eq('id', row.id)
    if (error) console.error('  ERRO update: ' + error.message)
  }
}

/* rows manuais que não vêm de fechamento: só completa assessor por zona/HP */
for (const [k, row] of byKey) {
  if (compradores.has(k)) continue
  if (str(row.assessor)) continue
  const uf = str(row.uf).toUpperCase() || hpByKey.get(k)?.uf || dddUf(row.telefone || hpByKey.get(k)?.fone) || null
  const assessor = melhor(lancesAssessorVgv, k) || melhor(hpAssessorVgv, k) || (uf ? ZONA[uf] || null : null)
  if (!assessor) continue
  atualizados++
  console.log(`~ ${row.nome}: assessor=${assessor} (sem fechamento; via ${uf ? 'zona/HP' : 'HP'})`)
  if (APPLY) {
    const { error } = await sb.from('clientes').update({ assessor }).eq('id', row.id)
    if (error) console.error('  ERRO update: ' + error.message)
  }
}

console.log(`\n-> ${criados} criados, ${atualizados} atualizados, ${semMudanca} sem mudança, ${semAssessor} compradores sem assessor determinável`)
console.log(APPLY ? 'APLICADO.' : 'DRY-RUN. Use --apply para gravar.')
