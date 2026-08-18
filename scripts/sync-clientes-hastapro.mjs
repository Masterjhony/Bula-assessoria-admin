/**
 * SYNC CLIENTES <- HastaPro + fechamentos (pedido do chefe, 18/08/2026):
 *   1. "Ter os dados preenchidos corretamente de cada cliente" — enriquece a
 *      tabela `clientes` com CPF/telefone/e-mail/cidade/UF do CLIENTES do
 *      HastaPro (qualquer filial; a pessoa é a mesma — memória FIL 01).
 *   2. "Todos os cadastros devem estar aqui" — cria a linha em `clientes` para
 *      TODO comprador presente nos fechamentos que ainda não tem registro.
 *   3. "Linkar clientes a assessores" — assessor principal = quem cobriu mais
 *      VGV dos lotes daquele comprador (lances dos fechamentos, que após o
 *      alinhamento vêm do LOT_PISTEIRO do HastaPro).
 *
 * Regra de ouro: dado manual NUNCA é sobrescrito — só preenche campo vazio.
 * (Exceção: `assessor` recém-criado é recalculado enquanto ninguém editar; a
 *  edição manual é preservada usando --keep-assessor.)
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
// compradores-placeholder não viram cliente
const PLACEHOLDER_RE = /^(a identificar|a definir|nao identificado|sem comprador|comprador)$/

/* ── 1. HastaPro: melhor registro de cada pessoa (todas as filiais) ────── */
const hpClientes = await fb(`
  select c.FIL_CODIGO, c.CLI_NOME, c.CLI_CPFCNPJ, c.CLI_CELULAR, c.CLI_FONECOM1, c.CLI_FONERES,
         c.CLI_EMAIL, c.CLI_UF, ci.CID_MUNICIPIO
  from CLIENTES c left join CIDADES ci on ci.CID_CODIGO = c.CLI_CID_CODIGO`)
const hpByKey = new Map()
for (const c of hpClientes) {
  const k = matchKey(c.CLI_NOME)
  if (!k) continue
  const cand = {
    nome: str(c.CLI_NOME),
    cpf: digits(c.CLI_CPFCNPJ) || null,
    fone: digits(c.CLI_CELULAR) || digits(c.CLI_FONECOM1) || digits(c.CLI_FONERES) || null,
    email: str(c.CLI_EMAIL).toLowerCase() || null,
    uf: str(c.CLI_UF).toUpperCase() || null,
    cidade: str(c.CID_MUNICIPIO) || null,
    fil2: str(c.FIL_CODIGO) === '2',
  }
  const atual = hpByKey.get(k)
  // preferência: FIL2 > tem CPF > tem fone
  const score = x => (x.fil2 ? 4 : 0) + (x.cpf ? 2 : 0) + (x.fone ? 1 : 0)
  if (!atual || score(cand) > score(atual)) hpByKey.set(k, cand)
}
console.log(`HastaPro: ${hpClientes.length} registros de cliente, ${hpByKey.size} pessoas únicas`)

/* ── 2. fechamentos: compradores + assessor principal por VGV ──────────── */
const { data: fes } = await sb.from('bula_leilao_fechamento').select('id,nome,data,compradores,lances')
const vgvPorCompradorAssessor = new Map() // key -> Map(assessor -> vgv)
const compradores = new Map() // key -> { nome, uf, fazenda }
for (const f of fes || []) {
  for (const c of f.compradores || []) {
    const nome = str(c.comprador || c.fazenda)
    const k = matchKey(nome)
    if (!k || PLACEHOLDER_RE.test(k)) continue
    if (!compradores.has(k)) compradores.set(k, { nome, uf: str(c.uf) || null, fazenda: str(c.fazenda) || null })
  }
  for (const l of f.lances || []) {
    const comprador = str(l.comprador).split('·')[0]
    const k = matchKey(comprador)
    const assessor = canonAssessor(l.assessor)
    if (!k || PLACEHOLDER_RE.test(k) || !assessor || /a definir/i.test(assessor)) continue
    const m = vgvPorCompradorAssessor.get(k) || new Map()
    m.set(assessor, (m.get(assessor) || 0) + (Number(l.vgv) || 0))
    vgvPorCompradorAssessor.set(k, m)
  }
}
const assessorPrincipal = k => {
  const m = vgvPorCompradorAssessor.get(k)
  if (!m || !m.size) return null
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]
}
console.log(`Fechamentos: ${compradores.size} compradores únicos`)

/* ── 3. upsert em `clientes` (manual vence; só preenche vazio) ─────────── */
const { data: rows } = await sb.from('clientes').select('*')
const byKey = new Map((rows || []).map(r => [r.match_key, r]))

let criados = 0, atualizados = 0, semMudanca = 0
const todasKeys = new Set([...compradores.keys(), ...byKey.keys()])
for (const k of todasKeys) {
  const row = byKey.get(k)
  const comp = compradores.get(k)
  const hp = hpByKey.get(k)
  const assessor = assessorPrincipal(k)

  if (!row) {
    if (!comp) continue // linha órfã impossível: sem comprador e sem row
    criados++
    const payload = {
      match_key: k,
      nome: hp?.nome || comp.nome,
      telefone: hp?.fone || null,
      email: hp?.email || null,
      cidade: hp?.cidade || null,
      uf: comp.uf || hp?.uf || null,
      cpf: hp?.cpf ? fmtCpf(hp.cpf) : null,
      assessor: assessor,
      observacoes: 'Criado pelo sync HastaPro/fechamentos (18/08/2026).',
    }
    console.log(`+ ${payload.nome}${payload.uf ? ' (' + payload.uf + ')' : ''}${assessor ? ' -> ' + assessor : ''}${payload.cpf ? ' CPF ok' : ''}`)
    if (APPLY) {
      const { error } = await sb.from('clientes').insert(payload)
      if (error) console.error('  ERRO insert: ' + error.message)
    }
    continue
  }

  // preenche apenas campos vazios (manual vence)
  const set = {}
  const fill = (campo, valor) => { if (valor && !str(row[campo])) set[campo] = valor }
  fill('telefone', hp?.fone)
  fill('email', hp?.email)
  fill('cidade', hp?.cidade)
  fill('uf', comp?.uf || hp?.uf)
  fill('cpf', hp?.cpf ? fmtCpf(hp.cpf) : null)
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
console.log(`\n-> ${criados} criados, ${atualizados} atualizados, ${semMudanca} sem mudança`)
console.log(APPLY ? 'APLICADO.' : 'DRY-RUN. Use --apply para gravar.')
