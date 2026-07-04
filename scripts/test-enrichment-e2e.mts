/**
 * Teste E2E do enriquecimento (Direct Data) com um lead REAL do CRM.
 * Roda o MESMO código de produção: maybeEnrichLeadFromPhone → (se achar CPF)
 * maybeRunStateRegistrationCheck + maybeRunCreditCheck.
 *
 * Uso: npx tsx scripts/test-enrichment-e2e.mts [telefone-ou-lead-id]
 * Sem argumento: pega o lead ativo mais recente com telefone e sem CPF.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Carrega .env.local (o script roda fora do Next).
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const { maybeEnrichLeadFromPhone } = await import('../src/lib/crm-lead-enrichment')
const { maybeRunStateRegistrationCheck } = await import('../src/lib/crm-state-registration-automation')
const { maybeRunCreditCheck } = await import('../src/lib/crm-credit-automation')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const arg = process.argv[2]?.trim()

const FIELDS = 'id, nome, status, telefone, celular, email, cpf, estado, inscricao_estadual, tem_inscricao_estadual, quantidade_animais, contact_history, extra_data'
let query = supabase.from('crm_leads').select(FIELDS).eq('arquivado', false)
if (arg && /^[0-9a-f-]{36}$/i.test(arg)) query = query.eq('id', arg)
else if (arg) query = query.or(`telefone.ilike.%${arg.replace(/\D/g, '')}%,celular.ilike.%${arg.replace(/\D/g, '')}%`)
else query = query.in('status', ['CONEXÃO', 'QUALIFICAÇÃO']).or('cpf.is.null,cpf.eq.').not('telefone', 'is', null).order('last_whatsapp_at', { ascending: false, nullsFirst: false })

const { data: leads, error } = await query.limit(8)
if (error) { console.error('Erro ao buscar lead:', error.message); process.exit(1) }
if (!leads?.length) { console.log('Nenhum lead candidato encontrado.'); process.exit(0) }

const maskPhone = (p: string) => p ? p.slice(0, 6) + '****' + p.slice(-2) : '-'

// Tenta candidatos até achar um CPF (medindo a taxa de acerto da base).
let lead: (typeof leads)[0] | null = null
let enr: Awaited<ReturnType<typeof maybeEnrichLeadFromPhone>> = { attempted: false, cpf: null }
for (const cand of leads) {
    console.log(`Lead: ${cand.nome} · etapa ${cand.status} · fone ${maskPhone(cand.celular || cand.telefone || '')}`)
    if (String(cand.cpf || '').replace(/\D/g, '').length === 11) {
        console.log('   → já tem CPF; pulando enriquecimento (cascata direto p/ I.E./crédito).')
        lead = cand
        break
    }
    const r = await maybeEnrichLeadFromPhone(supabase, cand as never)
    console.log('   → attempted:', r.attempted, '| cpf:', r.cpf ? r.cpf.slice(0, 3) + '.***.***-' + r.cpf.slice(-2) : 'não', r.reason ? `| ${r.reason}` : '')
    if (r.cpf) { lead = cand; enr = r; break }
}
if (!lead) { console.log('\nNenhum telefone com match na base de enriquecimento.'); process.exit(0) }

const leadAfter = { ...lead, cpf: enr.cpf || lead.cpf }
if (String(leadAfter.cpf || '').replace(/\D/g, '').length === 11) {
    console.log('\n2) Consulta de I.E. (Sintegra)...')
    const ie = await maybeRunStateRegistrationCheck(supabase, leadAfter as never, { status: lead.status })
    console.log('   attempted:', ie.attempted, '| pendente:', ie.pending, '| I.E.:', ie.inscricaoEstadual || '(nenhuma)', ie.reason ? `| ${ie.reason}` : '')

    console.log('\n3) Consulta de crédito (score + protestos)...')
    const cr = await maybeRunCreditCheck(supabase, leadAfter as never, { status: lead.status })
    console.log('   attempted:', cr.attempted, '| pendente:', cr.pending, '| score:', cr.score ?? '(sem)', '| protestos:', cr.protestos.length, cr.reason ? `| ${cr.reason}` : '')
} else {
    console.log('\nSem CPF — I.E./crédito não rodam (comportamento correto).')
}

console.log('\nAbra o card deste lead no CRM para conferir o preenchimento.')
