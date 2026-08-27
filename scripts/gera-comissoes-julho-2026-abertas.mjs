/**
 * Comissoes de julho/2026 — o que falta pagar, para quem, e por que ainda esta aberto.
 *
 * Pedido do chefe em 27/08, depois que os 16.809,00 sairam do fluxo de caixa.
 *
 * O que este relatorio apura, e que nenhuma tela do ERP mostra junto:
 *
 *  1. O ciclo de julho inteiro: quanto foi gerado, quanto saiu do banco, quanto
 *     sobrou — e a diferenca entre "titulo baixado" e "PIX que saiu".
 *  2. ⭐ Os lotes 26 e 30 do EAO Baviera Femeas (990 + 930 = 1.920) foram PAGOS
 *     DUAS VEZES: estao dentro do titulo de 3.648,00 do Fabio, que o PIX de
 *     8.826,00 de 25/08 quitou, e dentro da planilha do Leonardo, que o PIX de
 *     5.262,00 do mesmo dia pagou. A prova e aritmetica: entre os 8 titulos de
 *     julho do Fabio existe UMA UNICA combinacao que soma 8.826,00 exatos, e ela
 *     inclui o titulo do EAO Femeas.
 *  3. Quem simplesmente nao recebeu: Peralta (1.080) e Laila (675) nao tem PIX
 *     nenhum em agosto — nao e divergencia, e esquecimento.
 *
 * Metodo: forca bruta de subset-sum sobre os titulos de cada assessor contra o
 * valor que efetivamente saiu do banco. E o mesmo caminho que resolveu a
 * conferencia do Douglas e a do Leonardo — quando o pagamento nao fecha com a
 * soma dos titulos, a resposta esta no nivel do LOTE, nao do titulo.
 *
 * Grava outputs/comissoes-julho-2026/dados.json.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const page = async (t, sel, f = q => q) => {
  let a = [], i = 0
  for (;;) { const { data, error } = await f(sb.from(t).select(sel)).range(i, i + 999); if (error) throw error; a = a.concat(data); if (data.length < 1000) break; i += 1000 }
  return a
}
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const D = { competencia: 'julho/2026', geradoEm: '2026-08-27' }

const cats = await page('erp_categorias', 'id,nome')
const CN = Object.fromEntries(cats.map(c => [c.id, c.nome]))
const cp = await page('erp_contas_pagar', '*')
const fech = await page('bula_leilao_fechamento', 'id,nome,data,lances,por_assessor,vgv_total')
const FE = Object.fromEntries(fech.map(f => [f.id, f]))

// A tag 'julho' nao pega tudo: o complemento do Douglas (1.792,00) foi lancado
// com tag de agosto e so a descricao diz que e de julho. Sem ele a conferencia
// do Douglas nao fecha e parece sobra de pagamento.
const jul = cp.filter(c => CN[c.categoria_id] === 'Comissões' && c.status !== 'cancelado'
  && ((c.tags || []).includes('julho') || /JULHO\/2026/i.test(c.descricao || '')))
const val = c => r2(Number(c.valor))
const pago = c => r2(Number(c.valor_pago || 0))
const linha = c => ({
  id: c.id, valor: val(c), pago: pago(c), status: c.status, vencimento: c.vencimento, dataPagamento: c.data_pagamento,
  quem: c.vendedor || null, desc: c.descricao, fechamento: c.fechamento_id,
  evento: FE[c.fechamento_id] ? { nome: FE[c.fechamento_id].nome, data: FE[c.fechamento_id].data } : null,
  diferido: (c.tags || []).includes('diferido'), obs: c.observacoes || '',
})

/* ---- normaliza o "quem": o campo vendedor as vezes vem vazio ou composto ---- */
// O campo `vendedor` e opcional e vem vazio em varios titulos; a descricao nem
// sempre segue o padrao "- NOME (2%)". Roster explicito resolve os dois casos.
const ROSTER = [
  [/NANE\s*\/\s*F[ÁA]BIO/i, 'NANE / FÁBIO OMENA'],
  [/DOUGLAS/i, 'DOUGLAS BISPO'],
  [/LEONARDO/i, 'LEONARDO SERAFIM'],
  [/F[ÁA]BIO\s+OMENA/i, 'FÁBIO OMENA'],
  [/PERALTA/i, 'PERALTA'],
  [/LAILA/i, 'LAILA OLIVEIRA'],
  [/NANE/i, 'NANE'],
  [/RUSA/i, 'GUSTAVO RUSA'],
  [/BULINHA|FELIPE ANDRADE/i, 'BULINHA (FELIPE ANDRADE)'],
]
const nomeDe = l => {
  const alvo = (l.quem || '') + ' | ' + l.desc
  for (const [re, nome] of ROSTER) if (re.test(alvo)) return nome
  return 'A DEFINIR'
}
const todos = jul.map(linha).map(l => ({ ...l, quem: nomeDe(l) }))

D.ciclo = {
  gerado: r2(todos.reduce((s, l) => s + l.valor, 0)),
  titulos: todos.length,
  baixado: r2(todos.filter(l => l.status === 'pago').reduce((s, l) => s + l.valor, 0)),
  baixadoCaixa: r2(todos.filter(l => l.status === 'pago').reduce((s, l) => s + (l.pago || l.valor), 0)),
  aberto: r2(todos.filter(l => l.status !== 'pago').reduce((s, l) => s + l.valor, 0)),
  diferido: r2(todos.filter(l => l.status !== 'pago' && l.diferido).reduce((s, l) => s + l.valor, 0)),
}
D.ciclo.vencido = r2(D.ciclo.aberto - D.ciclo.diferido)

/* ---- o que saiu do banco no ciclo de julho ------------------------------
 * Casar por descricao pega pagamento de outro mes (o PIX de 10/08 ao Rusa e
 * acerto de varios meses; o de 07/08 ao Leonardo e reembolso de viagem). Por
 * isso o par e (data, valor) EXATO — cada um conferido 1:1 no extrato.        */
const mv = await page('erp_movimentos_bancarios', 'id,data,tipo,valor,descricao', q => q.gte('data', '2026-08-01').lte('data', '2026-08-31').eq('tipo', 'saida'))
const PIX = [
  { quem: 'DOUGLAS BISPO', data: '2026-08-24', valor: 11908.00 },
  { quem: 'LEONARDO SERAFIM', data: '2026-08-25', valor: 5262.00 },
  { quem: 'FÁBIO OMENA', data: '2026-08-25', valor: 8826.00 },
]
D.saiuDoBanco = PIX.map(p => {
  const m = mv.find(x => x.data === p.data && Math.abs(Number(x.valor) - p.valor) < 0.005)
  if (!m) throw new Error('nao achei no extrato o PIX de ' + p.quem + ' (' + p.data + ', ' + p.valor + ')')
  return { quem: p.quem, valor: r2(m.valor), datas: [m.data], n: 1, descricao: m.descricao }
})
// O Rusa foi pago dentro de um acerto maior (10/08), nao num PIX so de julho.
D.rusaNota = (() => {
  const m = mv.find(x => x.data === '2026-08-10' && /RUSA ASSESSORIA/i.test(x.descricao || ''))
  return m ? { data: m.data, valor: r2(m.valor), desc: m.descricao } : null
})()

/* ---- por pessoa ---- */
const quemTodos = [...new Set(todos.map(l => l.quem))]
D.pessoas = quemTodos.map(q => {
  const t = todos.filter(l => l.quem === q)
  const banco = D.saiuDoBanco.find(b => b.quem === q)
  const devido = r2(t.reduce((s, l) => s + l.valor, 0))
  const baixado = r2(t.filter(l => l.status === 'pago').reduce((s, l) => s + l.valor, 0))
  const aberto = r2(t.filter(l => l.status !== 'pago').reduce((s, l) => s + l.valor, 0))
  const diferido = r2(t.filter(l => l.status !== 'pago' && l.diferido).reduce((s, l) => s + l.valor, 0))
  return {
    quem: q, devido, baixado, aberto, diferido, vencido: r2(aberto - diferido),
    pagoBanco: banco ? banco.valor : 0, dataBanco: banco ? banco.datas[0] : null,
    semTitulo: banco ? r2(banco.valor - baixado) : 0,
    titulos: t.sort((a, b) => b.valor - a.valor),
  }
}).sort((a, b) => b.vencido - a.vencido || b.devido - a.devido)

/* ---- subset-sum: qual conjunto de titulos explica cada PIX ---- */
function explica(titulos, alvo) {
  const n = titulos.length
  if (n > 22) return { sols: [], nota: 'conjunto grande demais para forca bruta' }
  const sols = []
  for (let m = 1; m < (1 << n); m++) {
    let s = 0, it = []
    for (let i = 0; i < n; i++) if (m & (1 << i)) { s += titulos[i].valor; it.push(i) }
    if (Math.abs(s - alvo) < 0.005) sols.push(it.map(i => titulos[i]))
  }
  return { sols, unica: sols.length === 1 }
}
// O universo do subset-sum inclui o titulo COMPARTILHADO ("NANE / FÁBIO OMENA"):
// ele nomeia o Fabio e por isso pode legitimamente estar dentro do PIX dele.
const universoDe = quem => todos.filter(l => l.quem === quem || (quem === 'FÁBIO OMENA' && /FÁBIO OMENA/.test(l.quem)))
D.conferencia = D.pessoas.filter(p => p.pagoBanco).map(p => {
  const uni = universoDe(p.quem)
  const e = explica(uni, p.pagoBanco)
  const fora = e.unica ? uni.filter(t => !e.sols[0].some(x => x.id === t.id)) : []
  return {
    quem: p.quem, pago: p.pagoBanco, devidoErp: r2(uni.reduce((s, l) => s + l.valor, 0)), dif: r2(p.pagoBanco - r2(uni.reduce((s, l) => s + l.valor, 0))),
    universo: uni.length, combinacoes: e.sols.length, unica: !!e.unica,
    inclui: e.unica ? e.sols[0].map(t => ({ valor: t.valor, desc: t.desc, diferido: t.diferido, evento: t.evento })) : [],
    fora: fora.map(t => ({ valor: t.valor, desc: t.desc, evento: t.evento })),
  }
})

/* ---- ⭐ o lote pago duas vezes ---- */
const eaoF = fech.find(f => /EAO BAVIERA/i.test(f.nome || '') && /F.MEAS|Femeas/i.test(f.nome || '') && String(f.data).startsWith('2026-07'))
D.eaoFemeas = eaoF ? {
  id: eaoF.id, nome: eaoF.nome, data: eaoF.data, vgv: r2(eaoF.vgv_total),
  lotes: (eaoF.lances || []).map(l => ({
    lote: String(l.lote), vgv: r2(l.vgv), pct: 0.02, comissao: r2(Number(l.vgv) * 0.02),
    assessor: l.assessor || '?', comprador: String(l.comprador || '').replace(/\s+/g, ' ').trim(),
  })).sort((a, b) => b.comissao - a.comissao),
} : null
// Os dois lotes que a planilha do Leonardo (26/08) reivindica e o ERP da ao Fabio.
D.disputados = D.eaoFemeas ? D.eaoFemeas.lotes.filter(l => ['26', '30'].includes(l.lote)) : []
D.disputadoTotal = r2(D.disputados.reduce((s, l) => s + l.comissao, 0))

/* ---- as duas leituras ---- */
// Usa o mesmo universo da conferencia (o do Fabio inclui o titulo compartilhado
// com a Nane), senao a leitura nao bate com a prova aritmetica da pagina ao lado.
const confDe = q => D.conferencia.find(c => c.quem === q)
const fabDev = confDe('FÁBIO OMENA').devidoErp, fabPag = confDe('FÁBIO OMENA').pago
const leoDev = confDe('LEONARDO SERAFIM').devidoErp, leoPag = confDe('LEONARDO SERAFIM').pago
D.leituras = [
  {
    chave: 'ERP', rot: 'A atribuição do ERP está certa',
    desc: 'Os lotes 26 e 30 são do Fábio, como o fechamento registra. A planilha do Leonardo cobrou lote que não é dele.',
    fabio: { devido: fabDev, pago: fabPag, saldo: r2(fabDev - fabPag) },
    leonardo: { devido: leoDev, pago: leoPag, saldo: r2(leoDev - leoPag) },
  },
  {
    chave: 'PLANILHA', rot: 'A planilha do Leonardo está certa',
    desc: 'Os lotes 26 e 30 são do Leonardo. O título do Fábio no EAO Fêmeas cai de R$ 3.648,00 para R$ 1.728,00 (só o lote M04).',
    fabio: { devido: r2(fabDev - D.disputadoTotal), pago: fabPag, saldo: r2(fabDev - D.disputadoTotal - fabPag) },
    leonardo: { devido: r2(leoDev + D.disputadoTotal), pago: leoPag, saldo: r2(leoDev + D.disputadoTotal - leoPag) },
  },
]

/* ---- classificacao do que esta aberto ---- */
const abertos = todos.filter(l => l.status !== 'pago')
const classifica = l => {
  if (l.diferido) return 'diferido'
  if (/FÁBIO OMENA$/.test(l.quem)) return 'ja-pago-sem-baixa'
  if (/LEONARDO/.test(l.quem)) return 'nao-cobrado'
  if (/A DEFINIR/.test(l.quem)) return 'sem-dono'
  return 'nao-pago'
}
const ROTULO = {
  'diferido': 'Diferido para dezembro (regra da Nane)',
  'ja-pago-sem-baixa': 'Já pago em 25/08 — falta baixar o título',
  'nao-cobrado': 'O assessor não cobrou na planilha dele',
  'sem-dono': 'Sem assessor definido',
  'nao-pago': 'Devido e não pago — sem PIX nenhum',
}
D.grupos = Object.entries(abertos.reduce((acc, l) => {
  const k = classifica(l); (acc[k] = acc[k] || []).push(l); return acc
}, {})).map(([k, v]) => ({
  chave: k, rot: ROTULO[k], total: r2(v.reduce((s, l) => s + l.valor, 0)), n: v.length,
  itens: v.sort((a, b) => b.valor - a.valor),
})).sort((a, b) => b.total - a.total)

/* ---- o que fazer, em dinheiro ---- */
D.acao = {
  pagarAgora: r2(D.grupos.filter(g => ['nao-pago', 'nao-cobrado'].includes(g.chave)).reduce((s, g) => s + g.total, 0)),
  baixarSemCaixa: r2((D.grupos.find(g => g.chave === 'ja-pago-sem-baixa') || { total: 0 }).total),
  aRecuperar: D.disputadoTotal,
  decidir: r2((D.grupos.find(g => g.chave === 'sem-dono') || { total: 0 }).total),
  dezembro: r2((D.grupos.find(g => g.chave === 'diferido') || { total: 0 }).total),
}

const OUT = 'outputs/comissoes-julho-2026'
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(D, null, 2))

const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
console.log('CICLO DE JULHO: gerado ' + brl(D.ciclo.gerado) + ' em ' + D.ciclo.titulos + ' títulos')
console.log('  baixado ' + brl(D.ciclo.baixado) + ' | aberto ' + brl(D.ciclo.aberto) + ' (vencido ' + brl(D.ciclo.vencido) + ' + diferido ' + brl(D.ciclo.diferido) + ')')
console.log('\nPOR PESSOA')
for (const p of D.pessoas) console.log('  ' + p.quem.padEnd(26) + ' devido ' + brl(p.devido).padStart(10) + ' | banco ' + brl(p.pagoBanco).padStart(10) + ' | baixado ' + brl(p.baixado).padStart(10) + ' | aberto ' + brl(p.aberto).padStart(10))
console.log('\nCONFERÊNCIA PIX x TÍTULOS')
for (const c of D.conferencia) console.log('  ' + c.quem.padEnd(26) + ' pago ' + brl(c.pago).padStart(10) + ' | ERP ' + brl(c.devidoErp).padStart(10) + ' | dif ' + brl(c.dif).padStart(10) + ' | combinações exatas: ' + c.combinacoes + (c.unica ? '  (única — fora: ' + c.fora.map(f => brl(f.valor)).join(', ') + ')' : ''))
console.log('\nLOTES DISPUTADOS (EAO Baviera Fêmeas): ' + brl(D.disputadoTotal))
for (const l of D.disputados) console.log('  lote ' + l.lote + '  VGV ' + brl(l.vgv) + '  2% = ' + brl(l.comissao) + '  ERP dá a ' + l.assessor + '  | comprador: ' + l.comprador.slice(0, 40))
console.log('\nO QUE ESTÁ ABERTO')
for (const g of D.grupos) console.log('  ' + brl(g.total).padStart(11) + '  ' + g.rot + ' (' + g.n + ')')
console.log('\nAÇÃO: pagar agora ' + brl(D.acao.pagarAgora) + ' | baixar sem caixa ' + brl(D.acao.baixarSemCaixa) + ' | recuperar ' + brl(D.acao.aRecuperar) + ' | decidir ' + brl(D.acao.decidir) + ' | dezembro ' + brl(D.acao.dezembro))
console.log('\ndados.json em ' + OUT)
