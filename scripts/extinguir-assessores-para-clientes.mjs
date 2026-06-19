// Migração one-off: extinção da etapa ASSESSORES.
// - Todos os leads na etapa ASSESSORES → viram cliente (tabela `clientes`) e são
//   ARQUIVADOS no CRM (saem do Kanban).
// - Leads na etapa CADASTRO com cadastro APROVADO (score razoável-pra-cima + tem
//   I.E., ou flag cadastro_aprovado) → idem.
// NÃO envia e-mail às leiloeiras (backfill histórico). Idempotente: leads já
// arquivados são ignorados; clientes são upsert por match_key.
//
// Uso: node scripts/extinguir-assessores-para-clientes.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios em .env.local')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ── replica das helpers do app (mantém o match_key idêntico ao getClientes) ──
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
const matchKey = (nome) =>
  String(nome ?? '')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const normStage = (s) =>
  String(s ?? '').normalize('NFD').replace(DIACRITICS, '').trim().toLowerCase()

const scoreToFaixa = (score) => {
  if (score == null || Number.isNaN(score)) return ''
  if (score < 300) return 'baixo'
  if (score < 500) return 'regular'
  if (score < 700) return 'razoavel'
  if (score < 850) return 'bom'
  return 'otimo'
}

const temIE = (lead) =>
  String(lead.tem_inscricao_estadual ?? '').trim().toLowerCase() === 'sim' ||
  String(lead.inscricao_estadual ?? '').trim().length > 0

const cadastroApto = (lead) => {
  const faixa = scoreToFaixa(lead.score_serasa)
  const manual = Boolean(lead.extra_data && lead.extra_data.cadastro_aprovado)
  return manual || (['razoavel', 'bom', 'otimo'].includes(faixa) && temIE(lead))
}

// ── carrega leads candidatos (não arquivados) ──
const { data: leads, error } = await supabase
  .from('crm_leads')
  .select('*')
  .or('arquivado.is.null,arquivado.eq.false')
if (error) {
  console.error('Erro ao ler leads:', error.message)
  process.exit(1)
}

const alvos = []
for (const lead of leads ?? []) {
  const stage = normStage(lead.status)
  if (stage === 'assessores') {
    alvos.push({ lead, motivo: 'ASSESSORES' })
  } else if (stage === 'cadastro' && cadastroApto(lead)) {
    alvos.push({ lead, motivo: 'CADASTRO aprovado' })
  }
}

console.log(`Leads candidatos: ${alvos.length} (de ${leads?.length ?? 0} não arquivados)`)
if (!alvos.length) {
  console.log('Nada a migrar.')
  process.exit(0)
}

let ok = 0
let fail = 0
for (const { lead, motivo } of alvos) {
  const nome = (lead.nome || lead.empresa || '').trim()
  const key = matchKey(nome)
  if (!key) {
    console.warn(`  - ignorado (sem nome): id=${lead.id}`)
    fail++
    continue
  }
  const score = lead.score_serasa ?? null
  const payload = {
    match_key: key,
    nome,
    responsavel: (lead.responsavel || '').trim(),
    telefone: (lead.celular || lead.telefone || '').trim(),
    email: (lead.email || '').trim(),
    cidade: (lead.cidade || '').trim(),
    uf: (lead.estado || '').trim().toUpperCase(),
    status: 'ativo',
    cpf: String(lead.cpf || '').replace(/\D/g, ''),
    inscricao_estadual: (lead.inscricao_estadual || '').trim(),
    tem_inscricao_estadual: (lead.tem_inscricao_estadual || (lead.inscricao_estadual ? 'Sim' : '')).trim(),
    score_credito: score,
    score_faixa: scoreToFaixa(score),
    momento_pecuaria: (lead.momento_pecuaria || '').trim(),
    operacao_pecuaria: (lead.operacao_pecuaria || '').trim(),
    crm_lead_id: lead.id,
  }

  const { error: upErr } = await supabase.from('clientes').upsert(payload, { onConflict: 'match_key' })
  if (upErr) {
    console.warn(`  - falha upsert cliente "${nome}": ${upErr.message}`)
    fail++
    continue
  }
  const { error: arErr } = await supabase
    .from('crm_leads')
    .update({ arquivado: true, arquivado_at: new Date().toISOString() })
    .eq('id', lead.id)
  if (arErr) {
    console.warn(`  - cliente criado mas falha ao arquivar "${nome}": ${arErr.message}`)
    fail++
    continue
  }
  ok++
  console.log(`  ✓ ${nome} (${motivo}) → cliente + arquivado`)
}

console.log(`\nConcluído: ${ok} migrados, ${fail} com erro.`)
