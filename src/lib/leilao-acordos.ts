// ─────────────────────────────────────────────────────────────────────────
// Acordos comerciais por leilão (fonte: F.xlsx do chefe, 2026-05-15)
// ─────────────────────────────────────────────────────────────────────────
//
// O acordo NÃO é regra geral. Cada leilão tem percentuais e bases próprias:
//   • pct_faturamento  = % sobre o FATURAMENTO TOTAL DA LEILOEIRA (leilão inteiro)
//   • pct_venda_cobertura = % sobre a VENDA DA COBERTURA Fórmula+Bula (vgv_total)
//   • descricao = texto livre conforme F.xlsx
//
// Receita Bula = (pct_faturamento × faturamento_leiloeira)
//              + (pct_venda_cobertura × vgv_cobertura)
//
// Este módulo é fallback: quando a migration `add_acordo_to_fechamento.sql`
// rodar, os campos correspondentes do DB têm precedência. Útil pra UI
// renderizar o acordo já hoje (antes da migration).

export interface AcordoLeilao {
    /** % decimal sobre o faturamento total da leiloeira. Ex.: 0.0033 = 0,33%. */
    pct_faturamento?: number;
    /** % decimal sobre a venda da cobertura (vgv_total). Ex.: 0.03 = 3%. */
    pct_venda_cobertura?: number;
    /** Texto livre conforme F.xlsx. */
    descricao: string;
}

/** Mapeamento id → acordo. Snapshot 2026-05-15 da F.xlsx. */
export const ACORDOS_POR_FECHAMENTO_ID: Record<string, AcordoLeilao> = {
    // 6º Mega EAO Fêmeas — 02/05/2026
    '145dbec3-8a8f-4463-8076-a2cca5be2876': {
        pct_faturamento: 0.0033,
        descricao: '0,33% do faturamento total do leilão',
    },
    // 6º Mega EAO Touros — 03/05/2026
    '293de295-32b9-4256-976e-ef344b2667b8': {
        pct_faturamento: 0.0033,
        descricao: '0,33% do faturamento total do leilão',
    },
    // 2º Leilão Pintado Raiz — 05/05/2026
    'b6370f22-daa4-4f1c-b9a4-2511e5715c0a': {
        pct_faturamento: 0.01,
        descricao: '1% do faturamento total do leilão',
    },
    // Leilão Matinha Embrio — 05/05/2026
    '0e0eb3a2-6701-4662-9ae5-44172d3c8b72': {
        pct_venda_cobertura: 0.05,
        descricao: '5% da venda da cobertura (Fórmula+Bula)',
    },
    // Matrizes Fazenda Santa Fé — 07/05/2026
    '3314a71a-dd01-423e-b559-9e9a49fdbf83': {
        pct_faturamento: 0.015,
        pct_venda_cobertura: 0.03,
        descricao: '1,5% do faturamento total + 3% da venda da cobertura',
    },
    // 32º Leilão 4R — 09/05/2026
    'b3d1c05c-2d37-4f9d-b1e4-a21c12540619': {
        pct_faturamento: 0.01,
        descricao: '1% do faturamento total do leilão',
    },
    // Excelência Santa Nazaré — 14/05/2026
    'a9f50214-603d-4580-b3be-602a7065ec37': {
        pct_faturamento: 0.01,
        pct_venda_cobertura: 0.03,
        descricao: '1% do faturamento total + 3% da venda da cobertura',
    },
};

/**
 * Resolve o acordo de um fechamento. Prioridade:
 *   1. Campos do próprio fechamento (acordo_pct_faturamento etc. — após migration)
 *   2. Mapeamento canônico em ACORDOS_POR_FECHAMENTO_ID
 *   3. null
 */
export function resolverAcordo(f: {
    id?: string | null;
    acordo_pct_faturamento?: number | null;
    acordo_pct_venda_cobertura?: number | null;
    acordo_descricao?: string | null;
}): AcordoLeilao | null {
    if (
        f.acordo_descricao
        || (f.acordo_pct_faturamento != null)
        || (f.acordo_pct_venda_cobertura != null)
    ) {
        return {
            pct_faturamento: f.acordo_pct_faturamento ?? undefined,
            pct_venda_cobertura: f.acordo_pct_venda_cobertura ?? undefined,
            descricao: f.acordo_descricao ?? '—',
        };
    }
    if (f.id && ACORDOS_POR_FECHAMENTO_ID[f.id]) return ACORDOS_POR_FECHAMENTO_ID[f.id];
    return null;
}

/**
 * Receita Bula esperada conforme o acordo e os inputs (faturamento da
 * leiloeira + vgv cobertura). Retorna null se não há acordo cadastrado.
 */
export function calcularReceitaBulaEsperada(
    acordo: AcordoLeilao | null,
    faturamentoLeiloeira: number | null | undefined,
    vgvCobertura: number | null | undefined,
): number | null {
    if (!acordo) return null;
    const a = (acordo.pct_faturamento && faturamentoLeiloeira) ? acordo.pct_faturamento * faturamentoLeiloeira : 0;
    const b = (acordo.pct_venda_cobertura && vgvCobertura) ? acordo.pct_venda_cobertura * vgvCobertura : 0;
    const total = a + b;
    return total > 0 ? total : null;
}

/**
 * Formata o acordo de forma curta pra badge. Ex: "0,33% fat." ou "1% + 3%".
 */
export function formatarAcordoCurto(acordo: AcordoLeilao | null): string {
    if (!acordo) return '—';
    const fat = acordo.pct_faturamento ? `${(acordo.pct_faturamento * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% fat.` : '';
    const venda = acordo.pct_venda_cobertura ? `${(acordo.pct_venda_cobertura * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% venda` : '';
    if (fat && venda) return `${fat} + ${venda}`;
    return fat || venda || '—';
}
