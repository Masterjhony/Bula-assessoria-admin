/**
 * OS DOIS QUADROS DE FUNIL DO FECHAMENTO DE AGOSTO/2026.
 *
 *   node scripts/gera-funil-quadros-2026-08-31.mjs [pasta-de-saida]
 *
 * Pedido do Marcelo: "um com o funil de agosto consolidado, e um com o funil
 * das campanhas ativas mais recentes desde o dia 27/08". Sai um PDF/PNG para
 * cada, no mesmo desenho de nove etapas do quadro que ele já usa.
 *
 *   1. AGOSTO CONSOLIDADO — 1º a 31/08, as seis campanhas que veicularam no
 *      mês, com as landings de cada uma. É o fechamento do quadro que circulou
 *      em 26/08; a diferença não é só de cinco dias a mais (ver abaixo).
 *   2. ATIVAS DESDE 27/08 — Perpétuo Touro, Jacamin e Melhoradores, as três que
 *      entregaram na retomada. Expogenética, Perpétuo Fêmeas e São Geraldo
 *      ficaram em R$ 0,00 na janela e por isso não entram.
 *
 * A MÍDIA VOLTOU EM 27/08, E ISSO MUDA O QUADRO. O relatório de 26/08 dizia
 * "mídia parada desde 20/08". Nos cinco dias finais a conta gastou R$ 1.768,87
 * — 35% de tudo que agosto gastou — e trouxe 129 dos 272 leads do mês. Fechar
 * agosto em 26/08 teria escondido metade do funil.
 *
 * RÉGUA — a mesma dos quadros anteriores, para poderem ser lidos lado a lado:
 *   • LEADS = pessoas distintas (dedup por telefone, senão nome) que entraram
 *     no recorte, vindas das campanhas do recorte e das landings de cada uma.
 *   • MQL = 100+ cabeças E com inscrição estadual.
 *   • CADASTROS = ficha que foi ao grupo da leiloeira com o lead casado por
 *     CPF. Até 26/08 vem de scripts/lib/cadastros-agosto-2026.mjs; de 27 a
 *     31/08, de scripts/lib/cadastros-melhoradores-2026-08.mjs. As duas listas
 *     foram lidas mensagem a mensagem COM OS ANEXOS ABERTOS, e emendam sem
 *     buraco: nos grupos não houve mensagem entre 26/08 e 27/08 12h49.
 *   • CLIENTES = comprador de agosto no ERP cruzado contra o universo de mídia.
 *
 * ONDE A CONTA DE "ACESSOS" QUEBROU, E COMO ESTE QUADRO TRATA ISSO. A meta de
 * 75% (acesso÷clique) e a de 12% (lead÷acesso) nasceram quando o anúncio levava
 * ao site. Em agosto 78% dos leads vieram de FORMULÁRIO INSTANTÂNEO, que abre
 * dentro do app e nunca gera acesso — na janela de 27/08 em diante são 99%.
 * Somar tudo faria lead÷acesso dar 23,99%, "acima da meta", descrevendo uma
 * operação que não existe. Então:
 *   • ACESSOS é medido contra os CLIQUES DE SAÍDA, que é o universo a que a
 *     meta de 75% de fato se aplica (era o que o rodapé do quadro de 26/08 já
 *     fazia à mão).
 *   • LEADS é medido contra os CLIQUES, e a meta de 12% vai marcada como não
 *     comparável em vez de ganhar um ▲ que não significa nada.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nomeNorm, foneKey, indexaUniverso, casaNoUniverso, ehMidia } from './lib/origem-cadastros-2026.mjs'
import { CADASTROS_AGOSTO } from './lib/cadastros-agosto-2026.mjs'
import { CADASTROS_DE_MIDIA } from './lib/cadastros-melhoradores-2026-08.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const F = path.join(ROOT, 'outputs', 'base-clientes-2026', 'fontes')
const saida = process.argv[2] || path.join(ROOT, 'outputs', 'funil-agosto-fechado-2026')
fs.mkdirSync(saida, { recursive: true })
const HOJE = '31/08/2026'

/* ── mídia, por campanha, nos dois recortes (Meta Ads MCP, conta CA2) ─────── */
const MIDIA = {
    'PERPÉTUO TOURO': {
        mes: { investido: 2594.75, impressoes: 196954, alcance: 81851, cliques: 3346, saida: 619, acessos: 498 },
        janela: { investido: 936.64, impressoes: 100714, alcance: 47360, cliques: 1737, saida: 8, acessos: 2 },
    },
    'PERPÉTUO FÊMEAS': {
        mes: { investido: 1225.09, impressoes: 70460, alcance: 31815, cliques: 1182, saida: 672, acessos: 546 },
        janela: { investido: 0, impressoes: 0, alcance: 0, cliques: 0, saida: 0, acessos: 0 },
    },
    'EXPOGENÉTICA': {
        mes: { investido: 261.05, impressoes: 22554, alcance: 14890, cliques: 374, saida: 4, acessos: 0 },
        janela: { investido: 0, impressoes: 0, alcance: 0, cliques: 0, saida: 0, acessos: 0 },
    },
    'JACAMIN': {
        mes: { investido: 414.17, impressoes: 19183, alcance: 11804, cliques: 272, saida: 0, acessos: 0 },
        janela: { investido: 414.17, impressoes: 19183, alcance: 11804, cliques: 272, saida: 0, acessos: 0 },
    },
    'MELHORADORES': {
        mes: { investido: 418.06, impressoes: 21309, alcance: 11405, cliques: 388, saida: 1, acessos: 1 },
        janela: { investido: 418.06, impressoes: 21309, alcance: 11405, cliques: 388, saida: 1, acessos: 1 },
    },
    'SÃO GERALDO': {
        mes: { investido: 121.83, impressoes: 6799, alcance: 5023, cliques: 198, saida: 106, acessos: 89 },
        janela: { investido: 0, impressoes: 0, alcance: 0, cliques: 0, saida: 0, acessos: 0 },
    },
}
/** Meta do mês inteiro, a mesma do quadro que a diretoria usa. */
const METAS = {
    investido: 6500, impressoes: 650000, cliques: 7800, acessos: 5850, leads: 702,
    mqls: 140.4, cadastros: 56.16, aprovados: 33.696, clientes: 13.5,
    animais: 40, ticket: 25000, faturamento: 1010880,
    cpl: 9.26, cpmql: 46.30, custoCadastro: 115.74, custoVenda: 160.75,
}

/* ── leads ────────────────────────────────────────────────────────────────── */
const GRUPO = {
    'Meta — LEAD - PERPETUO TOURO': 'PERPÉTUO TOURO', 'Landing Touros': 'PERPÉTUO TOURO',
    'Meta — LEADS - PERPETUO FEMEAS': 'PERPÉTUO FÊMEAS', 'Landing Fêmeas — Funil Perpétuo': 'PERPÉTUO FÊMEAS',
    'Meta — LEADS - Expogenética': 'EXPOGENÉTICA',
    'Meta — LEADS - SAO GERALDO': 'SÃO GERALDO', 'Landing São Geraldo': 'SÃO GERALDO',
    'Meta — LEADS - JACAMIN': 'JACAMIN', 'Meta — LEADS - Leilão Melhorado 30 ANOS': 'MELHORADORES',
}
const planilha = JSON.parse(fs.readFileSync(path.join(F, 'planilha-leads.json'), 'utf8'))
const { head, rows } = planilha['LEADS GERAIS']
const TODOS = rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
const iso = d => { const x = String(d).match(/(\d{2})\/(\d{2})\/(\d{4})/); return x ? `${x[3]}-${x[2]}-${x[1]}` : '' }
const ehTeste = r => /teste|test lead|dummy/i.test(String(r['Nome'] || ''))
const PISO = { '1 a 50 cabeças': 1, '51 a 100 cabeças': 51, '101 a 300 cabeças': 101, '301 a 500 cabeças': 301, 'mais de 500 cabeças': 501, '1 a 99 cabeças': 1, '100 a 500 cabeças': 100, '501 a 1000 cabeças': 501, 'mais de 1000 cabeças': 1001, 'nenhuma': 0 }
const ehMql = r => (PISO[String(r['Cabeças'] || '').trim()] ?? -1) >= 100 && /^sim$/i.test(String(r['Inscrição Estadual'] || '').trim())
const ehInstantaneo = r => /^Meta —/.test(String(r['Origem']))

/** Universo de mídia inteiro — a base do cruzamento com cadastro e comprador. */
const universo = (() => {
    const m = new Map()
    for (const r of TODOS) {
        if (!GRUPO[String(r['Origem'])] || ehTeste(r)) continue
        const k = foneKey(r['WhatsApp']) || nomeNorm(r['Nome'])
        const a = m.get(k)
        if (!a || iso(r['Data']) < iso(a['Data'])) m.set(k, r)
    }
    return [...m.values()]
})()
const idx = indexaUniverso(universo.map(r => ({
    nome: r['Nome'], fone: r['WhatsApp'], cpf: r['cpf'] || r['cpf_(brazil)'] || '',
    uf: r['UF'], origem: r['Origem'], data: r['Data'],
})))

/* ── compradores ──────────────────────────────────────────────────────────── */
const porComprador = new Map()
for (const c of JSON.parse(fs.readFileSync(path.join(F, 'hp-compras-2026.json'), 'utf8'))) {
    if (!String(c.lei_data || '').startsWith('2026-08')) continue
    const k = nomeNorm(c.cli_nome)
    if (!porComprador.has(k)) porComprador.set(k, { nome: c.cli_nome, cpf: c.cli_cpfcnpj, fone: c.cli_celular || c.cli_fonecom1 || c.cli_foneres, uf: c.cli_uf, linhas: [] })
    porComprador.get(k).linhas.push(c)
}

/* ── monta um recorte ─────────────────────────────────────────────────────── */
function monta({ campanhas, de, ate, chaveMidia }) {
    const m = { investido: 0, impressoes: 0, alcance: 0, cliques: 0, saida: 0, acessos: 0 }
    for (const c of campanhas) for (const k of Object.keys(m)) m[k] += MIDIA[c][chaveMidia][k]

    const leads = universo.filter(r => campanhas.includes(GRUPO[String(r['Origem'])]) && iso(r['Data']) >= de && iso(r['Data']) <= ate)
    const mqls = leads.filter(ehMql)
    const instantaneos = leads.filter(ehInstantaneo).length

    const fichas = [
        ...CADASTROS_AGOSTO.filter(c => c.origemLead && campanhas.includes(GRUPO[c.origemLead]))
            .map(c => ({ nome: c.nome, cpf: c.cpf, campanha: GRUPO[c.origemLead], status: c.status, submetidaEm: c.data || '2026-08', veredito: c.veredito || '', para: c.para || '' })),
        ...CADASTROS_DE_MIDIA.filter(c => campanhas.includes(c.campanha)),
    ].filter(c => c.submetidaEm.slice(0, 10) >= de && c.submetidaEm.slice(0, 10) <= ate)
    const aprovados = fichas.filter(c => c.status === 'aprovado')

    const clientes = []
    for (const cmp of porComprador.values()) {
        if (!cmp.linhas.some(x => x.lei_data >= de && x.lei_data <= ate)) continue
        const a = casaNoUniverso(idx, cmp)
        if (!a) continue
        const prova = a.achados.filter(x => ehMidia(x.origem) && campanhas.includes(GRUPO[x.origem]))
        if (!prova.length) continue
        const linhas = cmp.linhas.filter(x => x.lei_data >= de && x.lei_data <= ate)
        clientes.push({
            nome: cmp.nome, origem: prova[0].origem, entrouEm: prova[0].data,
            animais: linhas.reduce((s, x) => s + (+x.lot_qtd || 0), 0),
            valor: linhas.reduce((s, x) => s + (+x.lot_total || 0), 0),
        })
    }
    const animais = clientes.reduce((s, c) => s + c.animais, 0)
    const faturamento = clientes.reduce((s, c) => s + c.valor, 0)

    const porCampanha = campanhas.map(c => {
        const l = leads.filter(r => GRUPO[String(r['Origem'])] === c)
        const q = l.filter(ehMql)
        return {
            nome: c, ...MIDIA[c][chaveMidia], leads: l.length, mqls: q.length,
            fichas: fichas.filter(f => f.campanha === c).length,
            aprovados: aprovados.filter(f => f.campanha === c).length,
            cpl: l.length ? MIDIA[c][chaveMidia].investido / l.length : null,
            cpmql: q.length ? MIDIA[c][chaveMidia].investido / q.length : null,
            ctr: MIDIA[c][chaveMidia].impressoes ? MIDIA[c][chaveMidia].cliques * 100 / MIDIA[c][chaveMidia].impressoes : null,
        }
    }).sort((a, b) => b.investido - a.investido)

    return { m, leads, mqls, instantaneos, fichas, aprovados, clientes, animais, faturamento, porCampanha }
}

/* ── formatação ───────────────────────────────────────────────────────────── */
const br = n => Number(n).toLocaleString('pt-BR')
const brl = n => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (a, b, casas = 2) => b ? `${(a * 100 / b).toFixed(casas).replace('.', ',')}%` : '—'
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const razao = (a, b) => b ? a / b : null

const dataUri = (p, mime) => `data:${mime};base64,${fs.readFileSync(path.join(ROOT, 'public', p)).toString('base64')}`
const FUNDO = dataUri('bula/assets/img/agenda-hero-nelore.png', 'image/png')
const LOGO = dataUri('logo-bula-assessoria-white.png', 'image/png')

const CSS = `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d0b09; font-family: 'Segoe UI', Arial, sans-serif; color: #ece7df; }
  .quadro { width: 1000px; margin: 0 auto; background: #0d0b09; padding-bottom: 26px; }
  .capa { position: relative; height: 186px; overflow: hidden; }
  .capa img.foto { width: 100%; height: 100%; object-fit: cover; object-position: 50% 46%; filter: saturate(.72) contrast(1.04); }
  .capa::after { content: ''; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(13,11,9,.42) 0%, rgba(13,11,9,.58) 45%, rgba(13,11,9,.97) 100%); }
  .capa .marca { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 2; }
  .capa .marca img { width: 178px; }
  h1 { font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase; text-align: center; letter-spacing: .035em;
       margin: 0; padding: 2px 30px 0; font-size: 33px; font-weight: 700; color: #fff; line-height: 1.1; }
  h1 span { color: #c9a84c; }
  .sub { text-align: center; font-size: 12.5px; color: #9d958a; padding: 9px 46px 15px; line-height: 1.55; }
  .sub b { color: #cfc7ba; font-weight: 600; }
  .corpo { padding: 0 30px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #c9a84c; color: #17130d; font-family: 'Oswald', Arial, sans-serif; font-weight: 600;
             text-transform: uppercase; letter-spacing: .06em; font-size: 10.5px; padding: 8px 10px; text-align: right; }
  thead th.l { text-align: left; }
  td { padding: 8px 10px; border-bottom: 1px solid #241f18; font-size: 14px; text-align: right; white-space: nowrap; color: #d9d2c7; }
  td.i { text-align: left; width: 26px; font-family: 'Oswald', Arial, sans-serif; color: #6b6357; font-size: 13px; }
  td.rot { text-align: left; font-weight: 600; letter-spacing: .01em; font-size: 13.5px; color: #f2ede5;
           text-transform: uppercase; white-space: normal; }
  td.meta { color: #7d7568; font-size: 12.5px; }
  td.real { font-family: 'Oswald', Arial, sans-serif; font-size: 19px; font-weight: 600; color: #fff; }
  td.tx { color: #7d7568; font-size: 12.5px; }
  td.txr { font-weight: 700; font-size: 14px; color: #e8e2d8; }
  td.txr.bom { color: #62c07f; }
  td.txr.ruim { color: #e2695f; }
  .pin { font-size: 10px; }
  .faixa td { background: #1a1611; color: #c9a84c; font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase;
              font-size: 11px; letter-spacing: .1em; padding: 7px 10px; border-bottom: 1px solid #2c2519;
              border-top: 1px solid #2c2519; text-align: left; }
  .destaque { display: flex; gap: 9px; margin: 17px 0 4px; }
  .destaque div { flex: 1; border: 1px solid #3a3226; padding: 9px 11px 10px; background: #131009; }
  .destaque .z { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #8b8275; }
  .destaque .n { font-family: 'Oswald', Arial, sans-serif; font-size: 23px; line-height: 1.15; margin-top: 3px; color: #c9a84c; }
  .destaque .p { font-size: 10px; color: #8b8275; margin-top: 2px; line-height: 1.35; white-space: normal; }
  h2 { font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase; font-size: 12px; letter-spacing: .1em;
       color: #c9a84c; margin: 22px 0 0; padding-bottom: 6px; border-bottom: 1px solid #2c2519; }
  table.campanhas td { font-size: 12.5px; padding: 7px 10px; }
  table.campanhas td.rot { font-size: 12.5px; }
  table.campanhas thead th { background: transparent; color: #857d70; border-bottom: 1px solid #2c2519; font-size: 9.5px; }
  td.destaca { color: #62c07f; font-weight: 700; }
  .rodape { margin-top: 18px; border-top: 1px solid #2c2519; padding-top: 12px; font-size: 11px; color: #8b8275; line-height: 1.6; }
  .rodape b { color: #cfc7ba; }
  .rodape .alerta b { color: #e2a05f; }
  .assinatura { color: #5f584d; font-size: 10px; margin-top: 9px; }`

const linha = l => `<tr>
  <td class="i">${l.n === '' ? '' : l.n}</td>
  <td class="rot">${esc(l.rot)}</td>
  <td class="meta">${esc(l.meta)}</td>
  <td class="real">${esc(l.real)}</td>
  <td class="tx">${esc(l.metaTaxa)}</td>
  <td class="txr ${l.ok === true ? 'bom' : l.ok === false ? 'ruim' : ''}">${esc(l.taxaReal)}${l.ok === true ? ' <span class="pin">▲</span>' : l.ok === false ? ' <span class="pin">▼</span>' : ''}</td>
</tr>`

const linhaCampanha = (c, melhorMql) => `<tr>
  <td class="rot">${esc(c.nome)}</td>
  <td>${brl(c.investido)}</td><td>${br(c.impressoes)}</td><td>${br(c.cliques)}</td>
  <td>${c.ctr === null ? '—' : c.ctr.toFixed(2).replace('.', ',') + '%'}</td>
  <td>${c.leads}</td><td>${c.mqls}</td><td>${c.fichas}</td><td>${c.aprovados}</td>
  <td>${c.cpl ? brl(c.cpl) : '—'}</td>
  <td class="${melhorMql && c.nome === melhorMql.nome ? 'destaca' : ''}">${c.cpmql ? brl(c.cpmql) : '—'}</td>
</tr>`

function render({ arquivo, titulo, destaque, subtitulo, d, metas, rodape }) {
    const { m, leads, mqls, fichas, aprovados, clientes, animais, faturamento, porCampanha } = d
    const melhorMql = porCampanha.filter(c => c.cpmql).sort((a, b) => a.cpmql - b.cpmql)[0]

    const funil = [
        { n: 1, rot: 'Investimento em mídia', meta: metas ? brl(METAS.investido) : '—', real: brl(m.investido), metaTaxa: '—', taxaReal: metas ? `${pct(m.investido, METAS.investido, 1)} da verba` : '—', ok: null },
        { n: 2, rot: 'Impressões', meta: metas ? br(METAS.impressoes) : '—', real: br(m.impressoes), metaTaxa: '—', taxaReal: `CPM ${brl(m.investido / m.impressoes * 1000)}`, ok: null },
        { n: 3, curto: 'CTR', rot: 'Cliques', meta: metas ? br(METAS.cliques) : '—', real: br(m.cliques), metaTaxa: '1,20%', taxaReal: pct(m.cliques, m.impressoes), ok: razao(m.cliques, m.impressoes) >= 0.012 },
        // Com pouquissimo clique de saida a taxa nao descreve nada: 3 de 9 nao e
        // "33% abaixo da meta", e amostra pequena demais para ter taxa.
        m.saida >= 30
            ? { n: 4, curto: 'acesso', rot: 'Acessos ao site', meta: metas ? br(METAS.acessos) : '—', real: br(m.acessos), metaTaxa: '75%', taxaReal: `${pct(m.acessos, m.saida)} da saída`, ok: razao(m.acessos, m.saida) >= 0.75 }
            : { n: 4, rot: 'Acessos ao site', meta: metas ? br(METAS.acessos) : '—', real: br(m.acessos), metaTaxa: '75%', taxaReal: `${br(m.acessos)} de ${br(m.saida)} cliques de saída`, ok: null },
        { n: 5, rot: 'Leads gerados', meta: metas ? br(METAS.leads) : '—', real: br(leads.length), metaTaxa: '12% ÷acesso', taxaReal: `${pct(leads.length, m.cliques)} dos cliques`, ok: null },
        { n: 6, curto: 'MQL', rot: 'Leads qualificados', meta: metas ? String(METAS.mqls).replace('.', ',') : '—', real: br(mqls.length), metaTaxa: '20%', taxaReal: pct(mqls.length, leads.length), ok: razao(mqls.length, leads.length) >= 0.20 },
        { n: 7, curto: 'cadastro', rot: 'Cadastros submetidos', meta: metas ? String(METAS.cadastros).replace('.', ',') : '—', real: br(fichas.length), metaTaxa: '40%', taxaReal: pct(fichas.length, mqls.length), ok: razao(fichas.length, mqls.length) >= 0.40 },
        { n: 8, curto: 'aprovação', rot: 'Cadastros aprovados', meta: metas ? String(METAS.aprovados).replace('.', ',') : '—', real: br(aprovados.length), metaTaxa: '60%', taxaReal: pct(aprovados.length, fichas.length), ok: razao(aprovados.length, fichas.length) >= 0.60 },
        { n: 9, curto: 'compra', rot: 'Clientes compraram', meta: metas ? String(METAS.clientes).replace('.', ',') : '—', real: br(clientes.length), metaTaxa: '40%', taxaReal: pct(clientes.length, aprovados.length), ok: razao(clientes.length, aprovados.length) >= 0.40 },
    ]
    const resultado = [
        { n: '', rot: 'Animais vendidos', meta: metas ? br(METAS.animais) : '—', real: br(animais), metaTaxa: '—', taxaReal: '—', ok: null },
        { n: '', rot: 'Ticket médio', meta: metas ? brl(METAS.ticket) : '—', real: animais ? brl(faturamento / animais) : '—', metaTaxa: '—', taxaReal: '—', ok: null },
        { n: '', rot: 'Faturamento clientes digital', meta: metas ? brl(METAS.faturamento) : '—', real: brl(faturamento), metaTaxa: '—', taxaReal: metas ? pct(faturamento, METAS.faturamento, 1) : '—', ok: null },
    ]
    const custos = [
        { n: '', rot: 'CPL', meta: metas ? brl(METAS.cpl) : '—', real: brl(m.investido / leads.length), metaTaxa: '—', taxaReal: '—', ok: null },
        { n: '', rot: 'CPMQL', meta: metas ? brl(METAS.cpmql) : '—', real: brl(m.investido / mqls.length), metaTaxa: '—', taxaReal: '—', ok: null },
        { n: '', rot: 'Custo por cadastro', meta: metas ? brl(METAS.custoCadastro) : '—', real: fichas.length ? brl(m.investido / fichas.length) : '—', metaTaxa: '—', taxaReal: '—', ok: null },
        { n: '', rot: 'Custo por venda', meta: metas ? brl(METAS.custoVenda) : '—', real: animais ? brl(m.investido / animais) : '—', metaTaxa: '—', taxaReal: animais ? 'por animal' : 'sem venda', ok: null },
    ]
    const dentro = funil.filter(l => l.ok === true).length
    const comparaveis = funil.filter(l => l.ok !== null).length
    d.dentroQuais = funil.filter(l => l.ok === true).map(l => l.curto)

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(titulo)} ${esc(destaque)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="quadro">
  <div class="capa"><img class="foto" src="${FUNDO}" alt=""><div class="marca"><img src="${LOGO}" alt="Bula Assessoria"></div></div>
  <h1>${esc(titulo)} <span>${esc(destaque)}</span></h1>
  <div class="sub">${subtitulo}</div>
  <div class="corpo">
  <table>
    <thead><tr><th class="l" colspan="2">Etapa</th><th>${metas ? 'Meta do mês' : 'Meta'}</th><th>Realizado</th><th>Meta de taxa</th><th>Taxa real</th></tr></thead>
    <tbody>
      ${funil.map(linha).join('')}
      <tr class="faixa"><td colspan="6">Resultado</td></tr>
      ${resultado.map(linha).join('')}
      <tr class="faixa"><td colspan="6">Custos</td></tr>
      ${custos.map(linha).join('')}
    </tbody>
  </table>
  ${destaqueHtml(d, dentro, comparaveis, metas)}
  <h2>Por campanha</h2>
  <table class="campanhas">
    <thead><tr><th class="l">Campanha</th><th>Investido</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>Leads</th><th>MQL</th><th>Cadastros</th><th>Aprovados</th><th>CPL</th><th>CPMQL</th></tr></thead>
    <tbody>${porCampanha.map(c => linhaCampanha(c, melhorMql)).join('')}</tbody>
  </table>
  <div class="rodape">${rodape(d, dentro, comparaveis)}
    <div class="assinatura">Apurado em ${HOJE} · Meta Ads (conta CA2) + planilha de leads + grupos de cadastro no WhatsApp (com os anexos abertos) + ERP HastaPro</div>
  </div>
  </div>
</div>
</body></html>`
    return { html, arquivo, dentro, comparaveis }
}

function destaqueHtml(d, dentro, comparaveis, metas) {
    const { m, leads, mqls, instantaneos, fichas, aprovados, clientes, animais, faturamento } = d
    const cx = (z, n, p) => `<div><div class="z">${z}</div><div class="n">${n}</div><div class="p">${p}</div></div>`
    return `<div class="destaque">
    ${metas
        ? cx('Verba usada', pct(m.investido, METAS.investido, 0), `${brl(m.investido)} de ${brl(METAS.investido)}`)
        : cx('Investido na janela', brl(m.investido), '35% de tudo que agosto gastou, em 5 dias')}
    ${cx('Taxas dentro da meta', `${dentro} de ${comparaveis}`, d.dentroQuais.length ? d.dentroQuais.join(', ') : 'nenhuma etapa comparável bateu a meta')}
    ${cx('Lead de formulário', pct(instantaneos, leads.length, 0), `${br(instantaneos)} dos ${br(leads.length)} leads nunca passaram pelo site`)}
    ${cx('Faturamento gerado', brl(faturamento), clientes.length ? `${clientes.length} compradores · ${animais} animais` : `${fichas.length} cadastros, ${aprovados.length} aprovados, nenhuma compra ainda`)}
  </div>`
}

/* ══ 1. AGOSTO CONSOLIDADO ═══════════════════════════════════════════════ */
const TODAS = ['PERPÉTUO TOURO', 'PERPÉTUO FÊMEAS', 'EXPOGENÉTICA', 'JACAMIN', 'MELHORADORES', 'SÃO GERALDO']
const mes = monta({ campanhas: TODAS, de: '2026-08-01', ate: '2026-08-31', chaveMidia: 'mes' })

/* ══ 2. ATIVAS DESDE 27/08 ═══════════════════════════════════════════════ */
const ATIVAS = ['PERPÉTUO TOURO', 'JACAMIN', 'MELHORADORES']
const janela = monta({ campanhas: ATIVAS, de: '2026-08-27', ate: '2026-08-31', chaveMidia: 'janela' })

const quadros = [
    render({
        arquivo: 'funil-agosto-2026-consolidado',
        titulo: 'Funil de vendas —', destaque: 'agosto fechado',
        subtitulo: `1º a <b>31</b> de agosto de 2026 · seis campanhas no ar no mês: Perpétuo Touro, Perpétuo Fêmeas, Expogenética, Jacamin, Melhoradores e São Geraldo (com as landings de cada uma)<br>
      <b>a mídia voltou em 27/08</b> — os cinco dias finais trouxeram ${br(janela.leads.length)} dos ${br(mes.leads.length)} leads do mês`,
        d: mes, metas: true,
        rodape: (d, dentro, comparaveis) => `
    <b>Como ler.</b> A coluna de volume depende de quanto se investe — com ${pct(d.m.investido, METAS.investido, 0)} da verba, ${pct(d.m.investido, METAS.investido, 0)} do funil. A coluna de <b>taxa</b> é que mede a operação, e nela ${dentro} das ${comparaveis} etapas estão dentro ou acima da meta.<br>
    <span class="alerta"><b>O que mudou desde o quadro de 26/08.</b></span> Aquele fechava um mês parado desde 20/08. Em 27/08 a mídia voltou com três campanhas e gastou ${brl(janela.m.investido)} em cinco dias — ${pct(janela.m.investido, d.m.investido, 0)} do mês —, trazendo ${br(janela.leads.length)} leads e ${br(janela.mqls.length)} MQL. O mês quase dobrou de tamanho na última semana: de 142 para ${br(d.leads.length)} leads e de 29 para ${br(d.mqls.length)} MQL.<br>
    <b>Por que “acessos” mudou de conta.</b> ${pct(d.instantaneos, d.leads.length, 0)} dos leads vieram de <b>formulário instantâneo</b>, que abre dentro do app e nunca gera acesso ao site. Medir acesso÷clique sobre tudo daria ${pct(d.m.acessos, d.m.cliques, 0)} e não descreveria nada; medido contra os <b>cliques de saída</b>, que é o universo a que a meta de 75% se aplica, deu ${pct(d.m.acessos, d.m.saida, 1)} — ${br(d.m.acessos)} de ${br(d.m.saida)}. Pela mesma razão a meta de 12% (lead÷acesso) fica marcada como não comparável.<br>
    <b>Onde o mês trava.</b> ${br(d.fichas.length)} fichas para ${br(d.mqls.length)} MQL (${pct(d.fichas.length, d.mqls.length, 1)}) — é o degrau mais estreito, e o único que não depende de verba. Depois dele a operação vai bem: ${pct(d.aprovados.length, d.fichas.length, 1)} de aprovação, acima da meta de 60%.<br>
    <b>Definições.</b> Leads = pessoas distintas que entraram no mês. Cadastros submetidos = ficha que foi ao grupo da leiloeira com o lead casado por CPF, telefone ou nome. Clientes = compradores de agosto no ERP cruzados com o universo — ${d.clientes.map(c => `<b>${esc(c.nome)}</b> (${esc(c.origem)}, ${esc(c.entrouEm)})`).join(' e ')}, os dois leads de julho que amadureceram. Custo por venda é por animal, como no quadro original.`,
    }),
    render({
        arquivo: 'funil-campanhas-ativas-desde-27-08',
        titulo: 'Funil de vendas —', destaque: 'campanhas ativas',
        subtitulo: `27 a 31 de agosto de 2026 · a retomada da mídia · ${brl(janela.m.investido)} em cinco dias<br>
      <b>Perpétuo Touro</b>, <b>Jacamin</b> e <b>Melhoradores</b> — as três que entregaram na janela. Expogenética, Perpétuo Fêmeas e São Geraldo ficaram em R$ 0,00 e não entram.`,
        d: janela, metas: false,
        rodape: (d, dentro, comparaveis) => `
    <b>Como ler.</b> Cinco dias de operação, sem meta de volume própria — meta de volume é do mês inteiro, e ratear para cinco dias seria inventar número. O que se mede aqui é <b>taxa</b>: ${dentro} das ${comparaveis} etapas dentro ou acima da meta mensal.<br>
    <span class="alerta"><b>O topo está melhor que o mês.</b></span> ${pct(d.mqls.length, d.leads.length, 1)} de leads qualificados contra 25,00% em agosto inteiro, e CPL de ${brl(d.m.investido / d.leads.length)} contra ${brl(mes.m.investido / mes.leads.length)}. O <b>Perpétuo Touro</b> sozinho trouxe ${d.porCampanha.find(c => c.nome === 'PERPÉTUO TOURO').leads} leads a ${brl(d.porCampanha.find(c => c.nome === 'PERPÉTUO TOURO').cpl)} cada — é o motor da retomada. O <b>Melhoradores</b> teve a melhor qualificação (57,1%) e o <b>Jacamin</b>, a pior (15,8%), com o CPMQL mais caro dos três.<br>
    <b>Onde trava.</b> ${br(d.fichas.length)} fichas para ${br(d.mqls.length)} MQL (${pct(d.fichas.length, d.mqls.length, 1)}): ${d.mqls.length - d.fichas.length} leads qualificados da janela ainda não viraram ficha no grupo da leiloeira. Das ${d.fichas.length} levadas, ${d.aprovados.length} foram aprovadas — duas foram recusadas por falta de inscrição estadual, que em leilão de MS é obrigatória, e uma segue sem veredito. Nenhuma virou compra ainda: o Melhoradores era o único leilão dentro da janela, e ele passou em 29/08.<br>
    <b>Praticamente tudo é formulário instantâneo</b> — ${br(d.instantaneos)} dos ${br(d.leads.length)} leads. As landings pararam de receber: ${br(d.leads.length - d.instantaneos)} lead no período inteiro, e ${br(d.m.acessos)} acessos ao site em ${br(d.m.saida)} cliques de saída.<br>
    <b>Definições.</b> As mesmas do quadro mensal, para os dois poderem ser lidos lado a lado. Leads = pessoas distintas que entraram na janela. Cadastros = ficha no grupo da leiloeira com o lead casado por CPF. Clientes = comprador do ERP cruzado contra o universo.`,
    }),
]

const { chromium } = await import('playwright')
const nav = await chromium.launch()
try {
    for (const q of quadros) {
        const base = path.join(saida, q.arquivo)
        fs.writeFileSync(base + '.html', q.html)
        const pg = await nav.newPage({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 2 })
        await pg.setContent(q.html, { waitUntil: 'networkidle' })
        const el = await pg.$('.quadro')
        await el.screenshot({ path: base + '.png' })
        const alturaPx = Math.ceil((await el.boundingBox()).height)
        await pg.pdf({ path: base + '.pdf', width: '1000px', height: `${alturaPx}px`, printBackground: true, pageRanges: '1' })
        await pg.close()
        console.log(`PDF  ${base}.pdf  (${q.dentro} de ${q.comparaveis} taxas na meta)`)
    }
} finally { await nav.close() }

/* anexo de conferência */
const bloco = (nome, d) => [
    `── ${nome}`,
    `   mídia ${brl(d.m.investido)} · ${br(d.m.impressoes)} impressões · ${br(d.m.cliques)} cliques · ${br(d.m.saida)} cliques de saída · ${br(d.m.acessos)} acessos`,
    `   leads ${d.leads.length} (${d.instantaneos} de formulário instantâneo) · MQL ${d.mqls.length} · cadastros ${d.fichas.length} · aprovados ${d.aprovados.length} · clientes ${d.clientes.length}`,
    '',
    '   por campanha:',
    ...d.porCampanha.map(c => `     ${c.nome.padEnd(17)} ${brl(c.investido).padStart(12)} · ${String(c.leads).padStart(3)} leads · ${String(c.mqls).padStart(3)} MQL · ${String(c.fichas).padStart(2)} fichas · ${String(c.aprovados).padStart(2)} aprov · CPL ${c.cpl ? brl(c.cpl) : '—'} · CPMQL ${c.cpmql ? brl(c.cpmql) : '—'}`),
    '',
    '   cadastros submetidos:',
    ...d.fichas.map(c => `     ${c.submetidaEm.slice(0, 10)} ${c.nome.padEnd(38)} CPF ${String(c.cpf || '—').padEnd(18)} ${c.campanha.padEnd(16)} ${c.status.toUpperCase()}`),
    '',
    '   clientes:',
    ...(d.clientes.length ? d.clientes.map(c => `     ${c.nome.padEnd(38)} ${c.animais} an · ${brl(c.valor)} ← ${c.origem} (${c.entrouEm})`) : ['     nenhum']),
    '',
].join('\n')
fs.writeFileSync(path.join(saida, 'funis-agosto-2026-anexo.txt'), [
    `FUNIS DE AGOSTO/2026 — conferência · apurado em ${HOJE}`, '',
    bloco('AGOSTO CONSOLIDADO (1º a 31/08, seis campanhas)', mes),
    bloco('CAMPANHAS ATIVAS (27 a 31/08: Perpétuo Touro, Jacamin, Melhoradores)', janela),
].join('\n'))
console.log(`anexo ${path.join(saida, 'funis-agosto-2026-anexo.txt')}`)
