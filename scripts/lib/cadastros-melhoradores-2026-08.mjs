/**
 * CADASTROS DE 27 A 31/08/2026 — a janela em que a mídia voltou a rodar.
 * Apuração dos dois grupos, mensagem a mensagem E COM OS ANEXOS ABERTOS.
 *
 * Fonte: whatsapp_messages dos grupos "Cadastros Bula Remates"
 * (120363407740739645@g.us) e "Cadastros Bula e Programa"
 * (120363426678313709@g.us) — 123 mensagens distintas — mais os 27 anexos
 * baixados do bucket `whatsapp-media` e LIDOS um a um. Emenda sem buraco nem
 * sobreposição com scripts/lib/cadastros-agosto-2026.mjs, que vai até 26/08:
 * nos dias 26 e 27/08 até 12h49 não houve mensagem nenhuma nos dois grupos.
 *
 * ⚠ POR QUE OS ANEXOS SÃO OBRIGATÓRIOS (a mesma lição de agosto). Cinco das
 * doze fichas não têm nome no texto — o cliente vai dentro do anexo:
 *
 *   • 29/08 06:56 — "A cliente está em processo de compra da propriedade,
 *     ainda não tem a IE". O RG anexado é de GISLEINE APARECIDA FERNANDES DA
 *     SILVA, lead do Melhoradores entrado 39 minutos antes.
 *   • 29/08 07:05 — "Verifiquem esse cadastro também". CNH e conta de luz de
 *     CLAUDIO EDUARDO PUPIM, lead do Jacamin da véspera.
 *   • 29/08 09:36 — "Cadastro novo pra o leilao melhoradores". CNH de
 *     REGINALDO LEANDRO DA SILVA, lead do Perpétuo Touro de 28/08.
 *   • 31/08 11:22 — sete documentos sem uma linha de nome. IRPF e IAGRO de
 *     EVALDO LUIZ NUNES ESCOBAR, que preencheu o formulário como "Rui Escobar".
 *
 * Sem abrir anexo, a janela teria 3 fichas identificadas em vez de 12, e o
 * degrau MQL→cadastro apareceria muito pior do que foi.
 *
 * CASAMENTO COM O LEAD: por CPF contra a aba LEADS GERAIS da planilha, com a
 * mesma indexação de scripts/lib/origem-cadastros-2026.mjs. CPF é prova;
 * nenhuma delas depende de nome. Sete das doze são lead de mídia — e três
 * campanhas diferentes aparecem, o que só ficou visível quando o cruzamento
 * passou a ser contra o universo INTEIRO e não contra uma campanha só.
 *
 * VEREDITO, transcrito da resposta da leiloeira no grupo. "Aprovado com
 * ressalva" (limite de lotes, cautela) entra como aprovado — é a mesma régua
 * do quadro mensal. Nos leilões de MS a inscrição estadual trava: "para os
 * leilões do MS nao conseguimos sem a I.E, documento obrigatório para emissão
 * de nota dentro do estado".
 */

/** As doze fichas da janela. `campanha` = null quando não é lead de mídia. */
export const CADASTROS_JANELA = [
    {
        nome: 'Alexandre Soares de Carvalho', cpf: '710.569.631-15', campanha: null,
        submetidaEm: '2026-08-27T12:49', grupo: 'Cadastros Bula e Programa', para: 'Terra Brava',
        prova: 'texto: nome, fazenda e CPF em balão único',
        status: 'aprovado', veredito: 'seguiu para o leilão — comprou 1 lote no Melhoradores em 29/08, mas não é lead de mídia',
    },
    {
        nome: 'Hatila Silva Paes', cpf: '041.342.311-59', campanha: null,
        submetidaEm: '2026-08-27T22:12', grupo: 'Cadastros Bula e Programa', para: 'Terra Brava',
        prova: 'anexo: ficha de destino do IAGRO, inscrição 287949265, Anastácio/MS',
        status: 'aprovado', veredito: '"Hatila Silva Paes - ok"',
    },
    {
        nome: 'Tiago Marcel Kyschel', cpf: '095.528.489-97', campanha: 'MELHORADORES',
        leadNome: 'Tiago Kyschel', leadEm: '2026-08-27T21:32',
        submetidaEm: '2026-08-28T13:18', grupo: 'Cadastros Bula e Programa + Cadastros Bula Remates',
        para: 'LEILÃO MELHORADORES ESPECIAL 30 ANOS (29/08)',
        prova: 'texto: "Tiago marcel kyschel / CPF 09552848997 / Verifica, por favor, se esse cliente tem cadastro ativo"',
        status: 'recusado', veredito: '"score dele é bom, mas nao encontramos i.e." — sem I.E. não passa em leilão de MS',
    },
    {
        nome: 'Jessé Martins Mendes', cpf: '040.149.451-97', campanha: 'PERPÉTUO TOURO',
        leadNome: 'Jessé Martins Mendes', leadEm: '2026-08-28T12:54',
        submetidaEm: '2026-08-28T14:36', grupo: 'Cadastros Bula Remates', para: 'eRural',
        prova: 'anexo: CNH, CPF 040.149.451-97; texto traz I.E. 15.419.769-6 e a Fazenda São José, São Félix do Xingu/PA',
        status: 'aprovado', veredito: '"liberado 1 lote pra ele" — tem restrições e protestos, "averiguando melhor da pra ir com CAUTELA"',
    },
    {
        nome: 'Gisleine Aparecida Fernandes da Silva', cpf: '622.433.731-49', campanha: 'MELHORADORES',
        leadNome: 'Gisleine Fernandes', leadEm: '2026-08-29T06:17',
        submetidaEm: '2026-08-29T06:56', grupo: 'Cadastros Bula Remates',
        para: 'LEILÃO MELHORADORES ESPECIAL 30 ANOS (29/08)',
        prova: 'anexo: RG do Estado de Mato Grosso, registro 0792899-8, CPF 622.433.731-49',
        status: 'recusado', veredito: '"para os leilões do MS nao conseguimos sem a I.E" — a cliente ainda está comprando a propriedade',
    },
    {
        nome: 'Claudio Eduardo Pupim', cpf: '226.263.838-13', campanha: 'JACAMIN',
        leadNome: 'Claudio Eduardo Pupim', leadEm: '2026-08-28T21:16',
        submetidaEm: '2026-08-29T07:05', grupo: 'Cadastros Bula Remates', para: 'leilão de MS',
        prova: 'anexos: CNH e conta da Energisa em Aquidauana/MS, CPF 226.263.838-13; texto traz a inscrição 288205618',
        status: 'aprovado', veredito: '"esse ok"',
    },
    {
        nome: 'Ejamal Muhd Shihadeh Khalil', cpf: '666.740.349-91', campanha: 'JACAMIN',
        leadNome: 'Ejamal Muhd Shihadeh Khalil', leadEm: '2026-08-29T00:05',
        submetidaEm: '2026-08-29T08:38', grupo: 'Cadastros Bula Remates', para: 'consulta de cadastro existente',
        prova: 'texto: "Ejamal Muhd Shihadeh khalil / CPF 666.740.349 - 91 / Ele disse que já tem cadastro conosco"',
        status: 'pendente', veredito: 'sem veredito registrado no grupo até 31/08',
    },
    {
        nome: 'Reginaldo Leandro da Silva', cpf: '401.932.171-04', campanha: 'PERPÉTUO TOURO',
        leadNome: 'Reginaldo Leandro da Silva', leadEm: '2026-08-28T08:22',
        submetidaEm: '2026-08-29T09:36', grupo: 'Cadastros Bula e Programa + Cadastros Bula Remates',
        para: 'LEILÃO MELHORADORES ESPECIAL 30 ANOS (29/08)',
        prova: 'anexo: CNH, CPF 401.932.171-04; texto traz a inscrição estadual 137211708',
        status: 'aprovado', veredito: '"cadastro ok" — "score meio baixo, vamos na cautela, dois ou tres lotes dependendo do preço"',
    },
    {
        nome: 'Lucas Joaquim Krause (I.E. do pai, Ademir Krause)', cpf: '060.735.962-51', campanha: null,
        submetidaEm: '2026-08-30T10:14', grupo: 'Cadastros Bula e Programa', para: 'Ventres VIP Matinha',
        prova: 'anexos: FIC da SEFA/PA em nome de ADEMIR KRAUSE (I.E. 75.014.237-5), CNH do Ademir e RG do filho LUCAS JOAQUIM KRAUSE, CPF 060.735.962-51',
        status: 'recusado', veredito: '"Não aprovado, restrições cpf" — o consultado foi o FILHO ("passa o cpf do Lucas então"); a I.E. é do pai, e a leiloeira não aceita. Confirmado no AgRisk: Lucas consta, Ademir não.',
    },
    {
        nome: 'Ana Vitoria Martins Lagares', cpf: '064.410.281-07', campanha: null,
        submetidaEm: '2026-08-30T11:18', grupo: 'Cadastros Bula e Programa', para: 'Ventres VIP Matinha',
        prova: 'anexo: CNH, CPF 064.410.281-07',
        status: 'pendente', veredito: 'sem veredito registrado no grupo',
    },
    {
        nome: 'Evaldo Luiz Nunes Escobar', cpf: '372.576.921-49', campanha: 'MELHORADORES',
        leadNome: 'Rui Escobar', leadEm: '2026-08-30T08:28',
        submetidaEm: '2026-08-31T12:22', grupo: 'Cadastros Bula Remates',
        para: 'carteira geral (o leilão da campanha já tinha passado)',
        prova: 'anexos: IRPF 2026 e três comprovantes de saldo do IAGRO/MS, CPF 372.576.921-49',
        status: 'aprovado', veredito: '"Bom score, tem IE, pelo visto bom de mexida mandou a documentação toda certinho. Aprovado!"',
    },
    {
        nome: 'Analice Martins da Silva', cpf: '995.283.121-87', campanha: null,
        submetidaEm: '2026-08-31T12:14', grupo: 'Cadastros Bula Remates', para: 'carteira geral',
        prova: 'anexo: cadastro da SEFA/PA, I.E. 15.948.624-6, São Geraldo do Araguaia/PA',
        status: 'recusado', veredito: '"Ele tem cadastro ruim, não é toda leiloeira que aprova" — dívida saltou de 11 mil (2025) para 277.728,33 (2026)',
    },
]

/** As fichas da janela que são lead de mídia — as que entram no funil. */
export const CADASTROS_DE_MIDIA = CADASTROS_JANELA.filter(c => c.campanha)

/** Só as do Melhoradores, para o quadro daquela campanha. */
export const CADASTROS_CAMPANHA = CADASTROS_JANELA.filter(c => c.campanha === 'MELHORADORES')

/** As demais — nem toda ficha da janela é da campanha do Melhoradores. */
export const CADASTROS_FORA_DA_CAMPANHA = CADASTROS_JANELA.filter(c => c.campanha !== 'MELHORADORES')
