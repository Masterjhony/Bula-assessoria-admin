// Migra dados de Leilões do Supabase do Fórmula do Boi para o Supabase do web-bula.
// - Lê via service_role do projeto formula_boi (.env.local em ../formula_boi/formula_boi/)
// - Grava via service_role do web-bula (.env.local local)
// - UPSERT por chave primária — idempotente, pode rodar várias vezes
// - Para silos independentes: web-bula tem cópia dos dados, fórmula não é alterado
//
// Uso: node scripts/migrate-leiloes-data.mjs [--dry]

import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const formulaRoot = resolve(root, '..', 'formula_boi', 'formula_boi')

const dry = process.argv.includes('--dry')

function loadEnv(file) {
  return Object.fromEntries(
    readFileSync(file, 'utf-8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
      }),
  )
}

const envFormula = loadEnv(join(formulaRoot, '.env.local'))
const envBula = loadEnv(join(root, '.env.local'))

if (!envFormula.NEXT_PUBLIC_SUPABASE_URL || !envFormula.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Variáveis Supabase do fórmula ausentes em', formulaRoot, '/.env.local')
  process.exit(1)
}
if (!envBula.NEXT_PUBLIC_SUPABASE_URL || !envBula.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Variáveis Supabase do web-bula ausentes em .env.local')
  process.exit(1)
}

const src = createClient(
  envFormula.NEXT_PUBLIC_SUPABASE_URL,
  envFormula.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)
const dst = createClient(
  envBula.NEXT_PUBLIC_SUPABASE_URL,
  envBula.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

console.log('Origem  :', envFormula.NEXT_PUBLIC_SUPABASE_URL)
console.log('Destino :', envBula.NEXT_PUBLIC_SUPABASE_URL)
console.log('Modo    :', dry ? 'DRY-RUN (não grava)' : 'ESCRITA real')
console.log('---')

// Ordem respeitando FK (bula_leilao_assessores depende de leiloes+membros, etc.)
const TABLES = [
  { name: 'bula_membros',                onConflict: 'id' },
  { name: 'bula_leiloes',                onConflict: 'id' },
  { name: 'bula_leilao_assessores',      onConflict: 'leilao_id,membro_id' },
  { name: 'bula_acordos_criadores',      onConflict: 'id' },
  { name: 'bula_leilao_fechamento',      onConflict: 'id' },
  { name: 'leiloes_equipe',              onConflict: 'id' },
  { name: 'cronograma_leiloes',          onConflict: 'id' },
  // self-ref: import duas vezes (raiz primeiro, depois indicados)
  { name: 'bula_comissoes_padrao_assessor', onConflict: 'id', selfRef: 'indicado_por_id' },
]

const summary = []

for (const { name, onConflict, selfRef } of TABLES) {
  process.stdout.write(`\n${name}: lendo origem... `)
  const { data: rows, error: errRead } = await src.from(name).select('*')
  if (errRead) {
    console.error(`ERRO leitura: ${errRead.message}`)
    summary.push({ table: name, read: 0, written: 0, error: errRead.message })
    continue
  }
  process.stdout.write(`${rows.length} registros. `)

  if (rows.length === 0) {
    summary.push({ table: name, read: 0, written: 0 })
    continue
  }

  if (dry) {
    process.stdout.write(`(dry-run, pulando escrita)`)
    summary.push({ table: name, read: rows.length, written: 0 })
    continue
  }

  let toWrite = rows
  let written = 0

  if (selfRef) {
    // Insere primeiro registros sem self-ref, depois os filhos.
    const roots = rows.filter((r) => !r[selfRef])
    const children = rows.filter((r) => r[selfRef])
    process.stdout.write(`(${roots.length} root + ${children.length} child) `)
    if (roots.length) {
      const { error: e1 } = await dst.from(name).upsert(roots, { onConflict })
      if (e1) {
        console.error(`\n  ERRO root: ${e1.message}`)
        summary.push({ table: name, read: rows.length, written, error: e1.message })
        continue
      }
      written += roots.length
    }
    if (children.length) {
      const { error: e2 } = await dst.from(name).upsert(children, { onConflict })
      if (e2) {
        console.error(`\n  ERRO child: ${e2.message}`)
        summary.push({ table: name, read: rows.length, written, error: e2.message })
        continue
      }
      written += children.length
    }
  } else {
    const { error: errWrite } = await dst.from(name).upsert(toWrite, { onConflict })
    if (errWrite) {
      console.error(`\n  ERRO escrita: ${errWrite.message}`)
      summary.push({ table: name, read: rows.length, written: 0, error: errWrite.message })
      continue
    }
    written = toWrite.length
  }

  process.stdout.write(`OK (${written} gravados).`)
  summary.push({ table: name, read: rows.length, written })
}

console.log('\n\n=== RESUMO ===')
for (const s of summary) {
  const status = s.error ? `ERRO: ${s.error}` : `read=${s.read} written=${s.written}`
  console.log(`  ${s.table.padEnd(40)} ${status}`)
}
const totalErrors = summary.filter((s) => s.error).length
console.log(`\nTabelas com erro: ${totalErrors}/${summary.length}`)
if (totalErrors > 0) process.exit(1)
