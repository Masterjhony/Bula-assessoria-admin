/**
 * ATENDIMENTO REAL — quanto do funil do meio dá para medir, e como.
 *
 *   node scripts/apura-atendimento-real-2026.mjs
 *
 * O degrau entre o lead qualificado e o cadastro submetido era declarado como
 * zona cega, porque boa parte do atendimento roda no telefone pessoal do SDR.
 * Verdade — mas não é 100% cego. Há duas fontes que enxergam pedaços dele:
 *
 *   A) As abas de trabalho da planilha (TOUROS, FEMEAS, OUTROS) têm as colunas
 *      "Etapa" e "Atendido por" preenchidas à mão pelo próprio SDR. Na aba
 *      TOUROS isso cobre 89% dos leads de campanha.
 *   B) whatsapp_messages: toda conversa que passou por um número conectado
 *      (API oficial ou Baileys) está gravada, com direção. Cruzando o telefone
 *      do lead com o histórico, dá para saber quem foi abordado e quem
 *      respondeu — pelo menos nesse universo.
 *
 * As duas subestimam (o que roda em telefone pessoal não aparece em nenhuma),
 * então o resultado é PISO. Mas piso medido é melhor que zona cega declarada.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { foneKey, semAcento } from './lib/base-clientes-2026.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const F = path.join(DIR, 'fontes')
for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f); if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
        let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        if (!(m[1] in process.env)) process.env[m[1]] = v
    }
}

const planilha = JSON.parse(fs.readFileSync(path.join(F, 'planilha-leads.json'), 'utf8'))
const ehCamp = (o, c) => {
    const s = semAcento(String(o || '')).toLowerCase(), k = semAcento(String(c || '')).toLowerCase()
    if (/base unificada|lista antiga|contatos whatsapp/.test(s)) return false
    return /^meta|landing|forms inst|perpetuo|sao geraldo|jmp/.test(s) || /^(ca -|leads -|leilao jmp|\d{15,})/.test(k)
}

/* ── A) o que as abas de trabalho registram ───────────────────────────────── */
const norm = e => semAcento(String(e || '')).toUpperCase().trim()
const CLASSE = e => {
    const s = norm(e)
    if (!s) return null
    if (/NUMERO ERRADO|NUMERO INVALIDO/.test(s)) return 'numero-errado'
    if (/NAO RESPONDEU/.test(s)) return 'sem-resposta'
    if (/CADASTRO OK/.test(s)) return 'cadastro-ok'
    if (/CADASTRO REPROVADO/.test(s)) return 'cadastro-reprovado'
    if (/SEM INFORMACAO/.test(s)) return 'sem-info'
    if (/JA COMPROU/.test(s)) return 'ja-comprou'
    if (/QUALIFICACAO/.test(s)) return 'qualificacao'
    if (/CONEXAO/.test(s)) return 'conexao'
    if (/^LEAD$/.test(s)) return 'lead-novo'
    return 'outro'
}

const trabalhados = []
for (const [aba, { head, rows }] of Object.entries(planilha)) {
    const iE = head.findIndex(h => /^etapa$/i.test(h))
    const iA = head.findIndex(h => /atendido/i.test(h))
    if (iE < 0) continue
    const iN = head.findIndex(h => /^nome$/i.test(h)), iF = head.findIndex(h => /whats/i.test(h))
    const iO = head.findIndex(h => /^origem$/i.test(h)), iC = head.findIndex(h => /campaign_name|utm_campaign/i.test(h))
    for (const r of rows) {
        if (!ehCamp(r[iO], r[iC])) continue
        trabalhados.push({ aba, nome: r[iN], fone: r[iF], etapa: String(r[iE] ?? '').trim(), classe: CLASSE(r[iE]), sdr: String(r[iA] ?? '').trim() })
    }
}
const comEtapa = trabalhados.filter(t => t.classe)
const cont = {}
for (const t of comEtapa) cont[t.classe] = (cont[t.classe] || 0) + 1

console.log('A) ABAS DE TRABALHO (leads de campanha)')
console.log(`   leads nas abas: ${trabalhados.length} | com etapa registrada: ${comEtapa.length} (${(comEtapa.length / trabalhados.length * 100).toFixed(0)}%)`)
for (const [k, v] of Object.entries(cont).sort((a, b) => b[1] - a[1])) console.log(`     ${k.padEnd(20)} ${String(v).padStart(4)}`)

const contatavel = comEtapa.filter(t => t.classe !== 'numero-errado')
const semResposta = comEtapa.filter(t => t.classe === 'sem-resposta').length
const chegouCadastro = comEtapa.filter(t => /cadastro/.test(t.classe)).length
console.log(`\n   contatáveis: ${contatavel.length}`)
console.log(`   não responderam: ${semResposta} (${(semResposta / contatavel.length * 100).toFixed(1)}%)`)
console.log(`   chegaram a cadastro: ${chegouCadastro} (${(chegouCadastro / contatavel.length * 100).toFixed(1)}%)`)

// O mesmo SDR aparece com grafias diferentes ("Pedro Pereira", "pedro pereira",
// "Pedro pereira") — normaliza para não dividir o desempenho de uma pessoa em três.
const nomeSdr = s => {
    const t = semAcento(String(s || '')).trim().toLowerCase().replace(/\s+/g, ' ')
    if (!t) return '(sem responsável anotado)'
    return t.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
const porSdr = {}
for (const t of comEtapa) {
    const k = nomeSdr(t.sdr)
    porSdr[k] = porSdr[k] || { n: 0, cad: 0, semResp: 0 }
    porSdr[k].n++
    if (/cadastro/.test(t.classe)) porSdr[k].cad++
    if (t.classe === 'sem-resposta') porSdr[k].semResp++
}
console.log('\n   POR SDR:')
for (const [k, v] of Object.entries(porSdr).sort((a, b) => b[1].n - a[1].n))
    console.log(`     ${k.slice(0, 26).padEnd(28)} ${String(v.n).padStart(4)} leads | ${String(v.cad).padStart(3)} cadastros (${(v.cad / v.n * 100).toFixed(0)}%) | sem resposta ${(v.semResp / v.n * 100).toFixed(0)}%`)

/* ── B) o que o WhatsApp conectado registra ───────────────────────────────── */
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
    const msgs = (await c.query(`select phone, direction, min(created_at) ini from whatsapp_messages
        where created_at >= '2026-06-01' and phone not like '%@g.us' group by 1,2`)).rows
    const out = new Set(), inb = new Set()
    for (const m of msgs) {
        const k = foneKey(m.phone); if (!k) continue
        if (m.direction === 'outbound') out.add(k); else inb.add(k)
    }
    // universo de leads de campanha com telefone
    const fones = new Set()
    for (const [, { head, rows }] of Object.entries(planilha)) {
        const iF = head.findIndex(h => /whats/i.test(h))
        const iO = head.findIndex(h => /^origem$/i.test(h)), iC = head.findIndex(h => /campaign_name|utm_campaign/i.test(h))
        for (const r of rows) { if (!ehCamp(r[iO], r[iC])) continue; const k = foneKey(r[iF]); if (k) fones.add(k) }
    }
    const abordados = [...fones].filter(f => out.has(f))
    const responderam = abordados.filter(f => inb.has(f))
    console.log('\nB) WHATSAPP EM NÚMERO CONECTADO (desde 01/06)')
    console.log(`   leads de campanha com telefone: ${fones.size}`)
    console.log(`   receberam mensagem nossa:       ${abordados.length} (${(abordados.length / fones.size * 100).toFixed(1)}%)`)
    console.log(`   responderam:                    ${responderam.length} (${(responderam.length / abordados.length * 100).toFixed(1)}% dos abordados)`)
    console.log(`   → os outros ${fones.size - abordados.length} leads foram atendidos em telefone pessoal de SDR, ou não foram atendidos. Não há como distinguir os dois casos.`)

    fs.writeFileSync(path.join(DIR, 'atendimento-real-2026.json'), JSON.stringify({
        geradoEm: new Date().toISOString().slice(0, 10),
        abas: { leads: trabalhados.length, comEtapa: comEtapa.length, contatavel: contatavel.length, semResposta, chegouCadastro, porClasse: cont, porSdr },
        whatsapp: { leadsComFone: fones.size, abordados: abordados.length, responderam: responderam.length },
    }, null, 1))
    console.log('\ngravado em outputs/base-clientes-2026/atendimento-real-2026.json')
} finally { await c.end() }
