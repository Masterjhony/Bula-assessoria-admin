// Completa a comissão do fechamento Venda Touros RS (23/06): Peralta 2% sobre
// VGV 175.500 = R$ 3.510. Atualiza por_assessor/comissao_assessoria e emite a CP.
// Uso: DRY_RUN=1 node scripts/completa-comissao-touros-rs.mjs | sem DRY_RUN grava.
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

const CAT_COMISSAO = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'
const CC_ASSESSORES = '52dd8ed0-0c0a-4524-86bd-01dc121487b3'
const PCT = 0.02

const { data: fech } = await sb.from('bula_leilao_fechamento').select('id,nome,vgv_total,por_assessor').eq('data', '2026-06-23').ilike('nome', '%Touros RS%').maybeSingle()
if (!fech) { console.error('Fechamento Touros RS não encontrado'); process.exit(1) }
const vgv = Number(fech.vgv_total || 0)
const comissao = Math.round(vgv * PCT * 100) / 100
const por_assessor = (fech.por_assessor || []).map((a) => a.nome === 'Peralta' ? { ...a, comissao_pct: PCT, comissao } : a)

// fornecedor Peralta (se existir)
const { data: forn } = await sb.from('erp_pessoas').select('id,nome').ilike('nome', '%peralta%').maybeSingle()
const fornId = forn?.id || null

console.log(`Touros RS | VGV ${brl(vgv)} | Peralta 2% = ${brl(comissao)} | fornecedor=${forn?.nome || '(sem cadastro, null)'}`)
if (DRY_RUN) { console.log('[DRY_RUN]'); process.exit(0) }

await sb.from('bula_leilao_fechamento').update({ por_assessor, comissao_assessoria: comissao, updated_at: new Date().toISOString() }).eq('id', fech.id)
console.log('-> fechamento atualizado (comissão Peralta)')

const doc = 'BULA-2026-CP-COM-TOUROS-RS-PERALTA'
const cp = {
  descricao: 'COMISSAO VENDA TOUROS RS (23/06) - PERALTA (2%)',
  fornecedor_id: fornId, categoria_id: CAT_COMISSAO, centro_custo_id: CC_ASSESSORES,
  valor: comissao, emissao: '2026-06-23', vencimento: '2026-07-25', status: 'aberto',
  numero_documento: doc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
  observacoes: `Comissão 2% sobre VGV de cobertura ${brl(vgv)} no Venda Touros RS. Vinculado ao fechamento ${fech.id}. Assessor Peralta (taxa 2% confirmada pelo chefe).`,
  tags: ['a-pagar', 'comissao', '2026', 'leilao', 'touros-rs', 'peralta'],
}
const { data: exCp } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', doc).maybeSingle()
if (exCp) { await sb.from('erp_contas_pagar').update({ ...cp, updated_at: new Date().toISOString() }).eq('id', exCp.id); console.log('-> CP ATUALIZADA', brl(comissao)) }
else { const { error } = await sb.from('erp_contas_pagar').insert(cp); if (error) throw new Error(error.message); console.log('-> CP CRIADA', brl(comissao), doc) }
console.log('Concluído.')
