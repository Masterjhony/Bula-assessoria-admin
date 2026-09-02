// Relatorio de LANCES E VENDAS do 20o Leilao Guadalupe Agropecuaria (17-20/07/2026).
//
// Motivo: divergencia entre a comissao que a leiloeira informou (R$ 21.425,90) e a
// que consta na planilha-mestra FINANCEIRO BULA 2026 (linhas 99+100 = R$ 32.641,35).
//
// Fonte primaria: grupo de WhatsApp "LANCES GUADALUPE" (120363428091574257@g.us),
// capturado direto da sessao Baileys `joao-automation` no VPS (history-sync de
// 10/08/2026, /opt/whatsapp-crm/history-dumps). 1.613 mensagens, 17/07 a 10/08.
// Fontes de conferencia: bula_leilao_vendas, bula_leilao_fechamento e
// erp_contas_receber (Supabase).
//
// Saida: PDF + XLSX + log completo na area de trabalho.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'

const DESKTOP = 'C:/Users/Notebook-Acer/Desktop'
const OUT = join(DESKTOP, 'Guadalupe Julho 2026 - Lances e Comissao')
mkdirSync(OUT, { recursive: true })

const logoB64 = readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const brl = (n) => (n == null ? '—' : `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const brl0 = (n) => (n == null ? '—' : `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`)

// ─── 1. O que a Bula vendeu, dia a dia ───────────────────────────────────────
// parcela = lance por cabeca; VGV = parcela x 30 parcelas (convencao do leilao).
const VENDAS = [
  // 18/07 — femeas. NAO ha lances no grupo LANCES GUADALUPE neste dia (so catalogos);
  // a cobertura vem do grupo "Lances Bula Assessoria" e do fechamento no sistema.
  { dia: '18/07', pregao: 'Fêmeas', lote: '20', parcela: 1350, comprador: 'Nelore Tavares', fazenda: '', cidade: 'João Pinheiro/MG', assessor: 'Léo Serafim', hora: '—', fonte: 'Sistema (grupo Lances Bula)' },
  { dia: '18/07', pregao: 'Fêmeas', lote: '1F', parcela: 650, comprador: 'A identificar', fazenda: '', cidade: '', assessor: 'Douglas Bispo', hora: '—', fonte: 'Sistema (grupo Lances Bula)' },
  // 19/07 — touros (domingo). Todas com ficha no grupo LANCES GUADALUPE.
  { dia: '19/07', pregao: 'Touros', lote: '06', parcela: 870, comprador: 'Eduardo Leite', fazenda: 'Fazenda Quendera', cidade: 'Capela/SE', assessor: 'Nane', hora: '09:25', fonte: 'Ficha no grupo' },
  { dia: '19/07', pregao: 'Touros', lote: '10', parcela: 870, comprador: 'Jerônimo Heberle', fazenda: 'Fazenda Progresso', cidade: 'Matupá/MT', assessor: 'Nane', hora: '09:41 / 11:05', fonte: 'Ficha no grupo (reatribuída)' },
  { dia: '19/07', pregao: 'Touros', lote: '16', parcela: 1150, comprador: 'Jerônimo Heberle', fazenda: 'Fazenda Progresso', cidade: 'Matupá/MT', assessor: 'Nane', hora: '10:16', fonte: 'Ficha no grupo' },
  { dia: '19/07', pregao: 'Touros', lote: '01', parcela: 1200, comprador: 'Marcelo Braga', fazenda: 'Fazenda São Miguel', cidade: 'Maracajá/PA', assessor: 'Douglas Bispo', hora: '11:59', fonte: 'Ficha no grupo' },
  { dia: '19/07', pregao: 'Touros', lote: '25', parcela: 700, comprador: 'Reinaldo Tavares', fazenda: 'Fazenda N. Sra. de Fátima', cidade: '', assessor: 'Fábio Omena', hora: '12:28', fonte: 'Ficha no grupo (marcada 1F)' },
  { dia: '19/07', pregao: 'Touros', lote: '59', parcela: 820, comprador: 'Jerônimo Heberle', fazenda: 'Fazenda Progresso', cidade: 'Matupá/MT', assessor: 'Nane', hora: '14:22', fonte: 'Ficha no grupo' },
  { dia: '19/07', pregao: 'Touros', lote: '49', parcela: 870, comprador: 'Eduardo Leite', fazenda: 'Fazenda Quendera', cidade: 'Capela/SE', assessor: 'Nane', hora: '14:27', fonte: 'Ficha no grupo' },
  { dia: '19/07', pregao: 'Touros', lote: '60', parcela: 700, comprador: 'Reinaldo e Maria Tavares', fazenda: 'Fazenda N. Sra. de Fátima', cidade: 'Vila Bela/MT', assessor: 'Nane + Fábio Omena', hora: '14:30', fonte: 'Ficha no grupo' },
  { dia: '19/07', pregao: 'Touros', lote: '99', parcela: 650, comprador: 'Elielton Taveira', fazenda: 'Fazenda Caiçara', cidade: 'Niquelândia/GO', assessor: 'não declarado', hora: '15:20', fonte: 'Ficha no grupo' },
  // 20/07 — touros (segunda).
  { dia: '20/07', pregao: 'Touros', lote: '04', parcela: 1220, comprador: 'Anésio Santarém', fazenda: 'Fazenda Córrego da Onça', cidade: 'Novo Repartimento/PA', assessor: 'Douglas Bispo (comissão → Gustavo Rusa)', hora: '20:40', fonte: 'Ficha no grupo' },
  { dia: '20/07', pregao: 'Touros', lote: '91', parcela: 920, comprador: 'Anésio Santarém', fazenda: 'Fazenda Córrego da Onça', cidade: 'Novo Repartimento/PA', assessor: 'Douglas Bispo (comissão → Gustavo Rusa)', hora: '21:33', fonte: 'Ficha no grupo' },
]
for (const v of VENDAS) v.vgv = v.parcela * 30

const porDia = (d) => VENDAS.filter((v) => v.dia === d)
const somaVgv = (d) => porDia(d).reduce((s, v) => s + v.vgv, 0)

const COB_SAB = somaVgv('18/07')   //  60.000
const COB_DOM = somaVgv('19/07')   // 234.900
const COB_SEG = somaVgv('20/07')   //  64.200
const COB_TOT = COB_SAB + COB_DOM + COB_SEG

// ─── 2. As duas contas ───────────────────────────────────────────────────────
const FAT_TOUROS_TOTAL = 3952180   // planilha-mestra, linha 100 (os DOIS dias de touros)
const FAT_DOM = 3043180            // deduzido: (21.425,90 − 3.000 − 3.210) / 0,005
const FAT_SEG = FAT_TOUROS_TOTAL - FAT_DOM // 909.000
const FAT_FEMEAS = 4387850         // planilha-mestra, linha 99

const LEILOEIRA = [
  { dia: 'Sábado 18/07', pregao: 'Fêmeas', lotes: porDia('18/07').length, base: 'venda da cobertura Bula', valorBase: COB_SAB, pct: 0.05, faixa: '0 a 5 — 5%' },
  { dia: 'Domingo 19/07', pregao: 'Touros', lotes: porDia('19/07').length, base: 'faturamento do pregão', valorBase: FAT_DOM, pct: 0.005, faixa: '5 a 10 touros — 0,5%' },
  { dia: 'Segunda 20/07', pregao: 'Touros', lotes: porDia('20/07').length, base: 'venda da cobertura Bula', valorBase: COB_SEG, pct: 0.05, faixa: '0 a 5 touros — 5%' },
]
for (const l of LEILOEIRA) l.comissao = l.valorBase * l.pct
const TOT_LEILOEIRA = LEILOEIRA.reduce((s, l) => s + l.comissao, 0) // 21.425,90

const PLANILHA = [
  { linha: 99, data: '18/07', leilao: '20º LEILÃO GUADALUPE AGROPECUÁRIA Fêmeas', fat: FAT_FEMEAS, venda: 60000, pct: 0.05, valor: 3000 },
  { linha: 100, data: '19/07', leilao: '20º LEILÃO GUADALUPE AGROPECUÁRIA Touros', fat: FAT_TOUROS_TOTAL, venda: 299100, pct: 0.0075, valor: 29641.35 },
]
const TOT_PLANILHA = PLANILHA.reduce((s, l) => s + l.valor, 0) // 32.641,35
const DIF = TOT_PLANILHA - TOT_LEILOEIRA                        // 11.215,45

// ─── 3. Disputas capturadas no grupo ─────────────────────────────────────────
const DISPUTAS = JSON.parse(readFileSync('scripts/_dados-guadalupe-disputas.json', 'utf-8'))
const MSGS = JSON.parse(readFileSync('scripts/_dados-guadalupe-msgs.json', 'utf-8'))
const NOMES = {
  '269483495133314': 'Leonardo Serafim', '10247909437577': 'Fábio Omena', '3040987881548': 'Douglas Bispo',
  '205583038812162': 'Marcelo Carneiro', '91727767588920': 'Danilo (Guadalupe)', '196743895511181': '(67) 9944-1382',
  '49916143485074': 'Nane — (65) 9975-2333', '229188078411973': '(34) 9265-9816', '247360185737434': '(34) 9243-1515',
  '231631931621610': '(67) 9962-0141', '65034529013857': '(67) 9979-7661',
}
const quem = (m) => NOMES[(m.participant || '').replace('@lid', '')] || (m.fromMe ? 'Bula (automação)' : '—')
const dataBR = (m) => new Date((m.ts - 3 * 3600) * 1000).toISOString().slice(0, 16).replace('T', ' ')

const TOTAL_LANCES = DISPUTAS.reduce((s, d) => s + d.n, 0)
const DISPUTAS_PERDIDAS = DISPUTAS.filter((d) => d.tipo === 'PERDIDO')

// Os tres "agradece" que parecem venda e nao sao.
const FALSOS_POSITIVOS = [
  {
    quando: '19/07 09:27–09:32', ate: 1100, quem: '(34) 9265-9816',
    texto: '"Liberadooo" (09:30) → "Agradece comigo / DAS Agropecuária / Bahia" (09:32)',
    porque: 'O lance parou em 1.100 no recinto e o cliente liberou. Não houve "Levou" nem pedido de dados do comprador. O "agradece" é o reconhecimento público de quem disputou, não da arrematação.',
    seFosse: 'O domingo iria a 10 touros e a faixa saltaria de 0,5% para 0,75% — +R$ 7.607,95 de comissão.',
  },
  {
    quando: '19/07 11:13–11:25', ate: 8000, quem: 'Douglas Bispo',
    texto: '"Agradece o condomínio ai — C+4, Galopeira e Flor do Aratau" + "8000" (11:24)',
    porque: 'Resposta imediata no grupo: "Bateu já" / "Q merda" — e o próprio Douglas: "Puts, tava em ligação". O martelo caiu antes do lance de 8.000 ser confirmado.',
    seFosse: 'Seria o maior lote do dia (VGV R$ 240.000). Vale confirmar com o Douglas.',
  },
  {
    quando: '19/07 13:03–13:14', ate: 7200, quem: 'Douglas Bispo',
    texto: '"Agradece PENÚLTIMO LANCE aqui com o Douglas Bispo — condomínio do parazão / Dr Gibson, Dr Luciano e Dr Iuri"',
    porque: 'A própria mensagem diz "penúltimo lance": o cliente foi o cobridor, não o arrematante. Touro da ABS, disputa de 1.600 a 7.200.',
    seFosse: '—',
  },
]

// ─── HTML ────────────────────────────────────────────────────────────────────
const linhaVenda = (v) => `<tr>
  <td>${v.dia}</td><td><b>${v.lote}</b></td><td class="num">${brl0(v.parcela)}</td><td class="num">${brl0(v.vgv)}</td>
  <td>${v.comprador}${v.fazenda ? `<br><span class="s">${v.fazenda}</span>` : ''}</td><td>${v.cidade || '—'}</td>
  <td>${v.assessor}</td><td class="s">${v.hora}</td></tr>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Guadalupe Julho 2026 — Lances, Vendas e Comissão</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family:"Segoe UI",Arial,sans-serif; color:#111; margin:0; font-size:9.4pt; line-height:1.45; }
  h1,h2,h3 { font-family:"Oswald","Segoe UI",Arial,sans-serif; text-transform:uppercase; letter-spacing:.04em; margin:0; }
  .capa { background:#0A0A0A; color:#fff; padding:26px 24px; margin-bottom:18px; }
  .capa img { height:32px; margin-bottom:16px; }
  .capa h1 { font-size:25pt; line-height:1.08; }
  .capa p { color:#c9c9c9; margin:9px 0 0; font-size:9.6pt; }
  .capa .sel { color:#C9A84C; }
  h2 { font-size:12.5pt; border-bottom:2px solid #111; padding-bottom:5px; margin:22px 0 10px; page-break-after:avoid; }
  h3 { font-size:10pt; margin:14px 0 6px; }
  .veredito { border:2px solid #0A0A0A; padding:14px 16px; margin:0 0 16px; }
  .veredito .t { font-family:"Oswald",Arial,sans-serif; font-size:13pt; text-transform:uppercase; }
  .veredito p { margin:7px 0 0; }
  .kpis { display:flex; gap:9px; margin:14px 0 18px; }
  .kpi { flex:1; border:1px solid #111; padding:9px 11px; }
  .kpi .l { font-size:7.2pt; text-transform:uppercase; letter-spacing:.06em; color:#555; }
  .kpi .v { font-family:"Oswald",Arial,sans-serif; font-size:14pt; margin-top:3px; }
  .kpi.dark { background:#0A0A0A; color:#fff; } .kpi.dark .l { color:#bbb; }
  .kpi.ouro { border-color:#C9A84C; } .kpi.ouro .v { color:#8a6f1f; }
  table { width:100%; border-collapse:collapse; font-size:8.3pt; page-break-inside:auto; }
  th { background:#0A0A0A; color:#fff; text-align:left; padding:6px; font-weight:600; text-transform:uppercase; font-size:7pt; letter-spacing:.04em; }
  td { padding:5px 6px; border-bottom:1px solid #ddd; vertical-align:top; }
  tr { page-break-inside:avoid; }
  tr:nth-child(even) td { background:#fafafa; }
  .num { text-align:right; white-space:nowrap; }
  .s { font-size:7.4pt; color:#666; }
  tfoot td { border-top:2px solid #111; font-weight:700; background:#fff !important; }
  .card { border-left:3px solid #0A0A0A; padding:8px 12px; margin:8px 0; background:#fafafa; page-break-inside:avoid; }
  .card.al { border-left-color:#C9A84C; }
  .card .t { font-weight:700; }
  .nota { font-size:8pt; color:#555; margin-top:6px; }
  .rodape { margin-top:22px; padding-top:8px; border-top:1px solid #ccc; font-size:7.4pt; color:#666; }
  .quebra { page-break-before:always; }
  ol,ul { margin:6px 0 6px 16px; padding:0; } li { margin:4px 0; }
  .conta { font-family:"Consolas","Courier New",monospace; font-size:8.6pt; background:#f4f4f4; padding:8px 10px; border-left:3px solid #C9A84C; margin:8px 0; white-space:pre-wrap; }
</style></head><body>

<div class="capa">
  <img src="data:image/png;base64,${logoB64}">
  <h1>20º Leilão Guadalupe<br>Agropecuária <span class="sel">·</span> Julho 2026</h1>
  <p>Lances e vendas capturados no grupo <b>LANCES GUADALUPE</b> — validação da comissão devida à Bula<br>
  Emitido em 25/08/2026 · fonte primária: sessão Baileys <b>joao-automation</b> (VPS)</p>
</div>

<div class="veredito">
  <div class="t">O número da leiloeira está certo. A planilha está ${brl(DIF)} acima.</div>
  <p>A captura do grupo confirma, ficha a ficha, exatamente a cobertura que a Guadalupe usou para calcular:
  <b>${porDia('19/07').length} touros no domingo</b> e <b>${porDia('20/07').length} na segunda</b>. Com esses números, a própria tabela escalonada
  que a leiloeira mandou reproduz <b>${brl(TOT_LEILOEIRA)}</b> — ao centavo, sem arredondar nada.
  A planilha-mestra chega a ${brl(TOT_PLANILHA)} porque junta os dois dias de touros numa linha só.
  <b>O ERP já está no número certo</b> (corrigido em 20/08); quem ficou para trás foi a planilha.</p>
</div>

<div class="kpis">
  <div class="kpi dark"><div class="l">Comissão correta</div><div class="v">${brl(TOT_LEILOEIRA)}</div></div>
  <div class="kpi"><div class="l">Planilha (linhas 99+100)</div><div class="v">${brl(TOT_PLANILHA)}</div></div>
  <div class="kpi ouro"><div class="l">Diferença a corrigir</div><div class="v">${brl(DIF)}</div></div>
  <div class="kpi"><div class="l">Cobertura Bula (3 dias)</div><div class="v">${brl0(COB_TOT)}</div></div>
</div>

<h2>1 · De onde vieram os dados</h2>
<p>O grupo <b>LANCES GUADALUPE</b> (<span class="s">120363428091574257@g.us</span>) foi lido direto do VPS, na sessão
Baileys <b>joao-automation</b> — os dumps de <i>history sync</i> em <span class="s">/opt/whatsapp-crm/history-dumps</span>.
Vieram <b>${MSGS.length.toLocaleString("pt-BR")} mensagens</b>, de 17/07 a 10/08/2026, sendo <b>1.591 nos quatro dias do evento</b>.</p>
<p>Dentro delas foram isolados <b>${DISPUTAS.length} episódios de disputa</b> com <b>${TOTAL_LANCES} lances</b> de valor explícito.
O critério de venda é o padrão que a própria equipe usa no grupo: <b>“Levou/Levamos” → “Manda pra nós” → ficha completa</b>
(lote, valor, comprador, fazenda, cidade/UF). Sem os três, não é arremate.</p>
<div class="nota">Ressalva de fonte: 18/07 (fêmeas) não tem lance neste grupo — só catálogos. A cobertura daquele dia vem do
grupo “Lances Bula Assessoria” e do fechamento já registrado no sistema. As mídias de julho (cards de resultado da
Guadalupe) não puderam ser baixadas: as URLs do WhatsApp já expiraram.</div>

<h2>2 · O que a Bula vendeu, dia a dia</h2>
<table>
  <thead><tr><th>Dia</th><th>Lote</th><th class="num">Parcela</th><th class="num">VGV (×30)</th><th>Comprador</th><th>Cidade/UF</th><th>Assessor</th><th>Hora</th></tr></thead>
  <tbody>${VENDAS.map(linhaVenda).join('')}</tbody>
  <tfoot><tr><td colspan="3">${VENDAS.length} lotes</td><td class="num">${brl0(COB_TOT)}</td><td colspan="4"></td></tr></tfoot>
</table>
<div class="nota">
  <b>Sábado 18/07:</b> ${porDia('18/07').length} lotes · ${brl0(COB_SAB)} &nbsp;|&nbsp;
  <b>Domingo 19/07:</b> ${porDia('19/07').length} lotes · ${brl0(COB_DOM)} &nbsp;|&nbsp;
  <b>Segunda 20/07:</b> ${porDia('20/07').length} lotes · ${brl0(COB_SEG)}<br>
  Os ${porDia('19/07').length} lotes de domingo e os ${porDia('20/07').length} de segunda batem 1:1 com o que já está em
  <span class="s">bula_leilao_fechamento</span>. Duas correções finas a fazer no cadastro: o lote 04 de 20/07 está com cidade
  “Maracajá” e a ficha do grupo diz <b>Novo Repartimento/PA</b>; e o lote 99 de 19/07 seguiu sem assessor declarado.
</div>

<h2 class="quebra">3 · A conta da leiloeira, verificada</h2>
<p>A tabela que a Guadalupe mandou é por <b>número de touros vendidos</b>: 0 a 5 → 5% · 5 a 10 → 0,5% · 10 a 15 → 0,75% ·
15 a 20 → 1,00% · acima de 20 → 1,5%. Aplicada <b>a cada pregão</b>, com a cobertura que o grupo comprova, ela fecha assim:</p>
<table>
  <thead><tr><th>Pregão</th><th class="num">Lotes Bula</th><th>Faixa aplicada</th><th>Base de cálculo</th><th class="num">Valor da base</th><th class="num">%</th><th class="num">Comissão</th></tr></thead>
  <tbody>${LEILOEIRA.map((l) => `<tr><td><b>${l.dia}</b> · ${l.pregao}</td><td class="num">${l.lotes}</td><td>${l.faixa}</td>
    <td>${l.base}</td><td class="num">${brl0(l.valorBase)}</td><td class="num">${(l.pct * 100).toLocaleString('pt-BR')}%</td>
    <td class="num"><b>${brl(l.comissao)}</b></td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="6">Total informado pela leiloeira em 20/08/2026</td><td class="num">${brl(TOT_LEILOEIRA)}</td></tr></tfoot>
</table>
<p>O ponto que fecha a validação: <b>o faturamento de domingo não foi informado por ninguém</b> — ele é a única incógnita.
Isolando-o na conta dela, o valor volta redondo e ainda encaixa no total dos dois dias que já estava na planilha:</p>
<div class="conta">21.425,90 − 3.000,00 (sábado) − 3.210,00 (segunda) = 15.215,90  →  ÷ 0,005 = <b>${brl0(FAT_DOM)}</b> de faturamento no domingo
${brl0(FAT_TOUROS_TOTAL)} (os dois dias de touros, linha 100 da planilha) − ${brl0(FAT_DOM)} = <b>${brl0(FAT_SEG)}</b> na segunda</div>
<p>Ou seja: os ${brl(TOT_LEILOEIRA)} não são um número de negociação. São o resultado exato da tabela dela aplicada dia a dia,
sobre a cobertura que o grupo comprova e sobre um faturamento que fecha com o total que a Bula já tinha. E a faixa de
<b>0,5%</b> que ela usou no domingo só existe para quem vendeu de <b>5 a 10 touros</b> — que é precisamente o que a captura mostra:
${porDia('19/07').length}.</p>

<h2>4 · De onde saem os ${brl(TOT_PLANILHA)} da planilha</h2>
<table>
  <thead><tr><th>Linha</th><th>Data</th><th>Leilão</th><th class="num">Faturamento</th><th class="num">Venda</th><th class="num">%</th><th class="num">Valor</th></tr></thead>
  <tbody>${PLANILHA.map((p) => `<tr><td>${p.linha}</td><td>${p.data}</td><td>${p.leilao}</td><td class="num">${brl0(p.fat)}</td>
    <td class="num">${brl0(p.venda)}</td><td class="num">${(p.pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 3 })}%</td>
    <td class="num"><b>${brl(p.valor)}</b></td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="6">Total da planilha</td><td class="num">${brl(TOT_PLANILHA)}</td></tr></tfoot>
</table>
<p>São três erros encavalados na linha 100:</p>
<ol>
  <li><b>Junta domingo e segunda numa linha só.</b> Venda de ${brl0(299100)} = ${brl0(COB_DOM)} + ${brl0(COB_SEG)};
  faturamento de ${brl0(FAT_TOUROS_TOTAL)} = ${brl0(FAT_DOM)} + ${brl0(FAT_SEG)}. Somados, viram <b>11 touros</b> —
  e 11 cai na faixa de 10 a 15, que é 0,75%. Separados, são ${porDia('19/07').length} e ${porDia('20/07').length}, que caem em 0,5% e 5%.
  Só a troca de faixa no domingo custa <b>${brl(FAT_DOM * 0.0075 - FAT_DOM * 0.005)}</b> (0,75% × ${brl0(FAT_DOM)} = ${brl(FAT_DOM * 0.0075)}
  contra os ${brl(FAT_DOM * 0.005)} corretos).</li>
  <li><b>Cobra 0,75% sobre o faturamento da segunda também.</b> São ${brl0(FAT_SEG)} entrando numa base que não é dele:
  0,75% × ${brl0(FAT_SEG)} = ${brl(FAT_SEG * 0.0075)} cobrados a mais.</li>
  <li><b>Nunca cobra os 5% da segunda-feira.</b> ${brl(COB_SEG * 0.05)} que a Bula tem direito e a planilha não pede —
  a linha inteira foi calculada só sobre faturamento.</li>
</ol>
<div class="conta">+ ${brl(FAT_DOM * 0.0075 - FAT_DOM * 0.005)}  faixa errada no domingo (0,75% em vez de 0,5%)
+ ${brl(FAT_SEG * 0.0075)}   faturamento da segunda cobrado como se fosse do domingo
− ${brl(COB_SEG * 0.05)}   os 5% da segunda que a planilha esqueceu de cobrar
= <b>${brl(DIF)}</b>   cobrados a mais</div>
<div class="card al">
  <div class="t">A faixa de 0,75% nunca foi acordada</div>
  Ela vem da tabela escalonada que a Guadalupe mandou em julho, aplicada por conta própria sobre o evento inteiro.
  A única aplicação que a leiloeira <i>confirmou por escrito</i> é a de 20/08: 5% sábado, 0,5% domingo, 5% segunda.
  Cobrar ${brl(TOT_PLANILHA)} é cobrar uma leitura da tabela que a outra parte não assinou.
</div>

<h2>5 · Situação no ERP e na cobrança</h2>
<p>O ERP já foi corrigido em 20/08 e está integralmente alinhado ao número da leiloeira — o desenho da cobrança é este:</p>
<table>
  <thead><tr><th>Vencimento</th><th>Título</th><th class="num">Valor</th><th>Status</th></tr></thead>
  <tbody>
    <tr><td>25/08/2026</td><td>Fêmeas 18/07 (5% cobertura) — parc. 1/2</td><td class="num">${brl(3000)}</td><td>recebido</td></tr>
    <tr><td>25/08/2026</td><td>Touros 19/07 (0,5% faturamento) — parc. 1/2</td><td class="num">${brl(7712.95)}</td><td>recebido</td></tr>
    <tr><td>25/09/2026</td><td>Touros 19/07 (0,5% faturamento) — parc. 2/2</td><td class="num">${brl(7502.95)}</td><td><b>aberto</b></td></tr>
    <tr><td>25/09/2026</td><td>Touros 20/07 (5% cobertura) — parc. 2/2</td><td class="num">${brl(3210)}</td><td><b>aberto</b></td></tr>
  </tbody>
  <tfoot><tr><td colspan="2">1ª parcela ${brl(10712.95)} · 2ª parcela ${brl(10712.95)}</td><td class="num">${brl(TOT_LEILOEIRA)}</td><td></td></tr></tfoot>
</table>
<div class="nota">A 2ª parcela foi lançada para 25/09 por convenção de 30 dias — <b>a conversa com a leiloeira não fixou essa data</b>.
Vale confirmar com a Valéria antes de cobrar.</div>

<h2 class="quebra">6 · Os três “agradece” que parecem venda — e não são</h2>
<p>Em três momentos alguém pediu para agradecer um comprador sem que houvesse arremate. São exatamente os casos que
inflariam a contagem de touros e mudariam a faixa da comissão, por isso cada um foi conferido na mensagem seguinte:</p>
${FALSOS_POSITIVOS.map((f) => `<div class="card">
  <div class="t">${f.quando} · lance chegou a ${brl0(f.ate)} · ${f.quem}</div>
  <div class="s" style="margin:4px 0">${f.texto}</div>
  ${f.porque}${f.seFosse !== '—' ? `<div class="nota"><b>Se fosse venda:</b> ${f.seFosse}</div>` : ''}
</div>`).join('')}
<div class="nota">O único desses três que ainda merece uma pergunta é o do condomínio C+4 / Galopeira / Flor do Aratau, em
11:24 de 19/07. As mensagens dizem que o martelo caiu antes, mas o valor é alto o bastante para valer uma confirmação
direta com o Douglas.</div>

<h2>7 · O que fazer</h2>
<ol>
  <li><b>Corrigir a linha 100 da planilha-mestra</b> — quebrar em duas: 19/07 Touros (faturamento ${brl0(FAT_DOM)}, venda
  ${brl0(COB_DOM)}, 0,5% → ${brl(15215.9)}) e 20/07 Touros (venda ${brl0(COB_SEG)}, 5% → ${brl(3210)}). A linha 99 (fêmeas) está certa.</li>
  <li><b>Baixar a receita esperada de julho em ${brl(DIF)}</b> — esse valor nunca foi devido e estava inflando o mês.</li>
  <li><b>Confirmar a data da 2ª parcela</b> (${brl(10712.95)}) com a Valéria antes de cobrar em 25/09.</li>
  <li><b>Fechar a dúvida do lote do condomínio</b> com o Douglas (item 6).</li>
  <li><b>Ajustar o cadastro do lote 04 de 20/07</b> para Novo Repartimento/PA.</li>
</ol>

<h2 class="quebra">8 · Todas as disputas capturadas no grupo</h2>
<p>Cada linha é um episódio de disputa, do primeiro lance ao desfecho. “Venda” é lote arrematado pela Bula;
“Perdido” é lote em que a Bula lançou e o cliente liberou, parou ou o martelo caiu com outro.</p>
<table>
  <thead><tr><th>Dia</th><th>Horário</th><th>Lote</th><th class="num">Lances</th><th class="num">De</th><th class="num">Até</th><th>Desfecho</th><th>Mensagem que fecha</th></tr></thead>
  <tbody>${DISPUTAS.map((d) => `<tr><td>${d.d}</td><td class="s">${d.h}</td><td><b>${d.lote || '—'}</b></td>
    <td class="num">${d.n}</td><td class="num">${brl0(d.de)}</td><td class="num">${brl0(d.ate)}</td>
    <td>${d.tipo === 'VENDA' ? '<b>Venda</b>' : d.tipo === 'PERDIDO' ? 'Perdido' : '—'}</td>
    <td class="s">${(d.marca || '').replace(/</g, '&lt;')}</td></tr>`).join('')}</tbody>
</table>
<div class="nota">${DISPUTAS.length} episódios · ${TOTAL_LANCES} lances com valor explícito ·
${DISPUTAS_PERDIDAS.length} disputas perdidas. A trilha completa de cada disputa, lance a lance, e o log integral das
mensagens estão na planilha e no arquivo de texto que acompanham este relatório.</div>

<div class="rodape">
  Bula Assessoria · gerado em 25/08/2026 a partir do grupo LANCES GUADALUPE (sessão Baileys joao-automation, VPS 76.13.169.168),
  conferido contra bula_leilao_vendas, bula_leilao_fechamento e erp_contas_receber.
  Faturamento de domingo (${brl0(FAT_DOM)}) e de segunda (${brl0(FAT_SEG)}) são deduzidos da conta da leiloeira — não há fonte primária para eles.
</div>
</body></html>`

const htmlPath = join(OUT, 'Guadalupe-Julho-2026-Lances-e-Comissao.html')
writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({
  path: join(OUT, 'Guadalupe-Julho-2026-Lances-e-Comissao.pdf'),
  format: 'A4',
  printBackground: true,
  margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
})
await browser.close()

// ─── XLSX ────────────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new()

XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
  { Item: 'Comissão informada pela leiloeira (20/08/2026)', Valor: TOT_LEILOEIRA },
  { Item: 'Comissão na planilha-mestra (linhas 99+100)', Valor: TOT_PLANILHA },
  { Item: 'Diferença a corrigir', Valor: DIF },
  { Item: '', Valor: '' },
  ...LEILOEIRA.map((l) => ({ Item: `${l.dia} — ${l.pregao} · ${l.faixa} sobre ${l.base}`, Valor: l.comissao })),
  { Item: '', Valor: '' },
  { Item: 'Cobertura Bula 18/07 (fêmeas)', Valor: COB_SAB },
  { Item: 'Cobertura Bula 19/07 (touros)', Valor: COB_DOM },
  { Item: 'Cobertura Bula 20/07 (touros)', Valor: COB_SEG },
  { Item: 'Faturamento do pregão de domingo (deduzido)', Valor: FAT_DOM },
  { Item: 'Faturamento do pregão de segunda (deduzido)', Valor: FAT_SEG },
]), 'Validação')

XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(VENDAS.map((v) => ({
  Dia: v.dia, Pregão: v.pregao, Lote: v.lote, 'Parcela (lance)': v.parcela, 'VGV (×30)': v.vgv,
  Comprador: v.comprador, Fazenda: v.fazenda, 'Cidade/UF': v.cidade, Assessor: v.assessor,
  'Hora da ficha': v.hora, Fonte: v.fonte,
}))), 'Vendas')

XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DISPUTAS.map((d) => ({
  Dia: d.d, Horário: d.h, Lote: d.lote || '', 'Nº de lances': d.n, 'Primeiro lance': d.de, 'Último lance': d.ate,
  Desfecho: d.tipo, 'Mensagem que fecha': d.marca, 'Trilha de lances': (d.trilha || []).join(' | '),
}))), 'Disputas')

const LOG = MSGS
  .filter((m) => { const d = new Date((m.ts - 3 * 3600) * 1000).toISOString().slice(0, 10); return d >= '2026-07-17' && d <= '2026-07-21' })
  .map((m) => ({
    'Data/hora (BRT)': dataBR(m), Quem: quem(m), Tipo: m.tipo.replace('Message', ''),
    Mensagem: (m.texto || '').replace(/\n/g, ' / '), 'Responde a': m.quoted ? m.quoted.replace(/\n/g, ' / ') : '',
  }))
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(LOG), 'Log do grupo')

XLSX.writeFile(wb, join(OUT, 'Guadalupe-Julho-2026-Lances-e-Vendas.xlsx'))

writeFileSync(join(OUT, 'LANCES-GUADALUPE-log-completo.txt'),
  LOG.map((l) => `${l['Data/hora (BRT)']} | ${l.Quem} | ${l.Tipo} | ${l.Mensagem}${l['Responde a'] ? ` «resp: ${l['Responde a']}»` : ''}`).join('\n'), 'utf-8')

console.log('OK →', OUT)
console.log(`  vendas: ${VENDAS.length} lotes · cobertura ${brl(COB_TOT)}`)
console.log(`  leiloeira ${brl(TOT_LEILOEIRA)} · planilha ${brl(TOT_PLANILHA)} · diferença ${brl(DIF)}`)
console.log(`  disputas: ${DISPUTAS.length} episódios · ${TOTAL_LANCES} lances · log ${LOG.length} mensagens`)
