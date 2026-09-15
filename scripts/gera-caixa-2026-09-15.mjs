/**
 * Apura o panorama de caixa em 15/09/2026 e a projecao ate 15/10/2026 e grava
 * outputs/caixa-2026-09-15/dados.json.
 *
 * Base: ERP conciliado ate 15/09 18:57 (scripts/concilia-sicoob-2026-09-15.mts)
 * — Sicoob bate ao centavo com o extrato; Sicredi (CC + aplicacao) e a posicao
 * do extrato de 14/09 18:52 (nao houve extrato novo do Sicredi em 15/09).
 *
 * REGRAS (as mesmas de 10/09, explicitadas):
 *  - Entrada so entra na curva com DATA sustentada por documento/acordo: tag
 *    data-acordada no titulo, data da aba Leiloes da planilha FINANCEIRO BULA
 *    2026 (arquivo (8), baixado 15/09 13:56) ou informacao expressa do Joao
 *    (Colonial, 16/09). Vencimento leilao+45d NAO e data.
 *    Excecao declarada: LS Galeria II (57.840, venc de regra 21/09) fica na
 *    curva porque a e-Rural vem pagando na regra ou antes — e o cenario
 *    "sem LS Galeria" mede o que acontece se nao vier.
 *  - Saida se divide em tres: FIRME (obrigacao confirmada), PROJETADA (folha,
 *    contabilidade, fatura de cartao — vai sair, o valor e projecao) e EM
 *    VERIFICACAO (comissao a definir / em disputa / a apurar). A curva base
 *    leva firme + projetada; um cenario soma as em verificacao pelo valor de
 *    face.
 *  - Nada e escrito a mao: todo numero sai do banco ou das listas declaradas
 *    abaixo, cada linha com a fonte da data.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const HOJE = '2026-09-15'
const AMANHA = '2026-09-16'
const FIM_MES = '2026-09-30'
const FIM = '2026-10-15'
const INICIO_MES = '2026-09-01'
const RESERVA = 20000
const OUT = 'outputs/caixa-2026-09-15'

const r2 = n => Math.round(Number(n || 0) * 100) / 100
const soma = (arr, f = x => x.valor) => r2(arr.reduce((s, x) => s + Number(f(x) || 0), 0))
const all = async (tab, cols, filtro) => {
  let out = []
  for (let p = 0; ; p++) {
    let q = sb.from(tab).select(cols).range(p * 1000, p * 1000 + 999)
    if (filtro) q = filtro(q)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    out = out.concat(data)
    if (data.length < 1000) break
  }
  return out
}

// ── caixa ────────────────────────────────────────────────────────────────────
const contas = await sb.from('erp_contas_bancarias').select('id,nome,saldo_atual,tipo').then(r => r.data)
const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const caixa = {
  contas: contas.map(c => ({
    id: c.id, nome: c.nome, tipo: c.tipo, saldo: r2(c.saldo_atual),
    extrato: c.id === SICOOB ? 'extrato de 15/09 às 18:57 (sicoob_2026_09_15_18_57_35.pdf), 01–15/09, validado dia a dia' : 'extrato de 14/09 às 18:52 (sicredi_1789422736137.pdf); sem extrato novo em 15/09',
  })).sort((a, b) => b.saldo - a.saldo),
  total: r2(contas.reduce((s, c) => s + Number(c.saldo_atual || 0), 0)),
  sicoob: r2(contas.find(c => c.id === SICOOB)?.saldo_atual),
}

// ── realizado 01–15/09: como o caixa chegou aqui ─────────────────────────────
const cats = await all('erp_categorias', 'id,nome,tipo,dre_grupo')
const cat = id => cats.find(c => c.id === id)
const pessoas = await all('erp_pessoas', 'id,nome')
const nomeP = id => pessoas.find(p => p.id === id)?.nome || ''
const movs = await all('erp_movimentos_bancarios', 'id,conta_bancaria_id,data,tipo,valor,descricao,categoria_id,pessoa_id,transferencia_par_id,conta_pagar_id,conta_receber_id,status_conciliacao',
  q => q.gte('data', INICIO_MES).lte('data', HOJE))
// transferencia interna = uniao das tres definicoes (verdade/fatos.ts)
const ehTransf = m => Boolean(m.transferencia_par_id) || cat(m.categoria_id)?.dre_grupo === 'ignorar' || /transfer|resgate/i.test(cat(m.categoria_id)?.nome || '')
const oper = movs.filter(m => !ehTransf(m))
const grupoSaida = m => {
  const c = cat(m.categoria_id)?.nome || ''
  const d = String(m.descricao)
  if (/FELIPE VILELA/i.test(d)) return 'Repasse do JMP ao Bulinha (Felipe)'
  if (/Remuneracao de Socio/i.test(c)) return 'Retirada do sócio (Marcelo, 35% do trimestre)'
  if (/Folha|SAL[ÁA]RIOS/i.test(c)) return 'Folha de agosto (paga 01/09)'
  if (/Comiss|Repasse Assessorias/i.test(c)) return 'Comissões de assessores e parceiros'
  if (/Impostos|Imposto/i.test(c)) return 'Impostos (ISSQN de agosto)'
  if (/REEMBOLSO|Viagem|Despesa Operacional|Aluguel|Alimenta/i.test(c)) return 'Reembolsos, viagens e despesas de leilão'
  if (/Marketing/i.test(c)) return 'Marketing (tráfego pago)'
  if (/Software|Servicos de Terceiros|Contab/i.test(c) || /Contabilidade|clickweb|Codex/i.test(d)) return 'Sistemas, site e contabilidade'
  if (/Tarifas|Seguros|Integralizacao|Anuidade|Encargos|Aplicacao|Juros/i.test(c) || /AJUSTE DE POSICAO|CESTA|INTEGR/i.test(d)) return 'Tarifas, seguros, cooperativa e ajustes'
  return 'Outros' + (c ? ' (' + c + ')' : ' (sem categoria)')
}
const saidasMes = oper.filter(m => m.tipo === 'saida')
const entradasMes = oper.filter(m => m.tipo === 'entrada')
const porGrupo = {}
for (const m of saidasMes) { const g = grupoSaida(m); (porGrupo[g] ||= { grupo: g, valor: 0, n: 0 }); porGrupo[g].valor = r2(porGrupo[g].valor + Number(m.valor)); porGrupo[g].n++ }
const realizado = {
  de: INICIO_MES, ate: HOJE,
  entradas: entradasMes.map(m => ({ data: m.data, valor: r2(m.valor), quem: nomeP(m.pessoa_id) || String(m.descricao).slice(0, 50), desc: String(m.descricao).slice(0, 90), conta: contas.find(c => c.id === m.conta_bancaria_id)?.nome }))
    .sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor),
  somaEntradas: soma(entradasMes),
  saidasPorGrupo: Object.values(porGrupo).sort((a, b) => b.valor - a.valor),
  somaSaidas: soma(saidasMes),
  // saldo de abertura reconstruido: saldo hoje − entradas + saidas (inclui transferencias, que se anulam entre contas mas nao dentro de uma)
  aberturaReconstruida: r2(caixa.total - soma(movs.filter(m => m.tipo === 'entrada')) + soma(movs.filter(m => m.tipo === 'saida'))),
  sicoobAbertura: 33654.45, // "SALDO ANTERIOR" impresso no extrato (28/08) — cross-check
  sicoobAberturaReconstruida: r2(caixa.sicoob - soma(movs.filter(m => m.conta_bancaria_id === SICOOB && m.tipo === 'entrada')) + soma(movs.filter(m => m.conta_bancaria_id === SICOOB && m.tipo === 'saida'))),
  hoje: movs.filter(m => m.data === HOJE).map(m => ({ tipo: m.tipo, valor: r2(m.valor), desc: String(m.descricao).slice(0, 80), cat: cat(m.categoria_id)?.nome || '' })),
  pendentes: movs.filter(m => m.status_conciliacao !== 'conciliado').map(m => ({ data: m.data, valor: r2(m.valor), desc: String(m.descricao).slice(0, 70), status: m.status_conciliacao })),
}

// ── titulos ──────────────────────────────────────────────────────────────────
const cps = await all('erp_contas_pagar', 'id,descricao,valor,desconto,juros,multa,valor_pago,vencimento,status,substituido_por,fornecedor_id,tags,origem,apuracao,numero_documento')
const crs = await all('erp_contas_receber', 'id,descricao,valor,desconto,valor_recebido,vencimento,status,substituido_por,cliente_id,nota_fiscal,observacoes,tags,origem,numero_documento,emissao')

const vivoCP = t => t.status !== 'cancelado' && t.status !== 'pago' && !t.substituido_por
const saldoCP = t => r2(Number(t.valor) - Number(t.desconto || 0) + Number(t.juros || 0) + Number(t.multa || 0) - Number(t.valor_pago || 0))
const vivoCR = t => t.status !== 'cancelado' && t.status !== 'recebido' && !t.substituido_por
const saldoCR = t => r2(Number(t.valor) - Number(t.desconto || 0) - Number(t.valor_recebido || 0))

const aDefinir = t => /a definir|em apura/i.test(String(t.descricao))
const classeCP = t => {
  const a = t.apuracao || {}
  const d = String(t.descricao)
  if (a.pagamento_situacao === 'informado') return 'informado'
  if (t.origem === 'estimativa' || a.natureza === 'projecao' || /fatura cartao|deb\. automatico|debito automatico/i.test(d)) return 'projetada'
  if (a.natureza === 'em_verificacao' || ['a_apurar', 'em_disputa'].includes(a.valor_situacao) || a.sem_valor || a.condicao || aDefinir(t)
    || ['ajuste_dia_util_pendente', 'depende_beneficiario', 'competencia_em_verificacao', 'controle_documental'].includes(a.prazo_situacao || '')) return 'verificacao'
  return 'firme'
}
const mapCP = t => ({
  id: t.id.slice(0, 8), desc: String(t.descricao), valor: saldoCP(t), venc: t.vencimento, fornecedor: nomeP(t.fornecedor_id),
  classe: classeCP(t), aDefinir: aDefinir(t), parcial: t.status === 'parcial',
  imposto: (t.tags || []).includes('imposto') || /issqn|simples|das\b/i.test(String(t.descricao)),
  comissao: (t.tags || []).includes('comissao') || /comiss/i.test(String(t.descricao)),
  folha: /^Folha /i.test(String(t.descricao)),
})
const cpAberto = cps.filter(t => vivoCP(t) && saldoCP(t) > 0.005).map(mapCP)
const naJanela = cpAberto.filter(t => t.venc && t.venc >= HOJE && t.venc <= FIM)
const atrasados = cpAberto.filter(t => t.venc && t.venc < HOJE)
const semData = cpAberto.filter(t => !t.venc)
const depoisJanela = cpAberto.filter(t => t.venc && t.venc > FIM)
const firmes = naJanela.filter(t => t.classe === 'firme')
const projetadas = naJanela.filter(t => t.classe === 'projetada')
const verificacao = naJanela.filter(t => t.classe === 'verificacao')

// ── entradas com data ────────────────────────────────────────────────────────
const crAberto = crs.filter(t => vivoCR(t) && saldoCR(t) > 0.005)
const acha = pref => { const t = crAberto.find(x => x.id.startsWith(pref) || x.numero_documento === pref); return t ? { id: t.id.slice(0, 8), desc: String(t.descricao), valor: saldoCR(t), venc: t.vencimento, nf: t.nota_fiscal || '', cliente: nomeP(t.cliente_id) } : null }

// Cada linha carrega a data QUE A FONTE DA. Onde planilha e ERP divergem na data, vale a planilha (posicao do financeiro).
const COM_DATA = [
  { pref: 'BULA-2026-CR-COLONIAL-NF643', data: '2026-09-16', rot: 'Colonial Agropecuária — Noite Nacional 21/08 + Pepitas 22/08 (NF 643)', fonte: 'João, 15/09: "deve ocorrer amanhã"; Aurelio (Colonial) confirmou 11.340 às 13:07; NF 643 emitida 14:43', firmeza: 'informada' },
  { pref: 'fc9c3c74', data: '2026-09-21', rot: 'e-Rural — 2º LS Galeria II (07/08)', fonte: 'venc. de REGRA (leilão+45d); planilha: COBRAR sem data. Mantido porque a e-Rural pagou Sorriso/Bambú antes da regra', firmeza: 'regra' },
  { pref: '2bc9b403', data: '2026-09-25', rot: '20º Guadalupe — touros 19/07 (2ª parcela)', fonte: 'planilha: A RECEBER 2/2 DIA 25/09 · tag data-acordada', firmeza: 'acordada' },
  { pref: 'd4fb3071', data: '2026-09-25', rot: '20º Guadalupe — touros 20/07 (2ª parcela)', fonte: 'planilha: A RECEBER 2/2 DIA 25/09 · tag data-acordada', firmeza: 'acordada' },
  { pref: '19ac2940', data: '2026-09-25', rot: 'Terra Brava — touros provados (3ª parcela)', fonte: 'planilha: A RECEBER 25/09 (ERP: venc. 31/07, valor 2.405 × planilha 2.745)', firmeza: 'planilha' },
  { pref: 'ab6574a9', data: '2026-09-26', rot: '23º Genética Aditiva — fêmeas (2ª parcela, NF 636)', fonte: 'planilha: A RECEBER 2/2 26/09 · tag data-acordada', firmeza: 'acordada' },
  { pref: '07df3346', data: '2026-09-26', rot: '23º Genética Aditiva — touros (2ª parcela, NF 636)', fonte: 'planilha: A RECEBER 2/2 26/09 · tag data-acordada', firmeza: 'acordada' },
  { pref: 'f0c96f66', data: '2026-10-01', rot: 'Santa Nazaré Excelência — parcela 2/2', fonte: 'planilha: A RECEBER 01/10 · acordo por WhatsApp (tag data-acordada)', firmeza: 'acordada' },
]
const VENCIDOS_COM_DATA = [
  { pref: 'a33595fc', data: '2026-09-04', rot: 'Santa Nazaré Excelência — parcela 1/2', fonte: 'planilha: A RECEBER 04/09 · acordo por WhatsApp — não caiu até 15/09' },
]
const entradas = COM_DATA.map(l => { const t = acha(l.pref); return t && { ...l, ...t, id: t.id } }).filter(Boolean).sort((a, b) => a.data.localeCompare(b.data))
const vencidosReceber = VENCIDOS_COM_DATA.map(l => { const t = acha(l.pref); return t && { ...l, ...t, id: t.id } }).filter(Boolean)
const naCurva = new Set([...entradas, ...vencidosReceber].map(e => e.id))
const semPosicao = crAberto.filter(t => !naCurva.has(t.id.slice(0, 8)))
  .map(t => ({ id: t.id.slice(0, 8), desc: String(t.descricao), valor: saldoCR(t), venc: t.vencimento, nf: t.nota_fiscal || '', cliente: nomeP(t.cliente_id), origem: t.origem, criterio: (t.tags || []).some(x => /criterio-a-confirmar|acordo-a-confirmar/.test(x)) }))
  .sort((a, b) => (a.venc || '').localeCompare(b.venc || ''))

// ── pipeline da planilha: leiloes EM FECHAMENTO sem titulo no ERP (aba Leiloes, arquivo (8) de 15/09) ──
// Valores COPIADOS da coluna RECEITA da planilha; onde ela nao tem valor, fica em branco. Nao e projecao nossa.
const PIPELINE_PLANILHA = [
  { data: '2026-08-15', leilao: 'Touros Terra Brava Expogenética', leiloeira: 'Programa', vendas: 107100, receita: 5355, erp: 'CR 11.984,49 (critério a confirmar)' },
  { data: '2026-08-15', leilao: 'Shopping Naviraí Expogenética', leiloeira: 'Fazenda', vendas: 96600, receita: 4830, erp: 'sem CR' },
  { data: '2026-08-16', leilao: 'Matinha Expogenética', leiloeira: 'Programa', vendas: 460500, receita: 23025, erp: 'CR 4.260 + 840 (Tangará/Thiago)' },
  { data: '2026-08-16', leilao: 'Fazenda Araras — Essência Genética', leiloeira: 'Programa', vendas: 87000, receita: 2610, erp: 'sem CR' },
  { data: '2026-08-19', leilao: 'Reserva Expogenética Santa Nice', leiloeira: 'Programa', vendas: 297000, receita: 14850, erp: 'sem CR' },
  { data: '2026-08-19', leilao: '9º Genética Aditiva Expogenética', leiloeira: 'Programa', vendas: 444000, receita: 22200, erp: 'sem CR' },
  { data: '2026-08-20', leilao: 'Baby de Prova', leiloeira: 'Programa', vendas: 73500, receita: 3675, erp: 'sem CR' },
  { data: '2026-08-20', leilao: 'Nelore CEN & Fazenda Modelo', leiloeira: 'Programa', vendas: 117000, receita: 3510, erp: 'sem CR' },
  { data: '2026-08-21', leilao: '12º Premium Colonial', leiloeira: 'Programa', vendas: 195000, receita: 5850, erp: 'NF 643 cobre os dois (11.340) — planilha soma lotes de outros vendedores' },
  { data: '2026-08-22', leilao: '4º Pepitas Colonial', leiloeira: 'Programa', vendas: 325500, receita: 9765, erp: 'idem' },
  { data: '2026-08-22', leilao: 'Naviraí Camparino — Essência Bezerras e Novilhas', leiloeira: 'Programa', vendas: 543000, receita: 27150, erp: 'sem CR' },
  { data: '2026-08-23', leilao: '28º Naviraí Camparino — Reprodutores', leiloeira: 'Programa', vendas: 940500, receita: 60637.5, erp: 'sem CR' },
  { data: '2026-08-23', leilao: 'Excelência Genética', leiloeira: 'Programa', vendas: 105000, receita: 5250, erp: 'sem CR' },
  { data: '2026-08-23', leilao: 'Nelore Marcondes', leiloeira: 'e-Rural', vendas: 37500, receita: 1875, erp: 'sem CR' },
  { data: '2026-08-26', leilao: 'Terra Brava — Matrizes (virtual)', leiloeira: 'Programa', vendas: 46500, receita: 2325, erp: 'sem CR' },
  { data: '2026-08-26', leilao: 'Nelore do Xingu', leiloeira: '—', vendas: 93000, receita: 2790, erp: 'sem CR' },
  { data: '2026-08-26', leilao: 'Genética São José', leiloeira: 'Bula Remates', vendas: 130900, receita: 6545, erp: 'sem CR' },
  { data: '2026-08-29', leilao: 'Nelore Pintado Engenho da Serra', leiloeira: 'Connect', vendas: 53600, receita: 1608, erp: 'sem CR' },
  { data: '2026-08-30', leilao: 'Ventres VIP Matinha (virtual)', leiloeira: 'Programa', vendas: 127500, receita: 6375, erp: 'CR 3.360 + 1.080 + 1.500 (14/10)' },
  { data: '2026-08-30', leilao: 'Especial Sabiá Dourado', leiloeira: '—', vendas: 629700, receita: 11712, erp: 'sem CR' },
  { data: '2026-08-30', leilao: 'Nelore ASJ', leiloeira: 'Programa', vendas: 30900, receita: 11894.12, erp: 'sem CR (planilha: 1% do faturamento 1.189.412)' },
  { data: '2026-09-05', leilao: '10º Jacamim — Touros', leiloeira: 'Programa', vendas: 835200, receita: null, erp: 'sem CR; planilha sem valor' },
  { data: '2026-09-05', leilao: '10º Flor do Arataú', leiloeira: 'Magno', vendas: 617100, receita: 9312, erp: 'sem CR (planilha: 1% do faturamento 931.200)' },
  { data: '2026-09-05', leilao: 'Caminhos — Nelore Marcondes', leiloeira: 'e-Rural', vendas: 18600, receita: 930, erp: 'sem CR' },
  { data: '2026-09-06', leilao: 'Touros Premium Nelore Mafra (virtual)', leiloeira: 'Programa', vendas: 21600, receita: 1080, erp: 'sem CR' },
  { data: '2026-09-12', leilao: 'Shopping de Genética Nelore Visual', leiloeira: '—', vendas: 17800, receita: 890, erp: 'sem CR' },
  { data: '2026-09-12', leilao: 'Nelore AZ (virtual)', leiloeira: 'Ricardo Nicolau', vendas: 158000, receita: null, erp: 'sem CR; planilha sem valor' },
  { data: '2026-09-13', leilao: '7º Mega Premium EAO — Touros', leiloeira: 'Programa', vendas: 310500, receita: null, erp: 'sem CR; planilha sem valor' },
  { data: '2026-09-13', leilao: 'Katayama — Novo Repartimento', leiloeira: '—', vendas: 87000, receita: 4350, erp: 'sem CR' },
]
const pipeline = { itens: PIPELINE_PLANILHA, somaReceitaInformada: soma(PIPELINE_PLANILHA.filter(p => p.receita), p => p.receita), nSemValor: PIPELINE_PLANILHA.filter(p => !p.receita).length, somaVendas: soma(PIPELINE_PLANILHA, p => p.vendas) }

// ── curto prazo informado pelo Joao em 15/09 (~19h): "temos estes pra entrar muito em breve", "falta validar antes de emitir nota" ──
// NAO entra na base. Cada item traz o que a fonte diz, o que o ERP tem e o que falta. As datas do cenario sao HIPOTESES declaradas.
const crTB = crAberto.find(t => /TERRA BRAVA AGROPECU.*EXPOGEN/i.test(t.descricao))
const crMat = crAberto.filter(t => /MATINHA/i.test(t.descricao) && /EXPOGEN|VENTRES/i.test(t.descricao))
const CURTO_PRAZO = [
  { grupo: 'Matinha — Expogenética (16/08) + Ventres VIP (30/08)', fonte: 'E-mail da Tangará/Rancho da Matinha (11/09, print de 15/09): 4% sobre tudo que vender, rateado por consignatário. Tangará 7.620 (NF autorizada, emitida 15/09), Thiago-TLMS 2.340 e Terêncio 1.080 (aguardam “de acordo” e dados).',
    valor: 11040, erp: soma(crMat), erpNota: crMat.length + ' CRs iguais ao e-mail (4.260 + 840 venc. 30/09; 3.360 + 1.080 + 1.500 venc. 14/10), sem NF', planilha: 23025 + 6375, planilhaNota: 'planilha: 23.025 + 6.375 = 29.400 (5% sobre 460.500 + 127.500, lotes que não pagam)',
    falta: 'Confirmar se o lote E11 (embriões, 42.000) entra nos 4% (+1.680); “de acordo” de Thiago e Terêncio para emitir as outras duas NFs.',
    hipoteses: [{ data: '2026-09-22', valor: 7620, rot: 'Tangará 7.620 — NF emitida 15/09; no Touros de junho pagou 2 dias após a NF' }, { data: '2026-09-30', valor: 3420, rot: 'Thiago 2.340 + Terêncio 1.080 — depende do “de acordo”; hipótese fim do mês' }] },
  { grupo: 'Terra Brava — Expogenética (15/08)', fonte: 'Mensagem do Marcelo ao Paulo Camilo (Terra Brava PO), encaminhada 15/09 19h07: faturamento total 937.260 × 0,5% = 4.686,30 (vendas Bula 107.100 = 11,4%). Resposta: “Combinado, pode emitir a NF nos mesmos dados”.',
    valor: 4686.30, erp: crTB ? saldoCR(crTB) : 0, erpNota: 'CR ' + (crTB ? crTB.id.slice(0, 8) : '—') + ' em 11.984,49 (11,19% “critério a confirmar”, venc. 29/09) — 7.298,19 acima do combinado; anotado hoje, valor não alterado', planilha: 5355, planilhaNota: 'planilha: 5.355 (5% × 107.100)',
    falta: 'Validar e emitir a NF nos dados do Touros Provados de junho; então corrigir o CR para 4.686,30. A regra bate com a tabela de performance do contrato (≥ 5% → 0,5% do faturamento bruto).',
    hipoteses: [{ data: '2026-09-30', valor: 4686.30, rot: 'NF a emitir após validação; hipótese fim do mês (junho: Eduardo Pinheiro pagou em 3 parcelas)' }] },
  { grupo: 'e-Rural — portal Gestão de Pagamentos (Nelore Marcondes)', fonte: 'Print do portal (15/09): “Leilão Nelore Marcondes — Abertura”, 3 itens consolidados, venda 23/08, vencimento 15/09, 4.012,50; “Leilão Caminhos — Nelore Marcondes”, lote 05 (José Gabriel Rodrigues Delfino), venda 05/09, vencimento 30/09, 930,00. Ambos aguardando anexar NF.',
    valor: 4942.50, erp: 0, erpNota: 'nenhum CR para os dois leilões; o fechamento do Marcondes Abertura tem 1 lote / 37.500 (o portal consolida 3 itens = 80.250 a 5%)', planilha: 1875 + 930, planilhaNota: 'planilha: 1.875 (Marcondes 23/08, 1 lote) + 930 (Caminhos 05/09)',
    falta: 'Conferir os 3 itens do Marcondes Abertura contra o fechamento (ERP e planilha só têm o lote 01 de 37.500) e anexar as duas NFs no portal.',
    hipoteses: [{ data: '2026-09-18', valor: 4942.50, rot: '“pra pagar até fim da semana” (João) — sexta-feira; o portal já venceu o primeiro em 15/09' }] },
]
const curtoPrazo = { itens: CURTO_PRAZO, total: soma(CURTO_PRAZO), totalERP: soma(CURTO_PRAZO, i => i.erp), hipoteses: CURTO_PRAZO.flatMap(i => i.hipoteses.map(h => ({ ...h, grupo: i.grupo }))).sort((a, b) => a.data.localeCompare(b.data)) }

// ── impostos de setembro (competencia 09/2026): NAO lancados no ERP — estimativa declarada ──
// NFs de setembro conhecidas: 638 (Bambu 825, 01/09), 639 (EAO 92.324,97, 02/09), 643 (Colonial 11.340, 15/09). 640–642 nao vistas.
const NFS_SET = [{ nf: '638', valor: 825, emissao: '2026-09-01' }, { nf: '639', valor: 92324.97, emissao: '2026-09-02' }, { nf: '643', valor: 11340, emissao: '2026-09-15' }]
const baseSet = soma(NFS_SET)
const impostosEstimados = {
  base: baseSet, nfs: NFS_SET,
  iss: { valor: r2(baseSet * 0.05), venc: '2026-10-15', regra: '5% da base (ISS destacado nas próprias NFs)' },
  das: { valor: r2(baseSet * 0.113857), venc: '2026-10-20', regra: '11,3857% da base (carga do Simples medida em julho, memória enquadramento tributário)' },
  nota: 'Só as NFs vistas (638, 639, 643). Se existirem 640–642, a base é maior. O DAS vence 20/10, fora da janela; o ISS entra no cenário "+ impostos" em 15/10.',
}

// ── curvas ───────────────────────────────────────────────────────────────────
const dias = []
for (let d = new Date(HOJE + 'T12:00:00Z'); d <= new Date(FIM + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10))

function curva({ saidas, entradasCurva, extras = [] }) {
  let saldo = caixa.total
  const pts = []
  for (const dia of dias) {
    const ent = r2(entradasCurva.filter(e => e.data === dia).reduce((s, e) => s + e.valor, 0) + extras.filter(e => e.data === dia && e.valor < 0).reduce((s, e) => s - e.valor, 0))
    const sai = r2(saidas.filter(t => t.venc === dia).reduce((s, t) => s + t.valor, 0) + extras.filter(e => e.data === dia && e.valor > 0).reduce((s, e) => s + e.valor, 0))
    saldo = r2(saldo + ent - sai)
    pts.push({ dia, entrada: ent, saida: sai, saldo })
  }
  const min = pts.reduce((m, p) => (p.saldo < m.saldo ? p : m), pts[0])
  return { pontos: pts, fecha: pts[pts.length - 1].saldo, fechaMes: pts.find(p => p.dia === FIM_MES).saldo, min: min.saldo, minDia: min.dia, cabe: r2(min.saldo - RESERVA) }
}
const base = [...firmes, ...projetadas]
const semLS = entradas.filter(e => e.pref !== 'fc9c3c74')
const cenarios = [
  { chave: 'BASE', rot: 'Base', desc: 'Saídas firmes + projetadas (folha, cartões, contabilidade); entradas só com data, Colonial em 16/09.', c: curva({ saidas: base, entradasCurva: entradas }) },
  { chave: 'VERIF', rot: '+ em verificação', desc: 'A base mais as ' + verificacao.length + ' saídas em verificação/a definir pelo valor de face (' + Math.round(soma(verificacao)).toLocaleString('pt-BR') + ').', c: curva({ saidas: [...base, ...verificacao], entradasCurva: entradas }) },
  { chave: 'ATRAS', rot: '+ atrasados', desc: 'O anterior mais os ' + atrasados.length + ' títulos já vencidos, pagos hoje (' + Math.round(soma(atrasados)).toLocaleString('pt-BR') + ').', c: curva({ saidas: [...base, ...verificacao], entradasCurva: entradas, extras: [{ data: HOJE, valor: soma(atrasados) }] }) },
  { chave: 'SEM_LS', rot: 'Base sem LS Galeria', desc: 'A base, se a e-Rural não pagar os 57.840 do LS Galeria II dentro da janela.', c: curva({ saidas: base, entradasCurva: semLS }) },
  { chave: 'IMPOSTOS', rot: '+ impostos de setembro', desc: 'A base mais o ISS estimado das NFs de setembro em 15/10 (' + impostosEstimados.iss.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '); o DAS (' + Math.round(impostosEstimados.das.valor).toLocaleString('pt-BR') + ') vence 20/10, fora da janela.', c: curva({ saidas: base, entradasCurva: entradas, extras: [{ data: '2026-10-15', valor: impostosEstimados.iss.valor }] }) },
  { chave: 'CURTO', rot: '+ curto prazo (se validar)', desc: 'A base mais os ' + Math.round(curtoPrazo.total).toLocaleString('pt-BR') + ' informados hoje (Matinha, Terra Brava, e-Rural) nas datas-hipótese da pág. 05.', c: curva({ saidas: base, entradasCurva: [...entradas, ...curtoPrazo.hipoteses.map(h => ({ data: h.data, valor: h.valor }))] }) },
].map(x => ({ chave: x.chave, rot: x.rot, desc: x.desc, ...x.c }))

// ── blocos de saida por data ────────────────────────────────────────────────
const porDia = {}
for (const t of naJanela) (porDia[t.venc] ||= []).push(t)
const blocos = Object.entries(porDia).map(([dia, ts]) => ({
  dia, n: ts.length, valor: soma(ts),
  firme: soma(ts.filter(t => t.classe === 'firme')), projetada: soma(ts.filter(t => t.classe === 'projetada')), verificacao: soma(ts.filter(t => t.classe === 'verificacao')),
  maiores: [...ts].sort((a, b) => b.valor - a.valor).slice(0, 3).map(t => ({ desc: t.desc, valor: t.valor, classe: t.classe })),
})).sort((a, b) => a.dia.localeCompare(b.dia))

// 25/09 por beneficiario
const canon = (t) => {
  const f = t.fornecedor || ''
  const d = t.desc
  const m = /Comissão\s+(?:A definir:?\s*)?([^—]+?)\s+—/.exec(d) || /COMISSAO .*? - ([A-ZÁÉÍÓÚÂÊÔÃÕÇ.\/ ()]+?)\s*\(/.exec(d)
  const b = (f || m?.[1] || 'outros').trim().replace(/\s+/g, ' ')
  if (t.aDefinir) return 'A definir (sem beneficiário decidido)'
  return /rusa/i.test(b) ? 'Gustavo Rusa (2ª metade de agosto)' : /douglas|agrobispo/i.test(b) ? 'Douglas Bispo' : /f[áa]bio|FO ASSESSORIA/i.test(b) ? 'Fábio Omena'
    : /leonardo/i.test(b) ? 'Leonardo Serafim' : /peralta/i.test(b) ? 'Peralta' : /nane/i.test(b) ? 'Nane' : /laila/i.test(b) ? 'Laila'
      : /felipe|bulinha/i.test(b) ? 'Felipe Andrade' : /lucas/i.test(b) ? 'Lucas Martins' : /val[ée]ria/i.test(b) ? 'Valéria' : b
}
const d25 = naJanela.filter(t => t.venc === '2026-09-25')
const benef = {}
for (const t of d25) { const k = canon(t); (benef[k] ||= { nome: k, valor: 0, n: 0, verificacao: 0 }); benef[k].valor = r2(benef[k].valor + t.valor); benef[k].n++; if (t.classe === 'verificacao') benef[k].verificacao = r2(benef[k].verificacao + t.valor) }
const d25Benef = Object.values(benef).sort((a, b) => b.valor - a.valor)

const impostos = naJanela.filter(t => t.imposto)
const folhaOut = naJanela.filter(t => t.folha)

// ── proximos 7 dias, dia a dia (16–22/09) ────────────────────────────────────
const semana = dias.filter(d => d > HOJE && d <= '2026-09-22').map(dia => ({
  dia,
  entradas: entradas.filter(e => e.data === dia).map(e => ({ rot: e.rot, valor: e.valor, firmeza: e.firmeza })),
  saidas: naJanela.filter(t => t.venc === dia).map(t => ({ desc: t.desc, valor: t.valor, classe: t.classe })),
  saldoBase: cenarios[0].pontos.find(p => p.dia === dia).saldo,
}))

// ── colonial (o pagamento de amanha) ─────────────────────────────────────────
const colonialCR = acha('BULA-2026-CR-COLONIAL-NF643')
const colonial = {
  cr: colonialCR,
  nf: { numero: '643/U', emissao: '2026-09-15 14:43', competencia: '09/2026', valor: 11340, iss: 567, tomador: 'COLONIAL AGROPECUÁRIA LTDA · 22.681.381/0004-05 · Fazenda Colonial, Verdelândia/MG', descricao: 'REFERENTE AO LEILAO PEPITAS COLONIAL EXPOGENETICA DIA 22/08/2026' },
  conta: [
    { leilao: '12º Noite Nacional Matrizes Premium (21/08)', lotes: '18, 19, 24', base: 117000, pct: 0.03, valor: 3510 },
    { leilao: '4º Pepitas Colonial — Expogenética (22/08)', lotes: '9, 19, 24, 25, 26, 27, 32, 33, 37 (lote 19 a 22.500)', base: 261000, pct: 0.03, valor: 7830 },
  ],
  planilha: { premium: 5850, pepitas: 9765, total: 15615, diferenca: 4275 },
  foraDaNF: [
    { vendedor: 'Fazenda Terra Boa', lote: '29 (21/08)', base: 78000, valor: 2340 },
    { vendedor: 'Bela Alvorada / Nelore ZAN', lote: '53 (22/08)', base: 24000, valor: 720 },
    { vendedor: 'Agropontieri', lote: '54 (22/08)', base: 36000, valor: 1080 },
  ],
  lote19: { antes: 27000, depois: 22500, efeito: 135 },
  comissoesLigadas: cpAberto.filter(t => /colonial|noite nacional/i.test(t.desc)).map(t => ({ desc: t.desc, valor: t.valor, venc: t.venc, classe: t.classe, parcial: t.parcial })),
}

// ── divergencias e ressalvas (o que NAO foi assumido como verdade) ──────────
const ressalvas = [
  { tema: 'Extrato do mesmo dia é parcial', texto: 'O Sicoob foi tirado às 18:57 de 15/09. Em 10/09 o extrato das 17:20 ainda perdeu 168,90 que caíram depois. Tudo que entrar ou sair depois das 18:57 só aparece no próximo extrato.' },
  { tema: 'Sicredi sem extrato novo', texto: 'CC 0,00 e aplicação 4.765,08 são a posição do extrato de 14/09 18:52. A aplicação rende diariamente; o residual de +0,23 lançado em 14/09 é ajuste por diferença, não linha de extrato.' },
  { tema: 'Data da Colonial é informada, não assinada', texto: '"Deve ocorrer amanhã (16/09)" é o que o João relatou após a conversa com o Aurelio. Não há mensagem da Colonial com data. Se não cair em 16/09, o título continua aberto e a curva perde 11.340 no dia.' },
  { tema: 'NF 643 descreve só o Pepitas', texto: 'A NF fala em "Leilão Pepitas Colonial Expogenética 22/08", mas o valor 11.340 = 3% × 378.000 cobre também os três lotes do Noite Nacional (21/08). Se a Colonial ler a NF ao pé da letra e pagar só o Pepitas (7.830), faltam 3.510.' },
  { tema: 'Planilha-mestra desatualizada em 4 pontos', texto: 'São Geraldo: planilha "A RECEBER 15/09" 25.099,00 × ERP recebido 24.904,00 em 02/09 (195,00 de diferença ou linha velha). LS Galeria II: 59.840 × 57.840. Terra Brava 3ª parcela: 2.745 × 2.405. Colonial: 15.615 × NF 11.340. Projetado pelo ERP.' },
  { tema: 'LS Galeria II está na curva por data de regra', texto: '57.840 em 21/09 é leilão+45d, não acordo. Está na curva porque a e-Rural pagou Sorriso Touros 7 dias antes e Bambú 16 dias antes da regra — mas Sorriso Fêmeas saiu 16 dias DEPOIS. O cenário "sem LS Galeria" mostra o mês sem ele.' },
  { tema: 'Saídas "em verificação" podem virar pagamento', texto: soma(verificacao).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' em ' + verificacao.length + ' títulos com valor/beneficiário discutido (LS Galeria 22.800 a definir, Sabiá Dourado 5.535, Genética Aditiva 6.640, cartões…). Não estão na curva base; o cenário "+ em verificação" soma tudo pelo valor de face.' },
  { tema: 'Folha de setembro é projeção', texto: 'Os 49.500 de 05/10 são o cadastro da folha (origem estimativa). Em 01/09 a folha real foi 47.951,61 (Douglas 10.000 contra 12.500 cadastrados). Cartões de 22/09 (5.949,84 + 1.380,13) são valores da fatura anterior, não da fatura que vai fechar.' },
  { tema: 'Impostos de setembro não existem no ERP', texto: 'ISS (~15/10) e DAS (20/10) da competência 09/2026 não foram lançados. A estimativa usa só as NFs vistas (638, 639, 643 = ' + baseSet.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '); NFs 640–642, se existirem, aumentam a base.' },
  { tema: 'Rel_TitulosGeral.pdf não foi usado', texto: 'O relatório "Planilha Financeira — Receitas e Despesas" baixado 15/09 10:15 é de outro sistema (usuário "João Pereira da Silva"), cobre vencimentos de AGOSTO e mistura Assessoria e Remates. Não entra na posição de caixa.' },
  { tema: 'PIX de 50,00 sem dono (14/09)', texto: 'Continua classificado sem categoria: CPF ***.978.691-** não casa com cadastro e não tem memo. É o único movimento fora de conciliado.' },
  { tema: 'Duas perguntas de 14/09 seguem abertas', texto: '792,00 "comissão venda Raphael Coelho" ao Marcelo (origem da venda a confirmar) e os 550,00 "sistemas Codex" (mesmo valor da assinatura Anthropic de 24/09, que segue aberta).' },
  { tema: 'Hotel do João em BH (508,68) foi lançado como obrigação', texto: 'Reserva Booking 6034.917.103 sem pré-pagamento, check-out 18/09. Está na curva base como saída de 18/09; a pendência registrada é confirmar que é despesa da Bula (mesma viagem do Leonardo, cuja estadia de 653,18 foi reembolsada hoje).' },
  { tema: 'O curto prazo informado às 19h não entrou na base', texto: 'Matinha 11.040, Terra Brava 4.686,30 e e-Rural/Marcondes 4.942,50 (total ' + curtoPrazo.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ') aparecem só no cenário "+ curto prazo", com datas-hipótese. Você mesmo disse que falta validar antes de emitir nota. O Terra Brava ainda está no ERP em 11.984,49: foi anotado, não corrigido.' },
  { tema: 'Marcondes: o portal da e-Rural vê 3 itens, o ERP vê 1 lote', texto: 'O portal consolida 4.012,50 (5% × 80.250) para o Marcondes Abertura de 23/08; o fechamento do ERP e a planilha têm um lote de 37.500 (1.875). Ou a Bula vendeu mais do que registrou, ou o portal soma item de outro. Conferir antes de anexar a NF.' },
]

const dados = {
  hoje: HOJE, amanha: AMANHA, fimMes: FIM_MES, fim: FIM, reserva: RESERVA, geradoEm: new Date().toISOString(),
  caixa, realizado,
  entradas, somaEntradas: soma(entradas), vencidosReceber, somaVencidosReceber: soma(vencidosReceber), semPosicao, somaSemPosicao: soma(semPosicao),
  pipeline, impostosEstimados, curtoPrazo,
  naJanela, firmes, projetadas, verificacao, atrasados, semData, depoisJanela,
  somaSaidas: soma(naJanela), somaFirmes: soma(firmes), somaProjetadas: soma(projetadas), somaVerificacao: soma(verificacao), somaAtrasados: soma(atrasados), somaSemData: soma(semData), somaDepois: soma(depoisJanela),
  blocos, d25: { total: soma(d25), n: d25.length, benef: d25Benef, aDefinir: soma(d25.filter(t => t.aDefinir)), nADefinir: d25.filter(t => t.aDefinir).length, verificacao: soma(d25.filter(t => t.classe === 'verificacao')) },
  impostos, folhaOut, semana, colonial, cenarios, dias, ressalvas,
  saidasAteFimMes: { total: soma(naJanela.filter(t => t.venc <= FIM_MES)), firme: soma(naJanela.filter(t => t.venc <= FIM_MES && t.classe !== 'verificacao')), verificacao: soma(naJanela.filter(t => t.venc <= FIM_MES && t.classe === 'verificacao')) },
  entradasAteFimMes: soma(entradas.filter(e => e.data <= FIM_MES)),
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(dados, null, 1))

const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
console.log('Caixa em ' + HOJE + ' ................. ' + brl(caixa.total) + '  (Sicoob ' + brl(caixa.sicoob) + ')')
console.log('Abertura reconstruida 01/09 ......... ' + brl(realizado.aberturaReconstruida) + ' | Sicoob reconstruido ' + brl(realizado.sicoobAberturaReconstruida) + ' x extrato ' + brl(realizado.sicoobAbertura))
console.log('Realizado 01-15/09: entradas ........ ' + brl(realizado.somaEntradas) + ' | saidas ' + brl(realizado.somaSaidas))
for (const g of realizado.saidasPorGrupo) console.log('    ' + g.grupo.padEnd(48) + brl(g.valor).padStart(13) + '  (' + g.n + ')')
console.log('Entradas com data ate 15/10 ......... ' + brl(dados.somaEntradas) + ' em ' + entradas.length + '  (ate 30/09: ' + brl(dados.entradasAteFimMes) + ')')
console.log('Vencidos a receber com data ......... ' + brl(dados.somaVencidosReceber))
console.log('Sem posicao ......................... ' + brl(dados.somaSemPosicao) + ' em ' + semPosicao.length)
console.log('Saidas 15/09-15/10 .................. ' + brl(dados.somaSaidas) + ' = firmes ' + brl(dados.somaFirmes) + ' + projetadas ' + brl(dados.somaProjetadas) + ' + verificacao ' + brl(dados.somaVerificacao))
console.log('   ate 30/09 ........................ ' + brl(dados.saidasAteFimMes.total) + ' (firme+proj ' + brl(dados.saidasAteFimMes.firme) + ')')
console.log('Atrasados ........................... ' + brl(dados.somaAtrasados) + ' em ' + atrasados.length + ' | sem data ' + brl(dados.somaSemData) + ' em ' + semData.length)
console.log('Dia 25 .............................. ' + brl(dados.d25.total) + ' em ' + dados.d25.n + ' (a definir ' + brl(dados.d25.aDefinir) + ', verificacao ' + brl(dados.d25.verificacao) + ')')
console.log('')
for (const c of cenarios) console.log('  ' + c.rot.padEnd(24) + ' 30/09 ' + brl(c.fechaMes).padStart(13) + ' | 15/10 ' + brl(c.fecha).padStart(13) + ' | min ' + brl(c.min).padStart(13) + ' em ' + c.minDia + ' | cabe ' + brl(c.cabe).padStart(13))
console.log('')
console.log('Colonial CR: ' + JSON.stringify(colonialCR))
console.log('OK -> ' + path.join(OUT, 'dados.json'))
