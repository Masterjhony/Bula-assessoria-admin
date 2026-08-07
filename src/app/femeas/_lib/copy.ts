// ─────────────────────────────────────────────────────────────────────────
// Copy comercial da landing do perpétuo de FÊMEAS.
//
// ESTADO: v2 — revisada pelo João Antônio em 05/08/2026.
//
// Ele aprovou o conjunto ("qualifica pra cacete, não vai entrar um bobo
// perdido") e pediu três coisas. Duas eram texto e já estão aplicadas:
//
//   1. Frete → "frete grátis sob consulta", a praxe de leilão. Ver hero.stats.
//   2. Saiu "e criatório sério não começa por volume" do bloco "não é para
//      você". Ver paraQuem.nao.
//
// A terceira NÃO é texto e continua aberta:
//
//   3. A promessa de ACASALAMENTO precisa de validação da equipe técnica —
//      ele a elogiou, mas alertou que exige formação e ir ao curral. Ver o
//      comentário em `assessoria.itens`. É risco de ENTREGA, não de copy.
//
// Editar direto neste arquivo; a página inteira lê daqui (INV-5), então
// corrigir aqui corrige na página, sem tocar em componente.
//
// Marcações que sobraram: [VALIDAR] em claim que depende do cliente, [JA] em
// pergunta ainda não respondida.
//
// Marcações:
//   [VALIDAR]  — claim que não pode ir ao ar sem o cliente confirmar
//   [JA]       — pergunta específica para o João Antônio
//
// ⚠️ A MARCAÇÃO VIVE NO COMENTÁRIO, NÃO DENTRO DA STRING. Só `obrigado.*.prazo`
// carrega "[VALIDAR]" no próprio texto, e carrega porque aquele campo é o único
// renderizado através de `semMarcacao()` (fim deste arquivo). Todo o resto da
// página imprime a string como ela está — `{hero.lead}`, `{provaSocial.title}` —
// então um "[JA]" colado no texto vai parar na tela do lead.
//
// ── RODADA DE 06/08 (enxugar) — PROPOSTAS AINDA NÃO LIDAS PELO JA ──────────
// Pedido do dono, em duas frases: "o hero segue pesado, há muito texto" e "na
// parte onde tem logos, quero melhorar o texto". O que mudou nesta rodada, e
// onde está o antes de cada um (a redação de 05/08 ficou COMENTADA ao lado, para
// comparação — nada foi apagado):
//
//   · hero.lead      — 37 → 21 palavras. Ver o comentário do campo.
//   · hero.ctaNote   — 16 → 11 palavras. Ver o comentário do campo.
//   · provaSocial    — o eyebrow passou a dizer de quem são os logos, e o
//                      título inverteu a ordem das duas frases. Ver a seção.
//   · paraQuem.lead  — OLHADA E NÃO CORTADA, de propósito. O motivo está
//                      escrito lá; é o único ponto desta rodada onde encurtar
//                      custava mais do que ganhava.
//
// A DIFERENÇA DE TOM em relação ao /touros, que é deliberada e não deve ser
// "corrigida" para ficar igual: a landing de touros vende RETORNO no bezerro,
// promessa concreta em R$, ciclo curto. Esta vende PROJETO — o cara está
// montando uma indústria de seleção que vai levar anos. Promessa de retorno
// rápido aqui atrai exatamente o público errado, que é o problema que esta
// página existe para resolver.
//
// E o atrito é o produto. A copy NÃO deve minimizar o cadastro ("é rapidinho",
// "1 minuto"). Ela deve avisar que existe análise e que nem todo mundo passa —
// isso é o filtro trabalhando antes do formulário.
// ─────────────────────────────────────────────────────────────────────────

export const hero = {
  eyebrow: 'MATRIZES PO NELORE · BULA ASSESSORIA',
  // Texto alternativo da foto do topo. Vive aqui, e não no componente, porque
  // quando o material da fazenda (14–15/08) chegar, quem troca a foto troca a
  // descrição junto — e alt é conteúdo, não estilo. Enquanto o encaixe está
  // vazio, esta linha não é renderizada em lugar nenhum.
  fotoAlt: 'Matrizes Nelore PO a pasto, em fazenda atendida pela Bula Assessoria',
  // A promessa é a marca própria, não o animal. Veio quase literal da reunião:
  // "crie sua própria marca de Nelore PO, seu próprio criatório".
  title: 'Crie a sua própria marca de Nelore PO.',
  // ── ENXUGADO EM 06/08 · 37 → 21 palavras · pendente do JA ─────────────────
  // A redação de 05/08, íntegra:
  //
  //   'Quem compra touro melhora o bezerro que vende. Quem compra matriz PO
  //    passa a produzir o touro que os outros compram. A Bula te acompanha nessa
  //    virada — da escolha da primeira fêmea ao acasalamento do seu plantel.'
  //
  // O QUE FICOU são as duas primeiras frases, caractere a caractere. Elas são a
  // oposição que sustenta a página inteira (touro melhora o que você vende /
  // matriz faz de você quem vende), e mexer nelas não estava em discussão —
  // encurtar aqui é escolher O QUE SAI DEPOIS delas, não reescrevê-las.
  //
  // O QUE SAIU foi a terceira frase, e ela saiu por três razões somadas:
  //
  //  1. É a única do parágrafo que a página REPETE em outro lugar. "A Bula te
  //     acompanha" é a tese inteira da seção `assessoria` ("A Bula não vende o
  //     animal e some"), e os dois exemplos que ela enumera — escolha do animal
  //     e acasalamento — são dois dos quatro cartões de lá, com mais espaço e
  //     mais detalhe do que cabe numa oração de olho.
  //  2. Ela diluía o remate. Terminar em "o touro que os outros compram" deixa a
  //     virada como última coisa lida antes do aviso de análise; terminar numa
  //     lista de serviços troca o argumento por um índice.
  //  3. Ela era o único ponto do HERO a prometer acasalamento — que é a
  //     promessa [VALIDAR] pendente de aval da equipe técnica (ver
  //     `assessoria.itens`). Enquanto ela não fecha, tê-la em um lugar só, e
  //     abaixo da dobra, é menos exposição, não mais.
  //
  // O ganho medido é de LINHA, não de palavra: 212 → 116 caracteres tira o olho
  // de ~5 para ~3 linhas num iPhone (~44 caracteres por linha a 16px dentro dos
  // 350px úteis), ou seja ~52px a menos entre a manchete e o primeiro campo.
  // Este parágrafo está no caminho de quem JÁ decidiu preencher.
  //
  // ⚠️ SE O JA QUISER A MARCA DE VOLTA NO OLHO, o meio-termo é acrescentar uma
  // terceira frase de 8 palavras em vez das 16 antigas — fica em 29 palavras e
  // ~4 linhas, e mantém o remate na virada porque a nova frase é curta:
  //
  //   lead: 'Quem compra touro melhora o bezerro que vende. Quem compra matriz
  //          PO passa a produzir o touro que os outros compram. É essa virada
  //          que a Bula acompanha.'
  //
  // Não é a versão em uso porque "acompanhamento" já chega ao leitor no hero por
  // outros dois caminhos: o `ctaNote` promete reunião com assessor, e a ficha
  // técnica diz "R$ 0 · custo da assessoria".
  lead: 'Quem compra touro melhora o bezerro que vende. Quem compra matriz PO passa a produzir o touro que os outros compram.',
  cta: 'Quero montar meu criatório',
  // Contra-intuitivo de propósito: avisa que tem análise. Ver cabeçalho.
  //
  // ── ENXUGADO EM 06/08 · 16 → 11 palavras · pendente do JA ─────────────────
  // Antes: 'Cadastro analisado pela nossa equipe · Se aprovado, você é chamado
  //         para uma reunião com um assessor'
  //
  // Saiu "você é chamado para uma", que é construção, não informação. As três
  // coisas que esta linha existe para dizer continuam todas de pé, e na mesma
  // ordem: existe ANÁLISE (feita por gente — "nossa equipe" fica), ela é
  // CONDICIONAL ("se aprovado" — nem todo mundo passa), e o que se ganha do
  // outro lado é REUNIÃO COM ASSESSOR, não um número de WhatsApp.
  //
  // A forma telegráfica não é economia de gosto: são 99 → 75 caracteres, que a
  // 15px dentro dos 46ch tiram esta linha de 3 para 2 linhas — e ela fica logo
  // acima do card do formulário no celular. O ritmo de ficha com "·" já é o
  // desta linha, e o `fecho.ctaNote` (aprovado em 05/08) já é assim: "Cadastro
  // analisado · Reunião com assessor se aprovado".
  //
  // ⚠️ O QUE O CORTE CUSTA, e é honesto dizer: "você é chamado" era o único
  // lugar do hero que deixava claro que QUEM CHAMA É A BULA — a pessoa não
  // escolhe horário sozinha, o SDR é que agenda. A jornada (passo 03) e as
  // páginas de obrigado dizem isso com todas as letras, então a informação não
  // se perde do funil; ela sai do hero. Se o JA achar que precisa estar já na
  // primeira dobra, a versão de 05/08 acima volta inteira.
  ctaNote: 'Cadastro analisado pela nossa equipe · Se aprovado, reunião com um assessor',
  // Nenhum número inventado — os três saem de fatos declarados na reunião. Se o
  // cliente quiser prova de escala aqui (nº de criatórios atendidos, animais
  // vendidos), ele precisa fornecer o número; não estimar.
  //
  // "sob consulta" no frete é correção do João Antônio (05/08) e NÃO é hedge
  // jurídico: é a praxe de leilão. A maioria entrega sem custo, mas para praças
  // de logística difícil — o Acre foi o exemplo dele — quase não existe leilão
  // que entregue. Prometer frete grátis seco criaria promessa que o time teria
  // de desdizer na reunião, que é o pior lugar para desdizer.
  stats: [
    { value: '30x', label: 'no boleto' },
    { value: 'Frete grátis', label: 'sob consulta' },
    { value: 'R$ 0', label: 'custo da assessoria' },
  ],
  titleVariants: [
    'O seu nome no\ncatálogo, um dia.',
    'Pare de comprar genética.\nComece a produzir.',
    'Todo criatório começou\ncom a primeira matriz.',
  ],
}

// ─────────────────────────────────────────────────────────────────────────
// A SEÇÃO MAIS IMPORTANTE DA PÁGINA.
//
// Ela existe para desqualificar. A rodada anterior de fêmeas trouxe gente
// querendo fêmea de gado COMERCIAL e gente querendo 50 a 70 cabeças — e o
// custo disso não é o lead perdido, é a hora do SDR queimada em quem nunca ia
// comprar.
//
// TOM APROVADO (João Antônio, 05/08): direto sem ser grosseiro — quem não é o
// público se reconhece e sai, mas sem sair ofendido, porque ele pode ser
// comprador de touro e a Bula quer esse cara no outro funil.
//
// O único ajuste que ele pediu foi cirúrgico e já está aplicado abaixo: o
// filtro julga EXPECTATIVA DE PREÇO, nunca a ambição do comprador. Ao editar
// esta lista, manter essa linha — dizer a alguém que o projeto dele não é
// sério é o tipo de frase que afasta justamente o comprador grande.
// ─────────────────────────────────────────────────────────────────────────
/**
 * Um critério do filtro, em DUAS REDAÇÕES.
 *
 * ⚠️ PENDENTE DE REVISÃO DO JOÃO ANTÔNIO. Ele aprovou a redação longa em
 * 05/08. A curta — que é simplesmente o `criterio` sozinho — nasceu em 06/08,
 * a pedido do dono ("tem texto demais no celular"), e ele ainda NÃO leu.
 *
 * Onde cada uma aparece:
 *   · abaixo de 640px  → só `criterio`
 *   · a partir de 640px → `criterio` + ' ' + `explicacao`, que reproduz
 *     caractere a caractere a frase aprovada em 05/08
 *
 * A REGRA DO CORTE FOI MECÂNICA, NÃO EDITORIAL, e é isso que a torna segura de
 * repetir: só vira `explicacao` uma SEGUNDA ORAÇÃO INTEIRA, o que vem depois de
 * um ponto final. Nenhum critério foi removido — continuam 5 de um lado e 4 do
 * outro. Cortar critério é cortar o filtro, e o filtro é o produto desta
 * página: o problema declarado pelo cliente é volume de lead ERRADO.
 *
 * Ao editar: o `criterio` precisa fechar sentido sozinho e terminar em ponto,
 * porque no celular ele é o texto inteiro. Se a frase não tiver segunda oração,
 * deixe `explicacao` de fora — os itens 1, 2, 4 e 5 da coluna do "é" estão
 * assim, e não é esquecimento: eles já eram curtos.
 */
export interface CriterioFiltro {
  criterio: string
  explicacao?: string
}

export const paraQuem = {
  // Os `eyebrow` de seção nasceram como string solta dentro do componente na
  // versão de leitura da Fase 4. Vieram para cá na Fase 7: rótulo de seção é
  // copy — é a primeira palavra que a pessoa lê do bloco — e INV-5 não abre
  // exceção "para as pequenas".
  eyebrow: 'O FILTRO',
  title: 'Antes de você preencher: isto aqui não é para todo mundo.',
  // ── OLHADA NA RODADA DE 06/08 E MANTIDA INTACTA ───────────────────────────
  // Entrou na lista de "ver se dá para encurtar" e sai dela sem uma palavra a
  // menos. O registro fica aqui para ninguém refazer a análise daqui a um mês:
  //
  //  · O PROBLEMA DE DENSIDADE DESTA SEÇÃO NÃO ESTÁ AQUI. São 17 palavras (≈2
  //    linhas no celular) contra as ~9 frases dos critérios, que é onde o peso
  //    mora — e o corte que valia a pena ali já foi feito, escondendo a segunda
  //    oração abaixo de 640px (ver `CriterioFiltro`). Cortar 3 palavras do olho
  //    valeria ~0 pixel: continuariam 2 linhas.
  //  · E ELA É A ÚNICA FRASE DA PÁGINA QUE JUSTIFICA O FILTRO PELO LADO DO
  //    LEITOR. O título acima dele diz "não é para todo mundo", que sozinho é
  //    porta na cara; esta linha explica que a porta existe para não tomar o
  //    tempo dele. É exatamente o tom aprovado em 05/08 — direto sem ser
  //    grosseiro — e é o que segura o comprador de touro na página até o convite
  //    do outro funil, no pé da seção. Encurtar aqui não deixa a página mais
  //    leve, deixa mais seca.
  lead: 'Preferimos te dizer agora do que tomar seu tempo numa reunião que não vai levar a nada.',

  simTitle: 'É para você se',
  sim: [
    // Sem `explicacao`: uma oração só. O "um dia" é a promessa da página
    // inteira (a marca própria) — não é explicação, é o critério.
    { criterio: 'Você quer criar Nelore PO registrado e, um dia, vender genética com o seu nome.' },
    { criterio: 'Você já tem fazenda e estrutura para criar — ou está montando agora, com projeto na cabeça.' },
    {
      criterio: 'Você tem inscrição estadual, ou está disposto a tirar.',
      explicacao: 'Sem ela não há como comprar em leilão.',
    },
    { criterio: 'Você quer alguém do lado para escolher o animal, montar o acasalamento e organizar a compra.' },
    { criterio: 'Você entende que criatório é projeto de anos, não de safra.' },
  ] as CriterioFiltro[],

  naoTitle: 'NÃO é para você se',
  nao: [
    // ⚠️ Este é o item que mais desqualifica — fêmea comercial foi a origem nº 1
    // do lead errado na rodada anterior. O critério (a frase que a pessoa usa
    // para se reconhecer) fica NO CELULAR; o que virou `explicacao` é a
    // justificativa institucional, que não muda o reconhecimento de ninguém.
    {
      criterio: 'Você procura fêmea de gado comercial, para cria ou engorda.',
      explicacao: 'A Bula não trabalha com fêmea comercial — só PO registrado.',
    },
    // Revisão João Antônio (05/08): a segunda oração era "e criatório sério não
    // começa por volume" e SAIU. O filtro aqui é expectativa de PREÇO, não
    // ambição de volume — existe (raro) o comprador que quer volume de matriz
    // cara, e a frase anterior dizia a ele que seu criatório não seria sério.
    // Não reintroduzir. A `explicacao` atual mantém o julgamento no preço.
    {
      criterio: 'Você quer dezenas de matrizes de uma vez a preço de comercial.',
      explicacao: 'Matriz PO não tem esse preço.',
    },
    {
      criterio: 'Você quer só uma tabela de preços.',
      explicacao: 'Aqui o preço depende do projeto, e o projeto a gente descobre conversando.',
    },
    {
      criterio: 'Você quer comprar hoje e receber amanhã sem falar com ninguém.',
      explicacao: 'Todo cadastro passa por análise antes de virar reunião.',
    },
  ] as CriterioFiltro[],

  // Saída digna para quem não é o público — e que aproveita o outro funil.
  // URL ABSOLUTA de propósito: no host femeas.* o path '/touros' não está na
  // allowlist do middleware, então um href relativo levaria a pessoa para um
  // 308 → '/' — ou seja, de volta para a mesma página. O perpétuo de touros
  // mora em host próprio (touros.bulaassessoria.com), e é para lá que se manda
  // quem procura touro.
  escape:
    'Procura touro para melhorar a vacada que você já tem? Esse é o nosso outro trabalho, e ele é bem mais rápido.',
  escapeCta: 'Ver a assessoria de touros',
  // ⚠️ COM UTM DESDE 06/08, e a razão é de argumento, não de tracking: o filtro
  // desta página é duro de propósito, e a ÚNICA coisa que justifica a dureza é
  // que quem sai por aqui não se perde — vai para o outro funil. Até hoje isso
  // era uma afirmação sem número: o link saía pelado e chegava no touros como
  // tráfego direto, indistinguível de quem digitou o endereço.
  //
  // Agora dá para responder "quantos leads de touro vieram do filtro de fêmeas
  // este mês?" — e essa resposta é o que diz se o filtro está desqualificando ou
  // só perdendo gente. Se vier zero por semanas, o problema não é o filtro: é a
  // saída, que ninguém está usando.
  escapeHref:
    'https://touros.bulaassessoria.com/?utm_source=femeas&utm_medium=escape&utm_campaign=filtro-para-quem',
}

// ─────────────────────────────────────────────────────────────────────────
// ⚠️ [JA] PROPOSTA DE CORTE — NÃO APLICADA. Quem aprova copy é o João Antônio;
// o que está aqui é o número, para a decisão ser tomada com ele na mão.
//
// Esta é a seção mais densa da página, e por larga margem: 270 palavras em
// 858px no celular = 315 palavras/1000px, contra 101 na jornada e 111 na
// assessoria. É também a única que NÃO pode receber foto (as seis categorias se
// distinguem pelo estágio do animal, e todo material existente é de lote em
// manejo — ilustrar aqui seria informação falsa numa seção que orienta compra).
// Na rodada de 06/08 ela ganhou peso visual pela escala tipográfica; o que
// sobra, se ainda parecer densa, é palavra.
//
// De onde vêm as 270 palavras, medido campo a campo:
//
//   ~103  os seis `resumo`     (_lib/categorias.ts)
//    ~90  os seis `paraQuem`   (_lib/categorias.ts)
//     32  o `lead` daqui
//     15  a `nota` daqui
//    ~30  títulos e nomes
//
// AS DUAS PROPOSTAS, em ordem de risco:
//
//  1. BAIXO RISCO — o `lead` termina em "e é isso que a reunião com o assessor
//     resolve" (10 palavras). A jornada já diz isso literalmente no passo 04
//     ("a partir daí te direciona para a categoria por onde faz sentido você
//     começar"), e o hero já promete reunião duas vezes. Cortar as 10 palavras
//     tira 3,7% da seção sem tirar informação que só exista aqui.
//
//  2. ALTO RISCO, E EU RECOMENDO NÃO FAZER — esconder os seis `paraQuem` no
//     celular, do jeito que a `explicacao` do filtro já é escondida. Valeria
//     90 palavras (-33%, de 315 para ~210 palavras/1000px), que é de longe o
//     maior corte disponível na página inteira. É por isso que está escrito
//     aqui, e não porque seja boa ideia: `paraQuem` é a linha que a pessoa
//     procura quando está tentando se encaixar em alguma das seis, ou seja, é
//     exatamente a função da seção. Escondê-la no celular deixa a seção mais
//     leve e sem serventia — e o celular é onde está o tráfego.
//
// Se for para cortar 90 palavras em algum lugar, o lugar barato é o `resumo`:
// cinco dos seis têm duas orações e a segunda repete o que o nome da categoria
// já diz ("Fêmea prenha: o próximo bezerro do seu criatório já vem a caminho na
// compra"). Isso é reescrita, não corte mecânico — precisa da mão do JA.
// ─────────────────────────────────────────────────────────────────────────
export const categoriasSecao = {
  eyebrow: 'CATEGORIAS',
  title: 'Por onde começar o seu plantel.',
  lead: 'Não existe uma porta única. A certa depende do que você já tem, de quanto tempo você pode esperar e do caixa disponível — e é isso que a reunião com o assessor resolve.',
  // As seis categorias vivem em _lib/categorias.ts (fonte única). Esta seção só
  // aporta o texto ao redor delas.
  nota: 'Todas as categorias podem ser parceladas em 30× no boleto, com frete grátis sob consulta.',
}

// `destaque` decide qual passo ganha peso visual — e a decisão mora AQUI, não no
// componente, por dois motivos. O primeiro é INV-5. O segundo é que a razão do
// destaque está escrita na própria copy: o `lead` diz "o terceiro é o que nos
// diferencia". Se um dia o time reordenar os passos, quem edita este arquivo
// move a flag junto com a frase; um `if (n === '03')` escondido no JSX ficaria
// para trás e destacaria o passo errado sem ninguém perceber.
export const jornada = {
  // A faixa de foto que ABRE esta seção. Ela não ilustra a jornada e não tem
  // legenda: é respiro, e o lugar dela foi escolhido com régua. Sem ela, quatro
  // seções seguidas (filtro → categorias → jornada → assessoria) somavam
  // ~4.700px de texto sem uma única âncora visual no celular; entrando aqui,
  // esse trecho vira dois de ~2.300px.
  //
  // ⚠️ NÃO ESCREVER LEGENDA DE VENDA embaixo dela, pela mesma razão da galeria:
  // é foto de lote em manejo, não de animal à venda. O `alt` descreve o que
  // está na foto, não o que a gente gostaria que estivesse.
  foto: {
    src: '/femeas/lote-close.webp',
    alt: 'Duas fêmeas Nelore de frente, no curral, em dia claro',
  },
  eyebrow: 'COMO FUNCIONA',
  title: 'Como funciona daqui até a sua primeira matriz.',
  lead: 'São quatro passos. O terceiro é o que nos diferencia: você não recebe um número de WhatsApp, você recebe uma reunião.',
  passos: [
    {
      n: '01',
      titulo: 'Você preenche o cadastro',
      texto:
        'É mais longo que o normal, de propósito. Pedimos os dados que permitem entender o seu projeto antes da conversa — inclusive documento e inscrição estadual, que são o que habilita a compra em leilão.',
      destaque: false,
    },
    {
      n: '02',
      titulo: 'Nossa equipe analisa',
      texto:
        'Uma pessoa de verdade lê o que você escreveu e faz um pré-diagnóstico do seu projeto. Não é automático, e nem todo cadastro é aprovado.',
      destaque: false,
    },
    {
      n: '03',
      titulo: 'Cadastro aprovado, reunião agendada',
      texto:
        'Você é chamado para uma reunião com um assessor Bula. Sem custo e sem compromisso de compra.',
      destaque: true,
    },
    {
      n: '04',
      titulo: 'Na reunião, o projeto toma forma',
      texto:
        'A gente entende a sua fazenda, o seu projeto e o seu orçamento — e a partir daí te direciona para a categoria por onde faz sentido você começar.',
      destaque: false,
    },
  ],
}

// O `id` de cada item NÃO é copy — é a chave que liga o item à marca gráfica
// desenhada em `_components/marcas.tsx`. Ele mora aqui, e não no JSX, pela mesma
// razão que a flag `destaque` da jornada mora aqui: reordenar ou reescrever a
// lista tem que levar o desenho junto. Se a chave fosse o `titulo`, bastaria o
// João Antônio trocar "Parte financeira" por "Financeiro" na revisão para a
// marca sumir — sem erro, sem aviso, e ninguém olharia o console.
//
// Trocar um `id` sem trocar a chave correspondente em `marcas.tsx` faz o item
// renderizar sem marca. Não quebra, mas fica um item pelado ao lado de três
// marcados, que lê como defeito.
export const assessoria = {
  eyebrow: 'A ASSESSORIA',
  title: 'O que vem junto, sem custo nenhum.',
  lead: 'A Bula não vende o animal e some. O acompanhamento é o serviço — e ele é de graça para quem compra com a gente.',
  itens: [
    {
      id: 'escolha-do-animal',
      titulo: 'Escolha do animal',
      texto:
        'Técnicos especializados ajudam a ler o catálogo, entender a genética e escolher a fêmea que serve ao seu projeto — não a mais cara nem a mais bonita.',
    },
    // ⚠️ [VALIDAR — ENTREGA, NÃO TEXTO] João Antônio (05/08) aprovou a promessa
    // e disse que "chama muita atenção", MAS levantou que ela precisa de
    // validação da equipe técnica antes do go-live: acasalamento bem feito
    // exige formação e ir ao curral, e é preciso confirmar que a Bula e as
    // assessorias vão sustentar esse atendimento no volume que a campanha
    // trouxer.
    //
    // O risco não é a copy estar errada — é ela estar CERTA e o serviço não
    // aparecer. Promessa forte que não se cumpre queima o assessor na reunião,
    // que é justamente o KPI do funil. Se o time decidir que não sustenta,
    // suavizar AQUI antes de subir; não deixar para descobrir depois.
    {
      id: 'acasalamento',
      titulo: 'Acasalamento',
      texto:
        'Definir com quem cruzar cada matriz é o que constrói (ou destrói) um plantel. Você não decide isso sozinho.',
    },
    {
      id: 'parte-financeira',
      titulo: 'Parte financeira',
      texto:
        'Parcelamento em 30× no boleto e o cadastro nas leiloeiras feito por nós, para habilitar a compra parcelada.',
    },
    {
      id: 'entrega',
      titulo: 'Entrega',
      texto:
        'Frete grátis sob consulta, como é a praxe do leilão. A gente confirma a entrega para a sua região antes da compra — não depois.',
    },
  ],
}

// ─────────────────────────────────────────────────────────────────────────
// PROVA SOCIAL — a faixa de logos de criatórios.
//
// ⚠️ SEM NÚMERO, e a ausência é a decisão. A prova social do /touros é
// "+1.000 touros PO apartados" (`src/app/touros/_lib/copy.ts`), e ela aqui é
// pior que fraca: fala do produto que esta página existe para NÃO vender, para
// um comprador que quer ver criatório formado, não animal apartado. Prova
// social própria deste funil é a pendência C-07 — enquanto ela não chega, a
// formulação é qualitativa e não estima nada.
//
// O que os logos provam sem número: são criatórios que EXISTEM, com nome no
// catálogo. É literalmente o que a página vende no hero ("crie a sua própria
// marca"), e é por isso que a faixa fecha o argumento em vez de só decorar.
// Quando C-07 fechar, o número entra AQUI — não no componente.
//
// ── REESCRITA EM 06/08 · pendente do JA ("quero melhorar o texto dos logos") ─
// A redação anterior, íntegra:
//
//   eyebrow: 'QUEM JÁ ESTÁ DO OUTRO LADO'
//   title:   'Criatórios que hoje vendem genética com o nome deles no catálogo.
//             Todos começaram menores do que são.'
//
// TRÊS DEFEITOS, em ordem de quanto custam:
//
//  1. O TEXTO NÃO DIZIA QUE OS LOGOS SÃO CLIENTES — e sem isso a faixa não
//     prova nada sobre a Bula, prova só que criatórios de Nelore existem, o que
//     ninguém duvida. A informação existia na página, mas só no `faixaLabel`,
//     que é `aria-label`: quem enxerga a tela nunca lê. É o defeito grave, e é
//     de PROVA, não de estilo — a seção chama-se prova social e a atribuição é
//     a prova. Agora ela está no eyebrow, visível.
//     ⚠️ Não é claim novo: é a mesma frase que já vai ao ar hoje para leitor de
//     tela ("atendidos pela Bula Assessoria"), passando para o texto visível.
//     Nenhum número entrou — C-07 continua aberta e nada aqui a antecipa.
//  2. O EYEBROW NARRAVA EM VEZ DE ROTULAR. "Quem já está do outro lado" pede
//     que a pessoa deduza qual é o outro lado (o de quem vende genética, não o
//     de quem compra) na primeira linha de uma seção nova, e "do outro lado"
//     ainda flerta com "do outro lado do balcão". Rótulo de seção é a primeira
//     coisa lida do bloco: ele tem que dizer O QUE ESTÁ ALI.
//  3. O TÍTULO ABRIA PELO FIM DA HISTÓRIA. 17 palavras em display centralizado
//     de até 34px, começando por um sintagma sem verbo ("Criatórios que hoje
//     vendem…") e terminando na frase curta que é o gancho. Invertido, a ordem
//     passa a ser a do leitor: ele está no começo, então a página começa pelo
//     começo — e o remate cai em "catálogo", que é palavra por palavra a
//     promessa do hero ("o seu nome no catálogo, um dia").
//
// São 17 → 13 palavras no título, mas o ponto aqui NÃO é o corte: é a
// atribuição que entrou. Se fosse só encurtar, bastava tirar "do que são".
//
// ⚠️ O COMPONENTE SÓ RENDERIZA ESTES TRÊS CAMPOS (eyebrow, title, faixaLabel).
// Não acrescentar um `lead` aqui esperando que ele apareça — não aparece, e o
// texto novo some sem erro nenhum.
//
// ALTERNATIVA, se o JA quiser preservar o enquadramento narrativo do eyebrow
// antigo — mas aí a atribuição volta a existir só para leitor de tela, que é o
// defeito nº 1:
//
//   eyebrow: 'QUEM JÁ ESTÁ DO OUTRO LADO'
//   title:   'Todos eles começaram pequenos.'
export const provaSocial = {
  eyebrow: 'CRIATÓRIOS ATENDIDOS PELA BULA',
  title: 'Todos eles começaram pequenos. Hoje vendem genética com o nome deles no catálogo.',
  // Rótulo da faixa para quem usa leitor de tela: sem ele, a lista de logos é
  // um monte de nome de fazenda solto no meio da página.
  //
  // MANTIDO PALAVRA POR PALAVRA mesmo agora que o eyebrow diz quase o mesmo. A
  // repetição para quem ouve a página é de duas palavras e custa um segundo; o
  // `aria-label` é o ÚNICO contexto que o leitor de tela tem antes de entrar
  // numa lista de dez nomes de fazenda, e ele precisa fechar sentido sozinho —
  // o eyebrow é um parágrafo fora do `role="group"`, então não há garantia de
  // que tenha sido lido antes.
  faixaLabel: 'Criatórios e fazendas atendidos pela Bula Assessoria',
}

export const fecho = {
  eyebrow: 'PARA FECHAR',
  title: 'Todo criatório de Nelore PO que existe hoje começou com alguém decidindo começar.',
  lead: 'Se o seu projeto é esse, preencha o cadastro. Se não for, obrigado por ter lido até aqui — e a porta dos touros continua aberta.',
  cta: 'Quero montar meu criatório',
  ctaNote: 'Cadastro analisado · Reunião com assessor se aprovado',
}

// Rodapé. Não é copy comercial, mas mora aqui pela mesma razão que `form.ui`:
// INV-5 diz "zero string em componente", e a marca ("Bula Assessoria") aparece
// como alt de imagem em dois lugares — hero e rodapé. Uma fonte só evita a
// divergência boba de um deles virar "Bula" num refactor.
export const rodape = {
  marca: 'Bula Assessoria',
  privacidade: 'Privacidade',
  termos: 'Termos',
  privacidadeHref: '/privacidade',
  termosHref: '/termos',
  direitos: 'Todos os direitos reservados.',
}

// ─────────────────────────────────────────────────────────────────────────
// GALERIA — as fotos do lote, sem legenda de venda.
//
// [JA] Texto novo, ainda não revisado pelo João Antônio.
//
// ⚠️ O texto aqui NÃO descreve as fotos nem promete o que elas mostram: são
// fotos de um lote em manejo, não de um animal à venda. Escrever "a matriz que
// vai começar o seu plantel" embaixo de uma foto de lote seria vender o que a
// imagem não entrega — e o público desta página nota antes de nós.
//
// Os `alt` moram aqui (INV-5) e descrevem o que está na foto, não o que a gente
// gostaria que estivesse.
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ A GALERIA PERDEU UMA FOTO EM 06/08 e a foto NÃO foi descartada: ela desceu
// para `jornada.foto`. A razão está medida no topo de _components/FaixaFoto.tsx
// — a página tinha toda a fotografia em dois pontos e ~4.700px de texto seguido
// depois deles. Duas fotos edge-to-edge cobrem mais área que as três antigas
// dentro do container, e a terceira passou a fazer o trabalho que faltava lá
// embaixo.
//
// A ESCOLHA DE QUAL FOTO DESCE FOI POR RESOLUÇÃO, não por gosto: a faixa da
// jornada é a única que ocupa a largura inteira de um monitor de 1440, e
// `lote-close` é o único arquivo com 1400px de largura (as outras duas têm
// 900). Nas duas células da galeria nenhuma passa de ~840px de largura, então
// os arquivos de 900 servem sem ampliação. Trocar as fotos de lugar sem olhar
// esse número devolve foto borrada no desktop.
export const galeria = {
  eyebrow: 'NO CURRAL',
  title: 'É disto que a gente está falando.',
  lead: 'Nelore PO em fazenda atendida pela Bula. Nenhuma foto de banco de imagens.',
  fotos: [
    {
      src: '/femeas/curral-lote.webp',
      alt: 'Lote de Nelore reunido no curral, visto de cima',
    },
    {
      src: '/femeas/curral-dourado.webp',
      alt: 'Lote de Nelore no curral ao entardecer, com peões a cavalo ao fundo',
    },
  ],
}

// ─────────────────────────────────────────────────────────────────────────
// FORMULÁRIO — os rótulos e, principalmente, os PORQUÊS.
//
// Cada campo de atrito vem com uma justificativa curta ao lado. Não é
// decoração: pedir CPF sem explicar derruba conversão de gente boa junto com a
// ruim. Explicar mantém o atrito para o curioso e o remove para quem é sério.
//
// [PENDENTE C-01] A lista final de campos é decisão do cliente. O que está
// aqui é a proposta; se algum campo cair, apagar daqui também.
// ─────────────────────────────────────────────────────────────────────────
export const form = {
  title: 'Cadastro para análise',
  lead: 'Leva uns minutos. Quanto mais claro for o seu projeto, melhor a reunião.',

  labels: {
    nome: 'Nome completo',
    whatsapp: 'WhatsApp',
    email: 'E-mail',
    cpf: 'CPF ou CNPJ',
    inscricaoEstadual: 'Você tem inscrição estadual?',
    uf: 'Estado',
    cidade: 'Cidade',
    momento: 'Em que momento você está?',
    rebanho: 'Quantas cabeças você tem hoje?',
    categoria: 'Por qual categoria você pensa em começar?',
    quantidade: 'Quantas matrizes pretende comprar agora?',
    projeto: 'Conte um pouco do seu projeto',
  },

  // Os quatro passos, na ordem em que o formulário pergunta. A ORDEM É O PONTO
  // e não é a do /touros: lá contato sobe para o passo 1 ("captura o dado de
  // lead o quanto antes", Formulario.tsx:73-74). Aqui projeto vem primeiro de
  // propósito — quem não se reconhece no passo 1 sai ANTES de virar lead, e sai
  // de graça. Inverter isto desfaz a página.
  passos: ['Seu projeto', 'Sua fazenda', 'Seus dados', 'Formalização'],

  // Consentimento de contato. É texto legal-comercial: mexer aqui muda o que a
  // pessoa autorizou, não só como soa.
  consent:
    'Autorizo a Bula Assessoria a entrar em contato comigo pelo WhatsApp sobre este cadastro.',

  // O texto pequeno sob cada campo sensível.
  porques: {
    cpf: 'É o documento que habilita a compra em leilão. Não consultamos crédito sem falar com você antes.',
    inscricaoEstadual: 'Sem IE não é possível comprar em leilão nem transportar o animal. Se você não tem, dá para resolver — marque "não" e a gente orienta.',
    rebanho: 'Serve para entendermos seu ponto de partida. Não existe número mínimo.',
    projeto: 'É o campo que mais pesa na análise. Escreva do seu jeito.',
  },

  momentos: [
    'Já crio PO e quero ampliar o plantel',
    'Tenho gado comercial e quero começar no PO',
    'Estou montando a fazenda agora',
    'Ainda estou estudando o assunto',
  ],

  // As duas listas abaixo são opções de select, e o texto delas é copy como
  // qualquer outro — mas com uma diferença que importa: o RÓTULO é o que fica
  // gravado na planilha, nas colunas "Cabeças" e "Qtd. desejada", que a equipe
  // já lê há meses com o vocabulário do formulário do Meta. Por isso as faixas
  // são exatamente as de lá (ver META_CABECAS/META_QTD em src/lib/jmp-sheets.ts)
  // e não faixas novas: inventar um terceiro vocabulário na mesma coluna é como
  // o relatório por faixa deixa de fechar.
  //
  // Reescrever uma destas linhas muda o valor gravado dos leads NOVOS e não
  // migra os antigos — mexer aqui é decisão de dado, não de texto.
  rebanhos: [
    'nenhuma',
    '1 a 50 cabeças',
    '51 a 100 cabeças',
    '101 a 300 cabeças',
    '301 a 500 cabeças',
    'mais de 500 cabeças',
  ],

  // "mais de 50 matrizes" existe de propósito, e não pode ser tirada da lista
  // para "filtrar melhor": é a faixa que a rodada anterior trouxe em massa
  // (gente querendo 50 a 70 cabeças a preço de comercial). Tirar a opção não
  // tira a pessoa — só esconde da equipe que ela chegou. Ver a régua em
  // _lib/qualificacao.ts, que trata essa faixa como sinal, não como recusa.
  quantidades: [
    '1 a 5 matrizes',
    '6 a 10 matrizes',
    '11 a 20 matrizes',
    '21 a 50 matrizes',
    'mais de 50 matrizes',
    'ainda não sei',
  ],

  submit: 'Enviar para análise',
  submitting: 'Enviando…',
  // [JA] Esta linha é o último filtro antes do clique. Está clara?
  submitNote: 'Você recebe nosso retorno pelo WhatsApp. Nem todo cadastro é aprovado para reunião.',

  placeholders: {
    nome: 'Seu nome',
    whatsapp: '(00) 00000-0000',
    email: 'voce@email.com',
    documento: 'CPF ou CNPJ',
    projeto:
      'Ex.: tenho 80 hectares em Goiás com gado comercial e quero começar um núcleo de PO para, daqui a alguns anos, produzir touro para vender.',
  },

  // Rótulos MECÂNICOS da interface (navegação, estados de carregamento). Não é
  // copy comercial, mas mora aqui pelo mesmo motivo: INV-5 diz "zero string em
  // componente", e abrir exceção para "só as pequenas" é como a lista do
  // /saogeraldo virou três listas.
  ui: {
    selecione: 'Selecione…',
    carregando: 'Carregando…',
    escolhaUf: 'Escolha o estado primeiro',
    opcional: '(opcional)',
    voltar: 'Voltar',
    continuar: 'Continuar',
    // "Passo 2 / 4" — o separador vive aqui para não virar string no JSX.
    passo: 'Passo',
    passoSep: '/',
    sigilo: 'Seus dados ficam só com a Bula.',
    // Fallback de quando o servidor cai sem devolver mensagem (rede fora, 502
    // do proxy). O caso normal é o formulário mostrar a mensagem do servidor.
    falhaEnvio: 'Não foi possível enviar o cadastro.',
    // Sufixo do erro de servidor. O texto do erro vem do servidor e é mostrado
    // como veio; esta linha só acrescenta a informação que o servidor não tem —
    // que nada foi perdido. NÃO repetir "tente novamente" aqui: as mensagens de
    // 500 da rota já terminam assim, e o resultado é a frase duplicada na tela.
    tenteNovamente: 'O que você digitou continua aqui.',
  },

  // Mensagens de validação do CLIENT. Espelham as do servidor
  // (src/app/api/femeas/lead/route.ts) de propósito: quando as duas divergem, o
  // lead passa no browser, é recusado no servidor e vê um texto que não bate com
  // o campo que ele preencheu.
  erros: {
    nome: 'Preencha seu nome completo.',
    whatsapp: 'Informe um WhatsApp válido com DDD.',
    email: 'Informe um e-mail válido.',
    uf: 'Selecione seu estado.',
    cabecas: 'Selecione quantas cabeças você tem hoje.',
    momento: 'Selecione em que momento você está.',
    categoria: 'Selecione por qual categoria pensa em começar.',
    quantidade: 'Selecione quantas matrizes pretende comprar.',
    projeto: 'Conte um pouco do seu projeto — é o que a nossa equipe lê antes da reunião.',
    documento: 'Informe um CPF ou CNPJ válido.',
    inscricaoEstadual: 'Informe se você tem inscrição estadual.',
    whatsappConsent: 'Autorize o contato via WhatsApp para continuar.',
  },
}

// ─────────────────────────────────────────────────────────────────────────
// PÁGINAS DE OBRIGADO — dois destinos.
//
// A separação não é cosmética: é ela que separa a conversão de valor alto da
// de valor baixo na tag do GTM (o veredito vem do servidor, INV-3). Mas
// atenção — nenhum dos dois textos pode dizer "aprovado", porque a aprovação
// de verdade é do SDR e ainda não aconteceu quando a pessoa chega aqui.
// ─────────────────────────────────────────────────────────────────────────
export const obrigado = {
  // Bloco COMUM às duas variantes.
  //
  // As duas descrevem a reunião (fazenda, projeto, orçamento) porque é isso que
  // reduz no-show depois — a pessoa chega sabendo do que se trata. O que muda
  // entre as variantes é a expectativa de FILA, nunca a promessa: com triagem
  // manual, quem decide se vira reunião é o SDR, e ele ainda não olhou.
  //
  // NÃO existe redirect para WhatsApp aqui, e não é esquecimento: o /touros tem
  // um (WhatsappRedirect.tsx) e copiá-lo tira o lead da página antes do
  // agendamento, que é o KPI deste funil. Também não há grupo de WhatsApp —
  // decidido que não.
  comum: {
    eyebrow: 'CADASTRO RECEBIDO',
    reuniaoTitle: 'O que a gente conversa na reunião',
    reuniao: [
      'A sua fazenda: onde fica, que estrutura você já tem e como é o seu manejo hoje.',
      'O seu projeto: onde você quer chegar com o criatório e em quanto tempo.',
      'O seu orçamento, em aberto — é ele que define por qual categoria faz sentido começar.',
    ],
    ressalva:
      'A conversa é sem custo e sem compromisso de compra. Se o seu projeto não for para agora, a gente também te diz.',
    prazoLabel: 'PRAZO DE CONTATO',
  },
  // ⚠️ Nenhuma das duas pode dizer "aprovado". A aprovação é do SDR e ainda não
  // aconteceu quando a pessoa chega aqui — prometer o que não se controla é o
  // caminho mais curto para queimar o assessor na reunião seguinte.
  mql: {
    title: 'Recebemos o seu cadastro.',
    lead: 'Seu perfil tem tudo a ver com o que a gente faz. Nossa equipe vai analisar o seu projeto e te chamar no WhatsApp para conversar sobre a reunião com um assessor.',
    // [VALIDAR] o prazo é pendência de cliente — ver semMarcacao(), que apaga a
    // marcação na renderização para ela nunca aparecer na tela do lead.
    prazo: '[VALIDAR] Em até 24 horas úteis.',
  },
  lead: {
    title: 'Recebemos o seu cadastro.',
    lead: 'Nossa equipe vai analisar o seu projeto e entrar em contato pelo WhatsApp.',
    // [VALIDAR] idem.
    prazo: '[VALIDAR] Em até 24 horas úteis.',
  },
} as const

/**
 * Apaga as marcações de revisão ([VALIDAR], [JA]) no momento de renderizar.
 *
 * Por que existe em vez de simplesmente tirar a marcação do texto: a marcação é
 * PENDÊNCIA DE CLIENTE e precisa continuar visível para quem lê este arquivo —
 * é o lembrete de que o prazo "24 horas úteis" ainda não foi confirmado. Tirar
 * do arquivo faria a pendência sumir do radar; deixar chegar à tela faria o lead
 * ler "[VALIDAR]" numa página de conversão. Esta função resolve os dois.
 */
export function semMarcacao(texto: string): string {
  return texto.replace(/\[(VALIDAR|JA)\]\s*/g, '').trim()
}
