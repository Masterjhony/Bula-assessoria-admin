/**
 * Apuracao das DESPESAS da DRE 2026 (jan-ago) por triangulacao de fontes.
 *
 *   1. EXTRATO conciliado (erp_movimentos_bancarios) = universo do que saiu de fato.
 *   2. HASTAPRO FIL '2' (FIN_TITULOS D) = a classificacao rica; casa por valor+data.
 *      Como o HastaPro so passou a ser usado a partir de marco, o rotulo achado em
 *      um mes e RETROPROPAGADO para o mesmo valor nos meses anteriores.
 *   3. CARTAO DE CREDITO (erp_cartao_faturas) = gasto do Bulinha, que por decisao
 *      de 26/08 e COMISSAO, nao estrutura. Jul/ago sao sinteticos (ja contados).
 *   4. FOLHA por competencia (cadastro), porque o pagamento tem defasagem.
 *
 * Saida: outputs/dre-2026/despesas-apuradas.json
 * Uso: node scripts/apura-despesas-dre-2026.mjs
 */
import Firebird from 'node-firebird'
import fs from 'node:fs'
import pg from 'pg'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const MES = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
const T = (s) => String(s == null ? '' : s).trim()
const r2 = (v) => Math.round(v * 100) / 100

// --- HastaPro -------------------------------------------------------------
const FB = {
  host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT || 3050), database: env.HASTAPRO_DATABASE,
  user: env.HASTAPRO_USER, password: env.HASTAPRO_PASSWORD, lowercase_keys: false, pageSize: 4096,
}
const fb = (sql) => new Promise((res, rej) => Firebird.attach(FB, (err, db) => {
  if (err) return rej(err)
  db.query(sql, [], (e, r) => { db.detach(); e ? rej(e) : res(r) })
}))

// o dump veio com U+FFFD no lugar dos acentos; tabela de reposicao pelos nomes reais
const ACENTO = [
  ['TRANSMISS�O', 'TRANSMISSÃO'], ['DI�RIAS', 'DIÁRIAS'], ['CAPTA��O', 'CAPTAÇÃO'],
  ['ALIMENTA��O', 'ALIMENTAÇÃO'], ['COMISS�O', 'COMISSÃO'], ['DIVULGA��O', 'DIVULGAÇÃO'],
  ['PRESTA��O DE SERVI�O', 'PRESTAÇÃO DE SERVIÇO'], ['COMBUST�VEL', 'COMBUSTÍVEL'],
  ['PED�GIO', 'PEDÁGIO'], ['GAR�ON', 'GARÇON'], ['ESPA�O', 'ESPAÇO'],
  ['EMISS�O', 'EMISSÃO'], ['SERVI�OS', 'SERVIÇOS'], ['LICEN�AS', 'LICENÇAS'],
  ['ESCRIT�RIO', 'ESCRITÓRIO'], ['BONIFICA��O', 'BONIFICAÇÃO'], ['AQUISI��O', 'AQUISIÇÃO'],
  ['RESCIS�O', 'RESCISÃO'], ['SAL�RIO', 'SALÁRIO'], ['MANUTEN��O', 'MANUTENÇÃO'],
]
const FIX = (s) => ACENTO.reduce((a, [de, para]) => a.split(de).join(para), s).replace(/�/g, 'Ç')

const cats = await fb('select FCT_CODIGO C, FCT_DESCRICAO D, FCT_CODIGO_PAI P from FIN_CATEGORIAS')
const catD = new Map(cats.map((c) => [T(c.C), FIX(T(c.D))]))
const catP = new Map(cats.map((c) => [T(c.C), T(c.P)]))
const caminho = (c) => {
  const p = catP.get(c)
  return (p && catD.has(p) ? catD.get(p) + ' > ' : '') + (catD.get(c) || '(sem categoria)')
}
const titulos = (await fb(`select TIT_VALOR V, TIT_DT_VENCTO DV, TIT_DT_COMPETENCIA DC,
   FCT_CODIGO FC, TIT_DESCRICAO DS from FIN_TITULOS where FIL_CODIGO='2' and TIT_TIPO='D'`))
  .map((t) => ({ v: Number(t.V || 0), dv: t.DV ? new Date(t.DV) : null, dc: t.DC ? new Date(t.DC) : null, cat: caminho(T(t.FC)), ds: FIX(T(t.DS)) }))
  .filter((t) => t.v > 0)

// --- ERP ------------------------------------------------------------------
const cli = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await cli.connect()
const movs = (await cli.query(`
  select mb.id, mb.data::text dt, to_char(mb.data,'YYYY-MM') m, mb.valor::numeric v,
         coalesce(cat.nome,'(sem)') cat, coalesce(cat.dre_grupo,'?') g, coalesce(mb.descricao,'') ds,
         (mb.transferencia_par_id is not null) tpar
  from erp_movimentos_bancarios mb left join erp_categorias cat on cat.id=mb.categoria_id
  where mb.tipo='saida' and mb.data>='2026-01-01' and mb.data<'2026-09-01'`)).rows
const faturas = (await cli.query(`
  select competencia m, round(coalesce(valor_pago,total_fatura)::numeric,2) v
  from erp_cartao_faturas where competencia between '2026-01' and '2026-08'`)).rows
const cartaoCat = (await cli.query(`
  select f.competencia m, coalesce(cat.nome,'(sem categoria)') cat, round(sum(l.valor)::numeric,2) v
  from erp_cartao_lancamentos l join erp_cartao_faturas f on f.id=l.fatura_id
  left join erp_categorias cat on cat.id=l.categoria_id
  where l.tipo='compra' and f.competencia between '2026-01' and '2026-08'
  group by 1,2`)).rows
await cli.end()

// --- 1) rotula cada movimento com a categoria do HastaPro -----------------
const dias = (a, b) => Math.abs((a - b) / 86400000)
const rotuloPorValor = new Map()
for (const mv of movs) {
  const d = new Date(mv.dt)
  const cand = titulos.find((t) => Math.abs(t.v - Number(mv.v)) < 0.02 && ((t.dv && dias(t.dv, d) <= 12) || (t.dc && dias(t.dc, d) <= 40)))
  if (cand) {
    const k = Number(mv.v).toFixed(2)
    if (!rotuloPorValor.has(k)) rotuloPorValor.set(k, cand)
  }
}
const hp = (mv) => rotuloPorValor.get(Number(mv.v).toFixed(2)) || null

// --- 2) classifica nos grupos da DRE --------------------------------------
// Guias lidas uma a uma no extrato (data|valor). Separar DARF de funcionarios do
// DAS/ISS da empresa e o que decide se a linha e ENCARGO de folha ou IMPOSTO.
const ENCARGO_FOLHA = new Set(['01-20|946.32', '02-09|1370.48', '03-02|2255.49', '04-01|2117.21',
  '05-05|2117.21', '06-09|2272.89', '07-01|2225.46', '07-01|938.67', '08-20|1114.60', '08-03|26.49'])
const DAS = new Set(['02-12|14741.92', '03-11|29884.16', '04-14|2470.92', '05-18|12078.62',
  '06-22|15362.21', '07-20|28660.03', '08-20|55846.64'])
const ISS = new Set(['02-12|3008.55', '03-11|9366.25', '04-14|768.86', '05-07|5187.27',
  '06-09|6689.01', '07-13|12566.78', '08-17|24524.81'])

const tem = (s, ...w) => w.some((x) => s.toUpperCase().includes(x))
const LINHAS = {}
const detalhe = {}
const lanca = (linha, m, v, rotulo) => {
  LINHAS[linha] = LINHAS[linha] || {}
  LINHAS[linha][m] = r2((LINHAS[linha][m] || 0) + v)
  if (rotulo) {
    const k = linha + '||' + rotulo
    detalhe[k] = detalhe[k] || {}
    detalhe[k][m] = r2((detalhe[k][m] || 0) + v)
  }
}

for (const mv of movs) {
  const v = Number(mv.v), m = mv.m, cat = mv.cat, ds = mv.ds
  const h = hp(mv)
  const hcat = h ? h.cat : ''
  const hds = h ? h.ds : ''

  // fora da DRE: transferencia, aplicacao, e o que tem linha propria
  if (mv.tpar || cat.startsWith('Transferencias') || tem(cat, 'RESGATE APLICACAO', 'APLICACAO FINANCEIRA')) continue
  if (mv.g === 'imposto') {
    const chave = mv.dt.slice(5) + '|' + v.toFixed(2)
    if (ENCARGO_FOLHA.has(chave)) { lanca('Encargos (FGTS / INSS / DARF)', m, v, 'DARF / FGTS de funcionários'); continue }
    if (tem(ds, 'ALVARA')) { lanca('Escritório', m, v, 'Alvará e taxas'); continue }
    lanca('(fora) Imposto pago no extrato', m, v,
      DAS.has(chave) ? 'Simples Nacional (DAS)' : ISS.has(chave) ? 'ISSQN'
      : v > 50000 ? 'Receita Federal — A IDENTIFICAR' : 'Tributos a identificar')
    continue
  }
  if (cat === 'Comissões' || cat === 'Repasse Assessorias/Parceiros') continue  // linha propria
  if (cat === 'Cartão de Crédito' || cat === 'Pagamento Fatura') continue       // entra pela fatura
  // rescisao vem categorizada como folha no extrato — precisa sair ANTES do skip,
  // senao a verba rescisoria some junto com o salario (que entra por competencia)
  // rescisoes identificadas uma a uma (data|valor): as de Fatima vem sem descricao,
  // so o nome da pessoa no movimento denuncia — e 1.065,00 + 7.519,83 sao exatamente
  // os R$ 8.584,83 que o chefe lancou como "Recisao Fatima".
  const RESCISAO = new Set(['03-03|7519.83', '03-03|1065.00', '04-02|6300.00', '06-16|11443.75'])
  if (tem(ds, 'RESCIS', 'ACERTO DA RESCIS', 'ACERTO SAIDA', 'ACERTO DE SAIDA') || RESCISAO.has(mv.dt.slice(5) + '|' + v.toFixed(2))) {
    lanca('Despesas Trabalhistas', m, v, 'Rescisão / acerto de saída'); continue
  }
  if (cat === 'Folha de Pagamento') {
    // Peralta e comissionado, nao folha: 17.500 em 04/02 estava na categoria errada
    if (tem(ds, 'PERALTA') || v >= 15000) { lanca('(fora) Comissão paga no extrato', m, v, 'Lançado como folha, é comissão'); continue }
    continue                                             // entra por competencia
  }
  if (cat === 'Encargos Sociais') { lanca('Encargos (FGTS / INSS / DARF)', m, v, 'DARF / FGTS de funcionários'); continue }
  if (tem(cat, 'INTEGRALIZACAO', 'TARIFAS BANCARIAS', 'JUROS E MULTAS', 'ANUIDADE CARTAO', 'ENCARGOS CARTAO', 'SEGURO CARTAO')) {
    lanca('Despesas Financeiras', m, v, cat); continue
  }

  // folha e comissao tem linha propria (competencia) — o pagamento no extrato nao entra de novo
  if (tem(hcat, 'FOLHA SALARIAL > DIÁRIAS')) { lanca('Diárias e Viagens', m, v, 'Diárias de equipe'); continue }
  if (tem(hcat, 'FOLHA SALARIAL') && !tem(hcat, 'RESCIS')) { lanca('(fora) Folha paga no extrato', m, v, hcat); continue }
  if (tem(hcat, 'COMISS')) { lanca('(fora) Comissão paga no extrato', m, v, hds || hcat); continue }
  if (tem(hds, 'CARTAO SICREDI', 'CARTÃO SICREDI')) { lanca('(fora) Comissão paga no extrato', m, v, 'Cartão Sicredi (Peralta)'); continue }
  if (tem(hcat, 'IMPOSTO') && tem(hds, 'FGTS', 'INSS', 'DARF')) { lanca('Encargos (FGTS / INSS / DARF)', m, v, 'DARF / FGTS de funcionários'); continue }

  // --- fixas
  if (tem(ds, 'UNIDAS', 'LOCALIZA') || tem(hds, 'ALUGUEL CARRO', 'ALUGUEL DE CARRO', 'LOCACAO DE CARRO', 'LOCACAO UNIDAS') || cat === 'Veiculos/Manutencao') {
    lanca('Carros', m, v, tem(ds, 'LOCALIZA') ? 'Localiza' : 'Locação de veículos (Unidas)'); continue
  }
  if (tem(hds, 'PARCELA')) { lanca('Parcelamentos', m, v, 'Parcelamento ' + (hds.match(/\d+\/\d+/)?.[0] || '')); continue }
  if (cat === 'Aluguel' && !tem(ds, 'EXPOGENETICA', 'EXPOZEBU', 'CASA')) { lanca('Escritório', m, v, 'Aluguel'); continue }
  if (cat === 'Energia/Agua/Telefone') { lanca('Escritório', m, v, tem(ds, 'VIVO', 'TELECOMUN') ? 'Telefonia' : tem(ds, 'DIGITAL NET', 'DIGITALNET') ? 'Internet' : 'Energia / água'); continue }
  if (cat === 'Material de Escritorio' || tem(hds, 'MAT ESCRIT')) { lanca('Escritório', m, v, 'Material de escritório'); continue }
  if (cat === 'Seguros' || tem(hds, 'SEGURO DA EQUIPE', 'SEGURO EQUIPE')) { lanca('Escritório', m, v, 'Seguro da equipe'); continue }
  if (tem(hds, 'FAXINA', 'LIMPEZA')) { lanca('Escritório', m, v, 'Limpeza'); continue }
  if (cat === 'Manutencao' || tem(hcat, 'MANUTEN')) { lanca('Escritório', m, v, 'Manutenção e obras'); continue }
  if (tem(hcat, 'BONIFICA')) { lanca('Escritório', m, v, 'Bonificação'); continue }
  if (tem(hcat, 'ALUGUEL CARRO')) { lanca('Carros', m, v, 'Locação de veículos'); continue }
  if (cat === 'Software/Assinaturas' || cat === 'Informatica/Eletronicos' || tem(hcat, 'LICEN')) { lanca('Tecnologia', m, v, 'Software e assinaturas'); continue }
  if (tem(ds, 'CONTADOR', 'LUCAS MONTEIRO') || tem(hds, 'CONTADOR')) { lanca('Contabilidade', m, v, 'Honorários contábeis'); continue }
  if (cat === 'Servicos de Terceiros') { lanca('Escritório', m, v, 'Serviços de terceiros'); continue }

  // --- variaveis
  if (tem(ds, 'RESCIS', 'ACERTO BULA ASSESSORIA') || tem(hcat, 'RESCIS') || tem(hds, 'ACERTO SAIDA', 'RESCIS')) {
    lanca('Despesas Trabalhistas', m, v, tem(hds, 'ACERTO SAIDA') ? 'Acerto de saída' : 'Rescisão'); continue
  }
  if (cat === 'Viagem/Passagens' || tem(hcat, 'HOTEL', 'PASSAGENS') || tem(ds, 'DIARIA', 'ESTADIA', 'HOTEL', 'PASSAGEM')) {
    lanca('Diárias e Viagens', m, v, tem(hcat, 'HOTEL') || tem(ds, 'HOTEL', 'ESTADIA') ? 'Hospedagem' : 'Passagens e diárias'); continue
  }
  if (tem(hds, 'DIARIA')) { lanca('Diárias e Viagens', m, v, 'Diárias de equipe'); continue }
  if (cat === 'Marketing e Publicidade' || tem(hcat, 'PATROCINADO', 'MARKETING', 'DIVULGA')) {
    lanca('Marketing', m, v, tem(hds, 'META ADS') || tem(ds, 'META') ? 'Meta Ads' : 'Patrocinados e campanhas'); continue
  }
  if (cat === 'Transporte (Apps)' || tem(hcat, 'UBER')) { lanca('Operacionais de leilão', m, v, 'Transporte por aplicativo'); continue }
  if (cat === 'Combustivel' || tem(hcat, 'COMBUST', 'PED')) { lanca('Operacionais de leilão', m, v, 'Combustível e pedágio'); continue }
  if (cat === 'Alimentacao/Refeicoes' || cat === 'Supermercado/Alimentos' || tem(hcat, 'ALIMENTA', 'MERCADO')) { lanca('Operacionais de leilão', m, v, 'Alimentação'); continue }
  if (cat === 'Despesa Operacional Leilão' || cat === 'REEMBOLSO' || cat === 'Aluguel' || tem(hcat, 'EVENTO', 'PRESTAÇÃO DE SERVIÇO', 'MANEJO', 'PISTEIRO')) {
    lanca('Operacionais de leilão', m, v, cat === 'REEMBOLSO' ? 'Reembolsos' : 'Estrutura e serviços de leilão'); continue
  }

  lanca('A classificar', m, v, h ? h.cat : (cat === '(sem)' ? 'sem categoria no extrato' : cat))
}

// --- 2b) titulos do HastaPro que NAO tem contrapartida no extrato ---------
// Sao despesas reais lancadas no HastaPro e pagas por fora do Sicoob (ou ainda em
// aberto). Entram para o mes de competencia, com o rotulo que o HastaPro ja tem.
const usados = movs.map((mv) => ({ v: Number(mv.v), d: new Date(mv.dt) }))
let semLastro = 0
for (const t of titulos) {
  const dref = t.dc || t.dv
  if (!dref) continue
  const m = dref.toISOString().slice(0, 7)
  if (!MES.includes(m)) continue
  if (usados.some((u) => Math.abs(u.v - t.v) < 0.02 && dias(u.d, dref) <= 20)) continue
  const cat = t.cat.toUpperCase()
  const desc = t.ds.toUpperCase()
  let linha = 'A classificar', rotulo = t.cat + ' (só no HastaPro)'
  if (tem(cat, 'COMISS') || tem(desc, 'COMISS')) continue            // linha propria
  else if (tem(cat, 'RESCIS')) { linha = 'Despesas Trabalhistas'; rotulo = 'Rescisão (HastaPro)' }
  else if (tem(cat, 'FOLHA SALARIAL') || tem(desc, 'SALARIO', 'SALÁRIO')) continue // folha por competencia
  else if (tem(cat, 'IMPOSTO', 'SIMPLES', 'ISSQN', 'DAEMS')) continue // linha propria
  else if (tem(cat, 'HOTEL', 'PASSAGENS', 'DIÁRIAS', 'DIARIAS')) { linha = 'Diárias e Viagens'; rotulo = 'Hospedagem e passagens (HastaPro)' }
  else if (tem(cat, 'DIVULGA', 'PATROCINADO', 'MARKETING')) { linha = 'Marketing'; rotulo = 'Mídia e patrocínio (HastaPro)' }
  else if (tem(cat, 'LICEN')) { linha = 'Tecnologia'; rotulo = 'Licenças (HastaPro)' }
  else if (tem(cat, 'ALUGUEL CARRO', 'COMBUST')) { linha = 'Carros'; rotulo = 'Veículos (HastaPro)' }
  else if (tem(cat, 'EVENTO', 'PRESTAÇÃO DE SERVIÇO', 'ALIMENTA', 'DESLOCAMENTO', 'MANEJO', 'PISTEIRO', 'UBER', 'PEDÁGIO')) { linha = 'Operacionais de leilão'; rotulo = 'Estrutura e serviços (HastaPro)' }
  else if (tem(cat, 'PARTICULAR', 'FAZENDA')) continue               // fora do escopo Bula Assessoria
  else if (tem(cat, 'ESCRITÓRIO')) { linha = 'Escritório', rotulo = 'Escritório (HastaPro)' }
  lanca(linha, m, t.v, rotulo)
  semLastro += t.v
}

// --- 3) cartao de credito: entra pelo QUE FOI COMPRADO --------------------
// A fatura e debito automatico no Sicoob e ja foi excluida do extrato acima, entao
// distribuir os lancamentos por categoria nao duplica caixa. Tratar a fatura inteira
// como "comissao do Bulinha" (regra do ERP) esconderia R$ 141 mil de viagem e midia
// em jan-abr, meses em que a receita nem chegava perto disso.
const DESTINO_CARTAO = {
  'Viagem/Passagens': ['Diárias e Viagens', 'Passagens e hospedagem (cartão)'],
  'Marketing e Publicidade': ['Marketing', 'Mídia paga (cartão)'],
  'Software/Assinaturas': ['Tecnologia', 'Software e assinaturas (cartão)'],
  'Informatica/Eletronicos': ['Tecnologia', 'Equipamentos (cartão)'],
  'Alimentacao/Refeicoes': ['Operacionais de leilão', 'Alimentação (cartão)'],
  'Supermercado/Alimentos': ['Operacionais de leilão', 'Alimentação (cartão)'],
  'Combustivel': ['Carros', 'Combustível (cartão)'],
  'Veiculos/Manutencao': ['Carros', 'Manutenção de veículos (cartão)'],
}
for (const r of cartaoCat) {
  const [linha, rotulo] = DESTINO_CARTAO[r.cat] || ['A classificar', 'Compras no cartão sem categoria']
  lanca(linha, r.m, Number(r.v), rotulo)
}

// --- 4) o outro criterio possivel, so para conferencia --------------------
const CARTAO = {}
for (const f of faturas) CARTAO[f.m] = r2((CARTAO[f.m] || 0) + Number(f.v))
// jul e ago liquidam CP analiticos ja contados na competencia (origem sintetico)
const CARTAO_COMISSAO = {}
for (const m of MES) if (m <= '2026-06') CARTAO_COMISSAO[m] = CARTAO[m] || 0

// --- saida ----------------------------------------------------------------
const arr = (o) => MES.map((m) => r2(o[m] || 0))
const out = {
  gerado_em: new Date().toISOString(),
  meses: MES,
  linhas: Object.fromEntries(Object.entries(LINHAS).map(([k, v]) => [k, arr(v)])),
  detalhe: Object.fromEntries(Object.entries(detalhe).map(([k, v]) => [k, arr(v)])),
  cartao_fatura: arr(CARTAO),
  cartao_por_categoria: (() => {
    const o = {}
    for (const r of cartaoCat) { o[r.cat] = o[r.cat] || {}; o[r.cat][r.m] = r2((o[r.cat][r.m] || 0) + Number(r.v)) }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, arr(v)]))
  })(),
  cartao_comissao_bulinha: arr(CARTAO_COMISSAO),
  cobertura: {
    movimentos_lidos: movs.length,
    titulos_hastapro: titulos.length,
    valores_rotulados_pelo_hastapro: rotuloPorValor.size,
    hastapro_sem_lastro_no_extrato: r2(semLastro),
  },
}
fs.mkdirSync('outputs/dre-2026', { recursive: true })
fs.writeFileSync('outputs/dre-2026/despesas-apuradas.json', JSON.stringify(out, null, 1))

const f = (v) => (v || 0).toFixed(2).padStart(12)
console.log('LINHA'.padEnd(28) + MES.map((m) => m.slice(5).padStart(12)).join('') + '       TOTAL')
let g = 0
for (const [k, v] of Object.entries(out.linhas).sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0))) {
  const t = r2(v.reduce((a, b) => a + b, 0)); g += t
  console.log(k.padEnd(28).slice(0, 28) + v.map(f).join('') + f(t))
}
console.log('-'.repeat(28 + 12 * 9))
console.log('TOTAL DESPESAS'.padEnd(28) + MES.map((_, i) => f(Object.values(out.linhas).reduce((a, v) => a + v[i], 0))).join('') + f(g))
console.log('\nCartão (fatura paga)'.padEnd(29) + out.cartao_fatura.map(f).join(''))
console.log('  → comissão do Bulinha'.padEnd(29) + out.cartao_comissao_bulinha.map(f).join(''))
console.log('\nCobertura:', JSON.stringify(out.cobertura))
console.log('\nDetalhe por rótulo:')
for (const [k, v] of Object.entries(out.detalhe).sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0)))
  console.log('  ' + k.replace('||', ' · ').padEnd(58).slice(0, 58) + f(r2(v.reduce((a, b) => a + b, 0))))
