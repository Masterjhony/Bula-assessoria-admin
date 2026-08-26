/**
 * POSIÇÃO DA META DE CADASTROS — AGOSTO/2026 (pedido do Marcelo, 26/08 08:20).
 *
 *   node scripts/gera-relatorio-meta-cadastros-2026-08-26.mjs [pasta-de-saida]
 *
 * Sai um PDF (para o grupo) e um XLSX (para conferir nome a nome).
 *
 * TRÊS FONTES, NENHUMA SOZINHA BASTA:
 *   1. PLANILHA "Leads - Bula Assessoria" — é a fonte do lead e da etapa que a
 *      equipe trabalha (coluna Etapa das abas de interesse). Diz quem virou
 *      CADASTRO OK, mas não diz se a leiloeira decidiu.
 *   2. GRUPOS de cadastro no WhatsApp ("Cadastros Bula Remates" e "Cadastros
 *      Bula e Programa") — é onde a leiloeira REALMENTE aprova ou reprova. Lido
 *      mensagem a mensagem em scripts/lib/cadastros-agosto-2026.mjs, com a ficha
 *      em imagem/PDF baixada do Storage quando o texto não traz o nome.
 *   3. META ADS (conta CA2) — investimento e entrega, para as três primeiras
 *      linhas do quadro de meta.
 *
 * O sistema (cliente_leiloeira_cadastro) NÃO é fonte: em agosto ele registrou
 * 3 fichas das 39 que passaram pelos grupos. Ver a memória
 * "aprovacoes-leiloeira-nao-entram-no-sistema".
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { CADASTROS_AGOSTO } from './lib/cadastros-agosto-2026.mjs'
import { pagina, paraPdf, esc, brl, brl0, num, pct, dataBr } from './lib/relatorio-2026-visual.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const F = path.join(ROOT, 'outputs', 'base-clientes-2026', 'fontes')
const saida = process.argv[2] || path.join(ROOT, 'outputs', 'meta-cadastros-2026-08')
fs.mkdirSync(saida, { recursive: true })

const HOJE = '26/08/2026'
const MES = '2026-08'
const DIA_CORRENTE = 26, DIAS_DO_MES = 31

/* ── metas (o quadro da diretoria) ────────────────────────────────────────── */
const META = {
    investimento: 6500, impressoes: 650000, cliques: 7800, acessos: 5850,
    leads: 702, mql: 140.4, cadastros: 56.16, aprovados: 33.696, clientes: 13.478,
    ctr: 1.2, acessoPorClique: 75, leadPorAcesso: 12, mqlPorLead: 20,
    cadastroPorMql: 40, aprovadoPorCadastro: 60, clientePorAprovado: 40,
    animaisPorCliente: 3, ticket: 25000,
}
/** Meta interna anunciada por Marcelo no grupo em 14/08: "60 cadastros em agosto". */
const META_INTERNA_CADASTROS = 60

/* ── 1. mídia (Meta Ads, conta CA2) ───────────────────────────────────────── */
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', 'funil-campanhas-2026', 'meta-estrutura-2026-08-26.json'), 'utf8'))
const nomeCamp = new Map(meta.campanhas.map(c => [c.id, c.nome]))
const midia = { investido: 0, impressoes: 0, alcance: 0, cliques: 0, cliquesSaida: 0, acessos: 0, leadsMeta: 0 }
const midiaPorCampanha = []
for (const [id, meses] of Object.entries(meta.mensal)) {
    const m = meses[MES]
    if (!m) continue
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
const fone = s => String(s || '').replace(/\D/g, '').replace(/^55/, '').replace(/^0+/, '')
const nomeN = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const ehTeste = r => /teste|test lead|dummy/i.test(String(r['Nome'] || ''))

/** ≥100 cabeças E tem I.E. — a mesma régua de MQL do painel de growth. */
const PISO = { '1 a 50 cabeças': 1, '51 a 100 cabeças': 51, '101 a 300 cabeças': 101, '301 a 500 cabeças': 301, 'mais de 500 cabeças': 501, '1 a 99 cabeças': 1, '100 a 500 cabeças': 100, '501 a 1000 cabeças': 501, 'mais de 1000 cabeças': 1001, 'nenhuma': 0 }
const ehMql = r => (PISO[String(r['Cabeças'] || '').trim()] ?? null) >= 100 && /^sim$/i.test(String(r['Inscrição Estadual'] || '').trim())

const geral = abas['LEADS GERAIS']
const linhasAgo = geral.filter(r => iso(r['Data']).startsWith(MES))
const antesDeAgosto = new Set(geral.filter(r => iso(r['Data']) && !iso(r['Data']).startsWith(MES)).map(r => fone(r['WhatsApp'])).filter(Boolean))

const porPessoa = new Map()
let testes = 0
for (const r of linhasAgo) {
    if (ehTeste(r)) { testes++; continue }
    const k = fone(r['WhatsApp']) || nomeN(r['Nome'])
    if (!porPessoa.has(k)) porPessoa.set(k, r)
}
const leads = [...porPessoa.values()]
const duplicatas = linhasAgo.length - testes - leads.length
const recontatos = leads.filter(r => antesDeAgosto.has(fone(r['WhatsApp']))).length
const mqls = leads.filter(ehMql)

/* etapa que a equipe anotou (as abas de interesse são a fonte da Etapa) */
const PESO = { 'NUMERO ERRADO': 1, 'NÃO RESPONDEU': 2, 'CONEXÃO': 3, 'QUALIFICAÇÃO': 4, 'SEM INFORMAÇÃO PARA CADASTRO': 5, 'CADASTRO REPROVADO': 6, 'CADASTRO OK': 7, 'JÁ COMPROU': 8 }
const etapaPorFone = new Map()
for (const aba of ['TOUROS', 'FEMEAS', 'EMBRIÕES', 'OUTROS']) {
    for (const r of abas[aba]) {
        const k = fone(r['WhatsApp']); if (!k) continue
        const etapa = String(r['Etapa'] || '').trim().toUpperCase(); if (!etapa) continue
        const ja = etapaPorFone.get(k)
        if (!ja || (PESO[etapa] || 0) > (PESO[ja.etapa] || 0)) etapaPorFone.set(k, { etapa, quem: String(r['Atendido por'] || '').trim() })
    }
}
const etapaDe = r => etapaPorFone.get(fone(r['WhatsApp']))?.etapa || '(sem etapa)'
const contaEtapas = {}
for (const r of leads) contaEtapas[etapaDe(r)] = (contaEtapas[etapaDe(r)] || 0) + 1
const trabalhados = leads.filter(r => !['(sem etapa)', 'NUMERO ERRADO'].includes(etapaDe(r))).length

const porOrigem = {}
for (const r of leads) {
    const o = String(r['Origem'] || '(sem origem)')
    porOrigem[o] ??= { n: 0, mql: 0, trab: 0, cadastro: 0 }
    porOrigem[o].n++
    if (ehMql(r)) porOrigem[o].mql++
    if (!['(sem etapa)', 'NUMERO ERRADO'].includes(etapaDe(r))) porOrigem[o].trab++
    if (etapaDe(r) === 'CADASTRO OK') porOrigem[o].cadastro++
}

/* ── 3. cadastros nos grupos ──────────────────────────────────────────────── */
const cad = CADASTROS_AGOSTO.map(c => ({ ...c }))
const aprovados = cad.filter(c => c.status === 'aprovado')
const recusados = cad.filter(c => c.status === 'recusado')
const pendentes = cad.filter(c => c.status === 'pendente')
const decididos = aprovados.length + recusados.length
const identificados = cad.filter(c => !/^\(/.test(c.nome))
const deCampanha = cad.filter(c => c.deCampanha)

/* ── 4. quem comprou ──────────────────────────────────────────────────────── */
const compras = JSON.parse(fs.readFileSync(path.join(F, 'hp-compras-2026.json'), 'utf8'))
const comprasMes = compras.filter(c => String(c.lei_data || '').startsWith(MES))
const porComprador = new Map()
for (const c of comprasMes) {
    const k = nomeN(c.cli_nome)
    if (!porComprador.has(k)) porComprador.set(k, [])
    porComprador.get(k).push(c)
}
const compradores = []
for (const c of cad) {
    const linhas = porComprador.get(nomeN(c.nome))
    if (!linhas) continue
    compradores.push({
        nome: c.nome, status: c.status, data: c.data,
        leilao: linhas[0].lei_nome, dataLeilao: linhas[0].lei_data,
        lotes: linhas.length, animais: linhas.reduce((s, x) => s + (+x.lot_qtd || 0), 0),
        valor: linhas.reduce((s, x) => s + (+x.lot_total || 0), 0),
    })
}
const faturamento = compradores.reduce((s, c) => s + c.valor, 0)
const animais = compradores.reduce((s, c) => s + c.animais, 0)
// A meta mede "cliente que comprou" DEPOIS de aprovado. Quem comprou mesmo
// reprovado (comprou em outra leiloeira) entra na tabela, mas não nessa linha.
const clientesDeAprovado = compradores.filter(c => c.status === 'aprovado')
const fatDeAprovado = clientesDeAprovado.reduce((s, c) => s + c.valor, 0)
const animaisDeAprovado = clientesDeAprovado.reduce((s, c) => s + c.animais, 0)

/* ── 5. divergências planilha × grupo ─────────────────────────────────────── */
const nomesDoGrupo = new Set(cad.map(c => nomeN(c.nome)))
const cadastrosDaPlanilha = leads.filter(r => etapaDe(r) === 'CADASTRO OK')
const semFichaNoGrupo = cadastrosDaPlanilha.filter(r => {
    const n = nomeN(r['Nome'])
    return ![...nomesDoGrupo].some(g => g && (g.includes(n) || n.includes(g)))
})

/* ── projeção simples até o fim do mês ────────────────────────────────────── */
const ritmo = n => n / DIA_CORRENTE * DIAS_DO_MES

/* ══ PDF ══════════════════════════════════════════════════════════════════ */
const linha = (etapa, valor, meta, obs, taxa) => ({ etapa, valor, meta, obs, taxa })
const funil = [
    linha('Investimento em mídia', brl(midia.investido), brl(META.investimento), 'Meta Ads, conta CA2 — a única com verba', pct(midia.investido, META.investimento)),
    linha('Impressões', num(midia.impressoes), num(META.impressoes), 'CPM real R$ ' + (midia.investido / midia.impressoes * 1000).toFixed(2).replace('.', ',') + ' (meta R$ 10,00)', pct(midia.impressoes, META.impressoes)),
    linha('Cliques', num(midia.cliques), num(META.cliques), `CTR ${(midia.cliques / midia.impressoes * 100).toFixed(2).replace('.', ',')}% — meta 1,20%`, pct(midia.cliques, META.cliques)),
    linha('Acessos ao site', num(midia.acessos), num(META.acessos), `${num(midia.cliquesSaida)} cliques de saída → ${pct(midia.acessos, midia.cliquesSaida)} chegaram (meta 75%)`, pct(midia.acessos, META.acessos)),
    linha('Leads gerados', num(leads.length), num(META.leads), `CPL R$ ${(midia.investido / leads.length).toFixed(2).replace('.', ',')} — meta R$ 9,26`, pct(leads.length, META.leads)),
    linha('Leads qualificados (MQL)', num(mqls.length), num(META.mql), `${pct(mqls.length, leads.length)} dos leads — meta 20%`, pct(mqls.length, META.mql)),
    linha('Cadastros submetidos', num(cad.length), num(META.cadastros), `${identificados.length} com nome identificado; meta interna do mês: ${META_INTERNA_CADASTROS}`, pct(cad.length, META.cadastros)),
    linha('Cadastros aprovados', num(aprovados.length), num(META.aprovados), `${pct(aprovados.length, decididos)} dos ${decididos} decididos — meta 60%`, pct(aprovados.length, META.aprovados)),
    linha('Clientes que compraram', num(clientesDeAprovado.length), num(META.clientes), `${num(animaisDeAprovado)} animais · ${brl0(fatDeAprovado)} (+1 reprovado comprou em outra leiloeira: ${brl0(faturamento - fatDeAprovado)})`, pct(clientesDeAprovado.length, META.clientes)),
]

const barra = p => {
    const v = Math.max(0, Math.min(150, parseFloat(String(p).replace('%', '').replace(',', '.')) || 0))
    return `<span class="bar" style="width:${(v / 150 * 26).toFixed(1)}mm"></span>`
}

const corpo = `
<div class="cap">
  <div>
    <h1>Posição da meta de cadastros</h1>
    <div class="sub">Agosto/2026, apurado do dia 1º ao dia 26. Três fontes cruzadas: a planilha de leads (fonte da equipe),
    os dois grupos de cadastro no WhatsApp (onde a leiloeira decide) e a conta de anúncios. Cada cadastro tem a frase que o sustenta.</div>
  </div>
  <div class="meta">
    <div class="tot">${cad.length}<small>cadastros no mês</small></div>
    <div style="margin-top:6px">${aprovados.length} aprovados · ${recusados.length} reprovados<br>${pendentes.length} sem resposta<br>${HOJE}</div>
  </div>
</div>

<div class="cards">
  <div class="card"><div class="z">Cadastros × meta interna</div><div class="n">${pct(cad.length, META_INTERNA_CADASTROS)}<small>${cad.length} de ${META_INTERNA_CADASTROS} — faltam ${META_INTERNA_CADASTROS - cad.length}</small></div></div>
  <div class="card"><div class="z">Aprovados × meta do quadro</div><div class="n">${pct(aprovados.length, META.aprovados)}<small>${aprovados.length} de ${META.aprovados.toFixed(0)}</small></div></div>
  <div class="card"><div class="z">Taxa de aprovação</div><div class="n">${pct(aprovados.length, decididos)}<small>meta 60% — acima</small></div></div>
  <div class="card"><div class="z">Investimento usado</div><div class="n">${pct(midia.investido, META.investimento)}<small>${brl0(midia.investido)} de ${brl0(META.investimento)}</small></div></div>
</div>

<div class="box alerta avoid">
  <h3>O que decide o mês, em três frases</h3>
  <ul>
    <li><b>A operação de cadastro está entregando.</b> ${cad.length} cadastros em 26 dias, ${aprovados.length} aprovados — ${pct(aprovados.length, decididos)} de aprovação entre os que a leiloeira decidiu, acima da meta de 60%. No ritmo atual o mês fecha em <b>${Math.round(ritmo(cad.length))} cadastros</b>.</li>
    <li><b>O que não está entregando é o topo.</b> A conta de anúncios <b>parou de veicular em 20/08</b> (em 21/08 gastou R$ 0,01 e de 22 a 26/08 não houve entrega nenhuma). Por isso o último lead da planilha é de 20/08: são <b>6 dias sem lead novo</b>, com ${brl0(META.investimento - midia.investido)} da verba do mês ainda sem uso.</li>
    <li><b>Mídia e cadastro ainda são dois mundos.</b> Dos ${cad.length} cadastros, ${deCampanha.length} vieram comprovadamente de lead de anúncio (todos depois de 20/08, todos da Luana) — o resto é carteira de assessor. Foi a primeira vez que a mídia gerou cadastro: até 14/08 esse número era zero.</li>
  </ul>
</div>

<h2>Placar do funil — agosto até o dia 26</h2>
<table class="funil">
  <thead><tr><th>Etapa</th><th class="r">Apurado</th><th class="r">Meta do mês</th><th class="r">% da meta</th><th></th><th>Leitura</th></tr></thead>
  <tbody>
    ${funil.map(l => `<tr>
      <td class="et">${esc(l.etapa)}</td>
      <td class="num">${l.valor}</td>
      <td class="num off">${l.meta}</td>
      <td class="num q">${l.taxa}</td>
      <td style="width:28mm">${barra(l.taxa)}</td>
      <td class="micro">${esc(l.obs)}</td>
    </tr>`).join('')}
  </tbody>
</table>
<p class="micro">Leads = pessoas distintas com lead em agosto na planilha (${linhasAgo.length} linhas − ${testes} de teste − ${duplicatas} repetidas). ${recontatos} dessas pessoas já eram lead antes de agosto.
Cadastros submetidos = fichas e consultas que entraram nos dois grupos entre 1º e 26/08, contadas uma vez por pessoa.</p>

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
  <thead><tr><th>Data</th><th>Cliente</th><th>UF</th><th>Grupo</th><th>Decisão</th><th>Evidência (a frase do grupo)</th></tr></thead>
  <tbody>
  ${cad.map(c => `<tr>
    <td class="num">${dataBr(c.data)}</td>
    <td class="nome">${esc(c.nome)}${c.cpf ? `<br><span class="micro">${esc(c.cpf)}</span>` : ''}${c.deCampanha ? `<br><span class="micro ouro">lead de ${esc(c.deCampanha)}</span>` : ''}</td>
    <td>${esc(c.uf || '—')}</td>
    <td class="micro">${esc(c.grupo || '—')}</td>
    <td class="nome">${c.status === 'aprovado' ? 'Aprovado' : c.status === 'recusado' ? 'Reprovado' : 'Sem resposta'}${c.ressalva ? '<br><span class="micro">com ressalva</span>' : ''}</td>
    <td class="micro">${esc(c.evidencia)}</td></tr>`).join('')}
  </tbody>
</table>

<h2>Quem já comprou</h2>
${compradores.length ? `<table>
  <thead><tr><th>Cliente</th><th>Cadastro</th><th>Leilão</th><th class="r">Data</th><th class="r">Lotes</th><th class="r">Animais</th><th class="r">Valor</th></tr></thead>
  <tbody>${compradores.map(c => `<tr><td class="nome">${esc(c.nome)}</td><td>${c.status === 'aprovado' ? 'Aprovado ' + dataBr(c.data) : 'Reprovado ' + dataBr(c.data)}</td>
    <td>${esc(c.leilao)}</td><td class="num">${dataBr(c.dataLeilao)}</td><td class="num">${c.lotes}</td><td class="num">${c.animais}</td><td class="num">${brl0(c.valor)}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="6">Total</td><td class="num">${brl0(faturamento)}</td></tr></tfoot>
</table>` : '<p>Nenhum cadastro do mês comprou até 26/08.</p>'}
<p class="micro">Cruzamento por nome contra as compras de agosto no ERP (HastaPro, filial 2). Farley foi aprovado no dia 14 e comprou no dia 15 — um dia entre a aprovação e a venda.
Geraldo Majela foi reprovado na Programa Leilões em 19/08 e comprou no Naviraí Camparino em 23/08: reprovação numa leiloeira não impede a venda em outra, e isso não aparece em relatório nenhum hoje.</p>

<h2>Onde as fontes não batem</h2>
<div class="box grey avoid">
  <p><b>${cadastrosDaPlanilha.length} leads de agosto estão marcados CADASTRO OK na planilha.</b> Desses, ${cadastrosDaPlanilha.length - semFichaNoGrupo.length} têm ficha e decisão nos grupos.
  Os outros ${semFichaNoGrupo.length} não passaram por lá: ${semFichaNoGrupo.map(r => esc(r['Nome'])).join(', ')}.</p>
  <ul>
    <li><b>Marcionei Luiz dos Santos</b> está marcado CADASTRO OK na planilha, mas no grupo da Programa a resposta de 22/08 foi <i>"não tem cadastro"</i> e depois <i>"precisa do documento pessoal e contato"</i> — o cadastro está em aberto, não aprovado.</li>
    <li><b>Ruy de Freitas</b> (MT, 11/08) e <b>Mauro</b> (GO, 19/08) provavelmente são o "cliente de Rondonópolis" e a "consulta 2 de 19/08" que aparecem aprovados nos grupos sem nome no texto — a ficha foi enviada como imagem encaminhada. Não dá para afirmar sem o assessor confirmar.</li>
    <li><b>Tarcisio Tomé de Souza</b> e <b>Fabio Rafael</b> (ambos 01/08, São Geraldo) não têm ficha nos grupos em agosto; Fabio Rafael consta como aprovado na consolidação de julho.</li>
    <li>O sistema registrou <b>3 das ${cad.length} fichas</b>. O robô só fecha o ciclo quando a ficha sai do próprio sistema com código; ficha postada à mão continua invisível. É o mesmo buraco relatado em 31/07 — nada mudou.</li>
  </ul>
</div>

<h2>O que destrava a meta</h2>
<div class="box avoid">
  <ul>
    <li><b>Religar a mídia hoje.</b> São 6 dias parados e ${brl0(META.investimento - midia.investido)} de verba sem uso. Mantido o CPL de agosto (R$ ${(midia.investido / leads.length).toFixed(2).replace('.', ',')}), esse saldo ainda traria cerca de ${Math.round((META.investimento - midia.investido) / (midia.investido / leads.length))} leads até o fim do mês.</li>
    <li><b>Repetir o caminho da Luana.</b> Os ${deCampanha.length} únicos cadastros vindos de anúncio no mês foram dela, todos entre 19 e 22/08, com a ficha postada nos dois grupos. É o caminho que funciona: lead do anúncio → WhatsApp → ficha no grupo no mesmo dia.</li>
    <li><b>Cobrar as ${pendentes.length} consultas sem resposta</b> (${pendentes.map(p => esc(p.nome)).join(', ')}). Cada uma é um cadastro que já custou trabalho e está parado esperando a leiloeira.</li>
    <li><b>Fechar a etapa na planilha só depois do "ok" do grupo.</b> Hoje "CADASTRO OK" quer dizer coisas diferentes para cada pessoa da equipe, e é isso que faz a planilha e o grupo divergirem.</li>
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
    { header: 'Etapa', key: 'e', width: 30 }, { header: 'Apurado', key: 'v', width: 16 },
    { header: 'Meta do mês', key: 'm', width: 16 }, { header: '% da meta', key: 'p', width: 12 },
    { header: 'Leitura', key: 'o', width: 70 },
])
for (const l of funil) wsP.addRow({ e: l.etapa, v: l.valor, m: l.meta, p: l.taxa, o: l.obs })
wsP.addRow({})
wsP.addRow({ e: 'Meta interna do mês (grupo, 14/08)', v: cad.length, m: META_INTERNA_CADASTROS, p: pct(cad.length, META_INTERNA_CADASTROS), o: 'Marcelo: "Estamos com a meta de 60 cadastros para esse mês de Agosto!"' })

const wsC = wb.addWorksheet('Cadastros do mês')
cabec(wsC, [
    { header: 'Data', key: 'd', width: 12 }, { header: 'Cliente', key: 'n', width: 42 },
    { header: 'CPF/CNPJ', key: 'c', width: 20 }, { header: 'UF', key: 'u', width: 6 },
    { header: 'Grupo', key: 'g', width: 22 }, { header: 'Decisão', key: 's', width: 14 },
    { header: 'Ressalva', key: 'r', width: 10 }, { header: 'Lead de campanha', key: 'k', width: 24 },
    { header: 'Evidência', key: 'e', width: 100 },
])
for (const c of cad) wsC.addRow({ d: dataBr(c.data), n: c.nome, c: c.cpf || '', u: c.uf || '', g: c.grupo || '', s: c.status, r: c.ressalva ? 'sim' : '', k: c.deCampanha || '', e: c.evidencia })

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
        q: ehMql(r) ? 'sim' : '', o: r['Origem'], e: etapaDe(r), a: etapaPorFone.get(fone(r['WhatsApp']))?.quem || '',
    })
}

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
console.log(`cadastros ${cad.length} (aprov ${aprovados.length} / recus ${recusados.length} / pend ${pendentes.length}) · leads ${leads.length} · mql ${mqls.length} · midia ${brl(midia.investido)}`)
