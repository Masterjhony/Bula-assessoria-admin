/**
 * Posicao de caixa e fluxo projetado de 09/09 a 10/10/2026, montado em torno da
 * pergunta do Joao: quando da para pagar os R$ 63.500 do Marcelo (o chefe) sem
 * furar o caixa, e o que precisa entrar antes (JMP, Navirai, Mafra, e-Rural, EAO).
 *
 * Le TUDO do ERP. O unico numero de fora e o que o Joao informou nesta conversa,
 * e esta marcado como tal (fonte: 'joao-09-09').
 * Grava outputs/caixa-63k-setembro-2026/dados.json. Quem desenha e render-*.mjs.
 *
 * Regras herdadas dos relatorios de 27/08 e 03/09:
 *  - Titulo VENCIDO nao e realocado para "amanha": quem define data de pagamento
 *    e o Joao. Vencido vira quadro proprio, fora da linha.
 *  - CP sem vencimento (chefe, repasse do Felipe, Nane...) tambem fica fora da
 *    linha BASE e entra por cenario — e disso que trata este relatorio.
 *  - Custo estrutural difuso e despesa de leilao entram pela MEDIA MEDIDA no
 *    extrato de jul+ago, nunca por arbitramento.
 *  - EAO: as duas estimativas antigas foram substituidas pela NF 639 na auditoria
 *    de 09/09; contar as tres seria contar o mesmo evento duas vezes.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const HOJE = '2026-09-09'
const FIM = '2026-10-10'
const CONTA_SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const ALVO_CHEFE = 63500            // valor acordado no WhatsApp de 02/09
const RESERVA = 20000               // colchao minimo que o caixa deve manter
const ALIQ_DAS = 0.113857           // carga media medida na competencia de julho
const ALIQ_ISS = 0.05

// Informado pelo Joao em 09/09 (print do portal da leiloeira): ainda nao existe
// CR no ERP, e o pagamento depende de anexar a nota fiscal.
const EXTRA_INFORMADO = [
  { rot: 'LEILAO NELORE MARCONDES - ABERTURA (3 itens consolidados)', valor: 4012.50, venc: '2026-09-15', fonte: 'joao-09-09', nota: 'venda 23/08 · portal da leiloeira pede anexar a NF' },
]

const r2 = n => Math.round(Number(n) * 100) / 100
const dias = (de, ate) => { const o = []; const d = new Date(de + 'T12:00:00Z'); const f = new Date(ate + 'T12:00:00Z'); while (d <= f) { o.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) } return o }
const diaSemana = iso => new Date(iso + 'T12:00:00Z').getUTCDay()
const proxUtil = iso => { let d = iso; while (diaSemana(d) === 0 || diaSemana(d) === 6) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); d = x.toISOString().slice(0, 10) } return d }
const maisDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const soma = arr => r2(arr.reduce((s, t) => s + t.valor, 0))

// ---------------------------------------------------------------------------
// 1. Caixa — e ate quando ele esta conciliado
// ---------------------------------------------------------------------------
const { data: contas } = await sb.from('erp_contas_bancarias').select('id,nome,saldo_atual')
const caixa = {
  sicoob: r2(contas.find(c => c.id === CONTA_SICOOB).saldo_atual),
  sicrediCC: r2(contas.find(c => /Sicredi - Conta Corrente/i.test(c.nome)).saldo_atual),
  sicrediInv: r2(contas.find(c => /Investimentos/i.test(c.nome)).saldo_atual),
}
caixa.sicredi = r2(caixa.sicrediCC + caixa.sicrediInv)
caixa.total = r2(caixa.sicoob + caixa.sicredi)

const { data: cats } = await sb.from('erp_categorias').select('id,nome')
const mapCat = new Map(cats.map(c => [c.id, c.nome]))
const { data: ultimoMv } = await sb.from('erp_movimentos_bancarios').select('data').order('data', { ascending: false }).limit(1)
const conciliadoAte = ultimoMv[0].data
const gapDias = dias(maisDias(conciliadoAte, 1), HOJE).length

const { data: movsSet } = await sb.from('erp_movimentos_bancarios')
  .select('data,tipo,valor,descricao,categoria_id').eq('conta_bancaria_id', CONTA_SICOOB)
  .gte('data', '2026-09-01').order('data')
const ehTransf = c => /Transferencias Internas/i.test(c)
const realizado = movsSet.map(m => ({ data: m.data, tipo: m.tipo, valor: r2(m.valor), categoria: mapCat.get(m.categoria_id) || '(sem categoria)', rot: String(m.descricao) }))
const realEntradas = r2(realizado.filter(x => x.tipo === 'entrada' && !ehTransf(x.categoria)).reduce((s, x) => s + x.valor, 0))
const realSaidas = r2(realizado.filter(x => x.tipo === 'saida' && !ehTransf(x.categoria)).reduce((s, x) => s + x.valor, 0))

// ---------------------------------------------------------------------------
// 2. Contas a pagar
// ---------------------------------------------------------------------------
const { data: pessoas } = await sb.from('erp_pessoas').select('id,nome')
const mapPes = new Map(pessoas.map(p => [p.id, p.nome]))
const { data: cpAberto } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,valor_pago,vencimento,status,origem,categoria_id,fornecedor_id')
  .in('status', ['aberto', 'vencido', 'parcial'])

const cpTodos = cpAberto.map(t => ({
  id: t.id, rot: t.descricao, valor: r2(Number(t.valor) - Number(t.valor_pago || 0)),
  venc: t.vencimento, status: t.status, origem: t.origem,
  categoria: mapCat.get(t.categoria_id) || '(sem categoria)',
  quem: mapPes.get(t.fornecedor_id) || '',
})).filter(t => t.valor > 0.005)

const cpVencido = cpTodos.filter(t => t.venc && t.venc < HOJE).sort((a, b) => a.venc.localeCompare(b.venc))
const cpJanela = cpTodos.filter(t => t.venc && t.venc >= HOJE && t.venc <= FIM).sort((a, b) => a.venc.localeCompare(b.venc))
const cpDepois = cpTodos.filter(t => t.venc && t.venc > FIM)
const cpSemData = cpTodos.filter(t => !t.venc).sort((a, b) => b.valor - a.valor)

// Os dois compromissos que este relatorio existe para responder
const tChefe = cpSemData.find(t => /MARCELO CARNEIRO - 35% do lucro/i.test(t.rot))
const tFelipe = cpSemData.find(t => /Repasse JMP/i.test(t.rot))
const cpSemDataOutros = cpSemData.filter(t => t !== tChefe && t !== tFelipe)

// ---------------------------------------------------------------------------
// 3. Contas a receber — com a correcao do EAO
// ---------------------------------------------------------------------------
const { data: crAberto } = await sb.from('erp_contas_receber')
  .select('id,descricao,valor,valor_recebido,vencimento,status,cliente_id')
  .in('status', ['aberto', 'vencido', 'parcial'])

const ehEstimativaEaoSubstituida = d => /MEGA EVENTO EAO BAVIERA/i.test(d)
const ehEaoNf = d => /Mega Baviera EAO 2026/i.test(d)
const ehErural = (d, c) => /E-?RURAL/i.test(c) || /E-?RURAL/i.test(d)

const crBruto = crAberto.map(t => ({
  id: t.id, rot: t.descricao, cliente: mapPes.get(t.cliente_id) || '—',
  valor: r2(Number(t.valor) - Number(t.valor_recebido || 0)),
  venc: t.vencimento, status: t.status, fonte: 'erp',
})).filter(t => t.valor > 0.005)

const crDuplicado = crBruto.filter(t => ehEstimativaEaoSubstituida(t.rot))
const marca = t => ({ ...t, eao: ehEaoNf(t.rot), erural: ehErural(t.rot, t.cliente), mafra: /MAFRA/i.test(t.rot), jmp: /JMP/i.test(t.rot), navirai: /NAVIRAI/i.test(t.rot) })
const crTodos = crBruto.filter(t => !ehEstimativaEaoSubstituida(t.rot)).map(marca)
  .concat(EXTRA_INFORMADO.map(e => marca({ ...e, cliente: '— (informado por você)', status: 'informado' })))

// O EAO e o unico recebivel declarado SEM data: a NF 639 saiu em 02/09 e a
// previsao de pagamento foi pedida por e-mail e nunca respondida.
const crEao = crTodos.filter(t => t.eao)
const crComData = crTodos.filter(t => !t.eao)
const crVencido = crComData.filter(t => t.venc < HOJE).sort((a, b) => a.venc.localeCompare(b.venc))
const crJanela = crComData.filter(t => t.venc >= HOJE && t.venc <= FIM).sort((a, b) => a.venc.localeCompare(b.venc))
const crDepois = crComData.filter(t => t.venc > FIM)

// Confirmado x regra: JMP e Navirai tem data dita pelo financeiro e reafirmada
// por voce em 09/09 ("Navirai vai entrar amanha 10/09"). O resto e leilao + 45d.
const CONFIRMADOS = t => t.jmp || t.navirai
const crConfirmado = crJanela.filter(CONFIRMADOS)
const crRegra = crJanela.filter(t => !CONFIRMADOS(t))
const crMafra = crJanela.filter(t => t.mafra)
const crErural = crJanela.filter(t => t.erural)
const crAte15 = crJanela.filter(t => t.venc <= '2026-09-15')

// ---------------------------------------------------------------------------
// 4. DAS de agosto — o titulo existe no ERP com valor zero ("aguardando guia").
//    A base sai da guia de ISS que JA chegou: o ISS e 5% da mesma receita.
// ---------------------------------------------------------------------------
const tIss = cpJanela.find(t => /ISSQN agosto/i.test(t.rot))
const baseAgosto = tIss ? r2(tIss.valor / ALIQ_ISS) : 0
const dasEstimado = r2(baseAgosto * ALIQ_DAS)
const dasVenc = proxUtil('2026-09-20')

// ---------------------------------------------------------------------------
// 5. Medias medidas no extrato (jul+ago)
// ---------------------------------------------------------------------------
const { data: mvHist } = await sb.from('erp_movimentos_bancarios')
  .select('data,tipo,valor,categoria_id').gte('data', '2026-07-01').lte('data', '2026-08-31')
const CAT_FORA = /Transferencias Internas|Comissões|Impostos e Taxas|Folha de Pagamento|Remuneracao de Socio|Aplicacao Financeira|Pagamento Fatura|Repasse Assessorias|Cartão de Crédito/i
const CAT_LEILAO = /Despesa Operacional Leilão|Viagem\/Passagens/i
const estrutural2m = r2(mvHist.filter(m => m.tipo === 'saida')
  .filter(m => { const n = mapCat.get(m.categoria_id) || ''; return !CAT_FORA.test(n) && !CAT_LEILAO.test(n) })
  .reduce((s, m) => s + Number(m.valor), 0))
const estruturalDia = r2(estrutural2m / 2 / 30.5)
const leilaoGasto2m = r2(mvHist.filter(m => m.tipo === 'saida')
  .filter(m => CAT_LEILAO.test(mapCat.get(m.categoria_id) || '')).reduce((s, m) => s + Number(m.valor), 0))
const leilaoDia = r2(leilaoGasto2m / 2 / 30.5)

const janelaDias = dias(HOJE, FIM).length
const estruturalJanelaBruto = r2(estruturalDia * janelaDias)
const estruturalLancado = r2(cpJanela
  .filter(t => !/Impostos|Folha|Comiss/i.test(t.categoria) && !CAT_LEILAO.test(t.categoria))
  .reduce((s, t) => s + t.valor, 0))
const estruturalDifuso = r2(Math.max(0, estruturalJanelaBruto - estruturalLancado))
const leilaoJanela = r2(leilaoDia * janelaDias)
const difusoDia = r2((estruturalDifuso + leilaoJanela) / janelaDias)
const gapEstimado = r2((estruturalDia + leilaoDia) * gapDias)

// ---------------------------------------------------------------------------
// 6. A linha do caixa
// ---------------------------------------------------------------------------
const DIA_JMP = crConfirmado.length ? crConfirmado[0].venc : '2026-09-10'

function linha(o = {}) {
  const {
    comConfirmado = true, comRegra = true, semMafra = false, semErural = false,
    comEao = null, comCrVencido = null,
    pagaFelipe = false, pagaChefe = null, pagaCpVencido = null,
    comDas = true, haircutGap = false, adiaADefinir = false,
  } = o
  const pts = []
  let saldo = haircutGap ? r2(caixa.total - gapEstimado) : caixa.total
  const entradas = []
  if (comConfirmado) entradas.push(...crConfirmado.map(t => ({ data: t.venc, valor: t.valor })))
  if (comRegra) entradas.push(...crRegra
    .filter(t => !(semMafra && t.mafra) && !(semErural && t.erural))
    .map(t => ({ data: t.venc, valor: t.valor })))
  if (comEao) entradas.push(...crEao.map(t => ({ data: comEao, valor: t.valor })))
  if (comCrVencido) entradas.push({ data: comCrVencido, valor: soma(crVencido) })

  const saidas = cpJanela
    .filter(t => !(adiaADefinir && t.venc === '2026-09-25' && /a definir/i.test(t.rot)))
    .map(t => ({ data: t.venc, valor: t.valor }))
  if (comDas && dasEstimado > 0) saidas.push({ data: dasVenc, valor: dasEstimado })
  if (pagaFelipe) saidas.push({ data: maisDias(DIA_JMP, 1), valor: tFelipe.valor })
  if (pagaChefe) saidas.push(...pagaChefe)
  if (pagaCpVencido) saidas.push({ data: pagaCpVencido, valor: soma(cpVencido) })

  for (const d of dias(HOJE, FIM)) {
    const ent = r2(entradas.filter(e => e.data === d).reduce((s, e) => s + e.valor, 0))
    const sai = r2(saidas.filter(e => e.data === d).reduce((s, e) => s + e.valor, 0) + difusoDia)
    saldo = r2(saldo + ent - sai)
    pts.push({ data: d, entradas: ent, saidas: r2(sai), saldo })
  }
  return pts
}

const resumo = pts => {
  const fundo = pts.reduce((a, p) => Math.min(a, p.saldo), Infinity)
  return { final: pts[pts.length - 1].saldo, fundo: r2(fundo), diaFundo: pts.find(p => p.saldo === fundo).data, negativos: pts.filter(p => p.saldo < 0).length }
}

// Data mais cedo em que da para pagar o chefe mantendo o colchao ate 10/10
function dataMaisCedo(opts, valor = ALVO_CHEFE, reserva = RESERVA) {
  for (const d of dias(HOJE, FIM)) {
    const pts = linha({ ...opts, pagaChefe: [{ data: d, valor }] })
    const fundoDepois = pts.filter(p => p.data >= d).reduce((a, p) => Math.min(a, p.saldo), Infinity)
    if (fundoDepois >= reserva) return { data: d, ...resumo(pts) }
  }
  return null
}

// As comissoes "A definir" de 25/09 nao tem beneficiario decidido — enquanto a
// diretoria nao resolve, elas nao podem ser pagas, e isso e caixa na janela.
const comissaoADefinir = cpJanela.filter(t => t.venc === '2026-09-25' && /a definir/i.test(t.rot))
const somaADefinir = soma(comissaoADefinir)

const COMPROMISSO = { pagaFelipe: true }
const CENARIOS = [
  { chave: 'BASE', rot: 'Base — o que tem data, sem pagar chefe nem repasse',
    nota: 'Mede a capacidade bruta do caixa antes de qualquer decisão sua.', opts: {} },
  { chave: 'REPASSE', rot: 'Com o repasse do JMP ao Felipe',
    nota: 'O JMP entra dia 10 e sai dia 11: da parcela inteira sobram 8.283,37 para a Bula.', opts: { ...COMPROMISSO } },
  { chave: 'CHEFE_25', rot: 'Repasse + chefe no dia 25 (ciclo dos assessores)',
    nota: 'Paga junto com a folha de comissões, no dia em que todo mundo recebe.', opts: { ...COMPROMISSO, pagaChefe: [{ data: '2026-09-25', valor: ALVO_CHEFE }] } },
  { chave: 'CHEFE_CEDO', rot: 'Repasse + chefe em 17/09, logo depois do Mafra',
    nota: 'Antecipa o pagamento para o dia seguinte à entrada do Mafra.', opts: { ...COMPROMISSO, pagaChefe: [{ data: '2026-09-17', valor: ALVO_CHEFE }] } },
  { chave: 'CHEFE_2X', rot: 'Repasse + chefe em 2× (17/09 e 30/09)',
    nota: 'Divide em duas metades para não concentrar tudo antes do dia 25.', opts: { ...COMPROMISSO, pagaChefe: [{ data: '2026-09-17', valor: r2(ALVO_CHEFE / 2) }, { data: '2026-09-30', valor: r2(ALVO_CHEFE / 2) }] } },
  { chave: 'SEM_ERURAL', rot: 'Chefe no dia 25 + e-Rural atrasa',
    nota: 'A e-Rural já deixou vencer um título e ninguém confirmou data.', opts: { ...COMPROMISSO, pagaChefe: [{ data: '2026-09-25', valor: ALVO_CHEFE }], semErural: true } },
  { chave: 'SEM_MAFRA', rot: 'Chefe no dia 25 + Mafra atrasa',
    nota: 'O Mafra é o maior bloco com data de regra, não de acordo.', opts: { ...COMPROMISSO, pagaChefe: [{ data: '2026-09-25', valor: ALVO_CHEFE }], semMafra: true } },
  { chave: 'SO_CONFIRMADO', rot: 'Chefe no dia 25 + só JMP e Naviraí entram',
    nota: 'Tudo que tem data por regra (+45 dias) atrasa. É o cenário de estresse.', opts: { ...COMPROMISSO, pagaChefe: [{ data: '2026-09-25', valor: ALVO_CHEFE }], comRegra: false } },
  { chave: 'COM_EAO', rot: 'Chefe no dia 25 + EAO paga a NF 639 em 25/09',
    nota: 'O cenário de alívio: 92.324,97 que hoje não têm data nenhuma.', opts: { ...COMPROMISSO, pagaChefe: [{ data: '2026-09-25', valor: ALVO_CHEFE }], comEao: '2026-09-25' } },
  { chave: 'COBRANCA', rot: 'Chefe no 25 + EAO + cobrança dos vencidos em 30/09',
    nota: 'Recuperação: o EAO paga e a cobrança dos vencidos funciona.', opts: { ...COMPROMISSO, pagaChefe: [{ data: '2026-09-25', valor: ALVO_CHEFE }], comEao: '2026-09-25', comCrVencido: '2026-09-30' } },
  { chave: 'ALAVANCAS', rot: 'Chefe no 25 + as duas alavancas internas, sem EAO',
    nota: 'Segura as comissões "a definir" e cobra os vencidos: sem depender do EAO.', opts: { ...COMPROMISSO, pagaChefe: [{ data: '2026-09-25', valor: ALVO_CHEFE }], adiaADefinir: true, comCrVencido: '2026-09-30' } },
  { chave: 'TUDO_JUNTO', rot: 'Chefe no 25 + alavancas + EAO em 25/09',
    nota: 'O melhor caso realista: tudo o que já foi faturado entra e nada extra sai.', opts: { ...COMPROMISSO, pagaChefe: [{ data: '2026-09-25', valor: ALVO_CHEFE }], adiaADefinir: true, comCrVencido: '2026-09-30', comEao: '2026-09-25' } },
  { chave: 'TUDO_ATRASA', rot: 'Nada entra a partir de hoje',
    nota: 'Piso absoluto: só o que já está em caixa, pagando o que tem data.', opts: { comConfirmado: false, comRegra: false } },
].map(c => { const pts = linha(c.opts); return { ...c, pts, ...resumo(pts) } })

// Quanto cabe pagar ao chefe numa data, mantendo o colchao ate 10/10:
// pagar X no dia D desloca todo saldo posterior em -X, entao a capacidade e o
// fundo do periodo a partir de D menos a reserva.
function capacidade(opts, data, reserva = RESERVA) {
  const pts = linha(opts)
  const fundo = pts.filter(p => p.data >= data).reduce((a, p) => Math.min(a, p.saldo), Infinity)
  return { data, fundo: r2(fundo), cabe: r2(fundo - reserva) }
}

const ALAV = { ...COMPROMISSO, adiaADefinir: true, comCrVencido: '2026-09-30' }
const capacidades = [
  { chave: 'REPASSE_17', rot: 'Como está hoje, pagando em 17/09', ...capacidade(COMPROMISSO, '2026-09-17') },
  { chave: 'REPASSE_25', rot: 'Como está hoje, pagando em 25/09', ...capacidade(COMPROMISSO, '2026-09-25') },
  { chave: 'ALAV_25', rot: 'Com as duas alavancas internas, em 25/09', ...capacidade(ALAV, '2026-09-25') },
  { chave: 'EAO_25', rot: 'Se o EAO pagar a NF 639 em 25/09', ...capacidade({ ...COMPROMISSO, comEao: '2026-09-25' }, '2026-09-25') },
  { chave: 'TUDO_25', rot: 'Alavancas + EAO, em 25/09', ...capacidade({ ...ALAV, comEao: '2026-09-25' }, '2026-09-25') },
]

const janelas = {
  cedoBase: dataMaisCedo(COMPROMISSO),
  cedoAlavancas: dataMaisCedo(ALAV),
  cedoComEao: dataMaisCedo({ ...COMPROMISSO, comEao: '2026-09-25' }),
  cedoTudo: dataMaisCedo({ ...ALAV, comEao: '2026-09-25' }),
  cedoSemErural: dataMaisCedo({ ...COMPROMISSO, semErural: true }),
  cedoSemMafra: dataMaisCedo({ ...COMPROMISSO, semMafra: true }),
  cedoSoConfirmado: dataMaisCedo({ ...COMPROMISSO, comRegra: false }),
  cedoSemReserva: dataMaisCedo(COMPROMISSO, ALVO_CHEFE, 0),
  cedoMetade: dataMaisCedo(COMPROMISSO, r2(ALVO_CHEFE / 2)),
  cedoComGap: dataMaisCedo({ ...COMPROMISSO, haircutGap: true }),
}

// ---------------------------------------------------------------------------
// 7. Blocos para a narrativa
// ---------------------------------------------------------------------------
const porCategoriaJanela = Object.entries(cpJanela.reduce((a, t) => { a[t.categoria] = r2((a[t.categoria] || 0) + t.valor); return a }, {}))
  .map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor)
const comissoes25 = cpJanela.filter(t => t.venc === '2026-09-25')
const folha0510 = cpJanela.filter(t => t.venc === '2026-10-05')

const D = {
  hoje: HOJE, fim: FIM, janelaDias, gerado: new Date().toISOString(),
  conciliadoAte, gapDias, gapEstimado,
  caixa, realizado, realEntradas, realSaidas,
  alvoChefe: ALVO_CHEFE, reserva: RESERVA,
  chefe: tChefe, felipe: tFelipe, extraInformado: EXTRA_INFORMADO,
  cpVencido, cpJanela, cpDepois, cpSemData, cpSemDataOutros,
  somaCpVencido: soma(cpVencido), somaCpJanela: soma(cpJanela), somaCpDepois: soma(cpDepois),
  somaCpSemData: soma(cpSemData), somaCpSemDataOutros: soma(cpSemDataOutros),
  crVencido, crJanela, crDepois, crEao, crDuplicado, crConfirmado, crRegra, crMafra, crErural, crAte15,
  somaCrVencido: soma(crVencido), somaCrJanela: soma(crJanela), somaCrEao: soma(crEao), somaCrDuplicado: soma(crDuplicado),
  somaCrConfirmado: soma(crConfirmado), somaCrRegra: soma(crRegra), somaCrMafra: soma(crMafra),
  somaCrErural: soma(crErural), somaCrAte15: soma(crAte15), somaCrDepois: soma(crDepois),
  diaJmp: DIA_JMP,
  iss: tIss ? tIss.valor : 0, baseAgosto, dasEstimado, dasVenc, aliqDas: ALIQ_DAS,
  estrutural2m, estruturalDia, estruturalJanelaBruto, estruturalLancado, estruturalDifuso,
  leilaoGasto2m, leilaoDia, leilaoJanela, difusoDia,
  porCategoriaJanela, comissoes25: soma(comissoes25), nComissoes25: comissoes25.length,
  comissaoADefinir, somaADefinir, capacidades,
  folha0510: soma(folha0510), nFolha0510: folha0510.length,
  cenarios: CENARIOS.map(({ pts, ...c }) => c),
  linhas: Object.fromEntries(CENARIOS.map(c => [c.chave, c.pts])),
  janelas,
}

const OUT = 'outputs/caixa-63k-setembro-2026'
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(D, null, 2))

const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
console.log('CAIXA (ERP, conciliado ate ' + conciliadoAte + ') .. ' + brl(caixa.total) + '  [Sicoob ' + brl(caixa.sicoob) + ' + Sicredi ' + brl(caixa.sicredi) + ']')
console.log('Gap sem extrato: ' + gapDias + ' dias ~ ' + brl(gapEstimado))
console.log('CHEFE ................. ' + brl(tChefe.valor) + '  (sem data)')
console.log('REPASSE FELIPE ........ ' + brl(tFelipe.valor) + '  (condicionado ao JMP de ' + DIA_JMP + ')')
console.log('CR confirmado ......... ' + brl(soma(crConfirmado)) + ' (' + crConfirmado.length + ')')
console.log('CR por regra +45d ..... ' + brl(soma(crRegra)) + ' (' + crRegra.length + ')  | Mafra ' + brl(soma(crMafra)) + ' | e-Rural ' + brl(soma(crErural)))
console.log('CR ate 15/09 .......... ' + brl(soma(crAte15)) + ' (' + crAte15.length + ')')
console.log('CR EAO sem data ....... ' + brl(soma(crEao)) + ' (NF 639)   | duplicado a cancelar: ' + brl(soma(crDuplicado)))
console.log('CR vencido ............ ' + brl(soma(crVencido)) + ' (' + crVencido.length + ')')
console.log('CP na janela .......... ' + brl(soma(cpJanela)) + ' (' + cpJanela.length + ')  | 25/09: ' + brl(soma(comissoes25)) + ' | folha 05/10: ' + brl(soma(folha0510)))
console.log('CP vencido ............ ' + brl(soma(cpVencido)) + ' (' + cpVencido.length + ')')
console.log('CP sem data (fora chefe/felipe) ' + brl(soma(cpSemDataOutros)))
console.log('DAS agosto estimado ... ' + brl(dasEstimado) + ' em ' + dasVenc + ' (base ' + brl(baseAgosto) + ' vinda do ISS de ' + brl(tIss ? tIss.valor : 0) + ')')
console.log('Difuso ................ estrutural ' + brl(estruturalDifuso) + ' + leilao ' + brl(leilaoJanela) + ' = ' + brl(difusoDia) + '/dia')
console.log('')
for (const c of CENARIOS) console.log('  ' + c.chave.padEnd(15) + ' fundo ' + brl(c.fundo).padStart(13) + ' em ' + c.diaFundo + ' | fecha ' + brl(c.final).padStart(13) + ' | dias neg ' + c.negativos)
console.log('')
for (const [k, v] of Object.entries(janelas)) console.log('  ' + k.padEnd(18) + (v ? v.data + ' (fundo depois ' + brl(v.fundo) + ', fecha ' + brl(v.final) + ')' : 'NAO CABE na janela'))
console.log('')
console.log('Comissoes "a definir" em 25/09: ' + brl(somaADefinir) + ' (' + comissaoADefinir.length + ')')
for (const c of capacidades) console.log('  cabe ' + brl(c.cabe).padStart(13) + '  (fundo ' + brl(c.fundo).padStart(13) + ')  ' + c.rot)
console.log('JSON:', path.join(OUT, 'dados.json'))
