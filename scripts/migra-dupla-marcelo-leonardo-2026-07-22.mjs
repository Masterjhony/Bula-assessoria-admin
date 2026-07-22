// Transfere as comissões da dupla "Marcelo Carneiro / Leonardo Serafim" para o
// LEONARDO SERAFIM (decisão do chefe, 22/07/2026):
//   - bula_leilao_fechamento.por_assessor: renomeia as entradas da dupla
//     (Katayama 31/05, LS Collection 31/05, Santa Nice 06/06, Jacamim 07/06)
//     para "Leonardo Serafim", preservando vgv/comissão/empresa, com observação.
//   - erp_contas_pagar: os 2 CPs em aberto (Santa Nice 5.580 + Jacamim 1.032)
//     passam o fornecedor de "Marcelo Carneiro Lucas Pereira" para LEONARDO e a
//     descrição é atualizada. Números de documento preservados.
//   Maio (Katayama 1.216 + LS 432) não tem CP no ERP — só a atribuição muda.
//
// Uso: node scripts/migra-dupla-marcelo-leonardo-2026-07-22.mjs          (dry-run)
//      node scripts/migra-dupla-marcelo-leonardo-2026-07-22.mjs --apply
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const MARK = '[DUPLA->LEO 22/07]'
const LEONARDO_ID = '96c3b208-be13-4b37-b8bd-5dfe885e2600' // erp_pessoas "LEONARDO"
const isDupla = (nome) => /MARCELO.*LEONARDO|LEONARDO.*MARCELO/i.test(String(nome||''))

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

console.log(APPLY ? '>>> APPLY' : '>>> DRY-RUN (use --apply para gravar)')

const { data: fechs, error } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,por_assessor')
  .gte('data', '2026-05-01').lt('data', '2026-07-01')
if (error) throw error

for (const f of fechs) {
  const ass = Array.isArray(f.por_assessor) ? JSON.parse(JSON.stringify(f.por_assessor)) : []
  let mudou = false
  for (const a of ass) {
    if (!isDupla(a.nome)) continue
    const antes = a.nome
    a.nome = 'Leonardo Serafim'
    a.observacao = `${MARK} Comissão da dupla "${antes}" transferida integralmente ao Leonardo Serafim (decisão do chefe 22/07/2026). ${a.observacao||''}`.trim()
    mudou = true
    console.log(`${f.data} | ${f.nome}: "${antes}" -> Leonardo Serafim (vgv ${a.vgv}, comissao ${a.comissao}, ${a.empresa||'—'})`)
  }
  if (mudou && APPLY) {
    const { error: e2 } = await sb.from('bula_leilao_fechamento').update({ por_assessor: ass }).eq('id', f.id)
    if (e2) throw e2
  }
}

const CPS = [
  { doc: 'BULA-2026-CP-COM-SANTA-NICE-MARCELO-CARNEIRO-LEONARD', desc: 'COMISSAO LEILAO MATRIZES SANTA NICE 2026 (06/06) - LEONARDO SERAFIM (2%)' },
  { doc: 'BULA-2026-CP-COM-JACAMIM-MARCELO-CARNEIRO-LEONARD', desc: 'COMISSAO 8o JACAMIM FEMEAS (07/06) - LEONARDO SERAFIM (2%)' },
]
for (const c of CPS) {
  const { data: cp, error: e3 } = await sb.from('erp_contas_pagar')
    .select('id,valor,status,observacoes,descricao').eq('numero_documento', c.doc).maybeSingle()
  if (e3) throw e3
  if (!cp) { console.log('!! CP não encontrado:', c.doc); continue }
  if (cp.status === 'pago') { console.log(`!! ${c.doc} já PAGO — não alterado, conferir manualmente`); continue }
  console.log(`CP ${c.doc} (${cp.valor}): fornecedor -> LEONARDO`)
  if (APPLY) {
    const obs = cp.observacoes?.includes(MARK) ? cp.observacoes
      : `${MARK} Beneficiário alterado de "Marcelo Carneiro Lucas Pereira" para LEONARDO SERAFIM (decisão do chefe 22/07/2026). Era comissão da dupla Marcelo/Leonardo.\n${cp.observacoes||''}`.trim()
    const { error: e4 } = await sb.from('erp_contas_pagar')
      .update({ fornecedor_id: LEONARDO_ID, descricao: c.desc, observacoes: obs }).eq('id', cp.id)
    if (e4) throw e4
  }
}

console.log('\nMaio (Katayama 1.216 + LS Collection 432): sem CP no ERP — apenas atribuição no fechamento alterada. Conferir se maio já foi acertado com o Marcelo por fora.')
console.log('Feito.' + (APPLY ? '' : ' (dry-run — nada gravado)'))
