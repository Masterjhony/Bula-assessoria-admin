/**
 * Detecção DETERMINÍSTICA de pedido explícito de humano no concierge.
 *
 * O classificador geral (whatsapp-central.classifyMessage) casa HUMAN_WORDS por
 * substring e inclui termos largos ("pessoa", "equipe", "matheus") — falso
 * positivo demais pra conversa livre do concierge ("sou uma pessoa simples",
 * "minha equipe"). Por isso o projeto deixa a IA decidir o handoff. Mas quando a
 * IA ESCORREGA e segue discutindo com quem pediu um humano, o cliente irritado
 * fica preso no bot. Aqui vai uma rede de segurança conservadora: só dispara em
 * pedido inequívoco, pra forçar o handoff sem sequestrar a conversa normal.
 */

function strip(s: string): string {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// Alvo humano inequívoco (evita "pessoa"/"equipe" soltos).
const ALVO = '(humano|atendente|consultor|vendedor|uma pessoa|pessoa de verdade|pessoa fisica|alguem da (equipe|bula)|com alguem)'
// Verbo/pedido que, junto do alvo, caracteriza a intenção.
const REQ = '(falar|conversar|atender|me (passa|passe|transfere|transfira|transfere pra|passa pra)|quero|queria|gostaria|posso|poderia|tem como|da pra|preciso|pode me passar)'

const PADROES: RegExp[] = [
    // Sinais fortes isolados.
    /\b(atendente|atendimento humano|consultor humano|um humano|pessoa de verdade)\b/,
    // Pedido + alvo humano na mesma frase (janela curta).
    new RegExp(`\\b${REQ}\\b[\\s\\S]{0,45}\\b${ALVO}\\b`),
    // Outado como robô ("você é um robô?", "tô falando com um bot?").
    /\b(voce|vc|tu|isso)\s+(e|eh)\s+(um\s+)?(rob[o]|bot|maquina)\b/,
    /\bfalando com (um |uma )?(rob[o]|bot)\b/,
]

/** True só para pedido inequívoco de atendimento humano. */
export function pedeHumanoExplicito(text: string): boolean {
    const s = strip(text)
    if (s.length < 3) return false
    return PADROES.some(re => re.test(s))
}
