/**
 * Plano de redução de impostos + projeção até dez/2026 — Bula Assessoria Pecuária Ltda.
 * Complementa o Diagnóstico Tributário de 13/08/2026.
 *
 * Série de receita reconstruída das guias de ISS efetivamente pagas (ISS = 5% exato),
 * lidas do extrato conciliado (erp_movimentos_bancarios). RBT12 por engenharia reversa
 * dos DAS pagos. Projeção ago-dez escala o 2º semestre de 2025 pela queda medida no 1º
 * semestre de 2026.
 * Saída: HTML + PDF na Área de Trabalho. Identidade: preto e branco (brandbook).
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const OUTDIR = 'C:/Users/Notebook-Acer/Desktop/Diagnostico Tributario Bula 2026-08'
fs.mkdirSync(OUTDIR, { recursive: true })
const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const k0 = n => 'R$ ' + Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pc = (n, d = 2) => (n * 100).toFixed(d).replace('.', ',') + '%'

/* ---------- receita 2026 reconstruída das guias de ISS pagas ---------- */
const ISS26 = { jan: 3008.55, fev: 9366.25, mar: 768.86, abr: 5187.27, mai: 6689.01, jun: 12566.78, jul: 24524.81 }
const REC26 = Object.fromEntries(Object.entries(ISS26).map(([k, v]) => [k, v / 0.05]))
const RBA_JAN_JUL = Object.values(REC26).reduce((a, b) => a + b, 0)

const rbtDe = (das, rec) => 125640 / (0.21 - (das / rec) / 0.665)
const RBT_JUL = rbtDe(55846.64, REC26.jul)
const RBT_SERIE = {
  abr: rbtDe(12078.62, REC26.abr), mai: rbtDe(15362.21, REC26.mai),
  jun: rbtDe(28660.03, REC26.jun), jul: RBT_JUL,
}

/* ---------- 2º semestre de 2025 (derivado) ---------- */
const H2_25 = RBT_JUL - (RBA_JAN_JUL - REC26.jul)
const VGV25 = { jul: 7346230, ago: 15426797.9, set: 5930600, out: 6711420, nov: 5445600, dez: 3787000 }
const somaV = Object.values(VGV25).reduce((a, b) => a + b, 0)
const REC25 = Object.fromEntries(Object.entries(VGV25).map(([k, v]) => [k, H2_25 * v / somaV]))

/* ---------- projeção ago-dez/2026 ---------- */
const H1_25 = 943855, H1_26 = RBA_JAN_JUL - REC26.jul
const FATOR = H1_26 / H1_25
const AGO_DEZ = H2_25 * FATOR - REC26.jul
const somaAgoDez25 = somaV - VGV25.jul
const MESES = ['ago', 'set', 'out', 'nov', 'dez']
const NOME = { ago: 'agosto', set: 'setembro', out: 'outubro', nov: 'novembro', dez: 'dezembro' }
const PROJ = Object.fromEntries(MESES.map(m => [m, AGO_DEZ * VGV25[m] / somaAgoDez25]))

let R = RBT_JUL - REC25.jul + REC26.jul
const LINHAS = []
for (const m of MESES) {
  const ef = (R * 0.21 - 125640) / R
  const rec = PROJ[m], das = rec * ef * 0.665, iss = rec * 0.05
  LINHAS.push({ m, rbt: R, ef, rec, das, iss, tot: das + iss })
  R = R - REC25[m] + rec
}
const T = LINHAS.reduce((a, l) => ({ rec: a.rec + l.rec, das: a.das + l.das, iss: a.iss + l.iss, tot: a.tot + l.tot }),
  { rec: 0, das: 0, iss: 0, tot: 0 })
const RBA_2026 = RBA_JAN_JUL + AGO_DEZ
const IMPOSTO_PAGO_JAN_JUL = 3008.55 + 9366.25 + 768.86 + 5187.27 + 6689.01 + 12566.78 + 24524.81
  + 29884.16 + 12078.62 + 15362.21 + 28660.03 + 55846.64

/* ---------- alavancas ---------- */
const recSetDez = ['set', 'out', 'nov', 'dez'].reduce((a, m) => a + PROJ[m], 0)
const recOutDez = ['out', 'nov', 'dez'].reduce((a, m) => a + PROJ[m], 0)
// VERIFICADO em 13/08: as NFS-e 615, 616, 618, 621 e 623 usam o item 17.01 a 5,000000%,
// e Campo Grande aplica 5% a todos os itens compatíveis com a atividade. Não há alavanca
// de alíquota nem pagamento a maior — logo, não cabe reajuste nem restituição.
const ISS_PROV = 0
const ISS_OTIM = 0
const RESTIT_ANO = 0
const PROVISAO = T.rec * (0.18 - T.tot / T.rec)

/* 2027: RBT12 estabiliza perto do RBA de 2026; ISS volta para dentro do DAS */
const RBT27 = RBA_2026
const ef27 = (RBT27 * 0.21 - 125640) / RBT27
const custo27IssDentro = RBT27 * ef27 - (RBT27 * ef27 * 0.665 + RBT27 * 0.05)
const efV27 = (RBT27 * 0.23 - 62100) / RBT27
const RISCO_ANEXO_V = RBT27 * efV27 - RBT27 * ef27

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Plano de Redução de Impostos — Bula Assessoria</title>
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111; margin: 0; font-size: 10pt; line-height: 1.45; }
  h1 { font-size: 21pt; letter-spacing: .03em; text-transform: uppercase; margin: 0 0 2mm; }
  h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: .06em; margin: 9mm 0 2.5mm;
       border-bottom: 1.5pt solid #111; padding-bottom: 1.5mm; page-break-after: avoid; }
  h3 { font-size: 9.5pt; text-transform: uppercase; letter-spacing: .05em; margin: 5mm 0 1.5mm;
       page-break-after: avoid; }
  .sub { color: #555; font-size: 9.5pt; margin: 0 0 6mm; }
  header { border-bottom: 3pt solid #111; padding-bottom: 4mm; margin-bottom: 6mm; }
  .kpis { display: flex; gap: 3mm; margin: 0 0 5mm; }
  .kpi { flex: 1; border: 1pt solid #111; padding: 3mm; }
  .kpi .l { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .07em; color: #444; }
  .kpi .v { font-size: 13.5pt; font-weight: 700; margin-top: 1mm; }
  .kpi .n { font-size: 7.5pt; color: #666; margin-top: .5mm; line-height: 1.3; }
  .kpi.dark { background: #111; color: #fff; } .kpi.dark .l, .kpi.dark .n { color: #bbb; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 4mm; }
  th { text-align: left; text-transform: uppercase; font-size: 7.5pt; letter-spacing: .05em;
       border-bottom: 1pt solid #111; padding: 1.5mm; color: #333; }
  td { padding: 1.6mm 1.5mm; border-bottom: .4pt solid #ddd; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { border-top: 1.2pt solid #111; border-bottom: none; font-weight: 700; padding-top: 2mm; }
  tr.hi td { background: #f2f2f2; font-weight: 700; }
  .nota { font-size: 8.8pt; color: #444; margin: 0 0 3mm; }
  ul, ol { margin: 0 0 4mm; padding-left: 5mm; } li { margin-bottom: 1.8mm; font-size: 9.3pt; }
  .caixa { border: 1pt solid #111; padding: 4mm; margin-bottom: 5mm; page-break-inside: avoid; }
  .caixa.dark { background: #111; color: #fff; }
  .caixa h3 { margin-top: 0; }
  .acao { border-left: 2.5pt solid #111; padding: 0 0 0 3.5mm; margin-bottom: 5mm; page-break-inside: avoid; }
  .acao .cab { font-size: 9.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .acao .meta { font-size: 7.8pt; text-transform: uppercase; letter-spacing: .06em; color: #666; margin: .8mm 0 1.5mm; }
  .quebra { page-break-before: always; }
  footer { margin-top: 8mm; border-top: 1pt solid #111; padding-top: 2mm; font-size: 7.5pt; color: #666; }
</style></head><body>

<header>
  <h1>Plano de Redução de Impostos</h1>
  <div class="sub">Bula Assessoria Pecuária Ltda · CNPJ 34.791.630/0001-43 · projeção até 31/12/2026<br>
  Elaborado em 13/08/2026 · versão 2, revista após leitura das NFS-e 615, 616, 618, 621 e 623</div>
</header>

<div class="kpis">
  <div class="kpi"><div class="l">Já pago em 2026</div><div class="v">${k0(IMPOSTO_PAGO_JAN_JUL)}</div>
    <div class="n">jan a jul, DAS + ISSQN</div></div>
  <div class="kpi"><div class="l">Projetado ago–dez</div><div class="v">${k0(T.tot)}</div>
    <div class="n">sobre ${k0(T.rec)} de receita</div></div>
  <div class="kpi dark"><div class="l">Economia real em 2026</div>
    <div class="v">R$ 0,00</div>
    <div class="n">alavanca do ISS verificada e descartada</div></div>
  <div class="kpi"><div class="l">Valor do plano em 2027</div><div class="v">${k0(RISCO_ANEXO_V)}</div>
    <div class="n">por ano, sobretudo risco evitado</div></div>
</div>

<div class="caixa">
<h3>A resposta direta, antes dos detalhes</h3>
<p style="margin:0 0 2mm"><strong>Até 31/12/2026 não há economia de imposto a fazer.</strong> A única
alavanca que cortaria imposto ainda este ano era a alíquota do ISS, e ela foi verificada nas notas fiscais
e descartada — o detalhamento está no bloco 3. Não cabe reajuste de alíquota nem pedido de restituição:
não houve pagamento a maior.</p>
<p style="margin:0 0 2mm"><strong>O que restou é mais importante do que era a economia.</strong> As notas
mostraram que cada NFS-e emitida pela Bula descreve o serviço como <em>"assessoria ou consultoria de
qualquer natureza"</em> — que é exatamente a redação que sustenta o enquadramento no Anexo V. A empresa
está declarando, por escrito e em todo documento que emite, a tese que custaria
R$ ${brl(RISCO_ANEXO_V)} por ano. Isso deixou de ser um risco teórico e virou a prioridade número um.</p>
<p style="margin:0"><strong>E as duas decisões de 2027 continuam de pé:</strong> a opção de IBS/CBS,
que fecha em 30/09, e o regime de caixa, em janeiro. A primeira ficou mais fácil de decidir depois de ver
quem são os tomadores das notas.</p>
</div>

<h2>1. Onde estamos: 2026 mês a mês</h2>
<p class="nota">A receita mensal abaixo não é estimativa: foi reconstruída das guias de ISS efetivamente
pagas no extrato conciliado (o ISS é 5% exato, então a receita é o valor da guia dividido por 0,05). Os
RBT12 vêm da engenharia reversa dos DAS pagos.</p>
<table>
<thead><tr><th>Competência</th><th class="num">Receita faturada</th><th class="num">ISSQN pago</th>
<th class="num">DAS pago</th><th class="num">RBT12 apurado</th></tr></thead>
<tbody>
${[['jan', 'janeiro'], ['fev', 'fevereiro'], ['mar', 'março'], ['abr', 'abril'], ['mai', 'maio'], ['jun', 'junho'], ['jul', 'julho']]
  .map(([k, nome]) => {
    const das = { fev: 29884.16, abr: 12078.62, mai: 15362.21, jun: 28660.03, jul: 55846.64 }[k]
    return `<tr><td>${nome}/2026</td><td class="num">R$ ${brl(REC26[k])}</td>
    <td class="num">R$ ${brl(ISS26[k])}</td><td class="num">${das ? 'R$ ' + brl(das) : '—'}</td>
    <td class="num">${RBT_SERIE[k] ? 'R$ ' + brl(RBT_SERIE[k]) : '—'}</td></tr>`
  }).join('')}
</tbody>
<tfoot><tr><td>Acumulado jan–jul</td><td class="num">R$ ${brl(RBA_JAN_JUL)}</td>
<td class="num" colspan="2">R$ ${brl(IMPOSTO_PAGO_JAN_JUL)} de imposto</td><td class="num"></td></tr></tfoot>
</table>
<p class="nota"><strong>Um ponto de controle que salta aos olhos:</strong> março teve 16 fechamentos e
R$ 2,09 milhões de VGV, mas só R$ ${brl(REC26.mar)} de receita faturada. O faturamento está saindo com
atraso grande em relação ao leilão — o imposto não é evitado, só empurrado, e nota emitida fora do prazo
gera multa municipal. Conciliar fechamentos contra NFS-e emitidas entrou no plano como ação 7.</p>

<h2>2. Projeção até dezembro</h2>
<p class="nota">Método: o 2º semestre de 2025 rendeu R$ ${brl(H2_25)} de receita (valor derivado do RBT12).
O 1º semestre de 2026 veio ${pc(1 - FATOR, 1)} abaixo do de 2025. Aplicando essa mesma queda ao 2º semestre
e distribuindo pelos meses conforme o VGV histórico, chega-se a <strong>R$ ${brl(AGO_DEZ)} de receita entre
agosto e dezembro</strong>. O RBT12 cai mês a mês porque os meses fortes de 2025 vão saindo da janela — e,
com ele, a alíquota efetiva.</p>
<table>
<thead><tr><th>Competência</th><th class="num">RBT12</th><th class="num">Alíquota efetiva</th>
<th class="num">Receita projetada</th><th class="num">DAS</th><th class="num">ISSQN</th><th class="num">Total</th></tr></thead>
<tbody>
${LINHAS.map(l => `<tr><td>${NOME[l.m]}/2026</td><td class="num">R$ ${brl(l.rbt)}</td>
<td class="num">${pc(l.ef, 3)}</td><td class="num">R$ ${brl(l.rec)}</td>
<td class="num">R$ ${brl(l.das)}</td><td class="num">R$ ${brl(l.iss)}</td>
<td class="num">R$ ${brl(l.tot)}</td></tr>`).join('')}
</tbody>
<tfoot><tr><td>Total ago–dez</td><td class="num"></td><td class="num">${pc(T.tot / T.rec)}</td>
<td class="num">R$ ${brl(T.rec)}</td><td class="num">R$ ${brl(T.das)}</td>
<td class="num">R$ ${brl(T.iss)}</td><td class="num">R$ ${brl(T.tot)}</td></tr></tfoot>
</table>

<div class="caixa">
<h3>Duas conclusões da projeção que mudam decisão</h3>
<p style="margin:0 0 2mm"><strong>1. Não há risco de degrau em 2026.</strong> O RBT12 termina o ano em
R$ ${brl(LINHAS[4].rbt)} e o faturamento acumulado de 2026 fecha em torno de
<strong>R$ ${brl(RBA_2026)}</strong> — bem longe dos R$ 3,6 milhões. A preocupação com a 6ª faixa, que valia
R$ 126 mil, <em>não se materializa este ano</em>. Continua valendo o monitoramento, mas não precisa
condicionar o calendário de faturamento do fim do ano.</p>
<p style="margin:0"><strong>2. Em 2027 o ISS volta para dentro do DAS — e isso custa caro.</strong> Como o
faturamento de 2026 não vai estourar o sublimite, o impedimento acaba e a partir de 01/01/2027 o ISS passa
a ser calculado pela tabela do Simples de novo. Como a alíquota de ISS resultante fica acima de 5%, ela
trava em 5% e o excedente é jogado nos tributos federais. Resultado: <strong>cerca de
R$ ${brl(custo27IssDentro)} a mais por ano, automaticamente</strong>, sem que nada tenha mudado na empresa.
Não é evitável — mas precisa entrar no orçamento de 2027 para ninguém achar que houve erro.</p>
</div>

<h2 class="quebra">3. O plano — 8 ações</h2>

<div class="acao">
<div class="cab">Ação 1 — Alíquota do ISS <span class="tag">verificada em 13/08 · encerrada</span></div>
<div class="meta">Conclusão: não há alavanca · não cabe reajuste nem restituição</div>
<p class="nota" style="margin:0 0 2mm">Foram examinadas as NFS-e 615, 616, 618, 621 e 623, emitidas entre
junho e julho de 2026. Todas trazem o mesmo enquadramento:</p>
<p class="nota" style="margin:0 0 2mm">• <strong>Item da lista:</strong> 17.01 — assessoria ou consultoria
de qualquer natureza, não contida em outros itens desta lista.<br>
• <strong>Alíquota:</strong> 5,000000%, aplicada automaticamente pelo sistema da Prefeitura a partir do item
— não é escolha de quem emite.<br>
• <strong>CNAE na nota:</strong> 0162-8/99-00, rotulado pelo município como "assessoria ou consultoria para
o setor pecuário".<br>
• <strong>ISSQN não retido</strong> em nenhuma delas, e município de incidência Campo Grande.</p>
<p class="nota" style="margin:0">Campo Grande aplica <strong>5% a todos os itens compatíveis com a
atividade</strong> — 17.01 (assessoria/consultoria), 10.05 (agenciamento, corretagem ou intermediação de
bens móveis), 10.09 (representação), 17.10 (organização de feiras) e 17.13 (leilão). As únicas alíquotas
menores no município são 4%, restritas a saúde e educação. Ou seja: <strong>não existe item mais barato
para onde migrar, não houve pagamento a maior e não há o que restituir</strong>. Os R$ 2 a 3 pontos
percentuais que apareciam como oportunidade na versão anterior deste plano não existem. Vale confirmar a
Tabela I do Anexo II da LC 59/2003 direto na SEFAZ para fechar o assunto por escrito.</p>
</div>

<div class="acao">
<div class="cab">Ação 2 — Conferir o RBT12 no PGDAS-D</div>
<div class="meta">Responsável: contador · Prazo: 20/08/2026 · Valor: corrige erro de base</div>
<p class="nota" style="margin:0">Comparar o RBT12 declarado com os R$ ${brl(RBT_JUL)} apurados por
engenharia reversa da guia de julho. Divergência significa declaração errada em algum mês — o que muda a
alíquota de todos os meses seguintes, para mais ou para menos.</p>
</div>

<div class="acao">
<div class="cab">Ação 3 — ISS retido na fonte <span class="tag">verificada em 13/08 · encerrada</span></div>
<div class="meta">Conclusão: não há duplicidade a recuperar</div>
<p class="nota" style="margin:0">As cinco notas examinadas trazem "ISSQN NÃO RETIDO" e apontam Campo Grande
como município de incidência, com o prestador como responsável pelo recolhimento. Para os itens 17.01 e
10.05 o ISS é devido no estabelecimento do prestador, então a retenção por tomador de outro município nem
caberia. As deduções zeradas na guia estão corretas — não é sinal de erro.</p>
</div>

<div class="acao">
<div class="cab">Ação 4 — Blindar o Anexo III <span class="tag alerta">prioridade 1</span></div>
<div class="meta">Responsável: João Eduardo + chefe + contador · Prazo: 15/09/2026 · Evita ${k0(RISCO_ANEXO_V)}/ano</div>
<p class="nota" style="margin:0 0 2mm">A leitura das notas transformou esta ação. O enquadramento no
Anexo III se apoia no <strong>código</strong> do CNAE principal — 0162-8/99, apoio à pecuária, que não
depende do Fator R. Mas o <strong>texto</strong> de cada nota emitida diz outra coisa: item 17.01,
"assessoria ou consultoria de qualquer natureza", e o próprio CNAE aparece rotulado como "assessoria ou
consultoria para o setor pecuário". "Consultoria" é palavra do §5º-I da LC 123 — a lista que leva ao
Anexo V. E a descrição livre reforça: "comissão leilão", que é intermediação de negócios, também Anexo V.</p>
<p class="nota" style="margin:0 0 2mm">Não é um risco hipotético levantado de fora: é a redação que a
própria empresa assina em todo documento fiscal que emite, e que o município e a Receita já têm em base.
Com a folha em torno de 12% do faturamento, o Fator R não socorreria — a empresa cairia inteira no
Anexo V, ${pc(RISCO_ANEXO_V / RBT27, 2)} da receita a mais, com até cinco anos retroativos.</p>
<p class="nota" style="margin:0">O que fazer: (a) levar as cinco notas ao contador e decidir, com ele, se o
item 17.01 é mesmo o correto ou se a atividade se descreve melhor como apoio à pecuária; (b) padronizar a
descrição livre para o que a Bula de fato faz — captação e assessoria de compradores, acompanhamento de
lotes, apoio operacional ao pregão; (c) ter contrato escrito com as leiloeiras e criadores nesses termos.
<strong>Atenção ao efeito cruzado:</strong> migrar o item para 10.05 (intermediação) não muda nada no ISS,
que continua 5%, e ainda reforça a tese de Anexo V. Trocar o item por motivo de ISS seria pagar caro por
nada. A decisão do item precisa ser tomada olhando o Simples, não o ISS.</p>
</div>

<div class="acao">
<div class="cab">Ação 5 — Decidir sobre IBS/CBS para 2027</div>
<div class="meta">Responsável: contador + chefe · Prazo: 25/09/2026 (janela fecha 30/09) · Indicação: não optar</div>
<p class="nota" style="margin:0 0 2mm">As notas responderam a pergunta que faltava: <strong>quem são os
tomadores</strong>. Nas cinco examinadas, são criadores — Roberto Bavaresco (pessoa física, Sidrolândia),
JBJ Agropecuária (Cassilândia), Tangará Pecuária, Eduardo Pinheiro Campos, Thiago Lombardi. A Bula fatura
o dono do gado, não a leiloeira.</p>
<p class="nota" style="margin:0">Isso enfraquece muito o argumento para optar pelo regime regular de
IBS/CBS. O ganho da opção vem de o cliente aproveitar crédito integral — e produtor rural pessoa física, e
boa parte dos produtores pessoa jurídica, não são tomadores de crédito nesse desenho. Sem crédito do outro
lado, destacar o imposto por fora vira aumento de preço real para o cliente.
<strong>Indicação: não optar</strong>, mantendo tudo no DAS, que é também o default de quem não faz nada.
Confirmar com o contador o perfil tributário dos maiores tomadores antes de 25/09, e lembrar que a opção
pode ser refeita em março para o segundo semestre de 2027.</p>
</div>

<div class="acao">
<div class="cab">Ação 6 — Formalizar pró-labore e desenhar as retiradas</div>
<div class="meta">Responsável: contador · Prazo: 30/09/2026 · Valor: elimina contingência</div>
<p class="nota" style="margin:0">Não há pró-labore de sócio lançado no ERP, e sócio que trabalha na empresa
precisa ter. Como no Anexo III a contribuição patronal já está dentro do DAS, formalizar custa pouco.
Aproveitar para desenhar as retiradas: desde 2026 há 10% de IRRF sobre lucros distribuídos acima de
R$ 50 mil por mês, por sócio, por empresa — espaçar as distribuições ao longo dos meses evita a retenção.
Confirmar também se existe escrituração contábil completa, que é o que permite distribuir todo o lucro
com isenção.</p>
</div>

<div class="acao">
<div class="cab">Ação 7 — Conciliar fechamentos contra NFS-e emitidas</div>
<div class="meta">Responsável: João Eduardo · Prazo: 30/09/2026 · Valor: evita multa e surpresa de caixa</div>
<p class="nota" style="margin:0">Março de 2026 fechou R$ 2,09 milhões de VGV e faturou R$ ${brl(REC26.mar)}.
O descompasso entre leilão, recebimento e emissão de nota precisa ser mapeado: quanto já foi ganho e ainda
não foi faturado. Isso não reduz imposto, mas evita nota fora do prazo, mostra o passivo tributário que
ainda vai vencer e melhora a qualidade da projeção acima.</p>
</div>

<div class="acao">
<div class="cab">Ação 8 — Ajustar a provisão de imposto no ERP</div>
<div class="meta">Responsável: João Eduardo · Prazo: 31/08/2026 · Libera ${k0(PROVISAO)} de provisão</div>
<p class="nota" style="margin:0">Os fechamentos provisionam 18% de imposto; a carga real projetada para
ago–dez é ${pc(T.tot / T.rec)}. Sobre a receita do período são cerca de R$ ${brl(PROVISAO)} provisionados a
mais do que vai vencer. Não é economia — é caixa que está travado por uma premissa desatualizada. Ajustar
para ${pc(T.tot / T.rec, 1)} ou assumir a folga como reserva declarada. Ajustar também a conta a pagar do
DAS de julho, lançada a R$ 56.000,00 contra a guia real de R$ 55.846,64.</p>
</div>

<h2>4. Quanto dá para economizar — três baldes separados</h2>
<p class="nota">Misturar economia de caixa com risco evitado produz número bonito e decisão ruim. Os três
baldes abaixo são somados só no fim, e com etiqueta.</p>

<h3>Balde 1 — Caixa que deixa de sair até 31/12/2026</h3>
<table>
<thead><tr><th>Alavanca</th><th class="num">Valor</th><th>Situação em 13/08</th></tr></thead>
<tbody>
<tr><td>ISS a alíquota menor</td><td class="num">R$ 0,00</td>
<td>verificada nas NFS-e: 5% é a alíquota de todos os itens compatíveis em Campo Grande</td></tr>
<tr><td>Restituição de ISS pago a maior</td><td class="num">R$ 0,00</td>
<td>não houve pagamento a maior; não há indébito a repetir</td></tr>
<tr><td>ISS retido em duplicidade</td><td class="num">R$ 0,00</td>
<td>notas com ISSQN não retido e incidência em Campo Grande</td></tr>
<tr><td>Reembolsos e repasses dentro da base</td><td class="num">a apurar</td>
<td>as notas trazem deduções zeradas; conferir se algum valor faturado é repasse de terceiro</td></tr>
</tbody>
<tfoot><tr><td>Economia de caixa em 2026</td><td class="num">R$ 0,00</td>
<td>o ano corrente já está tributariamente definido</td></tr></tfoot>
</table>
<p class="nota">Essa linha mudou de R$ 12.744 para zero entre a primeira e a segunda versão deste plano.
A hipótese anterior era razoável — a empresa está na alíquota máxima e o piso legal do município é 2% —
mas a leitura das notas mostrou que os 5% vêm do item da lista, aplicados pelo próprio sistema da
Prefeitura, e que não há item mais barato compatível com a atividade. Vale mais registrar a correção do que
manter um número que não se sustenta.</p>

<h3>Balde 2 — Valor recorrente, a partir de 2027</h3>
<table>
<thead><tr><th>Item</th><th class="num">Por ano</th><th>Condição</th></tr></thead>
<tbody>
<tr><td>Regime de caixa: imposto sobre título não recebido</td><td class="num">R$ ${brl(16386)} por R$ 100 mil</td>
<td>opção até o último dia útil de janeiro/2027</td></tr>
<tr><td>Retorno do ISS para dentro do DAS</td><td class="num">− R$ ${brl(custo27IssDentro)}</td>
<td>automático e inevitável; entra como custo, não economia</td></tr>
<tr><td>Opção pelo regime regular de IBS/CBS</td><td class="num">desfavorável</td>
<td>tomadores são criadores, sem aproveitamento de crédito — indicação é não optar</td></tr>
</tbody></table>

<h3>Balde 3 — Risco evitado (não é caixa, é exposição)</h3>
<table>
<thead><tr><th>Exposição</th><th class="num">Por ano</th><th class="num">Retroativo possível</th></tr></thead>
<tbody>
<tr class="hi"><td>Reclassificação da receita para o Anexo V</td><td class="num">R$ ${brl(RISCO_ANEXO_V)}</td>
<td class="num">até 5 anos + multa de 75% + juros</td></tr>
<tr><td>Item 17.01 nas notas descreve o serviço como "consultoria"</td>
<td class="num">é o gatilho do Anexo V</td><td class="num">documentado em toda nota emitida</td></tr>
<tr><td>Ausência de pró-labore de sócio</td><td class="num">a apurar</td><td class="num">até 5 anos</td></tr>
<tr><td>Nota fiscal emitida fora do prazo (descompasso de março)</td><td class="num">a apurar</td>
<td class="num">multa municipal por documento</td></tr>
</tbody></table>
<p class="nota">A folha de R$ 33.100/mês tem FGTS de apenas R$ 938,67 — 8% de cerca de R$ 11,7 mil. Ou seja,
só um terço da folha é CLT. Confirmar com o contador como os outros R$ 21 mil são pagos (PJ, autônomo ou
pró-labore), porque cada forma tem tratamento e risco diferentes. Não é achismo sobre irregularidade: é uma
informação que falta para fechar o quadro.</p>

<div class="caixa dark">
<h3 style="color:#fff">Somando com etiqueta</h3>
<p style="margin:0 0 2mm"><strong>Até 31/12/2026: R$ 0,00.</strong> A alavanca do ISS foi verificada e não
existe. O imposto de 2026 é o que a projeção do bloco 2 mostra — R$ ${brl(T.tot)} de agosto a dezembro — e
não há providência legítima que reduza isso dentro do ano.</p>
<p style="margin:0"><strong>A partir de 2027:</strong> o plano vale R$ ${brl(RISCO_ANEXO_V)} por ano em
risco eliminado — e esse número ficou mais concreto, não menos, depois de ver as notas. Descontado o
aumento automático de R$ ${brl(custo27IssDentro)}/ano do retorno do ISS ao DAS, o trabalho de agosto e
setembro é inteiro sobre a ação 4 e as duas decisões de 2027. Nenhuma delas devolve dinheiro este ano;
todas evitam perder muito mais depois.</p>
</div>

<h2>5. Calendário</h2>
<table>
<thead><tr><th style="width:24mm">Prazo</th><th>O que precisa estar pronto</th><th style="width:34mm">Quem</th></tr></thead>
<tbody>
<tr><td><strong>17/08</strong></td><td>Pagar a guia de ISSQN de julho — R$ 24.524,81</td><td>Financeiro</td></tr>
<tr><td><strong>20/08</strong></td><td>Pagar o DAS de julho — R$ 55.846,64 (ajustar a CP de R$ 56.000 no ERP)</td><td>Financeiro</td></tr>
<tr><td><strong>20/08</strong></td><td>Ação 2: conferência do RBT12 no PGDAS-D contra R$ ${brl(RBT_JUL)}</td><td>Contador</td></tr>
<tr><td><strong>31/08</strong></td><td>Ação 8: provisão ajustada para ${pc(T.tot / T.rec, 1)}; CP do DAS corrigida</td><td>João Eduardo</td></tr>
<tr><td><strong>31/08</strong></td><td>Confirmar por escrito, na SEFAZ, a Tabela I do Anexo II (fecha a ação 1)</td><td>Contador</td></tr>
<tr><td><strong>15/09</strong></td><td><strong>Ação 4 (prioridade 1):</strong> decidir o item da lista com o contador, padronizar a descrição das NFS-e e revisar contratos</td><td>João Eduardo + chefe</td></tr>
<tr><td><strong>25/09</strong></td><td>Ação 5: decisão sobre IBS/CBS fundamentada</td><td>Contador + chefe</td></tr>
<tr><td><strong>30/09</strong></td><td>Ações 6 e 7: pró-labore formalizado; conciliação fechamentos × NFS-e</td><td>Contador / João Eduardo</td></tr>
<tr><td><strong>30/09</strong></td><td>Fecha a janela do regime regular de IBS/CBS no Portal do Simples</td><td>—</td></tr>
<tr><td>Mensal</td><td>Atualizar a projeção com a receita realmente faturada e reconferir o RBT12</td><td>João Eduardo</td></tr>
<tr><td><strong>Jan/2027</strong></td><td>Decidir o regime de caixa (último dia útil de janeiro)</td><td>Contador</td></tr>
<tr><td>Orçamento 2027</td><td>Incluir o aumento automático de R$ ${brl(custo27IssDentro)}/ano do retorno do ISS ao DAS</td><td>João Eduardo</td></tr>
</tbody></table>

<h2>6. Premissas e como refazer a conta</h2>
<p class="nota"><strong>O que é fato medido.</strong> A receita de janeiro a julho de 2026 e o imposto pago
saem das guias e do extrato bancário conciliado — não são estimativa. Os RBT12 de abril a julho vêm da
engenharia reversa dos DAS pagos, método que reproduz a guia de julho ao centavo.</p>
<p class="nota"><strong>O que é projeção.</strong> A receita de agosto a dezembro parte de dois números
derivados: o 2º semestre de 2025 (R$ ${brl(H2_25)}) e a queda de ${pc(1 - FATOR, 1)} medida no 1º semestre
de 2026. A distribuição entre os meses segue a forma do VGV histórico. É um método simples e declarado, não
um modelo: se o segundo semestre repetir 2025 sem queda, a receita ago–dez sobe para cerca de
R$ ${brl(H2_25 - REC26.jul)} e o imposto acompanha. Vale reprojetar todo mês com o faturamento real.</p>
<p class="nota"><strong>Onde a projeção pode errar mais.</strong> No descompasso entre leilão e nota fiscal.
Agosto tem 25 leilões na agenda — a maior concentração do ano — mas o faturamento correspondente pode cair
em setembro, outubro ou novembro, conforme o repasse das leiloeiras. Isso desloca o imposto entre os meses
sem mudar o total do ano.</p>
<p class="nota"><strong>Limite deste documento.</strong> É um plano gerencial. As ações 1, 2, 5, 6 e a
conclusão sobre o Anexo III precisam ser validadas pelo contador responsável; a ação 4 e qualquer discussão
de estrutura societária, por advogado tributarista.</p>

<footer>
Bula Assessoria Pecuária Ltda · Plano de redução de impostos e projeção até dez/2026 · gerado em 13/08/2026.
Base: guias de ISSQN e DAS de jan a jul/2026, NFS-e 615, 616, 618, 621 e 623 emitidas pela Bula, extrato
Sicoob conciliado, cadastro CNPJ e ERP da Bula. A versão 1 estimava R$ 12.744 a R$ 26.227 de economia em
2026 pela alíquota do ISS; a leitura das notas descartou essa hipótese e o número foi corrigido para zero.
</footer>
</body></html>`

const htmlPath = path.join(OUTDIR, 'plano-reducao-impostos-2026.html')
fs.writeFileSync(htmlPath, html)
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
const pdfPath = path.join(OUTDIR, 'Plano-Reducao-Impostos-Bula-ate-dez-2026.pdf')
await page.pdf({
  path: pdfPath, format: 'A4', printBackground: true,
  margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
})
await browser.close()
console.log('PDF : ' + pdfPath)
console.log('receita ago-dez projetada: R$ ' + brl(AGO_DEZ) + ' | imposto: R$ ' + brl(T.tot))
console.log('RBA 2026: R$ ' + brl(RBA_2026) + ' | economia 2026: R$ ' + brl(ISS_PROV) + ' a R$ ' + brl(ISS_OTIM))
console.log('risco Anexo V/ano: R$ ' + brl(RISCO_ANEXO_V) + ' | custo automatico 2027: R$ ' + brl(custo27IssDentro))
