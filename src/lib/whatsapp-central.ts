/**
 * Stub mínimo do whatsapp-central do fórmula. No web-bula a Central
 * WhatsApp não está conectada (Fase 6 entrega só UI + schema; o servidor
 * Baileys será montado depois). Exportamos só normalizePhone e
 * phoneVariants — usados por agendamentos-sync.ts para casar phone do
 * Calendly com leads no banco.
 *
 * Quando a Fase 6 for finalizada e o servidor WhatsApp estiver
 * disponível, pode-se copiar o whatsapp-central completo aqui.
 */

/**
 * Normaliza telefone brasileiro: apenas dígitos, com DDI (55) à frente.
 * Retorna null se não puder normalizar.
 */
export function normalizePhone(input: string): string | null {
  if (!input) return null
  let cleaned = input.replace(/\D/g, '')
  if (!cleaned) return null
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    // já tem DDI
  } else if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = `55${cleaned}`
  }
  if (cleaned.length < 12 || cleaned.length > 13) return null
  return cleaned
}

/** Variantes do mesmo número que podem aparecer salvas no CRM histórico. */
export function phoneVariants(phone: string): string[] {
  const variants = new Set<string>()
  const onlyDigits = phone.replace(/\D/g, '')
  if (!onlyDigits) return []

  variants.add(onlyDigits)
  if (onlyDigits.startsWith('55')) {
    variants.add(onlyDigits.slice(2))
  } else {
    variants.add(`55${onlyDigits}`)
  }

  const woDdi = onlyDigits.startsWith('55') ? onlyDigits.slice(2) : onlyDigits
  if (woDdi.length === 11 && woDdi[2] === '9') {
    const drop9 = woDdi.slice(0, 2) + woDdi.slice(3)
    variants.add(drop9)
    variants.add(`55${drop9}`)
  } else if (woDdi.length === 10) {
    const add9 = woDdi.slice(0, 2) + '9' + woDdi.slice(2)
    variants.add(add9)
    variants.add(`55${add9}`)
  }

  return Array.from(variants)
}
