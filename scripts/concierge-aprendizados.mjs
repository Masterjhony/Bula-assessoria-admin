/**
 * Loop de APRENDIZADO do concierge — analisa as conversas reais dos últimos N
 * dias e produz um relatório de padrões para calibrar o atendimento:
 *   • perguntas/objeções dos leads que a persona ainda não cobre bem;
 *   • momentos em que o bot repetiu pergunta ou pediu dado que o lead já dera;
 *   • pontos de abandono (lead parou de responder depois de quê?);
 *   • sugestões CONCRETAS de ajuste na persona (pra colar no cockpit ou
 *     incorporar em src/lib/whatsapp-concierge.ts).
 *
 * O aprendizado é supervisionado de propósito: a IA propõe, um humano aplica.
 * (Auto-editar a própria persona em produção seria não-auditável.)
 *
 *   node scripts/concierge-aprendizados.mjs               # últimos 7 dias
 *   node scripts/concierge-aprendizados.mjs --dias 14     # janela maior
 *   node scripts/concierge-aprendizados.mjs --max 40      # mais conversas
 *
 * Saída: outputs/concierge-aprendizados-YYYY-MM-DD.md (+ resumo no console).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

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
const argOf = (name, def) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : def }
const DIAS = argOf('--dias', 7)
const MAX_CONVERSAS = argOf('--max', 30)
const MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'

const KEY = process.env.OPENROUTER_API_KEY
if (!KEY) { console.error('OPENROUTER_API_KEY ausente'); process.exit(1) }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ── 1. Coleta as conversas recentes (inbound + outbound, agrupado por fone) ──
const since = new Date(Date.now() - DIAS * 86400000).toISOString()
const { data: msgs, error } = await sb
    .from('whatsapp_messages')
    .select('phone, body, direction, media_type, created_at')
    .gte('created_at', since)
    .not('phone', 'ilike', '%@g.us%') // grupos ficam de fora
    .order('created_at', { ascending: true })
    .limit(8000)
if (error) { console.error('supabase:', error.message); process.exit(1) }

const byPhone = new Map()
for (const m of msgs ?? []) {
    if (!byPhone.has(m.phone)) byPhone.set(m.phone, [])
    byPhone.get(m.phone).push(m)
}

// Só conversas de verdade: pelo menos 2 falas do lead e 2 do bot/equipe.
const conversas = [...byPhone.entries()]
    .map(([phone, list]) => ({
        phone,
        list,
        nIn: list.filter(m => m.direction === 'inbound').length,
        nOut: list.filter(m => m.direction !== 'inbound').length,
    }))
    .filter(c => c.nIn >= 2 && c.nOut >= 2)
    .sort((a, b) => b.nIn - a.nIn)
    .slice(0, MAX_CONVERSAS)

if (!conversas.length) { console.log(`Nenhuma conversa com ida-e-volta nos últimos ${DIAS} dias.`); process.exit(0) }
console.log(`Analisando ${conversas.length} conversa(s) dos últimos ${DIAS} dias (modelo ${MODEL})…`)

function renderConversa(c, maxMsgs = 40) {
    const tail = c.list.slice(-maxMsgs)
    return tail.map(m => {
        const who = m.direction === 'inbound' ? 'LEAD' : 'BULA'
        const body = (m.body || (m.media_type ? `[${m.media_type}]` : '')).replace(/\s+/g, ' ').slice(0, 400)
        return `${who}: ${body}`
    }).join('\n')
}

// ── 2. Análise por lote (evita estourar contexto) ────────────────────────────
const LOTE = 8
const analises = []
for (let i = 0; i < conversas.length; i += LOTE) {
    const lote = conversas.slice(i, i + LOTE)
    const corpo = lote.map((c, j) => `── CONVERSA ${i + j + 1} (${c.nIn} msgs do lead) ──\n${renderConversa(c)}`).join('\n\n')
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
            model: MODEL, temperature: 0.2, max_tokens: 1800,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: `Você audita conversas do atendimento automático (IA "João") da Bula Assessoria no WhatsApp. O objetivo do bot: confirmar interesse e conduzir o lead até completar dados+documentos de habilitação para compra parcelada em leilão de gado. Analise as conversas e responda SÓ com JSON:
{
 "objecoes_nao_cobertas": ["pergunta/objeção do lead que o bot respondeu mal ou desviou"],
 "dados_repedidos": ["caso em que o bot pediu algo que o lead já tinha informado"],
 "pontos_de_abandono": ["última coisa que o bot disse antes de o lead sumir (padrões)"],
 "boas_praticas_observadas": ["o que funcionou bem e deve ser mantido"],
 "sugestoes_persona": ["ajuste CONCRETO e curto de instrução para a persona"]
}
Seja específico e cite o número da conversa. Liste só o que tem evidência real.`,
                },
                { role: 'user', content: corpo },
            ],
        }),
    })
    if (!res.ok) { console.warn(`lote ${i / LOTE + 1}: OpenRouter ${res.status}`); continue }
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? ''
    try { analises.push(JSON.parse(raw)) } catch {
        const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
        if (s >= 0 && e > s) { try { analises.push(JSON.parse(raw.slice(s, e + 1))) } catch { } }
    }
    console.log(`  lote ${Math.floor(i / LOTE) + 1}/${Math.ceil(conversas.length / LOTE)} ok`)
}

// ── 3. Síntese final ─────────────────────────────────────────────────────────
const sinteseRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
        model: MODEL, temperature: 0.3, max_tokens: 2200,
        messages: [
            {
                role: 'system',
                content: 'Consolide as análises parciais (JSON) num relatório em markdown pt-BR, direto e acionável, com as seções: "O que está funcionando", "Objeções/perguntas a cobrir", "Dados re-pedidos (corrigir)", "Pontos de abandono", "Sugestões de ajuste na persona (prontas para aplicar)". Dedupe itens repetidos e ordene por frequência/impacto.',
            },
            { role: 'user', content: JSON.stringify(analises) },
        ],
    }),
})
const sinteseData = await sinteseRes.json()
const relatorio = sinteseData.choices?.[0]?.message?.content ?? '(síntese vazia)'

const hoje = new Date().toISOString().slice(0, 10)
const outDir = path.join(ROOT, 'outputs')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, `concierge-aprendizados-${hoje}.md`)
fs.writeFileSync(outPath, `# Aprendizados do concierge — ${hoje}\n\n_Janela: ${DIAS} dias · ${conversas.length} conversas · modelo ${MODEL}_\n\n${relatorio}\n`)

console.log('\n' + relatorio)
console.log(`\n📄 Relatório salvo em: ${outPath}`)
console.log('→ Aplique os ajustes de persona no cockpit (WhatsApp › Atendimento IA) ou em src/lib/whatsapp-concierge.ts.')
