/**
 * Lanca no ERP a RECEITA (contas a receber) e as COMISSOES (contas a pagar) dos
 * leiloes de JULHO e AGOSTO/2026, que estavam integralmente ausentes: a ultima
 * CR emitida era de 23/06/2026.
 *
 * Fontes:
 *  - Valor da receita e vencimentos explicitos: planilha-mestra "FINANCEIRO BULA 2026"
 *    do Drive (aba Leiloes, versao de 13/08/2026). Julho soma 168.564,50 e agosto 227.113,00.
 *  - Cobertura / comissao por assessor: bula_leilao_fechamento ja alinhado ao
 *    HastaPro FIL '2' (script alinha-fechamentos-agosto-2026-hastapro.mjs).
 *
 * NAO cria provisao de imposto de 18% em conta a pagar: essas CP foram canceladas
 * no saneamento de 04/08 porque duplicavam a guia do DAS. O 18% entra so como
 * `sobra_bruta` analitica no fechamento (receita x 0,82 - comissao), igual a coluna
 * LIQUIDO da planilha.
 *
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

const CAT_CR = 'e74434bd-3366-4015-9268-15d6640cf15f' // receita Comissao Leilao
const CAT_CP = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e' // despesa Comissao Funcionario
const PESSOA = {
  PROGRAMA: 'cdfed41f-ff46-4519-8dff-10d8d8fccaa5', // PROGRAMA LEILOES
  ERURAL: '7deed7a0-234a-44c8-8000-5b00b90753ed',   // E-RURAL
  REMATES: '0e458050-bf86-4c52-9a4e-a06d0b94a386',  // BULA REMATES
}
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const fmt = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const d45 = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 45); return d.toISOString().slice(0, 10) }
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }

/**
 * doc  = chave idempotente
 * fech = fechamento no admin (null quando o leilao nao tem cobertura registrada)
 * base = como a receita foi calculada, para a observacao
 */
const RECEITAS = [
  // ---------------- JULHO/2026 — 168.564,50 ----------------
  { doc: 'BULA-2026-CR-NAVIRAI-MATRIZES-20260705', data: '2026-07-05', venc: null, valor: 8400.00,
    desc: 'LEILAO VIRTUAL NAVIRAI - MATRIZES (05/07) - COMISSAO BULA', cli: PESSOA.PROGRAMA,
    fech: 'e058a74f-1b06-46dc-8152-43f682fc5d09', base: '5% da venda sobre cobertura de R$ 168.000,00.', st: 'COBRAR' },
  { doc: 'BULA-2026-CR-KIRZ-TOUROS-20260707', data: '2026-07-07', venc: '2026-08-20', valor: 10164.00,
    desc: 'LEILAO TOUROS NELORE KIRZ (07/07) - BULA REMATES', cli: PESSOA.REMATES,
    fech: null, base: '1% sobre o faturamento total de R$ 1.016.400,00 (leilao da Bula Remates, FIL 01 do HastaPro).', st: 'A RECEBER 20/08' },
  { doc: 'BULA-2026-CR-EAO-BAVIERA-20260711', data: '2026-07-11', venc: null, valor: 48556.50,
    desc: 'MEGA EVENTO EAO BAVIERA (10-11/07) - COMISSAO BULA', cli: PESSOA.PROGRAMA,
    fech: '135016c0-c0be-4e28-b80a-7fca4b759d1e', base: '0,33% sobre o faturamento de R$ 14.714.090,00 (etapa femeas). A etapa TOUROS de 12/07 ainda esta sem faturamento total informado pela leiloeira - pode gerar receita adicional.', st: 'COBRAR' },
  { doc: 'BULA-2026-CR-SORRISO-FEMEAS-20260712', data: '2026-07-12', venc: null, valor: 7950.00,
    desc: 'LEILAO NELORE SORRISO - ETAPA FEMEAS (12/07) - COMISSAO BULA', cli: PESSOA.ERURAL,
    fech: '3df75f54-c2dc-4ba6-8c1d-cf9d1fb098dd', base: '5% da venda sobre cobertura de R$ 159.000,00 (E-Rural, sem presencial).', st: 'COBRAR' },
  { doc: 'BULA-2026-CR-NAVIRAI-2ETAPA-20260716', data: '2026-07-16', venc: null, valor: 7935.00,
    desc: '2a ETAPA NAVIRAI MATRIZES (16/07) - COMISSAO BULA', cli: PESSOA.PROGRAMA,
    fech: '0ba4d4d9-0235-4cfe-9db4-ae49208e7f75', base: '5% da venda sobre cobertura de R$ 158.700,00.', st: 'COBRAR' },
  { doc: 'BULA-2026-CR-GUADALUPE-FEMEAS-20260718', data: '2026-07-18', venc: null, valor: 3000.00,
    desc: '20o LEILAO GUADALUPE AGROPECUARIA - FEMEAS (18/07) - COMISSAO BULA', cli: PESSOA.PROGRAMA,
    fech: '1d6e69a3-ff25-404e-9c0a-dc7384620de1', base: 'Femeas Guadalupe = 5% do que vender; cobertura R$ 60.000,00.', st: 'EM FECHAMENTO' },
  { doc: 'BULA-2026-CR-GUADALUPE-TOUROS-20260719', data: '2026-07-19', venc: null, valor: 29641.35,
    desc: '20o LEILAO GUADALUPE AGROPECUARIA - TOUROS (19-20/07) - COMISSAO BULA', cli: PESSOA.PROGRAMA,
    fech: 'c8cba93d-8fa9-4e80-9aa7-e2706a2d54b4', base: '0,75% sobre faturamento de R$ 3.952.180,00 (faixa "acima de 20 touros"). Cobertura R$ 299.100,00 nos dois pregoes (19 e 20/07).', st: 'EM FECHAMENTO' },
  { doc: 'BULA-2026-CR-NELORACO-PO-20260725', data: '2026-07-25', venc: '2026-08-20', valor: 25155.00,
    desc: 'NELORACO PO (25/07) - BULA REMATES', cli: PESSOA.REMATES,
    fech: null, base: '1% sobre o faturamento total de R$ 2.515.500,00 (leilao da Bula Remates).', st: 'A RECEBER 20/08' },
  { doc: 'BULA-2026-CR-GEN-ADITIVA-FEMEAS-20260725', data: '2026-07-25', venc: null, valor: 6318.90,
    desc: '23o MEGA LEILAO GENETICA ADITIVA - FEMEAS (25/07) - COMISSAO BULA', cli: PESSOA.PROGRAMA,
    fech: 'ce9612c4-c688-4652-8e31-acd29bf976d0', base: '0,35% sobre faturamento de R$ 1.805.400,00.', st: 'COBRAR' },
  { doc: 'BULA-2026-CR-GEN-ADITIVA-TOUROS-20260726', data: '2026-07-26', venc: null, valor: 21443.75,
    desc: '23o MEGA LEILAO GENETICA ADITIVA - TOUROS (26/07) - COMISSAO BULA', cli: PESSOA.PROGRAMA,
    fech: '50bf395a-fee9-4051-9d00-3a72e3c30cd0', base: '0,5% sobre faturamento de R$ 4.288.750,00.', st: 'COBRAR' },

  // ---------------- AGOSTO/2026 — 227.113,00 ----------------
  { doc: 'BULA-2026-CR-SAO-GERALDO-20260801', data: '2026-08-01', venc: '2026-09-20', valor: 50198.00,
    desc: 'LEILAO TOUROS FAZENDA SAO GERALDO (01/08) - BULA REMATES', cli: PESSOA.REMATES,
    fech: null, base: '1% sobre o faturamento total de R$ 5.019.800,00 (leilao da Bula Remates, FIL 01 do HastaPro: R$ 4.980.800,00 em 137 lotes).', st: 'A RECEBER 20/09' },
  { doc: 'BULA-2026-CR-MAFRA-FEMEAS-20260801', data: '2026-08-01', venc: null, valor: 70345.00,
    desc: 'LEILAO FEMEAS NELORE MAFRA - REDENCAO/PA (01/08) - COMISSAO BULA', cli: PESSOA.PROGRAMA,
    fech: '160f04c8-bef6-4eac-a019-756f9790ceb7', base: '1,25% sobre faturamento de R$ 5.627.600,00 (faixa 15,01%-20% de cobertura; cobertura real do HastaPro = R$ 1.042.700,00 = 18,5%).', st: 'EM FECHAMENTO' },
  { doc: 'BULA-2026-CR-MAFRA-TOUROS-20260802', data: '2026-08-02', venc: null, valor: 17857.00,
    desc: 'LEILAO TOUROS NELORE MAFRA - REDENCAO/PA (02/08) - COMISSAO BULA', cli: PESSOA.PROGRAMA,
    fech: '66cda93d-024e-4d16-bf62-2c03a31ac603', base: '0,35% sobre faturamento de R$ 5.102.000,00 conforme a planilha. ATENCAO: a tabela de acordo do Mafra para 3%-8% de cobertura (aqui 3,49%) e 0,3%, o que daria R$ 15.306,00 - confirmar o percentual com o chefe.', st: 'EM FECHAMENTO' },
  { doc: 'BULA-2026-CR-SORRISO-TOUROS-20260804', data: '2026-08-04', venc: null, valor: 5715.00,
    desc: 'LEILAO DE TOUROS NELORE SORRISO (04/08) - COMISSAO BULA', cli: PESSOA.ERURAL,
    fech: '85d2aa7d-c40d-4b6b-9df8-494a0faa9dcd', base: '5% da venda sobre cobertura de R$ 114.300,00 (HastaPro).', st: 'EM FECHAMENTO' },
  { doc: 'BULA-2026-CR-GRUPO-COSTA-20260804', data: '2026-08-04', venc: null, valor: 603.00,
    desc: 'LEILAO TOUROS NELORE GRUPO COSTA (04/08) - COMISSAO BULA', cli: null,
    fech: '7e63204c-a15c-4998-adc1-d77e812acc42', base: '3% da venda sobre cobertura de R$ 20.100,00.', st: 'EM FECHAMENTO' },
  { doc: 'BULA-2026-CR-LS-GALERIA-II-20260807', data: '2026-08-07', venc: null, valor: 57840.00,
    desc: '2o LEILAO LS GALERIA II (07/08) - COMISSAO BULA', cli: PESSOA.ERURAL,
    fech: 'a125d78a-4047-423f-82ba-22846aeff046', base: 'Acordo E-Rural com presencial = 1% do VGV + 4% da venda. Planilha: 1% x 3.680.000 + 4% x 526.000 = 57.840,00. ATENCAO: a cobertura do HastaPro e R$ 576.000,00 (nao 526.000), o que daria R$ 59.840,00 - divergencia de R$ 2.000,00 a conferir antes de faturar.', st: 'EM FECHAMENTO' },
  { doc: 'BULA-2026-CR-PEROLAS-TAPAJOS-20260808', data: '2026-08-08', venc: null, valor: 10650.00,
    desc: '14o LEILAO PEROLAS DO TAPAJOS (08/08) - COMISSAO BULA', cli: null,
    fech: 'ef8870d4-f0b5-4fe4-982c-89459c429cc8', base: '5% da venda sobre cobertura de R$ 213.000,00.', st: 'EM FECHAMENTO' },
  { doc: 'BULA-2026-CR-PARANA-PRODUTIVIDADE-20260809', data: '2026-08-09', venc: null, valor: 13905.00,
    desc: 'LEILAO NELORE PARANA PRODUTIVIDADE (09/08) - COMISSAO BULA', cli: PESSOA.PROGRAMA,
    fech: '0187891f-a1eb-481d-afd5-9330c98ab38f', base: '5% da venda sobre cobertura de R$ 278.100,00 (HastaPro).', st: 'EM FECHAMENTO' },
]

console.log('=== RECEITA E COMISSOES DOS LEILOES DE JUL/AGO 2026 ===\n')

/* ---------- 1) contas a receber ---------- */
let novosCR = 0, somaJul = 0, somaAgo = 0
for (const r of RECEITAS) {
  const venc = r.venc || d45(r.data)
  const { data: ja } = await sb.from('erp_contas_receber').select('id,valor,status').eq('numero_documento', r.doc).limit(1)
  const alvoMes = r.data < '2026-08-01' ? 'jul' : 'ago'
  if (alvoMes === 'jul') somaJul += r.valor; else somaAgo += r.valor
  if (ja && ja.length) { console.log('CR  = ja existe  ' + fmt(r.valor).padStart(12) + '  ' + r.desc.slice(0, 58)); continue }
  novosCR++
  console.log('CR  + ' + r.data + ' venc ' + venc + ' ' + fmt(r.valor).padStart(12) + '  ' + r.desc.slice(0, 56))
  if (APPLY) {
    const { error } = await sb.from('erp_contas_receber').insert({
      descricao: r.desc, valor: r.valor, emissao: r.data, vencimento: venc,
      status: venc < '2026-08-17' ? 'vencido' : 'aberto',
      categoria_id: CAT_CR, cliente_id: r.cli, fechamento_id: r.fech,
      numero_documento: r.doc, tags: ['a-receber', '2026', alvoMes === 'jul' ? 'julho' : 'agosto', 'leilao'],
      observacoes: '[RECEITA JUL-AGO 17/08] ' + r.base + ' Status na planilha-mestra do Drive (13/08): ' + r.st + '.'
        + (r.venc ? '' : ' Vencimento = data do leilao + 45 dias (padrao), pois a planilha nao traz data.'),
    })
    fail(error, 'CR ' + r.desc.slice(0, 24))
  }
}
console.log('-> ' + novosCR + ' CR novas | julho ' + fmt(somaJul) + ' | agosto ' + fmt(somaAgo) + ' | total ' + fmt(somaJul + somaAgo))
console.log('')

/* ---------- 2) receita/sobra no fechamento do admin ---------- */
let fechAt = 0
for (const r of RECEITAS) {
  if (!r.fech) continue
  const { data: f } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,receita_bula,comissao_assessoria,despesas_variaveis,observacoes').eq('id', r.fech).single()
  if (!f) { console.log('FECH ! nao achei ' + r.fech); continue }
  const sobra = r2(r.valor * 0.82 - Number(f.comissao_assessoria || 0) - Number(f.despesas_variaveis || 0))
  if (Math.abs(Number(f.receita_bula || 0) - r.valor) < 0.005) { console.log('FECH = receita ja ok  ' + (f.nome || '').slice(0, 52)); continue }
  fechAt++
  console.log('FECH ~ receita ' + fmt(f.receita_bula || 0).padStart(12) + ' -> ' + fmt(r.valor).padStart(12) + ' | sobra ' + fmt(sobra).padStart(12) + '  ' + (f.nome || '').slice(0, 40))
  if (APPLY) {
    const { error } = await sb.from('bula_leilao_fechamento').update({
      receita_bula: r.valor, sobra_bruta: sobra,
      observacoes: (f.observacoes || '') + '\n[RECEITA 17/08] ' + r.base + ' Sobra bruta = receita x 0,82 (imposto 18%) - comissao dos assessores, igual a coluna LIQUIDO da planilha-mestra.',
    }).eq('id', r.fech)
    fail(error, 'fech receita ' + (f.nome || '').slice(0, 24))
  }
}
console.log('-> ' + fechAt + ' fechamentos com receita atualizada')
console.log('')

/* ---------- 3) comissoes dos assessores de agosto (venc. 25/09) ---------- */
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const { data: fechAgo } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,por_assessor').gte('data', '2026-08-01').lte('data', '2026-08-31').order('data')
let novasCP = 0, somaCP = 0
for (const f of fechAgo || []) {
  for (const a of (f.por_assessor || [])) {
    const valor = r2(a.comissao)
    if (!valor) continue
    const nome = a.nome || 'A DEFINIR'
    const doc = 'com-ago26:' + f.id.slice(0, 8) + ':' + slug(nome)
    const { data: ja } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', doc).limit(1)
    if (ja && ja.length) { console.log('CP  = ja existe  ' + fmt(valor).padStart(11) + '  ' + nome); continue }
    // Regra do chefe: comissao da Nane fica diferida para 28/12.
    const diferido = /^nane$/i.test(nome)
    const venc = diferido ? '2026-12-28' : '2026-09-25'
    const tags = ['a-pagar', 'comissao', '2026', 'agosto', 'leilao'].concat(diferido ? ['nane-acumulado', 'diferido'] : [])
    novasCP++; somaCP += valor
    console.log('CP  + ' + fmt(valor).padStart(11) + ' venc ' + venc + '  ' + (nome + ' (' + (a.comissao_pct * 100).toFixed(2).replace('.', ',') + '%)').padEnd(30) + (f.nome || '').slice(0, 40))
    if (APPLY) {
      const { error } = await sb.from('erp_contas_pagar').insert({
        descricao: 'COMISSAO ' + (f.nome || '') + ' - ' + nome.toUpperCase() + ' (' + (a.comissao_pct * 100).toFixed(2).replace('.', ',') + '%)',
        valor, emissao: f.data, vencimento: venc, status: 'aberto',
        categoria_id: CAT_CP, fechamento_id: f.id, numero_documento: doc, tags,
        observacoes: '[COMISSOES AGOSTO 17/08] Base = cobertura de R$ ' + fmt(a.vgv) + ' (' + a.transacoes + ' lote(s) / ' + a.animais + ' animais) no fechamento alinhado ao HastaPro FIL 2. Ciclo: comissao paga no dia 25 do mes seguinte.'
          + (diferido ? ' Comissao da Nane fica acumulada para 28/12/2026 (regra do chefe).' : ''),
      })
      fail(error, 'CP comissao ' + nome)
    }
  }
}
console.log('-> ' + novasCP + ' CP de comissao de agosto, total ' + fmt(somaCP))

/* ---------- 4) totais ---------- */
const { data: crAll } = await sb.from('erp_contas_receber').select('valor,valor_recebido,status')
const aberto = (crAll || []).filter(c => !['recebido', 'cancelado'].includes(c.status))
  .reduce((s, c) => s + Number(c.valor) - Number(c.valor_recebido || 0), 0)
console.log('\nCR em aberto no ERP: ' + fmt(aberto))
console.log(APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.')
