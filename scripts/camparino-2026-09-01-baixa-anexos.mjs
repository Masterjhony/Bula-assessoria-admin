// Baixa do bucket whatsapp-media os anexos que o Marcelo mandou por DM em 11/09/2026 15:54
// (2 PDFs da listagem da Programa + imagem da IE do Camparino + áudios) para outputs/.../anexos.
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
  .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const out = 'outputs/camparino-fechamento-2026-09/anexos'
fs.mkdirSync(out, { recursive: true })
const files = [
  ['3A2CF19B2602813A8EE9.pdf', 'camparino-A.pdf'],          // Essência 22/08 (1 página)
  ['3A2C6BBDD1DB4A23ED5D.pdf', 'camparino-B.pdf'],          // 28º Reprodutores 23/08 (3 páginas)
  ['3AF019EFBE3C7CAD948D.jpg', 'inscricao-estadual.jpg'],   // IE SEFAZ/MT da Agropecuária Camparino
  ['3A5DEA1C78D1E982BBFB.ogg', 'audio-15h54.ogg'],          // "isso daí é a Camparino… vê o a receber e emite a nota"
  ['3A280A150657B7020445.ogg', 'audio-15h24.ogg'],
]
for (const [id, name] of files) {
  const path = `baileys/joao-automation/553194149161/${id}`
  const { data, error } = await sb.storage.from('whatsapp-media').download(path)
  if (error) { console.error(name, error.message); continue }
  const buf = Buffer.from(await data.arrayBuffer())
  fs.writeFileSync(`${out}/${name}`, buf)
  console.log(name, buf.length, 'bytes')
}
