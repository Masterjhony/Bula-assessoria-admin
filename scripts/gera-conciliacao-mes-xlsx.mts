/**
 * Planilha de conferencia da conciliacao bancaria — Sicoob CC 1.056-1.
 *
 * Pedido do chefe (01/09/2026, 11:48): "Algumas saidas de Agosto nao estao
 * conciliadas. Finaliza essa conciliacao no detalhe e me envia por favor um
 * excel, fica mais facil por que vou colorindo aqui e dando o check".
 * Em 02/09 ele pediu o mesmo para julho.
 *
 * Le direto do ERP (a unica parte escrita a mao e a coluna "O QUE FOI", que
 * traduz o historico do banco para portugues) e monta ate 7 abas:
 *   Resumo · Saidas · Entradas · Por Natureza · Pagamentos Agregados ·
 *   [aba extra do mes] · Pendencias
 *
 * As colunas CONFERIDO e ANOTACAO ficam vazias de proposito: sao do chefe.
 *
 * Uso: npx tsx scripts/gera-conciliacao-mes-xlsx.mts [--mes 2026-07|2026-08]
 */
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const argv = process.argv.slice(2)
const MES = argv.includes('--mes') ? argv[argv.indexOf('--mes') + 1] : '2026-08'

/* ============================ paleta (brandbook) ========================== */
const PRETO   = 'FF111111'
const GRAFITE = 'FF2B2B2B'
const DOURADO = 'FFC9A84C'
const BRANCO  = 'FFFFFFFF'
const ZEBRA   = 'FFF6F6F4'
const LINHA   = 'FFD9D9D6'
const VERDE   = 'FF1B7F4B'
const VERDE_F = 'FFE8F5EE'
const VERM    = 'FFB3261E'
const VERM_F  = 'FFFDECEA'
const AMAR_F  = 'FFFFF6E0'
const AZUL_F  = 'FFEDF3FA'
const CINZA_T = 'FF6B6B66'
const MOEDA = '#,##0.00;[Red]-#,##0.00'
const DATA  = 'dd/mm/yyyy'

type Item = [rot: string, val: any, obs?: string, destaque?: boolean]
type Bloco = { titulo: string; itens: Item[] }
type Agregado = { mov: string; titulo: string; tipo: 'CP' | 'CR'; ids: string[]; extra?: { rotulo: string; valor: number; nota: string } }
type Config = {
  rotulo: string; de: string; ate: string
  arquivo: string; fonte: string
  saldoIni: { data: string; valor: number }; saldoFim: { data: string; valor: number }
  explica: Record<string, { oque: string; ref?: string }>
  agregados: Agregado[]
  pendencias: [string, string, number | string, string][]
  leitura: Record<string, string>
  resumoTopo: Bloco[]; resumoFim: Bloco[]
  abaExtra?: { nome: string; titulo: string; subtitulo: string; de: string; ate: string; rodape: string }
}

/* ======================================================================== */
/* ============================ CONFIG · JULHO ============================ */
/* ======================================================================== */
const JULHO: Config = {
  rotulo: 'JULHO/2026', de: '2026-07-01', ate: '2026-07-31',
  arquivo: 'outputs/conciliacao-julho-2026/Conciliacao-Julho-2026-Bula.xlsx',
  fonte: 'Bula Assessoria Pecuária Ltda · Sicoob Unique BR, Coop. 4620-5, Conta Corrente 1.056-1 · '
    + 'Fonte: extrato 01 a 29/07 (PDF sicoob_2026_07_29_10_50_55, validação por saldo OK em todos os dias) '
    + 'e o SALDO ANTERIOR de 31/07 impresso no extrato de agosto.',
  saldoIni: { data: '30/06/2026', valor: 73259.33 },
  saldoFim: { data: '31/07/2026', valor: 25208.83 },
  explica: {
    // ---- 01 a 03/07 (fecho de junho) ----
    '5e76fcb4': { oque: 'Tarifa do Sicoob pela liquidação do boleto do Kito (entrada de 15.030,00 no mesmo dia).' },
    '26a0548a': { oque: 'DARF dos empregados — competência junho/2026.', ref: 'Encargos jun/2026' },
    '3348c75c': { oque: '1ª das 3 parcelas do Kito (boleto). Comissão do leilão de 09/05 dentro do acordo 4R.', ref: 'Kito — acordo 4R' },
    '087ddaac': { oque: 'Guia da Caixa Econômica Federal (FGTS) — competência junho/2026.', ref: 'Encargos jun/2026' },
    'da33d195': { oque: 'Internet do escritório (Digital Net) — ÚLTIMO pagamento antes do encerramento do escritório.', ref: 'Estrutura' },
    '6802bc15': { oque: 'NF 8 da parceria com a Fórmula do Boi — 2ª de 6 parcelas (leilão de 02/06).', ref: 'Parceria Fórmula do Boi' },
    '7226e453': { oque: 'Salário de junho/2026 — Leonardo Serafim.', ref: 'Folha jun/2026' },
    'b27fb4ec': { oque: 'Corrida de aplicativo (Uber).' },
    'f943b771': { oque: 'Salário de junho/2026 — Ana Paula Porfírio Munhoz (financeiro, antes da saída).', ref: 'Folha jun/2026' },
    '5b6c63d2': { oque: 'Comissão do 41º Leilão Touros Camparino, paga por José H. V. Martins (TED).', ref: '41º Camparino 06/06' },
    'd9ede8fb': { oque: 'Crédito da EAO Empreendimentos. RECEBIMENTO AGREGADO: cobre 2 títulos (Matrizes EAO 54.669,29 + Touros EAO 25.602,72).', ref: 'Matrizes e Touros EAO' },
    '48a8a28c': { oque: 'Salário de junho/2026 — Douglas Bispo (NFS-e 33).', ref: 'Folha jun/2026' },
    '62e172cf': { oque: 'Salário de junho/2026 — Fábio Omena (NFS-e 25). Folha ainda no valor antigo de 11.700; passou a 7.000 em julho.', ref: 'Folha jun/2026' },
    // ---- 06 a 08/07 ----
    '91105af8': { oque: 'Salário de junho/2026 — João Antônio, proporcional a 23 dias.', ref: 'Folha jun/2026' },
    '501f2ee8': { oque: 'Hospedagem do site bulaassessoria.com (ClickWeb) — boleto.' },
    '4d28eab0': { oque: 'Salário de junho/2026 — João Gabriel (marketing).', ref: 'Folha jun/2026' },
    '910de02d': { oque: 'Honorários de contabilidade — boleto.', ref: 'Contabilidade jun/2026' },
    '6d8c48d4': { oque: 'Reembolso das despesas de campo do Douglas Bispo nos leilões Tresmar, JMP e Flor do Aratau — custo direto.', ref: 'Reembolso leilões jun/2026' },
    '3ef4bbd8': { oque: 'Salário de junho/2026 — João Eduardo (ainda 3.000; passou a 5.000 na competência julho).', ref: 'Folha jun/2026' },
    '336fe5d7': { oque: 'Comissão do Leilão Matrizes Santa Nice 2026, paga por Marcelo Procópio Grisi.', ref: 'Santa Nice 06/06' },
    '6db422f3': { oque: 'Alimentação — Pão & Tal Conveniências.' },
    'b4bb2a6f': { oque: 'Comissão recebida da Central Leilões.', ref: 'Central Leilões' },
    'fe82112b': { oque: 'Reembolso à Fórmula do Boi dos gastos no cartão com o desenvolvimento do sistema.' },
    '7ee8a3e5': { oque: 'Reembolso das despesas de junho do Fábio Omena.', ref: 'Reembolso leilões jun/2026' },
    'f3d79d4e': { oque: 'NF 26 — comissão de MAIO/2026 do Fábio Omena (FO Assessoria).', ref: 'Comissões mai/2026' },
    '5020ac08': { oque: 'Collab com a Pecuária Brasil (divulgação) — Performance Publicidade.', ref: 'Mídia jul/2026' },
    '6c12ff4c': { oque: 'Reembolso de despesas de campo do Leonardo Serafim — custo direto de leilão.', ref: 'Reembolso leilões jun/2026' },
    '34619537': { oque: 'Hotel do Leonardo nos leilões MEAB e Fazenda Modelo — boleto.', ref: 'MEAB e Modelo 23/06' },
    '4f1e5b43': { oque: 'Diárias de junho do Matheus (equipe de campo).', ref: 'Diárias jun/2026' },
    '72e094af': { oque: 'Alimentação — Pão & Tal Conveniências.' },
    '57ae9743': { oque: 'Hotel do Marcelo na reunião com a Bula e o Leonardo — boleto.' },
    'fb2875b6': { oque: 'Hotel do Douglas e do Fábio nos leilões JMP e Terra Brava — boleto.', ref: 'JMP e Terra Brava jun/2026' },
    // ---- 09 a 10/07 ----
    'd7766d17': { oque: 'Multa de trânsito — locadora Unidas.' },
    '5b99e6c5': { oque: 'Tráfego pago no Meta. O memo do banco só dizia "solicitado Joao" e o lançamento estava parado em "Outras despesas — IDENTIFICAR"; o CNPJ 13.347.016/0001-17 é o Facebook, o mesmo de todos os outros tráfegos. Reclassificado nesta rodada.', ref: 'Mídia paga jul/2026' },
    '82176701': { oque: 'Multa de trânsito — locadora Unidas.' },
    '9d6455b3': { oque: 'Comissão recebida da Tangará Pecuária (Rancho da Matinha).', ref: 'Rancho da Matinha' },
    '1055adac': { oque: 'Comissão do Lucas Martins referente a maio e junho (Matinha Golden 19/05, MNO 11/06 e JMP 15/06).', ref: 'Comissões mai-jun/2026' },
    '5f28cd57': { oque: 'Pacote mensal de serviços do Sicoob.' },
    '42b9e3c5': { oque: 'Passagem do Fábio para o Leilão LS (7 e 8/08) — ADN Viagens.', ref: 'LS Galeria 07-08/08' },
    '5bbfd9a8': { oque: 'Integralização de capital na cooperativa (Sicoob) — parcela mensal.' },
    // ---- 13 a 17/07 ----
    '75de2b62': { oque: 'PASS-THROUGH do Leilão Prata 2025: os 38.000,00 que entraram de Francisco Prata no mesmo dia saem para Felipe Vilela Andrade. Não é despesa da Bula e fica fora do resultado.', ref: 'Leilão Prata 2025' },
    '6db0547a': { oque: 'Saldo final da comissão do parceiro Gustavo Rusa referente a maio/junho. O título de 64.945,00 foi quitado em 4 PIX: 20.000 (22/05), 16.750 (12/06), 20.740 (29/06) e estes 7.455,00.', ref: 'Comissões mai-jun/2026 — Rusa' },
    '30cf179e': { oque: 'PASS-THROUGH do Leilão Prata 2025: dinheiro de Francisco Prata que sai no mesmo dia para o Felipe. Não é receita e fica fora do resultado.', ref: 'Leilão Prata 2025' },
    'e6c534ec': { oque: 'ISSQN — guia da Prefeitura de Campo Grande, competência junho/2026.', ref: 'ISSQN jun/2026' },
    '7c74f2f8': { oque: 'PIX de 5 centavos — teste de chave feito pelo próprio João Eduardo.' },
    '652b59bb': { oque: 'Comissão de parceiro do leilão JMP, paga por PIX a um CPF (***.919.892-**) que não está na base de pessoas e sem título correspondente. CONFIRMAR de quem é.', ref: 'JMP' },
    'c287ca5e': { oque: 'Comissão do Leilão Seleção Nelore FLOC, paga por Osman Loureiro Farias Neto.', ref: 'Nelore FLOC' },
    '6aac8260': { oque: 'Comissão da Laila referente ao Leilão 4R de 09/05.', ref: 'Comissões — Laila' },
    'b157a658': { oque: 'Alvará da Prefeitura — Bula Assessoria.' },
    '765c5c26': { oque: 'Seguro Sicoob (débito em convênio) — segunda apólice.' },
    '2603c28d': { oque: 'Seguro Sicoob (débito em convênio).' },
    'b6fc2f04': { oque: 'Passagem do Leonardo para a Expogenética, ida e volta — ADN Viagens.', ref: 'Expogenética 2026' },
    '9b315343': { oque: 'Passagem do Marcelo para a Expogenética, ida e volta por Campo Grande — ADN Viagens.', ref: 'Expogenética 2026' },
    '5770afaf': { oque: 'Comissão do 8º Leilão Jacamim Fêmeas, paga por Marcos Martins Villela.', ref: '8º Jacamim 07/06' },
    // ---- 20 a 24/07 ----
    '7ef14955': { oque: 'Simples Nacional (DAS) — competência junho/2026.', ref: 'DAS jun/2026' },
    'd76fc5fa': { oque: 'Fatura do cartão VISA. As compras são 100% gastos do Felipe V. Andrade (Bulinha) e a fatura ABATE o que a Bula deve a ele — por isso não é despesa de estrutura. O gasto item a item está em ERP › Cartões › Fatura.' },
    '8875e2e4': { oque: 'Fatura do cartão MASTERCARD. Mesma regra do Visa: as compras são gastos do Felipe V. Andrade e a fatura abate a dívida.' },
    '76a7e13f': { oque: 'Crédito da Bula Remates referente à NF 624 (leilões Nelore Kriz, IPB e Rio Bonito).', ref: 'Kriz / IPB / Rio Bonito' },
    '14444a54': { oque: 'NF 27 — comissão de junho do Fábio Omena, 1ª de 2 partes (o saldo saiu em 10/08 e 14/08).', ref: 'Comissões jun/2026' },
    '3a38ee31': { oque: 'Tráfego pago no Meta — campanha de captação de clientes para os leilões de touros.', ref: 'Mídia paga jul/2026' },
    '1fcbccc9': { oque: 'Comissão de junho do Leonardo Serafim (NF 13). PAGAMENTO AGREGADO: quita 10 títulos — abertura na aba "Pagamentos Agregados".', ref: 'Comissões jun/2026' },
    '46289412': { oque: 'Comissão de junho do Douglas Bispo (NF 35). PAGAMENTO AGREGADO: quita 9 títulos.', ref: 'Comissões jun/2026' },
    // ---- 27 a 31/07 (o que estava escondido no lançamento agregado) ----
    'f075b05d': { oque: 'Parcela da NF 615 (Terra Brava junho/2026, 7.215,00 em 3 de 2.405,00) paga por Eduardo Pinheiro Campos. ⭐ Estava dentro do lançamento AGREGADO 25-29/07 e nunca tinha sido baixada — por isso o PIX de 25/08 foi lido como 1ª parcela quando era a 2ª.', ref: 'Terra Brava jun/2026' },
    'f5eb4abc': { oque: 'Comissão do Leilão Nelore Santa Nazaré (09/06), paga pela Tork Transporte e Locações.', ref: 'Santa Nazaré 09/06' },
    'b2ab0bee': { oque: 'Tarifa do Sicoob pela liquidação do boleto do Matinha (entrada de 2.800,00 no mesmo dia). ⭐ Detalhado nesta rodada.' },
    'bd20bbcf': { oque: 'Tráfego pago no Meta para a campanha do Leilão Touros Fazenda São Geraldo (01/08). ⭐ Detalhado nesta rodada.', ref: 'Campanha São Geraldo' },
    'de0ccd2c': { oque: '1ª parcela do Leilão Virtual Touros Matinha — Thiago, boleto com vencimento em 29/07, pago NO DIA. ⭐ Estava dentro do lançamento AGREGADO: o título seguia "vencido" com zero recebido enquanto a 2ª parcela já constava paga desde 11/08.', ref: 'Matinha Thiago' },
    'ddef680b': { oque: 'PIX de 170,00 com memo "Taxi Marcelo Cofins" para o CPF ***.037.836-**, que não está na base de pessoas. Classificado como transporte pelo memo — CONFIRMAR de quem é o CPF. ⭐ Detalhado nesta rodada.' },
    '5cddf57e': { oque: '2ª das 3 parcelas do Kito (acordo 4R). A DATA é provável, não confirmada: veio do fechamento de julho, não de um extrato — o de 30-31/07 nunca foi puxado.', ref: 'Kito — acordo 4R' },
    'db2803f6': { oque: '⚠ LANÇAMENTO AGREGADO, NÃO É UMA DESPESA REAL. É o valor líquido que falta para o saldo de 31/07 fechar nos 25.208,83 que o extrato de agosto imprime como SALDO ANTERIOR. Some assim que o extrato de 30 e 31/07 for puxado.' },
  },
  agregados: [
    { mov: 'd9ede8fb', titulo: '03/07 · R$ 80.272,01 · EAO Empreendimentos — Matrizes e Touros (ENTRADA)', tipo: 'CR',
      ids: ['a616c62b', '5f7ee022'] },
    { mov: '1fcbccc9', titulo: '24/07 · R$ 21.788,00 · Leonardo Serafim — comissão de junho/2026 (NF 13)', tipo: 'CP',
      ids: ['fcabdc03', '5e6540fe', 'f14552b6', '9319ce66', '6b3ceef2', '849190fd', '31d36807', 'e0f67f04', 'be7b1dae', '97059ee8'] },
    { mov: '46289412', titulo: '24/07 · R$ 28.493,00 · Douglas Bispo — comissão de junho/2026 (NF 35)', tipo: 'CP',
      ids: ['5ea6e5d9', 'be1a32bd', '71eb3e23', '0a57c994', 'b083aca3', '9dda0533', 'c817c3d0', '247b86ed', 'fbd00dd3'] },
  ],
  leitura: {
    'Comissões': 'O mês do ciclo de maio e junho: Fábio (36.849 + 40.430), Douglas (28.493), Leonardo (21.788), Rusa (7.455), Lucas, Laila e as duas faturas de cartão do Bulinha.',
    'Impostos e Taxas': 'DAS de junho (28.660,03) + ISSQN (12.566,78) + FGTS e alvará.',
    'Folha de Pagamento': 'Folha de junho/2026, paga entre 02 e 06/07 — ainda com a Ana Paula e com o Fábio a 11.700.',
    'Transferencias Internas - Saida': 'Pass-through do Leilão Prata 2025: entrou de Francisco Prata e saiu para o Felipe no mesmo dia. Fora do resultado.',
    'Despesa Operacional Leilão': 'Hotéis e reembolsos de campo dos leilões de junho — custo direto, não estrutura.',
    'Viagem/Passagens': 'Passagens da Expogenética (Leonardo e Marcelo) e do Leilão LS.',
    'Marketing e Publicidade': 'Tráfego pago no Meta (3.000 em 09/07, 2.000 em 24/07 e 2.000 em 29/07) e o collab da Pecuária Brasil.',
    'Servicos de Terceiros': 'Contador e reembolso do cartão de desenvolvimento do sistema.',
    'Tarifas Bancarias': 'Pacote de serviços e as duas tarifas de cobrança de boleto.',
    'Juros e Multas': 'Duas multas de trânsito da locadora Unidas.',
    'Software/Assinaturas': 'Hospedagem do site bulaassessoria.com (ClickWeb).',
    'Energia/Agua/Telefone': 'Internet do escritório — último pagamento antes do encerramento.',
    'Seguros': 'Duas apólices do Sicoob Seg em débito por convênio.',
    'Outras Despesas': '⚠ É o lançamento AGREGADO de 30-31/07, que não é despesa: é o líquido de dois dias sem extrato.',
    'Alimentacao/Refeicoes': 'Pão & Tal Conveniências.',
    'Transporte (Apps)': 'Uber e o "Táxi Marcelo" de 29/07.',
    'Integralizacao Capital Cooperativa': 'Parcela mensal de capital no Sicoob — é aplicação, não despesa.',
  },
  resumoTopo: [
    { titulo: 'O QUE JULHO ESCONDIA', itens: [
      ['Situação antes', '2 tampões', 'Julho aparecia 100% conciliado, mas dois lançamentos não eram movimentos reais: eram VALORES LÍQUIDOS lançados em 04/08 para fechar o saldo, com a instrução na própria observação — "substituir pelos lançamentos reais quando o extrato for puxado". 29/07 +3.032,92 (25-29/07) e 31/07 −6.672,06 (30-31/07).'],
      ['Por que ninguém viu', 'o saldo fechava', 'Um tampão fecha o saldo, então nenhuma validação reclama e o mês passa por conferido. Mas um valor líquido não tem contraparte, não tem título e não baixa nada — e foi exatamente isso que escondeu dois recebimentos.'],
      ['Situação agora', '1 tampão', 'O de 25-29/07 foi substituído pelos 5 lançamentos reais do extrato, que somam os mesmos 3.032,92 ao centavo. O de 30-31/07 continua: não existe extrato desses dois dias.', true],
    ] },
    { titulo: '⭐ O QUE APARECEU QUANDO O TAMPÃO SAIU', itens: [
      ['27/07 · Terra Brava · 2.405,00', 'era a 2ª', 'Parcela da NF 615 (7.215,00 em 3 de 2.405,00) paga por Eduardo Pinheiro Campos e nunca baixada. CORRIGE A LEITURA DE 26/08: o PIX de 25/08 foi registrado como a 1ª parcela, mas era a 2ª. Faltava 4.810,00 — falta 2.405,00.', true],
      ['29/07 · Matinha Thiago · 2.800,00', 'pago no dia', 'Boleto da 1ª parcela, vencimento 29/07, liquidado no próprio dia. O título seguia "vencido" com zero recebido — enquanto a 2ª parcela já constava paga desde 11/08. O ERP mostrava a 2ª quitada e a 1ª em aberto.', true],
      ['Efeito nas cobranças', 5205, 'Os dois somam R$ 5.205,00 que apareciam como "a receber vencido" e já estavam na conta desde julho.', true],
    ] },
  ],
  resumoFim: [
    { titulo: 'O QUE MAIS MUDOU NESTA RODADA', itens: [
      ['29/07 · tarifa, Meta e táxi', 'conciliados', 'As outras três linhas que estavam dentro do tampão: tarifa de cobrança 2,08, tráfego da campanha do São Geraldo 2.000,00 e o "Táxi Marcelo" 170,00. Todas com título criado e baixado.'],
      ['09/07 · 3.000,00', 'reclassificado', 'Estava em "Outras despesas" com a nota "IDENTIFICAR — aguarda revisão", porque o memo do banco só dizia "solicitado Joao". O CNPJ é o do Facebook, o mesmo de todos os outros tráfegos pagos. Virou Marketing e Publicidade.'],
      ['13/07 · 38.000,00', 'par declarado', 'O pass-through do Leilão Prata 2025 tinha as duas pernas fora do resultado, mas sem vínculo entre elas. Agora a entrada e a saída se apontam.'],
    ] },
  ],
  pendencias: [
    ['⚠ Extrato de 30 e 31/07 — o último tampão',
     'O lançamento de −6.672,06 em 31/07 NÃO é uma despesa: é o valor líquido que falta para o saldo fechar nos 25.208,83 que o extrato de agosto imprime como SALDO ANTERIOR. É o único tampão que resta no ERP inteiro. Some assim que o extrato de 01 a 31/07 for puxado — e pode ter dentro dele, como o de 25-29/07 tinha, título já pago que ainda aparece em aberto.',
     6672.06, 'Sicoob › Extrato › período 01/07 a 31/07 › PDF'],
    ['Data do recebimento do Kito (2/3)',
     'Os 15.030,00 estão lançados em 30/07 como PROVÁVEL: a data veio do fechamento de julho, não de um extrato. Cai justamente nos dois dias sem extrato.',
     15030, 'Confirma junto com o extrato de 30-31/07'],
    ['Terra Brava — o que ainda falta',
     'Depois de achar a parcela de 27/07, o recebido da NF 615 sobe para 4.810,00 de 7.215,00.',
     2405, 'Cobrar a 3ª e última parcela'],
    ['Títulos recebidos em julho sem movimento no Sicoob',
     '8 títulos marcados como recebidos em julho não têm movimento próprio no extrato do Sicoob (R$ 94.988,72). Um deles, Touros EAO 25.602,72, está dentro do crédito agregado de 03/07 e está explicado. Os outros 7 (R$ 69.386,00) ou entraram por outra conta ou tiveram baixa manual — e três caem no mesmo dia de um crédito da Bula Remates que já tem título-espelho próprio. Conferir para não contar a mesma receita duas vezes.',
     69386, 'Conferir contra o extrato Sicredi de julho'],
    ['Comissão de parceiro JMP — 6.570,00',
     'PIX de 13/07 para o CPF ***.919.892-**, sem título e sem pessoa cadastrada. A descrição só diz "Ref Comissao de Parceiro JMP".',
     6570, 'Identificar o parceiro e emitir o título'],
    ['"Táxi Marcelo" — 170,00',
     'PIX de 29/07 para o CPF ***.037.836-**, que não está na base de pessoas.',
     170, 'Confirmar de quem é o CPF'],
    ['Conta Sicredi parada em junho',
     'O ERP não tem nenhum movimento do Sicredi depois de 04/08, e nenhum de julho. Se algum recebimento de julho entrou por lá, ele não está no caixa.',
     '—', 'Importar o extrato Sicredi de julho e agosto'],
  ],
}

/* ======================================================================== */
/* ============================ CONFIG · AGOSTO =========================== */
/* ======================================================================== */
const AGOSTO: Config = {
  rotulo: 'AGOSTO/2026', de: '2026-08-01', ate: '2026-08-31',
  arquivo: 'outputs/conciliacao-agosto-2026/Conciliacao-Agosto-2026-Bula.xlsx',
  fonte: 'Bula Assessoria Pecuária Ltda · Sicoob Unique BR, Coop. 4620-5, Conta Corrente 1.056-1 · '
    + 'Fonte: extratos "extrato agosto.pdf" (01 a 31/08) e "extrato setembro.pdf" (01/09), emitidos em 01/09/2026 15:11.',
  saldoIni: { data: '31/07/2026', valor: 25208.83 },
  saldoFim: { data: '31/08/2026', valor: 33654.45 },
  explica: {
    '9bb110cb': { oque: 'Tarifa do Sicoob pela liquidação de boleto de cobrança.' },
    '01a23a60': { oque: 'Encargo social recolhido na Caixa Econômica Federal (FGTS).', ref: 'Encargos jul/2026' },
    '77b2ad3d': { oque: 'Acerto final de contas com Valdeneusa Félix (ex-equipe).', ref: 'Acerto jul/2026' },
    'd143f224': { oque: 'Acerto final de contas com Ana Paula Porfírio Munhoz (ex-financeiro).', ref: 'Acerto jul/2026' },
    '886ea5bf': { oque: 'Hospedagem da equipe — Busse Hotelaria.', ref: 'Viagem/estadia' },
    '05f50130': { oque: 'Marketing: collab da campanha do Leilão São Geraldo (agência Performance Publicidade).', ref: 'Campanha São Geraldo' },
    'dd1d4163': { oque: 'Salário de julho/2026 — João Gabriel.', ref: 'Folha jul/2026' },
    'd97da3be': { oque: 'Salário de julho/2026 — João Antônio.', ref: 'Folha jul/2026' },
    'fe2d53c0': { oque: 'Salário de julho/2026 — Douglas Bispo (NFS-e 36).', ref: 'Folha jul/2026' },
    '19bf1800': { oque: 'Salário de julho/2026 — João Eduardo (NFS-e 3). Reajuste de 3.000 para 5.000 a partir da competência julho.', ref: 'Folha jul/2026' },
    'e6e05704': { oque: 'Salário de julho/2026 — Fábio Omena. Folha nova de 7.000 (era 11.700 até junho).', ref: 'Folha jul/2026' },
    '1db2d21f': { oque: 'Salário de julho/2026 — Leonardo Serafim (NFS-e 14).', ref: 'Folha jul/2026' },
    '3a1ddae6': { oque: 'Estadia da equipe no Leilão Touros Fazenda São Geraldo.', ref: 'São Geraldo 01/08' },
    '15f8c480': { oque: 'Honorários do contador (Lucas) — boleto.', ref: 'Contabilidade jul/2026' },
    '3a16ca0f': { oque: 'Reembolso das despesas de campo do Fábio Omena — custo direto de leilão.', ref: 'Reembolso leilões jul/2026' },
    '3e80cb88': { oque: 'Reembolso das despesas de campo do Leonardo Serafim — custo direto de leilão.', ref: 'Reembolso leilões jul/2026' },
    '81aa5473': { oque: 'Diárias de hotel de Peralta, Carrelo e Renato no Leilão LS (7 e 8/08) — Atlas Hotels.', ref: 'LS Galeria 07-08/08' },
    'cbc5ff2b': { oque: 'Integralização de capital na cooperativa (Sicoob) — parcela mensal.' },
    'c3cba114': { oque: 'Pacote mensal de serviços do Sicoob.' },
    '3775cb7c': { oque: 'Alimentação — Bolos & Cia. Contraparte identificada nesta conciliação (CNPJ 21.986.213/0001-04); estava como "Outras despesas / não identificada".' },
    '8a1b4c07': { oque: 'Corrida de aplicativo (Uber). Esta cobrança foi estornada no mesmo dia e relançada — ver a entrada de 20,98 em 10/08.' },
    '44c0e609': { oque: 'Corrida de aplicativo (Uber).' },
    'dc3b78ec': { oque: 'Mensalidade do site (ClickWeb) — boleto.' },
    '0e44f763': { oque: 'Diárias do Matheus (equipe de campo).', ref: 'Diárias jul/2026' },
    'dbeac96f': { oque: 'Reembolso do restante dos gastos feitos no cartão — Fórmula do Boi. Custo direto de leilão.', ref: 'Reembolso leilões jul/2026' },
    'c696f8fc': { oque: 'Tráfego pago no Meta (Facebook/Instagram) — campanha patrocinada.', ref: 'Mídia paga ago/2026' },
    'd3c34f18': { oque: 'Comissão de junho/2026 — restante devido ao Fábio Omena (NFS-e 28).', ref: 'Comissões jun/2026' },
    '9610cd2d': { oque: 'Comissão de julho/2026 do parceiro Gustavo Rusa (NF 34), que ganha 5%. PAGAMENTO AGREGADO: quita 5 títulos — abertura na aba "Pagamentos Agregados".', ref: 'Comissões jul/2026 — Rusa' },
    '65f5c612': { oque: 'Tarifa do Sicoob pela liquidação do boleto do Matinha (entrada de 2.800,00 no mesmo dia).' },
    '20413472': { oque: 'Entrada dos uniformes da Expogenética.', ref: 'Expogenética 2026' },
    'e9ec99b0': { oque: 'Aluguel da casa da equipe na Expogenética.', ref: 'Expogenética 2026' },
    'c567d0af': { oque: 'Comissão de junho/2026 — saldo restante do Fábio Omena.', ref: 'Comissões jun/2026' },
    'd029a312': { oque: 'Reembolso à Bula Remates pela reemissão de passagens da equipe — custo direto de leilão.', ref: 'Expogenética 2026' },
    'c47a4492': { oque: 'Seguro Sicoob (débito em convênio).' },
    'd22bd650': { oque: 'Seguro Sicoob (débito em convênio) — segunda apólice.' },
    'ce02c2dd': { oque: 'ISSQN — guia da Prefeitura de Campo Grande.', ref: 'ISSQN competência jul/2026' },
    '14ce31fe': { oque: 'Plano do banco de dados do sistema, reembolsado ao João Eduardo.' },
    '9b1115f3': { oque: 'Restante dos uniformes da Expogenética.', ref: 'Expogenética 2026' },
    'b2c4718f': { oque: 'Remat — deferimento de marcas (1º pagamento).' },
    'd22a07ac': { oque: 'DARF dos funcionários (débito agendado).', ref: 'Encargos jul/2026' },
    'a8e4b302': { oque: 'Simples Nacional (DAS) da competência julho/2026.', ref: 'DAS jul/2026' },
    '9eafca9b': { oque: 'Passagens da Expogenética de Fábio e Leonardo (ADN Viagens). PAGAMENTO AGREGADO: quita 2 títulos.', ref: 'Expogenética 2026' },
    '2f877d16': { oque: 'Assinatura da Anthropic (Claude IA), reembolsada ao João Eduardo.' },
    '713e0c7b': { oque: 'Fatura do cartão MASTERCARD. As compras são 100% gastos do Felipe V. Andrade (Bulinha) e a fatura ABATE o que a Bula deve a ele — por isso não é despesa de estrutura. O gasto item a item está em ERP › Cartões › Fatura.' },
    'f92c8b51': { oque: 'Fatura do cartão VISA. Mesma regra do Mastercard: as compras são gastos do Felipe V. Andrade e a fatura abate a dívida.' },
    'e8c961d7': { oque: 'Comissão de julho/2026 do Douglas Bispo. PAGAMENTO AGREGADO: quita 10 títulos (10.116,00) + complemento de 1.792,00. Segue em aberto 320,00 do lote 19 do Nelore Sorriso, sem título.', ref: 'Comissões jul/2026' },
    '54d664fc': { oque: 'Comissão de julho/2026 do Leonardo Serafim. QUITA 5 TÍTULOS (abertura na aba "Pagamentos Agregados"). Estava sem vínculo desde 26/08 por causa da disputa dos lotes 26 e 30 da EAO Baviera Fêmeas — resolvida em 28/08 pela mensagem formal do grupo de lances.', ref: 'Comissões jul/2026' },
    '2165b58c': { oque: 'Comissão de julho/2026 do Fábio Omena. QUITA 7 TÍTULOS (8.706,00) + 120,00 de adiantamento sobre o Nelore Santa Cruz 19/07. Mesma disputa do Leonardo, resolvida em 28/08.', ref: 'Comissões jul/2026' },
    '52a601fd': { oque: 'Tráfego pago no Meta — campanha patrocinada.', ref: 'Mídia paga ago/2026' },
    '2db44245': { oque: 'Plano de hospedagem da Vercel (infraestrutura do sistema), reembolsado ao João Eduardo. Era o único lançamento de agosto ainda sem classificação.' },
    '38f151df': { oque: 'Comissão do 3º Leilão Matrizes Katispera, paga por José Odemir Spaggiari (TED).', ref: 'Katispera' },
    '48036bcc': { oque: 'Transferência entre contas da própria Bula (Sicredi → Sicoob). NÃO é receita.', ref: 'Transferência interna' },
    '9e116365': { oque: 'Comissão do Leilão RS Agropecuária (23/06), paga por Roberto Bavaresco.', ref: 'RS Agropecuária 23/06' },
    '29aa3cd1': { oque: 'Devolução do imposto da NF pela Bula Remates — 32º Leilão 4R.', ref: '32º Leilão 4R' },
    '518ee42f': { oque: '1ª parcela do 10º Leilão Nelore JMP, paga pela JBJ Agropecuária. RECEBIMENTO AGREGADO: cobre 2 títulos (Fêmeas 58.484,00 + Touros 107.183,50).', ref: '10º Nelore JMP' },
    'adb53b72': { oque: 'Estorno do Uber cobrado no mesmo dia.' },
    '1f754869': { oque: 'Liquidação do boleto do Leilão Virtual Touros Matinha — Thiago (2ª de 2). A 1ª parcela foi liquidada em 29/07 e só apareceu no ERP na conciliação de julho de 02/09.', ref: 'Matinha Thiago' },
    'd2d069ee': { oque: 'Acerto da Bula Remates: Kirz 10.164,00 integral + Neloraço 9.646,50 parcial. RESTAM 15.508,50 do Neloraço a cobrar.', ref: 'Kirz + Neloraço' },
    'bc5d41b4': { oque: '2ª de 3 parcelas de Eduardo Pinheiro Campos — NF 615, Terra Brava junho/2026 (7.215,00). A 1ª entrou em 27/07 e só apareceu na conciliação de julho de 02/09; falta 2.405,00.', ref: 'Terra Brava jun/2026' },
    'b05f1763': { oque: '1ª parcela do 20º Leilão Guadalupe Agropecuária (Pedro Gustavo de Britto Novis). Cobre 2 títulos: Fêmeas 3.000,00 + Touros 7.712,95.', ref: '20º Guadalupe' },
    '06bfb1e2': { oque: '1ª de 2 parcelas da NF 636 (18.282,45) — 23º Mega Leilão Genética Aditiva, as duas etapas juntas. Falta a 2ª parcela de 9.141,22.', ref: '23º Genética Aditiva' },
    '3b842d2a': { oque: '2º Leilão Pintado Raiz — Maciel Pereira da Silva, vendedor único (acordo de 1% sobre 458.800). Pagou 8,00 a menos, registrado como desconto.', ref: '2º Pintado Raiz' },
    '0989368c': { oque: 'Tarifa do Sicoob pela liquidação do boleto do Kito (entrada de 15.030,00 no mesmo dia).' },
    'd8c59e0a': { oque: 'Transferência entre contas da própria Bula (PIX de mesma titularidade). NÃO é receita. A perna do Sicredi ainda não foi lançada — falta o extrato Sicredi de setembro.', ref: 'Transferência interna' },
    'b1c0ffad': { oque: '3ª e ÚLTIMA parcela do Kito (boleto vencido em 30/08). Fecha os 45.090,00 que a Assessoria recebe em dinheiro do acordo 4R — era o único saldo do 4R ainda em aberto.', ref: 'Kito — acordo 4R' },
  },
  agregados: [
    { mov: '9610cd2d', titulo: '10/08 · R$ 29.535,00 · Gustavo Rusa (parceiro, 5%) — NF 34', tipo: 'CP',
      ids: ['55d13b0c', '08ed6849', '31d8c925', '61d9c747', '86bf7ce4'] },
    { mov: '518ee42f', titulo: '10/08 · R$ 165.667,50 · JBJ Agropecuária — 1ª parcela do 10º Leilão Nelore JMP (ENTRADA)', tipo: 'CR',
      ids: ['939917d7', '759da19c'] },
    { mov: 'd2d069ee', titulo: '20/08 · R$ 19.810,50 · Bula Remates — acerto Kirz + Neloraço (ENTRADA)', tipo: 'CR',
      ids: ['f7487417', '84700163'] },
    { mov: '9eafca9b', titulo: '21/08 · R$ 6.178,45 · ADN Viagens — passagens da Expogenética', tipo: 'CP',
      ids: ['3605b2ed', 'ef6374fa'] },
    { mov: 'e8c961d7', titulo: '24/08 · R$ 11.908,00 · Douglas Bispo — comissão de julho/2026', tipo: 'CP',
      ids: ['580b96ea', '5ac2a39a', '9790ad4f', '92102ee2', 'ea3bf22b', 'a81f89d5', 'b7038849', '93568dcb', '91be5eb7', 'abe0f307', '07023e5f'] },
    { mov: 'b05f1763', titulo: '25/08 · R$ 10.712,95 · Guadalupe Agropecuária — 1ª parcela (ENTRADA)', tipo: 'CR',
      ids: ['e09f0fde', '6d4939ab'] },
    { mov: '54d664fc', titulo: '25/08 · R$ 5.262,00 · Leonardo Serafim — comissão de julho/2026  ◄ conciliado nesta rodada', tipo: 'CP',
      ids: ['82220972', '24f3439d', '6c7d5c50', 'f88a3a1d', 'b4d28beb'] },
    { mov: '2165b58c', titulo: '25/08 · R$ 8.826,00 · Fábio Omena — comissão de julho/2026  ◄ conciliado nesta rodada', tipo: 'CP',
      ids: ['0609dbaa', '046b485c', '4729b9c4', '0ebcc33d', '975b6f10', '61accf8d', 'f85f7a4c'],
      extra: { rotulo: 'ADIANTAMENTO sobre COMISSAO NELORE SANTA CRUZ - 19/07/2026 - FABIO OMENA (2%)', valor: 120,
               nota: 'Título de 2.952,00 criado em 28/08 (lotes 45, 46 e 47 estavam "A definir" e nunca haviam virado título). Segue PARCIAL: restam 2.832,00.' } },
  ],
  leitura: {
    'Impostos e Taxas': 'DAS de julho (55.846,64) + ISSQN (24.524,81). É o maior bloco do mês.',
    'Comissões': 'Ciclo de junho E de julho pagos no mesmo mês: Rusa, Fábio, Douglas, Leonardo e as duas faturas de cartão do Bulinha.',
    'Folha de Pagamento': 'Folha de julho/2026, paga em 03/08.',
    'Despesa Operacional Leilão': 'Reembolsos de campo a assessores e à Bula Remates — custo direto, não estrutura.',
    'Viagem/Passagens': 'Passagens e estadias da Expogenética e dos leilões de campo.',
    'Software/Assinaturas': 'Site ClickWeb, banco de dados, Anthropic e Vercel.',
    'Marketing e Publicidade': 'Tráfego pago no Meta (3.500,00 + 2.000,00) e collab da campanha São Geraldo.',
    'Encargos Sociais': 'DARF dos funcionários e FGTS.',
    'Servicos de Terceiros': 'Contador e deferimento de marcas (Remat).',
    'Tarifas Bancarias': 'Pacote de serviços e tarifas de cobrança do Sicoob.',
    'Aluguel': 'Casa da equipe na Expogenética.',
    'Seguros': 'Duas apólices do Sicoob Seg em débito por convênio.',
    'Outras Despesas': 'Acertos finais com Valdeneusa e Ana Paula.',
    'Alimentacao/Refeicoes': 'Bolos & Cia — contraparte identificada nesta conciliação.',
    'Transporte (Apps)': 'Corridas de Uber (uma delas estornada e relançada).',
    'Integralizacao Capital Cooperativa': 'Parcela mensal de capital no Sicoob — é aplicação, não despesa.',
  },
  resumoTopo: [
    { titulo: 'O QUE O CHEFE PEDIU', itens: [
      ['Pedido (01/09, 11:48)', '', '"Algumas saídas de Agosto não estão conciliadas. Finaliza essa conciliação no detalhe e me envia por favor um excel, fica mais fácil por que vou colorindo aqui e dando o check."'],
      ['Situação antes', '3 saídas', 'Faltavam três: 25/08 Leonardo 5.262,00 e Fábio 8.826,00 (classificadas, sem título vinculado) e 28/08 Vercel 110,00 (sem classificação nenhuma).'],
      ['Situação agora', '0 saídas', 'As 50 saídas e as 12 entradas de agosto estão CONCILIADAS, com título vinculado e contraparte identificada. O ERP inteiro ficou sem nenhum movimento pendente.', true],
    ] },
  ],
  resumoFim: [
    { titulo: 'O QUE MUDOU NESTA RODADA', itens: [
      ['25/08 · Leonardo · 5.262,00', 'conciliado', 'Vinculado aos 5 títulos que quita. Ficou sem vínculo desde 26/08 porque a atribuição dos lotes 26 e 30 da EAO Baviera Fêmeas estava em disputa com o Fábio. A disputa acabou em 28/08: a mensagem formal do grupo de lances ("Foi com <nome> da Bula Assessoria") é o registro primário do arremate, e o parser tinha lido quem POSTOU o lance, não quem VENDEU.'],
      ['25/08 · Fábio Omena · 8.826,00', 'conciliado', 'Vinculado aos 7 títulos (8.706,00) mais 120,00 de adiantamento. NÃO houve pagamento em duplicidade — a conclusão de 27/08 de que 1.920,00 saíram duas vezes foi retificada.'],
      ['28/08 · Vercel · 110,00', 'conciliado', 'Hospedagem do sistema, reembolsada ao João Eduardo. Título criado e baixado.'],
      ['01/09 · Kito · 15.030,00', 'recebido', '3ª e última parcela do acordo 4R. Com ela fecham os 45.090,00 — era o único saldo do 4R ainda em aberto.'],
      ['10/08 · 39,00', 'identificado', 'O CNPJ 21.986.213/0001-04 estava como "contraparte não identificada". É a BOLOS & CIA: virou Alimentação/Refeições.'],
      ['01/07 · DARF · 2.225,46', 'conciliado', 'Único movimento do ERP inteiro ainda preso em "classificado". Já tinha título baixado; só o status nunca tinha sido promovido.'],
    ] },
  ],
  pendencias: [
    ['Extrato Sicredi de setembro',
     'O PIX de 12.000,00 de 01/09 é transferência de mesma titularidade e a perna do Sicredi não foi lançada — inventá-la seria pior que declará-la. Enquanto o extrato não vier, o saldo consolidado do Sicredi está superestimado nesse valor. O saldo do Sicoob está certo e bate ao centavo.',
     12000, 'Baixar o extrato Sicredi de setembro'],
    ['Comissão de julho ainda a pagar — Leonardo',
     'Títulos de julho que o Leonardo não cobrou na planilha dele e seguem abertos: Base Genética Santa Cruz lt116 (510,00) + 23º Genética Aditiva 2ª etapa (1.962,00).',
     2472, 'Decisão do chefe: pagar ou encerrar'],
    ['Comissão de julho ainda a pagar — Fábio',
     'Saldo do título NELORE SANTA CRUZ 19/07 (2.952,00) do qual só 120,00 foram adiantados no PIX de 25/08.',
     2832, 'Decisão do chefe: pagar ou encerrar'],
    ['Comissão de julho — Peralta e Laila',
     'Nunca receberam PIX nenhum de julho. Não é divergência de cálculo, é esquecimento.',
     1755, 'Programar pagamento'],
    ['Comissão de julho — Douglas, lote 19 do Nelore Sorriso',
     'Saldo reconhecido na conferência de 24/08 e que nunca virou título.',
     320, 'Emitir título e pagar'],
    ['2ª parcela da Genética Aditiva',
     'A NF 636 vale 18.282,45 e só metade entrou em 27/08.',
     9141.22, 'Cobrar — vencimento 08-09/09'],
    ['Terra Brava — Eduardo Pinheiro Campos',
     'A NF 615 (7.215,00) é paga em 3 parcelas de 2.405,00. A conciliação de julho (02/09) mostrou que a 1ª entrou em 27/07 e o PIX de 25/08 era a 2ª — falta UMA, não duas.',
     2405, 'Cobrar a 3ª parcela'],
    ['Neloraço PO — saldo da Bula Remates',
     'O acerto de 20/08 cobriu o Kirz integral e o Neloraço só em parte.',
     15508.50, 'Cobrar da Bula Remates'],
    ['Faturas de cartão sem itens de julho',
     'As faturas de agosto (Mastercard 1.380,13 e Visa 5.949,84) estão conciliadas, mas as de JULHO seguem sem os lançamentos item a item — a sessão do internet banking expirou antes da leitura.',
     '—', 'Sicoob › Cartões › Extrato detalhado › Emitir'],
  ],
  abaExtra: {
    nome: 'Setembro (01-09)', de: '2026-09-01', ate: '2026-09-01',
    titulo: 'SETEMBRO — MOVIMENTO DE 01/09/2026',
    subtitulo: 'O extrato de setembro veio junto e já entrou conciliado, para o mês não começar sujo. Saldo em 01/09: R$ 60.682,37 — ERP e extrato batem ao centavo.',
    rodape: 'Saldo em 31/08/2026: R$ 33.654,45   →   + 15.030,00 (Kito)   + 12.000,00 (transferência interna)   − 2,08 (tarifa)   =   R$ 60.682,37 em 01/09/2026.',
  },
}

const MESES: Record<string, Config> = { '2026-07': JULHO, '2026-08': AGOSTO }
const CFG = MESES[MES]
if (!CFG) { console.error('mes invalido: ' + MES + ' (use ' + Object.keys(MESES).join(' ou ') + ')'); process.exit(1) }

/* ============================ dados do ERP =============================== */
const ateLeitura = CFG.abaExtra ? CFG.abaExtra.ate : CFG.ate
const [rCat, rCC, rPes, rMov, rCP, rCR] = await Promise.all([
  sb.from('erp_categorias').select('id,nome,tipo,dre_grupo'),
  sb.from('erp_centros_custo').select('id,nome'),
  sb.from('erp_pessoas').select('id,nome,documento'),
  sb.from('erp_movimentos_bancarios').select('*').eq('conta_bancaria_id', CONTA).gte('data', CFG.de).lte('data', ateLeitura).order('data'),
  sb.from('erp_contas_pagar').select('id,descricao,valor,valor_pago,status,vencimento,data_pagamento,vendedor'),
  sb.from('erp_contas_receber').select('id,descricao,valor,valor_recebido,status,vencimento,data_recebimento'),
])
const cat = new Map((rCat.data || []).map(c => [c.id, c]))
const cc  = new Map((rCC.data  || []).map(c => [c.id, c.nome]))
const pes = new Map((rPes.data || []).map(p => [p.id, p]))
const cp  = new Map((rCP.data  || []).map(t => [t.id, t]))
const cr  = new Map((rCR.data  || []).map(t => [t.id, t]))
const mov = (rMov.data || [])
const acha = <T extends { id: string }>(m: Map<string, T>, pref: string) => [...m.values()].find(v => v.id.startsWith(pref))!

const GRUPO_LABEL: Record<string, string> = {
  custo_direto: 'Custo direto', despesa_fixa: 'Despesa fixa', despesa_variavel: 'Despesa variável',
  imposto: 'Imposto', financeiro: 'Financeiro', receita: 'Receita', distribuicao: 'Distribuição',
  ignorar: 'Não entra no resultado',
}

/* ============================ helpers ==================================== */
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria Pecuária · ERP'
wb.created = new Date()

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const cent = (n: number) => Math.round(n * 100) / 100
const soma = (xs: any[], f: (x: any) => number) => cent(xs.reduce((a, x) => a + f(x), 0))
const dt = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const docDe = (m: any) => pes.get(m.pessoa_id)?.documento || ''
const nomeDe = (m: any) => {
  const p = pes.get(m.pessoa_id)
  if (p?.nome) return p.nome
  if (/34\.?791\.?630/.test(String(m.descricao || ''))) return 'BULA ASSESSORIA (conta própria)'
  const cnpj = String(m.descricao || '').match(/(\d{2}\.?\d{3}\.?\d{3}[ /]?\d{4}-?\d{2})/)
  if (cnpj) return cnpj[1]
  const cpf = String(m.descricao || '').match(/\*{3}\.\d{3}\.\d{3}-?\*{2}/)
  return cpf ? cpf[0] : '—'
}
const tituloDe = (m: any) => {
  const t = m.conta_pagar_id ? cp.get(m.conta_pagar_id) : (m.conta_receber_id ? cr.get(m.conta_receber_id) : null)
  return t ? String(t.id).slice(0, 8) + ' · ' + String(t.descricao).replace(/^COMISSAO /, '').slice(0, 70) : '—'
}
const borda = { top: { style: 'hair' as const, color: { argb: LINHA } }, bottom: { style: 'hair' as const, color: { argb: LINHA } } }

function tituloDaAba(ws: ExcelJS.Worksheet, titulo: string, subtitulo: string, ncols: number) {
  ws.mergeCells(1, 1, 1, ncols)
  const t = ws.getCell(1, 1)
  t.value = titulo
  t.font = { name: 'Calibri', size: 15, bold: true, color: { argb: BRANCO } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 30
  ws.mergeCells(2, 1, 2, ncols)
  const s = ws.getCell(2, 1)
  s.value = subtitulo
  s.font = { name: 'Calibri', size: 9.5, color: { argb: BRANCO }, italic: true }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAFITE } }
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true }
  ws.getRow(2).height = 26
}

function cabecalho(ws: ExcelJS.Worksheet, linha: number, cols: string[]) {
  const r = ws.getRow(linha)
  cols.forEach((c, i) => {
    const cell = r.getCell(i + 1)
    cell.value = c
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: BRANCO } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAFITE } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: DOURADO } } }
  })
  r.height = 30
}

/** Pinta a coluna do check: OK verde, REVER vermelho, DÚVIDA âmbar. */
function realceDoCheck(ws: ExcelJS.Worksheet, col: string, de: number, ate: number) {
  if (ate < de) return
  const regra = (texto: string, fundo: string, cor: string) => ({
    type: 'containsText' as const, operator: 'containsText' as const, text: texto, priority: 1,
    style: { fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: fundo } },
             font: { bold: true, color: { argb: cor } } },
  })
  ws.addConditionalFormatting({ ref: `${col}${de}:${col}${ate}`, rules: [
    regra('OK', VERDE_F, VERDE), regra('REVER', VERM_F, VERM), regra('DÚVIDA', AMAR_F, 'FF8A6D1B'),
  ] })
}

function celulaDoChefe(r: ExcelJS.Row, cols: number[]) {
  for (const col of cols) {
    r.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMAR_F } }
    r.getCell(col).border = { ...borda, left: { style: 'thin', color: { argb: DOURADO } } }
  }
  r.getCell(cols[0]).alignment = { horizontal: 'center', vertical: 'middle' }
  r.getCell(cols[0]).dataValidation = { type: 'list', allowBlank: true, formulae: ['"OK,REVER,DÚVIDA"'] }
}

function faixaTotal(ws: ExcelJS.Worksheet, linha: number, ncols: number) {
  const r = ws.getRow(linha)
  for (let c = 1; c <= ncols; c++) {
    r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
    r.getCell(c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRANCO } }
    r.getCell(c).border = { top: { style: 'medium', color: { argb: DOURADO } } }
  }
  r.height = 24
  return r
}

/* ================================ ABA · RESUMO =========================== */
{
  const saidas = mov.filter(m => m.tipo === 'saida' && m.data <= CFG.ate)
  const entradas = mov.filter(m => m.tipo === 'entrada' && m.data <= CFG.ate)
  const somaS = soma(saidas, m => Number(m.valor))
  const somaE = soma(entradas, m => Number(m.valor))
  const ehTransf = (m: any) => cat.get(m.categoria_id)?.dre_grupo === 'ignorar'
  const somaEop = soma(entradas.filter(m => !ehTransf(m)), m => Number(m.valor))
  const somaSop = soma(saidas.filter(m => !ehTransf(m)), m => Number(m.valor))
  const extra = CFG.abaExtra ? mov.filter(m => m.data >= CFG.abaExtra!.de && m.data <= CFG.abaExtra!.ate) : []
  const netExtra = soma(extra, m => (m.tipo === 'entrada' ? 1 : -1) * Number(m.valor))

  const ws = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 3 }, { width: 42 }, { width: 20 }, { width: 20 }, { width: 74 }]
  tituloDaAba(ws, 'CONCILIAÇÃO BANCÁRIA · ' + CFG.rotulo, CFG.fonte, 5)

  let L = 4
  const bloco = (t: string) => {
    ws.mergeCells(L, 2, L, 5)
    const c = ws.getCell(L, 2)
    c.value = t
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: PRETO } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEDE6' } }
    c.alignment = { vertical: 'middle', indent: 1 }
    c.border = { left: { style: 'thick', color: { argb: DOURADO } } }
    ws.getRow(L).height = 22
    L += 1
  }
  const item = (rot: string, val: any, obs = '', destaque = false) => {
    ws.getCell(L, 2).value = rot
    ws.getCell(L, 2).font = { name: 'Calibri', size: 10, bold: destaque }
    ws.getCell(L, 2).alignment = { indent: 1, wrapText: true, vertical: 'middle' }
    const v = ws.getCell(L, 3)
    v.value = val
    if (typeof val === 'number') v.numFmt = MOEDA
    v.alignment = { horizontal: 'right', vertical: 'middle' }
    v.font = { name: 'Calibri', size: 10, bold: destaque, color: { argb: destaque ? PRETO : GRAFITE } }
    ws.mergeCells(L, 4, L, 5)
    ws.getCell(L, 4).value = obs
    ws.getCell(L, 4).font = { name: 'Calibri', size: 9, color: { argb: CINZA_T } }
    ws.getCell(L, 4).alignment = { wrapText: true, vertical: 'middle', indent: 1 }
    for (let c = 2; c <= 5; c++) ws.getCell(L, c).border = borda
    ws.getRow(L).height = Math.max(18, Math.ceil(obs.length / 76) * 13)
    L += 1
  }
  const blocos = (bs: Bloco[]) => { for (const b of bs) { bloco(b.titulo); for (const i of b.itens) item(i[0], i[1], i[2] || '', i[3] || false); L += 1 } }

  blocos(CFG.resumoTopo)

  bloco('SALDO — O ERP BATE COM O BANCO')
  item('Saldo em ' + CFG.saldoIni.data, CFG.saldoIni.valor, 'Saldo anterior impresso no extrato.')
  item('(+) Entradas do mês', somaE, entradas.length + ' lançamentos.')
  item('(−) Saídas do mês', -somaS, saidas.length + ' lançamentos.')
  item('Saldo em ' + CFG.saldoFim.data, CFG.saldoFim.valor, 'Extrato e ERP batem ao centavo.', true)
  if (CFG.abaExtra) {
    item('Movimento de ' + CFG.abaExtra.de.split('-').reverse().join('/'), netExtra, extra.length + ' lançamentos, na aba própria.')
    item('Saldo em ' + CFG.abaExtra.ate.split('-').reverse().join('/'), cent(CFG.saldoFim.valor + netExtra), 'Extrato e ERP batem ao centavo.', true)
  }
  L += 1

  bloco('RESULTADO DE CAIXA DO MÊS (sem transferências e pass-through)')
  item('Entradas operacionais', somaEop, 'O que de fato é receita da Bula.')
  item('Saídas operacionais', -somaSop, 'Folha, comissões, impostos, custo de leilão e estrutura.')
  item('Resultado do mês', cent(somaEop - somaSop), cent(somaEop - somaSop) >= 0 ? 'Caixa positivo no mês.' : 'O mês consumiu caixa.', true)
  L += 1

  blocos(CFG.resumoFim)

  bloco('COMO USAR ESTA PLANILHA')
  item('Aba "Saídas ' + CFG.rotulo.split('/')[0].replace(/^(.)(.*)$/, (_, a, b) => a + b.toLowerCase()) + '"', saidas.length + ' linhas',
    'É a aba do check. Cada linha tem O QUE FOI, a contraparte com CNPJ/CPF, a natureza, o título do ERP e o histórico original do banco. As duas últimas colunas (CONFERIDO e ANOTAÇÃO) estão vazias e são suas — a coluna CONFERIDO tem lista: OK, REVER, DÚVIDA, e pinta sozinha.')
  item('Aba "Pagamentos Agregados"', CFG.agregados.length + ' lotes',
    'Um pagamento ou recebimento só que cobre vários títulos aparece aqui aberto título a título. É o "no detalhe" das comissões.')
  item('Aba "Pendências"', CFG.pendencias.length + ' itens',
    'O que a conciliação deixou visível e ainda depende de decisão ou de cobrança.')
}

/* ==================== ABAS · SAIDAS / ENTRADAS / EXTRA =================== */
const COLS_MOV = ['#', 'DATA', 'VALOR (R$)', 'O QUE FOI', 'CONTRAPARTE', 'CNPJ / CPF', 'NATUREZA', 'GRUPO', 'CENTRO DE CUSTO', 'REFERÊNCIA', 'TÍTULO NO ERP', 'HISTÓRICO DO EXTRATO', 'STATUS', 'CONFERIDO', 'ANOTAÇÃO']
const LARG_MOV = [4, 11, 14, 62, 30, 20, 24, 17, 20, 22, 46, 58, 12, 13, 30]

function abaMovimentos(nome: string, linhas: any[], titulo: string, subtitulo: string, tipoCor: 'saida' | 'entrada' | 'misto') {
  const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', xSplit: 4, ySplit: 4, showGridLines: false }] })
  ws.columns = LARG_MOV.map(w => ({ width: w }))
  tituloDaAba(ws, titulo, subtitulo, COLS_MOV.length)
  cabecalho(ws, 4, COLS_MOV)

  let n = 0
  for (const m of linhas) {
    n += 1
    const c = cat.get(m.categoria_id)
    const ex = CFG.explica[String(m.id).slice(0, 8)]
    const saida = m.tipo === 'saida'
    const r = ws.getRow(4 + n)
    r.values = [
      n, dt(m.data), Number(m.valor),
      (tipoCor === 'misto' ? (saida ? '(saída) ' : '(entrada) ') : '') + (ex?.oque || String(m.descricao)),
      nomeDe(m), docDe(m),
      c?.nome || '—', GRUPO_LABEL[String(c?.dre_grupo)] || String(c?.dre_grupo || '—'),
      cc.get(m.centro_custo_id) || '—',
      ex?.ref || '—',
      tituloDe(m),
      String(m.descricao),
      m.status_conciliacao === 'conciliado' ? 'Conciliado' : String(m.status_conciliacao),
      '', '',
    ]
    r.height = 30
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Calibri', size: 9.5 }
      cell.alignment = { vertical: 'top', wrapText: col === 4 || col === 11 || col === 12, indent: col === 4 ? 1 : 0 }
      cell.border = borda
      if (n % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    })
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'top' }
    r.getCell(2).numFmt = DATA
    r.getCell(2).alignment = { horizontal: 'center', vertical: 'top' }
    r.getCell(3).numFmt = MOEDA
    r.getCell(3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: saida ? VERM : VERDE } }
    r.getCell(3).alignment = { horizontal: 'right', vertical: 'top' }
    r.getCell(11).font = { name: 'Consolas', size: 8, color: { argb: GRAFITE } }
    r.getCell(12).font = { name: 'Consolas', size: 8, color: { argb: CINZA_T } }
    const st = r.getCell(13)
    st.alignment = { horizontal: 'center', vertical: 'top' }
    st.font = { name: 'Calibri', size: 9, bold: true, color: { argb: VERDE } }
    st.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_F } }
    celulaDoChefe(r, [14, 15])
  }

  const tl = faixaTotal(ws, 5 + n, COLS_MOV.length)
  tl.getCell(2).value = 'TOTAL'
  tl.getCell(2).alignment = { horizontal: 'right' }
  tl.getCell(3).value = soma(linhas, m => Number(m.valor))
  tl.getCell(3).numFmt = MOEDA
  tl.getCell(3).alignment = { horizontal: 'right' }
  tl.getCell(4).value = n + ' lançamentos · todos conciliados'
  tl.getCell(4).alignment = { indent: 1 }

  realceDoCheck(ws, 'N', 5, 4 + n)
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + n, column: COLS_MOV.length } }
  return n
}

const mesNome = CFG.rotulo.split('/')[0]
const mesTitulo = mesNome.charAt(0) + mesNome.slice(1).toLowerCase()
abaMovimentos('Saídas ' + mesTitulo,
  mov.filter(m => m.tipo === 'saida' && m.data <= CFG.ate).sort((a, b) => a.data.localeCompare(b.data) || Number(b.valor) - Number(a.valor)),
  'SAÍDAS DE ' + CFG.rotulo + ' — CONCILIAÇÃO NO DETALHE',
  'Uma linha por débito do extrato. As colunas CONFERIDO (lista: OK / REVER / DÚVIDA) e ANOTAÇÃO, em amarelo, são suas. '
  + 'Pagamento que quita mais de um título está aberto na aba "Pagamentos Agregados".', 'saida')

abaMovimentos('Entradas ' + mesTitulo,
  mov.filter(m => m.tipo === 'entrada' && m.data <= CFG.ate).sort((a, b) => a.data.localeCompare(b.data) || Number(b.valor) - Number(a.valor)),
  'ENTRADAS DE ' + CFG.rotulo,
  'Créditos do extrato. O que estiver marcado como "Não entra no resultado" é dinheiro que apenas passou pela conta — transferência entre contas da própria Bula ou pass-through de leilão.', 'entrada')

/* ========================= ABA · POR NATUREZA ============================ */
{
  const saidas = mov.filter(m => m.tipo === 'saida' && m.data <= CFG.ate)
  const total = soma(saidas, m => Number(m.valor))
  const porCat = new Map<string, { grupo: string; valor: number; n: number }>()
  for (const m of saidas) {
    const c = cat.get(m.categoria_id)
    const k = c?.nome || '—'
    const cur = porCat.get(k) || { grupo: GRUPO_LABEL[String(c?.dre_grupo)] || '—', valor: 0, n: 0 }
    cur.valor = cent(cur.valor + Number(m.valor)); cur.n += 1
    porCat.set(k, cur)
  }
  const ordem = [...porCat.entries()].sort((a, b) => b[1].valor - a[1].valor)

  const ws = wb.addWorksheet('Por Natureza', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
  ws.columns = [{ width: 4 }, { width: 34 }, { width: 22 }, { width: 16 }, { width: 10 }, { width: 9 }, { width: 52 }]
  tituloDaAba(ws, 'SAÍDAS DE ' + CFG.rotulo + ' POR NATUREZA',
    'Para onde foram os R$ ' + brl(total) + ' que saíram do Sicoob em ' + CFG.rotulo.toLowerCase() + '.', 7)
  cabecalho(ws, 4, ['#', 'NATUREZA', 'GRUPO', 'VALOR (R$)', '% DO MÊS', 'LANÇ.', 'LEITURA'])

  let n = 0
  for (const [nome, d] of ordem) {
    n += 1
    const r = ws.getRow(4 + n)
    r.values = [n, nome, d.grupo, d.valor, d.valor / total, d.n, CFG.leitura[nome] || '']
    r.height = 24
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Calibri', size: 9.5 }
      cell.border = borda
      cell.alignment = { vertical: 'middle', wrapText: col === 7, indent: col === 2 || col === 7 ? 1 : 0 }
      if (n % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    })
    r.getCell(1).alignment = { horizontal: 'center' }
    r.getCell(2).font = { name: 'Calibri', size: 10, bold: true }
    r.getCell(4).numFmt = MOEDA
    r.getCell(4).font = { name: 'Calibri', size: 10, bold: true }
    r.getCell(5).numFmt = '0.0%'
    r.getCell(5).alignment = { horizontal: 'center' }
    r.getCell(6).alignment = { horizontal: 'center' }
    r.getCell(7).font = { name: 'Calibri', size: 9, color: { argb: CINZA_T } }
  }
  const tl = faixaTotal(ws, 5 + n, 7)
  tl.values = [null, 'TOTAL DAS SAÍDAS', '', total, 1, saidas.length, '']
  tl.getCell(4).numFmt = MOEDA
  tl.getCell(5).numFmt = '0.0%'
  tl.getCell(5).alignment = { horizontal: 'center' }
  tl.getCell(6).alignment = { horizontal: 'center' }
}

/* ==================== ABA · PAGAMENTOS AGREGADOS ========================= */
{
  const ws = wb.addWorksheet('Pagamentos Agregados', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
  ws.columns = [{ width: 4 }, { width: 13 }, { width: 16 }, { width: 76 }, { width: 15 }, { width: 13 }, { width: 40 }]
  tituloDaAba(ws, 'PAGAMENTOS E RECEBIMENTOS AGREGADOS — ABERTURA TÍTULO A TÍTULO',
    'Um lançamento só que cobre vários títulos. O ERP guarda um vínculo por movimento, então o movimento aponta para o MAIOR título do lote e a composição inteira vive aqui. É o "no detalhe" das comissões.', 7)
  cabecalho(ws, 4, ['#', 'TÍTULO (ID)', 'VALOR (R$)', 'DESCRIÇÃO DO TÍTULO', 'VENCIMENTO', 'CONFERIDO', 'ANOTAÇÃO'])

  let L = 4
  for (const g of CFG.agregados) {
    L += 1
    ws.mergeCells(L, 1, L, 7)
    const h = ws.getCell(L, 1)
    h.value = g.titulo
    h.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: PRETO } }
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEDE6' } }
    h.alignment = { vertical: 'middle', indent: 1 }
    h.border = { left: { style: 'thick', color: { argb: DOURADO } }, top: { style: 'thin', color: { argb: GRAFITE } } }
    ws.getRow(L).height = 22

    let lote = 0, i = 0
    for (const id of g.ids) {
      const t: any = g.tipo === 'CP' ? acha(cp as any, id) : acha(cr as any, id)
      const v = Number(g.tipo === 'CP' ? t.valor_pago : t.valor_recebido)
      lote = cent(lote + v); i += 1; L += 1
      const r = ws.getRow(L)
      r.values = [i, String(t.id).slice(0, 8), v, String(t.descricao).replace(/^COMISSAO /, ''), dt(String(t.vencimento)), '', '']
      r.height = 18
      r.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = { name: 'Calibri', size: 9.5 }
        cell.border = borda
        cell.alignment = { vertical: 'middle', indent: col === 4 ? 1 : 0 }
        if (i % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
      })
      r.getCell(1).alignment = { horizontal: 'center' }
      r.getCell(2).font = { name: 'Consolas', size: 8.5, color: { argb: CINZA_T } }
      r.getCell(3).numFmt = MOEDA
      r.getCell(3).font = { name: 'Calibri', size: 10, bold: true }
      r.getCell(5).numFmt = DATA
      r.getCell(5).alignment = { horizontal: 'center' }
      celulaDoChefe(r, [6, 7])
    }
    if (g.extra) {
      lote = cent(lote + g.extra.valor); i += 1; L += 1
      const r = ws.getRow(L)
      r.values = [i, '(parcial)', g.extra.valor, g.extra.rotulo + '  —  ' + g.extra.nota, '', '', '']
      r.height = 30
      r.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = { name: 'Calibri', size: 9.5, italic: col === 4 }
        cell.border = borda
        cell.alignment = { vertical: 'middle', wrapText: col === 4, indent: col === 4 ? 1 : 0 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_F } }
      })
      r.getCell(1).alignment = { horizontal: 'center' }
      r.getCell(3).numFmt = MOEDA
      r.getCell(3).font = { name: 'Calibri', size: 10, bold: true }
    }
    L += 1
    const s = ws.getRow(L)
    s.getCell(2).value = 'SOMA'
    s.getCell(3).value = lote
    s.getCell(4).value = i + ' título(s) — fecha o valor do extrato ao centavo'
    for (let c = 1; c <= 7; c++) {
      s.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAFITE } }
      s.getCell(c).font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRANCO } }
    }
    s.getCell(3).numFmt = MOEDA
    s.getCell(2).alignment = { horizontal: 'right' }
    s.getCell(4).alignment = { indent: 1 }
    s.height = 20
    L += 1
  }
  realceDoCheck(ws, 'F', 5, L)
}

/* ========================= ABA EXTRA (opcional) ========================== */
if (CFG.abaExtra) {
  const e = CFG.abaExtra
  const linhas = mov.filter(m => m.data >= e.de && m.data <= e.ate).sort((a, b) => Number(b.valor) - Number(a.valor))
  const n = abaMovimentos(e.nome, linhas, e.titulo, e.subtitulo, 'misto')
  const ws = wb.getWorksheet(e.nome)!
  const L = 7 + n
  ws.mergeCells(L, 2, L, 9)
  const c = ws.getCell(L, 2)
  c.value = e.rodape
  c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: PRETO } }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEDE6' } }
  c.alignment = { vertical: 'middle', indent: 1 }
  c.border = { left: { style: 'thick', color: { argb: DOURADO } } }
  ws.getRow(L).height = 24
}

/* ============================ ABA · PENDENCIAS =========================== */
{
  const ws = wb.addWorksheet('Pendências', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
  ws.columns = [{ width: 4 }, { width: 40 }, { width: 86 }, { width: 16 }, { width: 34 }, { width: 13 }, { width: 30 }]
  tituloDaAba(ws, 'PENDÊNCIAS QUE A CONCILIAÇÃO DEIXOU VISÍVEIS',
    'Nenhuma delas impede o fechamento do mês — o saldo bate ao centavo. São decisões e cobranças que precisam de você.', 7)
  cabecalho(ws, 4, ['#', 'PENDÊNCIA', 'O QUE É', 'VALOR (R$)', 'PRÓXIMO PASSO', 'CONFERIDO', 'ANOTAÇÃO'])
  let n = 0
  for (const [tit, desc, val, passo] of CFG.pendencias) {
    n += 1
    const r = ws.getRow(4 + n)
    r.values = [n, tit, desc, val, passo, '', '']
    r.height = Math.max(44, Math.ceil(String(desc).length / 92) * 13)
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Calibri', size: 9.5 }
      cell.border = borda
      cell.alignment = { vertical: 'top', wrapText: col === 2 || col === 3 || col === 5, indent: 1 }
      if (n % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    })
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'top' }
    r.getCell(2).font = { name: 'Calibri', size: 10, bold: true }
    if (typeof val === 'number') { r.getCell(4).numFmt = MOEDA; r.getCell(4).font = { name: 'Calibri', size: 10, bold: true } }
    r.getCell(4).alignment = { horizontal: 'right', vertical: 'top' }
    celulaDoChefe(r, [6, 7])
  }
  realceDoCheck(ws, 'F', 5, 4 + n)
}

/* ================================ grava ================================== */
fs.mkdirSync(CFG.arquivo.slice(0, CFG.arquivo.lastIndexOf('/')), { recursive: true })
await wb.xlsx.writeFile(CFG.arquivo)
const sem = mov.filter(m => !CFG.explica[String(m.id).slice(0, 8)])
console.log('Mes ..................... ' + CFG.rotulo)
console.log('Movimentos lidos ........ ' + mov.length)
console.log('Sem traducao manual ..... ' + sem.length + (sem.length ? '  <- ' + sem.map(m => String(m.id).slice(0, 8) + ' ' + m.data + ' ' + brl(m.valor)).join(' | ') : ''))
console.log('Arquivo ................. ' + CFG.arquivo)
