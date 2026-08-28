/**
 * Corrige a atribuicao de assessor dos lotes de julho/2026 e acerta os titulos.
 *
 * A CAUSA RAIZ, achada em 28/08/2026: o fechamento gravou como assessor QUEM
 * POSTOU o lance no grupo de WhatsApp, nao QUEM VENDEU. No pregao do EAO Baviera
 * o Fabio postava o lance bruto ("levamos lt 26 - 1650,00 - 1F") e o Leonardo
 * postava a mensagem formal um minuto depois ("Foi com Leo da Bula assessoria").
 * A mensagem formal e o registro primario do arremate — e ela que vale.
 *
 * A regra do grupo, confirmada em 48 mensagens de julho:
 *   "Levamos lt <LOTE> - <PARCELA> - <QTD><F|M>  Foi com <VENDEDOR> da Bula
 *    Assessoria  <comprador, fazenda, cidade/UF>"
 * O nome entre "Foi com" e "da Bula Assessoria" e o vendedor. Confirmacao dupla:
 * parcela x 30 tem de bater com o VGV do lote, e o comprador com o do fechamento.
 *
 * ⚠ O que NAO e erro: 14 lotes em que a mensagem diz "Douglas Bispo" e o ERP diz
 * "Gustavo Rusa". Sao direcionamento de parceiro — o Douglas vende, a comissao e
 * do Rusa porque o comprador e cliente dirigido dele (Celso Lopes/Grao Para,
 * Pedro Pontes, Anesio Santarem). Uma das mensagens diz isso com todas as letras:
 * "Foi com Douglas Bispo da Bula Assessoria Direcionamento tecnico Gustavo Rusa".
 * Esses ficam como estao.
 *
 * AS 10 REATRIBUICOES PROVADAS (lote, valor conferido, comprador conferido):
 *   EAO Baviera Femeas 11/07
 *     lt 19  60.000  Leonardo -> FABIO     "Sr Luiz Carlos Freitas Nelore Tresmar MS" (17:49)
 *     lt 26  49.500  Fabio    -> LEONARDO  "Dr Romualdo - Nelore Tavares e Nelore Leao" (18:25)
 *     lt 30  46.500  Fabio    -> LEONARDO  "Dr Romualdo / Elias Abdo - Nelore Abba" (18:38)
 *   23o Genetica Aditiva 2a etapa 26/07
 *     lt 29  30.000  Leonardo -> FABIO     "Sr Celso Camargo Fazenda Boa esperanca" (19:56)
 *     lt 56  26.100  Leonardo -> VALERIA   "Thiago passos Faz Dois irmaos" (20:23)
 *     lt 71  23.100  Leonardo -> VALERIA   "Santino Basso Bandeirantes MS" (20:44)
 *     lt 81  26.100  Leonardo -> VALERIA   "Antonio Sergio passos Faz Dois irmaos" (21:38)
 *   Nelore Santa Cruz 19/07
 *     lt 45  49.200  A definir (0%) -> FABIO   "Lucio de barros lima faz Peixoto" (14:12)
 *     lt 46  49.200  A definir (0%) -> FABIO   idem, mesma mensagem
 *     lt 47  49.200  A definir (0%) -> FABIO   idem, mesma mensagem
 *
 * Os tres do Santa Cruz estavam com comissao_pct = 0 e NUNCA viraram titulo:
 * R$ 2.952,00 de comissao do Fabio que o ERP simplesmente nao tinha.
 *
 * A VALERIA entra a 1%, nao 2% — mesma regra do Lucas e da Laila (decisao do
 * Grupo Financeiro de 05/08). Confere com o titulo da Laila no EAO Machos:
 * 675,00 = 1% de 67.500. Ela nunca teve titulo nem pagamento no ERP.
 *
 * Depois de corrigir, os DOIS PIX de 25/08 fecham exato:
 *   Leonardo  5.262,00 = Navirai 1.170 + 2a Navirai 612 + Guadalupe 810
 *                        + Kriz 750 + EAO Femeas 1.920   (5 titulos, ao centavo)
 *   Fabio     8.826,00 = 8.706 dos 7 titulos que ele ja tinha (com os valores
 *                        corrigidos) + 120 de adiantamento no titulo novo do
 *                        Santa Cruz
 *
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const fmt = n => brl(n).padStart(11)
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }
const TAG = '[ATRIBUICAO 28/08]'
const anexa = (antes, nota) => String(antes || '').includes(TAG) ? String(antes || '') : (String(antes || '') + '\n' + nota).trim()

const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const CAT_COMISSOES = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'
const CC_ASSESSORES = '52dd8ed0-0c0a-4524-86bd-01dc121487b3'
const P_FABIO = 'c5919834-4e98-4f07-88a8-0892e4f7c247'
const P_VALERIA = 'a76f6ee2-76b9-4b87-bc50-b833c69eb29b'

// Percentual por assessor (Valeria/Laila/Lucas = 1%; Rusa = 5%; demais = 2%)
const PCT = { 'Leonardo Serafim': 0.02, 'Fábio Omena Gaia': 0.02, 'Douglas Bispo': 0.02, 'Gustavo Rusa': 0.05, 'Laila Oliveira': 0.01, 'Valéria Borges': 0.01, 'Nane': 0.02, 'A definir': 0 }

const FECH = {
  eaoFemeas: '135016c0-c0be-4e28-b80a-7fca4b759d1e',
  genAditiva2: '50bf395a-fee9-4051-9d00-3a72e3c30cd0',
  santaCruz19: 'd397ecf6',
}
const REATRIBUI = [
  { fech: 'eaoFemeas', lote: '19', de: 'Leonardo Serafim', para: 'Fábio Omena Gaia', vgv: 60000 },
  { fech: 'eaoFemeas', lote: '26', de: 'Fábio Omena Gaia', para: 'Leonardo Serafim', vgv: 49500 },
  { fech: 'eaoFemeas', lote: '30', de: 'Fábio Omena Gaia', para: 'Leonardo Serafim', vgv: 46500 },
  { fech: 'genAditiva2', lote: '29', de: 'Leonardo Serafim', para: 'Fábio Omena Gaia', vgv: 30000 },
  { fech: 'genAditiva2', lote: '56', de: 'Leonardo Serafim', para: 'Valéria Borges', vgv: 26100 },
  { fech: 'genAditiva2', lote: '71', de: 'Leonardo Serafim', para: 'Valéria Borges', vgv: 23100 },
  { fech: 'genAditiva2', lote: '81', de: 'Leonardo Serafim', para: 'Valéria Borges', vgv: 26100 },
  { fech: 'santaCruz19', lote: '45', de: 'A definir', para: 'Fábio Omena Gaia', vgv: 49200 },
  { fech: 'santaCruz19', lote: '46', de: 'A definir', para: 'Fábio Omena Gaia', vgv: 49200 },
  { fech: 'santaCruz19', lote: '47', de: 'A definir', para: 'Fábio Omena Gaia', vgv: 49200 },
]

/* ================= 1. Fechamentos: troca o assessor do lote ================= */
console.log('[1] FECHAMENTOS — troca o assessor do lote e recalcula por_assessor\n')
const { data: todos } = await sb.from('bula_leilao_fechamento').select('id,nome,data,lances,por_assessor,comissao_assessoria')
const acheFech = k => (todos || []).find(f => f.id.startsWith(FECH[k]))

for (const k of Object.keys(FECH)) {
  const f = acheFech(k)
  if (!f) { console.error('  fechamento ' + k + ' nao encontrado'); erros++; continue }
  const meus = REATRIBUI.filter(r => r.fech === k)
  const lances = JSON.parse(JSON.stringify(f.lances || []))
  console.log('  ' + f.data + '  ' + String(f.nome).slice(0, 52))
  let mexeu = 0
  for (const r of meus) {
    const l = lances.find(x => String(x.lote) === r.lote)
    if (!l) { console.error('    ! lote ' + r.lote + ' nao existe'); erros++; continue }
    if (Math.abs(Number(l.vgv) - r.vgv) > 0.5) { console.error('    ! lote ' + r.lote + ' tem VGV ' + brl(l.vgv) + ', esperado ' + brl(r.vgv)); erros++; continue }
    const atual = String(l.assessor || '')
    if (atual === r.para) { console.log('    = lote ' + r.lote.padStart(3) + ' ja esta com ' + r.para); continue }
    if (atual !== r.de) { console.error('    ! lote ' + r.lote + ' esta com "' + atual + '", esperado "' + r.de + '"'); erros++; continue }
    const pctAntes = PCT[r.de] ?? 0.02, pctDepois = PCT[r.para] ?? 0.02
    console.log('    ~ lote ' + r.lote.padStart(3) + '  VGV ' + fmt(l.vgv) + '   ' + r.de.padEnd(18) + ' -> ' + r.para.padEnd(18)
      + '  comissao ' + fmt(l.vgv * pctAntes) + ' -> ' + fmt(l.vgv * pctDepois) + '  (' + (pctDepois * 100) + '%)')
    l.assessor = r.para
    l.comissao_pct = pctDepois
    mexeu++
  }
  if (!mexeu) { console.log('    (nada a mudar)\n'); continue }

  // Recompoe por_assessor a partir dos lances corrigidos.
  const porNome = {}
  for (const l of lances) {
    const n = String(l.assessor || 'A definir')
    const p = porNome[n] || (porNome[n] = { nome: n, vgv: 0, animais: 0, transacoes: 0, empresa: l.empresa || 'Bula Assessoria', comissao_pct: PCT[n] ?? 0.02 })
    p.vgv = r2(p.vgv + Number(l.vgv || 0)); p.animais += Number(l.animais || 0); p.transacoes++
  }
  const totalVgv = r2(Object.values(porNome).reduce((s, p) => s + p.vgv, 0))
  const por = Object.values(porNome).sort((a, b) => b.vgv - a.vgv).map((p, i) => ({
    ...p, posicao: i + 1, comissao: r2(p.vgv * p.comissao_pct),
    pct_total: totalVgv ? r2(p.vgv / totalVgv * 10000) / 10000 : 0,
    ticket_medio: p.transacoes ? Math.round(p.vgv / p.transacoes) : 0,
  }))
  const comissaoTotal = r2(por.reduce((s, p) => s + p.comissao, 0))
  console.log('    por_assessor: ' + por.map(p => p.nome + ' ' + brl(p.comissao)).join(' · '))
  console.log('    comissao_assessoria ' + brl(f.comissao_assessoria) + ' -> ' + brl(comissaoTotal) + '\n')
  if (APPLY) fail((await sb.from('bula_leilao_fechamento').update({
    lances, por_assessor: por, comissao_assessoria: comissaoTotal,
    observacoes: anexa(f.observacoes, TAG + ' Assessor de ' + mexeu + ' lote(s) corrigido pelo registro formal do grupo de WhatsApp ("Foi com X da Bula Assessoria"), conferido por valor (parcela x 30 = VGV) e por comprador. O campo vinha de quem POSTOU o lance, nao de quem vendeu. Ver scripts/corrige-atribuicao-julho-2026.mjs.'),
  }).eq('id', f.id)).error, 'fechamento ' + k)
}

/* ================= 2. Titulos: novos valores ================================ */
console.log('[2] TITULOS — valores corrigidos\n')
const CP = {
  fabioEaoFemeas: '0609dbaa-52ca-41a6-9a4b-9c9b6b3c408c',
  leoEaoFemeas: '82220972-211a-43ba-a671-a731fbdc6514',
  fabioGenAditiva: '4729b9c4-f2bb-4cb1-b3e5-b55322424a09',
  leoGenAditiva: 'b138437f-256b-4325-a23d-6579dce28a3e',
}
const NOVOS_VALORES = [
  { id: CP.fabioEaoFemeas, quem: 'Fábio', de: 3648, para: 2928, nota: 'perde os lotes 26 (990) e 30 (930), ganha o lote 19 (1.200). Fica com M04 1.728 + lt19 1.200.' },
  { id: CP.leoEaoFemeas, quem: 'Leonardo', de: 1200, para: 1920, nota: 'perde o lote 19 (1.200), ganha os lotes 26 (990) e 30 (930).' },
  { id: CP.fabioGenAditiva, quem: 'Fábio', de: 642, para: 1242, nota: 'ganha o lote 29 (600). Fica com lt42 642 + lt29 600.' },
  { id: CP.leoGenAditiva, quem: 'Leonardo', de: 4068, para: 1962, nota: 'perde o lote 29 (600, do Fábio) e os lotes 56/71/81 (da Valéria). Fica com lt11 630 + lt15 492 + lt88 420 + lt92 420.' },
]
for (const n of NOVOS_VALORES) {
  const { data: c } = await sb.from('erp_contas_pagar').select('id,descricao,valor,valor_pago,status,observacoes').eq('id', n.id).maybeSingle()
  if (!c) { console.error('  ! CP ' + n.id.slice(0, 8) + ' nao existe'); erros++; continue }
  if (Math.abs(Number(c.valor) - n.de) > 0.005 && Math.abs(Number(c.valor) - n.para) > 0.005) {
    console.error('  ! CP ' + n.id.slice(0, 8) + ' vale ' + brl(c.valor) + ', esperado ' + brl(n.de)); erros++; continue
  }
  console.log('  ' + n.id.slice(0, 8) + '  ' + n.quem.padEnd(9) + fmt(n.de) + ' -> ' + fmt(n.para) + '   ' + String(c.descricao).slice(0, 46))
  console.log('             ' + n.nota)
  if (APPLY) fail((await sb.from('erp_contas_pagar').update({
    valor: n.para, observacoes: anexa(c.observacoes, TAG + ' Valor corrigido de ' + brl(n.de) + ' para ' + brl(n.para) + ': ' + n.nota + ' Atribuicao refeita pelo registro formal do grupo.'),
  }).eq('id', n.id)).error, 'CP ' + n.quem)
}

/* --- titulos que nao existiam --- */
console.log('\n[3] TITULOS NOVOS — comissao que o ERP nao tinha\n')
const fSC = acheFech('santaCruz19')
const NOVOS = [
  {
    chave: 'fabio-santacruz19', pessoa: P_FABIO, vendedor: 'FÁBIO OMENA', valor: 2952,
    desc: 'COMISSAO NELORE SANTA CRUZ - 19/07/2026 - FABIO OMENA (2%)',
    fech: fSC ? fSC.id : null, emissao: '2026-07-19',
    nota: 'Lotes 45, 46 e 47 (Lucio de Barros Lima / Fazenda Peixoto), VGV 49.200 cada. Estavam como "A definir" com comissao_pct = 0 e NUNCA viraram titulo. A mensagem formal de 19/07 14:12 cobre os tres de uma vez: "Levamos lt 47 - 820,00 - 2F Levamos lt 46 - 820,00 - 2F Levamos lt 45 - 820,00 - 2F Foi com Fabio Omena da Bula Assessoria, Lucio de barros lima faz Peixoto". 820 x 30 x 2F = 49.200 por lote, e o comprador confere com o fechamento.',
  },
  {
    chave: 'valeria-genaditiva2', pessoa: P_VALERIA, vendedor: 'VALÉRIA BORGES', valor: 753,
    desc: 'COMISSAO 23º LEILÃO GENÉTICA ADITIVA - 2ª ETAPA TOUROS – 26/07/2026 - VALÉRIA BORGES (1%)',
    fech: FECH.genAditiva2, emissao: '2026-07-26',
    nota: 'Lotes 56 (26.100), 71 (23.100) e 81 (26.100) = VGV 75.300 a 1%. Mensagens formais de 26/07: "Levamos 56 - 870 - 1M Valeria Borges da Bula Assessoria, Thiago passos"; "Levamos 71 - 770 - 1M Foi com Valeria da Bula Assessoria, Santino Basso"; "Levamos 81- 870 - 1M Valeria Borges da Bula Assessoria, Antonio Sergio passos". Estavam no nome do Leonardo. Percentual 1% pela decisao do Grupo Financeiro de 05/08 (Lucas/Laila/Valeria), confirmada pelo titulo da Laila no EAO Machos (675 = 1% de 67.500). ATENCAO: a Valeria nunca teve titulo nem pagamento no ERP — conferir com o chefe antes de pagar.',
  },
]
const criados = {}
for (const n of NOVOS) {
  const { data: ja } = await sb.from('erp_contas_pagar').select('id,valor').eq('vendedor', n.vendedor).eq('valor', n.valor).eq('emissao', n.emissao).maybeSingle()
  if (ja) { criados[n.chave] = ja.id; console.log('  = ja existe ' + ja.id.slice(0, 8) + '  ' + fmt(n.valor) + '  ' + n.vendedor); continue }
  console.log('  + ' + fmt(n.valor) + '  ' + n.vendedor.padEnd(16) + String(n.desc).slice(0, 52))
  if (APPLY) {
    const { data, error } = await sb.from('erp_contas_pagar').insert({
      descricao: n.desc, fornecedor_id: n.pessoa, categoria_id: CAT_COMISSOES, centro_custo_id: CC_ASSESSORES,
      valor: n.valor, valor_pago: 0, emissao: n.emissao, vencimento: '2026-08-25', status: 'vencido',
      parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma', origem: 'real',
      fechamento_id: n.fech, vendedor: n.vendedor,
      observacoes: TAG + ' ' + n.nota,
      tags: ['a-pagar', 'comissao', '2026', 'julho', 'leilao', 'atribuicao-corrigida'],
    }).select('id').single()
    fail(error, 'cria CP ' + n.chave); criados[n.chave] = data?.id ?? null
  }
}

/* ================= 4. Baixa contra os PIX de 25/08 ===========================
 * A alocacao e EXPLICITA, titulo por titulo — nao por ordenacao. Cada PIX foi
 * calculado sobre um conjunto conhecido de titulos e e esse conjunto que se
 * baixa; ordenar por valor inventaria uma composicao que nao aconteceu.
 *
 * LEONARDO — 5.262,00: a planilha que ele mandou em 26/08 lista 7 lotes, VGV
 * 263.100 a 2%, e depois da correcao os titulos batem AO CENTAVO com ela.
 * Ficam abertos os dois que ele nao cobrou.
 *
 * FABIO — 8.826,00: o chefe calculou 9.306 (tudo que o ERP mostrava) menos 480
 * (Navirai 05/07). Com os valores corrigidos esses mesmos titulos somam 8.706;
 * os 120 de sobra viram adiantamento no titulo novo do Santa Cruz.
 */
console.log('\n[4] BAIXA — os dois PIX de 25/08 contra os titulos corrigidos\n')
const ALOC = [
  {
    quem: 'LEONARDO', pix: 5262, data: '2026-08-25',
    paga: [
      { id: '24f3439d-a1ed-414c-bd81-ad5efa72cc70', v: 1170, rot: 'Naviraí Matrizes 05/07 (lt 91)' },
      { id: 'b4d28beb-e524-4236-bdb3-dbb46ac5b96e', v: 612, rot: '2ª Etapa Naviraí (lt 25)' },
      { id: '6c7d5c50-613e-4899-8dd2-66658b25ba76', v: 810, rot: 'Guadalupe Fêmeas 18/07 (lt 20)' },
      { id: 'f88a3a1d-a323-4966-89a0-10252de1a616', v: 750, rot: 'Kriz 07/07 (lt 19+20)' },
      { id: '82220972-211a-43ba-a671-a731fbdc6514', v: 1920, rot: 'EAO Fêmeas (lt 26+30) — valor corrigido' },
    ],
    abertos: ['6a139904-20e0-4acd-b3fc-03cae9743217', 'b138437f-256b-4325-a23d-6579dce28a3e'],
  },
  {
    quem: 'FÁBIO OMENA', pix: 8826, data: '2026-08-25',
    paga: [
      { id: '046b485c-3b75-4fd4-8af0-778329cf0951', v: 1962, rot: 'Base Genética Santa Cruz 1ª etapa 14/07' },
      { id: '61accf8d-d8db-4475-af75-f4b6b50b91d7', v: 420, rot: 'Guadalupe Touros 19/07 (lt 25)' },
      { id: '975b6f10-a560-4d14-a8c9-d92e80620ae0', v: 864, rot: '2ª Etapa Naviraí (lt 39)' },
      { id: 'f85f7a4c-c1ee-414b-99e3-d126b40d9f74', v: 420, rot: 'Guadalupe Touros (lt 60) — título COMPARTILHADO com a Nane' },
      { id: '4729b9c4-f2bb-4cb1-b3e5-b55322424a09', v: 1242, rot: 'Genética Aditiva 2ª etapa (lt 42+29) — valor corrigido' },
      { id: '0ebcc33d-df43-4780-a79c-ff52ed71d6c5', v: 870, rot: 'EAO Machos' },
      { id: '0609dbaa-52ca-41a6-9a4b-9c9b6b3c408c', v: 2928, rot: 'EAO Fêmeas (M04 + lt 19) — valor corrigido' },
    ],
    sobraPara: 'fabio-santacruz19',
    abertos: ['6e609d0d-af04-4aee-864d-130cf53436f9'],
  },
]
for (const a of ALOC) {
  console.log('  ' + a.quem + ' — PIX de ' + brl(a.pix) + ' em ' + a.data)
  let soma = 0
  for (const t of a.paga) {
    const { data: c } = await sb.from('erp_contas_pagar').select('id,descricao,valor,status,observacoes').eq('id', t.id).maybeSingle()
    if (!c) { console.error('    ! titulo ' + t.id.slice(0, 8) + ' nao existe'); erros++; continue }
    if (Math.abs(Number(c.valor) - t.v) > 0.005) { console.error('    ! ' + t.id.slice(0, 8) + ' vale ' + brl(c.valor) + ', esperado ' + brl(t.v) + ' — rode a etapa [2] antes'); erros++; continue }
    soma = r2(soma + t.v)
    if (c.status === 'pago') { console.log('    = já pago ' + fmt(t.v) + '  ' + t.rot); continue }
    console.log('    ✓ PAGO    ' + fmt(t.v) + '  ' + t.rot)
    if (APPLY) fail((await sb.from('erp_contas_pagar').update({
      status: 'pago', valor_pago: t.v, data_pagamento: a.data, forma_pagamento: 'pix', conta_bancaria_id: CONTA,
      observacoes: anexa(c.observacoes, TAG + ' Baixado contra o PIX de ' + brl(a.pix) + ' de ' + a.data + ' (' + a.quem + '), depois da correcao de atribuicao.'),
    }).eq('id', c.id)).error, 'baixa ' + t.rot)
  }
  const sobra = r2(a.pix - soma)
  console.log('    soma dos titulos: ' + brl(soma) + '  |  PIX: ' + brl(a.pix) + '  |  sobra: ' + brl(sobra))
  if (sobra > 0.004) {
    const id = criados[a.sobraPara]
    if (!id) { console.log('    ⚠ sobra de ' + brl(sobra) + ' sem destino (titulo novo ainda nao criado — rode com --apply)') }
    else {
      const { data: c } = await sb.from('erp_contas_pagar').select('id,descricao,valor,observacoes').eq('id', id).maybeSingle()
      console.log('    ~ parcial ' + fmt(sobra) + ' de ' + brl(c.valor) + '  ' + String(c.descricao).slice(0, 46) + '  (adiantamento)')
      if (APPLY) fail((await sb.from('erp_contas_pagar').update({
        status: 'parcial', valor_pago: sobra, forma_pagamento: 'pix', conta_bancaria_id: CONTA,
        observacoes: anexa(c.observacoes, TAG + ' Recebeu ' + brl(sobra) + ' de adiantamento: e a sobra do PIX de ' + brl(a.pix) + ' de ' + a.data + ' depois que os titulos daquele dia foram corrigidos.'),
      }).eq('id', c.id)).error, 'adiantamento ' + a.quem)
    }
  } else if (sobra < -0.004) { console.error('    ! o PIX nao cobre os titulos alocados (falta ' + brl(-sobra) + ')'); erros++ }
  let aberto = 0
  for (const id of a.abertos) {
    const { data: c } = await sb.from('erp_contas_pagar').select('valor,valor_pago,descricao').eq('id', id).maybeSingle()
    if (c) { const f = r2(Number(c.valor) - Number(c.valor_pago || 0)); aberto = r2(aberto + f); console.log('    · segue aberto ' + fmt(f) + '  ' + String(c.descricao).slice(0, 50)) }
  }
  if (a.sobraPara && criados[a.sobraPara]) {
    const { data: c } = await sb.from('erp_contas_pagar').select('valor').eq('id', criados[a.sobraPara]).maybeSingle()
    if (c) { const f = r2(Number(c.valor) - sobra); aberto = r2(aberto + f); console.log('    · segue aberto ' + fmt(f) + '  Santa Cruz 19/07 (resto do título novo)') }
  }
  console.log('    ==> AINDA DEVIDO A ' + a.quem + ': ' + brl(aberto) + '\n')
}

console.log('\n' + (APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.'))
