/**
 * Reembolsos de agosto/2026 — apuração a partir das DMs do WhatsApp
 * (sessão Baileys `joao-automation`, capturadas em operational_items +
 * bucket whatsapp-media) e conferência contra o ERP.
 *
 * Fonte de cada item: relatório enviado pelo próprio assessor + comprovante lido.
 */

export const META = {
  hoje: '03/09/2026',
  fonte: 'DMs do WhatsApp (Baileys joao-automation) — operational_items + bucket whatsapp-media; conferência no ERP (erp_contas_pagar) e nos fechamentos de agosto.',
}

/* ── quem recebe ─────────────────────────────────────────────────────── */
export const ASSESSORES = [
  {
    id: 'douglas', nome: 'Douglas Bispo Carvalho',
    empresa: 'BISPO AGRONEGÓCIOS LTDA · CNPJ 50.938.748/0001-08',
    pix: 'PIX CNPJ 50.938.748/0001-08 (Bradesco Ag. 1947 C/C 73924-3) — dados enviados por ele em 24/08; a planilha dele traz "(99) 98490-1010"',
    pixAlerta: true,
    enviouEm: '28/08 22:50 (planilha) e 12/08 20:04 (comprovantes)',
    bruto: 1704.14, abatimento: 397.54, liquido: 1306.60,
    nf: 'NFS-e 41 emitida em 01/09 (Novo Repartimento/PA) — é do mensal, não do reembolso.',
  },
  {
    id: 'fabio', nome: 'Fábio de Omena Gaia',
    empresa: 'FO ASSESSORIA PECUÁRIA · CNPJ 59.791.094/0001-07',
    pix: 'PIX CNPJ 59.791.094/0001-07 — mesmo destino do reembolso de julho (07/08) e da comissão de junho (10/08)',
    pixAlerta: false,
    enviouEm: '02/09 08:12–08:15',
    bruto: 6690.42, abatimento: 0, liquido: 6690.42,
    nf: 'O arquivo "NF FABIO.pdf" é a nota do HOTEL (tomador Bula) — ele ainda não emitiu a NF do mensal de agosto.',
  },
  {
    id: 'leonardo', nome: 'Leonardo Serafim Francisco',
    empresa: 'LEONARDO SERAFIM FRANCISCO LTDA · CNPJ 64.739.713/0001-54',
    pix: 'PIX CNPJ 64.739.713/0001-54 — confirmado por ele em 01/09 ("Isso, CNPJ")',
    pixAlerta: false,
    enviouEm: '03/09 10:14–10:15 (hoje)',
    bruto: 2877.22, abatimento: 0, liquido: 2877.22,
    nf: 'NFS-e 18 emitida em 01/09 (Sinop/MT) — mensal.',
  },
]

/* ── itens: uma linha por despesa declarada ───────────────────────────── */
const D = (data, evento, desc, valor, comp, obs) => ({ data, evento, desc, valor, comp, obs })

export const ITENS = {
  douglas: [
    // relatório 1 — enviado 12/08, referente ao 14º Pérolas do Tapajós
    D('05/08', 'perolas', 'Jantar com Bruno (Nelore Cascata)', 232.00, 'fraco', 'recibo manuscrito, sem CNPJ/NF'),
    D('05/08', 'perolas', 'Balsa Anapu → Vitória (PA)', 17.00, 'ok', 'BP-e Rodonave 001086906'),
    D('05/08', 'perolas', 'Combustível — Uruará/PA', 350.00, 'ok', 'NFC-e 113729, Sicredi Visa'),
    D('06/08', 'perolas', 'Almoço — Santarém', 45.00, 'ok', 'Churrascaria do Gaúcho Tapajós, NFC-e 3293'),
    D('06/08', 'perolas', 'Jantar — Santarém', 65.90, 'ok', 'XBOM Santarém, NFC-e 36048'),
    D('07/08', 'perolas', 'Almoço — Santarém', 76.90, 'ok', 'Restaurante Tombadilho, NFC-e 582'),
    D('08/08', 'perolas', 'Jantar — Santarém', 65.90, 'ok', 'XBOM Santarém, pedido 64'),
    D('09/08', 'perolas', 'Água (hotel)', 24.00, 'ok', 'Tapajós Center Hotel, recibo 78138 — apto 207, 05→09/08'),
    D('09/08', 'perolas', 'Combustível — Santarém', 183.05, 'ok', 'Posto Pérola, NFC-e 106034'),
    D('09/08', 'perolas', 'Balsa Vitória → Anapu (PA)', 17.00, 'ok', 'BP-e Rodonave 001073607'),
    D('09/08', 'perolas', 'Combustível — Posto Petrobrás', 309.00, 'ok', 'print do cartão Bradesco Prime Visa, 09/08 19:20'),
    // relatório 2 — enviado 28/08
    D('19/08', 'expo', 'Almoço — Uberlândia/MG', 75.00, 'ok', 'NFC-e 6640, 19/08 13:30'),
    D('20/08', 'expo', 'Almoço — Restaurante Tabu, Uberaba', 80.00, 'ok', 'NFC-e 17093, 20/08 13:14'),
    D('24/08', 'expo', 'Almoço — ZEP Café, aeroporto de Uberlândia', 28.00, 'ok', 'NFC-e 36472, 24/08 18:42'),
    D('25/08', 'expo', 'Almoço — Bambu Gourmet, Marabá/PA (retorno)', 75.00, 'ok', 'NFC-e 336, 25/08 13:59'),
    D('25/08', 'expo', 'Combustível — Lustosa, BR-230 Marabá (retorno)', 426.10, 'ok', 'NFC-e 721384, diesel S10'),
    D('25/08', 'misto', 'Hospedagem Marabá — retorno Expogenética + visita Celso', 492.00, 'ok', 'NFS-e 2651 — hospedagem de 24 a 26/08, TOMADOR: Bula Assessoria'),
    D('28/08', 'celso', 'Hospedagem Marabá — visita do Celso', 268.00, 'ok', 'NFS-e 2681 — hospedagem de 27 a 28/08, TOMADOR: Bula Assessoria'),
    D('28/08', 'celso', 'Combustível — Lustosa (visita do Celso)', 260.04, 'ok', 'NFC-e 722980, gasolina'),
  ],
  fabio: [
    D('05/08', 'ls', 'Alimentação', 20.90, 'nao', 'esta linha ficou FORA da soma da planilha dele'),
    D('05/08', 'ls', 'Alimentação', 147.40, 'nao', ''),
    D('05/08', 'ls', 'Alimentação', 58.00, 'nao', ''),
    D('05/08', 'ls', 'Alimentação', 112.00, 'nao', ''),
    D('07/08', 'ls', 'Alimentação', 47.30, 'nao', ''),
    D('08/08', 'ls', 'Alimentação', 63.80, 'nao', ''),
    D('09/08', 'ls', 'Alimentação', 123.94, 'nao', ''),
    D('09/08', 'ls', 'Alimentação', 142.29, 'nao', ''),
    D('10/08', 'ls', 'Alimentação', 227.92, 'nao', ''),
    D('10/08', 'ls', 'Alimentação', 10.00, 'nao', ''),
    D('10/08', 'ls', 'Alimentação (consumo de hotel)', 69.00, 'fraco', 'NOTA CONSUMOS.pdf — NFC-e emitida em 01/09/2026, não em 10/08 (Anserve / QS Marista, Goiânia)'),
    D('10/08', 'ls', 'Alimentação', 98.00, 'nao', ''),
    D('13/08', 'expo', 'Alimentação', 60.90, 'nao', ''),
    D('13/08', 'expo', 'Alimentação', 99.77, 'nao', ''),
    D('13/08', 'expo', 'Alimentação', 9.90, 'nao', ''),
    D('14/08', 'expo', 'Alimentação', 70.92, 'nao', ''),
    D('15/08', 'expo', 'Alimentação (iFood — casa de Uberaba)', 133.18, 'ok', 'print do iFood, entrega na R. Francisco Pucci 351 (casa da Bula)'),
    D('18/08', 'expo', 'Alimentação', 50.90, 'nao', ''),
    D('20/08', 'expo', 'Alimentação — EQUIPE', 229.80, 'nao', ''),
    D('21/08', 'expo', 'Alimentação — CLIENTE', 306.00, 'nao', ''),
    D('22/08', 'expo', 'Alimentação', 186.88, 'nao', ''),
    D('23/08', 'expo', 'Alimentação — EQUIPE', 160.70, 'nao', ''),
    D('24/08', 'expo', 'Alimentação', 112.77, 'nao', ''),
    D('03/08', 'visita', 'Combustível — visita a cliente', 321.84, 'nao', ''),
    D('30/08', 'asj', 'Combustível — leilão ASJ', 271.38, 'nao', ''),
    D('30/08', 'asj', 'Combustível — leilão ASJ', 284.21, 'nao', ''),
    D('30/08', 'asj', 'Combustível — leilão ASJ', 147.15, 'nao', ''),
    D('05–10/08', 'ls', 'Hotel (Goiânia) — leilão LS', 2148.67, 'divergente', 'NFS-e RPS 25501: R$ 2.184,67 (R$ 36,00 a mais do que ele pediu), tomador Bula Assessoria, check-in 05/08 → check-out 08/08, 2 hóspedes'),
    D('05/08', 'ls', 'Táxi aeroporto', 60.00, 'nao', ''),
    D('08/08', 'ls', 'Táxi aeroporto', 176.85, 'nao', ''),
    D('10/08', 'ls', 'Táxi aeroporto', 65.00, 'nao', ''),
    D('11/08', 'expo', 'Táxi aeroporto', 110.00, 'nao', ''),
    D('13/08', 'expo', 'Táxi SEM NOTA', 25.00, 'nao', 'declarado como sem nota pelo próprio'),
    D('13/08', 'expo', 'Táxi aeroporto', 30.00, 'nao', ''),
    D('13/08', 'expo', 'Táxi aeroporto', 110.00, 'nao', ''),
    D('24/08', 'expo', 'Táxi aeroporto', 110.00, 'nao', ''),
    D('06–24/08', 'multi', 'Uber/99 — Goiânia e Uberaba', 308.95, 'parcial', '20 recibos da 99 somam R$ 295,35 (Goiânia 140,05 + Maceió 12,00 + Uberaba 143,30); faltam R$ 13,60'),
  ],
  leonardo: [
    D('10/08', 'az', 'Café — Matupá/MT', 33.00, 'ok', 'NFC-e 284126, 10/08 07:04'),
    D('10/08', 'az', 'Combustível — Matupá/MT', 163.61, 'ok', 'Auto Bandeirantes, NFC-e 306020'),
    D('12/08', 'az', 'Combustível — Nova Santa Helena/MT', 190.29, 'ok', 'Posto Poema, Cielo 12/08 17:35'),
    D('13/08', 'az', 'Combustível — Sinop/MT', 190.05, 'ok', 'Auto Posto Riviera, NFC-e 201154'),
    D('17/08', 'expo', 'Café — Ribeirão Preto/SP', 20.00, 'ok', 'Anserve, NFC-e 307416'),
    D('17/08', 'expo', 'Almoço com clientes (Elias, Flávio, Alexandre, Vanderlei e Fábio)', 250.00, 'ok', 'Restaurante Tabu, Uberaba — conta de R$ 252,50; ele cobra a parte da Bula'),
    D('18/08', 'expo', 'Almoço — Uberaba', 52.50, 'ok', 'Empório Antares, NFC-e 1783964'),
    D('21/08', 'expo', 'Combustível — Uberaba', 188.49, 'ok', 'Auto Posto Zebu, NFC-e 131754'),
    D('24/08', 'expo', 'Combustível — Ribeirão Preto', 99.30, 'ok', 'Posto Ribeirão, NFC-e 28672'),
    D('17–24/08', 'expo', 'Aluguel de carro (Localiza)', 1607.00, 'ok', 'contrato RPTA124066, HB20, 17/08 00:12 → 24/08 10:18, 655 km'),
    D('17–24/08', 'expo', 'Pedágios + tag (6 passagens)', 82.98, 'ok', 'extrato da Tag Localiza — aluguel + pedágio = R$ 1.689,98, exatamente o total do contrato'),
  ],
}

/* ── a que leilão/evento cada despesa pertence ────────────────────────── */
export const EVENTOS = {
  perolas: { nome: '14º LEILÃO PÉROLAS DO TAPAJÓS', data: '08/08/2026', vgv: 213000, tipo: 'leilão', nota: 'Fechamento no sistema. A comissão do Douglas (R$ 2.460) está em aberto para 25/09.' },
  ls: { nome: '2º LEILÃO LS GALERIA', data: '07/08/2026', vgv: 576000, tipo: 'leilão', nota: 'E-Rural, Goiânia. Os recibos da 99 ligam o hotel QS Marista à Galeria OM Incorporadora.' },
  expo: { nome: 'EXPOGENÉTICA 2026 (16 pregões, Uberaba)', data: '13 a 25/08/2026', vgv: 3970200, tipo: 'multi-leilão', nota: 'Despesa multi-leilão — o rateio é decisão do financeiro. A estimativa do Marcelo para reembolso de equipe era R$ 5.000.' },
  asj: { nome: '1º LEILÃO NELORE ASJ', data: '30/08/2026', vgv: 30900, tipo: 'leilão', nota: 'VGV de R$ 30.900 — os R$ 702,74 de combustível equivalem a 2,3% da venda do pregão.' },
  az: { nome: 'REPRODUTORES NELORE AZ', data: '12/09/2026', vgv: 0, tipo: 'pré-produção', nota: 'NÃO é leilão de agosto: viagem de 10 a 13/08 para apartar os touros. Custo antecipado do pregão de 12/09.' },
  celso: { nome: 'VISITA COMERCIAL — CELSO (Marabá/PA)', data: '27 e 28/08/2026', vgv: 0, tipo: 'prospecção', nota: 'Sem leilão vinculado. O evento mais próximo na região é o LEILÃO KATAYAMA – NOVO REPARTIMENTO (13/09) — confirmar com o Douglas.' },
  visita: { nome: 'VISITA A CLIENTE (Fábio, 03/08)', data: '03/08/2026', vgv: 0, tipo: 'prospecção', nota: 'O relatório dele não diz qual cliente nem qual leilão.' },
  misto: { nome: 'EXPOGENÉTICA + VISITA CELSO (rateio)', data: '24 a 26/08/2026', vgv: 0, tipo: 'rateio', nota: 'Uma nota só cobrindo o retorno da Expogenética e o começo da visita do Celso.' },
  multi: { nome: 'MULTI — Goiânia + Uberaba (rateio)', data: '06 a 24/08/2026', vgv: 0, tipo: 'rateio', nota: 'Linha única de Uber/99 do Fábio: R$ 140,05 do LS Galeria, R$ 155,30 da Expogenética, R$ 13,60 sem recibo.' },
}

/* ── o que precisa de decisão ─────────────────────────────────────────── */
export const PENDENCIAS = [
  { grau: 'alto', quem: 'Douglas', titulo: 'O reembolso do Pérolas do Tapajós (R$ 1.385,75) não se paga: já foi compensado',
    texto: 'Ele comprou as passagens da Expogenética das quatro pessoas e mandou as notas em 12/08. Nos áudios de 12/08 (16:04 e 20:04) e de 24/08 (14:48) ele mesmo fecha a conta: a passagem dele é maior que o reembolso do Pérolas, e sobram R$ 397,54 que ELE devolve à Bula. É esse o abatimento aplicado agora. Pagar o relatório de 12/08 seria pagar duas vezes.' },
  { grau: 'alto', quem: 'Fábio', titulo: 'R$ 4.051,52 das linhas dele vieram sem nenhum comprovante',
    texto: 'Só têm documento o hotel (NFS-e), os 20 recibos da 99, o print do iFood e a nota de consumo. Toda a alimentação de Goiânia e de Uberaba, os três abastecimentos do ASJ, a visita a cliente de 03/08 e os oito táxis-aeroporto vieram apenas como linha de planilha — uma delas escrita "TÁXI SEM NOTA".' },
  { grau: 'medio', quem: 'Fábio', titulo: 'A soma da planilha dele pula a primeira linha: ele pediu R$ 20,90 a menos',
    texto: 'A fórmula do bloco de alimentação é =SUM(C11:C41) e a primeira despesa está na linha 10. O total das linhas é R$ 6.711,32, não R$ 6.690,42. A diferença é a favor da Bula.' },
  { grau: 'medio', quem: 'Fábio', titulo: 'Hotel do leilão LS: a nota é de R$ 2.184,67 e ele pediu R$ 2.148,67',
    texto: 'A NFS-e (RPS 25501, Goiânia) está em nome da BULA ASSESSORIA, cobre check-in 05/08 → check-out 08/08 e registra 2 hóspedes; o relatório diz "05 a 10.08". Faltam R$ 36,00 no pedido dele — e vale saber quem foi o segundo hóspede antes de reembolsar os 100%.' },
  { grau: 'medio', quem: 'Fábio', titulo: 'Uber/99: a linha pede R$ 308,95 e os recibos somam R$ 295,35',
    texto: 'Faltam R$ 13,60 de comprovante. Os 20 recibos entregues fecham Goiânia (R$ 140,05), Maceió (R$ 12,00) e Uberaba (R$ 143,30).' },
  { grau: 'medio', quem: 'Fábio', titulo: 'A nota de consumo de R$ 69,00 foi emitida em 01/09, não em 10/08',
    texto: 'A NFC-e do frigobar (Anserve / QS Marista, Goiânia) tem data de 01/09/2026 às 09:22. Ou é outra estadia, ou a nota saiu quase um mês depois do consumo. Confirmar.' },
  { grau: 'medio', quem: 'Leonardo', titulo: 'A viagem do Nelore AZ (R$ 576,95) não é despesa de leilão de agosto',
    texto: 'Ele foi a Peixoto de Azevedo/MT de 10 a 13/08 apartar os touros do REPRODUTORES NELORE AZ, que está no cronograma para 12/09/2026. É custo antecipado desse pregão: paga-se agora, a competência é de setembro.' },
  { grau: 'baixo', quem: 'Douglas', titulo: 'Uma despesa com recibo manuscrito: R$ 232,00',
    texto: 'O jantar com o Bruno (Nelore Cascata) de 05/08 veio em bloco de recibo escrito à mão, sem CNPJ. Os outros 18 documentos dele são NFC-e, NFS-e ou BP-e.' },
  { grau: 'baixo', quem: 'Douglas', titulo: 'A hospedagem de R$ 492,00 cobre dois motivos',
    texto: 'A NFS-e 2651 é de 24 a 26/08 e a própria planilha diz "retorno Expogenética E visita do Celso". Se o rateio importar, metade em cada.' },
  { grau: 'baixo', quem: 'Douglas', titulo: 'Chave PIX: a planilha diz telefone, a mensagem diz CNPJ',
    texto: 'A planilha traz "(99) 98490-1010 / Douglas Bispo Carvalho"; em 24/08 ele mandou Bispo Agronegócios LTDA, Bradesco Ag. 1947 C/C 73924-3, PIX CNPJ 50.938.748/0001-08, e em 01/09 confirmou "a do grupo agrobispo". Pagar no CNPJ.' },
  { grau: 'info', quem: 'ERP', titulo: 'Nada disso está lançado — e as estimativas foram canceladas em 31/08',
    texto: 'As linhas "Despesas EXPOGENETICA – passagens, diárias e alimentação da equipe (R$ 6.500)" e "Despesas operacionais demais leilões de agosto (R$ 13.500)" estão canceladas no contas a pagar. Da feira já foram pagos: casa/estrutura em Uberaba R$ 2.000 (11/08), reemissão de passagens R$ 5.026,34 (14/08), bilhete do Fábio R$ 4.196,87 e do Leonardo R$ 1.981,58 (21/08) e uniformes R$ 480.' },
  { grau: 'info', quem: 'Equipe', titulo: 'Só estes três mandaram — e são só estes três que a Central captura em 1:1',
    texto: 'Peralta, Nane, Laila e Lucas não têm DM capturada pela sessão joao-automation, então por aqui não dá para afirmar que não enviaram nada. Os últimos reembolsos pagos foram os de julho: Fábio R$ 4.008,21 e Leonardo R$ 6.141,10, ambos em 07/08. O Douglas não recebeu reembolso em julho ("zero reembolso", 03/08).' },
]

/* ── rastro: o que chegou por WhatsApp ────────────────────────────────── */
export const RASTRO = [
  { quando: '12/08 15:49', quem: 'Douglas', o: 'RELATORIO DESPESA.xlsx (Pérolas do Tapajós, R$ 1.385,75) e PEROLA DO TAPAJOS.xlsx' },
  { quando: '12/08 20:04', quem: 'Douglas', o: 'Foto.pdf — 11 páginas de comprovantes' },
  { quando: '24/08 14:48', quem: 'Douglas', o: 'áudio: "tem que repassar para a Bula 397,54… vou mandar as notinhas da Expogenética"' },
  { quando: '28/08 22:50', quem: 'Douglas', o: 'RELATORIO DESPESA.xlsx (Expogenética + visita do Celso, R$ 1.704,14) e Foto.pdf com 8 comprovantes' },
  { quando: '31/08 14:28', quem: 'Douglas', o: '"Consegue me mandar o da despesa?" e, à noite, "Conferiu? A despesa"' },
  { quando: '25/08 10:48', quem: 'Leonardo', o: 'áudio: "vou te mandar os dois reembolsos, do dia que fui apartar os touros do Nelore AZ e da Expogenética"' },
  { quando: '02/09 08:12', quem: 'Fábio', o: 'RELATORIO DESPESA bula.ods (duas cópias idênticas), 20 recibos da 99, NOTA CONSUMOS.pdf, a NF do hotel e o print do iFood' },
  { quando: '03/09 10:14', quem: 'Leonardo', o: 'RESTAURANTE TABU.pdf (9 comprovantes), contrato Localiza, extrato da tag de pedágio e RELATORIO AGOSTO.xlsx (R$ 2.877,22)' },
]
