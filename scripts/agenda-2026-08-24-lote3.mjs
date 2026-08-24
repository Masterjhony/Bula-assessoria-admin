// Terceiro lote de 24/08/2026 — duas artes mandadas pelo Marcelo (12:48–12:55).
//
// - 26/08 LEILÃO GENÉTICA SÃO JOSÉ ("30 anos de seleção"), 260 fêmeas PO em
//   14 parcelas. Leiloeira Bula Remates + MS Leilões Rurais.
//   Usada a versão "formato feed" (12:49), como o Marcelo pediu — a de 12:48
//   era a mesma arte cortada em quadrado.
// - 18–19/09 BC AGROFEIRA na Fazenda Recanto (Chã Preta/AL), leiloeira oficial
//   Agreste. Entra como dois dias, seguindo a convenção da casa pra evento de
//   mais de um dia (1º DIA / 2º DIA, igual Terra Brava e Katayama Trilogia).
//   Se na verdade houver um leilão só dentro da feira, é colapsar em uma linha.
//
// Duas coisas que a arte do São José contradiz, resolvidas aqui e anotadas na
// condicao pra ninguém "corrigir" errado depois:
//
// 1. A arte diz "TERÇA-FEIRA", mas 26/08/2026 é QUARTA. Vale a data, que
//    aparece em destaque; a terça de verdade seria 25/08.
// 2. "17H HORÁRIO DO MS" — Mato Grosso do Sul é UTC-4 e a agenda guarda
//    Brasília (UTC-3), então fica gravado 18:00.
//
// Os dois sao leilões NOVOS. Como o sync da ESCALA foi desligado hoje
// ([[sync-escala-desativado]]), nada aqui corre risco de ser desfeito — mas
// tambem nao chega sozinho pela planilha.
//
// Uso: node scripts/agenda-2026-08-24-lote3.mjs [--dry]

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

const CONDICAO_BC = 'BC Agrofeira 2026 na Fazenda Recanto (200 anos), Chã Preta/AL, dias 18 e 19 de setembro. '
  + 'Homologado e chancelado por PMGZ, Dia de Campo Oficial, Pró-Genética e Leilão&Shopping. '
  + 'Realização BC / RVF Eventos, organização Start, patrocínio Sebrae. '
  + 'Assessores do leilão: Premier, Davi Sostinho e Bula. Horário não informado na arte.'

const LEILOES = [
  {
    data: '2026-08-26',
    dia_semana: 'quarta-feira',
    nome: 'LEILÃO GENÉTICA SÃO JOSÉ',
    hora: '18:00',
    criador: 'FAZENDA SÃO JOSÉ',
    presencial: null, // a arte nao diz se e presencial ou virtual
    local: null,
    leiloeira: 'BULA REMATES / MS LEILÕES RURAIS',
    raca: 'NELORE',
    sexo: 'FÊMEAS',
    qtd_animais: '260 FÊMEAS PO',
    animais: 260,
    transmissao: 'Rural Play',
    condicao: '30 anos de seleção. 260 fêmeas PO: bezerras, novilhas, vacas paridas e prenhes, em 14 parcelas. '
      + 'Início às 17h no horário do MS (18h de Brasília). Patrocínio SOL Nutrição Animal. '
      + 'Atenção: a arte anuncia "terça-feira", mas 26/08/2026 cai numa quarta.',
    capa: 'F:\\WhatsApp Image 2026-08-24 at 12.49.24.jpeg',
    capaMime: 'image/jpeg',
    path: 'escala-2026/2026-08-26-leilao-genetica-sao-jose-arte-oficial-feed.jpeg',
  },
  {
    data: '2026-09-18',
    dia_semana: 'sexta-feira',
    nome: '1º DIA - BC AGROFEIRA FAZENDA RECANTO',
    hora: null,
    criador: 'FAZENDA RECANTO / BC AGRO',
    presencial: 'PRESENCIAL',
    local: 'CHÃ PRETA/AL',
    leiloeira: 'AGRESTE LEILÕES RURAIS',
    raca: 'NELORE',
    sexo: null,
    qtd_animais: null,
    animais: 0,
    transmissao: null,
    condicao: CONDICAO_BC,
    capa: 'F:\\WhatsApp Image 2026-08-24 at 12.50.05.jpeg',
    capaMime: 'image/jpeg',
    path: 'escala-2026/2026-09-18-bc-agrofeira-fazenda-recanto-arte-oficial.jpeg',
  },
  {
    data: '2026-09-19',
    dia_semana: 'sábado',
    nome: '2º DIA - BC AGROFEIRA FAZENDA RECANTO',
    hora: null,
    criador: 'FAZENDA RECANTO / BC AGRO',
    presencial: 'PRESENCIAL',
    local: 'CHÃ PRETA/AL',
    leiloeira: 'AGRESTE LEILÕES RURAIS',
    raca: 'NELORE',
    sexo: null,
    qtd_animais: null,
    animais: 0,
    transmissao: null,
    condicao: CONDICAO_BC,
    // Mesma arte do 1o dia: um upload so, reaproveitado nos dois registros.
    capa: 'F:\\WhatsApp Image 2026-08-24 at 12.50.05.jpeg',
    capaMime: 'image/jpeg',
    path: 'escala-2026/2026-09-18-bc-agrofeira-fazenda-recanto-arte-oficial.jpeg',
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
  }

  const cronoId = randomUUID()
  const crono = {
    id: cronoId,
    data: leilao.data,
    nome: leilao.nome,
    dia_semana: leilao.dia_semana,
    hora: leilao.hora,
    criador: leilao.criador,
    presencial: leilao.presencial,
    leiloeira: leilao.leiloeira,
    raca: leilao.raca,
    qtd_animais: leilao.qtd_animais,
    sexo: leilao.sexo,
    img: coverUrl,
  }

  const pubId = randomUUID()
  const pub = {
    id: pubId,
    nome: leilao.nome,
    data: leilao.data,
    tipo: leilao.raca ?? 'Leilao',
    local: leilao.local ?? '',
    animais: leilao.animais,
    status: 'confirmado',
    horario: leilao.hora ?? '',
    modelo: leilao.presencial ?? '',
    leiloeira: leilao.leiloeira ?? '',
    transmissao: leilao.transmissao ?? '',
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
      leilao.leiloeira ? `Leiloeira: ${leilao.leiloeira}` : '',
      leilao.local ? `Local: ${leilao.local}` : '',
      leilao.raca ? `Raca: ${leilao.raca}` : '',
      leilao.qtd_animais ? `Qtd.: ${leilao.qtd_animais}` : '',
      leilao.sexo ? `Sexo: ${leilao.sexo}` : '',
      leilao.transmissao ? `Transmissao: ${leilao.transmissao}` : '',
    ].filter(Boolean).join('\n'),
    event_type: 'leilao',
    status: 'planejado',
    priority: 'media',
    start_at: startAt,
    end_at: leilao.hora ? new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString() : null,
    all_day: !leilao.hora,
    location: leilao.local ?? leilao.presencial ?? null,
    color: '#A68B4B',
    notes: 'Cadastrado em 24/08/2026 (scripts/agenda-2026-08-24-lote3.mjs).',
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

console.log('\nOK — lote 3 processado.')
