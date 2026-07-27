// ─────────────────────────────────────────────────────────────────────────
// Normalização de WhatsApp brasileiro — client E servidor.
//
// BUG QUE ORIGINOU ESTE MÓDULO (27/07/2026, produção):
// a máscara antiga fazia `digits.slice(0, 11)`. Quem digitava o número com o
// código do país — "5531988887777", 13 dígitos, hábito de quem copia do próprio
// WhatsApp — era truncado para "55319888877" e exibido como "(55) 31988-8877".
// O servidor recebia 11 dígitos, validava e GRAVAVA um número inexistente.
// Falha silenciosa: sem erro na tela, sem erro no log, e o lead ficava
// impossível de contatar. Truncar entrada nunca é correção; é perda de dado.
//
// A regra é sensível ao comprimento porque **55 também é DDD válido** (Rio
// Grande do Sul — Santa Maria, Uruguaiana). Cortar todo "55" inicial quebraria
// os números legítimos do RS. Só é código de país quando o comprimento total
// não fecha como número nacional:
//
//   11 dígitos  → DDD + celular de 9  →  "(55) 99999-9999" é RS legítimo, NÃO mexe
//   10 dígitos  → DDD + fixo de 8     →  NÃO mexe
//   13 dígitos  → 55 + DDD + 9        →  tira o 55
//   12 dígitos  → 55 + DDD + 8        →  tira o 55
// ─────────────────────────────────────────────────────────────────────────

/** Só os dígitos, sem máscara, sem "+", sem espaço. */
export function apenasDigitos(valor: string): string {
  return String(valor ?? '').replace(/\D/g, '')
}

/**
 * Devolve os dígitos nacionais (DDD + número), removendo o código do país
 * quando ele está presente. NÃO trunca: comprimento inesperado sai como veio,
 * para a validação decidir e o usuário ver o erro em vez de perder dígito.
 */
export function normalizarWhatsapp(valor: string): string {
  const d = apenasDigitos(valor)
  if ((d.length === 13 || d.length === 12) && d.startsWith('55')) return d.slice(2)
  return d
}

/** Número nacional plausível: DDD (2) + fixo de 8 ou celular de 9. */
export function whatsappValido(valor: string): boolean {
  const d = normalizarWhatsapp(valor)
  if (d.length !== 10 && d.length !== 11) return false
  // DDD brasileiro vai de 11 a 99; nenhum começa com 0.
  if (d[0] === '0') return false
  // Celular de 11 dígitos sempre tem 9 na primeira casa do número.
  if (d.length === 11 && d[2] !== '9') return false
  return true
}

/**
 * Máscara de digitação. Normaliza o código do país ANTES de formatar, então
 * colar "+55 31 98888-7777" resulta em "(31) 98888-7777" — e não em um número
 * mutilado. O limite de 11 é aplicado depois da normalização, nunca antes.
 */
export function aplicarMascaraTelefone(valor: string): string {
  const d = normalizarWhatsapp(valor).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
