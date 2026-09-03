/**
 * Calcula a posicao de caixa de setembro/2026 e a previsao ate 20/09.
 * Le TUDO do ERP (nenhum numero escrito a mao aqui) e grava
 * outputs/caixa-setembro-2026/dados.json. Quem desenha e render-*.mjs.
 *
 * Regras herdadas do relatorio de 27/08 (memoria relatorio-fluxo-27ago-10set):
 *  - A linha do caixa so recebe obrigacao com DATA e recebivel que tenha data.
 *  - Titulo vencido NAO e realocado para "amanha": quem define data de
 *    pagamento e o Joao. Vencido vira quadro proprio, fora da linha.
 *  - Pedido explicito do Joao em 03/09: os leiloes da E-RURAL e do EAO estao
 *    SEM DATA PREVISTA de pagamento -> saem da linha e viram quadro proprio.
 *  - Despesa de leilao presencial cai no caixa ~10 dias depois do pregao, pela
 *    media historica por evento; entra como quadro, nao na linha.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const HOJE = '2026-09-03'
const FIM = '2026-09-20'
const CONTA_SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const r2 = n => Math.round(Number(n) * 100) / 100
const dias = (de, ate) => { const o = []; const d = new Date(de + 'T12:00:00Z'); const f = new Date(ate + 'T12:00:00Z'); while (d <= f) { o.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) } return o }

// ---------------------------------------------------------------------------
// 1. Caixa de hoje
// ---------------------------------------------------------------------------
const { data: contas } = await sb.from('erp_contas_bancarias').select('id,nome,saldo_atual').order('nome')
const caixa = {
  sicoob: r2(contas.find(c => c.id === CONTA_SICOOB).saldo_atual),
  sicrediCC: r2(contas.find(c => /Sicredi - Conta Corrente/i.test(c.nome)).saldo_atual),
  sicrediInv: r2(contas.find(c => /Investimentos/i.test(c.nome)).saldo_atual),
}
caixa.sicredi = r2(caixa.sicrediCC + caixa.sicrediInv)
caixa.total = r2(caixa.sicoob + caixa.sicredi)

// ---------------------------------------------------------------------------
// 2. O que ja andou em setembro (01-02/09), do extrato
// ---------------------------------------------------------------------------
const { data: cats } = await sb.from('erp_categorias').select('id,nome')
const mapCat = new Map(cats.map(c => [c.id, c.nome]))
const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('data,tipo,valor,descricao,categoria_id,conta_bancaria_id')
  .eq('conta_bancaria_id', CONTA_SICOOB).gte('data', '2026-09-01').lte('data', HOJE).order('data')

const realizado = movs.map(m => ({
  data: m.data, tipo: m.tipo, valor: r2(m.valor),
  categoria: mapCat.get(m.categoria_id) || '(sem categoria)',
  rot: String(m.descricao),
}))
const ehTransf = x => /Transferencias Internas/i.test(x.categoria)
const realEntradas = r2(realizado.filter(x => x.tipo === 'entrada' && !ehTransf(x)).reduce((s, x) => s + x.valor, 0))
const realSaidas = r2(realizado.filter(x => x.tipo === 'saida' && !ehTransf(x)).reduce((s, x) => s + x.valor, 0))
const realTransf = r2(realizado.filter(x => x.tipo === 'entrada' && ehTransf(x)).reduce((s, x) => s + x.valor, 0))
const saldo3108 = r2(caixa.sicoob - realEntradas - realTransf + realSaidas)

// ---------------------------------------------------------------------------
// 3. Saidas com data ate 20/09 (contas a pagar em aberto)
// ---------------------------------------------------------------------------
const { data: cpAberto } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,valor_pago,vencimento,status,origem,categoria_id')
  .in('status', ['aberto', 'vencido', 'parcial']).lte('vencimento', '2026-09-30').order('vencimento')

const cpTodos = cpAberto.map(t => ({
  id: t.id, rot: t.descricao, valor: r2(Number(t.valor) - Number(t.valor_pago || 0)),
  venc: t.vencimento, status: t.status, origem: t.origem,
  categoria: mapCat.get(t.categoria_id) || '(sem categoria)',
})).filter(t => t.valor > 0.005)

const cpVencido = cpTodos.filter(t => t.venc < HOJE)
const cpJanela = cpTodos.filter(t => t.venc >= HOJE && t.venc <= FIM)
const cpDepois = cpTodos.filter(t => t.venc > FIM)
const somaCpVencido = r2(cpVencido.reduce((s, t) => s + t.valor, 0))
const somaCpJanela = r2(cpJanela.reduce((s, t) => s + t.valor, 0))
const somaCpDepois = r2(cpDepois.reduce((s, t) => s + t.valor, 0))

// ---------------------------------------------------------------------------
// 4. Entradas: contas a receber em aberto, separando E-RURAL/EAO (sem data)
// ---------------------------------------------------------------------------
const { data: pessoas } = await sb.from('erp_pessoas').select('id,nome')
const mapPes = new Map(pessoas.map(p => [p.id, p.nome]))
const { data: crAberto } = await sb.from('erp_contas_receber')
  .select('id,descricao,valor,valor_recebido,vencimento,status,cliente_id,observacoes')
  .in('status', ['aberto', 'vencido', 'parcial']).order('vencimento')

// "sem data prevista" declarado pelo Joao em 03/09: E-RURAL e EAO.
const ehEao = d => /EAO BAVIERA/i.test(d)
const crTodos = crAberto.map(t => {
  const cliente = mapPes.get(t.cliente_id) || ''
  const semData = ehEao(t.descricao) || /E-?RURAL/i.test(cliente)
  return {
    id: t.id, rot: t.descricao, cliente: cliente || '—',
    valor: r2(Number(t.valor) - Number(t.valor_recebido || 0)),
    bruto: r2(t.valor), recebido: r2(t.valor_recebido || 0),
    venc: t.vencimento, status: t.status,
    grupo: semData ? (ehEao(t.descricao) ? 'EAO' : 'E-RURAL') : null,
  }
}).filter(t => t.valor > 0.005)

const crSemData = crTodos.filter(t => t.grupo)
const crComData = crTodos.filter(t => !t.grupo)
const crVencido = crComData.filter(t => t.venc < HOJE)
const crJanela = crComData.filter(t => t.venc >= HOJE && t.venc <= FIM)
const crDepois = crComData.filter(t => t.venc > FIM)
const somaCrSemData = r2(crSemData.reduce((s, t) => s + t.valor, 0))
const somaCrVencido = r2(crVencido.reduce((s, t) => s + t.valor, 0))
const somaCrJanela = r2(crJanela.reduce((s, t) => s + t.valor, 0))
const somaCrDepois = r2(crDepois.reduce((s, t) => s + t.valor, 0))

// ---------------------------------------------------------------------------
// 5. Custo estrutural difuso: media medida do extrato (jul+ago) que nao esta
//    lancada como titulo. Mesma regra do relatorio de 27/08.
// ---------------------------------------------------------------------------
const { data: mvHist } = await sb.from('erp_movimentos_bancarios')
  .select('data,tipo,valor,categoria_id').gte('data', '2026-07-01').lte('data', '2026-08-31')
const CAT_FORA = /Transferencias Internas|Comissões|Impostos e Taxas|Folha de Pagamento|Remuneracao de Socio|Aplicacao Financeira|Pagamento Fatura|Repasse Assessorias/i
const CAT_LEILAO = /Despesa Operacional Leilão|Viagem\/Passagens/i
const estrutural2m = r2(mvHist.filter(m => m.tipo === 'saida')
  .filter(m => { const n = mapCat.get(m.categoria_id) || ''; return !CAT_FORA.test(n) && !CAT_LEILAO.test(n) })
  .reduce((s, m) => s + Number(m.valor), 0))
const estruturalDia = r2(estrutural2m / 2 / 30.5)
const janelaDias = dias(HOJE, FIM).length
const estruturalJanelaBruto = r2(estruturalDia * janelaDias)
// O offset tem de usar a MESMA regra da media: fora impostos/folha/comissao e
// fora as rubricas de leilao (senao a hospedagem do Villa Cerrado abateria um
// custo estrutural que ela nao e).
const estruturalLancado = r2(cpJanela
  .filter(t => !/Impostos|Folha|Comiss/i.test(t.categoria) && !CAT_LEILAO.test(t.categoria))
  .reduce((s, t) => s + t.valor, 0))
const estruturalDifuso = r2(Math.max(0, estruturalJanelaBruto - estruturalLancado))

// ---------------------------------------------------------------------------
// 6. Despesa de leilao presencial: pregao + 10 dias, media medida por evento
// ---------------------------------------------------------------------------
const leilaoGasto2m = r2(mvHist.filter(m => m.tipo === 'saida')
  .filter(m => CAT_LEILAO.test(mapCat.get(m.categoria_id) || '')).reduce((s, m) => s + Number(m.valor), 0))
const { data: leiloes } = await sb.from('bula_leiloes')
  .select('data,nome,leiloeira,modelo,local').gte('data', '2026-07-01').lte('data', '2026-09-30').order('data')
// ATENCAO: o campo `modelo` de bula_leiloes esta VAZIO em todo julho, entao
// contar presenciais por ele daria media por evento inflada (49.429,85 / 3).
// Enquanto o campo nao for preenchido, a despesa de leilao entra pela MEDIA
// MENSAL MEDIDA no extrato, rateada na janela — medida, nao arbitrada.
const presenciaisHist = leiloes.filter(l => l.data <= '2026-08-31' && /PRESENCIAL/i.test(String(l.modelo || '')))
const leilaoDia = r2(leilaoGasto2m / 2 / 30.5)
const maisDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
// Os presenciais continuam listados: e por eles que o reembolso chega (pregao
// + ~10 dias), e o quadro mostra quais caem dentro da janela.
const presenciais = leiloes.filter(l => /PRESENCIAL/i.test(String(l.modelo || '')) && l.data >= '2026-08-25')
  .map(l => ({ data: l.data, nome: l.nome, leiloeira: l.leiloeira || '—', local: l.local || '', caixa: maisDias(l.data, 10) }))
  .map(p => ({ ...p, dentro: p.caixa >= HOJE && p.caixa <= FIM }))
const leilaoJanela = r2(leilaoDia * janelaDias)

// ---------------------------------------------------------------------------
// 7. A linha do caixa, dia a dia
// ---------------------------------------------------------------------------
// Regra do relatorio de 27/08: titulo VENCIDO nao e realocado para "amanha" —
// isso seria o gerador decidindo por quem paga. Fica fora da linha BASE e vira
// cenario proprio, so para medir de quanto e o risco.
function linha({ comVencidoCP = false, comCrJanela = true, comEstrutural = true, comLeilao = true, entradasExtra = [] }) {
  const pts = []
  let saldo = caixa.total
  for (const d of dias(HOJE, FIM)) {
    let ent = 0, sai = 0
    if (comCrJanela) ent += crJanela.filter(t => t.venc === d).reduce((s, t) => s + t.valor, 0)
    ent += entradasExtra.filter(e => e.data === d).reduce((s, e) => s + e.valor, 0)
    sai += cpJanela.filter(t => t.venc === d).reduce((s, t) => s + t.valor, 0)
    if (comVencidoCP && d === '2026-09-05') sai += somaCpVencido
    if (comEstrutural) sai += estruturalDifuso / janelaDias
    if (comLeilao) sai += leilaoJanela / janelaDias
    saldo = r2(saldo + ent - sai)
    pts.push({ data: d, entradas: r2(ent), saidas: r2(sai), saldo })
  }
  return pts
}

const cenarios = [
  { chave: 'BASE', rot: 'Base — só o que tem data na janela', opts: {} },
  { chave: 'COM_VENCIDO', rot: 'Pagando as comissões vencidas de 25/08', opts: { comVencidoCP: true } },
  { chave: 'SO_FIRME', rot: 'Só JMP + Mafra (o resto atrasa)', opts: { comCrJanela: false, entradasExtra: crJanela.filter(t => /JMP|MAFRA/i.test(t.rot)).map(t => ({ data: t.venc, valor: t.valor })) } },
  { chave: 'SEM_JMP', rot: 'JMP atrasa (não entra na janela)', opts: { comCrJanela: false, entradasExtra: crJanela.filter(t => !/JMP/i.test(t.rot)).map(t => ({ data: t.venc, valor: t.valor })) } },
  { chave: 'SO_CAIXA', rot: 'Nada entra (só o que já está em caixa)', opts: { comCrJanela: false } },
].map(c => {
  const pts = linha(c.opts)
  const fundo = pts.reduce((a, p) => Math.min(a, p.saldo), Infinity)
  return {
    chave: c.chave, rot: c.rot, pts,
    final: pts[pts.length - 1].saldo, fundo: r2(fundo),
    diaFundo: pts.find(p => p.saldo === fundo)?.data,
    negativos: pts.filter(p => p.saldo < 0).length,
  }
})

const D = {
  hoje: HOJE, fim: FIM, janelaDias, gerado: new Date().toISOString(),
  caixa, saldo3108,
  realizado, realEntradas, realSaidas, realTransf,
  cpVencido, cpJanela, cpDepois, somaCpVencido, somaCpJanela, somaCpDepois,
  crSemData, crVencido, crJanela, crDepois,
  somaCrSemData, somaCrVencido, somaCrJanela, somaCrDepois,
  estrutural2m, estruturalDia, estruturalJanelaBruto, estruturalLancado, estruturalDifuso,
  leilaoGasto2m, presenciaisHist: presenciaisHist.length, leilaoDia, presenciais, leilaoJanela,
  cenarios,
  linhas: Object.fromEntries(cenarios.map(c => [c.chave, c.pts])),
}

const OUT = 'outputs/caixa-setembro-2026'
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(D, null, 2))

const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
console.log('CAIXA HOJE (03/09) ...... Sicoob ' + brl(caixa.sicoob) + ' + Sicredi ' + brl(caixa.sicredi) + ' = ' + brl(caixa.total))
console.log('Saldo em 31/08 .......... ' + brl(saldo3108))
console.log('Realizado 01-02/09 ...... entradas ' + brl(realEntradas) + ' | saidas ' + brl(realSaidas) + ' | transf ' + brl(realTransf))
console.log('CP vencido .............. ' + brl(somaCpVencido) + ' (' + cpVencido.length + ' titulos)')
console.log('CP na janela ............ ' + brl(somaCpJanela) + ' (' + cpJanela.length + ')')
console.log('CP 21-30/09 ............. ' + brl(somaCpDepois) + ' (' + cpDepois.length + ')')
console.log('CR na janela ............ ' + brl(somaCrJanela) + ' (' + crJanela.length + ')')
console.log('CR vencido (com data) ... ' + brl(somaCrVencido) + ' (' + crVencido.length + ')')
console.log('CR SEM DATA (eRural/EAO)  ' + brl(somaCrSemData) + ' (' + crSemData.length + ')')
console.log('Estrutural difuso ....... ' + brl(estruturalDifuso) + ' (media medida ' + brl(estruturalDia) + '/dia)')
console.log('Leilao na janela ........ ' + brl(leilaoJanela) + ' (media medida ' + brl(leilaoDia) + '/dia)')
for (const c of cenarios) console.log('  ' + c.chave.padEnd(12) + ' final ' + brl(c.final).padStart(12) + ' | fundo ' + brl(c.fundo).padStart(12) + ' em ' + c.diaFundo + ' | dias negativos ' + c.negativos)
console.log('JSON:', path.join(OUT, 'dados.json'))
