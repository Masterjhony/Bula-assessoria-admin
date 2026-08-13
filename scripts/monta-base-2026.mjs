/**
 * MONTAGEM da base de clientes 2026 e do funil, a partir dos JSONs que
 * scripts/extrai-fontes-2026.mjs deixou em outputs/base-clientes-2026/fontes/.
 *
 *   node scripts/extrai-fontes-2026.mjs && node scripts/monta-base-2026.mjs
 *
 * Saídas (outputs/base-clientes-2026/):
 *   base-clientes.json  — um registro por comprador de 2026, já enriquecido
 *   funil.json          — o funil de captação jun–ago e o universo de leilões
 *
 * As regras que decidem o que entra estão em scripts/lib/base-clientes-2026.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    Identidades, casaLeiloes, carrega, docKey, foneKey, nomeNorm, semAcento,
} from './lib/base-clientes-2026.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const F = path.join(DIR, 'fontes')

const hpCompras = carrega(F, 'hp-compras-2026')
const hpClientes = carrega(F, 'hp-clientes')
const hpFazendas = carrega(F, 'hp-fazendas')
const hpPisteiros = carrega(F, 'hp-pisteiros')
const hpCidades = carrega(F, 'hp-cidades')
const pgClientes = carrega(F, 'pg-clientes')
const pgLeads = carrega(F, 'pg-crm-leads')
const pgFech = carrega(F, 'pg-fechamentos')
const pgVendas = carrega(F, 'pg-vendas-lances')
const pgCadastro = carrega(F, 'pg-cadastro-leiloeira')
const pgAtend = carrega(F, 'pg-atendimento')
const planilha = JSON.parse(fs.readFileSync(path.join(F, 'planilha-leads.json'), 'utf8'))

const NOME_PISTEIRO = new Map(hpPisteiros.map(p => [String(p.pre_codigo).trim(), p.pre_nome]))
const CIDADE = new Map(hpCidades.map(c => [String(c.cid_codigo).trim(), { nome: c.cid_municipio, uf: c.cid_uf }]))

/* ── categoria: o ERP não tipifica o lote, então lê-se o nome do leilão ───── */

/**
 * "TOUROS", "MATRIZES", "BEZERRAS" e afins estão no título do evento e é a
 * única pista sistemática — LOT_TIPO é 'E' em 100% dos lotes e LOT_ESPECIE é
 * 'BOVINOS'. Um leilão misto devolve mais de uma categoria, de propósito.
 */
export function categoriasDoLeilao(nome) {
    const s = semAcento(nome).toUpperCase()
    const c = new Set()
    if (/\bTOUROS?\b|REPRODUTOR/.test(s)) c.add('Touros')
    if (/\bMATRIZ(ES)?\b|\bFEMEAS?\b|\bPRENHE/.test(s)) c.add('Matrizes')
    if (/\bBEZERR/.test(s)) c.add('Bezerras')
    if (/\bEMBRI/.test(s)) c.add('Embriões')
    if (/\bNOVILHA/.test(s)) c.add('Novilhas')
    if (/EQUINO|MANGALARGA|QUARTO DE MILHA/.test(s)) c.add('Equinos')
    return [...c]
}

/* ── 1. universo de leilões: HastaPro FIL '2' ∪ fechamentos sem par ───────── */

const comprasBula = hpCompras.filter(r => r.fil === '2')
const leiloesHpMap = new Map()
for (const r of comprasBula) {
    if (!leiloesHpMap.has(r.lei)) leiloesHpMap.set(r.lei, { id: r.lei, nome: r.lei_nome, data: r.lei_data, uf: r.lei_uf, vgv: 0, lotes: 0 })
    const l = leiloesHpMap.get(r.lei)
    // COP_PORCENTAGEM rateia o lote entre compradores (há lotes 50/50).
    l.vgv += (r.lot_total || 0) * ((r.cop_porcentagem ?? 100) / 100)
    l.lotes++
}
// arredonda o rateio para não arrastar centavo de ponto flutuante
for (const l of leiloesHpMap.values()) l.vgv = Math.round(l.vgv * 100) / 100
const leiloesHp = [...leiloesHpMap.values()]

const fechamentos = pgFech.map(f => ({
    id: f.id, nome: f.nome, data: String(f.data).slice(0, 10),
    vgv: Number(f.vgv_total) || 0, origem: f.origem, compradores: f.compradores || [],
}))
const { par, soFechamento } = casaLeiloes(leiloesHp, fechamentos)

const universo = [
    ...leiloesHp.map(l => ({ ...l, fonte: 'hastapro', fechamento: par.get(l.id)?.sb?.id ?? null })),
    ...soFechamento.map(s => ({ id: s.id, nome: s.nome, data: s.data, uf: null, vgv: s.vgv, lotes: null, fonte: 'fechamento', fechamento: s.id })),
].sort((a, b) => a.data.localeCompare(b.data))

const VGV_TOTAL = Math.round(universo.reduce((a, l) => a + l.vgv, 0) * 100) / 100

/* ── 2. compras por pessoa ────────────────────────────────────────────────── */

/** Uma compra normalizada, venha de onde vier. */
const compras = []

// A. HastaPro FIL '2' — lote a lote, com rateio de percentual.
for (const r of comprasBula) {
    compras.push({
        fonte: 'hastapro',
        leilaoId: r.lei, leilao: r.lei_nome, data: r.lei_data,
        valor: Math.round((r.lot_total || 0) * ((r.cop_porcentagem ?? 100) / 100) * 100) / 100,
        animais: r.lot_qtd || 0, lotes: 1,
        categorias: categoriasDoLeilao(r.lei_nome),
        assessor: NOME_PISTEIRO.get(String(r.lot_pisteiro || '').trim()) || null,
        chaveCliente: `hp:${r.cli_codigo}`,
        nome: r.cli_razaosocial && r.cli_razaosocial !== r.cli_nome ? `${r.cli_nome} (${r.cli_razaosocial})` : r.cli_nome,
        nomeBusca: r.cli_nome,
        cpf: r.cli_cpfcnpj, uf: r.cli_uf,
        cidade: CIDADE.get(String(r.cli_cid_codigo || '').trim())?.nome || null,
        fone: r.cli_celular || r.cli_fonecom1 || r.cli_foneres || null,
        email: r.cli_email || null,
    })
}

// Quais fechamentos JÁ estão cobertos pelo HastaPro — para não contar de novo.
const fechCoberto = new Set([...par.values()].map(v => v.sb.id))
const leilaoSoFech = new Map(soFechamento.map(s => [s.id, s]))

/** Casa "Nelore Mafra" (carteira) com "LEILÃO NELORE MAFRA ... 2026" (universo). */
const STOPL = new Set(['leilao', 'virtual', 'de', 'do', 'da', 'das', 'dos', 'edicao', 'etapa', 'mega', 'evento', 'especial', 'anos', '2026', 'dia'])
const tokL = s => new Set(semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).map(x => x.toLowerCase()).filter(x => x.length >= 2 && !STOPL.has(x) && !/^\d+[oa]?$/.test(x)))
function achaLeilao(nome, data) {
    const t = tokL(nome)
    let melhor = null, sc = 0
    for (const l of universo) {
        if (data && Math.abs(new Date(data) - new Date(l.data)) / 86400000 > 3) continue
        const b = tokL(l.nome)
        const i = [...t].filter(x => b.has(x)).length
        const j = i / Math.min(t.size, b.size) || 0
        if (j > sc) { sc = j; melhor = l }
    }
    return sc >= 0.5 ? melhor : null
}

// B. carteira dos assessores (clientes.compras_manuais) — só para leilão que
//    NÃO está no HastaPro, senão a mesma venda entra duas vezes.
for (const c of pgClientes) {
    for (const x of (c.compras_manuais || [])) {
        const l = achaLeilao(x.leilao || '', x.data)
        if (l && l.fonte === 'hastapro') continue          // já contado em A
        compras.push({
            fonte: 'carteira',
            leilaoId: l?.id ?? null, leilao: x.leilao || null, data: x.data || null,
            valor: Number(x.valor) || 0, animais: Number(x.cabecas) || 0, lotes: 1,
            categorias: x.categoria && x.categoria !== 'Leilões' ? [x.categoria] : categoriasDoLeilao(x.leilao || ''),
            assessor: c.responsavel || null,
            chaveCliente: `pg:${c.id}`,
            nome: c.nome, nomeBusca: c.nome,
            cpf: c.cpf, uf: c.uf, cidade: c.cidade,
            fone: c.telefone, email: c.email,
        })
    }
}

// C. pódio dos fechamentos sem par no ERP — pega o comprador grande que ficou
//    de fora do ERP. Só entra se aquele comprador ainda não veio de B.
const jaTem = new Set(compras.filter(c => c.fonte === 'carteira').map(c => `${c.leilaoId}|${nomeNorm(c.nomeBusca)}`))
for (const s of soFechamento) {
    for (const c of (s.compradores || [])) {
        const nome = String(c.comprador || '').trim()
        if (!nome || /^(a identificar|a definir|nao identificado)$/i.test(nome)) continue
        if (jaTem.has(`${s.id}|${nomeNorm(nome)}`)) continue
        compras.push({
            fonte: 'podio-fechamento',
            leilaoId: s.id, leilao: s.nome, data: s.data,
            valor: Number(c.vgv) || 0, animais: Number(c.animais) || 0, lotes: Number(c.lotes) || 1,
            categorias: categoriasDoLeilao(s.nome),
            assessor: null,
            chaveCliente: null,
            nome, nomeBusca: nome,
            cpf: null, uf: c.uf || null, cidade: c.cidade || null,
            fone: null, email: null,
        })
    }
}

/* ── 3. consolidação por pessoa ───────────────────────────────────────────── */

/**
 * Agrupa as compras por pessoa. Chave forte primeiro (CPF, telefone), depois
 * nome — o índice recusa nome ambíguo, então um homônimo vira duas linhas em
 * vez de fundir dois produtores numa pessoa só.
 */
const idx = new Identidades()
const pessoas = []
function pessoaDe(c) {
    const achou = idx.busca({ doc: c.cpf, fone: c.fone, nome: c.nomeBusca })
    if (achou) return achou.registro
    const p = {
        nome: c.nome, nomesAlt: new Set([c.nome]),
        cpf: docKey(c.cpf) || '', fone: c.fone || '', email: c.email || '',
        cidade: c.cidade || '', uf: c.uf || '',
        compras: [], fontes: new Set(), assessores: new Set(), categorias: new Set(),
        chaves: new Set(),
    }
    pessoas.push(p)
    idx.add(p, { doc: c.cpf, fone: c.fone, nome: c.nomeBusca })
    return p
}
for (const c of compras) {
    const p = pessoaDe(c)
    p.compras.push(c)
    p.fontes.add(c.fonte)
    p.nomesAlt.add(c.nome)
    if (c.assessor) p.assessores.add(c.assessor)
    for (const k of c.categorias) p.categorias.add(k)
    if (c.chaveCliente) p.chaves.add(c.chaveCliente)
    // preenche o que estiver vazio (a primeira fonte que souber, ganha)
    if (!p.cpf && docKey(c.cpf)) { p.cpf = docKey(c.cpf); idx.add(p, { doc: c.cpf }) }
    if (!p.fone && foneKey(c.fone)) { p.fone = c.fone; idx.add(p, { fone: c.fone }) }
    if (!p.email && c.email) p.email = c.email
    if (!p.cidade && c.cidade) p.cidade = c.cidade
    if (!p.uf && c.uf) p.uf = c.uf
}

/* ── 4. enriquecimento ────────────────────────────────────────────────────── */

/**
 * Um índice POR FONTE, e não um índice só. Com um índice único a busca para no
 * primeiro acerto — e como o ERP tem 2.664 fichas, ele vencia sempre; o CRM e a
 * planilha (os únicos que sabem origem de campanha e score) nunca eram lidos, e
 * a base saía dizendo que nenhum comprador veio de campanha. Aqui cada fonte é
 * consultada e o resultado é mesclado, na ordem de confiança do campo.
 */
const enriquecedores = []
function fonteEnr(src) { const i = new Identidades(); enriquecedores.push({ src, idx: i }); return i }

/**
 * Exportações do ERP por assessor (Desktop/BASE CLIENTES/*.csv, 13/08/2026).
 * Entram PRIMEIRO porque são o recorte já curado da equipe e trazem o que falta
 * no resto: fazenda, Inscrição Estadual e contato do titular. O VALOR delas é
 * ignorado de propósito — o recorte por assessor não soma o total do comprador
 * (Diego Batista aparece com R$ 1,11 mi na lista do Fábio e compra R$ 1,82 mi
 * no ano somando os outros pisteiros), então misturar os dois infla ou corta.
 */
function leCsv(txt) {
    const linhas = []
    let campo = '', reg = [], aspas = false
    txt = txt.replace(/^﻿/, '')
    for (let i = 0; i < txt.length; i++) {
        const ch = txt[i]
        if (aspas) { if (ch === '"') { if (txt[i + 1] === '"') { campo += '"'; i++ } else aspas = false } else campo += ch }
        else if (ch === '"') aspas = true
        else if (ch === ',') { reg.push(campo); campo = '' }
        else if (ch === '\n') { reg.push(campo); linhas.push(reg); reg = []; campo = '' }
        else if (ch !== '\r') campo += ch
    }
    if (campo || reg.length) { reg.push(campo); linhas.push(reg) }
    return linhas
}
const enrAssessor = fonteEnr('erp-assessor')
for (const [assessor, arq] of [['Douglas Bispo', 'douglas'], ['Fábio Omena', 'fabio'], ['Leonardo Serafim', 'leo']]) {
    const p = path.join(F, `${arq}.csv`)
    if (!fs.existsSync(p)) continue
    const linhas = leCsv(fs.readFileSync(p, 'utf8'))
    const head = linhas[0]
    for (const l of linhas.slice(1)) {
        const r = Object.fromEntries(head.map((h, i) => [h, (l[i] ?? '').trim()]))
        if (!r.CLI_NOME) continue
        enrAssessor.add({
            email: r.CLI_EMAIL, fone: r.CLI_CELULAR || r.FAZ_FONE, uf: r.FAZ_UF,
            cidade: CIDADE.get(String(r.FAZ_CID_CODIGO || '').trim())?.nome,
            ie: r.FAZ_INSCRICAO, fazenda: r.FAZ_NOME, responsavel: assessor,
        }, { fone: r.CLI_CELULAR || r.FAZ_FONE, nome: r.CLI_NOME })
    }
}

const enrErp = fonteEnr('erp')
for (const c of hpClientes) {
    enrErp.add({ cpf: c.cli_cpfcnpj, fone: c.cli_celular || c.cli_fonecom1 || c.cli_foneres, email: c.cli_email || c.cli_email1, uf: c.cli_uf, cidade: CIDADE.get(String(c.cli_cid_codigo || '').trim())?.nome, ie: c.cli_rginscricao },
        { doc: c.cli_cpfcnpj, fone: c.cli_celular || c.cli_fonecom1 || c.cli_foneres, nome: c.cli_nome })
}
const enrCli = fonteEnr('clientes')
for (const c of pgClientes) {
    enrCli.add({ cpf: c.cpf, fone: c.telefone, email: c.email, uf: c.uf, cidade: c.cidade, ie: c.inscricao_estadual, score: c.score_credito, scoreFaixa: c.score_faixa, momento: c.momento_pecuaria, operacao: c.operacao_pecuaria, prefs: c.preferencias_categorias, responsavel: c.responsavel },
        { doc: c.cpf, fone: c.telefone, nome: c.nome })
}
const enrCrm = fonteEnr('crm')
for (const l of pgLeads) {
    enrCrm.add({ cpf: l.cpf, fone: l.telefone || l.celular, email: l.email, uf: l.estado, cidade: l.cidade, ie: l.inscricao_estadual, score: l.score_serasa, momento: l.momento_pecuaria, operacao: l.operacao_pecuaria, interesse: l.interesse || l.interesse_principal, origemLead: l.origem, campanha: l.campaign, cabecas: l.quantidade_animais, leadId: l.id, dataLead: String(l.data_entrada || l.created_at || '').slice(0, 10) },
        { doc: l.cpf, fone: l.telefone || l.celular, nome: l.nome })
}
// fazendas do ERP: telefone e IE que não estão na ficha do cliente
const fazPorCli = new Map()
for (const f of hpFazendas) {
    if (!fazPorCli.has(f.cli_codigo)) fazPorCli.set(f.cli_codigo, [])
    fazPorCli.get(f.cli_codigo).push(f)
}
// vendas do parser de lances: fazenda/cidade/uf/assessor (nunca dinheiro)
const enrLances = fonteEnr('lances')
for (const v of pgVendas) {
    if (!v.comprador) continue
    enrLances.add({ uf: v.uf, cidade: v.cidade, fazenda: v.fazenda, responsavel: v.assessor }, { nome: v.comprador })
}
// planilha de leads: o formulário da campanha é a melhor fonte de preferência
const abaObj = aba => { const { head, rows } = planilha[aba]; return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) }
const leadsPlanilha = abaObj('LEADS GERAIS')
const enrPlan = fonteEnr('planilha')
for (const l of leadsPlanilha) {
    enrPlan.add({ fone: l['WhatsApp'], email: l['E-mail'], uf: l['UF'], cidade: l['Cidade'], ie: l['Inscrição Estadual'], momento: l['Momento'], cabecas: l['Cabeças'], interesse: l['Interesse'], qtdDesejada: l['Qtd. desejada'], origemLead: l['Origem'], campanha: l['campaign_name'] || l['utm_campaign'], dataLead: l['Data'] },
        { fone: l['WhatsApp'], nome: l['Nome'] })
}

// cadastro em leiloeira, por cliente_key (nome normalizado minúsculo)
const cadastroPorChave = new Map()
for (const c of pgCadastro) {
    const k = String(c.cliente_key || '').toLowerCase().trim()
    if (!cadastroPorChave.has(k)) cadastroPorChave.set(k, [])
    cadastroPorChave.get(k).push(c)
}
// atendimento: quem foi abordado pela API oficial e se respondeu
const atendPorFone = new Map(pgAtend.map(a => [a.k, a]))

for (const p of pessoas) {
    // consulta TODAS as fontes e mescla; a primeira que souber um campo, ganha
    const casados = []
    for (const { src, idx: ix } of enriquecedores) {
        const r = ix.busca({ doc: p.cpf, fone: p.fone, nome: p.nome })
        if (r) casados.push({ src, via: r.via, ...r.registro })
    }
    p.enriquecidoPor = casados.map(c => c.src).join('+')
    const primeiro = (campo) => { for (const c of casados) if (c[campo] != null && String(c[campo]).trim() !== '') return c[campo]; return null }
    if (!p.cpf) { const v = primeiro('cpf'); if (docKey(v)) p.cpf = docKey(v) }
    if (!p.fone) { const v = primeiro('fone'); if (v) p.fone = v }
    if (!p.email) p.email = primeiro('email') || p.email
    if (!p.cidade) p.cidade = primeiro('cidade') || p.cidade
    if (!p.uf) p.uf = primeiro('uf') || p.uf
    p.ie = primeiro('ie')
    p.score = primeiro('score')
    p.scoreFaixa = primeiro('scoreFaixa')
    p.momento = primeiro('momento')
    p.operacao = primeiro('operacao')
    p.interesse = primeiro('interesse')
    p.cabecas = primeiro('cabecas')
    // ORIGEM: a pessoa costuma estar em mais de uma base — na lista fria de 13
    // mil contatos E no formulário da campanha. Pegar "a primeira que souber"
    // devolvia a lista fria e escondia a campanha, jogando a conversão para
    // baixo. Aqui a origem de CAMPANHA tem preferência, e só na falta dela
    // entram as outras.
    {
        const comOrigem = casados.filter(c => c.origemLead || c.campanha)
        const deCampanha = comOrigem.find(c => classificaOrigem(c.origemLead, c.campanha) === 'campanha')
        const escolhido = deCampanha || comOrigem[0] || null
        p.origemLead = escolhido?.origemLead || null
        p.campanha = escolhido?.campanha || null
        p.dataLead = escolhido?.dataLead || primeiro('dataLead')
    }
    p.veioDoFunil = casados.some(c => c.src === 'crm' || c.src === 'planilha')
    {
        const resp = primeiro('responsavel')
        if (resp && !p.assessores.size) p.assessores.add(resp)
        for (const c of casados) if (Array.isArray(c.prefs)) for (const x of c.prefs) p.categorias.add(x)
        const fz = primeiro('fazenda'); if (fz) p.fazenda = fz
    }
    // fazenda do ERP (quando a pessoa veio do ERP)
    const chaveHp = [...p.chaves].find(k => k.startsWith('hp:'))
    if (chaveHp) {
        const fz = (fazPorCli.get(chaveHp.slice(3)) || [])[0]
        if (fz) {
            p.fazenda = fz.faz_nome || null
            if (!p.uf && fz.faz_uf) p.uf = fz.faz_uf
            if (!p.fone && fz.faz_fone) p.fone = fz.faz_fone
            if (!p.ie && fz.faz_inscricao) p.ie = fz.faz_inscricao
        }
    }
    const cad = cadastroPorChave.get(nomeNorm(p.nome).toLowerCase()) || []
    p.cadastroLeiloeira = cad.length ? [...new Set(cad.map(c => c.status))].join('/') : null
    const at = atendPorFone.get(foneKey(p.fone))
    p.abordadoWhatsapp = !!at
    p.respondeuWhatsapp = at ? !!at.respondeu : null
}

/* ── 4b. classificação da origem e prova de causalidade ───────────────────── */

/**
 * Nem toda "origem" é campanha. A base tem 13.064 contatos importados de
 * planilha antiga e 1.648 extraídos da agenda do WhatsApp — se isso contar como
 * campanha, o relatório atribui à mídia paga vendas de gente que a Bula já
 * conhecia há anos. Só o que veio de formulário/landing/anúncio é campanha.
 */
export function classificaOrigem(origem, campanha) {
    const o = semAcento(String(origem || '')).toLowerCase()
    const c = semAcento(String(campanha || '')).toLowerCase()
    if (/base unificada|lista antiga|contatos whatsapp/.test(o)) return 'base-fria'
    if (/^meta|landing|forms inst|perpetuo|sao geraldo|jmp/.test(o)) return 'campanha'
    if (/planilha .*meta|leads bula/.test(o)) return 'campanha'
    if (/^(ca -|leads -|leilao jmp|\d{15,})/.test(c)) return 'campanha'
    if (/instagram/.test(o)) return 'organico'
    if (/whatsapp-central|habilitacao|indicacao/.test(o)) return 'direto'
    return origem ? 'outro' : ''
}

/** dd/mm/aaaa, hh:mm (planilha) ou ISO (CRM) → 'aaaa-mm-dd'. */
function dataLeadISO(v) {
    const s = String(v || '')
    const br = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (br) return `${br[3]}-${br[2]}-${br[1]}`
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
    return iso ? iso[1] : ''
}

/**
 * A campanha só pode levar o crédito por uma venda que aconteceu DEPOIS de o
 * lead entrar. Sem esta trava, um comprador antigo que preencheu um formulário
 * em agosto apareceria como "venda gerada pela campanha" numa compra de maio.
 */
for (const p of pessoas) {
    p.origemClasse = classificaOrigem(p.origemLead, p.campanha)
    const dl = dataLeadISO(p.dataLead)
    const datas = p.compras.map(c => c.data).filter(Boolean).sort()
    p.dataLeadISO = dl
    p.comprasAposLead = dl ? datas.filter(d => d >= dl).length : 0
    p.atribuivelCampanha = p.origemClasse === 'campanha' && !!dl && p.comprasAposLead > 0
    p.valorAposLead = dl
        ? Math.round(p.compras.filter(c => c.data && c.data >= dl).reduce((a, c) => a + c.valor, 0) * 100) / 100
        : 0
}

/* ── 5. números finais por pessoa ─────────────────────────────────────────── */

const base = pessoas.map(p => {
    const datas = p.compras.map(c => c.data).filter(Boolean).sort()
    const valor = Math.round(p.compras.reduce((a, c) => a + c.valor, 0) * 100) / 100
    const leiloes = new Set(p.compras.map(c => c.leilaoId || c.leilao)).size
    return {
        nome: p.nome,
        cpf: p.cpf || '',
        telefone: p.fone || '',
        email: p.email || '',
        cidade: p.cidade || '',
        uf: p.uf || '',
        fazenda: p.fazenda || '',
        inscricaoEstadual: p.ie || '',
        score: p.score ?? '',
        scoreFaixa: p.scoreFaixa || '',
        volumeCompra: valor,
        lotes: p.compras.reduce((a, c) => a + (c.lotes || 0), 0),
        animais: p.compras.reduce((a, c) => a + (c.animais || 0), 0),
        leiloes,
        ticketMedio: leiloes ? Math.round(valor / p.compras.length * 100) / 100 : 0,
        primeiraCompra: datas[0] || '',
        ultimaCompra: datas[datas.length - 1] || '',
        recorrente: leiloes > 1,
        categorias: [...p.categorias].join(', '),
        momentoPecuaria: p.momento || '',
        operacaoPecuaria: p.operacao || '',
        interesseDeclarado: p.interesse || '',
        rebanhoDeclarado: p.cabecas || '',
        assessor: [...p.assessores].join(', '),
        origemLead: p.origemLead || '',
        campanha: p.campanha || '',
        cadastroLeiloeira: p.cadastroLeiloeira || '',
        abordadoWhatsapp: p.abordadoWhatsapp,
        respondeuWhatsapp: p.respondeuWhatsapp,
        veioDoFunil: !!p.veioDoFunil,
        origemClasse: p.origemClasse || '',
        atribuivelCampanha: !!p.atribuivelCampanha,
        valorAposEntradaDoLead: p.valorAposLead || 0,
        dataEntradaLead: p.dataLead || '',
        fonteCompra: [...p.fontes].join('+'),
        enriquecidoPor: p.enriquecidoPor || '',
        nomesAlternativos: [...p.nomesAlt].filter(n => n !== p.nome).join(' | '),
    }
}).sort((a, b) => b.volumeCompra - a.volumeCompra)

fs.mkdirSync(DIR, { recursive: true })
fs.writeFileSync(path.join(DIR, 'base-clientes.json'), JSON.stringify(base, null, 1))
fs.writeFileSync(path.join(DIR, 'leiloes-2026.json'), JSON.stringify(universo, null, 1))

// Detalhe compra a compra, com o nome JÁ consolidado — é por aqui que se
// confere qualquer total da base sem precisar reabrir o Firebird.
const detalhe = []
for (const p of pessoas) {
    for (const c of p.compras) {
        detalhe.push({
            cliente: p.nome, data: c.data, leilao: c.leilao, lotes: c.lotes,
            animais: c.animais, valor: c.valor, categorias: c.categorias,
            assessor: c.assessor, fonte: c.fonte,
        })
    }
}
detalhe.sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.cliente.localeCompare(b.cliente))
fs.writeFileSync(path.join(DIR, 'compras-2026.json'), JSON.stringify(detalhe, null, 1))

/* ── resumo no terminal ───────────────────────────────────────────────────── */

const somaBase = Math.round(base.reduce((a, p) => a + p.volumeCompra, 0) * 100) / 100
const compl = f => base.filter(p => String(p[f] ?? '').trim() !== '').length
console.log('LEILÕES 2026 (cobertura Bula)')
console.log('  universo:', universo.length, '| do ERP:', universo.filter(l => l.fonte === 'hastapro').length, '| só fechamento:', universo.filter(l => l.fonte === 'fechamento').length)
console.log('  VGV:', VGV_TOTAL.toLocaleString('pt-BR'))
console.log('\nCLIENTES 2026')
console.log('  pessoas:', base.length, '| volume somado:', somaBase.toLocaleString('pt-BR'))
console.log('  recorrentes (2+ leilões):', base.filter(p => p.recorrente).length)
console.log('\nCOMPLETUDE')
for (const f of ['cpf', 'telefone', 'email', 'cidade', 'uf', 'inscricaoEstadual', 'score', 'categorias', 'assessor'])
    console.log(`  ${f.padEnd(20)} ${String(compl(f)).padStart(4)}  ${(compl(f) * 100 / base.length).toFixed(0)}%`)
console.log('\nfonte da compra:', JSON.stringify(base.reduce((a, p) => (a[p.fonteCompra] = (a[p.fonteCompra] || 0) + 1, a), {})))
console.log('gravado em', path.relative(ROOT, DIR))
