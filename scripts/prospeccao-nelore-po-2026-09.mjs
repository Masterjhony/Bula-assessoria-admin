/**
 * PROSPECÇÃO NELORE PO — radar de mercado × cobertura da Bula.
 *
 * Pergunta do chefe (11/09/2026): dentro do universo de leilões de Nelore PO
 * que o radar enxerga, quem são os criadores que leiloam com RECORRÊNCIA e
 * ainda NÃO passam pela Bula — e por onde entrar em cada um.
 *
 * Fontes (todas já no banco, dump em outputs/prospeccao-nelore-po-2026-09/):
 *   • mercado_eventos   — agenda pública (Programa Leilões, Lance Rural,
 *                         Leiloboi…). Janela real: 26/07 → 10/10/2026.
 *   • cronograma_leiloes / bula_leilao_fechamento — o que É da Bula em 2026.
 *   • mercado_criadores — ranking ACNB 2025/26 (mérito público).
 *   • crm_leads / clientes — porta de entrada (quem já conversa conosco).
 *
 * O evento do radar não traz o criador num campo próprio: a MARCA vive no nome
 * do leilão ("79º Leilão Virtual Nelore Lemgruber"). O dicionário MARCAS
 * abaixo é a fonte única dessa leitura — a primeira regra que casa vence, por
 * isso as compostas ("Paranã & Casa Branca") vêm antes das simples.
 *
 * Cobertura NÃO usa `cronograma_id` cegamente: o casamento por similaridade
 * tem falsos positivos (Shopping Mônica → Matinha, Arena do Nelore → Flor do
 * Arataú). Cliente é quem aparece no cronograma/fechamento 2026 pela MARCA.
 *
 *   node scripts/prospeccao-nelore-po-2026-09.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

const DIR = 'outputs/prospeccao-nelore-po-2026-09'
const HOJE = '2026-09-11'
const J = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
const eventosRaw = J('mercado_eventos.json')
const cronograma = J('cronograma.json')
const fechamentos = J('fechamentos.json')
const acnb = J('mercado_criadores.json')
const leads = J('crm_leads_slim.json')
const clientes = J('clientes_slim.json')

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const ehNelorePo = c => /NELORE\s*P\.?\s*O\.?(\b|$)/.test(norm(c))
// "Nelore" seco vem da Lance Rural, que não distingue PO. Entra porque é o
// mesmo pregão da Programa com categoria menos específica.
const ehNelore = c => norm(c) === 'NELORE'

/* ─── 1. Dicionário de marcas ────────────────────────────────────────────── */
// tipo: criador (default) | instituicao | genetica (central de sêmen) | fora (não é PO)
const MARCAS = [
  // compostas primeiro
  { m: 'Reserva Genética — São Pedro, Gibertoni & Paranã', re: [/RESERVA GENETICA/, /SAO PED[OR]/, /GIBERTONI/], acnb: /DORIVAL GIBERTONI/, nota: 'pregão conjunto em Itápolis-SP; o Paranã (cliente) é o elo, Gibertoni é #24/#34 da ACNB', portaExtra: 'Pregão conjunto com o Nelore Paranã, que é cliente' },
  { m: 'Nelore Paranã & Casa Branca (Expogenética)', re: [/PARAN[AÃ].*CASA ?BRANCA/, /CASA ?BRANCA.*PARAN[AÃ]/], cliente: true },
  { m: 'Elo de Prova (RG, Sino e Beem)', re: [/ELO DE PROVA/], cliente: true },
  { m: 'Naviraí / Camparino', re: [/NAVIRA/, /CAMPARINO/], cliente: true },
  { m: 'Montana Acre', re: [/MONTANA ACRE/] },
  { m: 'Água Fria', re: [/AGUA FRIA/] },
  { m: 'Nelore Canaã (com Américas & Santiago)', re: [/NELORE CANAA/, /CANAA Y SANTIAGO/], acnb: /DAS AMERICAS/, acnbNota: 'a confirmar: "Américas" pode ser a Agropecuária das Américas' },

  // ── clientes da Bula em 2026 ──
  { m: 'Genética Aditiva', re: [/GENETICA ADITIVA/], cliente: true },
  { m: 'Nelore Mafra', re: [/\bMAFRA\b/], cliente: true, acnb: /PAULO DE CASTRO MARQUES/ },
  { m: 'EAO Agropecuária', re: [/\bEAO\b/], cliente: true },
  { m: 'Terra Brava', re: [/TERRA BRAVA/], cliente: true },
  { m: 'Rancho da Matinha', re: [/MATINHA/], cliente: true },
  { m: 'Guadalupe Agropecuária', re: [/GUADALUPE/], cliente: true },
  { m: 'Santa Nice', re: [/SANTA NICE/], cliente: true },
  { m: 'Katispera', re: [/KATISPERA/], cliente: true },
  { m: 'Nelore Paranã', re: [/PARAN[AÃ]/, /C[E]?PEX/], cliente: true, acnb: /NELORE PARANA/ },
  { m: 'Colonial Agropecuária', re: [/COLONIAL/, /NOITE NACIONAL MATRIZES PREMIUM/], cliente: true },
  { m: 'Nelore JMP / JBJ Genetics', re: [/\bJMP\b/, /\bJBJ\b/], cliente: true },
  { m: 'Fazenda Jacamim', re: [/JACAMI[MN]/], cliente: true },
  { m: 'Agropecuária São José (ASJ)', re: [/\bASJ\b/], cliente: true },
  { m: 'Alto Brasil & Marcovel', re: [/PARCERIA NELORE PREMIUM/], cliente: true },
  { m: 'RG — Resultado Garantido', re: [/\bRG\b/, /RESULTADO GARANTIDO/, /REFERENCIA GENETICA/], cliente: true },
  { m: 'Nelore Diamante', re: [/NELORE DIAMANTE/], cliente: true },
  { m: 'São Lourenço', re: [/SAO LOURENCO/], cliente: true },
  { m: 'Três Nascentes (Toka Jakaré)', re: [/TRES NASCENTES/], cliente: true },

  // ── centrais de sêmen / instituições (não é criador para prospectar) ──
  { m: 'Alta Genetics', re: [/\bALTA\b/], tipo: 'genetica' },
  { m: 'Synetics (sêmen)', re: [/S[IY]NETICS/], tipo: 'genetica' },
  { m: 'Genex', re: [/GENEX/], tipo: 'genetica' },
  { m: 'Shopping Dia P (sêmen)', re: [/\bDIA P\b/], tipo: 'genetica' },
  { m: 'ACNB & Amigos', re: [/\bACNB\b/], tipo: 'instituicao' },
  { m: 'Pintado FS', re: [/PINTADO/], tipo: 'fora' },
  { m: 'Integração QM', re: [/INTEGRACAO QM/], tipo: 'fora' },

  // ── prospects ──
  { m: 'Nelore Lemgruber', re: [/LEMGRUBER/] },
  { m: 'Carpa', re: [/\bCARPA\b/] },
  { m: 'Mundial Agropecuária', re: [/MUNDIAL/] },
  { m: 'Fazenda do Sabiá', re: [/\bSABIA\b(?! DOURADO)/], acnb: /FAZENDA DO SABIA/, nota: 'Capitólio-MG (Beto Sabiá). NÃO é o Sabiá Dourado (PA) que a Bula Remates leiloou em 30/08' },
  { m: "Fazendas Sant'Anna", re: [/SANT.?ANNA/] },
  { m: 'Nelore do Adir', re: [/\bADIR\b/] },
  { m: 'Fazenda Brasil (AC)', re: [/FAZENDA BRASIL/] },
  { m: 'Nelore Aymoré', re: [/AYMORE/] },
  { m: 'Ariston Quirino (São José)', re: [/ARISTON/] },
  { m: 'Paulete Agropecuária', re: [/PAULETE/] },
  { m: 'FAX Rio Vermelho', re: [/RIO VERMELHO/] },
  { m: 'Agropecuária Polyana', re: [/POLYANA/] },
  { m: 'PNAT', re: [/\bPNAT\b/] },
  { m: 'Nelore EDAP', re: [/\bEDAP\b/] },
  { m: 'Excelência Genética', re: [/EXCELENCIA GENETICA/] },
  { m: 'Terra Prometida', re: [/TERRA PROMETIDA/] },
  { m: 'Nelore Josi', re: [/\bJOSI\b/] },
  { m: 'AB Fazenda Lagoa Azul', re: [/LAGOA AZUL/] },
  { m: 'Mato Verde', re: [/MATO VERDE/] },
  { m: 'Nelore Inkanto', re: [/INKANT/] },
  { m: 'Casa Branca (CB Genetics)', re: [/CASA ?BRANCA/, /CB GENET/], portaExtra: 'Leilão conjunto Paranã & Casa Branca (20/08, Expogenética) passou pela Bula' },
  { m: 'Mônica (Marchett)', re: [/MONICA/], acnb: /MONICA MARCHETT/ },
  { m: 'Mata Velha', re: [/MATA VELHA/] },
  { m: 'Di Genio', re: [/DI GENIO/], acnb: /DI GENIO/ },
  { m: 'CRL Agropecuária', re: [/\bCRL\b/], acnb: /CRL AGRO/ },
  { m: 'Tulipa Agropecuária', re: [/TULIPA/, /SO ELAS/] },
  { m: 'Heringer', re: [/HERINGER/], acnb: /HERINGER/ },
  { m: 'Rima Agropecuária', re: [/\bRIMA\b/], acnb: /RIMA AGRO/ },
  { m: 'Cabaña Sausalito (Bolívia)', re: [/SAUSALITO/], acnb: /SAUSALITO/ },
  { m: 'Nelore de Ouro (Bolívia)', re: [/NELORE DE OURO/] },
  { m: 'Nelori (Bolívia)', re: [/^NELORI\b/] },
  { m: 'HeJ — Henrique & Juliano', re: [/\bHEJ\b/], acnb: /HENRIQUE E JULIANO/ },
  { m: 'Santa Maria', re: [/SANTA MARIA/] },
  { m: 'Gil Pereira', re: [/GIL PEREIRA/] },
  { m: 'Fazenda Santa Gertrudes', re: [/SANTA GERTRUDES/] },
  { m: 'Nelore Bezz', re: [/\bBEZZ\b/] },
  { m: 'Fazendas Três Marias', re: [/TRES MARIAS/] },
  { m: 'Fazenda Barro Preto', re: [/BARRO PRETO/] },
  { m: 'Grupo Costa', re: [/GRUPO COSTA/] },
  { m: 'Nelore Toca', re: [/NELORE TOCA/] },
  { m: 'Nelore Lince', re: [/LINCE/] },
  { m: 'Grupo Monte Verde', re: [/MONTE VERDE/] },
  { m: 'Nelore SNL', re: [/\bSNL\b/] },
  { m: 'Genética Premium', re: [/GENETICA PREMIUM/] },
  { m: 'Haras Engenho', re: [/HARAS ENGENHO/] },
  { m: 'Fazenda Araras', re: [/ARARAS/] },
  { m: 'Agro Pontieri', re: [/PONTIERI/] },
  { m: 'Nelore da Grama', re: [/DA GRAMA/] },
  { m: 'Nelore Promessa', re: [/PROMESSA/] },
  { m: 'Baby de Prova', re: [/BABY DE PROVA/] },
  { m: 'Diamantino & Vitória', re: [/DIAMANTINO/] },
  { m: 'Fazenda Jacarezinho', re: [/JACAREZINHO/] },
  { m: 'Gran Nelore', re: [/GRAN NELORE/] },
  { m: 'Elite H', re: [/^ELITE H$/] },
  { m: 'Cachoeira 2C & Retiro Velho', re: [/CACHOEIRA\b/, /RETIRO VELHO/] },
  { m: 'Corona', re: [/CORONA/] },
  { m: 'Nelore Huff', re: [/\bHUFF\b/] },
  { m: 'Nelore Bank', re: [/\bBANK\b/] },
  { m: 'Genética Varrela', re: [/VARRELA/] },
  { m: 'Nelore DF', re: [/NELORE DF\b/] },
  { m: 'Fazenda Angelus', re: [/ANGELUS/] },
  { m: 'Arena do Nelore (Show de Bola)', re: [/ARENA/] },
  { m: 'Martendal', re: [/MARTENDAL/] },
  { m: 'Caraíbas / Morro Verde', re: [/CARAIBAS/, /MORRO VERDE/] },
  { m: 'Ambar Amaral', re: [/AMBAR AMARAL/] },
  { m: 'Nelore Águia', re: [/AGUIA/] },
  { m: 'Santa Irene', re: [/SANTA IRENE/] },
  { m: 'Nelore Jacurici', re: [/JACURIC/] },
  { m: 'Nelore Cedro', re: [/NELORE CEDRO/] },
  { m: 'Elo de Minas', re: [/ELO DE MINAS/] },
  { m: 'Shopping Montana (RN)', re: [/MONTANA/] },
  { m: 'Nova Geração', re: [/NOVA GERACAO/] },
  { m: 'PHB Raridades', re: [/\bPHB\b/, /\bPBH\b/] },
  { m: 'Tríplice Coroa', re: [/TRIPLICE COROA/] },
  { m: 'Roda Branca', re: [/RODA BRANCA/] },
  { m: 'JEM', re: [/\bJEM\b/] },
  { m: 'Cone Sul', re: [/CONE SUL/] },
  { m: 'Nelore VRJO (José Olavo Borges Mendes)', re: [/\bVRJO\b/], nota: '27ª edição virtual pelo Leiloboi (07/06); "Matrizes VRJC" de 28/09 pode ser a mesma marca — confirmar' },
  { m: 'VRJC', re: [/\bVRJC\b/], nota: 'pode ser grafia de VRJO — confirmar antes de abordar' },
  { m: 'Confiança', re: [/CONFIANCA/] },
  { m: 'Tarlim', re: [/TARLIM/] },
  { m: 'Angelo Calmon', re: [/ANGELO CALMON/] },
  { m: 'Ary Barbara', re: [/ARY BARBARA/] },
  { m: 'Serilon', re: [/SERILON/] },
  { m: 'Nelore Bom', re: [/NELORE BOM/] },
  { m: 'Elite All Black', re: [/ALL BLACK/] },
  { m: 'GDA', re: [/\bGDA\b/] },
  { m: 'Nelore Clenon', re: [/CLENON/] },
  { m: 'Nelore Lira', re: [/NELORE LIRA/] },
  { m: 'Joias do Chicão', re: [/CHICAO/] },
]

function marcaDe(nome) {
  const n = norm(nome)
  for (const m of MARCAS) if (m.re.some(r => r.test(n))) return m
  return null
}

/* ─── 2. Eventos Nelore PO do radar, classificados ───────────────────────── */
const ESTUDIO = /^(LONDRINA|SAO PAULO)\b/
const EXPOG = { ini: '2026-08-14', fim: '2026-08-23' }
const UF_ZONA = {
  AC: 'Norte', AM: 'Norte', AP: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte', MA: 'Norte+MA',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', PB: 'Nordeste', PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MS: 'Centro-Oeste', MT: 'Centro-Oeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul', EX: 'Exterior',
}
const ZONA_ASSESSOR = { 'Norte': 'Douglas Bispo', 'Norte+MA': 'Douglas Bispo', 'Nordeste': 'Fábio Omena Gaia', 'Sudeste': 'Fábio Omena Gaia', 'Centro-Oeste': 'Leonardo Serafim', 'Sul': 'Leonardo Serafim', 'Exterior': '—' }

const ordinal = nome => {
  const n = norm(nome)
  // "3ª Etapa" e "2º Dia" não são edição — são partes do mesmo leilão.
  const a = n.match(/(\d{1,3})\s*[º°ª](?!\s*(ETAPA|DIA\b))/); if (a) return Number(a[1])
  const r = n.match(/\b(I{1,3}|IV|V|VI{0,3}|IX|X{1,3})\s+(LEILAO|SHOPPING)/)
  if (r) return { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }[r[1]] ?? null
  return null
}
const mixDe = nome => {
  const n = norm(nome), out = []
  if (/TOURO|REPRODUTOR|MACHO/.test(n)) out.push('touros')
  if (/MATRIZ|FEMEA|NOVILHA|VENTRE|DOADORA|SO ELAS/.test(n)) out.push('fêmeas')
  if (/BEZERR|BABY|BABIES/.test(n)) out.push('bezerras')
  if (/EMBRI|ASPIRAC|PRENHEZ|EMBRYO/.test(n)) out.push('embriões')
  if (/SEMEN/.test(n)) out.push('sêmen')
  return out
}
const porteDe = nome => { const m = norm(nome).match(/\b(\d{2,4})\s+(TOUROS|FEMEAS|BEZERRAS|MATRIZES)/); return m ? `${m[1]} ${m[2].toLowerCase()}` : null }

const eventos = []
const semMarca = []
for (const e of eventosRaw) {
  if (!(ehNelorePo(e.categoria) || ehNelore(e.categoria))) continue
  if (!e.data) continue
  const m = marcaDe(e.nome)
  const local = String(e.local ?? '').trim()
  const uf = String(e.uf ?? '').trim() || (local.match(/[-(]\s*([A-Z]{2})\s*\)?$/)?.[1] ?? '')
  const expog = e.data >= EXPOG.ini && e.data <= EXPOG.fim && /UBERABA/.test(norm(local))
  const estudio = ESTUDIO.test(norm(local)) || !local
  const ev = {
    id: e.id, data: e.data, hora: e.hora, nome: e.nome.trim().replace(/[\s.;,]+$/, ''), categoria: e.categoria, local, uf,
    fonte: e.leiloeira, marca: m?.m ?? null, tipo: m?.tipo ?? (m ? 'criador' : 'sem-marca'),
    edicao: ordinal(e.nome), mix: mixDe(e.nome), porte: porteDe(e.nome),
    pracaTipo: expog ? 'Expogenética (Uberaba)' : estudio ? 'virtual/estúdio' : 'presencial',
    zona: expog || estudio ? null : (UF_ZONA[uf] ?? null),
    cronogramaId: e.cronograma_id, matchScore: e.match_score,
  }
  eventos.push(ev)
  if (!m) semMarca.push(ev)
}
if (semMarca.length) console.log('⚠ eventos sem marca:', semMarca.map(e => `${e.data} ${e.nome}`).join(' | '))

/* ─── 3. Cobertura pela MARCA (cronograma + fechamentos 2026) ────────────── */
const bulaTextos = [
  ...cronograma.map(c => ({ data: c.data, txt: `${c.criador ?? ''} ${c.nome ?? ''}`, fonte: 'cronograma', leiloeira: c.leiloeira })),
  ...fechamentos.map(f => ({ data: f.data, txt: f.nome ?? '', fonte: 'fechamento', vgv: f.vgv_total })),
]
function coberturaBula(marca) {
  return bulaTextos.filter(t => marca.re.some(r => r.test(norm(t.txt))))
}

/* ─── 4. Porta de entrada: CRM + clientes + ACNB ─────────────────────────── */
// Token de busca por marca: só o que é raro o bastante para não casar o mundo.
const TOKENS = {
  'Nelore Lemgruber': [/LEMGRUBER/], 'Carpa': [/\bCARPA\b/], 'Mundial Agropecuária': [/\bMUNDIAL\b/],
  'Fazenda do Sabiá': [/BETO SABIA/, /FAZENDA DO SABIA/], "Fazendas Sant'Anna": [/FAZENDA SANT.?ANNA/], 'Nelore do Adir': [/NELORE DO ADIR/],
  'Fazenda Brasil (AC)': [/NELORE FAZENDA BRASIL/], 'Nelore Aymoré': [/AYMORE/], 'Ariston Quirino (São José)': [/ARISTON QUIRINO/],
  'Paulete Agropecuária': [/PAULETE/], 'FAX Rio Vermelho': [/FAX RIO VERMELHO/], 'Agropecuária Polyana': [/POLYANA/],
  'PNAT': [/\bPNAT\b/], 'Nelore EDAP': [/\bEDAP\b/], 'Excelência Genética': [/EXCELENCIA GENETICA/],
  'Terra Prometida': [/TERRA PROMETIDA/], 'Nelore Josi': [/NELORE JOSI/], 'AB Fazenda Lagoa Azul': [/AB LAGOA AZUL/],
  'Mato Verde': [/MATO VERDE/], 'Nelore Inkanto': [/INKANT/], 'Casa Branca (CB Genetics)': [/CASA ?BRANCA/],
  'Mônica (Marchett)': [/MONICA MARCHETT/], 'Mata Velha': [/MATA VELHA/], 'Di Genio': [/DI GENIO/], 'CRL Agropecuária': [/\bCRL\b/],
  'Tulipa Agropecuária': [/TULIPA AGRO/, /NELORE TULIPA/], 'Heringer': [/HERINGER/], 'Rima Agropecuária': [/RIMA INDUSTRIAL/, /RIMA AGRO/],
  'Cabaña Sausalito (Bolívia)': [/SAUSALITO/], 'HeJ — Henrique & Juliano': [/\bHEJ\b/, /HENRIQUE E JULIANO/],
  'Santa Maria': [/NELORE SANTA MARIA/], 'Gil Pereira': [/GIL PEREIRA/],
  'Fazenda Santa Gertrudes': [/SANTA GERTRUDES/], 'Nelore Bezz': [/\bBEZZ\b/], 'Fazendas Três Marias': [/FAZENDAS TRES MARIAS/],
  'Fazenda Barro Preto': [/NELORE BARRO PRETO/], 'Grupo Costa': [/GRUPO COSTA/], 'Nelore Toca': [/NELORE TOCA/],
  'Nelore Lince': [/NELORE LINCE/], 'Grupo Monte Verde': [/GRUPO MONTE VERDE/], 'Nelore SNL': [/\bSNL\b/],
  'Haras Engenho': [/HARAS ENGENHO/], 'Fazenda Araras': [/NELORE ARARAS/], 'Agro Pontieri': [/PONTIERI/],
  'Nelore da Grama': [/NELORE DA GRAMA/], 'Nelore Promessa': [/NELORE PROMESSA/], 'Diamantino & Vitória': [/DIAMANTINO E VITORIA/],
  'Fazenda Jacarezinho': [/AGROP.*JACAREZINHO/], 'Gran Nelore': [/GRAN NELORE/], 'Cachoeira 2C & Retiro Velho': [/CACHOEIRA 2C/, /RETIRO VELHO/],
  'Corona': [/NELORE CORONA/, /FAZENDA CORONA/], 'Nelore Huff': [/\bHUFF\b/], 'Nelore Bank': [/NELORE BANK/],
  'Genética Varrela': [/VARRELA/], 'Nelore DF': [/NELORE DF\b/], 'Fazenda Angelus': [/ANGELUS/],
  'Arena do Nelore (Show de Bola)': [/SHOW DE BOLA/], 'Martendal': [/MARTENDAL/], 'Caraíbas / Morro Verde': [/CARAIBAS/],
  'Ambar Amaral': [/AMBAR AMARAL/], 'Nelore Águia': [/NELORE AGUIA/], 'Santa Irene': [/SANTA IRENE/],
  'Nelore Jacurici': [/JACURIC/], 'Nelore Cedro': [/NELORE CEDRO/], 'Elo de Minas': [/ELO DE MINAS/],
  'Shopping Montana (RN)': [/NELORE MONTANA/], 'Nova Geração': [/NELORE NOVA GERACAO/], 'PHB Raridades': [/\bPHB\b/],
  'Tríplice Coroa': [/TRIPLICE COROA/], 'Roda Branca': [/RODA BRANCA/], 'JEM': [/NELORE JEM\b/], 'Cone Sul': [/CONE SUL/],
  'Nelore VRJO (José Olavo Borges Mendes)': [/\bVRJO\b/], 'Confiança': [/NELORE CONFIANCA/], 'Tarlim': [/TARLIM/], 'Angelo Calmon': [/ANGELO CALMON/],
  'Ary Barbara': [/ARY BARBARA/], 'Serilon': [/SERILON/], 'Nelore Bom': [/NELORE BOM\b/], 'Elite All Black': [/ALL BLACK/],
  'GDA': [/NELORE GDA/], 'Nelore Clenon': [/CLENON/], 'Nelore Lira': [/NELORE LIRA/], 'Joias do Chicão': [/CHICAO/],
  'Nelore Canaã (com Américas & Santiago)': [/NELORE CANAA/], 'Nelore de Ouro (Bolívia)': [/NELORE DE OURO/],
  'Reserva Genética — São Pedro, Gibertoni & Paranã': [/GIBERTONI/], 'Baby de Prova': [/BABY DE PROVA/], 'Genética Premium': [/GENETICA PREMIUM/],
}
function portaCrm(marca) {
  const toks = TOKENS[marca.m]; if (!toks) return { clientes: [], leads: [] }
  const hit = s => toks.some(r => r.test(norm(s)))
  const cl = clientes.filter(c => hit(c.nome) || hit(c.responsavel)).map(c => ({ nome: c.nome, cidade: c.cidade, uf: c.uf, perfil: c.perfil, assessor: c.assessor }))
  const ld = leads.filter(l => !l.arquivado && (hit(l.nome) || hit(l.empresa))).map(l => ({ nome: l.nome, empresa: l.empresa, cidade: l.cidade, uf: l.estado, status: l.status, stage: l.stage, origem: l.origem }))
  return { clientes: cl.slice(0, 6), leads: ld.slice(0, 6), nCl: cl.length, nLd: ld.length }
}
const acnbPor = re => acnb.find(a => re.test(norm(a.nome)))

/* ─── 5. Agregação por marca ─────────────────────────────────────────────── */
const porMarca = new Map()
for (const e of eventos) {
  if (!e.marca) continue
  const k = e.marca
  if (!porMarca.has(k)) porMarca.set(k, { marca: MARCAS.find(m => m.m === k), eventos: [] })
  porMarca.get(k).eventos.push(e)
}

const marcas = []
for (const [nome, { marca, eventos: evs }] of porMarca) {
  const datas = [...new Set(evs.map(e => e.data))].sort()
  // "pregão" = bloco de dias consecutivos (touros num dia, fêmeas no outro é
  // o MESMO leilão em etapas). Um shopping de 9 dias conta 1.
  // Dentro da Expogenética (14–23/08, Uberaba) as "lives"/"shoppings" de uma
  // marca em dias soltos são a MESMA presença na feira: contam 1.
  const naFeira = d => d >= EXPOG.ini && d <= EXPOG.fim && evs.some(e => e.data === d && e.pracaTipo.startsWith('Expogenética'))
  const pregoes = []
  for (const d of datas) {
    const last = pregoes[pregoes.length - 1]
    const prev = last ? last[last.length - 1] : null
    const gap = prev ? (new Date(d) - new Date(prev)) / 86400000 : 99
    if (gap <= 1.01 || (prev && naFeira(prev) && naFeira(d))) last.push(d); else pregoes.push([d])
  }
  const edicoes = evs.map(e => e.edicao).filter(Boolean)
  const edicaoMax = edicoes.length ? Math.max(...edicoes) : null
  const pracas = [...new Set(evs.filter(e => e.pracaTipo === 'presencial').map(e => e.local))]
  const ufs = [...new Set(evs.filter(e => e.pracaTipo === 'presencial' && e.uf).map(e => e.uf))]
  const zonas = [...new Set(evs.map(e => e.zona).filter(Boolean))]
  const mix = [...new Set(evs.flatMap(e => e.mix))]
  const porte = [...new Set(evs.map(e => e.porte).filter(Boolean))]
  const expog = evs.some(e => e.pracaTipo.startsWith('Expogenética'))
  const cob = coberturaBula(marca)
  // Cliente = flag explícita (revisada contra o cronograma 2026). Fechamento
  // sem cronograma = a Bula já VENDEU lote no leilão dele: não é cliente, mas
  // é a melhor porta de entrada que existe.
  const cliente = !!marca.cliente
  const vendemosLa = cliente ? [] : cob.filter(c => c.fonte === 'fechamento').map(c => ({ data: c.data, nome: c.txt, vgv: c.vgv }))
  const proximos = pregoes.filter(p => p[p.length - 1] >= HOJE).map(p => p[0])
  const passados = pregoes.filter(p => p[p.length - 1] < HOJE).map(p => p[0])
  const crm = portaCrm(marca)
  const acnbRow = marca.acnb ? acnbPor(marca.acnb) : null
  // Nomes de pregão (um representativo por bloco: o mais longo, que é o mais descritivo)
  const nomesPregoes = pregoes.map(p => {
    const ns = evs.filter(e => p.includes(e.data)).map(e => e.nome)
    const locais = [...new Set(evs.filter(e => p.includes(e.data) && e.pracaTipo === 'presencial').map(e => e.local))]
    return { ini: p[0], fim: p[p.length - 1], dias: p.length, nome: ns.sort((a, b) => b.length - a.length)[0], todos: [...new Set(ns)], pracas: locais, expog: evs.some(e => p.includes(e.data) && e.pracaTipo.startsWith('Expogenética')) }
  })

  // pregões da marca que NÃO batem com o cronograma (gap do cliente)
  const gapCliente = cliente ? nomesPregoes.filter(p => !cronograma.some(c => c.data >= p.ini && c.data <= p.fim && marca.re.some(r => r.test(norm(`${c.criador ?? ''} ${c.nome ?? ''}`))))) : []

  marcas.push({
    nome, tipo: marca.tipo ?? 'criador', nota: marca.nota ?? null,
    eventos: evs.length, dias: datas.length, pregoes: pregoes.length, nomesPregoes,
    primeira: datas[0], ultima: datas[datas.length - 1],
    edicaoMax, pracas, ufs, zonas, assessorZona: [...new Set(zonas.map(z => ZONA_ASSESSOR[z]))].filter(Boolean),
    virtual: evs.every(e => e.pracaTipo !== 'presencial'), expog, mix, porte,
    fontes: [...new Set(evs.map(e => e.fonte))],
    cliente, cobertura: cob.slice(0, 4).map(c => `${c.fonte}: ${c.txt}${c.data ? ' (' + c.data.slice(5).split('-').reverse().join('/') + ')' : ''}`),
    vendemosLa, portaExtra: marca.portaExtra ?? null,
    gapCliente,
    proximos, passados,
    acnb: acnbRow ? { pos: acnbRow.posicao, nome: acnbRow.nome, situacao: acnbRow.situacao, relacionados: (acnbRow.relacionados ?? []).map(r => r.nome), nota: marca.acnbNota ?? null } : null,
    crm,
  })
}

/* ─── 6. Pontuação dos prospects ─────────────────────────────────────────── */
// Transparente e aditiva. Não há "peso escondido": cada coluna do relatório
// diz de onde veio o ponto.
function pontuar(m) {
  const rec = m.pregoes >= 4 ? 35 : m.pregoes === 3 ? 28 : m.pregoes === 2 ? 20 : 10
  const trad = m.edicaoMax == null ? 0 : m.edicaoMax >= 30 ? 25 : m.edicaoMax >= 20 ? 20 : m.edicaoMax >= 10 ? 15 : m.edicaoMax >= 5 ? 10 : m.edicaoMax >= 2 ? 5 : 0
  let porte = 0
  if (m.nomesPregoes.some(p => p.dias >= 2)) porte += 5
  if (m.porte.length) porte += 5
  if (m.expog) porte += 5
  if (m.mix.length >= 2) porte += 3
  porte = Math.min(porte, 15)
  const merito = !m.acnb ? 0 : m.acnb.pos <= 10 ? 15 : m.acnb.pos <= 30 ? 10 : 5
  let porta = 0
  if (m.vendemosLa.length) porta = 10
  else if ((m.crm.nCl ?? 0) > 0) porta = 10
  else if ((m.crm.nLd ?? 0) > 0) porta = 8
  else if (m.portaExtra) porta = 8
  else if (m.acnb && m.acnb.situacao === 'lead') porta = 8
  else if (m.acnb && m.acnb.situacao === 'relacionado') porta = 5
  return { rec, trad, porte, merito, porta, total: rec + trad + porte + merito + porta }
}
for (const m of marcas) m.score = pontuar(m)

const prospects = marcas.filter(m => !m.cliente && m.tipo === 'criador' && !/BOL[IÍ]VIA/i.test(m.nome))
  .sort((a, b) => b.score.total - a.score.total || b.pregoes - a.pregoes)
const exterior = marcas.filter(m => !m.cliente && m.tipo === 'criador' && /BOL[IÍ]VIA/i.test(m.nome))
const clientesRadar = marcas.filter(m => m.cliente).sort((a, b) => b.gapCliente.length - a.gapCliente.length || b.pregoes - a.pregoes)
const naoCriador = marcas.filter(m => m.tipo !== 'criador')

/* ─── 7. KPIs ────────────────────────────────────────────────────────────── */
const evCriador = eventos.filter(e => e.marca && (MARCAS.find(m => m.m === e.marca)?.tipo ?? 'criador') === 'criador')
const kpi = {
  hoje: HOJE,
  janela: { ini: eventos.map(e => e.data).sort()[0], fim: eventos.map(e => e.data).sort().at(-1) },
  eventosPo: eventos.length,
  marcasTotal: marcas.filter(m => m.tipo === 'criador').length,
  marcasCliente: clientesRadar.length,
  marcasProspect: prospects.length,
  pregoesTotal: marcas.filter(m => m.tipo === 'criador').reduce((s, m) => s + m.pregoes, 0),
  pregoesCliente: clientesRadar.reduce((s, m) => s + m.pregoes, 0),
  pregoesClienteCobertos: clientesRadar.reduce((s, m) => s + (m.pregoes - m.gapCliente.length), 0),
  pregoesProspect: prospects.reduce((s, m) => s + m.pregoes, 0),
  prospectsRecorrentes: prospects.filter(m => m.pregoes >= 2).length,
  prospectsTradicao: prospects.filter(m => (m.edicaoMax ?? 0) >= 10).length,
  prospectsComPorta: prospects.filter(m => m.score.porta > 0).length,
  prospectsProximos30: prospects.filter(m => m.proximos.length).length,
  acnbNoRadar: prospects.filter(m => m.acnb).length,
  zonas: Object.fromEntries(['Norte', 'Nordeste', 'Sudeste', 'Centro-Oeste', 'Sul'].map(z => [z, prospects.filter(m => m.zonas.includes(z)).length])),
  virtuais: prospects.filter(m => m.virtual).length,
}

const out = { kpi, prospects, exterior, clientes: clientesRadar, naoCriador, eventos, semMarca }
fs.writeFileSync(path.join(DIR, 'analise.json'), JSON.stringify(out, null, 1))

console.log('KPIs', JSON.stringify(kpi, null, 1))
console.log('\nTOP PROSPECTS')
for (const m of prospects.slice(0, 40)) console.log(
  String(m.score.total).padStart(3), '|', m.nome.padEnd(42), '| pregões', m.pregoes, '| ed.', m.edicaoMax ?? '-', '| próximo', m.proximos[0] ?? '-',
  '|', (m.ufs.join(',') || 'virtual').padEnd(8), '| acnb', m.acnb ? `#${m.acnb.pos} ${m.acnb.situacao}` : '-', '| crm', `${m.crm.nCl ?? 0}c/${m.crm.nLd ?? 0}l`)
console.log('\nCLIENTES COM GAP')
for (const m of clientesRadar.filter(m => m.gapCliente.length)) console.log(m.nome.padEnd(42), '| pregões', m.pregoes, '| fora do cronograma:', m.gapCliente.map(p => `${p.ini.slice(5)} ${p.nome}`).join(' ; '))

/* ─── 8. XLSX ────────────────────────────────────────────────────────────── */
const dmy = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : ''
const wb = XLSX.utils.book_new()
const shProsp = prospects.map((m, i) => ({
  '#': i + 1, 'Criador / marca': m.nome, 'Pontos': m.score.total,
  'Pregões na janela': m.pregoes, 'Dias de leilão': m.dias, 'Edição informada': m.edicaoMax ?? '',
  'Próximo pregão': m.proximos.map(dmy).join(', '), 'Já aconteceu': m.passados.map(dmy).join(', '),
  'Praça(s)': m.pracas.join(' | ') || (m.expog ? 'Expogenética (Uberaba)' : 'virtual'), 'UF': m.ufs.join(','), 'Zona': m.zonas.join(','), 'Assessor da zona': m.assessorZona.join(', '),
  'Mix': m.mix.join(', '), 'Porte anunciado': m.porte.join(', '), 'Expogenética': m.expog ? 'sim' : '',
  'ACNB': m.acnb ? `#${m.acnb.pos} ${m.acnb.nome} (${m.acnb.situacao})` : '',
  'Clientes no CRM': m.crm.nCl ?? 0, 'Leads no CRM': m.crm.nLd ?? 0,
  'Porta de entrada': [...m.vendemosLa.map(v => `JÁ VENDEMOS LÁ: ${v.nome} (${dmy(v.data)}, VGV R$ ${Number(v.vgv||0).toLocaleString('pt-BR')})`), ...(m.portaExtra ? [m.portaExtra] : []), ...m.crm.clientes.map(c => `CLIENTE ${c.nome}${c.uf ? ' (' + c.uf + ')' : ''}`), ...m.crm.leads.map(l => `LEAD ${l.nome}${l.empresa ? ' — ' + l.empresa : ''}${l.uf ? ' (' + l.uf + ')' : ''}`), ...(m.acnb?.relacionados ?? []).map(r => `ACNB relacionado: ${r}`)].join(' | '),
  'Leilões no radar': m.nomesPregoes.map(p => `${dmy(p.ini)}${p.dias > 1 ? '–' + dmy(p.fim) : ''} ${p.nome}`).join(' || '),
  'Pts recorrência': m.score.rec, 'Pts tradição': m.score.trad, 'Pts porte': m.score.porte, 'Pts ACNB': m.score.merito, 'Pts porta': m.score.porta,
  'Observação': m.nota ?? '',
}))
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shProsp), 'Prospects')
const shCli = clientesRadar.map(m => ({
  'Cliente (marca)': m.nome, 'Pregões no radar': m.pregoes, 'Pregões fora do cronograma': m.gapCliente.length,
  'Fora do cronograma': m.gapCliente.map(p => `${dmy(p.ini)}${p.dias > 1 ? '–' + dmy(p.fim) : ''} ${p.nome}`).join(' || '),
  'Todos os pregões': m.nomesPregoes.map(p => `${dmy(p.ini)}${p.dias > 1 ? '–' + dmy(p.fim) : ''} ${p.nome}`).join(' || '),
  'Base da cobertura': m.cobertura.join(' | '),
}))
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shCli), 'Clientes no radar')
const shEv = eventos.sort((a, b) => a.data.localeCompare(b.data)).map(e => ({
  Data: e.data, Hora: e.hora ?? '', Leilão: e.nome, Marca: e.marca ?? '(sem marca)', Tipo: e.tipo, Categoria: e.categoria, Praça: e.local, UF: e.uf, 'Tipo de praça': e.pracaTipo, Fonte: e.fonte,
  Edição: e.edicao ?? '', Mix: e.mix.join(', '), Cliente: marcas.find(m => m.nome === e.marca)?.cliente ? 'sim' : '',
}))
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shEv), 'Eventos Nelore PO')
const shAcnb = acnb.map(a => ({ Posição: a.posicao, Criador: a.nome, Pontos: a.pontos, Situação: a.situacao, Relacionados: (a.relacionados ?? []).map(r => r.nome).join('; '), 'No radar como': marcas.find(m => m.acnb && m.acnb.pos === a.posicao)?.nome ?? '' }))
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shAcnb), 'Ranking ACNB')
const shExt = [...exterior, ...naoCriador].map(m => ({ Marca: m.nome, Tipo: m.tipo, Pregões: m.pregoes, Leilões: m.nomesPregoes.map(p => `${dmy(p.ini)} ${p.nome}`).join(' || ') }))
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shExt), 'Fora do alvo')
for (const ws of Object.values(wb.Sheets)) {
  const ref = XLSX.utils.decode_range(ws['!ref'])
  ws['!cols'] = Array.from({ length: ref.e.c + 1 }, (_, c) => {
    let w = 8
    for (let r = ref.s.r; r <= Math.min(ref.e.r, 200); r++) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell) w = Math.max(w, Math.min(60, String(cell.v).length + 2)) }
    return { wch: w }
  })
}
const xlsxPath = path.join(DIR, 'prospeccao-nelore-po.xlsx')
XLSX.writeFile(wb, xlsxPath)
console.log('\nXLSX:', xlsxPath)
