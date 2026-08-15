// Panorama das campanhas ATIVAS no Meta Ads — configuracao + desempenho.
//
// FONTE: Meta Marketing API (somente leitura) via MCP meta-ads, conta
// 2705134163151418, janela `last_7d` (08 a 14/08/2026), puxada em 15/08/2026.
// Campos de segmentacao vem do struct `targeting` do nivel de conjunto.
// Confere: a soma dos anuncios bate com o total do conjunto nos 4 conjuntos.
//
// Saida: PDF + XLSX na area de trabalho. Identidade preto e branco do brandbook.
//
// Uso: node scripts/relatorio-campanhas-meta-2026-08-15.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const OUT_DIR = join('C:/Users/Notebook-Acer/Desktop', 'Campanhas Meta - 15-08-2026')
mkdirSync(OUT_DIR, { recursive: true })

const LOGO = `data:image/png;base64,${readFileSync(join(root, 'public', 'logo-bula-assessoria-white.png')).toString('base64')}`
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = (n) => Number(n || 0).toLocaleString('pt-BR')
const pct = (n) => `${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

const PERIODO = '08 a 14/08/2026 (últimos 7 dias)'
const EMISSAO = '15/08/2026'
const INTERESSES = 'Agronegócio · Leilão · Pecuária · Genética · Fazenda · Gado'
const EXCLUIDOS = 'Amapá · Rio Grande do Sul · Santa Catarina'

const CAMPANHAS = [
  { id: '120249455058620708', nome: 'LEAD - PERPETUO TOURO', status: 'ATIVA', impr: 57562, gasto: 1081.68, resultado: '2 MQL touros + 1 lead de formulário' },
  { id: '120249845218920708', nome: 'LEADS - PERPETUO FEMEAS', status: 'ATIVA', impr: 36068, gasto: 665.47, resultado: '8 MQL fêmeas' },
]

const CONJUNTOS = [
  {
    id: '120249455058630708', nome: 'CA - PERPETUO TOURO WEB', campanha: 'LEAD - PERPETUO TOURO',
    orc: 50, otim: 'Conversões (pixel)', inicio: '24/07/2026',
    idade: '20 a 65', genero: 'Todos', geo: `Brasil, menos ${EXCLUIDOS}`, interesses: INTERESSES,
    plataformas: 'Facebook · Instagram · Audience Network · Messenger · Threads', advantage: 'Ligado',
    impr: 54378, gasto: 960.85, alcance: 32405, freq: 1.678, cliques: 799, ctr: 1.47, cpm: 17.67, cpc: 1.20,
    lpv: 401, resultados: 2, rotulo: 'MQL Perpetuo Touros', cpr: 480.43,
  },
  {
    id: '120249896940670708', nome: 'CA - PERPETUO TOURO FORMS INSTA', campanha: 'LEAD - PERPETUO TOURO',
    orc: 50, otim: 'Leads (formulário)', inicio: '13/08/2026',
    idade: '20 a 65', genero: 'Todos', geo: `Brasil, menos ${EXCLUIDOS}`, interesses: INTERESSES,
    plataformas: 'Facebook · Instagram · Audience Network', advantage: 'Ligado',
    impr: 3184, gasto: 120.83, alcance: 2135, freq: 1.491, cliques: 36, ctr: 1.13, cpm: 37.95, cpc: 3.36,
    lpv: null, resultados: 1, rotulo: 'Lead de formulário', cpr: 120.83,
  },
  {
    id: '120249845218900708', nome: 'CA - PERPETUO FEMEAS web', campanha: 'LEADS - PERPETUO FEMEAS',
    orc: 100, otim: 'Conversões (pixel)', inicio: '11/08/2026',
    idade: '20 a 65', genero: 'Todos', geo: `Brasil, menos ${EXCLUIDOS}`, interesses: INTERESSES,
    plataformas: 'Facebook · Instagram · Audience Network · Messenger · Threads', advantage: 'Ligado',
    impr: 16307, gasto: 333.64, alcance: 9335, freq: 1.747, cliques: 326, ctr: 2.00, cpm: 20.46, cpc: 1.02,
    lpv: 169, resultados: 3, rotulo: 'MQL-FEMEAS', cpr: 111.21,
  },
  {
    id: '120249847690280708', nome: 'CA - PERPETUO-FEMEAS web videos', campanha: 'LEADS - PERPETUO FEMEAS',
    orc: 100, otim: 'Conversões (pixel)', inicio: '11/08/2026',
    idade: '18 a 65', genero: 'Todos (com expansão de idade e gênero)', geo: 'Brasil inteiro — sem exclusão',
    interesses: 'NENHUM — público aberto',
    plataformas: 'Facebook · Instagram · Audience Network · Messenger · Threads', advantage: 'Ligado',
    impr: 19763, gasto: 331.83, alcance: 11782, freq: 1.677, cliques: 334, ctr: 1.69, cpm: 16.79, cpc: 0.99,
    lpv: 160, resultados: 5, rotulo: 'MQL-FEMEAS', cpr: 66.37,
  },
]

const ANUNCIOS = [
  { conj: 'CA - PERPETUO TOURO WEB', nome: 'estatico-perpetuo-touros02', id: '120249869085580708', status: 'ATIVO', criado: '12/08', impr: 25912, gasto: 430.44, cliques: 437, ctr: 1.69, cpm: 16.61, lpv: 216, res: 0, cpr: null, alerta: 'Destino: landing de FÊMEAS' },
  { conj: 'CA - PERPETUO TOURO WEB', nome: 'estatico-stories-perpetuo-touros01', id: '120249868992230708', status: 'ATIVO', criado: '12/08', impr: 745, gasto: 16.48, cliques: 5, ctr: 0.67, cpm: 22.12, lpv: 2, res: 0, cpr: null, alerta: '' },
  { conj: 'CA - PERPETUO TOURO WEB', nome: 'video-perpetuo-touro02', id: '120249459252350708', status: 'PAUSADO 12/08', criado: '24/07', impr: 27528, gasto: 507.46, cliques: 353, ctr: 1.28, cpm: 18.43, lpv: 182, res: 2, cpr: 253.73, alerta: 'Único que gerou MQL de touros' },
  { conj: 'CA - PERPETUO TOURO WEB', nome: 'video-perpetuo-touro01', id: '120249455058610708', status: 'PAUSADO 12/08', criado: '24/07', impr: 193, gasto: 6.47, cliques: 4, ctr: 2.07, cpm: 33.52, lpv: 1, res: 0, cpr: null, alerta: '' },
  { conj: 'CA - PERPETUO TOURO WEB', nome: 'video-perpetuo-touro03', id: '120249459272440708', status: 'PAUSADO', criado: '24/07', impr: 0, gasto: 0, cliques: 0, ctr: null, cpm: null, lpv: 0, res: 0, cpr: null, alerta: 'Nunca rodou' },
  { conj: 'CA - PERPETUO TOURO FORMS INSTA', nome: 'estatico-stories-perpetuo-touros01', id: '120249896940710708', status: 'ATIVO', criado: '13/08', impr: 1658, gasto: 63.36, cliques: 17, ctr: 1.03, cpm: 38.21, lpv: null, res: 1, cpr: 63.36, alerta: '' },
  { conj: 'CA - PERPETUO TOURO FORMS INSTA', nome: 'estatico-perpetuo-touros02', id: '120249896940660708', status: 'ATIVO', criado: '13/08', impr: 1526, gasto: 57.47, cliques: 19, ctr: 1.25, cpm: 37.66, lpv: null, res: 0, cpr: null, alerta: '' },
  { conj: 'CA - PERPETUO TOURO FORMS INSTA', nome: 'video-perpetuo-touro01/02/03', id: '3 anúncios', status: 'PAUSADOS', criado: '13/08', impr: 0, gasto: 0, cliques: 0, ctr: null, cpm: null, lpv: 0, res: 0, cpr: null, alerta: 'Nunca rodaram' },
  { conj: 'CA - PERPETUO FEMEAS web', nome: 'estatico-perpetuo-femeas01', id: '120249845218910708', status: 'ATIVO', criado: '11/08', impr: 12076, gasto: 255.14, cliques: 262, ctr: 2.17, cpm: 21.13, lpv: 141, res: 3, cpr: 85.05, alerta: '' },
  { conj: 'CA - PERPETUO FEMEAS web', nome: 'estatico-perpetuo-femeas02', id: '120249845392970708', status: 'ATIVO', criado: '11/08', impr: 2989, gasto: 59.85, cliques: 45, ctr: 1.51, cpm: 20.02, lpv: 19, res: 0, cpr: null, alerta: '' },
  { conj: 'CA - PERPETUO FEMEAS web', nome: 'estatico-perpetuo-femeas03', id: '120249845409110708', status: 'ATIVO', criado: '11/08', impr: 1242, gasto: 18.65, cliques: 19, ctr: 1.53, cpm: 15.02, lpv: 9, res: 0, cpr: null, alerta: '' },
  { conj: 'CA - PERPETUO-FEMEAS web videos', nome: 'video-femeas-perpetuo01', id: '120249847690290708', status: 'ATIVO', criado: '11/08', impr: 18326, gasto: 302.64, cliques: 313, ctr: 1.71, cpm: 16.51, lpv: 149, res: 5, cpr: 60.53, alerta: 'Melhor custo por resultado da conta' },
  { conj: 'CA - PERPETUO-FEMEAS web videos', nome: 'video-femeas-perpetuo02', id: '120249896903140708', status: 'ATIVO', criado: '13/08', impr: 1437, gasto: 29.19, cliques: 21, ctr: 1.46, cpm: 20.31, lpv: 11, res: 0, cpr: null, alerta: '' },
]

const ACHADOS = [
  {
    t: 'O anúncio que mais gasta na campanha de touros manda pra landing de fêmeas',
    v: 'R$ 430,44',
    d: 'O <b>estatico-perpetuo-touros02</b> (criado 12/08) consumiu R$ 430,44 e levou <b>216 visitas</b> à página — mas à página de fêmeas. Como o pixel "MQL Perpetuo Touros" mora na landing de touros, ele nunca dispara: <b>zero resultado</b> em 7 dias. É também a razão de a aba TOUROS da planilha estar parada desde 12/08.',
  },
  {
    t: 'Os únicos 2 MQL de touros do período vieram de um anúncio pausado',
    v: 'R$ 253,73 cada',
    d: 'O <b>video-perpetuo-touro02</b> rodava desde 24/07, gerou os 2 MQL e foi pausado em 12/08 às 12:48. Os anúncios que entraram no lugar somam R$ 446,92 gastos e nenhum resultado.',
  },
  {
    t: 'O conjunto mais barato é o menos segmentado',
    v: 'R$ 66,37 × R$ 111,21',
    d: 'O <b>FEMEAS web videos</b> não usa interesse nenhum, aceita 18 a 65 anos e o Brasil inteiro: R$ 66,37 por MQL, CPM de R$ 16,79. O <b>FEMEAS web</b>, com os 6 interesses, 20 a 65 e três estados excluídos, sai por R$ 111,21 — <b>67% mais caro</b>. Mesma oferta, mesma página, mesmo período. A segmentação por interesse está custando dinheiro.',
  },
  {
    t: 'Três dos quatro conjuntos excluem o Sul',
    v: 'AP · RS · SC',
    d: 'A exclusão de Amapá, Rio Grande do Sul e Santa Catarina está em todos os conjuntos menos o de vídeos de fêmeas. Vale conferir se é proposital — a Bula tem assessor de carteira cobrindo Centro-Oeste e Sul.',
  },
  {
    t: 'O público Advantage+ está ligado nos quatro conjuntos',
    v: 'expansion_all',
    d: 'Com <i>Advantage+ audience</i> ativo, o Meta pode ir além dos interesses e das exclusões configuradas. Na prática as segmentações acima são um ponto de partida, não uma cerca — o que ajuda a explicar por que o conjunto sem interesse nenhum performa melhor.',
  },
  {
    t: 'Frequência saudável em todos os conjuntos',
    v: '1,49 a 1,75',
    d: 'Ninguém está sendo bombardeado; não há sinal de fadiga de criativo no período. O problema da campanha de touros é de destino e de criativo ativo, não de saturação.',
  },
]

const TOT_GASTO = CAMPANHAS.reduce((s, c) => s + c.gasto, 0)
const TOT_IMPR = CAMPANHAS.reduce((s, c) => s + c.impr, 0)
const TOT_ORC = CONJUNTOS.reduce((s, c) => s + c.orc, 0)
const TOT_RES = CONJUNTOS.reduce((s, c) => s + c.resultados, 0)

const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Panorama de Campanhas — Meta Ads</title>
<style>
  :root{--preto:#111;--preto-puro:#000;--grafite:#2b2b2b;--cinza:#6b6b6b;--cinza-claro:#f4f3f1;--linha:#dcdad4;--ouro:#C9A84C;}
  *{margin:0;padding:0;box-sizing:border-box;}
  @page{size:A4;margin:0;}
  body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;font-size:10.5px;}
  .header{background:var(--preto-puro);color:#fff;padding:28px 40px 24px;display:flex;justify-content:space-between;align-items:center;}
  .header h1{font-size:20px;font-weight:700;letter-spacing:.3px;margin-bottom:5px;}
  .header .sub{font-size:10.5px;color:#c9c9c9;letter-spacing:1.5px;text-transform:uppercase;}
  .header img{height:44px;display:block;}
  .faixa{background:var(--cinza);height:4px;}
  .cliente{display:flex;justify-content:space-between;padding:15px 40px;background:var(--cinza-claro);border-bottom:1px solid var(--linha);}
  .cliente .label{font-size:8px;text-transform:uppercase;letter-spacing:1.1px;color:var(--cinza);margin-bottom:3px;}
  .cliente .valor{font-size:12px;font-weight:600;color:var(--preto);}
  .secao{padding:18px 40px 0;}
  .secao h2{font-size:12.5px;color:var(--preto);text-transform:uppercase;letter-spacing:1.3px;border-bottom:2px solid var(--preto);padding-bottom:5px;margin-bottom:12px;}
  .resumo{display:flex;gap:12px;margin-bottom:14px;}
  .card{flex:1;border:1px solid var(--linha);border-top:3px solid var(--cinza);border-radius:8px;padding:10px 11px 8px;text-align:center;}
  .card.destaque{border-top-color:var(--preto-puro);background:var(--cinza-claro);}
  .card .num{font-size:17px;font-weight:700;color:var(--preto);margin-bottom:2px;}
  .card .desc{font-size:8px;text-transform:uppercase;letter-spacing:.9px;color:var(--cinza);}
  table{width:100%;border-collapse:collapse;}
  thead th{background:var(--preto);color:#fff;font-size:8.2px;text-transform:uppercase;letter-spacing:.6px;padding:7px 7px;text-align:left;}
  thead th.right,td.right{text-align:right;}
  td.right{white-space:nowrap;}
  tbody td{padding:6px 7px;border-bottom:1px solid var(--linha);font-size:9.6px;vertical-align:top;}
  td.b{font-weight:700;color:var(--preto);}
  tr{page-break-inside:avoid;}
  tr.tot td{background:var(--preto-puro);color:#fff;font-weight:700;font-size:11px;padding:9px 7px;}
  tr.tot td.right{white-space:nowrap;}
  .pausado{color:#999;}
  .flag{display:inline-block;background:var(--preto);color:#fff;font-size:7.4px;padding:1px 5px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;}
  .conf{border:1px solid var(--linha);border-radius:8px;padding:11px 13px;margin-bottom:9px;page-break-inside:avoid;}
  .conf .top{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--linha);padding-bottom:6px;margin-bottom:8px;}
  .conf .nome{font-size:11.5px;font-weight:700;color:var(--preto);}
  .conf .camp{font-size:8.6px;color:var(--cinza);text-transform:uppercase;letter-spacing:.8px;}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px 12px;}
  .grid .k{font-size:7.6px;text-transform:uppercase;letter-spacing:.8px;color:var(--cinza);margin-bottom:1px;}
  .grid .v{font-size:9.6px;color:var(--preto);}
  .grid .wide{grid-column:span 2;}
  .achado{border-left:3px solid var(--preto);background:var(--cinza-claro);padding:8px 12px;margin:7px 0;page-break-inside:avoid;}
  .achado .v{float:right;font-weight:700;font-size:11px;color:var(--preto);margin-left:12px;}
  .achado .t{font-weight:700;font-size:10.2px;margin-bottom:3px;}
  .achado .d{font-size:9.2px;color:#444;line-height:1.55;}
  .nota{margin:14px 40px 0;font-size:8.6px;color:var(--cinza);line-height:1.55;border-top:1px solid var(--linha);padding-top:8px;}
  .footer{margin-top:20px;background:var(--preto-puro);color:#c9c9c9;padding:12px 40px;display:flex;justify-content:space-between;font-size:8.6px;letter-spacing:.5px;}
  .footer strong{color:#fff;}
</style></head><body>

  <div class="header">
    <div><h1>Panorama de Campanhas — Meta Ads</h1><div class="sub">Bula Assessoria · ${PERIODO}</div></div>
    <img src="${LOGO}" alt="Bula Assessoria">
  </div>
  <div class="faixa"></div>

  <div class="cliente">
    <div><div class="label">Conta</div><div class="valor">2705134163151418</div></div>
    <div><div class="label">Campanhas ativas</div><div class="valor">2</div></div>
    <div><div class="label">Conjuntos ativos</div><div class="valor">4</div></div>
    <div><div class="label">Orçamento diário</div><div class="valor">${brl(TOT_ORC)}</div></div>
    <div><div class="label">Emissão</div><div class="valor">${EMISSAO}</div></div>
  </div>

  <div class="secao">
    <h2>Resumo do período</h2>
    <div class="resumo">
      <div class="card"><div class="num">${num(TOT_IMPR)}</div><div class="desc">Impressões</div></div>
      <div class="card"><div class="num">${brl(TOT_GASTO)}</div><div class="desc">Investido em 7 dias</div></div>
      <div class="card"><div class="num">${TOT_RES}</div><div class="desc">Resultados</div></div>
      <div class="card destaque"><div class="num">${brl(TOT_GASTO / TOT_RES)}</div><div class="desc">Custo médio por resultado</div></div>
    </div>

    <table>
      <thead><tr>
        <th>Campanha</th><th>Status</th><th class="right">Impressões</th><th class="right">Investido</th><th>Resultado no período</th>
      </tr></thead>
      <tbody>
        ${CAMPANHAS.map(c => `<tr>
          <td class="b">${c.nome}</td><td><span class="flag">${c.status}</span></td>
          <td class="right">${num(c.impr)}</td><td class="right">${brl(c.gasto)}</td><td>${c.resultado}</td>
        </tr>`).join('')}
        <tr class="tot"><td colspan="2">TOTAL</td><td class="right">${num(TOT_IMPR)}</td><td class="right">${brl(TOT_GASTO)}</td><td></td></tr>
      </tbody>
    </table>
  </div>

  <div class="secao">
    <h2>Configuração de cada conjunto</h2>
    ${CONJUNTOS.map(c => `
    <div class="conf">
      <div class="top">
        <div><div class="nome">${c.nome}</div><div class="camp">${c.campanha}</div></div>
        <div style="text-align:right"><div class="nome">${brl(c.orc)}/dia</div><div class="camp">no ar desde ${c.inicio}</div></div>
      </div>
      <div class="grid">
        <div><div class="k">Idade</div><div class="v">${c.idade}</div></div>
        <div><div class="k">Gênero</div><div class="v">${c.genero}</div></div>
        <div class="wide"><div class="k">Localização</div><div class="v">${c.geo}</div></div>
        <div class="wide"><div class="k">Interesses</div><div class="v">${c.interesses}</div></div>
        <div><div class="k">Otimização</div><div class="v">${c.otim}</div></div>
        <div><div class="k">Público Advantage+</div><div class="v">${c.advantage}</div></div>
        <div class="wide" style="grid-column:span 4"><div class="k">Posicionamentos</div><div class="v">${c.plataformas}</div></div>
      </div>
    </div>`).join('')}
  </div>

  <div class="secao">
    <h2>Desempenho por conjunto</h2>
    <table>
      <thead><tr>
        <th>Conjunto</th><th class="right">Impr.</th><th class="right">Alcance</th><th class="right">Freq.</th>
        <th class="right">Cliques</th><th class="right">CTR</th><th class="right">CPM</th><th class="right">Visitas</th>
        <th class="right">Investido</th><th class="right">Result.</th><th class="right">Custo/result.</th>
      </tr></thead>
      <tbody>
        ${CONJUNTOS.map(c => `<tr>
          <td class="b">${c.nome}</td>
          <td class="right">${num(c.impr)}</td><td class="right">${num(c.alcance)}</td>
          <td class="right">${c.freq.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="right">${num(c.cliques)}</td><td class="right">${pct(c.ctr)}</td><td class="right">${brl(c.cpm)}</td>
          <td class="right">${c.lpv == null ? '—' : num(c.lpv)}</td>
          <td class="right">${brl(c.gasto)}</td><td class="right">${c.resultados}</td>
          <td class="right b">${brl(c.cpr)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="font-size:8.6px;color:#6b6b6b;margin-top:6px">
      "Result." é o evento de otimização de cada conjunto: <b>MQL Perpetuo Touros</b> e <b>MQL-FEMEAS</b> (pixel na landing)
      nos conjuntos de conversão, e <b>lead de formulário</b> no conjunto de Instagram. Os conjuntos de fêmeas subiram em
      11/08, então cobrem ~4 dos 7 dias da janela.
    </div>
  </div>

  <div class="secao">
    <h2>Anúncios</h2>
    <table>
      <thead><tr>
        <th>Conjunto</th><th>Anúncio</th><th>Status</th><th class="right">Impr.</th><th class="right">CTR</th>
        <th class="right">CPM</th><th class="right">Visitas</th><th class="right">Investido</th>
        <th class="right">Result.</th><th>Observação</th>
      </tr></thead>
      <tbody>
        ${ANUNCIOS.map(a => `<tr class="${a.status.startsWith('PAUSAD') ? 'pausado' : ''}">
          <td>${a.conj}</td><td class="b">${a.nome}</td><td>${a.status}</td>
          <td class="right">${num(a.impr)}</td>
          <td class="right">${a.ctr == null ? '—' : pct(a.ctr)}</td>
          <td class="right">${a.cpm == null ? '—' : brl(a.cpm)}</td>
          <td class="right">${a.lpv == null ? '—' : num(a.lpv)}</td>
          <td class="right">${brl(a.gasto)}</td>
          <td class="right b">${a.res}</td>
          <td>${a.alerta ? `<b>${a.alerta}</b>` : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="secao">
    <h2>O que salta aos olhos</h2>
    ${ACHADOS.map(a => `<div class="achado"><span class="v">${a.v}</span><div class="t">${a.t}</div><div class="d">${a.d}</div></div>`).join('')}
  </div>

  <div class="nota">
    <b>Fonte:</b> Meta Marketing API (leitura), conta 2705134163151418, janela <i>last_7d</i> = ${PERIODO}, extraída em ${EMISSAO}.
    A segmentação vem do campo <i>targeting</i> de cada conjunto. A soma dos anúncios reconcilia com o total do conjunto nos quatro casos.
    <br><b>Duas ressalvas de leitura:</b> (1) nos três conjuntos com faixa "20 a 65", o Meta devolve também um campo <i>age_range</i> de 30 a 65 —
    vale conferir na interface qual está valendo na entrega; (2) com o público Advantage+ ligado, interesses e exclusões de estado são
    sugestões que o Meta pode ultrapassar, não limites rígidos.
  </div>

  <div class="footer">
    <div><strong>Bula Assessoria Pecuária</strong> — documento interno</div>
    <div>Emitido em ${EMISSAO}</div>
  </div>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
const pdfPath = join(OUT_DIR, 'Panorama-Campanhas-Meta-15-08-2026.pdf')
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
if (process.env.PREVIEW) {
  await page.setViewportSize({ width: 794, height: 1123 })
  await page.screenshot({ path: join(process.env.PREVIEW, 'campanhas-preview.png'), fullPage: true })
}
await page.close()
await browser.close()
console.log('PDF  ->', pdfPath)

mkdirSync(join(root, 'outputs'), { recursive: true })
writeFileSync(join(root, 'outputs', 'relatorio-campanhas-meta-2026-08-15.html'), html, 'utf-8')

// ─── XLSX ────────────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new()

const wsC = XLSX.utils.aoa_to_sheet([
  ['Campanha', 'ID', 'Status', 'Impressões', 'Investido (R$)', 'Resultado no período'],
  ...CAMPANHAS.map(c => [c.nome, c.id, c.status, c.impr, c.gasto, c.resultado]),
  ['TOTAL', '', '', TOT_IMPR, TOT_GASTO, ''],
])
wsC['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 9 }, { wch: 13 }, { wch: 15 }, { wch: 36 }]
XLSX.utils.book_append_sheet(wb, wsC, 'Campanhas')

const wsS = XLSX.utils.aoa_to_sheet([
  ['Conjunto', 'ID', 'Campanha', 'Orçamento/dia (R$)', 'Otimização', 'No ar desde', 'Idade', 'Gênero',
    'Localização', 'Interesses', 'Advantage+', 'Posicionamentos',
    'Impressões', 'Alcance', 'Frequência', 'Cliques', 'CTR (%)', 'CPM (R$)', 'CPC (R$)', 'Visitas à página',
    'Investido (R$)', 'Resultados', 'Evento', 'Custo/resultado (R$)'],
  ...CONJUNTOS.map(c => [c.nome, c.id, c.campanha, c.orc, c.otim, c.inicio, c.idade, c.genero, c.geo,
    c.interesses, c.advantage, c.plataformas, c.impr, c.alcance, c.freq, c.cliques, c.ctr, c.cpm, c.cpc,
    c.lpv, c.gasto, c.resultados, c.rotulo, c.cpr]),
])
wsS['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 26 }, { wch: 17 }, { wch: 19 }, { wch: 12 }, { wch: 10 }, { wch: 30 },
{ wch: 44 }, { wch: 52 }, { wch: 11 }, { wch: 56 }, { wch: 12 }, { wch: 10 }, { wch: 11 }, { wch: 9 },
{ wch: 9 }, { wch: 10 }, { wch: 9 }, { wch: 16 }, { wch: 14 }, { wch: 11 }, { wch: 22 }, { wch: 19 }]
XLSX.utils.book_append_sheet(wb, wsS, 'Conjuntos')

const wsA = XLSX.utils.aoa_to_sheet([
  ['Conjunto', 'Anúncio', 'ID', 'Status', 'Criado', 'Impressões', 'Cliques', 'CTR (%)', 'CPM (R$)',
    'Visitas à página', 'Investido (R$)', 'Resultados', 'Custo/resultado (R$)', 'Observação'],
  ...ANUNCIOS.map(a => [a.conj, a.nome, a.id, a.status, a.criado, a.impr, a.cliques, a.ctr, a.cpm, a.lpv,
    a.gasto, a.res, a.cpr, a.alerta]),
])
wsA['!cols'] = [{ wch: 32 }, { wch: 34 }, { wch: 20 }, { wch: 15 }, { wch: 9 }, { wch: 12 }, { wch: 9 },
{ wch: 9 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 11 }, { wch: 19 }, { wch: 38 }]
XLSX.utils.book_append_sheet(wb, wsA, 'Anuncios')

const wsF = XLSX.utils.aoa_to_sheet([
  ['Achado', 'Número', 'Detalhe'],
  ...ACHADOS.map(a => [a.t, a.v, a.d.replace(/<[^>]+>/g, '')]),
])
wsF['!cols'] = [{ wch: 58 }, { wch: 20 }, { wch: 120 }]
XLSX.utils.book_append_sheet(wb, wsF, 'Achados')

const xlsxPath = join(OUT_DIR, 'Panorama-Campanhas-Meta-15-08-2026.xlsx')
XLSX.writeFile(wb, xlsxPath)
console.log('XLSX ->', xlsxPath)
console.log(`\n2 campanhas ativas · 4 conjuntos · ${brl(TOT_ORC)}/dia · ${brl(TOT_GASTO)} em 7 dias · ${TOT_RES} resultados`)
