// Gera os DOIS relatorios de vendas da Bula Assessoria — Jacamim (8o Leilao
// Femeas) e Camparino (41o Touros) — ja corrigidos conforme o retorno do chefe
// no grupo "Financeiro Bula Assessoria" (WhatsApp, 01/07/2026):
//
//   1. CAMPARINO: o fechamento estava em 30 parcelas; o correto sao 14 parcelas.
//      ("Preciso do fechamento Camparino. La se nao me engano estao 14 parcelas,
//       nao 30. No fechamento esta 30 parcelas. Corrige e me manda relatorio
//       atualizado.") -> prazo ajustado para 14x; VGV e valor a faturar
//       recalculados automaticamente.
//
//   2. IDENTIDADE VISUAL: "Sem verde pelo amor de deus" + "Usa o Brandbook".
//      A marca e preto e branco -> todo o verde/dourado do template antigo foi
//      substituido por uma paleta monocromatica (preto, cinza e branco), com o
//      logotipo oficial da Bula. Aplicado aos DOIS relatorios.
//
// Mantida a diretiva anterior do chefe (30/06): "o que for interno tira" — os
// relatorios NAO trazem dado interno (sem assessores, comissao, sobra, imposto).
//
// Saida: pasta na area de trabalho com os dois PDFs.
//
// Uso: node scripts/gerar-relatorios-leiloeiras-corrigidos.mjs

import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const DESKTOP = 'C:/Users/Notebook-Acer/Desktop'
const OUT_DIR = join(DESKTOP, 'Relatorios Leiloeiras - Corrigidos')
mkdirSync(OUT_DIR, { recursive: true })

// Logo oficial branco (para uso sobre o cabecalho preto) — marca preto e branco.
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
  // CORRECAO DO CHEFE (01/07): 14 parcelas, nao 30.
  lotes: [
    { lote: '14', desc: '1 touro', parcela: 1850, parcelas: 14, comprador: 'Gilson Carlos', local: 'Santa Terezinha / MT' },
    { lote: '58', desc: '1 touro', parcela: 1550, parcelas: 14, comprador: 'Fazenda LP — Jonas Conselvam', local: 'Mato Grosso / MT' },
    { lote: '32', desc: '1 touro', parcela: 1750, parcelas: 14, comprador: 'Fazenda Boa Esperança — Valter Diniz', local: 'Novo Repartimento / PA' },
    { lote: '40', desc: '1 touro', parcela: 1700, parcelas: 14, comprador: 'Guilherme Staut — Fazenda Campo Grande', local: 'Pontes e Lacerda / MT' },
    { lote: '28', desc: '1 touro', parcela: 1700, parcelas: 14, comprador: 'Guilherme Staut — Fazenda Campo Grande', local: 'Pontes e Lacerda / MT' },
    { lote: '60', desc: '1 touro', parcela: 1700, parcelas: 14, comprador: 'Guilherme Staut — Fazenda Campo Grande', local: 'Pontes e Lacerda / MT' },
    { lote: '68', desc: '1 touro', parcela: 1500, parcelas: 14, comprador: 'Fazenda LP — Jonas Conselvam', local: 'Mato Grosso / MT' },
    { lote: '82', desc: '1 touro', parcela: 1400, parcelas: 14, comprador: 'PHB Agropecuária', local: 'Nova Canaã do Norte / MT' },
  ],
  compradores_unicos: 5,
  estados: 2,
  // Acordo comercial: 0,5% sobre o FATURAMENTO TOTAL do leilao (nao sobre o VGV).
  // Retificado conforme o chefe (WhatsApp 01/07): "o percentual e sobre o
  // faturamento total da leiloeira, nao sobre o VGV". Faturamento Camparino =
  // R$ 2.048.830 (planilha oficial encaminhada, 83 cabecas).
  cobranca: {
    base_label: 'Faturamento total do leilão',
    base_valor: 2048830,
    pct: 0.005,
  },
}

// ─────────────────────────────────────────────────────────────────────────────

function render(rep) {
  const lotes = rep.lotes.map((l) => ({ ...l, vgv: l.parcela * l.parcelas }))
  const vgv = lotes.reduce((s, l) => s + l.vgv, 0)
  const animais = lotes.length
  if (rep.cobranca.base_valor == null) rep.cobranca.base_valor = vgv
  // Valor a faturar sempre coerente com a base e o percentual do acordo.
  const valorFaturar = Math.round(rep.cobranca.base_valor * rep.cobranca.pct * 100) / 100

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
  /* Brandbook Bula — identidade preto e branco (sem verde/dourado). */
  :root{--preto:#111111;--preto-puro:#000000;--grafite:#2b2b2b;--cinza:#6b6b6b;--cinza-claro:#f4f3f1;--linha:#dcdad4;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;font-size:11px;}
  .header{background:var(--preto-puro);color:#fff;padding:30px 44px 26px;display:flex;justify-content:space-between;align-items:center;}
  .header .titulo h1{font-size:21px;font-weight:700;letter-spacing:.3px;margin-bottom:5px;}
  .header .titulo .sub{font-size:11px;color:#c9c9c9;letter-spacing:1.6px;text-transform:uppercase;}
  .header .logo-box img{height:46px;display:block;}
  .faixa{background:var(--cinza);height:4px;}
  .cliente{display:flex;justify-content:space-between;padding:18px 44px;background:var(--cinza-claro);border-bottom:1px solid var(--linha);}
  .cliente .campo .label{font-size:8.5px;text-transform:uppercase;letter-spacing:1.2px;color:var(--cinza);margin-bottom:3px;}
  .cliente .campo .valor{font-size:12.5px;font-weight:600;color:var(--preto);}
  .resumo{display:flex;gap:14px;padding:22px 44px 6px;}
  .card{flex:1;border:1px solid var(--linha);border-top:3px solid var(--cinza);border-radius:8px;padding:13px 14px 11px;text-align:center;background:#fff;}
  .card.destaque{border-top-color:var(--preto-puro);border-width:1px;border-top-width:3px;background:var(--cinza-claro);}
  .card .num{font-size:20px;font-weight:700;color:var(--preto);margin-bottom:2px;}
  .card.destaque .num{color:var(--preto-puro);}
  .card .desc{font-size:8.5px;text-transform:uppercase;letter-spacing:1px;color:var(--cinza);}
  .secao{padding:20px 44px 0;}
  .secao h2{font-size:13px;color:var(--preto);text-transform:uppercase;letter-spacing:1.4px;border-bottom:2px solid var(--preto);padding-bottom:6px;margin-bottom:12px;}
  table{width:100%;border-collapse:collapse;}
  thead th{background:var(--preto);color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.8px;padding:8px 9px;text-align:left;}
  thead th.right,td.right{text-align:right;}
  tbody td{padding:7px 9px;border-bottom:1px solid var(--linha);font-size:10.5px;vertical-align:top;}
  td.lote{font-weight:700;color:var(--preto);}
  td.strong{font-weight:700;color:var(--preto);}
  tr.total-geral td{background:var(--preto-puro);color:#fff;font-weight:700;font-size:12px;padding:11px 9px;}
  tr.total-geral td.right{white-space:nowrap;}
  tr{page-break-inside:avoid;}
  .cobranca{margin:22px 44px 0;border:1px solid var(--linha);border-radius:10px;overflow:hidden;}
  .cobranca .topo{background:var(--grafite);color:#fff;padding:10px 16px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;}
  .cobranca .corpo{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--cinza-claro);}
  .cobranca .memo{font-size:10.5px;color:var(--cinza);line-height:1.6;}
  .cobranca .memo b{color:var(--preto);}
  .cobranca .valor-final{text-align:right;}
  .cobranca .valor-final .rotulo{font-size:8.5px;text-transform:uppercase;letter-spacing:1px;color:var(--cinza);margin-bottom:2px;}
  .cobranca .valor-final .num{font-size:26px;font-weight:700;color:var(--preto-puro);}
  .nota{margin:16px 44px 0;background:var(--cinza-claro);border-left:4px solid var(--preto);border-radius:0 6px 6px 0;padding:10px 14px;font-size:9.5px;color:var(--cinza);line-height:1.5;}
  .footer{margin-top:26px;background:var(--preto-puro);color:#c9c9c9;padding:14px 44px;display:flex;justify-content:space-between;align-items:center;font-size:9px;letter-spacing:.6px;}
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
    <div class="campo"><div class="label">Emissão</div><div class="valor">01/07/2026</div></div>
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
        <div class="num">${brl(valorFaturar)}</div>
      </div>
    </div>
  </div>

  <div class="nota">
    Relatório das vendas conduzidas pela equipe da Bula Assessoria no ${rep.titulo} (${rep.vendedor}, ${rep.data}).
    Valores em reais (BRL). Prazo de pagamento dos animais conforme condição do leilão (parcela × prazo).
  </div>

  <div class="footer">
    <div><strong>Bula Assessoria Pecuária</strong></div>
    <div>Documento emitido em 01/07/2026</div>
  </div>
</body></html>`
}

const browser = await chromium.launch()
for (const rep of [JACAMIM, CAMPARINO]) {
  const html = render(rep)
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  const out = join(OUT_DIR, rep.arquivo)
  await page.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
  if (process.env.PREVIEW) {
    await page.setViewportSize({ width: 794, height: 1123 })
    await page.screenshot({ path: join(process.env.PREVIEW, rep.arquivo.replace('.pdf', '.png')), fullPage: true })
  }
  await page.close()
  console.log('PDF gerado:', out)
}
await browser.close()
console.log('\nConcluído — 2 relatórios corrigidos em:', OUT_DIR)
