// Arte baixada em 28/08/2026 (F:\WhatsApp Image 2026-08-27 at 23.02.31.jpeg).
//
// LEILÃO PRIMAVERA GENÉTICA ADITIVA — ETAPA FÊMEAS
//   27/09/2026 (domingo), 9h de Brasilia, VIRTUAL.
//   Leiloeira Programa Leiloes; transmissao Canal do Criador (retransmissao
//   Remate Web); avaliacoes GenePlus, PMGZ e ANCP; realizacao Genetica Aditiva.
//   Pagamento em 30 parcelas (2+2+2+2+2+20), frete gratis conforme regulamento.
//
// Nao existe no banco (as unicas "ADITIVA" cadastradas sao 25/07, 26/07 e
// 19/08, todas passadas). Entra como registro NOVO nas tres tabelas.
//
// A arte diz "Etapa Femeas", o que sugere uma etapa de touros; ela nao foi
// baixada e a arte nao informa data — nao invento o segundo registro.
//
// O dia 27/09 ja tem PARANA TOUROS na agenda; sao leiloes diferentes e
// convivem na mesma data.
//
// Nome: o cronograma (interno/ERP) fica em caixa-alta e a agenda publica
// recebe o titulo do cartaz — mesma convencao dos leiloes Genetica Aditiva de
// julho. O vinculo entre as duas linhas e o cronograma_id, nao o nome.
//
// Uso: node scripts/agenda-2026-08-28-genetica-aditiva-primavera.mjs [--dry]

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
    data: '2026-09-27',
    dia_semana: 'domingo',
    nome: 'LEILÃO PRIMAVERA GENÉTICA ADITIVA - FÊMEAS',
    nomePublico: 'Leilão Primavera Genética Aditiva — Etapa Fêmeas',
    hora: '09:00',
    criador: 'GENÉTICA ADITIVA',
    presencial: 'VIRTUAL',
    local: 'VIRTUAL',
    leiloeira: 'PROGRAMA LEILÕES',
    raca: 'NELORE',
    sexo: 'FÊMEAS',
    qtd_animais: null,
    transmissao: 'Canal do Criador (retransmissão Remate Web)',
    condicao: 'Leilão Primavera Genética Aditiva — Etapa Fêmeas. Virtual, domingo 27/09/2026 às 9h '
      + '(horário de Brasília). Pagamento em 30 parcelas (2+2+2+2+2+20); frete grátis conforme regulamento. '
      + 'Realização Genética Aditiva (pecuária de precisão); leiloeira Programa Leilões; transmissão Canal do '
      + 'Criador com retransmissão Remate Web; avaliações GenePlus, PMGZ e ANCP. '
      + 'Informações: Claudinei (67) 99984-6958, Natiélly (67) 99982-8028, Flavio (67) 98152-1488.',
    capa: 'F:\\WhatsApp Image 2026-08-27 at 23.02.31.jpeg',
    capaMime: 'image/jpeg',
    path: 'escala-2026/2026-09-27-leilao-primavera-genetica-aditiva-femeas-arte.jpeg',
  },
]

// Só grava onde o banco está vazio: edição manual anterior sempre vence.
const keep = (novo, atual) => {
  if (atual != null && String(atual).trim() !== '') return atual
  return novo
}

for (const leilao of LEILOES) {
  console.log(`\n=== ${leilao.data} — ${leilao.nome} ===`)

  if (!existsSync(leilao.capa)) {
    console.error(`  !! capa nao encontrada: ${leilao.capa} — pulando`)
    continue
  }

  let coverUrl = null
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

  const { data: crono, error: cronoSelErr } = await supabase
    .from('cronograma_leiloes')
    .select('*')
    .eq('nome', leilao.nome)
    .eq('data', leilao.data)
    .maybeSingle()
  if (cronoSelErr) throw new Error(`SELECT cronograma_leiloes: ${cronoSelErr.message}`)

  const cronoId = crono?.id ?? randomUUID()
  const cronoPatch = {
    id: cronoId,
    data: leilao.data,
    nome: leilao.nome,
    dia_semana: keep(leilao.dia_semana, crono?.dia_semana),
    hora: keep(leilao.hora, crono?.hora),
    criador: keep(leilao.criador, crono?.criador),
    presencial: keep(leilao.presencial, crono?.presencial),
    leiloeira: keep(leilao.leiloeira, crono?.leiloeira),
    raca: keep(leilao.raca, crono?.raca),
    qtd_animais: keep(leilao.qtd_animais, crono?.qtd_animais),
    sexo: keep(leilao.sexo, crono?.sexo),
    img: coverUrl ?? crono?.img ?? null,
  }
  if (dry) {
    console.log(`  [dry] cronograma_leiloes ${crono ? 'UPDATE' : 'INSERT'}:`, JSON.stringify(cronoPatch))
  } else {
    const { error } = await supabase.from('cronograma_leiloes').upsert(cronoPatch, { onConflict: 'id' })
    if (error) throw new Error(`UPSERT cronograma_leiloes: ${error.message}`)
    console.log(`  cronograma_leiloes: ${crono ? 'atualizado' : 'criado'} (${cronoId})`)
  }

  // A agenda publica pode ja ter a linha com o titulo do cartaz OU com o nome
  // interno — procura pelos dois antes de decidir criar.
  let pub = null
  for (const candidato of [leilao.nomePublico, leilao.nome]) {
    const { data, error } = await supabase
      .from('bula_leiloes')
      .select('*')
      .eq('nome', candidato)
      .eq('data', leilao.data)
      .maybeSingle()
    if (error) throw new Error(`SELECT bula_leiloes: ${error.message}`)
    if (data) { pub = data; break }
  }

  const pubPatch = {
    id: pub?.id ?? randomUUID(),
    nome: pub?.nome || leilao.nomePublico,
    data: leilao.data,
    tipo: pub?.tipo && pub.tipo !== 'Leilao' ? pub.tipo : leilao.raca,
    local: keep(leilao.local, pub?.local) ?? '',
    animais: Number(pub?.animais) || 0,
    status: pub?.status || 'confirmado',
    horario: keep(leilao.hora, pub?.horario) ?? '',
    modelo: keep(leilao.presencial, pub?.modelo) ?? '',
    leiloeira: keep(leilao.leiloeira, pub?.leiloeira) ?? '',
    transmissao: keep(leilao.transmissao, pub?.transmissao) ?? '',
    condicao: keep(leilao.condicao, pub?.condicao) ?? '',
    img: coverUrl ?? pub?.img ?? '',
    cronograma_id: cronoId,
  }
  if (dry) {
    console.log(`  [dry] bula_leiloes ${pub ? 'UPDATE' : 'INSERT'}:`, JSON.stringify(pubPatch))
  } else {
    const { error } = await supabase.from('bula_leiloes').upsert(pubPatch, { onConflict: 'id' })
    if (error) throw new Error(`UPSERT bula_leiloes: ${error.message}`)
    console.log(`  bula_leiloes: ${pub ? 'atualizado' : 'criado'} (${pubPatch.id})`)
  }

  const horaEvento = cronoPatch.hora || '09:00'
  const startAt = `${leilao.data}T${horaEvento}:00-03:00`
  const detalhes = [
    cronoPatch.criador ? `Criador: ${cronoPatch.criador}` : '',
    cronoPatch.leiloeira ? `Leiloeira: ${cronoPatch.leiloeira}` : '',
    pubPatch.local ? `Local: ${pubPatch.local}` : '',
    cronoPatch.raca ? `Raca: ${cronoPatch.raca}` : '',
    cronoPatch.sexo ? `Sexo: ${cronoPatch.sexo}` : '',
    pubPatch.transmissao ? `Transmissao: ${pubPatch.transmissao}` : '',
  ].filter(Boolean).join('\n')

  const evento = {
    title: pubPatch.nome,
    description: detalhes,
    event_type: 'leilao',
    status: 'planejado',
    priority: 'media',
    start_at: startAt,
    end_at: cronoPatch.hora ? new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString() : null,
    all_day: !cronoPatch.hora,
    location: pubPatch.local || cronoPatch.presencial || null,
    color: '#A68B4B',
    notes: 'Cadastrado a partir da arte oficial em 28/08/2026 (scripts/agenda-2026-08-28-genetica-aditiva-primavera.mjs).',
    linked_leilao_id: cronoId,
  }

  if (dry) {
    console.log(`  [dry] agenda_events: substituiria o evento de ${cronoId} -> ${startAt}`)
  } else {
    await supabase.from('agenda_events').delete().eq('linked_leilao_id', cronoId)
    const { error } = await supabase.from('agenda_events').insert(evento)
    if (error) throw new Error(`INSERT agenda_events: ${error.message}`)
    console.log(`  agenda_events: evento recriado (${startAt})`)
  }
}

console.log('\nOK — lote de 28/08 processado.')
