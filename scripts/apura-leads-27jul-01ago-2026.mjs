// Apuração dos leads da aba TOUROS, janela 27/07/2026 → 01/08/2026 (dia do leilão São Geraldo).
//
// Fonte: Downloads/Leads - Bula Assessoria.xlsx, aba TOUROS (a aba pedida pelo Boss).
// Saída: outputs/apuracao-leads-27jul-01ago-2026.json — consumido pelo gerador do relatório.
//
// Réguas fixadas aqui (uma vez só, para todo mundo usar a mesma):
// - MQL = rebanho ≥ 100 cabeças E inscrição estadual = Sim. Mesma régua de DADOS-LEADS-META-2026-07-31.
// - Bloco São Geraldo = utm_campaign com "SAO GERALDO" OU Origem "Landing São Geraldo" / "Meta — LEADS - SAO GERALDO".
//   Bloco Perpétuo = utm_campaign "CA - PERPETUO TOURO WEB" OU Origem "Landing Touros".
//
// Uso: node scripts/apura-leads-27jul-01ago-2026.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import XLSX from 'xlsx'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'outputs')
mkdirSync(outputDir, { recursive: true })

const planilha = join(homedir(), 'Downloads', 'Leads - Bula Assessoria.xlsx')
const wb = XLSX.readFile(planilha)
const linhas = XLSX.utils.sheet_to_json(wb.Sheets.TOUROS, { header: 1, defval: null })
const cabecalho = linhas[0].map((h) => String(h ?? ''))
const col = (nome) => cabecalho.indexOf(nome)

const C = {
  etapa: col('Etapa'),
  atendente: col('Atendido por'),
  data: col('Data'),
  nome: col('Nome'),
  uf: col('UF'),
  zona: col('Zona'),
  momento: col('Momento'),
  cabecas: col('Cabeças'),
  ie: col('Inscrição Estadual'),
  qtd: col('Qtd. desejada'),
  origem: col('Origem'),
  campanha: col('utm_campaign'),
  criativo: col('utm_content'),
}

const DIA_INICIO = new Date(2026, 6, 27, 0, 0)
const DIA_FIM = new Date(2026, 7, 1, 23, 59, 59)
// Instante da última extração de mídia disponível (ANALISE-VERBA-SAOGERALDO-2026-07-31.md).
const CORTE_MIDIA = new Date(2026, 6, 31, 16, 24)

function parseData(valor) {
  const m = String(valor ?? '').match(/(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{1,2}):(\d{2})/)
  if (!m) return null
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])
}

const REBANHO_GRANDE = /100 a 500|101 a 300|301 a 500|501 a 1000|mais de 500|mais de 3000/i

const registros = linhas
  .slice(1)
  .filter((r) => r.some((c) => c !== null && c !== ''))
  .map((r) => {
    const data = parseData(r[C.data])
    const campanha = String(r[C.campanha] ?? '').trim()
    const origem = String(r[C.origem] ?? '').trim()
    const perpetuo = /PERPETUO/i.test(campanha) || /Landing Touros/i.test(origem)
    const cabecas = String(r[C.cabecas] ?? '')
    const ie = String(r[C.ie] ?? '').toLowerCase() === 'sim'
    return {
      data,
      dia: data ? `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}` : null,
      hora: data ? data.getHours() : null,
      etapa: String(r[C.etapa] ?? '').trim() || '(não tocado)',
      atendente: String(r[C.atendente] ?? '').trim() || '(ninguém)',
      uf: String(r[C.uf] ?? '').trim() || '(vazio)',
      zona: String(r[C.zona] ?? '').trim() || '(vazio)',
      momento: String(r[C.momento] ?? '').trim() || '(vazio)',
      cabecas: cabecas || '(vazio)',
      qtd: String(r[C.qtd] ?? '').trim() || '(vazio)',
      origem: origem || '(vazio)',
      campanha,
      criativo: String(r[C.criativo] ?? '').trim() || '(sem utm)',
      bloco: perpetuo ? 'PERPETUO' : 'SAO GERALDO',
      ie,
      rebanhoGrande: REBANHO_GRANDE.test(cabecas),
      mql: REBANHO_GRANDE.test(cabecas) && ie,
      cadastroOk: String(r[C.etapa] ?? '').trim() === 'CADASTRO OK',
    }
  })
  .filter((x) => x.data && x.data >= DIA_INICIO && x.data <= DIA_FIM)

// --- Conjunto dentro do bloco São Geraldo -----------------------------------
const conjunto = (x) => {
  if (x.bloco === 'PERPETUO') return 'Perpétuo Touro (web)'
  if (/RMKT/i.test(x.campanha)) return 'São Geraldo — RMKT'
  if (/Aberto/i.test(x.campanha)) return 'São Geraldo — Aberto'
  if (/LEADS - SAO GERALDO/i.test(x.campanha) || /^Meta/i.test(x.origem)) return 'São Geraldo — Formulário Instantâneo'
  return 'São Geraldo — sem utm'
}

const agrupa = (itens, chave) => {
  const mapa = new Map()
  for (const x of itens) {
    const k = chave(x)
    if (!mapa.has(k)) mapa.set(k, { chave: k, leads: 0, mql: 0, cadastroOk: 0, ie: 0 })
    const g = mapa.get(k)
    g.leads += 1
    if (x.mql) g.mql += 1
    if (x.cadastroOk) g.cadastroOk += 1
    if (x.ie) g.ie += 1
  }
  return [...mapa.values()].sort((a, b) => b.leads - a.leads)
}

const sg = registros.filter((x) => x.bloco === 'SAO GERALDO')
const pp = registros.filter((x) => x.bloco === 'PERPETUO')

const resumo = (itens) => ({
  leads: itens.length,
  mql: itens.filter((x) => x.mql).length,
  cadastroOk: itens.filter((x) => x.cadastroOk).length,
  ie: itens.filter((x) => x.ie).length,
  rebanhoGrande: itens.filter((x) => x.rebanhoGrande).length,
})

const DIAS = ['27/07', '28/07', '29/07', '30/07', '31/07', '01/08']

const porDia = DIAS.map((d) => {
  const doDia = registros.filter((x) => x.dia === d)
  const sgDia = doDia.filter((x) => x.bloco === 'SAO GERALDO')
  const ppDia = doDia.filter((x) => x.bloco === 'PERPETUO')
  return {
    dia: d,
    total: doDia.length,
    mql: doDia.filter((x) => x.mql).length,
    cadastroOk: doDia.filter((x) => x.cadastroOk).length,
    sg: sgDia.length,
    sgMql: sgDia.filter((x) => x.mql).length,
    pp: ppDia.length,
    ppMql: ppDia.filter((x) => x.mql).length,
  }
})

const porHora = Array.from({ length: 24 }, (_, h) => ({
  hora: h,
  leads: registros.filter((x) => x.hora === h).length,
  mql: registros.filter((x) => x.hora === h && x.mql).length,
}))

// Recorte alinhado ao último gasto conhecido, para um CPL que compare igual com igual.
const sgAteCorte = sg.filter((x) => x.data <= CORTE_MIDIA)
const sgDepoisCorte = sg.filter((x) => x.data > CORTE_MIDIA)

const dados = {
  fonte: planilha,
  aba: 'TOUROS',
  janela: { de: '27/07/2026', ate: '01/08/2026' },
  extraidoEm: new Date().toISOString(),
  totais: resumo(registros),
  saoGeraldo: resumo(sg),
  perpetuo: resumo(pp),
  porDia,
  porHora,
  porConjunto: agrupa(registros, conjunto),
  porCriativo: agrupa(registros, (x) => x.criativo),
  porEtapa: agrupa(registros, (x) => x.etapa),
  porAtendente: agrupa(registros, (x) => x.atendente),
  // Separado por bloco de propósito: a carteira de cada assessor não é sorteada, então comparar
  // o agregado mediria a distribuição de leads, não o trabalho.
  porAtendenteSaoGeraldo: agrupa(sg, (x) => x.atendente),
  porAtendentePerpetuo: agrupa(pp, (x) => x.atendente),
  porUf: agrupa(registros, (x) => x.uf),
  porZona: agrupa(registros, (x) => x.zona),
  porCabecas: agrupa(registros, (x) => x.cabecas),
  porMomento: agrupa(registros, (x) => x.momento),
  porQtd: agrupa(registros, (x) => x.qtd),
  criativoPorConjunto: agrupa(registros, (x) => `${conjunto(x)} · ${x.criativo}`),
  recorteMidia: {
    corte: '31/07/2026 16:24',
    saoGeraldoAteCorte: resumo(sgAteCorte),
    saoGeraldoDepoisCorte: resumo(sgDepoisCorte),
  },
}

const destino = join(outputDir, 'apuracao-leads-27jul-01ago-2026.json')
writeFileSync(destino, JSON.stringify(dados, null, 2), 'utf8')

console.log('JSON:', destino)
console.log('Total:', dados.totais)
console.log('São Geraldo:', dados.saoGeraldo)
console.log('Perpétuo:', dados.perpetuo)
