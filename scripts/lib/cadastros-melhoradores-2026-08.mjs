/**
 * CADASTROS DA JANELA DA CAMPANHA "LEILÃO MELHORADORES" (27 a 31/08/2026) —
 * apuração dos dois grupos de cadastro, mensagem a mensagem E COM OS ANEXOS
 * ABERTOS.
 *
 * Fonte: whatsapp_messages dos grupos "Cadastros Bula Remates"
 * (120363407740739645@g.us) e "Cadastros Bula e Programa"
 * (120363426678313709@g.us), de 27/08 a 31/08/2026 — 123 mensagens distintas —
 * mais os 27 anexos baixados do bucket `whatsapp-media` e LIDOS um a um.
 *
 * ⚠ POR QUE OS ANEXOS SÃO OBRIGATÓRIOS (a mesma lição de agosto). Duas das três
 * fichas da campanha só aparecem dentro do anexo:
 *
 *   • 29/08 06:56, Remates — o texto é só "A cliente está em processo de compra
 *     da propriedade, ainda não tem a IE". O RG anexado é de GISLEINE APARECIDA
 *     FERNANDES DA SILVA, CPF 622.433.731-49 — lead da campanha entrado 39
 *     minutos antes, às 06:17.
 *   • 31/08 11:22, Remates — sete documentos sem uma linha de texto com nome.
 *     A declaração de IRPF e os comprovantes do IAGRO são de EVALDO LUIZ NUNES
 *     ESCOBAR, CPF 372.576.921-49 — o lead entrou como "Rui Escobar" em 30/08.
 *
 * Só a ficha do Tiago Kyschel veio identificada em texto. Sem abrir anexo esta
 * lista teria 1 registro em vez de 3, e a taxa MQL→cadastro cairia de 37,5%
 * para 12,5% sem que nada disso tivesse acontecido de verdade.
 *
 * CASAMENTO COM O LEAD: os três casam por CPF contra a aba LEADS GERAIS da
 * planilha, filtrada por campaign_id 120250144945610708. CPF é prova; nenhuma
 * das três depende de nome.
 *
 * VEREDITO, transcrito da resposta da leiloeira no grupo:
 *   aprovado — "Bom score, tem IE, [...] Aprovado!"
 *   recusado — a leiloeira nega no grupo. Nos leilões de MS a inscrição
 *              estadual trava: "para os leilões do MS nao conseguimos sem a
 *              I.E, documento obrigatório para emissão de nota dentro do
 *              estado".
 *
 * AS OUTRAS NOVE FICHAS DA JANELA não entram: nenhuma casa com lead da
 * campanha, por CPF, telefone ou nome. Ficam registradas aqui para que a
 * conferência não precise refazer a leitura — e porque duas delas são do
 * próprio leilão Melhoradores, vindas de fora da mídia.
 */

/** As três fichas que são de lead da campanha. */
export const CADASTROS_CAMPANHA = [
    {
        nome: 'Tiago Marcel Kyschel',
        cpf: '095.528.489-97',
        leadNome: 'Tiago Kyschel',
        leadEm: '2026-08-27T21:32',
        grupo: 'Cadastros Bula e Programa + Cadastros Bula Remates',
        submetidaEm: '2026-08-28T13:18',
        para: 'LEILÃO MELHORADORES ESPECIAL 30 ANOS (29/08)',
        prova: 'texto: "Tiago marcel kyschel / CPF 09552848997 / Verifica, por favor, se esse cliente tem cadastro ativo"',
        status: 'recusado',
        veredito: '"score dele é bom, mas nao encontramos i.e." — sem I.E. não passa em leilão de MS',
    },
    {
        nome: 'Gisleine Aparecida Fernandes da Silva',
        cpf: '622.433.731-49',
        leadNome: 'Gisleine Fernandes',
        leadEm: '2026-08-29T06:17',
        grupo: 'Cadastros Bula Remates',
        submetidaEm: '2026-08-29T06:56',
        para: 'LEILÃO MELHORADORES ESPECIAL 30 ANOS (29/08)',
        prova: 'anexo: RG do Estado de Mato Grosso, registro 0792899-8, CPF 622.433.731-49',
        status: 'recusado',
        veredito: '"para os leilões do MS nao conseguimos sem a I.E" — a cliente ainda está comprando a propriedade',
    },
    {
        nome: 'Evaldo Luiz Nunes Escobar',
        cpf: '372.576.921-49',
        leadNome: 'Rui Escobar',
        leadEm: '2026-08-30T08:28',
        grupo: 'Cadastros Bula Remates',
        submetidaEm: '2026-08-31T12:22',
        para: 'carteira geral (o leilão da campanha já tinha passado)',
        prova: 'anexos: IRPF 2026 e três comprovantes de saldo do IAGRO/MS, CPF 372.576.921-49',
        status: 'aprovado',
        veredito: '"Bom score, tem IE, pelo visto bom de mexida mandou a documentação toda certinho. Aprovado!"',
    },
]

/** As demais fichas da janela — nenhuma casa com lead da campanha. */
export const CADASTROS_FORA_DA_CAMPANHA = [
    { nome: 'Alexandre Soares de Carvalho', cpf: '710.569.631-15', em: '2026-08-27', para: 'Terra Brava', nota: 'comprou 1 lote no Melhoradores em 29/08, mas não é lead de campanha nenhuma' },
    { nome: 'Hatila Silva Paes', cpf: '041.342.311-59', em: '2026-08-27', para: 'Terra Brava', nota: 'aprovado' },
    { nome: 'Jessé Martins Mendes', cpf: '040.149.451-97', em: '2026-08-28', para: 'eRural', nota: 'restrições e protestos — liberado 1 lote com cautela' },
    { nome: 'Claudio Eduardo Pupim', cpf: '226.263.838-13', em: '2026-08-29', para: 'leilão de MS', nota: 'aprovado' },
    { nome: 'Ejamal Muhd Shihadeh Khalil', cpf: '666.740.349-91', em: '2026-08-29', para: 'consulta de cadastro existente', nota: 'já tinha cadastro' },
    { nome: 'Reginaldo Leandro da Silva', cpf: '401.932.171-04', em: '2026-08-29', para: 'LEILÃO MELHORADORES (29/08)', nota: 'ficha aberta pela equipe — "Cadastro novo pra o leilao melhoradores"; I.E. 137211708; não é lead de campanha' },
    { nome: 'Ademir Krause', cpf: '603.232.052-91', em: '2026-08-30', para: 'Ventres VIP Matinha', nota: 'não aprovado, restrições de CPF' },
    { nome: 'Ana Vitoria Martins Lagares', cpf: '064.410.281-07', em: '2026-08-30', para: 'Ventres VIP Matinha', nota: '—' },
    { nome: 'Analice Martins da Silva', cpf: '995.283.121-87', em: '2026-08-31', para: 'carteira geral', nota: 'cadastro ruim; atendida pela Laila' },
]
