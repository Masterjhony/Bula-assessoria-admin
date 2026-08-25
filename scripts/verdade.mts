/**
 * ERP VERDADE — apuração com carimbo.
 *
 *   npx tsx scripts/verdade.mts              relatório completo
 *   npx tsx scripts/verdade.mts --curto      só a linha de cada variável
 *   npx tsx scripts/verdade.mts --json       saída para outro programa
 *   npx tsx scripts/verdade.mts caixa.saldo  detalha uma variável
 *
 * Sai com código 1 se houver validação FALHANDO ou variável bloqueada — serve
 * de gate: relatório não sai enquanto o ERP estiver se contradizendo.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { apurarVerdade, rotuloConfianca } from '../src/lib/verdade/motor'
import type { VariavelResolvida } from '../src/lib/verdade/tipos'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})

const args = process.argv.slice(2)
const CURTO = args.includes('--curto')
const JSON_OUT = args.includes('--json')
const alvo = args.find(a => !a.startsWith('-'))

const brl = (n: number) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const fmtValor = (v: VariavelResolvida) => {
    if (v.valor === null || v.valor === undefined) return '—'
    if (v.unidade === 'BRL') return brl(Number(v.valor))
    if (v.unidade === 'percentual') return Number(v.valor).toFixed(1) + '%'
    return String(v.valor)
}
const SIM = { alta: 'ALTA', media: 'MEDIA', baixa: 'BAIXA', nao_publicar: 'NAO PUBLICAR' }
const barra = (frac: number, largura = 12) => {
    const cheio = Math.round(Math.max(0, Math.min(1, frac)) * largura)
    return '[' + '#'.repeat(cheio) + '.'.repeat(largura - cheio) + ']'
}

const rel = await apurarVerdade(sb)

if (JSON_OUT) {
    console.log(JSON.stringify(rel, null, 2))
    process.exit(0)
}

console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗')
console.log('║  ERP VERDADE — nenhum número sem origem, fórmula, cobertura e confiança   ║')
console.log('╚═══════════════════════════════════════════════════════════════════════════╝')
console.log(`foto dos fatos: ${rel.foto_em.replace('T', ' ').slice(0, 19)}`)

// ── validações ─────────────────────────────────────────────────────────────
console.log('\n■ VALIDAÇÕES CRUZADAS')
for (const v of rel.validacoes) {
    const marca = v.passou ? 'PASS' : v.severidade === 'fail' ? 'FAIL' : 'WARN'
    console.log(`  ${marca}  ${v.titulo}`)
    if (!v.passou && v.detalhe) {
        for (const linha of quebra(v.detalhe, 96)) console.log(`        ${linha}`)
        console.log(`        afeta: ${v.afeta.join(', ')}`)
    }
}

// ── variáveis ──────────────────────────────────────────────────────────────
const mostrar = alvo ? rel.variaveis.filter(v => v.id === alvo || v.id.startsWith(alvo)) : rel.variaveis
if (alvo && !mostrar.length) {
    console.log(`\nvariável "${alvo}" não existe. Disponíveis:\n  ` + rel.variaveis.map(v => v.id).join('\n  '))
    process.exit(2)
}

console.log('\n■ VARIÁVEIS')
for (const v of mostrar) {
    const rot = rotuloConfianca(v.confianca.nota)
    const selo = v.publicavel ? '' : '   <<< BLOQUEADA PARA PUBLICAÇÃO'
    console.log(`\n  ${v.titulo}`)
    console.log(`  ${'─'.repeat(Math.min(74, v.titulo.length + 4))}`)
    console.log(`   Valor        ${fmtValor(v)}`)
    if (CURTO) {
        console.log(`   Confiança    ${v.confianca.nota}%  ${SIM[rot]}${selo}`)
        continue
    }
    console.log(`   Origem       ${v.origens.map(o => `${o.fonte} (${o.linhas} linhas) · ${o.filtro}`).join('\n                ')}`)
    for (const linha of quebra('Fórmula      ' + v.formula, 90, 16)) console.log('   ' + linha)
    if (v.composicao.length) {
        console.log('   Composicao')
        for (const c of v.composicao) {
            const val = v.unidade === 'BRL' ? brl(c.valor) : String(c.valor)
            console.log(`                ${val.padStart(16)}  ${c.rotulo}${c.nota ? '  — ' + c.nota : ''}`)
        }
    }
    console.log(`   Cobertura    ${barra(v.cobertura.fracao)} ${(v.cobertura.fracao * 100).toFixed(1)}%  ` +
        `(${v.cobertura.usados} de ${v.cobertura.universo} fatos)`)
    for (const l of v.cobertura.lacunas) {
        console.log(`                falta: ${l.motivo} — ${l.linhas} linha(s)${l.valor ? ' ' + brl(l.valor) : ''}`)
        if (l.exemplos?.length) console.log(`                       ex.: ${l.exemplos.slice(0, 3).join(' | ')}`)
    }
    console.log(`   Atualização  ${v.atualizado_em || '—'}`)
    if (v.deriva_de.length) console.log(`   Deriva de    ${v.deriva_de.join(', ')}`)
    if (v.conflitos.length) {
        console.log(`   Conflitos    ${v.conflitos.length}`)
        for (const c of v.conflitos) console.log(`                ${c.severidade.toUpperCase()} ${c.titulo}`)
    }
    console.log(`   Confiança    ${v.confianca.nota}%  ${SIM[rot]}${selo}`)
    for (const m of v.confianca.motivos) {
        if (Math.abs(m.delta) < 0.05) continue
        console.log(`                ${m.delta > 0 ? '+' : ''}${m.delta}  ${m.motivo}`)
    }
    if (v.erro) console.log(`   ERRO         ${v.erro}`)
}

// ── resumo ─────────────────────────────────────────────────────────────────
const r = rel.resumo
console.log('\n' + '═'.repeat(78))
console.log(`  ${r.variaveis} variáveis · ${r.publicaveis} publicáveis · ${r.bloqueadas} bloqueadas · ` +
    `confiança média ${r.confianca_media}%`)
console.log(`  validações: ${rel.validacoes.filter(v => v.passou).length} PASS · ${r.warns} WARN · ${r.fails} FAIL`)
console.log('═'.repeat(78) + '\n')

function quebra(txt: string, largura: number, recuo = 0): string[] {
    const out: string[] = []
    let linha = ''
    for (const p of String(txt).split(' ')) {
        if ((linha + ' ' + p).trim().length > largura) { out.push(linha.trim()); linha = ' '.repeat(recuo) + p }
        else linha += ' ' + p
    }
    if (linha.trim()) out.push(linha.trim().length === linha.length ? linha : linha.replace(/^ /, ''))
    return out
}

process.exit(r.fails > 0 || r.bloqueadas > 0 ? 1 : 0)
