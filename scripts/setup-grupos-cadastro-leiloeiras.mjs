// Vincula as leiloeiras parceiras aos seus GRUPOS de cadastro no WhatsApp
// (Baileys). Cria a leiloeira se não existir; atualiza o grupo se já existir.
//
// Consulta os grupos reais no VPS (/groups) e casa por nome de grupo — assim o
// JID nunca é digitado à mão. Idempotente: pode rodar de novo sem efeito
// colateral.
//
// Uso: node scripts/setup-grupos-cadastro-leiloeiras.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)

// leiloeira → nome (exato) do grupo de cadastros no WhatsApp
const VINCULOS = [
  { leiloeira: 'Programa Leilões', grupo: 'Cadastros Bula e Programa' },
  { leiloeira: 'Bula Remates', grupo: 'Cadastros Bula Remates' },
]

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// 1) grupos reais da sessão Baileys
const res = await fetch(`${env.WHATSAPP_SERVER_URL}/groups`, {
  headers: env.WHATSAPP_SERVER_TOKEN ? { 'x-vps-token': env.WHATSAPP_SERVER_TOKEN } : {},
  signal: AbortSignal.timeout(20000),
})
const body = await res.json()
if (!res.ok) {
  console.error('Falha ao listar grupos do VPS:', body.error || res.status)
  process.exit(1)
}
const grupos = body.groups ?? []

for (const v of VINCULOS) {
  const grupo = grupos.find((g) => (g.subject || '').trim().toLowerCase() === v.grupo.toLowerCase())
  if (!grupo) {
    console.error(`✗ Grupo "${v.grupo}" não encontrado na sessão Baileys — pulei ${v.leiloeira}.`)
    continue
  }

  const { data: existing } = await supabase
    .from('leiloeiras')
    .select('id, nome')
    .ilike('nome', `%${v.leiloeira}%`)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('leiloeiras')
      .update({ whatsapp_group_id: grupo.id, whatsapp_group_name: grupo.subject, ativo: true })
      .eq('id', existing.id)
    if (error) console.error(`✗ ${v.leiloeira}: ${error.message}`)
    else console.log(`✓ ${existing.nome} → ${grupo.subject} (${grupo.id})`)
  } else {
    const { error } = await supabase.from('leiloeiras').insert({
      nome: v.leiloeira,
      whatsapp_group_id: grupo.id,
      whatsapp_group_name: grupo.subject,
      // Cadastro via grupo não filtra por requisitos (a leiloeira decide);
      // requisitos ficam para o caminho de e-mail, se um dia for usado.
      requisitos: { requireIe: false, scoreMin: 0, documentos: [] },
      observacoes: 'Cadastro via grupo do WhatsApp (automação).',
      ativo: true,
    })
    if (error) console.error(`✗ ${v.leiloeira}: ${error.message}`)
    else console.log(`✓ ${v.leiloeira} criada → ${grupo.subject} (${grupo.id})`)
  }
}

const { data: final } = await supabase
  .from('leiloeiras')
  .select('nome, whatsapp_group_id, whatsapp_group_name, ativo')
  .order('nome')
console.log('\nEstado final:')
for (const l of final ?? []) console.log(` · ${l.nome} — grupo: ${l.whatsapp_group_name || '—'} ${l.ativo ? '' : '(inativa)'}`)
