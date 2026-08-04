// Alinha os fechamentos de JULHO/2026 ao relatorio oficial de vendas da equipe
// (Power BI enviado ao chefe em 04/08: 11 eventos, VGV 2.182.500, 77 animais,
// 61 lotes). Estado do ERP antes: 13 fechamentos, 2.496.600 / 88 / 71.
//
// Diagnostico (correlacao):
// - Os 11 eventos do relatorio JA existem no ERP com VGV identico.
// - Sobram 2 fechamentos "manuais" de 07/07 criados em 08/07 a partir de
//   mensagens de WhatsApp (obs: "fechamentos do WhatsApp (07/07/2026)"), com
//   lances=[] e SEM CP/CR vinculadas:
//     1ce12507 "Leilao Virtual Nelore Kriz - 07/07/2026" (117.600/6/6)
//     379c36f8 "Leilao Navirai - 07/07/2026"            (196.500/5/5)
//   Sao versoes preliminares/duplicadas (o Navirai oficial de 05/07 e a etapa
//   16/07 estao no ERP via HastaPro/lances-auto). Removidos com BACKUP em
//   outputs/backup-fechamentos-jul07-removidos-2026-08-04.json.
// - MEGA EAO BAVIERA Machos (12/07): relatorio diz 11 lotes; ERP tinha 10
//   porque a captura de lances teve 11 vendas e 1 SEM valor. Ajustados
//   lotes_vendidos/ofertados p/ 11 (VGV e animais inalterados).
//
// Conferencia: 2.496.600-117.600-196.500=2.182.500 | 88-6-5=77 | 71-6-5+1=61.
// Uso: DRY_RUN=1 node scripts/ajusta-fechamentos-julho-relatorio-vendas-2026-08-04.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const now = () => new Date().toISOString()

const ALVO = { vgv: 2182500, animais: 77, lotes: 61 }
const REMOVER = ['1ce12507', '379c36f8']
const EAO_MACHOS = '6a67f76b'

console.log(DRY_RUN ? '*** DRY RUN ***\n' : '*** GRAVANDO ***\n')

const { data: julho, error } = await sb.from('bula_leilao_fechamento').select('*')
  .gte('data', '2026-07-01').lte('data', '2026-07-31')
if (error) throw error
const find = (p) => {
  const hit = julho.filter((f) => f.id.startsWith(p))
  if (hit.length !== 1) throw new Error(`prefixo ${p}: ${hit.length} hits`)
  return hit[0]
}

// 1) Remocao dos preliminares de 07/07 (com backup + guarda de vinculos)
const remover = REMOVER.map(find)
for (const f of remover) {
  const { data: cps } = await sb.from('erp_contas_pagar').select('id').eq('fechamento_id', f.id)
  const { data: crs } = await sb.from('erp_contas_receber').select('id').eq('fechamento_id', f.id)
  if (cps?.length || crs?.length) throw new Error(`${f.nome}: tem ${cps?.length || 0} CP / ${crs?.length || 0} CR vinculadas — NAO removo`)
}
const backupPath = join(root, 'outputs', 'backup-fechamentos-jul07-removidos-2026-08-04.json')
if (!DRY_RUN) {
  mkdirSync(join(root, 'outputs'), { recursive: true })
  writeFileSync(backupPath, JSON.stringify(remover, null, 2))
  console.log(`Backup: ${backupPath}`)
}
for (const f of remover) {
  console.log(`[-] REMOVE ${f.data} ${brl(f.vgv_total)} ${f.nome} (${f.id.slice(0, 8)})`)
  if (!DRY_RUN) {
    const { error: eDel } = await sb.from('bula_leilao_fechamento').delete().eq('id', f.id)
    if (eDel) throw new Error(`delete ${f.id}: ${eDel.message}`)
  }
}

// 2) EAO Machos: 10 -> 11 lotes (o 11o e a venda capturada sem valor)
const eao = find(EAO_MACHOS)
if (eao.lotes_vendidos !== 11) {
  console.log(`[~] ${eao.nome}: lotes ${eao.lotes_vendidos} -> 11 (VGV/animais inalterados)`)
  if (!DRY_RUN) {
    const obs = `${eao.observacoes || ''}\n[04/08/2026] Lotes ajustados 10 -> 11 conforme relatorio oficial de vendas de julho (Power BI): a captura de lances teve 11 vendas, 1 sem valor informado — ela conta como lote, sem VGV.`
    const { error: eUp } = await sb.from('bula_leilao_fechamento').update({
      lotes_vendidos: 11, lotes_ofertados: 11, observacoes: obs, updated_at: now(),
    }).eq('id', eao.id)
    if (eUp) throw new Error(`EAO: ${eUp.message}`)
  }
} else console.log('[=] EAO Machos ja com 11 lotes')

// 3) Validacao final contra o relatorio
const { data: dep } = DRY_RUN ? { data: null } : await sb.from('bula_leilao_fechamento')
  .select('vgv_total,animais_vendidos,lotes_vendidos').gte('data', '2026-07-01').lte('data', '2026-07-31')
if (dep) {
  const vgv = dep.reduce((s, f) => s + Number(f.vgv_total || 0), 0)
  const an = dep.reduce((s, f) => s + Number(f.animais_vendidos || 0), 0)
  const lt = dep.reduce((s, f) => s + Number(f.lotes_vendidos || 0), 0)
  const ok = vgv === ALVO.vgv && an === ALVO.animais && lt === ALVO.lotes
  console.log(`\nJULHO no ERP: ${brl(vgv)} | ${an} animais | ${lt} lotes ${ok ? '✓ BATE com o relatorio' : `✗ NAO BATE (alvo ${brl(ALVO.vgv)} / ${ALVO.animais} / ${ALVO.lotes})`}`)
  if (!ok) process.exitCode = 1
}
