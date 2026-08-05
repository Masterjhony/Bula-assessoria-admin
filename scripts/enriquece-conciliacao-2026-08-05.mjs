// Enriquecimento da conciliacao bancaria — 05/08/2026.
// A tela de conciliacao ja mostra "quem pagou/recebeu" (pessoa) e o selo de
// vinculo com titulo, mas a maioria dos movimentos importados do extrato nao
// tem pessoa_id nem conta_pagar_id/conta_receber_id. Este script preenche:
//
//  1) VINCULO mov <-> titulo: match UNICO por valor da baixa + data exata
//     (saida: CP.valor_pago == mov.valor e CP.data_pagamento == mov.data;
//      entrada: CR.valor_recebido == mov.valor e CR.data_recebimento == mov.data).
//     Ambiguo (2+ candidatos) fica como esta. Ao vincular: status 'conciliado'.
//  2) PESSOA do movimento, nesta ordem:
//     a. fornecedor/cliente do titulo vinculado;
//     b. CNPJ/CPF completo achado na descricao/observacoes (digitos normalizados);
//     c. CPF mascarado ***.XXX.XXX-** -> match pelos 6 digitos do meio (unico);
//     d. nome de pessoa cadastrada contido na descricao (normalizado, >=10 chars, unico).
//  3) CNPJ sem cadastro -> consulta BrasilAPI e CRIA a pessoa (pj), depois vincula.
//     (cap de consultas por rodada; 350ms entre chamadas)
//
// Idempotente: so preenche campo vazio; nunca sobrescreve pessoa/vinculo existente.
// Uso: DRY_RUN=1 node scripts/enriquece-conciliacao-2026-08-05.mjs
//      node scripts/enriquece-conciliacao-2026-08-05.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const MAX_BRASILAPI = Number(process.env.MAX_BRASILAPI ?? 80)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100
const now = () => new Date().toISOString()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MARK = '[ENRIQUECE-CONC 05/08]'

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

const soDigitos = (s) => String(s || '').replace(/\D/g, '')
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

console.log(DRY_RUN ? '*** DRY RUN (nada grava) ***\n' : '*** GRAVANDO ***\n')

const [movs, cps, crs, pessoas] = await Promise.all([
  all('erp_movimentos_bancarios', 'id,conta_bancaria_id,data,tipo,descricao,valor,pessoa_id,conta_pagar_id,conta_receber_id,observacoes,status_conciliacao'),
  all('erp_contas_pagar', 'id,descricao,valor,valor_pago,data_pagamento,status,fornecedor_id', (q) => q.not('data_pagamento', 'is', null)),
  all('erp_contas_receber', 'id,descricao,valor,valor_recebido,data_recebimento,status,cliente_id', (q) => q.not('data_recebimento', 'is', null)),
  all('erp_pessoas', 'id,nome,razao_social,documento,is_cliente,is_fornecedor'),
])
console.log(`movimentos: ${movs.length} | CPs c/ baixa: ${cps.length} | CRs c/ baixa: ${crs.length} | pessoas: ${pessoas.length}`)

// Indices de titulos por (data|valor)
const cpIdx = new Map()
for (const c of cps) {
  if (!['pago', 'parcial'].includes(c.status)) continue
  const k = `${c.data_pagamento}|${r2(c.valor_pago)}`
  if (!cpIdx.has(k)) cpIdx.set(k, [])
  cpIdx.get(k).push(c)
}
const crIdx = new Map()
for (const c of crs) {
  if (!['recebido', 'parcial'].includes(c.status)) continue
  const k = `${c.data_recebimento}|${r2(c.valor_recebido)}`
  if (!crIdx.has(k)) crIdx.set(k, [])
  crIdx.get(k).push(c)
}
// titulos ja vinculados a algum movimento (nao vincular 2x)
const cpUsados = new Set(movs.map((m) => m.conta_pagar_id).filter(Boolean))
const crUsados = new Set(movs.map((m) => m.conta_receber_id).filter(Boolean))

// Indices de pessoas
const porDoc = new Map()      // digitos completos -> pessoa
const porMeioCpf = new Map()  // 6 digitos do meio do CPF -> [pessoas]
for (const p of pessoas) {
  const d = soDigitos(p.documento)
  if (!d) continue
  if (!porDoc.has(d)) porDoc.set(d, p)
  if (d.length === 11) {
    const meio = d.slice(3, 9)
    if (!porMeioCpf.has(meio)) porMeioCpf.set(meio, [])
    porMeioCpf.get(meio).push(p)
  }
}
const nomesIdx = pessoas
  .map((p) => ({ p, n: norm(p.nome), r: norm(p.razao_social) }))
  .filter((x) => x.n.length >= 10 || x.r.length >= 10)

const stats = { vinculoCP: 0, vinculoCR: 0, pessoaTitulo: 0, pessoaDoc: 0, pessoaCpfMask: 0, pessoaNome: 0, pessoaBrasilApi: 0, ambiguos: 0, semNada: 0 }
let brasilApiCalls = 0
const cnpjFalhou = new Set()

async function criaPessoaPorCnpj(cnpj14, isEntrada) {
  if (brasilApiCalls >= MAX_BRASILAPI || cnpjFalhou.has(cnpj14)) return null
  brasilApiCalls++
  await sleep(350)
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj14}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bula-erp/1.0)', Accept: 'application/json' },
    })
    if (!res.ok) { cnpjFalhou.add(cnpj14); return null }
    const j = await res.json()
    const nome = j.nome_fantasia || j.razao_social
    if (!nome) { cnpjFalhou.add(cnpj14); return null }
    const docFmt = cnpj14.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    const payload = {
      tipo: 'pj', nome, razao_social: j.razao_social || nome, documento: docFmt,
      cidade: j.municipio || null, uf: j.uf || null,
      is_cliente: !!isEntrada, is_fornecedor: !isEntrada,
      observacoes: `${MARK} Cadastrada automaticamente via BrasilAPI a partir do extrato.`,
      ativo: true,
    }
    if (DRY_RUN) {
      const fake = { id: `dry-${cnpj14}`, nome, documento: docFmt }
      porDoc.set(cnpj14, fake)
      console.log(`  [+] pessoa nova (BrasilAPI): ${nome} (${docFmt})`)
      return fake
    }
    const { data, error } = await sb.from('erp_pessoas').insert(payload).select('id,nome,documento').single()
    if (error) { cnpjFalhou.add(cnpj14); return null }
    porDoc.set(cnpj14, data)
    console.log(`  [+] pessoa nova (BrasilAPI): ${data.nome} (${docFmt})`)
    return data
  } catch { cnpjFalhou.add(cnpj14); return null }
}

function achaDocNoTexto(texto) {
  // CNPJ formatado ou com espaco antes do sufixo: 12.345.678/0001-90 | 12.345.678 0001-90 | 14 digitos
  const cnpj = texto.match(/(\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s.]?\d{4}[-\s]?\d{2})/)
  if (cnpj) { const d = soDigitos(cnpj[1]); if (d.length === 14) return { tipo: 'cnpj', d } }
  const cpf = texto.match(/(?<!\d)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/)
  if (cpf) { const d = soDigitos(cpf[1]); if (d.length === 11) return { tipo: 'cpf', d } }
  const mask = texto.match(/\*{3}\.?(\d{3})\.?(\d{3})[-.]?\*{2}/)
  if (mask) return { tipo: 'cpf-mask', d: mask[1] + mask[2] }
  return null
}

const updates = []
for (const m of movs) {
  if (m.tipo !== 'entrada' && m.tipo !== 'saida') continue
  const patch = {}
  const notas = []
  let titulo = null

  // ---- 1) vinculo com titulo ----
  if (!m.conta_pagar_id && !m.conta_receber_id) {
    if (m.tipo === 'saida') {
      const cand = (cpIdx.get(`${m.data}|${r2(m.valor)}`) || []).filter((c) => !cpUsados.has(c.id))
      if (cand.length === 1) {
        titulo = cand[0]
        patch.conta_pagar_id = titulo.id
        cpUsados.add(titulo.id)
        stats.vinculoCP++
        notas.push(`vinculo automatico a CP "${titulo.descricao.slice(0, 60)}" (valor+data da baixa, match unico)`)
      } else if (cand.length > 1) stats.ambiguos++
    } else {
      const cand = (crIdx.get(`${m.data}|${r2(m.valor)}`) || []).filter((c) => !crUsados.has(c.id))
      if (cand.length === 1) {
        titulo = cand[0]
        patch.conta_receber_id = titulo.id
        crUsados.add(titulo.id)
        stats.vinculoCR++
        notas.push(`vinculo automatico a CR "${titulo.descricao.slice(0, 60)}" (valor+data da baixa, match unico)`)
      } else if (cand.length > 1) stats.ambiguos++
    }
    if (titulo) { patch.status_conciliacao = 'conciliado'; patch.conciliado = true }
  } else if (m.conta_pagar_id) {
    titulo = cps.find((c) => c.id === m.conta_pagar_id) || null
  } else if (m.conta_receber_id) {
    titulo = crs.find((c) => c.id === m.conta_receber_id) || null
  }

  // ---- 2) pessoa ----
  if (!m.pessoa_id) {
    const texto = `${m.descricao || ''} | ${m.observacoes || ''}`
    let pessoa = null, fonte = ''
    const tituloPessoa = titulo ? (titulo.fornecedor_id || titulo.cliente_id) : null
    if (tituloPessoa) { pessoa = { id: tituloPessoa }; fonte = 'titulo'; stats.pessoaTitulo++ }
    if (!pessoa) {
      const doc = achaDocNoTexto(texto)
      if (doc && doc.tipo !== 'cpf-mask') {
        pessoa = porDoc.get(doc.d) || null
        if (pessoa) { fonte = 'documento'; stats.pessoaDoc++ }
        else if (doc.tipo === 'cnpj') {
          pessoa = await criaPessoaPorCnpj(doc.d, m.tipo === 'entrada')
          if (pessoa) { fonte = 'brasilapi'; stats.pessoaBrasilApi++ }
        }
      } else if (doc && doc.tipo === 'cpf-mask') {
        const cand = porMeioCpf.get(doc.d) || []
        if (cand.length === 1) { pessoa = cand[0]; fonte = 'cpf-mascarado'; stats.pessoaCpfMask++ }
      }
    }
    if (!pessoa) {
      const t = norm(texto)
      const hits = nomesIdx.filter((x) => (x.n && t.includes(x.n)) || (x.r && t.includes(x.r)))
      const unicos = [...new Set(hits.map((h) => h.p.id))]
      if (unicos.length === 1) { pessoa = hits[0].p; fonte = 'nome'; stats.pessoaNome++ }
    }
    if (pessoa && !String(pessoa.id).startsWith('dry-')) {
      patch.pessoa_id = pessoa.id
      notas.push(`pessoa preenchida por ${fonte}`)
    } else if (pessoa) {
      notas.push('pessoa (dry) por brasilapi')
    }
  }

  if (Object.keys(patch).length) {
    patch.observacoes = `${m.observacoes ? m.observacoes + ' ' : ''}${MARK} ${notas.join('; ')}.`
    updates.push({ id: m.id, data: m.data, valor: m.valor, tipo: m.tipo, desc: m.descricao, patch })
  } else if (!m.pessoa_id && !m.conta_pagar_id && !m.conta_receber_id) {
    stats.semNada++
  }
}

console.log(`\nAtualizacoes a aplicar: ${updates.length}`)
for (const u of updates.slice(0, 40)) {
  console.log(`[~] ${u.data} ${u.tipo.padEnd(7)} ${brl(u.valor).padStart(13)} :: ${String(u.desc).slice(0, 50)} => ${Object.keys(u.patch).filter((k) => k !== 'observacoes').join(', ')}`)
}
if (updates.length > 40) console.log(`... e mais ${updates.length - 40}`)

if (!DRY_RUN) {
  let done = 0
  for (const u of updates) {
    const { error } = await sb.from('erp_movimentos_bancarios').update({ ...u.patch, updated_at: now() }).eq('id', u.id)
    if (error) throw new Error(`mov ${u.id}: ${error.message}`)
    done++
    if (done % 50 === 0) console.log(`  ... ${done}/${updates.length}`)
  }
  console.log(`Gravadas ${done} atualizacoes.`)
}

console.log('\n=== RESUMO ===')
console.log(`vinculos novos: CP ${stats.vinculoCP} | CR ${stats.vinculoCR} | ambiguos (nao mexi): ${stats.ambiguos}`)
console.log(`pessoa por: titulo ${stats.pessoaTitulo} | documento ${stats.pessoaDoc} | CPF mascarado ${stats.pessoaCpfMask} | nome ${stats.pessoaNome} | BrasilAPI ${stats.pessoaBrasilApi}`)
console.log(`sem nenhum enriquecimento possivel: ${stats.semNada}`)
console.log(`consultas BrasilAPI: ${brasilApiCalls} (cap ${MAX_BRASILAPI})${cnpjFalhou.size ? ` | CNPJs sem resposta: ${cnpjFalhou.size}` : ''}`)
