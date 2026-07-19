/**
 * CONSULTA PAGA DE CPF (Direct Data) — CIRÚRGICA, para leads de alto valor
 * sem CPF que o pedido pela conversa não resolveu.
 *
 * Público (interseção deliberadamente estreita — cada consulta custa dinheiro):
 *   - lead ativo, sem CPF, telefone válido, NÃO opt-out/contexto-incorreto
 *   - E (aceitou a assessoria OU é MQL com ≥100 cabeças declaradas)
 * Dedup: pula quem já tem consulta registrada (extra_data.cpf_consulta_at).
 *
 * ⚠ Requer SALDO na Direct Data (10/07 estava zerada). Dry-run lista o público
 * e NÃO consulta nada; --send consulta e grava com auditoria.
 *
 *   npx tsx scripts/consulta-cpf-pagos.mts               # dry-run
 *   npx tsx scripts/consulta-cpf-pagos.mts --send --limit 50
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const { enriquecerLeadPorTelefone, isDirectdConfigured } = await import('../src/lib/directd-provider')
const args = process.argv.slice(2)
const SEND = args.includes('--send')
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || 50
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const cab = (v: unknown) => { const m = String(v ?? '').match(/\d+/); return m ? Number(m[0]) : 0 }

const leads: any[] = []
for (let from = 0; ; from += 1000) {
    const { data } = await s.from('crm_leads')
        .select('id, nome, cpf, telefone, celular, quantidade_animais, is_mql, optout_whatsapp, extra_data')
        .eq('arquivado', false).eq('optout_whatsapp', false).range(from, from + 999)
    if (!data || !data.length) break
    leads.push(...data); if (data.length < 1000) break
}
const alvo = leads.filter(l => {
    const xd = l.extra_data ?? {}
    if (digits(l.cpf).length === 11) return false
    if (!digits(l.telefone || l.celular)) return false
    if (xd.contexto_incorreto_at || xd.cpf_consulta_at) return false
    return xd.aceitou_assessoria === true || (l.is_mql && cab(l.quantidade_animais) >= 100)
}).slice(0, LIMIT)

console.log(`Público da consulta paga: ${alvo.length} leads (cap ${LIMIT})`)
for (const l of alvo.slice(0, 15)) {
    const xd = l.extra_data ?? {}
    console.log(`  ${(l.nome || '(sem nome)').slice(0, 26).padEnd(28)} ${digits(l.telefone || l.celular)}  ${xd.aceitou_assessoria ? 'aceitou' : `MQL ${l.quantidade_animais} cab`}`)
}
if (!SEND) { console.log('\n[DRY-RUN] Nenhuma consulta feita. --send consulta (custa saldo Direct Data).'); process.exit(0) }
if (!isDirectdConfigured()) { console.error('Direct Data não configurada (.env).'); process.exit(1) }

let ok = 0, semDado = 0, erro = 0
for (const l of alvo) {
    try {
        const r = await enriquecerLeadPorTelefone(digits(l.celular || l.telefone))
        const xd = l.extra_data ?? {}
        const patch: Record<string, unknown> = {
            extra_data: { ...xd, cpf_consulta_at: new Date().toISOString(), cpf_fonte: r.cpf ? 'directd-telefone' : xd.cpf_fonte },
        }
        if (r.cpf) { patch.cpf = r.cpf; ok++ } else semDado++
        await s.from('crm_leads').update(patch).eq('id', l.id)
    } catch (e) { erro++; console.log(`  ✗ ${l.nome}: ${e instanceof Error ? e.message : e}`) }
    await new Promise(r => setTimeout(r, 400))
}
console.log(`\n=== FIM === CPF obtido: ${ok} · sem dado: ${semDado} · erro: ${erro} (de ${alvo.length})`)
