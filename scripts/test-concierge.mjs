/**
 * Smoke test do concierge de WhatsApp (IA).
 *
 * Não toca no banco: simula a chamada que o `runConcierge` faz ao OpenRouter
 * com uma persona condensada + um diálogo de exemplo, e imprime o JSON que o
 * modelo devolve (próxima fala + updates de CRM). Serve para validar a
 * OPENROUTER_API_KEY, o modelo e o formato estruturado antes de ligar em prod.
 *
 * Uso:  node scripts/test-concierge.mjs
 *       node scripts/test-concierge.mjs "tenho 200 vacas e quero 5 touros angus pra esse mês"
 */

import fs from 'node:fs'

function loadEnvLocal() {
    const out = {}
    for (const f of ['.env.local', '.env']) {
        if (!fs.existsSync(f)) continue
        for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
            if (!m) continue
            let v = m[2].trim()
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
            if (!(m[1] in out)) out[m[1]] = v
        }
    }
    return out
}

const env = loadEnvLocal()
const KEY = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
const MODEL = env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'

if (!KEY) {
    console.error('\n❌ OPENROUTER_API_KEY ausente em .env.local.')
    console.error('   1) Crie uma chave em https://openrouter.ai/keys')
    console.error('   2) Adicione a linha:  OPENROUTER_API_KEY=sk-or-...')
    console.error('   3) Rode de novo:      node scripts/test-concierge.mjs\n')
    process.exit(1)
}

const PERSONA = `Você é o "João", consultor da Bula Assessoria, no WhatsApp. A Bula habilita produtores a comprar gado em LEILÃO de forma PARCELADA. Missão: (1) confirmar o interesse e (2) levar o lead a enviar dados+documentos de habilitação.
ESTILO: mensagens CURTAS (2-4 linhas), objetivas, sem textão, uma ação por vez. NÃO peça o que já temos. Registre interesse só se declarado.
HANDOFF: se pedir pra falar com humano, marque handoff=true e passe o CONTATO HUMANO: João Antônio (Bula Assessoria) — +55 67 9889-4887.
DOCS (peça só o que falta, em 1 mensagem): titular (nome, CPF, telefone, e-mail, endereço); propriedade (fazenda, cidade/UF, I.E., roteiro, telefone+responsável); documentos (CNH/RG + foto segurando, comprovação da propriedade, I.E./NIRF).
[Persona fiel vive em src/lib/whatsapp-concierge.ts — este é só um smoke test.]`

const SCHEMA = `Responda SOMENTE com um objeto JSON válido neste formato:
{"reply":"próxima mensagem natural pt-BR","stage":"diagnostico|interesse|pre_qualificacao|documentos_solicitados|documentos_parciais|em_analise|pendencia|nao_apto|apto","fast_track":true|false,"request_documents":true|false,"documents_received":true|false,"handoff":true|false,"optout":true|false,"internal_note":"anotação curta","updates":{"interesse":"touros|matrizes|embrioes|semen|leiloes|null","urgencia_compra":"agora|proximos_30_dias|proximos_leiloes|sem_prazo|null","experiencia_leilao":"ja_compra|ja_tentou|nunca_comprou|null","ie_status":"tem|nao_tem|pendente_envio|em_validacao|null"}}`

const leadMsg = process.argv[2] || 'tenho dois mas vou desfazer de 1, ele produz muita femea'

const system = `${PERSONA}

DADOS QUE JÁ TEMOS DESTE LEAD:
- Nome: Fábio
- Estado/UF: GO
- Interesse (form): touros

${SCHEMA}`

const messages = [
    { role: 'system', content: system },
    { role: 'assistant', content: 'Olá, Fábio! Tudo bem? Aqui é o João, da Bula Assessoria. Vi seu interesse em genética e queria entender melhor seu momento. Hoje você já trabalha com gado P.O. ou está buscando entrar/melhorar nessa área?' },
    { role: 'user', content: leadMsg },
]

console.log(`\n→ Modelo: ${MODEL}`)
console.log(`→ Lead disse: "${leadMsg}"\n`)

const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
        'HTTP-Referer': 'https://bulaassessoria.com',
        'X-Title': 'Bula Assessoria CRM',
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.6, max_tokens: 700, response_format: { type: 'json_object' } }),
})

if (!res.ok) {
    console.error(`❌ OpenRouter ${res.status}: ${(await res.text()).slice(0, 400)}`)
    process.exit(1)
}

const data = await res.json()
const raw = data.choices?.[0]?.message?.content ?? ''
let parsed = null
try { parsed = JSON.parse(raw) } catch {
    const s = raw.indexOf('{'); const e = raw.lastIndexOf('}')
    if (s >= 0 && e > s) { try { parsed = JSON.parse(raw.slice(s, e + 1)) } catch {} }
}

if (!parsed) {
    console.error('⚠️  Não foi possível parsear JSON. Resposta crua:\n', raw)
    process.exit(1)
}

console.log('💬 Resposta ao lead:\n   ' + String(parsed.reply || '(vazia)').replace(/\n/g, '\n   '))
console.log('\n🧭 stage:', parsed.stage, '| fast_track:', parsed.fast_track, '| pedir docs:', parsed.request_documents, '| handoff:', parsed.handoff)
console.log('📝 nota interna:', parsed.internal_note || '—')
console.log('🗂️  updates:', JSON.stringify(parsed.updates || {}, null, 0))
console.log('\n✅ OpenRouter OK — chave e modelo funcionando, JSON estruturado válido.\n')
