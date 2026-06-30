// Fechamento PARCIAL — Venda Touros RS (23/06/2026, "terça passada").
// Dados enviados pelo chefe (print WhatsApp): compradores Gustavo Macedo e Wedson
// Chimango; assessor Peralta. Leilão não estava no cronograma.
//
// PENDENTE: taxa de comissão do Peralta (em Camparino ele aparece como "Outro" 0% —
// confirmar), faturamento total do leilão e leiloeira/acordo (base do 1% da receita).
// Por isso comissão/receita/CR não são emitidas aqui.
//
// Uso: DRY_RUN=1 node scripts/add-fechamento-touros-rs-2026-06-23.mjs | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PARCELAS = 30
const DATA = '2026-06-23'
const NOME = 'Venda Touros RS - 23/06/2026'

const lots = [
  { lote: '32', parcela: 750, comprador: 'Gustavo Macedo' },
  { lote: '26', parcela: 870, comprador: 'Gustavo Macedo' },
  { lote: '50', parcela: 750, comprador: 'Gustavo Macedo' },
  { lote: '38', parcela: 720, comprador: 'Gustavo Macedo' },
  { lote: '39', parcela: 540, comprador: 'Wedson Chimango' },
  { lote: '46', parcela: 600, comprador: 'Wedson Chimango' },
  { lote: '33', parcela: 600, comprador: 'Wedson Chimango' },
  { lote: '18', parcela: 540, comprador: 'Wedson Chimango' },
  { lote: '15', parcela: 480, comprador: 'Wedson Chimango' },
].map((l) => ({ ...l, vgv: l.parcela * PARCELAS }))
const vgv_total = lots.reduce((s, l) => s + l.vgv, 0)

const byC = new Map()
for (const l of lots) { const c = byC.get(l.comprador) || { comprador: l.comprador, lotes: 0, animais: 0, vgv: 0 }; c.lotes++; c.animais++; c.vgv += l.vgv; byC.set(l.comprador, c) }
const compradores = [...byC.values()].sort((a, b) => b.vgv - a.vgv).map((c, i) => ({ rank: i + 1, ...c }))

const por_assessor = [{ posicao: 1, nome: 'Peralta', empresa: 'Outro', transacoes: lots.length, animais: lots.length, vgv: vgv_total, comissao_pct: null, comissao: null }]

const observacoes = [
  'FECHAMENTO PARCIAL (dados do chefe via WhatsApp, 30/06). Leilão "Touros RS" não estava no cronograma; data = terça passada (23/06/2026).',
  `Cobertura Bula: ${lots.length} touros / ${brl(vgv_total)} (parcela × ${PARCELAS}).`,
  `Compradores: Gustavo Macedo (${compradores.find(c=>c.comprador==='Gustavo Macedo').lotes} lotes / ${brl(byC.get('Gustavo Macedo').vgv)}), Wedson Chimango (${byC.get('Wedson Chimango').lotes} lotes / ${brl(byC.get('Wedson Chimango').vgv)}).`,
  'Assessor: Peralta (informado pelo chefe). PENDENTE: taxa de comissão do Peralta (em Camparino consta como "Outro" 0% — confirmar) → CP de comissão não emitida.',
  'PENDENTE: faturamento total do leilão + leiloeira/acordo (base do 1% da receita Bula) → conta a receber não emitida.',
].join('\n')

const payload = {
  nome: NOME, data: DATA, local: 'RS',
  lotes_ofertados: lots.length, lotes_vendidos: lots.length, animais_vendidos: lots.length,
  vgv_total, ticket_medio: Math.round(vgv_total / lots.length), maior_lance: Math.max(...lots.map((l) => l.vgv)),
  compradores_unicos: compradores.length, estados_alcancados: 1,
  por_assessor, por_estado: [], compradores,
  lances: lots.map((l) => ({ lote: l.lote, animais: 1, vgv: l.vgv, parcela: l.parcela, parcelas: PARCELAS, assessor: 'Peralta', empresa: 'Outro', comprador: l.comprador })),
  perfil_genetico: [],
  faturamento_total_leilao: null, acordo_pct_faturamento: null, acordo_pct_venda_cobertura: null,
  acordo_descricao: 'PENDENTE — aguardando faturamento/leiloeira.',
  receita_bula: null, comissao_assessoria: null, sobra_bruta: null, observacoes,
}

console.log(`${NOME}\n  VGV: ${brl(vgv_total)} | Compradores: ${compradores.map(c=>c.comprador+' '+brl(c.vgv)).join(' | ')}`)
console.log('  Comissão (Peralta) e receita: PENDENTES')
if (DRY_RUN) { console.log('\n[DRY_RUN]'); process.exit(0) }
const { data: ex } = await sb.from('bula_leilao_fechamento').select('id').eq('data', DATA).ilike('nome', '%Touros RS%').maybeSingle()
if (ex) { await sb.from('bula_leilao_fechamento').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', ex.id); console.log('-> fechamento ATUALIZADO', ex.id) }
else { const { data, error } = await sb.from('bula_leilao_fechamento').insert(payload).select('id').single(); if (error) throw new Error(error.message); console.log('-> fechamento CRIADO', data.id) }
console.log('Concluído.')
