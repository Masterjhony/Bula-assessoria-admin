// ─────────────────────────────────────────────────────────────────────────
// Constantes do evento — Leilão Touros São Geraldo e 7P.
//
// FONTE ÚNICA para tudo que é factual sobre o leilão. Nenhum componente deve
// hardcodar data, hora ou condição comercial: tudo sai daqui.
//
// Todos os valores abaixo foram EXTRAÍDOS do catálogo oficial em PDF
// (ver .planning/leilao-sao-geraldo/BRIEF.md §2). Não inventar, não arredondar,
// não "melhorar" número. Se o catálogo não diz, não entra.
// ─────────────────────────────────────────────────────────────────────────

export const EVENTO = {
  nome: 'Leilão Touros São Geraldo e 7P',
  // Grupo de WhatsApp do leilão (link do cliente, 27/07).
  //
  // ONDE ISTO PODE APARECER: só DEPOIS da conversão — páginas de obrigado.
  // NUNCA na landing como CTA. Um link de grupo antes do formulário é uma rota
  // de fuga: o visitante entra no grupo, o lead não é capturado, o assessor não
  // tem com quem falar e a campanha não tem o que otimizar. Post-conversão ele
  // só agrega (retém quem já é lead até o dia do leilão).
  grupoWhatsapp: 'https://chat.whatsapp.com/J6qbr9dlZ3L1gYZTit0lfC?mode=gi_t',
  // 01/08/2026, sábado, 12h — horário de Brasília (UTC-3).
  // O ano é 2026: 01/08/2026 cai num sábado (o catálogo diz "sábado") e o PDF
  // foi gerado em 24/07/2026. Trocar o ano é trocar SÓ esta linha.
  dataHoraISO: '2026-08-01T12:00:00-03:00',
  dataExtenso: '01 de agosto',
  diaSemana: 'sábado',
  hora: '12h',
  formato: 'Catálogo virtual',
  raca: 'Nelore PO',
  totalLotes: 134,
  vendedores: ['Fazenda São Geraldo', '7P Agro'],
} as const

// Condições de pagamento — literais do catálogo. São a oferta mais forte da
// página e não dependem de nenhuma informação pendente.
//
// NÃO existe seção de frete: o cliente cortou mapa e faixas do escopo (27/07).
// Um "frete grátis" genérico seria claim falso — o catálogo tem região em
// "sob consulta" e região sem entrega. Ver BRIEF §4.
export const PAGAMENTO = [
  { destaque: '30x', titulo: '30 parcelas', detalhe: '2+2+2+2+2+20 parcelas' },
  { destaque: '10%', titulo: 'de desconto', detalhe: 'para pagamento à vista' },
  { destaque: '4%', titulo: 'de desconto', detalhe: 'para pagamento em 12 parcelas (1+11)' },
  { destaque: '1+29', titulo: 'acima de 4 lotes', detalhe: 'parcelamento estendido' },
] as const

// NOTA (27/07): existiam aqui helpers de thumbnail de lote (thumbDoLote,
// videoDoLote). Foram removidos junto com a seção de catálogo — o cliente
// decidiu que a página não exibe lote, só o menciona. Os dados dos 134 lotes
// continuam versionados em .planning/leilao-sao-geraldo/lotes.json (com o
// videoId de cada um) caso a decisão mude, mas NADA disso entra no bundle.
