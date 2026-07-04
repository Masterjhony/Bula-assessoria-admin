/**
 * Testa o enriquecimento (telefone → CPF) em LOTE, direto na API da Direct Data.
 * Consulta que não acha = grátis (só cobra com retorno). Reporta a taxa de acerto real.
 * Uso: npx tsx scripts/test-enrichment-batch.mts [limite]
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const TOKEN = process.env.DIRECTD_TOKEN!
const LIMIT = Number(process.argv[2]) || 50
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function dd(svc: string, params: Record<string, string>) {
    const u = new URL('https://apiv3.directd.com.br/api/' + svc)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    u.searchParams.set('TOKEN', TOKEN)
    const r = await fetch(u, { signal: AbortSignal.timeout(45000) })
    return (await r.json().catch(() => null)) as { metaDados?: { mensagem?: string }; retorno?: { cpf?: string; nome?: string } } | null
}

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

const { data: leads } = await supabase
    .from('crm_leads')
    .select('id, nome, telefone, celular, email')
    .eq('arquivado', false)
    .or('cpf.is.null,cpf.eq.')
    .not('telefone', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT)

console.log(`Testando ${leads?.length ?? 0} leads (telefone, sem CPF)...\n`)
let hits = 0, misses = 0, errors = 0
const hitList: string[] = []

for (const l of leads ?? []) {
    const fone = digits(l.celular || l.telefone)
    const nacional = fone.startsWith('55') && fone.length > 11 ? fone.slice(2) : fone
    if (nacional.length < 10) { continue }
    // tenta 2 formatos: nacional (DDD+num) e com 55
    let hit = false
    for (const cel of [nacional, '55' + nacional]) {
        const j = await dd('EnriquecimentoLead', { CELULAR: cel })
        const cpf = digits(j?.retorno?.cpf)
        if (cpf.length === 11) {
            hits++; hit = true
            hitList.push(`  ✓ ${l.nome} → CPF ${cpf.slice(0, 3)}***${cpf.slice(-2)} (${j?.retorno?.nome || '?'})`)
            break
        }
        if (j?.metaDados?.mensagem && !/não encontrada|nao encontrada/i.test(j.metaDados.mensagem)) {
            errors++; console.log(`  ! ${l.nome}: ${j.metaDados.mensagem}`); break
        }
    }
    if (!hit) misses++
    process.stdout.write(`\r  ${hits} acertos · ${misses} sem match · ${errors} erros   `)
}

console.log('\n\n=== RESULTADO ===')
console.log(`Acertos (CPF encontrado): ${hits}/${(leads?.length ?? 0)}  (${((hits / Math.max(1, leads?.length ?? 1)) * 100).toFixed(0)}%)`)
console.log(`Sem match: ${misses} · Erros: ${errors}`)
if (hitList.length) { console.log('\nLeads enriquecidos:'); hitList.forEach(h => console.log(h)) }
