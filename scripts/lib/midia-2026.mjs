/**
 * INVESTIMENTO EM MÍDIA 2026 — o que está apurado, e com que janela.
 *
 * ⚠ ISTO É UM PISO, NÃO O NÚMERO OFICIAL. O conector da Meta (mcp.facebook.com)
 * está registrado nesta máquina mas responde 401 sem OAuth, e o token do
 * WhatsApp Cloud não tem `ads_read` — então não deu para puxar 2026 inteiro ao
 * vivo. O que existe aqui são os snapshots que a equipe tirou do conector em
 * datas diferentes, cada um com a janela que tinha na hora.
 *
 * Como cada número foi escolhido: quando a mesma campanha aparece em mais de um
 * snapshot, vale o MAIOR valor, porque o acumulado (date_preset=maximum) nunca
 * é menor que o de uma janela recortada. Isso deixa o total conservador para
 * baixo — campanha que continuou rodando depois do último snapshot está
 * subcontada, nunca superestimada.
 *
 * PARA FECHAR O NÚMERO OFICIAL: autenticar o conector (`/mcp` no Claude Code) e
 * puxar level=campaign, time_range 2026-01-01→hoje, nas contas CA1
 * (1155240258865815) e CA2 (2705134163151418). Substituir esta tabela.
 */

/** Fonte de cada linha, para o leitor poder cobrar. */
export const SNAPSHOTS = {
    max0714: 'conector Meta, date_preset=maximum, extraído 14/07/2026 (src/lib/meta-campaigns.ts)',
    jan0802: 'conector Meta, janela 01/07→02/08/2026, extraído 03/08/2026 (scripts/gera-relatorio-campanhas-2026-08-03.mjs)',
    jul0725: 'conector Meta, acumulado da campanha, extraído 25/07/2026 (scripts/gera-relatorio-meta-ads-2026-07-25.mjs)',
}

export const CAMPANHAS = [
    // conta CA2 — as campanhas da Bula, que alimentam a planilha de leads
    { conta: 'CA2', nome: 'LEADS - FORMS INST EAO — Cópia', inicio: '2026-07-08', investido: 2887.76, leads: 253, fonte: 'max0714' },
    { conta: 'CA2', nome: 'LEADS - FORMS INST EAO', inicio: '2026-07-08', investido: 35.39, leads: 0, fonte: 'max0714' },
    { conta: 'CA2', nome: 'LEADS - FORMS INST MAGDA Macho', inicio: '2026-06-25', investido: 1223.30, leads: 369, fonte: 'max0714' },
    { conta: 'CA2', nome: 'LEADS - FORMS INST PERPETUO', inicio: '2026-06-23', investido: 1124.55, leads: 557, fonte: 'max0714' },
    { conta: 'CA2', nome: '13/06 e 14/06 LEADS JMP SITE', inicio: '2026-06-09', investido: 2498.26, leads: 0, fonte: 'max0714' },
    { conta: 'CA2', nome: '13/06 e 14/06 LEADS JMP SITE — Cópia', inicio: '2026-06-11', investido: 606.91, leads: 31, fonte: 'max0714' },
    { conta: 'CA2', nome: 'Leilao JMP 13 14/06 Forms Insta', inicio: '2026-06-10', investido: 1286.53, leads: 110, fonte: 'max0714' },
    { conta: 'CA2', nome: 'LEAD - PERPETUO TOURO', inicio: '2026-07-24', investido: 2100.41, leads: 74, fonte: 'jan0802' },
    { conta: 'CA2', nome: 'LEADS - SAO GERALDO', inicio: '2026-07-29', investido: 1413.59, leads: 51, fonte: 'jan0802' },
    // conta CA1 — campanhas de leilão; o lead cai no formulário da leiloeira
    { conta: 'CA1', nome: 'CORTE PERPÉTUO / 13 de Julho', inicio: '2026-07-13', investido: 2706.57, leads: 154, fonte: 'jan0802' },
    { conta: 'CA1', nome: 'CORTE TUPÃ', inicio: '2026-07-01', investido: 345.48, leads: 7, fonte: 'jan0802' },
    { conta: 'CA1', nome: 'CORTE PERPÉTUO', inicio: '2026-07-01', investido: 270.56, leads: 20, fonte: 'jan0802' },
]

export const INVESTIDO_APURADO = Math.round(CAMPANHAS.reduce((a, c) => a + c.investido, 0) * 100) / 100
export const LEADS_META = CAMPANHAS.reduce((a, c) => a + (c.leads || 0), 0)
/** Data do snapshot mais novo — depois disso não há apuração. */
export const APURADO_ATE = '2026-08-02'
export const PRIMEIRA_CAMPANHA = '2026-06-09'
