// Segundo lote de artes recebidas em 24/08/2026 (pasta F:\).
//
// 30/08 VENTRES VIP MATINHA: a capa era um PRINT de story (aparecia o coração
// de curtida, o avatar e o ícone de mute, e a arte vinha cortada em cima e
// embaixo). Trocada pela arte limpa.
//
// A arte do 3º LEILÃO SELEÇÕES DA SAFRA NELORE BAMBU (27/08) veio no mesmo
// lote, mas o Marcelo mandou tirar o leilão da agenda ("esse bambu pode
// tirar", 24/08 12:30). A remoção está em scripts/remove-leilao-bambu-2026-08-27.mjs.
//
// A capa velha da Matinha veio da planilha ESCALA (nome com hash de conteúdo,
// `2026-08-30-ventres-vip-matinha-25ed7f80f6.webp`) e no sync a capa da
// planilha VENCE — ver [[sync-escala-capas-checklist]]. Enquanto o print
// estiver na ESCALA, o próximo sync traz ele de volta. A arte tem que ser
// trocada na planilha também.
//
// A capa nova vai num path novo de propósito: reaproveitar o antigo serviria
// a imagem velha pelo cache do CDN.
//
// Uso: node scripts/adiciona-capas-agenda-2026-08-24-lote2.mjs [--dry]

import { existsSync, readFileSync } from 'node:fs'
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
    data: '2026-08-30',
    nome: 'VENTRES VIP MATINHA',
    hora: '09:00',
    criador: 'MATINHA',
    presencial: 'VIRTUAL',
    local: 'VIRTUAL',
    leiloeira: 'PROGRAMA LEILÕES',
    raca: 'NELORE',
    sexo: 'FÊMEAS',
    qtd_animais: '320 NOVILHOTAS',
    animais: 320,
    transmissao: 'Canal do Criador e Lance Rural (retransmissão Remate Web)',
    condicao: '320 novilhotas de alto padrão — "Rentabilidade, desempenho e multiplicação". Avaliação ANCP, PMGZ, Embrapa e GenePlus. Assessoria técnica Aval e JAG Bergmann.',
    // `transmissao` no banco dizia só "Canal do Criador"; a arte credita a
    // Lance Rural junto e a Remate Web na retransmissão.
    forcar: ['transmissao'],
    capa: 'F:\\matinha trocar.jpeg',
    path: 'escala-2026/2026-08-30-ventres-vip-matinha-arte-oficial.jpeg',
  },
]

for (const leilao of LEILOES) {
  console.log(`\n=== ${leilao.data} — ${leilao.nome} ===`)

  // Só grava onde o banco está vazio, salvo nos campos listados em `forcar`:
  // edição manual anterior vence.
  const keep = (campo, novo, atual) => {
    if (leilao.forcar.includes(campo) && novo != null && String(novo).trim() !== '') return novo
    if (atual != null && String(atual).trim() !== '') return atual
    return novo
  }

  if (!existsSync(leilao.capa)) {
    console.error(`  !! capa nao encontrada: ${leilao.capa} — pulando`)
    continue
  }

  const bytes = readFileSync(leilao.capa)
  let coverUrl = null
  if (dry) {
    console.log(`  [dry] subiria ${(bytes.length / 1024).toFixed(1)} KB -> leilao-covers/${leilao.path}`)
  } else {
    const { error } = await supabase.storage.from('leilao-covers').upload(leilao.path, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '31536000',
    })
    if (error) throw new Error(`UPLOAD ${leilao.path}: ${error.message}`)
    coverUrl = supabase.storage.from('leilao-covers').getPublicUrl(leilao.path).data.publicUrl
    console.log(`  capa: ${coverUrl}`)
  }

  // ── cronograma_leiloes ──────────────────────────────────────
  const { data: crono, error: cronoSelErr } = await supabase
    .from('cronograma_leiloes')
    .select('*')
    .eq('nome', leilao.nome)
    .eq('data', leilao.data)
    .maybeSingle()
  if (cronoSelErr) throw new Error(`SELECT cronograma_leiloes: ${cronoSelErr.message}`)
  if (!crono) {
    console.error('  !! esperava encontrar em cronograma_leiloes e nao achei — pulando')
    continue
  }

  const cronoPatch = {
    id: crono.id,
    data: leilao.data,
    nome: leilao.nome,
    dia_semana: crono.dia_semana,
    hora: keep('hora', leilao.hora, crono.hora),
    criador: keep('criador', leilao.criador, crono.criador),
    presencial: keep('presencial', leilao.presencial, crono.presencial),
    leiloeira: keep('leiloeira', leilao.leiloeira, crono.leiloeira),
    raca: keep('raca', leilao.raca, crono.raca),
    qtd_animais: keep('qtd_animais', leilao.qtd_animais, crono.qtd_animais),
    sexo: keep('sexo', leilao.sexo, crono.sexo),
    img: coverUrl ?? crono.img,
  }
  if (dry) {
    console.log('  [dry] cronograma_leiloes UPDATE:', JSON.stringify(cronoPatch))
  } else {
    const { error } = await supabase.from('cronograma_leiloes').upsert(cronoPatch, { onConflict: 'id' })
    if (error) throw new Error(`UPSERT cronograma_leiloes: ${error.message}`)
    console.log(`  cronograma_leiloes: atualizado (${crono.id})`)
  }

  // ── bula_leiloes (a agenda publica le daqui) ────────────────
  const { data: pub, error: pubSelErr } = await supabase
    .from('bula_leiloes')
    .select('*')
    .eq('nome', leilao.nome)
    .eq('data', leilao.data)
    .maybeSingle()
  if (pubSelErr) throw new Error(`SELECT bula_leiloes: ${pubSelErr.message}`)
  if (!pub) {
    console.error('  !! esperava encontrar em bula_leiloes e nao achei — pulando')
    continue
  }

  const pubPatch = {
    id: pub.id,
    nome: leilao.nome,
    data: leilao.data,
    tipo: pub.tipo && pub.tipo !== 'Leilao' ? pub.tipo : leilao.raca,
    local: keep('local', leilao.local, pub.local) ?? '',
    animais: Number(pub.animais) || leilao.animais,
    status: pub.status || 'confirmado',
    horario: keep('hora', leilao.hora, pub.horario),
    modelo: keep('presencial', leilao.presencial, pub.modelo) ?? '',
    leiloeira: keep('leiloeira', leilao.leiloeira, pub.leiloeira),
    transmissao: keep('transmissao', leilao.transmissao, pub.transmissao) ?? '',
    condicao: keep('condicao', leilao.condicao, pub.condicao),
    img: coverUrl ?? pub.img,
    cronograma_id: crono.id,
  }
  if (dry) {
    console.log('  [dry] bula_leiloes UPDATE:', JSON.stringify(pubPatch))
  } else {
    const { error } = await supabase.from('bula_leiloes').upsert(pubPatch, { onConflict: 'id' })
    if (error) throw new Error(`UPSERT bula_leiloes: ${error.message}`)
    console.log(`  bula_leiloes: atualizado (${pub.id})`)
  }

  // ── agenda_events (agenda interna) ──────────────────────────
  const startAt = `${leilao.data}T${cronoPatch.hora || '09:00'}:00-03:00`
  const endAt = new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString()
  const detalhes = [
    cronoPatch.criador ? `Criador: ${cronoPatch.criador}` : '',
    cronoPatch.leiloeira ? `Leiloeira: ${cronoPatch.leiloeira}` : '',
    cronoPatch.raca ? `Raca: ${cronoPatch.raca}` : '',
    cronoPatch.qtd_animais ? `Qtd.: ${cronoPatch.qtd_animais}` : '',
    cronoPatch.sexo ? `Sexo: ${cronoPatch.sexo}` : '',
    pubPatch.transmissao ? `Transmissao: ${pubPatch.transmissao}` : '',
  ].filter(Boolean).join('\n')

  const evento = {
    title: leilao.nome,
    description: detalhes,
    event_type: 'leilao',
    status: 'planejado',
    priority: 'media',
    start_at: startAt,
    end_at: endAt,
    all_day: false,
    location: cronoPatch.presencial || cronoPatch.leiloeira || null,
    color: '#A68B4B',
    notes: 'Atualizado a partir da arte oficial recebida em 24/08/2026 (scripts/adiciona-capas-agenda-2026-08-24-lote2.mjs).',
    linked_leilao_id: crono.id,
  }

  if (dry) {
    console.log(`  [dry] agenda_events: substituiria o evento de ${crono.id} -> ${startAt}`)
  } else {
    await supabase.from('agenda_events').delete().eq('linked_leilao_id', crono.id)
    const { error } = await supabase.from('agenda_events').insert(evento)
    if (error) throw new Error(`INSERT agenda_events: ${error.message}`)
    console.log(`  agenda_events: evento recriado (${startAt})`)
  }
}

console.log('\nOK — capa da Matinha trocada.')
if (!dry) {
  console.log('\nLEMBRETE: a capa antiga da Matinha (o print) veio da planilha ESCALA.')
  console.log('No sync a capa da planilha vence: troque a arte na ESCALA tambem,')
  console.log('senao o proximo sync-escala-leiloes-2026.mjs traz o print de volta.')
}
