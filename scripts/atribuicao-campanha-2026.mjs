/**
 * ATRIBUIÇÃO DE CAMPANHA 2026 — a apuração definitiva de quanto a mídia vendeu.
 *
 *   node scripts/atribuicao-campanha-2026.mjs
 *
 * POR QUE ESTE SCRIPT EXISTE (e por que o anterior errava para menos):
 * a base de clientes usa só a filial '2' do HastaPro, porque FIL '2' é a
 * cobertura da Bula e FIL '01' é o ERP do leiloeiro inteiro (R$ 145 mi em 2026,
 * a maior parte de outras assessorias). Essa regra está certa para o VGV.
 *
 * Só que ela está ERRADA para medir campanha. A conferência da lista de
 * patrocinados do Leozinho (14/08) mostrou o caso que prova: LAÉRCIO JOSÉ
 * OLIVEIRA ALMEIDA entrou pela Landing São Geraldo em 30/07 e arrematou 3
 * touros (R$ 55.800) no Leilão São Geraldo em 01/08 — leilão que está na filial
 * '01'. É campanha nossa, dinheiro nosso, e a apuração anterior não via.
 *
 * A regra correta: o universo é a PESSOA, não a filial. Se alguém é lead de
 * campanha e comprou depois de virar lead, a compra conta — em qualquer filial.
 * O VGV total do ano continua sendo medido pela filial '2'; são perguntas
 * diferentes e o relatório diz qual usa onde.
 *
 * SEGURANÇA CONTRA FALSO POSITIVO: casamento por CPF > telefone > nome, e o
 * nome só vale com sobrenome batendo e sem homônimo (classe Identidades). Cada
 * linha da saída registra por onde casou, para poder ser cobrada.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Firebird from 'node-firebird'
import { Identidades, foneKey, docKey, nomeKey, semAcento } from './lib/base-clientes-2026.mjs'
import { CONFIRMADO_PELO_ASSESSOR, PATROCINADOS_LEOZINHO } from './lib/patrocinados-confirmados.mjs'
import { APROVADOS_GRUPO, APROVADOS_LISTA } from './lib/cadastros-aprovados-grupos.mjs'

/** CPF e telefone são prova direta; nome nunca é, sozinho. */
const achou_via_forte = via => via === 'cpf' || via === 'telefone'

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

/* ── 1. leads de campanha (planilha + CRM), com a data de entrada ─────────── */

const planilha = JSON.parse(fs.readFileSync(path.join(F, 'planilha-leads.json'), 'utf8'))
const pgLeads = JSON.parse(fs.readFileSync(path.join(F, 'pg-crm-leads.json'), 'utf8'))
const aba = n => { const { head, rows } = planilha[n]; return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) }

const ehCampanha = (o, c) => {
    const s = semAcento(String(o || '')).toLowerCase()
    const k = semAcento(String(c || '')).toLowerCase()
    if (/base unificada|lista antiga|contatos whatsapp/.test(s)) return false
    return /^meta|landing|forms inst|perpetuo|sao geraldo|jmp/.test(s) || /^(ca -|leads -|leilao jmp|\d{15,})/.test(k)
}
const dataBrParaIso = v => {
    const m = String(v || '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
    const i = String(v || '').match(/^(\d{4}-\d{2}-\d{2})/)
    return i ? i[1] : ''
}
/** Piso da faixa de cabeças + I.E. — a mesma regra de MQL do sistema. */
const pisoCabecas = v => { const s = String(v ?? '').trim().toLowerCase(); if (!s) return null; if (s === 'nenhuma') return 0; const m = s.match(/\d+/); return m ? +m[0] : null }
const temIE = (f, n) => String(f ?? '').trim().toLowerCase() === 'sim' || String(n ?? '').trim().length > 0

// TODAS as abas da planilha (LEADS GERAIS + TOUROS/FEMEAS/EMBRIÕES/OUTROS). As
// abas de trabalho repetem gente de LEADS GERAIS, mas não são um subconjunto
// exato — e ler só a primeira já custou leads perdidos antes.
const leads = []
for (const nomeAba of Object.keys(planilha)) {
    for (const l of aba(nomeAba)) {
        const campanha = l['campaign_name'] || l['utm_campaign']
        if (!ehCampanha(l['Origem'], campanha)) continue
        leads.push({
            nome: l['Nome'], fone: l['WhatsApp'], cpf: '', uf: l['UF'],
            data: dataBrParaIso(l['Data']), origem: l['Origem'], campanha, fonte: `planilha/${nomeAba}`,
            mql: (pisoCabecas(l['Cabeças']) ?? -1) >= 100 && temIE(l['Inscrição Estadual']),
        })
    }
}
for (const l of pgLeads) {
    if (!ehCampanha(l.origem, l.campaign)) continue
    leads.push({
        nome: l.nome, fone: l.telefone || l.celular, cpf: l.cpf, uf: l.estado,
        data: dataBrParaIso(l.data_entrada || l.created_at), origem: l.origem, campanha: l.campaign, fonte: 'crm',
        mql: (pisoCabecas(l.quantidade_animais) ?? -1) >= 100 && temIE(l.tem_inscricao_estadual, l.inscricao_estadual),
    })
}

// Uma pessoa pode ter vários leads (landing + form + ad-id). Fica a ENTRADA MAIS
// ANTIGA, que é a data a partir da qual a campanha pode reivindicar a compra.
//
// A dedup usa CHAVE DETERMINÍSTICA (documento > telefone > nome normalizado) e
// não o índice de identidades: o índice recusa nome ambíguo — correto para
// atribuir compra, desastroso para agrupar, porque a mesma pessoa com 3 leads
// vira 3 pessoas (foi o que triplicou o Laércio e duplicou o Pedro Martins).
// A união por telefone é feita depois, num segundo passe.
const chaveDe = l => docKey(l.cpf) || foneKey(l.fone) || nomeKey(l.nome)
const porChave = new Map()
for (const l of leads) {
    const k = chaveDe(l)
    if (!k) continue
    let p = porChave.get(k)
    if (!p) { p = { nome: l.nome, fone: l.fone, cpf: l.cpf, uf: l.uf, dataLead: l.data, campanhaPrimeira: l.campanha || l.origem, mql: l.mql, leads: [] }; porChave.set(k, p) }
    p.leads.push(l)
    p.fone = p.fone || l.fone; p.cpf = p.cpf || l.cpf; p.uf = p.uf || l.uf
    p.mql = p.mql || l.mql
    if (l.data && (!p.dataLead || l.data < p.dataLead)) { p.dataLead = l.data; p.campanhaPrimeira = l.campanha || l.origem }
}
// segundo passe: junta quem tem o mesmo telefone mas entrou por chaves diferentes
const porFone = new Map()
const pessoas = []
for (const p of porChave.values()) {
    const f = foneKey(p.fone)
    if (f && porFone.has(f)) {
        const q = porFone.get(f)
        q.leads.push(...p.leads)
        q.cpf = q.cpf || p.cpf; q.uf = q.uf || p.uf; q.mql = q.mql || p.mql
        if (p.dataLead && (!q.dataLead || p.dataLead < q.dataLead)) { q.dataLead = p.dataLead; q.campanhaPrimeira = p.campanhaPrimeira }
        continue
    }
    if (f) porFone.set(f, p)
    pessoas.push(p)
}

/* ── 2. TODAS as compras de 2026, todas as filiais ────────────────────────── */

const db = await new Promise((res, rej) => Firebird.attach(opts, (e, d) => e ? rej(e) : res(d)))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => e ? rej(e) : res(r.map(nrm))))

try {
    const usuarios = await q(`select USU_CODIGO, USU_NOME from USUARIOS`)
    const nomePist = Object.fromEntries(usuarios.map(u => [String(u.usu_codigo).trim(), String(u.usu_nome || '').trim()]))

    const compras = await q(`
        select l.FIL_CODIGO fil, l.LEI_NOME, l.LEI_DATA, lo.LOT_LOTE, lo.LOT_QTD, lo.LOT_TOTAL,
               lo.LOT_PISTEIRO, c.COP_PORCENTAGEM, cl.CLI_NOME, cl.CLI_CODIGO, cl.CLI_CPFCNPJ,
               cl.CLI_UF, cl.CLI_CELULAR, cl.CLI_FONECOM1, cl.CLI_FONERES, cl.CLI_EMAIL, cl.CLI_DATACADASTRO
          from COMPRADORES c
          join LEILAO l    on l.FIL_CODIGO = c.FIL_CODIGO and l.LEI_CODIGO = c.LEI_CODIGO
          join LOTES lo    on lo.FIL_CODIGO = c.FIL_CODIGO and lo.LEI_CODIGO = c.LEI_CODIGO and lo.LOT_LOTE = c.LOT_LOTE
          join CLIENTES cl on cl.CLI_CODIGO = c.CLI_CODIGO
         where l.LEI_DATA >= '2026-01-01' and l.LEI_DATA < '2027-01-01'`)
    console.log(`ERP: ${compras.length} lotes com comprador em 2026 (todas as filiais)`)

    // agrupa por comprador (CLI_CODIGO), somando o rateio de cada lote
    const compradores = {}
    for (const r of compras) {
        const k = String(r.cli_codigo)
        compradores[k] = compradores[k] || {
            nome: r.cli_nome, cpf: r.cli_cpfcnpj, uf: r.cli_uf,
            fone: r.cli_celular || r.cli_fonecom1 || r.cli_foneres, email: r.cli_email,
            dataCadastro: r.cli_datacadastro ? dia(r.cli_datacadastro) : null, compras: [],
        }
        compradores[k].compras.push({
            fil: String(r.fil).trim(), data: dia(r.lei_data), leilao: String(r.lei_nome).trim(),
            lote: String(r.lot_lote).trim(), animais: Number(r.lot_qtd || 0),
            valor: Math.round(Number(r.lot_total) * (Number(r.cop_porcentagem ?? 100) / 100) * 100) / 100,
            pisteiro: nomePist[String(r.lot_pisteiro).trim()] || String(r.lot_pisteiro ?? ''),
        })
    }

    /* ── 3. cruzamento pessoa a pessoa ────────────────────────────────────── */

    const idxComprador = new Identidades()
    for (const [k, c] of Object.entries(compradores)) idxComprador.add({ k, ...c }, { doc: c.cpf, fone: c.fone, nome: c.nome })

    // PASSE 1 — cada comprador do ERP recebe a ENTRADA DE LEAD MAIS ANTIGA entre
    // todas as pessoas-lead que casam com ele. Sem isso, quando a mesma pessoa tem
    // dois registros de lead (landing + form), o primeiro a ser processado "trava"
    // o comprador e, se a data dele for posterior à compra, o caso inteiro some.
    // Índice dos aprovados nos grupos de cadastro. Quem foi submetido e aprovado
    // teve o nome COMPLETO apurado à mão, com a frase do grupo — então serve para
    // estabelecer identidade quando o cadastro do HastaPro veio abreviado
    // ("Amadeu Ferino de Medeiros" no grupo × "AMADEU FERINO" no HastaPro).
    const idxAprovadoGrupo = new Identidades()
    for (const a of [...APROVADOS_GRUPO, ...APROVADOS_LISTA]) {
        idxAprovadoGrupo.add(a, { doc: a.cpf, fone: a.fone, nome: a.cliente })
    }

    const descartados = []
    const porComprador = new Map()
    // quantas pessoas-lead DIFERENTES casam com o mesmo comprador. Muitas = o nome
    // é comum e a identidade não está estabelecida (ex.: "LUIS ANTONIO", 14 leads).
    const disputam = new Map()
    for (const p of pessoas) {
        const achou = idxComprador.busca({ doc: p.cpf, fone: p.fone, nome: p.nome })
        if (!achou) continue
        const c = achou.registro
        const ufLead = String(p.uf || '').trim().toUpperCase().slice(0, 2)
        const ufErp = String(c.uf || '').trim().toUpperCase().slice(0, 2)
        // Confiança: CPF e telefone são prova; nome é indício, e vira prova quando a
        // UF confere. Nome igual com UF diferente é pessoa diferente — descarta.
        const conf = achou.via === 'cpf' || achou.via === 'telefone' ? 'alta'
            : (ufLead && ufErp && ufLead === ufErp) ? 'media'
                : (!ufLead || !ufErp) ? 'a-confirmar' : 'descartado'
        if (conf === 'descartado') { descartados.push({ lead: p.nome, ufLead, erp: c.nome, ufErp, valorAno: Math.round(c.compras.reduce((a, x) => a + x.valor, 0) * 100) / 100 }); continue }
        // O telefone do ERP batendo com o do lead é a prova mais forte que existe
        // aqui — então ele decide QUAL pessoa-lead representa este comprador. Sem
        // isso, o Mauro Cesar (12 registros de lead, só um com o telefone certo)
        // era representado pelo registro errado e caía como evidência fraca.
        const fonesErp = [c.fone].map(foneKey).filter(Boolean)
        const bate = fonesErp.length > 0 && p.leads.some(l => fonesErp.includes(foneKey(l.fone)))
        const cand = { c, p, conf, via: achou.via, ufLead, ufErp, telefoneBate: bate }
        disputam.set(c.k, (disputam.get(c.k) || 0) + 1)
        const ja = porComprador.get(c.k)
        if (!ja) { porComprador.set(c.k, cand); continue }
        const peso = x => (x.telefoneBate ? 100 : 0) + ({ alta: 3, media: 2, 'a-confirmar': 1 }[x.conf] || 0)
        if (peso(cand) > peso(ja) || (peso(cand) === peso(ja) && p.dataLead && p.dataLead < ja.p.dataLead)) {
            porComprador.set(c.k, cand)
        }
    }

    // PASSE 1b — o TESTE DECISIVO do casamento por nome: o telefone do lead bate
    // com algum telefone do cadastro no ERP? Se o ERP tem telefone e ele NÃO bate,
    // é outra pessoa (foi assim que caíram "Thiago Silva/AM × Thiago Silva Alves/MS"
    // e "Nelson Antonio"). Se o ERP não tem telefone nenhum, o teste é inconclusivo
    // e a decisão passa para a confirmação do assessor ou para a janela lead→compra.
    const fonesDoLead = p => [...new Set(p.leads.map(l => foneKey(l.fone)).filter(Boolean))]

    // PASSE 2 — com o lead certo em mãos, separa compra posterior de compra anterior.
    const atribuiveis = []
    const compraramAntes = []
    for (const { c, p, conf, via, ufLead, ufErp, telefoneBate } of porComprador.values()) {
        const disputantes = disputam.get(c.k) || 1
        const pos = c.compras.filter(x => p.dataLead && x.data >= p.dataLead)
        const registro = {
            nome: c.nome, nomeLead: p.nome, uf: c.uf || p.uf, cpf: c.cpf || null,
            via, ufLead, ufErp,
            dataLead: p.dataLead, campanha: p.campanhaPrimeira, mql: p.mql,
            totalAno: Math.round(c.compras.reduce((a, x) => a + x.valor, 0) * 100) / 100,
            valor: Math.round(pos.reduce((a, x) => a + x.valor, 0) * 100) / 100,
            animais: pos.reduce((a, x) => a + x.animais, 0),
            arremates: pos.length,
            filiais: [...new Set(pos.map(x => x.fil))],
            pisteiros: [...new Set(pos.map(x => x.pisteiro).filter(Boolean))],
            leiloes: [...new Set(pos.map(x => x.leilao))],
            primeiraCompraAno: c.compras.map(x => x.data).sort()[0],
            detalhe: pos,
        }
        // grau de evidência, do mais forte ao mais fraco
        const fErp = [...new Set([c.fone].map(foneKey).filter(Boolean))]
        const fLead = fonesDoLead(p)
        const telefoneRefuta = fErp.length > 0 && fLead.length > 0 && !telefoneBate
        const assessorConfirma = CONFIRMADO_PELO_ASSESSOR.has(String(c.nome).trim().toUpperCase())
        // A CADEIA COMPLETA DO FUNIL: virou lead → foi submetido e aprovado numa
        // leiloeira (nome completo apurado no grupo) → ganhou cadastro no HastaPro
        // depois disso → comprou. Quando os quatro elos existem, a identidade está
        // estabelecida por três fontes independentes.
        const aprovadoNoGrupo = !!idxAprovadoGrupo.busca({ doc: c.cpf, fone: c.fone, nome: c.nome })
        registro.aprovadoNoGrupo = aprovadoNoGrupo
        // janela curta entre o lead e a compra, na campanha do próprio leilão
        const diasAteCompra = pos.length && p.dataLead
            ? Math.round((new Date(pos.map(x => x.data).sort()[0]) - new Date(p.dataLead)) / 86400000) : null
        // PROVA INDEPENDENTE: o cadastro do comprador no HastaPro foi criado DEPOIS
        // de a pessoa virar lead. Cliente de carteira antiga tem cadastro de 2025;
        // quem nasceu do funil tem cadastro de junho em diante, na semana da compra.
        // É a evidência mais forte disponível para quem não tem telefone no cadastro.
        const cadastroNasceuNoFunil = !!(c.dataCadastro && p.dataLead && c.dataCadastro >= p.dataLead)
        registro.dataCadastroErp = c.dataCadastro
        registro.cadastroNasceuNoFunil = cadastroNasceuNoFunil
        registro.telefoneBate = telefoneBate
        registro.assessorConfirma = assessorConfirma
        registro.diasAteCompra = diasAteCompra
        registro.disputantes = disputantes
        // ORDEM IMPORTA. A identidade precisa estar estabelecida ANTES de qualquer
        // reforço: a data de cadastro prova que o COMPRADOR é novo no HastaPro, não
        // que ele é a MESMA pessoa do lead. Foi assim que "Ivan alves de Sousa"
        // quase levou de volta a compra de "Mauro Cesar Alves de Sousa".
        registro.evidencia =
            (achou_via_forte(via) || telefoneBate) ? 'telefone/CPF confere'
                : telefoneRefuta ? 'REFUTADO (telefone do HastaPro é outro)'
                    : disputantes > 2 ? 'REFUTADO (nome comum, vários leads disputam)'
                        : assessorConfirma ? 'confirmado pelo assessor'
                            : (aprovadoNoGrupo && cadastroNasceuNoFunil) ? 'cadeia completa: lead → aprovado → cadastro → compra'
                                : (conf === 'media') ? 'nome + UF conferem'
                                    : 'identidade não estabelecida'

        if (registro.evidencia.startsWith('REFUTADO') || registro.evidencia === 'identidade não estabelecida') { descartados.push(registro); continue }
        if (pos.length) atribuiveis.push(registro); else compraramAntes.push(registro)
    }

    atribuiveis.sort((a, b) => b.valor - a.valor)
    const FORTE = new Set(['telefone/CPF confere', 'confirmado pelo assessor', 'cadeia completa: lead → aprovado → cadastro → compra', 'nome + UF conferem'])
    const PROVA = atribuiveis.filter(p => FORTE.has(p.evidencia))
    const REVISAR = atribuiveis.filter(p => !FORTE.has(p.evidencia))
    const soma = arr => Math.round(arr.reduce((a, p) => a + p.valor, 0) * 100) / 100
    const bichos = arr => arr.reduce((a, p) => a + p.animais, 0)
    const VGV = soma(PROVA)
    const ANIMAIS = bichos(PROVA)

    console.log(`\nLEADS de campanha: ${leads.length} registros → ${pessoas.length} pessoas`)
    console.log(`ATRIBUÍVEIS (compraram DEPOIS de virar lead): ${atribuiveis.length} clientes`)
    console.log(`  COMPROVADOS (CPF/telefone, ou nome+UF conferindo): ${PROVA.length} clientes, ${ANIMAIS} animais, ${brl(VGV)}`)
    console.log(`  A CONFIRMAR (nome bate, mas falta UF de um dos lados): ${REVISAR.length} clientes, ${bichos(REVISAR)} animais, ${brl(soma(REVISAR))}`)
    console.log(`Já eram clientes (compra só ANTES do lead): ${compraramAntes.length}`)
    console.log(`\n${'─'.repeat(112)}`)
    for (const p of atribuiveis) {
        console.log(`${p.nome.slice(0, 30).padEnd(30)} ${String(p.uf || '--').padEnd(3)} lead ${p.dataLead} | ${String(p.animais).padStart(3)} an | ${brl(p.valor).padStart(15)} | FIL ${p.filiais.join('+').padEnd(5)} | ${String(p.diasAteCompra ?? '?').padStart(3)}d | ${p.evidencia.padEnd(26)} | ${String(p.campanha || '').slice(0, 28)}`)
    }
    const porFilial = { '2': 0, '01': 0 }
    for (const p of PROVA) for (const d of p.detalhe) porFilial[d.fil] = (porFilial[d.fil] || 0) + d.valor
    console.log(`\nPor filial: FIL 2 = ${brl(porFilial['2'])} | FIL 01 = ${brl(porFilial['01'])} (o que a apuração antiga não via)`)

    const porPisteiro = {}
    for (const p of PROVA) for (const d of p.detalhe) {
        const k = d.pisteiro || '(sem pisteiro)'
        porPisteiro[k] = porPisteiro[k] || { valor: 0, animais: 0, clientes: new Set() }
        porPisteiro[k].valor += d.valor; porPisteiro[k].animais += d.animais; porPisteiro[k].clientes.add(p.nome)
    }
    console.log(`\nPOR ASSESSOR (pisteiro do lote):`)
    for (const [k, v] of Object.entries(porPisteiro).sort((a, b) => b[1].valor - a[1].valor)) {
        console.log(`  ${k.slice(0, 34).padEnd(34)} ${String(v.clientes.size).padStart(2)} cliente(s) | ${String(v.animais).padStart(3)} animais | ${brl(v.valor)}`)
    }

    fs.writeFileSync(path.join(DIR, 'atribuicao-campanha-2026.json'), JSON.stringify({
        geradoEm: new Date().toISOString().slice(0, 10),
        regra: 'lead de campanha (planilha+CRM, sem importação em massa) × compra no ERP em QUALQUER filial, posterior à data de entrada do lead',
        leadsRegistros: leads.length, leadsPessoas: pessoas.length,
        clientes: PROVA.length, animais: ANIMAIS, vgv: VGV,
        aConfirmar: { clientes: REVISAR.length, animais: bichos(REVISAR), vgv: soma(REVISAR) },
        porFilial, jaEramClientes: compraramAntes.length,
        porPisteiro: Object.fromEntries(Object.entries(porPisteiro).map(([k, v]) => [k, { valor: Math.round(v.valor * 100) / 100, animais: v.animais, clientes: v.clientes.size }])),
        comprovados: PROVA, aRevisar: REVISAR, compraramAntes, descartados,
    }, null, 1))
    console.log('\ngravado em outputs/base-clientes-2026/atribuicao-campanha-2026.json')
} finally { db.detach() }
