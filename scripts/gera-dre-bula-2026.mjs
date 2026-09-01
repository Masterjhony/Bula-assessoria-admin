/**
 * DRE BULA ASSESSORIA 2026 - janeiro a agosto, preenchida.
 *
 * Reproduz o layout da aba DRE da planilha "FINANCEIRO BULA 2026" (Drive),
 * preenchendo todos os meses a partir do universo de fontes disponivel:
 *   - Receita Bruta ......... aba Leiloes da propria planilha (por mes do leilao)
 *   - Imposto ............... 18% (ISS 5% + Simples 13%), convencao da planilha
 *   - Custos de comissao .... apuracao por assessor dos fechamentos (ERP);
 *                             agosto = numero ja fechado pelo financeiro
 *   - Despesas .............. aba DRE (jan-jul) + extrato conciliado (agosto)
 *
 * Uso: node scripts/gera-dre-bula-2026.mjs
 */
import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'

const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO']
const N = 8 // meses apurados

// ---------------------------------------------------------------------------
// BASE 1 - aba Leiloes da planilha do financeiro (transcricao integral)
// [mes(1-12), leilao, receita, comissao, status]
// ---------------------------------------------------------------------------
const LEILOES = [
 [1,'LEILÃO NELORE CRISPIM',4836.75,3392.00,'RECEBIDO'],
 [1,'TOUROS DO BEM',1260.00,906.00,'RECEBIDO'],
 [2,'LEILÃO KATAYAMA (Central Leilões)',716.70,720.00,'RECEBIDO'],
 [2,'LEILÃO KATAYAMA (Ricardo Katayama)',716.70,372.00,'RECEBIDO'],
 [2,'LEILÃO PARTNER RG - FÊMEAS',5337.00,5337.00,'RECEBIDO'],
 [2,'LEILÃO PARTNER RG - TOUROS',3015.00,1395.00,'RECEBIDO'],
 [2,'SEMANA GENÉTICA GUADALUPE (23/02)',6797.75,1488.00,'RECEBIDO'],
 [2,'BAHIA PREMIUM',5020.00,5760.00,'RECEBIDO'],
 [2,'SEMANA GENÉTICA GUADALUPE (24/02)',0,0,'RECEBIDO'],
 [2,'SEMANA GENÉTICA GUADALUPE (25/02)',0,0,'RECEBIDO'],
 [2,'LEILÃO SALES',5592.00,4056.00,'RECEBIDO'],
 [3,'LEILÃO MATINHA',9981.90,5419.00,'RECEBIDO'],
 [3,'LEILÃO NAVIRAÍ - ED. MARABÁ/PA',8430.30,7234.00,'RECEBIDO'],
 [3,'LEILÃO EAO - FÊMEA',12386.74,7113.00,'RECEBIDO'],
 [3,'LEILÃO EAO - MACHO',9239.01,3125.00,'RECEBIDO'],
 [3,'LEILÃO EAO - ASPIRAÇÃO',1831.50,0,'RECEBIDO'],
 [3,'LS AGROPECUÁRIA',13536.00,20335.00,'RECEBIDO'],
 [3,'LEILÃO REPRODUTORES CAMPARINO',20000.00,2552.00,'RECEBIDO'],
 [3,'LEILÃO MATRIZES CAMPARINO',0,5995.00,'RECEBIDO'],
 [3,'LEILÃO LAGOA DOS PATOS',6500.00,1066.00,'VENCIDO'],
 [3,'NELORE PARANÃ',13086.90,5133.00,'RECEBIDO'],
 [3,'LEILÃO DNA NELORE MARCONDES',636.00,477.00,'RECEBIDO'],
 [3,'LEILÃO KATAYAMA TRILOGIA',2520.00,600.00,'RECEBIDO'],
 [3,'MEGA GENÉTICA NAVIRAÍ - 1ª ETAPA',2700.00,1800.00,'RECEBIDO'],
 [3,'MEGA GENÉTICA NAVIRAÍ - 2ª ETAPA',630.00,420.00,'RECEBIDO'],
 [3,'ESSÊNCIA GENÉTICA - BAMBU',1344.00,972.00,'RECEBIDO'],
 [3,'LEILÃO NAVIRAÍ - 1ª ETAPA',7875.00,6510.00,'RECEBIDO'],
 [3,'LEILÃO NAVIRAÍ - 2ª ETAPA',1125.00,930.00,'RECEBIDO'],
 [3,'ELITES SAFRA - BAMBU',924.00,693.00,'RECEBIDO'],
 [4,'LEILÃO FB AGRO',1424.00,1068.00,'RECEBIDO'],
 [4,'NOVILHOTAS TOP MATINHA',0,0,'SEM VENDAS'],
 [4,'MATRIZES NELORE FLOC',6858.00,2895.00,'RECEBIDO'],
 [4,'2º TOP GENÉTICA - ÁGUA DOCE/BEMACH/2A',1296.00,423.00,'RECEBIDO'],
 [4,'TOKA DO JACARÉ - VANGUARDA',13060.80,2685.00,'RECEBIDO'],
 [4,'LEILÃO IPB',8547.00,2340.00,'RECEBIDO'],
 [4,'GENÉTICA NELORE CRISPIM',1488.00,1116.00,'RECEBIDO'],
 [4,'LEILÃO CACHOEIRÃO',14340.00,6258.00,'RECEBIDO'],
 [4,'TERRA BRAVA',3990.00,4265.45,'RECEBIDO'],
 [4,'FÊMEAS JMP',51871.50,17633.64,'RECEBIDO'],
 [4,'LEILÃO MRA',11795.00,6231.16,'RECEBIDO'],
 [4,'LEILÃO NAVIRAÍ - EXPOZEBU',2430.00,4050.00,'RECEBIDO'],
 [4,'LEILÃO MATINHA - EXPOZEBU',4200.00,1680.00,'RECEBIDO'],
 [4,'TOUROS TERRA BRAVA E GEN. ADITIVA - EXPOZEBU',4950.00,3465.00,'RECEBIDO'],
 [4,'LEILÃO MAFRA - EXPOZEBU',16320.00,4875.00,'RECEBIDO'],
 [4,'CAMPARINO - EXPOZEBU',3900.00,321.00,'RECEBIDO'],
 [5,'MATRIZES EAO',54669.29,31172.00,'RECEBIDO'],
 [5,'TOUROS EAO',25602.72,1425.00,'RECEBIDO'],
 [5,'LEILÃO NELORE PINTADO RAIZ',4588.00,3564.00,'RECEBIDO'],
 [5,'LEILÃO MATRIZES SANTA FÉ',9200.00,2640.00,'RECEBIDO'],
 [5,'NELORE MÁRCIO DE REZENDE - MRA',18570.00,5768.00,'COBRADO'],
 [5,'TOUROS SANTA NAZARÉ EXCELÊNCIA',11428.00,5150.87,'A RECEBER COM DATA'],
 [5,'ESPECIAL 60 ANOS DE SELEÇÃO RIBALTA',58890.00,2935.02,'RECEBIDO'],
 [5,'LEILÃO NELORE JEM',3825.00,0,'RECEBIDO'],
 [5,'LEILÃO MATINHA MATRIZES',8850.00,3840.00,'RECEBIDO'],
 [5,'LEILÃO MATINHA GOLDEN BOYS',2120.00,764.00,'RECEBIDO'],
 [5,'LEILÃO TRESMAR',9933.00,1925.00,'RECEBIDO'],
 [5,'18º MEGA LEILÃO NELORE',3870.00,11970.00,'RECEBIDO'],
 [5,'LEILÃO LS AGROPECUÁRIA (30/05)',17833.31,6940.00,'RECEBIDO'],
 [5,'LEILÃO LS AGROPECUÁRIA (31/05)',18754.00,1812.00,'RECEBIDO'],
 [5,'NELORE MARCOS DE REZENDE - KITO 1/3',15030.00,0,'RECEBIDO'],
 [5,'NELORE MARCOS DE REZENDE - KITO 2/3',15030.00,0,'RECEBIDO'],
 [5,'NELORE MARCOS DE REZENDE - KITO 3/3',15030.00,0,'A RECEBER'],
 [6,'KATAYAMA TRILOGIA 1/2',1520.00,1216.00,'RECEBIDO'],
 [6,'KATAYAMA TRILOGIA 2/2',1502.00,0,'RECEBIDO'],
 [6,'DESTAQUE SAFRA NELORE CACHOEIRÃO',10914.00,3180.00,'RECEBIDO'],
 [6,'LEILÃO CAMPARINO',15501.23,3682.00,'RECEBIDO'],
 [6,'LEILÃO SANTA NICE',19650.00,10590.00,'RECEBIDO'],
 [6,'LEILÃO JACAMIM FÊMEAS',12042.00,4014.00,'RECEBIDO'],
 [6,'LEILÃO FLOR DO ARATAÚ',11346.00,9138.00,'RECEBIDO'],
 [6,'LEILÃO NELORE SANTA NAZARÉ',12524.00,1680.00,'RECEBIDO'],
 [6,'ELITE DA PROVA TRESMAR',12075.00,0,'RECEBIDO'],
 [6,'LEILÃO JMP - FÊMEAS',165500.00,3780.00,'RECEBIDO'],
 [6,'LEILÃO SELEÇÃO FLOC',7281.00,1938.00,'RECEBIDO'],
 [6,'LEILÃO NELORE KRIZ',16122.00,8352.00,'RECEBIDO'],
 [6,'LEILÃO TERRA BRAVA 1/3',2745.00,3294.00,'RECEBIDO'],
 [6,'LEILÃO TERRA BRAVA 2/3',2745.00,0,'RECEBIDO'],
 [6,'LEILÃO TERRA BRAVA 3/3',2745.00,0,'A RECEBER'],
 [6,'LEILÃO KATISPERA',11106.00,3702.00,'RECEBIDO'],
 [6,'LEILÃO NELORE RIO BONITO',825.00,330.00,'RECEBIDO'],
 [6,'LEILÃO TOUROS MATINHA 1/3',1800.00,3012.00,'RECEBIDO'],
 [6,'LEILÃO TOUROS MATINHA 2/3',2800.00,0,'RECEBIDO'],
 [6,'LEILÃO TOUROS MATINHA 3/3',2800.00,0,'RECEBIDO'],
 [6,'LEILÃO MEAB E FAZENDA MODELO',25170.00,11934.00,'RECEBIDO'],
 [6,'LEILÃO RS AGROPECUÁRIA',8775.00,3510.00,'RECEBIDO'],
 [6,'LEILÃO TOUROS MAGDA',0,0,'INFORMAÇÕES PENDENTES'],
 [7,'NAVIRAÍ MATRIZES',8400.00,3360.00,'A RECEBER COM DATA'],
 [7,'LEILÃO TOUROS NELORE KIRZ',7623.00,1992.00,'RECEBIDO'],
 [7,'MEGA EAO BAVIERA - ASPIRAÇÕES',9197.11,0,'A RECEBER SEM DATA'],
 [7,'MEGA EAO BAVIERA - CAVALOS',1950.96,0,'A RECEBER SEM DATA'],
 [7,'MEGA EAO BAVIERA - FÊMEAS',45807.61,0,'A RECEBER SEM DATA'],
 [7,'MEGA EAO BAVIERA - TOUROS',37320.25,0,'A RECEBER SEM DATA'],
 [7,'NELORE SORRISO - ETAPA FÊMEAS',7150.00,2860.00,'A RECEBER COM DATA'],
 [7,'SANTA CRUZ - 1ª ETAPA',6180.00,0,'EM FECHAMENTO'],
 [7,'SANTA CRUZ - 2ª ETAPA',2130.00,0,'EM FECHAMENTO'],
 [7,'NAVIRAÍ MATRIZES - 2ª ETAPA',7935.00,3174.00,'A RECEBER COM DATA'],
 [7,'20º GUADALUPE AGROPECUÁRIA - FÊMEAS',3000.00,1200.00,'A RECEBER SEM DATA'],
 [7,'20º GUADALUPE AGROPECUÁRIA - TOUROS',29641.35,5982.00,'A RECEBER SEM DATA'],
 [7,'SANTA CRUZ',12360.00,0,'EM FECHAMENTO'],
 [7,'NELORAÇO PO',12187.50,0,'RECEBIDO'],
 [7,'23º MEGA GENÉTICA ADITIVA - FÊMEAS',6318.90,1134.00,'A RECEBER SEM DATA'],
 [7,'23º MEGA GENÉTICA ADITIVA - TOUROS',21443.75,4710.00,'A RECEBER SEM DATA'],
 [8,'TOUROS FAZENDA SÃO GERALDO',25099.00,0,'A RECEBER'],
 [8,'FÊMEAS NELORE MAFRA',70345.00,0,'COBRAR'],
 [8,'TOUROS NELORE MAFRA',17857.00,0,'COBRAR'],
 [8,'TOUROS NELORE SORRISO',5670.00,0,'A RECEBER COM DATA'],
 [8,'TOUROS NELORE GRUPO COSTA',603.00,0,'COBRAR'],
 [8,'LS GALERIA II',59840.00,0,'COBRAR'],
 [8,'PÉROLAS DO TAPAJÓS',10650.00,0,'COBRAR'],
 [8,'NELORE PARANÃ PRODUTIVIDADE',13905.00,0,'COBRAR'],
 [8,'7º ESSÊNCIA GENÉTICA - NELORE DA BAMBÚ',825.00,0,'A RECEBER COM DATA'],
 [8,'TOUROS TERRA BRAVA EXPOGENÉTICA',5355.00,0,'EM FECHAMENTO'],
 [8,'SHOPPING NAVIRAÍ EXPOGENÉTICA',4830.00,0,'EM FECHAMENTO'],
 [8,'MATINHA EXPOGENÉTICA',23025.00,0,'EM FECHAMENTO'],
 [8,'FAZENDA ARARAS - ESSÊNCIA GENÉTICA',2610.00,0,'EM FECHAMENTO'],
 [8,'RESERVA EXPOGENÉTICA SANTA NICE',14850.00,0,'EM FECHAMENTO'],
 [8,'GENÉTICA ADITIVA EXPOGENÉTICA',22200.00,0,'EM FECHAMENTO'],
 [8,'LEILÃO BABY DE PROVA',3675.00,0,'EM FECHAMENTO'],
 [8,'NELORE CEN & FAZENDA MODELO',3510.00,0,'EM FECHAMENTO'],
 [8,'12º PREMIUM COLONIAL',5850.00,0,'EM FECHAMENTO'],
 [8,'4º PEPITAS COLONIAL',9765.00,0,'EM FECHAMENTO'],
 [8,'NAVIRAÍ CAMPARINO ESSÊNCIA BEZERRAS E NOVILHAS',27150.00,0,'EM FECHAMENTO'],
 [8,'28º NAVIRAÍ CAMPARINO REPRODUTORES',47025.00,0,'EM FECHAMENTO'],
 [8,'LEILÃO EXCELÊNCIA GENÉTICA',5250.00,0,'EM FECHAMENTO'],
 [8,'LEILÃO NELORE MARCONDES',1875.00,0,'EM FECHAMENTO'],
 [8,'VIRTUAL TERRA BRAVA MATRIZES',2325.00,0,'EM FECHAMENTO'],
 [8,'VIRTUAL VENTRES VIP MATINHA',6375.00,0,'EM FECHAMENTO'],
 [8,'LEILÃO ESPECIAL SABIÁ DOURADO',11712.00,0,'EM FECHAMENTO'],
 [8,'LEILÃO NELORE ASJ',11894.12,0,'EM FECHAMENTO'],
]

const r2 = (v) => Math.round(v * 100) / 100
const zeros = () => Array(12).fill(0)
const soma = (a) => r2(a.reduce((x, y) => x + (y || 0), 0))

const RECEITA = zeros()
const COMISSAO_PLANILHA = zeros()
for (const [m, , rec, com] of LEILOES) { RECEITA[m - 1] = r2(RECEITA[m - 1] + rec); COMISSAO_PLANILHA[m - 1] = r2(COMISSAO_PLANILHA[m - 1] + com) }

// Travas de transcricao contra os totais impressos na planilha
const checks = []
const assert = (nome, obtido, esperado, tol = 0.02) => {
  const ok = Math.abs(obtido - esperado) <= tol
  checks.push({ nome, obtido: r2(obtido), esperado, dif: r2(obtido - esperado), ok })
  if (!ok) console.warn('  ! FALHOU: ' + nome + ' -> ' + r2(obtido) + ' != ' + esperado)
}
assert('Aba Leilões: total da coluna COMISSÃO 2026', soma(COMISSAO_PLANILHA), 330776.14)
assert('Aba DRE: RECEITA BRUTA de agosto', RECEITA[7], 414070.12)
assert('Aba Leilões: total da coluna RECEITA (a planilha soma 2x as parcelas de Santa Nazaré)', r2(soma(RECEITA) + 11428), 1577363.64)

// ---------------------------------------------------------------------------
// BASE 2 - comissao por assessor (fechamentos do ERP; agosto = financeiro)
// ---------------------------------------------------------------------------
const COMISSAO = {
  'Douglas Bispo':       [2202.00,   938.00, 24494.00, 23944.79, 17598.00, 50535.18, 11718.00, 33740.00],
  'Gustavo Rusa':        [      0,        0,        0,        0,        0, 18075.00, 29535.00, 65635.00],
  'Fábio Omena':         [      0, 10479.00, 23689.20, 28109.81, 27308.15, 22374.00, 12138.00, 39480.00],
  'Leonardo Serafim':    [      0,  3480.00,  5352.00,  9626.20, 31932.00, 41678.00,  7734.00,  6102.00],
  'Luiz Felipe Peralta': [      0,        0,   720.00,        0,        0,  7020.00,  1080.00,  4230.00],
  'Nane Neves':          [      0,        0,        0,        0,        0,        0,  5808.00,        0],
  'Felipe Andrade':      [      0,        0,        0,        0, 26816.00, 30796.00,  8652.00,  3960.00],
  'Laila de Sousa':      [      0,  1200.00,        0,        0,        0,        0,   675.00,   600.00],
  'Lucas Martins':       [      0,        0,        0,        0,        0,        0,        0,   960.00],
  'Marcelo Carneiro':    [      0,        0,        0,  3509.20, 12086.00,        0,        0,        0],
  'Valéria Borges':      [      0,        0,        0,        0,        0,        0,   753.00,        0],
  'Matheus Alves':       [      0,        0,        0,        0,    91.08,        0,        0,        0],
  'A definir':           [      0,        0,        0,        0,        0,        0,   390.00,        0],
}
const CUSTO_COMISSAO = zeros()
for (const v of Object.values(COMISSAO)) v.forEach((x, i) => { CUSTO_COMISSAO[i] = r2(CUSTO_COMISSAO[i] + x) })
assert('Comissão de agosto = valor fechado pelo financeiro na aba DRE', CUSTO_COMISSAO[7], 154707.00)

// Comissao do Bulinha nao aparece no rateio dos fechamentos: vem dos CP analiticos
// do ERP (leiloes de mai-jul, pagos em 27/07). Trava contra a soma desses titulos.
assert('Comissão do Bulinha = soma dos CP analíticos do ERP',
  r2(COMISSAO['Felipe Andrade'][4] + COMISSAO['Felipe Andrade'][5] + COMISSAO['Felipe Andrade'][6]), 66264.00)

// ---------------------------------------------------------------------------
// BASE 3 - folha por competencia (cadastro + aba DRE do financeiro)
// ---------------------------------------------------------------------------
const FOLHA = {
  'Ana Paula Munhoz':   [6000, 6000, 6000, 6000, 6000, 6000, 0, 0],
  'Flavio Jacques':     [4000, 4000, 4000, 0, 0, 0, 0, 0],
  'Francieli Ferreira': [0, 2200, 2200, 0, 0, 0, 0, 0],
  'Valdenuza Felix':    [0, 2000, 2000, 0, 0, 0, 0, 0],
  'Fábio Omena':        [11700, 11700, 11700, 11700, 11700, 11700, 7000, 7000],
  'Douglas Bispo':      [3600, 3600, 3600, 3600, 3600, 3600, 3600, 10000],
  'Leonardo Serafim':   [13500, 13500, 13500, 13500, 13500, 13500, 13500, 13500],
  'João Eduardo':       [0, 0, 0, 0, 0, 0, 5000, 5000],
  'João Gabriel':       [0, 0, 0, 0, 0, 0, 2000, 2000],
  'João Antônio':       [0, 0, 0, 0, 0, 0, 2000, 2000],
  'Matheus Ebert':      [0, 0, 0, 0, 0, 0, 0, 6000],
  'Pedro Pereira':      [0, 0, 0, 0, 0, 0, 0, 1290.82],
  'Luana':              [0, 0, 0, 0, 0, 0, 0, 1161.29],
}
const FOLHA_TOT = zeros()
for (const v of Object.values(FOLHA)) v.forEach((x, i) => { FOLHA_TOT[i] = r2(FOLHA_TOT[i] + x) })
;[38800, 43000, 43000, 34800, 34800, 34800, 33100, 47952.11].forEach((esp, i) =>
  assert('Folha de ' + MESES[i] + ' confere com a planilha', FOLHA_TOT[i], esp))

// ---------------------------------------------------------------------------
// BASE 4 - despesas apuradas (extrato + HastaPro + cartao)
//   gerado por scripts/apura-despesas-dre-2026.mjs
// ---------------------------------------------------------------------------
const APU = JSON.parse(readFileSync('outputs/dre-2026/despesas-apuradas.json', 'utf8'))
const L = (nome) => (APU.linhas[nome] || Array(N).fill(0)).slice(0, N)
const DET = (linha) => Object.fromEntries(Object.entries(APU.detalhe)
  .filter(([k]) => k.startsWith(linha + '||'))
  .map(([k, v]) => [k.split('||')[1], v.slice(0, N)])
  .sort((a, b) => soma(b[1]) - soma(a[1])))

const ENCARGOS     = L('Encargos (FGTS / INSS / DARF)')
const CARROS       = L('Carros')
const ESCRITORIO   = L('Escritório')
const TECNOLOGIA   = L('Tecnologia')
const CONTABILIDADE = L('Contabilidade')
const PARCELAMENTOS = L('Parcelamentos')
const FINANCEIRAS  = L('Despesas Financeiras')
const TRABALHISTAS = L('Despesas Trabalhistas')
const DIARIAS      = L('Diárias e Viagens')
const MARKETING    = L('Marketing')
const OPERACIONAIS = L('Operacionais de leilão')
const ACLASSIFICAR = L('A classificar')

// conferencia (nao entram na DRE: tem linha propria)
const IMPOSTO_PAGO_EXTRATO = L('(fora) Imposto pago no extrato')
const FOLHA_PAGA_EXTRATO   = L('(fora) Folha paga no extrato')
const COMISSAO_PAGA_EXTRATO = L('(fora) Comissão paga no extrato')
const CARTAO_FATURA = APU.cartao_fatura.slice(0, N)

// ---------------------------------------------------------------------------
// BASE 5 - conferencia externa
// ---------------------------------------------------------------------------
const ISS_PAGO      = [3008.55, 9366.25, 768.86, 5187.27, 6689.01, 12566.78, 24524.81, null]
const SIMPLES_PAGO  = [14741.92, 29884.16, 2470.92, 12078.62, 15362.21, 28660.03, 55846.64, null]
const COMISSAO_FECHAMENTOS = [2202.00, 16097.00, 54255.20, 65190.00, 89015.23, 139682.18, 69831.00, 180191.00]
const COMISSAO_HASTAPRO    = [0, 0, 55779.80, 18147.00, 38844.00, 175803.00, 170311.48, 108458.05]
const ENTRADA_EXTRATO      = [299696.71, 409873.25, 198594.61, 84585.29, 99813.94, 239325.77, 263987.57, 236876.16]

// ---------------------------------------------------------------------------
// CALCULO
// ---------------------------------------------------------------------------
const mapa = (f) => Array.from({ length: N }, (_, i) => r2(f(i)))
const ISS         = mapa((i) => RECEITA[i] * 0.05)
const SIMPLES     = mapa((i) => RECEITA[i] * 0.13)
const IMPOSTO     = mapa((i) => ISS[i] + SIMPLES[i])
const REC_LIQ     = mapa((i) => RECEITA[i] - IMPOSTO[i])
const MARGEM      = mapa((i) => REC_LIQ[i] - CUSTO_COMISSAO[i])
const DESP_FIXAS  = mapa((i) => FOLHA_TOT[i] + ENCARGOS[i] + CARROS[i] + ESCRITORIO[i] + TECNOLOGIA[i] + CONTABILIDADE[i] + PARCELAMENTOS[i] + FINANCEIRAS[i])
const DESP_VAR    = mapa((i) => TRABALHISTAS[i] + DIARIAS[i] + MARKETING[i] + OPERACIONAIS[i] + ACLASSIFICAR[i])
const LUCRO       = mapa((i) => MARGEM[i] - DESP_FIXAS[i] - DESP_VAR[i])
const SOMA_RECEITA = soma(RECEITA.slice(0, N))


// ---------------------------------------------------------------------------
// PLANILHA
// ---------------------------------------------------------------------------
const PRETO = 'FF000000', BRANCO = 'FFFFFFFF', CINZA = 'FFD9D9D9', CINZA2 = 'FFF2F2F2', DOURADO = 'FFC9A84C'
const MOEDA = 'R$ #,##0.00;[Red](R$ #,##0.00)'
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
wb.created = new Date()

const ws = wb.addWorksheet('DRE', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })
ws.columns = [{ width: 46 }, ...Array(12).fill({ width: 14 }), { width: 16 }, { width: 10 }]

const linha = (rotulo, vals, opt = {}) => {
  const arr = Array.from({ length: 12 }, (_, i) => (vals && i < N ? (vals[i] ?? null) : null))
  const acc = vals ? r2(arr.slice(0, N).reduce((a, b) => a + (b || 0), 0)) : null
  const pct = vals && opt.pct !== false && SOMA_RECEITA ? acc / SOMA_RECEITA : null
  const row = ws.addRow([rotulo, ...arr, acc, pct])
  row.eachCell({ includeEmpty: true }, (cell, c) => {
    if (c > 1 && c <= 14) cell.numFmt = MOEDA
    if (c === 15) cell.numFmt = '0.0%'
    cell.alignment = { vertical: 'middle' }
    if (opt.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opt.fill } }
    if (opt.font) cell.font = opt.font
    if (opt.border) cell.border = { top: { style: 'thin', color: { argb: 'FFBFBFBF' } }, bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } } }
  })
  row.getCell(1).alignment = { vertical: 'middle', indent: opt.indent || 0 }
  row.height = opt.height || 17
  return row
}

const H_PRETO = { fill: PRETO, font: { bold: true, color: { argb: BRANCO }, size: 11 }, height: 20 }
const H_CINZA = { fill: CINZA, font: { bold: true, color: { argb: PRETO }, size: 10 }, border: true }
const DET_    = { font: { italic: true, size: 9, color: { argb: 'FF595959' } }, indent: 2, height: 15 }
const DET3    = { font: { italic: true, size: 9, color: { argb: 'FF808080' } }, indent: 4, height: 15 }
const SUB     = { font: { bold: true, size: 10 }, indent: 1, fill: CINZA2 }

const cab = ws.addRow(['DRE BULA ASSESSORIA — 2026', ...MESES, 'ACUM. JAN–AGO', '% REC.'])
cab.eachCell((c) => {
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
  c.font = { bold: true, color: { argb: BRANCO }, size: 11 }
  c.alignment = { horizontal: 'center', vertical: 'middle' }
})
cab.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
cab.height = 24
const sub1 = ws.addRow(['Competência pelo mês do leilão · receita da aba Leilões · despesas por extrato + HastaPro + cartão · apuração de 31/08/2026'])
sub1.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF808080' } }
sub1.height = 15
ws.addRow([])

const bloco = (rotuloTotal, total, detalhe, estiloTotal) => {
  linha(rotuloTotal, total, estiloTotal)
  for (const [nome, v] of Object.entries(detalhe)) if (Math.abs(soma(v)) > 0.005) linha(nome, v, DET3)
}

linha('RECEITA BRUTA', RECEITA, H_PRETO)
linha('(-) IMPOSTO', IMPOSTO, H_CINZA)
linha('ISS (5%)', ISS, DET_)
linha('Simples Nacional (13%)', SIMPLES, DET_)
linha('RECEITA LÍQUIDA', REC_LIQ, H_PRETO)
linha('(-) CUSTOS DE COMISSÃO', CUSTO_COMISSAO, H_CINZA)
for (const [nome, v] of Object.entries(COMISSAO)) if (soma(v) > 0) linha(nome, v, DET_)
linha('MARGEM DE CONTRIBUIÇÃO', MARGEM, H_PRETO)

linha('(-) DESPESAS FIXAS', DESP_FIXAS, H_CINZA)
linha('(-) Folha de Pagamento', FOLHA_TOT, SUB)
for (const [nome, v] of Object.entries(FOLHA)) if (soma(v) > 0) linha(nome, v, DET3)
bloco('(-) Encargos (FGTS / INSS / DARF)', ENCARGOS, DET('Encargos (FGTS / INSS / DARF)'), SUB)
bloco('(-) Carros', CARROS, DET('Carros'), SUB)
bloco('(-) Escritório', ESCRITORIO, DET('Escritório'), SUB)
bloco('(-) Tecnologia', TECNOLOGIA, DET('Tecnologia'), SUB)
bloco('(-) Contabilidade', CONTABILIDADE, DET('Contabilidade'), SUB)
bloco('(-) Parcelamentos', PARCELAMENTOS, DET('Parcelamentos'), SUB)
bloco('(-) Despesas Financeiras', FINANCEIRAS, DET('Despesas Financeiras'), SUB)

linha('(-) DESPESAS VARIÁVEIS', DESP_VAR, H_CINZA)
bloco('(-) Despesas Trabalhistas', TRABALHISTAS, DET('Despesas Trabalhistas'), SUB)
bloco('(-) Diárias e Viagens', DIARIAS, DET('Diárias e Viagens'), SUB)
bloco('(-) Marketing', MARKETING, DET('Marketing'), SUB)
bloco('(-) Operacionais de leilão', OPERACIONAIS, DET('Operacionais de leilão'), SUB)
bloco('(-) A classificar', ACLASSIFICAR, DET('A classificar'), { ...SUB, font: { bold: true, size: 10, color: { argb: 'FFC00000' } } })

const rl = linha('(=) LUCRO LÍQUIDO', LUCRO, { fill: DOURADO, font: { bold: true, size: 11 }, height: 22 })
rl.eachCell({ includeEmpty: true }, (c) => { c.border = { top: { style: 'double' }, bottom: { style: 'double' } } })
const rm = linha('Margem líquida sobre a receita', mapa((i) => (RECEITA[i] ? LUCRO[i] / RECEITA[i] : 0)), { font: { italic: true, size: 9, color: { argb: 'FF595959' } }, indent: 1, pct: false })
rm.eachCell({ includeEmpty: true }, (c, i) => { if (i > 1 && i <= 14) c.numFmt = '0.0%' })

// ---------------------------------------------------------------------------
// ABA CONFERENCIA
// ---------------------------------------------------------------------------
const wc = wb.addWorksheet('Conferência', { views: [{ state: 'frozen', ySplit: 1 }] })
wc.columns = [{ width: 46 }, ...Array(8).fill({ width: 14 }), { width: 15 }, { width: 66 }]

const cabC = wc.addRow(['CONFERÊNCIA E PROCEDÊNCIA', ...MESES.slice(0, N), 'ACUM.', 'LEITURA'])
cabC.eachCell((c) => {
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
  c.font = { bold: true, color: { argb: BRANCO }, size: 11 }
  c.alignment = { horizontal: 'center', vertical: 'middle' }
})
cabC.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
cabC.height = 22

const linhaC = (rotulo, vals, nota, opt = {}) => {
  const arr = vals ? vals.slice(0, N) : Array(N).fill(null)
  const acc = vals ? r2(arr.reduce((a, b) => a + (b || 0), 0)) : null
  const row = wc.addRow([rotulo, ...arr, acc, nota || ''])
  row.eachCell({ includeEmpty: true }, (cell, c) => {
    if (c > 1 && c <= 10) cell.numFmt = MOEDA
    cell.alignment = { vertical: 'top' }
    if (opt.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opt.fill } }
    if (opt.font) cell.font = opt.font
  })
  row.getCell(11).alignment = { vertical: 'top', wrapText: true }
  row.getCell(1).alignment = { vertical: 'top', indent: opt.indent || 0, wrapText: true }
  row.height = opt.height || 15
  return row
}
const tituloC = (txt) => {
  const r = wc.addRow([txt])
  for (let i = 1; i <= 11; i++) r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF404040' } }
  r.getCell(1).font = { bold: true, size: 11, color: { argb: BRANCO } }
  r.height = 20
  return r
}

tituloC('1. ESCOPO — janeiro e fevereiro não fecham com a operação da Bula Assessoria')
linhaC('Entrou na conta Sicoob (classificado como comissão)', ENTRADA_EXTRATO, 'Extrato conciliado.')
linhaC('Receita apurada pela aba Leilões', RECEITA, 'Jan e fev somam R$ 33.291,90 de receita contra R$ 709.569,96 que entraram na conta.', { font: { bold: true } })
linhaC('Diferença', mapa((i) => ENTRADA_EXTRATO[i] - RECEITA[i]), 'Em jan/fev entram 2x R$ 128.758,47 da JBJ AGROPECUÁRIA e R$ 153.662,00 de pessoa física — não têm cara de comissão de leilão. E em 20/01 saíram R$ 125.159,67 para a Receita Federal, valor incompatível com o DAS de uma receita de R$ 6 mil.', { font: { bold: true, color: { argb: 'FFC00000' } } })
linhaC('', null, 'LEITURA: ou a conta carregou operação de 2025 / de outra empresa nesses dois meses, ou a receita de jan-fev está muito subdeclarada. Enquanto isso não for resolvido, o prejuízo de janeiro e fevereiro NÃO deve ser lido como resultado da Bula Assessoria.')
wc.addRow([])

tituloC('2. IMPOSTO — provisão adotada na DRE x guias efetivamente pagas')
linhaC('Provisão de 18% adotada (ISS 5% + Simples 13%)', IMPOSTO, 'Convenção que o próprio financeiro já usava em agosto e na coluna IMPOSTO (18%) da aba Leilões.')
linhaC('ISS pago (guia SEFAZ Campo Grande)', ISS_PAGO, 'Guia do mês seguinte alocada na competência. A de agosto vence em setembro.')
linhaC('Simples Nacional pago (DAS)', SIMPLES_PAGO, 'O DAS de julho (R$ 55.846,64) foi debitado em 20/08.')
linhaC('Total de tributos que saiu do extrato', IMPOSTO_PAGO_EXTRATO, 'Inclui R$ 125.159,67 de 20/01 à Receita Federal ainda sem identificação e R$ 44 mil de guias menores a classificar.')
linhaC('Faturamento em NFS-e implícito (ISS ÷ 5%)', mapa((i) => (ISS_PAGO[i] ? ISS_PAGO[i] / 0.05 : 0)), 'Julho dá R$ 490.496,20 — bate exatamente com o relatório de NF da Prefeitura. Carga real medida: 16,39%.')
wc.addRow([])

tituloC('3. COMISSÃO — três fontes independentes para o mesmo custo')
linhaC('Adotado na DRE', CUSTO_COMISSAO, 'Rateio por assessor dos fechamentos (competência do leilão) + CP analíticos do Bulinha; agosto = valor fechado pelo financeiro.', { font: { bold: true } })
linhaC('Contas a pagar do HastaPro (categoria COMISSÃO)', COMISSAO_HASTAPRO, 'A base que o financeiro vinha usando. Zerada em jan/fev porque o HastaPro só passou a ser alimentado em março.')
linhaC('Rateio dos fechamentos, sem o Bulinha', COMISSAO_FECHAMENTOS, 'De março a agosto as duas fontes somam R$ 598.164,61 e R$ 567.343,33 — 5% de diferença no acumulado, com meses muito diferentes entre si.')
linhaC('Coluna COMISSÃO da aba Leilões', COMISSAO_PLANILHA.slice(0, N), 'Fica em branco nos maiores eventos de julho (EAO Baviera, Santa Cruz) e em todo agosto: subdeclara quase metade.')
linhaC('Comissão paga que apareceu solta no extrato', COMISSAO_PAGA_EXTRATO, 'Não somada de novo: já está nas linhas acima. Inclui o cartão Sicredi do Peralta (R$ 2.998,18).')
wc.addRow([])

tituloC('4. CARTÃO DE CRÉDITO — oito meses de fatura, 100% no portador Felipe V Andrade')
linhaC('Fatura paga (débito automático no Sicoob)', CARTAO_FATURA, 'Os dois cartões Sicoob são titulados à Bula Assessoria.')
for (const [k, v] of Object.entries(APU.cartao_por_categoria).sort((a, b) => soma(b[1]) - soma(a[1])))
  linhaC('   ' + k, v.slice(0, N), '', { indent: 1, font: { italic: true, size: 9, color: { argb: 'FF595959' } } })
linhaC('', null, 'DECISÃO: aqui a fatura entra pelo que foi COMPRADO — passagem em Diárias, mídia em Marketing, assinatura em Tecnologia. O ERP hoje joga a fatura inteira em "comissão do Bulinha"; isso esconderia R$ 141 mil de viagem e mídia em jan-abr, meses em que a receita da Bula nem chegava perto disso. Se o critério voltar a ser "fatura = comissão", o valor apenas muda de linha — o lucro é o mesmo.')
wc.addRow([])

tituloC('5. COBERTURA DAS FONTES')
linhaC('Folha paga que apareceu no extrato', FOLHA_PAGA_EXTRATO, 'Não somada: a folha entra por competência, pelo cadastro. O pagamento tem defasagem de um mês.')
linhaC('A classificar (o que ninguém categorizou)', ACLASSIFICAR, 'É a fila de trabalho. Sai desta linha à medida que o financeiro categorizar no HastaPro.', { font: { bold: true, color: { argb: 'FFC00000' } } })
const NOTAS_COB = [
  ['Movimentos lidos no extrato', String(APU.cobertura.movimentos_lidos) + ' saídas entre 01/01 e 27/08 (o extrato do Sicoob ainda não tem 28–31/08).'],
  ['Títulos do HastaPro (filial 2)', String(APU.cobertura.titulos_hastapro) + ' contas a pagar. ' + String(APU.cobertura.valores_rotulados_pelo_hastapro) + ' valores distintos foram casados com o extrato por valor + data, e o rótulo achado em um mês foi retropropagado para o mesmo valor nos meses anteriores — é assim que janeiro e fevereiro ganham categoria sem que o HastaPro os tenha.'],
  ['Títulos do HastaPro sem lastro no extrato', 'R$ ' + APU.cobertura.hastapro_sem_lastro_no_extrato.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' entraram na DRE como despesa que não passou pelo Sicoob (pagamento por fora ou título ainda aberto). Comissão, folha, imposto e o que está sob PARTICULAR/FAZENDA ficaram de fora.'],
  ['O que o HastaPro não cobre', 'A filial 2 só passou a ser alimentada em março/2026, e agosto está com 52 títulos sem categoria (quase todos "COMISSAO ASSESSORIA DE VENDA"). Categorizar agosto no HastaPro é o que mais melhora esta DRE.'],
  ['Escritório', 'Sem aluguel, internet, energia e café a partir de agosto — o escritório foi encerrado. O último débito de internet é de 02/07.'],
  ['Erro achado na aba Leilões', 'O TOTAL 2026 (R$ 1.577.363,64) conta duas vezes o Santa Nazaré Excelência: a linha-mãe de R$ 11.428,00 e as duas parcelas de R$ 5.714,00. O total correto é R$ 1.565.935,65.'],
  ['Erro achado na aba DRE', 'Os subtotais de DESPESAS VARIÁVEIS de agosto estavam em cascata quebrada (159.616 para 79.808 para 39.904, cada um o dobro do seguinte).'],
  ['Receita de agosto', 'R$ 267.501,12 dos R$ 414.070,12 (65%) vêm de eventos ainda "EM FECHAMENTO" ou "COBRAR". É receita apurada, não recebida.'],
]
for (const [t, d] of NOTAS_COB) {
  const r = wc.addRow([t, d])
  wc.mergeCells(r.number, 2, r.number, 11)
  r.getCell(1).font = { bold: true, size: 10 }
  r.getCell(1).alignment = { vertical: 'top', wrapText: true }
  r.getCell(2).alignment = { vertical: 'top', wrapText: true }
  r.height = 30
}
wc.addRow([])

tituloC('6. TRAVAS DE TRANSCRIÇÃO — conferidas contra os totais da própria planilha')
for (const c of checks) {
  const r = wc.addRow([c.nome, c.obtido, c.esperado, c.dif, c.ok ? 'OK' : 'DIVERGE'])
  r.getCell(2).numFmt = MOEDA; r.getCell(3).numFmt = MOEDA; r.getCell(4).numFmt = MOEDA
  r.getCell(5).font = { bold: true, color: { argb: c.ok ? 'FF008000' : 'FFC00000' } }
  r.getCell(1).alignment = { wrapText: true, vertical: 'top' }
  r.height = 15
}

// ---------------------------------------------------------------------------
// ABA BASE - leilao a leilao
// ---------------------------------------------------------------------------
const wl = wb.addWorksheet('Base — Leilões', { views: [{ state: 'frozen', ySplit: 1 }] })
wl.columns = [{ width: 6 }, { width: 12 }, { width: 52 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 22 }]
const cabL = wl.addRow(['#', 'MÊS', 'LEILÃO', 'RECEITA', 'IMPOSTO 18%', 'COMISSÃO', 'MARGEM', 'STATUS'])
cabL.eachCell((c) => {
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
  c.font = { bold: true, color: { argb: BRANCO }, size: 10 }
  c.alignment = { horizontal: 'center', vertical: 'middle' }
})
cabL.height = 20
LEILOES.forEach(([m, nome, rec, com, st], i) => {
  const imp = r2(rec * 0.18)
  const r = wl.addRow([i + 1, MESES[m - 1], nome, rec, imp, com, r2(rec - imp - com), st])
  for (let c = 4; c <= 7; c++) r.getCell(c).numFmt = MOEDA
  if (i % 2 === 1) r.eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA2 } } })
  r.height = 15
})
const totL = wl.addRow(['', '', 'TOTAL JAN–AGO', soma(RECEITA), r2(soma(RECEITA) * 0.18), soma(COMISSAO_PLANILHA), '', ''])
totL.eachCell({ includeEmpty: true }, (c, i) => {
  c.font = { bold: true, color: { argb: BRANCO } }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
  if (i >= 4 && i <= 7) c.numFmt = MOEDA
})
totL.height = 20


// ---------------------------------------------------------------------------
// ABA ONTOLOGIA - o que mudou na estrutura e o que isso denuncia
// ---------------------------------------------------------------------------
const wo = wb.addWorksheet('Ontologia', { views: [{ state: 'frozen', ySplit: 1 }] })
wo.columns = [{ width: 15 }, { width: 46 }, { width: 22 }, { width: 62 }, { width: 16 }]

const cabO = wo.addRow(['QUANDO', 'O QUE ACONTECEU', 'ONDE APARECE', 'ASSINATURA NO NÚMERO', 'VALOR'])
cabO.eachCell((c) => {
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
  c.font = { bold: true, color: { argb: BRANCO }, size: 11 }
  c.alignment = { horizontal: 'center', vertical: 'middle' }
})
cabO.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
cabO.height = 22

const tituloO = (txt, cor) => {
  const r = wo.addRow([txt])
  for (let i = 1; i <= 5; i++) r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor || 'FF404040' } }
  r.getCell(1).font = { bold: true, size: 11, color: { argb: BRANCO } }
  r.height = 20
  return r
}
const linhaO = (quando, evento, onde, assinatura, valor, opt = {}) => {
  const r = wo.addRow([quando, evento, onde, assinatura, valor ?? null])
  r.getCell(5).numFmt = MOEDA
  for (let i = 1; i <= 5; i++) {
    r.getCell(i).alignment = { vertical: 'top', wrapText: i === 2 || i === 4 }
    if (opt.font) r.getCell(i).font = opt.font
    if (opt.fill) r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opt.fill } }
  }
  r.height = opt.height || 28
  return r
}

tituloO('A ESTRUTURA DA BULA MUDOU DE REGIME DUAS VEZES EM 2026 — a DRE só faz sentido lida em três fases')
linhaO('jan – mar', 'FASE 1 — estrutura CLT + escritório na Av. Afonso Pena', 'Despesas Fixas', 'Cinco pessoas em folha administrativa (Ana Paula 6.000, Flavio 4.000, Francieli 2.220, Fátima 2.000, Valdeneusa 2.000), escritório com aluguel, internet Digital Net, café, limpeza e seguro da equipe, dois carros Unidas e um parcelamento de R$ 2.872,63. Custo fixo médio do trimestre:', r2((DESP_FIXAS[0] + DESP_FIXAS[1] + DESP_FIXAS[2]) / 3), { fill: 'FFF2F2F2', font: { bold: true, size: 10 } })
linhaO('mar – jun', 'FASE 2 — desmonte da estrutura CLT', 'Trabalhistas + Fixas', 'Saem Fátima (03/03), Francieli (02/04), Flavio (16/06), Valdeneusa (último salário 02/06) e Ana Paula (último salário 02/07). Junto saem o seguro da equipe, a internet, a limpeza e o parcelamento. Custo fixo médio:', r2((DESP_FIXAS[2] + DESP_FIXAS[3] + DESP_FIXAS[4] + DESP_FIXAS[5]) / 4), { fill: 'FFF2F2F2', font: { bold: true, size: 10 } })
linhaO('jul – ago', 'FASE 3 — estrutura enxuta, PJ, sem escritório', 'Despesas Fixas', 'Todo mundo passa a receber por NF (Fábio, Douglas, Leonardo, João Eduardo). Entram time de SDR e tecnologia (João Gabriel, João Antônio, Matheus Ebert, Pedro, Luana) e o custo de software (Claude, Codex, Supabase, Vercel). O escritório zera. Custo fixo médio:', r2((DESP_FIXAS[6] + DESP_FIXAS[7]) / 2), { fill: 'FFF2F2F2', font: { bold: true, size: 10 } })
wo.addRow([])

tituloO('LINHA DO TEMPO — cada degrau do número tem um evento atrás')
const EVENTOS = [
  ['07/01', 'Delacir Miorando recebe R$ 1.525 — único pagamento do ano', 'Folha', 'Pessoa que não consta em nenhuma folha da planilha.', 1525.00],
  ['22/01', 'Flavio recebe R$ 5.333,33 além do salário', 'Folha', 'Valor fora do padrão de 4.000/mês; parece 13º ou bônus.', 5333.33],
  ['03/03', 'FÁTIMA SAI', 'Despesas Trabalhistas', 'R$ 1.065,00 de saldo de salário + R$ 7.519,83 de rescisão. Somam exatamente os R$ 8.584,83 que o chefe lançou como "Recisão Fátima".', 8584.83],
  ['19/03', 'Nathalia Bacellar recebe R$ 1.080,60 de prestação de serviço', 'Folha', 'Também não consta em nenhuma folha.', 1080.60],
  ['02/04', 'FRANCIELI SAI', 'Despesas Trabalhistas', 'Rescisão de R$ 6.300,00, descrita no extrato.', 6300.00],
  ['abr', 'Seguro da equipe (R$ 319,50/mês) para', 'Escritório', 'Rodou de janeiro a abril e não voltou.', 319.50],
  ['abr – jun', 'Apólice Tokio Marine roda três meses e para', 'Escritório', 'R$ 1.177,55 em 29/04, 18/05 e 24/06. Some junto com o escritório.', 3532.65],
  ['mai', 'Claude entra no custo de tecnologia', 'Tecnologia', 'R$ 550/mês a partir de maio.', 550.00],
  ['02/06', 'Valdeneusa recebe o último salário', 'Folha', 'O acerto final só vem em 03/08, e é de R$ 216,34.', 2000.00],
  ['09/06', 'Contrato de parceria com a Fórmula do Boi: 6 × R$ 5.000', 'Comissão', 'Parcelas 01/06 e 02/06 pagas; a 03/06, vencida em 01/08, continua ABERTA no HastaPro. Está sendo lançada como comissão, mas é contrato.', 30000.00],
  ['jun', 'Codex GPT entra no custo de tecnologia', 'Tecnologia', 'R$ 550/mês a partir de junho.', 550.00],
  ['16/06', 'FLAVIO SAI', 'Despesas Trabalhistas', 'Acerto de saída de R$ 11.443,75, com essa descrição no HastaPro.', 11443.75],
  ['jun', 'Internet e limpeza do escritório param', 'Escritório', 'Digital Net (R$ 404,80/mês) e faxina (R$ 200/mês) rodam até junho; em 02/07 sai um resíduo de R$ 142,92 marcado "último pagamento".', 604.80],
  ['jun', 'O parcelamento de R$ 2.872,63 para na 22ª de 48', 'Parcelamentos', 'Débito automático mensal de janeiro a junho, descrito no HastaPro como "REF. PARCELA 17/48". Depois disso, nada.', 2872.63],
  ['06/07', 'João Antônio entra como SDR', 'Folha', 'R$ 1.533,33 proporcionais no primeiro mês.', 2000.00],
  ['jul', 'Fábio Omena: R$ 11.700 → R$ 7.000', 'Folha', 'A NF 25 (competência junho) foi a última de 11.700. Em 03/08 já sai 7.000.', -4700.00],
  ['jul', 'João Eduardo: R$ 3.000 → R$ 5.000', 'Folha', 'Fixo de junho pago 06/07 ainda é 3.000; o de julho, pago 03/08, já é 5.000.', 2000.00],
  ['02/07', 'ANA PAULA RECEBE O ÚLTIMO SALÁRIO', 'Folha', 'Referente a junho. O acerto final é de R$ 239,06, em 03/08.', 6000.00],
  ['ago', 'O ESCRITÓRIO ZERA', 'Escritório', 'Sem aluguel, internet, energia nem café. Sobram só os dois seguros Sicoob (R$ 184,64).', -3971.50],
  ['ago', 'Douglas Bispo: R$ 3.600 → R$ 10.000', 'Folha', 'Salta na competência de agosto.', 6400.00],
  ['ago', 'Entram Matheus Ebert, Pedro e Luana', 'Folha', 'R$ 6.000 + R$ 1.290,82 + R$ 1.161,29 na competência de agosto.', 8452.11],
  ['ago', 'Supabase e Vercel entram no custo', 'Tecnologia', 'R$ 105 cada — a infraestrutura do sistema passa a ter conta própria.', 210.00],
  ['ago', 'Localiza (VW Tera) substitui as Unidas', 'Carros', 'As duas Unidas rodam até maio; a Localiza começa em agosto.', 1509.68],
]
for (const e of EVENTOS) linhaO(...e)
wo.addRow([])

tituloO('O QUE A ONTOLOGIA DENUNCIA — buraco a buraco, com valor', 'FF8B0000')
const BURACOS = [
  ['jan – jun', 'Leonardo tem R$ 81.000 de salário sem lastro na conta', 'Folha', 'A planilha lança R$ 13.500/mês desde janeiro, mas o primeiro débito de Leonardo no Sicoob é 02/07. Seis meses foram pagos por fora — outra conta ou outra empresa.', 81000.00],
  ['jan – jul', 'O aluguel do escritório não aparece no extrato', 'Escritório', 'R$ 3.292/mês na planilha (R$ 23.044 no período) e nenhum débito recorrente correspondente no Sicoob. O único lançamento de "Aluguel" no ano é a casa da Expogenética, R$ 2.000 em 11/08.', 23044.00],
  ['a partir de jul', 'Restam 26 parcelas de R$ 2.872,63 sem destino', 'Parcelamentos', 'O contrato era de 48 parcelas e parou na 22ª. Ou foi quitado (e não há pagamento em lote no extrato), ou renegociado, ou está inadimplente. Em qualquer caso é passivo que não está em lugar nenhum.', 74688.38],
  ['jun – ago', 'Ana Paula e Valdeneusa saem sem verba rescisória à altura', 'Despesas Trabalhistas', 'Acertos de R$ 239,06 e R$ 216,34 em 03/08, contra R$ 8.584,83 da Fátima e R$ 6.300 da Francieli — que ganhavam menos e tinham menos tempo de casa.', 455.40],
  ['jul – ago', 'FGTS e DARF continuam depois de todos os CLT saírem', 'Encargos', 'R$ 938,67 de FGTS em 01/07 implica uma folha CLT de R$ 11.733; em 20/08 ainda saem R$ 1.114,60 de "DARF funcionários". Quem ainda é CLT?', 2053.27],
  ['jan e mar', 'Duas pessoas recebem folha e não existem na estrutura', 'Folha', 'Delacir Miorando da Rosa (R$ 1.525 em 07/01) e Nathalia Bacellar Azevedo (R$ 1.080,60 em 19/03).', 2605.60],
  ['fev, abr, jun', 'Fábio e Douglas têm meses sem pagamento no extrato', 'Folha', 'Fábio não tem débito em fevereiro, abril e junho; Douglas, em janeiro, junho e julho. Mesmo padrão do Leonardo: parte da folha saía de outra conta até junho.', null],
  ['04/02', 'R$ 17.500 do Peralta estavam lançados como folha', 'Comissão', 'Peralta é comissionado, não tem fixo. Já corrigido nesta apuração — mas no ERP a categoria segue errada.', 17500.00],
]
for (const b of BURACOS) linhaO(...b, { font: { size: 10 }, height: 34 })
wo.addRow([])

tituloO('A CONCLUSÃO QUE AMARRA TUDO')
const concl = wo.addRow(['', 'Até junho, boa parte da estrutura fixa NÃO passava pela conta do Sicoob — Leonardo, o aluguel e parte da folha de Fábio e Douglas saíam por fora. A partir de julho, passa tudo. É por isso que o extrato sozinho subdeclara janeiro a junho, e a planilha do chefe subdeclara justamente o que só o extrato enxerga (cartão, viagens, estrutura de leilão). Nenhuma das duas fontes fecha sozinha: a DRE só fica de pé com as duas somadas e com esses buracos nomeados.'])
wo.mergeCells(concl.number, 2, concl.number, 5)
concl.getCell(2).alignment = { vertical: 'top', wrapText: true }
concl.getCell(2).font = { size: 11 }
concl.height = 64

// ---------------------------------------------------------------------------
const destino = process.argv[2] || 'C:/Users/Notebook-Acer/Desktop/DRE BULA ASSESSORIA 2026 - jan a ago.xlsx'
await wb.xlsx.writeFile(destino)

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(14)
console.log('\nDRE BULA ASSESSORIA 2026 — jan a ago')
console.log('-'.repeat(102))
console.log('MÊS'.padEnd(12) + 'RECEITA'.padStart(14) + 'IMPOSTO'.padStart(14) + 'COMISSÃO'.padStart(14) + 'D.FIXAS'.padStart(14) + 'D.VARIÁV.'.padStart(14) + 'LUCRO'.padStart(14))
for (let i = 0; i < N; i++) console.log(MESES[i].padEnd(12) + fmt(RECEITA[i]) + fmt(IMPOSTO[i]) + fmt(CUSTO_COMISSAO[i]) + fmt(DESP_FIXAS[i]) + fmt(DESP_VAR[i]) + fmt(LUCRO[i]))
console.log('-'.repeat(102))
console.log('ACUM.'.padEnd(12) + fmt(SOMA_RECEITA) + fmt(soma(IMPOSTO)) + fmt(soma(CUSTO_COMISSAO.slice(0, N))) + fmt(soma(DESP_FIXAS)) + fmt(soma(DESP_VAR)) + fmt(soma(LUCRO)))
console.log('MAR-AGO'.padEnd(12) + fmt(soma(RECEITA.slice(2, 8))) + fmt(soma(IMPOSTO.slice(2))) + fmt(soma(CUSTO_COMISSAO.slice(2, 8))) + fmt(soma(DESP_FIXAS.slice(2))) + fmt(soma(DESP_VAR.slice(2))) + fmt(soma(LUCRO.slice(2))))
console.log('\nTravas: ' + checks.filter((c) => c.ok).length + '/' + checks.length + ' OK')
for (const c of checks.filter((c) => !c.ok)) console.log('  ! ' + c.nome + ': ' + c.obtido + ' vs ' + c.esperado)
console.log('\nArquivo: ' + destino)
