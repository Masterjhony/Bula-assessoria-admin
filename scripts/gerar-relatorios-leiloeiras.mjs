// Gera dois relatorios de vendas da Bula Assessoria — um para a leiloeira
// Jacamim (8o Leilao Femeas) e outro para a Camparino (41o Touros), para fins
// de cobranca do valor referente a cada leilao.
//
// Diretiva do chefe (WhatsApp 30/06): "o que for interno tira". Por isso os
// relatorios NAO trazem nenhum dado interno da Bula — sem assessores, sem
// comissao de equipe, sem sobra/lucro, sem imposto/despesas e sem comparativo
// com a media dos outros leiloes. Mostram apenas o resultado de vendas (lotes,
// compradores, alcance) e o valor a faturar conforme o acordo comercial.
//
// Saida: dois PDFs na area de trabalho do usuario.
//
// Uso: node scripts/gerar-relatorios-leiloeiras.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const DESKTOP = 'C:/Users/Notebook-Acer/Desktop'

const logoB64 = readFileSync(join(root, 'public', 'logo-bula-assessoria-white.png')).toString('base64')
const LOGO = `data:image/png;base64,${logoB64}`

const brl = (n) =>
  `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const brl0 = (n) =>
  `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

// ─────────────────────────────────────────────────────────────────────────────
// Dados (apenas o que pode ir ao cliente). Fonte: bula_leilao_fechamento.
// ─────────────────────────────────────────────────────────────────────────────

const JACAMIM = {
  arquivo: 'Relatorio-Vendas-Bula-Jacamim-8o-Leilao-Femeas.pdf',
  leiloeira: 'Leilão Jacamim',
  titulo: '8º Leilão Jacamim — Fêmeas',
  vendedor: 'Fazenda Jacamim',
  data: '07/06/2026',
  modalidade: 'Leilão Virtual',
  categoria: 'Fêmeas Nelore',
  lotes: [
    { lote: '55', desc: '1 fêmea', parcela: 850, parcelas: 30, comprador: 'Nelore Beca', local: 'Quixeló / CE' },
    { lote: '127', desc: '1 fêmea', parcela: 900, parcelas: 30, comprador: 'Marco Túlio Severino', local: 'Caçu / GO' },
    { lote: '43', desc: '1 fêmea', parcela: 900, parcelas: 30, comprador: 'Nelore Leão', local: 'João Pinheiro / MG' },
    { lote: '54', desc: '1 fêmea', parcela: 1000, parcelas: 30, comprador: 'Elias Abdo Filho — Nelore ABBA', local: 'Cruzeiro do Oeste / PR' },
    { lote: '44', desc: '1 fêmea', parcela: 920, parcelas: 30, comprador: 'Nelore Beca', local: 'Quixeló / CE' },
    { lote: '18', desc: '1 fêmea', parcela: 820, parcelas: 30, comprador: 'Thales de Oliveira', local: 'Pimenta / MG' },
    { lote: '112', desc: '1 fêmea', parcela: 650, parcelas: 30, comprador: 'Elias Abdo Filho — Nelore ABBA', local: 'Cruzeiro do Oeste / PR' },
    { lote: '73', desc: '1 fêmea', parcela: 650, parcelas: 30, comprador: 'Fazenda Mestre Sousa — Nelore MSJ', local: 'Baixa Grande / BA' },
  ],
  compradores_unicos: 6,
  estados: 5,
  // Acordo comercial: 0,5% sobre o faturamento total do leilao.
  cobranca: {
    base_label: 'Faturamento total do leilão',
    base_valor: 4301900,
    pct: 0.005,
    valor: 21509.5,
  },
}

const CAMPARINO = {
  arquivo: 'Relatorio-Vendas-Bula-Camparino-41o-Touros.pdf',
  leiloeira: 'Leilão Camparino',
  titulo: '41º Leilão Touros Camparino',
  vendedor: 'Fazenda Camparino',
  data: '06/06/2026',
  modalidade: 'Leilão Virtual',
  categoria: 'Touros Nelore',
  lotes: [
    { lote: '14', desc: '1 touro', parcela: 1850, parcelas: 30, comprador: 'Gilson Carlos', local: 'Santa Terezinha / MT' },
    { lote: '58', desc: '1 touro', parcela: 1550, parcelas: 30, comprador: 'Fazenda LP — Jonas Conselvam', local: 'Mato Grosso / MT' },
    { lote: '32', desc: '1 touro', parcela: 1750, parcelas: 30, comprador: 'Fazenda Boa Esperança — Valter Diniz', local: 'Novo Repartimento / PA' },
    { lote: '40', desc: '1 touro', parcela: 1700, parcelas: 30, comprador: 'Guilherme Staut — Fazenda Campo Grande', local: 'Pontes e Lacerda / MT' },
    { lote: '28', desc: '1 touro', parcela: 1700, parcelas: 30, comprador: 'Guilherme Staut — Fazenda Campo Grande', local: 'Pontes e Lacerda / MT' },
    { lote: '60', desc: '1 touro', parcela: 1700, parcelas: 30, comprador: 'Guilherme Staut — Fazenda Campo Grande', local: 'Pontes e Lacerda / MT' },
    { lote: '68', desc: '1 touro', parcela: 1500, parcelas: 30, comprador: 'Fazenda LP — Jonas Conselvam', local: 'Mato Grosso / MT' },
    { lote: '82', desc: '1 touro', parcela: 1400, parcelas: 30, comprador: 'PHB Agropecuária', local: 'Nova Canaã do Norte / MT' },
  ],
  compradores_unicos: 5,
  estados: 2,
  // Acordo comercial: 0,5% sobre a participacao Bula no leilao.
  cobranca: {
    base_label: 'Participação Bula no leilão',
    base_valor: null, // preenchido com o VGV da cobertura
    pct: 0.005,
    valor: 1972.5,
  },
}

// ─────────────────────────────────────────────────────────────────────────────

function render(rep) {
  const lotes = rep.lotes.map((l) => ({ ...l, vgv: l.parcela * l.parcelas }))
  const vgv = lotes.reduce((s, l) => s + l.vgv, 0)
  const animais = lotes.length
  const ticket = Math.round(vgv / animais)
  if (rep.cobranca.base_valor == null) rep.cobranca.base_valor = vgv

  const linhas = lotes
    .map(
      (l) => `
        <tr>
          <td class="lote">${l.lote}</td>
          <td>${l.desc}</td>
          <td>${l.comprador}</td>
          <td>${l.local}</td>
          <td class="right">${brl(l.parcela)}</td>
          <td class="right">${l.parcelas}×</td>
          <td class="right strong">${brl(l.vgv)}</td>
        </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>${rep.titulo}</title>
<style>
  :root{--verde-escuro:#1d3a2a;--verde:#2e5740;--verde-claro:#6b8f5c;--creme:#f6f4ee;--dourado:#b08d3e;--cinza:#5b6058;--linha:#e3e0d7;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#25291f;background:#fff;font-size:11px;}
  .header{background:var(--verde-escuro);color:#fff;padding:30px 44px 26px;display:flex;justify-content:space-between;align-items:center;}
  .header .titulo h1{font-size:21px;font-weight:700;letter-spacing:.3px;margin-bottom:5px;}
  .header .titulo .sub{font-size:11px;color:#cfd9c8;letter-spacing:1.6px;text-transform:uppercase;}
  .header .logo-box img{height:46px;display:block;}
  .faixa{background:var(--verde-claro);height:5px;}
  .cliente{display:flex;justify-content:space-between;padding:18px 44px;background:var(--creme);border-bottom:1px solid var(--linha);}
  .cliente .campo .label{font-size:8.5px;text-transform:uppercase;letter-spacing:1.2px;color:var(--cinza);margin-bottom:3px;}
  .cliente .campo .valor{font-size:12.5px;font-weight:600;color:var(--verde-escuro);}
  .resumo{display:flex;gap:14px;padding:22px 44px 6px;}
  .card{flex:1;border:1px solid var(--linha);border-top:3px solid var(--verde-claro);border-radius:8px;padding:13px 14px 11px;text-align:center;background:#fff;}
  .card.destaque{border-top-color:var(--dourado);background:#fdfbf5;}
  .card .num{font-size:20px;font-weight:700;color:var(--verde-escuro);margin-bottom:2px;}
  .card.destaque .num{color:var(--dourado);}
  .card .desc{font-size:8.5px;text-transform:uppercase;letter-spacing:1px;color:var(--cinza);}
  .secao{padding:20px 44px 0;}
  .secao h2{font-size:13px;color:var(--verde-escuro);text-transform:uppercase;letter-spacing:1.4px;border-bottom:2px solid var(--verde-claro);padding-bottom:6px;margin-bottom:12px;}
  table{width:100%;border-collapse:collapse;}
  thead th{background:var(--verde-escuro);color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.8px;padding:8px 9px;text-align:left;}
  thead th.right,td.right{text-align:right;}
  tbody td{padding:7px 9px;border-bottom:1px solid var(--linha);font-size:10.5px;vertical-align:top;}
  td.lote{font-weight:700;color:var(--verde-escuro);}
  td.strong{font-weight:700;color:var(--verde-escuro);}
  tr.total-geral td{background:var(--verde-escuro);color:#fff;font-weight:700;font-size:12px;padding:11px 9px;}
  tr{page-break-inside:avoid;}
  .cobranca{margin:22px 44px 0;border:1px solid var(--linha);border-radius:10px;overflow:hidden;}
  .cobranca .topo{background:var(--verde);color:#fff;padding:10px 16px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;}
  .cobranca .corpo{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#fdfbf5;}
  .cobranca .memo{font-size:10.5px;color:var(--cinza);line-height:1.6;}
  .cobranca .memo b{color:var(--verde-escuro);}
  .cobranca .valor-final{text-align:right;}
  .cobranca .valor-final .rotulo{font-size:8.5px;text-transform:uppercase;letter-spacing:1px;color:var(--cinza);margin-bottom:2px;}
  .cobranca .valor-final .num{font-size:26px;font-weight:700;color:var(--dourado);}
  .nota{margin:16px 44px 0;background:var(--creme);border-left:4px solid var(--verde-claro);border-radius:0 6px 6px 0;padding:10px 14px;font-size:9.5px;color:var(--cinza);line-height:1.5;}
  .footer{margin-top:26px;background:var(--verde-escuro);color:#cfd9c8;padding:14px 44px;display:flex;justify-content:space-between;align-items:center;font-size:9px;letter-spacing:.6px;}
  .footer strong{color:#fff;}
</style></head><body>
  <div class="header">
    <div class="titulo"><h1>Relatório de Vendas — Bula Assessoria</h1><div class="sub">${rep.titulo}</div></div>
    <div class="logo-box"><img src="${LOGO}" alt="Bula Assessoria"></div>
  </div>
  <div class="faixa"></div>

  <div class="cliente">
    <div class="campo"><div class="label">Leiloeira</div><div class="valor">${rep.leiloeira}</div></div>
    <div class="campo"><div class="label">Leilão</div><div class="valor">${rep.titulo}</div></div>
    <div class="campo"><div class="label">Data / Modalidade</div><div class="valor">${rep.data} • ${rep.modalidade}</div></div>
    <div class="campo"><div class="label">Emissão</div><div class="valor">30/06/2026</div></div>
  </div>

  <div class="resumo">
    <div class="card"><div class="num">${lotes.length}</div><div class="desc">Lotes vendidos</div></div>
    <div class="card"><div class="num">${rep.compradores_unicos}</div><div class="desc">Compradores</div></div>
    <div class="card"><div class="num">${rep.estados}</div><div class="desc">Estados alcançados</div></div>
    <div class="card destaque"><div class="num">${brl0(vgv)}</div><div class="desc">Total vendido (Bula)</div></div>
  </div>

  <div class="secao">
    <h2>Vendas realizadas pela Bula Assessoria</h2>
    <table>
      <thead><tr>
        <th style="width:46px">Lote</th><th style="width:70px">Animal</th><th>Comprador</th><th style="width:150px">Localidade</th>
        <th style="width:80px" class="right">Parcela</th><th style="width:58px" class="right">Prazo</th><th style="width:92px" class="right">Valor total</th>
      </tr></thead>
      <tbody>
        ${linhas}
        <tr class="total-geral"><td colspan="6">TOTAL — ${lotes.length} LOTES • ${animais} ANIMAIS</td><td class="right">${brl(vgv)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="cobranca">
    <div class="topo">Valor a faturar — Assessoria Bula</div>
    <div class="corpo">
      <div class="memo">
        Conforme acordo comercial vigente entre a <b>${rep.leiloeira}</b> e a <b>Bula Assessoria</b>.<br>
        ${rep.cobranca.base_label}: <b>${brl(rep.cobranca.base_valor)}</b><br>
        Comissão de assessoria: <b>${(rep.cobranca.pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%</b> × ${brl(rep.cobranca.base_valor)}
      </div>
      <div class="valor-final">
        <div class="rotulo">Total a faturar</div>
        <div class="num">${brl(rep.cobranca.valor)}</div>
      </div>
    </div>
  </div>

  <div class="nota">
    Relatório das vendas conduzidas pela equipe da Bula Assessoria no ${rep.titulo} (${rep.vendedor}, ${rep.data}).
    Valores em reais (BRL). Prazo de pagamento dos animais conforme condição do leilão (parcela × prazo).
  </div>

  <div class="footer">
    <div><strong>Bula Assessoria Pecuária</strong></div>
    <div>Documento emitido em 30/06/2026</div>
  </div>
</body></html>`
}

const browser = await chromium.launch()
for (const rep of [JACAMIM, CAMPARINO]) {
  const html = render(rep)
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  const out = join(DESKTOP, rep.arquivo)
  await page.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
  if (process.env.PREVIEW) {
    await page.setViewportSize({ width: 794, height: 1123 })
    await page.screenshot({ path: join(process.env.PREVIEW, rep.arquivo.replace('.pdf', '.png')), fullPage: true })
  }
  await page.close()
  console.log('PDF gerado:', out)
}
await browser.close()
console.log('\nConcluído — 2 relatórios na área de trabalho.')
