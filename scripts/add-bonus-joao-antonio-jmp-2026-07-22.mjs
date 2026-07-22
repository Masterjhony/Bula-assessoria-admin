import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const ID = 'c0f291bb-17bc-4b10-b320-c5ed6e767057' // 10o Leilao Nelore JMP - Touros - 14/06
const { data: f, error } = await sb.from('bula_leilao_fechamento').select('id,nome,comissao_assessoria,por_assessor').eq('id', ID).single()
if (error) throw error
const ass = f.por_assessor || []
if (ass.some(a => /JOAO ANTONIO|JOÃO ANTONIO/i.test(a.nome||''))) { console.log('João Antônio já está no fechamento — nada a fazer'); process.exit(0) }
ass.push({
  vgv: 0, nome: 'João Antônio', animais: 0, empresa: 'Bula Assessoria',
  posicao: ass.length + 1, comissao: 2000, transacoes: 0, comissao_pct: null,
  observacao: '[BONUS 22/07] Bônus por meta batida — captação no leilão JMP (não é comissão de pista; VGV 0). CP BULA-2026-CP-BONUS-META-JMP-JOAOANTONIO, venc. 27/07/2026.',
})
const novaComissao = Math.round(((Number(f.comissao_assessoria)||0) + 2000) * 100) / 100
const { error: e2 } = await sb.from('bula_leilao_fechamento').update({ por_assessor: ass, comissao_assessoria: novaComissao }).eq('id', ID)
if (e2) throw e2
console.log(`OK: João Antônio (bônus 2.000) adicionado a "${f.nome}"; comissao_assessoria ${f.comissao_assessoria} -> ${novaComissao}`)
// Nota: o CP correspondente (BULA-2026-CP-BONUS-META-JMP-JOAOANTONIO, R$ 2.000, venc. 27/07)
// foi criado separadamente no mesmo dia; este script so vincula o bonus ao fechamento JMP
// para aparecer na pagina Bonus e Comissionamento. Idempotente.
