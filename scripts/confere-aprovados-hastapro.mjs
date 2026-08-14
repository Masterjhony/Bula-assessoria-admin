/**
 * CONFERÊNCIA DOS APROVADOS CONTRA O HASTAPRO — a fonte que faltava.
 *
 *   node scripts/confere-aprovados-hastapro.mjs
 *
 * As etapas de "cadastro submetido" e "cadastro aprovado" vinham só de duas
 * fontes internas: a tabela do sistema (que parou de registrar em 08/07) e a
 * leitura manual dos grupos de WhatsApp. Nenhuma das duas é auditável por
 * terceiro.
 *
 * O ERP do leiloeiro é a terceira fonte, e é a melhor: quem foi aprovado numa
 * leiloeira VIRA CADASTRO lá. Então cada aprovado tem de aparecer em CLIENTES —
 * e CLI_DATACADASTRO diz QUANDO, o que confirma (ou desmente) que o cadastro
 * nasceu do nosso funil, e não antes dele.
 *
 * De quebra, este cruzamento pega venda de aprovado em QUALQUER filial — a
 * mesma correção que já tinha mudado a atribuição de campanha.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Firebird from 'node-firebird'
import { Identidades, foneKey, docKey, nomeKey, semAcento, mesmoNome } from './lib/base-clientes-2026.mjs'
import { APROVADOS_GRUPO, APROVADOS_LISTA } from './lib/cadastros-aprovados-grupos.mjs'

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
const opts = {
    host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT,
    database: process.env.HASTAPRO_DATABASE, user: process.env.HASTAPRO_USER,
    password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true,
}
const txt = v => (Buffer.isBuffer(v) ? v.toString('latin1') : v)
const nrm = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, txt(v)]))
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dia = d => d ? new Date(d).toISOString().slice(0, 10) : null

/* os 49 aprovados (51 registros deduplicados), com a origem já apurada */
const registros = [
    ...APROVADOS_GRUPO.map(a => ({ nome: a.cliente, uf: a.uf, fone: a.fone, cpf: a.cpf, fonte: `grupo ${a.grupo}`, data: a.data })),
    ...APROVADOS_LISTA.map(a => ({ nome: a.cliente, uf: a.uf, fone: a.fone, cpf: a.cpf, fonte: 'lista consolidada', data: a.data })),
]
const idxDedup = new Identidades()
const aprovados = []
for (const r of registros) {
    if (idxDedup.busca({ doc: r.cpf, fone: r.fone, nome: r.nome })) continue
    aprovados.push(r); idxDedup.add(r, { doc: r.cpf, fone: r.fone, nome: r.nome })
}

/* leads de campanha, para dizer se o aprovado veio de anúncio */
const planilha = JSON.parse(fs.readFileSync(path.join(F, 'planilha-leads.json'), 'utf8'))
const pgLeads = JSON.parse(fs.readFileSync(path.join(F, 'pg-crm-leads.json'), 'utf8'))
const ehCampanha = (o, c) => {
    const s = semAcento(String(o || '')).toLowerCase(), k = semAcento(String(c || '')).toLowerCase()
    if (/base unificada|lista antiga|contatos whatsapp/.test(s)) return false
    return /^meta|landing|forms inst|perpetuo|sao geraldo|jmp/.test(s) || /^(ca -|leads -|leilao jmp|\d{15,})/.test(k)
}
const leadsCamp = []
for (const [nomeAba, { head, rows }] of Object.entries(planilha)) {
    const iN = head.findIndex(h => /^nome$/i.test(h)), iF = head.findIndex(h => /whats/i.test(h))
    const iO = head.findIndex(h => /^origem$/i.test(h)), iC = head.findIndex(h => /campaign_name|utm_campaign/i.test(h))
    const iD = head.findIndex(h => /^data$/i.test(h))
    for (const r of rows) if (ehCampanha(r[iO], r[iC])) leadsCamp.push({ nome: r[iN], fone: r[iF], origem: r[iO], data: r[iD], aba: nomeAba })
}
for (const l of pgLeads) if (ehCampanha(l.origem, l.campaign)) leadsCamp.push({ nome: l.nome, fone: l.telefone || l.celular, cpf: l.cpf, origem: l.origem, data: String(l.data_entrada || l.created_at).slice(0, 10), aba: 'crm' })
const idxLead = new Identidades()
for (const l of leadsCamp) idxLead.add(l, { doc: l.cpf, fone: l.fone, nome: l.nome })

const db = await new Promise((r, j) => Firebird.attach(opts, (e, d) => e ? j(e) : r(d)))
const q = s => new Promise((r, j) => db.query(s, [], (e, x) => e ? j(e) : r(x.map(nrm))))

try {
    /* todos os clientes e compras do ERP, todas as filiais */
    const clientes = await q(`select CLI_CODIGO, CLI_NOME, CLI_CPFCNPJ, CLI_UF, CLI_CELULAR, CLI_FONECOM1,
        CLI_FONERES, CLI_EMAIL, CLI_DATACADASTRO, FIL_CODIGO from CLIENTES`)
    const compras = await q(`
        select l.FIL_CODIGO fil, l.LEI_NOME, l.LEI_DATA, lo.LOT_QTD, lo.LOT_TOTAL, c.COP_PORCENTAGEM, c.CLI_CODIGO
          from COMPRADORES c
          join LEILAO l  on l.FIL_CODIGO = c.FIL_CODIGO and l.LEI_CODIGO = c.LEI_CODIGO
          join LOTES lo  on lo.FIL_CODIGO = c.FIL_CODIGO and lo.LEI_CODIGO = c.LEI_CODIGO and lo.LOT_LOTE = c.LOT_LOTE
         where l.LEI_DATA >= '2026-01-01'`)
    const porCliente = {}
    for (const r of compras) {
        const k = String(r.cli_codigo)
        ;(porCliente[k] = porCliente[k] || []).push({
            fil: String(r.fil).trim(), data: dia(r.lei_data), leilao: String(r.lei_nome).trim(),
            animais: Number(r.lot_qtd || 0),
            valor: Math.round(Number(r.lot_total) * (Number(r.cop_porcentagem ?? 100) / 100) * 100) / 100,
        })
    }
    console.log(`ERP: ${clientes.length} cadastros, ${compras.length} lotes comprados em 2026\n`)

    const idxErp = new Identidades()
    for (const c of clientes) idxErp.add(c, { doc: c.cli_cpfcnpj, fone: c.cli_celular || c.cli_fonecom1 || c.cli_foneres, nome: c.cli_nome })

    let comCadastro = 0, semCadastro = 0, compraram = 0, vgv = 0, animais = 0, cadastroNoPeriodo = 0
    const achados = []
    console.log('APROVADO'.padEnd(34) + 'CADASTRO NO ERP'.padEnd(30) + 'DATA CAD.'.padEnd(12) + 'COMPRA 2026')
    console.log('─'.repeat(112))
    for (const a of aprovados) {
        const m = idxErp.busca({ doc: a.cpf, fone: a.fone, nome: a.nome })
        const c = m?.registro
        const cs = c ? (porCliente[String(c.cli_codigo)] || []) : []
        const v = cs.reduce((s, x) => s + x.valor, 0)
        const an = cs.reduce((s, x) => s + x.animais, 0)
        const dcad = c ? dia(c.cli_datacadastro) : null
        const noPeriodo = dcad && dcad >= '2026-06-01'
        if (c) { comCadastro++; if (noPeriodo) cadastroNoPeriodo++ } else semCadastro++
        if (cs.length) { compraram++; vgv += v; animais += an }
        const deCampanha = !!idxLead.busca({ doc: a.cpf, fone: a.fone, nome: a.nome })
        achados.push({ nome: a.nome, uf: a.uf, fonte: a.fonte, deCampanha, erp: c ? c.cli_nome : null, via: m?.via || null, dataCadastro: dcad, cadastroNoPeriodo: noPeriodo, compras: cs, valor: v, animais: an })
        console.log(
            `${String(a.nome).slice(0, 32).padEnd(34)}` +
            `${(c ? String(c.cli_nome).slice(0, 26) + ` (${m.via})` : '— não achado —').padEnd(30)}` +
            `${(dcad || '—').padEnd(12)}` +
            `${cs.length ? `${an} an · ${brl(v)} · FIL ${[...new Set(cs.map(x => x.fil))].join('+')}` : '—'}` +
            `${deCampanha ? '  [campanha]' : ''}`)
    }

    console.log('\n' + '═'.repeat(112))
    console.log(`APROVADOS: ${aprovados.length} pessoas`)
    console.log(`  com cadastro no ERP: ${comCadastro} (${(comCadastro / aprovados.length * 100).toFixed(0)}%) | sem cadastro localizável: ${semCadastro}`)
    console.log(`  cadastro criado a partir de jun/2026 (nasceu do funil): ${cadastroNoPeriodo}`)
    console.log(`  COMPRARAM em 2026 (qualquer filial): ${compraram} pessoas, ${animais} animais, ${brl(vgv)}`)
    const campanhaCompraram = achados.filter(a => a.deCampanha && a.compras.length)
    console.log(`  destes, de campanha: ${campanhaCompraram.length} pessoas, ${campanhaCompraram.reduce((s, a) => s + a.animais, 0)} animais, ${brl(campanhaCompraram.reduce((s, a) => s + a.valor, 0))}`)

    fs.writeFileSync(path.join(DIR, 'aprovados-conferidos-hastapro.json'), JSON.stringify({
        geradoEm: new Date().toISOString().slice(0, 10),
        fonte: 'HastaPro ao vivo (CLIENTES + COMPRADORES, todas as filiais) × 49 aprovados apurados nos grupos',
        aprovados: aprovados.length, comCadastro, semCadastro, cadastroNoPeriodo,
        compraram, animais, vgv: Math.round(vgv * 100) / 100,
        achados,
    }, null, 1))
    console.log('\ngravado em outputs/base-clientes-2026/aprovados-conferidos-hastapro.json')
} finally { db.detach() }
