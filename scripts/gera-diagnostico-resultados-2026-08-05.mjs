// Relatorio "Diagnostico de Resultados — jan-jul 2026 x 2025".
//
// Pergunta de origem (chefe/Joao, 05/08/2026): por que 2026 esta menor que 2025,
// se a arroba caiu ~15% e arroba barata costuma AUMENTAR o giro comercial?
//
// Fontes:
//  - ERP web-bula, bula_leilao_fechamento (2026 ao vivo) e erp_resultados_historico
//    (2025, seed do relatorio Power BI recebido em 20/07/2026).
//  - HastaPro (Firebird, SOMENTE LEITURA) para o preco por cabeca: FIL '2' = Bula
//    Assessoria (elite/PO, 2026) e FIL '01' = Bula Remates (comercial, 2025 e 2026).
//
// Saida: outputs/diagnostico-resultados-2026/ (HTML + PDF A4 paisagem).
//
// Uso: node scripts/gera-diagnostico-resultados-2026-08-05.mjs

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const OUT = 'outputs/diagnostico-resultados-2026'
mkdirSync(OUT, { recursive: true })

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago']

// ── dados ────────────────────────────────────────────────────────────────
// 2026: agregado mensal de bula_leilao_fechamento (jan-ago, ago em curso).
const Y26 = {
  lei: [2, 7, 16, 15, 16, 22, 11, 1],
  lot: [6, 34, 69, 62, 120, 208, 61, 1],
  vgv: [135300, 722300, 2087860, 2782100, 4490000, 8284009, 2182500, 17100],
  rec: [0, 0, 0, 136329.80, 340752.30, 314272.15, 3000, 0],
}
// 2025: erp_resultados_historico (Power BI). Sem receita apurada.
const Y25 = {
  lei: [2, 9, 11, 15, 21, 15, 15, 30],
  lot: [2, 35, 43, 78, 124, 172, 131, 148],
  vgv: [25200, 761700, 1191000, 3258000, 5393740, 8705500, 7346230, 15426797.90],
}
// HastaPro FIL '01' (Bula Remates) — R$ por cabeca, gado majoritariamente comercial.
const REMATES = { a2025: { cab: 8749, vgv: 40967251 }, a2026: { cab: 32960, vgv: 142350713 } }
// HastaPro FIL '2' (Bula Assessoria) — R$ por cabeca, pista de elite/PO.
const ASSESSORIA_2026 = { cab: 677, vgv: 18784069 }
// Cruzamento de julho/2026 (checagem de subregistro): ERP x HastaPro FIL 2.
const JULHO = { erpLei: 11, erpVgv: 2182500, hpLei: 15, hpVgv: 2350500 }

// Indicador do Boi Gordo CEPEA/ESALQ — VERIFICADO na fonte em 05/08/2026.
// A arroba esta MAIS CARA em 2026, em recorde nominal. O ancoramento YoY usa a
// comparacao abril-contra-abril, que e a que o CEPEA publica explicitamente.
const ARROBA = {
  abr25: 324.00,          // media 1a quinzena abr/2025
  abr26: 364.20,          // media 1a quinzena abr/2026 — +12,4% YoY
  min25: 308.40,          // maio/2025, minima daquele ano
  mar26: 356.00,          // fechamento de marco/26 — recorde nominal da serie CEPEA
  jun26: 347.59,          // media de junho/26
  jul26: 335.50,          // media de julho/26 — maior valor nominal para julho da serie
  hoje: 348.55,           // 05/08/2026
}
const arrobaVar = ((ARROBA.abr26 - ARROBA.abr25) / ARROBA.abr25) * 100

// ── calculos ─────────────────────────────────────────────────────────────
const soma = (a, n) => a.slice(0, n).reduce((x, y) => x + y, 0)
const pct = (a, b) => ((a - b) / b) * 100

const per = (n) => ({
  lei26: soma(Y26.lei, n), lei25: soma(Y25.lei, n),
  lot26: soma(Y26.lot, n), lot25: soma(Y25.lot, n),
  vgv26: soma(Y26.vgv, n), vgv25: soma(Y25.vgv, n),
})
const A = per(8)  // jan-ago (agosto em curso) — o numero que a tela mostra hoje
const F = per(7)  // jan-jul (meses fechados) — a base honesta de comparacao
for (const p of [A, F]) {
  p.tk26 = p.vgv26 / p.lot26; p.tk25 = p.vgv25 / p.lot25
  p.lpl26 = p.lot26 / p.lei26; p.lpl25 = p.lot25 / p.lei25
}

// Decomposicao encadeada do VGV: leiloes x (lotes/leilao) x (R$/lote).
// A ordem e declarada no relatorio — atribuicao sequencial, soma exata.
const W = (() => {
  const base = F.vgv25
  const p1 = base * (F.lei26 / F.lei25)
  const p2 = p1 * (F.lpl26 / F.lpl25)
  const p3 = p2 * (F.tk26 / F.tk25)
  return { base, dLei: p1 - base, dLpl: p2 - p1, dTk: p3 - p2, fim: p3 }
})()
// Peso de cada fator na variacao (decomposicao log — soma 100%).
const LG = (() => {
  const l1 = Math.log(F.lei26 / F.lei25), l2 = Math.log(F.lpl26 / F.lpl25), l3 = Math.log(F.tk26 / F.tk25)
  const tot = l1 + l2 + l3
  return { lei: (l1 / tot) * 100, lpl: (l2 / tot) * 100, tk: (l3 / tot) * 100 }
})()

const remCab25 = REMATES.a2025.vgv / REMATES.a2025.cab
const remCab26 = REMATES.a2026.vgv / REMATES.a2026.cab
const remVar = pct(remCab26, remCab25)
const assCab = ASSESSORIA_2026.vgv / ASSESSORIA_2026.cab
const lotesPraEmpatar = F.vgv25 / F.tk26

// O mesmo preco medido em ARROBAS: separa o que e queda de preco do que e alta
// da commodity. Se o lote cai em reais ENQUANTO a arroba sobe, a genetica esta
// descolando para baixo do boi gordo — retracao de demanda, nao indexacao.
const emArrobas = (v, ano) => v / (ano === 25 ? ARROBA.abr25 : ARROBA.abr26)
const tkAr25 = emArrobas(F.tk25, 25), tkAr26 = emArrobas(F.tk26, 26)
const tkArVar = pct(tkAr26, tkAr25)
const comAr25 = emArrobas(remCab25, 25), comAr26 = emArrobas(remCab26, 26)
const comArVar = pct(comAr26, comAr25)

// ── formatadores ─────────────────────────────────────────────────────────
const brl = (v, d = 0) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const mi = (v) => 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
// sinal tipografico: menos real (U+2212), nao hifen — o PDF vai para diretoria
const sg = (v, d = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const dec = (v, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const int = (v) => Number(v).toLocaleString('pt-BR')

// ── grafico 1: cascata da variacao do VGV ────────────────────────────────
// Forma: waterfall. O trabalho do dado e decompor UMA variacao em parcelas que
// somam — barras ancoradas na linha de base, nao linhas.
function chartCascata() {
  const w = 1000, h = 320, padT = 26, padB = 46, padL = 8, padR = 8
  const innerH = h - padT - padB
  const passos = [
    { lb: `Jan–jul 2025`, val: W.base, tipo: 'base' },
    { lb: 'Nº de leilões', d: W.dLei, tipo: 'delta' },
    { lb: 'Lotes por leilão', d: W.dLpl, tipo: 'delta' },
    { lb: 'Preço por lote', d: W.dTk, tipo: 'delta' },
    { lb: `Jan–jul 2026`, val: W.fim, tipo: 'base' },
  ]
  const max = Math.max(W.base, W.fim, W.base + W.dLei) * 1.06
  const y = (v) => padT + innerH - (v / max) * innerH
  const bw = (w - padL - padR) / passos.length
  let acc = 0, svg = ''
  // grade recessiva
  for (let i = 0; i <= 4; i++) {
    const gv = (max / 4) * i, gy = y(gv)
    svg += `<line x1="${padL}" y1="${gy}" x2="${w - padR}" y2="${gy}" stroke="#e4e2dd" stroke-width="1"/>`
    svg += `<text x="${padL + 2}" y="${gy - 4}" font-size="9.5" fill="#9a978f">${(gv / 1e6).toFixed(0)} mi</text>`
  }
  passos.forEach((p, i) => {
    const cx = padL + bw * i + bw / 2, barW = bw * 0.44
    let y0, y1, fill, rotulo, sub
    if (p.tipo === 'base') {
      const v = p.val
      y0 = y(v); y1 = y(0); fill = '#141414'; acc = v
      rotulo = mi(v); sub = p.lb
    } else {
      const de = acc + p.d
      y0 = y(Math.max(acc, de)); y1 = y(Math.min(acc, de))
      fill = p.d >= 0 ? '#9a978f' : '#C9A84C'
      rotulo = (p.d >= 0 ? '+' : '−') + mi(Math.abs(p.d)).replace('R$ ', 'R$ ')
      sub = p.lb; acc = de
    }
    const alt = Math.max(Math.abs(y1 - y0), 2)
    svg += `<rect x="${cx - barW / 2}" y="${y0}" width="${barW}" height="${alt}" fill="${fill}" rx="4"/>`
    svg += `<text x="${cx}" y="${y0 - 8}" text-anchor="middle" font-size="13" font-family="Oswald,sans-serif" font-weight="600" fill="#141414">${rotulo}</text>`
    svg += `<text x="${cx}" y="${h - 24}" text-anchor="middle" font-size="10.5" fill="#141414" font-weight="600">${sub}</text>`
    if (p.tipo === 'delta') {
      // peso log do fator. Negativo = o fator empurrou PARA CIMA (devolveu VGV).
      const share = p.lb.startsWith('Nº') ? LG.lei : p.lb.startsWith('Lotes') ? LG.lpl : LG.tk
      const txt = share < 0 ? `devolveu ${Math.abs(share).toFixed(0)}%` : `${share.toFixed(0)}% da queda`
      svg += `<text x="${cx}" y="${h - 10}" text-anchor="middle" font-size="9.5" fill="#6f6f6f">${txt}</text>`
    }
    // conector pontilhado ate o proximo passo
    if (i < passos.length - 1) {
      const yc = y(acc)
      svg += `<line x1="${cx + barW / 2}" y1="${yc}" x2="${padL + bw * (i + 1) + bw / 2 - barW / 2}" y2="${yc}" stroke="#c9c6c0" stroke-width="1" stroke-dasharray="3 3"/>`
    }
  })
  svg += `<line x1="${padL}" y1="${y(0)}" x2="${w - padR}" y2="${y(0)}" stroke="#141414" stroke-width="1.5"/>`
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`
}

// ── grafico 2: ticket medio mensal, 2026 x 2025 ──────────────────────────
// Duas series na MESMA escala (um eixo). Identidade por cor + traco (o traco
// e a codificacao secundaria que faz o grafico sobreviver ao P&B).
function chartTicket() {
  const w = 1000, h = 300, padT = 30, padB = 42, padL = 52, padR = 14
  const innerW = w - padL - padR, innerH = h - padT - padB
  const t26 = Y26.vgv.slice(0, 7).map((v, i) => v / Y26.lot[i])
  const t25 = Y25.vgv.slice(0, 7).map((v, i) => v / Y25.lot[i])
  const max = Math.max(...t26, ...t25) * 1.16
  const x = (i) => padL + (innerW / 6) * i
  const y = (v) => padT + innerH - (v / max) * innerH
  let svg = ''
  for (let i = 0; i <= 4; i++) {
    const gv = (max / 4) * i, gy = y(gv)
    svg += `<line x1="${padL}" y1="${gy}" x2="${w - padR}" y2="${gy}" stroke="#e4e2dd" stroke-width="1"/>`
    svg += `<text x="${padL - 8}" y="${gy + 3}" text-anchor="end" font-size="9.5" fill="#9a978f">${(gv / 1000).toFixed(0)}k</text>`
  }
  // sombreado da janela de compressao (mai-jul) — ANTES das linhas, para ficar atras
  svg += `<rect x="${x(4) - 6}" y="${padT}" width="${x(6) - x(4) + 12}" height="${innerH}" fill="#C9A84C" opacity="0.09"/>`
  svg += `<text x="${(x(4) + x(6)) / 2}" y="${padT + 13}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#9a7c2e">JANELA DE COMPRESSÃO</text>`
  const linha = (arr, cor, dash) => {
    const d = arr.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ')
    return `<path d="${d}" fill="none" stroke="${cor}" stroke-width="2"${dash ? ' stroke-dasharray="6 4"' : ''}/>`
      + arr.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${cor}" stroke="#fff" stroke-width="2"/>`).join('')
  }
  svg += linha(t25, '#9a978f', true)
  svg += linha(t26, '#141414', false)
  // Rotulos diretos SO nas pontas (jan e jul). Cada rotulo vai para o lado em que
  // sua serie esta — a de cima recebe rotulo acima, a de baixo recebe abaixo —
  // entao as duas nunca colidem, mesmo quando as linhas se cruzam.
  for (const i of [0, 6]) {
    const anchor = i === 0 ? 'start' : 'end'
    const dx = i === 0 ? -4 : 4
    const cima26 = t26[i] >= t25[i]
    svg += `<text x="${x(i) + dx}" y="${y(t26[i]) + (cima26 ? -12 : 19)}" text-anchor="${anchor}" font-size="10.5" font-weight="700" fill="#141414">${brl(t26[i])}</text>`
    svg += `<text x="${x(i) + dx}" y="${y(t25[i]) + (cima26 ? 19 : -12)}" text-anchor="${anchor}" font-size="10.5" fill="#6f6f6f">${brl(t25[i])}</text>`
  }
  MESES.slice(0, 7).forEach((m, i) => {
    svg += `<text x="${x(i)}" y="${h - 20}" text-anchor="middle" font-size="11" fill="#141414">${m}</text>`
    const d = pct(t26[i], t25[i])
    svg += `<text x="${x(i)}" y="${h - 7}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${d < 0 ? '#141414' : '#9a978f'}">${sg(d, 0)}</text>`
  })
  // legenda (2 series => legenda sempre presente)
  svg += `<line x1="${padL}" y1="12" x2="${padL + 22}" y2="12" stroke="#141414" stroke-width="2"/>`
  svg += `<text x="${padL + 28}" y="15.5" font-size="10.5" fill="#141414">2026</text>`
  svg += `<line x1="${padL + 70}" y1="12" x2="${padL + 92}" y2="12" stroke="#9a978f" stroke-width="2" stroke-dasharray="6 4"/>`
  svg += `<text x="${padL + 98}" y="15.5" font-size="10.5" fill="#6f6f6f">2025</text>`
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`
}

// ── paginas ──────────────────────────────────────────────────────────────
const rodape = (n) => `<div class="foot"><span>Bula Assessoria · Diagnóstico de Resultados 2026</span><span>Confidencial — uso interno</span><span>${String(n).padStart(2, '0')}</span></div>`

const tabMensal = () => {
  let linhas = ''
  for (let i = 0; i < 7; i++) {
    const t26 = Y26.vgv[i] / Y26.lot[i], t25 = Y25.vgv[i] / Y25.lot[i]
    const d = pct(t26, t25)
    linhas += `<tr>
      <td style="text-transform:capitalize"><b>${MESES[i]}</b></td>
      <td class="r">${Y26.lei[i]}</td><td class="r muted">${Y25.lei[i]}</td>
      <td class="r">${int(Y26.lot[i])}</td><td class="r muted">${int(Y25.lot[i])}</td>
      <td class="r">${brl(Y26.vgv[i])}</td><td class="r muted">${brl(Y25.vgv[i])}</td>
      <td class="r"><b>${brl(t26)}</b></td><td class="r muted">${brl(t25)}</td>
      <td class="r ${d < 0 ? 'neg' : ''}"><b>${sg(d, 0)}</b></td>
    </tr>`
  }
  linhas += `<tr class="total">
    <td>Jan–jul</td>
    <td class="r">${F.lei26}</td><td class="r muted">${F.lei25}</td>
    <td class="r">${int(F.lot26)}</td><td class="r muted">${int(F.lot25)}</td>
    <td class="r">${brl(F.vgv26)}</td><td class="r muted">${brl(F.vgv25)}</td>
    <td class="r">${brl(F.tk26)}</td><td class="r muted">${brl(F.tk25)}</td>
    <td class="r neg">${sg(pct(F.tk26, F.tk25), 0)}</td>
  </tr>`
  // agosto entra FORA do total, apagado e rotulado — e o par que distorce a tela
  const t26a = Y26.vgv[7] / Y26.lot[7], t25a = Y25.vgv[7] / Y25.lot[7]
  linhas += `<tr style="color:#9a978f">
    <td><b>ago</b> <span class="badge" style="border-color:#9a978f;color:#9a978f">em curso</span></td>
    <td class="r">${Y26.lei[7]}</td><td class="r">${Y25.lei[7]}</td>
    <td class="r">${int(Y26.lot[7])}</td><td class="r">${int(Y25.lot[7])}</td>
    <td class="r">${brl(Y26.vgv[7])}</td><td class="r">${brl(Y25.vgv[7])}</td>
    <td class="r">${brl(t26a)}</td><td class="r">${brl(t25a)}</td>
    <td class="r">${sg(pct(t26a, t25a), 0)}</td>
  </tr>`
  return linhas
}

const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Diagnóstico de Resultados 2026 — Bula Assessoria</title><style>
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;color:#141414;background:#fff;font-size:12.5px;line-height:1.5}
.page{width:277mm;min-height:190mm;padding:11mm 13mm 9mm;page-break-after:always;position:relative;display:flow-root}
.page:last-child{page-break-after:auto}
h1,h2,h3,.kicker{font-family:'Oswald','Arial Narrow',sans-serif;text-transform:uppercase;letter-spacing:.06em}
.kicker{font-size:11px;color:#6f6f6f;letter-spacing:.28em;margin-bottom:4px}
h1{font-size:40px;font-weight:600;line-height:1.12}
h2{font-size:21px;font-weight:600;border-bottom:2.5px solid #141414;padding-bottom:6px;margin-bottom:12px}
h2 .num{color:#C9A84C;margin-right:8px}
h3{font-size:13.5px;font-weight:600;margin:14px 0 6px;letter-spacing:.1em}
p{margin-bottom:8px}
.gold-rule{width:64px;height:4px;background:#C9A84C;margin:14px 0 18px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}
.tiles.t3{grid-template-columns:repeat(3,1fr)}
.tiles.t2{grid-template-columns:repeat(2,1fr)}
.tile{border:1px solid #e4e2dd;border-top:3px solid #141414;padding:10px 12px}
.tile.au{border-top-color:#C9A84C}
.tile .lb{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#6f6f6f;margin-bottom:3px}
.tile .v{font-family:'Oswald',sans-serif;font-size:24px;font-weight:600;line-height:1.1}
.tile .sub{font-size:10.5px;color:#6f6f6f;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:11.3px}
th{font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:.08em;font-size:10px;text-align:left;border-bottom:2px solid #141414;padding:5px 7px}
th.r{text-align:right}
td{border-bottom:1px solid #e4e2dd;padding:4.5px 7px;vertical-align:top}
tr.total td{border-top:2px solid #141414;border-bottom:none;font-weight:700;background:#faf9f7}
.r{text-align:right;white-space:nowrap}.c{text-align:center}
.muted{color:#6f6f6f}.neg{color:#141414}
.note{border-left:3px solid #C9A84C;background:#faf8f3;padding:9px 12px;font-size:11.5px;margin:10px 0}
.note.dark{border-left-color:#141414;background:#f5f4f2}
.foot{position:absolute;bottom:6mm;left:13mm;right:13mm;display:flex;justify-content:space-between;font-size:9.5px;color:#6f6f6f;border-top:1px solid #e4e2dd;padding-top:4px;text-transform:uppercase;letter-spacing:.12em}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.cols.c37{grid-template-columns:1.1fr 1fr}
.badge{display:inline-block;font-size:9px;text-transform:uppercase;letter-spacing:.1em;border:1px solid #141414;padding:1px 6px;margin-left:6px}
.badge.au{border-color:#C9A84C;color:#9a7c2e}
ul{margin:0 0 8px 16px}li{margin-bottom:5px}
.big{font-family:'Oswald',sans-serif;font-size:52px;font-weight:600;line-height:1}
.chartbox{border:1px solid #e4e2dd;padding:10px 12px 4px;margin:6px 0 10px}
.chartbox .ct{font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:.1em;font-size:11px;margin-bottom:2px}
.chartbox .cs{font-size:10.5px;color:#6f6f6f;margin-bottom:6px}
@page{size:A4 landscape;margin:0}
</style></head><body>

<!-- 01 CAPA -->
<div class="page" style="display:flex;flex-direction:column;justify-content:center">
  <div class="kicker">Bula Assessoria · Inteligência Comercial</div>
  <h1>Por que 2026 está menor<br>que 2025</h1>
  <div class="gold-rule"></div>
  <p style="max-width:700px" class="muted">Diagnóstico da queda de resultado do exercício de 2026 contra 2025, decomposta em volume e preço, e leitura do efeito do ciclo da arroba — em recorde nominal — sobre o mercado de genética. Base: meses fechados de janeiro a julho.</p>
  <div class="tiles" style="margin-top:26px">
    <div class="tile"><div class="lb">Queda de VGV · jan–jul</div><div class="v">${sg(pct(F.vgv26, F.vgv25), 1)}</div><div class="sub">${mi(F.vgv26)} contra ${mi(F.vgv25)}</div></div>
    <div class="tile"><div class="lb">Leilões assessorados</div><div class="v">${sg(pct(F.lei26, F.lei25), 1)}</div><div class="sub">${F.lei26} praças contra ${F.lei25} — atividade estável</div></div>
    <div class="tile au"><div class="lb">Preço por lote</div><div class="v">${sg(pct(F.tk26, F.tk25), 1)}</div><div class="sub">${brl(F.tk26)} contra ${brl(F.tk25)}</div></div>
    <div class="tile au"><div class="lb">Preço por lote em arrobas</div><div class="v">${sg(tkArVar, 1)}</div><div class="sub">${dec(tkAr25, 1)} @ → ${dec(tkAr26, 1)} @ · a arroba subiu ${sg(arrobaVar, 1)}</div></div>
  </div>
  <p class="muted" style="margin-top:18px;font-size:11px">Emitido em 05/08/2026 · Fontes: ERP Bula (bula_leilao_fechamento, jan–ago/26 · erp_resultados_historico, 2025 Power BI), HastaPro (Firebird, consulta somente leitura) e Indicador do Boi Gordo CEPEA/ESALQ</p>
  ${rodape(1)}
</div>

<!-- 02 SUMARIO -->
<div class="page">
  <h2><span class="num">01</span>Sumário Executivo</h2>
  <div class="cols c37">
    <div>
      <p><b>A queda de 50,8% que aparece na tela de Resultados não é real.</b> Ela compara os quatro primeiros dias de agosto de 2026 com um agosto de 2025 recorde — R$ 15,43 mi, sozinho <b>36,6%</b> de todo o acumulado jan–ago daquele ano. Comparado mês fechado contra mês fechado, o recuo é de <b>${sg(pct(F.vgv26, F.vgv25), 1)}</b>.</p>
      <p><b>E esse recuo é quase inteiramente preço.</b> A equipe cobriu <b>${F.lei26} praças contra ${F.lei25}</b> — atividade praticamente idêntica, com ${dec(F.lpl26)} lotes por leilão contra ${dec(F.lpl25)}. O que mudou foi quanto vale cada lote: <b>${brl(F.tk26)} contra ${brl(F.tk25)}</b>, ${sg(pct(F.tk26, F.tk25), 1)}. Na decomposição do VGV, o preço responde por <b>${LG.tk.toFixed(0)}%</b> da variação; o número de leilões chegou a <i>devolver</i> ${Math.abs(LG.lei).toFixed(0)}%.</p>
      <p><b>A causa está no ciclo da arroba — mas pela escassez, não pela fartura.</b> O boi gordo está em <b>recorde nominal em 2026</b> (${brl(ARROBA.abr26, 2)} em abril contra ${brl(ARROBA.abr25, 2)} em 2025, ${sg(arrobaVar, 1)}), e o CEPEA atribui a alta à <b>oferta reduzida de machos</b>. Arroba barata movimenta pista e é boa para assessoria; arroba cara por escassez trava a pista: há menos animal circulando, o pecuarista realiza em vez de investir, e a reposição — em máxima histórica medida em arrobas — disputa o mesmo caixa da genética.</p>
      <p><b>E o efeito é mais severo do que a queda em reais sugere.</b> Medido em arrobas, o preço do nosso lote passou de <b>${dec(tkAr25, 1)} @ para ${dec(tkAr26, 1)} @ — ${sg(tkArVar, 1)}</b>. O lote caiu ${sg(pct(F.tk26, F.tk25), 1)} em reais <i>enquanto</i> a commodity subia ${sg(arrobaVar, 1)}: a genética <b>descolou para baixo</b> do boi gordo. Não é indexação — é retração de demanda.</p>
      <p>O diagnóstico prático: <b>não há problema de execução comercial a corrigir.</b> A capacidade produtiva está intacta. O que caiu foi a disposição a pagar por genética num ano em que o boi gordo nunca valeu tanto.</p>
    </div>
    <div>
      <div class="note"><b>O que este relatório corrige.</b> O indicador exibido hoje no ERP (−50,8%) mistura um mês em curso com um mês fechado recorde. Enquanto agosto não terminar, o único comparativo defensável é jan–jul. Toda a análise a seguir usa essa base.</div>
      <h3>Os quatro achados</h3>
      <ul>
        <li><b>Atividade preservada.</b> ${F.lei26} leilões contra ${F.lei25}; ${int(F.lot26)} lotes contra ${int(F.lot25)} (${sg(pct(F.lot26, F.lot25), 1)}).</li>
        <li><b>Preço comprimido.</b> ${sg(pct(F.tk26, F.tk25), 1)} no valor médio por lote — ${LG.tk.toFixed(0)}% da queda total.</li>
        <li><b>Compressão recente.</b> Até abril o ticket estava <i>acima</i> de 2025. A deterioração começa em maio e se aprofunda até julho (${sg(pct(Y26.vgv[6] / Y26.lot[6], Y25.vgv[6] / Y25.lot[6]), 0)}).</li>
        <li><b>Queda real maior que a nominal.</b> Em arrobas, o lote recuou ${sg(tkArVar, 1)} — contra ${sg(comArVar, 1)} do gado comercial na mesma medida.</li>
      </ul>
      <h3>Consequência para o segundo semestre</h3>
      <p style="font-size:11.8px">Para igualar o VGV de jan–jul de 2025 com o ticket de hoje seriam necessários <b>${int(Math.round(lotesPraEmpatar))} lotes contra os ${int(F.lot26)} realizados — ${sg(pct(lotesPraEmpatar, F.lot26), 0)} de volume</b>. O ano se decide de agosto em diante: agosto de 2025 sozinho fez ${mi(Y25.vgv[7])}, e a agenda mapeada para agosto de 2026 soma R$ 68,0 mi de faturamento potencial.</p>
    </div>
  </div>
  <h3 style="margin-top:16px">Dois recortes, duas histórias</h3>
  <table style="margin-top:2px">
    <thead><tr>
      <th>Recorte</th><th class="r">Leilões</th><th class="r">Lotes</th><th class="r">VGV</th><th class="r">Preço por lote</th><th>Por que muda tanto</th>
    </tr></thead>
    <tbody>
      <tr>
        <td><b>Jan–ago</b> <span class="badge">agosto em curso</span></td>
        <td class="r">${sg(pct(A.lei26, A.lei25), 1)}</td>
        <td class="r">${sg(pct(A.lot26, A.lot25), 1)}</td>
        <td class="r"><b>${sg(pct(A.vgv26, A.vgv25), 1)}</b></td>
        <td class="r">${sg(pct(A.tk26, A.tk25), 1)}</td>
        <td class="muted">4 dias de agosto/26 contra o agosto recorde de 2025 (${mi(Y25.vgv[7])})</td>
      </tr>
      <tr class="total">
        <td><b>Jan–jul</b> <span class="badge au">meses fechados</span></td>
        <td class="r">${sg(pct(F.lei26, F.lei25), 1)}</td>
        <td class="r">${sg(pct(F.lot26, F.lot25), 1)}</td>
        <td class="r">${sg(pct(F.vgv26, F.vgv25), 1)}</td>
        <td class="r">${sg(pct(F.tk26, F.tk25), 1)}</td>
        <td class="muted" style="font-weight:400">mesma janela de calendário fechada nos dois anos</td>
      </tr>
    </tbody>
  </table>
  <p class="muted" style="font-size:11px;margin-top:6px">O número de leilões passa de ${sg(pct(A.lei26, A.lei25), 1)} para ${sg(pct(F.lei26, F.lei25), 1)} apenas por retirar agosto da conta — prova de que a leitura de "queda de atividade" é artefato do recorte, não do desempenho.</p>
  ${rodape(2)}
</div>

<!-- 03 DECOMPOSICAO -->
<div class="page">
  <h2><span class="num">02</span>De Onde Vem a Queda — Volume ou Preço</h2>
  <p style="margin-bottom:4px">O VGV é o produto de três fatores: <b>número de leilões × lotes por leilão × preço por lote</b>. Decompondo a variação de jan–jul nessa ordem, cada parcela é exata e as três somam a diferença total de ${mi(Math.abs(W.fim - W.base))}.</p>
  <div class="chartbox">
    <div class="ct">Ponte do VGV · jan–jul 2025 → jan–jul 2026</div>
    <div class="cs">Atribuição sequencial na ordem leilões → lotes por leilão → preço por lote. Barras em dourado reduzem o VGV; em cinza, aumentam.</div>
    ${chartCascata()}
  </div>
  <div class="cols">
    <div>
      <div class="note dark"><b>Leitura.</b> A equipe não trabalhou menos: o número de praças <i>subiu</i> e devolveu ${brl(W.dLei)} ao resultado. A composição da pista tirou ${brl(Math.abs(W.dLpl))} — menos lotes por leilão. E o preço por lote sozinho tirou <b>${brl(Math.abs(W.dTk))}</b>, ${LG.tk.toFixed(0)}% de toda a variação.</div>
    </div>
    <div>
      <h3 style="margin-top:0">Por que isso muda a conversa</h3>
      <p style="font-size:11.8px">Uma queda de volume se combate com agenda, prospecção e presença em pista — coisas sob controle da equipe. Uma queda de preço unitário num ativo indexado à arroba não responde a esforço comercial: responde a ciclo. Cobrar mais praças de um time que já entregou mais praças que no ano anterior não recupera o VGV.</p>
    </div>
  </div>
  ${rodape(3)}
</div>

<!-- 04 A TESE -->
<div class="page">
  <h2><span class="num">03</span>A Arroba em Recorde é Vento Contra</h2>
  <div class="cols c37">
    <div>
      <h3 style="margin-top:0">O que a arroba realmente fez</h3>
      <p>O Indicador do Boi Gordo CEPEA/ESALQ está em <b>recorde nominal em 2026</b>. Março fechou a <b>${brl(ARROBA.mar26, 2)}</b>, maior valor da série histórica; julho fez média de <b>${brl(ARROBA.jul26, 2)}</b>, o maior valor nominal já registrado para um mês de julho; em 05/08 o indicador estava em <b>${brl(ARROBA.hoje, 2)}</b>. Contra o mesmo mês de 2025, abril de 2026 ficou <b>${sg(arrobaVar, 1)}</b> acima (${brl(ARROBA.abr26, 2)} contra ${brl(ARROBA.abr25, 2)}). Em 2025 a arroba chegou a operar na mínima de ${brl(ARROBA.min25, 2)}.</p>
      <h3>Por que arroba cara reduz o nosso negócio</h3>
      <p>Uma assessoria vive de <b>transação</b>: quantidade de pista e valor negociado. Arroba cara atua contra os dois.</p>
      <ul>
        <li><b>Menos animal circulando.</b> O CEPEA atribui a alta de 2026 justamente à <b>oferta reduzida de machos desde o início do ano</b>, somada à demanda externa aquecida. Preço alto por escassez significa menos animal disponível para ir a leilão.</li>
        <li><b>O pecuarista realiza em vez de investir.</b> Com o boi gordo em máxima histórica, o incentivo é vender o que está pronto e capturar o preço — não comprar genética no topo do ciclo.</li>
        <li><b>A reposição ficou cara e disputa o mesmo caixa.</b> Em julho de 2026 a relação arrobas-de-boi-por-bezerro atingiu máxima histórica: repor o rebanho consome mais arrobas do que nunca, e reposição concorre diretamente com genética.</li>
      </ul>
      <div class="note"><b>Confirmação.</b> Arroba barata movimenta o mercado e é boa para assessoria; arroba cara por escassez trava a pista. 2025 teve a arroba mais baixa e mais negócio. 2026 tem recorde de preço e menos negócio.</div>
    </div>
    <div>
      <h3 style="margin-top:0">O achado: a genética descolou para baixo</h3>
      <p style="font-size:11.8px">Medir o nosso preço <b>em arrobas</b> separa o que é queda nossa do que é movimento da commodity. O resultado é mais severo que a leitura em reais: o lote perdeu quase um terço do seu valor medido em boi gordo.</p>
      <table style="margin-top:8px">
        <thead><tr><th>Jan–jul</th><th class="r">2025</th><th class="r">2026</th><th class="r">Variação</th></tr></thead>
        <tbody>
          <tr><td>Arroba do boi gordo <span class="muted">CEPEA, abr/abr</span></td><td class="r">${brl(ARROBA.abr25, 2)}</td><td class="r">${brl(ARROBA.abr26, 2)}</td><td class="r">${sg(arrobaVar, 1)}</td></tr>
          <tr><td>Preço por lote <span class="muted">nossa cobertura</span></td><td class="r">${brl(F.tk25)}</td><td class="r">${brl(F.tk26)}</td><td class="r">${sg(pct(F.tk26, F.tk25), 1)}</td></tr>
          <tr class="total"><td>Preço por lote <b>em arrobas</b></td><td class="r">${dec(tkAr25, 1)} @</td><td class="r">${dec(tkAr26, 1)} @</td><td class="r">${sg(tkArVar, 1)}</td></tr>
        </tbody>
      </table>
      <div class="note dark"><b>Leitura.</b> O preço do lote caiu ${sg(pct(F.tk26, F.tk25), 1)} em reais <i>enquanto</i> a commodity subia ${sg(arrobaVar, 1)}. Em arrobas, o mesmo lote passou de ${dec(tkAr25, 1)} para ${dec(tkAr26, 1)} — <b>${sg(tkArVar, 1)}</b>. Não é indexação à arroba: é <b>retração de demanda por genética</b>, num ano em que o boi gordo nunca valeu tanto.</div>
      <h3>O mesmo teste no gado comercial</h3>
      <div class="tiles t2" style="margin-top:6px">
        <div class="tile"><div class="lb">Comercial · Bula Remates</div><div class="v">${sg(comArVar, 1)}</div><div class="sub">${dec(comAr25, 1)} @ → ${dec(comAr26, 1)} @ por cabeça</div></div>
        <div class="tile au"><div class="lb">Elite / PO · nossa pista</div><div class="v">${sg(tkArVar, 1)}</div><div class="sub">${dec(tkAr25, 1)} @ → ${dec(tkAr26, 1)} @ por lote</div></div>
      </div>
      <p style="font-size:11.5px;margin-top:8px">Os dois segmentos recuaram em arrobas, mas o <b>elite recuou mais</b> — o que se esperaria de uma compra discricionária contra uma compra de necessidade.</p>
      <div class="note dark" style="font-size:10.8px"><b>Ressalvas.</b> A série do comercial compara out–dez/2025 com jan–jul/2026 (o HastaPro só existe desde 30/09/2025) e carrega efeito de safra — leia como ordem de grandeza. A conversão em arrobas usa a âncora abril/abril do CEPEA, não a média jan–jul de cada ano.</div>
    </div>
  </div>
  ${rodape(4)}
</div>

<!-- 05 TIMING -->
<div class="page">
  <h2><span class="num">04</span>Quando a Compressão Começou</h2>
  <p style="margin-bottom:4px">A compressão não vem do ano inteiro. Até abril o preço por lote estava <b>acima</b> de 2025. A divergência abre em maio e se aprofunda a cada mês.</p>
  <div class="chartbox">
    <div class="ct">Preço médio por lote · 2026 contra 2025</div>
    <div class="cs">Mesma escala para as duas séries. Sob cada mês, a variação do ano contra ano.</div>
    ${chartTicket()}
  </div>
  <div class="cols">
    <div>
      <div class="note"><b>Julho não é falha de registro.</b> Julho de 2026 caiu ${sg(pct(Y26.vgv[6], Y25.vgv[6]), 0)} contra julho de 2025 — um desvio grande o bastante para levantar suspeita de lançamento faltando. O cruzamento com o HastaPro descarta: a fonte independente aponta ${mi(JULHO.hpVgv)} de cobertura contra ${mi(JULHO.erpVgv)} no ERP. <b>O mês foi fraco de fato.</b></div>
    </div>
    <div>
      <h3 style="margin-top:0">O que a virada de maio sugere</h3>
      <p style="font-size:11.8px">Um recuo que só aparece a partir do segundo trimestre não é condição estrutural do ano — é repactuação de preço em curso. O primeiro quadrimestre ainda carregava expectativa de arroba do ciclo anterior; a partir de maio a pista passou a precificar a arroba corrente. Isso torna o segundo semestre o período decisivo, e não uma simples extensão da tendência.</p>
    </div>
  </div>
  ${rodape(5)}
</div>

<!-- 06 TABELA -->
<div class="page">
  <h2><span class="num">05</span>Mês a Mês — Base Completa</h2>
  <table>
    <thead><tr>
      <th>Mês</th>
      <th class="r">Leilões 26</th><th class="r">Leilões 25</th>
      <th class="r">Lotes 26</th><th class="r">Lotes 25</th>
      <th class="r">VGV 2026</th><th class="r">VGV 2025</th>
      <th class="r">Preço/lote 26</th><th class="r">Preço/lote 25</th>
      <th class="r">Var. preço</th>
    </tr></thead>
    <tbody>${tabMensal()}</tbody>
  </table>
  <div class="cols" style="margin-top:14px">
    <div>
      <div class="note dark"><b>Agosto fora da conta.</b> Agosto de 2026 tem ${Y26.lei[7]} leilão registrado (${brl(Y26.vgv[7])}) contra ${Y25.lei[7]} leilões e ${mi(Y25.vgv[7])} em 2025. Incluir esse par no comparativo é o que produz o −50,8% da tela. O mês entra na análise quando fechar.</div>
    </div>
    <div>
      <h3 style="margin-top:0">Sobre o faturamento</h3>
      <p style="font-size:11.8px">Este relatório compara <b>VGV (cobertura da equipe)</b>, não receita. A receita da assessoria em 2025 nunca foi apurada mês a mês: o consolidado de 2025 veio do relatório de Power BI da equipe, que trouxe apenas operação. No HastaPro também não existe — o sistema foi implantado em 30/09/2025 e o financeiro daquele ano soma R$ 21,4 mil a pagar e R$ 66,00 a receber. Comparação de faturamento entre os dois anos só será possível quando 2025 for apurado.</p>
    </div>
  </div>
  ${rodape(6)}
</div>

<!-- 07 IMPLICACOES -->
<div class="page">
  <h2><span class="num">06</span>Implicações e Método</h2>
  <div class="cols c37">
    <div>
      <h3 style="margin-top:0">O que decorre do diagnóstico</h3>
      <ul>
        <li><b>Não cobrar volume de praça da equipe como resposta.</b> ${F.lei26} leilões contra ${F.lei25} mostra que a capacidade produtiva está intacta. A alavanca não está no esforço.</li>
        <li><b>A recomposição por volume é cara.</b> Empatar com jan–jul/2025 no ticket atual exigiria ${int(Math.round(lotesPraEmpatar))} lotes — ${sg(pct(lotesPraEmpatar, F.lot26), 0)} sobre o realizado. É muito para o segundo semestre absorver sozinho.</li>
        <li><b>Mix é a alavanca disponível.</b> Como o recuo é de preço unitário, subir a categoria média da pista compensa mais rápido que somar lotes. Isso significa priorizar praças de elite na agenda, não apenas encher calendário.</li>
        <li><b>Reler a meta de agosto sob essa luz.</b> A agenda de agosto soma R$ 68,0 mi de faturamento potencial e a meta de cobertura definida é 12%. Com a disposição a pagar comprimida, a defesa da meta está no ticket da pista escolhida.</li>
        <li><b>O gatilho de virada é a oferta, não o preço da arroba.</b> Como a alta de 2026 vem de escassez de animal, o que devolve pista é a normalização da oferta — acompanhar abate e retenção antecipa melhor a retomada do que o próprio indicador da arroba.</li>
        <li><b>Passar a acompanhar preço por lote e preço por lote em arrobas.</b> Hoje o ERP mostra VGV, leilões e lotes. O preço por lote antecipou a virada de maio; medido em arrobas, separa o que é mercado do que é commodity.</li>
      </ul>
    </div>
    <div>
      <h3 style="margin-top:0">Fontes e método</h3>
      <p style="font-size:11.5px"><b>2026:</b> agregação mensal de <code>bula_leilao_fechamento</code> no ERP (${A.lei26} fechamentos registrados até 05/08). <b>2025:</b> <code>erp_resultados_historico</code>, seed do relatório de Power BI da equipe recebido em 20/07/2026 (190 leilões · 1.267 lotes · R$ 63,98 mi no ano).</p>
      <p style="font-size:11.5px"><b>Preço por cabeça:</b> HastaPro (Firebird), consultas <b>exclusivamente de leitura</b>. Filial '2' = Bula Assessoria (elite, só 2026); filial '01' = Bula Remates (comercial, out–dez/2025 e jan–jul/2026).</p>
      <p style="font-size:11.5px"><b>Decomposição:</b> atribuição sequencial encadeada na ordem leilões → lotes por leilão → preço por lote (as parcelas somam exatamente a variação). Os pesos percentuais usam decomposição logarítmica, invariante à ordem.</p>
      <h3>Limites desta análise</h3>
      <ul style="font-size:11.5px">
        <li>A arroba vem do Indicador do Boi Gordo CEPEA/ESALQ, conferido na fonte em 05/08/2026. A conversão em arrobas usa a âncora abril/abril (o comparativo anual que o CEPEA publica), não a média jan–jul de cada ano — o percentual muda alguns pontos conforme a âncora, o sentido não.</li>
        <li>A comparação de R$/cabeça no comercial não tem janela sobreposta entre os anos e carrega efeito de safra.</li>
        <li>O VGV de 2025 é agregado consolidado: não permite abrir por leiloeira, categoria ou assessor. A decomposição por mix de categoria só existe para 2026.</li>
        <li>Fechamentos de 2026 sem receita lançada não afetam esta análise, que compara VGV, mas impedem a leitura de margem no mesmo recorte.</li>
      </ul>
    </div>
  </div>
  ${rodape(7)}
</div>

</body></html>`

const htmlPath = join(OUT, 'diagnostico-resultados-2026.html')
writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto('file://' + join(process.cwd(), htmlPath).replace(/\\/g, '/'), { waitUntil: 'networkidle' })
await page.pdf({
  path: join(OUT, 'diagnostico-resultados-2026.pdf'),
  format: 'A4', landscape: true, printBackground: true,
  margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
})
await browser.close()

console.log('HTML :', htmlPath)
console.log('PDF  :', join(OUT, 'diagnostico-resultados-2026.pdf'))
console.log('')
console.log('jan-jul  VGV  ', mi(F.vgv26), 'x', mi(F.vgv25), sg(pct(F.vgv26, F.vgv25)))
console.log('         lei  ', F.lei26, 'x', F.lei25, sg(pct(F.lei26, F.lei25)))
console.log('         tick ', brl(F.tk26), 'x', brl(F.tk25), sg(pct(F.tk26, F.tk25)))
console.log('cascata  ', brl(W.dLei), '/', brl(W.dLpl), '/', brl(W.dTk), '=> soma', brl(W.dLei + W.dLpl + W.dTk))
console.log('pesos    ', 'lei', LG.lei.toFixed(1) + '%', 'lpl', LG.lpl.toFixed(1) + '%', 'tk', LG.tk.toFixed(1) + '%')
