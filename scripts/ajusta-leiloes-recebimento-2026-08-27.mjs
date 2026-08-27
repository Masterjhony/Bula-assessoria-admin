/**
 * AJUSTES DE LEILÃO — diretiva do chefe em 27/08/2026 (João Eduardo, Financeiro).
 *
 * Texto da diretiva:
 *   "Arquive pra mim leilão MNO de 10/junho, pois foi da Remates: não deve contar
 *    pra nós pra fins de fechamento nem ter efeitos no sistema. Sobre este leilão 4R
 *    garanta que ele esteja sendo tratado de acordo no sistema ERP e em geral. Esse
 *    leilão Nelore Magda não temos acordo ainda. Falta recebermos agora o Leilão
 *    Lagoa dos Patos de Março, Nelore Santa Nazaré de Maio, Nelore São Francisco de
 *    Junho, e o restante acredito que esteja correto/coerente. Ajuste esses.
 *    Se for dar trabalho esse da MNO arquivar pode só excluir."
 *
 * BLOCO 1 — NELORE MNO (10/06/2026): leilão da Bula Remates. Sai do universo da
 *   Assessoria: fechamento, CR retroativo de R$ 900 e linha da agenda são
 *   removidos (backup JSON em outputs/arquivo/). O cronograma da ESCALA
 *   (cronograma_leiloes) FICA — é o calendário do grupo, não tem efeito financeiro.
 *   A comissão de R$ 90,00 do Lucas Martins já foi paga dentro do CP agregado
 *   "COMISSAO LUCAS MARTINS - MAI/JUN 2026" (pago 27/07) e NÃO é mexida: o dinheiro
 *   saiu do caixa de verdade.
 *
 * BLOCO 2 — 32º LEILÃO 4R (09/05/2026): o acordo do Galassi (06/08) já está
 *   aplicado (2% do faturamento, título do MRA liquidado por compensação, imposto
 *   de R$ 1.857,00 reclassificado como recuperação). Falta a única consequência
 *   NUMÉRICA que ninguém tinha lançado: os R$ 15.076,75 repassados à Remates pela
 *   estrutura do leilão (hotel, carros, combustível, alimentação, marketing,
 *   escritório, material gráfico) são DESPESA DESTE LEILÃO. Sem isso o relatório
 *   mostra os R$ 82.230,00 da NF inteiros como se tivessem ficado na Assessoria.
 *   Também normaliza a numeração das 3 parcelas do Kito (estavam 1/2 e 2/2).
 *
 * BLOCO 3 — NELORE MAGDA NA ORIGEM (28/06/2026): não há acordo comercial fechado.
 *   O CR de R$ 5.550,00 veio da varredura retroativa de 18/08 com a tag
 *   "criterio-a-confirmar" e um critério ARBITRADO (5% da cobertura). O chefe
 *   confirmou que não existe acordo — o título é cancelado, como já haviam sido os
 *   outros 10 daquela mesma varredura. O fechamento continua em conferência.
 *
 * BLOCO 4 — os três que faltam receber:
 *   4a LAGOA DOS PATOS (18/03): CR de R$ 6.500 vivo e em cobrança, mas o fechamento
 *      estava com acordo/faturamento/receita em branco — o leilão aparecia com
 *      receita ZERO tendo R$ 6.500 a receber. Preenche 1% sobre R$ 650.000.
 *   4b SANTA NAZARÉ EXCELÊNCIA (14/05): CR de R$ 11.428 vivo e correto. O acordo
 *      cadastrado ainda carregava uma segunda perna de 3% sobre a cobertura que a
 *      retificação da Ana (21/07) já tinha derrubado — é o que faz a validação
 *      "receita_bula bate com a fórmula do acordo" acusar R$ 17.908 esperados.
 *      Limpa a perna obsoleta.
 *   4c 1º NELORE SÃO FRANCISCO (07/06): CR de R$ 6.756 estava CANCELADO desde
 *      26/08 ("Ana não tem esse leilão na planilha"). O chefe confirma em 27/08 que
 *      falta receber. REATIVADO — e havia lastro: comissão de R$ 2.100 paga ao
 *      Fábio Omena em 10/08 e despesa de R$ 2.030,20 paga em 08/07 neste leilão.
 *
 * Dry-run por padrão; --apply grava.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const HOJE = '27/08/2026'
const nota = (antes, txt) => [String(antes || '').trim(), txt].filter(Boolean).join('\n')

const ID = {
  fechMno: 'e9bc79a8-5f25-475a-aba0-b4f315bfcdaf',
  crMno: '97aa4189-03c6-4f8c-9f7e-a8a71770f304',
  agendaMno: 'b1a693af-6f8c-4b5c-808c-7bc853363bad',
  fech4r: 'b3d1c05c-2d37-4f9d-b1e4-a21c12540619',
  fechMagda: 'd4fabc0f-8092-491e-9f2e-6a8556fc30d1',
  crMagda: '9ff14750-12d4-4b72-8d05-f5518fea9993',
  fechLagoa: '319b5b5f-3c02-4bfc-9c6d-ff4f3e6dba5c',
  crLagoa: '6b493826-a523-433c-8b70-bd65500de526',
  fechNazare: 'a9f50214-603d-4580-b3be-602a7065ec37',
  crNazare: 'a33595fc-21ef-4362-ba81-08a9a96fbc81',
  fechSaoFrancisco: 'bbe8f166-9144-460f-ad62-26d45b3b040b',
  crSaoFrancisco: '38a738fb-bc3f-4ae2-8880-699a0cd7d1b0',
}

console.log('\n' + '='.repeat(78))
console.log(`  AJUSTES DE LEILÃO — diretiva de ${HOJE}   ${APPLY ? '*** APPLY ***' : '(dry-run)'}`)
console.log('='.repeat(78))

/* ═══ BLOCO 1 — MNO sai do universo da Assessoria ═════════════════════════ */
console.log('\n### 1. NELORE MNO (10/06/2026) — leilão da Bula Remates, sai do sistema\n')
{
  const { data: fech } = await sb.from('bula_leilao_fechamento').select('*').eq('id', ID.fechMno).maybeSingle()
  const { data: cr } = await sb.from('erp_contas_receber').select('*').eq('id', ID.crMno).maybeSingle()
  const { data: agenda } = await sb.from('bula_leiloes').select('*').eq('id', ID.agendaMno).maybeSingle()

  if (!fech && !cr && !agenda) console.log('  já removido. ✓')
  else {
    // segurança: nada mais pode estar pendurado no fechamento
    const { data: crsOutros } = await sb.from('erp_contas_receber').select('id,descricao,valor,status').eq('fechamento_id', ID.fechMno)
    const { data: cpsOutros } = await sb.from('erp_contas_pagar').select('id,descricao,valor,status').eq('fechamento_id', ID.fechMno)
    const sobrandoCr = (crsOutros || []).filter(x => x.id !== ID.crMno)
    if (sobrandoCr.length || (cpsOutros || []).length) {
      console.error('  ABORTA: há outros títulos ligados ao fechamento do MNO —', JSON.stringify([...sobrandoCr, ...(cpsOutros || [])]))
      process.exit(1)
    }

    console.log(`  fechamento .... ${fech?.nome} · VGV ${brl(fech?.vgv_total)} · comissão ${brl(fech?.comissao_assessoria)} · receita ${brl(fech?.receita_bula)}`)
    console.log(`  CR ............ ${brl(cr?.valor)} [${cr?.status}] venc ${String(cr?.vencimento).slice(0, 10)} — "${cr?.descricao}"`)
    console.log(`  agenda ........ ${agenda?.nome} (${String(agenda?.data).slice(0, 10)}, ${agenda?.leiloeira}) — acordo cadastrado: "${agenda?.acordo_comissao}"`)
    console.log('  → DELETE nos três. Backup em outputs/arquivo/. O cronograma da ESCALA fica.')
    console.log('  → NÃO mexe na comissão de R$ 90,00 do Lucas (paga dentro do CP agregado de mai/jun).')

    if (APPLY) {
      const dir = 'outputs/arquivo'
      fs.mkdirSync(dir, { recursive: true })
      const arq = path.join(dir, 'nelore-mno-2026-06-10-removido-2026-08-27.json')
      fs.writeFileSync(arq, JSON.stringify({
        removido_em: '2026-08-27',
        motivo: 'Leilão da Bula Remates. Diretiva do chefe (João Eduardo) em 27/08/2026: não conta para a Bula Assessoria para fins de fechamento e não deve ter efeitos no sistema.',
        preservado_fora_daqui: 'cronograma_leiloes id=65757bfe-0673-43d0-ba23-39e551e1f364 (ESCALA) e o CP agregado "COMISSAO LUCAS MARTINS - MAI/JUN 2026" (comissão de R$ 90,00 já paga em 27/07).',
        bula_leilao_fechamento: fech, erp_contas_receber: cr, bula_leiloes: agenda,
      }, null, 2))
      console.log(`  backup gravado: ${arq}`)
      await sb.from('erp_contas_receber').delete().eq('id', ID.crMno)
      await sb.from('bula_leilao_fechamento').delete().eq('id', ID.fechMno)
      await sb.from('bula_leiloes').delete().eq('id', ID.agendaMno)
      console.log('  removidos.')
    }
  }
}

/* ═══ BLOCO 2 — 4R: lança a despesa do acordo ════════════════════════════ */
console.log('\n### 2. 32º LEILÃO 4R (09/05/2026) — acordo Galassi aplicado até o número\n')
const REPASSE_REMATES = 15076.75
{
  const { data: f } = await sb.from('bula_leilao_fechamento').select('*').eq('id', ID.fech4r).maybeSingle()
  const { data: crs } = await sb.from('erp_contas_receber').select('id,descricao,vencimento,valor,status,parcela,total_parcelas,observacoes')
    .eq('fechamento_id', ID.fech4r).order('vencimento')

  console.log('  conferência do que o acordo já produziu:')
  const ok = (b, t) => console.log(`    ${b ? '✓' : '✗'} ${t}`)
  ok(Number(f.acordo_pct_faturamento) === 0.02, `acordo = 2% do faturamento (NF) → receita ${brl(f.receita_bula)}`)
  const mra = crs.find(c => /MRA|MARCIO DE REZENDE/i.test(c.descricao))
  ok(mra?.status === 'cancelado', `título do MRA ${brl(mra?.valor)} liquidado por compensação (não virou caixa)`)
  const imposto = crs.find(c => Number(c.valor) === 1857)
  ok(imposto?.status === 'recebido', `cobertura do imposto da NF ${brl(1857)} recebida em 06/08`)
  const kitos = crs.filter(c => /KITO/i.test(c.descricao))
  const kitoAberto = kitos.filter(c => c.status !== 'recebido')
  ok(kitos.length === 3 && kitoAberto.length === 1, `Kito: 3 parcelas de ${brl(15030)}, ${kitos.length - kitoAberto.length} recebidas, ${kitoAberto.length} a vencer (30/08)`)
  const estimativa = crs.find(c => Number(c.valor) === 41235)
  ok(estimativa?.status === 'cancelado', `estimativa antiga de 1% (${brl(41235)}) cancelada`)

  const jaLancado = /repassados à Remates como DESPESA VARIÁVEL/.test(String(f.observacoes || ''))
  if (jaLancado) console.log('\n  repasse à Remates já lançado como despesa. ✓')
  else {
    const despesasNovas = Number(f.despesas_variaveis || 0) + REPASSE_REMATES
    const sobraNova = Number(f.sobra_bruta || 0) - REPASSE_REMATES
    console.log('\n  falta lançar o repasse à Remates (estrutura do leilão), única consequência ainda só em prosa:')
    console.log(`    despesas_variaveis  ${brl(f.despesas_variaveis)}  ->  ${brl(despesasNovas)}   (+ ${brl(REPASSE_REMATES)})`)
    console.log(`    sobra_bruta         ${brl(f.sobra_bruta)}  ->  ${brl(sobraNova)}`)
    console.log(`    (Resultados Mensais de maio/2026 cai o mesmo ${brl(REPASSE_REMATES)} de lucro do 4R.)`)
    if (APPLY) {
      await sb.from('bula_leilao_fechamento').update({
        despesas_variaveis: despesasNovas,
        sobra_bruta: sobraNova,
        observacoes: nota(f.observacoes, `[${HOJE}] Acordo do 4R RECONFIRMADO pelo chefe (mensagem do Guilherme Galassi reencaminhada). Lançados agora os R$ 15.076,75 repassados à Remates como DESPESA VARIÁVEL deste leilão — é o que a mensagem descreve: pagamento pelo deslocamento da equipe até Dourados e pela estrutura da leiloeira parceira (hotel, aluguel de carros, combustível, alimentação, marketing, apoio de escritório e material gráfico). Sem esse lançamento o relatório do leilão mostrava os R$ 82.230,00 da NF inteiros como se tivessem ficado na Assessoria. Não vira contas a pagar: foi liquidado por compensação dentro do título do MRA, nenhum real saiu do banco. Os outros R$ 22.063,25 do mesmo título quitaram dívidas da Assessoria que nunca foram lançadas neste ERP — permanecem como fato documentado, sem contrapartida contábil aqui.`),
      }).eq('id', ID.fech4r)
    }
  }

  // numeração das 3 parcelas do Kito
  console.log('\n  numeração das parcelas do Kito (estavam "1/2" e "2/2" para 3 parcelas):')
  const ordemKito = kitos.slice().sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
  for (const [i, c] of ordemKito.entries()) {
    const n = i + 1
    const nova = `LEILAO 09/05 - KITO - COMISSAO BULA (${n}/3)`
    if (c.descricao === nova && c.parcela === n && c.total_parcelas === 3) { console.log(`    = ${nova}`); continue }
    console.log(`    ~ "${c.descricao}"  ->  "${nova}"  (parcela ${c.parcela}/${c.total_parcelas} -> ${n}/3)`)
    if (APPLY) {
      await sb.from('erp_contas_receber').update({
        descricao: nova, parcela: n, total_parcelas: 3,
        observacoes: nota(c.observacoes, `[${HOJE}] Renumerada: são 3 parcelas de R$ 15.030,00 do Kito (30/06, 30/07 e 30/08), somando os R$ 45.090,00 que a Assessoria recebe em dinheiro do 4R. A descrição anterior dizia "de 2" e escondia a terceira.`),
      }).eq('id', c.id)
    }
  }
}

/* ═══ BLOCO 3 — Magda: sem acordo, sem título ════════════════════════════ */
console.log('\n### 3. NELORE MAGDA NA ORIGEM (28/06/2026) — sem acordo, cancela a cobrança\n')
{
  const { data: cr } = await sb.from('erp_contas_receber').select('*').eq('id', ID.crMagda).maybeSingle()
  const { data: f } = await sb.from('bula_leilao_fechamento').select('id,nome,etapa,receita_bula,observacoes').eq('id', ID.fechMagda).maybeSingle()
  console.log(`  CR ${brl(cr.valor)} [${cr.status}] venc ${String(cr.vencimento).slice(0, 10)} — critério arbitrado em 18/08 (5% da cobertura), tag "criterio-a-confirmar"`)
  console.log('  → CANCELADO: o chefe confirmou em 27/08 que não há acordo comercial fechado com o criador.')
  console.log(`  fechamento fica em "${f.etapa}" com receita_bula ${f.receita_bula === null ? 'NULA' : brl(f.receita_bula)} (não entra em relatório de receita).`)
  console.log('  comissões de R$ 2.700,00 (Leonardo 1.260 + Fábio 1.440) continuam PAGAS — o dinheiro saiu.')
  if (APPLY) {
    await sb.from('erp_contas_receber').update({
      status: 'cancelado',
      tags: [...new Set([...(cr.tags || []).filter(t => t !== 'criterio-a-confirmar'), 'sem-acordo-comercial'])],
      observacoes: nota(cr.observacoes, `[${HOJE}] CANCELADO por diretiva do chefe: "Esse leilão Nelore Magda não temos acordo ainda". O critério de 5% da cobertura era ARBITRADO pela varredura retroativa de 18/08 (tag criterio-a-confirmar) — não existe acordo comercial fechado com o criador, então não há o que cobrar. Enquanto o acordo não for definido o leilão fica em conferência, sem receita apurada. As comissões de R$ 2.700,00 já pagas aos assessores (Leonardo Serafim R$ 1.260 em 27/07, Fábio Omena R$ 1.440 em 10/08) permanecem — saíram do caixa de verdade.`),
    }).eq('id', ID.crMagda)
    await sb.from('bula_leilao_fechamento').update({
      observacoes: nota(f.observacoes, `[${HOJE}] SEM ACORDO COMERCIAL — confirmado pelo chefe. O CR de R$ 5.550,00 que a varredura retroativa de 18/08 havia criado por critério arbitrado (5% da cobertura) foi cancelado. Continua pendente exatamente o que a nota de 06/07 já dizia: faturamento total do leilão e acordo da leiloeira. Comissões já pagas: R$ 2.700,00.`),
    }).eq('id', ID.fechMagda)
  }
}

/* ═══ BLOCO 4 — os três a receber ════════════════════════════════════════ */
console.log('\n### 4. OS TRÊS QUE FALTAM RECEBER\n')

/* 4a — Lagoa dos Patos */
{
  const { data: f } = await sb.from('bula_leilao_fechamento').select('*').eq('id', ID.fechLagoa).maybeSingle()
  const { data: cr } = await sb.from('erp_contas_receber').select('*').eq('id', ID.crLagoa).maybeSingle()
  console.log('  4a) LAGOA DOS PATOS (18/03/2026)')
  console.log(`      CR ${brl(cr.valor)} [${cr.status}] venc ${String(cr.vencimento).slice(0, 10)} — cobrança ativa, devedor postergando. OK.`)
  console.log(`      fechamento: faturamento ${f.faturamento_total_leilao ?? 'NULO'}, acordo ${f.acordo_pct_faturamento ?? 'NULO'}, receita ${brl(f.receita_bula)}, etapa "${f.etapa}"`)
  console.log(`      -> faturamento ${brl(650000)} · acordo 1% · receita ${brl(6500)} · etapa "aguardando_recebimento"`)
  if (APPLY) {
    await sb.from('bula_leilao_fechamento').update({
      faturamento_total_leilao: 650000, acordo_pct_faturamento: 0.01,
      acordo_descricao: '1% sobre o faturamento total do leilão',
      receita_bula: 6500, etapa: 'aguardando_recebimento', etapa_atualizada_em: new Date().toISOString(),
      observacoes: nota(f.observacoes, `[${HOJE}] Acordo preenchido a partir do título de cobrança (CR BULA-2026-CR-023): 1% sobre o faturamento de R$ 650.000,00 = R$ 6.500,00, em aberto desde 02/05. O fechamento vinha do HastaPro só com a cobertura (R$ 25.560,00) e mostrava receita ZERO enquanto havia R$ 6.500,00 a receber. Confirmado pelo chefe em 27/08 na lista do que ainda falta entrar.`),
    }).eq('id', ID.fechLagoa)
    await sb.from('erp_contas_receber').update({
      observacoes: nota(cr.observacoes, `[${HOJE}] Chefe confirma que segue a receber. Acordo agora também gravado no fechamento (1% sobre R$ 650.000).`),
    }).eq('id', ID.crLagoa)
  }
}

/* 4b — Santa Nazaré Excelência */
{
  const { data: f } = await sb.from('bula_leilao_fechamento').select('*').eq('id', ID.fechNazare).maybeSingle()
  const { data: cr } = await sb.from('erp_contas_receber').select('*').eq('id', ID.crNazare).maybeSingle()
  console.log('\n  4b) SANTA NAZARÉ EXCELÊNCIA (14/05/2026)')
  console.log(`      CR ${brl(cr.valor)} [${cr.status}] venc ${String(cr.vencimento).slice(0, 10)} — NF enviada, Leonardo pagou o de junho e deixou este. OK.`)
  console.log(`      acordo cadastrado: 1% do faturamento + ${f.acordo_pct_venda_cobertura === null ? '—' : Number(f.acordo_pct_venda_cobertura) * 100 + '%'} da cobertura · receita apurada ${brl(f.receita_bula)}`)
  if (f.acordo_pct_venda_cobertura === null) console.log('      perna de 3% já removida. ✓')
  else {
    console.log('      -> a perna de 3% sobre a cobertura já tinha sido derrubada pela retificação da Ana (21/07): limpa.')
    console.log(`         (com ela, a validação do ERP exige ${brl(17908)} de receita esperada contra ${brl(f.receita_bula)} reais)`)
    if (APPLY) {
      await sb.from('bula_leilao_fechamento').update({
        acordo_pct_venda_cobertura: null,
        acordo_descricao: '1% do faturamento total do leilão',
        observacoes: nota(f.observacoes, `[${HOJE}] Removida a perna de 3% sobre a venda da cobertura do acordo cadastrado. Ela vinha da informação original do chefe (maio) e já tinha sido derrubada pela retificação da Ana em 21/07 — "Receita real R$ 11.428 (1% fat.)" — e pela NF efetivamente emitida. Enquanto estava lá, a validação do ERP acusava receita esperada de R$ 17.908,00 contra os R$ 11.428,00 reais. Os R$ 744,00 de 3% do Lt 20 foram pagos como COMISSÃO ao Fábio Omena em 07/07, não como receita. Chefe confirmou em 27/08 que os R$ 11.428,00 seguem a receber.`),
      }).eq('id', ID.fechNazare)
      await sb.from('erp_contas_receber').update({
        observacoes: nota(cr.observacoes, `[${HOJE}] Chefe confirma que segue a receber.`),
      }).eq('id', ID.crNazare)
    }
  }
}

/* 4c — 1º Nelore São Francisco */
{
  const { data: f } = await sb.from('bula_leilao_fechamento').select('*').eq('id', ID.fechSaoFrancisco).maybeSingle()
  const { data: cr } = await sb.from('erp_contas_receber').select('*').eq('id', ID.crSaoFrancisco).maybeSingle()
  console.log('\n  4c) 1º NELORE SÃO FRANCISCO (07/06/2026)  <<< o único que estava fora')
  console.log(`      CR ${brl(cr.valor)} [${cr.status}] venc ${String(cr.vencimento).slice(0, 10)} · origem "${cr.origem}" · substituido_por ${cr.substituido_por ?? 'null'}`)
  if (cr.substituido_por) { console.error('      ABORTA: título foi substituído por outro; conferir antes de reativar.'); process.exit(1) }
  if (cr.status !== 'cancelado') console.log('      já reativado. ✓')
  else {
    console.log('      cancelado em 26/08 porque a Ana não tinha o leilão na planilha. Mas há lastro:')
    console.log('        · comissão de R$ 2.100,00 PAGA ao Fábio Omena em 10/08 (3% sobre R$ 70.000 de cobertura)')
    console.log('        · despesa de R$ 2.030,20 PAGA em 08/07 (Leonardo Serafim Francisco Ltda), amarrada a este fechamento')
    console.log('        · fechamento com faturamento de R$ 675.600,00 e acordo de 1% cadastrados')
    console.log(`      -> REATIVADO como "vencido" (venc 22/07), ${brl(6756)}, origem "real". Por diretiva do chefe de 27/08.`)
    if (APPLY) {
      await sb.from('erp_contas_receber').update({
        status: 'vencido', origem: 'real',
        tags: [...new Set([...(cr.tags || []).filter(t => t !== 'provisao'), 'a-receber', 'cobranca-pendente'])],
        observacoes: nota(cr.observacoes, `[${HOJE}] REATIVADO por diretiva do chefe: "Falta recebermos agora o Leilão Lagoa dos Patos de Março, Nelore Santa Nazaré de Maio, Nelore São Francisco de Junho". Prevalece sobre o cancelamento de 26/08, que se apoiava na conferência da Ana de 15/07 ("nem dia de leilão nem vendas, nadica"). Lastro do lado da Bula: comissão de R$ 2.100,00 paga ao Fábio Omena em 10/08 sobre R$ 70.000,00 de cobertura, e despesa de R$ 2.030,20 paga em 08/07 amarrada a este fechamento — a Bula trabalhou o leilão. Valor 1% sobre o faturamento de R$ 675.600,00 = R$ 6.756,00; origem passa de "estimativa" para "real". Se a cobrança encontrar um valor diferente do faturado, ajustar o título e não o fechamento.`),
      }).eq('id', ID.crSaoFrancisco)
      await sb.from('bula_leilao_fechamento').update({
        etapa: 'aguardando_recebimento', etapa_atualizada_em: new Date().toISOString(),
        observacoes: nota(f.observacoes, `[${HOJE}] Cobrança REATIVADA por diretiva do chefe — R$ 6.756,00 (1% de R$ 675.600,00) voltam a constar como a receber. O cancelamento de 26/08 vinha da conferência da Ana de 15/07; o chefe listou este leilão entre os que faltam entrar.`),
      }).eq('id', ID.fechSaoFrancisco)
    }
  }
}

/* ═══ CONFERÊNCIA FINAL ══════════════════════════════════════════════════ */
console.log('\n' + '='.repeat(78))
console.log('  POSIÇÃO DOS LEILÕES DA DIRETIVA')
console.log('='.repeat(78))
{
  const alvos = [ID.fechLagoa, ID.fech4r, ID.fechNazare, ID.fechSaoFrancisco, ID.fechMagda, ID.fechMno]
  const { data: fs_ } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,data,receita_bula,etapa').in('id', alvos).order('data')
  const { data: crs } = await sb.from('erp_contas_receber')
    .select('id,fechamento_id,descricao,vencimento,valor,valor_recebido,status').in('fechamento_id', alvos)
  for (const f of fs_ || []) {
    const meus = (crs || []).filter(c => c.fechamento_id === f.id).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
    const vivos = meus.filter(c => ['aberto', 'vencido', 'parcial'].includes(c.status))
    const aReceber = vivos.reduce((s, c) => s + (Number(c.valor) - Number(c.valor_recebido || 0)), 0)
    console.log(`\n  ${String(f.data).slice(0, 10)}  ${f.nome}`)
    console.log(`     etapa ${f.etapa} · receita apurada ${f.receita_bula === null ? '—' : brl(f.receita_bula)} · A RECEBER ${brl(aReceber)}`)
    for (const c of meus) console.log(`       ${String(c.vencimento).slice(0, 10)} ${brl(c.valor).padStart(13)} [${c.status}] ${c.descricao.slice(0, 52)}`)
  }
  if (!(fs_ || []).some(f => f.id === ID.fechMno)) console.log('\n  Nelore MNO — 10/06/2026: fora do sistema. ✓')
}
console.log('\n' + (APPLY ? 'GRAVADO.' : 'DRY-RUN — nada foi gravado. Rode com --apply.') + '\n')
