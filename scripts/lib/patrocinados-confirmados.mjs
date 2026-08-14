/**
 * CONFIRMAÇÕES HUMANAS DE ORIGEM — as listas que os assessores mandaram.
 *
 * A diretoria enviou em 14/08 a relação de clientes "provenientes de
 * patrocinados" do Leonardo (Leozinho). Ela é fonte de PROVA para atribuição:
 * o assessor que atendeu afirma que o cliente veio de anúncio. Cada linha foi
 * conferida no ERP ao vivo (filial, leilão, lote, quantidade e valor) e o
 * resultado dessa conferência está anotado aqui, incluindo o que NÃO bateu.
 *
 * Regra de uso: a confirmação do assessor vale como origem (veio de anúncio),
 * mas NÃO como valor — o valor é sempre o do ERP, lote a lote.
 */

export const PATROCINADOS_LEOZINHO = [
    {
        nome: 'MARCELO CLEMENTE', listaAnimais: 13, listaValor: 240000,
        erpValor: 240000, erpAnimais: 13, filiais: ['2'],
        confere: true,
        leadOrigem: 'Landing JMP — Nelore 13/14 jun', leadData: '2026-06-13',
        nota: 'Lead em 13/06, arrematou 13 touros no 10º Leilão Nelore JMP em 14/06 — o leilão da própria campanha, no dia seguinte.',
    },
    {
        nome: 'PATRICK OLIVEIRA', listaAnimais: null, listaValor: 35100,
        erpValor: 35100, erpAnimais: 2, filiais: ['2'],
        confere: true,
        leadOrigem: 'Meta — LEADS - FORMS INST MAGDA Macho', leadData: '2026-06-28',
        nota: 'Também entrou pela Landing Touros em 27/07. Comprou 2 touros no Leilão Nelore Sorriso em 04/08.',
    },
    {
        nome: 'LAERCIO JOSE OLIVEIRA ALMEIDA', listaAnimais: 3, listaValor: 55800,
        erpValor: 55800, erpAnimais: 3, filiais: ['01'],
        confere: true,
        leadOrigem: 'Landing São Geraldo', leadData: '2026-07-30',
        nota: 'O caso mais limpo do ano: entrou pela Landing São Geraldo em 30/07 e arrematou 3 touros no Leilão São Geraldo em 01/08. Telefone do lead é idêntico ao do cadastro no ERP.',
    },
    {
        nome: 'JOSE LUIZ ANTUNES', listaAnimais: 1, listaValor: 18000,
        erpValor: 13500, erpAnimais: 1, filiais: ['01'],
        confere: false,
        leadOrigem: 'Cadastro habilitação / Base Unificada', leadData: null,
        nota: 'DUAS divergências: o ERP registra R$ 13.500 (não 18.000) no Leilão Kriz Matrizes de 16/06; e o cadastro dele não veio de anúncio — entrou por habilitação e pela base importada. Não conta como campanha.',
    },
    {
        nome: 'THALES DE OLIVEIRA', listaAnimais: 1, listaValor: 24600,
        erpValor: 24600, erpAnimais: 1, filiais: ['2'],
        confere: true,
        leadOrigem: null, leadData: null,
        nota: 'O valor bate exatamente (Leilão Fêmeas Jacamim, 07/06), mas ele não existe em nenhuma base de leads — nem planilha, nem CRM. É carteira do assessor, não campanha. (Grafia no ERP é THALES, com H — por isso não aparecia nas buscas por "TALES".)',
    },
]

/** Índice rápido por nome normalizado, para o cruzamento. */
export const CONFIRMADO_PELO_ASSESSOR = new Set(
    PATROCINADOS_LEOZINHO.filter(p => p.confere && p.leadOrigem).map(p => p.nome))
