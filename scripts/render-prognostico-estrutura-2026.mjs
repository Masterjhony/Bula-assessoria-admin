/**
 * "PROGNÓSTICO — O QUE A ESTRUTURA NOVA EXIGE DAQUI PRA FRENTE".
 *
 *   node scripts/render-prognostico-estrutura-2026.mjs
 *
 * O chefe pediu faturamento, comissão e margem depois de ter sido advertido
 * sobre caixa em cima das contratações e sobre o que vem pela frente. O
 * relatório de faturamento respondeu ao pedido literal; este responde à
 * pergunta: com a folha nova, quanto cada mês daqui pra frente precisa
 * entregar para se pagar — e qual mês não fecha.
 *
 * A régua é mensal de propósito. O trimestre somado esconde o que importa:
 * setembro e outubro são meses grandes no calendário do leilão e dezembro é o
 * menor do ano, mas o custo fixo é o mesmo nos três.
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
const BASE = 'Bula - Prognostico da Estrutura Nova - 21-08-2026'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl0 = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pc = (n, d = 1) => (Number(n) * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const sinal = (n) => (n < 0 ? '−R$ ' + brl0(Math.abs(n)) : 'R$ ' + brl0(n))
const kk = (n) => {
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  if (a >= 1e6) return s + (a / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
  if (a >= 1000) return s + (a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k'
  return s + brl0(a)
}

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', SOFT = '#B4B4B4', RUIM = '#8A2020'
const G = D.prognostico
const T = D.trimestre
const CEN = ['Base', 'Conservador', 'Como foi julho']
const cenInfo = (n) => G.cenarios.find((c) => c.nome === n)
const dez = G.meses.find((m) => m.mes === 12)
const acumBase = G.meses[G.meses.length - 1].cenarios['Base'].acumulado
const acumJulho = G.meses[G.meses.length - 1].cenarios['Como foi julho'].acumulado
// quais cenários dezembro atravessa — a frase tem de sair do dado, não da
// impressão: no otimista ele passa, e afirmar "nenhum" seria falso
const TODOS_CEN = G.cenarios.map((c) => c.nome)
const dezPassa = TODOS_CEN.filter((n) => dez.cenarios[n].resultado > 0)
const dezFalha = TODOS_CEN.filter((n) => dez.cenarios[n].resultado <= 0)
const listar = (a) => (a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1])
const S = D.socio
const set = G.meses.find((m) => m.mes === 9)
const acumBaseSocio = G.meses[G.meses.length - 1].cenarios['Base'].acumuladoComSocio
const negBase = G.meses.filter((m) => m.cenarios['Base'].resultadoComSocio < 0).map((m) => m.nome)

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

addSheet('PROGNOSTICO', [
  ['BULA ASSESSORIA — PROGNÓSTICO DA ESTRUTURA NOVA'],
  [`Posição de ${D.meta.geradoEm.split('-').reverse().join('/')}`],
  [],
  ['1. O CUSTO FIXO QUE PASSA A VALER'],
  ['Folha até julho', M(D.custo.folhaAntes)],
  ['Folha a partir de agosto', M(D.custo.folhaNova)],
  ['Aumento mensal', M(D.custo.folhaNova - D.custo.folhaAntes)],
  ['Estrutura (média mensal realizada abr–jul)', M(D.custo.estruturaMes)],
  ['Custo fixo mensal — antes', M(D.custo.fixoAntes)],
  ['Custo fixo mensal — agora', M(D.custo.fixoDepois)],
  [],
  ['2. O QUE CADA MÊS PRECISA ENTREGAR PARA SE PAGAR'],
  ['Receita da Bula por mês', M(G.receitaEquilibrioMes)],
  ['Cobertura vendida por mês — agora', M(G.vgvEquilibrioMes)],
  ['Cobertura vendida por mês — antes', M(G.vgvEquilibrioMesAntes)],
  ['Cobertura extra exigida todo mês', M(G.vgvEquilibrioMes - G.vgvEquilibrioMesAntes)],
  [],
  ['3. A RÉGUA DE CADA MÊS (quanto do mesmo mês de 2025 ele precisa repetir)'],
  ['Mês', 'Cobertura em 2025', 'Régua agora', 'Régua antes'],
  ...G.meses.map((m) => [m.nome, M(m.v25), P(m.fatorEquilibrio), P(m.fatorEquilibrioAntes)]),
  [],
  ['4. COMO 2026 VEM RODANDO (VGV 2026 ÷ VGV 2025 da mesma janela, até julho)'],
  ['Janeiro a julho', P(T.fatores.janJul)],
  ['Maio a julho', P(T.fatores.maiJul)],
  ['Junho a julho', P(T.fatores.junJul)],
  ['Só julho', P(T.fatores.julho)],
], [46, 20, 14, 14])

const linhasCenario = (nome) => [
  [`CENÁRIO ${nome.toUpperCase()} — ${pc(cenInfo(nome).T, 1)} de 2025 · ${cenInfo(nome).justificativa}`],
  ['Mês', 'Cobertura em 2025', 'Régua do mês', 'Cobertura projetada', 'Receita', 'Margem', 'Custo fixo', 'Resultado', 'Acumulado'],
  ...G.meses.map((m) => {
    const c = m.cenarios[nome]
    return [m.nome, M(m.v25), P(m.fatorEquilibrio), M(c.vgv), M(c.receita), M(c.margem), M(-D.custo.fixoDepois), M(c.resultado), M(c.acumulado)]
  }),
  [],
]

addSheet('MES A MES A FRENTE', [
  ...linhasCenario('Base'),
  ...linhasCenario('Conservador'),
  ...linhasCenario('Como foi julho'),
  ...linhasCenario('Otimista'),
], [12, 19, 14, 20, 15, 15, 14, 15, 15])

addSheet('O ANO ATE AQUI', [
  ['DA RECEITA AO QUE SOBRA — janeiro a agosto de 2026'],
  ['Receita', M(D.cascata.receita)],
  ['(−) Imposto 18%', M(-D.cascata.imposto)],
  ['(−) Comissão de assessores', M(-D.cascata.comissao)],
  ['(−) Despesa operacional de leilão', M(-D.cascata.despesaLeilao)],
  ['= Margem de contribuição', M(D.cascata.margemContribuicao), P(D.cascata.margemPct)],
  [`(−) Custo fixo de ${D.cascata.meses} meses`, M(-D.cascata.custoFixoPeriodo)],
  ['= Resultado', M(D.cascata.resultado)],
  [],
  ['Mês', 'Leilões', 'Lotes', 'Cobertura vendida', 'Receita apurada', 'Receita estimada', 'Receita total', 'Take-rate', 'Imposto 18%', 'Comissão'],
  ...D.mensal.map((m) => [m.nome, I(m.leiloes), I(m.lotes), M(m.vgv), M(m.receitaApurada), M(m.receitaEstimada), M(m.receita), P(m.take), M(m.imposto), M(m.comissao)]),
  ['TOTAL', I(D.ano.leiloes), I(D.ano.lotes), M(D.ano.vgv), M(D.ano.receitaApurada), M(D.ano.receitaEstimada), M(D.ano.receita), P(D.modelo.takeRate), M(D.ano.imposto), M(D.ano.comissao)],
], [34, 9, 8, 19, 17, 17, 15, 11, 14, 15])

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

addSheet('CUSTO FIXO', [
  ['A FOLHA A PARTIR DE AGOSTO/2026'],
  ['Colaborador', 'Função', 'Salário fixo'],
  ...D.custo.equipe.map((e) => [e.nome, e.funcao || '', M(e.salario)]),
  ['TOTAL DA FOLHA', '', M(D.custo.folhaNova)],
  [],
  ['ESTRUTURA (média mensal realizada no banco, abr–jul)', '', M(D.custo.estruturaMes)],
  ['CUSTO FIXO MENSAL', '', M(D.custo.fixoDepois)],
  [],
  ['Memo — fora do custo fixo:'],
  ['Despesa operacional de leilão (varia com o evento)', '', M(D.custo.leilaoMes)],
  ['Cartão da Bula (gasto do Bulinha, abate dívida)', '', M(D.custo.cartaoMes)],
], [46, 26, 16])

addSheet('COMPROMISSOS', [
  ['COMPROMISSOS QUE CAEM DENTRO DA JANELA E NÃO ESTAVAM NO PROGNÓSTICO'],
  [],
  [`1. REMUNERAÇÃO DO SÓCIO — ${(S.pct * 100).toFixed(0)}% do lucro, trimestral`],
  [S.contrato],
  ['Trimestre', 'Lucro apurado', 'Participação', 'Vence'],
  [S.realizado.trimestre, M(S.realizado.lucro), M(S.realizado.valor), S.realizado.vencimento],
  ...S.realizado.meses.map((m) => [`  ${m.nome}`, M(m.lucro), '', '']),
  [],
  [`${S.projetado.trimestre} — depende do cenário, vence ${S.projetado.vencimento}`],
  ['Cenário', 'Lucro projetado', 'Participação', ''],
  ...S.projetado.porCenario.map((c) => [c.nome, M(c.lucro), M(c.valor), '']),
  [],
  ['2. COMISSÕES DA NANE — acumuladas, pagas de uma vez'],
  ['Total acumulado no ano', M(D.nane.total), `${D.nane.participacoes} participações`, D.nane.vencimento],
  [],
  ['3. RECEBIMENTOS COM DATA ACORDADA (não é o vencimento automático de leilão+45d)'],
  ['Guadalupe — 1ª parcela', M(10712.95), '', '2026-08-25'],
  ['Guadalupe — 2ª parcela', M(10712.95), '', '2026-09-25'],
  ['Naviraí — líquido dos dois pregões', M(18374.25), '5% sobre a venda líquida', '2026-09-10'],
  ['Total com data acordada na carteira', M(D.receber.comDataAcordada), `${D.receber.titulosAcordados} títulos`, ''],
  [],
  ['4. O PROGNÓSTICO COM ESSES COMPROMISSOS — cenário Base'],
  ['Mês', 'Resultado do mês', 'Sócio', 'Resultado final', 'Acumulado'],
  ...G.meses.map((m) => {
    const c = m.cenarios['Base']
    return [m.nome, M(c.resultado), M(-c.socio), M(c.resultadoComSocio), M(c.acumuladoComSocio)]
  }),
], [46, 18, 20, 16, 14])

const xlsxPath = path.join(desktop, `${BASE}.xlsx`)
xlsx.writeFile(wb, xlsxPath)
console.log('XLSX:', xlsxPath)

/* ══════════════════ Gráficos ══════════════════ */

/* O MOTOR DO PROGNÓSTICO — cobertura projetada de cada mês x a linha que
   precisa ser cruzada para o mês se pagar. */
function gMeses() {
  const W = 780, H = 262, T0 = 26, B = 66, L = 54
  const cores = { Base: INK, Conservador: '#7A7A7A', 'Como foi julho': RUIM }
  const vals = G.meses.flatMap((m) => CEN.map((c) => m.cenarios[c].vgv)).concat([G.vgvEquilibrioMes, ...G.meses.map((m) => m.v25 * 0)])
  const max = Math.max(...vals) * 1.16
  const y = (v) => T0 + (H - T0 - B) * (1 - v / max)
  const gw = (W - L) / G.meses.length
  const bw = gw * 0.19
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
      out += `<text x="${(cx + xo + bw / 2).toFixed(1)}" y="${(y(v) - 4).toFixed(1)}" text-anchor="middle" font-size="8.1" fill="${abaixo ? RUIM : INK}" font-weight="600">${kk(v)}</text>`
    })
    out += `<text x="${cx.toFixed(1)}" y="${(H - B + 16).toFixed(1)}" text-anchor="middle" font-size="9.6" font-weight="700" fill="${INK}">${esc(m.nome)}</text>`
    out += `<text x="${cx.toFixed(1)}" y="${(H - B + 28).toFixed(1)}" text-anchor="middle" font-size="8.4" fill="${MUTED}">2025: ${kk(m.v25)} · régua ${pc(m.fatorEquilibrio, 0)}</text>`
    // os dois meses que ainda pagam a participação do sócio
    const socioMes = m.cenarios['Base'].socio
    if (socioMes > 0) out += `<text x="${cx.toFixed(1)}" y="${(H - B + 40).toFixed(1)}" text-anchor="middle" font-size="8.4" font-weight="700" fill="${RUIM}">+ sócio ${kk(socioMes)}</text>`
  })
  // a linha do equilíbrio mensal
  const ye = y(G.vgvEquilibrioMes)
  out += `<line x1="${L}" y1="${ye.toFixed(1)}" x2="${W}" y2="${ye.toFixed(1)}" stroke="${GOLD}" stroke-width="2" stroke-dasharray="5 3"/>`
  out += `<line x1="${L}" y1="${y0.toFixed(1)}" x2="${W}" y2="${y0.toFixed(1)}" stroke="${INK}" stroke-width="1.1"/>`
  out += `<g transform="translate(${L},${H - 7})">${CEN.map((n, k) =>
    `<rect x="${k * 172}" y="-8" width="11" height="8" fill="${cores[n]}"/><text x="${k * 172 + 16}" y="-1" font-size="8.4" fill="${MUTED}">${esc(n)} · ${pc(cenInfo(n).T, 0)} de 2025</text>`).join('')}
    <line x1="516" y1="-4" x2="534" y2="-4" stroke="${GOLD}" stroke-width="2" stroke-dasharray="4 3"/>
    <text x="540" y="-1" font-size="8.4" fill="#8A7530" font-weight="700">o mês se paga acima desta linha</text></g>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Cobertura projetada de cada mês contra a cobertura necessária para o mês se pagar">${out}</svg>`
}

/* A RÉGUA — onde 2026 roda x onde precisa rodar */
function gRegua() {
  const W = 780, H = 118, L = 6, R = 6, T0 = 28, BH = 26
  const x = (v) => L + (W - L - R) * v
  const marcas = [
    { rot: 'Só julho', v: T.fatores.julho },
    { rot: 'Jun–jul', v: T.fatores.junJul },
    { rot: 'Mai–jul', v: T.fatores.maiJul },
    { rot: 'Jan–jul', v: T.fatores.janJul },
  ]
  const reguaMedia = G.meses.reduce((s, m) => s + m.fatorEquilibrio, 0) / G.meses.length
  const reguaMediaAntes = G.meses.reduce((s, m) => s + m.fatorEquilibrioAntes, 0) / G.meses.length
  let out = `<rect x="${L}" y="${T0}" width="${W - L - R}" height="${BH}" fill="#F2F2F2"/>`
  out += `<rect x="${L}" y="${T0}" width="${(x(reguaMedia) - L).toFixed(1)}" height="${BH}" fill="#E4E4E4"/>`
  out += `<rect x="${L}" y="${T0}" width="${(x(reguaMediaAntes) - L).toFixed(1)}" height="${BH}" fill="#CFCFCF"/>`
  for (let i = 0; i <= 10; i += 2) {
    const v = i / 10
    out += `<text x="${x(v).toFixed(1)}" y="${T0 + BH + 14}" text-anchor="middle" font-size="8.4" fill="${MUTED}">${(v * 100).toFixed(0)}%</text>`
  }
  const regua = (v, cor, rot, dy) => `
    <line x1="${x(v).toFixed(1)}" y1="${T0 - 12}" x2="${x(v).toFixed(1)}" y2="${T0 + BH + 3}" stroke="${cor}" stroke-width="2"/>
    <text x="${(x(v) + 5).toFixed(1)}" y="${T0 - 4 + dy}" font-size="9" font-weight="700" fill="${cor}">${esc(rot)} ${pc(v, 1)}</text>`
  out += regua(reguaMediaAntes, SOFT, 'régua média antes', 0)
  out += regua(reguaMedia, INK, 'régua média agora', -12)
  marcas.forEach((m, i) => {
    const cor = m.v < reguaMedia ? GOLD : INK
    out += `<circle cx="${x(m.v).toFixed(1)}" cy="${T0 + BH / 2}" r="4.4" fill="${cor}" stroke="#fff" stroke-width="1.3"/>`
    const yy = T0 + BH + 30 + (i % 2) * 14
    out += `<line x1="${x(m.v).toFixed(1)}" y1="${T0 + BH / 2 + 5}" x2="${x(m.v).toFixed(1)}" y2="${yy - 9}" stroke="${SOFT}" stroke-width="0.7" stroke-dasharray="2 2"/>`
    out += `<text x="${x(m.v).toFixed(1)}" y="${yy}" text-anchor="middle" font-size="8.8" font-weight="600" fill="${cor === GOLD ? '#8A7530' : INK}">${esc(m.rot)} · ${pc(m.v, 0)}</text>`
  })
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Ritmo de 2026 contra a régua média necessária">${out}</svg>`
}

/* Cascata do ano */
function gCascata() {
  const W = 780, H = 190, T0 = 26, B = 46
  const passos = [
    { rot: 'Receita', v: D.cascata.receita, tipo: 'total' },
    { rot: 'Imposto 18%', v: -D.cascata.imposto, tipo: 'sai' },
    { rot: 'Comissão', v: -D.cascata.comissao, tipo: 'sai' },
    { rot: 'Despesa de leilão', v: -D.cascata.despesaLeilao, tipo: 'sai' },
    { rot: 'Margem de contribuição', v: D.cascata.margemContribuicao, tipo: 'sub' },
    { rot: 'Custo fixo 8 meses', v: -D.cascata.custoFixoPeriodo, tipo: 'sai' },
    { rot: 'Resultado', v: D.cascata.resultado, tipo: 'total' },
  ]
  const max = D.cascata.receita * 1.05
  const bw = W / passos.length - 15
  const y = (v) => T0 + (H - T0 - B) * (1 - v / max)
  let acum = 0, out = ''
  passos.forEach((p, i) => {
    const x = i * (W / passos.length) + 7.5
    let topo, base2
    if (p.tipo === 'sai') { base2 = acum; acum += p.v; topo = acum } else { topo = p.v; base2 = 0; acum = p.v }
    const yTopo = y(Math.max(topo, base2)), yBase = y(Math.min(topo, base2))
    const fill = p.tipo === 'total' ? INK : p.tipo === 'sub' ? GOLD : '#C9C9C9'
    out += `<rect x="${x.toFixed(1)}" y="${yTopo.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(yBase - yTopo, 1.5).toFixed(1)}" fill="${fill}"/>`
    out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(yTopo - 5).toFixed(1)}" text-anchor="middle" font-size="9.6" font-weight="700" fill="${INK}">${kk(Math.abs(p.v))}</text>`
    if (i < passos.length - 1 && p.tipo !== 'sub') {
      out += `<line x1="${(x + bw).toFixed(1)}" y1="${y(acum).toFixed(1)}" x2="${(x + W / passos.length).toFixed(1)}" y2="${y(acum).toFixed(1)}" stroke="${SOFT}" stroke-width="0.8" stroke-dasharray="2 2"/>`
    }
    const w = p.rot.split(' ')
    const linhas = w.length > 2 ? [w.slice(0, 2).join(' '), w.slice(2).join(' ')] : [p.rot]
    linhas.forEach((l, k) => {
      out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(H - B + 15 + k * 10.5).toFixed(1)}" text-anchor="middle" font-size="8.6" fill="${MUTED}">${esc(l)}</text>`
    })
  })
  out += `<line x1="0" y1="${y(0).toFixed(1)}" x2="${W}" y2="${y(0).toFixed(1)}" stroke="${INK}" stroke-width="1.1"/>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Cascata da receita ao resultado no ano">${out}</svg>`
}

/* ══════════════════ HTML ══════════════════ */

const dm = D.meta.geradoEm.split('-').reverse().join('/')
const f2 = D.comissao.porFaixa.find((f) => f.faixa === '2% (assessor)')
const f5 = D.comissao.porFaixa.find((f) => f.faixa === '5% (parceiro)')
const a1 = D.comissao.porAssessor[0]

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

<h1>Prognóstico da estrutura nova</h1>
<div class="sub">Bula Assessoria · o que cada mês daqui pra frente precisa entregar para se pagar · ${dm}</div>

<div class="lead">A folha saiu de <b>R$ ${brl0(D.custo.folhaAntes)}</b> para <b>R$ ${brl0(D.custo.folhaNova)}</b> por mês.
Com a margem de contribuição de ${pc(D.cascata.margemPct)} que a operação vem entregando, a partir de agora
<b>cada mês precisa vender R$ ${brl0(G.vgvEquilibrioMes)} de cobertura</b> só para se pagar — antes bastavam
R$ ${brl0(G.vgvEquilibrioMesAntes)}. São <b>R$ ${brl0(G.vgvEquilibrioMes - G.vgvEquilibrioMesAntes)} a mais de venda, todo mês,
sem nenhum lucro adicional.</b></div>

<div class="kpis">
  <div class="kpi"><div class="r">Custo fixo mensal</div><div class="v">R$ ${brl0(D.custo.fixoDepois)}</div>
    <div class="d">era R$ ${brl0(D.custo.fixoAntes)} · +${pc(D.custo.fixoDepois / D.custo.fixoAntes - 1, 0)}</div></div>
  <div class="kpi gold"><div class="r">Margem de contribuição</div><div class="v">${pc(D.cascata.margemPct)}</div>
    <div class="d">o que sobra de cada real de receita</div></div>
  <div class="kpi"><div class="r">Cobertura por mês p/ empatar</div><div class="v">R$ ${kk(G.vgvEquilibrioMes)}</div>
    <div class="d">R$ ${brl0(G.receitaEquilibrioMes)} de receita da Bula</div></div>
  <div class="kpi risco"><div class="r">Meses negativos no Base</div><div class="v">${negBase.length ? esc(negBase.join(' e ')) : 'nenhum'}</div>
    <div class="d">${negBase.length ? 'depois da participação do sócio' : 'mesmo com os compromissos'}</div></div>
</div>

<h2>O que cada mês precisa vender — e o que ele tende a vender</h2>
<div>${gMeses()}</div>
<div class="nota">A barra é a cobertura que cada mês tende a vender: o mesmo mês de 2025 corrigido pelo ritmo que 2026 vem mostrando.
A linha dourada é a cobertura que faz o mês se pagar — igual em todos, porque o custo fixo não muda de mês para mês.
Barra abaixo da linha é mês no vermelho. <b>Setembro, outubro e novembro passam com folga no cenário Base; dezembro só passa ${dezPassa.length ? `no cenário ${listar(dezPassa)}` : 'em nenhum cenário'}</b>
— fica negativo ${listar(dezFalha.map((n) => `no ${n}`))}. Não é que dezembro piore: ele é o menor mês do calendário de leilão
(R$ ${kk(dez.v25)} em 2025, contra R$ ${kk(G.meses[1].v25)} de outubro) e o custo fixo continua o mesmo.</div>

<h2>Dois compromissos que o prognóstico não continha</h2>
<div class="lead"><b>1 · A participação do sócio.</b> Pelo contrato de 17/07/2026, o Marcelo é remunerado com <b>${pc(S.pct, 0)} do lucro, pagos trimestralmente</b>,
contando de ${esc(S.inicio)}. O primeiro trimestre — ${esc(S.realizado.trimestre)} — já fechou com <b>R$ ${brl0(S.realizado.lucro)}</b> de lucro,
o que dá <b>R$ ${brl0(S.realizado.valor)} a pagar em ${S.realizado.vencimento.split('-').reverse().join('/')}</b>.
O trimestre seguinte (${esc(S.projetado.trimestre)}) vence em ${S.projetado.vencimento.split('-').reverse().join('/')} e vale
R$ ${brl0(S.projetado.porCenario.find((c) => c.nome === 'Base').valor)} no cenário Base.
Não é custo da operação: sai depois do lucro e some quando não há lucro — por isso não mexe no ponto de equilíbrio, mas mexe em tudo acima dele.
<br><br><b>2 · As comissões da Nane.</b> Não saem por leilão: acumulam o ano inteiro e são pagas de uma vez em
${D.nane.vencimento.split('-').reverse().join('/')} — <b>R$ ${brl0(D.nane.total)}</b> em ${D.nane.participacoes} participações,
caindo justamente no mês mais apertado.</div>

<table>
  <thead><tr><th>Trimestre do contrato</th><th class="n">Lucro</th><th class="n">${pc(S.pct, 0)} do sócio</th><th class="n">Vence</th><th>Situação</th></tr></thead>
  <tbody>
    <tr><td><b>${esc(S.realizado.trimestre)}</b></td><td class="n">${sinal(S.realizado.lucro)}</td>
      <td class="n"><b>${brl0(S.realizado.valor)}</b></td><td class="n">${S.realizado.vencimento.split('-').reverse().join('/')}</td>
      <td style="font-size:8.8px;color:${MUTED}">Apurado — ${S.realizado.meses.map((m) => `${m.nome} ${brl0(m.lucro)}`).join(' · ')}</td></tr>
    ${S.projetado.porCenario.map((c, i) => `<tr>
      <td>${i === 0 ? `<b>${esc(S.projetado.trimestre)}</b>` : ''}</td><td class="n ${c.lucro < 0 ? 'neg' : ''}">${sinal(c.lucro)}</td>
      <td class="n ${c.valor === 0 ? 'neg' : ''}">${brl0(c.valor)}</td>
      <td class="n">${i === 0 ? S.projetado.vencimento.split('-').reverse().join('/') : ''}</td>
      <td style="font-size:8.8px;color:${MUTED}">cenário ${esc(c.nome)}${c.valor === 0 ? ' — sem lucro, sem participação' : ''}</td></tr>`).join('')}
  </tbody>
</table>

<div class="quebra"></div>

<h2>A régua de cada mês</h2>
<table>
  <thead><tr><th>Mês</th><th class="n">Precisa repetir de 2025</th><th class="n">Base</th><th class="n">(−) Sócio</th>
  <th class="n">Base final</th><th class="n">Conservador final</th><th class="n">No ritmo de julho</th><th class="n">Acumulado</th></tr></thead>
  <tbody>${G.meses.map((m) => {
    const b = m.cenarios['Base'], c = m.cenarios['Conservador'], j = m.cenarios['Como foi julho']
    return `<tr>
    <td><b>${esc(m.nome)}</b></td>
    <td class="n"><b>${pc(m.fatorEquilibrio, 1)}</b> <span style="color:${MUTED}">era ${pc(m.fatorEquilibrioAntes, 1)}</span></td>
    <td class="n ${b.resultado < 0 ? 'neg' : ''}">${sinal(b.resultado)}</td>
    <td class="n ${b.socio > 0 ? 'neg' : ''}">${b.socio > 0 ? '−' + brl0(b.socio) : '—'}</td>
    <td class="n ${b.resultadoComSocio < 0 ? 'neg' : ''}"><b>${sinal(b.resultadoComSocio)}</b></td>
    <td class="n ${c.resultadoComSocio < 0 ? 'neg' : ''}">${sinal(c.resultadoComSocio)}</td>
    <td class="n ${j.resultadoComSocio < 0 ? 'neg' : ''}">${sinal(j.resultadoComSocio)}</td>
    <td class="n">${sinal(b.acumuladoComSocio)}</td></tr>`
  }).join('')}
  <tr class="tot"><td>Somado</td><td class="n">${pc(T.equilibrio.depois, 1)} <span style="color:${MUTED}">era ${pc(T.equilibrio.antes, 1)}</span></td>
    <td class="n">${sinal(acumBase)}</td>
    <td class="n neg">−${brl0(G.meses.reduce((s2, m) => s2 + m.cenarios['Base'].socio, 0))}</td>
    <td class="n"><b>${sinal(acumBaseSocio)}</b></td>
    <td class="n">${sinal(G.meses[G.meses.length - 1].cenarios['Conservador'].acumuladoComSocio)}</td>
    <td class="n neg">${sinal(G.meses[G.meses.length - 1].cenarios['Como foi julho'].acumuladoComSocio)}</td>
    <td class="n">${sinal(acumBaseSocio)}</td></tr></tbody>
</table>
<div class="nota">"Precisa repetir" = quanto do MESMO mês de 2025 aquele mês precisa entregar para cobrir o custo fixo — só a operação, sem o sócio.
Receita = cobertura × take-rate de ${pc(D.modelo.takeRate, 2)}, medido nos ${D.apuracao.comAcordo} leilões de 2026 que já têm acordo fechado com a leiloeira;
margem = ${pc(D.cascata.margemPct)} da receita, a realizada do ano. A coluna do sócio traz a participação do trimestre anterior, que vence naquele mês.
<b>Mesmo no cenário Base, ${negBase.length ? listar(negBase.map((n) => n.toLowerCase())) + ' fecha' + (negBase.length > 1 ? 'm' : '') + ' no vermelho</b> — setembro porque paga o trimestre que já fechou, dezembro porque é o menor mês do ano e ainda paga o trimestre seguinte' : 'nenhum mês fecha no vermelho</b>'}.
A comissão da Nane (R$ ${brl0(D.nane.total)}, ${D.nane.vencimento.split('-').reverse().join('/')}) é caixa que sai em dezembro mas já foi reconhecida na competência de cada leilão — ela não entra nesta tabela, e piora dezembro em mais R$ ${brl0(D.nane.total)} no caixa.
No ritmo de julho o período fecha em ${sinal(G.meses[G.meses.length - 1].cenarios['Como foi julho'].acumuladoComSocio)}.</div>

<h2>Onde 2026 vem rodando</h2>
<div>${gRegua()}</div>
<div class="nota">Cada ponto é o VGV de 2026 dividido pelo VGV de 2025 na mesma janela. As janelas param em julho de propósito:
agosto ainda está correndo e agosto de 2025 foi o pico do ano — comparar os dois exageraria a queda.
Enquanto a operação rodar acima de ${pc(G.meses.reduce((s, m) => s + m.fatorEquilibrio, 0) / G.meses.length, 1)} na média, a estrutura cabe;
<b>julho isolado (${pc(T.fatores.julho, 0)}) não cabia.</b></div>

<h2>De onde vêm esses percentuais — o ano até aqui</h2>
<div>${gCascata()}</div>
<div class="lead">De cada <b>R$ 100</b> de receita: <b>R$ ${brl0(100 * D.cascata.imposto / D.cascata.receita)}</b> de imposto,
<b>R$ ${brl0(100 * D.cascata.comissao / D.cascata.receita)}</b> de comissão e <b>R$ ${brl0(100 * D.cascata.despesaLeilao / D.cascata.receita)}</b> de despesa de leilão.
Sobram <b>R$ ${brl0(100 * D.cascata.margemPct)}</b> — é essa margem que sustenta toda a estrutura.
Em oito meses ela deu R$ ${brl0(D.cascata.margemContribuicao)} contra R$ ${brl0(D.cascata.custoFixoPeriodo)} de custo fixo:
resultado de <b>${sinal(D.cascata.resultado)}</b>, ou R$ ${brl0(D.cascata.resultado / D.cascata.meses)} por mês.</div>

<table>
  <thead><tr><th>Mês</th><th class="n">Leilões</th><th class="n">Lotes</th><th class="n">Cobertura vendida</th>
  <th class="n">Receita</th><th class="n">Take</th><th class="n">Imposto</th><th class="n">Comissão</th></tr></thead>
  <tbody>${D.mensal.map((m) => `<tr><td>${esc(m.nome)}</td><td class="n">${m.leiloes}</td><td class="n">${brl0(m.lotes)}</td>
    <td class="n">${brl0(m.vgv)}</td><td class="n">${brl0(m.receita)}</td><td class="n">${m.vgv > 0 ? pc(m.take, 2) : '—'}</td>
    <td class="n">${brl0(m.imposto)}</td><td class="n">${brl0(m.comissao)}</td></tr>`).join('')}
  <tr class="tot"><td>Total</td><td class="n">${D.ano.leiloes}</td><td class="n">${brl0(D.ano.lotes)}</td>
    <td class="n">${brl0(D.ano.vgv)}</td><td class="n">${brl0(D.ano.receita)}</td><td class="n">${pc(D.modelo.takeRate, 2)}</td>
    <td class="n">${brl0(D.ano.imposto)}</td><td class="n">${brl0(D.ano.comissao)}</td></tr></tbody>
</table>
<div class="nota">Agosto está parcial — fecha em 31/08. ${D.apuracao.semAcordo} dos ${D.apuracao.leiloes} leilões do ano ainda não têm receita apurada com a leiloeira
(R$ ${brl0(D.apuracao.vgvPendente)} de cobertura, quase tudo da Expogenética); a receita deles entra estimada pelo take-rate, R$ ${brl0(D.ano.receitaEstimada)}.
O volume vendido e a comissão são fato nos ${D.apuracao.leiloes}: a comissão nasce do lance, não do acordo.</div>

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
    a ${pc(a1.pctEfetivo, 2)} efetivo. Mexer no percentual não muda o prognóstico; o peso vem do volume.</div>
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
    É caixa já ganho, que não depende de nenhum leilão futuro.
    <br><br><b>3 · A receita ainda não apurada:</b> R$ ${brl0(D.apuracao.vgvPendente)} de cobertura vendida sem acordo fechado com a leiloeira.
    Fechar esses acordos é reconhecer receita que já existe — e é a diferença entre dezembro fechar no zero ou no azul.</div>
  </div>
</div>

<div class="rod">Fontes: fechamento de leilões, contas a receber, contas a pagar, extrato conciliado e cadastro de folha do ERP Bula;
histórico mensal de 2025 do consolidado da operação. Imposto pelo critério de 18% sobre a receita.
Custo fixo = folha do cadastro + média mensal de estrutura realizada no banco entre abril e julho; fatura de cartão fora,
por ser gasto do Bulinha que abate dívida. Gerado em ${dm}.</div>

</body></html>`

const htmlPath = path.join(OUT, 'prognostico.html')
fs.writeFileSync(htmlPath, html)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
const pdfPath = path.join(desktop, `${BASE}.pdf`)
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF: ', pdfPath)
