// (2026-06-08) Finaliza o VGV da cobertura do "Destaques da Safra Nelore
// Cachoeirão" (03/06). Condição confirmada pelo chefe: 30X NO BOLETO.
//   VGV/lote = parcela × 30 × nº de touros.
// Receita/comissão seguem PENDENTES: falta o % do acordo com a leiloeira
// (e a comissão por assessor segue a regra própria — não é % do VGV).
// Idempotente: localiza por data + nome ilike.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const PARCELAS = 30

const lancesBase = [
  { lote: '28', parcela: 600, animais: 1, sexo: 'M', assessor: 'Leonardo Serafim', comprador: 'Jose Armando Machado / Guilherme Machado', fazenda: 'Fazenda Catarinense', cidade: 'Marcelandia', uf: 'MT', msg: 'Levamos lote 28 - 1M; 600 de parcela - Leonardo Serafim.' },
  { lote: '27', parcela: 570, animais: 1, sexo: 'M', assessor: 'Douglas Bispo', comprador: 'Gilberto Sarubi', fazenda: 'Fazenda Garantido', cidade: 'Oriximina', uf: 'PA', msg: 'Levamos lt 27 - 570,00 - 1M; Com Douglas Bispo.' },
  { lote: '7', parcela: 750, animais: 1, sexo: 'M', assessor: 'Douglas Bispo', comprador: 'Fazenda Bom Retiro (Nelore BF)', fazenda: 'Fazenda Bom Retiro', cidade: 'Novo Repartimento', uf: 'PA', msg: 'Levamos lt 7 - 750,00 - 1M; Com Douglas Bispo.' },
  { lote: '42', parcela: 570, animais: 3, sexo: 'M', assessor: 'Douglas Bispo', comprador: 'Gilberto Sarubi', fazenda: 'Fazenda Garantido', cidade: 'Oriximina', uf: 'PA', msg: 'Levamos 42 - 570,00 - 3M; Com Douglas Bispo.' },
  { lote: '43', parcela: 550, animais: 1, sexo: 'M', assessor: 'Fabricio Hyppolito', comprador: 'Arthur Lopes', fazenda: 'Fazenda Recanto', cidade: 'Novo Repartimento', uf: 'PA', msg: 'Lote 43 - 550,00; FOI COM Fabricio Hyppolito.' },
  { lote: '17', parcela: 620, animais: 1, sexo: 'M', assessor: 'Fabio Omena', comprador: 'Agropecuaria Dois Irmaos do Buriti', fazenda: 'Fazenda Uniao', cidade: 'Dois Irmaos do Buriti', uf: 'MS', msg: 'Lote 17 - 620 - 1M; foi com Fabio Omena Gaia.' },
  { lote: '40', parcela: 500, animais: 1, sexo: 'M', assessor: 'Fabio Omena', comprador: 'Marcel Castro Boiadeiro', fazenda: 'Fazenda Barreira', cidade: 'Heliopolis', uf: 'BA', msg: 'Levamos lt 40 - 500,00 - 1M; Foi com Fabio Omena.' },
]
const lances = lancesBase.map((l) => {
  const vgv = l.parcela * PARCELAS * l.animais
  return { ...l, empresa: 'Bula Assessoria', parcelas: PARCELAS, vgv, observacao: `${l.msg} VGV: ${brl(l.parcela)} x ${PARCELAS} x ${l.animais} = ${brl(vgv)}.` }
})

const vgv_total = lances.reduce((s, l) => s + l.vgv, 0)
const animais_vendidos = lances.reduce((s, l) => s + l.animais, 0)
const maior_lance = Math.max(...lances.map((l) => l.vgv))
const ticket_medio = Math.round(vgv_total / animais_vendidos)

const byA = new Map()
for (const l of lances) {
  const c = byA.get(l.assessor) ?? { nome: l.assessor, empresa: 'Bula Assessoria', transacoes: 0, animais: 0, vgv: 0 }
  c.transacoes++; c.animais += l.animais; c.vgv += l.vgv; byA.set(l.assessor, c)
}
const por_assessor = [...byA.values()].sort((a, b) => b.vgv - a.vgv).map((a, i) => ({
  posicao: i + 1, nome: a.nome, empresa: a.empresa, transacoes: a.transacoes, animais: a.animais, vgv: a.vgv,
  ticket_medio: Math.round(a.vgv / a.animais), pct_total: Math.round((a.vgv / vgv_total) * 10000) / 10000,
  comissao: null, observacao: 'Comissao a definir pela regra do assessor (nao e % do VGV).',
}))

const byU = new Map()
for (const l of lances) { const c = byU.get(l.uf) ?? { uf: l.uf, lotes: 0, animais: 0, vgv: 0 }; c.lotes++; c.animais += l.animais; c.vgv += l.vgv; byU.set(l.uf, c) }
const nomesUf = { PA: 'Para', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', BA: 'Bahia' }
const por_estado = [...byU.values()].sort((a, b) => b.vgv - a.vgv).map((u) => ({
  ...u, estado: nomesUf[u.uf] ?? u.uf, pct_total: Math.round((u.vgv / vgv_total) * 10000) / 10000, ticket_medio: Math.round(u.vgv / u.animais),
}))

const byC = new Map()
for (const l of lances) {
  const k = `${l.comprador}|${l.uf}`
  const c = byC.get(k) ?? { comprador: l.comprador, fazenda: l.fazenda, cidade: l.cidade, uf: l.uf, lotes: 0, animais: 0, vgv: 0 }
  c.lotes++; c.animais += l.animais; c.vgv += l.vgv; byC.set(k, c)
}
const compradores = [...byC.values()].sort((a, b) => b.vgv - a.vgv).map((c, i) => ({ rank: i + 1, ...c }))

const patch = {
  vgv_total, ticket_medio, maior_lance, animais_vendidos, lotes_vendidos: lances.length,
  compradores_unicos: compradores.length, estados_alcancados: por_estado.length,
  por_assessor, por_estado, compradores, lances,
  observacoes: [
    'Condicao de pagamento: 30X no boleto, frete gratis (catalogo-a4-destaques-da-safra-18.pdf, 50 touros PO).',
    `Cobertura Bula: ${lances.length} lotes / ${animais_vendidos} touros / VGV ${brl(vgv_total)} (parcela x 30 x touros).`,
    'PENDENTE: % do acordo com a leiloeira Nelore Cachoeirao -> para provisionar a receita Bula.',
    'PENDENTE: comissao por assessor (Douglas Bispo, Fabio Omena, Fabricio Hyppolito, Leonardo Serafim) pela regra propria do assessor.',
    'Faturamento da leiloeira: R$ 1.128.900,00 (informado pelo chefe em 08/06/2026).',
    'Leilao: Destaques da Safra Nelore Cachoeirao, 03/06/2026, presencial. Transmissao Canal do Boi - Bula Remates.',
  ].join('\n'),
  updated_at: new Date().toISOString(),
}

const { data: row } = await sb.from('bula_leilao_fechamento').select('id,nome').eq('data', '2026-06-03').ilike('nome', '%cachoeir%').maybeSingle()
if (!row) { console.error('Fechamento Cachoeirao (03/06) nao encontrado. Rode antes o script de criacao.'); process.exit(1) }
const { error } = await sb.from('bula_leilao_fechamento').update(patch).eq('id', row.id)
if (error) { console.error('UPDATE:', error.message); process.exit(1) }

console.log(`ok ${row.nome}`)
console.log(`   VGV cobertura = ${brl(vgv_total)} | ticket medio ${brl(ticket_medio)} | maior lote ${brl(maior_lance)}`)
for (const a of por_assessor) console.log(`   ${a.nome}: ${a.transacoes} lote(s) / ${a.animais} touro(s) / ${brl(a.vgv)} (${(a.pct_total * 100).toFixed(1)}%)`)
console.log('   receita/comissao: PENDENTES (falta % do acordo + comissao por assessor).')
