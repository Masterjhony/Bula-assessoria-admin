/**
 * PAINEL FINANCEIRO 2026 — desenha o Google Sheets a partir de dados.json.
 *
 * Nenhum número é calculado aqui. Se um valor estiver errado, o erro está no
 * gerador ou na fonte, nunca no desenho — é o que permite reexecutar sem medo.
 *
 *   node scripts/gera-painel-financeiro-2026.mjs   # calcula
 *   node scripts/render-painel-financeiro-2026.mjs # desenha
 */
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'

const SHEET_ID = '11ToNrCgU7dR8C-2GnrLQCb63BdJjlSf03CT9QBQNK1U'
const D = JSON.parse(readFileSync('outputs/painel-financeiro-2026/dados.json', 'utf-8'))

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
let cred; try { cred = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) }
catch { cred = JSON.parse(Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_JSON, 'base64').toString('utf8')) }
const auth = new google.auth.JWT({ email: cred.client_email, key: cred.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })

/* ── paleta: brandbook preto e branco, dourado como acento ───────────────── */
const PRETO = { red: 0.067, green: 0.067, blue: 0.067 }
const BRANCO = { red: 1, green: 1, blue: 1 }
const OURO = { red: 0.788, green: 0.659, blue: 0.298 }   // #C9A84C
const CINZA = { red: 0.973, green: 0.973, blue: 0.973 }
const CINZA_M = { red: 0.878, green: 0.878, blue: 0.878 }
const VERM = { red: 0.788, green: 0.184, blue: 0.157 }
const VERDE = { red: 0.106, green: 0.478, blue: 0.290 }
const OURO_CLARO = { red: 0.976, green: 0.949, blue: 0.867 }

const BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
const BRL0 = '"R$" #,##0;[Red]-"R$" #,##0'
const PCT = '0.0%'
const DATA = 'dd/mm/yyyy'

const fmtCab = { backgroundColor: PRETO, textFormat: { foregroundColor: BRANCO, bold: true, fontSize: 10, fontFamily: 'Inter' }, verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP', horizontalAlignment: 'CENTER' }
const fmtTitulo = { backgroundColor: BRANCO, textFormat: { foregroundColor: PRETO, bold: true, fontSize: 16, fontFamily: 'Inter' }, verticalAlignment: 'MIDDLE' }
const fmtSub = { backgroundColor: BRANCO, textFormat: { foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 }, fontSize: 9, fontFamily: 'Inter' }, verticalAlignment: 'MIDDLE' }
const fmtSecao = { backgroundColor: OURO_CLARO, textFormat: { foregroundColor: PRETO, bold: true, fontSize: 11, fontFamily: 'Inter' }, verticalAlignment: 'MIDDLE' }
const fmtCorpo = { textFormat: { fontSize: 10, fontFamily: 'Inter' }, verticalAlignment: 'MIDDLE' }

/* ── helpers ─────────────────────────────────────────────────────────────── */
const A1 = n => { let s = ''; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26 } return s }
const brl = n => Number(n || 0)
const pct = n => Number(n || 0)
/** dd/mm/aaaa a partir do ISO, sem passar por Date — fuso já derrubou isto antes. */
const br = s => s ? s.slice(0, 10).split('-').reverse().join('/') : ''
const brNum = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const req = []
const push = (...r) => req.push(...r)

/* ── monta as abas ───────────────────────────────────────────────────────── */
const ABAS = []
function aba(nome, cols, linhas, opts = {}) {
  ABAS.push({ nome, cols, linhas, ...opts })
}

/* 0 · RESUMO ─────────────────────────────────────────────────────────────── */
{
  const t = D.totais
  const cob = t.faturamento_ano ? t.vendas_ano / t.faturamento_ano : 0
  const alta = D.div.filter(d => d.sev === 'ALTA').length
  const media = D.div.filter(d => d.sev === 'MEDIA').length
  const L = [], M = []   // M = marca de formato por linha ('secao' | 'brl' | 'pct' | 'int')
  const sec = txt => { L.push([txt, '', '']); M.push('secao') }
  const kv = (k, v, nota, fmt) => { L.push([k, v, nota || '']); M.push(fmt || 'brl') }

  sec('CAIXA — o que existe hoje')
  kv('Saldo em caixa', brl(D.saldo_caixa), `extrato conciliado até ${br(D.conciliado_ate)} · 100% dos lançamentos classificados e conciliados`, 'brl')
  for (const c of D.contas) kv('   ' + c.nome, brl(c.sa), '', 'brl')

  sec('POSIÇÃO — o que está contratado')
  kv('A receber, total em aberto', brl(t.cr_aberto), `${D.cr.length} títulos de comissão já apurada`, 'brl')
  kv('   com data combinada', brl(t.cr_data_acordada), 'é só isto que entra na projeção conservadora', 'brl')
  kv('   em vencimento automático (leilão + 45d)', brl(t.cr_aberto - t.cr_data_acordada), 'data ainda não confirmada com a leiloeira', 'brl')
  kv('A receber já vencido', brl(t.cr_vencido), 'exige cobrança', 'brl')
  kv('A pagar — dívida contraída', brl(t.cp_real), 'compromisso real, com contraparte', 'brl')
  kv('A pagar — custo futuro projetado', brl(t.cp_estimativa), 'folha, impostos e recorrentes até jan/27 — não é dívida', 'brl')
  kv('Folha mensal (cadastro canônico)', brl(t.folha_mensal), 'Douglas a 10.000 desde 04/09; próxima folha vence 05/10', 'brl')

  sec('ANO 2026 — o que a operação produziu')
  kv('Faturamento movimentado nos leilões', brl(t.faturamento_ano), 'soma do faturamento total dos eventos cobertos', 'brl')
  kv('Vendas da Bula (VGV coberto)', brl(t.vendas_ano), '', 'brl')
  kv('Cobertura', pct(cob), 'vendas da Bula ÷ faturamento dos leilões', 'pct')
  kv('Receita de comissão (competência)', brl(t.receita_ano_planilha), 'fonte: planilha FINANCEIRO BULA 2026', 'brl')
  kv('   mesma receita, pelo ERP', brl(t.receita_ano_erp), 'o ERP tem receita zerada em jan–mar e agosto — ver Divergências', 'brl')
  kv('VGV nos fechamentos do ERP', brl(t.vgv_ano), `${D.fech.length} fechamentos, auditados contra o HastaPro`, 'brl')

  sec('CONFIANÇA — o que ainda não fecha')
  kv('Divergências de severidade ALTA', alta, 'entram na aba Divergências, cada uma com valor e com o que a resolve', 'int')
  kv('Divergências de severidade MÉDIA', media, '', 'int')
  kv('Diferença de receita planilha × ERP', brl(t.receita_ano_planilha - t.receita_ano_erp), 'não é erro de soma: são fechamentos sem receita apurada no ERP', 'brl')

  aba('Resumo', ['Indicador', 'Valor', 'De onde vem'], L, { tipo: 'resumo', larguras: [380, 175, 780], marcas: M })
}

/* 1 · FLUXO DE CAIXA ─────────────────────────────────────────────────────── */
{
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const L = D.fluxo.map(f => {
    const d = new Date(f.data + 'T00:00:00Z')
    // nada começa com "+" ou "−": o Sheets leria como fórmula e o resultado é #ERROR!
    const ent = f.itens_entrada.map(i => i.d + (i.auto ? ' [data automática]' : '')).join('; ')
    const sai = f.itens_saida.map(i => i.d + (i.origem !== 'real' ? ' [estimativa]' : '')).join('; ')
    const det = [ent && 'Entra: ' + ent, sai && 'Sai: ' + sai].filter(Boolean).join('   ·   ')
    return [f.data, DIAS[d.getUTCDay()], brl(f.entrada_acordada), brl(f.entrada_total),
      brl(f.saida), brl(f.saldo_conservador), brl(f.saldo_total), det]
  })
  aba('Fluxo de Caixa',
    ['Data', 'Dia', 'Entradas\ncom data combinada', 'Entradas\ntodas', 'Saídas', 'Saldo\nconservador', 'Saldo\ncom tudo', 'O que move o dia'],
    L, {
    tipo: 'fluxo', larguras: [95, 45, 150, 130, 120, 140, 140, 760], congelar: 1,
    nota: [
      `Saldo de partida: R$ ${brNum(D.saldo_caixa)} — extrato conciliado até ${br(D.conciliado_ate)}.`,
      `Só entra aqui o que JÁ ESTÁ CONTRATADO. Nenhuma receita de leilão futuro foi somada: a agenda de setembro sozinha tem meta de comissão de R$ ${brNum(D.meses[8].meta_comissao)}, e nada disso está nestas colunas.`,
      `"Saldo conservador" conta só o que tem data combinada com a leiloeira. "Saldo com tudo" acrescenta os R$ ${brNum(D.totais.cr_aberto - D.totais.cr_data_acordada)} cujo vencimento é o automático de leilão+45d — data que ninguém confirmou.`,
      `FORA da projeção, porque já venceram e a data de pagamento é decisão de quem paga, não do sistema: R$ ${brNum(D.vencidos.cr_total)} a receber (${D.vencidos.cr.length} títulos) e R$ ${brNum(D.vencidos.cp_total)} a pagar (${D.vencidos.cp.length} títulos). Estão nas abas Contas a Receber e Contas a Pagar, marcados VENCIDO.`,
      `Pior dia do cenário conservador: ${br(D.piorDia.data)}, com R$ ${brNum(D.piorDia.saldo_conservador)}. Ele fica negativo no fim do ano porque a folha até jan/27 já está projetada e a receita de out–dez não — não é previsão de furo de caixa.`,
    ],
  })
}

/* 2 · CONTAS A PAGAR ─────────────────────────────────────────────────────── */
{
  const L = D.cp.map(t => [t.venc, t.descricao, t.fornecedor || '—', t.categoria || '—',
    t.origem === 'real' ? 'Dívida contraída' : 'Projeção', t.status,
    t.venc < D.hoje ? 'VENCIDO' : 'a vencer', brl(t.devido)])
  aba('Contas a Pagar',
    ['Vencimento', 'Descrição', 'Fornecedor', 'Categoria', 'Natureza', 'Status', 'Situação', 'Valor devido'],
    L, {
    tipo: 'cp', larguras: [100, 420, 200, 175, 130, 90, 95, 130], congelar: 1, totalCols: [7],
    nota: [
      `Dívida contraída: R$ ${brNum(D.totais.cp_real)} — tem contraparte e já é compromisso.`,
      `Projeção: R$ ${brNum(D.totais.cp_estimativa)} — folha, impostos e recorrentes lançados até jan/27. NÃO é dívida, e somar as duas colunas produz um número que não significa nada.`,
      `Vencido: R$ ${brNum(D.vencidos.cp_total)} em ${D.vencidos.cp.length} títulos. A folha mensal cheia é R$ ${brNum(D.totais.folha_mensal)} e a próxima vence em 05/10.`,
    ],
  })
}

/* 3 · CONTAS A RECEBER ───────────────────────────────────────────────────── */
{
  const L = D.cr.map(t => [t.venc, t.venc_automatico ? 'Automática (leilão+45d)' : 'Combinada',
    t.descricao, t.cliente || '—', t.fech_nome || '—', t.status,
    t.venc < D.hoje ? 'VENCIDO' : 'a vencer', brl(t.valor), brl(t.recebido), brl(t.devido)])
  aba('Contas a Receber',
    ['Vencimento', 'Origem da data', 'Descrição', 'Cliente', 'Fechamento', 'Status', 'Situação', 'Valor', 'Já recebido', 'Devido'],
    L, {
    tipo: 'cr', larguras: [100, 165, 400, 165, 260, 85, 95, 125, 115, 130], congelar: 1, totalCols: [7, 8, 9],
    nota: [
      `${D.cr.length} títulos, R$ ${brNum(D.totais.cr_aberto)} de comissão já apurada — o leilão aconteceu e o valor está fechado.`,
      `A coluna "Origem da data" é a que importa para o caixa: só R$ ${brNum(D.totais.cr_data_acordada)} têm data combinada. Os outros R$ ${brNum(D.totais.cr_aberto - D.totais.cr_data_acordada)} estão no vencimento automático de leilão+45d, que ninguém confirmou com a leiloeira.`,
      `Vencido: R$ ${brNum(D.vencidos.cr_total)} em ${D.vencidos.cr.length} títulos — mas atenção, boa parte "venceu" contra a data automática, então o atraso pode ser do cadastro, não do pagador.`,
    ],
  })
}

/* 4 · PREVISTO x REALIZADO ───────────────────────────────────────────────── */
{
  // célula em branco onde o número não existe: "R$ 0" leria como meta zero
  const ou = (v, cond) => cond ? brl(v) : ''
  const L = D.meses.map(m => {
    const cob = m.fat_realizado ? m.vendas_bula / m.fat_realizado : 0
    const despCaixa = m.caixa_imposto + m.caixa_custo + m.caixa_fixa + m.caixa_variavel + m.caixa_financeiro
    const temMov = m.fat_realizado || m.vendas_bula || m.receita_competencia
    return [m.nome, m.leiloes_planilha || '',
      ou(m.prev_faturamento, m.prev_faturamento), ou(m.meta_venda, m.meta_venda), ou(m.meta_comissao, m.meta_comissao),
      ou(m.fat_realizado, m.fat_realizado), ou(m.vendas_bula, m.vendas_bula),
      m.fat_realizado ? pct(cob) : '', ou(m.receita_competencia, temMov),
      (m.meta_comissao && m.receita_competencia) ? pct(m.receita_competencia / m.meta_comissao) : '',
      ou(m.receita_erp, temMov), ou(m.receita_competencia - m.receita_erp, temMov),
      ou(m.caixa_receita, m.caixa_receita), ou(despCaixa, despCaixa),
      ou(m.caixa_receita - despCaixa, m.caixa_receita || despCaixa), ou(m.dre_lucro, m.dre_lucro)]
  })
  aba('Previsto x Realizado',
    ['Mês', 'Leilões', 'Previsão\nfaturamento', 'Meta\nvenda', 'Meta\ncomissão',
      'Faturamento\nrealizado', 'Vendas Bula\n(VGV coberto)', 'Cobertura', 'Receita\n(competência)', 'Atingimento\nda meta',
      'Receita\npelo ERP', 'Δ planilha\n− ERP', 'Entrou no\ncaixa', 'Saiu do\ncaixa', 'Resultado\nde caixa', 'Lucro líquido\n(DRE do chefe)'],
    L, {
    tipo: 'pxr', larguras: [95, 70, 140, 130, 130, 145, 140, 95, 140, 115, 130, 130, 130, 130, 135, 150], congelar: 1,
    totalCols: [2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 14, 15],
    nota: [
      'Meta e previsão só existem a partir de setembro — antes disso a planilha não registrava meta por leilão, e inventar uma retroativa seria fabricar número.',
      '"Receita (competência)" é o que o leilão gerou no mês. "Entrou no caixa" é o que o banco recebeu no mês. Os dois NÃO batem, e é essa diferença que explica por que o saldo do banco não parece com a DRE.',
      '"Δ planilha − ERP" é a receita que a planilha do chefe tem e o ERP não. Em jan–mar e agosto o ERP está com receita zerada — a diferença ali não é erro de conta, é fechamento sem receita apurada.',
    ],
  })
}

/* 5 · LEILÕES x META ─────────────────────────────────────────────────────── */
{
  const L = D.leiloes.filter(l => l.mes).map(l => {
    const cob = l.fat ? (l.vendas || 0) / l.fat : 0
    // sem receita ainda não é 0% de atingimento — é atingimento não medido
    const atg = (l.meta_comissao && l.receita) ? l.receita / l.meta_comissao : ''
    return [l.mes ? String(l.mes).padStart(2, '0') + '/2026' : '', l.dia == null ? '' : String(l.dia),
      l.nome, l.leiloeira || '—',
      l.prev_fat == null ? '' : brl(l.prev_fat), l.meta_venda == null ? '' : brl(l.meta_venda),
      l.meta_cobertura == null ? '' : pct(l.meta_cobertura), l.meta_comissao == null ? '' : brl(l.meta_comissao),
      l.fat == null ? '' : brl(l.fat), l.vendas == null ? '' : brl(l.vendas),
      l.fat ? pct(cob) : '', l.receita == null ? '' : brl(l.receita),
      atg === '' ? '' : pct(atg),
      l.erp ? brl(l.erp.receita) : '', l.erp ? brl((l.receita || 0) - l.erp.receita) : '',
      l.status || '', l.obs || '']
  })
  aba('Leilões x Meta',
    ['Mês', 'Dia', 'Leilão', 'Leiloeira', 'Previsão\nfaturamento', 'Meta\nvenda', 'Meta\ncobertura', 'Meta\ncomissão',
      'Faturamento\nrealizado', 'Vendas Bula', 'Cobertura\nreal', 'Receita', 'Atingimento',
      'Receita\npelo ERP', 'Δ', 'Status', 'Observação'],
    L, {
    tipo: 'leiloes', larguras: [75, 45, 400, 135, 140, 130, 105, 130, 145, 130, 105, 125, 110, 125, 115, 165, 300], congelar: 1,
    totalCols: [4, 5, 7, 8, 9, 11, 13, 14],
    nota: [
      `${D.leiloes.length} linhas — todo leilão de 2026, realizado ou agendado. As quatro colunas de meta estão preenchidas só de setembro em diante.`,
      '"Cobertura real" = Vendas da Bula ÷ Faturamento do leilão. É o indicador que define a faixa do acordo com a marca, e por isso ele, não o VGV, é o que faz a comissão subir de faixa.',
      '"Receita pelo ERP" e "Δ" existem para conferência: onde o Δ é igual à receita inteira, o ERP simplesmente não tem o fechamento apurado.',
    ],
  })
}

/* 6 · DIVERGÊNCIAS ───────────────────────────────────────────────────────── */
{
  const L = D.div.map(d => [d.sev === 'MEDIA' ? 'MÉDIA' : d.sev, d.tema, d.desc,
    d.valor == null ? '' : brl(d.valor), d.fonte, d.acao])
  aba('Divergências',
    ['Severidade', 'Tema', 'O que não bate', 'Valor em jogo', 'Onde se prova', 'O que resolve'],
    L, {
    tipo: 'div', larguras: [100, 175, 560, 140, 320, 380], congelar: 1,
    nota: [
      'Esta aba existe para que o erro seja encontrado aqui, e não na reunião. Toda diferença conhecida entre a planilha do chefe e o ERP está listada, com valor e com o que a resolve.',
      `${D.div.filter(d => d.sev === 'ALTA').length} de severidade ALTA e ${D.div.filter(d => d.sev === 'MEDIA').length} de MÉDIA. As duas primeiras são erros de fórmula na própria planilha FINANCEIRO BULA 2026 — o total do ano soma um intervalo curto e deixa agosto de fora.`,
      '"Valor em jogo" é positivo quando a planilha tem mais que o ERP, e negativo no sentido contrário. Não é prejuízo; é o tamanho da dúvida.',
    ],
  })
}

/* 7 · FONTES ─────────────────────────────────────────────────────────────── */
{
  const L = [
    ['§COMO ESTE PAINEL É PRODUZIDO', '', ''],
    ['Nada aqui é digitado à mão.', 'Dois scripts o produzem inteiro, e rodá-los de novo reescreve a planilha.', ''],
    ['   1. Calcular', 'node scripts/gera-painel-financeiro-2026.mjs', 'lê ERP + planilha do chefe e grava dados.json'],
    ['   2. Desenhar', 'node scripts/render-painel-financeiro-2026.mjs', 'escreve estas abas; nenhum número é calculado aqui'],
    ['', '', ''],
    ['§DE ONDE VEM CADA NÚMERO', '', ''],
    ['Saldo em caixa', 'ERP · erp_contas_bancarias + erp_movimentos_bancarios', `conciliado até ${D.conciliado_ate}; 100% dos lançamentos classificados e com categoria`],
    ['Contas a pagar', 'ERP · erp_contas_pagar', 'separa dívida contraída (origem=real) de projeção (origem=estimativa) — somar os dois dá um número que não é dívida'],
    ['Contas a receber', 'ERP · erp_contas_receber', 'só comissão já apurada; a coluna "Origem da data" diz se o vencimento foi combinado ou é o automático de leilão+45d'],
    ['VGV, lotes e nº de leilões', 'ERP · bula_leilao_fechamento', 'auditado campo a campo contra o HastaPro no fechamento de agosto (02/09)'],
    ['Receita de comissão por leilão', 'Planilha FINANCEIRO BULA 2026 (Drive)', 'o ERP tem receita_bula zerada em jan–mar e em quase toda agosto, então ele não pode ser a fonte; o valor do ERP aparece ao lado como conferência'],
    ['Lucro líquido mensal', 'Planilha FINANCEIRO BULA 2026 › DRE', 'regime de competência, como o chefe apura'],
    ['Entrou/saiu do caixa', 'ERP · erp_movimentos_bancarios por dre_grupo', 'regime de caixa — não bate com a DRE de propósito, e é essa diferença que explica o saldo do banco'],
    ['', '', ''],
    ['§AS TRÊS REGRAS QUE EVITAM O ERRO CLÁSSICO', '', ''],
    ['Cancelado nunca entra em soma', 'regra fechada na auditoria de 18/08/2026', ''],
    ['Transferência interna não é receita', 'a definição canônica é a UNIÃO de categoria "ignorar" e transferencia_par_id', 'quem filtra só por transferencia_par_id soma R$ 421.749,61 que nunca foi receita'],
    ['Previsão e real do mesmo evento não convivem', 'evento_key + trigger encerram a estimativa quando o real chega', 'sem isso a mesma despesa conta duas vezes'],
    ['', '', ''],
    ['§O QUE ESTE PAINEL AINDA NÃO RESOLVE', '', ''],
    ['Vencimento de CR', `R$ ${brNum(D.totais.cr_aberto - D.totais.cr_data_acordada)} está em data automática`, 'a projeção conservadora do Fluxo de Caixa ignora esses valores de propósito'],
    ['Receita apurada no ERP', 'jan–mar e agosto estão zerados', 'até isso ser lançado, o ERP não fecha o ano sozinho'],
    ['Agenda × fechamento', 'não existe chave entre bula_leiloes e bula_leilao_fechamento', 'o vínculo é adivinhado por nome e data; gravar leilao_id no fechamento é a correção definitiva'],
    ['', '', ''],
    ['§CARIMBO', '', ''],
    ['Gerado em', new Date(D.gerado_em).toLocaleString('pt-BR'), ''],
    ['Extrato conciliado até', br(D.conciliado_ate), ''],
    ['Planilha do chefe usada', 'FINANCEIRO BULA 2026 · versão de 03/09/2026 22:05', 'baixada do Drive e conferida byte a byte (152.633 bytes)'],
  ]
  aba('Fontes', ['O quê', 'Fonte', 'Observação'], L, { tipo: 'fontes', larguras: [330, 480, 700] })
}

/* ── cria/limpa abas ─────────────────────────────────────────────────────── */
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
const existentes = new Map(meta.data.sheets.map(s => [s.properties.title, s.properties.sheetId]))

const criar = []
for (const a of ABAS) if (!existentes.has(a.nome)) criar.push({ addSheet: { properties: { title: a.nome, gridProperties: { rowCount: Math.max(a.linhas.length + 10, 50), columnCount: a.cols.length + 2 } } } })
if (criar.length) {
  const r = await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: criar } })
  for (const rep of r.data.replies) if (rep.addSheet) existentes.set(rep.addSheet.properties.title, rep.addSheet.properties.sheetId)
}
// ordena e remove a aba padrão
const ordena = ABAS.map((a, i) => ({ updateSheetProperties: { properties: { sheetId: existentes.get(a.nome), index: i }, fields: 'index' } }))
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: ordena } })
if (existentes.has('Página1')) {
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ deleteSheet: { sheetId: existentes.get('Página1') } }] } })
  existentes.delete('Página1')
}

/* ── limpa o que acumula a cada execução ─────────────────────────────────── */
{
  const st = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(sheetId,title),bandedRanges(bandedRangeId),conditionalFormats)',
  })
  const limpar = []
  for (const s of st.data.sheets) {
    for (const b of s.bandedRanges || []) limpar.push({ deleteBanding: { bandedRangeId: b.bandedRangeId } })
    // regras condicionais saem de trás para a frente: apagar reindexa as seguintes
    const n = (s.conditionalFormats || []).length
    for (let i = n - 1; i >= 0; i--) limpar.push({ deleteConditionalFormatRule: { sheetId: s.properties.sheetId, index: i } })
  }
  for (let i = 0; i < limpar.length; i += 60)
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: limpar.slice(i, i + 60) } })
  if (limpar.length) console.log(`  (limpou ${limpar.length} banda(s)/regra(s) da execução anterior)`)
}

/* ── escreve conteúdo ────────────────────────────────────────────────────── */
const dataVals = []
for (const a of ABAS) {
  const titulo = a.nome === 'Resumo' ? 'BULA ASSESSORIA · PAINEL FINANCEIRO 2026'
    : a.nome === 'Fontes' ? 'FONTES E MÉTODO' : a.nome.toUpperCase()
  const sub = a.nome === 'Resumo' ? `Posição em ${br(D.hoje)} · extrato conciliado até ${br(D.conciliado_ate)}`
    : a.nome === 'Fontes' ? 'Cada número desta planilha tem origem declarada. Se não tem, não entra.'
      : `Posição em ${br(D.hoje)} · fonte: ERP Bula + planilha FINANCEIRO BULA 2026`
  // o § só marca seção para a formatação; nunca é impresso
  const corpo = a.linhas.map(l => l.map((v, i) => i === 0 && typeof v === 'string' ? v.replace(/^§/, '') : v))
  const notas = (a.nota || []).map(n => [n])
  a.cab = 3 + notas.length   // índice 0-based da linha de cabeçalho
  dataVals.push({ range: `'${a.nome}'!A1`, values: [[titulo], [sub], ...notas, [], a.cols, ...corpo] })
}
await sheets.spreadsheets.values.batchClear({ spreadsheetId: SHEET_ID, requestBody: { ranges: ABAS.map(a => `'${a.nome}'`) } })
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: dataVals } })

/* ── formata ─────────────────────────────────────────────────────────────── */
for (const a of ABAS) {
  const id = existentes.get(a.nome)
  const nCols = a.cols.length, nRows = a.linhas.length
  const cab = a.cab           // índice 0-based da linha de cabeçalho
  const ini = cab + 1         // primeira linha de dados
  const nNotas = (a.nota || []).length

  // título e subtítulo
  push({ repeatCell: { range: { sheetId: id, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: nCols }, cell: { userEnteredFormat: fmtTitulo }, fields: 'userEnteredFormat' } })
  push({ repeatCell: { range: { sheetId: id, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: nCols }, cell: { userEnteredFormat: fmtSub }, fields: 'userEnteredFormat' } })
  // sem mergeCells: o texto do título transborda sozinho nas células vazias à
  // direita, e mesclar impediria congelar a primeira coluna.
  push({ updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 40 }, fields: 'pixelSize' } })
  // notas de leitura, entre o subtítulo e a tabela
  if (nNotas) {
    push({ repeatCell: { range: { sheetId: id, startRowIndex: 2, endRowIndex: 2 + nNotas, startColumnIndex: 0, endColumnIndex: nCols }, cell: { userEnteredFormat: { backgroundColor: OURO_CLARO, textFormat: { fontSize: 10, fontFamily: 'Inter', foregroundColor: PRETO }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat' } })
    push({ updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: 2, endIndex: 2 + nNotas }, properties: { pixelSize: 22 }, fields: 'pixelSize' } })
  }
  // faixa dourada sob o cabeçalho do documento
  push({ updateBorders: { range: { sheetId: id, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: nCols }, bottom: { style: 'SOLID_THICK', color: OURO } } })

  // cabeçalho
  push({ repeatCell: { range: { sheetId: id, startRowIndex: cab, endRowIndex: cab + 1, startColumnIndex: 0, endColumnIndex: nCols }, cell: { userEnteredFormat: fmtCab }, fields: 'userEnteredFormat' } })
  push({ updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: cab, endIndex: cab + 1 }, properties: { pixelSize: 46 }, fields: 'pixelSize' } })

  // corpo
  if (nRows) push({ repeatCell: { range: { sheetId: id, startRowIndex: ini, endRowIndex: ini + nRows, startColumnIndex: 0, endColumnIndex: nCols }, cell: { userEnteredFormat: fmtCorpo }, fields: 'userEnteredFormat(textFormat,verticalAlignment)' } })

  // congela cabeçalho
  push({ updateSheetProperties: { properties: { sheetId: id, gridProperties: { frozenRowCount: cab + 1, frozenColumnCount: a.congelar || 0 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } })

  // larguras
  ;(a.larguras || []).forEach((w, i) => push({ updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: w }, fields: 'pixelSize' } }))

  // banding
  if (nRows > 1) push({ addBanding: { bandedRange: { range: { sheetId: id, startRowIndex: ini, endRowIndex: ini + nRows, startColumnIndex: 0, endColumnIndex: nCols }, rowProperties: { firstBandColor: BRANCO, secondBandColor: CINZA } } } })

  const rng = (c0, c1) => ({ sheetId: id, startRowIndex: ini, endRowIndex: ini + nRows, startColumnIndex: c0, endColumnIndex: c1 })
  const numf = (c0, c1, pattern) => push({ repeatCell: { range: rng(c0, c1), cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })
  const datef = (c0, c1) => push({ repeatCell: { range: rng(c0, c1), cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: DATA }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })

  const linha1 = i => ({ sheetId: id, startRowIndex: ini + i, endRowIndex: ini + i + 1, startColumnIndex: 0, endColumnIndex: nCols })
  const ehSecao = i => a.marcas ? a.marcas[i] === 'secao' : String(a.linhas[i][0]).startsWith('§')

  if (a.tipo === 'resumo') {
    numf(1, 2, BRL)
    a.linhas.forEach((l, i) => {
      const m = a.marcas[i]
      if (m === 'secao') push({ repeatCell: { range: linha1(i), cell: { userEnteredFormat: fmtSecao }, fields: 'userEnteredFormat' } })
      if (m === 'pct' || m === 'int') push({ repeatCell: { range: { sheetId: id, startRowIndex: ini + i, endRowIndex: ini + i + 1, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: m === 'pct' ? PCT : '0' } } }, fields: 'userEnteredFormat.numberFormat' } })
    })
    // o saldo em caixa é o número que abre a conversa
    push({ repeatCell: { range: { sheetId: id, startRowIndex: ini + 1, endRowIndex: ini + 2, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14, fontFamily: 'Inter' } } }, fields: 'userEnteredFormat.textFormat' } })
    push({ repeatCell: { range: rng(2, 3), cell: { userEnteredFormat: { textFormat: { fontSize: 10, fontFamily: 'Inter', foregroundColor: { red: 0.35, green: 0.35, blue: 0.35 } } } }, fields: 'userEnteredFormat.textFormat' } })
  }
  if (a.tipo === 'fontes') {
    a.linhas.forEach((l, i) => { if (ehSecao(i)) push({ repeatCell: { range: linha1(i), cell: { userEnteredFormat: fmtSecao }, fields: 'userEnteredFormat' } }) })
    push({ repeatCell: { range: rng(0, nCols), cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.wrapStrategy' } })
  }
  if (a.tipo === 'fluxo') {
    datef(0, 1); numf(2, 7, BRL)
    push({ repeatCell: { range: rng(7, 8), cell: { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: { red: 0.35, green: 0.35, blue: 0.35 } }, wrapStrategy: 'CLIP' } }, fields: 'userEnteredFormat(textFormat,wrapStrategy)' } })
    for (const col of [5, 6]) push({ addConditionalFormatRule: { rule: { ranges: [rng(col, col + 1)], booleanRule: { condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '0' }] }, format: { backgroundColor: { red: 0.98, green: 0.9, blue: 0.9 }, textFormat: { foregroundColor: VERM, bold: true } } } }, index: 0 } })
  }
  if (a.tipo === 'cp' || a.tipo === 'cr') {
    datef(0, 1)
    const c0 = a.tipo === 'cp' ? 7 : 7
    numf(c0, nCols, BRL)
    const colSit = a.tipo === 'cp' ? 6 : 6
    push({ addConditionalFormatRule: { rule: { ranges: [{ sheetId: id, startRowIndex: ini, endRowIndex: ini + nRows, startColumnIndex: 0, endColumnIndex: nCols }], booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=$${A1(colSit)}${ini + 1}="VENCIDO"` }] }, format: { backgroundColor: { red: 0.99, green: 0.93, blue: 0.93 } } } }, index: 0 } })
    if (a.tipo === 'cp') push({ addConditionalFormatRule: { rule: { ranges: [{ sheetId: id, startRowIndex: ini, endRowIndex: ini + nRows, startColumnIndex: 4, endColumnIndex: 5 }], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Projeção' }] }, format: { textFormat: { foregroundColor: { red: 0.45, green: 0.45, blue: 0.45 }, italic: true } } } }, index: 0 } })
    if (a.tipo === 'cr') push({ addConditionalFormatRule: { rule: { ranges: [{ sheetId: id, startRowIndex: ini, endRowIndex: ini + nRows, startColumnIndex: 1, endColumnIndex: 2 }], booleanRule: { condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: 'Automática' }] }, format: { textFormat: { foregroundColor: { red: 0.72, green: 0.45, blue: 0.05 }, italic: true } } } }, index: 0 } })
  }
  if (a.tipo === 'pxr') {
    numf(2, 7, BRL0); numf(7, 8, PCT); numf(8, 9, BRL); numf(9, 10, PCT); numf(10, 16, BRL)
    push({ repeatCell: { range: rng(1, 2), cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } })
    push({ addConditionalFormatRule: { rule: { ranges: [rng(14, 15)], booleanRule: { condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '0' }] }, format: { textFormat: { foregroundColor: VERM } } } }, index: 0 } })
    push({ addConditionalFormatRule: { rule: { ranges: [rng(15, 16)], booleanRule: { condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '0' }] }, format: { textFormat: { foregroundColor: VERDE } } } }, index: 0 } })
  }
  if (a.tipo === 'leiloes') {
    numf(4, 6, BRL0); numf(6, 7, PCT); numf(7, 10, BRL0); numf(10, 11, PCT); numf(11, 12, BRL); numf(12, 13, PCT); numf(13, 15, BRL)
    push({ repeatCell: { range: rng(0, 2), cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } })
    push({ addConditionalFormatRule: { rule: { ranges: [rng(15, 16)], booleanRule: { condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: 'RECEBIDO' }] }, format: { textFormat: { foregroundColor: VERDE } } } }, index: 0 } })
    push({ addConditionalFormatRule: { rule: { ranges: [rng(15, 16)], booleanRule: { condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: 'COBRAR' }] }, format: { textFormat: { foregroundColor: VERM, bold: true } } } }, index: 0 } })
  }
  if (a.tipo === 'div') {
    numf(3, 4, BRL)
    push({ repeatCell: { range: rng(2, 3), cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.wrapStrategy' } })
    push({ repeatCell: { range: rng(5, 6), cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.wrapStrategy' } })
    push({ addConditionalFormatRule: { rule: { ranges: [rng(0, 1)], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'ALTA' }] }, format: { backgroundColor: VERM, textFormat: { foregroundColor: BRANCO, bold: true } } } }, index: 0 } })
    push({ addConditionalFormatRule: { rule: { ranges: [rng(0, 1)], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'MÉDIA' }] }, format: { backgroundColor: OURO_CLARO, textFormat: { bold: true } } } }, index: 0 } })
    push({ repeatCell: { range: rng(0, 1), cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } })
  }

  // linha de total
  if (a.totalCols && nRows) {
    const rTot = ini + nRows
    const vals = []
    for (let ci = 0; ci < nCols; ci++) {
      if (ci === 0) vals.push('TOTAL')
      else if (a.totalCols.includes(ci)) vals.push(`=SUM(${A1(ci)}${ini + 1}:${A1(ci)}${rTot})`)
      else vals.push('')
    }
    dataVals.push({ range: `'${a.nome}'!A${rTot + 1}`, values: [vals] })
    push({ repeatCell: { range: { sheetId: id, startRowIndex: rTot, endRowIndex: rTot + 1, startColumnIndex: 0, endColumnIndex: nCols }, cell: { userEnteredFormat: { backgroundColor: PRETO, textFormat: { foregroundColor: BRANCO, bold: true, fontSize: 10, fontFamily: 'Inter' } } }, fields: 'userEnteredFormat' } })
    for (const ci of a.totalCols) push({ repeatCell: { range: { sheetId: id, startRowIndex: rTot, endRowIndex: rTot + 1, startColumnIndex: ci, endColumnIndex: ci + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: BRL } } }, fields: 'userEnteredFormat.numberFormat' } })
  }

  push({ updateBorders: { range: { sheetId: id, startRowIndex: cab, endRowIndex: cab + 1, startColumnIndex: 0, endColumnIndex: nCols }, bottom: { style: 'SOLID', color: OURO } } })
}

// grava as linhas de total que foram acrescentadas
const totais = dataVals.filter(d => !d.range.endsWith('!A1'))
if (totais.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: totais } })

// aplica formatação em blocos (a API limita o tamanho do lote)
for (let i = 0; i < req.length; i += 60) {
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: req.slice(i, i + 60) } })
}

console.log('OK — planilha escrita')
for (const a of ABAS) console.log(`  ${a.nome.padEnd(22)} ${String(a.linhas.length).padStart(4)} linha(s)`)
console.log(`\nhttps://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`)
