// Equaciona a dobra Rusa × Fábio no 18º Mega Nelore Pará (30/05) — comissão JÁ PAGA.
// Lotes 30/32/33 (Fábio, projeto FPA) foram direcionados pelo Gustavo Rusa → comissão
// é do Rusa (5%, paga), não do Fábio (3%). Fábio recebeu R$ 10.530 a mais (no lump de
// maio, já pago). Resolução escolhida pelo chefe: registrar crédito a abater do Fábio.
//
// 1) Corrige o fechamento: Fábio fica só com lote 31 (48.000 → 3% = 1.440).
// 2) Cria conta a RECEBER (crédito) de R$ 10.530 do Fábio, p/ abater de comissões futuras.
//
// Uso: DRY_RUN=1 node scripts/equaciona-dobra-rusa-18mega-credito.mjs | sem DRY_RUN grava.
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

const FECH_ID = 'f6cb9aad-2b2a-4207-9c0b-e2e37808587b'
const FORN_FABIO = '1739c44b-b46a-4c1d-8adf-f6509fb44891'
const CREDITO = 10530    // 8.100 + 1.305 + 1.125 (lotes 30/32/33 × 3%)
const NOVA_COMISSAO = 1440 // só lote 31 (48.000) × 3%
const NOTA_FECH = 'AJUSTE 30/06 (regra do áudio Rusa): lotes 30, 32 e 33 (FPA) foram direcionados pelo Gustavo Rusa — comissão é do Rusa (5%, já paga), não do Fábio. Comissão do Fábio reduzida de R$ 11.970 para R$ 1.440 (só lote 31). Fábio já havia sido pago 3% sobre esses lotes (R$ 10.530) no lump de maio → registrado como crédito a abater (conta a receber).'

const { data: f } = await sb.from('bula_leilao_fechamento').select('id,nome,comissao_assessoria,por_assessor,observacoes').eq('id', FECH_ID).single()
const por = (f.por_assessor || []).map((a) => /fabio|omena/i.test(a.nome)
  ? { ...a, vgv: 48000, comissao: NOVA_COMISSAO, transacoes: 1, animais: 1, observacao: 'Só lote 31; lotes 30/32/33 → Gustavo Rusa (regra do áudio).' }
  : a)
console.log(`18º Mega | comissao_assessoria ${brl(f.comissao_assessoria)} -> ${brl(NOVA_COMISSAO)}`)

const CR_DOC = 'BULA-2026-CR-CREDITO-FABIO-RUSA'
const cr = {
  descricao: 'CRÉDITO A ABATER - comissão paga em dobro (lotes 30/32/33 do 18º Mega, direcionados pelo Rusa) - FÁBIO OMENA',
  cliente_id: FORN_FABIO, valor: CREDITO, valor_recebido: 0,
  emissao: '2026-06-30', vencimento: '2026-06-30', status: 'aberto',
  numero_documento: CR_DOC, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
  observacoes: 'Fábio recebeu 3% (R$ 10.530) sobre lotes 30/32/33 do 18º Mega Nelore Pará (30/05) que eram direcionamento do Gustavo Rusa (5%, também pago). Crédito a favor da empresa, a abater das próximas comissões do Fábio. Vinculado ao fechamento ' + FECH_ID + '.',
  tags: ['credito', 'abater-comissao', 'rusa', 'fabio', '2026'],
}
console.log(`Crédito a receber do Fábio: ${brl(CREDITO)} (${CR_DOC})`)

if (DRY_RUN) { console.log('[DRY_RUN]'); process.exit(0) }
await sb.from('bula_leilao_fechamento').update({ por_assessor: por, comissao_assessoria: NOVA_COMISSAO, observacoes: (f.observacoes ? f.observacoes + '\n' : '') + NOTA_FECH, updated_at: new Date().toISOString() }).eq('id', FECH_ID)
console.log('-> fechamento 18º Mega corrigido')
const { data: exCr } = await sb.from('erp_contas_receber').select('id').eq('numero_documento', CR_DOC).maybeSingle()
if (exCr) { await sb.from('erp_contas_receber').update({ ...cr, updated_at: new Date().toISOString() }).eq('id', exCr.id); console.log('-> CR crédito ATUALIZADA') }
else { const { error } = await sb.from('erp_contas_receber').insert(cr); if (error) throw new Error(error.message); console.log('-> CR crédito CRIADA', brl(CREDITO)) }
console.log('Concluído.')
