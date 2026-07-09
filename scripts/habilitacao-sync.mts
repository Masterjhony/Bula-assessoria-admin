/**
 * Sincroniza a habilitação dos leads: CONSULTA → GRAVA NO LEAD → SUBMETE/PEDE.
 *
 * Usa a MESMA função que o concierge usa a cada mensagem
 * (`sincronizarHabilitacao`), então o que roda aqui é o que roda em produção.
 *
 * As consultas são PAGAS. Por isso:
 *   • o padrão é dry-run (não consulta, não grava, não envia nada);
 *   • `--consultar` grava os dados no lead mas NÃO envia ficha;
 *   • `--submeter` é o único modo que posta a ficha nos grupos das leiloeiras.
 *
 *   npx tsx scripts/habilitacao-sync.mts                      # dry-run de todos com CPF
 *   npx tsx scripts/habilitacao-sync.mts --consultar          # puxa e grava, sem enviar
 *   npx tsx scripts/habilitacao-sync.mts --consultar --submeter
 *   npx tsx scripts/habilitacao-sync.mts --lead <uuid> --consultar
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { sincronizarHabilitacao } from '../src/lib/crm-habilitacao-sync'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const args = process.argv.slice(2)
const CONSULTAR = args.includes('--consultar')
const SUBMETER = args.includes('--submeter')
const LEAD = (() => { const i = args.indexOf('--lead'); return i >= 0 ? args[i + 1] : null })()
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : Infinity })()
const dryRun = !CONSULTAR

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const cpfValido = (v: unknown) => String(v ?? '').replace(/\D/g, '').length === 11

async function alvos(): Promise<Array<{ id: string; nome: string | null }>> {
    if (LEAD) {
        const { data } = await sb.from('crm_leads').select('id, nome').eq('id', LEAD).maybeSingle()
        return data ? [data] : []
    }
    // Só quem já tem CPF: sem CPF a consulta de propriedade não roda, e o
    // enriquecimento por telefone gastaria consulta paga em massa.
    const rows: Array<{ id: string; nome: string | null; cpf: string | null; extra_data: Record<string, unknown> | null }> = []
    for (let off = 0; ; off += 1000) {
        const { data } = await sb.from('crm_leads')
            .select('id, nome, cpf, extra_data')
            .not('cpf', 'is', null)
            .eq('arquivado', false)
            .order('id')
            .range(off, off + 999)
        if (!data?.length) break
        rows.push(...(data as never))
        if (data.length < 1000) break
    }
    return rows.filter(r => cpfValido(r.cpf)).filter(r => !(r.extra_data ?? {}).propriedade_consultada_at)
}

const lista = await alvos()
console.log(`Modo: ${SUBMETER ? '🚨 CONSULTA + SUBMETE FICHA' : CONSULTAR ? 'consulta e grava (sem enviar ficha)' : 'DRY-RUN (nada é feito)'}`)
console.log(`Leads alvo: ${lista.length}\n`)

let completos = 0, consultados = 0, submetidos = 0
for (const [i, l] of lista.entries()) {
    if (i >= LIMIT) break
    const r = await sincronizarHabilitacao(sb, l.id, { consultar: CONSULTAR, submeter: SUBMETER, dryRun })
    if (r.consultou) consultados++
    if (r.checklist?.complete) completos++
    if (r.submetido) submetidos++
    const cl = r.checklist
    const achou = r.encontrados.length ? `  ↳ achou: ${r.encontrados.join(' · ')}` : ''
    console.log(
        `${String(i + 1).padStart(3)}. ${(l.nome ?? l.id).slice(0, 30).padEnd(30)} ` +
        `${cl ? `${cl.done}/${cl.total}` : '—'} ${cl?.complete ? '✅ completo' : `falta: ${r.faltando.slice(0, 3).join(', ')}${r.faltando.length > 3 ? '…' : ''}`}` +
        `${r.submetido ? `  📤 ficha → ${r.enviadosPara} leiloeira(s)` : ''}`,
    )
    if (achou) console.log(achou)
}

console.log(`\n=== consultados ${consultados} · completos ${completos} · fichas enviadas ${submetidos}`)
if (dryRun) console.log('[DRY-RUN] Nada foi consultado nem gravado. Rode com --consultar.')
else if (!SUBMETER) console.log('Dados gravados. Nenhuma ficha enviada — use --submeter para postar nos grupos.')
