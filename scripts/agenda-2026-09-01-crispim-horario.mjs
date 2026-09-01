// 03/09 — TOUROS NELORE CRISPIM: completa o que faltava, lendo a arte que já estava
// no card.
//
// A capa do Crispim foi subida pelo admin (o arquivo no bucket tem nome de upload
// pela UI, `1788286174536-sb1yzpmtk9.jpeg`, não o padrão `escala-2026/...` dos
// scripts), então o card ficou com arte mas sem horário nem leiloeira — foi ele que
// o Marcelo printou às 15:19.
//
// A arte é o "2º Leilão @Nelore Crispim — Herança Genética", oferta de TOUROS Nelore
// Crispim: **03 de setembro, 19h00**, plataforma e-rural, oferecimento erural pay,
// transmissão erural.net e YouTube @erural_br. Mesma estrutura e-rural do Geração
// Elite (15/09) e do Bela Aurora (17/09).
//
// O `nome` fica como está: quem subiu a capa manteve TOUROS NELORE CRISPIM, que é o
// que a arte traz em destaque, e não cabe a este script desfazer essa escolha.
// `condicao` continua VAZIA — o Marcelo acabou de mandar tirar texto desse card
// ([[agenda-2026-09-01-limpa-metatexto.mjs]]); aqui só entram campos estruturados.
//
// ⚠ Essa arte NÃO traz o logo da Bula no rodapé, ao contrário das outras duas da
// mesma leva. O Marcelo pediu no grupo "favor colocar a logo da Bula Assessoria em
// todos esses flyers" — é assunto para a e-rural, não para o cadastro.
//
// Uso: node scripts/agenda-2026-09-01-crispim-horario.mjs [--dry]

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const dry = process.argv.includes('--dry')
const root = 'F:/Projetos/Desktop/web-bula'

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DATA = '2026-09-03'
const HORA = '19:00'
const LEILOEIRA = 'E-RURAL'
const TRANSMISSAO = 'erural.net e YouTube @erural_br'

const { data: crono, error: cronoErr } = await supabase
  .from('cronograma_leiloes')
  .select('id, nome, hora, leiloeira')
  .eq('data', DATA)
  // ilike porque quem subiu a capa editou pelo admin, e o FormModal propagou o nome
  // publico (title case) para o cronograma — ver [[leilao-edicao-duas-tabelas]].
  .ilike('nome', 'touros nelore crispim')
  .maybeSingle()
if (cronoErr) throw new Error(`SELECT cronograma_leiloes: ${cronoErr.message}`)
if (!crono) throw new Error('nao achei TOUROS NELORE CRISPIM em 2026-09-03')

console.log(`cronograma: ${crono.nome} — hora ${crono.hora || '(vazia)'}, leiloeira ${crono.leiloeira || '(vazia)'}`)

if (dry) {
  console.log(`[dry] cronograma_leiloes UPDATE: hora=${HORA}, leiloeira=${LEILOEIRA}`)
} else {
  const { error } = await supabase
    .from('cronograma_leiloes')
    .update({ hora: HORA, leiloeira: LEILOEIRA })
    .eq('id', crono.id)
  if (error) throw new Error(`UPDATE cronograma_leiloes: ${error.message}`)
  console.log(`cronograma_leiloes: atualizado (${crono.id})`)
}

const { data: pub, error: pubErr } = await supabase
  .from('bula_leiloes')
  .select('id, nome, horario, leiloeira, local')
  .eq('cronograma_id', crono.id)
  .maybeSingle()
if (pubErr) throw new Error(`SELECT bula_leiloes: ${pubErr.message}`)
if (!pub) throw new Error(`nao achei o par publico de ${crono.id}`)

if (dry) {
  console.log(`[dry] bula_leiloes UPDATE: horario=${HORA}, leiloeira=${LEILOEIRA}, transmissao=${TRANSMISSAO}`)
} else {
  const { error } = await supabase
    .from('bula_leiloes')
    .update({ horario: HORA, leiloeira: LEILOEIRA, transmissao: TRANSMISSAO })
    .eq('id', pub.id)
  if (error) throw new Error(`UPDATE bula_leiloes: ${error.message}`)
  console.log(`bula_leiloes: atualizado (${pub.id})`)
}

const startAt = `${DATA}T${HORA}:00-03:00`
const evento = {
  title: pub.nome,
  description: ['Criador: NELORE CRISPIM', `Leiloeira: ${LEILOEIRA}`, 'Raca: NELORE', 'Sexo: MACHOS',
    'Qtd.: 14 TOUROS', `Transmissao: ${TRANSMISSAO}`].join('\n'),
  event_type: 'leilao',
  status: 'planejado',
  priority: 'media',
  start_at: startAt,
  end_at: new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString(),
  all_day: false,
  location: pub.local || null,
  color: '#A68B4B',
  notes: 'Horario e leiloeira lidos da arte que ja estava no card, em 01/09/2026 '
    + '(scripts/agenda-2026-09-01-crispim-horario.mjs).',
  linked_leilao_id: crono.id,
}

if (dry) {
  console.log(`[dry] agenda_events -> ${startAt}`)
} else {
  await supabase.from('agenda_events').delete().eq('linked_leilao_id', crono.id)
  const { error } = await supabase.from('agenda_events').insert(evento)
  if (error) throw new Error(`INSERT agenda_events: ${error.message}`)
  console.log(`agenda_events: evento recriado (${startAt})`)
}

console.log('\nOK — Crispim 03/09 com horario.')
