// Reestruturacao do ERP pela VERDADE correlacionada das fontes — 04/08/2026.
// Fontes: extrato Sicoob 01-04/08 (extrato atualizado.pdf), ancoras de saldo do
// fechamento de julho (29/07=16.850,89; 31/07=25.208,83), apresentacao financeira
// 29/07 (pasta Desktop), app Sicredi 03/08 (CC 0 + aplicacao 27.598,64) e
// confirmacoes do chefe em 04/08:
//   - RS Agropecuaria paga em 05/08; JMP paga em 09/08.
//   - CP antigas reais = SO 1/3 do Fabio (20.215, 10/08) + Rusa + Bulinha.
//   - Comissionados: Douglas, Leonardo, Fabio, Rusa e Bulinha. Demais: desconsiderar.
//   - Folha julho + despesas pagas em 03/08 conforme extrato.
//
// O que faz (todas as gravacoes levam o marcador [ERP-VERDADE 04/08]):
//  A) Reconstroi o gap 25/07-31/07 do Sicoob com 2 eventos conhecidos (TORK/Santa
//     Nazare 12.500 em 28/07; Kito 15.030 em 30/07) + 2 agregados pendentes que
//     fecham as ancoras de saldo do extrato.
//  B) Importa os movimentos de 03/08 e baixa folha julho (Fabio ajustado p/ 7.000)
//     e a CR KatiSpera 11.106.
//  C) CRs: RS -> 05/08; JMP 1/2 -> 09/08; baixa Kriz+Rio Bonito+MEAB (credito Bula
//     Remates NF 624 de 23/07), Katayama Trilogia 1.512 (credito 15/07, dif 8,00).
//  D) Cancela CPs que nao sao divida real: provisoes 18% duplicadas, "Despesas -
//     LEILAO" relancadas, comissoes de nao-comissionados, Santa Nice Douglas
//     (venda cancelada), MEAB Fabio (sem aprovacao), bonus Joao Antonio.
//  E) Folha: Fabio 11.700->7.000 (ago-dez + estrutura); aluguel so ate agosto;
//     tag 'orcamento' nas CPs de fato gerador futuro; desativa nao-comissionados
//     na erp_folha_estrutura; cria CPs dos debitos futuros do extrato (ClickWeb,
//     seguros, DARF funcionarios).
//  F) Sicredi: ajuste da aplicacao p/ 27.598,64 (posicao do app em 03/08).
//
// Idempotente: movimentos por chave natural; CPs/CRs so mudam se ainda nao mudaram.
// Uso: DRY_RUN=1 node scripts/estrutura-erp-verdade-2026-08-04.mjs   (nada grava)
//      node scripts/estrutura-erp-verdade-2026-08-04.mjs             (grava)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100
const now = () => new Date().toISOString()
const MARK = '[ERP-VERDADE 04/08]'

const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const SICREDI = 'af4724ec-e098-4e13-b172-04b2bfb1949d'
const ANCORA_29_07 = 16850.89
const ANCORA_31_07 = 25208.83
const ANCORA_03_08 = 500.86
const SICREDI_03_08 = 27598.64
const FONTE = 'Extrato Sicoob 01-04/08/2026 (extrato atualizado.pdf) + ancoras do fechamento de julho + confirmacoes do chefe 04/08/2026'

const CAT = {
  COMISSOES_RECEBIDAS: '0153d30c-e167-40c6-9c5a-2605bd39dc6e',
  FOLHA: '4c79d95f-a8a4-4aff-9f7a-cd82f974c4b3',
  MARKETING: '26762d4e-b517-48b9-98f3-155a6421264e',
  TARIFAS: 'f8ae3a53-bb4e-414e-97d1-ebdca81df658',
  OUTRAS_DESPESAS: '20c2defd-415c-42cc-8939-fcd8cf104280',
  APLICACAO: 'e7198fb9-acfc-4b22-a738-dcf72000dd31',
  SERVICOS_TERCEIROS: '1f72e05d-01ed-474b-bc83-90974be930f9',
  SEGUROS: '4e96d8bf-f4f7-47d9-8d1b-f8035e7be97e',
  ENCARGOS_SOCIAIS: '05a6785c-3fe2-4411-a70e-5f2ac7083863',
}

function docId(conta, m) { return 'SICOOB-2026-' + createHash('md5').update(`${conta}|${m.data}|${m.tipo}|${r2(m.valor)}|${m.desc}`).digest('hex').slice(0, 16).toUpperCase() }

async function upsertMov(conta, m) {
  const { data: ex } = await sb.from('erp_movimentos_bancarios')
    .select('id').eq('conta_bancaria_id', conta).eq('data', m.data).eq('tipo', m.tipo)
    .eq('valor', r2(m.valor)).eq('descricao', m.desc).maybeSingle()
  if (ex) { console.log(`[=] mov ja existe ${m.data} ${m.tipo} ${brl(m.valor)} :: ${m.desc.slice(0, 55)}`); return ex.id }
  const payload = {
    conta_bancaria_id: conta, data: m.data, tipo: m.tipo, descricao: m.desc, valor: r2(m.valor),
    categoria_id: m.cat || null, pessoa_id: m.pessoa || null, origem: 'importacao_sicoob_2026',
    documento: docId(conta, m), observacoes: `${MARK} ${FONTE}${m.nota ? ' | ' + m.nota : ''}`,
    status_conciliacao: m.status, conciliado: m.status === 'conciliado',
    conta_pagar_id: m.cp || null, conta_receber_id: m.cr || null,
  }
  if (DRY_RUN) { console.log(`[+] mov ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(13)} [${m.status}] ${m.desc.slice(0, 55)}`); return null }
  const { data, error } = await sb.from('erp_movimentos_bancarios').insert(payload).select('id').single()
  if (error) throw new Error(`mov ${m.data} ${brl(m.valor)}: ${error.message}`)
  console.log(`[+] mov ${m.data} ${m.tipo.padEnd(7)} ${brl(m.valor).padStart(13)} [${m.status}] ${m.desc.slice(0, 55)}`)
  return data.id
}

async function allRows(table) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}
const CP_ALL = await allRows('erp_contas_pagar')
const CR_ALL = await allRows('erp_contas_receber')
function byPrefix(rows, id8, label) {
  const hit = rows.filter((r) => r.id.startsWith(id8))
  if (hit.length !== 1) throw new Error(`${label} prefixo ${id8} resolveu ${hit.length} (esperado 1)`)
  return hit[0]
}
async function cp(id8) { return byPrefix(CP_ALL, id8, 'CP') }
async function cr(id8) { return byPrefix(CR_ALL, id8, 'CR') }
async function updCP(row, patch, motivo) {
  const obs = `${row.observacoes ? row.observacoes + ' ' : ''}${MARK} ${motivo}`
  if (DRY_RUN) { console.log(`[~] CP ${row.id.slice(0, 8)} ${JSON.stringify(patch)} :: ${motivo.slice(0, 80)}`); return }
  const { error } = await sb.from('erp_contas_pagar').update({ ...patch, observacoes: obs, updated_at: now() }).eq('id', row.id)
  if (error) throw new Error(`CP ${row.id}: ${error.message}`)
  console.log(`[~] CP ${row.id.slice(0, 8)} ${row.descricao.slice(0, 55)} => ${JSON.stringify(patch).slice(0, 90)}`)
}
async function updCR(row, patch, motivo) {
  const obs = `${row.observacoes ? row.observacoes + ' ' : ''}${MARK} ${motivo}`
  if (DRY_RUN) { console.log(`[~] CR ${row.id.slice(0, 8)} ${JSON.stringify(patch)} :: ${motivo.slice(0, 80)}`); return }
  const { error } = await sb.from('erp_contas_receber').update({ ...patch, observacoes: obs, updated_at: now() }).eq('id', row.id)
  if (error) throw new Error(`CR ${row.id}: ${error.message}`)
  console.log(`[~] CR ${row.id.slice(0, 8)} ${row.descricao.slice(0, 55)} => ${JSON.stringify(patch).slice(0, 90)}`)
}

console.log(DRY_RUN ? '*** DRY RUN (nada grava) ***\n' : '*** GRAVANDO EM PRODUCAO ***\n')

// ============================================================
// A) GAP 25/07-31/07 — ancoras: 24/07=1.317,97 -> 29/07=16.850,89 -> 31/07=25.208,83
// ============================================================
console.log('--- A) Gap 25/07-31/07 (Sicoob) ---')
{
  const { data: contaRow } = await sb.from('erp_contas_bancarias').select('saldo_atual').eq('id', SICOOB).single()
  console.log(`Saldo ERP Sicoob antes: ${brl(contaRow.saldo_atual)} (esperado 1.317,97 de 24/07)`)

  const crSantaNazare = await cr('7c24fbc8') // 12.524 Santa Nazare
  const crKito1 = await cr('a7258f87')       // 15.030 Kito 1/2

  const movTork = await upsertMov(SICOOB, {
    data: '2026-07-28', tipo: 'entrada', valor: 12500.00, desc: 'CREDITO - TORK (LEILAO NELORE SANTA NAZARE 09/06)',
    cat: CAT.COMISSOES_RECEBIDAS, status: 'conciliado', cr: crSantaNazare.id,
    nota: 'TORK 12.500 = CR Santa Nazare 12.524 (dif R$ 24,00 tratada como desconto). Identificado na conferencia da apresentacao de 29/07.',
  })
  // agregado 25-29/07: fecha a ancora de 16.850,89
  const resid2529 = r2(ANCORA_29_07 - 1317.97 - 12500.00) // +3.032,92
  await upsertMov(SICOOB, {
    data: '2026-07-29', tipo: 'entrada', valor: Math.abs(resid2529), desc: 'MOVIMENTOS AGREGADOS 25-29/07 (extrato a detalhar)',
    status: 'pendente',
    nota: `Residual que fecha o SALDO DO DIA 29/07 = ${brl(ANCORA_29_07)} (apresentacao 29/07). Substituir pelos lancamentos reais quando o extrato 25-29/07 for puxado.`,
  })
  const movKito = await upsertMov(SICOOB, {
    data: '2026-07-30', tipo: 'entrada', valor: 15030.00, desc: 'CREDITO - KITO (LEILAO 09/05) - COMISSAO BULA 1/2',
    cat: CAT.COMISSOES_RECEBIDAS, status: 'classificado', cr: crKito1.id,
    nota: 'PROVAVEL: fechamento de julho concluiu Kito 1/2 recebido em 30-31/07 (liquido do periodo +8.357,94). Confirmar no extrato 30-31/07.',
  })
  const resid3031 = r2(ANCORA_31_07 - ANCORA_29_07 - 15030.00) // -6.672,06
  await upsertMov(SICOOB, {
    data: '2026-07-31', tipo: 'saida', valor: Math.abs(resid3031), desc: 'MOVIMENTOS AGREGADOS 30-31/07 (extrato a detalhar)',
    status: 'pendente',
    nota: `Residual que fecha o SALDO ANTERIOR 31/07 = ${brl(ANCORA_31_07)} (extrato 04/08). Substituir pelos lancamentos reais quando o extrato 30-31/07 for puxado.`,
  })

  if (crSantaNazare.status !== 'recebido') {
    await updCR(crSantaNazare, { status: 'recebido', valor_recebido: 12500.00, desconto: 24.00, data_recebimento: '2026-07-28', forma_recebimento: 'pix', conta_bancaria_id: SICOOB },
      'Recebida 28/07 via TORK 12.500 (dif 24,00 = desconto). Estava marcada vencida — o ERP exagerava a inadimplencia.')
  } else console.log('[=] CR Santa Nazare ja recebida')
  if (crKito1.status !== 'recebido') {
    await updCR(crKito1, { status: 'recebido', valor_recebido: 15030.00, data_recebimento: '2026-07-30', conta_bancaria_id: SICOOB },
      'Recebida 30/07 (PROVAVEL — liquido 30-31/07 do fechamento de julho). Confirmar no extrato 30-31/07.')
  } else console.log('[=] CR Kito 1/2 ja recebida')
}

// ============================================================
// B) MOVIMENTOS DE 03/08 (extrato atualizado.pdf) + baixas folha julho + KatiSpera
// ============================================================
console.log('\n--- B) 03/08: folha julho, acertos, KatiSpera ---')
{
  // pessoas conhecidas
  const { data: pesVal } = await sb.from('erp_pessoas').select('id').eq('documento', '039.704.201-99').maybeSingle()
  const { data: pesAna } = await sb.from('erp_pessoas').select('id').eq('documento', '005.308.191-98').maybeSingle()

  const cpFabioJul = await cp('2ffc43ec')   // Folha Julho Fabio 11.700 -> 7.000
  const cpDouglasJul = await cp('e5a5650f') // 3.600
  const cpLeoJul = await cp('4cfc4fea')     // 13.500
  const cpJGJul = await cp('fd5185e5')      // 2.000
  const cpJAJul = await cp('0b086572')      // 2.000
  const cpJEJul = await cp('5bae3074')      // 3.000 — fica aberta (pix 5.000 nao identificado)
  const crKati = await cr('ffa9625b')       // KatiSpera 11.106

  // Ajusta a CP do Fabio para a folha nova ANTES da baixa
  if (r2(cpFabioJul.valor) !== 7000) {
    await updCP(cpFabioJul, { valor: 7000 }, 'Folha nova desde a competencia julho (decisao chefe 29/07): Fabio 11.700 -> 7.000. Pago 7.000 em 03/08 conforme extrato.')
    cpFabioJul.valor = 7000
  }

  const movs = [
    { data: '2026-08-03', tipo: 'saida', valor: 2.08, desc: 'TARIFA COBRANCA', cat: CAT.TARIFAS, status: 'classificado' },
    { data: '2026-08-03', tipo: 'saida', valor: 230.00, desc: 'PIX EMIT.OUTRA IF - 03.632.925/0001-43', status: 'pendente', nota: 'Sem memo no extrato — identificar contraparte.' },
    { data: '2026-08-03', tipo: 'saida', valor: 216.34, desc: 'PIX EMIT.OUTRA IF - Acerto Bula Assessoria Val (Valdeneusa Felix)', cat: CAT.OUTRAS_DESPESAS, pessoa: pesVal?.id, status: 'classificado', nota: 'CPF ***.704.201 = Valdeneusa Felix.' },
    { data: '2026-08-03', tipo: 'saida', valor: 239.06, desc: 'PIX EMIT.OUTRA IF - Acerto Bula Assessoria (Ana Paula Porfirio Munhoz)', cat: CAT.OUTRAS_DESPESAS, pessoa: pesAna?.id, status: 'classificado', nota: 'CPF ***.308.191 = Ana Paula (ex-financeiro).' },
    { data: '2026-08-03', tipo: 'saida', valor: 7000.00, desc: 'PIX EMIT.OUTRA IF - Fabio Omena salario Julho 2026', cat: CAT.FOLHA, status: 'conciliado', cp: cpFabioJul.id, nota: 'Folha nova: 7.000 (era 11.700 ate junho).' },
    { data: '2026-08-03', tipo: 'saida', valor: 13500.00, desc: 'DB.TR.C.DIF.TIT.INT - LEONARDO SERAFIM FRANCISCO LTDA - Julho nfs 14', cat: CAT.FOLHA, status: 'conciliado', cp: cpLeoJul.id },
    { data: '2026-08-03', tipo: 'saida', valor: 3600.00, desc: 'PIX EMIT.OUTRA IF - Julho nfs 36 2026 Douglas Bispo', cat: CAT.FOLHA, status: 'conciliado', cp: cpDouglasJul.id },
    { data: '2026-08-03', tipo: 'saida', valor: 2000.00, desc: 'PIX EMIT.OUTRA IF - Despesas marketing collab campanha Sao Geraldo', cat: CAT.MARKETING, status: 'classificado', nota: 'Agencia 49.103.031/0001-67.' },
    { data: '2026-08-03', tipo: 'saida', valor: 2000.00, desc: 'PIX EMIT.OUTRA IF - salario Joao Gabriel Julho 2026', cat: CAT.FOLHA, status: 'conciliado', cp: cpJGJul.id },
    { data: '2026-08-03', tipo: 'saida', valor: 2000.00, desc: 'PIX EMIT.OUTRA IF - salario Julho 2026 (***.266.771)', cat: CAT.FOLHA, status: 'conciliado', cp: cpJAJul.id, nota: 'Atribuido a JOAO ANTONIO por eliminacao (unico 2.000 de folha julho restante). CPF nao cadastrado — confirmar.' },
    { data: '2026-08-03', tipo: 'saida', valor: 5000.00, desc: 'PIX EMIT.OUTRA IF - salario Julho nfs 3 2026 (***.037.156)', cat: CAT.FOLHA, status: 'pendente', nota: 'A IDENTIFICAR: CPF ***.037.156 nao cadastrado. Nao casa com a CP de folha do Joao Eduardo (3.000). Pode ser reajuste, parceria ou outro acerto — confirmar com o chefe.' },
    { data: '2026-08-03', tipo: 'saida', valor: 26.49, desc: 'PIX EMIT.OUTRA IF - 00.360.305/0001-04', status: 'pendente', nota: 'Sem memo no extrato — identificar contraparte.' },
    { data: '2026-08-03', tipo: 'entrada', valor: 11106.00, desc: 'CRED.TED-STR - JOSE ODEMIR SPAGGIARI (3o LEILAO MATRIZES KATISPERA)', cat: CAT.COMISSOES_RECEBIDAS, status: 'conciliado', cr: crKati.id, nota: 'TED T1082329088.' },
  ]
  for (const m of movs) await upsertMov(SICOOB, m)

  // Baixas de folha julho
  const baixas = [
    [cpFabioJul, 7000], [cpDouglasJul, 3600], [cpLeoJul, 13500], [cpJGJul, 2000], [cpJAJul, 2000],
  ]
  for (const [row, pago] of baixas) {
    if (row.status === 'pago') { console.log(`[=] CP folha ja paga: ${row.descricao.slice(0, 50)}`); continue }
    await updCP(row, { status: 'pago', valor_pago: pago, data_pagamento: '2026-08-03', forma_pagamento: 'pix', conta_bancaria_id: SICOOB },
      'Folha julho paga em 03/08 conforme extrato Sicoob.')
  }
  if (cpJEJul.status !== 'pago') {
    await updCP(cpJEJul, {}, 'NAO baixada: o unico pix restante de 03/08 e de 5.000 (***.037.156, "nfs 3"), que nao casa com esta CP de 3.000. Identificar antes de baixar.')
  }
  if (crKati.status !== 'recebido') {
    await updCR(crKati, { status: 'recebido', valor_recebido: 11106.00, data_recebimento: '2026-08-03', forma_recebimento: 'ted', conta_bancaria_id: SICOOB },
      'Recebida 03/08 — TED JOSE ODEMIR SPAGGIARI 11.106,00 (extrato).')
  } else console.log('[=] CR KatiSpera ja recebida')
}

// ============================================================
// C) CRs: datas confirmadas pelo chefe + baixas retroativas identificadas
// ============================================================
console.log('\n--- C) Contas a receber ---')
{
  const crRS = await cr('c274fa7e')
  if (crRS.vencimento !== '2026-08-05') {
    await updCR(crRS, { vencimento: '2026-08-05' }, 'Chefe 04/08 (WhatsApp): RS Agropecuaria paga em 05/08.')
  } else console.log('[=] CR RS ja em 05/08')

  for (const pref of ['939917d7', '759da19c']) {
    const row = await cr(pref)
    if (row.vencimento !== '2026-08-09') {
      await updCR(row, { vencimento: '2026-08-09' }, 'Chefe 04/08: JMP paga a 1a parcela em 09/08 (mestra ja apontava 09/08; ERP dizia 14/08).')
    } else console.log(`[=] CR JMP ${pref} ja em 09/08`)
  }

  // Credito Bula Remates NF 624 (23/07, 51.200,10) cobre Kriz + Rio Bonito + MEAB = 42.117
  const trio = [['a3b4fbac', 16122.00, 'NELORE KRIZ'], ['52b92610', 825.00, 'RIO BONITO'], ['91c17659', 25170.00, 'MEAB E FAZENDA MODELO']]
  for (const [pref, valor, nome] of trio) {
    const row = await cr(pref)
    if (row.status === 'recebido') { console.log(`[=] CR ${nome} ja recebida`); continue }
    await updCR(row, { status: 'recebido', valor_recebido: valor, data_recebimento: '2026-07-23', forma_recebimento: 'pix', conta_bancaria_id: SICOOB },
      `Recebida no credito Bula Remates NF 624 de 23/07 (51.200,10 = Kriz 16.122 + Rio Bonito 825 + MEAB 25.170 + sobra 9.083,10 sem rateio identificado — conferir com a Remates).`)
  }

  const crKatayama = await cr('60daa4cf')
  if (crKatayama.status !== 'recebido') {
    await updCR(crKatayama, { status: 'recebido', valor_recebido: 1520.00, juros: 8.00, data_recebimento: '2026-07-15', forma_recebimento: 'pix', conta_bancaria_id: SICOOB },
      'Recebida 15/07: credito KATAYAMA AGRONEGOCIOS 1.520,00 (CR 1.512,00 + 8,00 de juros) — pendencia da conciliacao de 20/07 resolvida.')
  } else console.log('[=] CR Katayama Trilogia ja recebida')
}

// ============================================================
// D) CPs que NAO sao divida real -> cancelado (com nota; reversivel)
// ============================================================
console.log('\n--- D) Saneamento de CPs ---')
{
  const DESPESAS_LEILAO = ['003275bc', '34d59f16', '47ae0e08', '43c794fc', '67a4f3ee', '3fbb5e86', '483629be', '95b984d2', 'f72d54e6', '26eb8fa4']
  const IMPOSTO_18 = ['3436022a', '72dbedcc', 'cabf61bf', '63d0dfa7', 'e030e93e', '4b96719f', '64e3eb55', 'ff8040bc', 'b35a90c4', 'e49dc419', 'b712872f', '1a44f429', '174e29bf']
  const NAO_COMISSIONADOS = [
    ['eaaca142', 'Alex Sobrinho'], ['b7758083', 'Lucas Martins'], ['f95d291c', 'Peralta'],
    ['bf3337c3', 'Matheus Alves'], ['00fb8fd7', 'Fabricio Hyppolito'],
  ]
  const cancels = [
    ...DESPESAS_LEILAO.map((p) => [p, 'Titulo "Despesas - LEILAO" e a comissao do mesmo leilao relancada com outro nome (dupla contagem — auditoria 29/07). A despesa operacional real esta no extrato. Nao e divida com terceiros (chefe 04/08).']),
    ...IMPOSTO_18.map((p) => [p, 'Provisao de 18% por leilao duplicada: o imposto real e a guia DAS/ISSQN (DAS junho 28.660,03 pago em 20/07). Nao e divida real (auditoria 29/07 + chefe 04/08).']),
    ...NAO_COMISSIONADOS.map(([p, nome]) => [p, `Comissionados reais da operacao sao apenas Douglas, Leonardo, Fabio, Rusa e Bulinha (chefe 04/08). CP de ${nome} nao e divida real.`]),
    ['4507aa06', 'Venda cancelada (Santa Nice Douglas) — ja constava [CANCELADO 22/07/2026] na observacao, mas o status havia voltado a vencido. Confirmado cancelamento.'],
    ['47d40e98', 'MEAB Virtual Fabio 2.421: "venda sem aprovacao", fora da base do acerto de junho (60.645). Chefe 04/08: unica divida antiga do Fabio e o 1/3 (20.215, venc 10/08).'],
    ['c6f9f35c', 'Bonus meta batida JMP (Joao Antonio): nao esta entre as dividas antigas reais (chefe 04/08: so 1/3 Fabio + Rusa + Bulinha).'],
  ]
  for (const [pref, motivo] of cancels) {
    const row = await cp(pref)
    if (row.status === 'cancelado') { console.log(`[=] CP ${pref} ja cancelada`); continue }
    if (row.status === 'pago') { console.log(`[!] CP ${pref} esta PAGA — nao mexo (${row.descricao.slice(0, 50)})`); continue }
    await updCP(row, { status: 'cancelado' }, `CANCELADA: ${motivo}`)
  }
}

// ============================================================
// E) Folha nova, aluguel ate agosto, tag orcamento, estrutura, debitos futuros
// ============================================================
console.log('\n--- E) Folha/orcamento ---')
{
  // Fabio ago-dez: 11.700 -> 7.000
  for (const pref of ['e3bcce6c', '76361317', '4bbc5c94', '19e98105', '566a09ba']) {
    const row = await cp(pref)
    if (r2(row.valor) === 7000) { console.log(`[=] CP ${pref} ja em 7.000`); continue }
    await updCP(row, { valor: 7000 }, 'Folha nova desde julho (decisao chefe 29/07): Fabio 11.700 -> 7.000.')
  }
  // Aluguel so ate agosto
  for (const pref of ['c68b8dfa', '93ea568e', '34a61106', '6d463c64']) {
    const row = await cp(pref)
    if (row.status === 'cancelado') { console.log(`[=] aluguel ${pref} ja cancelado`); continue }
    await updCP(row, { status: 'cancelado' }, 'CANCELADA: contrato de aluguel vai so ate agosto/2026 (pendencia da apresentacao de 29/07). Ultima parcela real = venc 10/08.')
  }
  // Tag 'orcamento' nas CPs de fato gerador futuro (folha ago-dez, fixos set+, SDR ago+).
  // Corte em 31/08: a comissao SDR ref. julho (venc 25/08) tem fato gerador ocorrido.
  const { data: futuras } = await sb.from('erp_contas_pagar')
    .select('id,descricao,vencimento,tags,status')
    .gte('vencimento', '2026-08-31').in('status', ['aberto', 'vencido'])
  for (const row of futuras || []) {
    const tags = Array.isArray(row.tags) ? row.tags : []
    if (tags.includes('orcamento')) { console.log(`[=] tag ja em ${row.descricao.slice(0, 45)}`); continue }
    if (DRY_RUN) { console.log(`[~] tag orcamento -> ${row.vencimento} ${row.descricao.slice(0, 55)}`); continue }
    const { error } = await sb.from('erp_contas_pagar').update({ tags: [...tags, 'orcamento'], updated_at: now() }).eq('id', row.id)
    if (error) throw new Error(`tag ${row.id}: ${error.message}`)
    console.log(`[~] tag orcamento -> ${row.vencimento} ${row.descricao.slice(0, 55)}`)
  }
  // Estrutura de folha: Fabio 7.000; desativa quem nao e comissionado/equipe
  const { data: estrutura } = await sb.from('erp_folha_estrutura').select('id,nome,salario_fixo,ativo')
  for (const f of estrutura || []) {
    if (/FABIO/i.test(f.nome) && r2(f.salario_fixo) !== 7000) {
      if (!DRY_RUN) await sb.from('erp_folha_estrutura').update({ salario_fixo: 7000, updated_at: now() }).eq('id', f.id)
      console.log(`[~] estrutura: ${f.nome} fixo -> 7.000`)
    }
    if (/^(NANE|LAILA|PERALTA|MARCELO CARNEIRO|FABRICIO|LUCAS MARTINS|MATHEUS ALVES)/i.test(f.nome) && f.ativo) {
      if (!DRY_RUN) await sb.from('erp_folha_estrutura').update({ ativo: false, observacao: `${MARK} Desativado: comissionados reais sao Douglas, Leonardo, Fabio, Rusa e Bulinha (chefe 04/08).`, updated_at: now() }).eq('id', f.id)
      console.log(`[~] estrutura: ${f.nome} -> inativo`)
    }
  }
  // CPs dos debitos futuros do extrato (agendados no banco)
  const novasCPs = [
    { doc: 'SICOOB-AGENDADO-2026-08-10-CLICKWEB', desc: 'Site ClickWeb (boleto agendado)', valor: 218.30, venc: '2026-08-10', cat: CAT.SERVICOS_TERCEIROS },
    { doc: 'SICOOB-AGENDADO-2026-08-17-SEGURO-1', desc: 'Seguro Sicoob (deb. automatico 17/08)', valor: 62.04, venc: '2026-08-17', cat: CAT.SEGUROS },
    { doc: 'SICOOB-AGENDADO-2026-08-17-SEGURO-2', desc: 'Seguro Sicoob (deb. automatico 17/08)', valor: 122.60, venc: '2026-08-17', cat: CAT.SEGUROS },
    { doc: 'SICOOB-AGENDADO-2026-08-20-DARF-FUNC', desc: 'DARF funcionarios (deb. agendado 20/08)', valor: 1114.60, venc: '2026-08-20', cat: CAT.ENCARGOS_SOCIAIS },
  ]
  for (const n of novasCPs) {
    const { data: ex } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', n.doc).maybeSingle()
    if (ex) { console.log(`[=] CP agendada ja existe: ${n.desc}`); continue }
    if (DRY_RUN) { console.log(`[+] CP ${n.venc} ${brl(n.valor)} ${n.desc}`); continue }
    const { error } = await sb.from('erp_contas_pagar').insert({
      descricao: n.desc, valor: n.valor, vencimento: n.venc, emissao: '2026-08-04', status: 'aberto',
      categoria_id: n.cat, conta_bancaria_id: SICOOB, numero_documento: n.doc,
      observacoes: `${MARK} Lancamento futuro agendado no extrato Sicoob de 04/08.`,
    })
    if (error) throw new Error(`CP nova ${n.desc}: ${error.message}`)
    console.log(`[+] CP ${n.venc} ${brl(n.valor)} ${n.desc}`)
  }
}

// ============================================================
// F) Sicredi: posicao do app 03/08 = CC 0,00 + aplicacao 27.598,64
// ============================================================
console.log('\n--- F) Sicredi ---')
{
  const { data: contaRow } = await sb.from('erp_contas_bancarias').select('saldo_atual').eq('id', SICREDI).single()
  const atual = r2(contaRow.saldo_atual)
  const delta = r2(SICREDI_03_08 - atual)
  if (delta === 0) console.log('[=] Sicredi ja em 27.598,64')
  else {
    await upsertMov(SICREDI, {
      data: '2026-08-03', tipo: delta < 0 ? 'saida' : 'entrada', valor: Math.abs(delta),
      desc: 'AJUSTE POSICAO APLICACAO (app Sicredi 03/08 13:31)', cat: CAT.APLICACAO, status: 'pendente',
      nota: `Aplicacao caiu de 29.577,20 (20/07) para 27.598,64 (03/08) sem extrato — variacao ${brl(delta)}. Puxar extrato da aplicacao para detalhar.`,
    })
  }
}

// ============================================================
// Validacao final: saldos derivados
// ============================================================
if (!DRY_RUN) {
  console.log('\n--- Validacao ---')
  for (const [nome, id, esperado] of [['Sicoob', SICOOB, ANCORA_03_08], ['Sicredi', SICREDI, SICREDI_03_08]]) {
    const { data: rec, error } = await sb.rpc('erp_recalc_saldo', { p_conta: id })
    if (error) throw new Error(`recalc ${nome}: ${error.message}`)
    console.log(`${nome}: saldo derivado ${brl(rec)} (banco: ${brl(esperado)}) ${r2(rec) === esperado ? '✓ BATE' : '✗ NAO BATE'}`)
  }
} else {
  console.log('\nDRY RUN concluido — rode sem DRY_RUN para gravar.')
}
