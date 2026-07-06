// Atualiza o fechamento "Leilão Nelore Magda Na Origem - 28/06/2026" adicionando
// a cobertura do Léo Serafim (Leonardo Serafim, 2%), a partir do print do WhatsApp:
//   - Lote 15  1M  parcela 1.050,00 (×30 = 31.500)  Edmilson Belarmino / Colíder-MT
//   - Lote 12  1M  parcela 1.050,00 (×30 = 31.500)  Nelson Klugsberg / Novo Progresso-PA
// Mantém o lote 25 (Klaus, 48.000, Fábio Omena 3%) que já existia.
// NÃO cria/atualiza a comissão no ERP (passo separado). Idempotente (update por id, lances por lote).
// Uso: DRY_RUN=1 node scripts/add-fechamento-magda-leo-2026-07-06.mjs  |  sem DRY_RUN grava.
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
const r2 = (n) => Math.round(Number(n) * 100) / 100
const PARCELAS = 30

// Novos lances do Léo (parcela 1.050 × 30)
const NOVOS = [
  { lote: '15', comprador: 'Edmilson Belarmino', cidade: 'Colíder', uf: 'MT', parcela: 1050 },
  { lote: '12', comprador: 'Nelson Klugsberg', cidade: 'Novo Progresso', uf: 'PA', parcela: 1050 },
].map((l) => ({
  lote: l.lote, fazenda: '', comprador: l.comprador, cidade: l.cidade, uf: l.uf, sexo: 'M',
  animais: 1, parcela: l.parcela, parcelas: PARCELAS, vgv: r2(l.parcela * PARCELAS),
  assessor: 'Leonardo Serafim', empresa: 'Bula Assessoria',
}))

const { data: fech, error: e1 } = await sb.from('bula_leilao_fechamento').select('*').ilike('nome', '%MAGDA%').maybeSingle()
if (e1) throw new Error(e1.message)
if (!fech) throw new Error('Fechamento Magda não encontrado')

// Remove qualquer lance dos lotes 12/15 (idempotência) e mantém os demais existentes
const novosLotes = new Set(NOVOS.map((l) => l.lote))
const lancesBase = (fech.lances || []).filter((l) => !novosLotes.has(String(l.lote)))
const lances = [...lancesBase, ...NOVOS]

const vgv_total = r2(lances.reduce((s, l) => s + Number(l.vgv || 0), 0))
const animais_vendidos = lances.reduce((s, l) => s + Number(l.animais || 0), 0)
const lotes_vendidos = lances.length

// por_assessor: preserva Fábio, recria/atualiza Leonardo (2%)
const leoVgv = r2(NOVOS.reduce((s, l) => s + l.vgv, 0))
const leoComissao = r2(leoVgv * 0.02)
const outros = (fech.por_assessor || []).filter((a) => !/leonardo|serafim|l[eé]o/i.test(a.nome || ''))
const por_assessor = [
  ...outros,
  { posicao: (outros.length || 0) + 1, nome: 'Leonardo Serafim', empresa: 'Bula Assessoria',
    transacoes: NOVOS.length, animais: NOVOS.length, vgv: leoVgv,
    ticket_medio: r2(leoVgv / NOVOS.length), pct_total: r2((leoVgv / vgv_total) * 100),
    comissao_pct: 0.02, comissao: leoComissao },
].map((a) => ({ ...a, pct_total: r2((Number(a.vgv || 0) / vgv_total) * 100) }))
  .sort((a, b) => b.vgv - a.vgv).map((a, i) => ({ ...a, posicao: i + 1 }))

const comissao_assessoria = r2(por_assessor.reduce((s, a) => s + Number(a.comissao || 0), 0))

// por_estado (só os lances com UF conhecida)
const estMap = new Map()
const NOME_UF = { MT: 'Mato Grosso', PA: 'Pará', GO: 'Goiás', SP: 'São Paulo', MS: 'Mato Grosso do Sul' }
for (const l of lances) {
  if (!l.uf) continue
  const e = estMap.get(l.uf) || { uf: l.uf, estado: NOME_UF[l.uf] || l.uf, lotes: 0, animais: 0, vgv: 0 }
  e.lotes += 1; e.animais += Number(l.animais || 0); e.vgv = r2(e.vgv + Number(l.vgv || 0)); estMap.set(l.uf, e)
}
const por_estado = [...estMap.values()].sort((a, b) => b.vgv - a.vgv)
  .map((e) => ({ ...e, pct_total: r2((e.vgv / vgv_total) * 100) }))

// compradores (ranking por vgv)
const compMap = new Map()
for (const l of lances) {
  const k = l.comprador || '—'
  const c = compMap.get(k) || { fazenda: l.fazenda || '', comprador: k, cidade: l.cidade || '', uf: l.uf || '', lotes: 0, animais: 0, vgv: 0 }
  c.lotes += 1; c.animais += Number(l.animais || 0); c.vgv = r2(c.vgv + Number(l.vgv || 0)); compMap.set(k, c)
}
const compradores = [...compMap.values()].sort((a, b) => b.vgv - a.vgv).map((c, i) => ({ rank: i + 1, ...c }))

const observacoes = [
  'FECHAMENTO PARCIAL (montado na conferência 30/06; atualizado 06/07 com a cobertura do Léo Serafim).',
  `Cobertura Bula (parcial): ${lotes_vendidos} lotes / ${brl(vgv_total)}.`,
  ` - Fábio Omena (3%): lote 25 (Klaus) 48.000,00 → comissão 1.440,00.`,
  ` - Leonardo Serafim (2%): lotes 15 (Edmilson Belarmino/Colíder-MT) e 12 (Nelson Klugsberg/Novo Progresso-PA), parcela 1.050 × 30 = 31.500,00 cada → comissão ${brl(leoComissao)}.`,
  `Comissão total = ${brl(comissao_assessoria)}.`,
  'PENDENTE: faturamento total do leilão (base do 1% da receita Bula), acordo da leiloeira e demais coberturas. Conta a receber NÃO emitida até o faturamento ser confirmado.',
].join('\n')

const payload = {
  lances, por_assessor, por_estado, compradores,
  lotes_ofertados: Math.max(fech.lotes_ofertados || 0, lotes_vendidos),
  lotes_vendidos, animais_vendidos, vgv_total,
  ticket_medio: Math.round(vgv_total / lotes_vendidos),
  maior_lance: Math.max(...lances.map((l) => Number(l.vgv || 0))),
  compradores_unicos: compMap.size, estados_alcancados: estMap.size,
  comissao_assessoria, observacoes,
}

console.log('\nLeilão Nelore Magda Na Origem — atualização')
console.log(`  Lotes: ${(fech.lances || []).length} -> ${lotes_vendidos} | VGV: ${brl(fech.vgv_total)} -> ${brl(vgv_total)}`)
console.log(`  Comissão total: ${brl(fech.comissao_assessoria)} -> ${brl(comissao_assessoria)} (Léo 2% = ${brl(leoComissao)})`)
console.log('  por_assessor:', por_assessor.map((a) => `${a.nome} ${brl(a.vgv)} (${(a.comissao_pct * 100)}%→${brl(a.comissao)})`).join(' | '))
if (DRY_RUN) { console.log('\n[DRY_RUN] nada gravado.'); process.exit(0) }

const { error: e2 } = await sb.from('bula_leilao_fechamento').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', fech.id)
if (e2) throw new Error(e2.message)
console.log('  -> fechamento ATUALIZADO', fech.id)

// mantém realizado_bula (VGV de cobertura) em sincronia no leilão público
const { error: e3 } = await sb.from('bula_leiloes').update({ realizado_bula: vgv_total }).eq('data', fech.data).ilike('nome', '%Magda%')
if (e3) console.log('  (aviso) não atualizou bula_leiloes.realizado_bula:', e3.message)
else console.log('  -> bula_leiloes.realizado_bula =', brl(vgv_total))
console.log('\nConcluído. (Comissão do Léo no ERP é passo separado — não lançada aqui.)')
