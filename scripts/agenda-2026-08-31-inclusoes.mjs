// Inclusões na agenda pedidas pelo Marcelo no WhatsApp em 31/08/2026, 12:03
// (sessão Baileys `joao-automation`, DM 5531994149161). Ele respondeu três
// artes com "Esta faltando na agenda" / "Esse tb" / "Esse tb":
//
// 1) LEILÃO PRIMAVERA GENÉTICA ADITIVA — ETAPA TOUROS, 28/09/2026 (segunda),
//    20h (BSB), VIRTUAL. É a etapa que faltou em 28/08: o script
//    `agenda-2026-08-28-genetica-aditiva-primavera.mjs` cadastrou só a Etapa
//    Fêmeas (27/09) porque a arte dos touros ainda não tinha chegado.
//
// 2) LEILÃO TOUROS QUE GERAM LUCRO — KATISPERA, 17/10/2026 (sábado), 12h
//    (BSB). 120 reprodutores safra 2024, todos genotipados. Não existia em
//    nenhuma das tabelas.
//
// 3) LEILÃO PINTADO BRASIL 2026 (08 a 11/10, Campo Grande/MS) — JÁ ESTÁ
//    cadastrado desde 25/08 nas três tabelas. Não aparece na agenda pública
//    porque `publicAgendaRangeSaoPaulo()` (src/lib/bula/public-leiloes.ts) só
//    expõe de hoje até o fim do MÊS SEGUINTE: em 31/08 a janela termina em
//    30/09. A partir de 01/09 outubro entra sozinho. Nada a fazer aqui.
//
// Bônus: às 12:06 o Marcelo encaminhou (sem legenda) a arte do TOUROS PREMIUM
// NELORE MAFRA — EDIÇÃO UBERABA (06/09). O leilão já está na agenda e correto;
// só a leiloeira estava em branco nas duas tabelas e a arte confirma PROGRAMA
// LEILÕES — este script preenche esse campo vazio e não toca em mais nada.
//
// As artes vieram do próprio WhatsApp (bucket whatsapp-media, mensagens
// 3A885A9743AE19D84B6C e 3A740D7726447C6020E0) e estão em
// outputs/agenda-2026-08-31/.
//
// A remoção pedida em 12:04 ("Esse pode tirar", Katayama Marabá 15/09) está em
// scripts/agenda-2026-08-31-remocoes.mjs.
//
// Uso: node scripts/agenda-2026-08-31-inclusoes.mjs [--dry]

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
    data: '2026-09-28',
    dia_semana: 'segunda-feira',
    nome: 'LEILÃO PRIMAVERA GENÉTICA ADITIVA - TOUROS',
    nomePublico: 'Leilão Primavera Genética Aditiva — Etapa Touros',
    hora: '20:00',
    criador: 'GENÉTICA ADITIVA',
    presencial: 'VIRTUAL',
    local: 'VIRTUAL',
    leiloeira: 'PROGRAMA LEILÕES',
    raca: 'NELORE',
    sexo: 'MACHOS',
    qtd_animais: null,
    animais: 0,
    tipo: 'NELORE',
    transmissao: 'Canal do Criador (retransmissão Remate Web)',
    condicao: 'Leilão Primavera Genética Aditiva — Etapa Touros. Virtual, segunda-feira 28/09/2026 às 20h '
      + '(horário de Brasília). Pagamento em 30 parcelas (2+2+2+2+2+20); frete grátis conforme regulamento. '
      + 'Realização Genética Aditiva (pecuária de precisão); leiloeira Programa Leilões; transmissão Canal do '
      + 'Criador com retransmissão Remate Web; avaliações GenePlus, PMGZ e ANCP. '
      + 'Informações: Claudinei (67) 99984-6958, Natiélly (67) 99982-8028, Flavio (67) 98152-1488.',
    capa: join(root, 'outputs', 'agenda-2026-08-31', '2026-09-28-genetica-aditiva-primavera-touros-arte.jpeg'),
    capaMime: 'image/jpeg',
    path: 'escala-2026/2026-09-28-leilao-primavera-genetica-aditiva-touros-arte.jpeg',
  },
  {
    data: '2026-10-17',
    dia_semana: 'sábado',
    nome: 'LEILÃO TOUROS QUE GERAM LUCRO - KATISPERA',
    nomePublico: 'Leilão Touros que Geram Lucro — KatiSpera',
    hora: '12:00',
    criador: 'KATISPERA',
    presencial: 'VIRTUAL',
    local: 'VIRTUAL',
    leiloeira: 'PROGRAMA LEILÕES',
    raca: 'NELORE',
    sexo: 'MACHOS',
    qtd_animais: '120 TOUROS',
    animais: 120,
    tipo: 'NELORE',
    transmissao: 'Canal do Criador (retransmissão Lance Rural)',
    condicao: 'Leilão Touros que Geram Lucro — KatiSpera. Sábado 17/10/2026 às 12h (horário de Brasília). '
      + '120 reprodutores safra 2024, todos genotipados, avaliados para precocidade sexual, ultrassonografia '
      + 'de carcaça e eficiência alimentar — animais prontos para a estação de monta. Leiloeira Programa '
      + 'Leilões; transmissão Canal do Criador com retransmissão Lance Rural; selos ANCP, PMGZ, GenePlus, '
      + 'Aval, Procriar, Intra Rebanho e Eficiência Alimentar. '
      + 'Assessorias: ATOP, Prime, Premier, Mamede, Carvalho, Rodrigo David, JHL, Duetto e Bula.',
    capa: join(root, 'outputs', 'agenda-2026-08-31', '2026-10-17-katispera-touros-que-geram-lucro-arte.jpeg'),
    capaMime: 'image/jpeg',
    path: 'escala-2026/2026-10-17-leilao-touros-que-geram-lucro-katispera-arte.jpeg',
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
    notes: 'Cadastrado a partir da arte oficial em 31/08/2026, a pedido do Marcelo no WhatsApp '
      + '(scripts/agenda-2026-08-31-inclusoes.mjs).',
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

// --- Mafra 06/09: só completa a leiloeira em branco, confirmada pela arte ---
console.log('\n=== 2026-09-06 — TOUROS PREMIUM NELORE MAFRA (só campo vazio) ===')
for (const tabela of ['cronograma_leiloes', 'bula_leiloes']) {
  const { data, error } = await supabase
    .from(tabela)
    .select('id, nome, leiloeira')
    .eq('data', '2026-09-06')
    .eq('nome', 'TOUROS PREMIUM NELORE MAFRA - EDIÇÃO UBERABA')
    .maybeSingle()
  if (error) throw new Error(`SELECT ${tabela}: ${error.message}`)
  if (!data) { console.log(`  ${tabela}: linha nao encontrada — pulando`); continue }
  if (String(data.leiloeira ?? '').trim() !== '') {
    console.log(`  ${tabela}: leiloeira ja preenchida ("${data.leiloeira}") — preservada`)
    continue
  }
  if (dry) {
    console.log(`  [dry] ${tabela}: gravaria leiloeira = PROGRAMA LEILÕES em ${data.id}`)
    continue
  }
  const { error: upErr } = await supabase.from(tabela).update({ leiloeira: 'PROGRAMA LEILÕES' }).eq('id', data.id)
  if (upErr) throw new Error(`UPDATE ${tabela}: ${upErr.message}`)
  console.log(`  ${tabela}: leiloeira = PROGRAMA LEILÕES`)
}

console.log('\nOK — inclusoes de 31/08 processadas.')
