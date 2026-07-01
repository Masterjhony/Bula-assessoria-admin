// Resolve os 66 boletos (DÉB.TIT.COMPE) do extrato Sicoob que estavam SEM
// contraparte no ERP. Beneficiário/CNPJ extraídos dos comprovantes de pagamento
// de boleto do internet banking Sicoob (API /comprovantes/detalhar), 01/07/2026.
//
// Casa cada boleto ao movimento do ERP por (data, valor), cria/vincula
// erp_pessoas (documento=CNPJ, fornecedor), grava pessoa_id, anexa o
// beneficiário + motivo em observacoes e refina categoria genérica->específica
// quando o beneficiário é inequívoco. NÃO mexe em categoria já específica.
//
// Uso: node scripts/aplica-boletos-sicoob-2026-07-01.mjs         (DRY RUN)
//      APPLY=1 node scripts/aplica-boletos-sicoob-2026-07-01.mjs (grava)

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.env.APPLY === '1'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const GENERICAS = new Set(['2be58816-f134-417c-8a1c-296e3eef78b0','9e20f375-b070-4991-95f8-723210cf9bd0','20c2defd-415c-42cc-8939-fcd8cf104280','1d16d458-64a3-4e01-b47e-83793bf077e5'])
// categoria por CNPJ do beneficiário (só mapeamentos inequívocos)
const CAT_POR_CNPJ = {
  '45702373000142': '421660db-5009-43a3-95da-48f204db6ebd', // Lucas Monteiro (contador) -> Servicos de Terceiros
  '33608308000173': '4e96d8bf-f4f7-47d9-8d1b-f8035e7be97e', // Mongeral -> Seguros
  '15413826000150': '98558af1-be73-48e7-b45b-c2687d65192c', // Energisa -> Energia/Agua/Telefone
  '08929889000106': '98558af1-be73-48e7-b45b-c2687d65192c', // Digital Net (internet) -> Energia/Agua/Telefone
  '05606095000105': '98558af1-be73-48e7-b45b-c2687d65192c', // Clickweb -> Energia/Agua/Telefone
  '47107220000182': '98558af1-be73-48e7-b45b-c2687d65192c', // Dharma/Clickweb -> Energia/Agua/Telefone
  '05516218000117': '0edf60f2-bf96-44bd-8f93-ca5432b69830', // Docusign -> Software/Assinaturas
  '15529191000150': '4e24b45a-435f-417d-9e30-7c9b15a8f72e', // Canale Imoveis -> Aluguel
  '00127531000140': '98083139-0fbf-487a-9988-a08519ebf259', // Hotel Campo Grande -> Viagem/Passagens
  '03632925000143': '98083139-0fbf-487a-9988-a08519ebf259', // Busse Hotelaria -> Viagem/Passagens
}
// dados dos comprovantes: [data, valor, beneficiario, cnpj, obs]
const BOLETOS = [
["2026-06-30","1168.00","HOTEL CAMPO GRANDE","00.127.531/0001-40","Hotel Leonardo JMP"],
["2026-06-12","1188.71","1 OFICIO DE REGISTRO PUBLICO","73.618.977/0001-40","NF 129537 Hotel Fabio 8a15do5"],
["2026-06-02","394.80","DIGITAL NET INTERNET SERVICE PROVIDER LTDA","08.929.889/0001-06","Digital Net"],
["2026-06-02","2872.63","SAFRA CFI S.A.","45.437.547/0001-97","financ Compass"],
["2026-06-02","1412.45","UNIDAS LOCADORA SA","45.736.131/0001-70","Unidas Leonardo ExpoZebu"],
["2026-06-01","208.66","DHARMA PARTICIPACOES E SOLUCOES DIGITAIS LTDA","47.107.220/0001-82","Clickweb"],
["2026-06-01","5.60","UNIDAS LOCADORA SA","45.736.131/0001-70","Unidas valor residual"],
["2026-05-11","260.32","UNIDAS LOCADORA SA","45.736.131/0001-70","multa transito Fabio"],
["2026-05-07","267.56","UNIDAS LOCADORA SA","45.736.131/0001-70","Unidas multa Kallel"],
["2026-05-07","260.32","UNIDAS LOCADORA SA","45.736.131/0001-70","Unidas multa Kallel"],
["2026-05-04","208.66","CLICKWEB SERVICOS DE INFORMATICA INTERNET LTDA","05.606.095/0001-05","Clickweb"],
["2026-05-04","2872.63","SAFRA CFI S.A.","45.437.547/0001-97","financ Compass"],
["2026-05-04","383.40","MONGERAL S A","33.608.308/0001-73","seguro equipe Mongeral"],
["2026-05-04","1058.00","LUCAS MONTEIRO 35690154830","45.702.373/0001-42","honorario contador"],
["2026-05-04","394.80","DIGITAL NET INTERNET SERVICE PROVIDER LTDA","08.929.889/0001-06","Digital Net"],
["2026-04-06","394.80","DIGITAL NET INTERNET SERVICE PROVIDER LTDA","08.929.889/0001-06","DigitalNet"],
["2026-04-06","1263.79","MOVIDA PARTICIPACOES S A","21.314.559/0001-66","Movida locacao"],
["2026-04-01","1058.00","LUCAS MONTEIRO 35690154830","45.702.373/0001-42","contador"],
["2026-04-01","319.50","MONGERAL S A","33.608.308/0001-73","seguro Mongeral"],
["2026-04-01","2872.63","SAFRA CFI S.A.","45.437.547/0001-97","financ Compass"],
["2026-04-01","260.32","UNIDAS LOCADORA SA","45.736.131/0001-70","multa Kallel Unidas"],
["2026-04-01","1842.00","BUSSE HOTELARIA LTDA","03.632.925/0001-43","hotel NF 33520 Leonardo"],
["2026-03-10","293.46","MOVIDA PARTICIPACOES S A","21.314.559/0001-66","multa transito Peralta"],
["2026-03-09","95.77","DOCUSIGN BRASIL SOLUCOES EM TECNOLOGIA","05.516.218/0001-17","Docusign"],
["2026-03-09","563.23","DOCUSIGN BRASIL SOLUCOES EM TECNOLOGIA","05.516.218/0001-17","Docusign"],
["2026-03-09","2490.00","BUSSE HOTELARIA LTDA","03.632.925/0001-43","NF 26492 Hotel Brumado"],
["2026-03-02","319.50","MONGERAL S A","33.608.308/0001-73","seguro Mongeral"],
["2026-03-02","1945.04","UNIDAS LOCADORA SA","45.736.131/0001-70","Unidas"],
["2026-03-02","3316.96","UNIDAS LOCADORA SA","45.736.131/0001-70","Unidas"],
["2026-03-02","2872.63","SAFRA CFI S.A.","45.437.547/0001-97","financ Compass"],
["2026-03-02","1058.00","LUCAS MONTEIRO 35690154830","45.702.373/0001-42","contador"],
["2026-03-02","249.91","UNIDAS LOCADORA SA","45.736.131/0001-70","multa transito Kallel"],
["2026-03-02","632.00","ECOMEL COMERCIO E SERVICOS LTDA","03.138.670/0001-67","NF 301692 Ecomel"],
["2026-03-02","1265.78","UNIDAS LOCADORA SA","45.736.131/0001-70","locacao Unidas"],
["2026-03-02","394.80","DIGITAL NET INTERNET SERVICE PROVIDER LTDA","08.929.889/0001-06","Digital Net Afonso Pena"],
["2026-02-11","95.75","DOCUSIGN BRASIL SOLUCOES EM TECNOLOGIA","05.516.218/0001-17","Docusign"],
["2026-02-11","563.25","DOCUSIGN BRASIL SOLUCOES EM TECNOLOGIA","05.516.218/0001-17","Docusign"],
["2026-02-10","924.00","BIG FIELD DIST DE BEBIDAS","55.215.152/0001-01","NF 107737 Big Field"],
["2026-02-09","1843.89","ECOMEL COMERCIO E SERVICOS LTDA","03.138.670/0001-67","NF 299671 Ecomel"],
["2026-02-09","287.00","BUSSE HOTELARIA LTDA","03.632.925/0001-43","NF 127179 Hotel So Criador"],
["2026-02-05","208.66","CLICKWEB SERVICOS DE INFORMATICA INTERNET LTDA","05.606.095/0001-05","Clickweb"],
["2026-02-05","1136.60","ENERGISA MS","15.413.826/0001-50","Energisa 15 Novembro"],
["2026-02-05","394.80","DIGITAL NET INTERNET SERVICE PROVIDER LTDA","08.929.889/0001-06","Digital Net"],
["2026-02-02","319.50","MONGERAL S A","33.608.308/0001-73","seguro Mongeral"],
["2026-02-02","2872.63","SAFRA CFI S.A.","45.437.547/0001-97","financ Compass"],
["2026-02-02","6116.12","CANALE IMOVEIS LTDA","15.529.191/0001-50","aluguel escritorio"],
["2026-02-02","1058.00","LUCAS MONTEIRO 35690154830","45.702.373/0001-42","contador"],
["2026-01-21","3313.20","UNIDAS LOCADORA SA","45.736.131/0001-70","Unidas locacao Diego"],
["2026-01-20","124.96","UNIDAS LOCADORA SA","45.736.131/0001-70","multa 2do12 Diego"],
["2026-01-12","563.25","DOCUSIGN BRASIL SOLUCOES EM TECNOLOGIA","05.516.218/0001-17","Docusign"],
["2026-01-12","95.75","DOCUSIGN BRASIL SOLUCOES EM TECNOLOGIA","05.516.218/0001-17","Docusign"],
["2026-01-07","208.66","CLICKWEB SERVICOS DE INFORMATICA INTERNET LTDA","05.606.095/0001-05","Clickweb"],
["2026-01-07","1721.77","ENERGISA MS","15.413.826/0001-50","fatura Energisa"],
["2026-01-07","2872.63","SAFRA CFI S.A.","45.437.547/0001-97","financ carro Allan"],
["2026-01-07","225.00","EAO EMPREENDIMENTOS AGROPECUARIOS","00.141.269/0007-83","gado EAO"],
["2026-01-07","633.50","UNIDAS LOCADORA SA","45.736.131/0001-70","Unidas Allan"],
["2026-01-07","394.80","DIGITAL NET INTERNET SERVICE PROVIDER LTDA","08.929.889/0001-06","Digital Net"],
["2026-01-07","3823.14","SICREDI UNIAO MS TO","24.654.881/0001-22","boleto Sicredi"],
["2026-01-06","990.00","LUCAS MONTEIRO 35690154830","45.702.373/0001-42","contador"],
["2026-01-05","4985.03","UNIDAS LOCADORA SA","45.736.131/0001-70","Unidas Diego sinistro chave"],
["2026-01-05","3135.45","UNIDAS LOCADORA SA","45.736.131/0001-70","unidas 26do10 a 25do11"],
["2026-01-05","319.50","MONGERAL S A","33.608.308/0001-73","seguro equipe"],
["2026-01-05","500.00","REMAT MARCAS E PATENTES","70.364.674/0001-50","marcas e patentes"],
["2026-01-05","295.00","ECOMEL COMERCIO E SERVICOS LTDA","03.138.670/0001-67","Ecomel NF 297525"],
["2026-01-05","174.23","ECOMEL","26.235.260/0001-30","Ecomel NF 27202"],
["2026-01-05","1994.43","UNIDAS LOCADORA SA","45.736.131/0001-70","unidas 28do11 a 8do12 Allan"],
]

const { data: pessoas } = await sb.from('erp_pessoas').select('id,nome,documento,is_fornecedor')
const byDoc = new Map()
for (const p of pessoas || []) if (p.documento) byDoc.set(p.documento.replace(/\D/g, ''), p)

async function ensurePessoa(c14, nome) {
  let p = byDoc.get(c14)
  const fmt = `${c14.slice(0,2)}.${c14.slice(2,5)}.${c14.slice(5,8)}/${c14.slice(8,12)}-${c14.slice(12)}`
  if (p) {
    if ((!p.documento || !p.is_fornecedor) && APPLY) await sb.from('erp_pessoas').update({ documento: p.documento || fmt, is_fornecedor: true }).eq('id', p.id)
    return p.id
  }
  if (!APPLY) { const fake = { id: `NOVA:${nome}` }; byDoc.set(c14, fake); return fake.id }
  const { data, error } = await sb.from('erp_pessoas').insert({ tipo: 'pj', nome, razao_social: nome, documento: fmt, is_fornecedor: true, ativo: true, observacoes: 'Cadastro via boletos Sicoob 01/07/2026' }).select('id').single()
  if (error) throw new Error(`pessoa ${nome}: ${error.message}`)
  byDoc.set(c14, { id: data.id }); return data.id
}

// movimentos de boleto sem pessoa
const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,valor,descricao,observacoes,categoria_id,pessoa_id,status_conciliacao')
  .eq('conta_bancaria_id', SICOOB).eq('tipo', 'saida').is('pessoa_id', null)
const boletoMovs = movs.filter((m) => /TIT\.?COMPE|COMPE\.EFETI/i.test(m.descricao || ''))
const usados = new Set()
let vinc = 0, refinCat = 0, naoAchou = 0
const novas = new Set(), semMatch = []

for (const [data, valorStr, benef, cnpjFmt, obs] of BOLETOS) {
  const valor = parseFloat(valorStr)
  const mv = boletoMovs.find((m) => !usados.has(m.id) && m.data === data && Math.abs(Number(m.valor) - valor) < 0.005)
  if (!mv) { naoAchou++; semMatch.push(`${data} ${valorStr} ${benef}`); continue }
  usados.add(mv.id)
  const c14 = cnpjFmt.replace(/\D/g, '')
  const pid = await ensurePessoa(c14, benef)
  if (typeof pid === 'string' && pid.startsWith('NOVA:')) novas.add(benef)
  const novaObs = `${(mv.observacoes || '').trim()}${mv.observacoes ? ' | ' : ''}Beneficiário: ${benef} (${cnpjFmt})${obs ? ' - ' + obs : ''}`.trim()
  const upd = { pessoa_id: String(pid).startsWith('NOVA:') ? null : pid, observacoes: novaObs, updated_at: new Date().toISOString() }
  const catId = CAT_POR_CNPJ[c14]
  if (catId && GENERICAS.has(mv.categoria_id)) { upd.categoria_id = catId; refinCat++ }
  if (APPLY && upd.pessoa_id) await sb.from('erp_movimentos_bancarios').update(upd).eq('id', mv.id)
  vinc++
}

console.log(`\n${APPLY ? '=== APLICADO ===' : '=== DRY RUN ==='}`)
console.log(`Boletos no comprovante : ${BOLETOS.length}`)
console.log(`Movimentos boleto s/ pessoa no ERP: ${boletoMovs.length}`)
console.log(`  Casados e vinculados : ${vinc}`)
console.log(`  Categorias refinadas : ${refinCat}`)
console.log(`  Pessoas novas        : ${novas.size}`)
console.log(`  Boletos SEM match no ERP: ${naoAchou}`)
if (semMatch.length) semMatch.forEach((s) => console.log('    - ' + s))
if (!APPLY) { console.log('\n  Fornecedores (novos):'); [...novas].forEach((n) => console.log('    - ' + n)) }
