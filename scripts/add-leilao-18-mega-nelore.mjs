// Adiciona o "18º Mega Leilão Nelore" (Redenção/PA, 30/05/2026) que ficou
// fora da agenda ("comemos mosca" — Marcelo Primo Carneiro). Grava em
// bula_leiloes (agenda pública, status=concluido) e cronograma_leiloes
// (agenda interna). Dados extraídos da arte do leilão encaminhada.
//
// Sem fechamento: não há lotes de cobertura claramente ligados a este evento.
// Idempotente: busca por nome+data e atualiza em vez de duplicar.
//
// Uso: node scripts/add-leilao-18-mega-nelore.mjs

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
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DATA = '2026-05-30'
const NOME = '18º Mega Leilão Nelore'

// ── 1. bula_leiloes (agenda pública) ─────────────────────────
const LEILAO = {
  nome: NOME,
  data: DATA,
  tipo: '60 touros — Nelore e Nelore Mocho',
  local: 'Redenção/PA',
  animais: 60,
  expectativa: 0,
  meta_bula: 0,
  realizado_bula: 0,
  status: 'concluido',          // já aconteceu (30/05); entra em "realizados" da agenda
  img: '',                      // arte só disponível dentro de print de WhatsApp — capa pendente
  horario: '12:00',
  transmissao: '',
  modelo: 'PRESENCIAL',
  leiloeira: '',                // leiloeira não informada na arte
  condicao: '',
  frete_gratis: '',
  acordo_comissao: '',
  catalogo_url: null,
  tasks: [],
}

{
  const { data: existing, error: selErr } = await supabase
    .from('bula_leiloes')
    .select('id')
    .eq('nome', LEILAO.nome)
    .eq('data', LEILAO.data)
    .maybeSingle()
  if (selErr) { console.error('SELECT bula_leiloes:', selErr.message); process.exit(1) }

  if (existing) {
    const { error } = await supabase.from('bula_leiloes').update(LEILAO).eq('id', existing.id)
    if (error) { console.error('UPDATE bula_leiloes:', error.message); process.exit(1) }
    console.log(`bula_leiloes: atualizado (id=${existing.id})`)
  } else {
    const { data: ins, error } = await supabase.from('bula_leiloes').insert(LEILAO).select('id').single()
    if (error) { console.error('INSERT bula_leiloes:', error.message); process.exit(1) }
    console.log(`bula_leiloes: criado (id=${ins.id})`)
  }
}

// ── 2. cronograma_leiloes (agenda interna) ───────────────────
const CRONO = {
  data: DATA,
  dia_semana: 'Sábado',
  hora: '12:00',
  nome: '18º MEGA LEILÃO NELORE',
  criador: '',
  presencial: 'PRESENCIAL',
  leiloeira: '',
  raca: 'Nelore / Nelore Mocho',
  qtd_animais: 60,
  sexo: 'MACHOS',
  comissao: '',
  contrato: 'NÃO',
  recebido: 'NÃO',
}

{
  const { data: existing, error: selErr } = await supabase
    .from('cronograma_leiloes')
    .select('id')
    .eq('nome', CRONO.nome)
    .eq('data', CRONO.data)
    .maybeSingle()
  if (selErr) { console.error('SELECT cronograma_leiloes:', selErr.message); process.exit(1) }

  if (existing) {
    const { error } = await supabase.from('cronograma_leiloes').update(CRONO).eq('id', existing.id)
    if (error) { console.error('UPDATE cronograma_leiloes:', error.message); process.exit(1) }
    console.log(`cronograma_leiloes: atualizado (id=${existing.id})`)
  } else {
    const { data: ins, error } = await supabase.from('cronograma_leiloes').insert(CRONO).select('id').single()
    if (error) { console.error('INSERT cronograma_leiloes:', error.message); process.exit(1) }
    console.log(`cronograma_leiloes: criado (id=${ins.id})`)
  }
}

console.log('\nOK — 18º Mega Leilão Nelore (30/05, Redenção/PA) na agenda.')
console.log('⚠ Capa pendente: enviar a arte limpa do leilão para subir em leilao-covers.')
