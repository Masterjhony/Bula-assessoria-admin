// Remoção da agenda pedida pelo Marcelo no WhatsApp em 31/08/2026, 12:04
// (sessão Baileys `joao-automation`, DM 5531994149161): ele mandou o print do
// card da agenda pública do LEILÃO KATAYAMA - MARABÁ (15/09, terça, Katayama
// Agropecuária, Marabá) com a legenda "Esse pode tirar".
//
// O registro nasceu em 24/08 pelo lote de inclusões daquele dia e sempre teve
// o rótulo "Nome provisorio: a fonte so informou a cidade e o criador" no card.
//
// Só sai o KATAYAMA - MARABÁ (15/09). O LEILÃO KATAYAMA - NOVO REPARTIMENTO
// (13/09) fica: o Marcelo não falou dele, e ele só existe em
// `cronograma_leiloes` (não aparece na agenda pública).
//
// O sync da planilha ESCALA está DESATIVADO desde 24/08, então apagar aqui
// basta — não há rotina que recrie a linha. Mesmo assim o script salva as três
// tabelas em outputs/backup-agenda-remocoes-2026-08-31.json antes de apagar.
//
// Uso: node scripts/agenda-2026-08-31-remocoes.mjs [--dry]

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

const REMOVER = [
  {
    data: '2026-09-15',
    nome: 'LEILÃO KATAYAMA - MARABÁ',
    motivo: 'Marcelo no WhatsApp em 31/08/2026 12:04, sobre o print do card: "Esse pode tirar".',
  },
]

const backup = {
  removido_em: '2026-08-31',
  origem: 'Pedido do Marcelo no WhatsApp (DM joao-automation). Sync da ESCALA desativado desde 24/08.',
  itens: [],
}

for (const alvo of REMOVER) {
  console.log(`\n=== ${alvo.data} — ${alvo.nome} ===`)

  const { data: crono, error: cronoErr } = await supabase
    .from('cronograma_leiloes')
    .select('*')
    .eq('nome', alvo.nome)
    .eq('data', alvo.data)
  if (cronoErr) throw new Error(`SELECT cronograma_leiloes: ${cronoErr.message}`)

  const { data: pub, error: pubErr } = await supabase
    .from('bula_leiloes')
    .select('*')
    .eq('nome', alvo.nome)
    .eq('data', alvo.data)
  if (pubErr) throw new Error(`SELECT bula_leiloes: ${pubErr.message}`)

  const cronoIds = (crono ?? []).map((r) => r.id)
  const { data: eventos, error: evErr } = cronoIds.length
    ? await supabase.from('agenda_events').select('*').in('linked_leilao_id', cronoIds)
    : { data: [], error: null }
  if (evErr) throw new Error(`SELECT agenda_events: ${evErr.message}`)

  console.log(`  cronograma_leiloes: ${crono?.length ?? 0} | bula_leiloes: ${pub?.length ?? 0} | agenda_events: ${eventos?.length ?? 0}`)

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
const backupPath = join(root, 'outputs', 'backup-agenda-remocoes-2026-08-31.json')
if (backup.itens.length === 0) {
  console.log('\nNada foi removido — backup nao gerado.')
} else if (dry) {
  console.log(`\n[dry] salvaria backup em ${backupPath}`)
} else {
  mkdirSync(dirname(backupPath), { recursive: true })
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8')
  console.log(`\nbackup: ${backupPath}`)
}

console.log('\nOK — remocoes de 31/08 processadas.')
