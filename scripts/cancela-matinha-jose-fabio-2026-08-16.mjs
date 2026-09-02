/**
 * Lança no ERP o CANCELAMENTO dos 3 lotes do José Fábio no LEILÃO MATINHA
 * EXPOGENÉTICA 2026 (16/08) — lotes 12, 15 e 34, R$ 291.000.
 *
 * Por que: o comprador tinha crédito na Matinha e o valor foi abatido lá.
 *   Marcelo, 31/08 15:45: "As vendas da matinha na expogenética do José Fabio
 *     ele tem credito lá · Não vamos receber nada · Nem Rusa".
 *   João, 31/08 15:55: "Como não vai contar pra nós pra fim de vgv nem vai
 *     gerar comissão creio que podemos excluir".
 *   Douglas, 02/09 12:52: "Foram 3 lt na matinha do José Fábio · Nas minhas
 *     vendas somente esse cancelamento".
 * O próprio Douglas já tinha tirado os 3 lotes da planilha RUSA - AGOSTO que
 * mandou às 16:08 de 31/08 (a versão das 15:53 ainda os tinha).
 *
 * O que muda: VGV do fechamento 460.500 → 169.500 e comissão 19.200 → 4.650.
 * Ficam Nane 85.500, Douglas 42.000 e Rusa 42.000 (o lote 39 é do Celso Lopes
 * e NÃO foi cancelado). A comissão do Rusa cai de 16.650 para 2.100.
 *
 * ⚠ TÍTULOS: as duas CP abertas do fechamento (Nane 1.710 e Douglas 840) são
 * dos lotes que SOBRAM — nada a cancelar. Os 16.650 do Rusa nunca viraram
 * título. Mas há uma CR aberta de R$ 27.375 ("COMISSAO BULA") calculada sobre
 * o VGV antigo: ela precisa ser revista à parte, porque a receita da Matinha
 * cai junto com a venda. Este script não toca em título nenhum.
 *
 * Os lotes NÃO são apagados: ficam no fechamento com cancelado=true e o motivo,
 * para o relatório continuar mostrando "vendeu e cancelou". O importador do
 * HastaPro não mexe neste fechamento (origem 'hastapro' só é reescrita com
 * --refazer), mas se alguém refizer, o cancelamento volta a zero — por isso o
 * motivo também vai para observacoes.
 *
 *   node scripts/cancela-matinha-jose-fabio-2026-08-16.mjs          (simulação)
 *   node scripts/cancela-matinha-jose-fabio-2026-08-16.mjs --apply
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

const LOTES_CANCELADOS = ['12', '15', '34']
const MOTIVO = 'Cancelado: comprador JOSÉ FABIO (Nelore Pérola) tinha crédito na Matinha e o valor foi abatido lá. Marcelo 31/08: "não vamos receber nada, nem Rusa"; Douglas 02/09: "Foram 3 lt na matinha do José Fábio · nas minhas vendas somente esse cancelamento".'

const { data: f, error } = await sb.from('bula_leilao_fechamento').select('*')
    .eq('data', '2026-08-16').ilike('nome', '%MATINHA%').single()
if (error) { console.error('ERRO ao ler o fechamento:', error.message); process.exit(1) }

const [{ data: cp }, { data: cr }] = await Promise.all([
    sb.from('erp_contas_pagar').select('id,descricao,valor,status').eq('fechamento_id', f.id),
    sb.from('erp_contas_receber').select('id,descricao,valor,status').eq('fechamento_id', f.id),
])
if ((cp ?? []).length || (cr ?? []).length) {
    console.log(`ATENCAO: ha ${(cp ?? []).length} CP e ${(cr ?? []).length} CR ligados a este fechamento:`)
    for (const t of [...(cp ?? []), ...(cr ?? [])]) console.log(`   ${brl(t.valor)} ${t.status} ${t.descricao}`)
    console.log('   Este script NAO mexe em titulo. Resolver o titulo a parte antes de pagar.')
}

const cancelados = f.lances.filter(l => LOTES_CANCELADOS.includes(String(l.lote)))
if (cancelados.length !== 3) { console.error(`ABORTA: esperava 3 lotes (${LOTES_CANCELADOS.join(', ')}), achei ${cancelados.length}`); process.exit(1) }
const vgvCancelado = r2(cancelados.reduce((s, l) => s + Number(l.vgv || 0), 0))
if (vgvCancelado !== 291000) { console.error(`ABORTA: os 3 lotes somam ${brl(vgvCancelado)}, esperado 291.000,00`); process.exit(1) }

const lances = f.lances.map(l => LOTES_CANCELADOS.includes(String(l.lote))
    ? { ...l, cancelado: true, cancelado_em: '2026-09-02', cancelado_motivo: MOTIVO } : l)
const validos = lances.filter(l => !l.cancelado)
const vgv = r2(validos.reduce((s, l) => s + Number(l.vgv || 0), 0))

/* por_assessor recalculado só com o que ficou; o percentual vem do próprio fechamento. */
const porAssessor = [...new Set(validos.map(l => l.assessor))].map(nome => {
    const meus = validos.filter(l => l.assessor === nome)
    const v = r2(meus.reduce((s, l) => s + Number(l.vgv || 0), 0))
    const pct = f.por_assessor.find(a => a.nome === nome)?.comissao_pct ?? 0.02
    return {
        nome, vgv: v, animais: meus.reduce((s, l) => s + (l.animais || 1), 0),
        empresa: 'Bula Assessoria', transacoes: meus.length,
        comissao: r2(v * pct), comissao_pct: pct,
        ticket_medio: r2(v / meus.length), pct_total: Number((v / vgv).toFixed(6)),
    }
}).sort((a, b) => b.vgv - a.vgv).map((a, i) => ({ ...a, posicao: i + 1 }))
const comissao = r2(porAssessor.reduce((s, a) => s + a.comissao, 0))

const patch = {
    lances, por_assessor: porAssessor, vgv_total: vgv, lotes_vendidos: validos.length,
    animais_vendidos: validos.reduce((s, l) => s + (l.animais || 1), 0),
    ticket_medio: validos.length ? r2(vgv / validos.length) : 0,
    maior_lance: validos.length ? r2(Math.max(...validos.map(l => Number(l.vgv || 0)))) : 0,
    comissao_assessoria: comissao,
    observacoes: String(f.observacoes || '').trim() + `\n[02/09/2026] CANCELAMENTO dos lotes ${LOTES_CANCELADOS.join(', ')} (R$ ${brl(vgvCancelado)}). ${MOTIVO} VGV ${brl(f.vgv_total)} → ${brl(vgv)}; comissao ${brl(f.comissao_assessoria)} → ${brl(comissao)}. Os lances continuam gravados com cancelado=true para o relatorio mostrar vendido x cancelado.`,
}

console.log(`${f.data} ${f.nome}`)
console.log(`  VGV      ${brl(f.vgv_total)} → ${brl(vgv)}   (cancelado ${brl(vgvCancelado)})`)
console.log(`  lotes    ${f.lotes_vendidos} → ${validos.length}`)
console.log(`  comissao ${brl(f.comissao_assessoria)} → ${brl(comissao)}`)
console.log('  por assessor depois:', porAssessor.map(a => `${a.nome} ${brl(a.vgv)} (com. ${brl(a.comissao)})`).join(' · '))
console.log('  cancelados:', cancelados.map(l => `lt ${l.lote} ${brl(l.vgv)} ${l.comprador || ''}`).join(' · '))

if (!APPLY) { console.log('\n(simulação) use --apply para gravar'); process.exit(0) }
fs.writeFileSync(`outputs/fechamento-agosto-2026/backup-matinha-${f.id}.json`, JSON.stringify(f, null, 1))
const { error: up } = await sb.from('bula_leilao_fechamento').update(patch).eq('id', f.id)
if (up) { console.error('ERRO:', up.message); process.exit(1) }
console.log('\naplicado:', f.id, '· backup em outputs/fechamento-agosto-2026/backup-matinha-' + f.id + '.json')
