/**
 * Documentos de um leilão — catálogo(s) e ordem de entrada.
 *
 * Existe por dois motivos concretos, os dois vindos de bug observado em
 * produção:
 *
 * 1) Um leilão tem mais de um documento. O Sabiá Dourado mandou "Catálogo
 *    Nelore" e "Catálogo Tropa"; o segundo era recusado com "leilão já tinha
 *    catálogo — não sobrescrito", porque `catalogo_url` é UMA coluna.
 *
 * 2) A agenda pública lê `bula_leiloes`, mas o anexo automático escrevia em
 *    `cronograma_leiloes`. Resultado: dos catálogos capturados no WhatsApp,
 *    nenhum jamais apareceu no site. Aqui as duas colunas `catalogo_url`
 *    passam a ser ESPELHO do documento principal, escritas juntas, sempre.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type TipoDocumentoLeilao = 'catalogo' | 'ordem_entrada' | 'outro'

export type LeilaoDocumento = {
    id: string
    cronograma_id: string
    tipo: TipoDocumentoLeilao
    titulo: string
    url: string
    file_name: string | null
    file_size: number | null
    content_hash: string | null
    origem: string | null
    detection_id: string | null
    publico: boolean
    principal: boolean
    ordem: number
    created_at: string
}

const COLS =
    'id, cronograma_id, tipo, titulo, url, file_name, file_size, content_hash, origem, detection_id, publico, principal, ordem, created_at'

/**
 * Título legível do documento — é o rótulo do botão na página pública.
 *
 * Leilão com vários catálogos precisa que os botões se distingam. O nome do
 * arquivo carrega essa distinção de duas formas: o RECORTE do lote ("Catálogo
 * Nelore", "(Touros)") e o FORMATO ("CAT VIRTUAL", "Digital", "Planilha").
 * Sem isso a Matinha ficava com quatro botões escritos "Catálogo".
 */
export function tituloDocumento(
    fileName: string,
    tipo: TipoDocumentoLeilao,
): string {
    if (tipo === 'ordem_entrada') return 'Ordem de entrada'

    const base = (fileName || '')
        .replace(/\.[a-z0-9]{2,5}$/i, '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()

    // "nelore" fica de fora de propósito: aparece no nome de metade dos leilões
    // ("Leilão Nelore Paranã") e viraria "Catálogo Nelore" em tudo.
    const RECORTES: Array<[RegExp, string]> = [
        [/\btouros?\b/, 'de touros'],
        [/\bmachos?\b/, 'de machos'],
        [/\bmatrizes\b/, 'de matrizes'],
        [/\bnovilhas?\b/, 'de novilhas'],
        [/\bbezerr[ao]s?\b/, 'de bezerras'],
        [/\bprenhas?\b/, 'de prenhas'],
        [/\bdoadoras?\b/, 'de doadoras'],
        [/\baspiracoes\b/, 'de aspirações'],
        [/\bembrioes\b/, 'de embriões'],
        [/\bfemeas?\b/, 'de fêmeas'],
        [/\btropa\b/, 'Tropa'],
    ]
    const FORMATOS: Array<[RegExp, string]> = [
        [/\bplanilha\b/, 'em planilha'],
        [/\bcat\s*virtual\b|\bvirtual\b/, 'virtual'],
        [/\bdigital\b/, 'digital'],
    ]

    // Recorte manda; formato só entra quando o recorte não distinguiu nada.
    const recorte = RECORTES.find(([re]) => re.test(base))
    if (recorte) return `Catálogo ${recorte[1]}`
    const formato = FORMATOS.find(([re]) => re.test(base))
    if (formato) return `Catálogo ${formato[1]}`
    return 'Catálogo'
}

export type AnexarInput = {
    cronograma_id: string
    url: string
    tipo?: TipoDocumentoLeilao
    titulo?: string
    file_name?: string | null
    file_size?: number | null
    content_hash?: string | null
    origem?: string | null
    detection_id?: string | null
    publico?: boolean
    /** Força este documento como principal (substitui o `catalogo_url`). */
    tornarPrincipal?: boolean
}

export type AnexarResultado = {
    documento: LeilaoDocumento
    /** false quando o mesmo arquivo já estava anexado neste leilão. */
    criado: boolean
    catalogo_url: string | null
}

/**
 * Anexa um documento ao leilão. Idempotente por (leilão, conteúdo) e por
 * (leilão, url): reenvio do mesmo PDF não duplica.
 */
export async function anexarDocumento(
    sb: SupabaseClient,
    input: AnexarInput,
): Promise<AnexarResultado> {
    const tipo: TipoDocumentoLeilao = input.tipo ?? 'catalogo'
    const fileName = input.file_name ?? ''

    const existente = await buscarExistente(sb, input.cronograma_id, input.url, input.content_hash)
    if (existente) {
        // Enriquece o que estiver faltando. Documento herdado do `catalogo_url`
        // antigo nasceu sem file_name nem hash — e sem hash ele não deduplica
        // contra o mesmo PDF reenviado, virando botão repetido na página.
        const faltando: Record<string, unknown> = {}
        if (!existente.file_name && input.file_name) faltando.file_name = input.file_name
        if (existente.file_size == null && input.file_size != null) faltando.file_size = input.file_size
        if (!existente.content_hash && input.content_hash) faltando.content_hash = input.content_hash
        if (!existente.detection_id && input.detection_id) faltando.detection_id = input.detection_id
        if (faltando.file_name) faltando.titulo = tituloDocumento(String(faltando.file_name), existente.tipo)
        if (Object.keys(faltando).length > 0) {
            await sb.from('leilao_documentos').update(faltando).eq('id', existente.id)
            Object.assign(existente, faltando)
        }

        if (input.tornarPrincipal && !existente.principal) {
            await definirPrincipal(sb, input.cronograma_id, existente.id)
        }
        const catalogo_url = await sincronizarCatalogoUrl(sb, input.cronograma_id)
        return { documento: existente, criado: false, catalogo_url }
    }

    // Principal = o primeiro catálogo do leilão, ou quem for promovido de
    // propósito. Ordem de entrada nunca vira principal sozinha.
    const { data: principaisExistentes } = await sb
        .from('leilao_documentos')
        .select('id')
        .eq('cronograma_id', input.cronograma_id)
        .eq('principal', true)
        .limit(1)
    const jaTemPrincipal = (principaisExistentes ?? []).length > 0
    const viraPrincipal = input.tornarPrincipal === true
        || (!jaTemPrincipal && tipo === 'catalogo')

    if (viraPrincipal && jaTemPrincipal) {
        await sb.from('leilao_documentos')
            .update({ principal: false })
            .eq('cronograma_id', input.cronograma_id)
            .eq('principal', true)
    }

    const { count } = await sb
        .from('leilao_documentos')
        .select('id', { count: 'exact', head: true })
        .eq('cronograma_id', input.cronograma_id)

    const { data, error } = await sb
        .from('leilao_documentos')
        .insert({
            cronograma_id: input.cronograma_id,
            tipo,
            titulo: input.titulo?.trim() || tituloDocumento(fileName, tipo),
            url: input.url,
            file_name: input.file_name ?? null,
            file_size: input.file_size ?? null,
            content_hash: input.content_hash ?? null,
            origem: input.origem ?? 'whatsapp',
            detection_id: input.detection_id ?? null,
            // Catálogo é pra vender: nasce público. Ordem de entrada é peça
            // operacional — nasce interna e o operador libera se quiser.
            publico: input.publico ?? (tipo === 'catalogo'),
            principal: viraPrincipal,
            ordem: count ?? 0,
        })
        .select(COLS)
        .single()

    if (error || !data) {
        throw new Error(`falha ao anexar documento: ${error?.message ?? 'desconhecido'}`)
    }

    const catalogo_url = await sincronizarCatalogoUrl(sb, input.cronograma_id)
    return { documento: data as LeilaoDocumento, criado: true, catalogo_url }
}

async function buscarExistente(
    sb: SupabaseClient,
    cronograma_id: string,
    url: string,
    content_hash?: string | null,
): Promise<LeilaoDocumento | null> {
    const { data: porUrl } = await sb
        .from('leilao_documentos')
        .select(COLS)
        .eq('cronograma_id', cronograma_id)
        .eq('url', url)
        .maybeSingle()
    if (porUrl) return porUrl as LeilaoDocumento

    if (content_hash) {
        const { data: porHash } = await sb
            .from('leilao_documentos')
            .select(COLS)
            .eq('cronograma_id', cronograma_id)
            .eq('content_hash', content_hash)
            .maybeSingle()
        if (porHash) return porHash as LeilaoDocumento
    }
    return null
}

export async function definirPrincipal(
    sb: SupabaseClient,
    cronograma_id: string,
    documento_id: string,
): Promise<void> {
    await sb.from('leilao_documentos')
        .update({ principal: false })
        .eq('cronograma_id', cronograma_id)
        .eq('principal', true)
    await sb.from('leilao_documentos')
        .update({ principal: true })
        .eq('id', documento_id)
}

/**
 * Reescreve `catalogo_url` nas DUAS tabelas a partir do documento principal.
 *
 * `bula_leiloes` é a tabela que a agenda pública lê — sem esta escrita, o
 * catálogo fica invisível no site. `cronograma_leiloes` é o que o admin e o
 * GIF de Lotes leem. Devolve a URL aplicada (ou null se o leilão ficou sem
 * documento público).
 */
export async function sincronizarCatalogoUrl(
    sb: SupabaseClient,
    cronograma_id: string,
): Promise<string | null> {
    const { data: docs } = await sb
        .from('leilao_documentos')
        .select('id, url, tipo, publico, principal, origem, ordem, created_at')
        .eq('cronograma_id', cronograma_id)
        .order('principal', { ascending: false })
        .order('ordem', { ascending: true })

    const lista = (docs ?? []) as Array<{
        id: string; url: string; tipo: string; publico: boolean
        principal: boolean; origem: string | null
    }>
    const principal =
        lista.find(d => d.principal)
        ?? lista.find(d => d.tipo === 'catalogo' && d.publico)
        ?? lista.find(d => d.tipo === 'catalogo')
        ?? null

    const url = principal?.url ?? null
    const agora = new Date().toISOString()

    await sb.from('cronograma_leiloes')
        .update({
            catalogo_url: url,
            catalogo_anexado_em: url ? agora : null,
            catalogo_origem: url ? (principal?.origem ?? 'whatsapp') : null,
        })
        .eq('id', cronograma_id)

    // O vínculo é a FK explícita `bula_leiloes.cronograma_id` (migration 0019).
    // Linha sem vínculo não recebe escrita — adivinhar por nome+data já trocou
    // par no passado e não vale o risco.
    await sb.from('bula_leiloes')
        .update({ catalogo_url: url })
        .eq('cronograma_id', cronograma_id)

    return url
}

export async function removerDocumento(sb: SupabaseClient, id: string): Promise<void> {
    const { data } = await sb
        .from('leilao_documentos')
        .select('cronograma_id')
        .eq('id', id)
        .maybeSingle()
    await sb.from('leilao_documentos').delete().eq('id', id)
    if (data?.cronograma_id) await sincronizarCatalogoUrl(sb, data.cronograma_id)
}

export async function listarDocumentos(
    sb: SupabaseClient,
    cronogramaIds: string[],
    opts?: { somentePublicos?: boolean },
): Promise<Map<string, LeilaoDocumento[]>> {
    const mapa = new Map<string, LeilaoDocumento[]>()
    if (cronogramaIds.length === 0) return mapa

    let q = sb
        .from('leilao_documentos')
        .select(COLS)
        .in('cronograma_id', cronogramaIds)
        .order('principal', { ascending: false })
        .order('ordem', { ascending: true })
    if (opts?.somentePublicos) q = q.eq('publico', true)

    const { data } = await q
    for (const doc of (data ?? []) as LeilaoDocumento[]) {
        const arr = mapa.get(doc.cronograma_id) ?? []
        arr.push(doc)
        mapa.set(doc.cronograma_id, arr)
    }
    return mapa
}
