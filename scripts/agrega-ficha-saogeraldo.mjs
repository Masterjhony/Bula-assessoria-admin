#!/usr/bin/env node
// Agrega .planning/leilao-sao-geraldo/lotes.json → src/app/saogeraldo/_lib/ficha.ts
//
// Por que existe: a landing precisa dos NÚMEROS do rebanho, não do rebanho. Um
// `import` do lotes.json arrastaria 766 KB para o bundle de uma landing de
// tráfego pago (PLANO-REDESIGN §2.4). Então o JSON é lido aqui, em build-time,
// e o resultado sai como um módulo TS congelado (~700 bytes) versionado no git.
//
// A disciplina que torna o número publicável sem validação do cliente:
// TODO agregado carrega o próprio denominador. Animal sem o dado no catálogo
// reduz o denominador — nunca entra no numerador, nunca é estimado.
//
// Uso:
//   node scripts/agrega-ficha-saogeraldo.mjs           regrava ficha.ts e relata
//   node scripts/agrega-ficha-saogeraldo.mjs --check   exit≠0 se o commitado divergir
//
// Sem `geradoEm` de propósito: o --check tem que ser determinístico para virar
// portão de CI.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Caminhos resolvidos a partir do arquivo, nunca do cwd — o script roda de
// qualquer diretório (CI, hook de commit, outro terminal).
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONTE = path.join(RAIZ, '.planning', 'leilao-sao-geraldo', 'lotes.json');
const SAIDA = path.join(RAIZ, 'src', 'app', 'saogeraldo', '_lib', 'ficha.ts');
const LIMITE_BYTES = 1024;

const checando = process.argv.includes('--check');
const avisos = [];

// ------------------------------------------------------------------ medidas

const tem = (v) => v !== null && v !== undefined;

/**
 * Mediana pela convenção do PLANO-REDESIGN §7.1: em n par, o valor de cima.
 * Quando os dois centrais divergem a mediana é ambígua e isso é reportado —
 * um número de vitrine não pode depender de um desempate silencioso.
 */
function mediana(valores, rotulo) {
  const a = [...valores].sort((x, y) => x - y);
  const alto = a[Math.floor(a.length / 2)];
  if (a.length % 2 === 0) {
    const baixo = a[a.length / 2 - 1];
    if (baixo !== alto) {
      avisos.push(`mediana de ${rotulo} é ambígua (${baixo} e ${alto}); publicado ${alto} (§7.1)`);
    }
  }
  return alto;
}

/**
 * Faixa de idade DERIVADA do dado, não arbitrada: parte da mediana e cresce
 * enquanto o mês vizinho existir na base. Os fora-da-faixa ficam de fora por
 * descontinuidade medida, não por escolha de quem escreveu o script.
 */
function faixaContigua(valores, centro) {
  const meses = new Set(valores);
  let min = centro;
  let max = centro;
  while (meses.has(min - 1)) min -= 1;
  while (meses.has(max + 1)) max += 1;
  return { min, max };
}

function agrega(dados) {
  const lotes = dados.lotes;
  const animais = lotes.flatMap((l) => l.animais.map((a) => ({ ...a, _lote: l.lote })));

  const idades = animais.map((a) => a.idadeMeses).filter(tem);
  const ces = animais.map((a) => a.ceCm).filter(tem);
  const pesos = animais.map((a) => a.pesoKg).filter(tem);

  const idadeMediana = mediana(idades, 'idade');
  const { min: idadeMin, max: idadeMax } = faixaContigua(idades, idadeMediana);
  const naFaixa = idades.filter((x) => x >= idadeMin && x <= idadeMax).length;

  // IQG e iABCZ: o denominador é quem TEM o índice publicado no catálogo, não o
  // total de animais. Os lotes 32 e 92 trazem "***" na tabela DEP/TOP% inteira
  // (conferido em catalogo-raw.txt) — o PDF não publica, então não contam.
  const iqgTop = animais.map((a) => a.indices?.dep_top?.IQG?.TOP).filter(tem);
  const decas = animais.map((a) => a.indices?.iabcz_deca?.iABCZ?.DECA).filter(tem);

  const comSelo = animais.filter((a) => (a.selosTouroDeCentral || []).length > 0);
  const pais = new Set(animais.map((a) => a.pedigree?.pai?.nome).filter(Boolean));

  for (const [campo, faltando] of Object.entries({
    idadeMeses: animais.length - idades.length,
    ceCm: animais.length - ces.length,
    pesoKg: animais.length - pesos.length,
    'IQG TOP%': animais.length - iqgTop.length,
    'iABCZ DECA': animais.length - decas.length,
  })) {
    if (faltando > 0) avisos.push(`${faltando} de ${animais.length} animais sem ${campo}`);
  }

  return {
    lotes: lotes.length,
    animais: animais.length,
    idade: {
      comDado: idades.length,
      naFaixa,
      min: idadeMin,
      max: idadeMax,
      mediana: idadeMediana,
    },
    ce: {
      comDado: ces.length,
      mediana: mediana(ces, 'CE'),
      acima34: ces.filter((x) => x >= 34).length,
      min: Math.min(...ces),
      max: Math.max(...ces),
    },
    peso: {
      comDado: pesos.length,
      mediana: mediana(pesos, 'peso'),
      min: Math.min(...pesos),
      max: Math.max(...pesos),
    },
    iqg: {
      avaliados: iqgTop.length,
      top5: iqgTop.filter((t) => t <= 5).length,
      top1: iqgTop.filter((t) => t <= 1).length,
    },
    iabcz: { avaliados: decas.length, deca1: decas.filter((d) => d === 1).length },
    selos: { lotes: new Set(comSelo.map((a) => a._lote)).size, animais: comSelo.length },
    pais: { distintos: pais.size },
  };
}

// ------------------------------------------------------------------ módulo TS

const grupo = (nome, obj) => `  ${nome}: { ${Object.entries(obj)
  .map(([k, v]) => `${k}: ${v}`)
  .join(', ')} },`;

function moduloTs(f, hash) {
  return `// ARQUIVO GERADO — não edite à mão. Fonte: catálogo oficial do leilão
// (sha256 ${hash}). Regerar/conferir: node scripts/agrega-ficha-saogeraldo.mjs [--check].
// Todo número carrega denominador: animal sem o dado no catálogo reduz o
// denominador, nunca entra no numerador. Ao exibir, cite o denominador.

export const FICHA = {
  fonteHash: '${hash}',
  lotes: ${f.lotes},
  animais: ${f.animais},
${grupo('idade', f.idade)}
${grupo('ce', f.ce)}
${grupo('peso', f.peso)}
${grupo('iqg', f.iqg)}
${grupo('iabcz', f.iabcz)}
${grupo('selos', f.selos)}
${grupo('pais', f.pais)}
} as const;
`;
}

// ------------------------------------------------------------------ execução

if (!fs.existsSync(FONTE)) {
  console.error(`fonte não encontrada: ${FONTE}`);
  process.exit(1);
}

const bruto = fs.readFileSync(FONTE);
const hash = crypto.createHash('sha256').update(bruto).digest('hex').slice(0, 8);
const ficha = agrega(JSON.parse(bruto));
const texto = moduloTs(ficha, hash);

if (Buffer.byteLength(texto) >= LIMITE_BYTES) {
  console.error(`ficha.ts ficaria com ${Buffer.byteLength(texto)} bytes (teto ${LIMITE_BYTES}).`);
  process.exit(1);
}

const relativo = path.relative(RAIZ, SAIDA);

if (checando) {
  const atual = fs.existsSync(SAIDA) ? fs.readFileSync(SAIDA, 'utf8') : null;
  if (atual === texto) {
    console.log(`ok — ${relativo} bate com lotes.json (sha256 ${hash})`);
    process.exit(0);
  }
  console.error(atual === null
    ? `${relativo} não existe. Rode: node scripts/agrega-ficha-saogeraldo.mjs`
    : `${relativo} DIVERGE de lotes.json (sha256 ${hash}). Rode o script sem --check.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, texto);

const f = ficha;
console.log(`→ ${relativo}  (${Buffer.byteLength(texto)} bytes, fonte sha256 ${hash})`);
console.log(`lotes: ${f.lotes}   animais: ${f.animais}`);
console.log(`idade:  ${f.idade.naFaixa} de ${f.idade.comDado} entre ${f.idade.min} e ${f.idade.max} meses · mediana ${f.idade.mediana}`);
console.log(`CE:     mediana ${f.ce.mediana} cm · ${f.ce.acima34} de ${f.ce.comDado} com ≥34 cm · faixa ${f.ce.min}–${f.ce.max}`);
console.log(`peso:   mediana ${f.peso.mediana} kg · faixa ${f.peso.min}–${f.peso.max} · ${f.peso.comDado} com dado`);
console.log(`IQG:    ${f.iqg.top5} de ${f.iqg.avaliados} no TOP 5% · ${f.iqg.top1} no TOP 1%`);
console.log(`iABCZ:  ${f.iabcz.deca1} de ${f.iabcz.avaliados} na DECA 1`);
console.log(`selos:  ${f.selos.lotes} de ${f.lotes} lotes (${f.selos.animais} animais)`);
console.log(`pais:   ${f.pais.distintos} reprodutores distintos`);
if (avisos.length) {
  console.log(`\ncobertura (o que reduziu denominador):`);
  for (const a of avisos) console.log(`  - ${a}`);
}
