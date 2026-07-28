// ─────────────────────────────────────────────────────────────────────────
// Copy comercial da landing do LANÇAMENTO — Leilão Touros São Geraldo e 7P.
//
// Diferença de tom vs. a landing perpétua (/touros): lá a data é evitada de
// propósito; aqui a DATA É O ARGUMENTO. O leilão acontece uma vez, e a página
// existe para converter antes dele.
//
// Regras deste arquivo:
//  · Nenhum dado factual do evento mora aqui — data, hora, nº de lotes e
//    condições de pagamento vêm de `_lib/evento.ts`. Copy fala, evento informa.
//  · Nenhum claim numérico que não esteja no BRIEF. Na dúvida, qualitativo.
//  · Marca é BULA ASSESSORIA. São Geraldo e 7P são os criatórios vendedores.
//  · NÃO existe frete nesta página (cortado do escopo pelo cliente) — nenhuma
//    linha de copy pode insinuar entrega grátis.
// ─────────────────────────────────────────────────────────────────────────

export const hero = {
  // ENCURTADO em 27/07: saiu "· BULA ASSESSORIA". A logo da Bula está imediata-
  // mente acima desta linha, na faixa da foto — assinar a marca duas vezes em
  // 60px de tela é a definição de texto sobrando.
  eyebrow: 'LEILÃO · TOUROS NELORE PO',
  // A promessa é a mesma do funil perpétuo (retorno no bezerro), mas ancorada
  // num evento com hora marcada — é isso que separa esta página da /touros.
  //
  // ENCURTADO em 27/07 (de 62 para 37 caracteres) por decisão do cliente. Não
  // foi preferência de escrita: a versão longa ocupava 3 linhas no celular e
  // empurrava o formulário para 747px, contra os 411px da /touros. Cada linha
  // de título aqui custa ~32px de dobra, e a dobra é onde a página converte.
  // O detalhe que saiu do título ("mudar o seu próximo bezerro") continua no
  // lead, logo abaixo — não se perdeu argumento, mudou de lugar.
  title: 'O seu próximo touro tem hora marcada.',
  // ENCURTADO em 27/07 (de 195 para 105 caracteres) — o cliente reclamou de
  // excesso de texto no hero e este parágrafo era o maior bloco da dobra.
  //
  // O que saiu foi REPETIÇÃO, não argumento: a primeira frase ("Leilão de
  // touros PO Nelore das fazendas São Geraldo e 7P Agro") já estava dita duas
  // vezes na mesma tela — no eyebrow logo acima ("LEILÃO · TOUROS NELORE PO")
  // e na assinatura de origem no rodapé do hero ("LOTES DE FAZENDA SÃO GERALDO
  // · 7P AGRO"). As duas promessas concretas — a Bula seleciona e a Bula
  // habilita — continuam inteiras, e o verbo agora é o mesmo de `processo`
  // ("Selecionamos, dentro do catálogo...") e de `catalogo.nota`.
  //
  // Em tela: 5 linhas no celular viraram 3, ~56px de dobra devolvidos.
  lead:
    'A Bula seleciona os lotes que servem no seu rebanho e cuida da sua habilitação para dar lance. Sem custo.',
  ctaSticky: 'Quero assessoria',
  // Reforço abaixo do formulário: diz o que o cadastro entrega, sem prometer
  // preço. Perdeu "Assessoria sem custo." porque o lead agora fecha com
  // "Sem custo." — a mesma frase duas vezes na mesma dobra não reforça, cansa.
  reforco: 'Você recebe a seleção antes do leilão.',
  // Alt da foto do hero. Deixou de ser decorativa: agora ela tem faixa própria
  // e é conteúdo — quem não enxerga a imagem precisa saber o que ela mostra.
  // Descrição factual do que está no quadro; nenhum claim.
  fotoAlt: 'Apartação de touros Nelore no curral da fazenda, ao entardecer',
  // Crédito de origem no pé do hero. Substitui a montagem inline que hoje vive
  // no Hero.tsx — o componente passa `EVENTO.vendedores` e a frase é daqui.
  //
  // Sai em caixa BAIXA de propósito: quem consome é `typo.cerimonia`, que já
  // aplica `text-transform: uppercase`. Escrever em caixa alta aqui não mudaria
  // a tela e só tiraria a legibilidade de quem edita a copy.
  //
  // Os criatórios ganham a dignidade que o catálogo dá a eles, dentro do único
  // espaço que o BRIEF autoriza: crédito de vendedor. A marca da página segue
  // sendo a Bula.
  creditoOrigem: (vendedores: readonly string[]) => `Lotes de ${vendedores.join(' · ')}`,
}

export const contagem = {
  label: 'O leilão começa em',
  // ── A DATA COMO MONUMENTO (redesign). As duas funções abaixo derivam de
  //    EVENTO; nenhuma data mora aqui.
  //
  // `dataMonumento` devolve JÁ em caixa alta porque `typo.dataMonumento` não
  // aplica transform nenhum — display serifado grande com transform de CSS fica
  // à mercê de quem copia o estilo. Tira o "de" de "01 de agosto": o monumento
  // é o par dia+mês, e a preposição no meio quebra a leitura de bloco.
  dataMonumento: (dataExtenso: string) => dataExtenso.replace(' de ', ' ').toUpperCase(),
  // `SÁBADO · 12H`. Em caixa baixa aqui porque quem consome é `typo.cerimonia`,
  // que já faz o uppercase. O ponto médio é o mesmo separador do crédito de
  // origem — é o sinal de cerimônia da página.
  cerimonia: (diaSemana: string, hora: string) => `${diaSemana} · ${hora}`,
  encerrado: 'O leilão já começou.',
  encerradoLead:
    'Fale com a Bula mesmo assim — a equipe te orienta sobre este e sobre os próximos leilões.',
  unidades: { dias: 'dias', horas: 'horas', minutos: 'min', segundos: 'seg' },
}

// Barra fixa do mobile. A urgência só entra na RETA FINAL (≤3 dias): antes
// disso, contar dias enfraquece o apelo — "faltam 12 dias" é permissão para
// adiar. A contagem completa já vive no hero, para quem quiser o detalhe.
export const sticky = {
  urgencia(dias: number) {
    if (dias <= 0) return 'O leilão é hoje'
    if (dias === 1) return 'Falta 1 dia para o leilão'
    return `Faltam ${dias} dias para o leilão`
  },
}

// ─────────────────────────────────────────────────────────────────────────
// PISTA — a ficha agregada do rebanho. É a seção que dá substância à página:
// o resto do site DIZ que a Bula lê o catálogo; esta seção MOSTRA a leitura.
//
// A disciplina que torna isso seguro sem validação do cliente: **todo rótulo
// declara o próprio denominador**. Um agregado com denominador explícito não é
// claim novo — é contagem do que o catálogo diz, com a lacuna do parser visível
// na própria frase. Uma falha de leitura pode reduzir o denominador; nunca pode
// inflar o numerador. Por isso NENHUM número está escrito aqui: todos chegam
// por parâmetro, vindos de `_lib/ficha.ts` (que é gerado do catálogo oficial).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Números que a `Pista` passa para a copy. Todos saem de `FICHA` — o componente
 * monta este objeto, a copy só formata.
 *
 * Três exceções que merecem explicação, porque parecem números soltos e não são:
 * `iqgFaixaTop` (5), `ceLimiar` (34) e `iabczFaixaDeca` (1) são os LIMIARES que
 * dão nome aos campos `FICHA.iqg.top5`, `FICHA.ce.acima34` e `FICHA.iabcz.deca1`.
 * Eles não são medida do rebanho, são o corte da avaliação — e vêm por parâmetro
 * pelo mesmo motivo que o resto: para que trocar o corte seja mudar o dado,
 * nunca reescrever a frase.
 */
export type NumerosPista = {
  lotes: number
  animais: number
  iqgFaixaTop: number
  iqgTop5: number
  iqgAvaliados: number
  idadeMin: number
  idadeMax: number
  idadeNaFaixa: number
  idadeComDado: number
  ceLimiar: number
  ceMediana: number
  ceAcima: number
  ceComDado: number
  selosLotes: number
  pesoMediana: number
  pesoMin: number
  pesoMax: number
  iabczFaixaDeca: number
  iabczDeca1: number
  iabczAvaliados: number
  paisDistintos: number
}

/** Separador de milhar do pt-BR, à mão. `toLocaleString` depende do ICU do
 *  ambiente e esta string é renderizada no servidor e hidratada no cliente —
 *  qualquer divergência entre os dois vira erro de hidratação. */
const milhar = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export const pista = {
  // Eyebrow e título são os dois únicos textos que assentam sobre a foto
  // sangrada, e os dois vão em serifa: aqui quem fala é o EVENTO.
  eyebrow: 'Ficha do rebanho',
  title: 'O rebanho que entra em pista.',
  // O lead cai no fundo sólido, abaixo do fio duplo — nenhum texto de corpo
  // sobre foto.
  //
  // É AQUI que mora o argumento "a Bula lê o catálogo por você". Ele saiu de
  // `catalogo.nota` na mesma leva: a Pista passou a MOSTRAR a leitura, e o
  // mesmo argumento em duas seções não reforça, dilui.
  lead:
    'Os números abaixo são contagem do catálogo oficial, e cada um diz de quantos animais ele saiu. É essa leitura, lote a lote, que a Bula faz por você.',
  // Os quatro monumentos, na ordem em que a §2.2 do plano os travou.
  // `valores[i]` e `rotulos[i]` são o par de um mesmo monumento.
  valores: [
    (n: NumerosPista) => `TOP ${n.iqgFaixaTop}%`,
    // Meia-risca, não hífen: é intervalo, não composição.
    (n: NumerosPista) => `${n.idadeMin}–${n.idadeMax}`,
    (n: NumerosPista) => `${n.ceMediana} cm`,
    (n: NumerosPista) => `${n.selosLotes}`,
  ],
  rotulos: [
    (n: NumerosPista) =>
      `IQG — ${n.iqgTop5} dos ${n.iqgAvaliados} avaliados nesta faixa da avaliação genética`,
    (n: NumerosPista) => `Meses — a idade de ${n.idadeNaFaixa} dos ${n.idadeComDado} com idade no catálogo`,
    (n: NumerosPista) => `CE mediana — ${n.ceAcima} dos ${n.ceComDado} com ${n.ceLimiar} cm ou mais`,
    (n: NumerosPista) => `Lotes com mãe ou avó de touro de central, dos ${n.lotes} do catálogo`,
  ],
  // Linha de apoio. Devolve os itens separados: quem monta decide o separador
  // (a §2.2 usa ' · ') e pode quebrar a linha onde a tela pedir.
  apoio: (n: NumerosPista) => [
    `${milhar(n.pesoMediana)} kg de peso mediano, de ${milhar(n.pesoMin)} a ${milhar(n.pesoMax)}`,
    `DECA ${n.iabczFaixaDeca} do iABCZ em ${n.iabczDeca1} dos ${n.iabczAvaliados} avaliados`,
    `${n.paisDistintos} reprodutores diferentes na paternidade`,
    `${n.lotes} lotes, ${n.animais} animais`,
  ],
  // Foto de AMBIÊNCIA da fazenda, não de lote — o BRIEF proíbe foto e
  // placeholder de lote, não fotografia do trabalho. Descrição do que está no
  // quadro, sem nenhum claim sobre os animais.
  fotoAlt: 'Currais cheios de touros Nelore vistos do alto, ao fim da tarde',
  // Âncora quieta de volta ao #cadastro. Deliberadamente sem verbo de urgência:
  // o CTA alto já é da Oferta e do Fecho; aqui é saída de leitura, não pressão.
  ancora: 'Ver quais lotes servem no meu rebanho',
}

export const oferta = {
  eyebrow: 'CONDIÇÕES DO LEILÃO',
  title: 'Condição de pagamento que cabe no seu ciclo.',
  lead:
    'As condições abaixo são as do catálogo oficial do leilão. A Bula te ajuda a montar a compra dentro delas.',
  cta: 'Quero a seleção do meu rebanho',
}

// Como a Bula entra no meio — os mesmos 4 passos da landing perpétua, porque é
// o mesmo serviço, reescritos para o contexto de um leilão com data.
export const processo = {
  // A §6.4 do plano chama esta chave de `subHero.eyebrow`. Ela mora aqui porque
  // `processo` é o objeto que o `SubHero.tsx` já importa — criar um segundo
  // export para uma string obrigaria a mexer no import de um arquivo que não é
  // meu. Em Oswald, não em serifa: aqui quem fala é a BULA.
  eyebrow: 'Como a Bula entra',
  title: 'A Bula te assessora do cadastro ao lance.',
  passos: [
    { strong: false, text: 'Fazemos um diagnóstico do seu rebanho para entender o seu projeto' },
    { strong: false, text: 'Direcionamos você para o Assessor Bula mais próximo e capacitado para te atender' },
    { strong: false, text: 'Cuidamos do seu cadastro na leiloeira para habilitar suas compras parceladas' },
    { strong: false, text: 'Selecionamos, dentro do catálogo, os touros que servem na sua fazenda' },
  ],
}

// O catálogo é MENCIONADO, não exibido (decisão do cliente, 27/07). A página
// não lista lote: quem quer ver lote fala com o assessor — o que, aliás, é o
// objetivo da página. O número de lotes sai de EVENTO.totalLotes, nunca daqui.
//
// Importante para quem for mexer: NÃO importe `_lib/lotes.ts` para pegar a
// contagem. Aquele módulo carrega o lotes.json inteiro (~766 KB) em escopo de
// módulo e ele acabaria no bundle da página só para renderizar um número.
// REESCRITA no redesign (de 232 para 124 caracteres). O que saiu — "a Bula lê o
// catálogo por você: pedigree, avaliação genética e vídeo de cada animal" — não
// se perdeu: virou a seção `Pista`, que MOSTRA essa leitura em vez de prometê-la.
// Argumento que aparece duas vezes na mesma página não reforça, dilui. O que
// sobrou aqui é o que só esta nota diz: o tamanho do catálogo e o que você
// recebe dele.
export const catalogo = {
  nota: (totalLotes: number) =>
    `São ${totalLotes} lotes de Nelore PO no catálogo oficial. A Bula te manda a lista com o número dos que servem no seu rebanho.`,
}

// Prova social — faixa de logos dos criatórios. O claim é QUALITATIVO: o
// equivalente na /touros ("+1.000 touros PO apartados") está marcado [VALIDAR]
// lá desde antes e nunca foi confirmado. Se o cliente validar o número, é aqui
// que ele entra — em uma linha.
export const provaSocial = {
  eyebrow: 'Criatórios e fazendas que confiam na Bula',
  claim: 'A mesma equipe que aparta touro ao lado de criatórios de corte e seleção vai escolher o seu.',
}

// Fecho — último convite, depois da prova social. NÃO hospeda formulário: uma
// segunda instância duplicaria os eventos de funil. Só devolve ao #cadastro.
export const fecho = {
  // Era `'ANTES DO DIA 01'` — a data do leilão CHUMBADA numa string, desde
  // antes do redesign. Virou função de `EVENTO` como o resto do arquivo: trocar
  // a data do evento passa a ser trocar UMA linha em `evento.ts`, e não caçar
  // um `01` solto na copy. Em caixa baixa porque quem consome é `typo.eyebrow`,
  // que já aplica o uppercase.
  eyebrow: (dataExtenso: string) => `Antes de ${dataExtenso}`,
  title: 'Chegue no leilão sabendo\nexatamente em que lote dar lance.',
  lead:
    'O cadastro é rápido e sem custo. Quem se cadastra antes recebe a seleção e chega no dia do leilão com a lista na mão.',
  bullets: [
    'Diagnóstico do seu rebanho, sem custo',
    'Seleção dos lotes que servem no seu projeto',
    'Cadastro na leiloeira para dar lance parcelado',
    'Um assessor com você durante o leilão',
  ],
  nota: 'Assessoria sem custo · Atendimento por WhatsApp',
}

export const footer = {
  nota: 'Bula Assessoria — assessoria de genética para pecuária de corte.',
  // SEM ponto final: esta linha virou small caps de cerimônia no rodapé, e em
  // caixa alta com 0.18em de tracking o ponto fica órfão — separado da última
  // palavra pelo próprio tracking, lendo como sujeira e não como pontuação.
  // Nenhuma outra linha cerimonial da página termina em ponto (nem o crédito
  // do Hero, nem a linha de data da Contagem).
  criatorios: 'Lotes das fazendas São Geraldo e 7P Agro',
}
