/**
 * MÍDIA AO VIVO — Marketing API da Meta, quando houver token para isso.
 *
 * POR QUE ISTO ESTÁ DESLIGADO POR PADRÃO
 * Existem dois tokens da Meta nesta casa, e nenhum dos dois serve para ler
 * anúncios como está:
 *
 *   • o do conector que o Claude Code usa (cofre ~/.claude/.credentials.json)
 *     é restrito — a própria Meta responde "(#10) This app is not authorized to
 *     access the Graph API. It is restricted to MCP server access only";
 *   • o WHATSAPP_CLOUD_ACCESS_TOKEN é um System User que NÃO EXPIRA
 *     (expires_at: 0, usuário `whatsapp_bula_admin`, app "Automação zap"), mas
 *     nasceu só com escopo de WhatsApp. A Meta responde "(#200) Ad account
 *     owner has NOT grant ads_management or ads_read permission".
 *
 * Ou seja: falta permissão, não infraestrutura. Basta dar ao System User que já
 * existe acesso à conta de anúncios e gerar um token com `ads_read`. Colocando
 * o resultado em META_ADS_ACCESS_TOKEN, este módulo liga sozinho e o
 * investimento passa a atualizar como os leads. Sem a variável, o painel segue
 * usando o dump versionado — que é o comportamento de hoje.
 *
 * O fallback é sempre silencioso e para o lado seguro: qualquer erro devolve
 * null, e quem chama fica com o dump. Nunca mostrar mídia meio-viva.
 */
import 'server-only';

import type { MetaCampanha } from './funil-motor';

const GRAPH = 'https://graph.facebook.com/v21.0';
/** Conta CA2 — Bula 360, a que alimenta a planilha de leads. */
export const CONTA_FUNIL = '2705134163151418';
/** A entrega de mídia não muda de segundo em segundo, e a API tem limite de uso. */
const CACHE_MS = 10 * 60 * 1000;

let cache: { em: number; dados: MetaCampanha[] } | null = null;

function token(): string | null {
    // META_ADS_ACCESS_TOKEN é o caminho pretendido. O token do WhatsApp entra
    // como alternativa porque é o MESMO System User: se ele for regerado já com
    // ads_read marcado, passa a servir para os dois usos sem variável nova.
    return process.env.META_ADS_ACCESS_TOKEN || process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || null;
}

export function midiaAoVivoDisponivel(): boolean {
    return !!process.env.META_ADS_ACCESS_TOKEN;
}

interface AcaoInsight { action_type: string; value: string }
interface LinhaInsight {
    campaign_id: string; campaign_name: string;
    spend?: string; impressions?: string; reach?: string; clicks?: string;
    ctr?: string; cpc?: string; cpm?: string;
    outbound_clicks?: AcaoInsight[]; actions?: AcaoInsight[];
}

const num = (v: unknown): number => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};
const daAcao = (lista: AcaoInsight[] | undefined, tipo: string): number =>
    num(lista?.find(a => a.action_type === tipo)?.value);

/**
 * Entrega por campanha no período pedido. `null` quando não há token, quando a
 * Meta recusa, ou quando a resposta vem sem campanha nenhuma — nesses casos
 * quem chama continua com o dump versionado.
 */
export async function buscaMidiaAoVivo(
    desde = '2026-01-01',
    ate = new Date().toISOString().slice(0, 10),
): Promise<MetaCampanha[] | null> {
    const t = token();
    if (!t) return null;
    if (cache && Date.now() - cache.em < CACHE_MS) return cache.dados;

    try {
        const campos = [
            'campaign_id', 'campaign_name', 'spend', 'impressions', 'reach', 'clicks',
            'ctr', 'cpc', 'cpm', 'outbound_clicks', 'actions',
        ].join(',');
        const url = `${GRAPH}/act_${CONTA_FUNIL}/insights`
            + `?level=campaign&fields=${campos}`
            + `&time_range=${encodeURIComponent(JSON.stringify({ since: desde, until: ate }))}`
            + `&limit=200`;

        const [rInsights, rCampanhas] = await Promise.all([
            fetch(url, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' }),
            fetch(`${GRAPH}/act_${CONTA_FUNIL}/campaigns?fields=id,name,status,start_time&limit=200`,
                { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' }),
        ]);
        if (!rInsights.ok || !rCampanhas.ok) {
            const erro = await rInsights.json().catch(() => ({}));
            console.warn('[meta-ads-live] Meta recusou; seguindo com o dump:', JSON.stringify(erro).slice(0, 300));
            return null;
        }

        const insights = (await rInsights.json()) as { data?: LinhaInsight[] };
        const campanhas = (await rCampanhas.json()) as {
            data?: { id: string; name: string; status: string; start_time?: string }[]
        };
        const meta = new Map((campanhas.data ?? []).map(c => [c.id, c]));

        const dados: MetaCampanha[] = (insights.data ?? []).map(l => {
            const c = meta.get(l.campaign_id);
            return {
                id: l.campaign_id,
                nome: l.campaign_name ?? c?.name ?? '',
                status: c?.status ?? 'UNKNOWN',
                inicio: c?.start_time?.slice(0, 10) ?? '',
                investido: num(l.spend),
                impressoes: num(l.impressions),
                alcance: num(l.reach),
                cliques: num(l.clicks),
                cliquesSaida: daAcao(l.outbound_clicks, 'outbound_click') || null,
                acessos: daAcao(l.actions, 'landing_page_view') || null,
                leadsMeta: daAcao(l.actions, 'lead') || null,
                ctr: num(l.ctr),
                cpc: num(l.cpc),
                cpm: num(l.cpm),
            };
        });
        if (!dados.length) return null;

        cache = { em: Date.now(), dados };
        return dados;
    } catch (e) {
        console.warn('[meta-ads-live] falhou; seguindo com o dump:', e instanceof Error ? e.message : e);
        return null;
    }
}
