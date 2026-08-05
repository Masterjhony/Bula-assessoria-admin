// Adiciona o Leilão Nelore Mafra Agronova & Amigos (18/08/2026, terça, 12h),
// durante a 19ª ExpoGenética — não estava na planilha ESCALA.
//
// Origem: arte recebida em 05/08/2026 (F:\nelore MAFRA.jpeg, print do Instagram).
// A capa é recortada nos 1480px de cima para tirar os ícones do app e
// convertida em webp 1080 — mesmo tratamento que o sync da planilha dá.
//
// Uso: node scripts/add-leilao-nelore-mafra-agronova-2026-08-18.mjs

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios em .env.local')
  process.exit(1)
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Mesmo checklist padrão que o sync da planilha semeia nos leilões novos.
const CHECKLIST_ITENS = [
  ['plan-catalogo', 'Catálogo'],
  ['plan-videos-curral', 'Vídeos de curral'],
  ['plan-logo-png', 'Logo (PNG)'],
  ['plan-avaliacao', 'Avaliação'],
  ['plan-divulgacao-clientes-perfil', 'Divulgação: clientes perfil'],
  ['plan-divulgacao-grupo', 'Divulgação: grupo'],
  ['plan-divulgacao-instagram', 'Divulgação: Instagram'],
  ['plan-leilao-realizado', 'Leilão realizado'],
  ['plan-fechamento-realizado', 'Fechamento realizado'],
  ['plan-contas-a-receber-e-a-pagar', 'Contas a receber e a pagar'],
]

function checklistPadrao() {
  return [
    {
      nome: 'Produção & Divulgação',
      cor: '#111827',
      subtitulo: 'Checklist padrão',
      origem: 'seed',
      tasks: CHECKLIST_ITENS.map(([id, nome]) => ({
        id,
        nome,
        ini: '',
        fim: '',
        resp: { ini: '', nome: '' },
        subs: [],
        done: false,
        observacao: '',
        anexos: [],
      })),
    },
  ]
}

const DATA = '2026-08-18'
const DIA_SEMANA = 'terça-feira'
const HORA = '12:00'
const NOME = 'LEILÃO NELORE MAFRA AGRONOVA & AMIGOS'
const CRIADOR = 'NELORE MAFRA E AGRONOVA GENETICS'
const LEILOEIRA = 'PROGRAMA LEILÕES'
const LOCAL = 'Chácara Mafra — Uberaba/MG'
const TRANSMISSAO = 'Canal Rural'
const RACA = 'NELORE'
const SEXO = 'FÊMEAS'
const COVER_SRC = 'F:\\nelore MAFRA.jpeg'
const COVER_PATH = 'escala-2026/2026-08-18-leilao-nelore-mafra-agronova-amigos.webp'
const REALIZACAO = 'Nelore Mafra, Agronova Genetics, JMP Nelore, Nelore BOMM, Gran Nelore e Fazenda Barroca'

async function upsertByNameDate(table, payload) {
  const { data: existing, error: selectError } = await supabase
    .from(table)
    .select('id')
    .eq('nome', payload.nome)
    .eq('data', payload.data)
    .maybeSingle()

  if (selectError) throw new Error(`SELECT ${table}: ${selectError.message}`)

  if (existing) {
    const { error } = await supabase.from(table).update(payload).eq('id', existing.id)
    if (error) throw new Error(`UPDATE ${table}: ${error.message}`)
    return { action: 'atualizado', id: existing.id }
  }

  const { data: inserted, error } = await supabase.from(table).insert(payload).select('id').single()
  if (error) throw new Error(`INSERT ${table}: ${error.message}`)
  return { action: 'criado', id: inserted.id }
}

if (!existsSync(COVER_SRC)) {
  console.error(`Capa nao encontrada: ${COVER_SRC}`)
  process.exit(1)
}

const original = sharp(COVER_SRC)
const meta = await original.metadata()
const cover = await sharp(COVER_SRC)
  .extract({ left: 0, top: 0, width: meta.width, height: Math.min(1480, meta.height) })
  .resize({ width: 1080, withoutEnlargement: true })
  .webp({ quality: 82 })
  .toBuffer()

console.log(`Capa ${meta.width}x${meta.height} -> webp ${(cover.length / 1024).toFixed(1)} KB`)
const { error: uploadError } = await supabase.storage.from('leilao-covers').upload(COVER_PATH, cover, {
  contentType: 'image/webp',
  upsert: true,
  cacheControl: '31536000',
})
if (uploadError) throw new Error(`UPLOAD capa: ${uploadError.message}`)

const { data: publicUrlData } = supabase.storage.from('leilao-covers').getPublicUrl(COVER_PATH)
const coverUrl = publicUrlData.publicUrl
console.log(`Capa publica: ${coverUrl}`)

const crono = await upsertByNameDate('cronograma_leiloes', {
  data: DATA,
  dia_semana: DIA_SEMANA,
  hora: HORA,
  nome: NOME,
  criador: CRIADOR,
  presencial: 'PRESENCIAL',
  leiloeira: LEILOEIRA,
  raca: RACA,
  qtd_animais: null,
  sexo: SEXO,
  comissao: '',
  contrato: '',
  faturamento_previsto: '',
  faturamento_realizado: '',
  venda_bula: '',
  comissao_receber: '',
  recebido: '',
  catalogo_url: null,
  img: coverUrl,
})
console.log(`cronograma_leiloes: ${crono.action} (id=${crono.id})`)

const publico = await upsertByNameDate('bula_leiloes', {
  nome: NOME,
  data: DATA,
  tipo: RACA,
  local: LOCAL,
  animais: 0,
  expectativa: 0,
  meta_bula: 0,
  realizado_bula: 0,
  status: 'confirmado',
  img: coverUrl,
  horario: HORA,
  transmissao: TRANSMISSAO,
  modelo: 'PRESENCIAL',
  leiloeira: LEILOEIRA,
  condicao: '',
  frete_gratis: '',
  acordo_comissao: '',
  catalogo_url: null,
  tasks: checklistPadrao(),
  cronograma_id: crono.id,
})
console.log(`bula_leiloes: ${publico.action} (id=${publico.id})`)

const agendaPayload = {
  id: randomUUID(),
  title: NOME,
  description: [
    `Criador: ${CRIADOR}`,
    `Leiloeira: ${LEILOEIRA}`,
    `Raça: ${RACA}`,
    `Sexo: ${SEXO}`,
    `Local: ${LOCAL}`,
    'Tema da arte: "Fêmeas que multiplicam excelência".',
    `Transmissão: ${TRANSMISSAO}.`,
    'Durante a 19ª ExpoGenética.',
    `Realização: ${REALIZACAO}.`,
  ]
    .filter(Boolean)
    .join('\n'),
  event_type: 'leilao',
  status: 'planejado',
  priority: 'media',
  start_at: `${DATA}T${HORA}:00-03:00`,
  end_at: `${DATA}T23:59:00-03:00`,
  all_day: false,
  location: LOCAL,
  color: '#A68B4B',
  notes: `Adicionado por ${basename(import.meta.url)} a partir da arte ${COVER_SRC} (05/08/2026). Ainda nao consta na planilha ESCALA.`,
  linked_leilao_id: crono.id,
}

const { error: deleteAgendaError } = await supabase
  .from('agenda_events')
  .delete()
  .eq('linked_leilao_id', crono.id)
if (deleteAgendaError) throw new Error(`DELETE agenda_events: ${deleteAgendaError.message}`)

const { error: insertAgendaError } = await supabase.from('agenda_events').insert(agendaPayload)
if (insertAgendaError) throw new Error(`INSERT agenda_events: ${insertAgendaError.message}`)
console.log(`agenda_events: recriado (linked_leilao_id=${crono.id})`)

console.log('\nOK — Leilão Nelore Mafra Agronova & Amigos (18/08/2026, 12h) na agenda com capa.')
