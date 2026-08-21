/**
 * BULA — RESULTADO 2026 E PROGNÓSTICO. O documento que vai ao chefe.
 *
 *   node scripts/render-bula-resultado-2026.mjs
 *
 * Regras deste documento:
 *  · Autossuficiente. Quem lê nunca viu outra versão e não encontra referência
 *    a nenhuma. As comparações que ficam são econômicas (folha antiga × nova,
 *    2026 × 2025), porque são o assunto.
 *  · Diz de quanto não sabe. Receita estimada, estrutura sem destinatário e
 *    mês parcial aparecem marcados, não diluídos.
 *  · Nenhum número escrito à mão — tudo vem de
 *    outputs/resultado-comercial-2026-08-21/dados.json.
 *
 * Estrutura: (1) o ano até aqui, (2) o que custa a estrutura, (3) o que ainda
 * se tem a receber e a pagar, (4) o prognóstico mês a mês.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import xlsx from 'xlsx'
import { chromium } from 'playwright'

const OUT = 'outputs/resultado-comercial-2026-08-21'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))
const desktop = path.join(os.homedir(), 'Desktop')
const BASE = 'Bula - Resultado 2026 e Prognostico'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const n0 = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pc = (n, d = 1) => (Number(n) * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const rs = (n) => (n < 0 ? '−R$ ' + n0(Math.abs(n)) : 'R$ ' + n0(n))
const dmy = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/')
const kk = (n) => {
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  if (a >= 1e6) return s + (a / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
  if (a >= 1000) return s + (a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k'
  return s + n0(a)
}

const TINTA = '#111', LINHA = '#E4E4E4', CINZA = '#6B6B6B', OURO = '#B08D3F', FRACO = '#BDBDBD', VERM = '#8A2020'
const C = D.cascata, K = D.custo, G = D.prognostico, S = D.socio, T = D.trimestre
const CEN = ['Base', 'Conservador', 'Como foi julho']
const cenT = (x) => G.cenarios.find((c) => c.nome === x).T
const dez = G.meses.find((m) => m.mes === 12)
const set = G.meses.find((m) => m.mes === 9)
const fim = (c) => G.meses[G.meses.length - 1].cenarios[c].acumuladoComSocio
const negativos = G.meses.filter((m) => m.cenarios['Base'].resultadoComSocio < 0).map((m) => m.nome)
const f2 = D.comissao.porFaixa.find((f) => f.faixa === '2% (assessor)')
const f5 = D.comissao.porFaixa.find((f) => f.faixa === '5% (parceiro)')
const top = D.comissao.porAssessor[0]
const socioBase = S.projetado.porCenario.find((c) => c.nome === 'Base')
const e = (a) => (a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1])

/* ═══════════ XLSX ═══════════ */

const M = (v) => ({ v: Number(v), t: 'n', z: '#,##0.00' })
const P = (v) => ({ v: Number(v), t: 'n', z: '0.0%' })
const I = (v) => ({ v: Number(v), t: 'n', z: '#,##0' })
const wb = xlsx.utils.book_new()
const aba = (nome, linhas, larg) => {
  const ws = xlsx.utils.aoa_to_sheet(linhas)
  ws['!cols'] = larg.map((w) => ({ wch: w }))
  xlsx.utils.book_append_sheet(wb, ws, nome)
}

aba('RESUMO', [
  ['BULA ASSESSORIA — RESULTADO 2026 E PROGNÓSTICO'],
  [`Janeiro a agosto de 2026 · agosto parcial · posição de ${dmy(D.meta.geradoEm)}`],
  [],
  ['O ANO ATÉ AQUI'],
  ['Leilões', I(D.ano.leiloes)],
  ['Lotes vendidos', I(D.ano.lotes)],
  ['Cobertura vendida', M(D.ano.vgv)],
  ['Receita apurada com a leiloeira', M(D.ano.receitaApurada)],
  [`Receita estimada (${D.apuracao.semAcordo} leilões sem acordo fechado)`, M(D.ano.receitaEstimada)],
  ['RECEITA', M(C.receita)],
  ['Take-rate (receita ÷ cobertura)', P(D.modelo.takeRate)],
  [],
  ['DA RECEITA AO RESULTADO'],
  ['Receita', M(C.receita), P(1)],
  ['(−) Imposto 18%', M(-C.imposto), P(-C.imposto / C.receita)],
  ['(−) Comissão de assessores', M(-C.comissao), P(-C.comissao / C.receita)],
  ['(−) Despesa operacional de leilão', M(-C.despesaLeilao), P(-C.despesaLeilao / C.receita)],
  ['= MARGEM DE CONTRIBUIÇÃO', M(C.margemContribuicao), P(C.margemPct)],
  [`(−) Custo fixo de ${C.meses} meses`, M(-C.custoFixoPeriodo), P(-C.custoFixoPeriodo / C.receita)],
  ['= RESULTADO OPERACIONAL', M(C.resultado), P(C.resultado / C.receita)],
  [],
  ['O CUSTO FIXO MENSAL'],
  ['Folha', M(K.folhaNova)],
  [`Estrutura (média de ${K.estruturaJanela}, sem escritório)`, M(K.estruturaMes)],
  ['CUSTO FIXO MENSAL', M(K.fixoDepois)],
  ['   dos quais sem destinatário identificado no extrato', M(K.estruturaNaoIdentificado)],
  [],
  ['PARA O MÊS SE PAGAR'],
  ['Receita da Bula por mês', M(G.receitaEquilibrioMes)],
  ['Cobertura vendida por mês', M(G.vgvEquilibrioMes)],
  [],
  ['A RECEBER HOJE'],
  ['Vencido', M(D.receber.vencido)],
  ['A vencer', M(D.receber.aVencer)],
  ['TOTAL', M(D.receber.total)],
  ['Do total, com data confirmada pela leiloeira', M(D.receber.comDataAcordada)],
], [52, 18, 12])

aba('MES A MES', [
  ['Mês', 'Leilões', 'Lotes', 'Cobertura vendida', 'Receita apurada', 'Receita estimada', 'Receita', 'Take-rate', 'Imposto 18%', 'Comissão', 'Custo fixo', 'Lucro'],
  ...D.mensal.map((m) => [m.nome, I(m.leiloes), I(m.lotes), M(m.vgv), M(m.receitaApurada), M(m.receitaEstimada), M(m.receita), P(m.take), M(m.imposto), M(m.comissao), M(-m.custoFixo), M(m.lucro)]),
  ['TOTAL', I(D.ano.leiloes), I(D.ano.lotes), M(D.ano.vgv), M(D.ano.receitaApurada), M(D.ano.receitaEstimada), M(C.receita), P(D.modelo.takeRate), M(C.imposto), M(C.comissao), M(-C.custoFixoPeriodo), M(C.resultado)],
], [12, 9, 8, 19, 17, 17, 15, 11, 14, 15, 15, 15])

aba('PROGNOSTICO', [
  ['SETEMBRO A DEZEMBRO'],
  ['Mês', 'Cobertura 2025', 'Precisa repetir', 'Cobertura projetada', 'Receita', 'Margem', 'Custo fixo', 'Operação', 'Sócio', 'Resultado', 'Acumulado'],
  ...G.meses.map((m) => {
    const b = m.cenarios['Base']
    return [m.nome, M(m.v25), P(m.fatorEquilibrio), M(b.vgv), M(b.receita), M(b.margem), M(-K.fixoDepois), M(b.resultado), M(-b.socio), M(b.resultadoComSocio), M(b.acumuladoComSocio)]
  }),
  [],
  ['RESULTADO FINAL EM CADA CENÁRIO'],
  ['Mês', ...G.cenarios.map((c) => `${c.nome} — ${pc(c.T, 1)} de 2025`)],
  ...G.meses.map((m) => [m.nome, ...G.cenarios.map((c) => M(m.cenarios[c.nome].resultadoComSocio))]),
  ['ACUMULADO', ...G.cenarios.map((c) => M(fim(c.nome)))],
  [],
  ['RITMO DE 2026 (VGV 2026 ÷ VGV 2025 da mesma janela; janelas fecham em julho)'],
  ['Janeiro a julho', P(T.fatores.janJul)],
  ['Maio a julho', P(T.fatores.maiJul)],
  ['Junho a julho', P(T.fatores.junJul)],
  ['Só julho', P(T.fatores.julho)],
], [12, 18, 16, 21, 15, 15, 14, 15, 14, 15, 15])

aba('COMPROMISSOS', [
  ['PARTICIPAÇÃO DO SÓCIO'],
  [S.contrato],
  ['Trimestre do contrato', 'Lucro', `${pc(S.pct, 0)} do sócio`, 'Vence', 'Situação'],
  [S.realizado.trimestre, M(S.realizado.lucro), M(S.realizado.valor), dmy(S.realizado.vencimento), 'apurado'],
  ...S.realizado.meses.map((m) => [`   ${m.nome}`, M(m.lucro), '', '', '']),
  ...S.projetado.porCenario.map((c, i) => [i === 0 ? S.projetado.trimestre : '', M(c.lucro), M(c.valor), i === 0 ? dmy(S.projetado.vencimento) : '', `cenário ${c.nome}`]),
  [],
  ['COMISSÕES DA NANE — acumuladas no ano, pagas de uma vez'],
  ['Total', M(D.nane.total), `${D.nane.participacoes} participações`, dmy(D.nane.vencimento), ''],
  [],
  ['RECEBIMENTOS COM DATA CONFIRMADA PELA LEILOEIRA'],
  ['Guadalupe — 1ª parcela', M(10712.95), '', '25/08/2026', ''],
  ['Guadalupe — 2ª parcela', M(10712.95), '', '25/09/2026', '30 dias após a primeira'],
  ['Naviraí — os dois pregões', M(18374.25), '', '10/09/2026', '5% sobre a venda líquida de R$ 367.485,00'],
], [40, 16, 20, 14, 44])

aba('COMISSAO', [
  ['POR FAIXA DE PERCENTUAL'],
  ['Faixa', 'Participações', 'Cobertura vendida', 'Comissão', '% do total'],
  ...D.comissao.porFaixa.map((f) => [f.faixa, I(f.n), M(f.vgv), M(f.comissao), P(f.pctDoTotal)]),
  [],
  ['POR ASSESSOR'],
  ['Assessor', 'Participações', 'Cobertura vendida', 'Comissão', '% efetivo'],
  ...D.comissao.porAssessor.map((a) => [a.nome, I(a.leiloes), M(a.vgv), M(a.comissao), P(a.pctEfetivo)]),
  ['TOTAL', I(D.comissao.porAssessor.reduce((s, a) => s + a.leiloes, 0)), M(D.comissao.vgvCoberto), M(D.comissao.total), P(D.comissao.pctSobreVgv)],
], [30, 14, 19, 16, 12])

aba('A RECEBER', [
  ['Leiloeira', 'Títulos', 'Vencido', 'A vencer', 'Total'],
  ...D.receber.porLeiloeira.map((l) => [l.leiloeira, I(l.n), M(l.vencido), M(l.aVencer), M(l.total)]),
  ['TOTAL', I(D.receber.titulos), M(D.receber.vencido), M(D.receber.aVencer), M(D.receber.total)],
], [40, 9, 16, 16, 16])

aba('EQUIPE', [
  ['FOLHA A PARTIR DE AGOSTO/2026'],
  ['Colaborador', 'Função', 'Salário fixo'],
  ...K.equipe.map((x) => [x.nome, x.funcao || '', M(x.salario)]),
  ['TOTAL', '', M(K.folhaNova)],
], [30, 28, 16])

const xlsxPath = path.join(desktop, `${BASE}.xlsx`)
xlsx.writeFile(wb, xlsxPath)
console.log('XLSX:', xlsxPath)

/* ═══════════ Gráficos ═══════════ */

/* Cascata: da receita ao resultado */
function gCascata() {
  const W = 780, H = 200, T0 = 28, B = 50
  const passos = [
    { r: 'Receita', v: C.receita, t: 'tot' },
    { r: 'Imposto 18%', v: -C.imposto, t: 'sai' },
    { r: 'Comissão', v: -C.comissao, t: 'sai' },
    { r: 'Despesa de leilão', v: -C.despesaLeilao, t: 'sai' },
    { r: 'Margem de contribuição', v: C.margemContribuicao, t: 'sub' },
    { r: `Custo fixo ${C.meses} meses`, v: -C.custoFixoPeriodo, t: 'sai' },
    { r: 'Resultado operacional', v: C.resultado, t: 'tot' },
  ]
  const max = C.receita * 1.06
  const bw = W / passos.length - 16
  const y = (v) => T0 + (H - T0 - B) * (1 - v / max)
  let ac = 0, out = ''
  passos.forEach((p, i) => {
    const x = i * (W / passos.length) + 8
    let alto, baixo
    if (p.t === 'sai') { baixo = ac; ac += p.v; alto = ac } else { alto = p.v; baixo = 0; ac = p.v }
    const yA = y(Math.max(alto, baixo)), yB = y(Math.min(alto, baixo))
    const cor = p.t === 'tot' ? TINTA : p.t === 'sub' ? OURO : '#CDCDCD'
    out += `<rect x="${x.toFixed(1)}" y="${yA.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(yB - yA, 1.5).toFixed(1)}" fill="${cor}"/>`
    out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(yA - 6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${TINTA}">${kk(Math.abs(p.v))}</text>`
    if (i < passos.length - 1 && p.t !== 'sub') {
      out += `<line x1="${(x + bw).toFixed(1)}" y1="${y(ac).toFixed(1)}" x2="${(x + W / passos.length).toFixed(1)}" y2="${y(ac).toFixed(1)}" stroke="${FRACO}" stroke-width="0.8" stroke-dasharray="2 2"/>`
    }
    const pal = p.r.split(' ')
    const ls = pal.length > 2 ? [pal.slice(0, 2).join(' '), pal.slice(2).join(' ')] : [p.r]
    ls.forEach((l, k) => {
      out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(H - B + 16 + k * 11).toFixed(1)}" text-anchor="middle" font-size="8.7" fill="${CINZA}">${esc(l)}</text>`
    })
  })
  out += `<line x1="0" y1="${y(0).toFixed(1)}" x2="${W}" y2="${y(0).toFixed(1)}" stroke="${TINTA}" stroke-width="1.1"/>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Da receita ao resultado operacional no ano">${out}</svg>`
}

/* Prognóstico: cobertura projetada × a que faz o mês se pagar */
function gPrognostico() {
  const W = 780, H = 266, T0 = 26, B = 70, L = 54
  const cores = { Base: TINTA, Conservador: '#818181', 'Como foi julho': VERM }
  const max = Math.max(...G.meses.flatMap((m) => CEN.map((c) => m.cenarios[c].vgv)), G.vgvEquilibrioMes) * 1.17
  const y = (v) => T0 + (H - T0 - B) * (1 - v / max)
  const gw = (W - L) / G.meses.length, bw = gw * 0.19
  let out = ''
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4, yy = y(v)
    out += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W}" y2="${yy.toFixed(1)}" stroke="${LINHA}" stroke-width="1"/>`
    out += `<text x="${L - 7}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="8.4" fill="${CINZA}">${kk(v)}</text>`
  }
  const y0 = y(0)
  G.meses.forEach((m, i) => {
    const cx = L + i * gw + gw / 2
    CEN.forEach((nome, k) => {
      const v = m.cenarios[nome].vgv
      const xo = (k - 1) * (bw + 5) - bw / 2
      const abaixo = v < G.vgvEquilibrioMes
      out += `<rect x="${(cx + xo).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y0 - y(v)).toFixed(1)}" fill="${cores[nome]}"${abaixo ? ' opacity="0.5"' : ''}/>`
      out += `<text x="${(cx + xo + bw / 2).toFixed(1)}" y="${(y(v) - 4).toFixed(1)}" text-anchor="middle" font-size="8.1" font-weight="600" fill="${abaixo ? VERM : TINTA}">${kk(v)}</text>`
    })
    out += `<text x="${cx.toFixed(1)}" y="${(H - B + 17).toFixed(1)}" text-anchor="middle" font-size="9.8" font-weight="700" fill="${TINTA}">${esc(m.nome)}</text>`
    out += `<text x="${cx.toFixed(1)}" y="${(H - B + 29).toFixed(1)}" text-anchor="middle" font-size="8.4" fill="${CINZA}">precisa de ${pc(m.fatorEquilibrio, 0)} do que fez em 2025</text>`
    const soc = m.cenarios['Base'].socio
    if (soc > 0) out += `<text x="${cx.toFixed(1)}" y="${(H - B + 42).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${VERM}">e ainda paga ${kk(soc)} ao sócio</text>`
  })
  const ye = y(G.vgvEquilibrioMes)
  out += `<line x1="${L}" y1="${ye.toFixed(1)}" x2="${W}" y2="${ye.toFixed(1)}" stroke="${OURO}" stroke-width="2" stroke-dasharray="5 3"/>`
  out += `<line x1="${L}" y1="${y0.toFixed(1)}" x2="${W}" y2="${y0.toFixed(1)}" stroke="${TINTA}" stroke-width="1.1"/>`
  out += `<g transform="translate(${L},${H - 6})">${CEN.map((x, k) =>
    `<rect x="${k * 168}" y="-8" width="11" height="8" fill="${cores[x]}"/><text x="${k * 168 + 16}" y="-1" font-size="8.4" fill="${CINZA}">${esc(x)} · ${pc(cenT(x), 0)} de 2025</text>`).join('')}
    <line x1="508" y1="-4" x2="526" y2="-4" stroke="${OURO}" stroke-width="2" stroke-dasharray="4 3"/>
    <text x="532" y="-1" font-size="8.4" font-weight="700" fill="${OURO}">acima desta linha o mês se paga</text></g>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Cobertura projetada de cada mês contra a necessária para se pagar">${out}</svg>`
}

/* Ritmo de 2026 sobre 2025 */
function gRitmo() {
  const W = 780, H = 116, L = 6, R = 6, T0 = 28, BH = 26
  const x = (v) => L + (W - L - R) * v
  const pontos = [
    { r: 'Só julho', v: T.fatores.julho }, { r: 'Jun–jul', v: T.fatores.junJul },
    { r: 'Mai–jul', v: T.fatores.maiJul }, { r: 'Jan–jul', v: T.fatores.janJul },
  ]
  const media = G.meses.reduce((s, m) => s + m.fatorEquilibrio, 0) / G.meses.length
  let out = `<rect x="${L}" y="${T0}" width="${W - L - R}" height="${BH}" fill="#F4F4F4"/>`
  out += `<rect x="${L}" y="${T0}" width="${(x(media) - L).toFixed(1)}" height="${BH}" fill="#DCDCDC"/>`
  for (let i = 0; i <= 10; i += 2) out += `<text x="${x(i / 10).toFixed(1)}" y="${T0 + BH + 14}" text-anchor="middle" font-size="8.4" fill="${CINZA}">${i * 10}%</text>`
  out += `<line x1="${x(media).toFixed(1)}" y1="${T0 - 12}" x2="${x(media).toFixed(1)}" y2="${T0 + BH + 3}" stroke="${TINTA}" stroke-width="2"/>`
  out += `<text x="${(x(media) + 5).toFixed(1)}" y="${T0 - 4}" font-size="9" font-weight="700" fill="${TINTA}">média que os quatro meses exigem: ${pc(media, 1)}</text>`
  pontos.forEach((p, i) => {
    const cor = p.v < media ? OURO : TINTA
    out += `<circle cx="${x(p.v).toFixed(1)}" cy="${T0 + BH / 2}" r="4.4" fill="${cor}" stroke="#fff" stroke-width="1.3"/>`
    const yy = T0 + BH + 30 + (i % 2) * 14
    out += `<line x1="${x(p.v).toFixed(1)}" y1="${T0 + BH / 2 + 5}" x2="${x(p.v).toFixed(1)}" y2="${yy - 9}" stroke="${FRACO}" stroke-width="0.7" stroke-dasharray="2 2"/>`
    out += `<text x="${x(p.v).toFixed(1)}" y="${yy}" text-anchor="middle" font-size="8.8" font-weight="600" fill="${cor}">${esc(p.r)} · ${pc(p.v, 0)}</text>`
  })
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Ritmo de 2026 comparado a 2025">${out}</svg>`
}

/* ═══════════ HTML ═══════════ */

const hoje = dmy(D.meta.geradoEm)

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(BASE)}</title>
<style>
  @page { size:A4; margin:13mm 12mm 12mm 12mm; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:"Segoe UI",Arial,sans-serif; color:${TINTA}; font-size:10.5px; line-height:1.45; }
  h1 { font-size:21px; margin:0 0 3px; letter-spacing:-0.4px; font-weight:800; text-transform:uppercase; }
  h2 { font-size:12.5px; margin:18px 0 8px; text-transform:uppercase; letter-spacing:1.1px; font-weight:700;
       border-bottom:1.6px solid ${TINTA}; padding-bottom:4px; }
  .sub { color:${CINZA}; font-size:10px; margin-bottom:13px; }
  .destaque { border-left:3px solid ${OURO}; padding:9px 13px; margin:11px 0 5px; background:#FBFAF7; font-size:11px; line-height:1.55; }
  .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:9px; margin:12px 0 3px; }
  .kpi { border:1px solid ${LINHA}; border-top:2.5px solid ${TINTA}; padding:8px 10px; }
  .kpi.ouro { border-top-color:${OURO}; }
  .kpi.risco { border-top-color:${VERM}; }
  .kpi .r { font-size:8.3px; text-transform:uppercase; letter-spacing:0.7px; color:${CINZA}; }
  .kpi .v { font-size:17.5px; font-weight:800; margin-top:2px; letter-spacing:-0.4px; }
  .kpi .d { font-size:8.6px; color:${CINZA}; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:9.6px; }
  th { text-align:left; font-size:8.3px; text-transform:uppercase; letter-spacing:0.6px; color:${CINZA};
       border-bottom:1px solid ${TINTA}; padding:4px 5px; font-weight:700; }
  td { padding:3.7px 5px; border-bottom:1px solid ${LINHA}; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; }
  tr.tot td { font-weight:800; border-top:1.6px solid ${TINTA}; border-bottom:none; }
  td.neg { color:${VERM}; font-weight:700; }
  .nota { font-size:8.8px; color:${CINZA}; margin-top:7px; line-height:1.5; }
  .duas { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .quebra { page-break-before:always; }
  .rod { margin-top:15px; padding-top:7px; border-top:1px solid ${LINHA}; font-size:8.2px; color:${CINZA}; }
</style></head><body>

<h1>Resultado 2026 e prognóstico</h1>
<div class="sub">Bula Assessoria · janeiro a agosto de 2026, com agosto ainda em curso · ${hoje}</div>

<div class="kpis">
  <div class="kpi"><div class="r">Cobertura vendida</div><div class="v">R$ ${kk(D.ano.vgv)}</div>
    <div class="d">${D.ano.leiloes} leilões · ${n0(D.ano.lotes)} lotes</div></div>
  <div class="kpi"><div class="r">Receita da Bula</div><div class="v">R$ ${kk(C.receita)}</div>
    <div class="d">${pc(D.modelo.takeRate, 2)} do que foi vendido</div></div>
  <div class="kpi ouro"><div class="r">Margem de contribuição</div><div class="v">${pc(C.margemPct)}</div>
    <div class="d">R$ ${kk(C.margemContribuicao)} em ${C.meses} meses</div></div>
  <div class="kpi"><div class="r">Resultado operacional</div><div class="v">${rs(C.resultado)}</div>
    <div class="d">R$ ${n0(C.resultado / C.meses)} por mês</div></div>
</div>

<h2>Da receita ao resultado</h2>
<div>${gCascata()}</div>
<div class="destaque">De cada <b>R$ 100</b> que a Bula fatura de comissão das leiloeiras, <b>R$ ${n0(100 * C.imposto / C.receita)}</b> vão de imposto,
<b>R$ ${n0(100 * C.comissao / C.receita)}</b> de comissão dos assessores e <b>R$ ${n0(100 * C.despesaLeilao / C.receita)}</b> de despesa de leilão.
Sobram <b>R$ ${n0(100 * C.margemPct)}</b> — e é dessa margem que sai o custo fixo de toda a estrutura.</div>

<table>
  <thead><tr><th>Mês</th><th class="n">Leilões</th><th class="n">Lotes</th><th class="n">Cobertura vendida</th>
  <th class="n">Receita</th><th class="n">Take</th><th class="n">Imposto</th><th class="n">Comissão</th>
  <th class="n">Custo fixo</th><th class="n">Lucro</th></tr></thead>
  <tbody>${D.mensal.map((m) => `<tr><td>${esc(m.nome)}</td><td class="n">${m.leiloes}</td><td class="n">${n0(m.lotes)}</td>
    <td class="n">${n0(m.vgv)}</td><td class="n">${n0(m.receita)}</td><td class="n">${m.vgv > 0 ? pc(m.take, 2) : '—'}</td>
    <td class="n">${n0(m.imposto)}</td><td class="n">${n0(m.comissao)}</td><td class="n">−${n0(m.custoFixo)}</td>
    <td class="n ${m.lucro < 0 ? 'neg' : ''}">${rs(m.lucro)}</td></tr>`).join('')}
  <tr class="tot"><td>Total</td><td class="n">${D.ano.leiloes}</td><td class="n">${n0(D.ano.lotes)}</td>
    <td class="n">${n0(D.ano.vgv)}</td><td class="n">${n0(C.receita)}</td><td class="n">${pc(D.modelo.takeRate, 2)}</td>
    <td class="n">${n0(C.imposto)}</td><td class="n">${n0(C.comissao)}</td><td class="n">−${n0(C.custoFixoPeriodo)}</td>
    <td class="n">${rs(C.resultado)}</td></tr></tbody>
</table>
<div class="nota">Agosto ainda não fechou. <b>${D.apuracao.semAcordo} dos ${D.apuracao.leiloes} leilões do ano não têm a receita fechada com a leiloeira</b> —
R$ ${n0(D.apuracao.vgvPendente)} de cobertura, quase tudo da Expogenética: a receita deles entra estimada em R$ ${n0(D.ano.receitaEstimada)},
pelo take-rate de ${pc(D.modelo.takeRate, 2)} medido nos ${D.apuracao.comAcordo} já fechados. O volume vendido e a comissão são fato nos ${D.apuracao.leiloes}:
a comissão nasce do lance, não do acordo.</div>

<div class="quebra"></div>

<h2>O que a estrutura custa por mês</h2>
<div class="duas">
  <div>
    <table>
      <thead><tr><th>Colaborador</th><th>Função</th><th class="n">Salário</th></tr></thead>
      <tbody>${K.equipe.map((x) => `<tr><td>${esc(x.nome)}</td><td>${esc(x.funcao || '')}</td><td class="n">${n0(x.salario)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="2">Folha</td><td class="n">${n0(K.folhaNova)}</td></tr>
      <tr><td colspan="2">Estrutura</td><td class="n">${n0(K.estruturaMes)}</td></tr>
      <tr class="tot"><td colspan="2">Custo fixo mensal</td><td class="n">${n0(K.fixoDepois)}</td></tr></tbody>
    </table>
  </div>
  <div>
    <div class="destaque" style="margin-top:0">Com a margem de <b>${pc(C.margemPct)}</b>, esse custo fixo exige
    <b>R$ ${n0(G.receitaEquilibrioMes)} de receita por mês</b> — ou <b>R$ ${n0(G.vgvEquilibrioMes)} de cobertura vendida</b> — só para o mês se pagar.
    A folha saiu de R$ ${n0(K.folhaAntes)} para R$ ${n0(K.folhaNova)}, e a exigência mensal de cobertura subiu de
    R$ ${n0(G.vgvEquilibrioMesAntes)} para R$ ${n0(G.vgvEquilibrioMes)}.</div>
    <div class="nota"><b>A estrutura é medida de ${esc(K.estruturaJanela)}, sem escritório.</b> Com o fim do contrato saíram o aluguel,
    a internet, a manutenção de R$ 2.873/mês, o seguro Tokio Marine, a faxina e o material de escritório — nenhum deles aparece em julho ou agosto.
    Medir pela média do primeiro semestre carregaria para a frente um custo que não existe mais.
    <br><br>Fora do custo fixo por natureza: a <b>despesa de leilão</b> (R$ ${n0(K.leilaoMes)}/mês, medida de abril a agosto porque varia com o evento)
    já está descontada na margem; e o <b>cartão</b> (R$ ${n0(K.cartaoMes)}/mês), que é gasto do Bulinha e abate a dívida com ele.
    <br><br><b>R$ ${n0(K.estruturaNaoIdentificado)}/mês</b> da estrutura — ${pc(K.estruturaNaoIdentificado / K.estruturaMes, 0)} dela — são lançamentos em que
    o extrato registra só a forma de pagamento, sem o destinatário. Classificá-los é o que falta para esta linha ficar firme.</div>
  </div>
</div>

<h2>Compromissos além da operação</h2>
<div class="destaque"><b>A participação do sócio.</b> Pelo contrato de 17/07/2026, o Marcelo é remunerado com <b>${pc(S.pct, 0)} do lucro, pagos trimestralmente</b>,
contando de ${esc(S.inicio)}. O trimestre ${esc(S.realizado.trimestre)} fechou com <b>R$ ${n0(S.realizado.lucro)}</b> de lucro —
<b>R$ ${n0(S.realizado.valor)} a pagar em ${dmy(S.realizado.vencimento)}</b>. O trimestre seguinte vence em ${dmy(S.projetado.vencimento)}
e vale R$ ${n0(socioBase.valor)} no cenário Base. Sai depois do lucro e desaparece quando não há lucro: não altera o ponto de equilíbrio, mas consome o que passa dele.
<br><br><b>As comissões da Nane.</b> Acumulam o ano e são pagas de uma vez em ${dmy(D.nane.vencimento)} — <b>R$ ${n0(D.nane.total)}</b>
em ${D.nane.participacoes} participações, caindo no mês mais apertado do calendário.</div>

<div class="duas">
  <div>
    <table>
      <thead><tr><th>Trimestre do contrato</th><th class="n">Lucro</th><th class="n">${pc(S.pct, 0)} do sócio</th><th class="n">Vence</th></tr></thead>
      <tbody>
        <tr><td><b>${esc(S.realizado.trimestre)}</b> <span style="color:${CINZA}">apurado</span></td>
          <td class="n">${rs(S.realizado.lucro)}</td><td class="n"><b>${n0(S.realizado.valor)}</b></td><td class="n">${dmy(S.realizado.vencimento)}</td></tr>
        ${S.projetado.porCenario.map((c, i) => `<tr><td>${i === 0 ? `<b>${esc(S.projetado.trimestre)}</b> ` : ''}<span style="color:${CINZA}">${esc(c.nome)}</span></td>
          <td class="n ${c.lucro < 0 ? 'neg' : ''}">${rs(c.lucro)}</td><td class="n ${c.valor === 0 ? 'neg' : ''}">${n0(c.valor)}</td>
          <td class="n">${i === 0 ? dmy(S.projetado.vencimento) : ''}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div>
    <table>
      <thead><tr><th>A receber</th><th class="n">Vencido</th><th class="n">A vencer</th><th class="n">Total</th></tr></thead>
      <tbody>${D.receber.porLeiloeira.slice(0, 6).map((l) => `<tr><td>${esc(l.leiloeira)}</td><td class="n">${n0(l.vencido)}</td>
        <td class="n">${n0(l.aVencer)}</td><td class="n">${n0(l.total)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="n">${n0(D.receber.vencido)}</td><td class="n">${n0(D.receber.aVencer)}</td>
        <td class="n">${n0(D.receber.total)}</td></tr></tbody>
    </table>
    <div class="nota"><b>R$ ${n0(D.receber.vencido)} já venceram e não entraram</b> — ${pc(D.receber.vencido / D.receber.total, 0)} da carteira.
    É caixa já ganho, que não depende de nenhum leilão futuro. Com data confirmada pela leiloeira: Guadalupe em duas parcelas de
    R$ 10.713 (25/08 e 25/09) e Naviraí R$ 18.374 em 10/09.</div>
  </div>
</div>

<div class="quebra"></div>

<h2>Prognóstico — o que cada mês precisa vender</h2>
<div>${gPrognostico()}</div>
<div class="nota">A barra é a cobertura que cada mês tende a vender: o mesmo mês de 2025 corrigido pelo ritmo que 2026 vem mostrando.
A linha dourada é a cobertura que faz o mês se pagar — igual em todos, porque o custo fixo não muda de mês para mês.
<b>${esc(dez.nome)} é o mês mais exigente do calendário: precisa de ${pc(dez.fatorEquilibrio, 1)} do que fez em 2025, contra ${pc(G.meses[1].fatorEquilibrio, 1)} de outubro.</b>
Não é que ele piore — é o menor mês do ano (R$ ${kk(dez.v25)} em 2025 contra R$ ${kk(G.meses[1].v25)} de outubro) carregando o mesmo custo fixo.</div>

<table>
  <thead><tr><th>Mês</th><th class="n">Precisa repetir de 2025</th><th class="n">Operação</th><th class="n">(−) Sócio</th>
  <th class="n">Base</th><th class="n">Conservador</th><th class="n">No ritmo de julho</th><th class="n">Acumulado</th></tr></thead>
  <tbody>${G.meses.map((m) => {
    const b = m.cenarios['Base'], c = m.cenarios['Conservador'], j = m.cenarios['Como foi julho']
    return `<tr><td><b>${esc(m.nome)}</b></td><td class="n"><b>${pc(m.fatorEquilibrio, 1)}</b></td>
      <td class="n ${b.resultado < 0 ? 'neg' : ''}">${rs(b.resultado)}</td>
      <td class="n ${b.socio > 0 ? 'neg' : ''}">${b.socio > 0 ? '−' + n0(b.socio) : '—'}</td>
      <td class="n ${b.resultadoComSocio < 0 ? 'neg' : ''}"><b>${rs(b.resultadoComSocio)}</b></td>
      <td class="n ${c.resultadoComSocio < 0 ? 'neg' : ''}">${rs(c.resultadoComSocio)}</td>
      <td class="n ${j.resultadoComSocio < 0 ? 'neg' : ''}">${rs(j.resultadoComSocio)}</td>
      <td class="n">${rs(b.acumuladoComSocio)}</td></tr>`
  }).join('')}
  <tr class="tot"><td>Somado</td><td class="n">${pc(T.equilibrio.depois, 1)}</td>
    <td class="n">${rs(G.meses.reduce((s, m) => s + m.cenarios['Base'].resultado, 0))}</td>
    <td class="n neg">−${n0(G.meses.reduce((s, m) => s + m.cenarios['Base'].socio, 0))}</td>
    <td class="n"><b>${rs(fim('Base'))}</b></td><td class="n">${rs(fim('Conservador'))}</td>
    <td class="n neg">${rs(fim('Como foi julho'))}</td><td class="n">${rs(fim('Base'))}</td></tr></tbody>
</table>
<div class="nota">"Precisa repetir" = quanto do mesmo mês de 2025 aquele mês tem de entregar para cobrir o custo fixo, só a operação.
Receita = cobertura × take-rate de ${pc(D.modelo.takeRate, 2)}; margem = ${pc(C.margemPct)}, a realizada do ano.
A coluna do sócio traz a participação do trimestre anterior, que vence naquele mês.
<b>${negativos.length ? `No cenário Base, ${e(negativos.map((x) => x.toLowerCase()))} fecha${negativos.length > 1 ? 'm' : ''} no vermelho` : 'Nenhum mês fecha no vermelho no cenário Base'}</b> —
${esc(set.nome.toLowerCase())} porque paga o trimestre que já fechou, ${esc(dez.nome.toLowerCase())} porque é o menor mês do ano e ainda paga o trimestre seguinte.
A comissão da Nane sai em ${esc(dez.nome.toLowerCase())} mas já foi reconhecida na competência de cada leilão, então não aparece aqui: no caixa, piora ${esc(dez.nome.toLowerCase())} em mais R$ ${n0(D.nane.total)}.</div>

<h2>Onde 2026 vem rodando</h2>
<div>${gRitmo()}</div>
<div class="nota">Cada ponto é o VGV de 2026 dividido pelo VGV de 2025 na mesma janela de meses. As janelas param em julho de propósito:
agosto ainda está correndo e agosto de 2025 foi o pico do ano — comparar os dois exageraria a queda.
Acima da linha a estrutura cabe; <b>julho isolado (${pc(T.fatores.julho, 0)}) não cabia</b>.</div>

<div class="quebra"></div>

<h2>Três alavancas antes de mexer na estrutura</h2>
<div class="duas">
  <div>
    <table>
      <thead><tr><th>1 · A comissão não está no 5%</th><th class="n">Comissão</th><th class="n">% do total</th></tr></thead>
      <tbody>${D.comissao.porFaixa.map((f) => `<tr><td>${esc(f.faixa)}</td><td class="n">${n0(f.comissao)}</td>
        <td class="n">${pc(f.pctDoTotal, 1)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="n">${n0(D.comissao.total)}</td><td class="n">${pc(D.comissao.pctSobreVgv, 2)} da venda</td></tr></tbody>
    </table>
    <div class="nota">${pc(f2.pctDoTotal, 1)} da comissão é a faixa de 2% dos assessores; o parceiro a 5% pesa ${pc(f5.pctDoTotal, 1)} —
    R$ ${n0(f5.comissao)} no ano. ${esc(top.nome)} sozinho responde por R$ ${n0(top.comissao)}, ${pc(top.comissao / D.comissao.total, 1)} do total,
    a ${pc(top.pctEfetivo, 2)} efetivo sobre o que vendeu. Mexer no percentual não muda o prognóstico: o peso vem do volume.</div>
  </div>
  <div>
    <table>
      <thead><tr><th>2 · Cobrança e apuração</th><th class="n">Valor</th></tr></thead>
      <tbody>
        <tr><td>Vencido e não recebido</td><td class="n">${n0(D.receber.vencido)}</td></tr>
        <tr><td>A vencer</td><td class="n">${n0(D.receber.aVencer)}</td></tr>
        <tr><td>Cobertura vendida sem acordo fechado</td><td class="n">${n0(D.apuracao.vgvPendente)}</td></tr>
        <tr class="tot"><td>Receita que isso representa, estimada</td><td class="n">${n0(D.ano.receitaEstimada)}</td></tr>
      </tbody>
    </table>
    <div class="nota"><b>Cobrar o vencido</b> não depende de leilão nenhum: é caixa já ganho.
    <b>Fechar os acordos pendentes</b> é reconhecer receita que já existe — e é a diferença entre ${esc(dez.nome.toLowerCase())} fechar no vermelho ou no azul.
    <br><br><b>3 · Classificar a estrutura.</b> R$ ${n0(K.estruturaNaoIdentificado)}/mês saem do banco sem destinatário registrado.
    Enquanto isso não for resolvido, o custo fixo tem essa margem de dúvida — para mais ou para menos.</div>
  </div>
</div>

<div class="rod">Fontes: fechamento de leilões, contas a receber, contas a pagar, extrato conciliado e cadastro de folha do ERP Bula;
histórico mensal de 2025 do consolidado da operação. Imposto pelo critério de 18% sobre a receita.
Custo fixo = folha do cadastro + estrutura realizada no banco de ${esc(K.estruturaJanela)}. Emitido em ${hoje}.</div>

</body></html>`

const htmlPath = path.join(OUT, 'relatorio-final.html')
fs.writeFileSync(htmlPath, html)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
const pdfPath = path.join(desktop, `${BASE}.pdf`)
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF: ', pdfPath)
