// ─────────────────────────────────────────────────────────────────────────
// CONDIÇÃO DE FRETE — página 3 do catálogo.
//
// Este arquivo é DADO, não desenho. Trocar a faixa de um estado é trocar uma
// linha aqui; nenhum componente conhece a cor de nenhuma UF.
//
// PROCEDÊNCIA: as quatro cores e a faixa de cada estado foram lidas do PDF
// do catálogo (`Leilão Touros São Geraldo e 7P (CAT VIRTUAL).pdf`, página 3),
// renderizado a 300 dpi e amostrado pixel a pixel — não deduzidas por
// geografia nem por plausibilidade comercial.
//
// As quatro tintas são os valores EXATOS declarados pelo InDesign, extraídos
// do `fill` vetorial com `pdftocairo -svg` e conferidos contra a cor modal do
// raster em 29 polígonos. Duas delas (#806853 e #8E9F93) chegaram à primeira
// versão deste arquivo com ±1/255 de desvio, lidas a olho; a auditoria de
// 28/07 as devolveu ao valor do documento.
//
// O DF merece nota. Ele não tem rótulo no mapa do catálogo e é pequeno demais
// para leitura a olho, então foi amostrado três vezes no interior do polígono
// (a NE do rótulo "GO"), nas coordenadas (1663,2522), (1668,2527) e
// (1658,2518) do render de 300 dpi. As três leram #B59C74 — a mesma tinta de
// Goiás, cujo corpo em (1500,2600) também lê #B59C74. O DF é FRETE GRÁTIS.
//
// SC e RS em "não é possível a entrega" são contraintuitivos (o Sul é malha
// asfaltada inteira, e ficam abaixo de PA/AP/TO, que são "sob consulta").
// Foram lidos do mapa e CONFIRMADOS pelo cliente em 28/07.
// ─────────────────────────────────────────────────────────────────────────

/** Chave de faixa. A ordem aqui é a ordem de leitura da legenda no catálogo. */
export type FaixaFrete = 'gratis' | 'gratis2lotes' | 'consulta' | 'semEntrega'

/**
 * As quatro faixas.
 *
 * `textoLegenda` é a cor do rótulo na LEGENDA, e existe separada de `cor`
 * porque nem toda tinta do mapa serve de texto.
 *
 * O fundo da legenda não é o carvão: é o card `rgba(58,45,30,0.38)` sobre
 * `#2B1F13`, que compõe em **#312417**. Medir contra o carvão sólido dá um
 * número otimista — foi o erro da primeira passada, que leu 3,08 onde a
 * medição por máscara de glifo na página renderizada leu 2,89.
 *
 * Sobre #312417:
 *   #B59C74 .... 5,71:1  AA
 *   #8E9F93 .... 5,40:1  AA
 *   #999999 .... 5,28:1  AA
 *   #806853 .... 2,89:1  REPROVA — nem como texto grande (exige 3,0)
 *
 * Por isso a faixa marrom, e SÓ ela, escreve em `#A98A6D`: mesmo matiz,
 * clareado até 4,69:1 sobre o card. A cápsula ao lado continua na tinta
 * exata do catálogo, que é quem carrega a identidade da faixa — o texto
 * empresta o matiz, não a tinta.
 *
 * `textoSobre` é a cor do rótulo DENTRO do polígono, e não é escolha estética
 * — é a única que passa WCAG AA em cada tinta. Medido:
 *
 *              ink #201812   branco #FFFFFF
 *   #B59C74      6,64  AA        2,63  REPROVA
 *   #806853      3,35  large     5,22  AA
 *   #8E9F93      6,27  AA        2,79  REPROVA
 *   #999999      6,14  AA        2,85  REPROVA
 *
 * O catálogo impresso usa BRANCO nas quatro, o que reprova em três. Aqui a
 * sigla escurece nas três faixas claras e fica branca só na #816852. É a
 * única divergência deliberada em relação ao PDF, e existe porque a sigla
 * carrega informação — o nome do estado — e informação precisa ser legível.
 */
export const FAIXAS: Record<
  FaixaFrete,
  { cor: string; textoSobre: string; textoLegenda: string; rotulo: string; detalhe: string; aria: string }
> = {
  gratis: {
    cor: '#B59C74',
    textoLegenda: '#B59C74',
    textoSobre: '#201812',
    rotulo: 'Frete grátis*',
    detalhe: 'Qualquer quantidade',
    aria: 'frete grátis para qualquer quantidade',
  },
  gratis2lotes: {
    cor: '#806853',
    textoLegenda: '#A98A6D',
    textoSobre: '#FFFFFF',
    rotulo: 'Frete grátis*',
    detalhe: 'A partir de 2 lotes',
    aria: 'frete grátis a partir de 2 lotes',
  },
  consulta: {
    cor: '#8E9F93',
    textoLegenda: '#8EA094',
    textoSobre: '#201812',
    rotulo: 'Frete sob consulta',
    detalhe: '',
    aria: 'frete sob consulta',
  },
  semEntrega: {
    cor: '#999999',
    textoLegenda: '#999999',
    textoSobre: '#201812',
    rotulo: 'Não é possível a entrega',
    detalhe: '',
    aria: 'não é possível a entrega',
  },
}

/** A nota de rodapé do asterisco, na vertical à direita do mapa no catálogo. */
export const NOTA_ASTERISCO = '* dentro da malha rodoviária asfaltada'

export type Uf = {
  /** Código IBGE — é por ele que o path do SVG é casado, não pela sigla. */
  codigo: string
  sigla: string
  nome: string
  faixa: FaixaFrete
}

/**
 * As 27 unidades federativas.
 *
 * Distribuição: 17 grátis · 2 a partir de 2 lotes · 2 sob consulta ·
 * 6 sem entrega. A soma fecha em 27 — e foi essa aritmética que denunciou a
 * ausência do DF na primeira leitura do mapa.
 *
 * "Sob consulta" tem só DOIS estados: PA e TO. O AP parece pertencer ao
 * grupo por vizinhança, mas não pertence — ver a nota sobre ele abaixo.
 */
export const UFS: readonly Uf[] = [
  // Norte
  { codigo: '11', sigla: 'RO', nome: 'Rondônia', faixa: 'gratis' },
  { codigo: '12', sigla: 'AC', nome: 'Acre', faixa: 'semEntrega' },
  { codigo: '13', sigla: 'AM', nome: 'Amazonas', faixa: 'semEntrega' },
  { codigo: '14', sigla: 'RR', nome: 'Roraima', faixa: 'semEntrega' },
  { codigo: '15', sigla: 'PA', nome: 'Pará', faixa: 'consulta' },
  // AP é CINZA, não verde. Corrigido em 28/07 depois de amostragem no
  // interior do polígono: (1460,1600) e (1400,1690) do render de 300 dpi leem
  // #999999, enquanto PA em (1350,2000) e TO em (1650,2320) leem #8E9F93.
  // A leitura anterior o classificou como "sob consulta" por vizinhança com o
  // PA, olhando a página em baixa resolução — que é exatamente o erro que a
  // amostragem existe para impedir.
  { codigo: '16', sigla: 'AP', nome: 'Amapá', faixa: 'semEntrega' },
  { codigo: '17', sigla: 'TO', nome: 'Tocantins', faixa: 'consulta' },
  // Nordeste
  { codigo: '21', sigla: 'MA', nome: 'Maranhão', faixa: 'gratis' },
  { codigo: '22', sigla: 'PI', nome: 'Piauí', faixa: 'gratis' },
  { codigo: '23', sigla: 'CE', nome: 'Ceará', faixa: 'gratis' },
  { codigo: '24', sigla: 'RN', nome: 'Rio Grande do Norte', faixa: 'gratis' },
  { codigo: '25', sigla: 'PB', nome: 'Paraíba', faixa: 'gratis' },
  { codigo: '26', sigla: 'PE', nome: 'Pernambuco', faixa: 'gratis' },
  { codigo: '27', sigla: 'AL', nome: 'Alagoas', faixa: 'gratis' },
  { codigo: '28', sigla: 'SE', nome: 'Sergipe', faixa: 'gratis' },
  { codigo: '29', sigla: 'BA', nome: 'Bahia', faixa: 'gratis' },
  // Sudeste
  { codigo: '31', sigla: 'MG', nome: 'Minas Gerais', faixa: 'gratis' },
  { codigo: '32', sigla: 'ES', nome: 'Espírito Santo', faixa: 'gratis2lotes' },
  { codigo: '33', sigla: 'RJ', nome: 'Rio de Janeiro', faixa: 'gratis2lotes' },
  { codigo: '35', sigla: 'SP', nome: 'São Paulo', faixa: 'gratis' },
  // Sul
  { codigo: '41', sigla: 'PR', nome: 'Paraná', faixa: 'gratis' },
  { codigo: '42', sigla: 'SC', nome: 'Santa Catarina', faixa: 'semEntrega' },
  { codigo: '43', sigla: 'RS', nome: 'Rio Grande do Sul', faixa: 'semEntrega' },
  // Centro-Oeste
  { codigo: '50', sigla: 'MS', nome: 'Mato Grosso do Sul', faixa: 'gratis' },
  { codigo: '51', sigla: 'MT', nome: 'Mato Grosso', faixa: 'gratis' },
  { codigo: '52', sigla: 'GO', nome: 'Goiás', faixa: 'gratis' },
  { codigo: '53', sigla: 'DF', nome: 'Distrito Federal', faixa: 'gratis' },
] as const

/** Índice por código IBGE — o `MapaBrasil` pinta o path casando por aqui. */
export const UF_POR_CODIGO: ReadonlyMap<string, Uf> = new Map(UFS.map((uf) => [uf.codigo, uf]))

/** Agrupamento para a tabela textual equivalente ao mapa. */
export const UFS_POR_FAIXA = (faixa: FaixaFrete): Uf[] => UFS.filter((uf) => uf.faixa === faixa)
