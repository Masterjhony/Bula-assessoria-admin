/**
 * Submetedor EM LOTE da biblioteca de templates-molde da Bula.
 *
 * Filosofia: poucos templates genéricos com variáveis ({{1}}, {{2}}…) que cobrem
 * uma ampla gama de situações — em vez de submeter um template por evento. Os
 * molds de MÍDIA (header IMAGE/VIDEO/DOCUMENT) tornam o CRIATIVO uma variável:
 * o arquivo enviado na criação é só um EXEMPLO de formato para o revisor; no
 * disparo você anexa a arte/vídeo da campanha da vez — um template aprovado
 * serve para todas as campanhas.
 *
 * Regras da Meta embutidas no desenho (p/ aprovar no menor tempo possível):
 *   - HEADER TEXT sem emoji/asterisco/quebra de linha/variável
 *   - BODY não começa nem termina com variável; sem variáveis adjacentes;
 *     toda variável tem exemplo realista (example.body_text)
 *   - Header de mídia leva um arquivo-exemplo REAL (header_handle via Resumable
 *     Upload) — exemplo genérico/ruim é motivo clássico de reprovação lenta
 *   - `allow_category_change: true` em tudo: se a Meta discordar da categoria,
 *     ela RECLASSIFICA em vez de REJEITAR (rejeição = reescrever e esperar de novo)
 *   - UTILITY para mensagem transacional (aprovação quase instantânea/automática);
 *     MARKETING para promo/convite
 *   - FOOTER curto com a marca; textos distintos entre molds (dois templates
 *     "iguais demais" caem em revisão manual por duplicidade)
 *
 *   node scripts/submit-templates-biblioteca.mjs           # dry-run (mostra prévias)
 *   node scripts/submit-templates-biblioteca.mjs --submit  # envia todos à Meta
 *   node scripts/submit-templates-biblioteca.mjs --submit --only bula_oportunidade
 *   node scripts/submit-templates-biblioteca.mjs --submit --video "F:/outro.mp4"
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
function loadEnv(file) {
  const p = path.join(ROOT, file)
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
}
loadEnv('.env.local')

const args = process.argv.slice(2)
const SUBMIT = args.includes('--submit')
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1] : null })()
const VIDEO_PATH = (() => { const i = args.indexOf('--video'); return i >= 0 ? args[i + 1] : 'F:/videooo.mp4' })()
const IMAGE_PATH = (() => { const i = args.indexOf('--image'); return i >= 0 ? args[i + 1] : path.join(ROOT, 'public/agenda-oficial-bula-whatsapp-v2.jpg') })()

const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const WABA = process.env.WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID || process.env.WABA_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
const APP_ID = process.env.META_APP_ID || process.env.WHATSAPP_CLOUD_APP_ID || '2406166973231233'
if (!WABA || !TOKEN) { console.error('faltam WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID / _ACCESS_TOKEN'); process.exit(1) }

const LANG = 'pt_BR'
const FOOTER = 'Bula Assessoria'

// ── biblioteca de molds ──────────────────────────────────────────────────────
// vars: exemplos em ORDEM ({{1}}, {{2}}, …) — viram example.body_text.
// media: 'IMAGE' | 'VIDEO' → header de mídia (o criativo é variável no disparo).
// header (texto) e media são mutuamente exclusivos.
const TEMPLATES = [
  // ── molds já aprovados (ficam aqui como registro; dup = pulado) ──────────
  {
    name: 'bula_leilao_convite',
    category: 'MARKETING',
    header: 'Convite para o próximo leilão',
    body: `Olá, {{1}}! 🐂

Vai acontecer o *{{2}}* em *{{3}}*.

Selecionamos touros e matrizes de alto padrão, com 30x no boleto e frete grátis.

Quer que eu te envie o catálogo e garanta o seu acesso?`,
    vars: ['João', 'Leilão de Touros e Matrizes Naviraí', '12/07 às 20h'],
  },
  {
    name: 'bula_leilao_ultima_chance',
    category: 'MARKETING',
    header: 'Últimos lotes no ar',
    body: `Olá, {{1}}! ⏰

Estão no ar os *últimos lotes* do *{{2}}*.

Se você ficou de olho em algum animal, agora é a hora — 30x no boleto e frete grátis.

Entra que eu te ajudo com o lance.`,
    vars: ['João', 'Leilão de Touros e Matrizes Naviraí'],
  },
  {
    name: 'bula_oportunidade',
    category: 'MARKETING',
    header: 'Oportunidade selecionada',
    body: `Olá, {{1}}! 🐂

Apareceu uma oportunidade em *{{2}}*: {{3}}.

Quer que eu te passe os detalhes, valores e condições?`,
    vars: ['João', 'touros Nelore P.O', '3 reprodutores avaliados, com pronta entrega'],
  },
  {
    name: 'bula_pos_leilao',
    category: 'UTILITY',
    header: 'Obrigado por acompanhar',
    body: `Olá, {{1}}!

Obrigado por acompanhar o *{{2}}*.

Arrematou algum lote ou quer que eu veja uma condição especial no particular? Posso te ajudar por aqui.`,
    vars: ['João', 'Leilão de Touros e Matrizes Naviraí'],
  },

  // ── molds novos: texto (aprovação mais rápida) ───────────────────────────
  {
    name: 'bula_reengajamento',
    category: 'MARKETING',
    header: 'Novidades para você',
    body: `Olá, {{1}}! 👋

Faz um tempo que a gente conversou por aqui. Nesse meio tempo apareceu coisa boa: {{2}}.

Se fizer sentido pro seu momento, me responde por aqui que eu te passo os detalhes sem compromisso.`,
    vars: ['João', 'novos leilões com touros PO avaliados pela nossa equipe e parcelamento em 30x'],
  },
  {
    name: 'bula_agenda_leiloes',
    category: 'MARKETING',
    header: 'Agenda de leilões confirmada',
    body: `Olá, {{1}}! 🗓️

Nossa agenda de {{2}} está confirmada: {{3}}.

Todos com assessoria da Bula, sem custo pra você. Quer que eu te mande os detalhes de algum deles?`,
    vars: ['João', 'julho', 'Leilão Nelore Kriz (12/07, 20h) e Leilão Naviraí (16/07, 20h)'],
  },
  {
    name: 'bula_cadastro_status',
    category: 'UTILITY',
    header: 'Atualização do seu cadastro',
    body: `Olá, {{1}}!

Atualização sobre a sua habilitação: {{2}}.

Próximo passo: {{3}}. Qualquer dúvida, é só responder por aqui.`,
    vars: ['João', 'seu cadastro foi enviado para análise das leiloeiras parceiras', 'aguardar a confirmação — eu te aviso por aqui assim que sair'],
  },

  // ── molds novos: MÍDIA (o criativo é variável — 1 template, N campanhas) ─
  {
    name: 'bula_divulgacao_imagem',
    category: 'MARKETING',
    media: 'IMAGE',
    body: `Olá, {{1}}! 🐂

{{2}}

Quer os detalhes de valores e condições? Me responde por aqui que eu te passo tudo, sem compromisso.`,
    vars: ['João', 'Selecionamos touros e matrizes de alto padrão pro próximo leilão, com parcelamento em 30x no boleto e frete grátis.'],
  },
  {
    name: 'bula_divulgacao_video',
    category: 'MARKETING',
    media: 'VIDEO',
    body: `Olá, {{1}}! 🎥

Dá uma olhada no vídeo: {{2}}.

Se quiser, te mando as condições e os próximos passos por aqui. É só responder.`,
    vars: ['João', 'os destaques que a nossa equipe apartou pro próximo leilão'],
  },
  {
    name: 'bula_convite_evento_imagem',
    category: 'MARKETING',
    media: 'IMAGE',
    body: `Olá, {{1}}! 🐂

Convite da Bula: *{{2}}*, dia *{{3}}*.

Condição: {{4}}.

Nossa equipe já apartou os destaques. Quer que eu te envie o catálogo e os lotes que valem a pena pro seu perfil?`,
    vars: ['João', 'Leilão de Touros e Matrizes Naviraí', '16/07 às 20h', '30x no boleto e frete grátis'],
  },
  // ── molds da campanha de evento (copy do chefe, 08/07 — generalizada) ────
  // A lista de ofertas virou linha única ({{4}}): variável da Meta NÃO aceita
  // quebra de linha, então bullets específicos deixariam o template mono-uso.
  {
    name: 'bula_convite_evento_ofertas',
    category: 'MARKETING',
    media: 'IMAGE',
    body: `Olá, {{1}}!

Prazer, João Antônio da Bula Assessoria aqui. 🤠

Passando para te convidar para o *{{2}}*, que acontecerá {{3}}!

Ofertas de: {{4}}.

Em até *{{5}} no boleto* e *frete grátis* para todo o Brasil! 🇧🇷

Bora bater um papo?`,
    vars: ['João', '13° Mega Evento EAO Baviera', 'do dia 09 a 12 de Julho', 'sêmen, aspirações, 350 fêmeas PO e 500 touros PO', '40x'],
  },
  {
    name: 'bula_padrao_lote_video',
    category: 'MARKETING',
    media: 'VIDEO',
    body: `Fala, {{1}}! Olha eu aqui mais uma vez… 😁

Passando para te mostrar o padrão de {{2}} que estará disponível {{3}}.

Bora mexer! Aproveite a oportunidade para {{4}}. 🤩`,
    vars: ['João', '500 touros EAO', 'no próximo domingo, 12/07', 'repor seus reprodutores e produzir os melhores bezerros da sua região'],
  },
  {
    name: 'bula_padrao_genetico_video',
    category: 'MARKETING',
    media: 'VIDEO',
    body: `Opa, {{1}}! João da Bula aqui mais uma vez… 😍

Olha o padrão de {{2}} que estará disponível no *{{3}}*!

Chegou a hora de você elevar o padrão genético do seu rebanho 🔥

Em até *{{4}} no boleto* e *frete grátis*!`,
    vars: ['João', 'matrizes PO', 'Mega Evento EAO Baviera', '40x'],
  },
  {
    name: 'bula_leilao_hoje_imagem',
    category: 'MARKETING',
    media: 'IMAGE',
    body: `Olá, {{1}}! ⏰

É hoje: *{{2}}*, às *{{3}}*.

Se você ficou de olho em algum lote, me chama por aqui que eu te ajudo com o cadastro e com o lance — ainda dá tempo.`,
    vars: ['João', 'Leilão de Touros e Matrizes Naviraí', '20h'],
  },
]

// ── Resumable Upload (header_handle do arquivo-exemplo de mídia) ─────────────
const MEDIA_SOURCES = {
  IMAGE: { path: IMAGE_PATH, type: 'image/jpeg' },
  VIDEO: { path: VIDEO_PATH, type: 'video/mp4' },
}
const handleCache = {}

async function uploadHandle(format) {
  if (handleCache[format]) return handleCache[format]
  const src = MEDIA_SOURCES[format]
  if (!src || !fs.existsSync(src.path)) throw new Error(`arquivo-exemplo de ${format} não encontrado: ${src?.path}`)
  const buf = fs.readFileSync(src.path)

  const startUrl = `https://graph.facebook.com/${GRAPH}/${APP_ID}/uploads` +
    `?file_name=${encodeURIComponent(path.basename(src.path))}&file_length=${buf.length}&file_type=${encodeURIComponent(src.type)}&access_token=${encodeURIComponent(TOKEN)}`
  const startRes = await fetch(startUrl, { method: 'POST', signal: AbortSignal.timeout(30000) })
  const startJson = await startRes.json().catch(() => null)
  if (!startRes.ok || !startJson?.id) throw new Error(`falha ao iniciar upload: ${startJson?.error?.message || `HTTP ${startRes.status}`}`)

  const upRes = await fetch(`https://graph.facebook.com/${GRAPH}/${startJson.id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${TOKEN}`, file_offset: '0' },
    body: buf,
    signal: AbortSignal.timeout(120000),
  })
  const upJson = await upRes.json().catch(() => null)
  if (!upRes.ok || !upJson?.h) throw new Error(`falha ao subir bytes: ${upJson?.error?.message || `HTTP ${upRes.status}`}`)
  handleCache[format] = upJson.h
  return upJson.h
}

async function buildPayload(t) {
  const nVars = (t.body.match(/\{\{\s*\d+\s*\}\}/g) || []).length
  const components = []
  if (t.media) {
    const handle = await uploadHandle(t.media)
    components.push({ type: 'HEADER', format: t.media, example: { header_handle: [handle] } })
  } else if (t.header) {
    components.push({ type: 'HEADER', format: 'TEXT', text: t.header })
  }
  components.push({ type: 'BODY', text: t.body, ...(nVars > 0 ? { example: { body_text: [t.vars.slice(0, nVars)] } } : {}) })
  components.push({ type: 'FOOTER', text: FOOTER })
  // allow_category_change: a Meta reclassifica em vez de rejeitar — evita o
  // ciclo lento "rejeitado por categoria → reescreve → espera de novo".
  return { name: t.name, category: t.category, language: LANG, allow_category_change: true, components }
}

function preview(t) {
  let b = t.body
  t.vars.forEach((v, i) => { b = b.replace(new RegExp(`\\{\\{\\s*${i + 1}\\s*\\}\\}`, 'g'), v) })
  const head = t.media ? `[${t.media === 'VIDEO' ? '🎬 vídeo' : '🖼 imagem'} — criativo anexado no disparo]` : `*${t.header}*`
  return `${head}\n\n${b}\n\n_${FOOTER}_`
}

async function submitOne(t) {
  const payload = await buildPayload(t)
  const res = await fetch(`https://graph.facebook.com/${GRAPH}/${WABA}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  })
  const json = await res.json().catch(() => null)
  if (res.ok) return { ok: true, id: json?.id, status: json?.status || 'PENDING', category: json?.category }
  const msg = json?.error?.message || `HTTP ${res.status}`
  const dup = /already exists/i.test(msg) || json?.error?.error_subcode === 2388023
  return { ok: false, dup, error: msg, detail: json?.error?.error_user_msg }
}

/** Nomes que já existem na WABA (qualquer status) — para pular sem tentar. */
async function fetchExistingNames() {
  const names = new Set()
  let url = `https://graph.facebook.com/${GRAPH}/${WABA}/message_templates?fields=name&limit=100`
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(30000) })
    const json = await res.json().catch(() => null)
    if (!res.ok) break
    for (const t of json?.data ?? []) names.add(t.name)
    url = json?.paging?.next || null
  }
  return names
}

async function main() {
  const list = ONLY ? TEMPLATES.filter(t => t.name === ONLY) : TEMPLATES
  if (list.length === 0) { console.error(`Nenhum template chamado "${ONLY}".`); process.exit(1) }

  const existing = SUBMIT ? await fetchExistingNames() : new Set()
  console.log(`${SUBMIT ? 'SUBMETENDO' : 'DRY-RUN'} — ${list.length} template(s) · idioma ${LANG}\n`)
  for (const t of list) {
    const nVars = (t.body.match(/\{\{\s*\d+\s*\}\}/g) || []).length
    console.log(`■ ${t.name}  (${t.category}${t.media ? ` · header ${t.media}` : ''})  ${nVars} variável(is)`)
    console.log('─'.repeat(60))
    console.log(preview(t))
    console.log('─'.repeat(60))
    if (SUBMIT) {
      if (existing.has(t.name)) { console.log('  • já existe na WABA (pulado)\n'); continue }
      try {
        const r = await submitOne(t)
        if (r.ok) console.log(`  ✓ submetido — id=${r.id}  status=${r.status}${r.category && r.category !== t.category ? `  (reclassificado: ${r.category})` : ''}`)
        else if (r.dup) console.log(`  • já existe na Meta (pulado)`)
        else console.log(`  ✗ falhou: ${r.error}${r.detail ? `\n    detalhe: ${r.detail}` : ''}`)
      } catch (e) {
        console.log(`  ✗ falhou: ${e.message}`)
      }
    }
    console.log('')
  }
  if (!SUBMIT) console.log('[DRY-RUN] Nada enviado. Rode com --submit para enviar todos à Meta.')
}

main().catch(e => { console.error(e); process.exit(1) })
