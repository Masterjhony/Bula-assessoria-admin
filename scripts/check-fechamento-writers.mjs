#!/usr/bin/env node
/**
 * Inventário read-only dos caminhos capazes de gravar fechamento/vendas.
 *
 * Uso:
 *   node scripts/check-fechamento-writers.mjs
 *   node scripts/check-fechamento-writers.mjs --json
 *   node scripts/check-fechamento-writers.mjs --observed
 *
 * O comando nunca escreve nem atualiza o manifesto. `--observed` imprime a
 * baseline detectada para revisão humana; copiá-la para o manifesto continua
 * sendo uma decisão explícita. Além de path/tabela/operação, cada aprovação é
 * presa ao SHA-256 do arquivo inteiro (com quebras normalizadas para LF). Assim,
 * uma alteração em writer já conhecido não passa apenas porque o path continua
 * igual.
 *
 * Limite consciente: isto é análise lexical conservadora, não uma AST de
 * TypeScript ou um parser completo de PL/pgSQL. Strings construídas em runtime,
 * aliases não usuais e SQL recebido externamente podem escapar. Os executores
 * de SQL a partir de arquivo são, por isso, inventariados à parte; a proteção
 * transacional do banco continua sendo a última barreira.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const MANIFEST_PATH = resolve(SCRIPT_DIR, 'fechamento-writers.manifest.json')
const JSON_OUTPUT = process.argv.includes('--json')
const OBSERVED_OUTPUT = process.argv.includes('--observed')

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx'])
const SKIP_DIRS = new Set([
  '.git', '.next', 'node_modules', 'graphify-out', 'outputs', 'output', 'public',
  'scratch', 'tmp', '.codex', '.codex-dev', '.codex_tmp', '.agents',
])
const TARGETS = ['bula_leilao_fechamento', 'bula_leilao_vendas']
const OPERATION_ORDER = ['insert', 'upsert', 'update', 'archive', 'delete', 'truncate', 'execute', 'indirect-call']
const CATEGORY_NAMES = [
  'directClosureWriters',
  'dynamicClosureWriters',
  'indirectClosureEntrypoints',
  'directSalesWriters',
  'governedRpcCallers',
  'sqlTargetWriters',
  'sqlRpcDefinitions',
  'dynamicSqlExecutors',
]

function toPosix(path) {
  return path.replaceAll('\\', '/')
}

function walk(dir, extensions) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    const absolute = resolve(dir, entry.name)
    if (entry.isDirectory()) found.push(...walk(absolute, extensions))
    else if (extensions.has(extname(entry.name))) found.push(absolute)
  }
  return found
}

function normalizedContent(content) {
  return content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

function fingerprint(content) {
  return `sha256:${createHash('sha256').update(normalizedContent(content), 'utf8').digest('hex')}`
}

function ordered(values) {
  const unique = [...new Set(values)]
  return unique.sort((left, right) => {
    const leftIndex = OPERATION_ORDER.indexOf(left)
    const rightIndex = OPERATION_ORDER.indexOf(right)
    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) return 1
      if (rightIndex === -1) return -1
      return leftIndex - rightIndex
    }
    return left.localeCompare(right, 'en')
  })
}

function findSupabaseMutations(content, table) {
  const operations = []
  const lines = normalizedContent(content).split('\n')
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tableRef = new RegExp(`\\.from\\s*\\(\\s*(['\"])${escapedTable}\\1\\s*\\)`)
  for (let index = 0; index < lines.length; index += 1) {
    if (!tableRef.test(lines.slice(index, index + 3).join('\n'))) continue
    // Cadeias Supabase são inspecionadas numa janela limitada para evitar que
    // um SELECT seja associado ao DML de uma consulta posterior.
    const statementWindow = lines.slice(index, index + 16).join('\n')
    for (const match of statementWindow.matchAll(/\.(insert|update|upsert|delete)\s*\(/g)) {
      operations.push(match[1])
    }
  }
  return ordered(operations)
}

function findDynamicClosureMutations(content, directOperations) {
  if (directOperations.length || !content.includes('bula_leilao_fechamento')) return []
  const operations = []
  const lines = normalizedContent(content).split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\.from\s*\(\s*(?:name|table|tableName|targetTable)\s*\)/.test(lines.slice(index, index + 3).join('\n'))) continue
    const statementWindow = lines.slice(index, index + 16).join('\n')
    for (const match of statementWindow.matchAll(/\.(insert|update|upsert|delete)\s*\(/g)) {
      operations.push(match[1])
    }
  }
  return ordered(operations)
}

function hasIndirectClosureCall(content) {
  const staticImport = /import[\s\S]{0,500}\b(?:rebuildFechamentoFromLances|handleLanceGroupMessage)\b[\s\S]{0,300}\bfrom\b/.test(content)
  const dynamicImport = /await\s+import\s*\([^)]*(?:lances-fechamento|whatsapp-lances)[^)]*\)/.test(content)
  if (!staticImport && !dynamicImport) return false
  return /\b(?:rebuildFechamentoFromLances|handleLanceGroupMessage)\s*\(/.test(content)
}

function findSqlTargetMutations(content, table) {
  const operations = []
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    ['insert', new RegExp(`\\binsert\\s+into\\s+(?:public\\.)?${escapedTable}\\b`, 'gi')],
    ['update', new RegExp(`\\bupdate\\s+(?:public\\.)?${escapedTable}\\b`, 'gi')],
    ['delete', new RegExp(`\\bdelete\\s+from\\s+(?:public\\.)?${escapedTable}\\b`, 'gi')],
    ['truncate', new RegExp(`\\btruncate(?:\\s+table)?\\s+(?:public\\.)?${escapedTable}\\b`, 'gi')],
  ]
  for (const [operation, pattern] of patterns) {
    if (pattern.test(content)) operations.push(operation)
  }
  return ordered(operations)
}

function sqlFunctionBlocks(content) {
  const lines = normalizedContent(content).split('\n')
  const blocks = []
  for (let index = 0; index < lines.length; index += 1) {
    const declaration = lines[index].match(/^\s*create\s+or\s+replace\s+function\s+((?:public\.)?[a-z_][a-z0-9_]*)\s*\(/i)
    if (!declaration) continue
    let delimiter = null
    let end = index
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      if (!delimiter) {
        const asLine = lines[cursor].match(/\bas\s+(\$[a-z0-9_]*\$)\s*$/i)
        if (asLine) delimiter = asLine[1]
      } else if (lines[cursor].trim() === `${delimiter};`) {
        end = cursor
        break
      }
    }
    if (!delimiter || end === index) continue
    blocks.push({
      rpc: declaration[1].includes('.') ? declaration[1].toLowerCase() : `public.${declaration[1].toLowerCase()}`,
      content: lines.slice(index, end + 1).join('\n'),
    })
    index = end
  }
  return blocks
}

function isDynamicSqlExecutor(content) {
  if (!/(?:readFile|readFileSync|fs\.readFile)/i.test(content)) return false
  if (!/(?:\.sql|migrations?)/i.test(content)) return false
  return [...content.matchAll(/\.query\s*\(\s*([A-Za-z_$][\w$]*)\s*(?:,|\))/g)]
    .some((match) => /^(?:sql|ddl|migrationSql|statement)$/i.test(match[1]))
}

function relevantRpcCallOperations(content, rpc, fallbackOperations) {
  const shortName = rpc.replace(/^public\./, '')
  if (shortName !== 'bula_fechamento_write_governado') return fallbackOperations
  const operations = []
  for (const match of content.matchAll(/\bp_operation\s*:\s*['\"](insert|update|archive|delete)['\"]/g)) {
    operations.push(match[1])
  }
  const rawCall = new RegExp(`\\b(?:public\\.)?${shortName}\\s*\\(\\s*['\"](insert|update|archive|delete)['\"]`, 'gi')
  for (const match of content.matchAll(rawCall)) operations.push(match[1].toLowerCase())
  return operations.length ? ordered(operations) : fallbackOperations
}

function hasRpcCall(content, rpc) {
  const shortName = rpc.replace(/^public\./, '')
  const clientCall = new RegExp(`\\.rpc\\s*\\(\\s*['\"]${shortName}['\"]`)
  const rawSqlCall = new RegExp(`\\b(?:public\\.)?${shortName}\\s*\\(\\s*['\"](?:insert|update|archive|delete)['\"]`, 'i')
  return clientCall.test(content) || rawSqlCall.test(content)
}

function makeEntry(path, table, operations, content, extra = {}) {
  return {
    path,
    table: `public.${table}`,
    operations: ordered(operations),
    ...extra,
    fingerprint: fingerprint(content),
  }
}

function entryIdentity(entry) {
  return JSON.stringify({
    path: entry.path,
    table: entry.table,
    operations: entry.operations,
    rpc: entry.rpc ?? null,
  })
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => entryIdentity(left).localeCompare(entryIdentity(right), 'en'))
}

function compareCategory(expectedEntries, actualEntries) {
  const expected = sortEntries(expectedEntries)
  const actual = sortEntries(actualEntries)
  const expectedByIdentity = new Map(expected.map((entry) => [entryIdentity(entry), entry]))
  const actualByIdentity = new Map(actual.map((entry) => [entryIdentity(entry), entry]))
  const unexpected = actual.filter((entry) => !expectedByIdentity.has(entryIdentity(entry)))
  const missing = expected.filter((entry) => !actualByIdentity.has(entryIdentity(entry)))
  const changedFingerprint = actual.flatMap((entry) => {
    const approved = expectedByIdentity.get(entryIdentity(entry))
    if (!approved || approved.fingerprint === entry.fingerprint) return []
    return [{ ...entry, expectedFingerprint: approved.fingerprint }]
  })
  return { expected, actual, unexpected, missing, changedFingerprint }
}

const sourceFiles = [
  ...walk(resolve(REPO_ROOT, 'src'), SOURCE_EXTENSIONS),
  ...walk(resolve(REPO_ROOT, 'scripts'), SOURCE_EXTENSIONS),
]
const sqlRoot = resolve(REPO_ROOT, 'supabase')
const sqlFiles = walk(sqlRoot, new Set(['.sql']))
const fileCache = new Map()
for (const absolute of [...sourceFiles, ...sqlFiles]) fileCache.set(absolute, readFileSync(absolute, 'utf8'))

const observed = Object.fromEntries(CATEGORY_NAMES.map((name) => [name, []]))
const rpcDefinitions = []

for (const absolute of sqlFiles) {
  const path = toPosix(relative(REPO_ROOT, absolute))
  const content = fileCache.get(absolute)
  for (const table of TARGETS) {
    const operations = findSqlTargetMutations(content, table)
    if (operations.length) observed.sqlTargetWriters.push(makeEntry(path, table, operations, content))
  }
  for (const block of sqlFunctionBlocks(content)) {
    for (const table of TARGETS) {
      const operations = findSqlTargetMutations(block.content, table)
      if (!operations.length) continue
      const entry = makeEntry(path, table, operations, content, { rpc: block.rpc })
      observed.sqlRpcDefinitions.push(entry)
      rpcDefinitions.push({ rpc: block.rpc, table, operations })
    }
  }
}

for (const absolute of sourceFiles) {
  const path = toPosix(relative(REPO_ROOT, absolute))
  if (path === 'scripts/check-fechamento-writers.mjs') continue
  const content = fileCache.get(absolute)
  const directClosure = findSupabaseMutations(content, 'bula_leilao_fechamento')
  const directSales = findSupabaseMutations(content, 'bula_leilao_vendas')
  const dynamicClosure = findDynamicClosureMutations(content, directClosure)

  if (directClosure.length) observed.directClosureWriters.push(makeEntry(path, 'bula_leilao_fechamento', directClosure, content))
  if (dynamicClosure.length) observed.dynamicClosureWriters.push(makeEntry(path, 'bula_leilao_fechamento', dynamicClosure, content))
  if (hasIndirectClosureCall(content)) {
    observed.indirectClosureEntrypoints.push(makeEntry(path, 'bula_leilao_fechamento', ['indirect-call'], content))
  }
  if (directSales.length) observed.directSalesWriters.push(makeEntry(path, 'bula_leilao_vendas', directSales, content))
  if (isDynamicSqlExecutor(content)) {
    observed.dynamicSqlExecutors.push({
      path,
      table: '<dynamic-sql-target>',
      operations: ['execute'],
      fingerprint: fingerprint(content),
    })
  }
  for (const definition of rpcDefinitions) {
    if (!hasRpcCall(content, definition.rpc)) continue
    observed.governedRpcCallers.push(makeEntry(
      path,
      definition.table,
      relevantRpcCallOperations(content, definition.rpc, definition.operations),
      content,
      { rpc: definition.rpc },
    ))
  }
}

for (const category of CATEGORY_NAMES) observed[category] = sortEntries(observed[category])

if (OBSERVED_OUTPUT) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 2, categories: observed }, null, 2)}\n`)
  process.exit(0)
}

let manifest
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
} catch (error) {
  console.error(`ERRO: manifesto inválido: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}

const report = { ok: true, schemaVersion: manifest.schemaVersion, categories: {}, totals: {} }
if (manifest.schemaVersion !== 2 || !manifest.categories || typeof manifest.categories !== 'object') {
  report.ok = false
  report.manifestError = 'Esperado schemaVersion 2 com objeto categories.'
}

for (const category of CATEGORY_NAMES) {
  const expected = Array.isArray(manifest.categories?.[category]) ? manifest.categories[category] : []
  const result = compareCategory(expected, observed[category])
  report.categories[category] = result
  report.totals[category] = result.actual.length
  if (result.unexpected.length || result.missing.length || result.changedFingerprint.length) report.ok = false
}

if (JSON_OUTPUT) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  console.log(report.ok ? 'OK: manifesto de writers confere.' : 'ERRO: manifesto de writers divergiu.')
  if (report.manifestError) console.log(`- manifesto: ${report.manifestError}`)
  for (const category of CATEGORY_NAMES) {
    const result = report.categories[category]
    console.log(`- ${category}: ${result.actual.length}`)
    for (const entry of result.unexpected) console.log(`  + NÃO REVISADO: ${entry.path} | ${entry.table} | ${entry.operations.join(',')}`)
    for (const entry of result.missing) console.log(`  - NÃO ENCONTRADO: ${entry.path} | ${entry.table} | ${entry.operations.join(',')}`)
    for (const entry of result.changedFingerprint) {
      console.log(`  ! ARQUIVO ALTERADO: ${entry.path} | esperado ${entry.expectedFingerprint} | atual ${entry.fingerprint}`)
    }
  }
  console.log('Leitura apenas; o manifesto nunca é atualizado automaticamente.')
}

process.exitCode = report.ok ? 0 : 1
