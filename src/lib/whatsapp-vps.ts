/**
 * Acesso ao servidor Baileys (VPS). Centraliza a URL e o token de acesso.
 *
 * O servidor exige o header `x-vps-token` quando `API_TOKEN` está setado nele
 * (porta exposta em IP público). Aqui lemos `WHATSAPP_SERVER_TOKEN` e injetamos
 * o header em todas as chamadas. Sem token configurado, os headers ficam vazios
 * (compat com setups antigos por túnel).
 */

export const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'

const SERVER_TOKEN = process.env.WHATSAPP_SERVER_TOKEN || ''

export function vpsHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
        ...(SERVER_TOKEN ? { 'x-vps-token': SERVER_TOKEN } : {}),
        ...(extra ?? {}),
    }
}
