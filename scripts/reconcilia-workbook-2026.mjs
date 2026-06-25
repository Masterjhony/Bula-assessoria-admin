// Reconciliação do workbook "FINANCEIRO BULA 2026.xlsx" (fonte-mestra) com o ERP.
//
// Filosofia (combinada com o cliente em 25/06): a planilha é mestra para STATUS
// (avançar vencido->recebido) e para preencher LACUNAS; mas o ERP pode ter dados
// mais completos que a planilha — então NÃO sobrescrevo valores divergentes,
// apenas SINALIZO. Duplicatas que criei nesta sessão são consolidadas à parte.
//
// Faz:
//  1) STATUS updates seguros (valor casa exato + nome único).
//  2) CREATE de recebíveis que a planilha tem e o ERP não.
//  3) FOLHA de junho/2026 (CPs por colaborador, conforme aba Folha & Comissões).
//  4) Relatório de CONFLITOS DE VALOR (planilha x ERP) — sem gravar.
//
// Uso: DRY_RUN=1 node scripts/reconcilia-workbook-2026.mjs  (sem DRY_RUN grava)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const addDays = (iso, d) => { const x = new Date(`${iso}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }
const now = () => new Date().toISOString()

const CAT_RECEITA = 'e74434bd-3366-4015-9268-15d6640cf15f'
const CAT_FOLHA = 'e471f1e8-a451-4baa-b8a1-cef34129c3db'
const LEILOEIRA = { PROGRAMA: 'cdfed41f-ff46-4519-8dff-10d8d8fccaa5', REMATES: '0e458050-bf86-4c52-9a4e-a06d0b94a386', AGRESTE: '8720c854-fd20-466f-98d6-5e6dffc1a2da' }

// ---------- 1) STATUS updates seguros (valor casa exato) ----------
// [numero_documento OU {descricaoMatch}, novoStatus, marcaRecebido]
const STATUS_UPDATES = [
  { doc: 'BULA-2026-CR-006-NF575', status: 'recebido', leilao: '#6 Partner RG Fêmeas' },
  { doc: 'BULA-2026-CR-029-NF588', status: 'recebido', leilao: '#29 Mega Genética Naviraí 1ª etapa' },
  { doc: 'BULA-2026-CR-039', status: 'recebido', leilao: '#39 Toka do Jacaré - Vanguarda' },
  { doc: 'BULA-2026-CR-051', status: 'recebido', leilao: '#50 Camparino - Expozebu' },
  { doc: 'BULA-2026-CR-055', status: 'aberto', leilao: '#53 Nelore Pintado Raiz' },
  { doc: 'BULA-2026-CR-052', status: 'aberto', leilao: '#51 Matrizes EAO (A RECEBER 03/07)' },
  { doc: 'BULA-2026-CR-053', status: 'aberto', leilao: '#52 Touros EAO (A RECEBER 03/07)' },
  { doc: 'BULA-2026-CR-EXTRA-NELORE-MARCIO-DE', status: 'recebido', leilao: '#55 Marcio de Rezende - MRA' },
  { descr: 'LEILAO GOLDEN BOYS MATINHA - 19/05/2026', status: 'recebido', leilao: '#60 Matinha Golden Boys' },
]

// ---------- 2) CREATE recebíveis faltantes (planilha tem, ERP não) ----------
const CREATE_CR = [
  { doc: 'BULA-2026-CR-005-NF574', descricao: 'LEILÃO KATAYAMA (2ª/NF574) - E-RURAL', leiloeira: 'ERURAL', valor: 716.70, emissao: '2026-02-01', status: 'recebido', leilao: '#5 Katayama (NF 574)' },
  { doc: 'BULA-2026-CR-057-RIBALTA', descricao: 'LEILÃO ESPECIAL 60 ANOS RIBALTA - REMATES', leiloeira: 'REMATES', valor: 58890, emissao: '2026-05-14', status: 'recebido', leilao: '#57 Ribalta 60 anos' },
  { doc: 'BULA-2026-CR-061-TRESMAR', descricao: 'LEILAO TRESMAR (21/05) - REMATES', leiloeira: 'REMATES', valor: 9933, emissao: '2026-05-21', status: 'recebido', leilao: '#61 Tresmar (maio)' },
  { doc: 'BULA-2026-CR-062-MEGA', descricao: '18º MEGA LEILÃO NELORE - ANGICO', leiloeira: null, valor: 3870, emissao: '2026-05-30', status: 'recebido', leilao: '#62 18º Mega Nelore' },
  { doc: 'BULA-2026-CR-065-LS', descricao: 'LEILÃO LS AGROPECUARIA (31/05) - E-RURAL', leiloeira: 'ERURAL', valor: 18754, emissao: '2026-05-31', status: 'aberto', leilao: '#65 LS Agropecuária (31/05)' },
]

// ---------- 3) FOLHA junho/2026 (aba Folha & Comissões; total fixo 35.800) ----------
const FOLHA = [
  { nome: 'FABIO OMENNA', fornId: '98917740-4258-4fb7-9d9b-a949cd44f69c', valor: 11700, funcao: 'Assessor Comercial' },
  { nome: 'DOUGLAS BISPO', fornId: 'e2ea805a-ce5e-4b69-836e-2b178c61bcf3', valor: 3600, funcao: 'Assessor Comercial' },
  { nome: 'LEONARDO', fornId: '96c3b208-be13-4b37-b8bd-5dfe885e2600', valor: 13500, funcao: 'Assessor Técnico' },
  { nome: 'JOÃO EDUARDO', fornId: null, valor: 3000, funcao: 'Tecnologia e Financeiro' },
  { nome: 'JOÃO GABRIEL', fornId: null, valor: 2000, funcao: 'Marketing' },
  { nome: 'JOÃO ANTONIO', fornId: null, valor: 2000, funcao: 'SDR' },
]

// ---------- 4) CONFLITOS DE VALOR (apenas reporta) ----------
const CONFLITOS = [
  ['#43 Terra Brava (abr)', 3990, 'BULA-2026-CR-043', 6930],
  ['#45 Leilão MRA (abr)', 11795, 'BULA-2026-CR-045', 14340],
  ['#54 Matrizes Santa Fé', 9200, 'BULA-2026-CR-056', 20610],
  ['#59 Matinha Matrizes', 8850, 'BULA-2026-CR-059', 20930.70],
  ['#51 Matrizes EAO', 54669.29, 'BULA-2026-CR-052', 58351.26],
  ['#52 Touros EAO', 25602.72, 'BULA-2026-CR-053', 23342.55],
  ['#63 LS Agropecuária (30/05)', 16026, 'BULA-2026-CR-EXTRA-LS-AGROPECUARIA', 16666.58],
  ['#56 Santa Nazaré Excelência', 0, 'BULA-2026-CR-058', 17908],
  ['#10/#11 Guadalupe (planilha zerou/venceu)', null, 'BULA-2026-CR-010/011', 4218],
]

async function findLeiloeira(key) {
  if (key === 'ERURAL') { const { data } = await sb.from('erp_pessoas').select('id').ilike('nome', '%e-rural%').maybeSingle(); return data?.id || null }
  return LEILOEIRA[key] || null
}
async function ensurePessoa(nome) {
  const { data: ex } = await sb.from('erp_pessoas').select('id').eq('nome', nome).maybeSingle()
  if (ex) return ex.id
  if (DRY_RUN) return '(novo)'
  const { data, error } = await sb.from('erp_pessoas').insert({ tipo: 'pf', nome, is_fornecedor: true }).select('id').single()
  if (error) throw new Error(`pessoa ${nome}: ${error.message}`); return data.id
}

console.log(DRY_RUN ? '*** DRY RUN ***\n' : '*** GRAVANDO ***\n')

console.log('— 1) STATUS updates seguros —')
for (const u of STATUS_UPDATES) {
  let q = sb.from('erp_contas_receber').select('id,valor,status,valor_recebido')
  q = u.doc ? q.eq('numero_documento', u.doc) : q.eq('descricao', u.descr)
  const { data: ex } = await q.maybeSingle()
  if (!ex) { console.log(`  ! não achei ${u.leilao} (${u.doc || u.descr})`); continue }
  const patch = { status: u.status }
  if (u.status === 'recebido') { patch.valor_recebido = ex.valor }
  if (DRY_RUN) { console.log(`  ${u.leilao}: ${ex.status} -> ${u.status} (${brl(ex.valor)})`); continue }
  await sb.from('erp_contas_receber').update({ ...patch, updated_at: now() }).eq('id', ex.id)
  console.log(`  ${u.leilao}: -> ${u.status} (${brl(ex.valor)})`)
}

console.log('\n— 2) CREATE recebíveis faltantes —')
for (const c of CREATE_CR) {
  const { data: ex } = await sb.from('erp_contas_receber').select('id').eq('numero_documento', c.doc).maybeSingle()
  if (ex) { console.log(`  já existe ${c.leilao}`); continue }
  const cliente_id = await findLeiloeira(c.leiloeira)
  const payload = { descricao: c.descricao, cliente_id, categoria_id: CAT_RECEITA, valor: c.valor, valor_recebido: c.status === 'recebido' ? c.valor : 0, emissao: c.emissao, vencimento: addDays(c.emissao, 45), status: c.status, numero_documento: c.doc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma', observacoes: `Importado do workbook FINANCEIRO BULA 2026 (${c.leilao}).`, tags: ['leilao', '2026', 'workbook'], anexos: [] }
  if (DRY_RUN) { console.log(`  CRIA ${c.leilao}: ${brl(c.valor)} (${c.status})`); continue }
  const { error } = await sb.from('erp_contas_receber').insert(payload); if (error) throw new Error(`${c.leilao}: ${error.message}`)
  console.log(`  CRIADA ${c.leilao}: ${brl(c.valor)}`)
}

console.log('\n— 3) FOLHA junho/2026 —')
let folhaTot = 0
for (const f of FOLHA) {
  folhaTot += f.valor
  const fornId = f.fornId || await ensurePessoa(f.nome)
  const doc = `BULA-2026-CP-FOLHA-JUN-${f.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 12)}`
  const payload = { descricao: `Folha Junho/2026 - ${f.nome}`, fornecedor_id: fornId === '(novo)' ? null : fornId, categoria_id: CAT_FOLHA, valor: f.valor, emissao: '2026-06-01', vencimento: '2026-06-30', status: 'aberto', numero_documento: doc, parcela: 1, total_parcelas: 1, recorrencia: 'mensal', observacoes: `Folha fixa de ${f.funcao} (aba Folha & Comissões do workbook).`, tags: ['folha', '2026', 'junho'], anexos: [] }
  const { data: ex } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', doc).maybeSingle()
  if (DRY_RUN) { console.log(`  ${ex ? 'ATUALIZA' : 'CRIA'} Folha ${f.nome}: ${brl(f.valor)}`); continue }
  if (ex) await sb.from('erp_contas_pagar').update({ ...payload, updated_at: now() }).eq('id', ex.id)
  else { const { error } = await sb.from('erp_contas_pagar').insert(payload); if (error) throw new Error(`folha ${f.nome}: ${error.message}`) }
  console.log(`  Folha ${f.nome}: ${brl(f.valor)}`)
}
console.log(`  TOTAL folha junho: ${brl(folhaTot)}`)

console.log('\n— 4) CONFLITOS DE VALOR (planilha x ERP) — NÃO gravados, revisar manualmente —')
for (const [leilao, wb, doc, erp] of CONFLITOS) console.log(`  ${leilao.padEnd(34)} planilha ${(wb==null?'(zerou)':brl(wb)).padStart(13)} x ERP ${brl(erp).padStart(13)}  [${doc}]`)

console.log(DRY_RUN ? '\n[DRY_RUN] nada gravado.' : '\nConcluído.')
