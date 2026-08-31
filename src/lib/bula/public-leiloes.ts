import { supabaseAdmin } from '@/lib/supabase'
import type { BulaMembro, LeilaoStatus } from './types'
import { isLeilaoAtivo } from './leilao-tempo'
import { CRIATORIO_LOGOS, CRIATORIO_LOGOS_CLAROS } from './criatorio-logos'
import { listarDocumentos } from '@/lib/leilao-documentos'

/**
 * Leilao exposto na pagina publica (lp / agenda).
 *
 * IMPORTANTE - fronteira de dados: esta pagina e voltada ao cliente.
 * So expomos campos comerciais/operacionais publicos. Nunca incluir
 * dados financeiros internos (expectativa, meta_bula, realizado_bula,
 * acordo_comissao, comissoes) - esses vivem apenas no painel/ERP.
 */
/**
 * Documento do leilão exposto ao público (catálogo, e a ordem de entrada
 * quando o operador libera). Um leilão pode ter mais de um — "Catálogo Nelore"
 * e "Catálogo Tropa" no mesmo evento é rotina.
 */
export interface LeilaoDocumentoPublico {
    id: string
    tipo: string
    titulo: string
    url: string
    principal: boolean
}

export interface LeilaoPublico {
    id: string
    nome: string
    criador: string | null
    data: string
    horario: string | null
    tipo: string | null
    local: string | null
    animais: number | null
    modelo: string | null
    leiloeira: string | null
    condicao: string | null
    frete_gratis: string | null
    transmissao: string | null
    catalogo_url: string | null
    /** Todos os documentos públicos do leilão; o principal vem primeiro. */
    documentos: LeilaoDocumentoPublico[]
    img: string | null
    status: LeilaoStatus
    assessores: BulaMembro[]
}

export interface CriatorioParceiroPublico {
    nome: string
    slug: string
    logo: string | null
    /** Logo e arte branca (precisa invert no CSS para aparecer sobre tile claro). */
    logoClaro: boolean
    siteUrl: string | null
    totalLeiloes: number
}

// `cronograma_id` entra porque é por ele que se acham os documentos do leilão
// (`leilao_documentos`). É só o vínculo interno — não vai pro objeto público.
const PUBLIC_COLS =
    'id, nome, data, horario, tipo, local, animais, modelo, leiloeira, condicao, frete_gratis, transmissao, catalogo_url, img, status, cronograma_id'

/**
 * Documentos públicos dos leilões, por `cronograma_id`.
 *
 * A automação de catálogos anexa em `leilao_documentos` e espelha o principal
 * em `catalogo_url` — mas quem manda aqui é a tabela de documentos, porque só
 * ela tem o leilão com DOIS catálogos.
 */
async function documentosPorCronograma(
    supabase: ReturnType<typeof supabaseAdmin>,
    ids: Array<string | null | undefined>,
): Promise<Map<string, LeilaoDocumentoPublico[]>> {
    const limpos = [...new Set(ids.filter((v): v is string => !!v))]
    const bruto = await listarDocumentos(supabase, limpos, { somentePublicos: true })
    const saida = new Map<string, LeilaoDocumentoPublico[]>()
    for (const [cronoId, docs] of bruto) {
        saida.set(cronoId, docs.map(d => ({
            id: d.id,
            tipo: d.tipo,
            titulo: d.titulo,
            url: d.url,
            principal: d.principal,
        })))
    }
    return saida
}

/**
 * Documentos de um leilão, com rede de segurança: leilão sem vínculo com o
 * cronograma (ou anterior à automação) ainda mostra o `catalogo_url` avulso.
 */
function montarDocumentos(
    cronogramaId: string | null | undefined,
    catalogoUrl: string | null | undefined,
    mapa: Map<string, LeilaoDocumentoPublico[]>,
): LeilaoDocumentoPublico[] {
    const docs = (cronogramaId && mapa.get(cronogramaId)) || []
    // `catalogo_url` fora da lista significa catálogo posto na mão pelo form do
    // admin (que escreve a coluna direto). Ele entra também — melhor mostrar
    // duas vezes do que sumir com o catálogo que alguém colou lá.
    const lista = catalogoUrl && !docs.some(d => d.url === catalogoUrl)
        ? [...docs, { id: 'catalogo-url', tipo: 'catalogo', titulo: 'Catálogo', url: catalogoUrl, principal: docs.length === 0 }]
        : docs
    return numerarTitulosRepetidos(lista)
}

/**
 * Dois botões escritos igual não ajudam ninguém a escolher. Quando o título
 * derivado do nome do arquivo empata (dois "Catálogo" de arquivos diferentes),
 * numera para o visitante saber que são peças distintas.
 */
function numerarTitulosRepetidos(docs: LeilaoDocumentoPublico[]): LeilaoDocumentoPublico[] {
    const total = new Map<string, number>()
    for (const d of docs) total.set(d.titulo, (total.get(d.titulo) ?? 0) + 1)
    const visto = new Map<string, number>()
    return docs.map(d => {
        if ((total.get(d.titulo) ?? 0) < 2) return d
        const n = (visto.get(d.titulo) ?? 0) + 1
        visto.set(d.titulo, n)
        return { ...d, titulo: `${d.titulo} ${n}` }
    })
}

const PUBLIC_STATUSES: LeilaoStatus[] = ['confirmado']

function hasSupabaseAdminConfig(): boolean {
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

const CRIATORIO_REFERENCIAS: Record<string, { siteUrl: string }> = {
    'fazenda camparino': { siteUrl: 'https://fazendacamparino.com.br/' },
    'ls agropecuaria': { siteUrl: 'https://fazendals.com.br/' },
    'nelore katayama': { siteUrl: 'https://www.katayamapecuaria.com.br/' },
    'fazenda santa nice': { siteUrl: 'https://www.santanice.com.br/' },
    'santa nice': { siteUrl: 'https://www.santanice.com.br/' },
    'terra brava agropecuaria': { siteUrl: 'https://terrabrava.com.br/' },
}

function todaySaoPaulo(): string {
    const { year, month, day } = datePartsSaoPaulo(new Date())
    return `${year}-${month}-${day}`
}

function datePartsSaoPaulo(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
    return { year: get('year'), month: get('month'), day: get('day') }
}

/**
 * Horizonte da agenda publica: D+60 corridos.
 *
 * Ate 31/08/2026 a janela era "ate o fim do mes seguinte", o que fazia o
 * horizonte encolher ao longo do mes — no dia 31/08 ela terminava em 30/09 e
 * outubro inteiro sumia da pagina, mesmo com os leiloes ja cadastrados. O
 * Marcelo pediu D+60 no WhatsApp em 31/08/2026 ("D+60", 12:42), justamente
 * para outubro aparecer. Agora a janela tem sempre o mesmo tamanho.
 */
const PUBLIC_AGENDA_HORIZON_DAYS = 60

function publicAgendaRangeSaoPaulo() {
    const { year, month, day } = datePartsSaoPaulo(new Date())
    // A soma dos dias e feita em UTC a partir da data-calendario de Sao Paulo:
    // o servidor roda em UTC e um Date local empurraria a janela um dia.
    const end = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + PUBLIC_AGENDA_HORIZON_DAYS))

    return {
        start: todaySaoPaulo(),
        end: end.toISOString().slice(0, 10),
    }
}

function slugify(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

function normalizeEventText(value: unknown): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

function eventKey(data: unknown, nome: unknown, hora: unknown): string {
    return [
        String(data ?? '').trim(),
        normalizeEventText(nome),
        normalizeEventText(hora),
    ].join('|')
}

function isActivePublicAgendaRow(row: Record<string, unknown>): boolean {
    return isLeilaoAtivo(row.data, row.horario ?? row.hora)
}

function logoForCriatorio(nome: string): string | null {
    const slug = slugify(nome)
    return CRIATORIO_LOGOS[slug]?.src ?? null
}

function referenceForCriatorio(nome: string): { siteUrl: string | null } {
    const key = slugify(nome).replace(/-/g, ' ')
    return { siteUrl: CRIATORIO_REFERENCIAS[key]?.siteUrl ?? null }
}

function mapAssessores(row: Record<string, unknown>): BulaMembro[] {
    const join = (row.bula_leilao_assessores as Array<{ bula_membros: BulaMembro }>) ?? []
    return join.map((a) => a.bula_membros).filter(Boolean)
}

export async function getLeiloesPublicos(): Promise<LeilaoPublico[]> {
    if (!hasSupabaseAdminConfig()) return []

    const supabase = supabaseAdmin()
    const range = publicAgendaRangeSaoPaulo()
    const { data, error } = await supabase
        .from('bula_leiloes')
        .select(`${PUBLIC_COLS}, bula_leilao_assessores(bula_membros(id, nome, iniciais, cor))`)
        .in('status', PUBLIC_STATUSES)
        .gte('data', range.start)
        .lte('data', range.end)
        .order('data', { ascending: true })
        .order('horario', { ascending: true })

    if (error) {
        console.error('[public-leiloes] getLeiloesPublicos', error.message)
        return []
    }

    const { data: cronoData, error: cronoError } = await supabase
        .from('cronograma_leiloes')
        .select('data, hora, nome, criador')
        .gte('data', range.start)
        .lte('data', range.end)

    if (cronoError) {
        console.error('[public-leiloes] getLeiloesPublicos criadores', cronoError.message)
    }

    const criadorByKey = new Map<string, string>()
    const horaByKey = new Map<string, string>()
    for (const row of cronoData ?? []) {
        const criador = String(row.criador || '').trim()
        const hora = String(row.hora || '').trim()
        if (criador) criadorByKey.set(eventKey(row.data, row.nome, row.hora), criador)
        if (hora) horaByKey.set(eventKey(row.data, row.nome, row.hora), hora)
        const noHourKey = eventKey(row.data, row.nome, '')
        if (criador && !criadorByKey.has(noHourKey)) criadorByKey.set(noHourKey, criador)
        if (hora && !horaByKey.has(noHourKey)) horaByKey.set(noHourKey, hora)
    }

    const docsPorCrono = await documentosPorCronograma(
        supabase,
        (data ?? []).map((row: Record<string, unknown>) => row.cronograma_id as string | null),
    )

    return (data ?? [])
        .map((row: Record<string, unknown>) => {
            const cronoHora =
                horaByKey.get(eventKey(row.data, row.nome, row.horario))
                ?? horaByKey.get(eventKey(row.data, row.nome, ''))
                ?? null
            return {
                ...row,
                horario: String(row.horario || '').trim() || cronoHora,
            }
        })
        .filter((row: Record<string, unknown>) => isActivePublicAgendaRow(row))
        .map((row: Record<string, unknown>) => {
            const { cronograma_id, ...publico } = row as Record<string, unknown> & { cronograma_id?: string | null }
            return {
                ...publico,
                criador:
                    criadorByKey.get(eventKey(row.data, row.nome, row.horario))
                    ?? criadorByKey.get(eventKey(row.data, row.nome, ''))
                    ?? null,
                documentos: montarDocumentos(cronograma_id, row.catalogo_url as string | null, docsPorCrono),
                assessores: mapAssessores(row),
            }
        }) as unknown as LeilaoPublico[]
}

export async function getLeilaoPublico(id: string): Promise<LeilaoPublico | null> {
    if (!hasSupabaseAdminConfig()) return null

    const supabase = supabaseAdmin()
    const { data, error } = await supabase
        .from('bula_leiloes')
        .select(`${PUBLIC_COLS}, bula_leilao_assessores(bula_membros(id, nome, iniciais, cor))`)
        .eq('id', id)
        .in('status', PUBLIC_STATUSES)
        .maybeSingle()

    if (error || !data) {
        if (error) console.error('[public-leiloes] getLeilaoPublico', error.message)
        return null
    }

    const { data: cronoRows, error: cronoError } = await supabase
        .from('cronograma_leiloes')
        .select('data, hora, nome, criador')
        .eq('data', String(data.data))
        .eq('nome', String(data.nome))

    if (cronoError) {
        console.error('[public-leiloes] getLeilaoPublico criador', cronoError.message)
    }

    const cronoMatch = (cronoRows ?? []).find((row) =>
        eventKey(row.data, row.nome, row.hora) === eventKey(data.data, data.nome, data.horario),
    ) ?? cronoRows?.[0]

    const { cronograma_id, ...publico } = data as Record<string, unknown> & { cronograma_id?: string | null }
    const docsPorCrono = await documentosPorCronograma(supabase, [cronograma_id])

    return {
        ...publico,
        horario: String((data as Record<string, unknown>).horario || '').trim()
            || String(cronoMatch?.hora || '').trim()
            || null,
        criador: String(cronoMatch?.criador || '').trim() || null,
        documentos: montarDocumentos(cronograma_id, data.catalogo_url as string | null, docsPorCrono),
        assessores: mapAssessores(data as Record<string, unknown>),
    } as unknown as LeilaoPublico
}

export async function getCriatoriosParceirosMes(): Promise<CriatorioParceiroPublico[]> {
    if (!hasSupabaseAdminConfig()) return []

    const supabase = supabaseAdmin()
    const range = publicAgendaRangeSaoPaulo()
    const { data, error } = await supabase
        .from('cronograma_leiloes')
        .select('nome, criador, data, hora')
        .gte('data', range.start)
        .lte('data', range.end)
        .order('data', { ascending: true })

    if (error) {
        console.error('[public-leiloes] getCriatoriosParceirosMes', error.message)
        return []
    }

    const map = new Map<string, { nome: string; totalLeiloes: number }>()
    const activeRows = (data ?? []).filter((row: Record<string, unknown>) => isActivePublicAgendaRow(row))
    for (const row of activeRows) {
        const nome = String(row.criador || '').trim()
        if (!nome) continue
        const slug = slugify(nome)
        const current = map.get(slug)
        if (current) current.totalLeiloes += 1
        else map.set(slug, { nome, totalLeiloes: 1 })
    }

    return [...map.entries()]
        .map(([slug, item]) => ({
            nome: item.nome,
            slug,
            logo: logoForCriatorio(item.nome),
            logoClaro: CRIATORIO_LOGOS_CLAROS.has(slug),
            siteUrl: referenceForCriatorio(item.nome).siteUrl,
            totalLeiloes: item.totalLeiloes,
        }))
        .filter((item) => item.logo)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
