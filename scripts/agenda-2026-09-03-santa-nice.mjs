// Inclusão de 03/09/2026 — SANTA NICE (10/10), cadastro mínimo.
//
// Fonte: o João, no chat: "10 de Outubro - Santa Nice lança isso na agenda também,
// só isso por enquanto depois subimos a capa e demais informações".
//
// Dessa frase só saem DATA e CRIATÓRIO. Hora, leiloeira, raça, sexo, quantidade,
// local, modalidade, transmissão e `condicao` ficam VAZIOS de propósito
// ([[agenda-leilao-sem-arte-fallback]]): não inventar campo que a fonte não traz, e
// o histórico do mesmo criatório em outro mês NÃO é fonte para o evento de agora.
// Em particular a leiloeira: os dois leilões Santa Nice de 2026 já cadastrados
// (06/06 MATRIZES e 19/08 RESERVA EXPOGENÉTICA) foram pela Programa Leilões, mas
// isso muda por evento — fica em branco até o cartaz chegar.
//
// Grafia de `criador`: **SANTA NICE**, exatamente como nos dois eventos anteriores.
// `criador` agrupa a vitrine de criatórios parceiros, então divergir aqui partiria
// o criatório em dois.
//
// Sem arte, o card cai no fallback de marca do `AgendaGrid.tsx` (logo Bula + dia em
// dourado, mesmo aspect 4:5) — não entorta a grade. Quando o cartaz chegar ele
// sobrescreve inclusive o NOME, e o par se acha por `cronograma_id`, não por nome:
// molde `scripts/agenda-2026-09-01-artes-erural.mjs`. Capa: se vier só story, montar
// o 4:5 com `scripts/agenda-2026-09-03-nelore-visual-capa-feed.mjs`.
//
// Não existia em `cronograma_leiloes` nem em `bula_leiloes` — conferido por data
// (10/10, zero em ambas) e por nome (ilike '%nice%', só 06/06 e 19/08).
// Janela pública: hoje (03/09) + 60 = 02/11, então 10/10 aparece de imediato
// ([[agenda-publica-janela-d60]]).
//
// Uso: node scripts/agenda-2026-09-03-santa-nice.mjs [--dry]

import { readFileSync } from 'node:fs'
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
    data: '2026-10-10',
    dia_semana: 'sábado',
    nome: 'SANTA NICE',
    nomePublico: 'Santa Nice',
    hora: null,
    criador: 'SANTA NICE',
    presencial: null,
    local: null,
    leiloeira: null,
    raca: null,
    sexo: null,
    qtd_animais: null,
    animais: 0,
    tipo: 'NELORE',
    transmissao: null,
    // ⚠ `condicao` é campo PÚBLICO — sai no card e na página do leilão. Nada de nota
    // interna nem de procedência ([[condicao-e-campo-publico-sem-nota-interna]]).
    condicao: '',
    capa: null,
  },
]

// Só grava onde o banco está vazio: edição manual anterior sempre vence.
const keep = (novo, atual) => {
  if (atual != null && String(atual).trim() !== '') return atual
  return novo
}

for (const leilao of LEILOES) {
  console.log(`\n=== ${leilao.data} — ${leilao.nome} ===`)
  console.log('  sem arte e sem detalhes ainda — card entra no fallback de marca da agenda')

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
    img: crono?.img ?? null,
  }
  if (dry) {
    console.log(`  [dry] cronograma_leiloes ${crono ? 'UPDATE' : 'INSERT'}:`, JSON.stringify(cronoPatch))
  } else {
    const { error } = await supabase.from('cronograma_leiloes').upsert(cronoPatch, { onConflict: 'id' })
    if (error) throw new Error(`UPSERT cronograma_leiloes: ${error.message}`)
    console.log(`  cronograma_leiloes: ${crono ? 'atualizado' : 'criado'} (${cronoId})`)
  }

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
    tipo: pub?.tipo && pub.tipo !== 'Leilao' ? pub.tipo : leilao.tipo,
    local: keep(leilao.local, pub?.local) ?? '',
    animais: Number(pub?.animais) || leilao.animais || 0,
    status: pub?.status || 'confirmado',
    horario: keep(leilao.hora, pub?.horario) ?? '',
    modelo: keep(leilao.presencial, pub?.modelo) ?? '',
    leiloeira: keep(leilao.leiloeira, pub?.leiloeira) ?? '',
    transmissao: keep(leilao.transmissao, pub?.transmissao) ?? '',
    condicao: keep(leilao.condicao, pub?.condicao) ?? '',
    img: pub?.img ?? '',
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
    cronoPatch.qtd_animais ? `Qtd.: ${cronoPatch.qtd_animais}` : '',
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
    notes: 'Cadastrado em 03/09/2026 a partir do pedido do Joao no chat — so data e criatorio '
      + '(scripts/agenda-2026-09-03-santa-nice.mjs). Capa e demais informacoes entram depois; '
      + 'o cartaz sobrescreve ate o nome, casar por cronograma_id.',
    linked_leilao_id: cronoId,
  }

  if (dry) {
    console.log(`  [dry] agenda_events: substituiria o evento de ${cronoId} -> ${startAt} (dia inteiro)`)
  } else {
    await supabase.from('agenda_events').delete().eq('linked_leilao_id', cronoId)
    const { error } = await supabase.from('agenda_events').insert(evento)
    if (error) throw new Error(`INSERT agenda_events: ${error.message}`)
    console.log(`  agenda_events: evento criado (${startAt}, dia inteiro)`)
  }
}

console.log('\nOK — Santa Nice (10/10) na agenda.')
