/**
 * Consolida as categorias do fluxo de caixa.
 *
 * O fluxo mostrava QUATRO linhas de entrada para a mesma coisa — "Recebimento
 * Cliente", "Comissoes Recebidas", "Comissao Leilao" e "Sem categoria" — quando
 * praticamente 100% do que a Bula recebe é comissão de leilão. Quem olha o
 * quadro não consegue responder "quanto entrou de comissão" sem somar de
 * cabeça, e some do radar que os R$ 58 mil "sem categoria" também são comissão.
 *
 * Aqui: as três viram uma só, os CR sem categoria são classificados, e as
 * categorias que nunca foram usadas saem do seletor (categoria ociosa é convite
 * a classificação errada).
 *
 * Repontar é seguro: a categoria é referência, não valor. Nenhum lançamento é
 * criado, apagado ou tem o valor alterado.
 *
 *   npx tsx scripts/consolida-categorias-fluxo.mts           (dry-run)
 *   npx tsx scripts/consolida-categorias-fluxo.mts --apply
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const APPLY = process.argv.includes('--apply')
const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

/** As três que dizem a mesma coisa. A primeira é a que fica. */
const DESTINO = 'Comissao Leilao'
const NOVO_NOME = 'Comissão de Leilão'
const ABSORVIDAS = ['Recebimento Cliente', 'Comissoes Recebidas']

const { data: cats } = await sb.from('erp_categorias').select('id, nome, tipo, dre_grupo, ativo')
const acha = (nome: string) => (cats ?? []).find(c => c.nome === nome)
// Idempotente: depois da primeira execucao a categoria ja se chama NOVO_NOME.
const destino = acha(DESTINO) ?? acha(NOVO_NOME)
if (!destino) { console.error(`categoria "${DESTINO}" / "${NOVO_NOME}" nao existe`); process.exit(1) }
const absorvidas = ABSORVIDAS.map(acha).filter(Boolean) as NonNullable<ReturnType<typeof acha>>[]

// ── 1. o que será repontado ────────────────────────────────────────────────
const TABELAS = ['erp_movimentos_bancarios', 'erp_contas_pagar', 'erp_contas_receber', 'erp_cartao_lancamentos'] as const
console.log('CONSOLIDAR ENTRADAS')
console.log(`  destino: "${destino.nome}" -> renomeada para "${NOVO_NOME}"`)
let totalLinhas = 0
for (const c of absorvidas) {
    const partes: string[] = []
    for (const t of TABELAS) {
        const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('categoria_id', c.id)
        if (count) { partes.push(`${t.replace('erp_', '')}=${count}`); totalLinhas += count }
    }
    console.log(`  absorve "${c.nome}": ${partes.join(' ') || '(sem uso)'}`)
}

// ── 2. CR sem categoria que são comissão de leilão ─────────────────────────
const { data: crSem } = await sb.from('erp_contas_receber')
    .select('id, descricao, valor, fechamento_id, status')
    .is('categoria_id', null).neq('status', 'cancelado')
// Praticamente 100% do que a Bula recebe e comissao de leilao, entao esse e o
// DEFAULT para CR de receita sem categoria — nao uma adivinhacao caso a caso.
// Um filtro por palavra-chave deixava passar "MEGA GENETICA NAVIRAI - 2a ETAPA
// REPR.", que e comissao como todas as outras.
const comSinal = (r: { descricao: unknown; fechamento_id: unknown }) =>
    !!r.fechamento_id || /leil[aa]o|comiss|remates|e-?rural|programa|expozebu/i.test(String(r.descricao))
const classificar = crSem ?? []
const porDefault = classificar.filter(r => !comSinal(r))
console.log(`
CR SEM CATEGORIA: ${classificar.length}  (R$ ${brl(classificar.reduce((s, r) => s + Number(r.valor || 0), 0))})`)
console.log(`  com sinal explicito: ${classificar.length - porDefault.length}`)
if (porDefault.length) {
    console.log(`  pelo default "receita da Bula = comissao": ${porDefault.length} — confira:`)
    for (const r of porDefault) console.log(`     R$ ${String(brl(r.valor)).padStart(12)}  ${String(r.descricao).slice(0, 52)}`)
}

// ── 3. categorias ativas sem nenhum uso ────────────────────────────────────
const usadas = new Set<string>()
for (const t of TABELAS) {
    for (let from = 0; ; from += 1000) {
        const { data } = await sb.from(t).select('categoria_id').range(from, from + 999)
        for (const r of data ?? []) if (r.categoria_id) usadas.add(r.categoria_id as string)
        if (!data || data.length < 1000) break
    }
}
const ociosas = (cats ?? []).filter(c => c.ativo && !usadas.has(c.id)
    && c.id !== destino.id && !absorvidas.some(a => a.id === c.id))
console.log(`\nCATEGORIAS ATIVAS SEM NENHUM USO: ${ociosas.length} — serao desativadas`)
console.log('  ' + ociosas.map(c => c.nome).join(', '))

if (!APPLY) { console.log('\n(dry-run) use --apply para gravar'); process.exit(0) }

// ── grava ───────────────────────────────────────────────────────────────────
let repontadas = 0
for (const c of absorvidas) {
    for (const t of TABELAS) {
        const { error, count } = await sb.from(t).update({ categoria_id: destino.id }, { count: 'exact' }).eq('categoria_id', c.id)
        if (error) console.error(`  ERRO ${t}: ${error.message}`)
        else repontadas += count ?? 0
    }
    const { error } = await sb.from('erp_categorias').update({ ativo: false }).eq('id', c.id)
    if (error) console.error(`  ERRO ao desativar ${c.nome}: ${error.message}`)
}
console.log(`\nlinhas repontadas: ${repontadas}`)

for (const r of classificar) {
    const { error } = await sb.from('erp_contas_receber').update({ categoria_id: destino.id }).eq('id', r.id)
    if (error) console.error(`  ERRO CR ${r.id}: ${error.message}`)
}
console.log(`CR classificados: ${classificar.length}`)

const { error: eNome } = await sb.from('erp_categorias')
    .update({ nome: NOVO_NOME }).eq('id', destino.id)
console.log(eNome ? `ERRO ao renomear: ${eNome.message}` : `renomeada para "${NOVO_NOME}"`)

for (const c of ociosas) {
    const { error } = await sb.from('erp_categorias').update({ ativo: false }).eq('id', c.id)
    if (error) console.error(`  ERRO ao desativar ${c.nome}: ${error.message}`)
}
console.log(`categorias desativadas: ${ociosas.length + absorvidas.length}`)
