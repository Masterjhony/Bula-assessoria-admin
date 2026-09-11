/**
 * Consolida o fechamento do Naviraí Camparino (22 e 23/08/2026) — SÓ a fatia
 * da Agropecuária Camparino LTDA, que é o tomador da nota — cruzando quatro
 * fontes: a LISTAGEM DE LOTES da Programa Leilões (PDFs que o Marcelo mandou
 * em 11/09), o HastaPro (FIL 2, com o vendedor de cada lote), o grupo
 * "Lances Bula Assessoria" (fichas "Levamos… Foi com…") e o ERP/planilha do
 * chefe (fechamentos, CP de comissão, aba Acordos com Marcas).
 * Saída: outputs/camparino-fechamento-2026-09/dados.json — o render lê daqui.
 */
import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'

const OUT = 'outputs/camparino-fechamento-2026-09'
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const listagem = JSON.parse(fs.readFileSync(path.join(OUT, 'listagem-programa.json'), 'utf8'))
const hp = JSON.parse(fs.readFileSync(path.join(OUT, 'hp-lotes.json'), 'utf8'))
const sbx = JSON.parse(fs.readFileSync(path.join(OUT, 'supabase-camparino.json'), 'utf8'))
const wpp = JSON.parse(fs.readFileSync(path.join(OUT, 'wpp-lances-22-24ago.json'), 'utf8'))

/* ── 1. Listagem da Programa (faturamento do Camparino) ─────────────────── */
const etapas = [
  { data: '2026-08-22', nome: 'Naviraí Camparino – Essência', rotulo: 'Essência (fêmeas)', pdf: 'Agropecuária Camparino LTDA.pdf (1 página, 236 KB)', emitido: '10/09/2026 16:15' },
  { data: '2026-08-23', nome: '28º Naviraí Camparino – Reprodutores', rotulo: 'Reprodutores (machos)', pdf: 'Agropecuária Camparino LTDA.pdf (3 páginas, 277 KB)', emitido: '10/09/2026 16:12' },
].map(e => {
  const rows = listagem[e.data]
  const bula = rows.filter(r => /bula/i.test(r.agente))
  const fat = r2(rows.reduce((a, b) => a + b.valor, 0))
  const cob = r2(bula.reduce((a, b) => a + b.valor, 0))
  const agentes = {}
  for (const r of rows) agentes[r.agente] = r2((agentes[r.agente] || 0) + r.valor)
  return { ...e, lotes: rows.length, animais: rows.reduce((a, b) => a + (b.qtd || 0), 0), faturamento: fat,
    cobertura: cob, lotesBula: bula.length, performance: cob / fat,
    agentes: Object.entries(agentes).map(([nome, valor]) => ({ nome, valor, lotes: rows.filter(r => r.agente === nome).length })).sort((a, b) => b.valor - a.valor),
    lotesBulaLista: bula, todos30x: rows.every(r => Math.abs(r.lance * 30 * (r.qtd || 1) - r.valor) < 0.01) }
})
const faturamento = r2(etapas.reduce((a, b) => a + b.faturamento, 0))
const cobertura = r2(etapas.reduce((a, b) => a + b.cobertura, 0))
const performance = cobertura / faturamento

/* ── 2. Acordo do Camparino (aba "Acordos com Marcas" da planilha do chefe) ─ */
const PLAN = 'F:/FINANCEIRO BULA 2026 (7).xlsx'
const wb = XLSX.readFile(PLAN)
const acordosRows = XLSX.utils.sheet_to_json(wb.Sheets['Acordos com Marcas'], { header: 1, raw: false })
const iCamp = acordosRows.findIndex(r => /FAZENDA CAMPARINO/i.test(String(r[1] || '')))
const iNav = acordosRows.findIndex(r => /^NAVIRA/i.test(String(r[1] || '')))
const acordoCamparinoTexto = [acordosRows[iCamp][2], acordosRows[iCamp + 1][2], acordosRows[iCamp + 2][2], acordosRows[iCamp + 3][2]]
const acordoNaviraiTexto = acordosRows[iNav][2]
const TABELA = [
  { ate: 0.10, pct: 0.005, rotulo: '0% a 10% de cobertura' },
  { ate: 0.15, pct: 0.0075, rotulo: '10% a 15% de cobertura' },
  { ate: 0.20, pct: 0.01, rotulo: '15% a 20% de cobertura' },
  { ate: Infinity, pct: 0.015, rotulo: 'acima de 20% de cobertura' },
]
const faixa = perf => TABELA.find(t => perf <= t.ate)
const fx = faixa(performance)
const receita = r2(faturamento * fx.pct)
const receitaPorEtapa = etapas.map(e => ({ data: e.data, faturamento: e.faturamento, pct: fx.pct, receita: r2(e.faturamento * fx.pct),
  performanceIsolada: e.performance, faixaIsolada: faixa(e.performance) }))

/* ── 3. Planilha do chefe, aba Leilões (linhas 131/132) ──────────────────── */
const leil = XLSX.utils.sheet_to_json(wb.Sheets['Leilões'], { header: 1, raw: false })
const num = s => s == null || s === '' ? null : Number(String(s).replace(/[R$\s,()]/g, '')) * (/\(/.test(String(s)) ? -1 : 1)
const planilha = leil.map((r, i) => ({ linha: i + 1, r })).filter(({ r }) => /NAVIRA.*CAMPARINO/i.test(String(r[2] || '')))
  .map(({ linha, r }) => ({ linha, dia: r[0], mes: r[1], leilao: r[2], leiloeira: r[3], faturamentoRealizado: num(r[10]), vendasBula: num(r[11]), cobertura: num(r[12]),
    pctVendas: r[14], pctFat: r[15], status: r[17], receita: num(r[18]), imposto: num(r[19]) }))

/* ── 4. HastaPro: vendedor de cada lote nosso ─────────────────────────────── */
const hpCamp = hp.filter(l => /CAMPARINO/i.test(l.vendedor))
const hpNav = hp.filter(l => !/CAMPARINO/i.test(l.vendedor))
const PIST = { '260707195925645': 'Nane' }
const nomeCurto = p => !p ? '(vazio)' : /Douglas/i.test(p) ? 'Douglas Bispo' : /Omena/i.test(p) ? 'Fábio Omena' : /Lucas/i.test(p) ? 'Lucas Martins'
  : /Leonardo/i.test(p) ? 'Leonardo Serafim' : /Peralta/i.test(p) ? 'Peralta' : /Laila/i.test(p) ? 'Laila' : /Felipe Vilela/i.test(p) ? 'Bulinha' : /MARCELO MOURA/i.test(p) ? 'Marcelo Moura' : p
const hpNome = l => l.pist_nome ? nomeCurto(l.pist_nome) : (PIST[l.pist_cod] || l.pist_cod)

/* ── 5. Grupo de lances: a ficha de cada lote do Camparino ────────────────── */
const fichas = {}
for (const m of wpp) {
  const b = m.body || ''
  if (!/foi com|bula/i.test(b)) continue
  const mm = b.match(/(?:levamos|levou)?\s*(?:lt|lote)\s*(\d{1,3})/i)
  if (!mm) continue
  const lote = mm[1].padStart(2, '0')
  const dia = m.created_at < '2026-08-23T10:00:00' ? '2026-08-22' : '2026-08-23'
  const key = dia + ':' + lote
  if (!fichas[key] || /foi com/i.test(b)) fichas[key] = { quando: m.created_at, texto: b.trim() }
}

/* ── 6. Cruzamento lote a lote (os 6 do Camparino) ────────────────────────── */
const fech = sbx.fechamentos.filter(f => f.data >= '2026-08-22')
const cpAll = sbx.cp.filter(c => c.fechamento_id && fech.some(f => f.id === c.fechamento_id))
const lotesCamp = []
for (const e of etapas) for (const r of e.lotesBulaLista) {
  const lote = r.lote.padStart(2, '0')
  const h = hpCamp.find(x => x.data === e.data && x.lote.padStart(2, '0') === lote)
  const f = fech.find(x => x.data === e.data)
  const l = (f?.lances || []).find(x => String(x.lote).padStart(2, '0') === lote)
  const ficha = fichas[e.data + ':' + lote]
  const assessor = h ? hpNome(h) : (l?.assessor || '—')
  const cp = cpAll.find(c => c.fechamento_id === f?.id && new RegExp('lote ' + Number(lote) + '\\b').test(c.descricao))
  const pct = l?.comissao_pct ?? (/Lucas|Laila/i.test(assessor) ? 0.01 : 0.02)
  lotesCamp.push({ data: e.data, lote, animal: r.animal, categoria: r.categoria, lance: r.lance, valor: r.valor,
    programa: { comprador: r.comprador, agente: r.agente },
    hastapro: h ? { comprador: h.comprador, vendedor: h.vendedor, pisteiro: hpNome(h), total: h.total } : null,
    erp: l ? { assessor: l.assessor, comprador: l.comprador, vgv: l.vgv } : null,
    ficha: ficha || null, assessor, comissaoPct: pct, comissao: r2(r.valor * pct),
    cp: cp ? { descricao: cp.descricao, valor: cp.valor, status: cp.status, vencimento: cp.vencimento }
      : (/Nane/i.test(assessor) ? { descricao: 'Comissão Nane — 28º LEILÃO NAVIRAÍ CAMPARINO - REPRODUTORES (título único dos 6 lotes dela)', valor: 4440, status: 'aberto', vencimento: null } : null),
    confere: !!h && Math.abs(h.total - r.valor) < 0.01 && !!l && Math.abs(l.vgv - r.valor) < 0.01 })
}
const comissaoEquipe = r2(lotesCamp.reduce((a, b) => a + b.comissao, 0))

/* ── 7. A fatia da Naviraí (fica fora desta nota) ─────────────────────────── */
const navirai = {
  lotes: hpNav.map(l => ({ data: l.data, lote: l.lote, total: l.total, assessor: hpNome(l), comprador: l.comprador, vendedor: l.vendedor })),
  vgv: r2(hpNav.reduce((a, b) => a + b.total, 0)),
  porEtapa: ['2026-08-22', '2026-08-23'].map(d => ({ data: d, lotes: hpNav.filter(l => l.data === d).length, vgv: r2(hpNav.filter(l => l.data === d).reduce((a, b) => a + b.total, 0)) })),
  acordo: acordoNaviraiTexto, pct: 0.05,
}
navirai.receitaEstimada = r2(navirai.vgv * navirai.pct)

/* ── 8. Sensibilidades ────────────────────────────────────────────────────── */
const l132 = planilha.find(p => p.linha === 132)
const vgvFechamentos = fech.reduce((a, b) => a + Number(b.vgv_total || 0), 0)
const sens = {
  tabelaPorEtapa: { total: r2(receitaPorEtapa.reduce((a, b) => a + r2(b.faturamento * b.faixaIsolada.pct), 0)), detalhe: receitaPorEtapa },
  planilhaChefe: l132 ? { faturamento: l132.faturamentoRealizado, pct: 0.0075, receitaLinha: l132.receita, fatiaCamparino: r2(etapas[1].faturamento * 0.0075),
    performanceMista: l132.faturamentoRealizado ? Number(l132.vendasBula) / l132.faturamentoRealizado : null, vgvFechamentos } : null,
  precedente41: (() => {
    const f = sbx.fechamentos.find(x => x.id.startsWith('ebfbce96')); const cr = sbx.cr.find(c => c.fechamento_id === f.id)
    return { data: f.data, nome: f.nome, faturamento: f.faturamento_total_leilao, vgv: f.vgv_total, performance: f.vgv_total / f.faturamento_total_leilao,
      recebido: cr.valor_recebido, pctEfetivo: cr.valor_recebido / f.faturamento_total_leilao, seAplicasse: r2(faturamento * 0.0075) }
  })(),
  expozebu: (() => {
    const f = sbx.fechamentos.find(x => x.id.startsWith('c3b386fc')); const cr = sbx.cr.find(c => c.fechamento_id === f.id)
    return { data: f.data, vgv: f.vgv_total, recebido: cr.valor_recebido, pct: 0.005, faturamentoImplicito: r2(cr.valor_recebido / 0.005) }
  })(),
}

/* ── 9. Tomador da nota (lido da imagem da IE que o Marcelo mandou) ───────── */
const tomador = {
  razao: 'AGROPECUÁRIA CAMPARINO LTDA', cnpj: '51.751.163/0001-47', ie: '14.015.065-0 (MT)', natureza: '2062 – Sociedade Empresária Limitada',
  endereco: 'Rodovia MT 388, s/n – sentido a Bolívia, 25 km – Fazenda Camparino, Área Rural de Cáceres', cidade: 'Cáceres – MT', cep: '78219-899',
  telefone: '(65) 3241-1767', email: 'viacontabil@viacontabil.com.br', situacao: 'ATIVO (desde 22/08/2023)', simples: 'NÃO optante', cnae: '0151-2/01 – Criação de bovinos para corte',
  fonte: 'Comprovante de Inscrição Estadual SEFAZ/MT emitido em 17/08/2026 (imagem enviada pelo Marcelo em 11/09/2026 15:54)',
}

const dados = {
  geradoEm: new Date().toISOString().slice(0, 10),
  leiloeira: 'Paulo Horto Leilões Ltda – Londrina (Programa Leilões)', local: 'Uberaba – MG', condicao: '30 parcelas (todos os 92 lotes: valor = lance × 30)',
  pedido: { quando: '2026-09-11T15:54', quem: 'Marcelo Carneiro (DM, sessão joao-automation)',
    audio: 'Ô Joãozinho, beleza? Isso daí é a Camparino. Aí tem o relatório de leilão de todo o faturamento e tem a tabelinha, né? Vê aí quanto que é o a receber então e já pode emitir a nota e manda lá pra turma.' },
  etapas, faturamento, cobertura, performance, faixa: fx, tabela: TABELA, acordoCamparinoTexto, receita, receitaPorEtapa,
  lotesCamp, comissaoEquipe, navirai, planilha, sens, tomador,
  fechamentos: fech.map(f => ({ id: f.id, data: f.data, nome: f.nome, origem: f.origem, vgv: f.vgv_total, comissao: f.comissao_assessoria, receita: f.receita_bula, faturamento: f.faturamento_total_leilao, lances: (f.lances || []).length })),
  crExistentes: sbx.cr.filter(c => c.vencimento >= '2026-08-22').length,
  hpLeiloes: [{ lei: '260822224948509', nome: 'LEILÃO NAVIRAÍ CAMPARINO - MATRIZES ESSÊNCIA', data: '2026-08-22' }, { lei: '260823115309818', nome: '28º LEILÃO NAVIRAÍ CAMPARINO - REPRODUTORES', data: '2026-08-23' }],
}
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(dados, null, 2))
console.log('faturamento', faturamento, '| cobertura', cobertura, '| perf', (performance * 100).toFixed(3) + '%', '| faixa', fx.rotulo, fx.pct, '| receita', receita)
console.log('por etapa:', receitaPorEtapa.map(e => `${e.data} ${e.faturamento} x ${e.pct} = ${e.receita} (isolada ${(e.performanceIsolada * 100).toFixed(2)}% -> ${e.faixaIsolada.pct})`).join(' | '))
console.log('lotes Camparino:', lotesCamp.length, 'confere:', lotesCamp.filter(l => l.confere).length, '| comissao equipe', comissaoEquipe)
for (const l of lotesCamp) console.log('  ', l.data.slice(5), 'lt', l.lote, l.valor, '|', l.assessor, l.comissaoPct, l.comissao, '| CP:', l.cp?.valor, l.cp?.status, '| ficha:', l.ficha ? l.ficha.quando.slice(5, 16) : 'SEM FICHA', '| HP comp:', l.hastapro?.comprador, '| Programa comp:', l.programa.comprador)
console.log('Navirai fora:', navirai.lotes.length, 'lotes', navirai.vgv, '-> 5% =', navirai.receitaEstimada, JSON.stringify(navirai.porEtapa))
console.log('planilha:', JSON.stringify(planilha))
console.log('sens:', JSON.stringify(sens))
console.log('acordo Camparino:', acordoCamparinoTexto, '| Navirai:', acordoNaviraiTexto)
