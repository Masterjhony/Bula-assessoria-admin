/**
 * CONFERÊNCIA DA LISTA DE PATROCINADOS (diretoria, 14/08) CONTRA ERP + LEADS.
 *
 *   node scripts/confere-patrocinados-2026.mjs
 *
 * A lista do Leozinho é a origem do "Leonardo 373.500 / 20 animais" que estava
 * irreconciliável. Aqui cada nome é: (a) procurado no ERP ao vivo, em TODAS as
 * filiais e com grafia solta; (b) procurado nos leads (planilha + CRM), para
 * separar quem veio de campanha de quem é carteira do assessor.
 *
 * A descoberta que motivou o script: a apuração da base de clientes só olha a
 * filial '2'. Os leilões da filial '01' (São Geraldo, Kriz, MEAB, Jacamim…)
 * ficaram de fora — e é lá que estão 3 dos 5 patrocinados. Para o VGV total a
 * regra da filial '2' continua certa (FIL '01' é o ERP do leiloeiro inteiro,
 * R$ 145 mi, a maior parte de outras assessorias); para a ATRIBUIÇÃO DE
 * CAMPANHA, porém, o que vale é a compra da PESSOA, em qualquer filial.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Firebird from 'node-firebird'
import { foneKey, docKey, nomeTokens, mesmoNome } from './lib/base-clientes-2026.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const F = path.join(DIR, 'fontes')
for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (!m) continue
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
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
const dia = d => new Date(d).toISOString().slice(0, 10)

/** A lista, exatamente como a diretoria mandou. */
const LISTA = [
    { nome: 'MARCELO CLEMENTE', animais: 13, valor: 240000, grafias: ['MARCELO CLEMENTE'] },
    { nome: 'PATRICK OLIVEIRA', animais: null, valor: 35100, grafias: ['PATRICK OLIVEIRA'] },
    { nome: 'LAERCIO JOSE', animais: 3, valor: 55800, obs: '3 touros', grafias: ['LAERCIO JOSE'] },
    { nome: 'JOSE LUIZ', animais: 1, valor: 18000, obs: '1 fêmea', grafias: ['JOSE LUIZ ANTUNES'] },
    { nome: 'TALES DE OLIVEIRA', animais: 1, valor: 24600, grafias: ['THALES DE OLIVEIRA', 'TALES DE OLIVEIRA'] },
]

/* ── leads: planilha + CRM ────────────────────────────────────────────────── */
const planilha = JSON.parse(fs.readFileSync(path.join(F, 'planilha-leads.json'), 'utf8'))
const pgLeads = JSON.parse(fs.readFileSync(path.join(F, 'pg-crm-leads.json'), 'utf8'))
const aba = n => { const { head, rows } = planilha[n]; return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) }
const ehCampanha = (o, c) => {
    const s = String(o || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const k = String(c || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    if (/base unificada|lista antiga|contatos whatsapp/.test(s)) return false
    return /^meta|landing|forms inst|perpetuo|sao geraldo|jmp/.test(s) || /^(ca -|leads -|leilao jmp|\d{15,})/.test(k)
}
const leadsTodos = [
    ...aba('LEADS GERAIS').map(l => ({
        nome: l['Nome'], fone: l['WhatsApp'], data: l['Data'], origem: l['Origem'],
        campanha: l['campaign_name'] || l['utm_campaign'], cabecas: l['Cabeças'], ie: l['Inscrição Estadual'],
        fonte: 'planilha', campanhaSim: ehCampanha(l['Origem'], l['campaign_name'] || l['utm_campaign']),
    })),
    ...pgLeads.map(l => ({
        nome: l.nome, fone: l.telefone || l.celular, cpf: l.cpf, data: String(l.data_entrada || l.created_at || '').slice(0, 10),
        origem: l.origem, campanha: l.campaign, cabecas: l.quantidade_animais, ie: l.inscricao_estadual,
        fonte: 'crm', campanhaSim: ehCampanha(l.origem, l.campaign),
    })),
]

const db = await new Promise((res, rej) => Firebird.attach(opts, (e, d) => e ? rej(e) : res(d)))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => e ? rej(e) : res(r.map(nrm))))

try {
    /* nomes dos pisteiros, via USUARIOS (LOT_PISTEIRO = USU_CODIGO) */
    const usuarios = await q(`select USU_CODIGO, USU_NOME, FIL_CODIGO from USUARIOS`)
    const nomePist = {}
    for (const u of usuarios) nomePist[String(u.usu_codigo).trim()] = String(u.usu_nome || '').trim()

    console.log('LISTA DE PATROCINADOS DO LEOZINHO — conferência item a item\n')
    let totV = 0, totA = 0, totVconf = 0, totAconf = 0
    const resultado = []

    for (const alvo of LISTA) {
        const like = alvo.grafias.map(g => `upper(cl.CLI_NOME) like '%${g}%'`).join(' or ')
        const linhas = await q(`
            select l.FIL_CODIGO fil, l.LEI_NOME, l.LEI_DATA, lo.LOT_LOTE, lo.LOT_QTD, lo.LOT_TOTAL,
                   lo.LOT_PISTEIRO, c.COP_PORCENTAGEM, cl.CLI_NOME, cl.CLI_CODIGO, cl.CLI_CPFCNPJ,
                   cl.CLI_UF, cl.CLI_CELULAR, cl.CLI_FONECOM1, cl.CLI_EMAIL
              from COMPRADORES c
              join LEILAO l    on l.FIL_CODIGO = c.FIL_CODIGO and l.LEI_CODIGO = c.LEI_CODIGO
              join LOTES lo    on lo.FIL_CODIGO = c.FIL_CODIGO and lo.LEI_CODIGO = c.LEI_CODIGO and lo.LOT_LOTE = c.LOT_LOTE
              join CLIENTES cl on cl.CLI_CODIGO = c.CLI_CODIGO
             where (${like}) and l.LEI_DATA >= '2026-01-01'
             order by l.LEI_DATA, lo.LOT_LOTE`)

        console.log('='.repeat(100))
        console.log(`${alvo.nome}  —  lista: ${alvo.animais ?? '?'} animal(is), ${brl(alvo.valor)}${alvo.obs ? ' (' + alvo.obs + ')' : ''}`)

        // o lote que a lista está citando: o que casa com o valor informado
        let somaTudo = 0, animaisTudo = 0
        const doCliente = {}
        for (const r of linhas) {
            const val = Number(r.lot_total) * (Number(r.cop_porcentagem ?? 100) / 100)
            somaTudo += val; animaisTudo += Number(r.lot_qtd || 0)
            const k = String(r.cli_codigo)
            doCliente[k] = doCliente[k] || { nome: r.cli_nome, uf: r.cli_uf, cpf: r.cli_cpfcnpj, fone: r.cli_celular || r.cli_fonecom1, lotes: [], valor: 0, animais: 0 }
            doCliente[k].lotes.push(r); doCliente[k].valor += val; doCliente[k].animais += Number(r.lot_qtd || 0)
            console.log(`  FIL ${String(r.fil).padEnd(2)} | ${dia(r.lei_data)} | ${String(r.lei_nome).slice(0, 42).padEnd(42)} | q ${String(r.lot_qtd).padStart(3)} | ${brl(val).padStart(16)} | pist ${(nomePist[String(r.lot_pisteiro).trim()] || r.lot_pisteiro || '-').slice(0, 22)}`)
        }
        if (!linhas.length) { console.log('  >>> NADA NO ERP'); continue }

        // qual pessoa (CLI_CODIGO) corresponde ao valor da lista
        const casa = Object.values(doCliente).find(c => Math.abs(c.valor - alvo.valor) < 1)
            || Object.values(doCliente).sort((a, b) => b.valor - a.valor)[0]

        // esse cliente é lead? de campanha?
        const cands = leadsTodos.filter(l =>
            (docKey(casa.cpf) && docKey(l.cpf) === docKey(casa.cpf)) ||
            (foneKey(casa.fone) && foneKey(l.fone) === foneKey(casa.fone)) ||
            mesmoNome(casa.nome, l.nome))
        const deCampanha = cands.filter(l => l.campanhaSim)
        const veredito = deCampanha.length ? 'LEAD DE CAMPANHA' : (cands.length ? 'lead, mas NÃO de campanha' : 'NÃO É LEAD (carteira do assessor)')

        console.log(`  → cliente: ${casa.nome} (${casa.uf ?? '-'}) | ERP: ${casa.animais} animais, ${brl(casa.valor)} | lista: ${alvo.animais ?? '?'} / ${brl(alvo.valor)} → ${Math.abs(casa.valor - alvo.valor) < 1 ? 'BATE' : 'DIVERGE'}`)
        console.log(`  → ${veredito}${deCampanha.length ? ': ' + deCampanha.map(l => `${l.fonte}/${l.origem || l.campanha} em ${l.data}`).slice(0, 3).join(' | ') : ''}`)
        if (!deCampanha.length && cands.length) console.log(`     (aparece como lead: ${cands.map(l => `${l.fonte}/${l.origem}`).slice(0, 3).join(' | ')})`)

        totV += alvo.valor; totA += alvo.animais ?? casa.animais
        if (deCampanha.length) { totVconf += casa.valor; totAconf += casa.animais }
        resultado.push({ ...alvo, erp: { nome: casa.nome, uf: casa.uf, animais: casa.animais, valor: casa.valor, filiais: [...new Set(casa.lotes.map(l => l.fil))] }, veredito, campanha: deCampanha[0]?.origem || deCampanha[0]?.campanha || null, dataLead: deCampanha[0]?.data || null })
    }

    console.log('\n' + '='.repeat(100))
    console.log(`LISTA DA DIRETORIA:  ${totA} animais, ${brl(totV)}`)
    console.log(`CONFIRMADO NO ERP E DE CAMPANHA: ${totAconf} animais, ${brl(totVconf)}`)
    fs.writeFileSync(path.join(DIR, 'patrocinados-leozinho.json'), JSON.stringify(resultado, null, 1))
    console.log('\ngravado em outputs/base-clientes-2026/patrocinados-leozinho.json')
} finally { db.detach() }
