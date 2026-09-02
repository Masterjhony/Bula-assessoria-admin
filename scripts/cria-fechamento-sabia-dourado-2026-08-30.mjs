/**
 * Cria no ERP o fechamento do LEILÃO SABIÁ DOURADO (30/08/2026, Bula Remates).
 *
 * Por que existe: o leilão está na agenda como concluído, a planilha FINANCEIRO
 * BULA 2026 (Drive, 02/09) traz "vendas Bula 629.700 / faturamento 1.171.200 /
 * 1%", e o Douglas mandou no Grupo Financeiro (31/08 13:46) a planilha dele com
 * os 29 lotes — mas o leilão NÃO existe no HastaPro (nem FIL 2 nem FIL 01) e
 * não existia no ERP. Era o maior valor de agosto fora de qualquer sistema.
 *
 * Fonte lote a lote: print "SABIA DOURADO" do Douglas (whatsapp-media
 * baileys/joao-automation/120363408594638064_g.us/3AAC3B34A41362489C87.jpg).
 * Os valores são o TOTAL do lote (a condição de pagamento varia por lote:
 * 1+29, 2+12+24, 12 meses, 20% à vista), por isso parcela/parcelas ficam nulos.
 *
 * Entra com origem 'lances-auto' de propósito: quando o João lançar o leilão
 * no HastaPro, o importador canônico substitui este registro sozinho.
 *
 * Atribuição: todos os lotes no DOUGLAS (é a planilha dele, "Vendas Douglas no
 * leilão Sabia Dourado"). Celso Lopes (lts 23/28/49/52) e Pedro Pontes (lt 7)
 * estão na lista de compradores direcionados pelo Rusa, mas a planilha
 * RUSA - AGOSTO do próprio Douglas (31/08 16:08) não os inclui — fica em
 * observação, não se move sozinho.
 *
 *   node scripts/cria-fechamento-sabia-dourado-2026-08-30.mjs          (dry-run)
 *   node scripts/cria-fechamento-sabia-dourado-2026-08-30.mjs --apply
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })
const APPLY = process.argv.includes('--apply')
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

/** [lote, cliente, contato, valor total, condição, cidade] — colado do print, na ordem. */
export const LOTES_SABIA = [
    ['5', 'THIAGO GOMES', '(62) 98333-6999', 30000, null, 'PACAJÁ'],
    ['7', 'PEDRO PONTES', '(94) 99249-7368', 37500, '2+12+24', 'TUCUMÃ'],
    ['8', 'GESSIVAL BUSS', '(94) 99181-3828', 22500, null, 'MARACAJÁ'],
    ['16', 'RAMON NOBRE', null, 22500, null, 'PACAJÁ'],
    ['17', 'EDUARDO (GABRIEL)', '(93) 99224-4200', 21000, null, 'MARACAJÁ'],
    ['19', 'BRANCO RICO', '(94) 99272-6983', 18000, null, 'MARACAJÁ'],
    ['20', 'BRUNO MACHADO', '(63) 99964-3834', 25500, '1+29', 'NOVO REPARTIMENTO'],
    ['21', 'DEREK', '(99) 98465-4545', 19500, '1+29', 'IMPERATRIZ'],
    ['22', 'TOTA', '(94) 99248-6398', 22500, null, 'PACAJÁ'],
    ['23', 'CELSO LOPES', '(94) 99159-9449', 15000, '20% A VISTA', 'TUCUMÃ'],
    ['24', 'SEBASTIÃO PEREIRA', '(94) 99139-8031', 21000, null, 'PACAJÁ'],
    ['25', 'GESSIVALDO LOBO', '(99) 99141-1746', 13500, '1+29', 'BARRA DO CORDA'],
    ['26', 'SEBASTIÃO PEREIRA', '(94) 99139-8031', 24000, null, 'PACAJÁ'],
    ['27', 'GESSIVALDO LOBO', '(99) 99141-1746', 23100, '1+29', 'BARRA DO CORDA'],
    ['28', 'CELSO LOPES', '(94) 99159-9449', 20100, '20% A VISTA', 'TUCUMÃ'],
    ['30', 'SEBASTIÃO PEREIRA', '(94) 99139-8031', 18600, null, 'PACAJÁ'],
    ['32', 'GESSIVALDO LOBO', '(99) 99141-1746', 16500, '1+29', 'BARRA DO CORDA'],
    ['34', 'GESSIVALDO LOBO', '(99) 99141-1746', 16500, '1+29', 'BARRA DO CORDA'],
    ['36', 'TOTA', '(94) 99248-6398', 31500, null, 'PACAJÁ'],
    ['41', 'KLEY CARNEIRO (GABRIEL)', '(93) 99224-4200', 22500, null, 'PACAJÁ'],
    ['43', 'LEANDRO (GIRUCA)', '(94) 99102-7691', 21600, null, 'PACAJÁ'],
    ['44', 'RICARDO (GIRUCA)', '(94) 99102-7691', 24600, null, 'PACAJÁ'],
    ['47', 'KLEY CARNEIRO (GABRIEL)', '(93) 99224-4200', 21600, null, 'PACAJÁ'],
    ['49', 'CELSO LOPES', '(94) 99159-9449', 20100, '2+12+24', 'TUCUMÃ'],
    ['50', 'BYANCA BISPO', '(99) 98490-1010', 21000, '12 MESES', 'MARACAJÁ'],
    ['51', 'BYANCA BISPO', '(99) 98490-1010', 22500, '12 MESES', 'MARACAJÁ'],
    ['52', 'CELSO LOPES', '(94) 99159-9449', 18000, '2+12+24', 'TUCUMÃ'],
    ['54', 'GESSIVAL BUSS', '(94) 99181-3828', 21000, null, 'MARACAJÁ'],
    ['55', 'ROBERTO FERREIRA', '(94) 99130-7031', 18000, '1+29', 'REDENÇÃO'],
]
export const TOTAL_PRINT = 629700
/** UF pela cidade; "Maracajá" não decide sozinha, vai pelo DDD do contato. */
const UF_CIDADE = { 'PACAJÁ': 'PA', 'TUCUMÃ': 'PA', 'NOVO REPARTIMENTO': 'PA', 'IMPERATRIZ': 'MA', 'BARRA DO CORDA': 'MA', 'REDENÇÃO': 'PA' }
const ufDe = (cidade, contato) => UF_CIDADE[cidade] || ({ '93': 'PA', '94': 'PA', '99': 'MA', '63': 'TO', '62': 'GO' })[(contato || '').slice(1, 3)] || null

/* O script também é importado (LOTES_SABIA) pelo fechamento-agosto-2026-final.mjs — só executa quando chamado direto. */
const ehPrincipal = !!process.argv[1] && import.meta.url.replace(/\\/g, '/').endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (ehPrincipal) {
const soma = LOTES_SABIA.reduce((s, l) => s + l[3], 0)
if (soma !== TOTAL_PRINT) { console.error(`ABORTA: soma dos lotes ${soma} != total do print ${TOTAL_PRINT}`); process.exit(1) }

const lances = LOTES_SABIA.map(([lote, cliente, contato, vgv, condicao, cidade]) => ({
    lote, parcela: null, parcelas: null, vgv, animais: 1,
    assessor: 'DOUGLAS BISPO', empresa: 'Bula Assessoria',
    comprador: `${cliente} · ${cidade}/${ufDe(cidade, contato) || '?'}`,
    condicao_pagamento: condicao, contato,
}))
const vgv = r2(lances.reduce((s, l) => s + l.vgv, 0))
const porComprador = Object.values(LOTES_SABIA.reduce((acc, [lote, cliente, contato, v, , cidade]) => {
    const k = cliente; acc[k] ??= { comprador: cliente, fazenda: null, cidade, uf: ufDe(cidade, contato), vgv: 0, lotes: 0, animais: 0 }
    acc[k].vgv += v; acc[k].lotes++; acc[k].animais++; return acc
}, {})).sort((a, b) => b.vgv - a.vgv).map((c, i) => ({ ...c, rank: i + 1 }))
const porEstado = Object.values(LOTES_SABIA.reduce((acc, [, , contato, v, , cidade]) => {
    const uf = ufDe(cidade, contato) || '?'; acc[uf] ??= { uf, estado: uf, vgv: 0, lotes: 0, animais: 0 }
    acc[uf].vgv += v; acc[uf].lotes++; acc[uf].animais++; return acc
}, {})).map(e => ({ ...e, pct_total: Number((e.vgv / vgv).toFixed(6)), ticket_medio: r2(e.vgv / e.lotes) }))

const registro = {
    nome: 'LEILÃO SABIÁ DOURADO', data: '2026-08-30', local: null,
    vgv_total: vgv, lotes_vendidos: lances.length, animais_vendidos: lances.length,
    ticket_medio: r2(vgv / lances.length), maior_lance: r2(Math.max(...lances.map(l => l.vgv))),
    compradores_unicos: porComprador.length, estados_alcancados: porEstado.length,
    lances, por_assessor: [{
        nome: 'DOUGLAS BISPO', vgv, animais: lances.length, empresa: 'Bula Assessoria', posicao: 1,
        transacoes: lances.length, comissao: r2(vgv * 0.02), comissao_pct: 0.02,
        ticket_medio: r2(vgv / lances.length), pct_total: 1,
    }],
    compradores: porComprador, por_estado: porEstado,
    comissao_assessoria: r2(vgv * 0.02), receita_bula: 0, origem: 'lances-auto',
    observacoes: 'Criado em 02/09/2026 (fechamento de agosto) a partir do print "SABIA DOURADO" que o Douglas mandou no Grupo Financeiro em 31/08 13:46 ' +
        '("Vendas Douglas no leilão Sabia Dourado"): 29 lotes, R$ 629.700,00. Confirmado pela planilha FINANCEIRO BULA 2026 (30/AGOSTO: vendas 629.700, faturamento 1.171.200, 1%). ' +
        'Leilão da BULA REMATES (agenda) que NAO existe no HastaPro em nenhuma filial — origem lances-auto de proposito, para o importador substituir quando o leilao for lancado la. ' +
        'Os valores sao o TOTAL de cada lote (condicoes de pagamento variam: 1+29, 2+12+24, 12 meses, 20% a vista), por isso parcela/parcelas ficam vazios. ' +
        'ATENCAO atribuicao: Celso Lopes (lts 23, 28, 49, 52 = 73.200) e Pedro Pontes (lt 7 = 37.500) sao compradores da lista de direcionamento do Rusa, mas a planilha RUSA - AGOSTO do Douglas (31/08 16:08) nao os lista — mantidos no Douglas ate confirmacao. ' +
        'Byanca Bispo (lts 50 e 51) usa o telefone do proprio Douglas. Receita: a planilha diz 1% do faturamento (11.712); a agenda diz "0,5% a 2% do faturamento" (tabela de performance da Remates; 53,8% de cobertura = 2% = 23.424) — acordo a confirmar com o Bulinha.',
}

console.log(`${registro.data} ${registro.nome} — ${registro.lotes_vendidos} lotes / R$ ${brl(registro.vgv_total)} / comissao ${brl(registro.comissao_assessoria)}`)
console.log('compradores:', porComprador.map(c => `${c.comprador} ${brl(c.vgv)} (${c.lotes})`).join(' · '))
console.log('estados:', porEstado.map(e => `${e.uf} ${brl(e.vgv)}`).join(' · '))

const { data: ja } = await sb.from('bula_leilao_fechamento').select('id,nome,vgv_total,origem').eq('data', '2026-08-30').ilike('nome', '%SABI%')
if ((ja ?? []).length) { console.error('ABORTA: ja existe', ja); process.exit(1) }
if (!APPLY) { console.log('\n(dry-run) use --apply para gravar'); process.exit(0) }

const { data: criado, error } = await sb.from('bula_leilao_fechamento').insert(registro).select('id').single()
if (error) { console.error('ERRO:', error.message); process.exit(1) }
console.log('\ncriado:', criado.id)
}
