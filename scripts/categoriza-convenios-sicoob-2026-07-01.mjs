// Categoriza e nomeia os débitos de convênio/tarifa/cartão-débito do extrato
// Sicoob que não têm pessoa (não são Pix/boleto). 01/07/2026.
//
// Correções de categoria (as atuais estão erradas):
//   DÉB. CONV. SEGUROS  : Manutenção        -> Seguros
//   DEB.PARC.SUBS/INTEG : Tarifas Bancárias -> Integralização Capital Cooperativa
//   COMP MASTER MAESTRO : Cartão de Crédito -> por comerciante (é compra no débito)
// Nomeia o credor (pessoa) onde é inequívoco:
//   FD-RFB=Receita Federal | PREFEITURA | SANEAMENTO=Águas Guariroba |
//   TELECOMUN=Vivo | PACOTE SERVIÇOS/PARC.INTEG=Sicoob | MAESTRO=comerciante.
// NÃO mexe em: DÉB.CONV.DEM.EMPRES (fatura dos cartões Sicoob — módulo próprio),
// FD-RFB/PREFEITURA/SANEAMENTO/TELECOM (categoria já correta — só nomeia credor).
//
// Uso: node scripts/categoriza-convenios-sicoob-2026-07-01.mjs         (DRY RUN)
//      APPLY=1 node scripts/categoriza-convenios-sicoob-2026-07-01.mjs (grava)

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

const C = {
  SEGUROS: '4e96d8bf-f4f7-47d9-8d1b-f8035e7be97e',
  INTEG: '9e152b58-58ac-48b3-a17d-3b9d4a6acbb2',
  ALIMENT: 'b26ffe87-f4d6-4060-b697-a7f698c35f7d',
  SUPER: '10edf325-99f5-42f1-9e2d-33fd27756bf9',
  COMBU: '9dcb4575-515f-417b-9cbe-85a4aa36a861',
  OUTRAS: '9e20f375-b070-4991-95f8-723210cf9bd0',
  COMPRAS: '1d16d458-64a3-4e01-b47e-83793bf077e5',
}

const titulo = (s) => s.replace(/\S+/g, (w) => w.length <= 2 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())
const { data: pessoas } = await sb.from('erp_pessoas').select('id,nome,documento')
const byNome = new Map(); for (const p of pessoas || []) byNome.set((p.nome || '').toUpperCase(), p)
async function ensurePessoaNome(nome, flags = { is_fornecedor: true }) {
  let p = byNome.get(nome.toUpperCase())
  if (p) return p.id
  if (!APPLY) return `NOVA:${nome}`
  const { data, error } = await sb.from('erp_pessoas').insert({ tipo: 'pj', nome, is_fornecedor: !!flags.is_fornecedor, ativo: true, observacoes: 'Cadastro via conciliação convênios Sicoob 01/07/2026' }).select('id').single()
  if (error) throw new Error(`pessoa ${nome}: ${error.message}`)
  const np = { id: data.id, nome }; byNome.set(nome.toUpperCase(), np); return data.id
}

function maestroMerchant(desc) {
  const m = desc.replace(/COMP MASTER MAESTRO\s*-\s*/i, '').replace(/\s+(CAMPO GRANDE|MS)\s+BRA.*$/i, '').replace(/\s+BRA.*$/i, '').trim()
  const up = m.toUpperCase()
  let cat = C.COMPRAS
  if (/PIZZ|BOLOS|CONVENIENC|RESTAUR|LANCH/.test(up)) cat = C.ALIMENT
  else if (/COMPER|MERCADO|PIRES|SUPERM/.test(up)) cat = C.SUPER
  else if (/POSTO|ITANHANGA|COMBUS/.test(up)) cat = C.COMBU
  else if (/PARK|ESTACION/.test(up)) cat = C.OUTRAS
  return { nome: titulo(m), cat }
}

const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,valor,descricao,observacoes,categoria_id,pessoa_id')
  .eq('conta_bancaria_id', SICOOB).eq('tipo', 'saida').is('pessoa_id', null)

let catFix = 0, pes = 0
const resumo = {}
for (const m of movs) {
  const d = (m.descricao || '').toUpperCase()
  let novaCat = null, pessoaNome = null, rotulo = 'Credor'
  if (/CONV\.?\s*SEGUROS/.test(d)) { novaCat = C.SEGUROS; pessoaNome = null }
  else if (/PARC\.SUBS\/INTEG/.test(d)) { novaCat = C.INTEG; pessoaNome = 'SICOOB (Integralização de capital)' }
  else if (/PACOTE SERVI/.test(d)) { pessoaNome = 'SICOOB (Tarifas)' }
  else if (/MASTER MAESTRO/.test(d)) { const mm = maestroMerchant(m.descricao); novaCat = mm.cat; pessoaNome = mm.nome; rotulo = 'Comerciante' }
  else if (/FD-RFB/.test(d)) { pessoaNome = 'RECEITA FEDERAL DO BRASIL' }
  else if (/PREFEITURA/.test(d)) { pessoaNome = 'PREFEITURA MUNICIPAL (tributo)' }
  else if (/SANEAMENTO/.test(d)) { pessoaNome = 'AGUAS GUARIROBA S.A.' }
  else if (/TELECOMUN/.test(d)) { pessoaNome = 'TELEFONICA BRASIL S.A. (VIVO)' }
  else continue // DEM.EMPRES e outros: não mexer

  const upd = { updated_at: new Date().toISOString() }
  let touched = false
  if (novaCat && novaCat !== m.categoria_id) { upd.categoria_id = novaCat; catFix++; touched = true }
  if (pessoaNome) {
    const pid = await ensurePessoaNome(pessoaNome)
    if (!String(pid).startsWith('NOVA:')) { upd.pessoa_id = pid }
    if (!/(Credor|Comerciante):/.test(m.observacoes || '')) upd.observacoes = `${(m.observacoes || '').trim()}${m.observacoes ? ' | ' : ''}${rotulo}: ${pessoaNome}`.trim()
    pes++; touched = true
  }
  const k = d.split(' ').slice(0, 3).join(' ')
  resumo[k] = (resumo[k] || 0) + (touched ? 1 : 0)
  if (APPLY && touched && (upd.categoria_id || upd.pessoa_id || upd.observacoes)) await sb.from('erp_movimentos_bancarios').update(upd).eq('id', m.id)
}

console.log(`\n${APPLY ? '=== APLICADO ===' : '=== DRY RUN ==='}`)
console.log(`Correções de categoria: ${catFix}`)
console.log(`Movimentos nomeados (credor/comerciante): ${pes}`)
console.log('Por tipo:'); Object.entries(resumo).sort((a,b)=>b[1]-a[1]).forEach(([k,n])=>console.log(`  ${String(n).padStart(3)}x ${k}`))
