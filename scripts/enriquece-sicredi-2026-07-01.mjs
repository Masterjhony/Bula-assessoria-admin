// Enriquece os movimentos do Sicredi com contraparte + categoria. 01/07/2026.
// O Sicredi traz o CNPJ/CPF na própria descrição (PAGAMENTO/RECEBIMENTO PIX
// <doc>, TED <doc> NOME, LIQUIDACAO BOLETO <doc>) e o comerciante em COMPRAS
// NACIONAIS <merchant>. Operações internas (resgate/aplicação/integralização/
// cesta/sobras) são categorizadas sem contraparte externa.
//
// Uso: node scripts/enriquece-sicredi-2026-07-01.mjs          (DRY RUN)
//      APPLY=1 node scripts/enriquece-sicredi-2026-07-01.mjs  (grava)

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.env.APPLY === '1'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const SICREDI = 'af4724ec-e098-4e13-b172-04b2bfb1949d'
const titulo = (s) => String(s).replace(/\S+/g, (w) => w.length <= 2 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())
const fmtDoc = (c) => c.length === 14 ? `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}` : (c.length === 11 ? `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9)}` : c)

const CAT = {
  RESGATE: '67fbaf99-9539-4433-936a-d8f499363a34', // Resgate Aplicacao Financeira (receita)
  APLIC: 'e7198fb9-acfc-4b22-a738-dcf72000dd31',   // Aplicacao Financeira (despesa)
  INTEG: '9e152b58-58ac-48b3-a17d-3b9d4a6acbb2',   // Integralizacao Capital Cooperativa
  TARIFA: '9c55f122-a8e6-4900-bb18-d882e14b0c9c',  // Tarifas Bancarias
  SOBRAS: 'e36b71b2-089d-4b3c-9943-aec555c721c5',  // Outras Receitas
  TRANSP: '39139125-e4b4-4b9c-9438-28d775e9e637',  // Transporte (Apps)
  COMBU: '9dcb4575-515f-417b-9cbe-85a4aa36a861',   // Combustivel
  COMPRAS: '1d16d458-64a3-4e01-b47e-83793bf077e5', // Compras Diversas
}
const GENERICAS = new Set(['2be58816-f134-417c-8a1c-296e3eef78b0','9e20f375-b070-4991-95f8-723210cf9bd0','20c2defd-415c-42cc-8939-fcd8cf104280','1d16d458-64a3-4e01-b47e-83793bf077e5', null])

const { data: pessoas } = await sb.from('erp_pessoas').select('id,nome,documento,is_cliente,is_fornecedor')
const byDoc = new Map(), byNome = new Map()
const nkey = (s) => String(s || '').toUpperCase().replace(/\.$/,'').replace(/\s+(LTDA|S\.?A|EIRELI|ME|EPP)\.?$/,'').replace(/\s+/g,' ').trim()
for (const p of pessoas || []) { if (p.documento) byDoc.set(p.documento.replace(/\D/g, ''), p); byNome.set(nkey(p.nome), p) }
const cnpjCache = new Map()
async function resolveCnpjNome(c14) {
  if (cnpjCache.has(c14)) return cnpjCache.get(c14)
  for (const url of [`https://brasilapi.com.br/api/cnpj/v1/${c14}`, `https://minhareceita.org/${c14}`]) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); if (!r.ok) continue; const j = await r.json(); const nome = j.razao_social || j.nome; if (nome) { const fant = j.nome_fantasia || (j.estabelecimento && j.estabelecimento.nome_fantasia) || ''; const out = fant || nome; cnpjCache.set(c14, out); return out } } catch {}
  }
  cnpjCache.set(c14, null); return null
}
async function ensurePessoa(doc, nomeGuess, flags) {
  const p = byDoc.get(doc) || (nomeGuess && byNome.get(nkey(nomeGuess)))
  if (p) return { id: p.id, nome: p.nome }
  let nome = nomeGuess
  if (!nome && doc.length === 14) nome = await resolveCnpjNome(doc)
  if (!nome) return null // CPF desconhecido: não cria
  nome = doc.length === 14 ? nome : titulo(nome)
  if (!APPLY) { const f = { id: `NOVA:${nome}`, nome }; byDoc.set(doc, { id: f.id, nome }); return f }
  const { data, error } = await sb.from('erp_pessoas').insert({ tipo: doc.length === 14 ? 'pj' : 'pf', nome, razao_social: doc.length === 14 ? nome : '', documento: fmtDoc(doc), is_cliente: !!flags.is_cliente, is_fornecedor: !!flags.is_fornecedor, ativo: true, observacoes: 'Cadastro via extrato Sicredi 01/07/2026' }).select('id').single()
  if (error) throw new Error(`pessoa ${nome}: ${error.message}`)
  const np = { id: data.id, nome }; byDoc.set(doc, np); byNome.set(nkey(nome), np); return np
}

const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,valor,tipo,descricao,observacoes,categoria_id,pessoa_id')
  .eq('conta_bancaria_id', SICREDI).is('pessoa_id', null)

let vinc = 0, catset = 0, internos = 0, desconhecidos = 0
const novas = new Set(), semDoc = []
for (const m of movs) {
  const d = (m.descricao || '')
  const up = d.toUpperCase()
  let pessoaNome = null, pid = null, cat = null, rot = m.tipo === 'entrada' ? 'Pagador' : 'Recebedor', interno = false

  const mPix = up.match(/(?:PAGAMENTO|RECEBIMENTO)\s+PIX\s+(\d{11,14})/)
  const mTed = up.match(/\bTED\s+(\d{14})\s+([A-ZÀ-Ú0-9 ]+)/)
  const mBol = up.match(/LIQUIDACAO BOLETO\s+(\d{14})/)
  const mCompra = d.match(/COMPRAS NACIONAIS\s+(.+)$/i)

  if (/RESG\.APLIC|RESGATE.*APLIC/.test(up)) { cat = CAT.RESGATE; interno = true }
  else if (/APLICACAO FINANCEIRA/.test(up)) { cat = CAT.APLIC; interno = true }
  else if (/INTEGR\.CAPITAL/.test(up)) { cat = CAT.INTEG; pessoaNome = 'SICREDI (Integralização de capital)' }
  else if (/CESTA DE RELACION|TARIFA|CEST /.test(up)) { cat = CAT.TARIFA; pessoaNome = 'SICREDI (Tarifas)' }
  else if (/DISTRIBUICAO RESULT|SOBRAS/.test(up)) { cat = CAT.SOBRAS; pessoaNome = 'SICREDI (Distribuição de sobras)' }
  else if (/ESTORNO/.test(up)) { interno = true }
  else if (mTed) { const doc = mTed[1]; const nm = mTed[2].replace(/\s+\d.*$/, '').trim(); const p = await ensurePessoa(doc, nm, m.tipo === 'entrada' ? { is_cliente: true } : { is_fornecedor: true }); if (p) { pid = p.id; pessoaNome = p.nome } }
  else if (mPix || mBol) { const doc = (mPix ? mPix[1] : mBol[1]); const p = await ensurePessoa(doc, null, m.tipo === 'entrada' ? { is_cliente: true } : { is_fornecedor: true }); if (p) { pid = p.id; pessoaNome = p.nome } else { semDoc.push(`${m.data} ${m.tipo} ${fmtDoc(doc)} ${d.slice(0,30)}`); desconhecidos++ } }
  else if (mCompra) {
    let raw = mCompra[1].replace(/\s+VE\d+\s*$/i, '').replace(/\s+BRA?\s*$/i, '').trim()
    const ru = raw.toUpperCase()
    let key
    if (/UBER/.test(ru)) { pessoaNome = 'UBER DO BRASIL TECNOLOGIA LTDA'; cat = CAT.TRANSP; key = 'COMPRA-UBER' }
    else if (/POSTO|AUTO POSTO|COMBUS/.test(ru)) { pessoaNome = titulo(raw.split(/\s+/).slice(0, 4).join(' ')); cat = CAT.COMBU; key = 'COMPRA-' + pessoaNome.toUpperCase() }
    else { pessoaNome = titulo(raw.split(/\s+/).slice(0, 3).join(' ')); cat = /LANCH|PAO|BEER|CHARIA|REST/.test(ru) ? 'b26ffe87-f4d6-4060-b697-a7f698c35f7d' : CAT.COMPRAS; key = 'COMPRA-' + pessoaNome.toUpperCase() }
    rot = 'Comerciante'
    const p = await ensurePessoa(key, pessoaNome, { is_fornecedor: true }); if (p) pid = p.id
  }

  if (interno) internos++
  // categorias type-based (resgate/aplic/integ/tarifa/sobras/uber/posto) são
  // determinísticas pela descrição -> aplica sempre; senão respeita gate genérico.
  const catDeterministica = interno || /INTEGR\.CAPITAL|CESTA|TARIFA|SOBRAS|COMPRAS NACIONAIS/.test(up)
  const upd = { updated_at: new Date().toISOString() }
  let touch = false
  if (pid && !String(pid).startsWith('NOVA:')) { upd.pessoa_id = pid; vinc++; touch = true }
  if (String(pid).startsWith('NOVA:')) { novas.add(pessoaNome); vinc++; touch = true }
  if (cat && cat !== m.categoria_id && (catDeterministica || GENERICAS.has(m.categoria_id))) { upd.categoria_id = cat; catset++; touch = true }
  if (pessoaNome && !/(Pagador|Recebedor|Comerciante|Credor):/.test(m.observacoes || '')) { upd.observacoes = `${(m.observacoes || '').trim()}${m.observacoes ? ' | ' : ''}${(mCompra ? 'Comerciante' : rot)}: ${pessoaNome}`.trim(); touch = true }
  if (APPLY && touch && (upd.pessoa_id || upd.categoria_id || upd.observacoes)) await sb.from('erp_movimentos_bancarios').update(upd).eq('id', m.id)
}

console.log(`\n${APPLY ? '=== APLICADO ===' : '=== DRY RUN ==='} (Sicredi, ${movs.length} sem pessoa)`)
console.log(`  Contraparte vinculada/nomeada : ${vinc}`)
console.log(`  Categorias definidas          : ${catset}`)
console.log(`  Operações internas (aplic/resg/estorno): ${internos}`)
console.log(`  Pix/boleto com CPF desconhecido (precisa extrato Sicredi): ${desconhecidos}`)
if (!APPLY && novas.size) { console.log(`  Pessoas novas (${novas.size}):`); [...novas].slice(0,30).forEach(n=>console.log('    - '+n)) }
if (semDoc.length) { console.log('  CPFs desconhecidos:'); semDoc.forEach(s=>console.log('    - '+s)) }
