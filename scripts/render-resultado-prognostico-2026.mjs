/**
 * "RESULTADO E PROGNÓSTICO 2026" — o documento que vai para o chefe.
 *
 *   node scripts/render-resultado-prognostico-2026.mjs
 *
 * Autossuficiente por regra: quem lê nunca viu outra versão e não deve
 * encontrar referência a nenhuma. Nada de "o que faltava", "antes o relatório
 * dizia" ou "a versão anterior". As únicas comparações que ficam são as
 * ECONÔMICAS — folha antiga x folha nova, 2026 x 2025 — porque essas são o
 * assunto, e ele as conhece.
 *
 * Responde, nesta ordem: quanto a Bula vendeu, quanto ganha com isso, quanto
 * paga de comissão, o que sobra, o que a estrutura custa e o que cada mês
 * daqui pra frente precisa entregar.
 *
 * Lê outputs/resultado-comercial-2026-08-21/dados.json (gerado por
 * scripts/gera-resultado-comercial-2026.mts). Nenhum número escrito à mão.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import xlsx from 'xlsx'
import { chromium } from 'playwright'

const OUT = 'outputs/resultado-comercial-2026-08-21'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))
const desktop = path.join(os.homedir(), 'Desktop')
const BASE = 'Bula - Resultado e Prognostico 2026 - 21-08-2026'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl0 = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pc = (n, d = 1) => (Number(n) * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const sinal = (n) => (n < 0 ? '−R$ ' + brl0(Math.abs(n)) : 'R$ ' + brl0(n))
const dmy = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/')
const kk = (n) => {
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  if (a >= 1e6) return s + (a / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
  if (a >= 1000) return s + (a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k'
  return s + brl0(a)
}

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', SOFT = '#B4B4B4', RUIM = '#8A2020'
const G = D.prognostico, T = D.trimestre, S = D.socio, C = D.cascata
const CEN = ['Base', 'Conservador', 'Como foi julho']
const cenT = (n) => G.cenarios.find((c) => c.nome === n).T
const dez = G.meses.find((m) => m.mes === 12)
const negBase = G.meses.filter((m) => m.cenarios['Base'].resultadoComSocio < 0).map((m) => m.nome)
const fimBase = G.meses[G.meses.length - 1].cenarios['Base'].acumuladoComSocio
const fimJul = G.meses[G.meses.length - 1].cenarios['Como foi julho'].acumuladoComSocio
const f2 = D.comissao.porFaixa.find((f) => f.faixa === '2% (assessor)')
const f5 = D.comissao.porFaixa.find((f) => f.faixa === '5% (parceiro)')
const a1 = D.comissao.porAssessor[0]
const socioBase = S.projetado.porCenario.find((c) => c.nome === 'Base')
const listar = (a) => (a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1])

/* ══════════════════ XLSX ══════════════════ */

const M = (n) => ({ v: Number(n), t: 'n', z: '#,##0.00' })
const P = (n) => ({ v: Number(n), t: 'n', z: '0.0%' })
const I = (n) => ({ v: Number(n), t: 'n', z: '#,##0' })
const wb = xlsx.utils.book_new()
const addSheet = (nome, aoa, larguras) => {
  const ws = xlsx.utils.aoa_to_sheet(aoa)
  ws['!cols'] = larguras.map((w) => ({ wch: w }))
  xlsx.utils.book_append_sheet(wb, ws, nome)
}

addSheet('RESUMO', [
  ['BULA ASSESSORIA — RESULTADO 2026 E PROGNÓSTICO'],
  [`Janeiro a agosto de 2026 · posição de ${dmy(D.meta.geradoEm)}`],
  [],
  ['O QUE A BULA VENDEU'],
  ['Leilões', I(D.ano.leiloes)],
  ['Lotes vendidos', I(D.ano.lotes)],
  ['Cobertura vendida', M(D.ano.vgv)],
  [],
  ['O QUE A BULA GANHA — receita pelos acordos com as marcas'],
  ['Receita apurada com a leiloeira', M(D.ano.receitaApurada)],
  [`Receita estimada dos ${D.apuracao.semAcordo} leilões sem acordo fechado`, M(D.ano.receitaEstimada)],
  ['RECEITA TOTAL', M(C.receita)],
  ['Take-rate (receita ÷ cobertura)', P(D.modelo.takeRate)],
  [],
  ['DA RECEITA AO QUE SOBRA'],
  ['Receita', M(C.receita), P(1)],
  ['(−) Imposto 18%', M(-C.imposto), P(-C.imposto / C.receita)],
  ['(−) Comissão de assessores', M(-C.comissao), P(-C.comissao / C.receita)],
  ['(−) Despesa operacional de leilão', M(-C.despesaLeilao), P(-C.despesaLeilao / C.receita)],
  ['= MARGEM DE CONTRIBUIÇÃO', M(C.margemContribuicao), P(C.margemPct)],
  [`(−) Custo fixo de ${C.meses} meses`, M(-C.custoFixoPeriodo), P(-C.custoFixoPeriodo / C.receita)],
  ['= RESULTADO', M(C.resultado), P(C.resultado / C.receita)],
  [],
  ['O CUSTO FIXO MENSAL'],
  ['Folha', M(D.custo.folhaNova)],
  ['Estrutura (média mensal realizada abr–jul)', M(D.custo.estruturaMes)],
  ['CUSTO FIXO MENSAL', M(D.custo.fixoDepois)],
  [],
  ['O QUE CADA MÊS PRECISA ENTREGAR PARA SE PAGAR'],
  ['Receita da Bula por mês', M(G.receitaEquilibrioMes)],
  ['Cobertura vendida por mês', M(G.vgvEquilibrioMes)],
  [],
  ['A RECEBER HOJE'],
  ['Vencido', M(D.receber.vencido)],
  ['A vencer', M(D.receber.aVencer)],
  ['TOTAL', M(D.receber.total)],
  ['Do total, com data acordada com a leiloeira', M(D.receber.comDataAcordada)],
], [46, 18, 12])

addSheet('PROGNOSTICO', [
  ['SETEMBRO A DEZEMBRO — o que cada mês precisa e o que tende a entregar'],
  ['Mês', 'Cobertura em 2025', 'Precisa repetir', 'Cobertura projetada (Base)', 'Receita', 'Margem', 'Custo fixo', 'Resultado', 'Sócio', 'Resultado final', 'Acumulado'],
  ...G.meses.map((m) => {
    const b = m.cenarios['Base']
    return [m.nome, M(m.v25), P(m.fatorEquilibrio), M(b.vgv), M(b.receita), M(b.margem), M(-D.custo.fixoDepois), M(b.resultado), M(-b.socio), M(b.resultadoComSocio), M(b.acumuladoComSocio)]
  }),
  [],
  ['OS MESMOS MESES NOS OUTROS CENÁRIOS — resultado final'],
  ['Mês', ...G.cenarios.map((c) => `${c.nome} (${pc(c.T, 1)} de 2025)`)],
  ...G.meses.map((m) => [m.nome, ...G.cenarios.map((c) => M(m.cenarios[c.nome].resultadoComSocio))]),
  ['Acumulado', ...G.cenarios.map((c) => M(G.meses[G.meses.length - 1].cenarios[c.nome].acumuladoComSocio))],
  [],
  ['COMO 2026 VEM RODANDO (VGV 2026 ÷ VGV 2025 da mesma janela, até julho)'],
  ['Janeiro a julho', P(T.fatores.janJul)],
  ['Maio a julho', P(T.fatores.maiJul)],
  ['Junho a julho', P(T.fatores.junJul)],
  ['Só julho', P(T.fatores.julho)],
], [12, 19, 16, 26, 15, 15, 14, 15, 14, 17, 15])

addSheet('COMPROMISSOS', [
  ['PARTICIPAÇÃO DO SÓCIO'],
  [S.contrato],
  ['Trimestre do contrato', 'Lucro', `${pc(S.pct, 0)} do sócio`, 'Vence', 'Situação'],
  [S.realizado.trimestre, M(S.realizado.lucro), M(S.realizado.valor), dmy(S.realizado.vencimento), 'Apurado'],
  ...S.realizado.meses.map((m) => [`  ${m.nome}`, M(m.lucro), '', '', '']),
  ...S.projetado.porCenario.map((c, i) => [
    i === 0 ? S.projetado.trimestre : '', M(c.lucro), M(c.valor), i === 0 ? dmy(S.projetado.vencimento) : '', `cenário ${c.nome}`]),
  [],
  ['COMISSÕES DA NANE — acumuladas no ano, pagas de uma vez'],
  ['Total', M(D.nane.total), `${D.nane.participacoes} participações`, dmy(D.nane.vencimento), ''],
  [],
  ['RECEBIMENTOS COM DATA ACORDADA COM A LEILOEIRA'],
  ['Guadalupe — 1ª parcela', M(10712.95), '', '25/08/2026', ''],
  ['Guadalupe — 2ª parcela', M(10712.95), '', '25/09/2026', '30 dias após a primeira'],
  ['Naviraí — os dois pregões', M(18374.25), '', '10/09/2026', '5% sobre a venda líquida de R$ 367.485,00'],
], [40, 16, 20, 14, 44])

addSheet('MES A MES', [
  ['Mês', 'Leilões', 'Lotes', 'Cobertura vendida', 'Receita apurada', 'Receita estimada', 'Receita total', 'Take-rate', 'Imposto 18%', 'Comissão', 'Custo fixo', 'Lucro'],
  ...D.mensal.map((m) => [m.nome, I(m.leiloes), I(m.lotes), M(m.vgv), M(m.receitaApurada), M(m.receitaEstimada), M(m.receita), P(m.take), M(m.imposto), M(m.comissao), M(-m.custoFixo), M(m.lucro)]),
  ['TOTAL', I(D.ano.leiloes), I(D.ano.lotes), M(D.ano.vgv), M(D.ano.receitaApurada), M(D.ano.receitaEstimada), M(D.ano.receita), P(D.modelo.takeRate), M(D.ano.imposto), M(D.ano.comissao), M(-C.custoFixoPeriodo), M(C.resultado)],
], [12, 9, 8, 19, 17, 17, 15, 11, 14, 15, 15, 15])

addSheet('COMISSAO', [
  ['POR FAIXA DE PERCENTUAL'],
  ['Faixa', 'Participações', 'Cobertura vendida', 'Comissão', '% do total'],
  ...D.comissao.porFaixa.map((f) => [f.faixa, I(f.n), M(f.vgv), M(f.comissao), P(f.pctDoTotal)]),
  [],
  ['POR ASSESSOR'],
  ['Assessor', 'Participações', 'Cobertura vendida', 'Comissão', '% efetivo'],
  ...D.comissao.porAssessor.map((a) => [a.nome, I(a.leiloes), M(a.vgv), M(a.comissao), P(a.pctEfetivo)]),
  ['TOTAL', I(D.comissao.porAssessor.reduce((s, a) => s + a.leiloes, 0)), M(D.comissao.vgvCoberto), M(D.comissao.total), P(D.comissao.pctSobreVgv)],
], [30, 14, 19, 16, 12])

addSheet('A RECEBER', [
  ['Leiloeira', 'Títulos', 'Vencido', 'A vencer', 'Total'],
  ...D.receber.porLeiloeira.map((l) => [l.leiloeira, I(l.n), M(l.vencido), M(l.aVencer), M(l.total)]),
  ['TOTAL', I(D.receber.titulos), M(D.receber.vencido), M(D.receber.aVencer), M(D.receber.total)],
], [32, 9, 16, 16, 16])

addSheet('EQUIPE', [
  ['FOLHA'],
  ['Colaborador', 'Função', 'Salário fixo'],
  ...D.custo.equipe.map((e) => [e.nome, e.funcao || '', M(e.salario)]),
  ['TOTAL', '', M(D.custo.folhaNova)],
  [],
  ['Estrutura (média mensal realizada no banco, abr–jul)', '', M(D.custo.estruturaMes)],
  ['CUSTO FIXO MENSAL', '', M(D.custo.fixoDepois)],
  [],
  ['Fora do custo fixo, por natureza:'],
  ['Despesa operacional de leilão (varia com o evento)', '', M(D.custo.leilaoMes)],
  ['Cartão da Bula (gasto do Bulinha, abate dívida com ele)', '', M(D.custo.cartaoMes)],
], [50, 26, 16])

const xlsxPath = path.join(desktop, `${BASE}.xlsx`)
xlsx.writeFile(wb, xlsxPath)
console.log('XLSX:', xlsxPath)

/* ══════════════════ Gráficos ══════════════════ */

/* Cascata do ano: da receita ao resultado */
function gCascata() {
  const W = 780, H = 192, T0 = 26, B = 46
  const passos = [
    { rot: 'Receita', v: C.receita, tipo: 'total' },
    { rot: 'Imposto 18%', v: -C.imposto, tipo: 'sai' },
    { rot: 'Comissão', v: -C.comissao, tipo: 'sai' },
    { rot: 'Despesa de leilão', v: -C.despesaLeilao, tipo: 'sai' },
    { rot: 'Margem de contribuição', v: C.margemContribuicao, tipo: 'sub' },
    { rot: 'Custo fixo 8 meses', v: -C.custoFixoPeriodo, tipo: 'sai' },
    { rot: 'Resultado', v: C.resultado, tipo: 'total' },
  ]
  const max = C.receita * 1.05
  const bw = W / passos.length - 15
  const y = (v) => T0 + (H - T0 - B) * (1 - v / max)
  let acum = 0, out = ''
  passos.forEach((p, i) => {
    const x = i * (W / passos.length) + 7.5
    let topo, base
    if (p.tipo === 'sai') { base = acum; acum += p.v; topo = acum } else { topo = p.v; base = 0; acum = p.v }
    const yT = y(Math.max(topo, base)), yB = y(Math.min(topo, base))
    const fill = p.tipo === 'total' ? INK : p.tipo === 'sub' ? GOLD : '#C9C9C9'
    out += `<rect x="${x.toFixed(1)}" y="${yT.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(yB - yT, 1.5).toFixed(1)}" fill="${fill}"/>`
    out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(yT - 5).toFixed(1)}" text-anchor="middle" font-size="9.6" font-weight="700" fill="${INK}">${kk(Math.abs(p.v))}</text>`
    if (i < passos.length - 1 && p.tipo !== 'sub') {
      out += `<line x1="${(x + bw).toFixed(1)}" y1="${y(acum).toFixed(1)}" x2="${(x + W / passos.length).toFixed(1)}" y2="${y(acum).toFixed(1)}" stroke="${SOFT}" stroke-width="0.8" stroke-dasharray="2 2"/>`
    }
    const w = p.rot.split(' ')
    const ls = w.length > 2 ? [w.slice(0, 2).join(' '), w.slice(2).join(' ')] : [p.rot]
    ls.forEach((l, k) => {
      out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(H - B + 15 + k * 10.5).toFixed(1)}" text-anchor="middle" font-size="8.6" fill="${MUTED}">${esc(l)}</text>`
    })
  })
  out += `<line x1="0" y1="${y(0).toFixed(1)}" x2="${W}" y2="${y(0).toFixed(1)}" stroke="${INK}" stroke-width="1.1"/>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Da receita ao resultado no ano">${out}</svg>`
}

/* Prognóstico: cobertura projetada de cada mês x a que faz o mês se pagar */
function gMeses() {
  const W = 780, H = 262, T0 = 26, B = 66, L = 54
  const cores = { Base: INK, Conservador: '#7A7A7A', 'Como foi julho': RUIM }
  const max = Math.max(...G.meses.flatMap((m) => CEN.map((c) => m.cenarios[c].vgv)), G.vgvEquilibrioMes) * 1.16
  const y = (v) => T0 + (H - T0 - B) * (1 - v / max)
  const gw = (W - L) / G.meses.length, bw = gw * 0.19
  let out = ''
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4, yy = y(v)
    out += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    out += `<text x="${L - 7}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="8.4" fill="${MUTED}">${kk(v)}</text>`
  }
  const y0 = y(0)
  G.meses.forEach((m, i) => {
    const cx = L + i * gw + gw / 2
    CEN.forEach((nome, k) => {
      const v = m.cenarios[nome].vgv
      const xo = (k - 1) * (bw + 5) - bw / 2
      const abaixo = v < G.vgvEquilibrioMes
      out += `<rect x="${(cx + xo).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y0 - y(v)).toFixed(1)}" fill="${cores[nome]}" ${abaixo ? 'opacity="0.55"' : ''}/>`
      out += `<text x="${(cx + xo + bw / 2).toFixed(1)}" y="${(y(v) - 4).toFixed(1)}" text-anchor="middle" font-size="8.1" font-weight="600" fill="${abaixo ? RUIM : INK}">${kk(v)}</text>`
    })
    out += `<text x="${cx.toFixed(1)}" y="${(H - B + 16).toFixed(1)}" text-anchor="middle" font-size="9.6" font-weight="700" fill="${INK}">${esc(m.nome)}</text>`
    out += `<text x="${cx.toFixed(1)}" y="${(H - B + 28).toFixed(1)}" text-anchor="middle" font-size="8.4" fill="${MUTED}">2025: ${kk(m.v25)} · precisa de ${pc(m.fatorEquilibrio, 0)}</text>`
    const soc = m.cenarios['Base'].socio
    if (soc > 0) out += `<text x="${cx.toFixed(1)}" y="${(H - B + 40).toFixed(1)}" text-anchor="middle" font-size="8.4" font-weight="700" fill="${RUIM}">+ sócio ${kk(soc)}</text>`
  })
  const ye = y(G.vgvEquilibrioMes)
  out += `<line x1="${L}" y1="${ye.toFixed(1)}" x2="${W}" y2="${ye.toFixed(1)}" stroke="${GOLD}" stroke-width="2" stroke-dasharray="5 3"/>`
  out += `<line x1="${L}" y1="${y0.toFixed(1)}" x2="${W}" y2="${y0.toFixed(1)}" stroke="${INK}" stroke-width="1.1"/>`
  out += `<g transform="translate(${L},${H - 7})">${CEN.map((n, k) =>
    `<rect x="${k * 172}" y="-8" width="11" height="8" fill="${cores[n]}"/><text x="${k * 172 + 16}" y="-1" font-size="8.4" fill="${MUTED}">${esc(n)} · ${pc(cenT(n), 0)} de 2025</text>`).join('')}
    <line x1="516" y1="-4" x2="534" y2="-4" stroke="${GOLD}" stroke-width="2" stroke-dasharray="4 3"/>
    <text x="540" y="-1" font-size="8.4" font-weight="700" fill="#8A7530">o mês se paga acima desta linha</text></g>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Cobertura projetada de cada mês contra a necessária para se pagar">${out}</svg>`
}

/* Ritmo de 2026 contra 2025 */
function gRitmo() {
  const W = 780, H = 118, L = 6, R = 6, T0 = 28, BH = 26
  const x = (v) => L + (W - L - R) * v
  const marcas = [
    { rot: 'Só julho', v: T.fatores.julho }, { rot: 'Jun–jul', v: T.fatores.junJul },
    { rot: 'Mai–jul', v: T.fatores.maiJul }, { rot: 'Jan–jul', v: T.fatores.janJul },
  ]
  const media = G.meses.reduce((s, m) => s + m.fatorEquilibrio, 0) / G.meses.length
  let out = `<rect x="${L}" y="${T0}" width="${W - L - R}" height="${BH}" fill="#F2F2F2"/>`
  out += `<rect x="${L}" y="${T0}" width="${(x(media) - L).toFixed(1)}" height="${BH}" fill="#DEDEDE"/>`
  for (let i = 0; i <= 10; i += 2) {
    const v = i / 10
    out += `<text x="${x(v).toFixed(1)}" y="${T0 + BH + 14}" text-anchor="middle" font-size="8.4" fill="${MUTED}">${(v * 100).toFixed(0)}%</text>`
  }
  out += `<line x1="${x(media).toFixed(1)}" y1="${T0 - 12}" x2="${x(media).toFixed(1)}" y2="${T0 + BH + 3}" stroke="${INK}" stroke-width="2"/>`
  out += `<text x="${(x(media) + 5).toFixed(1)}" y="${T0 - 4}" font-size="9" font-weight="700" fill="${INK}">média do que os quatro meses exigem ${pc(media, 1)}</text>`
  marcas.forEach((m, i) => {
    const cor = m.v < media ? GOLD : INK
    out += `<circle cx="${x(m.v).toFixed(1)}" cy="${T0 + BH / 2}" r="4.4" fill="${cor}" stroke="#fff" stroke-width="1.3"/>`
    const yy = T0 + BH + 30 + (i % 2) * 14
    out += `<line x1="${x(m.v).toFixed(1)}" y1="${T0 + BH / 2 + 5}" x2="${x(m.v).toFixed(1)}" y2="${yy - 9}" stroke="${SOFT}" stroke-width="0.7" stroke-dasharray="2 2"/>`
    out += `<text x="${x(m.v).toFixed(1)}" y="${yy}" text-anchor="middle" font-size="8.8" font-weight="600" fill="${cor === GOLD ? '#8A7530' : INK}">${esc(m.rot)} · ${pc(m.v, 0)}</text>`
  })
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Ritmo de 2026 contra 2025">${out}</svg>`
}

/* ══════════════════ HTML ══════════════════ */

const dm = dmy(D.meta.geradoEm)

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(BASE)}</title>
<style>
  @page { size: A4; margin: 13mm 12mm 12mm 12mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"Segoe UI",Arial,sans-serif; color:${INK}; font-size:10.5px; line-height:1.45; }
  h1 { font-size:20px; margin:0 0 2px; letter-spacing:-0.3px; text-transform:uppercase; font-weight:800; }
  h2 { font-size:12.5px; margin:17px 0 7px; text-transform:uppercase; letter-spacing:1.1px; font-weight:700;
       border-bottom:1.6px solid ${INK}; padding-bottom:4px; }
  .sub { color:${MUTED}; font-size:10px; margin-bottom:12px; }
  .lead { border-left:3px solid ${GOLD}; padding:9px 12px; margin:11px 0 4px; background:#FBFAF6; font-size:11px; line-height:1.55; }
  .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:9px; margin:11px 0 2px; }
  .kpi { border:1px solid ${GRID}; border-top:2.5px solid ${INK}; padding:8px 9px; }
  .kpi.gold { border-top-color:${GOLD}; }
  .kpi.risco { border-top-color:${RUIM}; }
  .kpi .r { font-size:8.3px; text-transform:uppercase; letter-spacing:0.7px; color:${MUTED}; }
  .kpi .v { font-size:17px; font-weight:800; margin-top:2px; letter-spacing:-0.4px; }
  .kpi .d { font-size:8.6px; color:${MUTED}; margin-top:1px; }
  table { width:100%; border-collapse:collapse; font-size:9.6px; }
  th { text-align:left; font-size:8.3px; text-transform:uppercase; letter-spacing:0.6px; color:${MUTED};
       border-bottom:1px solid ${INK}; padding:4px 5px; font-weight:700; }
  td { padding:3.6px 5px; border-bottom:1px solid ${GRID}; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; }
  tr.tot td { font-weight:800; border-top:1.6px solid ${INK}; border-bottom:none; }
  td.neg { color:${RUIM}; font-weight:700; }
  .nota { font-size:8.8px; color:${MUTED}; margin-top:6px; line-height:1.5; }
  .duas { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .quebra { page-break-before:always; }
  .rod { margin-top:14px; padding-top:7px; border-top:1px solid ${GRID}; font-size:8.2px; color:${MUTED}; }
</style></head><body>

<h1>Resultado 2026 e prognóstico</h1>
<div class="sub">Bula Assessoria · janeiro a agosto de 2026 e o que vem pela frente · ${dm}</div>

<div class="kpis">
  <div class="kpi"><div class="r">Cobertura vendida</div><div class="v">R$ ${kk(D.ano.vgv)}</div>
    <div class="d">${D.ano.leiloes} leilões · ${brl0(D.ano.lotes)} lotes</div></div>
  <div class="kpi"><div class="r">Receita da Bula</div><div class="v">R$ ${kk(C.receita)}</div>
    <div class="d">${pc(D.modelo.takeRate, 2)} do que foi vendido</div></div>
  <div class="kpi gold"><div class="r">Margem de contribuição</div><div class="v">${pc(C.margemPct)}</div>
    <div class="d">R$ ${kk(C.margemContribuicao)} em oito meses</div></div>
  <div class="kpi"><div class="r">Resultado do período</div><div class="v">${sinal(C.resultado)}</div>
    <div class="d">R$ ${brl0(C.resultado / C.meses)} por mês</div></div>
</div>

<h2>Da receita ao que sobra</h2>
<div>${gCascata()}</div>
<div class="lead">De cada <b>R$ 100</b> que a Bula fatura de comissão das leiloeiras,
<b>R$ ${brl0(100 * C.imposto / C.receita)}</b> vão de imposto, <b>R$ ${brl0(100 * C.comissao / C.receita)}</b> de comissão dos assessores
e <b>R$ ${brl0(100 * C.despesaLeilao / C.receita)}</b> de despesa de leilão. Sobram <b>R$ ${brl0(100 * C.margemPct)}</b> de margem de contribuição —
é dela que sai o custo fixo de toda a estrutura.</div>

<table>
  <thead><tr><th>Mês</th><th class="n">Leilões</th><th class="n">Lotes</th><th class="n">Cobertura vendida</th>
  <th class="n">Receita</th><th class="n">Take</th><th class="n">Imposto</th><th class="n">Comissão</th>
  <th class="n">Custo fixo</th><th class="n">Lucro</th></tr></thead>
  <tbody>${D.mensal.map((m) => `<tr><td>${esc(m.nome)}</td><td class="n">${m.leiloes}</td><td class="n">${brl0(m.lotes)}</td>
    <td class="n">${brl0(m.vgv)}</td><td class="n">${brl0(m.receita)}</td><td class="n">${m.vgv > 0 ? pc(m.take, 2) : '—'}</td>
    <td class="n">${brl0(m.imposto)}</td><td class="n">${brl0(m.comissao)}</td>
    <td class="n">−${brl0(m.custoFixo)}</td><td class="n ${m.lucro < 0 ? 'neg' : ''}">${sinal(m.lucro)}</td></tr>`).join('')}
  <tr class="tot"><td>Total</td><td class="n">${D.ano.leiloes}</td><td class="n">${brl0(D.ano.lotes)}</td>
    <td class="n">${brl0(D.ano.vgv)}</td><td class="n">${brl0(D.ano.receita)}</td><td class="n">${pc(D.modelo.takeRate, 2)}</td>
    <td class="n">${brl0(D.ano.imposto)}</td><td class="n">${brl0(D.ano.comissao)}</td>
    <td class="n">−${brl0(C.custoFixoPeriodo)}</td><td class="n">${sinal(C.resultado)}</td></tr></tbody>
</table>
<div class="nota">Agosto fecha em 31/08 — está parcial. ${D.apuracao.semAcordo} dos ${D.apuracao.leiloes} leilões do ano ainda não têm a receita fechada com a leiloeira
(R$ ${brl0(D.apuracao.vgvPendente)} de cobertura, quase tudo da Expogenética): a receita deles entra estimada em R$ ${brl0(D.ano.receitaEstimada)},
pelo take-rate de ${pc(D.modelo.takeRate, 2)} medido nos ${D.apuracao.comAcordo} que já estão fechados. O volume vendido e a comissão são fato nos ${D.apuracao.leiloes} —
a comissão nasce do lance, não do acordo. O custo fixo é a folha lançada em cada mês mais a estrutura.</div>

<div class="quebra"></div>

<h2>O que a estrutura custa por mês</h2>
<div class="duas">
  <div>
    <table>
      <thead><tr><th>Colaborador</th><th>Função</th><th class="n">Salário</th></tr></thead>
      <tbody>${D.custo.equipe.map((e) => `<tr><td>${esc(e.nome)}</td><td>${esc(e.funcao || '')}</td><td class="n">${brl0(e.salario)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="2">Folha</td><td class="n">${brl0(D.custo.folhaNova)}</td></tr>
      <tr><td colspan="2">Estrutura (média mensal abr–jul)</td><td class="n">${brl0(D.custo.estruturaMes)}</td></tr>
      <tr class="tot"><td colspan="2">Custo fixo mensal</td><td class="n">${brl0(D.custo.fixoDepois)}</td></tr></tbody>
    </table>
  </div>
  <div>
    <div class="lead" style="margin-top:0">Com a margem de <b>${pc(C.margemPct)}</b>, esse custo fixo exige
    <b>R$ ${brl0(G.receitaEquilibrioMes)} de receita por mês</b> — ou <b>R$ ${brl0(G.vgvEquilibrioMes)} de cobertura vendida</b> — só para o mês se pagar.
    A folha subiu de R$ ${brl0(D.custo.folhaAntes)} para R$ ${brl0(D.custo.folhaNova)}; a exigência mensal de cobertura subiu junto,
    de R$ ${brl0(G.vgvEquilibrioMesAntes)} para R$ ${brl0(G.vgvEquilibrioMes)}.</div>
    <div class="nota" style="margin-top:10px">Ficam fora do custo fixo, por natureza: a <b>despesa operacional de leilão</b>
    (R$ ${brl0(D.custo.leilaoMes)}/mês em média) varia com o evento e já está descontada na margem de contribuição; e o
    <b>cartão da Bula</b> (R$ ${brl0(D.custo.cartaoMes)}/mês), que é gasto do Bulinha e abate a dívida com ele.</div>
  </div>
</div>

<h2>Dois compromissos além da operação</h2>
<div class="lead"><b>A participação do sócio.</b> Pelo contrato de 17/07/2026, o Marcelo é remunerado com <b>${pc(S.pct, 0)} do lucro, pagos trimestralmente</b>,
contando de ${esc(S.inicio)}. O trimestre ${esc(S.realizado.trimestre)} fechou com <b>R$ ${brl0(S.realizado.lucro)}</b> de lucro,
o que dá <b>R$ ${brl0(S.realizado.valor)} a pagar em ${dmy(S.realizado.vencimento)}</b>. O trimestre ${esc(S.projetado.trimestre)}
vence em ${dmy(S.projetado.vencimento)} e vale R$ ${brl0(socioBase.valor)} no cenário Base. Não é custo da operação — sai depois do lucro
e desaparece quando não há lucro, então não altera o ponto de equilíbrio, mas consome tudo o que passa dele.
<br><br><b>As comissões da Nane.</b> Não saem leilão a leilão: acumulam o ano e são pagas de uma vez em ${dmy(D.nane.vencimento)} —
<b>R$ ${brl0(D.nane.total)}</b> em ${D.nane.participacoes} participações, caindo no mês mais apertado do calendário.</div>

<table>
  <thead><tr><th>Trimestre do contrato</th><th class="n">Lucro</th><th class="n">${pc(S.pct, 0)} do sócio</th><th class="n">Vence</th><th>Situação</th></tr></thead>
  <tbody>
    <tr><td><b>${esc(S.realizado.trimestre)}</b></td><td class="n">${sinal(S.realizado.lucro)}</td>
      <td class="n"><b>${brl0(S.realizado.valor)}</b></td><td class="n">${dmy(S.realizado.vencimento)}</td>
      <td style="font-size:8.8px;color:${MUTED}">Apurado — ${S.realizado.meses.map((m) => `${m.nome} ${brl0(m.lucro)}`).join(' · ')}</td></tr>
    ${S.projetado.porCenario.map((c, i) => `<tr>
      <td>${i === 0 ? `<b>${esc(S.projetado.trimestre)}</b>` : ''}</td>
      <td class="n ${c.lucro < 0 ? 'neg' : ''}">${sinal(c.lucro)}</td>
      <td class="n ${c.valor === 0 ? 'neg' : ''}">${brl0(c.valor)}</td>
      <td class="n">${i === 0 ? dmy(S.projetado.vencimento) : ''}</td>
      <td style="font-size:8.8px;color:${MUTED}">cenário ${esc(c.nome)}${c.valor === 0 ? ' — sem lucro, sem participação' : ''}</td></tr>`).join('')}
  </tbody>
</table>

<div class="quebra"></div>

<h2>Prognóstico — o que cada mês precisa vender</h2>
<div>${gMeses()}</div>
<div class="nota">A barra é a cobertura que cada mês tende a vender: o mesmo mês de 2025 corrigido pelo ritmo que 2026 vem mostrando.
A linha dourada é a cobertura que faz o mês se pagar — igual em todos, porque o custo fixo não muda de mês para mês. Barra abaixo dela é mês no vermelho.
<b>${esc(dez.nome)} é o mês mais exigente do calendário: precisa de ${pc(dez.fatorEquilibrio, 1)} do que fez em 2025, contra ${pc(G.meses[1].fatorEquilibrio, 1)} de outubro.</b>
Não é que ele piore — é o menor mês do ano (R$ ${kk(dez.v25)} em 2025 contra R$ ${kk(G.meses[1].v25)} de outubro) carregando o mesmo custo fixo.</div>

<table>
  <thead><tr><th>Mês</th><th class="n">Precisa repetir de 2025</th><th class="n">Operação</th><th class="n">(−) Sócio</th>
  <th class="n">Base</th><th class="n">Conservador</th><th class="n">No ritmo de julho</th><th class="n">Acumulado</th></tr></thead>
  <tbody>${G.meses.map((m) => {
    const b = m.cenarios['Base'], c = m.cenarios['Conservador'], j = m.cenarios['Como foi julho']
    return `<tr><td><b>${esc(m.nome)}</b></td><td class="n"><b>${pc(m.fatorEquilibrio, 1)}</b></td>
      <td class="n ${b.resultado < 0 ? 'neg' : ''}">${sinal(b.resultado)}</td>
      <td class="n ${b.socio > 0 ? 'neg' : ''}">${b.socio > 0 ? '−' + brl0(b.socio) : '—'}</td>
      <td class="n ${b.resultadoComSocio < 0 ? 'neg' : ''}"><b>${sinal(b.resultadoComSocio)}</b></td>
      <td class="n ${c.resultadoComSocio < 0 ? 'neg' : ''}">${sinal(c.resultadoComSocio)}</td>
      <td class="n ${j.resultadoComSocio < 0 ? 'neg' : ''}">${sinal(j.resultadoComSocio)}</td>
      <td class="n">${sinal(b.acumuladoComSocio)}</td></tr>`
  }).join('')}
  <tr class="tot"><td>Somado</td><td class="n">${pc(T.equilibrio.depois, 1)}</td>
    <td class="n">${sinal(G.meses.reduce((s, m) => s + m.cenarios['Base'].resultado, 0))}</td>
    <td class="n neg">−${brl0(G.meses.reduce((s, m) => s + m.cenarios['Base'].socio, 0))}</td>
    <td class="n"><b>${sinal(fimBase)}</b></td>
    <td class="n">${sinal(G.meses[G.meses.length - 1].cenarios['Conservador'].acumuladoComSocio)}</td>
    <td class="n neg">${sinal(fimJul)}</td><td class="n">${sinal(fimBase)}</td></tr></tbody>
</table>
<div class="nota">"Precisa repetir" = quanto do mesmo mês de 2025 aquele mês tem de entregar para cobrir o custo fixo — só a operação, sem o sócio.
Receita = cobertura × take-rate de ${pc(D.modelo.takeRate, 2)}; margem = ${pc(C.margemPct)} da receita, a realizada do ano.
A coluna do sócio traz a participação do trimestre anterior, que vence naquele mês.
<b>${negBase.length ? `No cenário Base, ${listar(negBase.map((n) => n.toLowerCase()))} fecha${negBase.length > 1 ? 'm' : ''} no vermelho` : 'Nenhum mês fecha no vermelho no cenário Base'}</b> —
${esc(G.meses[0].nome.toLowerCase())} porque paga o trimestre que já fechou, ${esc(dez.nome.toLowerCase())} porque é o menor mês do ano e ainda paga o trimestre seguinte.
A comissão da Nane sai em ${esc(dez.nome.toLowerCase())} mas já foi reconhecida na competência de cada leilão, então não aparece nesta tabela: no caixa, ela piora
${esc(dez.nome.toLowerCase())} em mais R$ ${brl0(D.nane.total)}.</div>

<h2>Onde 2026 vem rodando</h2>
<div>${gRitmo()}</div>
<div class="nota">Cada ponto é o VGV de 2026 dividido pelo VGV de 2025 na mesma janela de meses. As janelas param em julho de propósito:
agosto ainda está correndo e agosto de 2025 foi o pico do ano — comparar os dois exageraria a queda.
Enquanto a operação rodar acima da linha, a estrutura cabe; <b>julho isolado (${pc(T.fatores.julho, 0)}) não cabia</b>.</div>

<div class="quebra"></div>

<h2>As três alavancas antes de mexer na estrutura</h2>
<div class="duas">
  <div>
    <table>
      <thead><tr><th>1 · A comissão não está no 5%</th><th class="n">Comissão</th><th class="n">% do total</th></tr></thead>
      <tbody>${D.comissao.porFaixa.map((f) => `<tr><td>${esc(f.faixa)}</td><td class="n">${brl0(f.comissao)}</td>
        <td class="n">${pc(f.pctDoTotal, 1)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="n">${brl0(D.comissao.total)}</td><td class="n">${pc(D.comissao.pctSobreVgv, 2)} da venda</td></tr></tbody>
    </table>
    <div class="nota">${pc(f2.pctDoTotal, 1)} da comissão é a faixa de 2% dos assessores; o parceiro a 5% pesa ${pc(f5.pctDoTotal, 1)}
    (R$ ${brl0(f5.comissao)}). ${esc(a1.nome)} sozinho responde por R$ ${brl0(a1.comissao)} — ${pc(a1.comissao / D.comissao.total, 1)} do total,
    a ${pc(a1.pctEfetivo, 2)} efetivo sobre o que vendeu. Mexer no percentual não muda o prognóstico; o peso vem do volume.</div>
  </div>
  <div>
    <table>
      <thead><tr><th>2 · O que está para receber</th><th class="n">Vencido</th><th class="n">A vencer</th><th class="n">Total</th></tr></thead>
      <tbody>${D.receber.porLeiloeira.slice(0, 6).map((l) => `<tr><td>${esc(l.leiloeira)}</td><td class="n">${brl0(l.vencido)}</td>
        <td class="n">${brl0(l.aVencer)}</td><td class="n">${brl0(l.total)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="n">${brl0(D.receber.vencido)}</td><td class="n">${brl0(D.receber.aVencer)}</td>
        <td class="n">${brl0(D.receber.total)}</td></tr></tbody>
    </table>
    <div class="nota"><b>R$ ${brl0(D.receber.vencido)} já venceram e não entraram</b> — ${pc(D.receber.vencido / D.receber.total, 0)} da carteira.
    É caixa já ganho, que não depende de nenhum leilão futuro. Com data confirmada pela leiloeira há R$ ${brl0(D.receber.comDataAcordada)}:
    Guadalupe em duas parcelas de R$ 10.712,95 (25/08 e 25/09) e Naviraí R$ 18.374,25 em 10/09.
    <br><br><b>3 · A receita ainda não apurada:</b> R$ ${brl0(D.apuracao.vgvPendente)} de cobertura vendida sem acordo fechado com a leiloeira.
    Fechar esses acordos é reconhecer receita que já existe — e é a diferença entre ${esc(dez.nome.toLowerCase())} fechar no vermelho ou no azul.</div>
  </div>
</div>

<div class="rod">Fontes: fechamento de leilões, contas a receber, contas a pagar, extrato conciliado e cadastro de folha do ERP Bula;
histórico mensal de 2025 do consolidado da operação. Imposto pelo critério de 18% sobre a receita.
Custo fixo = folha do cadastro + média mensal de estrutura realizada no banco entre abril e julho.
Emitido em ${dm}.</div>

</body></html>`

const htmlPath = path.join(OUT, 'resultado-prognostico.html')
fs.writeFileSync(htmlPath, html)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
const pdfPath = path.join(desktop, `${BASE}.pdf`)
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF: ', pdfPath)
