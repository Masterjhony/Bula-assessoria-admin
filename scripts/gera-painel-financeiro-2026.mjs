/**
 * PAINEL FINANCEIRO 2026 — calcula os dados das abas do Google Sheets.
 *
 * Fontes, e quem ganha em cada campo:
 *   · CAIXA / CP / CR    → ERP (erp_movimentos_bancarios conciliado, erp_contas_*)
 *   · VGV / lotes        → ERP (bula_leilao_fechamento, auditado contra HastaPro)
 *   · RECEITA por leilão → planilha FINANCEIRO BULA 2026 do chefe. O ERP tem
 *     receita_bula zerada em jan–mar e em quase toda agosto, então ele não pode
 *     ser a fonte aqui. O valor do ERP vai junto como coluna de conferência e a
 *     diferença vira linha na aba Divergências — nada é escondido.
 *
 * Saída: outputs/painel-financeiro-2026/dados.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'
import XLSX from 'xlsx'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const WB = '.apuracao/financeiro-bula-2026-09-04.xlsx'
const HOJE = '2026-09-04'
const r2 = n => Math.round((Number(n) || 0) * 100) / 100
const iso = d => d ? new Date(d).toISOString().slice(0, 10) : null

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const Q = async sql => (await c.query(sql)).rows

/* ── 1. ERP ──────────────────────────────────────────────────────────────── */
const contas = await Q(`select nome, saldo_inicial::float si, saldo_atual::float sa, tipo
  from erp_contas_bancarias where ativo order by nome`)
const conciliadoAte = (await Q(`select max(data)::date d from erp_movimentos_bancarios
  where status_conciliacao='conciliado'`))[0].d
const saldoCaixa = r2(contas.reduce((s, x) => s + x.sa, 0))

const movMes = await Q(`
  select to_char(m.data,'YYYY-MM') mes, coalesce(cat.dre_grupo,'(sem)') g,
    sum(case when m.tipo='entrada' then m.valor else 0 end)::float entrada,
    sum(case when m.tipo='saida'   then m.valor else 0 end)::float saida
  from erp_movimentos_bancarios m left join erp_categorias cat on cat.id=m.categoria_id
  group by 1,2 order by 1,2`)

const cr = await Q(`
  select r.id, r.descricao, r.valor::float valor, coalesce(r.valor_recebido,0)::float recebido,
    (r.valor-coalesce(r.desconto,0)+coalesce(r.juros,0)+coalesce(r.multa,0)-coalesce(r.valor_recebido,0))::float devido,
    r.status, r.vencimento::date venc, r.origem, p.nome cliente,
    f.nome fech_nome, f.data::date fech_data
  from erp_contas_receber r
  left join erp_pessoas p on p.id=r.cliente_id
  left join bula_leilao_fechamento f on f.id=r.fechamento_id
  where r.status in ('aberto','parcial','vencido') and r.substituido_por is null
  order by r.vencimento`)

const cp = await Q(`
  select p.id, p.descricao, p.valor::float valor,
    (p.valor-coalesce(p.desconto,0)+coalesce(p.juros,0)+coalesce(p.multa,0)-coalesce(p.valor_pago,0))::float devido,
    p.status, p.vencimento::date venc, p.origem,
    f.nome fornecedor, cat.nome categoria, cat.dre_grupo
  from erp_contas_pagar p
  left join erp_pessoas f on f.id=p.fornecedor_id
  left join erp_categorias cat on cat.id=p.categoria_id
  where p.status in ('aberto','parcial','vencido') and p.substituido_por is null
  order by p.vencimento`)

const fech = await Q(`
  select id, nome, data::date d, vgv_total::float vgv, coalesce(receita_bula,0)::float receita,
    lotes_vendidos lotes, faturamento_total_leilao::float fat
  from bula_leilao_fechamento where data>='2026-01-01' order by data`)
await c.end()

/* ── 2. Planilha do chefe ────────────────────────────────────────────────── */
const wbFormulas = XLSX.readFile(WB, { cellFormula: true })
const wb = XLSX.readFile(WB)
const MESES = { JANEIRO: 1, FEVEREIRO: 2, 'MARÇO': 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 }
const NOMEMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const L = XLSX.utils.sheet_to_json(wb.Sheets['Leilões'], { header: 1, raw: true, defval: null })
const num = v => (typeof v === 'number' && isFinite(v)) ? v : null
let mesAtual = null
const leiloes = []
for (let i = 1; i < L.length; i++) {
  const r = L[i]; if (!r) continue
  const nome = r[2]; if (typeof nome !== 'string' || !nome.trim() || /^TOTAL/i.test(nome)) continue
  if (typeof r[1] === 'string' && MESES[r[1].trim().toUpperCase()]) mesAtual = MESES[r[1].trim().toUpperCase()]
  leiloes.push({
    linha: i + 1, dia: r[0], mes: mesAtual, nome: nome.trim(), leiloeira: (r[3] || '').toString().trim(),
    prev_fat: num(r[5]), meta_venda: num(r[6]), meta_cobertura: num(r[7]), meta_comissao: num(r[8]),
    fat: num(r[10]), vendas: num(r[11]), pct_vendas: num(r[14]), pct_fat: num(r[15]),
    status: (r[17] || '').toString().trim(), receita: num(r[18]), imposto: num(r[19]),
    comissao: num(r[20]), lucro: num(r[21]), obs: (r[22] || '').toString().trim(),
  })
}

/* DRE mensal do chefe (jan–ago preenchidos) */
const D = XLSX.utils.sheet_to_json(wb.Sheets['DRE'], { header: 1, raw: true, defval: null })
const acha = rot => D.find(r => r && typeof r[0] === 'string' && r[0].trim().toUpperCase().startsWith(rot)) || []
const COLM = [null, 2, 5, 8, 11, 14, 17, 20, 23] // jan..ago
const serie = rot => { const l = acha(rot); const o = {}; for (let m = 1; m <= 8; m++) o[m] = num(l[COLM[m]]) || 0; return o }
const dre = {
  receita: serie('RECEITA BRUTA'), imposto: serie('(-) IMPOSTO'),
  receita_liq: serie('RECEITA LÍQUIDA'), comissoes: serie('(-) CUSTOS DE COMISSÃO'),
  margem: serie('MARGEM DE CONTRIBUIÇÃO'), fixas: serie('(-) DESPESAS FIXAS'),
  variaveis: serie('(-) DESPESAS VARIÁVEIS'), lucro: serie('(-) LUCRO LÍQUIDO'),
}

/* ── 3. Casamento leilão × fechamento ────────────────────────────────────── */
const norm = s => (s || '').toString().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Z0-9 ]/g, ' ').replace(/\b(LEILAO|LEILOES|DE|DO|DA|DOS|DAS|E|O|A|MEGA|VIRTUAL|ESPECIAL)\b/g, ' ')
  .replace(/\s+/g, ' ').trim()
const toks = s => new Set(norm(s).split(' ').filter(t => t.length > 2))
const sim = (a, b) => { const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0; let i = 0; for (const t of A) if (B.has(t)) i++; return i / Math.min(A.size, B.size) }
const usados = new Set()
for (const l of leiloes.filter(x => x.mes && x.mes <= 8 && (x.receita || x.fat || x.vendas))) {
  let best = null, bs = 0
  for (const f of fech) {
    if (usados.has(f.id)) continue
    const dt = new Date(f.d), dm = dt.getUTCMonth() + 1
    if (Math.abs(dm - l.mes) > 1) continue
    const sc = sim(l.nome, f.nome) + (l.dia && dt.getUTCDate() === Number(l.dia) ? 0.25 : 0) + (dm === l.mes ? 0.1 : 0)
    if (sc > bs) { bs = sc; best = f }
  }
  if (best && bs >= 0.75) { l.erp = { id: best.id, nome: best.nome, d: iso(best.d), vgv: best.vgv, receita: best.receita, lotes: best.lotes }; usados.add(best.id) }
}
const fechSemLinha = fech.filter(f => !usados.has(f.id))

/* ── 4. Vencimento acordado × automático (leilão + 45 dias) ──────────────── */
for (const t of cr) {
  t.venc = iso(t.venc); t.fech_data = iso(t.fech_data)
  if (t.fech_data) {
    const auto = new Date(t.fech_data + 'T00:00:00Z'); auto.setUTCDate(auto.getUTCDate() + 45)
    t.venc_automatico = Math.abs(new Date(t.venc + 'T00:00:00Z') - auto) < 86400000 * 2
  } else t.venc_automatico = false
}
for (const t of cp) t.venc = iso(t.venc)

/* ── 5. Fluxo de caixa diário ────────────────────────────────────────────────
 * O que já venceu NÃO é realocado para hoje. Realocar é o gerador decidindo a
 * data de pagamento no lugar de quem paga — foi o erro da v1 do relatório de
 * 27/08. O vencido sai num bloco próprio, fora do saldo projetado.
 */
const addDias = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const vencidos = {
  cr: cr.filter(t => t.venc < HOJE), cp: cp.filter(t => t.venc < HOJE),
}
vencidos.cr_total = r2(vencidos.cr.reduce((s, t) => s + t.devido, 0))
vencidos.cp_total = r2(vencidos.cp.reduce((s, t) => s + t.devido, 0))

const fluxo = []
let sConserv = saldoCaixa, sTotal = saldoCaixa
for (let i = 0; i <= 118; i++) {
  const d = addDias(HOJE, i)
  const entHoje = cr.filter(t => t.venc === d)
  const saiHoje = cp.filter(t => t.venc === d)
  const eA = r2(entHoje.filter(t => !t.venc_automatico).reduce((s, t) => s + t.devido, 0))
  const eT = r2(entHoje.reduce((s, t) => s + t.devido, 0))
  const sT = r2(saiHoje.reduce((s, t) => s + t.devido, 0))
  sConserv = r2(sConserv + eA - sT); sTotal = r2(sTotal + eT - sT)
  if (eT || sT || i === 0 || d.slice(8) === '01') fluxo.push({
    data: d, entrada_acordada: eA, entrada_total: eT, saida: sT,
    saldo_conservador: sConserv, saldo_total: sTotal,
    itens_entrada: entHoje.map(t => ({ d: t.descricao, v: r2(t.devido), auto: t.venc_automatico })),
    itens_saida: saiHoje.map(t => ({ d: t.descricao, v: r2(t.devido), origem: t.origem })),
  })
}
const piorDia = fluxo.reduce((a, f) => f.saldo_conservador < a.saldo_conservador ? f : a, fluxo[0])

/* ── 6. Previsto x realizado, mês a mês ──────────────────────────────────── */
const porMesPl = {}, porMesErp = {}
for (const l of leiloes) {
  if (!l.mes) continue
  const p = porMesPl[l.mes] = porMesPl[l.mes] || { n: 0, fat: 0, vendas: 0, receita: 0, comissao: 0, meta_com: 0, prev_fat: 0, meta_venda: 0 }
  p.n++; p.fat += l.fat || 0; p.vendas += l.vendas || 0; p.receita += l.receita || 0
  p.comissao += l.comissao || 0; p.meta_com += l.meta_comissao || 0
  p.prev_fat += l.prev_fat || 0; p.meta_venda += l.meta_venda || 0
}
for (const f of fech) {
  const m = new Date(f.d).getUTCMonth() + 1
  const p = porMesErp[m] = porMesErp[m] || { n: 0, vgv: 0, receita: 0, lotes: 0 }
  p.n++; p.vgv += f.vgv; p.receita += f.receita; p.lotes += f.lotes || 0
}
const caixaMes = {}
for (const r of movMes) {
  if (r.mes.slice(0, 4) !== '2026') continue
  const m = Number(r.mes.slice(5))
  const o = caixaMes[m] = caixaMes[m] || { receita: 0, imposto: 0, custo: 0, fixa: 0, variavel: 0, financeiro: 0 }
  if (r.g === 'receita') o.receita += r.entrada
  else if (r.g === 'imposto') o.imposto += r.saida - r.entrada
  else if (r.g === 'custo_direto') o.custo += r.saida
  else if (r.g === 'despesa_fixa') o.fixa += r.saida
  else if (r.g === 'despesa_variavel') o.variavel += r.saida
  else if (r.g === 'financeiro') o.financeiro += r.saida - r.entrada
}

const meses = []
for (let m = 1; m <= 12; m++) {
  const pl = porMesPl[m] || {}, er = porMesErp[m] || {}, cx = caixaMes[m] || {}
  meses.push({
    mes: m, nome: NOMEMES[m],
    prev_faturamento: r2(pl.prev_fat || 0), meta_venda: r2(pl.meta_venda || 0), meta_comissao: r2(pl.meta_com || 0),
    fat_realizado: r2(pl.fat || 0), vendas_bula: r2(pl.vendas || 0),
    receita_competencia: r2(pl.receita || 0), receita_erp: r2(er.receita || 0),
    vgv_erp: r2(er.vgv || 0), leiloes_erp: er.n || 0, lotes_erp: er.lotes || 0, leiloes_planilha: pl.n || 0,
    caixa_receita: r2(cx.receita || 0), caixa_imposto: r2(cx.imposto || 0), caixa_custo: r2(cx.custo || 0),
    caixa_fixa: r2(cx.fixa || 0), caixa_variavel: r2(cx.variavel || 0), caixa_financeiro: r2(cx.financeiro || 0),
    dre_receita: r2(dre.receita[m] || 0), dre_imposto: r2(dre.imposto[m] || 0), dre_comissoes: r2(dre.comissoes[m] || 0),
    dre_fixas: r2(dre.fixas[m] || 0), dre_variaveis: r2(dre.variaveis[m] || 0), dre_lucro: r2(dre.lucro[m] || 0),
  })
}

/* ── 7. Divergências ─────────────────────────────────────────────────────── */
const div = []
const add = (sev, tema, desc, valor, fonte, acao) =>
  div.push({ sev, tema, desc, valor: valor == null ? null : r2(valor), fonte, acao })

{ // erro de range no total da planilha do chefe
  const ws = wbFormulas.Sheets['Leilões']
  const somaImp = leiloes.reduce((s, l) => s + (l.imposto || 0), 0)
  const somaLuc = leiloes.reduce((s, l) => s + (l.lucro || 0), 0)
  const decl = L[165]
  add('ALTA', 'Planilha do chefe',
    `Total 2026 do IMPOSTO soma só até a linha 114 (${ws.T166 && ws.T166.f}), mas os dados vão até a 165 — o bloco inteiro de agosto fica fora`,
    somaImp - Number(decl[19]), 'FINANCEIRO BULA 2026 › Leilões › T166', 'Corrigir a fórmula para SUM(T2:T165)')
  add('ALTA', 'Planilha do chefe',
    `Total 2026 do LUCRO BRUTO tem o mesmo range curto (${ws.V166 && ws.V166.f})`,
    somaLuc - Number(decl[21]), 'FINANCEIRO BULA 2026 › Leilões › V166', 'Corrigir a fórmula para SUM(V2:V165)')
}
add('ALTA', 'Fluxo de caixa do chefe',
  'A FLCX Set/26 projeta a folha de agosto (50.451,61) saindo em 03/09, mas ela já saiu em 01/09 em 9 PIX conciliados (47.951,61) e nada ficou em aberto',
  47951.61, 'FLCX Set26 × erp_movimentos_bancarios 01/09',
  'Retirar a linha — a próxima folha só vence em 05/10, e agora vale 49.500')
for (const l of leiloes.filter(x => x.erp && Math.abs((x.receita || 0) - (x.erp.receita || 0)) > 0.5)) {
  const d = (l.receita || 0) - (l.erp.receita || 0)
  add(Math.abs(d) > 10000 ? 'ALTA' : 'MEDIA', 'Receita por leilão',
    `${NOMEMES[l.mes]} · ${l.nome}`, d, 'Leilões × bula_leilao_fechamento.receita_bula',
    l.erp.receita === 0 ? 'ERP sem receita apurada — lançar o fechamento' : 'Conferir qual base está certa')
}
for (const f of fechSemLinha)
  add('MEDIA', 'Cobertura', `Fechamento no ERP sem linha na planilha: ${iso(f.d)} ${f.nome} (VGV ${f.vgv.toFixed(2)})`,
    f.receita, 'bula_leilao_fechamento', 'Incluir na planilha ou confirmar que é duplicata')
for (const l of leiloes.filter(x => x.mes && x.mes <= 8 && !x.erp && (x.receita || 0) > 0))
  add('MEDIA', 'Cobertura', `Linha da planilha sem fechamento no ERP: ${NOMEMES[l.mes]} · ${l.nome}`,
    l.receita, 'Leilões', 'Criar o fechamento no ERP, ou marcar como parcela de outro')
{
  const auto = cr.filter(t => t.venc_automatico)
  add('ALTA', 'Contas a receber',
    `${auto.length} título(s) com vencimento AUTOMÁTICO (leilão + 45 dias) em vez de data combinada — a projeção de caixa nessas datas é chute`,
    auto.reduce((s, t) => s + t.devido, 0), 'erp_contas_receber × data do fechamento',
    'Confirmar a data com cada leiloeira e gravar no título')
}
const ORDEM = { ALTA: 0, MEDIA: 1, BAIXA: 2 }
div.sort((a, b) => (ORDEM[a.sev] - ORDEM[b.sev]) || (Math.abs(b.valor || 0) - Math.abs(a.valor || 0)))

const dados = {
  gerado_em: new Date().toISOString(), hoje: HOJE, conciliado_ate: iso(conciliadoAte),
  contas, saldo_caixa: saldoCaixa, leiloes, fech, fechSemLinha, cr, cp, fluxo, vencidos, piorDia, meses, dre, div,
  totais: {
    cr_aberto: r2(cr.reduce((s, t) => s + t.devido, 0)),
    cr_vencido: r2(cr.filter(t => t.venc < HOJE).reduce((s, t) => s + t.devido, 0)),
    cr_data_acordada: r2(cr.filter(t => !t.venc_automatico).reduce((s, t) => s + t.devido, 0)),
    cp_aberto: r2(cp.reduce((s, t) => s + t.devido, 0)),
    cp_real: r2(cp.filter(t => t.origem === 'real').reduce((s, t) => s + t.devido, 0)),
    cp_estimativa: r2(cp.filter(t => t.origem !== 'real').reduce((s, t) => s + t.devido, 0)),
    cp_vencido: r2(cp.filter(t => t.venc < HOJE).reduce((s, t) => s + t.devido, 0)),
    receita_ano_planilha: r2(leiloes.reduce((s, l) => s + (l.receita || 0), 0)),
    receita_ano_erp: r2(fech.reduce((s, f) => s + f.receita, 0)),
    vgv_ano: r2(fech.reduce((s, f) => s + f.vgv, 0)),
    faturamento_ano: r2(leiloes.reduce((s, l) => s + (l.fat || 0), 0)),
    vendas_ano: r2(leiloes.reduce((s, l) => s + (l.vendas || 0), 0)),
    folha_mensal: 49500,
  },
}
writeFileSync('outputs/painel-financeiro-2026/dados.json', JSON.stringify(dados, null, 1))
console.log('OK — dados.json gravado')
console.log('  caixa', dados.saldo_caixa, '| conciliado até', dados.conciliado_ate)
console.log('  CR aberto', dados.totais.cr_aberto, '(data acordada', dados.totais.cr_data_acordada + ')')
console.log('  CP aberto', dados.totais.cp_aberto, '(real', dados.totais.cp_real, '| estimativa', dados.totais.cp_estimativa + ')')
console.log('  receita ano: planilha', dados.totais.receita_ano_planilha, '× ERP', dados.totais.receita_ano_erp)
console.log('  leilões planilha', leiloes.length, '| fechamentos ERP', fech.length, '| divergências', div.length)
