// Regra da empresa (chefe, 21/07/2026): comissões são pagas todo dia 25;
// quando o dia 25 cai em fim de semana ou feriado, o pagamento passa para o
// PRÓXIMO DIA ÚTIL (ex.: 25/07/2026 é sábado → paga-se 27/07, segunda).
//
// Este script corrige o VENCIMENTO das contas a pagar de comissão em aberto
// que estejam em dia não-útil (sábado/domingo/feriado nacional fixo),
// movendo para o dia útil seguinte. Só mexe em títulos ABERTOS (aberto/
// parcial/vencido) e de comissão (categoria Comissão Funcionário ou
// descrição contendo COMISS). Idempotente por natureza (dia útil não muda).
//
// Geradores futuros: usar a mesma regra (projeta-folha-fixa-2026.mjs já usa).
// Uso: DRY_RUN=1 node scripts/ajusta-vencimento-comissoes-dia-util.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').replace(/^﻿/, '').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Feriados nacionais fixos (móveis como Carnaval/Corpus Christi não caem em
// dia 25; se um dia precisar, adicionar aqui)
const FERIADOS_FIXOS = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'])
const isDiaUtil = (iso) => {
  const d = new Date(iso + 'T12:00:00')
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return false
  return !FERIADOS_FIXOS.has(iso.slice(5))
}
export const proxDiaUtil = (iso) => {
  let d = new Date(iso + 'T12:00:00')
  while (true) {
    const s = d.toISOString().slice(0, 10)
    if (isDiaUtil(s)) return s
    d.setDate(d.getDate() + 1)
  }
}

const CAT_COMISSAO = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e' // Comissão Funcionário

const { data: cps, error } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,vencimento,status,categoria_id,numero_documento')
  .in('status', ['aberto', 'parcial', 'vencido'])
  .order('vencimento')
if (error) { console.error(error); process.exit(1) }

const alvo = (cps || []).filter((r) =>
  r.vencimento &&
  (r.categoria_id === CAT_COMISSAO || /comiss/i.test(r.descricao || '')) &&
  !isDiaUtil(r.vencimento)
)

console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${alvo.length} título(s) de comissão com vencimento em dia não-útil:`)
const porData = {}
for (const r of alvo) {
  const novo = proxDiaUtil(r.vencimento)
  porData[`${r.vencimento} → ${novo}`] = (porData[`${r.vencimento} → ${novo}`] || 0) + 1
  console.log(' ', r.vencimento, '→', novo, '|', `R$ ${Number(r.valor).toLocaleString('pt-BR')}`.padStart(14), '|', (r.descricao || '').slice(0, 60))
  if (!DRY_RUN) {
    const { error: e2 } = await sb.from('erp_contas_pagar').update({ vencimento: novo }).eq('id', r.id)
    if (e2) { console.error('   ERRO:', e2.message); process.exit(1) }
  }
}
console.log('\nResumo:', JSON.stringify(porData, null, 1))
console.log(DRY_RUN ? '(nada gravado)' : 'OK — vencimentos ajustados para o dia útil seguinte.')
