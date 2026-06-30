// Equaciona a comissão dobrada Rusa × Fábio no 9º Flor do Arataú (07/06).
// Lote 01 (R$ 123.000, comprador Diego Batista) foi vendido pelo Fábio MAS
// direcionado pelo Gustavo Rusa → pela regra do áudio a comissão é do Rusa (5%,
// já lançada), NÃO do Fábio (3%). Remove a comissão do Fábio sobre o lote 01.
// Fábio fica só com o lote 05 (R$ 21.600 → 3% = R$ 648). CP ainda não paga.
//
// Uso: DRY_RUN=1 node scripts/equaciona-dobra-rusa-flor-aratau.mjs | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const FECH_ID = 'dd10dd7d-f4d1-4656-ba07-175c4ea3b81e'
const NOVA_COMISSAO = 648   // lote 05 (21.600) × 3%
const NOVO_VGV_FABIO = 21600
const NOTA = 'AJUSTE 30/06 (regra do áudio Rusa): lote 01 (R$ 123.000, Diego Batista) foi direcionado pelo Gustavo Rusa — comissão desse lote é do Rusa (5%, já lançada), não do Fábio. Comissão do Fábio reduzida de R$ 4.338 (lotes 01+05) para R$ 648 (só lote 05).'

const { data: f } = await sb.from('bula_leilao_fechamento').select('id,nome,comissao_assessoria,por_assessor,observacoes').eq('id', FECH_ID).single()
const por = (f.por_assessor || []).map((a) => /fabio|omena/i.test(a.nome)
  ? { ...a, vgv: NOVO_VGV_FABIO, comissao: NOVA_COMISSAO, transacoes: 1, animais: 1, observacao: 'Só lote 05; lote 01 → Gustavo Rusa (regra do áudio).' }
  : a)
console.log(`Flor do Aratau | comissao_assessoria ${brl(f.comissao_assessoria)} -> ${brl(NOVA_COMISSAO)}`)

const { data: cp } = await sb.from('erp_contas_pagar').select('id,valor,status,observacoes').eq('numero_documento', 'BULA-2026-CP-COM-FLOR-ARATAU-FABIO-OMENA').maybeSingle()
console.log(`CP Fabio Flor | ${brl(cp?.valor)} (${cp?.status}) -> ${brl(NOVA_COMISSAO)}`)
if (cp && cp.status === 'pago') { console.log('!! CP já está paga — abortar e tratar como clawback'); process.exit(1) }

if (DRY_RUN) { console.log('[DRY_RUN]'); process.exit(0) }
await sb.from('bula_leilao_fechamento').update({
  por_assessor: por, comissao_assessoria: NOVA_COMISSAO,
  observacoes: (f.observacoes ? f.observacoes + '\n' : '') + NOTA, updated_at: new Date().toISOString(),
}).eq('id', FECH_ID)
console.log('-> fechamento atualizado')
await sb.from('erp_contas_pagar').update({
  valor: NOVA_COMISSAO, observacoes: (cp.observacoes ? cp.observacoes + '\n' : '') + NOTA, updated_at: new Date().toISOString(),
}).eq('id', cp.id)
console.log('-> CP Fabio reduzida para', brl(NOVA_COMISSAO))
console.log('Concluído. Dobra de junho removida: R$ 3.690,00.')
