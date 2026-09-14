// Inclusão de 14/09/2026 (segunda leva) — o Marcelo mandou na DM, 13:11, o cartaz do
// LEILÃO DE TOUROS NELORE SANTAFÉ e o João pediu "coloca esse outro que ele mandou
// aí também".
//
// Tudo abaixo sai LIDO DO CARTAZ:
//   "Leilão de Touros Nelore Santafé — feito para ir além." 15 de outubro às 12h,
//   pin de localização "Fazenda Santafé". 40 reprodutores safra 2024. Programas de
//   avaliação PMGZ, ANCP, GenePlus, Aval, Neogen, Ponta e Procriar. Transmissão
//   Lance Rural e Agreste; retransmissão Remate Web e Lance Rural. Leiloeiras
//   Programa Leilões Nordeste e Agreste. Assessorias Duetto, Premier, Valor e Atop.
//
// Decisões:
// - `local` = FAZENDA SANTAFÉ e `modelo` = PRESENCIAL: o cartaz dá o pin do local
//   (a fazenda), o que é a definição de presencial — diferente dos e-rural do mesmo
//   dia, que não davam endereço nenhum. Cidade/UF o cartaz não traz.
// - Nenhuma assessoria do rodapé é a Bula. O leilão entra porque o chefe mandou (a
//   Bula deve estar entrando na cobertura depois da arte pronta), mas a lista de
//   assessorias de terceiros NÃO vai para a `condicao`, que é texto público no site
//   da Bula ([[condicao-e-campo-publico-sem-nota-interna]]).
// - A imagem é PRINT DO INSTAGRAM (@grwcomunicacao): 1308x1600 = 0,818, feed 4:5,
//   entra como está — mas ficaram os ícones de perfil e de som do Instagram nos
//   cantos de baixo. Não recortar (comeria a faixa de leiloeiras/assessorias). Se a
//   arte limpa chegar, é re-upload + UPDATE img nas duas tabelas. A Programa Leilões
//   (programaleiloes.com/agenda) não lista este leilão — a Nordeste é afiliada.
// - 15/10 não tinha nada em `cronograma_leiloes` nem `bula_leiloes` (conferido antes).
//   Está dentro da janela D+60 da agenda pública ([[agenda-publica-janela-d60]]).
//
// Uso: node scripts/agenda-2026-09-14-touros-nelore-santafe.mjs [--dry]

import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

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

const leilao = {
  data: '2026-10-15',
  dia_semana: 'quinta-feira',
  nome: 'LEILÃO DE TOUROS NELORE SANTAFÉ',
  nomePublico: 'Leilão de Touros Nelore Santafé',
  hora: '12:00',
  criador: 'NELORE SANTAFÉ',
  presencial: 'PRESENCIAL',
  local: 'FAZENDA SANTAFÉ',
  leiloeira: 'PROGRAMA LEILÕES NORDESTE / AGRESTE LEILÕES RURAIS',
  raca: 'NELORE',
  sexo: 'MACHOS',
  qtd_animais: '40 REPRODUTORES',
  animais: 40,
  tipo: 'NELORE',
  transmissao: 'Lance Rural e Agreste (retransmissão Remate Web e Lance Rural)',
  condicao: 'Leilão de Touros Nelore Santafé — "feito para ir além". Quinta-feira, 15/10/2026, às 12h, na '
    + 'Fazenda Santafé. Oferta de 40 reprodutores safra 2024, com programas de avaliação PMGZ, ANCP, GenePlus, '
    + 'Aval, Neogen, Ponta e Procriar. Leiloeiras Programa Leilões Nordeste e Agreste Leilões Rurais; transmissão '
    + 'Lance Rural e Agreste, com retransmissão Remate Web e Lance Rural.',
  capa: join(root, 'outputs', 'agenda-2026-09-14', '2026-10-15-leilao-de-touros-nelore-santafe-arte.jpg'),
  capaMime: 'image/jpeg',
  path: 'escala-2026/2026-10-15-leilao-de-touros-nelore-santafe-arte.jpg',
}

console.log(`=== ${leilao.data} — ${leilao.nome} ===`)

if (!existsSync(leilao.capa)) {
  console.error(`!! capa nao encontrada: ${leilao.capa}`)
  process.exit(1)
}
const bytes = readFileSync(leilao.capa)
{
  const m = await sharp(bytes).metadata()
  const ratio = m.width / m.height
  console.log(`arte: ${m.width}x${m.height} = ${ratio.toFixed(3)}`)
  if (ratio < 0.76 || ratio > 0.83) {
    console.error('!! fora da faixa de feed 4:5 (0,76-0,83) — abortando')
    process.exit(1)
  }
}

let coverUrl = null
if (dry) {
  console.log(`[dry] subiria ${(bytes.length / 1024).toFixed(1)} KB -> leilao-covers/${leilao.path}`)
} else {
  const { error } = await supabase.storage.from('leilao-covers').upload(leilao.path, bytes, {
    contentType: leilao.capaMime,
    upsert: true,
    cacheControl: '31536000',
  })
  if (error) throw new Error(`UPLOAD ${leilao.path}: ${error.message}`)
  coverUrl = supabase.storage.from('leilao-covers').getPublicUrl(leilao.path).data.publicUrl
  console.log(`capa: ${coverUrl}`)
}

// Só grava onde o banco está vazio: edição manual anterior sempre vence (re-run seguro).
const keep = (novo, atual) => {
  if (atual != null && String(atual).trim() !== '') return atual
  return novo
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
  console.log(`[dry] cronograma_leiloes ${crono ? 'UPDATE' : 'INSERT'}:`, JSON.stringify(cronoPatch))
} else {
  const { error } = await supabase.from('cronograma_leiloes').upsert(cronoPatch, { onConflict: 'id' })
  if (error) throw new Error(`UPSERT cronograma_leiloes: ${error.message}`)
  console.log(`cronograma_leiloes: ${crono ? 'atualizado' : 'criado'} (${cronoId})`)
}

let pub = null
{
  const { data, error } = await supabase.from('bula_leiloes').select('*').eq('cronograma_id', cronoId).maybeSingle()
  if (error) throw new Error(`SELECT bula_leiloes por cronograma_id: ${error.message}`)
  pub = data
}
if (!pub) {
  const { data, error } = await supabase
    .from('bula_leiloes')
    .select('*')
    .eq('data', leilao.data)
    .in('nome', [leilao.nomePublico, leilao.nome])
    .maybeSingle()
  if (error) throw new Error(`SELECT bula_leiloes por nome: ${error.message}`)
  pub = data
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
  console.log(`[dry] bula_leiloes ${pub ? 'UPDATE' : 'INSERT'}:`, JSON.stringify(pubPatch))
} else {
  const { error } = await supabase.from('bula_leiloes').upsert(pubPatch, { onConflict: 'id' })
  if (error) throw new Error(`UPSERT bula_leiloes: ${error.message}`)
  console.log(`bula_leiloes: ${pub ? 'atualizado' : 'criado'} (${pubPatch.id})`)
}

const startAt = `${leilao.data}T${cronoPatch.hora}:00-03:00`
const evento = {
  title: pubPatch.nome,
  description: [
    `Criador: ${cronoPatch.criador}`,
    `Leiloeira: ${cronoPatch.leiloeira}`,
    `Local: ${pubPatch.local}`,
    `Raca: ${cronoPatch.raca}`,
    `Sexo: ${cronoPatch.sexo}`,
    `Qtd.: ${cronoPatch.qtd_animais}`,
    `Transmissao: ${pubPatch.transmissao}`,
  ].join('\n'),
  event_type: 'leilao',
  status: 'planejado',
  priority: 'media',
  start_at: startAt,
  end_at: new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString(),
  all_day: false,
  location: pubPatch.local || null,
  color: '#A68B4B',
  notes: 'Cadastrado a partir do cartaz mandado pelo Marcelo na DM em 14/09/2026, 13:11 '
    + '(scripts/agenda-2026-09-14-touros-nelore-santafe.mjs). A capa e print do Instagram — trocar se a arte limpa chegar. '
    + 'A Bula nao consta nas assessorias do cartaz.',
  linked_leilao_id: cronoId,
}
if (dry) {
  console.log(`[dry] agenda_events: substituiria o evento de ${cronoId} -> ${startAt}`)
} else {
  await supabase.from('agenda_events').delete().eq('linked_leilao_id', cronoId)
  const { error } = await supabase.from('agenda_events').insert(evento)
  if (error) throw new Error(`INSERT agenda_events: ${error.message}`)
  console.log(`agenda_events: evento recriado (${startAt})`)
}

console.log('\nOK — Touros Nelore Santafé (15/10) na agenda.')
