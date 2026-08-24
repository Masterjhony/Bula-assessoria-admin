// Inclusões na agenda pedidas em 24/08/2026.
//
// - 29/08 4º LEILÃO NELORE CRISPIM ("A Dinastia Genética"), 13h30, matrizes e
//   novilhas Nelore P.O. Arte oficial recebida no WhatsApp.
// - 27/09 PARANÃ TOUROS. Veio como mensagem encaminhada ("27/09 -> PARANÃ
//   TOUROS", 24/08 12:34), sem arte e sem mais nenhum detalhe.
//
// Os dois são leilões NOVOS: não existiam em cronograma_leiloes nem em
// bula_leiloes. Criados nas três tabelas (cronograma_leiloes, bula_leiloes,
// agenda_events).
//
// ATENÇÃO: nenhum dos dois está na planilha ESCALA, então o próximo
// `node scripts/sync-escala-leiloes-2026.mjs` sem `--keep-extras` APAGA os
// registros como "extras no banco" — ver [[sync-escala-capas-checklist]]. O
// botão do admin passa a flag; rodar o script na mão não passa.
//
// Campo que a fonte não informa fica em branco de propósito, em vez de
// chutado: leiloeira, transmissão, local e modalidade nos dois; e no Paranã
// também a hora, a raça e o sexo.
//
// Uso: node scripts/agenda-2026-08-24-inclusoes.mjs [--dry]

import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const dry = process.argv.includes('--dry')
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

const LEILOES = [
  {
    data: '2026-08-29',
    dia_semana: 'sábado',
    nome: '4º LEILÃO NELORE CRISPIM',
    hora: '13:30',
    criador: 'NELORE CRISPIM',
    raca: 'NELORE',
    sexo: 'FÊMEAS',
    condicao: '"A Dinastia Genética" — matrizes e novilhas Nelore P.O.',
    capa: 'F:\\nelore crispim 4o leilao.png',
    capaMime: 'image/png',
    path: 'escala-2026/2026-08-29-4o-leilao-nelore-crispim-arte-oficial.png',
  },
  {
    data: '2026-09-27',
    dia_semana: 'domingo',
    nome: 'PARANÃ TOUROS',
    hora: null,
    criador: null,
    raca: null,
    sexo: null,
    condicao: '',
    capa: null, // sem arte ate agora
    capaMime: null,
    path: null,
  },
]

for (const leilao of LEILOES) {
  console.log(`\n=== ${leilao.data} — ${leilao.nome} ===`)

  // Guarda contra rodar duas vezes e criar duplicata.
  const { data: jaExiste, error: dupErr } = await supabase
    .from('cronograma_leiloes')
    .select('id')
    .eq('nome', leilao.nome)
    .eq('data', leilao.data)
    .maybeSingle()
  if (dupErr) throw new Error(`SELECT cronograma_leiloes: ${dupErr.message}`)
  if (jaExiste) {
    console.log(`  ja existe em cronograma_leiloes (${jaExiste.id}) — pulando`)
    continue
  }

  let coverUrl = null
  if (leilao.capa) {
    if (!existsSync(leilao.capa)) {
      console.error(`  !! capa nao encontrada: ${leilao.capa} — pulando`)
      continue
    }
    const bytes = readFileSync(leilao.capa)
    if (dry) {
      console.log(`  [dry] subiria ${(bytes.length / 1024).toFixed(1)} KB -> leilao-covers/${leilao.path}`)
    } else {
      const { error } = await supabase.storage.from('leilao-covers').upload(leilao.path, bytes, {
        contentType: leilao.capaMime,
        upsert: true,
        cacheControl: '31536000',
      })
      if (error) throw new Error(`UPLOAD ${leilao.path}: ${error.message}`)
      coverUrl = supabase.storage.from('leilao-covers').getPublicUrl(leilao.path).data.publicUrl
      console.log(`  capa: ${coverUrl}`)
    }
  } else {
    console.log('  sem arte — entra sem capa')
  }

  const cronoId = randomUUID()
  const crono = {
    id: cronoId,
    data: leilao.data,
    nome: leilao.nome,
    dia_semana: leilao.dia_semana,
    hora: leilao.hora,
    criador: leilao.criador,
    presencial: null,
    leiloeira: null,
    raca: leilao.raca,
    qtd_animais: null,
    sexo: leilao.sexo,
    img: coverUrl,
  }

  const pubId = randomUUID()
  const pub = {
    id: pubId,
    nome: leilao.nome,
    data: leilao.data,
    tipo: leilao.raca ?? 'Leilao',
    local: '',
    animais: 0,
    status: 'confirmado',
    horario: leilao.hora ?? '',
    modelo: '',
    leiloeira: '',
    transmissao: '',
    condicao: leilao.condicao,
    img: coverUrl ?? '',
    cronograma_id: cronoId,
  }

  // Sem hora na fonte, o evento cai as 09:00 e fica marcado como dia inteiro,
  // mesma convencao do sync-escala.
  const startAt = `${leilao.data}T${leilao.hora || '09:00'}:00-03:00`
  const evento = {
    title: leilao.nome,
    description: [
      leilao.criador ? `Criador: ${leilao.criador}` : '',
      leilao.raca ? `Raca: ${leilao.raca}` : '',
      leilao.sexo ? `Sexo: ${leilao.sexo}` : '',
      leilao.condicao ? `Obs.: ${leilao.condicao}` : '',
    ].filter(Boolean).join('\n'),
    event_type: 'leilao',
    status: 'planejado',
    priority: 'media',
    start_at: startAt,
    end_at: leilao.hora ? new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString() : null,
    all_day: !leilao.hora,
    location: null,
    color: '#A68B4B',
    notes: 'Cadastrado em 24/08/2026 (scripts/agenda-2026-08-24-inclusoes.mjs).',
    linked_leilao_id: cronoId,
  }

  if (dry) {
    console.log('  [dry] cronograma_leiloes INSERT:', JSON.stringify(crono))
    console.log('  [dry] bula_leiloes INSERT:', JSON.stringify(pub))
    console.log('  [dry] agenda_events INSERT:', JSON.stringify(evento))
  } else {
    let { error } = await supabase.from('cronograma_leiloes').insert(crono)
    if (error) throw new Error(`INSERT cronograma_leiloes: ${error.message}`)
    console.log(`  cronograma_leiloes: criado (${cronoId})`)

    ;({ error } = await supabase.from('bula_leiloes').insert(pub))
    if (error) throw new Error(`INSERT bula_leiloes: ${error.message}`)
    console.log(`  bula_leiloes: criado (${pubId})`)

    ;({ error } = await supabase.from('agenda_events').insert(evento))
    if (error) throw new Error(`INSERT agenda_events: ${error.message}`)
    console.log(`  agenda_events: criado (${startAt})`)
  }
}

console.log('\nOK — inclusoes processadas.')
if (!dry) {
  console.log('\nLEMBRETE: os dois nao estao na planilha ESCALA. O proximo sync-escala')
  console.log('sem --keep-extras apaga os registros como "extras no banco".')
}
