// ─────────────────────────────────────────────────────────────────────────
// Copy do FLUXO DE CONVERSÃO — formulário e páginas de obrigado.
//
// Escopo deliberadamente estreito: só as strings que os componentes de
// conversão precisam. A copy das SEÇÕES da landing (hero, oferta, lotes) é de
// outro dono e mora em outro arquivo — este aqui não cresce para isso.
//
// Regras seguidas:
//  · Nenhum claim numérico novo. O que é factual (data, hora) vem de EVENTO.
//  · Nada de "frete grátis" nem promessa de lote: o catálogo tem região sob
//    consulta e região sem entrega (BRIEF §4).
//  · [REVISAR-COPY] marca o que o dono da copy comercial deve reescrever com
//    a voz da campanha. O texto atual é funcional e factual, não vendedor.
// ─────────────────────────────────────────────────────────────────────────
import { EVENTO } from './evento'

export const form = {
  // [REVISAR-COPY]
  title: 'Receba o catálogo e fale com um assessor',
  lead: `Leilão ${EVENTO.dataExtenso}, ${EVENTO.diaSemana}, às ${EVENTO.hora}. Preencha e um assessor da Bula entra em contato pelo WhatsApp.`,
  whatsappHint: 'É por onde o assessor vai falar com você.',
  consent: 'Autorizo a Bula Assessoria a entrar em contato comigo pelo WhatsApp.',
  submit: 'Quero falar com um assessor',
  submitting: 'Enviando…',
  // Só aparece se a navegação para a página de obrigado não acontecer.
  successTitle: 'Cadastro confirmado',
  successLead: 'Recebemos seus dados. Um assessor da Bula vai falar com você pelo WhatsApp.',
} as const

/**
 * Convite para o grupo de WhatsApp do leilão.
 *
 * Só existe DEPOIS da conversão. Na landing ele seria uma rota de fuga: o
 * visitante entraria no grupo, o lead não seria capturado, o assessor não
 * teria com quem falar e a campanha não teria o que otimizar. Aqui ele só
 * agrega — retém quem já é lead até o dia do leilão.
 *
 * O texto é o mesmo nas duas variantes: o grupo é um só, e o que muda entre
 * MQL e lead é quem liga primeiro, não a que grupo a pessoa pertence.
 */
export const grupo = {
  eyebrow: 'Enquanto o assessor não chama',
  cta: 'Entrar no grupo do leilão',
  nota: 'Avisos de lote, transmissão e edital saem por lá primeiro.',
} as const

// Duas variantes porque as URLs de obrigado são separadas (MQL vs. lead) — é o
// que permite meta de conversão por URL e otimização por valor na mídia.
export const obrigado = {
  mql: {
    eyebrow: 'Cadastro confirmado',
    // [REVISAR-COPY]
    title: 'Um assessor vai te chamar',
    lead: `Seus dados chegaram. Um assessor da Bula entra em contato pelo WhatsApp para te acompanhar até o leilão de ${EVENTO.dataExtenso}.`,
    note: 'Deixe o WhatsApp por perto — o contato costuma ser no mesmo dia útil.',
  },
  lead: {
    eyebrow: 'Cadastro confirmado',
    // [REVISAR-COPY]
    title: 'Recebemos seu cadastro',
    lead: `Seus dados chegaram. A equipe da Bula entra em contato pelo WhatsApp com as informações do leilão de ${EVENTO.dataExtenso}.`,
    note: 'Deixe o WhatsApp por perto — o contato costuma ser no mesmo dia útil.',
  },
} as const
