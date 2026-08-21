/**
 * REPROJETA A FOLHA — o cadastro manda, os títulos abertos obedecem.
 *
 *   npx tsx scripts/reprojeta-folha.mts            (relatório, não grava)
 *   npx tsx scripts/reprojeta-folha.mts --apply    (grava)
 *
 * POR QUE ESTE SCRIPT EXISTE
 * `scripts/projeta-folha-fixa-2026.mjs` só CRIA o que falta: mudar um salário
 * no cadastro (página Folha & Comissões) não mexia em nada, e a projeção de
 * caixa seguia com o valor velho até alguém perceber. Foi o que aconteceu na
 * revisão de 21/08/2026 — a folha tinha ido de R$ 33.100 para R$ 52.000 e o
 * fluxo de caixa ainda mostrava a antiga.
 *
 * Aqui a direção é a inversa: `erp_folha_estrutura` é a verdade e os títulos
 * ABERTOS de folha/comissão fixa são reescritos para bater com ela —
 * atualizando valor, criando quem entrou e cancelando quem saiu.
 *
 * REGRAS
 *   · Título 'pago' ou já 'cancelado' nunca é tocado. Passado é passado.
 *   · Vencimento = dia 05 do mês SEGUINTE à competência (padrão medido no
 *     extrato, dias 2–6 — ver correção de 18/08/2026).
 *   · Mês de entrada é PRO-RATA por dias corridos (INICIO abaixo). Do mês
 *     seguinte em diante, valor cheio.
 *   · `origem='estimativa'` + `evento_key` (src/lib/erp-evento.ts) para o
 *     trigger da migration 0074 encerrar a previsão quando o real chegar.
 *   · Idempotente: rodar duas vezes não muda nada na segunda.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { eventoKey } from '../src/lib/erp-evento'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').replace(/^﻿/, '').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])) as Record<string, string>
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const APPLY = process.argv.includes('--apply')
const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cent = (n: unknown) => Math.round(Number(n || 0) * 100)

/* ── Parâmetros ─────────────────────────────────────────────────────────── */

const COMP_INI = '2026-08' // primeira competência reprojetada (folha paga 05/09)
const COMP_FIM = '2026-12' // última competência projetada no ano

/**
 * Entrada na empresa. Só importa para o pro-rata do primeiro mês; quem não
 * está aqui é gente de casa e recebe cheio desde COMP_INI.
 * Datas apuradas no histórico do WhatsApp (sessão Baileys `joao-automation`):
 *   MATHEUS M1 — reunião de definição de funções em 24/07, "M1 chegando aqui"
 *                em 31/07 (grupo Cadastros Bula Remates) → agosto cheio.
 *   PEDRO      — onboarding "Pedro | SDR Bula Assessoria" em 12/08 (a chamada
 *                de 11/08 foi remarcada para o dia seguinte).
 *   LUANA      — "adicionei a Luana ao grupo, ela vai compor nossa equipe
 *                comercial" em 14/08 (grupos Assessores e Cadastros).
 */
const INICIO: Record<string, string> = {
  'MATHEUS M1': '2026-08-01',
  PEDRO: '2026-08-12',
  LUANA: '2026-08-14',
}

const NOTA = '[21/08/2026] Folha nova do cadastro (erp_folha_estrutura): entram Luana, Pedro e Matheus M1; Douglas passa de 3.600 para 12.500.'

// IDs reais do ERP (mesmos usados pela projeção anual de 21/07/2026)
const CAT_FOLHA = '4c79d95f-a8a4-4aff-9f7a-cd82f974c4b3'    // Folha de Pagamento
const CAT_COMISSAO = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e' // Comissão Funcionário

const MES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MES_ABBR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const slug = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
const diasNoMes = (y: number, m: number) => new Date(y, m, 0).getDate()

function* competencias(ini: string, fim: string) {
  let [y, m] = ini.split('-').map(Number)
  const [fy, fm] = fim.split('-').map(Number)
  while (y < fy || (y === fy && m <= fm)) {
    yield { y, m, ym: `${y}-${String(m).padStart(2, '0')}` }
    m++; if (m > 12) { m = 1; y++ }
  }
}

/** Folha da competência sai do banco no dia 05 do mês seguinte. */
const vencimentoDe = (y: number, m: number) =>
  m === 12 ? `${y + 1}-01-05` : `${y}-${String(m + 1).padStart(2, '0')}-05`

/** Comissão fixa mensal segue o ciclo de comissões: dia 25 do mês seguinte. */
const FERIADOS = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'])
function proxDiaUtil(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  while (d.getDay() === 0 || d.getDay() === 6 || FERIADOS.has(d.toISOString().slice(5, 10))) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
const vencComissaoDe = (y: number, m: number) =>
  proxDiaUtil(m === 12 ? `${y + 1}-01-25` : `${y}-${String(m + 1).padStart(2, '0')}-25`)

/**
 * Valor do mês. No mês de entrada, proporcional aos dias corridos trabalhados
 * — quem começa dia 14 de um mês de 31 dias recebe 18/31.
 */
function valorDoMes(nome: string, cheio: number, y: number, m: number) {
  const ini = INICIO[nome]
  if (!ini) return { valor: cheio, prorata: null as string | null }
  const [iy, im, id] = ini.split('-').map(Number)
  if (y < iy || (y === iy && m < im)) return { valor: 0, prorata: 'antes da entrada' }
  if (!(y === iy && m === im)) return { valor: cheio, prorata: null }
  const total = diasNoMes(y, m)
  const dias = total - id + 1
  if (dias >= total) return { valor: cheio, prorata: null }
  return { valor: Math.round((cheio * dias / total) * 100) / 100, prorata: `${dias}/${total} dias (entrada ${id}/${String(m).padStart(2, '0')})` }
}

/* ── Fontes ─────────────────────────────────────────────────────────────── */

const { data: estrutura, error: eEst } = await sb.from('erp_folha_estrutura').select('*').order('ordem')
if (eEst) { console.error(eEst); process.exit(1) }

const { data: centros } = await sb.from('erp_centros_custo').select('id,codigo')
const cc = Object.fromEntries((centros || []).map((c) => [c.codigo, c.id]))
const centroDe = (funcao: string | null) => (/assessor|sdr|parceiro|comercial/i.test(funcao || '') ? cc['COM01'] : cc['OP01'])

// títulos de folha/comissão fixa já existentes (a projeção anual usa prefixos estáveis)
const { data: existentes, error: eCp } = await sb.from('erp_contas_pagar')
  .select('id,numero_documento,descricao,valor,vencimento,status,tags,observacoes,evento_key,origem,centro_custo_id,categoria_id,fornecedor_id')
  .or('numero_documento.ilike.BULA-2026-CP-FOLHA-%,numero_documento.ilike.BULA-2026-CP-COM-SDR-%')
if (eCp) { console.error(eCp); process.exit(1) }
const porDoc = new Map((existentes || []).map((r) => [r.numero_documento, r]))

// fornecedor: herdado de qualquer título anterior da mesma pessoa
const fornecedorDe = (nome: string) =>
  (existentes || []).find((r) => r.numero_documento.endsWith(`-${slug(nome)}`) && r.fornecedor_id)?.fornecedor_id || null

/* ── Monta o alvo: como a projeção DEVE ficar ───────────────────────────── */

type Alvo = {
  doc: string; descricao: string; valor: number; emissao: string; vencimento: string
  categoria_id: string; centro_custo_id: string; fornecedor_id: string | null
  tags: string[]; observacoes: string; prorata: string | null; pessoa: string
}
const alvos: Alvo[] = []

for (const { y, m, ym } of competencias(COMP_INI, COMP_FIM)) {
  const mesNome = MES_NOME[m - 1], abbr = MES_ABBR[m - 1]
  const emissao = `${y}-${String(m).padStart(2, '0')}-01`

  for (const col of estrutura || []) {
    if (!col.ativo) continue
    const fixo = Number(col.salario_fixo || 0)
    if (fixo > 0) {
      const { valor, prorata } = valorDoMes(col.nome, fixo, y, m)
      if (valor > 0) {
        const descricao = `Folha ${mesNome}/${y} - ${col.nome}`
        alvos.push({
          doc: `BULA-2026-CP-FOLHA-${abbr}-${slug(col.nome)}`,
          descricao, valor, emissao, vencimento: vencimentoDe(y, m),
          categoria_id: CAT_FOLHA, centro_custo_id: centroDe(col.funcao),
          fornecedor_id: fornecedorDe(col.nome),
          tags: ['folha', String(y), mesNome.toLowerCase(), 'projecao-anual', 'orcamento'],
          observacoes: `Folha fixa de ${col.funcao || 'colaborador'} — projeção do cadastro erp_folha_estrutura.`,
          prorata, pessoa: col.nome,
        })
      }
    }
    const comFixa = Number(col.comissao_fixa || 0)
    if (comFixa > 0) {
      const { valor, prorata } = valorDoMes(col.nome, comFixa, y, m)
      if (valor > 0) {
        const descricao = `COMISSAO FIXA ${(col.funcao || '').toUpperCase()} - ${col.nome} - ref. ${mesNome}/${y}`
        alvos.push({
          doc: `BULA-2026-CP-COM-SDR-${slug(col.nome)}-${ym}`,
          descricao, valor, emissao, vencimento: vencComissaoDe(y, m),
          categoria_id: CAT_COMISSAO, centro_custo_id: cc['COM02'] || centroDe(col.funcao),
          fornecedor_id: fornecedorDe(col.nome),
          tags: ['comissao', String(y), mesNome.toLowerCase(), 'projecao-anual', 'orcamento'],
          observacoes: `Comissão fixa mensal (${brl(comFixa)}) — projeção do cadastro erp_folha_estrutura.`,
          prorata, pessoa: col.nome,
        })
      }
    }
  }
}

/* ── Diferença ──────────────────────────────────────────────────────────── */

const criar: Alvo[] = []
const atualizar: Array<{ alvo: Alvo; atual: any; de: number; para: number }> = []
const intactos: Alvo[] = []
const pulados: Array<{ alvo: Alvo; motivo: string }> = []

for (const a of alvos) {
  const atual = porDoc.get(a.doc)
  if (!atual) { criar.push(a); continue }
  if (atual.status === 'pago' || atual.status === 'cancelado') {
    if (cent(atual.valor) !== cent(a.valor)) pulados.push({ alvo: a, motivo: `${atual.status} por ${brl(Number(atual.valor))}` })
    continue
  }
  if (cent(atual.valor) !== cent(a.valor) || String(atual.vencimento || '').slice(0, 10) !== a.vencimento) {
    atualizar.push({ alvo: a, atual, de: Number(atual.valor), para: a.valor })
  } else intactos.push(a)
}

// quem tem título aberto na janela e não está mais no alvo (saiu do cadastro,
// foi desativado ou teve a rubrica zerada) → cancelar, nunca apagar
const docsAlvo = new Set(alvos.map((a) => a.doc))
const cancelar = (existentes || []).filter((r) => {
  if (docsAlvo.has(r.numero_documento)) return false
  if (!['aberto', 'vencido', 'parcial'].includes(r.status)) return false
  const venc = String(r.vencimento || '').slice(0, 7)
  return venc >= vencimentoDe(Number(COMP_INI.slice(0, 4)), Number(COMP_INI.slice(5))).slice(0, 7)
})

/* ── Relatório ──────────────────────────────────────────────────────────── */

const cabecalho = APPLY ? '' : '[SIMULAÇÃO — nada gravado] '
console.log(`\n${cabecalho}Reprojeção da folha ${COMP_INI} → ${COMP_FIM}\n`)

const totalPorComp = new Map<string, number>()
for (const a of alvos) {
  const k = a.vencimento.slice(0, 7)
  totalPorComp.set(k, (totalPorComp.get(k) || 0) + a.valor)
}

if (criar.length) {
  console.log(`── CRIAR (${criar.length})`)
  for (const a of criar) console.log(`   ${a.vencimento}  ${brl(a.valor).padStart(14)}  ${a.descricao}${a.prorata ? `  · pro-rata ${a.prorata}` : ''}`)
}
if (atualizar.length) {
  console.log(`\n── ATUALIZAR (${atualizar.length})`)
  for (const u of atualizar) console.log(`   ${u.alvo.vencimento}  ${brl(u.de).padStart(14)} → ${brl(u.para).padStart(14)}  ${u.alvo.descricao}`)
}
if (cancelar.length) {
  console.log(`\n── CANCELAR (${cancelar.length}) — fora do cadastro atual`)
  for (const r of cancelar) console.log(`   ${String(r.vencimento).slice(0, 10)}  ${brl(Number(r.valor)).padStart(14)}  ${r.descricao}`)
}
if (pulados.length) {
  console.log(`\n── PULADOS (${pulados.length}) — título fechado, não se mexe`)
  for (const p of pulados) console.log(`   ${p.alvo.vencimento}  ${p.motivo.padStart(24)}  ${p.alvo.descricao}`)
}
console.log(`\n── SEM MUDANÇA: ${intactos.length} título(s)`)

console.log('\n── SAÍDA DE CAIXA PROJETADA (folha + comissão fixa), por data de pagamento')
for (const [mes, v] of [...totalPorComp].sort()) console.log(`   ${mes}  ${brl(v).padStart(14)}`)

/* ── Grava ──────────────────────────────────────────────────────────────── */

if (!APPLY) {
  console.log('\nRode de novo com --apply para gravar.\n')
  process.exit(0)
}

for (const a of criar) {
  const { error } = await sb.from('erp_contas_pagar').insert({
    descricao: a.descricao,
    numero_documento: a.doc,
    valor: a.valor,
    emissao: a.emissao,
    vencimento: a.vencimento,
    status: 'aberto',
    categoria_id: a.categoria_id,
    centro_custo_id: a.centro_custo_id,
    fornecedor_id: a.fornecedor_id,
    recorrencia: 'mensal',
    tags: a.tags,
    origem: 'estimativa',
    evento_key: eventoKey({ descricao: a.descricao, vencimento: a.vencimento }),
    observacoes: `${a.observacoes}${a.prorata ? ` Mês de entrada: pro-rata ${a.prorata}.` : ''}\n${NOTA}`,
  })
  if (error) { console.error('insert', a.doc, error.message); process.exit(1) }
}

for (const u of atualizar) {
  const obs = String(u.atual.observacoes || '')
  const linha = `[21/08/2026] Valor reprojetado de ${brl(u.de)} para ${brl(u.para)} — folha nova do cadastro (erp_folha_estrutura).`
  const { error } = await sb.from('erp_contas_pagar').update({
    valor: u.alvo.valor,
    vencimento: u.alvo.vencimento,
    descricao: u.alvo.descricao,
    evento_key: u.atual.evento_key || eventoKey({ descricao: u.alvo.descricao, vencimento: u.alvo.vencimento }),
    origem: u.atual.origem === 'real' ? 'real' : 'estimativa',
    observacoes: obs.includes(linha) ? obs : `${obs}\n${linha}`.trim(),
  }).eq('id', u.atual.id)
  if (error) { console.error('update', u.alvo.doc, error.message); process.exit(1) }
}

for (const r of cancelar) {
  const obs = String(r.observacoes || '')
  const linha = `[21/08/2026] CANCELADO na reprojeção: a rubrica não existe mais no cadastro de folha (erp_folha_estrutura).`
  const { error } = await sb.from('erp_contas_pagar').update({
    status: 'cancelado',
    observacoes: obs.includes(linha) ? obs : `${obs}\n${linha}`.trim(),
  }).eq('id', r.id)
  if (error) { console.error('cancel', r.numero_documento, error.message); process.exit(1) }
}

console.log(`\nOK — ${criar.length} criado(s), ${atualizar.length} atualizado(s), ${cancelar.length} cancelado(s).\n`)
