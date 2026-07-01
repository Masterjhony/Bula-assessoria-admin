// Resolve os pagamentos Pix a PESSOA FÍSICA (CPF) do extrato Sicoob que estavam
// sem contraparte no ERP. Recebedor (nome + CPF) extraído do Extrato Pix do
// internet banking (API /sicoobnet/api/pix/lancamentos), 01/07/2026.
//
// Casa cada Pix ao movimento do ERP por (data, valor) entre os que ainda estão
// sem pessoa_id, cria/vincula erp_pessoas (pessoa física, documento=CPF) e anexa
// "Recebedor: NOME (CPF)" em observacoes. NÃO altera categoria nem status.
//
// Fonte: scripts/data/pix-cpf-sicoob-2026.txt (data|valor|cpf|nome)
//
// Uso: node scripts/aplica-pix-cpf-sicoob-2026-07-01.mjs          (DRY RUN)
//      APPLY=1 node scripts/aplica-pix-cpf-sicoob-2026-07-01.mjs  (grava)

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

const linhas = readFileSync(join(root, 'scripts', 'data', 'pix-cpf-sicoob-2026.txt'), 'utf-8').trim().split(/\r?\n/)
const PIX = linhas.map((l) => { const [d, v, c, n] = l.split('|'); return { d, v: parseFloat(v.replace(/\./g, '').replace(',', '.')), cpf: c, nome: n.trim() } })

const fmtCpf = (c) => c.length === 11 ? `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9)}` : c
const titulo = (s) => s.replace(/\S+/g, (w) => w.length <= 2 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())

const { data: pessoas } = await sb.from('erp_pessoas').select('id,nome,documento')
const byDoc = new Map(), byNome = new Map()
for (const p of pessoas || []) { if (p.documento) byDoc.set(p.documento.replace(/\D/g, ''), p); byNome.set((p.nome || '').toUpperCase(), p) }

async function ensurePessoa(cpf, nome) {
  const nomeFmt = titulo(nome)
  let p = byDoc.get(cpf) || byNome.get(nome.toUpperCase()) || byNome.get(nomeFmt.toUpperCase())
  const doc = fmtCpf(cpf)
  if (p) { if (!p.documento && APPLY) await sb.from('erp_pessoas').update({ documento: doc }).eq('id', p.id); return p.id }
  if (!APPLY) { const f = { id: `NOVA:${nomeFmt}` }; byDoc.set(cpf, f); return f.id }
  const { data, error } = await sb.from('erp_pessoas').insert({ tipo: 'pf', nome: nomeFmt, documento: doc, is_fornecedor: true, ativo: true, observacoes: 'Cadastro via Pix Sicoob 01/07/2026' }).select('id').single()
  if (error) throw new Error(`pessoa ${nomeFmt}: ${error.message}`)
  byDoc.set(cpf, { id: data.id }); return data.id
}

// movimentos sem pessoa (saidas)
const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,valor,descricao,observacoes,pessoa_id')
  .eq('conta_bancaria_id', SICOOB).eq('tipo', 'saida').is('pessoa_id', null)

const usados = new Set()
let vinc = 0, semMatch = 0, janela = 0
const novas = new Set(), naoAchou = []
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)

function achaMov(p) {
  // 1) data e valor exatos
  let mv = movs.find((m) => !usados.has(m.id) && m.data === p.d && Math.abs(Number(m.valor) - p.v) < 0.005)
  if (mv) return mv
  // 2) fallback: mesmo valor, lançado até 3 dias DEPOIS (fim de semana/liquidação), o mais próximo
  const cands = movs.filter((m) => !usados.has(m.id) && Math.abs(Number(m.valor) - p.v) < 0.005 && diasEntre(p.d, m.data) >= 1 && diasEntre(p.d, m.data) <= 3)
    .sort((a, b) => diasEntre(p.d, a.data) - diasEntre(p.d, b.data))
  if (cands.length) { janela++; return cands[0] }
  return null
}

for (const p of PIX) {
  const mv = achaMov(p)
  if (!mv) { semMatch++; naoAchou.push(`${p.d} ${p.v.toFixed(2)} ${p.nome}`); continue }
  usados.add(mv.id)
  const pid = await ensurePessoa(p.cpf, p.nome)
  if (String(pid).startsWith('NOVA:')) novas.add(titulo(p.nome))
  const nomeFmt = titulo(p.nome)
  const novaObs = `${(mv.observacoes || '').trim()}${mv.observacoes ? ' | ' : ''}Recebedor: ${nomeFmt} (${fmtCpf(p.cpf)})`.trim()
  if (APPLY && !String(pid).startsWith('NOVA:')) await sb.from('erp_movimentos_bancarios').update({ pessoa_id: pid, observacoes: novaObs, updated_at: new Date().toISOString() }).eq('id', mv.id)
  vinc++
}

console.log(`\n${APPLY ? '=== APLICADO ===' : '=== DRY RUN ==='}`)
console.log(`Pix CPF no extrato : ${PIX.length}`)
console.log(`  Casados/vinculados: ${vinc}  (exato + ${janela} por janela +1..3 dias)`)
console.log(`  Pessoas novas (PF): ${novas.size}`)
console.log(`  Sem match no ERP  : ${semMatch}`)
if (naoAchou.length) naoAchou.forEach((s) => console.log('    - ' + s))
