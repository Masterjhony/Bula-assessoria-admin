// Fechamento das vendas da Bula Assessoria nos leiloes NELORE MAFRA de agosto/2026,
// no formato que vai para o financeiro do cliente (Nelore Mafra / Programa Leiloes).
//
// Diretiva do chefe para relatorio de cliente: "o que for interno tira" — sem
// assessores, sem comissao de equipe, sem imposto, sem sobra. So vendas, acordo
// e valor a receber.
//
// Fontes (conferidas em 03/09/2026):
//   • Lotes/valores: HastaPro (Firebird, FIL 2) — LEI 260801161934455 (femeas)
//     e 260805074106574 (touros). Confere 1:1 com bula_leilao_fechamento.
//   • Faturamento total de cada pregao: planilha-mestra FINANCEIRO BULA 2026.
//   • Acordo: tabela "MAFRA AGROPECUARIA" da aba "Acordos com Marcas":
//     0-3% cobertura = 4% do que vender | 3-8% = 0,3% | 8,01-10% = 0,5% |
//     10,01-13% = 0,75% | 13,01-15% = 1% | 15,01-20% = 1,25% | 20,01%+ = 1,5%
//     (percentual aplicado sobre o faturamento total do pregao)
//
// Uso: node scripts/gera-fechamento-mafra-agosto-2026-leiloeira.mjs

import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESKTOP = 'C:/Users/Notebook-Acer/Desktop'
const ARQUIVO = 'Fechamento-Bula-Nelore-Mafra-Agosto-2026.pdf'

const LOGO = `data:image/png;base64,${readFileSync(join(root, 'public', 'logo-bula-assessoria-white.png')).toString('base64')}`

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const brl0 = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const pct = (n, d = 2) => `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`

// ── Tabela do acordo Mafra Agropecuaria ──────────────────────────────────────
const TABELA = [
    { faixa: '0% a 3%', regra: '4% sobre o valor vendido', pct: 0.04 },
    { faixa: '3% a 8%', regra: '0,30% sobre o faturamento', pct: 0.003 },
    { faixa: '8,01% a 10%', regra: '0,50% sobre o faturamento', pct: 0.005 },
    { faixa: '10,01% a 13%', regra: '0,75% sobre o faturamento', pct: 0.0075 },
    { faixa: '13,01% a 15%', regra: '1,00% sobre o faturamento', pct: 0.01 },
    { faixa: '15,01% a 20%', regra: '1,25% sobre o faturamento', pct: 0.0125 },
    { faixa: '20,01% ou mais', regra: '1,50% sobre o faturamento', pct: 0.015 },
]

// ── Lotes (HastaPro, FIL 2). Prazo derivado de total / (lance x qtd). ────────
const PREGOES = [
    {
        id: 'femeas',
        titulo: 'Leilão Fêmeas Nelore Mafra',
        data: '01/08/2026',
        categoria: 'Fêmeas',
        singular: 'fêmea',
        plural: 'fêmeas',
        faturamento: 5627600,
        faixa: '15,01% a 20%',
        pctAplicado: 0.0125,
        lotes: [
            { lote: '1000', qtd: 1, lance: 2000, total: 60000, comprador: 'Adil Junior', fazenda: 'Fazenda Casa Amarela', uf: '' },
            { lote: '17', qtd: 1, lance: 600, total: 18000, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '18', qtd: 1, lance: 570, total: 17100, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '', nota: true },
            { lote: '39', qtd: 3, lance: 350, total: 42000, comprador: 'André Luis Caetano Rosa', fazenda: 'Fazenda Estilo', uf: 'PA' },
            { lote: '41', qtd: 4, lance: 350, total: 56000, comprador: 'André Luis Caetano Rosa', fazenda: 'Fazenda Estilo', uf: 'PA' },
            { lote: '42', qtd: 3, lance: 450, total: 54000, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '43', qtd: 3, lance: 450, total: 54000, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '44', qtd: 3, lance: 450, total: 54000, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '49', qtd: 3, lance: 450, total: 54000, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '50', qtd: 4, lance: 450, total: 72000, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '51', qtd: 3, lance: 400, total: 48000, comprador: 'Gilson Lopes Bispo', fazenda: 'Fazenda Estilo', uf: 'PA' },
            { lote: '56', qtd: 3, lance: 450, total: 54000, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '57', qtd: 4, lance: 430, total: 68800, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '60', qtd: 4, lance: 430, total: 68800, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '62', qtd: 2, lance: 450, total: 36000, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '63', qtd: 3, lance: 450, total: 54000, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '65', qtd: 3, lance: 450, total: 54000, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '66', qtd: 3, lance: 450, total: 54000, comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', uf: '' },
            { lote: '73', qtd: 3, lance: 420, total: 50400, comprador: 'Gilson Lopes Bispo', fazenda: 'Fazenda Estilo', uf: 'PA' },
            { lote: '82', qtd: 4, lance: 460, total: 73600, comprador: 'Gilberto Pereira Sarubi', fazenda: 'Fazenda Dona II', uf: 'PA' },
        ],
    },
    {
        id: 'touros',
        titulo: 'Leilão Touros Nelore Mafra',
        data: '02/08/2026',
        categoria: 'Touros',
        singular: 'touro',
        plural: 'touros',
        faturamento: 5102000,
        faixa: '3% a 8%',
        pctAplicado: 0.003,
        lotes: [
            { lote: '28', qtd: 1, lance: 700, total: 21000, comprador: 'Gustavo Berto', fazenda: '', uf: '' },
            { lote: '38', qtd: 1, lance: 1120, total: 33600, comprador: 'Sebastião Trindade Florentino', fazenda: 'Fazenda Beira Rio', uf: '' },
            { lote: '47', qtd: 1, lance: 820, total: 24600, comprador: 'Derek Danesi do Nascimento', fazenda: 'Grupo Aconchego', uf: '' },
            { lote: '49', qtd: 1, lance: 800, total: 24000, comprador: 'Armando de Matos', fazenda: 'Fazenda Boa Sorte', uf: '' },
            { lote: '56', qtd: 1, lance: 1000, total: 30000, comprador: 'Osmarino Pereira', fazenda: 'Fazenda Veras', uf: '' },
            { lote: '58', qtd: 1, lance: 800, total: 24000, comprador: 'Mauricio Sousa de Almeida', fazenda: 'Fazenda Sapucaya', uf: '' },
            { lote: '84', qtd: 1, lance: 700, total: 21000, comprador: 'Mauricio Sousa de Almeida', fazenda: 'Fazenda Sapucaya', uf: '' },
        ],
    },
]

// ── Apuracao (com travas: prazo inteiro e faixa coerente com a tabela) ───────
for (const p of PREGOES) {
    for (const l of p.lotes) {
        l.prazo = l.total / (l.lance * l.qtd)
        if (!Number.isInteger(l.prazo)) throw new Error(`Prazo nao inteiro no lote ${l.lote} de ${p.id}`)
    }
    p.vgv = p.lotes.reduce((s, l) => s + l.total, 0)
    p.animais = p.lotes.reduce((s, l) => s + l.qtd, 0)
    p.compradores = new Set(p.lotes.map((l) => l.comprador)).size
    p.cobertura = p.vgv / p.faturamento
    p.aReceber = Math.round(p.faturamento * p.pctAplicado * 100) / 100

    const t = TABELA.find((x) => x.faixa === p.faixa)
    if (!t || t.pct !== p.pctAplicado) throw new Error(`Faixa/percentual inconsistentes em ${p.id}`)
}

const TOT = {
    lotes: PREGOES.reduce((s, p) => s + p.lotes.length, 0),
    animais: PREGOES.reduce((s, p) => s + p.animais, 0),
    vgv: PREGOES.reduce((s, p) => s + p.vgv, 0),
    aReceber: PREGOES.reduce((s, p) => s + p.aReceber, 0),
}

const linhas = (p) => p.lotes.map((l) => `
  <tr>
    <td class="lote">${l.lote}${l.nota ? '<sup>*</sup>' : ''}</td>
    <td>${l.qtd} ${l.qtd > 1 ? p.plural : p.singular}</td>
    <td>${l.comprador}${l.fazenda ? `<span class="faz"> · ${l.fazenda}</span>` : ''}${l.uf ? `<span class="faz"> · ${l.uf}</span>` : ''}</td>
    <td class="right">${brl(l.lance)}</td>
    <td class="right">${l.prazo}&times;</td>
    <td class="right strong">${brl(l.total)}</td>
  </tr>`).join('')

const bloco = (p) => `
  <div class="secao quebra">
    <h2>${p.titulo} <span class="h2sub">— ${p.data}</span></h2>
    <div class="minicards">
      <div class="mc"><div class="n">${p.lotes.length}</div><div class="d">Lotes</div></div>
      <div class="mc"><div class="n">${p.animais}</div><div class="d">Animais</div></div>
      <div class="mc"><div class="n">${p.compradores}</div><div class="d">Compradores</div></div>
      <div class="mc destaque"><div class="n">${brl0(p.vgv)}</div><div class="d">Vendido pela Bula</div></div>
    </div>
    <table>
      <thead><tr>
        <th style="width:52px">Lote</th><th style="width:82px">Animais</th><th>Comprador</th>
        <th style="width:88px" class="right">Parcela</th><th style="width:56px" class="right">Prazo</th><th style="width:106px" class="right">Valor total</th>
      </tr></thead>
      <tbody>
        ${linhas(p)}
        <tr class="total-geral"><td colspan="5">TOTAL — ${p.lotes.length} LOTES • ${p.animais} ANIMAIS</td><td class="right">${brl(p.vgv)}</td></tr>
      </tbody>
    </table>
    ${p.lotes.some((l) => l.nota) ? '<div class="rodape-tab">(*) Lote negociado no pós-leilão, em 11/08/2026, e incluído nesta apuração.</div>' : ''}
    <div class="apuracao">
      <div class="ap-linha"><span>Faturamento total do pregão</span><b>${brl(p.faturamento)}</b></div>
      <div class="ap-linha"><span>Vendas conduzidas pela Bula Assessoria</span><b>${brl(p.vgv)}</b></div>
      <div class="ap-linha"><span>Participação da Bula no faturamento</span><b>${pct(p.cobertura)}</b></div>
      <div class="ap-linha"><span>Faixa do acordo aplicada</span><b>${p.faixa} &rarr; ${pct(p.pctAplicado)} do faturamento</b></div>
      <div class="ap-linha total"><span>Valor a receber — ${p.categoria} ${p.data}</span><b>${brl(p.aReceber)}</b></div>
    </div>
  </div>`

const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Fechamento Bula — Nelore Mafra · Agosto 2026</title>
<style>
  /* Brandbook Bula — identidade preto e branco. */
  :root{--preto:#111;--preto-puro:#000;--grafite:#2b2b2b;--cinza:#6b6b6b;--cinza-claro:#f4f3f1;--linha:#dcdad4;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;font-size:11px;}
  .header{background:var(--preto-puro);color:#fff;padding:30px 44px 26px;display:flex;justify-content:space-between;align-items:center;}
  .header h1{font-size:21px;font-weight:700;letter-spacing:.3px;margin-bottom:5px;}
  .header .sub{font-size:11px;color:#c9c9c9;letter-spacing:1.6px;text-transform:uppercase;}
  .header img{height:46px;display:block;}
  .faixa{background:var(--cinza);height:4px;}
  .cliente{display:flex;justify-content:space-between;padding:18px 44px;background:var(--cinza-claro);border-bottom:1px solid var(--linha);}
  .cliente .label{font-size:8.5px;text-transform:uppercase;letter-spacing:1.2px;color:var(--cinza);margin-bottom:3px;}
  .cliente .valor{font-size:12.5px;font-weight:600;color:var(--preto);}
  .resumo{display:flex;gap:14px;padding:22px 44px 4px;}
  .card{flex:1;border:1px solid var(--linha);border-top:3px solid var(--cinza);border-radius:8px;padding:13px 14px 11px;text-align:center;}
  .card.destaque{border-top-color:var(--preto-puro);background:var(--cinza-claro);}
  .card .num{font-size:20px;font-weight:700;color:var(--preto);margin-bottom:2px;}
  .card.destaque .num{color:var(--preto-puro);}
  .card .desc{font-size:8.5px;text-transform:uppercase;letter-spacing:1px;color:var(--cinza);}
  .secao{padding:20px 44px 0;}
  .secao.quebra{page-break-before:always;padding-top:34px;}
  .secao h2{font-size:13px;color:var(--preto);text-transform:uppercase;letter-spacing:1.4px;border-bottom:2px solid var(--preto);padding-bottom:6px;margin-bottom:12px;}
  .secao h2 .h2sub{color:var(--cinza);font-weight:600;letter-spacing:.6px;}
  .minicards{display:flex;gap:10px;margin-bottom:12px;}
  .mc{flex:1;border:1px solid var(--linha);border-radius:6px;padding:9px 10px 8px;text-align:center;}
  .mc.destaque{background:var(--cinza-claro);border-color:var(--cinza);}
  .mc .n{font-size:15px;font-weight:700;color:var(--preto);}
  .mc .d{font-size:8px;text-transform:uppercase;letter-spacing:.9px;color:var(--cinza);margin-top:1px;}
  table{width:100%;border-collapse:collapse;}
  thead th{background:var(--preto);color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.8px;padding:8px 9px;text-align:left;}
  thead th.right,td.right{text-align:right;}
  tbody td{padding:6.5px 9px;border-bottom:1px solid var(--linha);font-size:10.5px;vertical-align:top;}
  td.lote{font-weight:700;color:var(--preto);}
  td.strong{font-weight:700;color:var(--preto);}
  .faz{color:var(--cinza);}
  tr.total-geral td{background:var(--preto-puro);color:#fff;font-weight:700;font-size:11.5px;padding:10px 9px;}
  tr{page-break-inside:avoid;}
  .apuracao{margin-top:14px;border:1px solid var(--linha);border-radius:8px;overflow:hidden;}
  .ap-linha{display:flex;justify-content:space-between;gap:20px;padding:8px 16px;font-size:10.5px;border-bottom:1px solid var(--linha);}
  .ap-linha span{color:var(--cinza);}
  .ap-linha b{color:var(--preto);font-weight:700;white-space:nowrap;}
  .ap-linha.total{background:var(--cinza-claro);border-bottom:none;padding:11px 16px;font-size:12px;}
  .ap-linha.total span{color:var(--preto);font-weight:600;}
  .ap-linha.total b{font-size:14px;}
  .cobranca{margin:24px 44px 0;border:1px solid var(--linha);border-radius:10px;overflow:hidden;}
  .cobranca .topo{background:var(--grafite);color:#fff;padding:10px 16px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;}
  .cobranca .corpo{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--cinza-claro);}
  .cobranca .memo{font-size:10px;color:var(--cinza);line-height:1.7;}
  table.resumo-tab thead th{background:var(--preto);font-size:8.5px;padding:7px 9px;}
  table.resumo-tab tbody td{font-size:10.5px;padding:8px 9px;}
  .cobranca .memo b{color:var(--preto);}
  .cobranca .valor-final{text-align:right;padding-left:24px;}
  .cobranca .valor-final .rotulo{font-size:8.5px;text-transform:uppercase;letter-spacing:1px;color:var(--cinza);margin-bottom:2px;}
  .cobranca .valor-final .num{font-size:26px;font-weight:700;color:var(--preto-puro);white-space:nowrap;}
  table.acordo thead th{background:var(--grafite);}
  table.acordo tbody td{font-size:10px;padding:6px 9px;}
  table.acordo tr.aplicada td{background:var(--cinza-claro);font-weight:700;color:var(--preto);}
  .rodape-tab{font-size:9px;color:var(--cinza);padding:6px 2px 0;font-style:italic;}
  .nota{margin:16px 44px 0;background:var(--cinza-claro);border-left:4px solid var(--preto);border-radius:0 6px 6px 0;padding:11px 14px;font-size:9.5px;color:var(--cinza);line-height:1.7;}
  .nota b{color:var(--preto);}
  .footer{margin-top:26px;background:var(--preto-puro);color:#c9c9c9;padding:14px 44px;display:flex;justify-content:space-between;font-size:9px;letter-spacing:.6px;}
  .footer strong{color:#fff;}
</style></head><body>

  <div class="header">
    <div><h1>Fechamento de Vendas — Bula Assessoria</h1><div class="sub">Nelore Mafra · Edição Redenção/PA · Agosto de 2026</div></div>
    <img src="${LOGO}" alt="Bula Assessoria">
  </div>
  <div class="faixa"></div>

  <div class="cliente">
    <div><div class="label">Criador / Promotor</div><div class="valor">Nelore Mafra</div></div>
    <div><div class="label">Leiloeira</div><div class="valor">Programa Leilões</div></div>
    <div><div class="label">Pregões</div><div class="valor">01 e 02/08/2026</div></div>
    <div><div class="label">Emissão</div><div class="valor">03/09/2026</div></div>
  </div>

  <div class="resumo">
    <div class="card"><div class="num">2</div><div class="desc">Pregões</div></div>
    <div class="card"><div class="num">${TOT.lotes}</div><div class="desc">Lotes vendidos</div></div>
    <div class="card"><div class="num">${TOT.animais}</div><div class="desc">Animais</div></div>
    <div class="card destaque"><div class="num">${brl0(TOT.vgv)}</div><div class="desc">Vendido pela Bula</div></div>
  </div>

  <div class="cobranca">
    <div class="topo">Resumo — valor a receber pela Bula Assessoria</div>
    <table class="resumo-tab">
      <thead><tr>
        <th>Pregão</th><th style="width:56px" class="right">Data</th>
        <th style="width:108px" class="right">Faturamento</th><th style="width:104px" class="right">Vendas Bula</th>
        <th style="width:76px" class="right">Participação</th><th style="width:66px" class="right">Acordo</th>
        <th style="width:96px" class="right">A receber</th>
      </tr></thead>
      <tbody>
        ${PREGOES.map((p) => `<tr>
          <td class="strong">${p.titulo}</td>
          <td class="right">${p.data.slice(0, 5)}</td>
          <td class="right">${brl0(p.faturamento)}</td>
          <td class="right">${brl0(p.vgv)}</td>
          <td class="right">${pct(p.cobertura)}</td>
          <td class="right">${pct(p.pctAplicado)}</td>
          <td class="right strong">${brl(p.aReceber)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="corpo">
      <div class="memo">
        Comissão de assessoria apurada pela tabela do acordo <b>Mafra Agropecuária</b>,<br>
        aplicada sobre o faturamento total de cada pregão.
      </div>
      <div class="valor-final">
        <div class="rotulo">Total a receber</div>
        <div class="num">${brl(TOT.aReceber)}</div>
      </div>
    </div>
  </div>

  <div class="secao">
    <h2>Acordo comercial — Mafra Agropecuária</h2>
    <table class="acordo">
      <thead><tr>
        <th>Participação da Bula no faturamento do pregão</th>
        <th style="width:236px">Comissão de assessoria</th>
        <th style="width:150px" class="right">Aplicação em agosto/2026</th>
      </tr></thead>
      <tbody>
        ${TABELA.map((t) => {
            const usos = PREGOES.filter((p) => p.faixa === t.faixa)
            return `<tr class="${usos.length ? 'aplicada' : ''}">
              <td>${t.faixa}</td>
              <td>${t.regra}</td>
              <td class="right">${usos.length ? usos.map((u) => u.categoria).join(' e ') : '—'}</td>
            </tr>`
        }).join('')}
      </tbody>
    </table>
  </div>

  <div class="nota">
    <b>Notas.</b>
    Cada pregão é apurado isoladamente, conforme a tabela acima, sobre o faturamento total informado para a respectiva data.
    O detalhamento lote a lote está nas páginas seguintes. Valores em reais (BRL); prazo de pagamento dos animais conforme
    a condição de cada lote (parcela &times; prazo).<br>
    O <b>Leilão Nelore Mafra Agronova &amp; Amigos (18/08/2026)</b> não registrou vendas conduzidas pela Bula Assessoria —
    não há valor a faturar referente a esse evento.<br>
    Vencimento de referência: <b>15/09/2026</b> (fêmeas) e <b>16/09/2026</b> (touros) — 45 dias após cada pregão.
    Permanecemos à disposição para qualquer conferência.
  </div>

  ${PREGOES.map(bloco).join('')}

  <div class="footer">
    <div><strong>Bula Assessoria Pecuária</strong> &nbsp;·&nbsp; A assessoria do boiadeiro(a).</div>
    <div>Documento emitido em 03/09/2026</div>
  </div>
</body></html>`

mkdirSync(DESKTOP, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
const out = join(DESKTOP, ARQUIVO)
await page.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
if (process.env.PREVIEW) {
    await page.setViewportSize({ width: 794, height: 1123 })
    await page.screenshot({ path: process.env.PREVIEW, fullPage: true })
}
await browser.close()

console.log('PDF:', out)
for (const p of PREGOES) {
    console.log(`${p.categoria.padEnd(7)} ${p.lotes.length} lotes / ${p.animais} animais / ${brl(p.vgv)} · participacao ${pct(p.cobertura)} · ${pct(p.pctAplicado)} · a receber ${brl(p.aReceber)}`)
}
console.log(`TOTAL   ${TOT.lotes} lotes / ${TOT.animais} animais / ${brl(TOT.vgv)} · A RECEBER ${brl(TOT.aReceber)}`)
