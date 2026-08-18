// Enriquece o LEILÃO MELHORADORES ESPECIAL 30 ANOS (29/08/2026) com os dados da
// arte oficial. O leilão já existia na base, semeado pelo sync da planilha
// ESCALA, mas sem horário, local, modalidade, transmissão nem promotores.
//
// Origem: F:\melhoradores leilao.jpeg (recebida em 03/08/2026).
//
// O nome NÃO é alterado de propósito: o sync da planilha casa por nome+data e
// renomear aqui quebraria o pareamento. `tasks` também fica intocado para não
// zerar o checklist da equipe.
//
// Uso: node scripts/atualiza-leilao-melhoradores-2026-08-29.mjs

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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

const DATA = '2026-08-29'
const NOME = 'LEILÃO MELHORADORES ESPECIAL 30 ANOS'
const HORA = '12:00'
const LOCAL = 'ACRISSUL — Campo Grande/MS'
const TRANSMISSAO = 'RURALPLAY'
const CRIADOR = 'ESTÂNCIA BOCAIUVA E NELORE CABECEIRA'
// Quantidade e sexo NÃO são tocados: a planilha já gravou "45 TOUROS"/MACHOS e
// a regra aqui é só preencher o que estava vazio. A arte também anuncia 3
// doadoras prenhes — ajuste manual no admin se a equipe quiser contá-las.
const COVER_SRC = 'F:\\melhoradores leilao.jpeg'
const COVER_PATH = 'escala-2026/2026-08-29-leilao-melhoradores-especial-30-anos-arte-oficial.jpeg'

if (!existsSync(COVER_SRC)) {
  console.error(`Capa nao encontrada: ${COVER_SRC}`)
  process.exit(1)
}

const fileBytes = readFileSync(COVER_SRC)
console.log(`Subindo capa (${(fileBytes.length / 1024).toFixed(1)} KB) -> leilao-covers/${COVER_PATH}`)
const { error: uploadError } = await supabase.storage.from('leilao-covers').upload(COVER_PATH, fileBytes, {
  contentType: 'image/jpeg',
  upsert: true,
})
if (uploadError) throw new Error(`UPLOAD capa: ${uploadError.message}`)

const { data: publicUrlData } = supabase.storage.from('leilao-covers').getPublicUrl(COVER_PATH)
const coverUrl = publicUrlData.publicUrl
console.log(`Capa publica: ${coverUrl}`)

const { data: crono, error: cronoSelErr } = await supabase
  .from('cronograma_leiloes')
  .select('id')
  .eq('nome', NOME)
  .eq('data', DATA)
  .maybeSingle()
if (cronoSelErr) throw new Error(`SELECT cronograma_leiloes: ${cronoSelErr.message}`)
if (!crono) throw new Error(`Leilão não encontrado em cronograma_leiloes: ${NOME} (${DATA})`)

const { error: cronoUpdErr } = await supabase
  .from('cronograma_leiloes')
  .update({
    hora: HORA,
    criador: CRIADOR,
    presencial: 'PRESENCIAL',
    img: coverUrl,
  })
  .eq('id', crono.id)
if (cronoUpdErr) throw new Error(`UPDATE cronograma_leiloes: ${cronoUpdErr.message}`)
console.log(`cronograma_leiloes: atualizado (id=${crono.id})`)

const { data: bula, error: bulaUpdErr } = await supabase
  .from('bula_leiloes')
  .update({
    horario: HORA,
    local: LOCAL,
    modelo: 'PRESENCIAL',
    transmissao: TRANSMISSAO,
    img: coverUrl,
  })
  .eq('nome', NOME)
  .eq('data', DATA)
  .select('id')
if (bulaUpdErr) throw new Error(`UPDATE bula_leiloes: ${bulaUpdErr.message}`)
if (!bula?.length) throw new Error(`Leilão não encontrado em bula_leiloes: ${NOME} (${DATA})`)
console.log(`bula_leiloes: atualizado (id=${bula[0].id})`)

// O evento veio do sync como all_day com location = leiloeira. A arte dá hora e
// local reais.
const { error: agendaErr } = await supabase
  .from('agenda_events')
  .update({
    description: [
      'Promotores: ESTÂNCIA BOCAIUVA (Valdemir Alves de Oliveira) e NELORE CABECEIRA (Arley C. Silveira)',
      'Convidados especiais: Santa Tereza, Agropecuária Nova Luz e Sete Estrelas',
      'Leiloeira: BULA REMATES (67) 99249-7274',
      'Raça: NELORE PO',
      `Local: ${LOCAL}`,
      'Oferta indicada na arte: 45 touros Nelore PO avaliados (Embrapa/GenePlus) e 3 jovens doadoras destaque da safra, prenhes.',
      `Transmissão: ${TRANSMISSAO}.`,
      'Comissão: 0,5% a 2% do faturamento (tabela de performance Bula Remates).',
    ].join('\n'),
    start_at: `${DATA}T${HORA}:00-03:00`,
    end_at: `${DATA}T23:59:00-03:00`,
    all_day: false,
    location: LOCAL,
    notes: `Enriquecido por ${basename(import.meta.url)} a partir da arte ${COVER_SRC} (03/08/2026).`,
  })
  .eq('linked_leilao_id', crono.id)
if (agendaErr) throw new Error(`UPDATE agenda_events: ${agendaErr.message}`)
console.log(`agenda_events: atualizado (linked_leilao_id=${crono.id})`)

console.log('\nOK — LEILÃO MELHORADORES ESPECIAL 30 ANOS (29/08/2026) atualizado com a arte oficial.')
