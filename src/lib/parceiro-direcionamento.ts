/**
 * DIRECIONAMENTO DE PARCEIRO — de quem é a comissão quando o comprador é "de fora".
 *
 * Existe um grupo de compradores que é **direcionado pelo Gustavo Rusa**. Eles são
 * anunciados e arrematados na pista por um assessor da Bula (quase sempre o Douglas,
 * às vezes o Fábio) e a mensagem no grupo "Lances Bula" diz literalmente
 * "Foi com Douglas Bispo da Bula Assessoria" — mas a comissão desse lote é do
 * **Rusa, a 5%**, e o assessor NÃO recebe os 2% dele.
 *
 * Pagar os dois é pagar 7% num leilão cuja receita é da ordem de 5% do VGV. A regra
 * está no áudio de 30/06 e na própria planilha de controle do Rusa
 * (`Controle_Gustavo_Rusa_Lances_Maio_Junho_2026.xlsx`, aba "Lances Rusa", que separa
 * "Assessor venda" de "Direcionamento"): *"Se pagar Rusa/Gustavo, não pagar Douglas
 * no mesmo caso, para evitar comissão dobrada."*
 *
 * Por isso a atribuição do lote **não pode sair do texto do grupo nem do
 * LOT_PISTEIRO do HastaPro** — os dois registram quem estava na pista. Quem manda é
 * o COMPRADOR. É o que esta tabela resolve.
 *
 * Fontes da lista: planilha de controle do Rusa (mai–jun/2026), lista de acerto do
 * chefe de 22/07/2026, observações dos CP de comissão do Rusa e confirmação do João
 * em 24/08/2026 (Anésio Santarém).
 *
 * PARA ADICIONAR UM COMPRADOR: uma entrada em COMPRADORES_DIRECIONADOS. Depois rode
 * `node scripts/aplica-direcionamento-parceiro.mts` para ver (e corrigir) os lotes já
 * lançados que passam a cair na regra.
 */

export type CompradorDirecionado = {
    /** Quem leva a comissão. Precisa existir em erp_folha_estrutura / assessor-comissao. */
    parceiro: string
    /** Nome canônico do comprador, para log e para a observação do fechamento. */
    comprador: string
    /** Casa contra "comprador · fazenda · cidade/UF" normalizado (sem acento, maiúsculo). */
    padroes: RegExp[]
    /** Se casar aqui, NÃO é este comprador — homônimos e armadilhas conhecidas. */
    excecoes?: RegExp[]
    fonte: string
}

export const PARCEIRO_RUSA = 'Gustavo Rusa'

export const COMPRADORES_DIRECIONADOS: readonly CompradorDirecionado[] = [
    {
        parceiro: PARCEIRO_RUSA,
        comprador: 'Dr. Celso Lopes (Nelore Grão Pará)',
        padroes: [/CELSO\s+LOPES/, /GRAO\s*PARA/, /FLOR\s+DE\s+MINAS/],
        // "Celso Camargo" e "Antonio Celso Chaves Gaiotto" são outras pessoas.
        excecoes: [/CELSO\s+CAMARGO/, /CHAVES\s+GAIOTTO/],
        fonte: 'planilha do Rusa mai–jun + lista do chefe 22/07',
    },
    {
        parceiro: PARCEIRO_RUSA,
        comprador: 'Pedro Pontes (Nelore São Caetano)',
        padroes: [/PEDRO\s+PONTES/, /SAO\s+CAETANO/],
        fonte: 'planilha do Rusa mai–jun + lista do chefe 22/07',
    },
    {
        parceiro: PARCEIRO_RUSA,
        comprador: 'Diego Benitah Batista (Fazenda Paraíso do Acará / Nelore FPA)',
        padroes: [/DIEGO\s+(BENITAH\s+)?BATISTA/, /PARAISO\s+DO\s+ACARA/, /NELORE\s+FPA\b/],
        fonte: 'planilha do Rusa (aba Lances Rusa, leilão Nelore FPA) + CP Flor do Aratau 30/06',
    },
    {
        parceiro: PARCEIRO_RUSA,
        comprador: 'Itajaí / Parazão (Welton Borges de Miranda e Gustavo Miranda)',
        // ⚠ NUNCA casar "Welton" sozinho: "Welton Costa de Brito" (Fazenda Maravilha,
        // Novo Repartimento/PA) é comprador legítimo do Douglas — Neloraço 25/07.
        padroes: [/WELTON\s+BORGES/, /GUSTAVO\s+MIRANDA/, /FAZENDA\s+ITAJAI/, /\bITAJAI\b/, /PARAZAO/],
        excecoes: [/WELTON\s+COSTA/, /WELTON\s+BORGES\s+DE\s+MIRANDA\s*\/\s*MARAVILHA/],
        fonte: 'planilha do Rusa mai–jun + lista do chefe 22/07 (JMP Bezerras, EAO Expozebu)',
    },
    {
        parceiro: PARCEIRO_RUSA,
        comprador: 'Alfredo José Cardoso (Fazenda Galopeira)',
        padroes: [/ALFREDO\s+JOSE\s+CARDOSO/, /GALOPEIRA/],
        fonte: 'lista do chefe 22/07 (Cachoeirão, JMP Touros 1004, MEAB) + planilha do Rusa de agosto',
    },
    {
        parceiro: PARCEIRO_RUSA,
        comprador: 'José Fabio (Nelore Pérola)',
        // ⚠ Só "JOSE FABIO". NUNCA casar "Fabio" solto: existem "Fabio Lopes da
        // Selaria Mineira", "Fabio Polizeli Brito" e "Fabio Machado" comprando pelo
        // Douglas — e "Fábio Omena" é assessor da casa.
        padroes: [/JOSE\s+FABIO/],
        fonte: 'planilha do Rusa de agosto/2026 (9 lotes, R$ 1,17 mi — comprador novo, 1ª compra em 16/08)',
    },
    {
        parceiro: PARCEIRO_RUSA,
        comprador: 'C+4',
        padroes: [/\bC\s*\+\s*4\b/],
        fonte: 'lista do chefe 22/07 (Cachoeirão, Naviraí Expozebu, JMP Bezerras, MEAB)',
    },
    {
        parceiro: PARCEIRO_RUSA,
        comprador: 'Lindoalmir / João Alfredo',
        padroes: [/LINDOALMIR/],
        fonte: 'lista do chefe 22/07 (JMP Touros lote 19/99)',
    },
    {
        parceiro: PARCEIRO_RUSA,
        comprador: 'Anésio Santarém (Fazenda Córrego da Onça)',
        // ⚠ NUNCA casar "SANTAREM" sozinho: é cidade do PA e aparece em endereço de
        // leilão (Pérolas do Tapajós é em Santarém/PA).
        padroes: [/ANESIO/, /CORREGO\s+DA\s+ONCA/],
        fonte: 'confirmado pelo João em 24/08/2026 (Guadalupe Touros 20/07)',
    },
]

const norm = (s: unknown) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim()

export type Direcionamento = { parceiro: string; comprador: string; fonte: string }

/**
 * Devolve o parceiro que leva a comissão do lote, ou null se o lote é do assessor
 * que o vendeu. Recebe os campos que existirem — comprador, fazenda, cidade/UF —
 * porque em vários lançamentos o nome vem só na fazenda ("A identificar · FAZENDA
 * SÃO CAETANO · PA" é o Pedro Pontes).
 */
export function parceiroDoComprador(...partes: (string | null | undefined)[]): Direcionamento | null {
    const alvo = norm(partes.filter(Boolean).join(' · '))
    if (!alvo) return null
    for (const c of COMPRADORES_DIRECIONADOS) {
        if (c.excecoes?.some((re) => re.test(alvo))) continue
        if (c.padroes.some((re) => re.test(alvo))) {
            return { parceiro: c.parceiro, comprador: c.comprador, fonte: c.fonte }
        }
    }
    return null
}

/** true se o lote é direcionado — açúcar para filtros. */
export const ehCompradorDeParceiro = (...partes: (string | null | undefined)[]): boolean =>
    parceiroDoComprador(...partes) !== null

/**
 * REGRA PRIMÁRIA — o direcionamento declarado na própria mensagem do grupo.
 *
 * Desde julho/2026 as mensagens vêm no formato:
 *   "Levamos lt 12 - 3600 - 1F
 *    Foi com Douglas Bispo da Bula Assessoria
 *    Com direcionamento técnico Gustavo Rusa"
 *
 * Quando a mensagem declara, ela manda — vale mais que a tabela de compradores,
 * porque é dito na hora da venda e cobre gente que não está em lista nenhuma
 * (em 21/08/2026 apareceu um "Erik Monteiro" que não existia em canto nenhum).
 *
 * Devolve o nome canônico do parceiro quando é alguém que sabemos comissionar, e
 * `{ desconhecido }` quando o texto declara um nome que não conhecemos — nesse caso
 * o lote NÃO é movido sozinho: fica com quem anunciou e o nome vai para a
 * observação do fechamento, para alguém decidir.
 */
const PARCEIROS_CONHECIDOS: Record<string, string> = {
    'GUSTAVO RUSA': PARCEIRO_RUSA,
    'RUSA': PARCEIRO_RUSA,
}

export function direcionamentoDeclarado(raw: string | null | undefined):
    { parceiro: string } | { desconhecido: string } | null {
    const txt = norm(raw)
    if (!txt) return null
    const m = txt.match(/DIRECIONAMENTO\s+(?:TECNICO\s+)?(?:D[EO]\s+)?([A-Z][A-Z ]{2,40})/)
    if (!m) return null
    const nome = m[1].replace(/\s+(FOI|LEVAMOS|COM|LOTE|LT)\b.*$/, '').replace(/\s+/g, ' ').trim()
    if (!nome) return null
    const canonico = PARCEIROS_CONHECIDOS[nome]
        ?? Object.entries(PARCEIROS_CONHECIDOS).find(([k]) => nome.startsWith(k))?.[1]
    return canonico ? { parceiro: canonico } : { desconhecido: nome }
}
