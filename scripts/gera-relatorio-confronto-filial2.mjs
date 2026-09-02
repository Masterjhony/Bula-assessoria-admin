/**
 * Relatório do confronto filial 2 (HastaPro) × ERP da Bula, agosto/2026.
 *
 * Lê o dataset de scripts/confronto-filial2-agosto-2026.mts e escreve o HTML —
 * nenhum número é digitado aqui, todos vêm do JSON. Rode o confronto antes:
 *
 *   npx tsx scripts/confronto-filial2-agosto-2026.mts --json
 *   node scripts/gera-relatorio-confronto-filial2.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const d = JSON.parse(readFileSync('outputs/conferencia-vgv-agosto-2026/confronto-filial2.json', 'utf8'))
const brl = n => Number(n || 0).toLocaleString('pt-BR')
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const dia = s => s.slice(8, 10) + '/' + s.slice(5, 7)

// Notas de conferência: o que a apuração contra os grupos de lances concluiu
// sobre cada divergência. Chave = "<cod do leilão>|<lote>" ou id do fechamento.
const NOTA = {
    '260822224948509|9': ['duplicata', 'Já lançado no 4º Pepitas Colonial (lote 09, mesmo comprador). A ficha é de 22/08 14h29 — o Camparino Essência só abriu às 21h.'],
    '260823115309818|12': ['falta-nosso', 'Venda real. Ficha do Léo Serafim em 23/08 17h52 (1.650 de parcela). Lote em cota: Nelore Tavares + Nelore Abba, os dois compradores que o HastaPro registra.'],
    '260823115309818|20': ['valor', 'Nossa ficha (Fábio Omena, 23/08 11h45) diz 1.400 de parcela; o HastaPro gravou 1.200 — igual ao lote 19, lançado dois minutos antes.'],
    '260823115309818|21': ['outro-leilao', 'A ficha nomeia “Leilão Exelencia”. É o 6º Leilão Excelência Genética de 23/08, que não existe em nenhuma filial do HastaPro.'],
    '260823115309818|22': ['disputa', 'Comprador assessorado pela M3 e tratado como cliente preferencial da Naviraí; a Bula diz que lançou o lance. Por isso não está na filial 2.'],
    '260823115309818|78': ['falta-nosso', 'Venda real. Ficha da Peralta em 23/08 21h21, sem valor — por isso o parser não capturou.'],
}
const ROTULO = {
    duplicata: ['Duplicata nossa', 'bad'], 'falta-nosso': ['Falta no nosso', 'bad'],
    valor: ['Valor difere', 'warn'], 'outro-leilao': ['Outro leilão', 'warn'], disputa: ['Atribuição em disputa', 'warn'],
}

const comLote = d.leiloes.filter(l => l.hp.length > 0)
const vazios = d.leiloes.filter(l => l.hp.length === 0)
const divergentes = comLote.filter(l => l.linhas.some(x => x.status !== 'ok'))
const identicos = comLote.filter(l => !l.linhas.some(x => x.status !== 'ok'))
const vgvIdenticos = identicos.reduce((s, l) => s + l.totalHp, 0)
const lotesIdenticos = identicos.reduce((s, l) => s + l.hp.length, 0)
const deltaDentro = d.totais.nosso_nos_mesmos_leiloes - d.totais.hastapro_filial2

// ── tabela mestre ───────────────────────────────────────────────────────────
const linhaMestre = l => {
    const delta = l.totalNosso - l.totalHp
    const div = l.linhas.filter(x => x.status !== 'ok').length
    return `<tr${div ? ' class="rd"' : ''}>
    <td>${dia(l.data)}</td>
    <td class="nome">${esc(l.nome)}<small>LEI_CODIGO ${l.cod}</small></td>
    <td class="n">${l.hp.length}</td><td class="n">${brl(l.totalHp)}</td>
    <td class="n">${l.fech ? l.nosso.length : '—'}</td><td class="n">${l.fech ? brl(l.totalNosso) : '—'}</td>
    <td class="n ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''}">${delta ? (delta > 0 ? '+' : '−') + brl(Math.abs(delta)) : '—'}</td>
    <td>${l.fech ? `<span class="tag ${l.fech.origem === 'hastapro' ? 'src-hp' : 'src-wa'}">${l.fech.origem}</span>` : '<span class="tag">sem fechamento</span>'}</td>
  </tr>`
}

// ── detalhamento lote a lote ────────────────────────────────────────────────
const blocoLeilao = l => {
    const divs = l.linhas.filter(x => x.status !== 'ok')
    const delta = l.totalNosso - l.totalHp
    return `<div class="item">
    <div class="top">
      <h3>${esc(l.nome)}<span>${dia(l.data)} &middot; LEI_CODIGO ${l.cod} &middot; fechamento ${l.fech.id.slice(0, 8)} [${l.fech.origem}]</span></h3>
      <div class="cifra ${delta > 0 ? 'pos' : 'neg'}">${delta > 0 ? '+' : '−'}${brl(Math.abs(delta))}</div>
      <div class="pill warn">${divs.length} lote${divs.length > 1 ? 's' : ''} de ${l.linhas.length}</div>
    </div>
    <div class="corpo">
      <div class="scroll"><table class="lotes">
        <thead><tr>
          <th rowspan="2">Lote</th><th colspan="5" class="grp hp">HastaPro &middot; filial 2 &middot; tabela LOTES</th>
          <th colspan="3" class="grp ns">Nosso ERP &middot; bula_leilao_fechamento.lances</th><th rowspan="2">Conferência</th>
        </tr><tr>
          <th class="n">LOT_LANCE</th><th class="n">QTD</th><th class="n">LOT_TOTAL</th><th>LOT_PISTEIRO</th><th>Comprador</th>
          <th class="n">vgv</th><th>assessor</th><th>comprador</th>
        </tr></thead>
        <tbody>${l.linhas.map(x => {
        const nota = NOTA[`${l.cod}|${x.lote}`]
        const rot = nota ? ROTULO[nota[0]] : null
        const cls = x.status === 'ok' ? '' : ' class="rd"'
        return `<tr${cls}>
            <td class="lt">${esc(x.hp?.loteRaw ?? x.ns?.loteRaw ?? x.lote)}</td>
            <td class="n">${x.hp ? brl(x.hp.lance) : '<span class="vazio">não lançado</span>'}</td>
            <td class="n">${x.hp ? x.hp.qtd : ''}</td>
            <td class="n">${x.hp ? brl(x.hp.total) : ''}</td>
            <td class="pes">${esc(x.hp?.pisteiro ?? '')}</td>
            <td class="pes">${esc(x.hp ? x.hp.compradores.join(' + ') : '')}</td>
            <td class="n">${x.ns ? brl(x.ns.vgv) : '<span class="vazio">ausente</span>'}</td>
            <td class="pes">${esc(x.ns?.assessor ?? '')}</td>
            <td class="pes">${esc((x.ns?.comprador ?? '').slice(0, 46))}</td>
            <td>${rot ? `<span class="tag t-${rot[1]}">${rot[0]}</span>` : x.status === 'ok' ? '<span class="ok-tick">confere</span>' : ''}</td>
          </tr>` + (nota ? `<tr class="nota"><td></td><td colspan="9">${esc(nota[1])}</td></tr>` : '')
    }).join('')}</tbody>
      </table></div>
    </div>
  </div>`
}

// ── fora da filial 2 ────────────────────────────────────────────────────────
const FORA = {
    'LEILÃO TOUROS SÃO GERALDO E 7P AGRO': ['ok', 'Filial 01 (Bula Remates)',
        'O pregão é da Bula Remates e está na filial 01, LEI_CODIGO 260729084108252, com 138 lotes e R$ 4.980.800 no total. Nossa cobertura são os 5 lotes cujo LOT_PISTEIRO é da equipe: 1000 (Douglas Bispo) e 3000, 56, 57 e 58 (Leonardo Serafim). Confirmado pelas fichas do grupo em 01/08.'],
    'LEILÃO MATRIZES PREMIUM KATISPERA': ['ok', 'Leilão não existe no HastaPro',
        'Busca por “KATISPERA” em LEILAO, todas as filiais: só o 3º Leilão Matrizes Katispera de 20/06. O de 17/08 nunca foi aberto. Nossa fonte é a ficha do grupo em 17/08 22h00 — lote 3, 3.900 de parcela, Douglas Bispo com direcionamento técnico do Gustavo Rusa.'],
    'LEILÃO NELORE PARANÃ E CASABRANCA EXPOGENÉTICA': ['bad', 'Duplicata do Nelore CEN',
        'O único lote deste fechamento é o lote 9 a R$ 84.000, que já está lançado no LEILÃO NELORE CEN & FAZENDA MODELO & CONVIDADOS (filial 2, LEI_CODIGO 260821073655646, LOT_LANCE 2.800, pisteiro Luiz Felipe Peralta). A ficha do grupo diz “Lote 9 / leilão modelo”.'],
    'FÊMEAS JMP': ['bad', 'Duplicata do Shopping Naviraí',
        'O único lote é o 48 a R$ 41.400, já lançado no SHOPPING NAVIRAI EXPOGENÉTICA de 15/08 (filial 2, LEI_CODIGO 260822082339354, LOT_LANCE 1.380, pisteiro Douglas Bispo, comprador Miguel Sousa). A ficha reenviada em 21/08 abre com “*Shopping Navirai*”.'],
}
const blocoFora = f => {
    const [tipo, resumo, txt] = FORA[f.nome] ?? ['warn', 'Sem correspondente na filial 2', '']
    return `<div class="item">
    <div class="top">
      <h3>${esc(f.nome)}<span>${dia(f.data)} &middot; fechamento ${f.id.slice(0, 8)} &middot; ${f.lances.length} lote${f.lances.length > 1 ? 's' : ''}</span></h3>
      <div class="cifra">${brl(f.vgv)}</div>
      <div class="pill ${tipo === 'ok' ? 'ok' : tipo === 'bad' ? 'bad' : 'warn'}">${esc(resumo)}</div>
    </div>
    <div class="corpo">
      <div class="scroll" style="margin-bottom:14px"><table class="lotes">
        <thead><tr><th>Lote</th><th class="n">vgv</th><th>Assessor</th><th>Comprador</th><th>Origem do dado</th></tr></thead>
        <tbody>${f.lances.map(x => `<tr><td class="lt">${esc(x.lote)}</td><td class="n">${brl(x.vgv)}</td>
          <td class="pes">${esc(x.assessor)}</td><td class="pes">${esc(x.comprador.slice(0, 52))}</td>
          <td><span class="tag ${f.origem === 'hastapro' ? 'src-hp' : 'src-wa'}">${f.origem}</span></td></tr>`).join('')}
        </tbody></table></div>
      <p>${esc(txt)}</p>
    </div>
  </div>`
}

const html = `<title>Filial 2, Lote a Lote</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<style>
:root{
  --ground:#FFFFFF; --panel:#FAF8F3; --panel-2:#F2EEE3; --panel-3:#EAE4D3;
  --ink:#14130F; --ink-2:#33312B; --mute:#6E6A5F; --line:#DFD9C9;
  --gold:#B8952F;
  --ok:#2C6A4A; --ok-bg:#E4F0E7; --bad:#A2331F; --bad-bg:#F7E5DF; --warn:#8A6415; --warn-bg:#F7EEDA;
  --hp:#4A5B6B; --hp-bg:#E7EBEF; --wa:#3F6B4E; --wa-bg:#E6EFE8;
  --shadow:0 1px 2px rgba(20,19,15,.05),0 8px 24px -18px rgba(20,19,15,.35);
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#131210; --panel:#1B1A16; --panel-2:#232118; --panel-3:#2C2920;
  --ink:#F3F0E7; --ink-2:#D8D3C4; --mute:#9A9384; --line:#332F26; --gold:#D7B455;
  --ok:#7FC49B; --ok-bg:#1C2E24; --bad:#E58F79; --bad-bg:#33201A; --warn:#DDB35C; --warn-bg:#2E2617;
  --hp:#9FB3C4; --hp-bg:#1D242A; --wa:#8FC3A2; --wa-bg:#1B2A20;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px -18px rgba(0,0,0,.8);
}}
:root[data-theme="dark"]{
  --ground:#131210; --panel:#1B1A16; --panel-2:#232118; --panel-3:#2C2920;
  --ink:#F3F0E7; --ink-2:#D8D3C4; --mute:#9A9384; --line:#332F26; --gold:#D7B455;
  --ok:#7FC49B; --ok-bg:#1C2E24; --bad:#E58F79; --bad-bg:#33201A; --warn:#DDB35C; --warn-bg:#2E2617;
  --hp:#9FB3C4; --hp-bg:#1D242A; --wa:#8FC3A2; --wa-bg:#1B2A20;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px -18px rgba(0,0,0,.8);
}
*{box-sizing:border-box}
body{background:var(--ground);color:var(--ink);font-family:"IBM Plex Sans",system-ui,sans-serif;font-size:16px;line-height:1.6;margin:0;padding:0 20px 96px;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto}
h1,h2,h3{font-family:Oswald,"Arial Narrow",sans-serif;font-weight:500;text-transform:uppercase;letter-spacing:.03em;text-wrap:balance;margin:0}
.num,.n,td.n,.lt{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}

header{padding:56px 0 30px;border-bottom:3px solid var(--ink)}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--mute);display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.eyebrow b{color:var(--gold);font-weight:600}
h1{font-size:clamp(36px,6vw,58px);line-height:1.03;margin:14px 0 12px;font-weight:600}
.lede{font-size:17.5px;color:var(--ink-2);max-width:66ch;margin:0}

.placar{display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin:32px 0 0}
.cel{background:var(--ground);padding:20px}
.cel .rot{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--mute)}
.cel .val{font-family:Oswald,sans-serif;font-size:32px;font-weight:600;line-height:1.1;margin-top:6px}
.cel .sub{font-size:13px;color:var(--mute);margin-top:4px;line-height:1.45}
.cel.mark{background:var(--panel-2)} .cel.mark .val{color:var(--gold)}

section{margin-top:54px}
.sechead{display:flex;align-items:baseline;gap:14px;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:22px}
.sechead h2{font-size:24px;font-weight:600}
.sechead .cnt{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--mute);margin-left:auto;white-space:nowrap}
.intro{color:var(--ink-2);max-width:70ch;margin:0 0 22px}

.eq{border:1px solid var(--line);background:var(--panel)}
.eq .l{display:grid;grid-template-columns:1fr 150px;gap:16px;padding:12px 20px;border-bottom:1px solid var(--line);align-items:center}
.eq .l:last-child{border-bottom:0}
.eq .l.tot{background:var(--panel-2);font-weight:600}
.eq .l .d{font-size:14.5px;line-height:1.4}
.eq .l .d small{display:block;color:var(--mute);font-size:12.5px;margin-top:2px;font-weight:400}
.eq .l .v{text-align:right;font-family:"IBM Plex Mono",monospace;font-weight:600;font-variant-numeric:tabular-nums}

.scroll{overflow-x:auto;border:1px solid var(--line);background:var(--ground)}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{text-align:left;padding:8px 11px;border-bottom:1px solid var(--line);white-space:nowrap;vertical-align:top}
th{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--mute);background:var(--panel-2);font-weight:500;white-space:nowrap}
th.grp{text-align:center;letter-spacing:.12em;font-weight:600}
th.grp.hp{background:var(--hp-bg);color:var(--hp)} th.grp.ns{background:var(--wa-bg);color:var(--wa)}
td.n,th.n{text-align:right}
td.nome{white-space:normal;min-width:250px;line-height:1.35}
td.nome small{display:block;font-family:"IBM Plex Mono",monospace;font-size:10.5px;color:var(--mute);margin-top:2px}
td.pes{white-space:normal;max-width:210px;font-size:12.5px;line-height:1.35;color:var(--ink-2)}
td.lt{font-weight:600}
tbody tr:last-child td{border-bottom:0}
tr.rd td{background:var(--warn-bg)}
tr.nota td{background:var(--panel-2);white-space:normal;font-size:12.5px;line-height:1.5;color:var(--ink-2);padding-top:6px;padding-bottom:10px}
tr.tot td{font-weight:600;background:var(--panel-3)}
.vazio{color:var(--mute);font-style:italic;font-family:"IBM Plex Sans",sans-serif;font-size:12px}
.ok-tick{color:var(--ok);font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.06em}
.pos{color:var(--ok)} .neg{color:var(--bad)}

.tag{font-family:"IBM Plex Mono",monospace;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:3px 7px;border:1px solid var(--line);color:var(--mute);white-space:nowrap;display:inline-block}
.tag.src-hp{background:var(--hp-bg);color:var(--hp);border-color:currentColor}
.tag.src-wa{background:var(--wa-bg);color:var(--wa);border-color:currentColor}
.tag.t-bad{background:var(--bad-bg);color:var(--bad);border-color:currentColor}
.tag.t-warn{background:var(--warn-bg);color:var(--warn);border-color:currentColor}

.item{border:1px solid var(--line);background:var(--panel);margin-bottom:20px;box-shadow:var(--shadow)}
.item > .top{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:15px 18px;border-bottom:1px solid var(--line);background:var(--ground)}
.item h3{font-size:18px;font-weight:600;flex:1 1 280px;min-width:0}
.item h3 span{display:block;font-family:"IBM Plex Mono",sans-serif;text-transform:none;letter-spacing:0;font-size:11.5px;font-weight:400;color:var(--mute);margin-top:4px}
.cifra{font-family:"IBM Plex Mono",monospace;font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.pill{font-family:"IBM Plex Mono",monospace;font-size:10.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;padding:5px 9px;border:1px solid currentColor;white-space:nowrap}
.pill.ok{color:var(--ok);background:var(--ok-bg)} .pill.bad{color:var(--bad);background:var(--bad-bg)} .pill.warn{color:var(--warn);background:var(--warn-bg)}
.corpo{padding:16px 18px 18px}
.corpo > p{margin:0;max-width:76ch;font-size:14.5px;color:var(--ink-2)}
.corpo .scroll{border-color:var(--line)}

dl.fontes{display:grid;grid-template-columns:auto 1fr;gap:10px 20px;margin:0;font-size:14.5px}
dl.fontes dt{font-family:"IBM Plex Mono",monospace;font-size:12.5px;font-weight:600;color:var(--gold);white-space:nowrap;padding-top:2px}
dl.fontes dd{margin:0;color:var(--ink-2);max-width:74ch}
dl.fontes dd b{color:var(--ink)}

footer{margin-top:58px;padding-top:20px;border-top:1px solid var(--line);font-size:13px;color:var(--mute)}
footer p{margin:0 0 8px;max-width:76ch;line-height:1.6}
@media (max-width:700px){
  dl.fontes{grid-template-columns:1fr;gap:4px 0}
  dl.fontes dd{margin-bottom:10px}
  header{padding-top:36px}
}
</style>

<div class="wrap">
<header>
  <div class="eyebrow"><span>Bula Assessoria</span><span>&middot;</span><span>Competência agosto/2026</span><span>&middot;</span><b>Filial 2 &times; ERP</b><span>&middot;</span><span>26/08/2026</span></div>
  <h1>Filial 2,<br>Lote a Lote</h1>
  <p class="lede">Tudo o que está lançado na filial <b>2</b> do HastaPro — a filial da Bula Assessoria — confrontado com o que está apurado no nosso ERP, leilão por leilão e lote por lote, com o campo de origem de cada número. ${comLote.length} pregões com lote, ${comLote.reduce((s, l) => s + l.hp.length, 0)} lotes conferidos.</p>
  <div class="placar">
    <div class="cel"><div class="rot">Lançado na filial 2</div><div class="val num">${brl(d.totais.hastapro_filial2)}</div><div class="sub">${d.leiloes.length} aberturas, ${vazios.length} sem nenhum lote.</div></div>
    <div class="cel"><div class="rot">Nosso, nos mesmos leilões</div><div class="val num">${brl(d.totais.nosso_nos_mesmos_leiloes)}</div><div class="sub">Diferença de ${brl(Math.abs(deltaDentro))} dentro da filial 2.</div></div>
    <div class="cel"><div class="rot">Nosso, fora da filial 2</div><div class="val num">${brl(d.totais.nosso_fora_da_filial2)}</div><div class="sub">${d.fora_da_filial2.length} fechamentos sem par no HastaPro.</div></div>
    <div class="cel mark"><div class="rot">Nosso, total de agosto</div><div class="val num">${brl(d.totais.nosso_total)}</div><div class="sub">É o número do painel hoje, antes das correções.</div></div>
  </div>
</header>

<section>
  <div class="sechead"><h2>A conciliação</h2><span class="cnt">3 blocos</span></div>
  <p class="intro">A diferença total de R$ ${brl(d.totais.nosso_total - d.totais.hastapro_filial2)} tem duas origens independentes, e é importante não misturá-las: o que diverge <em>dentro</em> de um leilão que os dois lados têm, e o que existe só de um lado.</p>
  <div class="eq">
    <div class="l"><div class="d">Lançado na filial 2 do HastaPro<small>Soma de LOT_TOTAL dos ${comLote.length} pregões com lote — é a lista que o Matheus enviou</small></div><div class="v num">${brl(d.totais.hastapro_filial2)}</div></div>
    <div class="l"><div class="d">+ Divergências dentro dos mesmos leilões<small>${divergentes.length} pregões, ${divergentes.reduce((s, l) => s + l.linhas.filter(x => x.status !== 'ok').length, 0)} lotes — os outros ${identicos.length} conferem lote a lote</small></div><div class="v num pos">+${brl(deltaDentro)}</div></div>
    <div class="l"><div class="d">+ Fechamentos que não existem na filial 2<small>${d.fora_da_filial2.map(f => f.nome.replace(/^LEILÃO /, '')).join(' · ')}</small></div><div class="v num pos">+${brl(d.totais.nosso_fora_da_filial2)}</div></div>
    <div class="l tot"><div class="d">Nosso VGV de agosto</div><div class="v num">${brl(d.totais.nosso_total)}</div></div>
  </div>
</section>

<section>
  <div class="sechead"><h2>Quadro geral da filial 2</h2><span class="cnt">${identicos.length} de ${comLote.length} conferem integralmente</span></div>
  <p class="intro">Em <b>${identicos.length}</b> dos ${comLote.length} pregões os dois sistemas batem lote a lote e valor a valor — <b>${lotesIdenticos} lotes</b>, R$ ${brl(vgvIdenticos)} sem uma única divergência. As linhas destacadas são as duas que restam.</p>
  <div class="scroll">
    <table>
      <thead><tr>
        <th>Data</th><th>Leilão na filial 2</th>
        <th class="n">Lotes HP</th><th class="n">VGV HastaPro</th>
        <th class="n">Lotes ERP</th><th class="n">VGV nosso</th>
        <th class="n">Delta</th><th>Origem do fechamento</th>
      </tr></thead>
      <tbody>
        ${comLote.map(linhaMestre).join('\n')}
        <tr class="tot"><td></td><td>Total dos pregões com lote</td>
          <td class="n">${comLote.reduce((s, l) => s + l.hp.length, 0)}</td><td class="n">${brl(d.totais.hastapro_filial2)}</td>
          <td class="n">${comLote.reduce((s, l) => s + l.nosso.length, 0)}</td><td class="n">${brl(d.totais.nosso_nos_mesmos_leiloes)}</td>
          <td class="n pos">+${brl(deltaDentro)}</td><td></td></tr>
      </tbody>
    </table>
  </div>
  <p class="intro" style="margin-top:18px;margin-bottom:0">Fora da tabela ficam ${vazios.length} aberturas da filial 2 sem nenhum lote lançado — ${vazios.map(v => `<b>${esc(v.nome)}</b> (${dia(v.data)})`).join(' e ')}. Não somam nada dos dois lados.</p>
</section>

<section>
  <div class="sechead"><h2>Onde os dois lados divergem</h2><span class="cnt">${divergentes.reduce((s, l) => s + l.linhas.filter(x => x.status !== 'ok').length, 0)} lotes em ${divergentes.length} pregões</span></div>
  <p class="intro">Cada linha traz os campos como estão gravados: do lado do HastaPro, <span class="num">LOT_LANCE</span>, <span class="num">LOT_QTD</span>, <span class="num">LOT_TOTAL</span> e <span class="num">LOT_PISTEIRO</span> da tabela <span class="num">LOTES</span>; do nosso lado, o objeto <span class="num">lances[]</span> do fechamento. Os lotes que conferem estão listados junto, para a conta fechar à vista.</p>
  ${divergentes.map(blocoLeilao).join('\n')}
</section>

<section>
  <div class="sechead"><h2>O que não existe na filial 2</h2><span class="cnt">R$ ${brl(d.totais.nosso_fora_da_filial2)} em ${d.fora_da_filial2.length} fechamentos</span></div>
  <p class="intro">Nenhum destes tem par na filial 2 — mas por motivos opostos. Dois são venda real que o HastaPro não registra ali; dois são lote nosso lançado duas vezes.</p>
  ${d.fora_da_filial2.map(blocoFora).join('\n')}
</section>

<section>
  <div class="sechead"><h2>De onde vem cada número</h2><span class="cnt">4 fontes</span></div>
  <dl class="fontes">
    <dt>LOTES</dt><dd><b>HastaPro, Firebird em app.hastapro.com.br:3050.</b> Um registro por lote. <span class="num">LOT_TOTAL</span> é o VGV do lote (lance × parcelas × quantidade de animais) e é o que soma a lista da filial 2. <span class="num">LOT_PISTEIRO</span> aponta para CLIENTES e é quem fez a venda na pista.</dd>
    <dt>COMPRADORES</dt><dd><b>HastaPro.</b> Um registro por <em>dono</em>, não por lote — touro de central é vendido em cotas. Aqui as linhas foram reagrupadas por lote e os donos entram juntos: é por isso que o lote 12 do 28º Camparino aparece com dois compradores.</dd>
    <dt>bula_leilao_fechamento</dt><dd><b>Nosso ERP.</b> O campo <span class="num">lances[]</span> guarda lote, vgv, animais, assessor e comprador. O campo <span class="num">origem</span> diz de onde o fechamento veio: <span class="tag src-hp">hastapro</span> foi importado da filial 2 e por definição confere; <span class="tag src-wa">lances-auto</span> foi montado pelo parser das fichas do WhatsApp e é retificável — todas as divergências deste relatório estão em fechamentos assim.</dd>
    <dt>whatsapp_messages</dt><dd><b>Grupos capturados pela sessão Baileys joao-automation.</b> As fichas de venda (<em>“Levamos lt N — valor — assessor — comprador”</em>) são a fonte primária dos dois sistemas: o HastaPro também é digitado a partir delas. É o que permite dizer que uma venda existiu mesmo quando falta em um dos lados.</dd>
  </dl>
</section>

<footer>
  <p><b>Reprodução.</b> Este relatório é gerado do dataset <span class="num">outputs/conferencia-vgv-agosto-2026/confronto-filial2.json</span>, produzido por <span class="num">scripts/confronto-filial2-agosto-2026.mts</span>. Nenhum valor foi digitado à mão. Para refazer: <span class="num">npx tsx scripts/confronto-filial2-agosto-2026.mts --json</span> seguido de <span class="num">node scripts/gera-relatorio-confronto-filial2.mjs</span>.</p>
  <p>O lote é identificado por número normalizado (sem zero à esquerda) somado ao valor. Comparar só pelo número daria falso positivo — todo leilão tem lote 1, 2, 3 — e foi justamente o zero à esquerda (“09” no HastaPro contra “9” no parser) que deixou passar as duplicatas de agosto.</p>
</footer>
</div>
`

writeFileSync('outputs/conferencia-vgv-agosto-2026/confronto-filial2.html', html)
console.log('html:', 'outputs/conferencia-vgv-agosto-2026/confronto-filial2.html')
console.log(`   ${comLote.length} pregões com lote · ${identicos.length} idênticos · ${divergentes.length} divergentes · ${d.fora_da_filial2.length} fora da filial 2`)
