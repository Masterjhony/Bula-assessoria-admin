import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, '..', '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// Renomeia "Fórmula do Boi" → "Bula Remates" nas tabelas que carregam empresa
for (const table of ['leiloes_equipe', 'bula_comissoes_padrao_assessor']) {
  const { data, error } = await sb.from(table).update({ empresa: 'Bula Remates' }).eq('empresa', 'Fórmula do Boi').select()
  if (error) console.error(`${table}: ${error.message}`)
  else console.log(`${table}: ${data.length} linhas atualizadas`)
}
