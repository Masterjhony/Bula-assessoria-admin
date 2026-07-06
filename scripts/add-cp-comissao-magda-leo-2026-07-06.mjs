// Cria a CP (conta a pagar) da comissão do Léo Serafim no fechamento Nelore Magda.
// Comissão 2% sobre VGV de cobertura do Léo (63.000 = lotes 15 e 12) = 1.260,00.
// Espelha a CP já existente do Fábio nesse leilão (mesma categoria/CC/vencimento).
// Idempotente por numero_documento. Uso: DRY_RUN=1 node ... | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const FORN_LEONARDO = '96c3b208-be13-4b37-b8bd-5dfe885e2600' // "LEONARDO" (mesma pessoa das CPs de comissão do Léo)
const CAT_COMISSAO = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e' // Comissão Funcionário
const CC_ASSESSORES = '52dd8ed0-0c0a-4524-86bd-01dc121487b3' // COM02
const FECHAMENTO_ID = 'd4fabc0f-8092-491e-9f2e-6a8556fc30d1'
const VGV_LEO = 63000
const VALOR = 1260 // 2% de 63.000
const DOC = 'BULA-2026-CP-COM-MAGDA-LEONARDO-SERAFIM'

const cp = {
  descricao: 'COMISSAO LEILÃO NELORE MAGDA NA ORIGEM - 28/06/2026 - LEONARDO SERAFIM (2%)',
  fornecedor_id: FORN_LEONARDO, categoria_id: CAT_COMISSAO, centro_custo_id: CC_ASSESSORES,
  valor: VALOR, emissao: '2026-06-28', vencimento: '2026-07-25', status: 'aberto',
  numero_documento: DOC, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
  observacoes: `Comissão 2% sobre VGV de cobertura ${brl(VGV_LEO)} (lotes 15 e 12). Fechamento PARCIAL ${FECHAMENTO_ID}. Adicionada 06/07 a partir do print do WhatsApp.`,
  tags: ['a-pagar', 'comissao', '2026', 'leilao', 'magda', 'parcial'],
}

console.log(`CP comissão Léo — Magda: ${brl(VALOR)} | doc ${DOC}`)
if (DRY_RUN) { console.log('[DRY_RUN] nada gravado.'); process.exit(0) }

const { data: ex } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', DOC).maybeSingle()
if (ex) { const { error } = await sb.from('erp_contas_pagar').update({ ...cp, updated_at: new Date().toISOString() }).eq('id', ex.id); if (error) throw new Error(error.message); console.log('-> CP ATUALIZADA', ex.id) }
else { const { data, error } = await sb.from('erp_contas_pagar').insert(cp).select('id').single(); if (error) throw new Error(error.message); console.log('-> CP CRIADA', data.id) }
