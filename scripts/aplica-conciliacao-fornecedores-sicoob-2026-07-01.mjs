// Enriquece os movimentos Sicoob no ERP com o CREDOR/FORNECEDOR identificado por
// CNPJ (01/07/2026). Duas coisas, ambas conservadoras:
//   1) NOMES: cria/vincula erp_pessoas (documento=CNPJ, razao_social) e preenche
//      pessoa_id nos movimentos que estao sem (aditivo; nao sobrescreve).
//   2) CATEGORIAS: SO refina movimentos que hoje estao numa categoria GENERICA
//      ("Outras Despesas"/"Compras Diversas") para uma categoria especifica
//      conforme o fornecedor. Nunca mexe em categoria ja especifica. Nao altera
//      status_conciliacao (pendentes seguem pendentes p/ revisao humana).
//
// Fonte dos nomes: Desktop/Conciliacao Sicoob 2026 - Fornecedores/fornecedores-por-cnpj.csv
//
// Uso: node scripts/aplica-conciliacao-fornecedores-sicoob-2026-07-01.mjs        (DRY RUN)
//      APPLY=1 node scripts/aplica-conciliacao-fornecedores-sicoob-2026-07-01.mjs (grava)

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.env.APPLY === '1'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const OWN_CNPJ = '34791630000143' // BULA (conta propria)

// categorias GENERICAS que podem ser refinadas
const GENERICAS = new Set([
  '2be58816-f134-417c-8a1c-296e3eef78b0', '9e20f375-b070-4991-95f8-723210cf9bd0',
  '20c2defd-415c-42cc-8939-fcd8cf104280', '1d16d458-64a3-4e01-b47e-83793bf077e5',
])
// mapa categoria sugerida (texto do CSV) -> categoria_id ERP (so as confiaveis)
const CAT = {
  'Refeições/Alimentação': 'b26ffe87-f4d6-4060-b697-a7f698c35f7d', // Alimentacao/Refeicoes
  'Deslocamento/App': '39139125-e4b4-4b9c-9438-28d775e9e637',       // Transporte (Apps)
  'Hospedagem/Viagem': '98083139-0fbf-487a-9988-a08519ebf259',      // Viagem/Passagens
  'Combustível': '9dcb4575-515f-417b-9cbe-85a4aa36a861',            // Combustivel
  'Marketing (Meta/Facebook)': '82d7c557-e8b4-40aa-963e-928b44b1bf54',
  'Repasse/Comissão (parceiro/relacionada)': '5dcdc58a-d81b-4a4c-a81a-5e703e6a1a90',
  'Transferência interna (mesma titularidade — REVISAR)': '1d83b7e5-aa77-4e1d-a774-64ecfda0b746',
  'Tecnologia/Plataforma/Taxas': '0edf60f2-bf96-44bd-8f93-ca5432b69830', // Software/Assinaturas
  'Reforma/Manutenção escritório': 'd91794fd-6ee4-4e47-866c-08bc3fcfe47f', // Manutencao
  'Taxas/Cartório/Trânsito': '6d3270c8-2680-4cdd-a709-5b1520d1f430', // Impostos e Taxas
  // sem mapa confiavel (deixa como esta): Caixa/Saúde/Consórcio/Doação/vazio
}

// 1) le CSV de fornecedores
const csv = readFileSync('C:/Users/Notebook-Acer/Desktop/Conciliacao Sicoob 2026 - Fornecedores/fornecedores-por-cnpj.csv', 'utf-8')
  .replace(/^﻿/, '').trim().split('\n').slice(1)
const info = new Map() // cnpj14 -> {razao, fant, catId}
for (const line of csv) {
  const cells = line.split(';').map((c) => c.replace(/^"|"$/g, ''))
  const [cnpjFmt, razao, fant, catSug] = cells
  const c14 = cnpjFmt.replace(/\D/g, '')
  if (c14.length !== 14) continue
  info.set(c14, { razao, fant, catId: CAT[catSug] || null })
}
console.log(`Fornecedores no CSV: ${info.size}`)

// 2) pessoas existentes (cache por documento digits e por nome)
const { data: pessoas } = await sb.from('erp_pessoas').select('id,nome,documento,is_cliente,is_fornecedor')
const byDoc = new Map(), byNome = new Map()
for (const p of pessoas || []) {
  if (p.documento) byDoc.set(p.documento.replace(/\D/g, ''), p)
  byNome.set((p.nome || '').toUpperCase(), p)
}

async function ensurePessoa(c14, razao, fant, flags) {
  let p = byDoc.get(c14) || byNome.get((fant || razao).toUpperCase()) || byNome.get((razao || '').toUpperCase())
  const fmt = `${c14.slice(0,2)}.${c14.slice(2,5)}.${c14.slice(5,8)}/${c14.slice(8,12)}-${c14.slice(12)}`
  if (p) {
    // completa documento/razao/flags se faltando
    const upd = {}
    if (!p.documento) upd.documento = fmt
    if (flags.is_fornecedor && !p.is_fornecedor) upd.is_fornecedor = true
    if (flags.is_cliente && !p.is_cliente) upd.is_cliente = true
    if (Object.keys(upd).length && APPLY) await sb.from('erp_pessoas').update(upd).eq('id', p.id)
    return p.id
  }
  const nome = fant || razao
  if (!APPLY) { return `NOVA(${nome})` }
  const { data, error } = await sb.from('erp_pessoas').insert({
    tipo: 'pj', nome, razao_social: razao || '', documento: fmt,
    is_cliente: !!flags.is_cliente, is_fornecedor: !!flags.is_fornecedor,
    observacoes: c14 === OWN_CNPJ ? 'Conta da propria BULA (transferencia entre titularidades) - REVISAR' : 'Cadastro automatico via conciliacao Sicoob 01/07/2026',
    ativo: true,
  }).select('id,nome,documento').single()
  if (error) throw new Error(`pessoa ${nome}: ${error.message}`)
  const np = { id: data.id, nome, documento: fmt, is_cliente: !!flags.is_cliente, is_fornecedor: !!flags.is_fornecedor }
  byDoc.set(c14, np); byNome.set(nome.toUpperCase(), np)
  return data.id
}

// 3) movimentos Sicoob
const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,tipo,valor,descricao,observacoes,categoria_id,pessoa_id,status_conciliacao')
  .eq('conta_bancaria_id', SICOOB).order('data')

const cnpjRe = /(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[\s/]?(\d{4})-?(\d{2})/
let planPessoa = 0, planCat = 0, semCnpj = 0, jaPessoa = 0
const catSamples = [], novasPessoas = new Set()

for (const m of movs) {
  const mt = `${m.descricao||''} ${m.observacoes||''}`.match(cnpjRe)
  const c14 = mt ? mt.slice(1).join('') : ''
  if (!c14 || !info.has(c14)) { semCnpj++; continue }
  const { razao, fant, catId } = info.get(c14)
  const flags = c14 === OWN_CNPJ ? {} : (m.tipo === 'entrada' ? { is_cliente: true } : { is_fornecedor: true })

  // pessoa
  if (!m.pessoa_id) {
    const pid = await ensurePessoa(c14, razao, fant, flags)
    if (typeof pid === 'string' && pid.startsWith('NOVA(')) novasPessoas.add(pid)
    if (APPLY && pid && !pid.startsWith?.('NOVA(')) await sb.from('erp_movimentos_bancarios').update({ pessoa_id: pid, updated_at: new Date().toISOString() }).eq('id', m.id)
    planPessoa++
  } else { jaPessoa++ }

  // categoria: so refina generica -> especifica confiavel
  if (catId && GENERICAS.has(m.categoria_id) && catId !== m.categoria_id) {
    if (catSamples.length < 15) catSamples.push(`${m.data} ${m.tipo} R$${m.valor} :: ${fant||razao} -> cat especifica`)
    if (APPLY) await sb.from('erp_movimentos_bancarios').update({ categoria_id: catId, updated_at: new Date().toISOString() }).eq('id', m.id)
    planCat++
  }
}

console.log(`\n${APPLY ? '=== APLICADO ===' : '=== DRY RUN (nada gravado) ==='}`)
console.log(`Movimentos Sicoob: ${movs.length}`)
console.log(`  pessoa_id a vincular : ${planPessoa}  (ja tinham: ${jaPessoa})`)
console.log(`  categorias a refinar : ${planCat}  (generica -> especifica)`)
console.log(`  sem CNPJ resolvivel  : ${semCnpj}  (boletos s/ doc, CPFs pessoa fisica)`)
if (!APPLY && novasPessoas.size) { console.log(`\n  Pessoas NOVAS a criar (${novasPessoas.size}):`); [...novasPessoas].slice(0,40).forEach((n)=>console.log('   -', n.slice(5,-1))) }
if (catSamples.length) { console.log('\n  Amostra refino de categoria:'); catSamples.forEach((s)=>console.log('   -', s)) }
