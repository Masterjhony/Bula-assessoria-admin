#!/usr/bin/env node
// Parser do catálogo do Leilão Touros São Geraldo e 7P → lotes.json (um registro por lote).
//
// O PDF é vetorial, gerado no InDesign, sem tabelas marcadas. A ordem de leitura do texto
// não é confiável (as colunas do pedigree se intercalam), então tudo aqui é extraído por
// COORDENADA: as palavras vêm de `pdftotext -bbox-layout` e são reagrupadas por posição.
//
// Regra do projeto: nada é inventado. Campo que o PDF não traz sai como null e entra no
// relatório de pendências no fim da execução.
//
// Uso: node scripts/parse-catalogo-saogeraldo.mjs [caminho-do-pdf]
// Saída: .planning/leilao-sao-geraldo/lotes.json
//
// Requer: poppler (pdftotext).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const PDF = process.argv[2]
  || path.join(os.homedir(), 'Downloads', 'Leilão Touros São Geraldo e 7P (CAT VIRTUAL).pdf');
const DIR = path.join('.planning', 'leilao-sao-geraldo');
const PLAYLIST = path.join(DIR, 'playlist-lotes.txt');
const OUT = path.join(DIR, 'lotes.json');

const LARGURA_PAGINA = 623.622;
const MEIO = LARGURA_PAGINA / 2;

// ---------------------------------------------------------------- camada de texto

/** Palavras de todas as páginas, com bounding box, na resolução de pontos do PDF. */
function lerPalavras() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catsg-'));
  const xml = path.join(tmp, 'bbox.xml');
  execFileSync('pdftotext', ['-bbox-layout', PDF, xml]);
  const doc = fs.readFileSync(xml, 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });

  const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)<\/word>/g;
  return doc.split('<page ').slice(1).map((pagina) => {
    const palavras = [];
    for (const m of pagina.matchAll(re)) {
      const x0 = +m[1];
      const y0 = +m[2];
      const x1 = +m[3];
      const y1 = +m[4];
      palavras.push({
        x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: y1 - y0,
        t: m[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
      });
    }
    return palavras;
  });
}

/** Agrupa palavras em linhas por proximidade vertical. */
function emLinhas(palavras, tol = 3.5) {
  const ordenadas = [...palavras].sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
  const linhas = [];
  for (const p of ordenadas) {
    const ultima = linhas.at(-1);
    if (ultima && Math.abs(p.cy - ultima.cy) <= tol) {
      ultima.palavras.push(p);
      ultima.cy = (ultima.cy * (ultima.palavras.length - 1) + p.cy) / ultima.palavras.length;
    } else {
      linhas.push({ cy: p.cy, palavras: [p] });
    }
  }
  for (const l of linhas) {
    l.palavras.sort((a, b) => a.x0 - b.x0);
    l.texto = l.palavras.map((p) => p.t).join(' ');
    l.h = Math.max(...l.palavras.map((p) => p.h));
    l.x0 = Math.min(...l.palavras.map((p) => p.x0));
    l.x1 = Math.max(...l.palavras.map((p) => p.x1));
  }
  return linhas;
}

/** Quebra uma linha em blocos separados por um vão horizontal grande. */
function emGrupos(palavras, vao = 18) {
  const ordenadas = [...palavras].sort((a, b) => a.x0 - b.x0);
  const grupos = [];
  for (const p of ordenadas) {
    const ultimo = grupos.at(-1);
    if (ultimo && p.x0 - ultimo.x1 <= vao) {
      ultimo.palavras.push(p);
      ultimo.x1 = Math.max(ultimo.x1, p.x1);
    } else {
      grupos.push({ x0: p.x0, x1: p.x1, palavras: [p] });
    }
  }
  for (const g of grupos) {
    g.texto = g.palavras.map((p) => p.t).join(' ');
    g.cx = (g.x0 + g.x1) / 2;
    g.h = Math.max(...g.palavras.map((p) => p.h));
  }
  return grupos;
}

const numero = (s) => {
  if (s == null) return null;
  const limpo = String(s).trim().replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return null;
  return Number(limpo);
};

// ---------------------------------------------------- links de vídeo embutidos no PDF

/**
 * Anotações /Link de cada página. O catálogo embute um link de YouTube por lote no botão
 * "CLIQUE PARA VER O VÍDEO DO LOTE" — é uma fonte independente da playlist.
 */
function lerLinksPorPagina() {
  const buf = fs.readFileSync(PDF);
  const objs = new Map();

  for (const m of buf.toString('latin1').matchAll(/(\d+)\s+0\s+obj\r?\n?/g)) {
    const num = +m[1];
    const inicio = m.index + m[0].length;
    const fim = buf.indexOf('endobj', inicio);
    objs.set(num, buf.subarray(inicio, fim > 0 ? fim : inicio + 4000));
  }

  // objetos comprimidos dentro de object streams
  for (const corpo of [...objs.values()]) {
    const s = corpo.toString('latin1');
    if (!s.includes('/ObjStm')) continue;
    const mN = s.match(/\/N\s+(\d+)/);
    const mF = s.match(/\/First\s+(\d+)/);
    const posStream = s.indexOf('stream');
    if (!mN || !mF || posStream < 0) continue;
    let bruto;
    try {
      bruto = zlib.inflateSync(corpo.subarray(posStream + 6).subarray(
        corpo.subarray(posStream + 6).findIndex((b) => b !== 0x0d && b !== 0x0a),
      ));
    } catch { continue; }
    const N = +mN[1];
    const first = +mF[1];
    const cab = bruto.subarray(0, first).toString('latin1').trim().split(/\s+/).map(Number);
    for (let i = 0; i < N; i++) {
      const fim = i + 1 < N ? first + cab[2 * i + 3] : bruto.length;
      objs.set(cab[2 * i], bruto.subarray(first + cab[2 * i + 1], fim));
    }
  }

  const txt = (n) => (objs.get(n) ? objs.get(n).toString('latin1') : '');
  const catalogo = [...objs.keys()].find((n) => /\/Type\s*\/Catalog/.test(txt(n)));
  const raiz = +txt(catalogo).match(/\/Pages\s+(\d+)\s+0\s+R/)[1];

  const achatar = (n) => {
    const s = txt(n);
    const kids = s.match(/\/Kids\s*\[([\s\S]*?)\]/);
    if (kids && /\/Type\s*\/Pages/.test(s)) {
      return [...kids[1].matchAll(/(\d+)\s+0\s+R/g)].flatMap((k) => achatar(+k[1]));
    }
    return [n];
  };

  const porPagina = {};
  achatar(raiz).forEach((objPagina, i) => {
    const s = txt(objPagina);
    let lista = s.match(/\/Annots\s*\[([\s\S]*?)\]/);
    if (!lista) {
      const ref = s.match(/\/Annots\s+(\d+)\s+0\s+R/);
      if (ref) lista = txt(+ref[1]).match(/\[([\s\S]*?)\]/);
    }
    if (!lista) return;
    for (const m of lista[1].matchAll(/(\d+)\s+0\s+R/g)) {
      const anot = txt(+m[1]);
      const acao = anot.match(/\/A\s+(\d+)\s+0\s+R/);
      const uri = (acao ? txt(+acao[1]) : anot).match(/\/URI\s*\(([^)]*)\)/);
      if (uri) (porPagina[i + 1] ||= []).push(uri[1]);
    }
  });
  return porPagina;
}

const idDoVideo = (url) => url?.match(/[?&]v=([\w-]{11})/)?.[1] ?? null;

// ------------------------------------------------------------------- playlist

function lerPlaylist() {
  if (!fs.existsSync(PLAYLIST)) return { porLote: new Map(), linhas: [] };
  const linhas = fs.readFileSync(PLAYLIST, 'utf8').split('\n').filter((l) => l.trim());
  const porLote = new Map();
  const foraDoPadrao = [];
  for (const linha of linhas) {
    const [indice, videoId, ...resto] = linha.split('|');
    const titulo = resto.join('|').trim();
    const m = titulo.match(/^LOTE\s+(\d+)$/i);
    if (!m) { foraDoPadrao.push(linha); continue; }
    porLote.set(String(Number(m[1])), { videoId: videoId.trim(), indice: Number(indice), titulo });
  }
  return { porLote, linhas, foraDoPadrao };
}

// ------------------------------------------------------------ extração de um animal

// "A?VÓ" porque em algumas páginas a própria camada de texto do PDF perde o "A" de "AVÓ"
// (defeito da fonte no arquivo de origem — visualmente o selo está correto). Quando isso
// acontece o texto bruto fica registrado no campo `texto` e um aviso é emitido.
const RE_SELO_CORPO = /(MÃE\s+e\s+A?VÓ|MÃE|A?VÓ)\s+de\s+TOURO\s+DE\s+CENTRAL/i;

/**
 * Selos "de TOURO DE CENTRAL" — os únicos selos do catálogo com texto de verdade na camada
 * de texto (os demais, DOADORA / SUPER PRECOCE, são arte vetorial e não são extraíveis).
 *
 * Cada selo é uma pílula de 3 linhas empilhadas, por exemplo:
 *     AVÓ PATERNA  /  MÃE e AVÓ de  /  TOURO DE CENTRAL
 *
 * Podem existir várias pílulas lado a lado. Cada uma é ancorada na sua própria linha
 * "TOURO ... CENTRAL", que é a mais larga: as outras duas linhas cabem dentro dessa faixa
 * horizontal. Ancorar assim evita tanto embaralhar a frase quanto encadear pílulas vizinhas
 * (ou a moldura da página) num amontoado só.
 */
function extrairSelos(palavras, ref, avisos) {
  const linhas = emLinhas(palavras);
  const selos = [];

  for (const linha of linhas) {
    // várias pílulas podem dividir a mesma linha: cada "TOURO" abre uma, o "CENTRAL"
    // seguinte a fecha
    for (let i = 0; i < linha.palavras.length; i++) {
      if (linha.palavras[i].t !== 'TOURO') continue;
      const iCentral = linha.palavras.findIndex((p, j) => j > i && p.t === 'CENTRAL');
      if (iCentral < 0) continue;

      const faixaX0 = linha.palavras[i].x0 - 6;
      const faixaX1 = linha.palavras[iCentral].x1 + 6;
      // sobreposição, não centro: as linhas de cima da pílula extrapolam um pouco a faixa
      const daPilula = palavras.filter((p) => {
        if (p.cy > linha.cy + 4 || p.cy < linha.cy - 40) return false;
        const cobertura = Math.min(p.x1, faixaX1) - Math.max(p.x0, faixaX0);
        return cobertura > 0 && cobertura / (p.x1 - p.x0) > 0.5;
      });

      const texto = emLinhas(daPilula)
        .map((l) => l.texto)
        .join(' ')
        .replace(/M\s+Ã\s+E/g, 'MÃE')
        .replace(/\s+/g, ' ')
        .trim();

      const corpo = texto.match(RE_SELO_CORPO);
      if (!corpo) {
        avisos.push(`${ref}: pílula "TOURO DE CENTRAL" não interpretada — "${texto}"`);
        continue;
      }
      if (/(^|\s)VÓ\s+de/i.test(texto)) {
        avisos.push(`${ref}: camada de texto do PDF perdeu o "A" de "AVÓ" no selo — lido como AVÓ ("${texto}")`);
      }
      const parente = /AVÓ\s+PATERNA/i.test(texto) ? 'AVO_PATERNA'
        : /AVÓ\s+MATERNA/i.test(texto) ? 'AVO_MATERNA'
          : /MÃE/i.test(texto) ? 'MAE' : null;
      const relacao = corpo[1].toUpperCase().replace(/\s+/g, '_')
        .replace('MÃE', 'MAE').replace(/A?VÓ/, 'AVO');
      selos.push({ parente, relacao, texto });
    }
  }
  return selos;
}

/**
 * Pedigree. Cada lado (paterno à esquerda, materno à direita) é uma pilha de linhas;
 * a linha de fonte maior é o pai/mãe e ancora as demais.
 *   3 gerações (lote individual): [bisavô, avô, bisavó, PAI, bisavô, avó, bisavó]
 *   2 gerações (megalote):        [avô, PAI, avó]
 */
function extrairPedigree(palavras) {
  const lados = { paterno: [], materno: [] };
  for (const linha of emLinhas(palavras)) {
    for (const g of emGrupos(linha.palavras)) {
      lados[g.cx < MEIO ? 'paterno' : 'materno'].push({ texto: g.texto, h: g.h, cy: linha.cy });
    }
  }

  const montar = (linhas) => {
    if (!linhas.length) return { arvore: null, aviso: 'pedigree vazio' };
    linhas.sort((a, b) => a.cy - b.cy);
    // o nome do pai/mãe pode quebrar em duas linhas: junta as linhas grandes vizinhas
    const alturaMax = Math.max(...linhas.map((l) => l.h));
    const juntas = [];
    for (const l of linhas) {
      const ultima = juntas.at(-1);
      const grande = l.h >= alturaMax - 2;
      if (ultima && grande && ultima.grande) {
        ultima.texto += ` ${l.texto}`;
      } else {
        juntas.push({ ...l, grande });
      }
    }
    const p = juntas.findIndex((l) => l.grande);
    const nome = (i) => (juntas[i] ? juntas[i].texto : null);

    if (juntas.length === 7 && p === 3) {
      return {
        arvore: {
          nome: nome(3),
          pai: { nome: nome(1), pai: { nome: nome(0) }, mae: { nome: nome(2) } },
          mae: { nome: nome(5), pai: { nome: nome(4) }, mae: { nome: nome(6) } },
        },
      };
    }
    if (juntas.length === 3 && p === 1) {
      return { arvore: { nome: nome(1), pai: { nome: nome(0) }, mae: { nome: nome(2) } } };
    }
    return {
      arvore: { nome: nome(p) },
      aviso: `formato de pedigree inesperado (${juntas.length} linhas, pai/mãe no índice ${p})`,
      linhasBrutas: juntas.map((l) => l.texto),
    };
  };

  const pat = montar(lados.paterno);
  const mat = montar(lados.materno);
  return {
    pedigree: { pai: pat.arvore, mae: mat.arvore },
    avisos: [pat.aviso, mat.aviso].filter(Boolean),
    brutos: (pat.linhasBrutas || mat.linhasBrutas)
      ? { paterno: pat.linhasBrutas, materno: mat.linhasBrutas } : undefined,
  };
}

const BLOCOS_INDICE = [
  { chave: 'dep_top', ancora: 'IQG' },
  { chave: 'iabcz_deca', ancora: 'iABCZ' },
  { chave: 'mgte_top', ancora: 'MGTe' },
];
const RE_ROTULO_LINHA = /^(DEP|TOP%|DECA|P%)$/;

/** As três tabelas de índices. Cada valor é casado à coluna pelo centro horizontal. */
function extrairIndices(palavras, avisos, ref) {
  const linhas = emLinhas(palavras);
  const indices = {};

  for (const { chave, ancora } of BLOCOS_INDICE) {
    const iCab = linhas.findIndex((l) => l.palavras.some((p) => p.t === ancora));
    if (iCab < 0) { avisos.push(`${ref}: tabela ${ancora} não encontrada`); continue; }

    const colunas = linhas[iCab].palavras.filter((p) => p.x0 > 55);
    const tabela = {};
    for (const c of colunas) tabela[c.t] = {};

    for (let i = iCab + 1; i < linhas.length; i++) {
      const linha = linhas[i];
      const rotulo = linha.palavras[0];
      if (!RE_ROTULO_LINHA.test(rotulo.t)) break; // acabou a tabela
      const nomeLinha = rotulo.t.replace('%', '');
      for (const p of linha.palavras.slice(1)) {
        let melhor = null;
        let menor = Infinity;
        for (const c of colunas) {
          const d = Math.abs(p.cx - c.cx);
          if (d < menor) { menor = d; melhor = c; }
        }
        if (melhor) tabela[melhor.t][nomeLinha] = p.t === '-' ? null : numero(p.t);
      }
    }
    const linhasLidas = new Set(Object.values(tabela).flatMap((c) => Object.keys(c)));
    if (!linhasLidas.size) avisos.push(`${ref}: tabela ${ancora} sem valores`);
    indices[chave] = tabela;
  }
  return indices;
}

/** Um animal: nome, RG, nascimento, peso/CE, selos, pedigree e índices. */
function extrairAnimal(palavras, yTopo, yFim, ref, avisos) {
  const doBloco = palavras.filter((p) => p.cy >= yTopo && p.cy < yFim);
  const linhasBloco = emLinhas(doBloco);
  const iRg = linhasBloco.findIndex((l) => l.palavras.some((p) => /^RG:/.test(p.t)));
  if (iRg < 0) return null;
  const linhaRg = linhasBloco[iRg];

  const textoRg = linhaRg.texto.replace(/\s+/g, ' ');
  const rg = textoRg.match(/RG:\s*([A-Z0-9]+\s+[\w-]+)/)?.[1]?.replace(/\s+/g, ' ') ?? null;
  if (!rg) avisos.push(`${ref}: RG não reconhecido em "${textoRg}"`);

  // nome: a linha de maior fonte acima do RG (ignorando cabeçalho e número do lote)
  const acima = emLinhas(doBloco.filter((p) => p.cy < linhaRg.cy && p.cy > Math.max(yTopo, 170)));
  const alturaMax = acima.length ? Math.max(...acima.map((l) => l.h)) : 0;
  const linhasNome = acima.filter((l) => l.h >= alturaMax - 2);
  const nome = linhasNome.map((l) => l.texto).join(' ').trim() || null;
  if (!nome) avisos.push(`${ref}: nome do animal não encontrado`);

  // nascimento / idade / sexo: na mesma linha do RG (megalote) ou na linha logo abaixo
  // (lote individual). Só a linha imediatamente seguinte — a próxima já é o pedigree.
  const proxima = linhasBloco[iRg + 1];
  const linhaNasc = /NASC/.test(textoRg) ? null
    : (proxima && /NASC/.test(proxima.texto) ? proxima : null);
  const textoNasc = [textoRg, linhaNasc?.texto ?? ''].join(' ').replace(/\s+/g, ' ');
  const nascimento = textoNasc.match(/NASC\.?:?\s*(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null;
  const mIdade = textoNasc.match(/\((\d+)\s*MESES?\)/i);
  const idadeMeses = mIdade ? Number(mIdade[1]) : null;
  const sexo = /\bMACHO\b/.test(textoNasc) ? 'MACHO' : /\bFÊMEA|\bFEMEA\b/.test(textoNasc) ? 'FEMEA' : null;
  if (!nascimento) avisos.push(`${ref}: data de nascimento não encontrada`);
  if (idadeMeses === null) avisos.push(`${ref}: idade em meses ausente no catálogo`);
  if (!sexo) avisos.push(`${ref}: sexo não encontrado`);

  const textoBloco = doBloco.map((p) => p.t).join(' ').replace(/\s+/g, ' ');
  const pesoKg = numero(textoBloco.match(/Peso:\s*([\d.,]+)\s*kg/i)?.[1]);
  const ceCm = numero(textoBloco.match(/CE:\s*([\d.,]+)\s*cm/i)?.[1]);

  const yNome = linhasNome.length ? Math.min(...linhasNome.map((l) => l.cy)) : linhaRg.cy;
  const selos = extrairSelos(doBloco.filter((p) => p.cy < yNome - 5 && p.cy > yTopo), ref, avisos);

  const yFimNasc = linhaNasc ? linhaNasc.cy : linhaRg.cy;
  // Lote de aspiração: no lugar do Peso/CE aparece a condição de acasalamento.
  const linhaAcasalamento = linhasBloco.find((l) => l.cy > linhaRg.cy
    && /^LIVRE\s+ACASALAMENTO$/i.test(l.texto.trim()));
  const acasalamento = linhaAcasalamento ? 'LIVRE ACASALAMENTO' : null;

  // o pedigree vai do fim da linha de nascimento até o que vier antes: a linha de Peso/CE
  // (fonte ainda maior que a do pai), a de acasalamento, ou o cabeçalho da primeira tabela
  const ancoraPeso = doBloco.find((p) => /^Peso:/.test(p.t));
  const ancoraTabela = doBloco.find((p) => p.t === 'IQG');
  const yTabelas = Math.min(ancoraPeso ? ancoraPeso.cy : Infinity,
    linhaAcasalamento ? linhaAcasalamento.cy : Infinity,
    ancoraTabela ? ancoraTabela.cy : Infinity, yFim);
  const palavrasPedigree = doBloco.filter((p) => p.cy > yFimNasc + 5 && p.cy < yTabelas - 8);
  const { pedigree, avisos: avisosPed, brutos } = extrairPedigree(palavrasPedigree);
  for (const a of avisosPed) avisos.push(`${ref}: ${a}`);

  const indices = extrairIndices(doBloco.filter((p) => p.cy >= yTabelas - 8), avisos, ref);

  return {
    nome,
    rg,
    nascimento,
    idadeMeses,
    sexo,
    pesoKg,
    ceCm,
    acasalamento,
    selosTouroDeCentral: selos,
    pedigree,
    pedigreeBruto: brutos,
    indices,
  };
}

// ------------------------------------------------------------------------ execução

const paginas = lerPalavras();
const links = lerLinksPorPagina();
const playlist = lerPlaylist();
const avisos = [];
const lotes = [];

for (let n = 1; n <= paginas.length; n++) {
  const palavras = paginas[n - 1];
  const marcador = palavras.find((p) => p.h > 50 && p.y0 < 45);
  if (!marcador) continue; // capa, mapa, contracapa

  const codigo = marcador.t;
  const cabecalho = emLinhas(palavras.filter((p) => p.y0 < 20)).map((l) => l.texto).join(' ');
  const tipo = /MEGALOTE/i.test(cabecalho) || /^M\d+$/i.test(codigo) ? 'MEGALOTE'
    : /ASPI/i.test(cabecalho) ? 'ASPIRACAO' : 'INDIVIDUAL';

  // percentual à venda: selo "NN% À VENDA" no canto superior esquerdo
  const seloVenda = emLinhas(palavras.filter((p) => p.x1 < 110 && p.y0 > 100 && p.y0 < 175));
  const textoVenda = seloVenda.map((l) => l.texto).join(' ').replace(/\s+/g, ' ');
  const percentualAVenda = /VENDA/i.test(textoVenda) ? numero(textoVenda.match(/(\d+)\s*%/)?.[1]) : null;

  const ref = `lote ${codigo} (pág. ${n})`;
  const ancorasRg = emLinhas(palavras).filter((l) => l.palavras.some((p) => /^RG:/.test(p.t)));
  if (!ancorasRg.length) { avisos.push(`${ref}: nenhum registro de animal encontrado`); continue; }

  // Fronteira entre animais de um megalote: acima do nome do próximo (que fica ~30-45pt
  // acima do RG dele) e abaixo da última tabela do anterior. O meio-termo simples entre
  // dois RGs não serve — quase todo o conteúdo do animal fica ABAIXO do RG dele.
  const mgte = emLinhas(palavras).filter((l) => l.palavras.some((p) => p.t === 'MGTe'));
  const fronteira = (i) => {
    const proximoRg = ancorasRg[i + 1].cy - 90;
    const ultimaTabela = mgte.filter((l) => l.cy < ancorasRg[i + 1].cy).at(-1);
    return ultimaTabela ? Math.max(proximoRg, ultimaTabela.cy + 45) : proximoRg;
  };

  const animais = [];
  for (let i = 0; i < ancorasRg.length; i++) {
    const yTopo = i === 0 ? 0 : fronteira(i - 1);
    const yFim = i === ancorasRg.length - 1 ? 1e9 : fronteira(i);
    const rotulo = ancorasRg.length > 1 ? `${ref} animal ${i + 1}` : ref;
    const animal = extrairAnimal(palavras, yTopo, yFim, rotulo, avisos);
    if (animal) animais.push(animal);
  }

  const numeroLote = /^\d+$/.test(codigo) ? String(Number(codigo)) : null;
  const daPlaylist = numeroLote ? playlist.porLote.get(numeroLote) : null;
  const doCatalogo = idDoVideo(links[n]?.[0]);

  lotes.push({
    lote: codigo,
    loteNumero: numeroLote ? Number(numeroLote) : null,
    tipo,
    pagina: n,
    vendedor: 'Fazenda São Geraldo / 7P Agro',
    percentualAVenda,
    videoId: daPlaylist?.videoId ?? null,
    videoIdCatalogo: doCatalogo,
    animais,
  });
}

// ---------------------------------------------------------------- conferências

const codigos = lotes.map((l) => l.lote);
const duplicados = codigos.filter((c, i) => codigos.indexOf(c) !== i);
if (duplicados.length) avisos.push(`códigos de lote duplicados: ${[...new Set(duplicados)].join(', ')}`);

const numerados = lotes.filter((l) => l.loteNumero !== null && l.loteNumero < 1000)
  .map((l) => l.loteNumero).sort((a, b) => a - b);
const faltando = [];
for (let i = numerados[0]; i <= numerados.at(-1); i++) if (!numerados.includes(i)) faltando.push(i);
if (faltando.length) avisos.push(`lotes ausentes na numeração do PDF: ${faltando.join(', ')}`);

const semVideo = lotes.filter((l) => !l.videoId).map((l) => l.lote);
const naPlaylistSemLote = [...playlist.porLote.entries()]
  .filter(([num]) => !lotes.some((l) => String(l.loteNumero) === num))
  .map(([num, v]) => `LOTE ${num} (${v.videoId})`);
if (naPlaylistSemLote.length) {
  avisos.push(`vídeos na playlist sem lote correspondente no PDF: ${naPlaylistSemLote.join(', ')}`);
}
if (playlist.foraDoPadrao?.length) {
  avisos.push(`linhas da playlist fora do padrão "LOTE N": ${playlist.foraDoPadrao.length}`);
}

// a playlist e o link embutido no PDF são fontes independentes: divergência importa
const divergencias = lotes
  .filter((l) => l.videoId && l.videoIdCatalogo && l.videoId !== l.videoIdCatalogo)
  .map((l) => `${l.lote}: playlist=${l.videoId} catálogo=${l.videoIdCatalogo}`);
if (divergencias.length) avisos.push(`videoId divergente entre playlist e PDF: ${divergencias.join(' | ')}`);

const soNoCatalogo = lotes.filter((l) => !l.videoId && l.videoIdCatalogo).map((l) => l.lote);

const totalAnimais = lotes.reduce((s, l) => s + l.animais.length, 0);
const camposFaltando = {};
for (const lote of lotes) {
  for (const a of lote.animais) {
    for (const [campo, valor] of Object.entries({
      nome: a.nome, rg: a.rg, nascimento: a.nascimento, idadeMeses: a.idadeMeses,
      sexo: a.sexo, pesoKg: a.pesoKg, ceCm: a.ceCm,
    })) {
      if (valor === null || valor === undefined) (camposFaltando[campo] ||= []).push(lote.lote);
    }
  }
}

const saida = {
  fonte: {
    pdf: path.basename(PDF),
    paginas: paginas.length,
    playlist: fs.existsSync(PLAYLIST) ? path.basename(PLAYLIST) : null,
    geradoPor: 'scripts/parse-catalogo-saogeraldo.mjs',
  },
  resumo: {
    lotes: lotes.length,
    animais: totalAnimais,
    porTipo: lotes.reduce((acc, l) => ({ ...acc, [l.tipo]: (acc[l.tipo] || 0) + 1 }), {}),
    comVideoIdDaPlaylist: lotes.filter((l) => l.videoId).length,
    comVideoIdNoCatalogo: lotes.filter((l) => l.videoIdCatalogo).length,
    semVideoId: semVideo.length,
  },
  lotes,
  pendencias: { avisos, semVideoId: semVideo, videoSoNoCatalogo: soNoCatalogo, camposFaltando },
};

fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(saida, null, 2)}\n`);

console.log(`lotes: ${saida.resumo.lotes}  animais: ${totalAnimais}  ${JSON.stringify(saida.resumo.porTipo)}`);
console.log(`videoId (playlist): ${saida.resumo.comVideoIdDaPlaylist}   sem videoId: ${semVideo.length}`);
console.log(`videoId embutido no PDF: ${saida.resumo.comVideoIdNoCatalogo}   só no PDF: ${soNoCatalogo.length}`);
for (const [campo, lista] of Object.entries(camposFaltando)) {
  console.log(`campo ausente "${campo}": ${lista.length} — ${lista.slice(0, 12).join(', ')}${lista.length > 12 ? '…' : ''}`);
}
if (avisos.length) {
  console.log(`\navisos (${avisos.length}):`);
  for (const a of avisos.slice(0, 40)) console.log(`  - ${a}`);
  if (avisos.length > 40) console.log(`  … mais ${avisos.length - 40}`);
}
console.log(`\n→ ${OUT}`);
