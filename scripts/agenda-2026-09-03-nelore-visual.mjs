// Inclusão de 03/09/2026 — NELORE VISUAL - SHOPPING DE GENÉTICA (12/09).
//
// Fonte: a arte que o João baixou (F:\leilao nelore visual.jpeg, guardada em
// outputs/agenda-2026-09-03/2026-09-12-nelore-visual-shopping-de-genetica-arte-story.jpeg).
// Tudo abaixo sai LIDO DO CARTAZ: sábado 12/09/2026 "a partir das 8h", 40 touros
// Nelore P.O. com "condições exclusivas", na Fazenda Visual, Esmeraldas/MG
// (o cartaz traz até QR code de localização — é presencial, na fazenda).
//
// O cartaz NÃO traz leiloeira nem transmissão — `leiloeira` e `transmissao` ficam
// VAZIOS de propósito. Não inventar ([[agenda-leilao-sem-arte-fallback]]): o
// histórico de outro evento do mesmo criatório não é fonte para este.
//
// ⚠ CAPA NÃO ENTRA. A arte recebida é 720x1280 = 0,563 — formato STORY 9:16. A capa
// da agenda tem que ser a arte de FEED 4:5 (~0,76–0,83); story entorta o card na
// grade e o Marcelo já mandou trocar uma vez (31/08, caso Mafra). Regra em
// [[capa-agenda-formato-feed-4x5]]: quando só existe a story, PEDIR a versão feed
// em vez de recortar por conta própria. Sem `img`, o card cai no fallback de marca
// (logo Bula + dia em dourado, no mesmo aspect 4:5) e a grade não entorta.
// Quando o feed chegar: subir em leilao-covers/escala-2026/ e dar UPDATE de `img`
// nas DUAS tabelas — molde scripts/agenda-2026-08-31-capa-mafra-feed.mjs.
//
// Não existia em `cronograma_leiloes` nem em `bula_leiloes` — conferido por data
// (08–16/09) e por nome (ilike '%visual%', zero resultado) antes de escrever
// ([[agenda-publica-janela-d60]]).
//
// Convivência de data conferida: 12/09 já tem REPRODUTORES NELORE AZ. São eventos
// diferentes e convivem na data, como o 13, o 15 e o 20/09 já fazem.
//
// Uso: node scripts/agenda-2026-09-03-nelore-visual.mjs [--dry]

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
    data: '2026-09-12',
    dia_semana: 'sábado',
    nome: 'NELORE VISUAL - SHOPPING DE GENÉTICA',
    nomePublico: 'Nelore Visual — Shopping de Genética',
    hora: '08:00',
    criador: 'NELORE VISUAL',
    presencial: 'PRESENCIAL',
    local: 'Fazenda Visual — Esmeraldas/MG',
    leiloeira: null,
    raca: 'NELORE P.O.',
    sexo: 'MACHOS',
    qtd_animais: '40 TOUROS',
    animais: 40,
    tipo: 'NELORE',
    transmissao: null,
    // ⚠ `condicao` é campo PÚBLICO — sai no card da agenda e na página do leilão.
    // Só o que está no cartaz; nada de nota interna ([[condicao-e-campo-publico-sem-nota-interna]]).
    condicao: 'Shopping de Genética Nelore Visual — 40 touros Nelore P.O. com condições exclusivas. '
      + 'Sábado, 12/09/2026, a partir das 8h, na Fazenda Visual, em Esmeraldas/MG.',
    capa: null,
    capaOrigem: join(root, 'outputs', 'agenda-2026-09-03',
      '2026-09-12-nelore-visual-shopping-de-genetica-arte-story.jpeg'),
  },
]

// Só grava onde o banco está vazio: edição manual anterior sempre vence.
const keep = (novo, atual) => {
  if (atual != null && String(atual).trim() !== '') return atual
  return novo
}

for (const leilao of LEILOES) {
  console.log(`\n=== ${leilao.data} — ${leilao.nome} ===`)

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
    console.log('  so temos a arte STORY (9:16) — card entra no fallback de marca ate chegar o feed 4:5')
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
    notes: 'Cadastrado a partir da arte oficial em 03/09/2026 (scripts/agenda-2026-09-03-nelore-visual.mjs). '
      + 'FALTA A CAPA: a arte recebida e story 720x1280 (0,563) e a agenda so aceita feed 4:5 — '
      + 'pedir a versao feed ao criatorio e dar UPDATE de img nas duas tabelas.',
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

console.log('\nOK — inclusao de 03/09 processada.')
