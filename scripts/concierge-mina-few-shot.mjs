/**
 * MINERADOR de EXEMPLOS DE OURO (few-shot) para o concierge.
 *
 * Lê as conversas 1:1 reais do atendimento (base do SDR), acha os momentos em
 * que o ASSESSOR HUMANO contornou bem uma objeção / dúvida / desconfiança e o
 * lead reagiu bem, e extrai esses pares (situação do lead → resposta que
 * funcionou) já limpos de PII e categorizados por tema + segmento.
 *
 * Filosofia (igual ao concierge-aprendizados): a IA PROPÕE, um humano APLICA.
 *   Saída 1: outputs/concierge-few-shot-YYYY-MM-DD.md   → pra revisão humana
 *   Saída 2: outputs/concierge-few-shot-YYYY-MM-DD.json → curável e carregável
 *            (scripts/concierge-few-shot-load.mjs grava na config do concierge).
 *
 *   node scripts/concierge-mina-few-shot.mjs                 # padrão
 *   node scripts/concierge-mina-few-shot.mjs --max-threads 120
 *   node scripts/concierge-mina-few-shot.mjs --dias 90       # janela (0 = tudo)
 *   node scripts/concierge-mina-few-shot.mjs --top 40        # nº final de exemplos
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ── env (auto-contido) ───────────────────────────────────────────────────────
const ROOT = process.cwd()
for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (!m) continue
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        if (!(m[1] in process.env)) process.env[m[1]] = v
    }
}

const args = process.argv.slice(2)
const numArg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : def }
const DIAS = numArg('--dias', 0)            // 0 = toda a base
const MAX_THREADS = numArg('--max-threads', 150)
const TOP = numArg('--top', 40)
const MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'

const KEY = process.env.OPENROUTER_API_KEY
if (!KEY) { console.error('OPENROUTER_API_KEY ausente'); process.exit(1) }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ── 1. Coleta mensagens 1:1 (sem grupos) ─────────────────────────────────────
const BLAST_ORIGINS = new Set([
    'reengajamento-limbo', 'backlog-frio', 'disparo-ie-frio', 'crm-sheet-import',
    'concierge-catchup', 'baileys-mirror', 'teste-manual',
])
/** Uma outbound é HUMANA quando um assessor digitou (não bot, não template, não disparo). */
function isHumana(m) {
    if (m.direction !== 'outbound') return false
    if (m.intent === 'crm_reply') return true          // resposta manual no inbox = ouro
    if (m.bot_step || m.template_id || m.campaign_id) return false
    if (m.intent === 'bot' || m.intent === 'campaign') return false
    if (BLAST_ORIGINS.has(m.origin)) return false
    return true
}
const NEGOCIO = /gado|leil[aã]o|leilo|touro|matriz|cabe[çc]a|nelore|arroba|assessoria|assessor|cadastr|habilita|remate|bezerr|s[êe]men|gen[ée]tica|rebanho|fazenda|invernada|boi|vaca|novilh|pecu[aá]ria|le[ií]lo/i

console.log(`Coletando conversas 1:1${DIAS ? ` (últimos ${DIAS} dias)` : ' (base inteira)'}…`)
const cols = 'phone,name,lead_id,direction,body,origin,channel,intent,bot_step,template_id,campaign_id,created_at'
const since = DIAS ? new Date(Date.now() - DIAS * 86400000).toISOString() : null
const rows = []
let from = 0
while (true) {
    let q = sb.from('whatsapp_messages').select(cols)
        .not('phone', 'like', '%@g.us%')
        .order('created_at', { ascending: true })
        .range(from, from + 999)
    if (since) q = q.gte('created_at', since)
    const { data, error } = await q
    if (error) { console.error('Erro Supabase:', error.message); process.exit(1) }
    rows.push(...data)
    if (data.length < 1000) break
    from += 1000
}
console.log(`  ${rows.length} mensagens 1:1 carregadas.`)

// ── 2. Agrupa por telefone e qualifica threads ───────────────────────────────
const byPhone = new Map()
for (const r of rows) {
    if (!byPhone.has(r.phone)) byPhone.set(r.phone, [])
    byPhone.get(r.phone).push(r)
}
const threads = []
for (const [phone, ms] of byPhone) {
    if (ms.length < 4) continue
    const temHumana = ms.some(isHumana)
    const temNegocio = ms.some(m => NEGOCIO.test(String(m.body || '')))
    const temLead = ms.some(m => m.lead_id)
    // Só threads que têm resposta humana E cara de venda (lead vinculado OU
    // vocabulário de pecuária). Corta papo interno de dev/testes.
    if (!temHumana || !(temNegocio || temLead)) continue
    const nHumanas = ms.filter(isHumana).length
    threads.push({ phone, name: ms[0].name, ms, nHumanas })
}
// Prioriza as conversas mais ricas em resposta humana (mais chance de ter ouro).
threads.sort((a, b) => b.nHumanas - a.nHumanas)
const usar = threads.slice(0, MAX_THREADS)
console.log(`  ${threads.length} threads qualificadas; minerando as ${usar.length} mais ricas.`)

// ── 3. Renderiza a conversa pro modelo ───────────────────────────────────────
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 400)
function render(thread) {
    const linhas = []
    for (const m of thread.ms) {
        const body = clean(m.body)
        if (!body) continue
        const who = m.direction === 'inbound' ? 'LEAD' : (isHumana(m) ? 'ASSESSOR' : 'BOT/DISPARO')
        linhas.push(`${who}: ${body}`)
    }
    return linhas.slice(0, 60).join('\n')  // cap por conversa
}

// ── 4. Extração por lote via OpenRouter ──────────────────────────────────────
const SYSTEM = `Você é um analista de vendas da Bula Assessoria (assessoria pecuária que ajuda produtores a comprar gado em leilão, sem custo pro comprador). Recebe transcrições de conversas reais de WhatsApp entre LEAD (produtor) e ASSESSOR (SDR humano da Bula). Também aparecem linhas BOT/DISPARO — IGNORE-AS como fonte de resposta boa (só o ASSESSOR humano vale como ouro).

Sua tarefa: extrair EXEMPLOS DE OURO — momentos em que a resposta do ASSESSOR humano contornou bem uma objeção, dúvida ou desconfiança do lead, de um jeito que dá pra REUTILIZAR treinando uma IA de atendimento.

Regras rígidas:
- Só extraia quando a resposta do ASSESSOR foi claramente boa (clara, no tom certo, resolveu) E o lead reagiu bem depois (respondeu, avançou, aceitou). Na dúvida, NÃO extraia.
- Descarte conversas que NÃO são de venda de gado/assessoria (papo interno, teste técnico, engano, spam).
- LIMPE a resposta E o gatilho de PII: REMOVA TODO nome próprio de pessoa (inclusive vocativos no meio da frase, ex.: "Sim, Ferdinando, ..." → "Sim, amigo, ..."), telefones, e-mails, CPFs, links e valores de um negócio específico de um cliente. Nenhum nome de gente pode sobrar. A resposta precisa servir pra QUALQUER lead parecido. Pode condensar, mas mantenha as palavras e o jeito do assessor.
- Classifique o tema em UM de: objecao_preco, duvida_como_funciona, desconfianca, parcelamento_frete, prazo_urgencia, interesse_morno, pedir_cadastro, quem_e_a_bula, outro.
- Classifique o segmento do lead em UM de: iniciante (quer começar, sem gado), produtor_comercial (já toca gado, sem P.O.), criador_po (mexe com registrado/P.O.), qualquer (não dá pra saber / serve pra todos).

Responda SÓ com JSON:
{"exemplos":[{"tema":"...","segmento":"...","gatilho":"o que o lead disse, paráfrase curta sem PII","resposta":"a resposta do assessor, limpa e reutilizável","por_que_funciona":"1 linha","qualidade":1-5}]}
Se a conversa não tiver nenhum ouro, devolva {"exemplos":[]}. Não invente nada que não esteja na transcrição.`

const LOTE = 6
const exemplos = []
for (let i = 0; i < usar.length; i += LOTE) {
    const lote = usar.slice(i, i + LOTE)
    const corpo = lote.map((t, j) => `═══ CONVERSA ${i + j + 1} ═══\n${render(t)}`).join('\n\n')
    let ok = false
    for (let tent = 0; tent < 2 && !ok; tent++) {
        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
                body: JSON.stringify({
                    model: MODEL, temperature: 0.2, max_tokens: 3000,
                    response_format: { type: 'json_object' },
                    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: corpo }],
                }),
            })
            if (!res.ok) { console.warn(`  lote ${i / LOTE + 1}: OpenRouter ${res.status}`); continue }
            const data = await res.json()
            const raw = data.choices?.[0]?.message?.content ?? ''
            let parsed
            try { parsed = JSON.parse(raw) } catch {
                const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
                parsed = s >= 0 && e > s ? JSON.parse(raw.slice(s, e + 1)) : { exemplos: [] }
            }
            for (const ex of parsed.exemplos || []) {
                if (!ex?.gatilho || !ex?.resposta) continue
                exemplos.push({
                    tema: String(ex.tema || 'outro').trim(),
                    segmento: String(ex.segmento || 'qualquer').trim(),
                    gatilho: String(ex.gatilho).trim(),
                    resposta: String(ex.resposta).trim(),
                    por_que_funciona: String(ex.por_que_funciona || '').trim(),
                    qualidade: Number(ex.qualidade) || 3,
                })
            }
            ok = true
        } catch (e) {
            console.warn(`  lote ${i / LOTE + 1} tentativa ${tent + 1} falhou:`, e.message)
        }
    }
    console.log(`  lote ${Math.floor(i / LOTE) + 1}/${Math.ceil(usar.length / LOTE)} → ${exemplos.length} exemplos acumulados`)
}

// ── 5. Dedup + ranking ───────────────────────────────────────────────────────
const chave = (e) => (e.tema + '|' + e.resposta.toLowerCase().replace(/\W+/g, '').slice(0, 50))
const vistos = new Set()
const unicos = []
for (const e of exemplos.sort((a, b) => b.qualidade - a.qualidade)) {
    const k = chave(e)
    if (vistos.has(k)) continue
    vistos.add(k)
    unicos.push(e)
}
const finais = unicos.slice(0, TOP)
console.log(`\n${exemplos.length} extraídos → ${unicos.length} únicos → top ${finais.length} selecionados.`)

// ── 6. Saídas ────────────────────────────────────────────────────────────────
const hoje = new Date().toISOString().slice(0, 10)
const outDir = path.join(ROOT, 'outputs')
fs.mkdirSync(outDir, { recursive: true })

// JSON carregável — só os campos que a config do concierge usa.
const jsonPath = path.join(outDir, `concierge-few-shot-${hoje}.json`)
const paraConfig = finais.map(({ tema, segmento, gatilho, resposta }) => ({ tema, segmento, gatilho, resposta }))
fs.writeFileSync(jsonPath, JSON.stringify(paraConfig, null, 2))

// MD legível pra revisão do chefe.
const porTema = {}
for (const e of finais) (porTema[e.tema] = porTema[e.tema] || []).push(e)
let md = `# Exemplos de ouro do SDR — ${hoje}\n\n`
md += `Minerados de ${usar.length} conversas reais. ${finais.length} exemplos (de ${exemplos.length} brutos).\n`
md += `> ⚠ **Revise antes de carregar:** apague o que não presta e confira se sobrou algum NOME de pessoa nas respostas (o modelo às vezes deixa um vocativo) — troque por "amigo"/"você".\n\n`
md += `Carregue com:\n\n`
md += `    node scripts/concierge-few-shot-load.mjs outputs/concierge-few-shot-${hoje}.json\n\n`
for (const [tema, arr] of Object.entries(porTema)) {
    md += `## ${tema} (${arr.length})\n\n`
    for (const e of arr) {
        md += `- **Segmento:** ${e.segmento} · **Qualidade:** ${e.qualidade}/5\n`
        md += `  - **Lead:** ${e.gatilho}\n`
        md += `  - **Resposta:** ${e.resposta}\n`
        if (e.por_que_funciona) md += `  - _Por quê:_ ${e.por_que_funciona}\n`
        md += `\n`
    }
}
const mdPath = path.join(outDir, `concierge-few-shot-${hoje}.md`)
fs.writeFileSync(mdPath, md)

console.log(`\n✔ Revisão:  ${path.relative(ROOT, mdPath)}`)
console.log(`✔ Carregar: node scripts/concierge-few-shot-load.mjs ${path.relative(ROOT, jsonPath)}`)
