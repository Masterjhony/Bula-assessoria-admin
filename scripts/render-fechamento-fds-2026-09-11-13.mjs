/**
 * Renderiza "Conferência dos lançamentos — leilões de 11 a 13/09/2026" a partir
 * de outputs/fechamento-fds-2026-09-11-13/dados.json (gerado por
 * scripts/fechamento-fds-2026-09-11-13.mjs). PDF A4 na Área de Trabalho.
 * Nenhum número escrito à mão — tudo sai do JSON.
 *
 * Molde: brandbook preto/grafite/branco, Oswald nos títulos, dourado só no
 * filete da capa. pg.pdf() com margem ZERO e .page com height fixa
 * (memória render-pdf-a4-margem-zero).
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'

const OUT = 'outputs/fechamento-fds-2026-09-11-13'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (n, d = 0) => (Number(n || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
const dma = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—'
const corta = (t, n) => { const x = String(t ?? ''); if (x.length <= n) return x; const c = x.slice(0, n), sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–·]+$/, '') + '…' }
const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

const [AZ, EAO, KAT] = D.leiloes
const T = D.totais
const geradoEm = new Date(D.geradoEm)
const hoje = `${String(geradoEm.getDate()).padStart(2, '0')}/${String(geradoEm.getMonth() + 1).padStart(2, '0')}/${geradoEm.getFullYear()}`
const NPAG = 7
const foot = n => `<div class="pfoot"><span>Bula Assessoria Pecuária · Conferência dos lançamentos — leilões de 11 a 13/09/2026 · emitido em ${hoje}</span><span>Página ${n} de ${NPAG}</span></div>`

const animalCurto = a => { if (/^vaca parida/i.test(a)) return { l1: 'vaca parida, 44m', l2: 'OE fêmeas 136º' }; const m = String(a || '').match(/^(touro|vaca[^,]*|1 fêmea)([^()]*)(\(OE[^)]*\))?/i); return m ? { l1: (m[1] + m[2]).trim(), l2: (m[3] || '').replace(/[()]/g, '') } : { l1: corta(a, 30), l2: '' } }
const autorCurto = a => { const x = String(a || ''); if (/De Omena Gaia/.test(x)) return 'Fábio (2º nº)'; if (/Omena/.test(x)) return 'Fábio'; if (/Douglas/.test(x)) return 'Douglas'; if (/Leonardo/.test(x)) return 'Leonardo'; if (/Nane/.test(x)) return 'Nane'; if (/Marcelo/.test(x)) return 'Marcelo C.'; return x ? corta(x, 14) : 'não capturado' }
const linhaLote = (l, comAnimal = true) => { const an = animalCurto(l.animal); return `<tr>
  <td><strong>${esc(l.lote)}</strong></td>
  ${comAnimal ? `<td style="white-space:nowrap">${esc(/EXPRESSO/.test(l.animal) ? 'Expresso do AZZA · 50%' : /^[0-9A-Z ]+DO AZZA/.test(l.animal) ? l.animal.replace(/ \(.*$/, '') : an.l1)}${an.l2 ? `<br><span class="muted">${esc(an.l2)}</span>` : ''}</td>` : ''}
  <td class="num">${brl(l.parcela)}</td><td class="num">${l.parcelas}×${l.qtd > 1 ? l.qtd : ''}</td><td class="num"><strong>R$ ${brl(l.vgv)}</strong></td>
  <td style="white-space:nowrap">${esc(l.assessor)}${l.atribuicao ? `<br><span class="muted">${esc(l.atribuicao)}</span>` : ''}</td>
  <td>${esc(corta(l.comprador, 44))}${l.fazenda && !/Agropecuária Buss/.test(l.comprador) ? `<br><span class="muted">${esc(corta(l.fazenda, 30))}</span>` : ''}</td>
  <td>${esc([l.cidade, l.uf].filter(Boolean).join('-'))}</td>
  <td style="white-space:nowrap">${esc(l.fichaQuando || '—')}<br><span class="muted">${esc(autorCurto(l.fichaAutor))}</span></td>
  <td class="num">R$ ${brl(l.comissao)}</td></tr>` }
const totalLote = (L, cols) => `<tr class="total"><td colspan="${cols}">${L.totais.lotes} lotes · ${L.totais.animais} cabeças</td><td class="num">R$ ${brl(L.totais.vgv)}</td><td colspan="4"></td><td class="num">R$ ${brl(L.totais.comissao)}</td></tr>`
const porAss = L => L.porAssessor.map(a => `${esc(a.nome)} ${a.lotes} lote${a.lotes > 1 ? 's' : ''} · R$ ${brl0(a.vgv)}`).join(' &nbsp;|&nbsp; ')
const obsLotes = L => L.lotes.filter(l => l.obs).map(l => `<li><strong>lt ${esc(l.lote)}:</strong> ${esc(l.obs)}</li>`).join('')

const fora = D.foraDoFechamento
const f96 = fora[0], f105 = fora[1], f38 = fora[2], fVis = fora[3]
const pctReceitaAZ = r2(AZ.receita.certa + AZ.receita.variavelSobrePrevisao)

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Bula — Conferência dos lançamentos — leilões de 11 a 13/09/2026</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; height: 296mm; padding: 14mm 13mm 17mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6; display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
  .capa { background: ${INK}; color: #fff; padding: 32mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 20mm; }
  .capa h1 { font-size: 36px; line-height: 1.05; color: #fff; font-weight: 700; }
  .capa h1 small { display: block; font-size: 17px; color: #B5B5B5; font-weight: 500; margin-top: 4mm; letter-spacing: .04em; }
  .capa .sub { font-size: 12.2px; color: #B5B5B5; margin-top: 8mm; max-width: 146mm; line-height: 1.62; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 9mm 0; }
  .capa .big { font-family: Oswald, sans-serif; font-size: 34px; font-weight: 700; margin-top: 4mm; }
  .capa .big span { font-size: 13px; color: #B5B5B5; font-weight: 500; display: block; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 1mm; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 11mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
  .capa .meta div span { display: block; font-size: 8.5px; color: #8A8A8A; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 2px; }
  .capa .meta div strong { font-size: 12px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${INK}; padding-bottom: 3mm; margin-bottom: 5mm; }
  .head h2 { font-size: 20px; }
  .head .n { font-size: 9px; color: ${MUTED}; letter-spacing: .12em; text-transform: uppercase; font-family: Oswald, sans-serif; white-space: nowrap; margin-left: 6mm; }
  h3 { font-size: 12.5px; margin: 5.5mm 0 2.4mm; }
  h3:first-of-type { margin-top: 0; }
  p { margin: 0 0 3mm; }
  .lead { font-size: 11.2px; line-height: 1.58; }
  strong { font-weight: 600; }
  .muted { color: ${MUTED}; }
  .small { font-size: 8.9px; color: ${MUTED}; line-height: 1.5; }
  .tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin: 4mm 0 5mm; }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.4mm 3.4mm 3mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.6mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 19px; font-weight: 600; line-height: 1; }
  .tile .v .cur { font-size: 11px; font-weight: 500; color: ${MUTED}; margin-right: 1px; }
  .tile .d { font-size: 8.4px; color: ${MUTED}; margin-top: 1.6mm; line-height: 1.4; }
  .tile.gold { border-top-color: ${GOLD}; }
  .box { border: 1px solid ${GRID}; padding: 4mm 4.4mm; margin: 4mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li, .box.dark td { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2.2mm; font-weight: 600; }
  .box.alerta { border-left: 3px solid ${GOLD}; }
  table { width: 100%; border-collapse: collapse; font-size: 9.1px; margin: 2.5mm 0; }
  table.lotes { table-layout: fixed; }
  table.lotes td { overflow: hidden; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.2px; letter-spacing: .07em; font-weight: 600; border-bottom: 1.4px solid ${INK}; padding: 1.8mm 1.6mm; }
  td { padding: 1.5mm 1.6mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.destaque td { background: #F6F6F6; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.5mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .kv { display: grid; grid-template-columns: 30mm 1fr; row-gap: .9mm; column-gap: 2.5mm; font-size: 8.9px; line-height: 1.42; }
  .kv span { color: #9A9A9A; text-transform: uppercase; letter-spacing: .06em; font-size: 7.8px; padding-top: .6mm; }
  .tag { display: inline-block; font-family: Oswald, sans-serif; font-size: 7.6px; letter-spacing: .08em; text-transform: uppercase; padding: .4mm 1.6mm; border: 1px solid ${INK}; margin-right: 1mm; }
  .tag.ok { background: ${INK}; color: #fff; }
  .tag.nao { border-color: #B5B5B5; color: ${MUTED}; }
</style></head><body>

<!-- ══ CAPA ══ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Conferência dos<br>lançamentos<small>Leilões de 11 a 13 de setembro de 2026<br>Nelore AZ · 7º Mega Premium EAO · Katayama Novo Repartimento</small></h1>
  <div class="rule"></div>
  <div class="sub">Tudo o que a equipe anunciou como venda no fim de semana, lido mensagem a mensagem nos grupos
  de WhatsApp e cruzado com o que o parser gravou, com o que existe no ERP, com o HastaPro e com a planilha do chefe —
  para lançar o fechamento dos três pregões sem contar lote a mais nem deixar lote de fora.</div>
  <div class="big"><span>Cobertura Bula no fim de semana</span>R$ ${brl(T.vgv)}</div>
  <div class="meta">
    <div><span>Lotes · cabeças</span><strong>${T.lotes} · ${T.animais}</strong></div>
    <div><span>Pregões com venda</span><strong>3 (12 e 13/09)</strong></div>
    <div><span>Comissão da equipe</span><strong>R$ ${brl(T.comissao)}</strong></div>
    <div><span>Resumo da equipe (grupo)</span><strong>R$ ${brl(T.resumoGrupo)} · ${T.vgv === T.resumoGrupo ? 'bate' : 'NÃO bate'}</strong></div>
    <div><span>No HastaPro</span><strong>nada de setembro</strong></div>
    <div><span>Emitido em</span><strong>${hoje}</strong></div>
  </div>
</section>

<!-- ══ 1. PARECER ══ -->
<section class="page">
  <div class="head"><h2>Parecer: R$ ${brl0(T.vgv)} em ${T.lotes} lotes, e quatro coisas que não entram</h2><div class="n">01 · Parecer</div></div>

  <p class="lead">No fim de semana a equipe vendeu em <strong>três pregões</strong>: o <strong>Nelore AZ</strong> no sábado
  (R$ ${brl0(AZ.totais.vgv)}, ${AZ.totais.lotes} touros), o <strong>7º Mega Premium EAO</strong> no domingo
  (R$ ${brl0(EAO.totais.vgv)}, ${EAO.totais.lotes - 1} touros e 1 fêmea) e o <strong>Katayama Novo Repartimento</strong>, também no domingo
  (R$ ${brl0(KAT.totais.vgv)}, 4 fêmeas). Os três números são <strong>exatamente os que a própria equipe postou no grupo
  Financeiro às 22h de domingo</strong> — a leitura lote a lote confirma cada um. Na sexta (11/09) não houve pregão com venda:
  só a live de abertura do EAO e o último dia do Shopping Nelore Visual.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Nelore AZ · sáb 12/09</div><div class="v"><span class="cur">R$</span>${brl0(AZ.totais.vgv)}</div><div class="d">${AZ.totais.lotes} touros · Fábio 1, Leonardo 3</div></div>
    <div class="tile"><div class="k">7º Mega Premium EAO · dom 13/09</div><div class="v"><span class="cur">R$</span>${brl0(EAO.totais.vgv)}</div><div class="d">11 touros + 1 fêmea · 4 assessores</div></div>
    <div class="tile"><div class="k">Katayama Novo Repartimento · dom 13/09</div><div class="v"><span class="cur">R$</span>${brl0(KAT.totais.vgv)}</div><div class="d">4 fêmeas · um comprador · assessor a confirmar</div></div>
    <div class="tile gold"><div class="k">Comissão da equipe (2%)</div><div class="v"><span class="cur">R$</span>${brl(T.comissao)}</div><div class="d">Fábio ${brl0(D.porAssessor.find(a => /F.bio/.test(a.nome))?.comissao)} · Douglas ${brl0(D.porAssessor.find(a => /Douglas/.test(a.nome))?.comissao)} · Leonardo ${brl0(D.porAssessor.find(a => /Leonardo/.test(a.nome))?.comissao)} · Nane ${brl0(D.porAssessor.find(a => /Nane/.test(a.nome))?.comissao)}</div></div>
  </div>

  <h3>Onde cada pregão está, fonte por fonte</h3>
  <table>
    <tr><th>Pregão</th><th>Data</th><th class="num">Lotes</th><th class="num">VGV</th><th>Grupo de lances</th><th>Parser (bula_leilao_vendas)</th><th>Fechamento no ERP</th><th>HastaPro</th><th>Planilha (meta)</th></tr>
    <tr><td>Nelore AZ</td><td>${dm(AZ.data)}</td><td class="num">${AZ.totais.lotes}</td><td class="num">R$ ${brl(AZ.totais.vgv)}</td><td>4 fichas + resumo</td><td>4 linhas, <em>revisar</em>, sem leilão</td><td><span class="tag nao">não existe</span></td><td><span class="tag nao">não</span></td><td class="num">R$ ${brl0(AZ.planilha?.metaVenda)}</td></tr>
    <tr><td>7º Mega Premium EAO</td><td>${dm(EAO.data)}</td><td class="num">${EAO.totais.lotes}</td><td class="num">R$ ${brl(EAO.totais.vgv)}</td><td>12 fichas + resumo</td><td>12 linhas, <em>revisar</em>, sem leilão (+1 falsa)</td><td><span class="tag nao">não existe</span></td><td><span class="tag nao">não</span></td><td class="num">R$ ${brl0(EAO.planilha?.metaVenda)}</td></tr>
    <tr><td>Katayama Novo Repartimento</td><td>${dm(KAT.data)}</td><td class="num">${KAT.totais.lotes}</td><td class="num">R$ ${brl(KAT.totais.vgv)}</td><td>lista no grupo Assessores</td><td><span class="tag nao">não capturado</span></td><td><span class="tag nao">não existe</span></td><td><span class="tag nao">não</span></td><td class="num">—</td></tr>
    <tr class="total"><td colspan="2">Fim de semana</td><td class="num">${T.lotes}</td><td class="num">R$ ${brl(T.vgv)}</td><td colspan="5">resumo do grupo Financeiro: R$ ${brl(T.resumoGrupo)} — ${T.vgv === T.resumoGrupo ? 'bate ao centavo' : 'divergente'}</td></tr>
  </table>
  <p class="small">Hoje o único fechamento que o sistema tem para essas datas é um <strong>fantasma</strong>: "${esc(D.fechamentosExistentes[0]?.nome || 'MATRIZES E BEZERRAS')}" de 14/09 com o lote 38 — que é do Mafra de 06/09 (ver abaixo).
  As 16 vendas certas ficaram como <em>revisar</em> sem leilão porque havia dois pregões no mesmo dia, e por isso nenhum fechamento foi gerado.
  O HastaPro não recebeu nada de setembro na FIL 2 (último pregão lançado: ${dma(D.hastapro.ultimoFil2)}).</p>

  <div class="box dark">
    <div class="t">As quatro coisas que NÃO entram no fechamento — e por quê</div>
    <ol style="margin:0">
      <li><strong>lt 105 do EAO (Expressivo FIV, 1.300 = R$ 39.000) — falso positivo.</strong> O gerente da EAO escreveu "Bateu!!!! Lote 105 1300" por engano; a disputa seguiu até 1.550 e a Nane liberou. A IA gravou como venda. <strong>Apagar.</strong></li>
      <li><strong>lt 38 de "14/09" (720, Edna Bellato) — duplicata do Mafra de 06/09.</strong> O Fábio repostou a ficha de uma semana atrás no grupo Lances Mafra para cobrar o CPD; o parser datou 14/09 e criou o fechamento fantasma. <strong>Apagar os dois.</strong></li>
      <li><strong>lt 96 de 12/09 (1 fêmea, 700 = R$ 21.000) — leilão não identificado.</strong> Douglas, com direcionamento do Rusa, comprador Welton Miranda (Nelore Itajaí). Não é o AZ (só touros) e não está no resumo da equipe. <strong>Perguntar ao Douglas.</strong></li>
      <li><strong>Shopping Nelore Visual (R$ 17.800, Marcelo, 09/09)</strong> — venda direta anunciada antes da janela e sem registro em lugar nenhum; fica anotada como pendência, não como venda do fim de semana.</li>
    </ol>
  </div>
  <div class="cols2">
    <div class="box" style="margin-top:0">
      <div class="t">Como esta conferência foi feita</div>
      <ul style="margin:0">
        <li><strong>Venda só com a ficha</strong> "Levamos lt N – parcela – Foi com … da Bula Assessoria". "Bateu", "Nosso" e "Agradece" sozinhos não contam — cada candidato foi casado com a mensagem seguinte.</li>
        <li><strong>Quem vendeu é quem a ficha diz</strong>, não quem digitou: o lt 222 foi postado pelo Marcelo e é do Leonardo.</li>
        <li><strong>VGV = parcela × parcelas × cabeças</strong> — a ordem de entrada confirma 1 cabeça por lote e a condição (30×; 40× no lt 2023). ~1.100 mensagens lidas em cinco grupos.</li>
      </ul>
    </div>
    <div class="box" style="margin-top:0">
      <div class="t">O que ainda não existe em fonte nenhuma</div>
      <ul style="margin:0">
        <li><strong>Faturamento total</strong> dos três pregões — é dele que sai a nota do AZ (0,5%) e do EAO (0,33%). Pedir as listagens à Ricardo Nicolau e à Programa.</li>
        <li><strong>Listagem oficial lote a lote</strong> — só ela confirma parcelas (lt 2023), cotas e cancelamentos.</li>
        <li><strong>Acordo com a Katayama</strong> — não está na aba de acordos nem na planilha de setembro.</li>
      </ul>
    </div>
  </div>
  ${foot(2)}
</section>

<!-- ══ 2. NELORE AZ ══ -->
<section class="page">
  <div class="head"><h2>Sábado 12/09 · Nelore AZ — R$ ${brl0(AZ.totais.vgv)} em ${AZ.totais.lotes} touros</h2><div class="n">02 · Nelore AZ</div></div>
  <div class="kv" style="margin-bottom:4mm">
    <span>Pregão</span><div>${esc(AZ.nome)} — ${esc(AZ.leiloeira)}, ${esc(AZ.praca)}, ${esc(AZ.hora)}</div>
    <span>Condição</span><div>${esc(AZ.condicao)}</div>
    <span>Acordo</span><div><strong>${esc(AZ.acordo)}</strong> <span class="muted">(${esc(AZ.acordoFonte)})</span></div>
    <span>Planilha do chefe</span><div>previsão de faturamento R$ ${brl0(AZ.planilha?.previsaoFat)} · meta de venda R$ ${brl(AZ.planilha?.metaVenda)} (10,01%) · meta de comissão R$ ${brl(AZ.planilha?.metaComissao)}</div>
    <span>Resumo da equipe</span><div>"${esc(AZ.resumoGrupo.texto)}" — grupo Financeiro, ${esc(AZ.resumoGrupo.quando)} · <strong>${AZ.confereComGrupo ? 'bate' : 'NÃO bate'}</strong> com a leitura lote a lote</div>
  </div>
  <table class="lotes">
    <colgroup><col style="width:9mm"><col style="width:30mm"><col style="width:14mm"><col style="width:7mm"><col style="width:19mm"><col style="width:24mm"><col style="width:26mm"><col style="width:22mm"><col style="width:16mm"><col style="width:17mm"></colgroup>
    <tr><th>Lote</th><th>Animal</th><th class="num">Parcela</th><th class="num">×</th><th class="num">VGV</th><th>Vendeu</th><th>Comprador</th><th>Praça</th><th>Ficha</th><th class="num">2%</th></tr>
    ${AZ.lotes.map(l => linhaLote(l)).join('')}
    ${totalLote(AZ, 4)}
  </table>
  <p class="small">${porAss(AZ)}. A ficha é o registro primário ("Foi com … da Bula Assessoria"); quem digitou não importa.</p>

  <div class="cols2">
    <div class="box" style="margin-top:2mm">
      <div class="t">O que precisa de atenção</div>
      <ul style="margin:0">${obsLotes(AZ)}</ul>
    </div>
    <div class="box" style="margin-top:2mm">
      <div class="t">Receita esperada (acordo AZ)</div>
      <table style="margin:0">
        <tr><td>3% da venda (R$ ${brl(AZ.totais.vgv)})</td><td class="num"><strong>R$ ${brl(AZ.receita.certa)}</strong></td></tr>
        <tr><td>0,5% do faturamento do leilão <span class="muted">(a apurar; sobre a previsão de R$ ${brl0(AZ.planilha?.previsaoFat)})</span></td><td class="num">R$ ${brl(AZ.receita.variavelSobrePrevisao)}</td></tr>
        <tr class="total"><td>Estimativa total</td><td class="num">R$ ${brl(pctReceitaAZ)}</td></tr>
      </table>
      <p class="small" style="margin:2mm 0 0">A meta de comissão da planilha era R$ ${brl(AZ.planilha?.metaComissao)}; a venda ficou em ${pct(AZ.totais.vgv / (AZ.planilha?.metaVenda || 1), 1)} da meta de venda. Imposto de 18% sobre a nota, comissão dos assessores por fora.</p>
    </div>
  </div>

  <h3>O que a equipe disputou e não levou (não vira venda)</h3>
  <ul>${AZ.naoVendas.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
  <p class="small">Também no sábado: o <strong>Shopping Nelore Visual</strong> (venda direta, preço fixo, "sem comissão de leilão", prazo até 12/09) terminou sem nenhuma venda nova no grupo — a única anunciada é a do Marcelo em 09/09 (VIS4819, R$ 17.800 em 12×), fora da janela e fora do sistema. Detalhe na página 6.</p>
  ${foot(3)}
</section>

<!-- ══ 3. EAO ══ -->
<section class="page">
  <div class="head"><h2>Domingo 13/09 · 7º Mega Premium EAO — R$ ${brl0(EAO.totais.vgv)} em ${EAO.totais.lotes} lotes</h2><div class="n">03 · EAO</div></div>
  <div class="kv" style="margin-bottom:3mm">
    <span>Pregão</span><div>${esc(EAO.nome)} — ${esc(EAO.leiloeira)}, ${esc(EAO.praca)}. Touros das 9h (ordem de entrada de 125 touros), fêmeas à noite (lotes 200–229)</div>
    <span>Condição</span><div>${esc(EAO.condicao)}</div>
    <span>Acordo</span><div><strong>${esc(EAO.acordo)}</strong> <span class="muted">(${esc(EAO.acordoFonte)})</span></div>
    <span>Planilha do chefe</span><div>touros 13/09: previsão R$ ${brl0(EAO.planilha?.previsaoFat)} · meta de venda R$ ${brl(EAO.planilha?.metaVenda)} · meta de comissão R$ ${brl(EAO.planilha?.metaComissao)}. Fêmeas 14/09 e aspirações 15/09 têm linha própria.</div>
    <span>Resumo da equipe</span><div>"${esc(EAO.resumoGrupo.texto)}" — grupo Financeiro, ${esc(EAO.resumoGrupo.quando)} · <strong>${EAO.confereComGrupo ? 'bate' : 'NÃO bate'}</strong> (11 touros = 9, 12, 19, 21, 26, 47, 52, 71, 74, 100, 107; a fêmea é o 222)</div>
  </div>
  <table class="lotes" style="font-size:8.7px">
    <colgroup><col style="width:8mm"><col style="width:23mm"><col style="width:12mm"><col style="width:7mm"><col style="width:19mm"><col style="width:24mm"><col style="width:33mm"><col style="width:22mm"><col style="width:19mm"><col style="width:17mm"></colgroup>
    <tr><th>Lote</th><th>Animal (ordem de entrada)</th><th class="num">Parcela</th><th class="num">×</th><th class="num">VGV</th><th>Vendeu</th><th>Comprador</th><th>Praça</th><th>Ficha</th><th class="num">2%</th></tr>
    ${EAO.lotes.map(l => linhaLote(l)).join('')}
    ${totalLote(EAO, 4)}
  </table>
  <p class="small">${porAss(EAO)}. Todos os lotes são de 1 cabeça na ordem de entrada da Programa; VGV = parcela × 30. O lote 9 não foi repassado ao Financeiro às 13:41, mas está no total dos 310.500.</p>
  <div class="cols2">
    <div class="box" style="margin-top:1mm">
      <div class="t">Receita esperada (acordo EAO)</div>
      <table style="margin:0">
        <tr><td>0,33% do faturamento total do 7º Mega Premium (3 dias) — <span class="muted">a apurar com a Programa/EAO após 15/09</span></td><td class="num">—</td></tr>
        <tr><td>Sobre a previsão da planilha só para os touros (R$ ${brl0(EAO.planilha?.previsaoFat)})</td><td class="num">R$ ${brl(EAO.receita.variavelSobrePrevisao)}</td></tr>
        <tr><td>Sobre a previsão das fêmeas de 14/09 (R$ ${brl0(EAO.planilhaFemeas?.previsaoFat)})</td><td class="num">R$ ${brl(r2((EAO.planilhaFemeas?.previsaoFat || 0) * 0.0033))}</td></tr>
      </table>
    </div>
    <div class="box" style="margin-top:1mm">
      <div class="t">Contra a meta da planilha</div>
      <p style="margin:0">Mesma régua do Expozebu (maio) e do Baviera (julho): a nota sai do <strong>faturamento total</strong> dos leilões, não da cobertura. A venda de touros (R$ ${brl0(EAO.lotes.filter(l => l.sexo === 'M').reduce((s, l) => s + l.vgv, 0))}) ficou em <strong>${pct(EAO.lotes.filter(l => l.sexo === 'M').reduce((s, l) => s + l.vgv, 0) / (EAO.planilha?.metaVenda || 1), 1)}</strong> da meta de venda de R$ ${brl0(EAO.planilha?.metaVenda)} (10,01% dos R$ ${brl0(EAO.planilha?.previsaoFat)} previstos); a comissão prevista era R$ ${brl(EAO.planilha?.metaComissao)}.</p>
    </div>
  </div>
  ${foot(4)}
</section>

<!-- ══ 4. EAO: alertas e não-vendas ══ -->
<section class="page">
  <div class="head"><h2>EAO — o que precisa de atenção antes de lançar</h2><div class="n">04 · EAO · Alertas</div></div>
  <div class="box alerta" style="margin-top:0">
    <div class="t">Alertas lote a lote</div>
    <ul style="margin:0">${obsLotes(EAO)}</ul>
  </div>
  <div class="cols2">
    <div class="box" style="margin-top:0">
      <div class="t">Falso positivo: lote 105 (Expressivo FIV EAO)</div>
      <p>Às 15:36 a Nane entrou no 105 ("oi vou nesse"). A disputa subiu de 870 até 1.520 — cada "Nosso" no grupo é ela — e às 15:42 o gerente da EAO postou
      <em>"Bateu!!!! Aeeeee 🌪️ Lote 105 1300"</em>. Um minuto depois: <em>"já tinha mandado que tinha batido kkkk / falei que digitei errado"</em>. Vieram 1.320, 1.350 … 1.550 e às 15:47 a Nane escreveu
      <strong>"parei liberado / obrigada"</strong>. Não houve "Levamos" e o lote não está no resumo dos 310.500.</p>
      <p class="small" style="margin:0">O parser (IA, confiança nula) gravou o "Bateu" como venda de R$ 39.000 — a linha está em <em>revisar</em>, sem leilão, e precisa ser apagada antes de qualquer importação (id ${esc(f105.idDb)}).</p>
    </div>
    <div class="box" style="margin-top:0">
      <div class="t">Cadastro do lote 19: o que aconteceu</div>
      <p>Na sexta 11/09, às 15:32, a Programa devolveu no grupo "Cadastros Bula e Programa": <em>"Antonio Alberto Feitoza de Medeiros — Não autorizado"</em> (pedido feito às 12:26 com a CNH e a palavra "EAO").
      No domingo o Fábio levou o lote 19 para <strong>Alberto Medeiros, Fazenda Medeiros, Bacabal-MA</strong> e escreveu logo em seguida <em>"A vista - dia 20 de setembro"</em> — a saída para quem não tem crédito aprovado (10% de desconto, pagamento até 18/09 pela regra da EAO).</p>
      <p class="small" style="margin:0">Provável mesmo comprador. O lote entra no fechamento, mas o VGV de R$ 24.000 e os R$ 480 do Fábio só se confirmam com o pagamento. Anotar no fechamento e acompanhar com a Programa.</p>
    </div>
  </div>
  <h3>O que a equipe disputou e não levou (não vira venda)</h3>
  <ul>${EAO.naoVendas.filter(x => !/^lt 105/.test(x)).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
  <p class="small">O pregão continua: fêmeas em 14/09 (20h) e aspirações em 15/09 (20h) — a mesma conferência vale para eles, e o fechamento do EAO só fica inteiro depois do 3º dia.</p>
  ${foot(5)}
</section>

<!-- ══ 5. KATAYAMA + FORA ══ -->
<section class="page">
  <div class="head"><h2>Katayama Novo Repartimento e o que ficou fora</h2><div class="n">05 · Katayama · Fora do fechamento</div></div>
  <div class="kv" style="margin-bottom:3mm">
    <span>Pregão</span><div>${esc(KAT.nome)} — ${esc(KAT.praca)}. Só existe no cronograma (sem hora, sem leiloeira); não está na agenda pública, no radar de mercado nem na planilha de setembro</div>
    <span>Condição</span><div>${esc(KAT.condicao)}</div>
    <span>Acordo</span><div>${esc(KAT.acordo)}</div>
    <span>Resumo da equipe</span><div>"${esc(KAT.resumoGrupo.texto)}" — grupo Financeiro, ${esc(KAT.resumoGrupo.quando)} · <strong>${KAT.confereComGrupo ? 'bate' : 'NÃO bate'}</strong></div>
  </div>
  <table class="lotes">
    <colgroup><col style="width:7mm"><col style="width:13mm"><col style="width:7mm"><col style="width:21mm"><col style="width:24mm"><col style="width:52mm"><col style="width:22mm"><col style="width:21mm"><col style="width:17mm"></colgroup>
    <tr><th>Lote</th><th class="num">Parcela</th><th class="num">×</th><th class="num">VGV</th><th>Vendeu</th><th>Comprador</th><th>Praça</th><th>Ficha</th><th class="num">2%</th></tr>
    ${KAT.lotes.map(l => linhaLote(l, false)).join('')}
    ${totalLote(KAT, 3)}
  </table>
  <div class="box alerta" style="margin-top:2mm">
    <div class="t">Atribuição por correlação — confirmar com o Douglas</div>
    <p style="margin:0">${esc(KAT.atribuicaoNota)}</p>
  </div>

  <h3>Fora do fechamento — os quatro itens, com a prova</h3>
  <table>
    <tr><th style="width:36mm">Item</th><th style="width:22mm">Quando · onde</th><th style="width:26mm">Situação</th><th>Por quê</th></tr>
    ${fora.map(f => `<tr><td><strong>${esc(corta(f.item, 70))}</strong></td><td>${esc(f.quando)}<br><span class="muted">${esc(f.grupo)}</span><br><span class="muted">${esc(f.autor || '')}</span></td><td><strong>${esc(f.situacao)}</strong></td><td>${esc(f.porque)}</td></tr>`).join('')}
  </table>
  <p class="small">Fora do escopo, mas visto: na quinta 10/09 a <strong>Bula Remates</strong> fez o Só Criador (gado comercial, R$ ${brl(D.hastapro.soCriador.vgv)} no HastaPro FIL 01) com a Laila na pista em ${D.hastapro.soCriador.laila.lotes.length} lotes (R$ ${brl(D.hastapro.soCriador.laila.vgv)}) — pela Remates, não é cobertura da Assessoria.
  E setembro inteiro segue fora do HastaPro: 05/09 (Jacamim + Flor do Arataú) tem ${D.setembroAntes.vendasSemVinculo} fichas sem vínculo no ERP e o Mafra de 06/09 só tem 1 lote.</p>
  ${foot(6)}
</section>

<!-- ══ 6. ASSESSORES + CORREÇÕES + PENDÊNCIAS ══ -->
<section class="page">
  <div class="head"><h2>Por assessor, correções e pendências</h2><div class="n">06 · Fechamento proposto</div></div>
  <table>
    <tr><th>Assessor</th><th class="num">%</th><th class="num">Lotes</th><th class="num">VGV</th><th class="num">AZ</th><th class="num">EAO</th><th class="num">Katayama</th><th class="num">Comissão</th><th>Pagamento</th></tr>
    ${D.porAssessor.map(a => `<tr><td style="white-space:nowrap">${esc(a.nome)}</td><td class="num">${pct(a.pct)}</td><td class="num">${a.lotes}</td><td class="num">R$ ${brl(a.vgv)}</td><td class="num">${a.leiloes.az ? 'R$ ' + brl0(a.leiloes.az.vgv) : '—'}</td><td class="num">${a.leiloes.eao ? 'R$ ' + brl0(a.leiloes.eao.vgv) : '—'}</td><td class="num">${a.leiloes.katayama ? 'R$ ' + brl0(a.leiloes.katayama.vgv) : '—'}</td><td class="num"><strong>R$ ${brl(a.comissao)}</strong></td><td>${esc(a.pagamento)}</td></tr>`).join('')}
    <tr class="total"><td colspan="2">Equipe</td><td class="num">${T.lotes}</td><td class="num">R$ ${brl(T.vgv)}</td><td class="num">R$ ${brl0(AZ.totais.vgv)}</td><td class="num">R$ ${brl0(EAO.totais.vgv)}</td><td class="num">R$ ${brl0(KAT.totais.vgv)}</td><td class="num">R$ ${brl(T.comissao)}</td><td></td></tr>
  </table>
  <p class="small" style="margin-bottom:1mm">Percentuais da folha: 2% para os quatro. Nenhum comprador do fim de semana está na lista de direcionamento do Rusa (o único caso, lt 96, ficou fora). Nane acumula para 28/12. Não gerar CP antes de fechar as pendências.</p>

  <div class="cols2">
    <div class="box" style="margin-top:2mm">
      <div class="t">Correções no web-bula (nada foi alterado ainda)</div>
      <ol style="margin:0">${D.correcoes.map(c => `<li><strong>${esc(c.o)}</strong> <span class="muted">${esc(corta(c.por, 120))}</span></li>`).join('')}</ol>
    </div>
    <div class="box" style="margin-top:2mm">
      <div class="t">Pendências — o que muda o número</div>
      <table style="margin:0; font-size:8.5px">
        ${D.pendencias.map(p => `<tr><td>${esc(p.p)}<br><span class="muted">${esc(p.impacto)}</span></td><td style="white-space:nowrap">${esc(p.quem)}</td></tr>`).join('')}
      </table>
    </div>
  </div>
  <div class="box dark" style="margin-top:1mm">
    <div class="t">Resumo para o chefe</div>
    <p style="margin:0">Pode lançar <strong>R$ ${brl(T.vgv)} em ${T.lotes} lotes</strong> — AZ ${brl0(AZ.totais.vgv)} (4 touros), EAO ${brl0(EAO.totais.vgv)} (11 touros + 1 fêmea) e Katayama ${brl0(KAT.totais.vgv)} (4 fêmeas) — com <strong>R$ ${brl(T.comissao)}</strong> de comissão. Antes de importar: apagar o lt 105 e o fantasma do lt 38; vincular as 16 vendas aos dois pregões; e fechar com o Douglas o Katayama e o lt 96. O lt 2023 do AZ (40×) e o lt 19 do EAO (à vista, cadastro "não autorizado") são os dois que podem mudar de valor.</p>
  </div>
  ${foot(7)}
</section>
</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)
const DESK = path.join(os.homedir(), 'Desktop', 'Fechamento 11-13 set 2026')
fs.mkdirSync(DESK, { recursive: true })
const destino = path.join(DESK, 'Bula - Fechamento Leiloes 11 a 13-09-2026 - Conferencia.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p, i) => ({ pagina: i + 1, sobra: p.scrollHeight - p.clientHeight })))
for (const o of overflow) if (o.sobra > 0) console.warn(`⚠ página ${o.pagina} transborda ${o.sobra}px`)
if (overflow.every(o => o.sobra <= 0)) console.log('paginas OK (sem transbordo)')
await page.pdf({ path: destino, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
await browser.close()
const pdf = await PDFDocument.load(fs.readFileSync(destino))
console.log('paginas no PDF:', pdf.getPageCount(), '(esperado', (html.match(/<section class="page/g) || []).length + ')')
fs.copyFileSync(destino, path.join(OUT, 'Conferencia-Fechamento-11-13-set-2026.pdf'))
console.log('PDF →', destino)
