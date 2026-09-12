// Remoção da agenda pedida em 12/09/2026, via WhatsApp:
//
// - 20/09 2º LEILÃO NELORE BRASIL (Xinguara/PA, JA Leilões Rurais, 12h) —
//   mensagem das 17:54, respondendo ao card do leilão: "Retira da agenda".
//
// Molde: scripts/agenda-2026-08-24-remocoes.mjs. O sync da ESCALA está
// desligado desde 24/08 (ver [[sync-escala-desativado]]), então apagar aqui
// basta — nada recria o registro. Ainda assim o script salva as linhas das
// três tabelas em outputs/backup-agenda-remocoes-2026-09-12.json antes de
// apagar, pra dar pra voltar atrás se for engano.
//
// Uso: node scripts/agenda-2026-09-12-remocoes.mjs [--dry]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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

// O nome difere em caixa entre as tabelas ("2º Leilão Nelore Brasil" em
// bula_leiloes, "2º LEILÃO NELORE BRASIL" no cronograma) — por isso ilike.
const REMOVER = [
  {
    data: '2026-09-20',
    nome: '2º LEILÃO NELORE BRASIL',
    motivo: 'WhatsApp em 12/09/2026 17:54, respondendo ao card do leilão: "Retira da agenda".',
  },
]

const backup = {
  removido_em: '2026-09-12',
  origem: 'Sync da ESCALA desligado desde 24/08 — apagar nas tres tabelas basta.',
  itens: [],
}

for (const alvo of REMOVER) {
  console.log(`\n=== ${alvo.data} — ${alvo.nome} ===`)

  const { data: crono, error: cronoErr } = await supabase
    .from('cronograma_leiloes')
    .select('*')
    .ilike('nome', alvo.nome)
    .eq('data', alvo.data)
  if (cronoErr) throw new Error(`SELECT cronograma_leiloes: ${cronoErr.message}`)

  const { data: pub, error: pubErr } = await supabase
    .from('bula_leiloes')
    .select('*')
    .ilike('nome', alvo.nome)
    .eq('data', alvo.data)
  if (pubErr) throw new Error(`SELECT bula_leiloes: ${pubErr.message}`)

  const cronoIds = (crono ?? []).map((r) => r.id)
  const { data: eventos, error: evErr } = cronoIds.length
    ? await supabase.from('agenda_events').select('*').in('linked_leilao_id', cronoIds)
    : { data: [], error: null }
  if (evErr) throw new Error(`SELECT agenda_events: ${evErr.message}`)

  console.log(`  cronograma_leiloes: ${crono?.length ?? 0} | bula_leiloes: ${pub?.length ?? 0} | agenda_events: ${eventos?.length ?? 0}`)
  for (const r of crono ?? []) console.log(`    crono  ${r.id}  ${r.nome}  ${r.data} ${r.hora ?? ''}`)
  for (const r of pub ?? []) console.log(`    bula   ${r.id}  ${r.nome}  ${r.data} ${r.horario ?? ''}  status=${r.status}`)
  for (const r of eventos ?? []) console.log(`    event  ${r.id}  ${r.title}  ${r.start_at}`)

  if (!crono?.length && !pub?.length && !eventos?.length) {
    console.log('  nada a remover — ja saiu da agenda')
    continue
  }

  // Trava contra apagar demais: a data+nome tem que casar com UM leilao so.
  if ((crono?.length ?? 0) > 1 || (pub?.length ?? 0) > 1) {
    throw new Error(`Mais de uma linha casou com ${alvo.nome} (${alvo.data}) — conferir na mao antes de apagar.`)
  }

  backup.itens.push({
    ...alvo,
    cronograma_leiloes: crono ?? [],
    bula_leiloes: pub ?? [],
    agenda_events: eventos ?? [],
  })

  if (dry) {
    console.log('  [dry] apagaria agenda_events, bula_leiloes e cronograma_leiloes nessa ordem')
    continue
  }

  if (cronoIds.length) {
    const { error } = await supabase.from('agenda_events').delete().in('linked_leilao_id', cronoIds)
    if (error) throw new Error(`DELETE agenda_events: ${error.message}`)
    console.log('  agenda_events: removido')
  }
  if (pub?.length) {
    const { error } = await supabase.from('bula_leiloes').delete().in('id', pub.map((r) => r.id))
    if (error) throw new Error(`DELETE bula_leiloes: ${error.message}`)
    console.log('  bula_leiloes: removido')
  }
  if (cronoIds.length) {
    const { error } = await supabase.from('cronograma_leiloes').delete().in('id', cronoIds)
    if (error) throw new Error(`DELETE cronograma_leiloes: ${error.message}`)
    console.log('  cronograma_leiloes: removido')
  }
}

// Nunca apagar sem deixar como voltar atras.
const backupPath = join(root, 'outputs', 'backup-agenda-remocoes-2026-09-12.json')
if (backup.itens.length === 0) {
  console.log('\nNada foi removido — backup nao gerado.')
} else if (dry) {
  console.log(`\n[dry] salvaria backup em ${backupPath}`)
} else {
  mkdirSync(dirname(backupPath), { recursive: true })
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8')
  console.log(`\nbackup: ${backupPath}`)
}

console.log('\nOK — remocoes processadas.')
