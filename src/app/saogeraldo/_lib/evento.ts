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
// SOBRE O FRETE (atualizado em 28/07): ele VOLTOU ao escopo por decisão do
// cliente. O corte de 27/07 — que tirava mapa e faixas — está revertido, e a
// página passou a reproduzir a página 3 do catálogo. As faixas por UF vivem
// em `_lib/frete.ts`, lidas do PDF e amostradas pixel a pixel, justamente
// para que nenhum claim de "frete grátis" seja genérico: o catálogo tem
// região sob consulta e região sem entrega, e as duas aparecem.
export const PAGAMENTO = [
  { destaque: '30x', titulo: '30 parcelas', detalhe: '2+2+2+2+2+20 parcelas' },
  { destaque: '10%', titulo: 'de desconto', detalhe: 'para pagamento à vista' },
  { destaque: '4%', titulo: 'de desconto', detalhe: 'para pagamento em 12 parcelas (1+11)' },
  { destaque: '1+29', titulo: 'acima de 4 lotes', detalhe: 'parcelamento estendido' },
] as const

/**
 * As MESMAS condições, quebradas como a página 2 do catálogo as escreve.
 *
 * Existe em paralelo a `PAGAMENTO` (que serve à grade de cards da versão
 * anterior) porque o catálogo não usa grade: usa uma LISTA vertical, em que
 * cada item é uma linha forte seguida de um detalhe entre parênteses, e os
 * itens são separados por fio pontilhado.
 *
 * A quebra importa. "30 PARCELAS" e "(2+2+2+2+2+20 PARCELAS)" são uma frase
 * só no impresso; separá-las em destaque e rótulo, como a grade fazia,
 * produzia "30x / 30 parcelas" — que repete o número e não é o que o
 * catálogo diz.
 */
export const PAGAMENTO_CATALOGO = [
  { linha: '30 parcelas', detalhe: '(2+2+2+2+2+20 parcelas)' },
  { linha: '10% de desconto', detalhe: 'para pagamento à vista' },
  { linha: '4% de desconto', detalhe: 'para pagamento em 12 parcelas (1+11)' },
  { linha: 'Acima de 4 lotes', detalhe: 'pagamento em 1+29 parcelas' },
] as const

// NOTA (27/07): existiam aqui helpers de thumbnail de lote (thumbDoLote,
// videoDoLote). Foram removidos junto com a seção de catálogo — o cliente
// decidiu que a página não exibe lote, só o menciona. Os dados dos 134 lotes
// continuam versionados em .planning/leilao-sao-geraldo/lotes.json (com o
// videoId de cada um) caso a decisão mude, mas NADA disso entra no bundle.
