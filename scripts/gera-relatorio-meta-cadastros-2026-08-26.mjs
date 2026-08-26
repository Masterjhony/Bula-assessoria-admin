/**
 * POSIÇÃO DA META DE CADASTROS — AGOSTO/2026 (pedido do Marcelo, 26/08 08:20).
 *
 *   node scripts/gera-relatorio-meta-cadastros-2026-08-26.mjs [pasta-de-saida]
 *
 * Sai um PDF (para o grupo) e um XLSX (para conferir nome a nome).
 *
 * TRÊS FONTES, NENHUMA SOZINHA BASTA:
 *   1. PLANILHA "Leads - Bula Assessoria" — fonte do lead e da etapa que a
 *      equipe trabalha. Diz quem virou CADASTRO OK, não diz se a leiloeira
 *      decidiu.
 *   2. GRUPOS de cadastro no WhatsApp ("Cadastros Bula Remates" e "Cadastros
 *      Bula e Programa") — onde a leiloeira REALMENTE aprova ou reprova. Lido
 *      mensagem a mensagem em scripts/lib/cadastros-agosto-2026.mjs, com a ficha
 *      em imagem/PDF baixada do Storage quando o texto não traz o nome.
 *   3. META ADS (conta CA2) — investimento e entrega.
 *
 * ⚠ A LIÇÃO QUE ESTE RELATÓRIO CARREGA: cadastro que aparece no grupo NÃO é,
 * por padrão, cadastro do funil de mídia. Em agosto, 6 dos 39 têm prova de que
 * a pessoa era lead de anúncio; o resto é prospecção do assessor. Somar tudo
 * numa linha só e comparar com a meta do quadro (que é MQL × 40%) infla a
 * conversão da mídia em seis vezes. Por isso o placar tem duas colunas, e a
 * origem de cada cadastro é apurada em scripts/lib/origem-cadastros-2026.mjs
 * com regra dura de matching (CPF/telefone/nome com 2+ tokens).
 *
 * O sistema (cliente_leiloeira_cadastro) NÃO é fonte: em agosto registrou 3 das
 * 39 fichas. Ver a memória "aprovacoes-leiloeira-nao-entram-no-sistema".
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { CADASTROS_AGOSTO } from './lib/cadastros-agosto-2026.mjs'
import { indexaUniverso, casaNoUniverso, classifica, provaDe, nomeNorm, foneKey } from './lib/origem-cadastros-2026.mjs'
import { pagina, paraPdf, esc, brl, brl0, num, pct, dataBr } from './lib/relatorio-2026-visual.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const F = path.join(ROOT, 'outputs', 'base-clientes-2026', 'fontes')
const saida = process.argv[2] || path.join(ROOT, 'outputs', 'meta-cadastros-2026-08')
fs.mkdirSync(saida, { recursive: true })

const HOJE = '26/08/2026'
const MES = '2026-08'
const DIA_CORRENTE = 26, DIAS_DO_MES = 31

const META = {
    investimento: 6500, impressoes: 650000, cliques: 7800, acessos: 5850,
    leads: 702, mql: 140.4, cadastros: 56.16, aprovados: 33.696, clientes: 13.478,
    faturamento: 1010880,
}
/** Meta interna anunciada por Marcelo no grupo em 14/08: "60 cadastros em agosto". */
const META_INTERNA_CADASTROS = 60

/* ── 1. mídia ─────────────────────────────────────────────────────────────── */
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', 'funil-campanhas-2026', 'meta-estrutura-2026-08-26.json'), 'utf8'))
const nomeCamp = new Map(meta.campanhas.map(c => [c.id, c.nome]))
const midia = { investido: 0, impressoes: 0, alcance: 0, cliques: 0, cliquesSaida: 0, acessos: 0, leadsMeta: 0 }
const midiaPorCampanha = []
for (const [id, meses] of Object.entries(meta.mensal)) {
    const m = meses[MES]; if (!m) continue
    midiaPorCampanha.push({ id, nome: nomeCamp.get(id), ...m })
    for (const k of Object.keys(midia)) midia[k] += m[k] || 0
}
midiaPorCampanha.sort((a, b) => b.investido - a.investido)

/* ── 2. leads da planilha ─────────────────────────────────────────────────── */
const planilha = JSON.parse(fs.readFileSync(path.join(F, 'planilha-leads.json'), 'utf8'))
const abas = {}
for (const [aba, { head, rows }] of Object.entries(planilha)) {
    abas[aba] = rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}
const iso = d => { const m = String(d).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : '' }
const ehTeste = r => /teste|test lead|dummy/i.test(String(r['Nome'] || ''))
const PISO = { '1 a 50 cabeças': 1, '51 a 100 cabeças': 51, '101 a 300 cabeças': 101, '301 a 500 cabeças': 301, 'mais de 500 cabeças': 501, '1 a 99 cabeças': 1, '100 a 500 cabeças': 100, '501 a 1000 cabeças': 501, 'mais de 1000 cabeças': 1001, 'nenhuma': 0 }
const ehMql = r => (PISO[String(r['Cabeças'] || '').trim()] ?? null) >= 100 && /^sim$/i.test(String(r['Inscrição Estadual'] || '').trim())

const geral = abas['LEADS GERAIS']
const linhasAgo = geral.filter(r => iso(r['Data']).startsWith(MES))
const antesDeAgosto = new Set(geral.filter(r => iso(r['Data']) && !iso(r['Data']).startsWith(MES)).map(r => foneKey(r['WhatsApp'])).filter(Boolean))
const porPessoa = new Map()
let testes = 0
for (const r of linhasAgo) {
    if (ehTeste(r)) { testes++; continue }
    const k = foneKey(r['WhatsApp']) || nomeNorm(r['Nome'])
    if (!porPessoa.has(k)) porPessoa.set(k, r)
}
const leads = [...porPessoa.values()]
const duplicatas = linhasAgo.length - testes - leads.length
const recontatos = leads.filter(r => antesDeAgosto.has(foneKey(r['WhatsApp']))).length
const mqls = leads.filter(ehMql)

const PESO = { 'NUMERO ERRADO': 1, 'NÃO RESPONDEU': 2, 'CONEXÃO': 3, 'QUALIFICAÇÃO': 4, 'SEM INFORMAÇÃO PARA CADASTRO': 5, 'CADASTRO REPROVADO': 6, 'CADASTRO OK': 7, 'JÁ COMPROU': 8 }
const etapaPorFone = new Map()
for (const aba of ['TOUROS', 'FEMEAS', 'EMBRIÕES', 'OUTROS']) {
    for (const r of abas[aba]) {
        const k = foneKey(r['WhatsApp']); if (!k) continue
        const etapa = String(r['Etapa'] || '').trim().toUpperCase(); if (!etapa) continue
        const ja = etapaPorFone.get(k)
        if (!ja || (PESO[etapa] || 0) > (PESO[ja.etapa] || 0)) etapaPorFone.set(k, { etapa, quem: String(r['Atendido por'] || '').trim() })
    }
}
const etapaDe = r => etapaPorFone.get(foneKey(r['WhatsApp']))?.etapa || '(sem etapa)'
const contaEtapas = {}
for (const r of leads) contaEtapas[etapaDe(r)] = (contaEtapas[etapaDe(r)] || 0) + 1

const porOrigem = {}
for (const r of leads) {
    const o = String(r['Origem'] || '(sem origem)')
    porOrigem[o] ??= { n: 0, mql: 0, trab: 0, cadastro: 0 }
    porOrigem[o].n++
    if (ehMql(r)) porOrigem[o].mql++
    if (!['(sem etapa)', 'NUMERO ERRADO'].includes(etapaDe(r))) porOrigem[o].trab++
    if (etapaDe(r) === 'CADASTRO OK') porOrigem[o].cadastro++
}

/* ── 3. universo de leads (para provar a origem de cada cadastro) ─────────── */
const universo = []
for (const r of geral) universo.push({ fonte: 'planilha', nome: r['Nome'], fone: r['WhatsApp'], cpf: r['cpf'] || r['cpf_(brazil)'] || '', uf: r['UF'], origem: r['Origem'], data: r['Data'] })
for (const l of JSON.parse(fs.readFileSync(path.join(F, 'pg-crm-leads.json'), 'utf8'))) {
    universo.push({ fonte: 'crm_leads', nome: l.nome, fone: l.telefone || l.celular, cpf: l.cpf, uf: l.estado, origem: l.origem || l.source, data: String(l.created_at || '').slice(0, 10) })
}
const idx = indexaUniverso(universo)

/* ── 4. cadastros do mês, com a origem provada ────────────────────────────── */
const cad = CADASTROS_AGOSTO.map(c => {
    const anon = /^\(/.test(c.nome)
    const achado = anon ? null : casaNoUniverso(idx, c)
    const origem = anon ? 'anonimo' : classifica(achado)
    return { ...c, anon, origem, via: achado?.via || '', prova: provaDe(achado) }
})
const aprovados = cad.filter(c => c.status === 'aprovado')
const recusados = cad.filter(c => c.status === 'recusado')
const pendentes = cad.filter(c => c.status === 'pendente')
const decididos = aprovados.length + recusados.length
const identificados = cad.filter(c => !c.anon)

const doFunil = cad.filter(c => c.origem === 'midia')
const doFunilAprovados = doFunil.filter(c => c.status === 'aprovado')
const daLista = cad.filter(c => c.origem === 'lista')
const semLead = cad.filter(c => c.origem === 'sem-lead')
const anonimos = cad.filter(c => c.anon)

/* ── 5. quem comprou em agosto — e quem deles era lead ────────────────────── */
const compras = JSON.parse(fs.readFileSync(path.join(F, 'hp-compras-2026.json'), 'utf8')).filter(c => String(c.lei_data || '').startsWith(MES))
const porComprador = new Map()
for (const c of compras) {
    const k = nomeNorm(c.cli_nome)
    if (!porComprador.has(k)) porComprador.set(k, { nome: c.cli_nome, cpf: c.cli_cpfcnpj, fone: c.cli_celular || c.cli_fonecom1 || c.cli_foneres, uf: c.cli_uf, linhas: [] })
    porComprador.get(k).linhas.push(c)
}
const soma = p => ({ lotes: p.linhas.length, animais: p.linhas.reduce((s, x) => s + (+x.lot_qtd || 0), 0), valor: p.linhas.reduce((s, x) => s + (+x.lot_total || 0), 0) })

const clientesDoFunil = []
for (const p of porComprador.values()) {
    const achado = casaNoUniverso(idx, p)
    if (classifica(achado) !== 'midia') continue
    const prova = provaDe(achado)
    clientesDoFunil.push({ nome: p.nome, via: achado.via, campanha: prova.origem, dataLead: prova.data, leilao: p.linhas[0].lei_nome, dataLeilao: p.linhas[0].lei_data, ...soma(p) })
}
clientesDoFunil.sort((a, b) => b.valor - a.valor)
const vgvFunil = clientesDoFunil.reduce((s, c) => s + c.valor, 0)
const animaisFunil = clientesDoFunil.reduce((s, c) => s + c.animais, 0)

/** Cadastros do mês (de qualquer origem) que já compraram. */
const compradoresEntreCadastros = []
for (const c of cad) {
    const p = porComprador.get(nomeNorm(c.nome)); if (!p) continue
    compradoresEntreCadastros.push({ nome: c.nome, status: c.status, data: c.data, origem: c.origem, leilao: p.linhas[0].lei_nome, dataLeilao: p.linhas[0].lei_data, ...soma(p) })
}

/* ── 6. divergências planilha × grupo ─────────────────────────────────────── */
const nomesDoGrupo = cad.map(c => nomeNorm(c.nome)).filter(Boolean)
const cadastrosDaPlanilha = leads.filter(r => etapaDe(r) === 'CADASTRO OK')
const semFichaNoGrupo = cadastrosDaPlanilha.filter(r => {
    const n = nomeNorm(r['Nome'])
    return !nomesDoGrupo.some(g => g && (g.includes(n) || n.includes(g)))
})

const ritmo = n => n / DIA_CORRENTE * DIAS_DO_MES

/* ══ PDF ══════════════════════════════════════════════════════════════════ */
const L = (etapa, funil, operacao, meta, obs) => ({ etapa, funil, operacao, meta, obs, taxa: pct(parseFloat(String(funil).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0, meta) })
const linhas = [
    L('Investimento em mídia', brl(midia.investido), '', META.investimento, 'Meta Ads, conta CA2 — a única com verba'),
    L('Impressões', num(midia.impressoes), '', META.impressoes, `CPM real R$ ${(midia.investido / midia.impressoes * 1000).toFixed(2).replace('.', ',')} — meta R$ 10,00`),
    L('Cliques', num(midia.cliques), '', META.cliques, `CTR ${(midia.cliques / midia.impressoes * 100).toFixed(2).replace('.', ',')}% — meta 1,20%`),
    L('Acessos ao site', num(midia.acessos), '', META.acessos, `${num(midia.cliquesSaida)} cliques de saída → ${pct(midia.acessos, midia.cliquesSaida)} chegaram (meta 75%)`),
    L('Leads gerados', num(leads.length), '', META.leads, `CPL R$ ${(midia.investido / leads.length).toFixed(2).replace('.', ',')} — meta R$ 9,26`),
    L('Leads qualificados (MQL)', num(mqls.length), '', META.mql, `${pct(mqls.length, leads.length)} dos leads — meta 20%`),
    L('Cadastros submetidos', num(doFunil.length), num(cad.length), META.cadastros, `${pct(doFunil.length, mqls.length)} dos MQL viraram ficha — meta 40%`),
    L('Cadastros aprovados', num(doFunilAprovados.length), num(aprovados.length), META.aprovados, `na operação toda: ${pct(aprovados.length, decididos)} dos ${decididos} decididos — meta 60%`),
    L('Clientes que compraram', num(clientesDoFunil.length), num(compradoresEntreCadastros.length), META.clientes, `${num(animaisFunil)} animais · ${brl0(vgvFunil)} — meta ${brl0(META.faturamento)}`),
]
const barra = p => {
    const v = Math.max(0, Math.min(150, parseFloat(String(p).replace('%', '').replace(',', '.')) || 0))
    return `<span class="bar" style="width:${(v / 150 * 24).toFixed(1)}mm"></span>`
}
const ROTULO = { midia: 'Lead de anúncio', lista: 'Lista importada', 'sem-lead': 'Sem lead — carteira', anonimo: 'Não identificado' }

const corpo = `
<div class="cap">
  <div>
    <h1>Posição da meta de cadastros</h1>
    <div class="sub">Agosto/2026, do dia 1º ao dia 26. Planilha de leads + os dois grupos de cadastro no WhatsApp + a conta de anúncios.
    Cada cadastro traz a frase do grupo que o sustenta e a prova de onde a pessoa veio.</div>
  </div>
  <div class="meta">
    <div class="tot">${cad.length}<small>cadastros no mês</small></div>
    <div style="margin-top:6px">${aprovados.length} aprovados · ${recusados.length} reprovados<br>${pendentes.length} sem resposta<br>${HOJE}</div>
  </div>
</div>

<div class="cards">
  <div class="card"><div class="z">Cadastros × meta interna</div><div class="n">${pct(cad.length, META_INTERNA_CADASTROS)}<small>${cad.length} de ${META_INTERNA_CADASTROS} — faltam ${META_INTERNA_CADASTROS - cad.length}</small></div></div>
  <div class="card"><div class="z">Taxa de aprovação</div><div class="n">${pct(aprovados.length, decididos)}<small>${aprovados.length} de ${decididos} decididos — meta 60%</small></div></div>
  <div class="card"><div class="z">Cadastros vindos de anúncio</div><div class="n">${doFunil.length}<small>de ${cad.length} — ${pct(doFunil.length, cad.length)} do total</small></div></div>
  <div class="card"><div class="z">Investimento usado</div><div class="n">${pct(midia.investido, META.investimento)}<small>${brl0(midia.investido)} de ${brl0(META.investimento)}</small></div></div>
</div>

<div class="box alerta avoid">
  <h3>O que decide o mês</h3>
  <ul>
    <li><b>A operação de cadastro entrega; o funil da mídia não.</b> São ${cad.length} cadastros no mês e ${aprovados.length} aprovados — ${pct(aprovados.length, decididos)} de aprovação, acima da meta de 60%. Mas só <b>${doFunil.length} deles</b> têm prova de que a pessoa veio de anúncio. Os outros são prospecção do assessor, que a meta do quadro não mede.</li>
    <li><b>A conta de anúncios parou de veicular em 20/08</b> (21/08 gastou R$ 0,01; de 22 a 26/08, nada). Por isso o último lead da planilha é de 20/08: <b>6 dias sem lead novo</b>, com ${brl0(META.investimento - midia.investido)} da verba do mês sem uso.</li>
    <li><b>A mídia começou a virar cadastro — tarde e pouco.</b> ${doFunil.filter(c => c.data >= '2026-08-19').length} dos ${doFunil.length} cadastros de anúncio entraram entre 19 e 23/08, todos trabalhados pela Luana, que chegou em 14/08. Antes disso o mês tinha ${doFunil.filter(c => c.data < '2026-08-19').length}.</li>
    <li><b>Venda do mês vinda da mídia: ${brl0(vgvFunil)}</b> (${clientesDoFunil.length} compradores, ${animaisFunil} animais) — e nenhum deles se cadastrou em agosto: são leads de junho e julho que amadureceram agora.</li>
  </ul>
</div>

<h2>Placar do funil — agosto até o dia 26</h2>
<table class="funil">
  <thead><tr><th>Etapa</th><th class="r">Funil da mídia</th><th class="r">Operação toda</th><th class="r">Meta do mês</th><th class="r">% da meta</th><th></th><th>Leitura</th></tr></thead>
  <tbody>
    ${linhas.map(l => `<tr>
      <td class="et">${esc(l.etapa)}</td>
      <td class="num q">${l.funil}</td>
      <td class="num">${l.operacao || '<span class="off">—</span>'}</td>
      <td class="num off">${typeof l.meta === 'number' && l.meta > 1000 ? num(Math.round(l.meta)) : String(l.meta).replace('.', ',')}</td>
      <td class="num">${l.taxa}</td>
      <td style="width:26mm">${barra(l.taxa)}</td>
      <td class="micro">${esc(l.obs)}</td>
    </tr>`).join('')}
  </tbody>
</table>
<p class="micro"><b>Por que duas colunas.</b> A meta do quadro é uma cadeia de taxas que começa no dinheiro de mídia — "cadastros submetidos" ali quer dizer <i>MQL que virou ficha</i>.
Os grupos de cadastro recebem também a prospecção dos assessores, que não passou por anúncio nenhum. Comparar os ${cad.length} com a meta de ${String(META.cadastros).replace('.', ',')} daria ${pct(cad.length, META.cadastros)} e diria que a mídia converte seis vezes mais do que converte.
Leads = pessoas distintas de agosto na planilha (${linhasAgo.length} linhas − ${testes} de teste − ${duplicatas} repetidas); ${recontatos} já eram lead antes.</p>

<h2>De onde vieram os ${cad.length} cadastros</h2>
<table>
  <thead><tr><th>Origem</th><th class="r">Cadastros</th><th class="r">Aprovados</th><th>Como foi provado / por que não dá para provar</th></tr></thead>
  <tbody>
    <tr><td class="nome">Lead de anúncio ou landing</td><td class="num q">${doFunil.length}</td><td class="num">${doFunilAprovados.length}</td>
      <td class="micro">${doFunil.map(c => `${esc(c.nome)} <span class="off">(${esc(c.via)}, ${esc(c.prova.origem)})</span>`).join(' · ')}</td></tr>
    <tr><td class="nome">Lista fria importada</td><td class="num">${daLista.length}</td><td class="num">${daLista.filter(c => c.status === 'aprovado').length}</td>
      <td class="micro">${daLista.map(c => esc(c.nome)).join(' · ')} — estão na Base Unificada, não vieram de anúncio.</td></tr>
    <tr><td class="nome">Sem lead — carteira do assessor</td><td class="num">${semLead.length}</td><td class="num">${semLead.filter(c => c.status === 'aprovado').length}</td>
      <td class="micro">Nome, CPF e telefone não aparecem em lugar nenhum do universo de leads (planilha + CRM, ${num(universo.length)} registros). ${porComprador.size ? `E ${cad.length - 2} dos ${cad.length} nem constam no cadastro do ERP.` : ''}</td></tr>
    <tr><td class="nome">Não identificado</td><td class="num">${anonimos.length}</td><td class="num">${anonimos.filter(c => c.status === 'aprovado').length}</td>
      <td class="micro">A ficha foi postada como imagem encaminhada e o texto do grupo não traz nome nem CPF — dá para contar a decisão, não dá para dizer de onde veio a pessoa.</td></tr>
  </tbody>
  <tfoot><tr><td>Total</td><td class="num">${cad.length}</td><td class="num">${aprovados.length}</td><td class="micro">Teto do funil da mídia: ${doFunil.length + anonimos.length} — se todos os não identificados fossem lead, o que é improvável.</td></tr></tfoot>
</table>

<h2>Onde está cada real — mídia de agosto por campanha</h2>
<table>
  <thead><tr><th>Campanha</th><th class="r">Investido</th><th class="r">Impressões</th><th class="r">Cliques</th><th class="r">Acessos</th><th class="r">Leads (Meta)</th><th class="r">Leads (planilha)</th></tr></thead>
  <tbody>
  ${midiaPorCampanha.map(c => {
    const daPlanilha = porOrigem[`Meta — ${c.nome}`]?.n || 0
    const landing = Object.entries(porOrigem).filter(([o]) => /Landing/.test(o) && chaveLanding(o) === chaveLanding(c.nome)).reduce((s, [, v]) => s + v.n, 0)
    return `<tr><td class="nome">${esc(c.nome)}</td><td class="num">${brl(c.investido)}</td><td class="num">${num(c.impressoes)}</td>
      <td class="num">${num(c.cliques)}</td><td class="num">${c.acessos ? num(c.acessos) : '<span class="off">form. instantâneo</span>'}</td>
      <td class="num">${num(c.leadsMeta)}</td><td class="num">${num(daPlanilha + landing)}</td></tr>`
  }).join('')}
  </tbody>
  <tfoot><tr><td>Total</td><td class="num">${brl(midia.investido)}</td><td class="num">${num(midia.impressoes)}</td><td class="num">${num(midia.cliques)}</td>
  <td class="num">${num(midia.acessos)}</td><td class="num">${num(midia.leadsMeta)}</td><td class="num">${num(leads.length)}</td></tr></tfoot>
</table>
<p class="micro">"Leads (planilha)" soma o formulário instantâneo da campanha e a landing correspondente — é o número que a equipe atende. A diferença para "Leads (Meta)" é o lead que chega pela landing e a Meta não atribui.</p>

<h2>O que a equipe fez com os ${leads.length} leads</h2>
<div class="cards">
  ${Object.entries(contaEtapas).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([e, n]) =>
    `<div class="card"><div class="z">${esc(e)}</div><div class="n">${n}<small>${pct(n, leads.length)}</small></div></div>`).join('')}
</div>
<table>
  <thead><tr><th>Origem do lead</th><th class="r">Leads</th><th class="r">MQL</th><th class="r">Trabalhados</th><th class="r">Cadastro OK na planilha</th></tr></thead>
  <tbody>${Object.entries(porOrigem).sort((a, b) => b[1].n - a[1].n).map(([o, v]) =>
    `<tr><td>${esc(o)}</td><td class="num">${v.n}</td><td class="num">${v.mql}</td><td class="num">${v.trab} <span class="micro">(${pct(v.trab, v.n)})</span></td><td class="num">${v.cadastro}</td></tr>`).join('')}
  </tbody>
</table>

<div class="pg"></div>
<h2>Os ${cad.length} cadastros do mês, um a um</h2>
<table>
  <thead><tr><th>Data</th><th>Cliente</th><th>UF</th><th>Origem</th><th>Decisão</th><th>Evidência (a frase do grupo)</th></tr></thead>
  <tbody>
  ${cad.map(c => `<tr>
    <td class="num">${dataBr(c.data)}</td>
    <td class="nome">${esc(c.nome)}${c.cpf ? `<br><span class="micro">${esc(c.cpf)}</span>` : ''}</td>
    <td>${esc(c.uf || '—')}</td>
    <td class="micro">${c.origem === 'midia' ? `<b class="ouro">${esc(c.prova.origem)}</b><br>lead de ${esc(c.prova.data)} · casado por ${esc(c.via)}` : esc(ROTULO[c.origem])}</td>
    <td class="nome">${c.status === 'aprovado' ? 'Aprovado' : c.status === 'recusado' ? 'Reprovado' : 'Sem resposta'}${c.ressalva ? '<br><span class="micro">com ressalva</span>' : ''}</td>
    <td class="micro">${esc(c.evidencia)}</td></tr>`).join('')}
  </tbody>
</table>

<h2>Quem comprou em agosto</h2>
<h3>Compradores que eram lead de anúncio — a venda que a mídia entregou</h3>
<table>
  <thead><tr><th>Cliente</th><th>Veio de</th><th class="r">Lead em</th><th>Leilão</th><th class="r">Data</th><th class="r">Animais</th><th class="r">Valor</th></tr></thead>
  <tbody>${clientesDoFunil.map(c => `<tr><td class="nome">${esc(c.nome)}</td><td class="micro">${esc(c.campanha)}</td><td class="num micro">${esc(String(c.dataLead).slice(0, 10))}</td>
    <td>${esc(c.leilao)}</td><td class="num">${dataBr(c.dataLeilao)}</td><td class="num">${c.animais}</td><td class="num">${brl0(c.valor)}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="6">Total</td><td class="num">${brl0(vgvFunil)}</td></tr></tfoot>
</table>
<p class="micro">Cruzamento dos ${porComprador.size} compradores de agosto no ERP contra o universo de leads, por CPF, telefone ou nome completo. Os dois são leads antigos (jun e jul) que compraram agora — o ciclo entre o lead e a venda é de semanas, não de dias.</p>

<h3>Cadastros do mês que já compraram</h3>
<table>
  <thead><tr><th>Cliente</th><th>Cadastro</th><th>Origem</th><th>Leilão</th><th class="r">Data</th><th class="r">Animais</th><th class="r">Valor</th></tr></thead>
  <tbody>${compradoresEntreCadastros.map(c => `<tr><td class="nome">${esc(c.nome)}</td><td>${c.status === 'aprovado' ? 'Aprovado' : 'Reprovado'} ${dataBr(c.data)}</td>
    <td class="micro">${esc(ROTULO[c.origem])}</td><td>${esc(c.leilao)}</td><td class="num">${dataBr(c.dataLeilao)}</td><td class="num">${c.animais}</td><td class="num">${brl0(c.valor)}</td></tr>`).join('')}</tbody>
</table>
<p class="micro">Farley foi aprovado no dia 14 e comprou no dia 15 — um dia entre a aprovação e a venda. Geraldo Majela foi reprovado na Programa Leilões em 19/08 e comprou no Naviraí Camparino em 23/08:
reprovação numa leiloeira não impede a venda em outra, e isso não aparece em relatório nenhum hoje. Nenhum dos dois era lead — vieram do assessor.</p>

<h2>Onde as fontes não batem</h2>
<div class="box grey avoid">
  <p><b>${cadastrosDaPlanilha.length} leads de agosto estão marcados CADASTRO OK na planilha.</b> Desses, ${cadastrosDaPlanilha.length - semFichaNoGrupo.length} têm ficha e decisão nos grupos.
  Os outros ${semFichaNoGrupo.length} não passaram por lá: ${semFichaNoGrupo.map(r => esc(r['Nome'])).join(', ')}.</p>
  <ul>
    <li><b>Marcionei Luiz dos Santos</b> está marcado CADASTRO OK na planilha, mas no grupo da Programa a resposta de 22/08 foi <i>"não tem cadastro"</i> e depois <i>"precisa do documento pessoal e contato"</i> — está em aberto, não aprovado. É por isso que ele conta como submetido e não como aprovado.</li>
    <li><b>Ruy de Freitas</b> (MT, 11/08) e <b>Mauro</b> (GO, 19/08) provavelmente são o "cliente de Rondonópolis" e a "consulta 2 de 19/08", que aparecem aprovados nos grupos sem nome no texto. Se forem, o funil da mídia tem ${doFunil.length + 2} cadastros e não ${doFunil.length} — só o assessor pode confirmar.</li>
    <li><b>Tarcisio Tomé de Souza</b> e <b>Fabio Rafael</b> (01/08, São Geraldo) não têm ficha nos grupos em agosto; Fabio Rafael consta como aprovado na consolidação de julho.</li>
    <li>O sistema registrou <b>3 das ${cad.length} fichas</b>. O robô só fecha o ciclo quando a ficha sai do próprio sistema com código; ficha postada à mão continua invisível. Mesmo buraco relatado em 31/07.</li>
  </ul>
</div>

<h2>O que destrava a meta</h2>
<div class="box avoid">
  <ul>
    <li><b>Religar a mídia hoje.</b> São 6 dias parados e ${brl0(META.investimento - midia.investido)} sem uso. No CPL de agosto (R$ ${(midia.investido / leads.length).toFixed(2).replace('.', ',')}), esse saldo ainda traria cerca de ${Math.round((META.investimento - midia.investido) / (midia.investido / leads.length))} leads até o fim do mês.</li>
    <li><b>O gargalo do funil da mídia é MQL → ficha: ${pct(doFunil.length, mqls.length)} contra os 40% da meta.</b> Foram ${mqls.length} leads qualificados no mês e ${doFunil.length} viraram cadastro. É aqui que a meta se perde, não na aprovação.</li>
    <li><b>Repetir o caminho da Luana.</b> Os cadastros de anúncio do mês são dela, entre 19 e 23/08, com a ficha postada nos dois grupos no mesmo dia do contato. É o único trajeto que fechou lead → ficha em agosto.</li>
    <li><b>Cobrar as ${pendentes.length} consultas sem resposta</b> (${pendentes.map(p => esc(p.nome)).join(', ')}) — cada uma é trabalho já feito, parado na leiloeira.</li>
    <li><b>Pôr nome na ficha ao postar no grupo.</b> ${anonimos.length} dos ${cad.length} cadastros do mês não têm nome no texto, só a imagem encaminhada. É o que impede dizer, com prova, se a mídia trouxe 6 ou 16.</li>
  </ul>
</div>

<footer><span>Bula Assessoria — posição da meta de cadastros, agosto/2026</span><span>Apurado em ${HOJE} · planilha de leads + grupos de cadastro + Meta Ads</span></footer>
`

function chaveLanding(nome) {
    const s = String(nome).toUpperCase()
    if (/GERALDO/.test(s)) return 'SG'
    if (/FEMEA|FÊMEA/.test(s)) return 'FEM'
    if (/TOURO/.test(s)) return 'TOU'
    if (/EXPOGEN/.test(s)) return 'EXP'
    return s
}

const html = pagina('Posição da meta de cadastros — agosto/2026', corpo)
const pdf = path.join(saida, 'posicao-meta-cadastros-agosto-2026.pdf')
fs.writeFileSync(path.join(saida, 'posicao-meta-cadastros-agosto-2026.html'), html)
await paraPdf(html, pdf)

/* ══ XLSX ═════════════════════════════════════════════════════════════════ */
const wb = new ExcelJS.Workbook()
const cabec = (ws, cols) => {
    ws.columns = cols
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }
}

const wsP = wb.addWorksheet('Placar')
cabec(wsP, [
    { header: 'Etapa', key: 'e', width: 28 }, { header: 'Funil da mídia', key: 'f', width: 16 },
    { header: 'Operação toda', key: 'o', width: 15 }, { header: 'Meta do mês', key: 'm', width: 14 },
    { header: '% da meta', key: 'p', width: 11 }, { header: 'Leitura', key: 'l', width: 70 },
])
for (const l of linhas) wsP.addRow({ e: l.etapa, f: l.funil, o: l.operacao, m: l.meta, p: l.taxa, l: l.obs })
wsP.addRow({})
wsP.addRow({ e: 'Meta interna do mês (grupo, 14/08)', f: '', o: cad.length, m: META_INTERNA_CADASTROS, p: pct(cad.length, META_INTERNA_CADASTROS), l: 'Marcelo: "Estamos com a meta de 60 cadastros para esse mês de Agosto!"' })

const wsC = wb.addWorksheet('Cadastros do mês')
cabec(wsC, [
    { header: 'Data', key: 'd', width: 12 }, { header: 'Cliente', key: 'n', width: 42 },
    { header: 'CPF/CNPJ', key: 'c', width: 20 }, { header: 'UF', key: 'u', width: 6 },
    { header: 'Grupo', key: 'g', width: 22 }, { header: 'Decisão', key: 's', width: 12 },
    { header: 'Ressalva', key: 'r', width: 9 }, { header: 'Origem', key: 'o', width: 22 },
    { header: 'Campanha do lead', key: 'k', width: 34 }, { header: 'Casado por', key: 'v', width: 16 },
    { header: 'Evidência', key: 'e', width: 100 },
])
for (const c of cad) wsC.addRow({
    d: dataBr(c.data), n: c.nome, c: c.cpf || '', u: c.uf || '', g: c.grupo || '', s: c.status,
    r: c.ressalva ? 'sim' : '', o: ROTULO[c.origem], k: c.origem === 'midia' ? `${c.prova.origem} (${c.prova.data})` : '',
    v: c.via, e: c.evidencia,
})

const wsL = wb.addWorksheet('Leads de agosto')
cabec(wsL, [
    { header: 'Data', key: 'd', width: 18 }, { header: 'Nome', key: 'n', width: 34 },
    { header: 'WhatsApp', key: 'w', width: 18 }, { header: 'UF', key: 'u', width: 6 },
    { header: 'Cabeças', key: 'c', width: 18 }, { header: 'I.E.', key: 'i', width: 8 },
    { header: 'MQL', key: 'q', width: 8 }, { header: 'Origem', key: 'o', width: 34 },
    { header: 'Etapa', key: 'e', width: 26 }, { header: 'Atendido por', key: 'a', width: 20 },
])
for (const r of leads.sort((a, b) => iso(b['Data']).localeCompare(iso(a['Data'])))) {
    wsL.addRow({
        d: r['Data'], n: r['Nome'], w: r['WhatsApp'], u: r['UF'], c: r['Cabeças'], i: r['Inscrição Estadual'],
        q: ehMql(r) ? 'sim' : '', o: r['Origem'], e: etapaDe(r), a: etapaPorFone.get(foneKey(r['WhatsApp']))?.quem || '',
    })
}

const wsV = wb.addWorksheet('Vendas do funil')
cabec(wsV, [
    { header: 'Cliente', key: 'n', width: 36 }, { header: 'Campanha do lead', key: 'c', width: 34 },
    { header: 'Lead em', key: 'd', width: 20 }, { header: 'Casado por', key: 'v', width: 14 },
    { header: 'Leilão', key: 'l', width: 44 }, { header: 'Data', key: 't', width: 12 },
    { header: 'Lotes', key: 'o', width: 8 }, { header: 'Animais', key: 'a', width: 9 }, { header: 'Valor', key: 'x', width: 14 },
])
for (const c of clientesDoFunil) wsV.addRow({ n: c.nome, c: c.campanha, d: c.dataLead, v: c.via, l: c.leilao, t: dataBr(c.dataLeilao), o: c.lotes, a: c.animais, x: c.valor })

const wsM = wb.addWorksheet('Mídia por campanha')
cabec(wsM, [
    { header: 'Campanha', key: 'n', width: 38 }, { header: 'Investido', key: 'i', width: 14 },
    { header: 'Impressões', key: 'p', width: 14 }, { header: 'Cliques', key: 'c', width: 12 },
    { header: 'Cliques de saída', key: 's', width: 16 }, { header: 'Acessos', key: 'a', width: 12 },
    { header: 'Leads (Meta)', key: 'l', width: 14 },
])
for (const c of midiaPorCampanha) wsM.addRow({ n: c.nome, i: c.investido, p: c.impressoes, c: c.cliques, s: c.cliquesSaida, a: c.acessos, l: c.leadsMeta })

const xlsx = path.join(saida, 'posicao-meta-cadastros-agosto-2026.xlsx')
await wb.xlsx.writeFile(xlsx)

console.log(`PDF   ${pdf}`)
console.log(`XLSX  ${xlsx}`)
console.log(`cadastros ${cad.length} (aprov ${aprovados.length} / recus ${recusados.length} / pend ${pendentes.length})`)
console.log(`origem: midia ${doFunil.length} · lista ${daLista.length} · sem lead ${semLead.length} · anonimo ${anonimos.length}`)
console.log(`leads ${leads.length} · mql ${mqls.length} · midia ${brl(midia.investido)} · vendas do funil ${brl0(vgvFunil)} (${clientesDoFunil.length})`)
