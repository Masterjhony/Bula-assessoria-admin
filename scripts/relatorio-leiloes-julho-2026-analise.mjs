// Analisa outputs/relatorio-julho-2026-raw.json e imprime as métricas de julho/2026.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { leiloes, fechamentos, vendas, cronograma } = JSON.parse(readFileSync(join(root, 'outputs', 'relatorio-julho-2026-raw.json'), 'utf-8'))

const isJul = (d) => typeof d === 'string' && d.startsWith('2026-07')

const cronJul = cronograma.filter((c) => isJul(c.data)).sort((a, b) => a.data.localeCompare(b.data))
const leiloesJul = leiloes.filter((l) => isJul(l.data)).sort((a, b) => a.data.localeCompare(b.data))
const fechJul = fechamentos.filter((f) => isJul(f.data)).sort((a, b) => a.data.localeCompare(b.data))
const vendasJul = vendas.filter((v) => isJul(v.leilao_data))

console.log('=== CRONOGRAMA JULHO:', cronJul.length)
for (const c of cronJul) console.log(' ', c.data, '|', c.nome, '| criador:', c.criador, '| leiloeira:', c.leiloeira, '| fat.realizado:', c.faturamento_realizado)

console.log('\n=== BULA_LEILOES JULHO:', leiloesJul.length)
for (const l of leiloesJul) console.log(' ', l.data, '|', l.nome, '| status:', l.status, '| realizado_bula:', l.realizado_bula, '| cronograma_id:', l.cronograma_id)

console.log('\n=== FECHAMENTOS JULHO:', fechJul.length)
for (const f of fechJul) {
  console.log(' ', f.data, '|', f.nome, '| ofert:', f.lotes_ofertados, '| vend:', f.lotes_vendidos, '| animais:', f.animais_vendidos,
    '| vgv:', f.vgv_total, '| ticket:', f.ticket_medio, '| maior_lance:', f.maior_lance, '| compradores:', f.compradores_unicos,
    '| lances[]:', Array.isArray(f.lances) ? f.lances.length : typeof f.lances, '| origem:', f.origem, '| etapa:', f.etapa)
}

console.log('\n=== VENDAS (parser) JULHO:', vendasJul.length, 'status:', [...new Set(vendasJul.map(v => v.status))])

// maior lance individual a partir dos lances dos fechamentos
let top = []
for (const f of fechJul) {
  for (const x of f.lances || []) {
    top.push({ leilao: f.nome, data: f.data, lote: x.lote, sexo: x.sexo, categoria: x.categoria, animais: x.animais, vgv: Number(x.vgv || 0), parcela: x.parcela, comprador: x.comprador, uf: x.uf })
  }
}
top.sort((a, b) => b.vgv - a.vgv)
console.log('\n=== TOP 5 LANCES (por VGV do lote):')
for (const t of top.slice(0, 5)) console.log(' ', t.vgv, '|', t.leilao, '| lote', t.lote, '| sexo:', t.sexo, '| animais:', t.animais, '| comprador:', t.comprador, t.uf)
console.log('\nCampos de um lance exemplo:', top.length ? Object.keys(fechJul.find(f => (f.lances||[]).length)?.lances[0] || {}) : '-')
console.log('\nmaior_lance declarado por fechamento (max):', Math.max(...fechJul.map(f => Number(f.maior_lance || 0))))
