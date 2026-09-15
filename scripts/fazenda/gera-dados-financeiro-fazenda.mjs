/**
 * FINANCEIRO FAZENDA — base única (dados.json) transcrita do grupo de WhatsApp
 * "Financeiro Fazenda" (export de 15/09/2026, 24 anexos + 1 áudio).
 *
 * Cada lançamento aponta o comprovante de onde saiu. Nada é somado aqui à mão:
 * os totais são calculados no fim a partir das linhas. "presumido" marca o que
 * a conversa não diz com todas as letras (ex.: quem pagou um pedido em dinheiro).
 *
 *   node scripts/fazenda/gera-dados-financeiro-fazenda.mjs
 */
import fs from 'node:fs'

const OUT = 'outputs/financeiro-fazenda'
fs.mkdirSync(OUT, { recursive: true })

const r2 = n => Math.round(Number(n || 0) * 100) / 100

/* ── quem é quem ─────────────────────────────────────────────────────────── */
const membros = [
  { id: 'marcelo', nome: 'Marcelo Primo Carneiro', nomeBanco: 'Marcelo Carneiro Lucas Pereira', telefone: '5531994149161', papel: 'Criou o grupo em 04/09 (superadmin). Compra os animais e paga a maior parte (Itaú e Sicoob Credimepi).' },
  { id: 'matheus', nome: 'Matheus Amormino', nomeBanco: 'Matheus Amormino', telefone: '5531975659900', papel: 'Admin. Pagou ração dos cavalos, parte das ferramentas e o frete de Pompeu; cuida da contratação do funcionário.' },
  { id: 'mafe', nome: 'Mafê', nomeBanco: 'Maria Fernanda Vasconcelos Mascarenhas Clementino', telefone: '5531998120628', papel: 'Compras e reforma da casa da fazenda (mercado, utensílios, chuveiros, box, orçamentos de janela e ar-condicionado).' },
  { id: 'joao', nome: 'João Eduardo', nomeBanco: 'Joao Pereira', telefone: '5537984044850', papel: 'Controle: "Registrar tudo e fazer uma planilha pra nós" (15/09).' },
]

/* ── categorias (espelham o caderno físico do Marcelo, p. 16 "Despesas Maquinário e Ferramentas") */
const categorias = [
  { id: 'animais_compra', nome: 'Animais — compra', grupo: 'Rebanho' },
  { id: 'animais_comissao', nome: 'Animais — comissão de compra', grupo: 'Rebanho' },
  { id: 'animais_frete', nome: 'Animais — frete e pedágio', grupo: 'Rebanho' },
  { id: 'racao', nome: 'Ração e suplementação', grupo: 'Manejo' },
  { id: 'sanidade', nome: 'Sanidade e materiais de manejo', grupo: 'Manejo' },
  { id: 'identificacao', nome: 'Identificação (brincos)', grupo: 'Manejo' },
  { id: 'maquinas', nome: 'Máquinas e ferramentas', grupo: 'Estrutura' },
  { id: 'casa_mercado', nome: 'Casa — mercado e utensílios', grupo: 'Casa' },
  { id: 'casa_reforma', nome: 'Casa — reforma e instalações', grupo: 'Casa' },
  { id: 'mao_de_obra', nome: 'Mão de obra (funcionário)', grupo: 'Estrutura' },
]

/* ── lançamentos ─────────────────────────────────────────────────────────── */
// status: pago | comprometido (fechado, ainda não pago) | pendente (saldo a pagar)
// pagamentos: quem efetivamente desembolsou; "presumido" = a conversa não afirma.
const lancamentos = [
  {
    id: 1, data: '2026-08-31', status: 'pago', categoria: 'maquinas',
    descricao: 'Motosserra a gasolina, roçadeira, parafusadeira/furadeira, jogo de bits e brocas (63 pçs), óleo 2T',
    fornecedor: 'Leroy Merlin', local: 'Belo Horizonte',
    valor: 1836.04,
    pagamentos: [{ quem: 'marcelo', valor: 1150.00, forma: 'PIX' }, { quem: 'matheus', valor: 686.04, forma: 'Cartão de crédito' }],
    itens: [['Motosserra gas', 699.00], ['Jogo de bits e brocas 63 pçs', 117.98], ['Roçadeira', 709.90], ['Óleo 2T', 39.26], ['Parafusadeira / furadeira', 269.90]],
    comprovante: ['IMG-20260907-WA0018.jpg'], comprovanteTipo: 'Caderno físico, p. 16 (foto)',
    postadoPor: 'marcelo', postadoEm: '2026-09-07 13:03',
    obs: 'Único registro anterior ao grupo. Rateio anotado no caderno: Marcelo PIX 1.150,00 + Matheus crédito 686,04.',
  },
  {
    id: 2, data: '2026-09-04', status: 'pago', categoria: 'casa_mercado',
    descricao: 'Utensílios de cozinha (facas, kit churrasco, triturador, peneira, raquete elétrica, 8 copos, pilhas, afiador, 4 potes) — 13 itens',
    fornecedor: 'Laluc Casa Luxemburgo', local: 'Belo Horizonte', documento: 'NFC-e 17070',
    valor: 197.83,
    pagamentos: [{ quem: 'mafe', valor: 197.83, forma: 'PIX', presumido: true }],
    comprovante: ['IMG-20260907-WA0019.jpg'], comprovanteTipo: 'Cupom fiscal (foto)',
    postadoPor: 'mafe', postadoEm: '2026-09-07 13:04',
    obs: 'Cupom sem nome do pagador; postado pela Mafê (foto na mão dela) — pagador presumido.',
  },
  {
    id: 3, data: '2026-09-05', status: 'pago', categoria: 'casa_mercado',
    descricao: 'Compras de mercado para a casa — 80 itens (limpeza, panela de pressão 7L, mantimentos, carvão…)',
    fornecedor: 'Supermercados BH', local: 'Belo Horizonte', documento: 'NFC-e 82215',
    valor: 974.85,
    pagamentos: [{ quem: 'mafe', valor: 974.85, forma: 'Cartão de débito (final 6252)', presumido: true }],
    comprovante: ['IMG-20260907-WA0052.jpg'], comprovanteTipo: 'Cupom fiscal (foto)',
    postadoPor: 'mafe', postadoEm: '2026-09-07 21:02',
    obs: 'Reenviado em 07/09 porque a 1ª postagem sumiu com as mensagens temporárias. Pagador presumido (cartão de débito, sem nome).',
  },
  {
    id: 4, data: '2026-09-05', status: 'pago', categoria: 'racao',
    descricao: 'Ração Soma Equinos Mel e Aveia 40 kg × 2 (cavalos)',
    fornecedor: 'Antero Ltda — Felixlândia', local: 'Felixlândia', documento: 'Pedido PVE-0000130299',
    valor: 184.01,
    pagamentos: [{ quem: 'matheus', valor: 184.01, forma: 'Dinheiro' }],
    itens: [['Ração Soma Equinos Mel e Aveia 40kg × 2 (bruto 204,46, desc. 10%)', 184.01]],
    comprovante: ['IMG-20260907-WA0015.jpg'], comprovanteTipo: 'Pedido da loja (foto)',
    postadoPor: 'marcelo', postadoEm: '2026-09-07 13:01',
    obs: 'Legenda do Marcelo: "Compra ração para cavalos — Pagamento realizado pelo Matheus".',
  },
  {
    id: 5, data: '2026-09-07', status: 'pago', categoria: 'racao',
    descricao: 'Ração: 5 sc p/ leite 24% farelada, 2 sc Capul 24% F, 3 sc Capul 24% P, 3 sc Soma Equinos, 1 sc Paraense Horse (14 sacos de 40 kg)',
    fornecedor: 'Antero Ltda — Felixlândia', local: 'Felixlândia', documento: 'Pedido PVE-0000130329',
    valor: 1303.09,
    pagamentos: [{ quem: 'marcelo', valor: 1303.09, forma: 'Dinheiro', presumido: true }],
    itens: [['Ração p/ leite 24% farelada 40kg × 5', 516.15], ['Ração Capul 24% F 40kg × 2', 206.46], ['Ração Capul 24% P 40kg × 3', 309.69], ['Ração Soma Equinos Mel e Aveia 40kg × 3', 306.69], ['Ração Paraense Horse Mantence 40kg × 1', 108.89], ['Desconto 10% à vista', -144.79]],
    comprovante: ['IMG-20260907-WA0003.jpg'], comprovanteTipo: 'Pedido da loja (foto)',
    postadoPor: 'marcelo', postadoEm: '2026-09-07 10:07',
    obs: 'Legenda "Compra ração e medicamentos fazenda". Pedido "Dinheiro / à vista"; quem pagou não está escrito — presumido Marcelo (ele postou e, no pedido dos cavalos, avisou quando foi o Matheus).',
  },
  {
    id: 6, data: '2026-09-07', status: 'pago', categoria: 'sanidade',
    descricao: 'Medicamentos e materiais: Dectomax 500 ml, Organovit 500 ml, pistola automática Baspan, Cypermil pour-on 1 L, Topline spray, 12 agulhas, chicote de couro cru, botina New Holland',
    fornecedor: 'Antero Ltda — Felixlândia', local: 'Felixlândia', documento: 'Pedido PVE-0000130323',
    valor: 1019.66,
    pagamentos: [{ quem: 'marcelo', valor: 1019.66, forma: 'Dinheiro', presumido: true }],
    itens: [['Dectomax 500ml', 366.56], ['Modificador orgânico Organovit 500ml', 53.90], ['Pistola automática Baspan', 309.90], ['Cypermil pour-on 1 L', 37.90], ['Topline spray 400ml', 39.90], ['Agulha veterinária 15x12 × 12', 36.00], ['Chicote couro cru', 63.90], ['Botina New Holland', 224.90], ['Desconto 10% à vista', -113.30]],
    comprovante: ['IMG-20260907-WA0003.jpg'], comprovanteTipo: 'Pedido da loja (foto)',
    postadoPor: 'marcelo', postadoEm: '2026-09-07 10:07',
    obs: 'Mesma foto do pedido de ração (dois pedidos na imagem). Pagador presumido Marcelo.',
  },
  {
    id: 7, data: '2026-09-07', status: 'pago', categoria: 'animais_frete',
    descricao: 'Frete das bezerras comerciais — João Pinheiro → Felixlândia',
    fornecedor: 'Hugo Cançado Ribeiro Franco (freteiro)', local: 'João Pinheiro → Felixlândia', lote: 'JP',
    valor: 2450.00,
    pagamentos: [{ quem: 'marcelo', valor: 2450.00, forma: 'PIX Itaú 10:37' }],
    comprovante: ['IMG-20260907-WA0004.jpg'], comprovanteTipo: 'Comprovante PIX',
    postadoPor: 'marcelo', postadoEm: '2026-09-07 10:38',
  },
  {
    id: 8, data: '2026-09-07', status: 'pago', categoria: 'animais_frete',
    descricao: 'Pedágio do frete das bezerras comerciais — João Pinheiro → Felixlândia',
    fornecedor: 'Hugo Cançado Ribeiro Franco (freteiro)', local: 'João Pinheiro → Felixlândia', lote: 'JP',
    valor: 208.80,
    pagamentos: [{ quem: 'marcelo', valor: 208.80, forma: 'PIX Itaú 12:47' }],
    comprovante: ['IMG-20260907-WA0009.jpg'], comprovanteTipo: 'Comprovante PIX',
    postadoPor: 'marcelo', postadoEm: '2026-09-07 12:47',
  },
  {
    id: 9, data: '2026-09-07', status: 'pago', categoria: 'animais_compra',
    descricao: 'Bezerras comerciais de João Pinheiro — 50% do lote (lote de R$ 72.800,00)',
    fornecedor: 'Luiz Carlos Gonçalves (vendedor)', local: 'João Pinheiro', lote: 'JP',
    valor: 36400.00,
    pagamentos: [{ quem: 'marcelo', valor: 36400.00, forma: 'PIX Sicoob Credimepi 12:49' }],
    comprovante: ['IMG-20260907-WA0010.jpg'], comprovanteTipo: 'Comprovante PIX',
    postadoPor: 'marcelo', postadoEm: '2026-09-07 12:51',
    obs: 'Legenda: "Pagamento 50% bezerras comerciais" → lote de 72.800,00, saldo de 36.400,00 sem data combinada. Bate com a comissão do Sindicato (2,5% de 72.800 = 1.820).',
  },
  {
    id: 10, data: '2026-09-07', status: 'pago', categoria: 'casa_reforma',
    descricao: '3 chuveiros Lorenzetti Ducha Relax 3 temperaturas 110 V (3 × 104,90 + frete 42,98 − desconto de envio 40,00 − cupom 15,74)',
    fornecedor: 'Efácil Oficial (Shopee)', local: 'online → Belo Horizonte', documento: 'Pedido Shopee',
    valor: 301.94,
    pagamentos: [{ quem: 'mafe', valor: 301.94, forma: 'Shopee' }],
    comprovante: ['IMG-20260907-WA0034.jpg'], comprovanteTipo: 'Tela do pedido',
    postadoPor: 'mafe', postadoEm: '2026-09-07 19:11',
    obs: 'Entrega prevista 21–28/09; chegaram em 11/09 (foto). Pedido no nome da Mafê.',
  },
  {
    id: 11, data: '2026-09-11', status: 'pago', categoria: 'animais_comissao',
    descricao: 'Comissão do Sindicato Rural de João Pinheiro na compra das bezerras (2,5% de 72.800,00)',
    fornecedor: 'Sindicato Rural de João Pinheiro', local: 'João Pinheiro', lote: 'JP',
    valor: 1820.00,
    pagamentos: [{ quem: 'marcelo', valor: 1820.00, forma: 'PIX Itaú 11:08' }],
    comprovante: ['IMG-20260911-WA0025.jpg'], comprovanteTipo: 'Comprovante PIX',
    postadoPor: 'marcelo', postadoEm: '2026-09-11 11:08',
  },
  {
    id: 12, data: '2026-09-11', status: 'comprometido', categoria: 'casa_reforma',
    descricao: 'Box blindex do banheiro — fechado em 7 × R$ 150,00 (orçamento inicial 1.127,00 em 10x ou 1.015,00 à vista)',
    fornecedor: 'Vidraçaria (não identificada)', local: 'Felixlândia',
    valor: 1050.00,
    pagamentos: [],
    comprovante: [], comprovanteTipo: 'Mensagens de 10–11/09',
    postadoPor: 'mafe', postadoEm: '2026-09-11 07:55',
    obs: 'Marcelo: "Ok pode fechar" (11/09 07:55). Sem comprovante e sem quem paga — 7 parcelas ainda vão cair no cartão de alguém. Mafê perguntou se o box "abate naquele valor" (ficou sem resposta).',
  },
  {
    id: 13, data: '2026-09-14', status: 'pago', categoria: 'animais_compra',
    descricao: 'Lote de bezerras comerciais — leilão de Pompeu-MG (comissão já inclusa)',
    fornecedor: 'Lilia de Souza Alves (vendedora)', local: 'Pompeu', lote: 'POMPEU-1',
    valor: 38610.00,
    pagamentos: [{ quem: 'marcelo', valor: 38610.00, forma: 'PIX Itaú 12:12' }],
    comprovante: ['IMG-20260914-WA0033.jpg'], comprovanteTipo: 'Comprovante PIX',
    postadoPor: 'marcelo', postadoEm: '2026-09-14 12:13',
  },
  {
    id: 14, data: '2026-09-14', status: 'pago', categoria: 'animais_compra',
    descricao: 'Lote de bezerras comerciais — leilão de Pompeu-MG — pagamento parcial (lote de R$ 16.494,00; faltou limite)',
    fornecedor: 'MH Leilões', local: 'Pompeu', lote: 'POMPEU-2',
    valor: 10000.00,
    pagamentos: [{ quem: 'marcelo', valor: 10000.00, forma: 'PIX Itaú 12:15' }],
    comprovante: ['IMG-20260914-WA0034.jpg'], comprovanteTipo: 'Comprovante PIX',
    postadoPor: 'marcelo', postadoEm: '2026-09-14 12:17',
    obs: 'Legenda: "pendente 6.494,00 que faltou limite".',
  },
  {
    id: 15, data: '2026-09-14', status: 'pago', categoria: 'animais_frete',
    descricao: 'Frete do leilão de Pompeu → fazenda',
    fornecedor: 'Eduardo Pereira dos Santos (freteiro)', local: 'Pompeu → Felixlândia', lote: 'POMPEU',
    valor: 1250.00,
    pagamentos: [{ quem: 'matheus', valor: 1250.00, forma: 'PIX 22:46' }],
    comprovante: ['IMG-20260914-WA0185.jpg'], comprovanteTipo: 'Comprovante PIX (foto da tela)',
    postadoPor: 'matheus', postadoEm: '2026-09-14 22:48',
  },
  {
    id: 16, data: '2026-09-15', status: 'pago', categoria: 'identificacao',
    descricao: 'Brincos Allflex (76–100 c/25 e bovino amarelo 26–50) + aplicador universal Allflex',
    fornecedor: 'Antero Ltda — Felixlândia', local: 'Felixlândia', documento: 'Pedido PVE-0000131072',
    valor: 386.82,
    pagamentos: [{ quem: 'marcelo', valor: 386.82, forma: 'PIX Itaú 13:19 (parte de 1.315,00)' }],
    itens: [['Brinco Allflex 76-100 c/25', 91.00], ['Brinco bov. Allflex amarelo 26 ao 50', 96.90], ['Aplicador de brinco universal Allflex', 241.90], ['Desconto 10%', -42.98]],
    comprovante: ['IMG-20260915-WA0049.jpg', 'IMG-20260915-WA0052.jpg'], comprovanteTipo: 'PIX + pedido',
    postadoPor: 'marcelo', postadoEm: '2026-09-15 13:20',
    obs: 'Um PIX de 1.315,00 a Marcos Antero Filho pagou este pedido (386,82) e o de ração (930,06). Soma 1.316,88 — 1,88 de diferença absorvida na hora; lançado 386,82 + 928,18 para bater com o dinheiro que saiu.',
  },
  {
    id: 17, data: '2026-09-15', status: 'pago', categoria: 'racao',
    descricao: 'Ração Capul 24% F 40 kg × 10 sacos (pedido 930,06; pago 928,18 dentro do PIX de 1.315,00)',
    fornecedor: 'Antero Ltda — Felixlândia', local: 'Felixlândia', documento: 'Pedido PVE-0000131073',
    valor: 928.18,
    pagamentos: [{ quem: 'marcelo', valor: 928.18, forma: 'PIX Itaú 13:19 (parte de 1.315,00)' }],
    itens: [['Ração Capul 24% F 40kg × 10 (103,34/sc, sem desconto)', 930.06]],
    comprovante: ['IMG-20260915-WA0049.jpg', 'IMG-20260915-WA0055.jpg'], comprovanteTipo: 'PIX + pedido',
    postadoPor: 'marcelo', postadoEm: '2026-09-15 13:22',
  },
  // ── saldos a pagar (pendências com valor definido) ──────────────────────
  {
    id: 18, data: '2026-09-07', status: 'pendente', categoria: 'animais_compra',
    descricao: 'Saldo das bezerras comerciais de João Pinheiro — os outros 50% do lote',
    fornecedor: 'Luiz Carlos Gonçalves (vendedor)', local: 'João Pinheiro', lote: 'JP',
    valor: 36400.00, pagamentos: [], comprovante: [], comprovanteTipo: 'Derivado da legenda "50%"',
    postadoPor: 'marcelo', postadoEm: '2026-09-07 12:52',
    obs: 'Data de pagamento não aparece no grupo — combinar e registrar.',
  },
  {
    id: 19, data: '2026-09-14', status: 'pendente', categoria: 'animais_compra',
    descricao: 'Saldo do lote da MH Leilões (Pompeu) — "faltou limite" no dia',
    fornecedor: 'MH Leilões', local: 'Pompeu', lote: 'POMPEU-2',
    valor: 6494.00, pagamentos: [], comprovante: [], comprovanteTipo: 'Legenda do PIX de 10.000',
    postadoPor: 'marcelo', postadoEm: '2026-09-14 12:17',
    obs: 'Leiloeira costuma cobrar juros/multa por atraso — quitar o quanto antes.',
  },
]

/* ── lotes de animais ────────────────────────────────────────────────────── */
const lotes = [
  { id: 'JP', descricao: 'Bezerras comerciais — João Pinheiro-MG', origem: 'Compra direta via Sindicato Rural de João Pinheiro', vendedor: 'Luiz Carlos Gonçalves', data: '2026-09-07', valor: 72800.00, comissao: 1820.00, comissaoObs: '2,5% pagos ao Sindicato em 11/09', frete: 2658.80, freteObs: 'Hugo Cançado: 2.450,00 + pedágio 208,80', cabecas: null },
  { id: 'POMPEU-1', descricao: 'Bezerras comerciais — leilão de Pompeu-MG (lote 1)', origem: 'Leilão', vendedor: 'Lilia de Souza Alves', data: '2026-09-14', valor: 38610.00, comissao: 0, comissaoObs: 'já inclusa no valor', frete: null, freteObs: 'frete de Pompeu (1.250,00) cobre os dois lotes', cabecas: null },
  { id: 'POMPEU-2', descricao: 'Bezerras comerciais — leilão de Pompeu-MG (lote 2)', origem: 'Leilão', vendedor: 'MH Leilões', data: '2026-09-14', valor: 16494.00, comissao: 0, comissaoObs: 'não informada', frete: null, freteObs: '', cabecas: null },
]
const fretePompeu = 1250.00

/* ── orçamentos / decisões em aberto (sem valor fechado) ─────────────────── */
const orcamentos = [
  { item: 'Janelas da casa', situacao: 'Mafê achou profissional; cobra R$ 50 de deslocamento para orçar (07/09). Sem retorno no grupo.', valorRef: 50, responsavel: 'mafe', proximoPasso: 'Autorizar a visita ou pedir indicação na agropecuária.' },
  { item: 'Ar-condicionado', situacao: 'Instalador cobra R$ 100 só para orçar (10/09). Portátil Philco (R$ 2.599 no Mercado Livre) descartado pela Mafê: precisa de janela de correr para a saída de ar. Marcelo: "melhor de parede mesmo — pode falar para ele ir". Casa precisa ter ponto 220 V (dúvida da Mafê, sem resposta).', valorRef: 100, responsavel: 'mafe', proximoPasso: 'Confirmar se há 220 V e marcar a visita.' },
  { item: 'Tampa de vaso e tampa da descarga', situacao: 'Cotação em Felixlândia: R$ 69 (vaso) + R$ 80 (descarga). Mafê: "na net vai compensar mais". Matheus: banheiro tem descarga, falta só a tampa do vaso.', valorRef: 149, responsavel: 'mafe', proximoPasso: 'Comprar online a tampa do vaso.' },
  { item: 'Funcionário da fazenda', situacao: 'Mafê perguntou "tá andando?" (10/09). Matheus: "estamos conversando com alguns".', valorRef: null, responsavel: 'matheus', proximoPasso: 'Ao contratar, registrar salário, encargos e data de início — vira custo fixo mensal.' },
  { item: 'Protetores de porta e cortina', situacao: 'Chegaram em 11/09 (foto da Mafê). Valor e pagador não foram postados.', valorRef: null, responsavel: 'mafe', proximoPasso: 'Postar o valor para entrar no controle.' },
]

/* ── fornecedores e contatos (como aparecem nos comprovantes) ────────────── */
const fornecedores = [
  { nome: 'Antero Ltda — Felixlândia (agropecuária)', tipo: 'Ração, medicamentos, brincos, ferramentas', doc: 'CNPJ 21.075.863/0001-06', contato: '(38) 3753-1055 · Pç. Padre Félix, 298, Centro, Felixlândia/MG', pix: 'Marcos Antero Filho — +55 38 99820-0717 (Sicoob União Central)', obs: 'Dá 10% de desconto à vista (não deu no pedido de 10 sacos de 15/09).' },
  { nome: 'Luiz Carlos Gonçalves', tipo: 'Vendedor das bezerras de João Pinheiro', doc: 'CPF ***.707.806-**', contato: '—', pix: 'Caixa Econômica Federal', obs: 'Saldo de 36.400,00 a pagar.' },
  { nome: 'Sindicato Rural de João Pinheiro', tipo: 'Intermediação da compra (comissão 2,5%)', doc: 'CNPJ 18.888.495/0001-00', contato: '—', pix: '18888495000100 (Sicoob)', obs: '' },
  { nome: 'Hugo Cançado Ribeiro Franco', tipo: 'Freteiro — João Pinheiro → Felixlândia', doc: 'CPF ***339866**', contato: '+55 38 99946-2046', pix: '+5538999462046 (Sicredi Rota das Terras)', obs: 'Frete 2.450 + pedágio 208,80.' },
  { nome: 'Lilia de Souza Alves', tipo: 'Vendedora — leilão de Pompeu (lote 1)', doc: 'CPF ***785126**', contato: '—', pix: '09578512600 (Cresol Transformação)', obs: '' },
  { nome: 'MH Leilões', tipo: 'Leiloeira — Pompeu (lote 2)', doc: 'CNPJ 14.878.332/0001-88', contato: 'Dores do Indaiá/MG', pix: '14878332000188 (Sicoob Coopcredi)', obs: 'Saldo de 6.494,00 a pagar.' },
  { nome: 'Eduardo Pereira dos Santos', tipo: 'Freteiro — leilão de Pompeu → fazenda', doc: 'CPF ***.723.706-**', contato: '+55 38 99959-4782', pix: '+5538999594782 (Nubank)', obs: '' },
  { nome: 'Leroy Merlin', tipo: 'Máquinas e ferramentas', doc: '—', contato: 'Belo Horizonte', pix: '—', obs: 'Compra de 31/08 anotada no caderno.' },
  { nome: 'Laluc Casa Luxemburgo', tipo: 'Utensílios domésticos', doc: 'CNPJ 57.493.944/0001-65', contato: '(31) 2552-0322 · Rua Guaicuí, 503, Luxemburgo, BH', pix: '—', obs: '' },
  { nome: 'Supermercados BH', tipo: 'Mercado', doc: 'CNPJ 04.641.376/0370-56', contato: 'Belo Horizonte', pix: '—', obs: '' },
  { nome: 'Efácil Oficial (Shopee)', tipo: 'Chuveiros', doc: '—', contato: 'online', pix: '—', obs: 'Entrega em nome da Mafê (BH).' },
  { nome: 'Vidraçaria — box blindex', tipo: 'Reforma do banheiro', doc: '—', contato: 'Felixlândia (não identificado no grupo)', pix: '—', obs: 'Fechado 1.050,00 em 7x.' },
]

/* ── linha do tempo do grupo ─────────────────────────────────────────────── */
const timeline = [
  ['31/08', 'Compra de ferramentas na Leroy Merlin (1.836,04) — anotada no caderno, rateada Marcelo/Matheus.'],
  ['04/09 23:48', 'Marcelo cria o grupo "Financeiro Fazenda" com mensagens temporárias de 24 h (desligadas em 06/09 — parte do que foi postado até então se perdeu; a Mafê reenviou o cupom do mercado).'],
  ['04–05/09', 'Compras da casa em BH (utensílios 197,83; mercado 974,85). Ração dos cavalos paga pelo Matheus (184,01).'],
  ['07/09', 'Dia das bezerras de João Pinheiro: frete (2.450) e pedágio (208,80) pagos ao freteiro; 50% do lote (36.400) pago ao vendedor. Compra de ração e medicamentos na Antero (2.322,75). Mafê pede 3 chuveiros (301,94) e orça janelas.'],
  ['08–10/09', 'Casa: tampa de vaso, box do banheiro (orçamento 1.127/1.015), ar-condicionado (portátil × parede), funcionário "andando".'],
  ['11/09', 'Comissão do Sindicato Rural (1.820) paga. Box fechado por 1.050 em 7x. Chuveiros, protetores de porta e cortina chegam.'],
  ['14/09', 'Leilão de Pompeu: dois lotes de bezerras (38.610 + 10.000 de 16.494) pagos pelo Marcelo; frete (1.250) pago pelo Matheus.'],
  ['15/09', 'Brincos e 10 sacos de ração (1.315). João Eduardo: "Registrar tudo e fazer uma planilha pra nós".'],
]

/* ── anexos do export → nome legível na pasta "03 - Comprovantes" ─────────── */
const arquivos = {
  'IMG-20260907-WA0018.jpg': '2026-08-31 - Caderno p16 - Leroy Merlin ferramentas 1.836,04 - Marcelo 1.150 + Matheus 686,04.jpg',
  'IMG-20260907-WA0016.jpg': '2026-08-31 - Caderno p16 - Leroy Merlin ferramentas 1.836,04 (cópia menor).jpg',
  'IMG-20260907-WA0019.jpg': '2026-09-04 - Cupom Laluc Casa BH - utensílios 197,83 - Mafê.jpg',
  'IMG-20260907-WA0052.jpg': '2026-09-05 - Cupom Supermercados BH - mercado 974,85 - Mafê.jpg',
  'IMG-20260907-WA0015.jpg': '2026-09-05 - Antero - pedido 130299 ração cavalos 184,01 - pago Matheus.jpg',
  'IMG-20260907-WA0013.jpg': '2026-09-05 - Antero - pedido 130299 ração cavalos 184,01 - pago Matheus (cópia menor).jpg',
  'IMG-20260907-WA0003.jpg': '2026-09-07 - Antero - pedidos 130329 ração 1.303,09 e 130323 medicamentos 1.019,66.jpg',
  'IMG-20260907-WA0001.jpg': '2026-09-07 - Antero - pedidos 130329 ração 1.303,09 e 130323 medicamentos 1.019,66 (cópia menor).jpg',
  'IMG-20260907-WA0004.jpg': '2026-09-07 - PIX 2.450,00 - Marcelo a Hugo Cançado - frete bezerras JP.jpg',
  'IMG-20260907-WA0009.jpg': '2026-09-07 - PIX 208,80 - Marcelo a Hugo Cançado - pedágio frete JP.jpg',
  'IMG-20260907-WA0010.jpg': '2026-09-07 - PIX 36.400,00 - Marcelo a Luiz Carlos Gonçalves - 50% bezerras JP.jpg',
  'IMG-20260907-WA0034.jpg': '2026-09-07 - Shopee - 3 chuveiros Lorenzetti 301,94 - Mafê.jpg',
  'IMG-20260910-WA0049.jpg': '2026-09-10 - Referência - ar-condicionado portátil Philco 2.599 (Mercado Livre).jpg',
  'PTT-20260910-WA0050.opus': '2026-09-10 - Áudio Mafê - portátil precisa de janela de correr.opus',
  'IMG-20260911-WA0025.jpg': '2026-09-11 - PIX 1.820,00 - Marcelo a Sindicato Rural JP - comissão bezerras.jpg',
  'IMG-20260911-WA0056.jpg': '2026-09-11 - Entrega - chuveiros chegaram.jpg',
  'IMG-20260911-WA0057.jpg': '2026-09-11 - Entrega - protetores de porta e cortina.jpg',
  'IMG-20260914-WA0033.jpg': '2026-09-14 - PIX 38.610,00 - Marcelo a Lilia de Souza Alves - bezerras Pompeu lote 1.jpg',
  'IMG-20260914-WA0034.jpg': '2026-09-14 - PIX 10.000,00 - Marcelo a MH Leilões - bezerras Pompeu lote 2 (saldo 6.494).jpg',
  'IMG-20260914-WA0185.jpg': '2026-09-14 - PIX 1.250,00 - Matheus a Eduardo Pereira - frete Pompeu.jpg',
  'IMG-20260915-WA0049.jpg': '2026-09-15 - PIX 1.315,00 - Marcelo a Marcos Antero Filho - brincos e ração.jpg',
  'IMG-20260915-WA0052.jpg': '2026-09-15 - Antero - pedido 131072 brincos 386,82.jpg',
  'IMG-20260915-WA0050.jpg': '2026-09-15 - Antero - pedido 131072 brincos 386,82 (cópia menor).jpg',
  'IMG-20260915-WA0055.jpg': '2026-09-15 - Antero - pedido 131073 ração 930,06.jpg',
  'IMG-20260915-WA0053.jpg': '2026-09-15 - Antero - pedido 131073 ração 930,06 (cópia menor).jpg',
}

/* ── totais (calculados, nunca escritos) ─────────────────────────────────── */
const pagos = lancamentos.filter(l => l.status === 'pago')
const sum = a => r2(a.reduce((s, x) => s + Number(x || 0), 0))
const porPagador = Object.fromEntries(membros.map(m => [m.id, r2(pagos.flatMap(l => l.pagamentos).filter(p => p.quem === m.id).reduce((s, p) => s + p.valor, 0))]))
const porCategoria = categorias.map(c => ({
  ...c,
  pago: sum(pagos.filter(l => l.categoria === c.id).map(l => l.valor)),
  comprometido: sum(lancamentos.filter(l => l.categoria === c.id && l.status === 'comprometido').map(l => l.valor)),
  pendente: sum(lancamentos.filter(l => l.categoria === c.id && l.status === 'pendente').map(l => l.valor)),
})).filter(c => c.pago || c.comprometido || c.pendente)
const totais = {
  pago: sum(pagos.map(l => l.valor)),
  comprometido: sum(lancamentos.filter(l => l.status === 'comprometido').map(l => l.valor)),
  pendente: sum(lancamentos.filter(l => l.status === 'pendente').map(l => l.valor)),
  porPagador,
  animais: {
    lotes: sum(lotes.map(l => l.valor)),
    pago: sum(pagos.filter(l => l.categoria === 'animais_compra').map(l => l.valor)),
    saldo: sum(lancamentos.filter(l => l.categoria === 'animais_compra' && l.status === 'pendente').map(l => l.valor)),
    comissao: sum(pagos.filter(l => l.categoria === 'animais_comissao').map(l => l.valor)),
    frete: sum(pagos.filter(l => l.categoria === 'animais_frete').map(l => l.valor)),
  },
}
totais.aPagar = r2(totais.comprometido + totais.pendente)
totais.geral = r2(totais.pago + totais.aPagar)
totais.animais.custoTotal = r2(totais.animais.lotes + totais.animais.comissao + totais.animais.frete)
// checagens
const somaPag = sum(pagos.flatMap(l => l.pagamentos).map(p => p.valor))
if (somaPag !== totais.pago) throw new Error(`pagamentos (${somaPag}) ≠ lançamentos pagos (${totais.pago})`)
for (const l of pagos) { const s = sum(l.pagamentos.map(p => p.valor)); if (s !== l.valor) throw new Error(`lançamento ${l.id}: pagamentos ${s} ≠ valor ${l.valor}`) }
if (r2(totais.animais.pago + totais.animais.saldo) !== totais.animais.lotes) throw new Error('animais: pago + saldo ≠ lotes')

const D = {
  geradoEm: new Date().toISOString(),
  periodo: { de: '2026-08-31', ate: '2026-09-15' },
  grupo: { nome: 'Financeiro Fazenda', jid: '120363428377044888@g.us', criadoEm: '2026-09-04 23:48', criadoPor: 'marcelo', fonte: 'Export do WhatsApp em 15/09/2026 (Conversa do WhatsApp com Financeiro Fazenda.zip)' },
  fazenda: { local: 'Felixlândia/MG', atividade: 'Recria de bezerras comerciais (compradas em João Pinheiro e Pompeu) + cavalos; casa da fazenda em reforma.' },
  membros, categorias, lancamentos, lotes, fretePompeu, orcamentos, fornecedores, timeline, arquivos, porCategoria, totais,
}
fs.writeFileSync(`${OUT}/dados.json`, JSON.stringify(D, null, 1))
console.log(`pago ${totais.pago} | comprometido ${totais.comprometido} | pendente ${totais.pendente} | a pagar ${totais.aPagar} | geral ${totais.geral}`)
console.log('por pagador', porPagador)
console.log('animais', totais.animais)
