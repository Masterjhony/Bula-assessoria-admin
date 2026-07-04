/**
 * Backfill REAL: roda o pipeline de produção (enriquecimento telefone→CPF com
 * validação de nome → I.E.) nos leads ativos sem CPF e ATUALIZA os cards.
 * Segura o Score (consulta cara) — ele roda naturalmente na Qualificação.
 *
 * Uso: npx tsx scripts/backfill-enrichment.mts [limite] [--com-score]
 * Consulta sem retorno = grátis. Enriquecimento/I.E. = centavos por acerto.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const { maybeEnrichLeadFromPhone } = await import('../src/lib/crm-lead-enrichment')
const { maybeRunStateRegistrationCheck } = await import('../src/lib/crm-state-registration-automation')
const { maybeRunCreditCheck } = await import('../src/lib/crm-credit-automation')

const LIMIT = Number(process.argv.find(a => /^\d+$/.test(a))) || 60
const COM_SCORE = process.argv.includes('--com-score')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const FIELDS = 'id, nome, status, telefone, celular, email, cpf, estado, inscricao_estadual, tem_inscricao_estadual, quantidade_animais, contact_history, extra_data'
const { data: leads } = await supabase
    .from('crm_leads')
    .select(FIELDS)
    .eq('arquivado', false)
    .or('cpf.is.null,cpf.eq.')
    .not('telefone', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT)

console.log(`Backfill em ${leads?.length ?? 0} leads · Score ${COM_SCORE ? 'INCLUÍDO' : 'segurado'}\n`)
let enriched = 0, suspeito = 0, semMatch = 0, ieOk = 0, scoreOk = 0

for (const lead of leads ?? []) {
    const enr = await maybeEnrichLeadFromPhone(supabase, lead as never)
    if (!enr.attempted) continue

    if (enr.cpf) {
        enriched++
        console.log(`  ✓ ${lead.nome} → CPF aplicado (nome confere)`)
        const leadAfter = { ...lead, cpf: enr.cpf }
        // I.E. (Sintegra) — barato
        const ie = await maybeRunStateRegistrationCheck(supabase, leadAfter as never, { status: lead.status })
        if (ie.attempted && !ie.pending && ie.inscricaoEstadual) { ieOk++; console.log(`      I.E.: ${ie.inscricaoEstadual}`) }
        // Score/protestos — só com flag (consulta cara)
        if (COM_SCORE) {
            const cr = await maybeRunCreditCheck(supabase, leadAfter as never, { status: lead.status })
            if (cr.attempted && !cr.pending) { scoreOk++; console.log(`      score: ${cr.score ?? '-'} · protestos: ${cr.protestos.length}`) }
        }
    } else {
        // relê p/ ver se foi "suspeito" (achou CPF de outra pessoa) ou nada
        const { data } = await supabase.from('crm_leads').select('extra_data').eq('id', lead.id).single()
        const xd = (data?.extra_data ?? {}) as Record<string, unknown>
        if (xd.enriquecimento_suspeito) { suspeito++ } else { semMatch++ }
    }
}

console.log('\n=== BACKFILL CONCLUÍDO ===')
console.log(`Cards atualizados com CPF (nome confere): ${enriched}`)
console.log(`I.E. preenchida: ${ieOk}${COM_SCORE ? ` · Score/protestos: ${scoreOk}` : ''}`)
console.log(`CPF de terceiro (registrado p/ revisão, não aplicado): ${suspeito}`)
console.log(`Sem match nenhum: ${semMatch}`)
if (!COM_SCORE) console.log('\nScore NÃO rodou (rode com --com-score, ou deixe disparar na Qualificação).')
