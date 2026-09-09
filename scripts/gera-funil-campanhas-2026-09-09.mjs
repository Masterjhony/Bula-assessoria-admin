/**
 * FUNIL DAS CAMPANHAS ATIVAS — 15/08 a 09/09/2026.
 *
 *   node scripts/gera-funil-campanhas-2026-09-09.mjs [pasta-de-saida]
 *
 * Pedido do chefe (09/09): "relatório sobre as campanhas que estavam ativas da
 * segunda quinzena de agosto pra cá, com o resultado detalhado, na forma de
 * funil". Sai um PDF de oito páginas na Área de Trabalho, mais o XLSX nominal.
 *
 * RÉGUA — a mesma dos quadros anteriores, para poderem ser lidos lado a lado:
 *   • LEADS = pessoas distintas (dedup por telefone, senão e-mail, senão nome)
 *     que entraram na planilha dentro da janela. A planilha é lida AO VIVO.
 *   • Atribuição de campanha: `campaign_id` manda (o NOME muda sozinho — a do
 *     Jacamim carrega um contador no próprio nome). Lead de landing não tem
 *     campaign_id: cai no `utm_medium`, que é onde a landing grava o nome da
 *     CAMPANHA (o utm_campaign guarda o nome do CONJUNTO).
 *   • MQL = 100+ cabeças E com inscrição estadual.
 *   • CADASTROS = ficha que foi ao grupo da leiloeira dentro da janela, com a
 *     pessoa casada contra o universo de leads por CPF, telefone ou nome
 *     (scripts/lib/origem-cadastros-2026.mjs). Fonte das fichas: a varredura de
 *     08/09 dos dois grupos, lida mensagem a mensagem com os anexos abertos.
 *   • CLIENTES = quem comprou, cruzado contra o universo. Cinco fontes: ERP
 *     HastaPro (as duas filiais), fechamentos, lance cantado no grupo, compra
 *     manual do assessor e a base de clientes.
 *
 * DUAS COISAS QUE MUDAM A LEITURA DESTA JANELA:
 *   1. O ERP só tem leilão até 30/08. Setembro inteiro ainda não desceu do
 *      HastaPro — a compra de 05/09 existe só como lance cantado no grupo, e
 *      ali o valor é a PARCELA, não o VGV. Por isso o VGV de setembro sai
 *      marcado como provisório (parcela × 30, a régua da casa).
 *   2. A conta CA1 (divulgação de leilão da agência) também gastou na janela,
 *      mas ela NÃO é o funil de cadastros: é serviço vendido para leiloeira.
 *      Entra em quadro separado, sem funil, e com um achado: a campanha do
 *      Encontro de Boiadeiros gerou 21 leads que não chegam na planilha.
 *
 * ONDE A CONTA DE "ACESSOS" QUEBROU. As metas de 75% (acesso÷clique) e 12%
 * (lead÷acesso) do quadro do chefe nasceram quando o anúncio levava ao site.
 * Nesta janela 96% dos leads vieram de FORMULÁRIO INSTANTÂNEO, que abre dentro
 * do app e nunca gera acesso. Então: acesso é medido contra os CLIQUES DE
 * SAÍDA (o universo a que a meta de 75% de fato se aplica) e a meta de 12% vai
 * marcada como não comparável, em vez de ganhar um ▲ que não significa nada.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { FICHAS } from './lib/varredura-cadastros-2026-09.mjs'
import { nomeNorm, foneKey, soDigitos, indexaUniverso, casaNoUniverso, ehMidia } from './lib/origem-cadastros-2026.mjs'
import { novoWorkbook, novaAba, cabecalho, bloco as blocoXlsx, tabela, MOEDA_RS, INT, PCT } from './lib/xlsx-brand.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'outputs', 'funil-campanhas-2026-09-09')
const MESA = process.argv[2] || path.join(os.homedir(), 'Desktop')
fs.mkdirSync(OUT, { recursive: true })

const DE = '2026-08-15', ATE = '2026-09-09'
const HOJE = '09/09/2026'
const DIAS = 26

/* ══ metas do quadro "META FUNIL DE VENDAS MENSAL" ═══════════════════════ */
const METAS = {
    investido: 6500, impressoes: 650000, cliques: 7800, acessos: 5850, leads: 702,
    mqls: 140.4, cadastros: 56.16, aprovados: 33.696, clientes: 13.5,
    ctr: 0.012, acessoSaida: 0.75, mqlLead: 0.20, cadastroMql: 0.40, aprovadoCadastro: 0.60, clienteAprovado: 0.40,
    cpl: 9.26, cpmql: 46.30, custoCadastro: 115.74, custoVenda: 160.75,
}

/* ══ 1. mídia ════════════════════════════════════════════════════════════ */
const M = JSON.parse(fs.readFileSync(path.join(OUT, 'meta-janela.json'), 'utf8'))
const MIDIA = Object.fromEntries(M.ca2.map(c => [c.campanha, c]))
const ORDEM = M.ca2.map(c => c.campanha)

/* ══ 2. leads, ao vivo da planilha ═══════════════════════════════════════ */
const P = JSON.parse(fs.readFileSync(path.join(OUT, 'planilha-leads-live.json'), 'utf8'))
const G = P.abas['LEADS GERAIS'], hG = G[0]
const iso = d => { const m = String(d).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : '' }
const TODOS = G.slice(1).map(r => Object.fromEntries(hG.map((k, i) => [k, r[i] ?? ''])))
const ehTeste = r => /teste|test lead|dummy/i.test(String(r['Nome'] || '')) || /dummy/i.test(String(r['UF'] || ''))

const PORID = Object.fromEntries(M.ca2.map(c => [c.id, c.campanha]))
const PORUTM = { 'LEAD - PERPETUO TOURO': 'PERPÉTUO TOURO', 'LEADS - PERPETUO FEMEAS': 'PERPÉTUO FÊMEAS' }
const ORGANICO = 'ORGÂNICO / DIRETO'
function campanhaDe(r) {
    const id = String(r['campaign_id'] || '').trim()
    if (PORID[id]) return PORID[id]
    const um = String(r['utm_medium'] || '').trim()
    if (PORUTM[um]) return PORUTM[um]
    const cn = String(r['campaign_name'] || '').trim()
    if (/PERPETUO TOURO/i.test(cn)) return 'PERPÉTUO TOURO'
    if (/PERPETUO.?FEMEAS/i.test(cn)) return 'PERPÉTUO FÊMEAS'
    return ORGANICO
}
const ehInstantaneo = r => /^Meta —/.test(String(r['Origem']))
const PISO = { '1 a 50 cabeças': 1, '51 a 100 cabeças': 51, '101 a 300 cabeças': 101, '301 a 500 cabeças': 301, 'mais de 500 cabeças': 501, '1 a 99 cabeças': 1, '100 a 500 cabeças': 100, '501 a 1000 cabeças': 501, 'mais de 1000 cabeças': 1001, 'nenhuma': 0, '100-300': 100 }
const ehMql = r => (PISO[String(r['Cabeças'] || '').trim()] ?? -1) >= 100 && /^sim$/i.test(String(r['Inscrição Estadual'] || '').trim())

const naJanela = TODOS.filter(r => { const d = iso(r['Data']); return d >= DE && d <= ATE })
const testes = naJanela.filter(ehTeste).length
const validos = naJanela.filter(r => !ehTeste(r))
const chave = r => foneKey(r['WhatsApp']) || nomeNorm(r['E-mail']) || nomeNorm(r['Nome'])
const dedup = new Map()
for (const r of validos) {
    const k = chave(r); if (!k) continue
    const a = dedup.get(k)
    if (!a || iso(r['Data']) < iso(a['Data'])) dedup.set(k, r)
}
const LEADS = [...dedup.values()]
const duplicados = validos.length - LEADS.length

const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '))
const ufTorta = LEADS.filter(r => !UFS.has(String(r['UF'] || '').trim().toUpperCase())).length

/* ══ 3. fichas de cadastro casadas contra o universo ═════════════════════ */
const idx = indexaUniverso(LEADS.map(r => ({
    nome: r['Nome'], fone: r['WhatsApp'], cpf: r['cpf'] || r['cpf_(brazil)'] || '',
    uf: r['UF'], origem: r['Origem'], data: iso(r['Data']), campanha: campanhaDe(r), mql: ehMql(r),
})))
const idxTudo = indexaUniverso(TODOS.filter(r => !ehTeste(r)).map(r => ({
    nome: r['Nome'], fone: r['WhatsApp'], cpf: r['cpf'] || r['cpf_(brazil)'] || '',
    uf: r['UF'], origem: r['Origem'], data: iso(r['Data']),
})))

const FICHAS_JANELA = FICHAS.filter(f => f.data >= DE && f.data <= ATE)
const CASADAS = [], FORA = []
for (const f of FICHAS_JANELA) {
    const a = casaNoUniverso(idx, { nome: f.nome, cpf: f.cpf, fone: f.tel || '', uf: f.uf })
    if (a) {
        const p = a.achados.find(x => x.campanha) || a.achados[0]
        CASADAS.push({ ...f, via: a.via, campanha: p.campanha, leadNome: p.nome, leadData: p.data, leadMql: p.mql })
    } else {
        const b = casaNoUniverso(idxTudo, { nome: f.nome, cpf: f.cpf, fone: f.tel || '', uf: f.uf })
        FORA.push({ ...f, leadAntigo: b ? b.achados[0] : null })
    }
}
const APROVADA = f => f.veredito === 'aprovado'
const COM_RESSALVA = f => f.veredito === 'aprovado' || f.veredito === 'ressalva'

/* ══ 4. compras ══════════════════════════════════════════════════════════ */
const F = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', 'conferencia-compras-cadastros-2026-09', 'fontes.json'), 'utf8'))
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const VENDAS = (await db.query(
    "select lote, comprador, valor, animais, assessor, uf, leilao_data, raw_text from bula_leilao_vendas where leilao_data between $1 and $2", [DE, ATE])).rows
const AGENDA = (await db.query(
    "select data, nome, leiloeira from bula_leiloes where data between $1 and $2 order by data", [DE, ATE])).rows
await db.end()

/** O pg devolve Date; sem isto o anexo imprime "Sat Sep 05 2026". */
const soData = d => d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10)
const dataBR = d => soData(d).split('-').reverse().join('/')
/**
 * O lance cantado guarda só a data, e o grupo "Lances Bula Assessoria" é um só
 * para todos os pregões — em 05/09 a agenda tem DOIS leilões. Desempata pelo
 * texto das mensagens do dia; se nenhum nome aparecer, devolve os dois.
 */
const GENERICO = new Set(['leilao', 'leilão', 'virtual', 'especial', 'convidados', 'especiais', 'edicao', 'shopping'])
function leilaoDoDia(d) {
    const dia = soData(d)
    const cands = AGENDA.filter(a => soData(a.data) === dia)
    if (cands.length <= 1) return (cands[0]?.nome || '').toUpperCase()
    const texto = VENDAS.filter(v => soData(v.leilao_data) === dia).map(v => v.raw_text || '').join(' ').toLowerCase()
    // "TOUROS JACAMIN" na agenda × "Jacamim" no grupo: compara pelo prefixo de
    // cinco letras, sem acento, senão a letra final derruba o casamento.
    const raiz = t => nomeNorm(t).slice(0, 5)
    const alvo = nomeNorm(texto)
    const pontua = a => [...new Set(nomeNorm(a.nome).split(' '))].filter(t => t.length >= 5 && !GENERICO.has(t)).filter(t => alvo.includes(raiz(t))).length
    const melhor = cands.map(a => ({ a, p: pontua(a) })).sort((x, y) => y.p - x.p)[0]
    return (melhor.p > 0 ? melhor.a.nome : cands.map(c => c.nome).join(' / ')).toUpperCase()
}

/** ERP: comprador em leilão da janela. O HastaPro só desceu até 30/08. */
const porComprador = new Map()
for (const c of F.hp.compras) {
    if (c.lei_data < DE || c.lei_data > ATE) continue
    const k = soDigitos(c.cli_cpfcnpj) || nomeNorm(c.cli_nome)
    if (!porComprador.has(k)) porComprador.set(k, { nome: c.cli_nome, cpf: c.cli_cpfcnpj, fone: c.cli_celular || c.cli_fonecom1 || c.cli_foneres, uf: c.cli_uf, linhas: [] })
    porComprador.get(k).linhas.push(c)
}
const ultimoErp = F.hp.compras.map(c => c.lei_data).sort().at(-1)
const vgvJanela = [...porComprador.values()].reduce((s, c) => s + c.linhas.reduce((t, x) => t + (+x.lot_total || 0), 0), 0)
const animaisJanela = [...porComprador.values()].reduce((s, c) => s + c.linhas.reduce((t, x) => t + (+x.lot_qtd || 0), 0), 0)

const CLIENTES = []
for (const c of porComprador.values()) {
    const a = casaNoUniverso(idx, c)
    if (!a) continue
    const p = a.achados.find(x => x.campanha) || a.achados[0]
    CLIENTES.push({
        nome: c.nome, campanha: p.campanha, leadData: p.data, via: a.via, fonte: 'ERP HastaPro',
        valor: c.linhas.reduce((s, x) => s + (+x.lot_total || 0), 0),
        animais: c.linhas.reduce((s, x) => s + (+x.lot_qtd || 0), 0),
        eventos: [...new Set(c.linhas.map(x => `${x.lei_data.split('-').reverse().join('/')} ${x.lei_nome}`))],
        provisorio: false,
    })
}
/** Lance cantado: cobre o que o ERP ainda não tem. Valor ali é a PARCELA. */
const porNome = new Map()
for (const v of VENDAS) {
    const bruto = String(v.comprador || '').replace(/^.*?-\s*/, '').trim()
    if (!bruto) continue
    const k = nomeNorm(bruto)
    if (!porNome.has(k)) porNome.set(k, { nome: bruto, uf: v.uf, linhas: [] })
    porNome.get(k).linhas.push(v)
}
for (const c of porNome.values()) {
    const a = casaNoUniverso(idx, { nome: c.nome, uf: c.uf })
    if (!a) continue
    const p = a.achados.find(x => x.campanha) || a.achados[0]
    if (CLIENTES.some(x => nomeNorm(x.nome) === nomeNorm(c.nome))) continue
    const parcela = c.linhas.reduce((s, x) => s + Number(x.valor || 0), 0)
    CLIENTES.push({
        nome: c.nome, campanha: p.campanha, leadData: p.data, via: a.via, fonte: 'lance cantado no grupo',
        valor: parcela * 30, animais: c.linhas.reduce((s, x) => s + (Number(x.animais) || 1), 0),
        eventos: [`${dataBR(c.linhas[0].leilao_data)} ${leilaoDoDia(c.linhas[0].leilao_data)} · lote${c.linhas.length > 1 ? 's' : ''} ${c.linhas.map(x => x.lote).join(', ')}`],
        parcela, provisorio: true,
    })
}
/* ══ 4b. A OUTRA RÉGUA: a aba CADASTROS da planilha ══════════════════════
 * O chefe conta cadastro pela linha da planilha, não pela ficha no grupo — e
 * pela planilha o período é MAIOR do que o funil de mídia mostra. As duas
 * réguas convivem no relatório porque medem coisas diferentes:
 *   • funil de mídia = ficha cuja pessoa é lead pago de campanha da janela;
 *   • planilha       = tudo que a operação de cadastro levou à leiloeira,
 *                      inclusive carteira de assessor, que não custou verba.
 * A data de cada linha vem da ficha correspondente nos grupos (a aba não tem
 * coluna de data); quando a ficha não é achada, cai na entrada do lead.
 */
const RES = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', 'conferencia-compras-cadastros-2026-09', 'resultado.json'), 'utf8'))
const idxFicha = indexaUniverso(FICHAS.map(f => ({ nome: f.nome, cpf: f.cpf, fone: f.tel, uf: f.uf, origem: 'ficha', data: f.data, _f: f })))
const PLANILHA = RES.filter(r => /agosto|setembro/i.test(r.mes || '')).map(r => {
    const pessoa = { nome: r.nome, cpf: r.cpf || r.cpfTxt, fone: r.tel, uf: r.uf }
    const af = casaNoUniverso(idxFicha, pessoa)
    const ficha = af?.achados?.[0]?._f || null
    const al = casaNoUniverso(idxTudo, pessoa)
    const lead = al?.achados?.find(x => ehMidia(x.origem)) || null
    const data = ficha?.data || (lead?.data || null)
    const compras = (r.provas || []).filter(p => p.data >= DE && p.data <= ATE)
    const erp = compras.filter(p => p.fonte === 'HastaPro')
    const lance = compras.filter(p => p.fonte === 'Lance no grupo')
    // O lance cantado guarda a PARCELA; sem o HastaPro, VGV = parcela × 30.
    const parcela = lance.reduce((s, p) => s + (VENDAS.find(v => String(v.lote) === String(p.lote) && soData(v.leilao_data) === p.data)?.valor ?? 0) * 1, 0)
    return {
        ...r, ficha, viaFicha: af?.via || null, lead, viaLead: al?.via || null, data,
        dentro: !!data && data >= DE && data <= ATE,
        comprouNaJanela: compras.length > 0,
        vgv: erp.reduce((s, p) => s + (p.valor || 0), 0) || (parcela * 30),
        animais: erp.reduce((s, p) => s + (p.animais || 0), 0) || lance.length,
        provisorio: !erp.length && !!lance.length, parcela,
        eventos: [...new Set(compras.map(p => `${dataBR(p.data)} ${p.evento === 'pregão (lance no grupo)' ? leilaoDoDia(p.data) : p.evento}`))],
        lotes: [...new Set(compras.map(p => p.lote))],
    }
})
const PL_JANELA = PLANILHA.filter(r => r.dentro)
const PL_MIDIA = PL_JANELA.filter(r => r.lead)
const PL_APROV = PL_JANELA.filter(r => r.ficha && APROVADA(r.ficha))
const PL_RESSALVA = PL_JANELA.filter(r => r.ficha && r.ficha.veredito === 'ressalva')
/** Quem COMPROU dentro da janela — a ficha pode ser de antes (Adriano e Farley). */
const PL_COMPRARAM = PLANILHA.filter(r => r.comprouNaJanela).sort((a, b) => b.vgv - a.vgv)
const PL_VGV = PL_COMPRARAM.reduce((s, r) => s + r.vgv, 0)
const PL_COMPRARAM_MIDIA = PL_COMPRARAM.filter(r => r.lead)

/** Comprador da janela que era lead de mídia de OUTRO período — contexto. */
const FORA_DA_JANELA = []
for (const c of porComprador.values()) {
    if (CLIENTES.some(x => nomeNorm(x.nome) === nomeNorm(c.nome))) continue
    const a = casaNoUniverso(idxTudo, c)
    if (!a || !a.achados.some(x => ehMidia(x.origem))) continue
    const p = a.achados.find(x => ehMidia(x.origem))
    FORA_DA_JANELA.push({
        nome: c.nome, origem: p.origem, leadData: p.data, via: a.via,
        valor: c.linhas.reduce((s, x) => s + (+x.lot_total || 0), 0),
        animais: c.linhas.reduce((s, x) => s + (+x.lot_qtd || 0), 0),
        eventos: [...new Set(c.linhas.map(x => `${x.lei_data.split('-').reverse().join('/')} ${x.lei_nome}`))],
    })
}

/* ══ 5. monta um funil ═══════════════════════════════════════════════════ */
function monta(campanhas) {
    const m = { investido: 0, impressoes: 0, alcance: 0, cliques: 0, saida: 0, acessos: 0, leadsMeta: 0 }
    for (const c of campanhas) { const x = MIDIA[c]; if (!x) continue
        m.investido += x.investido; m.impressoes += x.impressoes; m.alcance += x.alcance
        m.cliques += x.cliques; m.saida += x.saida; m.acessos += x.acessos; m.leadsMeta += x.leadsMeta }
    const leads = LEADS.filter(r => campanhas.includes(campanhaDe(r)))
    const mqls = leads.filter(ehMql)
    const instantaneos = leads.filter(ehInstantaneo).length
    const fichas = CASADAS.filter(f => campanhas.includes(f.campanha))
    const aprovados = fichas.filter(APROVADA)
    const comRessalva = fichas.filter(COM_RESSALVA)
    const clientes = CLIENTES.filter(c => campanhas.includes(c.campanha))
    return {
        campanhas, m, leads, mqls, instantaneos, fichas, aprovados, comRessalva, clientes,
        animais: clientes.reduce((s, c) => s + c.animais, 0),
        faturamento: clientes.reduce((s, c) => s + c.valor, 0),
    }
}
const PAGAS = ORDEM.slice()
const CONSOLIDADO = monta(PAGAS)
const PORCAMPANHA = PAGAS.map(c => {
    const d = monta([c])
    return {
        nome: c, ...MIDIA[c], leads: d.leads.length, mqls: d.mqls.length,
        fichas: d.fichas.length, aprovados: d.aprovados.length, clientes: d.clientes.length,
        cpl: d.leads.length ? d.m.investido / d.leads.length : null,
        cpmql: d.mqls.length ? d.m.investido / d.mqls.length : null,
        d,
    }
}).sort((a, b) => b.investido - a.investido)
const ORG = monta([ORGANICO])

/* ══ formatação ══════════════════════════════════════════════════════════ */
const br = n => Number(n || 0).toLocaleString('pt-BR')
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (a, b, c = 2) => b ? `${(a * 100 / b).toFixed(c).replace('.', ',')}%` : '—'
const razao = (a, b) => b ? a / b : null
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const dbr = d => String(d || '').slice(0, 10).split('-').reverse().join('/')

/**
 * A ficha do comprador cujo lead ficou fora da janela. Casar por primeiro nome
 * dava "Francisco Aluízio" = "Francisco Marcos Araruna": exige que TODOS os
 * termos de três letras ou mais do nome curto estejam no nome da ficha.
 */
const fichaDeFora = nome => {
    const t = nomeNorm(nome).split(' ').filter(x => x.length >= 3)
    const f = FORA.find(x => { const n = nomeNorm(x.nome); return t.length >= 2 && t.every(k => n.includes(k)) })
    return f ? `${dbr(f.data)} · ${esc(f.veredito)}` : '—'
}

const dataUri = (p, mime) => `data:${mime};base64,${fs.readFileSync(path.join(ROOT, 'public', p)).toString('base64')}`
const FUNDO = dataUri('bula/assets/img/agenda-hero-nelore.png', 'image/png')
const LOGO = dataUri('logo-bula-assessoria-white.png', 'image/png')

const CSS = `
  @page { size: 1000px 1414px; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d0b09; font-family: 'Segoe UI', Arial, sans-serif; color: #ece7df; }
  .quadro { width: 1000px; min-height: 1414px; margin: 0 auto; background: #0d0b09; padding-bottom: 26px;
            page-break-after: always; position: relative; overflow: hidden; }
  .quadro:last-child { page-break-after: auto; }
  .capa { position: relative; height: 176px; overflow: hidden; }
  .capa img.foto { width: 100%; height: 100%; object-fit: cover; object-position: 50% 46%; filter: saturate(.72) contrast(1.04); }
  .capa::after { content: ''; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(13,11,9,.42) 0%, rgba(13,11,9,.58) 45%, rgba(13,11,9,.97) 100%); }
  .capa .marca { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 2; }
  .capa .marca img { width: 172px; }
  .faixatopo { background: #131009; border-bottom: 1px solid #2c2519; padding: 9px 30px; display: flex;
               justify-content: space-between; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #857d70; }
  .faixatopo b { color: #c9a84c; font-weight: 600; }
  h1 { font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase; text-align: center; letter-spacing: .035em;
       margin: 0; padding: 14px 30px 0; font-size: 32px; font-weight: 700; color: #fff; line-height: 1.12; }
  h1 span { color: #c9a84c; }
  .sub { text-align: center; font-size: 12.5px; color: #9d958a; padding: 9px 46px 14px; line-height: 1.55; }
  .sub b { color: #cfc7ba; font-weight: 600; }
  .corpo { padding: 0 30px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #c9a84c; color: #17130d; font-family: 'Oswald', Arial, sans-serif; font-weight: 600;
             text-transform: uppercase; letter-spacing: .06em; font-size: 10.5px; padding: 8px 10px; text-align: right; }
  thead th.l { text-align: left; }
  td { padding: 7px 10px; border-bottom: 1px solid #241f18; font-size: 13.5px; text-align: right; white-space: nowrap; color: #d9d2c7; }
  td.i { text-align: left; width: 26px; font-family: 'Oswald', Arial, sans-serif; color: #6b6357; font-size: 13px; }
  td.rot { text-align: left; font-weight: 600; letter-spacing: .01em; font-size: 13px; color: #f2ede5;
           text-transform: uppercase; white-space: normal; }
  td.meta { color: #7d7568; font-size: 12px; }
  td.real { font-family: 'Oswald', Arial, sans-serif; font-size: 19px; font-weight: 600; color: #fff; }
  td.tx { color: #7d7568; font-size: 12px; }
  td.txr { font-weight: 700; font-size: 13.5px; color: #e8e2d8; }
  td.txr.bom { color: #62c07f; }
  td.txr.ruim { color: #e2695f; }
  .pin { font-size: 10px; }
  .faixa td { background: #1a1611; color: #c9a84c; font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase;
              font-size: 11px; letter-spacing: .1em; padding: 6px 10px; border-bottom: 1px solid #2c2519;
              border-top: 1px solid #2c2519; text-align: left; }
  .destaque { display: flex; gap: 9px; margin: 16px 0 4px; }
  .destaque div { flex: 1; border: 1px solid #3a3226; padding: 9px 11px 10px; background: #131009; }
  .destaque .z { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #8b8275; }
  .destaque .n { font-family: 'Oswald', Arial, sans-serif; font-size: 22px; line-height: 1.15; margin-top: 3px; color: #c9a84c; }
  .destaque .p { font-size: 10px; color: #8b8275; margin-top: 2px; line-height: 1.35; white-space: normal; }
  h2 { font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase; font-size: 12px; letter-spacing: .1em;
       color: #c9a84c; margin: 20px 0 0; padding-bottom: 6px; border-bottom: 1px solid #2c2519; }
  h2 small { color: #7d7568; letter-spacing: .04em; text-transform: none; font-size: 10.5px; font-family: 'Segoe UI', Arial, sans-serif; }
  table.densa td { font-size: 12px; padding: 6px 8px; }
  table.densa td.rot { font-size: 12px; }
  table.densa thead th { background: transparent; color: #857d70; border-bottom: 1px solid #2c2519; font-size: 9.5px; padding: 6px 8px; }
  td.destaca { color: #62c07f; font-weight: 700; }
  td.alerta { color: #e2a05f; font-weight: 700; }
  td.txt { text-align: left; white-space: normal; color: #b8b1a5; font-size: 11.5px; }
  .rodape { margin-top: 16px; border-top: 1px solid #2c2519; padding-top: 11px; font-size: 11px; color: #8b8275; line-height: 1.6; }
  .rodape b { color: #cfc7ba; }
  .rodape .alerta b { color: #e2a05f; }
  .assinatura { color: #5f584d; font-size: 10px; margin-top: 9px; }
  .duas { display: flex; gap: 22px; }
  .duas > div { flex: 1; min-width: 0; }
  .barra { height: 7px; background: #241f18; margin-top: 3px; }
  .barra i { display: block; height: 7px; background: #c9a84c; }`

const linha = l => `<tr>
  <td class="i">${l.n === '' ? '' : l.n}</td>
  <td class="rot">${esc(l.rot)}</td>
  <td class="meta">${esc(l.meta)}</td>
  <td class="real">${esc(l.real)}</td>
  <td class="tx">${esc(l.metaTaxa)}</td>
  <td class="txr ${l.ok === true ? 'bom' : l.ok === false ? 'ruim' : ''}">${esc(l.taxaReal)}${l.ok === true ? ' <span class="pin">▲</span>' : l.ok === false ? ' <span class="pin">▼</span>' : ''}</td>
</tr>`

/** As nove etapas, com a meta de TAXA (a de volume é mensal e não cabe aqui). */
function etapas(d, { metaVolume = false } = {}) {
    const { m, leads, mqls, fichas, aprovados, clientes } = d
    const f = []
    f.push({ n: 1, rot: 'Investimento em mídia', meta: metaVolume ? brl(METAS.investido) : '—', real: brl(m.investido), metaTaxa: '—', taxaReal: metaVolume ? `${pct(m.investido, METAS.investido, 0)} da verba mensal (só o funil)` : '—', ok: null })
    f.push({ n: 2, rot: 'Impressões', meta: metaVolume ? br(METAS.impressoes) : '—', real: br(m.impressoes), metaTaxa: '—', taxaReal: `CPM ${brl(m.impressoes ? m.investido / m.impressoes * 1000 : 0)}`, ok: null })
    f.push({ n: 3, curto: 'CTR', rot: 'Cliques', meta: metaVolume ? br(METAS.cliques) : '—', real: br(m.cliques), metaTaxa: '1,20%', taxaReal: pct(m.cliques, m.impressoes), ok: razao(m.cliques, m.impressoes) >= METAS.ctr })
    f.push(m.saida >= 30
        ? { n: 4, curto: 'acesso', rot: 'Acessos ao site', meta: metaVolume ? br(METAS.acessos) : '—', real: br(m.acessos), metaTaxa: '75% ÷saída', taxaReal: `${pct(m.acessos, m.saida)} da saída`, ok: razao(m.acessos, m.saida) >= METAS.acessoSaida }
        : { n: 4, rot: 'Acessos ao site', meta: metaVolume ? br(METAS.acessos) : '—', real: br(m.acessos), metaTaxa: '75% ÷saída', taxaReal: `${br(m.acessos)} de ${br(m.saida)} cliques de saída`, ok: null })
    f.push({ n: 5, rot: 'Leads gerados', meta: metaVolume ? br(METAS.leads) : '—', real: br(leads.length), metaTaxa: '12% ÷acesso', taxaReal: `${pct(leads.length, m.cliques)} dos cliques`, ok: null })
    f.push({ n: 6, curto: 'MQL', rot: 'Leads qualificados', meta: metaVolume ? String(METAS.mqls).replace('.', ',') : '—', real: br(mqls.length), metaTaxa: '20%', taxaReal: pct(mqls.length, leads.length), ok: razao(mqls.length, leads.length) >= METAS.mqlLead })
    f.push({ n: 7, curto: 'cadastro', rot: 'Cadastros submetidos', meta: metaVolume ? String(METAS.cadastros).replace('.', ',') : '—', real: br(fichas.length), metaTaxa: '40%', taxaReal: pct(fichas.length, mqls.length), ok: razao(fichas.length, mqls.length) >= METAS.cadastroMql })
    f.push({ n: 8, curto: 'aprovação', rot: 'Cadastros aprovados', meta: metaVolume ? String(METAS.aprovados).replace('.', ',') : '—', real: br(aprovados.length), metaTaxa: '60%', taxaReal: pct(aprovados.length, fichas.length), ok: fichas.length ? razao(aprovados.length, fichas.length) >= METAS.aprovadoCadastro : null })
    f.push({ n: 9, curto: 'compra', rot: 'Clientes compraram', meta: metaVolume ? String(METAS.clientes).replace('.', ',') : '—', real: br(clientes.length), metaTaxa: '40%', taxaReal: aprovados.length ? pct(clientes.length, aprovados.length) : '—', ok: aprovados.length ? razao(clientes.length, aprovados.length) >= METAS.clienteAprovado : null })
    return f
}
/** Custo não tem "taxa": o que informa é quantas vezes a meta ele custou. */
const vezes = (real, meta) => `${(real / meta).toFixed(1).replace('.', ',')}× a meta`
const custo = (rot, valor, meta, nota) => valor === null
    ? { n: '', rot, meta: brl(meta), real: '—', metaTaxa: '—', taxaReal: nota || '—', ok: null }
    : { n: '', rot, meta: brl(meta), real: brl(valor), metaTaxa: '—', taxaReal: valor <= meta ? `dentro da meta` : vezes(valor, meta), ok: valor <= meta }
const custos = d => [
    custo('CPL', d.leads.length ? d.m.investido / d.leads.length : null, METAS.cpl),
    custo('CPMQL', d.mqls.length ? d.m.investido / d.mqls.length : null, METAS.cpmql),
    custo('Custo por cadastro', d.fichas.length ? d.m.investido / d.fichas.length : null, METAS.custoCadastro, 'nenhum cadastro'),
    custo('Custo por animal vendido', d.animais ? d.m.investido / d.animais : null, METAS.custoVenda, 'sem venda ainda'),
]
const resultado = d => [
    { n: '', rot: 'Animais vendidos', meta: '—', real: br(d.animais), metaTaxa: '—', taxaReal: '—', ok: null },
    { n: '', rot: 'Ticket médio por animal', meta: brl(25000), real: d.animais ? brl(d.faturamento / d.animais) : '—', metaTaxa: '—', taxaReal: '—', ok: null },
    { n: '', rot: 'Faturamento gerado', meta: '—', real: brl(d.faturamento), metaTaxa: '—', taxaReal: d.clientes.some(c => c.provisorio) ? 'provisório (lance do grupo)' : '—', ok: null },
]

const cx = (z, n, p) => `<div><div class="z">${z}</div><div class="n">${n}</div><div class="p">${p}</div></div>`
const capa = () => `<div class="capa"><img class="foto" src="${FUNDO}" alt=""><div class="marca"><img src="${LOGO}" alt="Bula Assessoria"></div></div>`
const topo = (pag, total) => `<div class="faixatopo"><span>Bula Assessoria · Funil das campanhas · <b>15/08 a 09/09/2026</b></span><span>Página ${pag} de ${total}</span></div>`

const TOTAL_PAG = 9
const paginas = []

/* ══ PÁGINA 1 — consolidado ══════════════════════════════════════════════ */
{
    const d = CONSOLIDADO
    const f = etapas(d, { metaVolume: true })
    const dentro = f.filter(l => l.ok === true).length, comp = f.filter(l => l.ok !== null).length
    const quais = f.filter(l => l.ok === true).map(l => l.curto).filter(Boolean)
    const invCA1 = M.ca1.reduce((s, c) => s + c.investido, 0)
    paginas.push(`<div class="quadro">
  ${capa()}
  <h1>Funil das campanhas — <span>15/08 a 09/09</span></h1>
  <div class="sub"><b>Cinco campanhas de captação</b> na conta CA2: Perpétuo Touro, Jacamim, Perpétuo Fêmeas, Melhoradores e Expogenética · ${brl(d.m.investido)} em ${DIAS} dias<br>
  a conta CA1 (divulgação de leilão) gastou mais <b>${brl(invCA1)}</b> na mesma janela e está na página 7 — ela não é funil de cadastro</div>
  <div class="corpo">
  <table>
    <thead><tr><th class="l" colspan="2">Etapa</th><th>Meta do mês</th><th>Realizado</th><th>Meta de taxa</th><th>Taxa real</th></tr></thead>
    <tbody>
      ${f.map(linha).join('')}
      <tr class="faixa"><td colspan="6">Resultado</td></tr>
      ${resultado(d).map(linha).join('')}
      <tr class="faixa"><td colspan="6">Custos</td></tr>
      ${custos(d).map(linha).join('')}
    </tbody>
  </table>
  <div class="destaque">
    ${cx('Verba usada', pct(d.m.investido + invCA1, METAS.investido, 0), `${brl(d.m.investido + invCA1)} nas duas contas contra ${brl(METAS.investido)}/mês`)}
    ${cx('Taxas dentro da meta', `${dentro} de ${comp}`, quais.length ? quais.join(', ') : 'nenhuma etapa comparável bateu a meta')}
    ${cx('Lead de formulário', pct(d.instantaneos, d.leads.length, 0), `${br(d.instantaneos)} dos ${br(d.leads.length)} leads nunca passaram pelo site`)}
    ${cx('Compraram no período', `${CONSOLIDADO.clientes.length} · ${PL_COMPRARAM.length}`, `${CONSOLIDADO.clientes.length} pelo funil de mídia, <b>${PL_COMPRARAM.length} pela aba CADASTROS</b> (${brl0(PL_VGV)}) — página 8`)}
  </div>
  <h2>Onde o funil estreita <small>— cada degrau em relação ao anterior</small></h2>
  <table class="densa">
    <thead><tr><th class="l">Degrau</th><th>De</th><th>Para</th><th>Taxa</th><th>Meta</th><th class="l">Leitura</th></tr></thead>
    <tbody>
      <tr><td class="rot">Impressão → clique</td><td>${br(d.m.impressoes)}</td><td>${br(d.m.cliques)}</td><td class="txr ${razao(d.m.cliques, d.m.impressoes) >= METAS.ctr ? 'bom' : 'ruim'}">${pct(d.m.cliques, d.m.impressoes)}</td><td class="meta">1,20%</td><td class="txt">criativo entrega; CTR acima da meta</td></tr>
      <tr><td class="rot">Clique → lead</td><td>${br(d.m.cliques)}</td><td>${br(d.leads.length)}</td><td class="txr">${pct(d.leads.length, d.m.cliques)}</td><td class="meta">não comparável</td><td class="txt">a meta de 12% é lead÷acesso e nasceu na era do site</td></tr>
      <tr><td class="rot">Lead → MQL</td><td>${br(d.leads.length)}</td><td>${br(d.mqls.length)}</td><td class="txr ${razao(d.mqls.length, d.leads.length) >= METAS.mqlLead ? 'bom' : 'ruim'}">${pct(d.mqls.length, d.leads.length)}</td><td class="meta">20%</td><td class="txt">100+ cabeças e com inscrição estadual</td></tr>
      <tr><td class="rot">MQL → cadastro</td><td>${br(d.mqls.length)}</td><td>${br(d.fichas.length)}</td><td class="txr ${razao(d.fichas.length, d.mqls.length) >= METAS.cadastroMql ? 'bom' : 'ruim'}">${pct(d.fichas.length, d.mqls.length)}</td><td class="meta">40%</td><td class="alerta">é aqui que o funil trava</td></tr>
      <tr><td class="rot">Cadastro → aprovado</td><td>${br(d.fichas.length)}</td><td>${br(d.aprovados.length)}</td><td class="txr ${razao(d.aprovados.length, d.fichas.length) >= METAS.aprovadoCadastro ? 'bom' : 'ruim'}">${pct(d.aprovados.length, d.fichas.length)}</td><td class="meta">60%</td><td class="txt">+${d.comRessalva.length - d.aprovados.length} aprovadas com ressalva (limite/cautela)</td></tr>
      <tr><td class="rot">Aprovado → cliente</td><td>${br(d.aprovados.length)}</td><td>${br(d.clientes.length)}</td><td class="txr ruim">${pct(d.clientes.length, d.aprovados.length)}</td><td class="meta">40%</td><td class="txt">ciclo lead→venda é de semanas; a janela mal começou</td></tr>
    </tbody>
  </table>
  <div class="rodape">
    <b>Como ler.</b> A coluna de volume é do mês inteiro; esta janela tem ${DIAS} dias e atravessa dois meses, então o que mede a operação é a coluna de <b>taxa</b> — e nela ${dentro} das ${comp} etapas comparáveis estão dentro ou acima da meta.<br>
    <span class="alerta"><b>A verba do mês já foi.</b></span> ${brl(d.m.investido)} no funil mais ${brl(invCA1)} na divulgação dão ${brl(d.m.investido + invCA1)} — ${pct(d.m.investido + invCA1, METAS.investido, 0)} da verba mensal de ${brl(METAS.investido)}, em ${DIAS} dias que cobrem só metade de agosto e nove dias de setembro.<br>
    <b>Por que “acessos” mudou de conta.</b> ${pct(d.instantaneos, d.leads.length, 0)} dos leads vieram de <b>formulário instantâneo</b>, que abre dentro do app e nunca gera acesso ao site. Medido contra os <b>cliques de saída</b>, que é o universo a que a meta de 75% se aplica, deu ${pct(d.m.acessos, d.m.saida, 1)} — ${br(d.m.acessos)} de ${br(d.m.saida)}.<br>
    <b>Houve uma segunda venda de mídia na janela, e ela não é desta safra.</b> Francisco Aluízio de Faria, lead de <b>09/07</b> (campanha EAO), teve ficha em 18/08 e comprou ${brl0(FORA_DA_JANELA[0]?.valor || 0)} no Melhoradores de 29/08 — 51 dias entre o lead e a compra. É a medida real do ciclo, e a razão de a linha “clientes compraram” desta janela ainda estar em ${d.clientes.length}.<br>
    <b>Definições.</b> Leads = pessoas distintas na planilha (${br(validos.length)} linhas viraram ${br(d.leads.length + ORG.leads.length)} pessoas; ${duplicados} duplicadas e ${testes} de teste fora). Cadastro = ficha que foi ao grupo da leiloeira na janela com a pessoa casada por CPF, telefone ou nome. Cliente = comprador cruzado contra o universo, com prova no ERP ou no lance cantado.
    <div class="assinatura">Apurado em ${HOJE} · Meta Ads (contas CA2 e CA1, leitura ao vivo) + planilha “Leads - Bula Assessoria” (ao vivo) + varredura dos grupos de cadastro de 08/09 + ERP HastaPro + lances do grupo</div>
  </div>
  </div>
</div>`)
}

/* ══ PÁGINAS 2 a 5 — um funil por campanha ═══════════════════════════════ */
const NOTA = {
    'PERPÉTUO TOURO': {
        chamada: 'a campanha perene de captação — 63% da verba do funil e 72% dos leads',
        texto: d => `<b>É o motor da janela.</b> ${brl(d.m.investido)} trouxeram ${br(d.leads.length)} leads a ${brl(d.m.investido / d.leads.length)} cada, e ${br(d.mqls.length)} deles qualificados (${pct(d.mqls.length, d.leads.length, 1)}). O CPL está ${d.m.investido / d.leads.length <= METAS.cpl ? 'dentro' : 'acima'} da meta de ${brl(METAS.cpl)} e o CPMQL, ${brl(d.m.investido / d.mqls.length)} contra meta de ${brl(METAS.cpmql)}.<br>
      <span class="alerta"><b>O gasto triplicou em setembro.</b></span> Até 31/08 a campanha rodava a ~R$ 150/dia; de 02 a 05/09 passou de R$ 600/dia. Nos quatro dias caros (02 a 05/09) foram ${brl(437.85 + 599.78 + 605.03 + 618.07)} para 100 leads — ${brl((437.85 + 599.78 + 605.03 + 618.07) / 100)} por lead, quase o dobro do CPL da campanha.<br>
      <b>Onde ela entrega de verdade.</b> ${br(d.fichas.length)} fichas de cadastro saíram desta campanha na janela, ${br(d.aprovados.length)} aprovadas e ${d.comRessalva.length - d.aprovados.length} com ressalva — é a única campanha que já produziu comprador: <b>Reginaldo Leandro da Silva</b>, lead de 28/08, ficha em 29/08, comprou 4 touros no Jacamim em 05/09.`,
    },
    'JACAMIM': {
        chamada: 'campanha de leilão datado — encerrou no dia do pregão, como manda a regra',
        texto: d => `<b>Desta vez a campanha parou no martelo.</b> O leilão Touros Jacamim foi em <b>05/09</b> e o último gasto da campanha foi em <b>05/09</b> (R$ 165,70). Em agosto o Melhoradores gastou 35% da verba com o leilão já encerrado — a lição pegou.<br>
      <b>O topo é caro.</b> CPM de ${brl(MIDIA['JACAMIM'].cpm)} contra ${brl(MIDIA['PERPÉTUO TOURO'].cpm)} do Perpétuo — o dobro —, o CTR mais baixo das cinco (${String(MIDIA['JACAMIM'].ctr).replace('.', ',')}%, ainda assim acima da meta de 1,20%) e CPL de ${brl(d.m.investido / d.leads.length)}, mais que o dobro do Perpétuo. Campanha curta de leilão paga caro pela pressa: são nove dias para comprar audiência que a campanha perene compra o mês inteiro.<br>
      <b>Mas o fim do funil funcionou.</b> ${br(d.fichas.length)} fichas para ${br(d.mqls.length)} MQL (${pct(d.fichas.length, d.mqls.length, 0)} — a melhor taxa MQL→cadastro da janela) e ${br(d.aprovados.length)} aprovadas. Nenhum lead do Jacamim comprou no próprio leilão: quem comprou veio do Perpétuo Touro.`,
    },
    'MELHORADORES': {
        chamada: 'leilão de 29/08 — a melhor qualificação da janela, e nenhuma venda',
        texto: d => `<b>O melhor topo de funil da janela.</b> CTR de 1,82%, o mais alto das cinco, e ${pct(d.mqls.length, d.leads.length, 1)} de leads qualificados — mais que o dobro da meta de 20%.<br>
      <span class="alerta"><b>E ainda assim gastou depois do pregão.</b></span> O leilão foi em 29/08 às 12h; a campanha seguiu no ar em 30 e 31/08 e consumiu mais ${brl(129.52 + 18.48)}. Lead que chega depois do martelo não tem o que comprar.<br>
      <b>Das ${br(d.fichas.length)} fichas, ${br(d.aprovados.length)} passou.</b> Duas foram recusadas — em leilão de MS a leiloeira exige inscrição estadual, e a campanha não estava geolocalizada no estado do leilão. A que passou (Evaldo Escobar, que entrou na planilha como “Rui Escobar”) ainda não comprou.`,
    },
    'EXPOGENÉTICA': {
        chamada: 'base interna, 18 a 21/08 — o CPL mais barato da janela',
        texto: d => `<b>Mídia barata porque falava com quem já conhece a casa.</b> ${brl(d.m.investido)} para ${br(d.leads.length)} leads: ${brl(d.m.investido / d.leads.length)} por lead, o melhor da janela e bem abaixo da meta de ${brl(METAS.cpl)}. Público “Base Interna”, quatro dias no ar.<br>
      <span class="alerta"><b>Zero ficha de cadastro.</b></span> ${br(d.mqls.length)} leads qualificados e nenhum virou consulta no grupo da leiloeira. Foi a mesma coisa em agosto (Fêmeas e Expogenética: 80 leads e zero ficha) — a campanha entrega o lead e o time não converte em cadastro.<br>
      <b>Lead barato que morre no meio do funil custa mais caro que lead caro que fecha.</b> É o argumento para escolher criativo e campanha por CPMQL e por cadastro, não por CPL.`,
    },
    'PERPÉTUO FÊMEAS': {
        chamada: 'única que ainda mandava tráfego para a landing — e a de pior qualificação',
        texto: d => `<b>É a campanha do site.</b> Sozinha responde por ${br(MIDIA['PERPÉTUO FÊMEAS'].saida)} dos ${br(CONSOLIDADO.m.saida)} cliques de saída e por ${br(MIDIA['PERPÉTUO FÊMEAS'].acessos)} dos ${br(CONSOLIDADO.m.acessos)} acessos ao site da janela inteira — ${pct(MIDIA['PERPÉTUO FÊMEAS'].acessos, MIDIA['PERPÉTUO FÊMEAS'].saida, 1)} de conversão de saída em acesso, acima da meta de 75%.<br>
      <span class="alerta"><b>E o público não é comprador.</b></span> ${br(d.mqls.length)} MQL em ${br(d.leads.length)} leads (${pct(d.mqls.length, d.leads.length, 1)}) contra meta de 20%. Rodou só de 15 a 17/08 e parou.<br>
      <b>Zero ficha, zero venda.</b> Metade dos leads dela entrou pela landing (${br(d.leads.length - d.instantaneos)} de ${br(d.leads.length)}) — o único lugar da janela onde a landing ainda pesa.`,
    },
}
for (const nome of ['PERPÉTUO TOURO', 'JACAMIM', 'MELHORADORES']) {
    const c = PORCAMPANHA.find(x => x.nome === nome)
    const d = c.d
    const f = etapas(d)
    const dentro = f.filter(l => l.ok === true).length, comp = f.filter(l => l.ok !== null).length
    const dia = M.diario[nome] || {}
    const dias = Object.keys(dia).sort()
    const maxDia = Math.max(...Object.values(dia), 1)
    paginas.push(`<div class="quadro">
  ${topo(paginas.length + 1, TOTAL_PAG)}
  <h1>${esc(nome)} <span>— funil</span></h1>
  <div class="sub">${esc(MIDIA[nome].nomeMeta)} · id ${MIDIA[nome].id} · ${MIDIA[nome].status === 'ACTIVE' ? 'ainda no ar' : 'pausada'}<br><b>${NOTA[nome].chamada}</b></div>
  <div class="corpo">
  <table>
    <thead><tr><th class="l" colspan="2">Etapa</th><th>Meta</th><th>Realizado</th><th>Meta de taxa</th><th>Taxa real</th></tr></thead>
    <tbody>
      ${f.map(linha).join('')}
      <tr class="faixa"><td colspan="6">Custos</td></tr>
      ${custos(d).map(linha).join('')}
    </tbody>
  </table>
  <div class="destaque">
    ${cx('Investido', brl(d.m.investido), `${pct(d.m.investido, CONSOLIDADO.m.investido, 0)} da verba do funil na janela`)}
    ${cx('CPL', d.leads.length ? brl(d.m.investido / d.leads.length) : '—', `meta ${brl(METAS.cpl)}`)}
    ${cx('CPMQL', d.mqls.length ? brl(d.m.investido / d.mqls.length) : '—', `meta ${brl(METAS.cpmql)}`)}
    ${cx('Taxas na meta', `${dentro} de ${comp}`, f.filter(l => l.ok === true).map(l => l.curto).filter(Boolean).join(', ') || 'nenhuma')}
  </div>
  <h2>Gasto dia a dia <small>— ${dias.length} dias com entrega</small></h2>
  <table class="densa">
    <thead><tr><th class="l">Dia</th><th class="l" style="width:62%">Investido</th><th>R$</th></tr></thead>
    <tbody>${dias.map(k => `<tr><td class="rot">${dbr(k)}</td><td><div class="barra"><i style="width:${(dia[k] / maxDia * 100).toFixed(1)}%"></i></div></td><td>${brl(dia[k])}</td></tr>`).join('')}</tbody>
  </table>
  <h2>Criativos <small>— MQL vem da planilha, casado pelo id do anúncio</small></h2>
  <table class="densa">
    <thead><tr><th class="l">Anúncio</th><th>Investido</th><th>Impressões</th><th>CTR</th><th>Leads</th><th>MQL</th><th>CPL</th><th>CPMQL</th></tr></thead>
    <tbody>${criativosHtml(nome)}</tbody>
  </table>
  <div class="rodape">${NOTA[nome].texto(d)}
    <div class="assinatura">Apurado em ${HOJE} · leads e MQL da planilha ao vivo; mídia do Meta na janela ${dbr(DE)}–${dbr(ATE)}</div>
  </div>
  </div>
</div>`)
}

/* ══ PÁGINA 5 — as duas pequenas lado a lado ═════════════════════════════ */
{
    const mini = nome => {
        const d = PORCAMPANHA.find(x => x.nome === nome).d
        const f = etapas(d)
        return `<div>
      <h2>${esc(nome)} <small>— ${esc(MIDIA[nome].nomeMeta)}</small></h2>
      <table class="densa"><tbody>
        ${f.map(l => `<tr><td class="rot">${esc(l.rot)}</td><td class="real" style="font-size:15px">${esc(l.real)}</td><td class="txr ${l.ok === true ? 'bom' : l.ok === false ? 'ruim' : ''}" style="width:96px">${esc(l.taxaReal)}</td></tr>`).join('')}
        <tr><td class="rot">CPL</td><td class="real" style="font-size:15px">${d.leads.length ? brl(d.m.investido / d.leads.length) : '—'}</td><td class="meta">meta ${brl(METAS.cpl)}</td></tr>
        <tr><td class="rot">CPMQL</td><td class="real" style="font-size:15px">${d.mqls.length ? brl(d.m.investido / d.mqls.length) : '—'}</td><td class="meta">meta ${brl(METAS.cpmql)}</td></tr>
      </tbody></table>
      <div class="rodape" style="margin-top:12px">${NOTA[nome].texto(d)}</div>
    </div>`
    }
    paginas.push(`<div class="quadro">
  ${topo(paginas.length + 1, TOTAL_PAG)}
  <h1>Expogenética <span>e</span> Perpétuo Fêmeas</h1>
  <div class="sub">as duas campanhas curtas da primeira parte da janela · juntas, ${brl(MIDIA['EXPOGENÉTICA'].investido + MIDIA['PERPÉTUO FÊMEAS'].investido)} e ${br(PORCAMPANHA.find(x => x.nome === 'EXPOGENÉTICA').leads + PORCAMPANHA.find(x => x.nome === 'PERPÉTUO FÊMEAS').leads)} leads<br><b>${br(PORCAMPANHA.find(x => x.nome === 'EXPOGENÉTICA').mqls + PORCAMPANHA.find(x => x.nome === 'PERPÉTUO FÊMEAS').mqls)} leads qualificados e nenhuma ficha de cadastro</b> — as duas param no mesmo degrau</div>
  <div class="corpo">
  <div class="duas">${mini('EXPOGENÉTICA')}${mini('PERPÉTUO FÊMEAS')}</div>
  <h2>Criativos das duas</h2>
  <table class="densa">
    <thead><tr><th class="l">Anúncio</th><th class="l">Campanha</th><th>Investido</th><th>Impressões</th><th>CTR</th><th>Leads</th><th>MQL</th><th>CPL</th></tr></thead>
    <tbody>${['EXPOGENÉTICA', 'PERPÉTUO FÊMEAS'].map(n => criativosHtml(n, true)).join('')}</tbody>
  </table>
  <div class="rodape">
    <b>As duas contam a mesma história por caminhos opostos.</b> A Expogenética teve o lead mais barato da janela (${brl(MIDIA['EXPOGENÉTICA'].investido / PORCAMPANHA.find(x => x.nome === 'EXPOGENÉTICA').leads)}) e a Fêmeas, a pior qualificação (${pct(PORCAMPANHA.find(x => x.nome === 'PERPÉTUO FÊMEAS').mqls, PORCAMPANHA.find(x => x.nome === 'PERPÉTUO FÊMEAS').leads, 1)}). Nenhuma das duas produziu uma única ficha de cadastro.<br>
    <b>O que isso significa na prática.</b> ${brl(MIDIA['EXPOGENÉTICA'].investido + MIDIA['PERPÉTUO FÊMEAS'].investido)} viraram ${br(PORCAMPANHA.find(x => x.nome === 'EXPOGENÉTICA').leads + PORCAMPANHA.find(x => x.nome === 'PERPÉTUO FÊMEAS').leads)} nomes na planilha e pararam ali. O degrau que faltou não é de mídia — é o de levar o lead qualificado ao grupo da leiloeira.
    <div class="assinatura">Apurado em ${HOJE}</div>
  </div>
  </div>
</div>`)
}

/* ══ PÁGINA 6 — comparativo ══════════════════════════════════════════════ */
{
    const melhorMql = PORCAMPANHA.filter(c => c.cpmql).sort((a, b) => a.cpmql - b.cpmql)[0]
    const linhaC = c => `<tr>
    <td class="rot">${esc(c.nome)}</td>
    <td>${brl(c.investido)}</td><td>${br(c.impressoes)}</td><td>${br(c.cliques)}</td>
    <td class="${c.ctr >= 1.2 ? 'destaca' : 'alerta'}">${String(c.ctr).replace('.', ',')}%</td>
    <td>${c.leads}</td><td>${c.mqls}</td><td>${pct(c.mqls, c.leads, 0)}</td><td>${c.fichas}</td><td>${c.aprovados}</td><td>${c.clientes}</td>
    <td>${c.cpl ? brl(c.cpl) : '—'}</td>
    <td class="${melhorMql && c.nome === melhorMql.nome ? 'destaca' : ''}">${c.cpmql ? brl(c.cpmql) : '—'}</td></tr>`
    const tot = CONSOLIDADO
    paginas.push(`<div class="quadro">
  ${topo(paginas.length + 1, TOTAL_PAG)}
  <h1>As cinco campanhas <span>lado a lado</span></h1>
  <div class="sub">tudo na mesma régua · a comparação que vale é <b>taxa × taxa</b>, nunca volume — cada campanha ficou no ar por um número diferente de dias</div>
  <div class="corpo">
  <table class="densa">
    <thead><tr><th class="l">Campanha</th><th>Investido</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>Leads</th><th>MQL</th><th>MQL%</th><th>Cad.</th><th>Aprov.</th><th>Cli.</th><th>CPL</th><th>CPMQL</th></tr></thead>
    <tbody>
      ${PORCAMPANHA.map(linhaC).join('')}
      <tr><td class="rot">Orgânico / direto <small style="color:#7d7568">(landing sem campanha)</small></td><td>—</td><td>—</td><td>—</td><td>—</td><td>${ORG.leads.length}</td><td>${ORG.mqls.length}</td><td>${pct(ORG.mqls.length, ORG.leads.length, 0)}</td><td>${ORG.fichas.length}</td><td>${ORG.aprovados.length}</td><td>${ORG.clientes.length}</td><td>—</td><td>—</td></tr>
      <tr class="faixa"><td colspan="13">Total do funil (só as cinco pagas)</td></tr>
      <tr><td class="rot">Total</td><td>${brl(tot.m.investido)}</td><td>${br(tot.m.impressoes)}</td><td>${br(tot.m.cliques)}</td><td>${pct(tot.m.cliques, tot.m.impressoes)}</td><td>${tot.leads.length}</td><td>${tot.mqls.length}</td><td>${pct(tot.mqls.length, tot.leads.length, 0)}</td><td>${tot.fichas.length}</td><td>${tot.aprovados.length}</td><td>${tot.clientes.length}</td><td>${brl(tot.m.investido / tot.leads.length)}</td><td>${brl(tot.m.investido / tot.mqls.length)}</td></tr>
    </tbody>
  </table>
  <h2>O ranking que interessa <small>— por custo do CADASTRO, que é o degrau que vira cliente</small></h2>
  <table class="densa">
    <thead><tr><th class="l">#</th><th class="l">Campanha</th><th>CPL</th><th>CPMQL</th><th>Custo por cadastro</th><th class="l">O que o número diz</th></tr></thead>
    <tbody>${PORCAMPANHA.slice().sort((a, b) => (a.fichas ? a.investido / a.fichas : 9e9) - (b.fichas ? b.investido / b.fichas : 9e9)).map((c, i) => `<tr>
      <td class="i">${i + 1}</td><td class="rot">${esc(c.nome)}</td>
      <td>${c.cpl ? brl(c.cpl) : '—'}</td>
      <td class="${i === 0 ? 'destaca' : ''}">${c.cpmql ? brl(c.cpmql) : '—'}</td>
      <td>${c.fichas ? brl(c.investido / c.fichas) : '—'}</td>
      <td class="txt">${c.fichas ? `${c.fichas} ficha(s), ${c.aprovados} aprovada(s)` : 'lead barato que não virou cadastro nenhum'}</td></tr>`).join('')}</tbody>
  </table>
  <h2>Os melhores e os piores criativos da janela <small>— por CPMQL</small></h2>
  <table class="densa">
    <thead><tr><th class="l">Anúncio</th><th class="l">Campanha</th><th>Investido</th><th>CTR</th><th>Leads</th><th>MQL</th><th>CPL</th><th>CPMQL</th></tr></thead>
    <tbody>${rankingCriativos()}</tbody>
  </table>
  <div class="rodape">
    <b>CPL barato não é campanha boa.</b> A Expogenética teve o melhor CPL da janela (${brl(PORCAMPANHA.find(c => c.nome === 'EXPOGENÉTICA').cpl)}) e zero cadastro; o Jacamim teve o pior CPL (${brl(PORCAMPANHA.find(c => c.nome === 'JACAMIM').cpl)}) e a melhor conversão de MQL em ficha. O número que separa os dois é o <b>custo por cadastro</b>, na quinta coluna do ranking.<br>
    <b>Dentro do Perpétuo Touro, o lead bom custa 11 vezes mais de um criativo para o outro.</b> O criativo <b>V01</b> no conjunto de interesses fez lead a ${brl(1722.65 / (LPA()['120249993098140708']?.leads || 1))} e MQL a ${brl(1722.65 / (LPA()['120249993098140708']?.mqls || 1))}; o <b>V03</b>, no conjunto de semelhantes, fez lead a ${brl(1341.65 / (LPA()['120249993192200708']?.leads || 1))} e MQL a ${brl(1341.65 / (LPA()['120249993192200708']?.mqls || 1))} — mesma campanha, mesmo período, <b>onze vezes</b> o preço do lead bom. É por CPMQL que se escolhe criativo, não por CPL.<br>
    <b>Aviso de leitura.</b> A coluna Leads é a da planilha (pessoa distinta); o Meta conta pela janela de atribuição dele e pelo fuso de Nova York, então difere em um ou dois por dia. Somar a semana fecha; comparar dia isolado, não.
    <div class="assinatura">Apurado em ${HOJE}</div>
  </div>
  </div>
</div>`)
}

/* ══ PÁGINA 7 — CA1 e os achados ═════════════════════════════════════════ */
{
    const invCA1 = M.ca1.reduce((s, c) => s + c.investido, 0)
    const impCA1 = M.ca1.reduce((s, c) => s + c.impressoes, 0)
    const cliCA1 = M.ca1.reduce((s, c) => s + c.cliques, 0)
    const leadsCA1 = M.ca1.reduce((s, c) => s + c.leadsMeta, 0)
    paginas.push(`<div class="quadro">
  ${topo(paginas.length + 1, TOTAL_PAG)}
  <h1>Conta CA1 <span>— divulgação de leilão</span></h1>
  <div class="sub">a outra conta que gastou na janela: <b>${brl(invCA1)}</b> em seis campanhas de divulgação de pregão<br>não é funil de cadastro — é o serviço de mídia que a agência entrega para a leiloeira, e por isso não tem etapa de MQL, ficha ou aprovação</div>
  <div class="corpo">
  <table class="densa">
    <thead><tr><th class="l">Campanha</th><th class="l">Objetivo</th><th class="l">Período</th><th>Investido</th><th>Impressões</th><th>Alcance</th><th>Cliques</th><th>CTR</th><th>Leads</th></tr></thead>
    <tbody>
      ${M.ca1.map(c => `<tr><td class="rot">${esc(c.campanha)}</td><td class="txt">${c.objetivo.replace('OUTCOME_', '').toLowerCase()}</td><td class="txt">${dbr(c.inicio)}–${dbr(c.fim)}</td><td>${brl(c.investido)}</td><td>${br(c.impressoes)}</td><td>${br(c.alcance)}</td><td>${br(c.cliques)}</td><td class="${c.ctr >= 1.2 ? 'destaca' : 'alerta'}">${String(c.ctr).replace('.', ',')}%</td><td class="${c.leadsMeta ? 'alerta' : ''}">${c.leadsMeta || '—'}</td></tr>`).join('')}
      <tr class="faixa"><td colspan="9">Total</td></tr>
      <tr><td class="rot">Total CA1</td><td></td><td></td><td>${brl(invCA1)}</td><td>${br(impCA1)}</td><td>—</td><td>${br(cliCA1)}</td><td>${pct(cliCA1, impCA1)}</td><td>${leadsCA1}</td></tr>
    </tbody>
  </table>
  <h2>Três coisas que esta janela mostrou e precisam de decisão</h2>
  <table class="densa">
    <thead><tr><th class="i l">#</th><th class="l">Achado</th><th class="l">Prova</th><th class="l">O que fazer</th></tr></thead>
    <tbody>
      <tr><td class="i">1</td><td class="rot" style="width:24%">21 leads do Encontro de Boiadeiros não chegam na planilha</td>
        <td class="txt" style="width:34%">A campanha <b>Leilão Encontro de Boiadeiros — MS</b> (CA1, ${brl(516.73)}, 03 a 09/09) marcou 21 leads no Meta. Varrendo as sete abas da planilha, <b>nenhuma linha</b> menciona o leilão; o formulário é de página da CA1 e o conector está ligado só na CA2. O leilão também não está na agenda da Bula.</td>
        <td class="txt">Confirmar se é campanha de cliente (leads são da leiloeira, e aí está certo) ou se o funil está vazando. Se for da Bula, ligar o conector na CA1.</td></tr>
      <tr><td class="i">2</td><td class="rot">A verba do mês foi consumida em ${DIAS} dias</td>
        <td class="txt">${brl(CONSOLIDADO.m.investido)} no funil + ${brl(invCA1)} na divulgação = <b>${brl(CONSOLIDADO.m.investido + invCA1)}</b>, contra ${brl(METAS.investido)}/mês do quadro. Só de 02 a 05/09 o Perpétuo Touro gastou ${brl(437.85 + 599.78 + 605.03 + 618.07)}.</td>
        <td class="txt">Decidir se a verba mensal subiu ou se setembro fecha sem mídia na segunda quinzena — que foi o que aconteceu em agosto (parou dia 20, voltou dia 27).</td></tr>
      <tr><td class="i">3</td><td class="rot">${CONSOLIDADO.mqls.length - CONSOLIDADO.fichas.length} leads qualificados não viraram ficha</td>
        <td class="txt">${br(CONSOLIDADO.mqls.length)} MQL na janela, ${br(CONSOLIDADO.fichas.length)} fichas levadas ao grupo (${pct(CONSOLIDADO.fichas.length, CONSOLIDADO.mqls.length, 0)}, meta 40%). Expogenética e Perpétuo Fêmeas: ${PORCAMPANHA.find(c => c.nome === 'EXPOGENÉTICA').mqls + PORCAMPANHA.find(c => c.nome === 'PERPÉTUO FÊMEAS').mqls} MQL e zero ficha.</td>
        <td class="txt">É o degrau mais estreito e o único que não custa verba. Puxar os MQL sem ficha por campanha e mandar para o grupo.</td></tr>
    </tbody>
  </table>
  <h2>Higiene do dado <small>— o que a leitura ao vivo da planilha encontrou</small></h2>
  <table class="densa">
    <thead><tr><th class="l">Conferência</th><th>Encontrado</th><th class="l">Situação</th></tr></thead>
    <tbody>
      <tr><td class="rot">Linhas cruas do conector paradas em alguma aba</td><td class="destaca">0</td><td class="txt">a auto-cura está em dia</td></tr>
      <tr><td class="rot">Linhas duplicadas na janela</td><td class="${duplicados ? 'alerta' : 'destaca'}">${duplicados}</td><td class="txt">os quatro leads do “Formulário BULA EAO GRUPO 02” de 15 e 16/08 estão gravados duas vezes — uma com <code>campaign_id</code>, outra sem</td></tr>
      <tr><td class="rot">Leads de teste do Meta</td><td>${testes}</td><td class="txt">excluídos de toda a apuração</td></tr>
      <tr><td class="rot">UF que não é UF</td><td class="${ufTorta ? 'alerta' : 'destaca'}">${ufTorta}</td><td class="txt">campo “estado” do formulário é texto livre (“Góis”, “Terra Rica - Pr”, “MI”); a cascata de 02/09 recupera pelo DDD, mas a origem continua suja</td></tr>
      <tr><td class="rot">Campanha declarada pela equipe × apurada aqui</td><td class="destaca">4 de 4</td><td class="txt">as quatro linhas de setembro em que a equipe preencheu a coluna CAMPANHA batem com a atribuição por CPF deste relatório</td></tr>
    </tbody>
  </table>
  <div class="rodape">
    <b>Por que a CA1 não entra no funil.</b> Ela vende divulgação de pregão para a leiloeira: o objetivo é engajamento e mensagem, não cadastro. Somar as duas contas num funil só faria o investimento inchar sem que houvesse etapa de MQL do outro lado. Elas se encontram em um ponto só: a verba total da casa.<br>
    <b>Onde as duas contas se cruzaram nesta janela.</b> O Leilão Melhoradores de 29/08 teve campanha de captação na CA2 (${brl(MIDIA['MELHORADORES'].investido)}) e três de divulgação na CA1 (${brl(179.98 + 82.70 + 49.28)}) — ${brl(MIDIA['MELHORADORES'].investido + 179.98 + 82.70 + 49.28)} no mesmo pregão.
    <div class="assinatura">Apurado em ${HOJE} · conta CA1 = 1155240258865815, conta CA2 = 2705134163151418</div>
  </div>
  </div>
</div>`)
}

/* ══ PÁGINA 8 — a régua da planilha ══════════════════════════════════════ */
{
    const carteira = PL_COMPRARAM.filter(r => !r.lead)
    const vgvMidia = PL_COMPRARAM_MIDIA.reduce((s, r) => s + r.vgv, 0)
    const vgvCarteira = carteira.reduce((s, r) => s + r.vgv, 0)
    const porSdr = {}
    for (const r of carteira) (porSdr[r.sdr || '(sem SDR)'] ||= []).push(r)
    const cmp = r => `<tr>
      <td class="rot">${esc(r.nome)}</td>
      <td class="txt">${r.lead ? `<b style="color:#c9a84c">mídia</b> · ${esc(r.lead.origem.replace(/^Meta — /, ''))}, lead ${dbr(r.lead.data)}` : `carteira · ${esc(r.sdr || '—')}`}</td>
      <td class="txt">${r.ficha ? `${dbr(r.ficha.data)} · ${esc(r.ficha.veredito)}` : '—'}</td>
      <td class="txt">${esc(r.eventos[0] || '')}${r.lotes.length ? ` · lote${r.lotes.length > 1 ? 's' : ''} ${esc(r.lotes.join(', '))}` : ''}</td>
      <td>${r.animais}</td>
      <td class="${r.provisorio ? 'alerta' : ''}">${brl0(r.vgv)}${r.provisorio ? ' *' : ''}</td></tr>`
    paginas.push(`<div class="quadro">
  ${topo(paginas.length + 1, TOTAL_PAG)}
  <h1>A régua da planilha <span>— o que a operação entregou</span></h1>
  <div class="sub">o funil das páginas anteriores mede <b>só o que a verba pagou</b>; a aba CADASTROS mede <b>tudo que foi levado à leiloeira</b><br>
  as duas estão certas e medem coisas diferentes — e é a segunda que explica o dinheiro que entrou no período</div>
  <div class="corpo">
  <table>
    <thead><tr><th class="l" colspan="2">Etapa no período</th><th>Funil de mídia</th><th>Aba CADASTROS</th><th class="l">A diferença é</th></tr></thead>
    <tbody>
      <tr><td class="i">1</td><td class="rot">Cadastros submetidos</td><td class="real">${CONSOLIDADO.fichas.length}</td><td class="real">${PL_JANELA.length}</td>
        <td class="txt">${PL_JANELA.length - PL_MIDIA.length} linhas de <b>carteira de assessor</b> — pessoa que nunca foi lead pago</td></tr>
      <tr><td class="i">2</td><td class="rot">Com lead de mídia por trás</td><td class="real">${CONSOLIDADO.fichas.length + ORG.fichas.length}</td><td class="real">${PL_MIDIA.length}</td>
        <td class="txt">as duas quase batem — a planilha ainda não tem ${Math.max(0, CONSOLIDADO.fichas.length + ORG.fichas.length - PL_MIDIA.length)} das fichas que os grupos mostram, e traz ${PL_MIDIA.filter(r => r.lead && r.lead.data < DE).length} de safra anterior (EAO, São Geraldo)</td></tr>
      <tr><td class="i">3</td><td class="rot">Aprovados</td><td class="real">${CONSOLIDADO.aprovados.length}</td><td class="real">${PL_APROV.length}</td>
        <td class="txt">+${PL_RESSALVA.length} com ressalva (limite ou cautela). Aprovação de ${pct(PL_APROV.length + PL_RESSALVA.length, PL_JANELA.length, 0)} contando ressalva</td></tr>
      <tr><td class="i">4</td><td class="rot">Compraram no período</td><td class="real">${CONSOLIDADO.clientes.length}</td><td class="real" style="color:#c9a84c">${PL_COMPRARAM.length}</td>
        <td class="txt"><b>é aqui que a diferença pesa</b> — ${carteira.length} dos ${PL_COMPRARAM.length} são carteira</td></tr>
      <tr><td class="i">5</td><td class="rot">Faturamento gerado</td><td class="real">${brl0(CONSOLIDADO.faturamento)}</td><td class="real" style="color:#c9a84c">${brl0(PL_VGV)}</td>
        <td class="txt">${brl0(vgvMidia)} de mídia + ${brl0(vgvCarteira)} de carteira</td></tr>
    </tbody>
  </table>
  <div class="destaque">
    ${cx('Compraram no período', String(PL_COMPRARAM.length), `contra ${CONSOLIDADO.clientes.length} pelo funil de mídia`)}
    ${cx('Faturamento', brl0(PL_VGV), `${PL_COMPRARAM.reduce((s, r) => s + r.animais, 0)} animais · ticket ${brl0(PL_VGV / PL_COMPRARAM.reduce((s, r) => s + r.animais, 0))}`)}
    ${cx('Veio da mídia', pct(vgvMidia, PL_VGV, 0), `${brl0(vgvMidia)} de ${PL_COMPRARAM_MIDIA.length} compradores`)}
    ${cx('Veio de carteira', pct(vgvCarteira, PL_VGV, 0), `${brl0(vgvCarteira)} — ${Object.entries(porSdr).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `${k.split(' ')[0]} ${v.length}`).join(', ')}`)}
  </div>
  <h2>Os ${PL_COMPRARAM.length} compradores do período <small>— cadastro da planilha que virou compra entre ${dbr(DE)} e ${dbr(ATE)}</small></h2>
  <table class="densa">
    <thead><tr><th class="l">Comprador</th><th class="l">Origem</th><th class="l">Ficha</th><th class="l">Compra</th><th>Animais</th><th>VGV</th></tr></thead>
    <tbody>${PL_COMPRARAM.map(cmp).join('')}
      <tr class="faixa"><td colspan="6">Total</td></tr>
      <tr><td class="rot">Total</td><td></td><td></td><td></td><td>${PL_COMPRARAM.reduce((s, r) => s + r.animais, 0)}</td><td class="real" style="font-size:16px">${brl0(PL_VGV)}</td></tr>
    </tbody>
  </table>
  <h2>As ${PL_JANELA.length} linhas da aba CADASTROS no período <small>— e de onde cada uma veio</small></h2>
  <table class="densa">
    <thead><tr><th class="l">Ficha</th><th class="l">Pessoa</th><th class="l">SDR</th><th class="l">Origem</th><th class="l">Veredito</th><th class="l">Comprou</th></tr></thead>
    <tbody>${PL_JANELA.slice().sort((a, b) => String(a.data).localeCompare(String(b.data))).map(r => `<tr>
      <td class="rot">${dbr(r.data)}</td><td class="txt">${esc(r.nome)}</td><td class="txt">${esc(r.sdr || '—')}</td>
      <td class="txt">${r.lead ? esc(r.lead.origem.replace(/^Meta — /, '')) + ` <span style="color:#7d7568">(${dbr(r.lead.data)})</span>` : '<span style="color:#7d7568">carteira</span>'}</td>
      <td class="txt ${r.ficha && APROVADA(r.ficha) ? 'destaca' : r.ficha?.veredito === 'ressalva' ? 'alerta' : ''}">${esc(r.ficha?.veredito || '—')}</td>
      <td class="txt ${r.comprouNaJanela ? 'destaca' : ''}">${r.comprouNaJanela ? brl0(r.vgv) + (r.provisorio ? ' *' : '') : '—'}</td></tr>`).join('')}</tbody>
  </table>
  <div class="rodape">
    <span class="alerta"><b>Por que os dois números são verdadeiros.</b></span> O funil das páginas 1 a 6 responde “<b>o que a verba de mídia comprou</b>”: só entra quem foi lead pago de uma campanha que estava no ar na janela. Esta página responde “<b>o que a operação de cadastro entregou</b>”: entra tudo que a equipe levou à leiloeira, inclusive cliente que o assessor já tinha na carteira e nunca custou um centavo de anúncio.<br>
    <b>A carteira sustentou o período.</b> ${brl0(vgvCarteira)} dos ${brl0(PL_VGV)} vieram de gente sem lead — ${Object.entries(porSdr).sort((a, b) => b[1].reduce((s, x) => s + x.vgv, 0) - a[1].reduce((s, x) => s + x.vgv, 0)).map(([k, v]) => `<b>${esc(k)}</b> com ${brl0(v.reduce((s, x) => s + x.vgv, 0))}`).join(' e ')}. A mídia trouxe ${brl0(vgvMidia)}, e um dos dois compradores dela (Francisco Aluízio) é lead de 09/07.<br>
    <b>Duas compras são de ficha anterior à janela.</b> Adriano de Oliveira (ficha 11/08) e Farley Azevedo Oliveira (ficha 14/08) compraram ${brl0(53100 + 54000)} no Terra Brava de 15/08 — a ficha é da primeira quinzena, a compra é desta. Contam como faturamento do período, não como cadastro dele.<br>
    <span class="alerta"><b>* Provisório.</b></span> O ERP HastaPro só desceu até ${dbr(ultimoErp)}. Reginaldo e Luis Diehl compraram em 05/09 e só existem como lance cantado, onde o valor é a parcela — VGV aqui é parcela × 30, a régua da casa, a conferir lote a lote quando o HastaPro descer.<br>
    <b>A aba CADASTROS não tem coluna de data.</b> A data de cada linha veio da ficha correspondente nos grupos (varredura de 08/09); quando a ficha não foi achada, da entrada do lead. Das ${PLANILHA.length} linhas de agosto e setembro, ${PL_JANELA.length} caem nesta janela — as outras ${PLANILHA.length - PL_JANELA.length} são da primeira quinzena de agosto ou não têm prova de data.
    <div class="assinatura">Apurado em ${HOJE} · aba CADASTROS da planilha “Leads - Bula Assessoria” cruzada com HastaPro, fechamentos, lances do grupo e compras manuais</div>
  </div>
  </div>
</div>`)
}

/* ══ PÁGINA 9 — anexo nominal ════════════════════════════════════════════ */
{
    const cor = v => v === 'aprovado' ? 'destaca' : v === 'ressalva' ? 'alerta' : v === 'recusado' ? '' : ''
    paginas.push(`<div class="quadro">
  ${topo(paginas.length + 1, TOTAL_PAG)}
  <h1>Anexo <span>— nome por nome</span></h1>
  <div class="sub">as ${CASADAS.length} fichas de cadastro da janela que nasceram de um lead de mídia, e os compradores<br>as outras ${FORA.length} fichas do período são de carteira de assessor e não pertencem a este funil</div>
  <div class="corpo">
  <h2>Cadastros submetidos que vieram do funil <small>— ${CASADAS.length} fichas</small></h2>
  <table class="densa">
    <thead><tr><th class="l">Data</th><th class="l">Pessoa</th><th class="l">Campanha</th><th class="l">Lead em</th><th class="l">Casou por</th><th class="l">Grupo</th><th class="l">Veredito</th></tr></thead>
    <tbody>${CASADAS.map(f => `<tr>
      <td class="rot">${dbr(f.data)}</td><td class="txt">${esc(f.nome)}</td><td class="txt">${esc(f.campanha)}</td>
      <td class="txt">${dbr(f.leadData)}</td><td class="txt">${esc(f.via)}</td><td class="txt">${esc(f.grupo)}</td>
      <td class="txt ${cor(f.veredito)}">${esc(f.veredito)}</td></tr>`).join('')}</tbody>
  </table>
  <h2>Compradores <small>— quem fechou o funil inteiro</small></h2>
  <table class="densa">
    <thead><tr><th class="l">Comprador</th><th class="l">Campanha</th><th class="l">Lead</th><th class="l">Ficha</th><th class="l">Compra</th><th>Animais</th><th>Valor</th></tr></thead>
    <tbody>
      ${CLIENTES.map(c => { const fi = CASADAS.find(f => nomeNorm(f.nome).includes(nomeNorm(c.nome).split(' ')[0]) && f.campanha === c.campanha)
        return `<tr><td class="rot">${esc(c.nome)}</td><td class="txt">${esc(c.campanha)}</td><td class="txt">${dbr(c.leadData)}</td>
        <td class="txt">${fi ? `${dbr(fi.data)} · ${esc(fi.veredito)}` : '—'}</td>
        <td class="txt">${esc(c.eventos.join(' · '))}</td><td>${c.animais}</td>
        <td class="${c.provisorio ? 'alerta' : ''}">${brl0(c.valor)}${c.provisorio ? ' *' : ''}</td></tr>` }).join('')}
      ${FORA_DA_JANELA.map(c => `<tr><td class="rot">${esc(c.nome)}</td><td class="txt">${esc(c.origem)} <small style="color:#7d7568">(lead de fora da janela)</small></td><td class="txt">${dbr(c.leadData)}</td><td class="txt">${fichaDeFora(c.nome)}</td><td class="txt">${esc(c.eventos.join(' · '))}</td><td>${c.animais}</td><td>${brl0(c.valor)}</td></tr>`).join('')}
    </tbody>
  </table>
  <h2>As ${FORA.length} fichas do período que NÃO são deste funil</h2>
  <table class="densa">
    <thead><tr><th class="l">Quem levou</th><th>Fichas</th><th class="l">Situação</th></tr></thead>
    <tbody>${(() => {
        const porQuem = {}
        for (const f of FORA) { const k = f.quem || '(sem remetente)'; (porQuem[k] ||= []).push(f) }
        return Object.entries(porQuem).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `<tr>
          <td class="rot">${esc(k)}</td><td>${v.length}</td>
          <td class="txt">${v.filter(APROVADA).length} aprovada(s), ${v.filter(f => f.veredito === 'ressalva').length} com ressalva, ${v.filter(f => f.veredito === 'recusado').length} recusada(s), ${v.filter(f => f.veredito === 'pendente').length} sem veredito${v.some(f => f.leadAntigo) ? ` · ${v.filter(f => f.leadAntigo).length} era lead de campanha ANTERIOR` : ''}</td></tr>`).join('')
    })()}</tbody>
  </table>
  <div class="rodape">
    <span class="alerta"><b>* Valor provisório.</b></span> O ERP HastaPro só desceu até <b>${dbr(ultimoErp)}</b>: nenhum leilão de setembro está lá ainda. A compra do Reginaldo em 05/09 existe hoje só como lance cantado no grupo, onde o valor é a <b>parcela</b> (R$ ${br(CLIENTES.filter(c => c.provisorio).reduce((s, c) => s + c.parcela, 0))}/mês em 4 lotes). O VGV acima é parcela × 30, a régua da casa — conferir lote a lote quando o HastaPro descer.<br>
    <b>Quem posta a ficha classifica a origem.</b> Douglas Bispo, Marcelo Carneiro, Pedro Pereira, Luana Cruz e João Antônio são marketing — ficha deles nasce de lead. Fábio Omena e Leonardo Serafim são assessores comerciais, de carteira própria: ficha deles não pertence ao funil de mídia, e é isso que explica ${FORA.filter(f => /omena/i.test(f.quem || '')).length} das ${FORA.length} fichas de fora.<br>
    <b>Uma ficha de fora merece nota:</b> Francisco Aluízio de Faria era lead de <b>09/07</b> (campanha EAO, fora desta janela), teve ficha em 18/08 com ressalva e comprou ${brl0(FORA_DA_JANELA[0]?.valor || 0)} no Melhoradores de 29/08. É a prova do ciclo: entre o lead e a compra passaram ${Math.round((new Date('2026-08-29') - new Date('2026-07-09')) / 86400000)} dias.<br>
    <b>Base do anexo.</b> Fichas: varredura de 08/09 dos grupos “Cadastros Bula Remates” e “Cadastros Bula e Programa”, lida mensagem a mensagem com os ${'166'} anexos abertos. Casamento: CPF, telefone ou nome (nome de um termo só não vale). Compras: ERP HastaPro, fechamentos, lances do grupo e compra manual do assessor.
    <div class="assinatura">Apurado em ${HOJE} · a planilha nominal completa está no XLSX que acompanha este PDF</div>
  </div>
  </div>
</div>`)
}

/* ══ criativos ═══════════════════════════════════════════════════════════ */
function leadsPorAnuncio() {
    const m = {}
    for (const r of LEADS) {
        const id = String(r['ad_id'] || '').trim(); if (!id) continue
        m[id] ||= { leads: 0, mqls: 0 }
        m[id].leads++; if (ehMql(r)) m[id].mqls++
    }
    return m
}
var _lpa = null
function LPA() { return (_lpa ||= leadsPorAnuncio()) }
function criativosHtml(campanha, comCampanha = false) {
    return M.anuncios.filter(a => a.campanha === campanha && a.investido > 0).map(a => {
        const l = LPA()[a.id] || { leads: 0, mqls: 0 }
        return `<tr><td class="rot">${esc(a.nome)}<br><span style="color:#7d7568;font-weight:400;text-transform:none;font-size:10.5px">${esc(a.conjunto)}</span></td>
      ${comCampanha ? `<td class="txt">${esc(a.campanha)}</td>` : ''}
      <td>${brl(a.investido)}</td><td>${br(a.impressoes)}</td>
      <td class="${a.ctr >= 1.2 ? 'destaca' : ''}">${String(a.ctr).replace('.', ',')}%</td>
      <td>${l.leads || '—'}</td><td>${l.mqls || '—'}</td>
      <td>${l.leads ? brl(a.investido / l.leads) : '—'}</td>
      ${comCampanha ? '' : `<td class="${l.mqls && a.investido / l.mqls <= METAS.cpmql ? 'destaca' : ''}">${l.mqls ? brl(a.investido / l.mqls) : '—'}</td>`}</tr>`
    }).join('')
}
function rankingCriativos() {
    const com = M.anuncios.filter(a => a.investido >= 40).map(a => {
        const l = LPA()[a.id] || { leads: 0, mqls: 0 }
        return { ...a, ...l, cpl: l.leads ? a.investido / l.leads : null, cpmql: l.mqls ? a.investido / l.mqls : null }
    })
    const ord = [...com.filter(a => a.cpmql).sort((x, y) => x.cpmql - y.cpmql), ...com.filter(a => !a.cpmql).sort((x, y) => y.investido - x.investido)]
    const mostra = [...ord.slice(0, 5), ...ord.slice(-3)]
    const vistos = new Set()
    return mostra.filter(a => !vistos.has(a.id) && vistos.add(a.id)).map(a => `<tr>
    <td class="rot">${esc(a.nome)}</td><td class="txt">${esc(a.campanha)}</td>
    <td>${brl(a.investido)}</td><td class="${a.ctr >= 1.2 ? 'destaca' : ''}">${String(a.ctr).replace('.', ',')}%</td>
    <td>${a.leads || '—'}</td><td>${a.mqls || '—'}</td>
    <td>${a.cpl ? brl(a.cpl) : '—'}</td>
    <td class="${a.cpmql && a.cpmql <= METAS.cpmql ? 'destaca' : a.cpmql ? '' : 'alerta'}">${a.cpmql ? brl(a.cpmql) : 'nenhum MQL'}</td></tr>`).join('')
}

/* ══ render ══════════════════════════════════════════════════════════════ */
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Funil das campanhas — 15/08 a 09/09/2026 — Bula Assessoria</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
${paginas.join('\n')}
</body></html>`

const htmlPath = path.join(OUT, 'funil-campanhas-15ago-09set-2026.html')
fs.writeFileSync(htmlPath, html)

/**
 * Uma folha por quadro, cada uma com a ALTURA do próprio conteúdo — é o que os
 * quadros anteriores faziam, e é o que impede a tabela de ser cortada no meio.
 * Depois as folhas viram um PDF só (pdf-lib), que é o que o chefe abre.
 */
const pdfPath = path.join(MESA, 'Bula — Funil das campanhas 15-08 a 09-09-2026.pdf')
const { chromium } = await import('playwright')
const { PDFDocument } = await import('pdf-lib')
const nav = await chromium.launch()
const folhas = []
try {
    for (const [i, corpo] of paginas.entries()) {
        const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}
  @page { size: 1000px auto; margin: 0 }
  .quadro { min-height: 0; page-break-after: auto }</style></head><body>${corpo}</body></html>`
        const page = await nav.newPage({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 2 })
        await page.setContent(doc, { waitUntil: 'networkidle' })
        const el = await page.$('.quadro')
        const altura = Math.ceil((await el.boundingBox()).height)
        const f = path.join(OUT, `pagina-${String(i + 1).padStart(2, '0')}.pdf`)
        await page.pdf({ path: f, width: '1000px', height: `${altura}px`, printBackground: true, pageRanges: '1' })
        folhas.push(f)
        if (i === 0) await el.screenshot({ path: path.join(OUT, 'capa.png') })
        await page.close()
        console.log(`  folha ${i + 1}/${paginas.length} · ${altura}px`)
    }
} finally { await nav.close() }
const juntas = await PDFDocument.create()
for (const f of folhas) {
    const src = await PDFDocument.load(fs.readFileSync(f))
    const [p] = await juntas.copyPages(src, [0])
    juntas.addPage(p)
}
juntas.setTitle('Bula Assessoria — Funil das campanhas 15/08 a 09/09/2026')
fs.writeFileSync(pdfPath, await juntas.save())
for (const f of folhas) fs.unlinkSync(f)

/* ══ XLSX nominal ════════════════════════════════════════════════════════ */
const wb = novoWorkbook('Funil das campanhas 15/08–09/09/2026')
{
    const ws = novaAba(wb, 'Funil')
    let r = cabecalho(ws, 'Funil das campanhas — 15/08 a 09/09/2026', 'Cinco campanhas da conta CA2. Leads da planilha ao vivo, cadastros da varredura dos grupos de 08/09, compras do ERP e dos lances.', 13)
    r = blocoXlsx(ws, r, 'Por campanha', 13)
    r = tabela(ws, r, [
        { t: 'Campanha', k: 'nome', w: 22 }, { t: 'Investido', k: 'inv', w: 13, fmt: MOEDA_RS, al: 'r' },
        { t: 'Impressões', k: 'imp', w: 12, fmt: INT, al: 'r' }, { t: 'Cliques', k: 'cli', w: 10, fmt: INT, al: 'r' },
        { t: 'CTR', k: 'ctr', w: 8, fmt: PCT, al: 'r' }, { t: 'Leads', k: 'leads', w: 8, fmt: INT, al: 'r' },
        { t: 'MQL', k: 'mql', w: 8, fmt: INT, al: 'r' }, { t: 'MQL %', k: 'mqlp', w: 9, fmt: PCT, al: 'r' },
        { t: 'Cadastros', k: 'cad', w: 10, fmt: INT, al: 'r' }, { t: 'Aprovados', k: 'apr', w: 10, fmt: INT, al: 'r' },
        { t: 'Clientes', k: 'cliq', w: 9, fmt: INT, al: 'r' }, { t: 'CPL', k: 'cpl', w: 12, fmt: MOEDA_RS, al: 'r' },
        { t: 'CPMQL', k: 'cpmql', w: 12, fmt: MOEDA_RS, al: 'r' },
    ], [
        ...PORCAMPANHA.map(c => ({ nome: c.nome, inv: c.investido, imp: c.impressoes, cli: c.cliques, ctr: c.ctr / 100, leads: c.leads, mql: c.mqls, mqlp: c.leads ? c.mqls / c.leads : null, cad: c.fichas, apr: c.aprovados, cliq: c.clientes, cpl: c.cpl, cpmql: c.cpmql })),
        { nome: 'Orgânico / direto', inv: null, leads: ORG.leads.length, mql: ORG.mqls.length, mqlp: ORG.leads.length ? ORG.mqls.length / ORG.leads.length : null, cad: ORG.fichas.length, apr: ORG.aprovados.length, cliq: ORG.clientes.length },
        { __total: true, nome: 'TOTAL (5 pagas)', inv: CONSOLIDADO.m.investido, imp: CONSOLIDADO.m.impressoes, cli: CONSOLIDADO.m.cliques, ctr: CONSOLIDADO.m.cliques / CONSOLIDADO.m.impressoes, leads: CONSOLIDADO.leads.length, mql: CONSOLIDADO.mqls.length, mqlp: CONSOLIDADO.mqls.length / CONSOLIDADO.leads.length, cad: CONSOLIDADO.fichas.length, apr: CONSOLIDADO.aprovados.length, cliq: CONSOLIDADO.clientes.length, cpl: CONSOLIDADO.m.investido / CONSOLIDADO.leads.length, cpmql: CONSOLIDADO.m.investido / CONSOLIDADO.mqls.length },
    ])
}
{
    const ws = novaAba(wb, 'Leads')
    let r = cabecalho(ws, 'Leads da janela', `${LEADS.length} pessoas distintas · dedup por telefone, e-mail e nome · MQL = 100+ cabeças com inscrição estadual`, 11)
    r = tabela(ws, r, [
        { t: 'Data', k: 'data', w: 12 }, { t: 'Nome', k: 'nome', w: 30 }, { t: 'WhatsApp', k: 'fone', w: 17 },
        { t: 'UF', k: 'uf', w: 6, al: 'c' }, { t: 'Cabeças', k: 'cab', w: 16 }, { t: 'I.E.', k: 'ie', w: 7, al: 'c' },
        { t: 'Interesse', k: 'int', w: 14 }, { t: 'MQL', k: 'mql', w: 7, al: 'c' },
        { t: 'Campanha', k: 'camp', w: 20 }, { t: 'Canal', k: 'canal', w: 12 }, { t: 'Anúncio', k: 'ad', w: 34 },
    ], LEADS.map(x => ({
        data: iso(x['Data']).split('-').reverse().join('/'), nome: x['Nome'], fone: x['WhatsApp'], uf: x['UF'],
        cab: x['Cabeças'], ie: x['Inscrição Estadual'], int: x['Interesse'], mql: ehMql(x) ? 'SIM' : '',
        camp: campanhaDe(x), canal: ehInstantaneo(x) ? 'formulário' : 'landing', ad: x['ad_name'],
    })).sort((a, b) => a.data.split('/').reverse().join('').localeCompare(b.data.split('/').reverse().join(''))))
}
{
    const ws = novaAba(wb, 'Cadastros')
    let r = cabecalho(ws, 'Cadastros submetidos na janela', `${CASADAS.length} do funil de mídia · ${FORA.length} de carteira de assessor · fonte: varredura dos grupos de 08/09`, 8)
    r = blocoXlsx(ws, r, 'Do funil de mídia', 8)
    r = tabela(ws, r, [
        { t: 'Data', k: 'data', w: 12 }, { t: 'Pessoa', k: 'nome', w: 36 }, { t: 'CPF/CNPJ', k: 'cpf', w: 20 },
        { t: 'Campanha', k: 'camp', w: 20 }, { t: 'Lead em', k: 'lead', w: 12 }, { t: 'Casou por', k: 'via', w: 15 },
        { t: 'Grupo', k: 'grupo', w: 20 }, { t: 'Veredito', k: 'ver', w: 14 },
    ], CASADAS.map(f => ({ data: dbr(f.data), nome: f.nome, cpf: f.cpf || '', camp: f.campanha, lead: dbr(f.leadData), via: f.via, grupo: f.grupo, ver: f.veredito })))
    r = blocoXlsx(ws, r + 1, 'Fora do funil (carteira de assessor)', 8)
    r = tabela(ws, r, [
        { t: 'Data', k: 'data', w: 12 }, { t: 'Pessoa', k: 'nome', w: 36 }, { t: 'CPF/CNPJ', k: 'cpf', w: 20 },
        { t: 'Quem levou', k: 'quem', w: 20 }, { t: 'Lead anterior', k: 'ant', w: 12 }, { t: 'Origem do lead', k: 'orig', w: 15 },
        { t: 'Grupo', k: 'grupo', w: 20 }, { t: 'Veredito', k: 'ver', w: 14 },
    ], FORA.map(f => ({ data: dbr(f.data), nome: f.nome, cpf: f.cpf || '', quem: f.quem || '', ant: f.leadAntigo ? dbr(f.leadAntigo.data) : '', orig: f.leadAntigo ? f.leadAntigo.origem : 'sem lead', grupo: f.grupo, ver: f.veredito })), { larguras: false })
}
{
    const ws = novaAba(wb, 'Compradores')
    let r = cabecalho(ws, 'Compradores vindos da mídia', `ERP HastaPro só tem leilão até ${dbr(ultimoErp)} · valores marcados “provisório” vêm do lance cantado (parcela × 30)`, 8)
    r = tabela(ws, r, [
        { t: 'Comprador', k: 'nome', w: 34 }, { t: 'Campanha / origem', k: 'camp', w: 26 }, { t: 'Lead em', k: 'lead', w: 12 },
        { t: 'Evento', k: 'ev', w: 44 }, { t: 'Animais', k: 'an', w: 9, fmt: INT, al: 'r' },
        { t: 'Valor', k: 'v', w: 15, fmt: MOEDA_RS, al: 'r' }, { t: 'Fonte', k: 'f', w: 22 }, { t: 'Status', k: 's', w: 14 },
    ], [
        ...CLIENTES.map(c => ({ nome: c.nome, camp: c.campanha, lead: dbr(c.leadData), ev: c.eventos.join(' · '), an: c.animais, v: c.valor, f: c.fonte, s: c.provisorio ? 'provisório' : 'confirmado' })),
        ...FORA_DA_JANELA.map(c => ({ nome: c.nome, camp: c.origem + ' (lead de fora da janela)', lead: dbr(c.leadData), ev: c.eventos.join(' · '), an: c.animais, v: c.valor, f: 'ERP HastaPro', s: 'confirmado' })),
    ])
}
{
    const ws = novaAba(wb, 'Planilha CADASTROS')
    let r = cabecalho(ws, 'A régua da planilha — aba CADASTROS', `${PLANILHA.length} linhas de agosto e setembro · ${PL_JANELA.length} com data dentro da janela · ${PL_COMPRARAM.length} compraram no período (${brl(PL_VGV)})`, 9)
    r = tabela(ws, r, [
        { t: 'Linha', k: 'l', w: 7, al: 'r' }, { t: 'Ficha', k: 'd', w: 12 }, { t: 'Na janela', k: 'j', w: 10, al: 'c' },
        { t: 'Pessoa', k: 'nome', w: 34 }, { t: 'SDR', k: 'sdr', w: 18 },
        { t: 'Origem', k: 'orig', w: 40 }, { t: 'Veredito', k: 'ver', w: 13 },
        { t: 'Comprou', k: 'ev', w: 46 }, { t: 'VGV', k: 'v', w: 15, fmt: MOEDA_RS, al: 'r' },
    ], PLANILHA.slice().sort((a, b) => String(a.data).localeCompare(String(b.data))).map(x => ({
        l: x.linha, d: x.data ? dbr(x.data) : '', j: x.dentro ? 'SIM' : '', nome: x.nome, sdr: x.sdr || '',
        orig: x.lead ? `${x.lead.origem} (lead ${dbr(x.lead.data)})` : 'carteira de assessor',
        ver: x.ficha?.veredito || '', ev: x.comprouNaJanela ? x.eventos.join(' · ') : '', v: x.comprouNaJanela ? x.vgv : null,
    })))
}
{
    const ws = novaAba(wb, 'Criativos')
    let r = cabecalho(ws, 'Criativos da janela', 'Leads e MQL casados pelo id do anúncio contra a planilha ao vivo', 9)
    r = tabela(ws, r, [
        { t: 'Anúncio', k: 'nome', w: 40 }, { t: 'Campanha', k: 'camp', w: 20 }, { t: 'Conjunto', k: 'cj', w: 44 },
        { t: 'Investido', k: 'inv', w: 13, fmt: MOEDA_RS, al: 'r' }, { t: 'Impressões', k: 'imp', w: 12, fmt: INT, al: 'r' },
        { t: 'CTR', k: 'ctr', w: 8, fmt: PCT, al: 'r' }, { t: 'Leads', k: 'l', w: 8, fmt: INT, al: 'r' },
        { t: 'MQL', k: 'q', w: 8, fmt: INT, al: 'r' }, { t: 'CPMQL', k: 'cpmql', w: 13, fmt: MOEDA_RS, al: 'r' },
    ], M.anuncios.filter(a => a.investido > 0).sort((a, b) => b.investido - a.investido).map(a => {
        const l = LPA()[a.id] || { leads: 0, mqls: 0 }
        return { nome: a.nome, camp: a.campanha, cj: a.conjunto, inv: a.investido, imp: a.impressoes, ctr: a.ctr / 100, l: l.leads, q: l.mqls, cpmql: l.mqls ? a.investido / l.mqls : null }
    }))
}
const xlsxPath = path.join(MESA, 'Bula — Funil das campanhas 15-08 a 09-09-2026.xlsx')
await wb.xlsx.writeFile(xlsxPath)

/* ══ resumo no terminal ══════════════════════════════════════════════════ */
console.log(`\nPDF   ${pdfPath}`)
console.log(`XLSX  ${xlsxPath}`)
console.log(`HTML  ${htmlPath}\n`)
console.log(`janela ${DE} → ${ATE} · ${DIAS} dias`)
console.log(`mídia CA2 ${brl(CONSOLIDADO.m.investido)} + CA1 ${brl(M.ca1.reduce((s, c) => s + c.investido, 0))} = ${brl(CONSOLIDADO.m.investido + M.ca1.reduce((s, c) => s + c.investido, 0))}`)
console.log(`leads ${CONSOLIDADO.leads.length} (+${ORG.leads.length} orgânicos) · MQL ${CONSOLIDADO.mqls.length} · cadastros ${CONSOLIDADO.fichas.length} · aprovados ${CONSOLIDADO.aprovados.length} (+${CONSOLIDADO.comRessalva.length - CONSOLIDADO.aprovados.length} com ressalva) · clientes ${CONSOLIDADO.clientes.length}`)
for (const c of PORCAMPANHA) console.log(`  ${c.nome.padEnd(18)} ${brl(c.investido).padStart(12)} · ${String(c.leads).padStart(3)} leads · ${String(c.mqls).padStart(3)} MQL · ${String(c.fichas).padStart(2)} cad · ${String(c.aprovados).padStart(2)} apr · ${String(c.clientes).padStart(1)} cli`)
console.log(`\nrégua da PLANILHA (aba CADASTROS): ${PLANILHA.length} linhas ago+set · ${PL_JANELA.length} na janela · ${PL_MIDIA.length} com lead de mídia · ${PL_APROV.length} aprovadas +${PL_RESSALVA.length} ressalva · ${PL_COMPRARAM.length} compraram ${brl(PL_VGV)} (${PL_COMPRARAM_MIDIA.length} de mídia, ${brl(PL_COMPRARAM_MIDIA.reduce((s, r) => s + r.vgv, 0))})`)
for (const r of PL_COMPRARAM.sort((a, b) => b.vgv - a.vgv)) console.log(`  ${r.nome.slice(0, 30).padEnd(32)} ${brl(r.vgv).padStart(13)}${r.provisorio ? ' *' : '  '} · ${r.animais} an · ${r.lead ? 'MÍDIA ' + r.lead.origem.slice(0, 34) : 'carteira (' + r.sdr + ')'} · ${r.eventos.join(' ; ')}`)
fs.writeFileSync(path.join(OUT, 'apuracao.json'), JSON.stringify({
    janela: { de: DE, ate: ATE, dias: DIAS }, midia: { ca2: CONSOLIDADO.m, ca1: M.ca1 },
    consolidado: { leads: CONSOLIDADO.leads.length, mqls: CONSOLIDADO.mqls.length, fichas: CONSOLIDADO.fichas.length, aprovados: CONSOLIDADO.aprovados.length, comRessalva: CONSOLIDADO.comRessalva.length, clientes: CONSOLIDADO.clientes.length, faturamento: CONSOLIDADO.faturamento },
    porCampanha: PORCAMPANHA.map(({ d, ...c }) => c), organico: { leads: ORG.leads.length, mqls: ORG.mqls.length, fichas: ORG.fichas.length },
    reguaDaPlanilha: {
        linhasAgoSet: PLANILHA.length, naJanela: PL_JANELA.length, comLeadDeMidia: PL_MIDIA.length,
        aprovados: PL_APROV.length, ressalva: PL_RESSALVA.length,
        compraram: PL_COMPRARAM.length, vgv: PL_VGV,
        deMidia: { n: PL_COMPRARAM_MIDIA.length, vgv: PL_COMPRARAM_MIDIA.reduce((s, r) => s + r.vgv, 0) },
        detalhe: PL_COMPRARAM.map(r => ({ nome: r.nome, sdr: r.sdr, ficha: r.ficha?.data || null, veredito: r.ficha?.veredito || null, lead: r.lead ? { data: r.lead.data, origem: r.lead.origem } : null, eventos: r.eventos, lotes: r.lotes, animais: r.animais, vgv: r.vgv, provisorio: r.provisorio })),
        linhas: PL_JANELA.map(r => ({ linha: r.linha, data: r.data, nome: r.nome, sdr: r.sdr, veredito: r.ficha?.veredito || null, lead: r.lead ? { data: r.lead.data, origem: r.lead.origem } : null, comprou: r.comprouNaJanela, vgv: r.comprouNaJanela ? r.vgv : 0 })),
    },
    cadastros: CASADAS, foraDoFunil: FORA.map(({ leadAntigo, ...f }) => ({ ...f, leadAntigo: leadAntigo ? { data: leadAntigo.data, origem: leadAntigo.origem } : null })),
    clientes: CLIENTES, compradoresDeFora: FORA_DA_JANELA,
    higiene: { linhas: naJanela.length, validos: validos.length, unicos: LEADS.length, duplicados, testes, ufTorta },
    erpAte: ultimoErp, agenda: AGENDA.map(a => ({ data: String(a.data).slice(0, 10), nome: a.nome, leiloeira: a.leiloeira })),
}, null, 1))
