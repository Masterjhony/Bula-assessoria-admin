// Lança as comissões de assessoria do 10o Leilão Nelore JMP (touros 14/06 e
// bezerras/fêmeas 13/06) como CONTAS A PAGAR no ERP, e atualiza os fechamentos.
//
// Regra (confirmada pelo usuário no WhatsApp 16/06): valores do relatório de
// pisteiros (PDF) + 2% para o Bulinha (que no PDF aparece a 0%, pois é dono/FdB).
//   Douglas 2%, Fábio 3%, Leonardo 2%, Lucas 0,33% (PDF), Bulinha 2%.
//   Mateus e LM = 0% (sem lançamento).
//
// Centro de custo: COM02 (Comissão Assessores) para assessores oficiais Bula;
//   COM03 (Comissão Parceiros Comerciais) para o Bulinha (parceiro FdB).
//
// Uso: DRY_RUN=1 node scripts/lanca-comissoes-jmp-2026-06-14.mjs  | sem DRY_RUN grava.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100

// --- IDs fixos descobertos na inspeção ---
const CATEGORIA_COMISSAO = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e' // "Comissão Funcionário"
const CC_ASSESSORES = '52dd8ed0-0c0a-4524-86bd-01dc121487b3'      // COM02 Comissão Assessores
const CC_PARCEIROS = '3350800e-d771-4963-a0c9-342ed268ca4a'       // COM03 Comissão Parceiros Comerciais
const VENCIMENTO = '2026-07-25' // padrão da casa: comissões do mês pagas dia 25 do mês seguinte

async function ensureFornecedor(nome, fixedId) {
  if (fixedId) return fixedId
  const { data: ex, error } = await sb.from('erp_pessoas').select('id').eq('nome', nome).maybeSingle()
  if (error) throw new Error(`SELECT pessoa ${nome}: ${error.message}`)
  if (ex) {
    await sb.from('erp_pessoas').update({ is_fornecedor: true }).eq('id', ex.id)
    return ex.id
  }
  if (DRY_RUN) return `(novo:${nome})`
  const { data, error: insErr } = await sb.from('erp_pessoas')
    .insert({ tipo: 'pf', nome, is_fornecedor: true }).select('id').single()
  if (insErr) throw new Error(`INSERT pessoa ${nome}: ${insErr.message}`)
  return data.id
}

// Comissões por leilão. fornecedorId fixo quando já existe no ERP de comissões.
const LEILOES = [
  {
    rotulo: 'TOUROS 14/06',
    fechamentoId: 'c0f291bb-17bc-4b10-b320-c5ed6e767057',
    leilaoNome: '10o Leilão JMP Touros',
    data: '2026-06-14',
    docBase: 'BULA-2026-CP-COM-JMP-TOUROS',
    tagLeilao: 'touros',
    comissoes: [
      { nome: 'Douglas Bispo', fornecedorId: '25642186-16ad-4306-9eb7-8f3372b63f00', vgv: 282100, pct: 0.02, cc: CC_ASSESSORES, slug: 'DOUGLAS' },
      { nome: 'Fábio Omena', fornecedorId: '1739c44b-b46a-4c1d-8adf-f6509fb44891', vgv: 1312000, pct: 0.03, cc: CC_ASSESSORES, slug: 'FABIO' },
      { nome: 'Leonardo Serafim', fornecedorId: '96c3b208-be13-4b37-b8bd-5dfe885e2600', vgv: 420000, pct: 0.02, cc: CC_ASSESSORES, slug: 'LEONARDO' },
      { nome: 'Lucas Martins', fornecedorId: null, vgv: 515700, pct: 0.0033, cc: CC_ASSESSORES, slug: 'LUCAS' },
      { nome: 'Bulinha (Felipe Andrade)', fornecedorId: null, vgv: 1499300, pct: 0.02, cc: CC_PARCEIROS, slug: 'BULINHA' },
    ],
    // assessores do fechamento que recebem 0 (mantidos só pra recomputo do fechamento)
    fechamentoZeros: ['Mateus Alves', 'LM Assessoria'],
  },
  {
    rotulo: 'BEZERRAS/FÊMEAS 13/06',
    fechamentoId: 'cd19dba3-792d-42e3-a563-f6025528dd51',
    leilaoNome: '10o Leilão JMP Fêmeas/Bezerras',
    data: '2026-06-13',
    docBase: 'BULA-2026-CP-COM-JMP-FEMEAS',
    tagLeilao: 'femeas',
    comissoes: [
      { nome: 'Douglas Bispo', fornecedorId: '25642186-16ad-4306-9eb7-8f3372b63f00', vgv: 126000, pct: 0.02, cc: CC_ASSESSORES, slug: 'DOUGLAS' },
      { nome: 'Bulinha (Felipe Andrade)', fornecedorId: null, vgv: 63000, pct: 0.02, cc: CC_PARCEIROS, slug: 'BULINHA' },
    ],
    fechamentoZeros: [],
  },
]

console.log(DRY_RUN ? '*** DRY RUN — nada será gravado ***' : '*** GRAVANDO EM PRODUÇÃO ***')

for (const L of LEILOES) {
  console.log(`\n================ ${L.rotulo} — ${L.leilaoNome} ================`)
  let totalComissao = 0
  const lancados = []

  for (const c of L.comissoes) {
    const valor = r2(c.vgv * c.pct)
    totalComissao = r2(totalComissao + valor)
    const fornId = await ensureFornecedor(c.nome, c.fornecedorId)
    const doc = `${L.docBase}-${c.slug}`
    const pctTxt = (c.pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    const descricao = `COMISSAO ${L.leilaoNome.toUpperCase()} - ${c.nome.toUpperCase()} (${pctTxt}%)`
    console.log(`  ${c.nome.padEnd(28)} ${pctTxt.padStart(5)}% × ${brl(c.vgv).padStart(16)} = ${brl(valor).padStart(14)}  [${c.cc === CC_PARCEIROS ? 'COM03 Parceiros' : 'COM02 Assessores'}]`)

    if (DRY_RUN) { lancados.push({ nome: c.nome, valor }); continue }

    const payload = {
      descricao,
      fornecedor_id: fornId,
      categoria_id: CATEGORIA_COMISSAO,
      centro_custo_id: c.cc,
      valor,
      emissao: L.data,
      vencimento: VENCIMENTO,
      status: 'aberto',
      numero_documento: doc,
      parcela: 1,
      total_parcelas: 1,
      recorrencia: 'nenhuma',
      observacoes: `Comissão ${pctTxt}% sobre VGV de cobertura ${brl(c.vgv)} no ${L.leilaoNome}. ` +
        `Base: relatório de pisteiros (PDF) + regra Bula (Bulinha 2%). Vinculado ao fechamento ${L.fechamentoId}.`,
      tags: ['a-pagar', 'comissao', '2026', 'leilao', 'jmp', L.tagLeilao, c.slug.toLowerCase()],
      anexos: [],
    }
    const { data: ex, error: selErr } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', doc).maybeSingle()
    if (selErr) throw new Error(`SELECT CP ${doc}: ${selErr.message}`)
    if (ex) {
      const { error } = await sb.from('erp_contas_pagar').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', ex.id)
      if (error) throw new Error(`UPDATE CP ${doc}: ${error.message}`)
      console.log(`     -> conta a pagar ATUALIZADA (${doc})`)
    } else {
      const { error } = await sb.from('erp_contas_pagar').insert(payload)
      if (error) throw new Error(`INSERT CP ${doc}: ${error.message}`)
      console.log(`     -> conta a pagar CRIADA (${doc}) venc ${VENCIMENTO}`)
    }
  }

  console.log(`  --> Total comissões ${L.rotulo}: ${brl(totalComissao)}`)

  // Atualiza o fechamento: por_assessor (comissão de cada um) + comissao_assessoria + sobra_bruta
  if (!DRY_RUN) {
    const { data: fech, error: fErr } = await sb.from('bula_leilao_fechamento')
      .select('por_assessor,receita_bula').eq('id', L.fechamentoId).single()
    if (fErr) throw new Error(`SELECT fechamento ${L.rotulo}: ${fErr.message}`)
    const valorPorNome = new Map(L.comissoes.map((c) => [c.nome, { pct: c.pct, valor: r2(c.vgv * c.pct) }]))
    const por_assessor = (fech.por_assessor || []).map((a) => {
      // casa por nome (tolerante a "Bulinha" / "Felipe Vilela Andrade (Bulinha)")
      const match = [...valorPorNome.keys()].find((k) =>
        a.nome === k || a.nome.includes('Bulinha') && k.includes('Bulinha'))
      if (match) {
        const { pct, valor } = valorPorNome.get(match)
        return { ...a, comissao_pct: pct, comissao: valor }
      }
      return { ...a, comissao: a.comissao ?? 0 }
    })
    const comissao_assessoria = r2(por_assessor.reduce((s, a) => s + (Number(a.comissao) || 0), 0))
    const sobra_bruta = fech.receita_bula != null ? r2(Number(fech.receita_bula) - comissao_assessoria) : null
    const { error: upErr } = await sb.from('bula_leilao_fechamento')
      .update({ por_assessor, comissao_assessoria, sobra_bruta, updated_at: new Date().toISOString() })
      .eq('id', L.fechamentoId)
    if (upErr) throw new Error(`UPDATE fechamento ${L.rotulo}: ${upErr.message}`)
    console.log(`  -> fechamento atualizado: comissão ${brl(comissao_assessoria)} | sobra ${brl(sobra_bruta)}`)
  } else {
    console.log(`  [DRY_RUN] fechamento seria atualizado com comissão ${brl(totalComissao)}`)
  }
}

console.log('\nConcluído.')
