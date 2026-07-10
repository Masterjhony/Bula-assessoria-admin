/**
 * BACKFILL 10/07/2026 — reconsulta de I.E./propriedade + submissão das fichas.
 *
 * Contexto: até hoje o Direct Data respondia a consulta de Sintegra ANTES do
 * Infosimples e devolvia só o número da I.E. — sem a propriedade rural e sem o
 * PDF da SEFAZ (que conta como documento do lead). Resultado: zero leads com
 * propriedade preenchida e a trava de 30 dias carimbada em cima de consultas
 * "vazias". Este script destrava exatamente esses carimbos e roda o pipeline
 * novo (Infosimples primeiro + UF por DDD + ficha sem doc para a Programa).
 *
 * Quem é descarimbado (extra_data.fiscal.ie.pending = true, que o gate ignora):
 *   • consulta antiga feita pelo Direct Data (qualquer resultado);
 *   • I.E. encontrada mas propriedade nunca consultada;
 *   • "não encontrada"/indisponível numa UF, quando o DDD aponta OUTRA UF.
 *
 * Como sempre: consultas são PAGAS → padrão é dry-run.
 *
 *   npx tsx scripts/rehabilitar-consultas-ie-2026-07-10.mts                    # só mostra o plano
 *   npx tsx scripts/rehabilitar-consultas-ie-2026-07-10.mts --consultar        # descarimba + consulta + grava
 *   npx tsx scripts/rehabilitar-consultas-ie-2026-07-10.mts --consultar --submeter   # + posta fichas nos grupos
 *   npx tsx scripts/rehabilitar-consultas-ie-2026-07-10.mts --consultar --limit 5
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { sincronizarHabilitacao } from '../src/lib/crm-habilitacao-sync'
import { normalizeUf, ufFromPhone } from '../src/lib/state-registration-provider'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const args = process.argv.slice(2)
const CONSULTAR = args.includes('--consultar')
const SUBMETER = args.includes('--submeter')
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : Infinity })()

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const ETAPAS = new Set(['ENTRADA', 'CONEXAO', 'QUALIFICACAO', 'INFO CAPTADAS', 'INFORMACOES CAPTADAS', 'CADASTRO'])
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
const cpfValido = (v: unknown) => String(v ?? '').replace(/\D/g, '').length === 11

interface Row {
    id: string
    nome: string | null
    cpf: string | null
    estado: string | null
    telefone: string | null
    celular: string | null
    status: string | null
    optout_whatsapp: boolean | null
    extra_data: Record<string, unknown> | null
}

const leads: Row[] = []
for (let off = 0; ; off += 1000) {
    const { data, error } = await sb
        .from('crm_leads')
        .select('id, nome, cpf, estado, telefone, celular, status, optout_whatsapp, extra_data')
        .eq('arquivado', false)
        .range(off, off + 999)
    if (error) { console.error(error.message); process.exit(1) }
    leads.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
}

const alvos = leads.filter(l => {
    if (!cpfValido(l.cpf) || l.optout_whatsapp) return false
    if (!ETAPAS.has(norm(l.status))) return false
    const xd = l.extra_data ?? {}
    return !xd.cadastro_submetido_at
}).slice(0, LIMIT)

console.log(`Alvos (CPF válido, etapa ativa, ficha não submetida): ${alvos.length}`)

let descarimbados = 0, consultaram = 0, submetidas = 0
for (const lead of alvos) {
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    const fiscal = (xd.fiscal ?? {}) as Record<string, unknown>
    const ie = (fiscal.ie ?? null) as { provider?: string; pending?: boolean; consultedAt?: string; inscricaoEstadual?: string | null; indisponivel?: boolean } | null

    const ufCadastro = normalizeUf(lead.estado)
    const ufTelefone = ufFromPhone(lead.celular || lead.telefone)
    const temUfNova = Boolean(ufTelefone && ufTelefone !== ufCadastro)

    // Merece descarimbar? (só quando existe um ângulo NOVO para a consulta)
    const carimboVazio = ie && !ie.pending && (
        ie.provider === 'directd'                                    // consulta pobre (sem propriedade/PDF)
        || (ie.inscricaoEstadual && !xd.propriedade_consultada_at)   // achou I.E. mas nunca puxou a propriedade
        || (!ie.inscricaoEstadual && temUfNova)                      // não achou/indisponível, mas o DDD dá outra UF
    )

    if (carimboVazio && CONSULTAR) {
        const { error } = await sb.from('crm_leads').update({
            extra_data: { ...xd, fiscal: { ...fiscal, ie: { ...ie, pending: true, motivo_descarimbo: 'backfill 2026-07-10: reconsulta com Infosimples/propriedade' } } },
        }).eq('id', lead.id)
        if (error) { console.warn(`  ✗ ${lead.nome}: falha ao descarimbar (${error.message})`); continue }
        descarimbados++
    }

    if (!CONSULTAR) {
        console.log(`· ${lead.nome} — UF cad=${ufCadastro ?? '—'} ddd=${ufTelefone ?? '—'} ` +
            `ie=${ie?.inscricaoEstadual ?? '—'} prov=${ie?.provider ?? '—'} descarimbaria=${Boolean(carimboVazio)}`)
        continue
    }

    const r = await sincronizarHabilitacao(sb, lead.id, { submeter: SUBMETER })
    if (r.consultou) consultaram++
    if (r.submetido) submetidas++
    console.log(`· ${lead.nome} — consultou=${r.consultou} encontrados=[${r.encontrados.join('; ')}] ` +
        `pronto=${r.pronto} submetido=${r.submetido}${r.motivo ? ` · ${r.motivo}` : ''}`)
}

console.log(`\nResumo: ${alvos.length} alvos · ${descarimbados} descarimbados · ${consultaram} consultados · ${submetidas} fichas submetidas`)
if (!CONSULTAR) console.log('(dry-run — rode com --consultar para gravar, e --submeter para postar as fichas)')
