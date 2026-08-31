/**
 * Saneia `leilao_documentos`: completa metadado, remove duplicata de conteúdo
 * e reescreve os títulos.
 *
 *   npx tsx --env-file=.env.local scripts/catalogos-sanear-documentos.mts
 *   ... --aplicar
 *
 * Por que precisa existir: os documentos herdados do antigo `catalogo_url`
 * entraram sem `file_name` e sem `content_hash`. Sem hash, o mesmo PDF
 * reenviado no grupo não deduplica contra eles — e o leilão termina com dois
 * botões "Catálogo" apontando para arquivos idênticos na página pública. Aqui
 * a gente baixa o que falta, calcula o sha256, junta o que é igual e retitula
 * pelo nome do arquivo.
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v as string

const { tituloDocumento, sincronizarCatalogoUrl } = await import('../src/lib/leilao-documentos')

const APLICAR = process.argv.includes('--aplicar')
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})

type Doc = {
    id: string; cronograma_id: string; tipo: string; titulo: string; url: string
    file_name: string | null; file_size: number | null; content_hash: string | null
    detection_id: string | null; principal: boolean; created_at: string
}

const { data: docs } = await sb.from('leilao_documentos')
    .select('id, cronograma_id, tipo, titulo, url, file_name, file_size, content_hash, detection_id, principal, created_at')
    .order('created_at')
const { data: leiloes } = await sb.from('cronograma_leiloes').select('id, data, nome')
const nomeLeilao = new Map((leiloes ?? []).map(l => [l.id, `${l.data} ${l.nome}`]))

console.log(`${APLICAR ? 'APLICANDO' : 'SIMULAÇÃO (use --aplicar)'} — ${docs?.length ?? 0} documentos\n`)

// ── 1. Completa metadado a partir da detecção que aponta pro mesmo arquivo ──
const semNome = (docs ?? []).filter(d => !d.file_name || !d.content_hash) as Doc[]
let enriquecidos = 0
for (const d of semNome) {
    const { data: det } = await sb.from('whatsapp_catalog_detections')
        .select('id, file_name, file_size, content_hash')
        .eq('r2_key', d.url)
        .order('received_at', { ascending: true })
        .limit(1)
        .maybeSingle()

    const patch: Record<string, unknown> = {}
    if (!d.file_name && det?.file_name) patch.file_name = det.file_name
    if (d.file_size == null && det?.file_size != null) patch.file_size = det.file_size
    if (!d.detection_id && det?.id) patch.detection_id = det.id
    if (!d.content_hash) {
        const hash = det?.content_hash ?? await baixarEHashear(d.url)
        if (hash) patch.content_hash = hash
    }
    if (Object.keys(patch).length === 0) continue

    Object.assign(d, patch)
    enriquecidos++
    console.log(`  + ${(patch.file_name as string) ?? d.file_name ?? d.url.slice(-40)}  [${nomeLeilao.get(d.cronograma_id)}]`)
    if (APLICAR) await sb.from('leilao_documentos').update(patch).eq('id', d.id)
}
console.log(`\n${enriquecidos} documentos completados\n`)

// ── 2. Duplicata de CONTEÚDO dentro do mesmo leilão ──────────────────────────
const porLeilao = new Map<string, Doc[]>()
for (const d of (docs ?? []) as Doc[]) {
    const a = porLeilao.get(d.cronograma_id) ?? []; a.push(d); porLeilao.set(d.cronograma_id, a)
}

let removidos = 0
const leiloesTocados = new Set<string>()
for (const [cronoId, lista] of porLeilao) {
    const porHash = new Map<string, Doc[]>()
    for (const d of lista) {
        if (!d.content_hash) continue
        const a = porHash.get(d.content_hash) ?? []; a.push(d); porHash.set(d.content_hash, a)
    }
    for (const [, iguais] of porHash) {
        if (iguais.length < 2) continue
        // Fica o principal; sem principal, o mais antigo (é o que já circulou).
        const manter = iguais.find(d => d.principal) ?? iguais[0]
        for (const d of iguais) {
            if (d.id === manter.id) continue
            removidos++
            leiloesTocados.add(cronoId)
            console.log(`  − duplicata: "${d.titulo}" (${d.file_name ?? '?'}) em ${nomeLeilao.get(cronoId)}`)
            if (APLICAR) await sb.from('leilao_documentos').delete().eq('id', d.id)
        }
    }
}
console.log(`\n${removidos} duplicatas de conteúdo removidas\n`)

// ── 3. Retitula tudo pelo nome do arquivo ────────────────────────────────────
let retitulados = 0
for (const d of (docs ?? []) as Doc[]) {
    if (!d.file_name) continue
    const novo = tituloDocumento(d.file_name, d.tipo as 'catalogo' | 'ordem_entrada' | 'outro')
    if (novo === d.titulo) continue
    retitulados++
    console.log(`  ~ "${d.titulo}" → "${novo}"  (${d.file_name})`)
    if (APLICAR) await sb.from('leilao_documentos').update({ titulo: novo }).eq('id', d.id)
}
console.log(`\n${retitulados} títulos reescritos`)

if (APLICAR) {
    for (const id of leiloesTocados) await sincronizarCatalogoUrl(sb, id)
    console.log(`catalogo_url reescrito em ${leiloesTocados.size} leilões`)
} else {
    console.log('\nNada foi gravado.')
}

async function baixarEHashear(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
        if (!res.ok) return null
        return createHash('sha256').update(new Uint8Array(await res.arrayBuffer())).digest('hex')
    } catch {
        return null
    }
}
