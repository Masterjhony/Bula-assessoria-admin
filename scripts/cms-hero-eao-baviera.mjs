// Sincroniza o HERO da landing (tabela jmp_landing_content, linha id='default')
// com a copy do 13º Mega Evento EAO Baviera.
//
// Por que existe: o hero exibido em produção vem do banco (editado pelo painel
// adminjmp). O DEFAULT_CONTENT do código é só fallback — enquanto o banco tiver
// a copy antiga, o deploy não muda nada na tela.
//
// Só toca em `data.hero`. whatsappGroupUrl, blocks e welcomeEmail ficam como
// estão. Salva snapshot do registro inteiro antes de escrever.
//
//   node scripts/cms-hero-eao-baviera.mjs            (dry-run: mostra o diff)
//   node scripts/cms-hero-eao-baviera.mjs --apply    (grava)
//   node scripts/cms-hero-eao-baviera.mjs --rollback outputs/<snapshot>.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import pg from 'pg'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] }))

const APPLY = process.argv.includes('--apply')
const rollbackIdx = process.argv.indexOf('--rollback')
const ROLLBACK_FILE = rollbackIdx >= 0 ? process.argv[rollbackIdx + 1] : null

// Espelho exato de DEFAULT_CONTENT.hero em jmp-landing/src/content.ts.
const HERO = {
  // Poster do vídeo de fundo (quadro de 2s do vídeo da /agenda, gerado pelo
  // Cloudinary). O <video> é constante no código (jmp-landing/src/leiloes.ts);
  // aqui vai só a imagem estática, que é o LCP e o que o mobile /
  // prefers-reduced-motion enxergam.
  backgroundUrl: 'https://res.cloudinary.com/dny0ibgbn/video/upload/so_2,w_1280,q_auto/v1780252444/video_de_fundo_jmvezn.webp',
  badge: 'ASSESSORIA GRATUITA · 10 A 12 DE JULHO',
  headline: 'Compre bem no\nMega Baviera com\na Bula ao seu lado.',
  valueProp: 'São 3 leilões em 3 dias. A equipe de assessores da Bula te ajuda a entender a genética, escolher os animais certos e dar o lance certo.',
  valuePropStrong: 'Assessoria gratuita. Sem compromisso.',
  benefitsTitle: 'Uma Equipe de\nAssessores do Seu\nLado no Mega Baviera',
  benefits: [
    { text: 'Assessoria de compra 100% gratuita', strong: true },
    { text: 'Equipe de assessores com você no pregão' },
    { text: 'Leitura da genética e dos números do catálogo' },
    { text: 'Ajuda pra escolher os animais certos pro seu rebanho' },
    { text: 'Apoio na habilitação e no pós-leilão', strong: true },
  ],
  stats: [
    { value: 'GRÁTIS', label: 'ASSESSORIA DE COMPRA' },
    { value: '3', label: 'LEILÕES · 10 A 12 JUL' },
  ],
  locationLine1: 'Itagibá / BA',
  locationLine2: 'Fazenda Baviera',
}

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()

const { rows } = await db.query(`select id, data from jmp_landing_content where id = 'default'`)
if (!rows.length) { console.error('linha id=default não existe'); await db.end(); process.exit(1) }
const current = rows[0].data

if (ROLLBACK_FILE) {
  const snap = JSON.parse(readFileSync(ROLLBACK_FILE, 'utf-8'))
  await db.query(`update jmp_landing_content set data = $1 where id = 'default'`, [snap])
  console.log(`ROLLBACK aplicado a partir de ${ROLLBACK_FILE}`)
  await db.end()
  process.exit(0)
}

console.log('=== HERO ATUAL (no ar) ===')
for (const k of ['badge', 'headline', 'valueProp', 'benefitsTitle', 'backgroundUrl', 'locationLine1', 'locationLine2']) {
  console.log(`  ${k}: ${JSON.stringify(current.hero?.[k])}`)
}
console.log(`  stats: ${JSON.stringify(current.hero?.stats)}`)
console.log(`  benefits: ${(current.hero?.benefits ?? []).length} itens`)

console.log('\n=== HERO NOVO (Mega EAO Baviera) ===')
for (const k of ['badge', 'headline', 'valueProp', 'benefitsTitle', 'backgroundUrl', 'locationLine1', 'locationLine2']) {
  console.log(`  ${k}: ${JSON.stringify(HERO[k])}`)
}
console.log(`  stats: ${JSON.stringify(HERO.stats)}`)
console.log(`  benefits: ${HERO.benefits.length} itens`)

console.log('\n=== PRESERVADO (não tocamos) ===')
console.log('  whatsappGroupUrl:', JSON.stringify(current.whatsappGroupUrl))
console.log('  blocks:', (current.blocks ?? []).length, 'blocos')
console.log('  welcomeEmail.enabled:', current.welcomeEmail?.enabled)

if (!APPLY) {
  console.log('\n(dry-run) nada foi gravado. rode com --apply para aplicar.')
  await db.end()
  process.exit(0)
}

mkdirSync('outputs', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const snapPath = `outputs/jmp_landing_content-backup-${stamp}.json`
writeFileSync(snapPath, JSON.stringify(current, null, 2), 'utf-8')
console.log(`\nsnapshot salvo: ${snapPath}`)

const next = { ...current, hero: HERO }
await db.query(`update jmp_landing_content set data = $1 where id = 'default'`, [next])
console.log('hero atualizado em jmp_landing_content (id=default)')
console.log(`rollback:  node scripts/cms-hero-eao-baviera.mjs --rollback ${snapPath}`)

await db.end()
