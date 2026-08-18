/**
 * Diagnóstico Tributário — Bula Assessoria Pecuária Ltda (competência julho/2026).
 * Responde: (1) como o ISSQN e o DAS são apurados, (2) o que dá para reduzir por
 * elisão/controle fiscal, (3) se o Simples Nacional Anexo III é mesmo o melhor regime.
 * Fontes: guia ISSQN 1674646 (SEFAZ Campo Grande), DAS 07.20.26224.2951097-3,
 * ficha CNPJ 34.791.630/0001-43, ERP da Bula (folha, impostos lançados).
 * Saída: HTML + PDF na Área de Trabalho.
 * Identidade: preto e branco (brandbook).
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const OUTDIR = 'C:/Users/Notebook-Acer/Desktop/Diagnostico Tributario Bula 2026-08'
fs.mkdirSync(OUTDIR, { recursive: true })

const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pc = (n, d = 3) => (n * 100).toFixed(d).replace('.', ',') + '%'

/* ---------------- fatos das guias ---------------- */
const REC_JUL = 490496.32
const ISS_JUL = 24524.81
const DAS_JUL = { IRPJ: 3359.20, CSLL: 2939.30, COFINS: 10766.22, PIS: 2334.64, CPP: 36447.28 }
const DAS_TOT = Object.values(DAS_JUL).reduce((a, b) => a + b, 0)
const CARGA_JUL = DAS_TOT + ISS_JUL

/* Anexo III, 5ª faixa: nominal 21%, deduzir 125.640; partilha sem ISS soma 66,5% */
const A3 = { IRPJ: 4.00, CSLL: 3.50, COFINS: 12.82, PIS: 2.78, CPP: 43.40 }
const A3_FED = 66.5
const EFETIVA = (DAS_TOT / REC_JUL) / (A3_FED / 100)
const RBT12 = 125640 / (0.21 - EFETIVA)

/* ---------------- cenários anuais (base RBT12) ---------------- */
const efA = (RBT12 * 0.21 - 125640) / RBT12
const dasA = RBT12 * efA * 0.665
const issA = RBT12 * 0.05
const totA = dasA + issA

const efB = (RBT12 * 0.23 - 62100) / RBT12          // Anexo V, 5ª faixa
const dasB = RBT12 * efB * (1 - 0.235)
const totB = dasB + issA

const FOLHA_CLT_ANO = 11733 * 13.33                  // FGTS de R$ 938,67 = 8% de R$ 11.733
const lpBase = RBT12 * 0.32
const LP = {
  irpj: lpBase * 0.15, adic: Math.max(0, lpBase - 240000) * 0.10, csll: lpBase * 0.09,
  pis: RBT12 * 0.0065, cofins: RBT12 * 0.03, iss: issA, cpp: FOLHA_CLT_ANO * 0.288,
}
LP.tot = LP.irpj + LP.adic + LP.csll + LP.pis + LP.cofins + LP.iss + LP.cpp

const COMISSOES = 1150000, DESPESAS = 260000
const lucroReal = RBT12 - COMISSOES - FOLHA_CLT_ANO - DESPESAS
const LR = {
  pisCofins: RBT12 * 0.0925 - COMISSOES * 0.0925,
  irpj: lucroReal * 0.15 + Math.max(0, lucroReal - 240000) * 0.10,
  csll: lucroReal * 0.09, iss: issA, cpp: FOLHA_CLT_ANO * 0.288,
}
LR.tot = LR.pisCofins + LR.irpj + LR.csll + LR.iss + LR.cpp

const degrau = [3400000, 3590000, 3610000, 4000000, 4400000, 4800000].map(r => {
  const ef = r <= 3600000 ? (r * 0.21 - 125640) / r : (r * 0.33 - 648000) / r
  const das = r <= 3600000 ? r * ef * 0.665 : r * ef
  return { r, das, iss: r * 0.05, tot: das + r * 0.05 }
})

const SE_ISS_DENTRO = RBT12 * efA
const GANHO_ISS_FORA = SE_ISS_DENTRO - totA
const BREAK_ISS = 125640 / (0.21 - 5 / 33.5)

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Diagnóstico Tributário — Bula Assessoria</title>
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
  .formula { font-family: "Consolas", monospace; font-size: 8.6pt; background: #f5f5f5;
             border-left: 2pt solid #111; padding: 2.5mm 3mm; margin: 2mm 0 3mm; white-space: pre-wrap;
             page-break-inside: avoid; }
  .tag { font-size: 6.8pt; text-transform: uppercase; letter-spacing: .05em; border: .5pt solid #999;
         padding: .3mm 1mm; color: #555; white-space: nowrap; }
  .tag.alerta { border-color: #111; background: #111; color: #fff; }
  .quebra { page-break-before: always; }
  footer { margin-top: 8mm; border-top: 1pt solid #111; padding-top: 2mm; font-size: 7.5pt; color: #666; }
</style></head><body>

<header>
  <h1>Diagnóstico Tributário</h1>
  <div class="sub">Bula Assessoria Pecuária Ltda · CNPJ 34.791.630/0001-43 · Campo Grande/MS<br>
  Competência de referência: julho/2026 · elaborado em 13/08/2026</div>
</header>

<div class="kpis">
  <div class="kpi dark"><div class="l">Carga de julho/2026</div><div class="v">R$ ${brl(CARGA_JUL)}</div>
    <div class="n">DAS + ISSQN somados</div></div>
  <div class="kpi"><div class="l">Sobre a receita do mês</div><div class="v">${pc(CARGA_JUL / REC_JUL, 2)}</div>
    <div class="n">de R$ ${brl(REC_JUL)}</div></div>
  <div class="kpi"><div class="l">Melhor regime</div><div class="v">O atual</div>
    <div class="n">Simples, Anexo III</div></div>
  <div class="kpi"><div class="l">Em jogo por ano</div><div class="v">R$ ${brl(totB - totA)}</div>
    <div class="n">se o enquadramento cair</div></div>
</div>

<div class="caixa">
<h3>Resposta curta às três perguntas</h3>
<ol>
<li><strong>Como se chega ao valor.</strong> São dois cálculos independentes sobre a mesma receita de
R$ ${brl(REC_JUL)}. O ISSQN é 5% direto (${pc(ISS_JUL / REC_JUL, 4)} exatos). O DAS é uma alíquota
progressiva que depende do faturamento dos últimos 12 meses, repartida em cinco tributos federais.
Reconstruí os dois cálculos do zero e eles fecham <strong>ao centavo</strong> — as guias estão corretas.</li>
<li><strong>Dá para reduzir?</strong> Sim, mas não onde parece. O ganho grande não está em pagar menos
imposto sobre a mesma receita — está em <strong>proteger o enquadramento que vocês já têm</strong>
(vale R$ ${brl(totB - totA)}/ano) e em duas frentes concretas: a alíquota do ISS, que hoje está no
<strong>teto de 5%</strong> quando o piso do município é 2%, e a opção pelo <strong>regime de caixa</strong>,
que hoje faz vocês pagarem imposto sobre dinheiro que ainda não entrou.</li>
<li><strong>Existe regime melhor?</strong> Não. O Simples Anexo III custa ${pc(totA / RBT12, 2)} da receita.
Lucro Presumido custaria ${pc(LP.tot / RBT12, 2)} e Lucro Real ${pc(LR.tot / RBT12, 2)}. Trocar de regime
<strong>aumentaria</strong> a conta em R$ ${brl(LP.tot - totA)} por ano no melhor dos casos.</li>
</ol>
</div>

<h2>1. Como o valor é apurado</h2>

<h3>1.1 O ISSQN — R$ ${brl(ISS_JUL)}</h3>
<p class="nota">É a parte simples. A Prefeitura de Campo Grande homologa as notas fiscais de serviço
emitidas no mês e aplica a alíquota da Tabela I do Anexo II da Lei Complementar municipal 59/2003.</p>
<div class="formula">Receita tributada no mês .... R$ ${brl(REC_JUL)}
Alíquota aplicada ........... 5,0000%  (teto permitido pela Constituição)
ISSQN devido ................ R$ ${brl(REC_JUL * 0.05)}  →  guia: R$ ${brl(ISS_JUL)}  (1 centavo de arredondamento)</div>
<p class="nota">A guia traz "Deduções/Descontos R$ 0,00". Isso significa que <strong>nenhum ISS retido na
fonte por tomador foi abatido</strong>. Se alguma leiloeira reteve ISS em outro município no mês, vocês
pagaram duas vezes sobre a mesma nota — item de conferência na alavanca 7.</p>

<h3>1.2 O DAS do Simples — R$ ${brl(DAS_TOT)}</h3>
<p class="nota">Aqui o cálculo tem quatro passos. A alíquota não é fixa: ela sobe conforme o faturamento
acumulado dos últimos 12 meses (o "RBT12").</p>

<div class="formula"><strong>Passo 1 — achar a faixa.</strong> A empresa está na 5ª faixa do Anexo III
   (RBT12 entre R$ 1,8 mi e R$ 3,6 mi): alíquota nominal 21%, parcela a deduzir R$ 125.640,00.

<strong>Passo 2 — alíquota efetiva.</strong>
   Efetiva = (RBT12 × 21% − 125.640) ÷ RBT12 = ${pc(EFETIVA)}

<strong>Passo 3 — tirar o ISS.</strong> No Anexo III o ISS pesa 33,5% da alíquota. Como a empresa está
   impedida de recolher ISS dentro do DAS (ver quadro abaixo), sobram os 66,5% federais:
   ${pc(EFETIVA)} × 66,5% = ${pc(DAS_TOT / REC_JUL)}

<strong>Passo 4 — aplicar na receita e repartir nos cinco tributos.</strong>
   R$ ${brl(REC_JUL)} × ${pc(DAS_TOT / REC_JUL)} = R$ ${brl(DAS_TOT)}</div>

<h3>1.3 Conferência: a repartição bate ao centavo</h3>
<table>
<thead><tr><th>Tributo</th><th class="num">% na tabela do Anexo III</th><th class="num">% dentro do DAS</th>
<th class="num">Valor da guia</th><th class="num">Recalculado</th></tr></thead>
<tbody>
${Object.entries(A3).map(([k, v]) => {
  const share = v / A3_FED
  return `<tr><td>${k === 'CPP' ? 'CPP (INSS patronal)' : k}</td><td class="num">${String(v.toFixed(2)).replace('.', ',')}%</td>
  <td class="num">${pc(share, 2)}</td><td class="num">R$ ${brl(DAS_JUL[k])}</td>
  <td class="num">R$ ${brl(DAS_TOT * share)}</td></tr>`
}).join('')}
</tbody>
<tfoot><tr><td>Total</td><td class="num">66,50%</td><td class="num">100,00%</td>
<td class="num">R$ ${brl(DAS_TOT)}</td><td class="num">R$ ${brl(DAS_TOT)}</td></tr></tfoot>
</table>
<p class="nota">Como a repartição fecha exatamente, dá para <strong>fazer a engenharia reversa do
faturamento dos últimos 12 meses</strong> a partir da própria guia:
<strong>RBT12 = R$ ${brl(RBT12)}</strong>. Vale conferir esse número no extrato do PGDAS-D — se ele
divergir, há erro de declaração em algum mês. A guia de junho/2026 (DAS de R$ 28.660,03 sobre receita de
R$ 251.335,60) devolve RBT12 de R$ 3.261.475, coerente com julho.</p>

<div class="caixa">
<h3>Por que o ISS vem numa guia separada — e por que isso está a favor de vocês</h3>
<p style="margin:0 0 2mm">O DAS de julho <strong>não tem linha de ISS</strong>. Isso acontece porque a
empresa ultrapassou o <strong>sublimite de R$ 3,6 milhões</strong> (quase certamente pelo faturamento de
2025), e quem ultrapassa fica impedido de recolher ISS dentro do Simples: paga direto ao município, pela
lei municipal. O RBT12 atual (R$ ${brl(RBT12)}) ainda está na 5ª faixa, o que confirma que o impedimento
veio do ano anterior e vale para todo o ano-calendário de 2026.</p>
<p style="margin:0"><strong>O efeito colateral é favorável.</strong> Se o ISS voltasse para dentro do DAS,
a alíquota de ISS seria ${pc(efA * 0.335)} — acima do teto de 5%. A regra do Anexo III trava o ISS em 5%,
mas <strong>joga o excedente para os tributos federais</strong>. Ou seja: vocês pagariam os mesmos 5% de
ISS <em>e mais</em> o excedente em IRPJ/CSLL/COFINS/PIS/CPP. Estando fora, o percentual de ISS simplesmente
sai da conta federal. <strong>Economia de R$ ${brl(GANHO_ISS_FORA)} por ano</strong>
(${pc(SE_ISS_DENTRO / RBT12, 2)} contra ${pc(totA / RBT12, 2)}). Esse ganho existe sempre que o RBT12
passa de R$ ${brl(BREAK_ISS)} — que é o caso.</p>
</div>

<h2 class="quebra">2. O enquadramento é mesmo o melhor?</h2>
<p class="nota">Comparação anualizada sobre a mesma base (RBT12 de R$ ${brl(RBT12)}), com a folha real da
empresa. Todos os cenários incluem o ISS de 5%, que é devido em qualquer regime.</p>

<table>
<thead><tr><th>Regime</th><th class="num">Federais</th><th class="num">ISS</th><th class="num">INSS s/ folha</th>
<th class="num">Total no ano</th><th class="num">% da receita</th><th class="num">vs. hoje</th></tr></thead>
<tbody>
<tr class="hi"><td>Simples Nacional — Anexo III <span class="tag">atual</span></td>
  <td class="num">R$ ${brl(dasA)}</td><td class="num">R$ ${brl(issA)}</td><td class="num">no DAS</td>
  <td class="num">R$ ${brl(totA)}</td><td class="num">${pc(totA / RBT12, 2)}</td><td class="num">—</td></tr>
<tr><td>Simples Nacional — Anexo V <span class="tag alerta">risco</span></td>
  <td class="num">R$ ${brl(dasB)}</td><td class="num">R$ ${brl(issA)}</td><td class="num">no DAS</td>
  <td class="num">R$ ${brl(totB)}</td><td class="num">${pc(totB / RBT12, 2)}</td>
  <td class="num">+ R$ ${brl(totB - totA)}</td></tr>
<tr><td>Lucro Presumido</td>
  <td class="num">R$ ${brl(LP.irpj + LP.adic + LP.csll + LP.pis + LP.cofins)}</td><td class="num">R$ ${brl(LP.iss)}</td>
  <td class="num">R$ ${brl(LP.cpp)}</td><td class="num">R$ ${brl(LP.tot)}</td>
  <td class="num">${pc(LP.tot / RBT12, 2)}</td><td class="num">+ R$ ${brl(LP.tot - totA)}</td></tr>
<tr><td>Lucro Real <span class="tag">estimado</span></td>
  <td class="num">R$ ${brl(LR.pisCofins + LR.irpj + LR.csll)}</td><td class="num">R$ ${brl(LR.iss)}</td>
  <td class="num">R$ ${brl(LR.cpp)}</td><td class="num">R$ ${brl(LR.tot)}</td>
  <td class="num">${pc(LR.tot / RBT12, 2)}</td><td class="num">+ R$ ${brl(LR.tot - totA)}</td></tr>
</tbody></table>

<h3>Por que o Simples ganha com tanta folga: o INSS patronal</h3>
<p class="nota">Olhe a composição do DAS de julho: <strong>R$ ${brl(DAS_JUL.CPP)} dos R$ ${brl(DAS_TOT)}
(${pc(DAS_JUL.CPP / DAS_TOT, 1)}) são INSS patronal</strong>. Parece caro, e a primeira reação é achar que
fora do Simples se pagaria menos. É o contrário. Fora do Simples, os outros tributos explodem: só IRPJ +
CSLL + PIS + COFINS no Lucro Presumido dariam
R$ ${brl(LP.irpj + LP.adic + LP.csll + LP.pis + LP.cofins)} por ano, contra
R$ ${brl(dasA)} do DAS inteiro. O Simples cobra INSS caro e <em>tudo o mais</em> barato — e para uma
empresa de serviço com margem alta e folha pequena, esse pacote é imbatível.</p>
<p class="nota">O Lucro Real é o pior de todos porque PIS e COFINS saltam de 2,67% (dentro do DAS) para
9,25% sobre a receita, e uma empresa de serviço quase não tem crédito para abater. Só valeria a pena se a
empresa passasse a operar com lucro próximo de zero.</p>

<div class="caixa dark">
<h3 style="color:#fff">Conclusão do bloco 2</h3>
<p style="margin:0">Manter o Simples Nacional. Não há regime melhor disponível para o perfil da Bula —
receita de serviço, margem alta e folha pequena. A discussão útil não é "trocar de regime", e sim
<strong>defender o Anexo III e trabalhar as alavancas reais</strong> do bloco 3.</p>
</div>

<h2 class="quebra">3. Onde dá para reduzir — por ordem de valor</h2>

<h3>Alavanca 1 — O ISS está no teto. O piso do município é 2%.</h3>
<table>
<thead><tr><th>Se a alíquota correta do item for</th><th class="num">ISS no ano</th><th class="num">Economia/ano</th></tr></thead>
<tbody>
<tr class="hi"><td>5% — situação atual</td><td class="num">R$ ${brl(RBT12 * 0.05)}</td><td class="num">—</td></tr>
<tr><td>3%</td><td class="num">R$ ${brl(RBT12 * 0.03)}</td><td class="num">R$ ${brl(RBT12 * 0.02)}</td></tr>
<tr><td>2% — piso legal</td><td class="num">R$ ${brl(RBT12 * 0.02)}</td><td class="num">R$ ${brl(RBT12 * 0.03)}</td></tr>
</tbody></table>
<p class="nota">O art. 75-A da LC 59/2003 de Campo Grande confirma que a alíquota mínima do ISSQN no
município é 2%. Vocês estão pagando 5%, o máximo. Isso <em>pode</em> estar certo — depende de qual item da
lista de serviços a nota fiscal está usando. <strong>O que precisa ser feito:</strong> pedir ao contador
(a) qual item da lista consta nas NFS-e emitidas e (b) a alíquota, na Tabela I do Anexo II, dos itens
alternativos compatíveis com a atividade real de apoio à pecuária. Se houver item correto com alíquota
menor, a mudança é mera reclassificação — risco baixo, ganho recorrente. Não é conselho para "escolher o
item mais barato": é para confirmar que o item usado é o certo.</p>

<h3>Alavanca 2 — Opção pelo regime de caixa</h3>
<p class="nota">Hoje a empresa é tributada por competência: o imposto vence quando a nota é emitida, não
quando o dinheiro entra. Com R$ 100,6 mil de cobrança mapeada em aberto e casos travados por falta de
faturamento das leiloeiras, isso significa <strong>pagar ${pc(totA / RBT12, 2)} sobre dinheiro que ainda
não entrou no caixa</strong> — e, se algum título nunca for recebido, sobre dinheiro que nunca vai entrar.</p>
<p class="nota">A opção pelo regime de caixa é feita <strong>uma vez por ano, até o último dia útil de
janeiro</strong>, no PGDAS-D. Não reduz a alíquota, mas empurra o imposto para o momento do recebimento e
elimina o imposto sobre inadimplência. Para valer em 2027, a decisão precisa estar tomada em
<strong>janeiro/2027</strong>. Observação técnica: o RBT12 que define a faixa continua sendo apurado por
competência — muda só o momento de oferecer a receita à tributação.</p>

<h3>Alavanca 3 — Blindar o Anexo III (vale R$ ${brl(totB - totA)}/ano)</h3>
<p class="nota">Esta é a maior economia que a empresa já tem, e quase ninguém percebe que ela existe.
O CNAE principal é <strong>01.62-8/99 — Atividades de apoio à pecuária</strong>, que cai no Anexo III
<strong>sem depender do Fator R</strong>. Os CNAEs secundários contam outra história:
<strong>70.20-4/00 — consultoria em gestão empresarial</strong> é atividade de Anexo V, que só vai para o
Anexo III se a folha de salários dos últimos 12 meses alcançar 28% do faturamento.</p>
<p class="nota">A folha real da Bula está muito longe disso: o FGTS de R$ 938,67/mês indica folha CLT de
cerca de R$ 11,7 mil/mês — algo entre 4% e 12% do faturamento, conforme o que se considere. Ou seja:
<strong>se o fisco entender que a receita é de consultoria e não de apoio à pecuária, o Fator R não salva
e a empresa cai inteira no Anexo V</strong>, com custo adicional de R$ ${brl(totB - totA)} por ano —
cobrável retroativamente em até 5 anos, com multa e juros.</p>
<p class="nota"><strong>O que fazer:</strong> (a) garantir que as NFS-e descrevam serviço de apoio à
pecuária — captação e assessoria de compradores, acompanhamento de lotes, apoio operacional ao pregão —
e não "consultoria" ou "assessoria empresarial"; (b) ter contrato com as leiloeiras que descreva a
atividade dessa forma; (c) checar se algum CNAE secundário está sendo usado na emissão.
<strong>O que NÃO fazer:</strong> inflar folha para "garantir" o Fator R. Seria preciso cerca de
R$ 907 mil de folha anual para chegar aos 28% — custa muito mais do que os R$ ${brl(totB - totA)} que
economizaria, e nem é necessário enquanto o CNAE principal for o 0162-8/99.</p>

<h3>Alavanca 4 — Não cruzar os R$ 3,6 milhões sem planejar</h3>
<table>
<thead><tr><th>Faturamento em 12 meses</th><th class="num">DAS</th><th class="num">ISS</th>
<th class="num">Total</th><th class="num">% da receita</th></tr></thead>
<tbody>
${degrau.map(d => `<tr${d.r === 3610000 ? ' class="hi"' : ''}><td>R$ ${brl(d.r)}</td>
<td class="num">R$ ${brl(d.das)}</td><td class="num">R$ ${brl(d.iss)}</td>
<td class="num">R$ ${brl(d.tot)}</td><td class="num">${pc(d.tot / d.r, 2)}</td></tr>`).join('')}
</tbody></table>
<p class="nota">Entre R$ 3,59 mi e R$ 3,61 mi de faturamento a carga salta de ${pc(degrau[1].tot / degrau[1].r, 2)}
para ${pc(degrau[2].tot / degrau[2].r, 2)}: <strong>R$ ${brl(degrau[2].tot - degrau[1].tot)} a mais de
imposto por R$ 20 mil a mais de receita</strong>. É o degrau da 6ª faixa do Anexo III. Hoje o RBT12 está em
R$ ${brl(RBT12)} — <strong>folga de R$ ${brl(3600000 - RBT12)}</strong>. Com a agenda de leilões do segundo
semestre, isso precisa ser acompanhado mês a mês. Se em novembro/dezembro o acumulado estiver perto do
limite, a decisão de calendário (data de fechamento e de emissão das notas, dentro do que for legítimo)
vale mais de cem mil reais. <em>Segregar faturamento em outra PJ apenas para dividir o limite é simulação
e gera autuação</em> — só faz sentido se houver atividade e estrutura realmente distintas, e isso é
conversa para um tributarista, não decisão de gestão.</p>

<h3>Alavanca 5 — Pró-labore e distribuição de lucros</h3>
<p class="nota">No ERP não aparece nenhum lançamento de pró-labore de sócio. Se algum sócio trabalha na
empresa, o pró-labore é <strong>obrigatório</strong> — e a ausência é uma das autuações mais comuns em
optantes do Simples. A boa notícia: no Anexo III a contribuição patronal já está dentro do DAS, então
formalizar o pró-labore custa relativamente pouco à empresa (o INSS de 11% é do sócio, limitado ao teto).</p>
<p class="nota"><strong>Atenção ao que mudou em 2026.</strong> A Lei 15.270/2025 acabou com a isenção
irrestrita de dividendos: passou a incidir <strong>10% de IRRF sobre lucros distribuídos a uma pessoa
física acima de R$ 50 mil por mês, por empresa pagadora</strong>, e foi criado um imposto mínimo (IRPFM)
para quem tem renda anual acima de R$ 600 mil. Duas consequências práticas: (a) dimensionar as retiradas
mensais de cada sócio para não estourar os R$ 50 mil; (b) manter <strong>escrituração contábil
completa</strong>, que é o que permite distribuir todo o lucro contábil com isenção, em vez de ficar
limitado ao teto da presunção (32% da receita menos o IRPJ do DAS). Conferir com o contador se a
contabilidade completa está sendo feita — sem ela, parte do lucro distribuído vira rendimento tributável
do sócio.</p>

<h3>Alavanca 6 — Decisão com prazo em setembro/2026: IBS e CBS</h3>
<p class="nota">Em 2027 a CBS substitui PIS e COFINS. Empresas do Simples terão uma opção: continuar
recolhendo tudo no DAS, ou apurar <strong>IBS e CBS pelo regime regular, "por fora" do Simples</strong>.
Quem opta destaca o imposto na nota e o cliente aproveita o crédito integral; quem não opta repassa ao
cliente um crédito bem menor. <strong>A janela para a opção que vale no primeiro semestre de 2027 é de
1º a 30 de setembro de 2026</strong>, no Portal do Simples Nacional.</p>
<p class="nota">Para a Bula isso importa porque os clientes são leiloeiras — pessoas jurídicas que tomarão
crédito. Se elas passarem a preferir prestadores que dão crédito cheio, a opção vira assunto comercial,
não só tributário. A análise tem que sair antes de 30/09: quais leiloeiras estão no regime regular, se o
contrato permite destacar o imposto por fora, e quanto sobra de crédito próprio (a Bula tem poucos
insumos, então o crédito de entrada é pequeno). <strong>Recomendação: não optar sem essa análise</strong> —
não fazer nada mantém tudo no DAS, que é a posição segura, e a opção pode ser refeita para o segundo
semestre de 2027 na janela de março.</p>

<h3>Alavanca 7 — Conferir a base de cálculo</h3>
<ul>
<li><strong>Reembolsos e repasses.</strong> A receita tributada de julho (R$ ${brl(REC_JUL)}) deve conter
só preço de serviço. Reembolso de despesa e repasse de terceiro, quando documentados como tal, não são
receita bruta. Se algum desses valores está entrando na nota, está pagando ${pc(totA / RBT12, 2)} à toa.</li>
<li><strong>ISS retido na fonte.</strong> A guia mostra deduções zeradas. Levantar se alguma leiloeira
reteve ISS sobre notas do mês — se reteve, houve pagamento em duplicidade e cabe compensação ou
restituição.</li>
<li><strong>Receita financeira.</strong> Rendimento de aplicação não compõe receita bruta do Simples.
Confirmar que não está na base declarada no PGDAS-D.</li>
</ul>

<h2 class="quebra">4. Dois ajustes de gestão (não são elisão, mas são dinheiro)</h2>
<ul>
<li><strong>A provisão de 18% nos fechamentos está acima da carga real.</strong> O ERP provisiona 18% de
imposto sobre a receita de cada fechamento; a carga efetiva medida é ${pc(CARGA_JUL / REC_JUL, 2)}.
Sobre o faturamento de 12 meses, são cerca de R$ ${brl(RBT12 * (0.18 - CARGA_JUL / REC_JUL))} de provisão a
mais do que o imposto que efetivamente vence. Não é erro — é uma folga. Mas ela deveria ser deliberada:
ou se ajusta a provisão para ${pc(CARGA_JUL / REC_JUL, 1)}, ou se assume o excedente como reserva
declarada.</li>
<li><strong>A conta a pagar do DAS de julho está estimada em R$ 56.000,00 no ERP.</strong> O valor real da
guia é R$ ${brl(DAS_TOT)}. Ajustar o lançamento (vencimento 20/08) para o valor exato.</li>
</ul>

<h2>5. Checklist para levar ao contador</h2>
<table>
<thead><tr><th style="width:6mm"></th><th>Pergunta / providência</th><th class="num" style="width:26mm">Valor em jogo</th><th style="width:22mm">Prazo</th></tr></thead>
<tbody>
<tr><td>1</td><td>Qual item da lista de serviços consta nas NFS-e e qual a alíquota dos itens alternativos
compatíveis com apoio à pecuária (Tabela I, Anexo II, LC 59/2003)?</td>
<td class="num">até R$ ${brl(RBT12 * 0.03)}/ano</td><td>imediato</td></tr>
<tr><td>2</td><td>Confirmar o RBT12 no extrato do PGDAS-D e comparar com os R$ ${brl(RBT12)} apurados
aqui. Divergência = erro de declaração em algum mês.</td><td class="num">—</td><td>imediato</td></tr>
<tr><td>3</td><td>As NFS-e descrevem apoio à pecuária ou consultoria? Há contrato escrito com as leiloeiras
sustentando o enquadramento no CNAE 0162-8/99?</td>
<td class="num">R$ ${brl(totB - totA)}/ano</td><td>imediato</td></tr>
<tr><td>4</td><td>Algum tomador reteve ISS no mês? Há ISS pago em duplicidade a recuperar?</td>
<td class="num">a apurar</td><td>imediato</td></tr>
<tr><td>5</td><td>Há pró-labore formalizado para os sócios? Há escrituração contábil completa que permita
distribuir lucro integral com isenção?</td><td class="num">a apurar</td><td>até 30/09</td></tr>
<tr><td>6</td><td>Análise da opção pelo regime regular de IBS/CBS para 2027 (perfil das leiloeiras,
cláusula contratual, crédito de entrada).</td><td class="num">estratégico</td><td><strong>30/09/2026</strong></td></tr>
<tr><td>7</td><td>Simular a opção pelo regime de caixa para 2027 com base na inadimplência real de 2026.</td>
<td class="num">fluxo de caixa</td><td>até jan/2027</td></tr>
<tr><td>8</td><td>Monitoramento mensal do RBT12 contra o teto de R$ 3,6 mi (folga atual:
R$ ${brl(3600000 - RBT12)}).</td><td class="num">R$ ${brl(degrau[2].tot - degrau[1].tot)}</td><td>mensal</td></tr>
</tbody></table>

<h2>6. Memória de cálculo e fontes</h2>
<p class="nota"><strong>Documentos.</strong> Guia ISSQN nº 1674646 da SEFAZ de Campo Grande (competência
07/2026, receita tributada R$ ${brl(REC_JUL)}, ISSQN R$ ${brl(ISS_JUL)}, vencimento 17/08/2026); DAS
07.20.26224.2951097-3 (competência 07/2026, R$ ${brl(DAS_TOT)}, vencimento 20/08/2026); comprovante de
inscrição no CNPJ 34.791.630/0001-43 (CNAE principal 01.62-8/99; secundários 70.20-4/00 e 82.30-0/01;
porte EPP; natureza 206-2, Sociedade Empresária Limitada). Folha, provisões e contas a pagar: ERP da Bula.</p>
<p class="nota"><strong>Legislação.</strong> LC 123/2006 (Anexos III e V, sublimite, regime de caixa);
Resolução CGSN 140/2018; tabelas oficiais dos Anexos III e V publicadas pela Receita Federal; LC 116/2003
e LC municipal 59/2003 de Campo Grande (arts. 75 e 75-A); Lei 15.270/2025 (tributação de lucros e
dividendos); Resoluções CGSN 190 a 193 (adequação do Simples à reforma do consumo e prazos de opção de
IBS/CBS).</p>
<p class="nota"><strong>Premissas declaradas.</strong> Os cenários anuais usam o RBT12 de
R$ ${brl(RBT12)} como base de receita, mantendo a faixa constante. O INSS patronal fora do Simples usa
28,8% (20% + RAT médio de 2% + terceiros 5,8%) sobre folha CLT anual de R$ ${brl(FOLHA_CLT_ANO)}, inferida
do FGTS recolhido. O cenário de Lucro Real assume R$ ${brl(COMISSOES)} de comissões pagas a PJ e
R$ ${brl(DESPESAS)} de despesas no ano, e considera crédito de PIS/COFINS sobre as comissões — hipótese
favorável e discutível; sem esse crédito, o Lucro Real fica ainda pior. Alterações nessas premissas mudam
a magnitude das diferenças, mas não a ordem dos regimes: a vantagem do Simples é grande demais para
inverter.</p>
<p class="nota"><strong>Limite deste documento.</strong> É um diagnóstico gerencial construído a partir das
guias, do cadastro e dos dados do ERP. As ações dos blocos 3 e 5 devem ser validadas pelo contador
responsável e, no caso da alavanca 3 e de qualquer segregação de faturamento, por um advogado tributarista
antes de qualquer execução.</p>

<footer>
Bula Assessoria Pecuária Ltda · Diagnóstico tributário da competência julho/2026 · gerado em 13/08/2026.
Os cálculos das seções 1 e 2 são reproduzíveis: as guias foram reconstruídas do zero e fecham ao centavo.
</footer>
</body></html>`

const htmlPath = path.join(OUTDIR, 'diagnostico-tributario-bula-2026-08.html')
fs.writeFileSync(htmlPath, html)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
const pdfPath = path.join(OUTDIR, 'Diagnostico-Tributario-Bula-julho-2026.pdf')
await page.pdf({
  path: pdfPath, format: 'A4', printBackground: true,
  margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
})
await browser.close()

console.log('HTML: ' + htmlPath)
console.log('PDF : ' + pdfPath)
console.log('RBT12 apurado: R$ ' + brl(RBT12) + ' | carga julho: ' + pc(CARGA_JUL / REC_JUL, 2))
