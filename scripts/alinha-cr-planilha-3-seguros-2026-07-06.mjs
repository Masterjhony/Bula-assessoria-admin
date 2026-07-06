// Alinha 3 CRs (ainda NÃO recebidas) ao valor da planilha mestra FINANCEIRO BULA 2026.
// Só valor muda; são títulos em aberto/vencido (sem conciliação bancária a quebrar).
//   LS AGROPECUARIA (mai/31): 16.666,58 -> 18.754,00
//   TOUROS SANTA NAZARE EXCELENCIA (mai/14): 17.908,00 -> 11.428,00
//   NELORE SANTA NAZARE (jun/09): 15.044,00 -> 12.524,00
// Idempotente por numero_documento. Uso: DRY_RUN=1 node scripts/alinha-cr-planilha-3-seguros-2026-07-06.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const ALVOS = [
  { doc: 'BULA-2026-CR-EXTRA-LS-AGROPECUARIA', de: 16666.58, para: 18754.00, leilao: 'LS Agropecuária (31/05)' },
  { doc: 'BULA-2026-CR-058', de: 17908.00, para: 11428.00, leilao: 'Touros Santa Nazaré Excelência (14/05)' },
  { doc: 'BULA-2026-CR-SANTA-NAZARE-20260609', de: 15044.00, para: 12524.00, leilao: 'Nelore Santa Nazaré (09/06)' },
]

console.log(DRY_RUN ? '*** DRY RUN ***\n' : '*** GRAVANDO ***\n')
for (const a of ALVOS) {
  const { data: cr } = await sb.from('erp_contas_receber').select('id,valor,valor_recebido,status,descricao').eq('numero_documento', a.doc).maybeSingle()
  if (!cr) { console.log(`[!] não achei ${a.doc}`); continue }
  if (Number(cr.valor_recebido) > 0) { console.log(`[!] ${a.doc} já tem valor_recebido ${brl(cr.valor_recebido)} — PULANDO (recebido, não rebaixar)`); continue }
  console.log(`${a.leilao}: ${brl(cr.valor)} -> ${brl(a.para)}  [${cr.status}] ${a.doc}`)
  if (DRY_RUN) continue
  const { error } = await sb.from('erp_contas_receber').update({
    valor: a.para,
    observacoes: `Valor alinhado à planilha mestra FINANCEIRO BULA 2026 em 06/07 (era ${brl(a.de)}). Título ainda não recebido.`,
    updated_at: new Date().toISOString(),
  }).eq('id', cr.id)
  if (error) throw new Error(`${a.doc}: ${error.message}`)
  console.log('  -> atualizado')
}
console.log(DRY_RUN ? '\n[DRY_RUN] nada gravado.' : '\nConcluído.')
