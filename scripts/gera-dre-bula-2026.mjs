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
  'Felipe Andrade':      [      0,        0,        0,        0,        0,        0,        0,  3960.00],
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

// ---------------------------------------------------------------------------
// BASE 3 - despesas (aba DRE do financeiro + extrato conciliado em agosto)
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

const ENCARGOS = [1370.48, 4040.64, 2117.21, 2117.21, 2272.89, 3164.13, 1141.09, 1141.09]

const CARROS_DET = {
  'Unidas Carro 1':                [0, 3316.96, 0, 0, 0, 0, 0, 0],
  'Unidas Carro 2':                [0, 1945.04, 0, 0, 0, 0, 0, 0],
  'Reparo de carro':               [0, 0, 689.00, 0, 0, 0, 0, 0],
  'Multas':                        [0, 0, 249.91, 0, 0, 0, 0, 0],
  'Volkswagen Tera (Localiza PA)': [0, 0, 0, 0, 0, 0, 0, 1509.68],
}
const ESCRITORIO_DET = {
  'Aluguel':          [3292, 3292, 3292, 3292, 3292, 3292, 3292, 0],
  'Internet':         [404.80, 404.80, 404.80, 404.80, 404.80, 404.80, 404.80, 0],
  'Energia':          [0, 0, 1124.09, 554.10, 71.33, 70.21, 34.70, 0],
  'Café':             [240, 240, 240, 240, 240, 240, 240, 0],
  'Seguro da equipe': [0, 319.50, 0, 0, 0, 0, 0, 184.64],
  'Manutenção':       [0, 0, 80.00, 0, 0, 0, 0, 0],
  'Material':         [0, 0, 352.00, 0, 0, 0, 0, 0],
}
const TECNOLOGIA_DET = {
  'ClickWeb':  [218.39, 218.39, 218.39, 218.39, 218.39, 218.39, 218.39, 218.39],
  'Claude':    [0, 0, 0, 0, 550, 550, 550, 550],
  'Codex GPT': [0, 0, 0, 0, 0, 550, 550, 550],
  'Supabase':  [0, 0, 0, 0, 0, 0, 0, 105],
  'Vercel':    [0, 0, 0, 0, 0, 0, 0, 105],
  'DocuSign':  [0, 0, 659.00, 0, 0, 0, 0, 0],
}
const CONTABILIDADE = [1058, 1058, 1058, 1058, 1058, 1058, 1058, 1058]

const TRABALHISTAS_DET = {
  'Rescisão Fátima':                  [0, 0, 8584.83, 0, 0, 0, 0, 0],
  'Rescisão / acerto (agosto)':       [0, 0, 0, 0, 0, 0, 0, 5500.00],
  'Acertos finais (Ana Paula / Val)': [0, 0, 0, 0, 0, 0, 0, 455.40],
}
const DIARIAS_DET = {
  'Consultas de cadastros': [0, 0, 600.00, 0, 0, 0, 0, 0],
  'Motorista':              [0, 0, 1800.00, 0, 0, 0, 0, 0],
  'Limpeza':                [0, 0, 200.00, 0, 0, 0, 0, 0],
  'Diárias de equipe':      [0, 0, 0, 0, 0, 0, 0, 2700.00],
  'Viagens / passagens':    [0, 0, 0, 0, 0, 0, 0, 6178.45],
}
const MARKETING_DET = {
  'Patrocinado Douglas':   [0, 0, 1238.84, 0, 0, 0, 0, 0],
  'Patrocinado Fábio':     [0, 0, 1000.00, 0, 0, 0, 0, 0],
  'OpenRouter':            [0, 0, 0, 0, 0, 173.40, 390.00, 0],
  'Campanhas (Meta Ads)':  [0, 0, 0, 0, 0, 0, 0, 7500.00],
}
const OPERACIONAIS_DET = {
  'Reembolsos (Fábio / Leonardo / FDB)':          [0, 0, 0, 0, 0, 0, 11797.88, 0],
  'Translado (pedágio, combustível, passagens)':  [0, 1265.70, 12679.46, 0, 0, 0, 0, 0],
  'Hospedagem':                                   [0, 0, 12872.20, 0, 0, 0, 0, 11468.00],
  'Alimentação':                                  [0, 0, 3938.73, 0, 0, 0, 0, 0],
  'Uniformes':                                    [0, 0, 0, 0, 0, 0, 0, 480.00],
  'Reembolso Bula Remates':                       [0, 0, 0, 0, 0, 0, 0, 5026.34],
  'Registro de marcas (Remat)':                   [0, 0, 0, 0, 0, 0, 0, 495.00],
  'Transporte por aplicativo':                    [0, 0, 0, 0, 0, 0, 0, 63.96],
  'Outras':                                       [0, 0, 0, 0, 0, 0, 0, 39.00],
}

// ---------------------------------------------------------------------------
// BASE 4 - conferencia externa
// ---------------------------------------------------------------------------
const ISS_PAGO      = [3008.55, 9366.25, 768.86, 5187.27, 6689.01, 12566.78, 24524.81, null]
const SIMPLES_PAGO  = [14741.92, 29884.16, 2470.92, 12078.62, 15362.21, 28660.03, 55846.64, null]
const DESP_LEILAO_EXTRATO = [1485.82, 9533.21, 5769.42, 14645.68, 8219.88, 17803.02, 14404.20, 28880.67]
const COMISSAO_FECHAMENTOS = [2202.00, 16097.00, 54255.20, 65190.00, 89015.23, 139682.18, 69831.00, 180191.00]

// ---------------------------------------------------------------------------
// CALCULO
// ---------------------------------------------------------------------------
const mapa = (f) => Array.from({ length: N }, (_, i) => r2(f(i)))
const somaDet = (det) => mapa((i) => Object.values(det).reduce((a, v) => a + (v[i] || 0), 0))

const ISS         = mapa((i) => RECEITA[i] * 0.05)
const SIMPLES     = mapa((i) => RECEITA[i] * 0.13)
const IMPOSTO     = mapa((i) => ISS[i] + SIMPLES[i])
const REC_LIQ     = mapa((i) => RECEITA[i] - IMPOSTO[i])
const MARGEM      = mapa((i) => REC_LIQ[i] - CUSTO_COMISSAO[i])
const CARROS      = somaDet(CARROS_DET)
const ESCRITORIO  = somaDet(ESCRITORIO_DET)
const TECNOLOGIA  = somaDet(TECNOLOGIA_DET)
const UTILITARIOS = mapa((i) => ESCRITORIO[i] + TECNOLOGIA[i] + CONTABILIDADE[i])
const DESP_FIXAS  = mapa((i) => FOLHA_TOT[i] + ENCARGOS[i] + CARROS[i] + UTILITARIOS[i])
const TRABALHISTAS  = somaDet(TRABALHISTAS_DET)
const DIARIAS       = somaDet(DIARIAS_DET)
const MARKETING     = somaDet(MARKETING_DET)
const OPERACIONAIS  = somaDet(OPERACIONAIS_DET)
const DESP_VAR = mapa((i) => TRABALHISTAS[i] + DIARIAS[i] + MARKETING[i] + OPERACIONAIS[i])
const LUCRO    = mapa((i) => MARGEM[i] - DESP_FIXAS[i] - DESP_VAR[i])
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
ws.columns = [{ width: 44 }, ...Array(12).fill({ width: 14 }), { width: 16 }, { width: 10 }]

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
const DET     = { font: { italic: true, size: 9, color: { argb: 'FF595959' } }, indent: 2, height: 15 }
const DET3    = { font: { italic: true, size: 9, color: { argb: 'FF808080' } }, indent: 4, height: 15 }
const GRUPO   = { font: { size: 9, color: { argb: 'FF404040' }, bold: true }, indent: 2, height: 15 }
const SUB     = { font: { bold: true, size: 10 }, indent: 1, fill: CINZA2 }

const cab = ws.addRow(['DRE BULA ASSESSORIA — 2026', ...MESES, 'ACUM. JAN–AGO', '% REC.'])
cab.eachCell((c) => {
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
  c.font = { bold: true, color: { argb: BRANCO }, size: 11 }
  c.alignment = { horizontal: 'center', vertical: 'middle' }
})
cab.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
cab.height = 24
const sub1 = ws.addRow(['Regime de competência (mês do leilão) · janeiro a agosto apurados · fechamento de 31/08/2026'])
sub1.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF808080' } }
sub1.height = 15
ws.addRow([])

linha('RECEITA BRUTA', RECEITA, H_PRETO)
linha('(-) IMPOSTO', IMPOSTO, H_CINZA)
linha('ISS (5%)', ISS, DET)
linha('Simples Nacional (13%)', SIMPLES, DET)
linha('RECEITA LÍQUIDA', REC_LIQ, H_PRETO)
linha('(-) CUSTOS DE COMISSÃO', CUSTO_COMISSAO, H_CINZA)
for (const [nome, v] of Object.entries(COMISSAO)) if (soma(v) > 0) linha(nome, v, DET)
linha('MARGEM DE CONTRIBUIÇÃO', MARGEM, H_PRETO)
linha('(-) DESPESAS FIXAS', DESP_FIXAS, H_CINZA)
linha('(-) Folha de Pagamento', FOLHA_TOT, SUB)
for (const [nome, v] of Object.entries(FOLHA)) if (soma(v) > 0) linha(nome, v, DET)
linha('(-) Encargos (FGTS / INSS / DARF)', ENCARGOS, SUB)
linha('(-) Carros', CARROS, SUB)
for (const [nome, v] of Object.entries(CARROS_DET)) if (soma(v) > 0) linha(nome, v, DET)
linha('(-) Utilitários', UTILITARIOS, SUB)
linha('Escritório', ESCRITORIO, GRUPO)
for (const [nome, v] of Object.entries(ESCRITORIO_DET)) if (soma(v) > 0) linha(nome, v, DET3)
linha('Tecnologia', TECNOLOGIA, GRUPO)
for (const [nome, v] of Object.entries(TECNOLOGIA_DET)) if (soma(v) > 0) linha(nome, v, DET3)
linha('Contabilidade', CONTABILIDADE, GRUPO)
linha('(-) DESPESAS VARIÁVEIS', DESP_VAR, H_CINZA)
linha('(-) Despesas Trabalhistas', TRABALHISTAS, SUB)
for (const [nome, v] of Object.entries(TRABALHISTAS_DET)) if (soma(v) > 0) linha(nome, v, DET)
linha('(-) Despesas de Diárias', DIARIAS, SUB)
for (const [nome, v] of Object.entries(DIARIAS_DET)) if (soma(v) > 0) linha(nome, v, DET)
linha('(-) Despesas de Marketing', MARKETING, SUB)
for (const [nome, v] of Object.entries(MARKETING_DET)) if (soma(v) > 0) linha(nome, v, DET)
linha('(-) Despesas Operacionais', OPERACIONAIS, SUB)
for (const [nome, v] of Object.entries(OPERACIONAIS_DET)) if (soma(v) > 0) linha(nome, v, DET)

const rl = linha('(=) LUCRO LÍQUIDO', LUCRO, { fill: DOURADO, font: { bold: true, size: 11 }, height: 22 })
rl.eachCell({ includeEmpty: true }, (c) => { c.border = { top: { style: 'double' }, bottom: { style: 'double' } } })
const rm = linha('Margem líquida sobre a receita', mapa((i) => (RECEITA[i] ? LUCRO[i] / RECEITA[i] : 0)), { font: { italic: true, size: 9, color: { argb: 'FF595959' } }, indent: 1, pct: false })
rm.eachCell({ includeEmpty: true }, (c, i) => { if (i > 1 && i <= 14) c.numFmt = '0.0%' })

// ---------------------------------------------------------------------------
// ABA CONFERENCIA
// ---------------------------------------------------------------------------
const wc = wb.addWorksheet('Conferência', { views: [{ state: 'frozen', ySplit: 1 }] })
wc.columns = [{ width: 46 }, ...Array(8).fill({ width: 14 }), { width: 15 }, { width: 62 }]

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
  row.getCell(10).alignment = { vertical: 'top', wrapText: true }
  row.getCell(1).alignment = { vertical: 'top', indent: opt.indent || 0, wrapText: true }
  row.height = opt.height || 15
  return row
}
const tituloC = (txt) => {
  const r = wc.addRow([txt])
  r.getCell(1).font = { bold: true, size: 11, color: { argb: BRANCO } }
  r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF404040' } }
  for (let i = 2; i <= 10; i++) r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF404040' } }
  r.height = 20
  return r
}

tituloC('1. IMPOSTO — provisão adotada na DRE x guias efetivamente pagas')
linhaC('Provisão 18% adotada na DRE (ISS 5% + Simples 13%)', IMPOSTO, 'Mesma convenção que o financeiro já usava na coluna de agosto e na coluna IMPOSTO (18%) da aba Leilões.')
linhaC('ISS efetivamente pago (guia SEFAZ Campo Grande)', ISS_PAGO, 'Guia do mês seguinte alocada na competência. Agosto vence em setembro — ainda não pago.')
linhaC('Simples Nacional efetivamente pago (DAS)', SIMPLES_PAGO, 'Idem. O DAS de julho (R$ 55.846,64) foi pago em 20/08.')
linhaC('Guia total paga', mapa((i) => (ISS_PAGO[i] || 0) + (SIMPLES_PAGO[i] || 0)), 'Carga real medida em julho: 16,39% (R$ 80.371,45 sobre R$ 490.496,32 de NFS-e). A provisão de 18% tem folga.')
linhaC('Faturamento em NFS-e implícito (ISS ÷ 5%)', mapa((i) => (ISS_PAGO[i] ? ISS_PAGO[i] / 0.05 : 0)), 'A NF é emitida depois do leilão — por isso este valor não acompanha a receita do mês. Serve para medir o atraso de faturamento.')
wc.addRow([])

tituloC('2. CUSTOS DE COMISSÃO — as três leituras')
linhaC('Adotado na DRE', CUSTO_COMISSAO, 'Jan–jul: apuração por assessor dos fechamentos. Agosto: valor já fechado pelo financeiro na aba DRE (R$ 154.707,00).', { font: { bold: true } })
linhaC('Apuração dos fechamentos (ERP)', COMISSAO_FECHAMENTOS, 'Soma de por_assessor[].comissao dos fechamentos do mês, com nomes canonizados.')
linhaC('Coluna COMISSÃO da aba Leilões', COMISSAO_PLANILHA.slice(0, N), 'Registro do financeiro por evento. Está em branco nos maiores leilões de julho (EAO Baviera, Santa Cruz) e em todo agosto — por isso não serve como total do mês.')
linhaC('Diferença (adotado − fechamentos)', mapa((i) => CUSTO_COMISSAO[i] - COMISSAO_FECHAMENTOS[i]), 'Só agosto diverge: −R$ 25.484,00. O ERP inclui "A definir" (7.800), Nane (6.150) e valores maiores para Douglas e Rusa.')
linhaC('LUCRO LÍQUIDO com a comissão adotada', LUCRO, 'É o número da aba DRE.', { font: { bold: true }, fill: DOURADO })
linhaC('LUCRO LÍQUIDO se valer a coluna COMISSÃO da aba Leilões', mapa((i) => LUCRO[i] + CUSTO_COMISSAO[i] - COMISSAO_PLANILHA[i]), 'Sensibilidade: a comissão é a variável que mais mexe no resultado. Fechar a comissão de jan–jul por pessoa move o lucro do ano nesta faixa.', { font: { bold: true }, fill: CINZA })
wc.addRow([])

tituloC('3. DESPESAS — o que o extrato mostra e a DRE não registrava')
linhaC('Despesas de leilão no extrato conciliado', DESP_LEILAO_EXTRATO, 'Categorias "Despesa Operacional Leilão" + "Viagem/Passagens" nos movimentos do Sicoob.')
linhaC('Despesas Variáveis lançadas na DRE', DESP_VAR, 'Abril e maio aparecem com R$ 0 na planilha do financeiro — mas a Expozebu aconteceu em abril.')
linhaC('Lacuna aparente (extrato − DRE)', mapa((i) => Math.max(0, DESP_LEILAO_EXTRATO[i] - DESP_VAR[i])), 'Não foi somado ao lucro: parte pode estar em outro grupo ou em cartão. É a fila de conferência.', { font: { bold: true, color: { argb: 'FFC00000' } } })
wc.addRow([])

tituloC('4. TRAVAS DE TRANSCRIÇÃO — a base foi conferida contra os totais da própria planilha')
for (const c of checks) {
  const r = wc.addRow([c.nome, c.obtido, c.esperado, c.dif, c.ok ? 'OK' : 'DIVERGE'])
  r.getCell(2).numFmt = MOEDA; r.getCell(3).numFmt = MOEDA; r.getCell(4).numFmt = MOEDA
  r.getCell(5).font = { bold: true, color: { argb: c.ok ? 'FF008000' : 'FFC00000' } }
  r.getCell(1).alignment = { wrapText: true, vertical: 'top' }
  r.height = 15
}
wc.addRow([])

tituloC('5. NOTAS DE MÉTODO')
const NOTAS = [
  ['Universo', 'Somente Bula Assessoria Pecuária Ltda (CNPJ 34.791.630/0001-43). O que entrou por Bula Remates ou Fórmula do Boi está fora, mesmo transitando na mesma conta Sicoob.'],
  ['Regime', 'Competência pelo mês do LEILÃO. Receita, imposto e comissão do mesmo evento caem no mesmo mês — é o que torna a margem comparável mês a mês.'],
  ['Receita Bruta', 'Coluna RECEITA da aba Leilões, somada pelo mês do leilão. Agosto fecha exatamente nos R$ 414.070,12 que já estavam na aba DRE — prova de que a base é a mesma.'],
  ['Receita de agosto', 'R$ 267.501,12 dos R$ 414.070,12 (65%) vêm de eventos ainda "EM FECHAMENTO" ou "COBRAR". É receita apurada, não recebida.'],
  ['Erro achado na planilha', 'O TOTAL 2026 da aba Leilões (R$ 1.577.363,64) conta duas vezes o Santa Nazaré Excelência: a linha-mãe de R$ 11.428,00 e as duas parcelas de R$ 5.714,00. O total correto é R$ 1.565.935,65.'],
  ['Erro achado na aba DRE', 'Os subtotais de DESPESAS VARIÁVEIS de agosto estavam com fórmula em cascata quebrada (159.616 → 79.808 → 39.904, cada um o dobro do seguinte). Foram recalculados a partir do detalhe.'],
  ['Utilitários de agosto', 'Estava R$ 1.528,39 (só Tecnologia). Faltavam Contabilidade R$ 1.058,00 e Seguros R$ 184,64, ambos débitos confirmados no extrato.'],
  ['Escritório', 'Sem aluguel, internet, energia e café a partir de agosto — o escritório foi encerrado. O último débito de internet é de 02/07 (Digital Net, "último pagamento").'],
  ['Comissão jan–mar', 'A aba DRE trazia R$ 0. Não era zero: era falta de lançamento. Os fechamentos mostram R$ 2.202,00 / R$ 16.097,00 / R$ 54.255,20.'],
  ['Encargos', 'Linha nova, que a planilha não tinha. São as guias de DARF/FGTS de funcionários do extrato, alocadas na competência (guia paga no mês seguinte).'],
  ['O que falta para fechar', 'Emitir NF dos R$ 267 mil de agosto ainda em fechamento; conciliar 28–31/08 (o extrato do Sicoob vai até 27/08); resolver a divergência de R$ 25.484,00 na comissão de agosto.'],
]
for (const [t, d] of NOTAS) {
  const r = wc.addRow([t, d])
  wc.mergeCells(r.number, 2, r.number, 10)
  r.getCell(1).font = { bold: true, size: 10 }
  r.getCell(1).alignment = { vertical: 'top', wrapText: true }
  r.getCell(2).alignment = { vertical: 'top', wrapText: true }
  r.height = 30
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
const destino = process.argv[2] || 'C:/Users/Notebook-Acer/Desktop/DRE BULA ASSESSORIA 2026 - jan a ago.xlsx'
await wb.xlsx.writeFile(destino)

console.log('\nDRE BULA ASSESSORIA 2026 — jan a ago')
console.log('-'.repeat(96))
const fmt = (v) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(13)
console.log('MÊS'.padEnd(12) + 'RECEITA'.padStart(13) + 'IMPOSTO'.padStart(13) + 'COMISSÃO'.padStart(13) + 'D.FIXAS'.padStart(13) + 'D.VARIÁV.'.padStart(13) + 'LUCRO'.padStart(13))
for (let i = 0; i < N; i++) {
  console.log(MESES[i].padEnd(12) + fmt(RECEITA[i]) + fmt(IMPOSTO[i]) + fmt(CUSTO_COMISSAO[i]) + fmt(DESP_FIXAS[i]) + fmt(DESP_VAR[i]) + fmt(LUCRO[i]))
}
console.log('-'.repeat(96))
console.log('ACUM.'.padEnd(12) + fmt(soma(RECEITA.slice(0, N))) + fmt(soma(IMPOSTO)) + fmt(soma(CUSTO_COMISSAO.slice(0, N))) + fmt(soma(DESP_FIXAS)) + fmt(soma(DESP_VAR)) + fmt(soma(LUCRO)))
console.log('\nTravas: ' + checks.filter((c) => c.ok).length + '/' + checks.length + ' OK')
for (const c of checks.filter((c) => !c.ok)) console.log('  ! ' + c.nome + ': ' + c.obtido + ' vs ' + c.esperado)
console.log('\nArquivo: ' + destino)

