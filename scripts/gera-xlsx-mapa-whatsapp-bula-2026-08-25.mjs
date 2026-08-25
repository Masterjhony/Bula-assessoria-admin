// Mapa dos grupos e das pessoas da operação da Bula no WhatsApp (sessão joao-automation).
// Lê os JSONs apurados na análise de 25/08/2026 e gera a planilha de apoio ao
// organograma e aos fluxogramas.
// Uso: node scripts/gera-xlsx-mapa-whatsapp-bula-2026-08-25.mjs
import fs from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import XLSX from 'xlsx'

const PASTA = join(homedir(), 'Desktop', 'Organograma e Fluxos - Bula Assessoria (25-08-2026)')
const DADOS = join(PASTA, '_dados')
const OUT = join(PASTA, '03 - Mapa de Grupos e Pessoas (WhatsApp).xlsx')

const groups = JSON.parse(fs.readFileSync(join(DADOS, 'bula-groups.json'), 'utf8'))
const pessoas = JSON.parse(fs.readFileSync(join(DADOS, 'pessoas.json'), 'utf8'))
const book = JSON.parse(fs.readFileSync(join(DADOS, 'phonebook.json'), 'utf8'))
const todos = JSON.parse(fs.readFileSync(join(DADOS, 'groups-joao-automation.json'), 'utf8')).groups

// frente de trabalho + finalidade de cada grupo do universo Bula
const CLASSE = {
  '120363162972078973': ['Pregão', 'Grupo-mãe de lances: pregão ao vivo com o pisteiro da leiloeira e registro da venda ("Levamos lote…")'],
  '120363425959659407': ['Time / Gestão', 'Grupo do time comercial: agenda da semana, meta do mês, material de leilão, avaliação técnica e placar de vendas'],
  '120363426408088240': ['Marketing', 'Campanha, criativo, arte de agenda e verba de tráfego'],
  '120363428091574257': ['Pregão (evento)', 'Leilão Guadalupe — catálogo, ordem de entrada, lances e resultado'],
  '120363428067530926': ['Pregão (evento)', 'Leilão Nelore Mafra — lances e negociação com o promotor'],
  '120363410689926808': ['Pregão (evento)', 'Leilão Genética Aditiva — material, ordem de entrada e lances'],
  '120363407740739645': ['Cadastro e crédito', 'Análise de cadastro/crédito dos compradores da leiloeira Bula Remates'],
  '120363426678313709': ['Cadastro e crédito', 'Análise de cadastro com a leiloeira parceira Programa Leilões'],
  '120363408594638064': ['Financeiro', 'Fechamento de leilão, faturamento por assessor, contas a receber e comissão'],
  '120363408079474506': ['Fórmula do Boi', 'Operação da genética: estoque de doses, acasalamento, contrato e divulgação'],
  '120363426815790951': ['Marketing', 'Fila de GIFs de lotes gerados pelo sistema antes do disparo'],
  '120363408309548059': ['Automação', 'Notificações do CRM: lead que respondeu, resumo do dia, decisão de cadastro, agenda automática'],
  '120363425549067303': ['Fórmula do Boi', 'Relacionamento com o criador Nelore Leão'],
  '120363427098014417': ['Fórmula do Boi', 'Central de sêmen Bela Vista — produção, logística e preço de dose'],
  '120363410755029186': ['Fórmula do Boi', 'Central Morro do Café'],
  '120363427495367508': ['Fórmula do Boi', 'Central CPEX'],
  '120363423999213423': ['Fórmula do Boi', 'Central Nelore da Nata'],
  '120363407800582023': ['Fórmula do Boi', 'Central Nelore Visual'],
  '120363406344662483': ['Fórmula do Boi', 'Central Berrante de Ouro'],
  '120363405580297926': ['Fórmula do Boi', 'Central FEGO'],
  '120363423909641808': ['Fórmula do Boi', 'Central R3'],
  '120363424393463861': ['Fórmula do Boi', 'Central Zebu dos Santos'],
  '120363405887260561': ['Fórmula do Boi', 'Central LUDEN'],
  '120363423326835578': ['Fórmula do Boi', 'Central GSOL'],
  '120363407264826093': ['Fórmula do Boi', 'Fazenda Limeira'],
  '120363406816574854': ['Suporte', 'Contábil / jurídico'],
  '120363427390428890': ['Tecnologia', 'Desenvolvimento e automação'],
  '120363424084027275': ['Marketing', 'Comercial / marketing (estrutura antiga)'],
  '120363425691724580': ['Financeiro', 'Financeiro (estrutura antiga)'],
  '120363403253244436': ['Time / Gestão', 'Vendas — Bula Assessoria (pouco uso)'],
  '120363426120722532': ['Marketing', 'Postagens e cadastro (inativo)'],
  '120363421669165957': ['Suporte', 'Processos e controle — despachante'],
  '120363314535236149': ['Marketing', 'Pagamentos de mídia'],
  '120363020550666892': ['Automação', 'Grupo de teste do agente de IA'],
  '120363426202782241': ['Tecnologia', 'Boas práticas de desenvolvimento'],
  '120363425091373512': ['Tecnologia', 'Brainstorming técnico (RAG)'],
  '120363422355963712': ['Parceria', 'Parceria Bula × e-Rural'],
  '120363417792991561': ['Divulgação', 'Canal de venda de touros e matrizes do Fábio Omena (1.014 participantes)'],
  '120363405285712493': ['Mercado', 'Academia do Nelore P.O — mercado e relacionamento'],
  '120363428914673591': ['Mercado', 'Academia do Nelore P.O #2'],
  '120363404524244949': ['Mercado', 'Shopping de Matrizes Nelore P.O'],
  '120363420010471489': ['Divulgação', 'Leilão Virtual Terra Brava — 50 anos'],
  '120363421805506742': ['Divulgação', '28º Highlight — Fazenda Peão Valente'],
}

// papel funcional de cada pessoa (o que o organograma detalha)
const PAPEL = {
  '5531994149161': 'Sócio · Diretor Comercial e de Marketing',
  '5567999441382': 'Sócio-fundador · Diretor-Geral (Bulinha)',
  '5537984044850': 'Tecnologia e Financeiro',
  '5582981313050': 'Assessor Comercial — NE (exc. MA) + SE',
  '5567996200141': 'Assessor Comercial — 2º número (Fábio Omena)',
  '5599984901010': 'Assessor Comercial — Norte + MA',
  '5594991949797': 'Assessor Comercial — 2º número (Douglas Bispo)',
  '5566999399319': 'Assessor Técnico — CO + Sul',
  '5567992497274': 'Assessor de pista (Peralta)',
  '5594991624126': 'Parceiro comercial 5% (Gustavo Rusa)',
  '5565999752333': 'Assessora — Bula Remates (Nane)',
  '5534992659816': 'Assessora — Bula Remates (Laila)',
  '5567998021109': 'Assessora — Bula Remates (Laila, 2º número)',
  '5567999797661': 'Assessor — Bula Remates (Lucas Martins)',
  '5567998894887': 'SDR / Pré-venda',
  '5594992647687': 'SDR / Pré-venda (Luana)',
  '5567998552507': 'SDR / Pré-venda (Pedro)',
  '5531986069268': 'Marketing — tráfego pago (Meta)',
  '5567992080916': 'Design — artes e cards',
  '5567998718632': 'Design — 2º número (Renato)',
  '5531982639157': 'Criação de páginas e criativos (Achiles)',
  '5544999919067': 'Tecnologia e Financeiro — HastaPro (Matheus Eberts)',
  '5567999915326': 'Cadastro e crédito (Guilherme Galassi)',
  '5567999821190': 'Cadastro e crédito — 2º número',
  '5531975659900': 'Operação Fórmula do Boi (Matheus Amormino)',
  '5531984700276': 'Jurídico / contratos (Fórmula do Boi)',
  '5531984143874': 'Agente de IA da casa (número operacional)',
  '5543988164135': 'Leiloeira parceira — Programa Leilões (Sendy)',
  '5543991785868': 'Leiloeira parceira — Programa Leilões (Márcia)',
  '5543988551525': 'Leiloeira parceira — Programa Leilões (Juliane)',
  '5543988092286': 'Pisteiro/promotor externo — Programa Leilões',
  '5518996271971': 'Leiloeira Guadalupe (Danilo)',
  '5516981560070': 'Promotor externo — Nelore Mafra',
  '5516996144125': 'Promotor externo — Nelore Mafra',
  '5567981521488': 'Promotor externo — Genética Aditiva',
  '5567999846958': 'Organização externa — Genética Aditiva',
  '5516992239966': 'Central de sêmen Bela Vista — comercial',
  '5518997622700': 'Criador parceiro — Fórmula do Boi',
  '5514998903127': 'Logística de doses — Bela Vista',
  '5538997379900': 'Criador — Nelore Leão',
  '5563992224343': 'Ex-assessor (Lucas Freitas)',
  '5591991693086': 'Ex-assessor (Fabrício Hyppolito)',
  '5531975659900_': '',
}

const dt = (ts) => ts ? new Date(ts * 1000).toISOString().slice(0, 10).split('-').reverse().join('/') : ''
const fone = (p) => p.startsWith('lid:') ? p : `+${p.slice(0, 2)} ${p.slice(2, 4)} ${p.slice(4)}`

// ── aba 1: grupos ────────────────────────────────────────────────────────────
const abaGrupos = groups.map((g) => {
  const [frente, fim] = CLASSE[g.id] || ['(a classificar)', '']
  return {
    'Frente': frente,
    'Grupo': g.subject,
    'Finalidade': fim,
    'Membros': g.size,
    'Mensagens no histórico': g.total_msgs,
    'Criado em': dt(g.creation),
    'Última mensagem lida': dt(g.last),
    'Admins': g.members.filter((m) => m.admin).length,
    'Já saíram (com fala)': g.exMembers.length,
    'ID do grupo': g.id,
  }
}).sort((a, b) => a.Frente.localeCompare(b.Frente) || b['Mensagens no histórico'] - a['Mensagens no histórico'])

// ── aba 2: pessoas ───────────────────────────────────────────────────────────
const abaPessoas = pessoas.map((p) => ({
  'Nome': p.name || '(não identificado)',
  'Papel': PAPEL[p.phone] || '',
  'Telefone': fone(p.phone),
  'Mensagens': p.msgs,
  'Grupos em que está': p.groups.length,
  'Admin em': p.admin,
  'Grupos de onde saiu': p.left.length,
  'Onde participa': p.groups.join(' · '),
  'Saiu de': p.left.join(' · '),
})).sort((a, b) => b.Mensagens - a.Mensagens)

// ── aba 3: matriz pessoa × grupo ─────────────────────────────────────────────
const abaMatriz = []
for (const g of groups) {
  if (g.size > 60) continue // grupos de mercado/divulgação: audiência, não equipe
  const [frente] = CLASSE[g.id] || ['(a classificar)']
  for (const m of g.members) {
    abaMatriz.push({
      'Frente': frente, 'Grupo': g.subject, 'Pessoa': book[m.phone] || '(não identificado)',
      'Papel': PAPEL[m.phone] || '', 'Telefone': fone(m.phone),
      'Situação': m.admin ? (m.admin === 'superadmin' ? 'Dono do grupo' : 'Administrador') : 'Membro',
      'Mensagens no grupo': m.msgs,
    })
  }
  for (const m of g.exMembers) {
    abaMatriz.push({
      'Frente': frente, 'Grupo': g.subject, 'Pessoa': book[m.phone] || '(não identificado)',
      'Papel': PAPEL[m.phone] || '', 'Telefone': fone(m.phone),
      'Situação': 'Saiu do grupo', 'Mensagens no grupo': m.msgs,
    })
  }
}
abaMatriz.sort((a, b) => a.Grupo.localeCompare(b.Grupo) || b['Mensagens no grupo'] - a['Mensagens no grupo'])

// ── aba 4: inventário completo da sessão ─────────────────────────────────────
const idsBula = new Set(groups.map((g) => g.id))
const abaInventario = todos.map((g) => ({
  'Grupo': g.subject || '(sem nome)',
  'Participantes': g.size,
  'É da operação Bula?': idsBula.has(g.id.split('@')[0]) ? 'Sim' : 'Não (pessoal / externo)',
  'Frente': (CLASSE[g.id.split('@')[0]] || [''])[0],
  'ID do grupo': g.id.split('@')[0],
})).sort((a, b) => (a['É da operação Bula?'] < b['É da operação Bula?'] ? -1 : 1) || b.Participantes - a.Participantes)

// ── aba 5: metodologia ───────────────────────────────────────────────────────
const abaMetodo = [
  ['Apuração', 'Organograma, fluxos e mapa de grupos da Bula Assessoria'],
  ['Data', '25/08/2026'],
  ['Fonte primária', 'Sessão Baileys joao-automation no VPS (76.13.169.168): lista de grupos com participantes e o histórico gravado em /opt/whatsapp-crm/history-dumps'],
  ['Volume lido', '94.047 mensagens deduplicadas no histórico do celular (24/09/2023 a 10/08/2026), das quais 27.868 nos 38 grupos internos'],
  ['Complemento ao vivo', 'whatsapp_messages (origin group-inbound): 25.937 mensagens de 10/08 a 25/08/2026'],
  ['Identificação das pessoas', 'Participantes chegam como @lid; resolvidos com o lid-mapping do próprio servidor (7.301 pares) e cruzados com Central Operacional, CRM, clientes e ERP'],
  ['Vínculo e remuneração', 'erp_folha_estrutura (folha canônica) e erp_contas_pagar de junho a setembro/2026'],
  ['Limite conhecido 1', 'As conversas 1:1 do número não vieram no history sync — só aparecem as capturadas pela Central Operacional (Marcelo, Ana Paula, Douglas, João Gabriel, Fábio, Leonardo, João Antônio)'],
  ['Limite conhecido 2', '39 dos 114 números presentes nos grupos internos têm nome confirmado; os demais são compradores, promotores e convidados pontuais'],
  ['Limite conhecido 3', 'Mensagem apagada ou mídia expirada não é recuperável — os números de volume são piso, não total'],
].map(([k, v]) => ({ Item: k, Detalhe: v }))

const wb = XLSX.utils.book_new()
const add = (nome, dados, larguras) => {
  const ws = XLSX.utils.json_to_sheet(dados)
  ws['!cols'] = larguras.map((w) => ({ wch: w }))
  ws['!autofilter'] = { ref: ws['!ref'] }
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, ws, nome)
}
add('Grupos', abaGrupos, [16, 38, 60, 9, 12, 11, 12, 8, 10, 20])
add('Pessoas', abaPessoas, [30, 40, 18, 10, 10, 9, 10, 70, 40])
add('Pessoas x Grupos', abaMatriz, [16, 34, 28, 38, 18, 14, 10])
add('Inventário da sessão', abaInventario, [46, 12, 22, 16, 20])
add('Metodologia', abaMetodo, [26, 120])
XLSX.writeFile(wb, OUT)
console.log('XLSX:', OUT)
console.log('grupos', abaGrupos.length, '| pessoas', abaPessoas.length, '| vínculos', abaMatriz.length, '| inventário', abaInventario.length)
