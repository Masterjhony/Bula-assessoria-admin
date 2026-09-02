/**
 * TXT da conferência de agosto/2026 para mandar no grupo, com a ficha de
 * arremate de cada lote — colada LITERAL do WhatsApp, não redigitada.
 *
 * Só entra o que ainda depende do outro lado. O que a correlação já fechou
 * (ficha + HastaPro + filial certa) aparece apontado, sem discussão; e o que
 * era erro nosso e já foi corrigido não entra — não é assunto do grupo.
 *
 * Cada item aponta para a mensagem pelo trecho que só ela tem; o script busca
 * o texto inteiro em whatsapp_messages. Se um seletor deixar de casar, ele
 * grita em vez de gerar um comprovante silenciosamente vazio — é o ponto do
 * arquivo.
 *
 *   node scripts/gera-txt-diferenca-agosto-2026.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })

const LANCES = '120363162972078973'   // Lances Bula Assessoria

const msgs = []
for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.from('whatsapp_messages').select('body, created_at, phone')
        .eq('origin', 'group-inbound')
        .gte('created_at', '2026-08-01T00:00:00Z').lte('created_at', '2026-08-31T23:59:59Z')
        .order('created_at').range(off, off + 999)
    if (error) { console.error('erro:', error.message); process.exit(1) }
    msgs.push(...(data ?? [])); if (!data || data.length < 1000) break
}

const hora = ts => {
    const d = new Date(new Date(ts).getTime() - 3 * 3600e3)
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
let faltou = 0
/** Acha a mensagem pelo trecho. Devolve pronta para colar, recuada. */
function ficha(trecho, { grupo = LANCES } = {}) {
    const alvo = String(trecho).toLowerCase()
    const cand = msgs.filter(m => String(m.phone || '').startsWith(grupo) && String(m.body || '').toLowerCase().includes(alvo))
    if (!cand.length) { faltou++; return `   [!] NAO ENCONTRADA: "${trecho}"` }
    const m = cand[0]
    const corpo = String(m.body).split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => '   | ' + l).join('\n')
    return `   ficha do grupo, ${hora(m.created_at)}:\n${corpo}`
}

const T = []
const p = s => T.push(s)

p('CONFERENCIA VGV AGOSTO/2026')
p('')
p('Sua lista (filial 2): 6.118.100')
p('Nosso, ja corrigido:  6.784.900')
p('Diferenca:              666.800')
p('')
p('Dos 22 leiloes da sua filial 2, 20 batem exatos. Sobrou o de baixo.')
p('')
p('')
p('===== PRECISA VALIDAR =====')
p('')
p('1) CAMPARINO LOTE 22 - 63.000 - quem fica?')
p('   M3 assessora o cliente, mas o lance foi lancado pela gente.')
p('')
p(ficha('Levamos lt 22 - 2100'))
p('')
p('   e logo depois, no grupo:')
p('   | Foi cmg na verdade')
p('   | Edita ai')
p('   | Pq M3 assessora ele')
p('   | Mais lancou cmg')
p('')
p('2) CAMPARINO LOTE 20 - 1.400 ou 1.200?')
p('   Sua lista poe 1.200, igual ao lote 19 de 2 min antes.')
p('   Compradores diferentes, entao nao e lote repetido.')
p('')
p(ficha('Lote 19 - 1200 - 1M'))
p('')
p(ficha('Levamos lt 20 - 1400'))
p('')
p('3) LS GALERIA 07/08 LOTE 18 - fechou?')
p('   Nao esta na sua lista nem na minha. 37.500 (50%) ou 75.000.')
p('')
p(ficha('Levamos lt 18'))
p('')
p('4) GUADALUPE 10/08 - voce conseguiu as vendas?')
p('   Estou sem nada. Nenhuma ficha no grupo naquele dia.')
p('')
p('')
p('===== JA CONFIRMADO PELA FICHA - SO FALTA LANCAR AI =====')
p('')
p('5) SAO GERALDO 01/08 - 375.800')
p('   Esta na FILIAL 01 (Bula Remates), por isso nao aparece na sua')
p('   lista. Sao 5 lotes, e batem com a sua filial 01:')
p('   lote 1000        5.000 x 40 = 200.000   Douglas')
p('   lote 3000        4.000 x 30 = 120.000   Leonardo')
p('   lotes 56/57/58     620 x 30 =  55.800   Leonardo')
p('')
p(ficha('Levamos lt 1000 - 5000 40x'))
p('')
p(ficha('Compramos os lotes 56-57-58'))
p('')
p(ficha('Levamos LT 3.000'))
p('')
p('6) KATISPERA 17/08 - 117.000')
p('   Esse leilao nao existe no HastaPro (so o 3o Katispera de 20/06).')
p('   Lote 3, 3.900 x 30.')
p('')
p(ficha('Levamos lt 3 - 3900'))
p('')
p('7) LOTE 21 - 105.000 - nao e do Camparino')
p('   A ficha nomeia: 6o Excelencia Genetica. Esse leilao tambem nao')
p('   existe no HastaPro.')
p('')
p(ficha('Lote 21 / 3500'))
p('')
p('8) CAMPARINO LOTES 12 e 78 - voce estava certo, ja entrei')
p('   Lote 12: 1.650 x 30 = 49.500 (Leo)')
p('   Lote 78: 1.600 x 30 = 48.000 (Peralta - a ficha veio sem valor)')
p('')
p(ficha('Levamos lote 12'))
p('')
p(ficha('PERALTA BULA'))
p('')
p('   obs: na ficha do 12 o Leo escreveu "Marcondes" e voce lancou no')
p('   Camparino. No total da igual, mas muda o leilao da comissao.')
p('')
p('')
p('===== A DIFERENCA =====')
p('   375.800  Sao Geraldo (filial 01)')
p('   117.000  Katispera')
p('   105.000  6o Excelencia Genetica')
p('    63.000  lote 22 (a definir)')
p('     6.000  lote 20 (1.400 x 1.200)')
p('   -------')
p('   666.800')

const out = join(homedir(), 'Desktop', 'Conferencia-Agosto-2026.txt')
writeFileSync(out, T.join('\n') + '\n', 'utf8')
console.log('TXT gerado:', out)
if (faltou) console.log(`ATENCAO: ${faltou} ficha(s) nao encontrada(s) - confira antes de mandar.`)
