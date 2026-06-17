// Cadastra o "LEILÃO VIRTUAL NELORE MEAB & FAZENDA MODELO" (23/06/2026, 19h).
//
// Fonte dos dados: planilha ESCALA LEILÕES 2026 (linha de 23/06) + arte da capa.
//   Data ......... 23/06/2026 (terça-feira) às 19h
//   Modalidade ... VIRTUAL (transmissão RuralPlay)
//   Leiloeira .... BULA REMATES
//   Raça ......... NELORE PADRÃO — Fêmeas (matrizes, novilhas e bezerras)
//   Acordo ....... 1% do faturamento total
//
// Escreve as 3 linhas que o sistema mantém em sincronia para cada leilão:
//   1. cronograma_leiloes  (espelho da planilha / fonte da verdade)
//   2. bula_leiloes        (card admin/público) — com capa, checklist e cronograma_id
//   3. agenda_events       (agenda pública) — linkado ao cronograma
//
// Idempotente: faz upsert por nome+data; recria o evento da agenda.
// Roda como service_role lendo .env.local.
//
// Uso: node scripts/add-leilao-nelore-meab.mjs

import { readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
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

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Dados do leilão ──────────────────────────────────────────
const DATA = '2026-06-23'
const NOME = 'LEILÃO VIRTUAL NELORE MEAB & FAZENDA MODELO'
const HORA = '19:00'
const LEILOEIRA = 'BULA REMATES'
const RACA = 'NELORE PADRÃO'
const SEXO = 'FÊMEAS'
const ACORDO = '1% do faturamento total'

// ── Checklist padrão (mesma estrutura do FormModal em
//    src/app/sistema/leiloes/page.tsx) ───────────────────────
const EMPTY_RESP = { nome: '', ini: '' }
const mkTask = (id, nome) => ({
  id, nome, ini: '', fim: '', resp: { ...EMPTY_RESP }, subs: [], done: false, observacao: '', anexos: [],
})

const DEFAULT_TASKS = [
  {
    nome: 'Pré-Leilão',
    subtitulo: 'Organização dos materiais e classificação dos lotes',
    cor: '#4A8FBF',
    tasks: [
      mkTask('pre-1', 'Receber catálogo em PDF'),
      mkTask('pre-2', 'Receber link do YouTube com os lotes'),
      mkTask('pre-3', 'Receber artes para divulgação'),
      mkTask('pre-4', 'Comitê de avaliação dos lotes e classificação'),
      mkTask('pre-5', 'Adicionar leilão no catálogo da semana'),
      mkTask('pre-6', 'Divulgação no grupo de WhatsApp pré-leilão'),
      mkTask('pre-7', 'Realizar mapa de leilão, direcionando clientes para lotes específicos'),
    ],
  },
  {
    nome: 'Dia do Leilão',
    subtitulo: 'Dia do leilão',
    cor: '#C8A96E',
    tasks: [
      mkTask('dia-1', 'Mandar lotes e avaliações para todos os clientes mapeados'),
      mkTask('dia-2', 'Garantir que todos os clientes estejam cadastrados corretamente'),
      mkTask('dia-3', 'Realizar ligação para os principais clientes'),
      mkTask('dia-4', 'Fazer divulgação massiva dos lotes na hora do leilão'),
      mkTask('dia-5', 'Ao fim do leilão, enviar todos os lotes vendidos com informações no grupo de WhatsApp'),
    ],
  },
  {
    nome: 'Pós-Leilão',
    subtitulo: 'Atividades pós-leilão',
    cor: '#6B8F5C',
    tasks: [
      mkTask('pos-1', 'Fechamento e análise do leilão'),
      mkTask('pos-2', 'Envio de contas a pagar e a receber para financeiro'),
      mkTask('pos-3', 'Provisionar pagamento e comunicar assessores'),
      mkTask('pos-4', 'Postar agradecimento ao criatório nos canais de comunicação'),
    ],
  },
]

// helper upsert por nome+data
async function upsertByNameDate(table, payload, select = 'id') {
  const { data: existing, error: selErr } = await supabase
    .from(table)
    .select(select)
    .eq('nome', payload.nome)
    .eq('data', payload.data)
    .maybeSingle()
  if (selErr) throw new Error(`SELECT ${table}: ${selErr.message}`)

  if (existing) {
    const { error } = await supabase.from(table).update(payload).eq('id', existing.id)
    if (error) throw new Error(`UPDATE ${table}: ${error.message}`)
    return { id: existing.id, action: 'atualizado' }
  }
  const { data: inserted, error } = await supabase.from(table).insert(payload).select('id').single()
  if (error) throw new Error(`INSERT ${table}: ${error.message}`)
  return { id: inserted.id, action: 'criado' }
}

// ── 1. Upload da capa ────────────────────────────────────────
const COVER_SRC = String.raw`C:\Users\Notebook-Acer\.claude\image-cache\b3b7389e-91b7-4050-bc4e-bd8d816150bd\2.png`
const fileBytes = readFileSync(COVER_SRC)
const coverPath = `escala-2026/2026-06-23-nelore-meab-fazenda-modelo.png`

console.log(`Subindo capa (${(fileBytes.length / 1024).toFixed(1)} KB) -> leilao-covers/${coverPath}`)
const { error: upErr } = await supabase.storage
  .from('leilao-covers')
  .upload(coverPath, fileBytes, { contentType: 'image/png', upsert: true })
if (upErr) throw new Error(`Upload capa: ${upErr.message}`)
const { data: pub } = supabase.storage.from('leilao-covers').getPublicUrl(coverPath)
const coverUrl = pub.publicUrl
console.log('Capa pública:', coverUrl)

// ── 2. cronograma_leiloes (espelho da planilha) ──────────────
const cronoPayload = {
  data: DATA,
  dia_semana: 'terça-feira',
  hora: HORA,
  nome: NOME,
  criador: 'NELORE MEAB & FAZENDA MODELO',
  presencial: 'VIRTUAL',
  leiloeira: LEILOEIRA,
  raca: RACA,
  qtd_animais: '',
  sexo: SEXO,
  comissao: ACORDO,
  contrato: '',
  recebido: '',
  img: coverUrl,
}
const crono = await upsertByNameDate('cronograma_leiloes', cronoPayload)
console.log(`cronograma_leiloes: ${crono.action} (id=${crono.id})`)

// ── 3. bula_leiloes (card admin/público) ─────────────────────
const publicPayload = {
  nome: NOME,
  data: DATA,
  tipo: RACA,
  local: 'VIRTUAL',
  animais: 0,
  expectativa: 0,
  meta_bula: 0,
  realizado_bula: 0,
  status: 'confirmado',
  img: coverUrl,
  horario: HORA,
  transmissao: 'RURALPLAY',
  modelo: 'VIRTUAL',
  leiloeira: LEILOEIRA,
  condicao: '',
  frete_gratis: '',
  acordo_comissao: ACORDO,
  catalogo_url: null,
  tasks: DEFAULT_TASKS,
  cronograma_id: crono.id,
}
const publico = await upsertByNameDate('bula_leiloes', publicPayload)
console.log(`bula_leiloes: ${publico.action} (id=${publico.id})`)

// ── 4. agenda_events (agenda pública) ────────────────────────
const agendaPayload = {
  id: randomUUID(),
  title: NOME,
  description: [
    `Leiloeira: ${LEILOEIRA}`,
    'Criador: NELORE MEAB & FAZENDA MODELO',
    `Raca: ${RACA}`,
    `Sexo: ${SEXO} (matrizes, novilhas e bezerras)`,
    'Transmissao: RuralPlay',
    `Comissao: ${ACORDO}`,
  ].join('\n'),
  event_type: 'leilao',
  status: 'planejado',
  priority: 'media',
  start_at: `${DATA}T${HORA}:00-03:00`,
  end_at: `${DATA}T21:00:00-03:00`,
  all_day: false,
  location: 'VIRTUAL',
  color: '#A68B4B',
  notes: `Adicionado por ${basename(import.meta.url)} a partir da planilha ESCALA LEILÕES 2026 e da arte da capa.`,
  linked_leilao_id: crono.id,
}

const { error: delAgendaErr } = await supabase
  .from('agenda_events')
  .delete()
  .eq('linked_leilao_id', crono.id)
if (delAgendaErr) throw new Error(`DELETE agenda_events: ${delAgendaErr.message}`)

const { error: insAgendaErr } = await supabase.from('agenda_events').insert(agendaPayload)
if (insAgendaErr) throw new Error(`INSERT agenda_events: ${insAgendaErr.message}`)
console.log(`agenda_events: recriado (linked_leilao_id=${crono.id})`)

console.log('\nOK — leilão cadastrado. Abra /sistema/leiloes (card em 23/Jun/2026) e a agenda pública.')
