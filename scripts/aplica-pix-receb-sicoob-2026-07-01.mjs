// Resolve os RECEBIMENTOS (entradas) Pix do extrato Sicoob sem contraparte no
// ERP. Pagador (nome + CPF/CNPJ) do Extrato Pix (API /pix/lancamentos, sentido
// CREDITO/RECEBIMENTO), 01/07/2026.
//
// Casa por (data, valor) + janela +1..3 dias entre as ENTRADAS sem pessoa_id,
// cria/vincula erp_pessoas (cliente; conta própria = transferência interna) e
// anexa "Pagador: NOME (doc)". Categoria: só marca "Transferências Internas -
// Entrada" quando o pagador é a própria Bula/Bula Remates e a categoria atual é
// genérica; demais mantêm a categoria atual.
//
// Uso: node scripts/aplica-pix-receb-sicoob-2026-07-01.mjs         (DRY RUN)
//      APPLY=1 node scripts/aplica-pix-receb-sicoob-2026-07-01.mjs (grava)

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.env.APPLY === '1'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const OWN = '34791630000143'
const TRANSF_ENT = '2847979e-b319-4cad-9510-828c9d6bc1c0' // Transferencias Internas - Entrada
const REC_GEN = new Set(['e36b71b2-089d-4b3c-9943-aec555c721c5','bf73ee5c-3b29-42dc-95d7-e3d37cffd604','2bb61ca0-b99e-4c57-8f99-07ca933b4d7c'])

const linhas = readFileSync(join(root, 'scripts', 'data', 'pix-receb-sicoob-2026.txt'), 'utf-8').trim().split(/\r?\n/)
const PIX = linhas.map((l) => { const [d, v, c, n] = l.split('|'); return { d, v: parseFloat(v.replace(/\./g, '').replace(',', '.')), doc: c, nome: n.trim() } })

const fmtDoc = (c) => c.length === 14 ? `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}` : (c.length === 11 ? `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9)}` : c)
const titulo = (s) => s.replace(/\S+/g, (w) => w.length <= 2 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())

const { data: pessoas } = await sb.from('erp_pessoas').select('id,nome,documento')
const byDoc = new Map(), byNome = new Map()
for (const p of pessoas || []) { if (p.documento) byDoc.set(p.documento.replace(/\D/g, ''), p); byNome.set((p.nome || '').toUpperCase(), p) }

async function ensurePessoa(doc, nome) {
  const nomeFmt = doc.length === 14 ? nome : titulo(nome)
  let p = byDoc.get(doc) || byNome.get(nome.toUpperCase()) || byNome.get(nomeFmt.toUpperCase())
  const docFmt = fmtDoc(doc)
  if (p) { if (!p.documento && APPLY) await sb.from('erp_pessoas').update({ documento: docFmt, is_cliente: true }).eq('id', p.id); return p.id }
  if (!APPLY) { const f = { id: `NOVA:${nomeFmt}` }; byDoc.set(doc, f); return f.id }
  const { data, error } = await sb.from('erp_pessoas').insert({ tipo: doc.length === 14 ? 'pj' : 'pf', nome: nomeFmt, razao_social: doc.length === 14 ? nome : '', documento: docFmt, is_cliente: true, ativo: true, observacoes: 'Cadastro via Pix recebido Sicoob 01/07/2026' }).select('id').single()
  if (error) throw new Error(`pessoa ${nomeFmt}: ${error.message}`)
  byDoc.set(doc, { id: data.id }); return data.id
}

const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,valor,descricao,observacoes,categoria_id,pessoa_id')
  .eq('conta_bancaria_id', SICOOB).eq('tipo', 'entrada').is('pessoa_id', null)

const usados = new Set()
const diff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
function acha(p) {
  let mv = movs.find((m) => !usados.has(m.id) && m.data === p.d && Math.abs(Number(m.valor) - p.v) < 0.005)
  if (mv) return mv
  const c = movs.filter((m) => !usados.has(m.id) && Math.abs(Number(m.valor) - p.v) < 0.005 && diff(p.d, m.data) >= 1 && diff(p.d, m.data) <= 3).sort((a, b) => diff(p.d, a.data) - diff(p.d, b.data))
  return c[0] || null
}

let vinc = 0, semMatch = 0, catT = 0
const naoAchou = []
for (const p of PIX) {
  const mv = acha(p)
  if (!mv) { semMatch++; naoAchou.push(`${p.d} ${p.v.toFixed(2)} ${p.nome}`); continue }
  usados.add(mv.id)
  const nomeFmt = p.doc.length === 14 ? p.nome : titulo(p.nome)
  const pid = await ensurePessoa(p.doc, p.nome)
  const rotulo = p.doc === OWN ? 'Transf. entre contas próprias' : 'Pagador'
  const novaObs = `${(mv.observacoes || '').trim()}${mv.observacoes ? ' | ' : ''}${rotulo}: ${nomeFmt} (${fmtDoc(p.doc)})`.trim()
  const upd = { observacoes: novaObs, updated_at: new Date().toISOString() }
  if (!String(pid).startsWith('NOVA:')) upd.pessoa_id = pid
  if (p.doc === OWN && REC_GEN.has(mv.categoria_id)) { upd.categoria_id = TRANSF_ENT; catT++ }
  if (APPLY && upd.pessoa_id) await sb.from('erp_movimentos_bancarios').update(upd).eq('id', mv.id)
  vinc++
}

console.log(`\n${APPLY ? '=== APLICADO ===' : '=== DRY RUN ==='}`)
console.log(`Pix recebidos no extrato: ${PIX.length}`)
console.log(`  Entradas casadas/vinc  : ${vinc}`)
console.log(`  -> transf. interna cat : ${catT}`)
console.log(`  Sem match no ERP       : ${semMatch}`)
if (naoAchou.length) naoAchou.forEach((s) => console.log('    - ' + s))
