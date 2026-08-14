/**
 * INVESTIMENTO EM MÍDIA 2026 — NÚMEROS OFICIAIS, puxados AO VIVO da Meta.
 *
 * Em 14/08/2026 o conector Meta Ads MCP ganhou acesso às contas da BM Bula 360
 * (CA1 1155240258865815, CA2 2705134163151418, Bula 1, Formula do Boi). Este
 * módulo agora lê o dump auditável dessa extração —
 * outputs/base-clientes-2026/fontes/meta-live-2026-08-14.json — e NÃO é mais um
 * "piso" de snapshots colados: é o acumulado real por campanha e por mês.
 *
 * ESCOPOS (não misturar — cada relatório diz qual usa):
 *   • funilDigitalBula  — CA2 inteira + CORTE PERPÉTUO/TUPÃ (CA1). São as
 *     campanhas cujos leads caem na planilha da Bula. R$ 19.054,30 (jun–14/08).
 *   • funilWhatsAppFDB  — abr–jun, conta Formula do Boi ("FB - funil whatsapp").
 *     Primeiras campanhas digitais do ano; lead caía direto no WhatsApp, não na
 *     planilha. R$ 1.261,19 / 239 leads.
 *   • ca1DivulgacaoLeiloes2026 — 64 campanhas da agência divulgando leilões
 *     (SóCriador, Cachoeirão, Tresmar…). Lead vai pra leiloeira. R$ 18.328,87.
 *   • awareness — Santa Casa + FB Leilao 09/05, R$ 279,30.
 *
 * O 16.500 que a diretoria usou no RELATÓRIO CAMPANHAS era o retrato de 02/08 do
 * escopo funil (nosso piso dava 16.499,31 — batia). Entre 02/08 e 14/08 as
 * campanhas PERPETUO TOURO/FEMEAS e SÃO GERALDO continuaram rodando e o
 * acumulado subiu para 19.054,30.
 *
 * Para reapurar: rodar ads_get_ad_entities (level=campaign, time_increment
 * monthly, 2026-01-01→hoje) nas 4 contas e regravar o JSON.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
export const META_LIVE = JSON.parse(fs.readFileSync(
    path.join(AQUI, '..', '..', 'outputs', 'base-clientes-2026', 'fontes', 'meta-live-2026-08-14.json'), 'utf8'))

/** Compatibilidade com os geradores antigos: lista plana das campanhas do funil. */
export const CAMPANHAS = META_LIVE.campanhasFunil.map(c => ({
    conta: c.conta,
    nome: c.nome,
    inicio: c.inicio ?? Object.keys(c.mensal)[0] + '-01',
    investido: c.total.investido,
    leads: c.total.leadsMeta ?? 0,
    impressoes: c.total.impressoes,
    cliques: c.total.cliques,
    alcance: c.total.alcance,
    mensal: c.mensal,
    obsLeads: c.total.obsLeads ?? null,
    fonte: 'live0814',
}))

export const SNAPSHOTS = {
    live0814: 'conector Meta Ads MCP, extração ao vivo 14/08/2026, time_range 2026-01-01→2026-08-14 (fontes/meta-live-2026-08-14.json)',
}

export const INVESTIDO_APURADO = META_LIVE.totais.funilDigitalBula.investido      // 19054.30
export const LEADS_META = META_LIVE.totais.funilDigitalBula.leadsMeta             // 1674
export const INVESTIDO_MENSAL = META_LIVE.totais.funilDigitalBula.mensal          // jun/jul/ago
export const FUNIL_WHATSAPP = META_LIVE.totais.funilWhatsAppFDB                    // abr–jun, FDB
export const DIVULGACAO_LEILOES = META_LIVE.ca1DivulgacaoLeiloes2026               // fora do funil
export const APURADO_ATE = '2026-08-14'
/** Primeira campanha digital do ano (funil WhatsApp na conta Formula do Boi). */
export const PRIMEIRA_CAMPANHA = '2026-04-23'
/** Primeira campanha do funil de cadastros (planilha). */
export const PRIMEIRA_CAMPANHA_FUNIL = '2026-06-09'
