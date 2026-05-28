// Cria o registro do "Leilão Virtual Nelore MEAB & Fazenda Modelo - Fêmeas"
// em bula_leiloes (com upload da capa em leilao-covers).
// Idempotente: se já existir registro com mesmo nome+data, atualiza em vez de
// duplicar. Roda como service_role lendo .env.local local.
//
// Uso: node scripts/add-leilao-nelore-meab.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios em .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Dados do leilão (extraídos da arte "Save the Date") ───────
const LEILAO = {
  nome: 'NELORE MEAB & FAZENDA MODELO',
  data: '2026-06-23',                      // 23/Junho — Terça
  tipo: 'Matrizes, novilhas e bezerras',   // Fêmeas
  local: '',
  animais: 0,
  expectativa: 0,
  meta_bula: 0,
  realizado_bula: 0,
  status: 'confirmado',
  horario: '19:00',
  transmissao: 'RURALPLAY',
  modelo: 'VIRTUAL',
  leiloeira: 'BULA',
  condicao: '',
  frete_gratis: '',
  acordo_comissao: '',
  catalogo_url: null,
}

// Checklist padrão (mesma estrutura do FormModal/DEFAULT_TASKS em
// src/app/sistema/leiloes/page.tsx). Mantém ids/nomes alinhados ao app.
const EMPTY_RESP = { nome: '', ini: '' }
const mkTask = (id, nome) => ({
  id, nome, ini: '', fim: '', resp: { ...EMPTY_RESP }, subs: [], done: false, observacao: '', anexos: [],
})

const DEFAULT_TASKS = [
  {
    nome: 'Pré-Leilão',
    subtitulo: 'Organização dos materiais e classificação dos lotes',
    cor: '#4A8FBF',
    tasks: [
      mkTask('pre-1', 'Receber catálogo em PDF'),
      mkTask('pre-2', 'Receber link do YouTube com os lotes'),
      mkTask('pre-3', 'Receber artes para divulgação'),
      mkTask('pre-4', 'Comitê de avaliação dos lotes e classificação'),
      mkTask('pre-5', 'Adicionar leilão no catálogo da semana'),
      mkTask('pre-6', 'Divulgação no grupo de WhatsApp pré-leilão'),
      mkTask('pre-7', 'Realizar mapa de leilão, direcionando clientes para lotes específicos'),
    ],
  },
  {
    nome: 'Dia do Leilão',
    subtitulo: 'Dia do leilão',
    cor: '#C8A96E',
    tasks: [
      mkTask('dia-1', 'Mandar lotes e avaliações para todos os clientes mapeados'),
      mkTask('dia-2', 'Garantir que todos os clientes estejam cadastrados corretamente'),
      mkTask('dia-3', 'Realizar ligação para os principais clientes'),
      mkTask('dia-4', 'Fazer divulgação massiva dos lotes na hora do leilão'),
      mkTask('dia-5', 'Ao fim do leilão, enviar todos os lotes vendidos com informações no grupo de WhatsApp'),
    ],
  },
  {
    nome: 'Pós-Leilão',
    subtitulo: 'Atividades pós-leilão',
    cor: '#6B8F5C',
    tasks: [
      mkTask('pos-1', 'Fechamento e análise do leilão'),
      mkTask('pos-2', 'Envio de contas a pagar e a receber para financeiro'),
      mkTask('pos-3', 'Provisionar pagamento e comunicar assessores'),
      mkTask('pos-4', 'Postar agradecimento ao criatório nos canais de comunicação'),
    ],
  },
]

// ── 1. Upload da capa ────────────────────────────────────────
const COVER_SRC = String.raw`C:\Users\Notebook-Acer\.claude\image-cache\f30338c7-f7d8-4268-9ab5-79210516c226\6.png`
const fileBytes = readFileSync(COVER_SRC)
const coverPath = `${Date.now()}-nelore-meab-fazenda-modelo.png`

console.log(`Subindo capa (${(fileBytes.length / 1024).toFixed(1)} KB) -> leilao-covers/${coverPath}`)
const { error: upErr } = await supabase.storage
  .from('leilao-covers')
  .upload(coverPath, fileBytes, { contentType: 'image/png', upsert: false })
if (upErr) {
  console.error('Falha no upload da capa:', upErr.message)
  process.exit(1)
}
const { data: pub } = supabase.storage.from('leilao-covers').getPublicUrl(coverPath)
const coverUrl = pub.publicUrl
console.log('Capa pública:', coverUrl)

// ── 2. Verifica se já existe (idempotência) ──────────────────
const { data: existing, error: selErr } = await supabase
  .from('bula_leiloes')
  .select('id, nome, data, img')
  .eq('nome', LEILAO.nome)
  .eq('data', LEILAO.data)
  .maybeSingle()
if (selErr) {
  console.error('Erro consultando bula_leiloes:', selErr.message)
  process.exit(1)
}

const payload = { ...LEILAO, img: coverUrl, tasks: DEFAULT_TASKS }

if (existing) {
  console.log(`Registro já existia (id=${existing.id}) — atualizando.`)
  const { error: updErr } = await supabase
    .from('bula_leiloes')
    .update(payload)
    .eq('id', existing.id)
  if (updErr) {
    console.error('Erro ao atualizar:', updErr.message)
    process.exit(1)
  }
  console.log('OK: leilão atualizado.')
} else {
  const { data: inserted, error: insErr } = await supabase
    .from('bula_leiloes')
    .insert(payload)
    .select('id')
    .single()
  if (insErr) {
    console.error('Erro ao inserir:', insErr.message)
    process.exit(1)
  }
  console.log(`OK: leilão criado (id=${inserted.id}).`)
}

console.log('\nAbra /sistema/leiloes — o card deve aparecer em 23/Jun/2026.')
