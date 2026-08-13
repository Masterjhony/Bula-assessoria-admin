/**
 * LISTAGEM NOMINAL DOS CADASTROS APROVADOS (2026) — pedido da diretoria, 13/08.
 *
 *   node scripts/gera-lista-cadastros-aprovados-2026.mjs [pasta-de-saida]
 *
 * Sai um PDF (para ler) e um XLSX (para trabalhar) com quem são as pessoas
 * aprovadas nas leiloeiras e todo dado de cadastro que conseguimos juntar sobre
 * cada uma, com a frase do grupo que sustenta a aprovação.
 *
 * ⚠ A lista bruta tem 51 registros, mas NÃO são 51 pessoas: o próprio material
 * declara dois registros duplicados (José Luiz Antunes e Marcelo Cataldo
 * aparecem no grupo e na lista consolidada). Este script deduplica por CPF,
 * telefone e nome e informa os dois números — o de registros e o de pessoas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { Identidades, carrega, docKey, foneKey, nomeNorm, semAcento } from './lib/base-clientes-2026.mjs'
import { APROVADOS_GRUPO, APROVADOS_LISTA } from './lib/cadastros-aprovados-grupos.mjs'
import { pagina, paraPdf, esc, brl, brl0, num, pct, dataBr } from './lib/relatorio-2026-visual.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const F = path.join(DIR, 'fontes')
const saida = process.argv[2] || DIR
const HOJE = '13/08/2026'

const hpClientes = carrega(F, 'hp-clientes')
const hpFazendas = carrega(F, 'hp-fazendas')
const hpCidades = carrega(F, 'hp-cidades')
const pgClientes = carrega(F, 'pg-clientes')
const pgLeads = carrega(F, 'pg-crm-leads')
const pgCadastro = carrega(F, 'pg-cadastro-leiloeira')
const pgAtend = carrega(F, 'pg-atendimento')
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base-clientes.json'), 'utf8'))
const planilha = JSON.parse(fs.readFileSync(path.join(F, 'planilha-leads.json'), 'utf8'))

/** CPF/CNPJ com máscara — a lista vai para leitura humana. */
const mascaraDoc = d => d.length === 11
    ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d

const CIDADE = new Map(hpCidades.map(c => [String(c.cid_codigo).trim(), c.cid_municipio]))

/* ── 1. junta as duas listas e deduplica ──────────────────────────────────── */

const registros = [
    ...APROVADOS_GRUPO.map(a => ({
        nome: a.cliente, uf: a.uf, cidade: a.cidade, cpf: a.cpf, fone: a.fone,
        origem: `grupo ${a.grupo}`, data: a.data, evidencia: a.evidencia,
        assessor: a.assessorForcado, obs: a.obs, leiloeiras: a.grupo === 'Remates' ? 'Bula Remates' : 'Programa Leilões',
    })),
    ...APROVADOS_LISTA.map(a => ({
        nome: a.cliente, uf: a.uf, cidade: a.cidade === '—' ? null : a.cidade, cpf: a.cpf, fone: a.fone,
        origem: 'lista consolidada', data: a.data, evidencia: 'Consolidação das fichas aprovadas (01/08)',
        assessor: a.atual, obs: a.obs, leiloeiras: a.leiloeiras,
    })),
]

/** Funde os registros da mesma pessoa, guardando as duas evidências. */
const idxPessoas = new Identidades()
const pessoas = []
for (const r of registros) {
    const achou = idxPessoas.busca({ doc: r.cpf, fone: r.fone, nome: r.nome })
    if (achou) {
        const p = achou.registro
        p.registros.push(r)
        p.leiloeiras = [...new Set([...p.leiloeiras.split(' + '), ...String(r.leiloeiras).split(/ \+ |, /)])].filter(Boolean).join(' + ')
        if (!p.cpf && r.cpf) p.cpf = r.cpf
        if (!p.fone && r.fone) p.fone = r.fone
        if (!p.uf && r.uf) p.uf = r.uf
        if (!p.cidade && r.cidade) p.cidade = r.cidade
        if (!p.assessor && r.assessor) p.assessor = r.assessor
        continue
    }
    const p = { ...r, registros: [r], leiloeiras: String(r.leiloeiras) }
    pessoas.push(p)
    idxPessoas.add(p, { doc: r.cpf, fone: r.fone, nome: r.nome })
}

/* ── 2. enriquece com tudo que sabemos ────────────────────────────────────── */

const fontes = []
const novaFonte = src => { const i = new Identidades(); fontes.push({ src, idx: i }); return i }

const eErp = novaFonte('ERP')
for (const c of hpClientes) {
    eErp.add({ cpf: c.cli_cpfcnpj, fone: c.cli_celular || c.cli_fonecom1 || c.cli_foneres, email: c.cli_email || c.cli_email1, uf: c.cli_uf, cidade: CIDADE.get(String(c.cli_cid_codigo || '').trim()), ie: c.cli_rginscricao, codigoErp: c.cli_codigo },
        { doc: c.cli_cpfcnpj, fone: c.cli_celular || c.cli_fonecom1 || c.cli_foneres, nome: c.cli_nome })
}
const eCli = novaFonte('Clientes')
for (const c of pgClientes) {
    eCli.add({ cpf: c.cpf, fone: c.telefone, email: c.email, uf: c.uf, cidade: c.cidade, ie: c.inscricao_estadual, score: c.score_credito, scoreFaixa: c.score_faixa, momento: c.momento_pecuaria, operacao: c.operacao_pecuaria, responsavel: c.responsavel },
        { doc: c.cpf, fone: c.telefone, nome: c.nome })
}
const eCrm = novaFonte('CRM')
for (const l of pgLeads) {
    eCrm.add({ cpf: l.cpf, fone: l.telefone || l.celular, email: l.email, uf: l.estado, cidade: l.cidade, ie: l.inscricao_estadual, score: l.score_serasa, momento: l.momento_pecuaria, operacao: l.operacao_pecuaria, interesse: l.interesse || l.interesse_principal, cabecas: l.quantidade_animais, origemLead: l.origem, campanha: l.campaign, responsavel: l.responsavel },
        { doc: l.cpf, fone: l.telefone || l.celular, nome: l.nome })
}
const ePlan = novaFonte('Planilha de leads')
const abaLG = (() => { const { head, rows } = planilha['LEADS GERAIS']; return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) })()
for (const l of abaLG) {
    ePlan.add({ fone: l['WhatsApp'], email: l['E-mail'], uf: l['UF'], cidade: l['Cidade'], ie: l['Inscrição Estadual'] === 'Sim' ? 'Sim' : null, momento: l['Momento'], cabecas: l['Cabeças'], interesse: l['Interesse'], qtdDesejada: l['Qtd. desejada'], origemLead: l['Origem'], campanha: l['campaign_name'] || l['utm_campaign'], dataLead: l['Data'] },
        { fone: l['WhatsApp'], nome: l['Nome'] })
}

// compradores 2026, para dizer quem já comprou
const idxCompradores = new Identidades()
for (const p of base) idxCompradores.add(p, { doc: p.cpf, fone: p.telefone, nome: p.nome })

// registro formal de cadastro no sistema (cliente_key = nome minúsculo)
const cadSistema = new Map()
for (const c of pgCadastro) {
    const k = String(c.cliente_key || '').toLowerCase().trim()
    if (!cadSistema.has(k)) cadSistema.set(k, [])
    cadSistema.get(k).push(c)
}
const atendPorFone = new Map(pgAtend.map(a => [a.k, a]))

for (const p of pessoas) {
    const casados = []
    for (const { src, idx } of fontes) {
        const r = idx.busca({ doc: p.cpf, fone: p.fone, nome: p.nome })
        if (r) casados.push({ src, ...r.registro })
    }
    const primeiro = campo => { for (const c of casados) if (c[campo] != null && String(c[campo]).trim() !== '') return c[campo]; return null }
    // O campo CPF das fontes vem sujo — há telefone com DDI gravado ali
    // ("5584998272375", 13 dígitos). docKey só aceita 11 ou 14, então o lixo cai
    // fora em vez de virar um CPF inventado na lista que vai para o chefe.
    const primeiroDoc = () => { for (const c of casados) { const d = docKey(c.cpf); if (d) return d } return '' }
    p.cpf = docKey(p.cpf) || primeiroDoc() || ''
    p.fone = p.fone || primeiro('fone') || ''
    p.email = primeiro('email') || ''
    p.cidade = p.cidade || primeiro('cidade') || ''
    p.uf = p.uf || primeiro('uf') || ''
    p.ie = primeiro('ie') || ''
    p.score = primeiro('score') ?? ''
    p.scoreFaixa = primeiro('scoreFaixa') || ''
    p.momento = primeiro('momento') || ''
    p.operacao = primeiro('operacao') || ''
    p.interesse = primeiro('interesse') || ''
    p.cabecas = primeiro('cabecas') || ''
    p.qtdDesejada = primeiro('qtdDesejada') || ''
    p.origemLead = primeiro('origemLead') || ''
    p.campanha = primeiro('campanha') || ''
    p.dataLead = primeiro('dataLead') || ''
    p.codigoErp = primeiro('codigoErp') || ''
    p.assessor = p.assessor || primeiro('responsavel') || ''
    p.fontesCadastro = casados.map(c => c.src).join(' + ')

    const cli = idxCompradores.busca({ doc: p.cpf, fone: p.fone, nome: p.nome })?.registro
    p.comprou = !!cli
    p.volumeCompra = cli ? cli.volumeCompra : 0
    p.ultimaCompra = cli ? cli.ultimaCompra : ''
    p.leiloesComprados = cli ? cli.leiloes : 0

    const noSistema = cadSistema.get(nomeNorm(p.nome).toLowerCase()) || []
    p.registroSistema = noSistema.length ? [...new Set(noSistema.map(c => c.status))].join('/') : ''

    const at = atendPorFone.get(foneKey(p.fone))
    p.abordado = !!at
    p.respondeu = at ? !!at.respondeu : false

    // fazenda, quando a pessoa existe no ERP
    if (p.codigoErp) {
        const fz = hpFazendas.find(f => f.cli_codigo === p.codigoErp)
        if (fz) { p.fazenda = fz.faz_nome || ''; if (!p.ie && fz.faz_inscricao) p.ie = fz.faz_inscricao }
    }
    p.fazenda = p.fazenda || ''
    p.duplicado = p.registros.length > 1
}

pessoas.sort((a, b) => (b.volumeCompra - a.volumeCompra) || a.nome.localeCompare(b.nome))

/* ── 3. XLSX ──────────────────────────────────────────────────────────────── */

const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
const ws = wb.addWorksheet('CADASTROS APROVADOS')
ws.columns = [
    { header: '#', key: 'i' }, { header: 'NOME', key: 'nome' }, { header: 'CPF/CNPJ', key: 'cpf' },
    { header: 'TELEFONE', key: 'fone' }, { header: 'E-MAIL', key: 'email' }, { header: 'CIDADE', key: 'cidade' },
    { header: 'UF', key: 'uf' }, { header: 'FAZENDA', key: 'fazenda' }, { header: 'INSCRIÇÃO ESTADUAL', key: 'ie' },
    { header: 'SCORE', key: 'score' }, { header: 'FAIXA', key: 'scoreFaixa' },
    { header: 'LEILOEIRA(S)', key: 'leiloeiras' }, { header: 'APROVADO EM', key: 'data' },
    { header: 'ONDE FOI APROVADO', key: 'origem' }, { header: 'EVIDÊNCIA DA APROVAÇÃO', key: 'evidencia' },
    { header: 'ASSESSOR', key: 'assessor' }, { header: 'MOMENTO NA PECUÁRIA', key: 'momento' },
    { header: 'REBANHO', key: 'cabecas' }, { header: 'INTERESSE', key: 'interesse' },
    { header: 'QTD. DESEJADA', key: 'qtdDesejada' }, { header: 'ORIGEM DO LEAD', key: 'origemLead' },
    { header: 'CAMPANHA', key: 'campanha' }, { header: 'JÁ COMPROU?', key: 'comprouTxt' },
    { header: 'VOLUME COMPRADO 2026', key: 'volumeCompra' }, { header: 'ÚLTIMA COMPRA', key: 'ultimaCompra' },
    { header: 'ABORDADO NO WHATSAPP', key: 'abordadoTxt' }, { header: 'RESPONDEU', key: 'respondeuTxt' },
    { header: 'REGISTRO NO SISTEMA', key: 'registroSistema' }, { header: 'FONTES DO CADASTRO', key: 'fontesCadastro' },
    { header: 'OBSERVAÇÃO', key: 'obs' },
]
pessoas.forEach((p, i) => ws.addRow({
    ...p, i: i + 1, cpf: p.cpf ? mascaraDoc(p.cpf) : '',
    comprouTxt: p.comprou ? 'Sim' : 'Não',
    abordadoTxt: p.abordado ? 'Sim' : 'Não',
    respondeuTxt: p.respondeu ? 'Sim' : 'Não',
    obs: [p.obs, p.duplicado ? 'Registro aparecia duplicado nas duas listas.' : ''].filter(Boolean).join(' '),
}))
ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }
ws.getRow(1).height = 22
ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]
ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }
const larg = [4, 34, 17, 16, 28, 18, 5, 26, 20, 8, 10, 22, 12, 20, 58, 20, 24, 16, 18, 18, 30, 28, 12, 20, 13, 20, 11, 18, 26, 46]
ws.columns.forEach((c, i) => { c.width = larg[i] || 14 })
ws.getColumn('volumeCompra').numFmt = '"R$" #,##0.00'
const ult = ws.rowCount
ws.getCell(`B${ult + 1}`).value = `TOTAL — ${pessoas.length} pessoas`
ws.getCell(`X${ult + 1}`).value = { formula: `SUM(X2:X${ult})` }
ws.getCell(`X${ult + 1}`).numFmt = '"R$" #,##0.00'
ws.getRow(ult + 1).font = { bold: true }

const xlsxPath = path.join(saida, 'Cadastros-Aprovados-2026.xlsx')
await wb.xlsx.writeFile(xlsxPath)

/* ── 4. PDF ───────────────────────────────────────────────────────────────── */

const compraram = pessoas.filter(p => p.comprou)
const comCpf = pessoas.filter(p => p.cpf)
const comFone = pessoas.filter(p => p.fone)
const semContato = pessoas.filter(p => !p.fone && !p.email)

const linha = (p, i) => `<tr>
  <td class="num">${i + 1}</td>
  <td class="nome">${esc(p.nome)}${p.duplicado ? ' <span class="micro">(2 registros)</span>' : ''}</td>
  <td class="num">${esc(p.cpf ? mascaraDoc(p.cpf) : '—')}</td>
  <td class="num">${esc(p.fone || '—')}</td>
  <td>${esc([p.cidade, p.uf].filter(Boolean).join('/') || '—')}</td>
  <td class="micro">${esc(p.email || '—')}</td>
  <td class="micro">${esc(p.ie || '—')}</td>
  <td class="num">${p.score !== '' && p.score != null ? esc(String(p.score)) : '<span class="off">—</span>'}</td>
  <td class="micro">${esc(p.leiloeiras)}</td>
  <td class="num">${esc(p.data || '—')}</td>
  <td class="micro">${esc(p.assessor || '—')}</td>
  <td class="num">${p.comprou ? `<strong>${brl0(p.volumeCompra)}</strong>` : '<span class="off">não</span>'}</td>
</tr>`

const html = pagina('Cadastros aprovados — Bula 2026', `
<div class="cap">
  <div><h1>Cadastros aprovados nas leiloeiras</h1>
  <div class="sub">Quem são as pessoas aprovadas e tudo que temos de cadastro sobre cada uma,
    com a frase do grupo que sustenta a aprovação.</div></div>
  <div class="meta">Bula Assessoria<br>Apuração até 01/08/2026<br>Emitido em ${HOJE}
    <div class="tot" style="margin-top:6px">${num(pessoas.length)}<small>pessoas aprovadas</small></div></div>
</div>

<div class="box alerta avoid">
  <h3>Sobre o número 51</h3>
  <p>A apuração tem <strong>${num(registros.length)} registros</strong> de aprovação, mas eles correspondem a
  <strong>${num(pessoas.length)} pessoas</strong>: ${num(registros.length - pessoas.length)} aparecem duas vezes, porque
  foram aprovadas no grupo e depois repetidas na consolidação de 01/08 (o próprio material já sinalizava isso em
  José Luiz Antunes e Marcelo Cataldo). A lista abaixo é por pessoa, e quem tinha dois registros está marcado.</p>
  <p>Fonte: leitura dos grupos de cadastro no WhatsApp entre 08/07 e 01/08. A aprovação chega em texto livre
  (“cadastro ok”, “aprovado”, “score bom”), não em formulário — por isso a apuração é manual e cada linha
  carrega a evidência na planilha anexa.</p>
</div>

<div class="cards avoid">
  <div class="card"><div class="z">Pessoas aprovadas</div><div class="n">${num(pessoas.length)}<small>de ${num(registros.length)} registros</small></div></div>
  <div class="card"><div class="z">Já compraram</div><div class="n">${num(compraram.length)}<small>${brl0(compraram.reduce((a, p) => a + p.volumeCompra, 0))} em 2026</small></div></div>
  <div class="card"><div class="z">Com CPF</div><div class="n">${num(comCpf.length)}<small>${pct(comCpf.length, pessoas.length)} da lista</small></div></div>
  <div class="card"><div class="z">Com telefone</div><div class="n">${num(comFone.length)}<small>${pct(comFone.length, pessoas.length)} da lista</small></div></div>
  <div class="card"><div class="z">Sem contato nenhum</div><div class="n">${num(semContato.length)}<small>nem telefone nem e-mail</small></div></div>
</div>

<h2>A lista, por volume comprado</h2>
<table>
  <thead><tr><th>#</th><th>Nome</th><th>CPF/CNPJ</th><th>Telefone</th><th>Cidade/UF</th><th>E-mail</th>
  <th>Insc. Estadual</th><th class="r">Score</th><th>Leiloeira(s)</th><th>Aprov.</th><th>Assessor</th><th class="r">Comprou 2026</th></tr></thead>
  <tbody>${pessoas.map(linha).join('')}</tbody>
  <tfoot><tr><td></td><td>TOTAL — ${num(pessoas.length)} pessoas</td><td class="num">${num(comCpf.length)} com CPF</td>
  <td class="num">${num(comFone.length)} com tel.</td><td colspan="7"></td>
  <td class="num">${brl0(compraram.reduce((a, p) => a + p.volumeCompra, 0))}</td></tr></tfoot>
</table>

<h2>O que a lista mostra</h2>
<div class="box">
  <ul>
    <li><strong>${num(compraram.length)} dos ${num(pessoas.length)} aprovados já compraram</strong> — ${pct(compraram.length, pessoas.length)} —
      somando ${brl0(compraram.reduce((a, p) => a + p.volumeCompra, 0))}. Os outros ${num(pessoas.length - compraram.length)} estão
      habilitados e ainda não arremataram: é a fila mais quente que existe hoje, gente já aprovada em leiloeira.</li>
    <li><strong>${num(pessoas.length - comFone.length)} não têm telefone na base</strong> e ${num(semContato.length)} não têm
      contato nenhum. Aprovar sem registrar contato é o mesmo que não aprovar — não dá para convidar essa pessoa
      para o próximo leilão.</li>
    <li><strong>${num(pessoas.filter(p => p.score !== '' && p.score != null).length)} têm score de crédito consultado.</strong>
      A leiloeira aprovou pelo cadastro dela; do nosso lado, o risco da maioria é desconhecido.</li>
    <li><strong>${num(pessoas.filter(p => p.registroSistema).length)} têm registro formal no sistema.</strong> O restante existe
      apenas como mensagem em grupo de WhatsApp — se ninguém tivesse lido e anotado, essa lista não existiria.</li>
  </ul>
</div>
<p class="micro">Detalhe completo — evidência da aprovação, momento na pecuária, rebanho, interesse, origem do lead e
fontes de cada dado — na planilha <strong>Cadastros-Aprovados-2026.xlsx</strong>, uma coluna por campo.
Apuração: scripts/lib/cadastros-aprovados-grupos.mjs · enriquecimento cruzado com HastaPro, clientes, CRM e planilha de leads.</p>
<footer><span>Bula Assessoria — Cadastros aprovados 2026</span><span>Emitido em ${HOJE}</span></footer>
`)

fs.mkdirSync(saida, { recursive: true })
fs.writeFileSync(path.join(DIR, 'cadastros-aprovados-2026.html'), html)
const pdfPath = path.join(saida, '3 - Cadastros Aprovados nas Leiloeiras - 2026.pdf')
await paraPdf(html, pdfPath)

console.log('registros:', registros.length, '→ pessoas:', pessoas.length)
console.log('  com CPF:', comCpf.length, '| com telefone:', comFone.length, '| com e-mail:', pessoas.filter(p => p.email).length)
console.log('  com score:', pessoas.filter(p => p.score !== '' && p.score != null).length, '| compraram:', compraram.length)
console.log('PDF :', pdfPath)
console.log('XLSX:', xlsxPath)
