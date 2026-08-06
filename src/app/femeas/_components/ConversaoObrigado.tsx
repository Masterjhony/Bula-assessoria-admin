'use client'

import { useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────
// A CONVERSÃO DA PÁGINA DE OBRIGADO.
//
// Empurra UM evento no dataLayer quando a página de obrigado carrega. É o que
// transforma "o lead chegou aqui" em sinal para Meta e GA4.
//
// ── POR QUE ISTO EXISTE, medido em 06/08 ─────────────────────────────────
// Sem este push, as duas páginas de obrigado eram, para a medição,
// INDISTINGUÍVEIS da própria landing: GA4 recebia só `page_view` e o Meta não
// recebia conversão nenhuma. A navegação hard funcionava, a URL própria
// existia, o veredito do servidor chegava — e nada virava sinal, porque **não
// há nenhum acionador de URL no container** escutando estas páginas. O único
// que existe aponta para `/obrigado-jmp.html`, a landing antiga do JMP.
// Ver `.planning/femeas-perpetuo/TESTE-GTM-2026-08-06.md`.
//
// ── POR QUE FUNCIONA SEM TOCAR NO GTM ────────────────────────────────────
// O container publicado tem um acionador CATCH-ALL: qualquer evento do
// dataLayer que não comece com `gtm.` dispara a tag do GA4 e a tag do Meta. E
// o nome do evento sai de uma tabela de tradução cujo padrão é PASSAGEM
// DIRETA. Então um push de `femeas_mql` chega ao Meta como um evento
// personalizado `femeas_mql`, e ao GA4 como `femeas_mql`. Zero configuração.
//
// ── POR QUE NOME PRÓPRIO E NÃO `generate_lead` ───────────────────────────
// A tabela traduz `generate_lead → Lead`, o evento PADRÃO do Meta. Seria mais
// curto e está ERRADO para esta conta: **o pixel é compartilhado entre os
// funis** (`1539780341180483`), e um `Lead` padrão vindo daqui cairia no mesmo
// balde dos leads do perpétuo de touros — impossível de separar depois no
// Gerenciador de Eventos. É exatamente o que o plano do São Geraldo proíbe no
// Passo 5 (`.planning/leilao-sao-geraldo/GTM.md` §2), e a régua aqui é a mesma.
//
// ── POR QUE SEM `value`/`currency` ───────────────────────────────────────
// Mesma razão: pixel compartilhado. Valor na tag contamina o relatório dos
// outros funis. A separação de valor entre MQL e não-MQL se faz com DOIS
// eventos distintos (é o que este componente entrega) e o valor entra na
// **Conversão Personalizada** do Gerenciador de Eventos, onde fica isolado por
// campanha. Também é a decisão do São Geraldo, §7.3.
//
// ── POR QUE AQUI E NÃO EM `_lib/analytics.ts` ────────────────────────────
// O INV-2 proíbe o `analytics.ts` de tocar o dataLayer, e continua valendo: o
// acionador catch-all dispararia Meta/GA4 a cada micro-evento do funil
// (`femeas_step_reached`, `femeas_validation_failed`…), inflando PageView e
// poluindo a conta. A exceção é justamente esta: **um push, uma vez, só na
// página de obrigado**. Não duplica PageView (que vem do `gtm.dom`) e é o
// desenho que a tabela de tradução do container antecipa.
//
// ⚠️ Não mover este push para dentro do `analytics.ts` "para centralizar". O
// que impede o INV-2 de ser violado é exatamente o fato de ele morar SÓ aqui.
// ─────────────────────────────────────────────────────────────────────────

/** Nome do evento por variante. É por ele que se separa MQL de lead no Meta e no GA4. */
const EVENTO = {
  mql: 'femeas_mql',
  lead: 'femeas_lead',
} as const

export function ConversaoObrigado({ variant }: { variant: 'mql' | 'lead' }) {
  // O StrictMode do React roda o efeito duas vezes em desenvolvimento, e a
  // navegação para cá é um load completo — sem esta trava, a conversão seria
  // contada em dobro no ambiente de teste e ninguém notaria até o relatório.
  const jaDisparou = useRef(false)

  useEffect(() => {
    if (jaDisparou.current) return
    jaDisparou.current = true
    const w = window as unknown as { dataLayer?: unknown[] }
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push({ event: EVENTO[variant] })
  }, [variant])

  return null
}
