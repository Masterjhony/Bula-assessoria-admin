// Passo 2 do enriquecimento da conciliacao (05/08/2026): contrapartes
// institucionais que nao tem CNPJ na descricao — tarifas/seguros/capital do
// proprio Sicoob, Tokio Marine, Receita Federal, Prefeitura — e o pagador
// PF "JOSE ANTONIO FERNAND" (CPF na descricao, sem cadastro).
// Idempotente; so preenche pessoa_id vazio. DRY_RUN=1 para simular.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const now = () => new Date().toISOString()
const MARK = '[ENRIQUECE-CONC-P2 05/08]'

async function all(table, select, filters = (q) => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filters(sb.from(table).select(select)).range(from, from + 999)
    if (error) throw new Error(table + ': ' + error.message)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const pessoas = await all('erp_pessoas', 'id,nome,documento')
const byNome = (frag) => pessoas.find((p) => p.nome && p.nome.toUpperCase().includes(frag))

async function garantePessoa(def) {
  const hit = def.documento ? pessoas.find((p) => String(p.documento || '').replace(/\D/g, '') === def.documento.replace(/\D/g, '')) : byNome(def.busca)
  if (hit) return hit
  if (DRY_RUN) { console.log(`[+] pessoa nova: ${def.nome}`); const fake = { id: null, nome: def.nome }; pessoas.push(fake); return fake }
  const { data, error } = await sb.from('erp_pessoas').insert({
    tipo: def.tipo, nome: def.nome, razao_social: def.razao || def.nome, documento: def.documento || null,
    is_cliente: !!def.cliente, is_fornecedor: !def.cliente, ativo: true,
    observacoes: `${MARK} Cadastro automatico para conciliacao (contraparte institucional/recorrente do extrato).`,
  }).select('id,nome,documento').single()
  if (error) throw new Error(`pessoa ${def.nome}: ${error.message}`)
  pessoas.push(data)
  console.log(`[+] pessoa nova: ${data.nome}`)
  return data
}

// contrapartes fixas
const SICOOB = await garantePessoa({ busca: 'SICOOB UNIQUE', nome: 'SICOOB Unique BR (banco)', razao: 'COOP. DE CREDITO SICOOB UNIQUE BR', tipo: 'pj', documento: null })
const TOKIO = await garantePessoa({ busca: 'TOKIO MARINE', nome: 'TOKIO MARINE SEGURADORA', tipo: 'pj', documento: '33.164.021/0001-00' })
const RFB = await garantePessoa({ busca: 'RECEITA FEDERAL', nome: 'RECEITA FEDERAL', tipo: 'pj', documento: null })
const PREF = await garantePessoa({ busca: 'PREFEITURA', nome: 'PREFEITURA MUNICIPAL (ISSQN/Alvara)', tipo: 'pj', documento: null })
const JAF = await garantePessoa({ busca: 'JOSE ANTONIO FERNAND', nome: 'Jose Antonio Fernand', tipo: 'pf', documento: '109.092.808-43', cliente: true })

// regra: primeira que casar vence
const REGRAS = [
  { re: /TOKIO ?MARINE/i, p: TOKIO },
  { re: /DEB\.?CONV\.?PREFEITURA|ISSQN|ALVARA/i, p: PREF },
  { re: /TRIBUTOS FEDERAIS|RFB|SIMPLES NACIONAL|DARF/i, p: RFB },
  { re: /JOSE ANTONIO FERNAND/i, p: JAF },
  { re: /D[EÉ]B\.? ?CONV|CESTA DE RELACIONAMENTO|INTEGR\.?CAPITAL|PARCELAS SUBSC|PACOTE (DE )?SERV|TARIFA|SOBRAS|DEB\.?CTA\.?FATURA|EST\.?D[EÉ]B|ESTORNO DE LANCAMENTO|DISTRIBUICAO RESULTADOS/i, p: SICOOB },
]

const movs = await all('erp_movimentos_bancarios', 'id,data,tipo,descricao,valor,pessoa_id,observacoes', (q) => q.is('pessoa_id', null))
let n = 0
for (const m of movs) {
  if (m.tipo !== 'entrada' && m.tipo !== 'saida') continue
  const texto = `${m.descricao || ''} | ${m.observacoes || ''}`
  const regra = REGRAS.find((r) => r.re.test(texto))
  if (!regra || !regra.p.id) { if (regra && DRY_RUN) { console.log(`[~] ${m.data} ${String(m.descricao).slice(0, 55)} => ${regra.p.nome}`); n++ } continue }
  if (DRY_RUN) { console.log(`[~] ${m.data} ${String(m.descricao).slice(0, 55)} => ${regra.p.nome}`); n++; continue }
  const { error } = await sb.from('erp_movimentos_bancarios').update({
    pessoa_id: regra.p.id,
    observacoes: `${m.observacoes ? m.observacoes + ' ' : ''}${MARK} pessoa preenchida por regra institucional.`,
    updated_at: now(),
  }).eq('id', m.id)
  if (error) throw new Error(`mov ${m.id}: ${error.message}`)
  console.log(`[~] ${m.data} ${String(m.descricao).slice(0, 55)} => ${regra.p.nome}`)
  n++
}
console.log(`\n${DRY_RUN ? 'Simuladas' : 'Gravadas'} ${n} atribuicoes.`)
