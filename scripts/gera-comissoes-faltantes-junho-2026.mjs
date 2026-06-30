// Gera as contas a pagar de comissão FALTANTES de 6 fechamentos de junho/2026
// (03–07/06). Esses fechamentos foram criados por um batch antigo que gravou
// comissao_assessoria no fechamento mas NÃO emitiu as contas a pagar por assessor
// (ao contrário de FLOC/KatiSpera/JMP, que têm CP por leilão). Total: R$ 31.164,00.
//
// Espelha o padrão dos scripts de fechamento: categoria "Comissão Funcionário",
// centro COM02, vencimento 2026-07-25, vinculado ao fechamento. Idempotente por
// numero_documento. Fonte: por_assessor de cada bula_leilao_fechamento.
//
// Uso: DRY_RUN=1 node scripts/gera-comissoes-faltantes-junho-2026.mjs | sem DRY_RUN grava.
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

const CAT_COMISSAO = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e' // Comissão Funcionário
const CC_ASSESSORES = '52dd8ed0-0c0a-4524-86bd-01dc121487b3' // COM02
const VENC = '2026-07-25'

// nome do assessor -> fornecedor_id (null quando ambíguo/combinado/sem cadastro)
const FORN = {
  'fabio omena': '1739c44b-b46a-4c1d-8adf-f6509fb44891',
  'douglas bispo': '25642186-16ad-4306-9eb7-8f3372b63f00',
  'leonardo serafim': '96c3b208-be13-4b37-b8bd-5dfe885e2600',
  'bulinha (felipe andrade)': '623cf381-2714-404e-b96a-cd04b1e43af9',
}
const slugAssessor = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)

// fechamento id -> { slug, nome }
const FECHS = [
  { id: '9e017caf-8899-4852-99a5-d506bb5905b6', slug: 'CACHOEIRAO', nome: 'DESTAQUES DA SAFRA NELORE CACHOEIRAO (03/06)' },
  { id: 'ebfbce96-4c51-49e9-994b-1d117fdaf486', slug: 'CAMPARINO', nome: '41o TOUROS CAMPARINO (06/06)' },
  { id: '982e286e-7741-480a-bfc9-cf01f7f428ce', slug: 'SANTA-NICE', nome: 'LEILAO MATRIZES SANTA NICE 2026 (06/06)' },
  { id: 'dd10dd7d-f4d1-4656-ba07-175c4ea3b81e', slug: 'FLOR-ARATAU', nome: '9o NELORE FLOR DO ARATAU (07/06)' },
  { id: 'c1afc577-062e-4473-8a53-0d10e6802392', slug: 'JACAMIM', nome: '8o JACAMIM FEMEAS (07/06)' },
  { id: 'bbe8f166-9144-460f-ad62-26d45b3b040b', slug: 'SAO-FRANCISCO', nome: '1o NELORE SAO FRANCISCO (07/06)' },
]

const rows = []
for (const f of FECHS) {
  const { data: fech } = await sb.from('bula_leilao_fechamento').select('por_assessor').eq('id', f.id).single()
  for (const a of (fech?.por_assessor || [])) {
    const comissao = Number(a.comissao || 0)
    if (comissao <= 0) continue
    const fornId = FORN[(a.nome || '').toLowerCase()] || null
    const pct = a.comissao_pct ?? (a.vgv ? comissao / Number(a.vgv) : null)
    const pctTxt = pct ? ` (${(pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%)` : ''
    rows.push({
      numero_documento: `BULA-2026-CP-COM-${f.slug}-${slugAssessor(a.nome)}`,
      descricao: `COMISSAO ${f.nome} - ${(a.nome || '').toUpperCase()}${pctTxt}`,
      fornecedor_id: fornId, categoria_id: CAT_COMISSAO, centro_custo_id: CC_ASSESSORES,
      valor: comissao, emissao: '2026-07-01', vencimento: VENC, status: 'aberto',
      parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
      observacoes: `Comissão sobre VGV de cobertura ${brl(a.vgv)} no ${f.nome}. Vinculado ao fechamento ${f.id}. Gerada na conferência 30/06 (CP estava faltando).`,
      tags: ['a-pagar', 'comissao', '2026', 'leilao', f.slug.toLowerCase()],
    })
  }
}

const docs = rows.map((r) => r.numero_documento)
const { data: ex } = await sb.from('erp_contas_pagar').select('numero_documento').in('numero_documento', docs)
const exist = new Set((ex || []).map((r) => r.numero_documento))
const novos = rows.filter((r) => !exist.has(r.numero_documento))
const total = rows.reduce((s, r) => s + r.valor, 0)
console.log(`candidatos: ${rows.length} | já existem: ${exist.size} | a inserir: ${novos.length} | total comissão: ${brl(total)}`)
for (const r of rows) console.log(`  ${exist.has(r.numero_documento) ? '=' : '+'} ${brl(r.valor).padStart(10)} | ${r.descricao}`)

if (DRY_RUN) { console.log('\n[DRY_RUN] nada gravado.'); process.exit(0) }
if (!novos.length) { console.log('\nNada novo.'); process.exit(0) }
const { data, error } = await sb.from('erp_contas_pagar').insert(novos).select('id')
if (error) { console.error('Erro:', error.message); process.exit(1) }
console.log(`\nOK — ${data.length} contas a pagar de comissão criadas.`)
