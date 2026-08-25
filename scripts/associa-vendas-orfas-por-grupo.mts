/**
 * Liga as vendas órfãs do grupo de lances ao leilão certo, usando o NOME DO
 * GRUPO como desambiguador.
 *
 * O problema: o parser captura o arremate do grupo e grava em
 * `bula_leilao_vendas`, mas só vira fechamento depois de ligado a um
 * `cronograma_id`. Quando dois pregões caem no mesmo dia, o sistema não sabe de
 * qual leilão é a venda e a linha fica órfã — capturada, correta e invisível
 * para o ERP inteiro (sem VGV, sem comissão, sem cobrança).
 *
 * A chave estava à vista: a leiloeira cria um grupo POR LEILÃO ("Lances Mafra",
 * "LANCES GUADALUPE", "Lances Genética Aditiva"). O nome do grupo diz de quem é
 * a venda. Os nomes vêm da VPS (sessão `joao-automation`), não de chute.
 *
 * O grupo genérico "Lances Bula Assessoria" cobre vários leilões e NÃO
 * desambigua nada — vendas vindas dele continuam órfãs de propósito. Chutar ali
 * produziria comissão paga ao leilão errado, que é pior do que não lançar.
 *
 *   npx tsx scripts/associa-vendas-orfas-por-grupo.mts           (dry-run)
 *   npx tsx scripts/associa-vendas-orfas-por-grupo.mts --apply
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const l of fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
    if (!l || l.startsWith('#') || !l.includes('=')) continue
    const i = l.indexOf('=')
    process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, '')
}

const { rebuildFechamentoFromLances } = await import('../src/lib/lances-fechamento')

const APPLY = process.argv.includes('--apply')
const SESSAO = 'joao-automation'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Palavras que não identificam leilão nenhum. */
const VAZIAS = new Set([
    'lances', 'lance', 'leilao', 'leiloes', 'virtual', 'edicao', 'etapa', 'mega', 'evento',
    'bula', 'assessoria', 'de', 'do', 'da', 'e', 'o', 'a', 'nelore', 'femeas', 'touros',
    'matrizes', 'especial', 'premium', 'genetica', 'reservada',
])
const toks = (s: string) => new Set(norm(s).split(' ').filter(w => w.length >= 3 && !VAZIAS.has(w)))

// ── nomes dos grupos, direto da VPS ─────────────────────────────────────────
const VPS = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'
const res = await fetch(`${VPS}/groups?session=${SESSAO}`, {
    headers: process.env.WHATSAPP_SERVER_TOKEN ? { 'x-vps-token': process.env.WHATSAPP_SERVER_TOKEN } : {},
})
if (!res.ok) { console.error('VPS /groups falhou:', res.status, await res.text()); process.exit(1) }
const grupos = ((await res.json()) as { groups?: { id: string; subject: string }[] }).groups ?? []
const nomeGrupo = new Map(grupos.map(g => [g.id, g.subject]))
console.log(`grupos lidos da sessao ${SESSAO}: ${grupos.length}`)

// ── vendas órfãs ────────────────────────────────────────────────────────────
const { data: orfas } = await sb.from('bula_leilao_vendas')
    .select('id, leilao_data, lote, valor, sexo, comprador, group_jid, msg_ts')
    .is('cronograma_id', null).not('leilao_data', 'is', null).order('leilao_data')
if (!orfas?.length) { console.log('nenhuma venda orfa.'); process.exit(0) }

const datas = [...new Set(orfas.map(v => String(v.leilao_data).slice(0, 10)))]
const { data: crons } = await sb.from('cronograma_leiloes').select('id, nome, data').in('data', datas)

type Plano = { venda: typeof orfas[number]; cron: { id: string; nome: string } | null; motivo: string }
const planos: Plano[] = []

for (const v of orfas) {
    const d = String(v.leilao_data).slice(0, 10)
    const doDia = (crons ?? []).filter(c => String(c.data).slice(0, 10) === d)
    const grupo = v.group_jid ? nomeGrupo.get(v.group_jid) : null

    if (!doDia.length) { planos.push({ venda: v, cron: null, motivo: 'nenhum leilao no cronograma nesta data' }); continue }
    if (doDia.length === 1) { planos.push({ venda: v, cron: doDia[0], motivo: 'unico leilao na data' }); continue }
    if (!grupo) { planos.push({ venda: v, cron: null, motivo: 'grupo desconhecido e mais de um leilao na data' }); continue }

    const tg = toks(grupo)
    if (!tg.size) {
        planos.push({ venda: v, cron: null, motivo: `grupo generico ("${grupo}") nao identifica o leilao` })
        continue
    }
    const casam = doDia.filter(c => { for (const w of toks(c.nome)) if (tg.has(w)) return true; return false })
    if (casam.length === 1) planos.push({ venda: v, cron: casam[0], motivo: `grupo "${grupo}"` })
    else planos.push({
        venda: v, cron: null,
        motivo: casam.length ? `grupo "${grupo}" casa com ${casam.length} leiloes` : `grupo "${grupo}" nao casa com nenhum leilao da data`,
    })
}

// ── relatório ───────────────────────────────────────────────────────────────
const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const resolvidos = planos.filter(p => p.cron)
const pendentes = planos.filter(p => !p.cron)

console.log(`\nvendas orfas: ${planos.length}  |  resolvidas: ${resolvidos.length}  |  sem sinal: ${pendentes.length}`)

const porCron = new Map<string, { nome: string; n: number; valor: number }>()
for (const p of resolvidos) {
    const a = porCron.get(p.cron!.id) || { nome: p.cron!.nome, n: 0, valor: 0 }
    a.n++; a.valor += Number(p.venda.valor || 0)
    porCron.set(p.cron!.id, a)
}
console.log('\nA ASSOCIAR:')
for (const [id, a] of porCron)
    console.log(`  ${a.n} lote(s)  R$ ${brl(a.valor)}  ->  ${a.nome}  [${id.slice(0, 8)}]`)

if (pendentes.length) {
    console.log('\nFICAM ORFAS (sem sinal confiavel — nao se chuta comissao):')
    const porMotivo = new Map<string, number>()
    for (const p of pendentes) porMotivo.set(p.motivo, (porMotivo.get(p.motivo) || 0) + 1)
    for (const [m, n] of porMotivo) console.log(`  ${n} lote(s): ${m}`)
    for (const p of pendentes.slice(0, 12))
        console.log(`    ${String(p.venda.leilao_data).slice(0, 10)} lote ${String(p.venda.lote).padEnd(6)} ` +
            `R$ ${String(brl(p.venda.valor)).padStart(9)} sexo=${p.venda.sexo || '-'} ${String(p.venda.comprador || '').slice(0, 22)}`)
}

if (!APPLY) { console.log('\n(dry-run) use --apply para gravar'); process.exit(0) }
if (!resolvidos.length) { console.log('\nnada a associar.'); process.exit(0) }

// ── grava ───────────────────────────────────────────────────────────────────
let ok = 0
for (const p of resolvidos) {
    const { error } = await sb.from('bula_leilao_vendas')
        .update({ cronograma_id: p.cron!.id }).eq('id', p.venda.id)
    if (error) console.error('  ERRO ao associar venda', p.venda.id, error.message)
    else ok++
}
console.log(`\nassociadas: ${ok}/${resolvidos.length}`)

// ── reconstrói o fechamento SÓ onde ainda não existe um ─────────────────────
//
// `rebuildFechamentoFromLances` já protege contra sobrescrever fechamento
// manual — mas comparando NOMES normalizados. O cronograma e o fechamento
// nomeiam o mesmo evento de formas diferentes ("LEILÃO FÊMEAS NELORE MAFRA" ×
// "LEILÃO NELORE MAFRA EDIÇÃO REDENÇÃO/PA - FÊMEAS"), a proteção não dispara e
// nasce um fechamento duplicado. Aconteceu de verdade em 01/08: R$ 255.300 em
// cima de um leilão que já estava lançado com R$ 1.042.700.
//
// A checagem aqui é por DATA, que não depende de nome nenhum.
//
// E há um motivo a mais para não preferir o fechamento por lances quando já
// existe outro: o parser subavalia lote com vários animais. As 19 vendas de
// 01/08 renderiam R$ 255.300 contra R$ 1.042.700 apurados — a mensagem
// "lt 43, 42, 44, 49, 50 - 450,00x40 - 16F" descreve 16 animais, e a conta por
// lote perde isso.
console.log('\nfechamentos:')
for (const [id, a] of porCron) {
    const { data: cron } = await sb.from('cronograma_leiloes').select('data').eq('id', id).maybeSingle()
    const dataLeilao = String(cron?.data || '').slice(0, 10)
    const { data: jaExiste } = await sb.from('bula_leilao_fechamento')
        .select('id, nome, lotes_vendidos, vgv_total, origem').eq('data', dataLeilao)

    if (jaExiste?.length) {
        console.log(`  ${a.nome}: ja existe fechamento em ${dataLeilao} — NAO reconstruido`)
        for (const f of jaExiste) {
            console.log(`     "${f.nome.slice(0, 44)}" [${f.origem}] ${f.lotes_vendidos} lotes, ` +
                `R$ ${brl(f.vgv_total)}   x   capturado do grupo: ${a.n} lote(s), R$ ${brl(a.valor)}`)
        }
        console.log('     as vendas ficaram vinculadas: o lance ganhou dono e vira conferencia do fechamento')
        continue
    }
    const r = await rebuildFechamentoFromLances(sb, id)
    console.log(`  ${a.nome}: ${JSON.stringify(r)}`)
}
