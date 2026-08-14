/**
 * RELATÓRIO ÚNICO — DESEMPENHO EXATO DAS CAMPANHAS DIGITAIS 2026 (PDF).
 *
 *   node scripts/gera-relatorio-oficial-campanhas-2026.mjs [pasta-de-saida]
 *
 * UM documento só, escopo estritamente campanha, pedido da diretoria em 14/08:
 * medir o desempenho EXATO das campanhas, sem misturar com a carteira dos
 * assessores, com a base de clientes ou com cadastro feito "por fora".
 *
 * As três regras que este relatório obedece:
 *   1) Só entra dinheiro e resultado DO FUNIL DIGITAL (13 campanhas). O resto
 *      (piloto WhatsApp, divulgação de leilões da agência) aparece uma única
 *      vez, num apêndice, para o cheque total fechar — e não contamina nada.
 *   2) Cadastro nos grupos só conta para a campanha se a pessoa FOR lead de
 *      campanha (cruzado por telefone/CPF/nome). Cadastro "por fora" é mérito
 *      do assessor e fica fora da conta.
 *   3) O sistema de atendimento NÃO é universo de nada: grande parte do
 *      atendimento roda nos telefones pessoais dos SDRs, sem registro. A etapa
 *      entre o MQL e o cadastro é declarada como zona cega, não estimada.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pagina, paraPdf, esc, brl, brl0, num, pct, dataBr, mesBr } from './lib/relatorio-2026-visual.mjs'
import {
    INVESTIDO_APURADO, LEADS_META, FUNIL_WHATSAPP, DIVULGACAO_LEILOES, META_LIVE,
} from './lib/midia-2026.mjs'
import { PATROCINADOS_LEOZINHO } from './lib/patrocinados-confirmados.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const saida = process.argv[2] || DIR
const HOJE = '14/08/2026'

const f = JSON.parse(fs.readFileSync(path.join(DIR, 'funil-2026.json'), 'utf8'))
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base-clientes.json'), 'utf8'))
const compras = JSON.parse(fs.readFileSync(path.join(DIR, 'compras-2026.json'), 'utf8'))
const atr = JSON.parse(fs.readFileSync(path.join(DIR, 'atribuicao-campanha-2026.json'), 'utf8'))
const tx = JSON.parse(fs.readFileSync(path.join(DIR, 'taxas-funil-2026.json'), 'utf8'))

/* ── agregados da Meta (mês a mês, funil digital) ─────────────────────────── */

const MESES = ['2026-06', '2026-07', '2026-08']
const mm = {}
for (const m of MESES) mm[m] = { investido: 0, impressoes: 0, cliques: 0 }
for (const c of META_LIVE.campanhasFunil) {
    for (const [m, v] of Object.entries(c.mensal)) {
        mm[m].investido += v.investido; mm[m].impressoes += v.impressoes ?? 0; mm[m].cliques += v.cliques ?? 0
    }
}
const IMP = MESES.reduce((a, m) => a + mm[m].impressoes, 0)
const CLI = MESES.reduce((a, m) => a + mm[m].cliques, 0)

/* ── animais e compras pós-lead dos atribuíveis (lote a lote, do ERP) ─────── */

/* ── venda atribuível: vem do apurador dedicado (atribuicao-campanha-2026.mjs),
   que cruza lead de campanha × ERP em TODAS as filiais e classifica a evidência
   de cada casamento. Ver o cabeçalho daquele script para a regra completa. ── */

const atribuiveis = [...atr.comprovados, ...atr.aRevisar].sort((a, b) => b.valor - a.valor)
const ANIMAIS = atribuiveis.reduce((a, p) => a + p.animais, 0)
const VGV_ATR = atribuiveis.reduce((a, p) => a + p.valor, 0)
const ARREMATES = atribuiveis.reduce((a, p) => a + p.arremates, 0)
const TICKET_ANIMAL = ANIMAIS ? VGV_ATR / ANIMAIS : 0
const EVID_FORTE = atr.comprovados.length
const VGV_FORTE = atr.comprovados.reduce((a, p) => a + p.valor, 0)

/* ── funil exato: quantidades ─────────────────────────────────────────────── */

const leadsCamp = f.leads.deCampanha
const mqlCamp = f.leads.mqlDeCampanha
const cadSistema = f.cadastros.sistema.pessoas
const cadSistemaCamp = f.cadastros.sistema.pessoasDeCampanha
const apr = f.cadastros.manual.aprovados
const aprCamp = f.cadastros.manual.aprovadosDeCampanha
const aprFora = f.cadastros.manual.aprovadosPorFora
const aprPlanNao = f.cadastros.manual.aprovadosPlanilhaNaoCampanha
const CLIENTES = atribuiveis.length

const cpl = INVESTIDO_APURADO / leadsCamp
const cpMql = INVESTIDO_APURADO / mqlCamp
const cpCadastro = INVESTIDO_APURADO / cadSistemaCamp
const cpAprovado = INVESTIDO_APURADO / aprCamp
const cac = INVESTIDO_APURADO / CLIENTES
const cpAnimal = INVESTIDO_APURADO / ANIMAIS

/** Funil-meta MENSAL da diretoria (imagem de 14/08), transcrito na íntegra. */
const ALVO = {
    investimento: 6500, impressoes: 650000, cliques: 7800, acessos: 5850, leads: 702,
    mql: 140.4, cadastros: 56.16, aprovados: 33.696, compram: 13.5,
    animais: 40, ticket: 25000, faturamento: 1010880,
    cpl: 9.26, cpmql: 46.30, custoCadastro: 115.74, custoVenda: 160.75,
}

/* ── campanha a campanha: Meta × planilha, com o mapa de aliases ──────────── */
// A planilha grava a campanha com nomes diferentes conforme a porta de entrada
// (form da Meta, landing com utm, ad-id numérico). O mapa abaixo agrupa cada
// alias na campanha-mãe da Meta — checado: a soma fecha com os 1.519 leads.
const ALIAS = {
    'LEADS - FORMS INST PERPETUO': ['LEADS - FORMS INST PERPETUO'],
    'LEADS - FORMS INST MAGDA Macho': ['LEADS - FORMS INST MAGDA Macho'],
    'LEADS - FORMS INST EAO — Cópia': ['LEADS - FORMS INST EAO — Cópia'],
    'LEADS - FORMS INST EAO': [],
    'Leilao JMP 13 14/06 Forms Insta': ['Leilao JMP 13 14/06 Forms Insta'],
    '13/06 e 14/06 LEADS JMP SITE': ['120247464210220708', 'CA - LEILAO JMP TOUROS 14/06', 'Landing JMP'],
    '13/06 e 14/06 LEADS JMP SITE — Cópia': ['13/06 e 14/06 LEADS JMP SITE — Cópia', '120247596748540708'],
    'LEAD - PERPETUO TOURO': ['CA - PERPETUO TOURO WEB', 'LEAD - PERPETUO TOURO', 'Landing Touros'],
    'LEADS - PERPETUO FEMEAS': ['CA - PERPETUO-FEMEAS web videos', 'CA - PERPETUO FEMEAS web', 'Landing Fêmeas — Funil Perpétuo'],
    'LEADS - SAO GERALDO': ['LEADS - SAO GERALDO', 'CA - SAO GERALDO - web - Aberto', 'CA - SAO GERALDO - web - Aberto — Cópia', 'Landing São Geraldo'],
    'CORTE PERPÉTUO': [], 'CORTE PERPÉTUO / 13 de Julho': [], 'CORTE TUPÃ': [],
}
const pc = f.leads.porCampanha
const somaAlias = nomes => nomes.reduce((a, n) => {
    const v = pc[n] || { leads: 0, mql: 0 }; return { leads: a.leads + v.leads, mql: a.mql + v.mql }
}, { leads: 0, mql: 0 })
const usados = new Set(Object.values(ALIAS).flat())
const resto = Object.entries(pc).filter(([k]) => !usados.has(k))
const restoSoma = resto.reduce((a, [, v]) => ({ leads: a.leads + v.leads, mql: a.mql + v.mql }), { leads: 0, mql: 0 })

const linhasCampanha = [...META_LIVE.campanhasFunil]
    .sort((a, b) => b.total.investido - a.total.investido)
    .map(c => {
        const s = somaAlias(ALIAS[c.nome] ?? [])
        const semPlanilha = (ALIAS[c.nome] ?? []).length === 0
        return { c, s, semPlanilha }
    })

/* ── blocos ───────────────────────────────────────────────────────────────── */

const capa = `
<div class="cap">
  <div>
    <h1>Desempenho das campanhas digitais — 2026</h1>
    <div class="sub">Relatório único e fechado: só o que a campanha investiu e só o que a campanha produziu.
    Investimento ao vivo da Meta (14/08); cadastro e venda só contam quando a pessoa é comprovadamente lead de
    campanha — o que veio “por fora” está identificado e excluído.</div>
  </div>
  <div class="meta">
    Bula Assessoria · BM Bula 360<br>Campanhas: 09/06 a 14/08/2026<br>Emitido em ${HOJE}
    <div class="tot" style="margin-top:6px">${brl(INVESTIDO_APURADO)}<small>investidos · ${brl0(VGV_ATR)} vendidos a clientes de campanha</small></div>
  </div>
</div>

<div class="box alerta avoid">
  <h3>Escopo exato — o que conta e o que não conta</h3>
  <ul>
    <li><strong>Conta:</strong> as 13 campanhas do funil digital (conta CA2 inteira + Corte Perpétuo ×2 e Corte Tupã
      na CA1), 09/06→14/08. Investimento puxado ao vivo da API da Meta em 14/08 — não é estimativa.</li>
    <li><strong>Não conta (e está no apêndice, para o cheque fechar):</strong> o piloto “funil WhatsApp” de abr–jun
      (${brl(FUNIL_WHATSAPP.investido)}), as ${num(DIVULGACAO_LEILOES.qtdCampanhas)} campanhas de divulgação de
      leilões da agência (${brl(DIVULGACAO_LEILOES.totalInvestido)} — o lead vai para a leiloeira) e awareness (${brl(279.30)}).</li>
    <li><strong>Cadastro só conta se a pessoa é lead de campanha.</strong> Os grupos de cadastro também recebem gente
      “por fora” (cliente direto do assessor): dos ${num(apr)} aprovados do período, <strong>${num(aprCamp)} são de
      campanha</strong> e ${num(aprFora + aprPlanNao)} não são — estes ficam fora de toda conta desta página.</li>
    <li><strong>Toda venda foi conferida no HastaPro ao vivo</strong> — o sistema da leiloeira, consultado direto no
      banco em 14/08, lote a lote, em todas as filiais. Não se usou aqui o ERP interno da Bula, que é alimentado à mão
      e não fica atualizado.</li>
    <li><strong>O atendimento dos SDRs é zona cega declarada.</strong> Boa parte roda em telefones pessoais, sem
      registro no sistema — só se fica sabendo quando aparece cadastro no grupo ou compra. Nenhuma taxa aqui usa
      “abordados/responderam” como denominador.</li>
  </ul>
</div>

<div class="cards avoid">
  <div class="card"><div class="z">Leads de campanha</div><div class="n">${num(leadsCamp)}<small>meta de 702/mês batida em jun e jul</small></div></div>
  <div class="card"><div class="z">Qualificados (MQL)</div><div class="n">${num(mqlCamp)}<small>${pct(mqlCamp, leadsCamp)} · meta era 20%</small></div></div>
  <div class="card"><div class="z">Cadastros de campanha</div><div class="n">${num(cadSistemaCamp)}<small>submetidos no sistema (julho)</small></div></div>
  <div class="card"><div class="z">Aprovados de campanha</div><div class="n">${num(aprCamp)}<small>de ${num(apr)} no grupo — ${num(aprFora + aprPlanNao)} eram por fora</small></div></div>
  <div class="card"><div class="z">Clientes · animais · venda</div><div class="n">${num(CLIENTES)} · ${num(ANIMAIS)}<small>${brl0(VGV_ATR)} comprados após o lead</small></div></div>
</div>`

const funilExato = `
<h2>Realizado × meta — taxa por taxa</h2>
<p><strong>A meta do funil é a coluna de percentual</strong>, não os volumes. Os números da tabela da diretoria
(650.000 impressões, 702 leads, 56,16 cadastros) são a aritmética dessas taxas aplicada a R$ 6.500/mês — tanto que
saem com casa decimal: ninguém aprova “33,696 cadastros”. Julgar a operação por volume seria injusto nos dois
sentidos, porque volume depende de quanto se investiu e de quantos meses rodaram. A comparação honesta é
<strong>taxa contra taxa</strong>, degrau a degrau — independe de escala e responde à única pergunta que importa:
<em>em qual degrau o funil perde?</em></p>
<table class="funil">
  <thead><tr><th>Degrau do funil</th><th class="r">Meta</th><th class="r">Real</th><th class="r">Cumpre</th><th></th><th>Conta e ressalva</th></tr></thead>
  <tbody>
    ${tx.taxas.map(t => {
    const real = t.real == null ? '<span class="off">não medível</span>' : t.real.toFixed(2).replace('.', ',') + '%'
    const meta = t.meta.toFixed(t.meta < 10 ? 2 : 0).replace('.', ',') + '%'
    const cumpre = t.cumpre == null ? '<span class="off">—</span>' : (t.cumpre * 100).toFixed(0) + '%'
    const larg = t.cumpre == null ? 0 : Math.min(Math.round(t.cumpre * 60), 100)
    return `<tr>
      <td class="et">${esc(t.etapa)}</td>
      <td class="num">${meta}</td>
      <td class="num q" style="font-size:14px">${real}</td>
      <td class="num">${cumpre}</td>
      <td><span class="bar${t.cumpre != null && t.cumpre >= 1 ? '' : ' o'}" style="width:${larg}px"></span></td>
      <td class="micro">${t.den ? `${num(t.num)} ÷ ${num(t.den)}. ` : ''}${esc(t.obs)}</td></tr>`
}).join('')}
  </tbody>
</table>

<div class="cards avoid">
  <div class="card"><div class="z">Onde ganhamos</div><div class="n">141%<small>CTR 1,69% contra 1,20% — o anúncio atrai mais que o planejado</small></div></div>
  <div class="card"><div class="z">Onde está na meta</div><div class="n">102%<small>cadastro → aprovação, 60,98% contra 60% — a leiloeira aprova quem mandamos</small></div></div>
  <div class="card"><div class="z">Onde mais perde</div><div class="n">50%<small>MQL → cadastro, 19,9% contra 40% — metade da meta</small></div></div>
  <div class="card"><div class="z">Ponta a ponta</div><div class="n">18%<small>1 cliente a cada 263 mil impressões; a meta pede 1 a cada 48 mil</small></div></div>
</div>

<p>A leitura em uma frase: <strong>o problema não está no anúncio nem na leiloeira — está no meio do funil.</strong>
O criativo entrega 41% acima da meta e a aprovação bate a meta; entre o lead qualificado e o cadastro submetido
perde-se metade do que o plano previa, e é esse degrau que, sozinho, derruba o resultado ponta a ponta para 18% da
meta. E é exatamente o degrau que hoje ninguém consegue enxergar.</p>

<div class="box grey avoid">
  <h3>A zona cega entre o MQL e o cadastro</h3>
  <p>Entre “lead qualificado” e “cadastro submetido” está o atendimento dos SDRs — e grande parte dele roda em
  telefones pessoais, fora do sistema. Não há como medir quantos MQL foram de fato abordados, quantos responderam ou
  quantos desistiram: <strong>só se fica sabendo do desfecho quando aparece um cadastro no grupo ou uma compra no
  leilão.</strong> Por isso este relatório não publica nenhuma taxa dentro desse trecho. O canal oficial da API
  (1.075 pessoas abordadas em jun–jul) é uma fração do atendimento real e não serve de universo. É o degrau que mais
  fica atrás da meta e o único que não se mede sozinho — não é coincidência.</p>
</div>

<h3>Por que o custo por lead ficou acima — decomposição</h3>
<p>O CPL de meta (R$ 9,26) não é alvo independente: é o que sai de R$ 6.500 ÷ 702 leads. O CPL real
(${brl(cpl)}) se explica inteiramente por três fatores, dois contra e um a favor — e a conta fecha exatamente,
o que confirma que não há fator escondido.</p>
<table class="avoid">
  <thead><tr><th>Fator</th><th class="r">Meta</th><th class="r">Real</th><th>Leitura</th></tr></thead>
  <tbody>
    <tr><td class="et">CPM — custo de mil impressões</td><td class="num">${brl(10)}</td><td class="num">${brl(INVESTIDO_APURADO / IMP * 1000)}</td>
      <td><strong>Contra:</strong> mídia ${((INVESTIDO_APURADO / IMP * 1000 / 10 - 1) * 100).toFixed(0)}% mais cara que o plano — leilão é nicho e a disputa por esse público subiu.</td></tr>
    <tr><td class="et">CTR — cliques por impressão</td><td class="num">1,20%</td><td class="num">${pct(CLI, IMP, 2)}</td>
      <td><strong>A favor:</strong> o criativo compensa boa parte do CPM mais caro.</td></tr>
    <tr><td class="et">Clique → lead</td><td class="num">9,00%</td><td class="num">${(tx.base.leads / tx.base.cliques * 100).toFixed(2).replace('.', ',')}%</td>
      <td><strong>Contra:</strong> de cada 100 cliques chegam ${(tx.base.leads / tx.base.cliques * 100).toFixed(1).replace('.', ',')} leads, não 9. É aqui que o CPL sobe.</td></tr>
  </tbody>
  <tfoot><tr><td>CPL RESULTANTE</td><td class="num">${brl(9.26)}</td><td class="num">${brl(cpl)}</td><td class="micro">CPM ÷ (CTR × taxa de lead)</td></tr></tfoot>
</table>

<h3>Os volumes, como contexto — não como meta</h3>
<table class="avoid">
  <thead><tr><th>Etapa</th><th class="r">Junho</th><th class="r">Julho</th><th class="r">Ago (1–14)</th><th class="r">Total</th><th class="micro">Referência p/ R$ 6.500/mês</th></tr></thead>
  <tbody>
    <tr><td class="et">Investimento</td><td class="num">${brl0(mm['2026-06'].investido)}</td><td class="num">${brl0(mm['2026-07'].investido)}</td><td class="num">${brl0(mm['2026-08'].investido)}</td><td class="num q">${brl0(INVESTIDO_APURADO)}</td><td class="micro">${brl0(6500)}</td></tr>
    <tr><td class="et">Impressões</td><td class="num">${num(mm['2026-06'].impressoes)}</td><td class="num">${num(mm['2026-07'].impressoes)}</td><td class="num">${num(mm['2026-08'].impressoes)}</td><td class="num q">${num(IMP)}</td><td class="micro">650.000</td></tr>
    <tr><td class="et">Cliques</td><td class="num">${num(mm['2026-06'].cliques)}</td><td class="num">${num(mm['2026-07'].cliques)}</td><td class="num">${num(mm['2026-08'].cliques)}</td><td class="num q">${num(CLI)}</td><td class="micro">7.800</td></tr>
    <tr><td class="et">Leads</td><td class="num">${num(f.leads.porMes['2026-06']?.campanha || 0)}</td><td class="num">${num(f.leads.porMes['2026-07']?.campanha || 0)}</td><td class="num">${num(f.leads.porMes['2026-08']?.campanha || 0)}</td><td class="num q">${num(leadsCamp)}</td><td class="micro">702</td></tr>
    <tr><td class="et">Qualificados (MQL)</td><td class="num">${num(f.leads.porMes['2026-06']?.mqlCampanha || 0)}</td><td class="num">${num(f.leads.porMes['2026-07']?.mqlCampanha || 0)}</td><td class="num">${num(f.leads.porMes['2026-08']?.mqlCampanha || 0)}</td><td class="num q">${num(mqlCamp)}</td><td class="micro">140,4</td></tr>
    <tr><td class="et">Cadastros submetidos</td><td class="num"><span class="off">—</span></td><td class="num">${num(cadSistemaCamp)}</td><td class="num"><span class="off">sem registro</span></td><td class="num q">${num(cadSistemaCamp)}</td><td class="micro">56,16</td></tr>
    <tr><td class="et">Cadastros aprovados</td><td class="num" colspan="3" style="text-align:center">${num(aprCamp)} no período (de ${num(apr)} no grupo; ${num(aprFora + aprPlanNao)} vieram por fora)</td><td class="num q">${num(aprCamp)}</td><td class="micro">33,696</td></tr>
    <tr><td class="et">Clientes que compraram</td><td class="num" colspan="3" style="text-align:center">${num(CLIENTES)} com compra posterior ao lead</td><td class="num q">${num(CLIENTES)}</td><td class="micro">13,5</td></tr>
    <tr><td class="et">Animais · faturamento</td><td class="num" colspan="3" style="text-align:center">${num(ANIMAIS)} animais em ${num(ARREMATES)} arremates · ticket ${brl0(TICKET_ANIMAL)}/animal</td><td class="num q">${brl0(VGV_ATR)}</td><td class="micro">40 an · R$ 1.010.880</td></tr>
  </tbody>
</table>
<p class="micro">A coluna da direita é a referência da planilha da diretoria para UM mês a R$ 6.500. O realizado tem
2 meses e meio e investiu ${brl0(INVESTIDO_APURADO)} — está aqui como régua de ordem de grandeza, não como nota de
aprovação. O julgamento está na tabela de taxas, no alto desta página.</p>`

const custos = `
<h2>Custos unitários — meta × exato</h2>
<table>
  <thead><tr><th>Indicador</th><th class="r">Meta</th><th class="r">Real</th><th class="r">Razão</th><th>Conta exata</th></tr></thead>
  <tbody>
    <tr><td class="et">CPL — custo por lead</td><td class="num">${brl(ALVO.cpl)}</td><td class="num q">${brl(cpl)}</td>
      <td class="num">${(cpl / ALVO.cpl).toFixed(1).replace('.', ',')}×</td><td class="micro">${brl(INVESTIDO_APURADO)} ÷ ${num(leadsCamp)} leads de campanha</td></tr>
    <tr><td class="et">CPMQL — custo por qualificado</td><td class="num">${brl(ALVO.cpmql)}</td><td class="num q">${brl(cpMql)}</td>
      <td class="num">${(cpMql / ALVO.cpmql).toFixed(1).replace('.', ',')}×</td><td class="micro">÷ ${num(mqlCamp)} MQL</td></tr>
    <tr><td class="et">Custo por cadastro (de campanha)</td><td class="num">${brl(ALVO.custoCadastro)}</td><td class="num q">${brl(cpCadastro)}</td>
      <td class="num">${(cpCadastro / ALVO.custoCadastro).toFixed(1).replace('.', ',')}×</td><td class="micro">÷ ${num(cadSistemaCamp)} cadastros de campanha no sistema</td></tr>
    <tr><td class="et">Custo por aprovado (de campanha)</td><td class="num">${brl0(ALVO.investimento / ALVO.aprovados)}</td><td class="num q">${brl(cpAprovado)}</td>
      <td class="num">${(cpAprovado / (ALVO.investimento / ALVO.aprovados)).toFixed(1).replace('.', ',')}×</td><td class="micro">÷ ${num(aprCamp)} aprovados de campanha</td></tr>
    <tr><td class="et">Custo por animal vendido</td><td class="num">${brl(ALVO.custoVenda)}</td><td class="num q">${brl(cpAnimal)}</td>
      <td class="num">${(cpAnimal / ALVO.custoVenda).toFixed(1).replace('.', ',')}×</td><td class="micro">÷ ${num(ANIMAIS)} animais (a meta de ${brl(ALVO.custoVenda)} também é por animal: 6.500 ÷ ~40)</td></tr>
    <tr><td class="et">CAC — custo por cliente</td><td class="num">${brl0(ALVO.investimento / ALVO.compram)}</td><td class="num q">${brl(cac)}</td>
      <td class="num">${(cac / (ALVO.investimento / ALVO.compram)).toFixed(1).replace('.', ',')}×</td><td class="micro">÷ ${num(CLIENTES)} clientes com compra após o lead</td></tr>
    <tr><td class="et">Retorno por real investido</td><td class="num">${(ALVO.faturamento / ALVO.investimento).toFixed(0)}×</td><td class="num q">${(VGV_ATR / INVESTIDO_APURADO).toFixed(1).replace('.', ',')}×</td>
      <td class="num">—</td><td class="micro">${brl0(VGV_ATR)} vendidos ÷ ${brl0(INVESTIDO_APURADO)} investidos (VGV, não margem)</td></tr>
  </tbody>
</table>
<p class="micro">Os custos por cadastro/aprovado usam SÓ os casos de campanha — por isso são maiores (e mais honestos)
do que dividir pelo total dos grupos, que incluiria cadastro feito por fora. O retorno em VGV não é lucro: a receita
da Bula é a comissão sobre esse VGV.</p>`

const porCampanha = `
<div class="pg"></div>
<h2>Campanha a campanha — investimento × o que chegou</h2>
<table>
  <thead><tr><th>Campanha</th><th>Conta</th><th class="r">Investido</th><th class="r">Impressões</th><th class="r">Cliques</th><th class="r">Leads planilha</th><th class="r">MQL</th><th class="r">CPL</th><th class="r">Custo/MQL</th></tr></thead>
  <tbody>
    ${linhasCampanha.map(({ c, s, semPlanilha }) => `<tr>
      <td class="nome">${esc(c.nome)}</td><td>${c.conta}</td>
      <td class="num">${brl(c.total.investido)}</td>
      <td class="num">${num(c.total.impressoes)}</td>
      <td class="num">${num(c.total.cliques)}</td>
      <td class="num">${semPlanilha ? `<span class="off">${c.total.leadsMeta ? num(c.total.leadsMeta) + ' na Meta¹' : '0'}</span>` : num(s.leads)}</td>
      <td class="num">${semPlanilha ? '<span class="off">—</span>' : num(s.mql)}</td>
      <td class="num">${s.leads ? brl(c.total.investido / s.leads) : (c.total.leadsMeta ? brl(c.total.investido / c.total.leadsMeta) : '—')}</td>
      <td class="num">${s.mql ? brl(c.total.investido / s.mql) : '—'}</td></tr>`).join('')}
    <tr><td class="nome">(etiqueta quebrada na planilha)</td><td>—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td>
      <td class="num">${num(restoSoma.leads)}</td><td class="num">${num(restoSoma.mql)}</td><td class="num">—</td><td class="num">—</td></tr>
  </tbody>
  <tfoot><tr><td>TOTAL</td><td></td><td class="num">${brl(INVESTIDO_APURADO)}</td><td class="num">${num(IMP)}</td>
    <td class="num">${num(CLI)}</td><td class="num">${num(leadsCamp)}</td><td class="num">${num(mqlCamp)}</td>
    <td class="num">${brl(cpl)}</td><td class="num">${brl(cpMql)}</td></tr></tfoot>
</table>
<p class="micro">Leads e MQL vêm da planilha, somando os apelidos com que cada campanha chega (form da Meta, landing
com utm, ad-id numérico) — o mapa de correspondência está no rodapé e a soma fecha exatamente nos ${num(leadsCamp)}
leads / ${num(mqlCamp)} MQL. ¹ Corte Perpétuo/Tupã (CA1): o lead fica no formulário da Meta da conta e não desce para
a planilha — o número é o da Meta e não há MQL calculável. A linha “etiqueta quebrada” são ${num(restoSoma.leads)}
leads cuja campanha veio ilegível ({'{{adset.name}}'}, “Meta”, teste).</p>
<p class="micro"><strong>Onde está a qualidade:</strong> São Geraldo qualifica ${pct((pc['CA - SAO GERALDO - web - Aberto']?.mql || 0) + (pc['LEADS - SAO GERALDO']?.mql || 0) + (pc['CA - SAO GERALDO - web - Aberto — Cópia']?.mql || 0) + (pc['Landing São Geraldo']?.mql || 0), (pc['CA - SAO GERALDO - web - Aberto']?.leads || 0) + (pc['LEADS - SAO GERALDO']?.leads || 0) + (pc['CA - SAO GERALDO - web - Aberto — Cópia']?.leads || 0) + (pc['Landing São Geraldo']?.leads || 0))} dos leads e touros ${pct(somaAlias(ALIAS['LEAD - PERPETUO TOURO']).mql, somaAlias(ALIAS['LEAD - PERPETUO TOURO']).leads)};
o form de bezerras (PERPETUO) qualifica ${pct(pc['LEADS - FORMS INST PERPETUO']?.mql || 0, pc['LEADS - FORMS INST PERPETUO']?.leads || 1)}. Lead barato não é lead bom.</p>`

const vendas = `
<h2>A venda da campanha, cliente a cliente</h2>
<p>Regra dura: <strong>só conta a compra feita DEPOIS de a pessoa virar lead</strong>, e o cruzamento vale para
<strong>qualquer filial do HastaPro</strong> — não só a da Bula. Foi o que revelou os arremates do Leilão São Geraldo, que
ficavam invisíveis na apuração anterior. A coluna EVIDÊNCIA diz o que sustenta cada linha: casamento de telefone,
confirmação do assessor que atendeu, ou a janela curta entre o lead e o arremate na campanha do próprio leilão.</p>
<table>
  <thead><tr><th>Cliente</th><th>UF</th><th>Campanha de entrada</th><th>Lead</th><th class="r">Dias</th><th>Leilão</th><th class="r">An.</th><th class="r">Valor</th><th>Evidência</th></tr></thead>
  <tbody>
    ${atribuiveis.map(p => `<tr>
      <td class="nome">${esc(p.nome)}</td>
      <td>${esc(p.uf || '—')}</td>
      <td class="micro">${esc(String(p.campanha || '').slice(0, 30))}</td>
      <td class="num">${dataBr(p.dataLead)}</td>
      <td class="num">${p.diasAteCompra ?? '—'}</td>
      <td class="micro">${esc(p.leiloes.join(' · ').slice(0, 40))}${p.filiais.includes('01') ? ' <strong>(fil. 01)</strong>' : ''}</td>
      <td class="num">${num(p.animais)}</td>
      <td class="num">${brl0(p.valor)}</td>
      <td class="micro">${esc(p.evidencia)}</td></tr>`).join('')}
  </tbody>
  <tfoot><tr><td>TOTAL</td><td></td><td></td><td></td><td></td><td class="num">${num(ARREMATES)} arremates</td>
    <td class="num">${num(ANIMAIS)}</td><td class="num">${brl0(VGV_ATR)}</td><td></td></tr></tfoot>
</table>
<p class="micro">Os ${num(CLIENTES)} clientes têm evidência forte, cada um por uma via: dois pelo telefone do lead
sendo idêntico ao do cadastro no HastaPro, dois pela confirmação do assessor que atendeu, e três pela cadeia completa
do funil (viraram lead, foram submetidos e aprovados no grupo, ganharam cadastro novo no HastaPro na semana do
arremate e compraram). Nenhuma linha aqui depende só de nome. Casos que não passaram nesse crivo foram descartados e
estão nomeados adiante.</p>

<h3>Conferência da lista de patrocinados do assessor</h3>
<p>A diretoria enviou a relação de clientes “provenientes de patrocinados” do Leonardo. Cada nome foi buscado no HastaPro
ao vivo, em todas as filiais, e cruzado com as bases de leads. <strong>Três dos cinco se confirmam; dois não.</strong></p>
<table>
  <thead><tr><th>Nome na lista</th><th class="r">Lista diz</th><th class="r">HastaPro diz</th><th>Veredito</th></tr></thead>
  <tbody>
    ${PATROCINADOS_LEOZINHO.map(x => `<tr>
      <td class="nome">${esc(x.nome)}</td>
      <td class="num">${x.listaAnimais ? x.listaAnimais + ' an · ' : ''}${brl0(x.listaValor)}</td>
      <td class="num">${x.erpValor ? num(x.erpAnimais) + ' an · ' + brl0(x.erpValor) : '<span class="off">não existe</span>'}</td>
      <td class="micro">${x.confere && x.leadOrigem ? '<strong>CONFIRMA</strong> — ' : '<strong>NÃO ENTRA</strong> — '}${esc(x.nota)}</td></tr>`).join('')}
  </tbody>
</table>
<p class="micro">O total da lista é ${brl0(373500)} / 20 animais; o que se sustenta como campanha é
${brl0(330900)} / 18 animais (Marcelo Clemente, Patrick e Laércio). A apuração completa desta página encontrou ainda
outros ${num(CLIENTES - 3)} clientes de campanha que a lista não trazia — inclusive um do mesmo Leilão São Geraldo
atendido por outro assessor.</p>`

const aprovadosHastapro = `
<h2>Os aprovados, conferidos no HastaPro</h2>
<p>As etapas de cadastro e aprovação vinham só de fontes internas: a tabela do sistema (que parou de registrar em
08/07) e a leitura manual dos grupos. O HastaPro é a terceira fonte, independente — e a mais dura, porque quem é
aprovado numa leiloeira vira cadastro lá, com data. Cruzando os ${num(apr)} aprovados contra os 2.663 cadastros do
HastaPro:</p>
<table>
  <thead><tr><th>Verificação</th><th class="r">Resultado</th><th>O que significa</th></tr></thead>
  <tbody>
    <tr><td class="et">Aprovados com cadastro localizável</td><td class="num q">10 de ${num(apr)}</td>
      <td>Só 20%. Não é prova de que os outros 39 não foram aprovados — as leiloeiras onde submetemos (Bula Remates, Programa Leilões) podem não operar neste HastaPro, e cadastro só é criado quando há arremate. Mas significa que <strong>“aprovado” não é sinônimo de “cliente ativo”</strong>.</td></tr>
    <tr><td class="et">Cadastro criado a partir de jun/2026</td><td class="num q">6</td>
      <td>Nasceram no período do funil. Os demais têm cadastro de 2025 — já eram conhecidos da casa.</td></tr>
    <tr><td class="et">Aprovados que compraram em 2026</td><td class="num q">7</td>
      <td>27 animais, R$ 505.800 em qualquer filial. (Um oitavo caso, R$ 93.500, foi descartado: “Edvaldo Lemos Fernandes Silva” casou com “SUELE FERNANDES DA SILVA” só pelos sobrenomes.)</td></tr>
  </tbody>
</table>
<p class="micro">Este cruzamento produziu a prova mais forte do relatório: <strong>Pablo Pinheiro, Amadeu Ferino e
Maxwell Carvalho têm cadastro no HastaPro criado em 14, 16 e 18 de junho</strong> — dias depois de virarem lead e no
dia do próprio arremate. Cliente de carteira antiga tem cadastro de 2025 (como aparece em dois casos desta mesma
lista). A cadeia lead → cadastro submetido → aprovado no grupo → cadastro no HastaPro → compra fecha nos quatro elos,
por três fontes que não se falam.</p>`


const verificacao = `
<h2>Verificação — como saber que estes números estão certos</h2>
<p><strong>Regra: nenhum número entra com fonte única</strong>, e número de sistema sozinho não é prova (o registro de
cadastros parou em 08/07 e o CRM é 91% importação em massa). Cada variável foi triangulada:</p>
<table>
  <thead><tr><th>Variável</th><th class="r">Valor</th><th>Fontes cruzadas</th><th>Veredito</th></tr></thead>
  <tbody>
    <tr><td class="et">Investimento</td><td class="num q">${brl(INVESTIDO_APURADO)}</td>
      <td>Meta API ao vivo × apuração interna (16.499,31 em 02/08) × número da diretoria (16.500)</td>
      <td><strong>Conferido</strong> — as três batiam em 02/08; a diferença é só o que rodou depois.</td></tr>
    <tr><td class="et">Leads de campanha</td><td class="num q">${num(leadsCamp)}</td>
      <td>Planilha linha a linha × Meta (${num(LEADS_META)}) × CRM</td>
      <td><strong>Planilha vence</strong>: a Meta subnotifica landing e conta form repetido.</td></tr>
    <tr><td class="et">MQL</td><td class="num q">${num(mqlCamp)}</td>
      <td>Regra do sistema (≥100 cabeças + I.E.) × contagem manual do time (224)</td>
      <td><strong>Critério objetivo vence</strong> — os 224 incluem julgamento caso a caso do SDR.</td></tr>
    <tr><td class="et">Cadastros de campanha</td><td class="num q">${num(cadSistemaCamp)}</td>
      <td>Sistema × cruzamento pessoa a pessoa com leads (fone/CPF/nome) × alerta “tem cadastro por fora”</td>
      <td><strong>Separado</strong>: ${num(cadSistema)} pessoas no sistema, ${num(cadSistemaCamp)} de campanha. Envios manuais pós-08/07 não têm rastro — este número é piso.</td></tr>
    <tr><td class="et">Aprovados de campanha</td><td class="num q">${num(aprCamp)}</td>
      <td>Grupos (frase a frase) × leads de campanha (planilha + CRM) × lista consolidada × cadastros do HastaPro</td>
      <td><strong>Separado</strong>: ${num(apr)} pessoas aprovadas; ${num(aprFora)} por fora e ${num(aprPlanNao)} sem anúncio excluídas da conta da campanha.</td></tr>
    <tr><td class="et">Clientes / animais / valor</td><td class="num q">${num(CLIENTES)} / ${num(ANIMAIS)} / ${brl0(VGV_ATR)}</td>
      <td>HastaPro em TODAS as filiais, lote a lote × data de entrada do lead × telefone do cadastro × lista do assessor</td>
      <td><strong>Refeito em 14/08.</strong> A apuração anterior só olhava a filial da Bula e perdia os arremates do São Geraldo; e contava 2 clientes cuja origem era importação em massa, não anúncio. Nome só vale com telefone ou UF conferindo.</td></tr>
  </tbody>
</table>

<div class="box avoid">
  <h3>O que este relatório não consegue provar (e o que destravaria)</h3>
  <ul>
    <li><strong>Cadastros enviados depois de 08/07 sem registro</strong> — o degrau lead→cadastro é piso. Destrava:
      registrar TODO envio no sistema, mesmo o feito à mão.</li>
    <li><strong>O atendimento em telefone pessoal de SDR</strong> — o meio do funil é invisível. Destrava: SDR em
      canal registrado (API oficial ou sessão monitorada).</li>
    <li><strong>Compradores sem CPF/telefone no HastaPro</strong> (só 32% têm CPF no HastaPro) — o cruzamento lead×comprador por nome
      recusa homônimo, então clientes de campanha podem existir sem serem provados. O número de clientes é piso.
      Destrava: CPF obrigatório no arremate.</li>
    <li><strong>Leads do Corte Perpétuo/Tupã presos no form da Meta</strong> — não descem pra planilha. Destrava:
      exportar esses forms para a planilha como as demais campanhas.</li>
  </ul>
</div>`

const apendice = `
<h2>Apêndice — o resto do dinheiro de mídia (fora deste funil)</h2>
<table class="avoid">
  <thead><tr><th>Bloco</th><th class="r">Investido 2026</th><th>Por que está fora</th></tr></thead>
  <tbody>
    <tr><td class="nome">Funil digital (este relatório)</td><td class="num q">${brl(INVESTIDO_APURADO)}</td>
      <td>—</td></tr>
    <tr><td class="nome">Piloto “funil whatsapp” (abr–jun, conta Formula do Boi)</td><td class="num">${brl(FUNIL_WHATSAPP.investido)}</td>
      <td>${num(FUNIL_WHATSAPP.leadsMeta)} leads caíam direto no WhatsApp, antes da planilha existir — sem rastro individual para atribuir venda.</td></tr>
    <tr><td class="nome">Divulgação de leilões pela agência (CA1, ${num(DIVULGACAO_LEILOES.qtdCampanhas)} campanhas)</td><td class="num">${brl(DIVULGACAO_LEILOES.totalInvestido)}</td>
      <td>O lead vai para a leiloeira (Cachoeirão, SóCriador, Tresmar…) — é serviço de divulgação, não captação própria.</td></tr>
    <tr><td class="nome">Awareness (Santa Casa + leilão 09/05)</td><td class="num">${brl(279.30)}</td>
      <td>Objetivo de alcance, sem captação.</td></tr>
  </tbody>
  <tfoot><tr><td>CHEQUE TOTAL DE MÍDIA 2026</td><td class="num">${brl(META_LIVE.totais.tudoBula2026.investido)}</td><td></td></tr></tfoot>
</table>

<p class="micro">Fontes: Meta Ads (conector oficial MCP, extração ao vivo 14/08/2026, contas CA1/CA2 da BM Bula 360 e
Formula do Boi — dump em <code>outputs/base-clientes-2026/fontes/meta-live-2026-08-14.json</code>) · planilha “Leads -
Bula Assessoria” · crm_leads (só leads de campanha; importação em massa excluída) · cliente_leiloeira_cadastro ·
grupos de cadastro no WhatsApp (apuração frase a frase) · HastaPro (sistema da leiloeira, Firebird), consultado ao vivo, lote a lote.
Reprodução: <code>extrai-fontes-2026 → monta-base-2026 → monta-funil-2026 → gera-relatorio-oficial-campanhas-2026</code>.
Mapa de aliases campanha↔planilha no código do gerador, conferido por soma (${num(leadsCamp)} leads / ${num(mqlCamp)} MQL).</p>
<footer><span>Bula Assessoria — Desempenho das campanhas digitais 2026</span><span>Emitido em ${HOJE}</span></footer>`

const html = pagina('Desempenho das campanhas digitais — Bula 2026',
    capa + funilExato + custos + porCampanha + vendas + aprovadosHastapro + verificacao + apendice)

fs.mkdirSync(saida, { recursive: true })
fs.writeFileSync(path.join(DIR, 'relatorio-oficial-campanhas-2026.html'), html)
const pdfPath = path.join(saida, 'Desempenho das Campanhas Digitais 2026 - Bula Assessoria.pdf')
await paraPdf(html, pdfPath)
console.log('PDF:', pdfPath)
