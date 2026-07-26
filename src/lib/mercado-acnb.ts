/**
 * RANKING ACNB — Criador/Expositor de Nelore.
 *
 * Não é agenda nem preço: é GENTE. Cruzado com `clientes` e `crm_leads`, vira a
 * lista de prospecção mais qualificada que existe — os maiores criadores da raça
 * por mérito público (pontos de pista), com a marcação de quem já é nosso.
 *
 * A ACNB expõe o ranking por uma API pública (a mesma que o site consome):
 *   POST https://srvneapp002.eastus.cloudapp.azure.com/Ranking/Resultado/PesquisaRankingCE
 * Devolve HTML de tabela, 20 linhas por página, com o nome e o id da pessoa em
 * inputs escondidos — que é justamente o que precisamos.
 *
 * Custo ZERO: não passa por Apify.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const BASE = 'https://srvneapp002.eastus.cloudapp.azure.com'
const UA = 'BulaAssessoria-RadarMercado/1.0 (+https://bulaassessoria.com)'

/** Calendário nacional vigente. `null` = descobrir sozinho o mais recente. */
export interface AcnbOpcoes {
    calendarioId?: number | null
    /** 1 = Nelore (2 = Mocho, 6 = Pelagem). */
    raca?: number
    /** Teto de páginas — o ranking nacional cabe em 3, isto é só cinto de segurança. */
    maxPaginas?: number
}

export interface CriadorRanking {
    posicao: number | null
    nome: string
    pessoaId: string | null
    pontos: number | null
}

export const normalizaNome = (s: string): string =>
    String(s ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\b(ltda|s\/a|sa|me|epp|eireli|agropecuaria|agropec|fazenda|faz|agro)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

function decode(s: string): string {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
}

/** Calendário mais recente do ranking nacional (o site chama isto no load). */
export async function calendarioAtual(): Promise<{ id: number; nome: string } | null> {
    try {
        const r = await fetch(`${BASE}/Resultado/CalendariosPorRegional/?idRegional=1`, {
            headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000),
        })
        if (!r.ok) return null
        const j = await r.json() as { calendarios?: Array<{ Id: number; Nome: string }> }
        const c = j.calendarios?.[0]
        return c ? { id: c.Id, nome: c.Nome } : null
    } catch {
        return null
    }
}

/**
 * Extrai as linhas da tabela. Cada `<tr>` traz posição, o nome em input
 * escondido (mais confiável que o texto solto da célula, que vem com quebras) e
 * os pontos no formato brasileiro "7.964,00".
 */
export function parseRankingHtml(html: string): CriadorRanking[] {
    const out: CriadorRanking[] = []
    for (const [, tr] of html.matchAll(/<tr[^>]*class="gridrow[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)) {
        const nome = /name="nomePessoaLinha"\s+value="([^"]*)"/.exec(tr)?.[1]
        if (!nome) continue
        const pessoaId = /name="idPessoaLinha"\s+value="([^"]*)"/.exec(tr)?.[1] ?? null
        const posicao = /class="text-center">(\d+)<\/td>/.exec(tr)?.[1]
        const pontosBr = /class="text-right">\s*([\d.,]+)\s*<\/td>/.exec(tr)?.[1]
        const pontos = pontosBr ? Number(pontosBr.replace(/\./g, '').replace(',', '.')) : null
        out.push({
            posicao: posicao ? Number(posicao) : null,
            nome: decode(nome).replace(/\s+/g, ' ').trim(),
            pessoaId,
            pontos: Number.isFinite(pontos as number) ? (pontos as number) : null,
        })
    }
    return out
}

/** Busca o ranking completo, paginando até a página vir vazia. */
export async function buscarRankingAcnb(opts: AcnbOpcoes = {}): Promise<{
    calendario: { id: number; nome: string } | null
    criadores: CriadorRanking[]
    paginas: number
}> {
    const cal = opts.calendarioId
        ? { id: opts.calendarioId, nome: '' }
        : await calendarioAtual()
    if (!cal) return { calendario: null, criadores: [], paginas: 0 }

    const raca = opts.raca ?? 1
    const max = opts.maxPaginas ?? 10
    const criadores: CriadorRanking[] = []
    const vistos = new Set<string>()
    let paginas = 0

    for (let pagina = 1; pagina <= max; pagina++) {
        const body = new URLSearchParams({
            possuiCampeonatoSupremo: '0',
            pagina: String(pagina),
            paginaAnterior: '1',
            campeonato: '1',
            sexoAnimalPesquisa: '', campeonatoAnimalPesquisa: '',
            pessoa: '', evento: '', animal: '',
            ranking: 'CE', nivel: '',
            somenteNovosCriadoresExpositores: '0',
            associacao: '1',
            calendario: String(cal.id),
            raca: String(raca),
            nome: '', nomeAnimalPesquisar: '', idAnimalPesquisar: '',
            turnoSelecionado: '1', associacaoNacioanl: '1', calendarioMaior2014: '1',
        })
        let html: string
        try {
            const r = await fetch(`${BASE}/Ranking/Resultado/PesquisaRankingCE`, {
                method: 'POST',
                headers: {
                    'User-Agent': UA,
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    Referer: 'https://www.nelore.org.br/',
                },
                body: body.toString(),
                signal: AbortSignal.timeout(30_000),
            })
            if (!r.ok) break
            html = await r.text()
        } catch {
            break
        }
        paginas++
        const lote = parseRankingHtml(html)
        // Página além do fim repete a última ou volta vazia — o dedup por nome
        // encerra o laço sem depender de o servidor sinalizar "acabou".
        const novos = lote.filter(c => !vistos.has(c.nome))
        if (novos.length === 0) break
        novos.forEach(c => vistos.add(c.nome))
        criadores.push(...novos)
    }

    return { calendario: cal, criadores, paginas }
}

/* ─── Cruzamento com a nossa base ────────────────────────────────────────── */

export interface ResultadoCruzamento {
    gravados: number
    clientes: number
    leads: number
    relacionados: number
    ausentes: number
}

/**
 * Palavras que NÃO servem para achar parentesco: ou são societárias, ou são
 * sobrenomes tão comuns no Brasil que casariam com meia base.
 */
const TOKEN_INUTIL = new Set([
    'silva', 'santos', 'souza', 'sousa', 'oliveira', 'pereira', 'ferreira', 'costa',
    'rodrigues', 'almeida', 'carvalho', 'gomes', 'martins', 'araujo', 'ribeiro',
    'alves', 'lima', 'barbosa', 'rocha', 'dias', 'nunes', 'moreira', 'cardoso',
    'teixeira', 'correia', 'correa', 'mendes', 'freitas', 'cruz', 'ramos',
    'junior', 'filho', 'neto', 'sobrinho', 'irmaos', 'condominio', 'rural',
    'producoes', 'eventos', 'comercio', 'participacoes', 'empreendimentos',
])

/**
 * Um token só serve de pista de parentesco se for RARO na nossa base. "Lucente"
 * aparece em 3 leads e é sinal; "Santos" aparece em centenas e é ruído. O corte
 * sai do próprio banco, não de uma lista fixa — é o que impediu a explosão de
 * falso positivo que uma busca por sobrenome produz.
 */
const RARO_ATE = 6

/**
 * Grava o ranking e marca, para cada nome, se ele já é CLIENTE, se está no CRM
 * como LEAD, ou se está AUSENTE da base — que é a coluna que interessa.
 *
 * O casamento é por nome normalizado, com sufixos societários removidos
 * ("LTDA", "AGROPECUÁRIA"…): sem isso "LUCENTE & LUCENTE AGROPECUÁRIA LTDA."
 * nunca casaria com "Lucente" do CRM.
 */
export async function salvarRankingAcnb(
    supabase: SupabaseClient,
    calendario: { id: number; nome: string } | null,
    criadores: CriadorRanking[],
): Promise<ResultadoCruzamento> {
    if (!criadores.length) return { gravados: 0, clientes: 0, leads: 0, relacionados: 0, ausentes: 0 }

    // PostgREST corta em 1000 linhas, `.limit(20000)` NÃO resolve — tem que
    // paginar por .range(). Sem isto o índice cobria só os 1000 primeiros leads
    // e o cruzamento devolvia "não temos" para gente que temos.
    const leadsTodos: Array<{ id: string; nome: string }> = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
            .from('crm_leads').select('id, nome').eq('arquivado', false).range(from, from + 999)
        if (error) break
        leadsTodos.push(...((data ?? []) as Array<{ id: string; nome: string }>))
        if (!data || data.length < 1000) break
    }
    const cliRes = await supabase.from('clientes').select('match_key, nome')
    const leadRes = { data: leadsTodos }

    const porCliente = new Map<string, string>()
    for (const c of cliRes.data ?? []) {
        const x = c as { match_key: string; nome: string }
        const k = normalizaNome(x.nome || x.match_key)
        if (k && !porCliente.has(k)) porCliente.set(k, x.match_key)
    }
    const porLead = new Map<string, string>()
    for (const l of leadRes.data ?? []) {
        const x = l as { id: string; nome: string }
        const k = normalizaNome(x.nome)
        if (k && !porLead.has(k)) porLead.set(k, x.id)
    }

    // Dois índices. `porToken` é quem carrega o token em QUALQUER posição.
    // `comoPrimeiroNome` conta quantas vezes ele aparece como PRIMEIRO nome —
    // é o detector de prenome. Sem ele o cruzamento casava "HENRIQUE E JULIANO
    // PRODUÇÕES" com "Juliano Silva", que não significa absolutamente nada.
    const porToken = new Map<string, Array<{ id: string; nome: string }>>()
    const comoPrimeiroNome = new Map<string, number>()
    for (const l of leadRes.data ?? []) {
        const x = l as { id: string; nome: string }
        const partes = normalizaNome(x.nome).split(' ').filter(Boolean)
        if (partes.length) {
            comoPrimeiroNome.set(partes[0], (comoPrimeiroNome.get(partes[0]) ?? 0) + 1)
        }
        for (const tk of new Set(partes)) {
            if (tk.length < 5 || TOKEN_INUTIL.has(tk)) continue
            if (!porToken.has(tk)) porToken.set(tk, [])
            porToken.get(tk)!.push({ id: x.id, nome: x.nome })
        }
    }
    /** Prenome comum não é pista de parentesco — é homonímia. */
    const ehPrenome = (tk: string) => (comoPrimeiroNome.get(tk) ?? 0) >= 3

    let clientes = 0, leads = 0, relacionados = 0, ausentes = 0
    const linhas = criadores.map(c => {
        const norm = normalizaNome(c.nome)
        const clienteKey = porCliente.get(norm) ?? null
        const leadId = clienteKey ? null : (porLead.get(norm) ?? null)

        // Parentesco só é procurado quando não houve casamento direto.
        let parentes: Array<{ id: string; nome: string; token: string }> = []
        if (!clienteKey && !leadId) {
            for (const tk of new Set(norm.split(' '))) {
                if (tk.length < 5 || TOKEN_INUTIL.has(tk)) continue
                if (ehPrenome(tk)) continue                            // prenome ≠ parentesco
                const achados = porToken.get(tk)
                if (!achados || achados.length > RARO_ATE) continue     // token comum = ruído
                // O token também não pode ser o PRIMEIRO nome do contato achado:
                // "Abreu" valendo por "Bruno Abreu Bastos" é sobrenome (serve),
                // mas casar pelo prenome dele não serviria.
                const uteis = achados.filter(a => normalizaNome(a.nome).split(' ')[0] !== tk)
                if (!uteis.length) continue
                parentes.push(...uteis.slice(0, 4).map(a => ({ ...a, token: tk })))
            }
            parentes = parentes.slice(0, 6)
        }

        const situacao = clienteKey ? 'cliente'
            : leadId ? 'lead'
                : parentes.length ? 'relacionado' : 'ausente'
        if (situacao === 'cliente') clientes++
        else if (situacao === 'lead') leads++
        else if (situacao === 'relacionado') relacionados++
        else ausentes++
        return {
            relacionados: parentes,
            associacao: 'ACNB',
            calendario_id: calendario?.id ?? null,
            calendario_nome: calendario?.nome ?? null,
            raca: 'Nelore',
            tipo: 'criador',
            posicao: c.posicao,
            nome: c.nome,
            nome_norm: norm,
            pessoa_id: c.pessoaId,
            pontos: c.pontos,
            situacao,
            cliente_key: clienteKey,
            crm_lead_id: leadId,
            // Fingerprint inclui o calendário: o ranking de 2025/2026 é outro
            // registro histórico, não uma atualização do de 2023/2024.
            fingerprint: `acnb|${calendario?.id ?? 0}|nelore|criador|${norm}`,
            coletado_em: new Date().toISOString(),
        }
    })

    const { error } = await supabase.from('mercado_criadores').upsert(linhas, { onConflict: 'fingerprint' })
    if (error) throw new Error(error.message)
    return { gravados: linhas.length, clientes, leads, relacionados, ausentes }
}
