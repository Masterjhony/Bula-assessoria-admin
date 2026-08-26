/**
 * Operação & crescimento do dashboard principal — o que era o "Dashboard de
 * Growth" numa página só dele.
 *
 * A conta é feita AQUI, no servidor, e o que viaja para o browser é o resultado.
 * O painel antigo recebia os ~4,3 mil leads inteiros para contar no cliente; na
 * página de entrada do sistema isso é megabyte de JSON em toda visita. Aqui
 * saem quatro números por dia e uma lista de oito linhas.
 *
 * O DIA DO LEAD É `data_entrada`, e só cai em `created_at` quando não há
 * entrada declarada: a importação da planilha gravou 472 cards de uma vez, e
 * pelo `created_at` todos eles empilhariam num único dia que não aconteceu.
 *
 * O dia é o dia de São Paulo, não o UTC — um cadastro aprovado às 21h de
 * terça é de terça para quem trabalha aqui, e do UTC seria de quarta.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Fontes de lista fria / agenda importada — nunca são levantada de mão. */
const FONTES_FRIAS = new Set(['planilha', 'whatsapp-contatos'])

export type DiaDoCrescimento = {
    dia: string
    leads: number
    mql: number
    submetidos: number
    aprovados: number
}

export type CadastroRecente = {
    nome: string
    leiloeira: string
    status: string
    quando: string | null
}

export type Crescimento = {
    dias: DiaDoCrescimento[]
    cadastros: CadastroRecente[]
    /** Totais da janela, para o cabeçalho de cada gráfico. */
    janela: { dias: number; leads: number; mql: number; submetidos: number; aprovados: number }
    /** Fila: submetido e ainda sem decisão da leiloeira. */
    aguardandoDecisao: number
}

const SP = 'America/Sao_Paulo'
/** ISO → 'AAAA-MM-DD' no fuso de São Paulo (en-CA já devolve nesse formato). */
function diaSP(iso: string | null | undefined): string | null {
    if (!iso) return null
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-CA', { timeZone: SP })
}

type LinhaLead = { data_entrada: string | null; created_at: string | null; is_mql: boolean | null; source: string | null; origem: string | null }
type LinhaCadastro = {
    cliente_key: string | null; leiloeira_id: string | null; status: string | null
    enviado_at: string | null; decidido_at: string | null; aprovado_at: string | null; created_at: string | null
}

export async function montaCrescimento(
    supabase: SupabaseClient,
    janelaDias = 30,
): Promise<Crescimento> {
    const hojeSP = new Date().toLocaleDateString('en-CA', { timeZone: SP })
    const inicio = new Date(`${hojeSP}T12:00:00Z`)
    inicio.setDate(inicio.getDate() - (janelaDias - 1))
    const desde = inicio.toLocaleDateString('en-CA', { timeZone: SP })

    // Um lead entra na janela por `data_entrada` OU por `created_at` — quem não
    // tem entrada declarada só existe pela data em que o card nasceu.
    const [{ data: leadsRaw }, { data: cadRaw }, { data: leiloeirasRaw }] = await Promise.all([
        supabase.from('crm_leads')
            .select('data_entrada, created_at, is_mql, source, origem')
            .or(`data_entrada.gte.${desde},created_at.gte.${desde}`)
            .limit(5000),
        supabase.from('cliente_leiloeira_cadastro')
            .select('cliente_key, leiloeira_id, status, enviado_at, decidido_at, aprovado_at, created_at')
            .order('created_at', { ascending: false })
            .limit(2000),
        supabase.from('leiloeiras').select('id, nome'),
    ])

    const dias = new Map<string, DiaDoCrescimento>()
    for (let i = 0; i < janelaDias; i++) {
        const d = new Date(`${desde}T12:00:00Z`)
        d.setDate(d.getDate() + i)
        const dia = d.toLocaleDateString('en-CA', { timeZone: SP })
        dias.set(dia, { dia, leads: 0, mql: 0, submetidos: 0, aprovados: 0 })
    }
    const somaNoDia = (iso: string | null | undefined, campo: keyof DiaDoCrescimento, n = 1) => {
        const dia = diaSP(iso)
        const alvo = dia ? dias.get(dia) : null
        if (alvo) (alvo[campo] as number) += n
    }

    for (const l of (leadsRaw ?? []) as LinhaLead[]) {
        const fonte = String(l.source || l.origem || '').trim()
        if (FONTES_FRIAS.has(fonte)) continue
        const quando = l.data_entrada || l.created_at
        somaNoDia(quando, 'leads')
        if (l.is_mql) somaNoDia(quando, 'mql')
    }

    const nomeDaLeiloeira = new Map<string, string>(
        ((leiloeirasRaw ?? []) as { id: string; nome: string }[]).map(l => [l.id, l.nome]))

    const cadastros = (cadRaw ?? []) as LinhaCadastro[]
    for (const c of cadastros) {
        somaNoDia(c.enviado_at, 'submetidos')
        // A leiloeira aprovou: `decidido_at` é o carimbo da decisão; `aprovado_at`
        // é o legado de quando a aprovação era registrada à mão.
        if (c.status === 'aprovado') somaNoDia(c.decidido_at || c.aprovado_at, 'aprovados')
    }

    // ── Últimos cadastros, pelo movimento mais recente de cada ficha ──────────
    const movimento = (c: LinhaCadastro) =>
        c.decidido_at || c.aprovado_at || c.enviado_at || c.created_at || ''
    const recentes = [...cadastros].sort((a, b) => movimento(b).localeCompare(movimento(a))).slice(0, 8)
    const chaves = [...new Set(recentes.map(c => c.cliente_key).filter(Boolean) as string[])]
    const { data: clientesRaw } = chaves.length
        ? await supabase.from('clientes').select('match_key, nome').in('match_key', chaves)
        : { data: [] as { match_key: string; nome: string }[] }
    const nomeDoCliente = new Map<string, string>(
        ((clientesRaw ?? []) as { match_key: string; nome: string }[]).map(c => [c.match_key, c.nome]))

    const lista = dias.size ? [...dias.values()] : []
    return {
        dias: lista,
        cadastros: recentes.map(c => ({
            nome: nomeDoCliente.get(c.cliente_key || '') || c.cliente_key || 'Sem nome',
            leiloeira: nomeDaLeiloeira.get(c.leiloeira_id || '') || '—',
            status: c.status || 'pendente',
            quando: movimento(c) || null,
        })),
        janela: {
            dias: janelaDias,
            leads: lista.reduce((s, d) => s + d.leads, 0),
            mql: lista.reduce((s, d) => s + d.mql, 0),
            submetidos: lista.reduce((s, d) => s + d.submetidos, 0),
            aprovados: lista.reduce((s, d) => s + d.aprovados, 0),
        },
        aguardandoDecisao: cadastros.filter(c => c.status === 'enviado').length,
    }
}
