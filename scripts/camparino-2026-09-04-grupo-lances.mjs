// Mensagens do grupo "Lances Bula Assessoria" dos dois pregões (22/08 à noite e 23/08),
// paginadas de 1000 em 1000 (PostgREST corta), com o filtro das fichas de venda no console.
// Saída: outputs/camparino-fechamento-2026-09/wpp-lances-22-24ago.json
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
  .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
let all = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('whatsapp_messages').select('created_at,name,phone,body,media_filename')
    .gte('created_at','2026-08-22T22:30:00').lte('created_at','2026-08-24T06:00:00').ilike('name','%lances%').order('created_at').range(from, from+999)
  if (error) { console.error(error); break }
  all = all.concat(data||[]); if (!data || data.length < 1000) break
}
console.log('msgs 22/08 22:30Z → 24/08 06:00Z:', all.length)
const rx = /levamos|levou|foi com|manda pra|lt\s?\d|lote\s?\d|camparino|navira|penúltimo|penultimo|agradece/i
const sel = all.filter(m => rx.test(m.body||'') || m.media_filename)
console.log('filtradas:', sel.length)
for (const m of sel) console.log('  ' + m.created_at.slice(5,16), '|', (m.body||'').replace(/\n+/g,' ⏎ ').slice(0,260), m.media_filename ? '📎'+m.media_filename : '')
fs.writeFileSync('outputs/camparino-fechamento-2026-09/wpp-lances-22-24ago.json', JSON.stringify(all,null,2))
