/**
 * Teste de CENÁRIOS do concierge — roda a persona REAL (extraída de
 * src/lib/whatsapp-concierge.ts) contra as perguntas que mais aparecem no
 * atendimento (preço, como funciona, próximo leilão, desconfiança, sem I.E.,
 * pagamento), com checklist/faixas/agenda montados como em produção (agenda e
 * faixas vêm do banco de verdade).
 *
 * Não toca no CRM: só monta o prompt e chama o OpenRouter, imprimindo a
 * resposta de cada cenário para revisão humana.
 *
 *   node scripts/test-concierge-cenarios.mjs             # todos os cenários
 *   node scripts/test-concierge-cenarios.mjs "pergunta"  # cenário único custom
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

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

const KEY = process.env.OPENROUTER_API_KEY
const MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'
if (!KEY) { console.error('OPENROUTER_API_KEY ausente'); process.exit(1) }

// ── persona REAL, extraída do fonte TS (fica sempre em sincronia) ────────────
const src = fs.readFileSync(path.join(ROOT, 'src/lib/whatsapp-concierge.ts'), 'utf8')
const personaMatch = src.match(/DEFAULT_CONCIERGE_PERSONA = `([\s\S]*?)`\n\n\/\* ─── Saída/)
if (!personaMatch) { console.error('não achei DEFAULT_CONCIERGE_PERSONA no fonte'); process.exit(1) }
const PERSONA = personaMatch[1].replace(/\\`/g, '`')

const schemaMatch = src.match(/RESULT_SCHEMA_INSTRUCTIONS = `([\s\S]*?)`\n\n\/\* ───/)
const SCHEMA = schemaMatch ? schemaMatch[1] : 'Responda SOMENTE com um objeto JSON com os campos reply, stage, updates.'

// ── agenda e faixas REAIS (mesma consulta das libs de produção) ─────────────
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const { data: leiloes } = await sb
    .from('bula_leiloes')
    .select('nome, data, horario, modelo, leiloeira, condicao, frete_gratis')
    .eq('status', 'confirmado')
    .gte('data', hoje)
    .order('data', { ascending: true })
    .limit(6)
const agendaLinhas = (leiloes ?? []).map(l =>
    `- ${l.data} ${l.horario ?? ''} — ${l.nome}${l.modelo ? ` — ${l.modelo}` : ''}${l.condicao ? ` — ${l.condicao}` : ''}`)
const AGENDA = `PRÓXIMOS LEILÕES (agenda oficial — os únicos eventos que você pode citar):
${agendaLinhas.length ? agendaLinhas.join('\n') : '- (nenhum leilão confirmado na agenda neste momento)'}

COMO USAR A AGENDA: se o lead perguntar por próximos leilões/datas, cite 1 a 3 eventos da lista que combinem com o interesse dele e convide. NUNCA invente leilão fora da lista. Agenda pública: bulaassessoria.com/agenda.`

const { data: fechamentos } = await sb.from('bula_leilao_fechamento').select('nome, lances')
const precos = []
for (const f of fechamentos ?? []) {
    for (const l of f.lances ?? []) {
        const a = Number(l.animais) || 0, v = Number(l.vgv) || 0
        if (a > 0 && v > 0) precos.push(v / a)
    }
}
precos.sort((a, b) => a - b)
const mil = n => `R$ ${Math.round(n / 1000)} mil`
const q = p => precos[Math.floor((precos.length - 1) * p)] ?? 0
const FAIXAS = precos.length
    ? `FAIXAS DE PREÇO — referência interna (preço médio por cabeça nos nossos leilões):
- Geral: de ~${mil(q(0))} a ~${mil(q(1))}, mais comum entre ${mil(q(0.25))} e ${mil(q(0.75))} (média ~${mil(q(0.5))}).
COMO USAR: responda só a faixa da categoria, deixe claro que é média e que o valor sai no lance.`
    : ''

const CHECKLIST = `Dados do titular:
  ✔ Nome completo: Carlos Pereira da Silva
  ✔ Telefone: 5567999990000
  ✘ FALTA — CPF
  ✘ FALTA — E-mail
  ✘ FALTA — Endereço do titular (cidade/UF/CEP)
Dados da propriedade:
  ✘ FALTA — Nome da fazenda (entrega)
  ✘ FALTA — Cidade/UF da fazenda
  ✘ FALTA — Inscrição Estadual (ou NIRF)
Documentos:
  ✘ FALTA — Foto da CNH/RG
  ✘ FALTA — Foto segurando o documento
  ✘ FALTA — Comprovante da propriedade / I.E. / NIRF
Progresso: 2/11. Peça SOMENTE itens marcados com ✘, priorizando dados antes de documentos.`

const system = `${PERSONA}

CONTATO HUMANO (use ao fazer handoff por pedido de falar com pessoa): João Antônio (Bula Assessoria) — +55 67 9889-4887

CHECKLIST DE HABILITAÇÃO (estado atual — seu mapa; peça só o que está com ✘):
${CHECKLIST}

${FAIXAS}

${AGENDA}

DADOS QUE JÁ TEMOS DESTE LEAD (use para personalizar e NÃO repetir perguntas):
- Nome: Carlos Pereira da Silva
- Interesse (form): touros

O primeiro nome do lead é "Carlos". USE O NOME COM PARCIMÔNIA.

${SCHEMA}`

const CENARIOS = process.argv[2]
    ? [process.argv[2]]
    : [
        'quanto custa um touro mais ou menos?',
        'como funciona isso aí? nunca comprei em leilão não',
        'quando vai ser o próximo leilão de vocês?',
        'isso não é golpe não? como sei que é sério?',
        'não tenho inscrição estadual, e agora?',
        'posso pagar à vista ou só parcelado?',
        'quem são vocês? o que a Bula faz exatamente?',
    ]

console.log(`Modelo: ${MODEL} · ${CENARIOS.length} cenário(s) · agenda: ${agendaLinhas.length} leilão(ões) · faixas: ${precos.length} cabeças\n`)

for (const pergunta of CENARIOS) {
    const messages = [
        { role: 'system', content: system },
        { role: 'assistant', content: 'Boa, Carlos! Você procura touros pra compra agora, é isso?' },
        { role: 'user', content: pergunta },
    ]
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.45, max_tokens: 700, response_format: { type: 'json_object' } }),
    })
    if (!res.ok) { console.error(`✗ "${pergunta}" — OpenRouter ${res.status}`); continue }
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? ''
    let parsed = null
    try { parsed = JSON.parse(raw) } catch {
        const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
        if (s >= 0 && e > s) { try { parsed = JSON.parse(raw.slice(s, e + 1)) } catch { } }
    }
    console.log(`🧑 LEAD: ${pergunta}`)
    if (!parsed) { console.log(`   ⚠ JSON inválido: ${raw.slice(0, 200)}\n`); continue }
    console.log(`🤖 JOÃO: ${String(parsed.reply || '(vazio)').replace(/\n/g, '\n         ')}`)
    console.log(`   [stage=${parsed.stage} handoff=${!!parsed.handoff} updates=${JSON.stringify(parsed.updates || {})}]`)
    console.log('')
}
