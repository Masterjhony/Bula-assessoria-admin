/**
 * FINANCEIRO FAZENDA — monta a pasta de entrega na Área de Trabalho:
 *   01 - Controle Financeiro Fazenda.xlsx
 *   02 - Relatório Financeiro Fazenda (<período>).pdf
 *   03 - Comprovantes\  (anexos do export renomeados por data + o que são)
 *   04 - Fonte\         (o .txt exportado do WhatsApp + áudio + .zip original)
 *
 *   node scripts/fazenda/monta-pasta-financeiro-fazenda.mjs <pasta-do-export-extraido> [zip-original]
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const OUT = 'outputs/financeiro-fazenda'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))
const [, , EXPORT_DIR, ZIP] = process.argv
if (!EXPORT_DIR || !fs.existsSync(EXPORT_DIR)) { console.error('uso: node monta-pasta-financeiro-fazenda.mjs <pasta-do-export-extraido> [zip]'); process.exit(1) }

const dma = s => `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`
const DEST = path.join(os.homedir(), 'Desktop', 'Financeiro Fazenda')
const COMP = path.join(DEST, '03 - Comprovantes')
const FONTE = path.join(DEST, '04 - Fonte')
for (const d of [DEST, COMP, FONTE]) fs.mkdirSync(d, { recursive: true })

fs.copyFileSync(path.join(OUT, 'Controle Financeiro Fazenda.xlsx'), path.join(DEST, '01 - Controle Financeiro Fazenda.xlsx'))
fs.copyFileSync(path.join(OUT, 'Relatório Financeiro Fazenda.pdf'), path.join(DEST, `02 - Relatório Financeiro Fazenda (${dma(D.periodo.de)} a ${dma(D.periodo.ate)}).pdf`))

let n = 0, faltam = []
for (const [orig, novo] of Object.entries(D.arquivos)) {
  const src = path.join(EXPORT_DIR, orig)
  if (!fs.existsSync(src)) { faltam.push(orig); continue }
  fs.copyFileSync(src, path.join(COMP, novo)); n++
}
// anexos do export que não estão no mapa (não deveria haver) — copia com o nome original
for (const f of fs.readdirSync(EXPORT_DIR)) {
  if (/\.(jpg|jpeg|png|opus|pdf|mp4)$/i.test(f) && !D.arquivos[f]) { fs.copyFileSync(path.join(EXPORT_DIR, f), path.join(COMP, f)); console.log('sem nome no mapa, copiado como está:', f) }
}
for (const f of fs.readdirSync(EXPORT_DIR)) {
  if (/\.txt$/i.test(f)) fs.copyFileSync(path.join(EXPORT_DIR, f), path.join(FONTE, f))
}
if (ZIP && fs.existsSync(ZIP)) fs.copyFileSync(ZIP, path.join(FONTE, path.basename(ZIP)))

console.log(`pasta: ${DEST}`)
console.log(`comprovantes copiados: ${n}` + (faltam.length ? ` | faltando no export: ${faltam.join(', ')}` : ''))
for (const f of fs.readdirSync(DEST)) console.log(' ', f)
