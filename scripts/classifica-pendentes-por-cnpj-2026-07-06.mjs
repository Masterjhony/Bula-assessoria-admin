// Classifica em lote os movimentos 'pendente' do extrato (Sicoob/Sicredi) usando a
// contraparte resolvida por CNPJ (minhareceita/BrasilAPI, resolvido em 06/07/2026) e
// memos do extrato. Movimentos classificados aqui ficam status_conciliacao='classificado'
// (categoria confiável, SEM casar título) — exceto o link exato Douglas folha maio.
// O que não tem pista objetiva (CPF sem memo, boletos sem contraparte) PERMANECE pendente.
//
// Uso: DRY_RUN=1 node scripts/classifica-pendentes-por-cnpj-2026-07-06.mjs | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const CAT = {
  ALIMENTACAO: 'b26ffe87-f4d6-4060-b697-a7f698c35f7d',
  TRANSPORTE_APPS: '39139125-e4b4-4b9c-9438-28d775e9e637',
  COMBUSTIVEL: '9dcb4575-515f-417b-9cbe-85a4aa36a861',
  IMPOSTOS: '6d3270c8-2680-4cdd-a709-5b1520d1f430',
  MARKETING: '82d7c557-e8b4-40aa-963e-928b44b1bf54',
  MANUTENCAO: 'ac2ea403-0f8a-4fc5-b613-7adc78c81f99',
  MATERIAL_ESCRITORIO: '4fd816cb-4b5a-4983-852d-5f3bbc9d91b8',
  SOFTWARE: '0edf60f2-bf96-44bd-8f93-ca5432b69830',
  VIAGEM: '98083139-0fbf-487a-9988-a08519ebf259',
  SERVICOS_TERCEIROS: '1f72e05d-01ed-474b-bc83-90974be930f9',
  OUTRAS: '20c2defd-415c-42cc-8939-fcd8cf104280',
  FOLHA: '4c79d95f-a8a4-4aff-9f7a-cd82f974c4b3',
  COMISSAO_FUNC: 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e',
  DESP_OP_LEILAO: '562264eb-8134-4990-a56b-d884279acf90',
  ENERGIA_TELEFONE: 'fc04a834-ddb9-4311-a6de-29bb87785088',
}

// CNPJ (14 dígitos) -> { cat, nome } — resolvidos via minhareceita em 06/07/2026
const POR_CNPJ = {
  // Alimentação / restaurantes / mercados
  '20044911000128': { cat: CAT.ALIMENTACAO, nome: 'RESTAURANTE BEZERROS E EVENTOS' },
  '33780388000140': { cat: CAT.ALIMENTACAO, nome: 'PAO & TAL CONVENIENCIAS' },
  '19898031000130': { cat: CAT.ALIMENTACAO, nome: 'MARCIA RAQUEL SOBRINHO AVILA (restaurante)' },
  '09477652000196': { cat: CAT.ALIMENTACAO, nome: 'SDB COMERCIO DE ALIMENTOS' },
  '20205435000180': { cat: CAT.ALIMENTACAO, nome: 'SAO PAULO AIRPORT RESTAURANTES' },
  '46285765000116': { cat: CAT.ALIMENTACAO, nome: 'VIENA RESTAURANTES' },
  '59331746000120': { cat: CAT.ALIMENTACAO, nome: 'CHEIRO DA ROCA RESTAURANTE' },
  '12333573000116': { cat: CAT.ALIMENTACAO, nome: 'RODRIGO LANCHES' },
  '30774098000103': { cat: CAT.ALIMENTACAO, nome: 'CHURRASCARIA ESTRELA DO SUL' },
  '07314160000154': { cat: CAT.ALIMENTACAO, nome: 'JFE BAR' },
  '10472929000177': { cat: CAT.ALIMENTACAO, nome: 'PADARIA PAO MIX' },
  '63849099000110': { cat: CAT.ALIMENTACAO, nome: 'L&Y COMERCIO (alimentos)' },
  '13557705000156': { cat: CAT.ALIMENTACAO, nome: 'DANIEL APARECIDO ANANIAS (mercado)' },
  '47508411000156': { cat: CAT.ALIMENTACAO, nome: 'COMPANHIA BRASILEIRA DE DISTRIBUICAO (Pão de Açúcar)' },
  '20495904000142': { cat: CAT.ALIMENTACAO, nome: 'PAO CORUJA' },
  '28053702000152': { cat: CAT.ALIMENTACAO, nome: 'DIAS E DIAS RESTAURANTE' },
  '19123290000199': { cat: CAT.ALIMENTACAO, nome: 'IPE DOURADO CAFE E RESTAURANTE' },
  '34767927000173': { cat: CAT.ALIMENTACAO, nome: 'RESTAURANTE ZITAO' },
  '37803021000155': { cat: CAT.ALIMENTACAO, nome: 'MG CAFETERIA' },
  '37803021000406': { cat: CAT.ALIMENTACAO, nome: 'MG CAFETERIA' },
  '23547554000885': { cat: CAT.ALIMENTACAO, nome: 'FAST RESTAURANTES' },
  '09571529000482': { cat: CAT.ALIMENTACAO, nome: 'GIAN PAO DE QUEIJO' },
  '08808948000180': { cat: CAT.ALIMENTACAO, nome: 'MERCEARIA MINORU' },
  '01400064000142': { cat: CAT.ALIMENTACAO, nome: 'CHURRASCARIA BEZERRO DE OURO' },
  '29432228000132': { cat: CAT.ALIMENTACAO, nome: 'MARRUA GOURMET' },
  '26356125000142': { cat: CAT.ALIMENTACAO, nome: 'ZIG TECNOLOGIA (consumo evento cashless)' },
  // Transporte / combustível
  '17895646000187': { cat: CAT.TRANSPORTE_APPS, nome: 'UBER DO BRASIL' },
  '60537263000166': { cat: CAT.TRANSPORTE_APPS, nome: 'ALLPARK (estacionamento)' },
  '04990440000194': { cat: CAT.COMBUSTIVEL, nome: 'ANCELMO & PAULINO (posto)' },
  '09415377000186': { cat: CAT.COMBUSTIVEL, nome: 'POSTO TAJI' },
  '13251453000132': { cat: CAT.COMBUSTIVEL, nome: 'AUTO POSTO GUAVIRA' },
  // Governo / taxas
  '00360305000104': { cat: CAT.IMPOSTOS, nome: 'CAIXA ECONOMICA FEDERAL (FGTS/guias)' },
  '01560393000150': { cat: CAT.IMPOSTOS, nome: 'DETRAN-SE (licenciamento)' },
  '23402452000103': { cat: CAT.IMPOSTOS, nome: 'CARTORIO ELDER GOMES DUTRA' },
  // Marketing
  '13347016000117': { cat: CAT.MARKETING, nome: 'FACEBOOK/META ADS' },
  '05382901000109': { cat: CAT.MARKETING, nome: 'FABRA FOTOGRAFIA' },
  // Estrutura / manutenção escritório
  '54908283000101': { cat: CAT.MANUTENCAO, nome: 'C J DA SILVA OMIDO (mat. construção)' },
  '50546148000102': { cat: CAT.MANUTENCAO, nome: 'BAROLI DECORACOES' },
  '05434101000194': { cat: CAT.MANUTENCAO, nome: 'AMGL MATERIAIS ELETRICOS' },
  '37533866000178': { cat: CAT.MANUTENCAO, nome: 'VITORIA COMERCIO DE TINTAS' },
  '55410042000192': { cat: CAT.MANUTENCAO, nome: 'DIRCEU GONCALVES (ferragens)' },
  '92660406000119': { cat: CAT.MANUTENCAO, nome: 'FRIGELAR' },
  '11984095000141': { cat: CAT.MANUTENCAO, nome: 'ELINAFONSO UTILIDADES' },
  '06101755000169': { cat: CAT.MATERIAL_ESCRITORIO, nome: 'KLK INFORMATICA (cartuchos)' },
  // Software / assinaturas
  '47759745000100': { cat: CAT.SOFTWARE, nome: 'QMS INTERNACIONAL (software)' },
  '10314689000263': { cat: CAT.SOFTWARE, nome: 'ESAPIENS TECNOLOGIA' },
  // Hospedagem / viagem
  '11046194000182': { cat: CAT.VIAGEM, nome: 'SEIBT & CIA (hotel)' },
  // Pessoal / assessores (conta-corrente do assessor — revisar se inclui itens de marketing)
  '59791094000107': { cat: CAT.COMISSAO_FUNC, nome: 'FO ASSESSORIA PECUARIA (Fábio Omena)' },
  '50938748000108': { cat: CAT.FOLHA, nome: 'BISPO AGRONEGOCIOS (Douglas Bispo)' },
  // Bem-estar/benefícios/outros
  '64379994000181': { cat: CAT.OUTRAS, nome: 'REABILITE (fisioterapia)' },
  '12900936000158': { cat: CAT.OUTRAS, nome: 'ESTUDIO RUNNERS (academia)' },
  '09258671000121': { cat: CAT.OUTRAS, nome: 'DERMA HOUSE' },
  '60223346000180': { cat: CAT.OUTRAS, nome: 'SMART PADEL' },
  '03272556000559': { cat: CAT.OUTRAS, nome: 'ARQUIDIOCESE DE CAMPO GRANDE (doação)' },
}

// CPFs mascarados com padrão conhecido (memos recorrentes)
const POR_CPF = {
  '***.514.801-**': { cat: CAT.SERVICOS_TERCEIROS, nome: 'prestadora limpeza/passes escritório (memos: faxina, passes, reembolso Uber)' },
  '***.770.065-**': { cat: CAT.DESP_OP_LEILAO, nome: 'Douglas Bispo Carvalho (reembolso despesas leilão)' },
  '***.113.541-**': { cat: CAT.COMISSAO_FUNC, nome: 'Leonardo Serafim (CPF)' },
  '***.968.420-**': { cat: CAT.MARKETING, nome: 'Gabriel Capera (marketing)' },
  '***.434.851-**': { cat: CAT.ALIMENTACAO, nome: 'café do escritório (memo)' },
  '***.640.158-**': { cat: CAT.MARKETING, nome: 'luminosos/painéis marca Bula (memos)' },
  '***.684.391-**': { cat: CAT.VIAGEM, nome: 'adiantamento de viagem (memo)' },
  '***.589.246-**': { cat: CAT.DESP_OP_LEILAO, nome: 'casa Uberaba - Expozebu (memo)' },
}

// Link exato: folha Douglas maio (3.600 em 04/05) <-> CP BULA-2026-CP-FOLHA-002 (já paga)
const LINK_DOUGLAS_MAIO = { movId: 'b086c542', cpDoc: 'BULA-2026-CP-FOLHA-002' }

const { data: pend } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,tipo,valor,descricao,observacoes')
  .eq('status_conciliacao', 'pendente').order('data')
console.log(`${DRY_RUN ? '*** DRY RUN ***' : '*** GRAVANDO ***'}  pendentes: ${pend.length}\n`)

let classified = 0, kept = 0
const porCat = {}
for (const m of pend) {
  const doc = (m.observacoes || '').match(/Documento contraparte: ([^|]+)/)?.[1]?.trim() || ''
  const digits = doc.replace(/\D/g, '')
  const memo = ((m.observacoes || '').match(/Obs: ([^|]+)/)?.[1] || '').trim()
  let rule = null
  if (digits.length === 14 && POR_CNPJ[digits]) rule = POR_CNPJ[digits]
  else if (POR_CPF[doc]) rule = POR_CPF[doc]
  else if (/digital\s*net/i.test(m.descricao + memo)) rule = { cat: CAT.ENERGIA_TELEFONE, nome: 'DIGITAL NET (internet)' }
  if (!rule) { kept++; continue }

  porCat[rule.nome.split(' (')[0]] = (porCat[rule.nome.split(' (')[0]] || 0) + 1
  classified++
  if (DRY_RUN) { console.log(`[~] ${m.data} ${brl(m.valor).padStart(12)} -> ${rule.nome.slice(0, 55)}`); continue }
  const { error } = await sb.from('erp_movimentos_bancarios').update({
    categoria_id: rule.cat,
    status_conciliacao: 'classificado',
    conciliado: true,
    observacoes: `${m.observacoes || ''} | Contraparte identificada (CNPJ/memo 06/07/2026): ${rule.nome}`,
    updated_at: new Date().toISOString(),
  }).eq('id', m.id)
  if (error) throw new Error(`${m.id}: ${error.message}`)
}

// link Douglas folha maio
const { data: cpD } = await sb.from('erp_contas_pagar').select('id,status').eq('numero_documento', LINK_DOUGLAS_MAIO.cpDoc).maybeSingle()
const { data: movD } = await sb.from('erp_movimentos_bancarios').select('id,valor,data,status_conciliacao')
  .eq('data', '2026-05-04').eq('tipo', 'saida').eq('valor', 3600).maybeSingle()
if (cpD && movD) {
  if (DRY_RUN) console.log(`\n[link] mov ${movD.data} ${brl(movD.valor)} <-> CP ${LINK_DOUGLAS_MAIO.cpDoc} (folha Douglas maio)`)
  else {
    await sb.from('erp_movimentos_bancarios').update({
      conta_pagar_id: cpD.id, status_conciliacao: 'conciliado', conciliado: true,
      categoria_id: CAT.FOLHA, updated_at: new Date().toISOString(),
    }).eq('id', movD.id)
    console.log(`[link] mov ${movD.data} ${brl(movD.valor)} CONCILIADO com CP ${LINK_DOUGLAS_MAIO.cpDoc}`)
  }
}

console.log(`\nClassificados: ${classified} | continuam pendentes: ${kept}`)
console.log('\nPor contraparte:')
for (const [k, v] of Object.entries(porCat).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}x ${k}`)
